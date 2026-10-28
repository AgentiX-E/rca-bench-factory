import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  PEAK_Z_METHOD,
  locateWithPeakZScore,
  rankServicesByPeakZScore,
} from '../src/fault/baseline-localiser.js';
import { faultCaseSchema } from '../src/ir/schema.js';
import type { FaultCase, TelemetrySignal } from '../src/ir/types.js';

/**
 * The baseline localiser G4 needs, and the two properties that make it a measurement.
 *
 * G4 asks whether a case is solvable, and it reads `BaselineOutcome`s -- so the gate is only as
 * meaningful as the run behind it. Before this module there was no run for the annotated corpus,
 * which is why G4 had never been asked of it (findings 233–235).
 *
 * Two properties are load-bearing and both are asserted here rather than in prose:
 *
 *   1. **It does not read the answer key.** A localiser that peeked would turn G4 into a
 *      certificate. The test empties `groundTruth` and checks the ranking is byte-identical.
 *   2. **A service that is not in the ranking is `null`, not last.** "Did not place it" and
 *      "placed it last" are different statements about a solver, and collapsing them is how a
 *      rank gets quoted for a method that never produced one.
 *
 * The method itself is deliberately dull -- peak |z| per service against its own baseline -- and
 * the module's comment says what a rank of 1 does and does not mean.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CASES = resolve(ROOT, 'golden-master', 'fault-cases');

const BASE = faultCaseSchema.parse(
  JSON.parse(readFileSync(resolve(CASES, 'history-cart-network-delay.json'), 'utf8')) as unknown,
) as unknown as FaultCase;

/** Four baseline points and four post-onset points, ninety seconds apart, on the case's window. */
function series(service: string, metric: string, before: number[], after: number[]): TelemetrySignal[] {
  const start = Date.parse(BASE.window.start);
  const onset = Date.parse(BASE.injectTime);
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

describe('the ranking is built from the series, not from the answer key', () => {
  const signals = [
    ...series('cart-service', 'client_span_duration_ms', [12, 12.4, 11.8, 12.2], [900, 880, 910, 895]),
    ...series('inventory-service', 'server_handler_time_ms', [11, 11.2, 10.9, 11.1], [11, 11.1, 10.95, 11.05]),
  ];

  it('puts the moving service first and the flat one second', () => {
    const reading = rankServicesByPeakZScore(BASE, signals);
    expect(reading.ranking.map((entry) => entry.service)).toEqual(['cart-service', 'inventory-service']);
    expect(reading.ranking[0]!.peakZ).toBeGreaterThan(100);
    // The K is the benchmark's, and the width is the case's. Reporting `2` here -- the smaller of
    // the two -- made every "the answer is within the top 3" claim true by construction, because a
    // ranking cannot be longer than itself. The two numbers are separate fields now so that a
    // caller can see a ranking of two scored at three and decide what that means.
    expect(reading.topK).toBe(3);
    expect(reading.candidateCount).toBe(2);
  });

  it('ranks the same way when the answer key is emptied', () => {
    // The property that separates a measurement from a certificate. `groundTruth` is replaced
    // wholesale, so any read of it -- component, entity, chain, checkpoints -- would throw or
    // change the order.
    const blind = { ...BASE, groundTruth: {} } as unknown as FaultCase;
    expect(rankServicesByPeakZScore(blind, signals)).toEqual(rankServicesByPeakZScore(BASE, signals));
  });

  it('reports the true component as rank 1, with the method named', () => {
    const outcome = locateWithPeakZScore(BASE, signals);
    expect(outcome).toEqual({
      caseId: 'history-cart-network-delay',
      method: PEAK_Z_METHOD,
      rankOfTruth: 1,
      topK: 3,
      candidateCount: 2,
    });
  });
});

describe('what the ranking refuses to invent', () => {
  it('returns an empty ranking when there is nothing to rank', () => {
    // A case with no signals is not a case where everything ties; it is a case with no evidence.
    // `topK` stays at the declared K and `candidateCount` is the zero, because those are two
    // different facts and the earlier version merged them into `topK: 1` -- which read as "this
    // was scored at top-1" when it meant "there was nothing to score".
    expect(rankServicesByPeakZScore(BASE, [])).toEqual({ ranking: [], topK: 3, candidateCount: 0 });
    expect(locateWithPeakZScore(BASE, []).rankOfTruth).toBeNull();
  });

  it('ignores a service that has baseline samples but no post-onset ones', () => {
    // Nothing after the onset means nothing to be surprised by; counting the baseline as a result
    // would put a service in the ranking on the strength of having been quiet.
    const signals = series('cart-service', 'client_span_duration_ms', [12, 12.4, 11.8, 12.2], []);
    expect(rankServicesByPeakZScore(BASE, signals).ranking).toEqual([]);
  });

  it('ignores signals that are not metrics', () => {
    // A log body has no distribution to be surprised by, and treating one as a number would put a
    // name in the ranking that nothing measured.
    const metric = series('cart-service', 'client_span_duration_ms', [12, 12.4, 11.8, 12.2], [900, 880, 910, 895]);
    const log: TelemetrySignal = {
      irVersion: '1.0.0',
      resource: { 'service.name': 'inventory-service' },
      timestamp: metric[0]!.timestamp,
      signal: 'log',
      payload: { kind: 'log', body: 'the inventory service answered in 11ms' },
    };
    expect(rankServicesByPeakZScore(BASE, [...metric, log]).ranking.map((entry) => entry.service)).toEqual([
      'cart-service',
    ]);
  });

  it('keeps a service whose component is absent out of the ranking rather than last', () => {
    const signals = series('somebody-else', 'client_span_duration_ms', [12, 12.4, 11.8, 12.2], [900, 880, 910, 895]);
    expect(locateWithPeakZScore(BASE, signals)).toMatchObject({ rankOfTruth: null, topK: 3, candidateCount: 1 });
  });

  it('reports the answer as absent when its own series did not move', () => {
    // The case whose telemetry names every service in the system: the answer is in the ranking, at
    // whatever position the tiebreak gives it, and a method has not located it. This is the arm the
    // corpus's background telemetry needed -- without it a case whose answer never moved reads as a
    // top-3 hit against quiet neighbours.
    const signals = [
      ...series('cart-service', 'latency_ms', [12, 12, 12, 12], [900, 900, 900, 900]),
      ...series('inventory-service', 'latency_ms', [11, 11, 11, 11], [11, 11, 11, 11]),
    ];
    const quiet = { ...BASE, groundTruth: { ...BASE.groundTruth, rootCauseComponent: 'inventory-service' } };
    expect(locateWithPeakZScore(quiet, signals)).toMatchObject({ rankOfTruth: null, candidateCount: 2 });
  });

  it('breaks a tie by service name, so two runs produce one order', () => {
    // Equal peaks are reachable: the same series reported under two names. Without the tiebreak
    // the order would be insertion order, which is the order the signals happened to arrive in --
    // a fact about the file rather than about the data.
    const signals = [
      ...series('zulu-service', 'latency_ms', [10, 10, 10, 10], [100, 100, 100, 100]),
      ...series('alpha-service', 'latency_ms', [10, 10, 10, 10], [100, 100, 100, 100]),
    ];
    expect(rankServicesByPeakZScore(BASE, signals).ranking.map((entry) => entry.service)).toEqual([
      'alpha-service',
      'zulu-service',
    ]);
  });

  it('honours the K the caller asks for even when the ranking is shorter', () => {
    // This test used to be named '... and never exceeds the ranking', and it asserted the
    // behaviour the name described. That behaviour was the defect: a K that shrinks to fit the
    // ranking cannot be missed, so every caller reporting "within top-K" was reporting that the
    // answer appeared anywhere at all.
    const wide = [
      ...series('a-service', 'latency_ms', [10, 10, 10, 10], [100, 100, 100, 100]),
      ...series('b-service', 'latency_ms', [10, 10, 10, 10], [50, 50, 50, 50]),
      ...series('c-service', 'latency_ms', [10, 10, 10, 10], [20, 20, 20, 20]),
      ...series('d-service', 'latency_ms', [10, 10, 10, 10], [5, 5, 5, 5]),
    ];
    expect(rankServicesByPeakZScore(BASE, wide, { topK: 2 })).toMatchObject({ topK: 2, candidateCount: 4 });
    expect(rankServicesByPeakZScore(BASE, wide).topK).toBe(3);

    const narrow = wide.slice(0, 8);
    expect(rankServicesByPeakZScore(BASE, narrow)).toMatchObject({ topK: 3, candidateCount: 1 });
  });
});

describe('inputs the ranking declines to interpret', () => {
  it('ignores a signal whose timestamp is not a time', () => {
    // A malformed timestamp is not a baseline sample and not a post-onset one; it is a row the
    // ranking cannot place, and placing it by position would put it on the wrong side of the onset.
    const broken: TelemetrySignal = {
      irVersion: '1.0.0',
      resource: { 'service.name': 'cart-service' },
      timestamp: 'not-a-date',
      signal: 'metric',
      payload: { kind: 'metric', name: 'client_span_duration_ms', value: 900 },
    };
    expect(rankServicesByPeakZScore(BASE, [broken]).ranking).toEqual([]);
  });

  it('ignores a series that has post-onset samples but no baseline to compare them with', () => {
    // Without a baseline there is no mean and no deviation, so there is nothing for a post-onset
    // value to be surprising *against* -- and a service that appears only because its post window
    // is non-empty would be ranked on the absence of evidence.
    const signals = series('cart-service', 'client_span_duration_ms', [], [900, 880, 910, 895]);
    expect(rankServicesByPeakZScore(BASE, signals).ranking).toEqual([]);
  });

  it('ignores a case whose onset is not a time, rather than treating every sample as baseline', () => {
    const broken = { ...BASE, injectTime: 'not-a-date' } as unknown as FaultCase;
    const signals = series('cart-service', 'client_span_duration_ms', [12, 12.4, 11.8, 12.2], [900, 880, 910, 895]);
    expect(rankServicesByPeakZScore(broken, signals).ranking).toEqual([]);
  });
});
