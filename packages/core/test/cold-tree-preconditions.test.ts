import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every package script that reads a build artefact must declare the build.
 *
 * ## What this file exists for
 *
 * On a tree with no built output under `packages/`, `pnpm docs:check` fails on
 * its first guard:
 *
 * ```
 * README sample 1: FAILED
 * Error [ERR_MODULE_NOT_FOUND]: Cannot find module
 *   '.../packages/core/dist/index.js'
 * ```
 *
 * Three of the seven doc guards read a build artefact -- `check-readme-sample`
 * imports core's `dist/index.js`, `check-cli-reference` and `check-user-guide`
 * drive cli's `dist/main.js` -- and one `pnpm build` makes all seven pass. So
 * the guards are not wrong; they are *warm-tree only*, and nothing in the tree
 * said so.
 *
 * This is finding 43's shape after that finding was fixed. `typecheck` used to
 * depend on a build that CI happened to run first, and the fix was a
 * `pretypecheck` hook. The build dependency did not go away -- it moved to the
 * scripts that were never given the hook. A verdict that depends on what a
 * previous command left on disk is not a verdict, and the repository now has
 * four such scripts where it had one.
 *
 * ## Why assert the hook rather than the behaviour
 *
 * Testing the behaviour directly means running `pnpm build` inside the suite,
 * which is slow, mutates the developer's tree, and -- because the suite is one
 * of the things that reads `dist` -- makes the measurement circular. What is
 * asserted instead is the *declaration*: a script whose body can reach a build
 * artefact carries `pre<script>`.
 *
 * That is a weaker claim, and the weakness is worth naming: a hook can be
 * present and the script can still fail for an unrelated reason. It is the
 * claim that can be checked cheaply and that fails in the direction this
 * repository keeps getting caught by -- the declaration silently missing.
 *
 * The behavioural half is not abandoned, it is moved: the cold-tree CI job
 * runs the whole chain on a machine that has never built, which is the only
 * place the behaviour can be measured honestly. This file and that job are the
 * two halves, and the job alone would not stop a *new* script from being added
 * without a hook until someone pushed.
 *
 * ## What this does not establish
 *
 * It does not establish that a script *needs* the build. The dependency set
 * below is hand-written from a measurement (three guards, observed failing cold
 * and passing warm), so a script listed here that stopped reading `dist` would
 * keep its hook for no reason -- harmless, and visible as a hook with no
 * failing input rather than as a missing check.
 *
 * It does not establish that the cold-tree CI job exists. That is asserted in
 * `cold-tree-job.test.ts`, because it is a different artefact (a workflow, not
 * a manifest) with a different failure mode.
 *
 * **It does not make `npx vitest run` work on a cold tree, and nothing can.**
 * A `pre<script>` hook is a property of the *pnpm script*, so it fires for
 * `pnpm test` and for a CI step that calls `pnpm test`, and not for an editor,
 * an IDE test runner, or a bare `npx vitest` that reaches the underlying tool
 * directly. Measured: on a cold tree `pnpm test` is 3186 passing / 0 failing
 * and `npx vitest run --root packages/core` is 169 failing. That gap is
 * inherent to the mechanism rather than a defect in it, which is exactly why
 * the cold-tree job calls `pnpm test` -- the entry point a contributor is
 * documented to use -- rather than the tool underneath. Recording the limit
 * here is the point: a guard that claimed to cover every entry point would be
 * overstating what it does.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const PKG = 'package.json';

interface Manifest {
  scripts?: Record<string, string>;
}

function manifest(): Manifest {
  return JSON.parse(readFileSync(resolve(ROOT, PKG), 'utf8')) as Manifest;
}

/**
 * Every package script that a cold tree cannot satisfy without a build first.
 *
 * Measured rather than guessed. On a worktree created with
 * `git worktree add --detach <dir> HEAD` and `pnpm install --frozen-lockfile`
 * but no `pnpm build`, these are the scripts that fail and then pass once the
 * build has run:
 *
 * | script | cold | what it reads |
 * | --- | --- | --- |
 * | `docs:check` | FAIL rc=1 | core `dist/index.js`, cli `dist/main.js` |
 * | `lint` | FAIL rc=1 | core `dist` (the scorer-stability guard) |
 * | `test` | FAIL rc=1 | core `dist` (the tests drive the scripts) |
 * | `test:coverage` | FAIL rc=1 | the same, through `test` |
 * | `examples:check` | FAIL rc=1 | core `dist`, via `gen-examples.mjs` |
 * | `examples:bundle:check` | FAIL rc=1 | core `dist`, via `build-example-bundle.mjs` |
 * | `official:check` | FAIL rc=1 | core `dist`, via the exporter |
 *
 * `examples:bundle:check` was **absent from the first version of this list**,
 * which asserted it had been "measured green on a cold tree". It had not been
 * measured at all -- that was inference from the fact that it reads a tarball.
 * The test below, which reconciles this list against what the cold-tree job
 * calls, is what surfaced it. The mistake is kept here because it is the
 * instructive part: a list of exclusions written from plausibility rather than
 * measurement is where the next omission will be.
 *
 * `docs:counts:check` and `verify:scorer-stability` are genuinely green cold --
 * the first reads text and JSON, the second is a member of `lint` already
 * reached through its parent's hook.
 *
 * Keeping the reasons next to the names is the point. A list of scripts with no
 * account of why each is on it becomes a list nobody dares edit.
 */
const NEEDS_BUILD: Readonly<Record<string, string>> = {
  'docs:check': 'check-readme-sample imports core dist; check-cli-reference and check-user-guide drive cli dist',
  lint: 'verify-scorer-stability reads the built scorer',
  test: 'the tests drive scripts that import core dist',
  'test:coverage': 'inherits test',
  'examples:check': 'gen-examples imports core dist',
  'examples:bundle:check': 'build-example-bundle imports core dist',
  'official:check': 'check-official exports through core dist',
};

describe('cold tree · a script that reads a build artefact declares the build', () => {
  it('every script listed as build-dependent carries a pre<script> hook', () => {
    const scripts = manifest().scripts ?? {};

    const missing: string[] = [];
    for (const name of Object.keys(NEEDS_BUILD)) {
      // `pnpm` runs `pre<script>` automatically, so the hook is what makes the
      // precondition true for every entry point -- the script, a bare
      // `pnpm run <script>`, and a CI step -- without any caller remembering it.
      if (scripts[`pre${name}`] === undefined) missing.push(name);
    }

    expect(
      missing,
      `these scripts read a build artefact but do not declare the build: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('each declared hook actually builds, rather than existing as a decoration', () => {
    const scripts = manifest().scripts ?? {};

    // A hook that runs `true` would satisfy the assertion above while leaving
    // the precondition unmet. The hook has to name a build, and it has to be
    // pnpm's own build so that the workspace ordering is the one the repository
    // already uses rather than a second definition of it.
    for (const name of Object.keys(NEEDS_BUILD)) {
      const hook = scripts[`pre${name}`];
      expect(hook, `pre${name}`).toBeDefined();
      expect(hook, `pre${name} must run the build`).toMatch(/pnpm .*build/);
    }
  });

  it('the assertion is not vacuous: the list is non-empty and every name exists', () => {
    const scripts = manifest().scripts ?? {};
    const names = Object.keys(NEEDS_BUILD);

    // Without this, renaming every script would make the two assertions above
    // pass by having nothing to check. `check-doc-counts`'s history is the
    // precedent: an enumeration gate is only worth its name when its list is
    // independent of the thing it enumerates.
    expect(names.length).toBeGreaterThanOrEqual(6);
    for (const name of names) {
      expect(scripts[name], `${name} is asserted about but not defined`).toBeDefined();
    }
  });

  it('no hook is declared for a script that does not need one', () => {
    const scripts = manifest().scripts ?? {};

    // The other direction. A `predocs:counts:check` would mean a build runs
    // before a guard that was measured green without one, and the cost is paid
    // on every developer machine for a precondition that is not required.
    for (const name of Object.keys(scripts)) {
      if (!name.startsWith('pre')) continue;
      const target = name.slice('pre'.length);
      // `pretypecheck` predates this rule and is the precedent it copies.
      if (target === 'typecheck' || target === 'build') continue;
      expect(
        Object.keys(NEEDS_BUILD),
        `${name} declares a build for a script that was measured not to need one`,
      ).toContain(target);
    }
  });

  it('the scripts the cold-tree job calls are all declared, so the job cannot be green by omission', () => {
    const scripts = manifest().scripts ?? {};

    // The job's own step list is the third party in this argument, and it is
    // read from the `cold-tree:` job *only*. Scoping matters: the sibling
    // `verify` job runs `Build` first, so a script it calls without a hook is
    // not a defect there. The first version of this test read the whole file
    // and flagged `examples:bundle:check` from the main job -- correct about
    // the script (it does need the build, and was then added to the list above)
    // and wrong about which job made it a defect.
    const workflow = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const start = workflow.search(/^ {2}cold-tree: *$/m);
    expect(start, 'the cold-tree job must exist for this test to mean anything').toBeGreaterThan(-1);
    const rest = workflow.slice(start).split('\n');
    const body: string[] = [rest[0]!];
    for (const line of rest.slice(1)) {
      if (/^ {0,2}\S/.test(line)) break;
      body.push(line);
    }

    const called = [...body.join('\n').matchAll(/^\s*run:\s*pnpm\s+([A-Za-z0-9:_-]+)\s*$/gm)]
      .map((m) => m[1]!)
      .filter((name) => name !== 'install' && name !== 'build' && name !== 'exec');

    // A script the job calls either declares its own precondition, or is
    // `typecheck` -- which does too, through `pretypecheck`, and is listed here
    // by name rather than added to `NEEDS_BUILD` because its precondition is
    // narrower (core alone) and stating it in the table would claim otherwise.
    const undeclared = called.filter(
      (name) => scripts[name] !== undefined && !(name in NEEDS_BUILD) && name !== 'typecheck',
    );
    expect(
      undeclared,
      `the cold-tree job runs these build-dependent scripts without a declared precondition: ${undeclared.join(', ')}`,
    ).toEqual([]);
  });

  it('the build the hooks run is the repository build, not a second definition of it', () => {
    const scripts = manifest().scripts ?? {};

    // Every hook calls `pnpm build` and none re-lists the two package builds.
    // A hook that spelled out `pnpm --filter core build && pnpm --filter cli build`
    // would be a second copy of the build order, and the day the order changes
    // the copies disagree -- which is the "same fact stated twice" defect this
    // repository has recorded under several names.
    for (const name of Object.keys(NEEDS_BUILD)) {
      expect(scripts[`pre${name}`], `pre${name}`).toBe('pnpm build');
    }
  });
});
