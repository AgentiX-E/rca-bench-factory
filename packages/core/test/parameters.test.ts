import { describe, expect, it } from 'vitest';

import { readDeclaredQuantity } from '../src/ir/parameters.js';

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
