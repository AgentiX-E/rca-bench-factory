import { describe, expect, it } from 'vitest';
import { buildCloudOpsBenchMetadata } from '../src/export/cloudopsbench.js';
import { DIFFICULTIES, difficultyFor, type Difficulty } from '../src/export/difficulty.js';
import { buildItBenchScenarioSpec } from '../src/export/itbench.js';
import type { FaultCase } from '../src/ir/types.js';
import { validCase } from './fixtures.js';

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
    const itbench = buildItBenchScenarioSpec(fc);
    const cloudOps = buildCloudOpsBenchMetadata(fc);
    expect(itbench.scenario_complexity).toBe(word);
    expect(cloudOps.difficulty).toBe(word);
    expect(itbench.scenario_complexity).toBe(cloudOps.difficulty);
  });

  it('emits a word outside the shared vocabulary for no level', () => {
    for (const [level] of LEVELS) {
      const fc = withLevel(level);
      expect(DIFFICULTIES).toContain(buildItBenchScenarioSpec(fc).scenario_complexity as string);
      expect(DIFFICULTIES).toContain(buildCloudOpsBenchMetadata(fc).difficulty as string);
    }
  });
});
