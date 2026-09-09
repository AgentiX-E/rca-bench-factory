import { describe, expect, it } from 'vitest';
import {
  buildFaultExtractionPrompt,
  parseFaultExtractionResponse,
  validateExtractedFault,
} from '../src/fault/importer.js';
import type { ExtractedFault } from '../src/fault/importer.js';

/**
 * Historical fault importer tests.
 *
 * The importer is the deterministic skeleton around an LLM call: prompt building,
 * response parsing and spec validation. The suite asserts the parse tolerates the
 * usual LLM wrappers, rejects malformed input, and always routes a historical
 * fault through H3 (never auto-admits). No mocks - every fixture is a real string
 * or object.
 */

describe('buildFaultExtractionPrompt', () => {
  it('carries the incident text and the JSON contract', () => {
    const prompt = buildFaultExtractionPrompt('order service OOM at 03:00');
    expect(prompt).toContain('order service OOM at 03:00');
    expect(prompt).toContain('"type"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('resource | network | runtime | middleware | code | config | dependency');
  });
});

describe('parseFaultExtractionResponse', () => {
  it('parses a bare JSON object', () => {
    const result = parseFaultExtractionResponse('{"type":"oom-kill","category":"resource","confidence":0.9}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extracted).toMatchObject({ type: 'oom-kill', category: 'resource', confidence: 0.9 });
  });

  it('parses JSON inside a markdown code fence', () => {
    const result = parseFaultExtractionResponse('```json\n{"type":"oom-kill","confidence":0.9}\n```');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extracted.type).toBe('oom-kill');
  });

  it('parses JSON embedded in surrounding prose', () => {
    const result = parseFaultExtractionResponse('The fault is {"type":"cpu-saturation","confidence":0.85} based on the ticket.');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extracted.type).toBe('cpu-saturation');
  });

  it('omits optional fields when absent', () => {
    const result = parseFaultExtractionResponse('{"type":"oom-kill","confidence":0.9}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extracted.category).toBeUndefined();
      expect(result.extracted.component).toBeUndefined();
      expect(result.extracted.description).toBeUndefined();
    }
  });

  it('keeps optional component and description when present', () => {
    const result = parseFaultExtractionResponse('{"type":"oom-kill","component":"order","description":"OOM kill on order","confidence":0.9}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extracted.component).toBe('order');
      expect(result.extracted.description).toBe('OOM kill on order');
    }
  });

  it('rejects a response with no JSON object', () => {
    expect(parseFaultExtractionResponse('no json here')).toEqual({ ok: false, error: 'response contains no JSON object' });
  });

  it('rejects malformed JSON', () => {
    expect(parseFaultExtractionResponse('{"type": }')).toEqual({ ok: false, error: 'response JSON is malformed' });
  });

  it('rejects a missing type', () => {
    expect(parseFaultExtractionResponse('{"confidence":0.9}')).toEqual({ ok: false, error: "response is missing a non-blank 'type'" });
  });

  it('rejects a blank type', () => {
    expect(parseFaultExtractionResponse('{"type":"   ","confidence":0.9}')).toEqual({ ok: false, error: "response is missing a non-blank 'type'" });
  });

  it.each(['category', 'component', 'description'] as const)('rejects a non-string %s', (field) => {
    const result = parseFaultExtractionResponse(`{"type":"x","${field}":42,"confidence":0.9}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(field);
  });

  it.each([
    ['missing', '{}'],
    ['non-number', '{"type":"x","confidence":"high"}'],
    ['out of range high', '{"type":"x","confidence":1.5}'],
    ['out of range low', '{"type":"x","confidence":-0.1}'],
  ] as const)('rejects an invalid confidence (%s)', (_label, json) => {
    expect(parseFaultExtractionResponse(json).ok).toBe(false);
  });
});

describe('validateExtractedFault', () => {
  const extracted = (overrides: Partial<ExtractedFault> = {}): ExtractedFault => ({
    type: 'oom-kill',
    category: 'resource',
    confidence: 0.9,
    ...overrides,
  });

  it('produces a valid spec and routes through H3', () => {
    const result = validateExtractedFault(extracted());
    expect(result.valid).toBe(true);
    expect(result.hitlGate).toBe('H3');
    expect(result.spec).toMatchObject({ type: 'oom-kill', category: 'resource', injectionMethod: 'historical' });
  });

  it('flags a low-confidence extraction for review without invalidating it', () => {
    const result = validateExtractedFault(extracted({ confidence: 0.4 }));
    expect(result.valid).toBe(true);
    expect(result.reasons.some((r) => r.includes('below the 0.8'))).toBe(true);
  });

  it('infers the category when absent', () => {
    const result = validateExtractedFault(extracted({ category: undefined }));
    expect(result.valid).toBe(true);
    expect(result.spec?.category).toBe('resource');
  });

  it('rejects a blank type', () => {
    const result = validateExtractedFault(extracted({ type: '   ' }));
    expect(result.valid).toBe(false);
    expect(result.spec).toBeUndefined();
  });

  it('rejects an invalid category', () => {
    const result = validateExtractedFault(extracted({ category: 'bogus' }));
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('category'))).toBe(true);
  });
});
