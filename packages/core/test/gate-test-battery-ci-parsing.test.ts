import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The gate-test battery must read the output CI actually produces.
 *
 * ## The measurement that produced this file
 *
 * Local runs of `scripts/injection/gate-tests-battery.py` reported **24 caught,
 * 0 survived, 0 inert, 0 timed out, 1 redundant**. CI runs of the same file at
 * the same commit reported **0 caught, 24 survived, 1 redundant** -- every
 * injection a survivor. Same 25 injections, same gates, opposite verdicts, and
 * the job log could not be read to arbitrate (finding 55: the log download
 * redirects to a host this project's proxy blocks).
 *
 * The artifact channel was built to answer exactly that question, and when the
 * first report became readable it carried the evidence as well as the verdict.
 * One row read:
 *
 *     collected=0  exit_status=1  diagnosis=no_tests_collected
 *     ❯ test/check-readme-sample.test.ts:353:27
 *       353|     expect(result.status).toBe(0);
 *          |                           ^
 *
 * That is a **real assertion failure in a test that really ran**, reported as
 * "the runner found nothing". So the tests were collected, they failed, and the
 * battery said they had never run. Twenty-four such rows.
 *
 * ## Two defects in series, and why one fix was not enough
 *
 * `failed_count` searched for `Tests\s+(\d+) failed`, and the summary sits
 * *below* the failure frames. A twelve-line tail stops inside the last frame and
 * never reaches it, so `failed_count` returned 0 -- and the CAUGHT condition is
 * exactly `status != 0 and failed_count(output) > 0`. Twenty-four caught
 * injections fell through to SURVIVED.
 *
 * Fixing that one is not enough, which is the part this file exists to hold
 * down. The frames are **ANSI-wrapped** on CI (`\x1b[36m \x1b[2m❯`) and plain in
 * a terminal, so a pattern anchored on the first visible character matches in
 * one place and not the other. And the same missing summary made
 * `collected_count` fall back to counting frames, which returns a *lower bound*
 * (one, because the tail holds one frame) while the report captioned it
 * `collected` -- an exact-looking integer that a reader takes for a total.
 * `diagnosis` then branched on that number before checking status, and labelled
 * every one of those twenty-four real failures `runner_error`: "the runner died
 * before reporting anything", pointing at the wrong repair entirely.
 *
 * So there are four independent claims below, and each has a test that fails
 * when only the others are met: the parser finds failures in CI-shaped bytes,
 * the count is never a lower bound presented as a total, the diagnosis prefers
 * the failure evidence over a derived count, and the tail is long enough to
 * reach the summary the parsers prefer.
 *
 * ## Why the fixture is verbatim bytes
 *
 * The captured tails are stored in `test/fixtures/gate-battery-ci-output.json`,
 * escapes and all, rather than paraphrased into TypeScript string literals. A
 * paraphrase is written by the same person as the fix and tends to be the shape
 * the fix handles; the point of this file is to hold the shape CI emitted.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BATTERY = resolve(ROOT, 'scripts', 'injection', 'gate-tests-battery.py');
const SOURCE = readFileSync(BATTERY, 'utf8');

const FIXTURE = JSON.parse(
  readFileSync(resolve(ROOT, 'packages', 'core', 'test', 'fixtures', 'gate-battery-ci-output.json'), 'utf8'),
) as { shapes: Record<string, string> };

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-gate-parsers-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Lift a top-level Python function out of the battery, by name. */
function extract(name: string): string {
  const start = SOURCE.indexOf(`def ${name}(`);
  if (start < 0) throw new Error(`no definition of ${name} in the battery`);
  const rest = SOURCE.slice(start + 1);
  const next = rest.search(/\ndef /);
  return next < 0 ? SOURCE.slice(start) : SOURCE.slice(start, start + 1 + next);
}

/**
 * Run Python source with the shipped helpers and a driver, and return stdout.
 *
 * The helpers are executed rather than pattern-matched on purpose. They are pure
 * text in and text out, and a TypeScript reimplementation would pass while the
 * shipped regex was wrong -- which is precisely the failure this file is about.
 */
function runPython(body: string, driver: string): string {
  const dir = mkdtempSync(join(scratch, 'run-'));
  const script = join(dir, 'check.py');
  writeFileSync(script, ['import re, json, sys', '', body, '', driver].join('\n'));
  const result = spawnSync('python3', [script], { encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) {
    throw new Error(`python3 exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

const HELPERS = [
  extract('strip_ansi'),
  extract('failing_tests'),
  extract('failed_count'),
  extract('collected_count'),
  extract('collected_basis'),
  extract('diagnosis'),
].join('\n\n');

/** The real captured tail for one shape, as CI emitted it. */
function shape(key: string): string {
  const text = FIXTURE.shapes[key];
  if (typeof text !== 'string') {
    throw new Error(`fixture has no shape ${key}: have ${Object.keys(FIXTURE.shapes).join(', ')}`);
  }
  return text;
}

describe('scripts · the gate-test battery parses the output CI emits, not the output a terminal emits', () => {
  it('the fixture holds the real CI bytes, with the escapes still in them', () => {
    // The premise of every test below. If someone "cleans up" the fixture, the
    // ANSI regression this file guards becomes untestable while these tests stay
    // green -- so the fixture's own fidelity is asserted first.
    const all = Object.values(FIXTURE.shapes).join('\n');
    expect(all).toContain('\u001b['); // SGR escapes, as captured
    expect(all).toContain('❯'); // the frame marker vitest uses for a failure
    expect(all).toContain('expect');
    expect(all).toContain('^'); // the assertion caret
    // And it is not a fixture of one shape: the run produced a survivor too.
    expect(Object.keys(FIXTURE.shapes).length).toBeGreaterThanOrEqual(2);
  });

  it('a failure frame wrapped in ANSI is still found', () => {
    // **The defect, at its narrowest.** On CI vitest emits
    // `\x1b[36m \x1b[2m❯\x1b[22m test/...:353:27`; in a terminal the same frame
    // is ` ❯ test/...:353:27`. A regex anchored on the line start matches the
    // second and misses the first, which is why the file reported opposite
    // verdicts in the two places for so long.
    const out = runPython(
      HELPERS,
      [
        `tail = ${JSON.stringify(shape('SURVIVED|1|no_tests_collected'))}`,
        'names = failing_tests(tail)',
        'print(len(names))',
        'print(names[0] if names else "(none)")',
      ].join('\n'),
    );
    const [count, first] = out.split('\n');
    expect(Number(count)).toBeGreaterThan(0);
    // Named by its file, since a frame identifies the file rather than the test.
    expect(first).toMatch(/^failure in test\/check-readme-sample\.test\.ts$/);
  });

  it('the count of failures does not depend on the summary line being in the text', () => {
    // The summary is printed *below* the frames and the report keeps a tail, so
    // the evidence of failure routinely arrives without the tally. The captured
    // tails contain no `Tests N failed` at all -- asserted here, because if they
    // did, this test would pass for the wrong reason.
    const tail = shape('SURVIVED|1|no_tests_collected');
    const plain = tail.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
    expect(plain).not.toMatch(/Tests\s+\d+ failed/);

    const out = runPython(
      HELPERS,
      [
        `tail = ${JSON.stringify(tail)}`,
        `plain = ${JSON.stringify(plain)}`,
        'print(failed_count(plain))',
      ].join('\n'),
    );
    // Pre-fix this returned 0, which made the CAUGHT condition
    // (`status != 0 and failed > 0`) false for a run that had plainly failed.
    expect(Number(out)).toBeGreaterThan(0);
  });

  it('the battery reaches that verdict on the captured bytes', () => {
    // **The end-to-end claim**, on the bytes CI emitted: the verdict the battery
    // reaches, using the battery's own condition and its own helpers. Every row
    // the runner exited non-zero on must come out caught; the exit-0 row is the
    // legitimate REDUNDANT and must not. This is the assertion that would have
    // produced 24 survivors on `d33b4e47a`.
    const dir = mkdtempSync(join(scratch, 'verdict-'));
    const rows = Object.entries(FIXTURE.shapes).map(([key, tail]) => [Number(key.split('|')[1]), tail]);
    const payload = join(dir, 'rows.json');
    writeFileSync(payload, JSON.stringify(rows));

    const script = join(dir, 'check.py');
    writeFileSync(
      script,
      [
        'import re, json, sys',
        HELPERS,
        `rows = json.load(open(${JSON.stringify(payload)}))`,
        'verdicts = ["CAUGHT" if (st != 0 and failed_count(t) > 0) else "NOT-CAUGHT" for st, t in rows]',
        'print(",".join(verdicts))',
      ].join('\n'),
    );
    const result = spawnSync('python3', [script], { encoding: 'utf8', timeout: 30_000 });
    expect(result.status).toBe(0);

    const verdicts = result.stdout.trim().split(',');
    const exits = Object.keys(FIXTURE.shapes).map((k) => Number(k.split('|')[1]));
    // Every row the runner exited non-zero on must be caught; the exit-0 row is
    // the legitimate REDUNDANT and must not be.
    exits.forEach((exit, i) => {
      expect(verdicts[i], `row ${i} (exit ${exit})`).toBe(exit === 0 ? 'NOT-CAUGHT' : 'CAUGHT');
    });
  });

  it('the number in the report is never a lower bound captioned as a total', () => {
    // **The second defect, which the first fix created.** With the summary gone,
    // `collected_count` fell back to counting the failure frames it could see --
    // one, because the tail held one. The report printed `collected: 1` on rows
    // whose runner had reported six failures, and a reader takes an integer
    // captioned `collected` for a count of tests.
    //
    // So the basis travels with the number, and this asserts the distinction is
    // real on both shapes rather than merely declared.
    const out = runPython(
      HELPERS,
      [
        `tail = ${JSON.stringify(shape('SURVIVED|1|no_tests_collected'))}`,
        'print(collected_basis(tail))',
        'print(collected_count(tail))',
        'print(collected_basis("Tests  6 failed | 3 passed (9)"))',
        'print(collected_count("Tests  6 failed | 3 passed (9)"))',
        'print(collected_basis("Tests  9 passed (9)"))',
        'print(collected_count("Tests  9 passed (9)"))',
      ].join('\n'),
    );
    const [b1, c1, b2, c2, b3, c3] = out.split('\n');
    // A tail with no summary: the count is a floor and says so.
    expect(b1).toBe('failures');
    expect(Number(c1)).toBeGreaterThan(0);
    // A real summary is exact, so the report can be read as a total.
    expect(b2).toBe('summary');
    expect(Number(c2)).toBe(9);
    // Including the all-passed shape, which has no pipe -- a shape this helper
    // already mis-parsed once.
    expect(b3).toBe('summary');
    expect(Number(c3)).toBe(9);
  });

  it('the shipped report row carries the basis beside the count', () => {
    // The distinction is only worth anything if it reaches the artifact, and the
    // artifact is the channel that can be read. Asserted on all three verdict
    // arms, because a field wired into one arm answers for the cases that
    // already had an answer.
    const code = SOURCE.replace(/"""[\s\S]*?"""/g, '')
      .split('\n')
      .map((line) => line.replace(/#.*$/, ''))
      .join('\n');
    expect(code).toMatch(/basis = collected_basis\(output\)/);
    const wired = code.match(/"collected_basis": basis/g) ?? [];
    expect(wired.length).toBe(3);
    // And it reaches the row through the same spread the other fields use.
    expect(code).toMatch(/\*\*detail/);
  });

  it('a run that failed is never diagnosed as a runner error', () => {
    // **The third defect, and the one that points at the wrong repair.**
    //
    // `diagnosis` branched on `collected` first, and `collected` was the
    // undercount above -- so a run whose test file declared `expect(...).toBe(0)`
    // and got 1, with the caret printed under it, was labelled `runner_error`:
    // "the runner exited non-zero without reporting a failure". That sends a
    // reader to look for a crash in a run that reported its failure precisely.
    //
    // The four labels are asserted to be reachable and distinct, and the
    // precedence is asserted on real captured bytes.
    const out = runPython(
      HELPERS,
      [
        `fail_tail = ${JSON.stringify(shape('SURVIVED|1|no_tests_collected'))}`,
        `green_tail = ${JSON.stringify(shape('REDUNDANT|0|no_tests_collected'))}`,
        '# a real failure: status 1, frames present',
        'print(diagnosis(1, fail_tail, collected_count(fail_tail)))',
        '# a crash that collected nothing: the runner never got far enough to',
        '# report a failure, so nothing is known about the guard',
        'print(diagnosis(1, "boom: cannot find module", 0))',
        '# a run that collected tests, stayed green, and still exited non-zero --',
        '# the only shape that is a genuine runner error, because tests ran and',
        '# the runner reported no failure',
        'print(diagnosis(1, "Tests  9 passed (9)", 9))',
        '# a clean run',
        'print(diagnosis(0, "Tests  9 passed (9)", 9))',
        '# nothing collected, clean exit',
        'print(diagnosis(0, "", 0))',
        '# the captured survivor row, for completeness',
        'print(diagnosis(0, green_tail, collected_count(green_tail)))',
      ].join('\n'),
    );
    const lines = out.split('\n');
    expect(lines[0]).toBe('tests_failed');
    // My first version of this test expected `runner_error` here and was wrong:
    // a crash that collected nothing is also, and more usefully,
    // `no_tests_collected`, because that is checked first and is the fact a
    // reader needs. The distinction the label is for is whether the guard was
    // exercised at all, not how the process died.
    expect(lines[1]).toBe('no_tests_collected');
    expect(lines[2]).toBe('runner_error');
    expect(lines[3]).toBe('tests_passed');
    expect(lines[4]).toBe('no_tests_collected');
    // A green row is `tests_passed` if its summary reached us, and
    // `no_tests_collected` if it did not -- never `tests_failed`.
    expect(['tests_passed', 'no_tests_collected']).toContain(lines[5]);
    expect(new Set(lines).size).toBeGreaterThanOrEqual(4);
  });

  it('the tail is long enough to reach the summary the parsers prefer', () => {
    // **The fourth defect: the field that carried the evidence was sized to
    // exclude it.** A vitest failure frame is nine lines -- the `❯ file:line:col`
    // header, the source excerpt, the caret, blank separators -- and vitest
    // prints every frame before the `Tests N failed` summary. Twelve lines lands
    // inside the *last* frame and stops, which is exactly the tail captured
    // above: the frame is there, the summary is not, and every parser that
    // prefers the summary fell back to a lower bound.
    //
    // Asserted as a property rather than as a number, because the number is not
    // the point: the tail must span at least a few frames plus the summary.
    const code = SOURCE.replace(/"""[\s\S]*?"""/g, '');
    const match = code.match(/def output_tail\(output: str, lines: int = (\d+)\)/);
    expect(match).not.toBeNull();
    const lines = Number(match![1]);
    // One frame is nine lines; the summary and its blank separators take a few
    // more. Four frames plus the summary is the floor that makes the captured
    // failure readable, which twelve did not meet.
    expect(lines).toBeGreaterThanOrEqual(4 * 9);
  });

  it('the captured tail, replayed through the shipped parsers, reads as a failure', () => {
    // The single end-to-end assertion this file exists for, stated as the
    // contrast that was measured: the same bytes that produced `SURVIVED` on CI
    // and `CAUGHT` locally must now produce `CAUGHT` in both.
    const dir = mkdtempSync(join(scratch, 'replay-'));
    const script = join(dir, 'check.py');
    writeFileSync(
      script,
      [
        'import re, json, sys',
        HELPERS,
        // The tail as captured, and the same tail as a terminal would print it,
        // to prove the answer no longer depends on which one we hold.
        `captured = ${JSON.stringify(shape('SURVIVED|1|no_tests_collected'))}`,
        'plain = strip_ansi(captured)',
        'for label, tail in (("captured", captured), ("plain", plain)):',
        '    n = failed_count(tail)',
        '    why = diagnosis(1, tail, collected_count(tail))',
        '    print(f"{label}: failed={n} diagnosis={why} caught={1 != 0 and n > 0}")',
      ].join('\n'),
    );
    const result = spawnSync('python3', [script], { encoding: 'utf8', timeout: 30_000 });
    expect(result.status).toBe(0);
    const lines = result.stdout.trim().split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(/failed=[1-9]\d*/);
      expect(line).toMatch(/diagnosis=tests_failed/);
      expect(line).toMatch(/caught=True/);
    }
  });
});
