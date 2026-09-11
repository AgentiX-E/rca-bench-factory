import { describe, expect, it } from 'vitest';
import { findDanglingEdgeRefs } from '../src/entity/graph.js';
import { checkG2Semantic, checkG3Validity, checkG5AntiPollution } from '../src/gates/gates.js';
import { applyRule, evalExpr } from '../src/transform/strategies.js';
import { parseTimestamp, TimeParseError, type TimeLayout } from '../src/util/time.js';
import { checkG5AntiPollution as _unused } from '../src/gates/gates.js';
import { computeCoverage, exportOpenRca, exportRcaEval } from './helpers.js';
import type { EntityGraph, IrBundle } from '../src/ir/types.js';
import { validBundle, validCase } from './fixtures.js';

/**
 * Edge cases that exist purely to reach defensive branches.
 *
 * They are kept in one place so it stays obvious which assertions guard against
 * a real defect and which merely pin down unreachable-but-cheap safety nets.
 */

describe('defensive branches', () => {
  it('rejects an unsupported time layout even when the caller forces one', () => {
    expect(() => parseTimestamp('2026-09-06', 'sidereal' as unknown as TimeLayout)).toThrow(
      TimeParseError,
    );
  });

  it('evaluates an expression over a numeric string field', () => {
    expect(evalExpr('a + 1', { a: '5' })).toBe(6);
  });

  it('rejects an expression starting with an illegal character', () => {
    expect(() => evalExpr('#1', {})).toThrow(/unexpected character/);
  });

  it('dispatches every rule kind through applyRule', () => {
    expect(applyRule({ id: 'r', kind: 'regex', from: 'l', pattern: '^(?<a>x)$', emit: { a: 'a' } }, { l: 'x' }).ok).toBe(
      true,
    );
    expect(
      applyRule({ id: 't', kind: 'template', from: 'b', templates: { L1: 'a {x}' }, toTemplateId: 'tid' }, { b: 'a 1' }).ok,
    ).toBe(true);
    expect(applyRule({ id: 'l', kind: 'lookup', from: 'k', to: 'v', table: { k: 'V' } }, { k: 'k' }).ok).toBe(true);
    expect(applyRule({ id: 'e', kind: 'expr', to: 'out', expression: '1 + 1' }, {}).ok).toBe(true);
    expect(applyRule({ id: 'm', kind: 'map', from: 'k', mapping: { k: 'v' } }, { k: 'k' }).ok).toBe(true);
    expect(applyRule({ id: 'u', kind: 'unit', from: 'v', fromUnit: 'ms', toUnit: 's' }, { v: 500 }).ok).toBe(true);
    expect(applyRule({ id: 't2', kind: 'time', from: 'ts', layout: 'iso8601' }, { ts: '2026-09-06T00:00:00Z' }).ok).toBe(
      true,
    );
  });
});

describe('topology edges', () => {
  it('flags a dangling edge source', () => {
    const g: EntityGraph = {
      entities: [{ entityId: 'b', kind: 'service', name: 'b', aliases: [] }],
      edges: [{ from: 'a', to: 'b', relation: 'calls' }],
    };
    expect(findDanglingEdgeRefs(g)).toEqual([{ ref: 'a', reason: 'dangling', where: 'edge.from' }]);
  });
});

describe('ground-truth reference failures', () => {
  it('flags a checkpoint that points at an unknown entity', () => {
    const fc = validCase();
    fc.groundTruth.evidenceCheckpoints = [
      {
        checkpointId: 'cp-1',
        entityRef: 'service:default/ghost',
        comparator: '>',
        value: 1,
        unit: '%',
        description: 'x',
      },
    ];
    fc.groundTruth.causalChain = [];
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'UNRESOLVED_CHECKPOINT_REF' }),
    );
  });

  it('flags a causal step whose target entity is unknown', () => {
    const fc = validCase();
    fc.groundTruth.causalChain = [
      {
        step: 1,
        fromEntityId: 'service:default/order',
        toEntityId: 'service:default/ghost',
        mechanism: 'x',
        evidenceRefs: [],
      },
    ];
    fc.groundTruth.evidenceCheckpoints = [];
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'UNRESOLVED_CAUSAL_TO' }),
    );
  });

  it('flags a causal step whose source entity is unknown', () => {
    const fc = validCase();
    fc.groundTruth.causalChain = [
      {
        step: 1,
        fromEntityId: 'service:default/ghost',
        toEntityId: 'service:default/order',
        mechanism: 'x',
        evidenceRefs: [],
      },
    ];
    fc.groundTruth.evidenceCheckpoints = [];
    const b = validBundle({ cases: [fc] });
    expect(checkG2Semantic(b).violations).toContainEqual(
      expect.objectContaining({ code: 'UNRESOLVED_CAUSAL_FROM' }),
    );
  });
});

describe('coverage with missing signal buckets', () => {
  it('treats a case with no signal bucket as having no coverage', () => {
    const b: IrBundle = validBundle({ signals: {} });
    expect(computeCoverage(b).coverage.metric).toBe(0);
  });
});

describe('exporters with optional fields absent', () => {
  it('emits an empty severity cell for a log without a level', () => {
    const b = validBundle({
      signals: {
        'case-001': [
          {
            irVersion: '2.0',
            resource: { 'service.name': 'order' },
            timestamp: '2026-09-06T00:01:00.000Z',
            signal: 'log',
            payload: { kind: 'log', body: 'plain message' },
          },
        ],
      },
    });
    const { files } = exportOpenRca(b);
    const csv = files['order-prod/2026_09_06/telemetry/log/case-001.csv'] as string;
    expect(csv).toContain('order,,plain message');
    const re = exportRcaEval(b, 'RE2');
    const logsCsv = Object.entries(re.files).find(([p]) => p.endsWith('/logs.csv'))?.[1] as string;
    expect(logsCsv).toContain('order,,plain message');
  });

  it('emits an empty status cell for a span without a status', () => {
    const b = validBundle({
      signals: {
        'case-001': [
          {
            irVersion: '2.0',
            resource: { 'service.name': 'order' },
            timestamp: '2026-09-06T00:01:00.000Z',
            signal: 'trace',
            payload: { kind: 'trace', traceId: 't', spanId: 's', spanName: 'n', durationMs: 5 },
          },
        ],
      },
    });
    const { files } = exportOpenRca(b);
    const csv = files['order-prod/2026_09_06/telemetry/trace/case-001.csv'] as string;
    expect(csv.trim().endsWith(',')).toBe(true);
    const re = exportRcaEval(b, 'RE2');
    const tracesCsv = Object.entries(re.files).find(([p]) => p.endsWith('/traces.csv'))?.[1] as string;
    expect(tracesCsv.trim().endsWith(',')).toBe(true);
  });

  it('emits an empty query cell when the case has no query', () => {
    const b = validBundle({ cases: [validCase({ query: undefined })] });
    const { files } = exportOpenRca(b);
    const csv = files['order-prod/query.csv'] as string;
    expect(csv.split('\n')[1]).toBe('case-001,,2026-09-06 08:10:00');
  });
});

describe('additional branch coverage', () => {
  it('flags an edge whose target id is empty', () => {
    const g: EntityGraph = {
      entities: [{ entityId: 'a', kind: 'service', name: 'a', aliases: [] }],
      edges: [{ from: 'a', to: '', relation: 'calls' }],
    };
    expect(findDanglingEdgeRefs(g)).toEqual([
      { ref: '(empty to)', reason: 'empty', where: 'edge' },
    ]);
  });

  it('treats a missing java_log offset as UTC rather than guessing', () => {
    expect(parseTimestamp('2026-09-06 12:00:00,000', 'java_log').isoUtc).toBe(
      '2026-09-06T12:00:00.000Z',
    );
  });

  it('accepts a unary plus in an expression', () => {
    expect(evalExpr('+5', {})).toBe(5);
  });

  it('resolves a lookup by exact key and can never be ambiguous', () => {
    const rule = { id: 'l', kind: 'lookup', from: 'k', to: 'v', table: { k: 'V', other: 'W' }, default: 'D' };
    expect(applyRule(rule, { k: 'k' })).toEqual({ ok: true, fields: { v: 'V' } });
    // Table keys are unique, so one key resolves to exactly one target or falls
    // through to the default; there is no coin flip to be strict about.
    expect(applyRule(rule, { k: 'unknown' })).toEqual({ ok: true, fields: { v: 'D' } });
    expect(applyRule({ id: 'l', kind: 'lookup', from: 'k', to: 'v', table: {} }, { k: 'k' })).toMatchObject({
      ok: false,
      code: 'LOOKUP_MISS',
    });
  });

  it('quarantines a record whose template library is malformed', () => {
    const r = applyRule(
      { id: 't', kind: 'template', from: 'b', templates: { L1: 'unclosed {param' }, toTemplateId: 'tid' },
      { b: 'unclosed thing' },
    );
    expect(r).toMatchObject({ ok: false, code: 'NO_TEMPLATE' });
  });

  it('quarantines a record whose template repeats a parameter name', () => {
    const r = applyRule(
      { id: 't', kind: 'template', from: 'b', templates: { L1: '{x} and {x}' }, toTemplateId: 'tid' },
      { b: 'a and b' },
    );
    expect(r).toMatchObject({ ok: false, code: 'NO_TEMPLATE' });
  });

  it('reports a weak anomaly when the injection time is unparseable', () => {
    // Without a usable injection time there is no baseline/post split, so the
    // anomaly cannot be established and the case must not be admitted.
    const b = validBundle({ cases: [validCase({ injectTime: 'not-a-time' })] });
    expect(checkG3Validity(b).violations).toContainEqual(
      expect.objectContaining({ code: 'WEAK_ANOMALY_SIGNAL' }),
    );
  });

  it('skips signals whose timestamp is not canonical when checking the window', () => {
    const b = validBundle();
    const sigs = b.signals['case-001'] as NonNullable<IrBundle['signals'][string]>;
    if (sigs[0]) sigs[0].timestamp = 'garbage';
    expect(
      checkG3Validity(b).violations.filter((v) => v.code === 'SIGNAL_OUT_OF_WINDOW'),
    ).toHaveLength(0);
  });

  it('scans a case without a query for sensitive data', () => {
    const b = validBundle({ cases: [validCase({ query: undefined, queryless: true } as never)] });
    expect(checkG5AntiPollution(b).status).toBe('passed');
  });
});
