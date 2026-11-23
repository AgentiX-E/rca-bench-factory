// What a CI job's step budgets have to satisfy, as functions and no verdict.
//
// ## The complaint, in one reading
//
// The batteries job spends 20 of its 30 minutes, and until this module existed every
// one of those minutes belonged to the **job**. A step-level bound is the thing that
// turns "the job timed out" -- a verdict naming fourteen steps -- into "this battery
// hung". GitHub has the key (`timeout-minutes` on a step) and this repository's plan
// reader already reads it; what it did not have was a number.
//
// ## Why the number is not written here
//
// A bound is a claim about how long a legitimate run takes, so it has to come from a
// run. `golden-master/ci-baseline.json` holds one recording, with the run id and the
// commit it came from, and `measure-ci-baseline.mjs` is the only thing that writes it.
// A baseline with no run in it is a number somebody remembered.
//
// The multiple is two, and the floor is three minutes. Two because the cost of a
// battery is a deterministic function of its mutation count and the suite -- the
// variance is the machine, not the work, and twice a measured run covers a runner
// twice as slow. Three because the floor covers what the baseline cannot see: a cold
// `apt-get update`, a first-time build, a runner whose cache missed. Both are stated
// rather than tuned: a bound that has to be raised after it fires was wrong, and the
// honest response is to measure again rather than to add slack.
//
// ## The rule that makes the number mean something
//
// A bound that cannot expire before the job's own budget is a number with no effect:
// the job dies first and the message still names nothing. So the last rule is
// arithmetic over the recording, and it is a rule about the **sum**: every step dies at
// its own bound, so a job whose bounds add up to more than its ceiling can reach the
// ceiling with every step still inside its own, and the verdict names the job. That is
// what decides whether a `timeout-minutes` here is a bound or a decoration. Until
// v3.129 the rule asked it one bound at a time, which is finding 619.
//
// ## What the fix looked like once it was read as a property (v3.48)
//
// Every rule above was written for the job that had actually timed out, and the
// recording named that job: `batteries`. Two blind spots followed, and neither was
// visible while one job happened to have bounds.
//
// The first is that **a job with no bounds was never asked whether it should have
// them**. The `verify` job spends nine minutes across eleven steps and names none of
// them, so a hang in coverage is reported as "the job timed out" -- the exact sentence
// this module exists to replace, in the job next door. That is now `R3`, and it asks
// the question of every job in the workflow rather than of the one that failed once.
//
// The second is that a recording of one job cannot describe a workflow with two. The
// file now holds every job, keyed by the workflow's own job id, and `R2` compares the
// two sets in both directions -- so a job added tomorrow is a red gate until somebody
// measures it, which is the only way the numbers stay numbers.
//
// ## The fifth question, which no number in the recording can answer (v3.49)
//
// Every rule above compares the recording against the workflow and against itself, and
// all of them can pass on a recording of a tree that is no longer the one shipping. That
// is not hypothetical: the round that gave the recording its job coverage shipped at
// `91e320884`, the ledger gained a row citing run `41677264353`, and the recording stayed
// at `41670923224`. Nothing refused it, and nothing could -- a stale recording is made of
// real measurements of a real tree, and the only thing wrong with it is *when*.
//
// The ledger is the second opinion, because it is where a round writes down which run it
// ended on. So the last rule is not about a bound at all: the recording may not be older
// than the newest run the ledger reports, and the ledger's newest row has to name a run,
// because otherwise there is nothing to compare against and the silence looks like
// agreement. `ledger-runs.mjs` does the reading; the rule is `R7`.
//
// ## The fourth thing the arithmetic says
//
// Adding `R3` to a shipped tree immediately refuses more than a missing bound: it
// refuses bounds that cannot fit. A step measured at 536 s wants a bound of 18
// minutes, and a job budget of 15 cannot hold it; a job whose heavy steps measure
// 479 s and 416 s wants 30 minutes of bounds in a job that has 25. Neither is a
// reason to add slack -- it is the arithmetic saying that one job is doing too much
// for one budget, and the repair is another job. That is why this round splits the
// batteries in two instead of raising their ceiling.
//
// ## The step that has not run yet (v3.52, finding 405)
//
// Every rule above compares a bound with a measurement, and a workflow that adds a
// step has none -- by construction, because the measurement is of a run of the
// workflow. So the gate refused every new step, and the round that needed one folded a
// second battery into an existing step's command and left the step's name describing
// half of what it ran (finding 403). A name narrower than its command is the same
// defect the step bound exists to remove, one level down: the verdict names a battery
// that is not the one that hung, and a reader who trusts the name reads a green line
// about a command it never ran.
//
// The repair is not to let a step be unbounded. It is to let the tree say **which step
// it added and what it will be bounded at**, in a file of its own, so that the first
// run that measures the step is the run that deletes the sentence.
// `golden-master/ci-declarations.json` holds those sentences, and `R8` is what each has
// to satisfy:
//
// - the step exists in the job it names, and the recording does not measure it -- a
//   declaration that outlives its measurement is a bound nobody ever checked against a
//   run, which is the thing `R2` refuses;
// - the bound is the one the workflow declares, not one the declaration invents, and it
//   satisfies the floor -- the rules that do not need a measurement still apply;
// - its bound would still expire before the job does, computed from the measurements of
//   the steps in front of it, because that arithmetic is about the position rather than
//   about this step's cost;
// - it is the **last** step of its job that is not measured. Anywhere else and every
//   bound after it would be argued from a sum with a hole in it, and the deadline would
//   be short by an unknown number of seconds;
// - it carries an argument. A declaration is a claim about work the repository has
//   decided to do, and a claim with no words is a shrug with a filename.
//
// `R4`'s multiple is the one rule with nothing to stand on, and it is the one rule that
// is answered last: the recording this file exists to make possible is a measurement of
// that step, so the round after this one is refused if the bound was too small. That is
// a refusal a person can act on, unlike the standing refusal of every new step.
//
// The lifetime is one recording, and it is structural rather than promised. The only
// writer of the recording is `measure-ci-baseline.mjs`, which refuses to write a
// reading that does not include every step of the workflow. So the first refresh after
// a declaration measures it, and `R7` forces a refresh on every round that cites a run.
//
// ## The day the bound was not sized from (v3.55, finding 423)
//
// Every rule above divides by one number: the seconds the current recording has for the
// step. v3.54 spent three quarters of a round discovering what that costs. A bound of
// twelve minutes was placed on `Lint` from a reading of **347 s** -- twice 347 is 694,
// comfortably inside 720 -- and three runs later the same step, doing the same work on
// a slightly slower machine, measured **361 s**, where twice is 722 against a bound of
// 720. Nothing had changed but the day.
//
// The recording cannot answer that complaint, because it holds one day by construction:
// it is the reading of the run a round cites, and taking every reading is not what a
// baseline is for. So the tree keeps a **history** -- `golden-master/ci-readings.json`,
// appended by the same recorder that writes the recording -- and `R10` divides by the
// worst day in it rather than by the last one:
//
// - the history's newest reading is the recording's run, in both directions, because a
//   reading that was taken and not written down is a day no bound can see, and a
//   reading newer than the recording describes a tree the recording has moved past;
// - the two files are compared step by step for that run -- one measurement, two files,
//   and a history that has been edited by hand is refused for disagreeing;
// - a bound is at least twice the **slowest reading of the command it bounds**, taken
//   from any run in the history and from any job that ran it.
//
// That last clause is the one the evidence forced. The steps that install the shells the
// suite cross-checks against are bounded at three minutes in five jobs, and in run
// `42172498744` the same command took **153 s** in one job and **8 s** in another --
// because its cost belongs to a package mirror, not to the job that asked for it. Sizing
// each job's bound from its own fast day is a bound that fires on a slow one, which is
// the defect `R4` exists to remove, one level down. So the series is keyed by the
// command: a step with no `run` of its own -- an action -- is keyed by its name, because
// the action is what costs and its name is the only handle the workflow offers.
//
// `R4` survives all of it. It is the answer when there is no history to consult, and it
// is the reason a reading of the tree under test is still taken: `R10` compares a bound
// with the days already recorded, and the day just recorded is one of them.

import { timeoutOf } from './gate-steps.mjs';

/**
 * How long a declaration's argument has to be.
 *
 * The same threshold `gate-sites.json` puts on the description of a mutant, for the
 * same reason: the point is not the number, it is that a sentence of forty characters
 * says what a step is for and a sentence of five says "battery".
 */
export const WHY_LENGTH = 40;

/** The multiples and the floor. Stated here, quoted by the gate and by the tests. */
export const MULTIPLE = 2;
export const FLOOR_MINUTES = 3;

/**
 * What one job's prefix is allowed: the floor, spent once per job rather than once per step.
 *
 * The floor's own argument is unchanged -- a cold package index, a missed cache, a first
 * build are what a measurement cannot see -- and what this round changed is **how many of
 * them a job can have**. A runner is cold once. Four bounded setup steps at three minutes
 * each do not describe four cold runners; they describe one, and three guesses.
 *
 * It is the same number as the floor and a different quantity, which is why it is named
 * separately: the floor is a property of the cold runner, this is the **unit** a job buys
 * it in, and a rule that kept one name for both would make the next reader think the
 * allowance is a per-step number that happens to be shared (finding 622).
 */
export const PREFIX_MINUTES = FLOOR_MINUTES;

/**
 * The ceiling a job has when it declares none.
 *
 * GitHub's own limit is six hours, and it is a ceiling like any other: the number a job's
 * death is charged to when no step bound fires first. `R13` compares against it rather than
 * falling silent, because a job whose bounds do not fit six hours is a job that can only die
 * without a name -- the one verdict every rule here exists to replace. Every job of the
 * shipped workflow declares its own, so this branch is about a workflow that has not been
 * written yet.
 */
export const GITHUB_CEILING = 360;

/**
 * The only keys a promise about a whole job may carry (v3.54, P17).
 *
 * `R8` let a tree declare a *step* the recording had not measured, and the shape was
 * honest because every field it wrote was already in `ci.yml`. A whole job is the same
 * shape one level up, with one difference that is not a detail: the job's budget is part
 * of `R6`'s comparison, so there is nothing for a new job to be compared with, and the
 * only thing a round can say about it is what it has decided -- its id, the ceiling it
 * wrote into `ci.yml`, the bound on every step, and why. A second, a run id, a commit, a
 * date or a ratio is a measurement, and the round writing this file has watched none of
 * them happen. That is why this is a whitelist rather than a documented convention: an
 * extra key is refused by name, and the refusal is the one failure shape a local
 * apparatus can produce about a budget that only CI can spend.
 *
 * `R9` deliberately computes no deadline. `R5` needs the seconds of the steps in front
 * of a bound, and every step of a job that has never run is unmeasured -- the sum has no
 * terms. The first green run supplies them, and `R4`/`R5` settle the numbers then. A
 * rule that argued a deadline from the *bounds* would be claiming to know how long a
 * runner spends in steps it has never seen, which is the forgery the whitelist refuses.
 */
export const JOB_PROMISE_KEYS = ['job', 'timeoutMinutes', 'steps', 'why'];
export const STEP_PROMISE_KEYS = ['name', 'minutes'];

/**
 * The steps of one job, in order, with the budget each declares.
 *
 * `inheritedFrom` says **where a step's bound comes from**, and it has four values
 * because there are four answers: `'step'` when the step writes its own
 * `timeout-minutes`, `'prefix'` when the step is one of the leading steps every job of
 * the workflow shares (the checkout, the two setups, the install -- finding 622) and the
 * job's single allowance answers for it, `'job'` when the only number above it is the
 * job's, and `null` when nothing bounds it at all.
 *
 * It had three, and the two this round separated were `'prefix'` and `'job'`: a step the
 * job bounds with a per-step number and a step the job bounds with one allowance for the
 * whole prefix were the same value, so a reader could not tell a job that had argued
 * twelve separate bounds from one that had argued none (finding 622).
 *
 * It used to have two, and `null` meant both of the last two. A step the job bounds and
 * a step nothing bounds were the same value, so every reader downstream -- the summary's
 * count, the rule that refuses a job bounding some of its steps and not others -- saw one
 * population where the workflow has two. The summary said `62 of 83 step(s) bounded` for
 * a workflow whose unbounded steps were zero, and a reader who subtracted was told 21
 * steps run unbounded. Finding 595.
 */
export function stepsOf(workflow, job) {
  const prefix = prefixOf(workflow, job);
  return workflow.steps
    .filter((step) => step.job === job)
    .map((step, index) => {
      const own = step.values?.['timeout-minutes'] ?? '';
      const resolved = timeoutOf(own, step.jobTimeout ?? '');
      const jobBound = (step.jobTimeout ?? '') !== '';
      const inPrefix = index < prefix.length && prefix[index] === step.name;
      return {
        name: step.name,
        run: step.run,
        minutes: resolved.minutes,
        inheritedFrom: own !== '' ? 'step' : inPrefix ? 'prefix' : jobBound ? 'job' : null,
        inPrefix,
        error: resolved.error,
      };
    });
}

/**
 * The leading steps every job of the workflow shares, name and command both.
 *
 * This is the **prefix**: everything a run spends before the job's first real step, and
 * the reason finding 622 exists. It is derived rather than declared, and derived from the
 * one property that makes a step setup rather than work -- the other jobs do the same
 * thing in the same position. A step that only this job runs is that job's work, whatever
 * its name says; a step all eight run identically is what it costs to have a runner at all.
 *
 * The command is compared with the name because a name is not a claim: two jobs can both
 * call a step `Build` and run different commands, and a rule that read the name alone would
 * hand them both an allowance for work they do not share.
 *
 * A workflow of one job has no prefix. There is nothing for its steps to be common *with*,
 * and a prefix of "every step" would excuse a single-job workflow from bounding anything --
 * the degenerate case that would make this rule a hole rather than a rule.
 */
const SHARED_PREFIX = new WeakMap();

/** Private: `prefixOf` is what the module offers, and a caller that wanted the workflow-wide
 * answer instead would be asking a question about other jobs than the one it is judging. */
function sharedPrefixOf(workflow) {
  const cached = SHARED_PREFIX.get(workflow);
  if (cached !== undefined) return cached;
  const jobs = jobsOf(workflow);
  const shared = [];
  if (jobs.length >= 2) {
    const perJob = jobs.map((one) => workflow.steps.filter((step) => step.job === one.id));
    for (let index = 0; ; index += 1) {
      const at = perJob.map((steps) => steps[index]);
      if (at.some((step) => step === undefined)) break;
      const signatures = at.map((step) => `${step.name}\u0000${step.run ?? ''}`);
      if (new Set(signatures).size !== 1) break;
      shared.push(at[0].name);
    }
  }
  SHARED_PREFIX.set(workflow, shared);
  return shared;
}

/**
 * One job's prefix: the leading run of its steps that the whole workflow shares.
 *
 * A job can be shorter than the shared prefix, or diverge part-way -- `backend` has no
 * `Install the shells the suite cross-checks against`, so its prefix stops one step
 * earlier than the other seven. The function returns names rather than steps because the
 * caller already has the steps and needs only to know which of them are in it.
 */
export function prefixOf(workflow, job) {
  const shared = sharedPrefixOf(workflow);
  const own = workflow.steps.filter((step) => step.job === job);
  const names = [];
  for (let index = 0; index < shared.length; index += 1) {
    if (own[index]?.name !== shared[index]) break;
    names.push(shared[index]);
  }
  return names;
}

/**
 * The seconds one job's prefix is allowed, which is the floor, spent once.
 *
 * A job's prefix may be four steps long or six; the allowance does not grow with it,
 * because the thing the allowance is for does not either: a runner is cold once. That is
 * the whole finding -- three minutes per step bought fourteen separate cold runners in a
 * job that can have one, and the ceiling paid for thirteen of them that cannot happen.
 */
export function allowanceSecondsOf(workflow, job) {
  return prefixOf(workflow, job).length === 0 ? 0 : PREFIX_MINUTES * 60;
}


/**
 * The jobs of the workflow, in the order they are written.
 *
 * A fallback covers a workflow read before `gate-steps.mjs` collected job names:
 * the ids are derived from the steps, in first-appearance order, with no name and no
 * budget. It exists so this module answers about a workflow object it was handed by
 * an older reader rather than throwing on it.
 */
export function jobsOf(workflow) {
  if (Array.isArray(workflow.jobs) && workflow.jobs.length > 0) return workflow.jobs;
  const ids = [];
  for (const step of workflow.steps ?? []) {
    if (step.job !== undefined && step.job !== null && !ids.includes(step.job)) ids.push(step.job);
  }
  return ids.map((id) => ({ id, name: '', timeoutMinutes: timeoutOf(undefined, '').minutes }));
}

/** The measured seconds of one recorded step, or null when the recording is silent. */
function secondsOf(record, name) {
  const value = (record?.steps ?? {})[name];
  return typeof value === 'number' ? value : null;
}

/**
 * The seconds the bounds inside one job allow, added up -- the number a ceiling has to hold.
 *
 * This is the quantity finding 619 is about, and it went uncomputed for the life of `R12`.
 * A step cannot spend more than its own bound, because the bound is what ends it, so a job
 * whose every step is bounded **cannot outlive this sum** plus the seconds that belong to no
 * step. `R5` asked the same question one step at a time -- "does this bound expire before the
 * job does" -- and answered it from the seconds measured in front of the bound. That is a
 * weaker test than it looks: it passes on a job whose bounds add up to twice its ceiling,
 * because no single bound is late, and the job still dies at the ceiling with every step
 * inside its own bound. `batteries` was exactly that shape: **83** minutes of bounds under a
 * **34**-minute ceiling, the last bound expiring at 24.
 */
export function boundsSecondsOf(workflow, job) {
  let seconds = 0;
  for (const step of stepsOf(workflow, job)) {
    if (step.inheritedFrom === 'step') seconds += step.minutes * 60;
  }
  return seconds;
}

/**
 * The least ceiling a job can hold and still die at a step rather than at the job.
 *
 * Two terms, and the larger one wins, so the answer says **which term won** -- a reader of a
 * refusal has to know whether they are being told the job is doing too much for one budget or
 * that its ceiling refuses a slow runner.
 *
 * **Twice the slowest day** is the rule finding 605 wrote: a runner twice as slow must finish
 * rather than be refused for being slow. **The bounds plus the seconds no step spends** is the
 * rule finding 619 wrote: every step dies at its own bound, so the sum of them -- plus what the
 * runner spends outside any step -- is the longest the job can legitimately live. The overhead
 * is doubled for the same reason the bounds are: a runner twice as slow also sets up twice as
 * slowly, and each bound already holds its own multiple.
 *
 * The second term is not the first one's refinement -- it is the one that closes the gap
 * between them. Whenever every step is bounded the sum is at least twice the day, because each
 * bound is at least twice its step's slowest reading; so the day term survives for exactly the
 * jobs that lean on their ceiling: the one-step jobs `R3` excuses, and the jobs whose steps
 * carry no bound at all.
 */
export function ceilingNeedOf(daySeconds, boundsSeconds, overheadSeconds) {
  const byBounds = boundsSeconds + MULTIPLE * overheadSeconds;
  return byBounds >= MULTIPLE * daySeconds
    ? { seconds: byBounds, term: 'bounds' }
    : { seconds: MULTIPLE * daySeconds, term: 'day' };
}

/**
 * The declarations file, read into the shape the rules work in.
 *
 * Returns a map of job id to a map of step name to the promise made about it, plus the
 * sentences for everything that cannot be read at all. Two things are deliberately not
 * errors here: a missing file, because having no declaration is the normal state and
 * the state the round after this one is in; and an entry whose *step* the workflow does
 * not have, because that check needs the job's steps and belongs with the job.
 *
 * The shape checks are here rather than at the call site for the reason `stepsOf` is:
 * one reader, one verdict, and a test that can call it with nothing but a workflow.
 */
export function readDeclarations(workflow, declarations) {
  const declared = new Map();
  const jobs = new Map();
  const errors = [];
  if (declarations === null || declarations === undefined) return { declared, jobs, errors };
  const ids = new Set(jobsOf(workflow).map((job) => job.id));

  /**
   * A file may carry either kind of promise, or both. `declared` used to be mandatory
   * because it was the only kind; a file with only job promises is now a normal shape,
   * and a file with neither kind is a file that says nothing -- the state of not having
   * the file, wearing a filename.
   */
  const hasSteps = Array.isArray(declarations.declared);
  const hasJobs = Array.isArray(declarations.jobs);
  if (declarations.jobs !== undefined && !hasJobs) {
    errors.push(
      'the declarations file has no `jobs` list: a job promise has to be a list, one entry per ' +
        'job that no run has measured, or the key should not be there at all',
    );
  }
  if (!hasSteps && declarations.jobs === undefined) {
    errors.push(
      'the declarations file has no `declared` list, so no step in it can be read: write the ' +
        'list, or delete the file and let the recording speak for the tree',
    );
    return { declared, jobs, errors };
  }
  const list = hasSteps ? declarations.declared : [];
  const jobList = hasJobs ? declarations.jobs : [];
  if (list.length === 0 && jobList.length === 0 && errors.length === 0) {
    errors.push(
      hasJobs && !hasSteps
        ? 'the declarations file declares no job: an empty `jobs` list describes the state of ' +
          'having no job promise, which is the state of not having the key -- delete it'
        : 'the declarations file declares nothing: an empty list describes the state of having no ' +
          'declarations, which is the state of not having the file -- delete it',
    );
    return { declared, jobs, errors };
  }

  for (const entry of list) {
    const job = String(entry?.job ?? '');
    const step = String(entry?.step ?? '');
    const minutes = entry?.minutes;
    const why = String(entry?.why ?? '');
    const where = `\`${job} / ${step}\``;
    if (!ids.has(job)) {
      errors.push(
        `the declarations file names \`${job}\`, which is not a job of ci.yml: a promise about a ` +
          'job that does not exist is a promise about nothing',
      );
      continue;
    }
    if (!Number.isInteger(minutes) || minutes < FLOOR_MINUTES) {
      errors.push(
        `${where} is declared at ${String(minutes)} min: the floor is ${String(FLOOR_MINUTES)}, because ` +
          'a measurement cannot see a cold package index or a missed cache, and a declaration sees ' +
          'less than a measurement does',
      );
    }
    if (why.trim().length < WHY_LENGTH) {
      errors.push(
        `${where} is declared without an argument: say what the step is for in at least ` +
          `${String(WHY_LENGTH)} characters, because the round that reads this file is deciding ` +
          'whether to believe a number about work it has never seen run',
      );
    }
    const pending = declared.get(job) ?? new Map();
    if (pending.has(step)) {
      errors.push(`${where} is declared twice, so a reader cannot tell which bound is meant`);
      continue;
    }
    pending.set(step, { minutes, why });
    declared.set(job, pending);
  }

  /**
   * The job promises. The whitelist is the rule that makes this readable as a promise
   * rather than as a recording: an extra key is necessarily a measurement (a second, a
   * run id, a commit, a date, a ratio), and the round writing this file has watched none
   * of those happen. `R9` can therefore refuse the one forgery a local apparatus *can*
   * produce, while saying plainly that it cannot spend the budget itself.
   */
  for (const entry of jobList) {
    const job = String(entry?.job ?? '');
    const where = `\`${job}\``;
    if (!ids.has(job)) {
      errors.push(
        `the declarations file names \`${job}\`, which is not a job of ci.yml: a promise about a ` +
          'job that does not exist is a promise about nothing',
      );
      continue;
    }
    if (jobs.has(job)) {
      errors.push(`${where} is declared as a job twice, so a reader cannot tell which promise is meant`);
      continue;
    }
    if (declared.has(job)) {
      errors.push(
        `${where} has both a job promise and a step declaration: two promises about one job, and ` +
          '`R8` and `R9` cannot both own the same gap in the recording',
      );
      continue;
    }
    const extra = Object.keys(entry ?? {}).filter((key) => !JOB_PROMISE_KEYS.includes(key));
    if (extra.length > 0) {
      for (const key of extra) {
        errors.push(
          `${where} carries \`${key}\`, which is a measurement: a job promise may only name what ` +
            "its writer can know -- its id, its budget, its steps' bounds, and why",
        );
      }
      continue;
    }
    const budget = entry.timeoutMinutes;
    if (!Number.isInteger(budget) || budget <= 0) {
      errors.push(
        `${where} promises a budget of ${String(budget)} min, which is not a positive integer: ` +
          'the number is the one ci.yml will enforce, not an estimate of a run',
      );
      continue;
    }
    const why = String(entry.why ?? '');
    if (why.trim().length < WHY_LENGTH) {
      errors.push(
        `${where} is declared without an argument: say what the job is for in at least ` +
          `${String(WHY_LENGTH)} characters, because the round that reads this file is deciding ` +
          'whether to believe a budget about work it has never seen run',
      );
      continue;
    }
    const promised = entry.steps;
    if (!Array.isArray(promised) || promised.length === 0) {
      errors.push(`${where} promises no steps, so its bounds are not written down`);
      continue;
    }
    const seen = new Set();
    const parsedSteps = [];
    let bad = false;
    for (const one of promised) {
      const name = String(one?.name ?? '');
      const stepExtra = Object.keys(one ?? {}).filter((key) => !STEP_PROMISE_KEYS.includes(key));
      if (stepExtra.length > 0) {
        for (const key of stepExtra) {
          errors.push(
            `\`${job} / ${name}\` carries \`${key}\`, which is a measurement: a step promise may ` +
              'only name the step and the bound ci.yml gives it',
          );
        }
        bad = true;
        continue;
      }
      if (name === '' || seen.has(name)) {
        errors.push(
          `\`${job}\` names the same step twice, so a reader cannot tell which bound is meant`,
        );
        bad = true;
        continue;
      }
      seen.add(name);
      const minutes = one.minutes;
      if (!Number.isInteger(minutes) || minutes < FLOOR_MINUTES) {
        errors.push(
          `\`${job} / ${name}\` is promised at ${String(minutes)} min: the floor is ` +
            `${String(FLOOR_MINUTES)}, and a step that has not run yet is the case the floor is for`,
        );
        bad = true;
        continue;
      }
      parsedSteps.push({ name, minutes });
    }
    if (bad) continue;
    jobs.set(job, { timeoutMinutes: budget, steps: parsedSteps, why });
  }

  return { declared, jobs, errors };
}

/**
 * The command a step runs, which is what a bound is really about (v3.55, `R10`).
 *
 * A step with no `run` of its own uses an action, and the action is what costs, so its
 * name is the handle: `Set up Node.js` in two jobs is the same download and the same
 * extraction, and it should not be timed twice as if it were two different things. The
 * whitespace is collapsed because a `run:` block is folded by YAML and a bound is not.
 */
export function commandOf(step) {
  const run = typeof step?.run === 'string' ? step.run.replace(/\s+/g, ' ').trim() : '';
  return run === '' ? `step:${String(step?.name ?? '')}` : run;
}

/**
 * The history of readings, read into the shape the rules work in.
 *
 * Each entry is one run's measurement, and each step in it carries the seconds **and
 * the command those seconds were spent on**. The command is stored rather than resolved
 * through today's tree for one reason: a renamed step would otherwise lose its series,
 * and losing a series is losing the slow day that justified a bound. Storing it makes
 * each reading self-describing, which is what a log has to be to be a log.
 *
 * The errors are per entry and they are refusals rather than warnings: a reading with
 * no run, no commit, no date, no step, or a step with no seconds is a row a reader
 * cannot place, and `R10` compares bounds with rows.
 */
export function readReadings(file) {
  const rows = [];
  const errors = [];
  if (file === null || file === undefined) return { rows, errors };
  const list = file.readings;
  if (!Array.isArray(list)) {
    errors.push(
      'the readings file has no `readings` list: the history is one entry per run that measured the ' +
        'workflow, and a file that is not a list of them is a file no bound can be compared with',
    );
    return { rows, errors };
  }
  if (list.length === 0) {
    errors.push(
      'the readings file holds no reading: an empty history describes the state of having no history, ' +
        'which is the state of not having the file -- delete it, or fill it from a run that measured ' +
        'the tree',
    );
    return { rows, errors };
  }
  const seen = new Set();
  for (let index = 0; index < list.length; index += 1) {
    const entry = list[index] ?? {};
    const where = `the reading at position ${String(index + 1)}`;
    const run = entry.run;
    if (!Number.isInteger(run) || run <= 0) {
      errors.push(
        `${where} names no workflow run, so its seconds are numbers somebody typed: every reading is a ` +
          'run, and the run id is what makes it one',
      );
      continue;
    }
    if (seen.has(run)) {
      errors.push(
        `${where} is run ${String(run)} a second time: a run that was measured twice would be counted ` +
          'twice when the slowest day is looked up, and a bound would be argued from one day twice',
      );
      continue;
    }
    seen.add(run);
    if (!/^[0-9a-f]{40}$/.test(String(entry.commit ?? ''))) {
      errors.push(
        `run ${String(run)} names no commit, so a reader cannot tell which tree its seconds describe`,
      );
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.measured ?? ''))) {
      errors.push(
        `run ${String(run)} has no measurement date: a reading that cannot be dated cannot be told from ` +
          'one taken before the machine pool changed',
      );
      continue;
    }
    const jobs = entry.jobs;
    if (jobs === null || typeof jobs !== 'object' || Array.isArray(jobs) || Object.keys(jobs).length === 0) {
      errors.push(
        `run ${String(run)} holds no job, so it measured nothing that a bound could be sized from`,
      );
      continue;
    }
    const steps = new Map();
    let bad = false;
    for (const [jobId, byStep] of Object.entries(jobs)) {
      if (
        byStep === null ||
        typeof byStep !== 'object' ||
        Array.isArray(byStep) ||
        Object.keys(byStep).length === 0
      ) {
        errors.push(
          `run ${String(run)} holds \`${jobId}\` with no step in it: a job entry with nothing measured ` +
            'reads as a job that took no time, which is not a thing a runner does',
        );
        bad = true;
        continue;
      }
      for (const [name, one] of Object.entries(byStep)) {
        const seconds = one?.seconds;
        const command = one?.command;
        if (!Number.isInteger(seconds) || seconds < 0) {
          errors.push(
            `\`${jobId} / ${name}\` in run ${String(run)} holds ${String(seconds)} seconds: a reading is ` +
              'a whole number of seconds, and zero is allowed because a step that ran and did nothing ' +
              'measurable took none',
          );
          bad = true;
          continue;
        }
        if (typeof command !== 'string' || command.trim() === '') {
          errors.push(
            `\`${jobId} / ${name}\` in run ${String(run)} does not say which command it timed, so its ` +
              'seconds cannot be compared with the bound of a step that runs the same command',
          );
          bad = true;
          continue;
        }
        steps.set(`${jobId}\u0000${name}`, { seconds, command, job: jobId, step: name });
      }
    }
    if (bad) continue;
    rows.push({ run, commit: entry.commit, measured: entry.measured, steps });
  }
  rows.sort((a, b) => a.run - b.run);
  return { rows, errors };
}

/**
 * One reading written into a history, newest last, one entry per run.
 *
 * Rewriting the same run replaces its entry rather than adding a second one: the
 * recorder may legitimately be run twice against one run -- after a failure, or to
 * re-seed -- and a history with two rows for one day would weight that day twice.
 */
export function mergeReading(file, entry) {
  const existing = Array.isArray(file?.readings) ? file.readings : [];
  const kept = existing.filter((one) => one?.run !== entry.run);
  return { readings: [...kept, entry].sort((a, b) => Number(a.run) - Number(b.run)) };
}

/**
 * The slowest reading of one command, across every run and every job that ran it.
 *
 * Ties go to the newer run, so the answer is a function of the file rather than of the
 * order somebody happened to append in -- the sentence `R10` prints names a run, and two
 * answers for one file would make the sentence unwritable.
 */
export function worstReadingFor(rows, command) {
  let worst = null;
  for (const row of rows) {
    for (const one of row.steps.values()) {
      if (one.command !== command) continue;
      if (
        worst === null ||
        one.seconds > worst.seconds ||
        (one.seconds === worst.seconds && row.run > worst.run)
      ) {
        worst = { seconds: one.seconds, run: row.run, job: one.job, step: one.step };
      }
    }
  }
  return worst;
}

/**
 * The slowest **day** each job has had, and the run it was.
 *
 * A bound is sized from one step's seconds; a *ceiling* is sized from the whole job's, and
 * the whole job's only exists for a run that measured every step of it. So a day is a
 * reading whose job entry holds every step the workflow declares **now**, summed, and the
 * slowest such reading wins with ties going to the newer run -- the same tie rule
 * `worstReadingFor` follows, and for the same reason: the answer has to be a function of the
 * file rather than of the order somebody appended in.
 *
 * The sum of the slowest reading *per command* is deliberately not used here, though `R4`'s
 * prefix uses exactly that number. `R4` asks where a bound sits in a job, and there a mixture
 * of slow days is the worst case. A ceiling is about a day, and a composite of ten days is a
 * day no run has ever produced: it would be a number a reader cannot go and look at, which is
 * the one thing every other number in this file can be.
 *
 * A reading that measured only some of the job's steps is skipped rather than summed: a total
 * with a hole in it is smaller than the day, and a ceiling argued from it would be argued from
 * a fast day -- the mistake `R10` exists to prevent at the step level.
 */
export function jobDays(workflow, baseline, readings = null) {
  const days = new Map();
  const recorded = baseline?.jobs ?? {};
  for (const job of jobsOf(workflow)) {
    const names = stepsOf(workflow, job.id).map((one) => one.name);
    if (names.length === 0) continue;
    let best = null;
    const day = (seconds, run) => {
      if (best === null || seconds > best.seconds || (seconds === best.seconds && run > best.run)) {
        best = { seconds, run };
      }
    };
    const record = recorded[job.id];
    if (record !== undefined && names.every((name) => typeof record.steps?.[name] === 'number')) {
      day(
        names.reduce((all, name) => all + record.steps[name], 0),
        baseline.run,
      );
    }
    for (const row of readings?.rows ?? []) {
      const measured = names.map((name) => row.steps.get(`${job.id}\u0000${name}`));
      if (measured.some((one) => one === undefined)) continue;
      day(
        measured.reduce((all, one) => all + one.seconds, 0),
        row.run,
      );
    }
    if (best !== null) days.set(job.id, best);
  }
  return days;
}

/**
 * `R10` -- the history is the recording's, and the recording is the history's last day.
 *
 * Two directions, and both are about the same defect: a reading that exists in one file
 * and not the other. A reading behind the recording is a day that was measured and not
 * written down, so no bound can be argued from it; a reading ahead of the recording is a
 * tree the recording no longer describes, which is `R7`'s complaint one level finer. And
 * when the tail *is* the recording's run, the two files have to agree second by second,
 * because they are one measurement written twice and a disagreement means one of them
 * was edited by hand.
 */
function historyErrors(baseline, parsed) {
  const errors = [...parsed.errors];
  if (parsed.errors.length > 0) return errors;
  const rows = parsed.rows;
  const tail = rows[rows.length - 1];
  if (tail.run < baseline.run) {
    errors.push(
      `the newest reading in the history is run ${String(tail.run)} and the recording is run ` +
        `${String(baseline.run)}: a reading that was taken and not written down is a day no bound can ` +
        'see, and the recorder writes both files from one measurement -- record the run again, or say ' +
        'in the history why that day was dropped',
    );
    return errors;
  }
  if (tail.run > baseline.run) {
    errors.push(
      `the history holds a reading of run ${String(tail.run)}, which is newer than the recording (run ` +
        `${String(baseline.run)}): the bounds would be argued from days the recording does not describe ` +
        '-- record that run as the recording rather than beside it',
    );
    return errors;
  }
  const recorded = baseline.jobs ?? {};
  for (const [jobId, job] of Object.entries(recorded)) {
    for (const [name, seconds] of Object.entries(job?.steps ?? {})) {
      const held = tail.steps.get(`${jobId}\u0000${name}`);
      if (held === undefined) {
        errors.push(
          `run ${String(tail.run)} measured \`${jobId} / ${name}\` and its reading in the history does ` +
            'not hold it: the recording and the history are one measurement written twice, so a step in ' +
            'one and not the other means one of them was edited',
        );
        continue;
      }
      if (held.seconds !== seconds) {
        errors.push(
          `\`${jobId} / ${name}\` took ${String(seconds)} s in the recording and ` +
            `${String(held.seconds)} s in the history, both for run ${String(tail.run)}: one measurement ` +
            'cannot have two answers, so one of the two files was edited by hand',
        );
      }
    }
  }
  const measured = new Set();
  for (const [jobId, job] of Object.entries(recorded)) {
    for (const name of Object.keys(job?.steps ?? {})) measured.add(`${jobId}\u0000${name}`);
  }
  for (const [key, one] of tail.steps) {
    if (measured.has(key)) continue;
    errors.push(
      `the history holds \`${one.job} / ${one.step}\` for run ${String(tail.run)} and the recording does ` +
        'not: the two files are one measurement, so a step in the history alone means one of them was ' +
        'edited',
    );
  }
  return errors;
}

/** A round heading: a volume's `## ` sections are rounds or the round's own parts. */
const ROUND_HEAD = /^v\d+\.\d+\b/;

/** A closing reading's tally of jobs, in the form `R11` asks for it. */
const TALLY = /\*\*(\d+) of (\d+) jobs? success\*\*/;

/** The label of a round heading: `v3.119 · ...` is `v3.119`. */
function roundLabel(head) {
  return head.split(' ')[0];
}

/**
 * R11 -- the newest round ends on a closing reading of *this* workflow.
 *
 * ## Why the rule exists at all
 *
 * `R7` refuses a recording older than the run the ledger's newest row reports, and it
 * was silent for **65 rounds**: the newest `| CI |` row in the shipped log sat under
 * `v3.54` while the log's newest round was `v3.119`, so a recording from any run newer
 * than a 65-round-old one passed. Nothing was wrong with `R7`'s arithmetic; the thing it
 * compares against had stopped being written, and a rule whose reference decays is a rule
 * that passes for a reason it cannot see. This one is the rule about the reference.
 *
 * ## Why the newest round rather than every round
 *
 * The log holds 215 rounds and 12 closing readings, because the convention was followed
 * for a while and then not. Backfilling the other 203 from memory would be inventing
 * provenance -- the one thing a recording may never do -- so the rule is about the
 * present: the round that is being written has to end on a run. The gap behind it is
 * stated in the summary, where a reader can see how far back the last row is.
 *
 * ## Why the tally, and not only the run id
 *
 * A run id says a run happened; it does not say which workflow ran. This repository
 * draws run ids from one sequence for two workflows (`CI` and `Anchor round trip`), and
 * the round that wrote this rule reported an `Anchor round trip` run -- one job -- as a
 * CI run with eight, which is the defect the sentence about the sequence in
 * `ledger-runs.mjs` predicted and did not prevent. `**<n> of <m> jobs success**` is
 * checkable: `m` against `ci.yml`'s job count, `n` against `m`.
 */
function closingErrors(ledger, workflow) {
  const sections = Array.isArray(ledger.sections) ? ledger.sections : null;
  // A caller that passed no section index has not asked the question, for the reason
  // `ledger` itself is optional: silence would otherwise be indistinguishable from
  // agreement.
  if (sections === null) return [];
  const rounds = sections.filter((one) => ROUND_HEAD.test(one.head));
  if (rounds.length === 0) return [];
  const newest = rounds[rounds.length - 1];
  const named = newest.rows.filter((one) => one.runs.length > 0);
  if (named.length === 0) {
    // The distance is counted in rounds rather than in run ids: run ids are sparse, so the
    // difference between two of them reads as a count of runs and is not one.
    let lastSection = null;
    let lastRow = null;
    for (const one of rounds) {
      for (const row of one.rows) {
        if (row.runs.length === 0) continue;
        lastSection = one;
        lastRow = row;
      }
    }
    return [
      `the newest round (\`${roundLabel(newest.head)}\` at \`${newest.file}:${String(newest.line)}\`) has no ` +
        'closing reading that names a run' +
        (lastRow === null
          ? ', and no round before it has one either'
          : `: the last one is \`${lastRow.file}:${String(lastRow.line)}\`, ` +
            `${String(rounds.length - 1 - rounds.indexOf(lastSection))} round(s) back`) +
        '. `R7` compares the recording with that row, so a recording from any run newer than it passes ' +
        'however many runs have happened since -- end the round with a row: ' +
        '`| CI | run \`<id>\` on \`<commit>\`: **<n> of <m> jobs success** -- ... |`',
    ];
  }
  const errors = [];
  const row = named[named.length - 1];
  const at = `\`${row.file}:${String(row.line)}\``;
  const tally = TALLY.exec(row.text ?? '');
  if (tally === null) {
    return [
      `the newest round's closing reading (${at}) states no tally of jobs: write ` +
        '`**<n> of <m> jobs success**` into the row, because a run id alone says a run happened and ' +
        'not which workflow it was -- this repository has two, and their run ids share one sequence',
    ];
  }
  const [reported, counted] = [Number(tally[1]), Number(tally[2])];
  const declared = workflow === null || workflow === undefined ? null : jobsOf(workflow).length;
  if (declared !== null && counted !== declared) {
    errors.push(
      `the newest round's closing reading (${at}) reports **${String(counted)} job(s)** and \`ci.yml\` ` +
        `declares **${String(declared)}**: a run id is not a CI run id -- \`CI\` and \`Anchor round trip\` ` +
        'draw from one sequence, so a row can cite a run whose jobs are not these',
    );
  }
  if (reported !== counted) {
    errors.push(
      `the newest round's closing reading (${at}) reports **${String(reported)} of ${String(counted)}**: ` +
        'a row that states fewer successes than jobs closes a round on a red run, and a closing reading ' +
        'is a green one -- the round has to end after the repair, not beside it',
    );
  }
  return errors;
}

/**
 * R7 -- the recording is not older than the round that reports it.
 *
 * Two failures, and the second is the one that makes the first meaningful. A newest row
 * that names no run leaves the recording unopposed: every other rule passes, and the
 * gate's silence reads as agreement with a round it never compared itself to. So the
 * refusal is about the *ledger's* completeness as much as about the recording's age, and
 * the sentence says which of the two the reader has to repair.
 *
 * `ledger` is null when the caller has no ledger to offer, and the rules are then absent
 * rather than passing: a caller that does not pass one has not asked the question, and a
 * module that answers questions nobody asked is the defect this file is about.
 *
 * One convention follows from the rule and is worth stating because it looks like an
 * omission: **a refresh commit's run is not a closing reading.** The recording is taken
 * *from* the run a round cites, so the commit that carries the new recording cannot cite
 * the run that verifies it -- that run would then be newer than the recording and `R7`
 * would refuse, and so would its repair, for ever. A round cites one run; the refresh run
 * goes uncited, which is why the summary can read `the recording is newer` and be right.
 */
export function ledgerErrors(baseline, ledger, workflow = null) {
  if (ledger === null || ledger === undefined || ledger.read !== true) return [];
  // The round's reading is asked about before the tail is, because an empty ledger is the
  // case `R11` exists for: a log with no `| CI |` row at all used to end the function here,
  // and the silence that followed was indistinguishable from agreement.
  const errors = [...closingErrors(ledger, workflow)];
  if (ledger.tail === null) return errors;
  if (ledger.tail.runs.length === 0) {
    errors.push(
      `the ledger's newest closing reading (\`${ledger.tail.file}:${String(ledger.tail.line)}\`) ` +
        'names no run, so nothing can say whether the recording describes the tree that reading ' +
        'describes: end the row with the run id, as `| CI | run \`<id>\` on \`<commit>\`: ...` does',
    );
  }
  if (
    ledger.newest !== null &&
    Number.isInteger(baseline.run) &&
    baseline.run < ledger.newest.run
  ) {
    errors.push(
      `the recording is from run ${String(baseline.run)} and \`${ledger.newest.file}:` +
        `${String(ledger.newest.line)}\` reports run ${String(ledger.newest.run)}: a recording older ` +
        'than the round that reports it describes a tree nobody shipped, so its seconds size the ' +
        `bounds of a workflow that has since run -- take a new reading with \`node ` +
        `scripts/measure-ci-baseline.mjs ${String(ledger.newest.run)}\``,
    );
  }
  return errors;
}

/**
 * Whether `ci.yml` now promises the job *less* time than the run that measured it had.
 *
 * The asymmetry is the whole of `R6`. A ceiling is a container, and the bounds inside it
 * are arithmetic against that container: shrink it and the sum they add up to may no longer
 * fit, so the seconds have to be re-spent under the new ceiling before anybody can say the
 * bounds fit. Widen it and no step bound moves -- the sum `R13` compares is unchanged -- which
 * is why a reading taken inside the smaller ceiling is still a reading of the same commands.
 *
 * Three shapes, and `null` is not the same as zero. A job with no ceiling holds GitHub's six
 * hours (`GITHUB_CEILING`), so removing one is the widest change there is and adding one is
 * the narrowest: the seconds were never spent against a ceiling this repository could see,
 * and now they have to be.
 */
function narrowed(record, job) {
  if (job.timeoutMinutes === null) return false;
  if (record.timeoutMinutes === null) return true;
  return record.timeoutMinutes > job.timeoutMinutes;
}

/**
 * Every way the budget can be wrong, given the workflow and the recording.
 *
 * Returns sentences rather than a boolean, because there are six different repairs
 * behind the rules and a reader who is told "budgets: FAILED" has to guess which.
 */
export function budgetErrors(workflow, baseline, ledger = null, declarations = null, readings = null) {
  const parsed = readDeclarations(workflow, declarations);
  const errors = [...ledgerErrors(baseline, ledger, workflow), ...parsed.errors];
  const declared = parsed.declared;
  const declaredJobs = parsed.jobs;

  // R10 -- the history of readings, and the two shapes of a reading that exists in one
  // file and not the other. `readings` is null when the caller has no history to offer,
  // and the rules are then absent rather than passing, for the reason `ledger` is: a
  // caller that did not pass one has not asked the question.
  const parsedReadings = readings === null || readings === undefined ? null : readReadings(readings);
  // Appended one at a time rather than spread: the list is bounded by the workflow's step
  // count, but a spread into `push` is the shape `spread-append-guard.test.ts` refuses,
  // and the exemption list is for the cases where a loop cannot say it better.
  if (parsedReadings !== null) {
    for (const one of historyErrors(baseline, parsedReadings)) errors.push(one);
  }
  const historyKnown = parsedReadings !== null && parsedReadings.errors.length === 0;

  // R1 -- the recording is a reading, and it says where it was taken.
  if (!Number.isInteger(baseline.run) || baseline.run <= 0) {
    errors.push('the baseline names no workflow run, so its seconds are numbers somebody typed');
  }
  if (!/^[0-9a-f]{40}$/.test(String(baseline.commit ?? ''))) {
    errors.push(
      'the baseline names no commit, so a reader cannot tell which tree the seconds describe',
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(baseline.measured ?? ''))) {
    errors.push('the baseline has no measurement date: a recording that cannot be dated cannot be refreshed');
  }

  const jobs = jobsOf(workflow);
  if (jobs.length === 0) {
    return [...errors, 'ci.yml has no job, so the recording describes nothing that runs'];
  }
  // The slowest day of each job, computed once: `R12` refuses against it and `budgetSummary`
  // prints the tightest one, and two computations of one number is the shape finding 588
  // repaired -- a reader would have no way to tell which of the two was the gate's.
  const days = jobDays(workflow, baseline, historyKnown ? parsedReadings : null);

  // R2 -- the recording and the workflow describe the same jobs. Both directions,
  // because the two mistakes are different: a job nobody measured has no bound
  // anybody can size, and a recording of a job that is gone describes a tree that
  // no longer exists.
  const recorded = baseline.jobs ?? {};
  for (const job of jobs) {
    if (!(job.id in recorded)) {
      // R9 owns this gap when a job promise names it. The promise is not a measurement:
      // it says what the tree decided about the budget and every bound, and the first run
      // that measures the job is the run that deletes it. Without the promise the gap is
      // the one R2 refuses, because a job nobody measured has no bound anybody can size.
      if (declaredJobs.has(job.id)) continue;
      errors.push(
        `\`${job.id}\` is a job of ci.yml that the recording has never measured, so nobody can say ` +
          'whether its steps are bounded at all: run `node scripts/measure-ci-baseline.mjs <run-id>` ' +
          'against a green run',
      );
    }
  }
  const ids = new Set(jobs.map((job) => job.id));
  for (const id of Object.keys(recorded)) {
    if (!ids.has(id)) {
      errors.push(
        `the recording holds \`${id}\`, which is not a job of ci.yml: a recording that outlives its ` +
          'job describes a tree that no longer exists',
      );
    }
  }

  for (const job of jobs) {
    const record = recorded[job.id];
    if (record === undefined) continue;

    // `R13`'s second input. A recording holds the seconds of every step and, since finding
    // 619, the job's own wall clock beside them; the difference is what no bound can cover.
    // A recording without it is refused rather than defaulted, for the reason the history is:
    // a margin nobody measured is a margin nobody checked, and the default would be the one
    // number in this file that no run produced.
    if (!Number.isInteger(record.total)) {
      errors.push(
        `\`${job.id}\` has seconds for its steps and none for the job, so the seconds no step spends -- ` +
          "the runner's own setup, its teardown, the `Post` half of every action -- are unknown: record " +
          'the run again, which writes the job total beside its steps',
      );
      continue;
    }

    // R6 -- the job's own budget is the recording's, or the arithmetic below is about a
    // different job than the one that will enforce it. Only a *narrower* budget breaks
    // that: a step bound that fit inside the ceiling the run was spent under may expire
    // after the job has already died at the tighter one, which is the defect the bound
    // exists to remove. A *wider* ceiling changes no step bound and only gives `R5`'s
    // deadline more room, so a reading taken inside 20 minutes still describes every
    // command that will run inside 34.
    //
    // Refusing the wider direction was this rule's first form, and it closed the circle
    // `R9` exists to open: a ceiling could then only be widened by a run, and a run
    // happens after the push this gate has to pass. `narrowed` is the whole difference,
    // and `budgetSummary` names every widening so a reader sees the exception taken.
    //
    // A *narrowing* was refused outright until v3.132 (finding 622), and the refusal was
    // the weaker form of `R13`. Its argument was a step bound that fits inside the wider
    // ceiling and might expire after the job has died at the tighter one -- which is the
    // question `R13` answers by arithmetic: the ceiling holds every bound plus the prefix's
    // allowance plus twice the seconds no step spends, or the gate refuses it and names the
    // number. What was left over was a demand for a re-measurement, and the recording already
    // holds the number that demand was standing in for: if twice the slowest day this
    // repository has met fits under the tighter ceiling, no day it has ever seen is refused.
    // That is `R12`'s term, so the narrowing is refused there, once, with its own sentence.
    //
    // Deleting it leaves no case uncovered and one rule less: `narrowed` survives for the
    // summary, which prints every narrowing beside every widening, because a ceiling that
    // moves is a claim a reader has to see (`budgetSummary`).
    const steps = stepsOf(workflow, job.id);
    if (steps.length === 0) {
      errors.push(`ci.yml has no step in \`${job.id}\`, so the recording describes nothing that runs`);
      continue;
    }

    const pending = declared.get(job.id) ?? new Map();

    // R2, second half -- the steps of this job, in both directions. A step a round has
    // declared is not excused from being measured; it is excused from being measured
    // *yet*, and `R8` below is what it owes instead.
    for (const step of steps) {
      if (secondsOf(record, step.name) !== null) continue;
      if (pending.has(step.name)) continue;
      errors.push(
        `\`${job.id} / ${step.name}\` has no baseline, so a bound for it would be a guess: run ` +
          '`node scripts/measure-ci-baseline.mjs <run-id>` against a green run',
      );
    }
    const names = new Set(steps.map((step) => step.name));
    for (const name of Object.keys(record.steps ?? {})) {
      if (!names.has(name)) {
        errors.push(
          `the recording holds \`${name}\` for \`${job.id}\`, which is not a step of that job: a ` +
            'recording that outlives its step describes a tree that no longer exists',
        );
      }
    }

    // R8 -- what a declaration owes once its step is known. Two of the three are about
    // the step existing and the promise expiring; the per-step rules below take the rest.
    for (const [name, promise] of pending) {
      const step = steps.find((one) => one.name === name);
      if (step === undefined) {
        errors.push(
          `the declarations file names \`${job.id} / ${name}\`, which is not a step of that job: the ` +
            'step it was written for has been renamed or removed, so the promise describes nothing',
        );
        continue;
      }
      const seconds = secondsOf(record, name);
      if (seconds !== null) {
        errors.push(
          `\`${job.id} / ${name}\` was measured at ${String(seconds)} s and the declarations file still ` +
            'says it has not been: delete the entry, because the measurement is the thing the ' +
            'declaration was waiting for and a promise that outlives it is a bound nobody checked',
        );
        continue;
      }
      if (step.inheritedFrom !== 'step') {
        errors.push(
          `\`${job.id} / ${name}\` is declared but declares no \`timeout-minutes\` of its own, so the ` +
            'declaration has no bound to stand behind and the job budget would answer for it instead',
        );
        continue;
      }
      if (promise.minutes !== step.minutes) {
        errors.push(
          `\`${job.id} / ${name}\` is declared at ${String(promise.minutes)} min and ci.yml bounds it ` +
            `at ${String(step.minutes)}: the declaration is about the number the workflow will ` +
            'enforce, so the two have to be the same number',
        );
      }
    }

    const measured = steps.reduce((sum, step) => sum + (secondsOf(record, step.name) ?? 0), 0);
    const bounded = steps.filter((step) => step.inheritedFrom === 'step').length;

    // R3 -- a job either bounds its steps or it does not. Two ways to be wrong, and the
    // first one is the rule this round added: a job that costs more than the floor
    // across more than one step and bounds none of them names no step when it hangs.
    //
    // The exceptions are stated rather than assumed. One step is excused because the
    // job's budget already names exactly that step -- which is the whole thing a step
    // bound buys -- and a job under the floor is excused because there is nothing to
    // spend. Both are reported by `budgetSummary` so that a reader sees the exception
    // being taken rather than an omission.
    const expensive = measured > FLOOR_MINUTES * 60;
    if (expensive && steps.length > 1 && bounded === 0) {
      errors.push(
        `\`${job.id}\` measured ${String(Math.round(measured / 60))} min across ${String(steps.length)} ` +
          'steps and declares no `timeout-minutes` on any of them: a hang there spends every other ' +
          `step's time and the verdict names the job rather than the step`,
      );
    }

    // R4 -- per step: a job that bounds some of its steps bounds all of them, and each
    // bound is at least the multiple and the floor.
    //
    // A bound's **position** used to be a rule of its own, `R5`: does it expire before the
    // job does, computed from the slowest recorded day of every step in front of it. It is
    // gone as of v3.129 (finding 619), and not because it was wrong -- it was the weaker
    // form of `R13`. A bound that expires inside the ceiling is not enough when the bounds
    // *together* do not fit, and `batteries` was that job: every bound inside the 34-minute
    // ceiling, the ceiling reached with all twenty still inside their own. `R5` could not
    // see it, because it asked one bound at a time, and one at a time they were all fine.

    for (const step of steps) {
      const seconds = secondsOf(record, step.name);
      if (step.error !== null) {
        errors.push(`\`${job.id} / ${step.name}\`: ${step.error}`);
      } else if (step.inPrefix && step.inheritedFrom === 'step') {
        // R14 -- the prefix is the job's, so a number on one of its steps is a second answer
        // to a question the allowance already answers. The refusal exists because the shape
        // it replaces was invisible: sixteen steps at three minutes each look like sixteen
        // arguments and are one number typed sixteen times (finding 622).
        errors.push(
          `\`${job.id} / ${step.name}\` is a prefix step -- one of the ${String(prefixOf(workflow, job.id).length)} ` +
            'this job shares with every other -- and declares a bound of its own: what a cold ' +
            `runner costs is one allowance of ${String(PREFIX_MINUTES)} min per job, and a bound here is ` +
            'the same three minutes stated again, once per step, until the ceiling is paying for ' +
            'cold runners that cannot happen',
        );
      } else if (step.inheritedFrom === 'prefix') {
        // The allowance answers for it. Nothing is owed here, and saying so is not the same as
        // falling through: the branch below refuses a step bounded by its *job*, which is an
        // unbounded step wearing the job's ceiling, and this one is bounded by a number.
      } else if (step.inheritedFrom !== 'step' && bounded > 0) {
        errors.push(
          `\`${job.id} / ${step.name}\` declares no \`timeout-minutes\` of its own while ` +
            `${String(bounded)} other step(s) of the same job do, so a hang here is charged to the ` +
            'budget every other step is sharing',
        );
      } else if (step.inheritedFrom === 'step' && typeof seconds === 'number') {
        const bound = step.minutes * 60;
        if (bound < MULTIPLE * seconds) {
          errors.push(
            `\`${step.name}\` is bounded at ${String(step.minutes)} min and measured ${String(seconds)} s: ` +
              `the bound is under ${String(MULTIPLE)} times the measurement, so a runner twice as slow is ` +
              'refused for being slow rather than for hanging',
          );
        }
        // The floor is not asked of a work step any more (finding 622). It is asked of the
        // prefix, once, because that is where the cold state is spent: a step that measures
        // fifty-four seconds and is bounded at two minutes dies at its own bound if a cold
        // runner really does make it slower, and the verdict names it -- which is the whole
        // thing a bound buys. The three minutes were buying slack, not attribution.
        // R10 -- the same arithmetic as `R4`, divided by the slowest reading of **the
        // command** rather than by this step's reading of the recording. The two are
        // disjoint by construction: `R4` speaks for the day being recorded, this speaks
        // for every other day and every other job that ran the same command, so a step
        // that is under twice its own measurement is refused once rather than twice.
        if (historyKnown) {
          const worst = worstReadingFor(parsedReadings.rows, commandOf(step));
          const ownDay =
            worst !== null &&
            worst.run === baseline.run &&
            worst.job === job.id &&
            worst.seconds === seconds;
          if (worst !== null && !ownDay && bound < MULTIPLE * worst.seconds) {
            errors.push(
              `\`${job.id} / ${step.name}\` is bounded at ${String(step.minutes)} min and the same command ` +
                `took ${String(worst.seconds)} s in \`${worst.job} / ${worst.step}\` in run ` +
                `${String(worst.run)}: the bound is under twice the slowest day already recorded, so a ` +
                'run that meets the day this repository has met before is refused for being slow rather ' +
                'than for hanging -- size the bound from that reading, or say in the history why it is not ' +
                'comparable',
            );
          }
        }
      } else if (step.inheritedFrom === 'step' && pending.has(step.name)) {
        // R8 -- the half of `R4`/`R5` that survives having no measurement. The deadline is
        // about the bound's position in the job, so everything it needs is the steps in
        // front of it, all of which are measured; and the floor is about the cold runner,
        // which is the same argument whether or not this step has ever run.
        if (step.minutes < FLOOR_MINUTES) {
          errors.push(
            `\`${step.name}\` is declared at ${String(step.minutes)} min: the floor is ` +
              `${String(FLOOR_MINUTES)}, and a step that has not run yet is the case the floor is for`,
          );
        }
        const after = steps.slice(steps.indexOf(step) + 1);
        const measuredAfter = after.filter((one) => secondsOf(record, one.name) !== null);
        if (measuredAfter.length > 0) {
          errors.push(
            `\`${job.id} / ${step.name}\` is declared and \`${String(measuredAfter[0]?.name)}\` after it ` +
              'has been measured: a step no run has measured has to be the last of its job, because ' +
              'every bound after it would be argued from a sum with a hole in it',
          );
        }
      }
    }

    // R13 -- the ceiling holds the bounds, and the seconds no step spends (finding 619).
    //
    // `R12` asked a ceiling for twice the job's slowest day and stopped there. Twice a day is
    // a real floor -- a runner twice as slow must finish rather than be refused for being slow
    // -- and it is not the number that decides whether the ceiling can fire first. The bounds
    // decide that: every step dies at its own bound, so the longest a job can legitimately live
    // is the sum of them plus the seconds that belong to no step (the runner's own setup, its
    // teardown, and the `Post` half of every action, none of which is in a bound).
    //
    // `batteries` was the job that showed the difference: **83** minutes of bounds inside a
    // **34**-minute ceiling, with the last bound expiring at 24. Every bound was inside its own
    // arithmetic and the job still could not finish a slow day -- the day that spends a third
    // of each bound reaches the ceiling with nothing to name. Raising the ceiling to the sum is
    // what makes the sentence impossible, and splitting the job is the other repair, which is
    // why both are in the message.
    //
    // The day comes from `jobDays`, which is a real run and not a composite of slow days: a
    // ceiling is a claim about a day, and a claim about a day has to be checkable against one.
    // The overhead is the other measurement: `total` is the job's own wall clock, so what no
    // step accounts for is `total - the steps`, and a recording that does not hold it is
    // refused above rather than defaulted -- a margin nobody measured is a margin nobody checked.
    const total = record.total;
    const overhead = Math.max(0, total - measured);
    // The ceiling holds the bounds **and the prefix's one allowance**, because the prefix is
    // a number a step can spend: the four setup steps share three minutes between them, and a
    // ceiling that did not hold that number would be a ceiling that fires before the allowance
    // it granted (finding 622).
    const bounds = boundsSecondsOf(workflow, job.id) + allowanceSecondsOf(workflow, job.id);
    const day = days.get(job.id);
    const need = ceilingNeedOf(day?.seconds ?? 0, bounds, overhead);
    const ceiling = (job.timeoutMinutes ?? GITHUB_CEILING) * 60;
    if (ceiling < need.seconds) {
      const needed = Math.ceil(need.seconds / 60);
      const prefix = prefixOf(workflow, job.id);
      const allowance =
        prefix.length === 0
          ? ''
          : ` plus the ${String(PREFIX_MINUTES)}-minute allowance for its ${String(prefix.length)}-step prefix`;
      // Which of the two terms is the binding one decides the sentence, because they are two
      // different complaints: a ceiling under the sum is a job doing more than one budget can
      // hold, and a ceiling under twice the day is a budget that refuses a slow runner.
      errors.push(
        need.term === 'bounds'
          ? `\`${job.id}\` is bounded at ${String(job.timeoutMinutes ?? GITHUB_CEILING)} min and the bounds ` +
            `inside it add up to ${String(Math.round(boundsSecondsOf(workflow, job.id) / 60))} min in ` +
            `${String(bounded)} step(s)${allowance}: a day ` +
            'that spends them reaches the ceiling with every step still inside its own bound, so the ' +
            'verdict names the job rather than the step -- raise the ceiling to ' +
            `${String(needed)} min, or split the job`
          : `\`${job.id}\` is bounded at ${String(job.timeoutMinutes ?? GITHUB_CEILING)} min and its slowest ` +
            `recorded day is ${String(day?.seconds ?? 0)} s (run ${String(day?.run)}), which is ` +
            `${((day?.seconds ?? 0) === 0 ? Infinity : ceiling / (day?.seconds ?? 0)).toFixed(2)}x: the ` +
            `ceiling is under ${String(MULTIPLE)} times that day, so a day twice as slow reaches it with ` +
            'every step still inside its own bound and the verdict names the job rather than the step -- ' +
            `raise the ceiling to ${String(needed)} min, or split the job`,
      );
    }
  }

  // R9 -- what a promise about a whole job owes, once the workflow and the recording
  // are both known. It is a relation, not a number: every field below is something the
  // tree already says, so a promise that disagrees with the tree is a promise about a
  // different workflow. The one thing it does not do is spend the budget. See the
  // whitelist above for why no deadline is computed here.
  for (const [id, promise] of declaredJobs) {
    const job = jobs.find((one) => one.id === id);
    // `readDeclarations` has already refused a promise naming no job of the workflow.
    if (job === undefined) continue;

    if (recorded[id] !== undefined) {
      errors.push(
        `\`${id}\` has been measured by run ${String(baseline.run)} and the declarations file ` +
          'still says it has not: delete the job promise, because its first run is the thing it ' +
          'was waiting for and a promise that outlives it is a budget nobody checked',
      );
      continue;
    }
    if (promise.timeoutMinutes !== job.timeoutMinutes) {
      errors.push(
        `\`${id}\` promises a budget of ${String(promise.timeoutMinutes)} min and ci.yml declares ` +
          `${job.timeoutMinutes === null ? 'none' : String(job.timeoutMinutes)}: a promise is about ` +
          'the number the job will enforce, not a second workflow with its own ceiling',
      );
      continue;
    }

    // The promise names the steps that carry a bound, and not the prefix: the prefix has no
    // bound of its own to promise, and asking a never-run job to promise the three minutes the
    // job's allowance already answers for would be a promise about a number nobody measures
    // (finding 622).
    const steps = stepsOf(workflow, id).filter((step) => !step.inPrefix);
    if (promise.steps.length !== steps.length) {
      errors.push(
        `\`${id}\` promises ${String(promise.steps.length)} step(s) and ci.yml has ` +
          `${String(steps.length)}: a job promise has to name every step of the job it waits for ` +
          'that carries a bound, because the bound it owes is a bound on each one',
      );
      continue;
    }
    let bad = false;
    for (let index = 0; index < steps.length; index += 1) {
      const promised = promise.steps[index];
      const actual = steps[index];
      if (promised.name !== actual.name) {
        errors.push(
          `\`${id}\` promises \`${promised.name}\` in position ${String(index + 1)} and ci.yml has ` +
            `\`${actual.name}\`: a promise names the order a run will spend, so a renamed or ` +
            'reordered step is a different promise',
        );
        bad = true;
        continue;
      }
      if (actual.error !== null) {
        errors.push(`\`${id} / ${actual.name}\`: ${actual.error}`);
        bad = true;
        continue;
      }
      if (actual.inheritedFrom !== 'step') {
        errors.push(
          `\`${id} / ${actual.name}\` promises a bound but ci.yml gives it none of its own: a ` +
            "declared job has to bound every step, because the job's own budget is the only " +
            'number a run has never spent',
        );
        bad = true;
        continue;
      }
      if (promised.minutes !== actual.minutes) {
        errors.push(
          `\`${id} / ${actual.name}\` promises ${String(promised.minutes)} min and ci.yml bounds it ` +
            `at ${String(actual.minutes)}: the declaration is about the number the workflow will ` +
            'enforce, so the two have to be the same number',
        );
        bad = true;
        continue;
      }
      if (actual.minutes < FLOOR_MINUTES) {
        errors.push(
          `\`${id} / ${actual.name}\` is bounded at ${String(actual.minutes)} min: the floor is ` +
            `${String(FLOOR_MINUTES)}, and a step that has not run yet is the case the floor is for`,
        );
        bad = true;
      }
    }
    if (bad) continue;

    // No deadline is computed. `R5` argues one from the seconds measured in front of a
    // bound, and a job that has never run has none -- the sum has no terms. The first
    // green run supplies them and `R4`/`R5` settle the numbers in the same commit that
    // deletes the promise. A rule that argued a deadline from the bounds instead would
    // be claiming to know how long a runner spends in steps it has never watched.
  }

  return errors;
}

/**
 * How far behind the newest round the row `R7` compares against sits, in rounds.
 *
 * Printed on the green line because `R11` is a rule about a number a reader cannot see:
 * the row that exists prints an id, and nothing in that id says whether it was written
 * this week or 65 rounds ago. The distance is counted in rounds rather than in run ids,
 * for the reason `ledgerErrors` counts it that way -- ids are sparse, so a difference
 * between two of them reads as a count of runs and is not one.
 */
function ledgerWhere(ledger) {
  const sections = Array.isArray(ledger.sections) ? ledger.sections : null;
  if (sections === null || ledger.newest === null) return '';
  const rounds = sections.filter((one) => ROUND_HEAD.test(one.head));
  if (rounds.length === 0) return '';
  const home = sections.find(
    (one) => one.file === ledger.newest.file && one.rows.some((row) => row.line === ledger.newest.line),
  );
  const index = home === undefined ? -1 : rounds.indexOf(home);
  if (index < 0) return '';
  const behind = rounds.length - 1 - index;
  const newest = roundLabel(rounds[rounds.length - 1].head);
  // The noun is printed in **both** states, `0` included (finding 623). The first version said
  // `, in the newest round` when the row sat in it and `, N round(s) before \`vX.YY\`` when it
  // did not, which reads better and makes the population of `round(s)` depend on where the
  // ledger's newest run happens to sit: the census recorded this gate as a printer of the noun
  // in the round that caught the ledger up, and refused the same tree one round later when the
  // phrasing changed and the noun went with it. A sentence whose shape depends on the state it
  // describes is finding 618 one level down -- the key moved, so a judgement of it is not a
  // judgement of anything. `0 round(s) before the newest round` says the same thing and says it
  // with the number the census reads.
  return `, ${String(behind)} round(s) before \`${newest}\``;
}

/**
 * How the recording compares with the newest run the ledger reports.
 *
 * Printed rather than implied, because the comparison is the whole content of `R7`: a
 * reader who sees "as of run N; the ledger's newest run is N" knows the two were checked,
 * and a reader who sees a count of rows that name no run knows what the check could not see.
 */
function ledgerText(ledger, baseline) {
  if (ledger === null || ledger === undefined || ledger.read !== true) {
    return 'no ledger to compare against';
  }
  const unnamed =
    ledger.unnamed.length === 0
      ? ''
      : `, ${String(ledger.unnamed.length)} earlier row(s) name no run`;
  if (ledger.newest === null) return `the ledger reports no run${unnamed}`;
  // Equality is "(the recording)" and the other legal case is a recording from a refresh,
  // which is newer than the round that prompted it. The distance between the two ids is
  // deliberately not printed: run ids are sparse, so their difference reads as a count of
  // runs and is not one.
  const relation =
    ledger.newest.run === baseline.run
      ? ' (the recording)'
      : `; the recording (${String(baseline.run)}) is newer`;
  return `the ledger's newest run is ${String(ledger.newest.run)}${relation}${ledgerWhere(ledger)}${unnamed}`;
}

/**
 * The reading a green run prints: what the bounds cost against what the jobs measured.
 *
 * The jobs excused from step bounds are named here rather than in an error, because
 * the exception is legitimate and the reader should see it being taken.
 */
export function budgetSummary(workflow, baseline, ledger = null, declarations = null, readings = null) {
  const recorded = baseline.jobs ?? {};
  const parsedReadings = readings === null || readings === undefined ? null : readReadings(readings);
  const historyKnown = parsedReadings !== null && parsedReadings.errors.length === 0;
  let measured = 0;
  let steps = 0;
  let bounded = 0;
  let carried = 0;
  let reached = 0;
  let allowed = 0;
  let bounds = 0;
  let jobCount = 0;
  let ceilings = 0;
  const excused = [];
  let tightest = { name: '', ratio: Infinity, worst: null };
  const widened = [];
  // A narrowing is a number a reader has to see, for the reason the widening list exists: it
  // is a claim about a day, and the claim is `R6`'s -- twice the slowest day this repository
  // has met still fits (finding 622). Printing the widening and not the narrowing would leave
  // the one direction that spends evidence unstated.
  const narrowings = [];
  // The ceiling's own reading: the job whose ceiling is closest to twice its slowest day.
  // It is a separate superlative from `tightest`, which is about one *step's* bound against
  // one *step's* measured seconds -- the two answer different questions and a summary that
  // printed one of them under the other's name would be finding 588 again.
  const days = jobDays(workflow, baseline, historyKnown ? parsedReadings : null);
  // The ceiling's own reading, and it is a different superlative from `tightest`: the ceiling
  // with the least room above its day is the job a slow day would kill at the ceiling first,
  // and the count of jobs whose ceiling is held by their bounds is the invariant `R13`
  // maintains, printed so that a reader of a green run can see which number each ceiling is
  // (finding 619).
  let closest = { name: '', ratio: Infinity, minutes: 0, day: null };
  let heldByBounds = 0;

  for (const job of jobsOf(workflow)) {
    const record = recorded[job.id];
    if (record === undefined) continue;
    jobCount += 1;
    // A ceiling is a number a hang is charged to, so the summary counts them: `bounds total
    // 327 min` beside `51 min measured` invites a division across eight different ceilings,
    // and the count is what says the division has eight denominators rather than one
    // (finding 604).
    if (job.timeoutMinutes !== null) ceilings += 1;
    const day = days.get(job.id);
    // `R6` accepts a wider budget than the reading was taken under, and a reader has to
    // see that it did: a summary that said nothing would make the exception look like the
    // recording's own number.
    if (record.timeoutMinutes !== job.timeoutMinutes && !narrowed(record, job)) {
      widened.push(`${job.id} ${String(record.timeoutMinutes ?? 'none')} -> ${String(job.timeoutMinutes ?? 'none')}`);
    }
    if (narrowed(record, job)) {
      narrowings.push(
        `${job.id} ${String(record.timeoutMinutes ?? 'none')} -> ${String(job.timeoutMinutes ?? 'none')}`,
      );
    }
    const own = stepsOf(workflow, job.id);
    const allowance = allowanceSecondsOf(workflow, job.id);
    let jobSeconds = 0;
    let jobBounds = allowance;
    bounds += allowance;
    for (const step of own) {
      const seconds = secondsOf(record, step.name) ?? 0;
      jobSeconds += seconds;
      steps += 1;
      // Three populations, counted where the step is seen rather than subtracted from
      // `steps` once the other two are known: a total derived by subtraction is a number
      // two readers can derive differently (finding 588), and this line publishes all
      // three so that the reader does not have to.
      if (step.inheritedFrom === 'prefix') allowed += 1;
      else if (step.inheritedFrom === 'job') carried += 1;
      else if (step.inheritedFrom === null) reached += 1;
      if (step.inheritedFrom === 'step') {
        bounded += 1;
        bounds += step.minutes * 60;
        jobBounds += step.minutes * 60;
        // The denominator is the slowest reading of the command when there is a history
        // to ask, because that is the number `R10` refuses against -- a summary computed
        // from the recording alone would report a ratio the gate does not use.
        const slowest = historyKnown ? worstReadingFor(parsedReadings.rows, commandOf(step)) : null;
        const denominator = slowest === null ? seconds : Math.max(seconds, slowest.seconds);
        const ratio = denominator === 0 ? Infinity : (step.minutes * 60) / denominator;
        if (ratio < tightest.ratio) {
          tightest = { name: `${job.id} / ${step.name}`, ratio, worst: slowest };
        }
      }
    }
    measured += jobSeconds;
    if (job.timeoutMinutes !== null) {
      const overhead = Number.isInteger(record.total) ? Math.max(0, record.total - jobSeconds) : 0;
      if (ceilingNeedOf(day?.seconds ?? 0, jobBounds, overhead).term === 'bounds') heldByBounds += 1;
      if (day !== undefined) {
        const ratio = day.seconds === 0 ? Infinity : (job.timeoutMinutes * 60) / day.seconds;
        if (ratio < closest.ratio) closest = { name: job.id, ratio, minutes: job.timeoutMinutes, day };
      }
    }
    if (own.length === 1 && jobSeconds > FLOOR_MINUTES * 60) {
      excused.push(`${job.id} (${String(Math.round(jobSeconds / 60))} min in one step)`);
    }
  }

  // The steps that are bounded and not measured are named here rather than folded into
  // the ratio above: their bound has no denominator, and a summary that left them out
  // would read as a workflow with one fewer step than it has.
  const parsedDeclarations = readDeclarations(workflow, declarations);
  const awaiting = [];
  for (const [job, pending] of parsedDeclarations.declared) {
    for (const name of pending.keys()) {
      if (secondsOf(recorded[job] ?? {}, name) === null) awaiting.push(`${job} / ${name}`);
    }
  }
  // A job promise is reported separately from a step promise: its bound has no
  // denominator at all, and a summary that folded the two together would read as one
  // kind of waiting when the first run settles them with different rules.
  const awaitingJobs = [];
  for (const [job] of parsedDeclarations.jobs) {
    if (recorded[job] === undefined) awaitingJobs.push(job);
  }

  const excusedText =
    excused.length === 0
      ? 'no job leans on its own budget'
      : `bounded by its own budget alone: ${excused.join(', ')}`;
  const declaredText =
    awaiting.length === 0
      ? 'no step is declared unmeasured'
      : `${String(awaiting.length)} step(s) declared and awaiting the run that measures them: ` +
        awaiting.join(', ');
  const jobsText =
    awaitingJobs.length === 0
      ? 'no job is declared unmeasured'
      : `${String(awaitingJobs.length)} job(s) declared and awaiting their first run: ` +
        awaitingJobs.join(', ');
  const narrowedText =
    narrowings.length === 0
      ? 'no ceiling was narrowed under this recording'
      : `ceiling(s) narrowed under the recording, each still holding twice its slowest day: ` +
        narrowings.join(', ');
  const widenedText =
    widened.length === 0
      ? 'no job was given a wider budget than its reading'
      : `budget(s) widened since the reading: ${widened.join(', ')} -- no step bound moves, ` +
        'and the sum `R13` compares only gains room';
  // The tightest bound names the reading it is tight against, because that is the number
  // `R10` would refuse it for and a reader has to be able to go and look at that run.
  //
  // A workflow whose steps all inherit their job's budget has no ratio to report, and the
  // first version reported one anyway: it printed `tightest  at unmeasuredx`, a sentence
  // with an empty subject and a unit with no number. The branch that says so is written
  // out because a reader who skipped the clause would read the `;` before it as a
  // measurement that came back blank.
  const tightestText =
    bounded === 0
      ? 'no step carries a bound of its own, so nothing here is tight'
      : `${tightest.name} at ${Number.isFinite(tightest.ratio) ? tightest.ratio.toFixed(1) : 'unmeasured'}x` +
        (tightest.worst === null
          ? ''
          : ` of the slowest reading of its command (${String(tightest.worst.seconds)} s in ` +
            `\`${tightest.worst.job} / ${tightest.worst.step}\`, run ${String(tightest.worst.run)})`);
  // The ceiling's reading, printed beside the tightest *step* bound and never folded into it
  // (finding 604). Before this clause the summary published a workflow-wide `bounds total` next
  // to a workflow-wide `measured`, and the one comparison that decides whether a bound can fire
  // -- a job's bounds against the ceiling above them -- was printed by no line at all. The
  // count of ceilings is what says the workflow-wide division has eight denominators, and the
  // superlative names the one with the least room, which is the number `R12` refuses under.
  const ceilingText =
    closest.day === null
      ? 'no job has both a ceiling and a measured day to put them together'
      : `${String(heldByBounds)} of ${String(ceilings)} ceiling(s) hold the bounds inside them and ` +
        `${String(ceilings - heldByBounds)} hold twice a day; the least room above a day is ` +
        `${closest.name} at ${String(closest.minutes)} min, ` +
        `${Number.isFinite(closest.ratio) ? closest.ratio.toFixed(1) : 'unmeasured'}x its slowest day of ` +
        `${String(closest.day.seconds)} s (run ${String(closest.day.run)})`;
  const readingsText =
    parsedReadings === null
      ? 'no history of readings to compare against'
      : parsedReadings.errors.length > 0
        ? `the history of readings cannot be read: ${String(parsedReadings.errors.length)} problem(s)`
        : `${String(parsedReadings.rows.length)} reading(s) of the workflow, run ` +
          `${String(parsedReadings.rows[0]?.run)} to ` +
          `${String(parsedReadings.rows[parsedReadings.rows.length - 1]?.run)}`;
  return (
    `check-ci-budget: OK — ${String(jobCount)} job(s) recorded, ${String(bounded)} of ${String(steps)} ` +
    `step(s) carry their own \`timeout-minutes\`, ${String(carried)} ` +
    `${carried === 1 ? 'is' : 'are'} bounded by ${carried === 1 ? "its job's" : "their jobs'"} budget, ` +
    `and ${String(reached)} ${reached === 1 ? 'has' : 'have'} none, ` +
    (allowed === 0
      ? ''
      : `${String(allowed)} run before the job's first real step and are bounded by one ` +
        `${String(PREFIX_MINUTES)}-minute allowance for the prefix, `) +
    `${String(Math.round(measured / 60))} min measured (as of run ` +
    `${String(baseline.run)}); bounds total ${String(Math.round(bounds / 60))} min in ` +
    `${String(ceilings)} ceiling(s); ${ceilingText}; tightest ` +
    `${tightestText}; ` +
    `${excusedText}; ${declaredText}; ${jobsText}; ${widenedText}; ${narrowedText}; ${readingsText}; ` +
    `${ledgerText(ledger, baseline)}`
  );
}
