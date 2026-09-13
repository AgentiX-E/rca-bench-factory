import type { FaultCase, IrBundle, TelemetrySignal } from '../ir/types.js';
import { isoUtcToOffsetIso, isoUtcToEpochMs } from '../util/time.js';
import { isLogSignal, isMetricSignal, isTraceSignal } from '../ir/guards.js';
import { assertExportableBundle } from './guard.js';

/**
 * OpenRCA 1.0 exporter (Microsoft, ICLR'25).
 *
 * Layout expected by the official scorer:
 *   {SYSTEM}/{DATE}/telemetry/log/...
 *   {SYSTEM}/{DATE}/telemetry/metric/...
 *   {SYSTEM}/{DATE}/telemetry/trace/...
 *   {SYSTEM}/query.csv        <- tasks (input)
 *   {SYSTEM}/record.csv       <- ground truth (answer key)
 *
 * Two facts drive the implementation:
 *  - All timestamps are recorded in UTC+8 by the official dataset.
 *  - Metrics are stored in long form: timestamp, cmdb_id, kpi_name, value.
 *  - The Telecom subsystem ships metrics and traces but no logs, so an empty
 *    log directory is legitimate and must still be created.
 */

export const OPENRCA_TARGET_ID = 'openrca-1.0';
export const OPENRCA_CONTRACT_VERSION = 'ICLR2025';
/** Offset used by the official dataset for every recorded timestamp. */
export const OPENRCA_OFFSET_MINUTES = 8 * 60;

/** Header of the official ground-truth artefact consumed by `main.evaluate -q`. */
export const OPENRCA_GROUNDTRUTH_HEADER = 'task_index,instruction,scoring_points';

/**
 * The seven task ids declared by the official `main/task_specification.json`.
 *
 * Which task a case uses is not a free choice: each task asks for a specific
 * subset of the three root-cause elements, so the index is derived from the
 * elements the case actually carries. `task_7` is the full three-element task.
 */
export const OPENRCA_TASK_INDEXES = ['task_1', 'task_2', 'task_3', 'task_4', 'task_5', 'task_6', 'task_7'] as const;
export type OpenRcaTaskIndex = (typeof OPENRCA_TASK_INDEXES)[number];

/**
 * `scoring_points` templates, transcribed from `main/task_specification.json`.
 *
 * The official evaluator recovers the ground truth from this natural-language
 * block with three regular expressions, so the wording is part of the contract
 * and must not be rephrased.
 */
export const OPENRCA_SCORING_TEMPLATES: Record<OpenRcaTaskIndex, readonly string[]> = {
  task_1: ['The {idx} root cause occurrence time is within 1 minutes (i.e., <=1min) of {datetime}'],
  task_2: ['The {idx} predicted root cause reason is {reason}'],
  task_3: ['The {idx} predicted root cause component is {component}'],
  task_4: [
    'The {idx} root cause occurrence time is within 1 minutes (i.e., <=1min) of {datetime}',
    'The {idx} predicted root cause reason is {reason}',
  ],
  task_5: [
    'The {idx} root cause occurrence time is within 1 minutes (i.e., <=1min) of {datetime}',
    'The {idx} predicted root cause component is {component}',
  ],
  task_6: [
    'The {idx} predicted root cause component is {component}',
    'The {idx} predicted root cause reason is {reason}',
  ],
  task_7: [
    'The {idx} root cause occurrence time is within 1 minutes (i.e., <=1min) of {datetime}',
    'The {idx} predicted root cause component is {component}',
    'The {idx} predicted root cause reason is {reason}',
  ],
};

export interface OpenRcaRootCauseElements {
  datetime: string;
  component: string;
  reason: string;
}

/**
 * Pick the official task index that matches the elements a case carries.
 *
 * A case with all three elements maps to `task_7`; a case missing some maps to
 * the task that asks only for what exists, so `scoring_points` never scores an
 * element the case does not know.
 */
export function openRcaTaskIndex(elements: OpenRcaRootCauseElements): OpenRcaTaskIndex {
  const time = elements.datetime.trim() !== '';
  const component = elements.component.trim() !== '';
  const reason = elements.reason.trim() !== '';
  if (time && component && reason) return 'task_7';
  if (time && component) return 'task_5';
  if (time && reason) return 'task_4';
  if (component && reason) return 'task_6';
  if (time) return 'task_1';
  if (reason) return 'task_2';
  if (component) return 'task_3';
  return 'task_1';
}

/** True when at least one of the three root-cause elements is known. */
export function hasRootCauseElements(elements: OpenRcaRootCauseElements): boolean {
  return (
    elements.datetime.trim() !== '' || elements.component.trim() !== '' || elements.reason.trim() !== ''
  );
}

/**
 * Render the official `scoring_points` block for one case.
 *
 * `idx` is `only` for a single-fault case and `{n}-th` for the n-th fault of a
 * multi-fault case, matching `main/generate.py`.
 */
export function buildScoringPoints(
  taskIndex: OpenRcaTaskIndex,
  elements: OpenRcaRootCauseElements,
  idx = 'only',
): string {
  return OPENRCA_SCORING_TEMPLATES[taskIndex]
    .map((template) =>
      template
        .replace('{idx}', idx)
        .replace('{datetime}', elements.datetime)
        .replace('{component}', elements.component)
        .replace('{reason}', elements.reason),
    )
    .map((line) => `${line}\n`)
    .join('');
}

/** Build `{system}/groundtruth.csv`, the official `-q` artefact. */
export function buildGroundTruthCsv(rows: Array<Array<string | number>>): string {
  return toCsv(['task_index', 'instruction', 'scoring_points'], rows);
}

export interface ExportedFiles {
  [relativePath: string]: string;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: Array<Array<string | number>>): string {
  return [header.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n') + '\n';
}

function dateOf(isoUtc: string): string {
  return isoUtcToOffsetIso(isoUtc, OPENRCA_OFFSET_MINUTES).slice(0, 10).replace(/-/g, '_');
}

function localTime(isoUtc: string): string {
  // OpenRCA expects `YYYY-MM-DD HH:MM:SS` in UTC+8.
  return isoUtcToOffsetIso(isoUtc, OPENRCA_OFFSET_MINUTES).slice(0, 19).replace('T', ' ');
}

function cmdbId(signal: TelemetrySignal): string {
  return (
    signal.resource['k8s.pod.name'] ??
    signal.resource['host.name'] ??
    signal.resource['service.name']
  );
}

/** Build the metric CSV for one case in the long form the scorer expects. */
export function buildMetricCsv(signals: TelemetrySignal[]): string {
  const rows = signals
    .filter(isMetricSignal)
    .map((s) => {
      const p = s.payload;
      return [localTime(s.timestamp), cmdbId(s), p.name, p.value];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return toCsv(['timestamp', 'cmdb_id', 'kpi_name', 'value'], rows);
}

export function buildLogCsv(signals: TelemetrySignal[]): string {
  const rows = signals
    .filter(isLogSignal)
    .map((s) => {
      const p = s.payload;
      return [localTime(s.timestamp), cmdbId(s), p.severityText ?? '', p.body];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return toCsv(['timestamp', 'cmdb_id', 'severity', 'message'], rows);
}

export function buildTraceCsv(signals: TelemetrySignal[]): string {
  const rows = signals
    .filter(isTraceSignal)
    .map((s) => {
      const p = s.payload;
      return [
        localTime(s.timestamp),
        p.traceId,
        p.spanId,
        p.parentSpanId ?? '',
        cmdbId(s),
        p.spanName,
        p.durationMs,
        p.status ?? '',
      ];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return toCsv(
    ['timestamp', 'trace_id', 'span_id', 'parent_span_id', 'cmdb_id', 'span_name', 'duration_ms', 'status'],
    rows,
  );
}

/**
 * The `prediction` field is a JSON-like string. The official scorer parses it
 * leniently, but the keys below are the contract.
 */
export function buildPredictionJson(fc: FaultCase): string {
  return JSON.stringify({
    '1': {
      'root cause occurrence datetime': localTime(fc.injectTime),
      'root cause component': fc.groundTruth.rootCauseComponent,
      'root cause reason': fc.groundTruth.rootCauseReason,
    },
  });
}

export interface OpenRcaExportResult {
  files: ExportedFiles;
  /** Cases skipped because the target contract could not be satisfied. */
  skipped: Array<{ caseId: string; reason: string }>;
}

/**
 * Export a bundle to the OpenRCA 1.0 layout.
 *
 * `query.csv` holds the tasks and `record.csv` holds the answer key. They are
 * emitted as separate files so the answer key can be withheld from consumers.
 *
 * `groundtruth.csv` is the third artefact the official evaluator needs:
 * `python -m main.evaluate -p record.csv -q groundtruth.csv -r report.csv`
 * reads `instruction` and `scoring_points` from the `-q` file and `prediction`
 * from the `-p` file. Without it the official scorer cannot be pointed at our
 * export at all, which is why the answer key is emitted twice: once in the
 * prediction shape a solver submits (`record.csv`) and once in the
 * natural-language shape the official evaluator parses (`groundtruth.csv`).
 */
export function exportOpenRca(bundle: IrBundle): OpenRcaExportResult {
  assertExportableBundle(bundle);
  const files: ExportedFiles = {};
  const skipped: Array<{ caseId: string; reason: string }> = [];

  const queryRows: Array<Array<string | number>> = [];
  const recordRows: Array<Array<string | number>> = [];
  const groundTruthRows: Array<{ caseId: string; taskIndex: OpenRcaTaskIndex; instruction: string; scoringPoints: string }> =
    [];

  for (const fc of bundle.cases) {
    const signals = bundle.signals[fc.caseId] ?? [];
    if (signals.length === 0) {
      skipped.push({ caseId: fc.caseId, reason: 'no telemetry signals attached' });
      continue;
    }
    // `injectTime` is required and canonical, so `localTime` always renders a
    // datetime: the official scorer always has at least one element to score,
    // which is exactly what `hasRootCauseElements` asserts for a caller that
    // builds the elements by hand.
    const elements: OpenRcaRootCauseElements = {
      datetime: localTime(fc.injectTime),
      component: fc.groundTruth.rootCauseComponent,
      reason: fc.groundTruth.rootCauseReason,
    };

    const date = dateOf(fc.injectTime);
    const base = `${fc.system}/${date}/telemetry`;

    // Directories are created even when empty: Telecom ships no logs.
    files[`${base}/log/${fc.caseId}.csv`] = buildLogCsv(signals);
    files[`${base}/metric/${fc.caseId}.csv`] = buildMetricCsv(signals);
    files[`${base}/trace/${fc.caseId}.csv`] = buildTraceCsv(signals);

    const taskIndex = openRcaTaskIndex(elements);
    queryRows.push([fc.caseId, fc.query ?? '', localTime(fc.injectTime)]);
    recordRows.push([fc.caseId, buildPredictionJson(fc)]);
    groundTruthRows.push({
      caseId: fc.caseId,
      taskIndex,
      instruction: fc.query ?? '',
      scoringPoints: buildScoringPoints(taskIndex, elements),
    });
  }

  const systems = [...new Set(bundle.cases.map((c) => c.system))];
  for (const system of systems) {
    const ids = new Set(bundle.cases.filter((c) => c.system === system).map((c) => c.caseId));
    files[`${system}/query.csv`] = toCsv(
      ['instruction_id', 'query', 'occurrence_datetime'],
      queryRows.filter((r) => ids.has(String(r[0]))),
    );
    files[`${system}/record.csv`] = toCsv(
      ['instruction_id', 'prediction'],
      recordRows.filter((r) => ids.has(String(r[0]))),
    );
    files[`${system}/groundtruth.csv`] = buildGroundTruthCsv(
      groundTruthRows
        .filter((r) => ids.has(r.caseId))
        .map((r) => [r.taskIndex, r.instruction, r.scoringPoints]),
    );
  }

  return { files, skipped };
}

/** Convenience for callers that need the injection time as a Unix timestamp. */
export function injectTimeUnixSeconds(fc: FaultCase): number {
  return Math.floor(isoUtcToEpochMs(fc.injectTime) / 1000);
}
