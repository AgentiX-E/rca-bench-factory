import type {
  FaultCase,
  IrBundle,
  LogPayload,
  SpanStatus,
  TelemetrySignal,
  TracePayload,
} from '../ir/types.js';
import type { ExportOutcome, ExportedFiles, SkippedCase } from './openrca.js';
import { isLogSignal, isMetricSignal, isTraceSignal } from '../ir/guards.js';
import { assertExportableBundle } from './guard.js';
import { renderCsv } from '../util/csv.js';

/**
 * RCAEval exporter (RMIT, ASE'24 / WWW'25).
 *
 * Layout expected by the official harness:
 *   {suite}-{system}/{service}_{fault}/{instance}/
 *     data.csv          metrics, `time` plus one column per series
 *     inject_time.txt   fault injection timestamp, Unix seconds
 *     logs.csv          RE2 and RE3 only
 *     traces.csv        RE2 and RE3 only
 *
 * RE1 is metrics-only, so log and trace files are simply not emitted for it.
 *
 * The three-level path is not a preference: `main.py` recovers the answer key from
 * it (`service, metric = basename(dirname(dirname(data_path))).split("_")`) and
 * finds a case by globbing for `data.csv`. See `casePath`.
 *
 * ## The two files at the bottom shared a name with the corpus and nothing else
 *
 * `logs.csv` and `traces.csv` are the only two files this module writes whose
 * *names* the corpora also ship, and until they were measured that was the whole
 * of the agreement: this module wrote eight trace columns and four log columns
 * under the same two names, with different spellings, and `checkRcaEvalStructure`
 * compared the output against those same eight and four. The check was therefore
 * comparing the export to itself.
 *
 * Measured from the archives (finding 266):
 *
 *  - `traces.csv` is **eleven** columns, identical in RE2-OB and RE3-OB:
 *    `time,traceID,spanID,serviceName,methodName,operationName,startTimeMillis,startTime,duration,statusCode,parentSpanID`;
 *  - `logs.csv` is **nine** columns in RE2-OB and **six** in RE3-OB, sharing only
 *    their first four (`time,timestamp,container_name,message`).
 *
 * So the trace schema is one list for both suites and the log schema is one per
 * suite, and both are declared below from that measurement rather than from a
 * preference. Columns the IR does not carry are emitted empty and named in
 * `RCAEVAL_UNFILLED_COLUMNS` -- a loss this file states instead of a value it
 * could only invent.
 *
 * ## The *units* were not measured, and one of them was wrong by a factor of 1000
 *
 * The paragraph above was about columns, and it drew the right conclusion from the
 * right measurement. The next question -- what unit each instant column is in --
 * was answered from one file and applied to two:
 *
 * > An instant as Unix **microseconds**, which is the unit both corpora's
 * > `timestamp` and `startTime` columns use.
 *
 * That sentence named two columns and was true of one. Measured, per file, from
 * both archives (finding 306):
 *
 * | column | RE2-OB `checkoutservice_cpu/1` | RE3-OB `emailservice_f1/1` | unit |
 * | --- | --- | --- | --- |
 * | `traces.startTime` | `1705353846065999` (16 digits) | `1731910960029548` | microseconds |
 * | `traces.startTimeMillis` | `1705353846065` (13) | `1731910960029` | milliseconds |
 * | `logs.timestamp` | `1705353846067349596` (19) | `1731910960181130857` (19) | **nanoseconds** |
 *
 * So this module wrote every `logs.csv` instant 1000x too small, on every case, in
 * both suites that ship a log file. Nothing noticed: the shape contract compared
 * column *names*, and the unit test that did check the value asserted the same
 * number the code produced, because both were written from the same sentence.
 * `RCAEVAL_INSTANT_COLUMNS` below is that sentence rewritten as a table with one
 * row per file, and `instantCell` is the only thing that reads it, so the claim
 * and the value cannot drift apart again.
 */

export const RCAEVAL_TARGET_ID = 'rcaeval';
export const RCAEVAL_CONTRACT_VERSION = 'www25';

/**
 * The suite vocabulary, declared once.
 *
 * The type is derived from this tuple rather than written beside it, so the
 * values and the type cannot disagree: adding a suite here widens
 * `RcaEvalSuite`, and every exhaustive switch over it fails to compile until
 * the new member is handled. Consumers that need the list at runtime -- the
 * CLI's `--suite` comparison set and its help placeholder -- read this instead
 * of restating it.
 */
export const RCAEVAL_SUITES = ['RE1', 'RE2', 'RE3'] as const;

export type RcaEvalSuite = (typeof RCAEVAL_SUITES)[number];


/**
 * The case's directory, in the layout upstream actually reads.
 *
 * `{suite}-{system}/{service}_{fault}/{instance}` — three levels, not one.
 * Measured from `main.py`, which is the only implementation that matters here:
 *
 *     service, metric = basename(dirname(dirname(data_path))).split("_")
 *     case = basename(dirname(data_path))
 *
 * (it reaches a case by globbing recursively under the dataset directory for a file
 * named `data.csv`, which is why a directory holding only `metrics.json` is a
 * directory it never sees at all).
 *
 * The answer key is recovered from the **path**, so the layout is not cosmetic. A
 * flat `RE2-order-cpu_1/` directory gives `basename(dirname(dirname(...)))` the
 * dataset root, whose `split("_")` has one element and raises (finding 267).
 *
 * `{system}` is free-form to upstream -- it only walks through it -- so it carries
 * the case's own system, and the reader here reads it back.
 */
export function casePath(suite: RcaEvalSuite, fc: FaultCase, instance: number): string {
  const system = sanitiseCaseToken(fc.system);
  const service = sanitiseCaseToken(fc.groundTruth.rootCauseComponent);
  // The fault token keeps its underscores, and the service does not. That is the
  // corpus's own convention: `RE3-TT/ts-route-service_f3_1/1` names the fault
  // `f3_1`, and no service token anywhere in the corpora carries an underscore.
  // Stripping it wrote `f31`, which is a different label silently -- and the label
  // is the answer key (finding 268).
  const fault = sanitiseFaultToken(fc.fault.type);
  return `${suite}-${system}/${service}_${fault}/${instance}`;
}

/**
 * Drop the characters a flat `-`-separated directory name cannot carry, and
 * keep the ones it can.
 *
 * A name that sanitises to nothing would collapse the layout — `RE2--cpu_1`
 * has an empty service field that no reader can distinguish from a missing
 * one — so a fully-consumed token falls back to a fixed placeholder rather
 * than emitting a nameless segment.
 */
function sanitiseCaseToken(raw: string): string {
  const kept = raw.replace(/[^A-Za-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  return kept === '' ? 'unnamed' : kept;
}

/**
 * The fault half of `{service}_{fault}`, which may carry underscores of its own.
 *
 * `parseRcaEvalPath` splits at the **first** underscore, so everything after it is
 * the fault and any underscore in it is part of the label. Keeping the character
 * here is what makes that reading round-trip: `ts-route-service_f3_1` goes out and
 * comes back as the service `ts-route-service` and the fault `f3_1`, where stripping
 * would have written `f31` and lost the distinction the corpus draws between `f3`
 * and `f3_1`.
 */
function sanitiseFaultToken(raw: string): string {
  const kept = raw.replace(/[^A-Za-z0-9_-]/g, '').replace(/^[-_]+|[-_]+$/g, '');
  return kept === '' ? 'unnamed' : kept;
}

/**
 * The metric table, in the shape upstream's loader reads.
 *
 * `time` in Unix seconds, then one column per series named `<service>_<metric>`.
 * Both halves are load-bearing to `main.py`:
 *
 *     service, metric = basename(dirname(dirname(data_path))).split("_")
 *     normal_df = data[data["time"] < inject_time].tail(...)
 *     "service": len({c.split("_")[0].replace("-db", "") for c in _pre_cols if c != "time"})
 *
 * The first takes the *answer key* from the path, the second compares the `time`
 * column against `inject_time.txt`, and the third reads the candidate services out
 * of the column names. A `{metricName: [values]}` mapping — what this module wrote
 * as `metrics.json` — carries the same numbers and none of that: no `time` column
 * to compare, no service in a name, and a file name the loader never globs for.
 *
 * ## Rows and gaps
 *
 * Rows are aligned on the union of the series' instants, and a series that has no
 * sample at an instant leaves the cell **empty**. `main.py` reads the table with
 * pandas and calls `ffill()` then `fillna(0)`, so a gap is something it already
 * handles; a zero written here would be a reading this module invented, and a
 * sensor that was not sampled is not a sensor reading zero.
 */
export function buildDataCsv(signals: TelemetrySignal[]): string {
  const series = new Map<string, Map<number, number>>();
  const instants = new Set<number>();
  for (const s of signals) {
    if (!isMetricSignal(s)) continue;
    const at = Math.floor(Date.parse(s.timestamp) / 1000);
    const column = `${s.resource['service.name']}_${s.payload.name}`;
    const points = series.get(column) ?? new Map<number, number>();
    points.set(at, s.payload.value);
    series.set(column, points);
    instants.add(at);
  }
  const times = [...instants].sort((a, b) => a - b);
  const columns = [...series.keys()].sort();
  const rows = times.map((at) => [
    String(at),
    ...columns.map((column) => {
      const value = series.get(column)?.get(at);
      return value === undefined ? '' : String(value);
    }),
  ]);
  return renderCsv(['time', ...columns], rows);
}

/**
 * The `traces.csv` columns, in the corpora's own order.
 *
 * One list for both suites because the two archives agree: `RE2-OB/checkoutservice_cpu/1/traces.csv`
 * and `RE3-OB/emailservice_f1/1/traces.csv` carry these eleven headers, byte for byte. That is a
 * measurement of both, not an assumption from one -- which is the mistake the `logs.csv` list below
 * exists to prevent, because the same two archives do *not* agree about that file.
 */
export const RCAEVAL_TRACES_COLUMNS = [
  'time',
  'traceID',
  'spanID',
  'serviceName',
  'methodName',
  'operationName',
  'startTimeMillis',
  'startTime',
  'duration',
  'statusCode',
  'parentSpanID',
] as const;

/**
 * The `logs.csv` columns, per suite, because the corpora disagree about this file.
 *
 * Nine columns in RE2-OB (`…,level,req_path,error,cluster_id,log_template`) and six in RE3-OB
 * (`…,pod_name,node_name`), sharing their first four. A single list here would have been wrong for
 * one of the two, and the way it would have been wrong is the reason this round exists: a header that
 * is plausible for both and correct for neither.
 */
export const RCAEVAL_LOGS_COLUMNS = {
  RE2: [
    'time',
    'timestamp',
    'container_name',
    'message',
    'level',
    'req_path',
    'error',
    'cluster_id',
    'log_template',
  ],
  RE3: ['time', 'timestamp', 'container_name', 'message', 'pod_name', 'node_name'],
} as const;

/** A suite that ships a log table. `RE1` is metrics-only. */
export type RcaEvalLogsSuite = keyof typeof RCAEVAL_LOGS_COLUMNS;

/**
 * The columns this module writes as empty, and why, per file.
 *
 * ## Why a named list rather than a comment
 *
 * An empty cell is indistinguishable from a cell whose value was missing, so the
 * only way a reader can tell "we do not carry this" from "this span had none" is
 * for the export to say which columns it never carries. This is that statement,
 * and `export.test.ts` holds it to the output: every column listed here is empty
 * even when every field the IR has is populated, and every column *not* listed is
 * non-empty for the same signal.
 *
 * ## The four reasons, and none of them is "we forgot"
 *
 *  - `traces.methodName` -- the corpus's own two files disagree about what it
 *    means: RE2-OB fills it with the last segment of `operationName` (`Convert`),
 *    while RE3-OB leaves it empty for spans whose `operationName` also has a
 *    segment (`opentelemetry.proto.collector.trace.v1.TraceService/Export`). One
 *    corpus deriving it and the other declining is not a rule we can adopt from
 *    either, and inventing one would put a value in a column that a reader would
 *    take as the corpus's.
 *  - `logs.RE2.req_path` / `error` -- the corpus leaves both empty in every row
 *    sampled; they are HTTP-shape fields that a gRPC stack does not fill.
 *  - `logs.RE2.cluster_id` -- a corpus-side cluster handle (`1` in every sampled
 *    row), assigned when the corpus was assembled rather than by the workload.
 *  - `logs.RE2.log_template` -- the corpus writes the *rendered* template text
 *    here, and the IR carries `LogPayload.templateId`, an identifier (`L007`).
 *    Writing an id into a column of text would be a type change wearing the same
 *    column name.
 */
export const RCAEVAL_UNFILLED_COLUMNS = {
  traces: ['methodName'],
  'logs/RE2': ['req_path', 'error', 'cluster_id', 'log_template'],
  'logs/RE3': [],
} as const;

/**
 * The span status vocabulary as the corpus's `statusCode` column spells it.
 *
 * OpenTelemetry's own codes -- `0` unset, `1` ok, `2` error -- because that is what
 * the column is. The corpora serialise them through a float column, so their files
 * say `0.0`; writing `0.0` here would reproduce a serialisation artefact rather
 * than the value, and any consumer parses the column numerically either way.
 */
const SPAN_STATUS_CODE: Record<SpanStatus, string> = { UNSET: '0', OK: '1', ERROR: '2' };

/** `HH:MM` in UTC, which is the resolution both corpora's `time` columns carry. */
function utcMinute(iso: string): string {
  const at = new Date(Date.parse(iso));
  const hour = String(at.getUTCHours()).padStart(2, '0');
  const minute = String(at.getUTCMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

/**
 * Every instant column this module writes, the unit it is in, and how many of that
 * unit are in a second.
 *
 * One row per *column*, not per file, because that is the granularity the two
 * archives disagree at: `traces.csv` holds milliseconds and microseconds in the
 * same row, and `logs.csv` holds nanoseconds in the column whose name both
 * archives share with `traces.csv`'s microsecond one. A table keyed by file would
 * have been as wrong as the sentence that started this.
 *
 * The IR's instant has millisecond precision, so the two finer columns are always
 * divisible by their scale while the corpus's own values are not
 * (`1705353846067349596` ends in `596`). That gap is the IR's, not the export's,
 * and it is stated here rather than papered over with digits that would read as
 * measured.
 */
export const RCAEVAL_INSTANT_COLUMNS = {
  'traces.startTimeMillis': { unit: 'ms', perSecond: 1 },
  'traces.startTime': { unit: 'us', perSecond: 1_000 },
  'logs.timestamp': { unit: 'ns', perSecond: 1_000_000 },
} as const;

export type RcaEvalInstantColumn = keyof typeof RCAEVAL_INSTANT_COLUMNS;

/**
 * An instant, in the unit its column is in.
 *
 * `BigInt` rather than `* 1e6` because nanoseconds since the epoch do not fit in a
 * double: `1705353846067e6` needs 61 bits and a `number` carries 53, so the
 * printed digits would be the shortest representation of a *neighbouring* value
 * rather than the instant. It happens to round-trip for the values the IR can
 * produce, and "happens to" is not a unit.
 */
function instantCell(column: RcaEvalInstantColumn, iso: string): string {
  const scale = RCAEVAL_INSTANT_COLUMNS[column].perSecond;
  return String(BigInt(Date.parse(iso)) * BigInt(scale));
}

/** Every column name either log table uses, so the cell map has no fallback. */
type RcaEvalLogsColumn =
  | (typeof RCAEVAL_LOGS_COLUMNS)['RE2'][number]
  | (typeof RCAEVAL_LOGS_COLUMNS)['RE3'][number];

export function buildLogsCsv(signals: TelemetrySignal[], suite: RcaEvalLogsSuite): string {
  const columns: readonly RcaEvalLogsColumn[] = RCAEVAL_LOGS_COLUMNS[suite];
  const rows = signals.filter(isLogSignal).map((s) => {
    const p: LogPayload = s.payload;
    // Keyed by the union of both suites' column names, so every member is required
    // and `cells[column]` is a `string` rather than a `string | undefined`. The
    // `?? ''` this replaces was unreachable -- and an unreachable branch is a claim
    // of a case that cannot happen, which is the shape this project removes rather
    // than accepts.
    const cells: Record<RcaEvalLogsColumn, string> = {
      time: utcMinute(s.timestamp),
      timestamp: instantCell('logs.timestamp', s.timestamp),
      container_name: s.resource['service.name'],
      message: p.body,
      level: p.severityText ?? '',
      // Listed in `RCAEVAL_UNFILLED_COLUMNS`, and named at the use site so a reader
      // of this function does not have to find the list to know they are deliberate.
      req_path: '',
      error: '',
      cluster_id: '',
      log_template: '',
      pod_name: s.resource['k8s.pod.name'] ?? '',
      node_name: s.resource['k8s.node.name'] ?? '',
    };
    return columns.map((column) => cells[column]);
  });
  return renderCsv([...columns], rows);
}

export function buildTracesCsv(signals: TelemetrySignal[]): string {
  const rows = signals.filter(isTraceSignal).map((s) => {
    const p: TracePayload = s.payload;
    const cells: Record<(typeof RCAEVAL_TRACES_COLUMNS)[number], string> = {
      time: utcMinute(s.timestamp),
      traceID: p.traceId,
      spanID: p.spanId,
      serviceName: s.resource['service.name'],
      methodName: '',
      operationName: p.spanName,
      startTimeMillis: instantCell('traces.startTimeMillis', s.timestamp),
      startTime: instantCell('traces.startTime', s.timestamp),
      // The corpus's `duration` is microseconds; the IR's is milliseconds.
      duration: String(Math.round(p.durationMs * 1000)),
      statusCode: p.status === undefined ? '' : SPAN_STATUS_CODE[p.status],
      parentSpanID: p.parentSpanId ?? '',
    };
    return RCAEVAL_TRACES_COLUMNS.map((column) => cells[column]);
  });
  return renderCsv([...RCAEVAL_TRACES_COLUMNS], rows);
}


/**
 * Export a bundle in the RCAEval layout.
 *
 * `suite` selects the modality set: RE1 emits metrics only, RE2/RE3 additionally
 * emit logs and traces.
 */
export function exportRcaEval(bundle: IrBundle, suite: RcaEvalSuite = 'RE2'): ExportOutcome {
  assertExportableBundle(bundle);
  const files: ExportedFiles = {};
  const skipped: SkippedCase[] = [];

  bundle.cases.forEach((fc, index) => {
    const signals = bundle.signals[fc.caseId] ?? [];
    if (signals.length === 0) {
      skipped.push({ caseId: fc.caseId, reason: 'no telemetry signals attached' });
      return;
    }
    // RE3 targets code-level faults: a non-code case is skipped *before* any
    // file is written, so a skipped case never leaves artefacts behind.
    if (suite === 'RE3' && fc.fault.category !== 'code') {
      skipped.push({ caseId: fc.caseId, reason: 'RE3 targets code-level faults only' });
      return;
    }

    const dir = casePath(suite, fc, index + 1);
    files[`${dir}/data.csv`] = buildDataCsv(signals);
    files[`${dir}/inject_time.txt`] = `${Math.floor(Date.parse(fc.injectTime) / 1000)}`;

    if (suite === 'RE2' || suite === 'RE3') {
      files[`${dir}/logs.csv`] = buildLogsCsv(signals, suite);
      files[`${dir}/traces.csv`] = buildTracesCsv(signals);
    }
  });

  return { files, skipped };
}
