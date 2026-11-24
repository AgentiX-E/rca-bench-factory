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
  PREFIX_MINUTES,
  WHY_LENGTH,
  allowanceSecondsOf,
  boundsSecondsOf,
  budgetErrors,
  budgetSummary,
  ceilingNeedOf,
  commandOf,
  jobDays,
  jobsOf,
  ledgerErrors,
  prefixOf,
  readDeclarations,
  readReadings,
  readingsOfCommand,
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

/**
 * One job of a fixture workflow: an id, its label, its budget, and its steps.
 *
 * `minutes` has three states, and the difference between the last two is the whole
 * subject of the population cases below: omitted means the default thirty, `null`
 * means the job declares no budget at all, so a step that declares none of its own is
 * reached by nothing.
 */
interface FixtureJob {
  id: string;
  minutes?: number | null;
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
    // A job that declares nothing states nothing: writing `timeout-minutes: null`
    // would be a bound whose value is the word "null", which is a different workflow.
    if (job.minutes !== null) lines.push(`    timeout-minutes: ${String(job.minutes ?? 30)}`);
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

/**
 * A step whose budget is its own.
 *
 * The default command carries the step's name because `R10` keys a series by the
 * command: two fixture steps that shared one command string would share one series, and
 * a case about a bound would then be answered by an unrelated step's seconds.
 */
function step(
  name: string,
  minutes: number,
  command = `node scripts/inject-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.mjs`,
): string[] {
  return [`      - name: ${name}`, `        timeout-minutes: ${String(minutes)}`, `        run: ${command}`];
}

/** A step that inherits the job's budget, which is the shape this module refuses. */
function inherited(
  name: string,
  command = `node scripts/inject-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.mjs`,
): string[] {
  return [`      - name: ${name}`, `        run: ${command}`];
}

/**
 * A recording, keyed by job id, as `measure-ci-baseline.mjs` writes it.
 *
 * The seconds are given per job because that is the unit the rules work in: a bound is
 * arithmetic inside one job, and a job that was never measured cannot be argued about.
 */
function recordingOf(
  jobs: Record<string, { minutes?: number | null; total?: number | null; steps: Record<string, number> }>,
  over: Record<string, unknown> = {},
) {
  const recorded: Record<string, unknown> = {};
  for (const [id, job] of Object.entries(jobs)) {
    const measured = Object.values(job.steps).reduce((all, one) => all + one, 0);
    // `'minutes' in job` rather than `?? 30`: a job that declared no ceiling is a shape
    // `R6` distinguishes from one that declared thirty, and `??` would turn the first
    // into the second and let the case pass for the wrong reason.
    const record: Record<string, unknown> = {
      name: id,
      timeoutMinutes: 'minutes' in job ? job.minutes ?? null : 30,
      steps: job.steps,
    };
    // The job's own wall clock, which the recorder writes beside the steps since v3.129:
    // four seconds more than its steps unless the case is about the difference (`R13`).
    const total = 'total' in job ? job.total : measured + 4;
    if (total !== null) record.total = total;
    recorded[id] = record;
  }
  return {
    run: 41637098008,
    commit: 'a'.repeat(40),
    measured: '2026-11-03',
    jobs: recorded,
    ...over,
  };
}

/**
 * The history `R10` reads, built from one recording of one workflow.
 *
 * The commands come from the workflow rather than from the recording, because that is
 * how the recorder writes them: it reads the tree it is about to measure, and a fixture
 * that invented a command string would describe a series no step belongs to.
 */
function readingsOf(
  workflow: { steps: unknown[] },
  recording: { run: number; commit: string; measured: string; jobs: Record<string, { steps: Record<string, number> }> },
  over: Record<string, unknown> = {},
) {
  const jobs: Record<string, Record<string, { seconds: number; command: string }>> = {};
  for (const job of jobsOf(workflow)) {
    const record = recording.jobs[job.id];
    if (record === undefined) continue;
    const byStep: Record<string, { seconds: number; command: string }> = {};
    for (const one of stepsOf(workflow, job.id)) {
      const seconds = record.steps[one.name];
      if (typeof seconds !== 'number') continue;
      byStep[one.name] = { seconds, command: commandOf(one) };
    }
    jobs[job.id] = byStep;
  }
  return {
    readings: [
      {
        run: recording.run,
        commit: recording.commit,
        measured: recording.measured,
        jobs,
        ...over,
      },
    ],
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

  it('reads a step that inherits the job budget as bound by the job, and not by nothing', () => {
    const workflow = oneJob([...inherited('Slow battery')]);
    const [only] = stepsOf(workflow, 'batteries');
    // The field is called `inheritedFrom`, and it said `null` for a step that inherits
    // the job's budget: a step reached by a number was filed with the steps reached by
    // none, so the summary could not tell the two apart and printed them as one.
    expect(only.inheritedFrom).toBe('job');
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

  it('bounds a work step by twice its own day, and no longer asks it for the floor', () => {
    // Two minutes for a 46 s step is accepted as of v3.132 (finding 622). The floor's
    // argument -- a cold package index, a missed cache, a first build -- was right and its
    // *unit* was wrong: a runner is cold once, in the prefix, and that is where the floor is
    // still asked for. What a work step owes instead is the multiple, which is the number
    // that decides whether it dies at its own bound or at the job's.
    const workflow = oneJob([...step('Quick battery', 2)]);
    expect(budgetErrors(workflow, recordingOf({ batteries: { steps: { 'Quick battery': 46 } } }))).toEqual([]);
  });

  it('refuses a work step under twice its own day, whatever the floor would have said', () => {
    const workflow = oneJob([...step('Quick battery', 1)]);
    const errors = budgetErrors(workflow, recordingOf({ batteries: { steps: { 'Quick battery': 46 } } })).join('\n');
    expect(errors).toContain(`the bound is under ${String(MULTIPLE)} times the measurement`);
  });

  /** A two-job workflow whose first step both jobs share, which is what makes it a prefix. */
  function sharingPrefix(firstStep: string[]) {
    return workflowOf([
      { id: 'batteries', minutes: 30, steps: [...firstStep, ...step('Slow battery', 20)] },
      { id: 'batteries-heavy', minutes: 30, steps: [...firstStep, ...step('Heavy battery', 24)] },
    ]);
  }

  /** The two jobs of the fixture, each with the seconds its steps spent. */
  function sharingRecord() {
    return recordingOf({
      batteries: { minutes: 30, steps: { 'Check out': 2, 'Slow battery': 600 } },
      'batteries-heavy': { minutes: 30, steps: { 'Check out': 2, 'Heavy battery': 700 } },
    });
  }

  it('holds the ceiling to the prefix allowance as well as the bounds', () => {
    // Eighteen seconds short of the sum is still short: the four setup steps share three
    // minutes, and a ceiling that holds every step bound and not that allowance is a ceiling
    // that fires before the number it granted (finding 622). Measured: without the allowance
    // in `R13`'s term this tree is green, which is the shape a rule with no case leaves.
    const tight = workflowOf([
      { id: 'batteries', minutes: 30, steps: [...['      - name: Check out', '        uses: actions/checkout@v4'], ...step('Slow battery', 29)] },
      { id: 'batteries-heavy', minutes: 30, steps: [...['      - name: Check out', '        uses: actions/checkout@v4'], ...step('Heavy battery', 29, 'node scripts/heavy.mjs')] },
    ]);
    const errors = budgetErrors(
      tight,
      recordingOf({
        batteries: { minutes: 30, steps: { 'Check out': 2, 'Slow battery': 600 } },
        'batteries-heavy': { minutes: 30, steps: { 'Check out': 2, 'Heavy battery': 600 } },
      }),
    ).join('\n');
    expect(errors).toContain('the 3-minute allowance for its 1-step prefix');
    expect(errors).toContain('raise the ceiling to 33 min');
  });

  it('refuses a step the whole workflow shares for declaring a bound of its own', () => {
    // The shape this round removed sixteen times over: four setup steps at the floor look
    // like four arguments and are one number stated four times.
    const workflow = sharingPrefix([
      '      - name: Check out',
      '        timeout-minutes: 3',
      '        uses: actions/checkout@v4',
    ]);
    const errors = budgetErrors(workflow, sharingRecord()).join('\n');
    expect(errors).toContain('is a prefix step');
    expect(errors).toContain(`one allowance of ${String(PREFIX_MINUTES)} min per job`);
  });

  it('accepts that step with no bound, and gives the job one allowance instead', () => {
    const workflow = sharingPrefix(['      - name: Check out', '        uses: actions/checkout@v4']);
    expect(budgetErrors(workflow, sharingRecord())).toEqual([]);
    expect(prefixOf(workflow, 'batteries')).toEqual(['Check out']);
    expect(allowanceSecondsOf(workflow, 'batteries')).toBe(PREFIX_MINUTES * 60);
  });

  it('gives no allowance to a step the second job does not share, so work is never setup', () => {
    // A name is not a claim: both jobs call it `Check out` and run different commands, so
    // nothing is shared and the step is the job's own work, which owes its own bound.
    const workflow = workflowOf([
      {
        id: 'batteries',
        minutes: 30,
        steps: [...step('Check out', 12, 'node scripts/check-out-one.mjs'), ...step('Slow battery', 12)],
      },
      {
        id: 'batteries-heavy',
        minutes: 30,
        steps: [...step('Check out', 16, 'node scripts/check-out-two.mjs'), ...step('Heavy battery', 16)],
      },
    ]);
    expect(prefixOf(workflow, 'batteries')).toEqual([]);
    expect(allowanceSecondsOf(workflow, 'batteries')).toBe(0);
  });

  it('gives no allowance to a workflow of one job, because nothing is common with nothing', () => {
    expect(prefixOf(oneJob([...step('Only one', 12)]), 'batteries')).toEqual([]);
  });

  it('stops the prefix where the shortest job stops, because shared means shared by all', () => {
    // `backend` in the shipped workflow is this shape: it runs no `Install the shells` step,
    // so it shares four setup steps with the other seven and stops where they continue. A
    // rule that handed it the workflow\'s five would be excusing a step it never shares.
    const workflow = workflowOf([
      {
        id: 'verify',
        minutes: 40,
        steps: [...inherited('Check out'), ...inherited('Set up pnpm'), ...step('Lint', 20)],
      },
      {
        id: 'backend',
        minutes: 40,
        steps: [...inherited('Check out'), ...step('Install a backend', 30)],
      },
      {
        id: 'artefacts',
        minutes: 15,
        steps: [...inherited('Check out'), ...inherited('Set up pnpm'), ...inherited('Guards')],
      },
    ]);
    // One divergent job caps the prefix for every job, which is how `backend` caps the
    // shipped workflow's at four: what every job runs identically ends where any of them
    // stops running it.
    expect(prefixOf(workflow, 'verify')).toEqual(['Check out']);
    expect(prefixOf(workflow, 'backend')).toEqual(['Check out']);
    expect(prefixOf(workflow, 'artefacts')).toEqual(['Check out']);
    expect(allowanceSecondsOf(workflow, 'backend')).toBe(PREFIX_MINUTES * 60);

    // And the same three jobs with the divergence one step later share two, so the cap is a
    // measurement of the workflow rather than a constant.
    const deeper = workflowOf([
      { id: 'verify', minutes: 40, steps: [...inherited('Check out'), ...inherited('Set up pnpm'), ...step('Lint', 20)] },
      { id: 'backend', minutes: 40, steps: [...inherited('Check out'), ...inherited('Set up pnpm'), ...step('Install a backend', 30)] },
      { id: 'artefacts', minutes: 15, steps: [...inherited('Check out'), ...inherited('Set up pnpm'), ...inherited('Guards')] },
    ]);
    expect(prefixOf(deeper, 'artefacts')).toEqual(['Check out', 'Set up pnpm']);
  });

  it('refuses a prefix step through the gate, not only inside a function', () => {
    // The shipped fixture is read and one bound put back on one prefix step: the rule has to
    // be reachable from a run, because a rule that only a test can reach is the defect this
    // corpus records as `a gate with no test` (finding 622).
    const workflow = readWorkflow(
      readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'),
    );
    const first = workflow.steps.find((one) => one.job === 'verify');
    expect(first?.name).toBe('Check out');
    const patched = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8').replace(
      '      - name: Check out\n        uses: actions/checkout@v4',
      '      - name: Check out\n        timeout-minutes: 3\n        uses: actions/checkout@v4',
    );
    const dir = mkdtempSync(join(tmpdir(), 'rca-ci-prefix-'));
    const path = join(dir, 'ci.yml');
    writeFileSync(path, patched);
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_WORKFLOW: path },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is a prefix step');
  });

  it('refuses a job whose bounds add up to more than its ceiling', () => {
    // `R5`'s subject, asked of the sum rather than one bound at a time (finding 619). Both
    // bounds are fine on their own -- 27 min for 800 s, 20 for 383 -- and the job's thirty
    // minutes cannot hold them together: **47** minutes of bound, and a day that spent a
    // third of each reached the ceiling with both still inside their own.
    const workflow = oneJob([...step('Earlier battery', 27), ...step('Slow battery', 20)]);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { 'Earlier battery': 800, 'Slow battery': 383 } } }),
    ).join('\n');
    expect(errors).toContain('the bounds inside it add up to 47 min in 2 step(s)');
    expect(errors).toContain('raise the ceiling to 48 min, or split the job');
  });

  it('accepts the same bounds under a ceiling that holds them, whatever their order', () => {
    // What replaced `R5`: the position of a bound inside its job is not a question of its
    // own, because the sum is order-free and a bound dies at its own number. Four bounds of
    // 58 minutes are refused under thirty and accepted under sixty.
    const steps = [
      ...step('First battery', 15),
      ...step('Second battery', 15),
      ...step('Third battery', 15),
      ...step('Slow battery', 13),
    ];
    const recording = recordingOf({
      batteries: {
        steps: {
          'First battery': 400,
          'Second battery': 400,
          'Third battery': 400,
          'Slow battery': 383,
        },
      },
    });
    const tight = budgetErrors(oneJob(steps, 30), recording).join('\n');
    expect(tight).toContain('the bounds inside it add up to 58 min in 4 step(s)');
    expect(budgetErrors(oneJob(steps, 60), recording)).toEqual([]);
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

  it('refuses a ceiling that does not hold twice the job\'s slowest day, and names that day', () => {
    // The rule that refused every narrower ceiling until v3.132 is gone (finding 622), and
    // what is left is the arithmetic it was standing in for: a ceiling narrower than twice
    // the slowest day this repository has met refuses a day it has already seen. `R13` says
    // it once, with the two numbers, instead of asking for a re-measurement.
    const workflow = oneJob([...inherited('One long step')], 30);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { minutes: 45, steps: { 'One long step': 1000 } } }),
    ).join('\n');
    expect(errors).toContain(`the ceiling is under ${String(MULTIPLE)} times that day`);
    expect(errors).toContain('1000 s');
  });

  it('takes a recording with no ceiling as a narrowing, and prints it beside the widenings', () => {
    // A job that had no ceiling had six hours of room, so declaring thirty is a narrowing
    // in the only sense this module has. It is no longer refused -- the recording's own day
    // answers the question a re-measurement was being asked for -- and it is printed,
    // because a ceiling that moves is a claim a reader has to be able to see.
    const workflow = oneJob([...inherited('One short step')], 30);
    const record = recordingOf({ batteries: { minutes: null as unknown as number, steps: { 'One short step': 60 } } });
    expect(budgetErrors(workflow, record)).toEqual([]);
    expect(budgetSummary(workflow, record)).toContain('ceiling(s) narrowed under the recording');
  });

  it('accepts a recording taken under a tighter budget, and says the budget was widened', () => {
    // The other direction is safe and does not need a run: the step bounds are the same
    // numbers, and `R5`'s deadline only gets more room, so a reading taken inside 20
    // minutes still describes every command inside 34. Refusing it would close the same
    // circle `R9` exists to open -- a ceiling can only be changed by a run, and a run
    // happens after the push that this gate has to pass. Cannot produce: a job that
    // actually spent 34 -- widening a ceiling changes nothing about what ran.
    const workflow = oneJob([...step('One battery', 3)], 45);
    const summary = budgetSummary(
      workflow,
      recordingOf({ batteries: { minutes: 30, steps: { 'One battery': 10 } } }),
    );
    expect(
      budgetErrors(workflow, recordingOf({ batteries: { minutes: 30, steps: { 'One battery': 10 } } })),
    ).toEqual([]);
    expect(summary).toContain('widened');
    expect(summary).toContain('batteries 30 -> 45');
  });

  it('accepts a budget that was removed, because no ceiling is the widest one', () => {
    // Cannot produce: a run of a job with no ceiling at all -- the reader can only see
    // that the workflow stopped declaring one, and every bound it kept is unchanged.
    const workflow = oneJob([...step('One battery', 3)], null);
    expect(
      budgetErrors(workflow, recordingOf({ batteries: { minutes: 30, steps: { 'One battery': 10 } } })),
    ).toEqual([]);
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

  it('counts a declared bound in the job\'s sum, because the run will enforce it', () => {
    // The step has no measurement and its bound is still real: a job whose other bounds
    // already fill the ceiling does not gain room from the step never having run. `R8`'s
    // share of `R5` used to be a deadline computed from the steps in front of it; it is the
    // sum now, and the declaration's number stands in it like any other.
    const workflow = oneJob([...step('Slow battery', 10), ...step('Quick battery', 6)], 15);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { minutes: 15, steps: { 'Slow battery': 300 } } }),
      null,
      { declared: [declarationOf({ minutes: 6 })] },
    ).join('\n');
    expect(errors).toContain('the bounds inside it add up to 16 min in 2 step(s)');
    expect(errors).toContain('raise the ceiling to 17 min, or split the job');
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
    expect(declared).toContain('2 of 2 step(s) carry their own `timeout-minutes`');
    expect(declared).toContain('1 step(s) declared and awaiting the run that measures them');
    expect(declared).toContain('batteries / Quick battery');
    expect(budgetSummary(workflow, recording)).toContain('no step is declared unmeasured');
  });

  /**
   * A bound reaches a step one of two ways, and one way of none.
   *
   * The summary used to say `62 of 83 step(s) bounded`, and 62 was the count of steps
   * that **declare** a `timeout-minutes` of their own. The other 21 are bounded by their
   * job's budget, so the sentence read as though 21 steps were unbounded when the tree
   * had none. It is the shape this audit keeps finding -- a number that is right and a
   * noun that is wider than the number -- and here it was produced by a field: a step
   * that inherits the job's budget carried `inheritedFrom: null`, the same value a step
   * reached by nothing carries, so the two populations were one population downstream.
   *
   * Three numbers rather than two, because the question a reader asks of the line is
   * "is anything unbounded", and a summary that answers it by arithmetic leaves the
   * reader to do the arithmetic.
   */
  describe('the two populations of a bound', () => {
    it('counts the steps a job bounds apart from the steps that bound themselves', () => {
      const workflow = workflowOf([
        { id: 'batteries', minutes: 30, steps: [...step('Own one', 12), ...step('Own two', 12)] },
        { id: 'artefacts', minutes: 15, steps: [...inherited('Carried by the job')] },
      ]);
      const recording = recordingOf({
        batteries: { minutes: 30, steps: { 'Own one': 60, 'Own two': 60 } },
        artefacts: { minutes: 15, steps: { 'Carried by the job': 60 } },
      });
      const summary = budgetSummary(workflow, recording);
      expect(summary).toContain('2 of 3 step(s) carry their own `timeout-minutes`');
      expect(summary).toContain('1 is bounded by its job');
      expect(summary).toContain('0 have none');
    });

    it('counts a step no budget reaches rather than folding it in with the inherited ones', () => {
      const workflow = workflowOf([
        { id: 'batteries', minutes: 30, steps: [...step('Own one', 12)] },
        { id: 'artefacts', minutes: null, steps: [...inherited('Reached by nothing')] },
      ]);
      const recording = recordingOf({
        batteries: { minutes: 30, steps: { 'Own one': 60 } },
        artefacts: { minutes: null, steps: { 'Reached by nothing': 60 } },
      });
      const summary = budgetSummary(workflow, recording);
      expect(summary).toContain('1 of 2 step(s) carry their own `timeout-minutes`');
      expect(summary).toContain('0 are bounded by their jobs');
      expect(summary).toContain('1 has none');
    });

    it('says nothing is tight when no step carries a bound, instead of naming an empty one', () => {
      // The tightest bound is a ratio, and a workflow with no own bounds has no ratio to
      // report. The first version printed `tightest  at unmeasuredx` -- a sentence whose
      // subject is empty and whose unit has no number, which is the shape a reader skips.
      const workflow = oneJob([...inherited('Carried one'), ...inherited('Carried two')], 30);
      const recording = recordingOf({
        batteries: { minutes: 30, steps: { 'Carried one': 60, 'Carried two': 60 } },
      });
      const summary = budgetSummary(workflow, recording);
      expect(summary).toContain('no step carries a bound of its own, so nothing here is tight');
      expect(summary).not.toContain('unmeasuredx');
      expect(summary).not.toContain('tightest  at');
    });

    it('agrees with the workflow this tree ships, counting the populations itself', () => {
      // Derived on both sides: the numbers come from the workflow through this file's own
      // reading, and the sentence comes from the module. A step added to `ci.yml` moves
      // both, and a summary that stopped counting one population would disagree here
      // without any number in this file having to be edited.
      const workflow = readWorkflow(readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'));
      const baseline = JSON.parse(readFileSync(join(ROOT, 'golden-master', 'ci-baseline.json'), 'utf8'));
      let own = 0;
      let carried = 0;
      let reached = 0;
      let allowed = 0;
      for (const job of jobsOf(workflow)) {
        for (const step of stepsOf(workflow, job.id)) {
          if (step.inheritedFrom === 'step') own += 1;
          else if (step.inheritedFrom === 'prefix') allowed += 1;
          else if (step.inheritedFrom === 'job') carried += 1;
          else reached += 1;
        }
      }
      const summary = budgetSummary(workflow, baseline);
      expect(own + allowed + carried + reached).toBe(workflow.steps.length);
      expect(summary).toContain(
        `${String(own)} of ${String(workflow.steps.length)} step(s) carry their own \`timeout-minutes\``,
      );
      expect(summary).toContain(`${String(carried)} are bounded by their jobs`);
      expect(summary).toContain(`${String(reached)} have none`);
      // The fourth population is the round's whole subject, and it is asserted where the other
      // three are: 32 of this workflow's steps run before the first real step of their job, and
      // one allowance answers for all of them (finding 622).
      expect(allowed).toBeGreaterThan(0);
      expect(summary).toContain(`${String(allowed)} run before the job's first real step`);
    });
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
    // The history this fixture's bounds are argued from, which is one reading of the
    // fixture's own run: `R10` refuses a history whose newest entry is not the recording,
    // and a case about a declaration should not depend on which run the tree last met.
    const readingsPath = join(dir, 'readings.json');
    writeFileSync(
      readingsPath,
      JSON.stringify(
        readingsOf(workflowOf([
          { id: 'batteries', minutes: 25, steps: [...step('Slow battery', 12), ...step('Quick battery', 3)] },
        ]), recordingOf({ batteries: { minutes: 25, steps: { 'Slow battery': 351 } } })),
      ),
    );
    const ledger = join(dir, 'volumes');
    mkdirSync(ledger);
    // The log ends the way `R11` asks it to: this case is about the declarations file, and a
    // fixture that failed the round rule would be answering a question it did not ask.
    writeFileSync(
      join(ledger, 'volume-01.md'),
      '## v0.1\n\n> Ledger for `v0.1`.\n\n| CI | run `41637098008` on `abc1234`: **1 of 1 job success** |\n',
    );
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: {
        ...process.env,
        RCA_CI_WORKFLOW: workflow,
        RCA_CI_BASELINE: recording,
        RCA_CI_DECLARATIONS: declared,
        RCA_CI_LEDGER: ledger,
        RCA_CI_READINGS: readingsPath,
      },
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('check-ci-budget: OK');
    // The distance is printed on the green line: a row that exists states an id, and nothing
    // in an id says whether it was written this week or 65 rounds ago. The noun is printed in
    // this state too, `0` included (finding 623): the first version printed `in the newest
    // round` here, which reads better and took the noun out of the census's reach in exactly
    // the round that caught the ledger up.
    expect(result.stdout).toContain(', 0 round(s) before `v0.1`');
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

/**
 * A volume holding the sections this case wrote, with the rows each one carries.
 *
 * Written as text and read by the shipped reader rather than assembled as an object,
 * because the rule under test is about *where* a row sits: a fixture that built the
 * section index by hand could agree with the rule about a structure the parser never
 * produces, and the two would then be wrong together.
 */
function volumeOf(sections: { head: string; rows?: string[] }[]): string {
  return sections
    .map((one) =>
      [
        `## ${one.head}`,
        '',
        `> Ledger for \`${one.head.split(' ')[0]}\`.`,
        '',
        ...(one.rows ?? []),
        '',
      ].join('\n'),
    )
    .join('\n');
}

function ledgerFrom(sections: { head: string; rows?: string[] }[], name = 'volume-01.md') {
  const dir = mkdtempSync(join(tmpdir(), 'rca-ci-round-'));
  writeFileSync(join(dir, name), volumeOf(sections));
  return readLedger(dir);
}

/** A closing reading in the form `R11` asks for, citing the run this fixture's recording holds. */
const CLOSING = '| CI | run `41637098008` on `abc1234`: **1 of 1 job success** -- 2 min |';

describe('the round the ledger ends on', () => {
  it('refuses a newest round that ends without a closing reading, and counts the rounds since', () => {
    // The defect, measured: the shipped log's newest `| CI |` row sat under `v3.54` while the
    // newest round was `v3.119` -- 65 rounds later. `R7` compares the recording with that row,
    // so a recording from any run newer than a 65-round-old one passed, and the staleness of
    // the recording was invisible for as long as the log stayed unwritten.
    const ledger = ledgerFrom([
      { head: 'v0.1 — first', rows: [CLOSING] },
      { head: 'v0.2 — second' },
      { head: 'v0.3 — third' },
    ]);
    const errors = ledgerErrors(
      recordingOf({ batteries: { steps: { 'One battery': 351 } } }),
      ledger,
    ).join('\n');
    expect(errors).toContain('the newest round (`v0.3`');
    expect(errors).toContain('has no closing reading that names a run');
    expect(errors).toContain('2 round(s) back');
  });

  it('accepts a newest round whose closing reading states the run and the tally', () => {
    const workflow = oneJob([...step('One battery', 12)]);
    const ledger = ledgerFrom([
      { head: 'v0.1 — first' },
      { head: 'v0.2 — second', rows: [CLOSING] },
    ]);
    expect(ledgerErrors(recordingOf({ batteries: { steps: { 'One battery': 351 } } }), ledger)).toEqual(
      [],
    );
    // The tally's `1 of 1` is read against this workflow's own job count, so the case says
    // the two agree rather than assuming a fixture with one job is one job.
    expect(jobsOf(workflow)).toHaveLength(1);
  });

  it('prints round(s) in both ledger states, so the census finds the noun wherever the row sits', () => {
    // Finding 623: the sentence said `, in the newest round` when the row sat in it, which
    // reads better and made this gate's printing of `round(s)` depend on the state of the
    // ledger. The census recorded the gate as a printer of the noun in the round that caught
    // the ledger up, and refused the same tree one round later when the phrase changed and the
    // noun went with it -- finding 618 one level down, where the key moved and the judgement
    // stopped being about anything. `0` says the same thing with the number the census reads.
    const workflow = oneJob([...step('One battery', 12)]);
    const recording = recordingOf({ batteries: { steps: { 'One battery': 351 } } });
    const atNewest = ledgerFrom([{ head: 'v0.1 — first', rows: [CLOSING] }]);
    const behind = ledgerFrom([
      { head: 'v0.1 — first', rows: [CLOSING] },
      { head: 'v0.2 — second' },
    ]);
    expect(budgetSummary(workflow, recording, atNewest)).toContain('0 round(s) before `v0.1`');
    expect(budgetSummary(workflow, recording, behind)).toContain('1 round(s) before `v0.2`');
  });

  it('refuses a row that sits in the newest round and names no run', () => {
    // The difference between "the round wrote a row" and "the round wrote a row about a run":
    // a row without an id is a sentence about a job count, and `R7` has nothing to compare.
    const ledger = ledgerFrom([
      { head: 'v0.1 — first', rows: ['| CI | **five jobs green** on the fourth push |'] },
    ]);
    const errors = ledgerErrors(
      recordingOf({ batteries: { steps: { 'One battery': 351 } } }),
      ledger,
    ).join('\n');
    expect(errors).toContain('has no closing reading that names a run');
  });

  it('refuses a closing reading that states no tally of jobs', () => {
    // A run id with no verdict: the row says a run happened and not what it found, which is
    // how an `Anchor round trip` run was reported as a CI run with eight jobs last round.
    const ledger = ledgerFrom([
      { head: 'v0.1 — first', rows: ['| CI | run `41637098008` on `abc1234`: all green -- 2 min |'] },
    ]);
    const errors = ledgerErrors(
      recordingOf({ batteries: { steps: { 'One battery': 351 } } }),
      ledger,
    ).join('\n');
    expect(errors).toContain('states no tally of jobs');
  });

  it('refuses a tally that counts a different number of jobs than the workflow declares', () => {
    const workflow = workflowOf([
      { id: 'batteries', steps: [...step('One battery', 12)] },
      { id: 'verify', steps: [...step('One test', 5)] },
    ]);
    const ledger = ledgerFrom([{ head: 'v0.1 — first', rows: [CLOSING] }]);
    const errors = ledgerErrors(
      recordingOf({ batteries: { steps: { 'One battery': 351 } } }),
      ledger,
      workflow,
    ).join('\n');
    expect(errors).toContain('reports **1 job(s)**');
    expect(errors).toContain('and `ci.yml` declares **2**');
  });

  it('refuses a tally whose successes fall short of the jobs it counts', () => {
    // A closing reading is a green run. A row that states `**1 of 2 jobs success**` is a row
    // reporting a red job beside the word "success", and a round cannot close on one.
    const workflow = workflowOf([
      { id: 'batteries', steps: [...step('One battery', 12)] },
      { id: 'verify', steps: [...step('One test', 5)] },
    ]);
    const ledger = ledgerFrom([
      { head: 'v0.1 — first', rows: ['| CI | run `41637098008` on `abc1234`: **1 of 2 jobs success** |'] },
    ]);
    const errors = ledgerErrors(
      recordingOf({ batteries: { steps: { 'One battery': 351 } } }),
      ledger,
      workflow,
    ).join('\n');
    expect(errors).toContain('closes a round on a red run');
  });

  it('says nothing about the round when the caller offered no sections', () => {
    // The same convention `R7` follows: a caller that did not pass a section index has not
    // asked the question, and a rule that answered "fine" would be a rule that passed for
    // the wrong reason.
    const errors = ledgerErrors(
      recordingOf({ batteries: { steps: { 'One battery': 351 } } }),
      ledgerFixture(),
    ).join('\n');
    expect(errors).not.toContain('closing reading');
  });

  it('refuses through the gate, with the round named, rather than only inside a function', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rca-ci-round-gate-'));
    writeFileSync(
      join(dir, 'volume-01.md'),
      '## v0.1 — a round\n\n> Ledger for `v0.1`.\n\n| item | value |\n',
    );
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_LEDGER: dir },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('check-ci-budget: FAILED');
    expect(result.stderr).toContain('has no closing reading that names a run');
    expect(result.stderr).toContain('no round before it has one either');
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
    expect(summary).toContain('2 of 2 step(s) carry their own `timeout-minutes`');
    expect(summary).toContain('0 are bounded by their jobs');
    expect(summary).toContain('0 have none');
    expect(summary).toContain('6 min measured');
    expect(summary).toContain('as of run 41637098008');
    // The workflow-wide sum now says how many denominators it has (finding 604): `bounds total
    // 327 min` beside `51 min measured` invites a division, and the division is over eight
    // different ceilings rather than over one.
    expect(summary).toContain('bounds total 15 min in 1 ceiling(s)');
    // And the ceiling gets its own reading: how many hold the bounds inside them (finding
    // 619), and the one with the least room above a day -- the job a slow day would kill at
    // the ceiling first, which is the comparison that decides whether a bound can fire.
    expect(summary).toContain(
      '1 of 1 ceiling(s) hold the bounds inside them and 0 hold twice a day; the least room above a ' +
        'day is batteries at 30 min, 5.1x its slowest day of 355 s (run 41637098008)',
    );
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
    // And the spread of the tightest bound's command reaches the reader of a green run: the
    // shape is asserted rather than the numbers, because the numbers move every time a run is
    // recorded and the clause is what this round added (`O-109`).
    expect(result.stdout).toMatch(
      /that command (runs from \d+ s to \d+ s|has been read once)|every reading of that command is the same/,
    );
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

  it('spends the floor once per job, and states that in one place', () => {
    const workflow = readWorkflow(readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'));
    const baseline = JSON.parse(readFileSync(join(ROOT, 'golden-master', 'ci-baseline.json'), 'utf8'));
    // The declarations are read the way the gate reads them: absent is the normal state,
    // and whether this tree has one is the previous case's business.
    const declarations = existsSync(DECLARATIONS) ? JSON.parse(readFileSync(DECLARATIONS, 'utf8')) : null;
    expect(budgetErrors(workflow, baseline, readLedger(), declarations)).toEqual([]);
    for (const job of jobsOf(workflow)) {
      const prefix = prefixOf(workflow, job.id);
      // The floor is a number the *job* holds, and the workflow spends it once: every step of
      // the prefix is unbounded by its own YAML and answered for by `PREFIX_MINUTES`, and no
      // step that carries a bound of its own is below the workflow's one-minute granularity.
      expect(allowanceSecondsOf(workflow, job.id)).toBe(prefix.length === 0 ? 0 : PREFIX_MINUTES * 60);
      for (const step of stepsOf(workflow, job.id)) {
        if (step.inPrefix) expect(step.inheritedFrom).toBe('prefix');
        if (step.inheritedFrom === 'step') expect(step.minutes).toBeGreaterThanOrEqual(1);
      }
    }
    // And the summary says which number it was, so that a reader of a green run can see the
    // allowance rather than inferring it from a step count.
    expect(budgetSummary(workflow, baseline)).toContain(`one ${String(PREFIX_MINUTES)}-minute allowance`);
  });
});

/**
 * The allowance against what a prefix actually cost.
 *
 * `O-102` is the entry that says three minutes is the one number in this file nobody
 * measured: every ceiling holds exactly one, and the cold runner it exists for has never
 * been recorded -- every run this repository has is warm. The answer is not a measurement
 * of the cold state, because there is none to take; it is a **bound the recordings can
 * refuse**. An allowance under twice the slowest prefix any run has spent is a number the
 * history already contradicts, and that is a claim a gate can hold. The summary prints the
 * multiple beside the allowance, so a reader of a green run sees how much of it is argument.
 */
describe('the allowance against what a prefix actually cost', () => {
  /** Two jobs sharing one setup step, which is the smallest workflow that has a prefix. */
  function withSetup() {
    const setup = ['      - name: Install', '        run: pnpm install --frozen-lockfile'];
    return workflowOf([
      { id: 'batteries', minutes: 30, steps: [...setup, ...step('Slow battery', 20)] },
      { id: 'batteries-heavy', minutes: 30, steps: [...setup, ...step('Heavy battery', 24)] },
    ]);
  }

  const SETUP_COMMAND = 'pnpm install --frozen-lockfile';
  const SLOW_COMMAND = 'node scripts/inject-slow-battery.mjs';
  const HEAVY_COMMAND = 'node scripts/inject-heavy-battery.mjs';

  /** The recording of both jobs, whose prefix spent two seconds. */
  const RECORD = recordingOf({
    batteries: { minutes: 30, steps: { Install: 2, 'Slow battery': 600 } },
    'batteries-heavy': { minutes: 30, steps: { Install: 2, 'Heavy battery': 700 } },
  });

  /**
   * Two runs: an older one in which the shared step took `seconds`, and the recording itself.
   *
   * The second row is not decoration. `R10` refuses a history whose newest run is not the
   * recording, because a day that was measured and not written down is a day no bound can see
   * -- so a fixture that offered only the slow run would be answered by that rule instead of
   * by this one.
   */
  function historyOf(seconds: number, run = 41234567890, heavySeconds = seconds) {
    const recording = readingsOf(withSetup(), RECORD).readings[0] as unknown as {
      run: number;
      commit: string;
      measured: string;
      jobs: Record<string, unknown>;
    };
    return {
      readings: [
        {
          run,
          commit: 'b'.repeat(40),
          measured: '2026-11-20',
          jobs: {
            batteries: {
              Install: { seconds, command: SETUP_COMMAND },
              'Slow battery': { seconds: 600, command: SLOW_COMMAND },
            },
            'batteries-heavy': {
              Install: { seconds: heavySeconds, command: SETUP_COMMAND },
              'Heavy battery': { seconds: 700, command: HEAVY_COMMAND },
            },
          },
        },
        recording,
      ],
    };
  }

  it('refuses an allowance under twice the slowest prefix any recording holds', () => {
    // 100 s of prefix against a 180 s allowance: the rule is the same multiple `R4` asks of a
    // work step, and the repair is the one number the file can carry -- `PREFIX_MINUTES`.
    const errors = budgetErrors(withSetup(), RECORD, null, null, historyOf(100)).join('\n');
    expect(errors).toContain('100 s before its first real step');
    expect(errors).toContain('run 41234567890');
    expect(errors).toContain(`under ${String(MULTIPLE)} times`);
    expect(errors).toContain('`PREFIX_MINUTES` to 4');
  });

  it('accepts an allowance at exactly twice the slowest prefix, because the rule is a multiple', () => {
    // 90 s and a 180 s allowance: equality is covered, which is what a multiple means and is
    // the reason this case is not written as "a margin".
    expect(budgetErrors(withSetup(), RECORD, null, null, historyOf(90))).toEqual([]);
  });

  it('does not read a prefix from a row that measured only part of it', () => {
    // Two setup steps, and the history holds one: 200 s of `Install` on its own would refuse
    // the allowance, and it is not a prefix -- that row never saw `Cache`, so the seconds are
    // a sum with a hole in it, which is the shape `jobDays` refuses one level up.
    const setup = ['      - name: Install', '        run: pnpm install --frozen-lockfile'];
    const cache = ['      - name: Cache', '        run: pnpm store path'];
    const workflow = workflowOf([
      { id: 'batteries', minutes: 30, steps: [...setup, ...cache, ...step('Slow battery', 20)] },
      { id: 'batteries-heavy', minutes: 30, steps: [...setup, ...cache, ...step('Heavy battery', 24)] },
    ]);
    const record = recordingOf({
      batteries: { minutes: 30, steps: { Install: 2, Cache: 1, 'Slow battery': 600 } },
      'batteries-heavy': { minutes: 30, steps: { Install: 2, Cache: 1, 'Heavy battery': 700 } },
    });
    const partial = {
      readings: [
        {
          run: 41234567890,
          commit: 'a'.repeat(40),
          measured: '2026-11-20',
          jobs: {
            batteries: {
              Install: { seconds: 200, command: SETUP_COMMAND },
              'Slow battery': { seconds: 600, command: SLOW_COMMAND },
            },
            'batteries-heavy': {
              Install: { seconds: 200, command: SETUP_COMMAND },
              'Heavy battery': { seconds: 700, command: HEAVY_COMMAND },
            },
          },
        },
      ],
    };
    const errors = budgetErrors(workflow, record, null, null, partial).join('\n');
    expect(errors).not.toContain('before its first real step');
    // The hole is not silently the answer, either: the summary says no prefix has been timed
    // whole, which is a different sentence from "the prefix is fast".
    expect(budgetSummary(workflow, record, null, null, partial)).toContain(
      'no recording has timed a prefix whole yet',
    );
  });

  it('names the slowest prefix, not the last one the loop happened to see', () => {
    // Two jobs, two prefixes: `batteries` spent 20 s in the history and `batteries-heavy` 90 s.
    // A summary that kept the least, or the last job's, would print the other number -- and the
    // sentence names the job and the run, so the wrong number would arrive with the wrong
    // address attached, which is finding 588's shape in a summary line.
    const summary = budgetSummary(withSetup(), RECORD, null, null, historyOf(20, 41234567890, 90));
    expect(summary).toContain('90 s in `batteries-heavy`');
    expect(summary).toContain('2.0x the slowest prefix');
    expect(summary).not.toContain('20 s in `batteries`');
  });

  it('says what the allowance is worth against the slowest prefix, so the argument is visible', () => {
    const summary = budgetSummary(withSetup(), RECORD, null, null, historyOf(14));
    expect(summary).toContain('12.9x the slowest prefix any recording holds');
    expect(summary).toContain('14 s in `batteries` of run 41234567890');
  });

  it('says no recording has timed a prefix when there is no history at all', () => {
    // The caller that offered no readings has not asked the question, and a sentence about a
    // comparison nobody made would be the shape finding 121 is about.
    expect(budgetSummary(withSetup(), RECORD)).toContain('no recording has timed a prefix whole yet');
  });

  it('gives no prefix reading to a job the workflow does not share, so work is never setup', () => {
    const summary = budgetSummary(
      oneJob([...step('Slow battery', 20)]),
      recordingOf({ batteries: { steps: { 'Slow battery': 600 } } }),
    );
    expect(summary).not.toContain('slowest prefix');
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
      '        uses: actions/checkout@v4',
      // The same name and a different command from the other job's battery, so the two jobs
      // share the checkout and nothing else: a step the whole workflow runs identically is
      // setup, and a step the second job runs its own way is that job's work (finding 622).
      ...step('Slow battery', 16, 'node scripts/inject-slow-battery-heavy.mjs'),
    ],
  },
]);

/** The API's answer for one run: two jobs, with the bookkeeping steps GitHub adds. */
const API_JOBS = {
  jobs: [
    {
      name: 'injection batteries, one step each (no survivors, no inert)',
      started_at: '2026-11-02T10:00:00Z',
      completed_at: '2026-11-02T10:00:53Z',
      steps: [
        { name: 'Set up job', started_at: '2026-11-02T10:00:00Z', completed_at: '2026-11-02T10:00:01Z' },
        { name: 'Check out', started_at: '2026-11-02T10:00:01Z', completed_at: '2026-11-02T10:00:03Z' },
        { name: 'Slow battery', started_at: '2026-11-02T10:00:03Z', completed_at: '2026-11-02T10:00:52Z' },
      ],
    },
    {
      name: 'injection batteries, the two that rewrite a probe a hundred times',
      started_at: '2026-11-02T10:20:00Z',
      completed_at: '2026-11-02T10:28:02Z',
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
      // The history `R10` reads. Without it the recorder would append a fixture's run to
      // the tree's own history, which is a measurement of a workflow that does not exist
      // -- and the failing case would be the gate, in a test two describes away.
      RCA_CI_READINGS: join(dir, 'ci-readings.json'),
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
    // And the other way to call it: a flag the usage line does not name is a flag nobody
    // finds, which is how `--seed` would have lived on a script that has two modes.
    expect(bare.stderr).toContain('--seed');
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
      // The job's own wall clock beside its steps, since v3.129: 53 s of job against 51 s
      // of steps is the two seconds no bound can cover, and `R13` holds a ceiling to the
      // bounds plus twice that.
      total: 53,
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

  it('refuses a run that reports no span for a job, because the overhead would then be a guess', async () => {
    // `R13` holds a ceiling to the bounds plus the seconds no step spends, and the job's own
    // span is the only place those seconds are measured. A run without one is refused at
    // measurement time rather than written with a default: a margin nobody measured is a
    // margin nobody checked, and the second is what the first would become.
    const result = await withApi(
      (url) => {
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/31') {
          return { status: 200, body: { head_sha: 'deadbeef', updated_at: '2026-11-02T10:31:00Z' } };
        }
        if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/31/jobs?per_page=100') {
          const jobs = JSON.parse(JSON.stringify(API_JOBS));
          jobs.jobs[0].started_at = null;
          return { status: 200, body: jobs };
        }
        return null;
      },
      (env) => runRecorder(['31'], env),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('reports no start and end for');
    expect(result.stderr).toContain('the seconds its steps do not account for cannot be measured');
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
    // The promise names the steps that carry a bound: the checkout is in the job's prefix,
    // and the prefix's one allowance is not a number any run has measured (finding 622).
    steps: [{ name: 'Slow battery', minutes: 16 }],
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
      jobs: [jobPromiseOf({ steps: [] })],
    }).join('\n');
    expect(omitted).toContain('promises no steps');

    const added = budgetErrors(workflow, recording, null, {
      jobs: [
        jobPromiseOf({
          steps: [
            { name: 'Slow battery', minutes: 16 },
            { name: 'A step that never was', minutes: 3 },
          ],
        }),
      ],
    }).join('\n');
    expect(added).toContain('promises 2 step(s) and ci.yml has 1');

    const reordered = budgetErrors(workflow, recording, null, {
      jobs: [jobPromiseOf({ steps: [{ name: 'A step that never was', minutes: 16 }] })],
    }).join('\n');
    expect(reordered).toContain('promises `A step that never was` in position 1 and ci.yml has `Slow battery`');

    const rebound = budgetErrors(workflow, recording, null, {
      jobs: [jobPromiseOf({ steps: [{ name: 'Slow battery', minutes: 12 }] })],
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
          steps: [...inherited('Check out'), ...inherited('Slow battery')],
        },
        {
          id: 'batteries-heavy',
          minutes: 25,
          steps: [...inherited('Check out'), ...inherited('Slow battery', 'node scripts/inject-slow-heavy.mjs')],
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
    const opens = source.indexOf("describe('a job the recording has never measured'");
    // And where the block *ends*, which was the end of the file. A slice with no right edge
    // is not a block: every case added after it joined the count, so this assertion held the
    // block's cases against a total that grew with somebody else's (finding 604's shape, in a
    // test). The next `describe(` is the boundary, and the last block of the file has none.
    const after = source.slice(opens + 1).indexOf('\ndescribe(');
    const block = after === -1 ? source.slice(opens) : source.slice(opens, opens + 1 + after);
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

/**
 * The ceiling, and the number it has to hold (findings 605 and 619).
 *
 * `R4` and `R10` size a *step* bound from what that step measured and demand twice the
 * slowest day its command has had. The job *ceiling* -- the number a hang is charged to
 * when no bound fires -- was asked nothing at all until finding 605, which asked it for
 * twice the job's day. That was a real floor and not the number that decides the question:
 * a step dies at its own bound, so the longest a job can legitimately live is the **sum** of
 * the bounds inside it plus the seconds no step spends. `batteries` held **83** minutes of
 * bounds under a 34-minute ceiling with the last bound expiring at 24 -- every bound inside
 * its own arithmetic, and a day that spent a third of each reaching the ceiling with nothing
 * to name.
 *
 * The day term did not go away: it is what a job with no bounds inside it has, which is the
 * shape `R3` excuses.
 */
describe('the two numbers a ceiling is made of', () => {
  it('adds the bounds a job declares, and only the ones it declares', () => {
    // A step that inherits its job's budget contributes nothing: the job's own ceiling is
    // already that number, and counting it twice would ask a ceiling to hold itself.
    const workflow = oneJob([
      ...step('Slow battery', 12),
      ...inherited('Quick battery'),
      ...step('Declared battery', 6),
    ]);
    expect(boundsSecondsOf(workflow, 'batteries')).toBe((12 + 6) * 60);
  });

  it('takes the larger of twice the day and the bounds plus twice the overhead, and says which', () => {
    // The term is returned rather than inferred by the caller, because the refusal's sentence
    // depends on it and two readers computing one answer is finding 588.
    expect(ceilingNeedOf(355, 900, 0)).toEqual({ seconds: 900, term: 'bounds' });
    expect(ceilingNeedOf(1000, 720, 0)).toEqual({ seconds: 2000, term: 'day' });
    // The seconds no step spends are doubled like every bound: 70 s of the runner's own time
    // is 140 s of budget, because a runner twice as slow sets up twice as slowly.
    expect(ceilingNeedOf(355, 720, 70)).toEqual({ seconds: 860, term: 'bounds' });
  });
});

describe('the ceiling, and the number it has to hold', () => {
  it('refuses a ceiling at twice the day when the bounds inside it add up to more', () => {
    // The defect finding 619 is about, in five lines: two bounds of 12 and 3 minutes under a
    // 12-minute ceiling. Twice the day is 710 s and the ceiling is 720, so `R12` was happy --
    // and a day that spent three quarters of each bound reaches 720 s with both still inside
    // their own, which is the sentence every bound in this file exists to replace.
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)], 12);
    const errors = budgetErrors(
      workflow,
      // The job's own clock equal to its steps, so this case is about the sum and nothing else;
      // the overhead has a case of its own below.
      recordingOf({
        batteries: { minutes: 12, total: 355, steps: { 'Slow battery': 351, 'Quick battery': 4 } },
      }),
    ).join('\n');
    expect(errors).toContain('`batteries` is bounded at 12 min and the bounds inside it add up to 15 min');
    expect(errors).toContain('2 step(s)');
    expect(errors).toContain('reaches the ceiling with every step still inside its own bound');
    expect(errors).toContain('raise the ceiling to 15 min, or split the job');
  });

  it('accepts a ceiling at exactly the sum, because the rule is arithmetic and not a margin', () => {
    // 15 min = 900 s and the two bounds are 900 s: the smallest whole minute that holds them.
    // The recording declares the same ceiling, because `R6` refuses a narrower one than the run
    // that sized the bounds -- a different rule, and a fixture that broke it would pass this
    // case for that rule's reason.
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)], 15);
    const errors = budgetErrors(
      workflow,
      recordingOf({
        batteries: { minutes: 15, total: 355, steps: { 'Slow battery': 351, 'Quick battery': 4 } },
      }),
    );
    expect(errors).toEqual([]);
  });

  it('refuses a ceiling under twice the day, for a job whose steps carry no bound of their own', () => {
    // The day term, which is all a job with no bounds inside it has. 355 s of job in a 6 min
    // ceiling: 360 s of budget against 710 s of expectation.
    const workflow = oneJob([...inherited('Slow battery')], 6);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { minutes: 6, steps: { 'Slow battery': 351 } } }),
    ).join('\n');
    expect(errors).toContain('`batteries` is bounded at 6 min and its slowest recorded day is 351 s');
    expect(errors).toContain('run 41637098008');
    expect(errors).toContain('which is 1.03x');
    expect(errors).toContain('raise the ceiling to 12 min, or split the job');
  });

  it('accepts a ceiling at exactly twice that day, because the rule is a multiple and not a margin', () => {
    const workflow = oneJob([...inherited('Slow battery')], 12);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { minutes: 12, steps: { 'Slow battery': 351 } } }),
    );
    expect(errors).toEqual([]);
  });

  it('reads the slowest day of the history, not the day being recorded', () => {
    // The recording is a fast day (100 s). An older run took 1 000 s, which is the day the
    // ceiling has to hold: 30 min = 1 800 s against 2 000 s of expectation.
    const workflow = oneJob([...inherited('Slow battery')], 30);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 100 } } });
    const slow = readingsOf(workflow, recording);
    const slower = JSON.parse(JSON.stringify(slow));
    slower.readings[0].run = 41000000000;
    slower.readings[0].jobs['batteries']['Slow battery'].seconds = 1000;
    const readings = { readings: [slower.readings[0], slow.readings[0]] };
    const errors = budgetErrors(workflow, recording, null, null, readings).join('\n');
    expect(errors).toContain('its slowest recorded day is 1000 s (run 41000000000)');
    expect(errors).toContain('raise the ceiling to 34 min');
  });

  it('skips a reading that measured only some of the job, rather than summing a hole', () => {
    // A reading missing one step is not a day: 600 s of it would pass a 20 min ceiling, and
    // the day that actually happened (recorded here as 900 s over two steps) is the one the
    // rule refuses.
    const workflow = oneJob([...inherited('Slow battery'), ...inherited('Quick battery')], 20);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 600, 'Quick battery': 300 } } });
    const partial = readingsOf(workflow, recording);
    delete partial.readings[0].jobs['batteries']['Quick battery'];
    const errors = budgetErrors(workflow, recording, null, null, partial).join('\n');
    expect(errors).toContain('its slowest recorded day is 900 s');
    // And the reading that could not be summed is not silently the answer: the recording is
    // the day, and it is the one named.
    expect(errors).toContain('run 41637098008');
  });

  it('holds a job with no ceiling to GitHub\'s six hours, because that is the number it will die at', () => {
    // A job that declares no ceiling is not unbounded: GitHub kills it at 360 minutes, and
    // that verdict names the job like any other. So the rule compares against 360 rather than
    // falling silent -- silence is how a ceiling that cannot hold its bounds goes unnoticed.
    const fits = oneJob([...step('Slow battery', 12)], null);
    expect(
      budgetErrors(fits, recordingOf({ batteries: { minutes: null, steps: { 'Slow battery': 351 } } })),
    ).toEqual([]);
    const doesNot = oneJob([...step('Slow battery', 130), ...step('Quick battery', 130), ...step('Third battery', 130)], null);
    const errors = budgetErrors(
      doesNot,
      recordingOf({
        batteries: {
          minutes: null,
          total: 30,
          steps: { 'Slow battery': 10, 'Quick battery': 10, 'Third battery': 10 },
        },
      }),
    ).join('\n');
    expect(errors).toContain('`batteries` is bounded at 360 min and the bounds inside it add up to 390 min');
    expect(errors).toContain('raise the ceiling to 390 min, or split the job');
  });

  it('holds the seconds no step spends, doubled like every bound', () => {
    // The job's own wall clock is longer than its steps: the runner's setup, its teardown and
    // the `Post` half of every action belong to no step, so no bound can cover them. 70 s of
    // them is 140 s of budget against a 12-minute bound that used 720 of 780.
    const workflow = oneJob([...step('Slow battery', 12)], 13);
    const quiet = recordingOf({ batteries: { minutes: 13, steps: { 'Slow battery': 351 } } });
    expect(budgetErrors(workflow, quiet)).toEqual([]);
    const slow = recordingOf({ batteries: { minutes: 13, steps: { 'Slow battery': 351 }, total: 421 } });
    const errors = budgetErrors(workflow, slow).join('\n');
    expect(errors).toContain('the bounds inside it add up to 12 min in 1 step(s)');
    expect(errors).toContain('raise the ceiling to 15 min');
  });

  it('refuses a recording that does not say how long the job took', () => {
    // The overhead is the one number in the rule a step cannot supply. A recording without it
    // is refused rather than defaulted: a margin nobody measured is a margin nobody checked.
    const workflow = oneJob([...step('Slow battery', 12)]);
    const errors = budgetErrors(
      workflow,
      recordingOf({ batteries: { steps: { 'Slow battery': 351 }, total: null } }),
    ).join('\n');
    expect(errors).toContain('`batteries` has seconds for its steps and none for the job');
    expect(errors).toContain('the seconds no step spends');
    expect(errors).toContain('record the run again');
  });

  it('counts the ceilings held by their bounds in the summary, so the rule is visible from a green run', () => {
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)], 15);
    const summary = budgetSummary(
      workflow,
      recordingOf({ batteries: { minutes: 15, steps: { 'Slow battery': 351, 'Quick battery': 4 } } }),
    );
    expect(summary).toContain('1 of 1 ceiling(s) hold the bounds inside them and 0 hold twice a day');
    expect(summary).toContain('the least room above a day is batteries at 15 min, 2.5x');
  });
});

describe('one reading, summed into one day', () => {
  it('adds the steps of a single reading rather than the slowest reading of each step', () => {
    // The distinction `jobDays` exists for: 351 s and 4 s on the same day is a 355 s day, and
    // a composite of each command's slowest day would be a day no run ever had -- which is
    // exactly what `R4`'s prefix uses, and why this rule does not reuse it.
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 351, 'Quick battery': 4 } } });
    const days = jobDays(workflow, recording, readReadings(readingsOf(workflow, recording)));
    expect(days.get('batteries')).toEqual({ seconds: 355, run: 41637098008 });
  });

  it('skips a reading with a hole in it, because a total with a hole is a fast day', () => {
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 3)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 351, 'Quick battery': 4 } } });
    const partial = readingsOf(workflow, recording);
    delete partial.readings[0].jobs['batteries']['Quick battery'];
    // Every job entry is still a non-empty object, so the reader accepts the file: the hole is
    // a step the reading did not time, and only the sum can notice.
    const days = jobDays(workflow, recording, readReadings(partial));
    expect(days.get('batteries'), 'a reading missing a step was summed as a day').toEqual({
      seconds: 355,
      run: 41637098008,
    });
  });

  it('takes the slowest day, with ties going to the newer run', () => {
    const workflow = oneJob([...step('Slow battery', 12)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 100 } } });
    const one = readingsOf(workflow, recording).readings[0];
    const older = { ...one, run: 41000000000, jobs: { batteries: { 'Slow battery': { ...one.jobs['batteries']['Slow battery'], seconds: 900 } } } };
    const newer = { ...one, run: 42000000000, jobs: { batteries: { 'Slow battery': { ...one.jobs['batteries']['Slow battery'], seconds: 900 } } } };
    const days = jobDays(workflow, recording, readReadings({ readings: [older, newer, one] }));
    expect(days.get('batteries')).toEqual({ seconds: 900, run: 42000000000 });
  });
});

describe('the spread of one command, and the multiple that does not say it', () => {
  /**
   * One day of the history, in the shape the recorder writes: run, job, step, seconds, command.
   *
   * Written out rather than derived from a workflow because the cases below are about a
   * *series* -- the same command read on days the workflow did not change -- and a fixture
   * built from one recording would hold one day of it.
   */
  function day(run: number, jobs: Record<string, Record<string, { seconds: number; command: string }>>) {
    // A forty-character hex commit, because that is what the reader accepts: a reading that
    // cannot name its tree is a number somebody typed, and the rule is not relaxed for fixtures.
    return { run, commit: String(run).padStart(40, '0'), measured: '2026-11-23', jobs };
  }

  function historyOf(...days: ReturnType<typeof day>[]) {
    return { readings: days };
  }

  function rowsOf(...days: ReturnType<typeof day>[]) {
    const read = readReadings(historyOf(...days));
    expect(read.errors).toEqual([]);
    return read.rows;
  }

  it('reads one command\'s readings across every run and every job, with the two that bound them', () => {
    // The install step's own history, in miniature: 25 days near twenty seconds and two in the
    // hundreds. `R10` needs the slow one; the multiple needs both, because `2.0x of 888 s` and
    // `2.0x` against a command that never varied are different claims about the same number.
    const rows = rowsOf(
      day(1, { backend: { Install: { seconds: 16, command: 'pip install x' } } }),
      day(2, { backend: { Install: { seconds: 556, command: 'pip install x' } } }),
      day(3, {
        backend: { Install: { seconds: 888, command: 'pip install x' } },
        mirror: { Install: { seconds: 40, command: 'pip install x' } },
      }),
    );
    expect(readingsOfCommand(rows, 'pip install x')).toEqual({
      fastest: { seconds: 16, run: 1, job: 'backend', step: 'Install' },
      slowest: { seconds: 888, run: 3, job: 'backend', step: 'Install' },
      count: 4,
    });
  });

  it('says nothing about a command no reading ran, rather than answering with a zero', () => {
    // A command the history does not hold is not a command with no readings: null is the state
    // of not having asked, and a caller that printed `0 s` would print the fastest reading of a
    // step nobody measured.
    const rows = rowsOf(day(1, { backend: { Install: { seconds: 16, command: 'pip install x' } } }));
    expect(readingsOfCommand(rows, 'pip install y')).toBeNull();
  });

  it('resolves a tie by run, so the answer is a function of the file rather than of its order', () => {
    // Both numbers are printed, so both ties have to be decided by something a reader can see
    // in the file. The slowest goes to the newer run (the run a refusal names), the fastest to
    // the older one -- and the older one first, because that is the tie rule, not the order the
    // days happen to appear in.
    const rows = rowsOf(
      day(7, { backend: { Install: { seconds: 900, command: 'c' } } }),
      day(6, { backend: { Install: { seconds: 900, command: 'c' } } }),
      day(9, { backend: { Install: { seconds: 16, command: 'c' } } }),
      day(5, { backend: { Install: { seconds: 16, command: 'c' } } }),
    );
    const found = readingsOfCommand(rows, 'c');
    expect(found?.slowest.run).toBe(7);
    expect(found?.fastest.run).toBe(5);
  });

  it('prints the spread beside the multiple, because the multiple alone reads as margin', () => {
    // 30 min against 888 s is 2.0x -- finding 628's arithmetic, and it looks like a bound with no
    // room. The same step spent 16 s on another day, and without that number in the sentence a
    // reader cannot tell `2.0x of a series that spans 16 s to 888 s` from `2.0x of a series that
    // never moved`. The history holds the spread and no line printed it (`O-109`).
    const workflow = oneJob([...step('Install', 30, 'pip install x')]);
    const recording = recordingOf({ batteries: { steps: { Install: 888 } } });
    const history = rowsOf(
      day(1, { batteries: { Install: { seconds: 16, command: 'pip install x' } } }),
      day(2, { batteries: { Install: { seconds: 888, command: 'pip install x' } } }),
    );
    const summary = budgetSummary(
      workflow,
      recording,
      null,
      null,
      historyOf(
        day(1, { batteries: { Install: { seconds: 16, command: 'pip install x' } } }),
        day(2, { batteries: { Install: { seconds: 888, command: 'pip install x' } } }),
      ),
    );
    expect(summary).toContain('tightest batteries / Install at 2.0x');
    expect(summary).toContain('across the history that command runs from 16 s to 888 s');
  });

  it('says a command has been read once, rather than leaving a reader to supply a spread', () => {
    const workflow = oneJob([...step('Install', 30, 'pip install x')]);
    const recording = recordingOf({ batteries: { steps: { Install: 888 } } });
    const summary = budgetSummary(
      workflow,
      recording,
      null,
      null,
      historyOf(day(2, { batteries: { Install: { seconds: 888, command: 'pip install x' } } })),
    );
    expect(summary).toContain('; that command has been read once');
    expect(summary).not.toContain('across the history');
  });

  it('says every reading is the same, rather than a range from a number to itself', () => {
    const workflow = oneJob([...step('Install', 30, 'pip install x')]);
    const recording = recordingOf({ batteries: { steps: { Install: 888 } } });
    const summary = budgetSummary(
      workflow,
      recording,
      null,
      null,
      historyOf(
        day(1, { batteries: { Install: { seconds: 888, command: 'pip install x' } } }),
        day(2, { batteries: { Install: { seconds: 888, command: 'pip install x' } } }),
      ),
    );
    expect(summary).toContain('; every reading of that command is the same');
    expect(summary).not.toContain('888 s to 888 s');
  });

  it('prints no spread at all when there is no history to take one from', () => {
    // A tree with no readings has no series, and a sentence about the spread of a series nobody
    // recorded would be the silence `R10` exists to replace, wearing a number.
    const workflow = oneJob([...step('Slow battery', 12)]);
    const summary = budgetSummary(workflow, recordingOf({ batteries: { steps: { 'Slow battery': 351 } } }));
    expect(summary).toContain('tightest batteries / Slow battery at 2.1x');
    expect(summary).not.toContain('across the history');
    expect(summary).not.toContain('has been read once');
  });

  it('prints the spread of the tightest bound\'s command, not of another step\'s', () => {
    // Two commands, two series: `Slow` spans 10 s to 900 s and is not tight (30 min against
    // 900 s is 2.0x... ), `Quick` spans 40 s to 50 s and is. The clause belongs to the bound the
    // sentence is about; attaching the wide series to the tight bound would print a spread that
    // explains nothing and hides the one that does.
    const workflow = oneJob([...step('Slow', 200, 'slow-command'), ...step('Quick', 2, 'quick-command')]);
    const recording = recordingOf({ batteries: { steps: { Slow: 900, Quick: 50 } } });
    const summary = budgetSummary(
      workflow,
      recording,
      null,
      null,
      historyOf(
        day(1, { batteries: { Slow: { seconds: 10, command: 'slow-command' }, Quick: { seconds: 40, command: 'quick-command' } } }),
        day(2, { batteries: { Slow: { seconds: 900, command: 'slow-command' }, Quick: { seconds: 50, command: 'quick-command' } } }),
      ),
    );
    expect(summary).toContain('tightest batteries / Quick at 2.4x');
    expect(summary).toContain('across the history that command runs from 40 s to 50 s');
    expect(summary).not.toContain('runs from 10 s to 900 s');
  });
});

/**
 * The other end of the axis a bound is measured against (`O-113`).
 *
 * v3.138 gave the *tightest* bound its series: `2.0x` against a command read between 16 s and
 * 888 s is a bound sized from the slow state, and the same `2.0x` against a command read between
 * 880 s and 888 s is a bound with 7% of room. That closed one end. The other end is the bound
 * that stands furthest above the best day its command has ever had, which is where the ceiling's
 * room actually goes -- and the gate printed one end out of thirty-eight and called it the axis.
 *
 * The measure is **seconds of headroom** rather than a multiple, and the choice is the point: a
 * command read at 0 s makes `bound / fastest` infinite, and a summary that printed `Infinity` is
 * finding 121 wearing a new number. Seconds subtract, so the number exists for every pair.
 */
describe('the bound furthest above a day its command has spent', () => {
  function day(run: number, jobs: Record<string, Record<string, { seconds: number; command: string }>>) {
    return { run, commit: String(run).padStart(40, '0'), measured: '2026-11-23', jobs };
  }

  function historyOf(...days: ReturnType<typeof day>[]) {
    return { readings: days };
  }

  it('names the bound with the most headroom, which is not the tightest one', () => {
    // Two bounds, and they hold opposite ends: `Tight` is the tightest against its worst day
    // (240 s over 119 s) and `Loose` stands 500 s above the best day its own command has had.
    // A summary that printed only the first would leave a reader to compute the second, which is
    // the whole of `O-113`.
    const workflow = oneJob([...step('Tight', 4, 'tight-command'), ...step('Loose', 10, 'loose-command')]);
    const recording = recordingOf({ batteries: { steps: { Tight: 119, Loose: 290 } } });
    const summary = budgetSummary(
      workflow,
      recording,
      null,
      null,
      historyOf(
        day(1, {
          batteries: {
            Tight: { seconds: 115, command: 'tight-command' },
            Loose: { seconds: 100, command: 'loose-command' },
          },
        }),
        day(2, {
          batteries: {
            Tight: { seconds: 119, command: 'tight-command' },
            Loose: { seconds: 290, command: 'loose-command' },
          },
        }),
      ),
    );
    expect(summary).toContain('tightest batteries / Tight at 2.0x');
    expect(summary).toContain(
      'the widest headroom over a day a command has spent is batteries / Loose, ' +
        '500 s of its 600 s above the 100 s its command spent at its fastest (run 1)',
    );
  });

  it('says so when one bound holds both ends, rather than printing the same name twice', () => {
    // The shipped tree's own shape: the install step's command has been read at 16 s and at
    // 888 s, so its 30-minute bound is the tightest against the slow day *and* the one with the
    // most headroom over the fast one. Two clauses naming one step read as two steps.
    const workflow = oneJob([...step('Install', 30, 'pip install x')]);
    const recording = recordingOf({ batteries: { steps: { Install: 888 } } });
    const summary = budgetSummary(
      workflow,
      recording,
      null,
      null,
      historyOf(
        day(1, { batteries: { Install: { seconds: 16, command: 'pip install x' } } }),
        day(2, { batteries: { Install: { seconds: 888, command: 'pip install x' } } }),
      ),
    );
    expect(summary).toContain('tightest batteries / Install at 2.0x');
    expect(summary).toContain(
      'the widest headroom over a day a command has spent is the same bound, 1784 s of its 1800 s ' +
        'above the 16 s that command spent at its fastest (run 1)',
    );
  });

  it('takes the better of the recording and the history, because both are days the command had', () => {
    // The recording is one day and the history is the rest, so the *best* day is the smaller of
    // the two -- the same combination `R10` makes in the other direction, where the denominator is
    // the larger. A clause that read only the history would report headroom against a day the
    // recording had already beaten.
    const workflow = oneJob([...step('Battery', 2, 'node battery.mjs')]);
    const recording = recordingOf({ batteries: { steps: { Battery: 5 } } });
    const summary = budgetSummary(
      workflow,
      recording,
      null,
      null,
      historyOf(
        day(1, { batteries: { Battery: { seconds: 40, command: 'node battery.mjs' } } }),
        day(2, { batteries: { Battery: { seconds: 50, command: 'node battery.mjs' } } }),
      ),
    );
    expect(summary).toContain('115 s of its 120 s above the 5 s');
    expect(summary).toContain('run 41637098008');
  });

  it('prints no headroom at all when there is no history to take a fast day from', () => {
    // One number is not a spread. The recording alone says what the command cost once, and a
    // headroom clause derived from it would be a bound compared with itself.
    const workflow = oneJob([...step('Slow battery', 12)]);
    const summary = budgetSummary(workflow, recordingOf({ batteries: { steps: { 'Slow battery': 351 } } }));
    expect(summary).toContain('tightest batteries / Slow battery at 2.1x');
    expect(summary).not.toContain('headroom');
  });

  it('subtracts rather than divides, so a command read at zero seconds has a headroom', () => {
    // `bound / 0` is not a number a summary can print, and the shape it prints instead --
    // `Infinity` -- is the one finding 121 is about. Four of the shipped tree's 38 bounds bound a
    // command whose fastest reading is 0 s, so the measure has to be a difference rather than a
    // ratio.
    const workflow = oneJob([...step('Counts', 1, 'node counts.mjs')]);
    const recording = recordingOf({ batteries: { steps: { Counts: 0 } } });
    const summary = budgetSummary(
      workflow,
      recording,
      null,
      null,
      historyOf(
        day(1, { batteries: { Counts: { seconds: 0, command: 'node counts.mjs' } } }),
        day(2, { batteries: { Counts: { seconds: 3, command: 'node counts.mjs' } } }),
      ),
    );
    expect(summary).toContain('60 s of its 60 s above the 0 s');
    expect(summary).not.toContain('Infinity');
  });
});
