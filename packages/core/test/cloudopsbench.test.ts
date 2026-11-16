import { describe, expect, it } from 'vitest';
import {
  CLOUD_OPSBENCH_CONTRACT_VERSION,
  CLOUD_OPSBENCH_TARGET_ID,
  buildCloudOpsBenchMetadata,
  exportCloudOpsBench,
} from '../src/export/cloudopsbench.js';
import { DIFFICULTIES } from '../src/export/difficulty.js';
import type { FaultCase, IrBundle } from '../src/ir/types.js';
import { threeStepBundle, twoKindBundle, validBundle } from './fixtures.js';

/**
 * Cloud-OpsBench exporter tests.
 *
 * The `metadata.json` contract is the outcome ground truth ⟨Stage, Component,
 * Root Cause⟩. The suite asserts the fault-taxonomy projection, the difficulty
 * vocabulary, the snake_case root-cause token and the zero-silent-loss skip
 * behaviour against real IR objects.
 */

function caseWith(overrides: Partial<FaultCase>): IrBundle {
  const base = validBundle();
  return { ...base, cases: [{ ...base.cases[0]!, ...overrides }] };
}

describe('buildCloudOpsBenchMetadata', () => {
  it('emits namespace, query, difficulty and the result triple', () => {
    const fc = validBundle().cases[0]!;
    const meta = buildCloudOpsBenchMetadata(fc, validBundle().graph);
    expect(meta.namespace).toBe('order-prod');
    expect(meta.query).toBe(fc.query);
    expect(meta.difficulty).toBe('medium');
    expect(meta.result).toEqual({
      fault_taxonomy: 'Performance_Fault',
      fault_object: 'order',
      root_cause: 'cpu',
    });
  });

  it('falls back to the root-cause reason when no query is present', () => {
    const fc = { ...validBundle().cases[0]!, query: undefined };
    expect(buildCloudOpsBenchMetadata(fc, validBundle().graph).query).toBe(fc.groundTruth.rootCauseReason);
  });

  it.each([
    ['L1', 'easy'],
    ['L2', 'medium'],
    ['L3', 'hard'],
    ['L4', 'hard'],
    [undefined, 'medium'],
  ] as const)('maps difficulty %s to %s', (level, expected) => {
    const bundle = caseWith({ difficulty: level });
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!, bundle.graph).difficulty).toBe(expected);
  });

  it.each([
    ['resource', 'Performance_Fault'],
    ['network', 'Infrastructure_Fault'],
    ['runtime', 'Runtime_Fault'],
    ['middleware', 'Service_Fault'],
    ['code', 'Code_Fault'],
    ['config', 'Startup_Fault'],
    ['dependency', 'Service_Fault'],
    ['unknown', 'Runtime_Fault'],
  ] as const)('maps category %s to taxonomy %s', (category, taxonomy) => {
    const bundle = caseWith({ fault: { type: 'cpu', category } });
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!, bundle.graph).result).toMatchObject({ fault_taxonomy: taxonomy });
  });

  it('normalises the fault type to a snake_case root cause', () => {
    const bundle = caseWith({ fault: { type: 'Pod CPU Overload', category: 'resource' } });
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!, bundle.graph).result).toMatchObject({ root_cause: 'pod_cpu_overload' });
  });

  it('uses the root-cause component as the fault object', () => {
    const bundle = caseWith({ groundTruth: { ...validBundle().cases[0]!.groundTruth, rootCauseComponent: 'cart' } });
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!, bundle.graph).result).toMatchObject({ fault_object: 'cart' });
  });
});

describe('exportCloudOpsBench', () => {
  it('exports one metadata.json per case', () => {
    const { files, skipped } = exportCloudOpsBench(validBundle());
    expect(skipped).toEqual([]);
    const meta = JSON.parse(files['cases/case-001/metadata.json']!);
    expect(meta.namespace).toBe('order-prod');
    expect(meta.result.fault_object).toBe('order');
  });

  it('skips a case with an empty root-cause component', () => {
    const bundle = caseWith({ groundTruth: { ...validBundle().cases[0]!.groundTruth, rootCauseComponent: '' } });
    const { files, skipped } = exportCloudOpsBench(bundle);
    expect(skipped).toEqual([{ caseId: 'case-001', reason: 'missing root-cause component' }]);
    expect(files).toEqual({});
  });

  it('declares the contract identity', () => {
    expect(CLOUD_OPSBENCH_TARGET_ID).toBe('cloud-opsbench');
    expect(CLOUD_OPSBENCH_CONTRACT_VERSION).toBe('v1');
  });
});

/**
 * The floor next to the claim.
 *
 * `difficulty` is a judgement and `docs/data-model.md` says so: a level above the structural floor
 * is permitted because a case can be hard to *detect* while being easy to trace, and the case has to
 * say what the floor cannot see. What the artifact never carried was the floor, so a consumer read
 * one word and had no way to tell a measurement from an opinion -- six of the corpus's thirty-four
 * cases claim above their floor and one of them claims `L4` over a single step (finding 553).
 */
describe('the floor beside the claim', () => {
  it('publishes both words, and the fixture case is above its floor', () => {
    const bundle = validBundle();
    // `validCase` states no level, so `difficulty` is the documented unset -> medium row, and its
    // chain is one step between two services, which supports `L1`. The two words differ, which is
    // exactly the case the second field exists for.
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!, bundle.graph)).toMatchObject({
      difficulty: 'medium',
      difficulty_floor: 'easy',
    });
  });

  it('takes the floor from the chain rather than from the claim', () => {
    const bundle = threeStepBundle();
    // A claim of `L2` over three steps: the claim keeps its own word and the floor keeps its own.
    expect(buildCloudOpsBenchMetadata({ ...bundle.cases[0]!, difficulty: 'L2' }, bundle.graph)).toMatchObject({
      difficulty: 'medium',
      difficulty_floor: 'hard',
    });
  });

  it('keeps the claim when the claim is above the floor', () => {
    const bundle = twoKindBundle();
    // One step over two kinds supports `L2`, and the annotation says `L4`. Publishing the floor must
    // not quietly replace the claim: a consumer that ranks by difficulty still reads the judgement.
    expect(buildCloudOpsBenchMetadata({ ...bundle.cases[0]!, difficulty: 'L4' }, bundle.graph)).toMatchObject({
      difficulty: 'hard',
      difficulty_floor: 'medium',
    });
  });

  it('reads the floor through the graph, and through the kinds in it', () => {
    // Both readings are failures of the same shape: a floor that is not read from the graph at all.
    // With no graph the breadth is zero, so the case falls to `L1`; with the pod relabelled the
    // breadth is one, so it falls to `L1` for the reason the floor is about. The relabelled probe is
    // the sharper one -- same entity ids, same edges, one `kind` changed -- and it is why the field
    // cannot be satisfied by a constant.
    const bundle = twoKindBundle();
    const relabelled = {
      ...bundle.graph,
      entities: bundle.graph.entities.map((entity) =>
        entity.entityId.startsWith('pod:') ? { ...entity, kind: 'service' as const } : entity,
      ),
    };
    const empty = { entities: [], edges: [] };
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!, bundle.graph).difficulty_floor).toBe('medium');
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!, relabelled).difficulty_floor).toBe('easy');
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!, empty).difficulty_floor).toBe('easy');
  });

  it('exports the pair into metadata.json', () => {
    const { files } = exportCloudOpsBench(validBundle());
    const meta = JSON.parse(files['cases/case-001/metadata.json']!);
    expect(meta.difficulty).toBe('medium');
    expect(meta.difficulty_floor).toBe('easy');
  });

  it('emits both words from the shared vocabulary', () => {
    const bundle = validBundle();
    const meta = buildCloudOpsBenchMetadata(bundle.cases[0]!, bundle.graph);
    expect(DIFFICULTIES).toContain(meta.difficulty as string);
    expect(DIFFICULTIES).toContain(meta.difficulty_floor as string);
  });
});
