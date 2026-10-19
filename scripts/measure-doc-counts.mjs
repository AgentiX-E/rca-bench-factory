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

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const DEFAULT_OUT = resolve(ROOT, 'golden-master', 'doc-counts.json');

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
 */
export function parseSummary(out, scope) {
  const files = [...out.matchAll(/Test Files\s+(\d+)\s+passed/g)].map((m) => Number(m[1]));
  const tests = [...out.matchAll(/Tests\s+(\d+)\s+passed/g)].map((m) => Number(m[1]));
  if (!files.length || !tests.length) {
    fail([
      `could not read ${scope} counts from vitest output.`,
      'Expected a `Test Files N passed` line and a `Tests N passed` line.',
      'vitest may have changed its summary format, or the run failed before it printed one.',
    ]);
  }
  return {
    files: files.reduce((a, b) => a + b, 0),
    tests: tests.reduce((a, b) => a + b, 0),
  };
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
  for (const scope of SCOPES) counts[scope.name] = { files: 0, tests: 0 };

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
      // `Test Files N passed` counts files with no failing test, and a failing
      // file exits non-zero anyway; `Tests N passed` counts assertions that
      // passed and excludes skipped, pending and todo.
      const files = result.status === 'passed' ? 1 : 0;
      const tests = (result.assertionResults ?? []).filter((a) => a.status === 'passed').length;
      counts.repo.files += files;
      counts.repo.tests += tests;
      const scope = SCOPES.find((s) => s.filter === owner.name);
      if (scope !== undefined) {
        counts[scope.name].files += files;
        counts[scope.name].tests += tests;
      }
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
 * A run that did not succeed, carrying the lines a reader needs.
 *
 * Thrown instead of calling `fail()` so that a test can observe it: `fail()` ends
 * the process, and a branch that can only be observed by exiting is the shape
 * finding 121 was written about.
 */
export class SuiteFailed extends Error {
  constructor(scope, lines) {
    super(`the ${scope} suite is red`);
    this.name = 'SuiteFailed';
    this.scope = scope;
    this.lines = lines;
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
    'A count is what passed; a failed run has no number to publish.',
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
  lines.push(`the full run is above; re-run it with \`pnpm ${SCOPES.find((s) => s.name === scope)?.args.join(' ') ?? 'test'}\`.`);
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
  for (const scope of SCOPES) ordered[scope.name] = counts[scope.name];
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function main() {
  const out = argValue('--out') ?? DEFAULT_OUT;
  const checking = process.argv.includes('--check');

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
    if (error instanceof SuiteFailed) fail(error.lines);
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

  writeFileSync(out, text);
  for (const scope of SCOPES) {
    const c = measured[scope.name];
    console.log(`${scope.name.padEnd(5)} ${c.files} files, ${c.tests} tests`);
  }
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
