import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import {
  KUBERNETES_EVENTS_PATH,
  KUBERNETES_TIMESTAMP_FIELDS,
  pullKubernetesEvents,
} from '../src/ingest/kubernetes.js';

/**
 * The Kubernetes events reader, driven over a real socket.
 *
 * ## What this file is, and what it is not
 *
 * Every case below runs against `node:http` on `127.0.0.1`. Nothing in this
 * repository has contacted a Kubernetes API server, so these tests are evidence that
 * the reader implements the documented wire format, not that a cluster answered it.
 * The Prometheus reader earned the stronger claim by being pointed at a real server
 * (finding 154); this one has not, and the registry's summary says so.
 *
 * ## Why the payload is not the interesting part
 *
 * The registry's reason for calling this backend unsupported ended with two things it
 * said a reader would need from the caller: **credentials**, and a **translation
 * table**, "because its events use the `involvedObject` vocabulary rather than the OTel
 * resource attributes the IR is built on".
 *
 * The first is an interface and is a required argument. The second turns out not to be
 * needed at all: `EventPayload` in `ir/types.ts` carries `reason`, `message`, `type`,
 * `count` and **`involvedObject`** -- the IR was built with Kubernetes events in mind,
 * down to the field's own shape. What the IR does *not* have is a service for an event
 * whose subject is a Pod, and that is the caller's declaration here, because turning
 * `involvedObject.name` into a service name is a per-cluster convention (a ReplicaSet
 * hash, a label, a naming scheme) that this module refuses to invent.
 */

const servers: Server[] = [];

afterAll(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
});

/** A server that answers whatever the case wants, and records what it was asked. */
async function serve(
  reply: (request: { url: string; method: string; headers: Record<string, string | undefined> }) =>
    | { status: number; body: string }
    | 'never',
): Promise<{ baseUrl: string; requests: { url: string; method: string; headers: Record<string, string | undefined> }[] }> {
  const requests: { url: string; method: string; headers: Record<string, string | undefined> }[] = [];
  const server = createServer((req, res) => {
    const request = { url: req.url ?? '', method: req.method ?? '', headers: req.headers as Record<string, string | undefined> };
    requests.push(request);
    const answer = reply(request);
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

/** What every case starts from, unless it is the thing under test. */
const PULL = {
  service: 'payments',
  token: 'sa-token',
  limit: 50,
  timestampField: 'lastTimestamp',
  namespace: 'payments',
} as const;

/** One event, in the shape `core/v1` writes it. */
function event(overrides: Record<string, unknown> = {}): unknown {
  return {
    metadata: { name: 'checkout-7f9c.17a1b2', namespace: 'payments', creationTimestamp: '2023-11-14T22:13:00Z' },
    involvedObject: { kind: 'Pod', namespace: 'payments', name: 'checkout-7f9c', uid: 'a1b2' },
    reason: 'BackOff',
    message: 'Back-off restarting failed container',
    type: 'Warning',
    count: 3,
    firstTimestamp: '2023-11-14T22:13:00Z',
    lastTimestamp: '2023-11-14T22:13:20.123Z',
    eventTime: null,
    ...overrides,
  };
}

/** The envelope a list answers with. */
function eventList(items: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: 'EventList',
    apiVersion: 'v1',
    metadata: { resourceVersion: '7431' },
    items,
    ...extra,
  });
}

describe('ingest/kubernetes · the events reader', () => {
  it('maps an event to a signal whose payload is the vocabulary the IR already has', async () => {
    const stub = await serve(() => ({ status: 200, body: eventList([event()]) }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error(`expected success, got ${result.error}`);

    // The reason's third clause said a reader would need a translation table because
    // events use the involvedObject vocabulary. They do -- and the IR carries it.
    expect(result.signals[0]?.payload).toEqual({
      kind: 'event',
      reason: 'BackOff',
      message: 'Back-off restarting failed container',
      type: 'Warning',
      count: 3,
      involvedObject: { kind: 'Pod', name: 'checkout-7f9c' },
    });
    expect(result.signals[0]?.resource).toEqual({ 'service.name': 'payments' });
    expect(result.signals[0]?.timestamp).toBe('2023-11-14T22:13:20.123Z');
    expect(result.signals[0]?.signal).toBe('event');
    expect(result.signals[0]?.provenance['payload.reason']).toEqual({ source: 'direct' });
  });

  it('asks the namespaced list endpoint for the page, with the token the caller supplied', async () => {
    const stub = await serve(() => ({ status: 200, body: eventList([]) }));
    await pullKubernetesEvents({
      baseUrl: `${stub.baseUrl}/`,
      ...PULL,
      fieldSelector: 'involvedObject.name=checkout-7f9c',
    });

    const request = stub.requests[0];
    expect(request?.method).toBe('GET');
    const url = new URL(stub.baseUrl + (request?.url ?? ''));
    // The path is the namespaced list, which is not the cluster-wide constant with a
    // prefix: the namespace goes into the middle of it.
    expect(url.pathname).toBe('/api/v1/namespaces/payments/events');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('fieldSelector')).toBe('involvedObject.name=checkout-7f9c');
    // The credentials the registry's reason said the ingest path does not have,
    // supplied by the caller rather than read from an ambient file or environment.
    expect(request?.headers['authorization']).toBe('Bearer sa-token');
    expect(request?.headers['accept']).toBe('application/json');
  });

  it('reads the cluster-wide list when the caller names no namespace, and sends no empty selector', async () => {
    const stub = await serve(() => ({ status: 200, body: eventList([]) }));
    const { namespace: _ignored, ...clusterWide } = PULL;
    await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...clusterWide });
    const url = new URL(stub.baseUrl + (stub.requests[0]?.url ?? ''));
    expect(url.pathname).toBe(KUBERNETES_EVENTS_PATH);
    // An empty `fieldSelector` is not the same request as no `fieldSelector`, and the
    // API answers an empty one with every event.
    expect(url.searchParams.has('fieldSelector')).toBe(false);
  });

  it('reads whichever of the three event timestamps the caller declared', async () => {
    // `core/v1` defines three fields for an event's own time -- `eventTime` (a
    // MicroTime), `firstTimestamp` and `lastTimestamp` -- and which one is "the" time
    // is a per-caller decision: `lastTimestamp` answers "when did this last happen",
    // `firstTimestamp` answers "when did it start". The reader takes the decision
    // rather than picking one and presenting it as the event's time.
    expect([...KUBERNETES_TIMESTAMP_FIELDS]).toEqual(['eventTime', 'lastTimestamp', 'firstTimestamp']);
    const stub = await serve(() => ({
      status: 200,
      body: eventList([
        event({ eventTime: '2023-11-14T22:13:30.000001Z', firstTimestamp: '2023-11-14T22:13:00Z' }),
      ]),
    }));

    const asEventTime = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL, timestampField: 'eventTime' });
    if (!asEventTime.ok) throw new Error('expected success');
    expect(asEventTime.signals[0]?.timestamp).toBe('2023-11-14T22:13:30.000Z');

    const asFirst = await pullKubernetesEvents({
      baseUrl: stub.baseUrl,
      ...PULL,
      timestampField: 'firstTimestamp',
    });
    if (!asFirst.ok) throw new Error('expected success');
    expect(asFirst.signals[0]?.timestamp).toBe('2023-11-14T22:13:00.000Z');
  });

  it('quarantines an event whose declared timestamp field is null, which is how the API writes an unset one', async () => {
    // `eventTime` is `null` in every event a component wrote with `core/v1`'s older
    // fields, and reading a null as the epoch would place the event in 1970.
    const stub = await serve(() => ({ status: 200, body: eventList([event()]) }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL, timestampField: 'eventTime' });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toEqual([]);
    expect(result.quarantine[0]?.reason).toContain("declared timestamp field 'eventTime'");
  });

  it('quarantines an event whose declared timestamp is not an RFC-3339 time', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: eventList([event({ lastTimestamp: 'yesterday' }), event({ lastTimestamp: 1_700_000_000 })]),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine).toHaveLength(2);
    expect(result.quarantine[0]?.reason).toContain('not a date this module can read');
    expect(result.quarantine.map((q) => q.index)).toEqual([0, 1]);
  });

  it('quarantines an event that carries no involved object, per event', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: eventList([
        event({ involvedObject: undefined }),
        event({ involvedObject: { kind: 'Pod' } }),
        event({ involvedObject: { kind: 'Pod', name: '' } }),
        event({ involvedObject: 'not an object' }),
        event({ reason: 'Kept' }),
      ]),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(1);
    expect(result.quarantine).toHaveLength(4);
    expect(result.quarantine[0]?.reason).toContain('no `involvedObject` with a kind and a name');
  });

  it('quarantines an event that names no reason', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: eventList([event({ reason: undefined }), event({ reason: '' }), event({ reason: 42 })]),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine).toHaveLength(3);
    expect(result.quarantine[0]?.reason).toContain('no `reason`');
  });

  it('keeps an absent message as absent and refuses one that is not a string', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: eventList([event({ message: undefined }), event({ message: { text: 'no' } }), event({ message: '' })]),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine).toHaveLength(1);
    expect(result.signals).toHaveLength(2);
    // Absent stays absent: the IR's `message` is optional and `undefined` is not `''`.
    expect(result.signals[0]?.payload).not.toHaveProperty('message');
    expect(result.signals[1]?.payload).toMatchObject({ message: '' });
  });

  it('keeps the two types the IR carries and quarantines a third', async () => {
    // The pair is the API's own closed vocabulary; a value outside it cannot be
    // represented, and defaulting it would be inventing a member.
    const stub = await serve(() => ({
      status: 200,
      body: eventList([event({ type: 'Warning' }), event({ type: 'Normal' }), event({ type: 'Oops' })]),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(2);
    expect(result.quarantine[0]?.reason).toContain("`type` is 'Oops'");
  });

  it('quarantines an item that is not an object', async () => {
    const stub = await serve(() => ({ status: 200, body: eventList(['not an object', [1, 2], event()]) }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.quarantine).toHaveLength(2);
    expect(result.quarantine[0]?.reason).toBe('item is not an object');
    expect(result.signals).toHaveLength(1);
  });

  it('accepts a one-sided window, which asks for everything before or after a bound', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: eventList([
        event({ lastTimestamp: '2023-11-14T22:00:00Z', reason: 'Earlier' }),
        event({ lastTimestamp: '2023-11-14T23:00:00Z', reason: 'Later' }),
      ]),
    }));
    const from = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL, start: '2023-11-14T22:30:00Z' });
    if (!from.ok) throw new Error('expected success');
    expect(from.signals.map((s) => (s.payload.kind === 'event' ? s.payload.reason : ''))).toEqual(['Later']);
    expect(from.page.outsideWindow).toBe(1);

    const until = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL, end: '2023-11-14T22:30:00Z' });
    if (!until.ok) throw new Error('expected success');
    expect(until.signals.map((s) => (s.payload.kind === 'event' ? s.payload.reason : ''))).toEqual(['Earlier']);
    expect(until.page.outsideWindow).toBe(1);
  });

  it('keeps an absent type as absent', async () => {
    const stub = await serve(() => ({ status: 200, body: eventList([event({ type: undefined })]) }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).not.toHaveProperty('type');
  });

  it('keeps a whole count and quarantines one that is not', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: eventList([event({ count: 12 }), event({ count: -1 }), event({ count: 1.5 }), event({ count: '3' })]),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.payload).toMatchObject({ count: 12 });
    expect(result.quarantine).toHaveLength(3);
    expect(result.quarantine[0]?.reason).toContain('`count` is not a whole number');
  });

  it('keeps an absent count as absent, which is not the same as one occurrence', async () => {
    // A component that wrote a single occurrence leaves `count` out; reading that as
    // one would be filling in a field the backend did not write.
    const stub = await serve(() => ({ status: 200, body: eventList([event({ count: undefined })]) }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals[0]?.payload).not.toHaveProperty('count');
  });

  it('never sets a change type, which the API has no field for', async () => {
    // A rollout does produce events, and their `reason` is free text
    // (`ScalingReplicaSet`, `Pulled`, `Killing`). Mapping those strings onto
    // deploy/config/scale/rollback is a per-cluster vocabulary, so `changeType` is
    // never set: absent says "this reader did not read one", not "nothing changed".
    const stub = await serve(() => ({
      status: 200,
      body: eventList([event({ reason: 'ScalingReplicaSet' }), event({ reason: 'RollingUpdateDeployment' })]),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals).toHaveLength(2);
    for (const signal of result.signals) {
      expect(signal.payload).not.toHaveProperty('changeType');
    }
  });

  it('keeps the order the API returned', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: eventList([event({ reason: 'First' }), event({ reason: 'Second' })]),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.signals.map((s) => (s.payload.kind === 'event' ? s.payload.reason : ''))).toEqual([
      'First',
      'Second',
    ]);
  });

  it('reports the page the caller got rather than pretending it is the window', async () => {
    // The event list has no time filter, so the reader cannot ask the API for a
    // window; what it can do is say which page it read and whether there is another.
    const stub = await serve(() => ({
      status: 200,
      body: eventList([event()], { metadata: { resourceVersion: '7431', continue: 'eyJ2IjoidjEifQ==' } }),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.page).toEqual({ resourceVersion: '7431', hasMore: true, outsideWindow: 0 });
  });

  it('reports a page with no continuation token as the last one', async () => {
    const stub = await serve(() => ({ status: 200, body: eventList([event()]) }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    expect(result.page).toEqual({ resourceVersion: '7431', hasMore: false, outsideWindow: 0 });
  });

  it('counts the events a declared window excluded, so the exclusion is visible', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: eventList([
        event({ lastTimestamp: '2023-11-14T22:00:00Z', reason: 'TooEarly' }),
        event({ lastTimestamp: '2023-11-14T22:13:20Z', reason: 'Inside' }),
        event({ lastTimestamp: '2023-11-14T23:00:00Z', reason: 'TooLate' }),
      ]),
    }));
    const result = await pullKubernetesEvents({
      baseUrl: stub.baseUrl,
      ...PULL,
      start: '2023-11-14T22:10:00Z',
      end: '2023-11-14T22:20:00Z',
    });
    if (!result.ok) throw new Error('expected success');
    // A window on this API can only be applied by the reader, so the events it
    // excluded are counted rather than dropped in silence.
    expect(result.signals).toHaveLength(1);
    expect(result.page.outsideWindow).toBe(2);
    expect(result.signals[0]?.payload).toMatchObject({ reason: 'Inside' });
  });

  it('applies a window given as epoch seconds or as a Date', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: eventList([event({ lastTimestamp: '2023-11-14T22:13:20.123Z' })]),
    }));
    const asSeconds = await pullKubernetesEvents({
      baseUrl: stub.baseUrl,
      ...PULL,
      start: 1_700_000_000,
      end: 1_700_000_060,
    });
    if (!asSeconds.ok) throw new Error(`expected success, got ${asSeconds.error}`);
    const asDate = await pullKubernetesEvents({
      baseUrl: stub.baseUrl,
      ...PULL,
      start: new Date(1_700_000_000_000),
      end: new Date(1_700_000_060_000),
    });
    if (!asDate.ok) throw new Error(`expected success, got ${asDate.error}`);
    expect(asSeconds.signals).toHaveLength(1);
    expect(asDate.page.outsideWindow).toBe(0);
  });

  it('refuses a window it cannot read, rather than excluding every event', async () => {
    const bad = await pullKubernetesEvents({ baseUrl: 'http://127.0.0.1:1', ...PULL, start: 'yesterday' });
    if (bad.ok) throw new Error('expected a refusal');
    expect(bad.error).toContain('start is not a time this module can read');

    const notFinite = await pullKubernetesEvents({ baseUrl: 'http://127.0.0.1:1', ...PULL, end: Number.NaN });
    if (notFinite.ok) throw new Error('expected a refusal');
    expect(notFinite.error).toContain('end must be a finite number of seconds');

    const invalidDate = await pullKubernetesEvents({
      baseUrl: 'http://127.0.0.1:1',
      ...PULL,
      start: new Date(Number.NaN),
    });
    if (invalidDate.ok) throw new Error('expected a refusal');
    expect(invalidDate.error).toContain('start is not a time this module can read');

    const backwards = await pullKubernetesEvents({
      baseUrl: 'http://127.0.0.1:1',
      ...PULL,
      start: '2023-11-14T23:00:00Z',
      end: '2023-11-14T22:00:00Z',
    });
    if (backwards.ok) throw new Error('expected a refusal');
    expect(backwards.error).toContain('so the window is empty');
  });

  it('refuses a pull that names no service, because the API does not name one either', async () => {
    const result = await pullKubernetesEvents({ baseUrl: 'http://127.0.0.1:1', ...PULL, service: '' });
    if (result.ok) throw new Error('expected a refusal');
    // The one clause of the registry's reason that survives: an event about a Pod
    // does not name a service, and the reader will not turn a pod name into one.
    expect(result.error).toContain('no service was named');
  });

  it('refuses a pull with no token, rather than reaching an unauthenticated endpoint', async () => {
    const result = await pullKubernetesEvents({ baseUrl: 'http://127.0.0.1:1', ...PULL, token: '' });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('no token was supplied');
  });

  it('refuses a limit that is not a positive integer, because the alternative is unbounded', async () => {
    // This API has no default page size: an absent `limit` asks for every matching
    // event in the cluster, which is the opposite hazard from the other four backends
    // and the same defect -- a reader that cannot bound its response cannot say
    // anything about what it read.
    for (const limit of [0, -1, 2.5, Number.NaN]) {
      const result = await pullKubernetesEvents({ baseUrl: 'http://127.0.0.1:1', ...PULL, limit });
      if (result.ok) throw new Error(`expected a refusal for limit ${String(limit)}`);
      expect(result.error).toContain('limit must be a positive integer');
    }
  });

  it('refuses a timestamp field outside the closed triple', async () => {
    for (const timestampField of ['metadata.creationTimestamp', '', 'creationTimestamp']) {
      const result = await pullKubernetesEvents({
        baseUrl: 'http://127.0.0.1:1',
        ...PULL,
        timestampField: timestampField as 'eventTime',
      });
      if (result.ok) throw new Error(`expected a refusal for ${timestampField}`);
      expect(result.error).toContain("timestampField must be one of 'eventTime', 'lastTimestamp' or 'firstTimestamp'");
    }
  });
});

describe('ingest/kubernetes · what makes the request meaningless', () => {
  it('reports a refused connection rather than throwing at the caller', async () => {
    // Cluster-wide, so the diagnostic names the constant this module exports.
    const { namespace: _ignored, ...clusterWide } = PULL;
    const result = await pullKubernetesEvents({ baseUrl: 'http://127.0.0.1:1', ...clusterWide });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain(`${KUBERNETES_EVENTS_PATH} `);
  });

  it('reports a socket that accepts and then says nothing, naming the bound', async () => {
    const stub = await serve(() => 'never');
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL, timeoutMs: 50 });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('did not answer within 50ms');
  });

  it('reports a non-2xx with its status and the head of its body', async () => {
    const stub = await serve(() => ({
      status: 403,
      body: '{"kind":"Status","reason":"Forbidden","message":"events is forbidden"}',
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('returned HTTP 403: {"kind":"Status"');
  });

  it('reports a body that is not JSON', async () => {
    const stub = await serve(() => ({ status: 200, body: '<html>proxy</html>' }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('returned a body that is not JSON: <html>proxy</html>');
  });

  it('fails on a body that is not a JSON object', async () => {
    const stub = await serve(() => ({ status: 200, body: '[1,2,3]' }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('returned a body that is not a JSON object');
  });

  it('fails on a Status where a list was expected, which is how the API answers a refusal', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ kind: 'Status', apiVersion: 'v1', reason: 'Forbidden', status: 'Failure' }),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected failure');
    // Reading `items` out of a Status would report a refused request as an empty
    // window, which is the failure the Prometheus reader's result-type branch exists
    // for one backend over.
    expect(result.error).toContain("expected an 'EventList', got 'Status'");
  });

  it('fails on a list whose items are not a list', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ kind: 'EventList', metadata: { resourceVersion: '1' }, items: null }),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain("`items` is not an array");
  });

  it('fails on a list that carries no resource version, which is how a caller resumes', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ kind: 'EventList', items: [] }),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('no `metadata.resourceVersion`');
  });

  it('fails on a list whose kind is not a string', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ kind: 7, metadata: { resourceVersion: '1' }, items: [] }),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain("expected an 'EventList', got '7'");
  });

  it('fails on a body with no kind at all', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: JSON.stringify({ metadata: { resourceVersion: '1' }, items: [] }),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain("expected an 'EventList', got 'undefined'");
  });

  it('truncates the offending record it keeps in a quarantine row', async () => {
    const stub = await serve(() => ({
      status: 200,
      body: eventList([event({ involvedObject: undefined, message: 'x'.repeat(400) })]),
    }));
    const result = await pullKubernetesEvents({ baseUrl: stub.baseUrl, ...PULL });
    if (!result.ok) throw new Error('expected success');
    const record = result.quarantine[0]?.record ?? '';
    expect(record).toHaveLength(203);
    expect(record.endsWith('...')).toBe(true);
  });
});
