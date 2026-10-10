import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The pipeline must contain a job that starts where a reader starts.
 *
 * ## What this file exists for
 *
 * `typecheck` was green for months because CI ran `Build` before `Type-check`,
 * so the step was satisfied by the step above it (finding 43). The fix was a
 * `pretypecheck` hook, and it was a real fix -- `pnpm typecheck` now works on a
 * tree that has never been built, which `typecheck-entrypoint.test.ts` asserts
 * by doing exactly that.
 *
 * But the defect was not "`typecheck` is missing a hook". It was **"the
 * pipeline's step order is a precondition nobody wrote down"**, and fixing the
 * one script that had been observed to break left that structure intact. When
 * P2-1 was finally measured, three of the seven doc guards and the whole of
 * `lint`, `test`, `examples:check` and `official:check` turned out to have the
 * same shape -- a consequence of their order in `ci.yml` rather than of
 * anything they say about themselves.
 *
 * The cold-tree job is what makes that class of defect impossible to keep. It
 * checks out the repository, installs, and then runs the chain with **no build
 * step of its own**: every script it calls has to satisfy its own precondition.
 * A future script that assumes a warm tree fails there on the push that adds
 * it, rather than after the next person happens to work from a fresh clone.
 *
 * ## Why this is a test and not a workflow alone
 *
 * A workflow with no test has no guard: deleting the job, or quietly putting a
 * `pnpm build` back into it, would leave the pipeline green and the coverage
 * gone. Both of those are asserted below. The second is the subtle one -- the
 * job exists to run *without* a build, so a build step inside it does not weaken
 * the job, it removes its reason for existing while looking tidier.
 *
 * ## What this does not establish
 *
 * It does not establish that the job *passes*. Only the pipeline can say that,
 * and it says it by running. A job that is present and red is a different
 * problem with a different symptom, and it is the problem this iteration fixed
 * on the scripts' side rather than a reason to weaken the job.
 *
 * It does not establish that the job's step list equals the main job's step
 * list. The cold-tree job deliberately runs fewer things -- the mutation
 * batteries and the example-pack round trip are about correctness once a tree
 * is built, not about whether a script can find its own inputs -- and inventing
 * an equality rule would force it to duplicate work with no added signal. What
 * is asserted is that it reaches the scripts whose preconditions are in
 * question.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const WORKFLOW = '.github/workflows/ci.yml';

function workflow(): string {
  return readFileSync(resolve(ROOT, WORKFLOW), 'utf8');
}

/**
 * The body of one job, from its `<name>:` line to the next line indented by the
 * same amount or less.
 *
 * Textual rather than a YAML parse on purpose. The repository has no YAML
 * dependency and adding one to read two files would be the tail wagging the dog;
 * more importantly, this reads the same characters CI does, so a job whose `run`
 * lines are nested differently under `steps:` is caught here rather than
 * silently parsed into the wrong shape.
 */
function jobBody(name: string): string {
  const body = workflow();
  const marker = new RegExp(`^ {2}${name}: *$`, 'm');
  const start = body.search(marker);
  if (start === -1) return '';
  const rest = body.slice(start);
  const lines = rest.split('\n');
  const collected: string[] = [lines[0]!];
  for (const line of lines.slice(1)) {
    // A sibling job starts at exactly two spaces; anything else belongs here.
    if (/^ {0,2}\S/.test(line)) break;
    collected.push(line);
  }
  return collected.join('\n');
}

/**
 * Every `run:` payload in a job body, with its block scalars flattened.
 *
 * A step whose command is a `run: |` block contributes all of its lines, so a
 * build hidden inside a multi-line step is still seen -- which is the case the
 * "no build" assertion below has to catch.
 */
function runCommands(body: string): string[] {
  const commands: string[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[i]!);
    if (match === null) continue;
    const indent = match[1]!.length;
    const inline = match[2]!.trim();
    if (inline !== '' && inline !== '|' && inline !== '>') {
      commands.push(inline);
      continue;
    }
    const block: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j]!;
      if (line.trim() === '') continue;
      if (line.search(/\S/) <= indent) break;
      block.push(line.trim());
    }
    commands.push(block.join('\n'));
  }
  return commands;
}

const JOB = 'cold-tree';

/**
 * The aggregate scripts the cold-tree job is allowed to call, and the guards
 * each one is allowed to reach.
 *
 * ## Why the job calls an aggregate rather than the guards
 *
 * The first version of this job named the guards one at a time in `ci.yml`, and
 * `ci-reaches-doc-guards.test.ts` went red -- correctly. That file exists because
 * v1.52 added `check-l4-status.mjs` to `docs:check`, verified it locally, and CI
 * never ran it: the job named guards individually, so the aggregate was a
 * local-only channel. A hand-maintained list in the workflow is exactly the
 * defect it forbids, and a cold-safe list is still a hand-maintained list.
 *
 * The resolution is that the cold subset is **itself an aggregate** --
 * `docs:check:cold` and `lint:cold` in `package.json` -- so the workflow calls a
 * script name and the membership lives where membership already lives. This
 * table is the assertion about what those two aggregates may contain, and it is
 * reconciled against `package.json` rather than against the workflow.
 */
const COLD_AGGREGATES: ReadonlyMap<string, readonly string[]> = new Map([
  [
    'docs:check:cold',
    [
      'check-l4-status.mjs',
      'check-doc-counts.mjs',
      'check-data-model-vocabularies.mjs',
      'derive-gate-sites.mjs',
    ],
  ],
  [
    'lint:cold',
    [
      'check-no-mock.mjs',
      'check-no-secrets.mjs',
      'check-no-vendored-data.mjs',
      'check-official-registry.mjs',
      'check-no-absolute-paths.mjs',
      'check-no-unsafe-shell.mjs',
    ],
  ],
]);

/**
 * Every `scripts/*.mjs` that was **measured** to exit 0 with
 * the workspaces build output removed.
 *
 * ## How each row was measured
 *
 *   rm -rf packages/core/dist packages/cli/dist
 *   pnpm exec node scripts/<name>.mjs
 *   echo $?   # 0 for every row in COLD_AGGREGATES
 *
 * The work is done through `pnpm exec`, which runs no `pre`/`post` hook, so the
 * measurement cannot be satisfied by a hook that compiles the tree first -- the
 * mistake that produced finding 136. `dist` was confirmed at 0 files after each
 * run.
 *
 * ## What is deliberately absent, and why
 *
 * `check-readme-sample.mjs` (imports `core/dist/index.js`),
 * `check-cli-reference.mjs` and `check-user-guide.mjs` (both drive
 * `cli/dist/main.js`), `verify-scorer-stability.mjs` (imports
 * `core/dist/fault/extraction-scoring.js`), `gen-examples.mjs`,
 * `build-example-bundle.mjs` and `check-official.mjs` (all three import
 * `core/dist/index.js`) are build-dependent and were measured failing with
 * `ERR_MODULE_NOT_FOUND` on a cold tree. They belong to the warm job.
 */
const COLD_SAFE_FILES: ReadonlySet<string> = new Set([
  ...(COLD_AGGREGATES.get('docs:check:cold') ?? []),
  ...(COLD_AGGREGATES.get('lint:cold') ?? []),
]);

/**
 * The flag that actually suppresses `pre`/`post` lifecycle hooks.
 *
 * ## Why this constant exists, and why it is not `--ignore-scripts`
 *
 * The obvious flag is `--ignore-scripts`, and it is the one this project first
 * reached for. It does **not** do this. Measured against a two-script probe
 * package whose `prehello` appends `HOOK` and `hello` appends `MAIN`:
 *
 * | invocation | log |
 * | --- | --- |
 * | `pnpm hello` | `HOOK`, `MAIN` |
 * | `pnpm --ignore-scripts hello` | `HOOK`, `MAIN` |
 *
 * and against this repository, on a tree with the build output removed:
 * `pnpm --ignore-scripts typecheck` printed `pretypecheck`, then
 * `pnpm --filter @rca-bench-factory/core build`, then `tsc -p tsconfig.json`, and
 * left **18 files** in `packages/core/dist`. `--ignore-scripts` suppresses
 * `install` and `prepare` scripts; the `pre`/`post` hooks are not in that class.
 *
 * `--config.enable-pre-post-scripts=false`, measured the same way, suppressed the
 * hook and left `dist` at **0 files**. It is the flag the workflow uses and the
 * flag this guard looks for, which is what makes "this job does not build" a
 * property of the commands rather than of a reader's belief.
 */
const HOOK_SUPPRESSION = '--config.enable-pre-post-scripts=false';

/**
 * The set of package scripts a job's commands reach, following lifecycle hooks.
 *
 * ## Why this exists
 *
 * Reading a job's `run:` lines answers "which commands does this job name". It
 * does not answer "which commands does this job run", and for pnpm the two
 * differ by the `pre<script>` and `post<script>` hooks in `package.json`, which
 * pnpm invokes whether or not the caller mentioned them.
 *
 * That gap is the whole of finding 136: `cold-tree` names `pnpm test` and never
 * names a build, and `pnpm test` runs `pnpm build` first because of
 * `"pretest": "pnpm build"`. A guard that reads the YAML for the absence of the
 * word `build` is satisfied by a job that builds.
 *
 * ## The suppression flag is per-command, not per-job
 *
 * A `pre<script>` hook is a property of the *invocation*, so whether the job
 * reaches a build depends on which of its commands carry
 * `--config.enable-pre-post-scripts=false`. Reading the flag job-wide would be
 * the same class of mistake as reading the YAML for the word `build`: it would
 * report a job as cold when one of its steps is warm. The flag is therefore
 * resolved per command, and the hook is only added when that command does not
 * carry it.
 *
 * The resolution is deliberately shallow -- one level, the hooks of the scripts
 * the job names -- because that is where the defect lives and because a deeper
 * walk would need the real pnpm resolver. One level is stated, not assumed: the
 * helper returns the set of lifecycle names reached, so a caller can assert on
 * it and a reader can see the boundary.
 */
function reachedScripts(commands: string[]): Set<string> {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const reached = new Set<string>();
  for (const command of commands) {
    // Per command, because the flag is per command.
    const suppressesHooks = command.includes(HOOK_SUPPRESSION);
    for (const m of command.matchAll(/\bpnpm\s+(?:--filter\s+\S+\s+|run\s+)?([a-z][a-z0-9:-]*)/g)) {
      const name = m[1]!;
      reached.add(name);
      if (suppressesHooks) continue;
      // The hooks pnpm will run around it.
      reached.add(`pre${name}`);
      reached.add(`post${name}`);
    }
  }
  // Keep only names the root package actually defines, so a token that merely
  // looks like a script name does not report a build.
  return new Set([...reached].filter((name) => name in pkg.scripts));
}

/**
 * The scripts a job's commands reach that compile TypeScript, directly or via a hook.
 *
 * ## Why the body of the hook has to be read, not just its name
 *
 * The first version of this predicate looked for a reached script *named* `build`,
 * `prebuild` or `postbuild`. It found `pretest` and stopped -- and `pretest` is
 * `pnpm build`. A guard that recognises the defect only when it is spelled the way
 * the guard expects is the same class of mistake as the YAML check it replaced:
 * it was written against the shape of the bug rather than against what the bug
 * does. The `tsc` invocation is in the *body* of `pretest`, so the body is what
 * has to be read.
 */
function compilingScripts(commands: string[]): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const reached = reachedScripts(commands);
  const compiles: string[] = [];
  for (const name of reached) {
    const body = pkg.scripts[name] ?? '';
    // Either the script is a build, or it runs one, or it calls the compiler.
    if (/\bpnpm\s+build\b|\btsc\b/.test(body)) compiles.push(`${name}: ${body}`);
  }
  return compiles;
}

/**
 * Every job id in the workflow's `jobs:` map, in file order.
 *
 * A job id is the key directly under `jobs:`, indented two spaces. Read
 * structurally rather than by regex over the whole file, so a comment quoting a
 * job name cannot be mistaken for a job.
 */
function jobIds(): string[] {
  const raw = workflow();
  const lines = raw.split('\n');
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (start === -1) return [];
  const ids: string[] = [];
  for (const line of lines.slice(start + 1)) {
    // The `jobs:` map ends at the first line with no indentation.
    if (/^\S/.test(line)) break;
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m !== null) ids.push(m[1]!);
  }
  return ids;
}

describe('ci · the cold-tree job starts where a reader starts', () => {
  const body = jobBody(JOB);

  it('exists as a job of its own', () => {
    // Named as the job's own key rather than as a step, because a step inside
    // `verify` would inherit the build above it and measure nothing.
    expect(
      body,
      `${WORKFLOW} must define a \`${JOB}:\` job; a step inside an already-warm job cannot ` +
        'observe a precondition, because the steps above it satisfy one',
    ).not.toBe('');
  });

  it('triggers on push and on pull requests, like the job it sits beside', () => {
    // P2-1's exit condition is "the job runs beside the existing CI". A nightly
    // job would still find the defect, but it would find it days later, and this
    // repository's recorded failure mode is precisely a gap that sits unread
    // between the moment it appears and the moment someone looks.
    const head = workflow().split(/^jobs:/m)[0] ?? '';
    expect(head).toMatch(/^\s{2}push:/m);
    expect(head).toMatch(/^\s{2}pull_request:/m);
  });

  it('never builds, because building is the step it exists to remove', () => {
    const commands = runCommands(body);
    const builds = commands.filter((c) => /\bpnpm\s+build\b/.test(c) || /\bpnpm\s+.*\bbuild\b/.test(c));

    expect(
      builds,
      `the ${JOB} job runs a build, which satisfies the very precondition it is measuring:\n` +
        builds.join('\n---\n'),
    ).toEqual([]);
  });

  it('every command it runs suppresses the lifecycle hooks, so no step can build', () => {
    // ## What the assertion above missed, and why it could not see it
    //
    // The check above reads the *job's* command list for the word `build`.
    // `pnpm test` is not a build command, so it passes -- and `pnpm test` has
    // `"pretest": "pnpm build"` in the root `package.json`, which pnpm runs for
    // you. The job's own log for run #174 contains `tsc -p tsconfig.json`
    // **six times**: the tree is built before it is tested, in the job whose
    // stated purpose is that it is not.
    //
    // This is finding 136. It also explains an intermittent failure that had
    // been attributed to four different modules: `tsc` writes `dist/`
    // incrementally, the suite spawns scripts that import it, and a script that
    // starts mid-write dies at link time on whichever module the compiler has
    // not reached yet.
    //
    // The guard is stated against the *effect* rather than the spelling, because
    // the spelling is what the previous check rested on: a command the job runs,
    // resolved through the lifecycle hooks it will actually trigger, must not
    // compile TypeScript.
    const compiles = compilingScripts(runCommands(body));
    expect(
      compiles,
      `the ${JOB} job reaches a build through a lifecycle hook:\n${compiles.join('\n')}\n` +
        'A `pretest`/`prelint` hook compiles the tree before the step that exists to run without one.',
    ).toEqual([]);
  });

  it('carries the suppression flag on every command that names a pnpm script, not just some', () => {
    // ## Why this is asserted per command rather than per job
    //
    // The check above passes if *every* command is suppressed, and it also
    // passes if the job happens to name only scripts with no hooks. The second
    // is a coincidence, not a rule: adding `pnpm typecheck` (whose hook is the
    // one that has been in the tree longest) to an unsuppressed line would
    // reintroduce the build this job exists to remove, and the check above would
    // still pass because `typecheck` is reached, and `pretypecheck` -- reached
    // only when the line is unsuppressed -- is what compiles.
    //
    // ## Why it checks the exact spelling and not merely the presence of a flag
    //
    // The first version of this assertion asked whether the command contained
    // the substring `--config.enable-pre-post-scripts`. Mutation M1b replaced
    // `=false` with `=true` -- the setting exists, the name is right, the hooks
    // run, and the job builds -- and the guard passed. A guard that checks for
    // the presence of a flag rather than for the value that does the work is the
    // same defect as a guard that checks for the word `build` instead of for
    // what compiles, which is what this whole file was rewritten to stop doing.
    //
    // So the comparison is against the whole literal. A command may carry the
    // flag at all only in its exact suppressing form.
    const unsuppressed: string[] = [];
    const wrongValue: string[] = [];
    for (const command of runCommands(body)) {
      for (const line of command.split('\n')) {
        const trimmed = line.trim();
        if (!/^pnpm\b/.test(trimmed)) continue;
        // `pnpm exec <binary>` and `pnpm install` invoke no package script.
        if (/^pnpm\s+(exec|install)\b/.test(trimmed)) continue;
        // The prefix of the flag, so a wrong value is reported as such rather
        // than as a missing flag -- the two have different repairs.
        if (trimmed.includes('--config.enable-pre-post-scripts=')) {
          if (!trimmed.includes(HOOK_SUPPRESSION)) wrongValue.push(trimmed);
          continue;
        }
        unsuppressed.push(trimmed);
      }
    }
    expect(
      unsuppressed,
      `these ${JOB} commands name a pnpm script without suppressing its lifecycle hooks:\n` +
        `${unsuppressed.join('\n')}\n` +
        `Add \`${HOOK_SUPPRESSION}\` or route through \`pnpm exec\`.`,
    ).toEqual([]);
    expect(
      wrongValue,
      `these ${JOB} commands set the pre/post-script setting to a value that does not ` +
        `suppress the hooks:\n${wrongValue.join('\n')}\n` +
        `The flag must be exactly \`${HOOK_SUPPRESSION}\`; any other value leaves the ` +
        'hooks running and the job building.',
    ).toEqual([]);
  });

  it('installs, so that the failures it reports are about preconditions and not about absent modules', () => {
    // Without an install step every script fails with MODULE_NOT_FOUND and the
    // job reports a true statement about nothing: it would be red on every push
    // for a reason that is not the one it was added to detect, and its redness
    // would stop carrying information.
    const commands = runCommands(body).join('\n');
    expect(commands).toMatch(/pnpm install/);
  });

  it('reaches the cold aggregates, so the guards run without naming them by hand', () => {
    // ## Why the job calls an aggregate and not the guards
    //
    // The job used to call `pnpm docs:check` and `pnpm lint`, and an earlier
    // version of this assertion pinned those two names. That was wrong for a
    // reason the measurement makes plain: both aggregates mix cold-safe members
    // with build-dependent ones -- `docs:check` contains three guards that
    // import `dist` and `lint` contains one -- so calling them on a cold tree
    // can only mean building first or failing.
    //
    // Naming the guards individually instead was also wrong, and
    // `ci-reaches-doc-guards.test.ts` said so: that file exists because a guard
    // added to an aggregate ran everywhere except CI, since the workflow named
    // guards by hand. A hand-maintained list in the workflow is the defect, and
    // a *cold-safe* hand-maintained list is still a hand-maintained list.
    //
    // So the cold subset is a first-class aggregate -- `docs:check:cold`,
    // `lint:cold` -- and this asserts that the job calls them. Membership is
    // asserted below, against `package.json`, which is where membership lives.
    const commands = runCommands(body).join('\n');
    const absent = [...COLD_AGGREGATES.keys()].filter(
      (name) => !new RegExp(`pnpm\\s+[^\\n]*\\b${name.replace(':', ':')}\\b`).test(commands),
    );
    expect(absent, `the ${JOB} job does not run: ${absent.join(', ')}`).toEqual([]);
  });

  it('the cold aggregates contain exactly the guards that were measured cold-safe', () => {
    // The membership reconciliation, read from `package.json` so the test and
    // the script cannot disagree. `scriptsIn` is deliberately the same textual
    // reading `ci-reaches-doc-guards.test.ts` uses: `docs:check:cold` and
    // `lint:cold` are `&&` chains of `node <path>` calls, and reading them as
    // text keeps this working if the chain is reordered while still failing if a
    // member is added or removed.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const [name, expected] of COLD_AGGREGATES) {
      const declared = pkg.scripts[name];
      expect(declared, `${name} must exist; the cold-tree job calls it`).toBeTruthy();
      const found = [...declared!.matchAll(/node\s+scripts\/([A-Za-z0-9._-]+\.mjs)/g)]
        .map((m) => m[1]!)
        .sort();
      expect(found, `${name} membership drifted from the measured set`).toEqual([...expected].sort());
    }
  });

  it('no cold aggregate declares a build hook, which is what makes it cold', () => {
    // A `pre*` hook on a cold aggregate would compile the tree before the
    // aggregate ran, and every member would then pass for the wrong reason -- the
    // exact mechanism of finding 136. This is asserted separately from the
    // workflow check because the hook would be invisible to the job: the step
    // carries the suppression flag, so the hook would not fire in CI while still
    // firing for any developer who ran `pnpm docs:check:cold` by hand.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const hooks: string[] = [];
    for (const name of COLD_AGGREGATES.keys()) {
      if (pkg.scripts[`pre${name}`] !== undefined) hooks.push(`pre${name} = ${pkg.scripts[`pre${name}`]}`);
    }
    expect(
      hooks,
      `these cold aggregates declare a build hook, so their members do not run cold:\n${hooks.join('\n')}`,
    ).toEqual([]);
  });

  it('names only scripts that are on the measured cold-safe list, so the job cannot grow a warm step', () => {
    // The other direction, and the one that keeps the job honest as it changes.
    // `runCommands` sees every `node scripts/<name>.mjs` the job invokes; each
    // must be one whose cold-tree behaviour was measured. A guard added to this
    // job without a measurement -- which is how `examples:bundle:check` was once
    // assumed cold-safe when it is not -- fails here instead of on the runner.
    const coldSafeFiles = COLD_SAFE_FILES;
    const named = new Set<string>();
    for (const command of runCommands(body)) {
      for (const m of command.matchAll(/scripts\/([a-z0-9-]+\.mjs)/g)) named.add(m[1]!);
    }
    const unmeasured = [...named].filter((f) => !coldSafeFiles.has(f));
    expect(
      unmeasured,
      `the ${JOB} job runs scripts whose cold-tree behaviour was never measured: ${unmeasured.join(', ')}\n` +
        'Measure it, then add it to the matching cold aggregate with the result; or move it to the warm job.',
    ).toEqual([]);
  });
});

/**
 * Every shell the suite cross-checks against must be installed by every job that
 * runs the suite.
 *
 * ## The defect
 *
 * `check-no-unsafe-shell.test.ts` compares the gate's rule against what `zsh` and
 * `bash` do with the same string. It passed here and failed on `ubuntu-24.04`
 * (finding 130) for a reason that had nothing to do with the rule: **`zsh` is not
 * installed on the runner**, and the workflow never installed it.
 *
 * The failure it produced was worse than a missing-dependency error. `spawnSync`
 * sets `status: null` when the binary does not exist, and the original predicate
 * `status !== 0` read that as *the shell rejected the expansion*, so CI reported
 * `zsh rejected ${a}` -- naming the simplest legal expansion in the language as
 * malformed. The fixture now distinguishes an absent shell from a rejecting one,
 * which is why this can be a guard about installation rather than a tolerance for
 * a missing binary.
 *
 * ## Why it is asserted in both directions
 *
 * A workflow step is only a dependency if it is in the job that needs it. The two
 * jobs here run the same suite by different routes -- one builds first, one must
 * not -- so an install in one of them is not an install. Asserting the set of
 * jobs that carry the step, rather than that the step exists, is what makes a
 * third job added later fail this file instead of failing on the runner.
 */
describe('ci · the shells the suite cross-checks against are installed', () => {
  /**
   * The jobs that run any vitest suite, by their **job id**.
   *
   * Job id, not the `name:` display string. `jobBody()` addresses a job by id, and
   * the `name:` value is free text that a comment can quote -- which is how the
   * first version of this test came to match prose. The id is the key in the
   * `jobs:` map and is unique by construction.
   */
  const SUITE_JOB_IDS = ['verify', 'cold-tree'];

  /** The binaries `check-no-unsafe-shell.test.ts` spawns by name. */
  const SHELLS = ['zsh', 'bash'];

  it('every job that runs the suite installs every shell the suite spawns', () => {
    const missing: string[] = [];
    for (const job of SUITE_JOB_IDS) {
      const commands = runCommands(jobBody(job)).join('\n');
      for (const shell of SHELLS) {
        // `bash` ships with the runner, and the fixture asserts availability
        // itself; this guard is about the shells a runner does *not* provide.
        if (shell === 'bash') continue;
        if (!commands.includes(shell)) missing.push(`${job} does not install ${shell}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names every job that runs vitest, so a new one cannot be added without a shell', () => {
    // The list above is a claim about the workflow. Reading the workflow back and
    // requiring every job whose body runs `vitest` to appear in it is what stops
    // the claim from going stale -- the same shape as `scripts-are-classified`,
    // where the register is checked against the directory rather than trusted.
    //
    // The enumeration is structural rather than a regex over the whole file. A
    // first attempt matched `name:` followed by anything up to the next `vitest`,
    // which swept up job comments that mention the word -- the same defect as
    // finding 127's shape rule and finding 129's scanner: a pattern that reads
    // prose as if it were code.
    const jobs = jobIds();
    const withVitest = jobs.filter((id) => jobBody(id).includes('vitest'));
    const registered = withVitest.filter((id) => SUITE_JOB_IDS.includes(id));
    // Every job that runs the suite must be registered, and every registered job
    // must exist -- an equality, not a subset, in both directions.
    expect(
      withVitest.filter((id) => !SUITE_JOB_IDS.includes(id)),
      'these jobs run vitest and are not registered, so their shells are unchecked',
    ).toEqual([]);
    expect(
      SUITE_JOB_IDS.filter((id) => !jobs.includes(id)),
      'these registered jobs no longer exist in the workflow',
    ).toEqual([]);
    expect(registered.length).toBe(SUITE_JOB_IDS.length);
  });
});
