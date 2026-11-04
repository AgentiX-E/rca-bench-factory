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
  const errors = [];
  if (declarations === null || declarations === undefined) return { declared, errors };
  const list = declarations.declared;
  if (!Array.isArray(list)) {
    errors.push(
      'the declarations file has no `declared` list, so no step in it can be read: write the ' +
        'list, or delete the file and let the recording speak for the tree',
    );
    return { declared, errors };
  }
  if (list.length === 0) {
    errors.push(
      'the declarations file declares nothing: an empty list describes the state of having no ' +
        'declarations, which is the state of not having the file -- delete it',
    );
    return { declared, errors };
  }
  const ids = new Set(jobsOf(workflow).map((job) => job.id));
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
  return { declared, errors };
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
export function ledgerErrors(baseline, ledger) {
  if (ledger === null || ledger === undefined || ledger.read !== true) return [];
  if (ledger.tail === null) return [];
  const errors = [];
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
 * Every way the budget can be wrong, given the workflow and the recording.
 *
 * Returns sentences rather than a boolean, because there are six different repairs
 * behind the rules and a reader who is told "budgets: FAILED" has to guess which.
 */
export function budgetErrors(workflow, baseline, ledger = null, declarations = null) {
  const parsed = readDeclarations(workflow, declarations);
  const errors = [...ledgerErrors(baseline, ledger), ...parsed.errors];
  const declared = parsed.declared;

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
        if (job.timeoutMinutes !== null) {
          const deadline = step.minutes * 60 + before;
          if (deadline > job.timeoutMinutes * 60) {
            errors.push(
              `\`${step.name}\` is declared at ${String(step.minutes)} min and the steps before it in ` +
                `\`${job.id}\` measured ${String(Math.round(before / 60))} min, so its bound would expire ` +
                `at ${String(Math.round(deadline / 60))} min -- past the job's ${String(job.timeoutMinutes)}. ` +
                'The job would die first and name nothing, which is the defect the bound is for',
            );
          }
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
      if (typeof seconds === 'number') before += seconds;
    }
  }

  return errors;
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
  return `the ledger's newest run is ${String(ledger.newest.run)}${relation}${unnamed}`;
}

/**
 * The reading a green run prints: what the bounds cost against what the jobs measured.
 *
 * The jobs excused from step bounds are named here rather than in an error, because
 * the exception is legitimate and the reader should see it being taken.
 */
export function budgetSummary(workflow, baseline, ledger = null, declarations = null) {
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

  // The steps that are bounded and not measured are named here rather than folded into
  // the ratio above: their bound has no denominator, and a summary that left them out
  // would read as a workflow with one fewer step than it has.
  const awaiting = [];
  for (const [job, pending] of readDeclarations(workflow, declarations).declared) {
    for (const name of pending.keys()) {
      if (secondsOf(recorded[job] ?? {}, name) === null) awaiting.push(`${job} / ${name}`);
    }
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
  return (
    `check-ci-budget: OK — ${String(jobCount)} job(s) recorded, ${String(bounded)} of ${String(steps)} ` +
    `step(s) bounded, ${String(Math.round(measured / 60))} min measured (as of run ` +
    `${String(baseline.run)}); bounds total ${String(Math.round(bounds / 60))} min; tightest ` +
    `${tightest.name} at ${Number.isFinite(tightest.ratio) ? tightest.ratio.toFixed(1) : 'unmeasured'}x; ` +
    `${excusedText}; ${declaredText}; ${ledgerText(ledger, baseline)}`
  );
}
