/**
 * Pull events from a Kubernetes API server and map them to IR signals.
 *
 * ## Why the registry said this could not be done, and which half was wrong
 *
 * `backends.ts` declared this backend unsupported, and the reason gave two things it
 * said a reader would need from the caller: credentials "that are not available to the
 * ingest path -- an in-cluster service-account token or a kubeconfig", and "a
 * translation table", because "its events use the `involvedObject` vocabulary rather
 * than the OTel resource attributes the IR is built on".
 *
 * The first is an interface, and `token` is a required argument with no default: the
 * reader takes a bearer token from its caller rather than reading one from the
 * environment, a mounted service-account directory, or a kubeconfig. That is the same
 * decision the other four pullers make about credentials, which is to have none of
 * their own.
 *
 * The second turns out **not to be needed at all**, and the reason's own wording is
 * what hid it. `EventPayload` in `ir/types.ts` carries `reason`, `message`, `type`,
 * `count` and **`involvedObject: { kind, name }`** -- the IR was built with events in
 * mind, down to the shape of the field the reason named. There is no translation to
 * perform: the vocabulary the reader has to produce already exists.
 *
 * ## The one clause that survives
 *
 * An event about a Pod does not name a service, and the IR requires one. Turning
 * `involvedObject.name` into a service name is a per-cluster convention -- a ReplicaSet
 * hash suffix, a label, a naming scheme, or none of those -- so the reader does not do
 * it: `service` is a required argument, and it is the caller saying which service they
 * are asking about. The object itself is recorded where the IR records objects, in the
 * payload's `involvedObject`, so one fact has one representation.
 *
 * ## What it does not do
 *
 * It does not reach a real API server. Nothing in this repository has contacted a
 * Kubernetes cluster; the module is driven against a fixture server in
 * `packages/core/test/kubernetes.test.ts`. The Prometheus reader earned the stronger
 * claim by being pointed at a real server (finding 154); this one has not, and the
 * registry's summary says so.
 *
 * It does not pretend to have a server-side window. **The event list has no time
 * filter**: `fieldSelector` can select on `involvedObject.name`, `involvedObject.kind`,
 * `reason`, `type` and a few more, but not on a timestamp. So a caller who wants a
 * window gets one applied by this module to the entries it read, and the entries it
 * excluded are **counted** in `page.outsideWindow` rather than dropped in silence --
 * and the page itself, not the window, is what the `resourceVersion` and the
 * continuation token describe.
 *
 * It does not set `changeType`. A rollout does produce events, and their `reason` is
 * free text (`ScalingReplicaSet`, `Pulled`, `Killing`); mapping those strings onto
 * deploy/config/scale/rollback is a per-cluster vocabulary, so the field stays absent.
 *
 * It does not retry, for the reason recorded in `prometheus.ts`: the repository's retry
 * policy lives in `fetch-official.mjs` with its own exit-code contract (finding 52), and
 * a second, quieter one here would eventually disagree with it.
 */

import { IR_VERSION, type EventPayload, type TelemetrySignal } from '../ir/types.js';
import { telemetrySignalSchema } from '../ir/schema.js';

/** The list endpoint this module speaks, appended to the namespace path when there is one. */
export const KUBERNETES_EVENTS_PATH = '/api/v1/events';

/** Default bound on a single request, in milliseconds. */
export const KUBERNETES_DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The three fields `core/v1` defines for an event's own time.
 *
 * A tuple rather than a type so the runtime check can enumerate it, and required of the
 * caller rather than defaulted: `lastTimestamp` answers "when did this last happen" and
 * `firstTimestamp` answers "when did it start", which are different questions with
 * different answers on an event with a `count` above one. `metadata.creationTimestamp`
 * is deliberately not offered -- it is when the Event object was written, which is a
 * different fact from when the event happened.
 */
export const KUBERNETES_TIMESTAMP_FIELDS = ['eventTime', 'lastTimestamp', 'firstTimestamp'] as const;

/** An event timestamp field. Derived from `KUBERNETES_TIMESTAMP_FIELDS`. */
export type KubernetesTimestampField = (typeof KUBERNETES_TIMESTAMP_FIELDS)[number];

/** An event the puller could not turn into a signal, and why. */
export interface KubernetesQuarantineRecord {
  /** Index of the item in the list. */
  index: number;
  reason: string;
  /** The offending record, truncated. */
  record: string;
}

/**
 * The page the caller got, which is not the same thing as the window they asked for.
 *
 * `resourceVersion` is the list's own version and the thing a caller needs to resume;
 * `hasMore` says whether the API returned a continuation token; `outsideWindow` counts
 * the entries a declared window excluded, so an exclusion made by this module is
 * visible rather than silent.
 */
export interface KubernetesPage {
  resourceVersion: string;
  hasMore: boolean;
  outsideWindow: number;
}

export type KubernetesPullResult =
  | { ok: true; signals: TelemetrySignal[]; quarantine: KubernetesQuarantineRecord[]; page: KubernetesPage }
  | { ok: false; error: string };

export interface KubernetesPullOptions {
  /** Base URL of the API server, with or without a trailing slash. */
  baseUrl: string;
  /**
   * The service these events belong to.
   *
   * Required, and the caller's assertion rather than a derivation: the API does not
   * name a service for an event about a Pod, and mapping a pod name to one is a
   * per-cluster convention this module will not invent.
   */
  service: string;
  /** A bearer token, supplied by the caller. Never read from the environment or a file. */
  token: string;
  /**
   * Maximum number of events to ask for.
   *
   * Required rather than defaulted, and for the opposite reason to the other four
   * pullers: this API has **no** default page size, so an absent `limit` asks for every
   * matching event in the cluster. A reader that cannot bound its response cannot say
   * anything about what it read.
   */
  limit: number;
  /** Which of the event's three timestamps the caller means. */
  timestampField: KubernetesTimestampField;
  /** Namespace to read from. Absent reads the cluster-wide list. */
  namespace?: string;
  /** A `fieldSelector`, passed through as written. Absent sends no selector. */
  fieldSelector?: string;
  /** Start of an optional window: epoch seconds, an ISO-8601 string, or a `Date`. */
  start?: number | string | Date;
  /** End of an optional window, same encodings as `start`. */
  end?: number | string | Date;
  timeoutMs?: number;
}

/**
 * Milliseconds since the epoch, from any of the three encodings the other pullers
 * accept. A `number` is **epoch seconds**, the same convention they take.
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

function summarize(value: unknown): string {
  const s = String(JSON.stringify(value));
  return s.length > 200 ? `${s.slice(0, 200)}...` : s;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * The timestamp this event carries in the field the caller declared.
 *
 * `core/v1` writes `null` for an unset timestamp -- `eventTime` is null in every event
 * written with the older fields -- and a null read as the epoch would place the event
 * in 1970. The value is an RFC-3339 string or it is not a time.
 */
function timestampOf(raw: unknown, field: string): number | string {
  if (typeof raw !== 'string') {
    return `event's declared timestamp field '${field}' is not a date this module can read: ${JSON.stringify(raw)}`;
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    return `event's declared timestamp field '${field}' is not a date this module can read: ${JSON.stringify(raw)}`;
  }
  return ms;
}

/**
 * Pull one page of events and map it.
 *
 * The split between `ok: false` and a quarantine record is the one the other four
 * pullers make: the first is a request that cannot be answered (fix the declaration,
 * try again), the second is telemetry with a hole in it and a record of where.
 */
export async function pullKubernetesEvents(options: KubernetesPullOptions): Promise<KubernetesPullResult> {
  const {
    baseUrl,
    service,
    token,
    limit,
    timestampField,
    namespace,
    fieldSelector,
    timeoutMs = KUBERNETES_DEFAULT_TIMEOUT_MS,
  } = options;

  if (service === '') {
    return {
      ok: false,
      error: 'no service was named, and the API names none for an event about a pod',
    };
  }
  if (token === '') {
    return { ok: false, error: 'no token was supplied, and this module reads no ambient credentials' };
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    return { ok: false, error: `limit must be a positive integer, got ${JSON.stringify(limit)}` };
  }
  if (!(KUBERNETES_TIMESTAMP_FIELDS as readonly string[]).includes(timestampField)) {
    return {
      ok: false,
      error:
        `timestampField must be one of 'eventTime', 'lastTimestamp' or 'firstTimestamp', ` +
        `got ${JSON.stringify(timestampField)}`,
    };
  }

  let window: { start?: number; end?: number } | undefined;
  try {
    const start = options.start === undefined ? undefined : toEpochMillis(options.start, 'start');
    const end = options.end === undefined ? undefined : toEpochMillis(options.end, 'end');
    if (start !== undefined && end !== undefined) {
      if (end < start) {
        return { ok: false, error: `end (${end}) is before start (${start}), so the window is empty` };
      }
      window = { start, end };
    } else if (start !== undefined) window = { start };
    else if (end !== undefined) window = { end };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  const url = new URL(
    `${baseUrl.replace(/\/+$/, '')}` +
      (namespace === undefined
        ? KUBERNETES_EVENTS_PATH
        : `/api/v1/namespaces/${encodeURIComponent(namespace)}/events`),
  );
  url.searchParams.set('limit', String(limit));
  if (fieldSelector !== undefined) url.searchParams.set('fieldSelector', fieldSelector);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as Error).name;
    const why = name === 'TimeoutError' ? `did not answer within ${timeoutMs}ms` : (error as Error).message;
    return { ok: false, error: `${url.origin}${url.pathname} ${why}` };
  }

  const body = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      error: `${url.origin}${url.pathname} returned HTTP ${response.status}: ${body.slice(0, 200)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, error: `${url.origin}${url.pathname} returned a body that is not JSON: ${body.slice(0, 200)}` };
  }

  const envelope = asRecord(parsed);
  if (envelope === undefined) {
    return { ok: false, error: `${url.origin}${url.pathname} returned a body that is not a JSON object` };
  }
  // The `kind` is checked before anything is read out of the body: the API answers a
  // refusal with a `Status` object, and reading `items` out of one would report a
  // refused request as an empty window.
  if (envelope['kind'] !== 'EventList') {
    return {
      ok: false,
      error: `${url.origin}${url.pathname} expected an 'EventList', got '${String(envelope['kind'])}'`,
    };
  }
  const items = envelope['items'];
  if (!Array.isArray(items)) {
    return { ok: false, error: "the response's `items` is not an array" };
  }
  const metadata = asRecord(envelope['metadata']);
  const resourceVersion = metadata?.['resourceVersion'];
  if (typeof resourceVersion !== 'string' || resourceVersion === '') {
    return {
      ok: false,
      error: `${url.origin}${url.pathname} returned no \`metadata.resourceVersion\`, which is how a caller resumes`,
    };
  }
  const continuation = metadata?.['continue'];

  const signals: TelemetrySignal[] = [];
  const quarantine: KubernetesQuarantineRecord[] = [];
  let outsideWindow = 0;

  items.forEach((rawEvent, index) => {
    const entry = asRecord(rawEvent);
    if (entry === undefined) {
      quarantine.push({ index, reason: 'item is not an object', record: summarize(rawEvent) });
      return;
    }

    const involved = asRecord(entry['involvedObject']);
    const kind = involved?.['kind'];
    const name = involved?.['name'];
    if (typeof kind !== 'string' || kind === '' || typeof name !== 'string' || name === '') {
      quarantine.push({
        index,
        reason: 'event carries no `involvedObject` with a kind and a name',
        record: summarize(rawEvent),
      });
      return;
    }

    const reason = entry['reason'];
    if (typeof reason !== 'string' || reason === '') {
      quarantine.push({ index, reason: 'event carries no `reason`', record: summarize(rawEvent) });
      return;
    }

    const millis = timestampOf(entry[timestampField], timestampField);
    if (typeof millis === 'string') {
      quarantine.push({ index, reason: millis, record: summarize(rawEvent) });
      return;
    }

    const rawMessage = entry['message'];
    if (rawMessage !== undefined && typeof rawMessage !== 'string') {
      quarantine.push({
        index,
        reason: `event's \`message\` is not a string: ${JSON.stringify(rawMessage)}`,
        record: summarize(rawEvent),
      });
      return;
    }

    const rawType = entry['type'];
    if (rawType !== undefined && rawType !== 'Normal' && rawType !== 'Warning') {
      quarantine.push({
        index,
        reason: `event's \`type\` is '${String(rawType)}', which is not one of 'Normal' or 'Warning'`,
        record: summarize(rawEvent),
      });
      return;
    }

    const rawCount = entry['count'];
    if (rawCount !== undefined && (typeof rawCount !== 'number' || !Number.isInteger(rawCount) || rawCount < 0)) {
      quarantine.push({
        index,
        reason: `event's \`count\` is not a whole number: ${JSON.stringify(rawCount)}`,
        record: summarize(rawEvent),
      });
      return;
    }

    // The window is applied here rather than asked of the API, and the exclusion is
    // counted: this API cannot select on a timestamp, so an entry that falls outside
    // the caller's window is a decision this module made, and a decision it made
    // silently would be indistinguishable from telemetry that was never there.
    if (window !== undefined) {
      const before = window.start !== undefined && millis < window.start;
      const after = window.end !== undefined && millis > window.end;
      if (before || after) {
        outsideWindow += 1;
        return;
      }
    }

    const payload: EventPayload = {
      kind: 'event',
      reason,
      ...(rawMessage !== undefined ? { message: rawMessage } : {}),
      ...(rawType !== undefined ? { type: rawType } : {}),
      ...(rawCount !== undefined ? { count: rawCount } : {}),
      involvedObject: { kind, name },
    };
    const signal: TelemetrySignal = {
      irVersion: IR_VERSION,
      // Only the service the caller declared: the object is recorded where the IR
      // records objects, so one wire fact has one representation.
      resource: { 'service.name': service },
      timestamp: new Date(millis).toISOString(),
      rawOffsetMinutes: 0,
      signal: 'event',
      payload,
      provenance: {
        'payload.reason': { source: 'direct' },
        timestamp: { source: 'direct' },
        'resource.service.name': { source: 'direct' },
      },
    };
    signals.push(telemetrySignalSchema.parse(signal) as TelemetrySignal);
  });

  return {
    ok: true,
    signals,
    quarantine,
    page: {
      resourceVersion,
      hasMore: typeof continuation === 'string' && continuation !== '',
      outsideWindow,
    },
  };
}
