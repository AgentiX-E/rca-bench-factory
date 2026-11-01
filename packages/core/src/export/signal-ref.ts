import type { Comparator, EvidenceCheckpoint } from '../ir/types.js';
import type { EntityIndex } from './rca100.js';

/**
 * The reference a checkpoint publishes, and the five ways it cannot be published.
 *
 * ## Two fields, one identity
 *
 * A reading is taken *on* something, so its identity is the pair `(entity, metric)`. The IR holds the
 * halves in two fields -- `entityRef` names the thing, `signalRef` names the reading -- and
 * `fault/reading-reference.ts` resolves them together, which is why a corpus annotation like
 * `{ entityRef: 'pod:.../search-1', signalRef: 'cluster_members_visible' }` can be checked at all.
 *
 * The exporters copied `signalRef` into `signal_ref` and stopped. So what reached `itbench`,
 * `openrca2` and `rca100` was one half of the pair, while all three contracts and all three
 * documents say the field holds both:
 *
 *     "signal_ref": "order|cpu_usage"      docs/targets/{itbench,openrca-2.0,rca100}.md
 *
 * Nothing in the repository could contradict them. The golden-master fixture wrote
 * `"signalRef": "order|cpu_usage"` -- the *output* form, in the input -- the exporter copied it out,
 * and the published example was a photograph of the fixture rather than a rendering of the IR. The
 * 30-case corpus, written against the rule the guard enforces, holds bare metric names, so it
 * exported `signal_ref: "cluster_members_visible"` and two checkpoints of one case
 * (`cp-members-halved` and `cp-members-other-side`) arrived at two targets as byte-identical
 * evidence entries. `stale_read_ratio` collided the same way, and `container_restarts_total` three
 * times across three cases.
 *
 * ## Why a qualified string and not a second field
 *
 * `openrca2` and `rca100` publish an evidence *entry*, and their scorers build a token from it:
 * `signal|comparator|value|unit`. The protocol's own example of such a token is
 * `order|cpu_usage|>=|90|%`, which already has five parts and assumes the first is the pair -- so the
 * contract the targets read was always the qualified form, and adding an `entity` key beside the
 * reference would have invented a field in two external formats while leaving `signal_ref` disagreeing
 * with the document that describes it. `itbench` does carry `entity` separately, and keeps it: an id
 * and a name are different questions and that target asks both.
 *
 * ## Why refusals rather than a best effort
 *
 * The qualifier is a *name*, and a name is not always an answer. Five states stop it, each with a
 * different repair, so each gets a sentence of its own rather than one "invalid reference":
 *
 * | refusal | what is wrong | what the reader does |
 * | --- | --- | --- |
 * | `unresolved` | the entity is not in the graph | fix `entityRef`, or add the entity |
 * | `unnamed` | the entity carries no name | name it, since the graph's `entityId` is not a name |
 * | `ambiguous` | two entities answer to that name | rename one, or the qualifier names both |
 * | `emptyRef` | `signalRef` is `''` | write the reading, or drop the field |
 * | `preQualified` | the ref already carries an owner | drop the owner; `entityRef` holds it |
 *
 * `preQualified` is the one that matters this round: it is the shape the fixture shipped, and it is
 * refused because `order|order|cpu_usage` is not a reference to anything -- the same two-answers
 * defect that `sli.none`, `fault.parameterNotes` and `noLogs` are each about, one field over.
 */

/** The character a qualified reference puts between the entity's name and the reading's. */
export const SIGNAL_REF_SEPARATOR = '|';

/** A reference that could not be published, and the one thing that stopped it. */
export type SignalRefFault =
  /** The entity is not in the graph, so there is no name to qualify with. */
  | { kind: 'unresolved'; entityRef: string }
  /** The entity is in the graph and carries no name. */
  | { kind: 'unnamed'; entityRef: string }
  /** More than one entity answers to the name the qualifier would use. */
  | { kind: 'ambiguous'; entityRef: string; name: string; candidates: readonly string[] }
  /** `signalRef` is present and empty, so the qualified form would name no reading. */
  | { kind: 'emptyRef' }
  /** `signalRef` already carries a qualifier of its own. */
  | { kind: 'preQualified'; ref: string };

/**
 * What a checkpoint's reference publishes: a qualified string, nothing at all, or a refusal.
 *
 * `null` is an answer here and not a failure -- a `derived` checkpoint is referenced by its
 * `expression` and has no single reading to name, so its exporters emit `null` (or omit the field).
 * Keeping it in the same union as the refusal is what stops the two from being written the same way.
 */
export type SignalRefRead = { fault: null; ref: string | null } | { fault: SignalRefFault; ref: null };

/** The two fields of a checkpoint this module reads. */
export interface SignalRefSource {
  readonly entityRef: string;
  readonly signalRef?: string;
}

/**
 * Read the reference a checkpoint publishes, or the one thing that stopped it.
 *
 * The checks are ordered by which field the reader has to fix first. A checkpoint can be wrong twice
 * -- an entity the graph does not hold *and* a ref that carries its own owner -- and reporting the
 * ref would send the reader to the field that is not the first problem.
 */
export function readSignalRef(input: { checkpoint: SignalRefSource; index: EntityIndex }): SignalRefRead {
  const { checkpoint, index } = input;

  const entity = index.byId.get(checkpoint.entityRef);
  if (entity === undefined) {
    return { fault: { kind: 'unresolved', entityRef: checkpoint.entityRef }, ref: null };
  }

  const name = entity.name;
  if (name === '') {
    return { fault: { kind: 'unnamed', entityRef: checkpoint.entityRef }, ref: null };
  }

  // `undefined` means the checkpoint names no single reading, which is what `derived` is.
  if (checkpoint.signalRef === undefined) return { fault: null, ref: null };

  const ref = checkpoint.signalRef;
  if (ref === '') return { fault: { kind: 'emptyRef' }, ref: null };
  if (ref.includes(SIGNAL_REF_SEPARATOR)) return { fault: { kind: 'preQualified', ref }, ref: null };

  // An index that carries no entry for a name it just resolved is an index that was not built from
  // this graph, and the entity it answered with is then the only claimant it can name -- so the
  // absence is read as "no other", which is what it is evidence for. Every index `buildEntityIndex`
  // produces has the entry, because it is filled from the same entities `byId` holds.
  const candidates = index.idsByName.get(name) ?? [];
  if (candidates.length > 1) {
    return { fault: { kind: 'ambiguous', entityRef: checkpoint.entityRef, name, candidates }, ref: null };
  }

  return { fault: null, ref: `${name}${SIGNAL_REF_SEPARATOR}${ref}` };
}

/**
 * One sentence per refusal, for a skipped case's reason or a log line.
 *
 * The sentences name the case and the checkpoint first, because a bundle export reports 30 of them
 * and a line that began with the fault would not say which checkpoint to open. Each one states what
 * the field *is* rather than what it is not: "a field that holds the reading alone" tells the reader
 * where the owner belongs, and "invalid signalRef" does not.
 */
export function describeSignalRefFault(
  fault: SignalRefFault,
  caseId: string,
  checkpointId: string,
): string {
  const at = `${caseId}: checkpoint '${checkpointId}'`;
  switch (fault.kind) {
    case 'unresolved':
      return (
        `${at} names entity '${fault.entityRef}', which the topology does not hold, ` +
        'so there is no name to qualify its signal with'
      );
    case 'unnamed':
      return (
        `${at} names entity '${fault.entityRef}', which carries no name, ` +
        'so there is nothing to qualify its signal with'
      );
    case 'ambiguous':
      return (
        `${at} names entity '${fault.entityRef}', whose name '${fault.name}' is also answered by ` +
        `'${fault.candidates.filter((id) => id !== fault.entityRef).join("', '")}', ` +
        'so the qualified form would name both'
      );
    case 'emptyRef':
      return (
        `${at} carries an empty signalRef, so the qualified form would read ` +
        `'<entity>${SIGNAL_REF_SEPARATOR}' and name no reading`
      );
    case 'preQualified':
      return (
        `${at} writes '${fault.ref}' in a field that holds the reading alone, ` +
        'so the owner it carries would be written twice'
      );
  }
}

/**
 * The refusal a builder raises when it is handed a checkpoint it cannot publish.
 *
 * The exporters screen each case with `readSignalRef` before building it, so this is the invariant a
 * *direct* caller meets -- `buildCausalPathJson(case, index)` is public API and does not know whether
 * its caller ran the screen. A builder cannot represent a refusal (the only shape available to it is
 * `signal_ref: null`, which already means "this checkpoint names no single reading"), so it must not
 * invent one, and a bare name would publish exactly the half of the pair this module completes.
 */
export class SignalRefRefusedError extends Error {
  readonly fault: SignalRefFault;
  readonly caseId: string;
  readonly checkpointId: string;

  constructor(caseId: string, checkpointId: string, fault: SignalRefFault) {
    super(describeSignalRefFault(fault, caseId, checkpointId));
    this.name = 'SignalRefRefusedError';
    this.fault = fault;
    this.caseId = caseId;
    this.checkpointId = checkpointId;
  }
}

/** One evidence entry, in the shape `openrca2` and `rca100` both publish. */
export interface EvidenceEntry {
  signal_ref: string | null;
  comparator: Comparator;
  value: number | string;
  unit: string | null;
  description: string;
}

/**
 * The evidence entry the two graded exporters publish for one checkpoint.
 *
 * `openrca2` and `rca100` wrote this mapping twice, byte for byte, and both drew `signal_ref`
 * straight from the IR -- which is how one decision came to have two copies and no owner. The
 * remaining differences between those two contracts are elsewhere (a field name, an order), so the
 * entry itself has one definition, and the field this module exists for cannot drift between them.
 *
 * `null` stays `null` rather than being omitted: both documents declare the field required and
 * nullable, so a `derived` checkpoint's absence of a single reading is published as the absence it is.
 */
export function evidenceFromCheckpoint(input: {
  caseId: string;
  checkpoint: EvidenceCheckpoint;
  index: EntityIndex;
}): EvidenceEntry {
  return {
    signal_ref: assertSignalRef(input),
    comparator: input.checkpoint.comparator,
    value: input.checkpoint.value,
    unit: input.checkpoint.unit ?? null,
    description: input.checkpoint.description,
  };
}

/**
 * The qualified reference, or a refusal -- for a builder that has no way to represent one.
 *
 * `itbench` omits the field when a checkpoint names no single reading, so a builder handed a
 * checkpoint it cannot qualify would have one shape available to it and it would be the wrong one: an
 * omitted field already means "this checkpoint is referenced by its expression". The three builders
 * therefore share this one refusal instead of each deciding what to do about it, and the exporters
 * screen their cases first, so a bundle export never reaches the throw.
 */
export function assertSignalRef(input: {
  caseId: string;
  checkpoint: EvidenceCheckpoint;
  index: EntityIndex;
}): string | null {
  const read = readSignalRef({ checkpoint: input.checkpoint, index: input.index });
  if (read.fault !== null) {
    throw new SignalRefRefusedError(input.caseId, input.checkpoint.checkpointId, read.fault);
  }
  return read.ref;
}

/**
 * Whether a case can be published at all, answered before a file of it is written.
 *
 * Every exporter already answers "which cases are in these bytes, which are not, and why not" -- a
 * bundle of 1000 cases must not lose 999 to report one mistyped label. This is the same policy for a
 * new axis: a case whose evidence cannot be qualified is skipped with a sentence, and the rest of the
 * bundle is exported.
 *
 * The return value is the refusal itself rather than a boolean, so the loop has one object to print
 * instead of a fault it would have to re-describe -- and so the message the exporter skips with is
 * the message `SignalRefRefusedError` throws, which is what keeps the two paths from disagreeing
 * about what went wrong.
 *
 * The scan stops at the first refusal rather than collecting all of them. A case is skipped whole, so
 * the second refusal would be a sentence about a file that is not being written.
 */
export function screenSignalRefs(input: {
  caseId: string;
  checkpoints: readonly EvidenceCheckpoint[];
  index: EntityIndex;
}): SignalRefRefusedError | null {
  for (const checkpoint of input.checkpoints) {
    const read = readSignalRef({ checkpoint, index: input.index });
    if (read.fault !== null) {
      return new SignalRefRefusedError(input.caseId, checkpoint.checkpointId, read.fault);
    }
  }
  return null;
}
