import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  UNSTATED,
  censusOf,
  coincidencesOf,
  inventoryOf,
  keyOf,
  nounsIn,
  numbersOf,
  relationsOf,
  sharedNounsOf,
  summaryOf,
  unreadableOf,
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
 * ## What the first version of that reader got wrong (findings 609 to 611)
 *
 * It printed the gates' **names** and never their numbers: `volume(s) by 2`, where one gate prints
 * `14 volume(s)` and the other `18`, forty lines apart in the same log. A reader of the census
 * alone could not see that the two numbers differ, let alone whether the two fourteens are the same
 * volumes. And it could not have seen the other pair even with the numbers printed, because `BEFORE`
 * demanded a number immediately before the noun and both gates write `` 219 `vX.YY` round(s) `` --
 * the qualifier finding 600's repair inserted is a wall the reader finding 607's repair cannot see
 * past. `round(s)` was therefore listed as shared by two gates with no count under it at all, and
 * `219` against `219` -- a real coincidence -- was invisible.
 *
 * ## What is a test here and what cannot be
 *
 * The census is derivable; **what a shared noun means is not**. `1 addendum(s)` in `check-open-list`
 * and `check-progress-volumes` is one population read twice, because both take it from
 * `populationsOf`. `8 row(s)` in the other two is two tables and one noun, which no arithmetic
 * relates. `14 volume(s)` and `18 volume(s)` are two disjoint directories. The output cannot tell
 * those apart, so the inventory records a sentence per shared noun and this file proves that one
 * without a sentence is refused: a gate that answered the question itself would be inventing the
 * judgement it exists to ask for.
 */

describe('the unit-noun census reads the summaries it is given', () => {
  it('finds the noun and the count in front of it', () => {
    expect(nounsIn('check-open-list: 47 of 227 record(s) are in table form (318 row(s))')).toEqual([
      { noun: 'record(s)', count: 227, qualifier: null },
      { noun: 'row(s)', count: 318, qualifier: null },
    ]);
  });

  it('reads a two-word noun as one unit, because `row break(s)` is not a `break` beside a `row`', () => {
    expect(nounsIn('0 run(s) of Han prose, 817 row break(s) held inside a paragraph')).toEqual([
      { noun: 'run(s)', count: 0, qualifier: null },
      { noun: 'row break(s)', count: 817, qualifier: null },
    ]);
  });

  it('takes the total in front of a partition rather than the first number inside it', () => {
    // `94 (38+56) character(s)`: the noun counts 94, and reading the parenthetical would report the
    // narrower of two values under the wider name (finding 595).
    expect(nounsIn('... 94 (38+56) character(s) of an answer')).toEqual([
      { noun: 'character(s)', count: 94, qualifier: '(38+56)' },
    ]);
  });

  it('reaches past a qualifier to the number it qualifies, and keeps the qualifier', () => {
    // Finding 610: `219 `vX.YY` round(s)` and `50 `Pass` round(s)` are two lines of one summary, and
    // a reader that stops at the backtick reports neither. The qualifier is not decoration -- it is
    // the word that says which round the number counts, and printing `219, 50` without it is
    // finding 600 committed by the reader that finding 607 added.
    expect(nounsIn('272 heading(s): 219 `vX.YY` round(s), 1 addendum(s), 50 `Pass` round(s)')).toEqual([
      { noun: 'heading(s)', count: 272, qualifier: null },
      { noun: 'round(s)', count: 219, qualifier: '`vX.YY`' },
      { noun: 'addendum(s)', count: 1, qualifier: null },
      { noun: 'round(s)', count: 50, qualifier: '`Pass`' },
    ]);
  });

  it('reads a quoted character as a qualifier too, because it is the same shape', () => {
    // `1248 '#' mark(s)`: the number is the mark count and the `'#'` says which mark. A reader that
    // handled only backticks would report this as a noun with no number, which is the class this
    // round is about arriving through a different quote.
    expect(nounsIn("6 file(s), 1248 '#' mark(s)")).toEqual([
      { noun: 'file(s)', count: 6, qualifier: null },
      { noun: 'mark(s)', count: 1248, qualifier: "'#'" },
    ]);
  });

  it('reports a noun with no number in front of it as unread rather than as zero', () => {
    expect(nounsIn('the record(s) are in table form')).toEqual([{ noun: 'record(s)', count: null, qualifier: null }]);
  });

  it('reports a noun whose number is three words away as unread, because it is not a count it read', () => {
    // `8 inline z.enum call(s)`: the number is on the page and this reader cannot reach it across
    // ordinary words. Guessing which of the numbers in a line belongs to which noun is the defect,
    // so the use is reported as unread and named (finding 611).
    expect(nounsIn('8 inline z.enum call(s) remain')).toEqual([{ noun: 'enum call(s)', count: null, qualifier: null }]);
  });

  it('keeps one gate\'s several uses of a noun apart, because they answer different questions', () => {
    const census = censusOf([
      { gate: 'a', text: '318 row(s) in the tables; 1 row(s) were judged' },
      { gate: 'b', text: '8 row(s) under ## Repository' },
    ]);
    expect(numbersOf(census.get('row(s)').get('a'))).toEqual([318, 1]);
    expect(numbersOf(census.get('row(s)').get('b'))).toEqual([8]);
  });

  it('keeps the numbers in the order the gate printed them, not in ascending order', () => {
    // The census and the summary it is checked against should read the same way round: an order
    // this reader imposed would be a second difference between two lines about one gate.
    const census = censusOf([{ gate: 'a', text: '219 `vX.YY` round(s), 50 `Pass` round(s)' }]);
    expect(numbersOf(census.get('round(s)').get('a'))).toEqual([219, 50]);
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

  it('identifies a shared noun by its noun and its gates, not by the number it happens to be', () => {
    // `474 file(s)` this round and `473` last round are the same judgement: two gates print one
    // number for two populations. A judgement keyed by the number would go stale every time a
    // source file was added, and its repair would be to retype a sentence that had not stopped
    // being true.
    expect(keyOf({ noun: 'file(s)', gates: ['a', 'b'], count: 473 })).toBe('file(s)::a+b');
    expect(keyOf({ noun: 'file(s)', gates: ['a', 'b'], count: 474 })).toBe('file(s)::a+b');
  });

  it('commits the vocabulary and the shared nouns, and never the counts', () => {
    const census = censusOf([
      { gate: 'a', text: '9 row(s); 471 file(s)' },
      { gate: 'b', text: '8 row(s); 6 file(s)' },
    ]);
    const inventory = inventoryOf(census);
    expect(JSON.stringify(inventory)).not.toContain('471');
    expect(JSON.stringify(inventory)).not.toContain('9,');
    expect(inventory.shared.map((one) => one.noun)).toEqual(['file(s)', 'row(s)']);
    // The relation is a judgement and is not in the derivation: `--write` merges it in, and a
    // derivation that carried a placeholder would be an inventory claiming an answer.
    expect(Object.keys(inventory)).toEqual(['nouns', 'shared']);
    expect(inventory.shared.every((one) => !('relation' in one))).toBe(true);
  });
});

describe('a shared noun is printed with the numbers, not with the gate count (finding 609)', () => {
  const census = censusOf([
    { gate: 'check-audit-volumes', text: 'check-audit-volumes: OK — 14 volume(s), 605 finding(s)' },
    { gate: 'check-progress-volumes', text: 'check-progress-volumes: OK — 18 volume(s), 272 heading(s)' },
  ]);

  it('names every gate\'s number, because the question is whether they count the same thing', () => {
    // The old summary said `volume(s) by 2`. The two numbers were printed by their own gates, forty
    // lines apart, and the reader that exists to hold two populations of one word together held the
    // names and dropped the numbers.
    const relations = new Map([
      [keyOf({ noun: 'volume(s)', gates: ['check-audit-volumes', 'check-progress-volumes'] }), 'two disjoint directories'],
    ]);
    expect(relationsOf(census, relations)).toEqual([
      'volume(s) — 14 in check-audit-volumes; 18 in check-progress-volumes — two disjoint directories',
    ]);
  });

  it('says a shared noun has no stated relation rather than leaving the line without one', () => {
    const [line] = relationsOf(census);
    expect(line.endsWith(` — ${UNSTATED}`)).toBe(true);
  });

  it('marks the one case where the numbers agree, and does not mark the others', () => {
    const agreeing = censusOf([
      { gate: 'a', text: '218 `vX.YY` round(s)' },
      { gate: 'b', text: '218 `vX.YY` round(s)' },
    ]);
    expect(relationsOf(agreeing)[0]).toContain('(a count two gates print agrees)');
    expect(relationsOf(census)[0]).not.toContain('agrees');
  });

  it('says a gate printed the noun with no number, instead of printing nothing for that gate', () => {
    // The state `round(s)` was in before this round's repair: two gates print it and neither number
    // reached the census. The line has to keep the gate -- a shared noun printed with one of its two
    // gates missing is a value narrower than its name (finding 595).
    const silent = censusOf([
      { gate: 'a', text: '219 `vX.YY` round(s)'.replace('219 `vX.YY` ', '') },
      { gate: 'b', text: '219 round(s)' },
    ]);
    expect(relationsOf(silent)[0]).toBe(`round(s) — no number in a; 219 in b — ${UNSTATED}`);
  });

  it('counts and names the uses whose number this reader cannot see (finding 611)', () => {
    // `scope(s) covered: core, cli, repo` states no count at all. Dropping it silently made the
    // headline a count of what was read, with nothing to say how much was not.
    const partial = censusOf([
      { gate: 'a', text: '484 published count(s), each naming its scope; scope(s) covered: core, cli, repo' },
      { gate: 'b', text: '1248 mark(s)' },
    ]);
    expect(unreadableOf(partial)).toEqual([{ noun: 'scope(s)', gates: ['a'] }]);
    expect(summaryOf(partial)).toContain('1 noun(s) are printed somewhere with no number this reader can read: scope(s) in a');
  });

  it('says every use states its number when none is unread', () => {
    const complete = censusOf([{ gate: 'a', text: '8 row(s)' }]);
    expect(unreadableOf(complete)).toEqual([]);
    expect(summaryOf(complete)).toContain('and every use states its number');
  });

  it('says how many shared nouns carry a stated relation, so a green run is visible from the summary', () => {
    const relations = new Map([['volume(s)::check-audit-volumes+check-progress-volumes', 'two disjoint directories']]);
    expect(summaryOf(census, relations)).toContain('1 of them are printed by more than one gate, and 1 of those say what the other one counts');
    expect(summaryOf(census)).toContain('1 of them are printed by more than one gate, and 0 of those say what the other one counts');
  });
});

describe('the gate holds the shipped inventory to the shipped gates', () => {
  // The one case that reads the shipped tree, and the only expensive one: the census spawns the
  // eighteen gates, which is 2.5 s on an idle machine. Under `verify-site-proofs` every child also
  // carries the exit hook, which writes to one trace file, and the same run takes long enough to
  // hit vitest's five-second default -- a timeout that would report the gate as unproven rather
  // than as slow. The budget is declared here rather than in a config, because it is this case
  // that costs it.
  it('agrees with the tree it is run against, and prints every shared noun with its numbers', () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    // The sentence a reader gets, for the noun whose two numbers were never on one line: 14 volumes
    // of audit and 18 of progress, in two directories that share no file.
    expect(result.stdout).toContain('volume(s) — 14 in check-audit-volumes; 18 in check-progress-volumes —');
    // And the one the reader could not see past: `round(s)` at 219 in both gates, with the qualifier
    // that finding 600's repair inserted and this round's reader had to learn to reach past.
    // A shape rather than a number: the two gates agree at 219 this round and at 220 the next,
    // and what the line has to keep is that each gate's number arrives with the era it counts.
    expect(result.stdout).toMatch(
      /round\(s\) — .*\d+ `vX\.YY` in check-open-list; \d+ `vX\.YY`, \d+ `Pass` in check-progress-volumes/,
    );
    expect(result.stdout).toContain('unit noun(s)');
    expect(result.stdout).not.toContain(UNSTATED);
  }, 120_000);

  // The refusals below hand the gate a recorded census instead of running eighteen gates.
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

  /**
   * The derivation the two refusals below start from: `--write` against the recorded census.
   *
   * The refusals are about what the gate does with a document, so the document is one this round
   * produced rather than the shipped inventory -- whose relations are keyed by the gates that
   * actually print each noun, and the fixture prints three gates where the tree prints four.
   */
  function derive(name: string) {
    const path = join(scratch, name);
    const wrote = run(['--write', '--inventory', path, '--readings', RECORDED]);
    expect(wrote.status, wrote.stderr).toBe(0);
    return { path, document: JSON.parse(readFileSync(path, 'utf8')) };
  }

  it('refuses an inventory whose vocabulary has stopped describing the gates', () => {
    const { path, document } = derive('narrowed.json');
    // The relations are filled first, because `--write` will not invent one: the drift this case is
    // about is a vocabulary that has stopped matching the gates, and a document that is also
    // missing a judgement is refused one step earlier for a different reason.
    const answered = document.shared.map((one: object) => ({ ...one, relation: 'a sentence a person wrote' }));
    writeFileSync(
      path,
      JSON.stringify({ ...document, shared: answered, nouns: document.nouns.filter((one: { noun: string }) => one.noun !== 'row(s)') }, null, 2),
    );
    const result = run(['--inventory', path, '--readings', RECORDED]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('row(s) is new, printed by check-fault-cases,check-open-list');
    expect(result.stderr).toContain('read the diff');
  });

  it('refuses a shared noun nobody has said is either one population or two', () => {
    const { path, document } = derive('unread.json');
    // The fixture shares exactly one noun, so the condition below is the whole of the document's
    // judgements rather than one of them.
    expect(document.shared.map((one: { noun: string }) => one.noun)).toEqual(['row(s)']);
    writeFileSync(path, JSON.stringify({ ...document, shared: document.shared.map((one: object) => ({ ...one, relation: null })) }, null, 2));
    const result = run(['--inventory', path, '--readings', RECORDED]);
    expect(result.status).toBe(1);
    // The numbers are in the message, and so is what to do about it: `--write` cannot answer this.
    expect(result.stderr).toContain('no record says whether that is one population or two');
    expect(result.stderr).toContain('row(s) — 8 in check-fault-cases; 318 in check-open-list; 8 in check-repository-table');
    expect(result.stderr).toContain('no derivation can make it');
  });

  it('refuses to run with no inventory at all, and names the file it wanted', () => {
    const result = run(['--inventory', join(scratch, 'absent.json'), '--readings', RECORDED]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is missing, so the vocabulary has no record');
  });
});
