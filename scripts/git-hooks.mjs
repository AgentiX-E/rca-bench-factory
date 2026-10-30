#!/usr/bin/env node
/**
 * Point this checkout's hooks at `.githooks`, once per clone.
 *
 * ## Why an installer at all
 *
 * `core.hooksPath` lives in `.git/config`, which is not committed, so no file in
 * this repository can make a clone run `.githooks/pre-commit`. `package.json` can:
 * its `prepare` script runs after every `pnpm install`, and an install is the one
 * command every clone of this repository runs before it can do anything. That is
 * the whole mechanism -- there is no other place to put it.
 *
 * ## The two silences git keeps, and why each is closed here
 *
 * | what | what git does |
 * | --- | --- |
 * | a hook file with no execute bit | ignores it, silently; the commit succeeds |
 * | `core.hooksPath` naming a directory that is not there | ignores every hook in it, silently |
 *
 * Both are this campaign's oldest shape -- a guard that is present, spelled
 * correctly, and never asked. So the mode bit is set here rather than trusted from
 * the checkout, and the setting is **read back** afterwards rather than inferred
 * from the exit status of the command that wrote it. A `git config` that returns 0
 * and writes `core.hookspath` is a real possibility, and the reading is what
 * catches it.
 *
 * ## Why a module and not four lines in the installer
 *
 * `scripts/install-git-hooks.mjs` is a gate: `verify-gates-are-testable.mjs` proves
 * it by emptying it, so no test may import it. Which states are a successful
 * install is the part worth a test, so it is a value here and the gate prints it.
 *
 * ## What this does not do
 *
 * It does not run the guard. An installer that proved the guard by running it would
 * report a refusal during `pnpm install`, where nothing is staged and nobody is
 * reading. The guard is proved by `staged-mutation.test.ts`, which drives a real
 * `git commit` against a real journal in a real checkout.
 */

import { chmodSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/** The directory hooks are kept in, relative to the checkout root. */
export const HOOKS_DIR = '.githooks';

/** The hook that refuses a commit whose index holds a battery's mutation. */
export const HOOK = 'pre-commit';

/** The guard that hook runs. Named here so the test that holds the two together is not prose. */
export const GUARD = 'scripts/check-staged-mutation.mjs';

/** `git -C root`, answering `null` rather than throwing: every caller has a state for it. */
export function gitIn(root) {
  return (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    if (result.error !== undefined || result.status !== 0) return null;
    return result.stdout;
  };
}

/**
 * Install, and say what happened.
 *
 * Returns the sentence rather than printing it, so a test can assert both the
 * state and the wording -- a message that names the checkout is the only thing
 * that tells a reader of `pnpm install` *which* clone just became guarded.
 */
export function install({ root, run = gitIn(root) } = {}) {
  const top = run(['rev-parse', '--show-toplevel']);
  if (top === null) {
    // A tarball, a restored cache, a vendored copy: there is no checkout and so no
    // hook mechanism to configure. Not a failure of the install.
    return { state: 'no-checkout', message: 'install-git-hooks: no git checkout here; nothing to install' };
  }
  const checkout = top.trim();
  const hook = join(checkout, HOOKS_DIR, HOOK);
  if (!existsSync(hook)) {
    return {
      state: 'missing-hook',
      message:
        `install-git-hooks: ${HOOKS_DIR}/${HOOK} is not in ${checkout}, so there is no hook to point ` +
        'git at and the clone is unguarded',
    };
  }
  // Any execute bit will do: git asks whether the file is executable, not which
  // bits are set, and copying one specific bit would refuse a hook git would run.
  if ((statSync(hook).mode & 0o111) === 0) chmodSync(hook, 0o755);
  if (run(['config', 'core.hooksPath', HOOKS_DIR]) === null) {
    return {
      state: 'unset',
      message: `install-git-hooks: git refused to set core.hooksPath in ${checkout}, so the clone is unguarded`,
    };
  }
  const read = run(['config', '--get', 'core.hooksPath']);
  const value = read === null ? null : read.trim();
  if (value !== HOOKS_DIR) {
    return {
      state: 'unset',
      message:
        `install-git-hooks: core.hooksPath reads ${String(value)} after being set to ${HOOKS_DIR}, ` +
        'so the clone is unguarded',
    };
  }
  return {
    state: 'installed',
    message: `install-git-hooks: core.hooksPath is ${HOOKS_DIR} in ${checkout}, so ${HOOK} runs before every commit`,
  };
}
