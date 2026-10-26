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
  buildLogsCsv,
  buildMetricsJson,
  buildTracesCsv,
  caseDirName,
  exportRcaEval,
} from '../src/export/rcaeval.js';
import { checkRcaEvalStructure } from '../src/score/score.js';
import { parseRcaEvalDirectory } from '../src/score/official.js';
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

  // The reader and the writer disagree about what a service name may contain.
  // `parseRcaEvalDirectory` is documented to keep hyphens ("Train Ticket ships
  // `ts-order-service`"), but `caseDirName` stripped every non-alphanumeric
  // character, so `ts-order-service` was written out as `tsorderservice`. The
  // in-repo regression could not see it: `oraclePrediction` copies the
  // component straight out of the directory name we just wrote, so the two
  // sides were wrong together. Against the real harness the exported layout
  // names a service that does not exist.
  it('keeps hyphens in the service name, as the reader promises to', () => {
    const fc = validCase({
      groundTruth: { ...validCase().groundTruth, rootCauseComponent: 'ts-order-service' },
    });
    expect(caseDirName('RE2', fc, 1)).toBe('RE2-ts-order-service-cpu_1');
  });

  // The fix must widen the allow-list, not remove it: a character the layout
  // genuinely cannot carry still has to go, or the directory name stops being
  // the flat token the upstream harness expects.
  it('still strips a character the layout cannot carry', () => {
    const fc = validCase({
      groundTruth: { ...validCase().groundTruth, rootCauseComponent: 'order:svc' },
      fault: { ...validCase().fault, type: 'cpu/sat' },
    });
    expect(caseDirName('RE2', fc, 1)).toBe('RE2-ordersvc-cpusat_1');
  });

  // Both halves of the round trip now agree, which is the only version of this
  // assertion that means anything: the name the exporter writes is read back as
  // the component the IR declared.
  it('round-trips a hyphenated service name through the official reader', () => {
    const fc = validCase({
      groundTruth: { ...validCase().groundTruth, rootCauseComponent: 'ts-order-service' },
    });
    const parsed = parseRcaEvalDirectory(caseDirName('RE2', fc, 1));
    expect(parsed?.service).toBe('ts-order-service');
  });

  // A token that sanitises away entirely would collapse the layout to
  // `RE2--cpu_1`: an empty field no reader can tell from a missing one. The
  // placeholder keeps every directory name parseable.
  it('never emits an empty segment when a name sanitises away entirely', () => {
    const fc = validCase({
      groundTruth: { ...validCase().groundTruth, rootCauseComponent: '服务/一' },
    });
    expect(caseDirName('RE2', fc, 1)).toBe('RE2-unnamed-cpu_1');
    expect(parseRcaEvalDirectory('RE2-unnamed-cpu_1')?.service).toBe('unnamed');
  });

  // Leading and trailing separators are the layout's, not the name's. Keeping
  // them shifts the fields: `RE2--order-cpu_1` parses as a service of `-order`.
  it('trims separator characters the name does not own', () => {
    const fc = validCase({
      groundTruth: { ...validCase().groundTruth, rootCauseComponent: '--order--' },
    });
    expect(caseDirName('RE2', fc, 1)).toBe('RE2-order-cpu_1');
    expect(parseRcaEvalDirectory('RE2-order-cpu_1')?.service).toBe('order');
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
    // Microseconds, twice: the corpus's `timestamp`/`start` are µs and its
    // `duration` is µs, while the IR carries milliseconds for both.
    expect(rowOf(trace, 'startTimeMillis')).toBe(String(Date.parse(fullSpan.timestamp)));
    expect(rowOf(trace, 'startTime')).toBe(String(Date.parse(fullSpan.timestamp) * 1000));
    expect(rowOf(trace, 'duration')).toBe('4133');
    // The corpus's `time` column is `HH:MM` of the instant, in UTC.
    expect(rowOf(trace, 'time')).toBe('21:24');
    expect(rowOf(buildLogsCsv([fullLog], 'RE3'), 'timestamp')).toBe(String(Date.parse(fullLog.timestamp) * 1000));
  });

  it('spells the span status as the OTel code the column holds', () => {
    const span = fullSpan.payload as Extract<TelemetrySignal['payload'], { kind: 'trace' }>;
    const codeOf = (status: 'OK' | 'ERROR' | 'UNSET' | undefined): string => {
      // Built field by field rather than spread-then-override: `{...span, status: undefined}`
      // keeps the key with an undefined value, and `p.status === undefined` cannot
      // tell that from an absent key -- which would make the last assertion below
      // test the spread rather than the writer.
      const payload: TelemetrySignal['payload'] =
        status === undefined
          ? { kind: 'trace', traceId: span.traceId, spanId: span.spanId, parentSpanId: span.parentSpanId, spanName: span.spanName, durationMs: span.durationMs }
          : { ...span, status };
      return rowOf(buildTracesCsv([{ ...fullSpan, payload }]), 'statusCode');
    };
    expect(codeOf('UNSET')).toBe('0');
    expect(codeOf('OK')).toBe('1');
    expect(codeOf('ERROR')).toBe('2');
    // Absent stays absent: `0` is a status, not the absence of one.
    expect(codeOf(undefined)).toBe('');
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

  it('passes the structure check because the check reads the same table', () => {
    const exported = exportRcaEval(validBundle({ signals: { 'case-001': [fullLog, fullSpan] } }), 'RE2');
    const report = checkRcaEvalStructure(exported.files, 'RE2');
    const failed = report.checks.filter((check) => !check.passed).map((check) => `${check.id}: ${check.detail}`);
    expect(failed).toEqual([]);
  });

  it('fails the structure check for the header this module used to write', () => {
    // The negative control, and it is the shipped defect: eight columns spelled
    // `timestamp,trace_id,...`. Without this, "the structure check passes" could be
    // true of a check that passes everything.
    const exported = exportRcaEval(validBundle({ signals: { 'case-001': [fullLog, fullSpan] } }), 'RE2');
    const dir = Object.keys(exported.files).find((path) => path.endsWith('/traces.csv')) as string;
    const legacy = 'timestamp,trace_id,span_id,parent_span_id,service,span_name,duration_ms,status\nt1,s1,,order,GET,120,OK\n';
    const report = checkRcaEvalStructure({ ...exported.files, [dir]: legacy }, 'RE2');
    const traceCheck = report.checks.find((check) => check.id === 'traces-header');
    expect(traceCheck?.passed).toBe(false);
    expect(traceCheck?.detail).toContain('time,traceID');
  });
});
