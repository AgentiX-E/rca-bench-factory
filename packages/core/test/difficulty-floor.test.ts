import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { difficultyFloor, findDifficultyShortfalls } from '../src/fault/difficulty.js';
import { checkDifficultyDistribution } from '../src/gates/gates.js';
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

/**
 * The shipped corpus, which is where the floor stops being a property of a fixture.
 *
 * The corpus spent seven rounds with no L4 case at all, and the reason was not that the labels were
 * wrong: every chain in it was one or two steps, so `minL4Share` of 0.1 could not be met by any
 * correction to any label. Printing the shortfall and passing was the right call while that was
 * true -- a rule that fails every run on a property only a new case can change is a rule people
 * learn to skip -- and it stops being the right call the moment the corpus can meet it. From here
 * the target is held by the suite rather than by the printed line, because a number no assertion
 * reads is a number that goes back to zero quietly.
 *
 * The cases are read from the directory the guard reads, so this file and the guard cannot disagree
 * about which corpus they are talking about.
 */
describe('the shipped corpus · the labels and the ladder', () => {
  const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'golden-master', 'fault-cases');
  const index = JSON.parse(readFileSync(join(CORPUS, 'index.json'), 'utf8')) as {
    cases: Array<{ case?: string }>;
  };
  const shipped = index.cases
    .map((entry) => entry.case)
    .filter((name): name is string => typeof name === 'string')
    .map((name) => JSON.parse(readFileSync(join(CORPUS, name), 'utf8')) as FaultCase);
  const shippedGraph = JSON.parse(
    readFileSync(join(CORPUS, 'synthetic-storefront-graph.json'), 'utf8'),
  ) as EntityGraph;

  it('has no case claiming less structure than its own chain carries', () => {
    expect(findDifficultyShortfalls({ cases: shipped, graph: shippedGraph })).toEqual([]);
  });

  it('has a hardest level, and names the cases whose chains earn it', () => {
    // Named rather than counted: at this size a share of 0.1 is satisfied by two cases, so a count
    // alone would let a chain be shortened while the number stayed whole.
    const hardest = shipped.filter((one) => difficultyFloor({ case: one, graph: shippedGraph }) === 'L4');
    expect(hardest.map((one) => one.difficulty)).toEqual(['L4', 'L4', 'L4']);
    expect(hardest.map((one) => one.caseId).sort()).toEqual([
      'history-code-slow-regex-api-gateway',
      'history-middleware-cache-shard-product-index',
      'history-runtime-pod-shutdown-webhook-dispatcher',
    ]);
    // Three steps each, read off the chain rather than off the label: the two numbers can disagree,
    // and when they do the label is the thing that is wrong.
    for (const one of hardest) expect(one.groundTruth.causalChain).toHaveLength(3);
  });

  it('ends one of its three-step chains inside the system being measured', () => {
    // The corpus's two three-step chains both left the system at their last hop -- container, pod,
    // service, then out to the callers or to a merchant -- so a case whose propagation stays inside
    // was missing, and a corpus of chains that all exit has only one shape of hard question. The
    // last hop is read from the chain, and `external:` is what "outside" means here: an entity in
    // the graph whose kind is `external` is a party this system calls rather than one of its parts.
    const threeStep = shipped.filter((one) => (one.groundTruth.causalChain ?? []).length >= 3);
    const inside = threeStep.filter((one) => {
      const last = (one.groundTruth.causalChain ?? []).at(-1);
      return last !== undefined && !last.toEntityId.startsWith('external:');
    });
    expect(inside.map((one) => one.caseId)).toEqual(['history-middleware-cache-shard-product-index']);
    // Printed by this assertion rather than by the guard: the corpus holds both shapes, and the
    // count is what says the new one did not replace the old ones.
    expect(threeStep).toHaveLength(3);
  });

  it('meets the published L4 share, which is the claim the level was never able to make', () => {
    const bundle = { irVersion: '1.0.0', graph: shippedGraph, cases: shipped, signals: {} };
    expect(checkDifficultyDistribution(bundle).violations).toEqual([]);
    // Three of twenty, stated so that a corpus that grows a third ungraded case fails here rather
    // than sliding under the floor on the next annotation.
    const graded = shipped.filter((one) => one.difficulty !== undefined);
    const hardest = graded.filter((one) => one.difficulty === 'L4');
    expect(hardest.length / graded.length).toBeGreaterThanOrEqual(0.1);
  });

  it('meets that share at the denominator it is committed to, which is where the margin is', () => {
    // The corpus is committed to annotating every sample in the extraction key, so the size the
    // share has to survive is the key's size and not today's count. Three of thirty is exactly the
    // floor: the remaining ten annotations can all be L1 to L3 and the target still holds, and the
    // eleventh could not. That is the whole margin, and it is the number the plan turns on rather
    // than a sentence in a document.
    const key = JSON.parse(
      readFileSync(resolve(CORPUS, '..', 'fault-extraction', 'samples.json'), 'utf8'),
    ) as { samples: unknown[] };
    const hardest = shipped.filter((one) => one.difficulty === 'L4');
    const atFullSize = hardest.length / key.samples.length;
    expect(atFullSize).toBeGreaterThanOrEqual(0.1);
    // Exactly at it, not above: a fourth L4 case would buy margin, and the corpus has none.
    expect(atFullSize).toBeCloseTo(0.1, 10);
  });

  it('keeps the property when one L4 case is taken away and loses it when two are', () => {
    // The margin, measured rather than described. With three of twenty the rule survives the loss of
    // one case -- two of nineteen is 0.105 -- which makes this a weaker ratchet than it was at two
    // of nineteen and an honest one: what protects the corpus now is the third case and the fact
    // that removing two of them is not a small edit.
    const one = {
      irVersion: '1.0.0',
      graph: shippedGraph,
      cases: shipped.filter((one) => one.caseId !== 'history-code-slow-regex-api-gateway'),
      signals: {},
    };
    expect(checkDifficultyDistribution(one).violations).toEqual([]);
    const two = {
      irVersion: '1.0.0',
      graph: shippedGraph,
      cases: shipped.filter(
        (one) =>
          one.caseId !== 'history-code-slow-regex-api-gateway' &&
          one.caseId !== 'history-middleware-cache-shard-product-index',
      ),
      signals: {},
    };
    expect(checkDifficultyDistribution(two).violations.map((one) => one.code)).toEqual([
      'DIFFICULTY_SKEWED_HARD',
    ]);
  });
});
