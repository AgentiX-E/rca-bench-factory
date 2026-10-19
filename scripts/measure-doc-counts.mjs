#!/usr/bin/env node
/**
 * Take the suite counts that `docs/progress.md` is checked against, and write
 * them to `golden-master/doc-counts.json`.
 *
 * ## Why this is a separate script
 *
 * `check-doc-counts.mjs` holds the published counts to their scopes, and it has
 * to read a measurement to do that. It must not *take* one: the guard runs both
 * as the last step of `docs:check` and inside the test suite, so a suite spawn
 * inside it would recurse into vitest from vitest. The first draft did exactly
 * that, and the symptom was the guard's own failure output appearing inside
 * vitest's report.
 *
 * So measurement and checking are split. This script spawns the suite, parses
 * vitest's summary lines, and writes the result. The guard only reads the file.
 * That also keeps the guard cheap enough to sit in `docs:check` on every run.
 *
 * ## Which numbers, and why these three scopes
 *
 * `docs/progress.md` publishes counts under three scopes and, before the guard
 * existed, used the same label for two of them. The scopes are fixed here, and
 * the guard refuses a published count that does not name one of them, so the
 * label can no longer be ambiguous:
 *
 *   core  `pnpm --filter @rca-bench-factory/core test`
 *   cli   `pnpm --filter @rca-bench-factory/cli  test`
 *   repo  `pnpm test` -- every workspace
 *
 * The suite is run once per scope. The three runs overlap, and running all
 * three rather than deriving `repo` by addition is deliberate: a sum would
 * assert the workspace list, while three measurements assert the thing a reader
 * would check by hand.
 *
 * ## Usage
 *
 *   node scripts/measure-doc-counts.mjs
 *   node scripts/measure-doc-counts.mjs --out /tmp/doc-counts.json
 *   node scripts/measure-doc-counts.mjs --check   # fail if the committed file is stale
 *   node scripts/measure-doc-counts.mjs --check --from <report>[,<report>]
 *   node scripts/measure-doc-counts.mjs --write-doc [--doc <path>] [--from ...]
 *
 * ## `--write-doc`, and the two-step update it removes
 *
 * The snapshot and the published row in `docs/progress.md` used to be refreshed
 * separately: one by this command, the other by a hand `str.replace` on a
 * 7000-line file. Doing one without the other is green **locally** and red only at
 * the CI step that compares them -- and the two steps are not equally obvious.
 *
 * `--write-doc` performs one measurement and writes both. Nothing is written until
 * both can be: a failure between the two writes would leave exactly the half-state
 * the flag exists to remove. Rows that are *not* marked as current are never
 * touched, because they are dated records and are supposed to differ from today.
 *
 * `--check` against a missing `--out` fails before measuring anything. The
 * comparison could not have succeeded, so the three suites are not worth
 * spawning to find that out, and the short circuit is what lets the test suite
 * prove this failure path without recursing.
 *
 * ## `--from`: reading the run that already happened
 *
 * The three spawns above cost **80 seconds**, and the coverage step in CI has
 * already run the same suite by the time a check would take place. Pass 54 tried
 * the obvious wiring -- a second `docs:counts:check` step in the same job -- and
 * the runner refused it: a second full suite in one job trips
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` **with every test green**,
 * so the failure named no test and read as a flake. The measurement was never
 * the problem; the pipeline was missing a way to *reuse* it.
 *
 * `--from` is that way. `test:coverage` now writes vitest's JSON report beside
 * its coverage output, and this mode derives the same three scopes from those
 * reports. It is not a cheaper reading of a different thing: both paths count
 * **files whose status is `passed`** and **assertions whose status is
 * `passed`**, which is what `Test Files N passed` and `Tests N passed` mean.
 * The two readings are held against a captured pair in
 * `measure-doc-counts-readings.test.ts`, because a second account of one
 * predicate is exactly how this repository has twice ended up with two numbers
 * that were both green.
 *
 * ## The verdict `--from` has to read for itself
 *
 * The spawn path knows a run failed because `execFileSync` throws: the exit code
 * is the verdict, and `parseSummary` never sees a red transcript's summary line.
 * A report has no exit code. The verdict is *in* the record -- `status: 'failed'`
 * on a file, `status: 'failed'` on an assertion -- and for one pass this mode did
 * not read it. It published the passing half of `N failed | M passed`: the
 * failing file dropped from the file count, its passing assertions kept in the
 * test count. That number is printed by nothing at all, and it went straight into
 * `docs/progress.md` through `--write-doc`.
 *
 * So a report that records a failure is refused, in the same words the spawn
 * path uses (`COUNT_UNAVAILABLE`), because it is the same fact. A checker and a
 * writer both read this function's output, which is why the refusal is here
 * rather than at either call site.
 *
 * ## And the verdict the transcript was getting for free
 *
 * The third reader -- `parseSummary`, which reads the printed summary -- had the
 * same rule without anyone writing it: a red line reads
 * `Test Files  2 failed | 1 passed (3)`, and the pattern is anchored on `passed`,
 * so it could never match. **The layout of the line was doing the guarding.** Two
 * consequences, both now written down in that function: a red transcript was
 * diagnosed as a possible format change, and a transcript holding one green block
 * and one red one returned the green half.
 *
 * All three readers now refuse a record that shows a failure, and they say it in
 * one sentence. The mechanisms differ because the evidence does: an exit code, a
 * `status` field, a summary line.
 *
 * ## Skipped, and the difference between a smaller number and no number
 *
 * A skipped test is not a pass, so it is not in the published count -- that is
 * what the row claims, and `Test Files  1 passed | 1 skipped (2)` has to read as
 * one file. But a skip used to be invisible twice over: the skipped file simply
 * vanished from the file count, and a suite skipped *entirely* printed no
 * `N passed` line at all, which fell into "vitest may have changed its summary
 * format". Both of those runs exit **0**, so both reached the reader.
 *
 * The rule now: a run in which nothing passed is not a measurement of anything --
 * zero is what an empty suite and a quarantined one both report, and a published
 * row cannot tell them apart from a suite that failed to be collected. A run in
 * which *something* passed is measured, and the amount skipped is carried beside
 * the count and printed, so that a number which moved has a reason attached.
 *
 * ## What `--from` asserts that the spawn cannot
 *
 * `pnpm test` runs whatever the root script filters to, and that filter is a
 * hand-written copy of the workspace list -- the same list in a third place.
 * `--from` derives the packages from `pnpm-workspace.yaml` and requires **every
 * workspace package that declares a `test` script to contribute at least one
 * test file**, and **every test file in a report to belong to one of them**. A
 * package added to the workspace without being added to the root filter is
 * therefore a failure here rather than a silently short count.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CURRENT_MARKERS, scopeOf } from './doc-counts-vocabulary.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const DEFAULT_OUT = resolve(ROOT, 'golden-master', 'doc-counts.json');
const PROGRESS = resolve(ROOT, 'docs', 'progress.md');

const SCOPES = [
  { name: 'core', filter: '@rca-bench-factory/core', args: ['--filter', '@rca-bench-factory/core', 'test'] },
  { name: 'cli', filter: '@rca-bench-factory/cli', args: ['--filter', '@rca-bench-factory/cli', 'test'] },
  { name: 'repo', filter: null, args: ['test'] },
];

function fail(lines) {
  console.error('measure-doc-counts: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Parse one vitest run's summary.
 *
 * vitest prints a `Test Files` line and a `Tests` line for the run it just
 * finished, and a workspace filter can produce more than one pair, so every
 * match is summed. `skipped` and `todo` are deliberately not added: a count of
 * tests that did not run is not a count of tests, and measuring the suite that
 * passed is what the published rows claim.
 *
 * ## The accident this function was living on
 *
 * A red summary line reads `Test Files  2 failed | 1 passed (3)`. The pattern
 * below is anchored on `Test Files` followed by a number and then `passed`, and
 * the first number on a red line is the **failed** count -- so the pattern cannot
 * match it. A red transcript was therefore never counted, and nobody had written
 * that rule: **the layout of the line was doing the guarding.**
 *
 * Two things follow, and both are defects of a kind this file has already met:
 *
 *  - The protection was invisible. A red transcript was reported as *"could not
 *    read the counts … vitest may have changed its summary format"*, which is
 *    the wrong diagnosis for a run that failed. A reader chasing a format change
 *    would not look at the failing test.
 *  - It only held for a line that is *entirely* red. A transcript with one green
 *    block and one red block -- `core` passed, `cli` did not -- matched the green
 *    block, summed it, and returned `{files: 1, tests: 20}` while the red block
 *    sat in the same string. That is the same silent dropping `--from` was doing,
 *    one format over.
 *
 * So the refusal is written down now, and it is the same refusal: a record that
 * shows a failure is not a measurement, in the same words the other two paths
 * use.
 */
export function parseSummary(out, scope) {
  const fileLines = [...out.matchAll(/^ *Test Files\s+(.+)$/gm)].map((m) => m[1]);
  const testLines = [...out.matchAll(/^ *Tests\s+(.+)$/gm)].map((m) => m[1]);

  if (fileLines.length === 0 || testLines.length === 0) {
    // Neither a failure nor a skip nor a summary: this is the one case where "the
    // format may have changed" is the right thing to say.
    throw new MeasurementUnavailable(`the ${scope} summary cannot be read`, [
      `could not read ${scope} counts from vitest output.`,
      'Expected a `Test Files` line and a `Tests` line, and found neither a failing run,',
      'a skipped one, nor a green one. So vitest may have changed its summary format,',
      'or the run stopped before it printed a summary.',
    ]);
  }

  const files = tally(fileLines);
  const tests = tally(testLines);

  if (files.failed > 0 || tests.failed > 0) {
    const parts = [];
    if (files.failed > 0) parts.push(`${String(files.failed)} test file(s) failed`);
    if (tests.failed > 0) parts.push(`${String(tests.failed)} test(s) failed`);
    throw new TranscriptRecordsFailures(scope, [
      `the ${scope} transcript records a failing run, so it is not a measurement:`,
      `  ${parts.join(', ')}`,
      COUNT_UNAVAILABLE,
      'Take the measurement from a run that passed.',
    ]);
  }

  const skipped = { files: files.skipped + files.todo, tests: tests.skipped + tests.todo };
  if (files.passed === 0 && tests.passed === 0 && (skipped.files > 0 || skipped.tests > 0)) {
    // A quarantined suite is not a broken reporter, and it is not a zero either.
    throw measuredNothing(scope, skipped);
  }

  return { files: files.passed, tests: tests.passed, skipped };
}

/**
 * Every `N <status>` token on one summary line, summed.
 *
 * One parser for both lines and all four statuses, because the alternative is a
 * regex per status per line -- and each of those is a separate reading of the
 * same record, which is how two numbers that disagree get born.
 *
 * The shapes it has to read, all captured from this vitest rather than imagined:
 *
 *   `162 passed (162)`             `1 skipped (1)`
 *   `1 passed | 1 skipped (2)`     `2 failed | 3 passed (5)`
 *   `19 passed | 1 skipped (20)`   `1 passed | 1 todo (2)`
 *
 * The parenthesised total is deliberately not read: it is `passed + failed +
 * skipped + todo` and every term is already here.
 */
function tally(lines) {
  const totals = { passed: 0, failed: 0, skipped: 0, todo: 0 };
  for (const line of lines) {
    for (const match of line.matchAll(/(\d+)\s+(passed|failed|skipped|todo)\b/g)) {
      totals[match[2]] += Number(match[1]);
    }
  }
  return totals;
}

/**
 * The refusal for a run in which nothing ran.
 *
 * ## Why this is not a zero
 *
 * A suite where every test is marked `skip` exits **0**, so nothing upstream
 * objects, and the honest count of what passed is `0 files, 0 tests`. Publishing
 * that is publishing a number that looks exactly like a measurement: it would
 * rewrite the core row from 3979 to 0, and the guard would then agree with it
 * for as long as the quarantine lasted. The number is not wrong; it is a
 * statement about a suite nobody ran, filed in a column that claims to say how
 * much of the suite passes.
 *
 * ## Why it used to say something else
 *
 * A fully skipped run prints no `N passed` line, so this reader fell through to
 * "could not read the counts -- vitest may have changed its summary format",
 * which points at a version bump. It reached that branch through the only caller
 * there is: the run exits 0.
 */
function measuredNothing(scope, skipped) {
  return new TranscriptMeasuredNothing(scope, measuredNothingLines(scope, skipped, 'run'));
}

/**
 * One body for both readers, one word for what told them.
 *
 * `run` is a summary line, `record` is a `status` field. That is the only
 * difference there is -- the fact, the consequence and the repair are the same --
 * so it is a parameter rather than a second copy. The word matters because it is
 * what a reader would use to find the evidence again.
 */
function measuredNothingLines(scope, skipped, evidence) {
  return [
    `the ${scope} ${evidence} passed nothing, so it is not a measurement:`,
    `  ${String(skipped.files)} test file(s) and ${String(skipped.tests)} test(s) are marked skip or todo`,
    'Zero is what an empty suite and a quarantined one both report, and a published row',
    'cannot tell those apart from a suite that failed to be collected.',
    'Un-skip the suite, or count something else -- there is no number here to publish.',
  ];
}

/** Sum every occurrence; a workspace filter can print more than one pair. */
function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * The workspace packages, read from the declaration rather than from a list.
 *
 * `pnpm-workspace.yaml` says `packages/*`, and that is the only place the set is
 * stated. The root `test` script states it a second time as two `--filter`
 * flags, which is how a third package can be added and never counted: the
 * filters keep naming two. Reading the declaration here makes the second copy
 * checkable instead of authoritative.
 */
function workspacePackages() {
  const yaml = readFileSync(resolve(ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const block = /^packages:\s*\n((?:[ \t]*-[^\n]*\n?)+)/m.exec(yaml);
  if (block === null) {
    fail(['pnpm-workspace.yaml has no `packages:` list this reader can parse.']);
  }
  const patterns = [...block[1].matchAll(/^[ \t]*-[ \t]*['"]?([^'"\n]+?)['"]?[ \t]*$/gm)].map((m) => m[1]);
  const dirs = [];
  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const parent = resolve(ROOT, pattern.slice(0, -2));
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = resolve(parent, entry.name);
        if (existsSync(resolve(dir, 'package.json'))) dirs.push(dir);
      }
      continue;
    }
    dirs.push(resolve(ROOT, pattern));
  }
  return dirs.map((dir) => {
    const manifest = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
    return { dir, name: manifest.name, hasTests: typeof manifest.scripts?.test === 'string' };
  });
}

/**
 * The same three counts, derived from vitest's own JSON reports.
 *
 * `--from` exists so that CI can compare the published counts to the run the
 * coverage step already performed. What it must not become is a second
 * definition of "a passing test": files and tests are counted by the statuses
 * the report records, which are the statuses the summary line counts, and
 * `measure-doc-counts-readings.test.ts` holds the two readings against one
 * captured run.
 */
export function countsFromReports(paths) {
  const packages = workspacePackages();
  const counts = {};
  for (const scope of SCOPES) counts[scope.name] = { files: 0, tests: 0, skipped: { files: 0, tests: 0 } };

  const contributed = new Set();
  for (const path of paths) {
    if (!existsSync(path)) {
      fail([
        `no vitest report at ${path}.`,
        '`test:coverage` writes one; run it, or drop `--from` and let this script take the measurement.',
      ]);
    }
    let report;
    try {
      report = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      fail([`${path} is not readable JSON: ${String(error.message)}`]);
    }
    if (!Array.isArray(report.testResults)) {
      fail([`${path} has no testResults array, so it is not a vitest report.`]);
    }
    const failures = [];
    for (const result of report.testResults) {
      const file = resolve(result.name ?? '');
      const owner = packages.find((p) => file === p.dir || file.startsWith(`${p.dir}${sep}`));
      if (owner === undefined) {
        fail([
          `${path} reports a test file outside every workspace package:`,
          `  ${result.name}`,
          'a file nothing owns cannot be attributed to a scope, so the count would be short.',
        ]);
      }
      contributed.add(owner.name);
      // The verdict the spawn path reads from the exit code, read here from the
      // record instead. Both halves are checked, because either one alone leaves a
      // report that a reader would call red and this function would call counted:
      // a file marked `passed` can still carry a failing assertion, and a file
      // marked `failed` may declare no assertions at all (a collection error).
      //
      // A failing file is named once and its assertions are not repeated: the file
      // is what has to be opened. Assertions are named only when the file claims
      // to have passed, which is the one case where the file name alone would
      // point at a file that does not look broken.
      if (result.status === 'failed') {
        failures.push(relative(ROOT, file));
      } else {
        for (const assertion of result.assertionResults ?? []) {
          if (assertion.status !== 'failed') continue;
          const title = assertion.fullName ?? assertion.title ?? 'an unnamed assertion';
          failures.push(`${relative(ROOT, file)} > ${title}`);
        }
      }
      // `Test Files N passed` counts files with no failing test, and a failing
      // file exits non-zero anyway; `Tests N passed` counts assertions that
      // passed and excludes skipped, pending and todo.
      //
      // Skips are counted too, and separately. They are not part of the published
      // number -- a skipped test is not a pass -- but a skip that nobody reports is
      // a published count that moved for no visible reason, and `--from` would
      // agree with it because it reads the same record.
      const files = result.status === 'passed' ? 1 : 0;
      const skippedFiles = result.status === 'skipped' ? 1 : 0;
      const assertions = result.assertionResults ?? [];
      const tests = assertions.filter((a) => a.status === 'passed').length;
      const skippedTests = assertions.filter((a) => a.status === 'skipped' || a.status === 'todo').length;
      const scope = SCOPES.find((s) => s.filter === owner.name);
      for (const target of scope === undefined ? [counts.repo] : [counts.repo, counts[scope.name]]) {
        target.files += files;
        target.tests += tests;
        target.skipped.files += skippedFiles;
        target.skipped.tests += skippedTests;
      }
    }

    if (failures.length > 0) {
      // Two assertions with the same title in one file would otherwise be printed
      // twice, and a list whose length is not its information is a list a reader
      // stops trusting.
      const unique = [...new Set(failures)];
      const shown = unique.slice(0, 5);
      throw new ReportRecordsFailures(path, [
        `the report at ${path} records a failure, so it is not a measurement:`,
        ...shown.map((name) => `  ${name}`),
        ...(unique.length > shown.length ? [`  … and ${unique.length - shown.length} more`] : []),
        COUNT_UNAVAILABLE,
        "What this function would produce is the passing half of vitest's `N failed | M passed`",
        'line -- the failing file dropped from the file count, its passing assertions kept in',
        'the test count -- which is a number neither reading prints.',
        'Fix the failure and take the measurement from a run that passed.',
      ]);
    }
  }

  // A scope where nothing passed is not a measurement of that scope, for the same
  // reason a fully skipped transcript is not one: zero is what an empty suite and a
  // quarantined one both report. `repo` is exempt from the *per-scope* rule only in
  // the sense that it is checked like any other scope, and it will be zero exactly
  // when every package is.
  for (const scope of SCOPES) {
    const measured = counts[scope.name];
    if (measured.files === 0 && (measured.skipped.files > 0 || measured.skipped.tests > 0)) {
      throw new ReportMeasuredNothing(scope.name, measuredNothingLines(scope.name, measured.skipped, 'record'));
    }
  }

  const missing = packages.filter((p) => p.hasTests && !contributed.has(p.name));
  if (missing.length > 0) {
    fail([
      'these workspace packages declare a `test` script and contributed no test file:',
      ...missing.map((p) => `  ${p.name} (${relative(ROOT, p.dir)})`),
      'the reports do not cover the workspace, so `repo` would be short by however many tests they hold.',
    ]);
  }
  return counts;
}

/**
 * The one sentence both refusal paths say, because they refuse the same thing.
 *
 * `--from` used to accept a report of a red run and publish the count of what
 * passed in it. The spawn path refuses that number in these words, so the report
 * path publishing one was the tool contradicting itself: one rule, two
 * implementations, and the untested one was the one that wrote to the document.
 */
export const COUNT_UNAVAILABLE = 'A count is what passed; a failed run has no number to publish.';

/**
 * A measurement that does not exist, carrying the lines a reader needs.
 *
 * Thrown instead of calling `fail()` so that a test can observe it: `fail()` ends
 * the process, and a branch that can only be observed by exiting is the shape
 * finding 121 was written about.
 */
export class MeasurementUnavailable extends Error {
  constructor(reason, lines) {
    super(reason);
    this.name = 'MeasurementUnavailable';
    this.lines = lines;
  }
}

/** A report whose scope passed nothing because everything was skipped. */
export class ReportMeasuredNothing extends MeasurementUnavailable {
  constructor(scope, lines) {
    super(`the ${scope} record passed nothing`, lines);
    this.name = 'ReportMeasuredNothing';
    this.lines = lines;
    this.scope = scope;
  }
}

/** A run in which nothing passed because everything was skipped. */
export class TranscriptMeasuredNothing extends MeasurementUnavailable {
  constructor(scope, lines) {
    super(`the ${scope} run passed nothing`, lines);
    this.name = 'TranscriptMeasuredNothing';
    this.scope = scope;
  }
}

/** A transcript whose summary line records a failure. */
export class TranscriptRecordsFailures extends MeasurementUnavailable {
  constructor(scope, lines) {
    super(`the ${scope} transcript records a failure`, lines);
    this.name = 'TranscriptRecordsFailures';
    this.scope = scope;
  }
}

/** The suite exited non-zero, so there is no count to take. */
export class SuiteFailed extends MeasurementUnavailable {
  constructor(scope, lines) {
    super(`the ${scope} suite is red`, lines);
    this.name = 'SuiteFailed';
    this.scope = scope;
  }
}

/**
 * A report that records a failure, so it is not a measurement of a passing run.
 *
 * The spawn path learns this from the exit code. A report has no exit code: the
 * verdict is *in* the record, and it has to be read out of it. Nothing did.
 */
export class ReportRecordsFailures extends MeasurementUnavailable {
  constructor(path, lines) {
    super(`${path} records a failure`, lines);
    this.name = 'ReportRecordsFailures';
    this.path = path;
  }
}

/**
 * Turn a failed run's captured output into a diagnosis.
 *
 * ## What this used to do
 *
 * Nothing. `execFileSync` was called without a `catch`, so a non-zero exit
 * became an uncaught exception, and Node printed
 *
 *     Error: Command failed: pnpm --filter @rca-bench-factory/core test
 *     <the whole captured stdout>
 *     at checkChildProcessResult …
 *
 * for a tool whose whole job is to print three numbers. The reader was left with
 * a stack trace and a transcript, and had to work out that the *suite* was red —
 * which is not a fact about the counts at all, but the reason there are none.
 *
 * ## What it says now
 *
 * Three things, in the order a reader needs them: that the run failed, that a
 * count of what passed does not exist for a failed run, and which tests failed.
 * The transcript is cut to the failing test names and capped, because the point
 * is to name the work, not to reproduce the log — `stdio` already sends vitest's
 * own output to the terminal, so the full text is one scroll up.
 */
export function diagnoseRedRun(scope, error) {
  const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
  const status = error?.status;
  const lines = [
    `the ${scope} suite is red, so its counts cannot be measured.`,
    COUNT_UNAVAILABLE,
  ];

  if (status === undefined && error?.code !== undefined) {
    // No exit status at all: the child never ran. A missing `pnpm`, a signal, or
    // a working directory that is not there -- each is a different repair, and
    // none of them is "the suite failed".
    lines.push(`the run did not start (${String(error.code)}): ${String(error.message ?? '')}`.trimEnd());
    return lines;
  }

  const failing = [...stdout.matchAll(/^\s*(?:×|FAIL)\s+(.+?)\s*$/gm)].map((m) => m[1]);
  const unique = [...new Set(failing)];
  if (unique.length === 0) {
    lines.push(
      `the run exited ${String(status ?? 'without a status')} and named no failing test;`,
      'vitest prints `FAIL <file> > <test>` for each one, so this is not a test failure:',
      'read the run itself for the reason.',
    );
    return lines;
  }

  const shown = unique.slice(0, 5);
  lines.push('first failing test(s):', ...shown.map((name) => `  ${name}`));
  if (unique.length > shown.length) {
    lines.push(`  … and ${unique.length - shown.length} more`);
  }
  lines.push(
    `the full run is above; re-run it with \`pnpm ${SCOPES.find((s) => s.name === scope)?.args.join(' ') ?? 'test'}\`.`,
    // Not an escape from the failure -- the failing tests still have to be fixed,
    // and a report of *this* run would now be refused. It is the way not to take
    // the same measurement twice when a green run already wrote one: the suite
    // takes about 80 s, and `--from` reads the same numbers in 0.1 s.
    'If a green coverage run already wrote its report, `--from <report>[,<report>]` reuses that run instead of a second one:',
    '  --from packages/core/node_modules/.cache/vitest-report.json,packages/cli/node_modules/.cache/vitest-report.json',
  );
  return lines;
}

function measure() {
  const counts = {};
  for (const scope of SCOPES) {
    process.stderr.write(`measuring ${scope.name} (pnpm ${scope.args.join(' ')}) ...\n`);
    let out;
    try {
      out = execFileSync('pnpm', scope.args, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      });
    } catch (error) {
      throw new SuiteFailed(scope.name, diagnoseRedRun(scope.name, error));
    }
    counts[scope.name] = parseSummary(out, scope.name);
  }
  return counts;
}

/**
 * The committed shape, so `--check` and a rewrite produce byte-identical text.
 *
 * Keys are sorted and the scopes are written in their canonical order; a
 * measurement that reorders them would otherwise show up as a diff and hide a
 * real change.
 */
function serialise(counts) {
  const ordered = {};
  for (const scope of SCOPES) {
    // The two numbers the document claims, chosen here rather than inherited from
    // whatever the reader returned. The reader now also returns how much was
    // skipped; a snapshot that grew that key would change the committed shape of
    // `doc-counts.json` as a side effect of a diagnostic.
    const { files, tests } = counts[scope.name];
    ordered[scope.name] = { files, tests };
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * One scope's line for the terminal, including what it left out.
 *
 * A skip is not counted -- a published row says how many tests passed -- but a
 * count that drops because six tests were marked `skip` looks exactly like a
 * count that dropped for no reason at all, and the guard can only report the
 * difference. This is where the reason is said out loud, and only when there is
 * one.
 */
function describeCount(scope, count) {
  const base = `${scope.padEnd(5)} ${String(count.files)} files, ${String(count.tests)} tests`;
  const skipped = count.skipped ?? { files: 0, tests: 0 };
  if (skipped.files === 0 && skipped.tests === 0) return base;
  return `${base}  (${String(skipped.files)} file(s) and ${String(skipped.tests)} test(s) skipped, not counted)`;
}

/**
 * Rewrite the rows that claim to describe the state at this commit.
 *
 * ## Why a writer and a checker both need this predicate
 *
 * `check-doc-counts.mjs` refuses a current-state row that does not equal the
 * measurement. This function replaces the numbers in exactly those rows, so the
 * two agree by construction -- one definition of "current", in
 * `doc-counts-vocabulary.mjs`, read by both.
 *
 * ## Why it refuses rather than guesses
 *
 * Every branch below is a refusal with a line number, because the failure mode of
 * a rewriting tool is worse than the failure mode of a checking one: a checker
 * that guesses wrong prints a red line a person can argue with, and a writer that
 * guesses wrong *edits the record* and reports success. Three shapes are refused:
 *
 *  - a current-state row whose label names no scope (which numbers would it take?)
 *  - a second current-state row for a scope already rewritten (which one is real?)
 *  - a scope with no current-state row at all (where would the number go?)
 *
 * The third is the one that matters most in practice: adding a scope to `SCOPES`
 * without adding its row would otherwise publish two counts and silently drop the
 * third on the floor.
 *
 * ## Why the whole file is not regenerated
 *
 * Because it is a record. `docs/progress.md` is 7000 lines of dated measurements,
 * arguments and open items; a writer that produced the file from a template would
 * have to reproduce all of that, and the day it could not, the content would be
 * lost instead of the numbers being wrong. This function touches only the digits
 * in rows that say they describe now.
 */
export function rewritePublishedRows(text, counts) {
  const lines = text.split('\n');
  const errors = [];
  const rewritten = [];
  const seen = new Set();

  // The shape `check-doc-counts.mjs` reads: `N files, M tests passed`.
  const shape = /(\d+)(\s*files?[,\s]+)(\d+)(\s*(?:tests?\s*)?passed)/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!CURRENT_MARKERS.some((marker) => line.includes(marker))) continue;
    // A *row*, not a sentence. The phrase "as of this commit" appears in this
    // document's prose and in other tables that quote it -- both the first live
    // run of this function and the checker's own history say so. Only a table row
    // can carry the counts, and only a table row is what the checker reads.
    if (!line.trimStart().startsWith('|')) continue;

    // The same predicate the checker uses, over the same cell it reads. A writer
    // that matched on backticks instead would skip the `repo` row, whose label in
    // the shipped document is written without them -- and would skip it silently,
    // reporting success over a stale number.
    const scope = scopeOf(line.split('|')[1] ?? '');
    const carriesCounts = shape.test(line);

    // A row is a *claim about the counts* when it names a scope or publishes the
    // shape. A row that does neither is some other table quoting the phrase (a
    // change log mentioning "the `as of this commit` rows"), and rewriting it
    // would be editing a sentence because of a word in it.
    if (scope === null && !carriesCounts) continue;

    if (scope === null || counts[scope] === undefined) {
      errors.push(`line ${i + 1}: a current-state row names no scope: ${line.trim()}`);
      continue;
    }
    if (seen.has(scope)) {
      errors.push(`line ${i + 1}: a second current-state row for '${scope}'`);
      continue;
    }
    seen.add(scope);

    if (!carriesCounts) {
      errors.push(`line ${i + 1}: '${scope}' row is not in the 'N files, M tests passed' shape: ${line.trim()}`);
      continue;
    }
    const next = line.replace(shape, `${counts[scope].files}$2${counts[scope].tests}$4`);
    if (next !== line) rewritten.push({ scope, line: i + 1 });
    lines[i] = next;
  }

  for (const scope of Object.keys(counts)) {
    if (!seen.has(scope)) errors.push(`no current-state row for '${scope}'; nothing to write it into`);
  }
  return { text: lines.join('\n'), errors, rewritten };
}

function main() {
  const out = argValue('--out') ?? DEFAULT_OUT;
  const docPath = argValue('--doc') ?? PROGRESS;
  const checking = process.argv.includes('--check');
  const writing = process.argv.includes('--write-doc');

  if (checking && writing) {
    // Two verdicts that cannot both hold: one refuses a difference and the other
    // removes it. A tool that silently prefers one of them is a tool whose exit
    // code stops meaning anything.
    fail(['--check and --write-doc contradict each other.', 'Run one of them.']);
  }

  /**
   * The existence precondition is checked *before* the measurement.
   *
   * It used to run after, which meant `--check` against a tree with no
   * committed measurement spawned all three suites -- roughly a minute of work
   * -- and then reported that the file it was comparing against was not there.
   * The comparison could never have happened, so every one of those child
   * processes was wasted. Checking first makes the failure immediate, and it is
   * also what makes this branch affordable to test: the guard site is reached
   * without running a suite, so a unit test can assert its message without
   * recursing into vitest from vitest.
   */
  if (checking && !existsSync(out)) {
    fail([
      `no committed measurement at ${out}.`,
      'Run `node scripts/measure-doc-counts.mjs` to take one.',
    ]);
  }

  const from = argValue('--from');
  let measured;
  try {
    measured = from === undefined
      ? measure()
      : countsFromReports(from.split(',').map((p) => resolve(ROOT, p.trim())).filter(Boolean));
  } catch (error) {
    // A red run is a diagnosis, not a crash. `fail()` is still the exit, so the
    // verdict reads like every other one this script prints.
    if (error instanceof MeasurementUnavailable) fail(error.lines);
    throw error;
  }
  const text = serialise(measured);

  if (checking) {
    const committed = readFileSync(out, 'utf8');
    if (committed !== text) {
      fail([
        `${out} is stale.`,
        '',
        'committed:',
        ...committed.trimEnd().split('\n').map((l) => `  ${l}`),
        '',
        'measured:',
        ...text.trimEnd().split('\n').map((l) => `  ${l}`),
      ]);
    }
    console.log(
      from === undefined
        ? `measure-doc-counts: OK (${out} matches the suite)`
        : `measure-doc-counts: OK (${out} matches the run these reports describe: ${from})`,
    );
    return;
  }

  if (writing) {
    // Both computations before either write. A failure between the two writes
    // would leave the snapshot advanced and the document stale -- the exact
    // half-state this flag exists to remove.
    const result = rewritePublishedRows(readFileSync(docPath, 'utf8'), measured);
    if (result.errors.length > 0) {
      fail([
        'the published rows cannot be rewritten, so nothing was written:',
        ...result.errors.map((line) => `  ${line}`),
      ]);
    }
    writeFileSync(out, text);
    writeFileSync(docPath, result.text);
    for (const scope of SCOPES) console.log(describeCount(scope.name, measured[scope.name]));
    const touched = result.rewritten.length;
    console.log(`written to ${out} and ${relative(ROOT, docPath)} (${touched} row(s) updated)`);
    return;
  }

  writeFileSync(out, text);
  for (const scope of SCOPES) console.log(describeCount(scope.name, measured[scope.name]));
  console.log(`written to ${out}`);
}

// Guarded so `parseSummary` and `countsFromReports` can be imported by a test
// without this script spawning three suites and rewriting the committed
// measurement. The two readings of one predicate are the subject of
// `measure-doc-counts-readings.test.ts`, and a module that measures on import
// cannot be held against anything.
const invokedDirectly =
  process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) main();
