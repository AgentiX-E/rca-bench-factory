import { describe, expect, it } from 'vitest';
import {
  clampToUnit,
  convertUnit,
  dimensionOf,
  isConvertible,
  knownUnits,
  measurementBounds,
  UnitError,
} from '../src/util/unit.js';

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

  it('states the range a reading in a unit can occupy, and only for units it knows', () => {
    // A reading is a measurement, and a measurement cannot report a value its unit does not admit: a
    // share above 100 % is not a noisy share, and a negative duration is not a small one. The table
    // is the only place that knows what a unit admits, so the bounds live beside the factors.
    expect(measurementBounds('1')).toEqual({ min: 0, max: 1 });
    expect(measurementBounds('%')).toEqual({ min: 0, max: 100 });
    expect(measurementBounds('ms')).toEqual({ min: 0, max: Number.POSITIVE_INFINITY });
    expect(measurementBounds('count')).toEqual({ min: 0, max: Number.POSITIVE_INFINITY });
    // `MiB/s` is not a unit this table knows, so it has no range to state. `undefined` rather than a
    // guessed `[0, ∞)`: a bound nobody declared is a claim, and the caller decides what to do with it.
    expect(measurementBounds('MiB/s')).toBeUndefined();
    expect(measurementBounds('m')).toBeUndefined();
  });

  it('clamps a value into its unit range, and leaves it alone when it is already inside', () => {
    expect(clampToUnit('1', 1.02)).toBe(1);
    expect(clampToUnit('1', -0.02)).toBe(0);
    expect(clampToUnit('1', 0.6)).toBe(0.6);
    expect(clampToUnit('%', 102)).toBe(100);
    expect(clampToUnit('ms', -1)).toBe(0);
    expect(clampToUnit('ms', 4300)).toBe(4300);
    // No unit declared, or one the table does not know: nothing to clamp against, because a bound
    // nobody declared would be this table inventing a limit on someone else's unit.
    expect(clampToUnit(undefined, -1)).toBe(-1);
    expect(clampToUnit('MiB/s', -1)).toBe(-1);
  });

  it('converts millicores into cores, which is how incident texts state a CPU quota', () => {
    // `500m` in a Kubernetes-style text is 500 millicores. The dimension is its own rather than a
    // second spelling of `count`: a table that let `core` and `count` convert would add a restart
    // count to a CPU quota without complaining.
    expect(convertUnit(500, 'mcore', 'core')).toBe(0.5);
    expect(convertUnit(2, 'core', 'mcore')).toBe(2000);
    expect(dimensionOf('mcore')).toBe('cores');
    expect(isConvertible('mcore', 'core')).toBe(true);
    expect(isConvertible('mcore', 'count')).toBe(false);
    expect(() => convertUnit(1, 'mcore', 'count')).toThrow(UnitError);
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
    expect(groups.cores).toEqual(['core', 'mcore']);
  });
});
