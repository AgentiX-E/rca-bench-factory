/**
 * The shared difficulty vocabulary.
 *
 * Two exporters publish an easy/medium/hard word for the same IR level:
 * `itbench` calls the field `scenario_complexity` and `cloud-opsbench` calls it
 * `difficulty`. The rule that produces it used to exist as two byte-identical
 * private copies -- `complexityFor` in `itbench.ts` and `difficultyFor` in
 * `cloudopsbench.ts` -- which is the third-source-of-truth defect
 * `validity.test.ts` names: an edit to one silently disagrees with the other,
 * and nothing catches it because each exporter is individually self-consistent.
 *
 * Declared once here and projected by both. The module is a leaf -- it imports
 * only the IR type -- so the dependency runs one way: `itbench` and
 * `cloudopsbench` and the scorer all depend on it, and it depends on nothing but
 * the type of the level it reads.
 */

import type { FaultCase } from '../ir/types.js';

/**
 * Every word the difficulty field can carry, in the order the docs publish them.
 *
 * `Difficulty` is derived from this tuple rather than declared beside it, which
 * is what makes the word list a *single* source: a value the function returns
 * that is not a member is a compile error, not a silent widening.
 */
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

/** A difficulty word. Derived from `DIFFICULTIES`. */
export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * Project an IR difficulty level onto the shared easy/medium/hard vocabulary.
 *
 * The `default` arm is reachable and is deliberately kept. `FaultCase.difficulty`
 * is optional, so `undefined` is the one value no `case` label matches; it is the
 * documented *unset -> medium* row, not a fallback for an unrecognised level --
 * the union `L1|L2|L3|L4` is closed, so `tsc` already guarantees no other value
 * arrives. Deleting the arm would make the function's return type disagree with
 * its inferred one for the absent case.
 */
export function difficultyFor(level: FaultCase['difficulty']): Difficulty {
  switch (level) {
    case 'L1':
      return 'easy';
    case 'L2':
      return 'medium';
    case 'L3':
    case 'L4':
      return 'hard';
    default:
      return 'medium';
  }
}
