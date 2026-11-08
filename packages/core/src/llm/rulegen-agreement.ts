import { detectFileLayout, type FileLayout, type FileSignalKind } from '../ingest/file.js';
import { parseRulegenResponseChecked, validateGeneratedLayout, type SampleRecord } from './rulegen.js';

/**
 * What the two layout channels do with the same header row, read against a fixed answer set.
 *
 * ## The two channels, and which one has a caller
 *
 * `ingest/prime.ts` infers a layout from the header row through `detectFileLayout`'s alias table,
 * and that is the path every ingested file takes. `llm/rulegen.ts` asks a model for the same
 * mapping, parses the answer and validates it -- and nothing in this repository calls it: the
 * channel exists as a library and not as a path. So the two readings this module produces are not
 * the same claim. The deterministic one measures what ships. The model-side one measures a guard
 * over answers that are written by hand here, because no model is called.
 *
 * ## Why the answer set is hand-written rather than captured
 *
 * A captured run moves with the model, the key and the day. The question this reading exists for is
 * whether the *validator* refuses the shapes a model gets wrong -- a misspelled field name, a column
 * the header row does not have, a required field left out, an enum value outside its vocabulary --
 * and that question is decidable from an authored answer. It is a weaker claim than an accuracy
 * over real model output, and it is not reported as one.
 *
 * ## Kappa does not exist here, and the absence is a decision
 *
 * Cohen's kappa needs two independent annotators. This file has one: the same author wrote the
 * header rows, the specified layouts and the candidate answers. So the figure below is agreement
 * with a *specified answer*, which is a different and weaker claim than agreement between
 * annotators, and every sentence that reports it says so.
 *
 * ## The class the validator cannot see
 *
 * `validateGeneratedLayout` replays a layout against the samples: a field is refused when its
 * column is absent or empty. That is a *structural* check, so a mapping to a real, populated column
 * that means the wrong thing passes it -- `metricValue` pointed at a limit rather than at the usage.
 * The reading counts those separately (`misreads`) instead of folding them into an agreement rate,
 * because a validator being right about its own contract and a channel being right about the data
 * are two claims and one number cannot carry both.
 */

export const RULEGEN_LAYOUT_SCHEMA = 'rca-bench-rulegen-layouts/1';

/** Why the answer set says a case is what it is. Prose, and not machine-checked. */
export interface RulegenLayoutProvenance {
  note: string;
  reviewGate: string;
  authoringRule: string;
  candidateRule: string;
  annotationRule: string;
  measuredAt: string;
}

export interface RulegenLayoutCase {
  id: string;
  signalKind: FileSignalKind;
  headers: string[];
  samples: SampleRecord[];
  /** The layout a careful human reader produces from this header row. */
  expectedLayout: FileLayout;
  /** The whole response text a model returned, in the shape `parseRulegenResponseChecked` reads. */
  candidate: string;
  expectedVerdict: 'accepted' | 'refused';
  /** A substring of the refusal the answer set expects, when it expects one. */
  expectedReason?: string;
  why: string;
}

export interface RulegenLayoutGolden {
  schema: string;
  provenance: RulegenLayoutProvenance;
  cases: RulegenLayoutCase[];
}

/** One case's two verdicts, kept apart: the alias table's answer and the validator's verdict. */
export interface RulegenCaseReading {
  id: string;
  /** The layout the alias table produced, for a reader comparing it with the specified one. */
  detected: FileLayout;
  deterministicAgrees: boolean;
  verdict: 'accepted' | 'refused';
  verdictAgrees: boolean;
  reason: string | null;
  /** `null` when the answer set named no reason, which is every accepted case. */
  reasonAgrees: boolean | null;
  /** Fields this case's answer maps to a column other than the specified one, when it was accepted. */
  misread: string[];
}

export interface RulegenAgreementReading {
  total: number;
  cases: RulegenCaseReading[];
  /** Whether the alias table reproduced the specified layout, field for field. */
  deterministic: { agreements: number; disagreements: string[] };
  /** Whether the validator's verdict is the verdict the answer set specifies. */
  verdicts: { agreements: number; disagreements: string[] };
  accepted: number;
  refused: number;
  /** Cases whose answer set names a reason, and how many were refused for that reason. */
  reasons: { checked: number; agreements: number };
  /** Accepted answers that map a field to the wrong column: the class the replay cannot refuse. */
  misreads: Array<{ id: string; fields: string[] }>;
}

/**
 * Read the answer set, refusing a file that cannot be answered from.
 *
 * The checks are the ones a reader would make: every case names a signal kind the contract knows,
 * the ids are unique (a duplicate id would silently drop a case from the rate), an accepted case
 * names no reason and a refused one may, and the expected layout is a subset of that kind's fields.
 * A dataset that is not asked these questions produces a rate with a denominator nobody can see.
 */
export function parseRulegenLayoutGolden(input: unknown): RulegenLayoutGolden {
  // A function declaration rather than an arrow bound to a const: TypeScript only narrows a `never`
  // return through a declaration, and the narrowing is the point -- every check below is a sentence
  // and a refusal, with no `else` branch to forget.
  function fail(why: string): never {
    throw new Error(`rulegen layout golden: ${why}`);
  }
  if (typeof input !== 'object' || input === null) fail('the file is not an object');
  const raw = input as Record<string, unknown>;
  if (raw['schema'] !== RULEGEN_LAYOUT_SCHEMA) {
    fail(`schema is '${String(raw['schema'])}', expected '${RULEGEN_LAYOUT_SCHEMA}'`);
  }
  const provenance = raw['provenance'];
  if (typeof provenance !== 'object' || provenance === null) fail('the provenance block is missing');
  const cases = raw['cases'];
  if (!Array.isArray(cases) || cases.length === 0) fail('the cases array is missing or empty');

  const seen = new Set<string>();
  const parsed: RulegenLayoutCase[] = [];
  for (const [index, entry] of cases.entries()) {
    if (typeof entry !== 'object' || entry === null) fail(`case ${String(index)} is not an object`);
    const c = entry as Record<string, unknown>;
    const id = c['id'];
    if (typeof id !== 'string' || id === '') fail(`case ${String(index)} has no id`);
    if (seen.has(id)) fail(`'${id}' appears twice, so a rate over these cases would drop one`);
    seen.add(id);
    const signalKind = c['signalKind'];
    if (signalKind !== 'metric' && signalKind !== 'log' && signalKind !== 'trace') {
      fail(`'${id}' names signal kind '${String(signalKind)}', which is not one of metric, log, trace`);
    }
    const headers = c['headers'];
    if (!Array.isArray(headers) || headers.length === 0 || headers.some((h) => typeof h !== 'string')) {
      fail(`'${id}' has no header row, so neither channel has anything to map`);
    }
    const samples = c['samples'];
    if (!Array.isArray(samples) || samples.length === 0) {
      fail(`'${id}' carries no sample, so a layout cannot be replayed against it`);
    }
    const expectedLayout = c['expectedLayout'];
    if (typeof expectedLayout !== 'object' || expectedLayout === null || Array.isArray(expectedLayout)) {
      fail(`'${id}' has no expected layout`);
    }
    for (const column of Object.values(expectedLayout as Record<string, unknown>)) {
      if (!(headers as string[]).includes(String(column))) {
        fail(`'${id}' expects a field mapped to '${String(column)}', which the header row does not carry`);
      }
    }
    if (typeof c['candidate'] !== 'string' || c['candidate'] === '') {
      fail(`'${id}' carries no candidate answer`);
    }
    const expectedVerdict = c['expectedVerdict'];
    if (expectedVerdict !== 'accepted' && expectedVerdict !== 'refused') {
      fail(`'${id}' expects verdict '${String(expectedVerdict)}', which is neither accepted nor refused`);
    }
    if (expectedVerdict === 'accepted' && c['expectedReason'] !== undefined) {
      fail(`'${id}' is expected to be accepted and names a refusal reason as well`);
    }
    if (typeof c['why'] !== 'string' || c['why'] === '') fail(`'${id}' does not say why it is a case`);
    parsed.push({
      id,
      signalKind,
      headers: headers as string[],
      samples: samples as SampleRecord[],
      expectedLayout: expectedLayout as FileLayout,
      candidate: c['candidate'],
      expectedVerdict,
      ...(c['expectedReason'] === undefined ? {} : { expectedReason: String(c['expectedReason']) }),
      why: c['why'],
    });
  }

  return {
    schema: RULEGEN_LAYOUT_SCHEMA,
    provenance: provenance as unknown as RulegenLayoutProvenance,
    cases: parsed,
  };
}

/** Whether every field the answer set specifies is mapped to the column it specifies. */
function contradictsSpecified(specified: FileLayout, read: FileLayout): string[] {
  const fields: string[] = [];
  for (const [field, column] of Object.entries(specified)) {
    if (read[field as keyof FileLayout] !== column) fields.push(field);
  }
  return fields;
}

/**
 * Run both channels over the answer set.
 *
 * The validator is called exactly as a caller would call it -- parse the response, then replay the
 * layout against the samples -- so this reading cannot be greener than the channel it describes.
 */
export function readRulegenAgreement(golden: RulegenLayoutGolden): RulegenAgreementReading {
  const cases: RulegenCaseReading[] = [];
  for (const one of golden.cases) {
    const detected = detectFileLayout(one.headers, one.signalKind);
    const parsed = parseRulegenResponseChecked(one.signalKind, one.candidate);
    let verdict: 'accepted' | 'refused' = 'accepted';
    let reason: string | null = null;
    let layout: FileLayout = {};
    if (!parsed.ok) {
      verdict = 'refused';
      reason = parsed.error;
    } else {
      const validation = validateGeneratedLayout(parsed.generated.layout, one.signalKind, one.samples);
      layout = parsed.generated.layout;
      if (!validation.valid) {
        verdict = 'refused';
        reason = validation.reasons.join('; ');
      }
    }
    const misread = verdict === 'accepted' ? contradictsSpecified(one.expectedLayout, layout) : [];
    cases.push({
      id: one.id,
      detected,
      // `contradictsSpecified` covers both ways the alias table can miss: a field mapped elsewhere
      // and a field not mapped at all, because an absent field reads as `undefined` against the
      // specified column. A field mapped *beyond* the specification (a `semanticType`, a
      // `parentSpanId`) is not a contradiction and does not count against it.
      deterministicAgrees: contradictsSpecified(one.expectedLayout, detected).length === 0,
      verdict,
      verdictAgrees: verdict === one.expectedVerdict,
      reason,
      reasonAgrees: one.expectedReason === undefined
        ? null
        : (reason ?? '').includes(one.expectedReason),
      misread,
    });
  }

  const namedReasons = golden.cases.filter((c) => c.expectedReason !== undefined);
  return {
    total: cases.length,
    cases,
    deterministic: {
      agreements: cases.filter((c) => c.deterministicAgrees).length,
      disagreements: cases.filter((c) => !c.deterministicAgrees).map((c) => c.id),
    },
    verdicts: {
      agreements: cases.filter((c) => c.verdictAgrees).length,
      disagreements: cases.filter((c) => !c.verdictAgrees).map((c) => c.id),
    },
    accepted: cases.filter((c) => c.verdict === 'accepted').length,
    refused: cases.filter((c) => c.verdict === 'refused').length,
    reasons: {
      checked: namedReasons.length,
      agreements: cases.filter((c) => c.reasonAgrees === true).length,
    },
    misreads: cases.filter((c) => c.misread.length > 0).map((c) => ({ id: c.id, fields: c.misread })),
  };
}

/**
 * One sentence: what each channel did, what the validator refused, and what it cannot refuse.
 *
 * The kappa sentence is not decoration. A rate reported without it reads as inter-annotator
 * agreement, and this answer set has one author -- so the sentence that says what the number is not
 * is the difference between a weaker claim stated and a stronger one implied.
 */
export function describeRulegenAgreement(reading: RulegenAgreementReading): string {
  const { total, deterministic, verdicts, accepted, refused, reasons, misreads } = reading;
  const parts: string[] = [
    `rulegen layouts: ${total} case(s); the alias table reproduces ${deterministic.agreements} of ${total} `
      + 'specified layout(s)'
      + (deterministic.disagreements.length === 0 ? '' : ` (it differs on ${deterministic.disagreements.join(', ')})`),
    `; the model-side validator agrees on ${verdicts.agreements} of ${total} verdict(s), `
      + `accepting ${accepted} and refusing ${refused}`
      + (reasons.checked === 0 ? '' : `, ${reasons.agreements} of ${reasons.checked} for the reason the answer set names`),
  ];
  parts.push(
    misreads.length === 0
      ? '; no accepted answer maps a field to another real column'
      : `; ${misreads.length} accepted answer(s) map a field to another column that exists `
        + `(${misreads.map((m) => `${m.id}: ${m.fields.join(', ')}`).join('; ')}), `
        + 'which the replay cannot refuse',
  );
  parts.push(
    '; one author wrote the cases and the answers, so there is no kappa here: '
      + 'this is agreement with a specified answer, which is a weaker claim',
  );
  return parts.join('');
}
