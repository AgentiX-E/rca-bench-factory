import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
/**
 * The scripts this file drives, declared as well as done.
 *
 * `gate-sites-are-proven.test.ts` refuses a site that is named but never
 * executed, so the two accounts -- this declaration and the `spawnSync` calls
 * below -- have to agree. Two of the three exits in `verify-local.mjs` were
 * unreachable from a test until the workflow path became overridable; the
 * fixtures here are the shipped `ci.yml` with one thing changed, never a
 * hand-written workflow, so they cannot drift out of the parser's shapes.
 */
const DRIVES = ['scripts/verify-local.mjs', 'scripts/gate-steps.mjs'];

import {
  LOCAL_INCOMPATIBLE,
  ROOT,
  SETUP_ACTIONS,
  STEP_KEYS,
  STEP_PLAN,
  classify,
  conditionOf,
  describePlan,
  localCommands,
  readWorkflow,
  runSteps,
  shippedPlan,
} from '../../../scripts/gate-steps.mjs';


/**
 * The one definition of "how to check a change here".
 *
 * ## The defect this exists for
 *
 * For ten passes the local gate was `pnpm lint 2>&1 | grep -c FAIL`. It printed
 * `0` every time, because `lint` never prints that word -- it exits 1 and says
 * something else. The check could not fail, so it certified every change; CI then
 * rejected two of them.
 *
 * A `verify:local` script that restated CI's steps would have been a copy of the
 * workflow, and a copy drifts. So the steps are **read from `ci.yml`**, and the
 * only hand-written thing is the classification -- which of them need something a
 * laptop does not have. That table is checkable, and this file checks it.
 *
 * ## What each test is for
 *
 * - `shippedPlan()` clean: the workflow and the table agree *today*.
 * - the parser on synthetic text: a step it cannot read is an error, not a
 *   silently shorter plan.
 * - `classify` on synthetic steps: all four ways to be wrong, because a validator
 *   whose failure branches were never driven is a validator that does not exist.
 * - `runSteps` with an injected runner: the failure branch, without breaking a
 *   real gate to reach it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(ROOT, 'scripts', 'verify-local.mjs');

const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-verify-local-'));

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

describe('the shipped workflow and the shipped plan agree', () => {
  it('classifies every run step, with no ghost entries', () => {
    const plan = shippedPlan();
    expect(plan.errors).toEqual([]);
    // A parser that quietly stopped reading would satisfy the assertion above.
    expect(plan.steps.length).toBeGreaterThan(50);
    expect(plan.local.length + plan.remote.length).toBeGreaterThan(40);
    expect(plan.remote.length).toBeGreaterThan(0);
  });

  it('keeps `sudo` out of the local plan', () => {
    // The mechanical form of "it can run here": a step that installs a package
    // through apt is not a local step, it is a step that would fail on a laptop
    // without a password prompt.
    for (const step of shippedPlan().local) {
      expect(step.run, `${step.key} asks for sudo`).not.toMatch(/\bsudo\b/);
    }
  });

  it('gives every remote-only step a reason, and every setup action one too', () => {
    for (const step of shippedPlan().remote) {
      expect(step.why.length, `${step.key}`).toBeGreaterThan(40);
    }
    for (const [action, reason] of Object.entries(SETUP_ACTIONS)) {
      expect(reason.length, action).toBeGreaterThan(20);
    }
  });

  it('covers every job in the workflow', () => {
    // A job whose steps were all classified remote-only would mean a whole job
    // that no local run touches; that is allowed, but it has to be visible.
    const jobs = new Set(shippedPlan().steps.map((step) => step.job));
    const localJobs = new Set(shippedPlan().local.map((step) => step.job));
    expect([...jobs].filter((job) => !localJobs.has(job))).toEqual([]);
  });
});

describe('the workflow reader', () => {
  const WORKFLOW = [
    'name: CI',
    'on:',
    '  push:',
    'jobs:',
    '  one:',
    '    steps:',
    '      - name: Check out',
    '        uses: actions/checkout@v4',
    '',
    '      - name: A gate',
    '        run: pnpm gate',
    '',
    '      - name: A script',
    '        run: |',
    '          set -eu',
    '          echo one',
    '          echo two',
  ].join('\n');

  it('reads run, uses and a multi-line block', () => {
    const { steps, errors } = readWorkflow(WORKFLOW);
    expect(errors).toEqual([]);
    expect(steps.map((step) => [step.job, step.name, step.uses, step.run])).toEqual([
      ['one', 'Check out', 'actions/checkout@v4', null],
      ['one', 'A gate', null, 'pnpm gate'],
      ['one', 'A script', null, 'set -eu\necho one\necho two'],
    ]);
  });

  it('refuses a step with neither run nor uses, instead of dropping it', () => {
    const broken = WORKFLOW.replace('        run: pnpm gate', '        with:\n          node: 22');
    const { steps, errors } = readWorkflow(broken);
    expect(errors.join('\n')).toContain('has neither');
    // The step is still reported: a shorter plan would be a quieter defect.
    expect(steps.map((step) => step.name)).toContain('A gate');
  });

  it('refuses a workflow with no jobs block', () => {
    expect(readWorkflow('name: CI\non: push\n').errors).toEqual(['ci.yml has no top-level `jobs:`']);
  });

  it('refuses a run block with no body', () => {
    const empty = WORKFLOW.replace('          set -eu\n          echo one\n          echo two', '');
    expect(readWorkflow(empty).errors.join('\n')).toContain('no body');
  });
});

describe('classify', () => {
  const steps = [
    { job: 'verify', name: 'Install dependencies', key: 'verify / Install dependencies', run: 'pnpm install', uses: null },
    { job: 'verify', name: 'Check out', key: 'verify / Check out', run: null, uses: 'actions/checkout@v4' },
    { job: 'verify', name: 'Gate', key: 'verify / Gate', run: 'pnpm gate', uses: null },
  ];
  const plan = { 'verify / Install dependencies': { local: true }, 'verify / Gate': { local: true } };

  it('passes a step that is in the plan and a uses that is a setup action', () => {
    expect(classify(steps, plan).errors).toEqual([]);
  });

  it('names a step with no entry', () => {
    const errors = classify(steps.slice(0, 1).concat(steps.slice(2)), {
      'verify / Install dependencies': { local: true },
    }).errors;
    expect(errors.join('\n')).toContain('verify / Gate: no plan entry');
  });

  it('names an entry with no step', () => {
    const errors = classify(steps.slice(0, 1), plan).errors;
    expect(errors.join('\n')).toContain('verify / Gate: in the plan, but no such step exists');
  });

  it('refuses a reason too short to be a reason', () => {
    const errors = classify(steps.slice(0, 1).concat(steps.slice(2)), {
      'verify / Install dependencies': { local: true },
      'verify / Gate': { remoteOnly: 'needs a runner' },
    }).errors;
    expect(errors.join('\n')).toContain('not a reason');
  });

  it('refuses an action that is not setup, because a gate could hide in one', () => {
    const withAction = steps.concat([
      {
        job: 'verify',
        name: 'A gate as an action',
        key: 'verify / A gate as an action',
        run: null,
        uses: 'someone/a-gate@v1',
      },
    ]);
    const errors = classify(withAction, plan).errors;
    expect(errors.join('\n')).toContain('someone/a-gate@v1');
    expect(errors.join('\n')).toContain('cannot see');
  });

  it('refuses an entry that is neither shape', () => {
    const errors = classify(steps.slice(0, 1).concat(steps.slice(2)), {
      'verify / Install dependencies': { local: true },
      'verify / Gate': { note: 'looks local' },
    }).errors;
    expect(errors.join('\n')).toContain('neither');
  });

  it('lists the local and remote steps it accepted', () => {
    const result = classify(steps, {
      'verify / Install dependencies': { local: true },
      'verify / Gate': { remoteOnly: 'needs a package index this machine does not have, by design' },
    });
    expect(result.local.map((step) => step.key)).toEqual(['verify / Install dependencies']);
    expect(result.remote.map((step) => step.key)).toEqual(['verify / Gate']);
    // The setup action is in neither list: it is not a step, it is a precondition.
    expect(result.local.concat(result.remote).map((step) => step.key)).not.toContain('verify / Check out');
  });
});

describe('the keys a step may carry', () => {
  function step(
    keys: string[],
    run: string | null = 'pnpm gate',
    values: Record<string, string> = {},
  ): Record<string, unknown> {
    return {
      job: 'verify',
      name: 'Gate',
      key: 'verify / Gate',
      run,
      uses: run === null ? 'actions/checkout@v4' : null,
      keys,
      values,
    };
  }
  const LOCAL = { 'verify / Gate': { local: true } };
  const REMOTE = { 'verify / Gate': { remoteOnly: 'needs a package index this machine does not have, by design' } };

  it.each(LOCAL_INCOMPATIBLE)('refuses `%s:` on a step marked local', (key) => {
    // Each of these changes whether, where or with what the command runs, so
    // "verify:local ran this step" would be false. The message has to name the
    // key and offer the two ways out, because the repair differs per key.
    const errors = classify([step(['run', key])], LOCAL).errors;
    expect(errors.join('\n')).toContain(`carries \`${key}:\``);
    expect(errors.join('\n')).toContain('make it remote-only');
  });

  it.each(LOCAL_INCOMPATIBLE)('tolerates `%s:` on a step that does not run here', (key) => {
    // The shipped workflow has two `if: always()` steps and both are outside the
    // plan. A tolerance that is never used is indistinguishable from a rule that
    // was never needed, so the same key is allowed exactly where it cannot lie.
    const values = key === 'if' ? { if: 'always()' } : {};
    const result = classify([step(['run', key], undefined, values)], REMOTE);
    expect(result.errors).toEqual([]);
    expect(result.remote.map((one) => one.key)).toEqual(['verify / Gate']);
    expect(result.tolerated).toEqual([
      { key: 'verify / Gate', keys: [key], condition: key === 'if' ? 'always()' : null },
    ]);
  });

  it('refuses a key it does not know, rather than assuming it is harmless', () => {
    const errors = classify([step(['run', 'strategy'])], LOCAL).errors;
    expect(errors.join('\n')).toContain('does not know what `strategy:` does to a step');
  });

  it('tolerates `id:` and `timeout-minutes:` on a local step', () => {
    // Neither can change the verdict: one is a name, the other is a resource
    // bound. A slower step on this machine still fails the same way.
    const result = classify([step(['run', 'id', 'timeout-minutes'])], LOCAL);
    expect(result.errors).toEqual([]);
    expect(result.local).toHaveLength(1);
    expect(result.tolerated).toEqual([]);
  });

  it('refuses `with:` on a `run:` step, which GitHub does not allow either', () => {
    const errors = classify([step(['run', 'with'])], LOCAL).errors;
    expect(errors.join('\n')).toContain('a `run:` step with `with:`');
  });

  it('keeps `with:` on a `uses:` step, which is what it is for', () => {
    // An action is not in the plan at all -- it is a precondition -- so the plan
    // passed here is empty on purpose: an entry for it would be a ghost.
    const result = classify([step(['uses', 'with'], null)], {});
    expect(result.errors).toEqual([]);
  });

  it('records a conditional action, because the workflow uses conditions there too', () => {
    const result = classify([step(['uses', 'if'], null, { if: 'always()' })], {});
    expect(result.errors).toEqual([]);
    expect(result.tolerated).toEqual([{ key: 'verify / Gate', keys: ['if'], condition: 'always()' }]);
  });

  it('tolerates `always()` and refuses every other condition, because only one of them widens', () => {
    // The one tolerated key whose *value* can contradict the plan. `always()` only
    // widens when a step runs; a branch or an event filter narrows it, and then
    // "did not run here because it needs prometheus" is true and incomplete --
    // the step may not run in CI either.
    const allowed = classify([step(['run', 'if'], undefined, { if: 'always()' })], REMOTE);
    expect(allowed.errors).toEqual([]);

    const formal = classify([step(['run', 'if'], undefined, { if: '${{ always() }}' })], REMOTE);
    expect(formal.errors).toEqual([]);
    expect(formal.tolerated[0]?.condition).toBe('always()');

    for (const condition of ["github.ref == 'refs/heads/main'", 'success()', '|']) {
      const refused = classify([step(['run', 'if'], undefined, { if: condition })], REMOTE);
      expect(refused.errors.join('\n'), condition).toContain('is a condition this plan cannot describe');
      expect(refused.errors.join('\n'), condition).toContain('Only `always()` can be tolerated');
      expect(refused.remote, condition).toEqual([]);
    }
  });

  it('still refuses `always()` on a step marked local, and for the other reason', () => {
    // Two different objections, and the message has to be the right one: on a
    // local step the problem is that `runSteps` stops at the first failure, so a
    // step that runs regardless would not run at all.
    const errors = classify([step(['run', 'if'], undefined, { if: 'always()' })], LOCAL).errors;
    expect(errors.join('\n')).toContain('carries `if:`');
    expect(errors.join('\n')).not.toContain('cannot describe');
  });

  it('refuses a non-always condition on an action too', () => {
    const errors = classify([step(['uses', 'if'], null, { if: 'failure()' })], {}).errors;
    expect(errors.join('\n')).toContain('on an action is a condition this plan cannot describe');
  });

  it('reads a condition the way GitHub writes it', () => {
    expect(conditionOf('always()')).toBe('always()');
    expect(conditionOf('  ${{ always() }}  ')).toBe('always()');
    expect(conditionOf('${{ failure() }}')).toBe('failure()');
    expect(conditionOf(undefined)).toBe('');
  });

  it('tolerates only `always()` on the shipped workflow', () => {
    const plan = shippedPlan();
    expect(plan.tolerated.map((one) => one.condition)).toEqual(['always()', 'always()']);
  });

  it('states every key it understands, so an unknown one is a gap and not a surprise', () => {
    const known = Object.keys(STEP_KEYS);
    for (const key of LOCAL_INCOMPATIBLE) expect(known, key).toContain(key);
    for (const key of ['run', 'uses', 'name', 'with', 'id', 'timeout-minutes']) expect(known, key).toContain(key);
  });

  it('uses the tolerance on the shipped workflow, and says where', () => {
    // The point of the last pass: the two `if: always()` steps are outside the
    // plan, and both are. If one of them ever became local, this fails before CI
    // does -- which is exactly what a plan is for.
    const plan = shippedPlan();
    expect(plan.tolerated.map((one) => one.key)).toEqual([
      'batteries / Publish the gate-test battery report',
      'batteries / Upload the gate-test battery report',
    ]);
    for (const one of plan.tolerated) {
      expect(plan.local.map((local) => local.key)).not.toContain(one.key);
    }
  });
});

describe('the plan as a runnable sequence', () => {
  const local = [
    { key: 'a / one', run: 'pnpm build' },
    { key: 'b / two', run: 'pnpm build' },
    { key: 'a / three', run: 'pnpm lint' },
  ];

  it('runs a command once even when two jobs both run it', () => {
    const commands = localCommands(local);
    expect(commands.map((step) => step.run)).toEqual(['pnpm build', 'pnpm lint']);
    expect(commands[0].first).toBe('a / one');
    expect(commands[0].also).toEqual(['b / two']);
  });

  it('keeps the order CI uses', () => {
    expect(localCommands(local.slice(2).concat(local.slice(0, 2))).map((step) => step.run)).toEqual([
      'pnpm lint',
      'pnpm build',
    ]);
  });

  it('stops at the first failure and says which step it was', () => {
    const seen = [];
    const result = runSteps(localCommands(local), (command) => {
      seen.push(command);
      if (command === 'pnpm lint') throw new Error('lint failed');
    });
    expect(result.ok).toBe(false);
    expect(result.step.first).toBe('a / three');
    expect(result.index).toBe(1);
    expect(seen).toEqual(['pnpm build', 'pnpm lint']);
  });

  it('runs every command when none fails', () => {
    const seen = [];
    const result = runSteps(localCommands(local), (command) => seen.push(command));
    expect(result.ok).toBe(true);
    expect(seen).toEqual(['pnpm build', 'pnpm lint']);
    expect(result.commands).toBe(2);
  });
});

describe('scripts/verify-local.mjs as a command', () => {
  it('prints the plan, including every reason for not running a step', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--list'], { cwd: ROOT, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('run steps can run here');
    for (const step of shippedPlan().remote) {
      expect(result.stdout).toContain(step.key);
      expect(result.stdout).toContain(step.why);
    }
    // The tolerated keys are printed too: a plan that silently ignored an `if:`
    // would look identical to one that has none.
    expect(result.stdout).toContain('step(s) outside the plan carry a key this runner does not reproduce');
    expect(result.stdout).toContain('Publish the gate-test battery report — if (always()), env');
  });

  it('refuses a filter that selects nothing, rather than reporting success', () => {
    // The failure mode a filter invites: `--only bateries` (a typo) would run
    // zero commands and exit 0, which reads exactly like a green run.
    const result = spawnSync(process.execPath, [SCRIPT, '--only', 'no-such-step'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no step key contains');
  });

  it('describes the plan in the same order the run uses', () => {
    const plan = shippedPlan();
    const lines = describePlan(plan);
    const locals = lines.filter((line) => line.startsWith('  local   '));
    expect(locals).toHaveLength(plan.local.length);
    expect(locals[0]).toContain(plan.local[0].key);
  });
});

describe('the exits, reached without breaking the shipped workflow', () => {
  const scratch = SCRATCH;

  /** The shipped workflow with one command replaced, by exact step key. */
  function workflowWith(key: string, command: string): string {
    const text = readFileSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const lines = text.split('\n');
    const at = lines.findIndex((line) => line === `      - name: ${key.split(' / ')[1] ?? ''}`);
    expect(at, `no step named ${key}`).toBeGreaterThan(-1);
    const runAt = lines.findIndex((line, index) => index > at && /^ {8}run: /.test(line));
    expect(runAt, `no run under ${key}`).toBeGreaterThan(at);
    lines[runAt] = `        run: ${command}`;
    const path = join(scratch, `ci-${String(Math.abs(key.length + command.length))}.yml`);
    writeFileSync(path, lines.join('\n'));
    return path;
  }

  it('refuses a workflow the plan does not describe, naming the step', () => {
    const text = readFileSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
      .replace('      - name: Type-check', '      - name: Type-check (renamed)');
    const path = join(scratch, 'ci-renamed.yml');
    writeFileSync(path, text);

    const result = spawnSync(process.execPath, [SCRIPT, '--list'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_WORKFLOW: path },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('the plan does not match the workflow');
    expect(result.stderr).toContain('Type-check (renamed)');
  });

  it('reports a failing step by name and command, and stops there', () => {
    // One command replaced with `exit 3`, and `--only` selects just that step, so
    // the failure branch is reached in a second instead of after a suite run.
    const path = workflowWith('verify / Type-check', 'exit 3');
    const result = spawnSync(process.execPath, [SCRIPT, '--only', 'verify / Type-check'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_WORKFLOW: path },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('verify:local: FAILED at 1/1');
    expect(result.stderr).toContain('verify / Type-check');
    expect(result.stderr).toContain('command: exit 3');
  });

  it('runs the step it selected and says how many it left out', () => {
    const path = workflowWith('verify / Type-check', 'true');
    const result = spawnSync(process.execPath, [SCRIPT, '--only', 'verify / Type-check'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_WORKFLOW: path },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('verify:local: OK (1 command(s), 1 of the 36 local steps)');
    expect(result.stdout).toContain('did not run:');
  });

  it('declares the scripts it drives, in the form the inventory reads', () => {
    expect(DRIVES).toEqual(['scripts/verify-local.mjs', 'scripts/gate-steps.mjs']);
  });
});

describe('the plan is a claim about this repository', () => {
  it('names steps that exist, so a renamed step cannot leave the plan quietly', () => {
    const plan = shippedPlan();
    const keys = new Set(plan.steps.map((step) => step.key));
    for (const key of Object.keys(STEP_PLAN)) expect(keys.has(key), key).toBe(true);
  });

  it('has no local step whose command is empty', () => {
    for (const step of shippedPlan().local) expect(step.run.trim(), step.key).not.toBe('');
  });

  it('agrees with `check-no-mock` about where test files live', () => {
    // A small cross-check that the local plan and the lint guards use the same
    // working directory: both run from the repository root, and this file is read
    // from there by the scripts above.
    expect(resolve(HERE, '..', '..', '..')).toBe(ROOT);
  });
});
