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

  it('rejects the whole closed relation set except the four valid ones', () => {
    // The ingest boundary now rejects an unknown relation earlier with a better
    // message, but the schema is what guards a bundle built by any other route
    // (`assembler`, a hand-edited file read back by the CLI). Prove it still
    // holds the line rather than assuming the earlier check made it redundant.
    for (const relation of ['talks_to', 'CALLS', '', 'calls ']) {
      const g = { ...validBundle().graph, edges: [{ from: 'a', to: 'b', relation }] };
      expect(entityGraphSchema.safeParse(g).success).toBe(false);
    }
    for (const relation of ['contains', 'hosts', 'calls', 'same_as']) {
      const g = { ...validBundle().graph, edges: [{ from: 'a', to: 'b', relation }] };
      expect(entityGraphSchema.safeParse(g).success).toBe(true);
    }
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

describe('entityGraphSchema - blank values are empty', () => {
  // `min(1)` alone counts a whitespace-only string as present, so `'   '` used
  // to satisfy every required string field and land in the IR as a name, an id
  // or an edge endpoint. A blank name is worse than a missing one: it becomes a
  // `byAlias` key, so two such entities manufacture an ambiguity that blames a
  // legitimate root cause. `.trim().min(1)` makes "non-blank" the rule at the
  // one place every entry point funnels through.

  const entity = (over: Record<string, unknown>): Record<string, unknown> => ({
    entityId: 'service:ns/order',
    kind: 'service',
    name: 'order',
    aliases: [],
    ...over,
  });

  it('rejects a whitespace-only entity id', () => {
    const g = { entities: [entity({ entityId: '   ' })], edges: [] };
    expect(entityGraphSchema.safeParse(g).success).toBe(false);
  });

  it('rejects a whitespace-only entity name', () => {
    const g = { entities: [entity({ name: '   ' })], edges: [] };
    expect(entityGraphSchema.safeParse(g).success).toBe(false);
  });

  it('rejects a whitespace-only alias', () => {
    const g = { entities: [entity({ aliases: ['   '] })], edges: [] };
    expect(entityGraphSchema.safeParse(g).success).toBe(false);
  });

  it('rejects an empty-string alias', () => {
    const g = { entities: [entity({ aliases: [''] })], edges: [] };
    expect(entityGraphSchema.safeParse(g).success).toBe(false);
  });

  it('rejects a whitespace-only edge from', () => {
    const g = { entities: [entity({})], edges: [{ from: '   ', to: 'service:ns/order', relation: 'calls' }] };
    expect(entityGraphSchema.safeParse(g).success).toBe(false);
  });

  it('rejects a whitespace-only edge to', () => {
    const g = { entities: [entity({})], edges: [{ from: 'service:ns/order', to: '   ', relation: 'calls' }] };
    expect(entityGraphSchema.safeParse(g).success).toBe(false);
  });

  it('still accepts a value padded with surrounding whitespace', () => {
    // The rule is "must not be blank", not "must be unpadded". A name the caller
    // padded by accident is a real name, and rejecting it would be a new way to
    // fail rather than a fix.
    const g = { entities: [entity({ name: ' order ' })], edges: [] };
    expect(entityGraphSchema.safeParse(g).success).toBe(true);
  });

  it('still accepts a normal graph', () => {
    expect(entityGraphSchema.safeParse(validBundle().graph).success).toBe(true);
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

describe('telemetrySignalSchema - the wire offset is bounded', () => {
  // `timestamp` is normalised to UTC by the ingester, so `rawOffsetMinutes` is
  // the only record of the sample's local position and nothing recomputes it.
  // A value that is merely *a* number therefore travels unverified, which is
  // how a producer writing seconds (480 -> 28800) or a raw zone id would go
  // unnoticed until an exporter misaligned a window.

  const signal = (over: Record<string, unknown>): Record<string, unknown> => ({
    irVersion: '1.0.0',
    resource: { 'service.name': 'order' },
    timestamp: '2025-03-01T00:10:00.000Z',
    signal: 'metric',
    payload: { kind: 'metric', name: 'cpu_usage', value: 0.93 },
    ...over,
  });

  it('accepts the extreme legal offsets at both ends', () => {
    // Positive control, and a closed-set check: the bounds must admit the real
    // world (UTC-12 to UTC+14), not merely reject absurd input.
    for (const offset of [-720, -480, 0, 330, 480, 840]) {
      expect(telemetrySignalSchema.safeParse(signal({ rawOffsetMinutes: offset })).success).toBe(true);
    }
  });

  it('rejects an offset beyond the real-world range', () => {
    for (const offset of [-721, 841, 28800]) {
      expect(telemetrySignalSchema.safeParse(signal({ rawOffsetMinutes: offset })).success).toBe(false);
    }
  });

  it('rejects a fractional offset', () => {
    // Real zones are whole minutes; a fraction means the value was computed in
    // the wrong unit, so accepting it would store misleading precision.
    expect(telemetrySignalSchema.safeParse(signal({ rawOffsetMinutes: 5.5 })).success).toBe(false);
  });

  it('accepts a signal that carries no offset at all', () => {
    expect(telemetrySignalSchema.safeParse(signal({})).success).toBe(true);
  });
});
