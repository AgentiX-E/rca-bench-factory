import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SIZE,
  SIZE_UNITS,
  grouped,
  inKilobytes,
  measurementOf,
  sizesIn,
  spansIn,
  statesSameSize,
  subjectOf,
  sizeProblems,
  toleranceOf,
} from '../../../scripts/live-figures.mjs';

/**
 * The live list's sizes, and the one thing each of them must carry.
 *
 * The defect is `O-019`: an entry arguing that `docs/acceptance.md` is too big to keep
 * growing, quoting `96 KB` for a file that is 165,067 bytes. The figure was a copy of a
 * measurement taken nineteen rounds earlier, and nothing read the sentence -- the guard
 * that owns the list reads an entry's **state** (open, closed, by which authority) and
 * never its numbers. Finding 620 repaired the same shape in the census next door.
 *
 * These tests hold the two halves of the rule apart on purpose: the **reader** (what counts
 * as a size, what counts as a date) and the **gate** (which list it applies to, and what a
 * refusal says). A test that merged them could not say which half a failure came from.
 */

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-open-list.mjs');

const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** The guard, run against a document written to a temp file. */
function runOn(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'live-figures-'));
  dirs.push(dir);
  const doc = join(dir, 'progress.md');
  writeFileSync(doc, body);
  const result = spawnSync('node', [SCRIPT, '--doc', doc], { cwd: ROOT, encoding: 'utf8' });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

/** The reason every fixture entry carries, long enough to pass the rule that demands one. */
const REASON = '[open: a reason long enough to be one of these, and long enough to pass the length rule]';

/** A document whose `## Open` holds one entry, with the stamp the list is required to carry. */
function liveWith(text: string): string {
  return `## Headline\n\ntext\n\n## Open\n\n- O-001 · ${text} ${REASON}\n\n## Pass log\n\nbody\n`;
}

/** A document whose `## Open` holds a lead-in paragraph before its one entry. */
function liveWithLeadIn(text: string): string {
  return `## Headline\n\ntext\n\n## Open\n\n${text}\n\n- O-001 · A residual. [open: a reason long enough to be one of these]\n\n## Pass log\n\nbody\n`;
}

/** The measurement the tests compare against, as the guard takes it: a name, or nothing. */
const table = new Map([
  ['docs/big.md', { bytes: 165_067, lines: 2_021 }],
  ['docs/small.md', { bytes: 96 * 1024, lines: 12 }],
]);
const measure = (path: string) => table.get(path) ?? null;

describe('the figures a live entry may state', () => {
  it('reads a size in each of the four units a commit can take again', () => {
    expect(sizesIn('the file is 96 KB').map((one) => [one.stated, one.unit])).toEqual([[96, 'KB']]);
    expect(sizesIn('it holds 165,067 bytes').map((one) => [one.stated, one.unit])).toEqual([[165_067, 'bytes']]);
    expect(sizesIn('a 17,846-line history').map((one) => [one.stated, one.unit])).toEqual([[17_846, 'line']]);
    expect(sizesIn('868 lines of it').map((one) => [one.stated, one.unit])).toEqual([[868, 'lines']]);
    expect(sizesIn('about 1.6 MB').map((one) => [one.stated, one.unit])).toEqual([[1.6, 'MB']]);
  });

  it('keeps the figure as the sentence wrote it, wrapping and all', () => {
    // A refusal quotes; it does not paraphrase. The corpus wraps its lines mid-figure --
    // `65,544 of 98,927` then `bytes` on the next line -- and a quote that carried the
    // newline would print a table row in three pieces.
    const [figure] = sizesIn('**65,544 of 98,927\nbytes** by v3.110');
    expect(figure?.written).toBe('98,927 bytes');
  });

  it('reads no numeral that belongs to a name', () => {
    // Finding 620's lexical rule, and the reason it is lexical: a list of names to exempt is
    // a list to keep equal to the corpus.
    expect(sizesIn('`check-l4-status` reads the L4 registry at v3.129')).toEqual([]);
    expect(sizesIn('the ceiling is 2.0x the day')).toEqual([]);
    expect(sizesIn('it took 439 s and 84 minutes')).toEqual([]);
  });

  it('reads a figure with no date as undated, and one that names a round as a record', () => {
    expect(sizesIn('the file is 165,067 bytes').map((one) => one.dated)).toEqual([false]);
    expect(sizesIn('it is **161.2 KB at v3.131**').map((one) => one.dated)).toEqual([true]);
    expect(sizesIn('96 KB (as of `2aed8ce`)').map((one) => one.dated)).toEqual([true]);
    // `by` is not `at`: a figure "by" a round is a figure the sentence does not date.
    expect(sizesIn('98,927 bytes by v3.110').map((one) => one.dated)).toEqual([false]);
  });

  it('does not read a figure inside a quotation, because that is another document speaking', () => {
    // `O-101` could not report `O-019`'s 96 KB without quoting it, and a guard that refused
    // the quotation would refuse the report.
    expect(sizesIn('`O-019` says "the file is 96 KB and grows"')).toEqual([]);
    expect(sizesIn('the entry says “96 KB” and is wrong')).toEqual([]);
    // ...and a figure outside the marks is read, so the exemption is the quotation and not
    // the sentence.
    expect(sizesIn('the entry says "96 KB" but the file is 165,067 bytes').map((one) => one.stated)).toEqual([
      165_067,
    ]);
  });

  it('reads the figure of a reason, which is the entry\'s own evidence', () => {
    expect(sizesIn('`[open: the per-round clauses are 868 lines of history]`').map((one) => one.stated)).toEqual([
      868,
    ]);
  });
});

describe('the window of a figure, and what a rounded number promises', () => {
  it('reads the date only in the short window after the figure', () => {
    // A date far away belongs to another clause, and accepting it would let one `at v3.131`
    // date every figure in a paragraph.
    const far = `96 KB${' and more words'.repeat(6)} at v3.131`;
    expect(sizesIn(far)[0]?.dated).toBe(false);
  });

  it('takes half a unit in the last place the figure states', () => {
    expect(toleranceOf(96, 1024)).toBe(512);
    expect(toleranceOf(161.2, 1024)).toBeCloseTo(51.2, 5);
    expect(toleranceOf(165_067, 1)).toBe(0.5);
  });

  it('accepts a size that is the file\'s, and refuses one that is not', () => {
    const [kilobytes] = sizesIn('161.2 KB');
    const [bytes] = sizesIn('165,067 bytes');
    const [stale] = sizesIn('96 KB');
    expect(statesSameSize(kilobytes, 165_067)).toBe(true);
    expect(statesSameSize(bytes, 165_067)).toBe(true);
    // One byte out is out: a whole-byte figure promises a byte.
    expect(statesSameSize(bytes, 165_068)).toBe(false);
    expect(statesSameSize(stale, 165_067)).toBe(false);
  });

  it('counts lines rather than converting them', () => {
    const [lines] = sizesIn('2,021 lines');
    expect(statesSameSize(lines, 2_021)).toBe(true);
    expect(statesSameSize(lines, 2_022)).toBe(false);
  });

  it('measures a text the way a reader would state it', () => {
    expect(measurementOf('a\nb\nc\n')).toEqual({ bytes: 6, lines: 3 });
    expect(measurementOf('a\nb\nc')).toEqual({ bytes: 5, lines: 3 });
    expect(measurementOf('')).toEqual({ bytes: 0, lines: 0 });
  });

  it('writes a size the way the corpus writes one', () => {
    expect(grouped(165_067)).toBe('165,067');
    expect(grouped(868)).toBe('868');
    expect(inKilobytes(165_067)).toBe('161.2 KB');
  });
});

describe('which document a figure is the size of', () => {
  it('takes the nearest code span before it, in the same sentence', () => {
    const text = '`docs/big.md` is 96 KB';
    const figure = sizesIn(text)[0];
    expect(subjectOf(text, figure.start, measure)?.path).toBe('docs/big.md');
  });

  it('refuses to pair a figure with a name across a sentence boundary', () => {
    // `O-019`'s own shape: `L3 is 284 lines` follows a sentence that names the document, and
    // pairing them would compare a section's length with the file's -- a refusal whose repair
    // would be wrong. The full stop sits inside a bold mark, which is why the boundary
    // pattern allows the marks.
    const text = '**`docs/big.md` is 96 KB.** L3 is 284 lines';
    const figure = sizesIn(text)[1];
    expect(subjectOf(text, figure.start, measure)).toBeNull();
  });

  it('returns nothing when the name is not a file of this tree', () => {
    const text = 'the corpus pins (`openrca-2.0`, 962,086 bytes)';
    const figure = sizesIn(text)[0];
    expect(subjectOf(text, figure.start, measure)).toBeNull();
  });

  it('returns nothing when the sentence names no file at all', () => {
    const text = 'the per-round clauses are 868 lines';
    expect(subjectOf(text, sizesIn(text)[0].start, measure)).toBeNull();
  });

  it('reads spans in the order they are written', () => {
    expect(spansIn('`a` then `b`').map((one) => one.path)).toEqual(['a', 'b']);
  });
});

describe('what a live entry is told to do about a size', () => {
  it('names the file and the size it has, for a figure that has aged', () => {
    const problems = sizeProblems({ id: 'O-019', text: '`docs/big.md` is 96 KB' }, measure);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('O-019 states `96 KB` for `docs/big.md`');
    expect(problems[0]).toContain('165,067 bytes at this commit (161.2 KB)');
    expect(problems[0]).toContain('96 KB at vX.YY');
  });

  it('asks for the round rather than a value, when the sentence names nothing to measure', () => {
    const problems = sizeProblems({ id: 'O-019', text: 'the per-round clauses are 868 lines' }, measure);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('names neither a file this tree holds nor the round that measured it');
    expect(problems[0]).toContain('868 lines at vX.YY');
  });

  it('says an entry rather than inventing a name, when the text carries none', () => {
    const problems = sizeProblems({ text: '96 KB of prose' }, measure);
    expect(problems[0]).toContain('an entry states `96 KB`');
  });

  it('accepts a figure that is the file\'s, and one that carries a round', () => {
    expect(sizeProblems({ id: 'O-1', text: '`docs/big.md` is 161.2 KB' }, measure)).toEqual([]);
    expect(sizeProblems({ id: 'O-1', text: '`docs/big.md` is 96 KB at v3.131' }, measure)).toEqual([]);
  });

  it('compares a length with the file\'s lines and not its bytes', () => {
    // The two subjects are different measurements of one file, and a guard that compared a
    // line count with a byte count would refuse every length and pass none of them.
    expect(sizeProblems({ id: 'O-1', text: '`docs/big.md` is 2,021 lines' }, measure)).toEqual([]);
    const problems = sizeProblems({ id: 'O-1', text: '`docs/big.md` is 165,067 lines' }, measure);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('2,021 lines at this commit');
  });

  it('reports every figure the entry states, in the order it states them', () => {
    const problems = sizeProblems({ id: 'O-019', text: '`docs/big.md` is 96 KB; the clauses are 139 lines' }, measure);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('96 KB');
    expect(problems[1]).toContain('139 lines');
  });
});

describe('the guard reads the live list and no other', () => {
  it('refuses a size that has aged, and says what the file is now', () => {
    const r = runOn(liveWith('**`docs/acceptance.md` is 96 KB and grows by clause per round.**'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('O-001 states `96 KB` for `docs/acceptance.md`');
    expect(r.out).toContain('bytes at this commit');
  });

  it('passes a figure that carries the round that took it', () => {
    // The escape is a date and not the current size, because the file grows in most rounds
    // and a rule demanding this commit's size would be red on every round that wrote one.
    const r = runOn(liveWith('**`docs/acceptance.md` is 96 KB at v3.131.**'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 name the round that took them');
  });

  it('passes a figure that is the file\'s size at this commit', () => {
    // Measured rather than pinned: the fixture names a file of the tree, and the test reads
    // the size it has, so the case cannot rot when the file changes.
    const path = join(ROOT, 'golden-master', 'unit-nouns.json');
    const size = statSync(path).size;
    const r = runOn(liveWith(`**\`golden-master/unit-nouns.json\` is ${size} bytes.**`));
    expect(r.code).toBe(0);
    expect(r.out).toContain('are what this tree measures');
  });

  it('reads the lead-in of the section, not only the entries under it', () => {
    // The paragraph that says what the split cost held `65,544 of 98,927 bytes`, which is the
    // same count-in-prose the entries were refused for. A rule scoped to bullets would have
    // left the text above them unread (finding 162's shape, one level in).
    const r = runOn(liveWithLeadIn('**This is the only live list.** The split moved 65,544 of 98,927 bytes.'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('the `## Open` lead-in states `98,927 bytes`');
  });

  it('does not read a record\'s figures, because a record is frozen', () => {
    // The record's row quotes the live entry (the row rule demands it) and carries a stale
    // size of its own. Demanding a date of it would be demanding an edit of a frozen round.
    const body =
      '## v3.62 -- a round\n\nbody\n\n## Open\n\n' +
      `- O-001 · **The residual about the size of the file.** ${REASON}\n\n` +
      'Checked at v3.63: **1** entry open.\n\n' +
      '## Pass log\n\nbody\n';
    const record =
      '## v3.63 -- another round\n\n### Left open\n\n' +
      `- **The residual about the size of the file is 96 KB** as measured then. ${REASON}\n`;
    const r = runOn(`${body}\n${record}`);
    expect(r.code).toBe(0);
    expect(r.out).toContain('the live list states 0 size(s) and length(s)');
  });

  it('prints the population it read, so a guard that reads nothing is visible', () => {
    const r = runOn(liveWith('**`docs/acceptance.md` is 96 KB at v3.131.**'));
    expect(r.out).toContain('the live list states 1 size(s) and length(s): 1 name the round');
  });
});

describe('the vocabulary is closed, and says so', () => {
  it('holds the four units a commit can take again', () => {
    expect([...SIZE_UNITS.keys()]).toEqual(['byte', 'bytes', 'KB', 'kB', 'MB', 'line', 'lines']);
    expect(SIZE_UNITS.get('lines')).toBeNull();
    expect(SIZE_UNITS.get('MB')).toBe(1024 * 1024);
  });

  it('is the pattern the reader actually uses', () => {
    // The export exists so a test can read the shape the module reads with; a copy of it here
    // would agree with the copy and not with the reader.
    const text = '96 KB, 2 lines, 1.5 MB';
    expect([...text.matchAll(SIZE)].map((one) => one[2])).toEqual(['KB', 'lines', 'MB']);
  });
});
