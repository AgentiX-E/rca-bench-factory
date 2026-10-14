import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { pullJaegerTraces } from '../src/ingest/jaeger.js';

/**
 * The Jaeger puller, driven over a real socket.
 *
 * ## What this file is, and what it is not
 *
 * Every case below runs against `node:http` on `127.0.0.1`. Nothing in this
 * repository has contacted a Jaeger deployment, so these tests are evidence that
 * the reader implements the documented wire format -- not that a Jaeger answered
 * it. The Prometheus puller earned the stronger claim by being pointed at a real
 * server (finding 154); this one has not, and the registry's summary says so.
 *
 * ## Why every branch is a network fact
 *
 * The branches are the same set `prometheus.ts` has, and they exist for the same
 * reason: this module's input can be absent, slow, unauthorised or wrong in ways a
 * payload a caller already holds never is. Each one is a case here, including the
 * two a fixture server makes easy to forget -- a connection that is refused, and a
 * socket that accepts and then says nothing.
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

const WINDOW = { service: 'checkout', start: 1_700_000_000, end: 1_700_000_060, limit: 20 } as const;

/** One trace in the shape Jaeger's query API answers in. */
function envelope(trace: unknown): string {
  return JSON.stringify({ data: [trace], total: 1, limit: 0, offset: 0, errors: null });
}

const SPAN = {
  traceID: '4d2f1c9ab7e35401',
  spanID: 'a1b2c3d4e5f60718',
  operationName: 'GET /checkout',
  startTime: 1_700_000_000_000_000,
  duration: 12_500,
  tags: [{ key: 'span.kind', type: 'string', value: 'server' }],
  processID: 'p1',
};

describe('ingest/jaeger · the query API reader', () => {
  it('maps a trace to one signal per span, with the wire facts and nothing guessed', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: '4d2f1c9ab7e35401',
        spans: [
          {
            ...SPAN,
            references: [{ refType: 'CHILD_OF', traceID: '4d2f1c9ab7e35401', spanID: 'ffffffffffffffff' }],
            tags: [
              { key: 'span.kind', type: 'string', value: 'server' },
              { key: 'http.status_code', type: 'int64', value: 500 },
              { key: 'error', type: 'bool', value: true },
            ],
          },
        ],
        processes: { p1: { serviceName: 'checkout', tags: [] } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error(`expected success, got ${result.error}`);

    expect(result.signals).toHaveLength(1);
    const signal = result.signals[0];
    expect(signal?.resource['service.name']).toBe('checkout');
    // Microseconds on the wire, milliseconds in the IR: 12_500µs is 12.5ms, and a
    // reader that kept the microseconds would be wrong by 1000x in every duration.
    expect(signal?.payload).toMatchObject({
      kind: 'trace',
      traceId: '4d2f1c9ab7e35401',
      spanId: 'a1b2c3d4e5f60718',
      parentSpanId: 'ffffffffffffffff',
      spanName: 'GET /checkout',
      durationMs: 12.5,
      status: 'ERROR',
    });
    // The `error` tag became the status, and is not repeated as an attribute: two
    // representations of one wire fact can drift apart.
    expect(signal?.payload).toMatchObject({ attributes: { 'span.kind': 'server', 'http.status_code': '500' } });
    expect(signal?.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
    expect(signal?.provenance['payload.durationMs']).toEqual({ source: 'direct' });
  });

  it('reads the service from the process table when the span does not carry it', async () => {
    // The fact the registry's reason for this backend named: Jaeger keeps processes
    // in a table beside the spans, so a reader that only looked inside the span
    // would find no service on most responses.
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [{ ...SPAN, process: undefined }],
        processes: { p1: { serviceName: 'from-the-table' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.resource['service.name']).toBe('from-the-table');
  });

  it('quarantines a span that names no service at all, rather than guessing one', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({ traceID: 't1', spans: [{ ...SPAN, processID: 'absent' }], processes: {} }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine[0]?.reason).toContain('names no service');
  });

  it('takes CHILD_OF as the parent and not merely the first reference', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [
          {
            ...SPAN,
            references: [
              { refType: 'FOLLOWS_FROM', traceID: 't1', spanID: 'nottheparent00' },
              { refType: 'CHILD_OF', traceID: 't1', spanID: 'theparent00000' },
            ],
          },
        ],
        processes: { p1: { serviceName: 'checkout' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).toMatchObject({ parentSpanId: 'theparent00000' });
  });

  it('ignores a CHILD_OF reference that names no span, rather than inventing a parent', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [
          {
            ...SPAN,
            references: [
              { refType: 'CHILD_OF', traceID: 't1', spanID: '' },
              { refType: 'CHILD_OF', traceID: 't1' },
            ],
          },
        ],
        processes: { p1: { serviceName: 'checkout' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).not.toHaveProperty('parentSpanId');
  });

  it('refuses a `data` field that is neither a list nor an absence', async () => {
    // `data: {}` is not "no traces" -- it is an envelope this reader does not
    // understand, and reading it as an empty window would report a broken backend
    // as a quiet one.
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ data: {} }) }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('is not an array');
  });

  it('leaves the status absent when the backend did not state one', async () => {
    // "The backend did not say" and "the backend said it succeeded" are different
    // facts, and only one of them is a measurement.
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [{ ...SPAN, tags: [] }],
        processes: { p1: { serviceName: 'checkout' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).not.toHaveProperty('status');
  });

  it('reads the OTLP spelling of the status as well as the boolean', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [
          {
            ...SPAN,
            tags: [
              { key: 'span.kind', type: 'string', value: 'server' },
              { key: 'otel.status_code', type: 'string', value: 'OK' },
            ],
          },
        ],
        processes: { p1: { serviceName: 'checkout' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).toMatchObject({ status: 'OK' });
    expect(result.signals[0]?.payload).toMatchObject({ attributes: { 'span.kind': 'server' } });
  });

  it('reports an unreachable host rather than throwing', async () => {
    // Port 1 on the loopback: a refused connection, which is what a stopped
    // Jaeger looks like from here.
    const result = await pullJaegerTraces({ baseUrl: 'http://127.0.0.1:1', ...WINDOW });
    expect(result.ok).toBe(false);
  });

  it('reports a socket that accepts and never answers', async () => {
    const stub = await serve(() => 'never');
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW, timeoutMs: 150 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('did not answer within 150ms');
  });

  it('reports a non-2xx status with the body, so a proxy is distinguishable from a query', async () => {
    const stub = await serve(() => ({ status: 503, body: '<html>upstream is unwell</html>' }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('503');
    expect(result.error).toContain('upstream is unwell');
  });

  it('names the endpoint when the body is not JSON', async () => {
    const stub = await serve(() => ({ status: 200, body: 'not json at all' }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('/api/traces');
    expect(result.error).toContain('not JSON');
  });

  it('refuses an envelope with no `data` field', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ total: 0 }) }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no 'data' field");
  });

  it('treats null data with errors as a failed query, not as an empty window', async () => {
    // The distinction that stops an outage being reported as a quiet window.
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ data: null, errors: ['service not found: checkout'] }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('service not found');
  });

  it('refuses null data with no reason at all', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ data: null }) }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no data and no reason');
  });

  it('passes warnings through when the answer is partial', async () => {
    // `data` *and* errors is a partial answer, which is not the same outcome as
    // `data: null` with errors -- one is a warning, the other is a failure.
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({
        data: [{ traceID: 't1', spans: [SPAN], processes: { p1: { serviceName: 'checkout' } }, warnings: ['clock skew'] }],
        errors: ['span store is partially unavailable'],
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.warnings).toEqual(['span store is partially unavailable', 'clock skew']);
    expect(result.signals).toHaveLength(1);
  });

  it('quarantines a trace with no spans array', async () => {
    const stub = await serve(() => ({ status: 200, body: envelope({ traceID: 't1' }) }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine[0]?.reason).toContain('no `spans` array');
  });

  it.each([
    ['traceID', { traceID: undefined }, 'no `traceID`'],
    ['spanID', { spanID: '' }, 'no `spanID`'],
    ['operationName', { operationName: '' }, 'no `operationName`'],
    ['startTime', { startTime: 'not-a-number' }, 'not a number of microseconds'],
    ['duration', { duration: -1 }, 'not a non-negative number'],
    ['tags', { tags: 'not-an-array' }, '`tags` is not an array'],
  ])('quarantines a span whose %s is unusable', async (_field, override, reason) => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [{ ...SPAN, ...override }],
        processes: { p1: { serviceName: 'checkout' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine[0]?.reason).toContain(reason);
  });

  it('quarantines a span that is not an object, and keeps reading the trace', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: ['not-a-span', { ...SPAN }],
        processes: { p1: { serviceName: 'checkout' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(1);
    expect(result.quarantine[0]?.reason).toContain('not an object');
  });

  it('drops a tag it cannot represent instead of stringifying a structure', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [
          {
            ...SPAN,
            tags: [
              { key: 'structured', type: 'json', value: { nested: true } },
              { key: 'scalar', type: 'int64', value: 7 },
            ],
          },
        ],
        processes: { p1: { serviceName: 'checkout' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).toMatchObject({ attributes: { scalar: '7' } });
  });

  it('reads the service from the span\'s own process when it carries one', async () => {
    // The other half of the same fallback: when the span carries `process`, the
    // table is not consulted at all -- and a test that only ever exercised the
    // table would leave the primary path unread.
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [{ ...SPAN, processID: 'absent', process: { serviceName: 'inline-service' } }],
        processes: {},
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.resource['service.name']).toBe('inline-service');
  });

  it('falls back to the process table when the inline process names no service', async () => {
    // The inline `process` can be present and still carry nothing this reader can
    // use -- a `serviceName` of the wrong type is not a service name.
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [{ ...SPAN, process: { serviceName: 42 } }],
        processes: { p1: { serviceName: 'from-the-table' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.resource['service.name']).toBe('from-the-table');
  });

  it('quarantines a span with no inline process and no processID to look up', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [{ ...SPAN, process: undefined, processID: undefined }],
        processes: { p1: { serviceName: 'checkout' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine[0]?.reason).toContain('names no service');
  });

  it("reads the boolean `error: false` as an explicit OK", async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [{ ...SPAN, tags: [{ key: 'error', type: 'bool', value: false }] }],
        processes: { p1: { serviceName: 'checkout' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).toMatchObject({ status: 'OK' });
  });

  it('reads a span with no tags at all, and keeps the absence of a status', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        traceID: 't1',
        spans: [{ ...SPAN, tags: undefined }],
        processes: { p1: { serviceName: 'checkout' } },
      }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.payload).not.toHaveProperty('status');
    expect(result.signals[0]?.payload).not.toHaveProperty('attributes');
  });

  it('summarises a structured entry in `errors` instead of dropping it', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ data: null, errors: [{ code: 400, message: 'bad window' }] }),
    }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('bad window');
  });

  it('refuses a window boundary that is not a finite number', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ data: [] }) }));
    const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...WINDOW, start: Number.NaN });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not a finite number');
  });

  it('builds the query the documented API expects, in microseconds', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ data: [] }) }));
    await pullJaegerTraces({ baseUrl: `${stub.baseUrl}/`, ...WINDOW });
    const url = new URL(`http://x${stub.requests[0]?.url}`);
    expect(url.pathname).toBe('/api/traces');
    expect(url.searchParams.get('service')).toBe('checkout');
    // Epoch seconds in, microseconds on the wire: the conversion is the reader's.
    expect(url.searchParams.get('start')).toBe('1700000000000000');
    expect(url.searchParams.get('end')).toBe('1700000060000000');
    expect(url.searchParams.get('limit')).toBe('20');
  });

  it('refuses a request it cannot make sense of before it is sent', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ data: [] }) }));
    for (const [options, expected] of [
      [{ ...WINDOW, service: '' }, 'no service was named'],
      [{ ...WINDOW, limit: 0 }, 'limit must be a positive integer'],
      [{ ...WINDOW, start: 'not-a-date' }, 'not a parseable timestamp'],
      [{ ...WINDOW, start: 1_700_000_060, end: 1_700_000_000 }, 'before start'],
    ] as const) {
      const result = await pullJaegerTraces({ baseUrl: stub.baseUrl, ...options });
      expect(result.ok, `${expected} was not refused`).toBe(false);
      if (!result.ok) expect(result.error).toContain(expected);
    }
    // Nothing was sent: a request refused on its own terms must not reach the
    // backend, or the refusal is a comment rather than a check.
    expect(stub.requests).toEqual([]);
  });

  it('accepts a Date and an ISO string for the window, and treats a number as seconds', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ data: [] }) }));
    await pullJaegerTraces({
      baseUrl: stub.baseUrl,
      service: 'checkout',
      start: new Date(1_700_000_000_000),
      end: '2023-11-14T22:13:20.060Z',
      limit: 1,
    });
    const url = new URL(`http://x${stub.requests[0]?.url}`);
    expect(url.searchParams.get('start')).toBe('1700000000000000');
    expect(url.searchParams.get('end')).toBe('1700000000060000');
  });
});
