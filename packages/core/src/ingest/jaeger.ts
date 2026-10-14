/**
 * Pull traces from a Jaeger query API and map them to IR signals.
 *
 * ## Why this is a second decoder rather than a URL for the first one
 *
 * The registry in `backends.ts` declared this backend unsupported for a reason
 * worth keeping in view while reading the code: Jaeger answers `/api/traces` in
 * **its own** trace JSON -- span ids as hex strings, `startTime` and `duration` in
 * microseconds, a `processes` table that lives beside the spans rather than inside
 * them, and tags as `{key, type, value}` triples instead of OTLP's key/value
 * attributes. None of that is OTLP, so this is a reader for a second wire format,
 * not a second endpoint for `ingest/otlp.ts`.
 *
 * ## What it does not do
 *
 * It does not reach a real Jaeger. Nothing in this repository has contacted a
 * Jaeger endpoint; the module is driven against a fixture server in
 * `packages/core/test/jaeger.test.ts`, and the difference between "reads the
 * documented wire format" and "was refused by a deployment" is stated rather than
 * blurred. The Prometheus puller earned the stronger claim by being pointed at a
 * real server (finding 154); this one has not earned it yet.
 *
 * It does not retry, for the reason recorded in `prometheus.ts`: the repository's
 * retry policy lives in `fetch-official.mjs` with its own exit-code contract
 * (finding 52), and a second, quieter one here would eventually disagree with it.
 *
 * It does not invent a service. If neither `span.process.serviceName` nor the
 * trace's `processes` table supplies one, the span is quarantined -- guessing would
 * attach spans to the wrong service, and the whole point of a trace is which
 * service the span belongs to.
 *
 * It does not default `limit`. Like Prometheus' `step`, it decides how much
 * telemetry the caller gets, and a wrong default is invisible in the output.
 */

import { IR_VERSION, type SpanStatus, type TelemetrySignal, type TracePayload } from '../ir/types.js';
import { telemetrySignalSchema } from '../ir/schema.js';

/** The Jaeger query endpoint this module speaks. */
export const JAEGER_TRACES_PATH = '/api/traces';

/** Default bound on a single request, in milliseconds. */
export const JAEGER_DEFAULT_TIMEOUT_MS = 15_000;

/** A span the puller could not turn into a signal, and why. */
export interface JaegerQuarantineRecord {
  /** Index of the trace, then of the span inside it. */
  index: number;
  reason: string;
  /** The offending record, truncated. */
  record: string;
}

export type JaegerPullResult =
  | {
      ok: true;
      signals: TelemetrySignal[];
      quarantine: JaegerQuarantineRecord[];
      /** Whatever each trace reported in its `warnings` array, passed through. */
      warnings: string[];
    }
  | { ok: false; error: string };

export interface JaegerPullOptions {
  /** Base URL of the Jaeger query API, with or without a trailing slash. */
  baseUrl: string;
  /** The service whose traces to fetch. Required, because Jaeger's API requires it. */
  service: string;
  /** Start of the window: epoch seconds, an ISO-8601 string, or a `Date`. */
  start: number | string | Date;
  /** End of the window, same encodings as `start`. */
  end: number | string | Date;
  /**
   * Maximum number of traces to return.
   *
   * Required rather than defaulted, for the reason `step` is required in the
   * Prometheus puller: this is how much telemetry the caller asked for, and a
   * default would decide it silently.
   */
  limit: number;
  timeoutMs?: number;
}

/**
 * Microseconds since the epoch, from any of the three accepted encodings.
 *
 * A `number` is **epoch seconds**, the same convention the Prometheus puller
 * accepts, and it is converted here because Jaeger's own API takes microseconds.
 * Accepting milliseconds as well would mean guessing which of the two a bare
 * number was, and a wrong guess is a window in the wrong decade -- so the type is
 * documented rather than sniffed.
 */
function toEpochMicros(value: number | string | Date, what: string): number {
  if (value instanceof Date) return value.getTime() * 1000;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${what} is not a finite number`);
    return Math.round(value * 1_000_000);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${what} is not a parseable timestamp: ${JSON.stringify(value)}`);
  return parsed * 1000;
}

function summarize(value: unknown): string {
  const s = String(JSON.stringify(value));
  return s.length > 200 ? `${s.slice(0, 200)}...` : s;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * The service name Jaeger recorded for a span, from either of the two places it
 * puts one.
 *
 * This is the fact the registry's reason for this backend names: the process is a
 * table beside the spans, so a reader that only looked inside the span would find
 * no service on most responses. Both places are the wire format's, not a guess --
 * and when neither has one the span is quarantined rather than attributed.
 */
function serviceOf(span: Record<string, unknown>, processes: Record<string, unknown> | undefined): string | undefined {
  const inline = asRecord(span['process']);
  const inlineName = inline?.['serviceName'];
  if (typeof inlineName === 'string' && inlineName !== '') return inlineName;

  const processId = span['processID'];
  if (typeof processId !== 'string') return undefined;
  const table = asRecord(processes?.[processId]);
  const tableName = table?.['serviceName'];
  return typeof tableName === 'string' && tableName !== '' ? tableName : undefined;
}

/**
 * The span's parent, from its `CHILD_OF` reference.
 *
 * A reference of another kind (`FOLLOWS_FROM`) is not a parent, so taking
 * `references[0]` would build a tree that is not the one the trace recorded.
 */
function parentOf(span: Record<string, unknown>): string | undefined {
  const references = span['references'];
  if (!Array.isArray(references)) return undefined;
  for (const reference of references) {
    const record = asRecord(reference);
    if (record?.['refType'] !== 'CHILD_OF') continue;
    const spanId = record['spanID'];
    if (typeof spanId === 'string' && spanId !== '') return spanId;
  }
  return undefined;
}

/**
 * The span's status, from the tags Jaeger writes for it.
 *
 * Two spellings, both observed in the wild and both the wire format's: the
 * boolean `error` tag that the Go and Java clients set, and the string
 * `otel.status_code` that the OTLP receiver passes through. **Absent is absent**:
 * a span with neither tag gets no status rather than `OK`, because "the backend
 * did not say" and "the backend said it succeeded" are different facts and only
 * one of them is a measurement.
 */
function statusOf(tags: Record<string, unknown>): SpanStatus | undefined {
  const error = tags['error'];
  if (error === true) return 'ERROR';
  if (error === false) return 'OK';
  const otel = tags['otel.status_code'];
  if (otel === 'ERROR' || otel === 'OK' || otel === 'UNSET') return otel;
  return undefined;
}

/** The scalar tag values, as the attribute map the IR carries. */
function attributesOf(tags: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    // `error` and `otel.status_code` became the payload's `status`, and repeating
    // them as attributes would be two representations of one wire fact that can
    // drift apart.
    if (key === 'error' || key === 'otel.status_code') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
    }
    // An object or array tag cannot be represented as a string attribute, and
    // JSON-stringifying it would present a parsed structure as if it were the
    // value the backend wrote. Dropped, and the drop is what the tag `type` field
    // exists to make visible to a reader of the raw response.
  }
  return out;
}

/**
 * Pull one trace query and map it.
 *
 * The split between `ok: false` and a quarantine record is the same one the
 * Prometheus puller makes, and it means the same thing: the first is a request
 * that cannot be answered (fix the URL, try again), the second is telemetry with a
 * hole in it and a record of where.
 */
export async function pullJaegerTraces(options: JaegerPullOptions): Promise<JaegerPullResult> {
  const { baseUrl, service, limit, timeoutMs = JAEGER_DEFAULT_TIMEOUT_MS } = options;

  if (service === '') return { ok: false, error: 'no service was named, and Jaeger requires one' };
  if (!Number.isInteger(limit) || limit <= 0) {
    return { ok: false, error: `limit must be a positive integer, got ${JSON.stringify(limit)}` };
  }

  let start: number;
  let end: number;
  try {
    start = toEpochMicros(options.start, 'start');
    end = toEpochMicros(options.end, 'end');
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  if (end < start) {
    return { ok: false, error: `end (${end}) is before start (${start}), so the range is empty` };
  }

  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${JAEGER_TRACES_PATH}`);
  url.searchParams.set('service', service);
  url.searchParams.set('start', String(start));
  url.searchParams.set('end', String(end));
  url.searchParams.set('limit', String(limit));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as Error).name;
    const why = name === 'TimeoutError' ? `did not answer within ${timeoutMs}ms` : (error as Error).message;
    return { ok: false, error: `${url.origin}${url.pathname} ${why}` };
  }

  const body = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      error: `${url.origin}${url.pathname} returned HTTP ${response.status}: ${body.slice(0, 200)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, error: `${url.origin}${url.pathname} returned a body that is not JSON: ${body.slice(0, 200)}` };
  }

  const envelope = asRecord(parsed);
  if (envelope === undefined || !('data' in envelope)) {
    return { ok: false, error: `${url.origin}${url.pathname} returned a body with no 'data' field` };
  }

  const errors = envelope['errors'];
  const reported = Array.isArray(errors)
    ? errors.map((e) => (typeof e === 'string' ? e : summarize(e))).filter((e) => e !== '')
    : [];
  const traces = envelope['data'];

  // Jaeger reports a query it could not answer inside the body, and the two
  // outcomes it can carry are different: no data *at all* with errors is a
  // failed query, while data *and* errors is a partial answer with a warning.
  // Treating the first as an empty success would report an outage as a quiet
  // window, which is the failure the Prometheus puller's `status` branch exists
  // for and which finding 154 measured at the status-code layer.
  if (traces === null || traces === undefined) {
    if (reported.length > 0) return { ok: false, error: `the query failed: ${reported.join('; ')}` };
    return { ok: false, error: `${url.origin}${url.pathname} returned no data and no reason` };
  }
  if (!Array.isArray(traces)) {
    return { ok: false, error: "the response's `data` is not an array" };
  }

  const signals: TelemetrySignal[] = [];
  const quarantine: JaegerQuarantineRecord[] = [];
  const warnings = [...reported];

  traces.forEach((rawTrace, traceIndex) => {
    const trace = asRecord(rawTrace);
    const spans = trace?.['spans'];
    if (trace === undefined || !Array.isArray(spans)) {
      quarantine.push({
        index: traceIndex * 1_000_000,
        reason: 'trace has no `spans` array',
        record: summarize(rawTrace),
      });
      return;
    }
    for (const warning of Array.isArray(trace['warnings']) ? trace['warnings'] : []) {
      if (typeof warning === 'string') warnings.push(warning);
    }
    const processes = asRecord(trace['processes']);

    spans.forEach((rawSpan, spanIndex) => {
      const index = traceIndex * 1_000_000 + spanIndex;
      const span = asRecord(rawSpan);
      if (span === undefined) {
        quarantine.push({ index, reason: 'span is not an object', record: summarize(rawSpan) });
        return;
      }

      const traceId = span['traceID'];
      if (typeof traceId !== 'string' || traceId === '') {
        quarantine.push({ index, reason: 'span carries no `traceID`', record: summarize(rawSpan) });
        return;
      }
      const spanId = span['spanID'];
      if (typeof spanId !== 'string' || spanId === '') {
        quarantine.push({ index, reason: 'span carries no `spanID`', record: summarize(rawSpan) });
        return;
      }
      const spanName = span['operationName'];
      if (typeof spanName !== 'string' || spanName === '') {
        quarantine.push({
          index,
          reason: 'span carries no `operationName`, which is the name the IR records',
          record: summarize(rawSpan),
        });
        return;
      }
      const serviceName = serviceOf(span, processes);
      if (serviceName === undefined) {
        quarantine.push({
          index,
          reason: 'span names no service, in `process.serviceName` or in the trace `processes` table',
          record: summarize(rawSpan),
        });
        return;
      }

      // Microseconds on the wire, milliseconds in the IR, and the conversion is
      // stated rather than left to a reader who would have to know both.
      const startTime = span['startTime'];
      if (typeof startTime !== 'number' || !Number.isFinite(startTime)) {
        quarantine.push({
          index,
          reason: 'span `startTime` is not a number of microseconds since the epoch',
          record: summarize(rawSpan),
        });
        return;
      }
      const duration = span['duration'];
      if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
        quarantine.push({
          index,
          reason: 'span `duration` is not a non-negative number of microseconds',
          record: summarize(rawSpan),
        });
        return;
      }

      const tags: Record<string, unknown> = {};
      if (span['tags'] !== undefined && !Array.isArray(span['tags'])) {
        quarantine.push({ index, reason: 'span `tags` is not an array', record: summarize(rawSpan) });
        return;
      }
      for (const rawTag of Array.isArray(span['tags']) ? span['tags'] : []) {
        const tag = asRecord(rawTag);
        const key = tag?.['key'];
        if (typeof key === 'string' && key !== '') tags[key] = tag?.['value'];
      }

      const status = statusOf(tags);
      const attributes = attributesOf(tags);
      const parentSpanId = parentOf(span);

      const payload: TracePayload = {
        kind: 'trace',
        traceId,
        spanId,
        ...(parentSpanId !== undefined ? { parentSpanId } : {}),
        spanName,
        durationMs: duration / 1000,
        ...(status !== undefined ? { status } : {}),
        ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      };
      const signal: TelemetrySignal = {
        irVersion: IR_VERSION,
        resource: { 'service.name': serviceName },
        timestamp: new Date(startTime / 1000).toISOString(),
        rawOffsetMinutes: 0,
        signal: 'trace',
        payload,
        provenance: {
          'payload.traceId': { source: 'direct' },
          'payload.spanId': { source: 'direct' },
          'payload.spanName': { source: 'direct' },
          'payload.durationMs': { source: 'direct' },
          timestamp: { source: 'direct' },
        },
      };
      signals.push(telemetrySignalSchema.parse(signal) as TelemetrySignal);
    });
  });

  return { ok: true, signals, quarantine, warnings };
}
