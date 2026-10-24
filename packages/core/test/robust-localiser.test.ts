import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  PEAK_Z_METHOD,
  locateWithPeakZScore,
  rankServicesByPeakZScore,
} from '../src/fault/baseline-localiser.js';
import {
  ROBUST_SHIFT_METHOD,
  locateWithMedianShift,
  rankServicesByMedianShift,
} from '../src/fault/robust-localiser.js';
import { faultCaseSchema } from '../src/ir/schema.js';
import type { FaultCase, TelemetrySignal } from '../src/ir/types.js';

/**
 * The second baseline, and why a corpus with one baseline has not been tested.
 *
 * G4's rule is "at least one baseline places the true root cause inside its top-K". With one
 * baseline that sentence is a statement about *that method*: a peak |z| statistic finds the service
 * whose series carries the biggest single excursion, and the corpus's series were constructed to
 * contain exactly one -- so peak-z locating them is close to tautological (finding 236 said so).
 *
 * A second baseline with the opposite bias changes the claim from "a method agrees with the
 * construction" to "two methods that fail differently both find it". The bias has to be genuinely
 * opposite, or the pair is one method written twice:
 *
 *   - peak-z is **sensitive to a single sample** and **fragile to baseline contamination**: one
 *     spike outranks a sustained shift, and one wild baseline sample inflates `sigma` until a real
 *     change looks ordinary.
 *   - median-shift is **insensitive to a single sample** and **robust to contamination**: a
 *     median absolute deviation ignores up to half the baseline points, and a lone spike does not
 *     move a median.
 *
 * The tests below spend most of their length on the two adversarial series where the methods
 * disagree, because a pair of baselines that agreed everywhere would measure nothing.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CASES = resolve(ROOT, 'golden-master', 'fault-cases');

const BASE = faultCaseSchema.parse(
  JSON.parse(readFileSync(resolve(CASES, 'history-cart-network-delay.json'), 'utf8')) as unknown,
) as unknown as FaultCase;

/**
 * Four baseline points and four post-onset points, ninety seconds apart, on a case's own window.
 *
 * The case is a parameter rather than a module constant: the corpus test below expands each case's
 * declaration against *that* case's timestamps, and the first version used the cart case's window
 * for all three -- which put every signal before the checkout case's onset and produced an empty
 * ranking, so the assertion failed with `null` rather than with a wrong rank.
 */
function seriesFor(
  faultCase: FaultCase,
  service: string,
  metric: string,
  before: number[],
  after: number[],
): TelemetrySignal[] {
  const start = Date.parse(faultCase.window.start);
  const onset = Date.parse(faultCase.injectTime);
  const step = 90_000;
  const at = (ms: number): string => new Date(ms).toISOString();
  return [
    ...before.map((value, index) => ({ value, timestamp: at(start + index * step) })),
    ...after.map((value, index) => ({ value, timestamp: at(onset + index * step) })),
  ].map((row) => ({
    irVersion: '1.0.0',
    resource: { 'service.name': service },
    timestamp: row.timestamp,
    signal: 'metric',
    payload: { kind: 'metric' as const, name: metric, value: row.value },
  }));
}

/** The same, against the fixture case's window, which is what every hand-built series here uses. */
function series(service: string, metric: string, before: number[], after: number[]): TelemetrySignal[] {
  return seriesFor(BASE, service, metric, before, after);
}

describe('the shift is a property of the series, not of the answer key', () => {
  const signals = [
    ...series('cart-service', 'client_span_duration_ms', [12, 12.4, 11.8, 12.2], [900, 880, 910, 895]),
    ...series('inventory-service', 'server_handler_time_ms', [11, 11.2, 10.9, 11.1], [11, 11.1, 10.95, 11.05]),
  ];

  it('puts the moving service first and gives the flat one a shift of zero', () => {
    // The cart case is the corpus's own control: the callee's handler did not move, and a statistic
    // that gave it a non-zero shift would be reporting noise as signal.
    const reading = rankServicesByMedianShift(BASE, signals);
    expect(reading.ranking.map((entry) => entry.service)).toEqual(['cart-service', 'inventory-service']);
    expect(reading.ranking[0]!.shift).toBeGreaterThan(100);
    expect(reading.ranking[1]!.shift).toBeLessThan(1);
    expect(reading.topK).toBe(2);
  });

  it('ranks the same way when the answer key is emptied', () => {
    // The property that separates a measurement from a certificate, asserted for the second
    // baseline as it was for the first: `groundTruth` is replaced wholesale, so any read of it would
    // throw or change the order.
    const blind = { ...BASE, groundTruth: {} } as unknown as FaultCase;
    expect(rankServicesByMedianShift(blind, signals)).toEqual(rankServicesByMedianShift(BASE, signals));
  });

  it('reports the true component as rank 1, with its own method name', () => {
    // The name is what tells a later reader which run produced a rank, and the two methods must not
    // share one: an outcome attributed to the wrong baseline would make G4's count of solvers a
    // count of the same solver twice.
    expect(locateWithMedianShift(BASE, signals)).toEqual({
      caseId: 'history-cart-network-delay',
      method: ROBUST_SHIFT_METHOD,
      rankOfTruth: 1,
      topK: 2,
    });
    expect(ROBUST_SHIFT_METHOD).not.toBe(PEAK_Z_METHOD);
  });
});

describe('the two baselines disagree, which is the reason there are two', () => {
  it('lets peak-z rank a lone spike above a sustained shift, and the median below it', () => {
    // `spiky-service`: a perfectly constant baseline and one post-onset sample at ten times it.
    // `steady-service`: a real, sustained 50% rise.
    //
    // Peak-z sees the spike as an enormous excursion (and the constant baseline makes it more
    // enormous, because `sigma` is floored at epsilon). Median-shift sees nothing at all in it: the
    // median of four samples is unmoved by one of them, so `spiky` shifts by zero.
    const spike = [
      ...series('spiky-service', 'latency_ms', [100, 100, 100, 100], [1000, 100, 100, 100]),
      ...series('steady-service', 'latency_ms', [100, 102, 98, 100], [150, 151, 149, 150]),
    ];
    const peak = rankServicesByPeakZScore(BASE, spike).ranking.map((entry) => entry.service);
    const robust = rankServicesByMedianShift(BASE, spike).ranking.map((entry) => entry.service);
    expect(peak).toEqual(['spiky-service', 'steady-service']);
    expect(robust).toEqual(['steady-service', 'spiky-service']);
    // And the numbers say the same thing as the order: the spike is invisible to the median.
    expect(rankServicesByMedianShift(BASE, spike).ranking.find((e) => e.service === 'spiky-service')?.shift).toBe(0);
  });

  it('lets the median find a change a single contaminated baseline sample hides from peak-z', () => {
    // `hiccup-service`'s baseline contains one sample at 500 against a level of 100. That sample
    // inflates the standard deviation to 132, so a tripling of the metric scores z ~ 1.2 -- below
    // the mild service's ordinary z of 14. The median absolute deviation is 0.5, so the same
    // tripling scores a shift of ~270 and outranks everything.
    //
    // This is the mirror of the test above: each method has one shape it cannot see, and the shapes
    // are not the same shape.
    const contaminated = [
      ...series('hiccup-service', 'latency_ms', [100, 101, 99, 100, 101, 99, 100, 500], [300, 300, 300, 300]),
      ...series('mild-service', 'latency_ms', [10, 10.2, 9.8, 10], [12, 12.2, 11.8, 12]),
    ];
    expect(rankServicesByPeakZScore(BASE, contaminated).ranking.map((e) => e.service)).toEqual([
      'mild-service',
      'hiccup-service',
    ]);
    expect(rankServicesByMedianShift(BASE, contaminated).ranking.map((e) => e.service)).toEqual([
      'hiccup-service',
      'mild-service',
    ]);
  });

  it('agrees on the corpus, which is what G4 with two solvers would be asking', () => {
    // The pair of disagreements above is only useful if the corpus survives both. Three cases, two
    // methods, six outcomes; every one has to place its own component first.
    const cases = ['history-checkout-cpu-saturation', 'history-cart-network-delay', 'history-kafka-consumer-lag'];
    for (const name of cases) {
      const one = faultCaseSchema.parse(
        JSON.parse(readFileSync(resolve(CASES, `${name}.json`), 'utf8')) as unknown,
      ) as unknown as FaultCase;
      const declaration = JSON.parse(
        readFileSync(resolve(CASES, `${name}.signals.json`), 'utf8'),
      ) as { series: Array<{ service: string; metric: string; baseline: number; post: number; derivation?: string }> };
      // The same expansion the guard performs, in miniature: eight baseline points, eight
      // post-onset points, a fixed jitter, and a counter that accumulates rather than jumping.
      const signals = declaration.series.flatMap((row) =>
        row.derivation === 'counter'
          ? seriesFor(
              one,
              row.service,
              row.metric,
              Array.from({ length: 8 }, (_, i) => row.baseline + i * 0.1),
              Array.from({ length: 8 }, (_, i) => row.baseline + ((i + 1) * (row.post - row.baseline)) / 8),
            )
          : seriesFor(
              one,
              row.service,
              row.metric,
              [0, 1, -1, 0.5, -0.5, 0.8, -0.8, 0.3].map((j) => row.baseline * (1 + j * 0.02)),
              [0, 1, -1, 0.5, -0.5, 0.8, -0.8, 0.3].map((j) => row.post * (1 + j * 0.02)),
            ),
      );
      expect(locateWithPeakZScore(one, signals).rankOfTruth, `${name} under peak-z`).toBe(1);
      expect(locateWithMedianShift(one, signals).rankOfTruth, `${name} under median-shift`).toBe(1);
    }
  });
});

describe('what the shift refuses to invent', () => {
  it('returns an empty ranking when there is nothing to rank', () => {
    expect(rankServicesByMedianShift(BASE, [])).toEqual({ ranking: [], topK: 1 });
    expect(locateWithMedianShift(BASE, []).rankOfTruth).toBeNull();
  });

  it('ignores a service that has baseline samples but no post-onset ones', () => {
    const signals = series('cart-service', 'client_span_duration_ms', [12, 12.4, 11.8, 12.2], []);
    expect(rankServicesByMedianShift(BASE, signals).ranking).toEqual([]);
  });

  it('ignores a service that has post-onset samples but no baseline', () => {
    const signals = series('cart-service', 'client_span_duration_ms', [], [900, 880, 910, 895]);
    expect(rankServicesByMedianShift(BASE, signals).ranking).toEqual([]);
  });

  it('ignores signals that are not metrics', () => {
    const metric = series('cart-service', 'client_span_duration_ms', [12, 12.4, 11.8, 12.2], [900, 880, 910, 895]);
    const log: TelemetrySignal = {
      irVersion: '1.0.0',
      resource: { 'service.name': 'inventory-service' },
      timestamp: metric[0]!.timestamp,
      signal: 'log',
      payload: { kind: 'log', body: 'the inventory service answered in 11ms' },
    };
    expect(rankServicesByMedianShift(BASE, [...metric, log]).ranking.map((e) => e.service)).toEqual(['cart-service']);
  });

  it('ignores a signal whose timestamp is not a time', () => {
    const broken: TelemetrySignal = {
      irVersion: '1.0.0',
      resource: { 'service.name': 'cart-service' },
      timestamp: 'not-a-date',
      signal: 'metric',
      payload: { kind: 'metric', name: 'client_span_duration_ms', value: 900 },
    };
    expect(rankServicesByMedianShift(BASE, [broken]).ranking).toEqual([]);
  });

  it('ignores a case whose onset is not a time', () => {
    const broken = { ...BASE, injectTime: 'not-a-date' } as unknown as FaultCase;
    const signals = series('cart-service', 'client_span_duration_ms', [12, 12.4, 11.8, 12.2], [900, 880, 910, 895]);
    expect(rankServicesByMedianShift(broken, signals).ranking).toEqual([]);
  });

  it('keeps a service whose component is absent out of the ranking rather than last', () => {
    const signals = series('somebody-else', 'client_span_duration_ms', [12, 12.4, 11.8, 12.2], [900, 880, 910, 895]);
    expect(locateWithMedianShift(BASE, signals)).toMatchObject({ rankOfTruth: null, topK: 1 });
  });

  it('stays finite when the baseline never moved', () => {
    // A constant baseline has a median absolute deviation of zero, so the scale would be zero and
    // the shift infinite. The floor is the same `epsilon` `zScore` uses -- a choice, not a fact,
    // and stated in both modules so the two statistics disagree only about robustness and never
    // about degenerate input.
    const signals = series('frozen-service', 'latency_ms', [50, 50, 50, 50], [60, 60, 60, 60]);
    const shift = rankServicesByMedianShift(BASE, signals).ranking[0]!.shift;
    expect(Number.isFinite(shift)).toBe(true);
    expect(shift).toBeGreaterThan(1e6);
  });

  it('breaks a tie by service name, so two runs produce one order', () => {
    const signals = [
      ...series('zulu-service', 'latency_ms', [10, 11, 9, 10], [100, 101, 99, 100]),
      ...series('alpha-service', 'latency_ms', [10, 11, 9, 10], [100, 101, 99, 100]),
    ];
    expect(rankServicesByMedianShift(BASE, signals).ranking.map((e) => e.service)).toEqual([
      'alpha-service',
      'zulu-service',
    ]);
  });

  it('honours a topK the caller asks for, and never exceeds the ranking', () => {
    const signals = [
      ...series('a-service', 'latency_ms', [10, 11, 9, 10], [100, 101, 99, 100]),
      ...series('b-service', 'latency_ms', [10, 11, 9, 10], [50, 51, 49, 50]),
      ...series('c-service', 'latency_ms', [10, 11, 9, 10], [20, 21, 19, 20]),
      ...series('d-service', 'latency_ms', [10, 11, 9, 10], [5, 5, 5, 5]),
    ];
    expect(rankServicesByMedianShift(BASE, signals, { topK: 2 }).topK).toBe(2);
    expect(rankServicesByMedianShift(BASE, signals).topK).toBe(3);
    expect(rankServicesByMedianShift(BASE, signals, { topK: 99 }).topK).toBe(4);
  });

  it('takes the largest shift per service when one service reports two metrics', () => {
    // Per-service aggregation is `max` in both baselines, deliberately: the comparison between the
    // two methods should be about the statistic, not about how metrics are combined. A `sum` here
    // and a `max` there would let a service with many quiet metrics outrank a service with one loud
    // one under one method and not the other.
    const signals = [
      ...series('multi-service', 'quiet_metric', [10, 10.2, 9.8, 10], [10.1, 10.2, 9.9, 10]),
      ...series('multi-service', 'loud_metric', [10, 10.2, 9.8, 10], [90, 91, 89, 90]),
      ...series('single-service', 'loud_metric', [10, 10.2, 9.8, 10], [50, 51, 49, 50]),
    ];
    expect(rankServicesByMedianShift(BASE, signals).ranking.map((e) => e.service)).toEqual([
      'multi-service',
      'single-service',
    ]);
  });
});

describe('the median of an odd count is a sample, not an average', () => {
  it('takes the middle of five baseline points, which is why one wild point costs nothing', () => {
    // Every other series in this file has an even count, where a median averages the two middles --
    // so this is the arm that was unexecuted until the coverage table named it. It is also the
    // clearest statement of the robustness claim: the baseline is [10, 12, 11, 9, 500], whose mean
    // is 108.4 and whose median is 11, and a post window at 11 scores a shift of exactly zero.
    const signals = series('with-outlier', 'latency_ms', [10, 12, 11, 9, 500], [11, 11, 11, 11]);
    const entry = rankServicesByMedianShift(BASE, signals).ranking[0]!;
    expect(entry.service).toBe('with-outlier');
    expect(entry.shift).toBe(0);
  });
});
