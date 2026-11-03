import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FLOOR_MINUTES,
  MULTIPLE,
  budgetErrors,
  budgetSummary,
  jobsOf,
  stepsOf,
} from '../../../scripts/ci-budget.mjs';
import { readWorkflow } from '../../../scripts/gate-steps.mjs';

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
    expect(budgetErrors(workflow, baseline)).toEqual([]);
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
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'rca-ci-fixture-'));
  const workflow = join(dir, 'ci.yml');
  writeFileSync(workflow, TWO_JOBS);
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
