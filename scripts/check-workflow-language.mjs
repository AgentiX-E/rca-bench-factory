#!/usr/bin/env node
/**
 * The verdict for `yaml-language.mjs`: no workflow file here is commented in Chinese.
 *
 * The reading is in `yaml-language.mjs` for the reason every gate in this directory that
 * has a reading beside it gives: `verify-gates-are-testable.mjs` proves a gate by emptying
 * the file, and an emptied file that a test imports kills the worker before it can name a
 * failing test. This file is the verdict and is only ever spawned.
 *
 * `RCA_WORKFLOWS_ROOT` points it at a fixture, the same way `check-comments-language.mjs`
 * takes `RCA_COMMENTS_ROOT`: the scanner has more failure modes than the six files here
 * will ever exhibit -- a `#` inside a quoted scalar, a `#` inside a block scalar's own
 * row, a quote inside a block scalar that tries to leak into the next row, a block scalar
 * that ends one row early, an unterminated flow scalar, a tree with no YAML file at all --
 * and each is a fixture rather than a future accident.
 */

import { ROOT, check } from './yaml-language.mjs';

const root = process.env['RCA_WORKFLOWS_ROOT'] ?? ROOT;

if (process.argv[1] !== undefined && process.argv[1].endsWith('check-workflow-language.mjs')) {
  const result = check(root);
  process.stdout.write(`${result.summary}\n`);
  for (const error of result.errors) process.stderr.write(`  ${error}\n`);
  process.exit(result.ok ? 0 : 1);
}
