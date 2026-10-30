#!/usr/bin/env node
/**
 * Reduces a corpus case's `logs.csv` and compares the result to its `logts.csv`.
 *
 * ## Why this is a gate and not a note
 *
 * `docs/targets/rcaeval.md` used to describe `logts.csv` as "log counts per pod",
 * `tracets_lat.csv` as "per-endpoint request counts, one row a minute", and both
 * `timestamp` and `startTime` as microseconds. Three sentences, none of them
 * checkable, because nothing in this repository had ever opened any of the files.
 * Measured (finding 307):
 *
 * | claim | measurement |
 * | --- | --- |
 * | one row a minute | one row per **15 seconds**: 97 rows, 1705353840..1705355280, no gaps |
 * | `logts` columns are pods | one column per **cluster key** in `cluster_info.json`, spelled `<container>_<key>` |
 * | `timestamp` is microseconds | **nanoseconds** -- 19 digits, where `traces.startTime` is 16 |
 *
 * The first two are corrected by this file's existence: it proves that `logts.csv`
 * is a *pure function* of `logs.csv` and `cluster_info.json`, cell for cell, and a
 * table that is a pure function of two named inputs cannot be "counts per pod" as
 * well.
 *
 * ## What it does not check, and why that is a decision rather than an omission
 *
 * `tracets_lat.csv` and `tracets_err.csv` sit beside `logts.csv` in the same
 * directory and are **not** derived from `traces.csv`. Seven candidate reductions
 * were tried against `RE2-OB/checkoutservice_cpu/1` -- span count, distinct trace
 * count, server-only count, client-only count, server-only distinct traces, and
 * the p50/p90/p95/p99 maximum of the span duration -- and every one of them missed
 * all 1649 cells. The ratios between the corpus's values and the counts they could
 * plausibly be are not constant either: they range over a factor of 61 within a
 * single column. So those two tables come from a pipeline whose input is not in the
 * archive, this repository does not produce them, and this script says so on every
 * run rather than leaving their absence to be discovered.
 *
 *   node scripts/check-aggregate-tables.mjs --case <case-dir>
 *   node scripts/check-aggregate-tables.mjs --official-dir <dir>
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { buildLogtsCsv } from '../packages/core/dist/export/rcaeval-logts.js';
import { parseCsvObjects, parseCsvRows } from '../packages/core/dist/util/csv.js';

const LOGTS = 'logts.csv';
const CLUSTERS = 'cluster_info.json';

function usage(message) {
  if (message !== undefined) console.error(`check-aggregate-tables: ${message}`);
  console.error('usage: check-aggregate-tables.mjs (--case <dir> | --official-dir <dir>)');
  process.exit(1);
}

function args(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--case') options.case = argv[(i += 1)];
    else if (flag === '--official-dir') options.official = argv[(i += 1)];
    else usage(`unrecognised argument '${flag}'`);
  }
  return options;
}

/** Every directory under `root` that holds a `logts.csv`, in a stable order. */
function casesWithLogts(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const at = join(dir, entry);
      if (!statSync(at).isDirectory()) continue;
      if (existsSync(join(at, LOGTS))) found.push(at);
      else walk(at);
    }
  };
  walk(root);
  return found;
}

/**
 * `cluster_info.json` flattened to one record per (key, container).
 *
 * The corpus's shape is `{ "<key>": { "template": "...", "container": ["..."] } }`,
 * and the key is a decimal string. Anything else is a refusal rather than a
 * guess: this file's whole purpose is to compare a reduction against the file the
 * corpus wrote, so a cluster table it cannot read is a case it cannot check.
 */
function readClusters(dir, problems) {
  const at = join(dir, CLUSTERS);
  if (!existsSync(at)) {
    problems.push(`${at}: ${LOGTS} is present and ${CLUSTERS} is not, so the reduction has no column names`);
    return undefined;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(at, 'utf8'));
  } catch (error) {
    problems.push(`${at}: not JSON (${error.message})`);
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    problems.push(`${at}: expected an object keyed by cluster id`);
    return undefined;
  }
  const clusters = [];
  for (const [key, value] of Object.entries(parsed)) {
    const containers = value?.container;
    const template = value?.template;
    if (typeof template !== 'string') {
      problems.push(`${at}: cluster '${key}' has no string 'template'`);
      continue;
    }
    if (!Array.isArray(containers) || containers.length === 0) {
      problems.push(`${at}: cluster '${key}' has no non-empty 'container' array`);
      continue;
    }
    for (const container of containers) {
      if (typeof container !== 'string') {
        problems.push(`${at}: cluster '${key}' names a container that is not a string`);
        continue;
      }
      clusters.push({ key, container, template });
    }
  }
  return clusters;
}

/**
 * The corpus's log rows, at the precision the reduction needs.
 *
 * `timestamp` is **nanoseconds** in both archives that ship a log file, which is
 * the unit finding 306 is about: this repository's exporter wrote microseconds
 * into that column until a measurement said otherwise. Floored to whole seconds
 * here because a 19-digit integer is not a number a double holds, and the bucket
 * width is 15 seconds -- there is nothing above the second to lose.
 */
function readLogRows(dir, problems) {
  const at = join(dir, 'logs.csv');
  if (!existsSync(at)) {
    problems.push(`${at}: ${LOGTS} is present and logs.csv is not, so there is nothing to reduce`);
    return undefined;
  }
  const rows = parseCsvObjects(readFileSync(at, 'utf8'));
  if (rows.length === 0) return [];
  const columns = new Set(Object.keys(rows[0]));
  for (const needed of ['timestamp', 'container_name', 'log_template']) {
    if (!columns.has(needed)) {
      problems.push(`${at}: no '${needed}' column, so the reduction cannot be applied to it`);
      return undefined;
    }
  }
  return rows.map((row) => ({
    container: row.container_name,
    template: row.log_template,
    atSeconds: Math.floor(Number(row.timestamp) / 1_000_000_000),
  }));
}

function checkCase(dir, label) {
  const problems = [];
  const clusters = readClusters(dir, problems);
  const rows = readLogRows(dir, problems);
  if (clusters === undefined || rows === undefined) return { problems, cells: 0, notes: [] };

  const table = buildLogtsCsv(rows, clusters);
  const published = parseCsvRows(readFileSync(join(dir, LOGTS), 'utf8'));
  const reduced = parseCsvRows(table.csv);
  const publishedHeader = published[0] ?? [];
  const reducedHeader = reduced[0] ?? [];

  if (publishedHeader.join(',') !== reducedHeader.join(',')) {
    problems.push(
      `${label}: the published header is '${publishedHeader.join(',')}' and the reduction produces ` +
        `'${reducedHeader.join(',')}'; the column rule is <container>_<cluster key> ordered by the ` +
        `key as an integer`,
    );
    return { problems, cells: 0, notes: [] };
  }
  if (published.length !== reduced.length) {
    problems.push(
      `${label}: the published table has ${published.length - 1} row(s) and the reduction produces ` +
        `${reduced.length - 1}; the grid is every 15 seconds from the first log to the last, with no gaps`,
    );
    return { problems, cells: 0, notes: [] };
  }

  let cells = 0;
  let wrong = 0;
  for (let r = 1; r < published.length; r += 1) {
    for (let c = 1; c < publishedHeader.length; c += 1) {
      cells += 1;
      const want = published[r][c] ?? '';
      const got = reduced[r][c] ?? '';
      if (want === got) continue;
      wrong += 1;
      if (wrong <= 5) {
        problems.push(
          `${label}: time=${published[r][0]} column='${publishedHeader[c]}' published=${want} reduced=${got}`,
        );
      }
    }
  }
  if (wrong > 5) problems.push(`${label}: ${wrong - 5} further cell(s) differ`);

  const notes = [];
  for (const refused of ['tracets_lat.csv', 'tracets_err.csv']) {
    if (!existsSync(join(dir, refused))) continue;
    notes.push(
      `${label}: ${refused} is present and is not produced by this repository -- it is not a function ` +
        `of traces.csv (seven candidate reductions, 0 of 1649 cells, finding 307)`,
    );
  }
  if (table.dropped > 0) {
    notes.push(`${label}: ${table.dropped} log row(s) match no cluster and appear in no column`);
  }
  return { problems, cells, notes };
}

function main() {
  const options = args(process.argv.slice(2));
  let dirs;
  let root;
  if (options.case !== undefined) {
    root = resolve(options.case);
    if (!existsSync(root) || !statSync(root).isDirectory()) usage(`no such directory: ${options.case}`);
    dirs = [root];
  } else if (options.official !== undefined) {
    root = resolve(options.official);
    if (!existsSync(root) || !statSync(root).isDirectory()) usage(`no such directory: ${options.official}`);
    dirs = casesWithLogts(root);
    if (dirs.length === 0) {
      usage(`${options.official} holds no ${LOGTS}, so nothing was checked and this is not a pass`);
    }
  } else {
    usage('one of --case or --official-dir is required');
  }

  const problems = [];
  let cells = 0;
  let cases = 0;
  for (const dir of dirs) {
    const label = basename(dir) === dir ? dir : relative(root, dir) || dir;
    const result = checkCase(dir, label);
    for (const problem of result.problems) problems.push(problem);
    for (const note of result.notes) console.log(note);
    if (result.cells > 0) {
      const rows = parseCsvRows(readFileSync(join(dir, LOGTS), 'utf8')).length - 1;
      const columns = (parseCsvRows(readFileSync(join(dir, LOGTS), 'utf8'))[0] ?? []).length - 1;
      console.log(`${label}: ${rows} row(s) x ${columns} column(s) = ${result.cells} cell(s), all equal`);
      cells += result.cells;
      cases += 1;
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-aggregate-tables: ${problem}`);
    console.error(`check-aggregate-tables: FAILED (${problems.length} problem(s))`);
    process.exit(1);
  }
  console.log(
    `check-aggregate-tables: OK (${cases} case(s), ${cells} cell(s) reduced from logs.csv and equal ` +
      `to the corpus's own logts.csv)`,
  );
}

main();
