/**
 * The suite vocabulary is declared once and read everywhere.
 *
 * The defect this closes: `cli/args.ts` kept its own comparison set for the
 * `--suite` flag, deliberately widened to `readonly string[]`, so the compiler
 * was blind to it drifting from `RcaEvalSuite`. Dropping `RE3`, or misspelling
 * it `RE4`, left the whole suite green -- while a user typing `--suite RE3`
 * would be told the suite is invalid, even though `rcaeval-re3` remains a valid
 * score target and the RE3 exporter path remains reachable through it.
 *
 * A comparison set is not a placeholder list: a drift in it changes which
 * commands the CLI accepts, and therefore which benchmark contracts the tool
 * can produce. These tests walk the seam in both directions, so a vocabulary
 * that gains or loses a member fails here rather than in a user's terminal.
 *
 * Lower and upper case are both exercised because the parser capitalises the
 * caller's input before comparing it (`args.ts`, `parseExport`), which is a
 * second, independent way for the set and the parser to disagree.
 */

import { describe, expect, it } from 'vitest';

import { parseCliArgs, formatCommandHelp } from '../src/cli/args.js';
import { RCAEVAL_SUITES, type RcaEvalSuite } from '../src/export/rcaeval.js';

const SUITE_IDS = [...RCAEVAL_SUITES];

describe('the RCAEval suite vocabulary has one source', () => {
  it('is exactly the three suites the benchmark defines', () => {
    // An exhaustive pin, not a membership check: an accidental *addition* is
    // as much a defect as a removal, and only equality catches both.
    expect(SUITE_IDS).toEqual(['RE1', 'RE2', 'RE3']);
  });

  it('lists each suite exactly once', () => {
    expect(new Set(SUITE_IDS).size).toBe(SUITE_IDS.length);
  });

  it('spells every member in upper case', () => {
    // The parser upper-cases before comparing, so a lower-case member could
    // never be matched and would be dead on arrival.
    for (const suite of SUITE_IDS) expect(suite).toBe(suite.toUpperCase());
  });
});

describe('every suite in the vocabulary is accepted by --suite', () => {
  it.each(SUITE_IDS)('accepts --suite %s as given', (suite) => {
    const result = parseCliArgs([
      'export',
      '--target',
      'rcaeval',
      '--suite',
      suite,
      '--input',
      'b.json',
      '--out-dir',
      './out',
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command).toEqual({
      command: 'export',
      target: 'rcaeval',
      suite,
      input: 'b.json',
      outDir: './out',
    });
  });

  it.each(SUITE_IDS)('accepts --suite %s in lower case too', (suite) => {
    // `--suite re2` must mean the same thing as `--suite RE2`; the parser is
    // case-insensitive on input but the stored value is canonical.
    const result = parseCliArgs([
      'export',
      '--target',
      'rcaeval',
      '--suite',
      suite.toLowerCase(),
      '--input',
      'b.json',
      '--out-dir',
      './out',
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const command = result.command as { command: 'export'; suite?: RcaEvalSuite };
    expect(command.suite).toBe(suite);
  });
});

describe('the help text and the comparison set name the same suites', () => {
  /**
   * The placeholder rendered for `--suite` is built from the same list the
   * parser compares against, so reading it back is how this test observes the
   * comparison set without restating it.
   */
  function suitePlaceholder(): string[] {
    const match = formatCommandHelp('export').match(/--suite <([^>]+)>/);
    if (match === null) throw new Error('export help does not advertise a --suite placeholder');
    return (match[1] as string).split('|');
  }

  it('advertises exactly the vocabulary, in declaration order', () => {
    expect(suitePlaceholder()).toEqual(SUITE_IDS);
  });

  it('advertises nothing the parser would reject', () => {
    for (const suite of suitePlaceholder()) {
      expect(
        parseCliArgs([
          'export',
          '--target',
          'rcaeval',
          '--suite',
          suite,
          '--input',
          'b.json',
          '--out-dir',
          './out',
        ]).ok,
      ).toBe(true);
    }
  });
});
