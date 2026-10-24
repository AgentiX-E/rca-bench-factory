import type { BaselineOutcome } from '../gates/gates.js';
import type { FaultCase, TelemetrySignal } from '../ir/types.js';

/**
 * A second baseline, with the opposite bias to the first.
 *
 * G4's rule is "at least one baseline places the true root cause inside its top-K", and with one
 * baseline that is a statement about that method. `baseline-localiser.ts` uses peak |z| per service,
 * which is sensitive to the largest single excursion a series contains -- and the corpus's series
 * were constructed to contain exactly one, so peak-z finding them is close to tautological. Adding a
 * second method only helps if the second one **fails differently**:
 *
 * | | peak-z (`baseline-localiser.ts`) | median-shift (here) |
 * | --- | --- | --- |
 * | a lone spike | dominates the statistic | invisible: one sample of four does not move a median |
 * | a contaminated baseline | inflates `sigma` until a real change looks ordinary | ignored: the median absolute deviation discards up to half the points |
 * | a sustained change | seen, scaled by the baseline's spread | seen, scaled by the baseline's robust spread |
 *
 * The two disagreement shapes are asserted in `robust-localiser.test.ts` with series built to
 * separate them, because a pair of baselines that agreed everywhere would measure nothing.
 *
 * ## The statistic
 *
 * For every metric: `|median(after) - median(before)| / max(1.4826 * MAD(before), epsilon)`, the
 * largest such value per service, ranked descending and ties broken by service name. The
 * `1.4826 * MAD` factor is the usual consistency constant that makes a normal distribution's MAD
 * equal its standard deviation, so the two statistics are on the same scale -- **which is the point
 * of choosing it**: the pair is meant to disagree about robustness, not about units.
 *
 * The `epsilon` floor matters. A baseline that never moved has a MAD of zero, and without a floor the
 * statistic would be infinite and incomparable with anything. The floor is the same `epsilon`
 * `zScore` uses, a choice rather than a fact, stated identically in both modules so that the two
 * methods cannot disagree about degenerate input.
 *
 * ## What a rank of 1 still does not mean
 *
 * The series were derived from the annotations, so both baselines are locating a construction. What
 * two methods establish is narrower than "this case is hard" and stronger than "one method likes
 * it": **the case carries a locatable structure that is not an artefact of one inductive bias**.
 * Difficulty still needs many cases and a spread of baselines.
 *
 * `rankServicesByMedianShift` reads the `FaultCase` for its timestamps and nothing else, and a test
 * empties the answer key to prove it -- the same property, asserted twice, because a second solver
 * with a peeking habit would be a second way to turn G4 into a certificate.
 */

export interface ShiftRank {
  service: string;
  /** Robust shift of this service's most-shifted metric, in units of the baseline's robust spread. */
  shift: number;
}

export interface ShiftReading {
  ranking: ShiftRank[];
  topK: number;
}

/** The method name recorded in every outcome, distinct from the peak-z one by construction. */
export const ROBUST_SHIFT_METHOD = 'median-shift-by-service';

/** Consistency constant: `1.4826 * MAD` estimates a normal distribution's standard deviation. */
const MAD_SCALE = 1.4826;

/** The same floor `zScore` applies to a zero standard deviation, for the same reason. */
const EPSILON = 1e-6;

const DEFAULT_TOP_K = 3;

/** The middle value, averaging the two middles for an even count. */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Rank the services by the largest robust shift any of their metrics shows after onset.
 *
 * Only metric signals participate: a log or a span has no baseline distribution to be surprised by,
 * and treating one as a number would put a name in the ranking that nothing measured.
 */
export function rankServicesByMedianShift(
  faultCase: FaultCase,
  signals: readonly TelemetrySignal[],
  options: { topK?: number } = {},
): ShiftReading {
  const onset = Date.parse(faultCase.injectTime);
  const baseline = new Map<string, number[]>();
  const post = new Map<string, number[]>();

  for (const signal of signals) {
    // Narrowed through a local rather than through `signal.payload`, for the reason the peak-z
    // module states: TypeScript does not carry the discriminant test across a property access on a
    // frozen array element, and the assertion it would have needed stops being true silently.
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

  const shiftByService = new Map<string, number>();

  for (const [key, after] of post) {
    const before = baseline.get(key) ?? [];
    if (before.length === 0 || after.length === 0) continue;
    const centre = medianOf(before);
    const scale = Math.max(MAD_SCALE * medianOf(before.map((value) => Math.abs(value - centre))), EPSILON);
    const shift = Math.abs(medianOf(after) - centre) / scale;
    const service = key.slice(0, key.indexOf('|'));
    shiftByService.set(service, Math.max(shiftByService.get(service) ?? 0, shift));
  }

  const ranking = [...shiftByService.entries()]
    .map(([service, shift]) => ({ service, shift }))
    // Descending shift, then service name. The tiebreak is what makes the order a property of the
    // data: without it, equal shifts would come out in the order the signals happened to arrive in.
    .sort((left, right) =>
      right.shift !== left.shift ? right.shift - left.shift : left.service.localeCompare(right.service),
    );

  const topK = Math.min(options.topK ?? DEFAULT_TOP_K, Math.max(ranking.length, 1));
  return { ranking, topK };
}

/**
 * The outcome G4 consumes, for one case under this method.
 *
 * `rankOfTruth` is `null` when the annotated component is not in the ranking at all, which is a
 * different statement from "ranked last": a solver that produced no candidate by that name did not
 * place it badly, it did not place it.
 */
export function locateWithMedianShift(
  faultCase: FaultCase,
  signals: readonly TelemetrySignal[],
  options: { topK?: number } = {},
): BaselineOutcome {
  const { ranking, topK } = rankServicesByMedianShift(faultCase, signals, options);
  const truth = faultCase.groundTruth.rootCauseComponent;
  const at = ranking.findIndex((entry) => entry.service === truth);
  return {
    caseId: faultCase.caseId,
    method: ROBUST_SHIFT_METHOD,
    rankOfTruth: at === -1 ? null : at + 1,
    topK,
  };
}
