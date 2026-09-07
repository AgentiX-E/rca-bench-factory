import { describe, expect, it } from 'vitest';
import {
  RCA100_CONTRACT_VERSION,
  RCA100_TARGET_ID,
  buildRca100Alerts,
  buildEntityIndex,
  buildRca100Events,
  buildGroundTruthJson,
  buildRca100Logs,
  buildRca100Metrics,
  buildTaskJson,
  buildTopologyJson,
  buildRca100Traces,
  exportRca100,
  resolveSignalEntity,
} from '../src/export/rca100.js';
import type { Entity, EntityGraph, FaultCase, IrBundle, TelemetrySignal } from '../src/ir/types.js';

/**
 * RCA100 exporter tests.
 *
 * RCA100 (AgenticOpsEval) is the richest target format: six observability
 * modalities plus an explicit UModel topology. The contract has one hard,
 * verifiable invariant - full reference integrity: every `entity_id`,
 * `service_name` and `pod_name` must resolve into the task's `topology.json`.
 * This suite asserts that invariant with real, hand-written IR objects.
 */

function entity(kind: Entity['kind'], name: string, namespace = 'default', aliases: string[] = []): Entity {
  return { entityId: `${kind}:${namespace}/${name}`, kind, name, namespace, aliases };
}

/** A graph exercising every EntityKind so the UModel type mapping is fully covered. */
function fullGraph(): EntityGraph {
  const entities: Entity[] = [
    entity('service', 'order', 'default', ['svc-order-prod-01']),
    entity('service', 'cart', 'default', ['cartservice']),
    entity('pod', 'order-pod-1', 'default'),
    entity('node', 'node-a', 'default'),
    entity('host', 'host-a', 'default'),
    entity('container', 'order-container', 'default'),
    entity('db', 'mysql', 'default'),
    entity('mq', 'kafka', 'default'),
    entity('cluster', 'prod', 'default'),
    entity('external', 'payment-gateway', 'default'),
  ];
  const edges = [
    { from: 'service:default/order', to: 'service:default/cart', relation: 'calls' as const },
    { from: 'pod:default/order-pod-1', to: 'service:default/order', relation: 'hosts' as const },
    { from: 'node:default/node-a', to: 'pod:default/order-pod-1', relation: 'contains' as const },
    { from: 'service:default/order', to: 'db:default/mysql', relation: 'calls' as const },
  ];
  return { entities, edges };
}

function signal(kind: TelemetrySignal['signal'], resource: TelemetrySignal['resource'], payload: TelemetrySignal['payload']): TelemetrySignal {
  return {
    irVersion: '2.0',
    resource,
    timestamp: '2026-09-06T00:10:00.000Z',
    signal: kind,
    payload,
  };
}

function rca100Case(overrides: Partial<FaultCase> = {}): FaultCase {
  return {
    caseId: 'case-001',
    system: 'order-prod',
    environment: { system: 'order-prod', version: 'v1.2.3' },
    injectTime: '2026-09-06T00:10:00.000Z',
    window: { start: '2026-09-06T00:00:00.000Z', end: '2026-09-06T00:20:00.000Z' },
    fault: { type: 'cpuFullLoad', category: 'resource', injectionMethod: 'chaos-mesh', parameters: { intensity: 90 } },
    groundTruth: {
      rootCauseEntityId: 'service:default/order',
      rootCauseComponent: 'order',
      rootCauseReason: 'CPU full load on the order service',
      rootCauseIndicators: [{ type: 'metric', ref: 'order|cpu_usage', description: 'cpu_usage above 90%' }],
      causalChain: [
        {
          step: 1,
          fromEntityId: 'service:default/order',
          toEntityId: 'service:default/cart',
          mechanism: 'thread pool exhaustion propagated to the cart service',
          evidenceRefs: ['cp-1'],
        },
      ],
      evidenceCheckpoints: [
        {
          checkpointId: 'cp-1',
          entityRef: 'service:default/order',
          signalRef: 'order|cpu_usage',
          comparator: '>',
          value: 90,
          unit: '%',
          description: 'CPU usage exceeds 90 percent',
        },
      ],
    },
    query: 'httpError5xx propagating along order -> cart',
    difficulty: 'L2',
    answerKeyIsolated: true,
    ...overrides,
  };
}

function rca100Bundle(overrides: Partial<IrBundle> = {}): IrBundle {
  const fc = rca100Case();
  const signals: TelemetrySignal[] = [
    signal('metric', { 'service.name': 'order', 'k8s.pod.name': 'order-pod-1' }, { kind: 'metric', name: 'cpu_usage', value: 95, unit: '%' }),
    signal('log', { 'service.name': 'order', 'k8s.pod.name': 'order-pod-1' }, { kind: 'log', body: 'Connection pool exhausted', severityText: 'ERROR' }),
    signal('trace', { 'service.name': 'order' }, { kind: 'trace', traceId: 'tr-1', spanId: 'sp-1', spanName: 'GET /checkout', durationMs: 120, status: 'OK' }),
    signal('event', { 'service.name': 'order', 'k8s.pod.name': 'order-pod-1' }, { kind: 'event', reason: 'OOMKilled', message: 'OOMKilled observed', type: 'Warning' }),
    signal('alert', { 'service.name': 'order' }, { kind: 'alert', alertName: 'HighCpuUsage', severity: 'critical', state: 'firing' }),
  ];
  return {
    irVersion: '2.0',
    graph: fullGraph(),
    cases: [fc],
    signals: { 'case-001': signals },
    ...overrides,
  };
}

describe('buildEntityIndex / resolveSignalEntity', () => {
  const index = buildEntityIndex(fullGraph());

  it('resolves a service.name to its entity id', () => {
    const s = signal('metric', { 'service.name': 'order' }, { kind: 'metric', name: 'cpu_usage', value: 1 });
    expect(resolveSignalEntity(s, index)?.entityId).toBe('service:default/order');
  });

  it('prefers k8s.pod.name over service.name when both resolve', () => {
    const s = signal('metric', { 'service.name': 'order', 'k8s.pod.name': 'order-pod-1' }, { kind: 'metric', name: 'cpu_usage', value: 1 });
    expect(resolveSignalEntity(s, index)?.entityId).toBe('pod:default/order-pod-1');
  });

  it('resolves through an alias', () => {
    const s = signal('trace', { 'service.name': 'svc-order-prod-01' }, { kind: 'trace', traceId: 't', spanId: 's', spanName: 'x', durationMs: 1 });
    expect(resolveSignalEntity(s, index)?.entityId).toBe('service:default/order');
  });

  it('falls back to host.name then service.name', () => {
    const s = signal('metric', { 'host.name': 'host-a' }, { kind: 'metric', name: 'cpu_usage', value: 1 });
    expect(resolveSignalEntity(s, index)?.entityId).toBe('host:default/host-a');
  });

  it('returns undefined for an unresolvable reference', () => {
    const s = signal('metric', { 'service.name': 'does-not-exist' }, { kind: 'metric', name: 'cpu_usage', value: 1 });
    expect(resolveSignalEntity(s, index)).toBeUndefined();
  });
});

describe('buildTopologyJson', () => {
  it('emits UModel entities, typed edges and stats', () => {
    const parsed = JSON.parse(buildTopologyJson(fullGraph()));
    expect(parsed.stats).toEqual({ entities_total: 10, edges_total: 4 });
    const order = parsed.entities.find((e: { id: string }) => e.id === 'service:default/order');
    expect(order.type).toBe('apm.service');
    expect(order.props.namespace).toBe('default');
    expect(order.props.aliases).toEqual(['svc-order-prod-01']);
    const edge = parsed.edges.find((e: { src: string }) => e.src === 'pod:default/order-pod-1');
    expect(edge).toMatchObject({ dst: 'service:default/order', src_type: 'k8s.pod', dst_type: 'apm.service', relation: 'hosts' });
  });

  it('maps every IR entity kind to a UModel type', () => {
    const parsed = JSON.parse(buildTopologyJson(fullGraph()));
    const types = new Set(parsed.entities.map((e: { type: string }) => e.type));
    for (const t of ['apm.service', 'k8s.pod', 'k8s.node', 'apm.external.database', 'apm.external.message', 'k8s.cluster', 'apm.external']) {
      expect(types.has(t)).toBe(true);
    }
  });
});

describe('modality builders', () => {
  const index = buildEntityIndex(fullGraph());

  it('builds entity-aligned long-format metrics', () => {
    const s = signal('metric', { 'service.name': 'order', 'k8s.pod.name': 'order-pod-1' }, { kind: 'metric', name: 'cpu_usage', value: 95, unit: '%' });
    const table = buildRca100Metrics([s], index);
    expect(table.dangling).toBe(0);
    expect(table.rows).toEqual([
      { entity_id: 'pod:default/order-pod-1', entity_set: 'k8s.pod', timestamp: s.timestamp, metric: 'cpu_usage', value: 95, unit: '%' },
    ]);
  });

  it('counts a dangling metric reference instead of dropping it silently', () => {
    const s = signal('metric', { 'service.name': 'ghost' }, { kind: 'metric', name: 'cpu_usage', value: 95 });
    const table = buildRca100Metrics([s], index);
    expect(table.rows).toEqual([]);
    expect(table.dangling).toBe(1);
  });

  it('builds logs with service/pod names when present', () => {
    const s = signal('log', { 'service.name': 'order', 'k8s.pod.name': 'order-pod-1' }, { kind: 'log', body: 'boom', severityText: 'ERROR' });
    const table = buildRca100Logs([s], index);
    expect(table.dangling).toBe(0);
    expect(table.rows[0]).toMatchObject({ entity_id: 'pod:default/order-pod-1', level: 'ERROR', message: 'boom', pod_name: 'order-pod-1' });
  });

  it('builds traces aligned to the service entity', () => {
    const s = signal('trace', { 'service.name': 'order' }, { kind: 'trace', traceId: 'tr-1', spanId: 'sp-1', parentSpanId: 'sp-0', spanName: 'GET /checkout', durationMs: 120, status: 'OK' });
    const table = buildRca100Traces([s], index);
    expect(table.dangling).toBe(0);
    expect(table.rows[0]).toMatchObject({ entity_id: 'service:default/order', service_name: 'order', trace_id: 'tr-1', span_id: 'sp-1', parent_span_id: 'sp-0', operation: 'GET /checkout', duration_ms: 120, status: 'OK' });
  });

  it('builds events with a pod name', () => {
    const s = signal('event', { 'service.name': 'order', 'k8s.pod.name': 'order-pod-1' }, { kind: 'event', reason: 'OOMKilled', message: 'OOM', type: 'Warning' });
    const table = buildRca100Events([s], index);
    expect(table.dangling).toBe(0);
    expect(table.rows[0]).toMatchObject({ entity_id: 'pod:default/order-pod-1', reason: 'OOMKilled', message: 'OOM', type: 'Warning', pod_name: 'order-pod-1' });
  });

  it('builds alerts with severity and state', () => {
    const s = signal('alert', { 'service.name': 'order' }, { kind: 'alert', alertName: 'HighCpuUsage', severity: 'critical', state: 'firing' });
    const table = buildRca100Alerts([s], index);
    expect(table.dangling).toBe(0);
    expect(table.rows[0]).toMatchObject({ entity_id: 'service:default/order', alert_name: 'HighCpuUsage', severity: 'critical', state: 'firing' });
  });
});

describe('buildTaskJson', () => {
  const index = buildEntityIndex(fullGraph());

  it('emits the alert title, window and resolved entry entity', () => {
    const fc = rca100Case();
    const parsed = JSON.parse(buildTaskJson(fc, index));
    expect(parsed.alert_title).toBe(fc.query);
    expect(parsed.alert_window).toEqual({ start: '2026-09-06T00:00:00.000Z', end: '2026-09-06T00:20:00.000Z' });
    expect(parsed.alert_entity).toEqual({ entity_id: 'service:default/order', entity_name: 'order' });
  });

  it('derives a title from the fault type when no query is present', () => {
    const fc = rca100Case({ query: undefined });
    const parsed = JSON.parse(buildTaskJson(fc, index));
    expect(parsed.alert_title).toContain('cpuFullLoad');
  });
});

describe('buildGroundTruthJson', () => {
  const index = buildEntityIndex(fullGraph());

  it('emits the four-layer answer key with a JSON-encoded fault chain', () => {
    const fc = rca100Case();
    const parsed = JSON.parse(buildGroundTruthJson(fc, index));
    expect(parsed.root_cause_entities).toEqual(['order']);
    expect(parsed.root_cause_types).toEqual(['cpuFullLoad']);
    expect(typeof parsed.raw_ground_truth).toBe('string');
    const chain = JSON.parse(parsed.raw_ground_truth);
    expect(chain.outcome.target_entities).toEqual(['order']);
    expect(chain.reasoning.steps).toHaveLength(1);
    expect(chain.reasoning.steps[0]).toMatchObject({
      role: 'cause',
      from_entity: 'order',
      to_entity: 'cart',
      checkpoints: [{ signal_ref: 'order|cpu_usage', comparator: '>', value: 90, unit: '%' }],
    });
  });

  it('derives cause/propagation/impact roles from step position', () => {
    const fc = rca100Case();
    fc.groundTruth.causalChain = [
      { step: 1, fromEntityId: 'service:default/order', toEntityId: 'service:default/cart', mechanism: 'm1', evidenceRefs: [] },
      { step: 2, fromEntityId: 'service:default/cart', toEntityId: 'service:default/mysql', mechanism: 'm2', evidenceRefs: [] },
      { step: 3, fromEntityId: 'service:default/mysql', toEntityId: 'db:default/mysql', mechanism: 'm3', evidenceRefs: [] },
    ];
    const parsed = JSON.parse(buildGroundTruthJson(fc, index));
    const chain = JSON.parse(parsed.raw_ground_truth);
    expect(chain.reasoning.steps.map((s: { role: string }) => s.role)).toEqual(['cause', 'propagation', 'impact']);
  });

  it('omits checkpoints whose ids are not found in the evidence list', () => {
    const fc = rca100Case();
    fc.groundTruth.causalChain = [
      { step: 1, fromEntityId: 'service:default/order', toEntityId: 'service:default/cart', mechanism: 'm', evidenceRefs: ['missing'] },
    ];
    const parsed = JSON.parse(buildGroundTruthJson(fc, index));
    const chain = JSON.parse(parsed.raw_ground_truth);
    expect(chain.reasoning.steps[0].checkpoints).toEqual([]);
  });

  it('emits an empty root_cause_entities list when the entity is unresolved', () => {
    const fc = rca100Case({ groundTruth: { ...rca100Case().groundTruth, rootCauseEntityId: 'service:default/ghost' } });
    const parsed = JSON.parse(buildGroundTruthJson(fc, index));
    expect(parsed.root_cause_entities).toEqual([]);
  });
});

describe('exportRca100', () => {
  it('exports the full six-modality contract with a separate answer key', () => {
    const { files, skipped } = exportRca100(rca100Bundle());
    expect(skipped).toEqual([]);
    const base = 'cases/case-001';
    expect(files[`${base}/metrics.json`]).toBeDefined();
    expect(files[`${base}/logs.json`]).toBeDefined();
    expect(files[`${base}/traces.json`]).toBeDefined();
    expect(files[`${base}/events.json`]).toBeDefined();
    expect(files[`${base}/alerts.json`]).toBeDefined();
    expect(files[`${base}/task.json`]).toBeDefined();
    expect(files[`${base}/topology.json`]).toBeDefined();
    expect(files['answer_key/case-001.gt.json']).toBeDefined();
  });

  it('skips a case with no telemetry signals', () => {
    const bundle = rca100Bundle({ signals: { 'case-001': [] } });
    const { skipped } = exportRca100(bundle);
    expect(skipped).toEqual([{ caseId: 'case-001', reason: 'no telemetry signals attached' }]);
  });

  it('skips a case whose root cause does not resolve into topology', () => {
    const fc = rca100Case({ groundTruth: { ...rca100Case().groundTruth, rootCauseEntityId: 'service:default/ghost' } });
    const bundle = rca100Bundle({ cases: [fc] });
    const { skipped } = exportRca100(bundle);
    expect(skipped[0]?.reason).toMatch(/root-cause/i);
  });

  it('skips a case with a dangling signal reference', () => {
    const bundle = rca100Bundle();
    bundle.signals['case-001'] = [
      signal('metric', { 'service.name': 'ghost' }, { kind: 'metric', name: 'cpu_usage', value: 95 }),
    ];
    const { skipped } = exportRca100(bundle);
    expect(skipped[0]?.reason).toMatch(/reference/i);
  });

  it('declares the RCA100 contract identity', () => {
    expect(RCA100_TARGET_ID).toBe('rca100');
    expect(RCA100_CONTRACT_VERSION).toBe('v1.1');
  });
});

describe('defensive branches (null/undefined handling)', () => {
  const index = buildEntityIndex(fullGraph());

  it('emits a null namespace and merges entity attributes into props', () => {
    const g: EntityGraph = {
      entities: [
        { entityId: 'service:x/nsless', kind: 'service', name: 'nsless', aliases: [], attributes: { region: 'us-east-1' } },
      ],
      edges: [],
    };
    const parsed = JSON.parse(buildTopologyJson(g));
    expect(parsed.entities[0].props.namespace).toBeNull();
    expect(parsed.entities[0].props.region).toBe('us-east-1');
  });

  it('maps a dangling edge to the external type fallback', () => {
    const g: EntityGraph = {
      entities: [{ entityId: 'service:x/a', kind: 'service', name: 'a', aliases: [] }],
      edges: [{ from: 'service:x/a', to: 'service:x/missing', relation: 'calls' }],
    };
    const parsed = JSON.parse(buildTopologyJson(g));
    expect(parsed.edges[0].dst_type).toBe('apm.external');
  });

  it('maps a dangling src to the external type fallback', () => {
    const g: EntityGraph = {
      entities: [{ entityId: 'service:x/a', kind: 'service', name: 'a', aliases: [] }],
      edges: [{ from: 'service:x/missing', to: 'service:x/a', relation: 'calls' }],
    };
    const parsed = JSON.parse(buildTopologyJson(g));
    expect(parsed.edges[0].src_type).toBe('apm.external');
  });

  it('emits an empty unit for a unit-less metric', () => {
    const s = signal('metric', { 'service.name': 'order' }, { kind: 'metric', name: 'cpu_usage', value: 95 });
    expect(buildRca100Metrics([s], index).rows[0]?.unit).toBe('');
  });

  it('counts dangling references for logs, traces, events and alerts', () => {
    const log = signal('log', { 'service.name': 'ghost' }, { kind: 'log', body: 'x' });
    const trace = signal('trace', { 'service.name': 'ghost' }, { kind: 'trace', traceId: 't', spanId: 's', spanName: 'x', durationMs: 1 });
    const event = signal('event', { 'service.name': 'ghost' }, { kind: 'event', reason: 'x' });
    const alert = signal('alert', { 'service.name': 'ghost' }, { kind: 'alert', alertName: 'x' });
    expect(buildRca100Logs([log], index).dangling).toBe(1);
    expect(buildRca100Traces([trace], index).dangling).toBe(1);
    expect(buildRca100Events([event], index).dangling).toBe(1);
    expect(buildRca100Alerts([alert], index).dangling).toBe(1);
  });

  it('emits empty optional fields for a minimal log', () => {
    const s = signal('log', { 'service.name': 'order' }, { kind: 'log', body: 'x' });
    const row = buildRca100Logs([s], index).rows[0]!;
    expect(row.level).toBe('');
    expect(row.pod_name).toBeUndefined();
  });

  it('emits empty parent and default status for a minimal trace', () => {
    const s = signal('trace', { 'service.name': 'order' }, { kind: 'trace', traceId: 't', spanId: 's', spanName: 'x', durationMs: 1 });
    const row = buildRca100Traces([s], index).rows[0]!;
    expect(row.parent_span_id).toBe('');
    expect(row.status).toBe('UNSET');
  });

  it('emits empty message/type/pod for a minimal event', () => {
    const s = signal('event', { 'service.name': 'order' }, { kind: 'event', reason: 'x' });
    const row = buildRca100Events([s], index).rows[0]!;
    expect(row.message).toBe('');
    expect(row.type).toBe('');
    expect(row.pod_name).toBeUndefined();
  });

  it('emits empty severity/state for a minimal alert', () => {
    const s = signal('alert', { 'service.name': 'order' }, { kind: 'alert', alertName: 'x' });
    const row = buildRca100Alerts([s], index).rows[0]!;
    expect(row.severity).toBe('');
    expect(row.state).toBe('');
  });

  it('emits a null alert_entity for an unresolved entry', () => {
    const fc = rca100Case({ groundTruth: { ...rca100Case().groundTruth, rootCauseEntityId: 'service:default/ghost' } });
    const parsed = JSON.parse(buildTaskJson(fc, index));
    expect(parsed.alert_entity).toBeNull();
  });

  it('tolerates a missing causal chain and evidence list', () => {
    const fc = rca100Case();
    const gt = { ...fc.groundTruth };
    delete gt.causalChain;
    delete gt.evidenceCheckpoints;
    fc.groundTruth = gt;
    const parsed = JSON.parse(buildGroundTruthJson(fc, index));
    const chain = JSON.parse(parsed.raw_ground_truth);
    expect(chain.reasoning.steps).toEqual([]);
  });

  it('emits null signal_ref and unit for a minimal checkpoint', () => {
    const fc = rca100Case();
    fc.groundTruth.evidenceCheckpoints = [
      { checkpointId: 'cp-1', entityRef: 'service:default/order', comparator: '>', value: 90, description: 'high cpu' },
    ];
    fc.groundTruth.causalChain = [
      { step: 1, fromEntityId: 'service:default/order', toEntityId: 'service:default/cart', mechanism: 'm', evidenceRefs: ['cp-1'] },
    ];
    const parsed = JSON.parse(buildGroundTruthJson(fc, index));
    const chain = JSON.parse(parsed.raw_ground_truth);
    expect(chain.reasoning.steps[0].checkpoints[0]).toMatchObject({ signal_ref: null, unit: null });
  });

  it('skips a case absent from the signals map', () => {
    const bundle = rca100Bundle({ signals: {} });
    const { skipped } = exportRca100(bundle);
    expect(skipped[0]?.reason).toBe('no telemetry signals attached');
  });
});
