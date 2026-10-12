import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { pullPrometheusMetrics } from '../src/ingest/prometheus.js';
import type { PrometheusPullResult } from '../src/ingest/prometheus.js';
import type { TelemetrySignal } from '../src/ir/types.js';

/**
 * `pullPrometheusMetrics` against a real HTTP server.
 *
 * The server below is not a mock: it is `node:http`, it binds a real port, and
 * every assertion here travels over a socket. That matters more for this module
 * than for any other in the package, because it is the first ingest path whose
 * input can be *absent* -- a refused connection, a timeout, a 500 -- and those
 * branches cannot be reached at all through a stubbed transport. The repository
 * has already paid for the difference twice: finding 145's guide gate ran two
 * builds and tore `dist/` apart because nobody had executed what it executed, and
 * finding 152's audit credited a syntax error as a proof because the failure it
 * observed was not the failure it was measuring.
 *
 * The fixtures are values the Prometheus HTTP API documents, including the two
 * that have no JSON number form: `NaN` and `+Inf` are written as strings, and a
 * reader that expects numbers quarantines nothing and returns silent zeroes.
 */

interface Stub {
  server: Server;
  baseUrl: string;
  /** What the module asked for, so the request itself can be asserted. */
  requests: { path: string; params: URLSearchParams }[];
  close: () => Promise<void>;
}

const open: Stub[] = [];

afterAll(async () => {
  await Promise.all(open.map((s) => s.close()));
});

/**
 * Start a server that answers every request with `reply`, or never answers.
 *
 * `reply` is a function of the request so a case can vary its answer by path or
 * by query, which is how the error cases reach their branches without a second
 * server per case.
 */
async function serve(
  reply: (params: URLSearchParams) => { status: number; body: string } | 'hang',
): Promise<Stub> {
  const requests: Stub['requests'] = [];
  const server = createServer((req, res) => {
    if (req.url === undefined) return;
    const url = new URL(req.url, 'http://127.0.0.1');
    requests.push({ path: url.pathname, params: url.searchParams });
    const answer = reply(url.searchParams);
    if (answer === 'hang') return; // no reply at all, so the client's own bound decides
    res.writeHead(answer.status, { 'content-type': 'application/json' });
    res.end(answer.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the fixture server did not bind');
  const stub: Stub = {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  open.push(stub);
  return stub;
}

/** Wrap a `data` object in the envelope Prometheus actually returns. */
function envelope(data: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ status: 'success', data, ...extra });
}

const MATRIX = {
  resultType: 'matrix',
  result: [
    {
      metric: { __name__: 'container_cpu_usage_seconds_total', service: 'checkout', pod: 'checkout-0' },
      values: [
        [1_700_000_000, '0.25'],
        [1_700_000_015, '0.5'],
      ],
    },
  ],
};

const WINDOW = { start: 1_700_000_000, end: 1_700_000_060, step: '15s' };

describe('pullPrometheusMetrics', () => {
  it('maps a matrix to one metric signal per sample', async () => {
    const stub = await serve(() => ({ status: 200, body: envelope(MATRIX) }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signals).toHaveLength(2);
    expect(result.quarantine).toEqual([]);

    const [first] = result.signals as [TelemetrySignal, TelemetrySignal];
    expect(first.signal).toBe('metric');
    expect(first.resource['service.name']).toBe('checkout');
    expect(first.timestamp).toBe('2023-11-14T22:13:20.000Z');
    // Prometheus timestamps are epoch seconds in UTC, and the IR carries the
    // offset so a reader never has to guess which clock a sample came from.
    expect(first.rawOffsetMinutes).toBe(0);
    expect(first.payload).toEqual({
      kind: 'metric',
      name: 'container_cpu_usage_seconds_total',
      value: 0.25,
      tags: { pod: 'checkout-0' },
    });
    // The second sample is a different value at a different instant, which is the
    // only thing that makes two samples of one series distinguishable.
    expect(result.signals[1]?.payload).toMatchObject({ value: 0.5 });
    expect(result.signals[1]?.timestamp).toBe('2023-11-14T22:13:35.000Z');
  });

  it('asks the range-query endpoint for the window it was given', async () => {
    const stub = await serve(() => ({ status: 200, body: envelope(MATRIX) }));
    await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'rate(x[5m])', ...WINDOW });

    expect(stub.requests).toHaveLength(1);
    const [request] = stub.requests;
    expect(request?.path).toBe('/api/v1/query_range');
    expect(request?.params.get('query')).toBe('rate(x[5m])');
    expect(request?.params.get('start')).toBe('1700000000');
    expect(request?.params.get('end')).toBe('1700000060');
    expect(request?.params.get('step')).toBe('15s');
  });

  it('accepts epoch seconds, an ISO string and a Date as the same instant', async () => {
    const stub = await serve(() => ({ status: 200, body: envelope(MATRIX) }));
    const iso = new Date(1_700_000_000_000).toISOString();
    await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', start: iso, end: new Date(1_700_000_060_000), step: 15 });
    const [request] = stub.requests;
    expect(request?.params.get('start')).toBe('1700000000');
    expect(request?.params.get('end')).toBe('1700000060');
  });

  it('does not guess a semantic type, because a guess beside measured values is not a measurement', async () => {
    const stub = await serve(() => ({ status: 200, body: envelope(MATRIX) }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    for (const signal of result.signals) {
      expect(signal.payload).not.toHaveProperty('semanticType');
    }
  });

  it('marks value, name and timestamp as direct provenance, and invents no others', async () => {
    const stub = await serve(() => ({ status: 200, body: envelope(MATRIX) }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    const provenance = result.signals[0]?.provenance ?? {};
    expect(Object.keys(provenance).sort()).toEqual(['payload.name', 'payload.value', 'timestamp']);
    for (const entry of Object.values(provenance)) expect(entry.source).toBe('direct');
  });

  it('passes the backend\u2019s warnings through instead of dropping them', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope(MATRIX, { warnings: ['matched no series', 42] }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    // The non-string entry is dropped rather than stringified: a warning this
    // module rewrote is a warning the backend did not issue.
    expect(result.warnings).toEqual(['matched no series']);
  });

  it('quarantines a series with no metric name rather than name it after nothing', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({ resultType: 'matrix', result: [{ metric: { service: 'checkout' }, values: [[1_700_000_000, '1']] }] }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]?.reason).toContain('__name__');
  });

  it('quarantines a series with no service label, and reads a non-default one when told to', async () => {
    const body = envelope({
      resultType: 'matrix',
      result: [{ metric: { __name__: 'up', target: 'api' }, values: [[1_700_000_000, '1']] }],
    });
    const missing = await serve(() => ({ status: 200, body }));
    const withoutLabel = await pullPrometheusMetrics({ baseUrl: missing.baseUrl, query: 'up', ...WINDOW });
    if (!withoutLabel.ok) throw new Error('expected success');
    expect(withoutLabel.signals).toEqual([]);
    expect(withoutLabel.quarantine[0]?.reason).toContain("'service'");

    const named = await serve(() => ({ status: 200, body }));
    const withLabel = await pullPrometheusMetrics({
      baseUrl: named.baseUrl,
      query: 'up',
      ...WINDOW,
      serviceLabel: 'target',
    });
    if (!withLabel.ok) throw new Error('expected success');
    expect(withLabel.signals[0]?.resource['service.name']).toBe('api');
    // The label that became the resource is not repeated in the tags, and a
    // series with no labels left carries no `tags` at all rather than an empty
    // object: "no labels were reported" and "labels were reported and there were
    // none" are the same thing to a reader, and one of the two is a field this
    // module would have invented.
    expect(withLabel.signals[0]?.payload).not.toHaveProperty('tags');
  });

  // Prometheus writes NaN and the infinities as strings because JSON has no
  // number for them. A reader that only accepts numbers returns a signal whose
  // value is `undefined`, which is how finding 119's round trip reported 122
  // cases as a bare `NaN` that no reader could attribute to a layer.
  /**
   * Three named cases rather than one `it.each`.
   *
   * The generator produced the same three assertions, but its titles only exist at
   * run time, and `scripts/injection/backend-support.py` names the test it expects
   * to fail as a *source* string. `--verify-expectations` compared the two and
   * reported the `NaN` case stale the moment it was written, which is correct: a
   * name the source does not contain cannot be reconciled. Three literals make the
   * expectation check exact, and they also name the failing value in the report
   * instead of leaving the reader to work out which row of a table it was.
   */
  async function pullNonFinite(raw: string): Promise<PrometheusPullResult> {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        resultType: 'matrix',
        result: [{ metric: { __name__: 'up', service: 'checkout' }, values: [[1_700_000_000, raw]] }],
      }),
    }));
    return pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
  }

  it('quarantines the non-finite sample value NaN instead of emitting it', async () => {
    const result = await pullNonFinite('NaN');
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine[0]?.reason).toContain('finite');
  });

  it('quarantines the non-finite sample value +Inf instead of emitting it', async () => {
    const result = await pullNonFinite('+Inf');
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine[0]?.reason).toContain('finite');
  });

  it('quarantines the non-finite sample value -Inf instead of emitting it', async () => {
    const result = await pullNonFinite('-Inf');
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine[0]?.reason).toContain('finite');
  });

  it('indexes a quarantined sample so the offending series can be found', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        resultType: 'matrix',
        result: [
          { metric: { __name__: 'up', service: 'a' }, values: [[1_700_000_000, '1']] },
          { metric: { __name__: 'up', service: 'b' }, values: [[1_700_000_000, 'NaN'], [1_700_000_015, '2']] },
        ],
      }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(2);
    // Series 1, sample 0 -- and the second sample of that series still arrives,
    // because one unusable sample does not make the series unusable.
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]?.index).toBe(1_000_000);
  });

  it('quarantines a series whose values is not an array', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({ resultType: 'matrix', result: [{ metric: { __name__: 'up', service: 'a' }, values: 'nope' }] }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine[0]?.reason).toContain('values');
  });

  // The verdict in the body, which a status code cannot give. This fixture is a
  // *defence* rather than a reproduction, and it was measured which is which: a
  // real Prometheus 2.45.3 answers a bad query with HTTP 400 and a
  // `{"status":"error",...}` body, so the non-2xx branch is what catches it in
  // practice. The 200-with-error form is kept because an endpoint that answers
  // 200 and puts the failure in the body would otherwise read as an empty
  // result, and an empty result is what an outage looks like.
  it('fails on a query error carried in the body of an HTTP 200', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ status: 'error', errorType: 'bad_data', error: 'unknown function "rate"' }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'rate(x)', ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('bad_data');
    expect(result.error).toContain('unknown function');
  });

  it('fails on a non-2xx response and quotes what came back', async () => {
    const stub = await serve(() => ({ status: 503, body: 'upstream is down' }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('503');
    expect(result.error).toContain('upstream is down');
  });

  it('fails on a body that is not JSON, naming the endpoint', async () => {
    const stub = await serve(() => ({ status: 200, body: '<html>proxy</html>' }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not JSON');
    expect(result.error).toContain('/api/v1/query_range');
  });

  it('fails on an envelope with no status field', async () => {
    const stub = await serve(() => ({ status: 200, body: '{"data":{}}' }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    expect(result.ok).toBe(false);
  });

  it('fails when a range query answers with something other than a matrix', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({ resultType: 'vector', result: [] }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('matrix');
    expect(result.error).toContain('vector');
  });

  it('refuses a window that ends before it starts, without asking the backend', async () => {
    const stub = await serve(() => ({ status: 200, body: envelope(MATRIX) }));
    const result = await pullPrometheusMetrics({
      baseUrl: stub.baseUrl,
      query: 'up',
      start: 1_700_000_060,
      end: 1_700_000_000,
      step: '15s',
    });
    expect(result.ok).toBe(false);
    expect(stub.requests).toEqual([]);
  });

  it('refuses a start it cannot read, rather than sending NaN to the backend', async () => {
    const stub = await serve(() => ({ status: 200, body: envelope(MATRIX) }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', start: 'yesterday', end: 1, step: '15s' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('start');
    expect(stub.requests).toEqual([]);
  });

  it('gives up on a body that never arrives, within the bound it was given', async () => {
    const stub = await serve(() => 'hang');
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW, timeoutMs: 150 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('150ms');
  });

  it('reports a refused connection as an error rather than throwing', async () => {
    // Port 1 on the loopback interface has nothing listening, which is the
    // unreachable-host case: `fetch` rejects with a TypeError, and a puller that
    // throws cannot be driven by a table of cases.
    const result = await pullPrometheusMetrics({ baseUrl: 'http://127.0.0.1:1', query: 'up', ...WINDOW, timeoutMs: 500 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('/api/v1/query_range');
  });

  it('tolerates a trailing slash on the base URL', async () => {
    const stub = await serve(() => ({ status: 200, body: envelope(MATRIX) }));
    await pullPrometheusMetrics({ baseUrl: `${stub.baseUrl}/`, query: 'up', ...WINDOW });
    expect(stub.requests[0]?.path).toBe('/api/v1/query_range');
  });

  // The four cases below exist because the first coverage run put this module at
  // 82.6% of branches, and reading which branches were dark is how each of them
  // was decided: three were behaviour nobody had exercised, and one was a form
  // the backend does not write, which is now refused rather than supported.

  it('refuses a bare NaN passed as a start instant, rather than sending it', async () => {
    const stub = await serve(() => ({ status: 200, body: envelope(MATRIX) }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', start: Number.NaN, end: 1, step: '15s' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('finite number of seconds');
    expect(stub.requests).toEqual([]);
  });

  it('reads a numeric sample value, which a compatible endpoint may write', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        resultType: 'matrix',
        result: [{ metric: { __name__: 'up', service: 'checkout' }, values: [[1_700_000_000, 1.25]] }],
      }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).toMatchObject({ value: 1.25 });
  });

  it('refuses a timestamp written as a string, which is a form Prometheus does not write', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        resultType: 'matrix',
        result: [{ metric: { __name__: 'up', service: 'checkout' }, values: [['1700000000', '1']] }],
      }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine[0]?.reason).toContain('timestamp');
  });

  it('drops a label whose value is not a string, because a tag is a string map', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'up', service: 'checkout', shard: 3, pod: 'checkout-0' },
            values: [[1_700_000_000, '1']],
          },
        ],
      }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).toMatchObject({ tags: { pod: 'checkout-0' } });
  });

  it('accepts a response with no warnings array at all', async () => {
    const stub = await serve(() => ({ status: 200, body: envelope(MATRIX) }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.warnings).toEqual([]);
  });

  it('refuses a data field that is not an object, naming what it found', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ status: 'success', data: 'nope' }) }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('matrix');
  });

  it('refuses a data.result that is not an array', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({ resultType: 'matrix', result: { not: 'an array' } }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not an array');
  });

  it('refuses a sample that is not a [timestamp, value] pair', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        resultType: 'matrix',
        result: [{ metric: { __name__: 'up', service: 'checkout' }, values: [[1_700_000_000]] }],
      }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine[0]?.reason).toContain('pair');
  });

  it('refuses a sample value that is neither a number nor a string', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        resultType: 'matrix',
        result: [{ metric: { __name__: 'up', service: 'checkout' }, values: [[1_700_000_000, null]] }],
      }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine).toHaveLength(1);
  });

  // `summarize` truncates a record at 200 characters, and the only way to reach
  // that is a record that long. It matters because the record is what a reader
  // uses to find the offending series, and an untruncated megabyte of JSON in a
  // quarantine report is a report nobody reads.
  it('truncates a long record in a quarantine entry', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: envelope({
        resultType: 'matrix',
        result: [{ metric: { __name__: 'up', service: 'checkout' }, values: ['x'.repeat(400)] }],
      }),
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    const record = result.quarantine[0]?.record ?? '';
    expect(record.length).toBeLessThanOrEqual(203);
    expect(record.endsWith('...')).toBe(true);
  });

  // A real Prometheus 2.45.3 always fills both fields (measured in v1.75: a parse
  // error answers `{"status":"error","errorType":"bad_data","error":"..."}`), so
  // this fixture is about not producing `undefined: undefined` against an endpoint
  // that does not. The fallbacks are the difference between a reader that reports
  // what it has and one that reports the shape of its own missing data.
  it('refuses a numeric sample value that overflows to infinity', async () => {
    // `1e999` is a legal JSON number literal that `JSON.parse` turns into
    // `Infinity`, so this is the one way a *number* can be non-finite on the
    // wire. It is refused for the same reason the string `+Inf` is.
    const stub = await serve(() => ({
      status: 200,
      body: '{"status":"success","data":{"resultType":"matrix","result":[{"metric":{"__name__":"up","service":"checkout"},"values":[[1700000000,1e999]]}]}}',
    }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine).toHaveLength(1);
  });

  it('names an error envelope that carries no errorType or message', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ status: 'error' }) }));
    const result = await pullPrometheusMetrics({ baseUrl: stub.baseUrl, query: 'up', ...WINDOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('unknown');
    expect(result.error).toContain('no message');
  });
});
