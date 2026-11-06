import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FLOOR_MINUTES,
  MULTIPLE,
  WHY_LENGTH,
  budgetErrors,
  budgetSummary,
  jobsOf,
  ledgerErrors,
  readDeclarations,
  stepsOf,
} from '../../../scripts/ci-budget.mjs';
import { readWorkflow } from '../../../scripts/gate-steps.mjs';
import { readLedger } from '../../../scripts/ledger-runs.mjs';

/**
 * A budget per step, sized by a measurement rather than by a guess.
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
 *
 * v3.48 added the relation that was missing rather than a number: a job that bounds
 * none of its steps was never asked whether it should. The fixtures below therefore
 * come in two flavours -- the arithmetic of one job, and the question of which jobs
 * have bounds at all.
 */

/** The gate this file drives, declared as well as spawned. */
export const DRIVES = ['scripts/check-ci-budget.mjs', 'scripts/measure-ci-baseline.mjs'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GATE = join(ROOT, 'scripts', 'check-ci-budget.mjs');
const MEASURE = join(ROOT, 'scripts', 'measure-ci-baseline.mjs');
const DECLARATIONS = join(ROOT, 'golden-master', 'ci-declarations.json');

/** One job of a fixture workflow: an id, its label, its budget, and its steps. */
interface FixtureJob {
  id: string;
  minutes?: number;
  name?: string;
  steps: string[];
}

/** A workflow parsed from text the case wrote, by the real reader. */
function workflowText(jobs: FixtureJob[]): string {
  const lines = ['name: CI', '', 'on:', '  push:', '', 'jobs:'];
  for (const job of jobs) {
    lines.push(`  ${job.id}:`);
    lines.push(`    name: ${job.name ?? job.id}`);
    lines.push('    runs-on: ubuntu-latest');
    lines.push(`    timeout-minutes: ${String(job.minutes ?? 30)}`);
    lines.push('    steps:');
    lines.push(...job.steps);
  }
  return lines.join('\n');
}

function workflowOf(jobs: FixtureJob[]) {
  const read = readWorkflow(workflowText(jobs));
  expect(read.errors).toEqual([]);
  return read;
}

/** A single-job workflow, which is the shape most of the arithmetic cases need. */
function oneJob(steps: string[], minutes = 30) {
  return workflowOf([{ id: 'batteries', minutes, steps }]);
}

/** A step whose budget is its own. */
function step(name: string, minutes: number, command = 'node scripts/inject-x.mjs'): string[] {
  return [`      - name: ${name}`, `        timeout-minutes: ${String(minutes)}`, `        run: ${command}`];
}

/** A step that inherits the job's budget, which is the shape this module refuses. */
function inherited(name: string, command = 'node scripts/inject-x.mjs'): string[] {
  return [`      - name: ${name}`, `        run: ${command}`];
}

/**
 * A recording, keyed by job id, as `measure-ci-baseline.mjs` writes it.
 *
 * The seconds are given per job because that is the unit the rules work in: a bound is
 * arithmetic inside one job, and a job that was never measured cannot be argued about.
 */
function recordingOf(
  jobs: Record<string, { minutes?: number; steps: Record<string, number> }>,
  over: Record<string, unknown> = {},
) {
  const recorded: Record<string, unknown> = {};
  for (const [id, job] of Object.entries(jobs)) {
    recorded[id] = { name: id, timeoutMinutes: job.minutes ?? 30, steps: job.steps };
  }
  return {
    run: 41637098008,
    commit: 'a'.repeat(40),
    measured: '2026-11-03',
    jobs: recorded,
    ...over,
  };
}

describe('the arithmetic of one job', () => {
  it('accepts a job whose every step declares its own bound at twice the measurement', () => {
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { 'Slow battery': 351, 'Quick battery': 4 } } }),
    );
    expect(errors).toEqual([]);
  });

  it('reads a step that inherits the job budget as declaring none of its own', () => {
    const workflow = oneJob([...inherited('Slow battery')]);
    const [only] = stepsOf(workflow, 'batteries');
    expect(only.inheritedFrom).toBe(null);
    // The number is still there -- it is the job's -- which is exactly why a rule
    // written against `minutes === null` would have said nothing.
    expect(only.minutes).toBe(30);
  });

  it('refuses a bound under the multiple, and names both numbers', () => {
    // 351 s measured, 6 min bounded: 360 s of bound against 702 s of expectation.
    const workflow = oneJob([...step('Slow battery', 6)]);
    const errors = budgetErrors(workflow, recordingOf({ batteries: { steps: { 'Slow battery': 351 } } })).join('\n');
    expect(errors).toContain('bounded at 6 min and measured 351 s');
    expect(errors).toContain(`under ${String(MULTIPLE)} times the measurement`);
    expect(errors).toContain('refused for being slow rather than for hanging');
  });

  it('refuses a bound under the floor, because a measurement cannot see a cold cache', () => {
    // Two minutes is twice the 46 s measured, and still refused: `apt-get update` on a
    // cold image is not in any measurement taken after the first one.
    const workflow = oneJob([...step('Quick battery', 2)]);
    const errors = budgetErrors(workflow, recordingOf({ batteries: { steps: { 'Quick battery': 46 } } })).join('\n');
    expect(errors).toContain(`the floor is ${String(FLOOR_MINUTES)}`);
    expect(errors).toContain('cold package index');
  });

  it('refuses a bound that cannot expire before the job does', () => {
    // The bound is fine on its own -- 20 min for 383 s measured -- and useless where it
    // sits: 800 s of measured step comes before it, so the job's 30 min expires first
    // and the verdict names nothing, which is the defect the bound is for.
    const workflow = oneJob([...step('Earlier battery', 27), ...step('Slow battery', 20)]);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { 'Earlier battery': 800, 'Slow battery': 383 } } }),
    ).join('\n');
    expect(errors).toContain("past the job's 30");
    expect(errors).toContain('The job would die first and name');
  });

  it('counts the steps before it when it asks whether a bound can fire', () => {
    // Same bound, same measurement, three 400 s steps ahead of it: the arithmetic that
    // makes the bound useless is a property of the position, not of the number -- and
    // three steps rather than one because a single 400 s step bounded at 2x would itself
    // need 14 min, which is the same rule refusing a different case first.
    const workflow = oneJob([
      ...step('First battery', 15),
      ...step('Second battery', 15),
      ...step('Third battery', 15),
      ...step('Slow battery', 13),
    ]);
    const errors = budgetErrors(
      workflow,
      recordingOf({
        batteries: {
          steps: {
            'First battery': 400,
            'Second battery': 400,
            'Third battery': 400,
            'Slow battery': 383,
          },
        },
      }),
    ).join('\n');
    expect(errors).toContain('the steps before it in `batteries` measured 20 min');
    expect(errors).toContain('expires at 33 min');
  });

  it('refuses a step with no recording, and says how to take one', () => {
    const workflow = oneJob([...step('New battery', 3)]);
    const errors = budgetErrors(workflow, recordingOf({ batteries: { steps: {} } })).join('\n');
    expect(errors).toContain('has no baseline');
    expect(errors).toContain('measure-ci-baseline.mjs');
  });

  it('refuses a recording that outlives the step it describes', () => {
    const workflow = oneJob([...step('One battery', 3)]);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { 'One battery': 10, 'Gone battery': 20 } } }),
    ).join('\n');
    expect(errors).toContain('holds `Gone battery` for `batteries`, which is not a step of that job');
  });

  it('refuses a recording with no run, because its seconds are then typed numbers', () => {
    const workflow = oneJob([...step('One battery', 3)]);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { 'One battery': 10 } } }, { run: 0 }),
    ).join('\n');
    expect(errors).toContain('names no workflow run');
  });

  it('refuses a recording with no commit or no date', () => {
    const workflow = oneJob([...step('One battery', 3)]);
    const noCommit = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { 'One battery': 10 } } }, { commit: 'abc' }),
    ).join('\n');
    expect(noCommit).toContain('names no commit');
    const noDate = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { 'One battery': 10 } } }, { measured: 'yesterday' }),
    ).join('\n');
    expect(noDate).toContain('no measurement date');
  });

  it('refuses a recording taken against a different job budget', () => {
    // The bounds are arithmetic against the job's budget, so a job that changed its
    // budget has to be measured again rather than re-bounded.
    const workflow = oneJob([...step('One battery', 3)], 45);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { minutes: 30, steps: { 'One battery': 10 } } }),
    ).join('\n');
    expect(errors).toContain('had 30 minutes and ci.yml now declares 45');
    expect(errors).toContain('re-measured together');
  });
});

/**
 * One declaration, in the shape `golden-master/ci-declarations.json` holds them.
 *
 * The argument is part of the shape rather than a nicety: the file exists so that a round
 * can add a step the recording has not seen, and the round after it is deciding whether to
 * believe a bound about work nobody has watched run. A declaration without a reason asks
 * the reader to take that on trust.
 */
function declarationOf(over: Record<string, unknown> = {}) {
  return {
    job: 'batteries',
    step: 'Quick battery',
    minutes: 3,
    why: 'the claims battery had no step of its own, so its command rode in the step next to it',
    ...over,
  };
}

describe('the step the recording has not measured yet', () => {
  it('accepts a declared step whose bound is the one the workflow declares, and refuses it without', () => {
    // The pair is the rule: the same tree is green with the declaration and refused
    // without it, so the case cannot pass by the rule having stopped looking.
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 351 } } });
    expect(budgetErrors(workflow, recording, null, { declared: [declarationOf()] })).toEqual([]);
    expect(budgetErrors(workflow, recording).join('\n')).toContain('has no baseline');
  });

  it('refuses a declaration that outlived its measurement, because the measurement was the point', () => {
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 351, 'Quick battery': 40 } } });
    const errors = budgetErrors(workflow, recording, null, { declared: [declarationOf()] }).join('\n');
    expect(errors).toContain('was measured at 40 s and the declarations file still says it has not been');
    expect(errors).toContain('delete the entry');
  });

  it('refuses a declaration that invents a bound the workflow does not declare', () => {
    // A declaration is about the number the workflow will enforce. Two numbers is a
    // reader deciding which one the run will actually be killed by.
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 351 } } });
    const errors = budgetErrors(workflow, recording, null, {
      declared: [declarationOf({ minutes: 7 })],
    }).join('\n');
    expect(errors).toContain('is declared at 7 min and ci.yml bounds it at 3');
  });

  it('refuses a declaration naming a step, or a job, that ci.yml does not have', () => {
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 351 } } });
    const stepless = budgetErrors(workflow, recording, null, {
      declared: [declarationOf({ step: 'A battery that never was' })],
    }).join('\n');
    expect(stepless).toContain('which is not a step of that job');
    expect(stepless).toContain('the promise describes nothing');

    const jobless = budgetErrors(workflow, recording, null, {
      declared: [declarationOf({ job: 'batteries-heavy' })],
    }).join('\n');
    expect(jobless).toContain('which is not a job of ci.yml');
  });

  it('refuses a declared step that any measured step follows, because the sum would have a hole', () => {
    // The declaration is about a step that has not run. A bound after it is argued from
    // the measurements in front of it, and the declared step's own cost is exactly the
    // number the recording does not have -- so the deadline would be short by an unknown
    // amount and the bound would expire later than the profile says.
    const workflow = oneJob([...step('Quick battery', 3), ...step('Slow battery', 12)]);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { 'Slow battery': 351 } } }),
      null,
      { declared: [declarationOf()] },
    ).join('\n');
    expect(errors).toContain('has to be the last of its job');
    expect(errors).toContain('a sum with a hole in it');
  });

  it('refuses a declaration with no argument, because a claim with no words is a shrug', () => {
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 351 } } });
    const errors = budgetErrors(workflow, recording, null, {
      declared: [declarationOf({ why: 'battery' })],
    }).join('\n');
    expect(errors).toContain(`at least ${String(WHY_LENGTH)} characters`);
    expect(errors).toContain('whether to believe a number about work it has never seen run');
  });

  it('refuses a declared step under the floor, and a declared step bounded only by its job', () => {
    // Two refusals that need no measurement, so they are the ones a declaration cannot
    // dodge by pointing at a run that has not happened.
    const low = oneJob([...step('Slow battery', 12), ...step('Quick battery', 2)]);
    const lowErrors = budgetErrors(
      low,
      recordingOf({ batteries: { steps: { 'Slow battery': 351 } } }),
      null,
      { declared: [declarationOf({ minutes: 2 })] },
    ).join('\n');
    expect(lowErrors).toContain(`the floor is ${String(FLOOR_MINUTES)}`);

    const inheritedStep = oneJob([...step('Slow battery', 12), ...inherited('Quick battery')]);
    const inheritedErrors = budgetErrors(
      inheritedStep,
      recordingOf({ batteries: { steps: { 'Slow battery': 351 } } }),
      null,
      { declared: [declarationOf({ minutes: 30 })] },
    ).join('\n');
    expect(inheritedErrors).toContain('no `timeout-minutes` of its own');
    expect(inheritedErrors).toContain('the job budget would answer for it instead');
  });

  it('refuses a declared bound that would expire past the job, using the measurements in front of it', () => {
    // 300 s of a 10-minute job is left, and the declaration asks for 6 minutes of it.
    // The rule is `R5` with the declaration's number standing where a measurement would.
    const workflow = oneJob([...step('Slow battery', 10), ...step('Quick battery', 6)], 10);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { minutes: 10, steps: { 'Slow battery': 300 } } }),
      null,
      { declared: [declarationOf({ minutes: 6 })] },
    ).join('\n');
    expect(errors).toContain('would expire at 11 min');
    expect(errors).toContain("past the job's 10");
  });

  it('refuses a step declared twice, and a declarations file that says nothing', () => {
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 351 } } });
    expect(
      budgetErrors(workflow, recording, null, { declared: [declarationOf(), declarationOf()] }).join('\n'),
    ).toContain('is declared twice');
    // An empty list is the state of having no declarations, which is the state of not
    // having the file -- and a file that persists in that state is furniture.
    expect(budgetErrors(workflow, recording, null, { declared: [] }).join('\n')).toContain(
      'declares nothing',
    );
    expect(budgetErrors(workflow, recording, null, { steps: {} }).join('\n')).toContain(
      'has no `declared` list',
    );
  });

  it('reads nothing out of a tree that has declared nothing, which is the normal state', () => {
    const workflow = oneJob([...step('Slow battery', 12)]);
    expect(readDeclarations(workflow, null)).toEqual({ declared: new Map(), jobs: new Map(), errors: [] });
    expect(readDeclarations(workflow, undefined)).toEqual({
      declared: new Map(),
      jobs: new Map(),
      errors: [],
    });
  });

  it('names the declared step in the reading, so the step count and the ratios still add up', () => {
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 351 } } });
    const declared = budgetSummary(workflow, recording, null, { declared: [declarationOf()] });
    expect(declared).toContain('2 of 2 step(s) bounded');
    expect(declared).toContain('1 step(s) declared and awaiting the run that measures them');
    expect(declared).toContain('batteries / Quick battery');
    expect(budgetSummary(workflow, recording)).toContain('no step is declared unmeasured');
  });

  it('keeps the shipped declarations naming exactly the steps the recording has not measured', () => {
    // The one case about the committed pair rather than a fixture, and it is a
    // biconditional rather than a shape: the declarations name the unmeasured steps, no
    // more and no fewer. Both halves are defects -- a promise that outlived its
    // measurement is a bound nobody checked, and a step nobody wrote down is a bound that
    // does not exist -- and the file is expected to be *absent* most of the time, because
    // the round that measures a step deletes its sentence. A case that asserted the file
    // existed would be red in every round but the one that added a step.
    //
    // A job promise owns the whole gap of its job, so its steps are promised here too.
    // The names come from the promise itself, not from the workflow: a declaration that
    // renamed a step would then disagree with `unmeasured`, which is the point.
    const workflow = readWorkflow(readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'));
    const baseline = JSON.parse(readFileSync(join(ROOT, 'golden-master', 'ci-baseline.json'), 'utf8'));
    const declarations = existsSync(DECLARATIONS) ? JSON.parse(readFileSync(DECLARATIONS, 'utf8')) : null;
    const read = readDeclarations(workflow, declarations);
    expect(read.errors).toEqual([]);
    const promised = [
      ...[...read.declared].flatMap(([job, steps]) =>
        [...steps.keys()].map((name) => `${job} / ${name}`),
      ),
      ...[...read.jobs].flatMap(([job, promise]) =>
        promise.steps.map((one) => `${job} / ${one.name}`),
      ),
    ];
    const unmeasured = jobsOf(workflow).flatMap((job) => {
      const record = baseline.jobs?.[job.id];
      return stepsOf(workflow, job.id)
        .filter((bounded) => typeof record?.steps?.[bounded.name] !== 'number')
        .map((bounded) => `${job.id} / ${bounded.name}`);
    });
    expect(promised.sort()).toEqual(unmeasured.sort());
  });

  it('says OK through the gate for a tree whose one unmeasured step is declared', () => {
    // The success path of the new file, driven end to end rather than inferred from
    // `budgetErrors`: the shipped tree has no declarations on most days -- the round that
    // measures a step deletes its sentence -- so without this case the wiring between the
    // gate and the file would be exercised only by its refusals.
    const dir = mkdtempSync(join(tmpdir(), 'rca-ci-declared-'));
    const workflow = join(dir, 'ci.yml');
    writeFileSync(
      workflow,
      workflowText([
        { id: 'batteries', minutes: 25, steps: [...step('Slow battery', 12), ...step('Quick battery', 3)] },
      ]),
    );
    const recording = join(dir, 'baseline.json');
    writeFileSync(
      recording,
      JSON.stringify(recordingOf({ batteries: { minutes: 25, steps: { 'Slow battery': 351 } } })),
    );
    const declared = join(dir, 'declarations.json');
    writeFileSync(declared, JSON.stringify({ declared: [declarationOf()] }));
    const ledger = join(dir, 'volumes');
    mkdirSync(ledger);
    writeFileSync(join(ledger, 'volume-01.md'), '## v0.1\n\n> Ledger for `v0.1`.\n\n| item | value |\n| --- | --- |\n| suite | 1 |\n');
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: {
        ...process.env,
        RCA_CI_WORKFLOW: workflow,
        RCA_CI_BASELINE: recording,
        RCA_CI_DECLARATIONS: declared,
        RCA_CI_LEDGER: ledger,
      },
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('check-ci-budget: OK');
    expect(result.stdout).toContain('1 step(s) declared and awaiting the run that measures them');
    expect(result.stdout).toContain('batteries / Quick battery');
  });

  it('refuses through the gate, with the declarations file named, rather than only inside a function', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rca-ci-declarations-'));
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{ "declared": [');
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_DECLARATIONS: broken },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no readable declarations at');
    expect(result.stderr).toContain('broken.json');
  });
});

describe('which jobs bound their steps at all', () => {
  it('refuses a job whose steps cost minutes and none of which declares a bound', () => {
    // The rule v3.48 added, and the reason it was added: `verify` spends nine minutes
    // across eleven steps and named none of them, in the job next door to the one the
    // budget was written for. The sentence has to name both numbers, because "unbounded"
    // alone does not say whether the job is worth bounding.
    const workflow = oneJob([...inherited('Lint'), ...inherited('Test with coverage')]);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { Lint: 341, 'Test with coverage': 156 } } }),
    ).join('\n');
    expect(errors).toContain('measured 8 min across 2 steps and declares no `timeout-minutes` on any of them');
    expect(errors).toContain('names the job rather than the step');
    // And the per-step rule does not also fire: one sentence per mistake.
    expect(errors).not.toContain('while');
  });

  it('does not ask a job under the floor for bounds, because there is nothing to spend', () => {
    // `artefacts` measures 57 s and `cold-tree` 19 s. Bounding them at the three-minute
    // floor would be four steps of ceremony per job and no bound that can ever fire.
    const workflow = oneJob([...inherited('Golden Master verification'), ...inherited('Examples are up to date')]);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { 'Golden Master verification': 0, 'Examples are up to date': 7 } } }),
    );
    expect(errors).toEqual([]);
  });

  it('refuses a job that bounds some of its steps and not the others', () => {
    // Half a bound is worse than none: the verdict names the job for the unbounded step,
    // which is what the reader is told to stop accepting.
    const workflow = oneJob([...step('Slow battery', 12), ...inherited('Quick battery')]);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { 'Slow battery': 351, 'Quick battery': 4 } } }),
    ).join('\n');
    expect(errors).toContain('`batteries / Quick battery` declares no `timeout-minutes` of its own while 1 other');
    expect(errors).toContain('budget every other step is sharing');
  });

  it('excuses a job that holds one step, and says so where a reader can see it', () => {
    // The one-step exception is not a loophole: with one step the job's own budget names
    // exactly that step, which is the whole thing a step bound buys. It is stated in the
    // summary rather than left unsaid, because an exception nobody wrote down is
    // indistinguishable from an oversight.
    const workflow = workflowOf([
      { id: 'sensitivity', minutes: 20, steps: [...inherited('Every proved exit can disappear')] },
      { id: 'batteries', minutes: 25, steps: [...step('Slow battery', 12)] },
    ]);
    const recording = recordingOf({
      sensitivity: { minutes: 20, steps: { 'Every proved exit can disappear': 536 } },
      batteries: { minutes: 25, steps: { 'Slow battery': 351 } },
    });
    expect(budgetErrors(workflow, recording)).toEqual([]);
    expect(budgetSummary(workflow, recording)).toContain('bounded by its own budget alone: sensitivity (9 min');
  });

  it('refuses a job the recording has never measured', () => {
    // The question this rule exists to pose is about jobs, and a job nobody measured is a
    // job nobody can say anything about -- so it is refused rather than skipped.
    const workflow = workflowOf([
      { id: 'batteries', steps: [...step('Slow battery', 12)] },
      { id: 'batteries-heavy', minutes: 25, steps: [...step('Slow battery', 16)] },
    ]);
    const errors = budgetErrors(workflow, recordingOf({ batteries: { steps: { 'Slow battery': 351 } } })).join('\n');
    expect(errors).toContain('`batteries-heavy` is a job of ci.yml that the recording has never measured');
    expect(errors).toContain('whether its steps are bounded at all');
  });

  it('refuses a recording that outlives the job it describes', () => {
    const workflow = oneJob([...step('One battery', 12)]);
    const errors = budgetErrors(
      workflow,
      recordingOf({
        batteries: { steps: { 'One battery': 351 } },
        nowhere: { minutes: 20, steps: { 'One battery': 351 } },
      }),
    ).join('\n');
    expect(errors).toContain('the recording holds `nowhere`, which is not a job of ci.yml');
  });

  it('falls back to the steps when the workflow was read by a reader that kept no jobs', () => {
    // A workflow object with steps and no `jobs` is what an older `gate-steps.mjs`
    // returned. The module answers about it rather than throwing, and says so: no names,
    // and no budgets beyond the ones the steps carry.
    const legacy = { steps: [{ job: 'batteries', name: 'Slow battery', values: {}, jobTimeout: '30' }] };
    expect(jobsOf(legacy)).toEqual([{ id: 'batteries', name: '', timeoutMinutes: null }]);
  });
});

/** A ledger fixture: the newest closing reading, and the rows that name no run. */
function ledgerFixture(over: Record<string, unknown> = {}) {
  return {
    read: true,
    rows: [{ file: 'volume-10.md', line: 2056, runs: [41670923224] }],
    unnamed: [],
    newest: { run: 41670923224, file: 'volume-10.md', line: 2056 },
    tail: { file: 'volume-10.md', line: 2056, runs: [41670923224] },
    ...over,
  };
}

describe('the recording against the round that reports it', () => {
  it('refuses a recording older than the newest run the ledger reports', () => {
    // The defect the rule exists for, measured rather than imagined: the round that gave
    // the recording its job coverage shipped at `91e320884`, the ledger gained a row citing
    // run `41677264353`, and the recording stayed at `41670923224`. Every other rule passed
    // -- each number in it was a real measurement of a real tree, and only the tree had moved.
    const workflow = oneJob([...step('One battery', 12)]);
    const recording = recordingOf({ batteries: { steps: { 'One battery': 351 } } });
    const errors = ledgerErrors(recording, ledgerFixture({
      newest: { run: 41677264353, file: 'volume-10.md', line: 2071 },
      tail: { file: 'volume-10.md', line: 2071, runs: [41677264353] },
    })).join('\n');
    expect(errors).toContain('the recording is from run 41637098008');
    expect(errors).toContain('reports run 41677264353');
    expect(errors).toContain('describes a tree nobody shipped');
    // The repair is a command rather than an instruction, because the reader is the
    // person who can run it and the run id is the whole argument.
    expect(errors).toContain('measure-ci-baseline.mjs 41677264353');
    // And the two rules compose: the bounds are fine, and the question they answer is
    // about a tree that has since run again.
    expect(budgetErrors(workflow, recording, ledgerFixture({
      newest: { run: 41677264353, file: 'volume-10.md', line: 2071 },
      tail: { file: 'volume-10.md', line: 2071, runs: [41677264353] },
    })).join('\n')).toContain('describes a tree nobody shipped');
  });

  it('accepts a recording taken from the run the ledger reports', () => {
    const workflow = oneJob([...step('One battery', 12)]);
    const recording = recordingOf({ batteries: { steps: { 'One battery': 351 } } }, { run: 41670923224 });
    expect(budgetErrors(workflow, recording, ledgerFixture())).toEqual([]);
  });

  it('accepts a recording newer than the ledger, because a refresh is not a round', () => {
    // A round states which run it ended on and the recording is refreshed from it; the
    // commit that carries the refresh gets its own CI run, and no round reports it. So the
    // recording is allowed to be ahead -- and being ahead is what the refresh produces.
    const workflow = oneJob([...step('One battery', 12)]);
    const recording = recordingOf({ batteries: { steps: { 'One battery': 351 } } }, { run: 41670923224 });
    const behind = ledgerFixture({
      newest: { run: 41670000000, file: 'volume-10.md', line: 2000 },
      tail: { file: 'volume-10.md', line: 2000, runs: [41670000000] },
    });
    expect(budgetErrors(workflow, recording, behind)).toEqual([]);
    expect(budgetSummary(workflow, recording, behind)).toContain('the recording (41670923224) is newer');
  });

  it('refuses a ledger whose newest row names no run, because nothing was compared', () => {
    // The half of the rule that makes the other half mean something: a row that reports a
    // wall clock without naming its run leaves the recording unopposed, and the gate's
    // silence then reads as agreement with a round it never looked at.
    const workflow = oneJob([...step('One battery', 12)]);
    const recording = recordingOf({ batteries: { steps: { 'One battery': 351 } } });
    const errors = ledgerErrors(recording, ledgerFixture({
      tail: { file: 'volume-10.md', line: 2062, runs: [] },
    })).join('\n');
    expect(errors).toContain('volume-10.md:2062');
    expect(errors).toContain('names no run');
    expect(errors).toContain('end the row with the run id');
  });

  it('asks nothing when it is given no ledger, and prints that it could not compare', () => {
    // A caller with no ledger has not asked whether the recording is current, and a module
    // that answers unasked questions is what this file was written against. The summary
    // says so instead of implying agreement.
    const workflow = oneJob([...step('One battery', 12)]);
    const recording = recordingOf({ batteries: { steps: { 'One battery': 351 } } });
    expect(ledgerErrors(recording, null)).toEqual([]);
    expect(budgetSummary(workflow, recording, null)).toContain('no ledger to compare against');
    // `read: false` is a tree whose volumes could not be read: also not a comparison.
    expect(ledgerErrors(recording, { read: false, rows: [], unnamed: [], newest: null, tail: null })).toEqual([]);
  });

  it('prints that the recording is the ledger\'s run, so the comparison is visible', () => {
    const workflow = oneJob([...step('One battery', 12)]);
    const recording = recordingOf({ batteries: { steps: { 'One battery': 351 } } }, { run: 41670923224 });
    expect(budgetSummary(workflow, recording, ledgerFixture())).toContain(
      "the ledger's newest run is 41670923224 (the recording)",
    );
  });

  it('counts the rows that name no run, so a gap in the log is stated rather than silent', () => {
    const workflow = oneJob([...step('One battery', 12)]);
    const recording = recordingOf({ batteries: { steps: { 'One battery': 351 } } });
    const summary = budgetSummary(
      workflow,
      recordingOf({ batteries: { steps: { 'One battery': 351 } } }, { run: 41670923224 }),
      ledgerFixture({ unnamed: [{ file: 'volume-03.md', line: 1174, runs: [] }] }),
    );
    expect(summary).toContain('1 earlier row(s) name no run');
  });

  it('refuses through the gate, with the ledger named, rather than only inside a function', () => {
    // The rule as the runner meets it. The ledger path is a seam for the same reason the
    // recording is: both refusals describe a state the shipped tree is never in, and a test
    // that edited a committed volume would be editing the log to test the log.
    const dir = mkdtempSync(join(tmpdir(), 'rca-ci-ledger-'));
    const stale = join(dir, 'volumes');
    mkdirSync(stale);
    // A run newer than the shipped recording, read rather than guessed. The fixture used
    // to say `41999999999` -- a "future" run that v3.53's refresh at 42131836805
    // overtook, after which the case that has to refuse started passing. A test with a
    // hard-coded date is a test the next recording breaks, and the refusal under test is
    // about the *order* of two runs, not about either number.
    const recorded = JSON.parse(readFileSync(join(ROOT, 'golden-master', 'ci-baseline.json'), 'utf8'));
    const newer = Number(recorded.run) + 1;
    writeFileSync(
      join(stale, 'volume-01.md'),
      `## v0.1\n\n> Ledger for \`v0.1\`.\n\n| CI | run \`${newer}\` on \`abc\`: 7 of 7 jobs success |\n`,
    );
    const older = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_LEDGER: stale },
    });
    expect(older.status).toBe(1);
    expect(older.stdout).toContain('check-ci-budget: FAILED');
    expect(older.stderr).toContain(`reports run ${newer}`);

    const silent = join(dir, 'silent');
    mkdirSync(silent);
    writeFileSync(join(silent, 'volume-01.md'), '## v0.2\n\n> Ledger for `v0.2`.\n\n| CI | **five jobs green** |\n');
    const unnamed = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_LEDGER: silent },
    });
    expect(unnamed.status).toBe(1);
    expect(unnamed.stderr).toContain('names no run');
  });
});

describe('the recording the gate reads', () => {
  it('prints what the bounds cost against what the jobs measured', () => {
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const summary = budgetSummary(
      workflow,
      recordingOf({ batteries: { steps: { 'Slow battery': 351, 'Quick battery': 4 } } }),
    );
    expect(summary).toContain('1 job(s) recorded');
    expect(summary).toContain('2 of 2 step(s) bounded');
    expect(summary).toContain('6 min measured');
    expect(summary).toContain('as of run 41637098008');
    expect(summary).toContain('bounds total 15 min');
    // The tightest ratio names the battery, because a ratio without a subject invites
    // the reader to supply one (finding 294).
    expect(summary).toContain('tightest batteries / Slow battery at 2.1x');
  });

  it('is green on the shipped tree, and the recording it checks is in the tree', () => {
    // The two halves that make this a gate rather than a document: the workflow and the
    // recording it is measured against are both committed, and they agree.
    const result = spawnSync(process.execPath, [GATE], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('check-ci-budget: OK');
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
    const stale = recordingOf({ batteries: { steps: { 'Set up job': 2, 'Not a step': 9 } } });
    writeFileSync(recording, JSON.stringify(stale));
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_BASELINE: recording },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('check-ci-budget: FAILED');
    expect(result.stderr).toContain('holds `Not a step` for `batteries`, which is not a step of that job');
    expect(result.stderr).toContain('has no baseline');
  });

  it('states the multiple and the floor in one place, which the shipped bounds satisfy', () => {
    const workflow = readWorkflow(readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'));
    const baseline = JSON.parse(readFileSync(join(ROOT, 'golden-master', 'ci-baseline.json'), 'utf8'));
    // The declarations are read the way the gate reads them: absent is the normal state,
    // and whether this tree has one is the previous case's business.
    const declarations = existsSync(DECLARATIONS) ? JSON.parse(readFileSync(DECLARATIONS, 'utf8')) : null;
    expect(budgetErrors(workflow, baseline, readLedger(), declarations)).toEqual([]);
    for (const job of jobsOf(workflow)) {
      for (const step of stepsOf(workflow, job.id)) {
        if (step.inheritedFrom === null) continue;
        expect(step.minutes).toBeGreaterThanOrEqual(FLOOR_MINUTES);
      }
    }
  });
});

/** A fixture workflow with two jobs, for the recorder cases that need a second one. */
const TWO_JOBS = workflowText([
  {
    id: 'batteries',
    minutes: 25,
    name: 'injection batteries, one step each (no survivors, no inert)',
    steps: [
      '      - name: Check out',
      '        timeout-minutes: 3',
      '        uses: actions/checkout@v4',
      ...step('Slow battery', 12),
    ],
  },
  {
    id: 'batteries-heavy',
    minutes: 25,
    name: 'injection batteries, the two that rewrite a probe a hundred times',
    steps: [
      '      - name: Check out',
      '        timeout-minutes: 3',
      '        uses: actions/checkout@v4',
      ...step('Slow battery', 16),
    ],
  },
]);

/** The API's answer for one run: two jobs, with the bookkeeping steps GitHub adds. */
const API_JOBS = {
  jobs: [
    {
      name: 'injection batteries, one step each (no survivors, no inert)',
      completed_at: '2026-11-02T10:11:12Z',
      steps: [
        { name: 'Set up job', started_at: '2026-11-02T10:00:00Z', completed_at: '2026-11-02T10:00:01Z' },
        { name: 'Check out', started_at: '2026-11-02T10:00:01Z', completed_at: '2026-11-02T10:00:03Z' },
        { name: 'Slow battery', started_at: '2026-11-02T10:00:03Z', completed_at: '2026-11-02T10:00:52Z' },
      ],
    },
    {
      name: 'injection batteries, the two that rewrite a probe a hundred times',
      completed_at: '2026-11-02T10:30:00Z',
      steps: [
        { name: 'Set up job', started_at: '2026-11-02T10:20:00Z', completed_at: '2026-11-02T10:20:01Z' },
        { name: 'Check out', started_at: '2026-11-02T10:20:01Z', completed_at: '2026-11-02T10:20:02Z' },
        { name: 'Slow battery', started_at: '2026-11-02T10:20:02Z', completed_at: '2026-11-02T10:28:01Z' },
      ],
    },
  ],
};

/**
 * A server that answers the two calls the recorder makes, and a fixture workflow.
 *
 * The API root is a seam (`RCA_GITHUB_API`) rather than a mock: a real HTTP server
 * answers and the script is run unmodified. Nothing here stubs `fetch`. The workflow is
 * a seam too (`RCA_CI_WORKFLOW`), because the recorder now reads the job list from
 * `ci.yml` -- and a case about a two-job split should not have to describe the other
 * five jobs of the real one.
 */
async function withApi<T>(
  answer: (url: string) => { status: number; body: unknown } | null,
  body: (env: Record<string, string>) => Promise<T>,
  source = TWO_JOBS,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'rca-ci-fixture-'));
  const workflow = join(dir, 'ci.yml');
  writeFileSync(workflow, source);
  const server = createServer((req, res) => {
    const found = answer(req.url ?? '');
    if (found === null) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(found.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(found.body));
  });
  const port = await new Promise<number>((done) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      done(typeof address === 'object' && address !== null ? address.port : 0);
    });
  });
  try {
    return await body({
      GITHUB_TOKEN: 'x',
      RCA_GITHUB_API: `http://127.0.0.1:${String(port)}`,
      RCA_CI_WORKFLOW: workflow,
      RCA_CI_OUT: join(dir, 'ci-baseline.json'),
      // The shipped declarations file is a file about the shipped workflow. A fixture
      // workflow that inherited it would be reading a sentence about a job it does not
      // have, and the recorder's own report would depend on a committed file.
      RCA_CI_DECLARATIONS: join(dir, 'ci-declarations.json'),
    });
  } finally {
    await new Promise<void>((shut) => server.close(() => shut()));
  }
}

/** Run the recorder with an environment, and collect everything it said. */
function runRecorder(
  args: string[],
  env: Record<string, string>,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [MEASURE, ...args], { env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('close', (status) => done({ status, stdout, stderr }));
  });
}

describe('the recorder', () => {
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
    expect(bare.stderr).toContain('--borrow');
    expect(bare.stdout).toBe('');

    const noRun = spawnSync(process.execPath, [MEASURE, 'not-a-run'], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: 'x' },
    });
    expect(noRun.status).toBe(2);
    expect(noRun.stderr).toContain('usage: GITHUB_TOKEN=');
  });

  it('writes every job of the workflow it read, and drops the runner bookkeeping steps', async () => {
    // The success path. The file every bound is a multiple of is written by this script
    // and by nothing else, so its shape is held by a case rather than by whoever last ran
    // it by hand -- and the shape changed this round: `steps` became `jobs.<id>.steps`, so
    // a recording of one job can no longer stand in for a workflow.
    const result = await withApi(
      (url) => {
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/7') {
          return { status: 200, body: { head_sha: 'deadbeef', updated_at: '2026-11-02T10:31:00Z' } };
        }
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/7/jobs?per_page=100') {
          return { status: 200, body: API_JOBS };
        }
        return null;
      },
      (env) => runRecorder(['7'], env).then((out) => ({ out, env })),
    );
    expect(result.out.stderr).toBe('');
    expect(result.out.status).toBe(0);
    expect(result.out.stdout).toContain('2 job(s) and 4 step(s) from run 7');
    const written = JSON.parse(readFileSync(result.env['RCA_CI_OUT'] as string, 'utf8'));
    expect(written).toMatchObject({ run: 7, commit: 'deadbeef', measured: '2026-11-02' });
    expect(Object.keys(written.jobs)).toEqual(['batteries', 'batteries-heavy']);
    expect(written.jobs.batteries).toEqual({
      name: 'injection batteries, one step each (no survivors, no inert)',
      timeoutMinutes: 25,
      steps: { 'Check out': 2, 'Slow battery': 49 },
    });
    // The runner's own bookkeeping is not in the workflow, so it has no bound to argue
    // about; a recording that kept it would fail the gate's "every entry names a step"
    // rule for a reason about GitHub rather than about this repository.
    expect(Object.keys(written.jobs.batteries.steps)).toEqual(['Check out', 'Slow battery']);
    // Nothing was borrowed, so nothing claims to have been.
    expect(written.derived).toBeUndefined();
    expect(written.note).toBeUndefined();
  });

  it('records a job that has not run from the job that ran its steps, and says which', async () => {
    // The one moment the arithmetic cannot be satisfied by measuring: the split exists
    // only after the change, and the recording has to exist before CI will accept the
    // change. The steps are the same commands, so their seconds are a measurement of
    // them -- and the file says whose measurement they are.
    const result = await withApi(
      (url) => {
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/11') {
          return { status: 200, body: { head_sha: 'beefdead', updated_at: '2026-11-02T10:31:00Z' } };
        }
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/11/jobs?per_page=100') {
          return {
            status: 200,
            body: { jobs: [API_JOBS.jobs[0]] },
          };
        }
        return null;
      },
      (env) => runRecorder(['11', '--borrow', 'batteries-heavy=batteries'], env).then((out) => ({ out, env })),
    );
    expect(result.out.status).toBe(0);
    expect(result.out.stdout).toContain('1 borrowed');
    const written = JSON.parse(readFileSync(result.env['RCA_CI_OUT'] as string, 'utf8'));
    expect(written.jobs['batteries-heavy'].steps).toEqual({ 'Check out': 2, 'Slow battery': 49 });
    expect(written.derived['batteries-heavy']).toContain('ran inside `batteries` in run 11');
    // The run borrowed from ran a workflow without that job, so the commit describes the
    // seconds and not the set of jobs they are checked against -- said out loud, because
    // the next reader will otherwise take the pair for one tree.
    expect(written.note).toContain('did not exist in the run its seconds came from');
  });

  it('reports the declarations its reading has just answered, and leaves them for the round to delete', async () => {
    // The promise and its answer are one edit apart: this run measures the step, and the
    // gate refuses the tree until the sentence is gone. The recorder says so rather than
    // deleting it, because the sentence is the only account of why the step was added --
    // a tool that removed it would erase the reasoning at the moment it stopped being
    // needed, which is the moment somebody would want to read it.
    const result = await withApi(
      (url) => {
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/13') {
          return { status: 200, body: { head_sha: 'feedface', updated_at: '2026-11-02T10:31:00Z' } };
        }
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/13/jobs?per_page=100') {
          return { status: 200, body: API_JOBS };
        }
        return null;
      },
      async (env) => {
        const path = join(dirname(env['RCA_CI_OUT'] as string), 'declared.json');
        writeFileSync(
          path,
          JSON.stringify({
            declared: [
              {
                job: 'batteries-heavy',
                step: 'Slow battery',
                minutes: 16,
                why: 'the two probes that rewrite a source file a hundred times had no step of their own',
              },
              {
                job: 'a-job-this-run-never-ran',
                step: 'Slow battery',
                minutes: 3,
                why: 'a second entry that this reading does not answer, to prove the count is of answers',
              },
            ],
          }),
        );
        const out = await runRecorder(['13'], { ...env, RCA_CI_DECLARATIONS: path });
        return { out, path };
      },
    );
    expect(result.out.status).toBe(0);
    expect(result.out.stdout).toContain('1 declaration(s) are now measured and can be deleted');
    // Still there, and still saying what it said.
    expect(readFileSync(result.path, 'utf8')).toContain('a-job-this-run-never-ran');
  });

  it('refuses to borrow across a budget, because the seconds are the same commands and the ceiling is not', async () => {
    // The hole `R6` cannot see. A borrowed job records the *target's* budget, so the
    // comparison between recording and workflow is the workflow against itself and never
    // fires for that job -- while the deadline arithmetic is argued from a ceiling the
    // borrowed seconds have never been spent inside. The refusal is here rather than in
    // the rule because the recording is the only place the source is still known.
    const UNEQUAL = workflowText([
      {
        id: 'batteries',
        name: 'injection batteries, one step each (no survivors, no inert)',
        minutes: 25,
        steps: [...step('Slow battery', 12)],
      },
      {
        id: 'batteries-heavy',
        name: 'injection batteries, one step each (no survivors, no inert)',
        minutes: 40,
        steps: [...step('Slow battery', 12)],
      },
    ]);
    const result = await withApi(
      (url) => {
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/14') {
          return { status: 200, body: { head_sha: 'cafebabe', updated_at: '2026-11-02T10:31:00Z' } };
        }
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/14/jobs?per_page=100') {
          return { status: 200, body: { jobs: [API_JOBS.jobs[0]] } };
        }
        return null;
      },
      (env) => runRecorder(['14', '--borrow', 'batteries-heavy=batteries'], env),
      UNEQUAL,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('crosses a budget');
    expect(result.stderr).toContain('`batteries-heavy` declares 40 minutes');
    expect(result.stderr).toContain('`batteries` declares 25 minutes');
  });

  it('refuses a borrow that names no job of the workflow', async () => {
    const result = await withApi(
      (url) => {
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/12') {
          return { status: 200, body: { head_sha: 'beefdead', updated_at: '2026-11-02T10:31:00Z' } };
        }
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/12/jobs?per_page=100') {
          return { status: 200, body: API_JOBS };
        }
        return null;
      },
      (env) => runRecorder(['12', '--borrow', 'batteries-heavy=nowhere'], env),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('`nowhere`, which is not a job of this workflow');
  });

  it('refuses a run that holds no job of that name, and a run the API will not answer', async () => {
    // The two refusals that live past the usage check, and both are **top-level throws**:
    // until v3.45 neither had ever executed, because the only test that drives this script
    // passed an empty token and the usage arm answered first. A refusal no test reaches is
    // a refusal that can break without a word, and this one guards the number every bound
    // is a multiple of.
    const noJob = await withApi(
      (url) => {
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/9') {
          return { status: 200, body: { head_sha: 'abc', updated_at: '2026-11-02T10:31:00Z' } };
        }
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/9/jobs?per_page=100') {
          // A job whose name is deliberately not the one asked for. The word list in
          // `heavy-fixtures-do-not-contend` reads a quoted verb anywhere in a file that
          // also spawns, so this fixture says what it means instead: a job with some
          // other name.
          return { status: 200, body: { jobs: [{ name: 'not-the-one-asked-for', steps: [] }] } };
        }
        return null;
      },
      (env) => runRecorder(['9'], env),
    );
    expect(noJob.status).toBe(1);
    expect(`${noJob.stderr}`).toContain('holds no job named "injection batteries, one step each');
    expect(noJob.stdout).toBe('');

    const refused = await withApi(
      () => ({ status: 500, body: 'no' }),
      (env) => runRecorder(['8'], env),
    );
    expect(refused.status).toBe(1);
    expect(`${refused.stderr}`).toContain('HTTP 500');
    expect(refused.stdout).toBe('');
  });

  it('refuses to record a step the job it borrowed from never ran', async () => {
    // The borrow is a claim that the same commands ran somewhere. A step that did not run
    // has no seconds, and inventing them would put a typed number where a measurement is
    // supposed to be -- which is the one thing this file exists to prevent.
    const result = await withApi(
      (url) => {
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/13') {
          return { status: 200, body: { head_sha: 'beefdead', updated_at: '2026-11-02T10:31:00Z' } };
        }
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/13/jobs?per_page=100') {
          return {
            status: 200,
            body: {
              jobs: [{ ...API_JOBS.jobs[0], steps: API_JOBS.jobs[0].steps.filter((one) => one.name !== 'Slow battery') }],
            },
          };
        }
        return null;
      },
      (env) => runRecorder(['13', '--borrow', 'batteries-heavy=batteries'], env),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is not a step of "injection batteries, one step each');
    expect(result.stderr).toContain('a bound cannot be sized from a step that did not run');
  });

  it('refuses a workflow it cannot read, rather than recording nothing and saying it did', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rca-ci-broken-'));
    const broken = join(dir, 'ci.yml');
    writeFileSync(broken, 'name: CI\n\non:\n  push:\n');
    const result = await withApi(
      () => ({ status: 200, body: {} }),
      (env) => runRecorder(['14'], { ...env, RCA_CI_WORKFLOW: broken }),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('the workflow does not parse');
  });
});

// ---------------------------------------------------------------------------
// R9 -- a job the recording has never measured (v3.54, P17).
// ---------------------------------------------------------------------------

/**
 * A job promise, in the shape `golden-master/ci-declarations.json` holds them.
 *
 * The four keys are a whitelist rather than a convention. The round that writes this
 * file has not watched the job run: it cannot know a second, a run id, a commit, a
 * ratio or a date. A promise carrying any of them is a measurement somebody invented,
 * and refusing those keys by name is the one failure shape a local fixture can produce
 * about a budget that only CI can spend. `R8` solved the step one level down; `R9` is
 * the same shape at the level of the job, where `R6` has nothing to compare.
 */
function jobPromiseOf(over: Record<string, unknown> = {}) {
  return {
    job: 'batteries-heavy',
    timeoutMinutes: 25,
    steps: [
      { name: 'Check out', minutes: 3 },
      { name: 'Slow battery', minutes: 16 },
    ],
    why: 'the second shard of the sites battery needs its own ceiling, and no run has spent it yet',
    ...over,
  };
}

/** The workflow and the recording of the round a promise is written in. */
function splitWorkflow() {
  const read = readWorkflow(TWO_JOBS);
  expect(read.errors).toEqual([]);
  return read;
}
function splitRecording() {
  return recordingOf({ batteries: { minutes: 25, steps: { 'Check out': 2, 'Slow battery': 49 } } });
}
function jobDeclarationOf(over: Record<string, unknown> = {}) {
  return { jobs: [jobPromiseOf(over)] };
}

describe('a job the recording has never measured', () => {
  it('accepts a declared job and refuses the same tree without the promise', () => {
    // Cannot produce: a runner spending the promised 25 minutes. The pair is what this
    // case can hold -- green with the promise, `R2` red without it -- so it cannot pass
    // by the rule having stopped looking at the job set.
    const workflow = splitWorkflow();
    const recording = splitRecording();
    expect(budgetErrors(workflow, recording, null, jobDeclarationOf())).toEqual([]);
    expect(budgetErrors(workflow, recording).join('\n')).toContain(
      '`batteries-heavy` is a job of ci.yml that the recording has never measured',
    );
  });

  it('refuses a promise that outlived its first run', () => {
    // Cannot produce: a real first run. The recording is written by hand here, which is
    // exactly why the case is about the *shape* of an arrived measurement and not about
    // the runner that produced it.
    const workflow = splitWorkflow();
    const recording = recordingOf({
      batteries: { minutes: 25, steps: { 'Check out': 2, 'Slow battery': 49 } },
      'batteries-heavy': { minutes: 25, steps: { 'Check out': 2, 'Slow battery': 300 } },
    });
    const errors = budgetErrors(workflow, recording, null, jobDeclarationOf()).join('\n');
    expect(errors).toContain('has been measured by run');
    expect(errors).toContain('delete the job promise');
  });

  it('refuses a budget the workflow does not declare, because a promise is not a second workflow', () => {
    // Cannot produce: a job whose ceiling was enforced by GitHub. The number in `ci.yml`
    // is read from text here, not spent.
    const errors = budgetErrors(
      splitWorkflow(),
      splitRecording(),
      null,
      jobDeclarationOf({ timeoutMinutes: 40 }),
    ).join('\n');
    expect(errors).toContain('promises a budget of 40 min and ci.yml declares 25');
  });

  it('refuses a promise that omits a step, adds one, reorders them, or re-binds one', () => {
    // Cannot produce: a step whose command hung. Four edits, four distinct sentences, so
    // a reader repairing the file is told which of the four it is.
    const workflow = splitWorkflow();
    const recording = splitRecording();
    const omitted = budgetErrors(workflow, recording, null, {
      jobs: [jobPromiseOf({ steps: [{ name: 'Check out', minutes: 3 }] })],
    }).join('\n');
    expect(omitted).toContain('promises 1 step(s) and ci.yml has 2');

    const added = budgetErrors(workflow, recording, null, {
      jobs: [
        jobPromiseOf({
          steps: [
            { name: 'Check out', minutes: 3 },
            { name: 'Slow battery', minutes: 16 },
            { name: 'A step that never was', minutes: 3 },
          ],
        }),
      ],
    }).join('\n');
    expect(added).toContain('promises 3 step(s) and ci.yml has 2');

    const reordered = budgetErrors(workflow, recording, null, {
      jobs: [
        jobPromiseOf({
          steps: [
            { name: 'Slow battery', minutes: 16 },
            { name: 'Check out', minutes: 3 },
          ],
        }),
      ],
    }).join('\n');
    expect(reordered).toContain('promises `Slow battery` in position 1 and ci.yml has `Check out`');

    const rebound = budgetErrors(workflow, recording, null, {
      jobs: [
        jobPromiseOf({
          steps: [
            { name: 'Check out', minutes: 3 },
            { name: 'Slow battery', minutes: 12 },
          ],
        }),
      ],
    }).join('\n');
    expect(rebound).toContain('`batteries-heavy / Slow battery` promises 12 min and ci.yml bounds it at 16');
  });

  it('refuses a job with a step that inherits the job budget', () => {
    // Cannot produce: a run in which the job died before a step bound could fire. That
    // is the event `R5` measures; here only the workflow text says the bound is absent.
    const workflow = readWorkflow(
      workflowText([
        {
          id: 'batteries',
          minutes: 25,
          steps: [...inherited('Check out'), ...step('Slow battery', 16)],
        },
        {
          id: 'batteries-heavy',
          minutes: 25,
          steps: [...inherited('Check out'), ...step('Slow battery', 16)],
        },
      ]),
    );
    expect(workflow.errors).toEqual([]);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { minutes: 25, steps: { 'Check out': 2, 'Slow battery': 49 } } }),
      null,
      jobDeclarationOf(),
    ).join('\n');
    expect(errors).toContain('gives it none of its own');
    expect(errors).toContain('a declared job has to bound every step');
  });

  it('refuses a promised bound below the floor', () => {
    // Cannot produce: a cold package index or a missed cache -- the two things the floor
    // exists for and the two things no fixture can spend.
    const errors = budgetErrors(
      splitWorkflow(),
      splitRecording(),
      null,
      {
        jobs: [
          jobPromiseOf({
            steps: [
              { name: 'Check out', minutes: 3 },
              { name: 'Slow battery', minutes: 2 },
            ],
          }),
        ],
      },
    ).join('\n');
    expect(errors).toContain(`the floor is ${String(FLOOR_MINUTES)}`);
    expect(errors).toContain('a step that has not run yet is the case the floor is for');
  });

  it('refuses a promise with no argument', () => {
    // Cannot produce: a round that decides to believe a number about work it has never
    // watched. The reader's decision is not an observable in a fixture.
    const errors = budgetErrors(
      splitWorkflow(),
      splitRecording(),
      null,
      jobDeclarationOf({ why: 'shard' }),
    ).join('\n');
    expect(errors).toContain(`at least ${String(WHY_LENGTH)} characters`);
  });

  it('refuses a promise naming a job ci.yml does not have', () => {
    // Cannot produce: a job that GitHub scheduled. The workflow's job ids are text.
    const errors = budgetErrors(
      splitWorkflow(),
      splitRecording(),
      null,
      jobDeclarationOf({ job: 'a-job-that-never-was' }),
    ).join('\n');
    expect(errors).toContain('which is not a job of ci.yml');
  });

  it('refuses a job declared twice', () => {
    // Cannot produce: two different first runs of one job. The fixture can only say the
    // same promise twice, and the refusal is about a reader with two numbers.
    const errors = budgetErrors(
      splitWorkflow(),
      splitRecording(),
      null,
      { jobs: [jobPromiseOf(), jobPromiseOf()] },
    ).join('\n');
    expect(errors).toContain('is declared as a job twice');
  });

  it('refuses a job with both a job promise and a step declaration', () => {
    // Cannot produce: one run answering two promises in different ways. The two files
    // would be edited by the same round, and `R8` and `R9` cannot both own the gap.
    const errors = budgetErrors(splitWorkflow(), splitRecording(), null, {
      declared: [declarationOf({ job: 'batteries-heavy', step: 'Slow battery', minutes: 16 })],
      jobs: [jobPromiseOf()],
    }).join('\n');
    expect(errors).toContain('both a job promise and a step declaration');
  });

  it('refuses a promise carrying a measurement, because its writer has not seen the job run', () => {
    // Cannot produce: a CI run that spent those seconds. This is the case the ruler
    // points at: the local apparatus cannot spend the budget, but it *can* catch someone
    // writing down the seconds that only a run could have produced.
    const workflow = splitWorkflow();
    const recording = splitRecording();
    for (const key of ['seconds', 'run', 'commit', 'measured', 'ratio', 'derived']) {
      const errors = budgetErrors(workflow, recording, null, {
        jobs: [jobPromiseOf({ [key]: 313 })],
      }).join('\n');
      expect(errors).toContain(`carries \`${key}\``);
      expect(errors).toContain('which is a measurement');
    }
  });

  it('refuses a step inside a promise carrying a measurement', () => {
    // Cannot produce: a per-step reading. A step promise may name a bound and a name,
    // because both are in `ci.yml`; a second is not.
    const errors = budgetErrors(splitWorkflow(), splitRecording(), null, {
      jobs: [
        jobPromiseOf({
          steps: [
            { name: 'Check out', minutes: 3, seconds: 2 },
            { name: 'Slow battery', minutes: 16 },
          ],
        }),
      ],
    }).join('\n');
    expect(errors).toContain('`batteries-heavy / Check out` carries `seconds`');
    expect(errors).toContain('which is a measurement');
  });

  it('refuses a `jobs` key that is not a list, or a list that promises nothing', () => {
    // Cannot produce: a tree whose declarations file was deleted. A missing key is the
    // normal state and is not an error; these two are files that claim to say something.
    const workflow = splitWorkflow();
    const recording = splitRecording();
    expect(budgetErrors(workflow, recording, null, { jobs: 'one job' }).join('\n')).toContain(
      'has no `jobs` list',
    );
    expect(budgetErrors(workflow, recording, null, { jobs: [] }).join('\n')).toContain(
      'declares no job',
    );
  });

  it('does not pretend to compute a deadline from bounds that no run has spent', () => {
    // Cannot produce: the `before` that `R5` needs. Every step of a new job is
    // unmeasured, so the arithmetic has no terms; this case holds that `R9` says nothing
    // about expiring, and that the first refresh is where `R4`/`R5` settle the numbers.
    const errors = budgetErrors(splitWorkflow(), splitRecording(), null, jobDeclarationOf());
    expect(errors).toEqual([]);
    expect(errors.join('\n')).not.toContain('expires');
    expect(errors.join('\n')).not.toContain('deadline');
  });

  it('names the waiting jobs in the summary, and reads the two kinds of promise apart', () => {
    // Cannot produce: a green run that ends the waiting. The summary is about the tree as
    // it stands, and a tree with a promise is a tree no finished run has described.
    const workflow = splitWorkflow();
    const recording = splitRecording();
    expect(budgetSummary(workflow, recording, null, jobDeclarationOf())).toContain(
      '1 job(s) declared and awaiting their first run: batteries-heavy',
    );
    const parsed = readDeclarations(workflow, {
      declared: [declarationOf({ job: 'batteries', step: 'Slow battery', minutes: 12 })],
      jobs: [jobPromiseOf()],
    });
    expect(parsed.errors).toEqual([]);
    expect([...parsed.declared.keys()]).toEqual(['batteries']);
    expect([...parsed.jobs.keys()]).toEqual(['batteries-heavy']);
  });

  it('every case about a job promise says which failure shape its fixture cannot produce', () => {
    // Cannot produce: a runner that actually spends the promised budget. This case reads
    // the source of the block rather than running a workflow, so what it holds is that
    // no case was added without naming the limit of its own apparatus.
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const block = source.slice(source.indexOf("describe('a job the recording has never measured'"));
    const cases = (block.match(/\n  it\('/g) ?? []).length;
    // Only comment lines beginning with the mark count. A bare substring search also
    // finds this case's own pattern and its prose, and a self-counting assertion would
    // pass with one fewer real statement than cases -- the hollow witness this block is
    // about. The mark is assembled so the pattern itself is not such a line either.
    const mark = ['Cannot', 'produce:'].join(' ');
    const limits = (block.match(new RegExp('^\\s*// ' + mark, 'gm')) ?? []).length;
    expect(cases).toBeGreaterThan(10);
    expect(limits).toBe(cases);
  });
});

describe('the recorder and a declared job', () => {
  it('leaves the gap open when a declared job never ran, and says it is still waiting', async () => {
    // Cannot produce: a run in which GitHub scheduled the job. The server answers with
    // one job and the declaration says the other is waiting, so the recording must keep
    // the hole rather than fill it with a borrowed or invented number.
    const result = await withApi(
      (url) => {
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/21') {
          return { status: 200, body: { head_sha: 'd00dd00d', updated_at: '2026-11-06T10:00:00Z' } };
        }
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/21/jobs?per_page=100') {
          return { status: 200, body: { jobs: [API_JOBS.jobs[0]] } };
        }
        return null;
      },
      async (env) => {
        const path = env['RCA_CI_DECLARATIONS'] as string;
        writeFileSync(path, JSON.stringify(jobDeclarationOf()));
        const out = await runRecorder(['21'], env);
        return { out, written: JSON.parse(readFileSync(env['RCA_CI_OUT'] as string, 'utf8')) };
      },
    );
    expect(result.out.status).toBe(0);
    expect(result.out.stdout).toContain('1 job declaration(s) still awaiting their first run');
    expect(Object.keys(result.written.jobs)).toEqual(['batteries']);
    expect(result.written.derived).toBeUndefined();
  });

  it('records a declared job once its first run reports it, and says the promise can be deleted', async () => {
    // Cannot produce: the wall-clock cost of that first run. The API answer carries
    // timestamps, not a runner; what is held is that the promise becomes an ordinary
    // measurement and the file is left for the round to delete.
    const result = await withApi(
      (url) => {
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/22') {
          return { status: 200, body: { head_sha: 'f00df00d', updated_at: '2026-11-06T11:00:00Z' } };
        }
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/22/jobs?per_page=100') {
          return { status: 200, body: API_JOBS };
        }
        return null;
      },
      async (env) => {
        const path = env['RCA_CI_DECLARATIONS'] as string;
        writeFileSync(path, JSON.stringify(jobDeclarationOf()));
        const out = await runRecorder(['22'], env);
        return { out, written: JSON.parse(readFileSync(env['RCA_CI_OUT'] as string, 'utf8')), path };
      },
    );
    expect(result.out.status).toBe(0);
    expect(result.out.stdout).toContain('1 job declaration(s) are now measured and can be deleted');
    expect(Object.keys(result.written.jobs)).toEqual(['batteries', 'batteries-heavy']);
    expect(readFileSync(result.path, 'utf8')).toContain('batteries-heavy');
  });

  it('refuses to borrow a declared job, because a borrow is not a run', async () => {
    // Cannot produce: the first run of the declared job. A borrow would put its id in the
    // recording without that run, so `R9` would expire the promise against a number that
    // came from a different job -- the hole `R6` already refuses one level down.
    const result = await withApi(
      (url) => {
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/23') {
          return { status: 200, body: { head_sha: 'c0dec0de', updated_at: '2026-11-06T12:00:00Z' } };
        }
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/23/jobs?per_page=100') {
          return { status: 200, body: { jobs: [API_JOBS.jobs[0]] } };
        }
        return null;
      },
      async (env) => {
        writeFileSync(env['RCA_CI_DECLARATIONS'] as string, JSON.stringify(jobDeclarationOf()));
        return runRecorder(['23', '--borrow', 'batteries-heavy=batteries'], env);
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('names a declared job');
    expect(result.stderr).toContain('a borrow is not a run');
    expect(result.stdout).toBe('');
  });
});
