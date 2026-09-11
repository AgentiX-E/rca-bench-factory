import { describe, expect, it } from 'vitest';
import {
  entityId,
  findAmbiguousAliases,
  findDanglingEdgeRefs,
  findInvalidRelations,
  indexGraph,
  normalizeAliases,
  resolveEntityRef,
} from '../src/entity/graph.js';
import type { EntityGraph } from '../src/ir/types.js';

const graph: EntityGraph = {
  entities: [
    {
      entityId: 'service:default/order',
      kind: 'service',
      name: 'order',
      namespace: 'default',
      aliases: ['svc-order-prod-01', 'ORDER-SVC'],
    },
    {
      entityId: 'service:default/cart',
      kind: 'service',
      name: 'cart',
      namespace: 'default',
      aliases: ['cartservice'],
    },
    { entityId: 'pod:default/order-7d9f', kind: 'pod', name: 'order-7d9f', namespace: 'default', aliases: [] },
  ],
  edges: [
    { from: 'pod:default/order-7d9f', to: 'service:default/order', relation: 'contains' },
    { from: 'service:default/order', to: 'service:default/cart', relation: 'calls' },
  ],
};

describe('entityId', () => {
  it('includes the namespace when present', () => {
    expect(entityId('service', 'default', 'order')).toBe('service:default/order');
  });

  it('omits the namespace when absent', () => {
    expect(entityId('node', undefined, 'node-1')).toBe('node:node-1');
  });
});

describe('indexGraph + resolveEntityRef', () => {
  it('resolves a canonical id', () => {
    expect(resolveEntityRef('service:default/order', indexGraph(graph))).toBe('service:default/order');
  });

  it('resolves an alias case-insensitively', () => {
    expect(resolveEntityRef('ORDER-SVC', indexGraph(graph))).toBe('service:default/order');
    expect(resolveEntityRef('svc-order-prod-01', indexGraph(graph))).toBe('service:default/order');
  });

  it('returns null for an unknown reference', () => {
    expect(resolveEntityRef('service:default/nope', indexGraph(graph))).toBeNull();
  });

  it('refuses to guess when an alias is ambiguous', () => {
    const ambiguous: EntityGraph = {
      entities: [
        { entityId: 'a', kind: 'service', name: 'shared', aliases: [] },
        { entityId: 'b', kind: 'service', name: 'dup', aliases: ['shared'] },
      ],
      edges: [],
    };
    expect(resolveEntityRef('shared', indexGraph(ambiguous))).toBeNull();
  });
});

describe('findDanglingEdgeRefs', () => {
  it('passes a clean graph', () => {
    expect(findDanglingEdgeRefs(graph)).toEqual([]);
  });

  it('flags a missing endpoint', () => {
    const broken: EntityGraph = { ...graph, edges: [{ from: 'service:default/order', to: 'ghost', relation: 'calls' }] };
    const issues = findDanglingEdgeRefs(broken);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ref: 'ghost', reason: 'dangling', where: 'edge.to' });
  });

  it('flags an empty endpoint', () => {
    const broken: EntityGraph = { ...graph, edges: [{ from: '', to: 'service:default/order', relation: 'calls' }] };
    expect(findDanglingEdgeRefs(broken)[0]).toMatchObject({ reason: 'empty' });
  });
});

describe('findInvalidRelations', () => {
  it('passes the closed relation set', () => {
    expect(findInvalidRelations(graph)).toEqual([]);
  });

  it('rejects an unknown relation', () => {
    const bad = { ...graph, edges: [{ from: 'service:default/order', to: 'service:default/cart', relation: 'depends_on' }] };
    expect(findInvalidRelations(bad as unknown as EntityGraph)).toHaveLength(1);
  });
});

describe('findAmbiguousAliases', () => {
  it('returns nothing for a clean graph', () => {
    expect(findAmbiguousAliases(graph)).toEqual([]);
  });

  it('reports aliases claimed by more than one entity', () => {
    const clash: EntityGraph = {
      entities: [
        { entityId: 'a', kind: 'service', name: 'order', aliases: [] },
        { entityId: 'b', kind: 'service', name: 'orders', aliases: ['order'] },
      ],
      edges: [],
    };
    expect(findAmbiguousAliases(clash)).toEqual([{ alias: 'order', owners: ['a', 'b'] }]);
  });
});

describe('normalizeAliases', () => {
  it('merges entities linked by same_as and collapses their aliases', () => {
    const withSameAs: EntityGraph = {
      entities: [
        { entityId: 'service:default/order', kind: 'service', name: 'order', namespace: 'default', aliases: [] },
        { entityId: 'pod:default/order-7d9f', kind: 'pod', name: 'order-7d9f', namespace: 'default', aliases: ['ORDER-SVC'] },
      ],
      edges: [{ from: 'service:default/order', to: 'pod:default/order-7d9f', relation: 'same_as' }],
    };
    const merged = normalizeAliases(withSameAs);
    expect(merged.entities).toHaveLength(1);
    expect(merged.entities[0]?.entityId).toBe('service:default/order');
    expect(merged.entities[0]?.aliases).toEqual(['ORDER-SVC', 'order-7d9f']);
  });

  it('rewrites edges to point at the surviving entity', () => {
    const withSameAs: EntityGraph = {
      entities: [
        { entityId: 'a', kind: 'service', name: 'a', aliases: [] },
        { entityId: 'b', kind: 'service', name: 'b', aliases: [] },
        { entityId: 'c', kind: 'service', name: 'c', aliases: [] },
      ],
      edges: [
        { from: 'a', to: 'b', relation: 'same_as' },
        { from: 'b', to: 'c', relation: 'calls' },
      ],
    };
    const merged = normalizeAliases(withSameAs);
    expect(merged.edges).toEqual([{ from: 'a', to: 'c', relation: 'calls' }]);
  });

  it('rewrites an edge whose target is the absorbed entity', () => {
    const withSameAs: EntityGraph = {
      entities: [
        { entityId: 'a', kind: 'service', name: 'a', aliases: [] },
        { entityId: 'b', kind: 'service', name: 'b', aliases: [] },
        { entityId: 'c', kind: 'service', name: 'c', aliases: [] },
      ],
      edges: [
        { from: 'a', to: 'b', relation: 'same_as' },
        { from: 'c', to: 'b', relation: 'calls' },
      ],
    };
    const merged = normalizeAliases(withSameAs);
    expect(merged.edges).toEqual([{ from: 'c', to: 'a', relation: 'calls' }]);
  });

  it('drops self-referencing edges created by the merge', () => {
    const g: EntityGraph = {
      entities: [
        { entityId: 'a', kind: 'service', name: 'a', aliases: [] },
        { entityId: 'b', kind: 'service', name: 'b', aliases: [] },
      ],
      edges: [
        { from: 'a', to: 'b', relation: 'same_as' },
        { from: 'a', to: 'b', relation: 'calls' },
      ],
    };
    expect(normalizeAliases(g).edges).toEqual([]);
  });

  it('keeps an endpoint that names an undeclared entity instead of dropping the edge', () => {
    const g: EntityGraph = {
      entities: [
        { entityId: 'a', kind: 'service', name: 'a', aliases: [] },
        { entityId: 'b', kind: 'service', name: 'b', aliases: [] },
      ],
      edges: [
        { from: 'a', to: 'b', relation: 'same_as' },
        { from: 'ghost', to: 'b', relation: 'calls' },
        { from: 'a', to: 'ghost2', relation: 'hosts' },
      ],
    };
    const merged = normalizeAliases(g);
    expect(merged.edges).toEqual([
      { from: 'a', to: 'ghost2', relation: 'hosts' },
      { from: 'ghost', to: 'a', relation: 'calls' },
    ]);
  });

  it('leaves a graph without same_as edges untouched apart from ordering', () => {
    const merged = normalizeAliases(graph);
    expect(merged.entities.map((e) => e.entityId).sort()).toEqual(
      graph.entities.map((e) => e.entityId).sort(),
    );
  });
});
