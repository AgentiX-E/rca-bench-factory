import { describe, expect, it } from 'vitest';
import { renderPage, renderScore } from '../src/report/html.js';
import type { ExportScope, ScoredExport } from '../src/report/html.js';
import type { SkippedCase } from '../src/export/openrca.js';
import type { ScoreReport } from '../src/score/score.js';

/**
 * A score must state the population it was computed over.
 *
 * The score inspects bytes, and an exporter is allowed to drop a case it cannot
 * represent - RCAEval's RE3 suite admits code-level faults only, so a bundle of
 * one code fault and two resource faults exports one case for RE3 and scores
 * 100. Printed without a denominator that number is a silent fabrication: the
 * reader has no way to tell a perfect score over the whole benchmark from a
 * perfect score over a third of it.
 *
 * The scope rides on the report itself rather than sitting beside it, so a
 * second list that must be kept aligned by index cannot exist. `scored` is
 * *derived* from `total` and `skipped` instead of being passed in, so the two
 * cannot disagree and no guard is needed to keep them honest.
 */

const score = (overrides: Partial<ScoreReport> = {}): ScoreReport => ({
  target: 'rcaeval-re3',
  passed: true,
  score: 100,
  structure: {
    target: 'rcaeval-re3',
    passed: true,
    checks: [{ id: 'metrics-json', passed: true, detail: 'found 1 metrics.json' }],
  },
  ...overrides,
});

const scoped = (total: number, skipped: readonly SkippedCase[] = []): ScoredExport => ({
  ...score(),
  scope: { total, skipped },
});

describe('a score states how many cases it covers', () => {
  it('names the scored count and the bundle total when nothing was skipped', () => {
    // The denominator is stated on every page, not only when it is alarming:
    // showing it "only when something is wrong" is the silence being fixed.
    const html = renderScore(scoped(3));
    expect(html).toContain('3 of 3 case(s)');
  });

  it('names the scored count and the bundle total when cases were skipped', () => {
    const html = renderScore(scoped(3, [
      { caseId: 'case-002', reason: 'RE3 targets code-level faults only' },
      { caseId: 'case-003', reason: 'RE3 targets code-level faults only' },
    ]));
    expect(html).toContain('1 of 3 case(s)');
  });

  it('names every skipped case and the reason it was skipped', () => {
    const html = renderScore(scoped(2, [{ caseId: 'case-001', reason: 'RE3 targets code-level faults only' }]));
    expect(html).toContain('case-001');
    expect(html).toContain('RE3 targets code-level faults only');
  });

  it('omits the skipped-case list when every case was scored', () => {
    // A heading that is always rendered is a heading that says nothing, and it
    // would make "nothing was skipped" read like "nothing was reported".
    const html = renderScore(scoped(2));
    expect(html).not.toContain('not scored');
  });

  it('still renders the number itself', () => {
    // Regression guard: the scope must not displace the score, which is what
    // the page exists to report.
    expect(renderScore(scoped(3))).toMatch(/score <span class="\w+">100<\/span>/);
  });

  it('escapes a hostile case id and skip reason', () => {
    // Both are user-controlled data, and both reach the page only here.
    const html = renderScore(scoped(2, [{ caseId: '<script>x</script>', reason: '<img onerror=y>' }]));
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<img onerror=y>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img onerror=y&gt;');
  });
});

describe('renderPage carries the scope of every score', () => {
  it('renders a denominator for each score, not only the first', () => {
    // The page can carry several scores. A loop that scoped only one would be a
    // fix at one of two call sites, which is a fix at neither.
    const html = renderPage({
      title: 'Report',
      scores: [
        { ...score({ target: 'rcaeval-re3' }), scope: { total: 3, skipped: [{ caseId: 'case-002', reason: 'RE3 targets code-level faults only' }, { caseId: 'case-003', reason: 'RE3 targets code-level faults only' }] } },
        { ...score({ target: 'rca100' }), scope: { total: 3, skipped: [] } },
      ],
    });
    expect(html).toContain('1 of 3 case(s)');
    expect(html).toContain('3 of 3 case(s)');
  });

  it('renders the skipped cases of the score that lost them', () => {
    const html = renderPage({
      title: 'Report',
      scores: [{ ...score(), scope: { total: 2, skipped: [{ caseId: 'case-001', reason: 'no telemetry signals attached' }] } }],
    });
    expect(html).toContain('case-001');
    expect(html).toContain('no telemetry signals attached');
  });

  it('has no scope to state for a page with no scores', () => {
    const html = renderPage({ title: 'Report' });
    expect(html).not.toContain('case(s)');
  });
});

describe('the scope cannot contradict itself', () => {
  it('derives the scored count, so a caller cannot pass a count that disagrees', () => {
    // `ExportScope` has no `scored` field: it is `total - skipped.length`. A
    // writable field would be an arithmetic identity the renderer had to
    // re-check, and an unchecked one is not an invariant.
    const scope: ExportScope = { total: 5, skipped: [{ caseId: 'a', reason: 'b' }, { caseId: 'c', reason: 'd' }] };
    expect(renderScore({ ...score(), scope })).toContain('3 of 5 case(s)');
  });
});
