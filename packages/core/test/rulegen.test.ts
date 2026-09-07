import { describe, expect, it } from 'vitest';
import {
  buildRulegenPrompt,
  parseRulegenResponse,
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

  it('accepts an empty sample set for a structurally complete layout', () => {
    const result = validateGeneratedLayout(metricLayout, 'metric', []);
    expect(result.valid).toBe(true);
  });
});
