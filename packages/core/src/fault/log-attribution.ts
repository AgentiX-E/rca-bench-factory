import { indexGraph, resolveEntityRef, sameComponent } from '../entity/graph.js';
import type { EntityGraph, FaultCase } from '../ir/types.js';

/**
 * Whose line is it: the checkpoint names an entity, and the log line is attributed to one.
 *
 * A log checkpoint was checked for two things and joined on neither. `check-fault-cases.mjs`
 * resolves its `entityRef` through the four-layer assessment, and since finding 286 it compares the
 * phrase the checkpoint states against the body of the line it cites. What no rule asked is whether
 * the line is a line *from* the thing the checkpoint names. A checkpoint on the checkout pod could
 * cite the settlement parser's warning, find the phrase, and pass -- and the case would then be
 * resting on a sentence written by a component that is not in its chain.
 *
 * ## Why the relation is not equality
 *
 * Measured on the day this was written: the corpus carries **seven** log checkpoints, and an equality
 * rule would refuse **three** of them -- two name a *container* while the line is attributed to its
 * *service*, and one names a *pod* while the line comes from a container inside it. All three are
 * right. The other four name the service the line names, so equality happens to hold there, which is
 * exactly why the rule cannot be built on it: a convention that is right four times out of seven is a
 * convention that will be wrong the next time evidence is collected one layer in. A service, its pods,
 * its containers and the node that hosts them are one component at four resolutions, and which of the
 * four a checkpoint names is a matter of where the evidence was collected rather than of what it is
 * about. So the rule
 * is `sameComponent`, the judgement `classifyDisplacement` already makes about a ranking, and the
 * definition now lives in `entity/graph.ts` because this is its second caller.
 *
 * What it refuses is the case that judgement was built to refuse: the wrong **replica**. Two pods of
 * one service are siblings, not ancestors, and a line from `checkout-1` is not a line from
 * `checkout-0` -- it is a different component, however alike the two.
 *
 * ## What this does not do
 *
 * It does not decide whether the line *means* what the checkpoint says the case shows: containment
 * is a relation between two names, not an argument about a body. It also leaves two defects to the
 * checks that own them rather than reporting them twice: a checkpoint whose `entityRef` resolves to
 * nothing is the four-layer assessment's, and a checkpoint citing a log id no line carries is the
 * guard's. One defect, one message.
 */

/** A log line as a signals file declares it, read for the one field this rule needs. */
export interface LogLineAttribution {
  id?: string;
  service?: string;
}

/**
 * Problems with the join between a log checkpoint and the line it cites.
 *
 * Returns strings rather than a verdict because every caller reports them the same way, and because
 * a case with two misattributed checkpoints is one repair with two places to make it.
 */
export function checkLogAttribution(input: {
  graph: EntityGraph;
  case: FaultCase;
  logs: readonly LogLineAttribution[];
}): string[] {
  const problems: string[] = [];
  const index = indexGraph(input.graph);
  const byId = new Map<string, LogLineAttribution>();
  for (const one of input.logs) {
    if (typeof one?.id !== 'string' || one.id === '') continue;
    byId.set(one.id, one);
  }

  for (const checkpoint of input.case.groundTruth.evidenceCheckpoints ?? []) {
    if ((checkpoint.signalKind ?? 'series') !== 'log') continue;
    const ref = typeof checkpoint.signalRef === 'string' ? checkpoint.signalRef : '';
    const line = byId.get(ref);
    if (line === undefined) continue;

    const entity = resolveEntityRef(checkpoint.entityRef, index);
    if (entity === null) continue;

    const service = typeof line.service === 'string' ? line.service : '';
    const author = service === '' ? null : resolveEntityRef(service, index);
    if (author === null) {
      problems.push(
        `checkpoint '${checkpoint.checkpointId}' cites log '${ref}', whose line is attributed to ` +
          `'${service}', and the graph holds no single entity by that name -- a line with no author ` +
          'is a phrase taken from nowhere in particular',
      );
      continue;
    }
    if (sameComponent(input.graph, entity, author)) continue;
    problems.push(
      `checkpoint '${checkpoint.checkpointId}' names '${checkpoint.entityRef}', and the log line it ` +
        `cites is attributed to '${service}': they are a different component, so the phrase is ` +
        'evidence about something other than what the checkpoint is about',
    );
  }
  return problems;
}
