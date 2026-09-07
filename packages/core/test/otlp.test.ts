import { describe, expect, it } from 'vitest';
import { ingestOtlpLogs, ingestOtlpMetrics, ingestOtlpTraces } from '../src/ingest/otlp.js';
import type { OtlpIngestOptions } from '../src/ingest/otlp.js';

/**
 * OTLP JSON ingest tests.
 *
 * Every fixture is a real, hand-written OTLP JSON document (the JSON encoding
 * used by the OpenTelemetry HTTP exporters). The suite asserts the same two
 * non-negotiable ingest invariants as the flat-file ingest:
 *   1. zero silent loss - every data point / log record / span is either a
 *      validated IR signal or a quarantine entry, never dropped;
 *   2. data problems become quarantine entries, never thrown exceptions.
 */

const T0_NS = '1725580800000000000'; // 2024-09-06T00:00:00.000Z
const T1_NS = '1725580860000000000'; // 2024-09-06T00:01:00.000Z

describe('ingestOtlpMetrics', () => {
  it('ingests a sum metric with double data points', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [
            {
              scope: { name: 'order-scope' },
              metrics: [
                {
                  name: 'cpu_usage',
                  unit: '%',
                  sum: {
                    dataPoints: [
                      { timeUnixNano: T0_NS, asDouble: 20.0 },
                      { timeUnixNano: T1_NS, asDouble: 95.0 },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(quarantine).toEqual([]);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      irVersion: '2.0',
      signal: 'metric',
      timestamp: '2024-09-06T00:00:00.000Z',
      resource: { 'service.name': 'order' },
      payload: { kind: 'metric', name: 'cpu_usage', value: 20, unit: '%' },
    });
    expect(signals[1]?.payload).toMatchObject({ value: 95 });
  });

  it('ingests a gauge metric with integer data points', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'queue_depth',
                  gauge: {
                    dataPoints: [
                      { timeUnixNano: T0_NS, asInt: '42' },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ kind: 'metric', name: 'queue_depth', value: 42 });
  });

  it('maps data point attributes to metric tags', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'cpu_usage',
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: T0_NS,
                        asDouble: 20,
                        attributes: [{ key: 'k8s.pod.name', value: { stringValue: 'order-pod-1' } }],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({
      kind: 'metric',
      tags: { 'k8s.pod.name': 'order-pod-1' },
    });
  });

  it('enforces zero silent loss across signals and quarantine', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'cpu_usage',
                  sum: {
                    dataPoints: [
                      { timeUnixNano: T0_NS, asDouble: 20 },
                      { timeUnixNano: 'not-a-number', asDouble: 95 },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(signals).toHaveLength(1);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]).toMatchObject({ index: 2, reason: expect.stringMatching(/timestamp/i) });
  });

  it('quarantines a data point missing its value', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [{ metrics: [{ name: 'cpu_usage', sum: { dataPoints: [{ timeUnixNano: T0_NS }] } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/value/i);
  });

  it('quarantines an unsupported histogram metric', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [{ metrics: [{ name: 'latency', histogram: { dataPoints: [] } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/unsupported|histogram/i);
  });

  it('falls back to options.serviceName when no service.name attribute exists', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [] },
          scopeMetrics: [{ metrics: [{ name: 'cpu_usage', sum: { dataPoints: [{ timeUnixNano: T0_NS, asDouble: 20 }] } }] }],
        },
      ],
    };
    const opts: OtlpIngestOptions = { serviceName: 'order' };
    const { signals, quarantine } = ingestOtlpMetrics(input, opts);
    expect(quarantine).toEqual([]);
    expect(signals[0]?.resource['service.name']).toBe('order');
  });

  it('quarantines a data point with no service name at all', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [] },
          scopeMetrics: [{ metrics: [{ name: 'cpu_usage', sum: { dataPoints: [{ timeUnixNano: T0_NS, asDouble: 20 }] } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/service/i);
  });
});

describe('ingestOtlpLogs', () => {
  it('ingests a log record with a string body and severity', () => {
    const input = {
      resourceLogs: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: T0_NS,
                  severityText: 'ERROR',
                  body: { stringValue: 'connection refused' },
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpLogs(input);
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ kind: 'log', body: 'connection refused', severityText: 'ERROR' });
  });

  it('quarantines a log record missing its body', () => {
    const input = {
      resourceLogs: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeLogs: [{ logRecords: [{ timeUnixNano: T0_NS }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpLogs(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/body/i);
  });
});

describe('ingestOtlpTraces', () => {
  it('ingests a span and computes duration from start and end', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '0af7651916cd43dd8448eb211c80319c',
                  spanId: 'b7ad6b7169203331',
                  name: 'GET /checkout',
                  startTimeUnixNano: T0_NS,
                  endTimeUnixNano: '1725580800120000000',
                  status: { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpTraces(input);
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({
      kind: 'trace',
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      spanName: 'GET /checkout',
      durationMs: 120,
      status: 'OK',
    });
  });

  it('omits the parent span id when absent', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '0af7651916cd43dd8448eb211c80319c',
                  spanId: 'b7ad6b7169203331',
                  name: 'GET /checkout',
                  startTimeUnixNano: T0_NS,
                  endTimeUnixNano: '1725580800120000000',
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals } = ingestOtlpTraces(input);
    const payload = signals[0]?.payload as { parentSpanId?: string };
    expect(payload.parentSpanId).toBeUndefined();
  });

  it('maps the span status code to the IR status', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '0af7651916cd43dd8448eb211c80319c',
                  spanId: 'b7ad6b7169203331',
                  name: 'span',
                  startTimeUnixNano: T0_NS,
                  endTimeUnixNano: '1725580800120000000',
                  status: { code: 2 },
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals } = ingestOtlpTraces(input);
    expect((signals[0]?.payload as { status?: string }).status).toBe('ERROR');
  });

  it('quarantines a span with a negative duration', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '0af7651916cd43dd8448eb211c80319c',
                  spanId: 'b7ad6b7169203331',
                  name: 'span',
                  startTimeUnixNano: '1725580800120000000',
                  endTimeUnixNano: T0_NS,
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpTraces(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/duration/i);
  });
});

describe('ingestOtlp - malformed documents', () => {
  it('returns empty for a non-object metrics document', () => {
    expect(ingestOtlpMetrics('not-an-object')).toEqual({ signals: [], quarantine: [] });
  });

  it('returns empty when resourceMetrics is not an array', () => {
    expect(ingestOtlpMetrics({ resourceMetrics: 'nope' })).toEqual({ signals: [], quarantine: [] });
  });

  it('returns empty when a resource metric has no scopeMetrics array', () => {
    expect(ingestOtlpMetrics({ resourceMetrics: [{ scopeMetrics: 'nope' }] })).toEqual({ signals: [], quarantine: [] });
  });

  it('returns empty when a scope has no metrics array', () => {
    expect(ingestOtlpMetrics({ resourceMetrics: [{ scopeMetrics: [{ metrics: 'nope' }] }] })).toEqual({ signals: [], quarantine: [] });
  });

  it('returns empty for a non-object logs document', () => {
    expect(ingestOtlpLogs(42)).toEqual({ signals: [], quarantine: [] });
  });

  it('returns empty when resourceLogs is not an array', () => {
    expect(ingestOtlpLogs({ resourceLogs: {} })).toEqual({ signals: [], quarantine: [] });
  });

  it('returns empty when a resource log has no scopeLogs array', () => {
    expect(ingestOtlpLogs({ resourceLogs: [{ scopeLogs: null }] })).toEqual({ signals: [], quarantine: [] });
  });

  it('returns empty when a scope has no logRecords array', () => {
    expect(ingestOtlpLogs({ resourceLogs: [{ scopeLogs: [{ logRecords: 1 }] }] })).toEqual({ signals: [], quarantine: [] });
  });

  it('returns empty for a non-object traces document', () => {
    expect(ingestOtlpTraces(undefined)).toEqual({ signals: [], quarantine: [] });
  });

  it('returns empty when resourceSpans is not an array', () => {
    expect(ingestOtlpTraces({ resourceSpans: 'nope' })).toEqual({ signals: [], quarantine: [] });
  });

  it('returns empty when a resource span has no scopeSpans array', () => {
    expect(ingestOtlpTraces({ resourceSpans: [{ scopeSpans: 'nope' }] })).toEqual({ signals: [], quarantine: [] });
  });

  it('returns empty when a scope has no spans array', () => {
    expect(ingestOtlpTraces({ resourceSpans: [{ scopeSpans: [{ spans: 'nope' }] }] })).toEqual({ signals: [], quarantine: [] });
  });
});

describe('ingestOtlp - error branches', () => {
  it('quarantines a metric missing its name', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [{ metrics: [{ sum: { dataPoints: [{ timeUnixNano: T0_NS, asDouble: 20 }] } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/name/i);
  });

  it('quarantines a metric with no recognised type', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [{ metrics: [{ name: 'cpu_usage' }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/type/i);
  });

  it('maps integer, double and boolean attribute values to tags', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'cpu_usage',
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: T0_NS,
                        asDouble: 20,
                        attributes: [
                          { key: 'a.int', value: { intValue: '3' } },
                          { key: 'a.double', value: { doubleValue: 1.5 } },
                          { key: 'a.bool', value: { boolValue: true } },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(quarantine).toEqual([]);
    const tags = (signals[0]?.payload as { tags?: Record<string, string> }).tags;
    expect(tags).toMatchObject({ 'a.int': '3', 'a.double': '1.5', 'a.bool': 'true' });
  });

  it('quarantines a log record with an invalid timestamp', () => {
    const input = {
      resourceLogs: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeLogs: [{ logRecords: [{ timeUnixNano: 'abc', body: { stringValue: 'x' } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpLogs(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/timestamp/i);
  });

  it('quarantines a log record with no service name', () => {
    const input = {
      resourceLogs: [
        {
          resource: { attributes: [] },
          scopeLogs: [{ logRecords: [{ timeUnixNano: T0_NS, body: { stringValue: 'x' } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpLogs(input);
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/service/i);
  });

  it('quarantines a log record with an invalid severity', () => {
    const input = {
      resourceLogs: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeLogs: [{ logRecords: [{ timeUnixNano: T0_NS, severityText: 'BOGUS', body: { stringValue: 'x' } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpLogs(input);
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/severity/i);
  });

  it('normalises the WARNING severity alias to WARN', () => {
    const input = {
      resourceLogs: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeLogs: [{ logRecords: [{ timeUnixNano: T0_NS, severityText: 'Warning', body: { stringValue: 'x' } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpLogs(input);
    expect(quarantine).toEqual([]);
    expect((signals[0]?.payload as { severityText?: string }).severityText).toBe('WARN');
  });

  it('quarantines a span with an invalid start timestamp', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '0af7651916cd43dd8448eb211c80319c',
                  spanId: 'b7ad6b7169203331',
                  name: 'span',
                  startTimeUnixNano: 'abc',
                  endTimeUnixNano: '1725580800120000000',
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpTraces(input);
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/timestamp/i);
  });

  it('quarantines a span with no service name', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '0af7651916cd43dd8448eb211c80319c',
                  spanId: 'b7ad6b7169203331',
                  name: 'span',
                  startTimeUnixNano: T0_NS,
                  endTimeUnixNano: '1725580800120000000',
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpTraces(input);
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/service/i);
  });

  it('quarantines a span with no trace id', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [{ spans: [{ spanId: 'b7ad6b7169203331', name: 'span', startTimeUnixNano: T0_NS, endTimeUnixNano: '1725580800120000000' }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpTraces(input);
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/trace id/i);
  });

  it('quarantines a span with no span id', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [{ spans: [{ traceId: '0af7651916cd43dd8448eb211c80319c', name: 'span', startTimeUnixNano: T0_NS, endTimeUnixNano: '1725580800120000000' }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpTraces(input);
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/span id/i);
  });

  it('quarantines a span with no name', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [{ spans: [{ traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331', startTimeUnixNano: T0_NS, endTimeUnixNano: '1725580800120000000' }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpTraces(input);
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/name/i);
  });

  it('quarantines a span with an invalid status code', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '0af7651916cd43dd8448eb211c80319c',
                  spanId: 'b7ad6b7169203331',
                  name: 'span',
                  startTimeUnixNano: T0_NS,
                  endTimeUnixNano: '1725580800120000000',
                  status: { code: 9 },
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpTraces(input);
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/status/i);
  });

  it('truncates an oversized quarantine record for readability', () => {
    const longName = 'm'.repeat(300);
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [{ metrics: [{ name: longName }] }],
        },
      ],
    };
    const { quarantine } = ingestOtlpMetrics(input);
    expect(quarantine[0]?.record.length).toBeLessThanOrEqual(203);
    expect(quarantine[0]?.record).toContain('...');
  });
});

describe('ingestOtlp - defensive branches', () => {
  it('accepts a plain-string log body', () => {
    const input = {
      resourceLogs: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeLogs: [{ logRecords: [{ timeUnixNano: T0_NS, body: 'plain string body' }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpLogs(input);
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ kind: 'log', body: 'plain string body' });
  });

  it('skips an attribute whose key is not a string', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'cpu_usage',
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: T0_NS,
                        asDouble: 20,
                        attributes: [
                          { key: 123, value: { stringValue: 'ignored' } },
                          { key: 'a.unknown', value: { arrayValue: { values: [] } } },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(quarantine).toEqual([]);
    expect((signals[0]?.payload as { tags?: Record<string, string> }).tags).toBeUndefined();
  });

  it('quarantines a metric data point whose timestamp is not a string', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [{ metrics: [{ name: 'cpu_usage', sum: { dataPoints: [{ timeUnixNano: 12345, asDouble: 20 }] } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
  });

  it('quarantines a span whose start timestamp is not a string', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '0af7651916cd43dd8448eb211c80319c',
                  spanId: 'b7ad6b7169203331',
                  name: 'span',
                  startTimeUnixNano: 12345,
                  endTimeUnixNano: '1725580800120000000',
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpTraces(input);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
  });

  it('treats a metric whose dataPoints is not an array as empty', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [{ metrics: [{ name: 'cpu_usage', sum: { dataPoints: 'nope' } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(signals).toEqual([]);
    expect(quarantine).toEqual([]);
  });

  it('skips a null metric entry', () => {
    const input = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeMetrics: [{ metrics: [null, { name: 'cpu_usage', sum: { dataPoints: [{ timeUnixNano: T0_NS, asDouble: 20 }] } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpMetrics(input);
    expect(quarantine).toEqual([]);
    expect(signals).toHaveLength(1);
  });

  it('ingests a log record without a severity text', () => {
    const input = {
      resourceLogs: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeLogs: [{ logRecords: [{ timeUnixNano: T0_NS, body: { stringValue: 'x' } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpLogs(input);
    expect(quarantine).toEqual([]);
    expect((signals[0]?.payload as { severityText?: string }).severityText).toBeUndefined();
  });

  it('treats a non-string severity text as absent', () => {
    const input = {
      resourceLogs: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeLogs: [{ logRecords: [{ timeUnixNano: T0_NS, severityText: 42, body: { stringValue: 'x' } }] }],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpLogs(input);
    expect(quarantine).toEqual([]);
    expect((signals[0]?.payload as { severityText?: string }).severityText).toBeUndefined();
  });

  it('omits an empty-string parent span id', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '0af7651916cd43dd8448eb211c80319c',
                  spanId: 'b7ad6b7169203331',
                  parentSpanId: '',
                  name: 'span',
                  startTimeUnixNano: T0_NS,
                  endTimeUnixNano: '1725580800120000000',
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpTraces(input);
    expect(quarantine).toEqual([]);
    expect((signals[0]?.payload as { parentSpanId?: string }).parentSpanId).toBeUndefined();
  });

  it('carries a non-empty parent span id through to the IR', () => {
    const input = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'order' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '0af7651916cd43dd8448eb211c80319c',
                  spanId: 'b7ad6b7169203331',
                  parentSpanId: 'a1a1a1a1a1a1a1a1',
                  name: 'span',
                  startTimeUnixNano: T0_NS,
                  endTimeUnixNano: '1725580800120000000',
                },
              ],
            },
          ],
        },
      ],
    };
    const { signals, quarantine } = ingestOtlpTraces(input);
    expect(quarantine).toEqual([]);
    expect((signals[0]?.payload as { parentSpanId?: string }).parentSpanId).toBe('a1a1a1a1a1a1a1a1');
  });
});
