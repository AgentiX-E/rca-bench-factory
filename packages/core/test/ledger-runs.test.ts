import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CI_ROW, ledgerRows, newestOf, readLedger, runsIn } from '../../../scripts/ledger-runs.mjs';

/**
 * The ledger's account of which run a round ended on, read as data.
 *
 * `R7` in `ci-budget.mjs` compares the recording against the newest run this reader finds,
 * so every case here is a case about the *comparison's reference*: which numbers count as
 * run ids, which rows count as closing readings, and what happens when the newest row
 * names none. A reader that silently returned the newest of five rows when the sixth named
 * no run would leave the recording unopposed while the gate stayed green -- which is the
 * defect the rule exists to refuse, so it is a case rather than a comment.
 */

/** A volume holding a heading and the rows the case wrote, with real line numbers. */
function volume(rows: string[]): string {
  return ['## v0.1 — a round', '', '> Ledger for `v0.1`.', '', ...rows, ''].join('\n');
}

const NAMED = '| CI | run `41670923224` on `61dff700c`: **7 of 7 jobs success** -- batteries 12.8 min |';

describe('which numbers are run ids', () => {
  it('reads a run id from a row that cites it', () => {
    expect(runsIn(NAMED)).toEqual([41670923224]);
  });

  it('reads every run id in a row, in the order they are written', () => {
    const row = '| CI | the split landed on `00b76ac83`, run `41658872002`; the refresh, run `41664998423` |';
    expect(runsIn(row)).toEqual([41658872002, 41664998423]);
  });

  it('does not read a commit as a run, because a commit is nine characters here', () => {
    // The rows name commits as nine-character hashes. A nine-digit number is nine digits,
    // which is why the pattern starts at ten -- and the case is worth having because the
    // two are written in the same backticks a few characters apart.
    expect(runsIn('| CI | on `123456789` at `abcdef012` |')).toEqual([]);
  });

  it('does not read a longer number as a run, because a run id is ten to twelve digits', () => {
    // A thirteen-digit token is not a run: the pattern would otherwise take its first
    // twelve digits and report a run that never existed, which is worse than silence.
    expect(runsIn('| CI | `1234567890123` |')).toEqual([]);
  });
});

describe('which rows are closing readings', () => {
  it('takes a row whose first cell is `CI`, and no other table row', () => {
    expect(CI_ROW.test('| CI | run `1` |')).toBe(true);
    expect(CI_ROW.test('| `core` test suite | 232 files |')).toBe(false);
    // The word is a cell, not a substring: a row about "CI minutes" is a row about
    // something else, and reading it as a closing reading would let any table steer `R7`.
    expect(CI_ROW.test('| CI minutes | 26 |')).toBe(false);
  });

  it('keeps a row that names no run, and says where it is', () => {
    // Three rows in the shipped log predate the convention. They are not refused -- naming
    // a run for them now would be inventing provenance -- but they are counted, because
    // what `R7` needs from the log is that its *newest* row names a run.
    const read = ledgerRows('volume-01.md', volume(['| CI | **five jobs green** on the fourth push |']));
    expect(read.rows).toEqual([]);
    expect(read.unnamed).toEqual([{ file: 'volume-01.md', line: 5, runs: [] }]);
    expect(read.tail).toEqual({ file: 'volume-01.md', line: 5, runs: [] });
  });

  it('reports the last row of the volume, whichever kind it is', () => {
    // The case the rule turns on: a named row followed by an unnamed one, where the
    // unnamed row is the round's own closing reading. Taking `rows.at(-1)` would answer
    // with the earlier row and compare the recording against a round that is not the last.
    const read = ledgerRows('volume-02.md', volume([NAMED, '| CI | a sixth job, `sensitivity` |']));
    expect(read.rows).toHaveLength(1);
    expect(read.unnamed).toHaveLength(1);
    expect(read.tail.line).toBe(6);
    expect(read.tail.runs).toEqual([]);
  });
});

describe('the newest run across volumes', () => {
  it('takes the maximum rather than the last, because a round may correct an older run', () => {
    expect(
      newestOf([
        { file: 'a.md', line: 1, runs: [41677264353] },
        { file: 'b.md', line: 9, runs: [41670923224] },
      ]),
    ).toEqual({ run: 41677264353, file: 'a.md', line: 1 });
  });

  it('is null when no row names a run, rather than zero', () => {
    // Zero would compare as older than every recording and pass; null says there was
    // nothing to compare, which is a sentence the gate can print.
    expect(newestOf([])).toBeNull();
  });
});

describe('reading a directory of volumes', () => {
  it('reads them in order and keeps the count of rows that name no run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rca-ledger-'));
    writeFileSync(join(dir, 'volume-01.md'), volume(['| CI | run `41658872002` |']));
    writeFileSync(join(dir, 'volume-02.md'), volume(['| CI | **five jobs green** |', '| CI | run `41670923224` |']));
    // A file that is not a volume is not a volume: the log's index lives beside them.
    writeFileSync(join(dir, 'notes.md'), '| CI | run `41999999999` |\n');
    const read = readLedger(dir);
    expect(read.read).toBe(true);
    expect(read.rows.map((row) => [row.file, row.runs[0]])).toEqual([
      ['volume-01.md', 41658872002],
      ['volume-02.md', 41670923224],
    ]);
    expect(read.unnamed).toEqual([{ file: 'volume-02.md', line: 5, runs: [] }]);
    expect(read.newest).toEqual({ run: 41670923224, file: 'volume-02.md', line: 6 });
  });

  it('says it read nothing when the directory is not there, rather than "no runs cited"', () => {
    // The two are different facts and the gate prints different sentences for them: a tree
    // with no ledger has nothing to be stale against, and a tree whose ledger was not read
    // has a question nobody asked.
    const read = readLedger(join(tmpdir(), 'rca-ledger-absent-directory'));
    expect(read).toEqual({ read: false, rows: [], unnamed: [], newest: null, tail: null });
  });

  it('carries the last row of the last volume that has one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rca-ledger-'));
    writeFileSync(join(dir, 'volume-01.md'), volume(['| CI | run `41658872002` |']));
    mkdirSync(join(dir, 'empty.md'), { recursive: true });
    writeFileSync(join(dir, 'volume-02.md'), volume(['### Readings', '', '| item | value |']));
    const read = readLedger(dir);
    expect(read.tail).toEqual({ file: 'volume-01.md', line: 5, runs: [41658872002] });
  });
});

describe('the shipped ledger', () => {
  it('names a run in its newest row, so the recording has something to be compared with', () => {
    // The invariant the round maintains rather than a fixture: after v3.49 the newest
    // closing reading is the run the recording was taken from, and the three rows that
    // predate the convention are counted rather than assumed away.
    const read = readLedger();
    expect(read.read).toBe(true);
    expect(read.tail).not.toBeNull();
    expect(read.tail?.runs.length).toBeGreaterThan(0);
    expect(read.newest).not.toBeNull();
  });
});
