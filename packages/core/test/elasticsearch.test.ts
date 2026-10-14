import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ELASTICSEARCH_SORT_DIRECTIONS,
  ELASTICSEARCH_TIMESTAMP_FORMATS,
  pullElasticsearchLogs,
} from '../src/ingest/elasticsearch.js';

/**
 * The Elasticsearch puller, driven over a real socket.
 *
 * ## What this file is, and what it is not
 *
 * Every case below runs against `node:http` on `127.0.0.1`. Nothing in this
 * repository has contacted an Elasticsearch cluster, so these tests are evidence
 * that the reader implements the documented wire format, not that a cluster
 * answered it. The Prometheus reader earned the stronger claim by being pointed at a
 * real server (finding 154); this one has not, and both the registry's summary and
 * `docs/architecture.md` say so.
 *
 * ## Why the declaration is the subject
 *
 * The registry's reason for calling this backend unsupported was that the timestamp,
 * message and service fields are per-index decisions, so "a reader would need a field
 * mapping supplied by the caller before it could read anything at all". That is the
 * finding 161 shape: the clause is true and the conclusion is the interface. The field
 * mapping is a required argument here, and so is the *encoding* of the timestamp --
 * Elasticsearch serialises a `date` field as an ISO-8601 string or as epoch
 * milliseconds depending on the field's own format, so a reader that sniffed the JSON
 * type would be reading two different index configurations as one.
 */

const servers: Server[] = [];

afterAll(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
});

/** A server that answers whatever the case wants, and records what it was asked. */
async function serve(
  reply: (request: { url: string; method: string; body: string }) => { status: number; body: string } | 'never',
): Promise<{ baseUrl: string; requests: { url: string; method: string; body: string }[] }> {
  const requests: { url: string; method: string; body: string }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const request = { url: req.url ?? '', method: req.method ?? '', body: Buffer.concat(chunks).toString('utf8') };
      requests.push(request);
      const answer = reply(request);
      if (answer === 'never') return; // accepts the connection and says nothing
      res.writeHead(answer.status, { 'content-type': 'application/json' });
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
const WINDOW = {
  index: 'payments-*',
  start: 1_700_000_000,
  end: 1_700_000_060,
  size: 100,
  timestampFormat: 'iso8601',
  sortDirection: 'asc',
  fields: { timestamp: '@timestamp', message: 'message', service: 'service.name' },
} as const;

/** One hit, in the shape Elasticsearch writes it: metadata beside a `_source`. */
function hit(source: unknown, extra: Record<string, unknown> = {}): unknown {
  return { _index: 'payments-000001', _id: 'abc', _score: 1, _source: source, ...extra };
}

/** The envelope `_search` answers with. */
function searchEnvelope(hits: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    took: 3,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { total: { value: hits.length, relation: 'eq' }, max_score: 1, hits },
    ...extra,
  });
}

/** A `_source` that satisfies the declaration, with the fields the case varies. */
function source(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    '@timestamp': '2023-11-14T22:13:20.123Z',
    message: 'upstream 10.20.30.40 refused',
    'service.name': 'payments',
    ...overrides,
  };
}

describe('ingest/elasticsearch · the search reader', () => {
  it('maps a hit to one signal per hit, with the declared fields and nothing guessed', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: searchEnvelope([hit(source()), hit(source({ '@timestamp': '2023-11-14T22:13:21.123Z', message: 'second' }))]),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error(`expected success, got ${result.error}`);

    expect(result.signals).toHaveLength(2);
    expect(result.signals[0]?.resource).toEqual({ 'service.name': 'payments' });
    expect(result.signals[0]?.payload).toEqual({ kind: 'log', body: 'upstream 10.20.30.40 refused' });
    expect(result.signals[0]?.timestamp).toBe('2023-11-14T22:13:20.123Z');
    expect(result.signals[0]?.rawOffsetMinutes).toBe(0);
    expect(result.signals[0]?.provenance['payload.body']).toEqual({ source: 'direct' });
    expect(result.quarantine).toEqual([]);
  });

  it('asks the search endpoint for the window, the size and the sort the caller declared', async () => {
    const stub = await serve(() => ({ status: 200, body: searchEnvelope([]) }));
    await pullElasticsearchLogs({
      baseUrl: `${stub.baseUrl}/`,
      ...WINDOW,
      query: { match: { message: 'refused' } },
    });

    const request = stub.requests[0];
    expect(request?.method).toBe('POST');
    // The index is part of the path, and the reader does not default it: `/` alone
    // would search every index in the cluster.
    expect(new URL(stub.baseUrl + (request?.url ?? '')).pathname).toBe('/payments-*/_search');
    const body = JSON.parse(request?.body ?? '{}') as Record<string, unknown>;
    expect(body['size']).toBe(100);
    // Sorted by the field the caller declared as the timestamp, in the direction the
    // caller declared: with a size limit it decides which end of the window survives.
    expect(body['sort']).toEqual([{ '@timestamp': 'asc' }]);
    expect(body['query']).toEqual({
      bool: {
        must: [{ match: { message: 'refused' } }],
        filter: [
          {
            range: {
              '@timestamp': {
                gte: '2023-11-14T22:13:20.000Z',
                lte: '2023-11-14T22:14:20.000Z',
                format: 'strict_date_optional_time',
              },
            },
          },
        ],
      },
    });
  });

  it('names the range format it sent, because the parse of a date field is the index’s own decision', async () => {
    // Two encodings, and the declaration decides which one is sent and read. A reader
    // that sniffed the JSON type would be reading two index configurations as one.
    const stub = await serve(() => ({ status: 200, body: searchEnvelope([]) }));
    await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW, timestampFormat: 'epoch_millis' });
    const body = JSON.parse(stub.requests[0]?.body ?? '{}') as {
      query: { bool: { filter: { range: Record<string, { gte: unknown; lte: unknown; format: string }> }[] } };
    };
    const range = body.query.bool.filter[0]?.range['@timestamp'];
    expect(range).toEqual({ gte: 1_700_000_000_000, lte: 1_700_000_060_000, format: 'epoch_millis' });
  });

  it('reads the epoch-millis serialisation when the caller declared it', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: searchEnvelope([hit(source({ '@timestamp': 1_700_000_000_123 }))]),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW, timestampFormat: 'epoch_millis' });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.timestamp).toBe('2023-11-14T22:13:20.123Z');
  });

  it('quarantines the other serialisation rather than reading it as the declared one', async () => {
    // The declaration is authoritative: an ISO string in a field declared
    // epoch_millis is a configuration the caller did not describe, and the reason
    // says which declaration to change.
    const stub = await serve(() => ({ status: 200, body: searchEnvelope([hit(source())]) }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW, timestampFormat: 'epoch_millis' });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine[0]?.reason).toContain('declared epoch_millis');
  });

  it('quarantines a hit whose declared timestamp is not a timestamp', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: searchEnvelope([
        hit(source({ '@timestamp': 'the fourteenth' })),
        hit(source({ '@timestamp': true })),
        hit(source({ '@timestamp': null })),
      ]),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine).toHaveLength(3);
    expect(result.quarantine[0]?.reason).toContain('not a date this module can read');
    // Indexed by the hit's position in the response, so a reader can find it again.
    expect(result.quarantine.map((q) => q.index)).toEqual([0, 1, 2]);
  });

  it('quarantines a hit with no `_source`, which is where the declaration says the fields live', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: searchEnvelope([{ _index: 'payments-000001', _id: 'abc' }, hit('not an object'), hit([1, 2])]),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine).toHaveLength(3);
    expect(result.quarantine[0]?.reason).toContain('no `_source` object');
  });

  it('quarantines a hit whose declared service field is missing or empty, per hit', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: searchEnvelope([
        hit(source({ 'service.name': undefined })),
        hit(source({ 'service.name': '' })),
        hit(source({ 'service.name': 42 })),
        hit(source({ message: 'kept' })),
      ]),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    // Per hit rather than per response: one document without the field does not make
    // the answer unusable, and a reader that fell back to another hit's service would
    // look successful while being wrong.
    expect(result.signals.map((s) => s.payload)).toEqual([{ kind: 'log', body: 'kept' }]);
    expect(result.quarantine).toHaveLength(3);
    expect(result.quarantine[0]?.reason).toContain("declared service field 'service.name'");
  });

  it('quarantines a hit whose declared message field is missing or not a string', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: searchEnvelope([hit(source({ message: undefined })), hit(source({ message: 42 }))]),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine).toHaveLength(2);
    expect(result.quarantine[0]?.reason).toContain("declared message field 'message'");
  });

  it('keeps an empty message, which is a message the document carried', async () => {
    const stub = await serve(() => ({ status: 200, body: searchEnvelope([hit(source({ message: '' }))]) }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).toEqual({ kind: 'log', body: '' });
  });

  it('does not copy the document into the signal, because a document is not an identity', async () => {
    // Loki's label set is required to be low-cardinality identity, which is what the
    // IR's `resource` records; an Elasticsearch `_source` is a document, and its
    // fields are as likely to be payload as identity. Copying them in would invent a
    // convention per index -- the defect the registry's reason was about.
    const stub = await serve(() => ({
      status: 200,
      body: searchEnvelope([
        hit(source({ host: { name: 'node-7' }, env: 'prod', request_id: 'a1b2c3', nested: { deep: true } })),
      ]),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.resource).toEqual({ 'service.name': 'payments' });
  });

  it('never sets a severity, whatever the deployment called its level field', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: searchEnvelope([hit(source({ 'log.level': 'error', severity: 'critical' }))]),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).not.toHaveProperty('severityText');
  });

  it('keeps the order the backend returned, which the sort direction decides', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: searchEnvelope([
        hit(source({ '@timestamp': '2023-11-14T22:13:21.000Z', message: 'later' })),
        hit(source({ '@timestamp': '2023-11-14T22:13:20.000Z', message: 'earlier' })),
      ]),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW, sortDirection: 'desc' });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals.map((s) => (s.payload.kind === 'log' ? s.payload.body : ''))).toEqual(['later', 'earlier']);
  });

  it('reports the total the cluster gave, with the relation that makes it readable', async () => {
    // `gte` is Elasticsearch saying "at least this many", which `track_total_hits`
    // makes the normal answer above 10,000. Reporting the value without the relation
    // would present an approximate count as a measurement.
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({
        timed_out: false,
        _shards: { total: 2, successful: 2, failed: 0 },
        hits: { total: { value: 10_000, relation: 'gte' }, hits: [hit(source())] },
      }),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.total).toEqual({ value: 10_000, relation: 'gte' });
  });

  it('reports an exact total from a cluster that wrote it as a bare number', async () => {
    // Elasticsearch 6 wrote `hits.total` as a number and 7 wrote the object. Both are
    // the backend's own serialisation of one fact, and a number was exact.
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ hits: { total: 1, hits: [hit(source())] } }),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.total).toEqual({ value: 1, relation: 'eq' });
  });

  it('reports an unknown relation when the cluster wrote neither a count nor a relation', async () => {
    // `relation` is what stops an approximate count from reading as an exact one. A
    // cluster that wrote no relation at all is reported as having written none,
    // rather than as having written `eq`.
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ hits: { total: { value: 7 }, hits: [] } }),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.total).toEqual({ value: 7, relation: 'unknown' });
  });

  it('truncates the offending record it keeps in a quarantine row', async () => {
    // A quarantine record is meant to be read beside the reason, and a document
    // pasted whole would bury the reason it is there for.
    const stub = await serve(() => ({ status: 200, body: searchEnvelope([hit('x'.repeat(400))]) }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    const record = result.quarantine[0]?.record ?? '';
    expect(record).toHaveLength(203);
    expect(record.endsWith('...')).toBe(true);
  });

  it('leaves the total absent when the cluster did not report one', async () => {
    // `track_total_hits: false` omits the field. Inventing `0` would say the index
    // holds nothing, which is a different claim from "the cluster did not count".
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ hits: { hits: [hit(source())] } }),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.total).toBeUndefined();
    expect(result.signals).toHaveLength(1);
  });

  it('says so when the answer is partial, both ways Elasticsearch says it', async () => {
    // `timed_out` and a failed shard are the two ways a search can answer without
    // having finished. A reader that ignored them would report a partial answer as a
    // complete one, which is the failure the Prometheus reader's status branch exists
    // for, one backend over.
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({
        timed_out: true,
        _shards: { total: 5, successful: 4, failed: 1 },
        hits: { hits: [hit(source())] },
      }),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.partial).toEqual({ timedOut: true, failedShards: 1 });
    // The hits that did arrive are still signals: the answer is partial, not absent.
    expect(result.signals).toHaveLength(1);
  });

  it('reports a complete answer as complete', async () => {
    const stub = await serve(() => ({ status: 200, body: searchEnvelope([]) }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    expect(result.partial).toEqual({ timedOut: false, failedShards: 0 });
  });

  it('treats a response with no `_shards` block as neither complete nor failed in that block', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ timed_out: 'yes', hits: { hits: [] } }),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (!result.ok) throw new Error('expected success');
    // `timed_out` is only true when the backend said `true`: a string is not a
    // verdict, and reading it as one would be reading a parse failure as a fact.
    expect(result.partial).toEqual({ timedOut: false, failedShards: 0 });
  });

  it('refuses a pull that names no field mapping, because there is nothing to read without one', async () => {
    for (const field of ['timestamp', 'message', 'service'] as const) {
      const result = await pullElasticsearchLogs({
        baseUrl: 'http://127.0.0.1:1',
        ...WINDOW,
        fields: { ...WINDOW.fields, [field]: '' },
      });
      if (result.ok) throw new Error(`expected a refusal for an empty ${field} field`);
      expect(result.error).toContain(`no ${field} field was named`);
    }
  });

  it('refuses an index it would have to default', async () => {
    const result = await pullElasticsearchLogs({ baseUrl: 'http://127.0.0.1:1', ...WINDOW, index: '' });
    if (result.ok) throw new Error('expected a refusal');
    // An empty index means every index in the cluster, which is not a default a
    // reader is entitled to choose.
    expect(result.error).toContain('no index was named');
  });

  it('refuses a size that is not a positive integer, instead of falling back on the cluster default', async () => {
    // Elasticsearch defaults `size` to 10 hits, and the reader does not bound it: the
    // real upper bound is a per-index setting (`index.max_result_window`) that this
    // module cannot read, so a value above it is refused by the cluster and reported
    // with its status.
    for (const size of [0, -1, 1.5, Number.NaN]) {
      const result = await pullElasticsearchLogs({ baseUrl: 'http://127.0.0.1:1', ...WINDOW, size });
      if (result.ok) throw new Error(`expected a refusal for size ${String(size)}`);
      expect(result.error).toContain('size must be a positive integer');
    }
  });

  it('refuses a timestamp format or a sort direction outside the closed pairs', async () => {
    expect([...ELASTICSEARCH_TIMESTAMP_FORMATS]).toEqual(['iso8601', 'epoch_millis']);
    expect([...ELASTICSEARCH_SORT_DIRECTIONS]).toEqual(['asc', 'desc']);
    for (const timestampFormat of ['strict_date_optional_time', '', 'ISO8601']) {
      const result = await pullElasticsearchLogs({
        baseUrl: 'http://127.0.0.1:1',
        ...WINDOW,
        timestampFormat: timestampFormat as 'iso8601',
      });
      if (result.ok) throw new Error(`expected a refusal for ${timestampFormat}`);
      expect(result.error).toContain("timestampFormat must be one of 'iso8601' or 'epoch_millis'");
    }
    for (const sortDirection of ['up', '', 'ASC']) {
      const result = await pullElasticsearchLogs({
        baseUrl: 'http://127.0.0.1:1',
        ...WINDOW,
        sortDirection: sortDirection as 'asc',
      });
      if (result.ok) throw new Error(`expected a refusal for ${sortDirection}`);
      expect(result.error).toContain("sortDirection must be one of 'asc' or 'desc'");
    }
  });

  it('refuses a window whose end is before its start', async () => {
    const result = await pullElasticsearchLogs({ baseUrl: 'http://127.0.0.1:1', ...WINDOW, end: 1_699_999_000 });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('so the range is empty');
  });

  it('reads all three encodings of the window the other pullers accept', async () => {
    const stub = await serve(() => ({ status: 200, body: searchEnvelope([]) }));
    const asIso = await pullElasticsearchLogs({
      baseUrl: stub.baseUrl,
      ...WINDOW,
      start: '2023-11-14T22:13:20Z',
      end: '2023-11-14T22:14:20Z',
    });
    if (!asIso.ok) throw new Error(`expected success, got ${asIso.error}`);
    const asDate = await pullElasticsearchLogs({
      baseUrl: stub.baseUrl,
      ...WINDOW,
      start: new Date(1_700_000_000_000),
      end: new Date(1_700_000_060_000),
    });
    if (!asDate.ok) throw new Error(`expected success, got ${asDate.error}`);

    const windows = stub.requests.map(
      (r) =>
        (
          JSON.parse(r.body) as { query: { bool: { filter: { range: Record<string, { gte: string }> }[] } } }
        ).query.bool.filter[0]!.range['@timestamp']!.gte,
    );
    expect(windows).toEqual(['2023-11-14T22:13:20.000Z', '2023-11-14T22:13:20.000Z']);
  });

  it('refuses a window it cannot read, rather than sending an unparseable range', async () => {
    const bad = await pullElasticsearchLogs({ baseUrl: 'http://127.0.0.1:1', ...WINDOW, start: 'yesterday' });
    if (bad.ok) throw new Error('expected a refusal');
    expect(bad.error).toContain('start is not a time this module can read');

    const notFinite = await pullElasticsearchLogs({ baseUrl: 'http://127.0.0.1:1', ...WINDOW, end: Number.NaN });
    if (notFinite.ok) throw new Error('expected a refusal');
    expect(notFinite.error).toContain('end must be a finite number of seconds');

    const invalidDate = await pullElasticsearchLogs({
      baseUrl: 'http://127.0.0.1:1',
      ...WINDOW,
      start: new Date(Number.NaN),
    });
    if (invalidDate.ok) throw new Error('expected a refusal');
    expect(invalidDate.error).toContain('start is not a time this module can read');
  });
});

describe('ingest/elasticsearch · what makes the request meaningless', () => {
  it('reports a refused connection rather than throwing at the caller', async () => {
    const result = await pullElasticsearchLogs({ baseUrl: 'http://127.0.0.1:1', ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('/payments-*/_search ');
  });

  it('reports a socket that accepts and then says nothing, naming the bound', async () => {
    const stub = await serve(() => 'never');
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW, timeoutMs: 50 });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('did not answer within 50ms');
  });

  it('reports a non-2xx with its status and the head of its body', async () => {
    const stub = await serve(() => ({
      status: 400,
      body: '{"error":{"type":"search_phase_execution_exception","reason":"all shards failed"},"status":400}',
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('returned HTTP 400: {"error"');
  });

  it('reports a body that is not JSON', async () => {
    const stub = await serve(() => ({ status: 200, body: '<html>proxy</html>' }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('returned a body that is not JSON: <html>proxy</html>');
  });

  it('fails on the error object Elasticsearch wraps in a 200 body', async () => {
    // A defence rather than a reproduction: no cluster has been measured here, and
    // Elasticsearch answers a rejected search with a 4xx in every documented case.
    // It is kept because the alternative -- reading `hits` out of a body that carries
    // an error -- reports a failed search as an empty window.
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({
        error: { root_cause: [], type: 'index_not_found_exception', reason: 'no such index [payments-*]' },
        status: 404,
      }),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('the search failed (index_not_found_exception): no such index [payments-*]');
  });

  it('fails on an error object that names neither a type nor a reason', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ error: {} }) }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('the search failed (unknown): no reason given');
  });

  it('fails on a body that is not a JSON object', async () => {
    const stub = await serve(() => ({ status: 200, body: '[1,2,3]' }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('returned a body that is not a JSON object');
  });

  it('fails on a response with no `hits` block', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ took: 3, timed_out: false }) }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('returned no `hits` block');
  });

  it('fails on a hits block whose list is not a list', async () => {
    const stub = await serve(() => ({ status: 200, body: JSON.stringify({ hits: { total: 0, hits: null } }) }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain("`hits.hits` is not an array");
  });

  it('fails on a bare total that is not a count', async () => {
    // The older serialisation is a number, and a number that is not a whole count is
    // not that serialisation.
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ hits: { total: 1.5, hits: [] } }),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('not a count');
  });

  it('fails on a total that is neither a number nor an object with a numeric value', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ hits: { total: { value: 'many' }, hits: [] } }),
    }));
    const result = await pullElasticsearchLogs({ baseUrl: stub.baseUrl, ...WINDOW });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('`hits.total` is neither a number nor');
  });
});
