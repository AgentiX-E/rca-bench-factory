import { describe, expect, it } from 'vitest';
import {
  buildRulegenPrompt,
  parseRulegenResponse,
  parseRulegenResponseChecked,
  rulegenLayoutFields,
  validateGeneratedLayout,
} from '../src/llm/rulegen.js';
import type { SampleRecord } from '../src/llm/rulegen.js';
import type { FileLayout } from '../src/ingest/file.js';

/**
 * LLM rule-generation core tests.
 *
 * These cover the deterministic skeleton around an LLM call: prompt building,
 * response parsing and rule validation are all pure functions of their inputs.
 * The LLM call itself is behind a provider abstraction, so these tests need no
 * mock and no network.
 */

const metricSamples: SampleRecord[] = [
  { time: '2026-09-06T00:00:00Z', svc: 'order', kpi: 'cpu_usage', val: '20' },
  { time: '2026-09-06T00:01:00Z', svc: 'order', kpi: 'cpu_usage', val: '95' },
];

describe('buildRulegenPrompt', () => {
  it('mentions the target signal kind', () => {
    const prompt = buildRulegenPrompt('metric', metricSamples, ['time', 'svc', 'kpi', 'val']);
    expect(prompt).toContain('metric');
  });

  it('includes the known headers when provided', () => {
    const prompt = buildRulegenPrompt('metric', metricSamples, ['time', 'svc', 'kpi', 'val']);
    expect(prompt).toContain('time');
    expect(prompt).toContain('val');
  });

  it('serialises the sample records', () => {
    const prompt = buildRulegenPrompt('metric', metricSamples);
    expect(prompt).toContain('cpu_usage');
    expect(prompt).toContain('2026-09-06T00:00:00Z');
  });

  it('asks for the JSON output contract', () => {
    const prompt = buildRulegenPrompt('log', [{ msg: 'x', ts: '2026-09-06T00:00:00Z' }]);
    expect(prompt).toContain('layout');
    expect(prompt).toContain('confidence');
  });
});

describe('parseRulegenResponse', () => {
  const validLayout: FileLayout = {
    timestamp: 'time',
    service: 'svc',
    metricName: 'kpi',
    metricValue: 'val',
  };

  it('parses a plain JSON object', () => {
    const text = JSON.stringify({ layout: validLayout, confidence: 0.9, rationale: 'columns map directly' });
    const result = parseRulegenResponse(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.generated.layout).toEqual(validLayout);
      expect(result.generated.confidence).toBe(0.9);
      expect(result.generated.rationale).toBe('columns map directly');
    }
  });

  it('parses JSON wrapped in a markdown code fence', () => {
    const text = '```json\n' + JSON.stringify({ layout: validLayout, confidence: 0.8, rationale: 'fenced' }) + '\n```';
    const result = parseRulegenResponse(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.generated.confidence).toBe(0.8);
  });

  it('extracts JSON embedded in surrounding prose', () => {
    const text = 'Here is the mapping: ' + JSON.stringify({ layout: validLayout, confidence: 0.7, rationale: 'prose' }) + ' hope it helps';
    const result = parseRulegenResponse(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.generated.confidence).toBe(0.7);
  });

  it('fails when no JSON object is present', () => {
    const result = parseRulegenResponse('no json here');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/json/i);
  });

  it('fails on truncated JSON', () => {
    const result = parseRulegenResponse('{"layout": {"timestamp": "time"');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/json/i);
  });

  it('fails on malformed JSON inside braces', () => {
    const result = parseRulegenResponse('{"layout": {"timestamp": "time" "x"}}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/json/i);
  });

  it('fails when a layout field is not a string', () => {
    const result = parseRulegenResponse('{"layout": {"timestamp": 123}, "confidence": 0.9}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/string/i);
  });

  it('accepts a semanticType field in the layout', () => {
    const text = JSON.stringify({
      layout: { timestamp: 'time', service: 'svc', metricName: 'kpi', metricValue: 'val', semanticType: 'saturation' },
      confidence: 0.9,
      rationale: 'semantic type inferred',
    });
    const result = parseRulegenResponse(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.generated.layout.semanticType).toBe('saturation');
  });

  it('fails when the layout is missing', () => {
    const result = parseRulegenResponse('{"confidence": 0.9}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/layout/i);
  });

  it('fails when the layout is not an object', () => {
    const result = parseRulegenResponse('{"layout": "nope", "confidence": 0.9}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/layout/i);
  });

  it('fails when confidence is missing', () => {
    const result = parseRulegenResponse(JSON.stringify({ layout: validLayout }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/confidence/i);
  });

  it('fails when confidence is out of range', () => {
    for (const confidence of [1.5, -0.2]) {
      const result = parseRulegenResponse(JSON.stringify({ layout: validLayout, confidence }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/confidence/i);
    }
  });

  it('fails when confidence is not a number', () => {
    const result = parseRulegenResponse(JSON.stringify({ layout: validLayout, confidence: 'high' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/confidence/i);
  });

  it('defaults the rationale to an empty string when absent', () => {
    const result = parseRulegenResponse(JSON.stringify({ layout: validLayout, confidence: 0.9 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.generated.rationale).toBe('');
  });
});

describe('validateGeneratedLayout', () => {
  const metricLayout: FileLayout = {
    timestamp: 'time',
    service: 'svc',
    metricName: 'kpi',
    metricValue: 'val',
  };

  it('accepts a valid metric layout against its samples', () => {
    const result = validateGeneratedLayout(metricLayout, 'metric', metricSamples);
    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('rejects a metric layout missing its name column', () => {
    const layout: FileLayout = { timestamp: 'time', service: 'svc', metricValue: 'val' };
    const result = validateGeneratedLayout(layout, 'metric', metricSamples);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/metricName/i);
  });

  it('rejects a metric layout pointing at a non-existent column', () => {
    const layout: FileLayout = { timestamp: 'time', service: 'svc', metricName: 'missing', metricValue: 'val' };
    const result = validateGeneratedLayout(layout, 'metric', metricSamples);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/missing/i);
  });

  it('rejects a layout when a sample lacks a required value', () => {
    const samples: SampleRecord[] = [
      { time: '2026-09-06T00:00:00Z', svc: 'order', kpi: 'cpu_usage', val: '20' },
      { time: '2026-09-06T00:01:00Z', svc: 'order', kpi: '', val: '95' },
    ];
    const result = validateGeneratedLayout(metricLayout, 'metric', samples);
    expect(result.valid).toBe(false);
  });

  it('accepts a valid log layout against its samples', () => {
    const layout: FileLayout = { timestamp: 'time', service: 'svc', logBody: 'msg' };
    const samples: SampleRecord[] = [{ time: '2026-09-06T00:00:00Z', svc: 'order', msg: 'boom' }];
    expect(validateGeneratedLayout(layout, 'log', samples).valid).toBe(true);
  });

  it('accepts a valid trace layout against its samples', () => {
    const layout: FileLayout = {
      timestamp: 'time',
      service: 'svc',
      traceId: 'tid',
      spanId: 'sid',
      spanName: 'op',
      durationMs: 'dur',
    };
    const samples: SampleRecord[] = [{ time: '2026-09-06T00:00:00Z', svc: 'order', tid: 't1', sid: 's1', op: 'GET /x', dur: '120' }];
    expect(validateGeneratedLayout(layout, 'trace', samples).valid).toBe(true);
  });

  it('rejects a trace layout missing its duration column', () => {
    const layout: FileLayout = {
      timestamp: 'time',
      service: 'svc',
      traceId: 'tid',
      spanId: 'sid',
      spanName: 'op',
    };
    const samples: SampleRecord[] = [{ time: '2026-09-06T00:00:00Z', svc: 'order', tid: 't1', sid: 's1', op: 'GET /x', dur: '120' }];
    const result = validateGeneratedLayout(layout, 'trace', samples);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/durationMs/i);
  });

  // This assertion used to read `expect(result.valid).toBe(true)`: it was
  // written to pin the behaviour of validating against no samples, and the
  // behaviour it pinned was the defect. It is corrected rather than deleted so
  // the case stays covered, and the corrected expectation is the one the
  // original case in "an empty sample set is not evidence" states in full.
  it('rejects a structurally complete layout when there are no samples to replay it against', () => {
    const result = validateGeneratedLayout(metricLayout, 'metric', []);
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(['no samples were provided, so the layout could not be replayed']);
  });
});

/**
 * The defects below were each reproduced against the shipped build before the
 * fix, by running the input and reading the value that came back. The measured
 * value is quoted in each case, because "this looks wrong" is not evidence and
 * the number is.
 */
describe('rulegen - a typo is not a field, and a field is not a typo', () => {
  const samples: SampleRecord[] = [
    { time: '2026-09-06T00:00:00Z', svc: 'order', kpi: 'cpu_usage', val: '20' },
  ];

  it('reports the source column of a field name that is not in the IR contract', () => {
    // Measured before the fix: `{"ok":true,...}` -- `timstamp` is not a member
    // of the metric IR contract, so the layout declared nothing at all while
    // parsing as a success.
    const result = parseRulegenResponseChecked('metric', JSON.stringify({
      layout: { timstamp: 'time', metricName: 'kpi', metricValue: 'val' },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/timstamp/);
  });

  it('reports a field name that is unknown but not a near-miss of a real one', () => {
    const result = parseRulegenResponseChecked('metric', JSON.stringify({
      layout: { timestamp: 'time', metricName: 'kpi', metricValue: 'val', banana: 'x' },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/banana/);
  });

  it('accepts every field the metric contract declares', () => {
    const result = parseRulegenResponseChecked('metric', JSON.stringify({
      layout: {
        timestamp: 'time', service: 'svc', metricName: 'kpi', metricValue: 'val',
        metricUnit: 'unit', semanticType: 'saturation',
      },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(true);
  });

  it('rejects a trace field in a metric layout', () => {
    // `spanName` is a real IR field, just not one of metric's. A membership
    // check that only tested "is this a field somewhere" would let it through.
    const result = parseRulegenResponseChecked('metric', JSON.stringify({
      layout: { timestamp: 'time', metricName: 'kpi', metricValue: 'val', spanName: 'op' },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/spanName/);
  });

  it('rejects a metric field in a log layout', () => {
    const result = parseRulegenResponseChecked('log', JSON.stringify({
      layout: { timestamp: 'time', logBody: 'msg', metricValue: 'val' },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/metricValue/);
  });

  it('exposes the per-kind field lists that the check is derived from', () => {
    expect(rulegenLayoutFields('metric')).toContain('semanticType');
    expect(rulegenLayoutFields('metric')).not.toContain('spanName');
    expect(rulegenLayoutFields('trace')).toContain('spanName');
    expect(rulegenLayoutFields('trace')).not.toContain('metricValue');
  });

  it('keeps the untyped parser permissive, so a caller that wants no contract still has one', () => {
    const result = parseRulegenResponse(JSON.stringify({
      layout: { timstamp: 'time', metricName: 'kpi', metricValue: 'val' },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(true);
  });

  it('does not let a near-miss field pass validation by being ignored', () => {
    // The two functions have to agree. `validateGeneratedLayout` reads the
    // required fields by name, so a typo makes them absent -- but the layout was
    // still accepted by the parser, which is what made the pair disagree.
    const parsed = parseRulegenResponseChecked('metric', JSON.stringify({
      layout: { timstamp: 'time', metricName: 'kpi', metricValue: 'val' },
      confidence: 0.9,
    }));
    expect(parsed.ok).toBe(false);
  });

  it('rejects a non-string column in a checked layout', () => {
    const result = parseRulegenResponseChecked('metric', JSON.stringify({
      layout: { timestamp: 123, metricName: 'kpi', metricValue: 'val' },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/string/i);
  });

  it('propagates the shape errors through the checked parser unchanged', () => {
    // The checked parser delegates the shared shape rules; a caller that chose
    // the contract-checking entry point must not get a different diagnosis for
    // malformed JSON than a caller that did not.
    for (const [text, pattern] of [
      ['no json here', /json/i],
      ['{"layout": {"timestamp": "time"}', /json/i],
      ['{"confidence": 0.9}', /layout/i],
      [JSON.stringify({ layout: { timestamp: 'time' }, confidence: 2 }), /confidence/i],
    ] as const) {
      const checked = parseRulegenResponseChecked('metric', text);
      const unchecked = parseRulegenResponse(text);
      expect(checked.ok, `expected ${text} to fail`).toBe(false);
      expect(unchecked.ok).toBe(false);
      if (!checked.ok && !unchecked.ok) {
        expect(checked.error).toBe(unchecked.error);
        expect(checked.error).toMatch(pattern);
      }
    }
  });

  it('rejects a non-string column in an unchecked layout', () => {
    const result = parseRulegenResponse(JSON.stringify({
      layout: { timestamp: 123, metricName: 'kpi', metricValue: 'val' },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/string/i);
  });
});

describe('rulegen - semanticType is a vocabulary, not a string', () => {
  it('rejects a semantic type that is not in the enum', () => {
    // Measured before the fix: `"semanticType":"not-a-real-semantic-type"`
    // parsed as ok:true and reached the IR, where the schema then rejected the
    // whole signal -- so one hallucinated enum member discarded a good record.
    const result = parseRulegenResponseChecked('metric', JSON.stringify({
      layout: {
        timestamp: 'time', metricName: 'kpi', metricValue: 'val',
        semanticType: 'not-a-real-semantic-type',
      },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/semanticType/);
  });

  it('rejects an empty semantic type rather than defaulting it', () => {
    const result = parseRulegenResponseChecked('metric', JSON.stringify({
      layout: { timestamp: 'time', metricName: 'kpi', metricValue: 'val', semanticType: '' },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/semanticType/);
  });

  it('accepts every member of the semantic-type enum', () => {
    for (const semanticType of ['latency', 'error_rate', 'throughput', 'saturation', 'availability', 'other']) {
      const result = parseRulegenResponseChecked('metric', JSON.stringify({
        layout: { timestamp: 'time', metricName: 'kpi', metricValue: 'val', semanticType },
        confidence: 0.9,
      }));
      expect(result.ok, `expected ${semanticType} to be accepted`).toBe(true);
    }
  });

  it('rejects a semantic type on a signal kind that has no such field', () => {
    const result = parseRulegenResponseChecked('log', JSON.stringify({
      layout: { timestamp: 'time', logBody: 'msg', semanticType: 'saturation' },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/semanticType/);
  });

  // The unchecked entry point has no field set, so it cannot judge whether a
  // name belongs to a signal kind -- but `semanticType` is not a field name, it
  // is an enum, and that check needs no signal kind to make. Both parsers
  // therefore enforce it, and these two cases are why.
  it('rejects an invalid semantic type on the unchecked parser too', () => {
    const result = parseRulegenResponse(JSON.stringify({
      layout: { timestamp: 'time', metricName: 'kpi', metricValue: 'val', semanticType: 'bogus' },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/semanticType/);
  });

  it('accepts a valid semantic type on the unchecked parser', () => {
    const result = parseRulegenResponse(JSON.stringify({
      layout: { timestamp: 'time', metricName: 'kpi', metricValue: 'val', semanticType: 'latency' },
      confidence: 0.9,
    }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.generated.layout.semanticType).toBe('latency');
  });
});

describe('rulegen - an empty sample set is not evidence of a working layout', () => {
  it('does not pass a layout checked against no samples', () => {
    // Measured before the fix: `{"valid":true}` for a layout and an empty
    // sample set. Nothing was replayed, so nothing could fail -- the check
    // reported success for having no input to check.
    const result = validateGeneratedLayout(
      { timestamp: 'time', service: 'svc', metricName: 'kpi', metricValue: 'val' },
      'metric',
      [],
    );
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/no samples/i);
  });

  it('still passes a good layout once samples exist', () => {
    const result = validateGeneratedLayout(
      { timestamp: 'time', service: 'svc', metricName: 'kpi', metricValue: 'val' },
      'metric',
      [{ time: '2026-09-06T00:00:00Z', svc: 'order', kpi: 'cpu_usage', val: '20' }],
    );
    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('still reports every missing required field before the sample check', () => {
    const result = validateGeneratedLayout({ metricValue: 'val' }, 'metric', []);
    expect(result.valid).toBe(false);
    // The structural reasons must survive alongside the no-samples reason, so a
    // caller fixing a layout is told about the layout first.
    expect(result.reasons.join(' ')).toMatch(/timestamp/);
    expect(result.reasons.join(' ')).toMatch(/no samples/i);
  });
});

describe('rulegen - the prompt names the contract the parser enforces', () => {
  it('states the field set as a closed list', () => {
    const prompt = buildRulegenPrompt('metric', [{ time: 'x', kpi: 'k', val: '1' }]);
    expect(prompt).toContain('one of');
  });

  it('states that an unknown field is rejected', () => {
    const prompt = buildRulegenPrompt('metric', [{ time: 'x', kpi: 'k', val: '1' }]);
    expect(prompt).toMatch(/unknown/i);
  });

  it('names the semantic-type vocabulary rather than leaving it to be guessed', () => {
    const prompt = buildRulegenPrompt('metric', [{ time: 'x', kpi: 'k', val: '1' }]);
    expect(prompt).toContain('availability');
    expect(prompt).toContain('saturation');
  });

  it('does not ask for a semantic type when the signal kind has none', () => {
    const prompt = buildRulegenPrompt('log', [{ ts: 'x', msg: 'm' }]);
    expect(prompt).not.toContain('semanticType');
  });
});
