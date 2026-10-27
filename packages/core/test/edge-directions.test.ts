import { describe, expect, it } from 'vitest';
import {
  RELATION_SIDES,
  findImplausibleEdgeDirections,
  findInvalidRelations,
} from '../src/entity/graph.js';
import { EDGE_RELATIONS, ENTITY_KINDS } from '../src/ir/types.js';
import type { Entity, EntityGraph, EntityKind, EntityRelation } from '../src/ir/types.js';

/**
 * Every relation but `same_as` states a direction, and the graph accepted any direction at all.
 *
 * The defect this file is written against is not hypothetical: `entity.test.ts` carried
 * `pod → service contains` in its fixture, the corpus carried nine edges whose direction no code
 * inspected, and flipping an edge in `synthetic-storefront-graph.json` left every guard green --
 * four-layer annotation, reference resolution, G1, G2, G5, the RCAEval export and the score all
 * still passed. A `calls` edge written backwards moves the root cause from the caller to the
 * callee, which is the answer an evaluator compares against.
 *
 * The rule is a table, and the table is hand-written for the reason `export-surface-enumerated`
 * gives about its own list: a table derived from the corpus is a table that agrees with the
 * corpus by construction, including where the corpus is wrong.
 */

const ENTITY = (kind: EntityKind, name: string): Entity => ({
  entityId: `${kind}:default/${name}`,
  kind,
  name,
  namespace: 'default',
  aliases: [],
});

const graphWith = (edges: Array<{ from: Entity; to: Entity; relation: EntityRelation }>): EntityGraph => {
  const byId = new Map<string, Entity>();
  for (const edge of edges) {
    byId.set(edge.from.entityId, edge.from);
    byId.set(edge.to.entityId, edge.to);
  }
  return {
    entities: [...byId.values()],
    edges: edges.map((edge) => ({ from: edge.from.entityId, to: edge.to.entityId, relation: edge.relation })),
  };
};

describe('RELATION_SIDES covers the published vocabulary', () => {
  it('answers for every relation in EDGE_RELATIONS and for nothing else', () => {
    expect(Object.keys(RELATION_SIDES).sort()).toEqual([...EDGE_RELATIONS].sort());
  });

  it('admits only published entity kinds on both sides', () => {
    for (const relation of EDGE_RELATIONS) {
      const sides = RELATION_SIDES[relation];
      if (sides === null) continue;
      for (const kind of [...sides.from, ...sides.to]) {
        expect(ENTITY_KINDS, `${relation} admits '${kind}'`).toContain(kind);
      }
      expect(sides.from.length, `${relation} admits nothing as a source`).toBeGreaterThan(0);
      expect(sides.to.length, `${relation} admits nothing as a target`).toBeGreaterThan(0);
    }
  });

  it('gives the symmetric relation no direction to check', () => {
    expect(RELATION_SIDES.same_as).toBeNull();
  });
});

describe('findImplausibleEdgeDirections', () => {
  // The nine directed edges the corpus carries, one of each kind pair it uses. Written out rather
  // than read from the corpus: a rule checked only against the data it governs cannot fail on the
  // round that fixes the data.
  it('accepts every directed shape the storefront corpus uses', () => {
    const cases: Array<[EntityKind, EntityKind, EntityRelation]> = [
      ['service', 'pod', 'contains'],
      ['pod', 'container', 'contains'],
      ['node', 'pod', 'hosts'],
      ['node', 'mq', 'hosts'],
      ['service', 'service', 'calls'],
      ['service', 'db', 'calls'],
      ['service', 'mq', 'calls'],
      ['service', 'external', 'calls'],
      ['external', 'service', 'calls'],
      ['node', 'pod', 'routes'],
    ];
    for (const [fromKind, toKind, relation] of cases) {
      const graph = graphWith([{ from: ENTITY(fromKind, 'a'), to: ENTITY(toKind, 'b'), relation }]);
      expect(findImplausibleEdgeDirections(graph), `${fromKind} ${relation} ${toKind}`).toEqual([]);
    }
  });

  it('refuses a containment written the other way round', () => {
    // The exact edge `entity.test.ts` used to carry. A pod does not contain the service whose
    // replica it is, and a reader that aggregates by containment would file the service's
    // telemetry under the pod.
    const graph = graphWith([{ from: ENTITY('pod', 'order-0'), to: ENTITY('service', 'order'), relation: 'contains' }]);
    expect(findImplausibleEdgeDirections(graph)).toEqual([
      {
        relation: 'contains',
        from: 'pod:default/order-0',
        to: 'service:default/order',
        reason: 'implausible-side',
        side: 'to',
        kind: 'service',
        admits: ['pod', 'container'],
      },
    ]);
  });

  it('refuses a host relation pointing at the host', () => {
    const graph = graphWith([{ from: ENTITY('pod', 'order-0'), to: ENTITY('node', 'worker-1'), relation: 'hosts' }]);
    expect(findImplausibleEdgeDirections(graph)).toMatchObject([
      { reason: 'implausible-side', side: 'from', kind: 'pod' },
    ]);
  });

  it('refuses a datastore said to call the service that queries it', () => {
    const graph = graphWith([{ from: ENTITY('db', 'billing-db'), to: ENTITY('service', 'billing'), relation: 'calls' }]);
    expect(findImplausibleEdgeDirections(graph)).toMatchObject([
      { reason: 'implausible-side', side: 'from', kind: 'db', relation: 'calls' },
    ]);
  });

  it('refuses a route reported by the thing being routed to', () => {
    const graph = graphWith([{ from: ENTITY('pod', 'catalog-0'), to: ENTITY('node', 'edge-2'), relation: 'routes' }]);
    expect(findImplausibleEdgeDirections(graph)).toMatchObject([
      { reason: 'implausible-side', side: 'from', kind: 'pod', relation: 'routes' },
    ]);
  });

  it('refuses an edge from an entity to itself, which no relation means', () => {
    // Both kinds are admitted on both sides, so the table alone would pass these: `pod contains
    // pod` has a legal source kind and a legal target kind, and means nothing.
    const graph = graphWith([
      { from: ENTITY('pod', 'order-0'), to: ENTITY('pod', 'order-0'), relation: 'contains' },
      { from: ENTITY('service', 'order'), to: ENTITY('service', 'order'), relation: 'calls' },
    ]);
    expect(findImplausibleEdgeDirections(graph).map((issue) => issue.reason)).toEqual(['self-edge', 'self-edge']);
  });

  it('leaves same_as alone in either direction, because it asserts identity', () => {
    const graph = graphWith([
      { from: ENTITY('service', 'order'), to: ENTITY('host', 'ip-10-0-0-4'), relation: 'same_as' },
      { from: ENTITY('host', 'ip-10-0-0-4'), to: ENTITY('service', 'order'), relation: 'same_as' },
    ]);
    expect(findImplausibleEdgeDirections(graph)).toEqual([]);
  });

  it('reports the relation and both ends, so a reader can grep for the edge', () => {
    const graph = graphWith([{ from: ENTITY('pod', 'cart-0'), to: ENTITY('service', 'cart'), relation: 'routes' }]);
    const [issue] = findImplausibleEdgeDirections(graph);
    expect(issue).toMatchObject({ from: 'pod:default/cart-0', to: 'service:default/cart', relation: 'routes' });
  });

  it('says nothing about an edge whose ends are unknown, which is the other check', () => {
    // `findDanglingEdgeRefs` owns the missing-node report. Reporting it here as well would make one
    // defect produce two messages, and the second would be about a kind the entity does not have.
    const graph: EntityGraph = {
      entities: [ENTITY('service', 'order')],
      edges: [{ from: 'service:default/order', to: 'pod:default/ghost', relation: 'contains' }],
    };
    expect(findImplausibleEdgeDirections(graph)).toEqual([]);
  });

  it('does not take the place of the relation vocabulary check', () => {
    // An unknown relation has no sides to compare, so this function must not claim it: the two
    // reports are about different repairs, and only one of them is about direction.
    const graph: EntityGraph = {
      entities: [ENTITY('service', 'order'), ENTITY('pod', 'order-0')],
      edges: [{ from: 'service:default/order', to: 'pod:default/order-0', relation: 'owns' as EntityRelation }],
    };
    expect(findImplausibleEdgeDirections(graph)).toEqual([]);
    expect(findInvalidRelations(graph)).toHaveLength(1);
  });
});
