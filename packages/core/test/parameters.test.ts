import { describe, expect, it } from 'vitest';

import { readDeclaredQuantity, readDeclaredReading } from '../src/ir/parameters.js';

/**
 * Whether a value a case declares is a quantity a checkpoint can cite.
 *
 * `fault.parameters` is an open record -- the injector's knobs, which differ per fault kind -- and a
 * configuration checkpoint cites one of them. This reader is the boundary between "a value" and "a
 * value a comparison can be about", so every shape that is *not* a quantity has a test saying so:
 * reading a nested object as a quantity would invent a unit from whatever field happened to be there.
 */

describe('readDeclaredQuantity · what it reads', () => {
  it('reads a bare number as a quantity with no unit', () => {
    expect(readDeclaredQuantity(500)).toEqual({ value: 500 });
    expect(readDeclaredQuantity(0)).toEqual({ value: 0 });
    expect(readDeclaredQuantity(-3.5)).toEqual({ value: -3.5 });
  });

  it('reads a value with a unit', () => {
    expect(readDeclaredQuantity({ value: 500, unit: 'mcore' })).toEqual({ value: 500, unit: 'mcore' });
    // The unit is kept as written: this module decides what a quantity is, not what a unit means.
    // `util/unit.ts` is where a unit is looked up, and it is not consulted here.
    expect(readDeclaredQuantity({ value: 1, unit: 'not-a-known-unit' })).toEqual({ value: 1, unit: 'not-a-known-unit' });
  });

  it('reads an object with a value and no unit as a quantity with no unit', () => {
    expect(readDeclaredQuantity({ value: 12 })).toEqual({ value: 12 });
  });
});

describe('readDeclaredQuantity · what it refuses', () => {
  it('refuses a string, which is an identifier rather than a fact to compare', () => {
    // `container == 'checkout-api-app'` restates the parameter; the parameter is already in the file,
    // and a check that compares a field with itself is not a check.
    expect(readDeclaredQuantity('checkout-api-app')).toBeUndefined();
    expect(readDeclaredQuantity('')).toBeUndefined();
  });

  it('refuses a boolean, a null and an array', () => {
    expect(readDeclaredQuantity(true)).toBeUndefined();
    expect(readDeclaredQuantity(null)).toBeUndefined();
    expect(readDeclaredQuantity([500])).toBeUndefined();
    expect(readDeclaredQuantity(undefined)).toBeUndefined();
  });

  it('refuses an object whose value is not a number', () => {
    expect(readDeclaredQuantity({ value: '500', unit: 'mcore' })).toBeUndefined();
    expect(readDeclaredQuantity({ unit: 'mcore' })).toBeUndefined();
    expect(readDeclaredQuantity({ container: 'checkout-api-app' })).toBeUndefined();
  });

  it('refuses a unit that is not a non-blank string', () => {
    expect(readDeclaredQuantity({ value: 1, unit: 500 })).toBeUndefined();
    expect(readDeclaredQuantity({ value: 1, unit: '   ' })).toBeUndefined();
    expect(readDeclaredQuantity({ value: 1, unit: null })).toBeUndefined();
  });

  it('refuses a number that is not finite', () => {
    // A parameter that came out of a parse as `NaN` is not a fact about the system, and comparing a
    // checkpoint with it would answer "no" to every comparator including `!=`.
    expect(readDeclaredQuantity(Number.NaN)).toBeUndefined();
    expect(readDeclaredQuantity({ value: Number.POSITIVE_INFINITY })).toBeUndefined();
  });
});

describe('readDeclaredReading · a reading is a literal or a reference', () => {
  it('reads a finite number as a literal', () => {
    expect(readDeclaredReading(20)).toEqual({ kind: 'literal', value: 20 });
    expect(readDeclaredReading(0)).toEqual({ kind: 'literal', value: 0 });
    expect(readDeclaredReading(-1.5)).toEqual({ kind: 'literal', value: -1.5 });
  });

  it('reads an object with one parameter key as a reference', () => {
    expect(readDeclaredReading({ parameter: 'poolSize' })).toEqual({
      kind: 'parameter',
      parameter: 'poolSize',
    });
  });

  it('refuses everything that is neither', () => {
    // A bare string is the legacy shape and is refused rather than read as a parameter name: the
    // field used to be a number, and `"poolSize"` in its place would otherwise become a reference
    // nobody wrote.
    for (const value of ['poolSize', null, true, [], { parameter: 3 }, { parameter: '  ' }, { parameter: 'a', value: 1 }, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(readDeclaredReading(value)).toBeUndefined();
    }
  });

  it('refuses a reference that also carries a value, which is two claims about one number', () => {
    expect(readDeclaredReading({ parameter: 'poolSize', unit: 'count' })).toBeUndefined();
  });
});
