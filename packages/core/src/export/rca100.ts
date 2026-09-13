import type {
  Entity,
  EntityGraph,
  EntityKind,
  EvidenceCheckpoint,
  FaultCase,
  IrBundle,
  TelemetrySignal,
} from '../ir/types.js';
import { isAlertSignal, isEventSignal, isLogSignal, isMetricSignal, isTraceSignal } from '../ir/guards.js';
import type { ExportedFiles } from './openrca.js';
import { assertExportableBundle } from './guard.js';

/**
 * RCA100 exporter (AgenticOpsEval, Alibaba Cloud Tianchi 2025).
 *
 * RCA100 is the richest target format: six observability modalities (metrics,
 * logs, traces, events, alerts) plus an explicit UModel entity-relation
 * topology. Its single hard, verifiable invariant is full reference integrity -
 * every `entity_id`, `service_name` and `pod_name` must resolve into the task's
 * `topology.json`, and the ground-truth root-cause entity must match the
 * topology. This exporter enforces that invariant instead of emitting a broken
 * contract: a case whose signals or root cause cannot resolve is skipped with a
 * reason, never silently repaired.
 *
 * Layout (mirrors the official per-task slice):
 *   cases/{caseId}/metrics.json   entity-aligned long format
 *   cases/{caseId}/logs.json      SLS application-log schema
 *   cases/{caseId}/traces.json    OpenTelemetry span schema
 *   cases/{caseId}/events.json    K8s lifecycle signals
 *   cases/{caseId}/alerts.json    entry-alert lifecycle
 *   cases/{caseId}/task.json      agent-facing task contract
 *   cases/{caseId}/topology.json  UModel entity-relation snapshot
 *   answer_key/{caseId}.gt.json   four-layer ground truth
 *
 * The official distribution serializes the five modality tables as Parquet. The
 * field contract (column names, types, reference semantics) is preserved here;
 * JSON is used as a text-superset serialization so the tables stay diffable and
 * byte-stable for Golden-Master verification.
 */

export const RCA100_TARGET_ID = 'rca100';
export const RCA100_CONTRACT_VERSION = 'v1.1';

/**
 * IR `EntityKind` -> RCA100 UModel entity type.
 *
 * `host` projects onto `k8s.node` and `container` onto `k8s.pod` because the
 * UModel type system does not expose a first-class host/container type; the
 * original kind is preserved in the entity `props` so nothing is lost.
 */
const UMODEL_TYPE: Record<EntityKind, string> = {
  service: 'apm.service',
  pod: 'k8s.pod',
  node: 'k8s.node',
  host: 'k8s.node',
  container: 'k8s.pod',
  db: 'apm.external.database',
  mq: 'apm.external.message',
  cluster: 'k8s.cluster',
  external: 'apm.external',
};

/** Resource attributes tried, most-specific first, when resolving a signal. */
const RESOLUTION_KEYS = ['k8s.pod.name', 'k8s.node.name', 'host.name', 'service.name'] as const;

export interface EntityIndex {
  byId: Map<string, Entity>;
  byName: Map<string, Entity>;
}

export interface Rca100ModalityTable {
  rows: Array<Record<string, string | number | null>>;
  /** Signals whose entity reference could not resolve into the topology. */
  dangling: number;
}

export interface Rca100ExportResult {
  files: ExportedFiles;
  skipped: Array<{ caseId: string; reason: string }>;
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

/** Index graph entities by id and by every name/alias for reference resolution. */
export function buildEntityIndex(graph: EntityGraph): EntityIndex {
  const byId = new Map<string, Entity>();
  const byName = new Map<string, Entity>();
  for (const e of graph.entities) {
    byId.set(e.entityId, e);
    byName.set(e.name, e);
    for (const alias of e.aliases) byName.set(alias, e);
  }
  return { byId, byName };
}

/**
 * Resolve a signal to the topology entity it describes.
 *
 * Resource attributes are tried most-specific-first (pod, node, host, service);
 * the first name/alias match wins. Returns `undefined` for a dangling reference.
 */
export function resolveSignalEntity(signal: TelemetrySignal, index: EntityIndex): Entity | undefined {
  for (const key of RESOLUTION_KEYS) {
    const value = signal.resource[key];
    if (value !== undefined) {
      const match = index.byName.get(value);
      if (match !== undefined) return match;
    }
  }
  return undefined;
}

export function buildTopologyJson(graph: EntityGraph): string {
  const byId = new Map(graph.entities.map((e) => [e.entityId, e]));
  const entities = graph.entities.map((e) => ({
    id: e.entityId,
    type: UMODEL_TYPE[e.kind],
    name: e.name,
    // The IR does not track entity observation windows; the official dataset
    // derives these from signal timestamps, so they are emitted as null.
    first_observed: null,
    last_observed: null,
    props: {
      namespace: e.namespace ?? null,
      aliases: e.aliases,
      original_kind: e.kind,
      ...(e.attributes ?? {}),
    },
  }));
  const edges = graph.edges.map((edge) => ({
    src: edge.from,
    src_type: UMODEL_TYPE[byId.get(edge.from)?.kind ?? 'external'],
    dst: edge.to,
    dst_type: UMODEL_TYPE[byId.get(edge.to)?.kind ?? 'external'],
    relation: edge.relation,
  }));
  return toJson({
    entities,
    edges,
    stats: { entities_total: entities.length, edges_total: edges.length },
  });
}

export function buildRca100Metrics(signals: TelemetrySignal[], index: EntityIndex): Rca100ModalityTable {
  const rows: Array<Record<string, string | number | null>> = [];
  let dangling = 0;
  for (const s of signals) {
    if (!isMetricSignal(s)) continue;
    const entity = resolveSignalEntity(s, index);
    if (entity === undefined) {
      dangling += 1;
      continue;
    }
    const p = s.payload;
    rows.push({
      entity_id: entity.entityId,
      entity_set: UMODEL_TYPE[entity.kind],
      timestamp: s.timestamp,
      metric: p.name,
      value: p.value,
      unit: p.unit ?? '',
    });
  }
  return { rows, dangling };
}

export function buildRca100Logs(signals: TelemetrySignal[], index: EntityIndex): Rca100ModalityTable {
  const rows: Array<Record<string, string | number | null>> = [];
  let dangling = 0;
  for (const s of signals) {
    if (!isLogSignal(s)) continue;
    const entity = resolveSignalEntity(s, index);
    if (entity === undefined) {
      dangling += 1;
      continue;
    }
    const p = s.payload;
    const row: Record<string, string | number | null> = {
      entity_id: entity.entityId,
      timestamp: s.timestamp,
      level: p.severityText ?? '',
      message: p.body,
    };
    if (s.resource['k8s.pod.name'] !== undefined) row.pod_name = s.resource['k8s.pod.name'];
    rows.push(row);
  }
  return { rows, dangling };
}

export function buildRca100Traces(signals: TelemetrySignal[], index: EntityIndex): Rca100ModalityTable {
  const rows: Array<Record<string, string | number | null>> = [];
  let dangling = 0;
  for (const s of signals) {
    if (!isTraceSignal(s)) continue;
    const entity = resolveSignalEntity(s, index);
    if (entity === undefined) {
      dangling += 1;
      continue;
    }
    const p = s.payload;
    rows.push({
      entity_id: entity.entityId,
      service_name: s.resource['service.name'],
      trace_id: p.traceId,
      span_id: p.spanId,
      parent_span_id: p.parentSpanId ?? '',
      operation: p.spanName,
      duration_ms: p.durationMs,
      status: p.status ?? 'UNSET',
    });
  }
  return { rows, dangling };
}

export function buildRca100Events(signals: TelemetrySignal[], index: EntityIndex): Rca100ModalityTable {
  const rows: Array<Record<string, string | number | null>> = [];
  let dangling = 0;
  for (const s of signals) {
    if (!isEventSignal(s)) continue;
    const entity = resolveSignalEntity(s, index);
    if (entity === undefined) {
      dangling += 1;
      continue;
    }
    const p = s.payload;
    const row: Record<string, string | number | null> = {
      entity_id: entity.entityId,
      timestamp: s.timestamp,
      reason: p.reason,
      message: p.message ?? '',
      type: p.type ?? '',
    };
    if (s.resource['k8s.pod.name'] !== undefined) row.pod_name = s.resource['k8s.pod.name'];
    rows.push(row);
  }
  return { rows, dangling };
}

export function buildRca100Alerts(signals: TelemetrySignal[], index: EntityIndex): Rca100ModalityTable {
  const rows: Array<Record<string, string | number | null>> = [];
  let dangling = 0;
  for (const s of signals) {
    if (!isAlertSignal(s)) continue;
    const entity = resolveSignalEntity(s, index);
    if (entity === undefined) {
      dangling += 1;
      continue;
    }
    const p = s.payload;
    rows.push({
      entity_id: entity.entityId,
      alert_name: p.alertName,
      timestamp: s.timestamp,
      severity: p.severity ?? '',
      state: p.state ?? '',
    });
  }
  return { rows, dangling };
}

export function buildTaskJson(fc: FaultCase, index: EntityIndex): string {
  const entry = index.byId.get(fc.groundTruth.rootCauseEntityId);
  return toJson({
    task_id: fc.caseId,
    alert_title: fc.query ?? `fault: ${fc.fault.type}`,
    alert_window: { start: fc.window.start, end: fc.window.end },
    alert_entity: entry === undefined ? null : { entity_id: entry.entityId, entity_name: entry.name },
  });
}

/** Derive the typed chain role from the step position (first/last/middle). */
function deriveRole(i: number, total: number): 'cause' | 'propagation' | 'impact' {
  if (total === 1) return 'cause';
  if (i === 0) return 'cause';
  if (i === total - 1) return 'impact';
  return 'propagation';
}

export function buildGroundTruthJson(fc: FaultCase, index: EntityIndex): string {
  const rootEntity = index.byId.get(fc.groundTruth.rootCauseEntityId);
  const rootCauseEntities = rootEntity === undefined ? [] : [rootEntity.name];

  const chain = fc.groundTruth.causalChain ?? [];
  const checkpointById = new Map(
    (fc.groundTruth.evidenceCheckpoints ?? []).map((c) => [c.checkpointId, c]),
  );

  const steps = chain.map((step, i) => {
    const fromEntity = index.byId.get(step.fromEntityId);
    const toEntity = index.byId.get(step.toEntityId);
    const checkpoints = step.evidenceRefs
      .map((ref) => checkpointById.get(ref))
      .filter((c): c is EvidenceCheckpoint => c !== undefined)
      .map((c) => ({
        signal_ref: c.signalRef ?? null,
        comparator: c.comparator,
        value: c.value,
        unit: c.unit ?? null,
        description: c.description,
      }));
    return {
      role: deriveRole(i, chain.length),
      from_entity: fromEntity?.name ?? null,
      to_entity: toEntity?.name ?? null,
      mechanism: step.mechanism,
      checkpoints,
    };
  });

  const rawGroundTruth = JSON.stringify({
    outcome: { target_entities: rootCauseEntities },
    reasoning: { steps },
  });

  return toJson({
    task_id: fc.caseId,
    case_id: fc.caseId,
    root_cause_entities: rootCauseEntities,
    root_cause_types: [fc.fault.type],
    raw_ground_truth: rawGroundTruth,
  });
}

/**
 * Export a bundle to the RCA100 field contract.
 *
 * Two non-negotiable invariants are enforced before any file is emitted:
 *   1. the ground-truth root-cause entity resolves into the topology;
 *   2. every signal reference resolves into the topology (no dangling edges).
 * A case violating either is skipped with a reason, never silently repaired.
 */
export function exportRca100(bundle: IrBundle): Rca100ExportResult {
  assertExportableBundle(bundle);
  const files: ExportedFiles = {};
  const skipped: Array<{ caseId: string; reason: string }> = [];
  const index = buildEntityIndex(bundle.graph);

  for (const fc of bundle.cases) {
    const signals = bundle.signals[fc.caseId] ?? [];
    if (signals.length === 0) {
      skipped.push({ caseId: fc.caseId, reason: 'no telemetry signals attached' });
      continue;
    }
    if (!index.byId.has(fc.groundTruth.rootCauseEntityId)) {
      skipped.push({ caseId: fc.caseId, reason: 'root-cause entity does not resolve into topology' });
      continue;
    }

    const metrics = buildRca100Metrics(signals, index);
    const logs = buildRca100Logs(signals, index);
    const traces = buildRca100Traces(signals, index);
    const events = buildRca100Events(signals, index);
    const alerts = buildRca100Alerts(signals, index);
    const dangling = metrics.dangling + logs.dangling + traces.dangling + events.dangling + alerts.dangling;
    if (dangling > 0) {
      skipped.push({ caseId: fc.caseId, reason: `${dangling} signal(s) reference entities absent from topology` });
      continue;
    }

    const base = `cases/${fc.caseId}`;
    files[`${base}/metrics.json`] = toJson(metrics.rows);
    files[`${base}/logs.json`] = toJson(logs.rows);
    files[`${base}/traces.json`] = toJson(traces.rows);
    files[`${base}/events.json`] = toJson(events.rows);
    files[`${base}/alerts.json`] = toJson(alerts.rows);
    files[`${base}/task.json`] = buildTaskJson(fc, index);
    files[`${base}/topology.json`] = buildTopologyJson(bundle.graph);
    files[`answer_key/${fc.caseId}.gt.json`] = buildGroundTruthJson(fc, index);
  }

  return { files, skipped };
}
