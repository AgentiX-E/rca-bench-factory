import { describe, expect, it } from 'vitest';
import {
  CLOUD_OPSBENCH_CONTRACT_VERSION,
  CLOUD_OPSBENCH_TARGET_ID,
  buildCloudOpsBenchMetadata,
  exportCloudOpsBench,
} from '../src/export/cloudopsbench.js';
import type { FaultCase, IrBundle } from '../src/ir/types.js';
import { validBundle } from './fixtures.js';

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
    const meta = buildCloudOpsBenchMetadata(fc);
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
    expect(buildCloudOpsBenchMetadata(fc).query).toBe(fc.groundTruth.rootCauseReason);
  });

  it.each([
    ['L1', 'easy'],
    ['L2', 'medium'],
    ['L3', 'hard'],
    ['L4', 'hard'],
    [undefined, 'medium'],
  ] as const)('maps difficulty %s to %s', (level, expected) => {
    const bundle = caseWith({ difficulty: level });
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!).difficulty).toBe(expected);
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
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!).result).toMatchObject({ fault_taxonomy: taxonomy });
  });

  it('normalises the fault type to a snake_case root cause', () => {
    const bundle = caseWith({ fault: { type: 'Pod CPU Overload', category: 'resource' } });
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!).result).toMatchObject({ root_cause: 'pod_cpu_overload' });
  });

  it('uses the root-cause component as the fault object', () => {
    const bundle = caseWith({ groundTruth: { ...validBundle().cases[0]!.groundTruth, rootCauseComponent: 'cart' } });
    expect(buildCloudOpsBenchMetadata(bundle.cases[0]!).result).toMatchObject({ fault_object: 'cart' });
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
