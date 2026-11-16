import { convertUnit } from '../util/unit.js';
import {
  readPostSampleSpacing,
  readSeriesHold,
  trimNumber,
  type ExpansionTime,
  type SeriesDeclaration,
} from './derived-telemetry.js';
import type { EpisodeDeclaration } from './parameter-role.js';

/**
 * How long the fault lasted, as the file claims it and as the samples draw it.
 *
 * ## Two vocabularies, and the number that joins them
 *
 * `fault.parameters` is where a case states its own facts, and for a case that recovers one of them
 * usually states a span of time: `burstMinutes: 4`, `splitDurationMinutes: 17`,
 * `durationMinutes: 120`. The telemetry states the same thing in another vocabulary: `hold` counts
 * post-onset samples, and `readPostSampleSpacing` turns one sample into wall-clock time, so the
 * episode is `hold x spacing` long.
 *
 * Which parameter is that episode is `fault/parameter-role.ts`'s question, and it is answered on the
 * parameter itself. This module is the arithmetic: one declared length, one measurement drawn by the
 * case's own samples, and the refusals that follow when the two are not the same episode.
 *
 * ## What is refused, and what is not
 *
 * A case that declares no episode is not refused: it makes no claim, and a claim nobody makes cannot
 * be wrong. That is the boundary `fault/parameter-notes.ts` draws in the other direction -- there the
 * file had to answer for a fact nothing read, here it may stay silent about a fact it never states.
 * A case that does declare one is refused three ways, and each is a different repair:
 *
 * | refusal | what is wrong |
 * | --- | --- |
 * | `no-episode` | the case shows no excursion, so no span of its own is that long |
 * | `ambiguous` | its series hold for different numbers of samples, so one number is not all of them |
 * | `disagrees` | the stated span and the drawn one are different numbers |
 *
 * A fourth refusal used to sit at the head of that list -- a name that is not a parameter, or names
 * one that is not a duration -- and it is gone with the field that produced it: a role is written on
 * the quantity it describes, so there is no name to spell wrongly and no unit to look up.
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
  /**
   * The case's series show no excursion, so nothing of its own is that long.
   *
   * No sample length is carried here, unlike the two refusals below: a case with no excursion has no
   * episode for a sample's length to belong to, and a number in the sentence that the reader cannot
   * act on is the defect this file is about.
   */
  | { kind: 'no-episode'; parameter: string; statedMs: number; unit: string }
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
  /**
   * The parameter the case declares to be its own episode, as `fault/parameter-role.ts` reads it, or
   * `null` when it declares none.
   *
   * The unit is guaranteed to be one of time, because the module that produces this refuses a role
   * on anything else -- so this module converts without asking again, and a length that is not a
   * length is refused one step earlier, where the field the author has to edit lives.
   */
  declared: EpisodeDeclaration | null;
  series: readonly SeriesDeclaration[];
  when: ExpansionTime;
}

export interface DurationClaimReport {
  /** The parameter the case declares as its own length, or `null` when it declares none. */
  parameter: string | null;
  /** The measurement the declared length was read against, or `null` when none was declared. */
  measured: EpisodeLength | null;
  /** The one thing that stopped the claim, or `null` when there is no claim or it holds. */
  fault: DurationClaimFault | null;
}

/**
 * Read the length a case claims against the length its samples draw.
 *
 * The checks are ordered by what a reader would have to change first: whether there is anything to
 * measure, then whether the case's own series agree about it, then whether the number matches. A case
 * can be wrong twice -- no excursion and two series that would disagree if there were one -- and
 * reporting the second would send the reader to a window that has nothing to compare.
 *
 * A difference below a millisecond is not a difference: a duration is stated in whole units of a
 * unit that is at least a second, and the spacing is a division of an integral number of
 * milliseconds by eight, so the only differences this tolerance can absorb are ones no unit in the
 * table can express.
 */
export function readDurationClaim(input: DurationClaimInput): DurationClaimReport {
  const { declared } = input;
  if (declared === null) return { parameter: null, measured: null, fault: null };

  const { parameter, value, unit } = declared;
  const statedMs = convertUnit(value, unit, 's') * 1000;
  const measured = readEpisodeLength({ series: input.series, when: input.when });

  if (measured.lengths.length === 0) {
    return { parameter, measured, fault: { kind: 'no-episode', parameter, statedMs, unit } };
  }
  if (measured.lengths.length > 1) {
    return { parameter, measured, fault: { kind: 'ambiguous', parameter, statedMs, unit, measuredMs: measured.lengths } };
  }
  const drawnMs = measured.lengths[0] as number;
  if (Math.abs(statedMs - drawnMs) <= 1) return { parameter, measured, fault: null };
  return {
    parameter,
    measured,
    fault: {
      kind: 'disagrees',
      parameter,
      statedMs,
      measuredMs: drawnMs,
      unit,
      hold: measured.holds[0] as number,
      spacingMs: measured.spacingMs,
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
    case 'no-episode':
      return (
        `fault.parameters.${fault.parameter} states ${spanIn(fault.statedMs, fault.unit)}, and the case ` +
        'shows no excursion: every series either returns to its own baseline or never leaves it, so ' +
        'the stated length is one nothing in the case draws'
      );
    case 'ambiguous':
      return (
        `fault.parameters.${fault.parameter} states ${spanIn(fault.statedMs, fault.unit)}, and the case's ` +
        `series hold for lengths that do not agree (${fault.measuredMs
          .map((one) => spanIn(one, fault.unit))
          .join(', ')}): one number cannot be the length of all of them`
      );
    case 'disagrees':
      return (
        `fault.parameters.${fault.parameter} states ${spanIn(fault.statedMs, fault.unit)} as the length ` +
        `of this episode, and its ${String(fault.hold)} sample(s) at ${spanIn(fault.spacingMs, fault.unit)} ` +
        `each are ${spanIn(fault.measuredMs, fault.unit)}: the file's length and the data's are one ` +
        'episode, so they cannot be two numbers'
      );
  }
}
