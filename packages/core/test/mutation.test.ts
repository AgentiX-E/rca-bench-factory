import { describe, expect, it } from 'vitest';
import {
  caseFingerprint,
  checkG1Structural,
  checkG2Semantic,
  checkG3Validity,
  checkG4Solvability,
  checkG5AntiPollution,
  type BaselineOutcome,
} from '../src/gates/gates.js';
import type { IrBundle } from '../src/ir/types.js';
import { exportAioPs2025 } from '../src/export/aiops2025.js';
import { exportOpenRca } from '../src/export/openrca.js';
import { exportRcaEval } from '../src/export/rcaeval.js';
import { runOfficialRegression } from '../src/score/official.js';
import type { ScoreTargetId } from '../src/score/score.js';
import { validBundle, validCase } from './fixtures.js';

/**
 * Mutation suite.
 *
 * Purpose: prove that the gates themselves work. Each mutation injects a known
 * defect into an otherwise valid bundle and asserts that at least one gate
 * reports it. If a mutation escapes, the gates are not trustworthy and all
 * self-evolution activity must stop.
 *
 * Acceptance bar: 100% interception (15/15).
 */

const G1 = { requiredSignals: ['metric', 'log', 'trace', 'event', 'alert'], requiresQuery: true };
const SOLVED: BaselineOutcome[] = [{ caseId: 'case-001', method: 'baro', rankOfTruth: 1, topK: 5 }];

function allViolations(bundle: IrBundle, publicFingerprints?: Set<string>): Set<string> {
  const codes = new Set<string>();
  for (const r of [
    checkG1Structural(bundle, G1),
    checkG2Semantic(bundle),
    checkG3Validity(bundle),
    checkG4Solvability(bundle, SOLVED),
    checkG5AntiPollution(bundle, publicFingerprints ? { publicFingerprints } : {}),
  ]) {
    for (const v of r.violations) codes.add(v.code);
  }
  return codes;
}

interface Mutation {
  id: string;
  description: string;
  apply: (bundle: IrBundle) => IrBundle;
  /** Gate codes that count as a valid interception. */
  expected: string[];
  /** When true, the public fingerprint set is seeded with the mutated case itself. */
  seedFingerprint?: boolean;
}

const MUTATIONS: Mutation[] = [
  {
    id: 'MT-01',
    description: 'shift every timestamp by one hour',
    apply: (b) => {
      for (const sigs of Object.values(b.signals)) {
        for (const s of sigs) {
          s.timestamp = new Date(Date.parse(s.timestamp) + 3_600_000).toISOString().slice(0, 23) + 'Z';
        }
      }
      return b;
    },
    expected: ['SIGNAL_OUT_OF_WINDOW', 'WEAK_ANOMALY_SIGNAL'],
  },
  {
    id: 'MT-02',
    description: 'declare a bogus unit on a numeric checkpoint',
    apply: () => {
      const fc = validCase();
      fc.groundTruth.evidenceCheckpoints = [
        {
          checkpointId: 'cp-1',
          entityRef: 'service:default/order',
          comparator: '>',
          value: 250,
          unit: 'furlong',
          description: 'latency above 250 furlongs',
        },
      ];
      return validBundle({ cases: [fc] });
    },
    expected: ['UNKNOWN_UNIT'],
  },
  {
    id: 'MT-03',
    description: 'rename service.name to serviceName',
    apply: (b) => {
      for (const sigs of Object.values(b.signals)) {
        for (const s of sigs) {
          const name = s.resource['service.name'];
          delete s.resource['service.name'];
          (s.resource as Record<string, string>)['serviceName'] = name;
        }
      }
      return b;
    },
    expected: ['SIGNAL_OUT_OF_WINDOW', 'WEAK_ANOMALY_SIGNAL', 'MISSING_SERVICE_NAME'],
  },
  {
    id: 'MT-04',
    description: 'point the root cause at a non-existent entity',
    apply: () => {
      const fc = validCase();
      fc.groundTruth.rootCauseEntityId = 'service:default/does-not-exist';
      return validBundle({ cases: [fc] });
    },
    expected: ['UNRESOLVED_ROOT_CAUSE'],
  },
  {
    id: 'MT-05',
    description: 'fail to isolate the answer key',
    apply: () => validBundle({ cases: [validCase({ answerKeyIsolated: false })] }),
    expected: ['ANSWER_KEY_NOT_ISOLATED'],
  },
  {
    id: 'MT-06',
    description: 'leave a raw IP and an email in the payload',
    apply: () =>
      validBundle({ cases: [validCase({ query: 'reported by bob@example.com from 192.168.1.10' })] }),
    expected: ['SENSITIVE_DATA_PRESENT'],
  },
  {
    id: 'MT-07',
    description: 'delete the middle step of the causal chain',
    apply: () => {
      const fc = validCase();
      fc.groundTruth.causalChain = [
        {
          step: 1,
          fromEntityId: 'service:default/order',
          toEntityId: 'service:default/cart',
          mechanism: 'a',
          evidenceRefs: ['cp-1'],
        },
        {
          step: 3,
          fromEntityId: 'service:default/pay',
          toEntityId: 'service:default/cart',
          mechanism: 'c',
          evidenceRefs: ['cp-1'],
        },
      ];
      return validBundle({ cases: [fc] });
    },
    expected: ['CAUSAL_CHAIN_BREAK'],
  },
  {
    id: 'MT-08',
    description: 'move the injection time outside the observation window',
    apply: () => validBundle({ cases: [validCase({ injectTime: '2026-09-06T23:00:00.000Z' })] }),
    expected: ['INJECT_TIME_OUT_OF_WINDOW'],
  },
  {
    id: 'MT-09',
    description: 'drop the metric series so the anomaly disappears',
    apply: (b) =>
      validBundle({
        signals: { 'case-001': (b.signals['case-001'] ?? []).filter((s) => s.payload.kind !== 'metric') },
      }),
    expected: ['MISSING_SIGNAL'],
  },
  {
    id: 'MT-10',
    description: 'label every case as the easiest difficulty',
    apply: () =>
      validBundle({
        cases: Array.from({ length: 10 }, (_, i) => validCase({ caseId: `c-${i}`, difficulty: 'L1' })),
      }),
    expected: ['DIFFICULTY_SKEWED_EASY'],
  },
  {
    id: 'MT-11',
    description: 'attach a numeric checkpoint with no unit at all',
    apply: () => {
      const fc = validCase();
      fc.groundTruth.evidenceCheckpoints = [
        {
          checkpointId: 'cp-1',
          entityRef: 'service:default/order',
          comparator: '>',
          value: 0.9,
          description: 'cpu ratio',
        },
      ];
      return validBundle({ cases: [fc] });
    },
    expected: ['NUMERIC_CHECKPOINT_WITHOUT_UNIT'],
  },
  {
    id: 'MT-12',
    description: 'remove the topology edge that reaches the root cause',
    apply: (b) => validBundle({ graph: { entities: b.graph.entities, edges: [] } }),
    expected: ['CAUSAL_CHAIN_BREAK', 'UNRESOLVED_ROOT_CAUSE', 'CAUSAL_HOP_NOT_IN_TOPOLOGY'],
  },
  {
    id: 'MT-13',
    description: 'duplicate a case inside the set',
    apply: (b) => {
      const sigs = b.signals['case-001'] ?? [];
      return validBundle({
        cases: [validCase({ caseId: 'a' }), validCase({ caseId: 'c' })],
        signals: { a: sigs, c: sigs },
      });
    },
    expected: ['DUPLICATE_CASE'],
  },
  {
    id: 'MT-14',
    description: 'import a public benchmark case verbatim',
    seedFingerprint: true,
    apply: () => validBundle({ cases: [validCase({ system: 'Bank' })] }),
    expected: ['PUBLIC_SET_CONTAMINATION'],
  },
  {
    id: 'MT-15',
    description: 'blank out the root cause entity',
    apply: () => {
      const fc = validCase();
      fc.groundTruth.rootCauseEntityId = '';
      return validBundle({ cases: [fc] });
    },
    expected: ['EMPTY_ROOT_CAUSE', 'UNRESOLVED_ROOT_CAUSE'],
  },
];

function runMutation(m: Mutation): Set<string> {
  const bundle = m.apply(validBundle());
  const fingerprints = m.seedFingerprint
    ? new Set(bundle.cases.map((c) => caseFingerprint(c)))
    : undefined;
  return allViolations(bundle, fingerprints);
}

describe('mutation suite', () => {
  it('reports a clean baseline before any mutation is applied', () => {
    expect([...allViolations(validBundle())]).toEqual([]);
  });

  it('contains the full set of declared mutations', () => {
    expect(MUTATIONS.map((m) => m.id)).toEqual([
      'MT-01',
      'MT-02',
      'MT-03',
      'MT-04',
      'MT-05',
      'MT-06',
      'MT-07',
      'MT-08',
      'MT-09',
      'MT-10',
      'MT-11',
      'MT-12',
      'MT-13',
      'MT-14',
      'MT-15',
    ]);
  });

  for (const m of MUTATIONS) {
    it(`intercepts ${m.id}: ${m.description}`, () => {
      const codes = runMutation(m);
      const intercepted = m.expected.some((code) => codes.has(code));
      expect(
        intercepted,
        `expected one of [${m.expected.join(', ')}] but the gates reported [${[...codes].join(', ')}]`,
      ).toBe(true);
    });
  }

  it('achieves a 100% interception rate across the whole suite', () => {
    const results = MUTATIONS.map((m) => {
      const codes = runMutation(m);
      return { id: m.id, intercepted: m.expected.some((c) => codes.has(c)) };
    });
    const escaped = results.filter((r) => !r.intercepted).map((r) => r.id);
    expect(escaped, `escaped mutations: ${escaped.join(', ')}`).toEqual([]);
    expect(results.filter((r) => r.intercepted).length).toBe(MUTATIONS.length);
  });
});

// ---------------------------------------------------------------------------
// Export-level mutations
//
// The gate mutations above prove the gates reject a bad *bundle*. These prove
// the official-metric regression rejects a bad *export*: every one of them is a
// corruption a real pipeline could commit (a reworded template, a renamed
// directory, a truncated artefact) and each has to turn a passing regression
// into a failing one. A scorer that still reports 1.0 after the answer key has
// been destroyed is worse than no scorer at all.
// ---------------------------------------------------------------------------

interface ExportMutation {
  id: string;
  description: string;
  target: ScoreTargetId;
  apply: (files: Record<string, string>) => Record<string, string>;
}

const EXPORT_MUTATIONS: ExportMutation[] = [
  {
    id: 'MT-16',
    description: 'reword the OpenRCA scoring_points so the official regexes recover nothing',
    target: 'openrca-1.0',
    apply: (files) =>
      Object.fromEntries(
        Object.entries(files).map(([path, content]) =>
          path.endsWith('/groundtruth.csv')
            ? [
                path,
                content
                  .replace(/root cause occurrence time is within/g, 'the incident started near')
                  .replace(/predicted root cause component is/g, 'the culprit component is')
                  .replace(/predicted root cause reason is/g, 'the culprit reason is'),
              ]
            : [path, content],
        ),
      ),
  },
  {
    id: 'MT-17',
    description: 'drop the instance index from the RCAEval case directory name',
    target: 'rcaeval-re2',
    apply: (files) =>
      Object.fromEntries(
        Object.entries(files).map(([path, content]) => [path.replace(/(RE2-[^-]+-[A-Za-z0-9]+)_\d+\//, '$1/'), content]),
      ),
  },
  {
    id: 'MT-18',
    description: 'corrupt every AIOps2025 ground truth record so none of them parse',
    target: 'aiops2025',
    apply: (files) => ({ ...files, 'groundtruth.jsonl': (files['groundtruth.jsonl'] ?? '').replace(/^\{/gm, '<') }),
  },
];

function exportFor(target: ScoreTargetId): Record<string, string> {
  if (target === 'openrca-1.0') return exportOpenRca(validBundle()).files;
  if (target === 'rcaeval-re2') return exportRcaEval(validBundle(), 'RE2').files;
  return exportAioPs2025(validBundle()).files;
}

describe('export mutation suite', () => {
  it('passes on the unmutated export of every mutated target', () => {
    for (const m of EXPORT_MUTATIONS) {
      expect(runOfficialRegression(m.target, exportFor(m.target)).passed, m.id).toBe(true);
    }
  });

  it('contains the full set of declared export mutations', () => {
    expect(EXPORT_MUTATIONS.map((m) => m.id)).toEqual(['MT-16', 'MT-17', 'MT-18']);
  });

  for (const m of EXPORT_MUTATIONS) {
    it(`intercepts ${m.id}: ${m.description}`, () => {
      const mutated = m.apply(exportFor(m.target));
      const report = runOfficialRegression(m.target, mutated);
      expect(report.passed, `${m.id} escaped: ${report.failures.join('; ')}`).toBe(false);
    });
  }
});
