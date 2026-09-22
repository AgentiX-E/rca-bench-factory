/**
 * Fault validity verification.
 *
 * G3 answers "did some metric move a statistically significant amount". This
 * module answers the question before it: **did this fault actually happen**. The
 * distinction is not academic. G3 aggregates metric series by
 * `service.name|metric.name` and asks whether any group sustains |Z| >= 2, so a
 * case whose ground truth names CPU saturation passes while the only series that
 * moved is request latency -- and a case whose metric was already saturated
 * before injection passes too, because G3 computes a baseline but never asserts
 * anything about it.
 *
 * ---
 *
 * ## Independence
 *
 * `09-推进进度追踪.md` P1-1 requires a verification path independent of the
 * generation path, on the grounds that a verifier reusing the generator's
 * criteria only confirms that what we made matches what we assumed. Cloud-OpsBench
 * meets this with a separate Verifier agent. This module meets it three ways, and
 * each is asserted in `test/validity.test.ts` rather than left to intent:
 *
 *   1. It imports nothing from `ir/assembler.ts`, `fault/importer.ts` or
 *      `fault/collector.ts`.
 *   2. It value-imports nothing from `ir/` at all -- every `ir/` import is
 *      `import type`, so it does not even hold the vocabularies that decide what
 *      a legal case looks like.
 *   3. It never reads `fault.parameters`. A verifier that could see
 *      `{ intensity: 90 }` could confirm the fault by reading it back instead of
 *      by looking at telemetry.
 *
 * What it receives is `(FaultCase, TelemetrySignal[])` and the entity graph --
 * the same inputs a grader would have.
 *
 * ## Three verdicts
 *
 * `invalid` and `unverifiable` are different answers and are kept different. When
 * the telemetry contains no series the mechanism could possibly move, the honest
 * report is that we cannot tell, not that the fault failed. Collapsing the two
 * would manufacture confidence, which is the failure mode this module exists to
 * prevent.
 */

import type {
  FaultCase,
  FaultCategory,
  FaultValidityReport,
  IrBundle,
  MetricSemanticType,
  TelemetrySignal,
  ValidityCheck,
} from '../ir/types.js';

/**
 * What the telemetry must show for a fault of a given category to count as having
 * happened.
 *
 * `semanticTypes` is preferred over `namePattern` where a metric declares its
 * semantic type, because that is a declaration rather than a guess about naming.
 * `namePattern` exists for the common case where it does not.
 *
 * A category with neither and `unverifiable: true` is a deliberate admission:
 * we do not know what this mechanism moves, so we do not claim to check it.
 * Silence would be worse than an admission, because a category that is quietly
 * unchecked reads exactly like one that is checked.
 */
export interface FaultExpectation {
  /** Metric semantic types whose movement would evidence this mechanism. */
  semanticTypes: MetricSemanticType[];
  /** Metric name pattern that would evidence this mechanism. */
  namePattern?: RegExp;
  /**
   * Log severities that corroborate the mechanism, if any. Corroboration never
   * substitutes for a metric moving -- it is recorded in the check detail so a
   * reader can see what else was present.
   */
  logSeverities?: string[];
  /** Signal kinds that corroborate, for the same purpose. */
  signalKinds?: string[];
  /** True when the category's mechanism is not known well enough to assert. */
  unverifiable?: boolean;
}

/**
 * The mechanism table.
 *
 * Derived from the fault taxonomy in `fault/collector.ts` (`CATEGORY_KEYWORDS`),
 * which already maps these eight categories onto fault-type keywords. The table
 * is total over `FAULT_CATEGORIES` and both directions are asserted in the test
 * suite, so adding a category to the IR without deciding what it moves is a red
 * suite rather than a silent gap.
 */
export const FAULT_EXPECTATIONS: Record<FaultCategory, FaultExpectation> = {
  // CPU / memory / disk / IO saturation shows up as a saturation semantic type,
  // or failing that as a metric whose name says what is saturated.
  resource: {
    semanticTypes: ['saturation'],
    namePattern: /cpu|mem|memory|disk|io|fs|load|usage/i,
  },
  // Network faults move request timing. A delay raises latency, a loss raises
  // error rate, a partition drops throughput -- any of the three is evidence.
  network: {
    semanticTypes: ['latency', 'error_rate', 'throughput'],
    namePattern: /latency|duration|rtt|error|fail|timeout|throughput|qps|rps/i,
    signalKinds: ['trace'],
  },
  // Runtime faults (OOM, crash, panic) surface as errors and as error logs.
  runtime: {
    semanticTypes: ['error_rate'],
    namePattern: /error|fail|crash|restart|oom|exception/i,
    logSeverities: ['ERROR', 'FATAL'],
    signalKinds: ['event'],
  },
  // Middleware faults (queue, cache, db connection) show up as latency or errors.
  middleware: {
    semanticTypes: ['latency', 'error_rate'],
    namePattern: /latency|error|fail|timeout|queue|pool|conn/i,
    logSeverities: ['ERROR', 'FATAL'],
  },
  // Code faults are logic errors: they produce wrong answers and failed requests.
  code: {
    semanticTypes: ['error_rate'],
    namePattern: /error|fail|exception|http_5|status_5/i,
    logSeverities: ['ERROR', 'FATAL'],
  },
  // Config faults take effect as behaviour changes -- errors, or the change event
  // itself. A config change that changes nothing observable is not a benchmark case.
  config: {
    semanticTypes: ['error_rate'],
    namePattern: /error|fail|restart|reload|config/i,
    logSeverities: ['ERROR', 'FATAL'],
    signalKinds: ['event'],
  },
  // Dependency faults are felt at the call boundary: latency up or errors up.
  dependency: {
    semanticTypes: ['latency', 'error_rate'],
    namePattern: /latency|error|fail|timeout|upstream|downstream/i,
    signalKinds: ['trace'],
  },
  // The taxonomy's own escape hatch. If the fault's mechanism is "unclassified",
  // so is our ability to verify it, and we say so.
  unknown: {
    semanticTypes: [],
    unverifiable: true,
  },
};

/** The expectation for a fault, by category. Unknown categories are unverifiable. */
export function expectedSignalsFor(fault: Pick<FaultCase['fault'], 'type' | 'category'>): FaultExpectation {
  const known = FAULT_EXPECTATIONS[fault.category];
  if (known !== undefined) return known;
  // A category outside the union cannot happen through the type system, but a
  // bundle is parsed from JSON and the schema is not the only way in.
  return { semanticTypes: [], unverifiable: true };
}

/** Tunables. Defaults are the ones the reference fixture is calibrated against. */
export interface ValidityOptions {
  /** Minimum |Z| for a sample to count as anomalous. Matches G3's default. */
  minAbsZ?: number;
  /** Consecutive anomalous samples required for a sustained crossing. */
  minSustainedSamples?: number;
  /**
   * How far the first sustained crossing may sit from `injectTime`, in seconds.
   * Injection is not instantaneous -- a chaos experiment starts, the container
   * feels it, the metric scrapes it -- so an exact match would reject real cases.
   */
  onsetToleranceSeconds?: number;
  /**
   * Minimum |Z| for a sample to count as a *pre-existing* anomaly.
   *
   * Deliberately higher than `minAbsZ`. Judging "was this already broken before
   * injection" against the same threshold used to find the anomaly produces
   * false positives at the decision boundary: the reference fixture's baseline is
   * `[20, 21, 19, 20, 22, 18, ...]`, and against an establishing slice of three
   * samples sigma is exactly 1.0, so the values 22 and 18 sit at precisely
   * |Z| = 2.000 and were reported as a pre-existing fault. They are ordinary
   * jitter in a series whose injected anomaly reaches |Z| = 65.
   *
   * A measurement that is worth reporting as a pre-existing fault must be
   * unambiguously anomalous, not merely at the boundary. The margin is stated
   * here rather than buried in the comparison.
   */
  preexistingMinAbsZ?: number;
}

const DEFAULTS = {
  minAbsZ: 2.0,
  minSustainedSamples: 3,
  onsetToleranceSeconds: 120,
  preexistingMinAbsZ: 4.0,
} as const;

/** A metric series grouped by the entity that emitted it and its metric name. */
interface Series {
  key: string;
  service: string;
  name: string;
  semanticType?: MetricSemanticType;
  points: Array<{ t: number; value: number }>;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mu = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1));
}

function zScore(value: number, mu: number, sigma: number, epsilon = 1e-6): number {
  return (value - mu) / Math.max(sigma, epsilon);
}

/**
 * Group metric signals into series.
 *
 * Reimplemented here rather than imported from `gates.ts` on purpose: sharing the
 * implementation would mean a change to G3's grouping silently changes what this
 * verifier sees, and the two are supposed to be independent readings of the same
 * telemetry. The duplication is the point, and it is small.
 */
function toSeries(signals: TelemetrySignal[]): Series[] {
  const byKey = new Map<string, Series>();
  for (const s of signals) {
    if (s.payload.kind !== 'metric') continue;
    const t = Date.parse(s.timestamp);
    if (Number.isNaN(t)) continue;
    const service = s.resource['service.name'];
    const key = `${service}|${s.payload.name}`;
    let series = byKey.get(key);
    if (series === undefined) {
      series = {
        key,
        service,
        name: s.payload.name,
        ...(s.payload.semanticType === undefined ? {} : { semanticType: s.payload.semanticType }),
        points: [],
      };
      byKey.set(key, series);
    }
    series.points.push({ t, value: s.payload.value });
  }
  for (const series of byKey.values()) series.points.sort((a, b) => a.t - b.t);
  return [...byKey.values()];
}

/** Does this series' movement count as evidence for this expectation? */
function matchesExpectation(series: Series, expectation: FaultExpectation): boolean {
  if (expectation.semanticTypes.length > 0 && series.semanticType !== undefined) {
    if (expectation.semanticTypes.includes(series.semanticType)) return true;
  }
  if (expectation.namePattern !== undefined && expectation.namePattern.test(series.name)) return true;
  return false;
}

/**
 * The outcome of reading one series against its own baseline.
 *
 * `baselineAnomalies` is measured against an **early** slice of the baseline, not
 * the whole thing, and that distinction is the whole reason this check works.
 *
 * The first implementation compared every baseline sample against statistics
 * computed from all of them, which makes a pre-existing anomaly self-cancelling:
 * ten samples of 95% followed by ten of 96% have a tiny sigma, so nothing is
 * anomalous and the check passes. The fixture that caught this had six normal
 * samples and four saturated ones, and the check still passed -- because the four
 * saturated samples were inside the very baseline used to judge them. It could
 * never fire.
 *
 * So the baseline window is split: `minSustainedSamples` at the start establish
 * what normal looks like, and the remainder is measured against that. This is
 * deliberately the stricter reading -- a series that drifts upward before
 * injection is reported, which is correct, because a fault injection is not the
 * explanation for a change that predates it.
 */
interface SeriesReading {
  series: Series;
  baselineSize: number;
  anomalies: number[];
  /** Timestamp of the first sample starting a sustained anomalous run, or null. */
  onsetMs: number | null;
  /** How many post-establishment baseline samples were already anomalous. */
  baselineAnomalies: number;
  sigma: number;
  /**
   * Whether the baseline was large enough to define normal at all.
   *
   * A reading taken against two samples is not a weak reading, it is not a
   * reading: `stddev([20, 21])` is 0.7, so anything in the nineties sits tens of
   * sigma out and *every* injected fault looks validated. The flag exists so the
   * caller can decline to conclude, which is what this function's own comment
   * above used to promise without anything enforcing it.
   */
  baselineEstablished: boolean;
  /** Statistics used to judge, exposed so the detail can quote them. */
  baselineMean: number;
  baselineStddev: number;
}

function readSeries(series: Series, injectMs: number, options: Required<ValidityOptions>): SeriesReading {
  const baselinePoints = series.points.filter((p) => p.t < injectMs);
  const post = series.points.filter((p) => p.t >= injectMs);

  // The first `minSustainedSamples` baseline samples define normal. With fewer
  // than that there is nothing to establish a baseline from, and the caller
  // treats the case as unverifiable rather than guessing.
  const establishCount = options.minSustainedSamples;
  const establishing = baselinePoints.slice(0, establishCount).map((p) => p.value);
  const restOfBaseline = baselinePoints.slice(establishCount);

  // Two samples produce a tiny sigma, and a tiny sigma makes every later sample
  // look infinitely anomalous. `baselineEstablished` is therefore a precondition
  // for reading the series at all, not a softening of the result.
  const baselineEstablished = establishing.length >= establishCount;

  const mu = mean(establishing);
  const sigma = stddev(establishing);
  const anomalous = (v: number): boolean => Math.abs(zScore(v, mu, sigma)) >= options.minAbsZ;
  const preexistingAnomalous = (v: number): boolean =>
    Math.abs(zScore(v, mu, sigma)) >= options.preexistingMinAbsZ;

  // Measured against the establishing slice, so an anomaly that predates the
  // injection cannot hide inside the statistics that judge it.
  const baselineAnomalies = restOfBaseline.filter((p) => preexistingAnomalous(p.value)).length;

  let best = 0;
  let current = 0;
  let onsetMs: number | null = null;
  let currentStartMs: number | null = null;
  if (baselineEstablished) {
    for (const p of post) {
      if (anomalous(p.value)) {
        current += 1;
        if (currentStartMs === null) currentStartMs = p.t;
        if (current > best) {
          best = current;
          // Only record onset once the run is sustained; a single spike is not onset.
          if (current >= options.minSustainedSamples && onsetMs === null) onsetMs = currentStartMs;
        }
      } else {
        current = 0;
        currentStartMs = null;
      }
    }
  }

  return {
    series,
    baselineSize: establishing.length,
    anomalies: baselineEstablished
      ? post.filter((p) => anomalous(p.value)).map((p) => p.t)
      : [],
    onsetMs,
    baselineAnomalies,
    sigma,
    baselineEstablished,
    baselineMean: mu,
    baselineStddev: sigma,
  };
}

/**
 * Verify that the fault a case declares is the fault the telemetry shows.
 *
 * The returned report is a flat list of checks in the style of
 * `score/score.ts`'s structure reports: each carries an id, a verdict and a
 * human-readable detail, and the top-level verdict is derived from them.
 */
export function verifyFaultValidity(bundle: IrBundle, options: ValidityOptions = {}): FaultValidityReport {
  const resolved: Required<ValidityOptions> = { ...DEFAULTS, ...options };
  const faultCase = bundle.cases[0];
  if (faultCase === undefined) {
    return {
      caseId: '',
      verdict: 'unverifiable',
      checks: [
        {
          id: 'case-present',
          passed: false,
          detail: 'the bundle carries no cases, so there is no fault to verify',
        },
      ],
      target: { entityId: null, service: null },
      observed: { affectedSeries: [], onsetOffsetSeconds: null },
    };
  }

  const signals = bundle.signals[faultCase.caseId] ?? [];
  const expectation = expectedSignalsFor(faultCase.fault);
  const injectMs = Date.parse(faultCase.injectTime);
  const checks: ValidityCheck[] = [];

  // --- target-resolves -----------------------------------------------------
  const entity = bundle.graph.entities.find((e) => e.entityId === faultCase.groundTruth.rootCauseEntityId);
  const targetResolves = entity !== undefined;
  checks.push({
    id: 'target-resolves',
    passed: targetResolves,
    detail: targetResolves
      ? `ground-truth root cause '${entity.entityId}' resolves to ${entity.kind} '${entity.name}'`
      : `ground-truth root cause '${faultCase.groundTruth.rootCauseEntityId}' is not in the entity graph`,
  });
  const targetService = entity?.name ?? null;

  // --- target-observed -----------------------------------------------------
  const series = toSeries(signals);
  const targetSeries = targetService === null ? [] : series.filter((s) => s.service === targetService);
  const targetObserved = targetSeries.length > 0;
  checks.push({
    id: 'target-observed',
    passed: targetObserved,
    detail: targetObserved
      ? `'${targetService}' emitted ${targetSeries.length} metric series in this case`
      : `'${targetService ?? faultCase.groundTruth.rootCauseComponent}' emitted no metric series, ` +
        `so nothing about it could be observed`,
  });

  // --- mechanism-manifested ------------------------------------------------
  const readings = targetSeries.map((s) => readSeries(s, injectMs, resolved));
  const matching = readings.filter((r) => matchesExpectation(r.series, expectation));
  // A series whose baseline never established cannot contribute a finding. It
  // is excluded here rather than counted as "did not move", because those are
  // different claims: one says the fault is absent, the other says we could not
  // tell. Only the first is evidence.
  const readable = matching.filter((r) => r.baselineEstablished);
  const moved = readable.filter((r) => r.onsetMs !== null);

  // Whether the report rests on evidence that could speak at all.
  //
  // Three situations look alike from inside the mechanism loop and are not, so
  // the distinction is drawn on what was *observed* rather than on what matched:
  //
  //   - the service emitted no metric series at all -- nothing was seen, so
  //     nothing is concluded. `unverifiable`.
  //   - it emitted series, but none matched the expected mechanism -- the data
  //     did speak, and what it shows is a different mechanism. `invalid`.
  //     A `cpu` fault whose telemetry is entirely latency is positive evidence
  //     that the CPU fault did not manifest, not a gap in the record.
  //   - it emitted matching series whose baselines were too thin to judge --
  //     evidence exists but cannot be read. `unverifiable`.
  //
  // The first draft keyed this on `matching.length === 0` and reported the
  // second case as `unverifiable`, which silently downgraded a real `invalid`;
  // the second draft keyed it on `matching.some(...)` and reported the first
  // case as `invalid`. Both are visible in the tests that had to be reverted.
  const nothingObserved = !targetObserved;
  // A ground truth that names an entity the graph does not contain is a defect
  // in the case itself, and it is conclusive: no telemetry could make it
  // checkable, because there is no service to look for. That makes it the one
  // failure that survives the guard below -- an unresolvable target is not a
  // gap in the record, it is the record disagreeing with itself.
  const mechanismIsReadable =
    !targetResolves ||
    (!nothingObserved && (matching.length === 0 || matching.some((r) => r.baselineEstablished)));

  if (expectation.unverifiable === true) {
    checks.push({
      id: 'mechanism-manifested',
      passed: true,
      detail:
        `fault category '${faultCase.fault.category}' has no defined mechanism, ` +
        `so this check asserts nothing`,
    });
  } else {
    checks.push({
      id: 'mechanism-manifested',
      passed: moved.length > 0,
      detail:
        moved.length > 0
          ? `${moved.length} series consistent with '${faultCase.fault.category}' moved: ` +
            moved.map((r) => r.series.key).join(', ')
          : `no series consistent with '${faultCase.fault.category}' moved; the case declares ` +
            `'${faultCase.fault.type}' but the telemetry does not show it`,
    });
  }

  // --- onset-precision -----------------------------------------------------
  const observedOnsets = moved
    .map((r) => r.onsetMs)
    .filter((v): v is number => v !== null);
  const onsetOffsetSeconds =
    observedOnsets.length === 0 ? null : Math.round((Math.min(...observedOnsets) - injectMs) / 1000);
  const onsetWithinTolerance =
    onsetOffsetSeconds === null
      ? false
      : Math.abs(onsetOffsetSeconds) <= resolved.onsetToleranceSeconds;
  // `onsetMs` is drawn only from samples at or after the injection, so the
  // offset below is never negative and the sign is always `+`. The first draft
  // carried a `>= 0 ? '+' : ''` ternary here; it was unreachable, because an
  // anomaly that starts before the injection is part of the baseline window and
  // so can never be the onset. Removed rather than covered, since a branch that
  // cannot be taken is a claim about the code that is not true.
  checks.push({
    id: 'onset-precision',
    passed: onsetWithinTolerance,
    detail:
      onsetOffsetSeconds === null
        ? 'no sustained anomaly was found, so no onset could be located'
        : `first sustained anomaly at +${onsetOffsetSeconds}s ` +
          `from injection (tolerance ±${resolved.onsetToleranceSeconds}s)`,
  });

  // --- sustained-duration --------------------------------------------------
  const onsetMs = observedOnsets.length === 0 ? null : Math.min(...observedOnsets);
  const sustainedRun =
    onsetMs === null
      ? 0
      : Math.max(
          ...moved.map((r) => {
            const from = r.series.points.filter((p) => p.t >= onsetMs);
            let run = 0;
            for (const p of from) {
              if (r.anomalies.includes(p.t)) run += 1;
              else break;
            }
            return run;
          }),
          0,
        );
  checks.push({
    id: 'sustained-duration',
    passed: sustainedRun >= resolved.minSustainedSamples,
    detail: `longest sustained run after onset is ${sustainedRun} sample(s), ` +
      `requiring ${resolved.minSustainedSamples}`,
  });

  // --- no-preexisting-anomaly ----------------------------------------------
  // The check G3 does not have. A metric already anomalous in the baseline window
  // is not evidence that the injection did anything, and reporting it as though it
  // were is the specific overclaim this module exists to stop.
  const preexisting = readings.filter((r) => r.baselineAnomalies > 0);
  checks.push({
    id: 'no-preexisting-anomaly',
    passed: preexisting.length === 0,
    detail:
      preexisting.length === 0
        ? 'every measured series was within its baseline range before injection'
        : `${preexisting.length} series were already anomalous before injection: ` +
          preexisting.map((r) => `${r.series.key} (${r.baselineAnomalies} baseline samples)`).join(', '),
  });

  // --- verdict -------------------------------------------------------------
  const failed = checks.filter((c) => !c.passed);
  const hasAnyCheckThatCouldFail = expectation.unverifiable !== true && mechanismIsReadable;
  let verdict: FaultValidityReport['verdict'];
  if (failed.length === 0) {
    verdict = 'valid';
  } else if (!hasAnyCheckThatCouldFail) {
    // Nothing about this case was checkable. That is not the same as the case
    // being wrong, and reporting it as wrong would be a claim the data cannot support.
    verdict = 'unverifiable';
  } else {
    verdict = 'invalid';
  }

  return {
    caseId: faultCase.caseId,
    verdict,
    checks,
    target: { entityId: faultCase.groundTruth.rootCauseEntityId, service: targetService },
    observed: {
      affectedSeries: moved.map((r) => r.series.key),
      onsetOffsetSeconds,
    },
  };
}
