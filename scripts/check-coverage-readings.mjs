#!/usr/bin/env node
/**
 * Holds the coverage table in `docs/progress.md` to the report that computed it.
 *
 * ## The defect this exists for
 *
 * The page publishes four figures under a sentence beginning "Measured by
 * `vitest run --coverage`", and each round copies them into a `### Readings` ledger.
 * `check-doc-counts.mjs` holds the suite counts to a run and `derive-gate-sites.mjs`
 * holds the gate-site count to a derivation; **nothing held these four to anything**.
 * That is how the page came to publish **99.93** branches for at least eight rounds
 * while every ledger read 99.80 (finding 481) -- and when the figures were retaken,
 * two instruments answered differently: clover's XML said 99.980 and v8's counters
 * said 99.97, and the prose did not say which one it meant (finding 539).
 *
 * The repair is not a better table. It is a reader that computes the number, and an
 * output that names the instrument, because the sentence above the table is the thing
 * that was ambiguous.
 *
 * ## Why `UNCHECKED` is an exit code of its own
 *
 * `docs:check` does not run the suite -- it is the cheap gate, and running vitest
 * inside it would recurse (`check-doc-counts.mjs` documents the same constraint). So
 * on a cold tree there is no report, and the two dishonest answers are available:
 * pass silently (the table is unchecked, and nothing says so) or fail (the table may
 * be perfect). Neither is a measurement. The script therefore parses the table,
 * reports what it structurally refuses, and then says `UNCHECKED` in the one case
 * where the figures could not be compared.
 *
 * `--require` is the CI half of the same idea. The step that reads this runs
 * immediately after `pnpm test:coverage`, so a missing report there is a broken
 * pipeline rather than a cold tree, and it is refused.
 *
 * ## Why the comparison is at two decimal places
 *
 * The page publishes `99.97%` and v8 writes `99.9666…`. Rounding is therefore part of
 * the claim, and it is done once, in one place: a guard that compared the text would
 * refuse every rounding, and a guard that compared with a tolerance would accept a
 * figure that had been typed from a different run. `toFixed(2)` is the same rule the
 * page's own figures were written with.
 *
 * ## What it does not check
 *
 * The `Gate` column (`≥ 95%`, `≥ 100%`) is a restatement of
 * `packages/core/vitest.config.ts`'s thresholds, and `coverage-thresholds.test.ts`
 * already holds those two numbers equal. Comparing it here as well would make this
 * script a second reader of a claim that has one, and two readers of one claim is how
 * this repository has twice ended up with two numbers that were both green.
 *
 *   node scripts/check-coverage-readings.mjs
 *   node scripts/check-coverage-readings.mjs --doc docs/progress.md --report <path>
 *   node scripts/check-coverage-readings.mjs --require
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const PROGRESS = resolve(ROOT, 'docs', 'progress.md');
const DEFAULT_REPORT = resolve(ROOT, 'packages', 'core', 'coverage', 'coverage-summary.json');

/** The four dimensions, in the order the page publishes them and the report states them. */
const DIMENSIONS = [
  { label: 'Statements', key: 'statements' },
  { label: 'Branches', key: 'branches' },
  { label: 'Functions', key: 'functions' },
  { label: 'Lines', key: 'lines' },
];

function fail(lines) {
  console.error('check-coverage-readings: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * The rows of the coverage table, read from the section rather than from the file.
 *
 * ## Why the section is located first
 *
 * `docs/progress.md` is 7 000 lines and carries other tables with a `Dimension` column
 * -- the export surface, the gate battery. A reader that matched the header anywhere in
 * the file would take whichever came first, and the day the other table moved above this
 * one it would compare the wrong figures while printing a pass. The `## Coverage`
 * heading is the subject, so it is the anchor.
 */
function coverageRows(text, where) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === '## Coverage');
  if (start === -1) {
    fail([`${where}: no '## Coverage' heading, so there is no table to compare with a report.`]);
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index] ?? '')) {
      end = index;
      break;
    }
  }

  const header = lines.findIndex(
    (line, index) => index > start && index < end && /^\|\s*Dimension\s*\|\s*Result\s*\|\s*Gate\s*\|$/.test(line.trim()),
  );
  if (header === -1) {
    fail([
      `${where}: no | Dimension | Result | Gate | table under ## Coverage.`,
      'The four figures are published in that shape, and a reader that found no table would have',
      'nothing to compare -- which is not the same as finding it equal.',
    ]);
  }

  const rows = [];
  for (let index = header + 1; index < end; index += 1) {
    const line = (lines[index] ?? '').trim();
    if (!line.startsWith('|')) break;
    if (/^\|[\s:|-]+\|$/.test(line)) continue;
    const cells = line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
    if (cells.length !== 3) {
      fail([
        `${where}:${String(index + 1)}: the row has ${String(cells.length)} cell(s) and the header has 3.`,
        `  ${line}`,
      ]);
    }
    rows.push({ dimension: cells[0] ?? '', result: cells[1] ?? '', line: index + 1, where });
  }
  if (rows.length === 0) {
    fail([`${where}:${String(header + 1)}: the coverage table has a header and no rows.`]);
  }
  return rows;
}

/** The published figures, one per dimension, with every refusal stated where it happens. */
function publishedFigures(rows) {
  const problems = [];
  const seen = new Map();
  for (const row of rows) {
    const known = DIMENSIONS.find((one) => one.label === row.dimension);
    if (known === undefined) {
      problems.push(
        `${row.where}:${String(row.line)}: '${row.dimension}' is not one of the four dimensions ` +
          `(${DIMENSIONS.map((one) => one.label).join(', ')}); a row this guard cannot name is a figure ` +
          'nobody compares',
      );
      continue;
    }
    if (seen.has(known.key)) {
      problems.push(
        `${row.where}:${String(row.line)}: '${known.label}' is published twice (first at line ` +
          `${String(seen.get(known.key).line)}); two rows for one dimension are two numbers a reader has to ` +
          'choose between',
      );
      continue;
    }
    const match = /^(\d+(?:\.\d+)?)%$/.exec(row.result);
    if (match === null) {
      problems.push(
        `${row.where}:${String(row.line)}: '${row.result}' is not a percentage; every published figure is ` +
          'written as `NN.NN%`, which is the shape the report is compared at',
      );
      continue;
    }
    seen.set(known.key, { line: row.line, value: Number(match[1]), where: row.where });
  }
  for (const one of DIMENSIONS) {
    if (!seen.has(one.key)) {
      problems.push(
        `the table has no '${one.label}' row: four dimensions are published, and a missing row is a figure ` +
          'nobody compares',
      );
    }
  }
  return { figures: seen, problems };
}

/** The report's own totals, one per dimension, or a refusal that names the missing key. */
function reportedFigures(report, path) {
  const problems = [];
  const figures = new Map();
  const total = report?.total;
  if (total === null || typeof total !== 'object') {
    fail([`${path}: the report has no 'total' object, so it does not describe a whole package.`]);
  }
  for (const one of DIMENSIONS) {
    const entry = total[one.key];
    const pct = entry?.pct;
    if (typeof pct !== 'number' || !Number.isFinite(pct)) {
      problems.push(
        `${path}: the report has no total.${one.key}.pct; a summary written without it is a report this ` +
          'guard cannot read, and reading it as zero would publish a number nothing measured',
      );
      continue;
    }
    figures.set(one.key, pct);
  }
  return { figures, problems };
}

function main() {
  const doc = resolve(ROOT, argValue('--doc') ?? PROGRESS);
  const reportPath = resolve(ROOT, argValue('--report') ?? DEFAULT_REPORT);
  const required = process.argv.includes('--require');

  if (!existsSync(doc)) fail([`no such document: ${doc}`]);
  const rows = coverageRows(readFileSync(doc, 'utf8'), doc);
  const { figures: published, problems: structural } = publishedFigures(rows);
  if (structural.length > 0) fail(structural);

  if (!existsSync(reportPath)) {
    if (required) {
      fail([
        `--require was given and there is no report at ${reportPath}.`,
        'This run was asked to compare the table with a measurement, and there is no measurement to compare',
        'with. Run `pnpm test:coverage`, which writes it.',
      ]);
    }
    console.log(
      `check-coverage-readings: UNCHECKED (no coverage report at ${reportPath}; the table's four figures are ` +
        'unchecked in this run -- run `pnpm test:coverage` to produce one)',
    );
    return;
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    fail([`${reportPath}: not JSON (${String(error.message ?? error)})`]);
  }
  const { figures: reported, problems } = reportedFigures(report, reportPath);

  const differences = [];
  for (const one of DIMENSIONS) {
    if (!reported.has(one.key)) continue;
    const page = published.get(one.key);
    const value = Number(reported.get(one.key).toFixed(2));
    if (page.value !== value) {
      differences.push(
        `${page.where}:${String(page.line)}: the page says ${one.label} ${String(page.value)}% and the ` +
          `report says ${String(value)}% (v8 counters in ${reportPath}); every published figure is the ` +
          'report rounded to two decimals',
      );
    }
  }

  if (problems.length > 0 || differences.length > 0) fail([...problems, ...differences]);

  // `100` rather than `100.00`: the page publishes the round number, and a summary line
  // that padded it would read as a figure measured to a precision it does not have.
  const reading = DIMENSIONS.map(
    (one) => `${one.key} ${String(Number(reported.get(one.key).toFixed(2)))}%`,
  ).join(', ');
  console.log(
    `check-coverage-readings: OK (4 dimension(s) equal to the v8 counters in ${reportPath}: ${reading})`,
  );
}

main();
