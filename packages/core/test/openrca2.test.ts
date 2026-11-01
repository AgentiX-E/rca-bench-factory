import { describe, expect, it } from 'vitest';
import {
  OPENRCA2_CONTRACT_VERSION,
  OPENRCA2_TARGET_ID,
  buildCausalPathJson,
  exportOpenRca2,
} from '../src/export/openrca2.js';
import { buildEntityIndex } from '../src/export/rca100.js';
import { SignalRefRefusedError } from '../src/export/signal-ref.js';
import type { FaultCase, IrBundle } from '../src/ir/types.js';
import { validBundle } from './fixtures.js';

/**
 * OpenRCA 2.0 (PAVE) exporter tests.
 *
 * The causal-path contract carries the root cause and the ordered causal path,
 * with each step's three-gate verification verdict (structural / statistical /
 * temporal) and its evidence checkpoints. The suite asserts the verdicts against
 * real IR objects - no mocks.
 */

function caseWith(overrides: Partial<FaultCase>): IrBundle {
  const base = validBundle();
  return { ...base, cases: [{ ...base.cases[0]!, ...overrides }] };
}

function parse(json: string): Record<string, unknown> {
  return JSON.parse(json) as Record<string, unknown>;
}

describe('buildCausalPathJson', () => {
  it('emits the root cause and the verified causal path', () => {
    const bundle = validBundle();
    const index = buildEntityIndex(bundle.graph);
    const out = parse(buildCausalPathJson(bundle.cases[0]!, index));

    expect(out.root_cause).toEqual({
      entity_id: 'service:default/order',
      component: 'order',
      fault_type: 'cpu',
    });
    const steps = out.causal_path as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.verification).toEqual({ structural: true, statistical: true, temporal: true });
    expect((steps[0]!.evidence as unknown[]).length).toBe(1);
  });

  it('emits an empty causal path when no chain is present', () => {
    const bundle = caseWith({ groundTruth: { ...validBundle().cases[0]!.groundTruth, causalChain: undefined } });
    const index = buildEntityIndex(bundle.graph);
    const out = parse(buildCausalPathJson(bundle.cases[0]!, index));
    expect(out.causal_path).toEqual([]);
  });

  it('marks structural false when a step endpoint does not resolve', () => {
    const bundle = caseWith({
      groundTruth: {
        ...validBundle().cases[0]!.groundTruth,
        causalChain: [
          {
            step: 1,
            fromEntityId: 'service:default/ghost',
            toEntityId: 'service:default/cart',
            mechanism: 'x',
            evidenceRefs: ['cp-1'],
          },
        ],
      },
    });
    const index = buildEntityIndex(bundle.graph);
    const out = parse(buildCausalPathJson(bundle.cases[0]!, index));
    const step = (out.causal_path as Array<Record<string, unknown>>)[0]!;
    expect((step.verification as Record<string, boolean>).structural).toBe(false);
  });

  it('marks statistical false when a step has no valid evidence', () => {
    const bundle = caseWith({
      groundTruth: {
        ...validBundle().cases[0]!.groundTruth,
        causalChain: [
          {
            step: 1,
            fromEntityId: 'service:default/order',
            toEntityId: 'service:default/cart',
            mechanism: 'x',
            evidenceRefs: ['missing-checkpoint'],
          },
        ],
      },
    });
    const index = buildEntityIndex(bundle.graph);
    const out = parse(buildCausalPathJson(bundle.cases[0]!, index));
    const step = (out.causal_path as Array<Record<string, unknown>>)[0]!;
    expect((step.verification as Record<string, boolean>).statistical).toBe(false);
  });

  it('marks temporal false on a non-increasing step order', () => {
    const gt = validBundle().cases[0]!.groundTruth;
    const bundle = caseWith({
      groundTruth: {
        ...gt,
        causalChain: [
          {
            step: 1,
            fromEntityId: 'service:default/order',
            toEntityId: 'service:default/cart',
            mechanism: 'x',
            evidenceRefs: ['cp-1'],
          },
          {
            step: 1,
            fromEntityId: 'service:default/cart',
            toEntityId: 'service:default/order',
            mechanism: 'y',
            evidenceRefs: ['cp-1'],
          },
        ],
      },
    });
    const index = buildEntityIndex(bundle.graph);
    const out = parse(buildCausalPathJson(bundle.cases[0]!, index));
    const steps = out.causal_path as Array<Record<string, unknown>>;
    expect((steps[1]!.verification as Record<string, boolean>).temporal).toBe(false);
  });

  it('emits a null entity name for an unresolved endpoint', () => {
    const bundle = caseWith({
      groundTruth: {
        ...validBundle().cases[0]!.groundTruth,
        causalChain: [
          {
            step: 1,
            fromEntityId: 'service:default/ghost',
            toEntityId: 'service:default/cart',
            mechanism: 'x',
            evidenceRefs: [],
          },
        ],
      },
    });
    const index = buildEntityIndex(bundle.graph);
    const out = parse(buildCausalPathJson(bundle.cases[0]!, index));
    const step = (out.causal_path as Array<Record<string, unknown>>)[0]!;
    expect((step.from_entity as Record<string, unknown>).name).toBeNull();
  });

  it('emits a null name for an unresolved to_entity', () => {
    const bundle = caseWith({
      groundTruth: {
        ...validBundle().cases[0]!.groundTruth,
        causalChain: [
          {
            step: 1,
            fromEntityId: 'service:default/order',
            toEntityId: 'service:default/ghost',
            mechanism: 'x',
            evidenceRefs: [],
          },
        ],
      },
    });
    const index = buildEntityIndex(bundle.graph);
    const out = parse(buildCausalPathJson(bundle.cases[0]!, index));
    const step = (out.causal_path as Array<Record<string, unknown>>)[0]!;
    expect((step.to_entity as Record<string, unknown>).name).toBeNull();
  });

  it('marks statistical false when no evidence checkpoints are present', () => {
    const gt = validBundle().cases[0]!.groundTruth;
    const bundle = caseWith({ groundTruth: { ...gt, evidenceCheckpoints: undefined } });
    const index = buildEntityIndex(bundle.graph);
    const out = parse(buildCausalPathJson(bundle.cases[0]!, index));
    const step = (out.causal_path as Array<Record<string, unknown>>)[0]!;
    expect((step.verification as Record<string, boolean>).statistical).toBe(false);
  });

  it('emits null signal_ref and unit when the checkpoint omits them', () => {
    const gt = validBundle().cases[0]!.groundTruth;
    const bundle = caseWith({
      groundTruth: {
        ...gt,
        evidenceCheckpoints: [
          { checkpointId: 'cp-1', entityRef: 'service:default/order', comparator: '>', value: 90, description: 'x' },
        ],
      },
    });
    const index = buildEntityIndex(bundle.graph);
    const out = parse(buildCausalPathJson(bundle.cases[0]!, index));
    const step = (out.causal_path as Array<Record<string, unknown>>)[0]!;
    const evidence = (step.evidence as Array<Record<string, unknown>>)[0]!;
    expect(evidence.signal_ref).toBeNull();
    expect(evidence.unit).toBeNull();
  });
});

describe('exportOpenRca2', () => {
  it('exports one causal_path.json per case', () => {
    const { files, skipped } = exportOpenRca2(validBundle());
    expect(skipped).toEqual([]);
    const out = parse(files['cases/case-001/causal_path.json']!);
    expect(out.case_id).toBe('case-001');
  });

  it('skips a case with no telemetry', () => {
    const bundle = validBundle({ signals: { 'case-001': [] } });
    const { files, skipped } = exportOpenRca2(bundle);
    expect(skipped).toEqual([{ caseId: 'case-001', reason: 'no telemetry signals attached' }]);
    expect(files).toEqual({});
  });

  it('skips a case absent from the signals map', () => {
    const bundle = validBundle({ signals: {} });
    const { skipped } = exportOpenRca2(bundle);
    expect(skipped).toEqual([{ caseId: 'case-001', reason: 'no telemetry signals attached' }]);
  });

  it('skips a case whose root-cause entity does not resolve', () => {
    const bundle = caseWith({
      groundTruth: { ...validBundle().cases[0]!.groundTruth, rootCauseEntityId: 'service:default/ghost' },
    });
    const { skipped } = exportOpenRca2(bundle);
    expect(skipped[0]?.reason).toContain('root-cause entity');
  });

  it('declares the contract identity', () => {
    expect(OPENRCA2_TARGET_ID).toBe('openrca-2.0');
    expect(OPENRCA2_CONTRACT_VERSION).toBe('pave-v1');
  });
});

/**
 * The evidence a case cannot publish, and the two places it is refused.
 *
 * `signal_ref` reaches this contract as `<entity name>|<reading>`, so a checkpoint has to be
 * qualifiable before any file of its case is written. The exporter skips such a case -- a bundle of
 * 1000 must not lose 999 to one mistyped label -- and the builder raises for a caller that went
 * straight to it, because the only shape a builder has for "no reference" already means something
 * else: a `derived` checkpoint, which is referenced by its arithmetic and names no single reading.
 */
describe('a case whose evidence cannot be qualified', () => {
  const unqualified = (): IrBundle => {
    const bundle = validBundle();
    bundle.cases[0]!.groundTruth.evidenceCheckpoints![0]!.signalRef = 'order|cpu_usage';
    return bundle;
  };

  it('is skipped with the sentence that says which field holds the owner', () => {
    const out = exportOpenRca2(unqualified());
    expect(out.files).toEqual({});
    expect(out.skipped).toEqual([
      {
        caseId: 'case-001',
        reason:
          "case-001: checkpoint 'cp-1' writes 'order|cpu_usage' in a field that holds the reading " +
          'alone, so the owner it carries would be written twice',
      },
    ]);
  });

  it('is refused by the builder too, for a caller that never screened the case', () => {
    const bundle = unqualified();
    expect(() => buildCausalPathJson(bundle.cases[0]!, buildEntityIndex(bundle.graph))).toThrow(
      SignalRefRefusedError,
    );
  });

  it('publishes null for a checkpoint that names no single reading, rather than omitting it', () => {
    // The field is required and nullable in this contract, so a derived checkpoint's absence of a
    // reference is published as the absence it is: `signal_ref: null`, not a missing key.
    const bundle = validBundle();
    const checkpoint = bundle.cases[0]!.groundTruth.evidenceCheckpoints![0]!;
    delete checkpoint.signalRef;
    const step = (parse(buildCausalPathJson(bundle.cases[0]!, buildEntityIndex(bundle.graph))).causal_path as Array<
      Record<string, unknown>
    >)[0]!;
    expect((step.evidence as Array<Record<string, unknown>>)[0]!.signal_ref).toBeNull();
  });
});
