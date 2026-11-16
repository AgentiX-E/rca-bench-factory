#!/usr/bin/env node
/**
 * The verdict for `comment-language.mjs`: no source file here is commented in Chinese.
 *
 * The reading is in `comment-language.mjs` for the reason every gate in this directory
 * that has a reading beside it gives: `verify-gates-are-testable.mjs` proves a gate by
 * emptying the file, and an emptied file that a test imports kills the worker before it
 * can name a failing test. This file is the verdict and is only ever spawned.
 *
 * `RCA_COMMENTS_ROOT` points it at a fixture, the same way `check-docs-language.mjs`
 * takes `RCA_DOCS_ROOT`: the scanner has more failure modes than the tree will ever
 * exhibit -- a string read as a comment, a regex that opens a block, a template read as a
 * quote, a block that never closes, a tree with no source file at all -- and each is a
 * fixture rather than a future accident.
 */

import { ROOT, check } from './comment-language.mjs';

const root = process.env['RCA_COMMENTS_ROOT'] ?? ROOT;

if (process.argv[1] !== undefined && process.argv[1].endsWith('check-comments-language.mjs')) {
  const result = check(root);
  process.stdout.write(`${result.summary}\n`);
  for (const error of result.errors) process.stderr.write(`  ${error}\n`);
  process.exit(result.ok ? 0 : 1);
}
