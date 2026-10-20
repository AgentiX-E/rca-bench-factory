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

import { describePlan, failureReport, localCommands, runSteps, shippedPlan } from './gate-steps.mjs';
import { runStep } from './step-process.mjs';

const argv = process.argv.slice(2);
const listing = argv.includes('--list');
const onlyIndex = argv.indexOf('--only');
const only = onlyIndex < 0 ? null : (argv[onlyIndex + 1] ?? null);

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

  const result = await runSteps(commands, runStep);
  const selected = only === null ? plan.local.length : plan.local.filter((step) => step.key.includes(only)).length;
  if (!result.ok) {
    // The block is built by `failureReport`, which is pure and tested with both
    // shapes -- a step that exited non-zero and a step that ran past its bound.
    // The timeout branch is the reason: reaching it from here would cost fifteen
    // minutes, so a branch only a test can reach is the only branch that gets one.
    process.stderr.write(`${failureReport(result).join('\n')}\n`);
    process.exit(1);
  }

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
  process.stdout.write(
    [
      '',
      `verify:local: OK (${coverage})`,
      ...(only === null ? [] : [`  the full plan: ${String(plan.remote.length)} step(s) need a runner, by scripts/gate-steps.mjs`]),
      ...plan.remote.map((step) => `  did not run: ${step.key} — ${step.why}`),
      '',
    ].join('\n'),
  );
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
