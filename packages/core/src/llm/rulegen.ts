import type { FileLayout, FileSignalKind } from '../ingest/file.js';
import type { MetricPayload } from '../ir/types.js';

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

const IR_FIELDS: Record<FileSignalKind, readonly string[]> = {
  metric: ['timestamp', 'service', 'metricName', 'metricValue', 'metricUnit', 'semanticType'],
  log: ['timestamp', 'service', 'logBody', 'severity'],
  trace: ['timestamp', 'service', 'traceId', 'spanId', 'parentSpanId', 'spanName', 'durationMs', 'status'],
};

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
 */
export function buildRulegenPrompt(
  signalKind: FileSignalKind,
  samples: SampleRecord[],
  headers?: string[],
): string {
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
    `IR fields for signal kind '${signalKind}': ${IR_FIELDS[signalKind].join(', ')}`,
  );
  return lines.join('\n');
}

/**
 * Parse an LLM text response into a validated `GeneratedLayout`.
 *
 * The response may be bare JSON, JSON inside a markdown code fence, or JSON
 * embedded in surrounding prose - the first `{` and last `}` are treated as the
 * object bounds.
 */
export function parseRulegenResponse(text: string): RulegenParseResult {
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

  const layoutFields: FileLayout = {};
  for (const [key, value] of Object.entries(layout as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      return { ok: false, error: `layout field '${key}' must be a string column name` };
    }
    if (key === 'semanticType') {
      // `semanticType` is a semantic-class enum, not a source column.
      layoutFields.semanticType = value as MetricPayload['semanticType'];
    } else {
      (layoutFields as Record<string, string>)[key] = value;
    }
  }

  const confidence = obj['confidence'];
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, error: "'confidence' must be a number between 0 and 1" };
  }

  const rationale = typeof obj['rationale'] === 'string' ? obj['rationale'] : '';
  return { ok: true, generated: { layout: layoutFields, confidence, rationale } };
}

/**
 * Validate a generated layout by replaying it against the source samples.
 *
 * A layout is valid when every required field maps to a column that is present
 * and non-empty in every sample. This is the deterministic guard that rejects a
 * hallucinated column name before it ever reaches the full dataset.
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
  return { valid: reasons.length === 0, reasons };
}
