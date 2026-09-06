import { describe, expect, it } from 'vitest';
import {
  entityGraphSchema,
  faultCaseSchema,
  irBundleSchema,
  telemetrySignalSchema,
} from '../src/ir/schema.js';
import { IR_VERSION } from '../src/ir/types.js';
import { validBundle, validCase } from './fixtures.js';

/**
 * Contract tests for the runtime schemas.
 *
 * The IR crosses process boundaries and LLM-generated rules can produce
 * structurally valid but semantically wrong objects, so the schemas are part of
 * the product contract and are tested as such.
 */

describe('IR_VERSION', () => {
  it('is a semantic version string', () => {
    expect(IR_VERSION).toMatch(/^\d+\.\d+$/);
  });
});

describe('telemetrySignalSchema', () => {
  it('accepts a metric signal', () => {
    const r = telemetrySignalSchema.safeParse({
      irVersion: '2.0',
      resource: { 'service.name': 'order' },
      timestamp: '2026-09-06T00:00:00.000Z',
      signal: 'metric',
      payload: { kind: 'metric', name: 'cpu_usage', value: 91.5, unit: '%' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a log signal with template parameters', () => {
    const r = telemetrySignalSchema.safeParse({
      irVersion: '2.0',
      resource: { 'service.name': 'order' },
      timestamp: '2026-09-06T00:00:00.000Z',
      signal: 'log',
      payload: { kind: 'log', body: 'boom', severityText: 'ERROR', templateId: 'L1', params: { host: 'db-1' } },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a trace signal with a parent span', () => {
    const r = telemetrySignalSchema.safeParse({
      irVersion: '2.0',
      resource: { 'service.name': 'order' },
      timestamp: '2026-09-06T00:00:00.000Z',
      signal: 'trace',
      payload: {
        kind: 'trace',
        traceId: 't1',
        spanId: 's2',
        parentSpanId: 's1',
        spanName: 'GET /x',
        durationMs: 12.5,
        status: 'ERROR',
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts event, alert and profile payloads', () => {
    const base = { irVersion: '2.0', resource: { 'service.name': 'order' }, timestamp: '2026-09-06T00:00:00.000Z' };
    expect(
      telemetrySignalSchema.safeParse({ ...base, signal: 'event', payload: { kind: 'event', reason: 'OOMKilled', changeType: 'deploy' } }).success,
    ).toBe(true);
    expect(
      telemetrySignalSchema.safeParse({ ...base, signal: 'alert', payload: { kind: 'alert', alertName: 'HighCpu', severity: 'critical', state: 'firing' } }).success,
    ).toBe(true);
    expect(
      telemetrySignalSchema.safeParse({ ...base, signal: 'profile', payload: { kind: 'profile', profileType: 'cpu', payloadRef: 's3://p/1.pb' } }).success,
    ).toBe(true);
  });

  it('rejects a missing service.name', () => {
    const r = telemetrySignalSchema.safeParse({
      irVersion: '2.0',
      resource: {},
      timestamp: '2026-09-06T00:00:00.000Z',
      signal: 'metric',
      payload: { kind: 'metric', name: 'cpu', value: 1 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a non-finite metric value', () => {
    const r = telemetrySignalSchema.safeParse({
      irVersion: '2.0',
      resource: { 'service.name': 'order' },
      timestamp: '2026-09-06T00:00:00.000Z',
      signal: 'metric',
      payload: { kind: 'metric', name: 'cpu', value: Number.POSITIVE_INFINITY },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a payload whose kind does not match the signal', () => {
    const r = telemetrySignalSchema.safeParse({
      irVersion: '2.0',
      resource: { 'service.name': 'order' },
      timestamp: '2026-09-06T00:00:00.000Z',
      signal: 'metric',
      payload: { kind: 'log', body: 'x' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown signal kind', () => {
    const r = telemetrySignalSchema.safeParse({
      irVersion: '2.0',
      resource: { 'service.name': 'order' },
      timestamp: '2026-09-06T00:00:00.000Z',
      signal: 'vibes',
      payload: { kind: 'metric', name: 'cpu', value: 1 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown severity', () => {
    const r = telemetrySignalSchema.safeParse({
      irVersion: '2.0',
      resource: { 'service.name': 'order' },
      timestamp: '2026-09-06T00:00:00.000Z',
      signal: 'log',
      payload: { kind: 'log', body: 'x', severityText: 'PANIC' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a negative span duration', () => {
    const r = telemetrySignalSchema.safeParse({
      irVersion: '2.0',
      resource: { 'service.name': 'order' },
      timestamp: '2026-09-06T00:00:00.000Z',
      signal: 'trace',
      payload: { kind: 'trace', traceId: 't', spanId: 's', spanName: 'n', durationMs: -1 },
    });
    expect(r.success).toBe(false);
  });
});

describe('faultCaseSchema', () => {
  it('accepts the canonical fixture', () => {
    expect(faultCaseSchema.safeParse(validCase()).success).toBe(true);
  });

  it('rejects an unknown fault category', () => {
    const fc = validCase();
    fc.fault.category = 'gremlins' as unknown as (typeof fc)['fault']['category'];
    expect(faultCaseSchema.safeParse(fc).success).toBe(false);
  });

  it('rejects an unknown injection method', () => {
    const fc = validCase();
    fc.fault.injectionMethod = 'prayer' as unknown as (typeof fc)['fault']['injectionMethod'];
    expect(faultCaseSchema.safeParse(fc).success).toBe(false);
  });

  it('rejects an unknown difficulty level', () => {
    const fc = validCase();
    fc.difficulty = 'L9' as unknown as (typeof fc)['difficulty'];
    expect(faultCaseSchema.safeParse(fc).success).toBe(false);
  });

  it('rejects an empty root cause reason', () => {
    const fc = validCase();
    fc.groundTruth.rootCauseReason = '';
    expect(faultCaseSchema.safeParse(fc).success).toBe(false);
  });

  it('rejects a checkpoint with an unsupported comparator', () => {
    const fc = validCase();
    fc.groundTruth.evidenceCheckpoints = [
      { checkpointId: 'c', entityRef: 'service:default/order', comparator: '~=', value: 1, description: 'd' },
    ] as unknown as (typeof fc)['groundTruth']['evidenceCheckpoints'];
    expect(faultCaseSchema.safeParse(fc).success).toBe(false);
  });
});

describe('entityGraphSchema', () => {
  it('accepts the fixture graph', () => {
    expect(entityGraphSchema.safeParse(validBundle().graph).success).toBe(true);
  });

  it('rejects an unknown relation', () => {
    const g = { ...validBundle().graph, edges: [{ from: 'a', to: 'b', relation: 'talks_to' }] };
    expect(entityGraphSchema.safeParse(g).success).toBe(false);
  });

  it('rejects an unknown entity kind', () => {
    const g = { ...validBundle().graph, entities: [{ entityId: 'x', kind: 'laptop', name: 'x', aliases: [] }] };
    expect(entityGraphSchema.safeParse(g).success).toBe(false);
  });

  it('rejects an entity without an id', () => {
    const g = { entities: [{ kind: 'service', name: 'x', aliases: [] }], edges: [] };
    expect(entityGraphSchema.safeParse(g).success).toBe(false);
  });
});

describe('irBundleSchema', () => {
  it('accepts the canonical fixture', () => {
    expect(irBundleSchema.safeParse(validBundle()).success).toBe(true);
  });

  it('rejects a bundle whose irVersion is missing', () => {
    const b = validBundle() as unknown as Record<string, unknown>;
    delete b['irVersion'];
    expect(irBundleSchema.safeParse(b).success).toBe(false);
  });

  it('rejects a bundle with a malformed case', () => {
    const b = validBundle();
    b.cases = [{ caseId: '' }] as unknown as typeof b.cases;
    expect(irBundleSchema.safeParse(b).success).toBe(false);
  });
});
