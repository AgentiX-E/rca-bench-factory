import { describe, expect, it } from 'vitest';
import {
  OPENRCA_OFFSET_MINUTES,
  buildMetricCsv,
  buildPredictionJson,
  exportOpenRca,
  injectTimeUnixSeconds,
} from '../src/export/openrca.js';
import { buildLogsCsv, buildMetricsJson, caseDirName, exportRcaEval } from '../src/export/rcaeval.js';
import type { IrBundle, TelemetrySignal } from '../src/ir/types.js';
import { logAt, validBundle, validCase } from './fixtures.js';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0] === ''));
}

describe('OpenRCA exporter', () => {
  it('emits the required directory layout', () => {
    const { files } = exportOpenRca(validBundle());
    const paths = Object.keys(files).sort();
    expect(paths).toContain('order-prod/2026_09_06/telemetry/metric/case-001.csv');
    expect(paths).toContain('order-prod/2026_09_06/telemetry/log/case-001.csv');
    expect(paths).toContain('order-prod/2026_09_06/telemetry/trace/case-001.csv');
    expect(paths).toContain('order-prod/query.csv');
    expect(paths).toContain('order-prod/record.csv');
  });

  it('stores metrics in long form with the columns the scorer expects', () => {
    const { files } = exportOpenRca(validBundle());
    const csv = files['order-prod/2026_09_06/telemetry/metric/case-001.csv'] as string;
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(['timestamp', 'cmdb_id', 'kpi_name', 'value']);
    expect(rows[1]?.slice(1, 3)).toEqual(['order-pod-1', 'cpu_usage']);
  });

  it('records every timestamp in UTC+8', () => {
    const { files } = exportOpenRca(validBundle());
    const csv = files['order-prod/2026_09_06/telemetry/metric/case-001.csv'] as string;
    const firstDataRow = parseCsv(csv)[1] as string[];
    // Fixture baseline starts at 00:00:00Z which is 08:00:00 in UTC+8.
    expect(firstDataRow[0]).toBe('2026-09-06 08:00:00');
    expect(OPENRCA_OFFSET_MINUTES).toBe(480);
  });

  it('creates an empty log directory for subsystems without logs', () => {
    const b: IrBundle = validBundle({
      signals: { 'case-001': (validBundle().signals['case-001'] ?? []).filter((s) => s.payload.kind !== 'log') },
    });
    const { files } = exportOpenRca(b);
    const csv = files['order-prod/2026_09_06/telemetry/log/case-001.csv'] as string;
    expect(parseCsv(csv)).toEqual([['timestamp', 'cmdb_id', 'severity', 'message']]);
  });

  it('separates the task file from the answer key file', () => {
    const { files } = exportOpenRca(validBundle());
    const query = files['order-prod/query.csv'] as string;
    const record = files['order-prod/record.csv'] as string;
    expect(query).not.toContain('root cause component');
    expect(record).toContain('root cause component');
  });

  it('emits a prediction object with the three contract keys', () => {
    const parsed = JSON.parse(buildPredictionJson(validCase())) as Record<string, Record<string, string>>;
    expect(Object.keys(parsed['1'] as Record<string, string>).sort()).toEqual([
      'root cause component',
      'root cause occurrence datetime',
      'root cause reason',
    ]);
  });

  it('escapes commas and quotes in CSV cells', () => {
    const b = validBundle({
      signals: {
        'case-001': [
          {
            irVersion: '2.0',
            resource: { 'service.name': 'order' },
            timestamp: '2026-09-06T00:01:00.000Z',
            signal: 'log',
            payload: { kind: 'log', body: 'error, with "quotes"', severityText: 'ERROR' },
          },
        ],
      },
    });
    const csv = buildMetricCsv(b.signals['case-001'] ?? []);
    expect(csv).toContain('timestamp,cmdb_id,kpi_name,value');
    const { files } = exportOpenRca(b);
    const logCsv = files['order-prod/2026_09_06/telemetry/log/case-001.csv'] as string;
    expect(logCsv).toContain('"error, with ""quotes"""');
  });

  it('skips cases without telemetry instead of emitting empty directories', () => {
    const b = validBundle({ signals: {} });
    const { skipped } = exportOpenRca(b);
    expect(skipped).toEqual([{ caseId: 'case-001', reason: 'no telemetry signals attached' }]);
  });

  it('exposes the injection time as Unix seconds', () => {
    expect(injectTimeUnixSeconds(validCase())).toBe(Math.floor(Date.parse('2026-09-06T00:10:00.000Z') / 1000));
  });
});

describe('RCAEval exporter', () => {
  it('emits metrics.json and inject_time.txt for every case', () => {
    const { files } = exportRcaEval(validBundle(), 'RE2');
    const paths = Object.keys(files);
    expect(paths.some((p) => p.endsWith('/metrics.json'))).toBe(true);
    expect(paths.some((p) => p.endsWith('/inject_time.txt'))).toBe(true);
  });

  it('emits logs and traces for RE2 but not for RE1', () => {
    const re2 = exportRcaEval(validBundle(), 'RE2');
    const re1 = exportRcaEval(validBundle(), 'RE1');
    expect(Object.keys(re2.files).some((p) => p.endsWith('/logs.csv'))).toBe(true);
    expect(Object.keys(re2.files).some((p) => p.endsWith('/traces.csv'))).toBe(true);
    expect(Object.keys(re1.files).some((p) => p.endsWith('/logs.csv'))).toBe(false);
    expect(Object.keys(re1.files).some((p) => p.endsWith('/traces.csv'))).toBe(false);
  });

  it('writes the injection time as integer Unix seconds', () => {
    const { files } = exportRcaEval(validBundle(), 'RE2');
    const txt = Object.entries(files).find(([p]) => p.endsWith('inject_time.txt'))?.[1] as string;
    expect(txt).toMatch(/^\d{10}$/);
    expect(Number(txt)).toBe(Math.floor(Date.parse('2026-09-06T00:10:00.000Z') / 1000));
  });

  it('groups metrics by name and orders them by time', () => {
    const parsed = JSON.parse(buildMetricsJson(validBundle().signals['case-001'] ?? [])) as Record<
      string,
      number[]
    >;
    expect(Object.keys(parsed)).toContain('cpu_usage');
    expect(parsed['cpu_usage']).toHaveLength(15);
    expect(parsed['cpu_usage']?.[0]).toBe(20);
    expect(parsed['cpu_usage']?.[14]).toBe(99);
  });

  it('builds a directory name from benchmark, service and fault', () => {
    expect(caseDirName('RE2', validCase(), 1)).toBe('RE2-order-cpu_1');
  });

  it('skips cases without telemetry', () => {
    const { skipped } = exportRcaEval(validBundle({ signals: {} }), 'RE2');
    expect(skipped[0]).toMatchObject({ caseId: 'case-001' });
  });

  it('flags non-code faults when exporting RE3', () => {
    const { skipped } = exportRcaEval(validBundle(), 'RE3');
    expect(skipped[0]).toMatchObject({ reason: 'RE3 targets code-level faults only' });
  });

  it('emits no files for a non-code fault under RE3', () => {
    // A skipped case must not leave artefacts behind: a benchmark consumer that
    // reads the output directory would otherwise evaluate a case the exporter
    // itself declared unusable.
    const { files, skipped } = exportRcaEval(validBundle(), 'RE3');
    expect(skipped).toHaveLength(1);
    expect(Object.keys(files)).toEqual([]);
  });

  it('escapes CSV special characters in log messages', () => {
    const csv = buildLogsCsv([logAt(610, 'pool "primary" exhausted, retrying')]);
    expect(csv).toContain('"pool ""primary"" exhausted, retrying"');
  });

  it('emits an empty service column when the signal carries no service name', () => {
    const signal: TelemetrySignal = {
      ...logAt(610, 'no service name'),
      resource: {} as unknown as TelemetrySignal['resource'],
    };
    const row = parseCsv(buildLogsCsv([signal]))[1] as string[];
    expect(row[1]).toBe('');
  });

  it('accepts code-level faults for RE3', () => {
    const b = validBundle({
      cases: [validCase({ fault: { type: 'f1', category: 'code' } })],
    });
    const { skipped } = exportRcaEval(b, 'RE3');
    expect(skipped).toEqual([]);
  });
});
