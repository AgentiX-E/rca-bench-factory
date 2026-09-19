import { describe, expect, it } from 'vitest';
import { ingestOtlpLogs, ingestOtlpMetrics, ingestOtlpTraces } from '../src/ingest/otlp.js';
import { parseTimestamp } from '../src/util/time.js';

/**
 * OTLP ingest fidelity tests.
 *
 * These four defects were reproduced against the shipped build before any of
 * them was fixed; the numbers in each test are the numbers that were measured,
 * not numbers that were assumed. Each one is a case where the ingest produced a
 * *plausible* value that was not the value the exporter sent, so nothing
 * downstream could tell the difference:
 *
 *   1. `asInt: 42` (a JSON number) -- protojson admits integers as numbers, and
 *      the reader only accepted the quoted form, so a legal document lost the
 *      data point to quarantine.
 *   2. `n * 1e-6` -- nanoseconds were scaled by a float, so a 1 ms span came out
 *      as 0.999755859375 ms. 2500 of 4000 consecutive millisecond-pair probes
 *      disagreed with exact integer division.
 *   3. `status: { code: 'STATUS_CODE_ERROR' }` -- the OTLP JSON encoding writes
 *      enum values as their *names*. The reader matched numbers only, so an
 *      error span was ingested with no status at all, and no quarantine entry.
 *   4. `severityText: ''` -- an absent severity is legal and optional, but an
 *      empty string was quarantined as an *invalid* severity, which is a
 *      different claim about a different document.
 */

describe('ingestOtlpMetrics - integer data point encoding', () => {
  const base = {
    resourceMetrics: [
      {
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
        scopeMetrics: [
          {
            metrics: [
              {
                name: 'requests_total',
                sum: { dataPoints: [{ timeUnixNano: '1725580800000000000', asInt: 42 }] },
              },
            ],
          },
        ],
      },
    ],
  };

  it('accepts asInt delivered as a JSON number, as protojson admits', () => {
    const { signals, quarantine } = ingestOtlpMetrics(base);
    expect(quarantine).toEqual([]);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.payload).toMatchObject({ kind: 'metric', name: 'requests_total', value: 42 });
  });

  it('accepts asInt delivered as a quoted string, the form the spec prefers', () => {
    const input = structuredClone(base);
    input.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0]!.sum.dataPoints[0] = {
      timeUnixNano: '1725580800000000000',
      asInt: '42',
    } as never;
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ value: 42 });
  });

  it('still quarantines a data point that carries no value at all', () => {
    const input = structuredClone(base);
    input.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0]!.sum.dataPoints[0] = {
      timeUnixNano: '1725580800000000000',
    } as never;
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/no numeric value/);
  });

  it('still quarantines a data point whose asInt is not a number', () => {
    const input = structuredClone(base);
    input.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0]!.sum.dataPoints[0] = {
      timeUnixNano: '1725580800000000000',
      asInt: 'not-a-number',
    } as never;
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/no numeric value/);
  });

  it('still rejects a non-finite asDouble rather than reporting infinity', () => {
    const input = structuredClone(base);
    input.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0]!.sum.dataPoints[0] = {
      timeUnixNano: '1725580800000000000',
      asDouble: Number.NaN,
    } as never;
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/no numeric value/);
  });
});

describe('ingestOtlpTraces - nanosecond to millisecond fidelity', () => {
  function span(startNano: string, endNano: string) {
    return {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'aa',
                  spanId: 'bb',
                  name: 'GET /orders',
                  startTimeUnixNano: startNano,
                  endTimeUnixNano: endNano,
                },
              ],
            },
          ],
        },
      ],
    };
  }

  const BASE_MS = Date.parse('2025-01-01T00:00:00Z');
  const ns = (epochMs: number): string => String(BigInt(epochMs) * 1_000_000n);

  it('reports a 1 ms span as exactly 1 ms', () => {
    const { signals, quarantine } = ingestOtlpTraces(span(ns(BASE_MS), ns(BASE_MS + 1)));
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ durationMs: 1 });
  });

  it('reports a 2 ms span as exactly 2 ms', () => {
    const { signals } = ingestOtlpTraces(span(ns(BASE_MS), ns(BASE_MS + 2)));
    expect(signals[0]?.payload).toMatchObject({ durationMs: 2 });
  });

  it('reports a 17 ms span as exactly 17 ms', () => {
    const { signals } = ingestOtlpTraces(span(ns(BASE_MS), ns(BASE_MS + 17)));
    expect(signals[0]?.payload).toMatchObject({ durationMs: 17 });
  });

  it('agrees with exact integer division across 4000 consecutive millisecond pairs', () => {
    // Measured before the fix: 2500 of these 4000 disagreed, with a worst case of
    // 1.000244140625 ms reported for a span that was exactly 1 ms long.
    const wrong: string[] = [];
    for (let i = 0; i < 4000; i += 1) {
      const startMs = BASE_MS + i * 37;
      const endMs = startMs + (i % 1000);
      const { signals } = ingestOtlpTraces(span(ns(startMs), ns(endMs)));
      const got = signals[0]?.payload.durationMs;
      if (got !== endMs - startMs) {
        wrong.push(`[${startMs}, ${endMs}] reported ${String(got)}, expected ${endMs - startMs}`);
      }
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    expect(wrong).toHaveLength(0);
  });

  it('keeps the canonical timestamp on the same nanosecond as the span start', () => {
    // The too-large-to-represent value: 2025-01-01T00:00:00.999Z in nanoseconds.
    const startNs = String(BigInt(BASE_MS) * 1_000_000n + 999_000_000n);
    const endNs = String(BigInt(BASE_MS) * 1_000_000n + 1_000_000_000n + 999_000_000n);
    const { signals } = ingestOtlpTraces(span(startNs, endNs));
    expect(signals[0]?.timestamp).toBe('2025-01-01T00:00:00.999Z');
    expect(signals[0]?.payload).toMatchObject({ durationMs: 1000 });
  });

  it('still accepts a zero-duration span', () => {
    const { signals, quarantine } = ingestOtlpTraces(span(ns(BASE_MS), ns(BASE_MS)));
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ durationMs: 0 });
  });

  it('still quarantines a genuinely negative duration', () => {
    const { signals, quarantine } = ingestOtlpTraces(span(ns(BASE_MS + 1000), ns(BASE_MS)));
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/negative duration/);
  });

  it('still quarantines a sub-millisecond negative duration instead of rounding it away', () => {
    // Exactly one nanosecond of backwards time: the true duration is -1 ns, and
    // the span must not be reported as a legal 0 ms one.
    const startNs = String(BigInt(BASE_MS) * 1_000_000n + 1_000n);
    const endNs = String(BigInt(BASE_MS) * 1_000_000n);
    const { signals, quarantine } = ingestOtlpTraces(span(startNs, endNs));
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/negative duration/);
  });

  it('converts a pre-epoch timestamp through the same exact path', () => {
    // A negative nanosecond epoch: 1969-12-31T23:59:59.999Z. The magnitude is
    // one millisecond, so the truncated result is `-0` or `0`, depending on how
    // the sign is carried -- and `Object.is` is the only way to assert it is a
    // number at all rather than `-0` sneaking through arithmetic downstream.
    const startNs = '-1000000';
    const endNs = '0';
    const { signals, quarantine } = ingestOtlpTraces(span(startNs, endNs));
    expect(quarantine).toEqual([]);
    expect(signals[0]?.timestamp).toBe('1969-12-31T23:59:59.999Z');
    expect(signals[0]?.payload).toMatchObject({ durationMs: 1 });
    expect(Object.is(signals[0]?.payload.durationMs, -0)).toBe(false);
  });

  it('quarantines a nanosecond field that is not an integer', () => {
    const { signals, quarantine } = ingestOtlpTraces(span('1725580800000000000.5', '1725580801000000000'));
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/invalid start\/end timestamp/);
  });
});

describe('ingestOtlpTraces - span status encoding', () => {
  function spanWithStatus(status: unknown) {
    return {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'aa',
                  spanId: 'bb',
                  name: 'GET /orders',
                  startTimeUnixNano: '1725580800000000000',
                  endTimeUnixNano: '1725580801000000000',
                  status,
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it('reads the enum name the OTLP JSON encoding actually writes', () => {
    const { signals, quarantine } = ingestOtlpTraces(spanWithStatus({ code: 'STATUS_CODE_ERROR' }));
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ status: 'ERROR' });
  });

  it('reads the numeric code form too', () => {
    expect(ingestOtlpTraces(spanWithStatus({ code: 2 })).signals[0]?.payload).toMatchObject({
      status: 'ERROR',
    });
    expect(ingestOtlpTraces(spanWithStatus({ code: 1 })).signals[0]?.payload).toMatchObject({
      status: 'OK',
    });
    expect(ingestOtlpTraces(spanWithStatus({ code: 0 })).signals[0]?.payload).toMatchObject({
      status: 'UNSET',
    });
  });

  it('reads the numeric code written as a string', () => {
    expect(ingestOtlpTraces(spanWithStatus({ code: '2' })).signals[0]?.payload).toMatchObject({
      status: 'ERROR',
    });
  });

  it('quarantines a status code name it does not recognise', () => {
    const { signals, quarantine } = ingestOtlpTraces(spanWithStatus({ code: 'STATUS_CODE_BROKEN' }));
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/invalid span status code/);
  });

  it('quarantines a numeric status code outside the vocabulary', () => {
    const { signals, quarantine } = ingestOtlpTraces(spanWithStatus({ code: 7 }));
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/invalid span status code/);
  });

  it('treats a span with no status object as carrying no status', () => {
    const { signals, quarantine } = ingestOtlpTraces(spanWithStatus(undefined));
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).not.toHaveProperty('status');
  });

  it('quarantines a status object whose code is neither a name nor a number', () => {
    const { signals, quarantine } = ingestOtlpTraces(spanWithStatus({ code: true }));
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/invalid span status code/);
  });
});

describe('ingestOtlpLogs - severity encoding', () => {
  function logWith(extra: Record<string, unknown>) {
    return {
      resourceLogs: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeLogs: [
            {
              logRecords: [
                { timeUnixNano: '1725580800000000000', body: { stringValue: 'boom' }, ...extra },
              ],
            },
          ],
        },
      ],
    };
  }

  it('treats an empty severityText as absent, not as an invalid severity', () => {
    const { signals, quarantine } = ingestOtlpLogs(logWith({ severityText: '' }));
    expect(quarantine).toEqual([]);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.payload).not.toHaveProperty('severityText');
  });

  it('still maps the alias spellings it always accepted', () => {
    for (const [raw, expected] of [
      ['warn', 'WARN'],
      ['WARNING', 'WARN'],
      ['err', 'ERROR'],
      ['critical', 'FATAL'],
    ] as const) {
      const { signals } = ingestOtlpLogs(logWith({ severityText: raw }));
      expect(signals[0]?.payload).toMatchObject({ severityText: expected });
    }
  });

  it('still quarantines a severity spelling it does not recognise', () => {
    const { signals, quarantine } = ingestOtlpLogs(logWith({ severityText: 'NOTICE' }));
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/invalid severity 'NOTICE'/);
  });

  it('leaves a record with no severity field without a severity', () => {
    const { signals, quarantine } = ingestOtlpLogs(logWith({}));
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).not.toHaveProperty('severityText');
  });
});

describe('canonical timestamps agree between the ingest paths and the time utility', () => {
  it('gives the trace path and the metric path the same canonical string for the same instant', () => {
    // The trace path built its timestamp from `endMs`/`startMs` after a float
    // scaling; the metric path parsed the integer. A span starting at a
    // non-zero sub-second offset is where the two could disagree.
    const nsValue = '1725580800123456789';
    const metric = ingestOtlpMetrics({
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [
            { metrics: [{ name: 'm', sum: { dataPoints: [{ timeUnixNano: nsValue, asInt: '1' }] } }] },
          ],
        },
      ],
    });
    const trace = ingestOtlpTraces({
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'aa',
                  spanId: 'bb',
                  name: 'op',
                  startTimeUnixNano: nsValue,
                  endTimeUnixNano: nsValue,
                },
              ],
            },
          ],
        },
      ],
    });
    const expected = parseTimestamp(nsValue, 'unix_ns').isoUtc;
    expect(metric.signals[0]?.timestamp).toBe(expected);
    expect(trace.signals[0]?.timestamp).toBe(expected);
  });
});
