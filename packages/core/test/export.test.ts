import { describe, expect, it } from 'vitest';
import {
  OPENRCA_OFFSET_MINUTES,
  buildMetricCsv,
  buildPredictionJson,
  exportOpenRca,
  injectTimeUnixSeconds,
} from '../src/export/openrca.js';
import { exportOpenRca2 } from '../src/export/openrca2.js';
import {
  RCAEVAL_UNFILLED_COLUMNS,
  buildDataCsv,
  buildLogsCsv,
  buildTracesCsv,
  casePath,
  exportRcaEval,
} from '../src/export/rcaeval.js';
import { checkRcaEvalStructure } from '../src/score/score.js';
import { parseRcaEvalPath } from '../src/score/official.js';
import { exportRca100 } from '../src/export/rca100.js';
import { exportAioPs2025 } from '../src/export/aiops2025.js';
import { exportCloudOpsBench } from '../src/export/cloudopsbench.js';
import { exportItBench } from '../src/export/itbench.js';
import type { IrBundle, TelemetrySignal } from '../src/ir/types.js';
import { logAt, metricAt, validBundle, validCase } from './fixtures.js';

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
  it('emits data.csv and inject_time.txt for every case', () => {
    const { files } = exportRcaEval(validBundle(), 'RE2');
    const paths = Object.keys(files);
    expect(paths.some((p) => p.endsWith('/data.csv'))).toBe(true);
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

  /**
   * A table is written only when it has rows.
   *
   * Declaring `logs.csv` and `traces.csv` for the suite is not the same claim as the
   * case carrying them, and until these four tests the exporter could not tell the
   * two apart: it wrote both files for every RE2/RE3 case, so the corpus's 30
   * annotated cases produced 19 header-only `logs.csv` and 25 header-only
   * `traces.csv`. The reader in `check-official` treats "declared and absent" as a
   * refusal, so an empty file here is the exporter manufacturing the evidence that
   * rule asks for (finding 321).
   */
  describe('a table is written only when it has rows', () => {
    const metricsOnly = () =>
      validBundle({ signals: { 'case-001': validBundle().signals['case-001']!.filter((s) => s.signal === 'metric') } });
    const withSpans = () =>
      validBundle({
        signals: {
          'case-001': validBundle().signals['case-001']!.filter((s) => s.signal === 'metric' || s.signal === 'trace'),
        },
      });

    it('writes neither modality file for a case that carries neither', () => {
      const { files, skipped } = exportRcaEval(metricsOnly(), 'RE2');
      expect(skipped).toEqual([]);
      expect(Object.keys(files).map((p) => p.slice(p.lastIndexOf('/') + 1)).sort()).toEqual([
        'data.csv',
        'inject_time.txt',
      ]);
    });

    it('writes the span table and no log table for a case with spans and no log line', () => {
      const { files } = exportRcaEval(withSpans(), 'RE2');
      const names = Object.keys(files).map((p) => p.slice(p.lastIndexOf('/') + 1));
      expect(names).toContain('traces.csv');
      expect(names).not.toContain('logs.csv');
    });

    it('writes the log table and no span table for a case with a log line and no span', () => {
      const logsOnly = validBundle({
        signals: {
          'case-001': validBundle().signals['case-001']!.filter((s) => s.signal === 'metric' || s.signal === 'log'),
        },
      });
      const names = Object.keys(exportRcaEval(logsOnly, 'RE2').files).map((p) => p.slice(p.lastIndexOf('/') + 1));
      expect(names).toContain('logs.csv');
      expect(names).not.toContain('traces.csv');
    });

    it('skips a case with no metric signal instead of writing a header-only data.csv', () => {
      // Upstream finds a case by globbing for `data.csv`, so this case would have been
      // a directory of files the harness never opens -- and a header-only `data.csv`
      // reads back as "this case has no metric readings", which is a different and
      // unfixable statement. The same refusal a case with no signals at all gets.
      const spanOnly = validBundle({
        signals: { 'case-001': validBundle().signals['case-001']!.filter((s) => s.signal === 'trace') },
      });
      const { files, skipped } = exportRcaEval(spanOnly, 'RE2');
      expect(files).toEqual({});
      expect(skipped).toEqual([
        { caseId: 'case-001', reason: 'no metric signals attached, and a case is found by its data.csv' },
      ]);
      // And the case with nothing at all keeps the sentence it already had: two
      // different absences are two different repairs.
      expect(exportRcaEval(validBundle({ signals: {} }), 'RE2').skipped).toEqual([
        { caseId: 'case-001', reason: 'no telemetry signals attached' },
      ]);
    });

    it('stops a metrics-only case from satisfying the RE2 modality set', () => {
      // The structural contract is where the blindness was: an empty `logs.csv` is
      // still a `logs.csv` with the right header, so a case with no log signal used
      // to pass a check whose own subject is which modalities the case carries.
      const report = checkRcaEvalStructure(exportRcaEval(metricsOnly(), 'RE2').files, 'RE2');
      const modality = report.checks.find((c) => c.id === 'modality-set');
      expect(modality?.passed).toBe(false);
      expect(modality?.detail).toContain('found logs=false traces=false');
    });
  });

  it('writes the injection time as integer Unix seconds', () => {
    const { files } = exportRcaEval(validBundle(), 'RE2');
    const txt = Object.entries(files).find(([p]) => p.endsWith('inject_time.txt'))?.[1] as string;
    expect(txt).toMatch(/^\d{10}$/);
    expect(Number(txt)).toBe(Math.floor(Date.parse('2026-09-06T00:10:00.000Z') / 1000));
  });

  // The table upstream reads: `time` first, then one column per series named
  // `<service>_<metric>`. `main.py` takes the candidate services from those names
  // and compares the `time` column against `inject_time.txt`; a
  // `{metricName: [values]}` mapping carries the same numbers and neither of those
  // two properties (finding 267).
  it('writes the metric table with a time column and one column per series', () => {
    const rows = parseCsv(buildDataCsv(validBundle().signals['case-001'] ?? []));
    expect(rows[0]).toEqual(['time', 'order_cpu_usage']);
    expect(rows).toHaveLength(16);
    // Ordered by time, and the values are the readings rather than a re-sort.
    const instants = rows.slice(1).map((row) => Number(row[0]));
    expect(instants).toEqual([...instants].sort((a, b) => a - b));
    expect(rows[1]?.[1]).toBe('20');
    expect(rows[15]?.[1]).toBe('99');
    for (const instant of instants) expect(instant).toBe(Math.floor(instant));
  });

  // A series that was not sampled leaves the cell empty. `main.py` reads the table
  // with pandas and fills forward, so a gap is something it handles; a zero would be
  // a reading this module invented.
  it('leaves a cell empty where a series has no sample, rather than writing zero', () => {
    const signals = validBundle().signals['case-001'] ?? [];
    const late: TelemetrySignal = {
      ...(signals[0] as TelemetrySignal),
      timestamp: '2026-09-06T00:20:00.000Z',
      payload: { kind: 'metric', name: 'late_metric', value: 7 },
    };
    const rows = parseCsv(buildDataCsv([...(signals as TelemetrySignal[]), late]));
    const header = rows[0] as string[];
    const column = header.indexOf('order_late_metric');
    expect(column).toBeGreaterThan(0);
    expect(rows[1]?.[column]).toBe('');
    expect(rows[rows.length - 1]?.[column]).toBe('7');
  });

  it('builds a three-level path from suite, system, service, fault and instance', () => {
    expect(casePath('RE2', validCase(), 1)).toBe('RE2-order-prod/order_cpu/1');
  });

  // The reader and the writer disagree about what a service name may contain.
  // `parseRcaEvalPath` is documented to keep hyphens ("Train Ticket ships
  // `ts-order-service`"), but the writer used to strip every non-alphanumeric
  // character, so `ts-order-service` came out as `tsorderservice`. The in-repo
  // regression could not see it: the oracle copies the component straight out of
  // the path we just wrote, so the two sides were wrong together.
  it('keeps hyphens in the service and system names, as the reader promises to', () => {
    const fc = validCase({
      groundTruth: { ...validCase().groundTruth, rootCauseComponent: 'ts-order-service' },
    });
    expect(casePath('RE2', fc, 1)).toBe('RE2-order-prod/ts-order-service_cpu/1');
  });

  // The fix must widen the allow-list, not remove it: a character the layout
  // genuinely cannot carry still has to go, or the path stops being the three
  // tokens upstream splits on.
  it('still strips a character the layout cannot carry', () => {
    const fc = validCase({
      groundTruth: { ...validCase().groundTruth, rootCauseComponent: 'order:svc' },
      fault: { ...validCase().fault, type: 'cpu/sat' },
    });
    expect(casePath('RE2', fc, 1)).toBe('RE2-order-prod/ordersvc_cpusat/1');
  });

  // Both halves of the round trip now agree, which is the only version of this
  // assertion that means anything: the path the exporter writes is read back as the
  // component and the system the IR declared.
  it('round-trips a hyphenated service name through the official reader', () => {
    const fc = validCase({
      groundTruth: { ...validCase().groundTruth, rootCauseComponent: 'ts-order-service' },
    });
    const parsed = parseRcaEvalPath(casePath('RE2', fc, 1));
    expect(parsed?.service).toBe('ts-order-service');
    expect(parsed?.fault).toBe('cpu');
    expect(parsed?.system).toBe('order-prod');
    expect(parsed?.instance).toBe('1');
  });

  // A token that sanitises away entirely would collapse the layout to
  // `order_/1`: an empty field no reader can tell from a missing one. The
  // placeholder keeps every path parseable.
  it('never emits an empty segment when a name sanitises away entirely', () => {
    const fc = validCase({
      groundTruth: { ...validCase().groundTruth, rootCauseComponent: '服务/一' },
    });
    expect(casePath('RE2', fc, 1)).toBe('RE2-order-prod/unnamed_cpu/1');
    expect(parseRcaEvalPath('RE2-order-prod/unnamed_cpu/1')?.service).toBe('unnamed');
  });

  // Leading and trailing separators are the layout's, not the name's. Keeping
  // them shifts the fields: `--order_cpu` parses as a service of `--order`.
  it('trims separator characters the name does not own', () => {
    const fc = validCase({
      groundTruth: { ...validCase().groundTruth, rootCauseComponent: '--order--' },
    });
    expect(casePath('RE2', fc, 1)).toBe('RE2-order-prod/order_cpu/1');
    expect(parseRcaEvalPath('RE2-order-prod/order_cpu/1')?.service).toBe('order');
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
    const csv = buildLogsCsv([logAt(610, 'pool "primary" exhausted, retrying')], 'RE3');
    expect(csv).toContain('"pool ""primary"" exhausted, retrying"');
  });

  it('emits an empty container_column when the signal carries no service name', () => {
    const signal: TelemetrySignal = {
      ...logAt(610, 'no service name'),
      resource: {} as unknown as TelemetrySignal['resource'],
    };
    const rows = parseCsv(buildLogsCsv([signal], 'RE3'));
    const header = rows[0] as string[];
    // Looked up by name rather than by position: the position is what changed
    // when this file started carrying the corpus's columns, and a positional
    // assertion would have kept passing while reading a different column.
    const row = rows[1] as string[];
    expect(row[header.indexOf('container_name')]).toBe('');
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

  /**
   * The RCAEval trace CSV one case produces.
   *
   * The bundle carries one metric reading beside the span, because a case is found
   * by its `data.csv`: the exporter skips a case with no metric signal, so a
   * span-only bundle exports no files at all and this helper would have returned
   * `undefined` -- which reads as "the writer lost the span" rather than as "this
   * was never a case" (finding 321).
   */
  function rcaevalTraceCsv(): string {
    const oneCase = validBundle({
      signals: { 'case-001': [metricAt(0, 'cpu_usage', 20), rootSpan] },
    });
    return Object.entries(exportRcaEval(oneCase, 'RE2').files).find(
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
  /**
   * Every writer, the name *it* gives each optional field, and how wide its row is.
   *
   * The names are per writer because the two formats spell the same fields
   * differently -- and they are looked up rather than indexed because the indices
   * are exactly what stopped being comparable: `rcaeval`'s `traces.csv` carries the
   * corpus's eleven columns (finding 266) and `openrca`'s carries eight, so a shared
   * positional assertion would have measured one column in one file and a different
   * one in the other while reading as agreement between them.
   */
  const writers: Array<[string, () => string, string, string, number]> = [
    ['rcaeval', rcaevalTraceCsv, 'parentSpanID', 'statusCode', 11],
    ['openrca', openrcaTraceCsv, 'parent_span_id', 'status', 8],
  ];

  /** One cell of the first data row, by the writer's own column name. */
  function cell(csv: string, column: string): string {
    const rows = parseCsv(csv);
    const header = rows[0] as string[];
    const at = header.indexOf(column);
    expect(at, `no '${column}' column in '${header.join(',')}'`).toBeGreaterThanOrEqual(0);
    return (rows[1] as string[])[at] as string;
  }

  it.each(writers)('writes an empty parent span id for a root span (%s)', (_name, csvOf, parentColumn) => {
    expect(cell(csvOf(), parentColumn)).toBe('');
  });

  it.each(writers)('writes an empty status cell for a span whose status is absent (%s)', (_name, csvOf, _p, statusColumn) => {
    expect(cell(csvOf(), statusColumn)).toBe('');
  });

  it.each(writers)('never spells an absent value as "null" or "undefined" (%s)', (_name, csvOf) => {
    // Asserted over the whole file, not one column: the defect was in the
    // escaping helper, so it could surface in any cell a writer filled from an
    // optional field, including ones added later.
    const csv = csvOf();
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });

  it.each(writers)('keeps the column count fixed when optional fields are absent (%s)', (_name, csvOf, _p, _s, width) => {
    // A shorter row would be padded by the reader, so the row length is what
    // distinguishes "an absent value" from "a column this writer forgot". The
    // width is per writer and comes from the format's own header, which for
    // `rcaeval` is the corpus's eleven rather than a number this repository chose.
    const rows = parseCsv(csvOf());
    expect(rows[0]).toHaveLength(width);
    expect(rows[1]).toHaveLength(width);
  });

  it('spells an absent value the same way in both writers', () => {
    // The differential, kept as the statement of the invariant itself: one value,
    // one answer. It is a weaker test than the four above -- it says the writers
    // agree, not that they agree on the right thing -- which is exactly why the
    // value is asserted separately rather than here alone.
    const rcaevalCell = cell(rcaevalTraceCsv(), 'parentSpanID');
    const openrcaCell = cell(openrcaTraceCsv(), 'parent_span_id');
    expect(openrcaCell).toBe(rcaevalCell);
    expect(openrcaCell).toBe('');
  });
});

/**
 * The log and trace columns, as the corpora spell them.
 *
 * ## Why the expected header is a literal here
 *
 * Every other assertion in this file is derived — from the format, from the
 * exporter, from another writer. These three strings are the exception on
 * purpose: they were read out of the archives, and a value read out of a real
 * artifact is the one thing a test cannot derive from the code it is testing.
 * Deriving them (from `RCAEVAL_LOGS_COLUMNS`, say) would make the test agree with
 * whatever the exporter does, which is exactly the defect finding 266 records.
 *
 * Provenance, both measured 2026-10-27:
 *
 *   RE2-OB/checkoutservice_cpu/1/traces.csv   first row, 11 columns
 *   RE3-OB/emailservice_f1/1/traces.csv       first row, identical
 *   RE2-OB/checkoutservice_cpu/1/logs.csv     9 columns
 *   RE3-OB/emailservice_f1/1/logs.csv         6 columns
 *
 * The two `traces.csv` files agreeing and the two `logs.csv` files not is why
 * there is one trace list and two log lists; a test that only looked at one
 * archive would have been consistent with both designs.
 */
describe('RCAEval exporter · the columns are the corpora’s, measured', () => {
  const MEASURED_TRACES =
    'time,traceID,spanID,serviceName,methodName,operationName,startTimeMillis,startTime,duration,statusCode,parentSpanID';
  const MEASURED_LOGS_RE2 = 'time,timestamp,container_name,message,level,req_path,error,cluster_id,log_template';
  const MEASURED_LOGS_RE3 = 'time,timestamp,container_name,message,pod_name,node_name';

  /**
   * A log signal with every field the IR has, populated.
   *
   * The "everything" matters: the claim under test is not that these columns are
   * usually empty but that they are empty *even when there is something to say*,
   * which is the only form in which the statement can be falsified.
   */
  const fullLog: TelemetrySignal = {
    irVersion: '2.0',
    resource: {
      'service.name': 'checkoutservice',
      'k8s.pod.name': 'checkoutservice-588fbcd66b-rzd62',
      'k8s.node.name': 'ip-192-168-24-141',
    },
    timestamp: '2024-01-15T21:24:06.067Z',
    signal: 'log',
    payload: { kind: 'log', body: 'request started', severityText: 'ERROR', templateId: 'L007' },
  };

  /** A span with a parent and a status: nothing absent but the columns we do not carry. */
  const fullSpan: TelemetrySignal = {
    irVersion: '2.0',
    resource: { 'service.name': 'frontendservice' },
    timestamp: '2024-01-15T21:24:06.065Z',
    signal: 'trace',
    payload: {
      kind: 'trace',
      traceId: '46d5d1e1fc25a09db4a81d4d105cee3d',
      spanId: '433c41ba31b519dd',
      parentSpanId: '6de46372468bc931',
      spanName: 'grpc.hipstershop.CurrencyService/Convert',
      durationMs: 4.133,
      status: 'OK',
    },
  };

  function headerOf(csv: string): string {
    return (csv.split('\n')[0] as string).trimEnd();
  }

  function rowOf(csv: string, column: string): string {
    const rows = parseCsv(csv);
    const header = rows[0] as string[];
    const at = header.indexOf(column);
    expect(at, `no '${column}' in '${header.join(',')}'`).toBeGreaterThanOrEqual(0);
    return (rows[1] as string[])[at] as string;
  }

  function emptyColumns(csv: string): string[] {
    const rows = parseCsv(csv);
    const header = rows[0] as string[];
    const row = rows[1] as string[];
    return header.filter((_name, index) => row[index] === '');
  }

  it('writes the traces header both archives carry, byte for byte', () => {
    expect(headerOf(buildTracesCsv([fullSpan]))).toBe(MEASURED_TRACES);
  });

  it('writes nine log columns for RE2 and six for RE3', () => {
    expect(headerOf(buildLogsCsv([fullLog], 'RE2'))).toBe(MEASURED_LOGS_RE2);
    expect(headerOf(buildLogsCsv([fullLog], 'RE3'))).toBe(MEASURED_LOGS_RE3);
    // Stated as a difference, because the defect was a single list standing in for
    // both: an exporter with one log schema cannot be right for these two archives.
    expect(MEASURED_LOGS_RE2).not.toBe(MEASURED_LOGS_RE3);
  });

  it('converts the units the corpus’s columns are in', () => {
    const trace = buildTracesCsv([fullSpan]);
    // Three units, and the two files disagree about one of them. `traces.csv`'s
    // `startTimeMillis` is milliseconds and its `startTime` and `duration` are
    // microseconds; `logs.csv`'s `timestamp` is **nanoseconds**. This assertion
    // used to demand microseconds for the log column too, and passed, because it
    // was written from the same belief as the code it was checking: the module's
    // own docblock said "the unit both corpora's `timestamp` and `startTime`
    // columns use", which is a true sentence about one of the two files.
    expect(rowOf(trace, 'startTimeMillis')).toBe(String(Date.parse(fullSpan.timestamp)));
    expect(rowOf(trace, 'startTime')).toBe(String(Date.parse(fullSpan.timestamp) * 1000));
    expect(rowOf(trace, 'duration')).toBe('4133');
    // The corpus's `time` column is `HH:MM` of the instant, in UTC.
    expect(rowOf(trace, 'time')).toBe('21:24');
    expect(rowOf(buildLogsCsv([fullLog], 'RE3'), 'timestamp')).toBe(String(Date.parse(fullLog.timestamp) * 1e6));
  });

  it('writes the log instant at the width the corpus writes it', () => {
    // A digit count is a weak check on its own, so it is stated beside the value
    // rather than instead of it: the two together say "same unit" and "same
    // instant", and either alone can be satisfied by a wrong number.
    const stamp = rowOf(buildLogsCsv([fullLog], 'RE2'), 'timestamp');
    expect(stamp).toHaveLength(19);
    expect(rowOf(buildTracesCsv([fullSpan]), 'startTime')).toHaveLength(16);
    expect(rowOf(buildTracesCsv([fullSpan]), 'startTimeMillis')).toHaveLength(13);
  });

  it('writes no status code, because the column is a gRPC status and the IR has an OTel one', () => {
    // This test used to assert the opposite: `UNSET` → `0`, `OK` → `1`,
    // `ERROR` → `2`, under a docblock that said the column holds OpenTelemetry's
    // codes "because that is what the column is". RE3-OB says it is not. Of
    // 164 920 spans in `emailservice_f1/1`: 157 156 carry `0.0`, 7 626 are empty,
    // and 138 carry `14.0` -- gRPC `UNAVAILABLE`, and the whole of that case's
    // failure signal: every one of the 138 is `checkoutservice` calling
    // `hipstershop.EmailService/SendOrderConfirmation`, every one of them after
    // the injection instant, in a case about a fault in `emailservice`.
    //
    // So the mapping is not merely approximate: an OTel `OK` would have been
    // written as `1`, which is gRPC `CANCELLED` -- a failure. The column is now
    // empty and named in `RCAEVAL_UNFILLED_COLUMNS`, and this test holds every
    // status, including the absence of one, to the same cell.
    const span = fullSpan.payload as Extract<TelemetrySignal['payload'], { kind: 'trace' }>;
    const cellOf = (status: 'OK' | 'ERROR' | 'UNSET' | undefined): string => {
      // Built field by field rather than spread-then-override: `{...span, status: undefined}`
      // keeps the key with an undefined value, and a writer that asked
      // `p.status === undefined` could not tell that from an absent key.
      const payload: TelemetrySignal['payload'] =
        status === undefined
          ? { kind: 'trace', traceId: span.traceId, spanId: span.spanId, parentSpanId: span.parentSpanId, spanName: span.spanName, durationMs: span.durationMs }
          : { ...span, status };
      return rowOf(buildTracesCsv([{ ...fullSpan, payload }]), 'statusCode');
    };
    expect(cellOf('UNSET')).toBe('');
    expect(cellOf('OK')).toBe('');
    expect(cellOf('ERROR')).toBe('');
    expect(cellOf(undefined)).toBe('');
    // The one value the old mapping produced for the commonest status, named so a
    // future reader can see why the column is empty rather than suspect a bug.
    expect(cellOf('OK')).not.toBe('1');
  });

  it('leaves exactly the columns it declares it does not carry', () => {
    // The list is the export's own statement about its losses, so the observation
    // is set equality against it rather than "these cells happen to be empty".
    expect(emptyColumns(buildTracesCsv([fullSpan]))).toEqual([...RCAEVAL_UNFILLED_COLUMNS.traces]);
    expect(emptyColumns(buildLogsCsv([fullLog], 'RE2'))).toEqual([...RCAEVAL_UNFILLED_COLUMNS['logs/RE2']]);
    expect(emptyColumns(buildLogsCsv([fullLog], 'RE3'))).toEqual([...RCAEVAL_UNFILLED_COLUMNS['logs/RE3']]);
  });

  it('carries the pod and node the corpus’s RE3 log table asks for', () => {
    const logs = buildLogsCsv([fullLog], 'RE3');
    expect(rowOf(logs, 'pod_name')).toBe('checkoutservice-588fbcd66b-rzd62');
    expect(rowOf(logs, 'node_name')).toBe('ip-192-168-24-141');
    // And RE2's table has no such columns, so the same signal loses them -- which is
    // the format, not a bug: a suite's log table is the suite's.
    expect(headerOf(buildLogsCsv([fullLog], 'RE2'))).not.toContain('pod_name');
  });

  /**
   * A metric series, because `data.csv` is the file every suite must carry.
   *
   * Without one the export is a case with a log table and a span table and no
   * readings, which is not a case this project can produce from a real one -- and
   * the structure check says so, correctly, on the `data-csv-time` rule.
   */
  const metric: TelemetrySignal = {
    irVersion: '2.0',
    resource: { 'service.name': 'checkoutservice' },
    // On the case's own clock: `inject_time.txt` is 2026-09-06T00:10:00Z here, and
    // the structure check refuses a table whose instants are on a different one.
    timestamp: '2026-09-06T00:09:00.000Z',
    signal: 'metric',
    payload: { kind: 'metric', name: 'cpu', value: 0.68 },
  };

  it('passes the structure check because the check reads the same table', () => {
    const exported = exportRcaEval(validBundle({ signals: { 'case-001': [metric, fullLog, fullSpan] } }), 'RE2');
    const report = checkRcaEvalStructure(exported.files, 'RE2');
    const failed = report.checks.filter((check) => !check.passed).map((check) => `${check.id}: ${check.detail}`);
    expect(failed).toEqual([]);
  });

  it('fails the structure check for the header this module used to write', () => {
    // The negative control, and it is the shipped defect: eight columns spelled
    // `timestamp,trace_id,...`. Without this, "the structure check passes" could be
    // true of a check that passes everything.
    const exported = exportRcaEval(validBundle({ signals: { 'case-001': [metric, fullLog, fullSpan] } }), 'RE2');
    const dir = Object.keys(exported.files).find((path) => path.endsWith('/traces.csv')) as string;
    const legacy = 'timestamp,trace_id,span_id,parent_span_id,service,span_name,duration_ms,status\nt1,s1,,order,GET,120,OK\n';
    const report = checkRcaEvalStructure({ ...exported.files, [dir]: legacy }, 'RE2');
    const traceCheck = report.checks.find((check) => check.id === 'traces-header');
    expect(traceCheck?.passed).toBe(false);
    expect(traceCheck?.detail).toContain('time,traceID');
  });
});

/**
 * The three ways the metric table's contract can fail, each named.
 *
 * The structure check adds `data-csv`, `data-csv-header` and `data-csv-time`; a
 * passing run exercises only the happy path of all three, so each refusal is
 * asserted here rather than inferred from the absence of a failure. Without them,
 * "the check refuses a missing table" would be true of a check that never looked.
 */
describe('RCAEval exporter · the metric table’s three refusals', () => {
  const caseDir = 'RE1-order-prod/order_cpu/1';
  const table = 'time,order_cpu_usage\n1788653400,20\n1788653430,21\n';

  it('refuses a directory with no data.csv at all', () => {
    const report = checkRcaEvalStructure({ [`${caseDir}/inject_time.txt`]: '1788653400' }, 'RE1');
    expect(report.checks.find((c) => c.id === 'data-csv')?.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'data-csv-header')?.detail).toContain('(no file)');
  });

  it('refuses a table whose first column is not time', () => {
    const report = checkRcaEvalStructure(
      { [`${caseDir}/data.csv`]: 'timestamp,order_cpu_usage\n1788653400,20\n', [`${caseDir}/inject_time.txt`]: '1788653400' },
      'RE1',
    );
    expect(report.checks.find((c) => c.id === 'data-csv-header')?.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'data-csv-header')?.detail).toContain("'timestamp'");
  });

  it('refuses a table whose instants are on a different clock from the injection time', () => {
    // Counted from zero, which is what a table exported from an IR whose timestamps
    // were relative does: `main.py` would put every sample before the injection and
    // the anomalous window would be empty rather than wrong.
    const report = checkRcaEvalStructure(
      { [`${caseDir}/data.csv`]: 'time,order_cpu_usage\n0,20\n1,21\n', [`${caseDir}/inject_time.txt`]: '1788653400' },
      'RE1',
    );
    expect(report.checks.find((c) => c.id === 'data-csv-time')?.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'data-csv-time')?.detail).toContain('same clock');
  });

  it('refuses a table with a header and no rows', () => {
    // The case the `?? ''` in the check exists for: `split('\n')[1]` is undefined
    // when the file is one line, and an absent instant is not an instant on the
    // right clock. A corpus with a header-only table is a case with no readings.
    // No newline at all, so `split('\n')[1]` is undefined rather than an empty
    // string: both spellings of "no rows" exist in the wild, and this one is the
    // branch the check's `?? ''` is for.
    const report = checkRcaEvalStructure(
      { [`${caseDir}/data.csv`]: 'time,order_cpu_usage', [`${caseDir}/inject_time.txt`]: '1788653400' },
      'RE1',
    );
    expect(report.checks.find((c) => c.id === 'data-csv-time')?.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'data-csv-time')?.detail).toContain("first instant is ''");
  });

  it('accepts a table on the injection time’s clock', () => {
    const report = checkRcaEvalStructure(
      { [`${caseDir}/data.csv`]: table, [`${caseDir}/inject_time.txt`]: '1788653400' },
      'RE1',
    );
    expect(report.checks.filter((c) => !c.passed).map((c) => c.id)).toEqual([]);
  });
});

/**
 * The label the corpus spells with an underscore, carried rather than flattened.
 *
 * `RE3-TT/ts-route-service_f3_1/1` is one case out of ninety, and it is the only
 * place the corpus distinguishes `f3` from `f3_1`. Stripping the underscore in the
 * token sanitiser wrote `f31` — a third label, silently, and the label is the answer
 * key. The reader splits at the first underscore, so keeping it round-trips.
 */
describe('RCAEval exporter · a fault label that carries the separator', () => {
  it('writes the fault token as the corpus spells it, and reads it back', () => {
    const fc = validCase({
      groundTruth: { ...validCase().groundTruth, rootCauseComponent: 'ts-route-service' },
      fault: { ...validCase().fault, type: 'f3_1' },
    });
    const path = casePath('RE3', fc, 1);
    expect(path).toBe('RE3-order-prod/ts-route-service_f3_1/1');
    expect(parseRcaEvalPath(path)).toMatchObject({ service: 'ts-route-service', fault: 'f3_1' });
  });

  it('still refuses the characters the layout cannot carry at all', () => {
    // `/`, space and a non-ASCII name would each split the path somewhere it has no
    // field for; the allow-list is widened by one character, not removed.
    const fc = validCase({ fault: { ...validCase().fault, type: 'f3/1 2' } });
    expect(casePath('RE3', fc, 1)).toBe('RE3-order-prod/order_f312/1');
  });
});
