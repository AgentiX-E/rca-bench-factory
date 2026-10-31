// What a per-step budget in the batteries job has to satisfy, as functions and no verdict.
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
 * Every way the budget can be wrong, given the workflow and the recording.
 *
 * Returns sentences rather than a boolean, because there are five different repairs
 * behind the six rules and a reader who is told "budgets: FAILED" has to guess which.
 */
export function budgetErrors(workflow, baseline) {
  const errors = [];
  const job = baseline.job;
  if (typeof job !== 'string' || job === '') {
    return ['the baseline names no job: a recording covers one job, and this one does not say which'];
  }

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

  const steps = stepsOf(workflow, job);
  if (steps.length === 0) {
    return [...errors, `ci.yml has no job "${job}", so the recording describes nothing that runs`];
  }

  // R1b -- the job's own budget is the recording's, or the arithmetic below is about a
  // different job than the one that will enforce it.
  const jobBudget = workflow.steps.find((step) => step.job === job)?.jobTimeout ?? '';
  if (Number(jobBudget) !== baseline.jobTimeoutMinutes) {
    errors.push(
      `the baseline was taken when \`${job}\` had ${String(baseline.jobTimeoutMinutes)} minutes and ci.yml now ` +
        `declares ${jobBudget === '' ? 'none' : jobBudget}: the bounds are sized against the budget, so both ` +
        'have to be re-measured together',
    );
  }

  // R2 -- the recording and the workflow describe the same steps, in both directions.
  const recorded = baseline.steps ?? {};
  for (const step of steps) {
    if (!(step.name in recorded)) {
      errors.push(
        `\`${job} / ${step.name}\` has no baseline, so a bound for it would be a guess: run ` +
          '`node scripts/measure-ci-baseline.mjs <run-id>` against a green run',
      );
    }
  }
  const names = new Set(steps.map((step) => step.name));
  for (const name of Object.keys(recorded)) {
    if (!names.has(name)) {
      errors.push(
        `the baseline holds \`${name}\`, which is not a step of \`${job}\`: a recording that outlives its ` +
          'step describes a tree that no longer exists',
      );
    }
  }

  // R3–R5 -- per step: it declares its own bound, the bound is at least the multiple and
  // the floor, and it can expire before the job does.
  let before = 0;
  for (const step of steps) {
    const seconds = recorded[step.name];
    if (step.error !== null) {
      errors.push(`\`${step.name}\`: ${step.error}`);
      continue;
    }
    if (step.inheritedFrom === null) {
      errors.push(
        `\`${job} / ${step.name}\` declares no \`timeout-minutes\` of its own, so its bound is the job's ` +
          'and a hang here spends every other battery\'s budget as well',
      );
    } else if (typeof seconds === 'number') {
      const bound = step.minutes * 60;
      if (bound < MULTIPLE * seconds) {
        errors.push(
          `\`${step.name}\` is bounded at ${String(step.minutes)} min and measured ${String(seconds)} s: the ` +
            `bound is under ${String(MULTIPLE)} times the measurement, so a runner twice as slow is refused ` +
            'for being slow rather than for hanging',
        );
      }
      if (step.minutes < FLOOR_MINUTES) {
        errors.push(
          `\`${step.name}\` is bounded at ${String(step.minutes)} min: the floor is ${String(FLOOR_MINUTES)}, ` +
            'because a measurement cannot see a cold package index or a missed cache',
        );
      }
      const deadline = bound + before;
      if (deadline > baseline.jobTimeoutMinutes * 60) {
        errors.push(
          `\`${step.name}\` is bounded at ${String(step.minutes)} min and the steps before it measured ` +
            `${String(Math.round(before / 60))} min, so its bound expires at ${String(Math.round(deadline / 60))} ` +
            `min -- past the job's ${String(baseline.jobTimeoutMinutes)}. The job would die first and name ` +
            'nothing, which is the defect the bound is for',
        );
      }
    }
    if (typeof seconds === 'number') before += seconds;
  }

  return errors;
}

/** The reading a green run prints: what the bounds cost against what the job measured. */
export function budgetSummary(workflow, baseline) {
  const steps = stepsOf(workflow, baseline.job).filter((step) => step.minutes !== null);
  const measured = Object.values(baseline.steps ?? {}).reduce((sum, one) => sum + one, 0);
  const bounded = steps.reduce((sum, step) => sum + step.minutes * 60, 0);
  const tightest = steps.reduce(
    (worst, step) => {
      const seconds = baseline.steps?.[step.name] ?? 0;
      const ratio = seconds === 0 ? Infinity : (step.minutes * 60) / seconds;
      return ratio < worst.ratio ? { name: step.name, ratio } : worst;
    },
    { name: '', ratio: Infinity },
  );
  return (
    `check-battery-budget: OK — ${String(steps.length)} step(s) of \`${baseline.job}\` bounded, ` +
    `${String(Math.round(measured / 60))} min measured against ${String(baseline.jobTimeoutMinutes)} declared ` +
    `(as of run ${String(baseline.run)}); bounds total ${String(Math.round(bounded / 60))} min; tightest ` +
    `${tightest.name} at ${Number.isFinite(tightest.ratio) ? tightest.ratio.toFixed(1) : 'unmeasured'}x`
  );
}
