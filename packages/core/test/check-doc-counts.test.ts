import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

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

/** Run the guard against a document body written to a temp file. */
function run(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'doc-counts-'));
  dirs.push(dir);
  const doc = join(dir, 'progress.md');
  writeFileSync(doc, body);
  const r = spawnSync('node', [SCRIPT, '--doc', doc, '--measured', MEASURED], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

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
    const doc = readFileSync(resolve(ROOT, 'docs', 'progress.md'), 'utf8');
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
