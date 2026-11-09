import { readDeclaredQuantity } from '../ir/parameters.js';
import { convertUnit, isConvertible } from '../util/unit.js';
import {
  readPostSampleSpacing,
  readSeriesHold,
  trimNumber,
  type ExpansionTime,
  type SeriesDeclaration,
} from './derived-telemetry.js';

/**
 * How long the fault lasted, as the file claims it and as the samples draw it.
 *
 * ## Two vocabularies, and the missing third
 *
 * `fault.parameters` is where a case states its own facts, and for a case that recovers one of them
 * usually states a span of time: `burstMinutes: 4`, `splitDurationMinutes: 17`,
 * `durationMinutes: 120`. The telemetry states the same thing in another vocabulary: `hold` counts
 * post-onset samples, and `readPostSampleSpacing` turns one sample into wall-clock time, so the
 * episode is `hold x spacing` long.
 *
 * Nothing said *which* parameters are that episode. `burstMinutes: 4` beside `hold: 4` read as one
 * fact written twice, and it was one only when a sample happened to be a minute -- v3.72 refused the
 * coincidence. That refusal has a hole a reader can see at once: give a window where a sample is 3.5
 * minutes and write `burstMinutes: 5` beside `hold: 4`, and the file says five minutes about an
 * episode of fourteen while the rule says nothing, because 5 is not 4. The rule was comparing the
 * parameter with the *count*; the question it wanted to ask was what the parameter is for.
 *
 * So the file now answers it: `fault.durationParameter` names the one parameter that states how long
 * this fault lasted. Once named, the number has a meaning that can be checked -- and checked not
 * against another number that happens to equal it, but against the episode the samples draw.
 *
 * ## Why a declaration rather than a reading of the names
 *
 * `splitDurationMinutes`, `durationMinutes` and `burstMinutes` all end in a time unit, and so does
 * `terminationGracePeriodSeconds` -- a kubelet setting that no episode is thirty minutes long
 * because of. Guessing from the name is the game `spike` played with a duration hidden in it, and
 * the corpus carries fourteen time-valued parameters of which five are the episode. A rule that
 * guessed would be right five times and wrong nine times, which is a coin with extra steps.
 *
 * ## What is refused, and what is not
 *
 * A case that names no length is not refused: it makes no claim, and a claim nobody makes cannot be
 * wrong. That is the boundary `fault/parameter-notes.ts` draws in the other direction -- there the
 * file had to answer for a fact nothing read, here it may stay silent about a fact it never states.
 * A case that does name one is refused four ways, and each is a different repair:
 *
 * | refusal | what is wrong |
 * | --- | --- |
 * | `unknown-parameter` | the name is not a key of `fault.parameters` -- a rename left it behind |
 * | `not-a-duration` | the parameter carries no time unit, so there is no length to compare |
 * | `no-episode` | the case shows no excursion, so no span of its own is that long |
 * | `ambiguous` | its series hold for different numbers of samples, so one number is not all of them |
 * | `disagrees` | the stated span and the drawn one are different numbers |
 *
 * ## The length a silent series states
 *
 * A series that writes no `hold` holds for the whole post side, and a series that writes no
 * `noise` still says its value is exact. Both are declarations, so an excursion that never returns
 * is as long as the window's post side -- and two corpus cases said otherwise. Their parameter notes
 * read "the readings are shares and carry no duration of their own", and the readings carried thirty
 * and a hundred and fifty minutes (findings 492 and 493). The window is the number that was wrong,
 * which is the same repair v3.72 made on two other cases: the sentence is the ticket's, so the
 * geometry moves to agree with it.
 */

/** The one thing that stopped a stated length from being the episode's length. */
export type DurationClaimFault =
  /** `fault.durationParameter` is not a name at all. */
  | { kind: 'not-a-name'; declared: unknown }
  /** The name is not a key the case declares. */
  | { kind: 'unknown-parameter'; parameter: string; declared: readonly string[] }
  /** The parameter exists and is not a `{ value, unit }` quantity in a unit of time. */
  | { kind: 'not-a-duration'; parameter: string; declared: unknown }
  /** The case's series show no excursion, so nothing of its own is that long. */
  | { kind: 'no-episode'; parameter: string; statedMs: number; unit: string; spacingMs: number }
  /** The series disagree about how long the episode is, so one number cannot be all of them. */
  | { kind: 'ambiguous'; parameter: string; statedMs: number; unit: string; measuredMs: readonly number[] }
  /** The stated span and the drawn one are two different numbers for one episode. */
  | {
    kind: 'disagrees';
    parameter: string;
    statedMs: number;
    measuredMs: number;
    unit: string;
    hold: number;
    spacingMs: number;
  };

/** What a case's own series say about the length of its episode. */
export interface EpisodeLength {
  /** The wall-clock length of one post-onset sample, in milliseconds. */
  spacingMs: number;
  /** The lengths the case's excursions draw, in milliseconds, deduplicated and sorted. */
  lengths: readonly number[];
  /** The holds behind those lengths, one per entry, for a sentence that has to name the count. */
  holds: readonly number[];
}

/**
 * The lengths a case's series draw, which is the number a stated duration has to be.
 *
 * A series whose two readings are equal states no excursion: it never leaves its baseline, so it has
 * no episode and contributes no length. Everything else does, including a series that never returns
 * -- an absent `hold` is a declaration that the excursion lasts the whole post side, and a length
 * nothing returns from is still a length. That inclusion is the whole of findings 492 and 493: two
 * cases wrote a duration in a parameter, declared their series exact over a wider window, and the
 * note beside the parameter said the readings carried no duration of their own.
 */
export function readEpisodeLength(input: {
  series: readonly SeriesDeclaration[];
  when: ExpansionTime;
}): EpisodeLength {
  const spacingMs = readPostSampleSpacing(input.when);
  const lengths = new Map<number, number>();
  for (const one of input.series) {
    if (one.baseline === one.post) continue;
    const { hold } = readSeriesHold(one);
    lengths.set(hold * spacingMs, hold);
  }
  const sorted = [...lengths.entries()].sort((a, b) => a[0] - b[0]);
  return {
    spacingMs,
    lengths: sorted.map(([length]) => length),
    holds: sorted.map(([, hold]) => hold),
  };
}

export interface DurationClaimInput {
  /** `fault.durationParameter`, exactly as the file wrote it. */
  declaration: unknown;
  parameters: Readonly<Record<string, unknown>>;
  series: readonly SeriesDeclaration[];
  when: ExpansionTime;
}

export interface DurationClaimReport {
  /** The parameter the case names as its own length, or `null` when it names none. */
  parameter: string | null;
  /** The measurement a named length was read against, or `null` when none was named. */
  episode: EpisodeLength | null;
  /** The one thing that stopped the claim, or `null` when there is no claim or it holds. */
  fault: DurationClaimFault | null;
}

/**
 * Read the length a case claims against the length its samples draw.
 *
 * The checks are ordered by which field a reader would have to fix first: the name, then the key it
 * names, then the quantity, then the measurement. A case can be wrong twice -- naming a parameter it
 * does not declare that is also not a duration -- and reporting the second would send the reader to
 * the field that is not the first problem.
 *
 * A difference below a millisecond is not a difference: a duration is stated in whole units of a
 * unit that is at least a second, and the spacing is a division of an integral number of
 * milliseconds by eight, so the only differences this tolerance can absorb are ones no unit in the
 * table can express.
 */
export function readDurationClaim(input: DurationClaimInput): DurationClaimReport {
  const { declaration } = input;
  if (declaration === undefined || declaration === null) {
    return { parameter: null, episode: null, fault: null };
  }
  const keys = Object.keys(input.parameters);
  if (typeof declaration !== 'string' || declaration.trim() === '') {
    return { parameter: null, episode: null, fault: { kind: 'not-a-name', declared: declaration } };
  }
  const parameter = declaration;
  if (!Object.hasOwn(input.parameters, parameter)) {
    return {
      parameter,
      episode: null,
      fault: { kind: 'unknown-parameter', parameter, declared: keys },
    };
  }

  const episode = readEpisodeLength({ series: input.series, when: input.when });
  const stated = readDeclaredQuantity(input.parameters[parameter]);
  if (stated === undefined || stated.unit === undefined || !isConvertible(stated.unit, 's')) {
    return {
      parameter,
      episode,
      fault: {
        kind: 'not-a-duration',
        parameter,
        declared: input.parameters[parameter],
      },
    };
  }
  const statedMs = convertUnit(stated.value, stated.unit, 's') * 1000;
  const { unit } = stated;

  if (episode.lengths.length === 0) {
    return {
      parameter,
      episode,
      fault: { kind: 'no-episode', parameter, statedMs, unit, spacingMs: episode.spacingMs },
    };
  }
  if (episode.lengths.length > 1) {
    return {
      parameter,
      episode,
      fault: { kind: 'ambiguous', parameter, statedMs, unit, measuredMs: episode.lengths },
    };
  }
  const measuredMs = episode.lengths[0] as number;
  if (Math.abs(statedMs - measuredMs) <= 1) return { parameter, episode, fault: null };
  return {
    parameter,
    episode,
    fault: {
      kind: 'disagrees',
      parameter,
      statedMs,
      measuredMs,
      unit,
      hold: episode.holds[0] as number,
      spacingMs: episode.spacingMs,
    },
  };
}

/** A span in the unit the case stated it in, so a sentence's three numbers can be compared. */
function spanIn(ms: number, unit: string): string {
  return `${trimNumber(ms / (convertUnit(1, unit, 's') * 1000))} ${unit}`;
}

/**
 * The sentence the guard prints for a claim that does not hold.
 *
 * Every sentence names the parameter and the two numbers, because the author has to choose which of
 * them to change: give the parameter the length the samples draw, or move the window so the samples
 * draw the length the parameter states. Naming the sample's length is what makes the choice
 * available -- without it a reader sees `5` and `4` and concludes the file is merely inconsistent.
 */
export function describeDurationClaim(fault: DurationClaimFault): string {
  switch (fault.kind) {
    case 'not-a-name':
      return (
        `fault.durationParameter is ${JSON.stringify(fault.declared)}, and it has to name a ` +
        'parameter: the field says which of the case\'s own numbers is how long the fault lasted'
      );
    case 'unknown-parameter':
      return (
        `fault.durationParameter names '${fault.parameter}', and fault.parameters declares no such ` +
        `key (it declares: ${fault.declared.join(', ') || 'nothing'})`
      );
    case 'not-a-duration':
      return (
        `fault.durationParameter names '${fault.parameter}', whose value ` +
        `${JSON.stringify(fault.declared)} is not a quantity in a unit of time, so it states no ` +
        'length the samples could be compared with'
      );
    case 'no-episode':
      return (
        `fault.durationParameter names '${fault.parameter}', which states ${spanIn(fault.statedMs, fault.unit)}, ` +
        'and the case shows no excursion: every series either returns to its own baseline or never ' +
        'leaves it, so the stated length is one nothing in the case draws'
      );
    case 'ambiguous':
      return (
        `fault.durationParameter names '${fault.parameter}', which states ${spanIn(fault.statedMs, fault.unit)}, ` +
        `and the case's series hold for lengths that do not agree (${fault.measuredMs
          .map((one) => spanIn(one, fault.unit))
          .join(', ')}): one number cannot be the length of all of them`
      );
    case 'disagrees':
      return (
        `fault.durationParameter names '${fault.parameter}', which states ` +
        `${spanIn(fault.statedMs, fault.unit)} as the length of this episode, and its ` +
        `${String(fault.hold)} sample(s) at ${spanIn(fault.spacingMs, fault.unit)} each are ` +
        `${spanIn(fault.measuredMs, fault.unit)}: the file's length and the data's are one episode, ` +
        'so they cannot be two numbers'
      );
  }
}
