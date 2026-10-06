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
 *
 * `--check` against a missing `--out` fails before measuring anything. The
 * comparison could not have succeeded, so the three suites are not worth
 * spawning to find that out, and the short circuit is what lets the test suite
 * prove this failure path without recursing.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
function parseSummary(out, scope) {
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

function measure() {
  const counts = {};
  for (const scope of SCOPES) {
    process.stderr.write(`measuring ${scope.name} (pnpm ${scope.args.join(' ')}) ...\n`);
    const out = execFileSync('pnpm', scope.args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
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

  const measured = measure();
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
    console.log(`measure-doc-counts: OK (${out} matches the suite)`);
    return;
  }

  writeFileSync(out, text);
  for (const scope of SCOPES) {
    const c = measured[scope.name];
    console.log(`${scope.name.padEnd(5)} ${c.files} files, ${c.tests} tests`);
  }
  console.log(`written to ${out}`);
}

main();
