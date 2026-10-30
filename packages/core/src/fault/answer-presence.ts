import type { FaultCase } from '../ir/types.js';

/**
 * Whether the answer is a name the telemetry can score.
 *
 * ## The defect this exists for
 *
 * A case's `rootCauseComponent` is the answer, and a ranking finds the answer by exact string match
 * on a series' `service`. Nothing checked that the two ever met, so a case could carry a complete
 * four-layer annotation, a conforming signals file and a moving series -- and be unscorable, because
 * the one name the ranking searches for is a name no series carries.
 *
 * The round that annotated `resource-memory-leak-recommendation` wrote every reading against the
 * pod, because that is where a heap lives, and left the service with a single flat request-rate
 * series. Both baselines then reported `absent`, the case failed G4 with `is not solvable by both
 * baselines (peak-z-by-service=absent, median-shift-by-service=absent)`, and the diagnosis that
 * sentence offers is *"no baseline can locate the root cause"* -- which is true, and which points at
 * the solver rather than at the annotation. What was wrong was three lines of JSON: the readings
 * were filed under `recommendation-service-0` while the answer is `recommendation-service`.
 *
 * ## Why exact equality rather than resolution through the graph
 *
 * Because the consumer uses exact equality. `classifyDisplacement` looks the answer up with
 * `one.service === answerName`, and the two baselines key their candidates on the same field, so a
 * component that resolves through an alias is a component no ranking can find. A rule that accepted
 * an alias would pass cases the scoring pipeline cannot read, which is the failure mode this whole
 * module is about -- a check that is more forgiving than the code it checks for.
 *
 * The same argument decides the empty-series case: a case with no telemetry has no ranking, so the
 * rule does not apply and says nothing. It is not exempt out of politeness; there is nothing to be
 * wrong about yet.
 *
 * ## Why this is reported per case rather than enforced by the schema
 *
 * The signals file is a sibling of the case file, and neither alone knows the other's names. The
 * schema validates one document at a time, so the join is the only place this can be asked, and a
 * function that answers it is a function that can be tested -- which a guard script's inline
 * `if` cannot be.
 */
export function checkAnswerPresence(input: {
  case: FaultCase;
  seriesServices: readonly string[];
}): string[] {
  const carried: string[] = [];
  for (const name of input.seriesServices) {
    // A name that is only whitespace is not a name. It is a different defect -- the series reader
    // reports it -- and letting it through here would list a blank among the candidates, which reads
    // as a formatting bug in the message rather than as a missing name in the file.
    if (typeof name === 'string' && name.trim() !== '') carried.push(name);
  }
  if (carried.length === 0) return [];

  const answer = input.case.groundTruth.rootCauseComponent;
  if (carried.includes(answer)) return [];

  // Sorted and de-duplicated, because the message is read by whoever has to repair the file and a
  // list in file order makes them diff two orderings before they can see that nothing matches.
  const names = [...new Set(carried)].sort();
  return [
    `names root cause component '${answer}', and no series carries that name, so no ranking can ` +
      `place it; the series name ${names.join(', ')} -- a reading filed under a component the answer ` +
      'does not name is a reading no solver is scored on',
  ];
}
