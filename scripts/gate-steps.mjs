#!/usr/bin/env node
/**
 * What CI runs, and which of those steps can be run on a laptop.
 *
 * ## Why this file exists
 *
 * For ten passes the local gate in this repository was a sentence a person typed:
 * `pnpm lint 2>&1 | grep -c FAIL`, which printed `0` every time because `lint`
 * never prints the word `FAIL` -- it exits 1 with a message in another vocabulary.
 * The check could not fail, and it certified changes that CI then rejected.
 *
 * The fix is not a second list of commands. A `verify:local` script that restates
 * CI's steps would be a copy, and a copy drifts: the day someone adds a gate to
 * `ci.yml`, the copy keeps saying green. So the steps are **read from the
 * workflow**, and the only thing stated by hand is the one thing that cannot be
 * derived -- which of them need something this machine does not have.
 *
 * ## The two properties
 *
 * 1. **Every `run:` step is classified.** Local, or remote-only with a reason.
 *    A new step in `ci.yml` and no entry here is an error, not a default. The
 *    author has to say which it is, because "it happens to work here" is a
 *    property of one machine.
 * 2. **No gate is hidden in a `uses:` step.** Actions are setup: checkout, node,
 *    pnpm, the artefact upload. An action that *decides* something would be a
 *    gate the local plan could not see, so the set is a closed list.
 *
 * ## What this reader cannot do
 *
 * It is a line reader for this repository's workflow, not a YAML parser. It
 * refuses shapes it does not recognise instead of guessing -- a step with no
 * `run:` and no `uses:`, a `name:` at an indent it does not expect, a `run:`
 * block it cannot delimit. `readWorkflow` returns those as errors, and
 * `gate-steps.test.ts` requires the real file to produce none.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');

/** The shipped workflow, unless something points this at a draft. */
export const WORKFLOW = resolve(ROOT, '.github', 'workflows', 'ci.yml');

/**
 * Where to read the steps from.
 *
 * `RCA_CI_WORKFLOW` exists for two reasons, and neither is a testing hook. The
 * first is ordinary: a workflow edit can be checked before it is pushed --
 * `RCA_CI_WORKFLOW=/tmp/ci.yml pnpm verify:local --list` says whether the plan
 * still matches. The second is that the two failure branches of this script can
 * then be reached by a test at all: a plan that does not match, and a step that
 * fails, both need a workflow that differs from the shipped one, and editing
 * `ci.yml` to observe them is not something a test may do.
 *
 * Same pattern as `golden-master/verify.mjs --expected`: a guard that is only
 * ever seen passing is the shape finding 121 was written about.
 */
export function workflowPath() {
  const override = process.env['RCA_CI_WORKFLOW'];
  return override === undefined || override === '' ? WORKFLOW : resolve(ROOT, override);
}

/** The actions a step may use. Anything else is a gate wearing a `uses:`. */
export const SETUP_ACTIONS = {
  'actions/checkout@v4': 'checks the tree out; nothing is decided by it',
  'actions/setup-node@v4': 'installs the Node the repository pins',
  'pnpm/action-setup@v4': 'installs the pnpm the repository pins',
  'actions/upload-artifact@v4': 'carries the battery report out of the runner',
};

/**
 * Every `run:` step in `ci.yml`, by `<job> / <name>`.
 *
 * `local` means: the command as written runs here, with this working directory,
 * and its exit code means what it means in CI. `remoteOnly` means it needs
 * something this machine does not have, and the sentence says what.
 *
 * The list is exhaustive on purpose. If a step is added to the workflow and not
 * added here, `gate-steps.test.ts` fails -- which is the moment a person is still
 * thinking about what the step needs.
 */
export const STEP_PLAN = {
  // ---- verify ---------------------------------------------------------------
  'verify / Install dependencies': {
    local: true,
    note: 'also proves the lockfile is complete; the other three jobs repeat it because they are separate runners',
  },
  'verify / Install the shells the suite cross-checks against': {
    remoteOnly: 'installs zsh through apt, which needs sudo and a package index',
  },
  'verify / Build (core then cli; cli resolves core\'s dist)': { local: true },
  'verify / Type-check': { local: true },
  'verify / Lint (no mock / no secrets / no vendored data / registry / absolute paths / scorer stability)': {
    local: true,
  },
  'verify / Test with coverage (core + cli, ≥95% per dimension, 100% functions)': {
    local: true,
    note: 'the slowest step; it also writes the reports the counts step reads',
  },
  'verify / Published suite counts, read from that run rather than taken again': {
    local: true,
    note: 'depends on the coverage step having written both reports, which the order guarantees',
  },
  'verify / Mutation suite (gate + export, 100% interception)': { local: true },
  'verify / Install a backend this repository did not write': {
    remoteOnly: 'installs prometheus through apt and binds a port',
  },
  'verify / A reader, against that backend': {
    remoteOnly: 'reads from the prometheus the step above installed',
  },

  // ---- batteries ------------------------------------------------------------
  'batteries / Install dependencies': { local: true },
  'batteries / Install the shells the suite cross-checks against': {
    remoteOnly: 'installs zsh through apt, which needs sudo and a package index',
  },
  'batteries / Build (core then cli; cli resolves core\'s dist)': { local: true },
  'batteries / Scorer stability battery (no survivors, no inert mutations)': { local: true },
  'batteries / Component rule battery (no survivors, no inert mutations)': { local: true },
  'batteries / M1-ceiling probe battery (no survivors, no inert mutations)': { local: true },
  'batteries / M1-ceiling probe test battery (no survivors, no inert mutations)': { local: true },
  'batteries / Type-miss probe battery (no survivors, no inert, no blind mutations)': { local: true },
  'batteries / Every gate can be shown to fail': { local: true },
  'batteries / Fault-extraction scoring battery (no survivors)': { local: true },
  'batteries / Fault-extraction workflow battery (no survivors, negative control)': { local: true },
  'batteries / Fetch-official retry battery (no survivors)': { local: true },
  "batteries / Gate-test battery (each gate's test provably fails when its guard is removed)": {
    local: true,
  },
  'batteries / Doc-count shape battery (no survivors, no inert, no misattributed mutations)': { local: true },
  'batteries / Backend-support battery (no survivors, no inert, no misattributed mutations)': { local: true },
  'batteries / Round-trip record battery (no survivors, no inert, no misattributed mutations)': { local: true },
  'batteries / Publish the gate-test battery report': {
    remoteOnly: 'writes to a GitHub artefact/annotation, which needs the run token',
  },
  'batteries / Scorer-stability probe battery (the stability gate refuses a broken scorer)': {
    local: true,
  },

  // ---- artefacts ------------------------------------------------------------
  'artefacts / Install dependencies': { local: true },
  'artefacts / Install the shells the suite cross-checks against': {
    remoteOnly: 'installs zsh through apt, which needs sudo and a package index',
  },
  'artefacts / Build (core then cli; cli resolves core\'s dist)': { local: true },
  'artefacts / Golden Master verification': { local: true },
  'artefacts / Official-metric regression on the shipped example': { local: true },
  'artefacts / Examples and site data are up to date': { local: true },
  'artefacts / Documentation guards are satisfied': { local: true },
  'artefacts / Example pack is up to date': { local: true },
  'artefacts / Example pack is readable by tar and matches the repository': { local: true },
  'artefacts / Example pack verifies against its own manifest': { local: true },

  // ---- cold-tree ------------------------------------------------------------
  'cold-tree / Install dependencies': { local: true },
  'cold-tree / Install the shells the suite cross-checks against': {
    remoteOnly: 'installs zsh through apt, which needs sudo and a package index',
  },
  'cold-tree / Documentation guards that read no build artefact': {
    local: true,
    note: 'the point is that it runs without a build, so it has to run where no build is guaranteed',
  },
  'cold-tree / Lint guards that read no build artefact': { local: true },
  'cold-tree / The rule that decides which scripts may run here': { local: true },
};

/**
 * Read the steps out of the workflow text.
 *
 * Line-based and indentation-strict, because this repository writes its workflow
 * with one step per `- name:` at six spaces. Anything else is reported, not
 * guessed: a wrong guess here would silently drop a gate from the local plan,
 * which is the failure mode this file exists to remove.
 */
export function readWorkflow(text) {
  const lines = text.split('\n');
  const jobsIndex = lines.findIndex((line) => line === 'jobs:');
  if (jobsIndex < 0) return { steps: [], errors: ['ci.yml has no top-level `jobs:`'] };

  const steps = [];
  const errors = [];
  let job = null;

  for (let i = jobsIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    // A new top-level key ends the jobs block.
    if (/^\S/.test(line)) break;

    const jobMatch = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(line);
    if (jobMatch !== null) {
      job = jobMatch[1];
      continue;
    }

    const stepMatch = /^ {6}- name: (.+)$/.exec(line);
    if (stepMatch === null) {
      if (/^ {6}- /.test(line)) errors.push(`line ${String(i + 1)}: a step with no \`name:\``);
      continue;
    }
    if (job === null) {
      errors.push(`line ${String(i + 1)}: a step before any job`);
      continue;
    }

    const name = stepMatch[1].trim();
    const step = { job, name, key: `${job} / ${name}`, run: null, uses: null };
    for (let j = i + 1; j < lines.length; j += 1) {
      const inner = lines[j];
      if (/^ {6}- /.test(inner)) break;
      if (/^ {2}[A-Za-z][\w-]*:\s*$/.test(inner)) break;

      const runMatch = /^ {8}run: (.*)$/.exec(inner);
      if (runMatch !== null) {
        const value = runMatch[1].trim();
        if (value === '|' || value === '>' || value.startsWith('|') || value.startsWith('>')) {
          const body = [];
          let k = j + 1;
          for (; k < lines.length; k += 1) {
            const bodyLine = lines[k];
            if (bodyLine.trim() === '') {
              body.push('');
              continue;
            }
            if (!/^ {10}/.test(bodyLine)) break;
            body.push(bodyLine.slice(10));
          }
          // Trailing blank lines belong to the YAML block, not the command.
          while (body.length > 0 && body[body.length - 1] === '') body.pop();
          if (body.length === 0) errors.push(`line ${String(j + 1)}: a \`run:\` block with no body`);
          step.run = body.join('\n');
          i = k - 1;
        } else {
          step.run = value;
        }
        break;
      }

      const usesMatch = /^ {8}uses: (.+)$/.exec(inner);
      if (usesMatch !== null) {
        step.uses = usesMatch[1].trim();
        break;
      }
    }

    if (step.run === null && step.uses === null) {
      errors.push(`line ${String(i + 1)}: step "${name}" has neither \`run:\` nor \`uses:\``);
    }
    steps.push(step);
  }

  if (steps.length === 0) errors.push('ci.yml parsed to zero steps');
  return { steps, errors };
}

/**
 * Hold the workflow and the plan against each other.
 *
 * Pure, so the failure branches can be driven by a test instead of by breaking
 * `ci.yml` and pushing. Four ways to be wrong, each with its own message:
 *
 *  - a `run:` step with no plan entry (a gate that would not run locally, silently)
 *  - a plan entry with no such step (a renamed step that quietly left the plan)
 *  - a `remoteOnly` entry with a reason too short to be a reason
 *  - a `uses:` step that is not one of the four setup actions
 */
export function classify(steps, plan = STEP_PLAN, setupActions = SETUP_ACTIONS) {
  const errors = [];
  const local = [];
  const remote = [];
  const seen = new Set();

  for (const step of steps) {
    if (step.uses !== null) {
      if (!(step.uses in setupActions)) {
        errors.push(`${step.key}: \`uses: ${step.uses}\` is not a setup action, so it is a gate this plan cannot see`);
      }
      continue;
    }

    const entry = plan[step.key];
    if (entry === undefined) {
      errors.push(`${step.key}: no plan entry. Say whether this step can run here, and why not if it cannot`);
      continue;
    }
    seen.add(step.key);

    if (entry.local === true) {
      local.push({ key: step.key, job: step.job, run: step.run, note: entry.note ?? '' });
      continue;
    }
    if (typeof entry.remoteOnly === 'string') {
      const why = entry.remoteOnly.trim();
      if (why.length < 40) {
        errors.push(`${step.key}: the remote-only reason is ${String(why.length)} characters, which is not a reason`);
        continue;
      }
      remote.push({ key: step.key, job: step.job, why });
      continue;
    }
    errors.push(`${step.key}: a plan entry that is neither \`local: true\` nor \`remoteOnly: "..."\``);
  }

  for (const key of Object.keys(plan)) {
    if (!seen.has(key)) {
      errors.push(`${key}: in the plan, but no such step exists in ci.yml. A renamed step leaves the plan silently`);
    }
  }

  return { errors, local, remote };
}

/** The workflow as it ships, parsed and classified. */
export function shippedPlan(path = workflowPath()) {
  const { steps, errors } = readWorkflow(readFileSync(path, 'utf8'));
  const classified = classify(steps, STEP_PLAN, SETUP_ACTIONS);
  return { steps, ...classified, errors: [...errors, ...classified.errors] };
}

/**
 * Run the commands in order and stop at the first failure.
 *
 * The runner is a parameter because this module has no business spawning
 * anything: the CLI passes its own, and a test passes one that fails on demand.
 * A branch that can only be reached by breaking a real gate is a branch nobody
 * exercises, which is the shape this repository keeps finding.
 */
export function runSteps(commands, run) {
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

/**
 * The commands to run, in the order CI runs them, without repeats.
 *
 * Two jobs that both run `pnpm build` are two runners doing the same thing; on
 * one machine the second adds a minute and proves nothing, so the same command
 * text is run once and reported as already done.
 */
export function localCommands(local) {
  const order = [];
  const byText = new Map();
  for (const step of local) {
    if (byText.has(step.run)) {
      byText.get(step.run).also.push(step.key);
      continue;
    }
    const entry = { run: step.run, first: step.key, also: [] };
    byText.set(step.run, entry);
    order.push(entry);
  }
  return order;
}
