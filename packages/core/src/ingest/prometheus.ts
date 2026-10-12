/**
 * Pull metrics from a Prometheus-compatible HTTP API and map them to IR signals.
 *
 * ## Why this is a separate module from `file.ts` and `otlp.ts`
 *
 * Those two read telemetry a caller already has: a file on disk, or a payload
 * posted to us. This one *reaches out*, which makes it the first ingest path in
 * this repository whose input can be absent, slow, unauthorised, or wrong in ways
 * the payload never is. Every branch below is therefore about a network fact
 * rather than a parse fact, and mixing them into a parser would hide that.
 *
 * It is also the first of the six T2 backends in `backends.ts`. The registry
 * records which of the six can actually be pulled from, and the reason for each
 * that cannot, because P1-5's exit condition is "measure each one and declare the
 * ones that are not supported" -- and a declaration that nothing checks is the
 * shape of defect this campaign has now recorded five times.
 *
 * ## What it does not do
 *
 * It does not infer anything. A sample's value, timestamp and labels are what the
 * backend reported, so their provenance is `direct`; a field this module had to
 * invent would be `inferred` or `defaulted`, and there are none. In particular
 * `semanticType` is left unset rather than guessed from the metric name: a
 * guess presented beside measured values is exactly the kind of claim this
 * repository refuses to make, and `METRIC_SEMANTIC_TYPES` is a vocabulary for a
 * *consumer* to map into, not for a puller to guess at.
 *
 * It also does not retry. A retry policy is a decision about which failures are
 * the caller's fault, and the caller here is a CLI that can be re-run; the
 * fetch-official path has its own retry loop with its own exit-code contract
 * (finding 52), and quietly inventing a second one inside the ingest layer would
 * make the two disagree about which failures are retryable.
 */

import { IR_VERSION, type MetricPayload, type TelemetrySignal } from '../ir/types.js';
import { telemetrySignalSchema } from '../ir/schema.js';

/** The Prometheus range-query endpoint this module speaks. */
export const PROMETHEUS_QUERY_PATH = '/api/v1/query_range';

/** Default label carrying the service name, following the OTel semantic conventions. */
export const PROMETHEUS_DEFAULT_SERVICE_LABEL = 'service';

/** Default bound on a single request, in milliseconds. */
export const PROMETHEUS_DEFAULT_TIMEOUT_MS = 15_000;

/** A payload the puller could not turn into a signal, and why. */
export interface PrometheusQuarantineRecord {
  /** Index of the series in the response, then of the sample inside it. */
  index: number;
  reason: string;
  /** The offending record, truncated. */
  record: string;
}

export type PrometheusPullResult =
  | {
      ok: true;
      signals: TelemetrySignal[];
      quarantine: PrometheusQuarantineRecord[];
      /** Whatever the backend reported in its `warnings` array, passed through. */
      warnings: string[];
    }
  | { ok: false; error: string };

export interface PrometheusPullOptions {
  /** Base URL of the Prometheus-compatible API, with or without a trailing slash. */
  baseUrl: string;
  /** A PromQL range expression. */
  query: string;
  /** Start of the window: epoch seconds, an ISO-8601 string, or a `Date`. */
  start: number | string | Date;
  /** End of the window, same encodings as `start`. */
  end: number | string | Date;
  /**
   * Resolution, in Prometheus' own duration syntax (`30s`, `5m`).
   *
   * Required rather than defaulted: the range a query covers divided by a step
   * is how many samples come back, so a default here would silently decide how
   * much telemetry the caller gets -- and a wrong default is invisible in the
   * output, which is the failure mode that took finding 147 to find one layer out.
   */
  step: string | number;
  /** Label carrying the service name. Defaults to `service`. */
  serviceLabel?: string;
  timeoutMs?: number;
}

/** Whole seconds since the epoch, from any of the three accepted encodings. */
function toEpochSeconds(value: number | string | Date, what: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${what} must be a finite number of seconds`);
    return value;
  }
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`${what} is not a time this module can read: ${String(value)}`);
  return ms / 1000;
}

function summarize(value: unknown): string {
  // No `undefined` arm: every call site passes a value that came out of
  // `JSON.parse`, and `JSON.stringify` of such a value always returns a string.
  // The first version had one, it was unreachable, and an unreachable branch in
  // a quarantine path is worse than no branch -- it reads as a case somebody
  // handled, and coverage counts it as one (finding 153's round removed a
  // vocabulary entry for the same reason).
  const s = String(JSON.stringify(value));
  return s.length > 200 ? `${s.slice(0, 200)}...` : s;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Read a sample's value.
 *
 * Prometheus writes sample values as *strings*, because a float64 has to survive
 * a JSON round trip losslessly -- and because `NaN`, `+Inf` and `-Inf` are legal
 * time-series values with no JSON number form. Those three are quarantined rather
 * than dropped: a series that is non-finite across a window is a fact about the
 * system, and this repository has already had one round trip report 122 cases as
 * a bare `NaN` with no reader able to say which layer produced it (finding 119).
 */
function sampleValue(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Pull one range query and map it.
 *
 * Returns `ok: false` for anything that makes the *request* meaningless -- an
 * unreachable host, a non-2xx status, a body that is not the documented envelope.
 * Returns `ok: true` with quarantine records for anything that makes an
 * individual series or sample unusable. The split matters to the caller: the
 * first is "try again or fix the URL", the second is "this telemetry has a hole
 * in it, and here is where".
 */
export async function pullPrometheusMetrics(
  options: PrometheusPullOptions,
): Promise<PrometheusPullResult> {
  const {
    baseUrl,
    query,
    step,
    serviceLabel = PROMETHEUS_DEFAULT_SERVICE_LABEL,
    timeoutMs = PROMETHEUS_DEFAULT_TIMEOUT_MS,
  } = options;

  let start: number;
  let end: number;
  try {
    start = toEpochSeconds(options.start, 'start');
    end = toEpochSeconds(options.end, 'end');
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  if (end < start) {
    return { ok: false, error: `end (${end}) is before start (${start}), so the range is empty` };
  }

  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${PROMETHEUS_QUERY_PATH}`);
  url.searchParams.set('query', query);
  url.searchParams.set('start', String(start));
  url.searchParams.set('end', String(end));
  url.searchParams.set('step', String(step));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // `AbortSignal.timeout` rejects with a `TimeoutError`, and a refused
    // connection with a `TypeError`; both are reported rather than thrown,
    // because a puller that throws on an unreachable host cannot be driven by a
    // table of cases, and this module's whole test surface is such a table.
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
  if (envelope === undefined || typeof envelope['status'] !== 'string') {
    return { ok: false, error: `${url.origin}${url.pathname} returned a body with no 'status' field` };
  }
  // Two independent verdicts, and the body's is the one a status code cannot
  // give. Measured against a real Prometheus 2.45.3 (v1.75): a query with a
  // parse error and a query that exceeds the 11,000-point resolution limit both
  // answer **HTTP 400** with `{"status":"error","errorType":"bad_data",...}`, so
  // the non-2xx branch above is what catches them in practice.
  //
  // This comment used to say the opposite -- that Prometheus "reports a failed
  // query with HTTP 200 and `status: error`" -- which the real server disproved.
  // The check is kept, because the verdict in the body is the only thing that
  // makes the reader correct against an endpoint whose status code says 200; no
  // such endpoint has been measured here, so it is a defence rather than a
  // reproduction, and it is written as one.
  if (envelope['status'] !== 'success') {
    const errorType = typeof envelope['errorType'] === 'string' ? envelope['errorType'] : 'unknown';
    const message = typeof envelope['error'] === 'string' ? envelope['error'] : 'no message';
    return { ok: false, error: `the query failed (${errorType}): ${message}` };
  }

  const data = asRecord(envelope['data']);
  const resultType = data?.['resultType'];
  if (resultType !== 'matrix') {
    return {
      ok: false,
      error: `expected a matrix result from a range query, got '${String(resultType)}'`,
    };
  }
  const series = data?.['result'];
  if (!Array.isArray(series)) {
    return { ok: false, error: "the response's `data.result` is not an array" };
  }

  const warnings = Array.isArray(envelope['warnings'])
    ? envelope['warnings'].filter((w): w is string => typeof w === 'string')
    : [];

  const signals: TelemetrySignal[] = [];
  const quarantine: PrometheusQuarantineRecord[] = [];

  series.forEach((rawSeries, seriesIndex) => {
    const entry = asRecord(rawSeries);
    const metric = asRecord(entry?.['metric']);
    const values = entry?.['values'];
    if (metric === undefined || !Array.isArray(values)) {
      quarantine.push({
        index: seriesIndex,
        reason: 'series has no `metric` labels or no `values` array',
        record: summarize(rawSeries),
      });
      return;
    }

    const name = metric['__name__'];
    if (typeof name !== 'string' || name === '') {
      quarantine.push({
        index: seriesIndex,
        reason: 'series carries no `__name__` label, so the metric has no name',
        record: summarize(rawSeries),
      });
      return;
    }
    const serviceName = metric[serviceLabel];
    if (typeof serviceName !== 'string' || serviceName === '') {
      quarantine.push({
        index: seriesIndex,
        reason: `series has no '${serviceLabel}' label, so the signal has no service to belong to`,
        record: summarize(rawSeries),
      });
      return;
    }

    const tags: Record<string, string> = {};
    for (const [label, value] of Object.entries(metric)) {
      if (label === '__name__' || label === serviceLabel) continue;
      if (typeof value === 'string') tags[label] = value;
    }

    values.forEach((rawSample, sampleIndex) => {
      const index = seriesIndex * 1_000_000 + sampleIndex;
      if (!Array.isArray(rawSample) || rawSample.length < 2) {
        quarantine.push({ index, reason: 'sample is not a [timestamp, value] pair', record: summarize(rawSample) });
        return;
      }
      // The timestamp is a JSON number in every form of this API that exists,
      // so a string is refused rather than coerced. The first version accepted
      // `Number(rawSample[0])` for the string case, which is a form Prometheus
      // does not write: supporting it would have been a claim about an encoding
      // nobody had observed, and the only test that could cover it would be one
      // asserting behaviour against a fixture that does not exist in the wild.
      const seconds = rawSample[0];
      if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
        quarantine.push({ index, reason: 'sample has a non-numeric timestamp', record: summarize(rawSample) });
        return;
      }
      const value = sampleValue(rawSample[1]);
      if (value === undefined) {
        quarantine.push({
          index,
          reason: `sample value is not a finite number (${JSON.stringify(rawSample[1])}); Prometheus writes NaN and the infinities as strings`,
          record: summarize(rawSample),
        });
        return;
      }

      const payload: MetricPayload = {
        kind: 'metric',
        name,
        value,
        ...(Object.keys(tags).length > 0 ? { tags } : {}),
      };
      const signal: TelemetrySignal = {
        irVersion: IR_VERSION,
        resource: { 'service.name': serviceName },
        timestamp: new Date(seconds * 1000).toISOString(),
        rawOffsetMinutes: 0,
        signal: 'metric',
        payload,
        // Every field here came off the wire, so the provenance is `direct` for
        // all of it; the per-sample index is what makes two samples of one series
        // distinguishable in a report downstream.
        provenance: {
          'payload.value': { source: 'direct' },
          'payload.name': { source: 'direct' },
          timestamp: { source: 'direct' },
        },
      };
      signals.push(telemetrySignalSchema.parse(signal) as TelemetrySignal);
    });
  });

  return { ok: true, signals, quarantine, warnings };
}
