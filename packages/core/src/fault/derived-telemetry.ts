import { createHash } from 'node:crypto';

import type { LogSeverity, SignalPayload, TelemetrySignal } from '../ir/types.js';
import { clampToUnit } from '../util/unit.js';

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
 * - `step` (the default): a level change that holds for the whole post-window.
 * - `counter`: an accumulating series, because a counter that jumps to its post value is a level
 *   wearing a counter's name.
 * - `spike`: one post-onset sample at the post value, then the baseline again.
 *
 * `spike` exists because a corpus that can only express a step cannot say what a brief excursion
 * looks like, and the two baselines treat that shape differently: peak-z cannot distinguish it from a
 * sustained change, and a median over the window barely notices it. It is what the negative control
 * for G4's two-solver requirement is built from.
 *
 * The vocabulary is closed here and checked by the guard, because the first version tested
 * `derivation === 'counter'` and treated everything else as a step -- so a typo produced a different
 * shape from the one the author wrote, and no reading of the file revealed it.
 */
export const SERIES_DERIVATIONS = ['step', 'counter', 'spike'] as const;

/** How a declared series moves. Derived from `SERIES_DERIVATIONS`. */
export type SeriesDerivation = (typeof SERIES_DERIVATIONS)[number];

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
}

export interface LogDeclaration {
  service: string;
  body: string;
  severity?: LogSeverity;
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
 * A level reading with the sampling noise applied, kept inside the unit's range.
 *
 * The one place where "a measurement plus noise" happens, so the bound is applied wherever noise is
 * and nowhere else. `clampToUnit` leaves the value alone when the declaration names no unit or names
 * one the table does not know, because then there is no range to keep it in.
 */
function withNoise(level: number, index: number, unit: string | undefined): number {
  return clampToUnit(unit, level * (1 + SERIES_JITTER[index]! * 0.02));
}

/**
 * A declared series, expanded into one signal per sample.
 *
 * The last post-onset sample is `post` up to the sampling noise, and exactly `post` when the reading
 * sits at a bound of its unit -- the `+0.3 %` arm would otherwise overshoot, and the clamp is what
 * makes a share of 1 read as 1. The pre-window is drawn around `baseline`, so the two numbers the
 * declaration states are the two numbers a reader can find in the output -- which is what makes a
 * checkpoint asserting `>= post` a statement about data rather than about a file.
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
        : withNoise(declaration.baseline, index, declaration.unit);
    out.push({ timestamp: at(windowStartMs + index * preSpacing), value });
  }

  const increment = (declaration.post - declaration.baseline) / SERIES_POINTS;
  for (let index = 0; index < SERIES_POINTS; index += 1) {
    const level =
      derivation === 'counter'
        ? declaration.baseline + (index + 1) * increment
        : derivation === 'spike' && index > 0
          ? declaration.baseline
          : declaration.post;
    // The jitter is applied to the level a sample sits at, so a spike's excursion is post-sized and
    // its return is baseline-sized, and a counter's accumulation is exact because it is a total.
    const value = derivation === 'counter' ? level : withNoise(level, index, declaration.unit);
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
