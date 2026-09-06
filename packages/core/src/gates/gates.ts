import type {
  EntityGraph,
  FaultCase,
  GateResult,
  GateViolation,
  IrBundle,
  SignalKind,
  TelemetrySignal,
} from '../ir/types.js';
import { findDanglingEdgeRefs, findInvalidRelations, indexGraph, resolveEntityRef } from '../entity/graph.js';
import { isoUtcToEpochMs, isWithinWindow } from '../util/time.js';
import { dimensionOf } from '../util/unit.js';

/**
 * Quality gates.
 *
 * G1 structural  - does the export satisfy the target contract? (deterministic, 100%)
 * G2 semantic    - are references resolvable, times monotonic, units consistent?
 * G3 validity    - is the anomaly signal actually strong and time-aligned?
 * G4 solvability - can a baseline method solve it, and is the difficulty distribution sane?
 * G5 anti-pollution - no PII, no answer leakage, no duplication against public sets.
 *
 * A gate never throws. It returns violations so the whole batch can be graded.
 */

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function gate(gateId: GateResult['gateId'], violations: GateViolation[]): GateResult {
  if (violations.length === 0) return { gateId, status: 'passed', violations: [] };
  return { gateId, status: 'failed', violations };
}

// ─── G1 · structural contract ──────────────────────────────────────────────

export interface G1Options {
  /** Signal kinds the target format requires. */
  requiredSignals: SignalKind[];
  /** True when the target requires a natural-language query (OpenRCA-style). */
  requiresQuery: boolean;
}

export function checkG1Structural(bundle: IrBundle, options: G1Options): GateResult {
  const v: GateViolation[] = [];

  for (const c of bundle.cases) {
    const sigs = bundle.signals[c.caseId] ?? [];

    if (c.caseId === '') v.push({ code: 'EMPTY_CASE_ID', message: 'caseId is empty' });
    if (c.injectTime === '' || !ISO_UTC.test(c.injectTime)) {
      v.push({
        code: 'BAD_INJECT_TIME',
        message: `injectTime must be canonical UTC ISO-8601, got '${c.injectTime}'`,
        fieldPath: `${c.caseId}.injectTime`,
      });
    }
    if (!ISO_UTC.test(c.window.start) || !ISO_UTC.test(c.window.end)) {
      v.push({
        code: 'BAD_WINDOW',
        message: 'window.start and window.end must be canonical UTC ISO-8601',
        fieldPath: `${c.caseId}.window`,
      });
    }
    if (c.groundTruth.rootCauseEntityId === '') {
      v.push({
        code: 'EMPTY_ROOT_CAUSE',
        message: 'groundTruth.rootCauseEntityId is empty',
        fieldPath: `${c.caseId}.groundTruth.rootCauseEntityId`,
      });
    }
    if (options.requiresQuery && (c.query === undefined || c.query.trim() === '')) {
      v.push({
        code: 'MISSING_QUERY',
        message: 'target format requires a natural-language query',
        fieldPath: `${c.caseId}.query`,
      });
    }
    for (const kind of options.requiredSignals) {
      if (!sigs.some((s) => s.signal === kind)) {
        v.push({
          code: 'MISSING_SIGNAL',
          message: `required signal '${kind}' is absent`,
          fieldPath: `${c.caseId}.signals.${kind}`,
        });
      }
    }

    // Without service.name a signal cannot be attributed to anything, so this is
    // a structural defect rather than a cosmetic one.
    for (const s of sigs) {
      if (s.resource['service.name'] === undefined || s.resource['service.name'] === '') {
        v.push({
          code: 'MISSING_SERVICE_NAME',
          message: `a ${s.signal} signal carries no service.name`,
          fieldPath: `${c.caseId}.signals`,
        });
        break;
      }
    }
  }
  return gate('G1', v);
}

/**
 * Undirected reachability over the topology.
 *
 * A causal hop asserts that a fault travelled from one entity to another. When
 * the topology contains no path between them, the assertion is unsupported -
 * either the topology is incomplete or the chain is fabricated.
 */
function buildAdjacency(graph: EntityGraph): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    const sa = adj.get(a) ?? new Set<string>();
    sa.add(b);
    adj.set(a, sa);
    const sb = adj.get(b) ?? new Set<string>();
    sb.add(a);
    adj.set(b, sb);
  };
  for (const e of graph.edges) link(e.from, e.to);
  return adj;
}

function isConnected(adj: Map<string, Set<string>>, from: string, to: string): boolean {
  if (from === to) return true;
  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    for (const next of adj.get(node) ?? []) {
      if (next === to) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

// ─── G2 · semantic consistency ─────────────────────────────────────────────

export function checkG2Semantic(bundle: IrBundle): GateResult {
  const v: GateViolation[] = [];
  const index = indexGraph(bundle.graph);
  const adjacency = buildAdjacency(bundle.graph);

  for (const issue of findDanglingEdgeRefs(bundle.graph)) {
    v.push({ code: 'DANGLING_EDGE_REF', message: `${issue.where} references '${issue.ref}' which is not an entity` });
  }
  for (const issue of findInvalidRelations(bundle.graph)) {
    v.push({ code: 'INVALID_RELATION', message: `unknown relation '${issue.ref}'` });
  }

  for (const c of bundle.cases) {
    const rootRef = c.groundTruth.rootCauseEntityId;
    if (rootRef !== '' && resolveEntityRef(rootRef, index) === null) {
      v.push({
        code: 'UNRESOLVED_ROOT_CAUSE',
        message: `rootCauseEntityId '${rootRef}' does not resolve`,
        fieldPath: `${c.caseId}.groundTruth.rootCauseEntityId`,
      });
    }
    for (const cp of c.groundTruth.evidenceCheckpoints ?? []) {
      if (resolveEntityRef(cp.entityRef, index) === null) {
        v.push({
          code: 'UNRESOLVED_CHECKPOINT_REF',
          message: `checkpoint '${cp.checkpointId}' references unknown entity '${cp.entityRef}'`,
          fieldPath: `${c.caseId}.groundTruth.evidenceCheckpoints`,
        });
      }
      if (typeof cp.value === 'number' && cp.unit === undefined) {
        v.push({
          code: 'NUMERIC_CHECKPOINT_WITHOUT_UNIT',
          message: `checkpoint '${cp.checkpointId}' has a numeric value but no unit`,
          fieldPath: `${c.caseId}.groundTruth.evidenceCheckpoints.${cp.checkpointId}.unit`,
        });
      }
    }

    const steps = c.groundTruth.causalChain ?? [];
    const ordered = [...steps].sort((a, b) => a.step - b.step);
    for (let i = 0; i < ordered.length; i += 1) {
      const step = ordered[i] as (typeof ordered)[number];
      if (resolveEntityRef(step.fromEntityId, index) === null) {
        v.push({
          code: 'UNRESOLVED_CAUSAL_FROM',
          message: `causal step ${step.step} has unresolvable fromEntityId '${step.fromEntityId}'`,
        });
      }
      if (resolveEntityRef(step.toEntityId, index) === null) {
        v.push({
          code: 'UNRESOLVED_CAUSAL_TO',
          message: `causal step ${step.step} has unresolvable toEntityId '${step.toEntityId}'`,
        });
      }
      if (i > 0) {
        const prev = ordered[i - 1] as (typeof ordered)[number];
        if (prev.toEntityId !== step.fromEntityId) {
          v.push({
            code: 'CAUSAL_CHAIN_BREAK',
            message: `causal chain is broken between step ${prev.step} and step ${step.step}`,
            fieldPath: `${c.caseId}.groundTruth.causalChain`,
          });
        }
      }
      const from = resolveEntityRef(step.fromEntityId, index);
      const to = resolveEntityRef(step.toEntityId, index);
      if (from !== null && to !== null && !isConnected(adjacency, from, to)) {
        v.push({
          code: 'CAUSAL_HOP_NOT_IN_TOPOLOGY',
          message: `causal step ${step.step} asserts propagation with no path in the topology`,
          fieldPath: `${c.caseId}.groundTruth.causalChain`,
        });
      }
    }
    for (const step of ordered) {
      for (const ref of step.evidenceRefs) {
        const ids = new Set((c.groundTruth.evidenceCheckpoints ?? []).map((cp) => cp.checkpointId));
        if (!ids.has(ref)) {
          v.push({
            code: 'UNRESOLVED_EVIDENCE_REF',
            message: `causal step ${step.step} references unknown checkpoint '${ref}'`,
          });
        }
      }
    }

    // injectTime must sit inside the observation window
    if (ISO_UTC.test(c.injectTime) && ISO_UTC.test(c.window.start) && ISO_UTC.test(c.window.end)) {
      if (!isWithinWindow(c.injectTime, c.window.start, c.window.end)) {
        v.push({
          code: 'INJECT_TIME_OUT_OF_WINDOW',
          message: 'injectTime falls outside the declared window',
          fieldPath: `${c.caseId}.injectTime`,
        });
      }
      if (isoUtcToEpochMs(c.window.start) > isoUtcToEpochMs(c.window.end)) {
        v.push({ code: 'INVERTED_WINDOW', message: 'window.start is after window.end' });
      }
    }

    // every signal must belong to an entity that actually exists
    for (const s of bundle.signals[c.caseId] ?? []) {
      const svc = s.resource['service.name'];
      if (svc !== undefined && svc !== '' && resolveEntityRef(svc, index) === null) {
        v.push({
          code: 'UNRESOLVED_SERVICE_NAME',
          message: `signal references service '${svc}' which is not in the entity graph`,
          fieldPath: `${c.caseId}.signals`,
        });
        break;
      }
    }

    // monotonic timestamps per (entity, metric)
    const byKey = new Map<string, number>();
    for (const s of bundle.signals[c.caseId] ?? []) {
      if (s.payload.kind !== 'metric') continue;
      const key = `${s.resource['service.name']}|${s.payload.name}`;
      const t = ISO_UTC.test(s.timestamp) ? isoUtcToEpochMs(s.timestamp) : Number.NaN;
      if (Number.isNaN(t)) {
        v.push({ code: 'BAD_SIGNAL_TIMESTAMP', message: `signal timestamp '${s.timestamp}' is not canonical UTC` });
        continue;
      }
      const prev = byKey.get(key);
      if (prev !== undefined && t < prev) {
        v.push({ code: 'NON_MONOTONIC_TIMESTAMP', message: `timestamps for '${key}' go backwards` });
      }
      byKey.set(key, t);
    }

    // numeric checkpoints must carry a unit that exists in the conversion table
    for (const cp of c.groundTruth.evidenceCheckpoints ?? []) {
      if (typeof cp.value === 'number' && cp.unit !== undefined) {
        try {
          dimensionOf(cp.unit);
        } catch {
          v.push({
            code: 'UNKNOWN_UNIT',
            message: `checkpoint '${cp.checkpointId}' uses unknown unit '${cp.unit}'`,
          });
        }
      }
    }
  }

  return gate('G2', v);
}

// ─── G3 · signal validity ──────────────────────────────────────────────────

export interface G3Options {
  /** Minimum |Z| for a metric to count as a valid anomaly signal. */
  minAbsZ?: number;
  /** Consecutive samples required above the threshold. */
  minSustainedSamples?: number;
  /** Maximum tolerated quarantine ratio for the source dataset. */
  maxQuarantineRatio?: number;
  /** Observed quarantine ratio for the source dataset. */
  quarantineRatio?: number;
}

/** Two-sided Z-score with a floor on sigma to avoid dividing by zero. */
export function zScore(value: number, mean: number, stddev: number, epsilon = 1e-6): number {
  return (value - mean) / Math.max(stddev, epsilon);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * Count how many consecutive samples at the tail of `series` exceed `minAbsZ`
 * against the baseline formed by the head of the series.
 */
export function sustainedAnomalySamples(
  series: number[],
  baselineSize: number,
  minAbsZ: number,
): number {
  if (baselineSize <= 0 || baselineSize >= series.length) return 0;
  const baseline = series.slice(0, baselineSize);
  const mu = mean(baseline);
  const sigma = stddev(baseline);
  let streak = 0;
  for (let i = series.length - 1; i >= baselineSize; i -= 1) {
    if (Math.abs(zScore(series[i] as number, mu, sigma)) >= minAbsZ) streak += 1;
    else break;
  }
  return streak;
}

export function checkG3Validity(bundle: IrBundle, options: G3Options = {}): GateResult {
  const v: GateViolation[] = [];
  const minAbsZ = options.minAbsZ ?? 2.0;
  const minSustained = options.minSustainedSamples ?? 3;
  const maxQuarantine = options.maxQuarantineRatio ?? 0.05;

  if (options.quarantineRatio !== undefined && options.quarantineRatio > maxQuarantine) {
    v.push({
      code: 'QUARANTINE_RATIO_EXCEEDED',
      message: `quarantine ratio ${options.quarantineRatio.toFixed(3)} exceeds ${maxQuarantine}`,
    });
  }

  for (const c of bundle.cases) {
    const sigs = bundle.signals[c.caseId] ?? [];
    const metrics = sigs.filter(
      (s): s is TelemetrySignal & { payload: Extract<TelemetrySignal['payload'], { kind: 'metric' }> } =>
        s.payload.kind === 'metric',
    );

    if (metrics.length === 0) continue;

    // group by (entity, metric name) and look for at least one sustained anomaly
    const grouped = new Map<string, number[]>();
    const t0 = ISO_UTC.test(c.injectTime) ? isoUtcToEpochMs(c.injectTime) : Number.NaN;
    for (const s of metrics) {
      const t = ISO_UTC.test(s.timestamp) ? isoUtcToEpochMs(s.timestamp) : Number.NaN;
      if (Number.isNaN(t) || Number.isNaN(t0)) continue;
      if (t >= t0) continue; // baseline only
      const key = `${s.resource['service.name']}|${s.payload.name}`;
      const arr = grouped.get(key) ?? [];
      arr.push(s.payload.value);
      grouped.set(key, arr);
    }

    const postByKey = new Map<string, number[]>();
    for (const s of metrics) {
      const t = ISO_UTC.test(s.timestamp) ? isoUtcToEpochMs(s.timestamp) : Number.NaN;
      if (Number.isNaN(t) || Number.isNaN(t0) || t < t0) continue;
      const key = `${s.resource['service.name']}|${s.payload.name}`;
      const arr = postByKey.get(key) ?? [];
      arr.push(s.payload.value);
      postByKey.set(key, arr);
    }

    let anyStrong = false;
    for (const [key, baseline] of grouped) {
      const post = postByKey.get(key) ?? [];
      if (post.length === 0) continue;
      const mu = mean(baseline);
      const sigma = stddev(baseline);
      let streak = 0;
      let best = 0;
      for (const x of post) {
        if (Math.abs(zScore(x, mu, sigma)) >= minAbsZ) {
          streak += 1;
          best = Math.max(best, streak);
        } else {
          streak = 0;
        }
      }
      if (best >= minSustained) {
        anyStrong = true;
        break;
      }
    }
    if (!anyStrong) {
      v.push({
        code: 'WEAK_ANOMALY_SIGNAL',
        message: `no metric sustains |Z| >= ${minAbsZ} for ${minSustained} samples after injection`,
        fieldPath: `${c.caseId}.signals.metric`,
      });
    }

    // every signal must sit inside the declared window
    for (const s of sigs) {
      if (!ISO_UTC.test(s.timestamp)) continue;
      if (!isWithinWindow(s.timestamp, c.window.start, c.window.end)) {
        v.push({
          code: 'SIGNAL_OUT_OF_WINDOW',
          message: `signal at ${s.timestamp} falls outside the case window`,
          fieldPath: `${c.caseId}.signals`,
        });
        break;
      }
    }
  }

  return gate('G3', v);
}

// ─── G4 · solvability and difficulty ───────────────────────────────────────

export interface BaselineOutcome {
  caseId: string;
  method: string;
  /** Rank of the true root cause in the method output; 1 means top-1. */
  rankOfTruth: number | null;
  topK: number;
}

export interface G4Options {
  /** Require at least this many baselines to solve the case. */
  minSolvers?: number;
  /** Maximum share of L1 (easiest) cases tolerated in the set. */
  maxL1Share?: number;
  /** Minimum share of L4 (hardest) cases required in the set. */
  minL4Share?: number;
  /**
   * Minimum number of graded cases before the difficulty distribution is checked.
   * A distribution cannot be asserted from a handful of samples, so small sets
   * are exempt rather than reported as skewed.
   */
  distributionMinCases?: number;
}

export function checkG4Solvability(
  bundle: IrBundle,
  outcomes: BaselineOutcome[],
  options: G4Options = {},
): GateResult {
  const v: GateViolation[] = [];
  const minSolvers = options.minSolvers ?? 1;
  const maxL1Share = options.maxL1Share ?? 0.2;
  const minL4Share = options.minL4Share ?? 0.1;
  const distributionMinCases = options.distributionMinCases ?? 10;

  const byCase = new Map<string, BaselineOutcome[]>();
  for (const o of outcomes) {
    const arr = byCase.get(o.caseId) ?? [];
    arr.push(o);
    byCase.set(o.caseId, arr);
  }

  for (const c of bundle.cases) {
    const solved = (byCase.get(c.caseId) ?? []).filter(
      (o) => o.rankOfTruth !== null && o.rankOfTruth >= 1 && o.rankOfTruth <= o.topK,
    );
    if (solved.length < minSolvers) {
      v.push({
        code: 'UNSOLVABLE_CASE',
        message: `only ${solved.length} baseline(s) locate the root cause within top-K`,
        fieldPath: `${c.caseId}`,
      });
    }
  }

  const graded = bundle.cases.filter((c) => c.difficulty !== undefined);
  if (graded.length >= distributionMinCases) {
    const l1 = graded.filter((c) => c.difficulty === 'L1').length / graded.length;
    const l4 = graded.filter((c) => c.difficulty === 'L4').length / graded.length;
    if (l1 > maxL1Share) {
      v.push({
        code: 'DIFFICULTY_SKEWED_EASY',
        message: `L1 share ${l1.toFixed(3)} exceeds the ${maxL1Share} ceiling`,
      });
    }
    if (l4 < minL4Share) {
      v.push({
        code: 'DIFFICULTY_SKEWED_HARD',
        message: `L4 share ${l4.toFixed(3)} is below the ${minL4Share} floor`,
      });
    }
  }

  return gate('G4', v);
}

// ─── G5 · anti-pollution and de-identification ─────────────────────────────

export interface G5Options {
  /** Regular expressions whose presence indicates PII or a leaked secret. */
  sensitivePatterns?: RegExp[];
  /** Fingerprints of public benchmark cases used to detect outright copying. */
  publicFingerprints?: Set<string>;
  /** When true, the answer key must be physically separated from the task payload. */
  requireAnswerKeyIsolation?: boolean;
}

export const DEFAULT_SENSITIVE_PATTERNS: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/, // IPv4
  /\b1[3-9]\d{9}\b/, // CN mobile number
  /\b(?:\d{17}[\dXx]|\d{15})\b/, // CN id card
  /\b(?:sk|ghp|github_pat)[-_][A-Za-z0-9]{16,}\b/, // common secret prefixes
];

/** Fingerprint used to detect duplicated cases inside a set. */
export function caseFingerprint(c: FaultCase): string {
  const seed = [
    c.system,
    c.fault.type,
    c.injectTime,
    c.groundTruth.rootCauseEntityId,
    c.window.start,
    c.window.end,
  ].join('|');
  // FNV-1a, stable across platforms and runtimes.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function checkG5AntiPollution(bundle: IrBundle, options: G5Options = {}): GateResult {
  const v: GateViolation[] = [];
  const patterns = options.sensitivePatterns ?? DEFAULT_SENSITIVE_PATTERNS;
  const requireIsolation = options.requireAnswerKeyIsolation ?? true;

  const seen = new Map<string, string>();
  for (const c of bundle.cases) {
    const fp = caseFingerprint(c);
    const prior = seen.get(fp);
    if (prior !== undefined) {
      v.push({
        code: 'DUPLICATE_CASE',
        message: `case '${c.caseId}' duplicates '${prior}' (fingerprint ${fp})`,
        fieldPath: `${c.caseId}`,
      });
    } else {
      seen.set(fp, c.caseId);
    }

    if (options.publicFingerprints?.has(fp)) {
      v.push({
        code: 'PUBLIC_SET_CONTAMINATION',
        message: `case '${c.caseId}' matches a public benchmark fingerprint`,
        fieldPath: `${c.caseId}`,
      });
    }

    if (requireIsolation && c.answerKeyIsolated !== true) {
      v.push({
        code: 'ANSWER_KEY_NOT_ISOLATED',
        message: 'answer key must be stored physically separate from the task payload',
        fieldPath: `${c.caseId}.answerKeyIsolated`,
      });
    }

    const haystack = [
      c.query ?? '',
      c.groundTruth.rootCauseReason,
      c.groundTruth.rootCauseComponent,
      ...(bundle.signals[c.caseId] ?? [])
        .map((s) => (s.payload.kind === 'log' ? s.payload.body : ''))
        .slice(0, 200),
    ].join('\n');

    for (const re of patterns) {
      const m = re.exec(haystack);
      if (m) {
        v.push({
          code: 'SENSITIVE_DATA_PRESENT',
          message: `sensitive pattern ${re.source} matched (sample redacted)`,
          fieldPath: `${c.caseId}`,
        });
      }
    }
  }
  return gate('G5', v);
}

// ─── aggregate ─────────────────────────────────────────────────────────────

export interface AllGatesOptions {
  g1: G1Options;
  g3?: G3Options;
  g4Outcomes?: BaselineOutcome[];
  g4?: G4Options;
  g5?: G5Options;
}

export function runAllGates(
  bundle: IrBundle,
  options: AllGatesOptions,
  meta: { gateRunId: string; runAt: string; mutationTestPassed?: boolean },
): {
  report: {
    caseId: string;
    irVersion: string;
    gateRunId: string;
    runAt: string;
    results: GateResult[];
    finalStatus: 'admitted' | 'quarantined' | 'rejected';
    mutationTestPassed?: boolean;
  };
} {
  const results: GateResult[] = [
    checkG1Structural(bundle, options.g1),
    checkG2Semantic(bundle),
    checkG3Validity(bundle, options.g3 ?? {}),
    checkG4Solvability(bundle, options.g4Outcomes ?? [], options.g4 ?? {}),
    checkG5AntiPollution(bundle, options.g5 ?? {}),
  ];

  // G1 and G2 are structural: any violation rejects the set outright.
  const hardFail = results
    .filter((r) => r.gateId === 'G1' || r.gateId === 'G2')
    .some((r) => r.violations.length > 0);

  const finalStatus: 'admitted' | 'quarantined' | 'rejected' = hardFail
    ? 'rejected'
    : results.some((r) => r.violations.length > 0)
      ? 'quarantined'
      : 'admitted';

  return {
    report: {
      caseId: 'bundle',
      irVersion: bundle.irVersion,
      gateRunId: meta.gateRunId,
      runAt: meta.runAt,
      results,
      finalStatus,
      ...(meta.mutationTestPassed === undefined ? {} : { mutationTestPassed: meta.mutationTestPassed }),
    },
  };
}

export type { EntityGraph, FaultCase, IrBundle };
