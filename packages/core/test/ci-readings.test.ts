import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MULTIPLE,
  budgetErrors,
  budgetSummary,
  commandOf,
  jobsOf,
  mergeReading,
  readReadings,
  stepsOf,
  worstReadingFor,
} from '../../../scripts/ci-budget.mjs';
import { readWorkflow } from '../../../scripts/gate-steps.mjs';

/**
 * A bound divided by the slowest day already recorded, rather than by the last one.
 *
 * v3.54 closed with a sentence that this file exists to hold to: *a bound sized from a
 * single reading of a variable step is a bound that expires the first time the runner
 * has a different day*. It had spent the round proving it three times -- 13 minutes
 * refused by a 440-second reading, `backend` unbounded because it had never been slow in
 * front of the recorder, `Lint` refused by 361 seconds against 720 after being sized
 * from 347.
 *
 * `R10` is the answer: `golden-master/ci-readings.json` holds every day the recorder has
 * measured, and a bound has to be at least twice the slowest of them -- for **the
 * command it bounds**, from whichever job and whichever run. The cases below are the
 * rule's failure shapes, one per refusal, because a rule whose refusals are only
 * described in a comment is a rule nobody has seen work.
 *
 * Every fixture is local: a workflow written as text, a recording of it, and a history
 * of readings of it. Nothing here reaches the network or edits a committed file.
 */

/** The two scripts this file drives, declared as well as spawned. */
export const DRIVES = ['scripts/check-ci-budget.mjs', 'scripts/measure-ci-baseline.mjs'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GATE = join(ROOT, 'scripts', 'check-ci-budget.mjs');
const MEASURE = join(ROOT, 'scripts', 'measure-ci-baseline.mjs');

/** One job of a fixture workflow: an id, its label, its budget, and its steps. */
interface FixtureJob {
  id: string;
  minutes?: number;
  steps: string[];
}

function workflowText(jobs: FixtureJob[]): string {
  const lines = ['name: CI', '', 'on:', '  push:', '', 'jobs:'];
  for (const job of jobs) {
    lines.push(`  ${job.id}:`);
    lines.push(`    name: ${job.id}`);
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

function oneJob(steps: string[], minutes = 30) {
  return workflowOf([{ id: 'batteries', minutes, steps }]);
}

/** A step whose budget is its own, and whose command is its own name. */
function step(name: string, minutes: number, command?: string): string[] {
  return [
    `      - name: ${name}`,
    `        timeout-minutes: ${String(minutes)}`,
    `        run: ${command ?? `node scripts/inject-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.mjs`}`,
  ];
}

/** A step that uses an action, and so has no command of its own. */
function action(name: string, minutes: number, ref = 'actions/checkout@v4'): string[] {
  return [`      - name: ${name}`, `        timeout-minutes: ${String(minutes)}`, `        uses: ${ref}`];
}

/** A recording of one workflow, as `measure-ci-baseline.mjs` writes it. */
function recordingOf(jobs: Record<string, { minutes?: number | null; steps: Record<string, number> }>) {
  const recorded: Record<string, unknown> = {};
  for (const [id, job] of Object.entries(jobs)) {
    const measured = Object.values(job.steps).reduce((all, one) => all + one, 0);
    recorded[id] = {
      name: id,
      timeoutMinutes: 'minutes' in job ? job.minutes ?? null : 30,
      // The job's own wall clock, which `R13` needs and the recorder writes: four seconds
      // more than its steps, so a case about a ceiling is not a case about the overhead.
      total: measured + 4,
      steps: job.steps,
    };
  }
  return {
    run: 900,
    commit: 'c'.repeat(40),
    measured: '2026-11-06',
    jobs: recorded,
  };
}

/**
 * A history with one entry per run, each carrying the command its seconds were spent on.
 *
 * Given as `[run, { job: { step: [seconds, command] } }]` pairs, which is what the rule
 * reads: the seconds are the measurement, and the command is what a bound is compared
 * against -- a bound on a step, divided by every reading of the command behind it.
 */
function historyOf(entries: Array<[number, Record<string, Record<string, [number, string]>>]>) {
  return {
    readings: entries.map(([run, jobs]) => {
      const byJob: Record<string, Record<string, { seconds: number; command: string }>> = {};
      for (const [jobId, byStep] of Object.entries(jobs)) {
        byJob[jobId] = {};
        for (const [name, [seconds, command]] of Object.entries(byStep)) {
          byJob[jobId][name] = { seconds, command };
        }
      }
      return { run, commit: 'c'.repeat(40), measured: '2026-11-06', jobs: byJob };
    }),
  };
}

/** The history a recording would produce, so a case can start from a consistent pair. */
function historyOfRecording(
  workflow: { steps: unknown[] },
  recording: ReturnType<typeof recordingOf>,
) {
  const jobs: Record<string, Record<string, [number, string]>> = {};
  for (const job of jobsOf(workflow)) {
    const record = recording.jobs[job.id];
    if (record === undefined) continue;
    jobs[job.id] = {};
    for (const one of stepsOf(workflow, job.id)) {
      const seconds = (record as { steps: Record<string, number> }).steps[one.name];
      if (typeof seconds !== 'number') continue;
      // The identity the recorder writes, by the same function: a fixture that spelled it out would be a
      // second answer to the question of what a step's command is, and the two would drift.
      jobs[job.id][one.name] = [seconds, commandOf(one)];
    }
  }
  return historyOf([[recording.run, jobs]]);
}

const commandOfStep = (name: string) => `node scripts/inject-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.mjs`;

describe('the history of readings, read', () => {
  it('reads one entry per run, in run order, with the command each step ran', () => {
    const history = historyOf([
      [20, { batteries: { 'Slow battery': [40, commandOfStep('Slow battery')] } }],
      [10, { batteries: { 'Slow battery': [30, commandOfStep('Slow battery')] } }],
    ]);
    const { rows, errors } = readReadings(history);
    expect(errors).toEqual([]);
    expect(rows.map((row) => row.run)).toEqual([10, 20]);
    const held = [...rows[1]!.steps.values()];
    expect(held).toEqual([
      { seconds: 40, command: commandOfStep('Slow battery'), job: 'batteries', step: 'Slow battery' },
    ]);
  });

  it('refuses a file that is not a list of readings', () => {
    // A history is a list because each entry is a run; a file that is not one is a file
    // no bound can be compared with, and reading it as empty would make the slowest day
    // look like no day at all.
    const { rows, errors } = readReadings({ reading: [] });
    expect(rows).toEqual([]);
    expect(errors).toEqual([expect.stringContaining('has no `readings` list')]);
  });

  it('refuses a history with no reading in it, naming the state it describes', () => {
    const { errors } = readReadings({ readings: [] });
    expect(errors).toEqual([expect.stringContaining('holds no reading')]);
  });

  it('refuses a reading that names no run, no commit, or no date', () => {
    const noRun = readReadings({ readings: [{ run: 'soon', commit: 'd'.repeat(40), jobs: {} }] });
    expect(noRun.errors[0]).toContain('names no workflow run');

    const noCommit = readReadings({ readings: [{ run: 1, jobs: {} }] });
    expect(noCommit.errors[0]).toContain('names no commit');

    const noDate = readReadings({ readings: [{ run: 1, commit: 'd'.repeat(40), jobs: {} }] });
    expect(noDate.errors[0]).toContain('has no measurement date');
    expect(noDate.errors).toHaveLength(1);
  });

  it('refuses the same run measured twice, because one day counted twice is one day overweighted', () => {
    const twice = historyOf([
      [7, { batteries: { 'Slow battery': [40, commandOfStep('Slow battery')] } }],
      [7, { batteries: { 'Slow battery': [41, commandOfStep('Slow battery')] } }],
    ]);
    const { rows, errors } = readReadings(twice);
    expect(rows).toHaveLength(1);
    expect(errors[0]).toContain('is run 7 a second time');
  });

  it('refuses a reading that holds a job with no step in it', () => {
    const { errors } = readReadings({
      readings: [{ run: 1, commit: 'd'.repeat(40), measured: '2026-11-06', jobs: { batteries: {} } }],
    });
    expect(errors[0]).toContain('holds `batteries` with no step in it');
  });

  it('refuses seconds that are not a whole number, and a step that does not say what it timed', () => {
    const badSeconds = readReadings({
      readings: [
        {
          run: 1,
          commit: 'd'.repeat(40),
          measured: '2026-11-06',
          jobs: { batteries: { 'Slow battery': { seconds: 1.5, command: 'x' } } },
        },
      ],
    });
    expect(badSeconds.errors[0]).toContain('holds 1.5 seconds');

    const noCommand = readReadings({
      readings: [
        {
          run: 1,
          commit: 'd'.repeat(40),
          measured: '2026-11-06',
          jobs: { batteries: { 'Slow battery': { seconds: 10, command: '  ' } } },
        },
      ],
    });
    expect(noCommand.errors[0]).toContain('does not say which command it timed');
  });

  it('accepts zero seconds, which is a step that ran and did nothing measurable', () => {
    // The shipped recording holds one: the step that publishes the suite counts reads a
    // file another step wrote. A rule that refused zero would refuse the tree it ships.
    const { rows, errors } = readReadings({
      readings: [
        {
          run: 1,
          commit: 'd'.repeat(40),
          measured: '2026-11-06',
          jobs: { batteries: { 'Published counts': { seconds: 0, command: 'cat counts.json' } } },
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(rows[0]!.steps.get('batteries\u0000Published counts')?.seconds).toBe(0);
  });

  it('finds the slowest reading of one command across runs and jobs, and prefers the newer run on a tie', () => {
    const rows = readReadings(
      historyOf([
        [10, { batteries: { A: [40, 'same'], B: [90, 'same'] } }],
        [11, { batteries: { A: [90, 'same'] } }],
      ]),
    ).rows;
    expect(worstReadingFor(rows, 'same')).toEqual({ seconds: 90, run: 11, attempt: 1, job: 'batteries', step: 'A' });
    expect(worstReadingFor(rows, 'nothing ran this')).toBe(null);
  });

  it('writes one entry per run, replacing a run it already holds and keeping the file in run order', () => {
    const once = mergeReading(null, {
      run: 5,
      commit: 'e'.repeat(40),
      measured: '2026-11-06',
      jobs: {},
    });
    const twice = mergeReading(once, { run: 3, commit: 'f'.repeat(40), measured: '2026-11-06', jobs: {} });
    const again = mergeReading(twice, { run: 5, commit: 'a'.repeat(40), measured: '2026-11-06', jobs: {} });
    expect(again.readings.map((one) => one.run)).toEqual([3, 5]);
    // The second write of a run *is* that run: a recorder run twice against one run
    // after a failure must not leave two rows under one id.
    expect(again.readings[1]!.commit).toBe('a'.repeat(40));
  });
});

describe('the history and the recording are one measurement', () => {
  const workflow = oneJob([...step('Slow battery', 12)]);
  const recording = recordingOf({ batteries: { steps: { 'Slow battery': 100 } } });

  it('refuses a history whose newest reading is older than the recording', () => {
    // A reading that was taken and not written down is a day no bound can see, and the
    // recorder writes both files from one measurement -- so this is a file edited by hand
    // or written by a tool that predates `R10`.
    const older = historyOf([[899, { batteries: { 'Slow battery': [100, commandOfStep('Slow battery')] } }]]);
    const errors = budgetErrors(workflow, recording, null, null, older);
    expect(errors).toEqual([expect.stringContaining('the newest reading in the history is run 899')]);
    expect(errors[0]).toContain('the recording is run 900');
  });

  it('refuses a history that holds a reading newer than the recording', () => {
    const newer = historyOf([[901, { batteries: { 'Slow battery': [100, commandOfStep('Slow battery')] } }]]);
    const errors = budgetErrors(workflow, recording, null, null, newer);
    expect(errors).toEqual([expect.stringContaining('which is newer than the recording')]);
    expect(errors[0]).toContain('record that run as the recording rather than beside it');
  });

  it('refuses two answers for one run, which is one of the two files having been edited', () => {
    const disagreeing = historyOf([[900, { batteries: { 'Slow battery': [101, commandOfStep('Slow battery')] } }]]);
    const errors = budgetErrors(workflow, recording, null, null, disagreeing);
    expect(errors).toEqual([expect.stringContaining('took 100 s in the recording and 101 s in the history')]);
  });

  it('refuses a step the history holds for that run and the recording does not', () => {
    const extra = historyOf([
      [
        900,
        {
          batteries: {
            'Slow battery': [100, commandOfStep('Slow battery')],
            'A step nobody recorded': [5, 'node scripts/extra.mjs'],
          },
        },
      ],
    ]);
    const errors = budgetErrors(workflow, recording, null, null, extra);
    expect(errors).toEqual([expect.stringContaining('the history holds `batteries / A step nobody recorded`')]);
  });

  it('accepts a history whose newest reading is the recording, step for step', () => {
    expect(budgetErrors(workflow, recording, null, null, historyOfRecording(workflow, recording))).toEqual([]);
  });

  it('says nothing about the history when the caller has none to offer', () => {
    // Null is not "an empty history": a caller that did not pass one has not asked the
    // question, and a module that answered it would report a green line about a
    // comparison nobody made.
    expect(budgetErrors(workflow, recording)).toEqual([]);
    expect(budgetErrors(workflow, recording, null, null, null)).toEqual([]);
  });
});

describe('a bound is divided by the slowest reading of the command it bounds', () => {
  it('refuses a bound that covers its own recording and not an older, slower one', () => {
    // The `Lint` shape, from v3.54: 720 s against a reading of 347 s, refused by 361 s
    // three runs later. `R4` would pass this tree; `R10` refuses it and names the run.
    const workflow = oneJob([...step('Lint', 12)]);
    const recording = recordingOf({ batteries: { steps: { Lint: 347 } } });
    const history = historyOf([
      [898, { batteries: { Lint: [361, commandOfStep('Lint')] } }],
      [899, { batteries: { Lint: [300, commandOfStep('Lint')] } }],
      [900, { batteries: { Lint: [347, commandOfStep('Lint')] } }],
    ]);
    const errors = budgetErrors(workflow, recording, null, null, history);
    expect(errors).toEqual([expect.stringContaining('the same command took 361 s')]);
    expect(errors[0]).toContain('bounded at 12 min');
    expect(errors[0]).toContain('run 898');
  });

  it('refuses a bound that covers its own job and not another job that ran the same command', () => {
    // The `Install the shells` shape: five jobs bound the command at three minutes from
    // their own 8-15 s days, while the same command took 153 s in the job that has no
    // bound at all. A series keyed by job cannot see that reading; this one can.
    // Two jobs, and the shells step is *not* their prefix: each begins with a checkout of its
    // own, so the shared command sits at position two in both and a bound on it is the job's
    // own argument (finding 622).
    const workflow = workflowOf([
      {
        id: 'batteries',
        minutes: 30,
        steps: [
          ...step('Check out', 3, 'node scripts/check-out-batteries.mjs'),
          ...step('Install the shells', 3, 'sudo apt-get install -y zsh'),
        ],
      },
      {
        id: 'artefacts',
        minutes: 30,
        steps: [
          ...step('Check out', 3, 'node scripts/check-out-artefacts.mjs'),
          ...step('Install the shells', 20, 'sudo apt-get install -y zsh'),
        ],
      },
    ]);
    const recording = recordingOf({
      batteries: { steps: { 'Check out': 2, 'Install the shells': 9 } },
      artefacts: { steps: { 'Check out': 2, 'Install the shells': 153 } },
    });
    const history = historyOf([
      [
        900,
        {
          batteries: {
            'Check out': [2, 'node scripts/check-out-batteries.mjs'],
            'Install the shells': [9, 'sudo apt-get install -y zsh'],
          },
          artefacts: {
            'Check out': [2, 'node scripts/check-out-artefacts.mjs'],
            'Install the shells': [153, 'sudo apt-get install -y zsh'],
          },
        },
      ],
    ]);
    const errors = budgetErrors(workflow, recording, null, null, history);
    // The 20-minute copy is fine at 6x; the 3-minute copy is refused, and the sentence
    // names the job that supplied the slow day rather than the job being refused.
    expect(errors).toEqual([expect.stringContaining('`batteries / Install the shells` is bounded at 3 min')]);
    expect(errors[0]).toContain('took 153 s in `artefacts / Install the shells`');
  });

  it('does not bind one command to another command in a job that is slower', () => {
    // The grouping key is the command, not the job. A slow step in another job says
    // nothing about this one, and a rule that compared them would bound every step by the
    // slowest step anywhere -- which is a workflow of twenty-minute bounds.
    const workflow = workflowOf([
      { id: 'batteries', minutes: 30, steps: [...step('Quick battery', 3, 'node scripts/quick.mjs')] },
      { id: 'artefacts', minutes: 30, steps: [...step('Slow battery', 20, 'node scripts/slow.mjs')] },
    ]);
    const recording = recordingOf({
      batteries: { steps: { 'Quick battery': 4 } },
      artefacts: { steps: { 'Slow battery': 500 } },
    });
    const history = historyOf([
      [
        900,
        {
          batteries: { 'Quick battery': [4, 'node scripts/quick.mjs'] },
          artefacts: { 'Slow battery': [500, 'node scripts/slow.mjs'] },
        },
      ],
    ]);
    expect(budgetErrors(workflow, recording, null, null, history)).toEqual([]);
  });

  it('refuses a step under twice its own recording once, not twice', () => {
    // `R4` and `R10` are the same arithmetic with different denominators, so a step that
    // is under both has to be one sentence: a reader who is told the same thing twice
    // goes looking for the second, different thing that is not there.
    const workflow = oneJob([...step('Slow battery', 3)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 120 } } });
    const errors = budgetErrors(workflow, recording, null, null, historyOfRecording(workflow, recording));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('is bounded at 3 min and measured 120 s');
  });

  it('groups a step that uses an action by the action, because the action is what costs', () => {
    // An action has no `run:` to key on, and `Set up Node.js` in two jobs is one download and one
    // extraction. Until v3.148 the handle was the step's **name**, which answered the two-jobs question
    // correctly and the version question wrongly: `actions/checkout@v3` and `@v4` were one command under
    // a name, so an upgrade moved the program without moving the identity (`O-132`). The series is the
    // action now, and this case still passes for the reason it was written -- two jobs, one action, one
    // series -- with the name no longer doing the work.
    const workflow = workflowOf([
      // 31 minutes, because `R13` holds a ceiling to the bounds inside it and a 30-minute
      // bound needs 31 -- the two jobs are here for `R10`'s keying, and a fixture that also
      // broke the ceiling rule would make the case pass for the wrong reason.
      // One leading step each with a command of its own, so the shared action is not the
      // workflow's prefix: a prefix step may not carry a bound at all (finding 622).
      { id: 'batteries', minutes: 34, steps: [...step('Check out', 3, 'node scripts/check-out-a.mjs'), ...action('Set up Node.js', 3)] },
      { id: 'artefacts', minutes: 34, steps: [...step('Check out', 3, 'node scripts/check-out-b.mjs'), ...action('Set up Node.js', 30)] },
    ]);
    const recording = recordingOf({
      batteries: { steps: { 'Check out': 2, 'Set up Node.js': 1 } },
      artefacts: { steps: { 'Check out': 2, 'Set up Node.js': 120 } },
    });
    const history = historyOf([
      [
        900,
        {
          batteries: { 'Check out': [2, 'node scripts/check-out-a.mjs'], 'Set up Node.js': [1, 'uses:actions/checkout@v4'] },
          artefacts: { 'Check out': [2, 'node scripts/check-out-b.mjs'], 'Set up Node.js': [120, 'uses:actions/checkout@v4'] },
        },
      ],
    ]);
    const errors = budgetErrors(workflow, recording, null, null, history);
    expect(errors).toEqual([expect.stringContaining('`batteries / Set up Node.js` is bounded at 3 min')]);
  });

  it('is quiet about a bound that already covers the slowest day in the history', () => {
    const workflow = oneJob([...step('Slow battery', 12)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 100 } } });
    const history = historyOf([
      [899, { batteries: { 'Slow battery': [350, commandOfStep('Slow battery')] } }],
      [900, { batteries: { 'Slow battery': [100, commandOfStep('Slow battery')] } }],
    ]);
    // 720 s against 350 s is 2.06x: the tightest legal bound, and legal.
    expect(budgetErrors(workflow, recording, null, null, history)).toEqual([]);
    expect(MULTIPLE).toBe(2);
  });
});

describe('an action is identified by the action, not by the name of the step that uses it', () => {
  /**
   * `O-132`, and the second half of `v3.147`'s question.
   *
   * A reading is a number beside the command that spent it. For a step with a `run:`, the command is
   * the text and the history has carried it since `R10` was written. For a step with a `uses:`, the
   * handle was the step's **name** -- so `actions/checkout@v3` and `actions/checkout@v4`, two
   * programs, were one command, and the readings of the old one went on sizing the new one. The name
   * is the label; the action and its version are what ran.
   *
   * The shipped history holds **994** such rows over 40 readings, and every one of them ran the
   * action today's tree states -- measured by fetching the workflow at each row's commit. So the
   * defect was latent rather than live: no bound in this tree divides by an action's series (the
   * action steps are the prefix, and a prefix step may not carry a bound), and no action in the
   * history has ever been upgraded. `v3.146` made the same distinction about `failure` steps, and for
   * the same reason: a rule that is only ever right because nothing has moved is a rule nobody has
   * seen work.
   */
  it('keys a `uses:` step by the action and the version of it that ran', () => {
    const workflow = oneJob([...action('Set up Node.js', 3)]);
    const [first] = stepsOf(workflow, 'batteries');
    expect(first?.uses).toBe('actions/checkout@v4');
    expect(commandOf(first)).toBe('uses:actions/checkout@v4');
  });

  it('holds two versions of one action as two series, so an older day does not size a newer bound', () => {
    const rows = readReadings(
      historyOf([
        [10, { batteries: { 'Check out': [500, 'uses:actions/checkout@v3'] } }],
        [11, { batteries: { 'Check out': [20, 'uses:actions/checkout@v4'] } }],
      ]),
    ).rows;
    expect(worstReadingFor(rows, 'uses:actions/checkout@v4')?.seconds).toBe(20);
    expect(worstReadingFor(rows, 'uses:actions/checkout@v3')?.seconds).toBe(500);
  });

  it('keeps a series through a rename, because a name is a label and the action is what ran', () => {
    // The other direction of the same identity, and the one the name-keyed version got wrong in a way
    // nobody could see: a step renamed between two days lost its history, and `R10` then divided by the
    // newest day alone -- the sample of one the rule exists to remove.
    expect(commandOf({ name: 'Check out the tree', uses: 'actions/checkout@v4' })).toBe(
      commandOf({ name: 'Check out', uses: 'actions/checkout@v4' }),
    );
    // A step with neither a `run:` nor a `uses:` is not a step the workflow reader accepts, and the
    // identity still has to be a string rather than `undefined`: the fallback is the name.
    expect(commandOf({ name: 'Mystery' })).toBe('step:Mystery');
  });

  it('stops the shared prefix where two jobs run two versions of one action', () => {
    // The prefix rule says "the same thing in the same position", and its docstring has said "name and
    // command both" since it was written -- while comparing the name and an empty string for every
    // action step, which is the one kind of step a workflow writes most often. Two versions of one
    // action are two things, so the shared run of setup steps ends at the one that differs.
    const checkedOut = (ref: string) => ['      - name: Check out', `        uses: ${ref}`];
    const same = workflowOf([
      { id: 'batteries', minutes: 30, steps: [...checkedOut('actions/checkout@v4'), ...step('Slow battery', 3)] },
      { id: 'artefacts', minutes: 30, steps: [...checkedOut('actions/checkout@v4'), ...step('Slow battery', 3)] },
    ]);
    expect(stepsOf(same, 'batteries')[0]?.inPrefix).toBe(true);
    const split = workflowOf([
      { id: 'batteries', minutes: 30, steps: [...checkedOut('actions/checkout@v4'), ...step('Slow battery', 3)] },
      { id: 'artefacts', minutes: 30, steps: [...checkedOut('actions/checkout@v3'), ...step('Slow battery', 3)] },
    ]);
    expect(stepsOf(split, 'batteries')[0]?.inPrefix).toBe(false);
    expect(stepsOf(split, 'artefacts')[0]?.inPrefix).toBe(false);
  });
});

describe("a bound's position is not a rule of its own any more", () => {
  // The `sensitivity` shape, from v3.55: a 20-minute bound in a 26-minute job, whose deadline
  // fitted while the shell install in front of it measured 9 s and stopped fitting when the
  // same step measured 91 s. `R5` asked that of every position, one at a time, and v3.129
  // (finding 619) replaced it with the sum -- forty minutes of bounds do not fit twenty-six
  // whatever the prefix measured, so the verdict no longer moves with the history.
  const steps = [...step('Install the shells', 20, 'sudo apt-get install -y zsh'), ...step('Long battery', 20)];
  const workflow = workflowOf([{ id: 'batteries', minutes: 26, steps }]);
  const recording = recordingOf({
    batteries: { minutes: 26, steps: { 'Install the shells': 9, 'Long battery': 10 } },
  });
  const slowPrefix = historyOf([
    [899, { batteries: { 'Install the shells': [400, 'sudo apt-get install -y zsh'] } }],
    [
      900,
      {
        batteries: {
          'Install the shells': [9, 'sudo apt-get install -y zsh'],
          'Long battery': [10, commandOfStep('Long battery')],
        },
      },
    ],
  ]);

  it('refuses the tree for the sum, even with a day four times slower in front of the bound', () => {
    const errors = budgetErrors(workflow, recording, null, null, slowPrefix);
    expect(errors).toEqual([
      expect.stringContaining('the bounds inside it add up to 40 min in 2 step(s)'),
    ]);
  });

  it('gives the same verdict from one day, because the prefix no longer enters it', () => {
    // The pair that made `R5` worth writing is gone with it: the verdict is a fact about the
    // tree, and the tree is the same tree on a fast day and a slow one.
    expect(budgetErrors(workflow, recording)).toEqual([
      expect.stringContaining('the bounds inside it add up to 40 min in 2 step(s)'),
    ]);
  });
});

describe('the reading a green run prints', () => {
  it('names the slowest reading the tightest bound is tight against, and how many days were read', () => {
    const workflow = oneJob([...step('Slow battery', 12), ...step('Quick battery', 9)]);
    const recording = recordingOf({ batteries: { steps: { 'Slow battery': 100, 'Quick battery': 200 } } });
    const history = historyOf([
      [899, { batteries: { 'Slow battery': [350, commandOfStep('Slow battery')] } }],
      [
        900,
        {
          batteries: {
            'Slow battery': [100, commandOfStep('Slow battery')],
            'Quick battery': [200, commandOfStep('Quick battery')],
          },
        },
      ],
    ]);
    const summary = budgetSummary(workflow, recording, null, null, history);
    expect(summary).toContain('tightest batteries / Slow battery at 2.1x');
    expect(summary).toContain('350 s in `batteries / Slow battery`, run 899');
    expect(summary).toContain('2 reading(s) of the workflow, run 899 to 900');
  });

  it('says so when there is no history, rather than printing a ratio it did not take', () => {
    const summary = budgetSummary(
      oneJob([...step('Slow battery', 12)]),
      recordingOf({ batteries: { steps: { 'Slow battery': 100 } } }),
    );
    expect(summary).toContain('no history of readings to compare against');
  });
});

describe('the gate, through its own exit code', () => {
  it('refuses when the history it needs is not there, and names the file it looked for', () => {
    // The history is required rather than optional: a gate that skipped the comparison
    // whenever the file was absent would print OK about a question it had not asked,
    // which is the silence `R10` exists to remove.
    const dir = mkdtempSync(join(tmpdir(), 'rca-readings-'));
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_READINGS: join(dir, 'absent.json') },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no history of readings at');
    expect(result.stderr).toContain('absent.json');
  });

  it('is green on the shipped tree, where the history’s newest reading is the recording', () => {
    // The pair has to agree on the tree that ships, or the rule is a rule about fixtures.
    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CI_READINGS: join(ROOT, 'golden-master', 'ci-readings.json') },
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('reading(s) of the workflow');
  });
});

/** A server that answers the two calls the recorder makes. */
const API_JOBS = {
  jobs: [
    {
      name: 'batteries',
      started_at: '2026-11-06T10:20:00Z',
      completed_at: '2026-11-06T10:21:53Z',
      steps: [
        { name: 'Set up job', started_at: '2026-11-06T10:20:00Z', completed_at: '2026-11-06T10:20:01Z', conclusion: 'success' },
        { name: 'Check out', started_at: '2026-11-06T10:20:01Z', completed_at: '2026-11-06T10:20:03Z', conclusion: 'success' },
        { name: 'Slow battery', started_at: '2026-11-06T10:20:03Z', completed_at: '2026-11-06T10:21:52Z', conclusion: 'success' },
      ],
    },
  ],
};

/** What a case may replace about the fixture, one key per thing an argument exists for. */
interface ApiOver {
  /** Text pre-written as the history, before the recorder runs. */
  history?: string;
  /** Text pre-written as the recording, which a seed must not touch. */
  recording?: string;
  /** The workflow the recorder reads, if not the one-job fixture. */
  workflow?: string;
  /** What the API reports, if not the one job of that fixture. */
  jobs?: unknown;
  /**
   * How many times the run has been executed, if more than once.
   *
   * A re-run keeps the run id and increments `run_attempt`, so this is the field that makes one run
   * two measurements. The run's own count is what the recorder reads when no `--attempt` is named,
   * and an attempt the run has never reached is refused before the jobs are asked for.
   */
  attempts?: number;
  /**
   * What the run concluded, when the case is about one that did not succeed.
   *
   * A recording is a description of this workflow, so it may only come from a run in which every step that
   * ran finished: a red run's numbers may include a step that stopped at its own bound, and the report says
   * `failure` for both. The API reports the field on every run, so the fixture reports it too.
   */
  conclusion?: string;
}

async function withApi<T>(
  body: (env: Record<string, string>) => Promise<T>,
  existing?: string,
  over: ApiOver = {},
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'rca-readings-api-'));
  const workflow = join(dir, 'ci.yml');
  writeFileSync(
    workflow,
    over.workflow ??
      workflowText([{ id: 'batteries', minutes: 25, steps: [...step('Check out', 3), ...step('Slow battery', 12)] }]),
  );
  if (existing !== undefined) writeFileSync(join(dir, 'ci-readings.json'), existing);
  if (over.history !== undefined) writeFileSync(join(dir, 'ci-readings.json'), over.history);
  if (over.recording !== undefined) writeFileSync(join(dir, 'ci-baseline.json'), over.recording);
  const reported = over.jobs ?? API_JOBS;
  /** One fixture timestamp, moved by a number of seconds: the whole of what a re-run changes. */
  const shift = (at: string, seconds: number): string => new Date(Date.parse(at) + seconds * 1000).toISOString();
  /**
   * The same jobs, measured a second time.
   *
   * The second attempt starts a minute after the first and the battery spends a minute longer, so
   * the job's overhead is the same two seconds and the one step that matters is a different number.
   * A fixture whose re-run was identical to the first would make "which attempt was read" a
   * question two readings of equal seconds could not answer.
   */
  const rerun = (one: Record<string, unknown>): Record<string, unknown> => ({
    ...one,
    run_attempt: 2,
    started_at: shift(String(one['started_at']), 60),
    completed_at: shift(String(one['completed_at']), 120),
    steps: (one['steps'] as Record<string, string>[]).map((each) => ({
      ...each,
      started_at: shift(each['started_at'] as string, 60),
      completed_at: shift(each['completed_at'] as string, each.name === 'Slow battery' ? 120 : 60),
    })),
  });
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/7') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          head_sha: 'e'.repeat(40),
          run_attempt: over.attempts ?? 1,
          conclusion: over.conclusion ?? 'success',
          updated_at: '2026-11-06T10:31:00Z',
        }),
      );
      return;
    }
    if (
      url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/7/jobs?per_page=100' ||
      url === '/repos/AgentiX-E/rca-bench-factory/actions/runs/7/jobs?per_page=100&filter=all'
    ) {
      // `filter=all` is asked for exactly when an attempt is named, and the endpoint answers with
      // every attempt of the run -- which is the only way the older measurement is reachable once
      // the newer one exists.
      const every =
        url.endsWith('&filter=all')
          ? {
              jobs: (JSON.parse(JSON.stringify(reported)) as { jobs: Record<string, unknown>[] }).jobs.flatMap(
                (one) => [{ ...one, run_attempt: 1 }, rerun(one)],
              ),
            }
          : reported;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(every));
      return;
    }
    if (url.includes('/contents/.github/workflows/ci.yml')) {
      // The file at the run's commit is the workflow this fixture wrote: these cases record the tree they
      // wrote, and a case about a tree that moved on is `ci-budget.test.ts`, where the two documents are
      // the subject rather than the setup.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          content: Buffer.from(readFileSync(workflow, 'utf8'), 'utf8').toString('base64'),
          encoding: 'base64',
        }),
      );
      return;
    }
    res.writeHead(404).end();
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
      RCA_CI_READINGS: join(dir, 'ci-readings.json'),
      RCA_CI_DECLARATIONS: join(dir, 'ci-declarations.json'),
    });
  } finally {
    await new Promise<void>((shut) => server.close(() => shut()));
  }
}

function runRecorder(
  env: Record<string, string>,
  args: string[] = [],
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [MEASURE, '7', ...args], { env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('close', (status) => done({ status, stdout, stderr }));
  });
}

describe('the recorder appends what it measured', () => {
  it('writes the reading into the history with the command each step ran', async () => {
    // One measurement, two files. The history is not a second derivation: if it were, the
    // two could disagree, and `R10` would be comparing a bound with a number nobody
    // measured.
    const result = await withApi(async (env) => {
      const out = await runRecorder(env);
      return { out, path: env['RCA_CI_READINGS'] as string };
    });
    expect(result.out.stderr).toBe('');
    expect(result.out.status).toBe(0);
    expect(result.out.stdout).toContain('the history holds 1 reading(s)');
    const written = JSON.parse(readFileSync(result.path, 'utf8'));
    expect(written.readings).toHaveLength(1);
    expect(written.readings[0]).toMatchObject({ run: 7, commit: 'e'.repeat(40) });
    expect(written.readings[0].jobs.batteries['Slow battery']).toEqual({
      seconds: 109,
      command: commandOfStep('Slow battery'),
    });
  });

  it('replaces the entry for a run it has already recorded rather than adding a second', async () => {
    // A recorder run twice against one run -- after a failure, or to re-seed a history --
    // would otherwise weight that day twice when the slowest is looked up.
    const existing = JSON.stringify(
      historyOf([[7, { batteries: { 'Slow battery': [1, commandOfStep('Slow battery')] } }]]),
    );
    const result = await withApi(async (env) => {
      const out = await runRecorder(env);
      return { out, path: env['RCA_CI_READINGS'] as string };
    }, existing);
    expect(result.out.status).toBe(0);
    const written = JSON.parse(readFileSync(result.path, 'utf8'));
    expect(written.readings).toHaveLength(1);
    expect(written.readings[0].jobs.batteries['Slow battery'].seconds).toBe(109);
  });

  it('leaves a history it cannot read alone, says so, and lets the gate refuse it', async () => {
    // Silently rewriting a history it could not parse would delete the slow day that
    // justifies a bound. The recorder records; the refusal belongs to the gate, which is
    // where a reader is already looking for one.
    const result = await withApi(async (env) => {
      const out = await runRecorder(env);
      return { out, path: env['RCA_CI_READINGS'] as string };
    }, '{ not json');
    expect(result.out.status).toBe(0);
    expect(result.out.stderr).toContain('cannot be parsed');
    expect(result.out.stderr).toContain('this reading was not appended');
    // And the report does not claim a history it did not write.
    expect(result.out.stdout).not.toContain('the history holds');
    expect(readFileSync(result.path, 'utf8')).toBe('{ not json');
  });

  it('leaves a history whose shape is wrong alone as well, naming the first problem', async () => {
    const result = await withApi(async (env) => {
      const out = await runRecorder(env);
      return { out, path: env['RCA_CI_READINGS'] as string };
    }, JSON.stringify({ readings: [{ run: 'soon', jobs: {} }] }));
    expect(result.out.status).toBe(0);
    expect(result.out.stderr).toContain('names no workflow run');
    expect(result.out.stderr).toContain('this reading was not appended');
    expect(result.out.stdout).not.toContain('the history holds');
  });
});

describe('a past day is appended without becoming the recording', () => {
  /**
   * A run from before a job existed is still evidence about the commands it ran.
   *
   * This is the rule `R10` needs to be worth anything: the slowest day is the whole
   * point, and a history that could only hold runs shaped like today's workflow would
   * lose every day older than the last structural change. Adding a job would silently
   * reset the evidence to the sample of one that the rule exists to remove.
   *
   * But a seed is not the recording. A recording says what CI will spend, so it has to
   * describe the workflow as it stands; a seed says how slow a command has been, which
   * is a fact about that command on that day and does not change with the tree.
   */
  const twoJobs = workflowText([
    { id: 'batteries', minutes: 25, steps: [...step('Check out', 3), ...step('Slow battery', 12)] },
    { id: 'artefacts', minutes: 15, steps: [...step('Check out', 3), ...step('Upload the report', 6)] },
  ]);
  // The API reports the run as it was: `artefacts` did not exist on that day.
  const onlyBatteries = {
    jobs: [
      {
        name: 'batteries',
        started_at: '2026-11-01T10:20:00Z',
        completed_at: '2026-11-01T10:21:53Z',
        steps: [
          { name: 'Check out', started_at: '2026-11-01T10:20:01Z', completed_at: '2026-11-01T10:20:03Z', conclusion: 'success' },
          { name: 'Slow battery', started_at: '2026-11-01T10:20:03Z', completed_at: '2026-11-01T10:21:52Z', conclusion: 'success' },
        ],
      },
    ],
  };

  it('appends the jobs the run had, names the ones it did not, and leaves the recording alone', async () => {
    const recording = JSON.stringify(
      recordingOf({ batteries: { minutes: 25, steps: { 'Check out': 2, 'Slow battery': 100 } } }),
    );
    const result = await withApi(
      async (env) => {
        const out = await runRecorder(env, ['--seed']);
        return {
          out,
          history: JSON.parse(readFileSync(env['RCA_CI_READINGS'] as string, 'utf8')),
          held: readFileSync(env['RCA_CI_OUT'] as string, 'utf8'),
        };
      },
      undefined,
      { workflow: twoJobs, jobs: onlyBatteries, recording },
    );
    expect(result.out.stderr).toBe('');
    expect(result.out.status).toBe(0);
    expect(result.out.stdout).toContain('seeded run 7 with 1 of 2 job(s) and 2 step(s)');
    expect(result.out.stdout).toContain('`artefacts` did not exist');
    // The measurement is in the history, with the command those seconds were spent on.
    expect(result.history.readings).toHaveLength(1);
    const seeded = result.history.readings[0];
    expect(seeded.jobs.batteries['Slow battery']).toEqual({
      seconds: 109,
      command: commandOfStep('Slow battery'),
    });
    expect(seeded.jobs.artefacts).toBeUndefined();
    // And a seed answers no budget: the file CI's bounds are argued from is the one that
    // was already there, byte for byte.
    expect(result.held).toBe(recording);
  });

  it('refuses a run newer than the recording, which is a recording that was not taken', async () => {
    const result = await withApi(
      async (env) => runRecorder(env, ['--seed']),
      undefined,
      {
        recording: JSON.stringify(
          recordingOf({ batteries: { minutes: 25, steps: { 'Check out': 2, 'Slow battery': 100 } } }),
        ),
      },
    );
    // The fixture recording is run 900, so run 7 is older and would be accepted: the case
    // that matters is the other direction, and it needs a recording from before it.
    expect(result.status).toBe(0);
    const refused = await withApi(
      async (env) => runRecorder(env, ['--seed']),
      undefined,
      { recording: JSON.stringify({ ...recordingOf({ batteries: { steps: { 'Slow battery': 100 } } }), run: 5 }) },
    );
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain('which is newer than the recording (run 5)');
    expect(refused.stderr).toContain('the recording, not a seed');
  });

  it('refuses a seed that is the recording, because one measurement entered twice is one overweighted', async () => {
    const result = await withApi(
      async (env) => runRecorder(env, ['--seed']),
      undefined,
      {
        recording: JSON.stringify({ ...recordingOf({ batteries: { steps: { 'Slow battery': 109 } } }), run: 7 }),
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('which is the recording');
    expect(result.stderr).toContain('weight that measurement twice');
  });

  it('appends an older attempt of the recorded run, which is one tree read twice', async () => {
    // `O-122`. The run was re-run twice, attempt 3 is the recording, and attempt 2 is a second
    // reading of the same tree -- which is the pair a bound's margin over the machine's own movement
    // is measured against (finding 645). The ordering that refused it compared the run ids and found
    // them equal, so it said the older measurement *was* the recording and the pair stayed
    // unwritable; and recording it as the recording instead is the tree `R10` refuses.
    const recording = JSON.stringify({
      ...recordingOf({ batteries: { steps: { 'Slow battery': 100 } } }),
      run: 7,
      attempt: 3,
    });
    const result = await withApi(
      async (env) => {
        const out = await runRecorder(env, ['--seed', '--attempt', '2']);
        return {
          out,
          history: JSON.parse(readFileSync(env['RCA_CI_READINGS'] as string, 'utf8')),
          held: readFileSync(env['RCA_CI_OUT'] as string, 'utf8'),
        };
      },
      undefined,
      { recording, attempts: 3 },
    );
    expect(result.out.stderr).toBe('');
    expect(result.out.status).toBe(0);
    // The report names the measurement, not just the run: a seed of attempt 2 and a seed of
    // attempt 1 are two different days, and `run 7` would leave the reader to work out which.
    expect(result.out.stdout).toContain('seeded run 7 attempt 2 with');
    expect(result.history.readings).toHaveLength(1);
    expect(result.history.readings[0]).toMatchObject({ run: 7, attempt: 2 });
    // 169 s on the battery in attempt 2 against 109 s in attempt 1: the row that was appended is
    // the measurement the flag named, and the run id alone could not have said which it was.
    expect(result.history.readings[0].jobs.batteries['Slow battery'].seconds).toBe(169);
    // And the recording is the newer attempt, byte for byte, because a seed is not a recording.
    expect(result.held).toBe(recording);
  });

  it('refuses a seed that is a newer attempt of the recorded run, because that measurement is the recording', async () => {
    // The other direction of the same pair: attempt 2 of the run being recorded is the newest
    // measurement of that tree, so it is the recording waiting to happen rather than a day beside
    // it. Both coordinates are printed, because `run 7` on both sides of the comparison would be
    // the half-a-reading defect one file over (finding 646).
    const result = await withApi(async (env) => runRecorder(env, ['--seed', '--attempt', '2']), undefined, {
      recording: JSON.stringify({
        ...recordingOf({ batteries: { steps: { 'Slow battery': 100 } } }),
        run: 7,
        attempt: 1,
      }),
      attempts: 2,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--seed names run 7 attempt 2, which is newer than the recording (run 7)');
    expect(result.stderr).toContain('the recording, not a seed');
  });

  it('refuses a run that shares no command with this workflow', async () => {
    const result = await withApi(
      async (env) => runRecorder(env, ['--seed']),
      undefined,
      {
        workflow: workflowText([{ id: 'batteries', minutes: 25, steps: [...step('Renamed battery', 12)] }]),
        recording: JSON.stringify({ ...recordingOf({ batteries: { steps: { 'Slow battery': 100 } } }), run: 900 }),
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('measured no step this workflow has');
  });

  it('refuses a seed it cannot compare with a recording it could not parse', async () => {
    const result = await withApi(async (env) => runRecorder(env, ['--seed']), undefined, {
      recording: '{ not json',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('cannot be parsed');
    expect(result.stderr).toContain('a seed is a day older than the recording');
  });

  it('refuses --seed with --borrow, because a borrowed seed measured nothing', async () => {
    const result = await withApi(async (env) => runRecorder(env, ['--seed', '--borrow', 'artefacts=batteries']));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('say different things');
    expect(result.stderr).toContain('no run of that command produced');
  });
});
