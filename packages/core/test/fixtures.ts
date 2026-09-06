import type { FaultCase, IrBundle, TelemetrySignal } from '../src/ir/types.js';

/**
 * Shared fixtures.
 *
 * These are real, hand-written IR objects - no mocks, no generated stubs. The
 * same fixtures are reused by the gate, exporter and coverage suites so a change
 * to the IR cannot silently desynchronise the tests.
 */

export const T0 = '2026-09-06T00:00:00.000Z';
export const INJECT = '2026-09-06T00:10:00.000Z';
export const T1 = '2026-09-06T00:20:00.000Z';

export function metricAt(
  offsetSeconds: number,
  name: string,
  value: number,
  service = 'order',
  unit = '%',
): TelemetrySignal {
  const ts = new Date(Date.parse(T0) + offsetSeconds * 1000).toISOString().slice(0, 23) + 'Z';
  return {
    irVersion: '2.0',
    resource: { 'service.name': service, 'k8s.pod.name': `${service}-pod-1` },
    timestamp: ts,
    rawOffsetMinutes: 0,
    signal: 'metric',
    payload: { kind: 'metric', name, value, unit, semanticType: 'saturation' },
  };
}

export function logAt(offsetSeconds: number, body: string, service = 'order'): TelemetrySignal {
  const ts = new Date(Date.parse(T0) + offsetSeconds * 1000).toISOString().slice(0, 23) + 'Z';
  return {
    irVersion: '2.0',
    resource: { 'service.name': service },
    timestamp: ts,
    signal: 'log',
    payload: { kind: 'log', body, severityText: 'ERROR' },
  };
}

export function traceAt(
  offsetSeconds: number,
  traceId: string,
  spanId: string,
  parentSpanId?: string,
): TelemetrySignal {
  const ts = new Date(Date.parse(T0) + offsetSeconds * 1000).toISOString().slice(0, 23) + 'Z';
  return {
    irVersion: '2.0',
    resource: { 'service.name': 'order' },
    timestamp: ts,
    signal: 'trace',
    payload: {
      kind: 'trace',
      traceId,
      spanId,
      ...(parentSpanId === undefined ? {} : { parentSpanId }),
      spanName: 'GET /checkout',
      durationMs: 120,
      status: 'OK',
    },
  };
}

export function eventAt(offsetSeconds: number, reason: string): TelemetrySignal {
  const ts = new Date(Date.parse(T0) + offsetSeconds * 1000).toISOString().slice(0, 23) + 'Z';
  return {
    irVersion: '2.0',
    resource: { 'service.name': 'order' },
    timestamp: ts,
    signal: 'event',
    payload: { kind: 'event', reason, message: `${reason} observed`, type: 'Warning' },
  };
}

export function alertAt(offsetSeconds: number, alertName: string): TelemetrySignal {
  const ts = new Date(Date.parse(T0) + offsetSeconds * 1000).toISOString().slice(0, 23) + 'Z';
  return {
    irVersion: '2.0',
    resource: { 'service.name': 'order' },
    timestamp: ts,
    signal: 'alert',
    payload: { kind: 'alert', alertName, severity: 'critical', state: 'firing' },
  };
}

/** Baseline metric values: steady, low CPU. */
export const BASELINE_CPU = [20, 21, 19, 20, 22, 18, 20, 21, 19, 20];
/** Post-injection values: a clear, sustained CPU saturation. */
export const ANOMALY_CPU = [95, 96, 97, 98, 99];

export function cpuSignals(): TelemetrySignal[] {
  const out: TelemetrySignal[] = [];
  BASELINE_CPU.forEach((v, i) => out.push(metricAt(i * 30, 'cpu_usage', v)));
  ANOMALY_CPU.forEach((v, i) => out.push(metricAt(600 + i * 30, 'cpu_usage', v)));
  return out;
}

export function validCase(overrides: Partial<FaultCase> = {}): FaultCase {
  return {
    caseId: 'case-001',
    system: 'order-prod',
    environment: { system: 'order-prod', version: 'v1.2.3' },
    injectTime: INJECT,
    window: { start: T0, end: T1 },
    fault: {
      type: 'cpu',
      category: 'resource',
      injectionMethod: 'chaos-mesh',
      parameters: { intensity: 90 },
    },
    groundTruth: {
      rootCauseEntityId: 'service:default/order',
      rootCauseComponent: 'order',
      rootCauseReason: 'CPU saturation on the order service',
      rootCauseIndicators: [
        { type: 'metric', ref: 'order|cpu_usage', description: 'cpu_usage above 90%' },
      ],
      causalChain: [
        {
          step: 1,
          fromEntityId: 'service:default/order',
          toEntityId: 'service:default/cart',
          mechanism: 'thread pool exhaustion propagated to the downstream cart service',
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
    query: 'The order service became slow at 08:10 UTC+8. Find the root cause.',
    difficulty: 'L2',
    answerKeyIsolated: true,
    ...overrides,
  };
}

export function validBundle(overrides: Partial<IrBundle> = {}): IrBundle {
  const fc = validCase();
  return {
    irVersion: '2.0',
    graph: {
      entities: [
        {
          entityId: 'service:default/order',
          kind: 'service',
          name: 'order',
          namespace: 'default',
          aliases: ['svc-order-prod-01'],
        },
        {
          entityId: 'service:default/cart',
          kind: 'service',
          name: 'cart',
          namespace: 'default',
          aliases: ['cartservice'],
        },
      ],
      edges: [{ from: 'service:default/order', to: 'service:default/cart', relation: 'calls' }],
    },
    cases: [fc],
    signals: {
      'case-001': [
        ...cpuSignals(),
        logAt(610, 'Connection pool exhausted', 'order'),
        traceAt(615, 'tr-1', 'sp-1'),
        traceAt(616, 'tr-1', 'sp-2', 'sp-1'),
        eventAt(600, 'OOMKilled'),
        alertAt(605, 'HighCpuUsage'),
      ],
    },
    ...overrides,
  };
}
