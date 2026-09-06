import { describe, expect, it } from 'vitest';
import {
  caseFingerprint,
  checkG1Structural,
  checkG2Semantic,
  checkG3Validity,
  checkG4Solvability,
  checkG5AntiPollution,
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
  { caseId: 'case-001', method: 'baro', rankOfTruth: 1, topK: 5 },
];

describe('statistics helpers', () => {
  it('computes mean and sample stddev', () => {
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

  it('flags an evidence reference that points at a missing checkpoint', () => {
    const fc = validCase();
    fc.groundTruth.evidenceCheckpoints = [];
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'UNRESOLVED_EVIDENCE_REF' }),
    );
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

describe('G4 solvability and difficulty', () => {
  it('passes when a baseline locates the root cause', () => {
    expect(checkG4Solvability(validBundle(), SOLVED).status).toBe('passed');
  });

  it('flags a case no baseline can solve', () => {
    const unsolved: BaselineOutcome[] = [{ caseId: 'case-001', method: 'baro', rankOfTruth: null, topK: 5 }];
    expect(checkG4Solvability(validBundle(), unsolved).violations).toContainEqual(
      expect.objectContaining({ code: 'UNSOLVABLE_CASE' }),
    );
  });

  it('flags a rank outside top-K', () => {
    const out: BaselineOutcome[] = [{ caseId: 'case-001', method: 'baro', rankOfTruth: 9, topK: 5 }];
    expect(checkG4Solvability(validBundle(), out).violations).toContainEqual(
      expect.objectContaining({ code: 'UNSOLVABLE_CASE' }),
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
    expect(checkG4Solvability(b, cases.map((c) => ({ caseId: c.caseId, method: 'baro', rankOfTruth: 1, topK: 5 }))).violations,
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
        cases.map((c) => ({ caseId: c.caseId, method: 'baro', rankOfTruth: 1, topK: 5 })),
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
});
