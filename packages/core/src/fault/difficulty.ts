import type { EntityGraph, FaultCase } from '../ir/types.js';
import { indexGraph } from '../entity/graph.js';

/**
 * The lowest difficulty a case's *structure* can support.
 *
 * `FaultCase.difficulty` had no definition anywhere in this repository: `docs/data-model.md`
 * declared the field as `'L1'|'L2'|'L3'|'L4'`, `docs/targets/cloud-opsbench.md` published the
 * projection onto `easy`/`medium`/`hard`, and nothing said what makes a case L3 rather than L2. The
 * corpus showed what fills a gap like that: five cases are annotated, and the annotation does not
 * track structure at all. Two cases with one causal step and two entity kinds are labelled L2 and
 * L3; a case with two steps and three kinds is labelled L2. Each was a judgement made once, and no
 * two of them are comparable.
 *
 * This module does not invent the missing definition. It states the one property any definition
 * must have -- **monotonicity**: a case that is structurally harder cannot be labelled easier than
 * one that is structurally simpler -- and it derives the floor from the two facts a case actually
 * carries:
 *
 * - `depth`, the number of causal steps. A step means a reader has to follow the fault through
 *   another entity to reach the symptom;
 * - `breadth`, the number of distinct entity kinds the chain touches. A chain that stays inside
 *   `service` is one question; one that runs `container -> pod -> service` is three.
 *
 * The floor is a lower bound and nothing more. A case at the floor may be nearly impossible for a
 * model and a case above it may be trivial -- this says only that the annotation cannot claim *less*
 * structure than the annotation itself carries. That is deliberately weaker than a definition and
 * deliberately checkable, which the alternative was not.
 *
 * ## Why the table is written out rather than computed
 *
 * The rows are the four combinations the corpus produces, written as a `switch` on two small
 * integers. A formula would have been shorter and would have hidden the only decision in it: where
 * along the ladder a chain that is deep but narrow belongs (`L3`, at two steps, because following a
 * fault through an intermediate entity is the thing that costs a reader, not the number of kinds).
 * Stated as rows, that choice can be argued with.
 */
export function difficultyFloor(input: {
  case: FaultCase;
  graph: EntityGraph;
}): NonNullable<FaultCase['difficulty']> {
  const index = indexGraph(input.graph);
  const truth = input.case.groundTruth;
  const chain = truth.causalChain ?? [];

  const kinds = new Set<string>();
  const add = (ref: string): void => {
    const resolved = index.byId.get(ref);
    if (resolved !== undefined) kinds.add(resolved.kind);
  };
  add(truth.rootCauseEntityId);
  for (const step of chain) {
    add(step.fromEntityId);
    add(step.toEntityId);
  }

  const depth = chain.length;
  const breadth = kinds.size;

  // Depth decides above one step, and breadth decides below it. `breadth >= 3` is deliberately not
  // a separate row: a one-step chain runs from the root cause to its consequence, so its ends
  // contribute at most two kinds unless the root cause is off the chain -- and a root cause off its
  // own chain is a defect G2's case semantics refuses (`ROOT_OFF_ITS_CHAIN`, finding 281). That
  // sentence used to say "the four-layer assessment already refuses", and it was false when it was
  // written: nothing refused it, and this row's justification rested on a check that did not exist.
  // Writing the row as though it were reachable was a branch no case can take, which is the shape
  // this volume spends its rounds removing; the first draft of this function had it.
  if (depth >= 3) return 'L4';
  if (depth >= 2) return 'L3';
  if (breadth >= 2) return 'L2';
  return 'L1';
}

/** A case whose declared level is below what its own structure supports. */
export interface DifficultyShortfall {
  caseId: string;
  declared: NonNullable<FaultCase['difficulty']>;
  floor: NonNullable<FaultCase['difficulty']>;
}

const RANK: Record<NonNullable<FaultCase['difficulty']>, number> = { L1: 1, L2: 2, L3: 3, L4: 4 };

/**
 * Cases that claim less structure than they carry.
 *
 * A case with no declared level is not a shortfall: the field is optional, and an absent level is
 * reported by the caller as coverage rather than refused here. Only a level that was written down
 * and is lower than the floor is reported -- that is an annotation contradicting the case it
 * annotates, which is a defect the way a misspelled word is.
 */
export function findDifficultyShortfalls(input: {
  cases: FaultCase[];
  graph: EntityGraph;
}): DifficultyShortfall[] {
  const out: DifficultyShortfall[] = [];
  for (const faultCase of input.cases) {
    const declared = faultCase.difficulty;
    if (declared === undefined) continue;
    const floor = difficultyFloor({ case: faultCase, graph: input.graph });
    if (RANK[declared] < RANK[floor]) {
      out.push({ caseId: faultCase.caseId, declared, floor });
    }
  }
  return out;
}
