import { describe, expect, it } from 'vitest';
import { difficultyFloor, findDifficultyShortfalls } from '../src/fault/difficulty.js';
import type { Entity, EntityGraph, FaultCase } from '../src/ir/types.js';

/**
 * The floor, which is the only property of a difficulty label this repository can check.
 *
 * `FaultCase.difficulty` had no definition, and the corpus proves what that costs: five annotated
 * cases, and the labels do not track structure. `history-kafka-consumer-lag` and
 * `history-queue-watermark-ledger-writer` have the same one step and the same two entity kinds and
 * are labelled L2 and L3; `history-checkout-cpu-saturation` has two steps and three kinds and is
 * labelled L2. Three judgements, none comparable.
 *
 * `difficultyFloor` asserts monotonicity and nothing else: a case cannot claim less structure than
 * its own chain carries. That is weaker than a definition and stronger than nothing, and it is the
 * part that can be argued with in a review rather than felt in a meeting.
 */

const entity = (kind: Entity['kind'], name: string): Entity => ({
  entityId: `${kind}:default/${name}`,
  kind,
  name,
  namespace: 'default',
  aliases: [],
});

const GRAPH: EntityGraph = {
  entities: [
    entity('service', 'api'),
    entity('pod', 'api-0'),
    entity('container', 'api-app'),
    entity('node', 'worker-1'),
    entity('db', 'orders'),
    entity('mq', 'events'),
  ],
  edges: [],
};

function faultCase(steps: Array<[string, string]>, rootCause = 'service:default/api'): FaultCase {
  return {
    caseId: 'case-001',
    system: 'order-prod',
    environment: { system: 'order-prod' },
    injectTime: '2026-09-06T00:00:00.000Z',
    window: { start: '2026-09-06T00:00:00.000Z', end: '2026-09-06T01:00:00.000Z' },
    fault: { type: 'x', category: 'resource' },
    groundTruth: {
      rootCauseEntityId: rootCause,
      rootCauseComponent: 'api',
      rootCauseReason: 'because',
      causalChain: steps.map(([from, to], index) => ({
        step: index + 1,
        fromEntityId: from,
        toEntityId: to,
        mechanism: 'x',
        evidenceRefs: [],
      })),
      evidenceCheckpoints: [],
    },
  };
}

describe('difficultyFloor', () => {
  it('puts a one-step chain that stays inside one kind at L1', () => {
    expect(difficultyFloor({ case: faultCase([['service:default/api', 'service:default/other']]), graph: GRAPH })).toBe(
      'L1',
    );
  });

  it('puts a one-step chain across two kinds at L2', () => {
    expect(difficultyFloor({ case: faultCase([['service:default/api', 'db:default/orders']]), graph: GRAPH })).toBe('L2');
  });

  it('cannot put a one-step chain at L3, because two kinds is all one hop can span', () => {
    // A one-step chain runs from the root cause to its consequence, so its ends contribute at most
    // two kinds. A third would require the root cause to sit off its own chain, which the four-layer
    // assessment refuses -- so a `breadth >= 3` row at one step is a branch no case can take, and the
    // first draft of the floor had exactly that.
    const floor = difficultyFloor({
      case: faultCase([['container:default/api-app', 'service:default/api']], 'container:default/api-app'),
      graph: GRAPH,
    });
    expect(floor).toBe('L2');
  });

  it('puts a two-step chain at L3 even when every entity is one kind', () => {
    expect(
      difficultyFloor({
        case: faultCase([
          ['service:default/api', 'service:default/mid'],
          ['service:default/mid', 'service:default/other'],
        ]),
        graph: GRAPH,
      }),
    ).toBe('L3');
  });

  it('puts a three-step chain at L4', () => {
    expect(
      difficultyFloor({
        case: faultCase([
          ['container:default/api-app', 'pod:default/api-0'],
          ['pod:default/api-0', 'service:default/api'],
          ['service:default/api', 'db:default/orders'],
        ]),
        graph: GRAPH,
      }),
    ).toBe('L4');
  });

  it('counts the root cause even when the chain does not name it', () => {
    // The chain may start downstream of the root cause -- a control belongs in the evidence layer,
    // not in the chain -- so the kinds are collected from the root cause as well as from the ends.
    expect(
      difficultyFloor({
        case: faultCase([['service:default/api', 'service:default/other']], 'db:default/orders'),
        graph: GRAPH,
      }),
    ).toBe('L2');
  });

  it('reads an unresolvable reference as no kind rather than throwing', () => {
    // `findDifficultyShortfalls` runs on annotation other guards have already refused; the floor is
    // not the place to report a dangling reference a second time. The consequence is that a bad
    // reference lowers the floor rather than raising it, which is the right direction: G2 refuses
    // the case, and a floor computed from a graph that does not contain the entity is not evidence
    // of difficulty.
    expect(difficultyFloor({ case: faultCase([['service:default/api', 'pod:default/ghost']]), graph: GRAPH })).toBe(
      'L1',
    );
  });

  it('puts a case with no chain at L1, because the structure makes no claim at all', () => {
    // Both shapes the schema admits: an empty chain and an absent one. The absent case is the one a
    // hand-built FaultCase produces, and the `?? []` that handles it is a branch, so it is exercised
    // rather than assumed.
    expect(difficultyFloor({ case: faultCase([]), graph: GRAPH })).toBe('L1');

    const absent = faultCase([]);
    delete (absent.groundTruth as { causalChain?: unknown }).causalChain;
    expect(difficultyFloor({ case: absent, graph: GRAPH })).toBe('L1');
  });
});

describe('findDifficultyShortfalls', () => {
  // Two steps, three kinds: the shallowest structure whose floor is L3.
  const threeKinds = faultCase(
    [
      ['container:default/api-app', 'pod:default/api-0'],
      ['pod:default/api-0', 'service:default/api'],
    ],
    'container:default/api-app',
  );

  it('reports a declared level below the floor', () => {
    const declared = { ...threeKinds, caseId: 'a', difficulty: 'L2' as const };
    expect(findDifficultyShortfalls({ cases: [declared], graph: GRAPH })).toEqual([
      { caseId: 'a', declared: 'L2', floor: 'L3' },
    ]);
  });

  it('accepts a declared level at the floor and above it', () => {
    const at = { ...threeKinds, caseId: 'a', difficulty: 'L3' as const };
    const above = { ...threeKinds, caseId: 'b', difficulty: 'L4' as const };
    expect(findDifficultyShortfalls({ cases: [at, above], graph: GRAPH })).toEqual([]);
  });

  it('says nothing about a case with no declared level', () => {
    // Coverage is a different report. An absent level exports as `medium` and the corpus guard
    // prints how many are absent; refusing them here would make every new case a failure.
    expect(findDifficultyShortfalls({ cases: [threeKinds], graph: GRAPH })).toEqual([]);
  });

  it('names every shortfall rather than the first', () => {
    const one = { ...threeKinds, caseId: 'a', difficulty: 'L1' as const };
    const two = { ...threeKinds, caseId: 'b', difficulty: 'L2' as const };
    expect(findDifficultyShortfalls({ cases: [one, two], graph: GRAPH }).map((entry) => entry.caseId)).toEqual(['a', 'b']);
  });
});
