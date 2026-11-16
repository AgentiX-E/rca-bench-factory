import { readDeclaredQuantity } from '../ir/parameters.js';
import { isConvertible } from '../util/unit.js';

/**
 * Which of a case's own numbers is how long the fault lasted, and which is a setting it ran under.
 *
 * ## One question, asked of every length
 *
 * `fault.parameters` holds the case's own facts, and ten of the corpus's parameters state a span of
 * time. `splitDurationMinutes: 17` is the episode and `terminationGracePeriodSeconds: 30` is a
 * kubelet setting, and the two are the same shape to a reader and to `util/unit.ts`: a number and a
 * unit of time. Only the ticket's prose said which was which, and `fault/duration-claim.ts` could
 * not read prose -- so the file answered it with a field naming *one* parameter as its length.
 *
 * That field had the defect `fault/parameter-notes.ts` refuses from the other side: it is optional,
 * so a case that deleted it made no claim and was refused by nothing. And the count that defended
 * the corpus -- *fourteen time-valued parameters, of which five are the episode* -- was a count of
 * **cases**: the corpus has seventeen such parameters across fifteen cases, twelve of them knobs.
 * A number defending a rule, measured over the wrong unit, is how the rule came to be satisfied by
 * silence.
 *
 * ## Why the word goes on the parameter
 *
 * The question is a property of the number, not of the case: `burstMinutes` is the episode and
 * `graceSeconds` is a knob, and a map beside the record would be a second place the same key is
 * written. So each time-valued quantity carries `role: "episode"` or `role: "knob"`, and the field
 * that used to name one of them is gone rather than kept beside them -- two statements of one fact
 * are two that can drift, which is the defect `readDeclaredReading` removed for a reading that
 * carried both a value and a parameter.
 *
 * The word is mandatory exactly where it applies. A count, a share, a byte count and a name are not
 * lengths, and asking them to answer would be a rule about the annotation's vocabulary; a parameter
 * in a unit of time is, and refusing its silence is what turns "the case names a length if it
 * wants to" into "the case says which of its numbers is the length". A case with **no** length at
 * all is still not refused: it makes no claim, and a claim nobody makes cannot be wrong.
 *
 * ## What is refused
 *
 * | refusal | what is wrong |
 * | --- | --- |
 * | `unstated-role` | a parameter in a unit of time says neither word -- the silence this round closes |
 * | `unknown-role` | the word is not in the vocabulary, so nothing can read it |
 * | `role-without-time` | a role on a parameter that is not a length: there is no episode a count could be |
 * | `two-episodes` | two parameters claim the same one episode, so one number is not all of them |
 *
 * ## What is not
 *
 * The arithmetic. Whether the number a case states equals the length its samples draw is
 * `fault/duration-claim.ts`, which takes the one declaration this module reads and compares it with
 * `hold x spacing`. The split is the same one `fault/parameter-notes.ts` makes about facts nothing
 * reads: this module answers *which*, and that one answers *whether*.
 */

/** The two words a time-valued parameter can say about itself. Published in `docs/data-model.md`. */
export const PARAMETER_ROLES = ['knob', 'episode'] as const;

export type ParameterRole = (typeof PARAMETER_ROLES)[number];

/**
 * The parameter a case declares to be its own episode.
 *
 * `unit` is a unit of time: this interface is produced only by `readParameterRoles`, which refuses a
 * role on anything else, so a consumer may convert without asking again. Nothing else constructs it.
 */
export interface EpisodeDeclaration {
  parameter: string;
  value: number;
  unit: string;
}

/** The one thing that stopped a length from saying which it is. */
export type ParameterRoleFault =
  /** A parameter in a unit of time says neither `knob` nor `episode`. */
  | { kind: 'unstated-role'; parameter: string; unit: string }
  /** The role is present and is not one of the two words. */
  | { kind: 'unknown-role'; parameter: string; declared: unknown }
  /**
   * A role on a parameter that is not a length.
   *
   * `unit` is `null` for a quantity written without one, so the sentence can say *that* rather than
   * print `undefined` where a unit would go.
   */
  | { kind: 'role-without-time'; parameter: string; role: string; unit: string | null }
  /** More than one parameter names itself the length of the one episode. */
  | { kind: 'two-episodes'; parameters: readonly string[] };

export interface ParameterRoleReading {
  /** The parameter that says it is the episode, when exactly one says so and states a span of time. */
  episode: EpisodeDeclaration | null;
  /** Every parameter that says it is a knob, in declaration order. */
  knobs: readonly string[];
  /**
   * Every parameter written in a unit of time, whether or not it answered.
   *
   * Printed rather than inferred: `knobs + episodes` must be this number, and a partition that is
   * stated can be checked while one that is assumed cannot.
   */
  timed: readonly string[];
  /** Everything wrong with the answers, one fault per parameter that has one, in declaration order. */
  faults: readonly ParameterRoleFault[];
}

/** The role word a parameter carries, or `undefined` when it carries none. */
function roleOf(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  return (raw as Record<string, unknown>)['role'];
}

/**
 * Read which lengths the case says are its episode and which are settings it ran under.
 *
 * The scan is single-pass and in declaration order, because every fault it reports is about one
 * parameter and a reader fixes them one at a time. The one case-level rule -- two episodes -- is
 * judged after it, because it is a fact about the set rather than about either member.
 *
 * A word outside the vocabulary is reported **instead of** the silence it also represents: an
 * author sent to write a word that is already there would fix the second problem and not the first.
 */
export function readParameterRoles(parameters: Readonly<Record<string, unknown>>): ParameterRoleReading {
  const faults: ParameterRoleFault[] = [];
  const knobs: string[] = [];
  const timed: string[] = [];
  const episodes: EpisodeDeclaration[] = [];

  for (const [parameter, raw] of Object.entries(parameters)) {
    const quantity = readDeclaredQuantity(raw);
    const unit = quantity?.unit;
    // One decision, in one place: the unit that makes this parameter a length, or `null` when it is
    // not one. Three branches below ask that question, and a second spelling of it would be the third
    // copy defect this campaign keeps finding -- what `readDeclaredQuantity` reads is the shape, and
    // what the unit table answers is the dimension.
    const lengthUnit = unit !== undefined && isConvertible(unit, 's') ? unit : null;
    if (lengthUnit !== null) timed.push(parameter);
    const role = roleOf(raw);
    if (role === undefined) {
      if (lengthUnit !== null) faults.push({ kind: 'unstated-role', parameter, unit: lengthUnit });
      continue;
    }
    if (typeof role !== 'string' || !(PARAMETER_ROLES as readonly string[]).includes(role)) {
      faults.push({ kind: 'unknown-role', parameter, declared: role });
      continue;
    }
    if (quantity === undefined || lengthUnit === null) {
      faults.push({ kind: 'role-without-time', parameter, role, unit: unit ?? null });
      continue;
    }
    if (role === 'episode') episodes.push({ parameter, value: quantity.value, unit: lengthUnit });
    else knobs.push(parameter);
  }

  if (episodes.length > 1) {
    faults.push({ kind: 'two-episodes', parameters: episodes.map((one) => one.parameter) });
  }

  return {
    episode: episodes.length === 1 ? (episodes[0] as EpisodeDeclaration) : null,
    knobs,
    timed,
    faults,
  };
}

/**
 * The sentence the guard prints for a length that does not say which it is.
 *
 * Every sentence names the parameter and the word or unit it found, because the author has to edit
 * that parameter: the fault is about one number in a record of a dozen, and naming the record is
 * naming nothing.
 */
export function describeParameterRoleFault(fault: ParameterRoleFault): string {
  switch (fault.kind) {
    case 'unstated-role':
      return (
        `fault.parameters.${fault.parameter} is a length in \`${fault.unit}\` and says neither ` +
        '`knob` nor `episode`: a time-valued parameter states which, or the length rule is answered ' +
        'by never naming one'
      );
    case 'unknown-role':
      return (
        `fault.parameters.${fault.parameter}.role is ${JSON.stringify(fault.declared)}, and the ` +
        'vocabulary is `knob` or `episode`: a parameter is either a setting the case ran under or ' +
        'the length of its own episode'
      );
    case 'role-without-time':
      return (
        `fault.parameters.${fault.parameter}.role says \`${fault.role}\`, and its value carries ` +
        `${fault.unit === null ? 'no unit' : `\`${fault.unit}\``}: a role describes a span of time, ` +
        'and this is not one'
      );
    case 'two-episodes':
      return (
        `fault.parameters names ${String(fault.parameters.length)} parameters as the length of this ` +
        `episode (${fault.parameters.join(', ')}): one episode has one length`
      );
  }
}
