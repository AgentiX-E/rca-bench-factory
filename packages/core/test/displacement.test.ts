import { describe, expect, it } from 'vitest';
import { classifyDisplacement } from '../src/fault/displacement.js';
import type { EntityGraph, FaultCase } from '../src/ir/types.js';

/**
 * Whether a case can penalise a method that returns the loudest component.
 *
 * `checkDiscrimination` used to ask only "is the answer at rank 1", which counts three different
 * situations as one: a competitor that is strictly louder (any magnitude-based method is wrong, and
 * deterministically so), a competitor that ties and wins on the name (the method is wrong by a sort
 * order), and a candidate that is a *part of the answer* -- a pod under its service, a container in
 * its pod -- where a method returning it has found the right component family. This module separates
 * them, and the separation is what the corpus-level rule now requires.
 */

const GRAPH: EntityGraph = {
  entities: [
    { entityId: 'service:default/checkout', kind: 'service', name: 'checkout', aliases: [] },
    { entityId: 'pod:default/checkout-0', kind: 'pod', name: 'checkout-0', aliases: [] },
    { entityId: 'container:default/checkout-app', kind: 'container', name: 'checkout-app', aliases: [] },
    { entityId: 'pod:default/checkout-1', kind: 'pod', name: 'checkout-1', aliases: [] },
    { entityId: 'service:default/pricing', kind: 'service', name: 'pricing', aliases: [] },
    { entityId: 'db:default/orders', kind: 'db', name: 'orders', aliases: [] },
    { entityId: 'node:default/node-a', kind: 'node', name: 'node-a', aliases: [] },
    { entityId: 'pod:default/worker-0', kind: 'pod', name: 'worker-0', aliases: [] },
  ],
  edges: [
    { from: 'service:default/checkout', to: 'pod:default/checkout-0', relation: 'contains' },
    { from: 'pod:default/checkout-0', to: 'container:default/checkout-app', relation: 'contains' },
    { from: 'service:default/checkout', to: 'pod:default/checkout-1', relation: 'contains' },
    { from: 'node:default/node-a', to: 'pod:default/worker-0', relation: 'hosts' },
    { from: 'service:default/checkout', to: 'service:default/pricing', relation: 'calls' },
  ],
};

function faultCase(rootCauseEntityId: string, rootCauseComponent: string): FaultCase {
  return {
    caseId: 'case-001',
    system: 'default',
    environment: { system: 'default' },
    injectTime: '2026-10-01T00:00:00.000Z',
    window: { start: '2026-09-30T23:00:00.000Z', end: '2026-10-01T01:00:00.000Z' },
    fault: { type: 'cpu-saturation', category: 'resource', injectionMethod: 'historical' },
    groundTruth: { rootCauseEntityId, rootCauseComponent },
    query: 'which component?',
  } as FaultCase;
}

const rank = (...pairs: Array<[string, number]>) => pairs.map(([service, statistic]) => ({ service, statistic }));

describe('the four situations a top-ranked candidate can be in', () => {
  it('reports none when the answer is the loudest', () => {
    expect(
      classifyDisplacement({
        graph: GRAPH,
        case: faultCase('service:default/checkout', 'checkout'),
        ranking: rank(['checkout', 90], ['orders', 4]),
      }),
    ).toEqual({ caseId: 'case-001', kind: 'none' });
  });

  it('reports a strict displacement when a different component is louder', () => {
    // The property the corpus needs: any method that ranks by magnitude returns `pricing`, and it
    // does so deterministically. The replica-lag case is built to be this.
    expect(
      classifyDisplacement({
        graph: GRAPH,
        case: faultCase('db:default/orders', 'orders'),
        ranking: rank(['checkout', 90], ['orders', 4]),
      }),
    ).toEqual({ caseId: 'case-001', kind: 'strict' });
  });

  it('reports a tie when the loudest candidate merely wins the name', () => {
    // Equal statistics: the method's own number cannot separate the two, and the order is the
    // tiebreak. A case that displaces the answer this way is worth less than one that displaces it
    // by magnitude, and it is fragile -- renaming one service flips it.
    expect(
      classifyDisplacement({
        graph: GRAPH,
        case: faultCase('db:default/orders', 'orders'),
        ranking: rank(['checkout', 60], ['orders', 60]),
      }),
    ).toEqual({ caseId: 'case-001', kind: 'tie' });
  });

  it('reports the same component when the loudest candidate is a part of the answer', () => {
    // The checkout case: the pod outranks its own service. A method that returns `checkout-0` has
    // named the replica that was throttled; it has not missed the component.
    expect(
      classifyDisplacement({
        graph: GRAPH,
        case: faultCase('container:default/checkout-app', 'checkout'),
        ranking: rank(['checkout-0', 400], ['checkout', 10]),
      }),
    ).toEqual({ caseId: 'case-001', kind: 'same-component' });
  });

  it('walks containment and hosting, in either direction', () => {
    // The answer's *component* is named at the service, while its entity is the container inside the
    // pod — which is the checkout case's own shape. A candidate two levels down is still inside it.
    const twoLevels = classifyDisplacement({
      graph: GRAPH,
      case: faultCase('service:default/checkout', 'checkout'),
      ranking: rank(['checkout-app', 400], ['checkout', 10]),
    });
    expect(twoLevels.kind, 'the container is inside the service').toBe('same-component');

    const hosted = classifyDisplacement({
      graph: GRAPH,
      case: faultCase('pod:default/worker-0', 'worker-0'),
      ranking: rank(['node-a', 400], ['worker-0', 10]),
    });
    expect(hosted.kind, 'a node hosts the pod it runs').toBe('same-component');
  });
});

describe('graphs the classification has to survive', () => {
  it('refuses to resolve a name two entities share', () => {
    // Two entities with one name is a graph defect G2 refuses, but this function is called on the
    // corpus and must not pick one of them: resolving to either would decide "same component" or
    // "different component" on a coin toss.
    const graph: EntityGraph = {
      entities: [
        { entityId: 'service:default/api', kind: 'service', name: 'api', aliases: [] },
        { entityId: 'pod:default/api', kind: 'pod', name: 'api', aliases: [] },
        { entityId: 'db:default/orders', kind: 'db', name: 'orders', aliases: [] },
      ],
      edges: [{ from: 'service:default/api', to: 'pod:default/api', relation: 'contains' }],
    };
    expect(
      classifyDisplacement({
        graph,
        case: faultCase('db:default/orders', 'orders'),
        ranking: rank(['api', 90], ['orders', 4]),
      }).kind,
      'an ambiguous name is not a part of the answer',
    ).toBe('strict');
  });

  it('terminates on a containment cycle rather than walking it forever', () => {
    // A cycle is a defect, not a topology. The walk has to end anyway, or one bad graph hangs the
    // guard instead of being reported by G2.
    const graph: EntityGraph = {
      entities: [
        { entityId: 'service:default/a', kind: 'service', name: 'a', aliases: [] },
        { entityId: 'pod:default/b', kind: 'pod', name: 'b', aliases: [] },
        { entityId: 'db:default/orders', kind: 'db', name: 'orders', aliases: [] },
      ],
      edges: [
        { from: 'service:default/a', to: 'pod:default/b', relation: 'contains' },
        { from: 'pod:default/b', to: 'service:default/a', relation: 'contains' },
      ],
    };
    expect(
      classifyDisplacement({
        graph,
        case: faultCase('db:default/orders', 'orders'),
        ranking: rank(['b', 90], ['orders', 4]),
      }).kind,
    ).toBe('strict');
  });

  it('recognises the answer\'s own entity when the candidate is named differently', () => {
    // `rootCauseComponent` is the service's name while `rootCauseEntityId` is the container inside
    // it, so a candidate named after the container is the answer entity under another name.
    expect(
      classifyDisplacement({
        graph: GRAPH,
        case: faultCase('container:default/checkout-app', 'checkout'),
        ranking: rank(['checkout-app', 90], ['checkout', 4]),
      }).kind,
    ).toBe('same-component');
  });
});

describe('what the classification refuses to assume', () => {
  it('does not call two replicas of one service the same component', () => {
    // Both are children of the service and neither contains the other. Returning the wrong replica
    // is a miss, and calling it a container-level hit would let the corpus count it as nothing.
    expect(
      classifyDisplacement({
        graph: GRAPH,
        case: faultCase('pod:default/checkout-0', 'checkout-0'),
        ranking: rank(['checkout-1', 90], ['checkout-0', 4]),
      }).kind,
    ).toBe('strict');
  });

  it('reports none when the answer is absent from the ranking', () => {
    // A case whose answer never moved cannot be evidence of discrimination: it is evidence of an
    // unsolvable case, which `checkSolvability` already refuses.
    expect(
      classifyDisplacement({
        graph: GRAPH,
        case: faultCase('db:default/orders', 'orders'),
        ranking: rank(['checkout', 90]),
      }),
    ).toEqual({ caseId: 'case-001', kind: 'none' });
  });

  it('reports none for an empty ranking', () => {
    expect(
      classifyDisplacement({ graph: GRAPH, case: faultCase('db:default/orders', 'orders'), ranking: [] }),
    ).toEqual({ caseId: 'case-001', kind: 'none' });
  });

  it('treats a candidate the graph does not hold as a different component', () => {
    // A name nothing resolves is not a part of the answer, and assuming it might be would hide a
    // displacement behind a missing entity.
    expect(
      classifyDisplacement({
        graph: GRAPH,
        case: faultCase('db:default/orders', 'orders'),
        ranking: rank(['somebody-else', 90], ['orders', 4]),
      }).kind,
    ).toBe('strict');
  });
});
