import { describe, expect, it } from 'vitest';
import { isRecord, readString, readStringArray, renderJson, safeJson } from '../src/util/json.js';

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

  it('rejects an array even when it is non-empty', () => {
    // The array branch is the one that matters and the easiest to lose: an
    // `isRecord` that only checks `typeof value === 'object'` accepts arrays,
    // and the callers that reach for this helper are reading untrusted JSON
    // where "a list" and "an object" have different meanings. A keyed read on
    // an array returns `undefined` instead of failing, so the mistake would
    // resurface far from here.
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
    expect(isRecord([{ a: 1 }])).toBe(false);
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

/**
 * `renderJson` is the only thing that decides the bytes of every `.json` this
 * product emits, and four modules used to carry their own copy of the
 * expression. Those bytes are what the Golden Master anchors hash, so a change
 * here is a change to every exported artefact at once.
 *
 * The trailing newline in particular is not decoration. `git diff` reports a
 * missing final newline as a file-wide change, and text tools that read a file
 * as a sequence of lines cannot round-trip one that lacks it. It is also the
 * one character a careless edit drops without breaking anything visibly, which
 * is why it is asserted on its own rather than inferred from an equality with
 * `JSON.stringify`.
 */
describe('renderJson', () => {
  it('indents with two spaces', () => {
    expect(renderJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });

  it('ends the file with exactly one newline', () => {
    const text = renderJson({ a: 1 });
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('round-trips through safeJson', () => {
    // The writer and the reader share a module, so a change that broke one
    // without the other is exactly the pair that must be checked together.
    const value = { a: [1, 2], b: { c: 'x' } };
    expect(safeJson(renderJson(value))).toEqual(value);
  });

  it('renders a top-level array without losing the newline', () => {
    // An array is the shape a reader is most likely to re-serialize, so the
    // terminator must not depend on the value being an object.
    expect(renderJson([])).toBe('[]\n');
  });

  it('renders an empty object as two lines plus the newline', () => {
    expect(renderJson({})).toBe('{}\n');
  });
});
