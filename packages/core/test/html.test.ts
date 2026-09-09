import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  renderCoverage,
  renderEntityGraph,
  renderGates,
  renderPage,
  renderScore,
} from '../src/report/html.js';
import type { CoverageReport } from '../src/coverage.js';
import type { EntityGraph, QualityGateReport } from '../src/ir/types.js';
import type { ScoreReport } from '../src/score/score.js';

/**
 * HTML report renderer tests.
 *
 * The renderer is pure: every function takes a typed report and returns a string.
 * The suite asserts the rendered markup carries the right rows, status classes and
 * escaped user data, using real hand-written report objects (no mocks).
 */

const coverageReport = (): CoverageReport => ({
  coverage: { metric: 1, log: 0.5, trace: 0, event: 0, alert: 0, profile: 0 },
  feasibility: [
    { target: 'openrca-1.0', status: 'ready', estimatedCaseLoss: 0, missingSignals: [] },
    { target: 'rca100', status: 'degraded', estimatedCaseLoss: 0.562, missingSignals: ['log', 'trace', 'event', 'alert'] },
    { target: 'cloud-opsbench', status: 'unavailable', estimatedCaseLoss: 0.928, missingSignals: ['metric'] },
  ],
});

const gateReport = (): QualityGateReport => ({
  caseId: 'case-001',
  irVersion: '2.0',
  gateRunId: 'run-1',
  runAt: '2026-09-09T00:00:00.000Z',
  results: [
    { gateId: 'G1', status: 'passed', violations: [] },
    { gateId: 'G2', status: 'failed', violations: [{ code: 'MISSING_SIGNAL', message: 'x', fieldPath: 'case-001.signals.metric' }] },
  ],
  finalStatus: 'rejected',
});

const scoreReport = (): ScoreReport => ({
  target: 'rca100',
  passed: true,
  score: 100,
  structure: {
    target: 'rca100',
    passed: true,
    checks: [
      { id: 'case-present', passed: true, detail: 'found 1 case topology.json' },
      { id: 'gt-structure', passed: false, detail: 'missing four layers' },
    ],
  },
  checksum: { passed: true, matched: 2, mismatched: [], missing: [], extra: [] },
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('<&>"\'')).toBe('&lt;&amp;&gt;&quot;&#39;');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('order service 123')).toBe('order service 123');
  });
});

describe('renderCoverage', () => {
  it('renders per-modality coverage rows', () => {
    const html = renderCoverage(coverageReport());
    expect(html).toContain('<td>metric</td>');
    expect(html).toContain('<td>100.0%</td>');
    expect(html).toContain('<td>log</td>');
    expect(html).toContain('<td>50.0%</td>');
  });

  it('renders feasibility rows with status classes, loss and missing signals', () => {
    const html = renderCoverage(coverageReport());
    expect(html).toContain('class="ok"');
    expect(html).toContain('class="warn"');
    expect(html).toContain('class="bad"');
    expect(html).toContain('loss ~56.2%');
    expect(html).toContain('log, trace, event, alert');
    expect(html).toContain('<td>ready</td>');
  });
});

describe('renderGates', () => {
  it('renders gate rows with escaped violation paths', () => {
    const html = renderGates(gateReport());
    expect(html).toContain('<td>G1</td>');
    expect(html).toContain('<td>passed</td>');
    expect(html).toContain('MISSING_SIGNAL @ case-001.signals.metric');
    expect(html).toContain('final:');
  });

  it('renders the mutation-suite note when present', () => {
    const html = renderGates({ ...gateReport(), mutationTestPassed: true });
    expect(html).toContain('mutation suite passed');
  });

  it('escapes a hostile case id', () => {
    const html = renderGates({ ...gateReport(), caseId: '<script>x</script>' });
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>x</script>');
  });

  it('renders a violation without a field path', () => {
    const report = gateReport();
    report.results[1]!.violations = [{ code: 'EMPTY_CASE_ID', message: 'x' }];
    const html = renderGates(report);
    expect(html).toContain('EMPTY_CASE_ID');
    expect(html).not.toContain('EMPTY_CASE_ID @');
  });
});

describe('renderScore', () => {
  it('renders the score and structure checks with a checksum block', () => {
    const html = renderScore(scoreReport());
    expect(html).toContain('target <b>rca100</b>');
    expect(html).toContain('case-present');
    expect(html).toContain('gt-structure');
    expect(html).toContain('checksum:');
    expect(html).toContain('matched 2');
  });

  it('omits the checksum block when absent', () => {
    const { checksum: _checksum, ...rest } = scoreReport();
    const html = renderScore(rest);
    expect(html).not.toContain('checksum:');
  });

  it('renders an empty table body for an empty check list', () => {
    const report = scoreReport();
    report.structure = { target: 'rca100', passed: true, checks: [] };
    const html = renderScore(report);
    expect(html).toContain('colspan="3">—</td>');
  });

  it('renders a failing checksum', () => {
    const report = scoreReport();
    report.checksum = { passed: false, matched: 1, mismatched: ['a'], missing: ['b'], extra: ['c'] };
    const html = renderScore(report);
    expect(html).toContain('fail');
  });

  it('renders a failing score with the bad class', () => {
    const report = scoreReport();
    report.passed = false;
    report.score = 50;
    const html = renderScore(report);
    expect(html).toContain('class="bad"');
  });
});

describe('renderEntityGraph', () => {
  const entityGraph = (): EntityGraph => ({
    entities: [
      { entityId: 'service:default/order', kind: 'service', name: 'order', namespace: 'default', aliases: ['svc-order', 'order-prod'] },
      { entityId: 'service:default/cart', kind: 'service', name: 'cart', namespace: 'default', aliases: [] },
    ],
    edges: [{ from: 'service:default/order', to: 'service:default/cart', relation: 'calls' }],
  });

  it('renders the entity and edge tables', () => {
    const html = renderEntityGraph(entityGraph());
    expect(html).toContain('service:default/order');
    expect(html).toContain('svc-order, order-prod');
    expect(html).toContain('<td>calls</td>');
    expect(html).toContain('2 entities, 1 edges');
  });

  it('renders OK when reference integrity holds', () => {
    const html = renderEntityGraph(entityGraph());
    expect(html).toContain('Reference integrity: OK');
  });

  it('renders placeholders for a missing namespace and empty aliases', () => {
    const graph = entityGraph();
    graph.entities[1] = { entityId: 'service:default/cart', kind: 'service', name: 'cart', aliases: [] };
    const html = renderEntityGraph(graph);
    expect((html.match(/<td>—<\/td>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('renders a dangling edge reference', () => {
    const graph = entityGraph();
    graph.edges.push({ from: 'service:default/order', to: 'service:default/ghost', relation: 'calls' });
    const html = renderEntityGraph(graph);
    expect(html).toContain('Reference integrity issues:');
    expect(html).toContain('dangling');
  });

  it('renders an ambiguous alias', () => {
    const graph = entityGraph();
    graph.entities[1]!.aliases = ['svc-order'];
    const html = renderEntityGraph(graph);
    expect(html).toContain("ambiguous alias 'svc-order'");
  });

  it('renders an invalid relation', () => {
    const graph = entityGraph();
    graph.edges[0]!.relation = 'bogus' as never;
    const html = renderEntityGraph(graph);
    expect(html).toContain('edge.relation');
  });

  it('escapes hostile entity data', () => {
    const graph = entityGraph();
    graph.entities[0]!.name = '<script>x</script>';
    const html = renderEntityGraph(graph);
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>x</script>');
  });
});

describe('renderPage', () => {
  it('combines all sections into a full page', () => {
    const html = renderPage({
      title: 'Benchmark Report',
      coverage: coverageReport(),
      entityGraph: {
        entities: [{ entityId: 'service:default/order', kind: 'service', name: 'order', namespace: 'default', aliases: [] }],
        edges: [],
      },
      gates: [gateReport()],
      scores: [scoreReport()],
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Benchmark Report</title>');
    expect(html).toContain('Observability coverage');
    expect(html).toContain('Entity graph');
    expect(html).toContain('Quality gates');
    expect(html).toContain('Score');
  });

  it('escapes a hostile title', () => {
    const html = renderPage({ title: '<img src=x onerror=alert(1)>' });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });

  it('renders an explicit empty placeholder when no sections are given', () => {
    const html = renderPage({ title: 'Empty' });
    expect(html).toContain('No report sections.');
  });

  it('omits absent optional sections', () => {
    const html = renderPage({ title: 'Coverage only', coverage: coverageReport() });
    expect(html).toContain('Observability coverage');
    expect(html).not.toContain('Quality gates');
    expect(html).not.toContain('<h2>Score</h2>');
  });
});
