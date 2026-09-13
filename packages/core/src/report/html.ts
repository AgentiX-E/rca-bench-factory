import { findAmbiguousAliases, findDanglingEdgeRefs, findInvalidRelations } from '../entity/graph.js';
import type { ReferenceIssue } from '../entity/graph.js';
import type { CoverageReport, TargetFeasibility } from '../coverage.js';
import type { Entity, EntityEdge, EntityGraph, QualityGateReport, SignalKind } from '../ir/types.js';
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
    // The gates and the score answer different questions, and a page that
    // shows both without saying so reads as self-contradictory when they
    // disagree. Stating the scope is what makes the two numbers compatible.
    '<p class="scope">Decides <b>admissibility</b>: whether this dataset may be '
      + 'published and evaluated at all — correctness of the labels, solvability by a '
      + 'baseline solver, answer-key isolation.</p>',
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

/**
 * Render a score report as an HTML fragment.
 *
 * `gateVerdict` is the gate status this score is reported alongside, when there
 * is one. A score of 100 over a quarantined dataset is not a contradiction --
 * the score inspects the exported bytes against the field contract, and the
 * gates decide whether the dataset may be used at all -- but painting it green
 * while the gates hold the dataset back asserts a conclusion nobody reached.
 * When the dataset is not admitted the number is still reported, in the muted
 * class, with the reason stated.
 */
export function renderScore(report: ScoreReport, gateVerdict?: string): string {
  const checksum = report.checksum;
  const checksumBlock =
    checksum === undefined
      ? ''
      : `<p>checksum: <span class="${checksum.passed ? 'ok' : 'bad'}">${checksum.passed ? 'pass' : 'fail'}</span>`
        + ` (matched ${checksum.matched}, mismatched ${checksum.mismatched.length}, missing ${checksum.missing.length}, extra ${checksum.extra.length})</p>`;

  const admitted = gateVerdict === undefined || gateVerdict === 'admitted';
  const scoreClass = !report.passed ? 'bad' : admitted ? 'ok' : 'warn';
  const holdback = admitted
    ? ''
    : `<p class="warn">Held back: the gates report <b>${escapeHtml(gateVerdict)}</b>, so this dataset is not `
      + 'admitted for use however well its fields comply.</p>';

  return [
    '<section><h2>Score</h2>',
    `<p>target <b>${escapeHtml(report.target)}</b> — score <span class="${scoreClass}">${report.score}</span></p>`,
    // Without this the number reads as a verdict on the dataset rather than on
    // the bytes, which is what let "quarantined" and "100" look incompatible.
    '<p class="scope">Scores the <b>field contract</b> of the exported bytes: file '
      + 'layout, column headers, answer-key isolation and modality coverage. It does '
      + 'not judge whether the labels are right — that is the gates\' question.</p>',
    holdback,
    checksumBlock,
    '<h3>Structure checks</h3>',
    table(['Check', 'Result', 'Detail'], structureRows(report.structure)),
    '</section>',
  ].join('\n');
}

function entityRow(e: Entity): string {
  const ns = e.namespace ?? '—';
  const aliases = e.aliases.length > 0 ? e.aliases.map(escapeHtml).join(', ') : '—';
  return `<tr><td>${escapeHtml(e.entityId)}</td><td>${e.kind}</td><td>${escapeHtml(e.name)}</td><td>${escapeHtml(ns)}</td><td>${aliases}</td></tr>`;
}

function edgeRow(edge: EntityEdge): string {
  return `<tr><td>${escapeHtml(edge.from)}</td><td>${edge.relation}</td><td>${escapeHtml(edge.to)}</td></tr>`;
}

function issueItems(issues: ReferenceIssue[]): string {
  return issues.map((i) => `<li>${escapeHtml(i.where)}: ${escapeHtml(i.ref)} (${i.reason})</li>`).join('');
}

/**
 * Render an entity graph as an HTML fragment: the entity table, the edge table
 * and the reference-integrity verdict (dangling edge refs, ambiguous aliases,
 * invalid relations) — the single most important IR invariant, surfaced visually.
 */
export function renderEntityGraph(graph: EntityGraph): string {
  const dangling = findDanglingEdgeRefs(graph);
  const ambiguous = findAmbiguousAliases(graph);
  const invalid = findInvalidRelations(graph);

  const ambiguousItems = ambiguous
    .map((a) => `<li>ambiguous alias '${escapeHtml(a.alias)}' owned by ${a.owners.map(escapeHtml).join(', ')}</li>`)
    .join('');
  const items = issueItems(dangling) + issueItems(invalid) + ambiguousItems;
  const integrityBlock =
    items === ''
      ? '<p class="ok">Reference integrity: OK</p>'
      : `<p class="bad">Reference integrity issues:</p><ul>${items}</ul>`;

  return [
    '<section><h2>Entity graph</h2>',
    `<p>${graph.entities.length} entities, ${graph.edges.length} edges</p>`,
    integrityBlock,
    '<h3>Entities</h3>',
    table(['Entity id', 'Kind', 'Name', 'Namespace', 'Aliases'], graph.entities.map(entityRow)),
    '<h3>Edges</h3>',
    table(['From', 'Relation', 'To'], graph.edges.map(edgeRow)),
    '</section>',
  ].join('\n');
}

export interface HtmlReportInput {
  title: string;
  coverage?: CoverageReport;
  entityGraph?: EntityGraph;
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
  + '.scope{color:#555;font-size:0.9rem}'
  + 'h1{border-bottom:2px solid #eee;padding-bottom:0.5rem}';

/**
 * The gate status that governs the whole page.
 *
 * Worst-wins, not first-wins: one quarantined bundle is enough to hold the
 * dataset back, so a page that rendered a passing bundle first must not present
 * the score as though nothing was wrong.
 */
function governingVerdict(gates: readonly QualityGateReport[]): string | undefined {
  if (gates.length === 0) return undefined;
  const rank = (status: string): number => (status === 'admitted' ? 0 : status === 'quarantined' ? 1 : 2);
  return gates
    .map((g) => g.finalStatus)
    .reduce((worst, status) => (rank(status) > rank(worst) ? status : worst));
}

/**
 * Render a full self-contained HTML page from one or more reports. Empty sections
 * are omitted; a page with no sections renders an explicit empty placeholder.
 *
 * The score section is told the page's governing gate verdict, so a dataset the
 * gates held back cannot be presented with a green score. See `renderScore`.
 */
export function renderPage(input: HtmlReportInput): string {
  const sections: string[] = [];
  if (input.coverage !== undefined) sections.push(renderCoverage(input.coverage));
  if (input.entityGraph !== undefined) sections.push(renderEntityGraph(input.entityGraph));
  if (input.gates !== undefined) for (const g of input.gates) sections.push(renderGates(g));
  if (input.scores !== undefined) {
    const verdict = governingVerdict(input.gates ?? []);
    for (const s of input.scores) sections.push(renderScore(s, verdict));
  }

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
