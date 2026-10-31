import type { EntityGraph } from '../ir/types.js';
import { looksLikeSentence } from '../util/prose.js';

/**
 * The two modalities a case can show, and the field each one writes when it has nothing to show.
 *
 * `logs` and `traces` are lists, so a case that has no line and no span said the same thing as a
 * case nobody had looked at: nothing. That is the shape finding 300 found in `fault.parameters`
 * (sixty-nine keys with no reader) and finding 326 found in the notes -- an absence and an omission
 * are the same byte. This module is the field that separates them: a case with no log line writes
 * `noLogs: "<a sentence>"`, and the sentence says why there is none.
 *
 * The division of labour is the one `sli.none` already states (finding 331): the guard checks
 * **presence, exclusivity and shape**; whether the sentence is true is the reader's. A rule that
 * tried to decide "does this incident text describe a line a process would have written" would be a
 * keyword list, and the corpus's own reasons would be the counter-examples to it.
 */
export const EVIDENCE_MODALITIES = ['log', 'trace'] as const;

/** A modality a case either shows or explains the absence of. */
export type EvidenceModality = (typeof EVIDENCE_MODALITIES)[number];

/**
 * The field that carries the absence, per modality.
 *
 * One table rather than two branches: the refusal messages name the field, and a second spelling of
 * `noLogs` in a message is the drift this repository keeps finding.
 */
export const ABSENCE_FIELDS = { log: 'noLogs', trace: 'noTraces' } as const;

/** What a case answered about one modality. */
export type ModalityAnswer =
  | { declared: number; reason: null }
  | { declared: 0; reason: string };

/** Why a modality's answer is not readable. */
export type ModalityFault =
  | { kind: 'unreadable'; modality: EvidenceModality }
  | { kind: 'both'; modality: EvidenceModality; declared: number }
  | { kind: 'empty'; modality: EvidenceModality }
  | { kind: 'missing'; modality: EvidenceModality }
  | { kind: 'notText'; modality: EvidenceModality; reason: unknown }
  | { kind: 'vague'; modality: EvidenceModality; reason: string };

/** The verdict for one modality: a fault, or the answer it gave. */
export interface ModalityRead {
  fault: ModalityFault | null;
  answer: ModalityAnswer | null;
}

/**
 * Read one modality's answer from the file as written.
 *
 * The input is `unknown` on purpose, the same way `readSliDeclaration` takes it: the caller holds
 * raw JSON, and a type that promised a list would only move the question to whoever parsed it.
 *
 * `empty` is a fault and not an absence, because an empty list is an assertion ("this case has no
 * log lines") written in the one form that also means "nobody filled this in". The field that says
 * it in words is the whole point of the module, so the list form is refused rather than accepted as
 * a synonym -- a corpus where both spellings are legal is a corpus where a reader cannot tell which
 * one the author meant.
 */
export function readModalityAnswer(input: {
  modality: EvidenceModality;
  declared: unknown;
  reason: unknown;
}): ModalityRead {
  const { modality, declared, reason } = input;
  if (declared !== undefined && !Array.isArray(declared)) {
    return { fault: { kind: 'unreadable', modality }, answer: null };
  }
  const declaredCount = Array.isArray(declared) ? declared.length : 0;
  if (declaredCount > 0) {
    if (reason !== undefined) {
      return { fault: { kind: 'both', modality, declared: declaredCount }, answer: null };
    }
    return { fault: null, answer: { declared: declaredCount, reason: null } };
  }
  if (declared !== undefined) {
    return { fault: { kind: 'empty', modality }, answer: null };
  }
  if (reason === undefined) {
    return { fault: { kind: 'missing', modality }, answer: null };
  }
  if (typeof reason !== 'string') {
    return { fault: { kind: 'notText', modality, reason }, answer: null };
  }
  if (!looksLikeSentence(reason)) {
    return { fault: { kind: 'vague', modality, reason }, answer: null };
  }
  return { fault: null, answer: { declared: 0, reason } };
}

/**
 * The sentence a reader gets for a fault, composed where the fault is defined.
 *
 * Each one names the field it is about, because a case can fail this rule twice in one file and the
 * two failures have different repairs: adding a log line is not the same as writing down why there
 * is none.
 */
export function describeModalityFault(fault: ModalityFault, caseId: string): string {
  const field = ABSENCE_FIELDS[fault.modality];
  const what = fault.modality === 'log' ? 'log line' : 'span';
  switch (fault.kind) {
    case 'unreadable':
      return `'${caseId}' declares '${fault.modality === 'log' ? 'logs' : 'traces'}' as something that is not a list, so its ${what}s are neither shown nor explained`;
    case 'both':
      return `'${caseId}' declares ${String(fault.declared)} ${what} entr${fault.declared === 1 ? 'y' : 'ies'} and also writes '${field}': two answers to one question, and the sentence makes the entries unreadable`;
    case 'empty':
      return `'${caseId}' declares an empty list for its ${what}s, which states nothing; the absence is written '${field}' with a reason`;
    case 'missing':
      return `'${caseId}' shows no ${what} and does not write '${field}': a modality that is absent reads the same as one nobody looked for`;
    case 'notText':
      return `'${caseId}' writes '${field}' as ${JSON.stringify(fault.reason)}, which is not a sentence`;
    case 'vague':
      return `'${caseId}' writes '${field}' as '${fault.reason}', which is not a sentence a reader can act on`;
  }
}

/** One step of a causal chain, as the walk below needs it. */
export interface ChainStep {
  fromEntityId: string;
  toEntityId: string;
}

/** A pair of services a chain crosses, in the order the chain states it. */
export interface ServiceCall {
  from: string;
  to: string;
}

/**
 * Which service each entity belongs to, walking `contains` and `hosts` upwards.
 *
 * The map holds the service's **id**, not its name: the call table below is keyed by id, and mapping
 * a name back to the id it came from would be a round trip that can only fail. `routes` is
 * deliberately not an ownership relation -- an ingress routes to a service, and treating that as
 * containment would make the ingress *be* the service it fronts.
 */
function ownerIndex(graph: EntityGraph): Map<string, string | null> {
  const kind = new Map(graph.entities.map((entity) => [entity.entityId, entity.kind]));
  const parent = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.relation !== 'contains' && edge.relation !== 'hosts') continue;
    const holders = parent.get(edge.to);
    if (holders === undefined) parent.set(edge.to, [edge.from]);
    else holders.push(edge.from);
  }
  const owners = new Map<string, string | null>();
  for (const entityId of kind.keys()) {
    const seen = new Set<string>([entityId]);
    const frontier = [entityId];
    let found: string | null = null;
    while (frontier.length > 0 && found === null) {
      const current = frontier.pop() as string;
      if (kind.get(current) === 'service') {
        found = current;
        continue;
      }
      for (const holder of parent.get(current) ?? []) {
        if (seen.has(holder)) continue;
        seen.add(holder);
        frontier.push(holder);
      }
    }
    owners.set(entityId, found);
  }
  return owners;
}

/**
 * The service calls a chain crosses, which is what a span pair would be made of.
 *
 * This is a reading, not a gate. A case with no span because its failure never leaves one service is
 * not the same case as one whose text quotes no duration for an exchange it does cross, and the
 * corpus had no way to say which it was: 25 of 30 cases had no span and the number could not tell
 * "nothing to show" from "nothing looked at". The count this returns is the half a machine can
 * answer -- the chain crosses a `calls` edge -- and the `noTraces` sentence is the half it cannot.
 *
 * Direction is not required. A chain that walks the call backwards (from the callee to its caller)
 * is still an exchange between two services, and demanding the same direction would refuse the
 * propagation the case is describing in order to keep a convention nothing else relies on.
 */
export function callsAcrossChain(input: { steps: readonly ChainStep[]; graph: EntityGraph }): ServiceCall[] {
  const owners = ownerIndex(input.graph);
  const names = new Map(input.graph.entities.map((entity) => [entity.entityId, entity.name]));
  const separator = '\u0000';
  const calls = new Set<string>();
  for (const edge of input.graph.edges) {
    if (edge.relation !== 'calls') continue;
    calls.add(`${edge.from}${separator}${edge.to}`);
    calls.add(`${edge.to}${separator}${edge.from}`);
  }
  const out: ServiceCall[] = [];
  const seen = new Set<string>();
  for (const step of input.steps) {
    const from = owners.get(step.fromEntityId);
    const to = owners.get(step.toEntityId);
    if (from == null || to == null || from === to) continue;
    if (!calls.has(`${from}${separator}${to}`)) continue;
    const key = `${from}${separator}${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from: names.get(from) as string, to: names.get(to) as string });
  }
  return out;
}
