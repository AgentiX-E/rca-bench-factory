import { describe, expect, it } from 'vitest';
import {
  MIN_NOTE_LENGTH,
  checkParameterNotes,
  describeParameterNoteFault,
  type ParameterNoteFault,
} from '../src/fault/parameter-notes.js';

/**
 * A key nothing reads is either a fact a reader needs or a number somebody forgot to cite.
 *
 * `fault.parameters` holds the case's own facts, and a reading may cite one so that the number in
 * the series and the number in the injection spec cannot drift (finding 258). Measured over the
 * shipped corpus before this rule: **69 of 98 keys were cited by nothing**, across all thirty cases.
 *
 * A rule that refused every uncited key would fail thirty cases for thirty legitimate reasons
 * (`service`, `from`, `trigger` are written for a reader), and an allow-list of descriptive names
 * would encode today's list as a law and refuse the next case's `pod` (finding 300 refused both).
 * What is left is the question only the author can answer, asked once per key: *why is this fact
 * here and what does it explain that no reading does*.
 *
 * These tests pin the four ways the answer can be missing or misplaced, because the rule's value
 * depends entirely on refusing the shapes that are not an answer.
 */

const PARAMETERS = {
  service: 'reporting-service',
  endpoint: '/v2/summary',
  queueDepth: { value: 900, unit: 'count' },
} as const;

const NOTE_SERVICE =
  'the service whose mapper threw; no reading carries which service, because the reading is the share of failed responses.';
const NOTE_ENDPOINT =
  'the route the guard sits behind; the reading is a share of all responses, so a route-level figure would be a different quantity.';

function report(input: { notes?: unknown; parameters?: Record<string, unknown>; cited?: string[] }) {
  return checkParameterNotes({
    parameters: input.parameters ?? PARAMETERS,
    notes: input.notes,
    cited: input.cited ?? ['queueDepth'],
  });
}

describe('parameter notes · every key nothing cites carries a reason', () => {
  it('accepts a case whose uncited keys all say why they are there', () => {
    const outcome = report({ notes: { service: NOTE_SERVICE, endpoint: NOTE_ENDPOINT } });
    expect(outcome.faults).toEqual([]);
    expect(outcome.declared).toBe(3);
    expect(outcome.cited).toBe(1);
    expect(outcome.noted).toBe(2);
  });

  it('refuses a key nothing cites and nothing explains, and names it', () => {
    const outcome = report({ notes: { service: NOTE_SERVICE } });
    expect(outcome.faults).toEqual([{ kind: 'missing', key: 'endpoint' }]);
    expect(describeParameterNoteFault(outcome.faults[0]!, 'history-x')).toBe(
      "'history-x' declares 'endpoint' and no reading cites it, and fault.parameterNotes says nothing " +
        'about it -- a key nothing reads is either a fact a reader needs, which the note states, or a ' +
        'number a reading should have cited',
    );
  });

  it('reads an absent map as "nothing explained" rather than as an empty case', () => {
    const outcome = report({ notes: undefined });
    expect(outcome.faults.map((fault) => fault.kind)).toEqual(['missing', 'missing']);
    expect(outcome.noted).toBe(0);
  });

  it('refuses a note on a key a reading cites: the citation is the statement', () => {
    // The same shape as `expression` beside `signalRef`: a citation and a note are two statements of
    // one fact, and the one a reader trusts is whichever they read first. A note here is also how a
    // key stays "explained" while its citation is deleted in a later round.
    const outcome = report({
      notes: { service: NOTE_SERVICE, endpoint: NOTE_ENDPOINT, queueDepth: 'the backlog the worker never drained.' },
    });
    expect(outcome.faults).toEqual([{ kind: 'cited', key: 'queueDepth' }]);
    expect(describeParameterNoteFault(outcome.faults[0]!, 'history-x')).toBe(
      "'history-x' carries a note for 'queueDepth' and a reading cites it -- the citation is the " +
        'statement, and a note beside it is a second one that can drift',
    );
  });

  it('refuses a note for a key the case does not declare, and says what it does declare', () => {
    const outcome = report({
      notes: { service: NOTE_SERVICE, endpoint: NOTE_ENDPOINT, queue: 'a key renamed and the note left behind.' },
    });
    expect(outcome.faults).toEqual([{ kind: 'stray', key: 'queue', declared: ['service', 'endpoint', 'queueDepth'] }]);
    expect(describeParameterNoteFault(outcome.faults[0]!, 'history-x')).toBe(
      "'history-x' explains 'queue' in fault.parameterNotes, and fault.parameters declares no such key " +
        '(it declares: service, endpoint, queueDepth)',
    );
  });

  it('refuses a note that is a label rather than a sentence', () => {
    const outcome = report({ notes: { service: 'the service', endpoint: NOTE_ENDPOINT } });
    expect(outcome.faults).toEqual([{ kind: 'label', key: 'service', note: 'the service' }]);
    expect(describeParameterNoteFault(outcome.faults[0]!, 'history-x')).toBe(
      "'history-x' explains 'service' with 'the service', which is a label: a note says what the fact " +
        `is for and why no reading cites it, in at least ${String(MIN_NOTE_LENGTH)} characters`,
    );
  });

  it('refuses a note that is long enough but stops before its own point', () => {
    // Length is a proxy, and a proxy with a hole: a sentence that does not end is a sentence
    // somebody was still writing. Both halves are needed, and the second one is why the rule is a
    // pair rather than a threshold.
    const unfinished = 'the service whose mapper threw and no reading carries which service because';
    expect(unfinished.length).toBeGreaterThanOrEqual(MIN_NOTE_LENGTH);
    const outcome = report({ notes: { service: unfinished, endpoint: NOTE_ENDPOINT } });
    expect(outcome.faults.map((fault) => fault.kind)).toEqual(['label']);
  });

  it('refuses a note that is not text, and quotes what it found instead', () => {
    const outcome = report({ notes: { service: 7, endpoint: NOTE_ENDPOINT } });
    expect(outcome.faults).toEqual([{ kind: 'notText', key: 'service', note: 7 }]);
    expect(describeParameterNoteFault(outcome.faults[0]!, 'history-x')).toBe(
      "'history-x' explains 'service' with 7, and a note is a sentence of text",
    );
    expect(outcome.noted, 'a number is not a note, so it is not counted as one').toBe(1);
  });

  it('refuses a map that is not a map', () => {
    for (const notes of [['why'], 'why', 7] as const) {
      const outcome = report({ notes });
      expect(outcome.faults).toEqual([{ kind: 'unreadable', notes }]);
    }
  });

  it('treats a case that cites every key as needing no notes at all', () => {
    const outcome = report({ notes: null, parameters: { queueDepth: { value: 900, unit: 'count' } } });
    expect(outcome.faults).toEqual([]);
    expect(outcome.noted).toBe(0);
    expect(outcome.shortest).toBe(0);
  });

  it('measures the shortest note, so the floor is visible rather than remembered', () => {
    const shortest = 'the route the guard sits behind; no reading is per route.';
    const outcome = report({ notes: { service: NOTE_SERVICE, endpoint: shortest } });
    expect(outcome.shortest).toBe(shortest.length);
    expect(shortest.length).toBeGreaterThanOrEqual(MIN_NOTE_LENGTH);
  });

  it('reports every fault it finds rather than the first, because a case can have two', () => {
    const outcome = report({ notes: { queue: 'a renamed key nobody noticed when the parameter moved.' } });
    expect(outcome.faults.map((fault) => fault.kind)).toEqual(['missing', 'missing', 'stray']);
  });

  it('describes an unreadable map without pretending to quote it', () => {
    const fault: ParameterNoteFault = { kind: 'unreadable', notes: ['why'] };
    expect(describeParameterNoteFault(fault, 'history-x')).toBe(
      "'history-x' carries fault.parameterNotes as an array, and it has to be an object from parameter " +
        'name to the sentence that explains it',
    );
  });
});
