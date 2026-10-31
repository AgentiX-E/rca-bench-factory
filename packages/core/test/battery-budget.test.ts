import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FLOOR_MINUTES, MULTIPLE, budgetErrors, budgetSummary, stepsOf } from '../../../scripts/battery-budget.mjs';
import { readWorkflow } from '../../../scripts/gate-steps.mjs';

/**
 * A budget per battery, sized by a measurement rather than by a guess.
 *
 * The batteries job spent twenty of its thirty minutes with no bound inside it, so a
 * mutation that hung was reported as "the job timed out" -- a verdict naming fourteen
 * steps. `timeout-minutes` on a step names the battery, and the number it carries has
 * to come from a run: `golden-master/ci-baseline.json` is that run, recorded by
 * `measure-ci-baseline.mjs`, and the rules below are what make the two agree.
 *
 * The rules are not "the bound is 12". They are relations: at least twice what was
 * measured, at least the floor, and small enough to expire before the job does. Every
 * case here is a fixture, because a number that only ever appears in `ci.yml` is a
 * number nobody has seen fail.
 */

/** The gate this file drives, declared as well as spawned. */
export const DRIVES = ['scripts/check-battery-budget.mjs', 'scripts/measure-ci-baseline.mjs'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GATE = join(ROOT, 'scripts', 'check-battery-budget.mjs');
const MEASURE = join(ROOT, 'scripts', 'measure-ci-baseline.mjs');

/** A workflow with one job whose steps are given verbatim, parsed by the real reader. */
function workflowOf(steps: string[], job = 'batteries', jobMinutes = 30) {
  const text = [
    'name: CI',
    '',
    'on:',
    '  push:',
    '',
    'jobs:',
    `  ${job}:`,
    '    runs-on: ubuntu-latest',
    `    timeout-minutes: ${String(jobMinutes)}`,
    '    steps:',
    ...steps,
  ].join('\n');
  const read = readWorkflow(text);
  expect(read.errors).toEqual([]);
  return read;
}

/** A step whose budget is its own. */
function step(name: string, minutes: number, command = 'node scripts/inject-x.mjs'): string[] {
  return [`      - name: ${name}`, `        timeout-minutes: ${String(minutes)}`, `        run: ${command}`];
}

/** A step that inherits the job's budget, which is the shape this module refuses. */
function inherited(name: string, command = 'node scripts/inject-x.mjs'): string[] {
  return [`      - name: ${name}`, `        run: ${command}`];
}

function baselineOf(steps: Record<string, number>, over: Record<string, unknown> = {}) {
  return {
    run: 41180476384,
    commit: 'a'.repeat(40),
    measured: '2026-10-31',
    job: 'batteries',
    jobTimeoutMinutes: 30,
    steps,
    ...over,
  };
}

describe('the budget a battery carries', () => {
  it('accepts a job whose every step declares its own bound at twice the measurement', () => {
    const workflow = workflowOf([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const errors = budgetErrors(workflow, baselineOf({ 'Slow battery': 351, 'Quick battery': 4 }));
    expect(errors).toEqual([]);
  });

  it('reads a step that inherits the job budget as declaring none of its own', () => {
    const workflow = workflowOf([...inherited('Slow battery')]);
    const [only] = stepsOf(workflow, 'batteries');
    expect(only.inheritedFrom).toBe(null);
    // The number is still there -- it is the job's -- which is exactly why a rule
    // written against `minutes === null` would have said nothing.
    expect(only.minutes).toBe(30);
  });

  it('refuses a step that inherits, because a hang there spends every other budget', () => {
    const workflow = workflowOf([...inherited('Slow battery')]);
    const errors = budgetErrors(workflow, baselineOf({ 'Slow battery': 351 })).join('\n');
    expect(errors).toContain('declares no `timeout-minutes` of its own');
    expect(errors).toContain('every other battery');
  });

  it('refuses a bound under the multiple, and names both numbers', () => {
    // 351 s measured, 6 min bounded: 360 s of bound against 702 s of expectation.
    const workflow = workflowOf([...step('Slow battery', 6)]);
    const errors = budgetErrors(workflow, baselineOf({ 'Slow battery': 351 })).join('\n');
    expect(errors).toContain('bounded at 6 min and measured 351 s');
    expect(errors).toContain(`under ${String(MULTIPLE)} times the measurement`);
    expect(errors).toContain('refused for being slow rather than for hanging');
  });

  it('refuses a bound under the floor, because a measurement cannot see a cold cache', () => {
    // Two minutes is twice the 46 s measured, and still refused: `apt-get update` on a
    // cold image is not in any measurement taken after the first one.
    const workflow = workflowOf([...step('Quick battery', 2)]);
    const errors = budgetErrors(workflow, baselineOf({ 'Quick battery': 46 })).join('\n');
    expect(errors).toContain(`the floor is ${String(FLOOR_MINUTES)}`);
    expect(errors).toContain('cold package index');
  });

  it('refuses a bound that cannot expire before the job does', () => {
    // The bound is fine on its own -- 20 min for 383 s measured -- and useless where it
    // sits: 800 s of measured step comes before it, so the job's 30 min expires first
    // and the verdict names nothing, which is the defect the bound is for.
    const workflow = workflowOf([...step('Earlier battery', 27), ...step('Slow battery', 20)]);
    const errors = budgetErrors(
      workflow,
      baselineOf({ 'Earlier battery': 800, 'Slow battery': 383 }),
    ).join('\n');
    expect(errors).toContain("past the job's 30");
    expect(errors).toContain('The job would die first and name');
  });

  it('counts the steps before it when it asks whether a bound can fire', () => {
    // Same bound, same measurement, three 400 s steps ahead of it: the arithmetic that
    // makes the bound useless is a property of the position, not of the number -- and
    // three steps rather than one because a single 400 s step bounded at 2x would itself
    // need 14 min, which is the same rule refusing a different case first.
    const workflow = workflowOf([
      ...step('First battery', 15),
      ...step('Second battery', 15),
      ...step('Third battery', 15),
      ...step('Slow battery', 13),
    ]);
    const errors = budgetErrors(
      workflow,
      baselineOf({
        'First battery': 400,
        'Second battery': 400,
        'Third battery': 400,
        'Slow battery': 383,
      }),
    ).join('\n');
    expect(errors).toContain('the steps before it measured 20 min');
    expect(errors).toContain('expires at 33 min');
  });

  it('refuses a step with no recording, and says how to take one', () => {
    const workflow = workflowOf([...step('New battery', 3)]);
    const errors = budgetErrors(workflow, baselineOf({})).join('\n');
    expect(errors).toContain('has no baseline');
    expect(errors).toContain('measure-ci-baseline.mjs');
  });

  it('refuses a recording that outlives the step it describes', () => {
    const workflow = workflowOf([...step('One battery', 3)]);
    const errors = budgetErrors(workflow, baselineOf({ 'One battery': 10, 'Gone battery': 20 })).join('\n');
    expect(errors).toContain('holds `Gone battery`, which is not a step');
  });

  it('refuses a recording with no run, because its seconds are then typed numbers', () => {
    const workflow = workflowOf([...step('One battery', 3)]);
    const errors = budgetErrors(workflow, baselineOf({ 'One battery': 10 }, { run: 0 })).join('\n');
    expect(errors).toContain('names no workflow run');
  });

  it('refuses a recording with no commit or no date', () => {
    const workflow = workflowOf([...step('One battery', 3)]);
    const noCommit = budgetErrors(workflow, baselineOf({ 'One battery': 10 }, { commit: 'abc' })).join('\n');
    expect(noCommit).toContain('names no commit');
    const noDate = budgetErrors(workflow, baselineOf({ 'One battery': 10 }, { measured: 'yesterday' })).join('\n');
    expect(noDate).toContain('no measurement date');
  });

  it('refuses a recording taken against a different job budget', () => {
    // The bounds are arithmetic against the job's budget, so a job that changed its
    // budget has to be measured again rather than re-bounded.
    const workflow = workflowOf([...step('One battery', 3)], 'batteries', 45);
    const errors = budgetErrors(workflow, baselineOf({ 'One battery': 10 })).join('\n');
    expect(errors).toContain('had 30 minutes and ci.yml now declares 45');
    expect(errors).toContain('re-measured together');
  });

  it('refuses a recording that names no job', () => {
    const workflow = workflowOf([...step('One battery', 3)]);
    const errors = budgetErrors(workflow, baselineOf({ 'One battery': 10 }, { job: '' }));
    expect(errors.join('\n')).toContain('names no job');
  });

  it('refuses a recording for a job the workflow does not have', () => {
    const workflow = workflowOf([...step('One battery', 3)]);
    const errors = budgetErrors(workflow, baselineOf({ 'One battery': 10 }, { job: 'nowhere' })).join('\n');
    expect(errors).toContain('ci.yml has no job "nowhere"');
  });

  it('prints what the bounds cost against what the job measured', () => {
    const workflow = workflowOf([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const summary = budgetSummary(workflow, baselineOf({ 'Slow battery': 351, 'Quick battery': 4 }));
    expect(summary).toContain('2 step(s) of `batteries` bounded');
    expect(summary).toContain('6 min measured against 30 declared');
    expect(summary).toContain('as of run 41180476384');
    expect(summary).toContain('bounds total 15 min');
    // The tightest ratio names the battery, because a ratio without a subject invites
    // the reader to supply one (finding 294).
    expect(summary).toContain('tightest Slow battery at 2.1x');
  });

  it('is green on the shipped tree, and the recording it checks is in the tree', () => {
    // The two halves that make this a gate rather than a document: the workflow and the
    // recording it is measured against are both committed, and they agree.
    const result = spawnSync(process.execPath, [GATE], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('check-battery-budget: OK');
  });


  it('exits non-zero on a workflow it cannot read, rather than checking nothing', () => {
    // The three failure paths are the gate. None of them is reachable against the
    // shipped tree -- all three are false there -- so each is driven through the two
    // seams the runner already has for exactly this: `RCA_CI_WORKFLOW` (used by the
    // plan reader since it was written) and `RCA_CI_BASELINE`.
    const dir = mkdtempSync(join(tmpdir(), 'rca-budget-'));
    const broken = join(dir, 'broken.yml');
    writeFileSync(broken, 'name: CI\n\non:\n  push:\n');
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_WORKFLOW: broken },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ci.yml does not parse');
  });

  it('exits non-zero when the recording it is told to read is not there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rca-budget-'));
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_BASELINE: join(dir, 'absent.json') },
    });
    expect(result.status).toBe(1);
    // The sentence names the path it looked in, because "no recording" without a
    // location is a reader's guess at which file the gate meant.
    expect(result.stderr).toContain('no recording at');
    expect(result.stderr).toContain('absent.json');
  });

  it('exits non-zero when the recording disagrees, and prints each disagreement', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rca-budget-'));
    const recording = join(dir, 'stale.json');
    const stale = baselineOf({ 'Set up job': 2, 'Not a step': 9 });
    writeFileSync(recording, JSON.stringify(stale));
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_BASELINE: recording },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('check-battery-budget: FAILED');
    expect(result.stderr).toContain('holds `Not a step`, which is not a step');
    expect(result.stderr).toContain('has no baseline');
  });

  it('records nothing when it is given no token or no run, and says how to call it', () => {
    // The recording is the only thing that may write `ci-baseline.json`, and its one
    // refusal is reachable here because a missing token is not a network call. A probe
    // that wrote a baseline on a usage error would replace a measurement with zeroes.
    const bare = spawnSync(process.execPath, [MEASURE], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: '' },
    });
    expect(bare.status).toBe(2);
    expect(bare.stderr).toContain('usage: GITHUB_TOKEN=');
    expect(bare.stdout).toBe('');

    const noRun = spawnSync(process.execPath, [MEASURE, 'not-a-run'], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: 'x' },
    });
    expect(noRun.status).toBe(2);
    expect(noRun.stderr).toContain('usage: GITHUB_TOKEN=');
  });

  it('states the multiple and the floor in one place, which the shipped bounds satisfy', () => {
    const workflow = readWorkflow(readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'));
    const baseline = JSON.parse(readFileSync(join(ROOT, 'golden-master', 'ci-baseline.json'), 'utf8'));
    expect(budgetErrors(workflow, baseline)).toEqual([]);
    for (const step of stepsOf(workflow, 'batteries')) {
      expect(step.minutes).toBeGreaterThanOrEqual(FLOOR_MINUTES);
    }
  });
});
