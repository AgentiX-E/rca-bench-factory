#!/usr/bin/env node
/**
 * Run every CI step that can run here, from the workflow itself.
 *
 * ## What this replaces
 *
 * A sentence someone typed. For ten passes the local gate was
 * `pnpm lint 2>&1 | grep -c FAIL`, which printed `0` every time because `lint`
 * never prints that word -- it exits 1 with a message in another vocabulary. The
 * check could not fail, so it agreed with every change, and CI was left to
 * discover the ones it should have caught.
 *
 * ## Why the commands come from `ci.yml` and not from a list here
 *
 * A second list is a copy, and a copy drifts: the day a gate is added to the
 * workflow, the copy keeps saying green. `gate-steps.mjs` reads the steps out of
 * the workflow and holds them against a table saying which ones need something
 * this machine does not have. **Nothing in this file states a command.**
 *
 * What it therefore cannot promise is that a green run here means a green run
 * there: a handful of steps need a runner, and they are printed at the end, with
 * their reasons, every time. A tool that quietly ran most of the steps and said
 * "OK" would be the defect it was written to remove.
 *
 * ## Usage
 *
 *   node scripts/verify-local.mjs              # everything that can run here
 *   node scripts/verify-local.mjs --list       # the plan, without running it
 *   node scripts/verify-local.mjs --only docs  # steps whose key contains "docs"
 *
 * ## Why the loop is not here
 *
 * `runSteps` and `describePlan` live in `gate-steps.mjs`, with the rest of the
 * plan. Two reasons, and the second is the one that was learned the hard way:
 * they are pure, so a test can drive the failure branch without a runner; and
 * **this file is a gate**, so `verify-gates-are-testable.mjs` hollows it out with
 * `process.exit(0)`. A test that imported this module would die at import and
 * name no failing test -- the harness reports that as unattributed, correctly,
 * because a crashed worker is not a verdict. So this file is imported by nothing:
 * the tests spawn it, and hollowing it makes the spawns return the wrong code.
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  describePlan,
  duration,
  failureReport,
  localCommands,
  notedFailures,
  runSteps,
  ROOT,
  shippedPlan,
} from './gate-steps.mjs';
import { runStep } from './step-process.mjs';
import { repairAbandonedTree } from './tree-repair.mjs';
import {
  receiptDecision,
  rehearsal,
  REHEARSAL_SHAPES,
  revokeReceipt,
  runVerdict,
  verifiedTree,
  voidReport,
  writeReceipt,
} from './gate-receipt.mjs';

const argv = process.argv.slice(2);
const listing = argv.includes('--list');
const onlyIndex = argv.indexOf('--only');
const only = onlyIndex < 0 ? null : (argv[onlyIndex + 1] ?? null);
const rehearseIndex = argv.indexOf('--rehearse');
const rehearsing = rehearseIndex < 0 ? null : (argv[rehearseIndex + 1] ?? '');

/**
 * Where a rehearsal files what it files.
 *
 * A rehearsal ends in the same close-out a run does, which means it files a receipt --
 * and filing a receipt for a tree that does not exist, in this repository's `.git`, would
 * put a name in front of the pusher that no run ever measured. So the root is scratch by
 * default, and a test may point it at its own directory.
 */
function rehearsalRoot() {
  return process.env.RCA_REHEARSAL_ROOT ?? join(tmpdir(), 'rca-bench-rehearsal');
}

/**
 * Everything a finished run decides, in one place, so it is one place.
 *
 * ## What finding 563 left
 *
 * The receipt was refused for a tree that moved and the verdict still printed `OK` and
 * exited 0. The repair gave `runVerdict` the same decision object the receipt used, and
 * closed with a number: a gate told to ignore the decision it computed -- `runVerdict({
 * result, decision: { state: 'issue' } })` -- was green in 207 tests with the inventory
 * unchanged. Nothing in the tree could ask whether the value the gate computed was the
 * value it obeyed: the inventory proves an exit exists and is reached, hollowing proves a
 * gate is executed, and neither is that question.
 *
 * ## Why this function and not five lines in `main`
 *
 * Because a test can reach it. `--rehearse` supplies the inputs a run would have
 * produced, and calls **this** -- the same `receiptDecision`, the same `runVerdict`, the
 * same branch, the same `process.exit`. There is no second close-out to drift from this
 * one, which is what makes a rehearsal evidence rather than a description.
 *
 * `decision` is computed here rather than passed in, and that is the load-bearing choice:
 * a caller that computed it would leave the wiring -- `{ tree, full, ended }` in, verdict
 * out -- outside the reach of the rehearsal, and the wiring is exactly what was measured
 * to be unobservable.
 */
function settle({ result, tree, ended, full, coverage, plan, only: subset, root }) {
  const decision = receiptDecision({ tree, full, ended });
  const verdict = runVerdict({ result, decision });

  if (verdict.exit !== 0) {
    // A red run over content an earlier green run blessed takes the blessing back.
    // Two verdicts about the same bytes cannot both stand, and the later one wins.
    //
    // A void run revokes nothing: there is no verdict about that tree to stand, and an
    // earlier receipt still describes content that has not changed.
    //
    // This line sits *above* the failure report, and the order is not cosmetic:
    // `golden-master/gate-sites.json` fingerprints this exit by the diagnostic
    // immediately above it, so anything printed between the report and the exit
    // renames the site and drops the proof that names its test. Measured here
    // first -- a withdrawal message written after the report cost this site its
    // `provedBy` on the next derivation.
    const revoked =
      verdict.word === 'FAILED' && tree.state === 'clean'
        ? revokeReceipt({ root, tree: tree.tree })
        : { state: 'absent' };
    if (revoked.state === 'revoked') process.stderr.write(`verify:local: withdrew the receipt for tree ${tree.tree}\n`);
    // Two reports, one exit. `FAILED` names the step a reader can act on, even when the
    // tree moved under it -- the move is then a consequence, and the withheld receipt is
    // already on stderr. `VOID` is the state with no failing step to name: every step
    // passed, over content this tree no longer is.
    //
    // Both blocks are built by pure functions that have tests -- `failureReport` with
    // both of its shapes, `voidReport` with the two ways a tree moves -- because
    // reaching either from here costs fifteen minutes, and a branch only a test can
    // reach is the only branch that gets one.
    const report =
      verdict.word === 'VOID' ? voidReport({ decision, started: tree, ended, coverage }) : failureReport(result);
    process.stderr.write(`${report.join('\n')}\n`);
    process.exit(verdict.exit);
  }

  // Two things make "OK" less than it sounds, and both are stated in the verdict
  // line and then listed: a failure the workflow called a note, and a step that did
  // not run at all. The exit code stays zero because CI's job would have stayed
  // green, which is the fact being reproduced.
  const noted = notedFailures(result.outcomes);
  const skipped = result.outcomes.filter((one) => one.status === 'skipped');
  const notes = [
    skipped.length === 0 ? '' : `, ${String(skipped.length)} skipped because the condition was not met`,
    noted.length === 0 ? '' : `, with ${String(noted.length)} tolerated failure(s)`,
  ].join('');

  // The verdict above is a sentence on a terminal and nothing downstream can read
  // it, so the same decision is also filed as a fact keyed on the tree it is about.
  const receipt =
    decision.state === 'issue'
      ? writeReceipt({ root, tree: decision.tree, note: `verify:local ${coverage}` })
      : null;

  process.stdout.write(
    [
      '',
      `verify:local: ${verdict.word} (${coverage})${notes}`,
      ...(subset === null ? [] : [`  the full plan: ${String(plan.remote.length)} step(s) need a runner, by scripts/gate-steps.mjs`]),
      receipt === null
        ? `  receipt:  none — ${decision.why}`
        : `  receipt:  tree ${receipt.tree}, in .git/rca-bench-verified — a revision of this tree may be published`,
      // The budgets, spent against declared. The pool is enforced above; printing it
      // here is what turns "still inside" from an assumption into a measurement,
      // and a step that quietly doubled is visible before it breaks the gate.
      ...(result.budgets.length === 0
        ? []
        : [
            `  budget:  ${result.budgets
              .map((one) => `${one.job} ${duration(one.spentMs)} of ${duration(one.totalMs)}`)
              .join(', ')}`,
          ]),
      ...skipped.map((one) => `  skipped: ${one.step.first} — ${one.why}`),
      ...noted.map(
        (one) => `  tolerated: ${one.step.first} — ${one.error.message}; the workflow says that is a note`,
      ),
      ...plan.remote.map((step) => `  did not run: ${step.key} — ${step.why}`),
      '',
    ].join('\n'),
  );
}

/**
 * The runner is `runStep`, and this file's only job is to decide *which* steps.
 *
 * It used to be a function here, which was the shape this repository keeps
 * finding: a gate that a test may not import, holding the one piece of logic
 * worth testing. `scripts/step-process.mjs` holds it now -- the same code, in a
 * module the suite can drive -- and this file passes it straight through.
 *
 * What the runner owes each step is in that module: the step's own shell, its
 * directory, its environment, and the job's budget.
 */

async function main() {
  const plan = shippedPlan();

  if (plan.errors.length > 0) {
    process.stderr.write('verify:local: the plan does not match the workflow:\n');
    for (const error of plan.errors) process.stderr.write(`  ${error}\n`);
    process.exit(1);
  }

  if (listing) {
    process.stdout.write(`${describePlan(plan).join('\n')}\n`);
    return;
  }

  // A rehearsal is this gate with the inputs a run would have produced. It comes before
  // the preflight because the preflight repairs a working tree, and a rehearsal must not
  // touch one; it comes before the filter because a shape is not a step key.
  //
  // A name the table does not have is refused rather than ignored: `--rehearse movedd`
  // falling through to the plan would start a fifteen-minute run to answer a question
  // about one word, and `--rehearse` on a gate that does not know the flag would do the
  // same -- which is how this branch was found, by adding the test first and watching it
  // run the whole gate.
  if (rehearsing !== null) {
    const inputs = rehearsal(rehearsing, plan);
    if (inputs === null) {
      process.stderr.write(
        `verify:local: no rehearsal is named "${rehearsing}"; the shapes are: ${REHEARSAL_SHAPES.join(', ')}\n`,
      );
      process.exit(1);
    }
    settle({ ...inputs, plan, only: null, root: rehearsalRoot() });
    return;
  }

  const commands = localCommands(
    only === null ? plan.local : plan.local.filter((step) => step.key.includes(only)),
  );
  if (commands.length === 0) {
    process.stderr.write(
      only === null
        ? 'verify:local: the plan selected no commands, which cannot be right\n'
        : `verify:local: no step key contains "${only}"\n`,
    );
    process.exit(1);
  }

  // Before the first step reads anything: put back what a killed battery left.
  // A gate session that starts over a mutated tree reports four reds about the
  // mutation, and every one of them is a sentence about the wrong subject. The
  // repair is a property of the session, not of a step, so it is stated here.
  const repair = repairAbandonedTree();
  if (repair.state === 'held' || repair.state === 'failed') {
    process.stderr.write(`verify:local: the tree is not the repository's:\n  ${repair.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`\npreflight: ${repair.message}\n`);

  // What this run is evidence about. Resolved before the steps rather than after,
  // so a step that rewrites the tree cannot change the name it is filed under.
  const tree = verifiedTree({ root: ROOT });

  const result = await runSteps(commands, runStep);
  const selected = only === null ? plan.local.length : plan.local.filter((step) => step.key.includes(only)).length;
  const runStepsTotal = plan.local.length + plan.remote.length;
  // What ran, then what the plan covers. The two are the same only for a full
  // run, and reporting the plan's size after `--only` would let a one-step check
  // read as though thirty-six steps had passed.
  const coverage =
    only === null
      ? `${String(result.commands)} command(s) covering ${String(plan.local.length)} of the ${String(
          runStepsTotal,
        )} run steps in ci.yml; the other ${String(plan.remote.length)} need a runner`
      : `${String(result.commands)} command(s), ${String(selected)} of the ${String(plan.local.length)} local steps`;

  // Everything from here is the close-out, and it is one function because a rehearsal
  // has to execute it too. Read the tree again first: the receipt is filed under the tree
  // the run began on, and a tree that moved while it ran makes that name a claim about
  // content nothing measured.
  settle({
    result,
    tree,
    ended: verifiedTree({ root: ROOT }),
    full: only === null,
    coverage,
    plan,
    only,
    root: ROOT,
  });
}

// The same direct-call guard as the counting script. Nothing imports this file
// today -- the tests spawn it -- and the guard stays because the failure it
// prevents is silent: `main()` running in the middle of an import looks like a
// test that hangs rather than a test that fails.
if (process.argv[1] !== undefined && process.argv[1].endsWith('verify-local.mjs')) {
  main().catch((error) => {
    // A rejection that reached here is a defect in this file rather than a step's
    // verdict: every step failure is already a value by the time the loop returns.
    process.stderr.write(`verify:local: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
