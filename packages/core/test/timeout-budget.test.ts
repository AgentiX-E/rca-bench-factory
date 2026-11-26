import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  STATED_BY,
  budgetInForce,
  setConfigBudget,
  statedBudgets,
  stripCommentsAndStrings,
  suiteBudget as gateSuite,
  suiteBudgetOf,
  testOffset,
} from '../../../scripts/budget-readings.mjs';

/**
 * A test file whose standalone cost reaches vitest's default must state a budget
 * larger than it.
 *
 * ## The measurement this file exists for
 *
 * `check-official-roundtrip.test.ts`'s `survives a corpus many times larger than
 * its heap` writes roughly 300 MB of corpus and spawns a child with a 128 MB heap
 * cap. Run three times in isolation it took:
 *
 *     8811 ms   (failed: vitest's default is 5000 ms)
 *     2804 ms
 *     2435 ms
 *
 * A 3.6x spread on one machine, on one test, with no change to the test. The cold
 * pass is over the default budget, so the test's verdict was a function of machine
 * load rather than of the code. Same defect F-43 fixed in
 * `gate-sites-are-proven.test.ts`, whose rule-7 corpus check timed out on CI at
 * 5000 ms and was given a budget of its own -- `RULE_TIMEOUT_MS`, now `120_000` and
 * now applied to that file's whole suite, for the reason the second arm below
 * records.
 *
 * ## The first version of this file was wrong, in both directions
 *
 * It asked a *shape* question -- "does this file spawn a child and not declare a
 * named `*_TIMEOUT_MS` constant?" -- and named 26 offenders. Every one of the
 * following facts is measured, and together they falsify that question:
 *
 *   - It required a budget of `scripts-contract.test.ts` (62 ms in-suite,
 *     **1576 ms** standalone) and `m1-ceiling-probe.test.ts` (**1369 ms**). Neither
 *     is in danger at any parallel width.
 *   - It *exempted* `check-no-absolute-paths.test.ts` (**2112 ms**),
 *     `check-no-unsafe-shell.test.ts` (**1916 ms**) and
 *     `check-no-vendored-data.test.ts` (**1721 ms**) on the written reason "the
 *     child reads a few KB and exits". That reason is checkable, and it is false:
 *     each spawns a scanner that walks the whole repository.
 *   - It named `check-cli-reference.test.ts` as a violator, although every one of
 *     its six `it`s passes an inline `{ timeout: 30_000 }`. At a measured
 *     **10239 ms** standalone the inline budget is correct and the file has never
 *     flaked, so the rule was penalising a working spelling to enforce a style.
 *
 * A gate whose pass condition has no causal relation to the failure it claims to
 * prevent produces a green that is not evidence. That is the class this repository
 * has recorded repeatedly (findings 104-126: a claim that is published and that
 * nothing reads); here the published claim is the gate's own green.
 *
 * ## Why "standalone cost", and not the number the suite reports
 *
 * The two are not the same quantity, and the difference is large:
 *
 *     file                              in-suite (32-way)   standalone
 *     check-cli-reference.test.ts            32438 ms       10239 ms
 *     check-official-roundtrip.test.ts       25908 ms        6413 ms
 *     ingest-report.test.ts                  23929 ms        5012 ms
 *     check-no-absolute-paths.test.ts        12196 ms        2112 ms
 *     scripts-contract.test.ts                  62 ms        1576 ms
 *
 * Under 32 workers and 120 files, the JSON report's `endTime - startTime` is the
 * time a *worker* held the file: it includes queueing for a free worker and
 * contending for CPU with 31 others. Sixteen files start within the first 500 ms;
 * the last one starts at **+25.8 s**. So the in-suite number is a property of the
 * scheduler as much as of the file, and a budget stated against it would be a
 * budget for the machine's load.
 *
 * The number vitest's per-test timeout is compared against is the standalone cost,
 * which is why the table below holds standalone measurements.
 *
 * The standalone profile is a property of this repository, not a constant of
 * nature: the harness boots a worker and loads the module graph, which puts a
 * ~1.3 s floor under *every* file (median 1440 ms across 111 files, min 1291 ms).
 * The threshold below is therefore stated as a comparison against the default
 * rather than as an absolute cost, so the rule describes "close to the line" on
 * any machine rather than "slower than this laptop".
 *
 * ## Why the arm is "cost reaches the default", not "spawns a child"
 *
 * Process creation is *why* a test's wall time stops being proportional to its own
 * work, but it is not the thing that times out. `ingest-report.test.ts` is the
 * counterexample that settles it: it spawns **nothing** and is 5012 ms standalone,
 * because it writes and re-reads a large fixture. The first version of this file
 * would not have looked at it at all. The measurement is the arbiter, and the spawn
 * detector has been demoted to a supporting assertion that explains *why* the slow
 * files are slow.
 *
 * ## The file also has a second arm, and it exists because the first one lied
 *
 * Every measurement above is a **file-level** cost, and the table that holds them
 * was silent about the failure that actually happened: CI run `40796343743`
 * reported three tests of `gate-sites-are-proven.test.ts` at over 5000 ms, and the
 * file's standalone cost is 667 ms. The tests cost 4 ms, 50 ms and 44 ms
 * individually, under coverage, measured. They were not slow; the process they ran
 * in was not being scheduled, and the same bytes passed on the next run.
 *
 * A table of per-file costs cannot see that, because the quantity that blew the
 * budget was not the file's cost. What it *could* see, and did not, is where the
 * file wrote the number down: `gate-sites-are-proven.test.ts` had already decided
 * the default was too small -- it declared `30_000` then, and declares more now -- and applied it to one test
 * of thirty-three. The other thirty-two inherited the default, and a stall does
 * not respect test boundaries.
 *
 * So the second arm (`SUITE_BUDGET_MS` below) is about the unit of the budget
 * rather than its size: a file whose tests walk the whole shipped inventory states
 * its budget once, on the suite. That is checkable, it is where the failure was,
 * and its rows carry measurements so a future reader can disagree with them.
 */

/**
 * vitest's default per-test timeout, restated so the rule can compare against it.
 */
const VITEST_DEFAULT_MS = 5000;

/**
 * The measured standalone cost of every test file that is close to the line.
 *
 * These are measurements, not estimates, and they are the reason a file appears
 * here at all. `docs/audit.md` finding 127 records how they were taken: one file
 * per vitest invocation, worst of two passes, because a file's in-suite number is
 * inflated by up to 3.1x by scheduler contention and cannot be used for this
 * decision.
 *
 * The table deliberately holds **only** the files over the default, not all 111.
 * A full profile would be a second copy of the suite that goes stale on every
 * added test; the measured fact this rule needs is which files cross the line, and
 * that set is small and changes rarely. `STANDALONE_MS` is therefore an assertion
 * list, and `the measured table is not empty and every row names a real file`
 * below keeps it from rotting.
 */
const STANDALONE_MS: Readonly<Record<string, number>> = {
  'check-cli-reference.test.ts': 10_239,
  'check-official-roundtrip.test.ts': 6413,
  'check-user-guide.test.ts': 5517,
  'fetch-official.test.ts': 13_212,
  'gate-test-battery-exclusion.test.ts': 5386,
  // Re-measured on a loaded machine: 14 920 ms for the file, against 5012 ms when
  // this table was first taken. The file is the same and its heaviest two tests
  // are the same; what changed is the machine. The number is updated rather than
  // left standing because the rule compares against the default and a stale 5 012
  // would understate how close to the line this file now is -- and it is the file
  // that was observed exceeding a 30 000 ms budget twice in six full-suite runs.
  'ingest-report.test.ts': 14_920,
  'typecheck-entrypoint.test.ts': 11_328,
  // Found by a red run rather than by this table, which is the honest description
  // of how the table is maintained: it can check every row it has and cannot
  // discover a row it does not. A full-suite run of 226 files on a four-CPU quota
  // reported one of this file's eleven tests at `Test timed out in 5000ms`, with
  // every other test in the run passing. Measured: **9.62 s** of test time
  // standalone, worst of three passes, largest single test 2 083 ms.
  'reader-against-backend.test.ts': 9_620,
  // Found by a red run, which is how this table grows: it checks every row it has and
  // cannot discover a row it does not. CI run 42331765380 reported
  // `publishing to a repository through the local transport > carries a deletion and a
  // mode change` at `Test timed out in 5000ms` -- 5 293 ms -- with every other test in the
  // run passing, on a commit that changed documentation only. Measured here: **6.95 s** of
  // test time standalone, worst of three passes (6.23 / 6.57 / 6.95). A push is executed by
  // spawning `git` once per commit, per tree and per blob, so the file is a sum of process
  // starts rather than one slow call.
  'publish.test.ts': 6_950,
};

/**
 * Files measured below the default, kept so the *other* half of the rule has a
 * control: these spawn a child and must nevertheless not be required to state a
 * budget. Without them the rule could be "everything states a budget" and still
 * pass, which is the shape the first version had.
 */
const MEASURED_UNDER_DEFAULT: Readonly<Record<string, number>> = {
  'check-no-absolute-paths.test.ts': 2112,
  'check-no-vendored-data.test.ts': 1721,
  'm1-ceiling-probe.test.ts': 1369,
  'scripts-contract.test.ts': 1576,
};

function testSource(file: string): string {
  // Read through the same path vitest resolved this file from, so the gate and
  // the suite always look at one tree.
  return readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
}

/**
 * The scanner is the gate's, imported rather than copied -- and the copy is why.
 *
 * This file carried its own until v3.105, and the copy is what found the fourth mode:
 * a **regex literal** is a third kind of quotation, so a scanner that did not know it
 * existed read the `'` in `/['"]/` as the start of a string and swallowed everything
 * up to the next matching quote. `gate-sites-are-proven.test.ts` grew such a pattern,
 * and the gate reported that file as stating no suite budget while the file plainly
 * stated one.
 *
 * The copy then drifted. The gate's reader kept the simpler terminator, so a pattern
 * ended at the first slash even inside a character class, and only this copy knew that
 * `/[/"]/` is one token. Two implementations of one documented rule, and the one that
 * runs in CI was the one nobody had repaired: the gate reported a file that states
 * 30 000 ms as stating none. The rule has one home now -- `scripts/check-test-budgets.mjs`
 * -- and this file reads it rather than restating it.
 */

/** A test file that creates a child process. */
function spawnsAChild(source: string): boolean {
  return /\b(?:spawnSync|execFileSync|execSync|spawn)\s*\(/.test(stripCommentsAndStrings(source));
}

/**
 * Every budget the file states, and how much it is, whichever spelling it uses.
 *
 * There are **four** spellings, and the reader has to know all four. This is
 * not a stylistic nicety: the second version of this function knew two, and it
 * consequently reported `fetch-official.test.ts` -- which states `300_000` on its
 * 2 GiB digest test -- as a file with no budget at all. A reader that misses a
 * spelling fails in the direction that produces a false red, and the fix belongs
 * in the reader, not in an exemption.
 *
 *   1. `const FOO_TIMEOUT_MS = 60_000` -- a named constant, the spelling the
 *      files this repository fixed by hand use, because the name is the thing a
 *      comment can justify.
 *   2. `it('...', { timeout: 30_000 }, () => {` -- the options object.
 *   3. `it('...', { timeout: SUITE_BUDGET_MS }, () => {` -- the options object with
 *      the number behind a name, which is how a budget that is stated once for a
 *      whole suite is written.
 *   4. `it('...', async () => { ... }, 300_000)` -- vitest's positional third
 *      argument, which is what most of `fetch-official.test.ts` uses.
 *
 * The values are returned rather than a boolean, because the caller's real
 * question is not "is there a budget" but "is the budget larger than the default".
 */
/**
 * The largest budget the file states anywhere, or 0 if it states none.
 *
 * `statedBudgets` and the suite reader are the gate's, for the reason above. What
 * stays here is the one adapter this file's assertions are written against: the gate
 * answers "no budget" with `undefined`, which is the absence of a number, and these
 * arms compare numbers, where the absence is 0.
 */
function largestBudget(source: string): number {
  const values = statedBudgets(source);
  return values.length === 0 ? 0 : Math.max(...values);
}

/** The suite's budget, or 0 -- the gate returns `undefined` for "states none". */
function suiteBudget(source: string): number {
  return gateSuite(source) ?? 0;
}

/**
 * Files whose cost is a **sum of many waits**, and which therefore must carry
 * their budget on the suite rather than on individual tests.
 *
 * Two shapes reach this table and they are the same fact about budgets. One walks
 * the whole shipped inventory: thirty-three checks over 89 sites, each cheap, none
 * of them the thing that ran out of time. The other starts a server, drives a
 * reader against it and waits for it to stop, eleven times. In both, the number
 * that blew was not any test's cost but the process's, and a budget applied to one
 * test protects that test and leaves the next one written on the default.
 *
 * ## The failure this table answers
 *
 * CI run `40796343743` (commit `700f1cdd4`) failed three tests in
 * `gate-sites-are-proven.test.ts`, each with `Test timed out in 5000ms`:
 *
 *     rule 6 · rejects a site that is both proved and exempt
 *     rule 6 · reports the shipped tree as clean when run through the same function
 *     rule 7 · accepts the shipped tree, so the rule is not merely strict
 *
 * The three are exactly the three that call `pointerRoot()` and validate all 89
 * sites against it. Measured standalone, with coverage on, they take **4 ms**,
 * **50 ms** and **44 ms**; the whole file takes 476 ms of test time. The next run
 * of the same bytes -- `29b4987d9`, which changed only documentation -- was green.
 * A test that costs 50 ms and is reported at 5000 ms was not doing five seconds
 * of work; the process it ran in was not being scheduled.
 *
 * That is why no row in `STANDALONE_MS` could have caught it: the trigger is not
 * the file's cost, and a table of costs answers a question this failure does not
 * ask. The file had *already decided* the default was too small -- it declares
 * `RULE_TIMEOUT_MS = 30_000`, the value at the time -- and applied it to one test of thirty-three. A
 * budget that is applied where a stall happened to be noticed protects that test
 * and leaves the next one written on the default.
 *
 * ## What the row asserts
 *
 * A number, not a boolean, so the row is falsifiable: the suite budget must exist
 * and must exceed the default. `measured` carries the number a future reader
 * needs in order to disagree with the decision rather than re-derive it.
 */
const SUITE_BUDGET_MS: Readonly<Record<string, { measured: string }>> = {
  'background-telemetry.test.ts': {
    measured:
      '364 ms for the check with the budget, 1 344 ms for the file standalone; reported at ' +
      '5002 ms in a full-suite run of 226 files on a four-CPU quota, every test passing. The four ' +
      'checks in that suite each spawn `check-fault-cases.mjs`, so the file is scheduling-sensitive ' +
      'by construction rather than slow',
  },
  'gate-sites-are-proven.test.ts': {
    measured:
      '4 / 50 / 44 ms per test and 476 ms per file standalone under v8 coverage; ' +
      'all three reported over 5000 ms on CI 40796343743, green on 29b4987d9; and four copies ' +
      'run concurrently at v3.83 took 8.22 / 8.32 / 8.33 / 8.22 s each, 69 of 69 passing -- ' +
      'while the sensitivity battery reported one of these tests past its 30,000 ms budget, ' +
      'against a 47,727 ms stall this repository has measured (finding 507). The budget is ' +
      '120,000 now, which is the ceiling the battery gives each claimant run',
  },
  'reader-against-backend.test.ts': {
    measured:
      '9 620 ms for the file standalone (worst of three passes), longest test 2 083 ms and ' +
      'two others at 1 676 ms; one test reported at 5000 ms in a full-suite run of 226 files ' +
      'on a four-CPU quota. Eleven tests, each starting a server and waiting for it to stop, ' +
      'so the file is a sum of waits rather than one slow call',
  },
  'publish.test.ts': {
    measured:
      '6 950 ms for the file standalone, worst of three passes (6 230 / 6 570 / 6 950); one ' +
      'test reported at 5 293 ms on CI run 42331765380 with every other test in the run ' +
      'passing, on a commit that changed documentation only. Every case spawns `git` once per ' +
      'commit, per tree and per blob, so the file is a sum of process starts',
  },
  // The four rows below were found by a **measurement rather than by a red run**, which is
  // the first time this table grew that way. v3.89 ran the whole suite at 2, 4, 6 and 8
  // workers, twice each, with the per-test durations written to vitest's own JSON report;
  // the four files here are the ones that reached 2 000 ms at some width and stated no
  // budget at all. Two of them were red at 6 and 8 workers, and the durations the report
  // holds for those two are *larger* than the 5 000 ms they were given -- 9 876 and
  // 10 521 ms -- because a synchronous test cannot be interrupted by a timer: the timeout
  // fires when the loop turns, which is after the work has finished. That is why the
  // verdict says "timed out" and the measurement says ten seconds, and why the number in
  // the report is the one that can be compared with a budget.
  'derive-gate-sites-tally.test.ts': {
    measured:
      '2 710 / 2 628 / 2 705 ms at 2 workers, 2 837 / 3 528 / 3 364 at 4, 4 700 / 5 449 at 6 ' +
      '(green once, `Test timed out in 5000ms` once), 7 597 / 9 876 at 8 (red twice). Parses all ' +
      '89 shipped scripts twice inside the test process, so its cost follows the tree and not the test',
  },
  'derive-gate-sites-throws.test.ts': {
    measured:
      '2 834 / 2 561 / 2 542 ms at 2 workers, 3 327 / 3 722 / 3 406 at 4, 4 301 / 4 718 at 6 ' +
      '(94% of the default), 9 493 / 10 521 at 8 (red twice). Two tests here read every shipped ' +
      'script, so a budget on either of them would leave the third one somebody adds on the default',
  },
  'derive-gate-sites-annotations.test.ts': {
    measured:
      '838 / 860 / 887 ms at 2 workers, 1 334 / 1 379 / 1 154 at 4, 1 810 / 1 902 at 6, ' +
      '2 921 / 2 666 at 8 (58% of the default, never red). It runs the same gate over the same tree ' +
      'as the two rows above, and it is the row that says the table is about the shape rather than the history',
  },
  'check-aggregate-tables.test.ts': {
    measured:
      '1 509 / 1 223 / 1 229 ms at 2 workers, 1 274 / 1 460 / 1 260 at 4, 2 300 / 2 617 at 6, ' +
      '2 709 / 3 135 at 8 (63% of the default, never red). Every test spawns the gate and one of ' +
      'them writes a 4 500 000-cell corpus, so the file is a sum of process starts plus one large write',
  },
};

describe('the suite · a file whose cost reaches the default states a larger budget', () => {
  it('the measured table is not empty and every row names a real file', () => {
    // Two directions at once. A full table of rows for files that no longer exist
    // would exempt nothing while looking like work, and an empty table would turn
    // every assertion below into a statement about nothing.
    const rows = Object.entries(STANDALONE_MS);
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const [file] of rows) {
      expect(testSource(file).length, `${file} is measured but is empty`).toBeGreaterThan(0);
    }
  });

  it('every file measured over the default states a budget larger than it', () => {
    const offenders: string[] = [];
    for (const [file, cost] of Object.entries(STANDALONE_MS)) {
      if (cost <= VITEST_DEFAULT_MS) continue;
      if (largestBudget(testSource(file)) <= VITEST_DEFAULT_MS) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('does not require a budget of a file that is comfortably inside the default', () => {
    // The half of the rule the first version got wrong in the other direction.
    // Both controls spawn a child and are nowhere near the line; requiring a
    // budget of them would be noise wearing a rule's clothes. They are named
    // rather than counted, so the assertion is about those files.
    for (const [file, cost] of Object.entries(MEASURED_UNDER_DEFAULT)) {
      expect(cost, `${file} must be measured under the default`).toBeLessThan(VITEST_DEFAULT_MS);
      expect(
        spawnsAChild(testSource(file)),
        `${file} is a control because it spawns, and it no longer does`,
      ).toBe(true);
    }
    // And the table is not allowed to become a list of one.
    expect(Object.keys(MEASURED_UNDER_DEFAULT).length).toBeGreaterThanOrEqual(4);
  });

  it('the rule fires on an unguarded file, so it is not vacuous', () => {
    // This assertion used to read the real tree and demand that a file over the
    // default still had no budget -- when three did, that was a useful statement
    // about the work remaining. All three have since been given budgets, so the
    // assertion now has to prove the same thing a different way: by running the
    // rule's own predicate against inputs where it must fire and must not.
    //
    // Asserting "some file in the table is unguarded" instead would have made
    // this test *fail when the last defect was fixed*, which is a test that
    // punishes the fix. The question worth asking is whether the rule can still
    // distinguish the two cases at all.
    const slowAndSilent = (source: string, cost: number): boolean =>
      cost > VITEST_DEFAULT_MS && largestBudget(source) <= VITEST_DEFAULT_MS;

    expect(
      slowAndSilent("it('x', async () => {});", 6000),
      'a file over the default with no budget must be caught',
    ).toBe(true);
    expect(
      slowAndSilent("it('x', async () => {}, 60_000);", 6000),
      'a file over the default with a budget must not be',
    ).toBe(false);
    expect(
      slowAndSilent("it('x', async () => {});", 4000),
      'a file under the default is never required to state one',
    ).toBe(false);

    // And the production of that predicate over the real table is empty, which
    // is the state all three fixes were for. If a future edit removes a budget
    // this fails and names the file, rather than passing because the predicate
    // was never called.
    const unguarded = Object.keys(STANDALONE_MS).filter((f) =>
      slowAndSilent(testSource(f), STANDALONE_MS[f]!),
    );
    expect(unguarded).toEqual([]);
  });

  it('names the file that the shape rule could not have seen at all', () => {
    // `ingest-report` is the counterexample that forced the trigger to be cost
    // rather than "spawns a child": it spawns nothing and still reaches the
    // default. Asserted as a name, because this single row is the whole argument
    // for the rule's current shape.
    expect(spawnsAChild(testSource('ingest-report.test.ts'))).toBe(false);
    expect(STANDALONE_MS['ingest-report.test.ts']).toBeGreaterThan(VITEST_DEFAULT_MS);
  });

  it('the budget a file states is larger than the default, wherever it states it', () => {
    // A declared budget of 5000 would satisfy the rule's letter and change
    // nothing. Where a file states a budget at all, the number has to be a budget
    // and not a restatement of the default it is failing.
    let checked = 0;
    for (const file of Object.keys(STANDALONE_MS)) {
      const largest = largestBudget(testSource(file));
      if (largest === 0) continue;
      expect(largest, `${file}'s stated budget is ${largest}`).toBeGreaterThan(VITEST_DEFAULT_MS);
      checked += 1;
    }
    expect(checked, 'some measured file states a budget, or this checked nothing').toBeGreaterThan(
      0,
    );
  });

  it('does not measure itself, and needs no budget', () => {
    // A gate that quietly exempts itself is not a gate. This one is absent from
    // its own tables, and that is asserted rather than assumed.
    expect(STANDALONE_MS['timeout-budget.test.ts']).toBeUndefined();
    expect(MEASURED_UNDER_DEFAULT['timeout-budget.test.ts']).toBeUndefined();
    expect(spawnsAChild(testSource('timeout-budget.test.ts'))).toBe(false);
  });
});

describe('the suite budget · a file that walks the inventory states one for the whole file', () => {
  it('every row names a real file, a measurement, and a budget larger than the default', () => {
    const rows = Object.entries(SUITE_BUDGET_MS);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const [file, row] of rows) {
      expect(testSource(file).length, `${file} is listed but is empty`).toBeGreaterThan(0);
      // A row with no measurement is an opinion with a filename attached. The
      // length bound is crude on purpose: it refuses a shrug, not a style.
      expect(row.measured.length, `${file}'s row states no measurement`).toBeGreaterThan(80);
      const budget = suiteBudget(testSource(file));
      expect(budget, `${file} states no suite budget, only per-test ones`).toBeGreaterThan(
        VITEST_DEFAULT_MS,
      );
    }
  });

  it('reads a suite budget stated as a named constant, and as a literal', () => {
    // Both spellings the shipped file could use. The named one is what the file
    // uses, because the name is what its comment justifies.
    expect(suiteBudget("const T_MS = 30_000;\ndescribe('x', { timeout: T_MS }, () => {});")).toBe(
      30_000,
    );
    expect(suiteBudget("describe('x', { timeout: 30_000 }, () => {});")).toBe(30_000);
  });

  it('does not read a per-test budget as a suite budget', () => {
    // The shape that failed on CI, as a fixture: a file that applies its budget
    // test by test and leaves the rest on the default. If this returned a number,
    // the row above would pass for a file that has the defect it exists to catch.
    expect(suiteBudget("const T_MS = 30_000;\nit('x', { timeout: T_MS }, () => {});")).toBe(0);
    expect(suiteBudget('it("x", async () => {}, 300_000);')).toBe(0);
  });

  it('does not read a budget out of a comment, and does not resolve an unknown name', () => {
    expect(suiteBudget("// describe('x', { timeout: 30_000 }, () => {});\n")).toBe(0);
    expect(suiteBudget("describe('x', { timeout: UNDECLARED_MS }, () => {});")).toBe(0);
  });

  it('reads the suite budget in a file whose code holds a regex with a quote in it', () => {
    // The false red that added the fourth mode to the scanner. `gate-sites-are-proven.
    // test.ts` grows `/['"]/` -- a pattern accepting either kind of quotation -- and the
    // scanner treated the `'` inside it as the start of a string, swallowed everything
    // up to the next matching quote, and reported that file as stating no suite budget
    // while its suite stated one. A gate that answers "no" to a file that said yes is
    // the failure mode this whole file is about, so the fixture is the shape that broke
    // it and not a tidied version of that shape.
    const source = [
      "const T_MS = 30_000;",
      "const quoted = /['\"]/g.test(name);",
      "const other = /[/'\"]/.test(text);",
      "describe('suite', { timeout: T_MS }, () => {});",
      '',
    ].join('\n');
    expect(suiteBudget(source)).toBe(30_000);
  });

  it('still divides, and still reads a pattern that follows a keyword', () => {
    // The lookbehind has to be right in both directions. A scanner that called every
    // `/` a pattern would swallow the rest of a file that divides, which is the same
    // defect pointing the other way -- and `return /re/` is the one place where the
    // character before the slash says "divide" and the token before it says "pattern".
    expect(suiteBudget('const half = total / 2;\ndescribe("x", { timeout: 30_000 }, () => {});')).toBe(
      30_000,
    );
    expect(suiteBudget('const re = /abc/;\ndescribe("x", { timeout: 30_000 }, () => {});')).toBe(30_000);
    expect(largestBudget('function f() { return /a/.test(x); }\n')).toBe(0);
  });
});

describe('the reader · it finds every spelling of a budget and only those', () => {
  it('reads a named constant', () => {
    expect(largestBudget('const BULK_TIMEOUT_MS = 60_000;\n')).toBe(60_000);
  });

  it('reads an inline per-test budget', () => {
    // The spelling the first version rejected. `check-cli-reference.test.ts`
    // states its budget six times this way and every one of them works.
    expect(largestBudget("it('x', { timeout: 30_000 }, () => {});")).toBe(30_000);
  });

  it('reads a positional third-argument budget', () => {
    // The third spelling, and the one whose absence made this gate report a
    // guarded file as unguarded: `fetch-official.test.ts` states `300_000` this
    // way on its 2 GiB digest test. A reader that misses a spelling produces a
    // false red, so each of the four is pinned by name.
    expect(largestBudget("it('x', async () => {\n  await go();\n}, 300_000);")).toBe(300_000);
    expect(largestBudget("it('x', async () => {}, 60_000)")).toBe(60_000);
  });

  it('resolves an options object whose number is behind a name', () => {
    // The fourth spelling, and the second false red this reader produced:
    // `reader-against-backend.test.ts` states `{ timeout: SUITE_BUDGET_MS }` on its
    // suite, and a reader that knew only literals reported it as a file with no
    // budget -- then named it a violator for doing exactly what the rule asks.
    expect(
      largestBudget("const SUITE_BUDGET_MS = 30_000;\ndescribe('x', { timeout: SUITE_BUDGET_MS }, () => {});"),
    ).toBe(30_000);
    // A name that resolves to nothing is not a budget. Guessing `5 000` or the
    // default here would make the reader's silence indistinguishable from a pass.
    expect(largestBudget("describe('x', { timeout: FROM_ANOTHER_FILE }, () => {});")).toBe(0);
  });

  it('does not mistake an ordinary numeric argument for a budget', () => {
    // The positional pattern is the loosest of the three, so its failure mode is
    // claiming a budget that is really an argument.
    //
    // The first version of this test used `f(x, 2)` and `slice(a, 3)` and passed for a
    // reason it did not state: the pattern dropped every number under a thousand, so
    // the only arguments it could have invented a budget from were the four-digit ones
    // -- and `buildAnthropicRequest('p', 'claude-3-opus-latest', 8192)` is exactly that.
    // Ten files in this tree were read as stating a budget they never wrote, and
    // `gen-rcaeval-cases.test.ts` was held to **1 700 000 000 ms**. None of it showed,
    // because every invented number is larger than the slowest test beside it.
    expect(largestBudget('const xs = arr.map((x) => f(x, 2));')).toBe(0);
    expect(largestBudget('expect(slice(a, 3)).toEqual(b);')).toBe(0);
    expect(largestBudget("const req = build('p', 'claude-3-opus-latest', 8192);")).toBe(0);
    expect(largestBudget('const state = Math.imul(seed, 1664525);')).toBe(0);
  });

  it('reads both, and reports the larger, when a file states both', () => {
    const source = "const RULE_TIMEOUT_MS = 20_000;\nit('x', { timeout: 30_000 }, () => {});";
    expect(largestBudget(source)).toBe(30_000);
  });

  it('reports no budget for a file that states none', () => {
    expect(largestBudget("it('x', () => {});")).toBe(0);
  });

  it('does not read a budget out of a comment or a string', () => {
    // The same defect `spawnsAChild`'s first version had, and the reason both
    // readers strip before matching: this file explains the rule in prose and
    // pins the spellings in string literals.
    expect(largestBudget('// const OLD_TIMEOUT_MS = 90_000;\n')).toBe(0);
    expect(largestBudget("const s = 'const X_TIMEOUT_MS = 90_000';")).toBe(0);
  });

  it('finds each spawn spelling and ignores a comment that names one', () => {
    for (const call of ['spawnSync(', 'execFileSync(', 'execSync(', 'spawn(']) {
      expect(spawnsAChild(`import { x } from 'y';\n${call}`), call).toBe(true);
    }
    expect(spawnsAChild('// the old version used spawnSync( here')).toBe(false);
    expect(spawnsAChild("const note = 'spawnSync(';")).toBe(false);
  });

  it('does not treat an import as a call', () => {
    // The first version of this test asserted the opposite, and the detector was
    // right: importing a name is not calling it. Kept as a pair with the positive
    // case, because the detector being right and the test being wrong is exactly
    // the kind of disagreement that has to be resolved in the detector's favour
    // rather than by editing until the test passes.
    expect(spawnsAChild("import { spawnSync } from 'node:child_process';")).toBe(false);
  });
});

/**
 * The third arm: a budget stated on one test says nothing about the other forty-two.
 *
 * ## What broke, and why the first two arms could not see it
 *
 * A full-suite run of 239 files on this machine reported
 * `fetch-official.test.ts > does not unpack an asset that is not an archive` at
 * `Test timed out in 5000ms`, with the file's other forty-two tests passing. The file is
 * in `STANDALONE_MS` at 13 212 ms, and the first arm passed: `largestBudget` found a
 * `120_000` on one of its tests and stopped asking.
 *
 * That is the arm's own subject, read one level too coarsely. Its rule is "a file whose
 * cost reaches the default states a budget larger than it" -- but the quantity that times
 * out belongs to a **test**, and a file states its budget on whichever call happens to
 * carry one. `fetch-official.test.ts` states seventeen budgets on forty-three tests and
 * every added test inherits the default: an invariant that gets weaker with each test
 * written, which is the opposite of what a budget is for.
 *
 * Seven of the nine measured files were in that state, and none of them had been seen to
 * fail: the rule was satisfied by one budgeted test in each. `publish.test.ts` and
 * `reader-against-backend.test.ts` state a budget on every top-level suite and were the
 * two that could not produce this failure at all.
 *
 * ## What the arm requires
 *
 * For a file in `STANDALONE_MS` above the default, **every top-level `describe` / `it` /
 * `test` carries a `timeout`**. A suite budget covers every test inside it, including the
 * ones not written yet; a per-test budget covers that test. A file with neither is exactly
 * the file that will time out on a loaded machine, and the measurement needed to notice it
 * is already in the table.
 *
 * The scan is by call site, not by budget count, because the two quantities differ in the
 * direction that failed. A budget anywhere is a number; a budget on **each** call is a
 * promise.
 */
function unbudgetedTopLevel(source: string): string[] {
  const code = stripCommentsAndStrings(source);
  const lines = code.split('\n');
  const out: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    // Top-level only: a nested call is indented, and its budget is the suite's business.
    const call = /^(describe|it|test)\(/.exec(lines[index] ?? '');
    if (call === null) continue;
    // The head runs to the arrow. A head split across lines is joined, because a spelling
    // this reader cannot follow is a spelling it would report as missing.
    let head = lines[index] ?? '';
    for (let more = index; !head.includes('=>') && more - index < 5 && more + 1 < lines.length; more += 1) {
      head += ` ${lines[more + 1] ?? ''}`;
    }
    if (!/\btimeout:/.test(head)) out.push(`${call[1]} at line ${String(index + 1)}`);
  }
  return out;
}

describe('the per-call budget · a file over the default states one on every top-level call', () => {
  it('every measured file above the default budgets each of its top-level suites', () => {
    const offenders: string[] = [];
    for (const [file, cost] of Object.entries(STANDALONE_MS)) {
      if (cost <= VITEST_DEFAULT_MS) continue;
      const bare = unbudgetedTopLevel(testSource(file));
      if (bare.length > 0) offenders.push(`${file} (${cost} ms): ${bare.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('reads a suite budget and an inline test budget alike, and names the calls that have neither', () => {
    // Non-vacuity in both directions: the shape that failed, and the two shapes that pass.
    const mixed = [
      "describe('a', { timeout: T }, () => {",
      "  it('one', () => {});",
      '});',
      "describe('b', { timeout: T }, () => {});",
      "it('two', { timeout: 30_000 }, () => {});",
      "it('three', () => {});",
    ].join('\n');
    expect(unbudgetedTopLevel(mixed)).toEqual(["it at line 6"]);
    expect(unbudgetedTopLevel("describe('a', { timeout: 30_000 }, () => {});")).toEqual([]);
  });

  it('does not read a budget out of a comment, and joins a head split across lines', () => {
    expect(unbudgetedTopLevel("// it('x', { timeout: 30_000 }, () => {});\nit('x', () => {});")).toEqual(['it at line 2']);
    expect(unbudgetedTopLevel("describe(\n  'x',\n  { timeout: 30_000 },\n  () => {}\n);")).toEqual([]);
  });

  it('does not look at a nested suite, whose budget belongs to the file', () => {
    // The nested call is indented, and a file that budgets its top-level suites has
    // covered this one: requiring a budget at every depth would be a rule about spelling.
    expect(unbudgetedTopLevel("describe('a', { timeout: T }, () => {\n  describe('b', () => {});\n});")).toEqual([]);
  });
});

/**
 * Which clock a test is actually given, and the four answers there are.
 *
 * ## Why the function, when a gate already spawns over it
 *
 * `budgetInForce` is the one place where the three readings above are put in order: the
 * test's own, then its suite's, then the file's largest number, then "none". Its reader in
 * production is `check-test-budgets.mjs`, and that gate *is* spawned over fixture trees --
 * so the chain is entered, and the exit it takes is reported in the sentence it prints.
 * What a spawn cannot give is the arm on its own: the same fixture that reaches a suite
 * budget can be read as reaching the largest number if the suite reader breaks, and the
 * only difference is a number in a printed sentence that the fixture was written to match.
 *
 * The four cases below are therefore stated against the function, each with the source a
 * reader would have to argue with. They are also the reason `SPAWN_ONLY` lost this entry:
 * a reason saying "a test that called this function would leave the gate unread" was true
 * of the gate and false of this function's four exits, and the table was keyed by the
 * second thing while written about the first.
 */
describe('the budget in force · the test, its suite, the file, or nothing, in that order', () => {
  /** One suite that states 40 000, one test that states 120 000, one test that states nothing. */
  const ORDERED = [
    "describe('a suite', { timeout: 40_000 }, () => {",
    "  it('slow', () => {}, 120_000);",
    "  it('fast', () => {});",
    '});',
  ].join('\n');

  it('takes the number the test states, over the one its suite states', () => {
    expect(budgetInForce(ORDERED, 'a suite slow')).toEqual({ ms: 120_000, statedBy: 'test' });
    // The pair matters more than the row: both tests live under the same 40 000, so a
    // reader that answered with the suite's number would be right about one of them.
    expect(budgetInForce(ORDERED, 'a suite fast')).toEqual({ ms: 40_000, statedBy: 'suite' });
  });

  it('finds the test by the title a report prints, with either separator', () => {
    // `check-test-budgets.mjs` passes the title vitest's JSON report gives it, which joins
    // the ancestors and the title; both spellings appear in that report across versions.
    expect(budgetInForce(ORDERED, 'a suite > slow')).toEqual({ ms: 120_000, statedBy: 'test' });
    // And a title that is neither: the suffix rule must not match a test it only partly
    // names, or every "slow" test in the file would inherit this one's clock.
    expect(budgetInForce(ORDERED, 'a suite slower')).toEqual({ ms: 40_000, statedBy: 'suite' });
  });

  it('does not look for a test when it is given no title, because "" names the whole file', () => {
    // A report without a title is a report about the file: asking `ownBudget` for `''`
    // would return the first test whose title ends with a space, which is no test at all.
    expect(budgetInForce(ORDERED, '')).toEqual({ ms: 40_000, statedBy: 'suite' });
  });

  it('answers none for a test that states nothing, whatever the file declares elsewhere', () => {
    // A name the file declares is not a clock. `FILE_TIMEOUT_MS` is 30 000 and nothing in
    // this file runs under it: `it('a')` states 20 000 for itself, and `it('b')` -- which
    // the reader can place, since its title is one the source spells -- gets the default.
    // Until v3.159 this answered 30 000 "the largest number the file states" about a test
    // whose verdict the 5 000 ms default decides, which is finding 670's other half.
    const flat = [
      'const FILE_TIMEOUT_MS = 30_000;',
      "it('a', () => {}, 20_000);",
      "it('b', () => {});",
    ].join('\n');
    expect(budgetInForce(flat, 'b')).toEqual({ ms: 0, statedBy: 'none' });
  });

  it('takes the largest number a suite-less file states, when the title cannot be placed', () => {
    // The arm survives for the case the position is unknown -- `it.each` prints a title the
    // source does not spell -- and there the largest number is the best a reader without a
    // position can do. Largest rather than first: a reader that answered 20 000 would be
    // telling a test it has less room than the file ever asked for, the direction that
    // produces a red for a file that is fine.
    const flat = [
      'const FILE_TIMEOUT_MS = 30_000;',
      "describe.each([1])('a suite', () => {",
      "  it.each([1])('b%s', () => {});",
      '});',
    ].join('\n');
    expect(budgetInForce(flat, 'a suite b1')).toEqual({ ms: 30_000, statedBy: 'largest' });
  });

  it('answers none rather than zero, because zero is a budget and this is its absence', () => {
    // The discovery rule reads `statedBy: 'none'`; it does not read `ms`. Writing `0` there
    // would be a number the fraction rule could divide by, which is the shape
    // `suiteBudget` already refuses for the same reason.
    expect(budgetInForce("it('a', () => {});", 'a')).toEqual({ ms: 0, statedBy: 'none' });
  });

  it('names every arm the gate prints, and the one it answers itself', () => {
    // `STATED_BY[inForce.statedBy]` is indexed without a guard in the gate, so an arm added
    // here and not there prints `undefined ms, undefined, which is 0.94 of it`. The three
    // keys are compared as a set rather than one by one, because the defect is a *new* arm
    // whose sentence was never written.
    // Four keys since v3.159: the fifth spelling a file can use is a clock no suite and
    // no test states, and finding 671 is what a table without it cost -- the gate said
    // "states no budget" about a file that had set one through `vi.setConfig`.
    expect(Object.keys(STATED_BY).sort()).toEqual(['file', 'largest', 'suite', 'test']);
    // The fourth arm is deliberately absent, and that is only safe while the gate answers it
    // before the index. This assertion is the join: the table may lose a row it does not
    // need only as long as the branch that says the sentence exists, and it is written as a
    // read of the gate because a reader of only this file cannot otherwise see the pairing.
    const gate = readFileSync(new URL('../../../scripts/check-test-budgets.mjs', import.meta.url), 'utf8');
    expect(
      /inForce\.statedBy === 'none'[\s\S]{0,600}?continue;/.test(gate),
      'STATED_BY has no sentence for a file that states no budget, so the gate must write its own ' +
        'before it indexes the table -- and it does not',
    ).toBe(true);
  });
});

/**
 * The suite a test is written in, which is not the first suite in the file.
 *
 * ## The file this was found in
 *
 * `gate-steps.test.ts` states `{ timeout: 4_000 }` on **one** of its twenty-two
 * top-level suites, and its slowest case lives in another one. v3.158's reader answered
 * `{ ms: 4_000, statedBy: 'suite' }` for that case -- "the one its suite states" -- when
 * the suite it is written in states nothing and the clock deciding its verdict is
 * vitest's 5 000 ms default. The number was wrong in the direction that hides: a file
 * with `describe('a big', { timeout: 120_000 })` followed by an unbudgeted
 * `describe('b')` excused every test in `b` with `half of 120 000`, and the floor rule
 * could not fire either, because the file "stated a budget".
 *
 * ## Why the fixtures are nested as well as adjacent
 *
 * A resolver that read the *last* number before the test, or the file's largest, would
 * pass the adjacency case and fail the nested one. Both are written: the number is the
 * innermost enclosing suite's, because that is what a nested suite with no number of its
 * own inherits, and a `describe` that states nothing is not a boundary.
 */
describe('the suite a test is written in, and the suite that merely comes first', () => {
  /** One suite that states 120 000, and a sibling that states nothing. */
  const SIBLINGS = [
    "describe('a big suite', { timeout: 120_000 }, () => {",
    "  it('slow', () => {});",
    '});',
    "describe('an unbudgeted suite', () => {",
    "  it('unwatched', () => {});",
    '});',
  ].join('\n');

  it('measures a test in a sibling suite by that suite, not by the one before it', () => {
    // The pair is the finding: under v3.158 both of these answered 120 000.
    expect(budgetInForce(SIBLINGS, 'a big suite slow')).toEqual({ ms: 120_000, statedBy: 'suite' });
    expect(budgetInForce(SIBLINGS, 'an unbudgeted suite unwatched')).toEqual({ ms: 0, statedBy: 'none' });
  });

  it('inherits from the nearest ancestor that states a number, which is what vitest does', () => {
    // Two tests of one title, and the chain a report prints is the only thing that says
    // which is which: this is the case a suffix match on the title alone gets wrong.
    const nested = [
      "describe('outer', { timeout: 60_000 }, () => {",
      "  describe('inner', () => {",
      "    it('a test', () => {});",
      '  });',
      "  describe('tighter', { timeout: 10_000 }, () => {",
      "    it('a test', () => {});",
      '  });',
      '});',
    ].join('\n');
    expect(budgetInForce(nested, 'outer inner a test')).toEqual({ ms: 60_000, statedBy: 'suite' });
    expect(budgetInForce(nested, 'outer tighter a test')).toEqual({ ms: 10_000, statedBy: 'suite' });
    // And a title that is not one of the two, but ends the same way: `a test` is a suffix
    // of `another a test`, so the chain has to refuse it rather than take it.
    expect(testOffset(nested, 'nobody a test')).toBeUndefined();
  });

  it('answers the innermost suite that states a number, which is the clock vitest inherits', () => {
    // The resolver on its own, so the reader's answer can be argued with where it is
    // computed rather than through a sentence: a suite that states nothing is not a
    // boundary, and the boundary is the nearest ancestor that does state one.
    const nested = [
      "describe('outer', { timeout: 60_000 }, () => {",
      "  describe('inner', () => {",
      "    it('a test', () => {});",
      '  });',
      '});',
    ].join('\n');
    const at = testOffset(nested, 'outer inner a test');
    expect(at).toBeTypeOf('number');
    expect(suiteBudgetOf(nested, at)).toBe(60_000);
    // An offset outside every `describe` -- the top level of a file -- has no suite to
    // inherit from, and `undefined` says that rather than 0, which is a clock.
    expect(suiteBudgetOf(nested, 0)).toBeUndefined();
  });

  it('does not take a number out of the body of a suite, only out of its arguments', () => {
    // `spawnSync(…, { timeout: RUN_MS })` inside a body is a child's clock. Reading it as
    // the suite's is the flattering direction, and `typecheck-entrypoint.test.ts` is the
    // file that shape belongs to.
    const source = [
      'const RUN_MS = 180_000;',
      "describe('a suite', () => {",
      '  spawnSync("node", [], { timeout: RUN_MS });',
      "  it('a test', () => {});",
      '});',
    ].join('\n');
    expect(budgetInForce(source, 'a suite a test')).toEqual({ ms: 0, statedBy: 'none' });
  });

  it('reads the suite-wide default a file sets through the vi API, which was the fifth spelling', () => {
    // `site-proofs.mjs` has read this spelling since the battery needed it, and this
    // reader did not, so a file whose only declaration is this one read as "states no
    // budget" here and as 15 000 ms there -- finding 671.
    const source = ["vi.setConfig({ testTimeout: 15_000 });", "it('a test', () => {});"].join('\n');
    expect(budgetInForce(source, 'a test')).toEqual({ ms: 15_000, statedBy: 'file' });
    // The arm is not a guess about the largest number: a file that sets 15 000 and then
    // states 60 000 on one test answers 15 000 for a test outside that one, because
    // 60 000 was never the clock of anything else in the file.
    const both = [
      'vi.setConfig({ testTimeout: 15_000 });',
      "it('a heavy test', () => {}, 60_000);",
      "it('a test', () => {});",
    ].join('\n');
    expect(budgetInForce(both, 'a test')).toEqual({ ms: 15_000, statedBy: 'file' });
    expect(setConfigBudget('const T_MS = 9_000;\nvi.setConfig({ testTimeout: T_MS });')).toBe(9_000);
    // A name the file does not declare is not a number, and 0 here would be a clock.
    expect(setConfigBudget('vi.setConfig({ testTimeout: UNDECLARED_MS });')).toBeUndefined();
  });

  it('answers nothing for a title it cannot place, and falls back to the file', () => {
    // `it.each` prints a title the source does not spell, so there is no position to
    // resolve. The fallback is the file's first suite number, which is what the gate has
    // always printed as "the one its suite states" -- a reader's guess, named as one.
    const formatted = [
      "describe('a suite', { timeout: 40_000 }, () => {",
      "  it('rejects %s', () => {});",
      '});',
    ].join('\n');
    expect(testOffset(formatted, 'a suite rejects one')).toBeUndefined();
    expect(budgetInForce(formatted, 'a suite rejects one')).toEqual({ ms: 40_000, statedBy: 'suite' });
  });
});
