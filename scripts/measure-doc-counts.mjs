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
import {
  COUNT_UNAVAILABLE,
  MeasurementUnavailable,
  SCOPES,
  SuiteFailed,
  countsFromReports,
  diagnoseRedRun,
  parseSummary,
  rewritePublishedRows,
} from './doc-counts-rows.mjs';
import { progressCorpus } from './docs-corpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const DEFAULT_OUT = resolve(ROOT, 'golden-master', 'doc-counts.json');
const PROGRESS = resolve(ROOT, 'docs', 'progress.md');


function fail(lines) {
  console.error('measure-doc-counts: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
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
    // The counts moved with the split: the rows lived in the body, and the body is
    // now four volumes. A writer that opened one path would rewrite nothing and
    // report success, which is the defect `check-doc-counts` was fixed for on the
    // same day -- one document, two readers, and the writer is the reader that
    // cannot be caught by a red gate.
    const files = argValue('--doc') === undefined
      ? progressCorpus()
      : [{ label: relative(ROOT, docPath), path: docPath, text: readFileSync(docPath, 'utf8') }];
    const problems = [];
    const written = [];
    const seen = new Set();
    for (const file of files) {
      const result = rewritePublishedRows(file.text, measured, { requireAllScopes: false });
      for (const problem of result.errors) problems.push(`${file.label}: ${problem}`);
      for (const scope of result.seen) seen.add(scope);
      if (result.text !== file.text) {
        written.push(`${file.label} (${String(result.rewritten.length)} row(s) updated)`);
        if (file.path !== out) writeFileSync(file.path, result.text);
      }
    }
    for (const scope of SCOPES) {
      if (!seen.has(scope.name)) {
        problems.push(`no current-state row for '${scope.name}' in the corpus; nothing to write it into`);
      }
    }
    if (problems.length > 0) {
      fail([
        'the published rows cannot be rewritten, so nothing was written:',
        ...problems.map((line) => `  ${line}`),
      ]);
    }
    writeFileSync(out, text);
    for (const scope of SCOPES) console.log(describeCount(scope.name, measured[scope.name]));
    // The single-file sentence is kept word for word: `--doc` names one file, and a
    // message that changed shape for the common case would be a message every
    // reader has to learn twice. The corpus case names each file and its own count,
    // because "3 row(s) updated" over five files says nothing about which.
    console.log(
      `written to ${out} and ` +
        (written.length === 0 ? 'no row needed changing' : written.join(', ')),
    );
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
