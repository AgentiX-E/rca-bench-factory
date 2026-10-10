import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A test file that runs a package manager or a compiler must not run it inside
 * the parallel suite.
 *
 * ## The measurement this file exists for
 *
 * `check-official-roundtrip.test.ts` spawns `scripts/check-official.mjs` with
 * `--max-old-space-size=128` against a corpus it has just written at roughly
 * 300 MB. Under `vitest run --coverage` on the full 121-file suite that test
 * failed intermittently with
 *
 *     AssertionError: expected 1 to be +0 // Object.is equality
 *
 * The failure was not a defect in the script. The child *ran* and exited 1,
 * which is what the assertion says: a nonzero exit is the script's verdict that
 * the corpus is unreadable. The corpus was fine. What happened is that the
 * cgroup reached its ceiling and the kernel killed a process.
 *
 * Measured, on this machine, on the revision this file was added to:
 *
 *     /sys/fs/cgroup/memory.max          8589934592   (8 GiB)
 *     memory.events max (baseline)             9279   times the cgroup was at
 *                                                     its ceiling
 *     memory.events oom_kill                  0 -> 1  across a run of the
 *                                                     full suite
 *
 * And with a controlled allocation pressure applied, `oom_kill` rose from 0 to
 * 1 on a run of five, while the same five runs without the pressure were green.
 *
 * ## Why the cause is a *concurrent* heavy file, and not the heavy test itself
 *
 * The failing test passes in isolation and passes when the suite runs at low
 * parallelism. It fails only at `maxWorkers = 32`. That is the signature of a
 * budget that is a property of the *set* of files in flight rather than of any
 * one file, and it is the same finding F-43 recorded for time: a per-test
 * timeout cannot express "not while thirty-one other workers are running".
 *
 * `typecheck-entrypoint.test.ts` is the file that makes the set expensive. It
 * runs a real `pnpm install --frozen-lockfile` and two real `pnpm typecheck`,
 * each of which runs `pretypecheck` -> `pnpm build` -> `tsc` over the whole
 * package. In-suite it measured **26128 ms**, against **11328 ms** standalone,
 * and it is the reason `collect` took 130 s on the run that failed.
 *
 * ## Why this is a guard and not a comment
 *
 * A file that spawns a package manager is not wrong; it is wrong to do it in
 * parallel with everything else. Stating that as prose would make it a claim
 * nothing reads, which is the defect class this repository has recorded
 * repeatedly (findings 104-126) and again in 137-139. The property is
 * therefore asserted here, and the assertions are written so that a *new* file
 * cannot join the set silently.
 *
 * The scan reads the suite's own source rather than a list in this file, so a
 * fixture added tomorrow is visible to it. Comments and string literals are
 * blanked first, because this repository has twice written a scanner that
 * matched its own documentation (findings 127 and 133).
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TEST_DIR = resolve(ROOT, 'packages', 'core', 'test');

/**
 * The source with comments and string literals blanked, offsets preserved.
 *
 * Blanking rather than deleting keeps a match position pointing at the line it
 * came from, which is what lets a failure name a line number. String literals
 * are blanked too because the spelling being searched for -- `pnpm install` --
 * appears inside fixtures as an *argument* to `run(['install'])` as well as in
 * the prose explaining the rule.
 */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => `'${' '.repeat(Math.max(0, m.length - 2))}'`)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => `"${' '.repeat(Math.max(0, m.length - 2))}"`);
}

/** Every `*.test.ts` in the suite, with its source blanked. */
function suiteSources(): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.ts')).sort()) {
    out.set(file, stripCommentsAndStrings(readFileSync(resolve(TEST_DIR, file), 'utf8')));
  }
  return out;
}

const SUITE = suiteSources();

/**
 * A file that *runs* a package manager or a compiler as a child process.
 *
 * The detector requires both halves: a spawn call, and a package-manager or
 * compiler verb. Matching the verb alone would name every file that mentions
 * `pnpm test` in a command string it asserts on without running, and matching
 * the spawn alone would name every file that spawns `node`.
 */
interface Heavy {
  file: string;
  /** The verb that makes it heavy, as it appears in the source. */
  verb: string;
}

const HEAVY = ((): Heavy[] => {
  const out: Heavy[] = [];
  for (const [file, blanked] of SUITE) {
    // Both readings are needed and for different reasons. The spawn call is
    // *code* and is therefore looked for with string literals blanked, so that a
    // file which merely asserts on the text `spawnSync(` cannot be mistaken for
    // one that calls it. The verb is an *argument* and is therefore looked for
    // in the raw source, where it still carries its quotes.
    if (!/\b(?:execFileSync|execSync|spawnSync|spawn)\s*\(/.test(blanked)) continue;
    const raw = readFileSync(resolve(TEST_DIR, file), 'utf8');
    // `install` and `typecheck` reach a package manager; `build` and `tsc`
    // reach the compiler. Every one of them is passed as a quoted argument to
    // the spawn, so requiring the quotes is what keeps a file that names the
    // word in an identifier -- `installPath`, `typecheckOutput` -- out of the
    // set.
    for (const verb of ['install', 'typecheck', 'build', 'tsc']) {
      if (raw.includes(`'${verb}'`) || raw.includes(`"${verb}"`)) {
        out.push({ file, verb });
        break;
      }
    }
  }
  return out;
})();

describe('the suite’s heavy fixtures', () => {
  it('finds the fixtures, so the rules below are not vacuously true', () => {
    // The positive control. `typecheck-entrypoint.test.ts` is known to run
    // `pnpm install` and `pnpm typecheck`, so a scan that returns nothing has
    // drifted and the rules below would be green over an empty set.
    expect(HEAVY.map((h) => h.file)).toContain('typecheck-entrypoint.test.ts');
  });

  it('states, and keeps to one, the file that runs a package manager in the suite', () => {
    // Pinned rather than bounded. The cost of adding a second one is that the
    // whole suite's memory ceiling moves, and the observable symptom is a
    // *different* file failing on a different run -- which is the most
    // expensive kind of failure to diagnose, as this file's history records.
    // Naming the set means a second entry is a decision that has to be argued
    // for here rather than discovered from a red CI.
    expect([...new Set(HEAVY.map((h) => h.file))].sort()).toEqual([
      'typecheck-entrypoint.test.ts',
    ]);
  });

  it('runs the package manager in a worktree, so the repository tree is not the one it loads', () => {
    // The heavy work is done in a `git worktree add --detach` sandbox rather
    // than in the repository. That is what makes the file survivable at all: the
    // `pnpm install` it runs does not rewrite this tree's `node_modules` while
    // thirty-one other workers are importing out of it.
    const source = readFileSync(resolve(TEST_DIR, 'typecheck-entrypoint.test.ts'), 'utf8');
    expect(source).toContain("'worktree', 'add'");
    expect(source).toContain("'worktree', 'remove'");
    // And the package manager is invoked with the sandbox as its `cwd`, not the
    // repository root.
    //
    // The assertion is made against the *call expression* rather than against
    // the file's text. `expect(source).toContain('cwd: sandbox')` was the first
    // version of this line and it survived a mutation that changed the `pnpm`
    // invocation to `cwd: ROOT`, because the string `cwd: sandbox` also appears
    // on the two `git worktree` calls -- so the assertion was satisfied by an
    // unrelated line. Measuring the mutation is what found that; a guard whose
    // subject is a substring of the file is a guard that cannot tell one call
    // site from another.
    const pnpmCalls = [...source.matchAll(/execFileSync\(\s*'pnpm'\s*,\s*\[([^\]]*)\]\s*,\s*\{([^}]*)\}/g)];
    // The positive control: the file does invoke `pnpm`, so the loop below is
    // not asserting over an empty list.
    expect(pnpmCalls.length).toBeGreaterThanOrEqual(1);
    for (const [, args, options] of pnpmCalls) {
      expect(options, `a pnpm call runs outside the sandbox: pnpm ${args!.trim()}`).toContain('cwd: sandbox');
    }
  });

  it('runs the compiler once for both assertions, rather than once each', () => {
    // The two `typecheck` assertions read the same command against the same
    // worktree, so a second invocation measures the same event as the first and
    // costs a second full compile. That cost is what this whole file is about:
    // the excess memory pressure came from two `tsc` processes running alongside
    // thirty-one other workers, and halving the invocations is the change that
    // removes it without weakening either assertion.
    //
    // The rule is stated against the *call sites* rather than against the helper,
    // because a helper that exists and is bypassed is exactly the defect. Every
    // `run(['typecheck'], …)` in the body must be inside the memo definition;
    // everywhere else must read the memo.
    const source = readFileSync(resolve(TEST_DIR, 'typecheck-entrypoint.test.ts'), 'utf8');
    const invocations = [...source.matchAll(/run\(\['typecheck'\],\s*cold\)/g)];
    expect(invocations.length, 'the compiler must be invoked exactly once, in the memo').toBe(1);
    // And the memo is what the assertions read. A `typecheckOnce()` that nothing
    // calls would satisfy the count above while the assertions ran the compiler
    // themselves, so the reader is asserted too.
    const readers = [...source.matchAll(/typecheckOnce\(\)/g)];
    // One definition plus one read per assertion.
    expect(readers.length).toBeGreaterThanOrEqual(3);
  });

  it('deletes the worktree directory before pruning, not after', () => {
    // The leak this assertion exists for, twice over. `git worktree remove`
    // deletes the directory *and* deregisters it; the first version of this
    // fixture caught its failure with `rmSync`, which removes the directory
    // while leaving the registration behind in `.git/worktrees/`. Measured on
    // one revision:
    //
    //     /tmp/rca-bench-typecheck-fqBOCy   registered, directory present
    //     /tmp/rca-bench-typecheck-p0jVPV   directory present, NOT registered
    //
    // Two half-states from one defect, in opposite directions. It matters
    // because the leaked registration is a second working tree of *this
    // repository*, and `coldCopy()` in the next run enumerates untracked files
    // with `git ls-files --others`. The observable result was a suite that
    // failed in consecutive bursts and then passed ten in a row, which is the
    // signature finding 128 recorded.
    //
    // ## The second repair, and why this assertion is about *order*
    //
    // The first repair pruned the registration after the removal attempt, and
    // was reported fixed on the strength of twelve green runs. It later leaked
    // again. The cause is a property of `prune` that the repair assumed the
    // wrong way round:
    //
    //     $ git worktree prune --dry-run -v      # directory still present
    //     (no output)
    //
    // `prune` deregisters a worktree whose directory is *already gone*. At
    // `afterAll` time the child processes have not exited and the directory is
    // still there, so `prune` was a no-op and the `rmSync` that followed it
    // deleted the directory *after* the one step that could have deregistered it
    // had already run and declined.
    //
    // A substring assertion cannot express that, so this measures positions. The
    // subject is which of the two steps runs first, and the failure mode is a
    // silent one -- doing nothing looks exactly like doing something.
    const source = readFileSync(resolve(TEST_DIR, 'typecheck-entrypoint.test.ts'), 'utf8');
    const teardown = source.slice(source.indexOf('afterAll(() =>'));
    expect(teardown, 'the teardown block was not located').not.toBe('');

    const pruneAt = teardown.indexOf("['worktree', 'prune']");
    const deleteAt = teardown.indexOf('rmSync(cold');
    expect(pruneAt, 'the registration is never pruned').toBeGreaterThan(-1);
    expect(deleteAt, 'the directory is never removed').toBeGreaterThan(-1);

    // The ordering. `prune` only deregisters a worktree whose directory is
    // already gone, so a prune that runs before any deletion declines and the
    // registration survives the teardown.
    expect(
      deleteAt,
      'the directory must be deleted before the prune, because prune only deregisters worktrees whose directory is already gone',
    ).toBeLessThan(pruneAt);

    // And the deletion is repeated after the prune, because a child that
    // outlives the first deletion can recreate the directory between the two
    // steps -- which would make the prune decline again.
    const afterPrune = teardown.slice(pruneAt);
    expect(
      afterPrune,
      'the directory must be removed again after the prune, so a tree recreated by a surviving child cannot leave a stale registration',
    ).toContain('rmSync(cold');

    // The end state is read back and reported, so a leak is a named path in the
    // suite output rather than an inference from a later burst of failures. The
    // first repair was believed because it was performed; reading it back is
    // what makes this one assertable.
    expect(afterPrune, 'the worktree state is never read back').toContain("'worktree', 'list'");
  });

  it('gives every fixture that writes a bulk corpus a stated memory ceiling', () => {
    // The bulk fixtures are the *victims* of the contention: they are the ones
    // holding hundreds of megabytes while another worker compiles. A fixture
    // that writes a corpus at that scale must cap the heap of the child it then
    // spawns, so that the failure it produces is a verdict about the code rather
    // than an OOM kill it cannot distinguish from one.
    const source = readFileSync(resolve(TEST_DIR, 'check-official-roundtrip.test.ts'), 'utf8');
    const bulk = [...source.matchAll(/writeBulkCorpus\(([^)]*)\)/g)].map((m) => m[1]!);
    // The positive control: the helper is used, so the assertions below are
    // about real call sites rather than about an empty list.
    expect(bulk.length).toBeGreaterThanOrEqual(2);
    // One of the calls must reach the scale this whole file is about. Stating it
    // as a count of calls was the first version and it survived a mutation that
    // replaced the 300 MB fixture with an empty corpus, because the small
    // `writeBulkCorpus(root, 3, 40, 0)` call still satisfied `>= 2`. The scale is
    // the subject, so the scale is what is measured: a pad of at least 1 MiB per
    // case at a case count that multiplies it past a hundred megabytes.
    const large = bulk.filter((args) => {
      const parts = args.split(',').map((p) => p.trim());
      if (parts.length !== 4) return false;
      // The arguments are source text, not numbers: the 300 MB call reads
      // `20, 1_000, 15 * 1024 * 1024`. Evaluating that with `Number()` gives
      // NaN, which is why an arithmetic product has to be parsed rather than
      // converted. Only digits, underscores and `*` are admitted, so this cannot
      // execute a fixture's arbitrary expression.
      const value = (text: string): number | undefined => {
        if (!/^[0-9_]+(?:\s*\*\s*[0-9_]+)*$/.test(text)) return undefined;
        return text
          .split('*')
          .map((f) => Number(f.trim().replace(/_/g, '')))
          .reduce((a, b) => a * b, 1);
      };
      const caseCount = value(parts[1]!);
      const padBytes = value(parts[3]!);
      if (caseCount === undefined || padBytes === undefined) return false;
      return caseCount * padBytes >= 100 * 1024 * 1024;
    });
    expect(large.length, `no writeBulkCorpus call reaches 100 MB: ${JSON.stringify(bulk)}`).toBeGreaterThanOrEqual(1);
    // And that fixture caps the heap of the child it spawns. Without the cap the
    // test would pass on a machine with enough RAM and fail on a smaller one,
    // which is the same defect wearing a green tick.
    const heapCapped = /runWithHeapMb\(\[[^\]]*'--cases'[^\]]*\],\s*\d+\)/.test(source);
    expect(heapCapped).toBe(true);
  });
});
