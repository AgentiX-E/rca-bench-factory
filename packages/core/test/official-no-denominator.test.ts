import { describe, expect, it } from 'vitest';
import { scoreOfficial } from '../src/score/official.js';
import { exportAioPs2025 } from '../src/export/aiops2025.js';
import { validBundle } from './fixtures.js';

/**
 * No cases, no score.
 *
 * An empty export is a failed export, and `runOfficialRegression` says so -- but
 * `scoreOfficial` is the path the CLI actually runs, and it answered 10 for an
 * AIOps2025 export with nothing in it while every other target answered 0.
 *
 * The tenth point came from Explainability: `et === 0 ? 1 : em / et` awarded the
 * full term when the export declared no evidence points, so "nothing to
 * explain" was scored as "explained perfectly". Every other term in that
 * formula already answers 0 with an empty denominator -- `la`, `ta` and `eff`
 * all do -- which is what made this one stand out rather than being a
 * deliberate convention.
 */

describe('an empty export scores zero on every target', () => {
  it('scores an empty AIOps2025 export zero, not ten', () => {
    const report = scoreOfficial('aiops2025', {});
    expect(report.caseCount).toBe(0);
    expect(report.final).toBe(0);
    expect(report.breakdown.explainability).toBe(0);
  });

  it('keeps a real AIOps2025 export at 100', () => {
    // The fix must not cost the target its oracle, so the export that carries
    // evidence points still scores full marks.
    const report = scoreOfficial('aiops2025', exportAioPs2025(validBundle()).files);
    expect(report.caseCount).toBeGreaterThan(0);
    expect(report.final).toBe(100);
  });

  it('still credits explainability when the export declares evidence', () => {
    // The opposite direction, so the guard cannot pass by answering 0 always.
    const files = exportAioPs2025(validBundle()).files;
    const report = scoreOfficial('aiops2025', files);
    expect(report.breakdown.evidencePoints).toBeGreaterThan(0);
    expect(report.breakdown.explainability).toBe(1);
  });
});
