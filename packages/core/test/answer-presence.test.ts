import { describe, expect, it } from 'vitest';
import { checkAnswerPresence } from '../src/fault/answer-presence.js';
import type { FaultCase } from '../src/ir/types.js';

/**
 * The answer is a string, and the telemetry is a list of strings, and nothing compared them.
 *
 * A case can be complete in all four layers, carry a conforming signals file, and still be
 * unscorable: the ranking finds the answer by exact match on a series' `service`, so a component
 * whose readings are filed under its pod's name is a component no solver is scored on. The round
 * that annotated `resource-memory-leak-recommendation` shipped exactly that, and G4 said
 * `is not solvable by both baselines` -- a sentence about solvers for a defect in three lines of
 * JSON.
 *
 * These tests pin the join, and they pin its two limits: an alias is not a name (the consumer uses
 * equality), and a case with no telemetry says nothing (there is no ranking to be absent from).
 */

function faultCase(component: string): FaultCase {
  return {
    caseId: 'a-case',
    system: 'storefront',
    environment: { system: 'storefront', version: '2026-10', deployRef: 'authored-not-deployed' },
    injectTime: '2026-10-23T06:00:00.000Z',
    window: { start: '2026-10-22T18:00:00.000Z', end: '2026-10-23T12:00:00.000Z' },
    fault: { type: 'memory-leak', category: 'resource', injectionMethod: 'historical' },
    groundTruth: { rootCauseEntityId: 'service:storefront/recommendation', rootCauseComponent: component },
    answerKeyIsolated: true,
  } as unknown as FaultCase;
}

describe('the answer has to be a name the telemetry carries', () => {
  it('accepts a case whose answer is one of the series names', () => {
    expect(checkAnswerPresence({ case: faultCase('recommendation'), seriesServices: ['recommendation'] })).toEqual([]);
  });

  it('names the answer and every series when the answer is not among them', () => {
    const problems = checkAnswerPresence({
      case: faultCase('recommendation'),
      seriesServices: ['recommendation-0', 'checkout'],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("root cause component 'recommendation'");
    expect(problems[0]).toContain('no series carries that name');
    // The candidates are listed because the repair is almost always "one of these is the answer
    // under a finer name" -- the reader needs the names, not the count.
    expect(problems[0]).toContain('checkout, recommendation-0');
  });

  /**
   * The consumer's own rule, restated as a test rather than as a comment.
   *
   * `classifyDisplacement` looks the answer up with `one.service === answerName`, and the two
   * baselines key their candidates on the same field. A rule more forgiving than that -- resolving
   * an alias through the graph, say -- would pass cases the scoring pipeline cannot read, which is
   * this module's defect one level up: a check that agrees with itself instead of with the code it
   * checks for.
   */
  it('does not accept a name that merely looks like the answer', () => {
    expect(
      checkAnswerPresence({ case: faultCase('Recommendation'), seriesServices: ['recommendation'] }),
    ).toHaveLength(1);
  });

  it('has nothing to say about a case that carries no telemetry', () => {
    // Not tolerance: a case with no series has no ranking, so there is no answer for it to be absent
    // from. The corpus counts those separately and G4 never runs for them.
    expect(checkAnswerPresence({ case: faultCase('recommendation'), seriesServices: [] })).toEqual([]);
  });

  it('ignores a series that declares no name at all', () => {
    // A series with an empty `service` is a different defect, reported where the series is read. It
    // must not be allowed to satisfy this rule by accident. What it does is disappear: a case whose
    // only names are blank carries no names, which is the same answer as a case with no telemetry.
    expect(
      checkAnswerPresence({ case: faultCase('recommendation'), seriesServices: ['', 'recommendation'] }),
    ).toEqual([]);
    expect(checkAnswerPresence({ case: faultCase('recommendation'), seriesServices: ['', '  '] })).toEqual([]);
  });

  it('lists each series name once, in a stable order', () => {
    const problems = checkAnswerPresence({
      case: faultCase('checkout'),
      seriesServices: ['zeta', 'alpha', 'zeta', 'alpha'],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('the series name alpha, zeta --');
  });
});
