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
// arithmetic over the recording -- the bound, plus everything measured before it, has
// to land inside the job's budget. That is what decides whether a `timeout-minutes`
// here is a bound or a decoration.
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
// ## The fourth thing the arithmetic says
//
// Adding `R3` to a shipped tree immediately refuses more than a missing bound: it
// refuses bounds that cannot fit. A step measured at 536 s wants a bound of 18
// minutes, and a job budget of 15 cannot hold it; a job whose heavy steps measure
// 479 s and 416 s wants 30 minutes of bounds in a job that has 25. Neither is a
// reason to add slack -- it is the arithmetic saying that one job is doing too much
// for one budget, and the repair is another job. That is why this round splits the
// batteries in two instead of raising their ceiling.

import { timeoutOf } from './gate-steps.mjs';

/** The multiples and the floor. Stated here, quoted by the gate and by the tests. */
export const MULTIPLE = 2;
export const FLOOR_MINUTES = 3;

/**
 * The steps of one job, in order, with the budget each declares.
 *
 * `inheritedFrom` is `'step'` only when the step writes its own `timeout-minutes`;
 * a step that inherits the job's has the same number and no bound of its own, which
 * is the difference this module exists to see.
 */
export function stepsOf(workflow, job) {
  return workflow.steps
    .filter((step) => step.job === job)
    .map((step) => {
      const own = step.values?.['timeout-minutes'] ?? '';
      const resolved = timeoutOf(own, step.jobTimeout ?? '');
      return {
        name: step.name,
        run: step.run,
        minutes: resolved.minutes,
        inheritedFrom: own === '' ? null : 'step',
        error: resolved.error,
      };
    });
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
 * Every way the budget can be wrong, given the workflow and the recording.
 *
 * Returns sentences rather than a boolean, because there are six different repairs
 * behind the rules and a reader who is told "budgets: FAILED" has to guess which.
 */
export function budgetErrors(workflow, baseline) {
  const errors = [];

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

  // R2 -- the recording and the workflow describe the same jobs. Both directions,
  // because the two mistakes are different: a job nobody measured has no bound
  // anybody can size, and a recording of a job that is gone describes a tree that
  // no longer exists.
  const recorded = baseline.jobs ?? {};
  for (const job of jobs) {
    if (!(job.id in recorded)) {
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

    // R6 -- the job's own budget is the recording's, or the arithmetic below is
    // about a different job than the one that will enforce it.
    if (record.timeoutMinutes !== job.timeoutMinutes) {
      errors.push(
        `the recording was taken when \`${job.id}\` had ${String(record.timeoutMinutes)} minutes and ` +
          `ci.yml now declares ${job.timeoutMinutes === null ? 'none' : String(job.timeoutMinutes)}: ` +
          'the bounds are sized against the budget, so both have to be re-measured together',
      );
    }

    const steps = stepsOf(workflow, job.id);
    if (steps.length === 0) {
      errors.push(`ci.yml has no step in \`${job.id}\`, so the recording describes nothing that runs`);
      continue;
    }

    // R2, second half -- the steps of this job, in both directions.
    for (const step of steps) {
      if (secondsOf(record, step.name) === null) {
        errors.push(
          `\`${job.id} / ${step.name}\` has no baseline, so a bound for it would be a guess: run ` +
            '`node scripts/measure-ci-baseline.mjs <run-id>` against a green run',
        );
      }
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

    // R4 and R5 -- per step: a job that bounds some of its steps bounds all of them,
    // the bound is at least the multiple and the floor, and it can expire before the
    // job does.
    let before = 0;
    for (const step of steps) {
      const seconds = secondsOf(record, step.name);
      if (step.error !== null) {
        errors.push(`\`${job.id} / ${step.name}\`: ${step.error}`);
      } else if (step.inheritedFrom === null && bounded > 0) {
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
        if (step.minutes < FLOOR_MINUTES) {
          errors.push(
            `\`${step.name}\` is bounded at ${String(step.minutes)} min: the floor is ` +
              `${String(FLOOR_MINUTES)}, because a measurement cannot see a cold package index or a missed cache`,
          );
        }
        if (job.timeoutMinutes !== null) {
          const deadline = bound + before;
          if (deadline > job.timeoutMinutes * 60) {
            errors.push(
              `\`${step.name}\` is bounded at ${String(step.minutes)} min and the steps before it in ` +
                `\`${job.id}\` measured ${String(Math.round(before / 60))} min, so its bound expires at ` +
                `${String(Math.round(deadline / 60))} min -- past the job's ${String(job.timeoutMinutes)}. ` +
                'The job would die first and name nothing, which is the defect the bound is for',
            );
          }
        }
      }
      if (typeof seconds === 'number') before += seconds;
    }
  }

  return errors;
}

/**
 * The reading a green run prints: what the bounds cost against what the jobs measured.
 *
 * The jobs excused from step bounds are named here rather than in an error, because
 * the exception is legitimate and the reader should see it being taken.
 */
export function budgetSummary(workflow, baseline) {
  const recorded = baseline.jobs ?? {};
  let measured = 0;
  let steps = 0;
  let bounded = 0;
  let bounds = 0;
  let jobCount = 0;
  const excused = [];
  let tightest = { name: '', ratio: Infinity };

  for (const job of jobsOf(workflow)) {
    const record = recorded[job.id];
    if (record === undefined) continue;
    jobCount += 1;
    const own = stepsOf(workflow, job.id);
    let jobSeconds = 0;
    for (const step of own) {
      const seconds = secondsOf(record, step.name) ?? 0;
      jobSeconds += seconds;
      steps += 1;
      if (step.inheritedFrom === 'step') {
        bounded += 1;
        bounds += step.minutes * 60;
        const ratio = seconds === 0 ? Infinity : (step.minutes * 60) / seconds;
        if (ratio < tightest.ratio) tightest = { name: `${job.id} / ${step.name}`, ratio };
      }
    }
    measured += jobSeconds;
    if (own.length === 1 && jobSeconds > FLOOR_MINUTES * 60) {
      excused.push(`${job.id} (${String(Math.round(jobSeconds / 60))} min in one step)`);
    }
  }

  const excusedText =
    excused.length === 0
      ? 'no job leans on its own budget'
      : `bounded by its own budget alone: ${excused.join(', ')}`;
  return (
    `check-ci-budget: OK — ${String(jobCount)} job(s) recorded, ${String(bounded)} of ${String(steps)} ` +
    `step(s) bounded, ${String(Math.round(measured / 60))} min measured (as of run ` +
    `${String(baseline.run)}); bounds total ${String(Math.round(bounds / 60))} min; tightest ` +
    `${tightest.name} at ${Number.isFinite(tightest.ratio) ? tightest.ratio.toFixed(1) : 'unmeasured'}x; ` +
    excusedText
  );
}
