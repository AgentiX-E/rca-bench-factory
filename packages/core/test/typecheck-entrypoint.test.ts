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

/**
 * Stop every child this file started, then undo the worktree.
 *
 * ## The first leak
 *
 * The original teardown was
 *
 *     try { execFileSync('git', ['worktree', 'remove', '--force', cold], ...) }
 *     catch { rmSync(cold, { recursive: true, force: true }); }
 *
 * which conflates two different failures. `git worktree remove` deletes the
 * directory *and* deregisters it; when it fails -- because a child process is
 * still holding the tree, which is the normal state of a suite at `afterAll` --
 * the `catch` removes the directory while leaving the registration in
 * `.git/worktrees/`. The next run then creates a fresh worktree beside a stale
 * registration pointing at a path that no longer exists.
 *
 * Measured, after a handful of suite runs on one revision:
 *
 *     $ git worktree list
 *     /…/rca-bench-factory          f1e0cd7 [master]
 *     /tmp/rca-bench-typecheck-fqBOCy  f1e0cd7 (detached HEAD)   <- leaked
 *
 *     $ ls /tmp/rca-bench-typecheck-*
 *     /tmp/rca-bench-typecheck-fqBOCy
 *     /tmp/rca-bench-typecheck-p0jVPV    <- directory, NOT registered
 *
 * Two half-states from one defect, in opposite directions: a registration with
 * no directory, and a directory with no registration.
 *
 * ## The second leak, which the first repair did not fix
 *
 * The repair was to prune the registration after the removal attempt:
 *
 *     try { worktree remove --force } catch {}
 *     try { worktree prune } catch {}
 *     rmSync(cold, recursive)
 *
 * It was reported as fixed on the strength of twelve green runs. It was not
 * fixed, and a later run leaked again. The reason is a property of `prune` that
 * the repair assumed the wrong way round:
 *
 *     $ git worktree prune --dry-run -v      # directory still present
 *     (no output)
 *
 * `prune` deregisters a worktree whose **directory is already gone**. At
 * `afterAll` time the child processes have not exited and the directory is
 * therefore still there, so `prune` is a no-op -- and the `rmSync` that follows
 * it deletes the directory *after* the one step that could have deregistered it
 * has already run and declined. The order was backwards, and the symptom was
 * indistinguishable from having done nothing, because it *was* nothing.
 *
 * ## The order that holds
 *
 * Directories are removed while the registration is still live, then every
 * registration whose directory is gone is pruned. Both halves of each step are
 * unconditional, so no failure can leave one half done:
 *
 *   1. delete the directory              (now the registration is stale by name)
 *   2. prune                             (deregisters it)
 *   3. delete the directory again        (covers a tree recreate by a slow child)
 *
 * Step 3 is not redundant. `rmSync` at step 1 can fail with EBUSY when a worker
 * in the pool is still resolving a module from inside the tree, and a child that
 * survives that long can recreate the directory between steps 1 and 2 -- which
 * would make step 2 decline again. Repeated deletion after the prune is what
 * makes the end state independent of where in that window the child died.
 *
 * ## Why it matters beyond tidiness
 *
 * This is finding 128 recurring, and that finding is the reason it is written
 * down rather than fixed quietly. A leaked worktree of *this repository* is a
 * second working tree that `git ls-files --others` and `git status` can see and
 * that `coldCopy()` -- in the very next run -- enumerates. The observable result
 * was a suite that failed in bursts of two or three consecutive runs and then
 * passed ten in a row, with a different file named each time:
 *
 *     check-official-roundtrip.test.ts · a declared case with no readable payload
 *     check-official-roundtrip.test.ts · still counts what it walked
 *     aiops2025.test.ts · exports input.json and groundtruth.jsonl
 *     cloudopsbench.test.ts · exports one metadata.json per case
 *
 * The bursts are the tell. Load produces a spread, not a streak, and a streak
 * that clears on its own is a side effect of the previous run rather than a
 * property of this one.
 *
 * ## Why this is asserted rather than only performed
 *
 * The first repair was believed because it was performed, and it was wrong. The
 * worktree state is therefore *read back* and written to stderr before the file
 * exits, so a leaked registration is visible in the suite output as a named
 * path instead of being inferred later from a burst of unrelated failures.
 * `heavy-fixtures-do-not-contend.test.ts` additionally pins the order of these
 * three steps in this file's source, so deleting the prune or moving it back
 * above the deletion is a test failure rather than a silent regression.
 */
afterAll(() => {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', cold], { cwd: ROOT, stdio: 'pipe' });
  } catch {
    // Expected whenever a child still holds the tree. The ordering below is what
    // makes this branch safe rather than merely tolerated.
  }
  // (1) Delete the directory first: `prune` only deregisters worktrees whose
  // directory is already gone, so this has to happen before it, not after.
  // (2) Deregister whatever step 1 made stale, then (3) delete again for a child
  // that recreated the tree in between.
  //
  // Repeated, because the three steps are not a sequence that can converge in one
  // pass while another process may still be writing here.
  //
  // Observed: `pnpm typecheck` in this test starts `tsc` under it, and a `tsc`
  // that outlives the test keeps the tree alive. Deleting it and pruning once
  // then leaves whichever registration the child re-created afterwards -- a
  // worktree that is registered *and* present, which is exactly the state the
  // first repair was written for and could not reach. A `prune` that ran while
  // the directory was missing does not help, because the child puts it back.
  //
  // Three attempts rather than a loop-until-clean: a bounded number is what keeps
  // a permanently wedged child from turning teardown into a hang, and the
  // read-back below reports the state rather than asserting it away.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    rmSync(cold, { recursive: true, force: true });
    try {
      execFileSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'pipe' });
    } catch {
      // Nothing left to do; the read-back below reports the state either way.
    }
  }
  rmSync(cold, { recursive: true, force: true });
  // Read the end state back. A second worktree here is a leak, and it is named
  // in the output rather than left for the next run to trip over.
  let registered: string[] = [];
  try {
    registered = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length));
  } catch {
    registered = [];
  }
  const leaked = registered.filter((path) => path !== ROOT);
  if (leaked.length > 0) {
    process.stderr.write(
      `[typecheck-entrypoint] worktree teardown leaked ${leaked.length} registration(s): ${leaked.join(', ')}\n`,
    );
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

/**
 * The one `pnpm typecheck` both assertions read, run at most once.
 *
 * ## Why this is memoised
 *
 * The two tests below ran the identical command against the identical worktree
 * and asserted different things about the result: that it exits 0 and reports no
 * type error, and that it does not name `Cannot find module`. Two runs of a
 * twenty-second compiler is forty seconds of the suite's heaviest work, and the
 * second run was measuring the same event as the first.
 *
 * The cost was not merely time. This file was measured at **26128 ms in-suite
 * against 11328 ms standalone**, and the excess is memory pressure: `pnpm
 * install` and two `tsc` processes ran alongside thirty-one other workers while
 * `check-official-roundtrip.test.ts` held roughly 300 MB of corpus. The cgroup
 * reached `memory.max` 9279 times on the run that recorded it, and a run with
 * controlled allocation pressure applied raised `oom_kill` from 0 to 1. The
 * observable symptom was a *different* file failing on each run with
 * `expected 1 to be +0` -- a child killed mid-read reporting an unreadable
 * corpus that was not unreadable.
 *
 * Halving the compiler invocations is the change that is available here without
 * weakening either assertion: both read one result, so both still fail if the
 * result is wrong.
 *
 * ## Why lazily, and not in `beforeAll`
 *
 * A `beforeAll` would run the compiler even when a filter selected only the two
 * cheap precondition tests above, which is how a `-t` run becomes a minute long
 * for no reason. The memo is populated on first use instead, so the cost is
 * paid by the assertions that need the result and by nothing else.
 */
let typecheckOutcome: Outcome | undefined;
function typecheckOnce(): Outcome {
  typecheckOutcome ??= run(['typecheck'], cold);
  return typecheckOutcome;
}

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
      const result = typecheckOnce();
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
      const result = typecheckOnce();
      expect(result.stderr + result.stdout).not.toMatch(/Cannot find module/);
    },
    RUN_TIMEOUT_MS,
  );
});
