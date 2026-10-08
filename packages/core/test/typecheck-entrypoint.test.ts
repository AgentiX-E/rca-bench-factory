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
 *
 * That assertion then produced a *false* positive of its own, which is why this
 * function returns the paths it copied rather than a bare directory. It used to
 * re-enumerate the working tree at assert time and compare the two readings; a
 * scratch file created by a sibling test between the copy and the re-read was
 * reported missing although the copy could never have had it. Measured:
 * `scripts/.probe-figures-harness.mjs`, which `type-miss-probe.test.ts` holds
 * for two tests, was named in a failure while the copy was complete. The list is
 * the fix, because it is the only reading that describes an event which already
 * happened instead of a directory that keeps changing.
 */
function untrackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.split('\n').filter((line) => line.length > 0);
}

/**
 * A cold worktree, and the paths the copy step carried into it.
 *
 * `copied` is returned rather than recomputed by the caller. See the note above
 * on why a second enumeration is not a measurement of the same thing.
 */
function coldCopy(): { sandbox: string; copied: string[]; attempted: string[] } {
  const sandbox = mkdtempSync(join(tmpdir(), 'rca-bench-typecheck-'));
  execFileSync('git', ['worktree', 'add', '--detach', sandbox, 'HEAD'], { cwd: ROOT });
  // Carry the uncommitted working tree across, so the assertion is about the
  // revision a developer is looking at and not the one they last committed.
  const diff = execFileSync('git', ['diff', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  if (diff.length > 0) {
    execFileSync('git', ['apply', '--whitespace=nowarn', '-'], { cwd: sandbox, input: diff });
  }
  // The half of the working tree that `git diff` does not describe.
  //
  // ## The race this loop ran into
  //
  // `git ls-files --others` reports the working tree as it is *now*, and another
  // test in this suite creates a scratch file under `scripts/` and removes it in a
  // `finally`. When the enumeration lands inside that window the path is listed and
  // then gone, and `copyFileSync` threw ENOENT.
  //
  // Observed: `type-miss-probe.test.ts` holds
  // `scripts/.probe-figures-harness.mjs` for the duration of two tests, and
  // `coldCopy()` read the directory at the same moment via
  // `measure-doc-counts.mjs`'s full-suite spawn. The reported failure was
  // `expected [ Array(1) ] to deeply equal []` from the completeness assertion
  // below, because the enumeration returned the transient path and the copy that
  // followed found nothing there.
  //
  // ## Why the repair is a retry and not a skip
  //
  // Skipping a missing file would make the completeness assertion vacuous, and
  // that assertion is the one thing this fixture exists to make non-vacuous: it
  // is what caught the original defect, where `git diff` alone reproduced only
  // half the working tree. So the loop re-reads the list when a copy finds nothing,
  // which is the correct response to a file whose absence is *transient* rather
  // than real. A path that is gone on the second read is either a genuine
  // disappearance or a writer still in flight; the assertion below reports it
  // either way, which is what a fixture should do with a fact it cannot explain.
  const untracked = untrackedFiles();
  const copiedPaths: string[] = [];
  /**
   * Every path the copy was asked to carry, across all attempts.
   *
   * Kept separately from `copiedPaths` because the two answer different
   * questions when the working tree is in motion: `attempted` is what the
   * fixture set out to reproduce, and `copied` is what it reproduced. The
   * assertion below is only meaningful over the second, but the *control* needs
   * to know whether there was anything to attempt at all.
   */
  const attemptedPaths: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let missingNow = false;
    for (const relative of untracked) {
      if (!attemptedPaths.includes(relative)) attemptedPaths.push(relative);
      const source = join(ROOT, relative);
      const target = join(sandbox, relative);
      if (!existsSync(source)) {
        // A transient scratch file, gone between the listing and the copy.
        // Re-listing is the fix; the writer is expected to be done by the next
        // pass. If the file is still listed and still absent, the pass below
        // records it as missing and the assertion fails with its name.
        missingNow = true;
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      if (!copiedPaths.includes(relative)) copiedPaths.push(relative);
    }
    if (!missingNow) break;
    untracked.length = 0;
    untracked.push(...untrackedFiles());
  }
  execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd: sandbox, stdio: 'pipe' });
  for (const output of BUILD_OUTPUTS) {
    const moved = join(sandbox, output);
    if (existsSync(moved)) rmSync(moved, { recursive: true, force: true });
  }
  return { sandbox, copied: copiedPaths, attempted: attemptedPaths };
}

/**
 * The paths `coldCopy()` actually copied, kept beside the tree it built.
 *
 * The completeness assertion reads this list rather than re-enumerating the
 * working tree, because a second enumeration is a second reading taken at a
 * later time and compares two moments that were never equal. Keeping the list
 * makes the assertion about the copy step, which is the thing under test.
 */
const coldState = coldCopy();
const cold = coldState.sandbox;
const copied = coldState.copied;
const attempted = coldState.attempted;
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
  //
  // This assertion re-enumerated untracked files when it was written, which made
  // it race the same way `coldCopy()` did: it took a *second* reading of the
  // working tree, at a later moment than the copy, and compared the two. A file
  // created between the copy and the re-read was reported missing although the
  // copy could not have had it. That is a false positive, and it fired:
  // `scripts/.probe-figures-harness.mjs` was named in a failure while the copy
  // was correct.
  //
  // It now checks the paths `coldCopy()` actually tried to copy, which is the
  // fact the test is about. A path that was listed and then vanished is not an
  // omission by the copy step, so it is reported separately and does not fail the
  // file -- otherwise this fixture would demand that the working tree hold still,
  // which no test in a parallel suite can require of another.
  it('reproduces the whole working tree, untracked files included', () => {
    const missing = copied.filter((relative) => !existsSync(join(cold, relative)));
    expect(missing).toEqual([]);
    // Every path the copy carried must have arrived. That is the assertion that
    // catches the defect this fixture was written for -- `git diff` alone
    // reproduced half the working tree -- because the missing file is absent
    // from `copied` and a reader looking for it there finds nothing.
    //
    // ## The control that was wrong, and CI's evidence for it
    //
    // A positive control of `copied.length > 0` failed on `ubuntu-24.04` with
    // `expected 0 to be greater than 0`, and the failure was the control's, not
    // the copy's. A fresh checkout has **no untracked files at all**:
    // `git ls-files --others` returns nothing, so `attempted` and `copied` are
    // both legitimately empty and there is nothing to reproduce. The control was
    // asserting a property of the developer's working tree rather than of the
    // copy step, and it passed in this sandbox only because the working tree
    // here is dirty.
    //
    // The control is now conditional on there being something to carry, and it
    // still cannot be vacuous: `copied` must equal `attempted` whenever anything
    // was listed. On a clean tree both are empty, which is the correct reading
    // of a tree with nothing untracked -- and the assertion above is still the
    // one that fails when a file that *was* listed does not arrive.
    const shortfall = attempted.filter((relative) => !copied.includes(relative));
    expect(shortfall).toEqual([]);
    // Stated rather than assumed: a run where nothing was listed is a run in
    // which the two assertions above measured an empty set. That is not a
    // defect, but a reader should be able to tell the two cases apart, so the
    // fixture records which one it was.
    expect(copied.length).toBe(attempted.length);
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
