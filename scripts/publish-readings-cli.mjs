#!/usr/bin/env node
/**
 * The gate over the publishing channel's history, and the three exits it can take.
 *
 * ## Why the reader is a program and the rules are not
 *
 * Everything that decides whether a row is a row lives in `publish-readings.mjs`, which is a
 * data module a test may import. What lives here is the part that ends a process: which file
 * to read, what to print, and when to exit. The split is not tidiness -- a gate is proved by
 * being emptied, and `verify-gates-are-testable.mjs` empties it by inserting `process.exit(0)`
 * after the imports, so a test that imported this file would die in the worker before it could
 * name a failing test. That is why `publish.mjs` and `publish-cli.mjs` are two files, and this
 * is the same pair one verb later.
 *
 * ## The exit is literal, and it sits under the sentence a failure prints
 *
 * The first version was `process.exit(main(...))`, and `derive-gate-sites.mjs` attributed the
 * failure site to the nearest `console.log` above it -- which was the `OK` line. So the
 * inventory published `publish-readings: OK (...)` as the diagnostic of a refusal: this
 * repository's most-repeated finding, in its own table, on the first round that added a gate
 * to it (finding 431). A literal exit below the failure's own sentence is the shape
 * `check-open-list.mjs` uses and the one the inventory can read.
 *
 * ## Usage
 *
 *   node scripts/publish-readings-cli.mjs [--file PATH] [--check]
 *
 * `--file` defaults to `golden-master/publish-readings.json`. `--check` adds the verdict line
 * a gate has to print; without it the summary is printed and the exit is 0, which is what a
 * reader asking "what has this channel met" wants.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatSummary, inspect, parseArgs, summariseReadings } from './publish-readings.mjs';

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    console.error('usage: publish-readings-cli.mjs [--file PATH] [--check]');
    process.exit(1);
  }
  const { options } = parsed;
  const found = inspect(options.file);
  if (found.error !== null) console.error(`publish-readings: ${found.error}`);
  if (found.error !== null || found.problems.length > 0) {
    for (const problem of found.problems) console.error(`  - ${problem}`);
    console.error(`publish-readings: FAILED (${options.file})`);
    process.exit(1);
  }
  console.log(`${formatSummary(summariseReadings(found.entries))} (${options.file})`);
  if (options.check) console.log(`publish-readings: OK (${found.entries.length} row(s) of ${options.file})`);
}
