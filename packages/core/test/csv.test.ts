import { describe, expect, it } from 'vitest';
import { csvColumn, parseCsvObjects, parseCsvRows } from '../src/util/csv.js';

/**
 * CSV reader tests.
 *
 * The reader exists because the official OpenRCA `scoring_points` field embeds
 * commas, quotes and newlines inside one CSV cell. These tests pin every
 * RFC 4180 rule that field depends on, so a regression here cannot silently
 * corrupt a ground truth.
 */

describe('parseCsvRows', () => {
  it('parses a header and one row', () => {
    expect(parseCsvRows('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('does not emit a trailing row for a trailing newline', () => {
    expect(parseCsvRows('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsvRows('a,b\n"1,000",2')).toEqual([
      ['a', 'b'],
      ['1,000', '2'],
    ]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsvRows('a,b\n"line1\nline2",2')).toEqual([
      ['a', 'b'],
      ['line1\nline2', '2'],
    ]);
  });

  it('unescapes a doubled quote into one literal quote', () => {
    expect(parseCsvRows('a,b\n"say ""hi""",2')).toEqual([
      ['a', 'b'],
      ['say "hi"', '2'],
    ]);
  });

  it('accepts CRLF line endings', () => {
    expect(parseCsvRows('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps an empty field as an empty string', () => {
    expect(parseCsvRows('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('returns an empty row for empty text', () => {
    expect(parseCsvRows('')).toEqual([]);
  });

  it('ends the final row even without a trailing newline', () => {
    expect(parseCsvRows('a\n1\n2')).toEqual([['a'], ['1'], ['2']]);
  });

  it('keeps a quoted empty field distinct from an unquoted one', () => {
    expect(parseCsvRows('a,b\n"",x')).toEqual([
      ['a', 'b'],
      ['', 'x'],
    ]);
  });

  it('does not treat a quote in the middle of a field as a quote opener', () => {
    expect(parseCsvRows('a\n5" pipe')).toEqual([['a'], ['5" pipe']]);
  });
});

describe('parseCsvObjects', () => {
  it('keys rows by the header', () => {
    expect(parseCsvObjects('a,b\n1,2\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('pads short rows with empty strings', () => {
    expect(parseCsvObjects('a,b,c\n1')).toEqual([{ a: '1', b: '', c: '' }]);
  });

  it('returns no records when there is no header', () => {
    expect(parseCsvObjects('')).toEqual([]);
  });

  it('reads a multi-line quoted field as one value', () => {
    const csv = 'task_index,instruction,scoring_points\ntask_7,find it,"one\ntwo"\n';
    expect(parseCsvObjects(csv)[0]?.scoring_points).toBe('one\ntwo');
  });
});

describe('csvColumn', () => {
  it('reads one column across rows', () => {
    expect(csvColumn('a,b\n1,2\n3,4', 'b')).toEqual(['2', '4']);
  });

  it('yields an empty string for a column that does not exist', () => {
    expect(csvColumn('a\n1\n2', 'zzz')).toEqual(['', '']);
  });
});
