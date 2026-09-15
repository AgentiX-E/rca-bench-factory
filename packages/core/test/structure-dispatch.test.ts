import { describe, expect, it } from 'vitest';

import { exportForScoreTarget } from '../src/score/dispatch.js';
import { scoreExport } from '../src/score/score.js';
import { SCORE_TARGET_IDS } from '../src/score/targets.js';
import { checkRcaEvalStructure } from '../src/score/score.js';
import { validBundle, validCase } from './fixtures.js';

/**
 * The structural check a score target is judged by, and the suite it is judged
 * against.
 *
 * Three RCAEval targets share one checker whose behaviour is chosen by a suite:
 * RE1 expects only `metrics.json` and `inject_time.txt`, RE2 and RE3 expect
 * `logs.csv` and `traces.csv` as well. Which suite a target means was previously
 * written out a second time in `structureFor`, next to the copy in
 * `scoreTargetInvocation`, and a drift between the two was close to invisible.
 *
 * It was invisible because `scoreExport` pairs a target's structure report with
 * that same target's *files*. Hand the checker the wrong suite and it judges the
 * wrong shape against files of the wrong shape: the two errors agree, the report
 * passes, and `official:check` prints `PASS rcaeval-re1`. The one test that did
 * catch it caught it by accident of what it happened to cover.
 *
 * So these tests do not ask "does each target pass?" - nine passing targets is
 * what a self-consistent mistake looks like. They ask the question a drift
 * cannot survive: **does a target's checker reject another target's files?**
 */

/**
 * The files a target's own exporter produces.
 *
 * RE3 admits code-level faults only, so the shared CPU-saturation fixture does
 * not exercise it - it emits nothing and reports a skip. Scoring that empty
 * export is a legitimate 0, which would make a "scores 100" assertion say
 * something about the fixture rather than about the checker. RE3 is therefore
 * given a bundle it admits, and the assertions below that need a *shape* to
 * compare work on the fixture where both suites produce one.
 */
function ownFiles(target: (typeof SCORE_TARGET_IDS)[number]): Record<string, string> {
  if (target === 'rcaeval-re3') return exportForScoreTarget(codeBundle(), 'rcaeval-re3').files;
  return exportForScoreTarget(validBundle(), target).files;
}

/** A bundle whose single case is a code-level fault, which RE3 admits. */
function codeBundle() {
  return validBundle({
    cases: [
      validCase({
        fault: { type: 'code-bug', category: 'code', injectionMethod: 'feature-flag', parameters: {} },
      }),
    ],
  });
}

describe('every score target passes its own structural check', () => {
  it.each(SCORE_TARGET_IDS)('%s scores 100 on the files its exporter emits', (target) => {
    const report = scoreExport(target, ownFiles(target));
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  // A drift inside `structureFor` is self-concealing in one specific way: the
  // structure report it returns names a target of its own, and `scoreExport`
  // nests that report inside a report naming the target that was asked for. When
  // the two disagree, the score can still be 100 - the shared fixture's RE1
  // export satisfies RE2's modality rule - so nothing above notices. The
  // named-target agreement is asserted directly, on every target, because it is
  // the one observable a suite mix-up cannot keep consistent.
  it.each(SCORE_TARGET_IDS)("%s' structure report names the target that was asked for", (target) => {
    const report = scoreExport(target, ownFiles(target));
    expect(report.structure.target).toBe(target);
    expect(report.target).toBe(target);
  });
});

/**
 * The load-bearing half. If a target's checker reads a suite other than its own,
 * it will accept files it should refuse - and that is what these assertions
 * look for.
 */
describe('a structural check refuses a shape it does not describe', () => {
  it('RE1 refuses RE2 files, which carry logs and traces RE1 does not expect', () => {
    const report = scoreExport('rcaeval-re1', ownFiles('rcaeval-re2'));
    expect(report.passed).toBe(false);
    expect(report.structure.checks.some((c) => c.id === 'modality-set' && !c.passed)).toBe(true);
  });

  it('RE2 refuses RE1 files, which lack the logs and traces RE2 requires', () => {
    const report = scoreExport('rcaeval-re2', ownFiles('rcaeval-re1'));
    expect(report.passed).toBe(false);
    expect(report.structure.checks.some((c) => c.id === 'modality-set' && !c.passed)).toBe(true);
  });

  // RE1 and RE2 are separated by their file *set*, which is visible in the
  // directory listing. RE2 and RE3 share that set exactly. A first draft of this
  // test asserted that RE3 therefore *rejects* RE2's resource-fault files, and
  // was wrong: `checkRcaEvalStructure` is a shape check, and `RE2-.../logs.csv`
  // has exactly the shape RE3 would have given it. The difference between the
  // two targets is which cases the *exporter* admits, one layer up, and no
  // structural check can see it. Recorded here because the distinction is what
  // makes the suite worth reading from a ledger at all.
  it('RE2 and RE3 accept the same shaped files, because the shapes are identical', () => {
    const resourceFiles = exportForScoreTarget(validBundle(), 'rcaeval-re2').files;
    expect(scoreExport('rcaeval-re2', resourceFiles).passed).toBe(true);
    expect(scoreExport('rcaeval-re3', resourceFiles).passed).toBe(true);
  });

  it('RE3 emits nothing for a case it refuses, which is the real separation', () => {
    const refused = exportForScoreTarget(validBundle(), 'rcaeval-re3');
    expect(refused.files).toEqual({});
    expect(refused.skipped).toHaveLength(1);
    expect(scoreExport('rcaeval-re3', refused.files).passed).toBe(false);
  });

  it('RE2 refuses an empty export, so the RE3 skip is not silently acceptable', () => {
    expect(scoreExport('rcaeval-re2', {}).passed).toBe(false);
  });

  it('RE3 accepts the code-fault files it emits, under its own directory', () => {
    const files = exportForScoreTarget(codeBundle(), 'rcaeval-re3').files;
    expect(Object.keys(files).every((p) => p.startsWith('RE3-'))).toBe(true);
    expect(scoreExport('rcaeval-re3', files).passed).toBe(true);
  });

  it('RE3 refuses RE1 files, which is the shape furthest from it', () => {
    expect(scoreExport('rcaeval-re3', ownFiles('rcaeval-re1')).passed).toBe(false);
  });
});

/**
 * The checker is parameterised, so calling it directly with each suite is the
 * sharpest statement of what each suite means - and it does not depend on any
 * exporter agreeing with it.
 */
describe('checkRcaEvalStructure states the modality rule per suite', () => {
  it('RE1 demands the absence of logs and traces', () => {
    const report = checkRcaEvalStructure(ownFiles('rcaeval-re1'), 'RE1');
    expect(report.passed).toBe(true);
    expect(report.checks.find((c) => c.id === 'modality-set')?.detail).toContain('RE1 expects logs/traces=false');
  });

  it.each(['RE2', 'RE3'] as const)('%s demands the presence of both logs and traces', (suite) => {
    const report = checkRcaEvalStructure(ownFiles('rcaeval-re2'), suite);
    expect(report.passed).toBe(true);
    expect(report.checks.find((c) => c.id === 'modality-set')?.detail).toContain(`${suite} expects logs/traces=true`);
  });

  it('RE1 rejects the RE2 shape when called directly', () => {
    const report = checkRcaEvalStructure(ownFiles('rcaeval-re2'), 'RE1');
    expect(report.passed).toBe(false);
  });

  it('RE2 rejects the RE1 shape when called directly', () => {
    const report = checkRcaEvalStructure(ownFiles('rcaeval-re1'), 'RE2');
    expect(report.passed).toBe(false);
  });
});

/**
 * A target the scorer declares must be answerable. `structureFor` ends in a
 * `never`, so a missing arm is a compile error - but nothing until now asserted
 * that every declared target actually reaches a real checker rather than
 * throwing.
 */
describe('the declared targets are all answerable', () => {
  it.each(SCORE_TARGET_IDS)('%s reaches a structural check rather than the default arm', (target) => {
    expect(() => scoreExport(target, ownFiles(target))).not.toThrow();
  });

  it('a target the scorer does not declare is a programmer error', () => {
    expect(() => scoreExport('rcaeval-re9' as never, {})).toThrow(/unknown score target/);
  });

  it('the three RCAEval targets are the only ones sharing a checker', () => {
    // The claim that makes reading the suite from a ledger worthwhile: if each
    // target had its own checker there would be nothing to read.
    const rcaeval = SCORE_TARGET_IDS.filter((t) => t.startsWith('rcaeval-'));
    expect(rcaeval).toEqual(['rcaeval-re1', 'rcaeval-re2', 'rcaeval-re3']);
  });
});
