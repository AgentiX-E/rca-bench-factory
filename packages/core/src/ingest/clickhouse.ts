/**
 * Pull rows from a ClickHouse HTTP endpoint and map them to IR signals.
 *
 * ## The reason this one was declared impossible, and where it breaks
 *
 * The `clickhouse` row in `backends.ts` was the first of the six whose reason is an
 * *argument* rather than a claim about the wire format:
 *
 * > the ClickHouse HTTP interface executes a SQL statement the caller writes and
 * > returns it in whichever format was asked for, so supporting it means either fixing
 * > a schema this project does not own or accepting arbitrary SQL -- the second of
 * > which would make the ingest path untyped
 *
 * Both horns are real. The second is a genuine objection: an ingest path that emits
 * whatever a statement happens to return is not typed. What the reason did not account
 * for is that **ClickHouse types the result it returns**. The `JSON` format answers
 * with a `meta` block carrying every column's own type, so arbitrary SQL does not
 * produce an arbitrary shape -- the caller declares which columns hold the timestamp,
 * the message and the service, and this module *checks that declaration against the
 * backend's typing* rather than trusting it.
 *
 * That is what this reader has and the four before it did not. The Loki, Elasticsearch
 * and Kubernetes readers each had to believe a declaration on faith: `serviceLabel`,
 * `timestampFormat` and `timestampField` were the caller's word alone, and the only
 * thing that could contradict them was a row that failed to parse. Here a declaration
 * that contradicts `meta` is refused by name, before a single row is read. The
 * caller's SQL stays arbitrary and the ingest path stays typed, because the contract
 * is the declaration and the backend is the witness.
 *
 * ## What was measured, and against what
 *
 * Unlike the four readers before it, this one was pointed at a real deployment: a
 * `ClickHouse 24.3.4.147` server was started and driven over HTTP, and every fact
 * asserted in `test/clickhouse.test.ts` is a copy of what it sent. Those that changed
 * the design:
 *
 * | measured | consequence |
 * | --- | --- |
 * | a rejected query answers `HTTP 404` with `{"meta":[],"data":[],"rows":0,"exception":"Code: 47. …"}` | a failure is shaped exactly like an empty window, so `exception` is read before `data` |
 * | a `DateTime64(3)` renders as `2023-11-14 22:13:20.123` -- no `T`, no offset, no zone | the reader sends `date_time_output_format=iso`, which renders `2023-11-14T14:13:20.123Z`, and quarantines anything it cannot place |
 * | `session_timezone=UTC` changes `timezone()` **and the `X-ClickHouse-Timezone` header** but **not** that rendering | the header is not the authority for the value, so the reader never uses it |
 * | an explicit `FORMAT` in the statement wins over `default_format` | a non-JSON body is a named diagnosis rather than a parse error |
 * | 64-bit integers arrive **quoted** (`"1700000000123"`, `"9007199254740993"`) | the value may be a string, and reading it through `Number` undoes the backend's own protection |
 * | `max_result_rows=1&result_overflow_mode=break` returned all five rows of `numbers(5)` | the reader cannot bound the query, so it bounds what it emits and says that it did |
 * | `rows_before_limit_at_least` appears when the statement carries a `LIMIT` | the count is reported with its relation |
 *
 * ## What it does not do
 *
 * It does not parse SQL, does not copy a row's other columns into `resource` (an
 * arbitrary statement has arbitrary columns, and copying them would invent a
 * per-query convention -- the very defect the registry's reason was about), and never
 * sets a severity: ClickHouse has no name convention for a level column and its values
 * are not the vocabulary the IR carries. It also does not retry, for the reason
 * `prometheus.ts` gives.
 */

import { telemetrySignalSchema } from '../ir/schema.js';
import { IR_VERSION, type LogPayload, type TelemetrySignal } from '../ir/types.js';

/** Default bound on a single request, in milliseconds. */
export const CLICKHOUSE_DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The units an epoch-valued timestamp column can be counted in.
 *
 * Closed, and required whenever `meta` types the column as a number: the digits of a
 * `UInt64` are a count, and the declaration is the only thing that says what they
 * count. Nothing here is defaulted -- guessing `seconds` is the classic way to place a
 * row fifty years from where it belongs.
 */
export const CLICKHOUSE_TIMESTAMP_UNITS = [
  'seconds',
  'milliseconds',
  'microseconds',
  'nanoseconds',
] as const;

export type ClickHouseTimestampUnit = (typeof CLICKHOUSE_TIMESTAMP_UNITS)[number];

/** A row the puller could not turn into a signal, and why. */
export interface ClickHouseQuarantineRecord {
  /** Index of the row in the result's `data` array. */
  index: number;
  reason: string;
  /** The offending row, truncated. */
  record: string;
}

/** What the backend said about the page, as distinct from what it returned. */
export interface ClickHousePage {
  /** The count the envelope reported. */
  rows: number;
  /** How many of those became signals. */
  kept: number;
  /** True when the declared `limit` cut the page short -- set by this module, visibly. */
  truncated: boolean;
  /** `rows_before_limit_at_least`, when the statement carried a `LIMIT`. */
  atLeast?: number;
  /** `statistics.rows_read`: how much of the table the answer came from. */
  rowsRead?: number;
}

export type ClickHousePullResult =
  | {
      ok: true;
      signals: TelemetrySignal[];
      quarantine: ClickHouseQuarantineRecord[];
      page: ClickHousePage;
    }
  | { ok: false; error: string };

export interface ClickHousePullOptions {
  /** Base URL of the HTTP interface, e.g. `http://127.0.0.1:8123`. */
  baseUrl: string;
  /**
   * The statement to run.
   *
   * Free text on purpose. The reason this backend was declared unsupported treats a
   * caller-written statement as the obstacle; it is the interface. What keeps the
   * ingest path typed is the *result* contract below, checked against the `meta` block
   * the backend returns, not the shape of the statement.
   */
  query: string;
  /** Which column holds which part of a signal. Checked against `meta`, not trusted. */
  columns: {
    timestamp: string;
    message: string;
    service: string;
  };
  /**
   * The unit of the timestamp column, when `meta` types it as a number.
   *
   * Required for numeric columns and **refused** for date-time ones: a date-time
   * column is rendered as an absolute instant, and a unit beside it would be a second,
   * contradictory reading of the same digits.
   */
  timestampUnit?: ClickHouseTimestampUnit;
  /**
   * Upper bound on the signals this module emits.
   *
   * Required, and enforced here rather than on the wire: `max_result_rows` was measured
   * as accepted by this server and then ignored, and this module does not parse SQL to
   * find a caller's `LIMIT`. Truncation is reported in `page.truncated`, because a
   * truncated window that looks complete is the failure mode of pass 27.
   */
  limit: number;
  /** ClickHouse user. Sent as a header, never as a query parameter. */
  user: string;
  /** Password, when the server has one. Absent and empty are different: absent omits the header. */
  password?: string;
  /** Database to run the statement against, when the statement does not name one. */
  database?: string;
  /** Overrides {@link CLICKHOUSE_DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/** Date-time base types, unwrapped: rendered as an absolute instant under `iso`. */
const DATE_TIME_BASES = new Set(['DateTime', 'DateTime64']);

/** Date base types: a day, not an instant, so they cannot carry a timestamp. */
const DATE_BASES = new Set(['Date', 'Date32']);

/** Integer base types: the digits are exact and the wire quotes the 64-bit ones. */
const INTEGER_BASES = new Set([
  'UInt8',
  'UInt16',
  'UInt32',
  'UInt64',
  'Int8',
  'Int16',
  'Int32',
  'Int64',
]);

/** The one float base this module accepts, for the reason {@link readTimestamp} gives. */
const FLOAT_BASE = 'Float64';

/** Type-name wrappers that do not change what the value is. */
const WRAPPERS = ['Nullable', 'LowCardinality'];

/** Multipliers that take a numeric unit to milliseconds, exactly. */
const TO_MILLIS: Record<ClickHouseTimestampUnit, { mul: bigint; div: bigint }> = {
  seconds: { mul: 1000n, div: 1n },
  milliseconds: { mul: 1n, div: 1n },
  microseconds: { mul: 1n, div: 1000n },
  nanoseconds: { mul: 1n, div: 1_000_000n },
};

/** The same table for a `Float64`, where the arithmetic cannot be exact anyway. */
const FLOAT_FACTOR: Record<ClickHouseTimestampUnit, number> = {
  seconds: 1000,
  milliseconds: 1,
  microseconds: 0.001,
  nanoseconds: 0.000001,
};

/**
 * An absolute ISO-8601 instant: a `T`, and a zone.
 *
 * Deliberately stricter than `Date.parse`, which accepts a zone-less wall clock and
 * reads it in the *process's* timezone. The whole point of asking for
 * `date_time_output_format=iso` is that the value carries its own offset, so a value
 * without one is a value this reader could place only by assuming.
 */
const ABSOLUTE_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Strip `Nullable(…)` / `LowCardinality(…)`, and the parameters a base type takes. */
function baseType(type: string): string {
  let name = type.trim();
  for (;;) {
    const wrapper = WRAPPERS.find((one) => name.startsWith(`${one}(`) && name.endsWith(')'));
    if (wrapper === undefined) break;
    name = name.slice(wrapper.length + 1, -1).trim();
  }
  return name.replace(/\(.*$/, '').trim();
}

/**
 * One JSON value as a short string, for a quarantine record.
 *
 * `JSON.stringify` answers `undefined` -- not a string -- for a value that is not
 * JSON, which is what a missing column reads as, so the fallback is the `??` rather
 * than a `catch`. The `catch` that was here first could not be reached: everything
 * this function is given came out of `JSON.parse`.
 */
function summarize(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A non-negative integer, or `undefined`. */
function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * What the backend's type says a timestamp column's values are.
 *
 * Three readings and no more, because {@link classifyTimestamp} refuses every type it
 * cannot place.
 *
 * The unit lives *inside* the numeric readings rather than beside them, and that is
 * deliberate: an optional unit here would need a default for the two arms that
 * require one, the default would be a guess (`milliseconds`), and it would be
 * unreachable -- a mutation battery measured exactly that, four arms no test could
 * reach. Carrying it in the type makes the invariant the compiler's instead of a
 * fallback's.
 */
type TimestampReading =
  | { kind: 'datetime' }
  | { kind: 'integer'; unit: ClickHouseTimestampUnit }
  | { kind: 'float64'; unit: ClickHouseTimestampUnit };

/**
 * Read one timestamp value, in the reading the backend's own type selected.
 *
 * Returns epoch milliseconds, or a reason string. Both failure modes of the unit
 * arithmetic are measured in the test file rather than described: a nanosecond epoch
 * read through `Number` lands a millisecond late, and a 64-bit integer read as a JSON
 * number has already lost digits before this function sees it.
 */
function readTimestamp(value: unknown, reading: TimestampReading): number | string {
  if (value === null || value === undefined) {
    return 'the timestamp column is null for this row, and null is not an instant';
  }

  if (reading.kind === 'datetime') {
    if (typeof value !== 'string') {
      return `the backend typed the timestamp column as a date-time but sent ${typeof value}`;
    }
    if (!ABSOLUTE_INSTANT.test(value)) {
      return (
        `the timestamp is ${JSON.stringify(value)}, which carries no zone; this reader asks for ` +
        `date_time_output_format=iso (an absolute instant) and will not assume a zone for a wall clock`
      );
    }
    return Date.parse(value);
  }

  if (reading.kind === 'integer') {
    let exact: bigint;
    if (typeof value === 'string') {
      // Measured: the backend quotes 64-bit integers, because a double cannot hold
      // one. A string that is not a whole number is not a wrapped integer either.
      if (!/^-?\d+$/.test(value)) {
        return `the timestamp is ${JSON.stringify(value)}, which is not a whole number of ${reading.unit}`;
      }
      exact = BigInt(value);
    } else if (typeof value === 'number' && Number.isInteger(value)) {
      if (!Number.isSafeInteger(value)) {
        return (
          `the timestamp arrived as the JSON number ${value}, which no longer holds the digits the ` +
          `backend wrote; this backend quotes 64-bit integers unless it was asked not to`
        );
      }
      exact = BigInt(value);
    } else {
      return (
        `the backend typed the timestamp column as an integer but sent ${summarize(value)}, which ` +
        `is not a whole number of ${reading.unit}`
      );
    }
    const { mul, div } = TO_MILLIS[reading.unit];
    // Integer division truncates toward zero, so the IR instant is never *later* than
    // the row the backend wrote.
    return Number((exact * mul) / div);
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `the backend typed the timestamp column Float64 but sent ${summarize(value)}`;
  }
  // Rounded rather than truncated, unlike the integer path: the value is already an
  // approximation, so the nearest millisecond is the honest reading of it.
  return Math.round(value * FLOAT_FACTOR[reading.unit]);
}

/**
 * Decide whether a declared timestamp column can carry an instant, and say why not.
 *
 * This is the check the previous four readers had no way to make: the type comes from
 * the backend's own `meta` block, so a declaration that contradicts it is refused
 * rather than believed. It runs after the request -- there is no `meta` before one --
 * and refuses before any row is read.
 */
function classifyTimestamp(
  type: string,
  column: string,
  unit: ClickHouseTimestampUnit | undefined,
): { reading: TimestampReading } | { problem: string } {
  const base = baseType(type);

  if (DATE_TIME_BASES.has(base)) {
    if (unit !== undefined) {
      return {
        problem:
          `the backend typed the timestamp column '${column}' as ${type}, which is an absolute ` +
          `instant, but a timestampUnit of '${unit}' was declared: a date-time column and an epoch ` +
          'are two different readings of the same digits, so this reader refuses to hold both',
      };
    }
    return { reading: { kind: 'datetime' } };
  }

  if (DATE_BASES.has(base)) {
    return {
      problem:
        `the backend typed the timestamp column '${column}' as ${type}, which is a calendar day ` +
        'rather than an instant: it has no time of day to place the row at',
    };
  }

  if (INTEGER_BASES.has(base) || base === FLOAT_BASE) {
    if (unit === undefined) {
      return {
        problem:
          `the backend typed the timestamp column '${column}' as ${type}, which is an epoch, so ` +
          'timestampUnit is required -- nothing else says whether those digits count seconds or ' +
          'nanoseconds',
      };
    }
    return {
      reading: base === FLOAT_BASE ? { kind: 'float64', unit } : { kind: 'integer', unit },
    };
  }

  if (base === 'Float32') {
    // Measured on a real server: `CAST(1700000000.5 AS Float32)` arrives as
    // `1700000000`, because the spacing of a Float32 at epoch-second magnitude is 128
    // seconds. Refusing it is not pedantry -- accepting it would silently place rows
    // minutes away from where they happened.
    return {
      problem:
        `the backend typed the timestamp column '${column}' as ${type}: at epoch magnitudes a ` +
        'Float32 has a resolution of about 128 seconds, which no row can be placed to',
    };
  }

  return {
    problem:
      `the backend typed the timestamp column '${column}' as ${type}, so this reader cannot read ` +
      'it as an instant; the column must be numeric or a date-time type',
  };
}

/** The metadata row for a column, or `undefined`. */
function metaTypeOf(meta: { name: string; type: string }[], column: string): string | undefined {
  return meta.find((entry) => entry.name === column)?.type;
}

function parseMeta(raw: unknown): { name: string; type: string }[] | string {
  if (!Array.isArray(raw)) return 'the envelope\'s "meta" is not an array';
  const entries: { name: string; type: string }[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (record === undefined || typeof record['name'] !== 'string' || typeof record['type'] !== 'string') {
      return '"meta" carries an entry that is not a {name, type} pair';
    }
    entries.push({ name: record['name'], type: record['type'] });
  }
  return entries;
}

export async function pullClickHouseLogs(
  options: ClickHousePullOptions,
): Promise<ClickHousePullResult> {
  const { baseUrl, query, columns, timestampUnit, limit, user, password, database } = options;
  const timeoutMs = options.timeoutMs ?? CLICKHOUSE_DEFAULT_TIMEOUT_MS;

  if (baseUrl.trim() === '') return { ok: false, error: 'baseUrl is required' };
  if (query.trim() === '') return { ok: false, error: 'query is required' };
  if (columns.timestamp.trim() === '') return { ok: false, error: 'columns.timestamp is required' };
  if (columns.message.trim() === '') return { ok: false, error: 'columns.message is required' };
  if (columns.service.trim() === '') return { ok: false, error: 'columns.service is required' };
  if (!Number.isInteger(limit) || limit <= 0) {
    // An unbounded page is not the hazard here -- the backend has its own -- but a
    // limit that is not a positive integer is a declaration this reader cannot honour,
    // and honouring it silently as "no bound" is the kind of default this campaign
    // keeps finding.
    return { ok: false, error: `limit must be a positive integer, got ${JSON.stringify(limit)}` };
  }
  if (user.trim() === '') return { ok: false, error: 'user is required' };
  if (timestampUnit !== undefined && !CLICKHOUSE_TIMESTAMP_UNITS.includes(timestampUnit)) {
    return {
      ok: false,
      error: `timestampUnit must be one of ${CLICKHOUSE_TIMESTAMP_UNITS.join(', ')}, got ${JSON.stringify(timestampUnit)}`,
    };
  }

  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/`);
  // Both settings are this reader's decisions, and both come from measurements: `JSON`
  // because it is the format that carries `meta`, and `iso` because the default
  // renders a date-time as a zone-less wall clock.
  url.searchParams.set('default_format', 'JSON');
  url.searchParams.set('date_time_output_format', 'iso');
  if (database !== undefined && database.trim() !== '') url.searchParams.set('database', database);

  const headers: Record<string, string> = {
    accept: 'application/json',
    // Credentials in headers, never in the URL: a URL is what lands in a proxy log.
    'X-ClickHouse-User': user,
  };
  if (password !== undefined) headers['X-ClickHouse-Key'] = password;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let status: number;
  let body: string;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: query,
      signal: controller.signal,
    });
    status = response.status;
    body = await response.text();
  } catch (error) {
    // `String` rather than `error.message`: a `catch` binding is `unknown`, so reading
    // a field off it needs a conditional, and the arm for a thrown non-Error is one no
    // `fetch` can produce. `String` renders an Error as `TypeError: fetch failed`,
    // which names the class as well.
    return {
      ok: false,
      error: `the ClickHouse endpoint at ${baseUrl} did not answer: ${String(error)} (timeout ${timeoutMs}ms)`,
    };
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = undefined;
  }

  const envelope = asRecord(parsed);
  if (envelope === undefined) {
    // Measured: an explicit `FORMAT` in the statement wins over `default_format`, so
    // the body is whatever the caller asked for and there is no `meta` to check
    // against. Naming that is the difference between a five-second fix and a
    // packet-capture.
    return {
      ok: false,
      error:
        `the endpoint answered ${status} with a body that is not the JSON object this reader asked ` +
        'for; a FORMAT clause inside the statement overrides the default_format=JSON this reader ' +
        `sends, so a statement carrying one has to drop it (first 120 bytes: ${summarize(body.slice(0, 120))})`,
    };
  }

  // Before everything else, and before the status is even considered for its own sake:
  // measured, a rejected statement arrives as HTTP 404 carrying
  // `{"meta":[],"data":[],"rows":0,"exception":"Code: 47. …"}` -- an envelope shaped
  // exactly like a query that matched nothing. Reading `data` first reports a quiet
  // window where the backend reported a failure.
  const exception = envelope['exception'];
  if (typeof exception === 'string' && exception !== '') {
    return { ok: false, error: `ClickHouse refused the statement: ${exception}` };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, error: `the endpoint answered ${status}: ${summarize(body.slice(0, 200))}` };
  }

  const meta = parseMeta(envelope['meta']);
  if (typeof meta === 'string') return { ok: false, error: meta };
  if (meta.length === 0) {
    return { ok: false, error: 'the result carries no columns, so there is nothing to read' };
  }

  for (const [role, column] of Object.entries(columns)) {
    if (metaTypeOf(meta, column) === undefined) {
      return {
        ok: false,
        error:
          `the declaration names '${column}' as the ${role} column, but the result carries ` +
          `${meta.map((entry) => `'${entry.name}'`).join(', ')}`,
      };
    }
  }

  const timestampType = metaTypeOf(meta, columns.timestamp) as string;
  const classified = classifyTimestamp(timestampType, columns.timestamp, timestampUnit);
  if ('problem' in classified) return { ok: false, error: classified.problem };
  const reading = classified.reading;

  const data = envelope['data'];
  if (!Array.isArray(data)) return { ok: false, error: 'the envelope\'s "data" is not an array' };
  const rows = count(envelope['rows']);
  if (rows === undefined) {
    return { ok: false, error: 'the envelope reports no row count, so its "data" cannot be read as a page' };
  }

  const signals: TelemetrySignal[] = [];
  const quarantine: ClickHouseQuarantineRecord[] = [];

  data.slice(0, limit).forEach((item, index) => {
    const record = asRecord(item);
    if (record === undefined) {
      quarantine.push({ index, reason: 'the row is not an object', record: summarize(item) });
      return;
    }

    const serviceName = record[columns.service];
    if (typeof serviceName !== 'string' || serviceName === '') {
      quarantine.push({
        index,
        reason: `'${columns.service}' is not a non-empty string, so there is no service to attach this row to`,
        record: summarize(item),
      });
      return;
    }

    const message = record[columns.message];
    if (typeof message !== 'string') {
      quarantine.push({
        index,
        // Measured: an `Array` and a `Map` column arrive as a JSON array and object, so
        // this is not a hypothetical branch -- stringifying them would write JSON into
        // a log body, which is a shape the IR's `body` is not for.
        reason: `'${columns.message}' is not a string (${summarize(message)}), so it is not a log body`,
        record: summarize(item),
      });
      return;
    }

    const millis = readTimestamp(record[columns.timestamp], reading);
    if (typeof millis === 'string') {
      quarantine.push({ index, reason: millis, record: summarize(item) });
      return;
    }

    const payload: LogPayload = { kind: 'log', body: message };
    const signal: TelemetrySignal = {
      irVersion: IR_VERSION,
      resource: { 'service.name': serviceName },
      timestamp: new Date(millis).toISOString(),
      rawOffsetMinutes: 0,
      signal: 'log',
      payload,
      // The row, its instant and its service come off the wire as they are. The
      // epoch-to-millisecond step is a unit change, and its result is what the
      // backend's own digits define, so nothing here is `derived`.
      provenance: {
        'payload.body': { source: 'direct' },
        timestamp: { source: 'direct' },
        'resource.service.name': { source: 'direct' },
      },
    };
    signals.push(telemetrySignalSchema.parse(signal) as TelemetrySignal);
  });

  const atLeast = count(envelope['rows_before_limit_at_least']);
  const statistics = asRecord(envelope['statistics']);
  const rowsRead = count(statistics?.['rows_read']);

  const page: ClickHousePage = {
    rows,
    kept: signals.length,
    truncated: data.length > limit,
  };
  if (atLeast !== undefined) page.atLeast = atLeast;
  if (rowsRead !== undefined) page.rowsRead = rowsRead;

  return { ok: true, signals, quarantine, page };
}
