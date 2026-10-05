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
 * against a fixture instead of asserting today's file.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const PROGRESS = resolve(ROOT, 'docs', 'progress.md');

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
const CURRENT_MARKERS = ['as of this commit', 'current state'];

function fail(lines) {
  console.error('check-doc-counts: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Pull every published file/test count out of a markdown document.
 *
 * Recognises the two shapes the file actually uses. Both are matched on the
 * count, not on a table shape, so a count written in prose is found too -- the
 * defect this guards against was two rows that differed only in their scope.
 */
function readCounts(text) {
  const out = [];
  const lines = text.split('\n');
  // The file uses three shapes for the same fact:
  //   "**111 files, 3231 tests passed**"
  //   "**3045 passed / 107 files**"
  //   "**108 files, 3059 tests**"
  // A single pattern per shape would miss one, and a guard that misses a count
  // is blind in exactly the way this guard exists to prevent, so all three are
  // matched and the results deduplicated by (files, tests, offset).
  const patterns = [
    /(\d+)\s*files?[,\s]+(\d+)\s*tests?/g, // files first, "tests" optional
    /(\d+)\s*(?:tests?\s*)?passed\s*\/\s*(\d+)\s*files?/g, // "N passed / M files"
    /(\d+)\s*tests?\s*\/\s*(\d+)\s*files?/g, // "N tests / M files"
  ];

  lines.forEach((line, i) => {
    let m;
    for (const pat of patterns) {
      pat.lastIndex = 0;
      while ((m = pat.exec(line)) !== null) {
        // Whichever pattern matched, decide which number is which by looking at
        // what follows each capture in the matched text.
        const [a, b] = [+m[1], +m[2]];
        const span = m[0];
        const filesFirst = /^\s*(\d+)\s*files?/.test(span);
        const files = filesFirst ? a : b;
        const tests = filesFirst ? b : a;
        if (out.some((o) => o.line === i + 1 && o.files === files && o.tests === tests)) continue;
        out.push({ line: i + 1, text: line, files, tests });
      }
    }
    void i;
  });
  return out;
}

/**
 * Which scope a count declares, read from the row's own label.
 *
 * This is deliberately textual and narrow: it looks for the scope word in the
 * label cell of the same row, so a row that names core cannot be read as repo.
 */
function scopeOf(row, text) {
  const label = row.text.split('|')[1] ?? '';
  const lower = label.toLowerCase();
  if (/\bcore\b/.test(lower)) return 'core';
  if (/\bcli\b/.test(lower)) return 'cli';
  if (/\brepo\b|\bevery workspace\b/.test(lower)) return 'repo';
  // A bare "test suite" is ambiguous, which is the defect. Treat it as
  // undeclared so the reader must say which scope it means.
  if (/test suite/.test(lower)) return null;
  void text;
  return null;
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

function main() {
  const docPath = argValue('--doc') ?? PROGRESS;
  const text = readFileSync(docPath, 'utf8');
  const rows = readCounts(text);
  if (rows.length === 0) {
    fail([
      'no file/test counts found in docs/progress.md.',
      'This guard exists because those counts were published without a declared',
      'scope, so finding none means the file changed shape and this check is now',
      'blind rather than passing.',
    ]);
  }

  const problems = [];

  // 1. Every count names its scope.
  for (const row of rows) {
    if (scopeOf(row, text) === null) {
      problems.push(
        `line ${row.line}: publishes ${row.files} files / ${row.tests} tests without naming ` +
          `its scope. Say which one it measured (${Object.keys(SCOPES).join(', ')}) -- ` +
          `"108 files, 3059 tests" is true of core and false of the repo, and that is how ` +
          `two rows labelled "test suite" came to disagree.`,
      );
    }
  }

  // 2. Counts are internally consistent, and monotone per scope over the file.
  const lastByScope = new Map();
  for (const row of rows) {
    if (row.files > row.tests) {
      problems.push(
        `line ${row.line}: ${row.files} files exceeds ${row.tests} tests, which cannot be a suite.`,
      );
    }
    const scope = scopeOf(row, text);
    if (scope === null) continue;
    const prev = lastByScope.get(scope);
    if (prev && row.tests < prev.tests) {
      problems.push(
        `line ${row.line}: ${scope} tests fell from ${prev.tests} (line ${prev.line}) to ` +
          `${row.tests}. A suite that lost tests is a regression or a mislabelled scope; ` +
          `either way it should not pass unremarked.`,
      );
    }
    lastByScope.set(scope, row);
  }

  // 3. Rows marked current must equal the live measurement for their scope.
  const measured = liveCounts();
  for (const row of rows) {
    if (!isCurrent(row)) continue;
    const scope = scopeOf(row, text);
    if (scope === null) continue;
    const live = measured[scope];
    if (!live) {
      problems.push(
        `line ${row.line}: no live measurement for scope '${scope}'. Rows marked as the ` +
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
        `line ${row.line}: declares the current state of '${scope}' as ` +
          `${row.files} files / ${row.tests} tests, but the suite has ` +
          `${live.files} / ${live.tests}. A row marked as the current state has one ` +
          `correct value; retake the measurement, or drop the marker if this is a ` +
          `dated record.`,
      );
    }
  }

  if (problems.length) fail(problems);

  const scopes = [...lastByScope.keys()].join(', ');
  console.log(
    `check-doc-counts: OK (${rows.length} published count(s), each naming its scope; ` +
      `scope(s) covered: ${scopes})`,
  );
}

main();
