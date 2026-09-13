import { describe, expect, it } from 'vitest';
import { exportRcaEval } from '../src/export/rcaeval.js';
import { ingestPrimeDataset } from '../src/ingest/prime.js';
import { validBundle } from './fixtures.js';

/**
 * The ingest report is the only record of what was rejected.
 *
 * `ingestPrimeDataset` upholds a "zero silent loss" invariant: every source
 * record becomes either a validated signal or a quarantine entry. The quarantine
 * entries — file, 1-based line, reason, and the offending record — are collected
 * per case and returned in `report`.
 *
 * That report is therefore the mechanism the invariant depends on. A run that
 * drops half the rows and reports nothing has not upheld it: the bundle on disk
 * looks exactly like one built from a source that only ever had half the rows.
 * These tests pin the report against a source whose true row count is known, so
 * "how much was lost" is measured rather than assumed.
 */

const METRIC_HEADER = 'timestamp,cmdb_id,kpi_name,value';
const GOOD_ROW = '2026-09-06T00:10:00Z,order-pod-1,cpu_usage,20';

function metricFile(...rows: string[]): Record<string, string> {
  return { 'telemetry/metric/cpu.csv': [METRIC_HEADER, ...rows].join('\n') + '\n' };
}

function ingestOne(files: Record<string, string>) {
  return ingestPrimeDataset(files, {
    dataset: 'rcaeval',
    system: 'rcaeval',
    cases: [{ caseId: 'case-001', component: 'order-pod-1', faultType: 'cpu', injectTime: '2026-09-06T00:10:00.000Z' }],
    // Declared so a source that yields no signals still resolves its root cause.
    // Without it the run stops at "does not resolve to an entity" and the report
    // under test would never be reached for the all-rejected cases below.
    extraEntities: [
      { entityId: 'service:rcaeval/order-pod-1', kind: 'service', name: 'order-pod-1', namespace: 'rcaeval', aliases: [] },
    ],
  });
}

describe('ingestPrimeDataset · every rejected row is accounted for', () => {
  it('reports a rejected row with its file, line and reason', () => {
    // The ordinary partial-loss case: one row is fine, one is not. The bundle
    // keeps one signal — and the report must carry the other row, because that
    // is the only place it still exists.
    const result = ingestOne(metricFile(GOOD_ROW, '2026-09-06T00:11:00Z,order-pod-1,cpu_usage,NOT_A_NUMBER'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001');
    expect(report?.signals).toBe(1);
    expect(report?.quarantine).toHaveLength(1);
    const [entry] = report!.quarantine;
    // Line 3 is the second data row: the header is line 1.
    expect(entry?.line).toBe(3);
    expect(entry?.file).toBe('telemetry/metric/cpu.csv');
    expect(entry?.reason).toMatch(/not a finite number/);
    // The offending record travels with the reason, so the operator can find it
    // without re-deriving which row produced the complaint.
    expect(entry?.record).toContain('NOT_A_NUMBER');
  });

  it('keeps the signal count and the quarantine count summing to the source rows', () => {
    // The invariant as arithmetic. Three data rows in; every one of them is
    // either a signal or a quarantine entry, so the two counts must reach three.
    const result = ingestOne(
      metricFile(GOOD_ROW, 'not-a-timestamp,order-pod-1,cpu_usage,20', '2026-09-06T00:12:00Z,order-pod-1,cpu_usage,21'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001')!;
    expect(report.signals + report.quarantine.length).toBe(3);
    expect(report.signals).toBe(2);
    expect(report.quarantine).toHaveLength(1);
  });

  it('accounts for a pre-parse error with no record text', () => {
    // An unterminated quote is detected by the delimited reader, not by a row
    // builder, so there is no record to quote. The entry must still be emitted —
    // an error the reader found is exactly as lost as one the builder found.
    const result = ingestOne({ 'telemetry/metric/cpu.csv': `${METRIC_HEADER}\n${GOOD_ROW}\n"unterminated,order-pod-1,cpu_usage,20\n` });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001')!;
    const unterminated = report.quarantine.find((q) => /unterminated/i.test(q.reason));
    expect(unterminated).toBeDefined();
    // A reader-level error names the file but has no single offending record.
    expect(unterminated?.file).toBe('telemetry/metric/cpu.csv');
    expect(unterminated?.record).toBe('');
  });

  it('records the file-level rejection reason when nothing can be read from it', () => {
    // The layout could not be inferred, so the whole file is refused before any
    // row is parsed. The reason must say that, because "every file was rejected"
    // on its own does not tell the operator which file or why.
    const result = ingestOne({ 'telemetry/metric/cpu.csv': 'garbage\n1,2,3\n' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001')!;
    expect(report.signals).toBe(0);
    expect(report.quarantine).toHaveLength(1);
    // Line 0 marks a whole-file rejection rather than a row.
    expect(report.quarantine[0]?.line).toBe(0);
    expect(report.quarantine[0]?.file).toBe('telemetry/metric/cpu.csv');
    expect(report.quarantine[0]?.reason).toMatch(/required column|header/i);
  });

  it('reports an empty quarantine for a source that parses cleanly', () => {
    // The positive control. Without it, "report every rejection" would be
    // satisfiable by reporting a rejection that never happened.
    const result = ingestOne(metricFile(GOOD_ROW));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report.find((r) => r.caseId === 'case-001')!;
    expect(report.signals).toBe(1);
    expect(report.quarantine).toEqual([]);
    expect(result.hardErrors).toEqual([]);
  });

  it('totals the losses across cases rather than per case alone', () => {
    // Two cases, each losing a row. A reader asking "did this run lose data?"
    // needs one answer, not one per case, so the sum has to be reachable.
    const files = {
      'a/telemetry/metric/cpu.csv': [METRIC_HEADER, GOOD_ROW, 'bad,order-pod-1,cpu_usage,x'].join('\n') + '\n',
      'b/telemetry/metric/cpu.csv': [METRIC_HEADER, GOOD_ROW, 'bad,order-pod-1,cpu_usage,y'].join('\n') + '\n',
    };
    const result = ingestPrimeDataset(files, {
      dataset: 'rcaeval',
      system: 'rcaeval',
      cases: [
        { caseId: 'case-a', component: 'order-pod-1', faultType: 'cpu', injectTime: '2026-09-06T00:10:00.000Z', pathPrefixes: ['a/'] },
        { caseId: 'case-b', component: 'order-pod-1', faultType: 'cpu', injectTime: '2026-09-06T00:10:00.000Z', pathPrefixes: ['b/'] },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const total = result.report.reduce((sum, r) => sum + r.quarantine.length, 0);
    expect(total).toBe(2);
    expect(result.report).toHaveLength(2);
  });
});

describe('ingestPrimeDataset · a faithful ingest is unchanged', () => {
  it('still produces a bundle the exporter accepts', () => {
    // Guard against the report being "fixed" by changing what is ingested.
    const result = ingestOne(metricFile(GOOD_ROW));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const exported = exportRcaEval(result.bundle, 'RE2');
    expect(Object.keys(exported.files).length).toBeGreaterThan(0);
  });

  it('is not confused by a fixture bundle that never went through ingest', () => {
    // The report is owned by the ingest path; a bundle built elsewhere has no
    // report, which must stay a type-level fact rather than a silent empty one.
    expect(validBundle().cases).toHaveLength(1);
  });
});
