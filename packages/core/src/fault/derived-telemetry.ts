import { createHash } from 'node:crypto';

import type { LogSeverity, SignalPayload, TelemetrySignal } from '../ir/types.js';
import { clampToUnit, convertUnit, dimensionOf, quantizeToUnit } from '../util/unit.js';

/**
 * The corpus's derived telemetry, as a module rather than as a script's private helper.
 *
 * A `*.signals.json` file declares **what** a case's telemetry says: a baseline reading, a post-onset
 * reading, the sentence both come from. It does not contain the samples. Those are constructed here,
 * from the declaration plus the case's window -- and until this module existed, nothing could test
 * that construction. It lived inside `scripts/check-fault-cases.mjs`, and the guard prints counts of
 * files and checkpoints rather than the values it produced, so a change to the arithmetic was a
 * change no test could disagree with. That is the reason the first defect below survived three
 * rounds: it was found by *reading* the code while annotating, not by running anything.
 *
 * ## The defect this module was extracted to fix
 *
 * A `counter` declaration's pre-window samples were written `baseline + 0.1 * index` -- a rate of a
 * tenth per sample, invented for every counter in the corpus. With a baseline of 12 it looks like a
 * counter that was already ticking slowly, which the throttling incident's text supports ("counters
 * climbed the whole time"). With a baseline of **0** it is a series that was already accumulating
 * *before* the fault: 0, 0.1, 0.2, 0.3 in a text that says the failures began at the change. The
 * pre-window of a counter is now flat at its baseline, which is what "the counter had accumulated
 * this much by the start of the window" means.
 *
 * ## A reading is a measurement, so it stays inside its unit
 *
 * The noise below is a fraction of the reading, which is fine in the middle of a scale and wrong at
 * its edges: a share of exactly 1 -- "every request 503'd" -- came out as `1.02`, a **102 % share**
 * that no system can produce, and a negative duration is not a small one either. `clampToUnit` keeps
 * every noisy sample inside the range `util/unit.ts` states for its unit, and what that produces at a
 * ceiling is the physically correct reading rather than a compromise: noise at a bound is one-sided,
 * because there is nothing above 100 % to be noisy about.
 *
 * Only the *noisy* samples are clamped. A counter's samples are exact totals -- its baseline, then
 * its increments -- and clamping those would silently rewrite arithmetic the declaration states. A
 * declaration that is itself outside its unit's range is a bad annotation, and `check-fault-cases`
 * refuses it, which is where a bad annotation belongs (finding 252).
 *
 * ## Two kinds of reading, and one of them is exact
 *
 * A latency percentile is a quantity measured by sampling, and the ±2 % cycle below is what a sampled
 * quantity looks like. A ratio of counted events over a scrape interval is not: when every request
 * failed at every scrape the share is exactly 1. `noise: 'none'` says so, and without it the corpus
 * asserted the second kind with the first kind's noise -- a condition reading 1 wobbled to 0.98, and
 * only the ceiling clamp stopped it going to 1.02 (finding 254).
 *
 * ## What is fixed rather than random
 *
 * Every value here is a function of the declaration and the timestamps: the jitter is a fixed cycle,
 * the log offsets are constants, and the span ids are a digest of the case id. A corpus whose
 * telemetry differed between two runs would make every downstream number incomparable while looking
 * like noise, and the ids in particular must be stable because they are written into `traces.csv` and
 * compared by the round trip.
 */

/**
 * How a declared series gets from its baseline to its post value.
 *
 * - `step` (the default): a level change that holds for `hold` samples -- all of them, unless the
 *   declaration names a shorter run.
 * - `counter`: an accumulating series, because a counter that jumps to its post value is a level
 *   wearing a counter's name.
 *
 * There were three members until v3.71, and the third was `spike`: one post-onset sample at the post
 * value and then the baseline again. It was a step with a hold of one, spelled as a separate word --
 * which meant the corpus's *shape* vocabulary carried a **duration** inside a name, and the only
 * duration it could carry was one sample. A corpus that can only say "the excursion lasts the whole
 * post-window" or "it lasts exactly one sample" cannot answer a threshold question about how long an
 * excursion has to last, and G3's sample axis is exactly that question: the grid's four sample lines
 * moved no cell for as long as every case sustained all eight samples, because every declaration
 * could only mean "all of them". `hold` says the number instead, and `spike` became `hold: 1`.
 *
 * The vocabulary is closed here and checked by the guard, because the first version tested
 * `derivation === 'counter'` and treated everything else as a step -- so a typo produced a different
 * shape from the one the author wrote, and no reading of the file revealed it.
 */
export const SERIES_DERIVATIONS = ['step', 'counter'] as const;

/** How a declared series moves. Derived from `SERIES_DERIVATIONS`. */
export type SeriesDerivation = (typeof SERIES_DERIVATIONS)[number];

/**
 * Whether a declared series carries sampling noise.
 *
 * - `sampled` (the default): the reading is a quantity measured by sampling -- a latency percentile, a
 *   queue depth -- and the samples are drawn around it by a fixed cycle of ±2 %.
 * - `none`: the reading is computed rather than sampled. A ratio of counted events over a scrape
 *   interval is exact: when every request failed at every scrape, the share is 1 and not 1.02, and a
 *   condition that reads 1 is ready rather than 98 % ready.
 *
 * The field exists because the corpus asserted the second kind with the first kind's noise: a
 * `node_condition_ready` at 1 wobbled to 0.98 and only the ceiling clamp kept it from 1.02, which was
 * a claim about the data that the data does not make (finding 254). A closed vocabulary rather than a
 * boolean, because a third kind -- a reading whose noise is known to be asymmetric, say -- would
 * otherwise arrive as a new boolean somewhere else.
 */
export const SERIES_NOISE = ['sampled', 'none'] as const;

/** How much sampling noise a declared series carries. Derived from `SERIES_NOISE`. */
export type SeriesNoise = (typeof SERIES_NOISE)[number];

/**
 * Samples per side of the onset.
 *
 * The *count* is fixed and the cadence is derived from the window, which is the reverse of how this
 * started. A fixed ninety-second cadence meant eight samples covered twelve minutes whatever the
 * window was: for a twenty-minute post-window the series described its first twelve minutes and said
 * nothing about the rest, and a reading over twelve hours -- "restarted 178 times in 12 hours" -- could
 * not be declared at all without compressing the twelve hours into twelve minutes (finding 251).
 *
 * The declaration states the reading at the start of the window and the reading at its end, so the
 * samples are placed at those two ends and spread between them.
 */
export const SERIES_POINTS = 8;

/** The fixed jitter cycle, as a fraction of the reading. */
export const SERIES_JITTER = [0, 1, -1, 0.5, -0.5, 0.8, -0.8, 0.3] as const;

/**
 * Why a declaration's `hold` cannot be read.
 *
 * Three refusals rather than one, because they are three different defects in an annotation and an
 * author who is told "hold is invalid" learns nothing: a hold that is not a whole number of samples,
 * a hold on a shape that accumulates, and a hold outside the number of samples a side has. The
 * third is the interesting one -- `hold: 12` cannot mean "twelve samples at the post value" when a
 * side holds eight, and the only honest readings of it are a typo or a declaration that wanted a
 * different window.
 *
 * `on-a-counter` is checked before the range check because it is the more specific statement: a
 * counter with `hold: 0` has a defect the range check would also find, and the defect worth naming
 * is that the field does not apply to the shape at all.
 */
export type SeriesHoldFault =
  | { kind: 'not-a-count'; hold: unknown; why: string }
  | { kind: 'on-a-counter'; hold: number }
  | { kind: 'out-of-range'; hold: number };

/**
 * What a declaration's `hold` says, and whether it said it.
 *
 * The number comes back even when there is a fault, because every caller expands the series with
 * something and the guard is what refuses the file: returning `undefined` here would make a
 * malformed declaration produce a *different* series rather than a refusal, which is the class of
 * defect that let a misspelled `derivation` survive three rounds. The default is `SERIES_POINTS`,
 * so a fault degrades to the shape the corpus had before the field existed rather than to nothing.
 */
export interface SeriesHoldRead {
  /** How many post-onset samples sit at `post`; the rest return to `baseline`. */
  hold: number;
  /** `null` when the field was read. A fault is reported rather than thrown. */
  fault: SeriesHoldFault | null;
}

/** Why a value is not a whole number of samples, in the words the refusal uses. */
function whyNotACount(raw: unknown): string {
  if (typeof raw !== 'number') return `it is ${raw === null ? 'null' : typeof raw}`;
  return 'it is not a whole number';
}

/**
 * Read `hold`, and name what is wrong with it when something is.
 *
 * Absent means `SERIES_POINTS`: a declaration that says nothing about duration gets the level
 * change the corpus has always meant, so the field is additive rather than a migration. That is the
 * one value this function can take without a declaration, and it is why `hold` is a number here and
 * an optional field on the interface -- "eight" and "whatever a side holds" are the same statement,
 * and only one of them has to be kept in sync with `SERIES_POINTS`.
 */
export function readSeriesHold(declaration: {
  derivation?: SeriesDerivation | undefined;
  hold?: unknown;
}): SeriesHoldRead {
  const raw = declaration.hold;
  if (raw === undefined) return { hold: SERIES_POINTS, fault: null };
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return { hold: SERIES_POINTS, fault: { kind: 'not-a-count', hold: raw, why: whyNotACount(raw) } };
  }
  if (declaration.derivation === 'counter') {
    return { hold: SERIES_POINTS, fault: { kind: 'on-a-counter', hold: raw } };
  }
  if (raw < 1 || raw > SERIES_POINTS) {
    return { hold: SERIES_POINTS, fault: { kind: 'out-of-range', hold: raw } };
  }
  return { hold: raw, fault: null };
}

/**
 * One sentence per refusal, naming the metric rather than the file.
 *
 * The guard prints these into the list of problems it collected, and a reader has the case id on the
 * line above -- so the sentence names the series, which is the thing the author has to edit, and
 * states the rule the value broke. The rules are not restated in the guard: a second copy of "a hold
 * is between 1 and eight" is a copy that can disagree with the expansion.
 */
export function describeSeriesHoldFault(fault: SeriesHoldFault, metric: string): string {
  switch (fault.kind) {
    case 'not-a-count':
      return (
        `'${metric}' declares hold ${JSON.stringify(fault.hold)}, and a hold is a whole number of ` +
        `samples: ${fault.why}`
      );
    case 'on-a-counter':
      return (
        `'${metric}' declares hold on a counter, and a counter accumulates through its post-window -- ` +
        'holding it at its post value would be a level wearing a counter\'s name'
      );
    case 'out-of-range':
      return (
        `'${metric}' declares hold ${String(fault.hold)}, and a hold is between 1 and ` +
        `${String(SERIES_POINTS)} samples -- an absent hold means all ${String(SERIES_POINTS)}`
      );
  }
}

/**
 * The wall-clock length of one post-onset sample, which is the number that turns `hold` into time.
 *
 * The post side divides its own span into `SERIES_POINTS` intervals, so a sample lasts
 * `(windowEnd - onset) / SERIES_POINTS`. No case states that number, and until this round nothing
 * computed it -- which is what let one case write `hold: 4` and `burstMinutes: 4` and be read as two
 * statements of one fact when it was four samples against four minutes, sixteen minutes apart. The
 * two fields are the same fact only when a sample happens to be one unit long, and that is a property
 * of the window rather than of either field.
 */
export function readPostSampleSpacing(when: ExpansionTime): number {
  return (Date.parse(when.windowEnd) - Date.parse(when.onset)) / SERIES_POINTS;
}

/**
 * A stated duration that reuses the sample count as if the two numbers were one quantity.
 *
 * The corpus states a fault's length in two vocabularies: `hold` counts samples, and a parameter such
 * as `burstMinutes` states a span of time. A case that gives both the same number is asserting that
 * one sample is one unit of that parameter, and nothing in the file says so. When the window makes it
 * true the two fields are one fact written twice and the case is honest; when the window makes it
 * false, one of the two is wrong and the file cannot say which -- so the refusal names both numbers
 * and the length of a sample, and leaves the choice of which to change to the author.
 *
 * A parameter whose number is *not* the hold is not a restatement and is not this function's
 * business: `splitDurationMinutes: 17` beside a hold of eight is a fault that lasts seventeen minutes
 * in a window whose post side is wider, and those are different quantities that happen to live in the
 * same file.
 */
export type HoldDurationFault = {
  kind: 'samples-read-as-unit';
  parameter: string;
  value: number;
  unit: string;
  hold: number;
  spacingMs: number;
};

/** What a case's stated duration and its telemetry have to be compared as. */
export interface DurationRestatementInput {
  /** The effective hold of the excursion, as `readSeriesHold` returned it. */
  hold: number;
  /** `readPostSampleSpacing` for the case's own window. */
  spacingMs: number;
  stated: { name: string; value: number; unit: string };
}

/**
 * Whether a stated duration is the hold written in another unit of measure.
 *
 * Three ways to answer "no" and each one is a different statement: a value that is not the hold is a
 * different quantity, a unit that is not a time has no length to compare, and a spacing that equals
 * one unit means the two numbers *are* one fact and the case is consistent.
 */
export function readDurationRestatement(
  input: DurationRestatementInput,
): HoldDurationFault | null {
  const { hold, spacingMs, stated } = input;
  if (stated.value !== hold) return null;
  if (dimensionOfQuietly(stated.unit) !== 'time') return null;
  const unitMs = convertUnit(1, stated.unit, 's') * 1000;
  if (Math.abs(spacingMs - unitMs) < 1) return null;
  return {
    kind: 'samples-read-as-unit',
    parameter: stated.name,
    value: stated.value,
    unit: stated.unit,
    hold,
    spacingMs,
  };
}

/** `dimensionOf` for a unit the table may not know, which is a statement rather than an error here. */
function dimensionOfQuietly(unit: string): string | undefined {
  try {
    return dimensionOf(unit);
  } catch {
    return undefined;
  }
}

/**
 * The sentence the guard prints for a restated duration.
 *
 * Two numbers and a length, because the author has to choose which of the two to change: widen the
 * window so a sample is one minute, or stop giving the parameter the hold's number. Naming the sample
 * length is what makes the choice available -- without it a reader sees `4` twice and agrees with
 * both.
 */
export function describeDurationRestatement(fault: HoldDurationFault): string {
  const unitMs = convertUnit(1, fault.unit, 's') * 1000;
  const perSample = trimNumber(fault.spacingMs / unitMs);
  return (
    `'${fault.parameter}' states ${String(fault.value)} ${fault.unit} beside a hold of ` +
    `${String(fault.hold)} sample(s), and one sample is ${perSample} ${fault.unit}: the same number ` +
    `is a count of samples in one field and a length of time in the other, and the two are one fact ` +
    `only when a sample is one ${fault.unit}`
  );
}

/** A ratio as a short decimal, so a sentence about 3.5 minutes does not read 3.5000000000000004. */
function trimNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

/** Where a declared log line lands, relative to the onset: three lines, a minute and a half apart. */
export const LOG_OFFSETS_MS = [30_000, 150_000, 270_000] as const;

/** Where a declared span lands: ten seconds after the onset, inside every window this corpus uses. */
export const TRACE_OFFSET_MS = 10_000;

/**
 * The window a case declares, which is all the expansion needs from the case.
 *
 * The window is required to hold the onset strictly inside it -- `checkG1Structural` is what enforces
 * that, and this module does not repeat the check. A window whose start were the onset would leave
 * the pre-side with nowhere to put its samples, and adding a guard here would be a second opinion
 * about a contract the schema already owns.
 */
export interface ExpansionTime {
  /** Canonical UTC ISO-8601 window start. */
  windowStart: string;
  /** Canonical UTC ISO-8601 onset. */
  onset: string;
  /** Canonical UTC ISO-8601 window end. */
  windowEnd: string;
}

export interface SeriesDeclaration {
  service: string;
  metric: string;
  unit?: string;
  baseline: number;
  post: number;
  derivation?: SeriesDerivation;
  /** Absent means `sampled`. A counter is exact regardless, so the field says nothing about one. */
  noise?: SeriesNoise;
  /**
   * How many post-onset samples sit at `post` before the series returns to `baseline`.
   *
   * Absent means `SERIES_POINTS`, which is a level change that lasts the whole post-window. A
   * smaller number is an excursion the case recovers from, and until this field existed the corpus
   * had no way to say that: `spike` could say "one sample", and nothing could say "four".
   *
   * Refused on a `counter` (it accumulates through the window; a hold would stop it at its post
   * value) and outside `[1, SERIES_POINTS]` (a side has eight samples, so a hold of twelve is a
   * typo rather than a longer excursion). `readSeriesHold` owns all three refusals.
   */
  hold?: number;
}

export interface LogDeclaration {
  service: string;
  body: string;
  severity?: LogSeverity;
  /**
   * The id a log checkpoint cites this line by.
   *
   * It was declared in every signals file that needed one and read by nothing: the interface had no
   * field for it, so `expandLog` could not put it on the payload, so `logs.json` could not carry it,
   * and a checkpoint's `<entity>|typeerror-line` named a line the export had no way to identify. The
   * id is per *declaration* rather than per emitted row, because the rows differ only in time: a line
   * that recurs is one fact observed repeatedly, which is what a citation of it means.
   */
  id?: string;
}

export interface TraceDeclaration {
  service: string;
  spanName: string;
  durationMs: number;
  parent?: string;
}

function signal(
  resource: { 'service.name': string },
  timestamp: string,
  kind: 'metric' | 'log' | 'trace',
  payload: SignalPayload,
): TelemetrySignal {
  return { irVersion: '1.0.0', resource, timestamp, signal: kind, payload };
}

function at(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * A level reading with its sampling noise applied, kept inside the unit's range and on its grid.
 *
 * The one place where "a measurement plus noise" happens, so the two obligations a unit states are
 * both applied here and nowhere else. `clampToUnit` holds the range -- a share above a ceiling is not
 * a noisy share -- and `quantizeToUnit` holds the grid, because a count is a number of things and
 * `203.2` records is a fractional record rather than a noisy one (finding 284). Neither obligation
 * can stand in for the other: a range says how large a reading may be, and a grid says what it may
 * land on, and `count` has no ceiling for a range to find.
 *
 * A declaration that says `noise: 'none'` gets its level back unchanged, which is what an exact
 * reading is: both calls are then a no-op, because the level is already inside the range and on the
 * grid the declaration was checked against.
 */
function withNoise(
  level: number,
  index: number,
  unit: string | undefined,
  noise: SeriesNoise | undefined,
): number {
  if (noise === 'none') return quantizeToUnit(unit, clampToUnit(unit, level));
  return quantizeToUnit(unit, clampToUnit(unit, level * (1 + SERIES_JITTER[index]! * 0.02)));
}

/**
 * A declared series, expanded into one signal per sample.
 *
 * The last post-onset sample is `post` up to the sampling noise, and exactly `post` when the reading
 * sits at a bound of its unit -- the `+0.3 %` arm would otherwise overshoot, and the clamp is what
 * makes a share of 1 read as 1. The pre-window is drawn around `baseline`, so the two numbers the
 * declaration states are the two numbers a reader can find in the output -- which is what makes a
 * checkpoint asserting `>= post` a statement about data rather than about a file.
 *
 * A declaration with a `hold` shorter than the side returns to its baseline at sample `hold + 1` and
 * stays there, and `longestRun` in G3 therefore stops counting at `hold` -- which is the whole point
 * of the field: the sample axis of the threshold grid asks "how long must an excursion last", and
 * before `hold` no case could answer anything but "the rest of the window".
 */
export function expandSeries(declaration: SeriesDeclaration, when: ExpansionTime): TelemetrySignal[] {
  const windowStartMs = Date.parse(when.windowStart);
  const onsetMs = Date.parse(when.onset);
  const windowEndMs = Date.parse(when.windowEnd);
  const derivation = declaration.derivation ?? 'step';
  const out: Array<{ timestamp: string; value: number }> = [];

  // The pre-side is left-aligned on the window start and the post-side is right-aligned on the end,
  // so the two readings the declaration states sit at the two ends of the window it declares. Each
  // side keeps `SERIES_POINTS` samples and divides its own span into that many intervals.
  const preSpacing = (onsetMs - windowStartMs) / SERIES_POINTS;
  const postSpacing = (windowEndMs - onsetMs) / SERIES_POINTS;

  for (let index = 0; index < SERIES_POINTS; index += 1) {
    // A counter's pre-window is flat: the declaration's baseline is what it had accumulated by the
    // start of the window, and a value that rises before the fault is a claim the file does not make.
    const value =
      derivation === 'counter'
        ? declaration.baseline
        : withNoise(declaration.baseline, index, declaration.unit, declaration.noise);
    out.push({ timestamp: at(windowStartMs + index * preSpacing), value });
  }

  const increment = (declaration.post - declaration.baseline) / SERIES_POINTS;
  // How long the excursion lasts, as a number. A declaration that names no hold holds for the whole
  // side, and one that names a hold of four returns to its baseline for the last four samples.
  const { hold } = readSeriesHold(declaration);
  for (let index = 0; index < SERIES_POINTS; index += 1) {
    const level =
      derivation === 'counter'
        ? declaration.baseline + (index + 1) * increment
        : index < hold
          ? declaration.post
          : declaration.baseline;
    // The jitter is applied to the level a sample sits at, so an excursion's samples are post-sized
    // and its return is baseline-sized, and a counter's accumulation is exact because it is a total.
    // A counter is exact but not necessarily whole: (178 - 0) / 8 is 22.25 of a restart, so the
    // accumulation lands on the unit's grid as well -- the same obligation the noise has, and the
    // reason the quantize call is outside the `derivation` test rather than a fourth branch.
    const value =
      derivation === 'counter'
        ? quantizeToUnit(declaration.unit, level)
        : withNoise(level, index, declaration.unit, declaration.noise);
    out.push({ timestamp: at(onsetMs + (index + 1) * postSpacing), value });
  }

  return out.map((row) =>
    signal({ 'service.name': declaration.service }, row.timestamp, 'metric', {
      kind: 'metric',
      name: declaration.metric,
      ...(declaration.unit === undefined ? {} : { unit: declaration.unit }),
      value: Number(row.value.toFixed(6)),
    }),
  );
}

/**
 * A declared log line, expanded into the signals an exporter reads.
 *
 * A log has no baseline to be measured against, so every line lands after the onset and G3 -- which
 * reads only metrics -- ignores them. Three lines rather than one, because a `logs.csv` with three
 * rows is a file an exporter can say something about, where a single row looks like an event rather
 * than a condition.
 */
export function expandLog(declaration: LogDeclaration, when: ExpansionTime): TelemetrySignal[] {
  const onsetMs = Date.parse(when.onset);
  return LOG_OFFSETS_MS.map((offset) =>
    signal({ 'service.name': declaration.service }, at(onsetMs + offset), 'log', {
      kind: 'log',
      body: declaration.body,
      ...(declaration.severity === undefined ? {} : { severityText: declaration.severity }),
      ...(declaration.id === undefined ? {} : { templateId: declaration.id }),
    }),
  );
}

/**
 * Declared spans, expanded into the signals an exporter reads.
 *
 * The span ids are a digest of the case id rather than a prefix of it. The first version sliced the
 * id to twelve characters, which collides for any two cases that agree up to that point --
 * `history-checkout-a` and `history-checkout-b` would have produced the same span ids, and one
 * case's trace would have pointed into the other's. A prefix of a name is a name, not an identity;
 * `derived-telemetry.test.ts` asserts two such ids stay apart, which is a property nothing could
 * check while this function lived in a script.
 */
export function expandTraces(
  declarations: readonly TraceDeclaration[],
  when: ExpansionTime,
  caseId: string,
): TelemetrySignal[] {
  const onsetMs = Date.parse(when.onset);
  const namespace = createHash('sha256').update(caseId).digest('hex').slice(0, 12);
  const spanId = (index: number): string => `${namespace}${String(index + 1).padStart(4, '0')}`;
  const idByName = new Map(declarations.map((one, index) => [one.spanName, spanId(index)]));
  return declarations.map((one, index) =>
    signal({ 'service.name': one.service }, at(onsetMs + TRACE_OFFSET_MS), 'trace', {
      kind: 'trace',
      traceId: `${namespace}trace`,
      spanId: spanId(index),
      ...(one.parent === undefined ? {} : { parentSpanId: idByName.get(one.parent) }),
      spanName: one.spanName,
      durationMs: one.durationMs,
    }),
  );
}
