import { sameComponent } from '../entity/graph.js';
import type { EntityGraph } from '../ir/types.js';
import type { EntityIndex } from './rca100.js';

/**
 * Where the referent of a published reference lives, and whether the artefact carries it.
 *
 * ## The defect this exists for
 *
 * `signal_ref` is the pair `<entity>|<reading>`, and since v3.29 it is a pair for all three kinds that
 * name one. What was never asked is the second half of any reference: **is the thing it names in the
 * file beside it?** The answer key and the case directory are written by the same exporter, into the
 * same directory, and a reader who wants to check a checkpoint against the claim it makes has to join
 * them. Nothing established that the join succeeds, and it does not, uniformly:
 *
 *   - **75 series references** name a metric. `metrics.json` carries a row per `(entity_id, metric)`,
 *     so 63 of them join on the id the checkpoint states -- and 12 do not, because the reading is
 *     filed under the entity that *contains* the one the checkpoint is about (a container's working
 *     set filed under its service, which is the corpus's deliberate choice: the ranking a solver sees
 *     is per service). Those 12 join only through the same containment rule `resolveReading` applies.
 *   - **10 log references** name a log line by its id. The id was discarded twice on the way out: the
 *     signals declaration's `id` had no field on `LogDeclaration`, and `expandLog` therefore never put
 *     it on the payload -- so `logs.json` had no id column and the reference pointed at nothing.
 *   - **24 configuration references** name a parameter of the fault injection. The value travelled
 *     (the checkpoint states it), the key did not: no file in the export held `fault.parameters`.
 *
 * So 34 of 109 published references named a key that no table carried, and 12 more named an entity
 * whose row is filed one level up. A consumer with the pair in hand could not tell a fact it can check
 * from a fact it cannot, and neither could this repository.
 *
 * ## Why the check lives here rather than in an exporter
 *
 * The join is a statement about *two* artefacts -- the answer key and the case directory -- and no
 * single exporter sees both as a reader does. It is also the check that keeps the carriers honest: a
 * later round that drops `id` from `logs.json` again, or stops carrying `parameters`, fails this
 * rather than shipping a reference to a row nobody writes.
 *
 * ## `match` is reported, not folded into a boolean
 *
 * A join through containment is a different statement from a join on the stated id, and the share of
 * the corpus that needs it is the number this module exists to print. A boolean would make 12
 * resolutions look like 63.
 */

/** Which table a reference's second half names. */
export type ReferenceCarrier = 'metrics' | 'logs' | 'parameters';

/**
 * The three tables, read for the one field each join needs.
 *
 * Deliberately the rows as exported rather than typed records: the point of the check is that it
 * reads the artefact, and a typed interface here would be a second copy of the exporter's shape --
 * the copy that disagrees would be the one this module was reading.
 */
export interface ExportedTables {
  readonly metrics: ReadonlyArray<Record<string, unknown>>;
  readonly logs: ReadonlyArray<Record<string, unknown>>;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/** How a reference met the table it named. */
export type ReferenceMatch =
  /** A row for the entity the checkpoint states. */
  | 'entity'
  /** A row for an entity that contains it, or is contained by it. */
  | 'container'
  /** A key in a table keyed by name rather than by entity: the injection's parameters. */
  | 'key';

/** The join's verdict for one checkpoint. */
export type ReferenceJoin =
  /** Nothing is published -- a `derived` checkpoint names no single reading. */
  | { readonly kind: 'none' }
  | {
      readonly kind: 'joined';
      readonly carrier: ReferenceCarrier;
      readonly key: string;
      readonly match: ReferenceMatch;
    }
  | {
      readonly kind: 'dangling';
      readonly carrier: ReferenceCarrier;
      readonly key: string;
      readonly reason: 'noRow' | 'otherEntity' | 'noKey';
    };

/**
 * Which table a checkpoint's second half names, or `null` when it names nothing.
 *
 * `derived` is the null: its reference is arithmetic, and the exporters publish `null` for it.
 */
export function referenceCarrier(checkpoint: {
  readonly signalKind?: string;
  readonly signalRef?: string;
}): ReferenceCarrier | null {
  if (checkpoint.signalRef === undefined) return null;
  switch (checkpoint.signalKind ?? 'series') {
    case 'log':
      return 'logs';
    case 'configuration':
      return 'parameters';
    default:
      return 'metrics';
  }
}

/**
 * Whether the artefact carries what one published reference names.
 *
 * The metric half is taken from the checkpoint rather than from the published string: the string is
 * `<name>|<key>` and splitting it would make this module depend on the separator never appearing in a
 * name, which is a different rule with its own refusal.
 */
export function joinPublishedReference(input: {
  checkpoint: { entityRef: string; signalRef?: string; signalKind?: string };
  graph: EntityGraph;
  tables: ExportedTables;
}): ReferenceJoin {
  const { checkpoint, graph, tables } = input;
  const carrier = referenceCarrier(checkpoint);
  if (carrier === null) return { kind: 'none' };
  const key = checkpoint.signalRef as string;

  if (carrier === 'parameters') {
    return Object.hasOwn(tables.parameters, key)
      ? { kind: 'joined', carrier, key, match: 'key' }
      : { kind: 'dangling', carrier, key, reason: 'noKey' };
  }

  const rows = carrier === 'metrics' ? tables.metrics : tables.logs;
  const named = carrier === 'metrics' ? 'metric' : 'id';
  const carrying = rows.filter((row) => row[named] === key);
  if (carrying.length === 0) return { kind: 'dangling', carrier, key, reason: 'noRow' };

  if (carrying.some((row) => row.entity_id === checkpoint.entityRef)) {
    return { kind: 'joined', carrier, key, match: 'entity' };
  }
  // The containment rule the corpus already applies to a reading: a container's figure may be filed
  // under its service, and that is a resolution rather than a miss. It is reported as `container` so
  // the count of references that need it is visible, because it is a weaker statement than a match.
  if (carrying.some((row) => sameComponent(graph, checkpoint.entityRef, String(row.entity_id)))) {
    return { kind: 'joined', carrier, key, match: 'container' };
  }
  return { kind: 'dangling', carrier, key, reason: 'otherEntity' };
}

/** One sentence for a reference the artefact does not carry. */
export function describeDanglingReference(
  join: Extract<ReferenceJoin, { kind: 'dangling' }>,
  checkpointId: string,
): string {
  const where =
    join.carrier === 'metrics'
      ? 'metrics.json'
      : join.carrier === 'logs'
        ? 'logs.json'
        : "the answer key's parameters";
  switch (join.reason) {
    case 'noRow':
      return (
        `checkpoint '${checkpointId}' publishes '${join.key}', and ${where} carries no row for it ` +
        '-- so the reference names something the artefact does not ship'
      );
    case 'otherEntity':
      return (
        `checkpoint '${checkpointId}' publishes '${join.key}', and ${where} carries it for an entity ` +
        'that is neither the checkpoint\'s nor one that contains it'
      );
    case 'noKey':
      return (
        `checkpoint '${checkpointId}' publishes '${join.key}', and ${where} declares no such key ` +
        '-- so the reference names something the artefact does not ship'
      );
  }
}

/** The tallies the guard prints: one line about all four ways a reference can land. */
export interface ReferenceJoinTally {
  readonly published: number;
  readonly joined: number;
  readonly byEntity: number;
  readonly byContainer: number;
  readonly byKey: number;
  /** The references that named nothing, each with the checkpoint that published it. */
  readonly dangling: ReadonlyArray<{
    readonly checkpointId: string;
    readonly join: Extract<ReferenceJoin, { kind: 'dangling' }>;
  }>;
}

/**
 * Join every reference one case publishes, and tally how they landed.
 *
 * `published` counts the checkpoints whose reference is not `derived`, which is the denominator the
 * guard reports -- not the number of checkpoints, so a case that names no series cannot dilute the
 * share.
 */
export function assessCaseReferences(input: {
  caseId: string;
  checkpoints: ReadonlyArray<{ checkpointId: string; entityRef: string; signalRef?: string; signalKind?: string }>;
  graph: EntityGraph;
  tables: ExportedTables;
  index?: EntityIndex;
}): ReferenceJoinTally & { readonly caseId: string } {
  let published = 0;
  let joined = 0;
  let byEntity = 0;
  let byContainer = 0;
  let byKey = 0;
  const dangling: Array<{ checkpointId: string; join: Extract<ReferenceJoin, { kind: 'dangling' }> }> = [];
  for (const checkpoint of input.checkpoints) {
    const join = joinPublishedReference({ checkpoint, graph: input.graph, tables: input.tables });
    if (join.kind === 'none') continue;
    published += 1;
    if (join.kind === 'dangling') {
      dangling.push({ checkpointId: checkpoint.checkpointId, join });
      continue;
    }
    joined += 1;
    if (join.match === 'entity') byEntity += 1;
    else if (join.match === 'container') byContainer += 1;
    else byKey += 1;
  }
  return { caseId: input.caseId, published, joined, byEntity, byContainer, byKey, dangling };
}
