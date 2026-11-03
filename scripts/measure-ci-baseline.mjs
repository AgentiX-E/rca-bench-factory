#!/usr/bin/env node
/**
 * Record how long each step of one CI job took, so a budget can be a multiple of it.
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
 * is recorded here with the run it came from, and `check-battery-budget.mjs` refuses
 * a workflow whose bounds and whose record disagree.
 *
 * ## Why this is not part of the gate
 *
 * It reaches `api.github.com` with a token. A gate that needs the network is a gate
 * that fails for a reason that is not about the tree, and CI has no such token. So the
 * recording is a deliberate act, run by hand after a green CI run, and the gate reads
 * only the file it produced.
 *
 * Usage: `node scripts/measure-ci-baseline.mjs <run-id>` with `GITHUB_TOKEN` set.
 *
 * `RCA_GITHUB_API` and `RCA_CI_OUT` are read only by `battery-budget.test.ts`, which
 * answers from a local server so that the script's three network-shaped refusals are
 * reached by a test rather than by nobody. See the constants below.
 */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TOKEN = process.env.GITHUB_TOKEN ?? '';
const RUN = process.argv[2] ?? '';
const OWNER = 'AgentiX-E';
const REPO = 'rca-bench-factory';
const JOB = 'batteries';
const OUT = resolve(
  process.env['RCA_CI_OUT'] ?? join(import.meta.dirname, '..', 'golden-master', 'ci-baseline.json'),
);
// The API root is a seam for the same reason `RCA_CI_WORKFLOW` and `RCA_CI_BASELINE`
// are: three of this script's four refusals -- a non-200 answer, a run whose jobs
// carry no `batteries` job, and the success path that writes the file -- can only be
// reached by a network that answers. Without the seam the two top-level throws below
// were executed by nothing, and a refusal no test reaches is a refusal that can break
// without a word. Only this script reads the variable; the shipped value is the real
// host and an unset variable is the shipped value.
const API = process.env['RCA_GITHUB_API'] ?? 'https://api.github.com';

if (TOKEN === '' || !/^\d+$/.test(RUN)) {
  process.stderr.write('usage: GITHUB_TOKEN=… node scripts/measure-ci-baseline.mjs <run-id>\n');
  process.exit(2);
}

async function get(path) {
  const response = await fetch(`${API}/repos/${OWNER}/${REPO}${path}`, {
    headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${String(response.status)}`);
  return response.json();
}

const run = await get(`/actions/runs/${RUN}`);
const jobs = await get(`/actions/runs/${RUN}/jobs?per_page=20`);
const job = jobs.jobs.find((one) => one.name.toLowerCase().includes(JOB));
if (job === undefined) throw new Error(`run ${RUN} holds no job matching "${JOB}"`);

/**
 * Whole seconds, rounded up: a step that took 0.4 s took one second of somebody's budget.
 *
 * The runner's own bookkeeping steps are dropped. `Set up job`, `Complete job` and
 * `Post <action>` are not in the workflow, so they have no budget to argue about and a
 * baseline that kept them would fail the gate's "every entry names a step" rule for a
 * reason about GitHub rather than about this repository.
 */
const SYNTHETIC = /^(?:Set up job|Complete job|Post )/;
const steps = {};
for (const step of job.steps) {
  if (SYNTHETIC.test(step.name)) continue;
  if (step.started_at === null || step.completed_at === null) continue;
  const ms = Date.parse(step.completed_at) - Date.parse(step.started_at);
  if (Number.isNaN(ms)) continue;
  steps[step.name] = Math.ceil(ms / 1000);
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      // The reading, and where it came from. A baseline with no run is a number
      // somebody remembered.
      run: Number(RUN),
      commit: run.head_sha,
      measured: (job.completed_at ?? '').slice(0, 10),
      job: JOB,
      jobTimeoutMinutes: 30,
      steps,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`ci-baseline: ${String(Object.keys(steps).length)} step(s) from run ${RUN}\n`);
