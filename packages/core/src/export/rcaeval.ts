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
 *   {benchmark}{service}{fault}_{instance}/
 *     metrics.json      time-series metrics
 *     inject_time.txt   fault injection timestamp, Unix seconds
 *     logs.csv          RE2 and RE3 only
 *     traces.csv        RE2 and RE3 only
 *
 * RE1 is metrics-only, so log and trace files are simply not emitted for it.
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
 * Directory name convention: `{benchmark}{service}{fault}_{instance}`.
 *
 * The separator is `-`, so a hyphen *inside* a name is indistinguishable from
 * one the layout added — and the upstream harness relies on exactly that: its
 * own case directories are `RE2-ts-order-service-cpu_1`, and
 * `parseRcaEvalDirectory` is documented to recover `ts-order-service` from them.
 *
 * Stripping every non-alphanumeric character therefore wrote `tsorderservice`
 * and named a service that does not exist. The in-repo regression could not
 * detect it, because `oraclePrediction` reads the component back out of the
 * directory name we just produced, so both sides were wrong together; the
 * disagreement only surfaces against real upstream telemetry.
 *
 * The allow-list is widened to keep `-`, not removed: a character the flat
 * layout genuinely cannot carry (`:`, `/`, whitespace, a non-ASCII name) is
 * still dropped, and those are handled separately below.
 */
export function caseDirName(suite: RcaEvalSuite, fc: FaultCase, instance: number): string {
  const service = sanitiseCaseToken(fc.groundTruth.rootCauseComponent);
  const fault = sanitiseCaseToken(fc.fault.type);
  return `${suite}-${service}-${fault}_${instance}`;
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
 * Metrics are emitted as a mapping `metricName -> number[]` ordered by time,
 * which is the shape the RCAEval baselines read.
 */
export function buildMetricsJson(signals: TelemetrySignal[]): string {
  const byName = new Map<string, Array<{ t: number; v: number }>>();
  for (const s of signals) {
    if (!isMetricSignal(s)) continue;
    const arr = byName.get(s.payload.name) ?? [];
    arr.push({ t: Date.parse(s.timestamp), v: s.payload.value });
    byName.set(s.payload.name, arr);
  }
  const out: Record<string, number[]> = {};
  for (const [name, points] of byName) {
    points.sort((a, b) => a.t - b.t);
    out[name] = points.map((p) => p.v);
  }
  return JSON.stringify(out);
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
 * An instant as Unix **microseconds**, which is the unit both corpora's
 * `timestamp` and `startTime` columns use.
 *
 * The IR's instant has millisecond precision, so these are always multiples of
 * 1000 while the corpus's own values are not (`1705353846067349596`). The
 * difference is the IR's, not the export's, and it is stated here rather than
 * papered over with three digits of zero that would read as measured.
 */
function epochMicros(iso: string): string {
  return String(Date.parse(iso) * 1000);
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
      timestamp: epochMicros(s.timestamp),
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
    const millis = Date.parse(s.timestamp);
    const cells: Record<(typeof RCAEVAL_TRACES_COLUMNS)[number], string> = {
      time: utcMinute(s.timestamp),
      traceID: p.traceId,
      spanID: p.spanId,
      serviceName: s.resource['service.name'],
      methodName: '',
      operationName: p.spanName,
      startTimeMillis: String(millis),
      startTime: String(millis * 1000),
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

    const dir = caseDirName(suite, fc, index + 1);
    files[`${dir}/metrics.json`] = buildMetricsJson(signals);
    files[`${dir}/inject_time.txt`] = `${Math.floor(Date.parse(fc.injectTime) / 1000)}`;

    if (suite === 'RE2' || suite === 'RE3') {
      files[`${dir}/logs.csv`] = buildLogsCsv(signals, suite);
      files[`${dir}/traces.csv`] = buildTracesCsv(signals);
    }
  });

  return { files, skipped };
}
