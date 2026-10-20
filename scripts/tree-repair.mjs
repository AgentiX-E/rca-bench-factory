#!/usr/bin/env node
/**
 * Put back what a killed battery left, before anything reads the tree.
 *
 * ## The defect this exists for
 *
 * `scripts/injection/_witnesses.py` records the bytes of every file a battery may
 * mutate, restores them in a `finally`, and restores a *dead* run's leftovers when
 * the next battery takes the guard. That covers the case where one battery follows
 * another. It does not cover the case that actually happened:
 *
 *   a full local gate run was killed while the gate-test battery was injecting.
 *   The restore lived in that run's `finally`, so it never ran. Twenty-four
 *   minutes later the next run started its test step over a tree where one gate
 *   had lost a guard. Four tests went red -- a fixture that copies the gate swept
 *   up the mutation, the site inventory drifted by the one line the mutation
 *   added, and the witness table rejected the entry whose guard had been deleted
 *   -- and every one of those sentences described the mutation rather than the
 *   change under test.
 *
 * The repair was already written. What was missing is that the *reader* has to
 * run it. A gate session reads the tree in its first step, so this runs before the
 * plan does.
 *
 * ## Why it is a module and not four lines in the gate
 *
 * `verify-local.mjs` is a gate: `verify-gates-are-testable.mjs` proves it by
 * emptying it, so no test may import it. The repair decision -- what a refusal
 * means, what an absent `python3` means -- is worth a test, so it lives here,
 * where a test can drive it against a fixture cache and a journal it wrote itself.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/** The repository this file sits in, so a test can spawn the same script from anywhere. */
export const ROOT = join(import.meta.dirname, '..');
export const INJECTION = join(ROOT, 'scripts', 'injection');

/**
 * The repair, driven as a one-line program rather than as an entry point.
 *
 * `scripts/injection/_witnesses.py` is a shared module, and
 * `batteries-reach-an-invoker.test.ts` decides "battery" by whether a file under
 * `scripts/injection/` has a `__main__`: a file with an entry point is something
 * to run, and something to run must be invoked by a package script and a CI
 * workflow. Giving the repair a `__main__` would therefore have made a module
 * into a battery, and the next step would have been wiring a repair command into
 * CI as though it measured something. `-c` keeps the module a module.
 */
const REPAIR_PROGRAM = [
  'import sys',
  `sys.path.insert(0, ${JSON.stringify(INJECTION)})`,
  'import _witnesses as W',
  'n = W.repair_abandoned()',
  'print("_witnesses: no abandoned journal; the tree is what the last run left" if n == 0 ' +
  'else f"_witnesses: {n} journal(s) repaired")',
].join('\n');

/**
 * Run the repair, and report what it said.
 *
 * Three outcomes, and they are not the same sentence:
 *
 *   - `repaired` -- nothing was left behind, or what was left has been put back;
 *   - `held` -- a live battery owns the tree. Two batteries cannot measure one
 *     working tree, and neither can a gate session and a battery: the repair
 *     refuses rather than writing bytes under a running run.
 *   - `unavailable` -- there is no `python3`. The batteries need it too, so a run
 *     without it is already a run that cannot verify them; saying so is better
 *     than reporting a clean tree nobody checked.
 *
 * `status` is the child's exit code, and `null` when it never started, so a caller
 * can tell "refused" from "crashed".
 */
export function repairAbandonedTree({ python = 'python3', cache = null, cwd = ROOT } = {}) {
  const env = { ...process.env };
  if (cache !== null) env['RCA_BENCH_BATTERY_CACHE'] = cache;
  const result = spawnSync(python, ['-c', REPAIR_PROGRAM], { cwd, encoding: 'utf8', env });
  if (result.error !== undefined) {
    return {
      state: 'unavailable',
      status: null,
      ok: false,
      message:
        `preflight: could not run ${python} (${result.error.message}). The injection batteries need it, ` +
        'so this run cannot verify them -- and a tree a killed battery was holding is not repaired either.',
    };
  }
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const refused = output.includes('cannot measure one working tree');
  return {
    state: refused ? 'held' : result.status === 0 ? 'repaired' : 'failed',
    status: result.status,
    ok: result.status === 0,
    message: output,
  };
}
