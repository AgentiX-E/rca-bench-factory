import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CLICKHOUSE_DEFAULT_TIMEOUT_MS,
  CLICKHOUSE_TIMESTAMP_UNITS,
  pullClickHouseLogs,
} from '../src/ingest/clickhouse.js';

/**
 * The ClickHouse puller, driven over a real socket.
 *
 * ## The claim this file does and does not make
 *
 * Every case below runs against `node:http` on `127.0.0.1`, so this file is evidence
 * that the reader implements the documented wire format. It is *not* the evidence
 * that a ClickHouse answered it -- that is a separate measurement, and unlike the
 * four readers before it this one was earned: a real `ClickHouse 24.3.4.147` server
 * was started and every fixture below is a byte-for-byte copy of what it sent. The
 * settings the measurement depended on are pinned by a test, so an edit that changes
 * them re-opens the measurement rather than silently invalidating it.
 *
 * ## Why the registry's reason was a dilemma, and where the dilemma breaks
 *
 * The `clickhouse` row said supporting this backend means "either fixing a schema
 * this project does not own or accepting arbitrary SQL -- the second of which would
 * make the ingest path untyped". Both horns are real, and the reason is the first in
 * this registry whose *form* is an argument rather than a claim about what a caller
 * would have to supply.
 *
 * What it did not account for is that **ClickHouse types the result it returns**. The
 * `JSON` format answers with a `meta` block giving every column's own type, so
 * arbitrary SQL does not produce an arbitrary shape: the caller declares which
 * columns hold the timestamp, the message and the service, and the reader *checks
 * that declaration against the backend's typing* instead of trusting it. That is what
 * this reader has and the four before it did not -- Loki, Elasticsearch and
 * Kubernetes all had to believe the caller's `encoding`, `format` and `timestampField`
 * on faith. Here a declaration that contradicts the backend is refused, by name,
 * before a single row is read.
 */

const servers: Server[] = [];

afterAll(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
});

/** A server that answers whatever the case wants, and records what it was asked. */
async function serve(
  reply: (request: { url: string; method: string; body: string; headers: Record<string, string> }) =>
    | { status: number; body: string; headers?: Record<string, string> }
    | 'never',
): Promise<{
  baseUrl: string;
  requests: { url: string; method: string; body: string; headers: Record<string, string> }[];
}> {
  const requests: { url: string; method: string; body: string; headers: Record<string, string> }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers[name.toLowerCase()] = value;
      }
      const request = {
        url: req.url ?? '',
        method: req.method ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
        headers,
      };
      requests.push(request);
      const answer = reply(request);
      if (answer === 'never') return; // accepts the connection and says nothing
      res.writeHead(answer.status, { 'content-type': 'application/json', ...answer.headers });
      res.end(answer.body);
    });
  });
  servers.push(server);
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the fixture did not bind');
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests };
}

/** The declaration every case starts from, unless it is the thing under test. */
const PULL = {
  query: 'SELECT ts, service_name, body FROM otel_logs ORDER BY ts LIMIT 100',
  columns: { timestamp: 'ts', message: 'body', service: 'service_name' },
  limit: 100,
  user: 'default',
} as const;

/**
 * The envelope, in the shape the real server sends it.
 *
 * Measured, not recalled: `meta` carries `{name, type}` per column, `data` is an array
 * of row objects keyed by column name, `rows` is the count, and `statistics` carries
 * `elapsed`, `rows_read` and `bytes_read`.
 */
function jsonEnvelope(
  meta: [name: string, type: string][],
  data: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    meta: meta.map(([name, type]) => ({ name, type })),
    data,
    rows: data.length,
    statistics: { elapsed: 0.001238439, rows_read: data.length, bytes_read: 136 },
    ...extra,
  });
}

/** The three columns of a log table, as the server typed them. */
const LOG_META: [string, string][] = [
  ['ts', 'DateTime64(3)'],
  ['service_name', 'LowCardinality(String)'],
  ['body', 'String'],
];

/** One row that satisfies the declaration, with the fields a case varies. */
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: '2023-11-14T14:13:20.123Z',
    service_name: 'checkout',
    body: 'upstream 10.20.30.40 refused',
    ...overrides,
  };
}

describe('the request the reader sends', () => {
  it('asks for the JSON format and an absolute datetime, and puts the statement in the body', async () => {
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row()]) }));
    await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    const request = stub.requests[0];
    expect(request?.method).toBe('POST');
    // The statement goes in the body rather than the URL: it is the part that is
    // arbitrarily long and arbitrarily quoted, and a URL is what ends up in logs.
    expect(request?.body).toBe(PULL.query);
    const url = new URL(request?.url ?? '', 'http://fixture.invalid');
    // Both settings are decisions this reader makes, and both are pinned by this
    // assertion because the server measurement rests on them (see the file header).
    expect(url.searchParams.get('default_format')).toBe('JSON');
    expect(url.searchParams.get('date_time_output_format')).toBe('iso');
  });

  it('sends the credentials as headers rather than as query parameters', async () => {
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row()]) }));
    await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL, password: 'sekret' });
    const request = stub.requests[0];
    expect(request?.headers['x-clickhouse-user']).toBe('default');
    expect(request?.headers['x-clickhouse-key']).toBe('sekret');
    // A password in a URL is a password in every proxy log between here and there.
    const url = new URL(request?.url ?? '', 'http://fixture.invalid');
    expect(url.searchParams.get('password')).toBeNull();
    expect(url.searchParams.get('user')).toBeNull();
    expect(request?.url).not.toContain('sekret');
  });

  it('omits the password header when the caller declared none', async () => {
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row()]) }));
    await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    // A server with no password must not be sent an empty one: `undefined` and `''`
    // are the same string on the wire, so the only way to say the caller declared
    // nothing is to leave the header out.
    expect(stub.requests[0]?.headers['x-clickhouse-key']).toBeUndefined();
    expect(stub.requests[0]?.headers['x-clickhouse-user']).toBe('default');
  });

  it('names the database when the caller declared one, and not otherwise', async () => {
    const withDb = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row()]) }));
    await pullClickHouseLogs({ baseUrl: withDb.baseUrl, ...PULL, database: 'otel' });
    expect(new URL(withDb.requests[0]?.url ?? '', 'http://fixture.invalid').searchParams.get('database')).toBe('otel');

    const without = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row()]) }));
    await pullClickHouseLogs({ baseUrl: without.baseUrl, ...PULL });
    expect(new URL(without.requests[0]?.url ?? '', 'http://fixture.invalid').searchParams.get('database')).toBeNull();
  });

  it('tolerates a trailing slash on the base URL', async () => {
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row()]) }));
    const result = await pullClickHouseLogs({ baseUrl: `${stub.baseUrl}/`, ...PULL });
    expect(result.ok).toBe(true);
    expect(new URL(stub.requests[0]?.url ?? '', 'http://fixture.invalid').pathname).toBe('/');
  });

  it('refuses a declaration it could not turn into a request', async () => {
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row()]) }));
    const cases: [Partial<Parameters<typeof pullClickHouseLogs>[0]>, string][] = [
      [{ baseUrl: '' }, 'baseUrl'],
      [{ query: '   ' }, 'query'],
      [{ columns: { timestamp: 'ts', message: 'body', service: '' } }, 'service'],
      [{ columns: { timestamp: '', message: 'body', service: 'service_name' } }, 'timestamp'],
      [{ columns: { timestamp: 'ts', message: '  ', service: 'service_name' } }, 'message'],
      [{ limit: 0 }, 'limit'],
      [{ limit: 1.5 }, 'limit'],
      [{ user: '' }, 'user'],
      [{ timestampUnit: 'fortnights' as never }, 'timestampUnit'],
    ];
    for (const [override, needle] of cases) {
      const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL, ...override });
      if (result.ok) throw new Error(`expected a refusal for ${JSON.stringify(override)}`);
      expect(result.error.toLowerCase()).toContain(needle.toLowerCase());
    }
    expect(stub.requests).toHaveLength(0);
  });
});

describe('the timestamp, read as the backend typed it', () => {
  it('reads a date-time column as an absolute instant', async () => {
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row()]) }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.timestamp).toBe('2023-11-14T14:13:20.123Z');
    expect(result.signals[0]?.payload).toEqual({ kind: 'log', body: 'upstream 10.20.30.40 refused' });
    expect(result.signals[0]?.resource['service.name']).toBe('checkout');
  });

  it('quarantines the same value rendered without a zone, which is what the default setting produces', async () => {
    // The measured trap: a plain `DateTime64(3)` renders as `2023-11-14 22:13:20.123`
    // -- no `T`, no offset, no zone. That string is not an instant; it is a wall clock
    // whose meaning lives in the server's configuration. The reader asks for `iso` so
    // it never sees one, and refuses what it cannot place rather than guessing a zone.
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(LOG_META, [row({ ts: '2023-11-14 22:13:20.123' })]),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]?.reason).toContain('date_time_output_format=iso');
    expect(result.quarantine[0]?.index).toBe(0);
  });

  it('refuses a DateTime column declared with a numeric unit, because the backend typed it as a date', async () => {
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row()]) }));
    const result = await pullClickHouseLogs({
      baseUrl: stub.baseUrl,
      ...PULL,
      timestampUnit: 'seconds',
    });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('DateTime64(3)');
    expect(result.error).toContain('seconds');
    // One request, and that is the point rather than a leak: the check needs the
    // backend's own `meta` block to have an opinion about, so it can only run after
    // the backend has answered. This is the difference between this reader and the
    // four before it -- their declarations were only ever checked against a row.
    expect(stub.requests).toHaveLength(1);
  });

  it('requires a unit when the backend typed the column as a number', async () => {
    // A `UInt64` epoch is a count, and the declaration is the only thing that says
    // what it counts. This is the check that replaces the other readers' faith.
    const meta: [string, string][] = [['ts_ms', 'UInt64'], ['service_name', 'String'], ['body', 'String']];
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [{ ts_ms: '1699971200123', service_name: 'checkout', body: 'refused' }]),
    }));
    const columns = { timestamp: 'ts_ms', message: 'body', service: 'service_name' };
    const missing = await pullClickHouseLogs({ baseUrl: stub.baseUrl, query: 'SELECT 1', columns, limit: 10, user: 'default' });
    if (missing.ok) throw new Error('expected a refusal');
    expect(missing.error).toContain('timestampUnit');

    const given = await pullClickHouseLogs({
      baseUrl: stub.baseUrl,
      query: 'SELECT 1',
      columns,
      limit: 10,
      user: 'default',
      timestampUnit: 'milliseconds',
    });
    if (!given.ok) throw new Error(`expected success: ${given.error}`);
    expect(given.signals[0]?.timestamp).toBe('2023-11-14T14:13:20.123Z');
  });

  it('reads a 64-bit integer that the backend quoted, and one it did not', async () => {
    // Measured: ClickHouse quotes 64-bit integers in JSON by default, because a double
    // cannot hold one -- `9007199254740993` came back as the string `"…993"`. A reader
    // that required a JSON number would refuse valid rows; one that read a quoted value
    // through `Number` would undo the backend's own protection.
    const meta: [string, string][] = [['ts_ms', 'UInt64'], ['service_name', 'String'], ['body', 'String']];
    const quoted = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [{ ts_ms: '1699971200123', service_name: 'checkout', body: 'a' }]),
    }));
    const asString = await pullClickHouseLogs({
      baseUrl: quoted.baseUrl,
      query: 'SELECT 1',
      columns: { timestamp: 'ts_ms', message: 'body', service: 'service_name' },
      limit: 10,
      user: 'default',
      timestampUnit: 'milliseconds',
    });
    if (!asString.ok) throw new Error('expected success');
    expect(asString.signals[0]?.timestamp).toBe('2023-11-14T14:13:20.123Z');

    const numeric = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [{ ts_ms: 1699971200123, service_name: 'checkout', body: 'a' }]),
    }));
    const asNumber = await pullClickHouseLogs({
      baseUrl: numeric.baseUrl,
      query: 'SELECT 1',
      columns: { timestamp: 'ts_ms', message: 'body', service: 'service_name' },
      limit: 10,
      user: 'default',
      timestampUnit: 'milliseconds',
    });
    if (!asNumber.ok) throw new Error('expected success');
    expect(asNumber.signals[0]?.timestamp).toBe('2023-11-14T14:13:20.123Z');
  });

  it('holds a nanosecond epoch exactly, and exhibits what reading it as a double would do', async () => {
    const meta: [string, string][] = [['ts_ns', 'UInt64'], ['service_name', 'String'], ['body', 'String']];
    const stub = await serve(() => ({
      status: 200,
      // The digits say ...123999999, which truncated to milliseconds is ...123.
      body: jsonEnvelope(meta, [{ ts_ns: '1699971200123999999', service_name: 'checkout', body: 'a' }]),
    }));
    const result = await pullClickHouseLogs({
      baseUrl: stub.baseUrl,
      query: 'SELECT 1',
      columns: { timestamp: 'ts_ns', message: 'body', service: 'service_name' },
      limit: 10,
      user: 'default',
      timestampUnit: 'nanoseconds',
    });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.timestamp).toBe('2023-11-14T14:13:20.123Z');
    // The control, side by side: the same digits through `Number` and a float
    // division round up, and the row would be reported one millisecond later than the
    // backend wrote it. Both sides are asserted so the difference is the evidence.
    const viaDouble = Math.floor(Number('1699971200123999999') / 1e6);
    expect(new Date(viaDouble).toISOString()).toBe('2023-11-14T14:13:20.124Z');
  });

  it('quarantines a null timestamp rather than placing the row in 1970', async () => {
    const meta: [string, string][] = [['ts', 'Nullable(DateTime64(3))'], ['service_name', 'String'], ['body', 'String']];
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [{ ts: null, service_name: 'checkout', body: 'a' }], {}),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine[0]?.reason).toContain('null');
  });

  it('quarantines a numeric timestamp that is not a whole number of units', async () => {
    const meta: [string, string][] = [['ts_ms', 'Int64'], ['service_name', 'String'], ['body', 'String']];
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [
        { ts_ms: 'not-a-number', service_name: 'checkout', body: 'a' },
        { ts_ms: '1.5', service_name: 'checkout', body: 'b' },
        { ts_ms: -1699971200123, service_name: 'checkout', body: 'c' },
      ]),
    }));
    const result = await pullClickHouseLogs({
      baseUrl: stub.baseUrl,
      query: 'SELECT 1',
      columns: { timestamp: 'ts_ms', message: 'body', service: 'service_name' },
      limit: 10,
      user: 'default',
      timestampUnit: 'milliseconds',
    });
    if (!result.ok) throw new Error('expected success');
    // A negative epoch is an instant before 1970, and an `Int64` column may hold one:
    // the wire is not the place to decide that no telemetry predates the epoch.
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.timestamp).toBe('1916-02-18T09:46:39.877Z');
    expect(result.quarantine).toHaveLength(2);
    expect(result.quarantine[0]?.reason).toContain('not a whole number');
    expect(result.quarantine.map((q) => q.index)).toEqual([0, 1]);
  });

  it('accepts a fractional float timestamp, because a Float64 column is not an integer', async () => {
    const meta: [string, string][] = [['ts_s', 'Float64'], ['service_name', 'String'], ['body', 'String']];
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [{ ts_s: 1699971200.123, service_name: 'checkout', body: 'a' }]),
    }));
    const result = await pullClickHouseLogs({
      baseUrl: stub.baseUrl,
      query: 'SELECT 1',
      columns: { timestamp: 'ts_s', message: 'body', service: 'service_name' },
      limit: 10,
      user: 'default',
      timestampUnit: 'seconds',
    });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.timestamp).toBe('2023-11-14T14:13:20.123Z');
  });
});

describe('the envelope, and what a failure looks like on this wire', () => {
  it('fails on a query the server rejected, which arrives as a well-formed empty result', async () => {
    // Measured, and this is the trap of the round: the server answers a failed query
    // with HTTP 404 and the body `{"meta":[],"data":[],"rows":0,"exception":"Code: 47.
    // …"}` -- an empty result set that is shaped exactly like a query that matched
    // nothing. A reader that reads `data` first reports a quiet window.
    const stub = await serve(() => ({
      status: 404,
      body: JSON.stringify({
        meta: [],
        data: [],
        rows: 0,
        statistics: { elapsed: 0.001, rows_read: 0, bytes_read: 0 },
        exception:
          "Code: 47. DB::Exception: Unknown expression identifier 'nosuchcol' in scope SELECT nosuchcol FROM otel_logs. (UNKNOWN_IDENTIFIER) (version 24.3.4.147 (official build))",
      }),
      headers: { 'x-clickhouse-exception-code': '47' },
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL, query: 'SELECT nosuchcol' });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('47');
    expect(result.error).toContain('UNKNOWN_IDENTIFIER');
  });

  it('still fails on an exception carried by a 200, because the status is not the only place it appears', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ meta: [], data: [], rows: 0, exception: 'Code: 241. DB::Exception: Memory limit exceeded' }),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('241');
  });

  it('treats an envelope with no exception as the empty window it is', async () => {
    // The control for the two above: the same shape *without* an exception is a real
    // answer, and the reader must not turn every empty result into a failure.
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, []) }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine).toEqual([]);
    expect(result.page.rows).toBe(0);
  });

  it('fails on a body that is not the JSON object, and names the statement-level FORMAT as the cause', async () => {
    // Measured: an explicit `FORMAT` in the statement wins over `default_format`, so a
    // caller who wrote one gets their own format back and this reader gets TabSeparated
    // text. The diagnostic has to say so, because the caller's next move is to delete
    // the clause rather than to look at the network.
    const stub = await serve(() => ({ status: 200, body: '1\n' }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL, query: 'SELECT 1 AS a FORMAT TabSeparated' });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('FORMAT');
    expect(result.error).toContain('default_format');
  });

  it('reports the page the caller got rather than pretending it is the window', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(LOG_META, [row(), row({ ts: '2023-11-14T14:14:00.000Z' })], {
        rows_before_limit_at_least: 2,
      }),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.page).toMatchObject({ rows: 2, kept: 2, truncated: false, atLeast: 2, rowsRead: 2 });
  });

  it('truncates at the declared limit and says that it did', async () => {
    // The reader cannot bound the query: `max_result_rows` was measured as accepted and
    // then ignored (five rows came back from `numbers(5)` with it set to one), and this
    // module does not parse SQL. So it bounds what it emits and reports the bound --
    // a truncated window that looks complete is the failure mode of pass 27.
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(LOG_META, [row(), row({ ts: '2023-11-14T14:14:00.000Z' })]),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL, limit: 1 });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(1);
    expect(result.page).toMatchObject({ rows: 2, kept: 1, truncated: true });
  });

  it('fails on an envelope whose parts are not the shapes this wire defines', async () => {
    const cases: [string, string][] = [
      ['{"meta":{}}', 'meta'],
      ['{"meta":[],"data":[]}', 'no columns'],
      ['{"meta":[{"name":"ts","type":"DateTime64(3)"},{"name":"service_name","type":"String"},{"name":"body","type":"String"}],"data":{}}', 'data'],
      ['{"meta":[{"name":"ts","type":"DateTime64(3)"},{"name":"service_name","type":"String"},{"name":"body","type":"String"}],"data":[]}', 'row count'],
      ['{"meta":[{"name":"ts","type":"DateTime64(3)"},{"name":"service_name","type":"String"},{"name":"body","type":"String"}],"data":[],"rows":"2"}', 'row count'],
      ['{"meta":{"ts":"DateTime64(3)"},"data":[],"rows":0}', 'meta'],
      ['[]', 'object'],
      ['not json at all', 'object'],
    ];
    for (const [body, needle] of cases) {
      const stub = await serve(() => ({ status: 200, body }));
      const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
      if (result.ok) throw new Error(`expected a refusal for ${body}`);
      expect(result.error.toLowerCase()).toContain(needle);
    }
  });

  it('reports a refused connection rather than throwing at the caller', async () => {
    const result = await pullClickHouseLogs({ baseUrl: 'http://127.0.0.1:1', ...PULL });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('127.0.0.1:1');
  });

  it('reports a socket that accepts and then says nothing', async () => {
    const stub = await serve(() => 'never');
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL, timeoutMs: 300 });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('300ms');
  });
});

describe('the declaration, checked against what the backend typed', () => {
  it('refuses a declared column the result does not carry, naming it', async () => {
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row()]) }));
    const result = await pullClickHouseLogs({
      baseUrl: stub.baseUrl,
      ...PULL,
      columns: { timestamp: 'ts', message: 'body', service: 'svc' },
    });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('svc');
    expect(result.error).toContain('service_name');
  });

  it('refuses a column the backend typed as a string, because a string is not an instant', async () => {
    const meta: [string, string][] = [['ts', 'String'], ['service_name', 'String'], ['body', 'String']];
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [{ ts: '2023-11-14T14:13:20.123Z', service_name: 'checkout', body: 'a' }]),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('String');
    expect(result.error).toContain('numeric or a date');
  });

  it('sees through the Nullable and LowCardinality wrappers when it checks the type', async () => {
    // Both wrappers are part of the type name the backend sends, so a check that read
    // the raw string would refuse `Nullable(DateTime64(3))` -- which is the commonest
    // timestamp column there is.
    const meta: [string, string][] = [
      ['ts', 'Nullable(DateTime64(3))'],
      ['service_name', 'LowCardinality(String)'],
      ['body', 'String'],
    ];
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(meta, [row()]) }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error(`expected success: ${result.error}`);
    expect(result.signals).toHaveLength(1);
  });
});

describe('the rows, and what is refused rather than guessed', () => {
  it('quarantines a row whose service is missing, empty or not a string', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(LOG_META, [
        row({ service_name: 'checkout' }),
        row({ service_name: '' }),
        row({ service_name: 42 }),
        row({ service_name: undefined }),
      ]),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(1);
    expect(result.quarantine).toHaveLength(3);
    expect(result.quarantine[0]?.reason).toContain('service_name');
    expect(result.quarantine.map((q) => q.index)).toEqual([1, 2, 3]);
  });

  it('quarantines a message that is not a string, including the array and the map the wire allows', async () => {
    // Measured: an `Array(UInt8)` and a `Map(String, UInt8)` column arrive as a JSON
    // array and a JSON object. A reader that stringified them would be writing JSON
    // into a log body, which is a shape the IR's `body` is not for.
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(LOG_META, [
        row({ body: 'fine' }),
        row({ body: [1, 2] }),
        row({ body: { a: 1 } }),
        row({ body: null }),
        row({ body: 42 }),
      ]),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(1);
    expect(result.quarantine).toHaveLength(4);
    expect(result.quarantine[0]?.reason).toContain('body');
  });

  it('keeps an empty message, because it is a message the backend wrote', async () => {
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row({ body: '' })]) }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).toEqual({ kind: 'log', body: '' });
  });

  it('does not copy the other columns into the resource, and never sets a severity', async () => {
    // Arbitrary SQL means arbitrary columns. Copying them into `resource` would invent
    // a per-query convention -- the defect the registry's reason was about -- and
    // `level` has neither a name convention nor the IR's vocabulary.
    const meta: [string, string][] = [
      ['ts', 'DateTime64(3)'],
      ['service_name', 'String'],
      ['body', 'String'],
      ['level', 'String'],
      ['trace_id', 'String'],
    ];
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [row({ level: 'error', trace_id: 'abc123' })]),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    const signal = result.signals[0];
    expect(signal?.resource).toEqual({ 'service.name': 'checkout' });
    expect(signal?.payload).toEqual({ kind: 'log', body: 'upstream 10.20.30.40 refused' });
    expect(signal?.rawOffsetMinutes).toBe(0);
  });

  it('validates every signal it emits against the IR schema', async () => {
    const stub = await serve(() => ({ status: 200, body: jsonEnvelope(LOG_META, [row()]) }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.irVersion).toBeTruthy();
    expect(result.signals[0]?.signal).toBe('log');
    expect(result.signals[0]?.provenance).toMatchObject({
      'payload.body': { source: 'direct' },
      timestamp: { source: 'direct' },
    });
  });
});

describe('the declarations this module exports', () => {
  it('closes the unit vocabulary to the four an epoch column can be counted in', () => {
    expect(CLICKHOUSE_TIMESTAMP_UNITS).toEqual(['seconds', 'milliseconds', 'microseconds', 'nanoseconds']);
    expect(CLICKHOUSE_DEFAULT_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe('the column types this reader refuses, and the measurement behind each', () => {
  it('refuses a Date column, because a calendar day has no time of day', async () => {
    // Measured: under `iso` a `Date` renders as `2023-11-14` -- no `T`, no zone, and
    // no time. It cannot place a row in a window, which is what the IR's timestamp is
    // for, so it is refused rather than widened to midnight.
    const meta: [string, string][] = [['ts', 'Date'], ['service_name', 'String'], ['body', 'String']];
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [{ ts: '2023-11-14', service_name: 'checkout', body: 'a' }]),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('calendar day');

    const wide: [string, string][] = [['ts', 'Date32'], ['service_name', 'String'], ['body', 'String']];
    const stub32 = await serve(() => ({
      status: 200,
      body: jsonEnvelope(wide, [{ ts: '2023-11-14', service_name: 'checkout', body: 'a' }]),
    }));
    const other = await pullClickHouseLogs({ baseUrl: stub32.baseUrl, ...PULL });
    if (other.ok) throw new Error('expected a refusal');
    expect(other.error).toContain('calendar day');
  });

  it('refuses a Float32 timestamp, because the interval between its values is minutes', async () => {
    // Measured on a real server: `CAST(1700000000.5 AS Float32)` arrives as
    // `1700000000`. The spacing of a Float32 at epoch-second magnitude is 128 seconds,
    // so accepting one would place rows minutes from where they happened -- silently,
    // and in a field an RCA engine reads as ground truth.
    const meta: [string, string][] = [['ts', 'Float32'], ['service_name', 'String'], ['body', 'String']];
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [{ ts: 1700000000, service_name: 'checkout', body: 'a' }]),
    }));
    const result = await pullClickHouseLogs({
      baseUrl: stub.baseUrl,
      ...PULL,
      timestampUnit: 'seconds',
    });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('128 seconds');
  });
});

describe('the cells it will not read, and the envelope parts it will not tolerate', () => {
  it('quarantines a date-time cell that is not a string', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(LOG_META, [row({ ts: 1699971200123 })]),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine[0]?.reason).toContain('date-time but sent number');
  });

  it('quarantines an integer cell that is neither a number nor a string', async () => {
    const meta: [string, string][] = [['ts_ms', 'Int64'], ['service_name', 'String'], ['body', 'String']];
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [
        { ts_ms: true, service_name: 'checkout', body: 'a' },
        { ts_ms: [1], service_name: 'checkout', body: 'b' },
      ]),
    }));
    const result = await pullClickHouseLogs({
      baseUrl: stub.baseUrl,
      query: 'SELECT 1',
      columns: { timestamp: 'ts_ms', message: 'body', service: 'service_name' },
      limit: 10,
      user: 'default',
      timestampUnit: 'milliseconds',
    });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine).toHaveLength(2);
    expect(result.quarantine[0]?.reason).toContain('integer but sent true');
    expect(result.quarantine[1]?.reason).toContain('[1]');
  });

  it('quarantines a 64-bit integer that arrived as a JSON number with digits already lost', async () => {
    // The counterfactual to the quoting measured on a real server: if the caller asked
    // for `output_format_json_quote_64bit_integers=0`, the digits do not survive the
    // double, and `JSON.parse` here rounds `...993` to `...992` before this reader is
    // called. Detecting that is the difference between refusing a row and reporting a
    // timestamp that is a millisecond off and looks perfect.
    const meta: [string, string][] = [['ts_ns', 'UInt64'], ['service_name', 'String'], ['body', 'String']];
    const stub = await serve(() => ({
      status: 200,
      body:
        '{"meta":[{"name":"ts_ns","type":"UInt64"},{"name":"service_name","type":"String"},' +
        '{"name":"body","type":"String"}],"data":[{"ts_ns":1699971200123999999,' +
        '"service_name":"checkout","body":"a"}],"rows":1}',
    }));
    const result = await pullClickHouseLogs({
      baseUrl: stub.baseUrl,
      query: 'SELECT 1',
      columns: { timestamp: 'ts_ns', message: 'body', service: 'service_name' },
      limit: 10,
      user: 'default',
      timestampUnit: 'nanoseconds',
    });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine[0]?.reason).toContain('no longer holds the digits');
  });

  it('quarantines a Float64 cell that is not a number', async () => {
    const meta: [string, string][] = [['ts_s', 'Float64'], ['service_name', 'String'], ['body', 'String']];
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(meta, [{ ts_s: '1699971200.123', service_name: 'checkout', body: 'a' }]),
    }));
    const result = await pullClickHouseLogs({
      baseUrl: stub.baseUrl,
      query: 'SELECT 1',
      columns: { timestamp: 'ts_s', message: 'body', service: 'service_name' },
      limit: 10,
      user: 'default',
      timestampUnit: 'seconds',
    });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine[0]?.reason).toContain('Float64');
  });

  it('quarantines a row that is not an object, and one whose declared message column is absent', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: jsonEnvelope(LOG_META, ['a bare string', 42, { ts: '2023-11-14T14:13:20.123Z', service_name: 'checkout' }]),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine).toHaveLength(3);
    expect(result.quarantine[0]?.reason).toBe('the row is not an object');
    // The absent column reads as `undefined`, which `summarize` has to render without
    // a `catch`: `JSON.stringify` answers `undefined` rather than a string.
    expect(result.quarantine[2]?.reason).toContain('body');
    expect(result.quarantine[2]?.record).toContain('service_name');
  });

  it('refuses a meta entry that is not a name-and-type pair', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ meta: [{ name: 'ts' }], data: [], rows: 0 }),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('{name, type} pair');
  });

  it('fails on a non-2xx that carries no exception, because the status is still a fact', async () => {
    const stub = await serve(() => ({
      status: 503,
      body: jsonEnvelope(LOG_META, []),
    }));
    const result = await pullClickHouseLogs({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('503');
  });
});
