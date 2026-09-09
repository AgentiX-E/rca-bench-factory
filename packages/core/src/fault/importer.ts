import type { HitlGate } from '../evolution/hitl.js';
import { parseFaultSpec, type FaultSpec } from './collector.js';

/**
 * Historical fault importer (M13 channel B).
 *
 * The factory must also ingest faults that were never injected on purpose: a
 * support ticket or post-mortem describes a fault that already happened, and the
 * LLM proposes a structured fault spec from that text. The deterministic side of
 * the pipeline is pure: prompt building, response parsing and spec validation.
 *
 * The red line is the HITL checkpoint: a historical fault's ground truth was not
 * produced under controlled injection, so it MUST be human-confirmed at H3 before
 * it can enter the gates. The importer therefore always returns `hitlGate = H3`,
 * never auto-admits.
 */

/** A fault extracted from an incident text by the LLM. */
export interface ExtractedFault {
  type: string;
  /** Optional; when absent the category is inferred from the type. */
  category?: string;
  /** Optional faulty component. */
  component?: string;
  /** Optional root-cause reason. */
  description?: string;
  confidence: number;
}

export type FaultExtractionParseResult = { ok: true; extracted: ExtractedFault } | { ok: false; error: string };

export interface FaultExtractionValidation {
  valid: boolean;
  /** Always H3: historical fault ground truth must be human-confirmed. */
  hitlGate: HitlGate;
  reasons: string[];
  /** Present only when `valid`. */
  spec?: FaultSpec;
}

const FAULT_CATEGORY_VOCABULARY =
  'resource | network | runtime | middleware | code | config | dependency';

/** Confidence below this threshold is flagged for extra reviewer scrutiny. */
const HITL_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Build the prompt asking an LLM to extract a fault spec from a support ticket or
 * post-mortem. Only the incident text is carried - never the whole dataset.
 */
export function buildFaultExtractionPrompt(incidentText: string): string {
  return [
    'You are extracting a structured fault record from a support ticket or post-mortem.',
    '',
    'Incident text:',
    incidentText,
    '',
    'Respond with JSON only, in this shape:',
    `{ "type": "fault type (short)", "category": "${FAULT_CATEGORY_VOCABULARY}", "component": "faulty component", "description": "root-cause reason", "confidence": 0.0..1.0 }`,
    '',
    '`category`, `component` and `description` may be omitted when uncertain.',
  ].join('\n');
}

/**
 * Parse an LLM text response into a validated `ExtractedFault`.
 *
 * The response may be bare JSON, JSON inside a markdown code fence, or JSON
 * embedded in surrounding prose - the first `{` and last `}` bound the object.
 */
export function parseFaultExtractionResponse(text: string): FaultExtractionParseResult {
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

  // The extracted slice starts at `{`, so a successful parse is always a JSON
  // object; the cast is safe and avoids an unreachable type-check branch.
  const obj = parsed as Record<string, unknown>;

  const type = obj['type'];
  if (typeof type !== 'string' || type.trim() === '') {
    return { ok: false, error: "response is missing a non-blank 'type'" };
  }

  const category = obj['category'];
  if (category !== undefined && typeof category !== 'string') {
    return { ok: false, error: "'category' must be a string" };
  }

  const component = obj['component'];
  if (component !== undefined && typeof component !== 'string') {
    return { ok: false, error: "'component' must be a string" };
  }

  const description = obj['description'];
  if (description !== undefined && typeof description !== 'string') {
    return { ok: false, error: "'description' must be a string" };
  }

  const confidence = obj['confidence'];
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, error: "'confidence' must be a number between 0 and 1" };
  }

  return {
    ok: true,
    extracted: {
      type,
      ...(category !== undefined ? { category } : {}),
      ...(component !== undefined ? { component } : {}),
      ...(description !== undefined ? { description } : {}),
      confidence,
    },
  };
}

/**
 * Validate an extracted fault into a `FaultSpec`, reusing `parseFaultSpec` for the
 * structural rules (non-blank type, valid category, optional object parameters).
 *
 * A low confidence never invalidates the spec - it only adds a reason so the H3
 * reviewer knows to scrutinise it. `hitlGate` is always H3: historical ground
 * truth was not produced under controlled injection and must be human-confirmed.
 */
export function validateExtractedFault(extracted: ExtractedFault): FaultExtractionValidation {
  const reasons: string[] = [];

  const parsed = parseFaultSpec(
    { type: extracted.type, ...(extracted.category !== undefined ? { category: extracted.category } : {}) },
    'historical',
  );
  if (!parsed.ok) {
    reasons.push(parsed.error);
  }

  if (extracted.confidence < HITL_CONFIDENCE_THRESHOLD) {
    reasons.push(
      `confidence ${extracted.confidence} is below the ${HITL_CONFIDENCE_THRESHOLD} auto-approve threshold`,
    );
  }

  return {
    valid: parsed.ok,
    hitlGate: 'H3',
    reasons,
    ...(parsed.ok ? { spec: parsed.spec } : {}),
  };
}
