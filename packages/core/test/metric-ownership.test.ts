/**
 * The metric a target publishes must be that target's own.
 *
 * The defect this closes: `OFFICIAL_METRICS` is typed
 * `Record<ScoreTargetId, OfficialMetricSpec>`, so a missing or extra key is a
 * compile error. What the type cannot prove is that the value filed under a key
 * belongs to that key. Pointing `'rcaeval-re3'` at `rcaevalMetric('RE1')` left
 * all 1495 tests green, and `official:check` still reported
 * "Official-metric regression PASSED" -- it is blind there because `rcaeval-re3`
 * is skipped by contract, so the wrong spec is carried in the report and never
 * read. That is iteration 17's lesson again: exhaustiveness is not correctness.
 *
 * The metric is not decoration. It is embedded in every regression report and
 * printed by `rca-bench official` as the cited provenance of a score, and its
 * `facets` drive `scoreFacetSubset`. A spec filed under the wrong target would
 * cite the wrong paper for a number the tool reports, and score the wrong
 * facets while doing it.
 *
 * Two facts about the registry are asserted below, and the second is the one
 * that actually catches a swap:
 *
 *  1. **Ownership.** An id is unique across the registry and, for the seven
 *     targets whose id is a target slug, it names that target.
 *  2. **Non-substitutability.** No target's metric may be any *other* target's
 *     metric. This is checked by identity against every sibling, so it holds
 *     even for the two targets whose id is a published metric name rather than
 *     a slug, and it is what makes a swap visible no matter how the ids read.
 *
 * The existing tests already cover presence (`toBeDefined`, non-empty strings);
 * a second presence check would add coverage without adding detection.
 */

import { describe, expect, it } from 'vitest';

import { SCORE_TARGET_IDS, scoreTargetInvocation } from '../src/score/targets.js';
import { OFFICIAL_METRICS, officialMetric } from '../src/score/official.js';
import { RCAEVAL_SUITES } from '../src/export/rcaeval.js';

/** The three score targets that select an RCAEval suite. */
const RCAEVAL_TARGETS = SCORE_TARGET_IDS.filter((t) => t.startsWith('rcaeval-'));

/**
 * The two targets whose id is the upstream metric's own published name rather
 * than a slug of the target. Named explicitly so that a *third* such target
 * appearing later is a test failure rather than a silent widening of this rule.
 */
const METRIC_NAMED_IDS: Record<string, string> = {
  'openrca-1.0': 'openrca-strict-accuracy',
  'openrca-2.0': 'openrca2-pave-verification',
};

describe('every target publishes a metric that is its own', () => {
  it.each(SCORE_TARGET_IDS)('%s publishes an id naming itself', (target) => {
    const expected = METRIC_NAMED_IDS[target];
    if (expected !== undefined) {
      expect(officialMetric(target).id).toBe(expected);
      return;
    }
    expect(officialMetric(target).id).toContain(target);
  });

  it('names a metric id for exactly the two targets whose upstream name is not a slug', () => {
    // A pin, not a membership check: adding a third metric-named target, or
    // removing one of these two, must fail here.
    expect(Object.keys(METRIC_NAMED_IDS).toSorted()).toEqual(['openrca-1.0', 'openrca-2.0']);
  });

  it.each(RCAEVAL_TARGETS)('%s publishes the id and name its suite defines', (target) => {
    // `rcaeval-re2` -> `rcaeval-re2-avg5`. Pinned exactly rather than by prefix,
    // so the `-avg5` suffix cannot quietly change meaning.
    expect(officialMetric(target).id).toBe(`${target}-avg5`);
    expect(officialMetric(target).name).toBe(
      `RCAEval ${scoreTargetInvocation(target).suite} AC@k / Avg@5`,
    );
  });

  it('never files the same metric under two targets', () => {
    // A registry where two keys point at one spec is the shape a bad
    // find-and-replace leaves behind, and no presence check would notice.
    const ids = SCORE_TARGET_IDS.map((t) => officialMetric(t).id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = SCORE_TARGET_IDS.map((t) => officialMetric(t).name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('no target publishes another target\'s metric', () => {
  it.each(SCORE_TARGET_IDS)('%s is not any sibling\'s metric', (target) => {
    // The non-substitutability check. Comparing by identity rather than by id
    // means this holds for every target, including the two whose id is a
    // published metric name, and it is what makes a swapped registry entry
    // fail rather than merely look unusual.
    const mine = officialMetric(target);
    for (const other of SCORE_TARGET_IDS) {
      if (other === target) continue;
      expect(officialMetric(other), `${target} must not be ${other}'s metric`).not.toBe(mine);
    }
  });

  it('gives every target a distinct metric value, not a shared reference', () => {
    const specs = SCORE_TARGET_IDS.map((t) => officialMetric(t));
    expect(new Set(specs).size).toBe(specs.length);
  });

  it.each(RCAEVAL_TARGETS)('%s differs from the other two suites\' metrics', (target) => {
    const mine = officialMetric(target);
    const others = RCAEVAL_TARGETS.filter((t) => t !== target).map((t) => officialMetric(t));
    for (const other of others) {
      expect(other.id, `${target} vs ${other.id}`).not.toBe(mine.id);
      expect(other.name, `${target} vs ${other.name}`).not.toBe(mine.name);
    }
  });

  it('represents every suite the vocabulary defines', () => {
    // Every suite in the vocabulary must be reachable through some target's
    // metric, so a newly added suite cannot sit unrepresented in the registry.
    const represented = RCAEVAL_TARGETS.map((t) => officialMetric(t).name);
    for (const suite of RCAEVAL_SUITES) {
      expect(
        represented.some((name) => name.includes(`RCAEval ${suite} `)),
        `suite ${suite} is unrepresented`,
      ).toBe(true);
    }
  });
});

describe('the registry and its accessor agree on ownership', () => {
  it.each(SCORE_TARGET_IDS)('%s resolves to the entry filed under its own key', (target) => {
    expect(officialMetric(target)).toBe(OFFICIAL_METRICS[target]);
  });

  it('files each metric under the key its own id name implies', () => {
    const byId = new Map(SCORE_TARGET_IDS.map((t) => [officialMetric(t).id, t]));
    expect(byId.get('rcaeval-re1-avg5')).toBe('rcaeval-re1');
    expect(byId.get('rcaeval-re2-avg5')).toBe('rcaeval-re2');
    expect(byId.get('rcaeval-re3-avg5')).toBe('rcaeval-re3');
  });
});
