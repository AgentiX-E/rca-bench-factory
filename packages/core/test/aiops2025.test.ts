import { describe, expect, it } from 'vitest';
import {
  AIOPS2025_CONTRACT_VERSION,
  AIOPS2025_TARGET_ID,
  buildAioPs2025GroundTruth,
  buildAioPs2025Input,
  exportAioPs2025,
} from '../src/export/aiops2025.js';
import type { FaultCase, IrBundle } from '../src/ir/types.js';
import { validBundle } from './fixtures.js';

/**
 * AIOps2025 exporter tests.
 *
 * The field contract is the agent-facing `input.json` plus the per-modality
 * key-evidence `groundtruth.jsonl`. The suite asserts the fault-type→category
 * mapping, the instance-type projection and the log/metric/trace observation
 * grouping against real IR objects.
 */

function caseWith(overrides: Partial<FaultCase>): IrBundle {
  const base = validBundle();
  return { ...base, cases: [{ ...base.cases[0]!, ...overrides }] };
}

describe('buildAioPs2025Input', () => {
  it('emits uuid, query description and the window', () => {
    const fc = validBundle().cases[0]!;
    expect(buildAioPs2025Input(fc)).toEqual({
      uuid: 'case-001',
      description: fc.query,
      start_time: '2026-09-06T00:00:00.000Z',
      end_time: '2026-09-06T00:20:00.000Z',
    });
  });

  it('falls back to the root-cause reason when no query is present', () => {
    const fc = { ...validBundle().cases[0]!, query: undefined };
    expect(buildAioPs2025Input(fc).description).toBe(fc.groundTruth.rootCauseReason);
  });
});

describe('buildAioPs2025GroundTruth', () => {
  it('passes through fault_type and falls back to the IR category for unknown types', () => {
    const bundle = caseWith({ fault: { type: 'cpu', category: 'resource' } });
    const gt = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph);
    expect(gt.fault_type).toBe('cpu');
    expect(gt.fault_category).toBe('resource');
  });

  it('derives the broad category from a known fault type', () => {
    const bundle = caseWith({ fault: { type: 'network-delay', category: 'network' } });
    const gt = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph);
    expect(gt.fault_category).toBe('network');
  });

  it('projects a service entity onto instance_type service', () => {
    const bundle = validBundle();
    const gt = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph);
    expect(gt.instance_type).toBe('service');
    expect(gt.instance).toBe('order');
  });

  it('projects a pod entity onto instance_type pod', () => {
    const bundle = validBundle({
      graph: {
        entities: [{ entityId: 'pod:default/order-pod-1', kind: 'pod', name: 'order-pod-1', namespace: 'default', aliases: [] }],
        edges: [],
      },
    });
    bundle.cases[0]!.groundTruth.rootCauseEntityId = 'pod:default/order-pod-1';
    const gt = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph);
    expect(gt.instance_type).toBe('pod');
    expect(gt.instance).toBe('order-pod-1');
  });

  it('projects a node entity onto instance_type node', () => {
    const bundle = validBundle({
      graph: {
        entities: [{ entityId: 'node:default/node-a', kind: 'node', name: 'node-a', namespace: 'default', aliases: [] }],
        edges: [],
      },
    });
    bundle.cases[0]!.groundTruth.rootCauseEntityId = 'node:default/node-a';
    const gt = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph);
    expect(gt.instance_type).toBe('node');
  });

  it('emits source and destination only for network faults', () => {
    const bundle = caseWith({
      fault: { type: 'network-delay', category: 'network', parameters: { source: 'order', destination: 'cart' } },
    });
    const gt = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph);
    expect(gt.source).toBe('order');
    expect(gt.destination).toBe('cart');
  });

  it('omits source and destination when absent', () => {
    const bundle = caseWith({ fault: { type: 'cpu', category: 'resource', parameters: { intensity: 90 } } });
    const gt = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph);
    expect(gt.source).toBeUndefined();
    expect(gt.destination).toBeUndefined();
  });

  it('groups root-cause indicators into log/metric/trace observations', () => {
    const bundle = caseWith({
      groundTruth: {
        ...validBundle().cases[0]!.groundTruth,
        rootCauseIndicators: [
          { type: 'metric', ref: 'order|cpu_usage', description: 'cpu high' },
          { type: 'log', ref: 'order|log1', description: 'oom log' },
          { type: 'trace', ref: 'order|tr1', description: 'slow span' },
        ],
      },
    });
    const gt = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph);
    expect(gt.key_observations).toEqual({
      log: [{ ref: 'order|log1', description: 'oom log' }],
      metric: [{ ref: 'order|cpu_usage', description: 'cpu high' }],
      trace: [{ ref: 'order|tr1', description: 'slow span' }],
    });
    expect(gt.key_metrics).toEqual(['order|cpu_usage']);
  });

  it('falls back to the root-cause component for the instance', () => {
    const bundle = caseWith({ groundTruth: { ...validBundle().cases[0]!.groundTruth, rootCauseEntityId: 'service:default/ghost' } });
    const gt = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph);
    expect(gt.instance_type).toBe('service');
    expect(gt.instance).toBe('order');
  });

  it('emits empty observations when no root-cause indicators are present', () => {
    const gt = { ...validBundle().cases[0]!.groundTruth, rootCauseIndicators: undefined };
    const bundle = caseWith({ groundTruth: gt });
    const out = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph);
    expect(out.key_observations).toEqual({ log: [], metric: [], trace: [] });
    expect(out.key_metrics).toEqual([]);
  });
});

describe('exportAioPs2025', () => {
  it('exports input.json and groundtruth.jsonl', () => {
    const { files, skipped } = exportAioPs2025(validBundle());
    expect(skipped).toEqual([]);
    const input = JSON.parse(files['input.json']!);
    expect(input).toHaveLength(1);
    expect(input[0].uuid).toBe('case-001');
    const gtLines = files['groundtruth.jsonl']!.trim().split('\n');
    expect(gtLines).toHaveLength(1);
    expect(JSON.parse(gtLines[0]!).uuid).toBe('case-001');
  });

  it('skips a case with no telemetry', () => {
    const bundle = validBundle({ signals: { 'case-001': [] } });
    const { files, skipped } = exportAioPs2025(bundle);
    expect(skipped).toEqual([{ caseId: 'case-001', reason: 'no telemetry signals attached' }]);
    expect(JSON.parse(files['input.json']!)).toEqual([]);
  });

  it('skips a case absent from the signals map', () => {
    const bundle = validBundle({ signals: {} });
    const { skipped } = exportAioPs2025(bundle);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.reason).toBe('no telemetry signals attached');
  });

  it('declares the contract identity', () => {
    expect(AIOPS2025_TARGET_ID).toBe('aiops2025');
    expect(AIOPS2025_CONTRACT_VERSION).toBe('ccf2025');
  });
});
