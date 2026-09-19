import { describe, expect, it } from 'vitest';
import {
  buildFaultExtractionPrompt,
  parseFaultExtractionResponse,
  validateExtractedFault,
} from '../src/fault/importer.js';

/**
 * Historical fault importer — prompt/parse agreement.
 *
 * `importer.test.ts` covers the parse in isolation: what it accepts, what it
 * rejects, and that a historical fault always routes through H3. This suite
 * covers the property that file cannot see, because it lives *between* two
 * functions: **the response shape the parser accepts has to be the response
 * shape the prompt asks for.**
 *
 * The defect it found: `buildFaultExtractionPrompt` advertises the category
 * vocabulary only through the field placeholder
 * `"category": "resource | network | ..."`, with no statement that the value
 * must be one of them, and nothing anywhere says the match is case- and
 * space-sensitive. The parser stored the model's string verbatim, so a model
 * answering `"NETWORK"` — a reasonable reading of a prompt that never states a
 * casing rule — parsed as `ok: true` and only failed later.
 *
 * Measured before the fix, end to end for an incident the prompt was built from:
 *   parse     -> { ok: true, extracted: { category: "NETWORK" } }
 *   validate  -> { valid: false, reasons: ["invalid fault category 'NETWORK'"] }
 *
 * So a correctly-extracted fault was rejected, and the reviewer was told the
 * *category* was wrong when it was the *casing* that was wrong.
 */

const extract = (body: Record<string, unknown>): string => JSON.stringify(body);

describe('the parser accepts the shape the prompt asks for', () => {
  it('accepts a category in the advertised vocabulary verbatim', () => {
    for (const category of ['resource', 'network', 'runtime', 'middleware', 'code', 'config', 'dependency']) {
      const result = parseFaultExtractionResponse(extract({ type: 't', category, confidence: 0.9 }));
      expect(result.ok, `category ${category}`).toBe(true);
    }
  });

  it('accepts a category whose only deviation is casing', () => {
    // Measured before the fix: `ok: true` here, then `valid: false` at validation.
    const result = parseFaultExtractionResponse(extract({ type: 't', category: 'NETWORK', confidence: 0.9 }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.extracted.category).toBe('network');
  });

  it('accepts a category whose only deviation is surrounding whitespace', () => {
    const result = parseFaultExtractionResponse(extract({ type: 't', category: ' network ', confidence: 0.9 }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.extracted.category).toBe('network');
  });

  it('still rejects a category that is genuinely outside the vocabulary', () => {
    const result = parseFaultExtractionResponse(extract({ type: 't', category: 'nonsense', confidence: 0.9 }));
    expect(result).toEqual({ ok: false, error: "invalid fault category 'nonsense'" });
  });

  it('rejects an empty or blank category rather than passing it through', () => {
    for (const category of ['', '   ']) {
      const result = parseFaultExtractionResponse(extract({ type: 't', category, confidence: 0.9 }));
      expect(result.ok, `category ${JSON.stringify(category)}`).toBe(false);
    }
  });

  it('leaves the category absent when the key is absent, so it can be inferred', () => {
    const result = parseFaultExtractionResponse(extract({ type: 'net_delay', confidence: 0.9 }));
    expect(result.ok).toBe(true);
    expect(result.ok && 'category' in result.extracted).toBe(false);
  });
});

describe('a normalised category survives the whole importer pipeline', () => {
  it('goes from ticket text to a valid spec with no loss', () => {
    // This is the assertion the defect broke: the same string that the parser
    // said it understood must still be understood by the validator.
    const text = 'Ticket 4412: the payment service lost network connectivity for 4 minutes.';
    const prompt = buildFaultExtractionPrompt(text);
    expect(prompt).toContain(text);

    const modelReply = `Here is the record:\n\`\`\`json\n${extract({
      type: 'network-partition',
      category: 'NETWORK',
      component: 'payment',
      description: 'network partition',
      confidence: 0.92,
    })}\n\`\`\``;

    const parsed = parseFaultExtractionResponse(modelReply);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');

    const validation = validateExtractedFault(parsed.extracted);
    expect(validation.valid).toBe(true);
    expect(validation.reasons).toEqual([]);
    expect(validation.hitlGate).toBe('H3');
    expect(validation.spec).toMatchObject({ type: 'network-partition', category: 'network' });
  });
});

describe('the prompt states the rule the parser enforces', () => {
  it('names the vocabulary and says the value must be one of it', () => {
    const prompt = buildFaultExtractionPrompt('incident');
    expect(prompt).toContain('resource | network | runtime | middleware | code | config | dependency');
    expect(prompt).toMatch(/one of/i);
  });

  it('says the match is case-insensitive, so a model does not have to guess', () => {
    expect(buildFaultExtractionPrompt('incident')).toMatch(/case-insensitive/i);
  });

  it('still carries the incident text verbatim', () => {
    const text = 'multi\nline\nincident with "quotes" and {braces}';
    expect(buildFaultExtractionPrompt(text)).toContain(text);
  });
});

describe('fault type normalisation reaches the spec', () => {
  it('normalises the type the same way the collector does', () => {
    const parsed = parseFaultExtractionResponse(extract({ type: 'OOM Kill', confidence: 0.9 }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    const validation = validateExtractedFault(parsed.extracted);
    expect(validation.valid).toBe(true);
    expect(validation.spec?.type).toBe('oom-kill');
  });

  it('leaves the raw type alone in the extracted record, normalising only at validation', () => {
    // The parser reports what the model said; `parseFaultSpec` is the single
    // place that decides what a fault type is. Two normalisers would be two
    // answers.
    const parsed = parseFaultExtractionResponse(extract({ type: 'OOM Kill', confidence: 0.9 }));
    expect(parsed.ok && parsed.extracted.type).toBe('OOM Kill');
  });
});
