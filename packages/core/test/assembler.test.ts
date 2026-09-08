import { describe, expect, it } from 'vitest';
import { assembleBundle } from '../src/ir/assembler.js';
import type { BundleDraft } from '../src/ir/assembler.js';

/**
 * Bundle assembler tests.
 *
 * `assembleBundle` is the `case` command's core: it turns an untrusted draft
 * into a schema-valid `IrBundle`, normalising the fault type and inferring its
 * category. The suite exercises the happy path, fault normalisation, and every
 * malformed-draft rejection path with real, hand-written objects.
 */

function validDraft(overrides: Partial<BundleDraft> = {}): BundleDraft {
  return {
    graph: {
      entities: [
        { entityId: 'service:default/order', kind: 'service', name: 'order', namespace: 'default', aliases: [] },
      ],
      edges: [],
    },
    case: {
      caseId: 'case-001',
      system: 'order-prod',
      environment: { system: 'order-prod', version: 'v1.2.3' },
      injectTime: '2026-09-06T00:10:00.000Z',
      window: { start: '2026-09-06T00:00:00.000Z', end: '2026-09-06T00:20:00.000Z' },
      fault: { type: 'cpu' },
      groundTruth: {
        rootCauseEntityId: 'service:default/order',
        rootCauseComponent: 'order',
        rootCauseReason: 'CPU saturation on the order service',
      },
      query: 'The order service became slow.',
      difficulty: 'L2',
    },
    signals: [
      {
        irVersion: '2.0',
        resource: { 'service.name': 'order' },
        timestamp: '2026-09-06T00:10:00.000Z',
        signal: 'metric',
        payload: { kind: 'metric', name: 'cpu_usage', value: 95, unit: '%' },
      },
    ],
    ...overrides,
  };
}

describe('assembleBundle - happy path', () => {
  it('assembles a valid draft into a schema-checked bundle', () => {
    const result = assembleBundle(validDraft());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.cases[0]?.caseId).toBe('case-001');
    expect(result.bundle.signals['case-001']).toHaveLength(1);
    expect(result.bundle.irVersion).toBe('2.0');
  });

  it('normalises a free-form fault type and infers its category', () => {
    const result = assembleBundle(validDraft({ case: { ...validDraft().case, fault: { type: 'CPU Full Load' } } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.cases[0]?.fault).toMatchObject({ type: 'cpu-full-load', category: 'resource' });
  });

  it('preserves an explicit fault category', () => {
    const result = assembleBundle(validDraft({ case: { ...validDraft().case, fault: { type: 'slowSQL', category: 'middleware' } } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.cases[0]?.fault.category).toBe('middleware');
  });

  it('honours an explicit irVersion', () => {
    const result = assembleBundle(validDraft({ irVersion: '2.1' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.irVersion).toBe('2.1');
  });

  it('defaults the environment and omits absent optional fields', () => {
    const base = validDraft();
    const result = assembleBundle({
      ...base,
      case: { ...base.case, environment: undefined, query: undefined, difficulty: undefined },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fc = result.bundle.cases[0]!;
    expect(fc.environment).toEqual({ system: 'order-prod' });
    expect(fc.query).toBeUndefined();
    expect(fc.difficulty).toBeUndefined();
  });

  it('preserves answerKeyIsolated', () => {
    const base = validDraft();
    const result = assembleBundle({ ...base, case: { ...base.case, answerKeyIsolated: true } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.cases[0]?.answerKeyIsolated).toBe(true);
  });
});

describe('assembleBundle - malformed drafts', () => {
  it('rejects a non-object draft', () => {
    const result = assembleBundle(null);
    expect(result.ok).toBe(false);
  });

  it('rejects a draft without a case', () => {
    const result = assembleBundle({ graph: {}, signals: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects a draft whose fault is not an object', () => {
    const result = assembleBundle({ case: { fault: 'cpu' }, graph: {}, signals: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects a draft without a graph', () => {
    const result = assembleBundle({ case: { fault: {} }, signals: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects a draft whose signals are not an array', () => {
    const result = assembleBundle({ case: { fault: {} }, graph: {}, signals: 'x' });
    expect(result.ok).toBe(false);
  });

  it('rejects a draft with a missing fault type', () => {
    const result = assembleBundle(validDraft({ case: { ...validDraft().case, fault: {} } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/type/i);
  });

  it('rejects a schema-invalid bundle (empty caseId)', () => {
    const result = assembleBundle(validDraft({ case: { ...validDraft().case, caseId: '' } }));
    expect(result.ok).toBe(false);
  });
});
