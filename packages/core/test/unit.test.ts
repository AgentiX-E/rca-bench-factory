import { describe, expect, it } from 'vitest';
import { convertUnit, dimensionOf, isConvertible, knownUnits, UnitError } from '../src/util/unit.js';

describe('convertUnit', () => {
  it('converts time units against the second base', () => {
    expect(convertUnit(1500, 'ms', 's')).toBe(1.5);
    expect(convertUnit(1.5, 's', 'ms')).toBe(1500);
    expect(convertUnit(2, 'h', 'min')).toBe(120);
    expect(convertUnit(1, 'us', 'ns')).toBe(1000);
  });

  it('converts byte units on a 1024 base', () => {
    expect(convertUnit(1, 'KiBy', 'By')).toBe(1024);
    expect(convertUnit(1, 'MiBy', 'KiBy')).toBe(1024);
    expect(convertUnit(1, 'GiBy', 'MiBy')).toBe(1024);
  });

  it('treats QPS and TPS as aliases of rps', () => {
    expect(convertUnit(120, 'QPS', 'rps')).toBe(120);
    expect(convertUnit(120, 'TPS', 'rps')).toBe(120);
  });

  it('converts percent into a ratio', () => {
    expect(convertUnit(90, '%', '1')).toBe(0.9);
  });

  it('returns the value unchanged for identical units', () => {
    expect(convertUnit(42, 's', 's')).toBe(42);
  });

  it('rejects conversions across dimensions', () => {
    expect(() => convertUnit(1, 'By', 's')).toThrow(UnitError);
    expect(() => convertUnit(1, 'ms', 'KiBy')).toThrow(UnitError);
  });

  it('rejects unknown units', () => {
    expect(() => convertUnit(1, 'parsec', 's')).toThrow(UnitError);
    expect(() => convertUnit(1, 's', 'parsec')).toThrow(UnitError);
  });

  it('propagates zero and negative values', () => {
    expect(convertUnit(0, 'ms', 's')).toBe(0);
    expect(convertUnit(-500, 'ms', 's')).toBe(-0.5);
  });
});

describe('isConvertible', () => {
  it('is false when either unit is unknown', () => {
    expect(isConvertible('s', 'nope')).toBe(false);
    expect(isConvertible('nope', 's')).toBe(false);
  });

  it('is true only within a dimension', () => {
    expect(isConvertible('ms', 'h')).toBe(true);
    expect(isConvertible('ms', 'By')).toBe(false);
  });
});

describe('dimensionOf', () => {
  it('reports the dimension for known units', () => {
    expect(dimensionOf('ms')).toBe('time');
    expect(dimensionOf('KiBy')).toBe('bytes');
    expect(dimensionOf('%')).toBe('ratio');
    expect(dimensionOf('QPS')).toBe('rate');
    expect(dimensionOf('count')).toBe('count');
  });

  it('throws for unknown units', () => {
    expect(() => dimensionOf('furlong')).toThrow(UnitError);
  });
});

describe('knownUnits', () => {
  it('groups every unit under exactly one dimension', () => {
    const groups = knownUnits();
    const all = Object.values(groups).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(groups.time).toContain('ms');
    expect(groups.bytes).toContain('By');
  });
});
