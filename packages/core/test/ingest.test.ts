import { describe, expect, it } from 'vitest';
import {
  detectFileLayout,
  ingestFile,
  parseDelimited,
  parseJsonArray,
  parseJsonl,
} from '../src/ingest/file.js';
import type { FileIngestOptions, FileLayout } from '../src/ingest/file.js';

/**
 * File ingest tests.
 *
 * Every fixture is a real, hand-written source string (no mocks, no generated
 * stubs). The suite asserts the two non-negotiable ingest invariants:
 *   1. zero silent loss - every source record is either a signal or a quarantine
 *      entry, never dropped;
 *   2. data problems become quarantine entries, never thrown exceptions.
 */

describe('parseDelimited', () => {
  it('splits a simple CSV into rows of cells', () => {
    const { rows, errors } = parseDelimited('a,b\n1,2\n3,4\n', ',');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps commas and escaped quotes inside quoted cells', () => {
    const { rows, errors } = parseDelimited('name,msg\norder,"a, b"\ncart,"say ""hi"""\n', ',');
    expect(errors).toEqual([]);
    expect(rows[1]).toEqual(['order', 'a, b']);
    expect(rows[2]).toEqual(['cart', 'say "hi"']);
  });

  it('supports a multi-line quoted cell', () => {
    const { rows, errors } = parseDelimited('id,msg\n1,"line1\nline2"\n2,ok\n', ',');
    expect(errors).toEqual([]);
    expect(rows[1]).toEqual(['1', 'line1\nline2']);
    expect(rows[2]).toEqual(['2', 'ok']);
  });

  it('uses the tab delimiter for TSV', () => {
    const { rows } = parseDelimited('a\tb\n1\t2\n', '\t');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('skips entirely blank lines without counting them', () => {
    const { rows, errors } = parseDelimited('a,b\n\n1,2\n   \n', ',');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reports an unterminated quote as a parse error with its line number', () => {
    const { rows, errors } = parseDelimited('a,b\n1,"unterminated\n', ',');
    expect(rows).toEqual([['a', 'b']]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 2 });
    expect(errors[0]?.reason).toMatch(/unterminated/i);
  });

  it('returns no rows and no errors for empty input', () => {
    expect(parseDelimited('', ',')).toEqual({ rows: [], errors: [] });
  });
});

describe('parseJsonl', () => {
  it('parses one object per non-blank line', () => {
    const { records, errors } = parseJsonl('{"a":1}\n{"a":2}\n\n');
    expect(errors).toEqual([]);
    expect(records).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('reports a malformed line with its 1-based line number', () => {
    const { records, errors } = parseJsonl('{"a":1}\nnot-json\n{"a":3}\n');
    expect(records).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 2 });
  });

  it('rejects a line whose JSON value is not an object', () => {
    const { records, errors } = parseJsonl('{"a":1}\n[1,2]\n');
    expect(records).toEqual([{ a: 1 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.reason).toMatch(/object/i);
  });
});

describe('parseJsonArray', () => {
  it('parses a top-level array of objects', () => {
    const { records, errors } = parseJsonArray('[{"a":1},{"a":2}]');
    expect(errors).toEqual([]);
    expect(records).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('reports a non-array document as an error', () => {
    const { records, errors } = parseJsonArray('{"a":1}');
    expect(records).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.reason).toMatch(/array/i);
  });

  it('accepts an empty array', () => {
    expect(parseJsonArray('[]')).toEqual({ records: [], errors: [] });
  });
});

describe('detectFileLayout', () => {
  it('detects a metric layout from common column names', () => {
    const layout = detectFileLayout(['timestamp', 'service', 'metric_name', 'value'], 'metric');
    expect(layout).toMatchObject({ timestamp: 'timestamp', service: 'service', metricName: 'metric_name', metricValue: 'value' });
  });

  it('detects a log layout from common column names', () => {
    const layout = detectFileLayout(['@timestamp', 'level', 'message'], 'log');
    expect(layout).toMatchObject({ timestamp: '@timestamp', severity: 'level', logBody: 'message' });
  });

  it('detects a trace layout from common column names', () => {
    const layout = detectFileLayout(['time', 'trace_id', 'span_id', 'span_name', 'duration_ms'], 'trace');
    expect(layout).toMatchObject({ timestamp: 'time', traceId: 'trace_id', spanId: 'span_id', spanName: 'span_name', durationMs: 'duration_ms' });
  });

  it('omits a field when no matching column exists', () => {
    const layout = detectFileLayout(['timestamp', 'metric', 'value'], 'metric');
    expect(layout.service).toBeUndefined();
    expect(layout.timestamp).toBe('timestamp');
  });
});

describe('ingestFile - metric CSV', () => {
  const csv = [
    'timestamp,cmdb_id,kpi_name,value',
    '2026-09-06T00:00:00Z,order-pod-1,cpu_usage,20',
    '2026-09-06T00:01:00Z,order-pod-1,cpu_usage,95',
  ].join('\n');

  const layout: FileLayout = {
    timestamp: 'timestamp',
    service: 'cmdb_id',
    metricName: 'kpi_name',
    metricValue: 'value',
  };

  it('ingests every valid row into an IR signal', () => {
    const { signals, quarantine } = ingestFile(csv, { format: 'csv', signalKind: 'metric', layout });
    expect(quarantine).toEqual([]);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      irVersion: '2.0',
      signal: 'metric',
      timestamp: '2026-09-06T00:00:00.000Z',
      resource: { 'service.name': 'order-pod-1' },
      payload: { kind: 'metric', name: 'cpu_usage', value: 20 },
    });
    expect(signals[1]?.payload).toMatchObject({ value: 95 });
  });

  it('enforces zero silent loss across signals and quarantine', () => {
    const bad = 'timestamp,cmdb_id,kpi_name,value\n2026-09-06T00:00:00Z,order-pod-1,cpu_usage,20\nbad-time,order-pod-1,cpu_usage,95\n';
    const { signals, quarantine } = ingestFile(bad, { format: 'csv', signalKind: 'metric', layout });
    expect(signals).toHaveLength(1);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]).toMatchObject({ line: 3, reason: expect.stringMatching(/timestamp/i) });
  });

  it('quarantines a non-numeric metric value instead of throwing', () => {
    const bad = 'timestamp,cmdb_id,kpi_name,value\n2026-09-06T00:00:00Z,order-pod-1,cpu_usage,abc\n';
    const { signals, quarantine } = ingestFile(bad, { format: 'csv', signalKind: 'metric', layout });
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/value/i);
  });

  it('quarantines a row missing a required column', () => {
    const bad = 'timestamp,kpi_name,value\n2026-09-06T00:00:00Z,cpu_usage,20\n';
    const { signals, quarantine } = ingestFile(bad, { format: 'csv', signalKind: 'metric', layout });
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/cmdb_id|service/i);
  });

  it('quarantines an offset-less timestamp when no assumeOffsetMinutes is given', () => {
    const bad = 'timestamp,cmdb_id,kpi_name,value\n2026-09-06 00:00:00,order-pod-1,cpu_usage,20\n';
    const opts: FileIngestOptions = { format: 'csv', signalKind: 'metric', layout };
    const { signals, quarantine } = ingestFile(bad, opts);
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/offset/i);
  });

  it('applies assumeOffsetMinutes to an offset-less timestamp', () => {
    const src = 'timestamp,cmdb_id,kpi_name,value\n2026-09-06 00:00:00,order-pod-1,cpu_usage,20\n';
    const opts: FileIngestOptions = { format: 'csv', signalKind: 'metric', layout, assumeOffsetMinutes: 480 };
    const { signals, quarantine } = ingestFile(src, opts);
    expect(quarantine).toEqual([]);
    expect(signals[0]?.timestamp).toBe('2026-09-05T16:00:00.000Z');
    expect(signals[0]?.rawOffsetMinutes).toBe(480);
  });

  it('falls back to the configured service name when no service column maps', () => {
    const src = 'timestamp,kpi_name,value\n2026-09-06T00:00:00Z,cpu_usage,20\n';
    const l: FileLayout = { timestamp: 'timestamp', metricName: 'kpi_name', metricValue: 'value' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l, serviceName: 'order' });
    expect(quarantine).toEqual([]);
    expect(signals[0]?.resource['service.name']).toBe('order');
  });

  it('supports a header-less CSV via generated column names', () => {
    const src = '2026-09-06T00:00:00Z,order-pod-1,cpu_usage,20\n';
    const l: FileLayout = { timestamp: 'col_0', service: 'col_1', metricName: 'col_2', metricValue: 'col_3' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l, hasHeader: false });
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ kind: 'metric', name: 'cpu_usage', value: 20 });
  });
});

describe('ingestFile - log CSV', () => {
  const layout: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', logBody: 'message', severity: 'level' };

  it('ingests log rows with a valid severity', () => {
    const src = 'timestamp,cmdb_id,level,message\n2026-09-06T00:00:00Z,order,ERROR,connection refused\n';
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'log', layout });
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ kind: 'log', body: 'connection refused', severityText: 'ERROR' });
  });

  it('quarantines an unknown severity instead of accepting it silently', () => {
    const src = 'timestamp,cmdb_id,level,message\n2026-09-06T00:00:00Z,order,CRITICAL,boom\n';
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'log', layout });
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/severity/i);
  });
});

describe('ingestFile - trace CSV', () => {
  const layout: FileLayout = {
    timestamp: 'timestamp',
    service: 'cmdb_id',
    traceId: 'trace_id',
    spanId: 'span_id',
    parentSpanId: 'parent_span_id',
    spanName: 'span_name',
    durationMs: 'duration_ms',
    status: 'status',
  };

  it('ingests a trace row including an optional parent span', () => {
    const src = [
      'timestamp,cmdb_id,trace_id,span_id,parent_span_id,span_name,duration_ms,status',
      '2026-09-06T00:00:00Z,order,tr-1,sp-1,,GET /checkout,120,OK',
      '2026-09-06T00:00:01Z,order,tr-1,sp-2,sp-1,GET /checkout,15,OK',
    ].join('\n');
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout });
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ kind: 'trace', traceId: 'tr-1', spanId: 'sp-1', durationMs: 120, status: 'OK' });
    expect((signals[0]?.payload as { parentSpanId?: string }).parentSpanId).toBeUndefined();
    expect((signals[1]?.payload as { parentSpanId?: string }).parentSpanId).toBe('sp-1');
  });

  it('quarantines a negative span duration', () => {
    const src = 'timestamp,cmdb_id,trace_id,span_id,span_name,duration_ms\n2026-09-06T00:00:00Z,order,tr-1,sp-1,GET /x,-5\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', traceId: 'trace_id', spanId: 'span_id', spanName: 'span_name', durationMs: 'duration_ms' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
  });
});

describe('ingestFile - JSONL and JSON', () => {
  it('ingests a JSONL metric stream', () => {
    const src = [
      '{"timestamp":"2026-09-06T00:00:00Z","service":"order","metric":"cpu_usage","value":20}',
      '{"timestamp":"2026-09-06T00:01:00Z","service":"order","metric":"cpu_usage","value":95}',
    ].join('\n');
    const layout: FileLayout = { timestamp: 'timestamp', service: 'service', metricName: 'metric', metricValue: 'value' };
    const { signals, quarantine } = ingestFile(src, { format: 'jsonl', signalKind: 'metric', layout });
    expect(quarantine).toEqual([]);
    expect(signals).toHaveLength(2);
    expect(signals[1]?.payload).toMatchObject({ value: 95 });
  });

  it('ingests a JSON array of metric objects', () => {
    const src = JSON.stringify([
      { timestamp: '2026-09-06T00:00:00Z', service: 'order', metric: 'cpu_usage', value: 20 },
      { timestamp: '2026-09-06T00:01:00Z', service: 'order', metric: 'cpu_usage', value: 95 },
    ]);
    const layout: FileLayout = { timestamp: 'timestamp', service: 'service', metricName: 'metric', metricValue: 'value' };
    const { signals, quarantine } = ingestFile(src, { format: 'json', signalKind: 'metric', layout });
    expect(quarantine).toEqual([]);
    expect(signals).toHaveLength(2);
  });

  it('keeps JSONL zero-loss by quarantining malformed lines with their line numbers', () => {
    const src = '{"timestamp":"2026-09-06T00:00:00Z","service":"order","metric":"cpu_usage","value":20}\nnot-json\n';
    const layout: FileLayout = { timestamp: 'timestamp', service: 'service', metricName: 'metric', metricValue: 'value' };
    const { signals, quarantine } = ingestFile(src, { format: 'jsonl', signalKind: 'metric', layout });
    expect(signals).toHaveLength(1);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]).toMatchObject({ line: 2 });
  });
});

describe('ingestFile - edge cases', () => {
  const layout: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value' };

  it('handles CRLF line endings in delimited input', () => {
    const { rows, errors } = parseDelimited('a,b\r\n1,2\r\n', ',');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a CRLF inside a quoted multi-line field', () => {
    const { rows, errors } = parseDelimited('id,msg\n1,"line1\r\nline2"\n', ',');
    expect(errors).toEqual([]);
    expect(rows[1]?.[1]).toContain('line2');
  });

  it('reports a malformed JSON array document', () => {
    const { records, errors } = parseJsonArray('[{"a":1},');
    expect(records).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.reason).toMatch(/malformed/i);
  });

  it('carries the metric unit through to the IR payload', () => {
    const src = 'timestamp,cmdb_id,kpi_name,value,unit\n2026-09-06T00:00:00Z,order,cpu_usage,20,%\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value', metricUnit: 'unit' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l });
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ kind: 'metric', unit: '%' });
  });

  it('carries a declared semantic type through to the IR payload', () => {
    const src = 'timestamp,cmdb_id,kpi_name,value\n2026-09-06T00:00:00Z,order,cpu_usage,20\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value', semanticType: 'saturation' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l });
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ kind: 'metric', semanticType: 'saturation' });
  });

  it('quarantines an invalid span status instead of accepting it', () => {
    const src = 'timestamp,cmdb_id,trace_id,span_id,span_name,duration_ms,status\n2026-09-06T00:00:00Z,order,tr-1,sp-1,GET /x,120,FAILED\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', traceId: 'trace_id', spanId: 'span_id', spanName: 'span_name', durationMs: 'duration_ms', status: 'status' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/status/i);
  });

  it('quarantines a record whose payload fails schema validation', () => {
    const src = 'timestamp,cmdb_id,kpi_name,value\n2026-09-06T00:00:00Z,order,cpu_usage,20\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value', semanticType: 'bogus' as never };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/schema/i);
  });

  it('throws for an unsupported format (programmer error, not data error)', () => {
    expect(() =>
      ingestFile('a,b\n', { format: 'unknown' as never, signalKind: 'metric', layout }),
    ).toThrow(/format/i);
  });
});

describe('ingestFile - missing required columns', () => {
  it('quarantines a metric row missing its timestamp column', () => {
    const src = 'cmdb_id,kpi_name,value\norder,cpu_usage,20\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.reason).toMatch(/timestamp/i);
  });

  it('quarantines a metric row missing its name column', () => {
    const src = 'timestamp,cmdb_id,value\n2026-09-06T00:00:00Z,order,20\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/name/i);
  });

  it('quarantines a metric row missing its value column', () => {
    const src = 'timestamp,cmdb_id,kpi_name\n2026-09-06T00:00:00Z,order,cpu_usage\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/value/i);
  });

  it('quarantines a log row missing its body column', () => {
    const src = 'timestamp,cmdb_id,level\n2026-09-06T00:00:00Z,order,ERROR\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', logBody: 'message', severity: 'level' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'log', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/body/i);
  });

  it('quarantines a trace row missing its trace id', () => {
    const src = 'timestamp,cmdb_id,span_id,span_name,duration_ms\n2026-09-06T00:00:00Z,order,sp-1,GET /x,120\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', traceId: 'trace_id', spanId: 'span_id', spanName: 'span_name', durationMs: 'duration_ms' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/trace id/i);
  });

  it('quarantines a trace row missing its span id', () => {
    const src = 'timestamp,cmdb_id,trace_id,span_name,duration_ms\n2026-09-06T00:00:00Z,order,tr-1,GET /x,120\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', traceId: 'trace_id', spanId: 'span_id', spanName: 'span_name', durationMs: 'duration_ms' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/span id/i);
  });

  it('quarantines a trace row missing its span name', () => {
    const src = 'timestamp,cmdb_id,trace_id,span_id,duration_ms\n2026-09-06T00:00:00Z,order,tr-1,sp-1,120\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', traceId: 'trace_id', spanId: 'span_id', spanName: 'span_name', durationMs: 'duration_ms' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/span name/i);
  });

  it('quarantines a trace row missing its span duration', () => {
    const src = 'timestamp,cmdb_id,trace_id,span_id,span_name\n2026-09-06T00:00:00Z,order,tr-1,sp-1,GET /x\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', traceId: 'trace_id', spanId: 'span_id', spanName: 'span_name', durationMs: 'duration_ms' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/duration/i);
  });
});

describe('ingestFile - branch completeness', () => {
  it('reports a non-object element inside a JSON array', () => {
    const { records, errors } = parseJsonArray('[{"a":1},42]');
    expect(records).toEqual([{ a: 1 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.reason).toMatch(/object/i);
  });

  it('detects parent span and status columns for trace layout', () => {
    const layout = detectFileLayout(['time', 'trace_id', 'span_id', 'parent_span_id', 'span_name', 'duration_ms', 'status_code'], 'trace');
    expect(layout.parentSpanId).toBe('parent_span_id');
    expect(layout.status).toBe('status_code');
  });

  it('ingests a TSV file using the tab delimiter', () => {
    const src = 'timestamp\tcmdb_id\tkpi_name\tvalue\n2026-09-06T00:00:00Z\torder\tcpu_usage\t20\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value' };
    const { signals, quarantine } = ingestFile(src, { format: 'tsv', signalKind: 'metric', layout: l });
    expect(quarantine).toEqual([]);
    expect(signals).toHaveLength(1);
  });

  it('honours an explicit custom delimiter for csv', () => {
    const src = 'timestamp;cmdb_id;kpi_name;value\n2026-09-06T00:00:00Z;order;cpu_usage;20\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l, delimiter: ';' });
    expect(quarantine).toEqual([]);
    expect(signals).toHaveLength(1);
  });

  it('returns empty for an empty header-less CSV', () => {
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value' };
    const { signals, quarantine } = ingestFile('', { format: 'csv', signalKind: 'metric', layout: l, hasHeader: false });
    expect(signals).toEqual([]);
    expect(quarantine).toEqual([]);
  });

  it('returns empty for an empty CSV with a header', () => {
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value' };
    const { signals, quarantine } = ingestFile('', { format: 'csv', signalKind: 'metric', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine).toEqual([]);
  });

  it('truncates an oversized quarantine record for readability', () => {
    const longValue = 'x'.repeat(300);
    const src = `timestamp,cmdb_id,kpi_name,value\n2026-09-06T00:00:00Z,order,cpu_usage,${longValue}\n`;
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]?.record.length).toBeLessThanOrEqual(203);
    expect(quarantine[0]?.record).toContain('...');
  });

  it('labels a missing timestamp column as "(none)" when the layout omits it', () => {
    const src = 'cmdb_id,kpi_name,value\norder,cpu_usage,20\n';
    const l: FileLayout = { service: 'cmdb_id', metricName: 'kpi_name', metricValue: 'value' };
    const { quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l });
    expect(quarantine[0]?.reason).toContain('(none)');
  });

  it('labels a missing metric name as "(none)" when the layout omits it', () => {
    const src = 'timestamp,cmdb_id,value\n2026-09-06T00:00:00Z,order,20\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricValue: 'value' };
    const { quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l });
    expect(quarantine[0]?.reason).toContain('(none)');
  });

  it('labels a missing metric value as "(none)" when the layout omits it', () => {
    const src = 'timestamp,cmdb_id,kpi_name\n2026-09-06T00:00:00Z,order,cpu_usage\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', metricName: 'kpi_name' };
    const { quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l });
    expect(quarantine[0]?.reason).toContain('(none)');
  });

  it('labels a missing log body as "(none)" when the layout omits it', () => {
    const src = 'timestamp,cmdb_id\n2026-09-06T00:00:00Z,order\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id' };
    const { quarantine } = ingestFile(src, { format: 'csv', signalKind: 'log', layout: l });
    expect(quarantine[0]?.reason).toContain('(none)');
  });

  it('labels a missing service name as "(none)" when no fallback exists', () => {
    const src = 'timestamp,kpi_name,value\n2026-09-06T00:00:00Z,cpu_usage,20\n';
    const l: FileLayout = { timestamp: 'timestamp', metricName: 'kpi_name', metricValue: 'value' };
    const { quarantine } = ingestFile(src, { format: 'csv', signalKind: 'metric', layout: l });
    expect(quarantine[0]?.reason).toContain('(none)');
  });

  it('labels a missing trace id as "(none)" when the layout omits it', () => {
    const src = 'timestamp,cmdb_id,span_id,span_name,duration_ms\n2026-09-06T00:00:00Z,order,sp-1,GET /x,120\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', spanId: 'span_id', spanName: 'span_name', durationMs: 'duration_ms' };
    const { quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(quarantine[0]?.reason).toContain('(none)');
  });

  it('labels a missing span id as "(none)" when the layout omits it', () => {
    const src = 'timestamp,cmdb_id,trace_id,span_name,duration_ms\n2026-09-06T00:00:00Z,order,tr-1,GET /x,120\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', traceId: 'trace_id', spanName: 'span_name', durationMs: 'duration_ms' };
    const { quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(quarantine[0]?.reason).toContain('(none)');
  });

  it('labels a missing span name as "(none)" when the layout omits it', () => {
    const src = 'timestamp,cmdb_id,trace_id,span_id,duration_ms\n2026-09-06T00:00:00Z,order,tr-1,sp-1,120\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', traceId: 'trace_id', spanId: 'span_id', durationMs: 'duration_ms' };
    const { quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(quarantine[0]?.reason).toContain('(none)');
  });

  it('labels a missing span duration as "(none)" when the layout omits it', () => {
    const src = 'timestamp,cmdb_id,trace_id,span_id,span_name\n2026-09-06T00:00:00Z,order,tr-1,sp-1,GET /x\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', traceId: 'trace_id', spanId: 'span_id', spanName: 'span_name' };
    const { quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(quarantine[0]?.reason).toContain('(none)');
  });

  it('quarantines a NaN span duration', () => {
    const src = 'timestamp,cmdb_id,trace_id,span_id,span_name,duration_ms\n2026-09-06T00:00:00Z,order,tr-1,sp-1,GET /x,abc\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', traceId: 'trace_id', spanId: 'span_id', spanName: 'span_name', durationMs: 'duration_ms' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(signals).toEqual([]);
    expect(quarantine[0]?.reason).toMatch(/duration/i);
  });

  it('ingests a trace without a status column', () => {
    const src = 'timestamp,cmdb_id,trace_id,span_id,span_name,duration_ms\n2026-09-06T00:00:00Z,order,tr-1,sp-1,GET /x,120\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', traceId: 'trace_id', spanId: 'span_id', spanName: 'span_name', durationMs: 'duration_ms' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'trace', layout: l });
    expect(quarantine).toEqual([]);
    expect(signals[0]?.payload).toMatchObject({ kind: 'trace', spanId: 'sp-1', durationMs: 120 });
    expect((signals[0]?.payload as { status?: string }).status).toBeUndefined();
  });

  it('ingests a log without a severity column', () => {
    const src = 'timestamp,cmdb_id,message\n2026-09-06T00:00:00Z,order,connection refused\n';
    const l: FileLayout = { timestamp: 'timestamp', service: 'cmdb_id', logBody: 'message' };
    const { signals, quarantine } = ingestFile(src, { format: 'csv', signalKind: 'log', layout: l });
    expect(quarantine).toEqual([]);
    expect((signals[0]?.payload as { severityText?: string }).severityText).toBeUndefined();
  });
});
