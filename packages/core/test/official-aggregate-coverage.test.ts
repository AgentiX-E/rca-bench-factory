import { describe, expect, it } from 'vitest';
import { OFFICIAL_METRICS, oraclePrediction, readOfficialGroundTruth, scoreOfficial } from '../src/score/official.js';
import type { OfficialPrediction } from '../src/score/official.js';
import type { ScoreTargetId } from '../src/score/targets.js';
import { SCORE_TARGET_IDS } from '../src/score/targets.js';
import { exportOpenRca } from '../src/export/openrca.js';
import { exportOpenRca2 } from '../src/export/openrca2.js';
import { validBundle } from './fixtures.js';

/**
 * Every target's headline has to be the formula its spec publishes.
 *
 * `aggregateFor` is a chain of `if (target === …)` blocks ending in a generic
 * `strict` fallback. Nine targets, six named branches: `openrca-2.0` was never
 * named, so it fell through and its headline became strict accuracy -- the
 * share of cases where *every* facet was reproduced exactly.
 *
 * That is a different function from the one its own spec advertises:
 *
 *   formula: 'score = matched facets / scored facets (root cause, fault type,
 *             causal chain, evidence)'
 *
 * The two agree at the extremes, which is why nothing caught it: a perfect
 * export scores 100 either way and an empty one scores 0 either way. They part
 * company only in between, and there they disagree completely -- a prediction
 * reproducing three of the four declared facets scores 0.75 under the published
 * rule and 0 under the fallback, while the report shows `accuracy: 0.75` beside
 * `final: 0`. The reader has no way to reconcile that pair.
 *
 * The fallback is the defect, not merely one missing branch: the tenth target
 * added to `SCORE_TARGET_IDS` would inherit strict accuracy as its headline
 * with nothing to say so.
 */

describe('aggregateFor · an unnamed target must not silently inherit a formula', () => {
  it('has a spec for every target', () => {
    for (const target of SCORE_TARGET_IDS) {
      expect(OFFICIAL_METRICS[target].formula, target).toBeTruthy();
    }
  });

  it('scores a perfect openrca-2.0 export at 100', () => {
    const report = scoreOfficial('openrca-2.0', exportOpenRca2(validBundle()).files);
    expect(report.accuracy).toBe(1);
    expect(report.final).toBe(100);
  });

  it('gives partial credit, because the published rule does', () => {
    // Submitted explicitly rather than derived from the key: `causal_path.json`
    // *is* the answer key for this target, so weakening the file would weaken
    // the key and the oracle with it. The prediction is what a solver controls.
    const files = exportOpenRca2(validBundle()).files;
    const oracle = oraclePrediction(readOfficialGroundTruth('openrca-2.0', files)[0]!);
    expect(oracle.chain.length, 'the fixture key declares no chain').toBeGreaterThan(0);

    // Chain intact, evidence dropped: exactly one of the four declared facets
    // fails, so the published rule scores 0.75 and strict accuracy scores 0.
    const partial: OfficialPrediction = { ...oracle, evidence: [] };
    const report = scoreOfficial('openrca-2.0', files, [partial]);
    expect(report.accuracy, `accuracy ${report.accuracy}`).toBe(0.75);
    expect(report.final, `final ${report.final} vs accuracy ${report.accuracy}`).toBeGreaterThan(0);
    expect(report.final).toBeCloseTo(report.accuracy * 100, 5);
  });

  it('declares a formula that names facets rather than a strict flag', () => {
    // `accuracy` is the mean facet score, so a target whose spec is the mean
    // facet score must agree with it. This is the invariant the missing branch
    // broke, stated without reference to which branch it was.
    expect(OFFICIAL_METRICS['openrca-2.0'].formula).toContain('matched facets / scored facets');
  });
});

describe('aggregateFor · an unnamed target is a loud failure, not a silent formula', () => {
  it('throws instead of inheriting the generic strict accuracy formula', () => {
    // The nine named targets each have an aggregation branch. Before this
    // guard the `if` chain simply ended, so any target that no branch named fell
    // through to the trailing strict-accuracy block and reported a number under
    // a spec that advertises a different formula. `openrca-2.0` is the one that
    // did: its spec says `matched facets / scored facets`, and it reported
    // strict accuracy.
    //
    // The cast is the point of the test. `ScoreTargetId` is a closed union, so
    // an unnamed target can only arrive from outside the type system -- which is
    // exactly the situation the guard exists to catch. `scoreOfficial` is the
    // public entry point and it receives whatever its caller passes.
    const files = exportOpenRca(validBundle()).files;
    expect(() => scoreOfficial('openrca-9.9' as ScoreTargetId, files, [])).toThrow(
      /no ground-truth reader for score target 'openrca-9\.9'/,
    );
  });

  it('answers every case with a per-case score before it aggregates', () => {
    // `aggregateFor` is reached only after each case has been scored, so the
    // guard at the end of its `if` chain is unreachable for a target the reader
    // already accepted. This pins that ordering: a named target yields as many
    // per-case scores as there are answer keys, so the two guards cannot both
    // fire and the reachable one is always the informative one.
    //
    // It is the same shape as the ordering anchor in the vocabulary suite: two
    // guards that can both answer the same input are only safe if the one that
    // fires first is the one that names the problem.
    const files = exportOpenRca2(validBundle()).files;
    const report = scoreOfficial('openrca-2.0', files);
    expect(report.cases.length).toBe(report.caseCount);
    expect(report.cases.length).toBe(readOfficialGroundTruth('openrca-2.0', files).length);
    expect(report.cases.every((c) => c.score >= 0 && c.score <= 1)).toBe(true);
  });

  it('reaches the aggregation guard for every target the reader accepts', () => {
    // The two guards above are a pair: the reader rejects a target it has no
    // case for, and the aggregator rejects a target it has no formula for. A
    // target that passes the reader therefore reaches the aggregator, which is
    // what makes the first guard the informative one and the second a
    // compile-time backstop. If a target ever passed the reader and fell through
    // the aggregator's chain, this is where it would show up -- as an exception
    // naming the target instead of a silent number.
    for (const target of SCORE_TARGET_IDS) {
      expect(() => scoreOfficial(target, {}), `target ${target}`).not.toThrow(
        /no aggregation branch|no ground-truth reader/,
      );
    }
  });

  it('names the target rather than crashing on an undefined read', () => {
    // `readOfficialGroundTruth` is a `switch` with a case per target and no
    // `default`. An unnamed target used to make it fall off the end and return
    // `undefined` while typed `OfficialGroundTruth[]`, and the caller died on
    // `.map` with "Cannot read properties of undefined (reading 'map')" -- a
    // message naming neither the target nor the omission. The guard makes the
    // first failure the informative one.
    const files = exportOpenRca(validBundle()).files;
    expect(() => readOfficialGroundTruth('openrca-9.9' as ScoreTargetId, files)).toThrow(
      /no ground-truth reader for score target 'openrca-9\.9'/,
    );
    expect(() => readOfficialGroundTruth('openrca-9.9' as ScoreTargetId, files)).not.toThrow(/Cannot read propert/);
  });
});
