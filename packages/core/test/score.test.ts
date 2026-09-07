import { describe, expect, it } from 'vitest';
import { exportOpenRca } from '../src/export/openrca.js';
import { exportRcaEval } from '../src/export/rcaeval.js';
import {
  checkOpenRcaStructure,
  checkRcaEvalStructure,
  scoreExport,
  sha256,
  verifyChecksums,
} from '../src/score/score.js';
import type { RcaEvalSuite } from '../src/export/rcaeval.js';
import { validBundle } from './fixtures.js';

/**
 * Score module tests.
 *
 * Structure checks run against real exporter output (no hand-written CSV), and
 * checksum verification runs against the module's own `sha256` so the anchors are
 * deterministic. The suite asserts that a fully valid export scores 100 and that
 * every individual defect lowers the score.
 */

const openrcaFiles = (): Record<string, string> => exportOpenRca(validBundle()).files;

describe('sha256', () => {
  it('returns the standard SHA-256 digest', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('checkOpenRcaStructure', () => {
  it('passes a well-formed OpenRCA export', () => {
    const report = checkOpenRcaStructure(openrcaFiles());
    expect(report.passed).toBe(true);
    expect(report.target).toBe('openrca-1.0');
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it('fails when query.csv is missing', () => {
    const files = openrcaFiles();
    delete files['order-prod/query.csv'];
    const report = checkOpenRcaStructure(files);
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'query-csv')?.passed).toBe(false);
  });

  it('fails when record.csv is missing', () => {
    const files = openrcaFiles();
    delete files['order-prod/record.csv'];
    const report = checkOpenRcaStructure(files);
    expect(report.checks.find((c) => c.id === 'record-csv')?.passed).toBe(false);
  });

  it('fails when the answer key leaks into query.csv', () => {
    const files = openrcaFiles();
    files['order-prod/query.csv'] = 'instruction_id,query,occurrence_datetime\ncase-001,"root cause component: order",2026-09-06 08:10:00\n';
    const report = checkOpenRcaStructure(files);
    expect(report.checks.find((c) => c.id === 'answer-key-isolated')?.passed).toBe(false);
  });

  it('fails on a wrong metric header', () => {
    const files = openrcaFiles();
    const path = Object.keys(files).find((p) => p.includes('/telemetry/metric/'))!;
    files[path] = 'wrong,header,here\n';
    const report = checkOpenRcaStructure(files);
    expect(report.checks.find((c) => c.id === 'metric-header')?.passed).toBe(false);
  });

  it('fails when no telemetry files exist', () => {
    const report = checkOpenRcaStructure({ 'order-prod/query.csv': 'a\n', 'order-prod/record.csv': 'b\n' });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'telemetry-present')?.passed).toBe(false);
  });
});

describe('checkRcaEvalStructure', () => {
  it('passes a well-formed RE2 export', () => {
    const files = exportRcaEval(validBundle(), 'RE2').files;
    const report = checkRcaEvalStructure(files, 'RE2');
    expect(report.passed).toBe(true);
  });

  it('passes a well-formed RE1 export with no logs or traces', () => {
    const files = exportRcaEval(validBundle(), 'RE1').files;
    const report = checkRcaEvalStructure(files, 'RE1');
    expect(report.passed).toBe(true);
  });

  it('fails RE1 when logs are present', () => {
    const files = exportRcaEval(validBundle(), 'RE2').files;
    const report = checkRcaEvalStructure(files, 'RE1');
    expect(report.checks.find((c) => c.id === 'modality-set')?.passed).toBe(false);
  });

  it('fails RE2 when logs are missing', () => {
    const files = exportRcaEval(validBundle(), 'RE1').files;
    const report = checkRcaEvalStructure(files, 'RE2');
    expect(report.checks.find((c) => c.id === 'modality-set')?.passed).toBe(false);
  });

  it('fails on a non-integer inject time', () => {
    const files = exportRcaEval(validBundle(), 'RE1').files;
    const path = Object.keys(files).find((p) => p.endsWith('inject_time.txt'))!;
    files[path] = 'not-an-integer';
    const report = checkRcaEvalStructure(files, 'RE1');
    expect(report.checks.find((c) => c.id === 'inject-time-format')?.passed).toBe(false);
  });

  it('fails when inject_time.txt is missing', () => {
    const files = exportRcaEval(validBundle(), 'RE1').files;
    const path = Object.keys(files).find((p) => p.endsWith('inject_time.txt'))!;
    delete files[path];
    const report = checkRcaEvalStructure(files, 'RE1');
    expect(report.checks.find((c) => c.id === 'inject-time-format')?.passed).toBe(false);
  });

  it('fails on a wrong logs header', () => {
    const files = exportRcaEval(validBundle(), 'RE2').files;
    const path = Object.keys(files).find((p) => p.endsWith('logs.csv'))!;
    files[path] = 'wrong,header\n';
    const report = checkRcaEvalStructure(files, 'RE2');
    expect(report.checks.find((c) => c.id === 'logs-header')?.passed).toBe(false);
  });
});

describe('verifyChecksums', () => {
  it('passes when every anchor matches', () => {
    const files = openrcaFiles();
    const anchors = Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha256(c)]));
    const report = verifyChecksums(files, anchors);
    expect(report.passed).toBe(true);
    expect(report.matched).toBe(Object.keys(files).length);
    expect(report.mismatched).toEqual([]);
    expect(report.missing).toEqual([]);
  });

  it('reports mismatched, missing and extra files', () => {
    const files = openrcaFiles();
    const anchors: Record<string, string> = {
      'some/file.csv': sha256('x'),
      'order-prod/query.csv': 'deadbeef',
    };
    const report = verifyChecksums(files, anchors);
    expect(report.passed).toBe(false);
    expect(report.mismatched).toContain('order-prod/query.csv');
    expect(report.missing).toContain('some/file.csv');
    expect(report.extra.length).toBeGreaterThan(0);
  });
});

describe('scoreExport', () => {
  it('scores 100 for a fully valid export with matching anchors', () => {
    const files = openrcaFiles();
    const anchors = Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha256(c)]));
    const report = scoreExport('openrca-1.0', files, anchors);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('scores lower when the structure fails', () => {
    const files = openrcaFiles();
    delete files['order-prod/record.csv'];
    const report = scoreExport('openrca-1.0', files);
    expect(report.passed).toBe(false);
    expect(report.score).toBeLessThan(100);
  });

  it('scores lower when a checksum mismatches', () => {
    const files = openrcaFiles();
    const anchors = Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha256(c)]));
    anchors['order-prod/query.csv'] = 'deadbeef';
    const report = scoreExport('openrca-1.0', files, anchors);
    expect(report.passed).toBe(false);
    expect(report.score).toBeLessThan(100);
  });

  it('scores 100 for a valid RCAEval export without anchors', () => {
    const files = exportRcaEval(validBundle(), 'RE2').files;
    const report = scoreExport('rcaeval-re2', files);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('scores 100 for a valid RE1 export', () => {
    const files = exportRcaEval(validBundle(), 'RE1').files;
    const report = scoreExport('rcaeval-re1', files);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('scores 100 for a valid RE3 export of a code-level fault', () => {
    const bundle = validBundle({ cases: [validBundle().cases[0]!] });
    bundle.cases[0]!.fault.category = 'code';
    const files = exportRcaEval(bundle, 'RE3').files;
    const report = scoreExport('rcaeval-re3', files);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('throws for an unknown target (programmer error)', () => {
    expect(() => scoreExport('unknown' as never, {})).toThrow(/target/i);
  });
});
