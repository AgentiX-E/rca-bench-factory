import { describe, expect, it } from 'vitest';
import {
  buildItBenchScenarioSpec,
  exportItBench,
  ITBENCH_CONTRACT_VERSION,
  ITBENCH_SRE_DOMAIN,
  ITBENCH_TARGET_ID,
} from '../src/export/itbench.js';
import { buildCloudOpsBenchMetadata } from '../src/export/cloudopsbench.js';
import { buildEntityIndex } from '../src/export/rca100.js';
import type { FaultCase } from '../src/ir/types.js';
import { threeStepBundle, twoKindBundle, validBundle, validCase } from './fixtures.js';

/**
 * ITBench exporter tests.
 *
 * Every fixture is a real, hand-written IR object (no mocks). The suite asserts
 * the SRE Diagnosis reasoning contract: scenario metadata plus the three ground
 * truth facets (chain entities, fault-propagation chain, fault conditions) that
 * map one-to-one onto the IR GroundTruth.
 */

function spec(fc: FaultCase = validCase()): Record<string, unknown> {
  return buildItBenchScenarioSpec(fc, buildEntityIndex(validBundle().graph), validBundle().graph);
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

  it('carries the parameters a configuration condition names', () => {
    // Beside `diagnosis` rather than inside it: the parameters are the injection's declaration, and
    // the diagnosis block is the three facets the SRE evaluator reads (finding 337).
    const s = spec(validCase({ fault: { ...validCase().fault, parameters: { cpuLimit: 500 } } }));
    expect((s.scenario_groundtruth as Record<string, unknown>).parameters).toEqual({ cpuLimit: 500 });
  });

  it('carries an empty parameter block for a case that declares none', () => {
    const s = spec(validCase({ fault: { ...validCase().fault, parameters: undefined } }));
    expect((s.scenario_groundtruth as Record<string, unknown>).parameters).toEqual({});
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

  it('exports a case that states no checkpoints at all', () => {
    const base = validCase();
    const { files, skipped } = exportItBench(
      validBundle({ cases: [validCase({ groundTruth: { ...base.groundTruth, evidenceCheckpoints: undefined } })] }),
    );
    expect(skipped).toEqual([]);
    expect(JSON.parse(files['scenarios/case-001/scenario.json']!).scenario_name).toBe('case-001');
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

/**
 * The reference this target publishes, and the case it refuses to publish.
 *
 * `signal_ref` is `order|cpu_usage` while `entity` is `service:default/order`: a name and an id, which
 * is two different questions and the reason both fields exist here. The name half is derived from
 * `entityRef` at export time -- this exporter took no entity index at all until it had to -- and a
 * checkpoint whose two halves cannot be combined skips its case rather than publishing one of them.
 */
describe('the reference a checkpoint publishes', () => {
  it('combines the entity name with the reading, from two fields of the IR', () => {
    const condition = (diagnosis(spec()).fault_conditions as Array<Record<string, unknown>>)[0]!;
    // The fixture writes the bare metric, so this string is a rendering rather than a copy.
    expect(validCase().groundTruth.evidenceCheckpoints?.[0]?.signalRef).toBe('cpu_usage');
    expect(condition.signal_ref).toBe('order|cpu_usage');
    expect(condition.entity).toBe('service:default/order');
  });

  it('skips a case whose checkpoint writes its own owner into the ref', () => {
    const bundle = validBundle();
    bundle.cases[0]!.groundTruth.evidenceCheckpoints![0]!.signalRef = 'order|cpu_usage';
    const out = exportItBench(bundle);
    expect(out.files).toEqual({});
    expect(out.skipped[0]?.reason).toBe(
      "case-001: checkpoint 'cp-1' writes 'order|cpu_usage' in a field that holds the reading alone, " +
        'so the owner it carries would be written twice',
    );
  });
});

/**
 * The floor next to `scenario_complexity`.
 *
 * `scenario_complexity` is the word the case's author claims, and `cloud-opsbench` publishes the same
 * word under `difficulty`. Both artifacts used to carry the claim alone, so a consumer read a
 * judgement as a measurement -- six of the corpus's thirty-four cases claim above the floor their
 * own chain supports (finding 553). The pair is projected once in `export/difficulty.ts`, so this
 * suite asserts the *second* field rather than re-arguing the projection.
 */
describe('the floor beside the complexity claim', () => {
  function specOf(bundle: ReturnType<typeof validBundle>): Record<string, unknown> {
    return buildItBenchScenarioSpec(bundle.cases[0]!, buildEntityIndex(bundle.graph), bundle.graph);
  }

  it('publishes both words, and the fixture case is above its floor', () => {
    const s = spec();
    expect(s.scenario_complexity).toBe('medium');
    expect(s.scenario_complexity_floor).toBe('easy');
  });

  it('takes the floor from the chain rather than from the claim', () => {
    const bundle = threeStepBundle();
    const s = buildItBenchScenarioSpec(
      { ...bundle.cases[0]!, difficulty: 'L2' },
      buildEntityIndex(bundle.graph),
      bundle.graph,
    );
    expect(s.scenario_complexity).toBe('medium');
    expect(s.scenario_complexity_floor).toBe('hard');
  });

  it('reads the floor through the graph, and through the kinds in it', () => {
    // The floor's breadth half is a count of *kinds*, so the probe that isolates it holds the same
    // entity ids and the same edges and changes one `kind`: the pod becomes a second service, the
    // chain touches one kind instead of two, and the floor falls from `L2` to `L1`. An empty graph
    // would move the same number for a different reason -- and this exporter refuses one before the
    // floor is reached, because a checkpoint that names an entity the topology does not hold is a
    // reference that resolves to nothing.
    const bundle = twoKindBundle();
    const relabelled = {
      ...bundle.graph,
      entities: bundle.graph.entities.map((entity) =>
        entity.entityId.startsWith('pod:') ? { ...entity, kind: 'service' as const } : entity,
      ),
    };
    expect(specOf(bundle).scenario_complexity_floor).toBe('medium');
    expect(specOf({ ...bundle, graph: relabelled }).scenario_complexity_floor).toBe('easy');
  });

  it('exports the pair into scenario.json', () => {
    const { files } = exportItBench(validBundle());
    const s = JSON.parse(files['scenarios/case-001/scenario.json']!);
    expect(s.scenario_complexity).toBe('medium');
    expect(s.scenario_complexity_floor).toBe('easy');
  });

  it('projects the claim and the floor to one pair, through both exporters', () => {
    // The property that makes the two artifacts comparable: for one case, the pair `itbench` prints
    // and the pair `cloud-opsbench` prints are the same two words, because one function produced
    // them. Without this the two files could drift and each would still be self-consistent.
    const bundle = threeStepBundle();
    const s = specOf(bundle);
    const meta = buildCloudOpsBenchMetadata(bundle.cases[0]!, bundle.graph);
    expect([s.scenario_complexity, s.scenario_complexity_floor]).toEqual([meta.difficulty, meta.difficulty_floor]);
  });
});
