import type { FaultCase, IrBundle, TelemetrySignal } from '../ir/types.js';
import { isoUtcToOffsetIso, isoUtcToEpochMs } from '../util/time.js';
import { isLogSignal, isMetricSignal, isTraceSignal } from '../ir/guards.js';

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

export interface ExportedFiles {
  [relativePath: string]: string;
}

function csvEscape(value: string | number | undefined | null): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: Array<Array<string | number | undefined | null>>): string {
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
 */
export function exportOpenRca(bundle: IrBundle): OpenRcaExportResult {
  const files: ExportedFiles = {};
  const skipped: Array<{ caseId: string; reason: string }> = [];

  const queryRows: Array<Array<string | number>> = [];
  const recordRows: Array<Array<string | number>> = [];

  for (const fc of bundle.cases) {
    const signals = bundle.signals[fc.caseId] ?? [];
    if (signals.length === 0) {
      skipped.push({ caseId: fc.caseId, reason: 'no telemetry signals attached' });
      continue;
    }
    const date = dateOf(fc.injectTime);
    const base = `${fc.system}/${date}/telemetry`;

    // Directories are created even when empty: Telecom ships no logs.
    files[`${base}/log/${fc.caseId}.csv`] = buildLogCsv(signals);
    files[`${base}/metric/${fc.caseId}.csv`] = buildMetricCsv(signals);
    files[`${base}/trace/${fc.caseId}.csv`] = buildTraceCsv(signals);

    queryRows.push([fc.caseId, fc.query ?? '', localTime(fc.injectTime)]);
    recordRows.push([fc.caseId, buildPredictionJson(fc)]);
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
  }

  return { files, skipped };
}

/** Convenience for callers that need the injection time as a Unix timestamp. */
export function injectTimeUnixSeconds(fc: FaultCase): number {
  return Math.floor(isoUtcToEpochMs(fc.injectTime) / 1000);
}
