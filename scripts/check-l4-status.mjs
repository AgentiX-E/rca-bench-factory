#!/usr/bin/env node
/**
 * Hold the published L4 status table to the asset registry.
 *
 * ## Why this exists
 *
 * The fourth anchor's status is the one place in this project where "the path
 * runs" and "the number reproduced" must not be confused, and it is therefore
 * the one place a reader most needs the two kept apart. The status lived in two
 * documents in two forms: `docs/progress.md` stated it correctly and in prose,
 * while the published per-format table rendered it as a single cell.
 *
 * A single cell cannot hold two axes, so it held the wrong one. Measured before
 * this guard was written, five of the nine cells contradicted the registry, and
 * the OpenRCA 1.0 row claimed a replay had actually been run (`已实测回放`) for
 * an anchor the registry lists as **not fetchable at all** -- its telemetry is
 * behind Google Drive. That claim is not merely stale: the workflow's `anchor`
 * input offers only the three RCAEval anchors, so there was no execution it
 * could have described.
 *
 * ## What it checks, and what it deliberately does not
 *
 * The registry is machine-readable and already authoritative for the fetch axis:
 * an anchor is `pinned` if one of its assets carries a measured digest, `pending`
 * if its assets are fetchable but unpinned, and `unfetchable` if it is declared
 * in `notFetchable`. So the fetch axis is *read*, never restated.
 *
 * The table's second axis -- whether a reading exists -- is `pinned` or nothing,
 * because a digest is the only thing a pin records. This guard asserts the pair,
 * not the prose: the cell may say anything that names the right state, and the
 * guard reads the axis labels out of the table header rather than trusting a
 * column index.
 *
 * ## Which file it checks
 *
 * `docs/` is English and internal; the Chinese baseline lives in the sibling
 * documentation repository, which is not present in CI. The two must agree, and
 * the cheaper direction to check is the one CI can see. The Chinese side is
 * checked by the same rule at the point it is edited -- see `docs/audit.md`,
 * finding 112, which records that asymmetry rather than hiding it.
 *
 *   node scripts/check-l4-status.mjs
 *   node scripts/check-l4-status.mjs --table docs/target-formats.md
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const REGISTRY = resolve(ROOT, 'golden-master', 'official-assets.json');
const TARGETS_SOURCE = resolve(ROOT, 'packages', 'core', 'src', 'score', 'targets.ts');

function fail(lines) {
  console.error('check-l4-status: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) fail([`${flag} requires a value`]);
  return value;
}

if (!existsSync(REGISTRY)) fail([`registry '${REGISTRY}' does not exist`]);

let registry;
try {
  registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
} catch (error) {
  fail([`registry is not valid JSON: ${error.message}`]);
}

// The scorer owns the target list; the registry owns which of them are reachable.
// Reading the declaration from the module that *declares* it, not one that
// re-exports it, is the same discipline `check-official-registry.mjs` uses, and
// for the same reason: a wrong file presents as "the declaration moved".
if (!existsSync(TARGETS_SOURCE)) fail([`'${TARGETS_SOURCE}' does not exist`]);
const targetMatch = /SCORE_TARGET_IDS\s*=\s*\[([^\]]+)\]/.exec(readFileSync(TARGETS_SOURCE, 'utf8'));
if (targetMatch === null) {
  fail([
    `could not read the SCORE_TARGET_IDS declaration from ${TARGETS_SOURCE}.`,
    `If it moved, point this check at its new home rather than removing the check.`,
  ]);
}
const declaredTargets = [...targetMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

/**
 * The fetch axis, derived from the registry.
 *
 * This is the whole point of the guard: the state is computed here and compared
 * against what a human wrote, so a hand edit that disagrees fails rather than
 * being published.
 */
function fetchState(target) {
  const assets = registry.assets.filter((a) => a.anchor === target);
  const declared = registry.notFetchable.some((n) => n.anchor === target);
  if (declared) {
    // A target cannot be both. `check-official-registry.mjs` asserts the asset
    // list partitions, but not that the two lists are disjoint by anchor.
    if (assets.length > 0) {
      fail([
        `anchor '${target}' appears in both 'assets' and 'notFetchable'. The table has ` +
          `one cell for the fetch axis and cannot express two answers.`,
      ]);
    }
    return 'unfetchable';
  }
  if (assets.length === 0) return null;
  return assets.some((a) => a.sha256 !== null && a.sha256 !== undefined) ? 'pinned' : 'pending';
}

const states = new Map(declaredTargets.map((t) => [t, fetchState(t)]));
const unclassified = declaredTargets.filter((t) => states.get(t) === null);
if (unclassified.length > 0) {
  fail([
    `the registry classifies no state for: ${unclassified.join(', ')}.`,
    `Every score target is pinned, pending or unfetchable; an anchor in neither list is ` +
      `a target the table cannot describe.`,
  ]);
}

// The reading axis follows from the fetch axis and needs no second source: a
// digest is the only thing that records a number, so only a pinned target has a
// reading. Deriving it rather than reading it keeps the two axes from drifting.
function readingState(target) {
  return states.get(target) === 'pinned' ? 'reading' : 'none';
}

const TABLE = resolve(ROOT, argValue('--table') ?? 'docs/target-formats.md');

/**
 * Read the L4 table out of a markdown file.
 *
 * Two column positions are never assumed. The header row is parsed to find the
 * two axis columns by name, so renaming or reordering them keeps this guard
 * honest instead of silently checking the wrong cell -- which is the failure this
 * whole iteration is about.
 */
function readTable(path) {
  if (!existsSync(path)) fail([`table '${path}' does not exist`]);
  const markdown = readFileSync(path, 'utf8');
  const lines = markdown.split('\n');

  const headerIndex = lines.findIndex(
    (line) => line.startsWith('|') && /L4/.test(line) && /fetch|reachab|可测/i.test(line),
  );
  if (headerIndex === -1) {
    fail([
      `no L4 status table found in '${path}'.`,
      `The table is located by a header row naming L4 and the fetch axis, so a table ` +
        `without both axes is not this table. If the table moved, point --table at it.`,
    ]);
  }

  const header = lines[headerIndex].split('|').slice(1, -1).map((c) => c.trim());
  const fetchColumn = header.findIndex((c) => /fetch|reachab|可测/i.test(c));
  const readingColumn = header.findIndex((c) => /reading|number|读数/i.test(c));
  if (readingColumn === -1) {
    fail([
      `the L4 table in '${path}' names the fetch axis but not the reading axis.`,
      `One column cannot hold both: "can this ever be measured" and "has it been ` +
        `measured" need opposite actions when the answer is no, and fusing them is how ` +
        `a replay came to be claimed for an unfetchable anchor.`,
    ]);
  }

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c.replace(/:/g, '')))) continue;
    if (cells.length !== header.length) {
      fail([`row ${i + 1} of '${path}' has ${cells.length} cells; the header has ${header.length}`]);
    }
    rows.push({ line: i + 1, cells });
  }
  if (rows.length === 0) fail([`the L4 table in '${path}' has no rows`]);
  return { fetchColumn, readingColumn, rows };
}

const { fetchColumn, readingColumn, rows } = readTable(TABLE);

const problems = [];
const seen = new Set();

for (const { line, cells } of rows) {
  // The format is named in the row; the target id is the first cell. Rows are
  // matched to targets by the id appearing in the row, so a display name that
  // differs from the id cannot silently detach a row from its target.
  const target = declaredTargets.find((t) => new RegExp(`\\b${t.replace(/\./g, '\\.')}\\b`).test(cells[0]));
  if (target === undefined) {
    problems.push(
      `row ${line} ('${cells[0]}') names no score target. Every row describes one of: ` +
        `${declaredTargets.join(', ')}.`,
    );
    continue;
  }
  seen.add(target);

  const expectedFetch = states.get(target);
  const actualFetch = cells[fetchColumn];
  if (actualFetch !== expectedFetch) {
    problems.push(
      `row ${line} ('${target}') states L4 fetch = '${actualFetch}', but the registry says ` +
        `'${expectedFetch}'.`,
    );
  }

  const expectedReading = readingState(target);
  const actualReading = cells[readingColumn];
  const statesAReading = expectedReading === 'reading';
  const claimsAReading = !/^(—|-|n\/a|none)$/i.test(actualReading);
  if (statesAReading !== claimsAReading) {
    problems.push(
      `row ${line} ('${target}') claims a reading = '${actualReading}', but the registry ` +
        `has ${expectedReading === 'reading' ? 'a measured pin' : 'no measured pin'} for it. ` +
        `A reading requires a measured digest; nothing else records one.`,
    );
  }
}

for (const target of declaredTargets) {
  if (!seen.has(target)) {
    problems.push(
      `target '${target}' has no row in the L4 table. All nine are listed so a target ` +
        `cannot leave the table by having its row deleted.`,
    );
  }
}

if (problems.length > 0) fail(problems);

const tally = { pinned: 0, pending: 0, unfetchable: 0 };
for (const state of states.values()) tally[state] += 1;

console.log(
  `check-l4-status: OK (${rows.length} row(s) agree with the registry; ` +
    `${tally.pinned} pinned, ${tally.pending} pending, ${tally.unfetchable} unfetchable -- ` +
    `${tally.pinned} of ${declaredTargets.length} can have a reading)`,
);
