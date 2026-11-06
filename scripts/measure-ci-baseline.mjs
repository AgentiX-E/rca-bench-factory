#!/usr/bin/env node
/**
 * Record how long every step of every CI job took, so a budget can be a multiple of it.
 *
 * ## Why a file rather than a number in `ci.yml`
 *
 * The batteries job spends twenty of its thirty minutes, and every one of those
 * minutes is spent inside a step with no bound of its own. When a mutation hangs,
 * the job's budget is what expires, and the verdict says "the job timed out" --
 * which names no battery, and the reader is left to guess at fourteen steps.
 *
 * A step-level `timeout-minutes` fixes the naming, and it needs a number. A number
 * typed from memory is a number that rots (finding 202): the batteries grow with the
 * suite, and a bound written to fit today's tree is a bound that will one day refuse
 * a legitimate run. So the number is a **multiple of a measurement**, the measurement
 * is recorded here with the run it came from, and `check-ci-budget.mjs` refuses a
 * workflow whose bounds and whose record disagree.
 *
 * ## Why it now records every job rather than the one that failed
 *
 * A recording that names one job answers one job's questions. The gate could
 * therefore not ask the question that mattered -- *does this job bound its steps at
 * all* -- of any job it had no reading for, which is every job except the one that
 * had already timed out. The file holds `jobs`, keyed by the workflow's own job id,
 * and the list of jobs comes from `gate-steps.mjs`, so it cannot drift from the one
 * CI runs.
 *
 * ## Why a job may be recorded from another job's steps
 *
 * A split is the one moment the arithmetic cannot be satisfied by measuring: the two
 * jobs exist only after the change, and the recording has to exist before CI will
 * accept the change. The steps themselves are the same commands, and a step's cost
 * does not depend on which job it sits in. So `--borrow <new>=<ran>` records the new
 * job's steps from the seconds the named job measured for them, and the file says
 * which job it borrowed from -- a derivation written down, rather than a number
 * somebody typed. The next green run is recorded without it.
 *
 * ## Why this is not part of the gate
 *
 * It reaches `api.github.com` with a token. A gate that needs the network is a gate
 * that fails for a reason that is not about the tree, and CI has no such token. So the
 * recording is a deliberate act, run by hand after a green CI run, and the gate reads
 * only the file it produced.
 *
 * ## Why an older run may be appended without being the recording
 *
 * `R10` divides a bound by the slowest reading of the command it bounds, and a bound is
 * only as good as the worst day the history has seen. A history that starts today sees
 * one machine population on one afternoon, which is the defect `R10` was written for,
 * one level up: a maximum taken over a sample of one.
 *
 * So `--seed <run-id>` appends a past day and never touches the recording. The run may
 * be a tree this workflow no longer has -- a job added last round is not in a run from
 * before it -- and that is the point: a rule that demanded every job of today's workflow
 * in every past day would delete exactly the slow days a bound needs, and adding a job
 * would silently reset the evidence to nothing. The recording keeps the strict rule,
 * because bounds are sized from it and a gap there would be a bound with no reading.
 *
 * Usage: `node scripts/measure-ci-baseline.mjs <run-id> [--borrow <job>=<ran>] [--seed]`
 * with `GITHUB_TOKEN` set.
 *
 * `RCA_GITHUB_API`, `RCA_CI_WORKFLOW` and `RCA_CI_OUT` are read only by
 * `ci-budget.test.ts`, which answers from a local server and a fixture workflow so that
 * the script's network-shaped refusals are reached by a test rather than by nobody.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { commandOf, jobsOf, mergeReading, readReadings, stepsOf } from './ci-budget.mjs';
import { readWorkflow, workflowPath } from './gate-steps.mjs';

const TOKEN = process.env.GITHUB_TOKEN ?? '';
const RUN = process.argv[2] ?? '';
const OWNER = 'AgentiX-E';
const REPO = 'rca-bench-factory';
const OUT = resolve(
  process.env['RCA_CI_OUT'] ?? join(import.meta.dirname, '..', 'golden-master', 'ci-baseline.json'),
);

/**
 * Where the history of readings lives, and why the recording is now one entry in it.
 *
 * `R10` divides a bound by the slowest reading of the command it bounds, and the
 * recording holds one day by construction. So every reading this script takes is also
 * appended here, with the command each step spent its seconds on -- and both files are
 * written from one measurement, which is why the gate can compare them second by second
 * and refuse a tree where only one of them was edited.
 *
 * A file that exists and cannot be read is left alone: this script's job is to record,
 * and silently replacing a history it could not parse would delete the slow day that
 * justifies a bound. The gate then refuses the missing reading, which is a sentence a
 * person can act on rather than a file that quietly got shorter.
 */
const READINGS = resolve(
  process.env['RCA_CI_READINGS'] ?? join(import.meta.dirname, '..', 'golden-master', 'ci-readings.json'),
);

// The API root is a seam for the same reason `RCA_CI_WORKFLOW` and `RCA_CI_BASELINE`
// are: three of this script's refusals -- a non-200 answer, a run that carries no job
// of that name, and the success path that writes the file -- can only be reached by a
// network that answers. Without the seam the throws below were executed by nothing,
// and a refusal no test reaches is a refusal that can break without a word. Only this
// script reads the variable; the shipped value is the real host.
const API = process.env['RCA_GITHUB_API'] ?? 'https://api.github.com';

/**
 * The declarations this tree has written, and which whole jobs are still waiting.
 *
 * A job promise (`R9`) is the one shape this script has to know about rather than leave
 * to the gate: the recording is the *answer* to a promise, and a job that has not run
 * cannot be in it. So a declared job the run did not report leaves a gap in the file
 * on purpose, and the first run that reports it fills the gap in the same commit the
 * round deletes the promise. `--borrow` is refused for such a job: borrowed seconds
 * would put its id in the recording without a run of that job ever having happened,
 * which is the exact shape `R6` refuses one level down.
 */
const DECLARATIONS = resolve(
  process.env['RCA_CI_DECLARATIONS'] ??
    join(import.meta.dirname, '..', 'golden-master', 'ci-declarations.json'),
);
const DECLARED_JOBS = new Set(
  existsSync(DECLARATIONS)
    ? (JSON.parse(readFileSync(DECLARATIONS, 'utf8'))?.jobs ?? []).map((one) =>
        String(one?.job ?? ''),
      )
    : [],
);

/**
 * `--borrow <new>=<ran>`: which job a job that has never run takes its seconds from.
 *
 * Read from the arguments rather than from the environment, because it is a statement
 * about this one recording and not a property of the machine. A pair that names no
 * job is refused below, where the workflow's jobs are known.
 */
function borrowPairs(argv) {
  const pairs = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--borrow') continue;
    const [job, ran] = String(argv[i + 1] ?? '').split('=');
    pairs.set(job ?? '', ran ?? '');
  }
  return pairs;
}

const BORROW = borrowPairs(process.argv.slice(3));

/**
 * `--seed`: this run is a past day, appended to the history and not to the recording.
 *
 * The two files are written from one measurement when the measurement is the recording.
 * A seed is the other relation: it is evidence about a command, taken on a day the
 * workflow may not have had today's shape, and the only thing it can answer is "how slow
 * has this command been". So it may be partial, and it may not replace the recording --
 * an older tree is not a description of the bounds CI will enforce.
 */
const SEED = process.argv.slice(3).includes('--seed');

if (TOKEN === '' || !/^\d+$/.test(RUN)) {
  process.stderr.write(
    'usage: GITHUB_TOKEN=… node scripts/measure-ci-baseline.mjs <run-id> [--borrow <job>=<ran>] [--seed]\n',
  );
  process.exit(2);
}
if (SEED && BORROW.size > 0) {
  throw new Error(
    '--seed and --borrow say different things: a seed is a day this run really measured, and a borrow is ' +
      'seconds borrowed from a job that ran the same commands. A borrowed seed would put a number in the ' +
      'history that no run of that command produced',
  );
}

async function get(path) {
  const response = await fetch(`${API}/repos/${OWNER}/${REPO}${path}`, {
    headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${String(response.status)}`);
  return response.json();
}

/**
 * Whole seconds, rounded up: a step that took 0.4 s took one second of somebody's budget.
 *
 * The runner's own bookkeeping steps are dropped. `Set up job`, `Complete job` and
 * `Post <action>` are not in the workflow, so they have no budget to argue about and a
 * baseline that kept them would fail the gate's "every entry names a step" rule for a
 * reason about GitHub rather than about this repository.
 */
const SYNTHETIC = /^(?:Set up job|Complete job|Post )/;

/** One API job's steps, by name, in seconds. */
function secondsByName(job) {
  const seconds = new Map();
  for (const step of job.steps) {
    if (SYNTHETIC.test(step.name)) continue;
    if (step.started_at === null || step.completed_at === null) continue;
    const ms = Date.parse(step.completed_at) - Date.parse(step.started_at);
    if (Number.isNaN(ms)) continue;
    seconds.set(step.name, Math.ceil(ms / 1000));
  }
  return seconds;
}

const workflow = readWorkflow(readFileSync(workflowPath(), 'utf8'));
if (workflow.errors.length > 0) {
  throw new Error(
    `the workflow does not parse, so there is nothing to measure:\n${workflow.errors.join('\n')}`,
  );
}

const run = await get(`/actions/runs/${RUN}`);
const jobs = await get(`/actions/runs/${RUN}/jobs?per_page=100`);
const byName = new Map(jobs.jobs.map((one) => [one.name, one]));
const byId = new Map(jobsOf(workflow).map((one) => [one.id, one]));

const recorded = {};
const derived = {};
// The command each step ran, per job, kept beside the seconds so the entry appended to
// the history is self-describing: `R10` compares a bound with every reading of *the
// command*, and a history that named steps would lose a series to a rename.
const history = {};
// What a seed could not find, reported rather than thrown: a job added last round is not
// in a run from before it, and the seconds that day spent on the commands it did run are
// still the worst day a bound has to survive.
const seedGaps = [];

/**
 * A seed describes a past tree, and a past tree is not the recording.
 *
 * The recording is what CI's bounds are sized against, so it has to be a run of the
 * workflow as it stands. An older run answers a different question -- how slow has this
 * command been -- and answering it does not make the run the newest day. Refusing here
 * rather than replacing the recording is the whole difference between the two files.
 */
if (SEED && existsSync(OUT)) {
  let held;
  try {
    held = JSON.parse(readFileSync(OUT, 'utf8'));
  } catch (error) {
    throw new Error(
      `the recording at ${OUT} cannot be parsed (${String(error)}), so a seed cannot be told from it: ` +
        'a seed is a day older than the recording, and the only file that says which day that is is unreadable',
    );
  }
  if (Number(RUN) > Number(held?.run ?? 0)) {
    throw new Error(
      `--seed names run ${RUN}, which is newer than the recording (run ${String(held?.run)}): a day that ` +
        'has not been recorded is the recording, not a seed, and appending it here would leave the bounds ' +
        'argued from a day the recording says is not the newest',
    );
  }
  if (Number(RUN) === Number(held?.run)) {
    throw new Error(
      `--seed names run ${RUN}, which is the recording: it is already in the history, and a second entry ` +
        'for one day would weight that day twice when the slowest reading is looked up',
    );
  }
}
// GitHub reports a job under its `name:` when it has one and under its id when it does
// not, so the key the API answers to is the label the reader kept, or the id.
const apiNameOf = (job) => (job.name === '' ? job.id : job.name);
for (const job of jobsOf(workflow)) {
  const borrowedFrom = BORROW.get(job.id);
  if (DECLARED_JOBS.has(job.id) && borrowedFrom !== undefined) {
    throw new Error(
      `--borrow ${job.id}=${borrowedFrom} names a declared job: a job promise waits for its ` +
        'first run, and a borrow is not a run -- the seconds would come from a different job ' +
        'and the promise would expire against a number nobody measured',
    );
  }
  const source =
    borrowedFrom === undefined
      ? byName.get(apiNameOf(job))
      : byName.get(byId.has(borrowedFrom) ? apiNameOf(byId.get(borrowedFrom)) : '\u0000');
  if (borrowedFrom !== undefined && !byId.has(borrowedFrom)) {
    throw new Error(`--borrow names \`${borrowedFrom}\`, which is not a job of this workflow`);
  }
  // A borrowed reading is a measurement of the *commands*, and a budget is not a command.
  // `R6` compares the recording's job budget with the workflow's, and a borrowed job
  // records the target's budget -- so for that job the check compares the workflow with
  // itself and can never fire, while the deadline arithmetic is argued from a ceiling the
  // borrowed seconds have never been spent inside. Two jobs whose steps are the same
  // commands are still told apart by what they are allowed to spend, and that is the one
  // thing a borrow cannot copy.
  const ranIn = borrowedFrom === undefined ? undefined : byId.get(borrowedFrom);
  if (ranIn !== undefined && ranIn.timeoutMinutes !== job.timeoutMinutes) {
    throw new Error(
      `--borrow ${job.id}=${borrowedFrom} crosses a budget: \`${job.id}\` declares ` +
        `${job.timeoutMinutes === null ? 'no budget' : `${String(job.timeoutMinutes)} minutes`} and ` +
        `\`${borrowedFrom}\` declares ` +
        `${ranIn.timeoutMinutes === null ? 'none' : `${String(ranIn.timeoutMinutes)} minutes`}. The seconds ` +
        'describe the same commands, but a bound has to fit the job that will enforce it, so a borrow is ' +
        'only a substitute for a measurement inside one budget',
    );
  }
  if (source === undefined) {
    if (SEED) {
      seedGaps.push(`\`${job.id}\` did not exist`);
      continue;
    }
    if (DECLARED_JOBS.has(job.id)) {
      // A declared job that this run did not report is a gap, not a failure. Writing
      // borrowed or invented seconds here would answer the promise with a measurement
      // of something else, and `R9` would then expire it against a number no run of
      // this job ever produced. `check-ci-budget` reads the same promise and the same
      // recording, so the gap is a state the gate can be green in.
      continue;
    }
    throw new Error(`run ${RUN} holds no job named "${apiNameOf(job)}", so \`${job.id}\` has no reading`);
  }
  const measured = secondsByName(source);
  const steps = {};
  const commands = {};
  for (const step of stepsOf(workflow, job.id)) {
    const seconds = measured.get(step.name);
    if (seconds === undefined) {
      if (SEED) {
        seedGaps.push(`\`${job.id} / ${step.name}\` did not run`);
        continue;
      }
      throw new Error(
        `\`${job.id} / ${step.name}\` is not a step of "${source.name}" in run ${RUN}: a bound cannot be ` +
          'sized from a step that did not run',
      );
    }
    steps[step.name] = seconds;
    commands[step.name] = commandOf(step);
  }
  // A job none of whose steps this workflow still has is a job from a different tree
  // altogether: its seconds measure nothing a bound of today could be written against.
  if (Object.keys(steps).length === 0) {
    seedGaps.push(`\`${job.id}\` ran no step this workflow still has`);
    continue;
  }
  recorded[job.id] = { name: job.name, timeoutMinutes: job.timeoutMinutes, steps };
  history[job.id] = commands;
  if (borrowedFrom !== undefined) {
    derived[job.id] =
      `its steps ran inside \`${borrowedFrom}\` in run ${RUN}, so these seconds are that job's measurement ` +
      'of the same commands rather than a second measurement of them';
  }
}

const reading = {
  // The reading, and where it came from. A baseline with no run is a number somebody
  // remembered.
  run: Number(RUN),
  commit: run.head_sha,
  measured: String((jobs.jobs[0]?.completed_at ?? run.updated_at ?? '').slice(0, 10)),
  jobs: recorded,
};
if (Object.keys(derived).length > 0) {
  reading.derived = derived;
  // The run this borrowed from ran a workflow in which the new job did not exist, so
  // the commit above describes the seconds and not the set of jobs they are checked
  // against. The first run of the new workflow replaces both.
  reading.note =
    'a job recorded here did not exist in the run its seconds came from, so this reading describes ' +
    'that run tree checked against the next one: record the first green run of this workflow to replace it';
}

const stepCount = Object.values(recorded).reduce((sum, one) => sum + Object.keys(one.steps).length, 0);
if (SEED && Object.keys(recorded).length === 0) {
  throw new Error(
    `run ${RUN} measured no step this workflow has, so it is not a day any bound of this tree could be ` +
      'argued from: a seed is evidence about these commands, and a run that shares none of them is ' +
      'evidence about a different workflow',
  );
}
// A seed is not the recording, so the recording is not written. The refusal above is the
// only place the two files are allowed to disagree, and it is a refusal rather than a
// quieter write for the reason every rule here is: a bound argued from the wrong day is
// indistinguishable from a bound argued from the right one until the day it fires.
if (!SEED) writeFileSync(OUT, `${JSON.stringify(reading, null, 2)}\n`);

/**
 * The same measurement, appended to the history `R10` divides by.
 *
 * One measurement, two files: `ci-baseline.json` is the day the bounds are argued from,
 * and `ci-readings.json` is every day anybody has measured, so that a bound can be
 * refused for being under a slow day that is already in the record. The seconds are
 * copied rather than re-derived, because a second derivation is a second answer.
 */
const entry = {
  run: Number(RUN),
  commit: run.head_sha,
  measured: reading.measured,
  jobs: {},
};
for (const [jobId, one] of Object.entries(recorded)) {
  const byStep = {};
  for (const [name, seconds] of Object.entries(one.steps)) {
    byStep[name] = { seconds, command: history[jobId][name] };
  }
  entry.jobs[jobId] = byStep;
}

let appended = null;
let historyNote = '';
if (!existsSync(READINGS)) {
  appended = mergeReading(null, entry);
} else {
  let existing;
  try {
    existing = JSON.parse(readFileSync(READINGS, 'utf8'));
  } catch (error) {
    historyNote = `; the readings at ${READINGS} cannot be parsed (${String(error)}), so this reading was not appended`;
  }
  if (existing !== undefined) {
    const checked = readReadings(existing);
    if (checked.errors.length === 0) {
      appended = mergeReading(existing, entry);
    } else {
      historyNote = `; the readings at ${READINGS} cannot be read (${String(checked.errors[0])}), so this reading was not appended`;
    }
  }
}
if (appended !== null) writeFileSync(READINGS, `${JSON.stringify(appended, null, 2)}\n`);

if (SEED) {
  // A seed answers no declaration: a promise is answered by a run of the job it promises,
  // and a day from before the job existed is not that run.
  process.stdout.write(
    `ci-baseline: seeded run ${RUN} with ${String(Object.keys(recorded).length)} of ` +
      `${String(jobsOf(workflow).length)} job(s) and ${String(stepCount)} step(s)` +
      `${seedGaps.length === 0 ? '' : `; ${String(seedGaps.length)} item(s) did not exist then: ${seedGaps.join(', ')}`}` +
      `${appended === null ? '' : `; the history holds ${String(appended.readings.length)} reading(s)`}` +
      `\n`,
  );
  if (historyNote !== '') process.stderr.write(`ci-baseline: ${historyNote.replace(/^; /, '')}\n`);
  process.exit(0);
}

/**
 * The declarations this recording has just answered.
 *
 * Deleting the sentence is the round's job and not this script's: the declaration says
 * why the step was added, and a tool that removed it would erase the only account of
 * that. So the count is printed here, at the moment the promise becomes measurable, and
 * `check-ci-budget` refuses the tree until the sentence is gone -- which is the same
 * round, because the recording and the deletion are one edit to the same kind of file.
 *
 * A declaration this run did not measure cannot reach this point: the loop above throws
 * for every step of the workflow the run did not report, declared or not.
 */
const declaredNow = existsSync(DECLARATIONS)
  ? JSON.parse(readFileSync(DECLARATIONS, 'utf8'))
  : undefined;
const declaredSteps = Array.isArray(declaredNow?.declared) ? declaredNow.declared : [];
const declaredJobsNow = Array.isArray(declaredNow?.jobs) ? declaredNow.jobs : [];
const answered = declaredSteps.filter(
  (one) => typeof recorded[String(one?.job ?? '')]?.steps?.[String(one?.step ?? '')] === 'number',
).length;
// A job promise is answered by the job itself appearing in the recording, not by one
// of its steps: the promise is about a budget, and `R4`/`R5` settle its bounds from
// every step's seconds once they exist.
const answeredJobs = declaredJobsNow.filter(
  (one) => recorded[String(one?.job ?? '')] !== undefined,
).length;
const waitingJobs = [...DECLARED_JOBS].filter((id) => recorded[id] === undefined).length;

process.stdout.write(
  `ci-baseline: ${String(Object.keys(recorded).length)} job(s) and ${String(stepCount)} step(s) from ` +
    `run ${RUN}${Object.keys(derived).length > 0 ? `, ${String(Object.keys(derived).length)} borrowed` : ''}` +
    `${answered === 0 ? '' : `; ${String(answered)} declaration(s) are now measured and can be deleted`}` +
    `${answeredJobs === 0 ? '' : `; ${String(answeredJobs)} job declaration(s) are now measured and can be deleted`}` +
    `${waitingJobs === 0 ? '' : `; ${String(waitingJobs)} job declaration(s) still awaiting their first run`}` +
    `${appended === null ? '' : `; the history holds ${String(appended.readings.length)} reading(s)`}` +
    `\n`,
);
if (historyNote !== '') process.stderr.write(`ci-baseline: ${historyNote.replace(/^; /, '')}\n`);
