import { IR_VERSION } from '../ir/types.js';
import type { LogPayload, MetricPayload, TelemetrySignal, TracePayload } from '../ir/types.js';
import { telemetrySignalSchema } from '../ir/schema.js';
import { epochMsToIsoUtc, parseTimestamp, TimeParseError } from '../util/time.js';

/**
 * OTLP JSON ingest: turn OpenTelemetry exporter JSON (metrics / logs / traces)
 * into IR signals.
 *
 * The JSON encoding described by the OTLP spec is accepted directly; no protobuf
 * decoding is required here. The same two invariants as the flat-file ingest
 * hold: zero silent loss, and data problems become quarantine entries instead of
 * thrown exceptions.
 *
 * Timestamps are `timeUnixNano` strings; they are parsed with `util/time.ts`
 * (`unix_ns` layout) so an offset is never guessed.
 */

export interface OtlpIngestOptions {
  /** Fallback `service.name` when the resource carries no such attribute. */
  serviceName?: string;
}

export interface OtlpQuarantineRecord {
  /** 1-based index of the data point / log record / span within its stream. */
  index: number;
  reason: string;
  record: string;
}

export interface OtlpIngestResult {
  signals: TelemetrySignal[];
  quarantine: OtlpQuarantineRecord[];
}

const SUPPORTED_METRIC_KINDS = ['sum', 'gauge'] as const;
const UNSUPPORTED_METRIC_KINDS = ['histogram', 'exponentialHistogram', 'summary'] as const;

const SEVERITY_ALIASES: Record<string, LogPayload['severityText']> = {
  TRACE: 'TRACE',
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  WARNING: 'WARN',
  ERROR: 'ERROR',
  ERR: 'ERROR',
  FATAL: 'FATAL',
  CRITICAL: 'FATAL',
};

const SPAN_STATUS_CODE: Record<number, TracePayload['status']> = {
  0: 'UNSET',
  1: 'OK',
  2: 'ERROR',
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function anyValueToString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  const v = asRecord(value);
  if (v === undefined) return undefined;
  if (typeof v['stringValue'] === 'string') return v['stringValue'];
  if (typeof v['intValue'] === 'string') return v['intValue'];
  if (typeof v['doubleValue'] === 'number') return String(v['doubleValue']);
  if (typeof v['boolValue'] === 'boolean') return String(v['boolValue']);
  return undefined;
}

function parseAttributes(attrs: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(attrs)) return out;
  for (const attr of attrs) {
    const a = asRecord(attr);
    const key = a?.['key'];
    if (typeof key !== 'string' || key === '') continue;
    const value = anyValueToString(a?.['value']);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function extractServiceName(resource: unknown, fallback?: string): string | undefined {
  const rec = asRecord(resource);
  if (rec !== undefined) {
    const attrs = rec['attributes'];
    if (Array.isArray(attrs)) {
      for (const attr of attrs) {
        const a = asRecord(attr);
        if (a?.['key'] === 'service.name') {
          const value = anyValueToString(a['value']);
          if (value !== undefined && value !== '') return value;
        }
      }
    }
  }
  return fallback !== undefined && fallback !== '' ? fallback : undefined;
}

function parseNanoTime(raw: unknown): string {
  if (typeof raw !== 'string') throw new TimeParseError('timeUnixNano is not a string', String(raw));
  return parseTimestamp(raw, 'unix_ns').isoUtc;
}

function nanoToEpochMs(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n * 1e-6 : undefined;
}

function summarize(value: unknown): string {
  const s = JSON.stringify(value);
  return s.length > 200 ? `${s.slice(0, 200)}...` : s;
}

function metricDataPoints(metric: Record<string, unknown>): { points: unknown[] } | 'unsupported' | 'missing' {
  for (const kind of SUPPORTED_METRIC_KINDS) {
    if (kind in metric) {
      const wrapper = asRecord(metric[kind]);
      const dataPoints = wrapper?.['dataPoints'];
      return Array.isArray(dataPoints) ? { points: dataPoints } : { points: [] };
    }
  }
  for (const kind of UNSUPPORTED_METRIC_KINDS) {
    if (kind in metric) return 'unsupported';
  }
  return 'missing';
}

function dataPointValue(dp: Record<string, unknown>): number | undefined {
  const asDouble = dp['asDouble'];
  if (typeof asDouble === 'number' && Number.isFinite(asDouble)) return asDouble;
  const asInt = dp['asInt'];
  if (typeof asInt === 'string' && asInt !== '') {
    const n = Number(asInt);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function buildSignal(
  signalKind: 'metric' | 'log' | 'trace',
  payload: MetricPayload | LogPayload | TracePayload,
  serviceName: string,
  timestamp: string,
): TelemetrySignal {
  const signal: TelemetrySignal = {
    irVersion: IR_VERSION,
    resource: { 'service.name': serviceName },
    timestamp,
    signal: signalKind,
    payload,
  };
  // The callers validate every field before reaching here, so a schema failure
  // is a programmer error, not a data problem; `parse` throws on it instead of
  // returning a quarantine result (which would be an unreachable branch).
  return telemetrySignalSchema.parse(signal) as TelemetrySignal;
}

function normalizeSeverity(raw: string | undefined): LogPayload['severityText'] | undefined {
  if (raw === undefined || raw === '') return undefined;
  return SEVERITY_ALIASES[raw.toUpperCase()];
}

/** Ingest an OTLP `ExportMetricsServiceRequest` JSON document. */
export function ingestOtlpMetrics(input: unknown, options: OtlpIngestOptions = {}): OtlpIngestResult {
  const signals: TelemetrySignal[] = [];
  const quarantine: OtlpQuarantineRecord[] = [];
  let index = 0;

  const root = asRecord(input);
  const resourceMetrics = root?.['resourceMetrics'];
  if (!Array.isArray(resourceMetrics)) return { signals, quarantine };

  for (const rm of resourceMetrics) {
    const resourceMetricsRec = asRecord(rm);
    const serviceName = extractServiceName(resourceMetricsRec?.['resource'], options.serviceName);
    const scopeMetrics = resourceMetricsRec?.['scopeMetrics'];
    if (!Array.isArray(scopeMetrics)) continue;

    for (const sm of scopeMetrics) {
      const scopeRec = asRecord(sm);
      const metrics = scopeRec?.['metrics'];
      if (!Array.isArray(metrics)) continue;

      for (const metric of metrics) {
        const metricRec = asRecord(metric);
        if (metricRec === undefined) continue;
        const name = metricRec['name'];
        const dataPoints = metricDataPoints(metricRec);

        if (dataPoints === 'unsupported') {
          index += 1;
          quarantine.push({ index, reason: 'unsupported metric type (histogram/exponentialHistogram/summary)', record: summarize(metric) });
          continue;
        }
        if (dataPoints === 'missing') {
          index += 1;
          quarantine.push({ index, reason: 'metric has no recognised type (sum/gauge)', record: summarize(metric) });
          continue;
        }
        if (typeof name !== 'string' || name === '') {
          // One quarantine per metric with a bad name, then still process points? No: skip the metric.
          index += dataPoints.points.length + 1;
          quarantine.push({ index, reason: 'metric is missing a name', record: summarize(metric) });
          continue;
        }

        const unit = typeof metricRec['unit'] === 'string' ? metricRec['unit'] : undefined;

        for (const dp of dataPoints.points) {
          index += 1;
          const dpRec = asRecord(dp);
          const timestamp = (() => {
            try {
              return parseNanoTime(dpRec?.['timeUnixNano']);
            } catch {
              return undefined;
            }
          })();
          if (timestamp === undefined) {
            quarantine.push({ index, reason: 'data point has an invalid timestamp', record: summarize(dp) });
            continue;
          }
          if (serviceName === undefined) {
            quarantine.push({ index, reason: 'missing service name (resource attribute service.name or options.serviceName)', record: summarize(dp) });
            continue;
          }
          // `dpRec` is guaranteed non-null here: a null data point would have
          // already failed the timestamp check above.
          const value = dataPointValue(dpRec as Record<string, unknown>);
          if (value === undefined) {
            quarantine.push({ index, reason: 'data point has no numeric value (asDouble/asInt)', record: summarize(dp) });
            continue;
          }
          const tags = parseAttributes(dpRec?.['attributes']);
          const payload: MetricPayload = {
            kind: 'metric',
            name,
            value,
            ...(unit !== undefined ? { unit } : {}),
            ...(Object.keys(tags).length > 0 ? { tags } : {}),
          };
          signals.push(buildSignal('metric', payload, serviceName, timestamp));
        }
      }
    }
  }

  return { signals, quarantine };
}

/** Ingest an OTLP `ExportLogsServiceRequest` JSON document. */
export function ingestOtlpLogs(input: unknown, options: OtlpIngestOptions = {}): OtlpIngestResult {
  const signals: TelemetrySignal[] = [];
  const quarantine: OtlpQuarantineRecord[] = [];
  let index = 0;

  const root = asRecord(input);
  const resourceLogs = root?.['resourceLogs'];
  if (!Array.isArray(resourceLogs)) return { signals, quarantine };

  for (const rl of resourceLogs) {
    const rlRec = asRecord(rl);
    const serviceName = extractServiceName(rlRec?.['resource'], options.serviceName);
    const scopeLogs = rlRec?.['scopeLogs'];
    if (!Array.isArray(scopeLogs)) continue;

    for (const sl of scopeLogs) {
      const scopeRec = asRecord(sl);
      const logRecords = scopeRec?.['logRecords'];
      if (!Array.isArray(logRecords)) continue;

      for (const lr of logRecords) {
        index += 1;
        const lrRec = asRecord(lr);
        const timestamp = (() => {
          try {
            return parseNanoTime(lrRec?.['timeUnixNano']);
          } catch {
            return undefined;
          }
        })();
        if (timestamp === undefined) {
          quarantine.push({ index, reason: 'log record has an invalid timestamp', record: summarize(lr) });
          continue;
        }
        if (serviceName === undefined) {
          quarantine.push({ index, reason: 'missing service name (resource attribute service.name or options.serviceName)', record: summarize(lr) });
          continue;
        }
        const body = anyValueToString(lrRec?.['body']);
        if (body === undefined) {
          quarantine.push({ index, reason: 'log record has no body', record: summarize(lr) });
          continue;
        }
        const rawSeverity = typeof lrRec?.['severityText'] === 'string' ? lrRec['severityText'] : undefined;
        const severityText = normalizeSeverity(rawSeverity);
        if (rawSeverity !== undefined && severityText === undefined) {
          quarantine.push({ index, reason: `invalid severity '${rawSeverity}'`, record: summarize(lr) });
          continue;
        }
        const payload: LogPayload = {
          kind: 'log',
          body,
          ...(severityText !== undefined ? { severityText } : {}),
        };
        signals.push(buildSignal('log', payload, serviceName, timestamp));
      }
    }
  }

  return { signals, quarantine };
}

/** Ingest an OTLP `ExportTraceServiceRequest` JSON document. */
export function ingestOtlpTraces(input: unknown, options: OtlpIngestOptions = {}): OtlpIngestResult {
  const signals: TelemetrySignal[] = [];
  const quarantine: OtlpQuarantineRecord[] = [];
  let index = 0;

  const root = asRecord(input);
  const resourceSpans = root?.['resourceSpans'];
  if (!Array.isArray(resourceSpans)) return { signals, quarantine };

  for (const rs of resourceSpans) {
    const rsRec = asRecord(rs);
    const serviceName = extractServiceName(rsRec?.['resource'], options.serviceName);
    const scopeSpans = rsRec?.['scopeSpans'];
    if (!Array.isArray(scopeSpans)) continue;

    for (const ss of scopeSpans) {
      const scopeRec = asRecord(ss);
      const spans = scopeRec?.['spans'];
      if (!Array.isArray(spans)) continue;

      for (const span of spans) {
        index += 1;
        const spanRec = asRecord(span);
        const startMs = nanoToEpochMs(spanRec?.['startTimeUnixNano']);
        const endMs = nanoToEpochMs(spanRec?.['endTimeUnixNano']);
        if (startMs === undefined || endMs === undefined) {
          quarantine.push({ index, reason: 'span has an invalid start/end timestamp', record: summarize(span) });
          continue;
        }
        if (serviceName === undefined) {
          quarantine.push({ index, reason: 'missing service name (resource attribute service.name or options.serviceName)', record: summarize(span) });
          continue;
        }
        const durationMs = endMs - startMs;
        if (durationMs < 0) {
          quarantine.push({ index, reason: 'span has a negative duration', record: summarize(span) });
          continue;
        }
        const traceId = typeof spanRec?.['traceId'] === 'string' ? spanRec['traceId'] : '';
        if (traceId === '') {
          quarantine.push({ index, reason: 'span has no trace id', record: summarize(span) });
          continue;
        }
        const spanId = typeof spanRec?.['spanId'] === 'string' ? spanRec['spanId'] : '';
        if (spanId === '') {
          quarantine.push({ index, reason: 'span has no span id', record: summarize(span) });
          continue;
        }
        const spanName = typeof spanRec?.['name'] === 'string' ? spanRec['name'] : '';
        if (spanName === '') {
          quarantine.push({ index, reason: 'span has no name', record: summarize(span) });
          continue;
        }
        const parentSpanId = typeof spanRec?.['parentSpanId'] === 'string' && spanRec['parentSpanId'] !== ''
          ? spanRec['parentSpanId']
          : undefined;

        const statusRec = asRecord(spanRec?.['status']);
        const rawCode = statusRec?.['code'];
        let status: TracePayload['status'];
        if (typeof rawCode === 'number') {
          status = SPAN_STATUS_CODE[rawCode];
          if (status === undefined) {
            quarantine.push({ index, reason: `invalid span status code '${rawCode}'`, record: summarize(span) });
            continue;
          }
        }

        const payload: TracePayload = {
          kind: 'trace',
          traceId,
          spanId,
          ...(parentSpanId !== undefined ? { parentSpanId } : {}),
          spanName,
          durationMs,
          ...(status !== undefined ? { status } : {}),
        };
        signals.push(buildSignal('trace', payload, serviceName, epochMsToIsoUtc(startMs)));
      }
    }
  }

  return { signals, quarantine };
}
