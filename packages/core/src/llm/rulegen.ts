import type { FileLayout, FileSignalKind } from '../ingest/file.js';
import { METRIC_SEMANTIC_TYPES, isVocabularyMember } from '../ir/types.js';

/**
 * LLM rule-generation core.
 *
 * The LLM proposes a field mapping from *samples* of a data source; the
 * deterministic engine then executes that mapping over the full dataset and the
 * gates verify it. This module contains the deterministic skeleton around the
 * LLM call - prompt building, response parsing and rule validation - so the
 * LLM is invoked O(data sources), never O(records).
 */

export type SampleRecord = Record<string, unknown>;

export interface GeneratedLayout {
  layout: FileLayout;
  confidence: number;
  rationale: string;
}

export type RulegenParseResult = { ok: true; generated: GeneratedLayout } | { ok: false; error: string };

export interface LayoutValidation {
  valid: boolean;
  reasons: string[];
}

const REQUIRED_FIELDS: Record<FileSignalKind, readonly (keyof FileLayout)[]> = {
  metric: ['timestamp', 'metricName', 'metricValue'],
  log: ['timestamp', 'logBody'],
  trace: ['timestamp', 'traceId', 'spanId', 'spanName', 'durationMs'],
};

const IR_FIELDS: Record<FileSignalKind, readonly (keyof FileLayout)[]> = {
  metric: ['timestamp', 'service', 'metricName', 'metricValue', 'metricUnit', 'semanticType'],
  log: ['timestamp', 'service', 'logBody', 'severity'],
  trace: ['timestamp', 'service', 'traceId', 'spanId', 'parentSpanId', 'spanName', 'durationMs', 'status'],
};

/**
 * The IR fields a layout may map, for one signal kind.
 *
 * Exported so a caller can build the same contract the parser enforces rather
 * than restating it, which is how the two drifted apart in the first place.
 */
export function rulegenLayoutFields(signalKind: FileSignalKind): readonly string[] {
  return IR_FIELDS[signalKind];
}

function asText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : s;
}

/**
 * Build the prompt asking an LLM to map non-standard columns to IR fields.
 *
 * The prompt carries only the source samples and (when known) the column names,
 * never the full dataset - so the LLM cost scales with the number of sources.
 *
 * The field list is stated as a **closed** one. It used to be printed as a bare
 * enumeration with no statement that it was exhaustive, and nothing rejected a
 * field outside it, so a model that answered `timstamp` was neither corrected
 * nor told: the typo travelled all the way to the layout parser, which dropped
 * the unknown key, and the resulting layout then failed validation for a
 * *missing* field -- a diagnosis pointing at the answer rather than at the typo.
 */
export function buildRulegenPrompt(
  signalKind: FileSignalKind,
  samples: SampleRecord[],
  headers?: string[],
): string {
  const fields = IR_FIELDS[signalKind];
  const lines: string[] = [
    'You are mapping non-standard telemetry columns to a canonical IR field contract.',
    '',
    `Signal kind: ${signalKind}`,
  ];
  if (headers !== undefined && headers.length > 0) {
    lines.push(`Known columns: ${headers.join(', ')}`);
  }
  lines.push(
    '',
    'Sample records (infer the column semantics from these):',
    JSON.stringify(samples, null, 2),
    '',
    'Respond with JSON only, in this shape:',
    '{ "layout": { "<irField>": "<sourceColumn>", ... }, "confidence": 0.0..1.0, "rationale": "..." }',
    '',
    `IR fields for signal kind '${signalKind}' - one of: ${fields.join(', ')}`,
    'Every key of `layout` must be one of those names; an unknown or misspelled field is rejected.',
  );
  if (fields.includes('semanticType')) {
    lines.push(
      '`semanticType` is not a source column: it is one of: '
      + `${METRIC_SEMANTIC_TYPES.join(', ')}.`,
    );
  }
  return lines.join('\n');
}

/**
 * Convert a parsed `layout` object into a typed `FileLayout`, rejecting any key
 * that is not part of this signal kind's contract.
 *
 * Dropping an unknown key silently is the defect this function exists to
 * prevent: a hallucinated field name produces a layout that is missing the field
 * the model meant to write, and every downstream message then reports the
 * missing field rather than the rejected name.
 */
function readLayoutFields(
  signalKind: FileSignalKind,
  layout: Record<string, unknown>,
): { ok: true; fields: FileLayout } | { ok: false; error: string } {
  const allowed = IR_FIELDS[signalKind];
  const fields: FileLayout = {};
  for (const [key, value] of Object.entries(layout)) {
    if (!allowed.includes(key as keyof FileLayout)) {
      return {
        ok: false,
        error: `layout field '${key}' is not an IR field for signal kind '${signalKind}' `
          + `(expected one of: ${allowed.join(', ')})`,
      };
    }
    if (typeof value !== 'string') {
      return { ok: false, error: `layout field '${key}' must be a string column name` };
    }
    if (key === 'semanticType') {
      // `semanticType` is a semantic-class enum, not a source column -- and a
      // value outside the enum is rejected here, by name, rather than being
      // carried into the IR where the schema rejects the whole signal and the
      // reason names the payload instead of the field.
      if (!isVocabularyMember(METRIC_SEMANTIC_TYPES, value)) {
        return {
          ok: false,
          error: `layout field 'semanticType' must be one of: ${METRIC_SEMANTIC_TYPES.join(', ')} `
            + `(got '${value}')`,
        };
      }
      fields.semanticType = value;
    } else {
      (fields as Record<string, string>)[key] = value;
    }
  }
  return { ok: true, fields };
}

/**
 * Parse an LLM response for a known signal kind, enforcing that kind's contract.
 *
 * Callers that know which signal they asked about should use this rather than
 * `parseRulegenResponse`: the contract is the thing that was described in the
 * prompt, so the parser that does not check it is checking less than the prompt
 * promised.
 */
export function parseRulegenResponseChecked(
  signalKind: FileSignalKind,
  text: string,
): RulegenParseResult {
  const parsed = parseRulegenResponseShape(text);
  if (!parsed.ok) return parsed;
  const fields = readLayoutFields(signalKind, parsed.layout);
  if (!fields.ok) return { ok: false, error: fields.error };
  return { ok: true, generated: { layout: fields.fields, confidence: parsed.confidence, rationale: parsed.rationale } };
}

/**
 * Parse an LLM text response into a `GeneratedLayout`, without a signal-kind
 * contract.
 *
 * Use `parseRulegenResponseChecked` when the signal kind is known. This entry
 * point exists for callers that genuinely cannot know it, and it therefore
 * cannot reject an unknown field name: it has no field set to reject it against.
 */
export function parseRulegenResponse(text: string): RulegenParseResult {
  const parsed = parseRulegenResponseShape(text);
  if (!parsed.ok) return parsed;

  const fields: FileLayout = {};
  for (const [key, value] of Object.entries(parsed.layout)) {
    if (typeof value !== 'string') {
      return { ok: false, error: `layout field '${key}' must be a string column name` };
    }
    if (key === 'semanticType') {
      if (!isVocabularyMember(METRIC_SEMANTIC_TYPES, value)) {
        return {
          ok: false,
          error: `layout field 'semanticType' must be one of: ${METRIC_SEMANTIC_TYPES.join(', ')} `
            + `(got '${value}')`,
        };
      }
      fields.semanticType = value;
    } else {
      (fields as Record<string, string>)[key] = value;
    }
  }

  return { ok: true, generated: { layout: fields, confidence: parsed.confidence, rationale: parsed.rationale } };
}

/**
 * Extract the JSON object, the layout map, the confidence and the rationale.
 *
 * Shared by both parsers so the shape rules -- JSON extraction, `confidence`
 * range, rationale defaulting -- are stated once and cannot drift between the
 * contract-checking and contract-free entry points.
 */
function parseRulegenResponseShape(
  text: string,
): ({ ok: true; layout: Record<string, unknown>; confidence: number; rationale: string })
  | { ok: false; error: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: 'response contains no JSON object' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, error: 'response JSON is malformed' };
  }

  // The extracted slice starts at `{`, so a successful parse is always a
  // JSON object; the cast is safe and avoids an unreachable type-check branch.
  const obj = parsed as Record<string, unknown>;

  const layout = obj['layout'];
  if (typeof layout !== 'object' || layout === null || Array.isArray(layout)) {
    return { ok: false, error: "response is missing a 'layout' object" };
  }

  const confidence = obj['confidence'];
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, error: "'confidence' must be a number between 0 and 1" };
  }

  const rationale = typeof obj['rationale'] === 'string' ? obj['rationale'] : '';
  return { ok: true, layout: layout as Record<string, unknown>, confidence, rationale };
}

/**
 * Validate a generated layout by replaying it against the source samples.
 *
 * A layout is valid when every required field maps to a column that is present
 * and non-empty in every sample. This is the deterministic guard that rejects a
 * hallucinated column name before it ever reaches the full dataset.
 *
 * An empty sample set is a validation **failure**, not a pass. The replay is the
 * whole check: with nothing to replay, a signature that says `valid: true`
 * reports success for having had no input, which is the one result a guard must
 * never produce. It was reachable in practice -- a source whose sample window
 * contained only blank rows yields no samples -- and it read as a layout that
 * had been verified.
 */
export function validateGeneratedLayout(
  layout: FileLayout,
  signalKind: FileSignalKind,
  samples: SampleRecord[],
): LayoutValidation {
  const reasons: string[] = [];
  for (const field of REQUIRED_FIELDS[signalKind]) {
    const column = layout[field];
    if (column === undefined || column === '') {
      reasons.push(`missing required field '${field}'`);
      continue;
    }
    for (const sample of samples) {
      if (asText(sample[column]) === undefined) {
        reasons.push(`field '${field}' maps to column '${column}' which is missing or empty in a sample`);
        break;
      }
    }
  }
  // Reported after the structural reasons so a caller fixing a layout is told
  // about the layout first, and only then about the missing evidence.
  if (samples.length === 0) {
    reasons.push('no samples were provided, so the layout could not be replayed');
  }
  return { valid: reasons.length === 0, reasons };
}
