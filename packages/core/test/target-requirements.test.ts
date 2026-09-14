import { describe, expect, it } from 'vitest';
import { SCORE_TARGET_IDS, scoreExport } from '../src/score/score.js';
import { TARGET_REQUIREMENTS, computeCoverage } from '../src/coverage.js';
import {
  exportAioPs2025,
  exportCloudOpsBench,
  exportItBench,
  exportOpenRca,
  exportOpenRca2,
  exportRca100,
  exportRcaEval,
} from '../src/index.js';
import type { ScoreTargetId } from '../src/score/score.js';
import { validBundle } from './fixtures.js';

/**
 * One target list, nine entries, no target left behind.
 *
 * The coverage report is what tells an operator "this dataset cannot be
 * evaluated for target T" before a single byte is exported, and it used to
 * enumerate its own six targets - a hand-written list that had already drifted
 * from the nine `SCORE_TARGET_IDS` the rest of the product uses. `openrca-2.0`,
 * `rcaeval-re3` and `itbench` were silently absent, so three of the nine
 * products could not be reported on at all.
 *
 * A list that must be kept in step with another list cannot be trusted to stay
 * in step. Every expectation here is derived from `SCORE_TARGET_IDS`, so the
 * only list that exists is the one the product uses.
 */

/** Every exporter the CLI can dispatch to, keyed by the target it serves. */
const EXPORTERS: Record<ScoreTargetId, (b: ReturnType<typeof validBundle>) => { files: Record<string, string> }> = {
  'openrca-1.0': (b) => exportOpenRca(b),
  'openrca-2.0': (b) => exportOpenRca2(b),
  'rcaeval-re1': (b) => exportRcaEval(b, 'RE1'),
  'rcaeval-re2': (b) => exportRcaEval(b, 'RE2'),
  'rcaeval-re3': (b) => exportRcaEval(b, 'RE3'),
  rca100: (b) => exportRca100(b),
  aiops2025: (b) => exportAioPs2025(b),
  'cloud-opsbench': (b) => exportCloudOpsBench(b),
  itbench: (b) => exportItBench(b),
};

describe('the coverage report covers every score target', () => {
  it('reports one feasibility entry per score target, in the product order', () => {
    // Derived, not hard-coded: a literal `9` here would be a third list to keep
    // in step, and keeping lists in step is exactly what failed.
    const report = computeCoverage(validBundle());
    expect(report.feasibility.map((f) => f.target)).toEqual([...SCORE_TARGET_IDS]);
  });

  it('declares a requirement for every target the scorer can score', () => {
    for (const target of SCORE_TARGET_IDS) {
      expect(TARGET_REQUIREMENTS[target], `${target} declares no requirement`).toBeDefined();
      expect(TARGET_REQUIREMENTS[target]!.length).toBeGreaterThan(0);
    }
  });

  it('declares no requirement for a name that is not a score target', () => {
    // The other direction. An extra row is as wrong as a missing one, and
    // `Record<ScoreTargetId, …>` cannot express "these are the only keys" at
    // runtime - so it is measured rather than assumed.
    expect(Object.keys(TARGET_REQUIREMENTS).sort()).toEqual([...SCORE_TARGET_IDS].sort());
  });

  it.each([
    ['openrca-2.0', ['metric', 'trace']],
    ['rcaeval-re3', ['metric', 'log', 'trace']],
    ['itbench', ['metric', 'log', 'trace']],
  ] as const)('includes the target that used to be missing: %s', (target, required) => {
    expect(TARGET_REQUIREMENTS[target]).toEqual(required);
  });

  it('iterates the product list rather than its own keys', () => {
    // Today the two sets are equal, so this cannot be caught by counting alone.
    // It is pinned because the equality is a coincidence of the table being
    // complete, and completeness is exactly what failed before: the moment a row
    // is missing, iterating the table's own keys silently shortens the report
    // instead of failing. `SCORE_TARGET_IDS` has a fixed length, so the report's
    // length is anchored to the product, not to whichever rows happen to exist.
    const longThenShort = computeCoverage(validBundle()).feasibility;
    expect(longThenShort.map((f) => f.target)).toEqual([...SCORE_TARGET_IDS]);
    // Both ends named: the first target proves the order, the last proves nothing
    // was appended after the product list ran out.
    expect(longThenShort[0]!.target).toBe('openrca-1.0');
    expect(longThenShort.at(-1)!.target).toBe(SCORE_TARGET_IDS.at(-1));
    expect(longThenShort).toHaveLength(SCORE_TARGET_IDS.length);
  });

  it('resolves every declared requirement through the structural gate', () => {
    // `g1OptionsForTarget` is the other consumer of "what does this target
    // need", and it is keyed by the same type. Every target must have an entry,
    // or the gate would read `undefined` and demand nothing.
    const bundle = validBundle();
    for (const target of SCORE_TARGET_IDS) {
      expect(TARGET_REQUIREMENTS[target], `${target} missing from the gate`).toBeDefined();
      expect(exportedFiles(target, bundle)).toBeDefined();
    }
  });
});

function exportedFiles(target: ScoreTargetId, bundle: ReturnType<typeof validBundle>): Record<string, string> {
  return EXPORTERS[target](bundle).files;
}

describe('a requirement describes the dataset, not the exporter output', () => {
  /**
   * The modality a target needs cannot be read off the bytes it emits.
   *
   * Measured: strip any single modality from a bundle and re-score, and **all
   * nine targets score identically** - `cloud-opsbench` included, whose export
   * is `metadata.json` alone. So the structural score is not the place a
   * requirement could be derived from, and `['metric']` would have been a
   * narrowing invented from an artefact that was never the subject of the
   * question. What the benchmark's own layout carries is the evidence.
   */
  const withoutKind = (kind: string) => {
    const base = validBundle();
    return validBundle({
      signals: { 'case-001': (base.signals['case-001'] ?? []).filter((s) => s.signal !== kind) },
    });
  };

  it.each(SCORE_TARGET_IDS)('scores %s identically with any modality removed', (target) => {
    // Recorded as a known fact, not as a desired property: this is *why* the
    // coverage report exists as a separate measurement, and asserting it keeps
    // a future reader from trying to derive the requirement from the score.
    const bundle = validBundle();
    const base = scoreExport(target, exportedFiles(target, bundle));
    for (const kind of ['metric', 'log', 'trace', 'event', 'alert']) {
      const stripped = scoreExport(target, exportedFiles(target, withoutKind(kind)));
      expect(stripped.score).toBe(base.score);
    }
  });

  it('still separates targets that need different modalities', () => {
    // The score being modality-blind must not make the report modality-blind:
    // RE1 needs metrics only, so it is ready on a dataset where RCA100 is not.
    const report = computeCoverage(withoutKind('log'));
    const re1 = report.feasibility.find((f) => f.target === 'rcaeval-re1');
    const rca100 = report.feasibility.find((f) => f.target === 'rca100');
    expect(re1?.status).toBe('ready');
    expect(rca100?.status).toBe('degraded');
    expect(rca100?.missingSignals).toContain('log');
  });

  it('keeps the full Digital-Twin requirement for cloud-opsbench', () => {
    // The decision this iteration rested on: the exporter writes metadata only,
    // but the benchmark's layout carries metrics, logs and alerts, so an agent
    // evaluated on it needs all three. Narrowing this to `['metric']` would have
    // weakened the report to match an artefact nobody asked about.
    expect(TARGET_REQUIREMENTS['cloud-opsbench']).toEqual(['metric', 'log', 'trace']);
    const report = computeCoverage(withoutKind('log'));
    expect(report.feasibility.find((f) => f.target === 'cloud-opsbench')?.status).toBe('degraded');
  });
});
