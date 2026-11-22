import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  UNSTATED,
  agreementOf,
  censusOf,
  coincidencesOf,
  disagreementsOf,
  inventoryOf,
  keyOf,
  nounsIn,
  numbersOf,
  numbersOfNoun,
  partitionOf,
  partitionProblems,
  relationsOf,
  sharedNounsOf,
  stateOf,
  summaryOf,
  unreadableOf,
  unpartitionedOf,
  unstatedOf,
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
 * and `check-progress-volumes` is one population, because both walk the same headings -- through two
 * readers, which is what this file said wrongly for two rounds (`check-open-list` does not import
 * `populationsOf`; finding 616). `8 row(s)` in the other two is two tables and one noun, which no
 * arithmetic relates. `14 volume(s)` and `18 volume(s)` are two disjoint directories. The output
 * cannot tell those apart, so the inventory records a sentence per shared noun and this file proves
 * that one without a sentence is refused: a gate that answered the question itself would be
 * inventing the judgement it exists to ask for.
 *
 * Since v3.127 the sentence has a shape a run can hold: the noun's gates are **partitioned into
 * populations**, a group of two is a claim that those two read one set, and the census then checks
 * that their numbers agree. The sentence keeps the part no run can decide -- *why* the two gates read
 * one set -- and stops being the only place the claim lives.
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
      { noun: 'row(s)', count: 8, gates: ['check-fault-cases', 'check-repository-table'], within: false },
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

  it('identifies a judgement by its noun, so a gate joining the noun does not discard a sentence', () => {
    // `O-099`. The key was the noun **and its gates**, and `check-ci-budget` prints `N round(s)` only
    // while the ledger is behind -- so `round(s)`'s gate set moved twice inside one round and a
    // sentence that had not stopped being true was retyped twice. The noun is what a person wrote
    // about, so the noun is the key; a new gate is refused as unplaced instead.
    expect(keyOf({ noun: 'round(s)', gates: ['check-open-list'] })).toBe('round(s)');
    expect(keyOf({ noun: 'round(s)', gates: ['check-open-list', 'check-progress-volumes'] })).toBe('round(s)');
    // And never the number: `474 file(s)` this round and `473` next are one judgement, because the
    // question is what each gate counts and not how many files the tree happens to hold.
    expect(keyOf({ noun: 'file(s)', gates: ['a', 'b'], count: 473 })).toBe('file(s)');
    expect(keyOf({ noun: 'file(s)', gates: ['a', 'b'], count: 474 })).toBe('file(s)');
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
    const relation = 'two disjoint directories';
    const judgements = new Map([
      [
        keyOf({ noun: 'volume(s)', gates: ['check-audit-volumes', 'check-progress-volumes'] }),
        { noun: 'volume(s)', gates: ['check-audit-volumes', 'check-progress-volumes'], populations: null, relation },
      ],
    ]);
    expect(relationsOf(census, judgements)).toEqual([
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
    const gates = ['check-audit-volumes', 'check-progress-volumes'];
    const judgements = new Map([
      [keyOf({ noun: 'volume(s)', gates }), { noun: 'volume(s)', gates, populations: null, relation: 'two disjoint directories' }],
    ]);
    expect(summaryOf(census, judgements)).toContain('1 of them are printed by more than one gate, and 1 of those say what the other one counts');
    expect(summaryOf(census)).toContain('1 of them are printed by more than one gate, and 0 of those say what the other one counts');
  });
});

/**
 * The unit of the judgement is a population, not a noun (finding 616).
 *
 * `O-097` recorded the shape: nine nouns are printed by more than one gate, each carries a sentence a
 * person wrote, and the census holds summaries rather than sets -- so a sentence that has stopped
 * being true stays printed. This adds the one part of each sentence a run can check: which of a
 * noun's gates read one population.
 *
 * The first sentence read under the new rule was already false in its reason. `addendum(s)` says
 * "both take it from `populationsOf` in `progress-volumes.mjs`", and `check-open-list` imports
 * `docs-corpus.mjs` and nothing else -- two readers over one set of headings, not one reader twice.
 * The conclusion (one population, so the counts must agree) was right and the reason was not, and
 * nothing in the tree could tell which half of a sentence was which. With the partition the
 * checkable half is checked, and the sentence keeps the part no run can decide.
 */
describe('a population is the unit of the judgement, because a noun is not (finding 616)', () => {
  const FILE_GATES = ['check-citations', 'check-comments-language', 'check-doc-counts', 'check-workflow-language'];
  const census = censusOf([
    { gate: 'check-citations', text: 'number(s) across 37 file(s), each naming a finding that exists' },
    { gate: 'check-comments-language', text: '474 file(s) the source walk reads' },
    { gate: 'check-doc-counts', text: '11 of the 474 file(s) the source walk reads' },
    { gate: 'check-workflow-language', text: '6 file(s) walked' },
  ]);
  const FILE = {
    noun: 'file(s)',
    gates: FILE_GATES,
    populations: [['check-comments-language', 'check-doc-counts'], ['check-citations'], ['check-workflow-language']],
    relation: 'four walks over four corpora',
  };
  const judgements = new Map([[keyOf({ noun: 'file(s)', gates: FILE_GATES }), FILE]]);

  it('says which gates read one set, and marks the equality as one a population forces', () => {
    // Two of the four gates walk the source walk -- `check-doc-counts` takes its denominator from the
    // same walk -- so `474` and `474` are one population counted twice; `37` and `6` agree with
    // nothing. Before the partition the line could only say "a count two gates print agrees", which
    // is true of a shared reader and of a coincidence alike.
    expect(relationsOf(census, judgements)).toEqual([
      'file(s) — 37 in check-citations; 474 in check-comments-language; 474 in check-doc-counts ' +
        '(one population at 474, and the count agrees); 6 in check-workflow-language — four walks over four corpora',
    ]);
  });

  it('says nothing about a population when the record does not declare one', () => {
    // The line is unchanged from the pre-partition shape: four gates, four numbers, and the sentence.
    // A reader cannot tell whether that is four populations or one, which is exactly why the gate
    // refuses this document -- but the sentence it prints first must not claim a structure it does
    // not have (finding 595).
    const bare = new Map([[keyOf({ noun: 'file(s)', gates: FILE_GATES }), { ...FILE, populations: null }]]);
    expect(relationsOf(census, bare)[0]).toBe(
      'file(s) — 37 in check-citations; 474 in check-comments-language; 474 in check-doc-counts; ' +
        '6 in check-workflow-language (a count two gates print agrees) — four walks over four corpora',
    );
  });

  it('formats a noun\'s numbers once, for the line and for the refusal that quotes it', () => {
    // The gate's refusal for an unwritten sentence quotes the same words the green line prints. The
    // first version of that refusal reassembled them from `relationsOf` with a `lastIndexOf`; one
    // formatter means a refusal cannot drift from the line it is refusing to print.
    expect(numbersOfNoun(census, judgements, 'file(s)')).toBe(
      '37 in check-citations; 474 in check-comments-language; 474 in check-doc-counts ' +
        '(one population at 474, and the count agrees); 6 in check-workflow-language',
    );
  });

  it('refuses a partition that does not cover every gate exactly once', () => {
    // Five shapes, five sentences. A partition is a claim that a set of gates partitions the noun's
    // gates, and each way of failing it is a different repair: a gate nobody placed, a gate placed
    // twice, a gate that does not print the noun at all, and an empty group, which reads as a
    // population of nothing.
    expect(partitionProblems({ ...FILE, populations: [['check-citations'], ['check-comments-language', 'check-doc-counts']] }, FILE_GATES)).toEqual([
      'check-workflow-language is in no population',
    ]);
    expect(
      partitionProblems({
        ...FILE,
        populations: [['check-citations', 'check-comments-language'], ['check-comments-language', 'check-doc-counts'], ['check-workflow-language']],
      }, FILE_GATES),
    ).toEqual(['check-comments-language is in two populations, so its count is claimed twice']);
    expect(
      partitionProblems({
        ...FILE,
        populations: [['check-citations'], ['check-comments-language', 'check-doc-counts', 'check-nowhere'], ['check-workflow-language']],
      }, FILE_GATES),
    ).toEqual(['check-nowhere is in a population and does not print this noun']);
    expect(
      partitionProblems({ ...FILE, populations: [['check-citations'], [], ['check-comments-language', 'check-doc-counts'], ['check-workflow-language']] }, FILE_GATES),
    ).toEqual(['a population with no gate in it']);
    expect(partitionProblems({ ...FILE, populations: null }, FILE_GATES)).toEqual(['nothing says which of its gates read one population']);
    // The shape this field very nearly took: four names and no groups, which reads as one population
    // holding all four. Refused once, because the other three problems would be consequences of it.
    expect(partitionProblems({ ...FILE, populations: FILE_GATES }, FILE_GATES)).toEqual([
      'a population written as "check-citations" rather than as a list of gates',
    ]);
    // And the renderers are given `[]` for such a group rather than the string, so a line printed
    // from a document the gate refuses is a line about gates and not about a type.
    expect(partitionOf({ populations: ['check-citations'] })).toEqual([[]]);
  });

  it('names the counts a set of gates has in common, and the gate whose number it could not read', () => {
    // `round(s)` is the case that needs the second reading: one gate prints `221 vX.YY` and one
    // prints `221 vX.YY` beside `50 Pass`, so the populations agree at 221 and one gate holds a
    // second population of its own. Equality of the whole sets would call that a disagreement.
    const rounds = censusOf([
      { gate: 'check-open-list', text: '221 `vX.YY` round(s)' },
      { gate: 'check-progress-volumes', text: '221 `vX.YY` round(s), 50 `Pass` round(s)' },
    ]);
    expect(agreementOf(rounds, 'round(s)', ['check-open-list', 'check-progress-volumes'])).toEqual({
      common: [221],
      counts: [
        { gate: 'check-open-list', numbers: [221] },
        { gate: 'check-progress-volumes', numbers: [221, 50] },
      ],
      unread: [],
    });
    // A gate whose use states no number cannot be compared, and saying `no count in common` would
    // report a divergence where the reader simply could not see (finding 611).
    const silent = censusOf([
      { gate: 'check-open-list', text: '221 `vX.YY` round(s)' },
      { gate: 'check-progress-volumes', text: 'the round(s) are counted elsewhere' },
    ]);
    expect(agreementOf(silent, 'round(s)', ['check-open-list', 'check-progress-volumes'])).toEqual({
      common: [],
      counts: [
        { gate: 'check-open-list', numbers: [221] },
        { gate: 'check-progress-volumes', numbers: [] },
      ],
      unread: ['check-progress-volumes'],
    });
  });

  it('names a population whose gates have stopped agreeing, and the numbers are the evidence', () => {
    // The defect this check exists for: one of the two gates changes its reader, the two stop
    // counting one set, and the sentence that says they do stays printed. `474` against `473` is
    // the whole of the evidence, and it is the only thing the refusal has to go on.
    const drifted = censusOf([
      { gate: 'check-comments-language', text: '474 file(s) the source walk reads' },
      { gate: 'check-doc-counts', text: '473 file(s) the source walk reads' },
    ]);
    const judgement = {
      noun: 'file(s)',
      gates: ['check-comments-language', 'check-doc-counts'],
      populations: [['check-comments-language', 'check-doc-counts']],
      relation: 'one walk',
    };
    expect(disagreementsOf(drifted, new Map([[keyOf(judgement), judgement]]))).toEqual([
      {
        noun: 'file(s)',
        gates: ['check-comments-language', 'check-doc-counts'],
        counts: [
          { gate: 'check-comments-language', numbers: [474] },
          { gate: 'check-doc-counts', numbers: [473] },
        ],
        unread: [],
      },
    ]);
    expect(disagreementsOf(census, judgements)).toEqual([]);
  });

  it('attributes each coincidence to the partition: forced inside one population, the corpus across two', () => {
    // `1 addendum(s)` is one population read twice, so the equality is the claim; `8 row(s)` is two
    // tables, so the equality is the corpus. The census printed one marker for both.
    const addenda = censusOf([
      { gate: 'check-open-list', text: '1 addendum(s)' },
      { gate: 'check-progress-volumes', text: '1 addendum(s)' },
    ]);
    const one = {
      noun: 'addendum(s)',
      gates: ['check-open-list', 'check-progress-volumes'],
      populations: [['check-open-list', 'check-progress-volumes']],
      relation: 'one set of headings, two readers',
    };
    expect(coincidencesOf(addenda, new Map([[keyOf(one), one]]))).toEqual([
      { noun: 'addendum(s)', count: 1, gates: ['check-open-list', 'check-progress-volumes'], within: true },
    ]);
    expect(coincidencesOf(addenda)).toEqual([
      { noun: 'addendum(s)', count: 1, gates: ['check-open-list', 'check-progress-volumes'], within: false },
    ]);
    // A coincidence is `within` only when one population holds *all* the gates that print it: three
    // gates over two populations is a coincidence across, whatever two of them share.
    const three = censusOf([
      { gate: 'a', text: '8 row(s)' },
      { gate: 'b', text: '8 row(s)' },
      { gate: 'c', text: '8 row(s)' },
    ]);
    const split = { noun: 'row(s)', gates: ['a', 'b', 'c'], populations: [['a', 'b'], ['c']], relation: 'two tables' };
    expect(coincidencesOf(three, new Map([[keyOf(split), split]]))).toEqual([
      { noun: 'row(s)', count: 8, gates: ['a', 'b', 'c'], within: false },
    ]);
  });

  it('says how much of the nine sentences a run now checks, rather than only how many were written', () => {
    // The summary's old clause counted sentences. This one counts the sentences with something behind
    // them: a population two gates are declared to share, whose equality the run then checks.
    const line = summaryOf(census, judgements);
    expect(line).toContain('1 population(s) are read by more than one gate, and 1 of them agree on a count');
    expect(line).toContain('1 count(s) coincide across gates -- 1 inside a declared population and 0 across two');
    expect(summaryOf(census)).toContain('no population is read by more than one gate, so no equality between two gates is checked');
  });

  it('names the shared nouns with no sentence and the ones with no partition, separately', () => {
    // Two states, two repairs: a sentence nobody wrote, and a partition nobody placed. The gate used
    // to recognise the first by the text of the line it printed, which is a string compared with
    // itself (`UNSTATED`) rather than a fact about the document.
    expect(unstatedOf(census, judgements)).toEqual([]);
    expect(unstatedOf(census, new Map())).toEqual([{ noun: 'file(s)', gates: FILE_GATES }]);
    const bare = new Map([[keyOf({ noun: 'file(s)', gates: FILE_GATES }), { ...FILE, populations: null }]]);
    // The sentence is there; the partition is not. Two states, and this is the second one.
    expect(unstatedOf(census, bare)).toEqual([]);
    expect(unpartitionedOf(census, bare)).toEqual([
      { noun: 'file(s)', gates: FILE_GATES, problems: ['nothing says which of its gates read one population'] },
    ]);
    expect(unpartitionedOf(census, judgements)).toEqual([]);
  });
});

/**
 * A gate can join a noun between two rounds, and the join must not cost the sentence (`O-099`).
 *
 * `check-ci-budget` prints `N round(s)` while the ledger is behind and stops when it catches up, so
 * `round(s)` is printed by one gate in some runs and two in others -- and it moved in and out twice
 * inside the round that found this. Under the old key the judgement was keyed by the noun **and its
 * gates**, so each move discarded the sentence; the refusal then said "no record says whether that is
 * one population or two" about a record that had said so an hour earlier, and a person retyped it.
 *
 * Two changes make the join cheap. The key is the noun, so the record is found. The record lives on
 * the noun's entry in `nouns` rather than on `shared`, which is derived -- so a noun that stops being
 * shared for a round keeps its sentence for the round it comes back.
 */
describe('a gate joining a noun is refused as unplaced, and the sentence survives (finding 618)', () => {
  const JUDGEMENT = {
    noun: 'round(s)',
    populations: [['check-open-list', 'check-progress-volumes']],
    relation: 'one set of headings read twice',
  };
  const twoGates = censusOf([
    { gate: 'check-open-list', text: '221 `vX.YY` round(s)' },
    { gate: 'check-progress-volumes', text: '221 `vX.YY` round(s)' },
  ]);
  const threeGates = censusOf([
    { gate: 'check-open-list', text: '221 `vX.YY` round(s)' },
    { gate: 'check-progress-volumes', text: '221 `vX.YY` round(s)' },
    { gate: 'check-ci-budget', text: '1 round(s) the ledger is behind' },
  ]);
  const judgements = new Map([[keyOf(JUDGEMENT), JUDGEMENT]]);

  it('reads the record as complete while the gates are the ones it was written for', () => {
    expect(unstatedOf(twoGates, judgements)).toEqual([]);
    expect(unpartitionedOf(twoGates, judgements)).toEqual([]);
    expect(disagreementsOf(twoGates, judgements)).toEqual([]);
  });

  it('keeps the sentence when a third gate arrives, and names the gate nobody placed', () => {
    // The sentence is not wrong: two readers of one set still read one set. What changed is that a
    // third gate prints the noun and the partition says nothing about it, and that is the one thing
    // the run has to say -- not "the key changed, write the sentence again".
    expect(unstatedOf(threeGates, judgements)).toEqual([]);
    expect(unpartitionedOf(threeGates, judgements)).toEqual([
      {
        noun: 'round(s)',
        gates: ['check-ci-budget', 'check-open-list', 'check-progress-volumes'],
        problems: ['check-ci-budget is in no population'],
      },
    ]);
    // The disagreement check defers rather than reporting a second refusal: a partition that does not
    // cover this run's gates would make it ask the wrong question.
    expect(disagreementsOf(threeGates, judgements)).toEqual([]);
  });

  it('keeps the sentence when the noun stops being shared, which is the same move the other way', () => {
    // The half a noun-shaped key alone would not fix: `shared` is derived, so `round(s)` leaves that
    // list the moment `check-ci-budget` falls silent. A judgement stored on the shared entry would go
    // with it; stored on the noun's entry it does not, and the next round reads it unchanged.
    const oneGate = censusOf([{ gate: 'check-open-list', text: '221 `vX.YY` round(s)' }]);
    expect(sharedNounsOf(oneGate)).toEqual([]);
    expect(unstatedOf(oneGate, judgements)).toEqual([]);
    expect(unpartitionedOf(oneGate, judgements)).toEqual([]);
  });

  it('reads the gates this run found, not the ones the record was written with', () => {
    // The defect the old key hid, stated as an equality: the record says a,b; the tree says a,b,c.
    // A reader that compares the record with itself answers "nothing is wrong" -- which is what six
    // callers did, each with its own copy of `judgement.gates`.
    expect(stateOf(twoGates, judgements, 'round(s)').gates).toEqual(['check-open-list', 'check-progress-volumes']);
    expect(stateOf(threeGates, judgements, 'round(s)').declared).toBe(false);
    expect(stateOf(twoGates, judgements, 'round(s)').declared).toBe(true);
    // A noun with no judgement at all is missing rather than unplaced, and the problems say which.
    expect(stateOf(twoGates, new Map(), 'round(s)').problems).toEqual(['no entry for this noun']);
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
  // The same three gates with one of them changed by one: the reading a population's disagreement is
  // measured on. Two readers of one set cannot differ by one unless one of them has stopped reading
  // that set, and the fixture is the smallest document in which that shows.
  const DRIFTED = join(scratch, 'drifted.json');
  writeFileSync(
    DRIFTED,
    JSON.stringify([
      { gate: 'check-fault-cases', text: 'check-fault-cases: 8 row(s) of the window; 602 finding(s)' },
      { gate: 'check-repository-table', text: 'check-repository-table: OK (7 row(s) under ## Repository)' },
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

  /**
   * The same document with a judgement written for one noun.
   *
   * Since `O-099` the judgements are a list of their own: `nouns` and `shared` are derived from the
   * census, so a judgement on either would be deleted by the first `--write` in which the noun was
   * silent. `patch: { relation: null }` is how the "nobody wrote a sentence" state is driven.
   */
  function judged(document: { judgements: { noun: string }[] }, noun: string, patch: object) {
    const exists = document.judgements.some((one) => one.noun === noun);
    return {
      ...document,
      judgements: exists
        ? document.judgements.map((one) => (one.noun === noun ? { ...one, ...patch } : one))
        : [...document.judgements, { noun, ...patch }],
    };
  }

  /**
   * A reading in which a fourth gate starts printing `row(s)`.
   *
   * The shipped tree has `check-l4-status` printing `row(s)` already, so this is not a hypothetical
   * shape -- it is the fixture's three gates plus the fourth the real corpus has, and it is how a
   * gate joining a noun is driven without waiting for one to.
   */
  const JOINED = join(scratch, 'joined.json');
  writeFileSync(
    JOINED,
    JSON.stringify([
      { gate: 'check-fault-cases', text: 'check-fault-cases: 8 row(s) of the window; 602 finding(s)' },
      { gate: 'check-repository-table', text: 'check-repository-table: OK (8 row(s) under ## Repository)' },
      { gate: 'check-open-list', text: 'check-open-list: 318 row(s) in the tables' },
      { gate: 'check-l4-status', text: 'check-l4-status: 9 row(s) in the registry' },
    ]),
  );

  /**
   * A reading in which `row(s)` is printed by one gate, so the noun is no longer shared.
   *
   * The three gates are still there and the two other nouns are still printed: a census of one gate
   * would shrink the whole vocabulary, and the drift this case is about is a noun leaving `shared`,
   * not a tree losing its gates. `check-open-list` prints `record(s)` here, which is what the log's
   * tables are counted in -- the reading is a plausible tree rather than a truncated one.
   */
  const NARROWED = join(scratch, 'narrowed-readings.json');
  writeFileSync(
    NARROWED,
    JSON.stringify([
      { gate: 'check-fault-cases', text: 'check-fault-cases: 602 finding(s)' },
      { gate: 'check-repository-table', text: 'check-repository-table: OK (8 row(s) under ## Repository)' },
      { gate: 'check-open-list', text: 'check-open-list: 318 record(s) in the tables' },
    ]),
  );

  it('refuses an inventory whose vocabulary has stopped describing the gates', () => {
    const { path, document } = derive('narrowed.json');
    // The relations are filled first, because `--write` will not invent one: the drift this case is
    // about is a vocabulary that has stopped matching the gates, and a document that is also
    // missing a judgement is refused one step earlier for a different reason.
    const answered = judged(document, 'row(s)', {
      relation: 'a sentence a person wrote',
      populations: [['check-fault-cases', 'check-repository-table'], ['check-open-list']],
    });
    // The vocabulary this case is about: the derived `nouns` list says two gates print `row(s)` and
    // the readings say three. Narrowing that row rather than deleting it keeps the judgement, so the
    // refusal that fires is the vocabulary one and not a missing sentence.
    writeFileSync(
      path,
      JSON.stringify(
        {
          ...answered,
          nouns: answered.nouns.map((one: { noun: string }) =>
            one.noun === 'row(s)' ? { ...one, gates: ['check-fault-cases', 'check-open-list'] } : one,
          ),
        },
        null,
        2,
      ),
    );
    const result = run(['--inventory', path, '--readings', RECORDED]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('row(s): check-fault-cases,check-open-list -> check-fault-cases,check-open-list,check-repository-table');
    expect(result.stderr).toContain('read the diff');
  });

  it('refuses a shared noun nobody has said is either one population or two', () => {
    const { path, document } = derive('unread.json');
    // The fixture shares exactly one noun, so the condition below is the whole of the document's
    // judgements rather than one of them.
    expect(document.shared.map((one: { noun: string }) => one.noun)).toEqual(['row(s)']);
    writeFileSync(path, JSON.stringify(judged(document, 'row(s)', { relation: null, populations: null }), null, 2));
    const result = run(['--inventory', path, '--readings', RECORDED]);
    expect(result.status).toBe(1);
    // The numbers are in the message, and so is what to do about it: `--write` cannot answer this.
    expect(result.stderr).toContain('no record says whether that is one population or two');
    expect(result.stderr).toContain('row(s) — 8 in check-fault-cases; 318 in check-open-list; 8 in check-repository-table');
    expect(result.stderr).toContain('no derivation can make it');
  });

  it('refuses to write the inventory while a population it would keep does not agree', () => {
    // The same refusal on the writing side. `--write` merges the partitions a person placed, so a
    // partition that no longer agrees with the corpus has to stop the write: regenerating the
    // document would otherwise record a partition the next run refuses, and the two doors would be
    // one rule in name only.
    const { path, document } = derive('writing.json');
    const answered = judged(document, 'row(s)', {
      relation: 'a sentence a person wrote',
      populations: [['check-fault-cases', 'check-repository-table'], ['check-open-list']],
    });
    writeFileSync(path, JSON.stringify(answered, null, 2));
    const result = run(['--write', '--inventory', path, '--readings', DRIFTED]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('do not agree on a count');
    expect(result.stderr).toContain('8 and 7 row(s) in check-fault-cases and check-repository-table');
  });

  it('refuses to run with no inventory at all, and names the file it wanted', () => {
    const result = run(['--inventory', join(scratch, 'absent.json'), '--readings', RECORDED]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is missing, so the vocabulary has no record');
  });

  it('refuses a shared noun whose gates nobody has partitioned into populations', () => {
    // `--write` fills in the sentence a person must write and leaves the partition to the same
    // person, so a document the gate produced itself is refused until both are there. That is the
    // round: a sentence nobody can check is not a judgement, it is a note.
    const { path, document } = derive('unpartitioned.json');
    const answered = judged(document, 'row(s)', { relation: 'a sentence a person wrote' });
    writeFileSync(path, JSON.stringify(answered, null, 2));
    const result = run(['--inventory', path, '--readings', RECORDED]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no record says which of them read one population');
    expect(result.stderr).toContain('row(s) (nothing says which of its gates read one population)');
    expect(result.stderr).toContain('a group of two makes its equality a fact the next run checks');
  });

  it('refuses a partition that leaves one of the noun\'s gates unplaced', () => {
    const { path, document } = derive('broken-partition.json');
    const answered = judged(document, 'row(s)', {
      relation: 'a sentence a person wrote',
      populations: [['check-fault-cases', 'check-repository-table']],
    });
    writeFileSync(path, JSON.stringify(answered, null, 2));
    const result = run(['--inventory', path, '--readings', RECORDED]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('row(s) (check-open-list is in no population)');
  });

  it('refuses a population the record declares one when its gates print different counts', () => {
    // The check the nine sentences never had. Two gates are written down as reading one set; one of
    // them changes its reader; the sentence stays and the numbers diverge. The refusal quotes both,
    // because the numbers are the only evidence and the record is the only thing a person can fix.
    const { path, document } = derive('disagreeing.json');
    const answered = judged(document, 'row(s)', {
      relation: 'a sentence a person wrote',
      populations: [['check-fault-cases', 'check-repository-table'], ['check-open-list']],
    });
    writeFileSync(path, JSON.stringify(answered, null, 2));
    const result = run(['--inventory', path, '--readings', DRIFTED]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('do not agree on a count');
    expect(result.stderr).toContain('8 and 7 row(s) in check-fault-cases and check-repository-table');
    // The same document against the readings it was written from passes, so the refusal is about the
    // divergence rather than about the partition being unusual.
    expect(run(['--inventory', path, '--readings', RECORDED]).status).toBe(0);
  });

  it('refuses a gate that joined the noun, and leaves the sentence standing', () => {
    // `O-099` end to end. The record is complete against three gates; a fourth starts printing the
    // noun; the run says which gate nobody placed and not "write the sentence again" -- and `--write`
    // preserves the sentence while naming what it could not place.
    const { path, document } = derive('joined-noun.json');
    const answered = judged(document, 'row(s)', {
      relation: 'three tables',
      populations: [['check-fault-cases', 'check-repository-table'], ['check-open-list']],
    });
    writeFileSync(path, JSON.stringify(answered, null, 2));
    const refused = run(['--inventory', path, '--readings', JOINED]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('no record says which of them read one population');
    expect(refused.stderr).toContain('row(s) (check-l4-status is in no population)');
    const wrote = run(['--write', '--inventory', path, '--readings', JOINED]);
    expect(wrote.status, wrote.stderr).toBe(0);
    // Named rather than silent: the next run refuses this document, and the person reading the
    // writing has to know that before they read the refusal.
    expect(wrote.stderr).toContain("row(s) is not partitioned over this run's gates — check-l4-status is in no population");
    const after = JSON.parse(readFileSync(path, 'utf8'));
    expect(after.judgements.find((one: { noun: string }) => one.noun === 'row(s)')).toMatchObject({
      noun: 'row(s)',
      relation: 'three tables',
    });
  });

  it('keeps a judgement through a round in which its noun is not shared', () => {
    // The half a noun-shaped key alone would not fix. `shared` is derived, so `row(s)` leaves that
    // list when only one gate prints it -- and a judgement stored on the shared entry would leave
    // with it. Stored on the noun's entry it survives, and the round the second gate returns is
    // green without anybody writing the sentence a second time.
    const { path, document } = derive('lasting.json');
    writeFileSync(
      path,
      JSON.stringify(
        judged(document, 'row(s)', {
          relation: 'three tables',
          populations: [['check-fault-cases', 'check-repository-table'], ['check-open-list']],
        }),
        null,
        2,
      ),
    );
    const narrowed = run(['--write', '--inventory', path, '--readings', NARROWED]);
    expect(narrowed.status, narrowed.stderr).toBe(0);
    const after = JSON.parse(readFileSync(path, 'utf8'));
    expect(after.shared.map((one: { noun: string }) => one.noun)).not.toContain('row(s)');
    expect(after.judgements.find((one: { noun: string }) => one.noun === 'row(s)')).toMatchObject({
      noun: 'row(s)',
      relation: 'three tables',
    });
    // The vocabulary is what moved, and it moved to the one gate that still prints the noun.
    expect(after.nouns.find((one: { noun: string }) => one.noun === 'row(s)').gates).toEqual(['check-repository-table']);
    // The second gate coming back is the ordinary round after it: `--write` refreshes the vocabulary
    // and finds the sentence, and the run that follows is green without anybody retyping it.
    expect(run(['--write', '--inventory', path, '--readings', RECORDED]).status).toBe(0);
    expect(run(['--inventory', path, '--readings', RECORDED]).status).toBe(0);
  });

  it('keeps a judgement for a noun no gate printed this round', () => {
    // `budget(s)` is printed only while a ceiling is being widened, so it is absent from most runs.
    // A judgement stored on the derived vocabulary would be deleted by the first `--write` in a round
    // where nothing moved; the list of its own keeps it, and the writing says it kept it.
    const { path, document } = derive('silent-noun.json');
    expect(document.judgements).toEqual([]);
    writeFileSync(
      path,
      JSON.stringify(
        judged(document, 'budget(s)', { relation: 'a widened ceiling, when one is widened', populations: [['check-ci-budget']] }),
        null,
        2,
      ),
    );
    const wrote = run(['--write', '--inventory', path, '--readings', RECORDED]);
    expect(wrote.status, wrote.stderr).toBe(0);
    expect(wrote.stderr).toContain('budget(s) carries a judgement and no gate printed it this run — kept');
    const after = JSON.parse(readFileSync(path, 'utf8'));
    expect(after.judgements).toEqual([
      { noun: 'budget(s)', populations: [['check-ci-budget']], relation: 'a widened ceiling, when one is widened' },
    ]);
    // And the vocabulary it speaks about is unchanged: a judgement does not put a noun in `nouns`.
    expect(after.nouns.map((one: { noun: string }) => one.noun)).not.toContain('budget(s)');
  });
});
