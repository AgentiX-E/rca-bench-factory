import type { Entity, EntityEdge, EntityGraph, EntityKind, EntityRelation } from '../ir/types.js';
import { EDGE_RELATIONS } from '../ir/types.js';

/**
 * Entity graph helpers.
 *
 * The single most important invariant in the whole product: every entity
 * reference anywhere in the IR MUST resolve against the entity graph.
 * RCA100 reports a 98.06% (101/103) root-cause-to-topology alignment; we hold
 * ourselves to 100% because a dangling reference is a defect, not a rounding error.
 */

/**
 * The relations the graph accepts.
 *
 * This was a second copy of the vocabulary beside the schema's inline enum, so adding a member meant
 * remembering two places -- and `routes` was added to one of them first, which is how the copy was
 * found (finding 260). It reads the published tuple now.
 */
export const VALID_RELATIONS: readonly EntityRelation[] = EDGE_RELATIONS;

/**
 * Which entity kinds each relation admits on each side. `null` means the relation has no direction
 * to check.
 *
 * The vocabulary in `ir/types.ts` describes four relations as a movement from one thing to another
 * -- a service has a pod, a node runs a pod, one service invokes another, traffic for a target
 * passes through a router -- and the graph accepted all four in either direction. Nothing failed:
 * `findDanglingEdgeRefs` asks whether the ends exist, `findInvalidRelations` asks whether the word
 * is published, and the four-layer assessment asks whether the ground truth's references resolve.
 * A `calls` edge written backwards resolves perfectly and moves the root cause from the caller to
 * the callee, which is the answer an evaluator compares against.
 *
 * Two consequences follow, and they are the reason this is a table rather than a length check.
 *
 * 1. **The rows are hand-written.** Deriving them from the corpus would make the rule agree with
 *    the corpus by construction, including where the corpus is wrong -- the same defect
 *    `export-surface-enumerated.test.ts` names about generating its own list. The price is that a
 *    new directed shape has to be added here, and the refusal says so.
 * 2. **A kind pair cannot catch a reversal between two entities of the same kind.** `service A
 *    calls service B` and `service B calls service A` are both admitted, and no static rule can
 *    tell them apart: the direction of a call is a fact about a deployment, not about kinds. This
 *    table catches the reversals that are structurally impossible and says nothing about the rest,
 *    which is what its name claims. Trace-level agreement would close the gap and does not exist
 *    yet -- one case in the corpus carries traces at all.
 */
export const RELATION_SIDES: Record<
  EntityRelation,
  { from: readonly EntityKind[]; to: readonly EntityKind[] } | null
> = {
  // Part-of: the whole names the part. A pod is not the container of the service whose replica it
  // is, which is the direction `entity.test.ts` had backwards for as long as it existed.
  contains: { from: ['cluster', 'node', 'host', 'service', 'pod'], to: ['pod', 'container'] },
  // Where it lives: the host names what runs on it. `node -> mq` is here because a broker is a
  // workload on a node in this model, and the corpus's kafka case cites the broker's own disk.
  hosts: { from: ['cluster', 'node', 'host'], to: ['service', 'pod', 'container', 'db', 'mq', 'external'] },
  // Who invokes whom: a caller, then what it uses. A datastore does not call the service that
  // queries it; a pod is a replica rather than an endpoint, so it is not a call target.
  calls: { from: ['service', 'external', 'container', 'host'], to: ['service', 'external', 'db', 'mq'] },
  // Traffic for the target passes through the source: a router, a switch, a load balancer.
  routes: {
    from: ['cluster', 'node', 'host', 'external', 'service'],
    to: ['service', 'pod', 'container', 'external'],
  },
  // Two names for one entity. Identity is symmetric in `normalizeAliases`, so there is no side to
  // compare and inventing one would refuse half the edges that are correct.
  same_as: null,
};

/**
 * An edge whose direction the relation does not admit.
 *
 * A discriminated union rather than a bag of optionals, because the two cases carry different
 * facts: a wrong kind pair has a side, a kind and the set it was measured against, and a self-edge
 * has none of the three -- both ends are the same entity. The first draft made all three optional
 * and every reader then had to write `issue.admits ?? []`, a fallback for a state the producer
 * cannot create. The union moves that impossibility into the type, where the compiler enforces it
 * instead of a coverage report noticing it.
 */
export type DirectionIssue =
  | { reason: 'self-edge'; relation: EntityRelation; from: string; to: string }
  | {
      reason: 'implausible-side';
      relation: EntityRelation;
      from: string;
      to: string;
      /** Which end carries the inadmissible kind. */
      side: 'from' | 'to';
      /** The kind found on that side. */
      kind: EntityKind;
      /** The kinds the relation admits there, so the refusal states what would have been accepted. */
      admits: readonly EntityKind[];
    };

/**
 * Edges whose direction the relation's own description does not allow.
 *
 * Silent about anything another check owns: an unknown relation has no sides to compare (that is
 * `findInvalidRelations`), and an edge with an unknown end has no kind to compare (that is
 * `findDanglingEdgeRefs`). One defect, one message.
 */
export function findImplausibleEdgeDirections(graph: EntityGraph): DirectionIssue[] {
  const index = indexGraph(graph);
  const issues: DirectionIssue[] = [];
  for (const edge of graph.edges) {
    const sides = RELATION_SIDES[edge.relation];
    if (sides === undefined || sides === null) continue;
    const from = index.byId.get(edge.from);
    const to = index.byId.get(edge.to);
    if (from === undefined || to === undefined) continue;
    const base = { relation: edge.relation, from: edge.from, to: edge.to };
    if (edge.from === edge.to) {
      // Both ends can be admissible -- `pod contains pod` and `service calls service` pass the
      // table -- and neither statement means anything.
      issues.push({ ...base, reason: 'self-edge' });
      continue;
    }
    if (!sides.from.includes(from.kind)) {
      issues.push({ ...base, reason: 'implausible-side', side: 'from', kind: from.kind, admits: sides.from });
      continue;
    }
    if (!sides.to.includes(to.kind)) {
      issues.push({ ...base, reason: 'implausible-side', side: 'to', kind: to.kind, admits: sides.to });
    }
  }
  return issues;
}

export function entityId(kind: EntityKind, namespace: string | undefined, name: string): string {
  return namespace ? `${kind}:${namespace}/${name}` : `${kind}:${name}`;
}

export interface GraphIndex {
  byId: Map<string, Entity>;
  /** Alias (lower-cased) -> entity ids that claim it. */
  byAlias: Map<string, Set<string>>;
  edges: EntityEdge[];
}

export function indexGraph(graph: EntityGraph): GraphIndex {
  const byId = new Map<string, Entity>();
  const byAlias = new Map<string, Set<string>>();

  for (const e of graph.entities) {
    byId.set(e.entityId, e);
    for (const alias of [e.name, ...e.aliases]) {
      const key = alias.toLowerCase();
      const bucket = byAlias.get(key) ?? new Set<string>();
      bucket.add(e.entityId);
      byAlias.set(key, bucket);
    }
  }
  return { byId, byAlias, edges: graph.edges };
}

/** Resolve an entity id or alias to a concrete entity id. */
export function resolveEntityRef(ref: string, index: GraphIndex): string | null {
  if (index.byId.has(ref)) return ref;
  const hits = index.byAlias.get(ref.toLowerCase());
  if (!hits || hits.size === 0) return null;
  if (hits.size > 1) return null; // ambiguous alias - report as unresolved, never guess
  // `hits.size === 1` is guaranteed by the two guards above, so the id exists.
  const [only] = hits;
  return only!;
}

export interface ReferenceIssue {
  ref: string;
  reason: 'dangling' | 'ambiguous' | 'empty';
  where: string;
}

/** Every entity id referenced by an edge must exist. */
export function findDanglingEdgeRefs(graph: EntityGraph): ReferenceIssue[] {
  const index = indexGraph(graph);
  const issues: ReferenceIssue[] = [];
  for (const edge of graph.edges) {
    // Blank means the reference is *missing*; only a non-blank ref that the
    // graph lacks is `dangling`. Testing `=== ''` alone classified `'   '` as
    // dangling, which tells the caller they named an entity the graph does not
    // have -- when in fact they named nothing at all.
    const fromBlank = edge.from.trim() === '';
    const toBlank = edge.to.trim() === '';
    if (fromBlank || toBlank) {
      // `where` names the offending side -- `edge.from`, not `edge` -- so the
      // two callers that consume this can point at a field. Naming both sides
      // is not possible in one issue, so a blank `from` takes precedence: an
      // edge with no source has no direction to report.
      issues.push({
        ref: fromBlank ? edge.from : edge.to,
        reason: 'empty',
        where: fromBlank ? 'edge.from' : 'edge.to',
      });
      continue;
    }
    if (!index.byId.has(edge.from)) {
      issues.push({ ref: edge.from, reason: 'dangling', where: 'edge.from' });
    }
    if (!index.byId.has(edge.to)) {
      issues.push({ ref: edge.to, reason: 'dangling', where: 'edge.to' });
    }
  }
  return issues;
}

/** Relations outside the closed set are rejected rather than coerced. */
export function findInvalidRelations(graph: EntityGraph): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  for (const edge of graph.edges) {
    if (!VALID_RELATIONS.includes(edge.relation)) {
      issues.push({ ref: edge.relation, reason: 'dangling', where: 'edge.relation' });
    }
  }
  return issues;
}

/** Aliases claimed by more than one entity; these make resolution ambiguous. */
export function findAmbiguousAliases(graph: EntityGraph): Array<{ alias: string; owners: string[] }> {
  const index = indexGraph(graph);
  const out: Array<{ alias: string; owners: string[] }> = [];
  for (const [alias, owners] of index.byAlias) {
    if (owners.size > 1) out.push({ alias, owners: [...owners].sort() });
  }
  return out.sort((a, b) => a.alias.localeCompare(b.alias));
}

/**
 * Merge alias sets transitively so that APM / Kubernetes / CMDB names collapse
 * onto a single entity. `same_as` edges drive the merge.
 */
export function normalizeAliases(graph: EntityGraph): EntityGraph {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root) as string;
    return root;
  };
  for (const e of graph.entities) parent.set(e.entityId, e.entityId);
  for (const edge of graph.edges) {
    if (edge.relation !== 'same_as') continue;
    const a = find(edge.from);
    const b = find(edge.to);
    if (a !== b) parent.set(a, b);
  }

  const groups = new Map<string, string[]>();
  for (const e of graph.entities) {
    const root = find(e.entityId);
    const bucket = groups.get(root) ?? [];
    bucket.push(e.entityId);
    groups.set(root, bucket);
  }

  const byId = new Map(graph.entities.map((e) => [e.entityId, e]));
  const merged: Entity[] = [];
  for (const members of groups.values()) {
    const primary = byId.get(members[0] as string) as Entity;
    if (members.length === 1) {
      merged.push(primary);
      continue;
    }
    const aliases = new Set<string>();
    for (const id of members) {
      const e = byId.get(id) as Entity;
      aliases.add(e.name);
      for (const a of e.aliases) aliases.add(a);
    }
    aliases.delete(primary.name);
    merged.push({ ...primary, aliases: [...aliases].sort() });
  }
  merged.sort((a, b) => a.entityId.localeCompare(b.entityId));

  const remap = new Map<string, string>();
  for (const members of groups.values()) {
    const target = members[0] as string;
    for (const id of members) remap.set(id, target);
  }

  const edges = graph.edges
    .filter((e) => e.relation !== 'same_as')
    .map<EntityEdge>((e) => ({
      ...e,
      from: remap.get(e.from) ?? e.from,
      to: remap.get(e.to) ?? e.to,
    }))
    .filter((e) => e.from !== e.to)
    .sort((a, b) => `${a.from}${a.to}${a.relation}`.localeCompare(`${b.from}${b.to}${b.relation}`));

  return { entities: merged, edges };
}
