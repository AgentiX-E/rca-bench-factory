import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PARAMETER_ROLES,
  describeParameterRoleFault,
  readParameterRoles,
  type ParameterRoleFault,
} from '../src/fault/parameter-role.js';

/**
 * Which of a case's own numbers is how long the fault lasted, and which is a setting it ran under.
 *
 * A case states both in the same place. `terminationGracePeriodSeconds: 30` and
 * `splitDurationMinutes: 17` are the same shape to a reader and to `util/unit.ts` -- both are
 * quantities in a unit of time -- and only the ticket's prose said which one the episode was. The
 * field that used to answer the question named one parameter as the length; the other twelve
 * time-valued parameters said nothing, so a case could leave the rule with nothing to check by
 * deleting the field, and the count that defended the corpus -- *fourteen time-valued parameters, of
 * which five are the episode* -- was a count of cases rather than of parameters.
 *
 * So the answer moved onto the thing it describes. A parameter that states a span of time says
 * whether it is the episode or a knob, and a case that leaves it out is refused rather than counted,
 * because the silence is the defect. These tests pin the four ways the answer can be absent or
 * misplaced.
 */
const PARAMETERS = {
  service: 'search-cluster',
  burstMinutes: { value: 4, unit: 'min', role: 'episode' },
  graceSeconds: { value: 30, unit: 's', role: 'knob' },
  mergeThreads: { value: 6, unit: 'count' },
} as const;

const read = (parameters: Record<string, unknown> = PARAMETERS) => readParameterRoles(parameters);

describe('readParameterRoles · one episode, the knobs, and the counts left alone', () => {
  it('reads the parameter that says it is the episode and the ones that say they are knobs', () => {
    const reading = read();
    expect(reading.faults).toEqual([]);
    expect(reading.episode).toEqual({ parameter: 'burstMinutes', value: 4, unit: 'min' });
    expect(reading.knobs).toEqual(['graceSeconds']);
    expect(reading.timed).toEqual(['burstMinutes', 'graceSeconds']);
  });

  it('says nothing about a case whose parameters state no span of time at all', () => {
    // A percentage, a count and a name are not lengths, and neither of the two words describes them.
    // Asking them to answer would be a rule about the annotation's vocabulary rather than about the
    // one question the file can settle.
    expect(read({ sharePercent: { value: 60, unit: '%' }, streams: { value: 8, unit: 'count' } })).toEqual({
      episode: null,
      knobs: [],
      timed: [],
      faults: [],
    });
  });

  it('keeps the declaration order of the knobs, so a sentence can name them as the file writes them', () => {
    const reading = read({
      zSeconds: { value: 5, unit: 's', role: 'knob' },
      aMinutes: { value: 2, unit: 'min', role: 'knob' },
    });
    expect(reading.knobs).toEqual(['zSeconds', 'aMinutes']);
  });
});

describe('readParameterRoles · the four ways the answer is absent or misplaced', () => {
  it('refuses a length that says neither word, and names the unit it is written in', () => {
    // The defect the round is about: twelve parameters of this shape were silent, and a case could
    // answer the length rule by deleting its declaration rather than by stating anything.
    const fault = read({
      retentionGapHours: { value: 31, unit: 'h' },
      burstMinutes: { value: 4, unit: 'min', role: 'episode' },
    }).faults[0] as ParameterRoleFault;
    expect(fault).toEqual({ kind: 'unstated-role', parameter: 'retentionGapHours', unit: 'h' });
    expect(describeParameterRoleFault(fault)).toBe(
      'fault.parameters.retentionGapHours is a length in `h` and says neither `knob` nor `episode`: ' +
        'a time-valued parameter states which, or the length rule is answered by never naming one',
    );
  });

  it('refuses a word that is not in the vocabulary, and quotes what it found', () => {
    const fault = read({ burstMinutes: { value: 4, unit: 'min', role: 'length' } }).faults[0] as ParameterRoleFault;
    expect(fault).toEqual({ kind: 'unknown-role', parameter: 'burstMinutes', declared: 'length' });
    expect(describeParameterRoleFault(fault)).toBe(
      'fault.parameters.burstMinutes.role is "length", and the vocabulary is `knob` or `episode`: ' +
        'a parameter is either a setting the case ran under or the length of its own episode',
    );
    // A role that is not even a string is the same refusal with the value quoted as it was written,
    // rather than read as a word the vocabulary might contain.
    expect(read({ burstMinutes: { value: 4, unit: 'min', role: 1 } }).faults).toEqual([
      { kind: 'unknown-role', parameter: 'burstMinutes', declared: 1 },
    ]);
  });

  it('refuses a role on a parameter that is not a length', () => {
    // A count is a number of things, and `knob` beside it would be a distinction nothing can draw:
    // there is no episode a count could be the length of.
    const fault = read({ mergeThreads: { value: 6, unit: 'count', role: 'knob' } }).faults[0] as ParameterRoleFault;
    expect(fault).toEqual({ kind: 'role-without-time', parameter: 'mergeThreads', role: 'knob', unit: 'count' });
    expect(describeParameterRoleFault(fault)).toBe(
      'fault.parameters.mergeThreads.role says `knob`, and its value carries `count`: a role ' +
        'describes a span of time, and this is not one',
    );
    // A quantity with no unit at all is refused the same way, and the sentence has to say *that*
    // rather than print `undefined` where a unit would go.
    const bare = read({ burst: { value: 4, role: 'episode' } }).faults[0] as ParameterRoleFault;
    expect(bare).toEqual({ kind: 'role-without-time', parameter: 'burst', role: 'episode', unit: null });
    expect(describeParameterRoleFault(bare)).toBe(
      'fault.parameters.burst.role says `episode`, and its value carries no unit: a role describes ' +
        'a span of time, and this is not one',
    );
  });

  it('refuses two parameters that both say they are the episode', () => {
    const reading = read({
      burstMinutes: { value: 4, unit: 'min', role: 'episode' },
      splitDurationMinutes: { value: 17, unit: 'min', role: 'episode' },
    });
    expect(reading.faults).toEqual([
      { kind: 'two-episodes', parameters: ['burstMinutes', 'splitDurationMinutes'] },
    ]);
    // And it reads no episode at all: a rule that picked the first would be comparing one number
    // with a window while the file said the length twice.
    expect(reading.episode).toBeNull();
    expect(describeParameterRoleFault(reading.faults[0] as ParameterRoleFault)).toBe(
      'fault.parameters names 2 parameters as the length of this episode ' +
        '(burstMinutes, splitDurationMinutes): one episode has one length',
    );
  });

  it('reports one fault per parameter, in declaration order, and does not report a bad word twice', () => {
    // `role: 'setting'` is both a word outside the vocabulary and a time-valued parameter with no
    // usable answer. Reporting it as a silence would send the author to write a word that is there.
    const faults = read({
      firstSeconds: { value: 5, unit: 's' },
      secondMinutes: { value: 4, unit: 'min', role: 'setting' },
      thirdHours: { value: 2, unit: 'h' },
    }).faults;
    expect(faults).toEqual([
      { kind: 'unstated-role', parameter: 'firstSeconds', unit: 's' },
      { kind: 'unknown-role', parameter: 'secondMinutes', declared: 'setting' },
      { kind: 'unstated-role', parameter: 'thirdHours', unit: 'h' },
    ]);
  });
});

describe('the vocabulary is two words, declared once', () => {
  it('publishes `knob` and `episode`, in that order, and the reader accepts exactly those', () => {
    // The tuple is what `docs/data-model.md` publishes and what the reader admits a value against,
    // so a third word would be a documented vocabulary the corpus could not use and a fourth shape
    // nothing reads.
    expect(PARAMETER_ROLES).toEqual(['knob', 'episode']);
    for (const role of PARAMETER_ROLES) {
      expect(read({ probe: { value: 1, unit: 's', role } }).faults).toEqual([]);
    }
  });
});

/**
 * The shipped corpus, which is where the annotation stops being a property of a fixture.
 *
 * Every time-valued parameter in the corpus carries one of the two words and exactly one parameter
 * per case may say `episode`. The five cases are named rather than counted, because the count is
 * what was wrong in the sentence this round repairs: the document said fourteen *parameters* when
 * fourteen was the number of *cases*, and the parameters are seventeen.
 */
describe('the shipped corpus · every length says which it is', () => {
  const CASES = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'golden-master', 'fault-cases');
  const index = JSON.parse(readFileSync(join(CASES, 'index.json'), 'utf8')) as { cases: Array<{ case?: string }> };
  const readings = index.cases
    .map((entry) => entry.case)
    .filter((name): name is string => typeof name === 'string')
    .map((name) => {
      const raw = JSON.parse(readFileSync(join(CASES, name), 'utf8')) as {
        caseId: string;
        fault: { parameters?: Record<string, unknown>; durationParameter?: unknown };
      };
      return {
        caseId: raw.caseId,
        declaresField: raw.fault.durationParameter !== undefined,
        reading: readParameterRoles(raw.fault.parameters ?? {}),
      };
    });

  it('refuses nothing, because every length in the corpus answers the question', () => {
    const faults = readings.flatMap((one) => one.reading.faults.map((fault) => [one.caseId, fault] as const));
    expect(faults).toEqual([]);
  });

  it('carries no `durationParameter`, because the role says what the field used to', () => {
    expect(readings.filter((one) => one.declaresField).map((one) => one.caseId)).toEqual([]);
  });

  it('names five episodes and twelve knobs across fifteen cases, which is what the sentence got wrong', () => {
    const episodes = readings.filter((one) => one.reading.episode !== null).map((one) => one.caseId).sort();
    expect(episodes).toEqual([
      'history-dependency-schema-change-currency-feed',
      'history-dependency-upstream-5xx-pricing',
      'history-network-partition-search-cluster',
      'history-queue-disk-watermark-batch-drain',
      'history-resource-merge-burst-search-cluster',
    ]);
    const knobs = readings.reduce((total, one) => total + one.reading.knobs.length, 0);
    const timed = readings.reduce((total, one) => total + one.reading.timed.length, 0);
    const cases = readings.filter((one) => one.reading.timed.length > 0).length;
    expect({ timed, knobs, episodes: episodes.length, cases }).toEqual({
      timed: 17,
      knobs: 12,
      episodes: 5,
      cases: 15,
    });
  });
});
