import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  backendEntry,
  findBackend,
  T2_BACKENDS,
  T2_BACKEND_IDS,
  type T2BackendId,
} from '../src/ingest/backends.js';

/**
 * The T2 backend registry, and the rule that makes it a measurement.
 *
 * P1-5 asks for six backends to be measured one by one and the unsupported ones
 * declared explicitly. A table claiming "Prometheus: supported" is the shape this
 * campaign has found five times -- a published claim with no reader, which is
 * silently wrong the moment the code moves. So the claim is checked from both
 * ends here:
 *
 *   - **upward**: the committed snapshot `golden-master/backend-support.json`,
 *     which `docs/architecture.md`'s matrix is held to by
 *     `scripts/check-backend-support.mjs`, must equal what this registry derives;
 *   - **downward**: every backend the registry calls `implemented` must be
 *     *driven*, over a real socket, by a case in `DRIVERS` below. A registry entry
 *     that says "supported" and cannot be exhibited fails here.
 *
 * The second is the one that matters. `verify-gates-are-testable.mjs` established
 * the general form for gates -- a mechanism is only known to work when something
 * outside it has tried to make it fail -- and the same claim about *capability*
 * has to be exhibited rather than asserted, or "supported" means "we wrote the
 * word".
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SNAPSHOT = resolve(ROOT, 'golden-master', 'backend-support.json');

const servers: { close: () => Promise<void> }[] = [];

afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

/**
 * One fixture server, routed by path, answering each implemented backend's shape.
 *
 * One server rather than one per backend because the driver table is keyed by id
 * and the check that drives it is a single loop: a server that only spoke
 * Prometheus would make the Jaeger driver's fixture a second thing to keep in step
 * with the first, and the routing is the whole of the difference.
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
      ],
    },
  });
  // The shape Jaeger's query API answers in: hex ids, microseconds, and a
  // `processes` table beside the spans rather than inside them.
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
  });
  // The shape a search answers in: hits, each with a `_source` the caller declared
  // three field names for.
  const hits = JSON.stringify({
    took: 3,
    timed_out: false,
    _shards: { total: 1, successful: 1, failed: 0 },
    hits: {
      total: { value: 1, relation: 'eq' },
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
  // The shape a list answers in: an EventList whose items carry the fields the IR's
  // event payload was built for.
  const events = JSON.stringify({
    kind: 'EventList',
    apiVersion: 'v1',
    metadata: { resourceVersion: '7431' },
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
    ],
  });
  // The shape a statement answers in: a JSON envelope whose `meta` block types every
  // column, which is what lets this reader check a declaration instead of believing it.
  const envelope = {
    meta: [
      { name: 'ts', type: 'DateTime64(3)' },
      { name: 'service_name', type: 'LowCardinality(String)' },
      { name: 'body', type: 'String' },
    ],
    data: [{ ts: '2023-11-14T22:13:20.123Z', service_name: 'payments', body: 'upstream 10.20.30.40 refused' }],
    rows: 1,
    statistics: { elapsed: 0.001, rows_read: 1, bytes_read: 64 },
  };
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      const url = req.url ?? '';
      const body = Buffer.concat(chunks).toString('utf8');
      // ClickHouse is routed on the statement rather than the path, because its
      // endpoint is the root: the statement is what says which query this is.
      if (body.includes('FROM otel_logs')) res.end(JSON.stringify(envelope));
      else if (url.startsWith('/api/traces')) res.end(traces);
      else if (url.startsWith('/loki/api/v1/query_range')) res.end(streams);
      else if (url.includes('/_search')) res.end(hits);
      else if (url.includes('/events')) res.end(events);
      else res.end(matrix);
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the fixture server did not bind');
  servers.push({ close: () => new Promise<void>((r) => server.close(() => r())) });
  return `http://127.0.0.1:${address.port}`;
}

/**
 * How to drive each backend the registry calls implemented.
 *
 * Keyed by id, and read as a *table of drivers* rather than as a list of ids, so
 * the check below fails on a missing driver rather than passing on a missing
 * assertion. A hand list of ids would be the same defect one level in: the list
 * would have to be updated by whoever adds a backend, and the failure mode of
 * forgetting is silence.
 */
const DRIVERS: Record<T2BackendId, (baseUrl: string) => Promise<number>> = {
  prometheus: async (baseUrl) => {
    const entry = backendEntry('prometheus');
    if (entry === null) throw new Error('prometheus is declared implemented and has no entry');
    const result = await entry({
      baseUrl,
      query: 'up',
      start: 1_700_000_000,
      end: 1_700_000_060,
      step: '15s',
    });
    if (!result.ok) throw new Error(`the pull failed: ${result.error}`);
    return result.signals.length;
  },
  jaeger: async (baseUrl) => {
    const entry = backendEntry('jaeger');
    if (entry === null) throw new Error('jaeger is declared implemented and has no entry');
    const result = await entry({
      baseUrl,
      service: 'payments',
      start: 1_700_000_000,
      end: 1_700_000_060,
      limit: 20,
    });
    if (!result.ok) throw new Error(`the pull failed: ${result.error}`);
    return result.signals.length;
  },
  loki: async (baseUrl) => {
    const entry = backendEntry('loki');
    if (entry === null) throw new Error('loki is declared implemented and has no entry');
    const result = await entry({
      baseUrl,
      query: '{service_name="payments"}',
      start: 1_700_000_000,
      end: 1_700_000_060,
      limit: 20,
      direction: 'backward',
      // The label the reader is told to read, which is the whole of what this
      // backend's registry reason used to call impossible.
      serviceLabel: 'service_name',
    });
    if (!result.ok) throw new Error(`the pull failed: ${result.error}`);
    return result.signals.length;
  },
  elasticsearch: async (baseUrl) => {
    const entry = backendEntry('elasticsearch');
    if (entry === null) throw new Error('elasticsearch is declared implemented and has no entry');
    const result = await entry({
      baseUrl,
      index: 'payments-*',
      start: 1_700_000_000,
      end: 1_700_000_060,
      size: 20,
      timestampFormat: 'iso8601',
      sortDirection: 'asc',
      // The declaration the registry's reason said a reader would need before it
      // could read anything at all, supplied as an argument instead of assumed.
      fields: { timestamp: '@timestamp', message: 'message', service: 'service.name' },
    });
    if (!result.ok) throw new Error(`the pull failed: ${result.error}`);
    return result.signals.length;
  },
  kubernetes: async (baseUrl) => {
    const entry = backendEntry('kubernetes');
    if (entry === null) throw new Error('kubernetes is declared implemented and has no entry');
    const result = await entry({
      baseUrl,
      // The service is the caller's declaration: an event about a pod names none, and
      // turning a pod name into one is a per-cluster convention this reader refuses.
      service: 'payments',
      token: 'sa-token',
      limit: 20,
      timestampField: 'lastTimestamp',
      namespace: 'payments',
    });
    if (!result.ok) throw new Error(`the pull failed: ${result.error}`);
    return result.signals.length;
  },
  clickhouse: async (baseUrl) => {
    const entry = backendEntry('clickhouse');
    if (entry === null) throw new Error('clickhouse is declared implemented and has no entry');
    const result = await entry({
      baseUrl,
      // The statement is free and the declaration is what keeps the result typed: the
      // registry's reason treated a caller-written statement as the obstacle, and it
      // is the interface.
      query: 'SELECT ts, service_name, body FROM otel_logs ORDER BY ts LIMIT 20',
      columns: { timestamp: 'ts', message: 'body', service: 'service_name' },
      limit: 20,
      user: 'default',
    });
    if (!result.ok) throw new Error(`the pull failed: ${result.error}`);
    return result.signals.length;
  },
};

describe('the T2 backend registry', () => {
  it('lists the six backends the requirement names, in the order it names them', () => {
    // Both directions, so an id added to the tuple without a registry entry and a
    // registry entry for an id the tuple does not carry are both failures. This
    // is the same rule the export-surface enumeration applies to symbols.
    expect(T2_BACKENDS.map((b) => b.id)).toEqual([...T2_BACKEND_IDS]);
  });

  it('gives every backend a status from the closed vocabulary', () => {
    for (const backend of T2_BACKENDS) {
      expect(['implemented', 'unsupported']).toContain(backend.status);
    }
  });

  it('makes "implemented" mean a callable entry point, not a word', () => {
    const implemented = T2_BACKENDS.filter((b) => b.status === 'implemented');
    expect(implemented.length, 'no backend is implemented, so nothing below would be exercised').toBeGreaterThan(0);
    for (const backend of implemented) {
      expect(typeof backend.entry, `${backend.id} is implemented with no entry`).toBe('function');
      expect(backend.summary.length, `${backend.id}'s summary is too short to describe a wire format`).toBeGreaterThan(20);
    }
  });

  it('pairs each status with the fields that status requires, in both directions', () => {
    // Both directions, so a row cannot carry the vocabulary of the state it is not in:
    // an `unsupported` row with an `entry` is a reader this file refuses to let the
    // registry deny, and an `implemented` row with a `reason` is a doubt that was left
    // behind after the reader answered it.
    for (const backend of T2_BACKENDS) {
      if (backend.status === 'implemented') {
        expect(backend.reason, `${backend.id} is implemented and still carries a reason`).toBeUndefined();
      } else {
        expect(
          (backend as { reason: string }).reason.length,
          `${backend.id}'s reason is too short: "not implemented yet" reads the same whether the ` +
            `work is a week or impossible, which is what a reason is for`,
        ).toBeGreaterThanOrEqual(40);
        expect(
          (backend as { entry?: unknown }).entry,
          `${backend.id} is unsupported and has an entry, so the registry denies a reader it has`,
        ).toBeUndefined();
      }
    }
    const reasons = T2_BACKENDS.filter((b) => b.status === 'unsupported').map((b) => b.reason);
    expect(
      new Set(reasons).size,
      'two unsupported backends share a reason, so one of the two was never justified',
    ).toBe(reasons.length);
  });

  it('states which of the two states the registry is in, rather than leaving it to be read off', () => {
    // Finding 167 closed the last row, so the set below is empty -- and an empty set
    // read off a list is indistinguishable from a set nobody filled in. This line is
    // the claim: every one of the six has been pointed at a wire format. Flipping any
    // row back means editing this line and writing a reason of substance, which is the
    // point -- the state change costs a deliberate edit rather than a silent delete.
    const implemented = T2_BACKENDS.filter((b) => b.status === 'implemented');
    const unsupported = T2_BACKENDS.filter((b) => b.status === 'unsupported');
    expect(implemented.length + unsupported.length).toBe(T2_BACKEND_IDS.length);
    expect(unsupported.map((b) => b.id)).toEqual([]);
  });

  // Upward: the published snapshot is what the cold-tree job and the document
  // guard read, and it cannot be regenerated there because that job may not
  // build. So the suite is where it is proved current.
  it('holds the committed snapshot equal to the registry it is derived from', () => {
    const committed = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as {
      backends: { id: string; status: string; summary?: string; reason?: string }[];
    };
    const derived = T2_BACKENDS.map((backend) =>
      backend.status === 'implemented'
        ? { id: backend.id, status: backend.status, summary: backend.summary }
        : { id: backend.id, status: backend.status, reason: backend.reason },
    );
    expect(
      committed.backends,
      'golden-master/backend-support.json is stale; run `node scripts/derive-backend-support.mjs`',
    ).toEqual(derived);
  });

  // Downward: every backend called implemented is driven, over a real socket.
  it.each(T2_BACKENDS.filter((b) => b.status === 'implemented').map((b) => b.id))(
    'exhibits the %s capability rather than asserting it',
    async (id) => {
      const baseUrl = await serveBackends();
      const signals = await DRIVERS[id](baseUrl);
      expect(signals, `${id}'s driver produced no signal, so the capability is not shown`).toBeGreaterThan(0);
    },
  );

  it('refuses a driver for a backend the registry calls unsupported', async () => {
    // The other direction of the same rule: the drivers table must not claim a
    // capability the registry denies, because that is how a table of tests
    // becomes evidence for something the code does not do.
    for (const backend of T2_BACKENDS.filter((b) => b.status === 'unsupported')) {
      await expect(DRIVERS[backend.id]('http://127.0.0.1:1')).rejects.toThrow('declared unsupported');
    }
  });

  it('answers "no entry point" for every backend that is not implemented', () => {
    for (const backend of T2_BACKENDS) {
      const entry = backendEntry(backend.id);
      if (backend.status === 'implemented') expect(entry).toBe(backend.entry);
      else expect(entry, `${backend.id} is unsupported and returned an entry`).toBeNull();
    }
  });

  it('answers for an id that is not one of the six', () => {
    expect(findBackend('tempo')).toBeUndefined();
    expect(backendEntry('tempo')).toBeNull();
  });
});
