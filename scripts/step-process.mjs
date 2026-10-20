#!/usr/bin/env node
/**
 * Run one step, from the plan to an exit code -- and be able to stop it.
 *
 * ## Why this is a module of its own
 *
 * `gate-steps.mjs` says of itself that it "has no business spawning anything",
 * and it means it: the runner is passed in as a parameter so the plan can be
 * driven by a test with a function that fails on demand. `verify-local.mjs` is a
 * gate, and `verify-gates-are-testable.mjs` hollows it out with `process.exit(0)`
 * -- so no test may import it, because a suite that dies at import reports an
 * unattributed crash instead of a failing test.
 *
 * The seam both need therefore lives here: importable by the suite, callable by
 * the CLI, and small enough to be read in one sitting.
 *
 * ## Why the child is in its own process group
 *
 * A `run:` body is not one process. `pnpm test` starts vitest, which starts
 * workers; killing the process this module spawned would leave the workers
 * running and the terminal busy -- which is precisely the failure the bound
 * exists to prevent. `detached: true` makes the child a group leader
 * (`setsid()`), so `kill(-pid)` reaches everything it started.
 *
 * The cost of `detached` is that the terminal's Ctrl-C no longer reaches the
 * child. So this module forwards `SIGINT` and `SIGTERM` to the group itself:
 * a runner that swallowed the operator's interrupt would be worse than one with
 * no bound at all.
 *
 * ## Why the timeout is a verdict and not a request
 *
 * `timeout-minutes:` in CI is a job-level budget: when it is spent, the job is
 * killed and reported as cancelled. Here the same bound produces a **distinct
 * outcome** -- `StepTimeout` -- because the repair differs: a step that exited 1
 * has something wrong with it, and a step that ran for fifteen minutes has
 * something wrong with it *or* with the bound. The caller prints a different
 * block, and `runSteps` records which of the two happened.
 */

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, materialiseStep } from './gate-steps.mjs';

/** How long a step gets between "stop" and "stop now", in milliseconds. */
export const GRACE_MS = 2000;

/**
 * A step that ran past the bound the workflow gave it.
 *
 * `timedOut` is a plain property rather than a class check, so a caller can branch
 * on the value: `runSteps` reads it without importing this module, which keeps the
 * plan free of any dependency on the process machinery.
 */
export class StepTimeout extends Error {
  constructor(minutes) {
    super(minutes === null ? 'the step ran past its bound' : `the step ran past its bound of ${String(minutes)} minute(s)`);
    this.name = 'StepTimeout';
    this.timedOut = true;
    this.minutes = minutes;
  }
}

/**
 * Run `step` to completion, or to its bound.
 *
 * `step.timeoutMs` is a number of milliseconds or `null`. The conversion from the
 * workflow's minutes happens where the plan is built, so this module has one
 * unit and one rule; a test can then drive the bound in milliseconds without
 * waiting a minute for the privilege.
 */
export function runStep(step) {
  const { file, argv } = materialiseStep(step);
  const bound = typeof step.timeoutMs === 'number' ? step.timeoutMs : null;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: resolve(ROOT, step.cwd ?? '.'),
      env: { ...process.env, ...(step.env ?? {}) },
      stdio: 'inherit',
      detached: true,
    });

    let timedOut = false;
    let settled = false;
    let timer = null;
    let grace = null;

    /**
     * Signal everything the step started, and nothing else.
     *
     * The guard is not defensive decoration. A spawn that failed never produced a
     * pid, and **`kill(-0, …)` signals the caller's own process group** -- so a
     * step that could not start, with a bound short enough to expire before the
     * `error` event arrives, would have killed the runner and the terminal session
     * with it. Negative pid arithmetic has a zero, and zero means "us".
     */
    const signalGroup = (signal) => {
      if (typeof child.pid !== 'number' || child.pid <= 0) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        // The group is already gone, which is the outcome this wanted.
      }
    };

    /**
     * The operator's interrupt, forwarded -- and then it kills this process.
     *
     * Installing a listener **replaces the default action**, so a runner that only
     * forwarded would ignore the signal a supervisor sends, be killed with SIGKILL
     * later instead, and take every file that supervisor had queued behind it.
     *
     * So the handler removes itself and **re-raises** the signal. That is not the
     * same as `process.exit(143)`: re-raising lets the default action happen, so a
     * supervisor sees a process that died *of* SIGTERM rather than one that exited
     * with a number standing in for it. It also keeps this module free of a
     * `process.exit`, which is what the register in `scripts-are-classified.test.ts`
     * says of it -- and a register entry reworded to accommodate a convenience
     * would be describing the code rather than stating a rule.
     */
    const forward = (signal) => () => {
      signalGroup('SIGTERM');
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
      process.kill(process.pid, signal);
    };
    const onInterrupt = forward('SIGINT');
    const onTerminate = forward('SIGTERM');
    /** Last resort: whatever is left when this process ends anyway. */
    const sweep = () => signalGroup('SIGKILL');

    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      if (grace !== null) clearTimeout(grace);
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
      process.removeListener('exit', sweep);
      rmSync(file, { force: true });
      settle(value);
    };

    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    process.on('exit', sweep);

    if (bound !== null) {
      timer = setTimeout(() => {
        timedOut = true;
        signalGroup('SIGTERM');
        grace = setTimeout(() => signalGroup('SIGKILL'), GRACE_MS);
      }, bound);
    }

    child.on('error', (error) => finish(rejectPromise, error));
    child.on('exit', (code, signal) => {
      if (timedOut) {
        // The group still gets the last word, because `exit` is about the one
        // process the bound killed and the step may have left others behind.
        signalGroup('SIGKILL');
        finish(rejectPromise, new StepTimeout(bound === null ? null : Math.round(bound / 60_000)));
        return;
      }
      if (signal !== null) {
        finish(rejectPromise, new Error(`the step was killed by ${signal}`));
        return;
      }
      if (code !== 0) {
        finish(rejectPromise, new Error(`the step exited ${String(code)}`));
        return;
      }
      finish(resolvePromise, undefined);
    });
  });
}
