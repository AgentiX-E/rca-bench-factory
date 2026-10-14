/**
 * Pull log lines from a Loki range query and map them to IR signals.
 *
 * ## Why the registry said this could not be done, and which half was wrong
 *
 * `backends.ts` declared this backend unsupported, and the reason it gave is worth
 * reading twice: Loki "answers `/loki/api/v1/query_range` with LogQL results whose
 * values are `[ns-timestamp, line]` pairs and whose streams carry label sets Loki
 * chose, so the service a log belongs to is a label the caller must name, and a
 * reader that guessed it would attach every line to the wrong service".
 *
 * Every clause of that is true, and the conclusion drawn from it was not. "The
 * caller must name it" is a statement about the *interface*, not about
 * feasibility: a reader whose service label is a required argument with no default
 * cannot guess, because there is nothing to guess with. That is what
 * `serviceLabel` below is, and it is why the option has no default even though the
 * Prometheus reader's equivalent one does -- `service` is what OpenTelemetry's
 * semantic conventions call this for metrics, and no convention is universal for
 * logs (`service_name` from the OTel Collector's Loki exporter, `job` from a
 * Promtail pipeline, `app` from neither). A default here would be one writer's
 * habit presented as a backend's promise.
 *
 * ## What it does not do
 *
 * It does not reach a real Loki. Nothing in this repository has contacted a Loki
 * deployment; the module is driven against a fixture server in
 * `packages/core/test/loki.test.ts`. The Prometheus reader earned the stronger
 * claim by being pointed at a real server (finding 154); this one has not, and the
 * registry's summary says so.
 *
 * It does not reorder the answer. Loki's `direction` decides whether the entries
 * come back newest-first or oldest-first, and with a `limit` it also decides *which
 * end of the window survives* -- so it is required rather than defaulted, and the
 * signals come out in the order the backend wrote them. Reversing them here would
 * make `signals[0]` not the backend's first entry, which is the only thing a
 * reader can compare the two by.
 *
 * It does not read a line's severity. `level`, `severity`, `lvl` and Loki's own
 * `detected_level` are four names for one idea, and their values are not the
 * vocabulary the IR carries: `warning` is not `WARN` and `critical` is not `FATAL`.
 * A mapping would be a translation nothing here can check, so `severityText` stays
 * absent -- which says "the backend did not state one in a vocabulary this
 * repository reads", not "this line was informational".
 *
 * It does not read structured metadata. Loki 3 writes a third element into an
 * entry's tuple when structured metadata is present, and refusing those entries is
 * visible in `quarantine` rather than silent; attaching a metadata object as if it
 * were the line would be the loudest possible version of guessing.
 *
 * It does not retry, for the reason recorded in `prometheus.ts`: the repository's
 * retry policy lives in `fetch-official.mjs` with its own exit-code contract
 * (finding 52), and a second, quieter one here would eventually disagree with it.
 */

import { IR_VERSION, type LogPayload, type TelemetrySignal } from '../ir/types.js';
import { telemetrySignalSchema } from '../ir/schema.js';

/** The Loki range-query endpoint this module speaks. */
export const LOKI_QUERY_RANGE_PATH = '/loki/api/v1/query_range';

/**
 * The orderings `/loki/api/v1/query_range` accepts.
 *
 * A tuple rather than a type so the runtime check below can enumerate it, and so
 * the vocabulary lives in one place: `backward` is Loki's own default, and with a
 * `limit` it keeps the *newest* entries, which is why the caller has to say.
 */
export const LOKI_DIRECTIONS = ['forward', 'backward'] as const;

/** A direction the range query accepts. Derived from `LOKI_DIRECTIONS`. */
export type LokiDirection = (typeof LOKI_DIRECTIONS)[number];

/** Nanoseconds in a millisecond, which is the projection the IR records. */
const NANOS_PER_MILLI = 1_000_000n;

/** Default bound on a single request, in milliseconds. */
export const LOKI_DEFAULT_TIMEOUT_MS = 15_000;

/** An entry the puller could not turn into a signal, and why. */
export interface LokiQuarantineRecord {
  /** Index of the stream in the response, then of the entry inside it. */
  index: number;
  reason: string;
  /** The offending record, truncated. */
  record: string;
}

export type LokiPullResult =
  | {
      ok: true;
      signals: TelemetrySignal[];
      quarantine: LokiQuarantineRecord[];
      /** Whatever the backend reported in its `warnings` array, passed through. */
      warnings: string[];
    }
  | { ok: false; error: string };

export interface LokiPullOptions {
  /** Base URL of the Loki query API, with or without a trailing slash. */
  baseUrl: string;
  /** A LogQL **log** selector. A LogQL metric query answers with a matrix, which this reader refuses. */
  query: string;
  /** Start of the window: epoch seconds, an ISO-8601 string, or a `Date`. */
  start: number | string | Date;
  /** End of the window, same encodings as `start`. */
  end: number | string | Date;
  /**
   * Maximum number of entries to return.
   *
   * Required rather than defaulted: Loki's own default is 100 entries, so a
   * reader that left this out would receive a silently truncated window and would
   * have no way to say so.
   */
  limit: number;
  /** Which end of the window the limit keeps, and the order the entries arrive in. */
  direction: LokiDirection;
  /**
   * The stream label carrying the service name. Required, with no default.
   *
   * This is the registry's reason for this backend turned into an interface: the
   * label set is the writer's choice, so the caller names the label and the reader
   * never has to decide which one is the service.
   */
  serviceLabel: string;
  timeoutMs?: number;
}

/**
 * Nanoseconds since the epoch, from any of the three encodings the other pullers
 * accept.
 *
 * A `number` is **epoch seconds**, the same convention the Prometheus and Jaeger
 * pullers take, and it goes through whole milliseconds rather than being scaled
 * directly: 1.7e18 ns is past the range in which a `float64` is exact, so
 * `value * 1e9` would arrive at the backend with the last digits already rounded.
 * Milliseconds are exact as a float at this size, and one multiplication by
 * `NANOS_PER_MILLI` on a `bigint` keeps the rest exact.
 */
function toEpochNanos(value: number | string | Date, what: string): bigint {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (!Number.isFinite(ms)) throw new Error(`${what} is not a time this module can read: ${String(value)}`);
    return BigInt(ms) * NANOS_PER_MILLI;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${what} must be a finite number of seconds`);
    return BigInt(Math.round(value * 1000)) * NANOS_PER_MILLI;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`${what} is not a time this module can read: ${String(value)}`);
  return BigInt(ms) * NANOS_PER_MILLI;
}

/**
 * Milliseconds since the epoch, from the entry's timestamp.
 *
 * Loki writes this as a decimal *string* of nanoseconds, and the string is read as
 * an integer on purpose. Two ways of getting it wrong are measured in
 * `loki.test.ts`: read as milliseconds the digits are not a date at all, and read
 * through `Number` the division lands a millisecond late for entries whose
 * sub-millisecond part sits within 128 ns below a boundary -- `1.7e18` is past
 * `2^53`, so the digits get rounded before the division. Truncation rather than
 * rounding keeps the IR's timestamp from being later than the line the backend
 * wrote.
 */
function nanosToMillis(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return undefined;
  return Number(BigInt(raw) / NANOS_PER_MILLI);
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
 * Pull one range query and map it.
 *
 * The split between `ok: false` and a quarantine record is the one the other two
 * pullers make and it means the same thing: the first is a request that cannot be
 * answered (fix the query, try again), the second is telemetry with a hole in it
 * and a record of where.
 */
export async function pullLokiLogs(options: LokiPullOptions): Promise<LokiPullResult> {
  const { baseUrl, query, limit, direction, serviceLabel, timeoutMs = LOKI_DEFAULT_TIMEOUT_MS } = options;

  if (serviceLabel === '') {
    return { ok: false, error: 'no service label was named, and a Loki stream carries the labels its writer chose' };
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    return { ok: false, error: `limit must be a positive integer, got ${JSON.stringify(limit)}` };
  }
  if (!(LOKI_DIRECTIONS as readonly string[]).includes(direction)) {
    return {
      ok: false,
      error: `direction must be one of 'forward' or 'backward', got ${JSON.stringify(direction)}`,
    };
  }

  let start: bigint;
  let end: bigint;
  try {
    start = toEpochNanos(options.start, 'start');
    end = toEpochNanos(options.end, 'end');
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  if (end < start) {
    return { ok: false, error: `end (${end}) is before start (${start}), so the range is empty` };
  }

  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${LOKI_QUERY_RANGE_PATH}`);
  url.searchParams.set('query', query);
  // Decimal strings, not numbers: Loki takes nanosecond timestamps, and a JSON
  // number could not have carried 19 digits in the first place.
  url.searchParams.set('start', start.toString());
  url.searchParams.set('end', end.toString());
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('direction', direction);

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
  if (envelope === undefined || typeof envelope['status'] !== 'string') {
    return { ok: false, error: `${url.origin}${url.pathname} returned a body with no 'status' field` };
  }
  // The verdict in the body, not the status code. No Loki has been measured here,
  // so this is a defence rather than a reproduction -- the same reading of a real
  // server that turned the Prometheus reader's twin branch into one (finding 154)
  // is what would settle it, and `docs/architecture.md` says which of the two
  // readers has had that treatment.
  if (envelope['status'] !== 'success') {
    const errorType = typeof envelope['errorType'] === 'string' ? envelope['errorType'] : 'unknown';
    const message = typeof envelope['error'] === 'string' ? envelope['error'] : 'no message';
    return { ok: false, error: `the query failed (${errorType}): ${message}` };
  }

  const data = asRecord(envelope['data']);
  if (data === undefined) {
    return { ok: false, error: `${url.origin}${url.pathname} returned no \`data\` field` };
  }
  const resultType = data['resultType'];
  if (resultType !== 'streams') {
    return { ok: false, error: `expected log streams from a range query, got '${String(resultType)}'` };
  }
  const streams = data['result'];
  if (!Array.isArray(streams)) {
    return { ok: false, error: "the response's `data.result` is not an array" };
  }

  const warnings = Array.isArray(envelope['warnings'])
    ? envelope['warnings'].filter((w): w is string => typeof w === 'string')
    : [];

  const signals: TelemetrySignal[] = [];
  const quarantine: LokiQuarantineRecord[] = [];

  streams.forEach((rawStream, streamIndex) => {
    const record = asRecord(rawStream);
    const labels = asRecord(record?.['stream']);
    const values = record?.['values'];
    if (labels === undefined || !Array.isArray(values)) {
      quarantine.push({
        index: streamIndex * 1_000_000,
        reason: 'stream has no `stream` label set or no `values` array',
        record: summarize(rawStream),
      });
      return;
    }

    const serviceName = labels[serviceLabel];
    if (typeof serviceName !== 'string' || serviceName === '') {
      quarantine.push({
        index: streamIndex * 1_000_000,
        reason: `stream has no '${serviceLabel}' label, so its lines have no service to belong to`,
        record: summarize(rawStream),
      });
      return;
    }

    // The stream's remaining labels are its identity -- Loki requires label sets to
    // be low-cardinality for exactly that reason -- which is what the IR's
    // `resource` records. One that is not a string is off-format and is dropped
    // rather than coerced, because `resource` holds strings and a stringified label
    // would be indistinguishable from a label Loki wrote that way.
    const resource: TelemetrySignal['resource'] = { 'service.name': serviceName };
    for (const [label, value] of Object.entries(labels)) {
      if (label === serviceLabel) continue;
      if (typeof value === 'string') resource[label] = value;
    }

    values.forEach((rawEntry, entryIndex) => {
      const index = streamIndex * 1_000_000 + entryIndex;
      if (!Array.isArray(rawEntry) || rawEntry.length !== 2) {
        quarantine.push({
          index,
          reason:
            'entry is not a [timestamp, line] pair of two elements; Loki writes a third element when ' +
            'structured metadata is present, which this reader does not read',
          record: summarize(rawEntry),
        });
        return;
      }
      const millis = nanosToMillis(rawEntry[0]);
      if (millis === undefined) {
        quarantine.push({
          index,
          reason: `entry timestamp is not decimal nanoseconds since the epoch: ${JSON.stringify(rawEntry[0])}`,
          record: summarize(rawEntry),
        });
        return;
      }
      const line = rawEntry[1];
      if (typeof line !== 'string') {
        quarantine.push({
          index,
          reason: `entry line is not a string: ${JSON.stringify(line)}`,
          record: summarize(rawEntry),
        });
        return;
      }

      const payload: LogPayload = { kind: 'log', body: line };
      const signal: TelemetrySignal = {
        irVersion: IR_VERSION,
        resource,
        timestamp: new Date(millis).toISOString(),
        rawOffsetMinutes: 0,
        signal: 'log',
        payload,
        // The line, the timestamp and the service come off the wire as they are.
        // Nothing here is `derived`: the ns-to-ms projection is a unit change, and
        // the value it produces is the one the backend's own digits define.
        provenance: {
          'payload.body': { source: 'direct' },
          timestamp: { source: 'direct' },
          'resource.service.name': { source: 'direct' },
        },
      };
      signals.push(telemetrySignalSchema.parse(signal) as TelemetrySignal);
    });
  });

  return { ok: true, signals, quarantine, warnings };
}
