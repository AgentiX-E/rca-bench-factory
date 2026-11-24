#!/usr/bin/env node
/**
 * Hold the test counts published in `docs/progress.md` to the scopes they claim.
 *
 * ## Why this exists
 *
 * `docs/progress.md` publishes test and file counts in its `### Verified` tables,
 * and it says of itself that its numbers are measurements -- that they decay and
 * must be retaken. Nothing enforced that. The roadmap carries the gap as P2-4:
 *
 * > the numbers in `progress.md` say they are measurements and decay, but relying
 * > on someone remembering to retake them is not reliable. Only a check that can
 * > fail is a check.
 *
 * Measured before this guard existed, the file's counts disagreed with each
 * other in a way no reader could see. Two rows both labelled `test suite`:
 *
 *   | test suite | **111 files, 3231 tests passed** |     <- whole repo
 *   | test suite | **108 files, 3059 tests passed** |     <- core package only
 *
 * The same label carried two different scopes, and the first of them was one
 * test stale (`pnpm test` reports 111 files / 3232 tests). Every gate was green
 * throughout, because nothing read these numbers.
 *
 * ## What it checks
 *
 * Not "the number equals today's count" -- that would be wrong, because every
 * count here is a *dated record* of the pass that took it, and they are supposed
 * to differ. What is checked is the property that makes such a record readable:
 *
 *   1. **A count must name its scope.** A row whose value is a file/test count
 *      must say which scope it measured, using a closed vocabulary, because
 *      `108 files, 3059 tests` is true of `packages/core` and false of the repo.
 *   2. **A count with the current-pass marker must be current.** Rows marked as
 *      describing the state at this commit (see `CURRENT_MARKERS`) are the ones a
 *      reader takes as "now", so those must *equal* what the suite actually
 *      reports, within the scope they named. Equality, not a bound: see the
 *      comment in rule 3 for why the one-sided version was undetectable.
 *   3. **Counts are internally consistent.** The number of test files cannot
 *      exceed the number of tests, and every scope's counts must be monotone
 *      non-decreasing over the file, because a suite that lost tests is either a
 *      regression or a mislabelled scope -- both worth failing on.
 *   4. **A count must be *in a shape this guard can read*, or be excused in
 *      writing.** Rules 1 to 3 are only ever applied to the rows the reader
 *      matched, so a row written in a shape it does not know is not checked at
 *      all -- and a shape the reader cannot read is indistinguishable from a
 *      shape that is not there. That is not hypothetical. Measured at the
 *      revision that added this rule: 88 table rows in `docs/progress.md` carry
 *      a count-bearing phrase, the three shapes then known read **25** of them,
 *      and one of the 63 skipped rows was
 *
 *        | core | 2623 passed (87 files); `src` 100 / 100 / 100 / 100 |
 *
 *      `packages/core/test` has never held 87 test files -- checked against every
 *      commit in `git log`, not remembered -- while 87 = 84 (core) + 3 (cli) at
 *      that moment, and 2623 = 2445 (core, the row above it) + 173 (cli) + 5. The
 *      row published the whole workspace's count under the label `core`: the
 *      defect rule 1 was written for, sitting in the one shape the reader could
 *      not read. Rule 4 is that gap closed at the granularity the other rules
 *      work at -- a row that names a scope must have its count read, and the
 *      phrases that are deliberately not measured are listed in `UNMEASURED`
 *      with a reason.
 *
 * ## Subject, and what it excludes
 *
 * The subject is **table rows**. Rules 1 to 3 are each defined over a row -- a
 * label cell to read the scope from, an order over the file, a marker -- and a
 * count narrated inside a pass's prose has none of those. Prose is therefore out
 * of subject rather than silently half-covered. The residual is stated rather
 * than hidden: a stale number narrated in prose still has no reader, and a count
 * written in an unrecognised shape under a label that names no scope is outside
 * rule 4's subject as well, because such a row is worded exactly like the battery
 * verdicts (`| mutation | 26 passed |`) that share its wording and are not suite
 * counts. Both gaps are narrow; both are recorded here so that closing them later
 * is a decision rather than a discovery.
 *
 * ## How the measurement is obtained
 *
 * Not by spawning the suite here. This guard runs as the last step of
 * `docs:check` *and* inside the test suite, so `execFileSync('pnpm', ['test'])`
 * in it would recurse -- and the first version did exactly that, which showed up
 * as this guard's own failure output inside vitest's report. Measurement is
 * therefore split out into `measure-doc-counts.mjs`, which writes
 * `golden-master/doc-counts.json`; this guard reads that file, or a value handed
 * in with `--measured`, which is what the test file does.
 *
 * The counts are still not hard-coded here: the committed measurement is retaken
 * from the suite, and `pnpm docs:counts:check` fails when it is stale.
 *
 *   node scripts/check-doc-counts.mjs
 *   node scripts/check-doc-counts.mjs --measured '{"core":{"files":108,"tests":3059}}'
 *   node scripts/check-doc-counts.mjs --doc <path> --measured <json>
 *
 * `--doc` points the guard at another document, which is how the test drives it
 * against a fixture instead of asserting today's file, and `--unmeasured`
 * substitutes rule 4's exemption table, which is how the test reaches that
 * table's own three refusal branches.
 */

import { existsSync, readFileSync, writeSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_MARKERS, SCOPES, SCOPE_NOTES, scopeOf } from './doc-counts-vocabulary.mjs';
import { checkCountAdditivity } from './doc-count-additivity.mjs';
import { sourcesIn } from './comment-language.mjs';
import { progressCorpus } from './docs-corpus.mjs';
import { claimedSites } from './site-proofs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const PROGRESS = resolve(ROOT, 'docs', 'progress.md');

/** The corpus: the index and every volume, in reading order. */
function corpusFiles() {
  const single = argValue('--doc');
  // `--doc` still names one file: the tests drive this script over fixtures, and a
  // fixture is one file. The default is the corpus, because that is what the
  // document became.
  if (single !== undefined) return [{ label: relative(ROOT, single), path: single, text: readFileSync(single, 'utf8') }];
  return progressCorpus();
}

// Scopes a published count may declare. The words live in `doc-counts-vocabulary.mjs`, with
// the classifier that reads them and the note that explains each one: this file used to keep
// a second copy whose `repo` value (`every workspace, i.e. pnpm test`) was never printed --
// only its keys were -- and that dead string is where the classifier's `every workspace`
// alias came from (finding 565). A refusal is the only place the words reach a reader, so
// this is where they have to be spelled out rather than implied.
const namedScopes = SCOPES.map((scope) => `${scope} = ${SCOPE_NOTES[scope]}`).join(', ');

/**
 * The heading that opens a round, and the token it names.
 *
 * `docs/progress/volume-NN.md` opens one `## ` section per round, and `docs/progress.md`
 * opens sections that name no round at all (`## Repository`, `## Open`). So the pattern is
 * the whole rule for "is this row under a round": a heading that carries a `vX.YY` token
 * opens a round, and any other heading opens a place where a row is under none.
 */
const ROUND_HEADING = /^## (v\d+\.\d+)(?!\d)/;

/**
 * The date a row carries, `(at v3.41)`, and the token it names.
 *
 * A dated row is a *record*: it says which round measured it, which is why rule 3 stops applying to
 * it. Until `O-115` nothing read the token, so a row could name a round that had not been written --
 * `(at v3.200)` under `## v3.138` -- and the corpus's 230 dated rows were quoted without their dates
 * ever being compared with anything.
 */
const AT_ROUND = /\(at (v\d+\.\d+)(?!\d)\)/;

/** The numbers in a round token, or null when the token is not one. */
function roundNumbers(token) {
  const m = /^v(\d+)\.(\d+)$/.exec(token ?? '');
  return m === null ? null : [Number(m[1]), Number(m[2])];
}

/**
 * Whether one round token is the same as, or older than, another pair of numbers.
 *
 * A named predicate rather than two inline comparisons, because rule 3c asks it twice -- once
 * against the round a row sits under and once against the newest round in the corpus -- and two
 * copies of a comparison that has to agree is how a pair of rules comes to disagree about `v3.9`.
 */
function sameOrOlder(a, b) {
  return a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
}

/**
 * The newest round that publishes a count, or null when the corpus names none.
 *
 * Null is the state a single-file fixture is in and the state `--doc` is driven in: a document
 * with no round heading has no newest one, and rule 3b then has nothing to say rather than a
 * verdict to give. The numbers are compared as numbers because `v3.9` is older than `v3.10`
 * and the corpus spans two major series (`v2.12` and `v3.137`).
 */
function newestRound(rows) {
  let best = null;
  for (const row of rows) {
    const mine = roundNumbers(row.round);
    if (mine === null) continue;
    const theirs = roundNumbers(best);
    if (theirs === null || mine[0] > theirs[0] || (mine[0] === theirs[0] && mine[1] > theirs[1])) {
      best = row.round;
    }
  }
  return best;
}

// A row is taken as claiming the state at *this commit* only when it says so in
// as many words. Everything else is a dated record of the pass that took it, and
// those are supposed to differ from today -- a record that tracked the live count
// would stop being a record.
//
// The first version of this guard treated "unchanged (docs only)" and "one more
// than Pass 32" as current-state markers because they describe the count as
// still holding. That was wrong and the guard failed its own first live run:
// both phrases are *comparisons to that pass's predecessor*, so they are
// historical by construction, and reading them as "now" made the guard fire the
// moment any test was added anywhere. A guard that fires on ordinary work is a
// nuisance, and a nuisance gets disabled -- which is how a check stops being one.
// See `doc-counts-vocabulary.mjs` for why this list is not restated here.

/**
 * The shapes that publish a count of files and tests.
 *
 * Ordered, because the first match on a row wins: a row reading
 * `111 files, 3232 tests passed` matches both the first and the second entry, and
 * they agree, but `2437 passed (83 files)` must be matched by the shape that
 * knows about the parenthesised file count rather than by the bare test-count
 * shape that would leave the 83 unread.
 *
 * These are the shapes the document has actually used, found by reading every
 * table row rather than by guessing which ones a reader ought to support. The
 * list is the reason rule 4 exists: three entries here meant 63 rows that publish
 * a count and are checked by nothing.
 */
const PAIR_SHAPES = [
  {
    name: 'N files, M tests passed',
    re: /(\d+)\s*files?[,\s]+(\d+)\s*(?:tests?\s*)?passed/g,
    filesFirst: true,
  },
  { name: 'N files, M tests', re: /(\d+)\s*files?[,\s]+(\d+)\s*tests?/g, filesFirst: true },
  { name: 'N passed / M files', re: /(\d+)\s*(?:tests?\s*)?passed\s*\/\s*(\d+)\s*files?/g },
  { name: 'N tests / M files', re: /(\d+)\s*tests?\s*\/\s*(\d+)\s*files?/g },
  { name: 'N passed (M files)', re: /(\d+)\s*(?:tests?\s*)?passed\s*\(\s*(\d+)\s*files?\s*\)/g },
];

/**
 * A test count with no file count beside it.
 *
 * Accepted only on a row that names a scope, and that gate is not cosmetic: a
 * battery verdict reads the same way (`| mutation | 26 passed |`), so reading
 * this shape everywhere would demand a scope word from rows that have no scope to
 * name, and the way to make that failure go away is to stop reading the shape.
 */
const BARE_TESTS = /(\d+)\s*(?:tests?\s*)?passed/;

/**
 * A phrase that carries a count of files or tests: a number and, as its own word,
 * one of the unit words. Deliberately loose -- it is the census rule 4 is applied
 * to, so missing a phrase is the failure mode that matters, not matching one too
 * many.
 *
 * `passed` is not one of the units, and the reason is provable rather than a
 * preference. Rule 4 only examines rows the reader did *not* read, and an unread
 * row is precisely one where `BARE_TESTS` did not match -- so it contains no
 * `N passed` phrase. A unit the census can never see would be dead weight that
 * reads like coverage, which is the failure this whole guard is about. `files` and
 * `tests` are reachable in the same situation, because a row can carry `N files`
 * or `N tests` and still be read by nothing -- which is the shipped defect.
 */
const COUNT_PHRASE = /\b\d[\d,]*\s+(?:files?|tests?)\b/g;

/**
 * Phrases a scope-named row may publish without this guard measuring them.
 *
 * Each entry is a *shape* -- the phrase with its digits normalised -- rather than
 * a line number, because a line number moves whenever anything above it is
 * edited, and an exemption that has to be re-signed on every unrelated edit gets
 * re-signed without being read. The same reasoning removed by-module exemptions
 * from the export-surface enumeration: the ability to write "this is fine" for a
 * whole module was replaced by "this symbol, for this reason".
 *
 * The reason is checked: an exemption with no reason, with a reason shorter than
 * `MIN_REASON`, or sharing a reason with another entry, fails the run. An
 * exemption list nobody checks is the same blind spot one level in.
 */
const UNMEASURED = [
  {
    shape: 'N file x dimension pairs',
    reason:
      'a file x dimension pair count is a figure about the coverage matrix, not about how many files and tests a suite has',
  },
];

const MIN_REASON = 40;

/**
 * The shapes that publish a count from the gate-site inventory.
 *
 * `docs/acceptance.md` published "Measured at 105 of 105 in both halves" about an inventory that
 * held 203 claims, and no rule above could see it: those rules read *table rows* and file/test
 * counts, and this is a sentence about failure sites. It is the same defect the guard was written
 * for, one unit over, and it had a reader -- an external review quoted the 105 as the current
 * figure, which is how it was found.
 *
 * `fields` names what each captured number is, in order, so one reader can serve all three
 * sentences and the comparison stays about the inventory rather than about the wording.
 */
const GATE_SITE_CLAIMS = [
  { name: 'N of N claim(s)', re: /(\d+)\s+of\s+(\d+)\s+claim\(s\)/g, fields: ['claims', 'claims'] },
  {
    name: 'N claim(s) across M of K file(s)',
    re: /(\d+)\s+claim\(s\)\s+across\s+(\d+)\s+of\s+(\d+)\s+file\(s\)/g,
    fields: ['claims', 'files', 'sourceFiles'],
  },
  {
    name: 'N claim(s) across M file(s)',
    re: /(\d+)\s+claim\(s\)\s+across\s+(\d+)\s+file\(s\)/g,
    fields: ['claims', 'files'],
  },
  { name: 'N failure site(s)', re: /(\d+)\s+failure\s+site\(s\)/g, fields: ['sites'] },
];

/**
 * A sentence that says which round it is about.
 *
 * The corpus's volumes are records: `105 of 105` was true in the round that measured it, and the
 * same shape appears there a dozen times across a dozen rounds. A record is not a stale claim --
 * it is a dated one -- so the subject of rule 5 is the documents that speak in the present, and a
 * line that carries an explicit round is read as what it is.
 */
const DATED = /\b(?:at|as of)\s+v\d+\.\d+\b/;

/**
 * Documents that describe the present rather than a round.
 *
 * Not added to the progress corpus: rules 1 to 4 demand a *scope* word from every row they read,
 * and a spec's prose is not a status table. Reading these two files here, for one shape, keeps
 * each rule's subject as narrow as the thing it measures.
 */
function presentTenseDocuments() {
  const single = argValue('--present');
  if (single !== undefined) {
    return [{ label: relative(ROOT, single), text: readFileSync(single, 'utf8') }];
  }
  return [resolve(ROOT, 'docs', 'acceptance.md'), resolve(ROOT, 'README.md')]
    .filter((path) => existsSync(path))
    .map((path) => ({ label: relative(ROOT, path), text: readFileSync(path, 'utf8') }));
}

/**
 * The inventory's own counts, read from the artefact rather than copied into a second one.
 *
 * `golden-master/gate-sites.json` is derived from the tree by `derive-gate-sites.mjs --check`, and
 * `claimedSites` is the same function the two proof gates use to decide what to run. Reading it here
 * is one artefact and one implementation; a copy in `doc-counts.json` would be a second of each,
 * and the copy would be the one that went stale.
 *
 * ## Why `files` now has a denominator
 *
 * The summary printed `229 claim(s) across 66 file(s)`, and `check-comments-language` printed
 * `471 file(s)` nine lines away. Both numbers are `file(s)`, and 66 is *inside* 471 -- every gate
 * site is proved by a test, and the comment guard reads every source file -- but no line said so,
 * so a reader holding the two had to decide whether they were two populations or one counted twice.
 * That is finding 603 one gate up, and the repair is the same `of`, with the denominator derived
 * from the walk rather than written down: a number copied here would go stale the first time a test
 * file was added, which is every round.
 *
 * The denominator is only sound while the inclusion holds, so rule 6 refuses a gate site proved by
 * a file the source walk does not read. Without it the sentence would be arithmetic over two
 * populations that only happen to nest.
 */
function gateSiteReading() {
  const inventory = JSON.parse(readFileSync(resolve(ROOT, 'golden-master', 'gate-sites.json'), 'utf8'));
  const claimed = claimedSites(inventory);
  const sources = new Set(sourcesIn(ROOT));
  const files = new Set(claimed.map((claim) => claim.file));
  const outside = [...files].filter((file) => !sources.has(file)).sort();
  return {
    sites: Array.isArray(inventory.sites) ? inventory.sites.length : 0,
    claims: claimed.length,
    files: files.size,
    sourceFiles: sources.size,
    outside,
  };
}

/**
 * Every gate-site count published in a document that speaks in the present.
 *
 * A line carrying a date is skipped, and the skip is the rule rather than an exemption: a record
 * whose number was right when it was written is not an error, and the vocabulary for saying so
 * already exists in the corpus (`(at v3.65)`).
 */
function readGateSiteClaims() {
  const out = [];
  for (const doc of presentTenseDocuments()) {
    doc.text.split('\n').forEach((raw, i) => {
      // Emphasis is stripped before matching because a count is bolded the moment it matters:
      // `**203 of 203** claim(s)` is the same sentence as `203 of 203 claim(s)` to a reader, and a
      // rule that answered differently depending on the asterisks would be reading the markup
      // instead of the claim.
      const line = raw.replace(/\*\*/g, '').replace(/`/g, '');
      if (DATED.test(line)) return;
      for (const shape of GATE_SITE_CLAIMS) {
        shape.re.lastIndex = 0;
        for (const match of line.matchAll(shape.re)) {
          out.push({
            where: doc.label,
            line: i + 1,
            text: match[0],
            shape: shape.name,
            fields: shape.fields,
            values: shape.fields.map((_, index) => Number(match[index + 1])),
          });
        }
      }
    });
  }
  return out;
}

/**
 * Print and exit, synchronously.
 *
 * `console.log`/`console.error` write to a pipe asynchronously, and `process.exit` does not wait
 * for them -- so a verdict can be *lost* while the exit code survives, and a caller sees "exit 1
 * with no message" or, worse, nothing at all. A whole-suite run produced thirteen assertions in
 * `check-doc-counts.test.ts` reading `the guard exited 0 without printing` from a guard that has
 * exactly two exits and prints at both; whether that was a lost write or a child that never got
 * scheduled, the fix on this side is the same: the bytes go into the descriptor before the process
 * ends, so a verdict cannot be truncated by its own exit.
 */
function verdict(fd, text) {
  writeSync(fd, `${text}\n`);
}

function fail(lines) {
  verdict(2, 'check-doc-counts: FAILED');
  for (const line of lines) verdict(2, `  ${line}`);
  process.exit(1);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** A line that is part of a markdown table, and not its separator row. */
function isTableRow(line) {
  if (!/^\s*\|/.test(line)) return false;
  return !/^\s*\|[\s|:-]*\|?\s*$/.test(line);
}

// `scopeOf` lives in `doc-counts-vocabulary.mjs` beside the marker list, because
// `measure-doc-counts.mjs` has to answer the same question to decide which row to
// rewrite. A second copy would let the writer pick a row this guard never reads.

/**
 * The clause a count phrase sits in, with its digits normalised.
 *
 * Used as the key of an exemption. Bounded by the punctuation that separates one
 * clause from the next inside a cell, so `217 file x dimension pairs, 0 below
 * 95%` keys as `N file x dimension pairs` -- the phrase and what it is a count
 * *of* -- rather than as the whole cell.
 */
function phraseShape(row, start, end) {
  const delimiters = [',', ';', '|', '(', ')'];
  let from = 0;
  for (const d of delimiters) {
    const i = row.lastIndexOf(d, start);
    if (i > from) from = i + 1;
  }
  let to = row.length;
  for (const d of delimiters) {
    const i = row.indexOf(d, end);
    if (i !== -1 && i < to) to = i;
  }
  return row
    .slice(from, to)
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull every published file/test count out of a markdown document.
 *
 * One entry per table row: the first shape that matches is the row's count. A row
 * is returned whether or not a shape matched, as long as a shape matched *or* it
 * names a scope and carries a count-bearing phrase -- the second case is what
 * rule 4 refuses, and a reader that returned only its matches could not see it.
 *
 * The round a row sits under travels with it (`O-111`). It is a second index into the same
 * line rather than a second reading of it: a `## ` heading opens a round, every row after it
 * belongs to that round until the next heading, and a heading that names no round
 * (`## Headline`, `## Open`) opens a section in which a row is under no round at all. The
 * distinction is what rule 3b needs and what a line number cannot say: a claim about *now*
 * is a claim about one round, and which one is a property of where the claim sits.
 */
function readCounts(text, where = 'docs/progress.md') {
  const out = [];
  let round = null;
  text.split('\n').forEach((line, i) => {
    if (line.startsWith('## ')) {
      ROUND_HEADING.lastIndex = 0;
      round = ROUND_HEADING.exec(line)?.[1] ?? null;
      return;
    }
    if (!isTableRow(line)) return;
    const label = line.split('|')[1] ?? '';
    const scope = scopeOf(label);

    let shape = null;
    let files = null;
    let tests = null;
    for (const candidate of PAIR_SHAPES) {
      candidate.re.lastIndex = 0;
      const m = candidate.re.exec(line);
      if (!m) continue;
      const [a, b] = [Number(m[1]), Number(m[2])];
      files = candidate.filesFirst ? a : b;
      tests = candidate.filesFirst ? b : a;
      shape = candidate.name;
      break;
    }
    if (shape === null && scope !== null) {
      BARE_TESTS.lastIndex = 0;
      const m = BARE_TESTS.exec(line);
      if (m) {
        tests = Number(m[1]);
        shape = 'N passed (no file count)';
      }
    }

    COUNT_PHRASE.lastIndex = 0;
    const phrases = [...line.matchAll(COUNT_PHRASE)];
    if (shape === null && (scope === null || phrases.length === 0)) return;

    out.push({
      where,
      line: i + 1,
      round,
      dated: AT_ROUND.exec(line)?.[1] ?? null,
      text: line,
      label,
      scope,
      files,
      tests,
      shape,
      read: shape !== null,
      phrases: phrases.map((p) => ({
        text: p[0],
        shape: phraseShape(line, p.index, p.index + p[0].length),
      })),
    });
  });
  return out;
}

function isCurrent(row) {
  return CURRENT_MARKERS.some((mk) => row.text.includes(mk));
}

/**
 * The file the measurement is committed to, and the sentence the green line prints about it.
 *
 * A guard that compares two things has to say which two (`O-110`). This one joins the published
 * rows to a **snapshot** -- a number somebody took, held in a file -- and not to the tree, so the
 * snapshot and the rows that quote it can be wrong *together*: measured at v3.137, one test off,
 * this guard's exit **0** while the reader that re-derives returned **1**. Nothing in the output
 * distinguished "the documents agree with the tree" from "the documents agree with the last
 * measurement", and a green line that cannot be told apart from the stronger claim is the whole
 * defect.
 *
 * The repair is not for this gate to read a report when one happens to be present. The reports are
 * written by the coverage step, so a tree that has not run coverage has none, and a verdict whose
 * meaning depends on whether another command was run is a gate with two meanings -- the worse of
 * the two options `O-110` weighed. The repair is for the sentence to name both sides of the
 * comparison it actually made, and to name the reader that would re-take the measurement, which is
 * the one command a developer who stops at `docs:check` has not run.
 *
 * `--measured` is how the suite drives this guard, and it is a *different* comparison: the numbers
 * came from the caller and no file was opened. The two sentences are separate constants because
 * they are separate read paths, and one string with a hole in it would let the wrong one be printed
 * for the right reason.
 */
const SNAPSHOT = 'golden-master/doc-counts.json';
const REPORTER = 'node scripts/measure-doc-counts.mjs --check';
const FROM_SNAPSHOT =
  `the counts it compared with were read from \`${SNAPSHOT}\`, which is a snapshot rather than a ` +
  `run: this gate does not spawn the suite, and \`${REPORTER}\` is the reader that re-derives it`;
const HANDED_IN =
  `the counts it compared with were passed in (--measured), so this gate read no file of its own, ` +
  `and \`${REPORTER}\` remains the reader that re-derives them`;

/**
 * The live counts, from the file the suite writes, or from `--measured`.
 *
 * This guard must never spawn the suite itself. It runs as the last step of
 * `docs:check` *and* it runs inside the test suite, so an `execFileSync('pnpm',
 * ['test'])` here would recurse: the first version did, and the failure was
 * visible as this guard's own failure output appearing inside vitest's report.
 *
 * So the measurement is taken once, by `measure-doc-counts.mjs`, into a
 * committed file, and this guard reads it. That also makes the check cheap
 * enough to sit in `docs:check` on every run.
 */
function liveCounts() {
  const raw = argValue('--measured');
  if (raw) {
    // The counts came from the caller rather than from a file this gate opened, and the sentence
    // the green line prints says which -- a comparison described as "the snapshot" when nothing was
    // read would be a sentence about a read that did not happen (`O-110`).
    return { counts: JSON.parse(raw), comparedWith: HANDED_IN };
  }
  const file = resolve(ROOT, SNAPSHOT);
  if (!existsSync(file)) {
    fail([
      `no measurement at ${file}.`,
      'Run `node scripts/measure-doc-counts.mjs` to take one, or pass --measured.',
      'This guard reads a measurement rather than taking one, because it also',
      'runs inside the suite and must not recurse into it.',
    ]);
  }
  return { counts: JSON.parse(readFileSync(file, 'utf8')), comparedWith: FROM_SNAPSHOT };
}

/**
 * Rule 4's exemption table, from the committed list or from `--unmeasured`.
 *
 * Validated before it is used, and refused rather than tolerated when it does not
 * hold: an exemption with an empty reason, with a reason too short to say
 * anything, or duplicating another entry's, is a sentence that looks like a
 * justification and is not one.
 */
function exemptions() {
  const raw = argValue('--unmeasured');
  const table = raw === undefined ? UNMEASURED : JSON.parse(raw);
  const problems = [];
  const seen = new Map();
  for (const entry of table) {
    const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
    const shape = typeof entry?.shape === 'string' ? entry.shape : '(no shape)';
    if (reason.length < MIN_REASON) {
      problems.push(
        `exemption '${shape}': the reason must be at least ${MIN_REASON} characters and say why this ` +
          `count is not a suite count. An exemption nobody can read is an exemption nobody re-checks.`,
      );
      continue;
    }
    if (seen.has(reason)) {
      problems.push(
        `exemption '${shape}': its reason is the same as '${seen.get(reason)}'s. Two exemptions that read ` +
          `the same way are one exemption written twice, and the second shape was never actually justified.`,
      );
      continue;
    }
    seen.set(reason, shape);
  }
  if (problems.length) fail(problems);
  return table;
}

function main() {
  const rows = corpusFiles().flatMap((file) => readCounts(file.text, file.label));
  /** Where a row was read from: a line number is not actionable in a five-file corpus. */
  const at = (row) => `${row.where}:${String(row.line)}`;
  if (rows.length === 0) {
    fail([
      'no file/test counts found in docs/progress.md.',
      'This guard exists because those counts were published without a declared',
      'scope, so finding none means the file changed shape and this check is now',
      'blind rather than passing.',
    ]);
  }

  const table = exemptions();
  const problems = [];
  const read = rows.filter((r) => r.read);

  // 1. Every count names its scope.
  for (const row of read) {
    if (row.scope === null) {
      problems.push(
        `${at(row)}: publishes ${row.files} files / ${row.tests} tests without naming ` +
          `its scope. Say which one it measured (${namedScopes}) -- ` +
          `"108 files, 3059 tests" is true of core and false of the repo, and that is how ` +
          `two rows labelled "test suite" came to disagree.`,
      );
    }
  }

  // 2. Counts are internally consistent, and monotone per scope over the file.
  const lastByScope = new Map();
  for (const row of read) {
    if (row.files !== null && row.files > row.tests) {
      problems.push(
        `${at(row)}: ${row.files} files exceeds ${row.tests} tests, which cannot be a suite.`,
      );
    }
    if (row.scope === null) continue;
    const prev = lastByScope.get(row.scope);
    if (prev && row.tests < prev.tests) {
      problems.push(
        `${at(row)}: ${row.scope} tests fell from ${prev.tests} (${at(prev)}) to ` +
          `${row.tests}. A suite that lost tests is a regression or a mislabelled scope; ` +
          `either way it should not pass unremarked.`,
      );
    }
    lastByScope.set(row.scope, row);
  }

  // 3. Rows marked current must equal the live measurement for their scope.
  const measurement = liveCounts();
  const measured = measurement.counts;

  // 3a. The measurement is two parts and a whole, and this is the only place the
  //     relation between them is computed. Rules 1 to 3 above hold *documents* to
  //     the declaration and never hold the declaration to arithmetic, so a part
  //     typed rather than measured survives all three: `docs:check` was green on
  //     a committed file that said 199 + 4 = 202 until this rule existed, and the
  //     only other step that compares the declaration to a run needs two vitest
  //     reports and therefore runs inside `verify:local`.
  //
  //     A `for` loop rather than `problems.push(...checkCountAdditivity(...))`:
  //     the spread guard refuses every `push(...x)` whose length is a function of
  //     its input, and carving out an exemption for an array that is bounded at
  //     two would weaken the guard to save one line.
  for (const problem of checkCountAdditivity(measured)) problems.push(problem);

  for (const row of read) {
    if (!isCurrent(row)) continue;
    if (row.scope === null) continue;
    const live = measured[row.scope];
    if (!live) {
      problems.push(
        `${at(row)}: no live measurement for scope '${row.scope}'. Rows marked as the ` +
          `current state must name a scope the measurement covers ` +
          `(${namedScopes}), so add the scope to SCOPES and retake.`,
      );
      continue;
    }
    // A row that marks itself as the current state has exactly one correct
    // value, so this is an equality. An earlier version tested only
    // `row > live`, reasoning that a suite which grew since a measurement is
    // normal -- but that made the rule undetectable in the direction that
    // matters: a stale count marked as current passed whether the marker was
    // recognised or not, so widening the marker vocabulary silently disabled
    // the whole rule. The mutation battery caught that, which is what it is for.
    //
    // A row that is *not* marked current may be smaller than the live count;
    // that is what `allows a dated record to differ from the live count` pins.
    if (row.files !== live.files || row.tests !== live.tests) {
      problems.push(
        `${at(row)}: declares the current state of '${row.scope}' as ` +
          `${row.files} files / ${row.tests} tests, but the suite has ` +
          `${live.files} / ${live.tests}. A row marked as the current state has one ` +
          `correct value; retake the measurement, or drop the marker if this is a ` +
          `dated record.`,
      );
    }
  }

  // 3b. A row marked as the current state sits under the newest round (`O-111`).
  //
  //     `current` is a claim about *this* tree, and a corpus has exactly one round that is the
  //     newest -- so there is one place in it where the claim can be true. v3.136's three suite
  //     rows were written `(as of this commit)` and were still marked current a round later; what
  //     caught them was v3.137 adding a test, which is an event rather than a rule, and a round
  //     that only edits documents moves no count, so the older rows would have stayed marked
  //     current for as long as nothing was measured. Two rounds each claiming to be now is a
  //     contradiction inside the documents, and this is the reader that can see it.
  //
  //     The repair is always available and it is never a new number: date the row `(at v3.136)`,
  //     which is what rule 3 then stops applying to, because a dated record is supposed to
  //     differ from today. A row under *no* round heading is left alone: `docs/progress.md`'s
  //     tables describe the tree rather than a round, rule 3 already holds them to the
  //     measurement, and the claim this rule is about is two **rounds** each saying "now".
  const newest = newestRound(rows);
  if (newest !== null) {
    for (const row of read) {
      if (!isCurrent(row)) continue;
      if (row.round === null || row.round === newest) continue;
      problems.push(
        `${at(row)}: a row marked as the current state sits under ${row.round}, and the newest ` +
          `round that publishes a count is ${newest}. "Now" is one round: date this row ` +
          `("(at ${row.round})") so a reader can tell a record from the state of the tree, or ` +
          `move it under ${newest} if it is this round's measurement.`,
      );
    }
  }

  // 3c. A date is not in the future of the round it is quoted in (`O-115`).
  //
  //     `(at v3.200)` under `## v3.138` is impossible: a round cannot record a measurement from a
  //     round that has not been written. Nothing read the pair, and the corpus quotes **230** dated
  //     rows -- 227 of them under a round -- so the rule is written over a population rather than
  //     against a state the tree has never been in. Two comparisons, because a dated row can sit in
  //     two places: under a round, where the two tokens are in view together, and outside every
  //     round (`docs/progress.md`'s own tables, three of them today), where the only round the date
  //     can be measured against is the newest one the corpus publishes.
  //
  //     The comparison is rule 3b's, one field over: a round token is a pair of numbers because
  //     `v3.9` is older than `v3.10`, and a string comparison would pass the impossible row and
  //     refuse the correct one.
  if (newest !== null) {
    for (const row of read) {
      if (row.dated === null) continue;
      const said = roundNumbers(row.dated);
      const under = roundNumbers(row.round);
      if (under === null) {
        if (sameOrOlder(said, roundNumbers(newest))) continue;
        problems.push(
          `${at(row)}: the row is dated (at ${row.dated}), and the newest round this corpus ` +
            `publishes is ${newest}. A date past every round names a measurement from a round that ` +
            `has not been written: either the date is a typo, or the round it belongs to is missing.`,
        );
        continue;
      }
      if (sameOrOlder(said, under)) continue;
      problems.push(
        `${at(row)}: the row is dated (at ${row.dated}) and sits under ${row.round}, and a round ` +
          `cannot record a measurement from a round that has not happened. Either the date is wrong, ` +
          `or the row belongs under ${row.dated}.`,
      );
    }
  }


  //    the rows the reader happened to match, and the row that publishes the
  //    workspace's count under the label `core` is checked by nothing.
  let excused = 0;
  for (const row of rows) {
    if (row.read || row.scope === null) continue;
    for (const phrase of row.phrases) {
      if (table.some((entry) => entry.shape === phrase.shape)) {
        excused += 1;
        continue;
      }
      problems.push(
        `${at(row)}: the '${row.scope}' row publishes "${phrase.text}" in a shape this guard ` +
          `cannot read, so rules 1 to 3 do not apply to it. Either write the count in one of the ` +
          `shapes it reads (${PAIR_SHAPES.map((s) => s.name).join('; ')}; or ` +
          `"${BARE_TESTS.source}" on a row that names a scope), or add the shape ` +
          `'${phrase.shape}' to UNMEASURED with a reason.`,
      );
    }
  }

  // 5. A published gate-site count names the *present*, and equals the inventory.
  //
  //    This is the count that drifted furthest without anyone noticing: `docs/acceptance.md`
  //    said "Measured at 105 of 105" while the inventory held 203 claims, and nothing read
  //    the sentence. The corpus's volumes carry the same shapes legitimately -- they are
  //    records, and `105 of 105` was true on the day it was measured -- so the subject here
  //    is the documents that describe the present, and a line that dates itself is a record.
  let siteClaims = 0;
  // One refusal per line, not one per shape. `203 of 203 claim(s) across 58 file(s)` matches two of
  // the three shapes, so a wrong figure would be reported twice for one sentence -- and a reader who
  // fixes the first line and re-runs learns the repair did not work, which is what a duplicate
  // verdict costs.
  const reported = new Set();
  for (const claim of readGateSiteClaims()) {
    siteClaims += 1;
    const derived = gateSiteReading();
    const wrong = claim.values.find((value, i) => value !== derived[claim.fields[i]]);
    if (wrong === undefined) continue;
    const key = `${claim.where}:${String(claim.line)}`;
    if (reported.has(key)) continue;
    reported.add(key);
    problems.push(
      `${key}: publishes "${claim.text}", but the inventory holds ` +
        `${String(derived.claims)} claim(s) across ${String(derived.files)} of the ` +
        `${String(derived.sourceFiles)} file(s) the source walk reads and ` +
        `${String(derived.sites)} failure site(s). The numbers come from golden-master/gate-sites.json, ` +
        `which derive-gate-sites.mjs --check holds to the tree; if this sentence is a record of an older ` +
        `tree, date it ("(at v3.40)") so a reader can tell it from the current state.`,
    );
  }

  // 6. The denominator of `66 of the 473` is only a denominator while the 66 are inside it.
  //
  //    The sentence this round wrote is arithmetic over two populations, and arithmetic over two
  //    populations is exactly what finding 600 was about: `66 of 473` means the 66 are part of the
  //    473, and if a gate site were ever proved by a file the comment guard does not read, the `of`
  //    would be the same kind of false -- a relation printed with nothing checking that it holds.
  //    The inclusion is not a coincidence of the tree; it is a rule, and this is the sentence that
  //    says so. It also names what would repair it, because the repair is not to drop the `of`.
  const split = gateSiteReading();
  if (split.outside.length > 0) {
    problems.push(
      `${split.outside.length} gate site(s) are proved by a file the source walk does not read, ` +
        `starting with ${split.outside[0]}: the summary says '${String(split.files)} of the ` +
        `${String(split.sourceFiles)} file(s) the source walk reads', and a proof outside that walk ` +
        `makes the partition false. Either move the proof into a source file, or teach ` +
        `comment-language.mjs's SOURCE_EXTENSIONS the kind of file it lives in.`,
    );
  }

  if (problems.length) fail(problems);

  const scopes = [...lastByScope.keys()].join(', ');
  const sites = gateSiteReading();
  verdict(
    1,
    `check-doc-counts: OK (${read.length} published count(s), each naming its scope; ` +
      `scope(s) covered: ${scopes}; ${excused} unread phrase(s) excused in writing; ` +
      `${siteClaims} gate-site claim(s) agreeing with ${String(sites.claims)} claim(s) across ` +
      `${String(sites.files)} of the ${String(sites.sourceFiles)} file(s) the source walk reads; ` +
      `${measurement.comparedWith})`,
  );
}

main();
