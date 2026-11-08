import { describe, expect, it } from 'vitest';
import {
  caseFingerprint,
  checkG1Structural,
  checkSaturation,
  describePromptLeaks,
  describeSaturation,
  normaliseName,
  promptNamePattern,
  readPromptLeaks,
  readSaturation,
  checkG2Semantic,
  checkG3Validity,
  checkG4Solvability,
  checkG5AntiPollution,
  checkDiscrimination,
  checkSolvability,
  locatedRank,
  mean,
  runAllGates,
  stddev,
  sustainedAnomalySamples,
  zScore,
  type BaselineOutcome,
} from '../src/gates/gates.js';
import type { FaultCase, IrBundle } from '../src/ir/types.js';
import { INJECT, T0, T1, validBundle, validCase } from './fixtures.js';

const G1_OPENRCA = { requiredSignals: ['metric', 'trace'] as const, requiresQuery: true };
const G1_RCA100 = {
  requiredSignals: ['metric', 'log', 'trace', 'event', 'alert'] as const,
  requiresQuery: true,
};
const SOLVED: BaselineOutcome[] = [
  { caseId: 'case-001', method: 'baro', rankOfTruth: 1, topK: 5, candidateCount: 12 },
];

describe('statistics helpers', () => {
  it('computes mean and sample stddev', () => {
    expect(mean([])).toBe(0);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(stddev([2, 2, 2, 2])).toBe(0);
    expect(stddev([])).toBe(0);
    expect(stddev([1])).toBe(0);
  });

  it('floors sigma so a zero-variance baseline does not divide by zero', () => {
    expect(zScore(1, 0, 0)).toBe(1 / 1e-6);
  });

  it('counts only the trailing sustained run', () => {
    const series = [10, 10, 10, 10, 99, 99, 99];
    expect(sustainedAnomalySamples(series, 4, 2)).toBe(3);
  });

  it('breaks the streak at the first in-range sample', () => {
    const series = [10, 10, 10, 10, 99, 10, 99];
    expect(sustainedAnomalySamples(series, 4, 2)).toBe(1);
  });

  it('returns zero when the baseline covers the whole series', () => {
    expect(sustainedAnomalySamples([1, 2, 3], 3, 2)).toBe(0);
    expect(sustainedAnomalySamples([1, 2, 3], 0, 2)).toBe(0);
  });
});

describe('G1 structural', () => {
  it('passes a valid bundle for OpenRCA', () => {
    expect(checkG1Structural(validBundle(), G1_OPENRCA).status).toBe('passed');
  });

  it('passes a valid bundle for RCA100', () => {
    expect(checkG1Structural(validBundle(), G1_RCA100).status).toBe('passed');
  });

  it('fails when a required signal is absent', () => {
    const b = validBundle({ signals: { 'case-001': [] } });
    const r = checkG1Structural(b, G1_OPENRCA);
    expect(r.status).toBe('failed');
    expect(r.violations.some((v) => v.code === 'MISSING_SIGNAL')).toBe(true);
  });

  it('fails when the query is required but missing', () => {
    const b = validBundle({ cases: [validCase({ query: '   ' })] });
    expect(checkG1Structural(b, G1_OPENRCA).violations).toContainEqual(
      expect.objectContaining({ code: 'MISSING_QUERY' }),
    );
  });

  it('fails on a malformed injectTime', () => {
    const b = validBundle({ cases: [validCase({ injectTime: '2026-09-06 08:10:00' })] });
    expect(checkG1Structural(b, G1_OPENRCA).violations).toContainEqual(
      expect.objectContaining({ code: 'BAD_INJECT_TIME' }),
    );
  });

  it('fails on an empty root cause', () => {
    const fc = validCase();
    fc.groundTruth.rootCauseEntityId = '';
    const b = validBundle({ cases: [fc] });
    expect(checkG1Structural(b, G1_OPENRCA).violations).toContainEqual(
      expect.objectContaining({ code: 'EMPTY_ROOT_CAUSE' }),
    );
  });

  it('fails on an empty case id', () => {
    const b = validBundle({ cases: [validCase({ caseId: '' })] });
    expect(checkG1Structural(b, G1_OPENRCA).violations).toContainEqual(
      expect.objectContaining({ code: 'EMPTY_CASE_ID' }),
    );
  });

  it('fails when a signal carries no service.name', () => {
    const b = validBundle();
    const sigs = b.signals['case-001'] as NonNullable<IrBundle['signals'][string]>;
    for (const s of sigs) s.resource['service.name'] = '';
    expect(checkG1Structural(b, G1_OPENRCA).violations).toContainEqual(
      expect.objectContaining({ code: 'MISSING_SERVICE_NAME' }),
    );
  });

  it('fails on a malformed window', () => {
    const b = validBundle({ cases: [validCase({ window: { start: 'x', end: 'y' } })] });
    expect(checkG1Structural(b, G1_OPENRCA).violations).toContainEqual(
      expect.objectContaining({ code: 'BAD_WINDOW' }),
    );
  });
});

describe('G2 semantic', () => {
  it('passes a valid bundle', () => {
    expect(checkG2Semantic(validBundle()).status).toBe('passed');
  });

  it('flags a dangling edge endpoint', () => {
    const b = validBundle();
    b.graph.edges = [{ from: 'service:default/order', to: 'ghost', relation: 'calls' }];
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'DANGLING_EDGE_REF' }),
    );
  });

  it('flags an invalid relation', () => {
    const b = validBundle();
    b.graph.edges = [{ from: 'service:default/order', to: 'service:default/cart', relation: 'depends_on' }];
    expect(checkG2Semantic(b as unknown as IrBundle).violations).toContainEqual(
      expect.objectContaining({ code: 'INVALID_RELATION' }),
    );
  });

  it('flags an unresolvable root cause entity', () => {
    const fc = validCase();
    fc.groundTruth.rootCauseEntityId = 'service:default/ghost';
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'UNRESOLVED_ROOT_CAUSE' }),
    );
  });

  it('flags a numeric checkpoint without a unit', () => {
    const fc = validCase();
    fc.groundTruth.evidenceCheckpoints = [
      { checkpointId: 'cp-1', entityRef: 'service:default/order', comparator: '>', value: 90, description: 'cpu' },
    ];
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'NUMERIC_CHECKPOINT_WITHOUT_UNIT' }),
    );
  });

  it('flags a checkpoint with an unknown unit', () => {
    const fc = validCase();
    fc.groundTruth.evidenceCheckpoints = [
      {
        checkpointId: 'cp-1',
        entityRef: 'service:default/order',
        comparator: '>',
        value: 90,
        unit: 'parsec',
        description: 'cpu',
      },
    ];
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_UNIT' }),
    );
  });

  it('flags a causal chain that skips a hop', () => {
    const fc = validCase();
    fc.groundTruth.causalChain = [
      { step: 1, fromEntityId: 'service:default/order', toEntityId: 'service:default/cart', mechanism: 'a', evidenceRefs: [] },
      { step: 2, fromEntityId: 'service:default/pay', toEntityId: 'service:default/cart', mechanism: 'b', evidenceRefs: [] },
    ];
    fc.groundTruth.evidenceCheckpoints = [];
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'CAUSAL_CHAIN_BREAK' }),
    );
  });

  it('flags a chain whose steps do not start at one, because a chain states its own order', () => {
    // `step` is read only to sort, so a chain numbered 2, 3 sorted into a plausible sequence and
    // nothing said the numbers were wrong. The numbers *are* the order, and 1..n is what a run of
    // steps is called (finding 253).
    const fc = validCase();
    fc.groundTruth.causalChain = [
      { step: 2, fromEntityId: 'service:default/order', toEntityId: 'service:default/cart', mechanism: 'a', evidenceRefs: [] },
    ];
    fc.groundTruth.evidenceCheckpoints = [];
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'CAUSAL_STEPS_NOT_NUMBERED' }),
    );
  });

  it('flags a chain that returns to where it started, which is a loop and not a path', () => {
    // The defect this rule was written for: `order -> cart -> order` is contiguous at every hop, so the
    // connectivity check passed it, and the second hop asserted that the cart caused the order. A
    // propagation run visits an entity once; a control belongs in the evidence layer (finding 253).
    const fc = validCase();
    fc.groundTruth.causalChain = [
      { step: 1, fromEntityId: 'service:default/order', toEntityId: 'service:default/cart', mechanism: 'a', evidenceRefs: [] },
      { step: 2, fromEntityId: 'service:default/cart', toEntityId: 'service:default/order', mechanism: 'b', evidenceRefs: [] },
    ];
    fc.groundTruth.evidenceCheckpoints = [];
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'CAUSAL_CHAIN_REVISITS' }),
    );
  });

  it('flags a root cause the chain never visits, which a comment said another gate refused', () => {
    // `fault/difficulty.ts` declines a `breadth >= 3` row on the grounds that "a root cause off its
    // own chain is a defect the four-layer assessment already refuses". Nothing refused it: the
    // entity layer asked only that the root resolve and the process layer only that each step's
    // ends resolve, so an annotation could name its answer in a component its chain never reaches
    // and pass every gate in this package (finding 281).
    const b = validBundle();
    b.graph.entities.push({
      entityId: 'pod:default/order-0',
      kind: 'pod',
      name: 'order-0',
      namespace: 'default',
      aliases: [],
    });
    b.graph.edges.push({
      from: 'service:default/order',
      to: 'pod:default/order-0',
      relation: 'contains',
    });
    const fc = b.cases[0] as (typeof b.cases)[number];
    fc.groundTruth.rootCauseEntityId = 'pod:default/order-0';
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'ROOT_OFF_ITS_CHAIN' }),
    );
  });

  it('accepts a root the chain reaches at its far end, and one named by an alias', () => {
    // "Visits" rather than "starts at": the corpus's node-first chains begin at the actor that acts
    // on the answer, so a rule demanding the root be the first entity would refuse both of them.
    // And the comparison is by resolved id, because an alias and an id name one entity and a rule
    // that could not see that would refuse a case for how it spelled its own answer.
    const b = validBundle();
    const fc = b.cases[0] as (typeof b.cases)[number];
    fc.groundTruth.rootCauseEntityId = 'service:default/cart';
    expect(checkG2Semantic(b).violations.map((v) => v.code)).not.toContain('ROOT_OFF_ITS_CHAIN');
    fc.groundTruth.rootCauseEntityId = 'svc-order-prod-01';
    expect(checkG2Semantic(b).violations.map((v) => v.code)).not.toContain('ROOT_OFF_ITS_CHAIN');
  });

  it('says neither thing about the chain it accepts', () => {
    const b = validBundle();
    const codes = checkG2Semantic(b).violations.map((v) => v.code);
    expect(codes).not.toContain('CAUSAL_STEPS_NOT_NUMBERED');
    expect(codes).not.toContain('CAUSAL_CHAIN_REVISITS');
  });

  it('flags an evidence reference that points at a missing checkpoint', () => {
    const fc = validCase();
    fc.groundTruth.evidenceCheckpoints = [];
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'UNRESOLVED_EVIDENCE_REF' }),
    );
  });

  it('accepts a case that declares neither a causal chain nor evidence checkpoints', () => {
    const fc = validCase();
    delete fc.groundTruth.causalChain;
    delete fc.groundTruth.evidenceCheckpoints;
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).status).toBe('passed');
  });

  it('flags an evidence reference when the case declares no checkpoints at all', () => {
    const fc = validCase();
    delete fc.groundTruth.evidenceCheckpoints;
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'UNRESOLVED_EVIDENCE_REF' }),
    );
  });

  it('accepts a causal step that starts and ends at the same entity', () => {
    const fc = validCase();
    fc.groundTruth.causalChain = [
      {
        step: 1,
        fromEntityId: 'service:default/order',
        toEntityId: 'service:default/order',
        mechanism: 'a saturated thread pool blocks its own retries',
        evidenceRefs: [],
      },
    ];
    fc.groundTruth.evidenceCheckpoints = [];
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).status).toBe('passed');
  });

  it('flags an injectTime outside the window', () => {
    const b = validBundle({ cases: [validCase({ injectTime: '2026-09-06T05:00:00.000Z' })] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'INJECT_TIME_OUT_OF_WINDOW' }),
    );
  });

  it('flags an inverted window', () => {
    const b = validBundle({ cases: [validCase({ window: { start: T1, end: T0 } })] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'INVERTED_WINDOW' }),
    );
  });

  it('flags timestamps that go backwards for one metric', () => {
    const b = validBundle();
    const sigs = b.signals['case-001'] as NonNullable<IrBundle['signals'][string]>;
    const first = sigs[0];
    if (first && first.payload.kind === 'metric') {
      first.timestamp = '2026-09-06T00:19:00.000Z';
    }
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'NON_MONOTONIC_TIMESTAMP' }),
    );
  });

  it('flags a signal whose service is absent from the entity graph', () => {
    const b = validBundle();
    const sigs = b.signals['case-001'] as NonNullable<IrBundle['signals'][string]>;
    if (sigs[0]) sigs[0].resource['service.name'] = 'billing';
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'UNRESOLVED_SERVICE_NAME' }),
    );
  });

  it('flags a causal hop that the topology cannot support', () => {
    const b = validBundle({ graph: { entities: validBundle().graph.entities, edges: [] } });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'CAUSAL_HOP_NOT_IN_TOPOLOGY' }),
    );
  });

  it('accepts a causal hop backed by an indirect path', () => {
    const base = validBundle();
    const b = validBundle({
      graph: {
        entities: [
          ...base.graph.entities,
          { entityId: 'service:default/pay', kind: 'service', name: 'pay', namespace: 'default', aliases: [] },
        ],
        edges: [{ from: 'service:default/order', to: 'service:default/cart', relation: 'calls' }],
      },
    });
    const fc = b.cases[0];
    if (fc) {
      fc.groundTruth.causalChain = [
        {
          step: 1,
          fromEntityId: 'service:default/order',
          toEntityId: 'service:default/cart',
          mechanism: 'a',
          evidenceRefs: ['cp-1'],
        },
      ];
    }
    expect(
      checkG2Semantic(b).violations.filter((x) => x.code === 'CAUSAL_HOP_NOT_IN_TOPOLOGY'),
    ).toHaveLength(0);
  });

  it('flags a signal timestamp that is not canonical UTC', () => {
    const b = validBundle();
    const sigs = b.signals['case-001'] as NonNullable<IrBundle['signals'][string]>;
    if (sigs[0]) sigs[0].timestamp = '2026-09-06T00:00:00+08:00';
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'BAD_SIGNAL_TIMESTAMP' }),
    );
  });
});

describe('G3 signal validity', () => {
  it('passes a bundle with a sustained post-injection anomaly', () => {
    expect(checkG3Validity(validBundle()).status).toBe('passed');
  });

  it('flags a case whose metrics never deviate', () => {
    const b = validBundle();
    const sigs = b.signals['case-001'] as NonNullable<IrBundle['signals'][string]>;
    for (const s of sigs) {
      if (s.payload.kind === 'metric') s.payload.value = 20;
    }
    expect(checkG3Validity(b).violations).toContainEqual(
      expect.objectContaining({ code: 'WEAK_ANOMALY_SIGNAL' }),
    );
  });

  it('flags an anomaly that is too short-lived', () => {
    const b = validBundle({ cases: [validCase()] });
    const sigs = b.signals['case-001'] as NonNullable<IrBundle['signals'][string]>;
    const post = sigs.filter(
      (s) => s.payload.kind === 'metric' && Date.parse(s.timestamp) >= Date.parse(INJECT),
    );
    const last = post[post.length - 1];
    if (last && last.payload.kind === 'metric') last.payload.value = 20;
    expect(checkG3Validity(b, { minSustainedSamples: 5 }).violations).toContainEqual(
      expect.objectContaining({ code: 'WEAK_ANOMALY_SIGNAL' }),
    );
  });

  it('flags a quarantine ratio above the ceiling', () => {
    expect(
      checkG3Validity(validBundle(), { quarantineRatio: 0.2 }).violations,
    ).toContainEqual(expect.objectContaining({ code: 'QUARANTINE_RATIO_EXCEEDED' }));
  });

  it('accepts a quarantine ratio at exactly the ceiling', () => {
    expect(
      checkG3Validity(validBundle(), { quarantineRatio: 0.05 }).violations.filter(
        (v) => v.code === 'QUARANTINE_RATIO_EXCEEDED',
      ),
    ).toHaveLength(0);
  });

  it('flags a signal that falls outside the case window', () => {
    const b = validBundle();
    const sigs = b.signals['case-001'] as NonNullable<IrBundle['signals'][string]>;
    if (sigs[0]) sigs[0].timestamp = '2026-09-06T09:00:00.000Z';
    expect(checkG3Validity(b).violations).toContainEqual(
      expect.objectContaining({ code: 'SIGNAL_OUT_OF_WINDOW' }),
    );
  });

  it('skips the anomaly check when a case has no metrics', () => {
    const b = validBundle({
      signals: { 'case-001': (validBundle().signals['case-001'] ?? []).filter((s) => s.payload.kind !== 'metric') },
    });
    expect(
      checkG3Validity(b).violations.filter((v) => v.code === 'WEAK_ANOMALY_SIGNAL'),
    ).toHaveLength(0);
  });
});

describe('whether the corpus can fail a method that returns the loudest component', () => {
  // A corpus whose every answer is the largest excursion in its window scores 100% for the dumbest
  // possible localiser, and reports that as a measurement of localisation. The rule is corpus-level
  // because "is there at least one case that displaces the answer" is not a property of any case.
  //
  // It takes the *classification* rather than the ranks: a rank above 1 can be a strictly louder
  // competitor, a tie broken by name, or a pod outranking its own service, and only the first is
  // evidence (`classifyDisplacement`, tested in `displacement.test.ts`).
  const kinds = (...all: Array<'strict' | 'tie' | 'same-component' | 'none'>) =>
    all.map((kind, index) => ({ caseId: `case-${String(index)}`, kind }));

  it('accepts a corpus with one case displaced by a strictly louder component', () => {
    expect(checkDiscrimination(kinds('none', 'strict')).violations).toEqual([]);
  });

  it('refuses a corpus whose displacements are all ties or its own parts', () => {
    // The state the corpus was in before the classification existed: three cases read as displaced,
    // and only one of them penalises a magnitude-based method.
    const result = checkDiscrimination(kinds('tie', 'same-component', 'none'));
    expect(result.violations).toEqual([
      expect.objectContaining({
        code: 'NO_DISPLACEMENT',
        message:
          'no case places a strictly louder, separate component above its answer (tie 1, same-component 1, none 1), ' +
          'so returning the largest excursion is never wrong',
      }),
    ]);
  });

  it('says nothing when there is nothing to say', () => {
    // No cases at all is a state the corpus guard refuses elsewhere; reporting it here as well would
    // be the same defect under a second name.
    expect(checkDiscrimination([]).violations).toEqual([]);
  });
});

describe('what counts as a location', () => {
  // `locatedRank` is three lines and it decides whether fifteen cases report a measurement. A rank
  // is only a location if the candidate it names showed something: a ranking of quiet services is a
  // list, and being second in a list of things that did not move is not a finding.
  it('gives the rank of a candidate that moved', () => {
    expect(locatedRank(12.5, 0)).toBe(1);
    expect(locatedRank(0.4, 2)).toBe(3);
  });

  it('reports absence for a candidate the ranking does not hold', () => {
    expect(locatedRank(undefined, -1)).toBeNull();
  });

  it('reports absence for a candidate that showed nothing at all', () => {
    // The state the corpus's background telemetry made reachable: every service in the system is a
    // candidate, so the answer is always *somewhere* in the ranking. Without this arm a case whose
    // answer never moved would be "solved at rank 2" because one other service moved.
    expect(locatedRank(0, 1)).toBeNull();
  });
});

describe('G4 solvability and difficulty', () => {
  it('passes when a baseline locates the root cause', () => {
    expect(checkG4Solvability(validBundle(), SOLVED).status).toBe('passed');
  });

  it('flags a case no baseline can solve', () => {
    const unsolved: BaselineOutcome[] = [
      { caseId: 'case-001', method: 'baro', rankOfTruth: null, topK: 5, candidateCount: 12 },
    ];
    expect(checkG4Solvability(validBundle(), unsolved).violations).toContainEqual(
      expect.objectContaining({ code: 'UNSOLVABLE_CASE' }),
    );
  });

  it('flags a rank outside top-K', () => {
    const out: BaselineOutcome[] = [{ caseId: 'case-001', method: 'baro', rankOfTruth: 9, topK: 5, candidateCount: 12 }];
    expect(checkG4Solvability(validBundle(), out).violations).toContainEqual(
      expect.objectContaining({ code: 'UNSOLVABLE_CASE' }),
    );
  });

  it('flags a case whose ranking is no wider than the K it is scored at', () => {
    // Two candidates, scored at top-3. The answer cannot fall outside the top three of a two-item
    // ranking, so the case reports a top-3 hit for any method that returns anything -- and a corpus
    // of these reports an accuracy equal to its detection rate. The rank is perfect here and the
    // case is still unusable as a localisation test, which is why this is a second code rather than
    // a stricter reading of `UNSOLVABLE_CASE`.
    const narrow: BaselineOutcome[] = [
      { caseId: 'case-001', method: 'peak-z', rankOfTruth: 1, topK: 3, candidateCount: 2 },
      { caseId: 'case-001', method: 'median-shift', rankOfTruth: 2, topK: 3, candidateCount: 2 },
    ];
    const violations = checkSolvability(validBundle(), narrow, {}).violations;
    expect(violations).toContainEqual(
      expect.objectContaining({
        code: 'LOCALISATION_UNCONTESTED',
        message: 'the ranking holds 2 candidate(s) against a top-K of 3, so being within the top-K is not a constraint',
      }),
    );
    // And the solvability half still passes: the two verdicts answer different questions.
    expect(violations.map((v) => v.code)).not.toContain('UNSOLVABLE_CASE');
  });

  it('passes the same case once the ranking is wider than K', () => {
    const wide: BaselineOutcome[] = [
      { caseId: 'case-001', method: 'peak-z', rankOfTruth: 1, topK: 3, candidateCount: 19 },
      { caseId: 'case-001', method: 'median-shift', rankOfTruth: 2, topK: 3, candidateCount: 19 },
    ];
    expect(checkSolvability(validBundle(), wide, {}).status).toBe('passed');
  });

  it('reports both codes when the answer is absent from a wide ranking', () => {
    // The two conditions are independent, and this input is the proof: a wide ranking that does not
    // contain the answer is solvable-but-wrong, not contested-but-fine. A single code covering both
    // would have to decide which one it was reporting.
    const absent: BaselineOutcome[] = [
      { caseId: 'case-001', method: 'peak-z', rankOfTruth: null, topK: 3, candidateCount: 19 },
    ];
    const codes = checkSolvability(validBundle(), absent, { minSolvers: 1 }).violations.map((v) => v.code);
    expect(codes).toEqual(['UNSOLVABLE_CASE']);
    const narrowAndAbsent: BaselineOutcome[] = [
      { caseId: 'case-001', method: 'peak-z', rankOfTruth: null, topK: 3, candidateCount: 2 },
    ];
    expect(checkSolvability(validBundle(), narrowAndAbsent, { minSolvers: 1 }).violations.map((v) => v.code)).toEqual([
      'UNSOLVABLE_CASE',
      'LOCALISATION_UNCONTESTED',
    ]);
  });

  it('counts one solver as contesting the case, so the rule is not a second minSolvers', () => {
    // A method whose ranking is wide and one whose ranking is narrow disagree about the case, not
    // about the answer: the question "could this be missed" was asked, and one run answered it.
    const mixed: BaselineOutcome[] = [
      { caseId: 'case-001', method: 'peak-z', rankOfTruth: 1, topK: 3, candidateCount: 19 },
      { caseId: 'case-001', method: 'median-shift', rankOfTruth: 1, topK: 3, candidateCount: 2 },
    ];
    expect(checkSolvability(validBundle(), mixed, {}).violations.map((v) => v.code)).not.toContain(
      'LOCALISATION_UNCONTESTED',
    );
  });

  it('skips the distribution check below the minimum sample size', () => {
    const b = validBundle({ cases: [validCase({ difficulty: 'L1' })] });
    expect(checkG4Solvability(b, SOLVED).status).toBe('passed');
  });

  it('flags a set that is almost entirely L1', () => {
    const cases: FaultCase[] = Array.from({ length: 10 }, (_, i) =>
      validCase({ caseId: `c-${i}`, difficulty: 'L1' }),
    );
    const b = validBundle({ cases });
    expect(checkG4Solvability(b, cases.map((c) => ({ caseId: c.caseId, method: 'baro', rankOfTruth: 1, topK: 5, candidateCount: 12 }))).violations,
    ).toContainEqual(expect.objectContaining({ code: 'DIFFICULTY_SKEWED_EASY' }));
  });

  it('flags a set without any hard cases', () => {
    const cases: FaultCase[] = Array.from({ length: 10 }, (_, i) =>
      validCase({ caseId: `c-${i}`, difficulty: 'L2' }),
    );
    const b = validBundle({ cases });
    expect(
      checkG4Solvability(
        b,
        cases.map((c) => ({ caseId: c.caseId, method: 'baro', rankOfTruth: 1, topK: 5, candidateCount: 12 })),
      ).violations,
    ).toContainEqual(expect.objectContaining({ code: 'DIFFICULTY_SKEWED_HARD' }));
  });
});

describe('G5 anti-pollution', () => {
  it('passes a clean bundle', () => {
    expect(checkG5AntiPollution(validBundle()).status).toBe('passed');
  });

  it('flags a duplicate case', () => {
    const b = validBundle({ cases: [validCase({ caseId: 'a' }), validCase({ caseId: 'b' })] });
    b.signals = { a: b.signals['case-001'] ?? [], b: b.signals['case-001'] ?? [] };
    expect(checkG5AntiPollution(b).violations).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_CASE' }),
    );
  });

  it('flags a case copied from a public benchmark', () => {
    const fc = validCase();
    const b = validBundle({ cases: [fc] });
    expect(checkG5AntiPollution(b, { publicFingerprints: new Set([caseFingerprint(fc)]) }).violations).toContainEqual(
      expect.objectContaining({ code: 'PUBLIC_SET_CONTAMINATION' }),
    );
  });

  it('flags an answer key that is not isolated', () => {
    const b = validBundle({ cases: [validCase({ answerKeyIsolated: false })] });
    expect(checkG5AntiPollution(b).violations).toContainEqual(
      expect.objectContaining({ code: 'ANSWER_KEY_NOT_ISOLATED' }),
    );
  });

  it('flags an email address in the query', () => {
    const b = validBundle({ cases: [validCase({ query: 'reported by alice@example.com' })] });
    expect(checkG5AntiPollution(b).violations).toContainEqual(
      expect.objectContaining({ code: 'SENSITIVE_DATA_PRESENT' }),
    );
  });

  it('flags a raw IPv4 address in a log body', () => {
    const b = validBundle();
    const sigs = b.signals['case-001'] as NonNullable<IrBundle['signals'][string]>;
    const log = sigs.find((s) => s.payload.kind === 'log');
    if (log && log.payload.kind === 'log') log.payload.body = 'upstream 10.20.30.40 refused';
    expect(checkG5AntiPollution(b).violations).toContainEqual(
      expect.objectContaining({ code: 'SENSITIVE_DATA_PRESENT' }),
    );
  });

  it('flags a leaked token', () => {
    const b = validBundle({ cases: [validCase({ query: 'key was github_pat_11AAAAAAAAAAAAAAAAAAA' })] });
    expect(checkG5AntiPollution(b).violations).toContainEqual(
      expect.objectContaining({ code: 'SENSITIVE_DATA_PRESENT' }),
    );
  });

  it('honours a caller-supplied pattern list', () => {
    const b = validBundle({ cases: [validCase({ query: 'ACME-CORP internal' })] });
    expect(checkG5AntiPollution(b, { sensitivePatterns: [/ACME-CORP/] }).violations).toContainEqual(
      expect.objectContaining({ code: 'SENSITIVE_DATA_PRESENT' }),
    );
  });
});

describe('caseFingerprint', () => {
  it('is stable for the same case', () => {
    expect(caseFingerprint(validCase())).toBe(caseFingerprint(validCase()));
  });

  it('changes when the fault type changes', () => {
    expect(caseFingerprint(validCase({ fault: { type: 'mem', category: 'resource' } }))).not.toBe(
      caseFingerprint(validCase()),
    );
  });
});

describe('runAllGates', () => {
  it('admits a fully valid bundle', () => {
    const { report } = runAllGates(
      validBundle(),
      { g1: G1_OPENRCA, g4Outcomes: SOLVED },
      { gateRunId: 'run-1', runAt: '2026-09-06T00:00:00.000Z', mutationTestPassed: true },
    );
    expect(report.finalStatus).toBe('admitted');
    expect(report.results).toHaveLength(5);
    expect(report.mutationTestPassed).toBe(true);
  });

  it('rejects a bundle that fails a structural gate', () => {
    const b = validBundle({ cases: [validCase({ query: '' })] });
    const { report } = runAllGates(
      b,
      { g1: G1_OPENRCA, g4Outcomes: SOLVED },
      { gateRunId: 'run-2', runAt: '2026-09-06T00:00:00.000Z' },
    );
    expect(report.finalStatus).toBe('rejected');
  });

  it('quarantines a bundle that only fails a soft gate', () => {
    const { report } = runAllGates(
      validBundle(),
      { g1: G1_OPENRCA, g3: { quarantineRatio: 0.9 }, g4Outcomes: SOLVED },
      { gateRunId: 'run-3', runAt: '2026-09-06T00:00:00.000Z' },
    );
    expect(report.finalStatus).toBe('quarantined');
  });

  it('quarantines a bundle submitted without any baseline outcome', () => {
    const { report } = runAllGates(
      validBundle(),
      { g1: G1_OPENRCA },
      { gateRunId: 'run-4', runAt: '2026-09-06T00:00:00.000Z' },
    );
    // With no outcome to rank, G4 cannot prove the case is solvable.
    expect(report.results).toContainEqual(expect.objectContaining({ gateId: 'G4', status: 'failed' }));
  });
});

/**
 * Whether a set can separate methods, and whether a prompt hands over its own answer.
 *
 * Both arms were added at v3.66, and both exist because the same number was being read as
 * evidence of health: `check-fault-cases` printed "both baselines place them in their top-K" in
 * its success line, and the corpus's `answerKeyIsolated` flag was `true` on thirty cases whose
 * task text named the answer in nineteen of them.
 */
describe('set saturation', () => {
  /** `count` distinct cases, each solved at rank 1 by every named method. */
  function setOf(count: number, methods: string[], rank = 1): IrBundle {
    const cases = Array.from({ length: count }, (_, i) => validCase({ caseId: `case-${String(i)}` }));
    return validBundle({ cases });
  }

  /** `count` outcomes starting at case `from`, so two calls can describe disjoint slices of a set. */
  function outcomesFor(
    count: number,
    methods: string[],
    rank: number | null,
    from = 0,
  ): BaselineOutcome[] {
    const out: BaselineOutcome[] = [];
    for (let i = from; i < from + count; i += 1) {
      for (const method of methods) {
        out.push({ caseId: `case-${String(i)}`, method, rankOfTruth: rank, topK: 3, candidateCount: 12 });
      }
    }
    return out;
  }

  it('flattens the spelling a name is written in', () => {
    expect(normaliseName('checkout-api')).toBe('checkout api');
    expect(normaliseName('  Checkout_API.Primary ')).toBe('checkout api primary');
    expect(normaliseName('a---b__c/d')).toBe('a b c d');
  });

  it('matches a name on word boundaries rather than inside a longer word', () => {
    expect(promptNamePattern('checkout-api')?.test('the checkout api p99 rose')).toBe(true);
    // The boundary is "not a letter or digit", so a longer token that merely starts with the name
    // does not match. `\b` would have said yes here, because a hyphen is a boundary to it.
    expect(promptNamePattern('checkout-api')?.test('the checkout apis p99 rose')).toBe(false);
    expect(promptNamePattern('checkout-api')?.test('checkout-apix rose')).toBe(false);
  });

  it('builds no pattern for a name that normalises to nothing', () => {
    // A caller asking for a pattern is asking to search text for a name. Empty and punctuation-only
    // names have no name to search for, and `new RegExp('')` would match every prompt in the set --
    // the widest possible leak reading from the emptiest possible input.
    expect(promptNamePattern('')).toBeNull();
    expect(promptNamePattern(' -._/ ')).toBeNull();
    expect(promptNamePattern('checkout-api')).not.toBeNull();
  });

  it('names the strongest baseline and its rate over the cases it was asked about', () => {
    const bundle = setOf(10, ['peak-z', 'median-shift']);
    const outcomes = [
      ...outcomesFor(10, ['peak-z'], 1),
      // The second method is right on half of them: the reading reports the strongest, not the mean,
      // because a set is separable only as far as its best available method is separable.
      ...outcomesFor(5, ['median-shift'], 1),
      ...outcomesFor(5, ['median-shift'], null),
    ];
    const reading = readSaturation(bundle, outcomes, {});
    expect(reading.asked).toBe(10);
    expect(reading.methods).toEqual([
      { method: 'median-shift', hits: 5, rate: 0.5 },
      { method: 'peak-z', hits: 10, rate: 1 },
    ]);
    expect(reading.strongest).toEqual({ method: 'peak-z', hits: 10, rate: 1 });
    expect(reading.saturated).toBe(true);
  });

  it('counts the cases it was asked about, not the ones in the set', () => {
    // Three of thirty cases carry an outcome. The rate is 3 of 3, not 3 of 30 -- and the set is not
    // judged, because three is below the floor.
    const bundle = setOf(30, ['peak-z']);
    const reading = readSaturation(bundle, outcomesFor(3, ['peak-z'], 1), {});
    expect(reading.asked).toBe(3);
    expect(reading.strongest).toEqual({ method: 'peak-z', hits: 3, rate: 1 });
    expect(reading.judged).toBe(false);
    expect(reading.saturated).toBe(false);
    expect(describeSaturation(reading)).toBe(
      'set saturation: not judged -- 3 case(s) carry an outcome and the floor is 10',
    );
  });

  it('refuses a benchmark set the strongest baseline already solves', () => {
    const bundle = setOf(10, ['peak-z']);
    const outcomes = outcomesFor(10, ['peak-z'], 1);
    const violations = checkSaturation(bundle, outcomes, {}).violations;
    expect(violations).toContainEqual(
      expect.objectContaining({
        code: 'SATURATED_SET',
        message:
          "the strongest baseline ('peak-z') locates 10 of 10 case(s) within top-3 (rate 1.000 against a " +
          'ceiling of 0.950), so this set cannot separate methods',
      }),
    );
    // The same number in the sentence the run prints, so the reading and the refusal cannot drift:
    // the log line and the violation are two renderings of one `SaturationReading`.
    expect(describeSaturation(readSaturation(bundle, outcomes, {}))).toBe(
      "set saturation: the strongest baseline ('peak-z') locates 10 of 10 case(s) within top-3 (rate " +
        "1.000); purpose 'benchmark', so this set is saturated",
    );
  });

  it('reads the strongest method by its rate, not by the order the outcomes arrived in', () => {
    // Both directions of the reduce, because each one alone would let a wrong comparison pass. The
    // fixtures elsewhere in this block have either one method or the strongest first, so "this one
    // beats the best so far" was never taken until this case existed -- and `peak-z` against
    // `median-shift` in the shipped corpus is exactly that shape, because the stronger baseline
    // sorts first there.
    const bundle = setOf(10, []);
    const weak = outcomesFor(10, ['a-weak'], 9);
    const strong = outcomesFor(10, ['b-strong'], 1);
    // The stronger method sorts last: the reduce keeps replacing its best, and must end on `b-strong`
    // whatever order the rows arrived in.
    const later = readSaturation(bundle, [...weak, ...strong], {});
    expect(later.strongest).toEqual({ method: 'b-strong', hits: 10, rate: 1 });
    expect(readSaturation(bundle, [...strong, ...weak], {})).toEqual(later);
    // The stronger method sorts first: the reduce must keep what it has, which is the arm a `<`
    // written in place of `>` would silently reverse.
    const earlier = readSaturation(bundle, [...outcomesFor(10, ['a-strong'], 1), ...outcomesFor(10, ['b-weak'], 9)], {});
    expect(earlier.strongest).toEqual({ method: 'a-strong', hits: 10, rate: 1 });
  });

  it('ignores an outcome that names a case the set does not contain', () => {
    // A stray row is not a question about anything. It must not narrow the top-K the set is
    // reported at -- the earlier version read `topK` across every outcome, so one row with
    // `topK: 1` would have reported the whole set as a top-1 set -- and it must not enter the
    // denominator either, because that is what "the cases it was asked about" means.
    const bundle = setOf(10, ['peak-z']);
    const stray: BaselineOutcome = { caseId: 'case-absent', method: 'peak-z', rankOfTruth: 1, topK: 1, candidateCount: 12 };
    const reading = readSaturation(bundle, [...outcomesFor(10, ['peak-z'], 1), stray], {});
    expect(reading.asked).toBe(10);
    expect(reading.topK).toBe(3);
    expect(reading.strongest).toEqual({ method: 'peak-z', hits: 10, rate: 1 });
    // A set with no overlap at all is asked nothing, so every method's rate is 0 rather than NaN.
    const disjoint = readSaturation(bundle, [stray], {});
    expect(disjoint.asked).toBe(0);
    expect(disjoint.topK).toBeNull();
    expect(disjoint.methods).toEqual([{ method: 'peak-z', hits: 0, rate: 0 }]);
    expect(disjoint.saturated).toBe(false);
  });

  it('passes the same set when it declares itself a conformance fixture', () => {
    const bundle = setOf(10, ['peak-z']);
    const outcomes = outcomesFor(10, ['peak-z'], 1);
    expect(checkSaturation(bundle, outcomes, { setPurpose: 'conformance' }).status).toBe('passed');
    // The reading is the same number; only the verdict differs, which is what the declaration buys.
    expect(describeSaturation(readSaturation(bundle, outcomes, { setPurpose: 'conformance' }))).toContain(
      "purpose 'conformance', so this is a reading and not a verdict",
    );
  });

  it('passes a benchmark set the baselines cannot solve outright', () => {
    const bundle = setOf(10, ['peak-z']);
    // Six of ten: below the ceiling, above the floor, and the gate stays quiet.
    const outcomes = [...outcomesFor(6, ['peak-z'], 1, 0), ...outcomesFor(4, ['peak-z'], 9, 6)];
    const reading = readSaturation(bundle, outcomes, {});
    expect(reading.saturated).toBe(false);
    expect(describeSaturation(reading)).toContain("purpose 'benchmark', ceiling 0.950");
    expect(checkSaturation(bundle, outcomes, {}).status).toBe('passed');
  });

  it('says so when no outcome was supplied at all', () => {
    const reading = readSaturation(setOf(1, []), [], { saturationMinCases: 0 });
    expect(reading.topK).toBeNull();
    expect(reading.strongest).toBeNull();
    expect(describeSaturation(reading)).toBe('set saturation: not judged -- no baseline outcome was supplied');
  });
});

describe('a prompt that names its own answer', () => {
  it('flags the component when the task text spells it', () => {
    const cases = [validCase({ query: 'checkout-api p99 rose from 180ms to 4.3s. What failed?' })];
    const fc = cases[0] as FaultCase;
    fc.groundTruth.rootCauseComponent = 'checkout-api';
    const violations = checkG5AntiPollution(validBundle({ cases })).violations;
    expect(violations).toContainEqual(
      expect.objectContaining({
        code: 'LEAK_IN_QUERY',
        message:
          "case 'case-001' names its root-cause component ('checkout-api') in the task text, so locating " +
          'it is a reading exercise rather than a diagnosis',
      }),
    );
  });

  it('accepts the same name in the telemetry, which is where the evidence belongs', () => {
    // The answer has to appear in the signals or the case cannot be scored at all; what the rule
    // forbids is the same word in the prompt. The two differ by one field, which is why the arm
    // reads one field rather than the whole bundle.
    const cases = [validCase({ query: 'A checkout path got slower. What failed?' })];
    const fc = cases[0] as FaultCase;
    fc.groundTruth.rootCauseComponent = 'checkout-api';
    const bundle = validBundle({ cases });
    expect(bundle.signals['case-001']?.length).toBeGreaterThan(0);
    expect(checkG5AntiPollution(bundle).status).toBe('passed');
  });

  it('does not judge a name too short to mean one thing', () => {
    // The default fixture's component is `order`, and its prompt says "The order service became slow".
    // That is how an incident is written; a rule that read it as a leak would fire on every case
    // whose name is also an English word, and the repair would be to stop reading the rule.
    const bundle = validBundle();
    const reading = readPromptLeaks(bundle);
    expect(reading.judged).toBe(0);
    expect(reading.skipped).toEqual([{ caseId: 'case-001', component: 'order' }]);
    expect(describePromptLeaks(reading)).toBe(
      'prompt leakage: 0 of 0 case(s) name their root-cause component in the task text; 1 case(s) not ' +
        'judged because their component name is shorter than 6 characters',
    );
    expect(checkG5AntiPollution(bundle).status).toBe('passed');
  });

  it('reads a case that carries no task text at all', () => {
    // `query` is optional in the IR, so a case can reach this arm with nothing to leak into. It is
    // judged -- its name is long enough to search for -- and it has no leak, rather than the absent
    // field becoming the string 'undefined' and that being searched for.
    const cases = [validCase({ caseId: 'quiet' })];
    const fc = cases[0] as FaultCase;
    fc.groundTruth.rootCauseComponent = 'media-transcoder';
    delete fc.query;
    const reading = readPromptLeaks(validBundle({ cases }));
    expect(reading.judged).toBe(1);
    expect(reading.leaks).toEqual([]);
    expect(describePromptLeaks(reading)).toBe(
      'prompt leakage: 0 of 1 case(s) name their root-cause component in the task text',
    );
  });

  it('prints the leaks it found, by case', () => {
    const cases = [validCase({ caseId: 'a' }), validCase({ caseId: 'b' })];
    for (const one of cases) one.groundTruth.rootCauseComponent = 'media-transcoder';
    (cases[1] as FaultCase).query = 'The media transcoder restarted 178 times. What failed?';
    const reading = readPromptLeaks(validBundle({ cases }));
    expect(reading.judged).toBe(2);
    expect(reading.leaks).toEqual([{ caseId: 'b', component: 'media-transcoder' }]);
    expect(describePromptLeaks(reading)).toBe(
      'prompt leakage: 1 of 2 case(s) name their root-cause component in the task text (b -> media-transcoder)',
    );
  });
});
