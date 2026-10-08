import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
 * 5000 ms and was given `RULE_TIMEOUT_MS = 60_000`.
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
  'ingest-report.test.ts': 5012,
  'typecheck-entrypoint.test.ts': 11_328,
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
 * Strip comments and string literals, so the detector reads code and not prose.
 *
 * The first version of this function matched raw source, and it failed its own
 * test on its own file: this file's *documentation* names `spawnSync`, and its
 * fixtures are string literals containing it. A detector that cannot tell code
 * from a quotation of code would have reported every file that explains the rule
 * as a violator -- the same defect `check-no-unsafe-shell.mjs`'s first version
 * had, found the same way: by testing the instrument on the input that motivated
 * it.
 *
 * Character scanner rather than a regex, because comments and strings nest in the
 * sense that matters here (`// spawnSync` inside a template literal) and a regex
 * cannot track which mode the scan is in.
 */
function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? source.length : nl;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    const ch = source[i]!;
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      out += '""';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** A test file that creates a child process. */
function spawnsAChild(source: string): boolean {
  return /\b(?:spawnSync|execFileSync|execSync|spawn)\s*\(/.test(stripCommentsAndStrings(source));
}

/**
 * Every budget the file states, and how much it is, whichever spelling it uses.
 *
 * There are **three** spellings, and the reader has to know all three. This is
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
 *   3. `it('...', async () => { ... }, 300_000)` -- vitest's positional third
 *      argument, which is what most of `fetch-official.test.ts` uses.
 *
 * The values are returned rather than a boolean, because the caller's real
 * question is not "is there a budget" but "is the budget larger than the default".
 */
function statedBudgets(source: string): number[] {
  const values: number[] = [];
  // Both patterns run against the stripped source.
  //
  // The first version of this function matched the named constant against the
  // *raw* source, on the reasoning that the name is what carries the justifying
  // comment. That was wrong, and the file's own test caught it on the first run:
  // `// const OLD_TIMEOUT_MS = 90_000;` was read as a 90 s budget. The comment is
  // where a budget is *explained*; the declaration is where it is *stated*, and a
  // declaration cannot live inside a comment.
  const code = stripCommentsAndStrings(source);
  for (const m of code.matchAll(/(?:const|let)\s+[A-Z_]*TIMEOUT_MS\s*=\s*([0-9_]+)/g)) {
    values.push(Number(m[1]!.replace(/_/g, '')));
  }
  for (const m of code.matchAll(/\{\s*timeout:\s*([0-9_]+)\s*\}/g)) {
    values.push(Number(m[1]!.replace(/_/g, '')));
  }
  // The positional form. Only a *trailing* number in a call-argument position is
  // a timeout, so this requires a closing paren and a statement end after it --
  // which is why it cannot be folded into the options-object pattern above.
  for (const m of code.matchAll(/,\s*([0-9][0-9_]*)\s*\)\s*;?/g)) {
    const value = Number(m[1]!.replace(/_/g, ''));
    // Multi-digit only, and deliberately above 1000: a bare `, 1)` in this tree
    // is an argument, not a timeout, and a budget is only meaningful as a
    // four-digit millisecond figure or larger.
    if (value >= 1000) values.push(value);
  }
  return values;
}

/** The largest budget the file states anywhere, or 0 if it states none. */
function largestBudget(source: string): number {
  const values = statedBudgets(source);
  return values.length === 0 ? 0 : Math.max(...values);
}

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
    // false red, so each of the three is pinned by name.
    expect(largestBudget("it('x', async () => {\n  await go();\n}, 300_000);")).toBe(300_000);
    expect(largestBudget("it('x', async () => {}, 60_000)")).toBe(60_000);
  });

  it('does not mistake an ordinary numeric argument for a budget', () => {
    // The positional pattern is the loosest of the three, so its failure mode is
    // claiming a budget that is really an argument. A small number is not a
    // timeout in milliseconds and is not read as one.
    expect(largestBudget('const xs = arr.map((x) => f(x, 2));')).toBe(0);
    expect(largestBudget('expect(slice(a, 3)).toEqual(b);')).toBe(0);
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
