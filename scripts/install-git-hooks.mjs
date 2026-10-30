#!/usr/bin/env node
/**
 * The command `pnpm install` runs, and the thing that says nothing when there is
 * nothing to install.
 *
 * `scripts/git-hooks.mjs` holds the decision and the two silences it closes; this
 * file is the entry point, because a module cannot be a `prepare` script and a
 * gate may not be imported by a test.
 *
 *   node scripts/install-git-hooks.mjs [--root <dir>]
 */

import { resolve } from 'node:path';
import { install } from './git-hooks.mjs';

function usage(message) {
  if (message !== undefined) console.error(`install-git-hooks: ${message}`);
  console.error('usage: install-git-hooks.mjs [--root <dir>]');
  process.exit(1);
}

function rootOf(argv) {
  const at = argv.indexOf('--root');
  if (at < 0) {
    if (argv.length > 0) usage(`unknown argument: ${argv[0]}`);
    return process.cwd();
  }
  const value = argv[at + 1];
  if (value === undefined) usage('--root needs a directory');
  return resolve(value);
}

const result = install({ root: rootOf(process.argv.slice(2)) });
if (result.state === 'missing-hook' || result.state === 'unset') {
  // The failure goes to stderr and carries its own sentence, which is also what
  // gives this exit a fingerprint of its own: `derive-gate-sites.mjs` reads the
  // nearest preceding diagnostic, and a site with none inherits the one above it --
  // both of this file's sites fingerprinted as the usage line until this line
  // existed, and the carry then had one proof for two sites.
  process.stderr.write(`install-git-hooks: FAILED (${result.state}) — ${result.message}\n`);
  process.exit(1);
}
process.stdout.write(`${result.message}\n`);
