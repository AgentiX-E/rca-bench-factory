import { describe, expect, it } from 'vitest';
import { buildCloudOpsBenchMetadata } from '../src/export/cloudopsbench.js';
import { DIFFICULTIES, difficultyFor, projectDifficulty, type Difficulty } from '../src/export/difficulty.js';
import { buildItBenchScenarioSpec } from '../src/export/itbench.js';
import { buildEntityIndex } from '../src/export/rca100.js';
import type { FaultCase } from '../src/ir/types.js';
import { threeStepBundle, twoKindBundle, validBundle, validCase } from './fixtures.js';

/**
 * The shared easy/medium/hard vocabulary.
 *
 * `itbench` publishes the word as `scenario_complexity` and `cloud-opsbench` as
 * `difficulty`, but the rule that produces it is one rule. It used to exist as
 * two byte-identical private copies (`complexityFor` in `itbench.ts`,
 * `difficultyFor` in `cloudopsbench.ts`), which is the third-source-of-truth
 * defect `validity.test.ts` names: edit one and the other silently disagrees.
 * This suite pins the single source and -- the assertion that makes the
 * unification *observable* rather than merely structural -- that both exporters
 * project the same case to the same word.
 */

/** Every IR level, plus the unset case, and the word each must produce. */
const LEVELS: Array<[FaultCase['difficulty'], Difficulty]> = [
  ['L1', 'easy'],
  ['L2', 'medium'],
  ['L3', 'hard'],
  ['L4', 'hard'],
  [undefined, 'medium'],
];

function withLevel(level: FaultCase['difficulty']): FaultCase {
  const base = validCase();
  return level === undefined
    ? { ...base, difficulty: undefined }
    : { ...base, difficulty: level };
}

describe('DIFFICULTIES', () => {
  it('is exactly the three published words, in published order', () => {
    expect([...DIFFICULTIES]).toEqual(['easy', 'medium', 'hard']);
  });

  it('carries no duplicate', () => {
    expect(new Set(DIFFICULTIES).size).toBe(DIFFICULTIES.length);
  });
});

describe('difficultyFor', () => {
  it.each(LEVELS)('maps %s to %s', (level, word) => {
    expect(difficultyFor(level)).toBe(word);
  });

  it('reaches the default arm, which is the documented "unset -> medium" row', () => {
    // The union `L1|L2|L3|L4` is closed and every level has its own case label,
    // so the only value that reaches `default` is `undefined` -- the optional
    // field's absent state, not an unrecognised level. Asserting it here is what
    // keeps the arm honestly covered instead of being deleted as dead code.
    expect(difficultyFor(undefined)).toBe('medium');
  });

  it('produces a word from the declared vocabulary for every level', () => {
    for (const [level] of LEVELS) {
      expect(DIFFICULTIES).toContain(difficultyFor(level));
    }
  });
});

describe('one vocabulary, two projections', () => {
  /**
   * The unification is only worth anything if both fields really come from the
   * one rule. Structural sharing is invisible to a reader of the exported
   * artefact, so the assertion is on the artefacts: the same case must produce
   * the same word through both exporters.
   */
  it.each(LEVELS)('both exporters emit %s for level %s', (level, word) => {
    const fc = withLevel(level);
    const itbench = buildItBenchScenarioSpec(fc, buildEntityIndex(validBundle().graph), validBundle().graph);
    const cloudOps = buildCloudOpsBenchMetadata(fc, validBundle().graph);
    expect(itbench.scenario_complexity).toBe(word);
    expect(cloudOps.difficulty).toBe(word);
    expect(itbench.scenario_complexity).toBe(cloudOps.difficulty);
  });

  it('emits a word outside the shared vocabulary for no level', () => {
    for (const [level] of LEVELS) {
      const fc = withLevel(level);
      expect(DIFFICULTIES).toContain(
        buildItBenchScenarioSpec(fc, buildEntityIndex(validBundle().graph), validBundle().graph).scenario_complexity as string,
      );
      expect(DIFFICULTIES).toContain(buildCloudOpsBenchMetadata(fc, validBundle().graph).difficulty as string);
    }
  });
});

/**
 * The projection both exporters read.
 *
 * The function exists so that the pair (claim, floor) is produced once rather than assembled twice,
 * which is the same third-source argument the vocabulary above is argued with -- one level further
 * up, because a floor paired by hand in two exporters is two answers with no reader comparing them.
 */
describe('projectDifficulty', () => {
  it('projects the claim and the floor onto the same three words', () => {
    const bundle = { ...validBundle(), cases: [{ ...validCase({ difficulty: 'L4' }) }] };
    expect(projectDifficulty({ case: bundle.cases[0]!, graph: bundle.graph })).toEqual({
      difficulty: 'hard',
      floor: 'easy',
    });
  });

  it('keeps the claim when the claim is above the floor', () => {
    const bundle = twoKindBundle();
    // `twoKindBundle`'s chain is one step over two kinds, so the floor is `L2`; the annotation is
    // `L4`. Publishing the floor must not replace the claim -- a case can be hard to detect while
    // being easy to trace, and that judgement is what `difficulty` carries.
    expect(projectDifficulty({ case: { ...bundle.cases[0]!, difficulty: 'L4' }, graph: bundle.graph })).toEqual({
      difficulty: 'hard',
      floor: 'medium',
    });
  });

  it('reports the documented unset claim beside the floor rather than instead of it', () => {
    // The absent case takes the unset -> medium row, and that is a default, not a claim: the pair
    // says both facts, which is the only way a reader can tell the two apart.
    const bundle = threeStepBundle();
    expect(projectDifficulty({ case: bundle.cases[0]!, graph: bundle.graph })).toEqual({
      difficulty: 'medium',
      floor: 'hard',
    });
  });

  it('is monotone: the floor never outranks the claim in a corpus the guard would pass', () => {
    // The property that makes the second word readable rather than a contradiction. It holds because
    // a level below the floor is refused as a shortfall before any export is built, and the case
    // that would break it is the one `findDifficultyShortfalls` names.
    const rank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
    for (const level of ['L1', 'L2', 'L3', 'L4'] as const) {
      const pair = projectDifficulty({ case: { ...validCase({ difficulty: level }) }, graph: validBundle().graph });
      expect(rank[pair.floor]).toBeLessThanOrEqual(rank[pair.difficulty]);
    }
  });
});
