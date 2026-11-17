import { describe, expect, it } from 'vitest';
import { ADDITIVE_SCOPES } from '../../../scripts/doc-count-additivity.mjs';
import { SCOPES as PUBLISHED_SCOPES } from '../../../scripts/doc-counts-rows.mjs';
import {
  CURRENT_MARKERS,
  SCOPE_NOTES,
  SCOPES,
  scopeOf,
} from '../../../scripts/doc-counts-vocabulary.mjs';
import { progressCorpus } from '../../../scripts/docs-corpus.mjs';

/**
 * The vocabulary that decides which published count belongs to which suite.
 *
 * ## The gap this file closes
 *
 * `doc-counts-vocabulary.mjs` opened with "it is a plain data module: no `main`, no exit,
 * nothing to prove". That sentence was true of the `CURRENT_MARKERS` table and false of the
 * function beside it: `scopeOf` is the classifier that decides **which row a guard reads and
 * which row a writer rewrites**, and nothing in the tree imported the module to call it. Its
 * only proof was two spawned gates over fixtures, which is the route `scripts-are-classified`
 * calls "a spawn, which cannot name the branch you broke" -- and the register filed it as
 * `data`, whose definition ("exports a table") is what excused it from every other instrument.
 *
 * Measured, rather than argued: deleting one alternative of `scopeOf`
 * (`|\bevery workspace\b`) left **255 files / 6,560 tests** green and `check-doc-counts` green
 * over 433 published counts. A branch of the classifier that decides which numbers are true
 * could be removed, and no test in the tree noticed.
 *
 * ## What the classifier is allowed to answer
 *
 * One row, one scope, and the scope has to be a *word of the vocabulary* standing on its own
 * in the row's label. Everything else is `null`, and `null` is not a soft answer: rule 1 of
 * `check-doc-counts.mjs` refuses a published count whose scope is `null`, so the ambiguity
 * becomes a sentence a reader can act on ("say which one it measured") instead of a guess
 * made by the guard on the author's behalf.
 *
 * Three shapes exist in the shipped corpus that the old chain of `if`s answered **wrongly or
 * unasked**, and each is pinned below:
 *
 *   - `core / cli / repo` (three rows in `volume-08`) was answered `core`, because the chain
 *     returned the first word it met. A label naming three suites is more ambiguous than the
 *     bare `test suite` the module was created to refuse, not less.
 *   - `` `scripts/publish-cli.mjs` `` was answered `cli`, because `\b` treats `-` as a boundary.
 *     A file's name is not a claim about a suite, and the row was one `N files, M tests` away
 *     from being checked against the cli suite.
 *   - `every workspace` was answered `repo` although the word `repo` appears nowhere in it. No
 *     document uses that label -- measured: the three repo rows in the corpus say `repo test
 *     suite` -- and the alias is the one alternative whose deletion was green.
 */

/** The label each scope's published rows actually use, as the corpus spells them. */
const LABELS = {
  core: '`core` test suite',
  cli: '`cli` test suite',
  repo: 'repo test suite',
};

describe('doc-counts-vocabulary · the three words, and what they answer', () => {
  it('names the scopes exactly once, in reading order', () => {
    // The vocabulary is the list. It used to be three branches plus an alias, so the set of
    // words existed only as the union of what the chain happened to test -- which is why a
    // synonym could be added, and removed, without a reader anywhere.
    // Reading order, not sorted: the writer spawns one run per entry and the ledger lists
    // the parts before the whole, so `core`, `cli`, `repo` is the order the documents use.
    expect(SCOPES).toEqual(['core', 'cli', 'repo']);
    expect(new Set(SCOPES).size).toBe(SCOPES.length);
  });

  it('answers the label the corpus writes for each scope', () => {
    for (const scope of SCOPES) {
      expect(scopeOf(LABELS[scope as keyof typeof LABELS]), `${scope}'s own label`).toBe(scope);
    }
  });

  it('finds those three labels in the corpus, so the vocabulary still describes the documents', () => {
    // A unit test over a vocabulary is only worth its name if the words are the ones the
    // documents use. This half is what would go red if a round renamed the label to
    // `the core suite` and left the classifier reading a word nobody writes.
    const text = progressCorpus()
      .map((file) => file.text)
      .join('\n');
    for (const scope of SCOPES) {
      expect(text, `no row in the corpus is labelled '${LABELS[scope as keyof typeof LABELS]}'`).toContain(
        LABELS[scope as keyof typeof LABELS],
      );
    }
  });

  it('refuses a label that names no scope, which is the defect it was created for', () => {
    // Two rows both labelled `test suite` disagreed by 231 tests, and nothing could say which
    // suite either described.
    expect(scopeOf('test suite')).toBeNull();
    expect(scopeOf('')).toBeNull();
    expect(scopeOf('gates')).toBeNull();
  });

  it('refuses a label that names more than one scope rather than answering with the first', () => {
    // `volume-08` publishes `| core / cli / repo | 192 / 4787 · 4 / 187 · 196 / 4974 |`, and
    // the chain read it as `core`. The row carries three numbers for three suites, so no
    // single scope is a true answer, and the reader is the one that has to say which it meant.
    expect(scopeOf('core / cli / repo')).toBeNull();
    expect(scopeOf('typecheck (core, cli)')).toBeNull();
    expect(scopeOf('core, cli')).toBeNull();
  });

  it('refuses a scope word that is part of a path or an identifier', () => {
    // `\b` splits at `-`, so `` `scripts/publish-cli.mjs` `` used to be a cli-suite claim. The
    // rows in the corpus that are labelled this way happen to carry no count shape, which is
    // why the misreading was silent rather than red -- a property of the corpus, not of the
    // classifier.
    expect(scopeOf('`scripts/publish-cli.mjs`')).toBeNull();
    expect(scopeOf('`check-cli-reference.mjs:51`')).toBeNull();
    expect(scopeOf('packages/core')).toBeNull();
    expect(scopeOf('core-only')).toBeNull();
  });

  it('refuses the alias that no document uses', () => {
    // `every workspace, i.e. pnpm test` was the *value* of the checker's own `repo` entry, and
    // it never reached a message: only `Object.keys` of that object was read. The alias in the
    // classifier was a branch derived from a dead string, and deleting it was green across the
    // whole suite -- which is what makes `null` the honest answer rather than a regression:
    // rule 1 refuses a published count labelled this way, so the guess is replaced by a
    // question.
    expect(scopeOf('every workspace')).toBeNull();
    expect(scopeOf('every workspace test suite')).toBeNull();
    // The note is prose about what `repo` means, and prose is not a label.
    expect(SCOPE_NOTES.repo).toContain('every workspace');
  });

  it('answers the word wherever a label puts it, as long as it stands alone', () => {
    // The shapes in the corpus that are not the canonical label: a coverage row, a run row,
    // and a row whose label is the scope and nothing else.
    expect(scopeOf(' coverage — cli ')).toBe('cli');
    expect(scopeOf(' cli tests / coverage ')).toBe('cli');
    expect(scopeOf('`core` coverage, statements / branches / functions / lines')).toBe('core');
    expect(scopeOf(' cli ')).toBe('cli');
  });
});

describe('doc-counts-vocabulary · the names agree with their three readers', () => {
  it('gives every scope a note, so the refusal can say which one it meant', () => {
    // These notes were the checker's private object, and nothing printed them: only its keys
    // were read, twice. A value no message contains is a value a reader of the code will
    // believe is shown to operators. Moving them beside the vocabulary makes them one thing
    // with the words, and `check-doc-counts.test.ts` asserts the refusal prints them.
    expect(Object.keys(SCOPE_NOTES)).toEqual(SCOPES);
    for (const scope of SCOPES) {
      expect(SCOPE_NOTES[scope as keyof typeof SCOPE_NOTES].length).toBeGreaterThan(8);
    }
  });

  it('measures exactly the scopes the vocabulary names', () => {
    // The writer spawns one run per entry and the checker reads the result by name, so a name
    // in one list and not the other is a row that is either never written or never checked.
    // The writer's entries carry a filter and argv, which the vocabulary has no business
    // knowing; the *names* are the vocabulary's.
    expect(PUBLISHED_SCOPES.map((entry: { name: string }) => entry.name)).toEqual(SCOPES);
    for (const entry of PUBLISHED_SCOPES as { name: string; args: unknown }[]) {
      expect(Array.isArray(entry.args), `${entry.name} has no argv to run`).toBe(true);
      expect(entry.args as unknown[]).not.toHaveLength(0);
    }
  });

  it('builds its arithmetic out of the same three words', () => {
    // `repo` is the whole and the two packages are its parts. A fourth scope would have to
    // meet this relation or say why it does not, and until this round nothing compared the
    // two lists at all.
    expect(ADDITIVE_SCOPES.parts).toEqual(SCOPES.filter((scope: string) => scope !== ADDITIVE_SCOPES.whole));
    expect(SCOPES).toContain(ADDITIVE_SCOPES.whole);
  });

  it('keeps the marker vocabulary that decides which row is a claim about this commit', () => {
    // The other half of the module, unchanged this round and pinned here because this is the
    // only test that imports the file: a marker list is what rule 3 keys on, and the corpus's
    // newest ledger rows say `(as of this commit)` in as many words.
    expect(CURRENT_MARKERS).toEqual(['as of this commit', 'current state']);
    const text = progressCorpus()
      .map((file) => file.text)
      .join('\n');
    for (const marker of CURRENT_MARKERS) {
      expect(text, `no row in the corpus carries '${marker}'`).toContain(marker);
    }
  });
});
