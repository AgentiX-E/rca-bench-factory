import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  absentNumbers,
  citationsIn,
  dangling,
  headingsOf,
} from '../../../scripts/audit-citations.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The gate this file drives, declared as well as spawns.
 *
 * The inventory cross-checks the two accounts: a test that spawns a script must also name
 * it here, so the site's proof cannot rest on a path that drifts.
 */
export const DRIVES = ['scripts/check-citations.mjs'];

const file = (label: string, text: string) => ({ label, text });

describe('a citation of a finding resolves to a heading, or it does not', () => {
  it('reads the heading forms the log uses, and only those', () => {
    const numbers = headingsOf([
      file('a', '## Finding 1 — first\n\n## Finding 2 -- second\n\n### Finding 3\n\n## Findings 4\n'),
    ]);
    // `### Finding 3` is a subsection and `## Findings 4` is a different word; neither
    // names a finding, and a scan that accepted them would resolve citations to nothing.
    expect([...numbers].sort()).toEqual([1, 2]);
  });

  it('reads a citation in every spelling the prose uses', () => {
    const found = citationsIn(
      file('a', ['finding 46 is cited here.', 'Finding 39 too.', 'and findings 1–42 as a range.'].join('\n')),
    );
    expect(found.map((one) => one.number)).toEqual([46, 39, 1]);
    // The line number is carried because a repair edits one sentence, and "somewhere in
    // 1.6 MB" is not a place.
    expect(found.map((one) => one.where)).toEqual(['a:1', 'a:2', 'a:3']);
  });

  it('keeps the sentence, not the paragraph, as the context', () => {
    // The audit log's paragraphs run to fifteen lines; a context field that long would be
    // pasted into a diagnostic nobody reads.
    const found = citationsIn(file('a', 'One thing happened. Then closed by finding 170. And more.'));
    expect(found[0]?.sentence).toBe('Then closed by finding 170');
  });

  it('refuses a citation that names no heading, and says where it is', () => {
    const headings = headingsOf([file('a', '## Finding 1 — one\n## Finding 3 — three\n')]);
    const citations = citationsIn(file('b', 'see finding 2 and finding 3\n'));
    const result = dangling(citations, headings);
    expect(result.dangling.map((one) => one.number)).toEqual([2]);
    expect(result.dangling[0]?.where).toBe('b:1');
    expect(result.numbers).toEqual([2]);
  });

  it('counts one bad number once and its citations separately', () => {
    // Two different questions: the numbers are what a summary prints, the citations are
    // what a repair edits. One bad number cited three times is one number and three
    // places.
    const headings = headingsOf([file('a', '## Finding 1 — one\n')]);
    const citations = citationsIn(file('b', 'finding 9\nfinding 9\nfinding 9\n'));
    const result = dangling(citations, headings);
    expect(result.dangling).toHaveLength(3);
    expect(result.numbers).toEqual([9]);
  });

  it('prints the holes in the sequence, including ones nothing cites', () => {
    // 132 is a hole no sentence mentions; 118 and 133 are holes that were cited until this
    // round repaired them. A hole with no citation is invisible, so it is printed; a hole
    // with a citation is refused, by `dangling`.
    expect(absentNumbers(new Set([1, 2, 4, 5]))).toEqual([3]);
    expect(absentNumbers(new Set())).toEqual([]);
    const shipped = headingsOf([file('a', '## Finding 5 — five\n')]);
    expect(absentNumbers(shipped)).toEqual([1, 2, 3, 4]);
  });

  it('is silent on the shipped corpus, which is the only claim worth making about it', () => {
    // A measurement of the real thing: 977 citations, 201 numbers, none dangling. The
    // number of citations is not asserted -- every round adds prose -- but the verdict and
    // the shape of the line are, because a scan that matched nothing would print zero
    // citations and read as a clean run.
    const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts', 'check-citations.mjs')], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain('FAILED');
    expect(result.status).toBe(0);
    const summary = /check-citations: OK \((\d+) citation\(s\) of (\d+) number\(s\) across (\d+) file\(s\)/;
    const match = summary.exec(result.stdout);
    expect(match, `the summary changed shape: ${result.stdout}`).not.toBeNull();
    const [, citations, numbers, files] = (match ?? []).map(Number);
    expect(citations).toBeGreaterThan(500);
    expect(numbers).toBeGreaterThan(150);
    expect(files).toBeGreaterThanOrEqual(11);
    // The three holes are named, so a reader of the verdict knows the sequence is not
    // dense and which numbers are missing.
    expect(result.stdout).toContain('118');
    expect(result.stdout).toContain('133');
  });
});
