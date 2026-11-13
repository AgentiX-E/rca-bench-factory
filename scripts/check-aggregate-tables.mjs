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

import { closeSync, existsSync, openSync, readFileSync, readdirSync, readSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import {
  LOGTS_BUCKET_SECONDS,
  logtsCells,
  logtsHeader,
  reduceLogts,
} from '../packages/core/dist/export/rcaeval-logts.js';
import { iterateCsvRows } from '../packages/core/dist/util/csv.js';

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
 * The first record of a file, without reading the rest of it.
 *
 * ## Why this is separate from reading the file
 *
 * This script needs three columns out of a corpus `logs.csv`, and the corpus's
 * largest one is **202 258 338 bytes** with 274 621 records. The first version read
 * the whole file, parsed it into 274 621 objects and *then* looked at the header to
 * decide whether it could use them -- so the first TrainTicket case died of a 4 GB
 * heap (finding 533) before it could report that the file has no `log_template`
 * column, which was the only thing it needed to know. Sixty-four kilobytes answer
 * that question for every case in the corpus.
 *
 * A header longer than the window is a header this reader cannot see; that is a
 * refusal rather than a truncation, because a truncated header would report the
 * wrong set of columns and the sentence that followed would be about the wrong
 * file.
 */
function firstRecord(path, problems) {
  const window = Buffer.alloc(64 * 1024);
  let read = 0;
  const fd = openSync(path, 'r');
  try {
    read = readSync(fd, window, 0, window.length, 0);
  } finally {
    closeSync(fd);
  }
  const text = window.subarray(0, read).toString('utf8');
  for (const cells of iterateCsvRows(text)) return cells;
  return [];
}

/**
 * The corpus's log rows, at the precision the reduction needs, one at a time.
 *
 * ## The columns the rule keys on
 *
 * `log_template` is the rendered template the corpus's cluster table quotes -- the
 * rule matches it exactly (`docs/targets/rcaeval.md`, finding 307). It is present in
 * **25 of the 91** Online Boutique case directories in `RE2-OB` and in none of
 * `RE2-SS` or `RE2-TT`, whose `cluster_info.json` holds Drain's **masked** templates
 * (`..., pageNum=<:NUM:>, ...`) and whose log rows carry only `message`. Those cases
 * are refused, and the refusal is why `firstRecord` exists: it is cheaper to say so
 * than to parse two hundred megabytes first.
 *
 * ## Why this is a generator
 *
 * `timestamp` is nanoseconds -- a 19-digit integer a double does not hold -- so it
 * is floored to whole seconds at the boundary where the record is parsed, once, and
 * the reduction keeps only counts. Nothing here builds an array of rows.
 */
function* logRows(path, columns, refusal) {
  const text = readFileSync(path, 'utf8');
  const at = {
    timestamp: columns.indexOf('timestamp'),
    container: columns.indexOf('container_name'),
    template: columns.indexOf('log_template'),
  };

  let index = 0;
  for (const cells of iterateCsvRows(text)) {
    index += 1;
    if (index === 1) continue;
    if (cells.length !== columns.length) {
      // A record that does not match the header is a file this rule cannot read:
      // the rule reads cells by position, and a shifted row would be counted into
      // the wrong column and then reported as the corpus's mistake.
      refusal.why =
        `record ${index} has ${cells.length} cell(s) and the header has ${columns.length}, ` +
        'so the reduction cannot read this file by position';
      refusal.reason = 'ragged-records';
      return;
    }
    yield {
      container: cells[at.container],
      template: cells[at.template],
      atSeconds: Math.floor(Number(cells[at.timestamp]) / 1_000_000_000),
    };
  }
}

/**
 * The corpus's published table, compared with the reduction one record at a time.
 *
 * The reduction is a fold, so the expected row for a bucket is computed when the
 * published row that should equal it is read. Nothing here holds a table: peak
 * memory is the reduction's counts -- one entry per (bucket, column) that was
 * actually observed -- plus one record of each file.
 */
function comparePublished(text, grid, label) {
  const problems = [];
  const expectedHeader = logtsHeader(grid.columns);

  let rows = 0;
  let columns = 0;
  let cells = 0;
  let wrong = 0;
  let bucket = grid.lowest;
  let header = true;

  for (const published of iterateCsvRows(text)) {
    if (header) {
      header = false;
      columns = Math.max(0, published.length - 1);
      if (published.join(',') !== expectedHeader.join(',')) {
        problems.push(
          `${label}: the published header is '${published.join(',')}' and the reduction produces ` +
            `'${expectedHeader.join(',')}'; the column rule is <container>_<cluster key> ordered by the ` +
            'key as an integer',
        );
        return { problems, cells: 0, rows: 0, columns: 0 };
      }
      continue;
    }

    rows += 1;
    const expected = logtsCells(grid, bucket);
    bucket += LOGTS_BUCKET_SECONDS;
    for (let c = 0; c < Math.max(published.length, expected.length); c += 1) {
      if (c > 0) cells += 1;
      const have = published[c] ?? '';
      const produced = `${expected[c] ?? ''}`;
      if (have === produced) continue;
      wrong += 1;
      if (wrong <= 5) {
        problems.push(
          `${label}: time=${published[0]} column='${expectedHeader[c] ?? '?'}' published=${have} ` +
            `reduced=${produced}`,
        );
      }
    }
  }

  // The grid is dense from the first log to the last, so the row count is not a
  // free parameter: it is `(highest - lowest) / 15 + 1`, and a table that stops
  // early or runs on is the same defect stated from either side.
  const expectedRows = grid.seen === 0 ? 0 : (grid.highest - grid.lowest) / LOGTS_BUCKET_SECONDS + 1;
  if (rows < expectedRows) {
    problems.push(
      `${label}: the reduction produces ${expectedRows - rows} more row(s) than the corpus publishes; ` +
        'the grid is every 15 seconds from the first log to the last, with no gaps',
    );
  } else if (rows > expectedRows) {
    problems.push(
      `${label}: the corpus publishes ${rows - expectedRows} more row(s) than the reduction produces; ` +
        'the grid is every 15 seconds from the first log to the last, with no gaps',
    );
  }
  if (wrong > 5) problems.push(`${label}: ${wrong - 5} further cell(s) differ`);

  return { problems, cells, rows, columns, wrong };
}

/**
 * `cluster_info.json` flattened to one record per (key, container).
 *
 * The corpus's shape is `{ "<key>": { "template": "...", "container": ["..."] } }`,
 * and the key is a decimal string. Anything else is a refusal rather than a
 * guess: this file's whole purpose is to compare a reduction against the file the
 * corpus wrote, so a cluster table it cannot read is a case it cannot check.
 */
function readClusters(dir, refusal) {
  const at = join(dir, CLUSTERS);
  if (!existsSync(at)) {
    refusal.why = `${at}: ${LOGTS} is present and ${CLUSTERS} is not, so the reduction has no column names`;
    refusal.reason = 'no-cluster-table';
    return undefined;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(at, 'utf8'));
  } catch (error) {
    refusal.why = `${at}: not JSON (${error.message})`;
    refusal.reason = 'unreadable-cluster-table';
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    refusal.why = `${at}: expected an object keyed by cluster id`;
    refusal.reason = 'unreadable-cluster-table';
    return undefined;
  }
  const clusters = [];
  const problems = [];
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
  if (problems.length > 0) {
    refusal.why = problems[0];
    refusal.reason = 'unreadable-cluster-table';
    return undefined;
  }
  return clusters;
}

/**
 * One case, read as far as it can be, and its outcome named.
 *
 * Three outcomes, and the difference between them is the point of the step's title:
 *
 *  - **reproduced** -- the reduction equals the corpus's table, cell for cell;
 *  - **refused** -- this rule cannot read this case, for a reason the caller is
 *    given, and the number of refusals is reported;
 *  - **disagreed** -- the rule applied and produced a different table, which is a
 *    defect in this repository and fails the step.
 */
function checkCase(dir, label) {
  const refusal = { why: '', reason: '' };
  const clusters = readClusters(dir, refusal);
  if (clusters === undefined) return { outcome: 'refused', ...refusal };

  const logs = join(dir, 'logs.csv');
  if (!existsSync(logs)) {
    return {
      outcome: 'refused',
      reason: 'no-logs',
      why: `${logs}: ${LOGTS} is present and logs.csv is not, so there is nothing to reduce`,
    };
  }

  const headerProblems = [];
  const columns = firstRecord(logs, headerProblems);
  const needed = ['timestamp', 'container_name', 'log_template'];
  const missing = needed.filter((name) => !columns.includes(name));
  if (missing.length > 0) {
    return {
      outcome: 'refused',
      reason: 'no-template-column',
      why:
        `${logs}: no '${missing.join("', '")}' column, so the reduction cannot be applied to it; ` +
        `its columns are ${columns.join(', ')}`,
    };
  }

  const grid = reduceLogts(logRows(logs, columns, refusal), clusters);
  if (refusal.why !== '') return { outcome: 'refused', ...refusal };

  const published = comparePublished(readFileSync(join(dir, LOGTS), 'utf8'), grid, label);
  const notes = [];
  for (const refused of ['tracets_lat.csv', 'tracets_err.csv']) {
    if (!existsSync(join(dir, refused))) continue;
    notes.push(
      `${label}: ${refused} is present and is not produced by this repository -- it is not a function ` +
        `of traces.csv (seven candidate reductions, 0 of 1649 cells, finding 307)`,
    );
  }
  if (grid.dropped > 0) {
    notes.push(`${label}: ${grid.dropped} log row(s) match no cluster and appear in no column`);
  }

  return {
    outcome: published.problems.length === 0 ? 'reproduced' : 'disagreed',
    cells: published.cells,
    rows: published.rows,
    columns: published.columns,
    wrong: published.wrong ?? 0,
    problems: published.problems,
    notes,
  };
}

/** One sentence per refusal reason, for the tally in the summary. */
const REFUSAL_REASONS = {
  'no-cluster-table': 'no cluster table',
  'unreadable-cluster-table': 'a cluster table that is not a table',
  'no-logs': 'no logs.csv',
  'no-template-column': 'no rendered template column',
  'ragged-records': 'records that do not match the header',
};

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
  const refusedBy = new Map();
  let cells = 0;
  let reproduced = 0;
  let refused = 0;

  for (const dir of dirs) {
    const label = basename(dir) === dir ? dir : relative(root, dir) || dir;
    const result = checkCase(dir, label);

    if (result.outcome === 'refused') {
      refused += 1;
      refusedBy.set(result.reason, (refusedBy.get(result.reason) ?? 0) + 1);
      console.log(`${label}: refused -- ${result.why}`);
      continue;
    }

    for (const note of result.notes) console.log(note);
    for (const problem of result.problems) problems.push(problem);
    if (result.wrong > 0) {
      // Not "all equal": a case that disagrees with the corpus is the one case where
      // the sentence must not say it agrees. It said so until v3.90.
      console.log(
        `${label}: ${result.rows} row(s) x ${result.columns} column(s) = ${result.cells} cell(s), ` +
          `${result.wrong} differ`,
      );
    } else {
      console.log(
        `${label}: ${result.rows} row(s) x ${result.columns} column(s) = ${result.cells} cell(s), all equal`,
      );
    }
    if (result.outcome === 'reproduced') {
      cells += result.cells;
      reproduced += 1;
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-aggregate-tables: ${problem}`);
    console.error(`check-aggregate-tables: FAILED (${problems.length} problem(s))`);
    process.exit(1);
  }

  // A run that reproduced nothing has checked nothing, and "nothing was wrong" and
  // "nothing was compared" print the same number of failures.
  if (reproduced === 0) {
    console.error(
      `check-aggregate-tables: FAILED (0 of ${dirs.length} case(s) could be reproduced, which is not a ` +
        'pass -- the refusals above say why each one could not be read)',
    );
    process.exit(1);
  }

  const tally = [...refusedBy.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([reason, count]) => `${count} for ${REFUSAL_REASONS[reason] ?? reason}`)
    .join(', ');
  console.log(
    `check-aggregate-tables: OK (${reproduced} case(s) reproduced, ${cells} cell(s) reduced from ` +
      `logs.csv and equal to the corpus's own ${LOGTS}` +
      (refused > 0 ? `; ${refused} refused, ${tally}` : '') +
      ')',
  );
}

main();
