import { describe, expect, it } from 'vitest';
import { isRecord, readString, readStringArray, safeJson } from '../src/util/json.js';

/**
 * JSON helper tests.
 *
 * These helpers are the boundary between this repository and files authored by
 * somebody else, so the contract that matters is not the happy path but the
 * failure path: a malformed artefact has to come back as an empty value, never
 * as a thrown exception that takes the whole scoring run down.
 */

describe('safeJson', () => {
  it('parses a value', () => {
    expect(safeJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns undefined instead of throwing on malformed input', () => {
    expect(safeJson('not json')).toBeUndefined();
    expect(safeJson('')).toBeUndefined();
    expect(safeJson('{"a":')).toBeUndefined();
  });
});

describe('isRecord', () => {
  it('accepts a plain object only', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('a')).toBe(false);
    expect(isRecord(1)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('readString', () => {
  it('returns the string value', () => {
    expect(readString({ a: 'x' }, 'a')).toBe('x');
  });

  it('returns an empty string when the field is absent or not a string', () => {
    expect(readString({}, 'a')).toBe('');
    expect(readString({ a: 1 }, 'a')).toBe('');
    expect(readString({ a: null }, 'a')).toBe('');
    expect(readString({ a: ['x'] }, 'a')).toBe('');
  });
});

describe('readStringArray', () => {
  it('returns the string entries', () => {
    expect(readStringArray({ a: ['x', 'y'] }, 'a')).toEqual(['x', 'y']);
  });

  it('drops non-string entries instead of propagating them', () => {
    expect(readStringArray({ a: ['x', 1, null, 'y', {}] }, 'a')).toEqual(['x', 'y']);
  });

  it('returns an empty array when the field is absent or not an array', () => {
    expect(readStringArray({}, 'a')).toEqual([]);
    expect(readStringArray({ a: 'x' }, 'a')).toEqual([]);
    expect(readStringArray({ a: null }, 'a')).toEqual([]);
  });
});
