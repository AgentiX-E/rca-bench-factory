import { locatedRank } from '../gates/gates.js';
import type { BaselineOutcome } from '../gates/gates.js';
import { mean, stddev, zScore } from '../gates/gates.js';
import type { FaultCase, TelemetrySignal } from '../ir/types.js';

/**
 * A baseline localiser, so that G4 can be asked at all.
 *
 * G4 asks whether a case is *solvable*: at least one baseline has to place the true root cause
 * inside its top-K. It consumes `BaselineOutcome`s, which means the gate is only as meaningful as
 * the run that produced them -- and until this module existed, no run existed for the annotated
 * corpus, so G4 had never been asked of it.
 *
 * The method here is deliberately dull: for every metric, take the baseline's mean and standard
 * deviation from the samples **before** the onset, compute the largest absolute z-score any
 * post-onset sample reaches, keep the maximum per service, and rank services by it. Ties are
 * broken by service name so two runs produce the same order. Nothing about it is clever, and
 * cleverness is not the point -- the point is that it reads only what a solver would be given.
 *
 * ## What it must not read
 *
 * `rankServicesByPeakZScore` takes the `FaultCase` for its timestamps and nothing else. It does
 * not look at `groundTruth`, and a test asserts that by handing it a case whose answer key has
 * been emptied and checking the ranking is unchanged. A localiser that peeked would make G4 a
 * certificate rather than a measurement, and the difference is exactly the one this repository
 * keeps having to draw.
 *
 * ## What a rank of 1 does not mean
 *
 * It does not mean the case is hard, or that a real RCA system would find it. The signals were
 * derived from the annotation, so a peak-z method finding the annotated service is close to
 * tautological -- the service with the constructed anomaly *is* the answer. What it establishes is
 * narrower and still worth having: **the case carries a locatable structure**, and G4's first
 * condition can be met by a run rather than assumed. Difficulty needs many cases and a spread of
 * baselines, and `G4Options.distributionMinCases` says so.
 */

export interface ServiceRank {
  service: string;
  /** Largest |z| any of this service's metrics reached after the onset. */
  peakZ: number;
}

export interface LocalisationReading {
  ranking: ServiceRank[];
  /** The K this reading is scored at -- the benchmark's, never the ranking's own length. */
  topK: number;
  /** How many services the ranking holds. A case with two is not a top-3 localisation test. */
  candidateCount: number;
}

/** The method name recorded in every outcome, so a later reader knows what produced a rank. */
export const PEAK_Z_METHOD = 'peak-z-by-service';

const DEFAULT_TOP_K = 3;


/**
 * Rank the services by the largest absolute z-score any of their metrics reaches after onset.
 *
 * Only metric signals participate: a log or a span has no baseline distribution to be surprised
 * by, and quietly treating one as a number would put a name in the ranking that nothing measured.
 */
export function rankServicesByPeakZScore(
  faultCase: FaultCase,
  signals: readonly TelemetrySignal[],
  options: { topK?: number } = {},
): LocalisationReading {
  const onset = Date.parse(faultCase.injectTime);
  const baseline = new Map<string, number[]>();
  const post = new Map<string, number[]>();

  for (const signal of signals) {
    // Narrowed through a local rather than through `signal.payload`: TypeScript does not carry the
    // discriminant test across a property access on a frozen array element, and the cast it would
    // have needed is the kind of assertion that stops being true silently.
    const payload = signal.payload;
    if (payload.kind !== 'metric') continue;
    const at = Date.parse(signal.timestamp);
    if (Number.isNaN(at) || Number.isNaN(onset)) continue;
    const target = at < onset ? baseline : post;
    const key = `${signal.resource['service.name']}|${payload.name}`;
    const bucket = target.get(key) ?? [];
    bucket.push(payload.value);
    target.set(key, bucket);
  }

  const peakByService = new Map<string, number>();

  for (const [key, after] of post) {
    const before = baseline.get(key) ?? [];
    if (before.length === 0 || after.length === 0) continue;
    const mu = mean(before);
    const sigma = stddev(before);
    let peak = 0;
    for (const value of after) {
      peak = Math.max(peak, Math.abs(zScore(value, mu, sigma)));
    }
    const service = key.slice(0, key.indexOf('|'));
    peakByService.set(service, Math.max(peakByService.get(service) ?? 0, peak));
  }

  const ranking = [...peakByService.entries()]
    .map(([service, peakZ]) => ({ service, peakZ }))
    // Descending peak, then service name. The tiebreak is what makes the order a property of the
    // data: without it, equal peaks would come out in insertion order, which is the order the
    // signals happened to arrive in. `localeCompare` rather than a comparison chain because a
    // three-way comparator written by hand has two branches, and one of them is easy to leave
    // unexecuted -- the coverage table said so here, at 96.15% with this line named.
    .sort((left, right) => (right.peakZ !== left.peakZ ? right.peakZ - left.peakZ : left.service.localeCompare(right.service)));

  // The K the caller asked for, not the smaller of that and the ranking's length.
  //
  // The two numbers answer different questions and merging them answered neither. A benchmark
  // declaring `top-3` asks "did the method put the answer in its first three guesses"; a case whose
  // ranking is two services long cannot fail that question, and reporting `topK: 2` made the
  // failure impossible to see rather than impossible to have. G4 adds `candidateCount` to it and
  // refuses a case whose ranking is no wider than the K it is scored at (finding 275).
  const topK = options.topK ?? DEFAULT_TOP_K;
  return { ranking, topK, candidateCount: ranking.length };
}

/**
 * The outcome G4 consumes, for one case under this method.
 *
 * `rankOfTruth` is `null` when the annotated component is not in the ranking at all, which is a
 * different statement from "ranked last" and is kept distinct: a solver that produced no candidate
 * by that name did not place it badly, it did not place it.
 */
export function locateWithPeakZScore(
  faultCase: FaultCase,
  signals: readonly TelemetrySignal[],
  options: { topK?: number } = {},
): BaselineOutcome {
  const { ranking, topK } = rankServicesByPeakZScore(faultCase, signals, options);
  const truth = faultCase.groundTruth.rootCauseComponent;
  const at = ranking.findIndex((entry) => entry.service === truth);
  return {
    caseId: faultCase.caseId,
    method: PEAK_Z_METHOD,
    rankOfTruth: locatedRank(at === -1 ? undefined : ranking[at]!.peakZ, at),
    topK,
    candidateCount: ranking.length,
    candidates: ranking.map((one) => ({ service: one.service, statistic: one.peakZ })),
  };
}
