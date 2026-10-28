import type { EntityGraph } from '../ir/types.js';
import type { SeriesDeclaration } from './derived-telemetry.js';

/**
 * The system's background telemetry, and the rules that keep it from becoming evidence.
 *
 * A case's own signals file carries the series its incident is about, and every number there has to
 * quote a sentence of the ticket. That rule is what keeps an annotation honest, and it is also what
 * capped every ranking at the two or three services the story names. A ranking of two, scored at
 * top-3, cannot be missed: fifteen cases reported fifteen top-3 hits and the claim was measured by
 * nothing (finding 275).
 *
 * This module is the other half -- the whole system at its ordinary request rates, flat through
 * every window. It exists to make "the answer is within the top 3" a sentence that can be false, and
 * the rules below are what keep it from turning into a second way to say anything:
 *
 * - **it asserts nothing about an incident.** Background entries have no quote, and the evidence
 *   resolver reads a case's own declarations only, so a checkpoint citing a background series fails
 *   as undeclared rather than passing on telemetry nobody measured.
 * - **it is flat.** `backgroundSeries` emits `baseline === post` with `noise: 'none'`, so a quiet
 *   service's statistic is exactly zero. A jittered flat series would rank the quiet services
 *   against each other by floating-point rounding, and `locatedRank` would read a quiet answer as
 *   "rank 3 of the ones that showed nothing".
 * - **it is the whole system, or nothing.** An entry naming an entity the graph does not hold is a
 *   series attributed to nothing; a service the graph holds and the background omits is a candidate
 *   the ranking silently leaves out, which is the narrow ranking this file exists to end,
 *   reintroduced one service at a time.
 * - **a case's own declaration wins.** A case whose fault *is* a request-rate collapse has to be
 *   able to say so, and the background may not flatten it back.
 */

export interface BackgroundSeries {
  service: string;
  metric: string;
  unit?: string;
  value: number;
}

export interface BackgroundDeclaration {
  why: string;
  series: BackgroundSeries[];
}

/** The schema string a background file must carry. */
export const BACKGROUND_SCHEMA = 'rca-bench-background-telemetry/1';

export type BackgroundParse = { declaration: BackgroundDeclaration } | { problems: string[] };

/**
 * Read a background file, or say every way it is not one.
 *
 * Problems are collected rather than thrown one at a time: a file with four defects is one repair,
 * and a reader who fixes them in sequence has to run the guard four times to see the fourth.
 */
export function parseBackground(raw: unknown): BackgroundParse {
  const problems: string[] = [];
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  if (record.schema !== BACKGROUND_SCHEMA) {
    problems.push(`declares schema ${JSON.stringify(record.schema)}, and this repository reads '${BACKGROUND_SCHEMA}'`);
  }
  const why = typeof record.why === 'string' ? record.why : '';
  if (why.length < 40) {
    problems.push('does not say in at least forty characters why the background exists');
  }
  const declared = Array.isArray(record.series) ? record.series : [];
  if (declared.length === 0) {
    problems.push('declares no series, so it widens no ranking');
  }

  const seen = new Set<string>();
  const series: BackgroundSeries[] = [];
  for (const entry of declared) {
    const one = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    const service = typeof one.service === 'string' ? one.service : '';
    const metric = typeof one.metric === 'string' ? one.metric : '';
    if (service === '' || metric === '') {
      problems.push('declares a background series with no service or no metric');
      continue;
    }
    const pair = `${service}|${metric}`;
    if (seen.has(pair)) {
      problems.push(`declares '${pair}' twice, so the ranking would hold one service twice`);
      continue;
    }
    seen.add(pair);
    if (typeof one.value !== 'number' || !Number.isFinite(one.value)) {
      problems.push(`declares '${pair}' with a value of ${JSON.stringify(one.value)}, which is not a number`);
      continue;
    }
    if (one.unit !== undefined && typeof one.unit !== 'string') {
      problems.push(`declares '${pair}' with a unit that is not a string`);
      continue;
    }
    series.push({
      service,
      metric,
      value: one.value,
      ...(one.unit === undefined ? {} : { unit: one.unit }),
    });
  }

  if (problems.length > 0) return { problems };
  return { declaration: { why, series } };
}

/**
 * Whether the background is the system the graph describes.
 *
 * Both directions, because each failure means something different: an entry the graph does not hold
 * is a series attributed to nothing, and a service the background omits is a candidate that never
 * competed.
 */
export function backgroundProblems(declaration: BackgroundDeclaration, graph: EntityGraph): string[] {
  const problems: string[] = [];
  const services = graph.entities.filter((entity) => entity.kind === 'service').map((entity) => entity.name);
  const named = new Set(declaration.series.map((one) => one.service));
  for (const name of named) {
    if (!services.includes(name)) {
      problems.push(
        `declares a series for '${name}', which is not a service in the graph ` +
          `(it holds: ${services.join(', ')})`,
      );
    }
  }
  for (const name of services) {
    if (!named.has(name)) {
      problems.push(
        `omits the service '${name}', so a case whose answer is not it is scored against a ranking ` +
          'that the omission shortened',
      );
    }
  }
  return problems;
}

/**
 * The declarations a case should emit, given its own series and the corpus's background.
 *
 * A case's own declaration wins on the `(service, metric)` pair -- not on the service, because one
 * service's quiet request rate says nothing about the metric an incident moved in it.
 */
export function backgroundSeries(
  own: readonly SeriesDeclaration[],
  background: readonly BackgroundSeries[],
): SeriesDeclaration[] {
  const taken = new Set(own.map((one) => `${one.service}|${one.metric}`));
  const out: SeriesDeclaration[] = [];
  for (const one of background) {
    if (taken.has(`${one.service}|${one.metric}`)) continue;
    out.push({
      service: one.service,
      metric: one.metric,
      ...(one.unit === undefined ? {} : { unit: one.unit }),
      baseline: one.value,
      post: one.value,
      noise: 'none',
    });
  }
  return out;
}
