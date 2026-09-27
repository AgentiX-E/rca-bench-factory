import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The gate-test battery must not report a slow runner as an unguarded gate.
 *
 * `gate-tests-battery.py` spawns one vitest process per injection and asserts
 * that the injected gate's own test file goes red. Its verdicts are the only
 * evidence that the five gate scripts in this repository are guarded at all, so
 * a verdict it cannot justify is worth less than no verdict.
 *
 * ## The measurement that produced this file
 *
 * The battery is green on the author's machine on every run and red in CI on
 * every run, at the same commit, with the same 25 injections. Running the CI
 * step sequence locally in order (steps 11-16) reproduced the green exactly:
 * **24 caught, 0 survived, 0 inert, 1 redundant**, restore asserted.
 *
 * What differed was wall clock, and it differed only for this step:
 *
 * | step | runner | local |
 * | --- | --- | --- |
 * | 11 scorer-stability | 6s | 7s |
 * | 12 component-rule | 10s | 11s |
 * | 13 m1-ceiling probe | 1s | 0s |
 * | 14 m1-ceiling tests | 10s | 11s |
 * | 15 type-miss probe | 0s | 1s |
 * | **16 gate-test battery** | **162s failure** | **107s exit 0** |
 *
 * The four steps around it agree to within a second; step 16 is the only one
 * that spawns 25 processes, and it is the only one that diverges. The job itself
 * used 271s of a 1200s budget, so the step did not time out -- it returned a
 * verdict. Taken together, the battery is measuring **process startup** far more
 * than it is measuring the guards, and on a slower machine that cost can cross a
 * boundary the battery never named.
 *
 * ## What this file asserts
 *
 * Not "the battery is fast" -- that would be a performance test, and it would go
 * red on a slower machine for the same reason the battery does, which is not an
 * improvement. The property is the one finding 84 established for the verdict
 * itself, applied to duration: **a run that decides nothing must not print the
 * word for a run that decided the guard is unguarded.**
 *
 * So the battery gains a fourth outcome, `TIMEOUT`, reported separately from
 * `SURVIVED`, and this file proves that outcome is reachable rather than
 * declared. A branch that has never been shown to execute is the defect the
 * round before this one was about; writing a second one here would be absurd.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BATTERY = resolve(ROOT, 'scripts', 'injection', 'gate-tests-battery.py');
const SOURCE = readFileSync(BATTERY, 'utf8');

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-gatetest-timeout-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * The executable part of a Python file: comments and string literals removed.
 *
 * A source scan cannot tell "this call is made" from "this call is explained",
 * and both matter. The battery's docstring quotes the broken preflight command
 * on purpose -- deleting that quotation would delete the reason the fix exists.
 * Stripping before the scan is what lets the comment stay.
 *
 * Triple-quoted blocks go first, then `#` comments, so a `#` inside a docstring
 * is not mistaken for a comment marker. This is deliberately coarse: it is
 * looking for one specific string that appears in code, not parsing Python.
 */
function codeOf(source: string): string {
  return source
    .replace(/"""[\s\S]*?"""/g, '')
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
}

describe('scripts · the gate-test battery reports a timeout as a timeout', () => {
  it('the shipped battery declares the bound and reads it', () => {
    // A named constant that nothing reads is a comment with a syntax error, so
    // both halves are asserted: that the bound exists, and that the call site
    // passes it to `subprocess.run`.
    expect(SOURCE).toContain('PER_INJECTION_TIMEOUT_S = 120');
    expect(SOURCE).toMatch(/timeout=PER_INJECTION_TIMEOUT_S/);
  });

  it('a timed-out injection is counted apart from a survivor', () => {
    // The counting line is the one a reader trusts, so it has to disagree with
    // a survivor-only line. Asserting the literal would pass if the word were
    // printed and the counter never incremented, so the increment is asserted
    // too -- that is the half that makes the number real.
    expect(SOURCE).toContain('timed_out += 1');
    expect(SOURCE).toMatch(/\{timed_out\} timed out/);
  });

  it('the timeout branch exits non-zero instead of being tolerated', () => {
    // `timed_out` has to reach the failure condition. A battery that printed
    // TIMEOUT and returned 0 would be worse than the bug it replaces: CI would
    // go green over a run that decided nothing.
    expect(SOURCE).toMatch(/if survived or inert or timed_out:/);
  });

  it('the preflight asks for a version instead of running the whole suite', () => {
    // **The second defect, and the more expensive one.** The probe used to be
    // built by appending `--version` to `VITEST`, which already contains
    // `run --root packages/core`:
    //
    //     pnpm exec vitest run --root packages/core --version
    //
    // vitest accepts `run --root ...` and ignores the trailing flag, so the
    // "preflight" executed all 92 core test files -- 54s on the runner -- and
    // its exit status was the suite's, not a version query's.
    //
    // Measured both ways before writing this: the bare form answers in 0.3s, the
    // derived form was still running at 10.1s. That is why the assertion is
    // about the *command*, not about the constant: a bound on a command that
    // should not have been issued would only cap the waste.
    expect(SOURCE).toContain('["pnpm", "exec", "vitest", "--version"]');
    // The derived form must be gone -- asserting the correct call exists would
    // pass even if the wrong one were still there beside it.
    //
    // Checked against the **code only**, because the docstring above quotes the
    // broken command in order to explain why it was wrong. Scanning the whole
    // file would make the explanation itself a violation, which pushes an author
    // to delete the reason rather than the defect -- the trap
    // `injection-write-discipline.test.ts` documents for the same reason.
    expect(codeOf(SOURCE)).not.toContain('[*VITEST, "--version"]');
  });

  it('the preflight is bounded and reports a timeout as its own outcome', () => {
    // Without a bound, the wasted minute is silent; with one, it is a named
    // failure. Both halves are load-bearing: the constant alone decides nothing,
    // and `timeout=` without an `except` turns a slow runner into a traceback
    // instead of a diagnosis.
    expect(SOURCE).toContain('PREFLIGHT_TIMEOUT_S = 30');
    expect(SOURCE).toMatch(/timeout=PREFLIGHT_TIMEOUT_S/);
    expect(SOURCE).toContain('did not answer --version');
  });

  it('a real run reports its own duration and the slowest injection', () => {
    // **Why this asserts against the source and not by running the battery.**
    //
    // The first version of this test ran the battery as a subprocess from inside
    // vitest. That is vitest invoking vitest -- the battery's own `run_tests`
    // spawns `pnpm exec vitest run` -- and the inner runner collected **no
    // tests** in that nested environment. The battery reported `README 1` as
    // SURVIVED with its own diagnostic saying so:
    //
    //     -- the runner collected no tests, so this says nothing about the guard.
    //
    // Directly, the same battery is green in 81.1s. So the nested run measured
    // the nesting, not the battery -- a false survivor created by the harness,
    // which is the class of defect this whole round is about. Running the
    // battery for real is CI's step 16, one process, no nesting.
    //
    // What is left for this file is the property a reader depends on: the cost is
    // *produced and printed*, and the printed total is what CI will compare
    // against. A named constant with no print is a comment with a syntax error,
    // so the print is asserted to read the accumulator -- `{total_seconds:.1f}`
    // against `total_seconds +=` -- and both halves are required, because either
    // alone can be present while the line prints `0.0s` forever.
    const code = codeOf(SOURCE);
    expect(code).toMatch(/total_seconds \+= elapsed/);
    expect(code).toMatch(/time: \{total_seconds:\.1f\}s across/);
    expect(code).toMatch(/slowest \{slowest\[0\]:\.1f\}s/);
    // The per-injection figure, so a slow one is identifiable without a bisect.
    expect(code).toMatch(/\[\{elapsed:\.1f\}s\]/);
  });

  it('a timeout is reached and reported, proven on a self-contained fake', () => {
    // **The load-bearing test, and why it uses a fake rather than the battery.**
    //
    // The branch has to be shown to execute, not merely written -- a verdict
    // that has never been observed is the defect every round of this audit has
    // found. But running the real battery from inside vitest means vitest
    // spawning vitest, and in that nested environment the inner runner collects
    // no tests, so every injection reports SURVIVED for a reason that has
    // nothing to do with the guard (measured; recorded above).
    //
    // So the mechanism is isolated instead of the whole battery being run. This
    // fake reproduces the exact control flow -- apply a mutation, call the
    // runner under a bound, catch `TimeoutExpired`, restore in `finally` -- with
    // a command that sleeps. It is a smaller subject, and unlike the nested run
    // its verdict is about the code under test.
    //
    // `timeout=1` against `sleep 30`: the bound is reached on any machine,
    // because the sleep cannot finish first. A bare `timeout=0` would also
    // expire, but it expires before the process is even spawned, which would
    // test `subprocess`'s argument handling rather than the branch.
    const fake = `
import subprocess
import sys

PER_INJECTION_TIMEOUT_S = 1
caught = survived = timed_out = 0

try:
    subprocess.run(["sleep", "30"], capture_output=True, text=True,
                   timeout=PER_INJECTION_TIMEOUT_S)
except subprocess.TimeoutExpired:
    print("TIMEOUT  fake injection")
    print("         -- the test run exceeded %ss. This is not a verdict about the guard." % PER_INJECTION_TIMEOUT_S)
    timed_out += 1
finally:
    print("restored")

print("%d caught, %d survived, %d timed out" % (caught, survived, timed_out))
sys.exit(1 if survived or timed_out else 0)
`;
    const dir = mkdtempSync(join(scratch, 'fake-'));
    writeFileSync(join(dir, 'fake.py'), fake);

    const started = Date.now();
    const proc = spawnSync('python3', [join(dir, 'fake.py')], { encoding: 'utf8', timeout: 60_000 });
    const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;

    // It must reach the branch, name it, keep it out of `survived`, restore the
    // file, and fail the step -- all four, because any one alone is passable
    // while the others are broken.
    expect(output).toContain('TIMEOUT');
    expect(output).toContain('restored');
    expect(output).toMatch(/0 caught, 0 survived, 1 timed out/);
    expect(output).not.toMatch(/[1-9]\d* survived/);
    expect(proc.status).not.toBe(0);
    // And the bound, not the sleep, is what ended it: the run must come back in
    // about the bound, not in about the sleep.
    expect(Date.now() - started).toBeLessThan(20_000);
  }, 120_000);

  it('the timed-out run still restores every gate it touched', () => {
    // A timeout can land between `write_text(mutated)` and the `finally`. The
    // restore has to survive it, or a battery that failed takes the rest of the
    // job down with it for an unnameable reason -- the exact hazard finding 84
    // added `assert_source_restored` for.
    //
    // Asserted on the structure rather than by racing the real battery, for the
    // same nesting reason: the `finally` is what guarantees the restore, so the
    // `finally` is what has to be shown to wrap the timed call. A test that
    // merely ran the battery would pass whether or not the `finally` was there,
    // because a *completed* run restores on the normal path too.
    const code = codeOf(SOURCE);
    expect(code).toMatch(/try:\n\s+path\.write_text\(mutated\)\n\s+try:\n\s+status, output, elapsed = run_tests/);
    expect(code).toMatch(/finally:\n\s+path\.write_text\(original\)/);
  });
});
