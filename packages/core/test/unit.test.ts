import { describe, expect, it } from 'vitest';
import {
  admitsFraction,
  clampToUnit,
  convertUnit,
  dimensionOf,
  isConvertible,
  knownUnits,
  measurementBounds,
  quantizeToUnit,
  resolutionOf,
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

describe('admitsFraction', () => {
  it('says a count lands on whole things, and that every continuous dimension does not', () => {
    // A count is a number of things: 203.2 records is not a reading a system can produce, and a
    // hundredth of a 504 response is not a response. The other five dimensions here are continuous
    // -- a duration, a byte count, a rate and a share all land between two integers -- and `cores`
    // belongs with them, because `500m` is a quantity stated in thousandths rather than half a
    // processor.
    expect(admitsFraction('count')).toBe(false);
    expect(admitsFraction('ms')).toBe(true);
    expect(admitsFraction('MiBy')).toBe(true);
    expect(admitsFraction('rps')).toBe(true);
    expect(admitsFraction('%')).toBe(true);
    expect(admitsFraction('1')).toBe(true);
    expect(admitsFraction('mcore')).toBe(true);
    expect(admitsFraction('core')).toBe(true);
  });

  it('answers true for a unit it does not know, rather than inventing a rule for it', () => {
    // The same decision `measurementBounds` makes when it returns `undefined`: a caller must not be
    // told that half of something is impossible in a unit nobody declared. The two answers have to
    // agree in shape, or a guard built on one would refuse what the other could not describe.
    expect(admitsFraction('MiB/s')).toBe(true);
    expect(admitsFraction('parsec')).toBe(true);
    expect(measurementBounds('parsec')).toBeUndefined();
  });
});

describe('quantizeToUnit', () => {
  it('puts a count on a whole thing, and leaves every continuous reading where it was', () => {
    // The grid a reading has to sit on, as the range's companion. A count is a number of things, so
    // the nearest whole thing is what a measurement in it can report: 203.2 records is not a
    // measurement, it is a fraction of one record (finding 284).
    expect(quantizeToUnit('count', 203.2)).toBe(203);
    expect(quantizeToUnit('count', 196.8)).toBe(197);
    expect(quantizeToUnit('count', 1.02)).toBe(1);
    expect(quantizeToUnit('count', 12)).toBe(12);
    // Continuous readings are untouched, and that is the half that would be lost if rounding were
    // applied to every unit: a latency percentile between two integers is the normal case.
    expect(quantizeToUnit('ms', 4.3)).toBe(4.3);
    expect(quantizeToUnit('%', 87.5)).toBe(87.5);
    expect(quantizeToUnit('mcore', 500.5)).toBe(500.5);
    // No unit, or one the table does not know: nothing to round against, for the reason
    // `admitsFraction` gives.
    expect(quantizeToUnit(undefined, 203.2)).toBe(203.2);
    expect(quantizeToUnit('parsec', 1.5)).toBe(1.5);
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

describe('resolutionOf', () => {
  // The smallest change a reading in a unit can express. Every statistic in `fault/` divides a change
  // by a spread, and this number is what stands in when the baseline has no spread at all -- see
  // finding 288, where the stand-in was `1e-6` and a one-line page change was reported as 1 000 000.
  it('answers one whole thing for a count, which has no reading between six and seven', () => {
    expect(resolutionOf('count')).toBe(1);
  });

  it('answers a hundredth for a share written as 1 and whole points for one written as %', () => {
    // The same statement twice, in the two spellings the table carries: a share is read to the
    // percentage point, and 0.000001 of a whole is not a change anyone acts on.
    expect(resolutionOf('1')).toBe(0.01);
    expect(resolutionOf('%')).toBe(1);
  });

  it('answers one of the unit as declared, so a duration resolves in the unit it is written in', () => {
    // `500 mcore` resolves in thousandths and `2.5 ms` in milliseconds: the declaration names the
    // grid, and a duration in seconds is not the same reading as one in milliseconds.
    expect(resolutionOf('ms')).toBe(1);
    expect(resolutionOf('s')).toBe(1);
    expect(resolutionOf('mcore')).toBe(1);
    expect(resolutionOf('MiBy')).toBe(1);
    expect(resolutionOf('rps')).toBe(1);
  });

  it('answers the old constant only where nobody declared a unit', () => {
    // Not dead, and not a default: an absent unit and a unit the table does not know are both
    // "someone else's unit", which is the same decision `measurementBounds` makes by returning
    // `undefined` rather than a guessed range.
    expect(resolutionOf(undefined)).toBe(1e-6);
    expect(resolutionOf('furlongs')).toBe(1e-6);
  });

  it('answers something positive for every unit in the table, so a new unit cannot divide by zero', () => {
    // The shape a future dimension arrives in: a unit added to `UNITS` and left out of
    // `resolutionOf` would answer this test's subject with a zero and make every statistic on it an
    // infinity. Iterating the table rather than listing it is the point -- a list would be a second
    // inventory of the units, and the first would be free to drift.
    const all = Object.values(knownUnits()).flat();
    expect(all.length).toBeGreaterThan(10);
    for (const unit of all) {
      expect(resolutionOf(unit), unit).toBeGreaterThan(0);
      expect(Number.isFinite(resolutionOf(unit)), unit).toBe(true);
    }
  });
});
