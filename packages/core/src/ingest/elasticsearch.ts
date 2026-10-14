/**
 * Pull log documents from an Elasticsearch search API and map them to IR signals.
 *
 * ## Why the registry said this could not be done, and which half was wrong
 *
 * `backends.ts` declared this backend unsupported, and the reason it gave is worth
 * reading twice: Elasticsearch "returns hits under dynamic mappings, so the
 * timestamp field, the message field and the service field are per-index decisions:
 * the same query against two clusters yields two shapes, and a reader would need a
 * field mapping supplied by the caller before it could read anything at all".
 *
 * Every clause of that is true, and the last one is the interface rather than the
 * objection -- the same shape finding 161 found in Loki's reason. So `fields` is a
 * required argument with no defaults, and it is not the only thing the caller has to
 * decide:
 *
 * | the caller's decision | why it cannot be defaulted |
 * | --- | --- |
 * | which field holds the timestamp, the message and the service | it is a per-index decision, which is what the reason said |
 * | **which serialisation that timestamp field uses** | Elasticsearch writes a `date` as an ISO-8601 string or as epoch milliseconds depending on the field's own `format`, so the same three field names can still arrive in two shapes |
 * | the index, the size, the sort direction | the index is part of the path and an empty one means every index in the cluster; `size` defaults to 10 hits; and with a size limit the sort direction decides which end of the window survives |
 *
 * ## What it does not do
 *
 * It does not reach a real Elasticsearch. Nothing in this repository has contacted a
 * cluster; the module is driven against a fixture server in
 * `packages/core/test/elasticsearch.test.ts`, and the difference between "reads the
 * documented wire format" and "was answered by a cluster" is stated rather than
 * blurred. The Prometheus reader earned the stronger claim by being pointed at a real
 * server (finding 154); this one has not, and the registry's summary says so.
 *
 * It does not copy the document into the signal. A Loki stream's label set is
 * required to be low-cardinality identity, which is what the IR's `resource` records;
 * an Elasticsearch `_source` is a document, and its fields are as likely to be payload
 * as identity -- copying them in would invent a convention per index, which is the
 * defect the registry's reason was about. The message is read, and the rest is left
 * where the caller can see it.
 *
 * It does not read a severity. There is no convention for the field's name (`level`,
 * `severity`, `log.level`) and the values are not the vocabulary the IR carries, so
 * `severityText` stays absent -- which says "the backend did not state one in a
 * vocabulary this repository reads", not "this line was informational".
 *
 * It does not paginate. It reads one page of `size` hits, and it reports the total
 * the cluster gave *with its relation*, because `gte` is Elasticsearch saying "at
 * least this many" and a value without its relation presents an approximation as a
 * measurement. It also does not bound `size`: the real upper bound is a per-index
 * setting (`index.max_result_window`) that this module cannot read, so a value above
 * it is refused by the cluster and reported with its status.
 *
 * It does not retry, for the reason recorded in `prometheus.ts`: the repository's
 * retry policy lives in `fetch-official.mjs` with its own exit-code contract
 * (finding 52), and a second, quieter one here would eventually disagree with it.
 */

import { IR_VERSION, type LogPayload, type TelemetrySignal } from '../ir/types.js';
import { telemetrySignalSchema } from '../ir/schema.js';

/** The search endpoint this module speaks, appended to `/{index}`. */
export const ELASTICSEARCH_SEARCH_PATH = '/_search';

/** Default bound on a single request, in milliseconds. */
export const ELASTICSEARCH_DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The two serialisations of a `date` field this reader can be told to expect.
 *
 * A tuple rather than a type so the runtime check can enumerate it. The names are
 * this module's, not Elasticsearch's: the format strings Elasticsearch is sent for
 * each one are below, next to the conversion.
 */
export const ELASTICSEARCH_TIMESTAMP_FORMATS = ['iso8601', 'epoch_millis'] as const;

/** A timestamp serialisation. Derived from `ELASTICSEARCH_TIMESTAMP_FORMATS`. */
export type ElasticsearchTimestampFormat = (typeof ELASTICSEARCH_TIMESTAMP_FORMATS)[number];

/**
 * The orderings a search accepts, as a tuple for the same reason.
 *
 * `desc` is what a caller who wants the newest entries first asks for, and with
 * `size` it decides which end of the window is kept.
 */
export const ELASTICSEARCH_SORT_DIRECTIONS = ['asc', 'desc'] as const;

/** A sort direction. Derived from `ELASTICSEARCH_SORT_DIRECTIONS`. */
export type ElasticsearchSortDirection = (typeof ELASTICSEARCH_SORT_DIRECTIONS)[number];

/**
 * The per-index decision the caller has to make, and the whole of the registry's
 * reason turned into an interface.
 */
export interface ElasticsearchFieldMapping {
  /** Field holding the document's timestamp. */
  timestamp: string;
  /** Field holding the message the IR records as the log body. */
  message: string;
  /** Field holding the service name. */
  service: string;
}

/** A hit the puller could not turn into a signal, and why. */
export interface ElasticsearchQuarantineRecord {
  /** Index of the hit in the response. */
  index: number;
  reason: string;
  /** The offending record, truncated. */
  record: string;
}

/** The total the cluster reported, and whether it is exact. */
export interface ElasticsearchTotal {
  value: number;
  /** `eq` when the cluster counted them all, `gte` when it stopped counting. */
  relation: string;
}

export type ElasticsearchPullResult =
  | {
      ok: true;
      signals: TelemetrySignal[];
      quarantine: ElasticsearchQuarantineRecord[];
      /**
       * The count the cluster reported, if it reported one.
       *
       * Absent rather than zero when the response carries no `hits.total`: a cluster
       * asked not to count (`track_total_hits: false`) omits it, and `0` would say
       * the index holds nothing.
       */
      total?: ElasticsearchTotal;
      /**
       * The two ways an answer can be partial.
       *
       * `timed_out` and a failed shard mean the search answered without finishing, so
       * a reader that dropped them would report a partial answer as a complete one --
       * the same failure the Prometheus reader's status branch exists for.
       */
      partial: { timedOut: boolean; failedShards: number };
    }
  | { ok: false; error: string };

export interface ElasticsearchPullOptions {
  /** Base URL of the search API, with or without a trailing slash. */
  baseUrl: string;
  /**
   * The index or index pattern to search.
   *
   * Required, and not defaulted: it is the first path segment, and an empty one means
   * every index in the cluster.
   */
  index: string;
  /** The caller's Elasticsearch query, passed through as written. */
  query?: Record<string, unknown>;
  /** Start of the window: epoch seconds, an ISO-8601 string, or a `Date`. */
  start: number | string | Date;
  /** End of the window, same encodings as `start`. */
  end: number | string | Date;
  /**
   * Maximum number of hits to return.
   *
   * Required rather than defaulted: Elasticsearch's own default is 10 hits, so a
   * reader that left this out would receive a silently truncated page and would have
   * no way to say so.
   */
  size: number;
  /** Which serialisation the declared timestamp field uses. */
  timestampFormat: ElasticsearchTimestampFormat;
  /** Which end of the window the size limit keeps, and the order the hits arrive in. */
  sortDirection: ElasticsearchSortDirection;
  /** The per-index field decisions. Required, with no defaults. */
  fields: ElasticsearchFieldMapping;
  timeoutMs?: number;
}

/**
 * Milliseconds since the epoch, from any of the three encodings the other pullers
 * accept.
 *
 * A `number` is **epoch seconds**, the same convention the Prometheus, Jaeger and
 * Loki pullers take. A `Date` and a parseable string go through their own value.
 */
function toEpochMillis(value: number | string | Date, what: string): number {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (!Number.isFinite(ms)) throw new Error(`${what} is not a time this module can read: ${String(value)}`);
    return ms;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${what} must be a finite number of seconds`);
    return Math.round(value * 1000);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`${what} is not a time this module can read: ${String(value)}`);
  return ms;
}

/**
 * The window's bounds and the format string that says how to read them.
 *
 * The format is sent with the range, because a `date` field is parsed with the format
 * its mapping declares and the caller is the one who knows it. Stating it in the
 * request removes the guess the reader would otherwise make on the caller's behalf.
 */
function rangeBounds(
  format: ElasticsearchTimestampFormat,
  start: number,
  end: number,
): { gte: string | number; lte: string | number; format: string } {
  if (format === 'epoch_millis') return { gte: start, lte: end, format: 'epoch_millis' };
  return {
    gte: new Date(start).toISOString(),
    lte: new Date(end).toISOString(),
    format: 'strict_date_optional_time',
  };
}

/**
 * Milliseconds since the epoch, from a document's declared timestamp field.
 *
 * The declaration decides which shape is read, and the *other* Elasticsearch
 * serialisation is quarantined rather than sniffed: two index configurations that
 * write the same three field names in two shapes are two configurations, and reading
 * them by JSON type would merge them.
 */
function timestampOf(
  raw: unknown,
  field: string,
  format: ElasticsearchTimestampFormat,
): number | string {
  if (format === 'epoch_millis') {
    if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
    return (
      `hit's declared timestamp field '${field}' is not an integer number of milliseconds, ` +
      `and the caller declared epoch_millis: ${JSON.stringify(raw)}`
    );
  }
  if (typeof raw !== 'string') {
    return `hit's declared timestamp field '${field}' is not a date this module can read: ${JSON.stringify(raw)}`;
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    return `hit's declared timestamp field '${field}' is not a date this module can read: ${JSON.stringify(raw)}`;
  }
  return ms;
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

/** The count the cluster reported, from either of the two shapes it writes it in. */
function totalOf(raw: unknown): ElasticsearchTotal | undefined | string {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw < 0) return 'the cluster reported a `hits.total` that is not a count';
    // Elasticsearch 6 wrote this as a bare number, and a number was exact.
    return { value: raw, relation: 'eq' };
  }
  const record = asRecord(raw);
  const value = record?.['value'];
  if (record === undefined || typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return `the response's \`hits.total\` is neither a number nor an object with a numeric value: ${summarize(raw)}`;
  }
  const relation = record['relation'];
  // `relation` is what stops an approximate count from reading as an exact one. A
  // cluster that wrote neither is reported as neither.
  return { value, relation: typeof relation === 'string' ? relation : 'unknown' };
}

/**
 * Pull one search and map it.
 *
 * The split between `ok: false` and a quarantine record is the one the other three
 * pullers make: the first is a request that cannot be answered (fix the declaration,
 * try again), the second is telemetry with a hole in it and a record of where.
 */
export async function pullElasticsearchLogs(
  options: ElasticsearchPullOptions,
): Promise<ElasticsearchPullResult> {
  const {
    baseUrl,
    index,
    query,
    size,
    timestampFormat,
    sortDirection,
    fields,
    timeoutMs = ELASTICSEARCH_DEFAULT_TIMEOUT_MS,
  } = options;

  for (const field of ['timestamp', 'message', 'service'] as const) {
    const name = fields[field];
    if (typeof name !== 'string' || name === '') {
      return { ok: false, error: `no ${field} field was named, and the declaration is what says which field holds it` };
    }
  }
  if (index === '') {
    return { ok: false, error: 'no index was named, and an empty one means every index in the cluster' };
  }
  if (!Number.isInteger(size) || size <= 0) {
    return { ok: false, error: `size must be a positive integer, got ${JSON.stringify(size)}` };
  }
  if (!(ELASTICSEARCH_TIMESTAMP_FORMATS as readonly string[]).includes(timestampFormat)) {
    return {
      ok: false,
      error: `timestampFormat must be one of 'iso8601' or 'epoch_millis', got ${JSON.stringify(timestampFormat)}`,
    };
  }
  if (!(ELASTICSEARCH_SORT_DIRECTIONS as readonly string[]).includes(sortDirection)) {
    return {
      ok: false,
      error: `sortDirection must be one of 'asc' or 'desc', got ${JSON.stringify(sortDirection)}`,
    };
  }

  let start: number;
  let end: number;
  try {
    start = toEpochMillis(options.start, 'start');
    end = toEpochMillis(options.end, 'end');
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  if (end < start) {
    return { ok: false, error: `end (${end}) is before start (${start}), so the range is empty` };
  }

  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${index.replace(/^\/+/, '')}${ELASTICSEARCH_SEARCH_PATH}`);
  // The window is a range filter on the field the caller declared as the timestamp,
  // and the caller's own query is ANDed with it rather than replaced by it: the
  // reader owns the window, and the caller owns everything else.
  const body = JSON.stringify({
    size,
    sort: [{ [fields.timestamp]: sortDirection }],
    query: {
      bool: {
        ...(query !== undefined ? { must: [query] } : {}),
        filter: [{ range: { [fields.timestamp]: rangeBounds(timestampFormat, start, end) } }],
      },
    },
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as Error).name;
    const why = name === 'TimeoutError' ? `did not answer within ${timeoutMs}ms` : (error as Error).message;
    return { ok: false, error: `${url.origin}${url.pathname} ${why}` };
  }

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      error: `${url.origin}${url.pathname} returned HTTP ${response.status}: ${text.slice(0, 200)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: `${url.origin}${url.pathname} returned a body that is not JSON: ${text.slice(0, 200)}` };
  }

  const envelope = asRecord(parsed);
  if (envelope === undefined) {
    return { ok: false, error: `${url.origin}${url.pathname} returned a body that is not a JSON object` };
  }
  // The error object Elasticsearch can wrap in a body, checked before `hits`: a body
  // that carries an error and no hits is a failed search, and reading `hits` first
  // would report it as an empty window. Defensive rather than reproduced -- every
  // rejected search this module knows of answers with a 4xx, which the branch above
  // catches -- and written as the defence it is.
  if (envelope['error'] !== undefined) {
    const error = asRecord(envelope['error']);
    const type = typeof error?.['type'] === 'string' ? error['type'] : 'unknown';
    const reason = typeof error?.['reason'] === 'string' ? error['reason'] : 'no reason given';
    return { ok: false, error: `the search failed (${type}): ${reason}` };
  }

  const hits = asRecord(envelope['hits']);
  if (hits === undefined) {
    return { ok: false, error: `${url.origin}${url.pathname} returned no \`hits\` block` };
  }
  const list = hits['hits'];
  if (!Array.isArray(list)) {
    return { ok: false, error: "the response's `hits.hits` is not an array" };
  }

  const total = totalOf(hits['total']);
  if (typeof total === 'string') return { ok: false, error: total };

  const shards = asRecord(envelope['_shards']);
  const failed = shards?.['failed'];
  const partial = {
    // Only a literal `true` is a verdict. A cluster that wrote a string here is a
    // response this module does not understand, and reading it as "timed out" would
    // report a parse failure as a fact about the search.
    timedOut: envelope['timed_out'] === true,
    failedShards: typeof failed === 'number' && failed > 0 ? failed : 0,
  };

  const signals: TelemetrySignal[] = [];
  const quarantine: ElasticsearchQuarantineRecord[] = [];

  list.forEach((rawHit, hitIndex) => {
    const record = asRecord(rawHit);
    const source = asRecord(record?.['_source']);
    if (source === undefined) {
      quarantine.push({
        index: hitIndex,
        reason: 'hit has no `_source` object, which is where the declaration says the fields live',
        record: summarize(rawHit),
      });
      return;
    }

    const serviceName = source[fields.service];
    if (typeof serviceName !== 'string' || serviceName === '') {
      quarantine.push({
        index: hitIndex,
        reason: `hit carries no non-empty string in the declared service field '${fields.service}'`,
        record: summarize(rawHit),
      });
      return;
    }

    const millis = timestampOf(source[fields.timestamp], fields.timestamp, timestampFormat);
    if (typeof millis === 'string') {
      quarantine.push({ index: hitIndex, reason: millis, record: summarize(rawHit) });
      return;
    }

    const message = source[fields.message];
    if (typeof message !== 'string') {
      quarantine.push({
        index: hitIndex,
        reason: `hit carries no string in the declared message field '${fields.message}': ${JSON.stringify(message)}`,
        record: summarize(rawHit),
      });
      return;
    }

    const payload: LogPayload = { kind: 'log', body: message };
    const signal: TelemetrySignal = {
      irVersion: IR_VERSION,
      // Only the service, and not the rest of the document: see the header.
      resource: { 'service.name': serviceName },
      timestamp: new Date(millis).toISOString(),
      rawOffsetMinutes: 0,
      signal: 'log',
      payload,
      // The message, the timestamp and the service came off the wire as they are. The
      // document's other fields are deliberately absent rather than absent by
      // omission: `resource` holds identity, and a document is not an identity.
      provenance: {
        'payload.body': { source: 'direct' },
        timestamp: { source: 'direct' },
        'resource.service.name': { source: 'direct' },
      },
    };
    signals.push(telemetrySignalSchema.parse(signal) as TelemetrySignal);
  });

  return { ok: true, signals, quarantine, ...(total !== undefined ? { total } : {}), partial };
}
