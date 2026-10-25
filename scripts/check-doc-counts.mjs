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
import { CURRENT_MARKERS, scopeOf } from './doc-counts-vocabulary.mjs';
import { progressCorpus } from './docs-corpus.mjs';

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

// Scopes a published count may declare. A count that declares none is refused,
// because the whole defect this guard exists for was an undeclared scope.
const SCOPES = {
  core: 'packages/core',
  cli: 'packages/cli',
  repo: 'every workspace, i.e. `pnpm test`',
};

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
 */
function readCounts(text, where = 'docs/progress.md') {
  const out = [];
  text.split('\n').forEach((line, i) => {
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
  if (raw) return JSON.parse(raw);
  const file = resolve(ROOT, 'golden-master', 'doc-counts.json');
  if (!existsSync(file)) {
    fail([
      `no measurement at ${file}.`,
      'Run `node scripts/measure-doc-counts.mjs` to take one, or pass --measured.',
      'This guard reads a measurement rather than taking one, because it also',
      'runs inside the suite and must not recurse into it.',
    ]);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
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
          `its scope. Say which one it measured (${Object.keys(SCOPES).join(', ')}) -- ` +
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
  const measured = liveCounts();
  for (const row of read) {
    if (!isCurrent(row)) continue;
    if (row.scope === null) continue;
    const live = measured[row.scope];
    if (!live) {
      problems.push(
        `${at(row)}: no live measurement for scope '${row.scope}'. Rows marked as the ` +
          `current state must name a scope the measurement covers ` +
          `(${Object.keys(SCOPES).join(', ')}), so add the scope to SCOPES and retake.`,
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

  // 4. A row that names a scope must have its count read, or the phrase must be
  //    excused in writing. Without this, the three rules above apply to exactly
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

  if (problems.length) fail(problems);

  const scopes = [...lastByScope.keys()].join(', ');
  verdict(
    1,
    `check-doc-counts: OK (${read.length} published count(s), each naming its scope; ` +
      `scope(s) covered: ${scopes}; ${excused} unread phrase(s) excused in writing)`,
  );
}

main();
