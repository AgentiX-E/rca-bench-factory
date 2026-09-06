import { describe, expect, it } from 'vitest';
import {
  applyExpr,
  applyLookup,
  applyMap,
  applyRegex,
  applyRule,
  applyTemplate,
  applyTime,
  applyUnit,
  evalExpr,
  type TransformRule,
} from '../src/transform/strategies.js';
import { checkNoSilentLoss, transformBatch, transformTraceBatch } from '../src/transform/engine.js';

describe('time strategy', () => {
  it('normalizes a java_log timestamp using the declared offset', () => {
    const r = applyTime(
      { id: 't', kind: 'time', from: 'ts', to: 'timestamp', layout: 'java_log', assumeOffsetMinutes: 480 },
      { ts: '2026-09-06 12:05:06,123' },
    );
    expect(r).toEqual({
      ok: true,
      fields: { timestamp: '2026-09-06T04:05:06.123Z' },
    });
  });

  it('emits the offset into a separate field when asked', () => {
    const r = applyTime(
      { id: 't', kind: 'time', from: 'ts', layout: 'iso8601', emitOffsetTo: 'offset' },
      { ts: '2026-09-06T04:05:06.000Z' },
    );
    expect(r.ok && r.fields['offset']).toBe(0);
  });

  it('quarantines a missing field instead of throwing', () => {
    const r = applyTime({ id: 't', kind: 'time', from: 'ts', layout: 'iso8601' }, {});
    expect(r).toMatchObject({ ok: false, code: 'MISSING_INPUT' });
  });

  it('quarantines a non-string value', () => {
    const r = applyTime({ id: 't', kind: 'time', from: 'ts', layout: 'iso8601' }, { ts: 12345 });
    expect(r).toMatchObject({ ok: false, code: 'BAD_TIMESTAMP' });
  });

  it('quarantines an unparseable value', () => {
    const r = applyTime({ id: 't', kind: 'time', from: 'ts', layout: 'iso8601' }, { ts: 'garbage' });
    expect(r).toMatchObject({ ok: false, code: 'BAD_TIMESTAMP' });
  });
});

describe('unit strategy', () => {
  it('converts milliseconds to seconds', () => {
    const r = applyUnit({ id: 'u', kind: 'unit', from: 'latency', fromUnit: 'ms', toUnit: 's' }, { latency: 250 });
    expect(r).toEqual({ ok: true, fields: { latency: 0.25 } });
  });

  it('accepts a numeric string', () => {
    const r = applyUnit({ id: 'u', kind: 'unit', from: 'latency', fromUnit: 'ms', toUnit: 's' }, { latency: '250' });
    expect(r.ok && r.fields['latency']).toBe(0.25);
  });

  it('quarantines a non-numeric value', () => {
    const r = applyUnit({ id: 'u', kind: 'unit', from: 'latency', fromUnit: 'ms', toUnit: 's' }, { latency: 'abc' });
    expect(r).toMatchObject({ ok: false, code: 'UNIT_CONVERT_FAILED' });
  });

  it('quarantines an impossible conversion', () => {
    const r = applyUnit({ id: 'u', kind: 'unit', from: 'v', fromUnit: 'By', toUnit: 's' }, { v: 1 });
    expect(r).toMatchObject({ ok: false, code: 'UNIT_CONVERT_FAILED' });
  });

  it('quarantines a missing field', () => {
    const r = applyUnit({ id: 'u', kind: 'unit', from: 'v', fromUnit: 'ms', toUnit: 's' }, {});
    expect(r).toMatchObject({ ok: false, code: 'MISSING_INPUT' });
  });
});

describe('map strategy', () => {
  const rule = {
    id: 'm',
    kind: 'map' as const,
    from: 'level',
    to: 'severity_text',
    mapping: { W: 'WARN', WARN: 'WARN', E: 'ERROR', ERR: 'ERROR' },
  };

  it('maps known aliases', () => {
    expect(applyMap(rule, { level: 'W' })).toEqual({ ok: true, fields: { severity_text: 'WARN' } });
    expect(applyMap(rule, { level: 'ERR' })).toEqual({ ok: true, fields: { severity_text: 'ERROR' } });
  });

  it('quarantines an unmapped value when no default is declared', () => {
    expect(applyMap(rule, { level: 'TRACE' })).toMatchObject({ ok: false, code: 'UNMAPPED_VALUE' });
  });

  it('falls back to the declared default', () => {
    expect(applyMap({ ...rule, default: 'INFO' }, { level: 'TRACE' })).toEqual({
      ok: true,
      fields: { severity_text: 'INFO' },
    });
  });

  it('quarantines a missing field', () => {
    expect(applyMap(rule, {})).toMatchObject({ ok: false, code: 'MISSING_INPUT' });
  });
});

describe('regex strategy', () => {
  const rule = {
    id: 'r',
    kind: 'regex' as const,
    from: 'line',
    pattern: '^(?<ts>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\s+\\[(?<level>\\w+)\\]\\s+(?<body>.*)$',
    emit: { ts: 'ts', level: 'level', body: 'body' },
  };

  it('splits a line into named fields', () => {
    const r = applyRegex(rule, { line: '2026-09-06 12:05:06 [WARN] disk almost full' });
    expect(r).toEqual({
      ok: true,
      fields: { ts: '2026-09-06 12:05:06', level: 'WARN', body: 'disk almost full' },
    });
  });

  it('quarantines a non-matching line', () => {
    expect(applyRegex(rule, { line: 'totally different' })).toMatchObject({
      ok: false,
      code: 'PATTERN_MISMATCH',
    });
  });

  it('quarantines when a declared capture group is absent', () => {
    const bad = { ...rule, emit: { ts: 'ts', nope: 'nope' } };
    expect(applyRegex(bad, { line: '2026-09-06 12:05:06 [WARN] x' })).toMatchObject({
      ok: false,
      code: 'PATTERN_MISMATCH',
    });
  });

  it('quarantines a missing field', () => {
    expect(applyRegex(rule, {})).toMatchObject({ ok: false, code: 'MISSING_INPUT' });
  });
});

describe('template strategy', () => {
  const rule = {
    id: 'tp',
    kind: 'template' as const,
    from: 'body',
    templates: {
      L001: 'Connection to {host}:{port} timed out after {ms}ms',
      L002: 'Failed to acquire lock on {resource}',
    },
    toTemplateId: 'template_id',
    toParams: 'params',
  };

  it('matches a template and extracts parameters', () => {
    const r = applyTemplate(rule, { body: 'Connection to db-1:5432 timed out after 3000ms' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields['template_id']).toBe('L001');
    expect(r.fields['params']).toEqual({ host: 'db-1', port: '5432', ms: '3000' });
  });

  it('normalizes whitespace before matching', () => {
    const r = applyTemplate(rule, { body: '  Connection  to  db-1:5432  timed out after  3000ms ' });
    expect(r.ok && r.fields['template_id']).toBe('L001');
  });

  it('quarantines when no template matches', () => {
    expect(applyTemplate(rule, { body: 'something else entirely' })).toMatchObject({
      ok: false,
      code: 'NO_TEMPLATE',
    });
  });

  it('quarantines a missing field', () => {
    expect(applyTemplate(rule, {})).toMatchObject({ ok: false, code: 'MISSING_INPUT' });
  });
});

describe('lookup strategy', () => {
  const table = { 'svc-order-prod-01': 'service:default/order', 'ORDER-SVC': 'service:default/order' };

  it('resolves an alias to a canonical entity id', () => {
    const r = applyLookup({ id: 'l', kind: 'lookup', from: 'name', to: 'entity_id', table }, { name: 'ORDER-SVC' });
    expect(r).toEqual({ ok: true, fields: { entity_id: 'service:default/order' } });
  });

  it('quarantines a miss when no default is declared', () => {
    expect(applyLookup({ id: 'l', kind: 'lookup', from: 'name', to: 'entity_id', table }, { name: 'nope' })).toMatchObject({
      ok: false,
      code: 'LOOKUP_MISS',
    });
  });

  it('uses the declared default on a miss', () => {
    const r = applyLookup(
      { id: 'l', kind: 'lookup', from: 'name', to: 'entity_id', table, default: 'service:default/unknown' },
      { name: 'nope' },
    );
    expect(r.ok && r.fields['entity_id']).toBe('service:default/unknown');
  });

  it('quarantines a missing field', () => {
    expect(applyLookup({ id: 'l', kind: 'lookup', from: 'name', to: 'entity_id', table }, {})).toMatchObject({
      ok: false,
      code: 'MISSING_INPUT',
    });
  });
});

describe('expr strategy', () => {
  it('evaluates arithmetic over numeric fields', () => {
    expect(evalExpr('a + b * 2', { a: 1, b: 3 })).toBe(7);
    expect(evalExpr('(a + b) * 2', { a: 1, b: 3 })).toBe(8);
    expect(evalExpr('a - b', { a: 1, b: 3 })).toBe(-2);
  });

  it('supports unary minus', () => {
    expect(evalExpr('-a', { a: 5 })).toBe(-5);
  });

  it('supports dotted field paths', () => {
    expect(evalExpr('payload.duration', { payload: { duration: 12 } })).toBe(12);
  });

  it('rejects division by zero instead of returning Infinity', () => {
    const r = applyExpr({ id: 'e', kind: 'expr', to: 'out', expression: 'a / b' }, { a: 1, b: 0 });
    expect(r).toMatchObject({ ok: false, code: 'EXPR_FAILED' });
  });

  it('rejects trailing garbage', () => {
    expect(() => evalExpr('1 + 1 )', {})).toThrow();
  });

  it('rejects an unknown field', () => {
    expect(() => evalExpr('nope + 1', {})).toThrow();
  });

  it('rejects an unbalanced parenthesis', () => {
    expect(() => evalExpr('(1 + 1', {})).toThrow();
  });

  it('cannot reach outside the record: a property access is not a legal token', () => {
    // `process.exit` parses as a field named `process.exit` and resolves to NaN,
    // which is quarantined rather than executed.
    const r = applyExpr({ id: 'e', kind: 'expr', to: 'out', expression: 'process.exit' }, {});
    expect(r).toMatchObject({ ok: false, code: 'EXPR_FAILED' });
  });

  it('writes the result into the target field', () => {
    const r = applyExpr({ id: 'e', kind: 'expr', to: 'latency_s', expression: 'duration_ms / 1000' }, { duration_ms: 2500 });
    expect(r).toEqual({ ok: true, fields: { latency_s: 2.5 } });
  });
});

describe('applyRule dispatch', () => {
  it('dispatches on rule kind', () => {
    expect(applyRule({ id: 'x', kind: 'unit', from: 'v', fromUnit: 'ms', toUnit: 's' }, { v: 1000 }).ok).toBe(true);
  });

  it('throws on an unknown rule kind', () => {
    const bogus = { id: 'x', kind: 'nope' } as unknown as TransformRule;
    expect(() => applyRule(bogus, {})).toThrow(/unsupported rule kind/);
  });
});

describe('transformBatch', () => {
  const rules: TransformRule[] = [
    { id: 't', kind: 'time', from: 'ts', to: 'timestamp', layout: 'java_log', assumeOffsetMinutes: 480, emitOffsetTo: 'offset' },
    { id: 'm', kind: 'map', from: 'level', to: 'severity', mapping: { W: 'WARN', E: 'ERROR' } },
  ];

  it('converts a clean batch', () => {
    const res = transformBatch(
      [
        { ts: '2026-09-06 12:00:00,000', level: 'W' },
        { ts: '2026-09-06 12:00:01,000', level: 'E' },
      ],
      rules,
    );
    expect(res.counts).toEqual({ input: 2, output: 2, quarantine: 0 });
    expect(res.outputs[0]?.record['severity']).toBe('WARN');
    expect(res.outputs[0]?.record['timestamp']).toBe('2026-09-06T04:00:00.000Z');
  });

  it('quarantines bad records without aborting the batch', () => {
    const res = transformBatch(
      [
        { ts: '2026-09-06 12:00:00,000', level: 'W' },
        { ts: '2026-09-06 12:00:01,000', level: 'TRACE' },
        { ts: 'not a time', level: 'W' },
      ],
      rules,
    );
    expect(res.counts).toEqual({ input: 3, output: 1, quarantine: 2 });
    expect(res.quarantined.map((q) => q.code)).toEqual(['UNMAPPED_VALUE', 'BAD_TIMESTAMP']);
  });

  it('never loses a record silently', () => {
    const res = transformBatch([{ ts: 'bad', level: 'X' }, { ts: '2026-09-06 12:00:00,000', level: 'W' }], rules);
    expect(checkNoSilentLoss(res)).toBe(0);
  });

  it('is idempotent: the same input yields identical output', () => {
    const input = [{ ts: '2026-09-06 12:00:00,000', level: 'W' }];
    const a = transformBatch(input, rules);
    const b = transformBatch(input, rules);
    expect(JSON.stringify(a.outputs)).toBe(JSON.stringify(b.outputs));
  });

  it('records provenance for every derived field', () => {
    const res = transformBatch([{ ts: '2026-09-06 12:00:00,000', level: 'W' }], rules, {
      modelId: 'deepseek-chat',
      promptVersion: 'g1@1.2',
    });
    expect(res.outputs[0]?.provenance['severity']).toEqual({
      source: 'derived',
      ruleId: 'm',
      modelId: 'deepseek-chat',
      promptVersion: 'g1@1.2',
    });
  });

  it('writes dotted paths as nested objects', () => {
    const res = transformBatch(
      [{ v: '7' }],
      [{ id: 'l', kind: 'lookup', from: 'v', to: 'resource.service.name', table: { '7': 'order' } }],
    );
    expect(res.outputs[0]?.record['resource']).toEqual({ service: { name: 'order' } });
  });

  it('uses a caller-provided id field in quarantine reports', () => {
    const res = transformBatch([{ id: 'rec-42', level: 'TRACE' }], rules, { idField: 'id' });
    expect(res.quarantined[0]?.recordId).toBe('rec-42');
  });

  it('falls back to a positional id when the id field is absent', () => {
    const res = transformBatch([{ level: 'TRACE' }], rules, { idField: 'id' });
    expect(res.quarantined[0]?.recordId).toBe('row-0');
  });

  it('handles an empty batch', () => {
    const res = transformBatch([], rules);
    expect(res.counts).toEqual({ input: 0, output: 0, quarantine: 0 });
  });

  it('stops at the first failing rule so the reason stays unambiguous', () => {
    const res = transformBatch(
      [{ ts: 'bad', level: 'TRACE' }],
      rules,
    );
    expect(res.quarantined).toHaveLength(1);
    expect(res.quarantined[0]?.ruleId).toBe('t');
  });
});

describe('transformTraceBatch', () => {
  it('preserves span relationships', () => {
    const spans = [
      { trace_id: 't1', span_id: 's1', duration_ms: 100 },
      { trace_id: 't1', span_id: 's2', parent_span_id: 's1', duration_ms: 80 },
    ];
    const res = transformTraceBatch(spans, [
      { id: 'u', kind: 'unit', from: 'duration_ms', fromUnit: 'ms', toUnit: 's' },
    ]);
    expect(res.spans).toHaveLength(2);
    expect(res.spans[1]?.parent_span_id).toBe('s1');
    expect(res.spans[0]?.duration_ms).toBe(0.1);
    expect(res.danglingParents).toEqual([]);
  });

  it('reports a parent that is missing from the batch', () => {
    const res = transformTraceBatch(
      [{ trace_id: 't1', span_id: 's2', parent_span_id: 's0', duration_ms: 80 }],
      [],
    );
    expect(res.danglingParents).toEqual(['s0']);
  });

  it('does not report the same dangling parent twice', () => {
    const res = transformTraceBatch(
      [
        { trace_id: 't1', span_id: 'a', parent_span_id: 's0', duration_ms: 1 },
        { trace_id: 't1', span_id: 'b', parent_span_id: 's0', duration_ms: 1 },
      ],
      [],
    );
    expect(res.danglingParents).toEqual(['s0']);
  });

  it('treats a parent from another trace as dangling', () => {
    const res = transformTraceBatch(
      [
        { trace_id: 't1', span_id: 'a', duration_ms: 1 },
        { trace_id: 't2', span_id: 'b', parent_span_id: 'a', duration_ms: 1 },
      ],
      [],
    );
    expect(res.danglingParents).toEqual(['a']);
  });
});
