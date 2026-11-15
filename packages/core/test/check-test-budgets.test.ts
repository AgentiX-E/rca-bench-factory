import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `scripts/check-test-budgets.mjs` · the reader that can see a file the table cannot.
 *
 * ## The hole, restated as the thing these tests check
 *
 * `timeout-budget.test.ts` holds a table of the files whose cost reaches vitest's
 * default, and it says of itself that it "can check every row it has and cannot
 * discover a row it does not". Three of its rows arrived as red CI runs. The reader
 * in `check-test-budgets.mjs` closes that by comparing a run's own durations with
 * the budget each file declares -- so what these tests have to establish is not
 * "does it print a number" but "does it see each of the four spellings a budget can
 * be written in, and does it judge a file against the clock that decides its
 * verdict rather than the largest number in it".
 *
 * On its first run against the real report it named one file the table did not have
 * -- `gates-are-testable-is-enumerated.test.ts`, slowest test 1 015 ms, no budget --
 * which is the demonstration that the reader does the thing it was written for.
 */
const DRIVES = ['scripts/check-test-budgets.mjs'];

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '../../../scripts/check-test-budgets.mjs');

/**
 * The budget this file's suite is given, in milliseconds.
 *
 * Every test spawns the gate, and one of them writes a report naming thirty files.
 * Measured at 1 040 / 1 042 ms across two full-suite runs on a four-CPU quota; the
 * estate's tightest declaration, as for its siblings.
 */
const SUITE_BUDGET_MS = 30_000;

const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'test-budgets-'));
  dirs.push(dir);
  return dir;
}

/** One test file, and the report that says how long its tests took. */
function fixture(dir: string, name: string, source: string): string {
  const file = join(dir, name);
  writeFileSync(file, source);
  return file;
}

function reportOf(entries: { file: string; durations: number[]; title?: string }[]): string {
  return JSON.stringify({
    testResults: entries.map((entry) => ({
      name: entry.file,
      startTime: 0,
      endTime: 1000,
      status: 'passed',
      message: '',
      assertionResults: entry.durations.map((duration, index) => ({
        ancestorTitles: [],
        fullName: `${entry.title ?? 'a test'} ${index}`,
        title: `${entry.title ?? 'a test'} ${index}`,
        status: 'passed',
        duration,
        failureMessages: [],
      })),
    })),
  });
}

function run(...argv: string[]): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...argv], { encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

/** A file whose suite states `SUITE_BUDGET_MS`, the spelling most files here use. */
function withSuiteBudget(ms: number): string {
  return [
    `const SUITE_BUDGET_MS = ${ms};`,
    "describe('a suite', { timeout: SUITE_BUDGET_MS }, () => {",
    "  it('a test', () => {});",
    '});',
  ].join('\n');
}

describe('check-test-budgets · the reader', { timeout: SUITE_BUDGET_MS }, () => {
  it('passes a file whose slowest test is under half the budget it states', () => {
    const dir = scratch();
    const file = fixture(dir, 'a.test.ts', withSuiteBudget(30_000));
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [100, 14_000] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('check-test-budgets: OK (1 file(s), 2 test(s)');
    expect(out).toContain('1 state a budget');
    expect(status).toBe(0);
  });

  it('fails a file whose slowest test takes more than half its own budget', () => {
    // Half, not all: a file at 94% of its budget was green by 282 ms on the run
    // before it went red, so "under the budget" is the assertion that fails first.
    const dir = scratch();
    const file = fixture(dir, 'a.test.ts', withSuiteBudget(10_000));
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [5_500] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('its slowest test takes 5500 ms against a stated budget of 10000 ms, which is 0.55 of it');
    expect(out).toContain('the rule asks for 2x');
    expect(out).toContain('FAILED (1 problem(s) across 1 file(s)');
    expect(status).toBe(1);
  });

  it('fails a file that states no budget and has a test at a fifth of the default', () => {
    // This is the row the table cannot discover. The floor is a fifth of 5 000 ms,
    // so 1 000 ms is the first cost that can decide a verdict: three such files went
    // red before this reader existed.
    const dir = scratch();
    const file = fixture(dir, 'b.test.ts', "describe('a suite', () => { it('a test', () => {}); });");
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [1_000], title: 'the test that will decide it' }]));
    const { status, out } = run('--report', report);
    expect(out).toContain("the file states no budget, so its verdict is decided by vitest's 5000 ms default");
    expect(out).toContain("'the test that will decide it 0' is the test that will decide it");
    expect(status).toBe(1);
  });

  it('passes a file that states no budget and has nothing near the default', () => {
    // 216 of the 249 files in the suite are this shape, and demanding a number from
    // them would be demanding one nobody needs.
    const dir = scratch();
    const file = fixture(dir, 'c.test.ts', "describe('a suite', () => { it('a test', () => {}); });");
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [12, 999] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('check-test-budgets: OK (1 file(s), 2 test(s)');
    expect(out).toContain('0 state a budget');
    expect(status).toBe(0);
  });

  it('judges a file by the suite budget, not by the largest number in it', () => {
    // `typecheck-entrypoint.test.ts` states `RUN_TIMEOUT_MS = 180_000`, which bounds a
    // spawned `pnpm`, not the test. Taking the largest number would hand that test a
    // 180-second budget it does not have -- measuring the wrong clock in the
    // flattering direction -- so the suite's declaration is the denominator.
    const dir = scratch();
    const source = [
      'const RUN_TIMEOUT_MS = 180_000;',
      'const SUITE_BUDGET_MS = 20_000;',
      "function run() { return spawnSync('x', [], { timeout: RUN_TIMEOUT_MS }); }",
      "describe('a suite', { timeout: SUITE_BUDGET_MS }, () => { it('a test', () => {}); });",
    ].join('\n');
    const file = fixture(dir, 'd.test.ts', source);
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [11_000] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('against a stated budget of 20000 ms');
    expect(status).toBe(1);
  });

  it('reads all four spellings of a budget', () => {
    // The reader knows four because the language has four, and a reader that knows
    // fewer fails in the direction of a false red: `fetch-official.test.ts` was
    // reported as stating no budget when it states `300_000` positionally.
    const dir = scratch();
    const spellings: [string, string][] = [
      ['constant', 'const FILE_TIMEOUT_MS = 40_000;\nit("a", () => {}, 1);'],
      ['lengthy-constant', withSuiteBudget(40_000)],
      ['options-literal', "it('a', { timeout: 40_000 }, () => {});"],
      ['options-name', 'const ACASE_TIMEOUT_MS = 40_000;\nit("a", { timeout: ACASE_TIMEOUT_MS }, () => {});'],
      ['positional', "it('a', () => {}, 40_000);"],
    ];
    for (const [name, source] of spellings) {
      const file = fixture(dir, `${name}.test.ts`, source);
      const report = join(dir, `${name}.json`);
      writeFileSync(report, reportOf([{ file, durations: [25_000] }]));
      const { status, out } = run('--report', report);
      // 25 000 of 40 000 is over half in every spelling, so every spelling must be
      // read: a reader that missed one would print `OK` here instead.
      expect(out, `${name}: ${out}`).toContain('FAILED (1 problem(s)');
      expect(status, name).toBe(1);
    }
  });

  it('counts every report it is given, rather than the first', () => {
    const dir = scratch();
    const one = fixture(dir, 'one.test.ts', withSuiteBudget(30_000));
    const two = fixture(dir, 'two.test.ts', withSuiteBudget(30_000));
    const first = join(dir, 'first.json');
    const second = join(dir, 'second.json');
    writeFileSync(first, reportOf([{ file: one, durations: [10] }]));
    writeFileSync(second, reportOf([{ file: two, durations: [20, 30] }]));
    const { status, out } = run('--report', `${first},${second}`);
    expect(out).toContain('OK (2 file(s), 3 test(s)');
    expect(status).toBe(0);
  });

  it('refuses a report it cannot read, rather than reporting nothing over the line', () => {
    const { status, out } = run('--report', join(tmpdir(), 'no-such-report-xyz.json'));
    expect(out).toContain('ENOENT');
    expect(status).toBe(1);
  });

  it('refuses a report that names no test at all', () => {
    // "Nothing was over the line" and "nothing was read" print the same number of
    // failures, which is the shape this repository has repaired twice.
    const dir = scratch();
    const report = join(dir, 'empty.json');
    writeFileSync(report, JSON.stringify({ testResults: [] }));
    const { status, out } = run('--report', report);
    expect(out).toContain('the report(s) named no test at all, so nothing was measured and this is not a pass');
    expect(status).toBe(1);
  });

  it('refuses an invocation that names no report', () => {
    const { status, out } = run();
    expect(out).toContain('at least one --report is required');
    expect(status).toBe(1);
  });

  it('refuses a value it cannot use for a knob', () => {
    expect(run('--report', 'x', '--floor', 'zero').out).toContain('--floor requires a positive number');
    expect(run('--report', 'x', '--share', '1').out).toContain('--share requires a number greater than 1');
    expect(run('--report', 'x', '--typo').out).toContain("unrecognised argument '--typo'");
    expect(run('--report').out).toContain('--report requires a value');
  });

  it('ignores a result whose file name is missing, and says so', () => {
    const dir = scratch();
    const report = join(dir, 'nameless.json');
    writeFileSync(report, JSON.stringify({ testResults: [{ assertionResults: [{ duration: 1 }] }] }));
    const { status, out } = run('--report', report);
    expect(out).toContain('a test result carries no file name, so its durations cannot be attributed');
    expect(status).toBe(1);
  });

  it('refuses a duration that is not a number, rather than reading it as zero', () => {
    // `Number(undefined ?? 0)` is 0 and `Number('slow')` is NaN: one is a fast test
    // and the other is a report that cannot be read, and only the second is a problem.
    const dir = scratch();
    const file = fixture(dir, 'e.test.ts', withSuiteBudget(30_000));
    const report = join(dir, 'nan.json');
    const parsed = JSON.parse(reportOf([{ file, durations: [1] }]));
    parsed.testResults[0].assertionResults[0].duration = 'slow';
    writeFileSync(report, JSON.stringify(parsed));
    const { status, out } = run('--report', report);
    expect(out).toContain("reports a duration that is not a number");
    expect(status).toBe(1);
  });

  it('refuses a report naming a file it cannot read', () => {
    const dir = scratch();
    const report = join(dir, 'gone.json');
    writeFileSync(report, reportOf([{ file: join(dir, 'never-written.test.ts'), durations: [1] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('never-written.test.ts');
    expect(out).toContain('ENOENT');
    expect(status).toBe(1);
  });

  it('says nothing was measured against a budget when no file states one', () => {
    // The summary sentence used to end "the closest to its budget is  at 0% of 0 ms"
    // here -- a measurement of a clock no file was given.
    const dir = scratch();
    const file = fixture(dir, 'f.test.ts', "describe('a suite', () => { it('a test', () => {}); });");
    const report = join(dir, 'none.json');
    writeFileSync(report, reportOf([{ file, durations: [10] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('and no file states a budget, so nothing was measured against one');
    expect(out).not.toContain('closest to its budget');
    expect(status).toBe(0);
  });
});
