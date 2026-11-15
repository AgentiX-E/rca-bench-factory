import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The coverage table's four figures, against the report that computed them.
 *
 * ## The defect this file is the proof of
 *
 * `docs/progress.md` publishes the four-dimension reading under a sentence beginning
 * "Measured by `vitest run --coverage`", and every round copies it into a `### Readings`
 * ledger. `check-doc-counts` holds the *suite* counts to a run and `derive-gate-sites`
 * holds the gate-site count to a derivation; nothing held these four to anything. So the
 * page published **99.93** branches for at least eight rounds while every ledger read
 * 99.80 (finding 481), and when the figures were finally retaken two instruments
 * answered differently -- clover's XML said 99.980, v8's counters said 99.97 -- and the
 * prose did not say which one it meant (finding 539).
 *
 * A reader that computes the number is what both findings were missing. The instrument
 * is named in its output rather than left to the sentence above the table, because the
 * sentence is the thing that was ambiguous.
 *
 * ## Why the fixtures are files
 *
 * The report's shape is vitest's, not this repository's -- `total.statements.pct` and
 * three siblings -- so a fixture that mirrored an in-memory interface would pass while
 * the real report had moved. These tests write the JSON a report has and drive the
 * script the way CI does.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '../../../scripts/check-coverage-readings.mjs');

/**
 * The script this file drives, declared as well as spawned.
 *
 * `gate-sites-are-proven.test.ts` reconciles the two signals in both directions: a
 * `spawnSync` the file does not admit to is a proof nobody can find from the
 * inventory, and a path spelled only in a comment proves nothing. The declaration is
 * how the claim in `golden-master/gate-sites.json` points at this file.
 */
const DRIVES = ['scripts/check-coverage-readings.mjs'];

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-readings-'));
  dirs.push(dir);
  return dir;
}

/** A `progress.md` carrying the table in the shape the real page carries it. */
function page(rows: readonly string[]): string {
  return [
    '# Progress',
    '',
    '## Coverage',
    '',
    'Prose above the table is not read by this guard.',
    '',
    '| Dimension | Result | Gate |',
    '| --- | --- | --- |',
    ...rows,
    '',
    '## Next',
    '',
  ].join('\n');
}

const FOUR = [
  '| Statements | 99.97% | ≥ 95% |',
  '| Branches | 99.95% | ≥ 95% |',
  '| Functions | 100% | ≥ 95% |',
  '| Lines | 99.97% | ≥ 95% |',
];

/** A coverage summary in the shape `vitest --coverage --coverage.reporter=json-summary` writes. */
function report(overrides: Record<string, number> = {}): string {
  const pct = {
    statements: 99.97,
    branches: 99.95,
    functions: 100,
    lines: 99.97,
    ...overrides,
  };
  const dimension = (name: keyof typeof pct) => ({
    total: 1000,
    covered: Math.round((pct[name] / 100) * 1000),
    skipped: 0,
    pct: pct[name],
  });
  return `${JSON.stringify(
    {
      total: {
        lines: dimension('lines'),
        statements: dimension('statements'),
        functions: dimension('functions'),
        branches: dimension('branches'),
        branchesTrue: { total: 0, covered: 0, skipped: 0, pct: -1 },
      },
      'src/index.ts': {
        lines: dimension('lines'),
        statements: dimension('statements'),
        functions: dimension('functions'),
        branches: dimension('branches'),
        branchesTrue: { total: 0, covered: 0, skipped: 0, pct: -1 },
      },
    },
    null,
    2,
  )}\n`;
}

function run(...argv: string[]): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...argv], { encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe('check-coverage-readings · the guard', { timeout: 30_000 }, () => {
  it('says the table equals the v8 counters, and names the instrument', () => {
    const dir = scratch();
    const doc = join(dir, 'progress.md');
    const summary = join(dir, 'coverage-summary.json');
    writeFileSync(doc, page(FOUR));
    writeFileSync(summary, report());

    const { status, out } = run('--doc', doc, '--report', summary);
    expect(out).toContain('check-coverage-readings: OK (4 dimension(s) equal to the v8 counters in');
    expect(out).toContain(summary);
    expect(out).toContain('statements 99.97%, branches 99.95%, functions 100%, lines 99.97%');
    expect(status).toBe(0);
  });

  it('names the dimension, both numbers and the instrument when the page is stale', () => {
    const dir = scratch();
    const doc = join(dir, 'progress.md');
    const summary = join(dir, 'coverage-summary.json');
    writeFileSync(
      doc,
      page(['| Statements | 99.93% | ≥ 95% |', ...FOUR.slice(1)]),
    );
    writeFileSync(summary, report());

    const { status, out } = run('--doc', doc, '--report', summary);
    expect(out).toContain("the page says Statements 99.93% and the report says 99.97%");
    expect(out).toContain('v8 counters');
    expect(status).toBe(1);
  });

  it('refuses a page that carries no table, rather than passing on nothing', () => {
    const dir = scratch();
    const doc = join(dir, 'progress.md');
    const summary = join(dir, 'coverage-summary.json');
    writeFileSync(doc, '# Progress\n\n## Coverage\n\nNo table here.\n');
    writeFileSync(summary, report());

    const { status, out } = run('--doc', doc, '--report', summary);
    expect(out).toContain('no | Dimension | Result | Gate | table under ## Coverage');
    expect(status).toBe(1);
  });

  it('refuses a table missing one of the four dimensions', () => {
    const dir = scratch();
    const doc = join(dir, 'progress.md');
    const summary = join(dir, 'coverage-summary.json');
    writeFileSync(doc, page(FOUR.slice(0, 3)));
    writeFileSync(summary, report());

    const { status, out } = run('--doc', doc, '--report', summary);
    expect(out).toContain("the table has no 'Lines' row");
    expect(out).toContain('four dimensions are published, and a missing row is a figure nobody compares');
    expect(status).toBe(1);
  });

  it('refuses a table that publishes the same dimension twice', () => {
    const dir = scratch();
    const doc = join(dir, 'progress.md');
    const summary = join(dir, 'coverage-summary.json');
    writeFileSync(doc, page([...FOUR, '| Statements | 99.97% | ≥ 95% |']));
    writeFileSync(summary, report());

    const { status, out } = run('--doc', doc, '--report', summary);
    expect(out).toContain("'Statements' is published twice");
    expect(status).toBe(1);
  });

  it('refuses a report that does not carry one of the four totals', () => {
    const dir = scratch();
    const doc = join(dir, 'progress.md');
    const summary = join(dir, 'coverage-summary.json');
    writeFileSync(doc, page(FOUR));
    const parsed = JSON.parse(report()) as { total: Record<string, unknown> };
    delete parsed.total['lines'];
    writeFileSync(summary, JSON.stringify(parsed));

    const { status, out } = run('--doc', doc, '--report', summary);
    expect(out).toContain("the report has no total.lines.pct");
    expect(status).toBe(1);
  });

  it('says the figures are unchecked when no report was written, and passes', () => {
    // `docs:check` does not run the suite, so on a cold tree there is no report. The
    // honest sentence is that the table is unchecked *in this run* -- not that it is
    // right, and not that it is wrong.
    const dir = scratch();
    const doc = join(dir, 'progress.md');
    writeFileSync(doc, page(FOUR));

    const { status, out } = run('--doc', doc, '--report', join(dir, 'absent.json'));
    expect(out).toContain('check-coverage-readings: UNCHECKED (no coverage report at');
    expect(out).toContain('run `pnpm test:coverage` to produce one');
    expect(status).toBe(0);
  });

  it('refuses a missing report where one is required', () => {
    const dir = scratch();
    const doc = join(dir, 'progress.md');
    writeFileSync(doc, page(FOUR));

    const { status, out } = run('--doc', doc, '--report', join(dir, 'absent.json'), '--require');
    expect(out).toContain('--require was given and there is no report');
    expect(status).toBe(1);
  });
});
