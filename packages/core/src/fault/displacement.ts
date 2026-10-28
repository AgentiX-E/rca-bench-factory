import type { EntityGraph, FaultCase } from '../ir/types.js';

/**
 * Why the answer is not at rank 1, when it is not.
 *
 * `checkDiscrimination` used to ask one question -- is the answer at rank 1 -- and count three
 * different situations as one. They are not the same thing, and the difference decides whether a
 * case is evidence that the corpus can penalise a magnitude-based method:
 *
 * | kind | what happened | what it means |
 * | --- | --- | --- |
 * | `strict` | a different component is louder than the answer | any method that ranks by magnitude returns the wrong component, deterministically |
 * | `tie` | a different component has the *same* statistic and wins the name | the method's own number cannot separate them; the order is a tiebreak |
 * | `same-component` | the louder candidate is a part of the answer, or its host | the method named the right component family |
 * | `none` | the answer is at rank 1, or is absent from the ranking | nothing was displaced |
 *
 * Only `strict` is evidence a benchmark wants, and it is the only kind the corpus rule accepts. A
 * `tie` is fragile -- renaming one service flips it -- and `same-component` is not a miss at all: a
 * method that returns `checkout-0` when the answer is `checkout` has named the replica, and the
 * corpus's own checkout case is in exactly that state.
 */

export type DisplacementKind = 'strict' | 'tie' | 'same-component' | 'none';

export interface DisplacementReading {
  caseId: string;
  kind: DisplacementKind;
}

/** One candidate from a localiser's output. The two baselines call the statistic different things. */
export interface RankedCandidate {
  service: string;
  statistic: number;
}

/**
 * Relations that make two entities the same component at different resolutions.
 *
 * A service contains its pods, a pod contains its containers, and a node hosts the pods it runs.
 * Following these in either direction is what "the same component" means here; a `calls` edge is
 * not, and two replicas of one service are siblings rather than ancestors of each other.
 */
const CONTAINMENT_RELATIONS = new Set(['contains', 'hosts']);

/**
 * Name-to-entity, keeping only the names that resolve to exactly one entity.
 *
 * A name two entities share is not a reference: `resolveEntityRef` refuses it elsewhere for the same
 * reason, and guessing here would let an ambiguous name count as "the same component" or as "a
 * different one" without anything having decided which.
 */
function entitiesByName(graph: EntityGraph): Map<string, string> {
  const byName = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const entity of graph.entities) {
    if (byName.has(entity.name)) ambiguous.add(entity.name);
    else byName.set(entity.name, entity.entityId);
  }
  for (const name of ambiguous) byName.delete(name);
  return byName;
}

/**
 * Whether `ancestor` contains (or hosts) `descendant`, at any depth.
 *
 * Directed, not undirected, and the difference is the whole of the `same-component` judgement. Two
 * replicas of one service are both reached from their service by containment, so an undirected walk
 * would call them one component -- and returning the wrong replica is a miss, not a hit at a coarser
 * resolution. What counts is that one end is inside the other: the pod under its service, the
 * container in its pod, the node hosting a pod.
 */
function isAncestor(graph: EntityGraph, ancestor: string, descendant: string): boolean {
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!CONTAINMENT_RELATIONS.has(edge.relation)) continue;
    const bucket = children.get(edge.from) ?? [];
    bucket.push(edge.to);
    children.set(edge.from, bucket);
  }
  const seen = new Set<string>([ancestor]);
  const queue = [ancestor];
  while (queue.length > 0) {
    const at = queue.shift() as string;
    for (const next of children.get(at) ?? []) {
      if (next === descendant) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

/** Whether two entities are the same component at two resolutions, in either direction. */
function sameComponent(graph: EntityGraph, left: string, right: string): boolean {
  if (left === right) return true;
  return isAncestor(graph, left, right) || isAncestor(graph, right, left);
}

/**
 * Classify the case's ranking.
 *
 * `ranking` is the method's output **in the order it produced**, which is part of the contract: the
 * first entry is the method's answer and every later entry is no larger. The answer's own statistic
 * comes from the same list -- the two numbers have to be the same statistic or the comparison means
 * nothing, which is why this takes one list rather than an answer from one place and a ranking from
 * another.
 */
export function classifyDisplacement(input: {
  graph: EntityGraph;
  case: FaultCase;
  ranking: readonly RankedCandidate[];
}): DisplacementReading {
  const caseId = input.case.caseId;
  const top = input.ranking[0];
  if (top === undefined) return { caseId, kind: 'none' };

  const answerName = input.case.groundTruth.rootCauseComponent;
  const answer = input.ranking.find((one) => one.service === answerName);
  if (answer === undefined) return { caseId, kind: 'none' };
  if (top.service === answerName) return { caseId, kind: 'none' };

  const byName = entitiesByName(input.graph);
  const topEntity = byName.get(top.service);
  const answerEntity = input.case.groundTruth.rootCauseEntityId;
  if (topEntity !== undefined && sameComponent(input.graph, topEntity, answerEntity)) {
    return { caseId, kind: 'same-component' };
  }

  // Two arms and no third. `top` is the first entry of the method's own output, so under the contract
  // stated in this function's docstring it is that output's largest -- which makes "different
  // service" mean "strictly louder", and equality mean the method could not separate the two at all.
  // A third arm for `top < answer` would be a branch no caller can reach: the shape this volume keeps
  // deleting, asserted by nothing and covered by nothing.
  return top.statistic === answer.statistic ? { caseId, kind: 'tie' } : { caseId, kind: 'strict' };
}
