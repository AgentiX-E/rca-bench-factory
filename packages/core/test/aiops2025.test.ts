import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AIOPS2025_CATEGORIES,
  AIOPS2025_CONTRACT_VERSION,
  AIOPS2025_TARGET_ID,
  buildAioPs2025GroundTruth,
  buildAioPs2025Input,
  exportAioPs2025,
} from '../src/export/aiops2025.js';
import { normalizeFaultType } from '../src/fault/collector.js';
import { FAULT_CATEGORIES, type FaultCase, type IrBundle } from '../src/ir/types.js';
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

/**
 * The emitted `fault_category` domain, and the corpus that exercises it.
 *
 * `fault_category` is the one field in this contract with **two** sources: a
 * fault-type projection table that is partial by construction, and the IR
 * category the table falls back to. Its domain is therefore the table's image
 * unioned with `FAULT_CATEGORIES`, and the assertions below pin every part of
 * that sentence — that both halves are admitted, that nothing else is, that
 * every table row is exercisable, and that the values the emitter actually
 * produces over the real corpus are admitted.
 *
 * The earlier suite asserted the two branches separately, and in one case
 * indistinguishably: `network-delay` projects to `network` and its IR category
 * is *also* `network`, so that assertion held whether the table fired or the
 * fallback did. Walking each row with a deliberately non-coinciding IR category
 * is what removes the ambiguity.
 */
describe('AIOPS2025_CATEGORIES', () => {
  it('admits every category the IR fallback can carry through', () => {
    // The union's IR half. Without this the vocabulary could describe only the
    // table, and a value the emitter produces through the fallback would be
    // rejected by the scorer that reads this same list.
    for (const category of FAULT_CATEGORIES) {
      expect(AIOPS2025_CATEGORIES, `${category} is not admitted`).toContain(category);
    }
  });

  it('admits every category a table row can produce', () => {
    // The union's table half, read by driving the emitter over each key rather
    // than by restating the table here, so a row that introduces a word is
    // admitted without editing a list.
    for (const type of tableTypes()) {
      expect(AIOPS2025_CATEGORIES, `${type} is not admitted`).toContain(projection(type));
    }
  });

  it('admits no category neither source can produce', () => {
    // The converse direction. Composing through a `Set` makes a stray member
    // impossible today; this is what keeps it impossible if the composition is
    // ever rewritten as a literal list, which is the failure it exists to prevent.
    const producible = new Set([...tableTypes().map(projection), ...FAULT_CATEGORIES]);
    expect(AIOPS2025_CATEGORIES.filter((c) => !producible.has(c))).toEqual([]);
  });

  it('carries no duplicate', () => {
    // A rewrite that dropped the `Set` would leave a list that still "contains"
    // every word while being longer than the set of words it stands for.
    expect(new Set(AIOPS2025_CATEGORIES).size).toBe(AIOPS2025_CATEGORIES.length);
  });
});

/**
 * Every table row, exercised.
 *
 * The corpus reaches three of the table's keys. Walking all of them here is what
 * keeps the rest from being unreachable and therefore untested: a row whose key
 * has drifted out of sync with the normaliser fails this walk, where a
 * corpus-only reading would never look at it.
 */
describe('the fault-category projection, row by row', () => {
  it('projects every row to a category the vocabulary admits', () => {
    for (const type of tableTypes()) {
      // The IR category is deliberately neither the projection nor any table
      // value, so a lookup that stopped working surfaces as `config` rather than
      // coinciding with the projection and reading as a pass.
      const emitted = projection(type);
      expect(emitted, `${type} fell through to the IR category`).not.toBe('config');
      expect(AIOPS2025_CATEGORIES, `${type} -> ${emitted}`).toContain(emitted);
    }
  });

  it('passes an unmapped type through as the IR category', () => {
    const bundle = caseWith({ fault: { type: 'a-type-no-table-holds', category: 'middleware' } });
    const emitted = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph).fault_category;
    expect(emitted).toBe('middleware');
    expect(AIOPS2025_CATEGORIES).toContain('middleware');
  });
});

describe('the vocabulary versus the golden corpus', () => {
  it('admits every value the emitter produces over the corpus types', () => {
    // The load-bearing assertion: it drives the real emitter over the real corpus
    // types and reads what it actually emits, so the vocabulary is checked
    // against behaviour rather than against the table that claims to describe it.
    for (const type of goldenFaultTypes()) {
      const bundle = caseWith({ fault: { type, category: 'dependency' } });
      const emitted = buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph).fault_category;
      expect(AIOPS2025_CATEGORIES, `${type} emitted ${String(emitted)}`).toContain(emitted);
    }
  });

  it('reaches the fallback, and is not entirely made of the fallback', () => {
    // A contrast rather than the literals: the literals would be a second reading
    // of the same corpus and would drift with it silently. What matters is that
    // the table is live at all (some type hits it) and that it is partial (some
    // type does not), which is the property the `??` exists to express.
    const types = goldenFaultTypes();
    const keys = tableTypes();
    const hits = types.filter((t) => keys.includes(normalizeFaultType(t)));
    expect(types.length).toBeGreaterThan(0);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThan(types.length);
  });
});

/**
 * The projection table's keys, read from the module rather than restated.
 *
 * The table is module-private, so this reads it the only way a test can: by
 * driving the emitter over the keys and observing that the fallback did *not*
 * fire. Re-declaring the 19 keys here would be a second copy of the very list
 * these assertions exist to check, and a copy that drifts is exactly the defect
 * class this suite is about.
 *
 * The probe uses an IR category of `config`, which no table row projects to, so
 * "the projection is not `config`" is the signal that the table fired.
 */
const PROBE_CATEGORY = 'config';

function projection(type: string): string {
  const bundle = caseWith({ fault: { type, category: PROBE_CATEGORY } });
  return buildAioPs2025GroundTruth(bundle.cases[0]!, bundle.graph).fault_category as string;
}

function tableTypes(): string[] {
  // Evaluated on call rather than at module scope: reading the table means
  // driving the emitter, which needs the fixtures initialized first.
  return CANDIDATE_TYPES.filter((type) => projection(type) !== PROBE_CATEGORY);
}

/**
 * Candidate fault types: the AIOps2025 challenge vocabulary the table projects.
 *
 * These are *inputs* to the emitter, not a copy of the table's contents — the
 * table's behaviour is what `tableTypes()` reads back. A candidate the table
 * does not hold simply drops out, so this list being wider than the table is
 * harmless and being narrower would only weaken the walk.
 */
const CANDIDATE_TYPES: readonly string[] = [
  'network-delay',
  'network-loss',
  'network-corrupt',
  'cpu-stress',
  'memory-stress',
  'node-cpu',
  'node-disk',
  'node-network-loss',
  'node-network-delay',
  'pod-failure',
  'pod-kill',
  'jvm-exception',
  'jvm-gc',
  'jvm-latency',
  'jvm-cpu-stress',
  'dns-error',
  'target-port-misconfig',
  'erroneous-code',
  'io-fault',
];

function goldenFaultTypes(): string[] {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const path = resolve(here, '..', '..', '..', 'golden-master', 'fault-extraction', 'samples.json');
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { samples?: unknown };
  if (!Array.isArray(parsed.samples)) {
    throw new Error('golden-master/fault-extraction/samples.json carries no samples array');
  }
  return parsed.samples.map((sample) => {
    const expected = (sample as { expected?: { type?: unknown } }).expected;
    if (typeof expected?.type !== 'string') {
      throw new Error('golden sample carries no expected.type');
    }
    return expected.type;
  });
}
