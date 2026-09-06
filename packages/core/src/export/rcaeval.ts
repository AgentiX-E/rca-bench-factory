import type { FaultCase, IrBundle, TelemetrySignal } from '../ir/types.js';
import type { ExportedFiles } from './openrca.js';
import { isLogSignal, isMetricSignal, isTraceSignal } from '../ir/guards.js';

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
 */

export const RCAEVAL_TARGET_ID = 'rcaeval';
export const RCAEVAL_CONTRACT_VERSION = 'www25';

export type RcaEvalSuite = 'RE1' | 'RE2' | 'RE3';

function csvEscape(value: string | number | undefined | null): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: Array<Array<string | number | undefined | null>>): string {
  return [header.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n') + '\n';
}

/** Directory name convention: `{benchmark}{service}{fault}_{instance}`. */
export function caseDirName(suite: RcaEvalSuite, fc: FaultCase, instance: number): string {
  const service = fc.groundTruth.rootCauseComponent.replace(/[^A-Za-z0-9]/g, '');
  const fault = fc.fault.type.replace(/[^A-Za-z0-9]/g, '');
  return `${suite}-${service}-${fault}_${instance}`;
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

export function buildLogsCsv(signals: TelemetrySignal[]): string {
  const rows = signals
    .filter(isLogSignal)
    .map((s) => {
      const p = s.payload;
      return [s.timestamp, s.resource['service.name'], p.severityText ?? '', p.body];
    });
  return toCsv(['timestamp', 'service', 'severity', 'message'], rows);
}

export function buildTracesCsv(signals: TelemetrySignal[]): string {
  const rows = signals
    .filter(isTraceSignal)
    .map((s) => {
      const p = s.payload;
      return [
        s.timestamp,
        p.traceId,
        p.spanId,
        p.parentSpanId ?? '',
        s.resource['service.name'],
        p.spanName,
        p.durationMs,
        p.status ?? '',
      ];
    });
  return toCsv(
    ['timestamp', 'trace_id', 'span_id', 'parent_span_id', 'service', 'span_name', 'duration_ms', 'status'],
    rows,
  );
}

export interface RcaEvalExportResult {
  files: ExportedFiles;
  skipped: Array<{ caseId: string; reason: string }>;
}

/**
 * Export a bundle in the RCAEval layout.
 *
 * `suite` selects the modality set: RE1 emits metrics only, RE2/RE3 additionally
 * emit logs and traces.
 */
export function exportRcaEval(bundle: IrBundle, suite: RcaEvalSuite = 'RE2'): RcaEvalExportResult {
  const files: ExportedFiles = {};
  const skipped: Array<{ caseId: string; reason: string }> = [];

  bundle.cases.forEach((fc, index) => {
    const signals = bundle.signals[fc.caseId] ?? [];
    if (signals.length === 0) {
      skipped.push({ caseId: fc.caseId, reason: 'no telemetry signals attached' });
      return;
    }
    const dir = caseDirName(suite, fc, index + 1);
    files[`${dir}/metrics.json`] = buildMetricsJson(signals);
    files[`${dir}/inject_time.txt`] = `${Math.floor(Date.parse(fc.injectTime) / 1000)}`;

    if (suite === 'RE2' || suite === 'RE3') {
      files[`${dir}/logs.csv`] = buildLogsCsv(signals);
      files[`${dir}/traces.csv`] = buildTracesCsv(signals);
    }
    if (suite === 'RE3' && fc.fault.category !== 'code') {
      skipped.push({ caseId: fc.caseId, reason: 'RE3 targets code-level faults only' });
    }
  });

  return { files, skipped };
}
