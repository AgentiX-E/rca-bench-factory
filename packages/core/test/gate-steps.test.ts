import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
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
  DEFAULT_SHELL,
  ROOT,
  SETUP_ACTIONS,
  SHELLS,
  STEP_KEYS,
  STEP_PLAN,
  classify,
  conditionOf,
  conditionOn,
  cwdOf,
  booleanOf,
  describePlan,
  duration,
  envOf,
  failureReport,
  localCommands,
  materialiseStep,
  notedFailures,
  readWorkflow,
  runSteps,
  runsGiven,
  timeoutOf,
  JOB_KEYS,
  shellOf,
  shippedPlan,
  whereOf,
} from '../../../scripts/gate-steps.mjs';
import { runStep, StepTimeout } from '../../../scripts/step-process.mjs';


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

/**
 * The battery cache a nested `verify:local` is given: its own, and empty.
 *
 * Its preflight (finding 196) repairs what a killed battery left and **refuses while a
 * live one holds the tree**. A test that spawns it from a suite which also runs the
 * injection batteries would otherwise hand it the repository's cache, and would then
 * measure that refusal instead of the step it named -- measured once, as
 * `verify:local: the tree is not the repository's: _witnesses: pid 213281 is running
 * gate-tests-battery on this tree`, on a run where the step itself was fine.
 *
 * A nested run measures a tree nobody else is holding, or it measures nothing; with a
 * cache of its own it is always the first case.
 */
const BATTERY_CACHE = mkdtempSync(join(SCRATCH, 'battery-cache-'));

/** The environment for a nested run: the fixture workflow, and a cache with no journals. */
function nestedEnv(workflow: string): NodeJS.ProcessEnv {
  return { ...process.env, RCA_CI_WORKFLOW: workflow, RCA_BENCH_BATTERY_CACHE: BATTERY_CACHE };
}

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

  it('reads keys written below the command, which is where GitHub writes them', () => {
    // The loop used to `break` at `run:`, so every key below the command was
    // invisible -- including `working-directory:`, which GitHub's own examples
    // place after it. The shipped workflow writes `if:` above `run:`, which is why
    // the shape survived: nothing here used the other order, and nothing read the
    // keys that were dropped.
    const below = WORKFLOW.replace(
      '        run: pnpm gate',
      '        run: pnpm gate\n        working-directory: examples\n        if: always()',
    );
    const { steps, errors } = readWorkflow(below);
    expect(errors).toEqual([]);
    const gate = steps.find((one) => one.name === 'A gate');
    expect(gate.keys).toEqual(['run', 'working-directory', 'if']);
    expect(gate.values).toEqual({ run: 'pnpm gate', 'working-directory': 'examples', if: 'always()' });
  });

  it('does not mistake the body of a block scalar for keys, which is why it can continue', () => {
    // Ten spaces of body against a key pattern anchored at exactly eight. If that
    // distinction were wrong, the four lines above would be four keys.
    const { steps } = readWorkflow(WORKFLOW);
    const script = steps.find((one) => one.name === 'A script');
    expect(script.keys).toEqual(['run']);
    expect(script.run).toBe('set -eu\necho one\necho two');
  });

  it('reads a block `env:` map, which is the one value that is not on the key line', () => {
    const withEnv = WORKFLOW.replace(
      '      - name: A gate\n        run: pnpm gate',
      '      - name: A gate\n        env:\n          NODE_OPTIONS: --max-old-space-size=4096\n          QUOTED: "two words"\n        run: pnpm gate',
    );
    const { steps, errors } = readWorkflow(withEnv);
    expect(errors).toEqual([]);
    const gate = steps.find((one) => one.name === 'A gate');
    expect(gate.keys).toEqual(['env', 'run']);
    expect(gate.env).toEqual({
      NODE_OPTIONS: '--max-old-space-size=4096',
      QUOTED: '"two words"',
    });
    // The block ends at the next key, and the key after it is still read.
    expect(gate.run).toBe('pnpm gate');
  });

  it('records a flow-style `env:` rather than parsing it, because splitting on commas would be a guess', () => {
    // `env: {A: b, C: "${{ join(x, ', ') }}"}` is legal YAML and legal GitHub, and
    // a reader that split it on commas would cut the expression in half. The shape
    // is recorded and refused downstream, with the spelling that works.
    const flow = WORKFLOW.replace('        run: pnpm gate', '        env: {A: b}\n        run: pnpm gate');
    const { steps } = readWorkflow(flow);
    const gate = steps.find((one) => one.name === 'A gate');
    expect(gate.values.env).toBe('{A: b}');
    expect(gate.env).toBeUndefined();
  });

  it('reads the bound a job gives every step in it, which this reader had never looked for', () => {
    // `timeout-minutes:` stands on all four jobs of the shipped workflow, and this
    // reader walked past it for four passes: it only ever looked at step keys. The
    // line is the budget CI enforces, and the plan neither stated nor applied it.
    const withJob = [
      'jobs:',
      '  one:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 15',
      '    steps:',
      '      - name: Gate',
      '        run: pnpm gate',
    ].join('\n');
    const { steps, errors } = readWorkflow(withJob);
    expect(errors).toEqual([]);
    expect(steps[0].jobTimeout).toBe('15');
  });

  it('reads a job key written below `steps:`, because keys may be in any order', () => {
    // The reason the value is stored per job and attached after the walk: a job may
    // declare its budget above the block or below it, and only one of the two reads
    // naturally. The plan should not depend on which.
    const below = [
      'jobs:',
      '  one:',
      '    steps:',
      '      - name: Gate',
      '        run: pnpm gate',
      '    timeout-minutes: 20',
    ].join('\n');
    expect(readWorkflow(below).steps[0].jobTimeout).toBe('20');
  });

  it('refuses a job key that would make every step in it a different step', () => {
    // Four keys change *what* runs rather than *where*: a matrix multiplies the
    // job, `defaults:` changes every step's shell and directory, a job-level
    // environment is not collected, and a container is another machine. Each of
    // those makes the plan's sentence about its steps false.
    const cases: [string, string][] = [
      ['    strategy:', 'matrix multiplies the job'],
      ['    defaults:', 'changes the shell and directory of every step'],
      ['    env:', 'not collected'],
      ['    container:', 'image this machine does not have'],
      ['    services:', 'services this machine does not run'],
    ];
    for (const [line, phrase] of cases) {
      const text = ['jobs:', '  one:', '    runs-on: ubuntu-latest', line, '    steps:', '      - name: Gate', '        run: pnpm gate'].join('\n');
      const errors = readWorkflow(text).errors.join('\n');
      expect(errors, line).toContain(phrase);
    }
  });

  it('tolerates the job keys that say where the runner is, and no more', () => {
    const text = [
      'jobs:',
      '  one:',
      '    name: a job',
      '    runs-on: ubuntu-latest',
      '    needs: another',
      '    permissions:',
      '      contents: read',
      '    steps:',
      '      - name: Gate',
      '        run: pnpm gate',
    ].join('\n');
    expect(readWorkflow(text).errors).toEqual([]);
  });

  it('tolerates a job condition only when it widens, exactly as at step level', () => {
    const base = ['jobs:', '  one:', '    runs-on: ubuntu-latest', '    steps:', '      - name: Gate', '        run: pnpm gate'];
    const narrow = base.toSpliced(3, 0, '    if: github.ref == \'refs/heads/main\'');
    expect(readWorkflow(narrow.join('\n')).errors.join('\n')).toContain('condition this plan cannot describe');
    const wide = base.toSpliced(3, 0, '    if: always()');
    expect(readWorkflow(wide.join('\n')).errors).toEqual([]);
  });

  it('refuses a job key it does not know, rather than assuming it is harmless', () => {
    const text = ['jobs:', '  one:', '    fancy: true', '    steps:', '      - name: Gate', '        run: pnpm gate'].join('\n');
    expect(readWorkflow(text).errors.join('\n')).toContain('does not know what `fancy:` does to a job');
  });

  it('does not read a `run:` block body as an `env:` entry when `env:` comes first', () => {
    // Both are ten spaces deep. What separates them is which key opened the block,
    // and a reader that keyed on indentation alone would fold the script into the
    // environment and lose the command.
    const both = [
      'jobs:',
      '  one:',
      '    steps:',
      '      - name: Gate',
      '        env:',
      '          A: b',
      '        run: |',
      '          echo one',
      '          echo two',
    ].join('\n');
    const { steps, errors } = readWorkflow(both);
    expect(errors).toEqual([]);
    expect(steps[0].env).toEqual({ A: 'b' });
    expect(steps[0].run).toBe('echo one\necho two');
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
    env: Record<string, string> | undefined = undefined,
  ): Record<string, unknown> {
    return {
      job: 'verify',
      name: 'Gate',
      key: 'verify / Gate',
      run,
      uses: run === null ? 'actions/checkout@v4' : null,
      keys,
      values,
      ...(env === undefined ? {} : { env }),
    };
  }
  const LOCAL = { 'verify / Gate': { local: true } };
  const REMOTE = { 'verify / Gate': { remoteOnly: 'needs a package index this machine does not have, by design' } };

  // A value for each key the vocabulary knows, so the sweep below can carry it.
  const SAMPLE: [string, string][] = [
    ['name', 'Gate'],
    ['id', 'gate'],
    ['shell', 'bash'],
    ['working-directory', '.'],
    ['env', ''],
    ['if', 'always()'],
    ['timeout-minutes', '5'],
    ['continue-on-error', 'true'],
  ];

  it('carries every key it knows onto a local step, because no key is impossible any more', () => {
    // `LOCAL_INCOMPATIBLE` is gone, and this test is where its absence is checked.
    // It held five keys in v2.18 -- `shell`, `working-directory`, `env`,
    // `timeout-minutes`, `continue-on-error` -- and every one of them turned out to
    // be a fact the runner had not collected yet rather than a thing a runner
    // cannot do. A list that shrank once per pass was never a list of
    // impossibilities; it was a list of unfinished work, and it is finished.
    for (const [key, value] of SAMPLE) {
      const result = classify([step(['run', key], 'pnpm gate', { [key]: value })], LOCAL);
      expect(result.errors, key).toEqual([]);
      expect(result.local, key).toHaveLength(1);
    }
    // Total, so a key added to the vocabulary has to be given a value here -- and
    // therefore has to be decided about, rather than defaulting to "carried" or
    // "refused" because nobody looked.
    const swept = new Set([...SAMPLE.map(([key]) => key), 'run', 'uses', 'with']);
    for (const key of Object.keys(STEP_KEYS)) expect(swept, `${key} is not in the sweep`).toContain(key);
  });

  it('carries a condition onto a local step, because whether a step runs is the loop\'s to decide', () => {
    // The last key, and the one that changes the loop rather than the step: a step
    // with `always()` has to run after a failure, which a runner that returned at
    // the first failure could not do.
    const result = classify([step(['run', 'if'], 'pnpm gate', { if: 'always()' })], LOCAL);
    expect(result.errors).toEqual([]);
    expect(result.local[0]).toMatchObject({ condition: 'always', conditionSpelled: 'always()' });

    // The default is a condition too, and it is spelled `null` because the
    // workflow did not say it. Carrying the default as if it had been written
    // would make `--list` claim a sentence the file does not contain.
    const plain = classify([step(['run'], 'pnpm gate')], LOCAL);
    expect(plain.local[0]).toMatchObject({ condition: 'success', conditionSpelled: null });
  });

  it('refuses a local condition whose inputs this machine does not have, quoting it', () => {
    const errors = classify([step(['run', 'if'], 'pnpm gate', { if: "github.ref == 'refs/heads/main'" })], LOCAL).errors;
    expect(errors.join('\n')).toContain("github.ref == 'refs/heads/main'");
    expect(errors.join('\n')).toContain('always()');
  });

  it('tolerates `always()` on a step that does not run here, and nothing narrower', () => {
    // The shipped workflow has two `if: always()` steps and both are outside the
    // plan. A tolerance that is never used is indistinguishable from a rule that
    // was never needed, so the same value is allowed exactly where it cannot lie.
    const result = classify([step(['run', 'if'], undefined, { if: 'always()' })], REMOTE);
    expect(result.errors).toEqual([]);
    expect(result.remote.map((one) => one.key)).toEqual(['verify / Gate']);
    expect(result.tolerated).toEqual([{ key: 'verify / Gate', keys: ['if'], condition: 'always()' }]);

    // `failure()` narrows: a step outside the plan that only runs on failure may
    // not run in CI either, and then the reason it does not run here is incomplete.
    const narrow = classify([step(['run', 'if'], undefined, { if: 'failure()' })], REMOTE);
    expect(narrow.errors.join('\n')).toContain('cannot describe');
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

  it('carries a local condition rather than mentioning it as tolerated', () => {
    // A tolerated key is one the plan cannot act on and therefore only reports. A
    // condition on a local step is acted on -- the loop decides whether the step
    // runs -- so listing it as tolerated would be the plan saying it does not
    // reproduce something it does.
    const result = classify([step(['run', 'if'], 'pnpm gate', { if: 'always()' })], LOCAL);
    expect(result.tolerated).toEqual([]);
  });

  it('refuses a non-always condition on an action too', () => {
    const errors = classify([step(['uses', 'if'], null, { if: 'failure()' })], {}).errors;
    expect(errors.join('\n')).toContain('on an action is a condition this plan cannot describe');
  });

  it('says why a condition on an action is refused, rather than only that it is', () => {
    // Two different refusals on the same branch: one for a condition it understands
    // and will not honour there (`failure()`), one for a condition it cannot
    // evaluate at all. The second has to carry its own reason, or the message would
    // say "only `always()` widens" about a value that is not a widening question.
    const understood = classify([step(['uses', 'if'], null, { if: 'failure()' })], {}).errors.join('\n');
    expect(understood).toContain('only `always()` widens when it runs');

    const unreadable = classify([step(['uses', 'if'], null, { if: "${{ github.ref == 'refs/heads/main' }}" })], {}).errors.join('\n');
    expect(unreadable).toContain('cannot evaluate');
    expect(unreadable).not.toContain('only `always()` widens');
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
    for (const key of ['run', 'uses', 'name', 'with', 'id', 'timeout-minutes', 'if']) expect(known, key).toContain(key);
  });

  it('describes each key once, because a duplicate row is silent and the later one wins', () => {
    // Found while this pass was rewriting the table: `env` and `continue-on-error`
    // each stood twice -- once under "read" and once under an older heading -- and
    // an object literal keeps the last. So the table said `continue-on-error` "does
    // not fail the job, which this runner reads as a failure" for two passes after
    // the runner had learned to read it, and nothing could see it: the duplicate is
    // gone by the time anything parses the object.
    const source = readFileSync(resolve(ROOT, 'scripts', 'gate-steps.mjs'), 'utf8');
    const block = /export const STEP_KEYS = \{([\s\S]*?)\n\};/.exec(source);
    expect(block, 'the STEP_KEYS literal was not found').not.toBeNull();
    const keys = [...(block?.[1] ?? '').matchAll(/^ {2}'?([a-z][\w-]*)'?:/gm)].map((match) => match[1]);
    expect(keys.length).toBeGreaterThan(5);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it('keeps every description to the classes it claims, so no key is silently unclassified', () => {
    // Two classes and no third. If a key's description starts with anything else,
    // the table is saying something the code does not do.
    for (const [key, description] of Object.entries(STEP_KEYS)) {
      expect(String(description), key).toMatch(/^(read|tolerated):/);
    }
  });

  it('says there is no budget when nothing runs here, rather than printing an infinity', () => {
    // `Math.min()` of an empty list is `Infinity`, and the header branch for "every
    // command is bounded" is reached precisely when nothing is unbounded -- which
    // includes the case where nothing is bounded either. A plan that runs nothing
    // is not the shipped plan, and it is one `remoteOnly` away.
    const text = describePlan({ local: [], remote: [], tolerated: [] }).join('\n');
    expect(text).toContain('no command runs here');
    expect(text).not.toContain('Infinity');
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


  it('carries both keys onto the local entry rather than refusing the step', () => {
    // They do not make "a local run reproduces this step" impossible; they make it
    // incomplete, and the runner can complete it.
    const directory = classify(
      [step(['run', 'working-directory'], 'pnpm gate', { 'working-directory': 'examples' })],
      LOCAL,
    );
    expect(directory.errors).toEqual([]);
    expect(directory.local[0]).toMatchObject({ cwd: 'examples', shell: DEFAULT_SHELL });

    const shell = classify([step(['run', 'shell'], 'pnpm gate', { shell: 'bash -x {0}' })], LOCAL);
    expect(shell.errors).toEqual([]);
    expect(shell.local[0]).toMatchObject({ cwd: '.', shell: 'bash -x {0}' });
  });

  it('refuses a local step whose shell or directory it cannot honour, now that it claims to honour both', () => {
    const shell = classify([step(['run', 'shell'], 'pnpm gate', { shell: 'python {0}' })], LOCAL).errors;
    expect(shell.join('\n')).toContain('verify / Gate');
    expect(shell.join('\n')).toContain('an interpreter this runner cannot read');

    const directory = classify(
      [step(['run', 'working-directory'], 'pnpm gate', { 'working-directory': '/tmp' })],
      LOCAL,
    ).errors;
    expect(directory.join('\n')).toContain('absolute');
  });

  it('tolerates both keys on a step that does not run here, where they cannot mislead', () => {
    const shell = classify([step(['run', 'shell'], 'pnpm gate', { shell: 'python {0}' })], REMOTE);
    expect(shell.errors).toEqual([]);
    expect(shell.tolerated).toEqual([{ key: 'verify / Gate', keys: ['shell'], condition: null }]);

    const directory = classify(
      [step(['run', 'working-directory'], 'pnpm gate', { 'working-directory': '../outside' })],
      REMOTE,
    );
    expect(directory.errors).toEqual([]);
    expect(directory.tolerated).toEqual([
      { key: 'verify / Gate', keys: ['working-directory'], condition: null },
    ]);
  });

  it('refuses both keys on an action, where GitHub gives them no meaning either', () => {
    const errors = classify([step(['uses', 'shell'], null, { shell: 'bash' })], {}).errors;
    expect(errors.join('\n')).toContain('does nothing');
  });

  it('carries a literal `env:` onto a local step, because data is not a condition', () => {
    // The key was never the problem: a literal value is data the runner can pass to
    // the child process exactly as written. What the runner cannot supply is a value
    // only the runner can compute -- and that is a fact about the **value**, not
    // about the key.
    const result = classify(
      [step(['run', 'env'], 'pnpm gate', { env: '' }, { NODE_OPTIONS: '--max-old-space-size=4096' })],
      LOCAL,
    );
    expect(result.errors).toEqual([]);
    expect(result.local[0]).toMatchObject({ env: { NODE_OPTIONS: '--max-old-space-size=4096' } });
  });

  it('refuses a local step whose `env:` names a value only the runner can supply', () => {
    // The message quotes the value, because "cannot honour env" would send the
    // reader looking for the wrong thing in the wrong file.
    const errors = classify(
      [step(['run', 'env'], 'pnpm gate', { env: '' }, { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' })],
      LOCAL,
    ).errors;
    expect(errors.join('\n')).toContain('GITHUB_TOKEN');
    expect(errors.join('\n')).toContain('${{ secrets.GITHUB_TOKEN }}');
    expect(errors.join('\n')).toContain('remote-only');
  });

  it('refuses a local step whose `env:` is the spelling this reader does not parse', () => {
    const withInline = step(['run', 'env'], 'pnpm gate', { env: '{A: b}' });
    const errors = classify([withInline], LOCAL).errors;
    expect(errors.join('\n')).toContain('flow');
  });

  it('carries the job\'s bound onto the step, because that is the budget CI would apply', () => {
    const one = step(['run'], 'pnpm gate') as Record<string, unknown>;
    one.jobTimeout = '15';
    const result = classify([one], LOCAL);
    expect(result.errors).toEqual([]);
    expect(result.local[0]).toMatchObject({ timeoutMinutes: 15, timeoutFrom: 'job' });
  });

  it('carries the job\'s own budget beside the step\'s bound, because the job\'s is a pool', () => {
    // The two numbers are different facts. `timeoutMinutes` is what this step may
    // spend; `jobBudgetMinutes` is what the whole job has, and every step in it
    // draws from the same pool. GitHub enforces the second one -- a job that runs
    // fifteen minutes in total is killed whatever its steps declared.
    const one = step(['run'], 'pnpm gate') as Record<string, unknown>;
    one.jobTimeout = '15';
    expect(classify([one], LOCAL).local[0]).toMatchObject({ timeoutMinutes: 15, jobBudgetMinutes: 15 });

    const narrowed = step(['run', 'timeout-minutes'], 'pnpm gate', { 'timeout-minutes': '5' }) as Record<string, unknown>;
    narrowed.jobTimeout = '15';
    expect(classify([narrowed], LOCAL).local[0]).toMatchObject({ timeoutMinutes: 5, jobBudgetMinutes: 15 });

    // No job budget at all: CI's six-hour default applies there, and this runner
    // states no number rather than inventing one.
    expect(classify([step(['run'], 'pnpm gate')], LOCAL).local[0]).toMatchObject({ jobBudgetMinutes: null });
  });

  it('lets the step narrow the job\'s bound, which is the only direction GitHub allows', () => {
    const one = step(['run', 'timeout-minutes'], 'pnpm gate', { 'timeout-minutes': '5' }) as Record<string, unknown>;
    one.jobTimeout = '15';
    expect(classify([one], LOCAL).local[0]).toMatchObject({ timeoutMinutes: 5, timeoutFrom: 'step' });
  });

  it('refuses a local step whose bound it cannot enforce, quoting it', () => {
    const errors = classify(
      [step(['run', 'timeout-minutes'], 'pnpm gate', { 'timeout-minutes': 'soon' })],
      LOCAL,
    ).errors;
    expect(errors.join('\n')).toContain('not a whole number of minutes');
  });

  it('carries `continue-on-error: true` onto a local step, because a note is something a runner can reproduce', () => {
    const result = classify(
      [step(['run', 'continue-on-error'], 'pnpm gate', { 'continue-on-error': 'true' })],
      LOCAL,
    );
    expect(result.errors).toEqual([]);
    expect(result.local[0]).toMatchObject({ continueOnError: true });
  });

  it('carries an explicit `false` as false, rather than as absent', () => {
    // The two are the same verdict today and different facts about the workflow;
    // a plan that collapsed them could not later explain why a step stopped.
    const result = classify(
      [step(['run', 'continue-on-error'], 'pnpm gate', { 'continue-on-error': 'false' })],
      LOCAL,
    );
    expect(result.local[0]).toMatchObject({ continueOnError: false });
  });

  it('refuses a local step whose flag it cannot read', () => {
    const errors = classify(
      [step(['run', 'continue-on-error'], 'pnpm gate', { 'continue-on-error': 'yes' })],
      LOCAL,
    ).errors;
    expect(errors.join('\n')).toContain('not a boolean');
  });

  it('tolerates an unreadable bound outside the plan, where nothing is enforced anyway', () => {
    const result = classify(
      [step(['run', 'timeout-minutes'], 'pnpm gate', { 'timeout-minutes': '${{ inputs.minutes }}' })],
      REMOTE,
    );
    expect(result.errors).toEqual([]);
    expect(result.tolerated[0].keys).toContain('timeout-minutes');
  });

  it('tolerates any `env:` outside the plan, where its value cannot mislead', () => {
    // The publisher is the case in the shipped workflow: `GITHUB_TOKEN` is a
    // secret, and the reason the step does not run here is still the run token.
    const result = classify(
      [step(['run', 'env', 'if'], 'pnpm gate', { env: '', if: 'always()' }, { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' })],
      REMOTE,
    );
    expect(result.errors).toEqual([]);
    expect(result.tolerated).toEqual([{ key: 'verify / Gate', keys: ['if', 'env'], condition: 'always()' }]);
  });

});

describe('the interpreter and the directory a step runs in', () => {
  it("states CI's own default interpreter, because a runner with a different one runs different commands", () => {
    // `run:` is a script handed to an interpreter, not a string handed to `sh -c`.
    // The runner said `sh -c`, and on every Linux whose /bin/sh is dash that is a
    // different program: no `pipefail`, no `[[ ]]`, no `set -o`. A command could
    // therefore pass here and fail there, with no key in the workflow able to
    // explain the difference -- and `--list` said nothing, because a hard-coded
    // default is not a thing the plan had an opinion about.
    expect(DEFAULT_SHELL).toBe('bash --noprofile --norc -eo pipefail {0}');
    expect(SHELLS['bash']).toBe(DEFAULT_SHELL);
    expect(SHELLS['sh']).toBe('sh -e {0}');
    expect(DEFAULT_SHELL).not.toContain('-c');
    expect(DEFAULT_SHELL.split(' ').filter((token) => token === '{0}')).toHaveLength(1);
  });

  it('reads a named shell and a template alike, and a quoted scalar as itself', () => {
    expect(shellOf(undefined)).toMatchObject({ template: DEFAULT_SHELL, error: null });
    expect(shellOf('bash')).toMatchObject({ template: DEFAULT_SHELL, error: null });
    expect(shellOf('sh').template).toBe('sh -e {0}');
    expect(shellOf('bash -x {0}')).toMatchObject({ template: 'bash -x {0}', error: null });
    expect(shellOf('"bash"').template).toBe(DEFAULT_SHELL);
  });

  it('refuses an interpreter it cannot read, instead of running it as a shell', () => {
    // `python {0}` is a legitimate GitHub shell and a different language. Running
    // it through bash would be this runner inventing a meaning for the step,
    // which is the one thing a plan must never do.
    const result = shellOf('python {0}');
    expect(result.error).toContain('an interpreter this runner cannot read');
    expect(result.error).toContain('python');
    expect(result.error).toContain('remote-only');
  });

  it('refuses a template whose `{0}` count is not one, because the script would go nowhere', () => {
    expect(shellOf('bash -x').error).toContain('exactly one `{0}`');
    expect(shellOf('bash {0} {0}').error).toContain('exactly one `{0}`');
  });

  it('treats a working directory as a path inside this repository, or refuses it', () => {
    expect(cwdOf(undefined)).toMatchObject({ path: '.', error: null });
    expect(cwdOf('packages/core')).toMatchObject({ path: 'packages/core', error: null });
    expect(cwdOf('./examples/')).toMatchObject({ path: 'examples', error: null });
    expect(cwdOf('"packages/core"').path).toBe('packages/core');
    expect(cwdOf('/tmp').error).toContain('absolute');
    expect(cwdOf('../outside').error).toContain('leaves the repository');
    // Normalised before the check: `packages/../../outside` is the same directory
    // as `../outside`, and only one of the two spellings looks like an escape.
    expect(cwdOf('packages/../../outside').error).toContain('leaves the repository');
    // `working-directory: |` would otherwise become a directory literally named
    // `|`, which is inside the tree and therefore accepted.
    expect(cwdOf('|').error).toContain('block scalar');
  });

  it('runs every shipped local step under CI\'s interpreter, from the root, because none says otherwise', () => {
    // Not an assumption but a measurement, and the measurement is the reason the
    // default matters at all: it is the interpretation of all 36 local steps.
    const plan = shippedPlan();
    for (const one of plan.local) {
      expect(one.shell, one.key).toBe(DEFAULT_SHELL);
      expect(one.cwd, one.key).toBe('.');
    }
  });

  it('says where a command runs only when that is not the root under the default shell', () => {
    expect(whereOf({ cwd: '.', shell: DEFAULT_SHELL })).toBe('');
    expect(whereOf({ cwd: 'examples', shell: DEFAULT_SHELL })).toBe('in examples');
    expect(whereOf({ cwd: '.', shell: 'sh -e {0}' })).toBe('sh -e {0}');
    expect(whereOf({ cwd: 'examples', shell: 'sh -e {0}' })).toBe('in examples, sh -e {0}');
    // A count, not the values: the values are in the workflow, and a run line that
    // reprinted them would be the second place they are written down.
    expect(whereOf({ env: { A: '1', B: '2' } })).toBe('env (2)');
    expect(whereOf({ cwd: 'examples', env: { A: '1' } })).toBe('in examples, env (1)');
  });
});

describe('the values an `env:` block declares', () => {
  it('separates what can be passed through from what only the runner can compute', () => {
    // The distinction is the whole reason `env:` stopped being a key-level refusal:
    // `A: b` is data, and `${{ secrets.Y }}` is a computation this machine has no
    // inputs for. One key, two answers, and the answer belongs to the value.
    const result = envOf({ env: { A: 'b', B: '"two words"', C: 'x ${{ secrets.Y }}' } });
    expect(result.error).toBeNull();
    expect(result.literals).toEqual({ A: 'b', B: 'two words' });
    expect(result.expressions).toEqual([{ name: 'C', value: 'x ${{ secrets.Y }}' }]);
  });

  it('reads no `env:` as no values, rather than as a problem', () => {
    expect(envOf({})).toEqual({ literals: {}, expressions: [], error: null });
  });

  it('names the flow spelling it does not parse, and says how to write it', () => {
    // Splitting `{A: b, C: "${{ join(x, ', ') }}"}` on commas would cut the
    // expression in half, and a reader that guessed here would produce an
    // environment nobody wrote.
    const result = envOf({ values: { env: '{A: b}' } });
    expect(result.error).toContain('flow');
    expect(result.error).toContain('{A: b}');
    expect(result.error).toContain('one `NAME: value` per line');
  });
});

describe('the budget a step is given', () => {
  it('takes the step\'s own bound, and the job\'s when the step says nothing', () => {
    // The inheritance GitHub applies, read from the line the workflow already has.
    expect(timeoutOf('5', '15')).toMatchObject({ minutes: 5, from: 'step', error: null });
    expect(timeoutOf(undefined, '15')).toMatchObject({ minutes: 15, from: 'job', error: null });
    expect(timeoutOf('', '')).toMatchObject({ minutes: null, from: null, error: null });
  });

  it('refuses anything that is not a whole positive number of minutes, quoting it', () => {
    // A bound this reader half-understood would be a bound it could not enforce,
    // and enforcing the wrong one is worse than enforcing none: a step killed at
    // the wrong moment reports a timeout CI would not have reported.
    for (const value of ['0', '1.5', 'soon', '-5']) {
      const result = timeoutOf(value, undefined);
      expect(result.minutes, value).toBeNull();
      expect(result.error, value).toBeTruthy();
    }
    expect(timeoutOf('1.5', undefined).error).toContain('not a whole number of minutes');
    expect(timeoutOf('0', undefined).error).toContain('below one minute');
  });

  it('refuses an expression, because a bound it cannot compute is one it cannot enforce', () => {
    const result = timeoutOf('${{ inputs.minutes }}', undefined);
    expect(result.error).toContain('cannot evaluate');
    expect(result.error).toContain('remote-only');
  });
});

describe('the flag that turns a failure into a note', () => {
  it('reads the two booleans GitHub accepts, and no values at all as no', () => {
    expect(booleanOf(undefined)).toEqual({ value: false, error: null });
    expect(booleanOf('')).toEqual({ value: false, error: null });
    expect(booleanOf('true')).toEqual({ value: true, error: null });
    expect(booleanOf('false')).toEqual({ value: false, error: null });
    // YAML 1.1 spells booleans in three cases, and GitHub's parser follows it.
    expect(booleanOf('True').value).toBe(true);
    expect(booleanOf('"true"').value).toBe(true);
  });

  it('refuses a value that is not a boolean, quoting it', () => {
    // `continue-on-error: yes` parses as a string in YAML 1.2 and as a boolean in
    // 1.1, so a reader that guessed would disagree with the runner about whether a
    // failure stops the job. It is refused instead.
    for (const value of ['yes', '1', 'maybe']) {
      const result = booleanOf(value);
      expect(result.value, value).toBe(false);
      expect(result.error, value).toContain('not a boolean');
    }
  });

  it('refuses an expression, because a flag it cannot evaluate is one it cannot honour', () => {
    expect(booleanOf('${{ inputs.strict }}').error).toContain('cannot evaluate');
  });
});

describe('the condition that decides whether a step runs at all', () => {
  it('reads the three functions whose only input is what already happened in this run', () => {
    // GitHub's `if:` is an expression language, and exactly three of its functions
    // take no input this machine does not have: `success()` (the default),
    // `failure()` and `always()`. Everything else -- a branch, an event, a matrix,
    // an input -- is a fact about the run that a local process cannot know.
    expect(conditionOn(undefined)).toEqual({ mode: 'success', spelled: null, error: null });
    expect(conditionOn('')).toEqual({ mode: 'success', spelled: null, error: null });
    expect(conditionOn('always()')).toEqual({ mode: 'always', spelled: 'always()', error: null });
    expect(conditionOn('${{ always() }}')).toEqual({ mode: 'always', spelled: 'always()', error: null });
    expect(conditionOn('failure()')).toMatchObject({ mode: 'failure' });
    expect(conditionOn('success()')).toMatchObject({ mode: 'success', spelled: 'success()' });
    expect(conditionOn('"always()"')).toMatchObject({ mode: 'always' });
  });

  it('refuses a condition it cannot evaluate, quoting it and naming the three it can', () => {
    // The difference from every other key so far: the *value* is the problem, and
    // it is a different kind of value -- not a secret but a fact about the run.
    for (const value of ["github.ref == 'refs/heads/main'", '${{ inputs.strict }}', 'success() && github.event_name == \'push\'']) {
      const result = conditionOn(value);
      expect(result.error, value).toContain('cannot evaluate');
      expect(result.error, value).toContain(value.replace(/^\$\{\{ | \}\}$/g, '').trim());
      expect(result.error, value).toContain('always()');
    }
  });

  it('refuses `cancelled()`, which names a state this runner does not have', () => {
    // CI would skip the step in a cancelled run; a local run has no cancellation,
    // so the honest answer is not "never runs" -- it is that the condition
    // describes a state that never occurs here.
    expect(conditionOn('cancelled()').error).toContain('cancelled');
  });
});

describe('whether a condition lets a step run, given what has happened', () => {
  it('lets the default condition through only while nothing has failed', () => {
    // The default is `success()`, and it is the reason a run stops being useful
    // after a failure: every later step without a condition is skipped by CI too.
    expect(runsGiven('success', false)).toBe(true);
    expect(runsGiven('success', true)).toBe(false);
  });

  it('lets `always()` through either way, which is the whole point of it', () => {
    expect(runsGiven('always', false)).toBe(true);
    expect(runsGiven('always', true)).toBe(true);
  });

  it('lets `failure()` through only after a failure', () => {
    expect(runsGiven('failure', false)).toBe(false);
    expect(runsGiven('failure', true)).toBe(true);
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

  it('stops at the first failure and says which step it was', async () => {
    const seen = [];
    const result = await runSteps(localCommands(local), (step) => {
      seen.push(step.run);
      if (step.run === 'pnpm lint') throw new Error('lint failed');
    });
    expect(result.ok).toBe(false);
    expect(result.step.first).toBe('a / three');
    expect(result.index).toBe(1);
    expect(seen).toEqual(['pnpm build', 'pnpm lint']);
  });

  it('runs every command when none fails', async () => {
    const seen = [];
    const result = await runSteps(localCommands(local), (step) => seen.push(step.run));
    expect(result.ok).toBe(true);
    expect(seen).toEqual(['pnpm build', 'pnpm lint']);
    expect(result.commands).toBe(2);
  });

  it('carries on past a failure the workflow says is a note, and records it', async () => {
    // `continue-on-error: true` is a statement about the job, not about the
    // command: CI runs the step, marks it failed, and finishes the job green. A
    // runner that stopped would refuse work CI would have done.
    const seen = [];
    const result = await runSteps(
      localCommands([
        { key: 'a / one', run: 'pnpm lint', continueOnError: true },
        { key: 'b / two', run: 'pnpm build' },
      ]),
      (step) => {
        seen.push(step.run);
        if (step.run === 'pnpm lint') throw new Error('the step exited 1');
      },
    );
    expect(result.ok).toBe(true);
    expect(seen).toEqual(['pnpm lint', 'pnpm build']);
    expect(notedFailures(result.outcomes).map((one) => one.step.first)).toEqual(['a / one']);
    expect(notedFailures(result.outcomes)[0].error.message).toContain('exited 1');
  });

  it('does not carry on past a failure the workflow says is a failure', async () => {
    const seen = [];
    const result = await runSteps(
      localCommands([
        { key: 'a / one', run: 'pnpm lint' },
        { key: 'b / two', run: 'pnpm build' },
      ]),
      (step) => {
        seen.push(step.run);
        if (step.run === 'pnpm lint') throw new Error('the step exited 1');
      },
    );
    expect(result.ok).toBe(false);
    // Nothing after the failure ran, and each of them is recorded as skipped with
    // the reason -- a step that silently disappears is indistinguishable from one
    // the plan never had.
    expect(seen).toEqual(['pnpm lint']);
    expect(notedFailures(result.outcomes)).toEqual([]);
    expect(result.outcomes.slice(1).map((one) => one.status)).toEqual(['skipped']);
  });

  it('does not carry on past a step that spent the job\'s budget, whatever the flag says', async () => {
    // In CI the bound belongs to the job: a step that spends it ends the job,
    // and `continue-on-error` has nothing left to continue to. Reproducing the
    // note without reproducing the death would be the worse half of both.
    const result = await runSteps(
      localCommands([
        { key: 'a / one', run: 'pnpm lint', continueOnError: true },
        { key: 'b / two', run: 'pnpm build' },
      ]),
      (step) => {
        if (step.run === 'pnpm lint') throw Object.assign(new Error('bound'), { timedOut: true });
      },
    );
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(notedFailures(result.outcomes)).toEqual([]);
    // A spent budget ends the job, so nothing after it runs -- not even a step
    // whose condition widens -- and the step that met the ending is recorded.
    expect(result.outcomes.map((one) => one.status)).toEqual(['timed-out', 'skipped']);
  });

  it('runs a step whose condition widens past a failure, and skips the ones it does not cover', async () => {
    // The shape `if:` forces on the loop. CI does not walk past a failing step, so
    // the loop may only continue for the steps that asked to run anyway -- and it
    // has to say, of each one it did not run, that CI would not have run it either.
    const seen = [];
    const result = await runSteps(
      localCommands([
        { key: 'a / one', run: 'pnpm lint' },
        { key: 'b / two', run: 'pnpm build' },
        { key: 'c / three', run: 'pnpm report', condition: 'always' },
        { key: 'd / four', run: 'pnpm collect-logs', condition: 'failure' },
      ]),
      (step) => {
        seen.push(step.run);
        if (step.run === 'pnpm lint') throw new Error('the step exited 1');
      },
    );
    expect(result.ok).toBe(false);
    // The step that stopped the run, then only what widened past it.
    expect(seen).toEqual(['pnpm lint', 'pnpm report', 'pnpm collect-logs']);
    expect(result.outcomes.map((one) => one.status)).toEqual(['failed', 'skipped', 'passed', 'passed']);
    expect(result.outcomes[1].why).toContain('an earlier step failed');
    // The verdict is the first failure, not the last thing that ran.
    expect(result.step.first).toBe('a / one');
  });

  it('skips a `failure()` step in a green run, rather than running it for symmetry', async () => {
    // Its condition is a fact about the run, and in a green run the fact is false.
    // Running it anyway would be doing work CI would not do -- and reporting a
    // step as done that CI never ran.
    const seen = [];
    const result = await runSteps(
      localCommands([
        { key: 'a / one', run: 'pnpm lint' },
        { key: 'b / two', run: 'pnpm collect-logs', condition: 'failure' },
      ]),
      (step) => seen.push(step.run),
    );
    expect(result.ok).toBe(true);
    expect(seen).toEqual(['pnpm lint']);
    expect(result.outcomes.map((one) => one.status)).toEqual(['passed', 'skipped']);
    expect(result.outcomes[1].why).toContain('failure()');
  });

  it('says so when a skip happened, so a green run does not hide a step it never ran', async () => {
    // Everything passed and one step did not run. "OK" alone would be true and
    // incomplete: the plan covers 36 steps and this run covered 35 of them.
    const writes = [];
    const spy = (chunk: string) => {
      writes.push(chunk);
      return true;
    };
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = spy as typeof process.stdout.write;
    try {
      await runSteps(
        localCommands([
          { key: 'a / one', run: 'pnpm lint' },
          { key: 'b / two', run: 'pnpm collect-logs', condition: 'failure' },
        ]),
        () => undefined,
      );
    } finally {
      process.stdout.write = original;
    }
    expect(writes.join('')).toContain('skipped');
  });

  /**
   * Commands of one job, each of which the runner will charge `spend` milliseconds.
   *
   * The clock is the test's, not the wall's: pool arithmetic is the thing under
   * test, and a test that measured real seconds to check a fifteen-minute budget
   * would be a test nobody runs.
   */
  function shared(job: string, minutes: number, runs: string[]): Record<string, unknown>[] {
    return runs.map((run) => ({ key: `${job} / ${run}`, run, job, timeoutMinutes: minutes, jobBudgetMinutes: minutes }));
  }

  it('narrows each step to what is left of its job, because the budget is shared', async () => {
    // GitHub's `timeout-minutes` on a job is a budget for the whole job. This
    // runner gave every step the full amount, so a local run could pass a plan CI
    // would have killed half-way through -- the last known way "verify:local ran
    // this" was more generous than the truth.
    let t = 0;
    const seen = [];
    const result = await runSteps(
      localCommands(shared('verify', 1, ['one', 'two', 'three'])),
      (step) => {
        seen.push(step.timeoutMs);
        t += 20_000;
      },
      () => t,
    );
    expect(seen).toEqual([60_000, 40_000, 20_000]);
    expect(result.ok).toBe(true);
  });

  it('does not start a step whose job has spent its budget, and fails the run', async () => {
    // A step that starts with nothing left is a step CI would have killed at its
    // first instruction. Reporting it as skipped would say the run was fine.
    let t = 0;
    const seen = [];
    const result = await runSteps(
      localCommands(shared('verify', 1, ['one', 'two', 'three', 'four'])),
      (step) => {
        seen.push(step.run);
        t += 30_000;
      },
      () => t,
    );
    expect(seen).toEqual(['one', 'two']);
    // The first step that meets a spent budget is the job's ending, and it says so.
    // The one after it is skipped, because the run has already failed -- CI would
    // not have started it either, the job being dead.
    expect(result.outcomes.map((one) => one.status)).toEqual(['passed', 'passed', 'exhausted', 'skipped']);
    expect(result.ok).toBe(false);
    expect(result.exhausted).toBe(true);
    // The verdict is the first thing that ended the job, not the last.
    expect(result.step.run).toBe('three');
  });

  it('charges a merged command to every job that needs it, because each would have paid it', async () => {
    // One local run stands in for one command in each job, and CI would have run it
    // twice -- once per job, each paying the full duration. Charging once would
    // overstate both budgets, which is the one direction a reproducing tool may not
    // take.
    let t = 0;
    const commands = localCommands([
      { key: 'v / one', run: 'shared', job: 'verify', timeoutMinutes: 1, jobBudgetMinutes: 1 },
      { key: 'b / one', run: 'shared', job: 'batteries', timeoutMinutes: 1, jobBudgetMinutes: 1 },
      { key: 'v / two', run: 'only-verify', job: 'verify', timeoutMinutes: 1, jobBudgetMinutes: 1 },
    ]);
    const seen = [];
    const result = await runSteps(
      commands,
      (step) => {
        seen.push([step.run, step.timeoutMs]);
        t += 40_000;
      },
      () => t,
    );
    expect(commands).toHaveLength(2);
    expect(seen).toEqual([
      ['shared', 60_000],
      ['only-verify', 20_000],
    ]);
    expect(result.ok).toBe(true);
  });

  it('names the step when its own bound is the tighter one', async () => {
    let t = 0;
    const seen = [];
    await runSteps(
      localCommands([{ key: 'v / one', run: 'one', job: 'verify', timeoutMinutes: 1, jobBudgetMinutes: 15 }]),
      (step) => {
        seen.push([step.timeoutMs, step.boundScope, step.timeoutFrom]);
      },
      () => t,
    );
    expect(seen).toEqual([[60_000, 'step', 'v / one']]);
  });

  it('names the job, what it had, and what it had spent when the pool is the tighter one', async () => {
    // The three numbers a reader needs to judge the ending: whose budget, how big,
    // and how much of it was already gone. Without the third, "2m left" looks like
    // a bound somebody chose.
    let t = 0;
    const seen = [];
    await runSteps(
      localCommands(shared('verify', 15, ['one', 'two'])),
      (step) => {
        seen.push({
          bound: step.timeoutMs,
          scope: step.boundScope,
          job: step.boundJob,
          budget: step.boundBudgetMs,
          spent: step.boundSpentMs,
        });
        t += 780_000;
      },
      () => t,
    );
    expect(seen[0]).toEqual({ bound: 900_000, scope: 'step', job: null, budget: null, spent: null });
    expect(seen[1]).toEqual({ bound: 120_000, scope: 'pool', job: 'verify', budget: 900_000, spent: 780_000 });
  });

  it('reports what each job spent, because staying inside a budget is not the same as being close to it', async () => {
    let t = 0;
    const result = await runSteps(
      localCommands(shared('verify', 15, ['one', 'two'])),
      () => {
        t += 300_000;
      },
      () => t,
    );
    expect(result.budgets).toEqual([{ job: 'verify', totalMs: 900_000, spentMs: 600_000 }]);
  });

  it('spends no budget on a command the workflow skipped', async () => {
    let t = 0;
    const commands = localCommands([
      { key: 'v / one', run: 'one', job: 'verify', timeoutMinutes: 1, jobBudgetMinutes: 1 },
      { key: 'v / two', run: 'two', job: 'verify', timeoutMinutes: 1, jobBudgetMinutes: 1, condition: 'failure' },
    ]);
    const result = await runSteps(
      commands,
      (step) => {
        if (step.run === 'one') t += 30_000;
      },
      () => t,
    );
    expect(result.outcomes.map((one) => one.status)).toEqual(['passed', 'skipped']);
  });

  it('keeps running the other jobs when one of them fails, because the jobs are independent', async () => {
    // `needs:` is the only thing that orders jobs. A red `verify` does not stop
    // `batteries`, so a runner that stopped would leave work undone that CI would
    // have done -- and would report it as skipped, which reads like a decision.
    const seen = [];
    const result = await runSteps(
      localCommands([
        { key: 'v / one', run: 'one', job: 'verify' },
        { key: 'v / two', run: 'two', job: 'verify' },
        { key: 'b / one', run: 'three', job: 'batteries' },
        { key: 'b / two', run: 'four', job: 'batteries' },
      ]),
      (step) => {
        seen.push(step.run);
        if (step.run === 'two') throw new Error('the step exited 1');
      },
    );
    expect(seen).toEqual(['one', 'two', 'three', 'four']);
    expect(result.ok).toBe(false);
    expect(result.outcomes.map((one) => one.status)).toEqual(['passed', 'failed', 'passed', 'passed']);
    expect(result.failedJobs).toEqual(['verify']);
  });

  it('skips the rest of the job that failed, and names the job', async () => {
    const result = await runSteps(
      localCommands([
        { key: 'v / one', run: 'one', job: 'verify' },
        { key: 'v / two', run: 'two', job: 'verify' },
        { key: 'v / three', run: 'three', job: 'verify' },
      ]),
      (step) => {
        if (step.run === 'two') throw new Error('the step exited 1');
      },
    );
    expect(result.outcomes.map((one) => one.status)).toEqual(['passed', 'failed', 'skipped']);
    expect(result.outcomes[2].why).toContain('job "verify" has failed');
  });

  it('fails a step that spent its own bound, and lets the job continue to its `always()` steps', async () => {
    // GitHub kills the process and fails the step; the job carries on, and the
    // steps that ask to run regardless do. Only a spent **job** budget ends a job,
    // and conflating the two made every step timeout look like a cancelled run.
    let t = 0;
    const seen = [];
    const result = await runSteps(
      localCommands([
        { key: 'v / one', run: 'one', job: 'verify', timeoutMinutes: 1, jobBudgetMinutes: 15 },
        { key: 'v / two', run: 'two', job: 'verify', timeoutMinutes: 1, jobBudgetMinutes: 15, condition: 'always' },
      ]),
      (step) => {
        seen.push(step.run);
        if (step.run === 'one') {
          t += 60_000;
          throw Object.assign(new Error('the step ran past its bound'), { timedOut: true });
        }
      },
      () => t,
    );
    expect(seen).toEqual(['one', 'two']);
    expect(result.timedOut).toBe(true);
    expect(result.outcomes.map((one) => one.status)).toEqual(['timed-out', 'passed']);
    expect(result.cancelledJobs).toEqual([]);
  });

  it('cancels the job whose budget was spent, and only that job', async () => {
    // The other ending behind the same word: a job budget is cancelled in CI, so
    // nothing more runs in it -- not even `always()` -- while the other jobs carry
    // on with their own clocks.
    let t = 0;
    const seen = [];
    const result = await runSteps(
      localCommands([
        { key: 'v / one', run: 'one', job: 'verify', timeoutMinutes: 15, jobBudgetMinutes: 1 },
        { key: 'v / two', run: 'two', job: 'verify', timeoutMinutes: 15, jobBudgetMinutes: 1, condition: 'always' },
        { key: 'b / one', run: 'three', job: 'batteries', timeoutMinutes: 30, jobBudgetMinutes: 30 },
      ]),
      (step) => {
        seen.push(step.run);
        if (step.run === 'one') {
          t += 60_000;
          throw Object.assign(new Error('the budget ran out'), { timedOut: true });
        }
      },
      () => t,
    );
    expect(seen).toEqual(['one', 'three']);
    expect(result.outcomes.map((one) => one.status)).toEqual(['timed-out', 'skipped', 'passed']);
    expect(result.outcomes[1].why).toContain('job "verify" was cancelled');
    expect(result.cancelledJobs).toEqual(['verify']);
  });

  it('lets `continue-on-error` differ between the jobs a merged command stands in for', async () => {
    // The key is per step, and a merged command has one per member. A failure that
    // is a note in `batteries` is still a failure in `verify`, and the two jobs then
    // diverge -- which is what CI would have done with the same command twice.
    const result = await runSteps(
      localCommands([
        { key: 'v / one', run: 'shared', job: 'verify' },
        { key: 'b / one', run: 'shared', job: 'batteries', continueOnError: true },
        { key: 'b / two', run: 'after', job: 'batteries' },
      ]),
      (step) => {
        if (step.run === 'shared') throw new Error('the step exited 1');
      },
    );
    expect(result.ok).toBe(false);
    expect(result.failedJobs).toEqual(['verify']);
    expect(result.outcomes.map((one) => one.status)).toEqual(['failed', 'passed']);
    // The failure is fatal, so the block says which job it was fatal in.
    expect(result.outcomes[0].step).toBeDefined();
  });

  it('reports a step that ran past its bound as timed out, which is a different verdict', async () => {
    // The repair differs -- a step that exited 1 has something wrong with it, and a
    // step that ran for fifteen minutes has something wrong with it *or* with the
    // bound -- so the difference is carried in the result rather than flattened.
    const result = await runSteps(localCommands(local), (step) => {
      if (step.run === 'pnpm lint') throw Object.assign(new Error('the step ran past its bound'), { timedOut: true });
    });
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it('reports an ordinary failure as not timed out', async () => {
    const result = await runSteps(localCommands(local), () => {
      throw new Error('exit 1');
    });
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(false);
  });

  it('hands the runner the whole step, because the interpreter and the directory are part of it', async () => {
    // A runner that received only the command text could not honour either key,
    // and a test that only ever passed one would not notice.
    const seen = [];
    await runSteps(localCommands([{ key: 'a / one', run: 'pnpm gate', cwd: 'examples', shell: 'sh -e {0}' }]), (step) =>
      seen.push(step),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ run: 'pnpm gate', cwd: 'examples', shell: 'sh -e {0}' });
  });

  it('says where a command runs, when that is not the root under the default shell', async () => {
    const writes = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      await runSteps(
        localCommands([
          { key: 'a / one', run: 'pnpm gate', cwd: 'examples', shell: 'sh -e {0}' },
          { key: 'b / two', run: 'pnpm lint', cwd: '.' },
        ]),
        () => undefined,
      );
    } finally {
      spy.mockRestore();
    }
    const text = writes.join('');
    expect(text).toContain('a / one (in examples, sh -e {0})');
    // The default is not printed: a line that restates the default on every step
    // is a line a reader stops reading.
    expect(text).toContain('[2/2] b / two\n');
  });

  it('does not collapse two identical commands in different directories', () => {
    // The dedup key was the command text. Once a step can carry a working
    // directory, two equal texts are two different runs: the second would never
    // happen, and its step would be reported as done by the first.
    const commands = localCommands([
      { key: 'a / one', run: 'pnpm lint', cwd: 'packages/core' },
      { key: 'b / two', run: 'pnpm lint', cwd: 'packages/cli' },
    ]);
    expect(commands).toHaveLength(2);
    expect(commands.map((one) => one.cwd)).toEqual(['packages/core', 'packages/cli']);
    expect(commands.map((one) => one.also)).toEqual([[], []]);
  });

  it('does not collapse two identical commands under different interpreters', () => {
    const commands = localCommands([
      { key: 'a / one', run: 'echo $0', shell: 'sh -e {0}' },
      { key: 'b / two', run: 'echo $0', shell: DEFAULT_SHELL },
    ]);
    expect(commands).toHaveLength(2);
    expect(commands.map((one) => one.shell)).toEqual(['sh -e {0}', DEFAULT_SHELL]);
  });

  it('does not collapse two identical commands under different environments', () => {
    // The third fact that travels with a command. `pnpm test` under `NODE_ENV=test`
    // and under `NODE_ENV=production` are the same bytes and different runs, and
    // merging them would report one step as done by the other.
    const commands = localCommands([
      { key: 'a / one', run: 'pnpm test', env: { NODE_ENV: 'test' } },
      { key: 'b / two', run: 'pnpm test', env: { NODE_ENV: 'production' } },
    ]);
    expect(commands).toHaveLength(2);
    expect(commands.map((one) => one.env)).toEqual([{ NODE_ENV: 'test' }, { NODE_ENV: 'production' }]);
  });

  it('compares the environment by content, not by the order the keys were written', () => {
    // Two steps that declare the same pair in two orders are the same run. An
    // identity built on `JSON.stringify` of the object would say otherwise, and the
    // second step would run twice for nothing -- the cheaper of the two failures,
    // but still a plan that does not describe itself.
    const commands = localCommands([
      { key: 'a / one', run: 'pnpm test', env: { A: '1', B: '2' } },
      { key: 'b / two', run: 'pnpm test', env: { B: '2', A: '1' } },
    ]);
    expect(commands).toHaveLength(1);
    expect(commands[0].also).toEqual(['b / two']);
  });

  it('takes a merged command as fatal unless every step that merges into it is a note', () => {
    // The merged run stands in for both steps. If either one's failure would stop
    // the job, the local run must stop too -- `and`, not `or`, and not "the first
    // one wins".
    const both = localCommands([
      { key: 'a / one', run: 'pnpm build', continueOnError: true },
      { key: 'b / two', run: 'pnpm build', continueOnError: true },
    ]);
    expect(both[0].continueOnError).toBe(true);

    const mixed = localCommands([
      { key: 'a / one', run: 'pnpm build', continueOnError: true },
      { key: 'b / two', run: 'pnpm build' },
    ]);
    expect(mixed[0].continueOnError).toBe(false);
  });

  it('gives a command one pool per job that needs it, because a job\'s budget is shared', () => {
    // `timeout-minutes` on a job is a budget for all of its steps together, and a
    // command merged out of two jobs draws from both. One pool per job, deduped by
    // the job name: two steps of the same job are one pool, not two.
    const commands = localCommands([
      { key: 'a / one', run: 'pnpm build', job: 'verify', timeoutMinutes: 15, jobBudgetMinutes: 15 },
      { key: 'b / two', run: 'pnpm build', job: 'batteries', timeoutMinutes: 30, jobBudgetMinutes: 30 },
    ]);
    expect(commands).toHaveLength(1);
    expect(commands[0].pools).toEqual([
      { job: 'verify', minutes: 15 },
      { job: 'batteries', minutes: 30 },
    ]);
  });

  it('states no pool for a job that declares no budget', () => {
    // CI applies six hours there. This runner states nothing rather than inventing
    // a number, and an absent pool means "not bounded by a job".
    const commands = localCommands([{ key: 'a / one', run: 'pnpm build', job: 'verify', jobBudgetMinutes: null }]);
    expect(commands[0].pools).toEqual([]);
  });

  it('lets a merged command run whenever any of its steps would have', () => {
    // The opposite direction from `continue-on-error`, and for the same reason:
    // the merged run stands in for all of them. A command one of them needs under
    // `always()` is needed after a failure, so the merge widens.
    const same = localCommands([
      { key: 'a / one', run: 'pnpm build', condition: 'always' },
      { key: 'b / two', run: 'pnpm build', condition: 'always' },
    ]);
    expect(same[0].condition).toBe('always');

    const mixed = localCommands([
      { key: 'a / one', run: 'pnpm build', condition: 'success' },
      { key: 'b / two', run: 'pnpm build', condition: 'failure' },
    ]);
    expect(mixed[0].condition).toBe('always');

    // A default and `success()` are the same condition, written twice.
    const equivalent = localCommands([
      { key: 'a / one', run: 'pnpm build' },
      { key: 'b / two', run: 'pnpm build', condition: 'success' },
    ]);
    expect(equivalent).toHaveLength(1);
    expect(equivalent[0].condition).toBe('success');
  });

  it('runs one command under the tighter of the budgets its steps were given', () => {
    // CI would run both and the one that fails first is the one that decides, so
    // the local run stands in for both at the tighter bound. The bound travels with
    // the step that supplied it, so a timeout names the right step.
    const later = localCommands([
      { key: 'a / one', run: 'pnpm build', timeoutMinutes: 30 },
      { key: 'b / two', run: 'pnpm build', timeoutMinutes: 15 },
    ]);
    expect(later).toHaveLength(1);
    expect(later[0].timeoutMs).toBe(15 * 60_000);
    expect(later[0].timeoutFrom).toBe('b / two');

    const earlier = localCommands([
      { key: 'a / one', run: 'pnpm build', timeoutMinutes: 15 },
      { key: 'b / two', run: 'pnpm build', timeoutMinutes: 30 },
    ]);
    expect(earlier[0].timeoutFrom).toBe('a / one');
  });

  it('gives a merged command the bound one of its steps had, when the other had none', () => {
    // A bounded step merged with an unbounded one is bounded: the step that has a
    // budget is the one that can time out in CI.
    const commands = localCommands([
      { key: 'a / one', run: 'pnpm build', timeoutMinutes: null },
      { key: 'b / two', run: 'pnpm build', timeoutMinutes: 10 },
    ]);
    expect(commands[0].timeoutMs).toBe(10 * 60_000);
    expect(commands[0].timeoutFrom).toBe('b / two');
  });

  it('still collapses the same command in the same place, which is what CI does twice', () => {
    // The dedup is not the bug; identifying a step by its text alone was.
    const commands = localCommands([
      { key: 'a / one', run: 'pnpm build', cwd: 'packages/core' },
      { key: 'b / two', run: 'pnpm build', cwd: 'packages/core' },
    ]);
    expect(commands).toHaveLength(1);
    expect(commands[0].also).toEqual(['b / two']);
  });
});

describe('the script the runner hands to the interpreter', () => {
  it('writes the command to a file and puts that file where `{0}` says', () => {
    // `{0}` is a path, not a `-c` argument: that is why the script is materialised
    // rather than passed as a string, and why `$0` inside a step is a file.
    const { file, argv } = materialiseStep({ run: 'echo one\necho two', shell: DEFAULT_SHELL }, SCRATCH);
    expect(readFileSync(file, 'utf8')).toBe('echo one\necho two\n');
    expect(argv).toEqual(['bash', '--noprofile', '--norc', '-eo', 'pipefail', file]);
    expect(statSync(file).mode & 0o777).toBe(0o700);
    rmSync(file);
  });

  it('gives every step its own file, so two steps cannot overwrite each other', () => {
    const first = materialiseStep({ run: 'true' }, SCRATCH);
    const second = materialiseStep({ run: 'true' }, SCRATCH);
    expect(first.file).not.toBe(second.file);
    expect(first.argv.at(-1)).toBe(first.file);
    rmSync(first.file);
    rmSync(second.file);
  });
});

describe('a duration as a person reads it', () => {
  it('speaks in minutes once there are minutes, and never rounds a number away', () => {
    // The budget line is arithmetic somebody will check: "60s of 15m" is a unit that
    // does not belong beside minutes, and "0m" is the one value a reader cannot tell
    // from "no budget at all".
    expect(duration(0)).toBe('0s');
    expect(duration(1_200)).toBe('1s');
    expect(duration(59_900)).toBe('1m');
    expect(duration(900_000)).toBe('15m');
  });
});

describe('what a failed run says', () => {
  /** The shape `runSteps` returns, built by hand so both branches can be read. */
  function failed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ok: false,
      timedOut: false,
      index: 2,
      commands: 31,
      step: {
        first: 'a / one',
        run: 'pnpm build\necho second line',
        cwd: '.',
        shell: DEFAULT_SHELL,
        timeoutMs: 15 * 60_000,
        timeoutFrom: 'b / two',
      },
      error: new Error('x'),
      ...overrides,
    };
  }

  it('names the step, where it ran and the first line of the command', () => {
    const text = failureReport(failed()).join('\n');
    expect(text).toContain('verify:local: FAILED at 3/31');
    expect(text).toContain('  step:    a / one');
    expect(text).toContain('  command: pnpm build');
    // One line: the rest of a script is in the workflow, and a failure block that
    // reprinted it would bury the line that matters.
    expect(text).not.toContain('echo second line');
    // No bound on an ordinary failure: the step exited, so its budget was not the
    // thing that ran out.
    expect(text).not.toContain('bound:');
  });

  it('says why the step stopped, because three failures look the same without it', () => {
    // The gate went red on a step that exited non-zero, and the block named the
    // step, the directory and the command but not which of the three endings it
    // was. Each sends a reader somewhere else: a non-zero exit is a step to fix, a
    // signal is a step that was killed, and a spawn error is a step that never ran.
    // The words are `runStep`'s, reproduced rather than re-derived.
    for (const message of ['the step exited 1', 'the step was killed by SIGTERM', 'spawn bash ENOENT']) {
      const text = failureReport(failed({ error: new Error(message) })).join('\n');
      expect(text).toContain(`  reason:  ${message}`);
    }
  });

  it('does not invent a reason on a bound, where the bound is the reason', () => {
    // A timeout already says what ended the run; a second line repeating the
    // error would read as though the step had also failed on its own account.
    const text = failureReport(failed({ timedOut: true })).join('\n');
    expect(text).not.toContain('  reason:');
  });

  it('names the bound and the step that set it when the budget ran out', () => {
    // The reason this is a pure function: reaching this branch from the CLI costs
    // fifteen minutes, so it is reached here instead.
    const text = failureReport(failed({ timedOut: true })).join('\n');
    expect(text).toContain('verify:local: TIMED OUT at 3/31');
    expect(text).toContain('  bound:   15m, set on b / two');
  });

  it('names the job and what it had already spent when a pool ran out', () => {
    // "3m left" looks like a bound somebody chose. The three numbers together say
    // it was arithmetic: the job's budget, what was gone, and what remained.
    const result = failed({
      timedOut: true,
      outcomes: [{ step: { first: 'a / one' }, status: 'timed-out', error: new Error('x') }],
    });
    const step = result.step as Record<string, unknown>;
    step.boundScope = 'pool';
    step.boundJob = 'verify';
    step.boundBudgetMs = 900_000;
    step.boundSpentMs = 780_000;
    step.timeoutMs = 120_000;
    const text = failureReport(result).join('\n');
    expect(text).toContain('bound:   the last 2m of job "verify"\'s 15m budget (13m already spent)');
    expect(text).not.toContain('set on');
  });

  it('says a step never started because its job had spent its budget', () => {
    // The other ending: nothing ran, so there is no duration to speak of and no
    // step that could have declared it.
    const result = failed({
      timedOut: true,
      exhausted: true,
      commands: 4,
      outcomes: [{ step: { first: 'a / one' }, status: 'exhausted', why: 'spent' }],
    });
    (result.step as Record<string, unknown>).boundJob = 'verify';
    (result.step as Record<string, unknown>).boundBudgetMs = 900_000;
    const text = failureReport(result).join('\n');
    expect(text).toContain('bound:   job "verify" spent its whole 15m budget before this step');
    expect(text).toContain('verify:local: TIMED OUT');
  });

  it('lists the notes that came before the stop, because a reader will fix one step', () => {
    // A run that tolerates two failures and then stops would otherwise report only
    // the stop, and the two broken steps it already knows about would be learned
    // the hard way -- by running again.
    const result = failed();
    result.outcomes = [
      { step: { first: 'c / three' }, status: 'noted', error: new Error('the step exited 4') },
      { step: { first: 'd / four' }, status: 'noted', error: new Error('the step exited 5') },
    ];
    const text = failureReport(result).join('\n');
    expect(text).toContain('  tolerated: c / three — the step exited 4');
    expect(text).toContain('  tolerated: d / four — the step exited 5');
  });

  it('names the steps that ran anyway, because their conditions widen past the failure', () => {
    // Without this, a reader sees a FAILED at step 3 and a screenful of output from
    // steps 4 and 5 with nothing in the verdict connecting them.
    const result = failed({ outcomes: [] });
    result.outcomes = [
      { step: { first: 'a / one' }, status: 'passed' },
      { step: { first: 'b / two' }, status: 'skipped', why: 'an earlier step failed' },
      { step: { first: 'a / one' }, status: 'failed', error: new Error('x') },
      { step: { first: 'c / three' }, status: 'passed' },
      { step: { first: 'd / four' }, status: 'noted', error: new Error('the step exited 5') },
    ];
    const text = failureReport(result).join('\n');
    expect(text).toContain('  still ran: c / three, d / four (their conditions widen past a failure)');
    expect(text).toContain('  tolerated: d / four — the step exited 5');
  });

  it('names the other jobs that failed too, because one verdict line is not the whole run', () => {
    // Four jobs can be red and only one of them can be the line this block starts
    // with. A reader who fixes one and re-runs has spent a full gate on half the
    // news.
    const result = failed({
      jobs: [
        { job: 'verify', failed: true, cancelled: null },
        { job: 'batteries', failed: true, cancelled: null },
        { job: 'artefacts', failed: false, cancelled: null },
      ],
    });
    (result.step as Record<string, unknown>).job = 'verify';
    const text = failureReport(result).join('\n');
    expect(text).toContain('  also failed: batteries');
    expect(text).not.toContain('artefacts');
  });

  it('says where the command ran when that is not the root', () => {
    const result = failed();
    (result.step as Record<string, unknown>).cwd = 'examples';
    expect(failureReport(result).join('\n')).toContain('  where:   in examples');
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
    // And the interpretation every command gets: a runner whose default is not
    // stated is a runner whose default is not reviewable.
    expect(result.stdout).toContain(DEFAULT_SHELL);
    expect(result.stdout).toContain('0 of 36 override the shell, the directory or the environment');
    // And the budget, which every job of the shipped workflow declares and which
    // this runner now enforces: the range is the jobs' own numbers.
    // The budget, stated as what it is: a pool per job. A line that said "15m" on
    // every step of `verify` would be read as fifteen minutes each, which is the
    // number CI does not enforce.
    expect(result.stdout).toContain('`timeout-minutes:` is a budget for the whole job, not for each step');
    expect(result.stdout).toContain('verify 15m across 7 step(s)');
    expect(result.stdout).toContain('batteries 30m across 16 step(s)');
    // And the condition, which is the last default this runner had to state: a step
    // runs only after the ones before it have passed, which is GitHub's default and
    // is what makes a failure meaningful.
    expect(result.stdout).toContain('a step runs only after the ones before it have passed');
    expect(result.stdout).toContain('none of the 36 declares a condition');
    expect(result.stdout).toContain('verify / Type-check — 15m');
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
  let fixtures = 0;
  function workflowWith(key: string, command: string, extra: [string, string][] = []): string {
    const text = readFileSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const lines = text.split('\n');
    const at = lines.findIndex((line) => line === `      - name: ${key.split(' / ')[1] ?? ''}`);
    expect(at, `no step named ${key}`).toBeGreaterThan(-1);
    const runAt = lines.findIndex((line, index) => index > at && /^ {8}run: /.test(line));
    expect(runAt, `no run under ${key}`).toBeGreaterThan(at);
    expect(lines[runAt], 'a block scalar has no line to insert an extra key after').toMatch(/^ {8}run: [^|>]/);
    lines[runAt] = `        run: ${command}`;
    lines.splice(
      runAt + 1,
      0,
      ...extra.flatMap(([name, value]) =>
        // A leading newline means a block: `env:` needs `NAME: value` lines under
        // it, and a fixture that could only write inline keys could not spell the
        // shape this pass reads.
        value.startsWith('\n') ? [`        ${name}:`, ...value.slice(1).split('\n')] : [`        ${name}: ${value}`],
      ),
    );
    fixtures += 1;
    const path = join(scratch, `ci-${String(fixtures)}.yml`);
    writeFileSync(path, lines.join('\n'));
    return path;
  }

  it('passes a step the workflow calls a note, and says so without claiming a clean run', () => {
    // `--only` selects one step, so the continuation half is `runSteps`' own test;
    // what this proves is the verdict a person reads: exit zero, and a line naming
    // the failure rather than a green run that quietly contained one.
    const path = workflowWith('verify / Type-check', 'exit 3', [['continue-on-error', 'true']]);
    const result = spawnSync(process.execPath, [SCRIPT, '--only', 'verify / Type-check'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: nestedEnv(path),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('with 1 tolerated failure(s)');
    expect(result.stdout).toContain('tolerated: verify / Type-check');
    expect(result.stdout).toContain('the workflow says that is a note');
  });

  it('does not run a step whose condition is `failure()` in a green run, and counts it', () => {
    // The condition is false, so the step does not run -- and the verdict says so
    // instead of reporting thirty-six steps and meaning thirty-five.
    const marker = join(scratch, 'condition-marker.txt');
    const path = workflowWith('verify / Type-check', `printf '%s' ran > ${marker}`, [['if', 'failure()']]);
    const result = spawnSync(process.execPath, [SCRIPT, '--only', 'verify / Type-check'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: nestedEnv(path),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(marker), 'a step whose condition was false ran anyway').toBe(false);
    expect(result.stdout).toContain('1 skipped because the condition was not met');
    expect(result.stdout).toContain('skipped: verify / Type-check');
  });

  it('runs a step whose condition is `always()`, and lists the condition in the plan', () => {
    const marker = join(scratch, 'always-marker.txt');
    const path = workflowWith('verify / Type-check', `printf '%s' ran > ${marker}`, [['if', 'always()']]);

    const listed = spawnSync(process.execPath, [SCRIPT, '--list'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: nestedEnv(path),
    });
    expect(listed.status, listed.stderr).toBe(0);
    // One step declares a condition, and the line says which -- a default that is
    // only stated in a header would leave a reader unable to find the exception.
    expect(listed.stdout).toContain('1 of 36 declare a condition that changes it');
    expect(listed.stdout).toContain('verify / Type-check — 15m, if (always())');

    const result = spawnSync(process.execPath, [SCRIPT, '--only', 'verify / Type-check'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: nestedEnv(path),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(marker, 'utf8')).toBe('ran');
  });

  it('turns a rejection that reached the top into one line and a non-zero exit', () => {
    // `main` is async now, because a runner that enforces a bound has to be. The
    // one exit that fact adds is the rejection path: an unreadable workflow makes
    // `shippedPlan` throw before any step runs, and an unhandled rejection would
    // print a stack with no verdict in it.
    const result = spawnSync(process.execPath, [SCRIPT, '--list'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: nestedEnv('no-such-workflow.yml'),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('verify:local:');
    expect(result.stderr).toContain('ENOENT');
    expect(result.stderr).not.toContain('UnhandledPromiseRejection');
  });

  it('refuses a workflow the plan does not describe, naming the step', () => {
    const text = readFileSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
      .replace('      - name: Type-check', '      - name: Type-check (renamed)');
    const path = join(scratch, 'ci-renamed.yml');
    writeFileSync(path, text);

    const result = spawnSync(process.execPath, [SCRIPT, '--list'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: nestedEnv(path),
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
      env: nestedEnv(path),
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
      env: nestedEnv(path),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('verify:local: OK (1 command(s), 1 of the 36 local steps)');
    expect(result.stdout).toContain('did not run:');
    // And what the run spent, so the budget is a measurement rather than a limit
    // nobody looks at until it fires.
    expect(result.stdout).toContain('budget:  verify');
    expect(result.stdout).toContain('of 15m');
  });

  it('runs a step in the directory the workflow names, which is the whole claim about that key', () => {
    // End to end, because the claim is about a process's working directory and
    // no amount of argument inspection proves one. `pwd` is asked, from a step
    // whose directory the workflow states.
    const marker = join(scratch, 'cwd-marker.txt');
    const path = workflowWith('verify / Type-check', `pwd > ${marker}`, [
      ['working-directory', 'packages/core'],
    ]);
    const result = spawnSync(process.execPath, [SCRIPT, '--only', 'verify / Type-check'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: nestedEnv(path),
    });
    expect(result.status, result.stderr).toBe(0);
    // `match` rather than equality: the prefix depends on where this tree is
    // checked out, and on macOS it may be reached through a symlink.
    expect(readFileSync(marker, 'utf8').trim()).toMatch(/packages\/core$/);
  });

  it("runs a step under the shell the workflow names, as a file rather than a `-c` string", () => {
    // Two facts in one command: `$BASH_VERSION` is empty under dash, so a
    // non-empty value is proof the interpreter is bash; `$0` is the script path,
    // so it ending in `.sh` is proof the body was materialised rather than
    // passed with `-c`.
    const marker = join(scratch, 'shell-marker.txt');
    const command = `printf '%s|%s' "\${BASH_VERSION:+bash}" "$0" > ${marker}`;
    const path = workflowWith('verify / Type-check', command, [['shell', 'bash -x {0}']]);
    const result = spawnSync(process.execPath, [SCRIPT, '--only', 'verify / Type-check'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: nestedEnv(path),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('(bash -x {0})');
    const [interpreter, script] = readFileSync(marker, 'utf8').split('|');
    expect(interpreter).toBe('bash');
    expect(script).toMatch(/\.sh$/);
  });

  it('hands the declared environment to the process, which is the only way to know it arrived', () => {
    // The claim is about the child's environment, so the child is asked. The
    // variable is deliberately one the runner does not set: if the implementation
    // passed nothing, the marker would hold the empty string and this would fail
    // with the shell's own expansion rather than with an assertion about a map.
    const marker = join(scratch, 'env-marker.txt');
    const command = `printf '%s' "$RCA_PROBE_GREETING" > ${marker}`;
    const path = workflowWith('verify / Type-check', command, [
      ['env', '\n          RCA_PROBE_GREETING: hello from the workflow'],
    ]);
    const result = spawnSync(process.execPath, [SCRIPT, '--only', 'verify / Type-check'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: nestedEnv(path),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('(env (1))');
    expect(readFileSync(marker, 'utf8')).toBe('hello from the workflow');
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
