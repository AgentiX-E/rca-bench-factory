import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeScore, scoreExport, sha256 } from '../src/score/score.js';
import { exportForScoreTarget } from '../src/score/dispatch.js';
import { SCORE_TARGET_IDS } from '../src/score/targets.js';
import type { ScoreReport } from '../src/score/score.js';
import type { ScoreTargetId } from '../src/score/targets.js';
import { irBundleSchema } from '../src/ir/schema.js';

/**
 * `score` is a percentage over a denominator that differs per target, and until this
 * round nothing in the tree said so.
 *
 * The open item was: *"`score` divides by a different denominator per target, and the
 * documents did not say so ... the sentence 'different targets are not comparable'
 * needs a measurement under it, which is a test asserting that two targets' check
 * counts differ -- and that test does not exist."* This is that test, run against the
 * shipped example bundle through the real exporters, so the counts are the ones the
 * site and the documentation publish rather than a fixture's idea of them.
 *
 * What the measurement says is more than "the denominators differ":
 *
 *  - nine targets carry **five** different check counts (14, 9, 8, 7, 2), so
 *    `score: 100` names five different amounts of evidence;
 *  - without anchors the number takes exactly **two** values, 0 and 100, because the
 *    structure term is all-or-nothing -- so "0-100" is a ceiling, not a scale;
 *  - and every report now carries the counts it was computed over, in `terms`, which
 *    is what makes the first two facts printable instead of inferable.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = resolve(ROOT, 'examples', 'order-prod', 'bundle.json');

/**
 * The check count each target's contract has, as published.
 *
 * A golden value rather than a recomputation: the point of the assertion is that the
 * number reaches a reader's eye unchanged, so it is written down the way the documents
 * write it. Recomputed from `checks.length` it would only say that a list is as long as
 * itself.
 */
const PUBLISHED_CHECKS: Record<ScoreTargetId, number> = {
  'openrca-1.0': 14,
  'openrca-2.0': 2,
  'rcaeval-re1': 8,
  'rcaeval-re2': 8,
  'rcaeval-re3': 8,
  rca100: 9,
  aiops2025: 7,
  'cloud-opsbench': 2,
  itbench: 2,
};

function reports(): Array<{ target: ScoreTargetId; report: ScoreReport }> {
  const bundle = irBundleSchema.parse(JSON.parse(readFileSync(BUNDLE, 'utf8')));
  return SCORE_TARGET_IDS.map((target) => {
    const outcome = exportForScoreTarget(bundle, target);
    return { target, report: scoreExport(target, outcome.files) };
  });
}

describe('the denominator under a score', () => {
  it('carries the published check count for every target', () => {
    const measured = Object.fromEntries(reports().map(({ target, report }) => [target, report.structure.checks.length]));
    expect(measured).toEqual(PUBLISHED_CHECKS);
  });

  it('has five different denominators across the nine targets', () => {
    // The sentence "different targets are not comparable" is a claim about counts, and
    // this is the count. Four targets share two checks; openrca-1.0 has fourteen; and
    // `rcaeval-re2`/`re3` share eight with `re1`.
    const totals = [...new Set(Object.values(PUBLISHED_CHECKS))].sort((a, b) => a - b);
    expect(totals).toEqual([2, 7, 8, 9, 14]);
  });

  it('gives two targets the same score over different amounts of evidence', () => {
    // The defect the item names, stated as a number: `openrca-1.0` and `itbench` both
    // reach 100, and one is fourteen checks while the other is two. A reader comparing
    // the percentages is comparing nothing.
    const all = reports();
    const wide = all.find((one) => one.target === 'openrca-1.0')!;
    const narrow = all.find((one) => one.target === 'itbench')!;
    expect(wide.report.score).toBe(100);
    expect(narrow.report.score).toBe(100);
    expect(wide.report.terms.structure.total / narrow.report.terms.structure.total).toBe(7);
  });

  it('takes exactly two values when no anchors are supplied, so 0-100 is a ceiling', () => {
    // `creditFor` is all-or-nothing, which is a deliberate rule (an export that fails a
    // check does not earn partial credit for the contract it broke). The consequence had
    // never been measured: the number is a verdict wearing a percentage.
    const scores = reports().map(({ report }) => report.score);
    expect([...new Set(scores)].sort((a, b) => a - b)).toEqual([0, 100]);
    expect(scores.filter((one) => one === 100)).toHaveLength(8);
    expect(scores.filter((one) => one === 0)).toHaveLength(1);
  });

  it('never prints the percentage without the count it was computed over', () => {
    for (const { target, report } of reports()) {
      const line = describeScore(report);
      expect(line, target).toContain(`score ${report.score} of 100`);
      expect(line, target).toContain(`over ${report.structure.checks.length} structure check(s)`);
      // No anchors were supplied, so nothing may be said about files.
      expect(line, target).not.toContain('matching their anchors');
    }
  });

  it('names both denominators once anchors are supplied', () => {
    const bundle = irBundleSchema.parse(JSON.parse(readFileSync(BUNDLE, 'utf8')));
    const outcome = exportForScoreTarget(bundle, 'openrca-1.0');
    const anchors = Object.fromEntries(
      Object.entries(outcome.files).map(([path, body]) => [path, sha256(body)]),
    );
    const report = scoreExport('openrca-1.0', outcome.files, anchors);
    const line = describeScore(report);
    expect(report.terms.checksum).toEqual({ passed: Object.keys(outcome.files).length, total: Object.keys(outcome.files).length });
    expect(line).toContain(`with ${Object.keys(outcome.files).length} of ${Object.keys(outcome.files).length} file(s)`);
    expect(report.score).toBe(100);
  });
});

describe('the counts are the same counts the verdict used', () => {
  it('derives the structure term from the checks themselves', () => {
    for (const { target, report } of reports()) {
      const passed = report.structure.checks.filter((c) => c.passed).length;
      expect(report.terms.structure, target).toEqual({ passed, total: report.structure.checks.length });
    }
  });

  it('holds the verdict and the counts to one rule', () => {
    // `creditFor` reads `passed === total`, while `StructureReport.passed` is written by
    // the seven checkers as `checks.every(...)`. Two writers of one fact, so the pair is
    // asserted rather than assumed: a checker that set `passed` by hand would keep every
    // unit test green and put a 100 on a report with a failing check.
    for (const { target, report } of reports()) {
      expect(report.passed, target).toBe(report.terms.structure.passed === report.terms.structure.total);
    }
  });

  it('gives an empty check list no credit rather than a NaN', () => {
    // A term with nothing under it has no credit to give. The old arithmetic divided
    // 0 by 0 here and produced `score: NaN`, which is a number that compares false with
    // every threshold and would pass a `score >= 0` guard.
    const report = scoreExport('aiops2025', {});
    expect(report.terms.structure.total).toBeGreaterThan(0);
    expect(Number.isFinite(report.score)).toBe(true);
    expect(report.score).toBe(0);
  });
});
