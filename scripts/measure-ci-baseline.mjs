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
 * "Older" is a pair, not a number: a re-run is a second *attempt* of one run id, so
 * `--seed --attempt 1` against a recording of attempt 2 is a day older than the
 * recording and the same tree -- one tree read twice, which is the pair a bound's margin
 * is measured against. The recording itself may only move forward, because `R10` holds it
 * to the history's newest reading, and a recorder that moved it backwards would write the
 * tree the gate refuses with advice to do what the recorder had just been asked to do.
 *
 * ## Why a red day's numbers are held against the bound *that day* enforced
 *
 * A `failure` conclusion on a step means one of two things and says neither: the command
 * ran to its end and returned non-zero, or the runner stopped it at the step's own
 * `timeout-minutes`. The seconds differ in kind between them -- a duration, or the bound
 * read back -- and a history `R10` divides by may not hold the second.
 *
 * `O-127` separated the two by arithmetic: a step that ends on its own ends *before* its
 * bound, because the bound is when the runner kills it, so a number equal to the bound is
 * that bound. The arithmetic needs **the bound the runner was enforcing**, and a seed's
 * day is not today: today's `ci.yml` bounds the step at a number that may be wider or
 * narrower than the one in force then, and reading it against the wrong one refuses a real
 * duration or keeps a bound.
 *
 * So a red day costs one request: `GET /contents/.github/workflows/ci.yml?ref=<head_sha>`,
 * read with the same line reader the gate uses, and each `failure` step's seconds compared
 * with the bound that file states for it. Three answers, three acts:
 *
 *  - that day bounded the step at `N` minutes and the step spent at least `N * 60` s: the
 *    number is that bound, and the step is dropped with a line naming `N`;
 *  - that day bounded the step nowhere: the runner's own bound cannot have stopped it,
 *    so the number is a duration and the step is kept;
 *  - that day's workflow cannot be read at all: the question is open, and a seed that
 *    answered it by guessing would append a day with its slow steps missing. The day is
 *    refused, and the reader is told which request failed.
 *
 * ## Why every seed is asked which command it ran, and not only a red one
 *
 * A reading is not a number. `R10` divides a bound by the slowest reading **of the command
 * the bound bounds**, so every entry in the history is a number beside the command that
 * spent it, and the whole file is keyed that way -- `commandOf(step)`, not `step.name`.
 *
 * A seed takes its numbers from a run and its commands from **today's** workflow: the loop
 * walks today's steps, finds the run's step of the same name, and writes today's command
 * beside the run's seconds. A name is not a command. The two diverge the ordinary way --
 * a step whose `run:` line gained an argument under the same label -- and when they do, the
 * history records that today's command took a number another command spent, and `R10`
 * sizes today's bound from it. Seven of the thirty-seven trees in the shipped history
 * differ from today's at a shared step name, so this is not a hypothetical day.
 *
 * So the request is made for **every** seed, not only one that holds a stopped step, and
 * it answers two questions at once: which command spent this number, and what bound could
 * have stopped it. A step the day does not place, or places under another command, is
 * dropped with a line that says which of the two facts it is. A green day pays the same
 * request, because it is asked the first question too -- `v3.146` priced the request at the
 * days that hold a stopped step, which was the price of the bound question alone.
 *
 * ## Why a recording asks the same question of the tree on disk
 *
 * A recording takes the numbers from a run and the commands from the file on disk, and
 * nothing compared the two: the reading says `commit: <head_sha>` and the gate never reads
 * it. A recording taken on a tree that had moved on therefore wrote today's command beside
 * an older command's seconds, which is the seed's mistake one path over. The same document
 * answers it -- the workflow at the run's commit -- and the disk is held to it: a step the
 * two trees have under two commands, or a step only one of them has, refuses the recording.
 * A `--borrow` is not drift: the borrowed job exists only on disk by construction, and its
 * seconds are another job's measurement of the same commands, which the entry states.
 *
 * ## `--relabel-actions`: the rows written before an action had a name of its own (`O-132`)
 *
 * Until v3.148 a step with no `run:` was identified by its **name** -- `step:Check out` -- so the
 * action a row was spent by was not in the history at all. The identity now includes the action and
 * its version, and every reading taken from here on states it. The rows already written state a
 * name, and leaving them that way would split one step's series in two: the history would answer
 * "what has a checkout cost" with the newest days only, which is losing the slow day a bound is
 * sized from -- the defect `R10` exists to remove, one file over.
 *
 * The rewrite is a derivation and not an invention: the same document every other question here
 * uses, the workflow **at the row's own commit**, says which action that step ran. A repository
 * with no network can read neither this mode nor the histories it repairs, which is why the mode
 * lives in the tool that owns provenance rather than in a script beside it.
 *
 * A row whose file and whose stored command disagree is refused rather than rewritten. The two
 * shapes are a row naming an action other than the one that commit ran, and a row naming a step
 * where that commit runs a command; both say the history was edited, or written by a rule this
 * tree never had, and neither is a name the file at the commit can turn into a command.
 *
 * Usage: `node scripts/measure-ci-baseline.mjs <run-id> [--borrow <job>=<ran>] [--seed]`
 *        `node scripts/measure-ci-baseline.mjs --relabel-actions`
 * with `GITHUB_TOKEN` set.
 *
 * `RCA_GITHUB_API`, `RCA_CI_WORKFLOW` and `RCA_CI_OUT` are read only by
 * `ci-budget.test.ts`, which answers from a local server and a fixture workflow so that
 * the script's network-shaped refusals are reached by a test rather than by nobody.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { commandOf, coordinateOf, jobsOf, mergeReading, orderOf, readReadings, stepsOf } from './ci-budget.mjs';
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

/**
 * `--attempt <n>`: which measurement of a run to record, when the run was measured more than once.
 *
 * A re-run of a workflow run is a second **attempt** of the same run id (`O-114`), and GitHub
 * reports only the latest one unless it is asked for all of them: `filter=all` is what makes the
 * first attempt's seconds reachable after the second has run. Without that flag the two attempts
 * are one id with two answers, and the history -- which keys a reading by the measurement, not by
 * the id -- could hold neither of them.
 *
 * The default is the run's own `run_attempt`, which is what the API's unfiltered endpoint returns
 * and what every recording taken before this flag existed measured.
 *
 * The flag names an older measurement as often as a newer one, and the two uses are different
 * acts: a recording may only move forward (`R10` holds it to the history's newest reading), while
 * `--seed --attempt 1` against a recording of attempt 2 appends a second reading of one tree. The
 * argument is parsed here; which of the two it is, is decided where the recording is read.
 */
const ATTEMPT = (() => {
  const at = process.argv.slice(3).indexOf('--attempt');
  if (at < 0) return null;
  const value = Number(process.argv.slice(3)[at + 1]);
  return Number.isInteger(value) && value >= 1 ? value : NaN;
})();

/**
 * `--relabel-actions`: rewrite the rows that name a step into the action that step ran (`O-132`).
 *
 * A mode rather than a run: it is a statement about the history's own past, and the run ids it
 * reads are the ones each row already carries. It is parsed from anywhere in the argument list
 * because it names no run, so there is no position the run id could occupy -- and a flag that had
 * to be written in one position is a flag a person gets wrong once and never discovers.
 */
const RELABEL = process.argv.slice(2).includes('--relabel-actions');

// One usage refusal for both ways to call this script, because the two questions it answers are one:
// *is there a token*, and *is this a run id or the mode that reads the history*. Two exits would be two
// sites in the inventory, two proofs, and one sentence written twice.
//
// The second clause is excused for the mode rather than restated inside it: `--relabel-actions` occupies
// the position a run id occupies, so a digits test applied to it would refuse the only way the mode can
// be called.
if (TOKEN === '' || (!RELABEL && (!/^\d+$/.test(RUN) || Number.isNaN(ATTEMPT)))) {
  process.stderr.write(
    'usage: GITHUB_TOKEN=… node scripts/measure-ci-baseline.mjs <run-id> [--attempt <n>] ' +
      '[--borrow <job>=<ran>] [--seed]\n' +
      '       GITHUB_TOKEN=… node scripts/measure-ci-baseline.mjs --relabel-actions\n',
  );
  process.exit(2);
}

if (RELABEL) {
  // The mode reads the history and asks GitHub about each reading's commit; a run id, an attempt or
  // a borrow belongs to a measurement, and accepting one here would leave the reader believing it
  // had been used. A seed is the sharpest case: `--seed` says "append this run", and this mode
  // appends nothing.
  if (SEED || BORROW.size > 0 || ATTEMPT !== null || /^\d+$/.test(RUN)) {
    throw new Error(
      '--relabel-actions rewrites the rows already in the history and measures nothing, so it takes no ' +
        'run id, no --attempt, no --borrow and no --seed: those name a measurement, and a mode that ' +
        'silently ignored one would answer a different question than the one it was asked',
    );
  }
  await relabelActions();
  process.exit(0);
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

/**
 * The job's own wall clock, in whole seconds, rounded up like the steps.
 *
 * The difference between this and the sum of the steps is the seconds **no step spends**: the
 * runner's own setup, its teardown, and the `Post` half of every action, none of which the
 * workflow declares and none of which a step bound can cover. `R13` holds a ceiling to the
 * bounds plus this, so it is measured here rather than stated as a margin somewhere -- a
 * margin nobody measured is a margin nobody checked (finding 619).
 */
function totalSecondsOf(job) {
  if (job.started_at === null || job.completed_at === null) return null;
  const ms = Date.parse(job.completed_at) - Date.parse(job.started_at);
  return Number.isNaN(ms) ? null : Math.ceil(ms / 1000);
}

/** One API job's steps, by name: the seconds, and the conclusion the API attached to them. */
function secondsByName(job) {
  const found = new Map();
  for (const step of job.steps) {
    if (SYNTHETIC.test(step.name)) continue;
    // A conclusion of `null` is a step that had not finished when the report was made, and one that is
    // absent is a report that does not describe the step it names. Both are kept as they are rather than
    // read as success: what a seed may append is decided by this field.
    const conclusion = step.conclusion ?? null;
    if (step.started_at === null || step.completed_at === null) {
      found.set(step.name, { seconds: null, conclusion });
      continue;
    }
    const ms = Date.parse(step.completed_at) - Date.parse(step.started_at);
    found.set(step.name, { seconds: Number.isNaN(ms) ? null : Math.ceil(ms / 1000), conclusion });
  }
  return found;
}

/**
 * Whether a step's number is a duration the command spent.
 *
 * A step that ran to its own end reports `success` or `failure`: the command finished, and whether it
 * returned zero is a question about the command rather than about its duration. `cancelled` and `skipped`
 * say the step was stopped or never started, so its seconds are a lower bound on what the command takes --
 * or, for the step killed by its own bound, exactly that bound (`O-127`).
 */
function endedOnItsOwn(conclusion) {
  return conclusion === 'success' || conclusion === 'failure';
}

/**
 * The workflow the run used, read from the commit the run reports.
 *
 * Read with the same line reader the gate uses on today's file, and the strict reader is the
 * point: a file it refuses may hold a `timeout-minutes` at an indent this repository never
 * writes, and a bound read from the wrong line decides whether a duration enters the history.
 * So a refusal here is an answer -- *this tree cannot be asked* -- rather than a reason to
 * fall back on today's numbers, which are a different tree's.
 *
 * ## How far a refusal reaches (`O-130`)
 *
 * The reader names the scope of every refusal, and this function stops only for `file`: a file
 * with no `jobs:` block, a step before any job, or zero steps has no shape to place anything in,
 * so the day is refused as a whole and there is nothing to hand back.
 *
 * A `job` or `step` refusal is returned with the rest, because the two callers need different
 * things from it and both are decided by how far the doubt spreads:
 *
 * - A **seed** asks one question per number -- *which command spent it, and what bound could have
 *   stopped it* -- and both are facts about that step's own lines. A job whose step list this
 *   reader could not finish is a job whose steps cannot be placed; the other jobs' steps are
 *   untouched by it, and dropping the day would lose numbers nothing was in doubt about.
 * - A **recording** asks whether two trees are one, and that is a question about **both** trees.
 *   A job this reader could not describe could hold the very difference the comparison exists to
 *   find, so a recording is refused whole (`driftOf`) rather than partly compared.
 */
async function workflowOfThatDay(headSha) {
  const body = await get(`/contents/.github/workflows/ci.yml?ref=${encodeURIComponent(headSha)}`);
  const text =
    typeof body?.content === 'string' ? Buffer.from(body.content, 'base64').toString('utf8') : '';
  const then = readWorkflow(text);
  const fatal = (then.refusals ?? []).find((one) => one.scope === 'file');
  if (fatal !== undefined) throw new Error(String(fatal.message));
  return then;
}

/**
 * The parts of a day's workflow this reader could not read, and the sentence that says why.
 *
 * Two maps because the scope is two: a job whose step list is uncertain (`jobs`), and one step
 * that cannot be read (`steps`, keyed `job\u0000name`). Their readers are the sentences the seed
 * writes beside a dropped number -- "the workflow of that day has no job `x`" and "has a job this
 * reader cannot read" are different acts for whoever comes next (`O-130`).
 */
function unreadableOf(workflow) {
  const jobs = new Map();
  const steps = new Map();
  for (const refusal of workflow.refusals ?? []) {
    if (refusal.scope === 'job' && refusal.job !== null) jobs.set(refusal.job, refusal.message);
    if (refusal.scope === 'step' && refusal.job !== null && refusal.step !== null) {
      steps.set(`${refusal.job}\u0000${refusal.step}`, refusal.message);
    }
  }
  return { jobs, steps };
}

/**
 * One workflow's steps, by job and then by name: the command it runs, and the bound of its own.
 *
 * The name is the key because a name is what the two trees can be compared by -- the API reports
 * steps by name, and no field of a report carries the command. The command is what the reading is
 * keyed by, which is why every caller compares the two before it writes anything.
 *
 * Only a bound of the step's own is recorded: a step that inherits its job's budget is stopped by
 * the job's timeout, and GitHub reports that as `cancelled`, which a seed already drops. A job or a
 * step absent from the workflow has no entry, which is what lets a caller say "this workflow cannot
 * place it" rather than "it had no bound".
 *
 * A job or step this reader refused is absent for the same reason, and that is why the refusals are
 * read here rather than left to the caller: a step whose block was not understood has no command this
 * function could honestly report, and a placeholder would be the guess the reader exists to refuse.
 * The caller that needs to tell *absent* from *unreadable* asks `unreadableOf`.
 */
function stepsOfDay(workflow) {
  const unreadable = unreadableOf(workflow);
  const byJob = new Map();
  for (const job of jobsOf(workflow)) {
    if (unreadable.jobs.has(job.id)) continue;
    const steps = new Map();
    for (const step of stepsOf(workflow, job.id)) {
      if (unreadable.steps.has(`${job.id}\u0000${step.name}`)) continue;
      steps.set(step.name, {
        command: commandOf(step),
        minutes: step.inheritedFrom === 'step' ? step.minutes : null,
      });
    }
    byJob.set(job.id, steps);
  }
  return byJob;
}

/**
 * Where the workflow on disk stops being the workflow the run used, or `null` when they are one tree.
 *
 * A recording takes the numbers from a run and the commands from the file on disk, and until this
 * round nothing compared the two: the entry says `commit: <head_sha>` and the gate never reads it, so
 * a recording taken on a tree that had moved on wrote today's command beside an older command's
 * seconds -- and `R10` then divided today's bound by a number a different command spent.
 *
 * Both directions are refused, because both are the same mistake, and the two acts that fix them are
 * different: a step the two trees have under two commands means the tree is at another commit, and a
 * step only one of them has means the tree is older or newer than the run rather than *at* it.
 *
 * A `--borrow` is not drift. The borrowed job exists only on disk, by construction, and its seconds
 * are another job's measurement of the same commands -- which the entry says in `derived`. The same
 * holds for a job this run did not report at all: the loop's own sentence covers it, and a declared
 * job waiting for its first run is a state the gate is green in.
 *
 * ## A tree this reader could not read is the first place the two stop being comparable (`O-130`)
 *
 * A seed drops the numbers a refusal puts in doubt and keeps the rest, because a number is a fact
 * about one step. This comparison is not that: it asks whether **two trees are one**, so a job this
 * reader could not describe is a job whose difference cannot be ruled out -- and the answer "no
 * drift" would be a claim about a comparison that never happened. It is also the shape that hides:
 * a job omitted from the day's map reads as *a job the run did not report*, which this function
 * already tolerates, so without this the unreadable job would be the one place a drift could sit.
 */
function driftOf(onDisk, committed, headSha, unreadable = { jobs: new Map(), steps: new Map() }) {
  const at = String(headSha).slice(0, 7);
  const firstJob = [...unreadable.jobs.entries()][0];
  if (firstJob !== undefined) {
    return (
      `\`${firstJob[0]}\` is a job of the tree this run used (${at}) that this reader cannot read ` +
      `(${String(firstJob[1])}): a recording writes one file about one tree, and a job whose step list ` +
      'is unknown could hold the very difference this comparison exists to find. Commit a workflow this ' +
      'reader can read, or record a run of this one; `--seed` appends a day and drops only the steps it ' +
      'cannot place'
    );
  }
  const firstStep = [...unreadable.steps.entries()][0];
  if (firstStep !== undefined) {
    const [key, why] = firstStep;
    const [jobId, name] = key.split('\u0000');
    return (
      `\`${jobId} / ${name}\` is a step of the tree this run used (${at}) that this reader cannot read ` +
      `(${String(why)}): a recording writes that step's seconds beside the command the tree on disk states, ` +
      'and a step whose own block was not understood has no command this tree can state. Fix the step, or ' +
      'record a run of a tree this reader can read; `--seed` drops the step and keeps the day'
    );
  }
  for (const [jobId, steps] of onDisk) {
    const then = committed.get(jobId);
    if (then === undefined) continue;
    for (const [name, mine] of steps) {
      const theirs = then.get(name);
      if (theirs === undefined || theirs.command === mine.command) continue;
      return (
        `\`${jobId} / ${name}\` runs \`${mine.command}\` on disk and ran \`${theirs.command}\` in the tree ` +
        `this run used (${at}): a recording writes the command beside each number, so the two have to be ` +
        'the same command -- check out that commit, or commit this workflow and record the run of it'
      );
    }
  }
  for (const [jobId, steps] of committed) {
    const mine = onDisk.get(jobId);
    if (mine === undefined) {
      return (
        `\`${jobId}\` is a job of the tree this run used (${at}) and not of the one on disk: the workflow ` +
        'here is at another commit, so recording this run would leave the job out of both files -- check ' +
        'out that commit, or commit this workflow and record the run of it'
      );
    }
    for (const name of steps.keys()) {
      if (mine.has(name)) continue;
      return (
        `\`${jobId} / ${name}\` is a step of the tree this run used (${at}) and not of the one on disk: ` +
        'recording it would leave that number out of every file -- check out that commit, or commit this ' +
        'workflow and record the run of it'
      );
    }
  }
  return null;
}

/**
 * Give every row that names its step the action the step ran, read from that row's own commit.
 *
 * The history's rows are self-describing: each carries the command its seconds were spent on. The
 * rows written before v3.148 carry a step **name** where the step has no `run:` of its own, and
 * that name is not the command -- `actions/checkout@v3` and `@v4` are one row under it. The
 * identity now includes the action, so the old rows have to be given theirs, and the only document
 * that can say which one they ran is the workflow at the commit each row records.
 *
 * ## What is rewritten, and what is refused
 *
 * Exactly the rows whose stored command is `step:<the step's own name>` **and** whose commit's step
 * uses an action. Every other row is left alone: a `run:` step's row already holds the command its
 * commit states (v3.147 measured that over the whole population, 3,217 of 3,217), and a row that
 * already names an action is compared rather than rewritten, so this mode is also the audit that
 * the history agrees with the trees it names.
 *
 * A disagreement is a refusal and not a repair. Two shapes, and both mean the file was edited or
 * written by a rule this tree never had: a row carrying another action than its commit's, and a row
 * carrying a name where its commit runs a command. Neither can be turned into a command by reading
 * the commit, and writing one anyway would put a number beside a command nothing says spent it.
 *
 * ## The cost
 *
 * One request per **commit**, not per reading: two attempts of one run share a tree, and the two
 * readings of it must be given the same action. Measured over the shipped history: 40 readings on
 * 39 commits, so 39 requests for 3,217 rows.
 */
async function relabelActions() {
  let held;
  try {
    held = JSON.parse(readFileSync(READINGS, 'utf8'));
  } catch (error) {
    throw new Error(
      `the readings at ${READINGS} cannot be parsed (${String(error)}), so no row can be given the action ` +
        'it spent its seconds on: the file is one JSON object in git, and restoring it is the act that ' +
        'makes the question answerable again',
    );
  }
  const readings = Array.isArray(held?.readings) ? held.readings : [];
  if (readings.length === 0) {
    throw new Error(
      `the readings at ${READINGS} hold no reading, so there is no row to relabel: this mode rewrites the ` +
        'rows an earlier recorder wrote under a step name, and a history with no reading has none of them',
    );
  }
  const dayOf = new Map();
  let rows = 0;
  let relabelled = 0;
  for (const reading of readings) {
    const commit = String(reading?.commit ?? '');
    if (!dayOf.has(commit)) {
      // Fetched once per tree: two attempts of one run are two readings of one commit, and the file
      // that says what a step ran is a fact about the tree rather than about the attempt.
      try {
        const read = await workflowOfThatDay(commit);
        dayOf.set(commit, { steps: stepsOfDay(read), unreadable: unreadableOf(read) });
      } catch (error) {
        throw new Error(
          `run ${String(reading?.run)} records the tree at ${commit.slice(0, 7)}, and the workflow there ` +
            `cannot be read (${error instanceof Error ? error.message : String(error)}): the action a row ` +
            'names has to be read from the commit the row records, and a tree this reader cannot read ' +
            'leaves its rows exactly as they are',
        );
      }
    }
    const { steps: day, unreadable } = dayOf.get(commit);
    const at = commit.slice(0, 7);
    for (const [jobId, steps] of Object.entries(reading?.jobs ?? {})) {
      for (const [name, row] of Object.entries(steps ?? {})) {
        rows += 1;
        const theirs = day.get(jobId)?.get(name);
        if (theirs === undefined) {
          // A row nothing can place, for one of two reasons since `O-130`: the tree does not have the
          // step, or the reader could not finish the part of the tree that holds it. Neither can turn a
          // name into an action, and the second is worth naming because the act that follows is a fix to
          // the file rather than a repair of the history.
          const why =
            unreadable.jobs.get(jobId) ?? unreadable.steps.get(`${jobId}\u0000${name}`) ?? null;
          throw new Error(
            `\`${jobId} / ${name}\` of run ${String(reading?.run)} names no step of the workflow at ${at}, ` +
              `which is the commit that reading records: a row nothing can place cannot be given the ` +
              'command it spent its seconds on, and the history and the tree it names disagree' +
              (why === null ? '' : ` -- this reader cannot read the part of that tree that holds it (${String(why)})`),
          );
        }
        if (row.command === theirs.command) continue;
        if (row.command !== `step:${name}` || !theirs.command.startsWith('uses:')) {
          throw new Error(
            `\`${jobId} / ${name}\` of run ${String(reading?.run)} carries \`${String(row.command)}\` and the ` +
              `workflow at ${at} says the step ran \`${theirs.command}\`: only a row that names a step whose ` +
              'commit runs an action can be relabelled, and this is neither -- the history was edited, or ' +
              'written by a rule this tree never had',
          );
        }
        row.command = theirs.command;
        relabelled += 1;
      }
    }
  }
  if (relabelled > 0) writeFileSync(READINGS, `${JSON.stringify(held, null, 2)}\n`);
  process.stdout.write(
    `ci-baseline: ${String(relabelled)} of ${String(rows)} row(s) across ${String(readings.length)} ` +
      `reading(s) named a step where the tree runs an action; ${String(dayOf.size)} tree(s) were read to ` +
      `say which action` +
      `${relabelled === 0 ? ', so the history already says it' : ', and the history now names it'}\n`,
  );
}

const workflow = readWorkflow(readFileSync(workflowPath(), 'utf8'));
if (workflow.errors.length > 0) {
  throw new Error(
    `the workflow does not parse, so there is nothing to measure:\n${workflow.errors.join('\n')}`,
  );
}

const run = await get(`/actions/runs/${RUN}`);
// The attempt this measurement is. `run_attempt` is the API's own count of how many times the run
// has been executed, and it is 1 for every run that was never re-run.
const runAttempt = ATTEMPT === null ? Number(run.run_attempt ?? 1) : ATTEMPT;
if (runAttempt > Number(run.run_attempt ?? 1)) {
  throw new Error(
    `run ${RUN} has been executed ${String(run.run_attempt ?? 1)} time(s) and --attempt names ` +
      `${String(runAttempt)}: an attempt that does not exist has no seconds, and recording it would ` +
      'put a day in the history that no machine spent',
  );
}

/**
 * The recording's first requirement: the run finished.
 *
 * `R4` asks a bound to be at least twice the number beside it, and that demand is only an argument when the
 * number is a **duration the command spent**. A run that did not succeed may hold a step that stopped at its
 * own bound instead of after the command -- and the API calls that step `failure`, the same conclusion a
 * genuine failure carries, so neither the file nor a reader can tell the two apart. A number that is a bound
 * read back, divided by two, asks for the bound to be doubled by the evidence that it was wrong (`O-127`).
 *
 * A seed is the other relation: it is a day the commands ran, and the steps that did end on their own are
 * evidence about those commands whatever the run's conclusion was. So the refusal is about the recording
 * only, and it names the act that keeps the rest.
 */
if (!SEED && (run.conclusion ?? null) !== 'success') {
  const concluded = run.conclusion === undefined || run.conclusion === null ? 'nothing' : `\`${String(run.conclusion)}\``;
  throw new Error(
    `run ${RUN} concluded ${concluded}, and a recording is only taken from a run that succeeded: a red run may ` +
      'hold a step that stopped at its own bound rather than after the command, and the report calls both of ' +
      'them `failure`, so the file every bound is a multiple of could not tell a duration from a bound read ' +
      'back. Fix what failed, re-run, and record that run; the steps of this one that did end on their own ' +
      'are still evidence about the commands, and `--seed` appends them to the history while leaving the ' +
      'recording where it is',
  );
}

/**
 * Where this measurement sits among the ones already written, and the three acts it forbids.
 *
 * ## A recording is the newest measurement
 *
 * `R10` holds the recording to the history's last reading, so the recorder writing an *older* one
 * leaves the gate red on the tree the recorder has just written -- and the refusal it prints says
 * "record that run as the recording rather than beside it", which is what the recorder was asked to
 * do and has just done (`O-122`). The state is reachable the moment a run has been re-run: attempt 2
 * is recorded, and `--attempt 1` then moves the recording back in time.
 *
 * So the two files are written only for a measurement that is newer than the recording it replaces.
 * The comparison is the pair (`orderOf`), because attempt 1 of a recorded run 7 and attempt 2 of it
 * share a run id and are a day apart: subtracting the ids answered "the same day" and told a person
 * that the older attempt *is* the recording.
 *
 * ## A seed is the other relation
 *
 * A seed appends a day and leaves the recording alone, so an older *attempt* of the recorded run is
 * exactly what it is for -- the two are one tree read twice, which is the pair a bound's margin is
 * measured against (finding 645), and it is the pair that used to be unwritable. A seed is refused
 * for being newer than the recording (a day that has not been recorded is the recording) and for
 * being the same measurement (a day entered twice is a day overweighted).
 *
 * ## Why a file that cannot be read is refused rather than replaced
 *
 * The recording is the only file that says which day is the newest, so a measurement cannot be
 * placed against a file that will not parse. Overwriting it would answer the question by deleting
 * it: the history would still hold the newer day, and the tree would fail with `R10`'s advice about
 * a recording the recorder had just written. It is one JSON object in git, and restoring it is the
 * act that makes the question answerable again.
 */
if (existsSync(OUT)) {
  const why = (what) =>
    SEED
      ? `the recording at ${OUT} ${what}, so a seed cannot be told from it: a seed is a day older than ` +
        'the recording, and the only file that says which day that is is unreadable'
      : `the recording at ${OUT} ${what}, so this measurement cannot be told from the one it would ` +
        'replace: a recording older than the newest measurement is a tree `R10` refuses, and the file ' +
        'that would have said which day is the newest is unreadable. Restore it from git and record ' +
        'again -- the run is still there';
  let held;
  try {
    held = JSON.parse(readFileSync(OUT, 'utf8'));
  } catch (error) {
    throw new Error(why(`cannot be parsed (${String(error)})`));
  }
  if (!Number.isInteger(Number(held?.run)) || Number(held?.run) <= 0) {
    throw new Error(why('names no run'));
  }
  const at = { run: Number(RUN), attempt: runAttempt };
  const order = orderOf(at, held);
  if (SEED && order > 0) {
    throw new Error(
      `--seed names ${coordinateOf(at)}, which is newer than the recording ` +
        `(${coordinateOf(held)}): a day that has not been recorded is the recording, not a seed, and ` +
        'appending it here would leave the bounds argued from a day the recording says is not the newest',
    );
  }
  if (SEED && order === 0) {
    throw new Error(
      `--seed names ${coordinateOf(at)}, which is the recording: it is already in the history, and a ` +
        'second entry for one measurement would weight that measurement twice when the slowest reading ' +
        'is looked up',
    );
  }
  if (!SEED && order < 0) {
    throw new Error(
      `${coordinateOf(at)} is older than the recording (${coordinateOf(held)}), and \`R10\` holds the ` +
        'recording to the newest reading in the history: writing this one would leave the gate red on ' +
        'the file this script had just written, telling the reader to record that run as the recording ' +
        '-- which is what was asked for. The measurement is still evidence: `--seed` appends it to the ' +
        'history and leaves the recording where it is, and two attempts of one tree are the pair a ' +
        "bound's margin is measured against",
    );
  }
}
// `filter=all` only when an older attempt is asked for: the unfiltered endpoint answers with the
// latest attempt's jobs, which is the whole of what every recording before this flag needed, and
// asking for all of them costs a request and a discrimination that nothing else here uses.
const jobs = await get(
  `/actions/runs/${RUN}/jobs?per_page=100${ATTEMPT === null ? '' : '&filter=all'}`,
);
const atAttempt = jobs.jobs.filter((one) => Number(one.run_attempt ?? 1) === runAttempt);
if (atAttempt.length === 0) {
  throw new Error(
    `run ${RUN} reports no job for attempt ${String(runAttempt)}: a measurement of an attempt with no ` +
      'job in it is a measurement of nothing',
  );
}
const byName = new Map(atAttempt.map((one) => [one.name, one]));
const byId = new Map(jobsOf(workflow).map((one) => [one.id, one]));

const recorded = {};
const derived = {};
// One request, two questions. A seed's numbers have to be placed on the commands that spent them, and
// those commands are the ones the workflow of **that day** states -- a name is not a command, and the
// shipped history already holds seven trees where a step kept its name and changed its `run:` line. A
// recording's numbers are written beside today's commands, so the tree on disk has to be the tree that
// ran. `v3.146` priced this request at the days that hold a stopped step, which was the price of the
// bound question alone (`O-131`).
let thatDayWorkflow;
try {
  thatDayWorkflow = await workflowOfThatDay(run.head_sha);
} catch (error) {
  const why = error instanceof Error ? error.message : String(error);
  throw new Error(
    SEED
      ? `run ${RUN} is a day whose numbers have to be placed on the commands that spent them, and the ` +
        'workflow of that day cannot be read ' +
        `(\`.github/workflows/ci.yml\` at ${String(run.head_sha).slice(0, 7)}: ${why}): a seed may not ` +
        'append a number beside a command it cannot say ran it, because `R10` divides by what it appends ' +
        "and would then size today's bound from a command that did not run that day"
      : `run ${RUN} is the whole of a recording, and the workflow at its commit cannot be read ` +
        `(\`.github/workflows/ci.yml\` at ${String(run.head_sha).slice(0, 7)}: ${why}): a recording writes ` +
        "today's command beside each number, so that command has to be the one that ran -- check out that " +
        'commit, or commit this workflow and record the run of it. `--seed` appends a day to the history ' +
        'and leaves the recording where it is',
  );
}
// The day as a seed can use it: the steps it could place, and the ones a refusal put out of reach
// beside the reason. Both are read once, because both are questions about the same document.
const thatDay = stepsOfDay(thatDayWorkflow);
const thatDayUnreadable = unreadableOf(thatDayWorkflow);
if (!SEED) {
  const drift = driftOf(stepsOfDay(workflow), thatDay, run.head_sha, thatDayUnreadable);
  if (drift !== null) throw new Error(drift);
}
// The command each step ran, per job, kept beside the seconds so the entry appended to
// the history is self-describing: `R10` compares a bound with every reading of *the
// command*, and a history that named steps would lose a series to a rename.
const history = {};
// What a seed could not find, reported rather than thrown: a job added last round is not
// in a run from before it, and the seconds that day spent on the commands it did run are
// still the worst day a bound has to survive.
const seedGaps = [];

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
  // How many of this job's numbers a seed refused, and why, in the order the reasons first appear: a job
  // left with nothing says which facts it is, because "the tree changed" and "the day stopped it" are
  // different acts for the reader who comes next.
  let dropped = 0;
  const reasons = new Set();
  for (const step of stepsOf(workflow, job.id)) {
    const found = measured.get(step.name);
    if (found === undefined) {
      if (SEED) {
        seedGaps.push(`\`${job.id} / ${step.name}\` did not run`);
        continue;
      }
      throw new Error(
        `\`${job.id} / ${step.name}\` is not a step of "${source.name}" in run ${RUN}: a bound cannot be ` +
          'sized from a step that did not run',
      );
    }
    if (found.seconds === null) {
      // A step the job reports with no times never started. The recording describes every step of the
      // workflow, so it has no number to offer here; a seed is partial by construction and says so.
      if (SEED) {
        dropped += 1;
        reasons.add('did not run');
        seedGaps.push(`\`${job.id} / ${step.name}\` did not run`);
        continue;
      }
      throw new Error(
        `\`${job.id} / ${step.name}\` did not run in "${source.name}" of run ${RUN} (` +
          `${found.conclusion === null ? 'the report names no conclusion for it' : `it is ${found.conclusion}`}): ` +
          'a step that never started spent no seconds, and the recording describes every step of the ' +
          'workflow -- record a run of this tree in which it ran',
      );
    }
    // A seed's number has to be placed on the command that spent it, and on the bound that could have
    // stopped it -- and both are questions about the workflow of **that day**. The report answers neither:
    // it names a step and gives a number, while a reading is keyed by the command, so a step that kept its
    // name through a change of its `run:` line would write today's command beside an older command's
    // seconds and `R10` would divide today's bound by them.
    if (SEED) {
      const jobThen = thatDay.get(job.id);
      const stepThen = jobThen?.get(step.name);
      if (stepThen === undefined) {
        dropped += 1;
        reasons.add('could not be placed on that day');
        // Two facts that used to be one sentence (`O-130`). A day whose job or step this reader could
        // not read is not a day that lacks it, and the act that follows is different: one is a tree that
        // changed, the other is a file this reader could not finish -- so the sentence names which, and
        // quotes the line the reader stopped on.
        const unreadableJob = thatDayUnreadable.jobs.get(job.id);
        const unreadableStep = thatDayUnreadable.steps.get(`${job.id}\u0000${step.name}`);
        seedGaps.push(
          `\`${job.id} / ${step.name}\` cannot be placed on the day it was measured: the workflow of that ` +
            `day ${
              unreadableJob !== undefined
                ? `has a job this reader cannot read (${String(unreadableJob)}), so no step of it can be placed`
                : unreadableStep !== undefined
                  ? `has a step this reader cannot read (${String(unreadableStep)})`
                  : jobThen === undefined
                    ? `has no job \`${job.id}\``
                    : `has no step named \`${step.name}\` in that job`
            }`,
        );
        continue;
      }
      if (stepThen.command !== commandOf(step)) {
        dropped += 1;
        reasons.add('ran a different command that day');
        seedGaps.push(
          `\`${job.id} / ${step.name}\` ran a different command that day (\`${stepThen.command}\`), and a ` +
            'reading is a number beside the command that spent it',
        );
        continue;
      }
      // A red day's stopped step, held against the bound of its own day (`O-128`). `failure` covers a
      // command that returned non-zero and a step the runner killed, and the report says which only in the
      // number: at or above the bound in force that day, it is that bound. Below it, or with no bound that
      // day, it is a duration the command spent.
      if (
        found.conclusion === 'failure' &&
        stepThen.minutes !== null &&
        found.seconds >= stepThen.minutes * 60
      ) {
        dropped += 1;
        reasons.add('did not end on its own');
        seedGaps.push(
          `\`${job.id} / ${step.name}\` did not end on its own (failure at the ` +
            `${String(stepThen.minutes)} min bound in force that day)`,
        );
        continue;
      }
    }
    // A step that was stopped rather than finished has seconds that are a lower bound on the command --
    // and for the step killed by its own bound, exactly that bound (`O-127`). Only a seed has to ask this
    // of each step: a green run is one in which every step that ran succeeded, because GitHub computes the
    // run's conclusion from its steps, while "red" says nothing about *which* step stopped early.
    if (SEED && !endedOnItsOwn(found.conclusion)) {
      dropped += 1;
      reasons.add('did not end on its own');
      // A report that names no conclusion for a step with times is a report that cannot say the step
      // finished, and a seed may not turn "cannot say" into "did".
      seedGaps.push(
        `\`${job.id} / ${step.name}\` did not end on its own (` +
          `${found.conclusion === null ? 'the report names no conclusion for it' : found.conclusion})`,
      );
      continue;
    }
    if (!SEED && step.inheritedFrom === 'step' && found.seconds === step.minutes * 60 && borrowedFrom === undefined) {
      // `O-127`'s second question, answered as a rule: a step that ends on its own ends *before* its bound,
      // because the bound is when the runner kills it. A number that equals it is that bound read back --
      // from a step killed with its failure allowed to pass, or from one that finished inside the last
      // second of its allowance, and the report cannot tell the two apart.
      //
      // A recording is today's tree and today's workflow, so today's bound is the one the runner was
      // enforcing. A seed is not (`O-128`): it is held against the bound of its own day, above, and the
      // same number against today's bound would refuse a duration that day allowed.
      throw new Error(
        `\`${job.id} / ${step.name}\` spent ${String(found.seconds)} s against a bound of exactly ` +
          `${String(step.minutes)} min: a step that ends on its own ends before its bound, because the bound ` +
          'is when the runner kills it, so this number is the bound read back rather than a duration of the ' +
          'command. Two shapes produce it -- a step that was killed and whose failure was allowed to pass, ' +
          'and one that finished inside the last second of its allowance -- and a report cannot tell them ' +
          'apart. Raise the bound by one minute and record again, so the number has room to move, or fix ' +
          'what hung',
      );
    }
    steps[step.name] = found.seconds;
    commands[step.name] = commandOf(step);
  }
  // A job none of whose steps this workflow still has is a job from a different tree
  // altogether: its seconds measure nothing a bound of today could be written against.
  if (Object.keys(steps).length === 0) {
    // The one fact that is true of every case, and the facts it is made of. A job from a workflow that had
    // other steps says the run and this workflow share nothing; a job whose steps were stopped, placed on
    // another command, or not placeable at all says the day measured nothing this tree can be sized from.
    seedGaps.push(
      dropped === 0
        ? `\`${job.id}\` ran no step this workflow still has`
        : `\`${job.id}\` measured no step this tree can be sized from (${[...reasons].join('; ')})`,
    );
    continue;
  }
  const total = totalSecondsOf(source);
  if (total === null) {
    throw new Error(
      `run ${RUN} reports no start and end for "${source.name}", so the seconds its steps do not ` +
        'account for cannot be measured: a ceiling sized from this reading would have no overhead to ' +
        'hold, and the number would be a guess about the runner rather than a reading of it',
    );
  }
  recorded[job.id] = { name: job.name, timeoutMinutes: job.timeoutMinutes, total, steps };
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
  // Which measurement of that run this is (`O-114`). A re-run has the same id and different
  // seconds, so the id alone cannot say which of the two a file holds -- and the two files are
  // compared with each other, so they have to name the same measurement or the comparison is
  // between an attempt and itself.
  attempt: runAttempt,
  commit: run.head_sha,
  measured: String((atAttempt[0]?.completed_at ?? run.updated_at ?? '').slice(0, 10)),
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
  attempt: runAttempt,
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
    `ci-baseline: seeded ${coordinateOf({ run: Number(RUN), attempt: runAttempt })} with ` +
      `${String(Object.keys(recorded).length)} of ` +
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
    `${coordinateOf({ run: Number(RUN), attempt: runAttempt })}` +
    `${Object.keys(derived).length > 0 ? `, ${String(Object.keys(derived).length)} borrowed` : ''}` +
    `${answered === 0 ? '' : `; ${String(answered)} declaration(s) are now measured and can be deleted`}` +
    `${answeredJobs === 0 ? '' : `; ${String(answeredJobs)} job declaration(s) are now measured and can be deleted`}` +
    `${waitingJobs === 0 ? '' : `; ${String(waitingJobs)} job declaration(s) still awaiting their first run`}` +
    `${appended === null ? '' : `; the history holds ${String(appended.readings.length)} reading(s)`}` +
    `\n`,
);
if (historyNote !== '') process.stderr.write(`ci-baseline: ${historyNote.replace(/^; /, '')}\n`);
