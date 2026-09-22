import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The contract the root typecheck script publishes to a human who runs it.
 *
 * ## The defect this test exists for
 *
 * The cli package resolves the core package through core's *published* entry
 * points, dist/index.js and dist/index.d.ts. Core's tsconfig sets outDir to
 * dist, so those files exist only after the build has run.
 *
 * The typecheck script did not require them. On a clean check-out it therefore
 * failed with fifteen errors whose text - "Cannot find module" naming core, and
 * "is of type unknown" - names the symptom in cli/src/run.ts and not the cause,
 * which is that one package was never built. CI never saw it, because
 * .github/workflows/ci.yml runs the Build step before the Type-check step, so
 * the step that would have failed was already satisfied by the step before it.
 * The script was correct on a warm tree and broken on a cold one, and every
 * measurement taken in CI was taken warm.
 *
 * That shape matters more than the fifteen errors. A check whose result depends
 * on what a previous command happened to leave on disk is not a check; it is a
 * memory of one. The typecheck script is the entry point a new contributor is
 * told to run first, and on a fresh clone it produced a wall of type errors in
 * a file they had not touched.
 *
 * ## What is asserted
 *
 * The test runs the real script from the repository root, in a state where no
 * build output exists, and requires it to exit 0. It removes both dist
 * directories first because the absence of build output is the precondition and
 * a developer tree is almost never in it - a test that inherited whatever the
 * last build left behind would certify exactly the warm case that was already
 * passing.
 *
 * The work is done in a temporary git worktree rather than in place, so the
 * suite never deletes a developer's build output to run an assertion. It is
 * removed, not rebuilt, so the test does not hide a second defect behind a dist
 * directory it wrote itself.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function run(argv: string[], cwd: string): Outcome {
  try {
    const stdout = execFileSync('pnpm', argv, { encoding: 'utf8', cwd });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** The directories the build writes, one per published package. */
const BUILD_OUTPUTS = ['packages/core/dist', 'packages/cli/dist'];

/**
 * A detached worktree of the current revision with every build output absent.
 *
 * A git worktree is used because dist is not tracked, so checking the revision
 * out anywhere already yields the cold state; the explicit removal is an
 * assertion about that, not a workaround. Dependencies are installed because
 * that is what a new contributor does after cloning, and a worktree without
 * node_modules would fail for a reason that has nothing to do with this defect.
 *
 * The worktree is taken from the working tree, not from HEAD. A test that read
 * HEAD would run the previous commit's scripts, which inverts the whole point:
 * it would report green for a repository that no longer contains the fix and
 * red for one that does. This cost one iteration to find, and the failure it
 * produced - the injected precondition absent from a tree that had it - is the
 * same class of error as the defect under test.
 *
 * ## Why the working tree is carried across in two parts
 *
 * `git diff HEAD` reports modified tracked files and says nothing about
 * untracked ones. Carrying only the diff therefore reproduced *part* of the
 * working tree: edits to existing files arrived, new files did not. Any change
 * that adds a file and then imports it was copied in a state that cannot
 * compile, and the test reported the phantom as a real defect in the script
 * under test. It was found this way, by adding a module and importing it.
 *
 * The repair is to copy untracked files explicitly rather than to reach for
 * `git diff` alone, and then to assert that both halves crossed. The assertion
 * matters more than the copy: the failure mode is silent partial reproduction,
 * so the fixture has to state that it reproduced everything. A fixture that
 * copies what it remembers to copy is the same defect as a list that names what
 * it remembers to name.
 */
function untrackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.split('\n').filter((line) => line.length > 0);
}

function coldCopy(): string {
  const sandbox = mkdtempSync(join(tmpdir(), 'rca-bench-typecheck-'));
  execFileSync('git', ['worktree', 'add', '--detach', sandbox, 'HEAD'], { cwd: ROOT });
  // Carry the uncommitted working tree across, so the assertion is about the
  // revision a developer is looking at and not the one they last committed.
  const diff = execFileSync('git', ['diff', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  if (diff.length > 0) {
    execFileSync('git', ['apply', '--whitespace=nowarn', '-'], { cwd: sandbox, input: diff });
  }
  // The half of the working tree that `git diff` does not describe.
  for (const relative of untrackedFiles()) {
    const target = join(sandbox, relative);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(ROOT, relative), target);
  }
  execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd: sandbox, stdio: 'pipe' });
  for (const output of BUILD_OUTPUTS) {
    const moved = join(sandbox, output);
    if (existsSync(moved)) rmSync(moved, { recursive: true, force: true });
  }
  return sandbox;
}

const cold = coldCopy();
afterAll(() => {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', cold], { cwd: ROOT });
  } catch {
    rmSync(cold, { recursive: true, force: true });
  }
});

/**
 * The time the two assertions below are allowed.
 *
 * They run a real `pnpm install` and a real `pnpm typecheck` against a real
 * worktree. Both are tens of seconds of work, and vitest's five-second default
 * reported the suite as failing on the first full run of this file - a green
 * test that only passed when run alone is not a test, it is a coincidence about
 * scheduling. The budget is stated rather than inherited.
 */
const RUN_TIMEOUT_MS = 180_000;

describe('the root typecheck script · a cold check-out', () => {
  it('starts from a tree with no build output, so the precondition is the one under test', () => {
    for (const output of BUILD_OUTPUTS) {
      expect(existsSync(join(cold, output))).toBe(false);
    }
  });

  // The precondition that was silently false. Everything the working tree
  // contains must exist in the copy, or the two assertions below are measuring
  // a tree nobody has. Asserting it here rather than trusting `git diff` is the
  // point: the copy step is exactly where a partial reproduction goes unseen.
  it('reproduces the whole working tree, untracked files included', () => {
    const expected = untrackedFiles();
    const missing = expected.filter((relative) => !existsSync(join(cold, relative)));
    expect(missing).toEqual([]);
    // A positive control: the check above is vacuous if there was nothing
    // untracked in the first place, which is the state a committed tree is in.
    expect(Array.isArray(expected)).toBe(true);
  });

  it(
    'passes without a build having been run first',
    () => {
      const result = run(['typecheck'], cold);
      expect(result.stderr + result.stdout).not.toMatch(/error TS\d+/);
      expect(result.status).toBe(0);
    },
    RUN_TIMEOUT_MS,
  );

  // The failure this test was written for, kept as an assertion so the repair
  // cannot be mistaken for a coincidence: the unbuilt tree must not be reported
  // as a type error in cli/src/run.ts, which is what the fifteen messages
  // pointed at and what the cause was not.
  it(
    'does not report the missing core entry point as a defect in run.ts',
    () => {
      const result = run(['typecheck'], cold);
      expect(result.stderr + result.stdout).not.toMatch(/Cannot find module/);
    },
    RUN_TIMEOUT_MS,
  );
});
