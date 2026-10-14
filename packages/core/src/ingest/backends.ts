/**
 * The six T2 backends, and which of them this repository can actually pull from.
 *
 * ## Why a registry rather than a paragraph
 *
 * `09-推进进度追踪.md`'s P1-5 asks for T2's six backends to be "measured one by
 * one and recorded, with the unsupported ones declared explicitly". A sentence
 * saying "Prometheus is supported" is a claim with no reader: nothing fails when
 * the sentence stops being true, which is the shape this campaign has recorded
 * five times over (findings 107, 108, 109, and the P0-3/P0-4 rows).
 *
 * So the claim lives here, in the module that *does* the pulling, and three
 * things read it:
 *
 *   - `packages/core/test/backend-support.test.ts` -- that every `implemented`
 *     entry exposes a callable and is driven against a real HTTP server, that
 *     every `unsupported` entry carries a reason long enough to be one, that no
 *     two reasons are the same sentence, and that the id tuple and this table
 *     name the same set in the same order;
 *   - `scripts/derive-backend-support.mjs` -> `golden-master/backend-support.json`,
 *     the published snapshot;
 *   - `scripts/check-backend-support.mjs`, which holds `docs/architecture.md`'s
 *     matrix to that snapshot and runs in `docs:check` and `docs:check:cold`.
 *
 * The direction of the checks matters and is deliberate: the code is the source,
 * the JSON is a snapshot the suite proves is current, and the document is held to
 * the JSON. A document checked against another document would only prove the two
 * agreed.
 *
 * ## What "unsupported" is not
 *
 * It is not "we have not tried". Each reason below names what the wire format
 * actually requires that this repository does not have, because "not implemented"
 * on its own is the kind of entry that cannot be re-examined -- it reads the same
 * whether the backend is a week of work or impossible.
 */

import { pullJaegerTraces, type JaegerPullOptions, type JaegerPullResult } from './jaeger.js';
import { pullLokiLogs, type LokiPullOptions, type LokiPullResult } from './loki.js';
import {
  pullPrometheusMetrics,
  type PrometheusPullOptions,
  type PrometheusPullResult,
} from './prometheus.js';

/**
 * The six backends T2 names, in the order the requirement lists them.
 *
 * A tuple rather than a type so that the runtime consumers can enumerate it --
 * which is what makes "every backend has a row" checkable instead of remembered.
 */
export const T2_BACKEND_IDS = [
  'prometheus',
  'jaeger',
  'loki',
  'elasticsearch',
  'clickhouse',
  'kubernetes',
] as const;

export type T2BackendId = (typeof T2_BACKEND_IDS)[number];

/**
 * A pull entry point, per backend.
 *
 * Three signatures rather than one, because the three pullers genuinely differ:
 * they speak different wire formats and take different options. Each backend
 * widening this type is a deliberate decision with a visible cost at the call
 * site -- a caller that wants to *drive* a backend has to know which one it is
 * driving, which is why `backendEntry` is overloaded per id rather than answering
 * a union.
 */
export type PrometheusEntry = (options: PrometheusPullOptions) => Promise<PrometheusPullResult>;
export type JaegerEntry = (options: JaegerPullOptions) => Promise<JaegerPullResult>;
export type LokiEntry = (options: LokiPullOptions) => Promise<LokiPullResult>;
export type T2BackendEntry = PrometheusEntry | JaegerEntry | LokiEntry;

export interface T2BackendImplemented {
  readonly id: T2BackendId;
  readonly status: 'implemented';
  /** The function that performs the pull. Present so "supported" is driveable. */
  readonly entry: T2BackendEntry;
  /** One line for the published matrix: what this backend's pull path speaks. */
  readonly summary: string;
}

export interface T2BackendUnsupported {
  readonly id: T2BackendId;
  readonly status: 'unsupported';
  /**
   * What the wire format requires and this repository does not have.
   *
   * Checked for length and uniqueness, not for truth -- no test can read a
   * reason. What the test *can* do is refuse a reason too short to be one and
   * refuse two backends sharing a sentence, which is what stops the table
   * collapsing into six copies of "not implemented yet" that look like six
   * measurements.
   */
  readonly reason: string;
}

export type T2Backend = T2BackendImplemented | T2BackendUnsupported;

export const T2_BACKENDS: readonly T2Backend[] = [
  {
    id: 'prometheus',
    status: 'implemented',
    entry: pullPrometheusMetrics,
    summary: 'HTTP JSON API: GET /api/v1/query_range, read as a matrix',
  },
  {
    id: 'jaeger',
    status: 'implemented',
    entry: pullJaegerTraces,
    // The wording matters more here than for Prometheus: what is implemented is a
    // reader for the query API's own trace JSON, and nothing in this repository has
    // contacted a Jaeger deployment. "supported" would read as the stronger claim.
    summary: 'HTTP JSON API: GET /api/traces, read as a list of traces whose spans carry hex ids',
  },
  {
    id: 'loki',
    status: 'implemented',
    entry: pullLokiLogs,
    // This row used to carry the reason the backend could not be supported, and
    // the reason was true about the wire format and wrong about what followed from
    // it: "the service label is one the caller must name" is an interface, not an
    // obstacle. The summary keeps the fact that the naming is the caller's, because
    // a reader of this table still has to supply it.
    summary: 'HTTP JSON API: GET /loki/api/v1/query_range, read as streams of [ns-timestamp, line] pairs whose service label the caller names',
  },
  {
    id: 'elasticsearch',
    status: 'unsupported',
    reason:
      'Elasticsearch returns hits under dynamic mappings, so the timestamp field, the message field and the service field are per-index decisions: the same query against two clusters yields two shapes, and a reader would need a field mapping supplied by the caller before it could read anything at all',
  },
  {
    id: 'clickhouse',
    status: 'unsupported',
    reason:
      'the ClickHouse HTTP interface executes a SQL statement the caller writes and returns it in whichever format was asked for, so supporting it means either fixing a schema this project does not own or accepting arbitrary SQL -- the second of which would make the ingest path untyped',
  },
  {
    id: 'kubernetes',
    status: 'unsupported',
    reason:
      'the Kubernetes API needs credentials that are not available to the ingest path -- an in-cluster service-account token or a kubeconfig -- and its events use the involvedObject vocabulary rather than the OTel resource attributes the IR is built on, so the reader would also need a translation table',
  },
];

/** The backend with this id, or `undefined` when the id is not one of the six. */
export function findBackend(id: string): T2Backend | undefined {
  return T2_BACKENDS.find((backend) => backend.id === id);
}

/**
 * The entry point for a backend, or `null` when there is not one.
 *
 * The single dispatch point, so a caller does not have to know which backend is
 * implemented in order to refuse the others consistently.
 *
 * Overloaded on the id rather than returning the union of the two signatures: a
 * caller that drives a puller has to supply *that* puller's options, and a union
 * return type would make every call site cast. The general overload is what the
 * registry-wide checks use, and it is the one that cannot be called with options.
 */
export function backendEntry(id: 'prometheus'): PrometheusEntry | null;
export function backendEntry(id: 'jaeger'): JaegerEntry | null;
export function backendEntry(id: 'loki'): LokiEntry | null;
export function backendEntry(id: string): T2BackendEntry | null;
export function backendEntry(id: string): T2BackendEntry | null {
  const backend = findBackend(id);
  return backend !== undefined && backend.status === 'implemented' ? backend.entry : null;
}
