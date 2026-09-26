import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFaultExtractionPrompt } from '../src/fault/importer.js';
import { parseFaultExtractionResponse } from '../src/fault/importer.js';
import { normalizeFaultType } from '../src/fault/collector.js';

/**
 * The `type` field's prompt contract.
 *
 * Finding 62: `type` scored 5/19 (26.3%) while `category` scored 11/19 (57.9%) in
 * the same run, on the same texts, with the same model. The only thing that
 * differs between the two fields in the prompt is that `category` is given a
 * closed vocabulary and `type` is given the words "fault type (short)".
 *
 * The asymmetry is measurable, not a matter of taste. Every expected `type` in
 * the golden dataset is a lower-case hyphenated slug, none of the 19 appears
 * verbatim in its incident text, and all 19 are distinct up to 35 characters.
 * So the prompt was asking for a value from a space whose shape it never
 * described.
 *
 * These tests pin the *shape* rule rather than the 19 labels. Stating the labels
 * would fit the prompt to the test set; stating the grammar is what generalises,
 * and it is the fix finding 62 argues for. The distinction matters because it is
 * the difference between a prompt that describes the answer format and one that
 * has memorised the answer key.
 *
 * The dataset-backed tests read the real golden file rather than a fixture, so
 * that editing the dataset cannot silently invalidate the property being
 * asserted. A hand-written fixture here would prove only that the fixture obeys
 * the rule.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GOLDEN = resolve(REPO_ROOT, 'golden-master/fault-extraction/samples.json');

interface GoldenSample {
  id: string;
  incidentText: string;
  expected: { type: string; category: string; component: string };
}

interface GoldenDataset {
  samples: GoldenSample[];
}

function goldenSamples(): GoldenSample[] {
  const parsed = JSON.parse(readFileSync(GOLDEN, 'utf8')) as GoldenDataset;
  expect(parsed.samples.length).toBeGreaterThan(0);
  return parsed.samples;
}

describe('the type field states its shape', () => {
  it('says the value is a lower-case hyphenated slug', () => {
    const prompt = buildFaultExtractionPrompt('irrelevant incident text');
    // The rule, not an example. A prompt that showed `"cpu-saturation"` as a
    // sample value would teach the format too, but this asserts the statement of
    // the rule because that is what holds for the other 18 labels.
    expect(prompt).toMatch(/lower-?case/i);
    expect(prompt).toMatch(/hyphen/i);
  });

  it('distinguishes the stated shape of type from the closed vocabulary of category', () => {
    const prompt = buildFaultExtractionPrompt('irrelevant incident text');
    // category is closed and the prompt says so. type is open but shaped, and
    // the prompt has to say that too -- the failure in finding 62 was that only
    // one of the two fields was described.
    expect(prompt).toContain('resource | network | runtime | middleware | code | config | dependency');
    expect(prompt).toMatch(/hyphen/i);
  });
});

describe('the golden type labels obey the shape the prompt now states', () => {
  it('every expected type is already a lower-case hyphenated slug', () => {
    // This is the property that makes the prompt rule safe to state: it is a
    // description of the existing data, not a new requirement imposed on it. If
    // a future dataset edit introduces `CPU Saturation` or `cpuSaturation`, the
    // prompt would be lying and this test says so.
    for (const sample of goldenSamples()) {
      const type = sample.expected.type;
      expect(type, `${sample.id}: expected type is not lower-case`).toBe(type.toLowerCase());
      expect(type, `${sample.id}: expected type contains a character outside [a-z0-9-]`).toMatch(/^[a-z0-9-]+$/);
      expect(type, `${sample.id}: expected type has a leading or trailing hyphen`).not.toMatch(/^-|-$/);
      expect(type, `${sample.id}: expected type has consecutive hyphens`).not.toMatch(/--/);
    }
  });

  it('normalising an expected type is a no-op, so the shape rule and the comparator agree', () => {
    // `normalizeFaultType` is what `sameValue` applies to both sides. If the
    // golden labels already survive it unchanged, then a model that follows the
    // stated rule exactly is scored on its label choice and not on formatting.
    for (const sample of goldenSamples()) {
      expect(normalizeFaultType(sample.expected.type), sample.id).toBe(sample.expected.type);
    }
  });

  it('no expected type appears verbatim in its incident text, which is why the rule is needed', () => {
    // The measurement behind finding 62, asserted rather than quoted in a
    // comment. If a future dataset edit made the labels copyable from the text,
    // this test fails and the prompt rule deserves revisiting: a copyable label
    // needs no grammar.
    const copyable = goldenSamples().filter((s) => s.incidentText.includes(s.expected.type));
    expect(copyable.map((s) => s.id)).toEqual([]);
  });

  it('the expected types are distinct, so the field is not a small closed set in disguise', () => {
    const types = goldenSamples().map((s) => s.expected.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('a model following the stated shape scores on label choice alone', () => {
  it('round-trips a shaped answer through parse and normalisation unchanged', () => {
    // The end-to-end property the prompt rule is for: an answer that obeys the
    // grammar must reach the scorer with its label intact, so a miss means the
    // model chose the wrong label rather than the wrong punctuation.
    const shaped = 'database-connection-pool-exhaustion';
    const response = JSON.stringify({ type: shaped, category: 'middleware', confidence: 0.9 });
    const parsed = parseFaultExtractionResponse(response);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.extracted.type).toBe(shaped);
    expect(normalizeFaultType(parsed.extracted.type)).toBe(shaped);
  });

  it('still accepts a shaped answer that deviates only in case and spacing', () => {
    // The parser deliberately does not normalise `type` on the way in (only
    // `category` gets that treatment); `sameValue` handles it at scoring time.
    // This pins that division of labour so a future "helpful" normalisation in
    // the parser cannot silently change what the scorer sees.
    const parsed = parseFaultExtractionResponse(
      JSON.stringify({ type: 'Database Connection Pool Exhaustion', confidence: 0.9 }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.extracted.type).toBe('Database Connection Pool Exhaustion');
    expect(normalizeFaultType(parsed.extracted.type)).toBe('database-connection-pool-exhaustion');
  });
});
