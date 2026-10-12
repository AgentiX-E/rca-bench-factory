#!/usr/bin/env node
/**
 * Hold the T2 backend matrix in `docs/architecture.md` to the measured snapshot.
 *
 * ## The defect this prevents
 *
 * `/09-推进进度追踪.md`'s P1-5 requires the six T2 backends (Prometheus, Jaeger,
 * Loki, Elasticsearch, ClickHouse, the Kubernetes API) to be measured one by one
 * and the unsupported ones declared explicitly. A published matrix is the natural
 * way to record that, and a published matrix decays the same way every other
 * document number in this repository has: the row keeps saying what it said when
 * the code moved on.
 *
 * The direction of the check is what makes it worth having. The matrix is
 * compared against `golden-master/backend-support.json`, which
 * `scripts/derive-backend-support.mjs` derives from
 * `packages/core/src/ingest/backends.ts`, and
 * `packages/core/test/backend-support.test.ts` asserts that snapshot equals the
 * registry. A document checked against another document would only prove the two
 * agreed with each other.
 *
 * ## Cold-safe
 *
 * This reads two files, so it runs in the `cold-tree` job as well as in the warm
 * `docs:check`: the `cold-tree` job exists because a documentation guard that
 * needs a build cannot run where the build is forbidden (finding 136), and this
 * one needs neither.
 *
 *   node scripts/check-backend-support.mjs
 *   node scripts/check-backend-support.mjs --doc <path> --snapshot <path>
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const DOC = resolve(ROOT, 'docs', 'architecture.md');
const SNAPSHOT = resolve(ROOT, 'golden-master', 'backend-support.json');

/** The heading the matrix lives under. Matched case-insensitively, as a substring. */
const SECTION = 'T2 backends';

const STATUSES = ['implemented', 'unsupported'];

function fail(lines) {
  console.error('check-backend-support: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function strip(cell) {
  return cell.replace(/`/g, '').trim();
}

/**
 * Read the matrix out of the document.
 *
 * Scoped to the section rather than to the file: a table cell anywhere else that
 * happened to read like a backend row is not this matrix, and a search over the
 * whole file would let one satisfy a row while the real one went missing.
 */
function readMatrix(text) {
  const lines = text.split('\n');
  const startIndex = lines.findIndex((line) => line.toLowerCase().includes(SECTION.toLowerCase()));
  if (startIndex === -1) return { rows: [], scoped: false };

  const rows = [];
  let seenAnyTable = false;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('#')) break; // the next section: the matrix is over
    if (!line.trimStart().startsWith('|')) continue;
    if (/^\s*\|[\s|:-]*\|?\s*$/.test(line)) continue; // separator
    const cells = line.split('|').slice(1, -1);
    if (cells.length < 3) continue;
    if (cells[0].toLowerCase().includes('backend')) {
      seenAnyTable = true;
      continue; // header row
    }
    seenAnyTable = true;
    rows.push({ line: i + 1, id: strip(cells[0]), status: strip(cells[1]), text: cells[2].trim() });
  }
  return { rows, scoped: seenAnyTable };
}

function main() {
  const docPath = argValue('--doc') ?? DOC;
  const snapshotPath = argValue('--snapshot') ?? SNAPSHOT;

  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  } catch (error) {
    fail([
      `cannot read the snapshot at ${snapshotPath}: ${error.message}`,
      'Run `node scripts/derive-backend-support.mjs` after `pnpm build`.',
    ]);
  }
  const backends = Array.isArray(snapshot.backends) ? snapshot.backends : [];
  if (backends.length === 0) {
    fail([
      `the snapshot at ${snapshotPath} lists no backends.`,
      'An empty registry would make every row of the matrix unrefutable, and this',
      'guard exists because unrefutable rows are how a gap comes to look closed.',
    ]);
  }

  const doc = readFileSync(docPath, 'utf8');
  const { rows, scoped } = readMatrix(doc);
  if (!scoped) {
    fail([
      `no '${SECTION}' table found in ${docPath}.`,
      'Finding it by heading rather than by a line number is deliberate: a guard',
      'that reads a fixed position reports OK about whatever moved into it.',
    ]);
  }

  const problems = [];
  const byId = new Map();

  for (const row of rows) {
    if (byId.has(row.id)) {
      problems.push(`line ${row.line}: '${row.id}' has more than one row, so which one is read is arbitrary`);
      continue;
    }
    byId.set(row.id, row);
    if (!STATUSES.includes(row.status)) {
      problems.push(
        `line ${row.line}: '${row.id}' declares status '${row.status}', which is not one of ` +
          `${STATUSES.join(' / ')}. A third status would be a way to say nothing.`,
      );
    }
  }

  for (const backend of backends) {
    const row = byId.get(backend.id);
    if (row === undefined) {
      problems.push(
        `the snapshot lists '${backend.id}' and the matrix has no row for it. Every backend in ` +
          `the registry is one the requirement asked to be measured, so a missing row is a ` +
          `deleted measurement rather than an omission.`,
      );
      continue;
    }
    if (row.status !== backend.status) {
      problems.push(
        `line ${row.line}: '${backend.id}' is '${backend.status}' in the snapshot and ` +
          `'${row.status}' in the document.`,
      );
      continue;
    }
    const expected = backend.status === 'implemented' ? backend.summary : backend.reason;
    if (row.text !== expected) {
      problems.push(
        `line ${row.line}: '${backend.id}' is ${backend.status} in both, but its description ` +
          `has drifted.\n      document: ${row.text}\n      snapshot: ${expected}`,
      );
    }
  }

  for (const row of rows) {
    if (!backends.some((backend) => backend.id === row.id)) {
      problems.push(
        `line ${row.line}: the matrix has a row for '${row.id}', which the registry does not ` +
          `list. A row for a backend that does not exist is a claim about nothing.`,
      );
    }
  }

  if (problems.length) fail(problems);

  const counts = backends.reduce((acc, backend) => {
    acc[backend.status] = (acc[backend.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `check-backend-support: OK (${backends.length} backend(s) in the matrix: ` +
      `${counts.implemented ?? 0} implemented, ${counts.unsupported ?? 0} unsupported with a reason)`,
  );
}

main();
