import type { Entity, EntityEdge, EntityGraph, EntityKind, EntityRelation } from '../ir/types.js';

/**
 * Entity graph helpers.
 *
 * The single most important invariant in the whole product: every entity
 * reference anywhere in the IR MUST resolve against the entity graph.
 * RCA100 reports a 98.06% (101/103) root-cause-to-topology alignment; we hold
 * ourselves to 100% because a dangling reference is a defect, not a rounding error.
 */

export const VALID_RELATIONS: readonly EntityRelation[] = ['contains', 'hosts', 'calls', 'same_as'];

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
  const only = [...hits][0];
  return only ?? null;
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
    if (edge.from === '' || edge.to === '') {
      issues.push({ ref: edge.from === '' ? '(empty from)' : '(empty to)', reason: 'empty', where: 'edge' });
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
