import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { difficultyFloor, findDifficultyShortfalls, readDifficultyClaim, describeDifficultyClaimFault } from '../src/fault/difficulty.js';
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
 * The other half of monotonicity, which the floor cannot state.
 *
 * A floor refuses a level below the structure and is silent about a level above it. The corpus had
 * six of the second kind and one of them claimed `L4` -- the level four other cases reach with three
 * hops -- over a single causal step (finding 494). The rule is not a ban: a case can be hard to
 * detect while being easy to trace. It is the condition under which the excess is a statement.
 */
describe('readDifficultyClaim', () => {
  /** Two steps across three kinds: floor L3. */
  const deep = faultCase(
    [
      ['container:default/api-app', 'pod:default/api-0'],
      ['pod:default/api-0', 'service:default/api'],
    ],
    'container:default/api-app',
  );
  const read = (over: Partial<FaultCase>) => readDifficultyClaim({ case: { ...deep, ...over }, graph: GRAPH });

  it('says nothing about a case at its floor with no note', () => {
    const claim = read({ difficulty: 'L3' });
    expect(claim).toEqual({ caseId: 'case-001', declared: 'L3', floor: 'L3', above: false, faults: [] });
  });

  it('refuses a level above the floor that does not say what the chain cannot see', () => {
    const claim = read({ difficulty: 'L4' });
    expect(claim.above).toBe(true);
    expect(claim.faults).toEqual([
      { kind: 'unsupported', caseId: 'case-001', declared: 'L4', floor: 'L3' },
    ]);
    // The sentence names both levels, because the author has two ways to answer it: say why, or
    // move the label down to what the chain supports.
    expect(describeDifficultyClaimFault(claim.faults[0]!)).toBe(
      "'case-001' is labelled L4 and its own structure supports L3, and fault.difficultyNote says " +
        'nothing -- a level above the floor claims something the chain cannot show, and the note is ' +
        'where the case says what',
    );
  });

  it('accepts a level above the floor whose note is a sentence', () => {
    const note = 'nothing fired: the move is three baseline standard deviations inside the noise band.';
    expect(read({ difficulty: 'L4', difficultyNote: note }).faults).toEqual([]);
  });

  it('refuses a note that is a label where a sentence is required', () => {
    const claim = read({ difficulty: 'L4', difficultyNote: 'subtle' });
    expect(claim.faults).toEqual([{ kind: 'label', caseId: 'case-001', note: 'subtle' }]);
    expect(describeDifficultyClaimFault(claim.faults[0]!)).toContain(
      'which is a label: a note says what the chain cannot show',
    );
  });

  it('refuses a note at the floor, because there is no gap for it to explain', () => {
    // The placement rule is what keeps the field from becoming a second statement of the label: at
    // the floor the label already says everything the structure supports, and a case that is harder
    // than its chain says so in `difficulty`.
    const claim = read({
      difficulty: 'L3',
      difficultyNote: 'the readings recover before the window ends, so there is nothing to look at after.',
    });
    expect(claim.above).toBe(false);
    expect(claim.faults).toEqual([{ kind: 'redundant', caseId: 'case-001', declared: 'L3', floor: 'L3' }]);
    // The sentence has to say where the claim belongs instead, because `redundant` is the one refusal
    // whose repair is not "write the note" but "the note is the wrong field".
    expect(describeDifficultyClaimFault(claim.faults[0]!)).toBe(
      "'case-001' is labelled L3, which is exactly what its structure supports, and it carries a " +
        'fault.difficultyNote -- there is no gap for the sentence to explain; a case that is harder ' +
        'than its chain says so in `difficulty`, not in a note beside it',
    );
  });

  it('refuses a note on a case that states no level at all', () => {
    const claim = read({ difficultyNote: 'the readings recover before the window ends, so nothing is left.' });
    expect(claim).toEqual({
      caseId: 'case-001',
      declared: undefined,
      floor: 'L3',
      above: false,
      faults: [{ kind: 'stray', caseId: 'case-001', note: 'the readings recover before the window ends, so nothing is left.' }],
    });
    expect(describeDifficultyClaimFault(claim.faults[0]!)).toContain('the note explains a claim nobody made');
  });

  it('refuses a note that is not text, with or without a level', () => {
    // Refused as itself rather than as a short sentence: "a note is a sentence" is the weaker claim,
    // and a number in the field is a different mistake from a sentence that says nothing.
    const withLevel = read({ difficulty: 'L4', difficultyNote: 3 });
    expect(withLevel.faults).toEqual([{ kind: 'notText', caseId: 'case-001', note: 3 }]);
    expect(describeDifficultyClaimFault(withLevel.faults[0]!)).toBe(
      "'case-001' carries fault.difficultyNote as 3, and a note is a sentence of text",
    );
    const withoutLevel = read({ difficultyNote: { why: 'x' } });
    expect(withoutLevel.faults).toEqual([{ kind: 'notText', caseId: 'case-001', note: { why: 'x' } }]);
  });

  it('says nothing about a level below the floor, which the shortfall rule already refuses', () => {
    // Two rules over one field, and neither reports the other's defect twice: a level below the
    // floor is already refused by `findDifficultyShortfalls`, so reading it here as an unsupported
    // claim (or its note as redundant) would print two sentences about one mistake.
    const claim = read({
      difficulty: 'L2',
      difficultyNote: 'the readings recover before the window ends, so there is nothing to look at after.',
    });
    expect(claim).toEqual({ caseId: 'case-001', declared: 'L2', floor: 'L3', above: false, faults: [] });
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

  it('answers for every level that claims more than its chain carries, and for none that does not', () => {
    // Six cases claim above their floor and six say what the floor cannot see. Naming them is the
    // point rather than counting them: the sentence each one carries is a judgement about a
    // different axis -- a measurement that is a comparison, an absence with nothing to read, a move
    // inside the noise band, a mechanism off the graph, a setting changed days earlier, a failure
    // that looks like a finish -- so the field's content is the evidence that the excess is not one
    // thing wearing six names.
    const claims = shipped.map((one) => readDifficultyClaim({ case: one, graph: shippedGraph }));
    expect(claims.filter((one) => one.above).map((one) => one.caseId).sort()).toEqual([
      'history-cart-network-delay',
      'history-config-feature-flag-checkout',
      'history-config-rate-cache-ttl-pricing',
      'history-queue-disk-watermark-batch-drain',
      'history-queue-watermark-ledger-writer',
      'history-unhandled-exception-export',
    ]);
    for (const claim of claims) expect(claim.faults, claim.caseId).toEqual([]);
  });

  it('has a hardest level, and names the cases whose chains earn it', () => {
    // Named rather than counted: at this size a share of 0.1 is satisfied by two cases, so a count
    // alone would let a chain be shortened while the number stayed whole.
    const hardest = shipped.filter((one) => difficultyFloor({ case: one, graph: shippedGraph }) === 'L4');
    expect(hardest.map((one) => one.difficulty)).toEqual(['L4', 'L4', 'L4', 'L4', 'L4']);
    expect(hardest.map((one) => one.caseId).sort()).toEqual([
      'history-code-slow-regex-api-gateway',
      'history-dependency-schema-change-currency-feed',
      'history-middleware-cache-shard-product-index',
      'history-queue-duplicate-publish-ingest-writer',
      'history-runtime-pod-shutdown-webhook-dispatcher',
    ]);
    // Three steps each, read off the chain rather than off the label: the two numbers can disagree,
    // and when they do the label is the thing that is wrong.
    for (const one of hardest) expect(one.groundTruth.causalChain).toHaveLength(3);
  });

  it('holds both shapes of three-step chain, one that exits the system and one that stays in it', () => {
    // The corpus's first two three-step chains both left the system at their last hop -- container,
    // pod, service, then out to the callers or to a merchant -- so a case whose propagation stays
    // inside was missing, and a corpus of chains that all exit has only one shape of hard question.
    // The third hop can stay inside in two different ways, and the corpus now has both: a chain
    // that ends at a neighbouring service the root cause does not belong to
    // (`history-middleware-cache-shard-product-index`), and one that crosses a service boundary on
    // its way there (`history-dependency-schema-change-currency-feed`). The last hop is read from
    // the chain, and `external:` is what "outside" means here: an entity in the graph whose kind is
    // `external` is a party this system calls rather than one of its parts.
    const threeStep = shipped.filter((one) => (one.groundTruth.causalChain ?? []).length >= 3);
    const endsOutside = (one: (typeof threeStep)[number]): boolean =>
      ((one.groundTruth.causalChain ?? []).at(-1)?.toEntityId ?? '').startsWith('external:');
    const inside = threeStep.filter((one) => !endsOutside(one));
    const outside = threeStep.filter((one) => endsOutside(one));
    expect(inside.map((one) => one.caseId)).toEqual([
      'history-middleware-cache-shard-product-index',
      'history-dependency-schema-change-currency-feed',
      'history-queue-duplicate-publish-ingest-writer',
    ]);
    // Both shapes, and the count on each side: a corpus that swapped one for the other would keep
    // the total and lose the property the test is about.
    expect(threeStep).toHaveLength(5);
    expect(outside).toHaveLength(2);
    // The inside endings are two kinds rather than one, and v3.78 added the second: the queue case
    // stops at a resource the root cause writes to, not at a neighbouring service it calls. A chain
    // that can only end at a service or outside has no shape for "the thing that is wrong is what
    // this topic holds", which is a question the corpus could not ask before it had one.
    const endsAtResource = inside.filter((one) =>
      ((one.groundTruth.causalChain ?? []).at(-1)?.toEntityId ?? '').startsWith('mq:'),
    );
    expect(endsAtResource.map((one) => one.caseId)).toEqual([
      'history-queue-duplicate-publish-ingest-writer',
    ]);
  });

  it('meets the published L4 share, and that share is what the chains earn rather than what the cases claim', () => {
    const bundle = { irVersion: '1.0.0', graph: shippedGraph, cases: shipped, signals: {} };
    expect(checkDifficultyDistribution(bundle).violations).toEqual([]);
    // The two numbers were the same until v3.74 and are not any more: five cases state L4, four of
    // them reach it with three causal steps, and one states it over a chain of one (finding 494).
    // The gate reads the second number, because a share a corpus can meet by relabelling is not a
    // measurement of anything.
    const claimed = shipped.filter((one) => one.difficulty === 'L4');
    const earned = shipped.filter((one) => difficultyFloor({ case: one, graph: shippedGraph }) === 'L4');
    expect(claimed).toHaveLength(6);
    expect(earned).toHaveLength(5);
    expect(earned.length / shipped.length).toBeGreaterThanOrEqual(0.1);
    // 5 of 34 is 0.147, and it is the first size at which the share survives losing a case -- the
    // subject of the ratchet below.
  });

  it('cannot be met by relabelling, which is the property the share exists for', () => {
    // Ten copies of a case with no chain at all, every one of them labelled L4. By claim that is a
    // corpus of the hardest level; by structure it is ten cases whose chains support L1, and the
    // gate has to be unable to see the first number. The refusals that answer a claim like this are
    // the corpus guard's (`readDifficultyClaim` and `findDifficultyShortfalls`), not the share's --
    // the gate reads structure, and the annotation is checked where the annotation lives.
    const flat = Array.from({ length: 10 }, (_, index) => ({
      ...faultCase([]),
      caseId: `history-flat-${String(index)}`,
      difficulty: 'L4' as const,
    }));
    expect(
      checkDifficultyDistribution({ irVersion: '1.0.0', graph: GRAPH, cases: flat, signals: {} }).violations.map(
        (one) => one.code,
      ),
    ).toEqual(['DIFFICULTY_SKEWED_HARD']);
  });

  it('meets that share at the denominator it is committed to, and states the size at which it would not', () => {
    // The corpus is committed to annotating every sample in the extraction key, so the size the
    // share has to survive is the key's size and not today's count.
    //
    // The numerator is the earned one, which is one fewer than it was when this test was written:
    // four cases reach L4 with three causal steps and one states it over a single hop. The deadline
    // is still *outside the key* rather than merely ahead of it, and that is a derived statement
    // rather than a promise: four earned L4 cases fall below a tenth of the corpus at forty-one
    // cases, and the extraction key carries thirty-three samples, so no annotation the key can
    // supply moves the ladder off its floor.
    const key = JSON.parse(
      readFileSync(resolve(CORPUS, '..', 'fault-extraction', 'samples.json'), 'utf8'),
    ) as { samples: unknown[] };
    const hardest = shipped.filter((one) => difficultyFloor({ case: one, graph: shippedGraph }) === 'L4');
    const atFullSize = hardest.length / key.samples.length;
    expect(atFullSize).toBeGreaterThanOrEqual(0.1);
    // The smallest corpus at which the same numerator is no longer enough, derived from the floor
    // rather than quoted: floor(n / 0.1) + 1 is the first size below a tenth.
    const bindsAt = Math.floor(hardest.length / 0.1) + 1;
    expect(bindsAt).toBeGreaterThan(key.samples.length);
  });

  it('can afford to lose exactly one earned case, and not two', () => {
    // How many L4 cases the corpus can lose is a number, and it has moved every round the count
    // moved. The number changed meaning in v3.74: it used to be read over the labels, and the one
    // case the corpus could afford to lose was the case that only *claimed* L4 -- deleting it took
    // five of thirty-three to four of thirty-two, which is 0.125, while not deleting it left a
    // corpus whose hard count is one annotation away from a tenth.
    //
    // Read over the chains it became **none**: at four of thirty-three, deleting any earned case
    // took the corpus to three of thirty-two, which is 0.094. That was the sharper statement and it
    // was also a knife edge -- one case's chain shortened by an edit put the corpus below the floor
    // the corpus publishes, and nothing else had to happen.
    //
    // v3.78 added the fifth earned case, and the arithmetic is why: five of thirty-four is 0.147,
    // so one may be lost (four of thirty-three, 0.121) and two may not (three of thirty-two, 0.094).
    // One unit of slack is what makes this a ratchet rather than a coincidence, and the pair of
    // assertions below is the difference between the two states -- an assertion that only counted
    // the cases could not tell them apart.
    const earned = shipped.filter((one) => difficultyFloor({ case: one, graph: shippedGraph }) === 'L4');
    const claimedOnly = shipped.filter(
      (one) =>
        one.difficulty === 'L4' &&
        difficultyFloor({ case: one, graph: shippedGraph }) !== 'L4',
    );
    expect(claimedOnly.map((one) => one.caseId)).toEqual(['history-config-rate-cache-ttl-pricing']);
    const drop = (...dropIds: string[]) => ({
      irVersion: '1.0.0',
      graph: shippedGraph,
      cases: shipped.filter((one) => !dropIds.includes(one.caseId)),
      signals: {},
    });
    const codes = (...dropIds: string[]): string[] =>
      checkDifficultyDistribution(drop(...dropIds)).violations.map((one) => one.code);

    // The claim is not a case the corpus can lose: the gate never counted it.
    expect(codes(claimedOnly[0]!.caseId)).toEqual([]);
    // Any one earned case may go, and the corpus still meets its own tenth.
    for (const one of earned) {
      expect(codes(one.caseId), `${one.caseId} is a case the corpus can now afford to lose`).toEqual([]);
    }
    // And no two, which is the half that makes the first half a measurement: a corpus whose slack
    // grew with its size would pass the loop above and say nothing.
    for (const [at, one] of earned.entries()) {
      for (const other of earned.slice(at + 1)) {
        expect(
          codes(one.caseId, other.caseId),
          `${one.caseId} and ${other.caseId} together take the corpus below its floor`,
        ).toEqual(['DIFFICULTY_SKEWED_HARD']);
      }
    }
    // Padded with copies of a shipped L3 case rather than with literals, because what the rule reads
    // is a share: the point is the size at which the same numerator stops being enough.
    const filler = shipped.find((one) => one.difficulty === 'L3')!;
    const at = (size: number): string[] =>
      checkDifficultyDistribution({
        irVersion: '1.0.0',
        graph: shippedGraph,
        cases: [
          ...shipped,
          ...Array.from({ length: size - shipped.length }, (_, index) => ({
            ...filler,
            caseId: `history-padding-${String(index)}`,
          })),
        ],
        signals: {},
      }).violations.map((one) => one.code);
    expect(at(earned.length * 10), 'five of fifty is exactly the floor').toEqual([]);
    expect(at(earned.length * 10 + 1), 'five of fifty-one is below it').toEqual([
      'DIFFICULTY_SKEWED_HARD',
    ]);
  });
});
