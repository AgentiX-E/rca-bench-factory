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

/**
 * Span status codes, in both encodings the OTLP JSON mapping produces.
 *
 * The mapping writes enums as their *names* (`"STATUS_CODE_ERROR"`), but a
 * producer that re-serialises a decoded message -- or any encoder that treats
 * the field as an integer -- writes the number. The reader used to match numbers
 * only, so `{ code: 'STATUS_CODE_ERROR' }` was neither recognised nor reported:
 * the branch was `if (typeof rawCode === 'number')`, whose falsy side silently
 * produced a span with no `status` at all. An error span that arrives without
 * its status is indistinguishable from a healthy one, so the defect could only
 * ever make the corpus look better than it was.
 *
 * Declared once, from the vocabulary, and used to derive both lookup tables.
 */
const SPAN_STATUS_CODE_NAMES: Record<string, TracePayload['status']> = {
  STATUS_CODE_UNSET: 'UNSET',
  STATUS_CODE_OK: 'OK',
  STATUS_CODE_ERROR: 'ERROR',
};

const SPAN_STATUS_CODES: Record<string, TracePayload['status']> = {
  '0': 'UNSET',
  '1': 'OK',
  '2': 'ERROR',
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

/**
 * Convert a nanosecond epoch, delivered as a string, into exact milliseconds.
 *
 * Milliseconds are `ns / 1_000_000`; the remainder is sub-millisecond time that
 * the IR does not represent. Dividing in `BigInt` and converting the *result* to
 * a number was not an option, because `Number(ns)` loses nanoseconds at these
 * magnitudes, so the division has to happen before the narrowing.
 *
 * The previous `n * 1e-6` was a float multiply and disagreed with exact integer
 * division on 2500 of 4000 consecutive millisecond pairs. It reported a 1 ms
 * span as `0.999755859375` and a 17 ms span as `16.999755859375`: a duration
 * that is wrong by a fraction of a millisecond in a benchmark whose whole
 * purpose is measuring durations. `BigInt` division truncates toward zero, which
 * is what makes a one-nanosecond-looking sub-millisecond increase read as `0`
 * -- and, on the backwards side, what keeps `-1n / 1_000_000n` from being
 * reported as a legal zero-length span.
 */
function nanoToEpochMs(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined;
  if (!/^-?\d+$/.test(raw)) return undefined;
  const ns = BigInt(raw);
  const sign = ns < 0n ? -1n : 1n;
  const magnitude = ns < 0n ? -ns : ns;
  return Number(sign * (magnitude / 1_000_000n));
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

/**
 * Read a metric data point's value.
 *
 * Both `asInt` and `asDouble` are numbers on the wire. The OTLP JSON mapping
 * documents int64 as a string (so a 64-bit value survives a language with no
 * such integer), but protojson -- which is what most exporters actually use --
 * also admits the numeric form, and a document that carries `asInt: 42` is a
 * legal document. The reader accepted the quoted form only, so such a data point
 * was quarantined as having "no numeric value" while plainly having one. The
 * two forms have to agree.
 */
function dataPointValue(dp: Record<string, unknown>): number | undefined {
  const asDouble = dp['asDouble'];
  if (typeof asDouble === 'number' && Number.isFinite(asDouble)) return asDouble;
  const asInt = dp['asInt'];
  if (typeof asInt === 'number' && Number.isSafeInteger(asInt)) return asInt;
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

/**
 * Read a span's status from either encoding the OTLP JSON mapping produces.
 *
 * Returns the status, `undefined` when the span carries none, or the offending
 * token so the caller can report it. A present-but-unreadable code is a data
 * problem and must be quarantined; only an absent status is allowed through
 * silently, because `UNSET` is a real member of the vocabulary rather than the
 * default applied when parsing fails.
 */
function readSpanStatus(
  rawCode: unknown,
): { status: TracePayload['status'] } | { invalid: string } | undefined {
  if (rawCode === undefined) return undefined;
  if (typeof rawCode === 'number') {
    const named = SPAN_STATUS_CODES[String(rawCode)];
    return named !== undefined ? { status: named } : { invalid: String(rawCode) };
  }
  if (typeof rawCode === 'string') {
    // The name form first: it is what the mapping actually writes.
    const named = SPAN_STATUS_CODE_NAMES[rawCode] ?? SPAN_STATUS_CODES[rawCode];
    return named !== undefined ? { status: named } : { invalid: rawCode };
  }
  return { invalid: String(rawCode) };
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
        // An empty string is an exporter with nothing to say about severity, not
        // an exporter saying something unrecognisable. `normalizeSeverity`
        // already treats `''` and `undefined` alike and returns `undefined` for
        // both, but this guard compared the *token* rather than the raw field,
        // so `severityText: ''` was quarantined as `invalid severity ''` -- a
        // claim about a document that is not the document. Measured: one signal
        // became one quarantine entry, for a field the schema calls optional.
        if (rawSeverity !== undefined && rawSeverity !== '' && severityText === undefined) {
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
        const rawStartNs = spanRec?.['startTimeUnixNano'];
        const rawEndNs = spanRec?.['endTimeUnixNano'];
        const startMs = nanoToEpochMs(rawStartNs);
        const endMs = nanoToEpochMs(rawEndNs);
        if (startMs === undefined || endMs === undefined) {
          quarantine.push({ index, reason: 'span has an invalid start/end timestamp', record: summarize(span) });
          continue;
        }
        // Kept at full nanosecond resolution: `durationMs` below is truncated,
        // and truncation is exactly where a sub-millisecond inversion hides.
        const startNs = BigInt(rawStartNs as string);
        const endNs = BigInt(rawEndNs as string);
        if (serviceName === undefined) {
          quarantine.push({ index, reason: 'missing service name (resource attribute service.name or options.serviceName)', record: summarize(span) });
          continue;
        }
        const durationMs = endMs - startMs;
        // `durationMs` is truncated to whole milliseconds, so it reads `0` for a
        // span whose end preceded its start by less than a millisecond -- and a
        // negative duration is the one thing the corpus must never contain,
        // because it is the inverted-timestamp signature of a broken clock.
        // Comparing the exact nanosecond instants is what keeps `-1 ns` from
        // being reported as a legal zero-length span.
        if (durationMs < 0 || endNs < startNs) {
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
        const readStatus = readSpanStatus(statusRec?.['code']);
        if (readStatus !== undefined && 'invalid' in readStatus) {
          quarantine.push({
            index,
            reason: `invalid span status code '${readStatus.invalid}'`,
            record: summarize(span),
          });
          continue;
        }
        const status = readStatus?.status;

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
