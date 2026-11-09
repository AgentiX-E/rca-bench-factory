import type { EntityGraph, FaultCase } from '../ir/types.js';
import { indexGraph } from '../entity/graph.js';
import { MIN_SENTENCE_LENGTH, looksLikeSentence } from '../util/prose.js';

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

/** One of the four levels, named once so the two readers of the ladder agree on the type. */
export type DifficultyLevel = NonNullable<FaultCase['difficulty']>;

const RANK: Record<DifficultyLevel, number> = { L1: 1, L2: 2, L3: 3, L4: 4 };

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

/**
 * The other half of monotonicity, which the floor cannot state on its own.
 *
 * `difficultyFloor` refuses a level *below* the structure. Nothing refused a level far **above** it,
 * and the corpus shows what that costs: six of its thirty-three cases claim more than their chains
 * carry, and one of them claims `L4` -- the level every other holder reaches with three hops -- on a
 * chain of **one**, over `pricing-service -> tax-calculation` (finding 494). `docs/data-model.md`
 * permits the excess on purpose, because a floor is not a rating and a case can be hard to *detect*
 * while being easy to trace: the same case moves three baseline standard deviations inside the band
 * its alert treats as noise, so nothing fired and the question is whether there was an incident at
 * all.
 *
 * A permission with no condition is how a label stops meaning anything. So the condition is the one
 * an author can always meet and a reader can always argue with: **a claim above the floor has to say
 * what the floor cannot see.** That is the same shape as `fault.parameterNotes` (finding 326) and
 * the same limit applies -- a guard can check that the sentence is there, in the right place, and as
 * long as a clause; it cannot check that it is true.
 *
 * The converse is refused as well, and it is the placement rule that keeps the field meaningful: a
 * note **exactly at** the floor explains a gap of nothing, because the label there makes the weakest
 * claim the structure supports. If a case has something to say about why it is hard, that is a claim
 * above the floor and the label is what should say so. A level *below* the floor is left alone: the
 * shortfall rule already refuses it, and two sentences about one mistake is the defect this campaign
 * keeps deleting.
 */
export type DifficultyClaimFault =
  | { kind: 'unsupported'; caseId: string; declared: DifficultyLevel; floor: DifficultyLevel }
  | { kind: 'redundant'; caseId: string; declared: DifficultyLevel; floor: DifficultyLevel }
  | { kind: 'stray'; caseId: string; note: string }
  | { kind: 'notText'; caseId: string; note: unknown }
  | { kind: 'label'; caseId: string; note: string };

/** One case's level read against its own structure, with every way its note fails to answer. */
export interface DifficultyClaim {
  readonly caseId: string;
  /** The level the case states, if it states one. */
  readonly declared: DifficultyLevel | undefined;
  /** The level its own chain and breadth support at the least. */
  readonly floor: DifficultyLevel;
  /** Whether the case claims more than the floor. */
  readonly above: boolean;
  readonly faults: readonly DifficultyClaimFault[];
}

/**
 * Read one case's level against its structure and its reason.
 *
 * The order of the checks is the order of the defects: a level below the floor is somebody else's
 * refusal (`findDifficultyShortfalls`), so it is neither an unsupported claim nor a redundant note
 * and this function says nothing about it. A note that is not text is refused as itself before its
 * length is judged, because "a note is a sentence" is the weaker statement.
 */
export function readDifficultyClaim(input: {
  case: FaultCase;
  graph: EntityGraph;
}): DifficultyClaim {
  const caseId = input.case.caseId;
  const declared = input.case.difficulty;
  const floor = difficultyFloor({ case: input.case, graph: input.graph });
  const note = input.case.difficultyNote;
  const faults: DifficultyClaimFault[] = [];

  if (declared === undefined) {
    // A note with no level has nothing to explain: it is what a relabelling leaves behind.
    if (typeof note === 'string') faults.push({ kind: 'stray', caseId, note });
    else if (note !== undefined) faults.push({ kind: 'notText', caseId, note });
    return { caseId, declared, floor, above: false, faults };
  }

  const above = RANK[declared] > RANK[floor];
  if (note !== undefined && typeof note !== 'string') {
    faults.push({ kind: 'notText', caseId, note });
    return { caseId, declared, floor, above, faults };
  }
  if (above && note === undefined) faults.push({ kind: 'unsupported', caseId, declared, floor });
  if (above && note !== undefined && !looksLikeSentence(note)) faults.push({ kind: 'label', caseId, note });
  if (RANK[declared] === RANK[floor] && note !== undefined) {
    faults.push({ kind: 'redundant', caseId, declared, floor });
  }
  return { caseId, declared, floor, above, faults };
}

/** The sentence a reader of the guard's output gets for each way a level's evidence falls short. */
export function describeDifficultyClaimFault(fault: DifficultyClaimFault): string {
  switch (fault.kind) {
    case 'unsupported':
      return (
        `'${fault.caseId}' is labelled ${fault.declared} and its own structure supports ${fault.floor}, ` +
        'and fault.difficultyNote says nothing -- a level above the floor claims something the chain ' +
        'cannot show, and the note is where the case says what'
      );
    case 'redundant':
      return (
        `'${fault.caseId}' is labelled ${fault.declared}, which is exactly what its structure supports, ` +
        'and it carries a fault.difficultyNote -- there is no gap for the sentence to explain; a case ' +
        'that is harder than its chain says so in `difficulty`, not in a note beside it'
      );
    case 'stray':
      return (
        `'${fault.caseId}' carries a fault.difficultyNote and declares no difficulty at all, so the ` +
        'note explains a claim nobody made'
      );
    case 'notText':
      return `'${fault.caseId}' carries fault.difficultyNote as ${JSON.stringify(fault.note)}, and a note is a sentence of text`;
    case 'label':
      return (
        `'${fault.caseId}' explains its level with '${fault.note}', which is a label: a note says what ` +
        `the chain cannot show, in at least ${String(MIN_SENTENCE_LENGTH)} characters and ending as a sentence does`
      );
  }
}
