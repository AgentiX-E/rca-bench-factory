import { describe, expect, it } from 'vitest';
import { ingestPrimeDataset, PRIME_DATASET_IDS } from '../src/ingest/prime.js';
import type { PrimeCaseSource, PrimeIngestOptions } from '../src/ingest/prime.js';
import type { FaultCase } from '../src/ir/types.js';
import { checkG2Semantic } from '../src/gates/gates.js';

/**
 * Prime-dataset ingest tests.
 *
 * Every fixture below is a hand-written string body, read exactly as the CLI
 * would read it off disk. There are no mocks and no stubbed filesystem: the
 * module under test is pure by design, so the whole contract can be exercised
 * with literals.
 *
 * The suite is organised around the four invariants the module must not break:
 *   a. zero silent loss       - every source record is a signal or a quarantine
 *                               entry, and the counts must reconcile;
 *   b. labels are never guessed - a missing or unresolvable label is an error;
 *   c. reference integrity    - the emitted bundle passes G2 with no violations;
 *   d. determinism            - the same input yields the same bundle.
 */

const METRIC_CSV = [
  'timestamp,service,metric_name,value',
  '2025-03-01T00:09:00.000Z,ts-order-service,cpu_usage,0.41',
  '2025-03-01T00:10:00.000Z,ts-order-service,cpu_usage,0.93',
  '2025-03-01T00:11:00.000Z,ts-order-service,cpu_usage,0.88',
].join('\n') + '\n';

const LOG_CSV = [
  'timestamp,service,level,message',
  '2025-03-01T00:10:05.000Z,ts-order-service,ERROR,connection refused',
  '2025-03-01T00:10:06.000Z,ts-order-service,WARN,retrying upstream',
].join('\n') + '\n';

const TRACE_CSV = [
  'timestamp,trace_id,span_id,parent_span_id,service,span_name,duration_ms,status',
  '2025-03-01T00:10:07.000Z,t1,s1,,ts-order-service,GET /order,120,OK',
  '2025-03-01T00:10:07.500Z,t1,s2,s1,ts-order-service,SELECT orders,340,ERROR',
].join('\n') + '\n';

const BASE_CASE: PrimeCaseSource = {
  caseId: 'RE2-ts-order-service-cpu_1',
  component: 'ts-order-service',
  faultType: 'cpu',
  injectTime: '2025-03-01T00:10:00.000Z',
};

/**
 * The service the fixtures' telemetry actually carries. Tests that swap the
 * telemetry out for something unreadable declare it explicitly so the case
 * itself stays valid and the test isolates the file-level behaviour.
 */
const ORDER_SERVICE_ENTITY = {
  entityId: 'service:tt/ts-order-service',
  kind: 'service' as const,
  name: 'ts-order-service',
  namespace: 'tt',
  aliases: [],
};

function options(overrides: Partial<PrimeIngestOptions> = {}): PrimeIngestOptions {
  return {
    dataset: 'rcaeval',
    system: 'tt',
    cases: [BASE_CASE],
    leadMs: 5 * 60_000,
    lagMs: 5 * 60_000,
    ...overrides,
  };
}

const METRIC_FILE = { 'metrics.csv': METRIC_CSV };

describe('ingestPrimeDataset · format and layout resolution', () => {
  it('reads a TSV file from its extension', () => {
    const tsv = [
      'timestamp\tservice\tmetric_name\tvalue',
      '2025-03-01T00:09:00.000Z\tts-order-service\tcpu_usage\t0.41',
    ].join('\n') + '\n';
    const result = ingestPrimeDataset({ 'metrics.tsv': tsv }, options());
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]).toHaveLength(1);
  });

  it('reads a .json array file from its extension', () => {
    const json = JSON.stringify([
      { timestamp: '2025-03-01T00:09:00.000Z', service: 'ts-order-service', metric_name: 'cpu_usage', value: 0.41 },
      { timestamp: '2025-03-01T00:10:00.000Z', service: 'ts-order-service', metric_name: 'cpu_usage', value: 0.93 },
    ]);
    const result = ingestPrimeDataset({ 'metrics.json': json }, options());
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]).toHaveLength(2);
  });

  it('reads a pretty-printed JSON array spread across many lines', () => {
    // A pretty-printed document is still one record set; slicing the first line
    // would misread it as headerless.
    const json = JSON.stringify(
      [
        { timestamp: '2025-03-01T00:09:00.000Z', service: 'ts-order-service', metric_name: 'cpu_usage', value: 0.41 },
        { timestamp: '2025-03-01T00:10:00.000Z', service: 'ts-order-service', metric_name: 'cpu_usage', value: 0.93 },
      ],
      null,
      2,
    );
    const result = ingestPrimeDataset({ 'metrics.json': json }, options());
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]).toHaveLength(2);
  });

  it('quarantines a file whose format cannot be determined', () => {
    const result = ingestPrimeDataset(
      { 'metrics': METRIC_CSV },
      options({ extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.quarantine[0]?.reason).toMatch(/cannot determine the file format/i);
  });

  it('quarantines a JSON file that does not parse', () => {
    const result = ingestPrimeDataset(
      { 'metrics/metrics.jsonl': '{not json at all' },
      options({ extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.signals).toBe(0);
    expect(result.report[0]?.quarantine.length).toBeGreaterThan(0);
  });

  it('quarantines a JSON file whose first value is not an object', () => {
    const result = ingestPrimeDataset(
      { 'metrics/metrics.json': '[1,2,3]' },
      options({ extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.signals).toBe(0);
    expect(result.report[0]?.quarantine[0]?.reason).toMatch(/no readable header/i);
  });

  it('honours defaults supplied through options', () => {
    // `signalKind` comes from defaults, so the ambiguous file name is decided.
    const result = ingestPrimeDataset(
      { 'series.csv': METRIC_CSV },
      options({
        defaults: { format: 'csv', signalKind: 'metric', layout: { timestamp: 'timestamp', service: 'service', metricName: 'metric_name', metricValue: 'value' } },
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]).toHaveLength(3);
  });

  it('lets a per-file spec override the defaults field by field', () => {
    const result = ingestPrimeDataset(
      { 'series.csv': METRIC_CSV },
      options({
        extraEntities: [ORDER_SERVICE_ENTITY],
        defaults: { format: 'csv', signalKind: 'metric' },
        cases: [
          {
            ...BASE_CASE,
            files: [
              { path: 'series.csv', signalKind: 'log', layout: { timestamp: 'timestamp', service: 'service', logBody: 'metric_name' } },
            ],
          },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    const signals = result.bundle.signals[BASE_CASE.caseId] ?? [];
    expect(signals).toHaveLength(3);
    expect(signals[0]?.signal).toBe('log');
  });

  it('carries per-file ingest options such as assumed offsets into the reader', () => {
    // A local-time value with no offset is only readable because the spec says
    // how to read it; the reader must receive that instruction unchanged.
    const csv = [
      'timestamp,service,metric_name,value',
      '2025-03-01 00:09:00,ts-order-service,cpu_usage,0.41',
    ].join('\n') + '\n';
    const result = ingestPrimeDataset(
      { 'metrics.csv': csv },
      options({
        extraEntities: [ORDER_SERVICE_ENTITY],
        cases: [
          {
            ...BASE_CASE,
            files: [
              {
                path: 'metrics.csv',
                timeLayout: 'iso8601',
                assumeOffsetMinutes: 480,
                layout: { timestamp: 'timestamp', service: 'service', metricName: 'metric_name', metricValue: 'value' },
              },
            ],
          },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    const signal = result.bundle.signals[BASE_CASE.caseId]?.[0];
    expect(signal?.rawOffsetMinutes).toBe(480);
    expect(signal?.timestamp).toBe('2025-02-28T16:09:00.000Z');
  });

  it('infers the signal kind from a bare file name with no extension', () => {
    const result = ingestPrimeDataset(
      { 'metrics': METRIC_CSV },
      options({ defaults: { format: 'csv' } }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]).toHaveLength(3);
  });

  it('splits a tab-delimited header when the layout is inferred', () => {
    // The delimiter follows the format, and inference walks the same code path
    // as a declared format: a .tsv name with no explicit format must still be
    // split on tabs, not commas.
    const tsv = [
      'timestamp\tservice\tmetric_name\tvalue',
      '2025-03-01T00:09:00.000Z\tts-order-service\tcpu_usage\t0.41',
    ].join('\n') + '\n';
    const result = ingestPrimeDataset({ 'metrics.tsv': tsv }, options());
    if (!result.ok) throw new Error(result.error);
    const signal = result.bundle.signals[BASE_CASE.caseId]?.[0];
    expect(signal?.signal).toBe('metric');
    expect(signal?.payload).toEqual({ kind: 'metric', name: 'cpu_usage', value: 0.41 });
  });

  it('returns no signal kind for a bare name that names no kind', () => {
    // `extensionOf('series')` is empty, so the stem is the whole name and it
    // matches no kind - the file must be quarantined, not guessed at.
    const result = ingestPrimeDataset(
      { 'series': METRIC_CSV },
      options({ defaults: { format: 'csv' }, extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.quarantine[0]?.reason).toMatch(/signal kind/i);
  });

  it('strips a byte-order mark before reading the header', () => {
    const csv = '\uFEFF' + METRIC_CSV;
    const result = ingestPrimeDataset({ 'metrics.csv': csv }, options());
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]).toHaveLength(3);
  });

  it('reads a CRLF-delimited file', () => {
    const csv = METRIC_CSV.replace(/\n/g, '\r\n');
    const result = ingestPrimeDataset({ 'metrics.csv': csv }, options());
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]).toHaveLength(3);
  });

  it('quarantines a JSONL file whose first non-blank line is malformed', () => {
    const result = ingestPrimeDataset(
      { 'metrics/metrics.jsonl': '\n\n{not json\n' },
      options({ extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.quarantine[0]?.reason).toMatch(/no readable header/i);
  });

  it('quarantines a JSONL file that is entirely blank', () => {
    const result = ingestPrimeDataset(
      { 'metrics/metrics.jsonl': '\n   \n' },
      options({ extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.quarantine[0]?.reason).toMatch(/no readable header/i);
  });

  it('quarantines a delimited file that holds no non-blank line at all', () => {
    // Nothing to split, so no header can be inferred. The file is quarantined
    // with the same reason a headerless file gets, rather than being treated as
    // an empty file that silently contributed zero signals.
    const result = ingestPrimeDataset(
      { 'metrics.csv': '\n\n   \n' },
      options({
        extraEntities: [ORDER_SERVICE_ENTITY],
        cases: [{ ...BASE_CASE, files: [{ path: 'metrics.csv', format: 'csv', signalKind: 'metric' }] }],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.signals).toBe(0);
    expect(result.report[0]?.quarantine[0]?.reason).toBe(
      "'metrics.csv' has no readable header to infer columns from",
    );
  });

  it('reports the fields a detected layout is missing, not a generic rejection', () => {
    // The header carries a timestamp column and a metric-name column but no
    // value column. Detection succeeds and returns an incomplete layout; the
    // message must name the missing field so the caller knows which column to
    // add, rather than just "no readable header".
    const csv = [
      'time,indicator,svc',
      '2025-03-01T00:09:00.000Z,cpu_usage,ts-order-service',
    ].join('\n') + '\n';
    const result = ingestPrimeDataset(
      { 'metrics.csv': csv },
      options({
        extraEntities: [ORDER_SERVICE_ENTITY],
        cases: [
          {
            ...BASE_CASE,
            files: [{ path: 'metrics.csv', format: 'csv', signalKind: 'metric' }],
          },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.signals).toBe(0);
    expect(result.report[0]?.quarantine[0]?.reason).toBe(
      "'metrics.csv' is missing required column(s): metricValue",
    );
  });

  it('quarantines a JSON file that does not parse', () => {
    const result = ingestPrimeDataset(
      { 'metrics/metrics.json': '{not json' },
      options({ extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.quarantine[0]?.reason).toMatch(/no readable header/i);
  });

  it('leaves a file unclaimed when every case is selective and none matches', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        extraEntities: [ORDER_SERVICE_ENTITY],
        cases: [{ ...BASE_CASE, pathPrefixes: ['case-a/'] }],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.unclaimed).toEqual(['metrics.csv']);
  });

  it('quarantines a JSONL file whose first record is not an object', () => {
    const result = ingestPrimeDataset(
      { 'metrics/metrics.jsonl': '[1,2]\n[3,4]\n' },
      options({ extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.quarantine[0]?.reason).toMatch(/no readable header/i);
  });

  it('rejects a scalar JSON document', () => {
    const result = ingestPrimeDataset(
      { 'metrics.json': '42' },
      options({ extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.quarantine[0]?.reason).toMatch(/no readable header/i);
  });

  it('reports a quoted header without splitting on the quoted delimiter', () => {
    const csv = ['"time","service","metric_name","value"', '2025-03-01T00:09:00.000Z,ts-order-service,cpu_usage,0.41'].join('\n') + '\n';
    const result = ingestPrimeDataset({ 'metrics.csv': csv }, options());
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]).toHaveLength(1);
  });

  it('treats a doubled quote inside a quoted header as one literal quote', () => {
    const csv = ['"tim""e",service,metric_name,value', '2025-03-01T00:09:00.000Z,ts-order-service,cpu_usage,0.41'].join('\n') + '\n';
    const result = ingestPrimeDataset(
      { 'metrics.csv': csv },
      options({ extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    // `tim"e` is not an alias for `timestamp`, so the layout is incomplete.
    expect(result.report[0]?.quarantine[0]?.reason).toMatch(/missing required column/i);
  });

  it('forwards a delimiter override to the reader when the layout comes from defaults', () => {
    // The file name carries no kind and the header is semicolon-delimited, so
    // both the kind and the delimiter must come from the caller.
    const csv = ['timestamp;service;metric_name;value', '2025-03-01T00:09:00.000Z;ts-order-service;cpu_usage;0.41'].join('\n') + '\n';
    const result = ingestPrimeDataset(
      { 'series.csv': csv },
      options({
        extraEntities: [ORDER_SERVICE_ENTITY],
        defaults: { signalKind: 'metric', delimiter: ';', format: 'csv' },
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]).toHaveLength(0);
    // The header row is split on `;`, so the layout resolves and the reader sees
    // a data row that is missing its cells - which is a record-level quarantine,
    // not a file-level rejection.
    expect(result.report[0]?.quarantine.length).toBeGreaterThan(0);
  });

  it('forwards delimiter and hasHeader overrides alongside an explicit layout', () => {
    const csv = ['timestamp;service;metric_name;value', '2025-03-01T00:09:00.000Z;ts-order-service;cpu_usage;0.41'].join('\n') + '\n';
    const result = ingestPrimeDataset(
      { 'series.csv': csv },
      options({
        defaults: {
          format: 'csv',
          signalKind: 'metric',
          delimiter: ';',
          hasHeader: true,
          layout: { timestamp: 'timestamp', service: 'service', metricName: 'metric_name', metricValue: 'value' },
        },
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]).toHaveLength(1);
    expect(result.bundle.signals[BASE_CASE.caseId]?.[0]?.payload).toMatchObject({ value: 0.41 });
  });

  it('forwards a service-name fallback to the reader', () => {
    const csv = ['timestamp,metric_name,value', '2025-03-01T00:09:00.000Z,cpu_usage,0.41'].join('\n') + '\n';
    const result = ingestPrimeDataset(
      { 'metrics.csv': csv },
      options({ defaults: { signalKind: 'metric', format: 'csv', serviceName: 'ts-order-service' } }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]?.[0]?.resource['service.name']).toBe('ts-order-service');
  });
});

describe('ingestPrimeDataset · descriptor validation', () => {
  it('rejects an empty file map and names the case', () => {
    const result = ingestPrimeDataset({}, options());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/RE2-ts-order-service-cpu_1/);
  });

  it('rejects a descriptor with no cases', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options({ cases: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/at least one case/i);
  });

  it('rejects an empty system', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options({ system: '' }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/system/i);
  });

  it('rejects a blank fault type rather than emitting an unscorable case', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ cases: [{ ...BASE_CASE, faultType: '   ' }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/fault/i);
  });

  it('rejects a non-UTC injection time', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ cases: [{ ...BASE_CASE, injectTime: '2025-03-01 00:10:00' }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/ISO-8601/i);
  });

  it('rejects a blank case id', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options({ cases: [{ ...BASE_CASE, caseId: '  ' }] }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/non-blank caseId/i);
  });

  it('rejects a duplicate case id', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options({ cases: [BASE_CASE, BASE_CASE] }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/duplicate caseId/i);
  });

  it('rejects a case with no root-cause component', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options({ cases: [{ ...BASE_CASE, component: ' ' }] }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/root-cause component/i);
  });

  it('rejects an unknown dataset id', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      // The cast is the point: the guard must hold for untrusted JSON too.
      options({ dataset: 'not-a-dataset' as PrimeIngestOptions['dataset'] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/unknown dataset/i);
  });

  it('accepts every declared dataset id', () => {
    for (const dataset of PRIME_DATASET_IDS) {
      const result = ingestPrimeDataset(METRIC_FILE, options({ dataset }));
      expect(result.ok).toBe(true);
    }
  });
});

describe('ingestPrimeDataset · signal extraction', () => {
  it('ingests a CSV metric file into signals', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const signals = result.bundle.signals[BASE_CASE.caseId] ?? [];
    expect(signals).toHaveLength(3);
    expect(signals[0]).toMatchObject({
      signal: 'metric',
      resource: { 'service.name': 'ts-order-service' },
      timestamp: '2025-03-01T00:09:00.000Z',
    });
  });

  it('reports the per-case signal and quarantine counts', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options());
    if (!result.ok) throw new Error(result.error);
    expect(result.report).toEqual([
      { caseId: BASE_CASE.caseId, signals: 3, quarantine: [], files: ['metrics.csv'] },
    ]);
  });

  it('ingests a log file when the path names it', () => {
    const result = ingestPrimeDataset({ 'logs/logs.csv': LOG_CSV }, options());
    if (!result.ok) throw new Error(result.error);
    const signals = result.bundle.signals[BASE_CASE.caseId] ?? [];
    expect(signals).toHaveLength(2);
    expect(signals[0]?.signal).toBe('log');
    expect(signals[0]?.payload).toMatchObject({ kind: 'log', severityText: 'ERROR' });
  });

  it('ingests a trace file when the path names it', () => {
    const result = ingestPrimeDataset({ 'traces/traces.csv': TRACE_CSV }, options());
    if (!result.ok) throw new Error(result.error);
    const signals = result.bundle.signals[BASE_CASE.caseId] ?? [];
    expect(signals).toHaveLength(2);
    expect(signals[1]?.payload).toMatchObject({ kind: 'trace', spanId: 's2', parentSpanId: 's1' });
  });

  it('ingests a JSONL file using the union of its record keys', () => {
    const jsonl = [
      '{"timestamp":"2025-03-01T00:09:00.000Z","service":"ts-order-service","metric_name":"cpu_usage","value":"0.4"}',
      '{"timestamp":"2025-03-01T00:10:00.000Z","service":"ts-order-service","metric_name":"cpu_usage","value":"0.9"}',
    ].join('\n');
    const result = ingestPrimeDataset({ 'metrics/metrics.jsonl': jsonl }, options());
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals[BASE_CASE.caseId]).toHaveLength(2);
  });

  it('honours an explicit per-file specification over auto-detection', () => {
    const renamed = [
      'when,who,what,howmuch',
      '2025-03-01T00:09:00.000Z,ts-order-service,cpu_usage,0.4',
    ].join('\n') + '\n';
    const result = ingestPrimeDataset(
      { 'metrics.csv': renamed },
      options({
        cases: [
          {
            ...BASE_CASE,
            files: [
              {
                path: 'metrics.csv',
                format: 'csv',
                signalKind: 'metric',
                layout: { timestamp: 'when', service: 'who', metricName: 'what', metricValue: 'howmuch' },
              },
            ],
          },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    const signals = result.bundle.signals[BASE_CASE.caseId] ?? [];
    expect(signals).toHaveLength(1);
    expect(signals[0]?.payload).toMatchObject({ kind: 'metric', name: 'cpu_usage', value: 0.4 });
  });
});

describe('ingestPrimeDataset · zero silent loss', () => {
  it('quarantines a bad row without dropping the good ones', () => {
    const csv = [
      'timestamp,service,metric_name,value',
      '2025-03-01T00:09:00.000Z,ts-order-service,cpu_usage,0.41',
      '2025-03-01T00:10:00.000Z,ts-order-service,cpu_usage,not-a-number',
      '2025-03-01T00:11:00.000Z,ts-order-service,cpu_usage,0.88',
    ].join('\n') + '\n';
    const result = ingestPrimeDataset({ 'metrics.csv': csv }, options());
    if (!result.ok) throw new Error(result.error);
    const report = result.report[0];
    expect(report?.signals).toBe(2);
    expect(report?.quarantine).toHaveLength(1);
    expect(report?.quarantine[0]?.reason).toMatch(/not a finite number/i);
    expect(report?.quarantine[0]).toMatchObject({ file: 'metrics.csv' });
  });

  it('reconciles input records against signals plus quarantine entries', () => {
    const csv = [
      'timestamp,service,metric_name,value',
      '2025-03-01T00:09:00.000Z,ts-order-service,cpu_usage,0.41',
      '2025-03-01T00:10:00.000Z,ts-order-service,cpu_usage,oops',
      '2025-03-01T00:11:00.000Z,ts-order-service,cpu_usage,0.88',
    ].join('\n') + '\n';
    const result = ingestPrimeDataset({ 'metrics.csv': csv }, options());
    if (!result.ok) throw new Error(result.error);
    const report = result.report[0];
    // 3 data rows in, 2 signals + 1 quarantine out.
    expect(report!.signals + report!.quarantine.length).toBe(3);
  });

  it('quarantines a file whose signal kind cannot be determined', () => {
    // The component is declared so the case itself is valid; the point of the
    // test is the file, which must be quarantined rather than guessed at.
    const result = ingestPrimeDataset({ 'mystery.csv': METRIC_CSV }, options({ extraEntities: [ORDER_SERVICE_ENTITY] }));
    if (!result.ok) throw new Error(result.error);
    const report = result.report[0];
    expect(report?.signals).toBe(0);
    expect(report?.quarantine[0]?.reason).toMatch(/signal kind/i);
    expect(result.hardErrors).toEqual([
      expect.stringMatching(/RE2-ts-order-service-cpu_1.*every file was rejected/),
    ]);
  });

  it('quarantines a file missing the columns its kind requires', () => {
    const csv = 'timestamp,service\n2025-03-01T00:09:00.000Z,ts-order-service\n';
    const result = ingestPrimeDataset(
      { 'metrics/metrics.csv': csv },
      options({ extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    const report = result.report[0];
    expect(report?.signals).toBe(0);
    expect(report?.quarantine[0]?.reason).toMatch(/missing required column/i);
    expect(report?.quarantine[0]?.reason).toContain('metricValue');
  });

  it('never throws on malformed input; everything becomes quarantine', () => {
    const result = ingestPrimeDataset(
      { 'metrics.csv': 'not,really\n\x00csv' },
      options({ extraEntities: [ORDER_SERVICE_ENTITY] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.report[0]?.signals).toBe(0);
    expect(result.report[0]?.quarantine.length).toBeGreaterThan(0);
  });
});

describe('ingestPrimeDataset · case routing', () => {
  it('gives each case only the files its prefixes select', () => {
    const files = {
      'case-a/metrics.csv': METRIC_CSV,
      'case-b/metrics.csv': METRIC_CSV.replace(/ts-order-service/g, 'ts-cart-service'),
    };
    const result = ingestPrimeDataset(
      files,
      options({
        cases: [
          { ...BASE_CASE, caseId: 'a', pathPrefixes: ['case-a/'] },
          {
            caseId: 'b',
            component: 'ts-cart-service',
            faultType: 'cpu',
            injectTime: '2025-03-01T00:10:00.000Z',
            pathPrefixes: ['case-b/'],
          },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.signals['a']).toHaveLength(3);
    expect(result.bundle.signals['b']).toHaveLength(3);
    expect(result.bundle.signals['a']?.[0]?.resource['service.name']).toBe('ts-order-service');
    expect(result.bundle.signals['b']?.[0]?.resource['service.name']).toBe('ts-cart-service');
    expect(result.report.map((r) => r.files)).toEqual([['case-a/metrics.csv'], ['case-b/metrics.csv']]);
  });

  it('quarantines a file that matches no case when prefixes are in use', () => {
    const files = { 'case-a/metrics.csv': METRIC_CSV, 'stray.csv': METRIC_CSV };
    const result = ingestPrimeDataset(
      files,
      options({ cases: [{ ...BASE_CASE, pathPrefixes: ['case-a/'] }] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.files).toEqual(['case-a/metrics.csv']);
    // The stray file is not silently ignored: it is named as an unclaimed input.
    expect(result.unclaimed).toEqual(['stray.csv']);
  });

  it('surfaces a wholly unreadable case through hardErrors', () => {
    // A case that yields neither a signal nor a quarantine entry was never
    // actually read - that is a routing mistake, and it must be loud.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        extraEntities: [ORDER_SERVICE_ENTITY],
        cases: [{ ...BASE_CASE, pathPrefixes: ['nothing-matches-this/'] }],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report[0]?.files).toEqual([]);
    expect(result.hardErrors).toEqual([
      expect.stringMatching(/RE2-ts-order-service-cpu_1.*no files/),
    ]);
    expect(result.unclaimed).toEqual(['metrics.csv']);
  });

  it('reports no hard errors when every case was actually read', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options());
    if (!result.ok) throw new Error(result.error);
    expect(result.hardErrors).toEqual([]);
  });
});

describe('ingestPrimeDataset · file routing', () => {
  it('routes to the first catch-all when no case declares prefixes', () => {
    // Two prefixless cases are both catch-alls. Without a selective match the
    // fallback is the first one, and the second is then read nothing at all -
    // which the hard-error channel reports rather than hiding.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        extraEntities: [ORDER_SERVICE_ENTITY],
        cases: [
          { ...BASE_CASE, caseId: 'first-catch-all' },
          { ...BASE_CASE, caseId: 'second-catch-all' },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report.map((r) => [r.caseId, r.files])).toEqual([
      ['first-catch-all', ['metrics.csv']],
      ['second-catch-all', []],
    ]);
    expect(result.hardErrors).toEqual([expect.stringMatching(/second-catch-all.*no files/)]);
  });

  it('selects the case whose prefix matches even when a catch-all is listed first', () => {
    // The catch-all must not swallow a file a selective case claims: ordering
    // in the descriptor is not routing priority.
    const files = { 'case-b/metrics.csv': METRIC_CSV };
    const result = ingestPrimeDataset(
      files,
      options({
        extraEntities: [ORDER_SERVICE_ENTITY],
        cases: [
          { ...BASE_CASE, caseId: 'catch-all' },
          { ...BASE_CASE, caseId: 'selective', pathPrefixes: ['case-b/'] },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.report.map((r) => [r.caseId, r.files])).toEqual([
      ['catch-all', []],
      ['selective', ['case-b/metrics.csv']],
    ]);
  });
});

describe('ingestPrimeDataset · window derivation', () => {
  it('falls back to the default lead when none is supplied', () => {
    // The default is part of the contract, not an implementation detail: a
    // caller who omits the knob gets a deterministic 10-minute lead.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ extraEntities: [ORDER_SERVICE_ENTITY], leadMs: undefined, lagMs: undefined }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.cases[0]?.window).toEqual({
      start: '2025-03-01T00:00:00.000Z',
      end: '2025-03-01T00:20:00.000Z',
    });
  });

  it('defaults the lag to the lead when only the lead is supplied', () => {
    // Asymmetric windows are the exception; the common case is symmetric, so
    // `lagMs` follows `leadMs` rather than falling back independently.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ extraEntities: [ORDER_SERVICE_ENTITY], leadMs: 60_000, lagMs: undefined }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.cases[0]?.window).toEqual({
      start: '2025-03-01T00:09:00.000Z',
      end: '2025-03-01T00:11:00.000Z',
    });
  });

  it('derives the window from the lead and lag around the injection time', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options({ leadMs: 60_000, lagMs: 120_000 }));
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.cases[0]?.window).toEqual({
      start: '2025-03-01T00:09:00.000Z',
      end: '2025-03-01T00:12:00.000Z',
    });
  });

  it('honours an explicitly supplied window', () => {
    const window = { start: '2025-03-01T00:00:00.000Z', end: '2025-03-01T01:00:00.000Z' };
    const result = ingestPrimeDataset(METRIC_FILE, options({ cases: [{ ...BASE_CASE, window }] }));
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.cases[0]?.window).toEqual(window);
  });
});

describe('ingestPrimeDataset · entity graph', () => {
  it('resolves the root cause onto a service entity', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options());
    if (!result.ok) throw new Error(result.error);
    const gt = result.bundle.cases[0]?.groundTruth;
    expect(gt?.rootCauseEntityId).toBe('service:tt/ts-order-service');
    expect(gt?.rootCauseComponent).toBe('ts-order-service');
    expect(gt?.rootCauseReason).toBe('cpu');
  });

  it('fails loudly when the root cause is not in the graph and no extra entity declares it', () => {
    // A bare name must not resolve onto a coincidentally-named service: the
    // reproduction would then score against the wrong answer.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ cases: [{ ...BASE_CASE, component: 'ts-order' }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/ts-order/);
  });

  it('resolves a component that names a service only when the telemetry itself declares it', () => {
    // No label is ever inferred from the dataset's naming conventions: the
    // component must be either observed in the telemetry or declared as an
    // entity. Here it is neither, so the ingest refuses.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ cases: [{ ...BASE_CASE, component: 'ts-payment-service' }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/does not resolve/);
  });

  it('accepts a root cause supplied through extraEntities', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        cases: [{ ...BASE_CASE, component: 'ts-db' }],
        extraEntities: [
          { entityId: 'service:tt/ts-db', kind: 'service', name: 'ts-db', namespace: 'tt', aliases: ['ts-db-master'] },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.cases[0]?.groundTruth.rootCauseEntityId).toBe('service:tt/ts-db');
  });

  // The next four cases exist as a set. "Ambiguous" and "unresolvable" are
  // different diagnoses with opposite remedies -- disambiguate versus declare --
  // so the ingest must never report one when it means the other. A collision can
  // arrive through an entity's name OR through one of its aliases, because
  // resolution consults both; a check that only compares names will silently
  // fall through to the unresolvable branch and give the operator the wrong fix.
  it('reports an alias collision as ambiguous, not as unresolvable', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        cases: [{ ...BASE_CASE, component: 'ts-db' }],
        extraEntities: [
          { entityId: 'service:tt/ts-db', kind: 'service', name: 'ts-db', namespace: 'tt', aliases: [] },
          { entityId: 'pod:tt/db-pod-1', kind: 'pod', name: 'db-pod-1', namespace: 'tt', aliases: ['ts-db'] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/is ambiguous/);
    expect(result.error).toMatch(/service:tt\/ts-db/);
    expect(result.error).toMatch(/pod:tt\/db-pod-1/);
    // The remedy for a collision is disambiguation. Saying "declare it" would
    // send the operator to add the very label that is already contested.
    expect(result.error).not.toMatch(/does not resolve/);
  });

  it('reports a name collision as ambiguous and names every claimant', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        cases: [{ ...BASE_CASE, component: 'ts-db' }],
        extraEntities: [
          { entityId: 'service:tt/ts-db', kind: 'service', name: 'ts-db', namespace: 'tt', aliases: [] },
          { entityId: 'pod:tt/ts-db', kind: 'pod', name: 'ts-db', namespace: 'tt', aliases: [] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/is ambiguous/);
    expect(result.error).toMatch(/pod:tt\/ts-db/);
    expect(result.error).toMatch(/service:tt\/ts-db/);
    expect(result.error).not.toMatch(/does not resolve/);
  });

  it('still says a component resolves when exactly one entity claims it', () => {
    // The positive control for the two cases above: a single claimant is not a
    // collision, and the ingest must resolve it rather than refusing.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        cases: [{ ...BASE_CASE, component: 'ts-db' }],
        extraEntities: [
          { entityId: 'service:tt/ts-db', kind: 'service', name: 'ts-db', namespace: 'tt', aliases: ['ts-db-master'] },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.cases[0]?.groundTruth.rootCauseEntityId).toBe('service:tt/ts-db');
  });

  it('tells the caller to declare an entity only when none claims the name', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ cases: [{ ...BASE_CASE, component: 'ts-nowhere-service' }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/does not resolve/);
    // The remedy must be reachable from the CLI, not just the API. Naming only
    // the internal `extraEntities` option sent users after a flag that did not
    // exist; the message carries both spellings now.
    expect(result.error).toMatch(/declare it via extraEntities \(CLI: --entities\)/);
    expect(result.error).not.toMatch(/is ambiguous/);
  });

  it('merges a service seen in two files into one entity', () => {
    const result = ingestPrimeDataset(
      { 'metrics.csv': METRIC_CSV, 'logs/logs.csv': LOG_CSV },
      options(),
    );
    if (!result.ok) throw new Error(result.error);
    const services = result.bundle.graph.entities.filter((e) => e.name === 'ts-order-service');
    expect(services).toHaveLength(1);
    expect(services[0]?.aliases).toEqual([]);
  });

  it('emits entities sorted by id and edges deduplicated', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        extraEntities: [
          { entityId: 'service:tt/z', kind: 'service', name: 'z', namespace: 'tt', aliases: [] },
          { entityId: 'service:tt/a', kind: 'service', name: 'a', namespace: 'tt', aliases: [] },
        ],
        extraEdges: [
          { from: 'service:tt/a', to: 'service:tt/z', relation: 'calls' },
          { from: 'service:tt/a', to: 'service:tt/z', relation: 'calls' },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    const ids = result.bundle.graph.entities.map((e) => e.entityId);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    expect(result.bundle.graph.edges).toEqual([{ from: 'service:tt/a', to: 'service:tt/z', relation: 'calls' }]);
  });

  it('drops a self edge that would assert nothing', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ extraEdges: [{ from: 'service:tt/ts-order-service', to: 'service:tt/ts-order-service', relation: 'calls' }] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.graph.edges).toEqual([]);
  });

  it('ignores a declared entity that duplicates one already in the graph', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ extraEntities: [ORDER_SERVICE_ENTITY, ORDER_SERVICE_ENTITY] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.graph.entities.filter((e) => e.name === 'ts-order-service')).toHaveLength(1);
  });

  it('orders distinct edges deterministically', () => {
    // The module promises that identical input yields an identical bundle, and
    // edges are emitted sorted. Two distinct edges are the minimum that makes
    // the ordering observable: with one edge (or two duplicates, which collapse)
    // any order would look correct.
    const edges = [
      { from: 'service:tt/ts-order-service', to: 'service:tt/ts-db', relation: 'calls' as const },
      { from: 'service:tt/ts-order-service', to: 'service:tt/ts-cache', relation: 'calls' as const },
    ];
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        extraEntities: [
          { entityId: 'service:tt/ts-db', kind: 'service', name: 'ts-db', namespace: 'tt', aliases: [] },
          { entityId: 'service:tt/ts-cache', kind: 'service', name: 'ts-cache', namespace: 'tt', aliases: [] },
        ],
        // Declared out of order, so a pass-through implementation would be caught.
        extraEdges: edges,
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.graph.edges).toEqual([
      { from: 'service:tt/ts-order-service', to: 'service:tt/ts-cache', relation: 'calls' },
      { from: 'service:tt/ts-order-service', to: 'service:tt/ts-db', relation: 'calls' },
    ]);
  });

  it('refuses a malformed edge relation, naming the closed set', () => {
    // The relation is validated at the ingest boundary now, so the caller gets
    // the closed set back instead of the schema's "assembled bundle failed
    // validation". The schema finish line still exists as defence in depth for
    // a bundle built by other means; `schema.test.ts` covers that half.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        extraEdges: [
          {
            from: 'service:tt/ts-order-service',
            to: 'service:tt/ts-db',
            relation: 'bogus' as never,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/unknown relation 'bogus'/);
    expect(result.error).toMatch(/contains\|hosts\|calls\|same_as/);
  });

  it('refuses an ambiguous component name instead of guessing which entity it means', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        extraEntities: [
          ORDER_SERVICE_ENTITY,
          { entityId: 'pod:tt/ts-order-service-pod', kind: 'pod', name: 'ts-order-service', namespace: 'tt', aliases: [] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/ambiguous/i);
    expect(result.error).toContain('service:tt/ts-order-service');
    expect(result.error).toContain('pod:tt/ts-order-service-pod');
  });

  it('routes a prefixless file to a later prefixless case when the prefix matches nothing', () => {
    const result = ingestPrimeDataset(
      { 'a/metrics.csv': METRIC_CSV, 'b/metrics.csv': METRIC_CSV },
      options({
        extraEntities: [ORDER_SERVICE_ENTITY],
        cases: [
          { ...BASE_CASE, caseId: 'first', pathPrefixes: ['zzz/'] },
          { ...BASE_CASE, caseId: 'second' },
        ],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    // `first` matched nothing, so both files fall to the catch-all case.
    expect(result.report.find((r) => r.caseId === 'first')?.files).toEqual([]);
    expect(result.report.find((r) => r.caseId === 'second')?.files).toEqual(['a/metrics.csv', 'b/metrics.csv']);
  });

  it('leaves nothing unclaimed when a catch-all case exists', () => {
    const result = ingestPrimeDataset({ 'a/metrics.csv': METRIC_CSV, 'b/metrics.csv': METRIC_CSV }, options());
    if (!result.ok) throw new Error(result.error);
    expect(result.unclaimed).toEqual([]);
  });

  it('carries the query and difficulty onto the case when supplied', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ cases: [{ ...BASE_CASE, query: 'which service is at fault?', difficulty: 'L2' }] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.cases[0]?.query).toBe('which service is at fault?');
    expect(result.bundle.cases[0]?.difficulty).toBe('L2');
  });
});

describe('ingestPrimeDataset · declared entity and edge validation', () => {
  // The declarations are the one part of the graph the caller writes by hand,
  // so they are the one part that can be internally inconsistent. Each check
  // below rejects at the boundary that created the inconsistency and names the
  // offending field, rather than deferring to the G2 gate or to zod's
  // generic "String must contain at least 1 character(s)".

  const ORDER = ORDER_SERVICE_ENTITY.entityId;

  it('rejects an edge whose endpoint is not an entity', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ extraEntities: [ORDER_SERVICE_ENTITY], extraEdges: [{ from: ORDER, to: 'service:tt/ghost', relation: 'calls' }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/service:tt\/ghost/);
    expect(result.error).toMatch(/edge/i);
    expect(result.error).not.toMatch(/assembled bundle failed validation/);
  });

  it('names which side of the edge is dangling', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ extraEntities: [ORDER_SERVICE_ENTITY], extraEdges: [{ from: 'service:tt/ghost', to: ORDER, relation: 'calls' }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/from/);
    expect(result.error).toMatch(/service:tt\/ghost/);
  });

  it('rejects an edge with a blank endpoint and says it is blank', () => {
    // A blank endpoint is a missing reference, not a named-but-absent one, so
    // the message must not claim the caller referenced something.
    const result = ingestPrimeDataset(METRIC_FILE, options({ extraEdges: [{ from: '   ', to: ORDER, relation: 'calls' }] }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/non-blank/i);
    expect(result.error).toMatch(/edge/i);
  });

  it('rejects an empty-string edge endpoint', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options({ extraEdges: [{ from: '', to: ORDER, relation: 'calls' }] }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/non-blank/i);
    expect(result.error).not.toMatch(/assembled bundle failed validation/);
  });

  it('rejects a declared entity with a blank name', () => {
    // A blank name becomes a `byAlias` key; two of them manufacture an alias
    // ambiguity that is then blamed on an unrelated root cause.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ extraEntities: [{ entityId: 'service:tt/a', kind: 'service', name: '   ', aliases: [] }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/name/i);
    expect(result.error).toMatch(/non-blank/i);
  });

  it('rejects a declared entity with a blank id', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ extraEntities: [{ entityId: ' ', kind: 'service', name: 'a', aliases: [] }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/entityId/i);
  });

  it('rejects a declared entity carrying a blank alias', () => {
    // An alias is a lookup key just like a name. A blank one would enter
    // `byAlias` and collide with every other blank alias, so it is rejected by
    // the same rule rather than slipping through as "not the name field".
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ extraEntities: [{ entityId: 'service:tt/a', kind: 'service', name: 'a', aliases: [''] }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/alias/i);
    expect(result.error).toMatch(/blank/i);
    // Names the entity whose alias is at fault, so a multi-entity declaration
    // does not leave the caller hunting for which one.
    expect(result.error).toMatch(/service:tt\/a/);
  });

  it('rejects both an empty-string and a whitespace `to` endpoint, naming that side', () => {
    // `from` and `to` are checked by the same rule, and the padding forms are
    // covered here for both sides so neither endpoint can regress alone.
    for (const blank of ['', '   ', '\t']) {
      const result = ingestPrimeDataset(
        METRIC_FILE,
        options({ extraEntities: [ORDER_SERVICE_ENTITY], extraEdges: [{ from: ORDER, to: blank, relation: 'calls' }] }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error).toMatch(/edge\.to/);
      expect(result.error).toMatch(/blank/i);
    }
  });

  it('reports the dangling reference when a blank and a dangling edge are both declared', () => {
    // `validateDeclarations` scans the edges in order and returns on the first
    // blank endpoint, so it cannot see the dangling edge behind it -- but the
    // graph stage can, and it outranks the blank one because a named-but-absent
    // reference is a fact about the graph rather than a malformed field. The
    // order below puts the blank edge FIRST, which is the arrangement that
    // would expose a regression to source-order reporting.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        extraEntities: [ORDER_SERVICE_ENTITY],
        extraEdges: [
          { from: '   ', to: ORDER, relation: 'calls' },
          { from: ORDER, to: 'service:tt/ghost', relation: 'calls' },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/service:tt\/ghost/);
    expect(result.error).toMatch(/which is not an entity/);
    expect(result.error).not.toMatch(/non-blank/);
  });

  it('still accepts a consistent declaration', () => {
    // The positive control: an edge between two entities that both exist must
    // not be caught by the tightening above.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({
        extraEntities: [
          ORDER_SERVICE_ENTITY,
          { entityId: 'service:tt/ts-pay-service', kind: 'service', name: 'ts-pay-service', namespace: 'tt', aliases: [] },
        ],
        extraEdges: [{ from: ORDER, to: 'service:tt/ts-pay-service', relation: 'calls' }],
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.graph.edges).toHaveLength(1);
    expect(checkG2Semantic(result.bundle)).toEqual({ gateId: 'G2', status: 'passed', violations: [] });
  });

  it('still accepts a padded but non-blank entity name', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ extraEntities: [{ entityId: 'service:tt/pad', kind: 'service', name: ' pad ', aliases: [] }] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.graph.entities.some((e) => e.entityId === 'service:tt/pad')).toBe(true);
  });
});

describe('ingestPrimeDataset · bundle quality', () => {
  it('produces a bundle that passes the G2 semantic gate', () => {
    const result = ingestPrimeDataset(
      { 'metrics.csv': METRIC_CSV, 'logs/logs.csv': LOG_CSV },
      options(),
    );
    if (!result.ok) throw new Error(result.error);
    expect(checkG2Semantic(result.bundle)).toEqual({ gateId: 'G2', status: 'passed', violations: [] });
  });

  it('carries the dataset identity on the case environment', () => {
    const result = ingestPrimeDataset(METRIC_FILE, options());
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.cases[0]?.environment.system).toBe('tt');
    expect(result.bundle.cases[0]?.system).toBe('tt');
  });

  it('normalises the fault type and infers its category', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ cases: [{ ...BASE_CASE, faultType: 'Memory Stress' }] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.cases[0]?.fault).toMatchObject({ type: 'memory-stress', category: 'resource' });
  });

  it('classifies an unmappable fault type as `unknown` rather than guessing', () => {
    // `unknown` is a declared member of the category contract and every
    // exporter has a value for it, so an unrecognised fault type is a legitimate
    // bundle -- not a case to reject and not a category to invent. Guessing
    // `resource` here would claim the injector perturbed a resource when nothing
    // in the input says so, and the mistake would survive into the answer key.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ cases: [{ ...BASE_CASE, faultType: 'zzz-novel-injector' }] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.cases[0]?.fault).toMatchObject({ type: 'zzz-novel-injector', category: 'unknown' });
  });

  it('rejects a case whose difficulty is outside the declared levels', () => {
    // The last guard in the function: per-case validation covers the fields it
    // knows about, and this asserts the assembled bundle is still checked
    // against the full IR contract afterwards. Without it, a field that only the
    // case guards miss would travel into a bundle whose schema it violates.
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ cases: [{ ...BASE_CASE, difficulty: 'L9' as FaultCase['difficulty'] }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/assembled bundle failed validation/);
    expect(result.error).toMatch(/L1/);
  });

  it('is deterministic across runs', () => {
    const a = ingestPrimeDataset({ 'metrics.csv': METRIC_CSV, 'logs/logs.csv': LOG_CSV }, options());
    const b = ingestPrimeDataset({ 'metrics.csv': METRIC_CSV, 'logs/logs.csv': LOG_CSV }, options());
    if (!a.ok || !b.ok) throw new Error('unexpected failure');
    expect(JSON.stringify(a.bundle)).toBe(JSON.stringify(b.bundle));
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
  });

  it('records the dataset identity on the case environment', () => {
    const result = ingestPrimeDataset(
      METRIC_FILE,
      options({ dataset: 'openrca-1.0', system: 'order-prod' }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.irVersion).toBe('2.0');
    expect(result.bundle.cases[0]?.environment.system).toBe('order-prod');
    expect(result.bundle.graph.entities[0]?.namespace).toBe('order-prod');
  });
});
