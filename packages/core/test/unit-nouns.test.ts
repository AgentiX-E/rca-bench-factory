import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  censusOf,
  coincidencesOf,
  inventoryOf,
  keyOf,
  nounsIn,
  sharedNounsOf,
  summaryOf,
} from '../../../scripts/unit-nouns.mjs';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against the scripts the
 * spawn calls below actually reach, in both directions: a declaration nothing spawns and a spawn
 * nothing declares are both violations.
 */
const DRIVES = ['scripts/check-unit-nouns.mjs'];

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const scratch = mkdtempSync(join(tmpdir(), 'unit-nouns-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// The script's path is written in the spawn call rather than assembled from `ROOT`: rule 7 of
// `gate-sites-are-proven.test.ts` infers which scripts a test spawns from its source, and a path
// built out of three arguments is not a name that reader can see. The `cwd` is what makes the
// relative path the right one.
function run(args = []) {
  return spawnSync(process.execPath, ['scripts/check-unit-nouns.mjs', ...args], {
    encoding: 'utf8',
    cwd: ROOT,
  });
}

const GOLDEN = resolve(ROOT, 'golden-master', 'unit-nouns.json');

/**
 * `scripts/unit-nouns.mjs` and the gate that runs it -- the reader `O-091` asked for.
 *
 * ## The measurement this file rests on
 *
 * `O-091` said the guards "print counts under nouns no other guard shares". Measured, that half is
 * false: **nine nouns are printed by two or more gates**, and the count `8` is printed as `row(s)`
 * by two of them -- `check-fault-cases` counting the rows of a case's pre-injection window and
 * `check-repository-table` counting the rows under `## Repository`. Both lines are right. Four lines
 * apart in a CI log they read as one number printed twice, and nothing in the tree asked.
 *
 * That is finding 600 one level up: there, two gates printed *different* numbers for one word and a
 * reader had to reconcile them; here four gates print one word for four populations and the question
 * is whether they overlap at all. Finding 602 named the general form -- a comparison present in the
 * output is not a comparison anyone made -- and the repair is a reader.
 *
 * ## What is a test here and what cannot be
 *
 * The census is derivable; **what a coincidence means is not**. `1 addendum(s)` in `check-open-list`
 * and `check-progress-volumes` is one population read twice, because both take it from
 * `populationsOf`. `8 row(s)` in the other two is two tables and one noun, which no arithmetic
 * relates. The output cannot tell those apart, so the inventory records a sentence per coincidence
 * and this file proves that a coincidence without one is refused: a gate that answered the question
 * itself would be inventing the judgement it exists to ask for.
 */

describe('the unit-noun census reads the summaries it is given', () => {
  it('finds the noun and the count in front of it', () => {
    expect(nounsIn('check-open-list: 47 of 227 record(s) are in table form (318 row(s))')).toEqual([
      { noun: 'record(s)', count: 227 },
      { noun: 'row(s)', count: 318 },
    ]);
  });

  it('reads a two-word noun as one unit, because `row break(s)` is not a `break` beside a `row`', () => {
    expect(nounsIn('0 run(s) of Han prose, 817 row break(s) held inside a paragraph')).toEqual([
      { noun: 'run(s)', count: 0 },
      { noun: 'row break(s)', count: 817 },
    ]);
  });

  it('takes the total in front of a partition rather than the first number inside it', () => {
    // `94 (38+56) character(s)`: the noun counts 94, and reading the parenthetical would report the
    // narrower of two values under the wider name (finding 595).
    expect(nounsIn('... 94 (38+56) character(s) of an answer')).toEqual([{ noun: 'character(s)', count: 94 }]);
  });

  it('reports a noun with no number in front of it as unread rather than as zero', () => {
    expect(nounsIn('the record(s) are in table form')).toEqual([{ noun: 'record(s)', count: null }]);
  });

  it('keeps one gate\'s several uses of a noun apart, because they answer different questions', () => {
    const census = censusOf([
      { gate: 'a', text: '318 row(s) in the tables; 1 row(s) were judged' },
      { gate: 'b', text: '8 row(s) under ## Repository' },
    ]);
    expect([...census.get('row(s)').get('a')]).toEqual([318, 1]);
    expect([...census.get('row(s)').get('b')]).toEqual([8]);
  });

  it('counts a noun as shared only when two gates print it', () => {
    const census = censusOf([
      { gate: 'a', text: '9 row(s); 602 finding(s)' },
      { gate: 'b', text: '8 row(s)' },
    ]);
    expect(sharedNounsOf(census)).toEqual([{ noun: 'row(s)', gates: ['a', 'b'] }]);
  });
});

describe('a coincidence is a count two gates print, and zero is not one', () => {
  it('names the count and the gates, for two gates that print it', () => {
    const census = censusOf([
      { gate: 'check-fault-cases', text: '8 row(s) of the window' },
      { gate: 'check-repository-table', text: '8 row(s) under ## Repository' },
    ]);
    expect(coincidencesOf(census)).toEqual([
      { noun: 'row(s)', count: 8, gates: ['check-fault-cases', 'check-repository-table'] },
    ]);
  });

  it('leaves zero out, because every gate that found nothing prints one', () => {
    const census = censusOf([
      { gate: 'a', text: '0 run(s) of Han prose' },
      { gate: 'b', text: '0 run(s) of Han prose' },
      { gate: 'c', text: '0 run(s) of Han prose' },
    ]);
    expect(coincidencesOf(census)).toEqual([]);
  });

  it('leaves one gate printing a count twice out, because that is two clauses and not two populations', () => {
    const census = censusOf([{ gate: 'a', text: '6 run(s) up; 6 run(s) down' }]);
    expect(coincidencesOf(census)).toEqual([]);
  });

  it('says what a coincidence means, from the judgement rather than from the counts', () => {
    const census = censusOf([
      { gate: 'a', text: '8 row(s)' },
      { gate: 'b', text: '8 row(s)' },
    ]);
    const summary = summaryOf(census, new Map([[keyOf({ noun: 'row(s)', gates: ['a', 'b'] }), 'two tables and one noun']]));
    expect(summary).toContain('8 row(s) in a and b (two tables and one noun)');
    // And a coincidence nobody has read says so, rather than being described as an ambiguity the
    // reader has not established.
    expect(summaryOf(census)).toContain('8 row(s) in a and b (unclassified)');
  });

  it('identifies a coincidence by its noun and its gates, not by the number it happens to be', () => {
    // `474 file(s)` this round and `473` last round are the same coincidence: two gates print one
    // number for two populations. A judgement keyed by the number would go stale every time a
    // source file was added, and its repair would be to retype a sentence that had not stopped
    // being true.
    expect(keyOf({ noun: 'file(s)', gates: ['a', 'b'], count: 473 })).toBe('file(s)::a+b');
    expect(keyOf({ noun: 'file(s)', gates: ['a', 'b'], count: 474 })).toBe('file(s)::a+b');
  });

  it('commits the vocabulary and the coincidences, and never the counts', () => {
    const census = censusOf([
      { gate: 'a', text: '9 row(s); 471 file(s)' },
      { gate: 'b', text: '8 row(s); 6 file(s)' },
    ]);
    const inventory = inventoryOf(census);
    expect(JSON.stringify(inventory)).not.toContain('471');
    expect(JSON.stringify(inventory)).not.toContain('9,');
    expect(inventory.shared.map((one) => one.noun)).toEqual(['file(s)', 'row(s)']);
    expect(inventory.coincidences).toEqual([]);
  });
});

describe('the gate holds the shipped inventory to the shipped gates', () => {
  // The one case that reads the shipped tree, and the only expensive one: the census spawns the
  // eighteen gates, which is 2.5 s on an idle machine. Under `verify-site-proofs` every child also
  // carries the exit hook, which writes to one trace file, and the same run takes long enough to
  // hit vitest's five-second default -- a timeout that would report the gate as unproven rather
  // than as slow. The budget is declared here rather than in a config, because it is this case
  // that costs it.
  it('agrees with the tree it is run against, and prints the coincidences it found', () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    // The sentence a reader gets. `8 row(s)` twice is the finding, and it is named on every run
    // rather than recorded in a document someone has to know to open.
    expect(result.stdout).toContain('8 row(s) in check-fault-cases and check-repository-table (two tables and one noun');
    expect(result.stdout).toContain('unit noun(s)');
    expect(result.stdout).toMatch(/\d+ of them are printed by more than one gate/);
  }, 120_000);

  // The three refusals below hand the gate a recorded census instead of running eighteen gates.
  // `--readings` is the fixture door: the refusal is about what the gate does with a document, and
  // re-deriving the shipped one four times over costs four suites' worth of processes for a fact
  // the first case above has already established.
  const RECORDED = join(scratch, 'readings.json');
  writeFileSync(
    RECORDED,
    JSON.stringify([
      { gate: 'check-fault-cases', text: 'check-fault-cases: 8 row(s) of the window; 602 finding(s)' },
      { gate: 'check-repository-table', text: 'check-repository-table: OK (8 row(s) under ## Repository)' },
      { gate: 'check-open-list', text: 'check-open-list: 318 row(s) in the tables' },
    ]),
  );

  it('refuses an inventory whose vocabulary has stopped describing the gates', () => {
    const committed = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    const narrowed = {
      ...committed,
      nouns: committed.nouns.filter((one) => one.noun !== 'row(s)'),
    };
    const path = join(scratch, 'narrowed.json');
    writeFileSync(path, JSON.stringify(narrowed, null, 2));
    const result = run(['--inventory', path, '--readings', RECORDED]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('row(s) is new, printed by check-fault-cases,check-open-list');
    expect(result.stderr).toContain('read the diff');
  });

  it('refuses a coincidence nobody has said is either one population or two', () => {
    const committed = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    const unread = {
      ...committed,
      coincidences: committed.coincidences.map((one) => ({ ...one, reading: null })),
    };
    const path = join(scratch, 'unread.json');
    writeFileSync(path, JSON.stringify(unread, null, 2));
    const result = run(['--inventory', path, '--readings', RECORDED]);
    expect(result.status).toBe(1);
    // The count is in the message, and so is what to do about it: `--write` cannot answer this.
    expect(result.stderr).toContain('no record says whether that is one population or two');
    expect(result.stderr).toContain('8 row(s) in check-fault-cases and check-repository-table');
    expect(result.stderr).toContain('no derivation can make it');
  });

  it('refuses to run with no inventory at all, and names the file it wanted', () => {
    const result = run(['--inventory', join(scratch, 'absent.json'), '--readings', RECORDED]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is missing, so the vocabulary has no record');
  });
});
