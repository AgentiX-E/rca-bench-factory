import { normalizeFaultType } from './collector.js';
import { isRecord } from '../util/json.js';

/**
 * Extraction-accuracy scoring for the historical-fault channel (M13 channel B).
 *
 * `importer.ts` produces an `ExtractedFault` from an incident text and
 * `validateExtractedFault` turns it into a `FaultSpec`. Neither of them answers
 * the question the M1 exit condition is written in terms of: *how accurate is
 * the extraction*. This module is that answer, and it is deliberately a pure
 * function of (golden sample, prediction) so the figure is reproducible without
 * an LLM in the loop.
 *
 * Three decisions carry the design, and each one is a place where the obvious
 * implementation would have produced a plausible number that was not a true one.
 *
 * ---
 *
 * **1. Four verdict states, not two.**
 *
 * A response can fail to parse; parse but fail validation; parse and validate but
 * concern a fault whose expected signal cannot be checked in the telemetry that
 * exists; or arrive fully graded. The middle two are not model errors:
 *
 *   - `unvalidated` is *usually* a pipeline defect. `validateExtractedFault`
 *     rejects a spec `importer.ts` accepted, which means one of the two is
 *     wrong, and charging the model for that is how a scoring run hides a real
 *     bug behind a bad accuracy number.
 *   - `unverifiable` is an absence of evidence. `gates/validity.ts` refuses to
 *     call a fault valid when the signal it expects is missing from the corpus,
 *     and that is a property of the corpus, not of the extraction.
 *
 * Folding either into `graded: false` would report an accuracy the pipeline did
 * not measure. Folding either into `graded: true` -- the shape the first draft
 * had, by reading `validation.valid` and stopping there -- is worse, because it
 * reports a hit for a sample nothing checked.
 *
 * **2. Layered rates, each with its own denominator.**
 *
 * `{ hits, total, rate }` rather than a bare ratio, for two reasons. A reader
 * cannot audit a ratio without its denominator, and a report that says "type
 * accuracy 100%" is a different claim when it is 2/2 than when it is 200/200.
 * `LayeredRate` is the same shape `coverage.ts` uses for its per-signal figures,
 * so the two reports read alike.
 *
 * Every per-field figure is reported twice, and they answer different questions:
 *
 *   - `graded` -- of the samples that produced a scoreable answer, how many got
 *     this field right. This is the model's accuracy, conditioned on the
 *     pipeline having worked.
 *   - `overall` -- of *all* samples, how many got this field right. This is what
 *     a caller who runs the channel end to end actually observes, because an
 *     unparseable response costs them the field too.
 *
 * Collapsing the two into one ratio is what makes an accuracy number arguable:
 * a run whose real problem is a 40% parse failure can be quoted as "93% type
 * accuracy" and nobody is lying.
 *
 * **3. An empty cell is not a zero.**
 *
 * A rate over zero samples is `null`, never `0`. `0` is a claim about the model;
 * `null` is a statement that nothing was measured, and a report must not use the
 * same value for both. The first run of a new channel has a `null` strict rate,
 * and the honest readout of that is "no measurement yet" -- which is exactly what
 * the fourth CI anchor failed to say for twelve consecutive runs.
 *
 * The same rule applies one level down, to a single field. A sample that omits
 * `category` is not scored as a wrong category, because
 * `validateExtractedFault` would have inferred one from the type and reading the
 * *validated* spec back would credit the inference to the model. The scorer
 * therefore reads the raw extraction, and an omitted optional field is `null` --
 * excluded from the denominator -- unless the golden sample stated an expectation
 * for it, in which case the omission is a real miss and is scored `false`.
 */

/** The dataset schema this scorer reads. Versioned so a future change is visible. */
export const FAULT_GOLDEN_SCHEMA = 'rca-bench-fault-golden/1';

/**
 * The M1 exit condition: a strict all-fields rate at or above this clears it.
 *
 * Strict means every field the sample expected was right, including the optional
 * ones when the sample stated them. A per-field average would let a run pass on
 * a fault type the model always gets right while never once getting the
 * component, and the component is what a downstream ranking signal needs.
 */
export const M1_STRICT_THRESHOLD = 0.7;

/** The fields a sample can be scored on. */
export const SCORED_FIELDS = ['type', 'category', 'component', 'description'] as const;

export type ScoredField = (typeof SCORED_FIELDS)[number];

/**
 * The four states a sample can end in.
 *
 * `graded` is the only one that contributes to a field rate.
 */
export type SampleState = 'unparseable' | 'unvalidated' | 'unverifiable' | 'graded';

/** A rate together with the denominator it was computed over. */
export interface LayeredRate {
  hits: number;
  total: number;
  /** `null` when `total` is 0. Never 0 -- see the module note on empty cells. */
  rate: number | null;
}

/** Per-field outcome: `true` hit, `false` miss, `null` not scored. */
export type FieldOutcome = boolean | null;

export interface SampleVerdict {
  sampleId: string;
  state: SampleState;
  /** One entry per scored field. `null` means the field was not scored. */
  fields: Record<ScoredField, FieldOutcome>;
}

/** The ground truth for one incident text, hand-written and version-controlled. */
export interface GoldenSample {
  id: string;
  incidentText: string;
  expected: {
    type: string;
    category?: string;
    component?: string;
    description?: string;
  };
}

export interface GoldenDataset {
  schema: string;
  samples: GoldenSample[];
}

/**
 * What a scoring run observed for one sample.
 *
 * `extracted` is the *raw* extraction, before validation, so an inferred
 * category is not credited to the model.
 */
export interface ExtractionSamplePrediction {
  sampleId: string;
  parseOk: boolean;
  /** `parseFaultExtractionResponse` output, or absent when the parse failed. */
  extracted?: {
    type: string;
    category?: string;
    component?: string;
    description?: string;
    confidence?: number;
  };
  /** `validateExtractedFault(...).valid`; absent when the parse failed. */
  validationValid?: boolean;
  /**
   * Whether the fault's expected signal exists in the corpus at all.
   * Absent is treated as verifiable -- a scorer must not invent an excuse.
   */
  verifiable?: boolean;
}

export interface LayerMetrics {
  parse: LayeredRate;
  validation: LayeredRate;
  graded: LayeredRate;
  /** Keyed `type`/`category`/`component`/`description`, one entry each. */
  type: { graded: LayeredRate; overall: LayeredRate };
  category: { graded: LayeredRate; overall: LayeredRate };
  component: { graded: LayeredRate; overall: LayeredRate };
  description: { graded: LayeredRate; overall: LayeredRate };
}

export interface ExtractionReport {
  total: number;
  counts: Record<SampleState, number>;
  /** Every expected field was right, over graded samples. */
  strict: LayeredRate;
  layers: LayerMetrics;
}

function rate(hits: number, total: number): LayeredRate {
  return { hits, total, rate: total === 0 ? null : hits / total };
}

/**
 * Compare a fault type, category, component or description, folding case and
 * separators.
 *
 * `normalizeFaultType` is reused rather than reimplemented: it is the same
 * function `parseFaultSpec` will apply downstream, so a value that matches here
 * is a value that survives to the spec. A category is folded the same way, with
 * no synonym table -- deciding that `net` means `network` is a judgement, and
 * `importer.ts` deliberately leaves that judgement to the H3 reviewer.
 *
 * Both parameters are `string` and not `string | undefined`. The first draft
 * accepted undefined on either side and returned false for it, which read like
 * defensive programming and was in fact an unreachable branch: the only caller
 * is `scoreField`, which has already established that the sample states an
 * expectation and the model answered before it gets here. A guard nothing can
 * reach is not a guard -- it is a branch that looks covered by a reader and is
 * invisible to the threshold, and this repository's rule is to narrow the type
 * rather than annotate the branch. The *decisions* it appeared to make live in
 * `scoreField`, where each of them is reachable and each has its own test.
 */
function sameValue(a: string, b: string): boolean {
  return normalizeFaultType(a) === normalizeFaultType(b);
}

/**
 * Grade one sample.
 *
 * The first branch that matches wins, so the states are ordered from "no answer"
 * to "answer, but nothing to check it against" to "answer, checked".
 */
export function scoreExtractionSample(
  sample: GoldenSample,
  prediction: ExtractionSamplePrediction,
): SampleVerdict {
  if (prediction.sampleId !== sample.id) {
    // Pairing by position is the failure mode this guards. A single reordered
    // sample file would otherwise score every prediction against the wrong
    // ground truth, and the run would look like a model change rather than a
    // data change.
    throw new Error(
      `prediction for '${prediction.sampleId}' does not match sample '${sample.id}'; ` +
        'predictions are paired by id, so the sample file and the prediction file disagree',
    );
  }

  const none: Record<ScoredField, FieldOutcome> = {
    type: null,
    category: null,
    component: null,
    description: null,
  };

  if (!prediction.parseOk || prediction.extracted === undefined) {
    return { sampleId: sample.id, state: 'unparseable', fields: { ...none } };
  }

  if (prediction.validationValid !== true) {
    return { sampleId: sample.id, state: 'unvalidated', fields: { ...none } };
  }

  if (prediction.verifiable === false) {
    return { sampleId: sample.id, state: 'unverifiable', fields: { ...none } };
  }

  const got = prediction.extracted;
  const want = sample.expected;

  /**
   * Score a required-ish field. `type` and `category` are always scored once the
   * sample reaches `graded`, because the sample always states a type and
   * `category` is only scored when the sample states one -- an omitted expected
   * category means there is nothing to compare against, not that the model
   * failed.
   */
  const scoreField = (field: ScoredField): FieldOutcome => {
    const expected = want[field];
    if (expected === undefined) {
      // The sample states no expectation, so there is nothing for the model's
      // answer to be right or wrong about. Scoring `false` here -- which is what
      // a plain `sameValue` returns for a present answer against an absent
      // expectation -- charges the model for an omission the ground truth made.
      return null;
    }
    const actual = got[field];
    if (actual === undefined) {
      // The sample *did* state an expectation and the model omitted the field.
      // That is a real miss and must enter the denominator.
      return false;
    }
    return sameValue(expected, actual);
  };

  return {
    sampleId: sample.id,
    state: 'graded',
    fields: {
      type: scoreField('type'),
      category: scoreField('category'),
      component: scoreField('component'),
      description: scoreField('description'),
    },
  };
}

/** True when every field the sample scored came back `true`. */
function isStrictHit(verdict: SampleVerdict): boolean {
  return SCORED_FIELDS.every((f) => verdict.fields[f] !== false);
}

/**
 * Build the report for a full run.
 *
 * Samples and predictions are paired by id, not by position, and the two sets
 * must agree exactly. A short prediction file is an error rather than a partial
 * run, because reporting an accuracy for a run that silently skipped a third of
 * its samples is the kind of number that gets quoted without its denominator.
 */
export function buildExtractionReport(
  samples: readonly GoldenSample[],
  predictions: readonly ExtractionSamplePrediction[],
): ExtractionReport {
  if (samples.length !== predictions.length) {
    throw new Error(
      `cannot score: ${samples.length} sample(s) but ${predictions.length} prediction(s); ` +
        'every sample must have exactly one prediction',
    );
  }

  const seen = new Set<string>();
  for (const s of samples) {
    if (seen.has(s.id)) {
      // Averaging over a duplicated id would double-count one incident and
      // quietly shift every rate in the report.
      throw new Error(`duplicate sample id '${s.id}'`);
    }
    seen.add(s.id);
  }

  const byId = new Map<string, ExtractionSamplePrediction>();
  for (const p of predictions) {
    byId.set(p.sampleId, p);
  }

  const verdicts = samples.map((s) => {
    const p = byId.get(s.id);
    if (p === undefined) {
      throw new Error(`no prediction for sample '${s.id}'`);
    }
    return scoreExtractionSample(s, p);
  });

  const counts: Record<SampleState, number> = {
    unparseable: 0,
    unvalidated: 0,
    unverifiable: 0,
    graded: 0,
  };
  for (const v of verdicts) {
    counts[v.state] += 1;
  }

  const total = verdicts.length;
  const graded = verdicts.filter((v) => v.state === 'graded');

  const parse = rate(verdicts.filter((v) => v.state !== 'unparseable').length, total);
  const validation = rate(
    verdicts.filter((v) => v.state !== 'unparseable' && v.state !== 'unvalidated').length,
    total,
  );
  const gradedRate = rate(graded.length, total);

  /**
   * One entry per field, spread into the layer object by name. Built as a local
   * map and spread rather than assigned field by field so the loop is the single
   * definition of how a field rate is computed -- four hand-written copies of
   * this arithmetic is four places for the denominators to drift apart.
   */
  const fieldRates: Record<ScoredField, { graded: LayeredRate; overall: LayeredRate }> = {
    type: { graded: rate(0, 0), overall: rate(0, 0) },
    category: { graded: rate(0, 0), overall: rate(0, 0) },
    component: { graded: rate(0, 0), overall: rate(0, 0) },
    description: { graded: rate(0, 0), overall: rate(0, 0) },
  };

  for (const field of SCORED_FIELDS) {
    /**
     * `overall` counts a field as a hit only where it was scored and right. A
     * sample that never reached `graded` cannot have got the field right, and
     * that is the whole point of reporting the two denominators separately:
     * an unparseable response costs the caller the field too.
     *
     * Only `graded` is iterated, and the `fields[field] !== null` test on top of
     * it is not redundant bookkeeping -- it is the second half of the rule. A
     * graded sample that omitted an optional field the ground truth never asked
     * about carries `null` there and *must* leave that denominator, while a
     * graded sample that omitted a field the ground truth *did* ask about
     * carries `false` and must enter it. Both shapes occur in the same run.
     *
     * What is genuinely implied, and therefore not written twice, is that only a
     * graded verdict can carry a non-null field: the three ungraded states all
     * return the all-null record. A deliberate injection replaced `graded` with
     * `verdicts` here and the suite stayed green, because that implication makes
     * the two expressions equal. It is recorded rather than removed because it is
     * the reason the check can be written this way, and the next reader will look
     * for the `state === 'graded'` test and wonder where it went.
     */
    const scorable = graded.filter((v) => v.fields[field] !== null);
    const hits = scorable.filter((v) => v.fields[field] === true).length;
    fieldRates[field] = { graded: rate(hits, scorable.length), overall: rate(hits, total) };
  }

  return {
    total,
    counts,
    strict: rate(graded.filter(isStrictHit).length, graded.length),
    layers: { parse, validation, graded: gradedRate, ...fieldRates },
  };
}

/**
 * Whether a run clears the M1 exit condition.
 *
 * `null` is not a pass. `null >= 0.7` happens to be `false` in JavaScript, so
 * this would behave by accident; the explicit guard makes it behave on purpose,
 * and keeps the rule true if the comparison is ever rewritten.
 */
export function meetsM1ExitCondition(report: ExtractionReport): boolean {
  if (report.strict.rate === null) {
    return false;
  }
  return report.strict.rate >= M1_STRICT_THRESHOLD;
}

function renderRate(label: string, r: LayeredRate): string {
  const pct = r.rate === null ? 'n/a' : `${(r.rate * 100).toFixed(1)}%`;
  const tail = `${r.hits}/${r.total} (${pct})`;
  return label === '' ? tail : `${label} ${tail}`;
}

/** Render the report as plain text for a CI log or a docs paste. */
export function formatExtractionReport(report: ExtractionReport): string {
  const lines: string[] = [];
  lines.push('Fault Extraction Accuracy Report');
  lines.push(`  samples        : ${report.total}`);
  lines.push(`  unparseable    : ${report.counts.unparseable}`);
  lines.push(`  unvalidated    : ${report.counts.unvalidated}`);
  lines.push(`  unverifiable   : ${report.counts.unverifiable}`);
  lines.push(`  graded         : ${report.counts.graded}`);
  lines.push(`  ${'parsed'.padEnd(6)}: ${renderRate('', report.layers.parse)}`);
  lines.push(`  ${'validated'.padEnd(6)}: ${renderRate('', report.layers.validation)}`);
  lines.push(`  ${'graded'.padEnd(6)}: ${renderRate('', report.layers.graded)}`);
  lines.push('  ' + '-'.repeat(46));
  lines.push('  Per-field accuracy (graded = conditioned on a scoreable answer):');
  for (const field of SCORED_FIELDS) {
    const f = report.layers[field];
    lines.push(
      `    ${field.padEnd(12)}: ${renderRate('graded', f.graded)}  ${renderRate('overall', f.overall)}`,
    );
  }
  lines.push('  ' + '-'.repeat(46));
  lines.push(`  strict all-fields: ${renderRate('', report.strict)}`);
  if (report.strict.rate === null) {
    lines.push('  M1 exit condition: NOT MET (no graded sample)');
  } else {
    const pct = `${(M1_STRICT_THRESHOLD * 100).toFixed(0)}%`;
    const met = meetsM1ExitCondition(report);
    lines.push(`  M1 exit condition: ${met ? 'MET' : 'NOT MET'} (>= ${pct} strict)`);
  }
  return lines.join('\n');
}

/** Read the non-blank string at `key`, or `undefined` for anything else. */
function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/**
 * Parse a golden dataset from untrusted JSON.
 *
 * Every failure names the sample and the field, because the dataset is the
 * denominator of the whole report: a sample silently dropped here changes every
 * rate in it. An empty dataset is an error for the same reason -- a scoring run
 * over zero samples has no accuracy, and letting it proceed would produce a
 * report full of `n/a` that reads like a passing run.
 */
export function parseGoldenDataset(input: unknown): GoldenDataset {
  if (!isRecord(input)) {
    throw new Error('golden dataset is not an object');
  }

  const schema = input['schema'];
  if (schema !== FAULT_GOLDEN_SCHEMA) {
    throw new Error(
      `unsupported dataset schema '${String(schema)}'; this scorer reads '${FAULT_GOLDEN_SCHEMA}'`,
    );
  }

  const rawSamples = input['samples'];
  if (!Array.isArray(rawSamples)) {
    throw new Error("golden dataset 'samples' is not an array");
  }
  if (rawSamples.length === 0) {
    throw new Error('golden dataset contains no samples; an empty run measures nothing');
  }

  const samples: GoldenSample[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawSamples.length; i += 1) {
    const raw = rawSamples[i];
    if (!isRecord(raw)) {
      throw new Error(`sample ${i} is not an object`);
    }

    const id = optionalString(raw, 'id');
    if (id === undefined) {
      throw new Error(`sample ${i} is missing a non-blank 'id'`);
    }
    if (seen.has(id)) {
      throw new Error(`duplicate sample id '${id}'`);
    }
    seen.add(id);

    const incidentText = optionalString(raw, 'incidentText');
    if (incidentText === undefined) {
      throw new Error(`sample ${i} is missing a non-blank 'incidentText'`);
    }

    const rawExpected = raw['expected'];
    if (!isRecord(rawExpected)) {
      throw new Error(`sample '${id}' is missing an 'expected' object`);
    }
    const type = optionalString(rawExpected, 'type');
    if (type === undefined) {
      throw new Error(`sample '${id}' is missing an expected 'type'`);
    }

    // `component` and `description` are dropped when they are present but not a
    // usable string, rather than carried through as an expectation nothing can
    // ever match. A malformed value here would otherwise score as a permanent
    // miss against every prediction, which reads as a model failure.
    const category = optionalString(rawExpected, 'category');
    const component = optionalString(rawExpected, 'component');
    const description = optionalString(rawExpected, 'description');

    samples.push({
      id,
      incidentText,
      expected: {
        type,
        ...(category !== undefined ? { category } : {}),
        ...(component !== undefined ? { component } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });
  }

  return { schema: FAULT_GOLDEN_SCHEMA, samples };
}
