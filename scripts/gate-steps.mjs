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

import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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

/**
 * The interpreter a `run:` step is given, as GitHub defines it.
 *
 * ## Why the default is stated here at all
 *
 * A `run:` body is not a command line handed to `sh -c`; it is a **script written
 * to a file** and handed to an interpreter. GitHub's default on Linux and macOS is
 * `bash --noprofile --norc -eo pipefail {0}`. This runner used to say `sh -c`,
 * which on every distribution whose `/bin/sh` is dash is a different program: no
 * `pipefail`, no `[[ ]]`, no `set -o`, no `$BASH_VERSION`. A step could therefore
 * pass here and fail there, with no key in the workflow able to explain the
 * difference -- and the plan said nothing, because a hard-coded default is not a
 * thing the plan had an opinion about.
 *
 * No shipped step currently notices. That is luck, and luck is not a plan: the
 * default is now CI's default, and it is stated in `--list` with the number of
 * steps that override it.
 */
export const DEFAULT_SHELL = 'bash --noprofile --norc -eo pipefail {0}';

/**
 * The shells `shell:` may name, and the templates they mean.
 *
 * Both entries are GitHub's own mappings. `bash` is the default written out, so a
 * step that says `shell: bash` and a step that says nothing are the same step.
 */
export const SHELLS = {
  bash: DEFAULT_SHELL,
  sh: 'sh -e {0}',
};

/**
 * Interpreters this runner can start.
 *
 * The list is closed because "run it through bash anyway" would be this file
 * inventing a meaning for a step. `python {0}` and `pwsh -command {0}` are
 * legitimate GitHub shells and different languages; a command written for one is
 * not a command a shell runner can reproduce, and saying so is more useful than
 * running something else and reporting its exit code as the step's verdict.
 */
export const SHELL_INTERPRETERS = ['bash', 'sh'];

/**
 * A YAML scalar's value, with the quoting removed.
 *
 * `shell: "bash"` and `shell: bash` are the same scalar; a reader that kept the
 * quotes would refuse the first for a reason that is not about shells.
 */
function scalar(raw) {
  const text = String(raw ?? '').trim();
  const quoted =
    text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")));
  return quoted ? text.slice(1, -1).trim() : text;
}

/**
 * Interpret a step's `shell:`, defaulting to CI's own.
 *
 * Returns `{ template, argv, error }`: `argv` is the command line with `{0}` left
 * in place for whoever materialises the script, and `error` is a sentence or null.
 * A template must contain exactly one `{0}` -- GitHub's rule -- because the count
 * is where the script goes, and zero or two is not a shell setting but a step that
 * would run the wrong thing.
 */
export function shellOf(raw) {
  const text = scalar(raw);
  const template = text === '' ? DEFAULT_SHELL : (SHELLS[text] ?? text);
  const argv = template.split(/\s+/).filter((token) => token !== '');
  const interpreter = basename(argv[0] ?? '');
  if (!SHELL_INTERPRETERS.includes(interpreter)) {
    return {
      template,
      argv,
      error:
        `\`shell: ${text}\` names an interpreter this runner cannot read: the body would be ${text} rather than a ` +
        'shell script, and a plan can only make a claim about commands it can run. Write `bash`, `sh`, or a ' +
        'template of one containing `{0}`, or make the step remote-only with a reason',
    };
  }
  const slots = argv.filter((token) => token === '{0}').length;
  if (slots !== 1) {
    return {
      template,
      argv,
      error:
        `\`shell: ${text}\` has ${String(slots)} \`{0}\` placeholders, and GitHub's shell takes exactly one \`{0}\`: ` +
        'the file the `run:` body is written to. With none the script goes nowhere; with two it goes to two places',
    };
  }
  return { template, argv, error: null };
}

/**
 * Interpret a step's `working-directory:`, defaulting to the repository root.
 *
 * A relative path inside this repository, normalised, or a sentence saying why
 * not. Absolute paths are refused rather than accepted-and-worked-out-of-the-tree:
 * the plan's claim is about *this repository*, and a directory this repository
 * does not contain is a directory the plan cannot describe. `..` is refused for
 * the same reason, after normalisation -- `packages/../../x` and `../x` are the
 * same directory and only one of the two spellings looks like an escape.
 */
export function cwdOf(raw) {
  const text = scalar(raw);
  if (text === '') return { path: '.', error: null };
  if (/^[|>][+-]?$/.test(text)) {
    // `working-directory: |` puts the value on the following lines, which this
    // reader does not collect for this key. Accepting the `|` would make a path
    // named `|` look like a directory in this repository.
    return {
      path: '',
      error:
        `\`working-directory: ${text}\` is a block scalar, so the path is on the lines below rather than beside the ` +
        'key. Write the path inline, or make the step remote-only',
    };
  }
  if (isAbsolute(text)) {
    return {
      path: '',
      error:
        `\`working-directory: ${text}\` is an absolute path, which is a fact about one machine rather than about ` +
        'this repository. Use a path inside the tree, or make the step remote-only',
    };
  }
  const resolved = resolve(ROOT, text);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${sep}`)) {
    return {
      path: '',
      error:
        `\`working-directory: ${text}\` leaves the repository. A step whose directory is outside the tree is not ` +
        'a step this plan can describe, whatever it does there',
    };
  }
  return { path: relative(ROOT, resolved) || '.', error: null };
}

/** Where a step runs, as a clause, or an empty string for the default. */
export function whereOf(step) {
  const parts = [];
  const cwd = step.cwd ?? '.';
  if (cwd !== '.') parts.push(`in ${cwd}`);
  const shell = step.shell ?? DEFAULT_SHELL;
  if (shell !== DEFAULT_SHELL) parts.push(shell);
  return parts.join(', ');
}

/**
 * Write a step's body to a file and return the command line that runs it.
 *
 * `{0}` is a path, not an argument to `-c`, so the body has to exist as a file
 * before the interpreter starts. That is also why `$0` inside a step is a path
 * rather than `bash`: the invocation is CI's, not an approximation of it.
 *
 * The file is removed by the caller, in a `finally`, because a failed step still
 * wrote one.
 */
let materialised = 0;
export function materialiseStep(step, dir = tmpdir()) {
  materialised += 1;
  const { argv } = shellOf(step.shell ?? '');
  const file = join(dir, `verify-local-${String(process.pid)}-${String(materialised)}.sh`);
  writeFileSync(file, `${step.run}\n`, { mode: 0o700 });
  return { file, argv: argv.map((token) => (token === '{0}' ? file : token)) };
}

/**
 * Step keys this reader understands, and what it does with each.
 *
 * ## The rule
 *
 * A key that changes *whether*, *where* or *with what* a step runs makes the
 * plan's claim false, and the plan's claim is the only thing this file produces.
 * So every key is either acted on, tolerated on a step that does not run here, or
 * refused. There is no fourth case, and before this pass there was: `if:` was
 * stepped over in silence, and a conditional step marked local would have been
 * reported as something `verify:local` runs.
 *
 * Two of the shipped steps carry `if: always()`, and both are outside the local
 * plan -- the battery report publisher (needs the run token) and the artefact
 * upload (an action). That is why the tolerance exists rather than a blanket
 * refusal: the key is a fact about the step, and whether it matters is a question
 * about the plan.
 */
export const STEP_KEYS = {
  // Acted on.
  name: 'read: the key the plan is indexed by',
  run: 'read: the command, executed verbatim',
  uses: 'read: matched against the setup actions below',
  shell: 'read: the interpreter, reproduced as the file-and-argv pair GitHub uses',
  'working-directory': 'read: where the command runs, carried onto the step and enforced by the runner',

  // Tolerated anywhere, because neither changes the verdict of a command.
  id: 'tolerated: an identifier for later steps to reference',
  'timeout-minutes': 'tolerated: a resource bound, not a condition -- a step that is slower here still fails the same way',

  // Tolerated only on a step that does not run here; refused on a local one.
  if: 'a condition on whether the step runs at all',
  env: 'environment for the command, which this runner does not reproduce',
  'continue-on-error': 'a failure that does not fail the job, which this runner reads as a failure',
  with: 'inputs for an action; meaningful only on a `uses:` step',
};

/**
 * The condition a step declares, as one of the two spellings GitHub accepts.
 *
 * `if: always()` and `if: ${{ always() }}` mean the same thing; anything else is
 * returned as written so the error can quote it back.
 */
export function conditionOf(raw) {
  const text = String(raw ?? '').trim();
  const unwrapped = text.startsWith('${{') && text.endsWith('}}') ? text.slice(3, -2).trim() : text;
  return unwrapped;
}

/**
 * Keys that make a step impossible to run here, with the reason said once.
 *
 * Three, and the three are the argument. `shell:` and `working-directory:` were in
 * this list and are not any more: they made the plan's claim *incomplete* rather
 * than false, and this file now carries both onto the step (see `shellOf` and
 * `cwdOf`). What is left cannot be carried, because each is a semantic difference
 * rather than a parameter:
 *
 *  - `if:` decides *whether* the step runs. `runSteps` stops at the first failure,
 *    so a step that runs regardless is a step this runner would not run at all.
 *  - `env:` supplies values, and the one the shipped workflow uses is a secret the
 *    runner does not have.
 *  - `continue-on-error:` means a failure is not a failure, which is exactly the
 *    distinction a runner exists to report.
 */
export const LOCAL_INCOMPATIBLE = ['if', 'env', 'continue-on-error'];

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
    const step = { job, name, key: `${job} / ${name}`, run: null, uses: null, keys: [], values: {} };
    for (let j = i + 1; j < lines.length; j += 1) {
      const inner = lines[j];
      if (/^ {6}- /.test(inner)) break;
      if (/^ {2}[A-Za-z][\w-]*:\s*$/.test(inner)) break;

      // Every key at the step's own indent, whether or not this reader acts on
      // it. A key it silently stepped over was the whole complaint against the
      // previous pass: `if:` on a local step would have made the plan claim to
      // run something CI may skip.
      const keyMatch = /^ {8}([A-Za-z][\w-]*):(.*)$/.exec(inner);
      if (keyMatch !== null) {
        const [, key, rest] = keyMatch;
        step.keys.push(key);
        // The value is recorded for every key, not only the ones this reader acts
        // on: `shell:`, `working-directory:` and `if:` are all read by value now,
        // and a reader that kept only the key names would have to grow a special
        // case each time another one started to matter.
        step.values[key] = rest.trim();
      }

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
        // **Not** the end of the step. Keys may be written in any order, and
        // GitHub's own examples put `working-directory:` *after* `run:`. This
        // reader used to `break` here, so every key below the command was
        // invisible -- which is why honouring `working-directory:` was impossible
        // until the loop stopped stopping. The body of a block scalar cannot be
        // mistaken for a key: it is indented ten spaces, and the key pattern here
        // is anchored at exactly eight.
        continue;
      }

      const usesMatch = /^ {8}uses: (.+)$/.exec(inner);
      if (usesMatch !== null) {
        step.uses = usesMatch[1].trim();
        // Same reason: `with:` and `if:` follow `uses:` in this very workflow.
        continue;
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
  const tolerated = [];
  const seen = new Set();

  for (const step of steps) {
    if (step.uses !== null) {
      if (!(step.uses in setupActions)) {
        errors.push(`${step.key}: \`uses: ${step.uses}\` is not a setup action, so it is a gate this plan cannot see`);
      }
      // The two keys that describe a command line. An action has none: it decides
      // its own interpreter and its own directory, so a `shell:` here would be a
      // line in the workflow that nothing reads -- GitHub's own runner ignores it.
      for (const key of ['shell', 'working-directory']) {
        if ((step.keys ?? []).includes(key)) {
          errors.push(
            `${step.key}: \`${key}:\` on a \`uses:\` step does nothing -- an action chooses its own interpreter and ` +
              'directory. A key nothing reads is a sentence a reader will believe',
          );
        }
      }
      // Recorded rather than ignored: a conditional action is not a gate, but the
      // fact that the workflow uses conditions should be visible in the plan
      // rather than inferred from the plan's silence.
      const conditional = (step.keys ?? []).filter((key) => LOCAL_INCOMPATIBLE.includes(key));
      if (conditional.length > 0) {
        const condition = conditional.includes('if') ? conditionOf(step.values?.['if']) : null;
        if (condition !== null && condition !== 'always()') {
          errors.push(
            `${step.key}: \`if: ${String(step.values?.['if'] ?? '')}\` on an action is a condition this plan cannot describe`,
          );
          continue;
        }
        tolerated.push({ key: step.key, keys: conditional, condition });
      }
      continue;
    }

    const entry = plan[step.key];
    if (entry === undefined) {
      errors.push(`${step.key}: no plan entry. Say whether this step can run here, and why not if it cannot`);
      continue;
    }
    seen.add(step.key);

    if (step.run !== null && (step.keys ?? []).includes('with')) {
      errors.push(`${step.key}: a \`run:\` step with \`with:\`, which GitHub does not allow -- one of the two is not doing what it looks like`);
    }

    for (const key of step.keys ?? []) {
      if (!(key in STEP_KEYS)) {
        errors.push(`${step.key}: this reader does not know what \`${key}:\` does to a step, so it cannot say whether the plan holds`);
      }
    }

    // Both are read for every step, local or not: a value this reader cannot
    // understand is a fact about the step, and only the *consequence* differs by
    // where the step runs.
    const shell = shellOf(step.values?.shell);
    const cwd = cwdOf(step.values?.['working-directory']);

    if (entry.local === true) {
      // A key that changes whether or with what a local step runs makes
      // "verify:local ran this" false, so it is refused rather than tolerated.
      const blocked = (step.keys ?? []).filter((key) => LOCAL_INCOMPATIBLE.includes(key));
      for (const key of blocked) {
        errors.push(
          `${step.key}: marked local, but carries \`${key}:\` -- ${String(STEP_KEYS[key])}. ` +
            'Either make it remote-only with a reason, or teach the runner the key',
        );
      }
      // `shell:` and `working-directory:` are honoured rather than refused, so
      // the only way they can be wrong is a value this runner cannot read. Same
      // outcome, and it is the outcome a local claim needs: the step does not run
      // here, and the plan says why instead of assuming it away.
      if (shell.error !== null) errors.push(`${step.key}: ${shell.error}`);
      if (cwd.error !== null) errors.push(`${step.key}: ${cwd.error}`);
      if (blocked.length > 0 || shell.error !== null || cwd.error !== null) continue;

      local.push({
        key: step.key,
        job: step.job,
        run: step.run,
        note: entry.note ?? '',
        cwd: cwd.path,
        shell: shell.template,
      });
      continue;
    }
    if (typeof entry.remoteOnly === 'string') {
      const conditional = (step.keys ?? []).filter((key) => LOCAL_INCOMPATIBLE.includes(key));
      // A condition is the one tolerated key whose *value* can contradict the
      // plan. `if: always()` only widens when a step runs; any other condition
      // narrows it, which would make the reason this step does not run here part
      // of the reason -- "needs prometheus" would be true and incomplete.
      if (conditional.includes('if')) {
        const condition = conditionOf(step.values?.['if']);
        if (condition !== 'always()') {
          errors.push(
            `${step.key}: \`if: ${String(step.values?.['if'] ?? '')}\` is a condition this plan cannot describe. ` +
              'Only `always()` can be tolerated on a step outside the plan, because it is the one condition ' +
              'that widens when a step runs rather than narrowing it',
          );
          continue;
        }
      }
      // A shell or directory this runner cannot read is tolerated here and only
      // here: the step does not run on this machine, so the plan's sentence about
      // it stays true without understanding the value.
      const unreadable = [];
      if (shell.error !== null) unreadable.push('shell');
      if (cwd.error !== null) unreadable.push('working-directory');
      const toleratedKeys = [...conditional, ...unreadable];
      if (toleratedKeys.length > 0) {
        tolerated.push({
          key: step.key,
          keys: toleratedKeys,
          condition: conditional.includes('if') ? 'always()' : null,
        });
      }
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

  return { errors, local, remote, tolerated };
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
    // The whole step is handed over, not its text: the interpreter and the
    // directory are part of the command, and a runner given only the text would
    // be unable to honour either.
    const where = whereOf(step);
    process.stdout.write(
      `\n[${String(index + 1)}/${String(commands.length)}] ${step.first}${where === '' ? '' : ` (${where})`}\n`,
    );
    try {
      run(step);
    } catch (error) {
      return { ok: false, index, step, commands: commands.length, error };
    }
  }
  return { ok: true, index: -1, step: null, commands: commands.length, error: null };
}

/** The plan, printed the way a person deciding whether to trust it would read it. */
export function describePlan(plan) {
  const overrides = plan.local.filter((step) => whereOf(step) !== '');
  const lines = [
    `verify:local — ${String(plan.local.length)} of ${String(plan.remote.length + plan.local.length)} run steps can run here`,
    // The default is stated, and so is the number of steps that depart from it. A
    // runner whose default is unstated has a default nobody can review, which is
    // how `sh -c` survived ten passes.
    `  each command runs from the repository root under \`${DEFAULT_SHELL}\`; ${String(overrides.length)} of ${String(
      plan.local.length,
    )} override either`,
    '',
  ];
  for (const step of plan.local) {
    const where = whereOf(step);
    lines.push(`  local   ${step.key}${where === '' ? '' : ` — ${where}`}`);
  }
  lines.push('');
  for (const step of plan.remote) {
    lines.push(`  remote  ${step.key}`);
    lines.push(`          ${step.why}`);
  }
  if (plan.tolerated.length > 0) {
    lines.push('');
    lines.push(`  ${String(plan.tolerated.length)} step(s) outside the plan carry a key this runner does not reproduce:`);
    for (const step of plan.tolerated) {
      // The condition is shown with its value: `if (always())` says what was
      // tolerated, where `if` alone would say only that something was.
      const shown = step.keys.map((key) => (key === 'if' ? `if (${String(step.condition)})` : key));
      lines.push(`    ${step.key} — ${shown.join(', ')}`);
    }
  }
  return lines;
}

/**
 * The commands to run, in the order CI runs them, without repeats.
 *
 * Two jobs that both run `pnpm build` are two runners doing the same thing; on
 * one machine the second adds a minute and proves nothing, so the same command
 * text is run once and reported as already done.
 *
 * "The same command" is now the same **interpreter, directory and text**. It used
 * to be the text alone, which was true while every step ran from the root under
 * one shell and became false the moment either could differ: `pnpm lint` in
 * `packages/core` and `pnpm lint` in `packages/cli` would have collapsed into one
 * run, and the second step would have been reported as done by the first.
 */
export function localCommands(local) {
  const order = [];
  const byIdentity = new Map();
  for (const step of local) {
    const entry = {
      run: step.run,
      cwd: step.cwd ?? '.',
      shell: step.shell ?? DEFAULT_SHELL,
      first: step.key,
      also: [],
    };
    const identity = [entry.cwd, entry.shell, entry.run].join('\u0000');
    const seen = byIdentity.get(identity);
    if (seen !== undefined) {
      seen.also.push(step.key);
      continue;
    }
    byIdentity.set(identity, entry);
    order.push(entry);
  }
  return order;
}
