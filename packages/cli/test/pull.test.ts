import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { T2_IMPLEMENTED_BACKEND_IDS, type T2BackendId } from '@rca-bench-factory/core';
import { run } from '../src/run.js';

/**
 * `rca-bench pull` end to end, against real servers.
 *
 * The six readers have each been driven against a routed fixture before
 * (`packages/core/test/backend-support.test.ts`), but always by calling the
 * function the registry holds. This file drives the same six through `argv` --
 * `parseCliArgs`, `runPull`, a real HTTP request and a real JSON document -- so
 * that what it proves is the *command*, not the registry row. A backend that is
 * implemented and unreachable from the command line fails here.
 *
 * No mocking library is used: the servers are `node:http` sockets on a loopback
 * port, and stdout/stderr are the runner's injected sinks.
 */

const servers: { close: () => Promise<void> }[] = [];
const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs.length = 0;
});

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rca-bench-pull-'));
  dirs.push(dir);
  return dir;
}

/** The output sinks, kept so a test can assert on what each stream carried. */
function capture(): {
  out: string[];
  err: string[];
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
} {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (chunk) => out.push(chunk), stderr: (chunk) => err.push(chunk) };
}

/**
 * One fixture server, routed by path, answering all six shapes.
 *
 * Two of the answers deliberately carry damage the reader is supposed to report
 * rather than hide: Prometheus writes a series with no `__name__` beside a sound
 * one, and Loki's envelope carries a `warnings` array. Without them the
 * quarantine and warning paths would only ever be exercised by a unit test, and
 * the command's job is to *carry* those to a terminal.
 */
async function serveBackends(): Promise<string> {
  const matrix = JSON.stringify({
    status: 'success',
    data: {
      resultType: 'matrix',
      result: [
        {
          metric: { __name__: 'process_cpu_seconds_total', service: 'payments' },
          values: [[1_700_000_000, '1.5']],
        },
        // No `__name__`: a series that has no name to report, which the reader
        // quarantines with a reason instead of inventing one.
        { metric: { service: 'payments' }, values: [[1_700_000_000, '2.5']] },
      ],
    },
  });
  const traces = JSON.stringify({
    data: [
      {
        traceID: '4d2f1c9ab7e35401',
        spans: [
          {
            traceID: '4d2f1c9ab7e35401',
            spanID: 'a1b2c3d4e5f60718',
            operationName: 'GET /checkout',
            startTime: 1_700_000_000_000_000,
            duration: 12_500,
            tags: [{ key: 'span.kind', type: 'string', value: 'server' }],
            processID: 'p1',
          },
        ],
        processes: { p1: { serviceName: 'payments', tags: [] } },
        warnings: null,
      },
    ],
    total: 1,
    limit: 0,
    offset: 0,
    errors: null,
  });
  const streams = JSON.stringify({
    status: 'success',
    data: {
      resultType: 'streams',
      result: [
        {
          stream: { service_name: 'payments', filename: '/var/log/payments.log' },
          values: [['1700000000123456789', 'upstream 10.20.30.40 refused']],
        },
      ],
    },
    warnings: ['the response was limited by the server'],
  });
  // A search that did not finish: the deadline passed, a shard failed, and the
  // cluster stopped counting. All three are facts the command has to carry to a
  // terminal rather than leave in the document.
  const hits = JSON.stringify({
    took: 3,
    timed_out: true,
    _shards: { total: 2, successful: 1, failed: 1 },
    hits: {
      total: { value: 1, relation: 'gte' },
      hits: [
        {
          _index: 'payments-000001',
          _id: 'abc',
          _source: {
            '@timestamp': '2023-11-14T22:13:20.123Z',
            message: 'upstream 10.20.30.40 refused',
            'service.name': 'payments',
          },
        },
      ],
    },
  });
  // A page that continues, and one event the requested window excludes: the
  // first is `hasMore`, the second is `outsideWindow`, and the in-window event
  // is what keeps this case a successful read rather than an empty one.
  const events = JSON.stringify({
    kind: 'EventList',
    apiVersion: 'v1',
    metadata: { resourceVersion: '7431', continue: 'next-page-token' },
    items: [
      {
        metadata: { name: 'checkout-7f9c.17a1b2' },
        involvedObject: { kind: 'Pod', name: 'checkout-7f9c' },
        reason: 'BackOff',
        message: 'Back-off restarting failed container',
        type: 'Warning',
        count: 3,
        lastTimestamp: '2023-11-14T22:13:20.123Z',
      },
      {
        metadata: { name: 'checkout-7f9c.99ff00' },
        involvedObject: { kind: 'Pod', name: 'checkout-7f9c' },
        reason: 'Scheduled',
        message: 'Successfully assigned to a node',
        type: 'Normal',
        count: 1,
        lastTimestamp: '2020-01-01T00:00:00Z',
      },
    ],
  });
  // Two rows answered against a `--limit 1`, and a `rows_before_limit_at_least`
  // the statement's own LIMIT set: the first makes `page.truncated` true, the
  // second is the count the backend admits it stopped at.
  const envelope = {
    meta: [
      { name: 'ts', type: 'DateTime64(3)' },
      { name: 'service_name', type: 'LowCardinality(String)' },
      { name: 'body', type: 'String' },
    ],
    data: [
      { ts: '2023-11-14T22:13:20.123Z', service_name: 'payments', body: 'upstream 10.20.30.40 refused' },
      { ts: '2023-11-14T22:13:21.123Z', service_name: 'payments', body: 'connection reset by peer' },
    ],
    rows: 2,
    rows_before_limit_at_least: 9,
    statistics: { elapsed: 0.001, rows_read: 2, bytes_read: 128 },
  };

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      const url = req.url ?? '';
      const body = Buffer.concat(chunks).toString('utf8');
      // ClickHouse is routed on the statement rather than the path: its endpoint
      // is the root, so the statement is what names the query.
      if (body.includes('FROM otel_logs')) res.end(JSON.stringify(envelope));
      else if (url.startsWith('/api/traces')) res.end(traces);
      else if (url.startsWith('/loki/api/v1/query_range')) res.end(streams);
      else if (url.includes('/_search')) res.end(hits);
      else if (url.includes('/events')) res.end(events);
      else res.end(matrix);
    });
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the fixture server did not bind');
  servers.push({ close: () => new Promise<void>((resolve) => server.close(() => resolve())) });
  return `http://127.0.0.1:${address.port}`;
}

/**
 * The argv that drives each backend, as a reader would type it.
 *
 * Keyed by id and total, so a seventh backend in the registry fails this file's
 * typecheck until somebody writes its driver -- the same shape
 * `backend-support.test.ts` uses, and for the same reason: a list of ids checked
 * by a list of cases passes when both are missing the same entry.
 */
const DRIVE: Record<T2BackendId, (baseUrl: string) => string[]> = {
  prometheus: (baseUrl) => [
    '--base-url',
    baseUrl,
    '--query',
    'up',
    '--start',
    '1700000000',
    '--end',
    '1700000060',
    '--step',
    '15s',
  ],
  jaeger: (baseUrl) => [
    '--base-url',
    baseUrl,
    '--service',
    'payments',
    '--start',
    '1700000000',
    '--end',
    '1700000060',
    '--limit',
    '20',
  ],
  loki: (baseUrl) => [
    '--base-url',
    baseUrl,
    '--query',
    '{service_name="payments"}',
    '--start',
    '1700000000',
    '--end',
    '1700000060',
    '--limit',
    '20',
    '--direction',
    'backward',
    '--service-label',
    'service_name',
  ],
  elasticsearch: (baseUrl) => [
    '--base-url',
    baseUrl,
    '--index',
    'payments-*',
    '--start',
    '1700000000',
    '--end',
    '1700000060',
    '--size',
    '20',
    '--timestamp-format',
    'iso8601',
    '--sort-direction',
    'desc',
    '--fields',
    '{"timestamp":"@timestamp","message":"message","service":"service.name"}',
  ],
  clickhouse: (baseUrl) => [
    '--base-url',
    baseUrl,
    '--query',
    'SELECT * FROM otel_logs',
    '--columns',
    '{"timestamp":"ts","message":"body","service":"service_name"}',
    // One row fewer than the backend answered, which is what makes the page
    // report itself truncated rather than complete.
    '--limit',
    '1',
    '--user',
    'default',
  ],
  kubernetes: (baseUrl) => [
    '--base-url',
    baseUrl,
    '--service',
    'payments',
    '--token',
    'a-bearer-token',
    '--limit',
    '20',
    '--timestamp-field',
    'lastTimestamp',
    // A window the fixture's second event falls outside of, so `outsideWindow`
    // counts something rather than always being zero.
    '--start',
    '1700000000',
    '--end',
    '1700000060',
  ],
};

describe('run - pull drives every implemented backend', () => {
  it('reads signals from each of the six, through argv', async () => {
    const baseUrl = await serveBackends();
    for (const id of T2_IMPLEMENTED_BACKEND_IDS) {
      const { out, stdout, stderr } = capture();
      const code = await run(['pull', '--backend', id, ...DRIVE[id](baseUrl)], { stdout, stderr });
      expect(code, `${id} should exit 0`).toBe(0);
      const payload = JSON.parse(out.join(''));
      expect(payload.backend, `${id} should name itself`).toBe(id);
      expect(payload.signals.length, `${id} should have read a signal`).toBeGreaterThan(0);
    }
  });
});

describe('run - pull writes one document and reports the rest', () => {
  it('prints the payload to stdout when no --output is given', async () => {
    const baseUrl = await serveBackends();
    const { out, stdout, stderr } = capture();
    const code = await run(['pull', '--backend', 'jaeger', ...DRIVE.jaeger(baseUrl)], { stdout, stderr });
    expect(code).toBe(0);
    const payload = JSON.parse(out.join(''));
    // The document is the reader's own result with `backend` added: Jaeger's
    // fourth field is `warnings`, and it survives the trip rather than being
    // flattened into a least-common-denominator shape.
    expect(Object.keys(payload).sort()).toEqual(['backend', 'ok', 'quarantine', 'signals', 'warnings']);
  });

  it('keeps each backend\'s own extra fields, rather than flattening them away', async () => {
    const baseUrl = await serveBackends();
    const shapes: Record<string, string> = {
      elasticsearch: 'partial',
      clickhouse: 'page',
      kubernetes: 'page',
    };
    for (const [id, field] of Object.entries(shapes)) {
      const { out, stdout, stderr } = capture();
      const code = await run(['pull', '--backend', id, ...DRIVE[id as T2BackendId](baseUrl)], { stdout, stderr });
      expect(code, `${id} should exit 0`).toBe(0);
      expect(JSON.parse(out.join('')), `${id} should carry '${field}'`).toHaveProperty(field);
    }
  });

  it('writes the same document to --output instead', async () => {
    const baseUrl = await serveBackends();
    const cwd = await makeDir();
    const { out, stdout, stderr } = capture();
    const code = await run(['pull', '--backend', 'jaeger', ...DRIVE.jaeger(baseUrl), '--output', 'signals.json'], {
      cwd,
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(out.join('')).toBe('');
    const written = JSON.parse(await readFile(join(cwd, 'signals.json'), 'utf8'));
    expect(written.backend).toBe('jaeger');
    expect(written.signals.length).toBeGreaterThan(0);
  });

  it('names quarantined records on stderr while still exiting 0', async () => {
    const baseUrl = await serveBackends();
    const { out, err, stdout, stderr } = capture();
    const code = await run(['pull', '--backend', 'prometheus', ...DRIVE.prometheus(baseUrl)], { stdout, stderr });
    expect(code).toBe(0);
    // The sound series and the nameless one: the command read telemetry *and*
    // lost some, and only saying so distinguishes it from reading less.
    const payload = JSON.parse(out.join(''));
    expect(payload.signals).toHaveLength(1);
    expect(payload.quarantine).toHaveLength(1);
    expect(err.join('')).toMatch(/1 record\(s\) quarantined/);
    expect(err.join('')).toMatch(/__name__/);
  });

  it('says when a search answered without finishing', async () => {
    const baseUrl = await serveBackends();
    const { err, stdout, stderr } = capture();
    const code = await run(['pull', '--backend', 'elasticsearch', ...DRIVE.elasticsearch(baseUrl)], {
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(err.join('')).toMatch(/the search timed out before it finished/);
    expect(err.join('')).toMatch(/1 shard\(s\) failed/);
    expect(err.join('')).toMatch(/stopped counting/);
  });

  it('says when a page was cut short, and when the statement counted more than it returned', async () => {
    const baseUrl = await serveBackends();
    const { err, stdout, stderr } = capture();
    const code = await run(['pull', '--backend', 'clickhouse', ...DRIVE.clickhouse(baseUrl)], { stdout, stderr });
    expect(code).toBe(0);
    expect(err.join('')).toMatch(/cut the page short/);
    expect(err.join('')).toMatch(/LIMIT matched at least 9 row\(s\)/);
  });

  it('says when a list continues, and how many events the window excluded', async () => {
    const baseUrl = await serveBackends();
    const { err, stdout, stderr } = capture();
    const code = await run(['pull', '--backend', 'kubernetes', ...DRIVE.kubernetes(baseUrl)], { stdout, stderr });
    expect(code).toBe(0);
    expect(err.join('')).toMatch(/more events than this page/);
    expect(err.join('')).toMatch(/1 event\(s\) fall outside the requested window/);
  });

  it("passes the backend's own warnings through on stderr", async () => {
    const baseUrl = await serveBackends();
    const { err, stdout, stderr } = capture();
    const code = await run(['pull', '--backend', 'loki', ...DRIVE.loki(baseUrl)], { stdout, stderr });
    expect(code).toBe(0);
    expect(err.join('')).toMatch(/the response was limited by the server/);
  });
});

describe('run - pull fails loudly', () => {
  it("exits 1 with the reader's error for every backend when the server is unreachable", async () => {
    // Port 1 on loopback is reserved and nothing listens on it, so the request is
    // made and refused. Every backend is tried rather than one: the failure path
    // is per-reader -- Prometheus wraps a `TypeError`, Loki a `TimeoutError` --
    // and a case for one of them says nothing about the other five.
    for (const id of T2_IMPLEMENTED_BACKEND_IDS) {
      const { err, stdout, stderr } = capture();
      const code = await run(['pull', '--backend', id, ...DRIVE[id]('http://127.0.0.1:1')], { stdout, stderr });
      expect(code, `${id} should exit 1`).toBe(1);
      expect(err.join(''), `${id} should name the failure`).toMatch(/^error: /);
      expect(err.join(''), `${id} should name the host it could not reach`).toMatch(/127\.0\.0\.1:1/);
    }
  });

  it('exits 1 and reports the parse error for an unknown backend', async () => {
    const { err, stdout, stderr } = capture();
    const code = await run(['pull', '--backend', 'graphite', '--base-url', 'http://127.0.0.1:1'], { stdout, stderr });
    expect(code).toBe(1);
    expect(err.join('')).toMatch(/--backend/);
  });

  it('exits 1 when a required flag is missing', async () => {
    const { err, stdout, stderr } = capture();
    const code = await run(['pull', '--backend', 'loki', '--base-url', 'http://127.0.0.1:1'], { stdout, stderr });
    expect(code).toBe(1);
    expect(err.join('')).toMatch(/requires --query/);
  });

  it('exits 1 when the backend refuses the request', async () => {
    const { err, stdout, stderr } = capture();
    // A server that answers 500 to everything: the reader maps a non-2xx into
    // `ok: false` with the status in the message, and the command turns that
    // into exit 1 rather than an empty document.
    const server = createServer((_req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"status":"error","errorType":"internal","error":"boom"}');
    });
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('the 500 server did not bind');
    servers.push({ close: () => new Promise<void>((resolve) => server.close(() => resolve())) });

    const code = await run(['pull', '--backend', 'loki', ...DRIVE.loki(`http://127.0.0.1:${address.port}`)], {
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(err.join('')).toMatch(/HTTP 500/);
  });
});
