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
 * Declared once here and projected by both. The dependency runs one way: `itbench`,
 * `cloudopsbench` and the scorer all depend on it. It was a leaf for as long as it read nothing but
 * the type of the level it is given, and it is not one any more: the projection below also reads the
 * floor, which is `fault/difficulty.ts`'s derivation over the graph. That import is the smaller
 * half of the trade -- the alternative is the same third-source defect one level up, two exporters
 * each pairing a claim with a floor by hand.
 */

import { difficultyFloor } from '../fault/difficulty.js';
import type { EntityGraph, FaultCase } from '../ir/types.js';

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

/**
 * The two words a contract publishes about one case's level.
 *
 * `difficulty` is the level the case **claims**, and the claim is a judgement: `docs/data-model.md`
 * permits a level above the structural floor because a case can be hard to *detect* while being easy
 * to trace, and `readDifficultyClaim` refuses that excess when the case does not say what the floor
 * cannot see. `floor` is the level the case's own chain and breadth support at the least, derived
 * from the graph rather than from the annotation.
 *
 * Both travel, because the artifact used to publish the claim alone and that made a judgement look
 * like a measurement: **six** of the corpus's **thirty-four** cases claim above their floor, and one
 * claims `L4` -- the level every other holder reaches with three causal steps -- over a chain of
 * **one**, so the exported word was `hard` for a case whose structure supports `medium`
 * (finding 553).
 *
 * ## Why one function and not two calls in two exporters
 *
 * Pairing a claim with a floor is the whole content of this projection, and pairing it by hand in
 * `itbench.ts` and `cloudopsbench.ts` is the third-source-of-truth defect this module was created to
 * remove: two files that have to agree, and no reader that compares them. So the pairing is here
 * once, and each exporter reads the two words off one object.
 *
 * ## What the floor is not
 *
 * A lower bound on *structure*. It is not a rating and not a second opinion about difficulty -- a
 * case at its floor may be trivial for a model and one above it may be easy -- and it is not above
 * the claim in a valid corpus, because a level below the floor is refused as a shortfall before any
 * export is built.
 */
export interface DifficultyProjection {
  /** The word the case's author claims, projected onto the three published words. */
  readonly difficulty: Difficulty;
  /** The word the case's own structure supports at the least, in the same three words. */
  readonly floor: Difficulty;
}

/**
 * Project one case's level and the floor its structure supports.
 *
 * The graph is required rather than optional, and that is the point: `difficultyFloor` resolves
 * entity kinds through the graph's index, so a floor computed over an empty or wrong graph is `L1`
 * for every case -- a wrong answer wearing the shape of a conservative one.
 */
export function projectDifficulty(input: { case: FaultCase; graph: EntityGraph }): DifficultyProjection {
  return {
    difficulty: difficultyFor(input.case.difficulty),
    floor: difficultyFor(difficultyFloor({ case: input.case, graph: input.graph })),
  };
}
