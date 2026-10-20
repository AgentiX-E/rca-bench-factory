import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { progressCorpus } from '../../../scripts/docs-corpus.mjs';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement
 * in either direction: declaring one that is never spawned is as much a
 * violation as spawning one that is not declared. The declaration is needed
 * because several of these files drive a gate through a local `run(script)`
 * helper or a data table, so the script name never appears in a spawn's own
 * argument list and cannot be inferred from one.
 */
const DRIVES = [
  'scripts/check-doc-counts.mjs',
];


/**
 * `scripts/check-doc-counts.mjs` -- the guard that holds the test counts in
 * `docs/progress.md` to the scopes they claim.
 *
 * The failure this guard exists for is recorded as finding 123, and it was found
 * by reading the file rather than by any check. Two rows carried the same label
 * with different meanings:
 *
 *   | test suite | **111 files, 3231 tests passed** |   <- every workspace
 *   | test suite | **108 files, 3059 tests passed** |   <- packages/core only
 *
 * `108 files, 3059 tests` is true of core and false of the repository, so a
 * reader had no way to tell which scope either number described -- and the first
 * was one test stale besides (`pnpm test` reports 111 files / 3232 tests).
 * Nothing failed, because nothing read those numbers.
 *
 * The assertions below are therefore about the *rule*, not about today's counts.
 * The fixture document is written by the test and the live measurement is passed
 * in, so this file does not run the suite inside the suite, and it does not fail
 * every time a test is added -- which would make it a nuisance rather than a
 * check.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The shipped document, as one text.
 *
 * `docs/progress.md` is an index and four volumes since finding 197, and the
 * current-state rows live in the volume that was being written when each scope was
 * introduced. A test that read the index alone would find no rows and fail -- which
 * is the good outcome; the bad one, a test that found *one* row and passed, is why
 * this reads the corpus.
 */
function corpusText(): string {
  return progressCorpus().map((file) => file.text).join('\n');
}
const SCRIPT = resolve(ROOT, 'scripts', 'check-doc-counts.mjs');

/**
 * The committed measurement, read rather than copied.
 *
 * `golden-master/doc-counts.json` is the one account of how large the suite is,
 * and `pnpm docs:counts:check` is what keeps it current. This file used to embed
 * its own copy of the same three numbers so the suite would not have to spawn
 * `measure-doc-counts.mjs` -- which is right, since that script runs the whole
 * suite three times and would recurse.
 *
 * The copy was the problem. The guard's third rule is an equality between the
 * published rows and a live measurement, so adding a test moved the real counts
 * and left this constant stale, and the failure surfaced as a confusing complaint
 * about the guard rather than about the constant. Worse, retaking the measurement
 * to fix it changed the counts again, because updating *this* file is itself a
 * change to the suite: one round of that is an annoyance, and it does not
 * converge.
 *
 * Reading the committed file breaks the loop. It cannot go stale, because
 * `pnpm docs:counts:check` fails when it does, and the measurement it holds is
 * taken by a script that runs outside the suite.
 */
const MEASURED = readFileSync(resolve(ROOT, 'golden-master', 'doc-counts.json'), 'utf8').trim();

const dirs: string[] = [];

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/**
 * Run the guard against a document body written to a temp file.
 *
 * `unmeasured` becomes the guard's exemption table for the run. It is passed in
 * rather than reached for, because rule 4's three refusal branches -- a table
 * with no reason, with a reason too short to say anything, and with two entries
 * that share one -- are only reachable if the table can be substituted. A guard
 * whose own exemption list cannot be driven from outside can only be shown to
 * accept the list it ships with.
 */
function run(body: string, unmeasured?: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'doc-counts-'));
  dirs.push(dir);
  const doc = join(dir, 'progress.md');
  writeFileSync(doc, body);
  const argv = [SCRIPT, '--doc', doc, '--measured', MEASURED];
  if (unmeasured !== undefined) argv.push('--unmeasured', JSON.stringify(unmeasured));

  // A spawn that never ran is not a verdict about the guard.
  //
  // `spawnSync` reports `status: null` when the child could not be started, and
  // every assertion below reads `status`, so the failure arrived as "expected
  // null to be 1" -- a complaint about the guard -- in a run where the guard was
  // never invoked. Observed during a whole-suite run under load, green on every
  // run of this file alone; the retry is narrow (a resource error from the
  // kernel) because retrying a real red would be masking it.
  let r = spawnSync('node', argv, { cwd: ROOT, encoding: 'utf8' });
  const failure = (): string | undefined => (r.error as NodeJS.ErrnoException | undefined)?.code;
  if (failure() === 'EAGAIN' || failure() === 'ENOMEM') {
    r = spawnSync('node', argv, { cwd: ROOT, encoding: 'utf8' });
  }
  expect(r.error, `the guard could not be started: ${String(r.error)}`).toBeUndefined();
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const NO_EXCUSES: unknown[] = [];

const HEADER = '### Verified\n\n| gate | result |\n| --- | --- |\n';

describe('check-doc-counts', () => {
  it('accepts a count that names its scope', () => {
    const r = run(`${HEADER}| core test suite | **108 files, 3059 tests passed** |\n`);
    expect(r.out).toContain('check-doc-counts: OK');
    expect(r.code).toBe(0);
  });

  it('accepts the "N passed / M files" shape as well as "N files, M tests"', () => {
    const a = run(`${HEADER}| core tests | **3045 passed / 107 files** |\n`);
    expect(a.code).toBe(0);
    const b = run(`${HEADER}| core tests | **3045 tests / 107 files** |\n`);
    expect(b.code).toBe(0);
  });

  // The defect the guard exists for, in the exact shape it was found.
  it('refuses two rows that share a label but not a scope', () => {
    const r = run(
      `${HEADER}| test suite | **111 files, 3232 tests passed** |\n` +
        `| test suite | **108 files, 3059 tests passed** |\n`,
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('without naming its scope');
    // Both rows are named, not just the first -- a reader must see the clash.
    expect(r.out.match(/without naming its scope/g)).toHaveLength(2);
  });

  it('refuses a bare "test suite" label even when the count is right', () => {
    const r = run(`${HEADER}| test suite | **108 files, 3059 tests passed** |\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('without naming its scope');
  });

  it('refuses a document with no counts at all, rather than passing blind', () => {
    const r = run(`${HEADER}| gates | all clean |\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('no file/test counts found');
  });

  it('refuses more files than tests, which cannot be a suite', () => {
    const r = run(`${HEADER}| core test suite | **999 files, 12 tests passed** |\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('exceeds');
  });

  it('refuses a scope whose test count fell, since a suite that lost tests is a regression', () => {
    const r = run(
      `${HEADER}| core test suite | **108 files, 3059 tests passed** |\n` +
        `| core test suite | **100 files, 2000 tests passed** |\n`,
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('fell from');
  });

  it('refuses a current-state claim that the live suite contradicts', () => {
    const r = run(`${HEADER}| core test suite | **108 files, 9999 tests passed**, as of this commit |\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('but the suite has');
  });

  // A stale-but-plausible count marked as current. Rule 3 is an equality, not a
  // bound: the earlier `row > live` version passed this, and because it passed
  // whether or not the marker was recognised, widening the marker vocabulary
  // disabled the rule outright. The mutation battery found that; this pins it.
  it('refuses a stale count marked as the current state', () => {
    const r = run(`${HEADER}| core test suite | **100 files, 2000 tests passed**, as of this commit |\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('but the suite has');
  });

  // Derived from MEASURED rather than written out. This literal was a third copy
  // of the same number, and measured, it went stale on the next run for the
  // second time -- the same drift the mirror test above exists to catch, in a
  // place that test cannot see because it only reads the constant. Deriving it
  // means there is one copy, and the assertion below stops being about today's
  // number and starts being about the rule: a row matching the live count passes.
  it('accepts a current-state claim that matches the live suite', () => {
    const { files, tests } = (JSON.parse(MEASURED) as Record<string, { files: number; tests: number }>)
      .core!;
    const r = run(
      `${HEADER}| core test suite | **${files} files, ${tests} tests passed**, as of this commit |\n`,
    );
    expect(r.code).toBe(0);
  });

  // The marker vocabulary is deliberately narrow. `unchanged (docs only)` and
  // `one more than Pass 32` both *look* like current-state claims and are not:
  // each compares a pass to its predecessor, so both are historical by
  // construction, and reading them as current made this guard refuse the
  // shipped document. Pinned here so the vocabulary cannot widen silently.
  //
  // The counts below are deliberately *stale* (100/2000 against a live 108/3059).
  // A first draft used the matching 108/3059, and that version was vacuous: it
  // passed whether or not the marker was recognised as current, so widening the
  // vocabulary behind it went undetected. A stale count is what makes the
  // assertion able to fail.
  it('does not read a comparison to a previous pass as a current-state claim', () => {
    const r = run(
      `${HEADER}` +
        `| core test suite | **100 files, 2000 tests passed**, unchanged (docs only) |\n` +
        `| core test suite | **100 files, 2000 tests passed**, one more than Pass 32 |\n`,
    );
    expect(r.code).toBe(0);
  });

  // A dated record is allowed to be smaller than today's count: that is what
  // makes it a record. Only the current-state marker has to match.
  it('allows a dated record to differ from the live count', () => {
    const r = run(`${HEADER}| core test suite | **3000 tests passed / 100 files** |\n`);
    expect(r.code).toBe(0);
  });

  // Non-vacuity: the shipped file must be the thing this guard is about.
  it('passes against the shipped document, so the negatives are not the only reachable state', () => {
    const r = spawnSync('node', [SCRIPT, '--measured', MEASURED], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`;
    expect(out).toContain('check-doc-counts: OK');
    // And it must be reading a non-trivial number of counts, so "OK" cannot mean
    // "found nothing".
    expect(out).toMatch(/OK \((\d+) published count/);
    const n = Number(out.match(/OK \((\d+) published count/)![1]);
    expect(n).toBeGreaterThanOrEqual(5);
  });

  // The non-vacuity test above drives the guard against the shipped document
  // using the committed measurement, and it only means something if those two
  // agree. Before this test existed the agreement was assumed, and when it broke
  // the failure looked like a defect in the guard.
  //
  // Asserted directly here. This does not check the counts are *current* --
  // `pnpm docs:counts:check` does that, against a measurement taken outside the
  // suite -- only that the committed measurement and the document that quotes it
  // say the same thing.
  it('holds the same counts as the shipped document it mirrors', () => {
    const doc = corpusText();
    const live = JSON.parse(MEASURED) as Record<string, { files: number; tests: number }>;

    // Only rows carrying the current-state marker, because those are the only
    // ones the guard compares against MEASURED. Scoping by the marker rather
    // than by row order matters: this file also carries dated records under the
    // same `N files, M tests passed` shape, and an earlier draft of this test
    // matched one of them and reported a disagreement that was not one.
    const claims = [
      ...doc.matchAll(
        /\|\s*`?(\w+)`? test suite\s*\|\s*\*\*(\d+) files, (\d+) tests passed\*\*[^|]*as of this commit/g,
      ),
    ];
    expect(claims.length, 'no current-state rows found; the shape of the document changed').toBeGreaterThanOrEqual(3);

    for (const [, scope, files, tests] of claims) {
      const m = live[scope!];
      expect(m, `the document publishes a '${scope}' row that MEASURED does not cover`).toBeTruthy();
      expect(
        { files: Number(files), tests: Number(tests) },
        `the '${scope}' row in docs/progress.md disagrees with MEASURED in this file; ` +
          `when the suite grows, both must be retaken together`,
      ).toEqual(m);
    }
  });
});

/**
 * The shape surface, which was open.
 *
 * The guard read three shapes. The document published suite counts in more than
 * three, and the difference was invisible for a precise reason: **a shape the
 * reader cannot read is indistinguishable from a shape that is not there**, so
 * every rule above simply did not apply to the rows written in the others.
 *
 * Measured against the shipped document: 88 table rows carry a count-bearing
 * phrase; the three shapes read 25 of them. Among the 63 the reader skipped was
 * this row, in `Pass 26`'s verification table:
 *
 *   | core | 2623 passed (87 files); `src` 100 / 100 / 100 / 100 |
 *
 * `packages/core/test` has never held 87 test files -- checked against every
 * commit in `git log`, not remembered -- while 87 = 84 (core) + 3 (cli) at that
 * moment, and 2623 = 2445 + 173 + 5. The row publishes the whole workspace's
 * count under the label `core`, which is the defect the guard was written for,
 * hiding in the one shape it could not read.
 *
 * So rule 4 closes the surface at the granularity the other rules work at: a row
 * that names a scope must have its count *read*, or the unreadable phrase must be
 * excused in writing. Excuses are keyed on the shape, carry a reason, and the
 * table is validated before it is used, because an exemption list nobody checks
 * is the same blind spot one level in.
 */
describe('check-doc-counts -- the shapes it can read, and the ones it refuses', () => {
  it('reads "N passed (M files)", the shape a pass used to record its own run', () => {
    const r = run(`${HEADER}| core coverage | **2403 passed (82 files)** |\n`);
    expect(r.code).toBe(0);
    expect(r.out).toContain('check-doc-counts: OK');
  });

  // The positive test above cannot tell this shape from the bare one, because the
  // bare shape also makes that row green -- it reads the 2403 and ignores the 82.
  // The mutation battery said so in as many words: deleting the whole shape left
  // the file green. So the file count has to be *used* by a rule before its being
  // read can be observed, and the one rule that uses it is the impossibility of
  // more files than tests.
  it('refuses a parenthesised file count that exceeds the test count', () => {
    const r = run(`${HEADER}| core test suite | **12 passed (999 files)** |\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('exceeds');
  });

  it('reads a bare test count when the row names its scope', () => {
    const r = run(`${HEADER}| core tests | **2512 passed** |\n`);
    expect(r.code).toBe(0);
  });

  // The bare shape is the wording a battery verdict uses as well, and those rows
  // are not suite counts. Gating it on the scope word is what keeps `26 passed`
  // beside `mutation` out of the guard's subject instead of asking it to name a
  // scope it does not have.
  it('leaves a bare test count alone when the row names no scope', () => {
    const r = run(
      `${HEADER}| core tests | **108 files, 3059 tests passed** |\n` + `| mutation | 26 passed |\n`,
    );
    expect(r.code).toBe(0);
  });

  // The shape the guard could not read, in the exact row it could not read it
  // from: core 2623 (87 files) followed later in the file by core 2512. Rule 2
  // is about a suite that lost tests; this row is what that rule was missing.
  it('applies the monotonicity rule to the newly readable shape', () => {
    const r = run(
      `${HEADER}| core | **2623 passed (87 files)** |\n` + `| core tests | **2512 passed** |\n`,
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('fell from');
  });

  // Rule 4. A scope-named row whose count is in a shape nothing reads must fail
  // rather than be skipped, because being skipped is what made the shipped
  // defect survive.
  it('refuses a scope-named row whose count is in a shape it cannot read', () => {
    const r = run(`${HEADER}| core tests | **2512 tests in 87 files** |\n`, NO_EXCUSES);
    expect(r.code).toBe(1);
    expect(r.out).toContain('2512 tests');
    expect(r.out).toContain('cannot read');
  });

  it('accepts an unreadable phrase that is excused in writing', () => {
    const r = run(
      `${HEADER}| core coverage | **217 file x dimension pairs, 0 below 95%** |\n`,
      [{ shape: 'N file x dimension pairs', reason: 'the coverage matrix is a count of file x dimension pairs, which is not a suite count' }],
    );
    expect(r.code).toBe(0);
  });

  it('refuses an excuse with no reason at all', () => {
    const r = run(`${HEADER}| core coverage | **217 file x dimension pairs** |\n`, [
      { shape: 'N file x dimension pairs', reason: '' },
    ]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('reason');
  });

  it('refuses an excuse whose reason is too short to say anything', () => {
    const r = run(`${HEADER}| core coverage | **217 file x dimension pairs** |\n`, [
      { shape: 'N file x dimension pairs', reason: 'coverage' },
    ]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('reason');
  });

  // Two exemptions that read the same way are one exemption written twice, and
  // the second is a shape nobody has actually justified.
  it('refuses two excuses that share one reason', () => {
    const shared = 'the coverage matrix is a count of file x dimension pairs, which is not a suite count';
    const r = run(`${HEADER}| core coverage | **217 file x dimension pairs** |\n`, [
      { shape: 'N file x dimension pairs', reason: shared },
      { shape: 'N file', reason: shared },
    ]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('reason');
  });

  // Prose is out of the subject, and this pins it rather than leaving it to be
  // discovered. The three rules are defined over published rows -- a scope word,
  // a monotonicity order, a current-state marker -- and a sentence in a pass's
  // narration has none of those. The residual is real and is stated in the
  // guard: a stale number narrated in prose still has no reader.
  it('leaves a count narrated in prose alone, since the rules are about rows', () => {
    const r = run(
      `${HEADER}| core tests | **108 files, 3059 tests passed** |\n` +
        `\nThe suite reported 124 files, 3234 tests in total.\n`,
    );
    expect(r.code).toBe(0);
  });

  // Non-vacuity for the new shape: the shipped document must actually use it,
  // otherwise the shape is tested only by fixtures and the guard could stop
  // reading it without any test noticing.
  it('reads the newly supported shape where the shipped document uses it', () => {
    const doc = corpusText();
    const rows = [
      ...doc.matchAll(/\|\s*`?core`?[^|]*\|\s*\*\*(\d+) passed \((\d+) files\)\*\*/g),
    ];
    expect(
      rows.length,
      'the shipped document no longer publishes a "N passed (M files)" row, so this test ' +
        'would pass without the shape being read',
    ).toBeGreaterThan(0);
  });

  // Three assertions added because a mutation battery asked for them: each one is
  // a half of a comparison that no test reached, so the comparison could be
  // weakened to that half and the whole file would stay green.

  // Rule 2 as a bound of the wrong sign. Every existing fixture falls by hundreds
  // of tests, so `row.tests < prev.tests - 1` -- which would let a real one-test
  // regression through -- was indistinguishable from the rule.
  it('refuses a fall of a single test, which a bound of the wrong sign would allow', () => {
    const r = run(
      `${HEADER}| core test suite | **108 files, 3059 tests passed** |\n` +
        `| core test suite | **108 files, 3058 tests passed** |\n`,
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('fell from');
  });

  // Rule 3's file half. The equality was written as `files !== live.files ||
  // tests !== live.tests`, and no fixture ever disagreed on files alone, so the
  // first half could be deleted without a single test failing.
  it('refuses a current-state row whose file count is stale while its test count is right', () => {
    const { tests } = (JSON.parse(MEASURED) as Record<string, { tests: number }>).core!;
    const r = run(`${HEADER}| core test suite | **1 files, ${tests} tests passed**, as of this commit |\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain('but the suite has');
  });

  // The census reads "a number and a unit word", and `passed` is deliberately not
  // one of the units. The reason is a proof rather than a preference: rule 4 only
  // examines rows the reader did *not* read, and an unread row is one where the
  // bare shape did not match, so it contains no `N passed` phrase at all. This
  // row is what makes the boundary observable -- the count is taken up by the
  // bare shape, so rule 4 is never reached, and the row is read as a dated record
  // of core rather than refused.
  //
  // What this test cannot do is discriminate the census vocabulary: the row is
  // read with or without `passed` in the unit list, so it pins the *reading* and
  // the guard's comment carries the proof. Said here rather than left implied,
  // because a test that looks like it pins a vocabulary it cannot see is worse
  // than no test.
  it('reads a "passed" phrase through the bare shape, so the census never has to', () => {
    const r = run(`${HEADER}| core | 2512 passed of a possible 2600 |\n`, NO_EXCUSES);
    expect(r.code).toBe(0);
  });
});
