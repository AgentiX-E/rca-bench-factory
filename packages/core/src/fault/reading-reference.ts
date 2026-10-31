import { indexGraph, resolveEntityRef, sameComponent } from '../entity/graph.js';
import type { EntityGraph } from '../ir/types.js';

/**
 * Which series a checkpoint's `signalRef` names, and what happens when the answer is not one series.
 *
 * ## The defect this exists for
 *
 * A series is a reading taken *on* something, so its identity is the pair `(entity, metric)` -- which
 * is how `fault/background.ts` resolves a case's own declaration against the background, and how both
 * localisers key their per-service statistics. The guard did not: it built a map keyed on the metric
 * name and read out of it, so the entity in a checkpoint was decoration. Measured over the shipped
 * corpus, 13 of 73 series checkpoints name an entity that does not carry the reading -- a container
 * whose memory figure is filed under its service -- and the guard accepted them for the same reason
 * it would have accepted a checkpoint pointed at an unrelated pod: the name was never compared.
 *
 * The rule next door had it right. `fault/log-attribution.ts` resolves both the checkpoint's entity
 * and the log line's author and refuses them as different components; ten lines away, the series
 * branch did not look. One file, one kind of reference checked, the other not (finding 323).
 *
 * ## Containment, not equality
 *
 * The thirteen are not mistakes. A container's working set is a container measurement, and filing it
 * under the service is the corpus's choice because the ranking a solver sees is per service -- so an
 * equality rule would refuse thirteen annotations and the honest half of the rule with them. What is
 * required is that the reading is about the entity the checkpoint names *or something that entity is
 * part of*, which is what `sameComponent` asks and what `checkLogAttribution` already relies on.
 *
 * ## Ambiguity is a refusal, not a tiebreak
 *
 * One metric on two entities is ordinary telemetry and, until this round, impossible to declare: the
 * signals file refused a repeated metric name outright. With the pair, it is allowed, and the
 * resolution above stops being a total function unless a metric can be carried by several components
 * at once. It can -- a partition is one cluster's two halves, each reporting its own member count --
 * so the resolver returns `ambiguous` rather than picking one, and the message names the carriers.
 * A guard that broke the tie would be a coin toss it reports as an answer.
 */

/** A declared series, read for the two fields that identify it. */
export interface ReadingCarrier {
  service?: string;
  metric?: string;
}

/** What a checkpoint's `(entityRef, metric)` matched, or the one thing that stopped it. */
export type ReadingMatch<T extends ReadingCarrier = ReadingCarrier> =
  /**
   * Exactly one series carries the metric on the checkpoint's entity, or on its component.
   *
   * The series itself, not its name: a caller that got a string would look it up again in a map it
   * built from the same list, and two lookups are two chances to answer differently -- the defect
   * this module exists for, one level down. It is the object the caller passed in, because a caller
   * hands in a declaration and then reads its `unit` and its points off the answer.
   */
  | { kind: 'resolved'; series: T; via: 'entity' | 'component' }
  /** No series declares the metric at all. */
  | { kind: 'unknownMetric'; metric: string; declares: string[] }
  /** The checkpoint names an entity the graph does not hold, so no carrier can be compared to it. */
  | { kind: 'unknownEntity'; metric: string; entityRef: string }
  /** The metric is declared, and every carrier is a different component from the named entity. */
  | { kind: 'otherComponent'; metric: string; entityRef: string; carriers: string[] }
  /** The metric is declared on more than one component the named entity cannot tell apart. */
  | { kind: 'ambiguous'; metric: string; entityRef: string; carriers: string[] };

/**
 * Resolve `(entityRef, metric)` against the series a case declares.
 *
 * The input is normalised once, at the top, because the caller hands in the raw JSON it read: a
 * field that is absent is a string the file did not write, and `String(one?.service ?? '')` in six
 * places would be six arms to reach and six chances for one of them to say something different.
 *
 * `via` is reported rather than folded away: a resolution through containment is a legitimate one and
 * a different statement from an exact one, and the caller prints the split so a reader can see how
 * much of the corpus relies on the weaker form.
 */
export function resolveReading<T extends ReadingCarrier>(input: {
  metric: string;
  entityRef: string;
  series: readonly T[];
  graph: EntityGraph;
}): ReadingMatch<T> {
  const declared = input.series.map((one) => ({
    carrier: one,
    service: String(one?.service ?? ''),
    metric: String(one?.metric ?? ''),
  }));
  const candidates = declared.filter((one) => one.metric === input.metric);
  if (candidates.length === 0) {
    const declares = [...new Set(declared.map((one) => one.metric))].filter((one) => one !== '');
    return { kind: 'unknownMetric', metric: input.metric, declares };
  }
  const index = indexGraph(input.graph);
  const entity = resolveEntityRef(input.entityRef, index);
  if (entity === null) return { kind: 'unknownEntity', metric: input.metric, entityRef: input.entityRef };

  // `resolveEntityRef` answers `null` for a name the graph does not hold, which includes the empty
  // name -- so a series with no `service` is a carrier nothing can compare, and it appears in the
  // refusal's list as the blank it is rather than being dropped.
  const exact = candidates.filter((one) => resolveEntityRef(one.service, index) === entity);
  if (exact.length === 1) return { kind: 'resolved', series: exact[0]!.carrier, via: 'entity' };
  // Two series with one metric on one entity is refused by the signals file -- `(service, metric)` is
  // the identity -- so this arm is a caller that passed a duplicate, and it is reported rather than
  // resolved to whichever came first.
  if (exact.length > 1) {
    return { kind: 'ambiguous', metric: input.metric, entityRef: input.entityRef, carriers: exact.map((one) => one.service) };
  }

  const contained = candidates.filter((one) => {
    const carrier = resolveEntityRef(one.service, index);
    return carrier !== null && sameComponent(input.graph, entity, carrier);
  });
  if (contained.length === 1) return { kind: 'resolved', series: contained[0]!.carrier, via: 'component' };
  if (contained.length > 1) {
    return {
      kind: 'ambiguous',
      metric: input.metric,
      entityRef: input.entityRef,
      carriers: contained.map((one) => one.service),
    };
  }
  return {
    kind: 'otherComponent',
    metric: input.metric,
    entityRef: input.entityRef,
    carriers: candidates.map((one) => one.service),
  };
}

/** Every way a reference can fail to name a series: `ReadingMatch` without the match. */
export type ReadingRefusal = Exclude<ReadingMatch, { kind: 'resolved' }>;

/**
 * One sentence per refusal, in the terms the annotation is written in.
 *
 * Here rather than at the call site for the reason `describeExpressionProblem` is: the four refusals
 * are four different repairs, and a caller that wrote its own sentences would collapse them into
 * "does not resolve" -- which sends an author to the signals file when the defect is in the
 * checkpoint, or to the checkpoint when the defect is a series filed under the wrong service. The
 * corpus guard prefixes these with the case and the checkpoint; nothing else about them is its
 * business.
 */
export function describeReadingProblem(problem: ReadingRefusal): string {
  switch (problem.kind) {
    case 'unknownMetric':
      return (
        `names '${problem.metric}', which the signals file does not declare ` +
        `(it declares: ${problem.declares.join(', ') || 'none'})`
      );
    case 'unknownEntity':
      return (
        `names '${problem.metric}' on '${problem.entityRef}', which the graph does not hold -- so ` +
        'nothing can say whether that is the entity the reading was taken on'
      );
    case 'otherComponent':
      return (
        `names '${problem.metric}' on '${problem.entityRef}', and the series carrying it are filed ` +
        `under ${problem.carriers.join(', ')}: a different component, so the assertion is about ` +
        'something other than what the checkpoint is about'
      );
    case 'ambiguous':
      return (
        `names '${problem.metric}' on '${problem.entityRef}', and ` +
        `${String(problem.carriers.length)} series carry it where that entity cannot tell them apart ` +
        `(${problem.carriers.join(', ')}), so the checkpoint has to name the one it means`
      );
  }
}
