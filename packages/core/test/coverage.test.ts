import { describe, expect, it } from 'vitest';
import { MODALITY_LOSS, computeCoverage, formatCoverageReport } from '../src/coverage.js';
import type { IrBundle } from '../src/ir/types.js';
import { validBundle } from './fixtures.js';

function bundleWithSignals(kinds: string[]): IrBundle {
  const full = validBundle();
  const sigs = (full.signals['case-001'] ?? []).filter((s) => kinds.includes(s.signal));
  return validBundle({ signals: { 'case-001': sigs } });
}

describe('computeCoverage', () => {
  it('reports 100% for every modality present in the fixture', () => {
    const report = computeCoverage(validBundle());
    expect(report.coverage.metric).toBe(1);
    expect(report.coverage.log).toBe(1);
    expect(report.coverage.trace).toBe(1);
    expect(report.coverage.event).toBe(1);
    expect(report.coverage.alert).toBe(1);
    expect(report.coverage.profile).toBe(0);
  });

  it('reports zero coverage for an empty bundle', () => {
    const report = computeCoverage(validBundle({ cases: [], signals: {} }));
    expect(report.coverage.metric).toBe(0);
  });

  it('marks a target ready when all required modalities exist', () => {
    const report = computeCoverage(validBundle());
    const openrca = report.feasibility.find((f) => f.target === 'openrca-1.0');
    expect(openrca).toMatchObject({ status: 'ready', estimatedCaseLoss: 0, missingSignals: [] });
  });

  it('marks a target degraded when a modality is missing and quantifies the loss', () => {
    const report = computeCoverage(bundleWithSignals(['metric', 'log']));
    const aiops = report.feasibility.find((f) => f.target === 'aiops2025');
    expect(aiops?.status).toBe('degraded');
    expect(aiops?.missingSignals).toEqual(['trace']);
    expect(aiops?.estimatedCaseLoss).toBeCloseTo(MODALITY_LOSS.trace, 3);
  });

  it('marks a target unavailable when none of its required modalities exist', () => {
    const report = computeCoverage(bundleWithSignals(['profile']));
    const re1 = report.feasibility.find((f) => f.target === 'rcaeval-re1');
    expect(re1?.status).toBe('unavailable');
    expect(re1?.estimatedCaseLoss).toBeCloseTo(MODALITY_LOSS.metric, 3);
  });

  it('requires events, alerts and topology for RCA100', () => {
    const report = computeCoverage(bundleWithSignals(['metric', 'log', 'trace']));
    const rca100 = report.feasibility.find((f) => f.target === 'rca100');
    expect(rca100?.status).toBe('degraded');
    expect(rca100?.missingSignals).toEqual(['event', 'alert']);
  });

  it('reports the largest single loss rather than a sum', () => {
    const report = computeCoverage(bundleWithSignals(['trace']));
    const cloud = report.feasibility.find((f) => f.target === 'cloud-opsbench');
    expect(cloud?.estimatedCaseLoss).toBeCloseTo(Math.max(MODALITY_LOSS.metric, MODALITY_LOSS.log), 3);
  });

  it('covers every declared target', () => {
    expect(computeCoverage(validBundle()).feasibility).toHaveLength(6);
  });
});

describe('formatCoverageReport', () => {
  it('renders coverage and evaluability in readable form', () => {
    const text = formatCoverageReport(computeCoverage(validBundle()));
    expect(text).toContain('Observability Coverage Report');
    expect(text).toContain('openrca-1.0');
    expect(text).toContain('[OK  ]');
  });

  it('annotates degraded targets with the expected case loss', () => {
    const text = formatCoverageReport(computeCoverage(bundleWithSignals(['metric', 'log'])));
    expect(text).toContain('[WARN]');
    expect(text).toMatch(/case loss ~43\.0%/);
  });

  it('marks unavailable targets explicitly', () => {
    const text = formatCoverageReport(computeCoverage(bundleWithSignals(['profile'])));
    expect(text).toContain('[N/A ]');
  });
});
