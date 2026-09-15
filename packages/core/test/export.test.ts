import { describe, expect, it } from 'vitest';
import {
  OPENRCA_OFFSET_MINUTES,
  buildMetricCsv,
  buildPredictionJson,
  exportOpenRca,
  injectTimeUnixSeconds,
} from '../src/export/openrca.js';
import { exportOpenRca2 } from '../src/export/openrca2.js';
import { buildLogsCsv, buildMetricsJson, caseDirName, exportRcaEval } from '../src/export/rcaeval.js';
import { exportRca100 } from '../src/export/rca100.js';
import { exportAioPs2025 } from '../src/export/aiops2025.js';
import { exportCloudOpsBench } from '../src/export/cloudopsbench.js';
import { exportItBench } from '../src/export/itbench.js';
import type { IrBundle, TelemetrySignal } from '../src/ir/types.js';
import { logAt, validBundle, validCase } from './fixtures.js';

/**
 * A bundle that is structurally valid but self-contradictory: the graph carries
 * an edge to `service:default/ghost`, which no entity in the file declares.
 *
 * Kept next to the exporters because it is the input every export-boundary
 * assertion is built from -- the defect it encodes is that reachability, not
 * the missing node itself.
 */
function contradictory(): IrBundle {
  const b = validBundle();
  return {
    ...b,
    graph: {
      ...b.graph,
      edges: [{ from: 'service:default/order', to: 'service:default/ghost', relation: 'calls' }],
    },
  };
}

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

describe('exporters reject a bundle whose graph contradicts itself', () => {
  // `export` used to be the one boundary with no integrity check of its own: it
  // trusted the JSON it was handed, so a bundle carrying an edge to an entity
  // the file never declares exported cleanly and exited 0. Only `gate` raised
  // G2/DANGLING_EDGE_REF -- and a user running export alone never saw it.
  //
  // The damage is not confined to a missing node. `buildTopologyJson` types an
  // unknown endpoint via `UMODEL_TYPE[byId.get(id)?.kind ?? 'external']`, so the
  // invented router is *labelled* `apm.external`. The exported dataset therefore
  // asserts an observation nobody made, and a benchmark consumer cannot tell it
  // apart from a genuinely observed external dependency.
  //
  // Every exporter is listed here rather than a representative sample: a guard
  // wired into some targets and not others turns "which target did you pick?"
  // into the thing that decides whether inconsistent input is caught.
  //
  // The bundle is a *parameter* rather than baked into each closure, so the
  // positive control below runs the same seven exporters over the consistent
  // fixture. Baking it in would have made the control assert nothing -- it
  // would have exercised `contradictory()` and asserted that it exports.
  const exporters: Array<[string, (bundle: IrBundle) => unknown]> = [
    ['openrca-1.0', (b) => exportOpenRca(b)],
    ['openrca-2.0', (b) => exportOpenRca2(b)],
    ['rcaeval', (b) => exportRcaEval(b, 'RE2')],
    ['rca100', (b) => exportRca100(b)],
    ['aiops2025', (b) => exportAioPs2025(b)],
    ['cloud-opsbench', (b) => exportCloudOpsBench(b)],
    ['itbench', (b) => exportItBench(b)],
  ];

  it.each(exporters)('rejects a dangling edge endpoint (%s)', (_name, run) => {
    expect(() => run(contradictory())).toThrow(/service:default\/ghost/);
  });

  it.each(exporters)('names the missing entity and the field at fault (%s)', (_name, run) => {
    // The message must be actionable on its own: the operator has an edge list
    // and needs to know which side to fix.
    expect(() => run(contradictory())).toThrow(/edge\.to/);
    expect(() => run(contradictory())).toThrow(/not an entity/);
  });

  it.each(exporters)('accepts a consistent bundle (%s)', (_name, run) => {
    // The positive control. "Reject bad input" is trivially satisfiable by
    // rejecting everything, so each exporter that rejects a contradiction must
    // still export the very fixture the rest of this file exports.
    expect(() => run(validBundle())).not.toThrow();
  });
});

/**
 * The CSV writers used to be two private copies, and they disagreed.
 *
 * `openrca.ts` declared `csvEscape(value: string | number)` -- `String(value)`
 * unbranched -- while `rcaeval.ts` declared `csvEscape(value: string | number |
 * undefined | null)` and mapped `null`/`undefined` to `''`. Same name, same
 * output on the inputs either could accept, opposite output on the ones only
 * one of them accepted. Nothing in the product decided which was right, because
 * each was private to its own file and neither was asserted directly.
 *
 * A reader has to know what a cell holds before it can know which writer
 * produced it, and that is the definition of a format that is not specified.
 *
 * The assertions below are run **against each writer separately**, not one
 * against the other. A differential alone is not enough: when both writers are
 * handed a value only one of them can receive, comparing them only exercises
 * the writer that actually took it, and the other test passes without reading
 * anything. Each writer is therefore asked the question on its own terms.
 */
describe('CSV cells · an absent value is an empty cell, not the word "null"', () => {
  /**
   * A span at the root of a trace: no parent, no status.
   *
   * Both fields are optional in the IR and both are positional in the CSV, so
   * an absent one still occupies its column. This is the only fixture in the
   * suite that reaches the branches where the two copies disagreed.
   */
  const rootSpan: TelemetrySignal = {
    irVersion: '2.0',
    resource: { 'service.name': 'order' },
    timestamp: '2026-09-06T00:01:00.000Z',
    signal: 'trace',
    payload: { kind: 'trace', traceId: 't1', spanId: 's1', spanName: 'GET /order', durationMs: 5 },
  };

  /** The RCAEval trace CSV one case produces. */
  function rcaevalTraceCsv(): string {
    return Object.entries(exportRcaEval(validBundle({ signals: { 'case-001': [rootSpan] } }), 'RE2').files).find(
      ([p]) => p.endsWith('/traces.csv'),
    )?.[1] as string;
  }

  /** The OpenRCA trace CSV one case produces. */
  function openrcaTraceCsv(): string {
    return Object.entries(exportOpenRca(validBundle({ signals: { 'case-001': [rootSpan] } })).files).find(([p]) =>
      p.endsWith('/telemetry/trace/case-001.csv'),
    )?.[1] as string;
  }

  /**
   * Every CSV a trace signal reaches, named so a failure says which one broke.
   *
   * Two writers, and the two columns on which they used to disagree. Listing
   * the writers rather than picking a representative one is deliberate: the
   * defect was that the two files could answer differently, so a test that
   * only measures one of them cannot see it return.
   */
  const writers: Array<[string, () => string]> = [
    ['rcaeval', rcaevalTraceCsv],
    ['openrca', openrcaTraceCsv],
  ];

  it.each(writers)('writes an empty parent span id for a root span (%s)', (_name, csvOf) => {
    const row = parseCsv(csvOf())[1] as string[];
    expect(row[3]).toBe('');
  });

  it.each(writers)('writes an empty status cell for a span whose status is absent (%s)', (_name, csvOf) => {
    const row = parseCsv(csvOf())[1] as string[];
    expect(row[7]).toBe('');
  });

  it.each(writers)('never spells an absent value as "null" or "undefined" (%s)', (_name, csvOf) => {
    // Asserted over the whole file, not one column: the defect was in the
    // escaping helper, so it could surface in any cell a writer filled from an
    // optional field, including ones added later.
    const csv = csvOf();
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });

  it.each(writers)('keeps the column count fixed when optional fields are absent (%s)', (_name, csvOf) => {
    // A shorter row would be padded by the reader, so the row length is what
    // distinguishes "an absent value" from "a column this writer forgot".
    const rows = parseCsv(csvOf());
    expect(rows[0]).toHaveLength(8);
    expect(rows[1]).toHaveLength(8);
  });

  it('spells an absent value the same way in both writers', () => {
    // The differential, kept as the statement of the invariant itself: one
    // format, one answer. It is a weaker test than the four above -- it says
    // the writers agree, not that they agree on the right thing -- which is
    // exactly why the value is asserted separately rather than here alone.
    const rcaevalCell = (parseCsv(rcaevalTraceCsv())[1] as string[])[3];
    const openrcaCell = (parseCsv(openrcaTraceCsv())[1] as string[])[3];
    expect(openrcaCell).toBe(rcaevalCell);
    expect(openrcaCell).toBe('');
  });
});
