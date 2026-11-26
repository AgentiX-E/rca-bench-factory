import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { sourcesIn } from '../../../scripts/comment-language.mjs';
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
function run(body: string, unmeasured?: unknown, measured: string | null = MEASURED, present?: 'self') {
  const dir = mkdtempSync(join(tmpdir(), 'doc-counts-'));
  dirs.push(dir);
  const doc = join(dir, 'progress.md');
  writeFileSync(doc, body);
  // `null` means "do not hand the counts in": the guard then falls back to the committed
  // snapshot, which is the read path a developer running `docs:check` takes. Two read paths, two
  // sentences about what was compared, and a test that could only drive one of them would leave
  // the other's sentence unread (`O-110`).
  const argv = measured === null ? [SCRIPT, '--doc', doc] : [SCRIPT, '--doc', doc, '--measured', measured];
  if (unmeasured !== undefined) argv.push('--unmeasured', JSON.stringify(unmeasured));
  // Rule 5 reads documents that speak in the present, which are two real files by default. A test
  // that wants to drive it passes its own fixture as that document; without this, the only way to
  // reach the rule would be to break `docs/acceptance.md`.
  if (present === 'self') argv.push('--present', doc);

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
  // Two shapes of "the guard never ran", and the second one cost a diagnosis.
  //
  // The first is a `spawnSync` error (`EAGAIN`, `ENOMEM`) and was already
  // retried. The second is a child that started and was *killed*: `status: null`
  // with a signal, and no output at all -- a whole-suite run under 32 workers
  // reported three cases in this file as `expected '' to contain
  // 'check-doc-counts: OK'` and `expected +0 to be 1`, i.e. as complaints about
  // the guard, when the guard had produced no verdict whatsoever. Neither shape
  // is a verdict, so both are retried once; a *wrong* verdict is not retried,
  // because retrying a red would be masking it.
  //
  // And a third shape, which cost a whole-suite run: `status: 0` with no output at all. The guard
  // has two exits and prints at both, and its output is written with `writeSync` precisely so the
  // exit cannot truncate it -- so a silent exit 0 cannot be this guard's verdict either, and it is
  // retried once. If the retry is silent too, the assertion below still fails.
  const neverRan = (): boolean =>
    failure() === 'EAGAIN' || failure() === 'ENOMEM' || r.status === null || (r.status === 0 && `${r.stdout}${r.stderr}` === '');
  if (neverRan()) {
    r = spawnSync('node', argv, { cwd: ROOT, encoding: 'utf8' });
  }
  expect(r.error, `the guard could not be started: ${String(r.error)}`).toBeUndefined();
  expect(
    r.status,
    `the guard was killed by ${String(r.signal)} rather than answering: ` +
      `${JSON.stringify({ status: r.status, signal: r.signal, out: `${r.stdout}${r.stderr}`.slice(0, 200) })}`,
  ).not.toBeNull();
  const out = `${r.stdout}${r.stderr}`;
  // This guard has exactly two exits and both print: `... OK (...)` or
  // `... FAILED` followed by the reasons. So "exit 0 and printed nothing" is not
  // a verdict either, and a whole-suite run under load produced three of them in
  // this file -- reported as `expected '' to contain 'check-doc-counts: OK'`, a
  // complaint about the guard rather than about the spawn. Asserting the shape
  // here turns that into a failure that says what actually came back, on the first
  // occurrence, instead of costing another run to interpret.
  expect(
    out.length,
    `the guard exited ${String(r.status)} without printing; every exit prints. ` +
      `${JSON.stringify({ status: r.status, signal: r.signal, error: String(r.error) })}`,
  ).toBeGreaterThan(0);
  return { code: r.status, out };
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

  // The refusal is the only place the vocabulary's *notes* reach a reader, and until this
  // round they reached nobody: the checker held `{ core: 'packages/core', … }` and printed
  // `Object.keys(...)`, so three strings sat in the code looking like operator-facing text
  // while `every workspace, i.e. pnpm test` -- the `repo` one -- was being copied into the
  // classifier as a matching alternative (finding 565). A note no message prints is a note
  // that will be believed and not read, so one message prints all three.
  it('names every scope, with what each one covers, when it refuses an unlabelled count', () => {
    const r = run(`${HEADER}| test suite | **108 files, 3059 tests passed** |\n`);
    expect(r.code).toBe(1);
    for (const note of ['core = `packages/core`', 'cli = `packages/cli`', 'repo = every workspace']) {
      expect(r.out, `the refusal does not say ${note}`).toContain(note);
    }
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

  /**
   * The separator this guard writes in one place and reads in another.
   *
   * `7,091` is how the same corpus writes a five-digit count two rows away from these, and the
   * guard's own `COUNT_PHRASE` and `SPAN_SHAPES` accept it (`\d[\d,]*`). The pair shapes were
   * written `(\d+)`, so the row below was read as **91 tests and no file count** -- and, because
   * the file count went missing with it, as `core tests fell from 7082 to 91`, a refusal that
   * names a number the document does not contain.
   *
   * The counts are derived, so this is a rule about separators rather than a rule about today's
   * suite size.
   */
  const grouped = (n: number): string => n.toLocaleString('en-US');

  it('reads a thousands separator in a published count, instead of the last three digits of it', () => {
    const { files, tests } = (JSON.parse(MEASURED) as Record<string, { files: number; tests: number }>)
      .core!;
    const r = run(
      `${HEADER}| core test suite | **${grouped(files)} files, ${grouped(tests)} tests passed**, ` +
        'as of this commit |\n',
    );
    expect(r.out).not.toContain('fell from');
    expect(r.code).toBe(0);
  });

  it('reads a thousands separator in a bare test count, and says so in the sentence it refuses with', () => {
    const { tests } = (JSON.parse(MEASURED) as Record<string, { files: number; tests: number }>).core!;
    // A bare count cannot be a current-state claim -- rule 3 wants a file count beside it, which is
    // the reason the corpus's current rows carry both -- so the row is refused. What is asserted is
    // *which number* the refusal names: `null files / 91 tests` is what the digit-by-digit reader
    // said, and 91 is not a number this document contains.
    const r = run(`${HEADER}| core test suite | **${grouped(tests)} passed**, as of this commit |\n`);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`null files / ${String(tests)} tests`);
  });

  it('does not read a suite that grew as one that fell, when both rows carry separators', () => {
    const { files, tests } = (JSON.parse(MEASURED) as Record<string, { files: number; tests: number }>)
      .core!;
    const r = run(
      `${HEADER}| core test suite | **${grouped(files)} files, ${grouped(tests - 1)} tests passed** ` +
        '(at v3.0) |\n' +
        `| core test suite | **${grouped(files)} files, ${grouped(tests)} tests passed**, ` +
        'as of this commit |\n',
    );
    expect(r.out).not.toContain('fell from');
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

  // The denominator of `67 of the 474 file(s)`, held to the walk it names (finding 606).
  //
  // The summary says a subset is inside a population, and `67` alone would read as a second
  // population of files -- which is exactly what `check-comments-language`'s `474 file(s)` nine
  // lines above already means. Two assertions are needed and neither is enough: the numerator is
  // held to the inventory, the denominator to the walk, and a hardcoded 474 in the guard would
  // pass the first while going stale against the second.
  it('says of how many files the gate-site proofs are, and takes the denominator from the walk', () => {
    const r = spawnSync('node', [SCRIPT, '--measured', MEASURED], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`;
    const files = sourcesIn(ROOT).length;
    expect(out).toContain(`of the ${String(files)} file(s) the source walk reads`);
    // And the numerator is not the denominator: a corpus in which every source file proved a
    // gate site would make the `of` a constant.
    const numerator = Number(/across (\d+) of the \d+ file\(s\)/.exec(out)![1]);
    expect(numerator).toBeLessThan(files);
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
    //
    // The separator is read here for the same reason the guard now reads it: this is a *third*
    // reader of the same rows, and when the round wrote `7,091 tests passed` the `(\d+)` in this
    // pattern matched nothing at all, so the test reported `no current-state rows found; the shape
    // of the document changed` -- a sentence about the document's structure, produced by a number
    // the pattern could not read. A reader that goes quiet is worse than one that is wrong.
    const claims = [
      ...doc.matchAll(
        /\|\s*`?(\w+)`? test suite\s*\|\s*\*\*(\d[\d,]*) files, (\d[\d,]*) tests passed\*\*[^|]*as of this commit/g,
      ),
    ];
    expect(claims.length, 'no current-state rows found; the shape of the document changed').toBeGreaterThanOrEqual(3);

    const wholeNumber = (text: string): number => Number(text.replaceAll(',', ''));
    for (const [, scope, files, tests] of claims) {
      const m = live[scope!];
      expect(m, `the document publishes a '${scope}' row that MEASURED does not cover`).toBeTruthy();
      expect(
        { files: wholeNumber(files!), tests: wholeNumber(tests!) },
        `the '${scope}' row in docs/progress.md disagrees with MEASURED in this file; ` +
          `when the suite grows, both must be retaken together`,
      ).toEqual(m);
    }
  });

  // The one relation between the three published numbers.
  //
  // Rules 1 to 3 hold the *document* to the declaration. None of them holds the
  // declaration to arithmetic, so a part typed rather than measured passes all
  // three: the committed file said 199 + 4 = 202 with every guard green. This is
  // the wiring test -- the rule itself is `doc-count-additivity.test.ts` -- and it
  // exists because a pure function nobody calls is a rule nobody applies.
  it('refuses a measurement whose parts do not add up to the whole', () => {
    const r = run(
      `${HEADER}| core test suite | **108 files, 3059 tests passed** |\n`,
      undefined,
      JSON.stringify({
        core: { files: 108, tests: 3059 },
        cli: { files: 4, tests: 187 },
        repo: { files: 111, tests: 3246 },
      }),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('is not the sum of its parts');
    // It names the file count and not the test count: 3059 + 187 is 3246, and one
    // unit failing must not report the other.
    expect(r.out).toMatch(/the 'repo' files count is not the sum of its parts/);
    expect(r.out).not.toMatch(/the 'repo' tests count is not the sum/);
    expect(r.out).toContain('off by -1');
  });

  // The arithmetic must not fire on the numbers that ship, or it becomes a rule
  // everyone learns to add an exemption for.
  it('accepts the shipped measurement, which adds up', () => {
    const r = spawnSync('node', [SCRIPT, '--measured', MEASURED], { cwd: ROOT, encoding: 'utf8' });
    expect(`${r.stdout}${r.stderr}`).not.toContain('is not the sum of its parts');
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

/**
 * Rule 5: a gate-site count names the present, and equals the inventory.
 *
 * The numbers are read from `golden-master/gate-sites.json` here for the same reason `MEASURED` is
 * read from the committed file: a fixture that hard-coded today's `203` would fail the day a guard
 * was added, and would then be repaired by editing the expectation rather than by reading the rule.
 */
describe('check-doc-counts -- the gate-site counts it holds to the inventory', () => {
  const inventory = JSON.parse(
    readFileSync(resolve(ROOT, 'golden-master', 'gate-sites.json'), 'utf8'),
  ) as { sites: Array<Record<string, unknown>>; throws?: { rows?: Array<Record<string, unknown>> } };
  const claims = [
    ...inventory.sites.filter((one) => one['status'] === 'proved' && typeof one['provedBy'] === 'string'),
    ...(inventory.throws?.rows ?? []).filter(
      (one) => one['status'] === 'proved' && typeof one['provedBy'] === 'string',
    ),
  ];
  const CLAIMS = claims.length;
  const FILES = new Set(claims.map((one) => String(one['provedBy']))).size;
  const SITES = inventory.sites.length;
  /**
   * A row every run of this guard needs before it will look at anything else.
   *
   * The corpus must publish at least one file/test count or the guard refuses -- finding none means
   * the reader went blind -- so a fixture about a different shape still has to carry one. It names
   * the scope and equals the committed measurement, so it satisfies rules 1 to 3 without asking the
   * test to think about them.
   */
  const counted = JSON.parse(MEASURED) as { core: { files: number; tests: number } };
  const COUNT_ROW = `${HEADER}| core test suite | **${String(counted.core.files)} files, ${String(counted.core.tests)} tests passed** |\n`;

  it('accepts a present-tense sentence that agrees with the inventory', () => {
    const r = run(
      `${COUNT_ROW}The proof halves are measured at ${CLAIMS} of ${CLAIMS} claim(s) across ${FILES} file(s).\n`,
      undefined,
      MEASURED,
      'self',
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('gate-site claim(s) agreeing with');
  });

  it('refuses a sentence that publishes a count the tree does not hold', () => {
    // The defect this rule exists for: `docs/acceptance.md` said 105 of 105 while the inventory
    // held 203 claims, and an external review quoted the 105 as the current figure.
    const stale = CLAIMS - 1;
    const r = run(
      `${COUNT_ROW}Measured at ${stale} of ${stale} claim(s) across ${FILES} file(s).\n`,
      undefined,
      MEASURED,
      'self',
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain(`publishes "${stale} of ${stale} claim(s)"`);
    // The message names the denominator as well as the count, because the summary does: the 67 are
    // `of the 474 file(s) the source walk reads`, and a verdict that omitted the `of` would be
    // quoting half of the sentence the reader is being asked to repair (finding 606).
    expect(r.out).toContain(`the inventory holds ${CLAIMS} claim(s) across ${FILES} of the`);
    // Once per line, not once per shape: the sentence matches two of the three shapes and a second
    // verdict on the same sentence is a second repair the reader has to make.
    expect(r.out.match(/publishes "/g)?.length).toBe(1);
  });

  it('refuses a failure-site count that disagrees, on the third shape', () => {
    const r = run(
      `${COUNT_ROW}derive-gate-sites reports ${SITES + 1} failure site(s) across the tree.\n`,
      undefined,
      MEASURED,
      'self',
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain(`publishes "${SITES + 1} failure site(s)"`);
    expect(r.out).toContain(`${SITES} failure site(s)`);
  });

  it('leaves a dated sentence alone, because a record is not a stale claim', () => {
    // The corpus's volumes carry these numbers a dozen times, each true when it was measured. The
    // date is the whole distinction, and it is the vocabulary the open list already uses.
    const stale = CLAIMS - 1;
    const r = run(
      `${COUNT_ROW}Measured at ${stale} of ${stale} claim(s) across ${FILES} file(s) at v3.41.\n`,
      undefined,
      MEASURED,
      'self',
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('0 gate-site claim(s) agreeing with');
  });
});

describe('check-doc-counts -- which round a claim about now sits under', () => {
  /**
   * One round's suite row, in the shape the guard reads, with the marker the case is about.
   *
   * The numbers come from the committed measurement rather than from a literal, because rule 3
   * holds a current-state row to *that* number: a fixture with its own count would be refused
   * for the count and the case would pass for the wrong reason.
   */
  const counted = JSON.parse(MEASURED) as { core: { files: number; tests: number } };
  const coreRow = (marker: string) =>
    `| \`core\` test suite | **${String(counted.core.files)} files, ${String(counted.core.tests)} tests passed** ${marker} |\n`;

  it('refuses a current-state row under an older round, because "now" is one round', () => {
    // v3.136's three rows were written `(as of this commit)` and were still marked current a
    // round later; what caught them was the next round adding a test, which is an event rather
    // than a rule (`O-111`). Two rounds each saying "now" is a contradiction inside the
    // documents, and no measurement is needed to see it.
    const r = run(
      `${HEADER}## v3.10 — the older round\n\n${coreRow('(as of this commit)')}` +
        `\n## v3.11 — the newer round\n\n${coreRow('(as of this commit)')}`,
    );
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('a row marked as the current state sits under v3.10');
    expect(r.out).toContain('the newest round that publishes a count is v3.11');
    // The repair is a date, and the refusal names it: a round that moves the tree owes the older
    // row a date rather than a new number.
    expect(r.out).toContain('"(at v3.10)"');
  });

  it('accepts the same two rows when the older one is dated', () => {
    // The other half of the same tree: the numbers are identical, and the only difference is
    // that one of them says which round measured it. A rule that refused this would be refusing
    // the record, which is what the corpus is.
    const r = run(
      `${HEADER}## v3.10 — the older round\n\n${coreRow('(at v3.10)')}` +
        `\n## v3.11 — the newer round\n\n${coreRow('(as of this commit)')}`,
    );
    expect(r.code, r.out).toBe(0);
  });

  it('compares rounds as numbers, so v3.9 is older than v3.10', () => {
    // A string comparison would make `v3.9` the newer of the two and refuse the row that is
    // actually current. The corpus spans two major series, so the comparison is a pair.
    const r = run(
      `${HEADER}## v3.9 — nine\n\n${coreRow('(as of this commit)')}` +
        `\n## v3.10 — ten\n\n${coreRow('(at v3.10)')}`,
    );
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('sits under v3.9');
    expect(r.out).toContain('is v3.10');
  });

  it('leaves a row under no round heading to the rule that holds it to the measurement', () => {
    // `docs/progress.md`'s tables describe the tree rather than a round, and rule 3 already holds
    // them to the measurement. The claim this rule is about is two *rounds* each saying "now", so
    // a document whose only current row sits outside every round has nothing here to be refused
    // for -- and the case would be a false refusal on the index file the moment it appeared.
    const r = run(`${HEADER}${coreRow('(as of this commit)')}`);
    expect(r.code, r.out).toBe(0);
  });

  it('does not read `## Repository` as a round, in a document that has rounds as well', () => {
    // The shape that separates "a row under no round" from "a row under a round whose name is
    // not one": the index file's own sections sit beside the volumes' rounds in the corpus, and a
    // heading that names no round must leave its rows unattributed rather than give them a round
    // called `Repository` -- which would then be neither the newest round nor a null, and rule 3b
    // would refuse the tree's own current table.
    const r = run(
      `${HEADER}## v3.10 — a round\n\n${coreRow('(at v3.10)')}` +
        `\n## Repository\n\n${coreRow('(as of this commit)')}`,
    );
    expect(r.code, r.out).toBe(0);
  });
});

/**
 * What the green line says it compared (`O-110`).
 *
 * The guard compares the published rows with a **snapshot**, and a snapshot is a number
 * somebody took rather than the tree. So a snapshot and the rows that quote it can be wrong
 * together -- measured at v3.137: one test off, this guard's exit **0** against exit **1** from
 * the reader that re-derives. That reader exists (`measure-doc-counts.mjs --check`, step 6 of
 * `verify:local`), but a developer who runs `docs:check` and stops has not run it, and until now
 * nothing in the output said which of the two they had done.
 *
 * The repair is not for this gate to read a report when one happens to be present: the reports are
 * written by the coverage step, so a tree that has not run coverage has none, and a verdict that
 * depends on whether another command was run is a verdict with two meanings. The repair is for the
 * line to name the two sides it joined and the reader that would re-take the measurement.
 */
describe('check-doc-counts -- what the green line says it compared', () => {
  const BODY = `${HEADER}| core test suite | **108 files, 3059 tests passed** |\n`;

  it('names the snapshot it read, and the reader that would re-derive it', () => {
    // No `--measured`: the guard falls back to the committed file, which is the state a developer
    // running `pnpm docs:check` is in.
    const r = run(BODY, undefined, null);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('golden-master/doc-counts.json');
    expect(r.out).toContain('snapshot rather than a run');
    expect(r.out).toContain('does not spawn the suite');
    expect(r.out).toContain('measure-doc-counts.mjs --check');
  });

  it('says when the counts were handed to it, which is a different comparison', () => {
    // `--measured` is how the suite drives this guard. The number then came from the caller and
    // not from any file the gate opened, and a line that called that "a snapshot" would be
    // describing a read that did not happen.
    const r = run(BODY);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('passed in (--measured)');
    expect(r.out).not.toContain('snapshot rather than a run');
  });
});

/**
 * A date against the round it sits under (`O-115`).
 *
 * `(at v3.200)` under `## v3.138` is impossible -- a round cannot record a measurement from a round
 * that has not happened -- and nothing read the pair. The corpus holds **230** dated rows and 227 of
 * them sit under a round, so this is a rule over a real population rather than a guard written for a
 * state that has never occurred: writing it is what turns "no such row exists" into "no such row can
 * be written without a refusal".
 *
 * The comparison is the one rule 3b already uses -- a round token as a pair of numbers -- applied to
 * a different field. `v3.9` is older than `v3.10`, so a string comparison would pass the row that is
 * actually impossible and refuse the one that is a correct record.
 */
describe('check-doc-counts -- a dated row against the round it sits under', () => {
  const dated = (marker: string) => `| core test suite | **108 files, 3059 tests passed** ${marker} |\n`;

  it('refuses a date from a round that has not happened yet', () => {
    const r = run(`${HEADER}## v3.138 — a round\n\n${dated('(at v3.200)')}`);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('dated (at v3.200)');
    expect(r.out).toContain('sits under v3.138');
  });

  it('accepts a date from an earlier round, and one from the round itself', () => {
    // Both are records: an older round's measurement quoted here, and this round's own. A rule that
    // refused the second would refuse the row a round writes about itself.
    const earlier = run(`${HEADER}## v3.138 — a round\n\n${dated('(at v3.130)')}`);
    expect(earlier.code, earlier.out).toBe(0);
    const own = run(`${HEADER}## v3.138 — a round\n\n${dated('(at v3.138)')}`);
    expect(own.code, own.out).toBe(0);
  });

  it('compares the pair as numbers, so a date in v3.9 is older than a row under v3.10', () => {
    // The string order is the reverse of the numeric one, which is the whole reason rule 3b compares
    // a pair. A rule that read the token as text would refuse this record and pass its mirror.
    const older = run(`${HEADER}## v3.10 — ten\n\n${dated('(at v3.9)')}`);
    expect(older.code, older.out).toBe(0);
    const impossible = run(`${HEADER}## v3.9 — nine\n\n${dated('(at v3.10)')}`);
    expect(impossible.code, impossible.out).toBe(1);
    expect(impossible.out).toContain('dated (at v3.10)');
  });

  it('refuses a date newer than every round in the corpus, even under no heading', () => {
    // `docs/progress.md`'s own tables sit under no round, and three dated rows already do. A date
    // there is not compared against a heading, so the corpus's newest round is the only thing it can
    // be compared with -- and a date past it names a round that has not been written.
    const r = run(
      `${HEADER}## v3.10 — a round\n\n${dated('(at v3.10)')}\n## Repository\n\n${dated('(at v3.20)')}`,
    );
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('dated (at v3.20)');
    expect(r.out).toContain('the newest round');
  });

  it('leaves a dated row under no heading alone when the round it names exists', () => {
    // The other half: the index file's tables quote older rounds and are not under any of them, and
    // a rule that needed a heading would refuse every one of them.
    const r = run(
      `${HEADER}## v3.10 — a round\n\n${dated('(at v3.10)')}\n## Repository\n\n${dated('(at v3.9)')}`,
    );
    expect(r.code, r.out).toBe(0);
  });
});

/**
 * The span a round publishes about its own size, and the date spelled as code.
 *
 * A round states how large the suite is twice: in its three suite rows, and in the span of its
 * `new tests` row (`6,921 -> 6,946, +25`). Rules 1 to 4 read the first and none of them read the
 * second, so the span was a count comparable with nothing -- and the spans are where the corpus had
 * gone wrong: five of them, at v3.141, ended nowhere near the count the round had published beside
 * them.
 *
 * The date arrives in two spellings, and one of them (`(at `v3.102`)`, fifteen rows in volume-17)
 * read as no date at all until this round: rule 3c could not refuse a future date among them, and a
 * span beside them had no count to be compared with.
 */
describe('check-doc-counts -- the span a round publishes about itself', () => {
  const round = (tests: number, marker = '(at v3.10)') =>
    `| core test suite | **108 files, ${tests} tests passed** ${marker} |\n`;
  const span = (rest: string) => `| new tests | ${rest} |\n`;
  const doc = (body: string) =>
    `${HEADER}## v3.10 — a round\n\n| item | value |\n| --- | --- |\n${round(3059)}${body}`;

  it('accepts a span that ends where the round its own count ends', () => {
    // The row's two statements agree, which is the state the rule exists to hold: the span ends at
    // the number the round published about itself, so the round and the quote are one measurement.
    const r = run(doc(span('**3000 -> 3059, +59**')));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 span(s) ending where the round');
    expect(r.out).toContain('(1 in core)');
  });

  it('refuses a span that ends somewhere the round published no count', () => {
    // The shipped defect, in a fixture: at v3.117 the span ended at 6,691 and the count beside it
    // said 6,700 -- a number a later round took and dated to this one.
    //
    // The refusal names every count the round published, not the first of them: a reader who is told
    // only about `core` cannot see that the span might be the `repo` count, which is what v3.54's
    // span turned out to be.
    const body =
      '| core test suite | **108 files, 3059 tests passed** (at v3.10) |\n' +
      '| repo test suite | **112 files, 3246 tests passed** (at v3.10) |\n' +
      span('**3000 -> 3100, +100**');
    const r = run(`${HEADER}## v3.10 — a round\n\n| item | value |\n| --- | --- |\n${body}`);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('ends at 3100');
    expect(r.out).toContain('core 3059');
    expect(r.out).toContain('repo 3246');
    expect(r.out).toContain('the date is what stopped rule 3 from asking');
  });

  it('refuses a span whose three numbers are not one measurement', () => {
    // Two statements can each be wrong on their own; the arithmetic needs no second witness. This
    // one is a delta that does not match its ends, which no rule read before: `new tests` was
    // outside every shape the guard knows.
    const r = run(doc(span('**3000 -> 3059, +50**')));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('is +50, and the difference is 59');
  });

  it('takes a span with a test file named before it as that file', () => {
    // `(18 -> 30)` beside `site-proofs.test.ts` counts that file, and comparing it with the suite
    // would be a verdict about two populations. The file has to be named *before* the span: a row
    // that names test files while describing the delta names them after it.
    const r = run(doc(span('**12**, all in `site-proofs.test.ts` (18 -> 30)')));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 span(s) about one file');
  });

  it('still reads a span as the suite\'s when a test file is named after it', () => {
    // The mirror of the case above, and the reason the file has to come *before* the span: a row
    // describing its delta names test files all the time (`one for the rewrite, two in
    // ci-budget.test.ts`), and taking any file as the span's subject would excuse the span instead
    // of checking it -- a rule that stops applying to the rows that mention code.
    const r = run(doc(span('**3000 -> 3059, +59**: two in `ci-budget.test.ts`')));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 span(s) ending where the round');
    expect(r.out).toContain('0 span(s) about one file');
  });

  it('does not take a row that names no round as the round\'s own count', () => {
    // Two spellings claim "I measured this round": `(as of this commit)` and `(at vN)`. A row that
    // says neither is a number quoted from somewhere, and taking it as the round's own would let a
    // copied record decide whether the round's span is true. The dated row here is the round's own;
    // the plain one after it is not, and the span must still match the first.
    const body =
      '| core test suite | **108 files, 3059 tests passed** (at v3.10) |\n' +
      '| core test suite | **108 files, 3100 tests passed** |\n' +
      span('**3000 -> 3059, +59**');
    const r = run(`${HEADER}## v3.10 — a round\n\n| item | value |\n| --- | --- |\n${body}`);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 span(s) ending where the round');
  });

  it('counts a row that publishes no before-count instead of refusing it', () => {
    // Thirty-one rows say only how many tests a round added, so there is no span to compare. A
    // reader that treated the gap as agreement would be claiming a comparison it never made.
    const r = run(doc(span('**9**: four for the rule, five for the reader')));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 about no before-count');
  });

  it('refuses an arrow it cannot read as a span', () => {
    // A shape the reader does not know is indistinguishable from a row with no span, which is
    // exactly the silent gap rule 4 was written for. The arrow is the evidence that a span was
    // meant.
    const r = run(doc(span('**9**, counted -> up')));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('cannot read as a span');
  });

  it('counts a span under no round as one with nothing to compare against', () => {
    // `docs/progress.md`'s own tables are under no round, so there is no round's count to compare
    // with. Passing it would be a verdict; the class is counted instead.
    const r = run(
      `${HEADER}## Repository\n\n| item | value |\n| --- | --- |\n${round(3059)}${span('**3000 -> 3059**')}`,
    );
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('1 span(s) under a round with no count to compare with');
  });

  it('reads a date written as code, and refuses a future one in that spelling', () => {
    // `(at `v3.102`)` is the same statement rendered, and volume-17 writes it fifteen times. Reading
    // only the plain spelling made those rows undated: rule 3c had nothing to compare, and the span
    // beside them had no count. One pattern with an optional pair of backticks, not two patterns.
    const r = run(`${HEADER}## v3.138 — a round\n\n${round(3059, '(at `v3.200`)')}`);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('dated (at v3.200)');
    const ok = run(`${HEADER}## v3.138 — a round\n\n${round(3059, '(at `v3.138`)')}`);
    expect(ok.code, ok.out).toBe(0);
  });
});
