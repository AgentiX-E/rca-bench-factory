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
 */

import { execFileSync } from 'node:child_process';
import { ROOT, localCommands, shippedPlan } from './gate-steps.mjs';

const argv = process.argv.slice(2);
const listing = argv.includes('--list');
const onlyIndex = argv.indexOf('--only');
const only = onlyIndex < 0 ? null : (argv[onlyIndex + 1] ?? null);

/**
 * A runner that hands its output straight to the terminal.
 *
 * `sh -c` rather than a split argument list because a step may be a small script
 * -- the example-pack check is eight lines of `tar` and `diff` -- and re-parsing
 * shell text into argv would be a second interpretation of the same command.
 */
export function runCommand(command) {
  execFileSync('sh', ['-c', command], { cwd: ROOT, stdio: 'inherit' });
}

/**
 * Run the commands in order and stop at the first failure.
 *
 * The runner is a parameter so the failure branch can be driven by a test: a
 * branch that can only be reached by breaking a real gate is a branch nobody
 * exercises, which is the shape this repository keeps finding.
 */
export function runSteps(commands, run = runCommand) {
  for (const [index, step] of commands.entries()) {
    process.stdout.write(`\n[${String(index + 1)}/${String(commands.length)}] ${step.first}\n`);
    try {
      run(step.run);
    } catch (error) {
      return { ok: false, index, step, commands: commands.length, error };
    }
  }
  return { ok: true, index: -1, step: null, commands: commands.length, error: null };
}

/** The plan, printed the way a person deciding whether to trust it would read it. */
export function describePlan(plan) {
  const lines = [
    `verify:local — ${String(plan.local.length)} of ${String(plan.remote.length + plan.local.length)} run steps can run here`,
    '',
  ];
  for (const step of plan.local) lines.push(`  local   ${step.key}`);
  lines.push('');
  for (const step of plan.remote) {
    lines.push(`  remote  ${step.key}`);
    lines.push(`          ${step.why}`);
  }
  return lines;
}

function main() {
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

  const result = runSteps(commands);
  const selected = only === null ? plan.local.length : plan.local.filter((step) => step.key.includes(only)).length;
  if (!result.ok) {
    process.stderr.write(
      [
        '',
        `verify:local: FAILED at ${String(result.index + 1)}/${String(result.commands)}`,
        `  step:    ${result.step.first}`,
        `  command: ${result.step.run.split('\n')[0] ?? ''}`,
        '',
      ].join('\n'),
    );
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

// Imported by tests for `runSteps` and `describePlan`; the same direct-call guard
// as the counting script, so importing this file runs nothing.
if (process.argv[1] !== undefined && process.argv[1].endsWith('verify-local.mjs')) {
  main();
}
