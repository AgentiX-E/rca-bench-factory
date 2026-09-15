import { SIGNAL_KINDS } from './ir/types.js';
import type { IrBundle, SignalKind } from './ir/types.js';
import { SCORE_TARGET_IDS } from './score/score.js';
import type { ScoreTargetId } from './score/score.js';

/**
 * Observability coverage report.
 *
 * The product must never invent signals an enterprise does not have. When a
 * modality is missing it says so, and quantifies how much evaluation capacity is
 * lost as a result.
 *
 * Loss coefficients come from the AIOps2025 modality ablation:
 *   metric 92.8%, log 56.2%, trace 43.0% marginal necessity.
 * The 19.4% figure for events is the share of RCA100 cases whose root-cause
 * lifecycle evidence is observable only in the Events modality.
 */

export const MODALITY_LOSS: Record<SignalKind, number> = {
  metric: 0.928,
  log: 0.562,
  trace: 0.43,
  event: 0.194,
  alert: 0.05,
  profile: 0.02,
};

/**
 * Signals each target needs before a dataset can be evaluated for it.
 *
 * Keyed by `ScoreTargetId` and checked against it, not by a shorter type of its
 * own. This report used to enumerate six targets while the rest of the product
 * used nine, so `openrca-2.0`, `rcaeval-re3` and `itbench` could not be reported
 * on at all - an operator was told a dataset was ready for six products and told
 * nothing about the other three.
 *
 * The requirement is about the *dataset*, not about what an exporter happens to
 * emit. Cloud-OpsBench's exporter writes `metadata.json` and no telemetry, so
 * its own bytes cannot express a missing log; but the benchmark's Digital Twin
 * layout does carry metrics, logs and alerts, and an agent evaluated on it needs
 * all three. Declaring `['metric']` here would have weakened the report to match
 * an artefact that was never the subject of the question.
 */
export const TARGET_REQUIREMENTS: Record<ScoreTargetId, SignalKind[]> = {
  'openrca-1.0': ['metric', 'trace'],
  'openrca-2.0': ['metric', 'trace'],
  'rcaeval-re1': ['metric'],
  'rcaeval-re2': ['metric', 'log'],
  'rcaeval-re3': ['metric', 'log', 'trace'],
  rca100: ['metric', 'log', 'trace', 'event', 'alert'],
  aiops2025: ['metric', 'log', 'trace'],
  'cloud-opsbench': ['metric', 'log', 'trace'],
  itbench: ['metric', 'log', 'trace'],
};

export interface TargetFeasibility {
  target: ScoreTargetId;
  status: 'ready' | 'degraded' | 'unavailable';
  /** Estimated share of cases lost because of missing modalities. */
  estimatedCaseLoss: number;
  missingSignals: SignalKind[];
}

export interface CoverageReport {
  coverage: Record<SignalKind, number>;
  feasibility: TargetFeasibility[];
}

/**
 * Coverage is measured per case: a modality counts as covered for a case when at
 * least one signal of that kind exists in the case window.
 */
export function computeCoverage(bundle: IrBundle): CoverageReport {
  const total = bundle.cases.length;
  const hits: Record<SignalKind, number> = {
    metric: 0,
    log: 0,
    trace: 0,
    event: 0,
    alert: 0,
    profile: 0,
  };

  for (const c of bundle.cases) {
    const kinds = new Set((bundle.signals[c.caseId] ?? []).map((s) => s.signal));
    for (const kind of SIGNAL_KINDS) {
      if (kinds.has(kind)) hits[kind] += 1;
    }
  }

  const coverage = Object.fromEntries(
    SIGNAL_KINDS.map((k) => [k, total === 0 ? 0 : hits[k] / total]),
  ) as Record<SignalKind, number>;

  const present = new Set(SIGNAL_KINDS.filter((k) => coverage[k] > 0));
  // Iterated over `SCORE_TARGET_IDS`, not over this module's own keys, so the
  // report's population is decided by the product rather than by whichever rows
  // this table happens to contain.
  const feasibility: TargetFeasibility[] = SCORE_TARGET_IDS.map((target) => {
    const required = TARGET_REQUIREMENTS[target];
    // A missing row is a bug, not a target that requires nothing: `undefined`
    // would throw here, and a target demanding no signal is always "ready",
    // which is the one answer a coverage report must never invent. Failing
    // loudly is what makes the omission a caught defect instead of a quieter
    // report - and it is why this needs no guard of its own to be honest.
    const missing = required.filter((k) => !present.has(k));
    const loss = missing.reduce((acc, k) => Math.max(acc, MODALITY_LOSS[k]), 0);
    const status: TargetFeasibility['status'] =
      missing.length === 0 ? 'ready' : required.every((k) => !present.has(k)) ? 'unavailable' : 'degraded';
    return { target, status, estimatedCaseLoss: Number(loss.toFixed(3)), missingSignals: missing };
  });

  return { coverage, feasibility };
}

/** Render a human-readable report; used by the CLI and by CI annotations. */
export function formatCoverageReport(report: CoverageReport): string {
  const lines: string[] = [];
  lines.push('Observability Coverage Report');
  for (const k of SIGNAL_KINDS) {
    lines.push(`  ${k.padEnd(8)}: ${(report.coverage[k] * 100).toFixed(1)}%`);
  }
  lines.push('  ' + '-'.repeat(46));
  lines.push('  Evaluability:');
  for (const f of report.feasibility) {
    const icon = f.status === 'ready' ? 'OK  ' : f.status === 'degraded' ? 'WARN' : 'N/A ';
    const loss = f.estimatedCaseLoss > 0 ? ` (case loss ~${(f.estimatedCaseLoss * 100).toFixed(1)}%)` : '';
    lines.push(`    [${icon}] ${f.target.padEnd(16)}${loss}`);
  }
  return lines.join('\n');
}
