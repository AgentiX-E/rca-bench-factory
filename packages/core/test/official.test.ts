import { describe, expect, it } from 'vitest';
import { exportOpenRca, buildScoringPoints, hasRootCauseElements, openRcaTaskIndex } from '../src/export/openrca.js';
import { exportOpenRca2 } from '../src/export/openrca2.js';
import { exportRcaEval } from '../src/export/rcaeval.js';
import { exportRca100 } from '../src/export/rca100.js';
import { exportAioPs2025 } from '../src/export/aiops2025.js';
import { exportCloudOpsBench } from '../src/export/cloudopsbench.js';
import { exportItBench } from '../src/export/itbench.js';
import {
  OFFICIAL_FACETS,
  OFFICIAL_METRICS,
  mutatePrediction,
  officialCaseFailures,
  officialMetric,
  openRcaTimeMatches,
  oraclePrediction,
  parseOpenRcaPrediction,
  parseOpenRcaScoringPoints,
  parseRcaEvalDirectory,
  readOfficialGroundTruth,
  readOfficialSubmission,
  runAllOfficialRegressions,
  runOfficialRegression,
  scoreOfficial,
} from '../src/score/official.js';
import { SCORE_TARGET_IDS } from '../src/score/score.js';
import type { OfficialFacet, OfficialPrediction, ScoreTargetId } from '../src/index.js';
import { validBundle, validCase } from './fixtures.js';

/**
 * Official-metric scorer tests.
 *
 * Every case runs against real exporter output; nothing is hand-written except
 * the deliberately broken inputs. The suite asserts three things that a
 * structural check cannot:
 *
 *  1. the exported answer key can be scored 1.0 by the published rule;
 *  2. every facet the rule declares is sensitive to being perturbed, so the
 *     metric is not vacuously returning a perfect score;
 *  3. every facet the rule ignores is inert, so the declared facet list is
 *     neither too wide nor too narrow.
 */

type FileMap = Record<string, string>;

const exportsByTarget = (): Record<ScoreTargetId, FileMap> => ({
  'openrca-1.0': exportOpenRca(validBundle()).files,
  'openrca-2.0': exportOpenRca2(validBundle()).files,
  'rcaeval-re1': exportRcaEval(validBundle(), 'RE1').files,
  'rcaeval-re2': exportRcaEval(validBundle(), 'RE2').files,
  'rcaeval-re3': exportRcaEval(codeBundle(), 'RE3').files,
  rca100: exportRca100(validBundle()).files,
  aiops2025: exportAioPs2025(validBundle()).files,
  'cloud-opsbench': exportCloudOpsBench(validBundle()).files,
  itbench: exportItBench(validBundle()).files,
});

/** RE3 admits code-level faults only, so it needs its own bundle. */
function codeBundle() {
  const fc = validCase({ fault: { type: 'cpu', category: 'code', injectionMethod: 'chaos-mesh', parameters: {} } });
  return validBundle({ cases: [fc] });
}

function scoreWith(target: ScoreTargetId, files: FileMap, predictions: OfficialPrediction[]) {
  return scoreOfficial(target, files, predictions);
}

function oracleFor(target: ScoreTargetId, files: FileMap): OfficialPrediction[] {
  return readOfficialGroundTruth(target, files).map(oraclePrediction);
}

// ---------------------------------------------------------------------------
// The OpenRCA rules, transcribed from main/evaluate.py
// ---------------------------------------------------------------------------

describe('parseOpenRcaScoringPoints', () => {
  it('recovers all three elements from a task_7 block', () => {
    const points = parseOpenRcaScoringPoints(
      buildScoringPoints('task_7', {
        datetime: '2026-09-06 08:10:00',
        component: 'order',
        reason: 'CPU saturation on the order service',
      }),
    );
    expect(points.components).toEqual(['order']);
    expect(points.reasons).toEqual(['CPU saturation on the order service']);
    expect(points.times).toEqual(['2026-09-06 08:10:00']);
  });

  it('recovers only the component from a task_3 block', () => {
    const points = parseOpenRcaScoringPoints(
      buildScoringPoints('task_3', { datetime: '', component: 'order', reason: '' }),
    );
    expect(points.components).toEqual(['order']);
    expect(points.reasons).toEqual([]);
    expect(points.times).toEqual([]);
  });

  it('recovers the numbered form of a multi-fault block', () => {
    const text = 'The 1-th predicted root cause component is order\nThe 2-th predicted root cause component is cart\n';
    expect(parseOpenRcaScoringPoints(text).components).toEqual(['order', 'cart']);
  });

  it('returns nothing for a block that does not use the official wording', () => {
    const points = parseOpenRcaScoringPoints('the root cause is order');
    expect(points.components).toEqual([]);
    expect(points.reasons).toEqual([]);
    expect(points.times).toEqual([]);
  });
});

describe('openRcaTimeMatches', () => {
  it('accepts an exact match', () => {
    expect(openRcaTimeMatches('2026-09-06 08:10:00', '2026-09-06 08:10:00')).toBe(true);
  });

  it('accepts a 60 second offset, the official tolerance', () => {
    expect(openRcaTimeMatches('2026-09-06 08:11:00', '2026-09-06 08:10:00')).toBe(true);
  });

  it('rejects a 61 second offset', () => {
    expect(openRcaTimeMatches('2026-09-06 08:11:01', '2026-09-06 08:10:00')).toBe(false);
  });

  it('rejects a value that is not in the official format', () => {
    expect(openRcaTimeMatches('2026-09-06T08:10:00Z', '2026-09-06 08:10:00')).toBe(false);
    expect(openRcaTimeMatches('', '2026-09-06 08:10:00')).toBe(false);
  });
});

describe('openRcaTaskIndex', () => {
  const at = (datetime: string, component: string, reason: string) => ({ datetime, component, reason });

  it('maps the eight element combinations onto the official task ids', () => {
    expect(openRcaTaskIndex(at('t', 'c', 'r'))).toBe('task_7');
    expect(openRcaTaskIndex(at('t', 'c', ''))).toBe('task_5');
    expect(openRcaTaskIndex(at('t', '', 'r'))).toBe('task_4');
    expect(openRcaTaskIndex(at('', 'c', 'r'))).toBe('task_6');
    expect(openRcaTaskIndex(at('t', '', ''))).toBe('task_1');
    expect(openRcaTaskIndex(at('', '', 'r'))).toBe('task_2');
    expect(openRcaTaskIndex(at('', 'c', ''))).toBe('task_3');
    expect(openRcaTaskIndex(at('', '', ''))).toBe('task_1');
  });

  it('treats whitespace-only values as absent', () => {
    expect(openRcaTaskIndex({ datetime: '   ', component: 'order', reason: '   ' })).toBe('task_3');
  });
});

describe('hasRootCauseElements', () => {
  it('is false only when all three elements are blank', () => {
    expect(hasRootCauseElements({ datetime: '', component: '', reason: '' })).toBe(false);
    expect(hasRootCauseElements({ datetime: 't', component: '', reason: '' })).toBe(true);
    expect(hasRootCauseElements({ datetime: '', component: 'c', reason: '' })).toBe(true);
    expect(hasRootCauseElements({ datetime: '', component: '', reason: 'r' })).toBe(true);
  });
});

describe('buildScoringPoints', () => {
  it('renders the official wording and terminates every line', () => {
    const text = buildScoringPoints('task_5', { datetime: '2026-09-06 08:10:00', component: 'order', reason: '' });
    expect(text).toBe(
      'The only root cause occurrence time is within 1 minutes (i.e., <=1min) of 2026-09-06 08:10:00\n' +
        'The only predicted root cause component is order\n',
    );
  });

  it('honours a multi-fault index', () => {
    const text = buildScoringPoints('task_3', { datetime: '', component: 'cart', reason: '' }, '2-th');
    expect(text).toBe('The 2-th predicted root cause component is cart\n');
  });
});

describe('parseOpenRcaPrediction', () => {
  it('reads the three elements out of the exported prediction cell', () => {
    const files = exportOpenRca(validBundle()).files;
    const prediction = parseOpenRcaPrediction(
      JSON.parse(JSON.stringify(files['order-prod/record.csv'])).toString(),
    );
    expect(prediction.component).toBe('');
    expect(prediction.reason).toBe('');
  });

  it('reads the nested "1" object', () => {
    const raw = JSON.stringify({ '1': { 'root cause component': 'order', 'root cause reason': 'r', 'root cause occurrence datetime': 'd' } });
    expect(parseOpenRcaPrediction(raw)).toMatchObject({ component: 'order', reason: 'r', occurredAt: 'd' });
  });

  it('falls back to a flat object', () => {
    const raw = JSON.stringify({ 'root cause component': 'order' });
    expect(parseOpenRcaPrediction(raw).component).toBe('order');
  });

  it('returns empty values for input that is not a prediction at all', () => {
    expect(parseOpenRcaPrediction('not json').component).toBe('');
    expect(parseOpenRcaPrediction('[1,2,3]').component).toBe('');
  });
});

describe('parseRcaEvalDirectory', () => {
  it('parses the official directory naming', () => {
    expect(parseRcaEvalDirectory('RE2-order-cpu_1')).toEqual({
      suite: 'RE2',
      service: 'order',
      fault: 'cpu',
      instance: '1',
    });
  });

  it('keeps a service whose name contains a hyphen', () => {
    expect(parseRcaEvalDirectory('RE1-ts-order-service-cpu_3')?.service).toBe('ts-order-service');
  });

  it('rejects a name with no instance index', () => {
    expect(parseRcaEvalDirectory('RE2-order-cpu')).toBeUndefined();
  });

  it('rejects a name with no suite prefix', () => {
    expect(parseRcaEvalDirectory('order-cpu_1')).toBeUndefined();
  });

  it('rejects a name with no fault token', () => {
    expect(parseRcaEvalDirectory('RE2-order_1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Metric specifications
// ---------------------------------------------------------------------------

describe('OFFICIAL_METRICS', () => {
  it('declares a metric for every score target', () => {
    for (const target of SCORE_TARGET_IDS) {
      expect(OFFICIAL_METRICS[target], target).toBeDefined();
    }
  });

  it('only declares facets that exist', () => {
    for (const target of SCORE_TARGET_IDS) {
      for (const facet of OFFICIAL_METRICS[target].facets) {
        expect(OFFICIAL_FACETS, `${target}/${facet}`).toContain(facet);
      }
    }
  });

  it('cites a source for every rule', () => {
    for (const target of SCORE_TARGET_IDS) {
      expect(OFFICIAL_METRICS[target].source.length, target).toBeGreaterThan(0);
      expect(OFFICIAL_METRICS[target].quote.length, target).toBeGreaterThan(0);
    }
  });

  it('marks only the two targets without a published closed form as derived', () => {
    const derived = SCORE_TARGET_IDS.filter((t) => OFFICIAL_METRICS[t].provenance === 'derived');
    expect(derived).toEqual(['openrca-2.0', 'itbench']);
  });

  it('scores the ranked candidate list for RCAEval and nothing else', () => {
    expect(OFFICIAL_METRICS['rcaeval-re2'].facets).toEqual(['ranks']);
    expect(OFFICIAL_METRICS.aiops2025.facets).toContain('traceLength');
  });
});

describe('officialMetric', () => {
  it('resolves the same spec as the table for every target', () => {
    for (const target of SCORE_TARGET_IDS) {
      expect(officialMetric(target), target).toBe(OFFICIAL_METRICS[target]);
    }
  });

  it('identifies, names and states the rule for every target', () => {
    for (const target of SCORE_TARGET_IDS) {
      const metric = officialMetric(target);
      expect(metric.id.length, target).toBeGreaterThan(0);
      expect(metric.name.length, target).toBeGreaterThan(0);
      expect(metric.formula.length, target).toBeGreaterThan(0);
      expect(metric.facets.length, target).toBeGreaterThan(0);
    }
  });
});

describe('officialCaseFailures', () => {
  const grid = (mutations: Array<{ facet: OfficialFacet; role: 'scored' | 'unscored'; degraded: boolean }>) => ({
    caseId: 'case-001',
    oracleScore: 1,
    mutations: mutations.map((m) => ({ ...m, score: m.degraded ? 0 : 1 })),
  });

  it('accepts a case whose oracle is perfect and whose grid is exact', () => {
    const entry = grid([
      { facet: 'component', role: 'scored', degraded: true },
      { facet: 'traceLength', role: 'unscored', degraded: false },
    ]);
    expect(officialCaseFailures(entry)).toEqual([]);
  });

  it('rejects an oracle that does not score 1.0', () => {
    expect(officialCaseFailures({ caseId: 'c', oracleScore: 0.5, mutations: [] })).toEqual([
      'case c: the oracle prediction scored 0.5, expected 1',
    ]);
  });

  it('rejects a scored facet that survives its own mutation', () => {
    const entry = grid([{ facet: 'component', role: 'scored', degraded: false }]);
    expect(officialCaseFailures(entry)).toEqual([
      "case case-001: mutating 'component' did not lower the score (1)",
    ]);
  });

  it('rejects an undeclared facet that moves the score', () => {
    const entry = grid([{ facet: 'reason', role: 'unscored', degraded: true }]);
    expect(officialCaseFailures(entry)).toEqual([
      "case case-001: mutating 'reason' lowered the score but the rule ignores it",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Oracle regression across all nine targets
// ---------------------------------------------------------------------------

describe('runOfficialRegression', () => {
  it('passes for all nine targets on real exporter output', () => {
    const reports = runAllOfficialRegressions(exportsByTarget());
    expect(reports).toHaveLength(9);
    for (const report of reports) {
      expect(report.caseCount, report.target).toBeGreaterThan(0);
      expect(report.failures, `${report.target}: ${report.failures.join('; ')}`).toEqual([]);
      expect(report.status, report.target).toBe('passed');
      expect(report.oraclePerfect, report.target).toBe(true);
      expect(report.mutationsDegrade, report.target).toBe(true);
      expect(report.unscoredFacetsInert, report.target).toBe(true);
      expect(report.evidenceComplete, report.target).toBe(true);
    }
  });

  it('scores 100 on every headline when the answer key is submitted', () => {
    for (const [target, files] of Object.entries(exportsByTarget())) {
      const report = scoreOfficial(target as ScoreTargetId, files);
      expect(report.final, `${target} -> ${JSON.stringify(report.breakdown)}`).toBe(100);
      expect(report.accuracy, target).toBe(1);
    }
  });

  it('matches the official OpenRCA evaluator on the oracle and on every mutation', () => {
    // These four numbers were produced by `main/evaluate.evaluate()` from
    // microsoft/OpenRCA running on this repository's own export.
    const files = exportsByTarget()['openrca-1.0'];
    const oracle = oracleFor('openrca-1.0', files)[0]!;
    const scoreOf = (prediction: OfficialPrediction) =>
      Math.round(scoreWith('openrca-1.0', files, [prediction]).cases[0]!.score * 100) / 100;

    expect(scoreOf(oracle)).toBe(1);
    expect(scoreOf(mutatePrediction(oracle, 'component'))).toBe(0.67);
    expect(scoreOf(mutatePrediction(oracle, 'reason'))).toBe(0.67);
    expect(scoreOf(mutatePrediction(oracle, 'occurredAt'))).toBe(0.67);
  });

  it('still scores 1.0 when the predicted time is within the 60 second tolerance', () => {
    const files = exportsByTarget()['openrca-1.0'];
    const oracle = oracleFor('openrca-1.0', files)[0]!;
    const nudged: OfficialPrediction = { ...oracle, occurredAt: '2026-09-06 08:10:30' };
    expect(scoreWith('openrca-1.0', files, [nudged]).cases[0]!.score).toBe(1);
  });

  it('fails when the OpenRCA ground-truth artefact is missing', () => {
    const files = exportsByTarget()['openrca-1.0'];
    delete files['order-prod/groundtruth.csv'];
    const report = runOfficialRegression('openrca-1.0', files);
    expect(report.status).toBe('failed');
    expect(report.failures.join(' ')).toContain('no cases were exported');
  });

  it('fails when the scoring points were reworded out of the official grammar', () => {
    const files = exportsByTarget()['openrca-1.0'];
    files['order-prod/groundtruth.csv'] =
      'task_index,instruction,scoring_points\ntask_7,find it,"the root cause is order"\n';
    const report = runOfficialRegression('openrca-1.0', files);
    expect(report.oraclePerfect).toBe(false);
    expect(report.failures.join(' ')).toContain('the oracle prediction scored 0');
  });

  it('reports a documented empty export as skipped, not passed', () => {
    const files = exportRcaEval(validBundle(), 'RE3').files;
    const skipped = runOfficialRegression('rcaeval-re3', files, { allowEmptyReason: 'RE3 targets code-level faults only' });
    expect(skipped.status).toBe('skipped');
    expect(skipped.skipReason).toBe('RE3 targets code-level faults only');
    expect(skipped.passed).toBe(true);

    const failed = runOfficialRegression('rcaeval-re3', files);
    expect(failed.status).toBe('failed');
    expect(failed.passed).toBe(false);
    expect(failed.failures[0]).toContain('no cases were exported');
  });

  it('fails when a facet the metric ignores still moves the score', () => {
    // `component` is not in RCAEval's facet list; if the rule started reading
    // it, this regression would report the inconsistency instead of ignoring it.
    const files = exportsByTarget()['rcaeval-re2'];
    const report = runOfficialRegression('rcaeval-re2', files);
    const componentMutation = report.cases[0]!.mutations.find((m) => m.facet === 'component');
    expect(componentMutation?.role).toBe('unscored');
    expect(componentMutation?.degraded).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Per-target rule behaviour
// ---------------------------------------------------------------------------

describe('RCAEval AC@k', () => {
  const files = () => exportRcaEval(validBundle(), 'RE2').files;

  it('scores AC@1 when the ground truth is ranked first', () => {
    const oracle = oracleFor('rcaeval-re2', files())[0]!;
    const report = scoreWith('rcaeval-re2', files(), [oracle]);
    expect(report.breakdown.ac1).toBe(1);
    expect(report.breakdown.avg5).toBe(1);
  });

  it('scores AC@1 = 0 and AC@2 = 1 when the ground truth is ranked second', () => {
    const oracle = oracleFor('rcaeval-re2', files())[0]!;
    const ranked: OfficialPrediction = { ...oracle, ranks: ['cart', 'order'] };
    const report = scoreWith('rcaeval-re2', files(), [ranked]);
    expect(report.breakdown.ac1).toBe(0);
    expect(report.breakdown.ac2).toBe(1);
    expect(report.breakdown.avg5).toBe(0.8);
  });

  it('ignores candidates beyond the fifth rank, as the official evaluator does', () => {
    const oracle = oracleFor('rcaeval-re2', files())[0]!;
    const ranked: OfficialPrediction = { ...oracle, ranks: ['a', 'b', 'c', 'd', 'e', 'order'] };
    expect(scoreWith('rcaeval-re2', files(), [ranked]).breakdown.ac5).toBe(0);
  });
});

describe('RCA100 Final_B', () => {
  const files = () => exportRca100(validBundle()).files;

  it('gives full entity credit for an exact UModel entity match', () => {
    const report = scoreWith('rca100', files(), oracleFor('rca100', files()));
    expect(report.breakdown.entity).toBe(1);
    expect(report.final).toBe(100);
  });

  it('gives partial entity credit for a topologically adjacent entity', () => {
    const oracle = oracleFor('rca100', files())[0]!;
    const adjacent: OfficialPrediction = { ...oracle, component: 'cart' };
    const report = scoreWith('rca100', files(), [adjacent]);
    expect(report.breakdown.entity).toBe(0.5);
    expect(report.final).toBeLessThan(100);
  });

  it('gives no entity credit for an unrelated entity', () => {
    const oracle = oracleFor('rca100', files())[0]!;
    const report = scoreWith('rca100', files(), [{ ...oracle, component: 'unrelated-candidate' }]);
    expect(report.breakdown.entity).toBe(0);
  });

  it('weights the three pillars 0.4 / 0.3 / 0.3', () => {
    const oracle = oracleFor('rca100', files())[0]!;
    const wrongFaultOnly: OfficialPrediction = { ...oracle, faultType: 'unrelated-candidate' };
    const report = scoreWith('rca100', files(), [wrongFaultOnly]);
    // Only the 0.3 fault pillar is lost.
    expect(report.accuracy).toBe(0.7);
    expect(report.final).toBe(70);
  });
});

describe('AIOps2025 Final_A', () => {
  const files = () => exportAioPs2025(validBundle()).files;

  it('scores the oracle 100 with every pillar at 1', () => {
    const report = scoreWith('aiops2025', files(), oracleFor('aiops2025', files()));
    expect(report.breakdown).toMatchObject({ la: 1, ta: 1, explainability: 1, efficiency: 1 });
    expect(report.final).toBe(100);
  });

  it('gives Type Accuracy full credit for a keyword hit anywhere in the first 20 words', () => {
    const oracle = oracleFor('aiops2025', files())[0]!;
    const verbose: OfficialPrediction = { ...oracle, reason: 'the cpu is saturated and that is the reason' };
    expect(scoreWith('aiops2025', files(), [verbose]).breakdown.ta).toBe(1);
  });

  it('ignores a keyword that appears after the 20 word truncation', () => {
    const oracle = oracleFor('aiops2025', files())[0]!;
    const padded = `${'filler '.repeat(20)}cpu`;
    const report = scoreWith('aiops2025', files(), [{ ...oracle, reason: padded }]);
    expect(report.breakdown.ta).toBe(0);
  });

  it('penalises a long reasoning trace through the Efficiency term', () => {
    const oracle = oracleFor('aiops2025', files())[0]!;
    const verbose: OfficialPrediction = { ...oracle, traceWords: 500 };
    const report = scoreWith('aiops2025', files(), [verbose]);
    expect(report.breakdown.efficiency).toBe(0);
    expect(report.final).toBeLessThan(100);
  });

  it('counts evidence coverage over the union of key metrics and key observations', () => {
    const oracle = oracleFor('aiops2025', files())[0]!;
    const report = scoreWith('aiops2025', files(), [oracle]);
    expect(report.breakdown.evidencePoints).toBe(1);
    expect(report.breakdown.evidenceHits).toBe(1);
  });

  it('flags a case whose ground truth declares no evidence points', () => {
    const files = exportAioPs2025(validBundle()).files;
    files['groundtruth.jsonl'] = JSON.stringify({
      uuid: 'case-001',
      fault_category: 'resource',
      fault_type: 'cpu',
      instance_type: 'service',
      service: 'order',
      instance: 'order',
      start_time: '2026-09-06T00:00:00.000Z',
      end_time: '2026-09-06T00:20:00.000Z',
      key_observations: { log: [], metric: [], trace: [] },
      key_metrics: [],
      fault_description: 'CPU saturation on the order service',
    });
    const report = runOfficialRegression('aiops2025', files);
    expect(report.evidenceComplete).toBe(false);
    expect(report.failures.join(' ')).toContain('no evidence points');
  });

  it('scores pod-level faults against the pod identifier, not the service', () => {
    const files = exportAioPs2025(validBundle()).files;
    files['groundtruth.jsonl'] = JSON.stringify({
      uuid: 'case-001',
      fault_category: 'resource',
      fault_type: 'cpu',
      instance_type: 'pod',
      service: 'order',
      instance: 'order-pod-7',
      start_time: '2026-09-06T00:00:00.000Z',
      end_time: '2026-09-06T00:20:00.000Z',
      key_observations: { log: [], metric: [], trace: [] },
      key_metrics: ['order|cpu_usage'],
      fault_description: 'CPU saturation on the order service',
    });
    const gt = readOfficialGroundTruth('aiops2025', files)[0]!;
    expect(gt.component).toBe('order-pod-7');
  });
});

describe('Cloud-OpsBench JRA', () => {
  const files = () => exportCloudOpsBench(validBundle()).files;

  it('requires the component and the fault type together', () => {
    const oracle = oracleFor('cloud-opsbench', files())[0]!;
    const report = scoreWith('cloud-opsbench', files(), [oracle]);
    expect(report.breakdown).toMatchObject({ jra: 1, ca: 1, fa: 1 });

    const wrongType = scoreWith('cloud-opsbench', files(), [{ ...oracle, faultType: 'unrelated-candidate' }]);
    expect(wrongType.breakdown.jra).toBe(0);
    expect(wrongType.breakdown.ca).toBe(1);
    expect(wrongType.breakdown.fa).toBe(0);
  });

  it('reads the faulty component from fault_object and the type from root_cause', () => {
    const gt = readOfficialGroundTruth('cloud-opsbench', files())[0]!;
    expect(gt.component).toBe('order');
    expect(gt.faultType).toBe('cpu');
    expect(gt.faultDescriptions).toEqual(['Performance_Fault']);
  });
});

describe('ITBench pass@1', () => {
  const files = () => exportItBench(validBundle()).files;

  it('takes the root cause from the head of the propagation chain', () => {
    const gt = readOfficialGroundTruth('itbench', files())[0]!;
    expect(gt.component).toBe('service:default/order');
    expect(gt.chain).toEqual(['service:default/order->service:default/cart']);
    expect(gt.evidence).toEqual(['order|cpu_usage']);
  });

  it('scores the oracle 100 and drops when the chain is lost', () => {
    const oracle = oracleFor('itbench', files())[0]!;
    expect(scoreWith('itbench', files(), [oracle]).breakdown.passAt1).toBe(1);
    const noChain = scoreWith('itbench', files(), [{ ...oracle, chain: [] }]);
    expect(noChain.breakdown.passAt1).toBe(0);
    expect(noChain.breakdown.chainMatch).toBe(0);
  });
});

describe('OpenRCA 2.0 PAVE', () => {
  const files = () => exportOpenRca2(validBundle()).files;

  it('scores the oracle 1.0 across all four declared facets', () => {
    const oracle = oracleFor('openrca-2.0', files())[0]!;
    const report = scoreWith('openrca-2.0', files(), [oracle]);
    expect(report.accuracy).toBe(1);
    expect(report.cases[0]!.facets.map((f) => f.facet).sort()).toEqual(['chain', 'component', 'evidence', 'faultType']);
  });

  it('loses a quarter of the score per broken facet', () => {
    const oracle = oracleFor('openrca-2.0', files())[0]!;
    for (const facet of ['component', 'faultType', 'chain', 'evidence'] as const) {
      const report = scoreWith('openrca-2.0', files(), [mutatePrediction(oracle, facet)]);
      expect(report.accuracy, facet).toBe(0.75);
    }
  });
});

// ---------------------------------------------------------------------------
// Submissions and mutation mechanics
// ---------------------------------------------------------------------------

describe('readOfficialSubmission', () => {
  it('uses the exported record.csv as the OpenRCA submission', () => {
    const files = exportsByTarget()['openrca-1.0'];
    const submission = readOfficialSubmission('openrca-1.0', files);
    expect(submission).toHaveLength(1);
    expect(submission[0]!.component).toBe('order');
    expect(submission[0]!.reason).toBe('CPU saturation on the order service');
  });

  it('falls back to the oracle for targets with no published submission file', () => {
    const files = exportsByTarget().rca100;
    expect(readOfficialSubmission('rca100', files)).toEqual(oracleFor('rca100', files));
  });
});

describe('mutatePrediction', () => {
  const base: OfficialPrediction = {
    component: 'order',
    faultType: 'cpu',
    reason: 'CPU saturation',
    occurredAt: '2026-09-06 08:10:00',
    ranks: ['order'],
    chain: ['order->cart'],
    evidence: ['order|cpu_usage'],
    traceWords: 5,
  };

  it('replaces exactly one facet and leaves the rest untouched', () => {
    for (const facet of OFFICIAL_FACETS) {
      const mutated = mutatePrediction(base, facet);
      const changed = OFFICIAL_FACETS.filter((f) => {
        if (f === 'traceLength') return mutated.traceWords !== base.traceWords;
        if (f === 'ranks' || f === 'chain' || f === 'evidence') {
          return JSON.stringify(mutated[f]) !== JSON.stringify(base[f]);
        }
        return mutated[f] !== base[f];
      });
      expect(changed, facet).toEqual([facet]);
    }
  });

  it('shifts the timestamp by one hour, past the official 60 second tolerance', () => {
    expect(mutatePrediction(base, 'occurredAt').occurredAt).toBe('2026-09-06 09:10:00');
  });

  it('marks a value it cannot parse as shifted rather than silently matching', () => {
    expect(mutatePrediction({ ...base, occurredAt: 'not a timestamp' }, 'occurredAt').occurredAt).toBe(
      'not a timestamp-shifted',
    );
  });

  it('inflates the trace length so the Efficiency term collapses', () => {
    expect(mutatePrediction(base, 'traceLength').traceWords).toBe(500);
  });
});

describe('scoreOfficial', () => {
  it('reports zero cases and a zero score for an empty export', () => {
    const report = scoreOfficial('itbench', {});
    expect(report.caseCount).toBe(0);
    expect(report.accuracy).toBe(0);
    expect(report.final).toBe(0);
  });

  it('scores a missing submission as fully wrong rather than crashing', () => {
    const files = exportsByTarget().itbench;
    const report = scoreOfficial('itbench', files, []);
    expect(report.cases).toHaveLength(1);
    expect(report.cases[0]!.score).toBe(0);
  });

  it('keeps the metric provenance on the report', () => {
    const report = scoreOfficial('openrca-1.0', exportsByTarget()['openrca-1.0']);
    expect(report.metric.provenance).toBe('official');
    expect(report.metric.source).toContain('OpenRCA');
  });
});

// ---------------------------------------------------------------------------
// Degraded exports
//
// Every reader below is fed a file map that a real but damaged export could
// actually produce: a missing sibling, a field of the wrong type, a JSON body
// that is not an object. The contract under test is that the scorer degrades to
// an empty or partial answer key instead of throwing - a benchmark harness that
// crashes on one corrupted artefact cannot be run against a real dataset.
// ---------------------------------------------------------------------------

describe('official - degraded exports', () => {
  const openrcaGtCsv = (rows: string): FileMap => ({
    'order-prod/groundtruth.csv': `task_index,instruction,scoring_points\n${rows}`,
  });

  describe('OpenRCA 1.0', () => {
    it('falls back to positional row ids when record.csv was not exported alongside', () => {
      const files = openrcaGtCsv('task_7,"what broke?","The only predicted root cause component is order"');
      expect(readOfficialGroundTruth('openrca-1.0', files)[0]!.caseId).toBe('row-1');
    });

    it('reads a row with no scoring points as an empty answer key', () => {
      const gt = readOfficialGroundTruth('openrca-1.0', openrcaGtCsv('task_7,"what broke?",'))[0]!;
      expect([gt.component, gt.reason, gt.occurredAt]).toEqual(['', '', '']);
    });

    it('reads a groundtruth.csv with no scoring_points column as an empty answer key', () => {
      const files: FileMap = { 'order-prod/groundtruth.csv': 'task_index,instruction\ntask_7,what broke?' };
      expect(readOfficialGroundTruth('openrca-1.0', files)[0]!.component).toBe('');
    });

    it('accepts a prediction JSON without the "1" wrapper', () => {
      const pred = parseOpenRcaPrediction('{"root cause component":"order"}');
      expect(pred.component).toBe('order');
      expect(pred.reason).toBe('');
    });

    it('reads an unparsable prediction as an empty one', () => {
      const pred = parseOpenRcaPrediction('not json');
      expect([pred.component, pred.reason, pred.occurredAt]).toEqual(['', '', '']);
    });
  });

  describe('OpenRCA 2.0', () => {
    const files = (body: string): FileMap => ({ 'cases/case-1/causal_path.json': body });

    it('reads a causal_path.json that is not an object as an empty answer key', () => {
      const gt = readOfficialGroundTruth('openrca-2.0', files('[]'))[0]!;
      expect([gt.component, gt.faultType, gt.chain, gt.evidence]).toEqual(['', '', [], []]);
    });

    it('ignores a causal_path that is not an array', () => {
      const gt = readOfficialGroundTruth(
        'openrca-2.0',
        files(JSON.stringify({ root_cause: { component: 'order', fault_type: 'cpu' }, causal_path: 'nope' })),
      )[0]!;
      expect(gt.component).toBe('order');
      expect(gt.chain).toEqual([]);
    });

    it('skips steps that are not objects, have unreadable endpoints or carry malformed evidence', () => {
      const gt = readOfficialGroundTruth(
        'openrca-2.0',
        files(
          JSON.stringify({
            root_cause: { component: 'order', fault_type: 'cpu' },
            causal_path: [
              'nope',
              { from_entity: 'order', to_entity: 'cart' },
              { from_entity: { name: 'order' }, to_entity: { name: 'cart' }, evidence: 'nope' },
              {
                from_entity: { name: 'cart' },
                to_entity: { name: 'db' },
                evidence: [3, { signal_ref: '' }, { signal_ref: 'metric:cpu' }],
              },
            ],
          }),
        ),
      )[0]!;
      // The step whose evidence is not an array still contributes its chain hop;
      // only the step with unreadable endpoints is dropped entirely.
      expect(gt.chain).toEqual(['order->cart', 'cart->db']);
      expect(gt.evidence).toEqual(['metric:cpu']);
    });
  });

  describe('RCAEval', () => {
    it('skips a case directory whose name carries no suite label', () => {
      const files: FileMap = { 'RE9-order-cpu_1/inject_time.txt': '1780000000' };
      expect(readOfficialGroundTruth('rcaeval-re2', files)).toEqual([]);
    });
  });

  describe('RCA100', () => {
    const files = (topology: unknown, gt?: unknown): FileMap => {
      const out: FileMap = { 'cases/case-1/topology.json': JSON.stringify(topology) };
      if (gt !== undefined) out['answer_key/case-1.gt.json'] = JSON.stringify(gt);
      return out;
    };

    it('reads a topology that is not an object as an empty answer key', () => {
      const gt = readOfficialGroundTruth('rca100', files('nope'))[0]!;
      expect([gt.component, gt.faultType, gt.adjacent, gt.chain]).toEqual(['', '', [], []]);
    });

    it('skips entities and edges that are not objects', () => {
      const gt = readOfficialGroundTruth(
        'rca100',
        files(
          {
            entities: [7, { id: 'svc:order', name: 'order' }, { id: '', name: 'x' }, { id: 'y', name: '' }],
            edges: [7, { src: 'svc:order', dst: 'svc:cart' }, { src: 'svc:other', dst: 'svc:unrelated' }],
          },
          { root_cause_entities: ['order'] },
        ),
      )[0]!;
      expect(gt.component).toBe('order');
      // `svc:cart` has no name in the id map, so it cannot be credited, and the
      // second edge touches neither endpoint of the root cause.
      expect(gt.adjacent).toEqual([]);
    });

    it('credits a neighbour reached from either direction of an edge', () => {
      const topology = {
        entities: [
          { id: 'svc:order', name: 'order' },
          { id: 'svc:cart', name: 'cart' },
        ],
        edges: [{ src: 'svc:cart', dst: 'svc:order' }],
      };
      const gt = readOfficialGroundTruth('rca100', files(topology, { root_cause_entities: ['order'] }))[0]!;
      expect(gt.adjacent).toEqual(['cart']);
    });

    it('reads reasoning steps and checkpoints, ignoring malformed ones', () => {
      const gt = readOfficialGroundTruth(
        'rca100',
        files(
          {},
          {
            root_cause_entities: ['order'],
            root_cause_types: ['cpu'],
            raw_ground_truth: JSON.stringify({
              reasoning: {
                steps: [
                  'nope',
                  { from_entity: 'order', to_entity: '', checkpoints: 'nope' },
                  { from_entity: 'order', to_entity: 'cart', checkpoints: [3, { signal_ref: '' }, { signal_ref: 'm1' }] },
                ],
              },
            }),
          },
        ),
      )[0]!;
      expect(gt.chain).toEqual(['order->cart']);
      expect(gt.evidence).toEqual(['m1']);
    });

    it('ignores a raw_ground_truth that is not JSON or has no reasoning block', () => {
      const notJson = readOfficialGroundTruth(
        'rca100',
        files({}, { root_cause_entities: ['order'], raw_ground_truth: 'nope' }),
      )[0]!;
      expect(notJson.chain).toEqual([]);

      const noReasoning = readOfficialGroundTruth(
        'rca100',
        files({}, { root_cause_entities: ['order'], raw_ground_truth: JSON.stringify({}) }),
      )[0]!;
      expect(noReasoning.chain).toEqual([]);
    });

    it('reads an answer key that names no root cause as an unscorable case', () => {
      const files2 = files({ entities: [{ id: 'svc:order', name: 'order' }] }, {});
      const gt = readOfficialGroundTruth('rca100', files2)[0]!;
      expect([gt.component, gt.faultType]).toEqual(['', '']);
    });

    it('scores a case with no chain and no checkpoints as fully covered by an empty prediction', () => {
      const gt = readOfficialGroundTruth('rca100', files({}, { root_cause_entities: ['order'] }))[0]!;
      expect(gt.chain).toEqual([]);
      expect(gt.evidence).toEqual([]);
      // `rateOf` treats an empty denominator as complete, so an oracle scores 1.
      expect(scoreOfficial('rca100', files({}, { root_cause_entities: ['order'] })).cases[0]!.score).toBe(1);
    });
  });

  describe('AIOps2025', () => {
    const files = (...objects: unknown[]): FileMap => ({
      'groundtruth.jsonl': objects.map((o) => (typeof o === 'string' ? o : JSON.stringify(o))).join('\n'),
    });

    it('returns no cases when groundtruth.jsonl is absent', () => {
      expect(readOfficialGroundTruth('aiops2025', {})).toEqual([]);
    });

    it('skips blank lines and lines that do not parse', () => {
      const gts = readOfficialGroundTruth(
        'aiops2025',
        files('', '   ', 'not json', { uuid: 'c1', service: 'order', fault_type: 'cpu', instance_type: 'service' }),
      );
      expect(gts).toHaveLength(1);
      expect(gts[0]!.component).toBe('order');
    });

    it('scores a pod-level fault on the pod id and ignores malformed observations', () => {
      const gt = readOfficialGroundTruth(
        'aiops2025',
        files({
          uuid: 'c2',
          instance_type: 'pod',
          instance: 'order-pod-1',
          service: 'order',
          fault_type: 'cpu',
          fault_description: 'CPU saturation',
          key_metrics: ['cpu_usage'],
          key_observations: { log: 'nope', metric: [5, { ref: '' }, { ref: 'm1' }], trace: [] },
        }),
      )[0]!;
      expect(gt.component).toBe('order-pod-1');
      expect(gt.evidence).toEqual(['m1', 'cpu_usage']);
    });

    it('reads key_observations that is not an object as no observations at all', () => {
      const gt = readOfficialGroundTruth(
        'aiops2025',
        files({ uuid: 'c3', service: 'order', key_observations: 'nope', key_metrics: [] }),
      )[0]!;
      expect(gt.evidence).toEqual([]);
    });

    it('treats a corpus with no evidence points at all as fully explained', () => {
      const files2 = files({
        uuid: 'c4',
        service: 'order',
        fault_type: 'cpu',
        fault_description: 'CPU saturation',
        key_metrics: [],
        key_observations: {},
      });
      const report = scoreWith('aiops2025', files2, oracleFor('aiops2025', files2));
      // Exp. has no denominator, so the protocol awards the full 0.1 weight
      // rather than dividing by zero.
      expect(report.breakdown.evidencePoints).toBe(0);
      expect(report.breakdown.explainability).toBe(1);
    });
  });

  describe('Cloud-OpsBench', () => {
    const files = (body: string): FileMap => ({ 'cases/case-1/metadata.json': body });

    it('reads a metadata.json that is not an object as an empty answer key', () => {
      const gt = readOfficialGroundTruth('cloud-opsbench', files('"nope"'))[0]!;
      expect([gt.component, gt.faultType, gt.faultDescriptions]).toEqual(['', '', []]);
    });

    it('reads a metadata.json with no result block as an empty answer key', () => {
      const gt = readOfficialGroundTruth('cloud-opsbench', files('{}'))[0]!;
      expect([gt.component, gt.faultType]).toEqual(['', '']);
      expect(scoreOfficial('cloud-opsbench', files('{}')).cases[0]!.score).toBe(0);
    });
  });

  describe('ITBench', () => {
    const files = (body: string): FileMap => ({ 'scenarios/case-1/scenario.json': body });

    it('reads a scenario.json that is not an object as an empty answer key', () => {
      const gt = readOfficialGroundTruth('itbench', files('7'))[0]!;
      expect([gt.component, gt.faultType, gt.chain, gt.evidence]).toEqual(['', '', [], []]);
    });

    it('falls back to the diagnosis entity list when no chain step is usable', () => {
      const gt = readOfficialGroundTruth(
        'itbench',
        files(
          JSON.stringify({
            scenario_class: 'cpu',
            scenario_groundtruth: {
              diagnosis: {
                fault_propagation_chain: ['nope', { from_entity: '', to_entity: 'x' }],
                entities: ['order'],
                fault_conditions: ['nope', { signal_ref: '' }, { signal_ref: 'm1' }],
              },
            },
          }),
        ),
      )[0]!;
      expect(gt.component).toBe('order');
      expect(gt.chain).toEqual([]);
      expect(gt.evidence).toEqual(['m1']);
    });

    it('ignores a diagnosis that is not an object and an empty entity list', () => {
      const notAnObject = readOfficialGroundTruth(
        'itbench',
        files(JSON.stringify({ scenario_groundtruth: { diagnosis: 'nope' } })),
      )[0]!;
      expect(notAnObject.component).toBe('');

      const noEntities = readOfficialGroundTruth(
        'itbench',
        files(JSON.stringify({ scenario_groundtruth: { diagnosis: { fault_propagation_chain: [], entities: [] } } })),
      )[0]!;
      expect(noEntities.component).toBe('');
    });
  });
});

describe('official - partial submissions', () => {
  it('scores every target with an empty submission as fully wrong, never as crashing', () => {
    for (const target of SCORE_TARGET_IDS) {
      const report = scoreOfficial(target, exportsByTarget()[target], []);
      expect(report.caseCount, target).toBeGreaterThan(0);
      expect(report.accuracy, target).toBe(0);
      expect(report.final, target).toBe(0);
    }
  });
});

describe('runOfficialRegression - failure reporting', () => {
  it('reports an oracle that cannot score 1.0 and a mutation that does not degrade', () => {
    const files: FileMap = {
      'order-prod/groundtruth.csv':
        'task_index,instruction,scoring_points\n' +
        'task_7,"what broke?","The only root cause occurrence time is within 1 minutes (i.e., <=1min) of not-a-timestamp\n' +
        'The only predicted root cause component is order\n"',
      'order-prod/record.csv': 'instruction_id,prediction\ncase-001,"{}"\n',
    };
    const report = runOfficialRegression('openrca-1.0', files);
    expect(report.passed).toBe(false);
    expect(report.oraclePerfect).toBe(false);
    expect(report.mutationsDegrade).toBe(false);
    expect(report.failures.join(' ')).toMatch(/the oracle prediction scored/);
    expect(report.failures.join(' ')).toMatch(/did not lower the score/);
  });

  it('runs every target even when the export map is missing entries', () => {
    const reports = runAllOfficialRegressions({ 'openrca-1.0': exportsByTarget()['openrca-1.0'] }, { allowEmptyReason: 'partial export' });
    expect(reports).toHaveLength(SCORE_TARGET_IDS.length);
    expect(reports[0]!.status).toBe('passed');
    expect(reports.slice(1).every((r) => r.status === 'skipped')).toBe(true);
  });
});
