import { describe, expect, it } from 'vitest';
import {
  inferFaultCategory,
  normalizeFaultType,
  parseFaultSpec,
} from '../src/fault/collector.js';

/**
 * Fault collector tests.
 *
 * `normalizeFaultType`, `inferFaultCategory` and `parseFaultSpec` are pure
 * functions: they turn a fault injection event or a historical fault record
 * into the IR `FaultCase.fault` spec. No IO, no mocks.
 */

describe('normalizeFaultType', () => {
  it('lower-cases and turns spaces into hyphens', () => {
    expect(normalizeFaultType('CPU Saturation')).toBe('cpu-saturation');
  });

  it('turns underscores into hyphens', () => {
    expect(normalizeFaultType('network_delay')).toBe('network-delay');
  });

  it('collapses surrounding and repeated whitespace', () => {
    expect(normalizeFaultType('  Disk   IO  ')).toBe('disk-io');
  });

  it('strips non-alphanumeric characters', () => {
    expect(normalizeFaultType('Pod-Kill!')).toBe('pod-kill');
    expect(normalizeFaultType('db.timeout#v2')).toBe('dbtimeoutv2');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeFaultType('   ')).toBe('');
  });
});

describe('inferFaultCategory', () => {
  it('classifies CPU and memory faults as resource', () => {
    expect(inferFaultCategory('cpu-saturation')).toBe('resource');
    expect(inferFaultCategory('memory-leak')).toBe('resource');
    expect(inferFaultCategory('oom-kill')).toBe('resource');
  });

  it('classifies latency and partition faults as network', () => {
    expect(inferFaultCategory('network-delay')).toBe('network');
    expect(inferFaultCategory('packet-loss')).toBe('network');
    expect(inferFaultCategory('network-partition')).toBe('network');
  });

  it('classifies pod and container faults as runtime', () => {
    expect(inferFaultCategory('pod-failure')).toBe('runtime');
    expect(inferFaultCategory('container-kill')).toBe('runtime');
    expect(inferFaultCategory('node-evict')).toBe('runtime');
  });

  it('classifies database and queue faults as middleware', () => {
    expect(inferFaultCategory('database-timeout')).toBe('middleware');
    expect(inferFaultCategory('redis-outage')).toBe('middleware');
    expect(inferFaultCategory('kafka-lag')).toBe('middleware');
  });

  it('classifies exception and bug faults as code', () => {
    expect(inferFaultCategory('null-pointer-exception')).toBe('code');
    expect(inferFaultCategory('logic-error')).toBe('code');
  });

  it('classifies configuration faults as config', () => {
    expect(inferFaultCategory('config-change')).toBe('config');
    expect(inferFaultCategory('env-mismatch')).toBe('config');
  });

  it('classifies dependency faults as dependency', () => {
    expect(inferFaultCategory('dependency-upgrade')).toBe('dependency');
    expect(inferFaultCategory('upstream-outage')).toBe('dependency');
  });

  it('returns unknown for an unrecognised type', () => {
    expect(inferFaultCategory('mystery-fault')).toBe('unknown');
  });
});

describe('parseFaultSpec', () => {
  it('parses a full record with an explicit category', () => {
    const result = parseFaultSpec(
      { type: 'CPU Saturation', category: 'resource', parameters: { intensity: 90 } },
      'chaos-mesh',
    );
    expect(result).toEqual({
      ok: true,
      spec: {
        type: 'cpu-saturation',
        category: 'resource',
        injectionMethod: 'chaos-mesh',
        parameters: { intensity: 90 },
      },
    });
  });

  it('infers the category when it is absent', () => {
    const result = parseFaultSpec({ type: 'network-delay' }, 'litmus');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.category).toBe('network');
      expect(result.spec.type).toBe('network-delay');
    }
  });

  it('omits parameters when they are absent', () => {
    const result = parseFaultSpec({ type: 'pod-failure' }, 'chaosblade');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.parameters).toBeUndefined();
  });

  it('fails on a non-object input', () => {
    const result = parseFaultSpec('not-an-object', 'historical');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/object/i);
  });

  it('fails when the type is missing', () => {
    const result = parseFaultSpec({ category: 'code' }, 'manual');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/type/i);
  });

  it('fails on a blank type', () => {
    const result = parseFaultSpec({ type: '   ' }, 'manual');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/type/i);
  });

  it('fails on an invalid category', () => {
    const result = parseFaultSpec({ type: 'cpu', category: 'bogus' }, 'chaos-mesh');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/category/i);
  });

  it('fails when parameters are present but not an object', () => {
    const result = parseFaultSpec({ type: 'cpu', parameters: 'not-object' }, 'chaos-mesh');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/parameters/i);
  });
});
