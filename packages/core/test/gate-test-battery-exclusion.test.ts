import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Two runs of the gate-test battery must not be able to overlap.
 *
 * ## The measurement that produced this file
 *
 * The battery had been green on every local run and red on every CI run, at the
 * same commit, with the same 25 injections. A CI-shaped reproduction (a
 * `git worktree` at the failing sha with linked `node_modules`) was green too:
 * **24 caught, 0 survived, 0 inert, 1 redundant**, restore asserted, exit 0. So
 * the red had no local counterpart and the step's own log could not be read --
 * the download redirects to a host this project's proxy blocks, which is the
 * access limitation recorded as finding 55.
 *
 * Then a local run went red in a way no single-process explanation covers:
 *
 *     23 caught, 0 survived, 1 inert, 0 timed out, 1 redundant (expected)
 *     the battery did not restore its own mutations:
 *       scripts/build-example-bundle.mjs
 *       scripts/gen-examples.mjs
 *       scripts/gen-rcaeval-cases.mjs
 *     RC=2
 *
 * `RCAEVAL 3` reported INERT with a *genuine* anchor mismatch, and three files
 * were left mutated. The loop's `finally: path.write_text(original)` is correct
 * and the trace proved it: instrumented end to end, all 25 injections restored,
 * zero dirty files. The tests are readers -- `build-example-bundle.test.ts` and
 * `gen-examples.test.ts` copy the live gate *into* a scratch tree and run it
 * there, verified by hashing the real sources across a full test run, unchanged.
 *
 * What the loop cannot survive is a **second instance**. Both processes read the
 * same `original`, and each writes it back over the other's mutation, so one
 * run's restore lands on a baseline the other has not yet finished with. That is
 * the signature observed above, and it is reproducible on demand: two batteries
 * started three seconds apart produced
 *
 *     22 caught, 1 survived, 2 inert, 0 timed out, 1 redundant (expected)
 *     the battery did not restore its own mutations: ...
 *     RC=2
 *
 * -- a *survivor*, from a guard that is in fact caught, created purely by the
 * overlap. A battery whose verdicts depend on how many copies are running is not
 * measuring the guards, and the word SURVIVED is the one verdict in this
 * repository that must never be manufactured.
 *
 * ## Why exclusion and not a per-run temp copy
 *
 * Copying the tree per run would remove the shared resource, and it is the wrong
 * fix here: the battery's subject is the *shipped* gates, and observing a copy
 * would make every verdict a statement about the copy. What is actually wrong is
 * that two runs share one working tree while both are rewriting it, and the
 * honest repair for that is to refuse the second run rather than to let it
 * corrupt the first. A refusal is loud, immediate, and names the reason; a
 * corrupted baseline is a wrong number that reads as a finding.
 *
 * ## What this file asserts
 *
 * Not that a lock file exists -- existence is satisfied by a file nobody
 * acquires. The property is that **a second instance refuses, says why, does not
 * touch the tree, and does not report a verdict about any guard**, and that the
 * first instance is unaffected. Each half is asserted, because the failure mode
 * of getting one without the others is the corruption above.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BATTERY = resolve(ROOT, 'scripts', 'injection', 'gate-tests-battery.py');
const SOURCE = readFileSync(BATTERY, 'utf8');

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-gatetest-exclusion-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * The executable part of a Python file: comments and string literals removed.
 *
 * Same helper, and same reason, as `gate-test-battery-timeout.test.ts`. The
 * battery explains the defect it is guarding against by quoting it, so a scan
 * over the raw file would treat the explanation as a violation and push an
 * author to delete the reason rather than the defect. Triple-quoted blocks go
 * first so a `#` inside a docstring is not read as a comment marker.
 */
function codeOf(source: string): string {
  return source
    .replace(/"""[\s\S]*?"""/g, '')
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
}

/**
 * A self-contained fake with the same exclusion structure as the battery.
 *
 * The real battery takes ~79s and mutates the shipped gates, so running two real
 * copies from inside vitest would mean vitest spawning vitest -- the nesting
 * that `gate-test-battery-timeout.test.ts` measured collecting no tests at all,
 * which would make this file a false green. The fake keeps the subject small
 * enough to be observable: one `O_EXCL` lock in a private directory, one
 * "mutation" that is a write to a file in that directory, one sleep standing in
 * for the test run.
 *
 * It is written to the shape of the real thing on purpose -- acquire, or refuse
 * and exit; mutate inside `try`; restore in `finally`; release in `finally` --
 * so a change to the battery's structure that breaks the property has a
 * counterpart here that breaks with it.
 */
const FAKE = `
import os
import sys
import time
from pathlib import Path

WORK = Path(sys.argv[1])
LOCK = WORK / "battery.lock"
GATE = WORK / "gate.mjs"
GATE.write_text("original\\n")

lock_fd = None
try:
    lock_fd = os.open(str(LOCK), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
except FileExistsError:
    print("another instance of this battery already holds")
    print("  lock: " + str(LOCK))
    print("  -- refusing rather than sharing the working tree: two runs would")
    print("     each restore the other's mutation, which is how a caught guard")
    print("     is reported as SURVIVED.")
    sys.exit(3)

try:
    os.write(lock_fd, str(os.getpid()).encode())
    original = GATE.read_text()
    try:
        GATE.write_text("mutated\\n")
        time.sleep(float(sys.argv[2]))
    finally:
        GATE.write_text(original)
    print("0 caught, 0 survived")
finally:
    os.close(lock_fd)
    if LOCK.exists():
        os.unlink(str(LOCK))
`;

const fakeDir = mkdtempSync(join(scratch, 'fake-'));
const fakePath = join(fakeDir, 'fake.py');
writeFileSync(fakePath, FAKE);

/** Start a fake run without waiting for it, so a second one can overlap it. */
function start(work: string, seconds: string): { done: Promise<number>; output: () => string } {
  const child = spawn('python3', [fakePath, work, seconds], { encoding: 'utf8' } as never);
  let buffer = '';
  (child.stdout as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
  });
  (child.stderr as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
  });
  const done = new Promise<number>((resolveDone) => {
    child.on('close', (code: number | null) => resolveDone(code ?? -1));
  });
  return { done, output: () => buffer };
}

describe('scripts · the gate-test battery refuses a second concurrent run', () => {
  it('the shipped battery takes an exclusive lock before it mutates anything', () => {
    // Acquisition has to happen *before* the first mutation, not at import and
    // not inside the loop: a lock taken after the first `write_text(mutated)`
    // has already permitted the corruption it exists to prevent.
    //
    // Asserted at the **call site in `main`**, not at the two definitions: the
    // release/acquire helpers are defined above `main` in source order, so an
    // index comparison across the file would pass for a battery that defined
    // them correctly and then never called the acquire. What has to hold is that
    // `acquire_exclusive_lock()` is invoked before the loop is entered.
    const code = codeOf(SOURCE);
    const acquireCall = code.indexOf('lock_fd = acquire_exclusive_lock()');
    const loop = code.indexOf('for name, script, test_file, mutation, description in INJECTIONS');
    expect(acquireCall).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(-1);
    expect(acquireCall).toBeLessThan(loop);
    // And the lock file has to be the atomic creation, not an `exists()` test
    // followed by a write -- that pair has exactly the window this closes.
    expect(code).toMatch(/os\.open\(str\(LOCK_PATH\), os\.O_CREAT \| os\.O_EXCL \| os\.O_WRONLY\)/);
    expect(code).not.toMatch(/if LOCK_PATH\.exists\(\):\n\s+os\.open/);
  });

  it('a refused second run exits without printing a verdict about a guard', () => {
    // The dangerous half of a lock is a refusal that still reports. A second
    // instance that printed "0 caught, 0 survived" and exited 3 would be read as
    // a clean battery by anything counting words rather than exit codes, and the
    // corruption would be invisible again. So the refusal must name itself and
    // must not print the summary line.
    const code = codeOf(SOURCE);
    expect(code).toMatch(/FileExistsError/);
    expect(code).toMatch(/another instance of this battery already holds/);
    // The refusal's own exit, before the loop can run. The battery spells it
    // `raise SystemExit(3)` and the fake spells it `sys.exit(3)`; both mean the
    // same thing to the interpreter, so the assertion accepts either rather than
    // pinning a spelling that carries no meaning. What matters is that it is
    // non-zero and precedes the loop.
    const refuse = code.indexOf('FileExistsError');
    const exitAfter = code.search(/raise SystemExit\(3\)|sys\.exit\(3\)/);
    expect(exitAfter).toBeGreaterThan(refuse);
    expect(exitAfter).toBeLessThan(code.indexOf('for name, script, test_file, mutation, description in INJECTIONS'));
  });

  it('the lock is released on the failing path as well as the passing one', () => {
    // A lock released only on success is a lock that wedges the step after the
    // first real failure -- and the battery's whole purpose is to fail. The
    // release therefore has to be in a `finally` alongside the restore.
    //
    // Asserted against **both** sources: against `FAKE`, because the executed
    // overlap test above only proves the property for the shape the fake
    // encodes -- a real battery that released the lock on the normal path alone
    // would still pass it. And against `SOURCE`, so the shape the fake encodes
    // is the shape the battery ships, rather than the two drifting apart with
    // this file reporting green over the pair.
    expect(codeOf(FAKE)).toMatch(/finally:\n\s+os\.close\(lock_fd\)/);
    expect(codeOf(SOURCE)).toMatch(/finally:\n\s+os\.close\(lock_fd\)\n\s+LOCK_PATH\.unlink\(missing_ok=True\)/);
  });

  it('two overlapping runs: the second refuses, the first is untouched', async () => {
    // **The property, executed.** Two fakes over one working directory, the
    // second started while the first is inside its sleep -- i.e. inside the
    // window where a real battery holds a gate mutated. This is the exact
    // overlap that produced the spurious SURVIVED above, at a scale where the
    // outcome is decidable.
    const work = mkdtempSync(join(scratch, 'overlap-'));
    const first = start(work, '4');
    // Wait for the first to acquire and mutate, without racing it: the lock file
    // is the observable it publishes, and polling for it is deterministic where
    // a fixed sleep would be machine-dependent.
    const lock = join(work, 'battery.lock');
    const deadline = Date.now() + 10_000;
    while (!existsSync(lock) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(existsSync(lock)).toBe(true);

    const second = start(work, '4');
    const secondCode = await second.done;
    const firstCode = await first.done;

    // The second refused, and said why, and did not report a verdict.
    expect(secondCode).toBe(3);
    expect(second.output()).toContain('another instance of this battery already holds');
    expect(second.output()).not.toContain('0 survived');

    // The first completed normally, and -- the part the corruption broke -- the
    // gate is back to its original bytes rather than to whatever the second run
    // believed the baseline was.
    expect(firstCode).toBe(0);
    expect(readFileSync(join(work, 'gate.mjs'), 'utf8')).toBe('original\n');
  }, 60_000);

  it('the mutating try/finally is inside the lock, not outside it', () => {
    // Ordering again, and the reason is the same as the first test's: a lock
    // acquired before the loop but released before the restore leaves the
    // restore unlocked, so a second run can acquire during it. The `finally`
    // that restores the gate must nest inside the `try` that holds the lock.
    //
    // Both sources, for the reason above: `FAKE` is what the overlap test
    // exercised, `SOURCE` is what ships.
    for (const [label, text] of [
      ['fake', FAKE],
      ['battery', SOURCE],
    ] as const) {
      const code = codeOf(text);
      // The lock write, named per subject: in the fake it is local and called
      // `lock_fd`; in the battery it lives in `acquire_exclusive_lock` and is
      // called `fd`. Both are the write that makes the acquisition *bind the
      // process* rather than merely create a file.
      const lockTry = label === 'fake' ? code.indexOf('os.write(lock_fd') : code.indexOf('os.write(fd');
      // The mutation write, named per subject: the fake mutates its own `GATE`,
      // the battery mutates `path`. Asserting one spelling against both would
      // have to be loosened to something that no longer identifies a mutation.
      const mutate =
        label === 'fake' ? code.indexOf('GATE.write_text("mutated') : code.indexOf('path.write_text(mutated)');
      const release = code.indexOf('os.close(lock_fd)');
      expect(lockTry, `${label}: acquires the lock`).toBeGreaterThan(-1);
      expect(mutate, `${label}: mutates after acquiring`).toBeGreaterThan(lockTry);
      expect(release, `${label}: releases after mutating`).toBeGreaterThan(mutate);
    }
  });
});

describe('scripts · the gate-test battery writes a report that survives a blocked log', () => {
  it('the shipped battery writes a machine-readable report', () => {
    // **Why a file and not a step summary.** This repository's CI job log cannot
    // be read from the development environment: the download redirects to a host
    // the project's proxy blocks (finding 55), and the only channel that survives
    // is the REST API. `actions/upload-artifact` is reachable through it -- the
    // `official-data` workflow already uses it, and its artifacts list through
    // `GET /actions/runs/{id}/artifacts` -- so the battery's verdicts are written
    // to a file the workflow uploads, instead of existing only in a log nobody
    // here can open.
    //
    // The report has to be written on the **failing** path, which is the one
    // anybody needs to read. A report written only on success is a report about
    // the case that needs no explanation.
    const code = codeOf(SOURCE);
    expect(code).toMatch(/REPORT_PATH/);
    expect(code).toMatch(/def write_report\(/);
    expect(code).toMatch(/json\.dumps\(payload/);
    // Called more than once, because there is more than one exit path -- the
    // restore failure and the verdict failure both leave through their own
    // `return`, and the report has to exist on each.
    const calls = code.match(/write_report\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3); // 1 definition + 2 call sites
  });

  it('the report row carries the verdict, the test file and the seconds', () => {
    // A report that carries only counts cannot answer "which injection", which
    // is the question the blocked log made unanswerable. The rows are the point.
    const code = codeOf(SOURCE);
    expect(code).toMatch(/"test_file"/);
    expect(code).toMatch(/"elapsed_s"/);
    expect(code).toMatch(/"verdict"/);
    expect(code).toMatch(/"redundant"/);
    // And the report is written where the workflow can find it without knowing
    // the checkout path: beside the gates, derived from `REPO`.
    expect(code).toMatch(/REPORT_PATH = REPO \//);
  });

  it('every report row says how many tests ran and what the runner exited with', () => {
    // **This is the correction of a real CI run, and the distinction it adds is
    // the whole finding.**
    //
    // The first CI run whose report could actually be read back said `0 caught,
    // 24 survived` -- every single injection a survivor. The rows could not say
    // which of the causes that was, because the report stored `[]` for every
    // non-CAUGHT verdict while `_diagnose` computed the collected count and
    // printed it *to the job log*, the one channel this project cannot read. So
    // "the runner decided nothing" and "the guards genuinely do not hold"
    // produced byte-identical reports, and they call for opposite repairs.
    //
    // The fix is to put the distinguishing quantity in the report. Asserted on
    // the row construction, not on a comment claiming it.
    const code = codeOf(SOURCE);
    expect(code).toMatch(/"collected": collected/);
    expect(code).toMatch(/"exit_status": status/);
    expect(code).toMatch(/"diagnosis": why/);
    // Computed once for all three verdict arms, so no arm can silently omit it.
    expect(code).toMatch(/collected = collected_count\(output\)/);
    expect(code).toMatch(/why = diagnosis\(status, output, collected\)/);
    // And it reaches the row through the spread, rather than being dropped.
    expect(code).toMatch(/\*\*detail/);
  });

  it('the collected count reads every shape vitest prints, including all-passed', () => {
    // **A bug found in this very helper while writing it, and the reason it is
    // tested against shapes rather than against one example.**
    //
    // The first version anchored the passed count on the pipe: `/\|\s*(\d+)
    // passed/`. A fully-green run prints `Tests  9 passed (9)` with **no pipe**,
    // which that pattern misses -- it returned 0 for a run that collected nine
    // tests, and `diagnosis` would then label it `no_tests_collected`, which is
    // the opposite of what happened. That is the exact confusion the field
    // exists to remove, so the shapes are enumerated.
    //
    // The helper is executed rather than pattern-matched. `collected_count` is
    // pure text in and out, so it can be lifted out of the file and run for real
    // -- a stronger check than asserting its source looks right.
    const source = readFileSync(BATTERY, 'utf8');
    const start = source.indexOf('def collected_count(');
    const end = source.indexOf('\ndef diagnosis(');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);

    // Python is already a dependency of this battery, so the helper is run
    // through it rather than reimplemented in TypeScript -- a reimplementation
    // would pass while the shipped regex was wrong.
    const dir = mkdtempSync(join(scratch, 'collected-'));
    const script = join(dir, 'check.py');
    writeFileSync(
      script,
      [
        'import re, sys',
        body,
        'cases = [',
        "    ('Tests  6 failed | 3 passed (9)', 9),",
        "    ('Tests  9 passed (9)', 9),",
        "    ('Tests  0 passed (0)', 0),",
        "    ('Tests  1 failed | 8 passed (9)', 9),",
        "    ('Tests  3 failed (3)', 3),",
        "    ('no summary line here', 0),",
        ']',
        'bad = [(o, collected_count(o), want) for o, want in cases if collected_count(o) != want]',
        "print('OK' if not bad else f'MISMATCH {bad}')",
      ].join('\n'),
    );
    const result = spawnSync('python3', [script], { encoding: 'utf8', timeout: 30_000 });
    expect(result.stdout.trim()).toBe('OK');
  });

  it('a run that collected no tests is not reported as a survivor', () => {
    // The three causes of a non-CAUGHT verdict are named separately rather than
    // collapsed, because each has a different repair: `no_tests_collected` means
    // the runner is misconfigured or found nothing and the row is silent about
    // the guard; `tests_passed` is a real finding; `runner_error` is a crash.
    // Collapsing them is the defect two other batteries already paid for.
    const code = codeOf(SOURCE);
    expect(code).toMatch(/return "no_tests_collected"/);
    expect(code).toMatch(/return "tests_passed"/);
    expect(code).toMatch(/return "runner_error"/);
    expect(code).toMatch(/if collected == 0:/);
  });
});
