import type { CoverageReport, TargetFeasibility } from '../coverage.js';
import type { QualityGateReport, SignalKind } from '../ir/types.js';
import type { ScoreReport, ScoreCheck, StructureReport } from '../score/score.js';

/**
 * Static HTML report renderer.
 *
 * This module turns the existing quantitative reports - observability coverage,
 * quality gates and scoring - into a self-contained, readable HTML page. It is
 * deliberately IO-free and dependency-free: every render function takes a typed
 * report object and returns a string, so the whole renderer is pure and fully
 * testable.
 *
 * Every piece of user-controlled data (case ids, violation messages, check
 * details, the page title) passes through `escapeHtml` before being interpolated,
 * so a hostile message or title can never inject markup.
 */

const SIGNAL_KINDS: readonly SignalKind[] = ['metric', 'log', 'trace', 'event', 'alert', 'profile'];

/** Escape the five HTML-significant characters. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Map a report status onto a semantic CSS class. */
function statusClass(status: string): string {
  if (status === 'ready' || status === 'passed' || status === 'admitted') return 'ok';
  if (status === 'degraded' || status === 'quarantined') return 'warn';
  return 'bad';
}

function table(headers: string[], rows: string[]): string {
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.length > 0 ? rows.join('') : `<tr class="empty"><td colspan="${headers.length}">—</td></tr>`;
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function coverageRow(kind: SignalKind, coverage: number): string {
  return `<tr><td>${kind}</td><td>${(coverage * 100).toFixed(1)}%</td></tr>`;
}

function feasibilityRow(f: TargetFeasibility): string {
  const loss = f.estimatedCaseLoss > 0 ? ` (loss ~${(f.estimatedCaseLoss * 100).toFixed(1)}%)` : '';
  const missing = f.missingSignals.length > 0 ? f.missingSignals.join(', ') : '—';
  return `<tr class="${statusClass(f.status)}"><td>${f.target}</td><td>${f.status}</td><td>${missing}</td><td>${loss}</td></tr>`;
}

/** Render an observability coverage report as an HTML fragment. */
export function renderCoverage(report: CoverageReport): string {
  const rows = SIGNAL_KINDS.map((k) => coverageRow(k, report.coverage[k]));
  const feasibility = report.feasibility.map(feasibilityRow);
  return [
    '<section><h2>Observability coverage</h2>',
    '<h3>Per-modality</h3>',
    table(['Modality', 'Coverage'], rows),
    '<h3>Evaluability by target</h3>',
    table(['Target', 'Status', 'Missing signals', 'Estimated loss'], feasibility),
    '</section>',
  ].join('\n');
}

function violationText(v: { code: string; fieldPath?: string }): string {
  return v.fieldPath !== undefined ? `${v.code} @ ${v.fieldPath}` : v.code;
}

/** Render a quality-gate report as an HTML fragment. */
export function renderGates(report: QualityGateReport): string {
  const rows = report.results.map((g) => {
    const violations =
      g.violations.length > 0
        ? g.violations.map((v) => `<li>${escapeHtml(violationText(v))}</li>`).join('')
        : '';
    const detail = violations !== '' ? `<ul>${violations}</ul>` : '—';
    return `<tr class="${statusClass(g.status)}"><td>${g.gateId}</td><td>${g.status}</td><td>${detail}</td></tr>`;
  });
  const mutation = report.mutationTestPassed === true ? ' (mutation suite passed)' : '';
  return [
    '<section><h2>Quality gates</h2>',
    `<p>case <b>${escapeHtml(report.caseId)}</b> — final: <span class="${statusClass(report.finalStatus)}">${report.finalStatus}</span>${mutation}</p>`,
    table(['Gate', 'Status', 'Violations'], rows),
    '</section>',
  ].join('\n');
}

function checkRow(c: ScoreCheck): string {
  return `<tr class="${c.passed ? 'ok' : 'bad'}"><td>${escapeHtml(c.id)}</td><td>${c.passed ? 'pass' : 'fail'}</td><td>${escapeHtml(c.detail)}</td></tr>`;
}

function structureRows(s: StructureReport): string[] {
  return s.checks.map(checkRow);
}

/** Render a score report as an HTML fragment. */
export function renderScore(report: ScoreReport): string {
  const checksum = report.checksum;
  const checksumBlock =
    checksum === undefined
      ? ''
      : `<p>checksum: <span class="${checksum.passed ? 'ok' : 'bad'}">${checksum.passed ? 'pass' : 'fail'}</span>`
        + ` (matched ${checksum.matched}, mismatched ${checksum.mismatched.length}, missing ${checksum.missing.length}, extra ${checksum.extra.length})</p>`;
  return [
    '<section><h2>Score</h2>',
    `<p>target <b>${escapeHtml(report.target)}</b> — score <span class="${report.passed ? 'ok' : 'bad'}">${report.score}</span></p>`,
    checksumBlock,
    '<h3>Structure checks</h3>',
    table(['Check', 'Result', 'Detail'], structureRows(report.structure)),
    '</section>',
  ].join('\n');
}

export interface HtmlReportInput {
  title: string;
  coverage?: CoverageReport;
  gates?: QualityGateReport[];
  scores?: ScoreReport[];
}

const STYLE =
  'body{font-family:system-ui,sans-serif;margin:2rem;color:#1a1a1a}'
  + 'table{border-collapse:collapse;margin:0.5rem 0 1.5rem;width:100%}'
  + 'th,td{border:1px solid #ddd;padding:0.4rem 0.6rem;text-align:left}'
  + 'th{background:#f4f4f4}'
  + '.ok{color:#0a7d33}.warn{color:#b36b00}.bad{color:#c0392b}'
  + '.empty{color:#999;font-style:italic}'
  + 'h1{border-bottom:2px solid #eee;padding-bottom:0.5rem}';

/**
 * Render a full self-contained HTML page from one or more reports. Empty sections
 * are omitted; a page with no sections renders an explicit empty placeholder.
 */
export function renderPage(input: HtmlReportInput): string {
  const sections: string[] = [];
  if (input.coverage !== undefined) sections.push(renderCoverage(input.coverage));
  if (input.gates !== undefined) for (const g of input.gates) sections.push(renderGates(g));
  if (input.scores !== undefined) for (const s of input.scores) sections.push(renderScore(s));

  const body = sections.length > 0 ? sections.join('\n') : '<p class="empty">No report sections.</p>';
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(input.title)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    `<h1>${escapeHtml(input.title)}</h1>`,
    body,
    '</body>',
    '</html>',
  ].join('\n');
}
