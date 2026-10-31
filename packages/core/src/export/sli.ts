import { isMetricSignal } from '../ir/guards.js';
import type { TelemetrySignal } from '../ir/types.js';
import { MIN_SENTENCE_LENGTH, looksLikeSentence } from '../util/prose.js';
import { knownUnits } from '../util/unit.js';
import { caseToken } from './tokens.js';

/**
 * Which reading ranks a case, and the one name upstream will look for.
 *
 * ## The defect this answers
 *
 * `main.py` does not ask a dataset which series to rank by. It recognises the dataset by a token in
 * the **path** and then takes a column whose name it also decides:
 *
 *     elif "online-boutique" in data_path or ... or "RE2-OB" in data_path or "RE3-OB" in data_path:
 *         sli = "frontend_latency"
 *         if f"{service}_latency" in data: sli = f"{service}_latency"
 *     ...
 *     else:
 *         raise ValueError("SLI not implemented")
 *
 * So `process()` raises `ValueError("SLI not implemented")` for a corpus it does not recognise, and
 * for one it does recognise it ranks by `{service}_latency` or by nothing. An export of ours could be
 * well formed, on the right clock, complete in its modalities, and still be refused before a single
 * number is compared -- and the refusal would name our *path*, not any defect of the data.
 *
 * ## What this repository can answer, and what it cannot
 *
 * It cannot change upstream's token table, and it does not try: writing `online-boutique` into the
 * path of a case about a synthetic storefront would make the dataset claim to be a system it is not,
 * which is the one thing a benchmark's path must not do (`{system}` is free-form to upstream).
 *
 * It can answer the half that belongs to the data. A case says which of its own readings ranks it --
 * a duration carried by the component the answer key names -- and the exporter publishes that series
 * under `{service}_latency`, the name upstream's lookup constructs from the path. Both halves of that
 * name come from one place: `casePath` builds the path's service segment and this module builds the
 * column with the same `caseToken`, so upstream's `service` and our column cannot be spelled
 * differently.
 *
 * A case with no such reading says so, in a sentence, and the declaration is what makes the quiet
 * answer different from the missing one. That is the shape this corpus settled on for parameters
 * (finding 326): the file answers, and the guard refuses a case that stays silent.
 *
 * ## Why the declaration is read here rather than validated by the schema
 *
 * `faultCaseSchema` admits `sli` as written and `readSliDeclaration` is the only judge. A schema
 * would refuse `{ "service": "checkout-api" }` with `Invalid input` and stop -- and the useful
 * sentence is the one that says which half is missing and what the name would have been. One judge,
 * one message, and it is the message a reader of the corpus needs.
 */

/**
 * What upstream appends to the service token.
 *
 * Quoted from `main.py` twice above and written once here, because it is the *consumer's* name and
 * not a preference: `frontend_latency` is the Online Boutique default and `{service}_latency` is the
 * override, so a corpus that is not Online Boutique has exactly one name available to it.
 */
export const SLI_SUFFIX = '_latency';

/** The column upstream will look for, given the service token it will compute from the path. */
export function sliColumn(service: string): string {
  return `${caseToken(service)}${SLI_SUFFIX}`;
}

/**
 * What a case says about the reading that ranks it.
 *
 * `none` is a declaration, not an absence: a case whose symptom is a share, a count or a state has no
 * duration to rank by, and the sentence says which reading came closest and why it is not one. The
 * guard requires the sentence, so "no SLI" is always an answer somebody wrote rather than a field
 * nobody filled in.
 */
export type CaseSli =
  | { readonly service: string; readonly metric: string }
  | { readonly none: string };

/** Every way a case's declaration fails to answer. */
export type SliFault =
  /** The case carries no declaration at all. */
  | { kind: 'absent' }
  /** The declaration is not one of the two shapes, and `why` names the shape it is not. */
  | { kind: 'unreadable'; sli: unknown; why: string }
  /** The reading is on a different service than the path names, so the alias would move numbers. */
  | { kind: 'foreign'; service: string; component: string }
  /** The case says nothing ranks it, and the reason is a label rather than a sentence. */
  | { kind: 'vague'; reason: string }
  /** The declaration names a `(service, metric)` pair no metric signal in the case carries. */
  | { kind: 'unresolved'; service: string; metric: string; carries: readonly string[] }
  /** The named series is not a duration, and the column it would be published under is `_latency`. */
  | { kind: 'notDuration'; metric: string; unit: string }
  /** The table already has a column of the name upstream asks for. */
  | { kind: 'collision'; column: string };

export interface SliRead {
  readonly fault: SliFault | null;
  /** The declaration, when it could be read. `null` for an absent or unreadable one. */
  readonly declaration: CaseSli | null;
  /** The column the export will publish, when the declaration names a reading. */
  readonly column: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The type of a value that is not a declaration, in the words the refusal uses for it. */
function describeKind(value: unknown): string {
  return Array.isArray(value) ? 'an array' : `a ${typeof value}`;
}

/**
 * Read a case's declaration against the component the answer key names.
 *
 * This half needs no telemetry -- it is about what the file *says* -- which is why it is separate
 * from `resolveSli`: a corpus is checked before its data is built, and a declaration that names
 * another service is wrong whether or not the series it names exists.
 */
export function readSliDeclaration(input: { sli: unknown; component: string }): SliRead {
  const { sli } = input;
  if (sli === undefined || sli === null) return { fault: { kind: 'absent' }, declaration: null, column: null };
  if (!isPlainObject(sli)) {
    return { fault: { kind: 'unreadable', sli, why: `is ${describeKind(sli)}` }, declaration: null, column: null };
  }

  const hasNone = Object.hasOwn(sli, 'none');
  const hasService = Object.hasOwn(sli, 'service');
  const hasMetric = Object.hasOwn(sli, 'metric');
  if (hasNone && (hasService || hasMetric)) {
    return {
      fault: { kind: 'unreadable', sli, why: 'names a reading and a reason at the same time' },
      declaration: null,
      column: null,
    };
  }
  if (hasNone) {
    if (typeof sli['none'] !== 'string') {
      return { fault: { kind: 'unreadable', sli, why: 'states a reason that is not text' }, declaration: null, column: null };
    }
    const reason = sli['none'];
    if (!looksLikeSentence(reason)) {
      return { fault: { kind: 'vague', reason }, declaration: null, column: null };
    }
    return { fault: null, declaration: { none: reason }, column: null };
  }
  if (!hasService || !hasMetric) {
    return {
      fault: { kind: 'unreadable', sli, why: 'names neither a reading nor a reason' },
      declaration: null,
      column: null,
    };
  }
  const service = sli['service'];
  const metric = sli['metric'];
  if (typeof service !== 'string' || typeof metric !== 'string' || service === '' || metric === '') {
    return {
      fault: { kind: 'unreadable', sli, why: 'names a reading with an empty service or metric' },
      declaration: null,
      column: null,
    };
  }
  // Ownership before resolution, and it is the interesting one: the column is named after the path,
  // which is named after the answer key. A reading on another service would be published under the
  // answer key's name, and every number downstream would be about the wrong component.
  if (caseToken(service) !== caseToken(input.component)) {
    return { fault: { kind: 'foreign', service, component: input.component }, declaration: null, column: null };
  }
  return { fault: null, declaration: { service, metric }, column: sliColumn(service) };
}

export interface SliPublication {
  readonly fault: SliFault | null;
  /**
   * The one rename the metric table needs, or `null` when there is nothing to publish.
   *
   * `from` is the column the case's own series already has and `to` is the name upstream looks for;
   * the two are equal when the case names its series that way already, and the rename is then the
   * identity rather than a second column.
   */
  readonly publish: { readonly from: string; readonly to: string } | null;
}

/**
 * Resolve a declaration against the telemetry the case actually carries.
 *
 * Three refusals, and each is a table that would have been wrong in a way no reader could see:
 * a column upstream looks for and does not find (the case is not rankable and the file says so),
 * a column that carries seconds of lead-time error under a name meaning request latency (the alias
 * is a rename, and a rename may not change the quantity), and a name already taken (the alias would
 * replace another series' numbers with these).
 */
export function resolveSli(input: {
  declaration: CaseSli;
  signals: readonly TelemetrySignal[];
}): SliPublication {
  if ('none' in input.declaration) return { fault: null, publish: null };
  const { service, metric } = input.declaration;
  const wanted = `${service}_${metric}`;

  // The unit of each column, keyed by the column name, because the unit is the one property of a
  // series this decision reads and a map of signals would carry the narrowing away with it.
  const units = new Map<string, string | undefined>();
  for (const signal of input.signals) {
    if (!isMetricSignal(signal)) continue;
    const column = `${signal.resource['service.name']}_${signal.payload.name}`;
    if (!units.has(column)) units.set(column, signal.payload.unit);
  }

  if (!units.has(wanted)) {
    return {
      fault: { kind: 'unresolved', service, metric, carries: [...units.keys()].sort() },
      publish: null,
    };
  }

  const unit = units.get(wanted);
  if (!isDuration(unit)) {
    return { fault: { kind: 'notDuration', metric, unit: unit ?? '(no unit)' }, publish: null };
  }

  const column = sliColumn(service);
  // A case whose series is already called `{service}_latency` is not a collision with itself: the
  // alias would be the column, and the rename is the identity.
  if (column !== wanted && units.has(column)) {
    return { fault: { kind: 'collision', column }, publish: null };
  }
  return { fault: null, publish: { from: wanted, to: column } };
}

/**
 * Whether a unit is a duration, asked of the converter rather than of a list here.
 *
 * `_latency` is a name that asserts a dimension, so the unit has to be in that dimension and the
 * question is `util/unit.ts`'s: it owns the one table of units and their dimensions, and a second
 * opinion here would be a second vocabulary.
 *
 * It asks `knownUnits()` rather than `dimensionOf()` because the latter answers a question it was
 * not asked -- a unit outside the table is an *exception* there, and turning it into a boolean means
 * a `try` whose `catch` re-throws everything it does not recognise: an arm no input can reach, and
 * the shape this repository removes rather than annotates. An unknown unit is simply not a duration,
 * and the refusal names the string it found.
 */
function isDuration(unit: string | undefined): boolean {
  if (unit === undefined) return false;
  return knownUnits()['time'].includes(unit);
}

/** The sentence a reader of the guard's output gets for each way a declaration falls short. */
export function describeSliFault(fault: SliFault, caseId: string): string {
  switch (fault.kind) {
    case 'absent':
      return (
        `'${caseId}' carries no sli declaration, and every case says either which reading ranks it or ` +
        'why no reading can -- upstream ranks by a column named after the path, and a case that says ' +
        'nothing leaves that column to be guessed'
      );
    case 'unreadable':
      return (
        `'${caseId}' carries sli as ${describeKind(fault.sli)}, which ${fault.why} -- it is either ` +
        '`{ "service": ..., "metric": ... }` or `{ "none": "<one sentence>" }`'
      );
    case 'foreign':
      return (
        `'${caseId}' ranks by a reading on '${fault.service}', and upstream builds the column name from ` +
        `the path's service, which is '${caseToken(fault.component)}' -- publishing one service's ` +
        "numbers under another's name is the one thing the alias must not do"
      );
    case 'vague':
      return (
        `'${caseId}' says no reading ranks it and gives '${fault.reason}' as the reason, which is a ` +
        `label: the sentence has to say which reading came closest and why it is not one, in at ` +
        `least ${String(MIN_SENTENCE_LENGTH)} characters`
      );
    case 'unresolved':
      return (
        `'${caseId}' ranks by '${fault.service}_${fault.metric}', and no metric signal in the case ` +
        `carries that pair (the case carries: ${fault.carries.join(', ') || 'nothing'})`
      );
    case 'notDuration':
      return (
        `'${caseId}' ranks by '${fault.metric}', which is in '${fault.unit}', and the column upstream ` +
        'looks for is named `_latency`: a reading published there has to be a duration, or the name ' +
        'would be a claim about a quantity the numbers are not'
      );
    case 'collision':
      return (
        `'${caseId}' would publish '${fault.column}', and its metric table already has a column of ` +
        'that name for a different series -- the alias replaces one series with the name it is ' +
        'published under, so two series cannot share it'
      );
  }
}
