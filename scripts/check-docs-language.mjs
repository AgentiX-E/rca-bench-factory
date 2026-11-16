#!/usr/bin/env node
/**
 * The verdict for `docs-language.mjs`: no document here is written in Chinese.
 *
 * The reading is in `docs-language.mjs` for the reason every gate in this directory
 * that has a reading beside it gives: `verify-gates-are-testable.mjs` proves a gate by
 * emptying the file, and an emptied file that a test imports kills the worker before it
 * can name a failing test. This file is the verdict and is only ever spawned.
 *
 * `RCA_DOCS_ROOT` points it at a fixture, the same way `check-progress-volumes.mjs`
 * takes `RCA_PROGRESS_DIR`: the rule has more failure modes than the tree will ever
 * exhibit -- a run inside a fence, a run inside a span, a run inside a quote, a tree
 * with no document at all -- and each is a fixture rather than a future accident.
 */

import { ROOT, check } from './docs-language.mjs';

const root = process.env['RCA_DOCS_ROOT'] ?? ROOT;

if (process.argv[1] !== undefined && process.argv[1].endsWith('check-docs-language.mjs')) {
  const result = check(root);
  process.stdout.write(`${result.summary}\n`);
  for (const error of result.errors) process.stderr.write(`  ${error}\n`);
  process.exit(result.ok ? 0 : 1);
}
