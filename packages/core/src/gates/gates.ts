import type { DisplacementReading, RankedCandidate } from '../fault/displacement.js';
import type {
  EntityGraph,
  FaultCase,
  GateResult,
  GateViolation,
  IrBundle,
  SignalKind,
  TelemetrySignal,
} from '../ir/types.js';
import {
  findDanglingEdgeRefs,
  findImplausibleEdgeDirections,
  findInvalidRelations,
  indexGraph,
  resolveEntityRef,
} from '../entity/graph.js';
import { isoUtcToEpochMs, isWithinWindow } from '../util/time.js';
import { dimensionOf } from '../util/unit.js';
import { verifyFaultValidity, type ValidityOptions } from './validity.js';

/**
 * Quality gates.
 *
 * G1 structural  - does the export satisfy the target contract? (deterministic, 100%)
 * G2 semantic    - are references resolvable, times monotonic, units consistent?
 * G3 validity    - did the declared fault actually happen, and is it strong and time-aligned?
 * G4 solvability - can a baseline method solve it, is the difficulty distribution sane, and can
 *                  the best baseline already solve the whole set?
 * G5 anti-pollution - no PII, no duplication against public sets, and no prompt that names the
 *                  answer.
 *
 * A gate never throws. It returns violations so the whole batch can be graded.
 *
 * G3 has two halves. The first is statistical and has always been here: does any
 * metric sustain |Z| >= 2.0 after injection. The second is mechanistic and lives
 * in `./validity.ts`: is the thing that moved the thing this fault would move.
 * The first cannot tell a CPU fault from a network fault -- both pass if any
 * series moves -- which is why the second exists. Enable it with
 * `G3Options.validity`; the findings are appended as `VALIDITY_*` violations and
 * nothing the gate previously reported is withdrawn.
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

/**
 * The graph's own obligations, which are the same for every case that ships that graph.
 *
 * Split out of `checkG2Semantic` for a reason the corpus made visible: thirteen cases over one
 * graph ran these three loops twenty-six times and reported one defective edge twenty-six times,
 * because `check-fault-cases.mjs` asks G2 of a one-case bundle twice -- once before the telemetry
 * is expanded and once after -- and neither pass reads telemetry. A gate that answers two
 * independent questions cannot be asked for only one of them, so the questions are separate
 * functions and G2 composes them.
 */
export function checkGraphContract(graph: EntityGraph): GateResult {
  const v: GateViolation[] = [];

  for (const issue of findDanglingEdgeRefs(graph)) {
    v.push({ code: 'DANGLING_EDGE_REF', message: `${issue.where} references '${issue.ref}' which is not an entity` });
  }
  for (const issue of findInvalidRelations(graph)) {
    v.push({ code: 'INVALID_RELATION', message: `unknown relation '${issue.ref}'` });
  }
  // Direction, which the two checks above do not reach: both ends resolve and the word is
  // published, so a `calls` edge written backwards passed every gate this package had.
  for (const issue of findImplausibleEdgeDirections(graph)) {
    if (issue.reason === 'self-edge') {
      v.push({
        code: 'SELF_EDGE',
        message: `'${issue.from}' ${issue.relation} itself, which no relation means`,
        fieldPath: `graph.edges[${issue.from} -> ${issue.to}]`,
      });
      continue;
    }
    v.push({
      code: 'IMPLAUSIBLE_EDGE_DIRECTION',
      message:
        `edge ${issue.from} ${issue.relation} ${issue.to} has a '${issue.kind}' on its ` +
        `'${issue.side}' side, and ${issue.relation} admits ${issue.admits.join(' / ')} there`,
      fieldPath: `graph.edges[${issue.from} -> ${issue.to}]`,
    });
  }

  return gate('G2', v);
}

/**
 * The case-level half of G2: every reference a case makes has to resolve in the graph it ships
 * with, its chain has to be a path through that graph, and its units have to exist.
 */
export function checkCaseSemantics(bundle: IrBundle): GateResult {
  const v: GateViolation[] = [];
  const index = indexGraph(bundle.graph);
  const adjacency = buildAdjacency(bundle.graph);

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
    // A chain is a *path*, and two things follow from the word that the hop check above does not give
    // (finding 253). The steps are numbered 1..n -- `step` was read only to sort, so a chain numbered
    // 2, 3 sorted into a plausible sequence and nothing said the numbers were wrong, which made the
    // field an ordering hint rather than the order. And no entity is visited twice: `a -> b -> a` is
    // contiguous at every hop, so connectivity passed it, while the second hop asserts that the
    // consequence caused its own cause. A control belongs in the evidence layer, not in the chain.
    if (ordered.length > 0) {
      const numbers = ordered.map((step) => step.step);
      const expectedNumbers = numbers.map((_, position) => position + 1);
      if (numbers.some((number, position) => number !== expectedNumbers[position])) {
        v.push({
          code: 'CAUSAL_STEPS_NOT_NUMBERED',
          message: `causal steps are numbered ${numbers.join(', ')}; a chain is numbered 1..${String(numbers.length)}`,
          fieldPath: `${c.caseId}.groundTruth.causalChain`,
        });
      }
      // A self-hop is collapsed rather than refused, and the distinction is not a loophole: a step from
      // an entity to itself states that the entity amplified its own condition -- a saturated thread
      // pool whose retries deepen the saturation -- which is a claim about one component. A step that
      // leaves an entity and comes back *through another* states mutual causation, and in a run of
      // propagation that is a loop: the consequence is asserted to be its own cause.
      const walk = [ordered[0]!.fromEntityId];
      for (const step of ordered) {
        if (step.toEntityId !== walk[walk.length - 1]) walk.push(step.toEntityId);
      }
      const visited = new Set<string>();
      for (const entityId of walk) {
        if (visited.has(entityId)) {
          v.push({
            code: 'CAUSAL_CHAIN_REVISITS',
            message: `the causal chain visits '${entityId}' twice, so it is a loop rather than a path`,
            fieldPath: `${c.caseId}.groundTruth.causalChain`,
          });
          break;
        }
        visited.add(entityId);
      }
      // The root cause has to be an entity the chain visits, and the rule is "visits" rather than
      // "starts at" (finding 281). `fault/difficulty.ts` justifies the absence of a `breadth >= 3`
      // row by saying that a root cause off its own chain is a defect the four-layer assessment
      // already refuses -- and nothing did: the entity layer asked only that the root resolve and
      // the process layer only that each step's ends resolve, so a case could name its answer in a
      // component its chain never touches and pass every gate. Both of the corpus's node-first
      // chains begin at an actor that acts on the root rather than at the root itself, so "starts
      // at" would refuse the two cases that show the shape is deliberate.
      const rootRef = c.groundTruth.rootCauseEntityId;
      // Compared by resolved id rather than by the string, because an alias and an id name the same
      // entity and a rule that could not see that would refuse a case for how it spelled its answer.
      const chainIds = new Set<string>();
      for (const step of ordered) {
        const from = resolveEntityRef(step.fromEntityId, index);
        const to = resolveEntityRef(step.toEntityId, index);
        if (from !== null) chainIds.add(from);
        if (to !== null) chainIds.add(to);
      }
      const root = rootRef === '' ? null : resolveEntityRef(rootRef, index);
      // An unresolvable root is UNRESOLVED_ROOT_CAUSE's business, above; report one defect once.
      if (root !== null && !chainIds.has(root)) {
        v.push({
          code: 'ROOT_OFF_ITS_CHAIN',
          message:
            `the root cause '${rootRef}' is not an entity the causal chain visits, so the answer ` +
            'and the propagation it is the answer to are two unrelated statements',
          fieldPath: `${c.caseId}.groundTruth.rootCauseEntityId`,
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

/**
 * G2 as one gate: the graph's obligations and the cases' obligations, in that order.
 *
 * The order is the report's, and it is the order a reader repairs in: a topological defect is
 * repaired once for every case that ships the graph, so it comes before the case-level findings it
 * may be the cause of.
 */
export function checkG2Semantic(bundle: IrBundle): GateResult {
  const v: GateViolation[] = [
    ...checkGraphContract(bundle.graph).violations,
    ...checkCaseSemantics(bundle).violations,
  ];
  return gate('G2', v);
}

// ─── G3 · signal validity ──────────────────────────────────────────────────

/**
 * The two thresholds G3 admits a case by, stated once.
 *
 * Extracted from the two `??` arms inside `checkG3Validity` so that the grid below reads the same
 * numbers the gate applies. A default printed in a document and a default written inline are two
 * copies, and the copy with no reader is the one that drifts -- the rule this repository has paid
 * for twice (findings 480, 481).
 */
export const G3_DEFAULTS = {
  minAbsZ: 2,
  minSustainedSamples: 3,
} as const;

/**
 * The 4x4 grid the two thresholds are read on.
 *
 * Round numbers on purpose, and wide on purpose. An axis chosen to bracket the corpus's own answers
 * would be a grid drawn after the measurement, and the |Z| axis spans two orders of magnitude each
 * way because the shipped corpus's weakest case sits two orders above the default: a narrower grid
 * would report four identical columns and look like a mistake rather than like a finding.
 *
 * The sample axis stops at eight, which is what `SERIES_POINTS` gives a derived series. It is a
 * round number here rather than an import: the grid asks what a threshold does, and a corpus whose
 * cases carry four samples will refuse the 8 column for its own reason, which the reading prints.
 */
export const G3_GRID_AXES: G3GridAxes = {
  minAbsZ: [1, G3_DEFAULTS.minAbsZ, 10, 100],
  minSustainedSamples: [1, G3_DEFAULTS.minSustainedSamples, 5, 8],
};

/** The two axes a threshold grid is measured over. */
export interface G3GridAxes {
  minAbsZ: readonly number[];
  minSustainedSamples: readonly number[];
}

/** One cell of the grid: what the gate would say about every case at this pair of lines. */
export interface G3GridCell {
  minAbsZ: number;
  minSustainedSamples: number;
  admitted: number;
  refused: number;
  /** The cases this cell refuses, in bundle order. */
  refusedCaseIds: string[];
}

/**
 * What the grid measured, and the two numbers that explain it.
 *
 * `flips` is the reading that survives a flat grid. A case's flip point is the largest |Z| line at
 * which it still sustains the default's samples, so it is the case's own distance from the
 * threshold -- and a corpus whose weakest flip is sixty times the default explains why all sixteen
 * cells agree far better than a sentence saying the default is "conservative" does.
 */
export interface G3ThresholdGridReading {
  axes: G3GridAxes;
  /** Sixteen cells, row-major: for each |Z| line, every sample line. */
  cells: G3GridCell[];
  /** Cases with at least one metric series, which is what the gate grades. */
  judged: number;
  /** Cases the gate skips for having no metric signal at all. */
  unmatched: string[];
  /** The cell the shipped defaults would produce, whether or not the axes contain it. */
  defaultCell: G3GridCell;
  /** Whether that cell is one of the sixteen, which is what makes the grid a measurement of it. */
  defaultIsAxisPoint: boolean;
  /**
   * The orthogonal neighbours of the default cell that change the refused count, with the change.
   *
   * Orthogonal rather than diagonal: a diagonal cell differs on both axes at once, so a step there
   * cannot be attributed to either threshold.
   */
  neighbours: Array<{ minAbsZ: number; minSustainedSamples: number; delta: number }>;
  maxNeighbourDelta: number;
  /** Each judged case's flip point at the default's sample line; `null` when it never sustains it. */
  flips: Array<{ caseId: string; flipZ: number | null }>;
  /** The case with the smallest non-null flip point, which is the corpus's own distance. */
  weakest: { caseId: string; flipZ: number } | null;
  /** `weakest.flipZ` over the default's |Z| line; `null` when nothing flips. */
  margin: number | null;
  /** The most post-onset samples any judged case offers: the tallest line the axis may ask for. */
  ceiling: number;
}

export interface G3Options {
  /** Minimum |Z| for a metric to count as a valid anomaly signal. */
  minAbsZ?: number;
  /** Consecutive samples required above the threshold. */
  minSustainedSamples?: number;
  /** Maximum tolerated quarantine ratio for the source dataset. */
  maxQuarantineRatio?: number;
  /** Observed quarantine ratio for the source dataset. */
  quarantineRatio?: number;
  /**
   * Enable mechanistic fault-validity verification and append its findings.
   *
   * Absent means off, so every existing caller and every recorded baseline keeps
   * its current behaviour. Turning it on is a deliberate act with a measured
   * consequence -- it will quarantine cases whose fault never manifested -- so it
   * is a parameter rather than a silent default change.
   */
  validity?: ValidityOptions;
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

/**
 * The (entity, metric) series a case's metric signals form, split at the injection time.
 *
 * A group with no baseline sample is not a group: the gate's original loop iterated the baseline
 * map, so a series that only exists after the injection was never compared with anything. Kept
 * exactly as it was, because this function is now the only place that decides it -- the grid and
 * the verdict read the same split.
 */
function metricGroups(
  c: FaultCase,
  signals: readonly TelemetrySignal[],
): Array<{ baseline: number[]; post: number[] }> {
  const t0 = ISO_UTC.test(c.injectTime) ? isoUtcToEpochMs(c.injectTime) : Number.NaN;
  const grouped = new Map<string, { baseline: number[]; post: number[] }>();
  for (const s of signals) {
    if (s.payload.kind !== 'metric') continue;
    const t = ISO_UTC.test(s.timestamp) ? isoUtcToEpochMs(s.timestamp) : Number.NaN;
    if (Number.isNaN(t) || Number.isNaN(t0)) continue;
    const key = `${s.resource['service.name']}|${s.payload.name}`;
    const group = grouped.get(key) ?? { baseline: [], post: [] };
    (t >= t0 ? group.post : group.baseline).push(s.payload.value);
    grouped.set(key, group);
  }
  return [...grouped.values()].filter((g) => g.baseline.length > 0 && g.post.length > 0);
}

/** The |Z| of every post-onset sample, against the case's own baseline for that series. */
function absZScores(group: { baseline: number[]; post: number[] }): number[] {
  const mu = mean(group.baseline);
  const sigma = stddev(group.baseline);
  return group.post.map((x) => Math.abs(zScore(x, mu, sigma)));
}

/** The longest run of consecutive samples that each clear `minAbsZ`. */
function longestRun(zs: readonly number[], minAbsZ: number): number {
  let best = 0;
  let streak = 0;
  for (const z of zs) {
    if (z >= minAbsZ) {
      streak += 1;
      if (streak > best) best = streak;
    } else {
      streak = 0;
    }
  }
  return best;
}

/**
 * The largest |Z| line at which a case still sustains `samples` consecutive post-onset samples.
 *
 * Closed form rather than a search: sustaining a line means some window of `samples` consecutive
 * samples all clear it, so the largest line that still holds is the best window's *smallest*
 * z-score. A window is the only comparison the rule makes, which is why a single quiet sample in
 * the middle of a strong run lowers the flip point to the quiet sample -- and why a case whose
 * strong samples are not consecutive reports the shorter run rather than the spike.
 *
 * `null` means the case cannot sustain that many samples at *any* line, which is a different
 * finding from a flip point of zero: zero is a case sitting exactly on the threshold, and no
 * window at all is a case with nothing to measure.
 */
function flipPoint(zsPerGroup: ReadonlyArray<readonly number[]>, samples: number): number | null {
  let best: number | null = null;
  for (const zs of zsPerGroup) {
    for (let start = 0; start + samples <= zs.length; start += 1) {
      let window = Number.POSITIVE_INFINITY;
      for (let i = start; i < start + samples; i += 1) window = Math.min(window, zs[i] as number);
      if (best === null || window > best) best = window;
    }
  }
  return best;
}

export function checkG3Validity(bundle: IrBundle, options: G3Options = {}): GateResult {
  const v: GateViolation[] = [];
  const minAbsZ = options.minAbsZ ?? G3_DEFAULTS.minAbsZ;
  const minSustained = options.minSustainedSamples ?? G3_DEFAULTS.minSustainedSamples;
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

    const groups = metricGroups(c, sigs);
    const anyStrong = groups.some((group) => longestRun(absZScores(group), minAbsZ) >= minSustained);
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

  // ─── mechanistic fault validity (opt-in) ─────────────────────────────────
  // The loop above asks whether any metric moved enough. This asks whether the
  // right metric moved, which is a different question and the one the product's
  // D-10 claim rests on. `unverifiable` findings are reported as information
  // rather than as violations: an absence of evidence is not a defect in the
  // case, and treating it as one would quarantine cases for the wrong reason.
  if (options.validity !== undefined) {
    for (const c of bundle.cases) {
      const report = verifyFaultValidity({ ...bundle, cases: [c] }, options.validity);
      if (report.verdict === 'unverifiable') continue;
      for (const check of report.checks) {
        if (check.passed) continue;
        v.push({
          code: `VALIDITY_${check.id.toUpperCase().replace(/-/g, '_')}`,
          message: `case '${c.caseId}': ${check.detail}`,
          fieldPath: `cases.${c.caseId}.fault`,
        });
      }
    }
  }

  return gate('G3', v);
}

/**
 * Read both G3 thresholds as a grid, and publish the two numbers that explain it.
 *
 * The request this answers was "a 4x4 grid would say which cell the defaults sit in and whether the
 * admission rate moves with them". On the shipped corpus the answer is that it does not move at
 * all, and that is not a defect in the grid: the corpus's weakest case stops sustaining three
 * samples only above |Z| >= 126.8, so every line from 1 to 100 admits every case. A grid that
 * reported sixteen identical cells and stopped there would be a measurement nobody can act on, so
 * the reading also carries each case's flip point -- the corpus's *distance* from the threshold --
 * and the ceiling the sample axis runs into.
 *
 * Every cell is derived from one per-case computation, and that computation is the gate's own
 * (`metricGroups`, `absZScores`, `flipPoint`), so the grid cannot disagree with the verdict it is
 * describing. A test asserts the agreement over all sixteen cells.
 */
export function readG3ThresholdGrid(
  bundle: IrBundle,
  options: { axes?: G3GridAxes } = {},
): G3ThresholdGridReading {
  const axes = options.axes ?? G3_GRID_AXES;

  const judged: Array<{ caseId: string; zs: number[][]; postSamples: number }> = [];
  const unmatched: string[] = [];
  for (const c of bundle.cases) {
    const sigs = bundle.signals[c.caseId] ?? [];
    const hasMetric = sigs.some((s) => s.payload.kind === 'metric');
    if (!hasMetric) {
      unmatched.push(c.caseId);
      continue;
    }
    const groups = metricGroups(c, sigs);
    judged.push({
      caseId: c.caseId,
      zs: groups.map(absZScores),
      postSamples: groups.reduce((most, g) => Math.max(most, g.post.length), 0),
    });
  }

  /**
   * Every case's flip point at one sample line, computed once and reused by every |Z| cell.
   *
   * The default's line is always computed, even when the caller's axes do not contain it: `flips`
   * answers "how far is each case from the line the gate applies", and a caller asking a narrower
   * question still gets that answer. Reading it off the axis instead reported "no case sustains 3
   * sample(s)" for a bundle whose case sustains 62 -- a reading of the grid's shape presented as a
   * reading of the corpus.
   */
  const flipsAt = new Map<number, Array<{ caseId: string; flipZ: number | null }>>();
  for (const samples of new Set([...axes.minSustainedSamples, G3_DEFAULTS.minSustainedSamples])) {
    flipsAt.set(
      samples,
      judged.map((one) => ({ caseId: one.caseId, flipZ: flipPoint(one.zs, samples) })),
    );
  }

  /**
   * The flip points at one sample line.
   *
   * No `?? []` fallback, deliberately: every line this is asked for was computed above, because the
   * set it iterates is `axes.minSustainedSamples` plus the default's own line. A fallback here
   * would be a branch no input can take, and the answer it would hand back -- an empty list, which
   * reads as "nothing is refused" -- is the one answer a guard must never produce for a question it
   * did not understand.
   */
  const flipsAtLine = (samples: number): Array<{ caseId: string; flipZ: number | null }> =>
    flipsAt.get(samples) as Array<{ caseId: string; flipZ: number | null }>;

  const cellsOf = (minAbsZ: number, minSustainedSamples: number): G3GridCell => {
    const refusedCaseIds = flipsAtLine(minSustainedSamples)
      .filter((one) => one.flipZ === null || minAbsZ > one.flipZ)
      .map((one) => one.caseId);
    return {
      minAbsZ,
      minSustainedSamples,
      admitted: judged.length - refusedCaseIds.length,
      refused: refusedCaseIds.length,
      refusedCaseIds,
    };
  };

  const cells: G3GridCell[] = [];
  for (const minAbsZ of axes.minAbsZ) {
    for (const samples of axes.minSustainedSamples) cells.push(cellsOf(minAbsZ, samples));
  }

  const defaultCell = cellsOf(G3_DEFAULTS.minAbsZ, G3_DEFAULTS.minSustainedSamples);
  const defaultIsAxisPoint =
    axes.minAbsZ.includes(G3_DEFAULTS.minAbsZ)
    && axes.minSustainedSamples.includes(G3_DEFAULTS.minSustainedSamples);

  // The four orthogonal neighbours, in a fixed order so the reading is comparable between runs:
  // the line below, the line above, one sample fewer, one sample more.
  const zIndex = axes.minAbsZ.indexOf(G3_DEFAULTS.minAbsZ);
  const kIndex = axes.minSustainedSamples.indexOf(G3_DEFAULTS.minSustainedSamples);
  const neighbourAxes: Array<[number, number]> = [];
  if (zIndex > 0) neighbourAxes.push([zIndex - 1, kIndex]);
  if (zIndex >= 0 && zIndex + 1 < axes.minAbsZ.length) neighbourAxes.push([zIndex + 1, kIndex]);
  if (kIndex > 0) neighbourAxes.push([zIndex, kIndex - 1]);
  if (kIndex >= 0 && kIndex + 1 < axes.minSustainedSamples.length) neighbourAxes.push([zIndex, kIndex + 1]);
  const neighbours = neighbourAxes
    .filter(([z, k]) => z >= 0 && k >= 0)
    .map(([z, k]) => {
      const cell = cellsOf(axes.minAbsZ[z] as number, axes.minSustainedSamples[k] as number);
      return {
        minAbsZ: cell.minAbsZ,
        minSustainedSamples: cell.minSustainedSamples,
        delta: cell.refused - defaultCell.refused,
      };
    });

  const flips = flipsAtLine(G3_DEFAULTS.minSustainedSamples);
  let weakest: { caseId: string; flipZ: number } | null = null;
  for (const one of flips) {
    if (one.flipZ === null) continue;
    if (weakest === null || one.flipZ < weakest.flipZ) weakest = { caseId: one.caseId, flipZ: one.flipZ };
  }

  return {
    axes,
    cells,
    judged: judged.length,
    unmatched,
    defaultCell,
    defaultIsAxisPoint,
    neighbours,
    maxNeighbourDelta: neighbours.reduce((most, n) => Math.max(most, Math.abs(n.delta)), 0),
    flips,
    weakest,
    margin: weakest === null ? null : weakest.flipZ / G3_DEFAULTS.minAbsZ,
    ceiling: judged.reduce((most, one) => Math.max(most, one.postSamples), 0),
  };
}

/** One sentence: what the grid says, what the default admits, how far the corpus is from it. */
export function describeG3ThresholdGrid(reading: G3ThresholdGridReading): string {
  const { axes, judged, defaultCell, neighbours } = reading;
  const parts: string[] = [
    `g3 threshold grid: ${judged} case(s) judged over `
      + `${axes.minAbsZ.length}x${axes.minSustainedSamples.length} cells `
      + `(|Z| ${axes.minAbsZ.join('/')} x samples ${axes.minSustainedSamples.join('/')}); `
      + `the default (|Z| >= ${G3_DEFAULTS.minAbsZ}, ${G3_DEFAULTS.minSustainedSamples} samples) `
      + `admits ${defaultCell.admitted} of ${judged}`,
  ];
  const movers = neighbours.filter((n) => n.delta !== 0).length;
  parts.push(
    movers === 0
      ? ' and no neighbour changes that'
      : ` and ${movers} of its ${neighbours.length} neighbour(s) change that, `
        + `by up to ${reading.maxNeighbourDelta}`,
  );
  if (!reading.defaultIsAxisPoint) {
    parts.push(' (the default cell is not on this grid)');
  }
  parts.push(
    '; ',
    reading.weakest === null
      ? `no case sustains ${G3_DEFAULTS.minSustainedSamples} sample(s) at any line, so there is no flip to report`
      : `the weakest case '${reading.weakest.caseId}' stops sustaining `
        + `${G3_DEFAULTS.minSustainedSamples} sample(s) at |Z| >= ${reading.weakest.flipZ.toFixed(2)}, `
        // The margin is a division of the flip point by the default, computed here rather than read
        // off the reading: the reading's copy is `null` exactly when this branch cannot run, and a
        // `?? 0` for a case that cannot reach it is a fallback no input can take.
        + `${(reading.weakest.flipZ / G3_DEFAULTS.minAbsZ).toFixed(2)}x the default`,
  );
  parts.push(
    `; the most post-onset samples any case offers is ${reading.ceiling}, `
      + 'which is the tallest sample line the grid can ask for',
  );
  return parts.join('');
}

// ─── G4 · solvability and difficulty ───────────────────────────────────────

export interface BaselineOutcome {
  caseId: string;
  method: string;
  /** Rank of the true root cause in the method output; 1 means top-1. */
  rankOfTruth: number | null;
  /** The K the run was scored at. */
  topK: number;
  /**
   * How many candidates the run's ranking held.
   *
   * Separate from `topK` because a rank of 2 in a ranking of 2 is not evidence of anything: the
   * earlier shape reported the smaller of the two numbers as `topK`, so `rankOfTruth <= topK` held
   * for every answer that appeared at all and G4's top-K claim could not be failed by any input.
   */
  candidateCount: number;
  /**
   * The ranking itself, so a caller can ask *why* the answer is not first without re-running the
   * method. Optional because a hand-built outcome in a test has no ranking to show, and a gate that
   * required one would make every such test construct machinery it is not about.
   */
  candidates?: RankedCandidate[];
}

/**
 * Whether a solver located the answer, and at what rank.
 *
 * `null` when the annotated component is absent from the ranking -- and also when it is present
 * with a statistic of zero, which is the state a ranking of quiet services produces. A candidate
 * that showed nothing is not a candidate a method found: it is a line in an output. Counting it as a
 * location would make a case whose answer never moved "solved at rank 2" because one other service
 * moved and the tail was sorted alphabetically, and that is the false positive the corpus's
 * background telemetry made reachable the moment it gave every service a series.
 */
export function locatedRank(statistic: number | undefined, at: number): number | null {
  if (statistic === undefined || statistic === 0) return null;
  return at + 1;
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
  /**
   * What the set says it is *for*.
   *
   * The corpus in this repository is a **conformance** fixture: thirty cases whose
   * job is to exercise the converter, the gates and the exporters, and which is
   * scored by two baselines that solve all thirty. A `benchmark` set is the other
   * thing -- a set published so that methods can be separated -- and saturation is
   * a defect there and a fact of life here.
   *
   * The declaration exists because of what the alternative costs. Without it, the
   * saturation rule below fires on every run of a corpus that is doing its job,
   * and a rule that is always red is a rule everyone learns to skip. With it, the
   * rule can be violated (a set that declares `benchmark` and saturates fails) and
   * the reading is still printed for the set that declares `conformance`.
   */
  setPurpose?: SetPurpose;
  /** Share of the asked cases the strongest baseline may solve before a benchmark set is saturated. */
  saturationCeiling?: number;
  /** Minimum number of cases with an outcome before saturation is judged at all. */
  saturationMinCases?: number;
}

/**
 * What a set is for, as the set declares it.
 *
 * `benchmark` is the default because it is the answer that judges: a caller who
 * has not thought about the question gets the stricter of the two behaviours, and
 * the escape from it is a sentence in a file rather than an absent option.
 */
export type SetPurpose = 'benchmark' | 'conformance';

export interface SaturationReading {
  purpose: SetPurpose;
  /** Cases the baselines were actually asked about: the denominator, not the set size. */
  asked: number;
  /** The narrowest top-K among the outcomes read, or null when nothing was asked. */
  topK: number | null;
  methods: Array<{ method: string; hits: number; rate: number }>;
  strongest: { method: string; hits: number; rate: number } | null;
  ceiling: number;
  saturated: boolean;
  /** False when too few cases carry an outcome for a rate to mean anything. */
  judged: boolean;
  /** The floor below which nothing was judged. */
  minCases: number;
}

/**
 * How much of the set the best baseline can already solve.
 *
 * ## Why this arm is here rather than in a sixth gate
 *
 * The property is about the same subject G4 already owns -- whether the set can
 * separate methods -- and G4's input already holds it: `BaselineOutcome[]` is
 * exactly the table this arithmetic reads. A `G6` would be a second name for one
 * property, and the two names would drift the first time one of them was extended.
 *
 * ## Why the denominator is the cases that were *asked*, not the cases in the set
 *
 * A method run on three cases of thirty that solves all three is not saturated at
 * 1.000; it was asked three questions. Counting the set instead would let a sparse
 * baseline report a rate it never earned, and would make the reading move when
 * cases were added that no method had been run against. The denominator is
 * therefore the intersection of the set and the outcomes, and the two counts are
 * both printed by `describeSaturation` so a reader can see which one is which.
 *
 * ## Why the strongest method decides
 *
 * Saturation is about the *best available* separation. A set where one baseline
 * solves everything cannot rank methods, whatever the other baselines do -- and
 * averaging across baselines would let a second, weaker method hide exactly the
 * reading the rule exists to surface.
 */
export function readSaturation(
  bundle: IrBundle,
  outcomes: BaselineOutcome[],
  options: G4Options = {},
): SaturationReading {
  const ceiling = options.saturationCeiling ?? 0.95;
  const minCases = options.saturationMinCases ?? options.distributionMinCases ?? 10;
  const purpose = options.setPurpose ?? 'benchmark';

  const byCase = new Map<string, BaselineOutcome[]>();
  for (const o of outcomes) {
    const rows = byCase.get(o.caseId);
    if (rows === undefined) byCase.set(o.caseId, [o]);
    else rows.push(o);
  }

  // The questions the baselines were actually asked, resolved once. Two consequences follow from
  // reading the bundle rather than the outcome list here: an outcome that names a case the set
  // does not contain is not a question about anything, so it neither joins the denominator nor
  // narrows the top-K the set is reported at -- an earlier version read `topK` off every outcome
  // and a single stray row could narrow the whole set's reading.
  const askedRows = bundle.cases
    .map((c) => byCase.get(c.caseId))
    .filter((rows): rows is BaselineOutcome[] => rows !== undefined);
  const methodNames = [...new Set(outcomes.map((o) => o.method))].sort((a, b) => a.localeCompare(b));
  const methods = methodNames.map((method) => {
    let hits = 0;
    for (const rows of askedRows) {
      const solved = rows.some(
        (o) => o.method === method && o.rankOfTruth !== null && o.rankOfTruth >= 1 && o.rankOfTruth <= o.topK,
      );
      if (solved) hits += 1;
    }
    return { method, hits, rate: askedRows.length === 0 ? 0 : hits / askedRows.length };
  });

  // Sorted above, so `rate` ties resolve on the name and the reported strongest method does not
  // depend on the order the outcomes arrived in.
  const strongest = methods.reduce<{ method: string; hits: number; rate: number } | null>(
    (best, one) => (best === null || one.rate > best.rate ? one : best),
    null,
  );
  const asked = askedRows.length;
  const judged = asked >= minCases;
  const topKs = askedRows.flatMap((rows) => rows.map((o) => o.topK));

  return {
    purpose,
    asked,
    topK: topKs.length === 0 ? null : Math.min(...topKs),
    methods,
    strongest,
    ceiling,
    saturated: judged && strongest !== null && strongest.rate >= ceiling,
    judged,
    minCases,
  };
}

/**
 * The saturation reading as one sentence, with the purpose that decided what it is.
 *
 * A reading and not a verdict, so it is printed whether or not the gate fired --
 * the number that says how separable a set is is worth reading exactly when it is
 * bad, and a line that only appears on failure is a line nobody has seen before.
 */
export function describeSaturation(reading: SaturationReading): string {
  if (!reading.judged) {
    return (
      `set saturation: not judged -- ${String(reading.asked)} case(s) carry an outcome and the floor is ` +
      `${String(reading.minCases)}`
    );
  }
  const strongest = reading.strongest;
  if (strongest === null) return 'set saturation: not judged -- no baseline outcome was supplied';
  const verdict =
    reading.purpose === 'conformance'
      ? `purpose 'conformance', so this is a reading and not a verdict`
      : reading.saturated
        ? `purpose 'benchmark', so this set is saturated`
        : `purpose 'benchmark', ceiling ${reading.ceiling.toFixed(3)}`;
  return (
    `set saturation: the strongest baseline ('${strongest.method}') locates ${String(strongest.hits)} of ` +
    `${String(reading.asked)} case(s) within top-${String(reading.topK)} (rate ${strongest.rate.toFixed(3)}); ` +
    verdict
  );
}

/**
 * Whether a declared benchmark set is separable at all.
 *
 * The rule this adds to G4 is the one the corpus has been printing without naming:
 * *both baselines place all thirty cases in their top-K*. That sentence has been
 * in the success line of `check-fault-cases.mjs` for as long as the corpus has had
 * telemetry, and it is simultaneously the strongest evidence the corpus works and
 * the strongest evidence it cannot separate anything. It was read as the first.
 *
 * Below `saturationMinCases` nothing is judged: a rate over three cases is not a
 * rate, which is the same exemption `checkDifficultyDistribution` makes and for the
 * same reason. The caller prints the reading either way, so "not judged" is
 * visible rather than silent.
 */
export function checkSaturation(
  bundle: IrBundle,
  outcomes: BaselineOutcome[],
  options: G4Options = {},
): GateResult {
  const reading = readSaturation(bundle, outcomes, options);
  if (reading.purpose !== 'benchmark' || !reading.judged) return gate('G4', []);
  // Recomputed from `methods` rather than read off `reading.strongest`, so that the branch below is
  // a decision about the set instead of a null check on a value the caller can already see: the two
  // ways out -- nothing over the ceiling, and a method over it -- are both reachable, and both are
  // driven by inputs a test can construct.
  const overCeiling = reading.methods
    .filter((one) => one.rate >= reading.ceiling)
    .sort((left, right) => right.rate - left.rate || left.method.localeCompare(right.method));
  const strongest = overCeiling[0];
  if (strongest === undefined) return gate('G4', []);
  return gate('G4', [
    {
      code: 'SATURATED_SET',
      message:
        `the strongest baseline ('${strongest.method}') locates ${String(strongest.hits)} of ` +
        `${String(reading.asked)} case(s) within top-${String(reading.topK)} (rate ` +
        `${strongest.rate.toFixed(3)} against a ceiling of ${reading.ceiling.toFixed(3)}), so this set ` +
        'cannot separate methods',
      fieldPath: 'cases',
    },
  ]);
}

/**
 * Whether the corpus can fail a method that returns the loudest component.
 * Whether the baselines can locate each case's root cause. A property of one case.
 *
 * Split out of `checkG4Solvability` because the two halves of G4 have different subjects and
 * different callers: this one is asked per case, with that case's own telemetry, and the
 * distribution below is a property of the set. `check-fault-cases.mjs` asked the composed gate of a
 * one-case bundle, so the distribution rule saw `graded.length === 1` every time, fell below its
 * own `distributionMinCases` of ten, and **never ran** -- on a corpus of fifteen cases with five
 * graded. A rule that cannot be reached by the only caller that owns the corpus is not a rule; it
 * is a comment with a `maxL1Share` in it.
 */
export function checkSolvability(
  bundle: IrBundle,
  outcomes: BaselineOutcome[],
  options: G4Options = {},
): GateResult {
  const v: GateViolation[] = [];
  const minSolvers = options.minSolvers ?? 1;

  const byCase = new Map<string, BaselineOutcome[]>();
  for (const o of outcomes) {
    const arr = byCase.get(o.caseId) ?? [];
    arr.push(o);
    byCase.set(o.caseId, arr);
  }

  for (const c of bundle.cases) {
    const outcomes = byCase.get(c.caseId) ?? [];
    const solved = outcomes.filter(
      (o) => o.rankOfTruth !== null && o.rankOfTruth >= 1 && o.rankOfTruth <= o.topK,
    );
    if (solved.length < minSolvers) {
      v.push({
        code: 'UNSOLVABLE_CASE',
        message: `only ${solved.length} baseline(s) locate the root cause within top-K`,
        fieldPath: `${c.caseId}`,
      });
    }
    // The other way a case can say nothing: a ranking no wider than the K it is scored at. No
    // method can miss a candidate that is inside its own output's length, so a case built from two
    // services reports a top-3 hit for every solver that returns anything -- and a corpus of them
    // reports a top-K accuracy equal to its detection rate.
    //
    // This is reported per case rather than per solver because it is a property of the case's
    // telemetry, not of a method: the two baselines read the same series and therefore rank the
    // same set. The condition is "no solver was asked a question it could fail".
    const contested = outcomes.filter((o) => o.candidateCount > o.topK);
    if (outcomes.length > 0 && contested.length === 0) {
      const widest = Math.max(...outcomes.map((o) => o.candidateCount));
      v.push({
        code: 'LOCALISATION_UNCONTESTED',
        message:
          `the ranking holds ${String(widest)} candidate(s) against a top-K of ` +
          `${String(Math.min(...outcomes.map((o) => o.topK)))}, so being within the top-K is not a constraint`,
        fieldPath: `${c.caseId}`,
      });
    }
  }

  return gate('G4', v);
}

/**
 * Whether the graded cases are spread across the levels. A property of the set, asked once.
 *
 * `graded` counts the cases that state a level. A case that does not is not an easy case: the
 * exporter projects an absent level to `medium` (`export/difficulty.ts` documents that arm), so an
 * unannotated corpus exports as uniformly medium and the distribution rule has nothing to say about
 * it. Below `distributionMinCases` this returns passed rather than a verdict, because a share
 * computed from three cases is not a measurement of a share -- and the caller that owns the corpus
 * prints the count, so "the rule did not apply" is visible rather than silent.
 */
export function checkDifficultyDistribution(bundle: IrBundle, options: G4Options = {}): GateResult {
  const v: GateViolation[] = [];
  const maxL1Share = options.maxL1Share ?? 0.2;
  const minL4Share = options.minL4Share ?? 0.1;
  const distributionMinCases = options.distributionMinCases ?? 10;

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

/**
 * Whether the corpus can fail a method that returns the loudest component.
 *
 * A case whose answer is the largest excursion in its window is solved by the dumbest possible
 * localiser, and a corpus of them reports that as a measurement of localisation. The corpus shipped
 * with thirteen of fifteen cases at rank 1 for both baselines -- a fact it could not state before
 * background telemetry widened the rankings, and one that reads as "the corpus tests detection".
 *
 * The rule is corpus-level because the property is: no single case can be wrong for having a loud
 * answer. What it asks is that at least one case be displaced by a **strictly louder, separate
 * component** (`classifyDisplacement`), so that a threshold-based method has one case it must get
 * wrong and gets wrong deterministically.
 *
 * The earlier version of this rule counted any rank above 1, which accepted three different things
 * as one: a strict displacement, a tie broken by name, and a candidate that is a part of the answer
 * (a pod outranking its service). Only the first is evidence -- the second flips on a rename and the
 * third is not a miss at all -- so the classification is now the gate's input rather than its
 * footnote. The count that survives is smaller, and the number a reader sees is the honest one.
 */
export function checkDiscrimination(readings: DisplacementReading[]): GateResult {
  const v: GateViolation[] = [];
  if (readings.length > 0 && !readings.some((one) => one.kind === 'strict')) {
    const tally = new Map<string, number>();
    for (const one of readings) tally.set(one.kind, (tally.get(one.kind) ?? 0) + 1);
    const parts = ['strict', 'tie', 'same-component', 'none']
      .filter((kind) => tally.has(kind))
      .map((kind) => `${kind} ${String(tally.get(kind))}`);
    v.push({
      code: 'NO_DISPLACEMENT',
      message:
        `no case places a strictly louder, separate component above its answer (${parts.join(', ')}), ` +
        'so returning the largest excursion is never wrong',
    });
  }
  return gate('G4', v);
}

/**
 * G4 as one gate: can the baselines locate each case, are the graded cases spread out, and is the
 * set separable at all?
 *
 * Solvability first, because a set whose cases no baseline can locate has a problem the
 * distribution of their labels cannot describe. Saturation last, because it is the only one of the
 * three whose verdict depends on what the set says it is for.
 */
export function checkG4Solvability(
  bundle: IrBundle,
  outcomes: BaselineOutcome[],
  options: G4Options = {},
): GateResult {
  const v: GateViolation[] = [
    ...checkSolvability(bundle, outcomes, options).violations,
    ...checkDifficultyDistribution(bundle, options).violations,
    ...checkSaturation(bundle, outcomes, options).violations,
  ];
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
  /**
   * Shortest normalised component name this gate will look for in a prompt.
   *
   * A name below it is not judged, because a two- or three-letter service name is
   * also an ordinary English word and matching it would accuse every prompt that
   * says "the api returned 500" of leaking. The count that is *not* judged is
   * printed by the caller (`describePromptLeaks`), because a rule that silently
   * skips part of its subject is the shape this repository keeps removing.
   */
  minNameLength?: number;
  /**
   * Highest task-text Jaccard two cases in one system may share before the pair is
   * refused as a near duplicate.
   *
   * The default is a judgement and this comment says so rather than defending it: the
   * shipped corpus's closest pair scores 0.2414, so 0.90 sits 3.7 multiples above
   * anything real telemetry has produced here. What keeps that a measurement rather
   * than a hope is `readPairSimilarity`, which returns the corpus's own maximum beside
   * this threshold -- a set drifting towards duplication raises the maximum long before
   * it crosses the line, and both the reading and its test are what makes the drift
   * visible.
   */
  maxTaskTextJaccard?: number;
  /** Highest window IoU two cases in one system may share. Default 0.5; see above. */
  maxWindowIou?: number;
}

/**
 * The name a prompt must not contain, in one spelling.
 *
 * ## Why separators are normalised, and why that is the whole rule
 *
 * The answer this gate protects is `groundTruth.rootCauseComponent`, and the field
 * next to it is a sentence a human wrote. Nothing makes them agree on punctuation:
 * the corpus says `checkout-api` in the field and `checkout-api p99 latency rose`
 * in the prompt, which a substring test finds, and says `billing-service` in the
 * field against `The billing service began throwing` in the prompt, which it does
 * not. Measured on the corpus as it stood before v3.66, the substring form of this
 * rule reported **3 of 30** and this form reported **19 of 30** -- the difference is
 * entirely hyphen against space, and the sixteen cases in that gap were reported as
 * clean by the test that was supposed to find them.
 *
 * Both figures are **history**, and the past tense above is deliberate. v3.66 rewrote
 * the corpus's task texts so that none of them names its component, and both forms
 * report **0 of 30** on the tree since. The current figure is not restated here,
 * because a comment has no reader that runs: `check-fault-cases.mjs` prints
 * `prompt leakage: N of M case(s)` on every run, and that line is the reading. What the
 * two dated numbers still argue for is this rule's shape -- on a corpus that does name
 * its components, normalising the hyphen is worth sixteen cases (finding 480).
 *
 * Case is folded for the same reason and with the same evidence: `Media
 * Transcoder` and `media-transcoder` are one name.
 *
 * ## Why the boundaries are non-alphanumeric rather than `\\b`
 *
 * `\\b` treats a hyphen as a boundary, so `\\bapi\\b` matches inside `checkout-api`
 * -- which would make every name that ends in `api` match every prompt that
 * mentions a different one. The lookbehind here is "not a letter or digit", and a
 * hyphen is neither, so a **normalised** prompt has no hyphens left in the first
 * place: `checkout-api` became `checkout api` before the search.
 */
export function promptNamePattern(component: string): RegExp | null {
  const name = normaliseName(component);
  if (name === '') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
}

/** A component name with its punctuation, case and spacing flattened. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PromptLeakReading {
  /** Cases whose prompt could be searched: the name was long enough to mean one thing. */
  judged: number;
  /** Cases whose prompt names the answer component. */
  leaks: Array<{ caseId: string; component: string }>;
  /** Cases this rule did not judge, and the name that was too short to judge them by. */
  skipped: Array<{ caseId: string; component: string }>;
  /** The boundary the rule applied. */
  minNameLength: number;
}

/**
 * Whether each prompt names the answer, measured rather than declared.
 *
 * ## Why this is a rule and not a property of the exporter
 *
 * `score.ts` runs a check of its own called `answer-key-isolated`, and it compares
 * **whole cells**: no cell of `query.csv` may *be* a value the answer key scores.
 * That is the right rule for the artefact it reads -- it catches a field that
 * holds the answer -- and it is deliberately blind to a sentence that mentions the
 * component, because a human writing an incident report names the thing that
 * broke. This reading is about the other side of that line: the task text is the
 * *prompt a solver is given*, and a prompt that names the component makes
 * localisation a reading exercise rather than an inference. Both statements are
 * true of the same corpus; they are about different artefacts, which is why this
 * is a second **measurement** and not a second verdict on the same file.
 *
 * ## Why `answerKeyIsolated` could not stand in for it
 *
 * That field is a boolean the case asserts about itself, and until this arm
 * existed nothing read it beyond checking that it was `true`: a case could claim
 * isolation while its prompt opened with its own answer, and the gate would pass
 * it. A claim is not a measurement -- the corpus is where that difference is
 * cheapest to see, since it holds both.
 */
export function readPromptLeaks(bundle: IrBundle, options: G5Options = {}): PromptLeakReading {
  const minNameLength = options.minNameLength ?? 6;
  const reading: PromptLeakReading = { judged: 0, leaks: [], skipped: [], minNameLength };
  for (const c of bundle.cases) {
    // `rootCauseComponent` is required by the IR, and a case that fails that requirement is refused
    // by the schema rather than by this arm -- so there is no absent-name branch here to guard. A
    // name that is present but empty is a different thing: it is spelled '' in the vocabulary, and
    // the length floor below is what declines to judge it.
    const component = c.groundTruth.rootCauseComponent;
    const name = normaliseName(component);
    if (name.length < minNameLength) {
      reading.skipped.push({ caseId: c.caseId, component });
      continue;
    }
    reading.judged += 1;
    const pattern = promptNamePattern(component);
    // `promptNamePattern` returns non-null for every name at or above the floor above, so a
    // null here would mean the floor and the normaliser disagree about what a name is. It is
    // written as a guard rather than an assertion so the gate can never throw on a case.
    if (pattern !== null && pattern.test(normaliseName(c.query ?? ''))) {
      reading.leaks.push({ caseId: c.caseId, component });
    }
  }
  return reading;
}

/**
 * The leak reading in the sentence a reader can check.
 *
 * Printed by the caller that owns a corpus, in the same shape as the other
 * readings there: a number, its denominator, and the boundary it applied.
 */
export function describePromptLeaks(reading: PromptLeakReading): string {
  let sentence =
    `prompt leakage: ${String(reading.leaks.length)} of ${String(reading.judged)} case(s) name their ` +
    'root-cause component in the task text';
  if (reading.leaks.length > 0) {
    sentence += ` (${reading.leaks.map((one) => `${one.caseId} -> ${one.component}`).join(', ')})`;
  }
  if (reading.skipped.length > 0) {
    sentence +=
      `; ${String(reading.skipped.length)} case(s) not judged because their component name is shorter ` +
      `than ${String(reading.minNameLength)} characters`;
  }
  return sentence;
}

/**
 * The tokens two task texts share only because English needs them.
 *
 * ## Why the comparison drops them, and why that raises the similarity it reports
 *
 * Without the list, two prompts that differ by one function word score `1 - 1/(n+1)`
 * for a vocabulary of `n` -- 0.87 at fifteen tokens -- and two prompts about different
 * incidents that happen to sit at the same sentence length score almost the same. The
 * list removes the part of the sentence that carries no subject from **both** sides,
 * which pulls a real near duplicate up to exactly 1.0 and pushes a topical coincidence
 * down, because the coincidence was carried by words like `after`, `while` and `at`.
 *
 * The list is English. A CJK prompt is tokenised one character per token (see
 * `tokeniseTaskText`) and no character is dropped, which makes the comparison for those
 * prompts stricter than a stop-word list would be -- fewer tokens are ignored, so two
 * prompts have to agree on more of them. Nothing in this repository ships a CJK prompt
 * today; when one arrives, the pairwise reading prints its similarity and that figure
 * is the calibration point.
 */
export const TASK_TEXT_STOP_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'these',
  'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'of', 'to', 'in', 'on',
  'at', 'for', 'with', 'from', 'by', 'as', 'it', 'its', 'their', 'there', 'here',
  'over', 'under', 'after', 'before', 'during', 'while', 'no', 'not', 'so', 'such',
  'into', 'onto', 'out', 'up', 'down', 'again', 'once', 'both', 'each', 'all', 'any',
]);

/**
 * A task text as the set of tokens a reader would compare it by.
 *
 * Latin runs are split on anything that is not a letter or a digit, so `checkout-api`
 * and `checkout api` are the same two tokens in the same order. A CJK character is a
 * token on its own: those scripts do not put spaces between words, and the alternative
 * -- `[a-z0-9]+` alone -- would tokenise `订单服务变慢了` to the empty set, which the
 * caller would then have to treat as either a duplicate or a skip and both would be
 * wrong.
 */
export function tokeniseTaskText(text: string): string[] {
  const tokens = text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]/g) ?? [];
  return tokens.filter((token) => !TASK_TEXT_STOP_WORDS.has(token));
}

/**
 * Set Jaccard similarity: the shared token count over the size of the union.
 *
 * Both sides are non-empty here, and that is the caller's guard rather than this function's.
 * `readPairSimilarity` counts a pair with an empty side under `skippedNoQuery` *before* it asks
 * for a number, because "the two prompts share nothing" and "one prompt was not there" are two
 * findings and a 0 returned here would merge them into the second. A size check in this function
 * would be a second writer of that decision, and the one thing this repository has measured
 * repeatedly is what happens to the copy that nothing runs.
 */
function jaccardOf(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * Intersection over union of two half-open windows, or `null` when a bound is unreadable.
 *
 * Half-open on purpose: two incidents that follow one another share no instant, so
 * `end === start` is 0 rather than 1. A zero-length window -- a case whose start and end
 * are the same millisecond -- has no union and is reported as 0, because the alternative
 * is to call every pair of degenerate windows maximally overlapping.
 *
 * `null` is the answer for a bound `Date.parse` cannot read. G1 rejects such a case, and
 * G5 must still not throw on it: `runAllGates` calls every gate on every set, so a gate
 * that threw would replace a gate report with an exception.
 */
function windowOverlap(left: FaultCase['window'], right: FaultCase['window']): number | null {
  const bounds = [left.start, left.end, right.start, right.end].map((bound) => Date.parse(bound));
  if (bounds.some((bound) => Number.isNaN(bound))) return null;
  const [leftStart, leftEnd, rightStart, rightEnd] = bounds as [number, number, number, number];
  const union = Math.max(leftEnd, rightEnd) - Math.min(leftStart, rightStart);
  if (union <= 0) return 0;
  const intersection = Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
  return intersection / union;
}

export interface PairSimilarityReading {
  /** Cases the set contained. */
  cases: number;
  /** Unordered pairs the set contained: `n * (n - 1) / 2`. */
  pairs: number;
  /** Pairs this rule compared on task text: same system, both sides tokenised to something. */
  judgedTaskText: number;
  /** Pairs this rule compared on window: same system, four readable bounds. */
  judgedWindows: number;
  /** Pairs it did not compare at all, because the two cases belong to different systems. */
  skippedCrossSystem: number;
  /** Pairs within one system whose task text was absent or empty on at least one side. */
  skippedNoQuery: number;
  /** Pairs within one system whose window had a bound that could not be read. */
  skippedMalformedWindow: number;
  /** The pair with the highest task-text similarity, and what that similarity was. */
  closestTaskText: { a: string; b: string; jaccard: number } | null;
  /** The pair with the highest window overlap, and what that overlap was. */
  mostOverlappingWindow: { a: string; b: string; iou: number } | null;
  /** Pairs at or above the task-text threshold. */
  nearDuplicates: Array<{ a: string; b: string; jaccard: number }>;
  /** Pairs at or above the window threshold. */
  overlappingWindows: Array<{ a: string; b: string; iou: number }>;
  /** The two boundaries the verdicts were reached against. */
  thresholds: { taskTextJaccard: number; windowIou: number };
}

/**
 * Whether the set contains the same case twice, measured on what a solver would read.
 *
 * ## Why the fingerprint could not answer this
 *
 * `caseFingerprint` hashes a six-tuple that includes `injectTime` and both window bounds,
 * which makes it an identity test rather than a similarity test: move one of those six
 * fields by a minute and the hash changes, so the same incident re-typed into the set is
 * two cases to it. It is the right rule for `PUBLIC_SET_CONTAMINATION`, where the claim
 * is "this case *is* that published case", and it is blind to the claim this arm makes,
 * which is "these two cases are one incident" and is a statement about degrees.
 *
 * The earlier entry in `progress.md` said `G5 has no near-duplicate and no window-overlap
 * arm` and then listed the reason no witness could be offered: 435 same-system pairs, no
 * fingerprint collisions, and a maximum task-text Jaccard of 0.308. This function is the
 * answer to the first half; the second half is answered by returning the maximum rather
 * than only the verdict, because a rule whose only evidence is synthetic is a rule with
 * an unstated default, and a maximum printed every run is a calibration curve.
 *
 * ## Why two arms and not one
 *
 * They fail for different reasons and are repaired by different edits. A near-duplicate
 * prompt is a second write-up of one incident; two overlapping windows are two incidents
 * whose telemetry cannot be told apart, and their prompts may be as different as the two
 * faults are. A single "these cases are too similar" verdict would make the reader work
 * out which of the two they were looking at, and would let one arm's threshold move the
 * other's population.
 */
export function readPairSimilarity(
  bundle: IrBundle,
  options: G5Options = {},
): PairSimilarityReading {
  const thresholds = {
    taskTextJaccard: options.maxTaskTextJaccard ?? 0.9,
    windowIou: options.maxWindowIou ?? 0.5,
  };
  const reading: PairSimilarityReading = {
    cases: bundle.cases.length,
    pairs: 0,
    judgedTaskText: 0,
    judgedWindows: 0,
    skippedCrossSystem: 0,
    skippedNoQuery: 0,
    skippedMalformedWindow: 0,
    closestTaskText: null,
    mostOverlappingWindow: null,
    nearDuplicates: [],
    overlappingWindows: [],
    thresholds,
  };

  // Tokenised once per case rather than once per pair: the work is in the pair loop, and
  // re-tokenising would make an O(n^2) comparison O(n^2 * |text|) for no reason.
  //
  // Indexed by position rather than keyed by `caseId`. A bundle may carry the same id twice --
  // nothing in the IR forbids it, and the whole point of `DUPLICATE_CASE` is that a set can --
  // so a map would make the second case silently inherit the first one's tokens and the pair
  // would be compared with itself.
  const tokens: ReadonlySet<string>[] = bundle.cases.map(
    (c) => new Set(tokeniseTaskText(c.query ?? '')),
  );

  for (let i = 0; i < bundle.cases.length; i += 1) {
    for (let j = i + 1; j < bundle.cases.length; j += 1) {
      const left = bundle.cases[i] as FaultCase;
      const right = bundle.cases[j] as FaultCase;
      reading.pairs += 1;

      // Cross-system pairs are not one incident written twice: the same prompt over two
      // graphs asks two different questions, and one system's two faults at one moment
      // cannot contaminate the other's telemetry.
      if (left.system !== right.system) {
        reading.skippedCrossSystem += 1;
        continue;
      }

      const leftTokens = tokens[i] as ReadonlySet<string>;
      const rightTokens = tokens[j] as ReadonlySet<string>;
      if (leftTokens.size === 0 || rightTokens.size === 0) {
        reading.skippedNoQuery += 1;
      } else {
        reading.judgedTaskText += 1;
        const jaccard = jaccardOf(leftTokens, rightTokens);
        if (reading.closestTaskText === null || jaccard > reading.closestTaskText.jaccard) {
          reading.closestTaskText = { a: left.caseId, b: right.caseId, jaccard };
        }
        if (jaccard >= thresholds.taskTextJaccard) {
          reading.nearDuplicates.push({ a: left.caseId, b: right.caseId, jaccard });
        }
      }

      const iou = windowOverlap(left.window, right.window);
      if (iou === null) {
        reading.skippedMalformedWindow += 1;
      } else {
        reading.judgedWindows += 1;
        if (reading.mostOverlappingWindow === null || iou > reading.mostOverlappingWindow.iou) {
          reading.mostOverlappingWindow = { a: left.caseId, b: right.caseId, iou };
        }
        if (iou >= thresholds.windowIou) {
          reading.overlappingWindows.push({ a: left.caseId, b: right.caseId, iou });
        }
      }
    }
  }
  return reading;
}

/**
 * The pairwise reading in the sentence a reader can check.
 *
 * Printed by the caller that owns a corpus, in the same shape as the other readings
 * there: a number, its denominator, and the boundary it applied. The two maximums are
 * part of the sentence rather than a debug field because they are the rule's only
 * evidence on a corpus with no witness -- with them it says "I looked, and the closest
 * pair is 0.24 against a line at 0.90"; without them it says "passed", which is what a
 * rule that never ran its body also says.
 */
export function describePairSimilarity(reading: PairSimilarityReading): string {
  if (reading.pairs === 0) {
    return `pairwise similarity: no pair to compare in a set of ${String(reading.cases)} case(s)`;
  }
  const sameSystem = reading.pairs - reading.skippedCrossSystem;
  const text =
    reading.closestTaskText === null
      ? 'no pair carried task text on both sides'
      : `closest task text ${reading.closestTaskText.jaccard.toFixed(2)} ` +
        `(${reading.closestTaskText.a} <-> ${reading.closestTaskText.b})`;
  const window =
    reading.mostOverlappingWindow === null
      ? 'no pair had two readable windows'
      : `most overlapping window ${reading.mostOverlappingWindow.iou.toFixed(2)} ` +
        `(${reading.mostOverlappingWindow.a} <-> ${reading.mostOverlappingWindow.b})`;
  return (
    `pairwise similarity: ${String(sameSystem)} of ${String(reading.pairs)} pair(s) share a ` +
    `system, and ${String(reading.judgedTaskText)} carry task text on both sides; ${text} ` +
    `against a ${reading.thresholds.taskTextJaccard.toFixed(2)} threshold, ${window} against ` +
    `${reading.thresholds.windowIou.toFixed(2)}; ${String(reading.nearDuplicates.length)} ` +
    `near-duplicate(s) and ${String(reading.overlappingWindows.length)} overlapping window(s)`
  );
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

  // The two arms below answer two different questions about the same case, and the difference is
  // the reason both exist. `ANSWER_KEY_NOT_ISOLATED` reads a declaration: the case says the key is
  // stored apart from the payload. `LEAK_IN_QUERY` measures the prompt. A case can pass the first
  // and fail the second -- the corpus does, nineteen times -- and a gate that only asked the
  // declaration would report the corpus clean.
  for (const leak of readPromptLeaks(bundle, options).leaks) {
    v.push({
      code: 'LEAK_IN_QUERY',
      message:
        `case '${leak.caseId}' names its root-cause component ('${leak.component}') in the task text, ` +
        'so locating it is a reading exercise rather than a diagnosis',
      fieldPath: `${leak.caseId}.query`,
    });
  }

  // The two arms below compare a case with another case, which is the one comparison the
  // word *pollution* is about and the one the gate did not make: four arms compared cases
  // with a pattern, a public fingerprint, a declaration and a component name, and a set of
  // thirty incidents could have been twenty-two incidents with eight of them counted twice
  // without a single violation. Both are read through `readPairSimilarity` so that the
  // verdict and the printed reading are one computation.
  const pairs = readPairSimilarity(bundle, options);
  for (const duplicate of pairs.nearDuplicates) {
    v.push({
      code: 'NEAR_DUPLICATE_QUERY',
      message:
        `case '${duplicate.b}' repeats '${duplicate.a}' -- their task texts share ` +
        `${duplicate.jaccard.toFixed(2)} of their vocabulary against a ` +
        `${pairs.thresholds.taskTextJaccard.toFixed(2)} threshold, so the set counts one ` +
        'incident twice',
      fieldPath: `${duplicate.b}.query`,
    });
  }
  for (const overlap of pairs.overlappingWindows) {
    v.push({
      code: 'OVERLAPPING_WINDOW',
      message:
        `cases '${overlap.a}' and '${overlap.b}' share ${overlap.iou.toFixed(2)} of their ` +
        `window against a ${pairs.thresholds.windowIou.toFixed(2)} threshold, so neither ` +
        "case's telemetry is attributable to its own injection",
      fieldPath: `${overlap.b}.window`,
    });
  }

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
