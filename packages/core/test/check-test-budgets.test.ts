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

function reportOf(
  entries: { file: string; durations: number[]; title?: string; names?: string[] }[],
): string {
  return JSON.stringify({
    testResults: entries.map((entry) => ({
      name: entry.file,
      startTime: 0,
      endTime: 1000,
      status: 'passed',
      message: '',
      assertionResults: entry.durations.map((duration, index) => ({
        ancestorTitles: [],
        // `names` is for the fixtures that have to be found by the title a reader
        // reads out of the source: vitest prints a test as its ancestors and its
        // title joined by spaces, and the default here appends an index that no
        // source spells.
        fullName: entry.names?.[index] ?? `${entry.title ?? 'a test'} ${index}`,
        title: entry.names?.[index] ?? `${entry.title ?? 'a test'} ${index}`,
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
    expect(out).toContain(
      'its slowest test takes 5500 ms against a stated budget of 10000 ms, the one its suite states, which is 0.55 of it',
    );
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

  /**
   * The clock the slowest test is actually on.
   *
   * Until v3.104 the suite's number was the denominator unconditionally, and CI run
   * 43944379177 showed what that costs: `ingest-report.test.ts` was reported at
   * **15 199 ms against a stated budget of 30 000 ms, which is 0.51 of it** while the
   * two tests that cost that much each state `ROWS_TIMEOUT_MS = 120_000` on
   * themselves -- 8x of headroom, printed as a 2x shortfall. `it(name, fn, ms)`
   * replaces the suite's number for that test, so the rule was measuring a clock the
   * test had already replaced.
   *
   * The last of these is the half that makes the repair a repair and not a
   * relaxation: a test that states a *smaller* budget than its suite was invisible
   * before, and is now the first thing the rule sees.
   */
  it('holds a test to the budget it states itself, rather than its suite’s', () => {
    const dir = scratch();
    const source = [
      'const SUITE_BUDGET_MS = 30_000;',
      'const ROWS_TIMEOUT_MS = 120_000;',
      "describe('a suite', { timeout: SUITE_BUDGET_MS }, () => {",
      "  it('the slow one', () => {}, ROWS_TIMEOUT_MS);",
      '});',
    ].join('\n');
    const file = fixture(dir, 'g.test.ts', source);
    const report = join(dir, 'report.json');
    // 20 000 of 30 000 is 0.67 -- red before the repair, and 0.17 of the number the
    // test states for itself.
    writeFileSync(report, reportOf([{ file, durations: [20_000], names: ['a suite the slow one'] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('check-test-budgets: OK (1 file(s), 1 test(s)');
    expect(out).toContain('1 state a budget, 1 of them on the test that is slowest');
    expect(status).toBe(0);
  });

  it('holds a test that states a tighter budget than its suite to the tighter one', () => {
    // 6 000 of the suite's 60 000 is 0.10 and was green; 6 000 of the 10 000 the test
    // states is 0.60 and is the verdict this test was really on.
    const dir = scratch();
    const source = [
      'const SUITE_BUDGET_MS = 60_000;',
      'const TIGHT_MS = 10_000;',
      "describe('a suite', { timeout: SUITE_BUDGET_MS }, () => {",
      "  it('the tight one', () => {}, TIGHT_MS);",
      '});',
    ].join('\n');
    const file = fixture(dir, 'h.test.ts', source);
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [6_000], names: ['a suite the tight one'] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain(
      'its slowest test takes 6000 ms against a stated budget of 10000 ms, the one that test states, which is 0.60 of it',
    );
    expect(status).toBe(1);
  });

  it('reads the budget a test states in its options, past comments that would shift a position', () => {
    // Three reasons this fixture is shaped this way. The options form is a second
    // spelling on the test itself; the comments are what the reader's offsets have to
    // survive, since a reader that counts positions in a stripped copy and then reads
    // the title out of the original lands in the wrong place by the length of every
    // comment above it; and the comma inside the title is what a reader that splits
    // the argument list on commas alone would cut in half.
    const dir = scratch();
    const source = [
      '/**',
      ' * A suite, with the kind of block comment this repository writes.',
      ' */',
      "describe('a suite', { timeout: 30_000 }, () => {",
      '  // one comment, then the test',
      "  it('the slower one, with a comma in it', { timeout: 8_000 }, () => {",
      '    // a body, so the options object is not the last argument',
      '  });',
      '});',
    ].join('\n');
    const file = fixture(dir, 'i.test.ts', source);
    const report = join(dir, 'report.json');
    writeFileSync(
      report,
      reportOf([{ file, durations: [5_000], names: ['a suite the slower one, with a comma in it'] }]),
    );
    const { status, out } = run('--report', report);
    expect(out).toContain('against a stated budget of 8000 ms, the one that test states');
    expect(status).toBe(1);
  });

  it('does not read a timeout inside the test’s body as the test’s budget', () => {
    // `typecheck-entrypoint.test.ts` states `RUN_TIMEOUT_MS = 180_000` for the `pnpm`
    // it spawns. The number sits in a `{ timeout: ... }` object inside the test's own
    // body, so a reader that took the first `timeout:` it found in the argument list
    // would hand that test a three-minute budget it never asked for -- the flattering
    // direction. Its suite's 30 000 is the number in force.
    const dir = scratch();
    const source = [
      'const RUN_TIMEOUT_MS = 180_000;',
      "describe('a suite', { timeout: 30_000 }, () => {",
      "  it('spawns', () => {",
      "    spawnSync('pnpm', [], { timeout: RUN_TIMEOUT_MS });",
      '  });',
      '});',
    ].join('\n');
    const file = fixture(dir, 'j.test.ts', source);
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [20_000], names: ['a suite spawns'] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain(
      'its slowest test takes 20000 ms against a stated budget of 30000 ms, the one its suite states',
    );
    expect(status).toBe(1);
  });

  it('names the largest number in the file when neither the test nor its suite states one', () => {
    const dir = scratch();
    const source = [
      'const RUN_TIMEOUT_MS = 180_000;',
      "describe('a suite', () => {",
      "  it('spawns', () => {});",
      '});',
    ].join('\n');
    const file = fixture(dir, 'k.test.ts', source);
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [100_000], names: ['a suite spawns'] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('against a stated budget of 180000 ms, the largest number the file states');
    expect(status).toBe(1);
  });

  it('takes the smaller of two budgets when one title states two', () => {
    // A file that writes `it('a test', …)` twice gives two different clocks to two
    // tests the report names identically. The smaller one is the one that can go red
    // first, so it is the one that answers for the title.
    const dir = scratch();
    const source = [
      "describe('a suite', { timeout: 30_000 }, () => {",
      "  it('a test', () => {}, 10_000);",
      "  it('a test', () => {}, 40_000);",
      '});',
    ].join('\n');
    const file = fixture(dir, 'l.test.ts', source);
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [6_000], names: ['a suite a test'] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('against a stated budget of 10000 ms, the one that test states');
    expect(status).toBe(1);
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

/**
 * The scanner reads code, and only code.
 *
 * `check-test-budgets.mjs` says of itself that "the scanner is the one
 * `test/timeout-budget.test.ts` documents". That is a claim about two copies of one
 * rule, and the copies had drifted: the test's scanner tracks character classes and
 * this one did not, so a pattern like `/[/"]/` ended at the slash inside the brackets
 * and the quotation after it opened a string that swallowed every budget below.
 *
 * The census says why nobody noticed. Eight patterns in this tree hold a slash inside
 * a class -- `[^/]` in `run.test.ts`, `[-_./]` in `gates.ts`, and one holding a star
 * and a slash in `check-no-absolute-paths.mjs` -- and not one of them sits above a
 * stated budget, so both scanners returned the same reading for all 467 code files. A
 * reader that is right by luck is one added pattern away from a false red, which is
 * what the first test here is.
 */
describe('check-test-budgets · the scanner reads code, and only code', { timeout: SUITE_BUDGET_MS }, () => {
  it('reads a budget that sits below a pattern holding a slash inside a class', () => {
    // The shape `timeout-budget.test.ts` names as the one that broke its scanner, kept
    // as it was written there: `/[/"]/` accepts either kind of quotation.
    const source = [
      "const EITHER = /[/'\"]/;",
      'const SUITE_BUDGET_MS = 30_000;',
      "describe('a suite', { timeout: SUITE_BUDGET_MS }, () => { it('a test', () => {}); });",
    ].join('\n');
    const dir = scratch();
    const file = fixture(dir, 'g.test.ts', source);
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [16_500] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('against a stated budget of 30000 ms, the one its suite states');
    expect(status).toBe(1);
  });

  it('does not read a number that is an argument as a budget', () => {
    // The positional spelling used to be read as `/, <number>)/`, a shape that also
    // matches an ordinary call: `buildAnthropicRequest('p', 'claude-3-opus-latest',
    // 8192)` and `Math.imul(state, 1664525)` are the two that did it in this tree.
    // Eleven of the 259 test files were read that way and each became "a file that
    // states a budget", which is the flattering direction twice over: the fraction
    // rule cannot fire against 1 664 525 ms, and the floor rule -- the one that asks a
    // file with a 1 000 ms test to declare a budget -- does not fire either, because
    // the file has "declared" one.
    //
    // Nothing was red or green wrongly on the day, because every invented number is
    // larger than the slowest test in its file. One three-second test would have been
    // enough for the gate to call 1 664 525 ms of headroom.
    const source = [
      "const req = buildAnthropicRequest('p', 'claude-3-opus-latest', 8192);",
      'const state = Math.imul(seed, 1664525);',
      "describe('a suite', () => { it('a test', () => {}); });",
    ].join('\n');
    const dir = scratch();
    const file = fixture(dir, 'j.test.ts', source);
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [2_000] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('the file states no budget');
    expect(out).toContain('0 state a budget');
    expect(status).toBe(1);
  });

  it('reads a budget that sits below a string holding a bracket', () => {
    // Classes are tracked for patterns only: a bracket inside a string is text. A
    // reader that tracked one there would open a class it never closes, and the string
    // would then run past its own quotation to the end of the file.
    const source = [
      "const OPEN = '[';",
      'const SUITE_BUDGET_MS = 30_000;',
      "describe('a suite', { timeout: SUITE_BUDGET_MS }, () => { it('a test', () => {}); });",
    ].join('\n');
    const dir = scratch();
    const file = fixture(dir, 'i.test.ts', source);
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [16_500] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('against a stated budget of 30000 ms, the one its suite states');
    expect(status).toBe(1);
  });

  it('reads a budget that sits below a division that follows a literal', () => {
    // A value cannot be followed by a pattern, so this `/` divides. The scanner decides
    // that from the character it last noted, which for a literal is the delimiter it
    // opened on -- so the rule survives whether the delimiter is emitted or blanked,
    // and the reader keeps no state in its output that it does not have in its scan.
    //
    // The file is never compiled -- it is input to a lexer, and at the token level
    // `"a" / 2` is a division. It is the only shape that separates "the delimiter was
    // noted" from "the delimiter was not", which is why this test is the one that
    // holds the rule up; the census counts zero files in this tree that write one.
    const source = [
      'const ratio = "a" / 2;',
      'const SUITE_BUDGET_MS = 30_000;',
      "describe('a suite', { timeout: SUITE_BUDGET_MS }, () => { it('a test', () => {}); });",
    ].join('\n');
    const dir = scratch();
    const file = fixture(dir, 'h.test.ts', source);
    const report = join(dir, 'report.json');
    writeFileSync(report, reportOf([{ file, durations: [16_500] }]));
    const { status, out } = run('--report', report);
    expect(out).toContain('against a stated budget of 30000 ms, the one its suite states');
    expect(status).toBe(1);
  });
});
