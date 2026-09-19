import type { FaultCase, IrBundle, TelemetrySignal } from '../ir/types.js';
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

export function buildLogsCsv(signals: TelemetrySignal[]): string {
  const rows = signals
    .filter(isLogSignal)
    .map((s) => {
      const p = s.payload;
      return [s.timestamp, s.resource['service.name'], p.severityText ?? '', p.body];
    });
  return renderCsv(['timestamp', 'service', 'severity', 'message'], rows);
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
  return renderCsv(
    ['timestamp', 'trace_id', 'span_id', 'parent_span_id', 'service', 'span_name', 'duration_ms', 'status'],
    rows,
  );
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
      files[`${dir}/logs.csv`] = buildLogsCsv(signals);
      files[`${dir}/traces.csv`] = buildTracesCsv(signals);
    }
  });

  return { files, skipped };
}
