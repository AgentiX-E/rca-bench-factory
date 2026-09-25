import { describe, expect, it } from 'vitest';
import {
  CHAOS_MESH_FAULT_TYPES,
  planInjection,
  readInjectionStatus,
  type InjectionPlanInput,
} from '../src/fault/injector.js';
import { inferFaultCategory } from '../src/fault/collector.js';
import { FAULT_CATEGORIES } from '../src/ir/types.js';

/**
 * The M12 planner and status reader.
 *
 * Two properties carry this file, and both exist because the alternative is a
 * test suite that passes while the product is broken.
 *
 * **1. The rejection is asserted, not the acceptance.** Every check here that
 * could plausibly be written as "a valid plan is produced" is instead written as
 * "these specific inputs are refused, with this value named". A planner that
 * accepts everything produces valid plans for the five kinds and is still wrong
 * for the sixth input it was never shown.
 *
 * **2. The five kinds are asserted against a literal table, not against the
 * module's own list.** `CHAOS_MESH_FAULT_TYPES` is exported, so
 * `it.each(CHAOS_MESH_FAULT_TYPES)` would be an expectation derived from the
 * thing it measures -- finding 47's defect. Deleting a kind from the tuple would
 * shrink the test list with it and stay green. The five are therefore spelled out
 * in this file, independently.
 */

const FIVE_KINDS = ['cpu', 'memory', 'disk', 'delay', 'loss'] as const;

/**
 * A minimal valid input, rebuilt per test.
 *
 * A factory rather than a shared constant: two tests that mutate one object
 * interfere, and vitest's default file-level isolation would not save them
 * because the mutation happens in the same tick order either way.
 */
function baseInput(overrides: Partial<InjectionPlanInput> = {}): InjectionPlanInput {
  return {
    faultType: 'cpu',
    targetEntityId: 'checkout-service',
    namespace: 'rca-bench',
    durationSeconds: 300,
    ...overrides,
  };
}

describe('the five kinds the milestone names are all plannable', () => {
  it.each(FIVE_KINDS)('%s produces a plan', (faultType) => {
    const result = planInjection(baseInput({ faultType }));
    expect(result.ok, `${faultType} was refused: ${result.ok ? '' : result.error}`).toBe(true);
  });

  it('covers exactly the milestone five, taking the union of both spellings', () => {
    // The milestone says CPU / MEM / DISK / DELAY / LOSS; the module says cpu,
    // memory, disk, delay, loss. This asserts the two are the same set rather
    // than assuming `MEM` and `memory` were meant to agree.
    expect([...CHAOS_MESH_FAULT_TYPES].sort()).toEqual([...FIVE_KINDS].sort());
  });

  it.each(FIVE_KINDS)('%s carries a FaultSpec the collector would accept', (faultType) => {
    const result = planInjection(baseInput({ faultType }));
    if (!result.ok) throw new Error(result.error);
    expect(result.spec.type).toBe(faultType);
    expect(result.spec.injectionMethod).toBe('chaos-mesh');
    expect(FAULT_CATEGORIES).toContain(result.spec.category);
  });
});

describe('the kind-to-Chaos-Mesh mapping, pinned against the upstream API', () => {
  /**
   * The literal table. Written here rather than imported so that a change to the
   * module's mapping shows up as a failing expectation instead of as a silently
   * updated one.
   */
  const EXPECTED: Record<string, { kind: string; action?: string }> = {
    cpu: { kind: 'StressChaos' },
    memory: { kind: 'StressChaos' },
    disk: { kind: 'IOChaos', action: 'fault' },
    delay: { kind: 'NetworkChaos', action: 'delay' },
    loss: { kind: 'NetworkChaos', action: 'loss' },
  };

  it.each(FIVE_KINDS)('%s maps to %s', (faultType) => {
    const result = planInjection(baseInput({ faultType }));
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.kind).toBe(EXPECTED[faultType].kind);
    expect(result.plan.action).toBe(EXPECTED[faultType].action);
  });

  it.each(FIVE_KINDS)('%s names the mapped kind in the manifest it emits', (faultType) => {
    // The plan's `kind` and the manifest's `kind` are two fields that can
    // disagree, and only the manifest is what gets applied.
    const result = planInjection(baseInput({ faultType }));
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.manifest['kind']).toBe(EXPECTED[faultType].kind);
    expect(result.plan.manifest['apiVersion']).toBe('chaos-mesh.org/v1alpha1');
  });

  it('never routes DELAY through TimeChaos, which a network reader cannot see', () => {
    // The trap this module exists to avoid. Chaos Mesh has a TimeChaos whose
    // action reads like a delay; using it produces a clock skew, and the
    // signal-validity verifier reading packet latency would correctly find
    // nothing and discard a case that was never a network delay.
    for (const faultType of FIVE_KINDS) {
      const result = planInjection(baseInput({ faultType }));
      if (!result.ok) throw new Error(result.error);
      expect(result.plan.kind).not.toBe('TimeChaos');
      expect(JSON.stringify(result.plan.manifest)).not.toContain('TimeChaos');
    }
  });

  it('expresses DISK as IOChaos rather than as a memory burn', () => {
    // A disk fault that only consumes RAM is not a disk fault. The mapping is
    // separated from `cpu`/`memory` precisely because the three share a category.
    const result = planInjection(baseInput({ faultType: 'disk' }));
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.kind).toBe('IOChaos');
    expect(result.plan.manifest).toHaveProperty('spec.volumePath');
    expect(JSON.stringify(result.plan.manifest)).not.toContain('stressors');
  });

  it('emits the intensity block only for the kind that owns it', () => {
    const cpu = planInjection(baseInput({ faultType: 'cpu' }));
    const net = planInjection(baseInput({ faultType: 'delay' }));
    const io = planInjection(baseInput({ faultType: 'disk' }));
    if (!cpu.ok || !net.ok || !io.ok) throw new Error('plan refused');
    const cpuSpec = cpu.plan.manifest['spec'] as Record<string, unknown>;
    const netSpec = net.plan.manifest['spec'] as Record<string, unknown>;
    const ioSpec = io.plan.manifest['spec'] as Record<string, unknown>;
    expect(cpuSpec).toHaveProperty('stressors');
    expect(cpuSpec).not.toHaveProperty('delay');
    expect(netSpec).toHaveProperty('delay');
    expect(netSpec).not.toHaveProperty('stressors');
    expect(ioSpec).not.toHaveProperty('stressors');
  });

  it('gives cpu and memory distinct stressor blocks, not one shared one', () => {
    const cpu = planInjection(baseInput({ faultType: 'cpu' }));
    const mem = planInjection(baseInput({ faultType: 'memory' }));
    if (!cpu.ok || !mem.ok) throw new Error('plan refused');
    const cpuStressors = (cpu.plan.manifest['spec'] as Record<string, unknown>)['stressors'];
    const memStressors = (mem.plan.manifest['spec'] as Record<string, unknown>)['stressors'];
    expect(cpuStressors).toHaveProperty('cpu');
    expect(memStressors).toHaveProperty('memory');
  });
});

describe('a plan that is ambiguous about its target is refused', () => {
  it('refuses an unknown fault type and names it', () => {
    const result = planInjection(baseInput({ faultType: 'zeno' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('zeno');
    // The message has to advertise the alternatives, or the refusal is a dead end.
    expect(result.error).toContain('cpu');
    expect(result.error).toContain('loss');
  });

  it('refuses a fault type from another injector rather than coercing it', () => {
    // `pod-kill` is a real chaos fault and not one of the five. Coercing it to
    // the nearest kind would make the planner's guess the ground truth.
    const result = planInjection(baseInput({ faultType: 'pod-kill' }));
    expect(result.ok).toBe(false);
  });

  it('refuses a blank or missing target rather than defaulting to a wildcard', () => {
    for (const targetEntityId of ['', '   ']) {
      const result = planInjection(baseInput({ targetEntityId }));
      expect(result.ok, `'${targetEntityId}' was accepted as a target`).toBe(false);
    }
  });

  it('refuses a zero, negative or non-finite duration', () => {
    for (const durationSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = planInjection(baseInput({ durationSeconds }));
      expect(result.ok, `duration ${String(durationSeconds)} was accepted`).toBe(false);
    }
  });

  it('refuses a non-object parameters value instead of ignoring it', () => {
    const result = planInjection(baseInput({ parameters: 'load=100' as unknown as Record<string, unknown> }));
    expect(result.ok).toBe(false);
  });

  it('refuses a non-object input without throwing on the property reads', () => {
    for (const input of [null, undefined, 'cpu', 42, []]) {
      const result = planInjection(input as unknown as InjectionPlanInput);
      expect(result.ok).toBe(false);
    }
  });

  it('accepts a target with surrounding whitespace but stores it trimmed', () => {
    const result = planInjection(baseInput({ targetEntityId: '  checkout  ' }));
    if (!result.ok) throw new Error(result.error);
    const selector = (result.plan.manifest['spec'] as Record<string, unknown>)['selector'];
    expect(selector).toEqual({ namespaces: ['rca-bench'], labelSelectors: { app: 'checkout' } });
  });
});

describe('the manifest is scoped to one pod, because mode: all would make the ground truth ambiguous', () => {
  it('pins mode to one rather than taking the CRD default', () => {
    const result = planInjection(baseInput());
    if (!result.ok) throw new Error(result.error);
    expect((result.plan.manifest['spec'] as Record<string, unknown>)['mode']).toBe('one');
  });

  it('carries the namespace in both the selector and the metadata', () => {
    const result = planInjection(baseInput({ namespace: 'bench-ns' }));
    if (!result.ok) throw new Error(result.error);
    const metadata = result.plan.manifest['metadata'] as Record<string, unknown>;
    const spec = result.plan.manifest['spec'] as Record<string, unknown>;
    expect(metadata['namespace']).toBe('bench-ns');
    expect((spec['selector'] as Record<string, unknown>)['namespaces']).toEqual(['bench-ns']);
  });

  it('derives an RFC 1123 name, so an entity id with a slash cannot produce an invalid object', () => {
    const result = planInjection(baseInput({ targetEntityId: 'shop/Checkout.Service:v2' }));
    if (!result.ok) throw new Error(result.error);
    const name = (result.plan.manifest['metadata'] as Record<string, unknown>)['name'] as string;
    expect(name).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
    expect(name).toContain('cpu');
  });

  it('falls back to a literal name when the id sanitises away to nothing', () => {
    const result = planInjection(baseInput({ targetEntityId: '！！！' }));
    if (!result.ok) throw new Error(result.error);
    const name = (result.plan.manifest['metadata'] as Record<string, unknown>)['name'] as string;
    expect(name).toBe('cpu-target');
  });
});

describe('the observation window is explicit, because a case without one cannot be read', () => {
  it('defaults the window when the caller does not supply one', () => {
    const result = planInjection(baseInput());
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.observationWindowSeconds).toBe(300);
  });

  it('honours a supplied window rather than overwriting it with the default', () => {
    const result = planInjection(baseInput({ observationWindowSeconds: 900 }));
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.observationWindowSeconds).toBe(900);
  });

  it('rejects a zero or negative window rather than silently defaulting', () => {
    // Silently defaulting would mean a caller who asked for a window of 0 gets
    // 300s of telemetry and never learns their parameter was ignored.
    for (const observationWindowSeconds of [0, -5]) {
      const result = planInjection(baseInput({ observationWindowSeconds }));
      expect(result.ok, `window ${observationWindowSeconds} was accepted`).toBe(false);
    }
  });

  it('records both durations in the spec, so the case carries its own timing', () => {
    const result = planInjection(baseInput({ durationSeconds: 120, observationWindowSeconds: 600 }));
    if (!result.ok) throw new Error(result.error);
    expect(result.spec.parameters).toMatchObject({
      durationSeconds: 120,
      observationWindowSeconds: 600,
    });
  });
});

describe('the plan and the collector agree about classification', () => {
  it.each(FIVE_KINDS)('%s classifies the same way from both directions', (faultType) => {
    // `collector.ts` reaches a category from a fault *type string* by keyword
    // match; this module reaches one from the *kind*. The two must agree, or a
    // case planned as resource and inferred as network would be judged by the
    // wrong row of the validity mechanism table.
    const planned = planInjection(baseInput({ faultType }));
    if (!planned.ok) throw new Error(planned.error);
    expect(inferFaultCategory(faultType)).toBe(planned.spec.category);
  });
});

describe('reading what the cluster reported', () => {
  it('treats a bare phase string as the phase', () => {
    const reading = readInjectionStatus('AllInjected');
    expect(reading.applied).toBe(true);
    expect(reading.phase).toBe('AllInjected');
  });

  it('reads the phase out of a Chaos Mesh status object', () => {
    // Modern Chaos Mesh nests it; older versions and `kubectl get -o json`
    // differ. Both shapes are read.
    expect(readInjectionStatus({ experiment: { phase: 'AllInjected' } }).applied).toBe(true);
    expect(readInjectionStatus({ phase: 'AllInjected' }).applied).toBe(true);
  });

  it('counts a recovered injection as applied, because it was', () => {
    // A case whose window closed after the fault recovered has proof the fault
    // was on. Reading this as "never injected" would discard a good case.
    for (const phase of ['AllRecovered', 'Recovered', 'Injected']) {
      expect(readInjectionStatus(phase).applied, phase).toBe(true);
    }
  });

  it('reports a named failure phase as not applied', () => {
    for (const phase of ['NotInjected', 'Failed', 'Paused']) {
      const reading = readInjectionStatus(phase);
      expect(reading.applied, phase).toBe(false);
      expect(reading.phase).toBe(phase);
    }
  });

  it('refuses to read a missing status as "not injected"', () => {
    // The distinction the module exists to preserve. A controller that did not
    // report is not evidence the fault was not injected; collapsing the two
    // would let a broken observability path disqualify every case it touched.
    for (const status of [undefined, null]) {
      const reading = readInjectionStatus(status);
      expect(reading.applied).toBe('unverifiable');
      expect(reading.applied).not.toBe(false);
      expect(reading.reason).toBeTruthy();
    }
  });

  it('refuses to read an unrecognised phase as a verdict, and says which one', () => {
    const reading = readInjectionStatus('SomethingNewInV3');
    expect(reading.applied).toBe('unverifiable');
    expect(reading.phase).toBe('SomethingNewInV3');
    expect(reading.reason).toContain('SomethingNewInV3');
  });

  it('refuses to read a status object with no phase', () => {
    const reading = readInjectionStatus({ conditions: [] });
    expect(reading.applied).toBe('unverifiable');
    expect(reading.phase).toBeNull();
    expect(reading.reason).toContain('no readable phase');
  });

  it('refuses a non-string, non-object status rather than coercing it', () => {
    for (const status of [42, true, ['AllInjected']]) {
      const reading = readInjectionStatus(status);
      expect(reading.applied, String(status)).toBe('unverifiable');
    }
  });

  it('never reports unverifiable and false as the same thing', () => {
    // The whole point, stated once as an assertion over the full phase set plus
    // the unreadable cases. If these ever coincide, every downstream consumer
    // that branches on `applied === false` starts dropping cases for the wrong
    // reason.
    const unreadable = [undefined, null, 'Unknown', {}, 42];
    for (const status of unreadable) {
      expect(readInjectionStatus(status).applied).not.toBe(false);
    }
  });
});

describe('the branches a malformed input never reaches are still branches', () => {
  it('reports a blank fault type before it reports the unknown-kind error', () => {
    const result = planInjection(baseInput({ faultType: '   ' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('faultType');
  });

  it('reports a missing namespace rather than emitting an empty one', () => {
    const result = planInjection(baseInput({ namespace: '' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('namespace');
  });

  it('reports a non-object input by its own message, not by a property read crashing', () => {
    const result = planInjection(null as unknown as InjectionPlanInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not an object');
  });
});

describe('every parameter the CRD accepts is reachable, and every default is real', () => {
  /**
   * The coverage pass drove this block.
   *
   * `injector.ts` sat at `100 | 85.89 | 100 | 100` -- statements complete, branch
   * far under the floor -- because nine ternaries in the manifest builders were
   * only ever taken on their default side. Each one is a parameter a real
   * experiment sets: a memory fault with no `size` silently burns 256Mi, and a
   * loss fault with no percentage silently drops everything, which is a much
   * harsher experiment than the one the caller asked for.
   *
   * They are asserted here individually rather than in one loop so that a builder
   * losing a key fails by name.
   */

  function specOf(faultType: string, parameters?: Record<string, unknown>): Record<string, unknown> {
    const result = planInjection(baseInput({ faultType, ...(parameters ? { parameters } : {}) }));
    if (!result.ok) throw new Error(result.error);
    return result.plan.manifest['spec'] as Record<string, unknown>;
  }

  it('takes a memory size from the caller, and defaults to 256Mi', () => {
    expect(specOf('memory', { size: '1Gi' })['stressors']).toEqual({ memory: { workers: 1, size: '1Gi' } });
    expect(specOf('memory')['stressors']).toEqual({ memory: { workers: 1, size: '256Mi' } });
  });

  it('takes cpu workers and load, defaulting to 1 worker at 100%', () => {
    expect(specOf('cpu', { workers: 4, load: 80 })['stressors']).toEqual({ cpu: { workers: 4, load: 80 } });
    expect(specOf('cpu')['stressors']).toEqual({ cpu: { workers: 1, load: 100 } });
  });

  it('ignores a non-numeric worker or load rather than emitting it', () => {
    // `numberOr` is a guard against a caller passing "two". Without the finite
    // check, `Number.NaN` would serialise to `null` in the applied document and
    // the controller would reject the whole experiment.
    expect(specOf('cpu', { workers: 'two', load: Number.NaN })['stressors']).toEqual({
      cpu: { workers: 1, load: 100 },
    });
  });

  it('takes delay latency, correlation and jitter, with all three defaults', () => {
    const custom = specOf('delay', { latency: '500ms', jitter: '20ms', correlation: '50' });
    expect(custom['delay']).toEqual({ latency: '500ms', correlation: '50', jitter: '20ms' });
    expect(specOf('delay')['delay']).toEqual({ latency: '200ms', correlation: '0', jitter: '0ms' });
  });

  it('takes the loss percentage, and defaults to 100 rather than to a gentler number', () => {
    // The default is the honest one: a fault type called `loss` whose default
    // dropped 1% of packets would be a fault that does not reliably manifest,
    // and the validity verifier would then discard the case for the planner's
    // choice rather than for anything about the system under test.
    //
    // Both keys are asserted on both sides. The first version of this test
    // checked only `loss` against the default and only `correlation` against a
    // supplied value, so the default `correlation` was never read and the branch
    // stayed uncovered at `98.83`. A test that names one key of a two-key object
    // leaves the other key's default unasserted.
    expect(specOf('loss', { loss: '30' })['loss']).toEqual({ loss: '30', correlation: '0' });
    expect(specOf('loss', { loss: '30', correlation: '25' })['loss']).toEqual({
      loss: '30',
      correlation: '25',
    });
    expect(specOf('loss')['loss']).toEqual({ loss: '100', correlation: '0' });
  });

  it('takes the IO volume path and glob, defaulting to /data and *', () => {
    const custom = specOf('disk', { volumePath: '/var/lib/pg', path: '/var/lib/pg/*.log' });
    expect(custom['volumePath']).toBe('/var/lib/pg');
    expect(custom['path']).toBe('/var/lib/pg/*.log');
    expect(specOf('disk')['volumePath']).toBe('/data');
    expect(specOf('disk')['path']).toBe('*');
  });

  it('takes the IO percent, defaulting to 100, and ignores a non-numeric one', () => {
    expect(specOf('disk', { percent: 25 })['percent']).toBe(25);
    expect(specOf('disk')['percent']).toBe(100);
    expect(specOf('disk', { percent: 'half' })['percent']).toBe(100);
  });

  it('carries the caller parameters into the spec, not only into the manifest', () => {
    // Two objects are built from `input.parameters` -- the manifest and the
    // spec -- and a caller reading the case later sees only the spec. If the
    // spec dropped them the experiment would be unreproducible from its own
    // record.
    const result = planInjection(baseInput({ parameters: { workers: 3 } }));
    if (!result.ok) throw new Error(result.error);
    expect(result.spec.parameters).toMatchObject({ workers: 3, durationSeconds: 300 });
    expect(specOf('cpu', { workers: 3 })['stressors']).toEqual({ cpu: { workers: 3, load: 100 } });
  });

  it('omits the parameters key from the spec when the caller supplied none', () => {
    // The opposite of the above: an absent key and an empty object are different
    // records, and `durationSeconds`/`observationWindowSeconds` are always
    // present, so this asserts the always-present pair rather than emptiness.
    const result = planInjection(baseInput());
    if (!result.ok) throw new Error(result.error);
    expect(Object.keys(result.spec.parameters ?? {}).sort()).toEqual([
      'durationSeconds',
      'observationWindowSeconds',
    ]);
  });

  it('passes parameters through to the spec even when the manifest ignores them', () => {
    // `workers` is meaningful for cpu and meaningless for delay. The spec keeps
    // it so that the record of what was asked for is complete.
    const result = planInjection(baseInput({ faultType: 'delay', parameters: { workers: 3 } }));
    if (!result.ok) throw new Error(result.error);
    expect(result.spec.parameters).toMatchObject({ workers: 3 });
  });
});
