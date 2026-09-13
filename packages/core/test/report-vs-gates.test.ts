import { describe, expect, it } from 'vitest';
import { renderGates, renderPage, renderScore } from '../src/report/html.js';
import type { QualityGateReport } from '../src/ir/types.js';
import type { ScoreReport } from '../src/score/score.js';

/**
 * The report page must not contradict itself.
 *
 * The page carries two verdicts produced by two different measurements:
 *
 *   - the quality gates decide whether the dataset is *admissible*, which
 *     includes whether any baseline solver can locate the root cause; and
 *   - the score decides whether the exported *bytes honour the field contract*.
 *
 * Both can be reported for the same export, and they can disagree: an export
 * can honour every column, every header and the answer-key isolation rule while
 * describing a case no baseline can solve. That is not a bug in either
 * measurement -- it is a difference in what each measures.
 *
 * What is a bug is rendering "quarantined" and "score 100" next to each other
 * with no statement of scope, and painting the score green. A reader cannot
 * tell whether the dataset is usable, and green is an assertion the page has no
 * basis for while the gates have not admitted it.
 */

const quarantined = (): QualityGateReport => ({
  caseId: 'case-001',
  irVersion: '2.0',
  gateRunId: 'run-1',
  runAt: '2026-09-09T00:00:00.000Z',
  results: [
    { gateId: 'G1', status: 'passed', violations: [] },
    { gateId: 'G4', status: 'failed', violations: [{ code: 'UNSOLVABLE_CASE', message: 'only 0 baseline(s) locate the root cause within top-K', fieldPath: 'case-001' }] },
  ],
  finalStatus: 'quarantined',
});

const contractPerfect = (): ScoreReport => ({
  target: 'openrca-1.0',
  passed: true,
  score: 100,
  structure: {
    target: 'openrca-1.0',
    passed: true,
    checks: [{ id: 'row-alignment', passed: true, detail: 'groundtruth rows=1 record rows=1' }],
  },
});

describe('the score states what it measures', () => {
  it('names the field contract as the thing being scored', () => {
    const html = renderScore(contractPerfect());
    // Without this, "score 100" reads as "this dataset is good", which the
    // scorer never claimed: it only inspected the exported bytes.
    expect(html).toContain('field contract');
  });

  it('still reports the number itself', () => {
    const html = renderScore(contractPerfect());
    expect(html).toContain('100');
  });
});

describe('the gates state what they decide', () => {
  it('names admissibility rather than leaving the reader to infer it', () => {
    const html = renderGates(quarantined());
    expect(html).toContain('admissib');
  });

  it('still reports the final status', () => {
    const html = renderGates(quarantined());
    expect(html).toContain('quarantined');
  });
});

describe('the page does not paint a passing score green over a blocked dataset', () => {
  it('withholds the ok class from the score when the gates are not admitted', () => {
    const html = renderPage({
      title: 'Report',
      gates: [quarantined()],
      scores: [contractPerfect()],
    });

    // The score element must not claim success while the dataset is held back.
    expect(html).not.toContain('score <span class="ok">100');
    expect(html).toContain('100');
  });

  it('keeps the ok class when the gates admitted the dataset', () => {
    const admitted: QualityGateReport = { ...quarantined(), finalStatus: 'admitted', results: [{ gateId: 'G1', status: 'passed', violations: [] }] };
    const html = renderPage({
      title: 'Report',
      gates: [admitted],
      scores: [contractPerfect()],
    });

    expect(html).toContain('score <span class="ok">100');
  });

  it('explains why the score is held back', () => {
    const html = renderPage({
      title: 'Report',
      gates: [quarantined()],
      scores: [contractPerfect()],
    });

    // A number shown in a muted colour with no reason invites the reader to
    // assume a rendering bug. The reason has to be on the page.
    expect(html).toContain('not admitted');
  });

  it('leaves a standalone score alone when no gates are rendered', () => {
    // renderPage is also used for score-only pages. With no gate verdict to
    // contradict, the score stands on its own and is painted normally.
    const html = renderPage({ title: 'Report', scores: [contractPerfect()] });
    expect(html).toContain('score <span class="ok">100');
  });

  it('uses the worst gate verdict when several are rendered', () => {
    const admitted: QualityGateReport = { ...quarantined(), finalStatus: 'admitted', results: [{ gateId: 'G1', status: 'passed', violations: [] }] };
    const html = renderPage({
      title: 'Report',
      gates: [admitted, quarantined()],
      scores: [contractPerfect()],
    });

    // One quarantined bundle is enough to hold the score back; averaging or
    // taking the first would let a bad dataset through because a good one
    // happened to be rendered first.
    expect(html).not.toContain('score <span class="ok">100');
  });

  it('treats a rejected dataset as not admitted', () => {
    const rejected: QualityGateReport = { ...quarantined(), finalStatus: 'rejected' };
    const html = renderPage({
      title: 'Report',
      gates: [rejected],
      scores: [contractPerfect()],
    });

    expect(html).not.toContain('score <span class="ok">100');
  });

  it('ranks rejected above quarantined, so the harsher verdict governs', () => {
    const rejected: QualityGateReport = { ...quarantined(), finalStatus: 'rejected' };
    const html = renderPage({
      title: 'Report',
      gates: [quarantined(), rejected],
      scores: [contractPerfect()],
    });

    // Both are non-admitted, so the score is withheld either way; what matters
    // is that the holdback names the harsher one rather than whichever came
    // first. Reversing the order must not change the answer.
    expect(html).toContain('Held back: the gates report <b>rejected</b>');

    const reversed = renderPage({
      title: 'Report',
      gates: [rejected, quarantined()],
      scores: [contractPerfect()],
    });
    expect(reversed).toContain('Held back: the gates report <b>rejected</b>');
  });

  it('names the gate verdict that held the score back', () => {
    const html = renderPage({
      title: 'Report',
      gates: [quarantined()],
      scores: [contractPerfect()],
    });

    expect(html).toContain('quarantined');
  });
});

describe('renderPage structure', () => {
  it('renders an empty placeholder when no section is present', () => {
    const html = renderPage({ title: 'Report' });
    expect(html).toContain('No report sections.');
  });

  it('escapes a hostile title in both the head and the heading', () => {
    const html = renderPage({ title: '<img src=x onerror=y>' });
    expect(html).not.toContain('<img src=x');
    expect(html.match(/&lt;img src=x onerror=y&gt;/g)).toHaveLength(2);
  });

  it('renders one section per gates report and one per score report', () => {
    const admitted: QualityGateReport = { ...quarantined(), finalStatus: 'admitted' };
    const html = renderPage({
      title: 'Report',
      gates: [admitted, admitted],
      scores: [contractPerfect(), contractPerfect()],
    });

    expect(html.match(/<h2>Quality gates<\/h2>/g)).toHaveLength(2);
    expect(html.match(/<h2>Score<\/h2>/g)).toHaveLength(2);
  });
});
