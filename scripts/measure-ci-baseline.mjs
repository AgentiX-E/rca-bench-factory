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
 * Usage: `node scripts/measure-ci-baseline.mjs <run-id> [--borrow <job>=<ran>]`
 * with `GITHUB_TOKEN` set.
 *
 * `RCA_GITHUB_API`, `RCA_CI_WORKFLOW` and `RCA_CI_OUT` are read only by
 * `ci-budget.test.ts`, which answers from a local server and a fixture workflow so that
 * the script's network-shaped refusals are reached by a test rather than by nobody.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { jobsOf, stepsOf } from './ci-budget.mjs';
import { readWorkflow, workflowPath } from './gate-steps.mjs';

const TOKEN = process.env.GITHUB_TOKEN ?? '';
const RUN = process.argv[2] ?? '';
const OWNER = 'AgentiX-E';
const REPO = 'rca-bench-factory';
const OUT = resolve(
  process.env['RCA_CI_OUT'] ?? join(import.meta.dirname, '..', 'golden-master', 'ci-baseline.json'),
);
// The API root is a seam for the same reason `RCA_CI_WORKFLOW` and `RCA_CI_BASELINE`
// are: three of this script's refusals -- a non-200 answer, a run that carries no job
// of that name, and the success path that writes the file -- can only be reached by a
// network that answers. Without the seam the throws below were executed by nothing,
// and a refusal no test reaches is a refusal that can break without a word. Only this
// script reads the variable; the shipped value is the real host.
const API = process.env['RCA_GITHUB_API'] ?? 'https://api.github.com';

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

if (TOKEN === '' || !/^\d+$/.test(RUN)) {
  process.stderr.write(
    'usage: GITHUB_TOKEN=… node scripts/measure-ci-baseline.mjs <run-id> [--borrow <job>=<ran>]\n',
  );
  process.exit(2);
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
// GitHub reports a job under its `name:` when it has one and under its id when it does
// not, so the key the API answers to is the label the reader kept, or the id.
const apiNameOf = (job) => (job.name === '' ? job.id : job.name);
for (const job of jobsOf(workflow)) {
  const borrowedFrom = BORROW.get(job.id);
  const source =
    borrowedFrom === undefined
      ? byName.get(apiNameOf(job))
      : byName.get(byId.has(borrowedFrom) ? apiNameOf(byId.get(borrowedFrom)) : '\u0000');
  if (borrowedFrom !== undefined && !byId.has(borrowedFrom)) {
    throw new Error(`--borrow names \`${borrowedFrom}\`, which is not a job of this workflow`);
  }
  if (source === undefined) {
    throw new Error(`run ${RUN} holds no job named "${apiNameOf(job)}", so \`${job.id}\` has no reading`);
  }
  const measured = secondsByName(source);
  const steps = {};
  for (const step of stepsOf(workflow, job.id)) {
    const seconds = measured.get(step.name);
    if (seconds === undefined) {
      throw new Error(
        `\`${job.id} / ${step.name}\` is not a step of "${source.name}" in run ${RUN}: a bound cannot be ` +
          'sized from a step that did not run',
      );
    }
    steps[step.name] = seconds;
  }
  recorded[job.id] = { name: job.name, timeoutMinutes: job.timeoutMinutes, steps };
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
writeFileSync(OUT, `${JSON.stringify(reading, null, 2)}\n`);
process.stdout.write(
  `ci-baseline: ${String(Object.keys(recorded).length)} job(s) and ${String(stepCount)} step(s) from ` +
    `run ${RUN}${Object.keys(derived).length > 0 ? `, ${String(Object.keys(derived).length)} borrowed` : ''}\n`,
);
