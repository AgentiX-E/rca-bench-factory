import { describe, expect, it } from 'vitest';
import type { EntityGraph } from '../src/ir/types.js';
import {
  assessCaseReferences,
  describeDanglingReference,
  joinPublishedReference,
  referenceCarrier,
  type ExportedTables,
  type ReferenceJoin,
} from '../src/export/reference-carrier.js';

/**
 * The join is the other end of a reference: the answer key names a reading, and this asks whether the
 * file beside it carries that reading. Every branch below is a state the corpus can be in, and the
 * ones that matter most are the two that are *not* misses -- a row filed under the entity that
 * contains the checkpoint's entity, and a key in a table keyed by name.
 */

/** One service, one container inside it, one pod inside that, and an unrelated service. */
const GRAPH: EntityGraph = {
  entities: [
    { entityId: 'service:default/order', kind: 'service', name: 'order', aliases: [] },
    { entityId: 'container:default/order-app', kind: 'container', name: 'order-app', aliases: [] },
    { entityId: 'pod:default/order-0', kind: 'pod', name: 'order-0', aliases: [] },
    { entityId: 'service:default/cart', kind: 'service', name: 'cart', aliases: [] },
  ],
  edges: [
    // One chain, three resolutions: service -> pod -> container. Siblings are deliberately absent
    // from it -- two replicas of one service are the same component's children, not each other's
    // ancestors, which is the distinction `sameComponent` is built on.
    { from: 'service:default/order', to: 'pod:default/order-0', relation: 'contains' },
    { from: 'pod:default/order-0', to: 'container:default/order-app', relation: 'contains' },
  ],
};

function tables(overrides: Partial<ExportedTables> = {}): ExportedTables {
  return { metrics: [], logs: [], parameters: {}, ...overrides };
}

function join(
  checkpoint: { entityRef: string; signalRef?: string; signalKind?: string },
  overrides: Partial<ExportedTables> = {},
): ReferenceJoin {
  return joinPublishedReference({ checkpoint, graph: GRAPH, tables: tables(overrides) });
}

describe('which table a reference names', () => {
  it('sends a checkpoint with no kind to the metric table, because absent means series', () => {
    expect(referenceCarrier({ signalRef: 'cpu_usage' })).toBe('metrics');
  });

  it('reads the three kinds that name something', () => {
    expect(referenceCarrier({ signalRef: 'cpu_usage', signalKind: 'series' })).toBe('metrics');
    expect(referenceCarrier({ signalRef: 'typeerror-line', signalKind: 'log' })).toBe('logs');
    expect(referenceCarrier({ signalRef: 'cpuLimit', signalKind: 'configuration' })).toBe('parameters');
  });

  it('answers null for a checkpoint that names nothing, which is what derived is', () => {
    expect(referenceCarrier({ signalKind: 'derived' })).toBeNull();
  });
});

describe('a metric reference', () => {
  const metricRow = { entity_id: 'service:default/order', metric: 'cpu_usage', value: 91 };

  it('joins on the entity the checkpoint states', () => {
    expect(join({ entityRef: 'service:default/order', signalRef: 'cpu_usage' }, { metrics: [metricRow] })).toEqual({
      kind: 'joined',
      carrier: 'metrics',
      key: 'cpu_usage',
      match: 'entity',
    });
  });

  it('joins through the entity that contains it, and says so', () => {
    // The corpus files a container's figure under its service on purpose -- the ranking a solver sees
    // is per service -- so this is a resolution rather than a miss, and the weaker word is reported.
    expect(
      join({ entityRef: 'container:default/order-app', signalRef: 'cpu_usage' }, { metrics: [metricRow] }),
    ).toEqual({ kind: 'joined', carrier: 'metrics', key: 'cpu_usage', match: 'container' });
  });

  it('joins through a descendant too, because sameComponent is symmetric', () => {
    expect(
      join({ entityRef: 'pod:default/order-0', signalRef: 'cpu_usage' }, { metrics: [metricRow] }).kind,
    ).toBe('joined');
  });

  it('is dangling when no row carries the metric at all', () => {
    expect(join({ entityRef: 'service:default/order', signalRef: 'gc_pause_ms' }, { metrics: [metricRow] })).toEqual({
      kind: 'dangling',
      carrier: 'metrics',
      key: 'gc_pause_ms',
      reason: 'noRow',
    });
  });

  it('is dangling when the row is for a component the checkpoint cannot reach', () => {
    expect(
      join(
        { entityRef: 'service:default/cart', signalRef: 'cpu_usage' },
        { metrics: [{ entity_id: 'service:default/order', metric: 'cpu_usage' }] },
      ),
    ).toEqual({ kind: 'dangling', carrier: 'metrics', key: 'cpu_usage', reason: 'otherEntity' });
  });
});

describe('a log reference', () => {
  const line = { id: 'typeerror-line', entity_id: 'service:default/order', message: 'unhandled TypeError' };

  it('joins on the line id', () => {
    expect(join({ entityRef: 'service:default/order', signalRef: 'typeerror-line', signalKind: 'log' }, { logs: [line] })).toEqual(
      { kind: 'joined', carrier: 'logs', key: 'typeerror-line', match: 'entity' },
    );
  });

  it('joins through containment, which is how a container cites its service\'s line', () => {
    expect(
      join(
        { entityRef: 'container:default/order-app', signalRef: 'typeerror-line', signalKind: 'log' },
        { logs: [line] },
      ),
    ).toEqual({ kind: 'joined', carrier: 'logs', key: 'typeerror-line', match: 'container' });
  });

  it('is dangling when the export carries no line with that id', () => {
    // This is the state the corpus was in until the id was carried through `expandLog`: the
    // declaration named the line, and the artefact had no column to name it in.
    expect(join({ entityRef: 'service:default/order', signalRef: 'typeerror-line', signalKind: 'log' })).toEqual({
      kind: 'dangling',
      carrier: 'logs',
      key: 'typeerror-line',
      reason: 'noRow',
    });
  });

  it('is dangling when the id belongs to another component\'s line', () => {
    expect(
      join(
        { entityRef: 'service:default/cart', signalRef: 'typeerror-line', signalKind: 'log' },
        { logs: [line] },
      ),
    ).toEqual({ kind: 'dangling', carrier: 'logs', key: 'typeerror-line', reason: 'otherEntity' });
  });
});

describe('a configuration reference', () => {
  it('joins on the key the injection declares', () => {
    expect(
      join(
        { entityRef: 'container:default/order-app', signalRef: 'cpuLimit', signalKind: 'configuration' },
        { parameters: { cpuLimit: 500 } },
      ),
    ).toEqual({ kind: 'joined', carrier: 'parameters', key: 'cpuLimit', match: 'key' });
  });

  it('is dangling when the artefact declares no such key', () => {
    expect(
      join(
        { entityRef: 'container:default/order-app', signalRef: 'cpuLimit', signalKind: 'configuration' },
        { parameters: { memoryLimit: 512 } },
      ),
    ).toEqual({ kind: 'dangling', carrier: 'parameters', key: 'cpuLimit', reason: 'noKey' });
  });

  it('reads a declared key whose value is falsy as present, because presence is not truthiness', () => {
    expect(
      join(
        { entityRef: 'container:default/order-app', signalRef: 'replicas', signalKind: 'configuration' },
        { parameters: { replicas: 0 } },
      ).kind,
    ).toBe('joined');
  });
});

describe('a checkpoint that publishes nothing', () => {
  it('is not a join, and not a miss', () => {
    expect(join({ entityRef: 'service:default/order', signalKind: 'derived' })).toEqual({ kind: 'none' });
  });
});

describe('the sentence for a reference the artefact does not carry', () => {
  const sentence = (carrier: 'metrics' | 'logs' | 'parameters', reason: 'noRow' | 'otherEntity' | 'noKey'): string =>
    describeDanglingReference({ kind: 'dangling', carrier, key: 'cpu_usage', reason }, 'cp-1');

  it('names the checkpoint and the key', () => {
    expect(sentence('metrics', 'noRow')).toContain("checkpoint 'cp-1'");
    expect(sentence('metrics', 'noRow')).toContain("'cpu_usage'");
  });

  it('names the file the reader has to open', () => {
    expect(sentence('metrics', 'noRow')).toContain('metrics.json');
    expect(sentence('logs', 'otherEntity')).toContain('logs.json');
    expect(sentence('parameters', 'noKey')).toContain("the answer key's parameters");
  });

  it('says the artefact does not ship it, which is the fact the reader needs', () => {
    expect(sentence('metrics', 'noRow')).toContain('the artefact does not ship');
    expect(sentence('parameters', 'noKey')).toContain('the artefact does not ship');
  });

  it('distinguishes "no row" from "a row for someone else"', () => {
    expect(sentence('metrics', 'noRow')).not.toBe(sentence('metrics', 'otherEntity'));
    expect(sentence('metrics', 'otherEntity')).toContain('neither the checkpoint');
    expect(sentence('logs', 'otherEntity')).toContain('neither the checkpoint');
  });

  it('writes one line, without a newline or a full stop', () => {
    for (const [carrier, reason] of [
      ['metrics', 'noRow'],
      ['metrics', 'otherEntity'],
      ['logs', 'noRow'],
      ['parameters', 'noKey'],
    ] as const) {
      expect(sentence(carrier, reason)).not.toContain('\n');
      expect(sentence(carrier, reason).endsWith('.')).toBe(false);
    }
  });
});

describe('the tally one case reports', () => {
  it('counts the four ways a reference can land and keeps the denominator to what was published', () => {
    const tally = assessCaseReferences({
      caseId: 'case-001',
      graph: GRAPH,
      tables: tables({
        metrics: [
          { entity_id: 'service:default/order', metric: 'cpu_usage' },
          { entity_id: 'service:default/order', metric: 'memory_bytes' },
        ],
        logs: [{ id: 'typeerror-line', entity_id: 'service:default/order' }],
        parameters: { cpuLimit: 500 },
      }),
      checkpoints: [
        { checkpointId: 'cp-1', entityRef: 'service:default/order', signalRef: 'cpu_usage' },
        { checkpointId: 'cp-2', entityRef: 'container:default/order-app', signalRef: 'memory_bytes' },
        { checkpointId: 'cp-3', entityRef: 'service:default/order', signalRef: 'typeerror-line', signalKind: 'log' },
        {
          checkpointId: 'cp-4',
          entityRef: 'container:default/order-app',
          signalRef: 'cpuLimit',
          signalKind: 'configuration',
        },
        { checkpointId: 'cp-5', entityRef: 'service:default/order', signalKind: 'derived' },
        { checkpointId: 'cp-6', entityRef: 'service:default/order', signalRef: 'gc_pause_ms' },
      ],
    });

    expect(tally.caseId).toBe('case-001');
    expect(tally.published).toBe(5);
    expect(tally.joined).toBe(4);
    expect(tally.byEntity).toBe(2);
    expect(tally.byContainer).toBe(1);
    expect(tally.byKey).toBe(1);
    expect(tally.dangling).toHaveLength(1);
    expect(tally.dangling[0]?.checkpointId).toBe('cp-6');
    expect(tally.dangling[0]?.join.key).toBe('gc_pause_ms');
  });

  it('counts a case with nothing published as zero of zero rather than as complete', () => {
    const tally = assessCaseReferences({
      caseId: 'case-002',
      graph: GRAPH,
      tables: tables(),
      checkpoints: [{ checkpointId: 'cp-1', entityRef: 'service:default/order', signalKind: 'derived' }],
    });
    expect(tally.published).toBe(0);
    expect(tally.joined).toBe(0);
    expect(tally.dangling).toEqual([]);
  });
});
