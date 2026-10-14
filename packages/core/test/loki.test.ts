import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { LOKI_DIRECTIONS, LOKI_QUERY_RANGE_PATH, pullLokiLogs } from '../src/ingest/loki.js';

/**
 * The Loki puller, driven over a real socket.
 *
 * ## What this file is, and what it is not
 *
 * Every case below runs against `node:http` on `127.0.0.1`. Nothing in this
 * repository has contacted a Loki deployment, so these tests are evidence that the
 * reader implements the documented wire format, not that a Loki answered it. The
 * Prometheus reader earned the stronger claim by being pointed at a real server
 * (finding 154); this one and the Jaeger one have not, and both the registry's
 * summary and `docs/architecture.md` say so.
 *
 * ## Why the first cases are about *units*
 *
 * Loki writes each entry's timestamp as a **decimal string of nanoseconds**, and
 * 19 digits do not fit a `float64`. Two different readers are wrong in two
 * different ways and both are exhibited below rather than described: read as
 * milliseconds the value is not a date at all, and read through `Number` the
 * arithmetic is off by a millisecond for entries close to a boundary. This is the
 * whole reason the module carries a `BigInt` step, so it is measured here.
 */

const servers: Server[] = [];

afterAll(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
});

/** A server that answers whatever the case wants, and records what it was asked. */
async function serve(
  reply: (request: { url: string }) => { status: number; body: string } | 'never',
): Promise<{ baseUrl: string; requests: { url: string }[] }> {
  const requests: { url: string }[] = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url ?? '' });
    const answer = reply({ url: req.url ?? '' });
    if (answer === 'never') return; // accepts the connection and says nothing
    res.writeHead(answer.status, { 'content-type': 'application/json' });
    res.end(answer.body);
  });
  servers.push(server);
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the fixture did not bind');
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests };
}

const WINDOW = {
  query: '{app="checkout"}',
  start: 1_700_000_000,
  end: 1_700_000_060,
  limit: 100,
  direction: 'backward',
  serviceLabel: 'service_name',
} as const;

/** One log entry, in the shape Loki's range query writes it: ns string, line. */
function entry(nanos: string, line: string): [string, string] {
  return [nanos, line];
}

/** One stream: Loki's label set, then its entries. */
function stream(labels: Record<string, string>, values: unknown[]): unknown {
  return { stream: labels, values };
}

/** The envelope `/loki/api/v1/query_range` answers with. */
function streamsEnvelope(streams: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    status: 'success',
    data: { resultType: 'streams', result: streams, ...extra },
  });
}

describe('ingest/loki · the range-query reader', () => {
  it('maps a stream to one signal per line, with the wire facts and nothing guessed', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([
        stream(
          { service_name: 'checkout', filename: '/var/log/app.log' },
          [entry('1700000000123456789', 'line one'), entry('1700000001123456789', 'line two')],
        ),
      ]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error(`expected success, got ${result.error}`);

    expect(result.signals).toHaveLength(2);
    const [first] = result.signals;
    expect(first?.resource['service.name']).toBe('checkout');
    // The stream's other labels are the stream's identity, which is what the IR's
    // `resource` records; a per-line label would arrive as structured metadata and
    // is refused further down this file.
    expect(first?.resource['filename']).toBe('/var/log/app.log');
    expect(first?.payload).toEqual({ kind: 'log', body: 'line one' });
    expect(first?.timestamp).toBe('2023-11-14T22:13:20.123Z');
    expect(first?.rawOffsetMinutes).toBe(0);
    expect(first?.provenance['payload.body']).toEqual({ source: 'direct' });
    expect(first?.provenance['resource.service.name']).toEqual({ source: 'direct' });
  });

  it('asks the range endpoint for the window, in nanoseconds, honouring the limit and direction it was given', async () => {
    const stub = await serve(() => ({ status: 200, body: streamsEnvelope([]) }));
    await pullLokiLogs({ baseUrl: `${stub.baseUrl}/`, ...WINDOW });

    const url = new URL(stub.baseUrl + (stub.requests[0]?.url ?? ''));
    expect(url.pathname).toBe(LOKI_QUERY_RANGE_PATH);
    expect(url.searchParams.get('query')).toBe('{app="checkout"}');
    // Nanoseconds, as decimal strings: 1_700_000_000 seconds is 1.7e18 ns, which is
    // past the exact range of a JavaScript number.
    expect(url.searchParams.get('start')).toBe('1700000000000000000');
    expect(url.searchParams.get('end')).toBe('1700000060000000000');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('direction')).toBe('backward');
    // The service label is a decoding instruction for this reader, not a parameter
    // Loki knows about: sending it would suggest the backend agreed to it.
    expect(url.searchParams.has('serviceLabel')).toBe(false);
  });

  it('reads a 19-digit nanosecond timestamp as nanoseconds, which is the trap this module exists for', async () => {
    const nanos = '1700000000123456789';
    // Measured, not asserted: read as milliseconds the same digits are not a date
    // at all, so a reader that skipped Loki's unit would report a timestamp that
    // cannot be printed rather than a wrong one.
    expect(Number.isNaN(new Date(Number(nanos)).getTime())).toBe(true);

    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([stream({ service_name: 'checkout' }, [entry(nanos, 'x')])]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.timestamp).toBe('2023-11-14T22:13:20.123Z');
  });

  it('goes through the integer rather than a float, and the two disagree on a real timestamp', async () => {
    // The second failure mode, measured: 1.7e18 is past 2^53, so `Number` rounds
    // the digits up to ...124000000 and the division lands on the next millisecond.
    // A reader using `Math.floor(Number(ts) / 1e6)` reports 22:13:20.124Z for a line
    // Loki wrote at ...20.123999999Z. Both sides are measured here, because the
    // module's `BigInt` step is only worth its weight if this is a real difference.
    const nanos = '1700000000123999999';
    expect(Number(nanos)).toBe(1_700_000_000_124_000_000);
    expect(Math.floor(Number(nanos) / 1e6)).toBe(1_700_000_000_124);

    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([stream({ service_name: 'checkout' }, [entry(nanos, 'x')])]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    // Truncation, so the timestamp is never later than the line the backend wrote.
    expect(result.signals[0]?.timestamp).toBe('2023-11-14T22:13:20.123Z');
  });

  it('quarantines a line whose timestamp is not decimal nanoseconds', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([
        stream({ service_name: 'checkout' }, [
          entry('not-a-number', 'a'),
          entry('1700000000123456789 ', 'trailing space'),
          entry('-1700000000123456789', 'before the epoch'),
          // A JSON number, which is the other way a caller's proxy might hand these
          // to us: 19 digits cannot survive it, so it is refused rather than read.
          [1_700_000_000_123_456_789, 'numeric timestamp'],
        ]),
      ]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine).toHaveLength(4);
    expect(result.quarantine[0]?.reason).toContain('not decimal nanoseconds');
    expect(result.quarantine[3]?.reason).toContain('not decimal nanoseconds');
    // Indexed as stream, then line inside it: a record that only said "the third"
    // would not say which of a hundred streams it came from.
    expect(result.quarantine[2]?.index).toBe(2);
  });

  it('quarantines a line that is not a [timestamp, line] pair, naming what the extra element would be', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([
        stream({ service_name: 'checkout' }, [
          entry('1700000000123456789', 'fine'),
          ['1700000000123456789'],
          ['1700000000123456789', 'a line', { trace_id: 'abc' }],
          'not-an-array',
          ['1700000000123456789', 42],
        ]),
      ]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(1);
    expect(result.quarantine).toHaveLength(4);
    // Loki 3 writes a third element for structured metadata. This reader does not
    // claim to have read one, and refusing it is visible rather than silent -- the
    // alternative would be attaching a metadata object as if it were the line.
    expect(result.quarantine[1]?.reason).toContain('structured metadata');
    expect(result.quarantine.map((q) => q.index)).toEqual([1, 2, 3, 4]);
    expect(result.quarantine[3]?.reason).toContain('entry line is not a string');
  });

  it('truncates the offending record it keeps in a quarantine row', async () => {
    // A quarantine record is meant to be read beside the reason, and a 400-character
    // line pasted whole would bury the reason it is there for.
    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([stream({ service_name: 'checkout' }, ['x'.repeat(400)])]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    const record = result.quarantine[0]?.record ?? '';
    expect(record).toHaveLength(203);
    expect(record.endsWith('...')).toBe(true);
  });

  it('keeps an empty line, which is a line Loki was given', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([stream({ service_name: 'checkout' }, [entry('1700000000123456789', '')])]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).toEqual({ kind: 'log', body: '' });
    expect(result.quarantine).toEqual([]);
  });

  it('takes the service from the label the caller named, not from a convention', async () => {
    // The registry's reason for this backend said the service is "a label the
    // caller must name". This is that sentence in code: with `job` named, the
    // value in `service_name` -- whatever it is -- is not the service.
    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([
        stream({ service_name: 'not-the-answer', job: 'payments' }, [entry('1700000000123456789', 'x')]),
      ]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW, serviceLabel: 'job' });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.resource['service.name']).toBe('payments');
  });

  it('quarantines a stream that carries no service label, rather than attaching its lines to another stream', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([
        stream({ service_name: 'checkout' }, [entry('1700000000123456789', 'kept')]),
        stream({ filename: '/var/log/other.log' }, [entry('1700000001123456789', 'orphan')]),
        stream({ service_name: '' }, [entry('1700000001123456789', 'empty label')]),
        stream({ service_name: 42 }, [entry('1700000001123456789', 'not a string')]),
      ]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    // Per stream, not per response: one stream without the label does not make the
    // whole answer unusable, and a reader that fell back to the first service it
    // saw would look successful while being wrong.
    expect(result.signals.map((s) => s.payload)).toEqual([{ kind: 'log', body: 'kept' }]);
    expect(result.quarantine).toHaveLength(3);
    expect(result.quarantine[0]?.index).toBe(1_000_000);
    expect(result.quarantine[0]?.reason).toContain("no 'service_name' label");
  });

  it('quarantines a stream whose shape is not a label set and a values array', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([
        { stream: { service_name: 'checkout' } },
        { values: [entry('1700000000123456789', 'x')] },
        'not-an-object',
      ]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine).toHaveLength(3);
    expect(result.quarantine[0]?.reason).toContain('no `stream` label set or no `values` array');
  });

  it('never sets a severity, whatever the deployment called its level label', async () => {
    // `level`, `severity`, `lvl` and Loki 3's own `detected_level` are four names for
    // one idea, and their values (`warning`, `critical`) are not the vocabulary the
    // IR carries (`WARN`, `FATAL`). Mapping them would be a translation this
    // repository cannot check, so no severity is set -- which is a different claim
    // from "the line was informational".
    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([
        stream({ service_name: 'checkout', level: 'error' }, [entry('1700000000123456789', 'x')]),
        stream({ service_name: 'checkout', detected_level: 'critical' }, [entry('1700000000123456789', 'y')]),
      ]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(2);
    for (const signal of result.signals) {
      expect(signal.payload).not.toHaveProperty('severityText');
    }
  });

  it('keeps the order the backend wrote, which the direction decides', async () => {
    const newestFirst = [
      entry('1700000001123456789', 'newest'),
      entry('1700000000123456789', 'oldest'),
    ];
    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([stream({ service_name: 'checkout' }, newestFirst)]),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW, direction: 'backward' });
    if (!result.ok) throw new Error('expected success');
    // Not reordered: the caller chose the direction, and `signals[0]` staying the
    // backend's first entry is what lets a reader compare the two.
    expect(result.signals.map((s) => (s.payload.kind === 'log' ? s.payload.body : ''))).toEqual([
      'newest',
      'oldest',
    ]);
  });

  it('reports an empty window as an empty success rather than an error', async () => {
    const stub = await serve(() => ({ status: 200, body: streamsEnvelope([]) }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('ignores the envelope fields it was not asked to read', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: streamsEnvelope([stream({ service_name: 'checkout' }, [entry('1700000000123456789', 'x')])], {
        stats: { summary: { totalLinesProcessed: 1 } },
      }),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(1);
  });

  it('passes the backend\'s warnings through', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({
        status: 'success',
        warnings: ['limit reached', 42],
        data: { resultType: 'streams', result: [] },
      }),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.warnings).toEqual(['limit reached']);
  });

  it('refuses a pull that names no service label at all', async () => {
    // The error is the registry's reason for this backend, read out loud: without a
    // named label the reader would have to guess which one is the service.
    const result = await pullLokiLogs({
      baseUrl: 'http://127.0.0.1:1',
      ...WINDOW,
      serviceLabel: '',
    });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('no service label was named');
  });

  it('refuses a limit that is not a positive integer, instead of falling back on Loki\'s own default', async () => {
    // Loki defaults `limit` to 100 entries. A reader that left it out would receive
    // a silently truncated window and have no way to say so.
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      const result = await pullLokiLogs({ baseUrl: 'http://127.0.0.1:1', ...WINDOW, limit });
      if (result.ok) throw new Error(`expected a refusal for limit ${String(limit)}`);
      expect(result.error).toContain('limit must be a positive integer');
    }
  });

  it('refuses a direction outside the closed pair', async () => {
    // The vocabulary itself is asserted, not just the behaviour: a direction added
    // to the tuple has to be one the endpoint accepts, and the message the refusal
    // writes names the pair.
    expect([...LOKI_DIRECTIONS]).toEqual(['forward', 'backward']);
    for (const direction of ['sideways', '', 'Backward']) {
      const result = await pullLokiLogs({
        baseUrl: 'http://127.0.0.1:1',
        ...WINDOW,
        direction: direction as 'backward',
      });
      if (result.ok) throw new Error(`expected a refusal for direction ${direction}`);
      expect(result.error).toContain("direction must be one of 'forward' or 'backward'");
    }
  });

  it('refuses a window whose end is before its start', async () => {
    const result = await pullLokiLogs({ baseUrl: 'http://127.0.0.1:1', ...WINDOW, end: 1_699_999_000 });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('so the range is empty');
  });

  it('reads all three encodings of the window the other two pullers accept', async () => {
    const stub = await serve(() => ({ status: 200, body: streamsEnvelope([]) }));
    const asIso = await pullLokiLogs({
      baseUrl: stub.baseUrl,
      ...WINDOW,
      start: '2023-11-14T22:13:20Z',
      end: '2023-11-14T22:14:20Z',
    });
    if (!asIso.ok) throw new Error(`expected success, got ${asIso.error}`);
    const asDate = await pullLokiLogs({
      baseUrl: stub.baseUrl,
      ...WINDOW,
      start: new Date(1_700_000_000_000),
      end: new Date(1_700_000_060_000),
    });
    if (!asDate.ok) throw new Error(`expected success, got ${asDate.error}`);

    const sent = stub.requests.map((r) => new URL(stub.baseUrl + r.url).searchParams.get('start'));
    expect(sent).toEqual(['1700000000000000000', '1700000000000000000']);
  });

  it('refuses a window it cannot read, rather than sending NaN to the backend', async () => {
    const bad = await pullLokiLogs({ baseUrl: 'http://127.0.0.1:1', ...WINDOW, start: 'yesterday' });
    if (bad.ok) throw new Error('expected a refusal');
    expect(bad.error).toContain('start is not a time this module can read');

    const notFinite = await pullLokiLogs({ baseUrl: 'http://127.0.0.1:1', ...WINDOW, start: Number.NaN });
    if (notFinite.ok) throw new Error('expected a refusal');
    expect(notFinite.error).toContain('start must be a finite number of seconds');

    const invalidDate = await pullLokiLogs({
      baseUrl: 'http://127.0.0.1:1',
      ...WINDOW,
      end: new Date(Number.NaN),
    });
    if (invalidDate.ok) throw new Error('expected a refusal');
    expect(invalidDate.error).toContain('end is not a time this module can read');
  });
});

describe('ingest/loki · what makes the request meaningless', () => {
  it('reports a refused connection rather than throwing at the caller', async () => {
    const result = await pullLokiLogs({ baseUrl: 'http://127.0.0.1:1', ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain(`${LOKI_QUERY_RANGE_PATH} `);
  });

  it('reports a socket that accepts and then says nothing, naming the bound', async () => {
    const stub = await serve(() => 'never');
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW, timeoutMs: 50 });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('did not answer within 50ms');
  });

  it('reports a non-2xx with its status and the head of its body', async () => {
    const stub = await serve(() => ({ status: 400, body: 'parse error at line 1, col 2' }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('returned HTTP 400: parse error at line 1, col 2');
  });

  it('reports a body that is not JSON', async () => {
    const stub = await serve(() => ({ status: 200, body: '<html>proxy</html>' }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('returned a body that is not JSON: <html>proxy</html>');
  });

  it('reports an envelope with no status field', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ data: { resultType: 'streams', result: [] } }),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain("returned a body with no 'status' field");
  });

  it('fails on a query error carried in the body of an HTTP 200', async () => {
    // A defence rather than a reproduction: no Loki has been measured here, and the
    // Prometheus reader's identical branch turned out to be unreachable in practice
    // (finding 154). It is kept because an endpoint whose status code says 200 is
    // exactly the case a status-code check cannot catch.
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ status: 'error', errorType: 'bad_data', error: 'parse error at line 1' }),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('the query failed (bad_data): parse error at line 1');
  });

  it('fails on a query error that names neither a type nor a message', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ status: 'error' }) }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('the query failed (unknown): no message');
  });

  it('fails on an envelope with no data, which is neither an empty window nor a stream list', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ status: 'success' }) }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('returned no `data`');
  });

  it('fails on a range query that answers with a matrix, which is a LogQL metric query', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({
        status: 'success',
        data: { resultType: 'matrix', result: [{ metric: {}, values: [[1_700_000_000, '3']] }] },
      }),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    // A metric query is telemetry, but it is not a log line, and reading its sample
    // values as messages would be the loudest possible version of guessing.
    expect(result.error).toContain("got 'matrix'");
  });

  it('fails on a result list that is not a list', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ status: 'success', data: { resultType: 'streams', result: null } }),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain("`data.result` is not an array");
  });

  it('fails on a resultType it does not know', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ status: 'success', data: { resultType: 'vector', result: [] } }),
    }));
    const result = await pullLokiLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain("got 'vector'");
  });
});
