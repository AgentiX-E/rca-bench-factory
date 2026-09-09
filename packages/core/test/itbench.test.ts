import { describe, expect, it } from 'vitest';
import {
  buildItBenchScenarioSpec,
  exportItBench,
  ITBENCH_CONTRACT_VERSION,
  ITBENCH_SRE_DOMAIN,
  ITBENCH_TARGET_ID,
} from '../src/export/itbench.js';
import type { FaultCase } from '../src/ir/types.js';
import { validBundle, validCase } from './fixtures.js';

/**
 * ITBench exporter tests.
 *
 * Every fixture is a real, hand-written IR object (no mocks). The suite asserts
 * the SRE Diagnosis reasoning contract: scenario metadata plus the three ground
 * truth facets (chain entities, fault-propagation chain, fault conditions) that
 * map one-to-one onto the IR GroundTruth.
 */

function spec(fc: FaultCase = validCase()): Record<string, unknown> {
  return buildItBenchScenarioSpec(fc);
}

function diagnosis(s: Record<string, unknown>): Record<string, unknown> {
  const gt = s.scenario_groundtruth as Record<string, unknown>;
  return gt.diagnosis as Record<string, unknown>;
}

describe('constants', () => {
  it('exposes the target id, contract version and SRE domain', () => {
    expect(ITBENCH_TARGET_ID).toBe('itbench');
    expect(ITBENCH_CONTRACT_VERSION).toBe('v1');
    expect(ITBENCH_SRE_DOMAIN).toBe('SRE');
  });
});

describe('buildItBenchScenarioSpec', () => {
  it('sets the scenario metadata fields', () => {
    const s = spec();
    expect(s.scenario_name).toBe('case-001');
    expect(s.scenario_description).toBe('The order service became slow at 08:10 UTC+8. Find the root cause.');
    expect(s.scenario_domain).toBe('SRE');
    expect(s.scenario_class).toBe('HighCPU');
    expect(s.scenario_complexity).toBe('medium');
  });

  it('falls back to the root-cause reason when no query is present', () => {
    const s = spec(validCase({ query: undefined }));
    expect(s.scenario_description).toBe('CPU saturation on the order service');
  });

  it('maps each fault category to an SRE scenario class', () => {
    const cases: Array<[FaultCase['fault']['category'], string]> = [
      ['resource', 'HighCPU'],
      ['network', 'NetworkPartition'],
      ['runtime', 'CrashLoopBackOff'],
      ['middleware', 'ServiceDegradation'],
      ['code', 'CorruptImage'],
      ['config', 'Misconfiguration'],
      ['dependency', 'DependencyFailure'],
      ['unknown', 'Unknown'],
    ];
    for (const [category, expected] of cases) {
      expect(spec(validCase({ fault: { ...validCase().fault, category } })).scenario_class).toBe(expected);
    }
  });

  it.each([
    ['L1', 'easy'],
    ['L2', 'medium'],
    ['L3', 'hard'],
    ['L4', 'hard'],
    [undefined, 'medium'],
  ] as const)('maps difficulty %s to complexity %s', (level, expected) => {
    expect(spec(validCase({ difficulty: level as FaultCase['difficulty'] })).scenario_complexity).toBe(expected);
  });

  it('collects the unique chain entities with the root cause first', () => {
    const s = spec();
    expect(diagnosis(s).entities).toEqual(['service:default/order', 'service:default/cart']);
  });

  it('drops empty entity ids from the chain entities', () => {
    const s = spec(
      validCase({
        groundTruth: {
          ...validCase().groundTruth,
          causalChain: [
            { step: 1, fromEntityId: '', toEntityId: 'service:default/cart', mechanism: 'x', evidenceRefs: [] },
          ],
        },
      }),
    );
    expect(diagnosis(s).entities).toEqual(['service:default/order', 'service:default/cart']);
  });

  it('serializes the causal chain into propagation steps', () => {
    const chain = diagnosis(spec()).fault_propagation_chain as Array<Record<string, unknown>>;
    expect(chain).toHaveLength(1);
    expect(chain[0]).toEqual({
      step: 1,
      from_entity: 'service:default/order',
      to_entity: 'service:default/cart',
      mechanism: 'thread pool exhaustion propagated to the downstream cart service',
    });
  });

  it('serializes evidence checkpoints into fault conditions', () => {
    const conditions = diagnosis(spec()).fault_conditions as Array<Record<string, unknown>>;
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toEqual({
      checkpoint_id: 'cp-1',
      entity: 'service:default/order',
      signal_ref: 'order|cpu_usage',
      comparator: '>',
      value: 90,
      unit: '%',
      description: 'CPU usage exceeds 90 percent',
    });
  });

  it('omits optional checkpoint fields when absent', () => {
    const s = spec(
      validCase({
        groundTruth: {
          ...validCase().groundTruth,
          evidenceCheckpoints: [
            {
              checkpointId: 'cp-2',
              entityRef: 'service:default/order',
              comparator: 'contains',
              value: 'exhausted',
              description: 'log mentions exhaustion',
            },
          ],
        },
      }),
    );
    const condition = (diagnosis(s).fault_conditions as Array<Record<string, unknown>>)[0]!;
    expect(condition.signal_ref).toBeUndefined();
    expect(condition.unit).toBeUndefined();
  });

  it('handles a ground truth with no causal chain or checkpoints', () => {
    const s = spec(
      validCase({
        groundTruth: {
          rootCauseEntityId: 'service:default/order',
          rootCauseComponent: 'order',
          rootCauseReason: 'CPU saturation',
        },
      }),
    );
    const d = diagnosis(s);
    expect(d.entities).toEqual(['service:default/order']);
    expect(d.fault_propagation_chain).toEqual([]);
    expect(d.fault_conditions).toEqual([]);
  });
});

describe('exportItBench', () => {
  it('exports one scenario.json per case', () => {
    const { files, skipped } = exportItBench(validBundle());
    expect(skipped).toEqual([]);
    const parsed = JSON.parse(files['scenarios/case-001/scenario.json']!);
    expect(parsed.scenario_name).toBe('case-001');
    expect(parsed.scenario_domain).toBe('SRE');
  });

  it('skips a case with no root-cause component', () => {
    const bundle = validBundle({
      cases: [
        validCase({
          groundTruth: { ...validCase().groundTruth, rootCauseComponent: '' },
        }),
      ],
    });
    const { files, skipped } = exportItBench(bundle);
    expect(skipped).toEqual([{ caseId: 'case-001', reason: 'missing root-cause component' }]);
    expect(files).toEqual({});
  });
});
