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
 * `cluster_id` is the column the corpus groups by, and `log_template` is the
 * rendering of it -- read first when present, and read always as the fallback and
 * as a second opinion (finding 536). Both are absent from `RE2-SS` and `RE2-TT`,
 * whose `cluster_info.json` holds Drain's **masked** templates
 * (`..., pageNum=<:NUM:>, ...`) and whose log rows carry only `message`: with no id
 * and no rendered text there is nothing to reduce with, so those cases are
 * refused, and the refusal is why `firstRecord` exists -- it is cheaper to say so
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
    cluster: columns.indexOf('cluster_id'),
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
      clusterId: at.cluster < 0 ? undefined : cells[at.cluster],
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
 * `<container>_<cluster key>`, the only spelling the corpus's published table uses.
 *
 * ## Why this is a parser and not a `lastIndexOf('_')`
 *
 * A container name may contain an underscore and a cluster key is a decimal integer,
 * so `checkoutservice_12` is one column of `checkoutservice` and `checkout_service_12`
 * is one column of `checkout_service`. Splitting at the last underscore would answer
 * the second case correctly and the first by luck; requiring the suffix to be all
 * digits answers both, and refuses `frontend_notanumber` -- which is the shape a table
 * would carry if its author had written a pod name into the column header, and a
 * header this rule guessed the container out of would be a comparison with a file
 * nobody described.
 *
 * The empty container is refused too: `_12` names no container, and a column that
 * belongs to nothing cannot be attributed to a container's row count.
 */
function containerOfColumn(name) {
  const match = /^(.+)_(\d+)$/.exec(name);
  return match === null || match[1] === '' ? undefined : match[1];
}

/**
 * The log rows of a file, counted by (container, 15-second bucket).
 *
 * This is the right-hand side of the only statement `RE2-SS` and `RE2-TT` can support.
 * It is a fold over the same generator the exact reduction uses, so the two paths read
 * a log file the same way; what differs is what they do with a row -- the reduction
 * needs its cluster, and this needs only the container and the instant.
 */
function countRowsByContainer(rows) {
  const counts = new Map();
  let total = 0;
  for (const row of rows) {
    let byBucket = counts.get(row.container);
    if (byBucket === undefined) {
      byBucket = new Map();
      counts.set(row.container, byBucket);
    }
    byBucket.set(row.atSeconds, (byBucket.get(row.atSeconds) ?? 0) + 1);
    total += 1;
  }
  return { counts, total };
}

/**
 * The published table's marginals, against the log rows they summarize.
 *
 * ## The claim, stated so that it can be false
 *
 * For every container `c` and bucket `b`:
 *
 *     sum over the columns of `c` of logts.csv[c, b]  <=  number of logs.csv rows
 *                                                        with container `c` in bucket `b`
 *
 * A table of per-cluster counts is a partition of the container's lines, so its
 * marginals can never exceed the lines. The inequality is therefore *derivable* from
 * what the file claims to be -- and it is not free: a table bucketed on a different
 * clock, generated from a different log file, or counted twice fails it. What it
 * cannot see is a misattribution *within* a container, which is exactly what the 246
 * directories have no column to check. So this is a weaker claim than reproduction,
 * and it is reported under its own name (`bounded`) rather than as one.
 *
 * ## Why the empty cell is zero
 *
 * The corpus writes `0`, and a reader that treated an empty cell as a missing
 * measurement would have to decide what "missing" means for a table it is summing.
 * An empty cell in a count column is zero, and the check is that the number is a
 * non-negative integer -- a cell holding `''` or `0` adds nothing, and a cell holding
 * `1.5` or `-2` is a table this rule refuses rather than one it rounds.
 *
 * ## Why the comparison is a fold and not two tables
 *
 * The published side is accumulated into the same (container, bucket) shape as the
 * log side, so peak memory is two maps of the buckets the corpus actually wrote --
 * a few thousand entries for a 202 MB log file, not the file. Every corpus case with
 * this shape is TrainTicket-sized, which is why this is not decoration.
 */
function compareMarginals(text, containers, logCounts, label) {
  const problems = [];
  const published = new Map();
  let header = true;
  let rows = 0;
  let cells = 0;
  let publishedTotal = 0;

  for (const line of iterateCsvRows(text)) {
    if (header) {
      // The caller has already read and validated this row from the same file's first
      // 64 KiB; it is skipped here rather than re-checked, because two decisions about
      // one header are two chances to disagree with each other.
      header = false;
      continue;
    }

    rows += 1;
    const bucket = Number(line[0]);
    if (!Number.isInteger(bucket)) {
      problems.push(
        `${label}: row ${rows} has time='${line[0] ?? ''}', which is not a whole second; every bucket in the ` +
          'corpus is written as one',
      );
      continue;
    }
    for (let c = 1; c < line.length; c += 1) {
      const raw = line[c] ?? '';
      const value = raw === '' ? 0 : Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        problems.push(
          `${label}: row ${rows} column '${containers[c - 1] ?? '?'}' holds '${raw}', which is not a ` +
            'non-negative integer count',
        );
        continue;
      }
      if (value === 0) continue;
      cells += 1;
      publishedTotal += value;
      const container = containers[c - 1];
      let byBucket = published.get(container);
      if (byBucket === undefined) {
        byBucket = new Map();
        published.set(container, byBucket);
      }
      byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + value);
    }
  }

  let pairs = 0;
  let tightest = Infinity;
  for (const [container, byBucket] of published) {
    for (const [bucket, value] of byBucket) {
      pairs += 1;
      const held = logCounts.get(container)?.get(bucket) ?? 0;
      const slack = held - value;
      if (slack < tightest) tightest = slack;
      if (slack < 0) {
        problems.push(
          `${label}: container '${container}' in bucket ${bucket} publishes ${value} log cell(s) and ` +
            `logs.csv holds ${held} row(s) for it; a table that summarizes a log file cannot count more ` +
            'lines than the file holds',
        );
      }
    }
  }

  return {
    problems,
    pairs,
    publishedTotal,
    // Two row counts that are not the same number and were confused once: the table's
    // own rows are its buckets, and the log file's rows are what the bound is against.
    publishedRows: rows,
    columns: containers.length,
    cells,
    tightest: pairs === 0 ? 0 : tightest,
  };
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
  const missingPosition = ['timestamp', 'container_name'].filter((name) => !columns.includes(name));
  if (missingPosition.length > 0) {
    return {
      outcome: 'refused',
      reason: 'no-position-column',
      why:
        `${logs}: no '${missingPosition.join("', '")}' column, so a row cannot be placed on the ` +
        `grid; its columns are ${columns.join(', ')}`,
    };
  }
  // Either column will do, and the id is the one the corpus groups by. `RE2-SS` and
  // `RE2-TT` carry neither -- 246 of the corpus's 271 directories -- and until v3.93
  // that made them refusals, which said nothing about them. What the shape does
  // support is the marginal inequality: the published table is a partition of each
  // container's lines, so its column sums cannot exceed the lines it summarizes.
  const keyed = ['cluster_id', 'log_template'].filter((name) => columns.includes(name));
  if (keyed.length === 0) {
    const published = firstRecord(join(dir, LOGTS));
    if (published.length === 0) {
      return {
        outcome: 'refused',
        reason: 'unreadable-logts-header',
        why: `${join(dir, LOGTS)}: the published table has no header, so no column can be attributed to a container`,
      };
    }
    if ((published[0] ?? '') !== 'time') {
      return {
        outcome: 'refused',
        reason: 'unreadable-logts-header',
        why:
          `${join(dir, LOGTS)}: its first column is '${published[0] ?? ''}' and every corpus table starts ` +
          "with 'time', so the buckets cannot be aligned with the log rows",
      };
    }
    const containers = [];
    for (const name of published.slice(1)) {
      const container = containerOfColumn(name);
      if (container === undefined) {
        return {
          outcome: 'refused',
          reason: 'unreadable-logts-column',
          why:
            `${join(dir, LOGTS)}: '${name}' is not '<container>_<cluster key>', so the inequality cannot ` +
            `say which container it counts; its columns are ${published.join(', ')}`,
        };
      }
      containers.push(container);
    }
    const counted = countRowsByContainer(logRows(logs, columns, refusal));
    if (refusal.why !== '') return { outcome: 'refused', ...refusal };

    const marginal = compareMarginals(
      readFileSync(join(dir, LOGTS), 'utf8'),
      containers,
      counted.counts,
      label,
    );
    // The bound is against the file's rows, so the row count belongs beside the
    // comparison rather than inside it: `compareMarginals` reads the published table
    // and never opens `logs.csv`.
    marginal.logRows = counted.total;
    if (marginal.pairs === 0) {
      // A table with no non-zero cell is not a weak pass: nothing was compared, and
      // "the claim held" and "there was no claim" print the same number of failures.
      return {
        outcome: 'refused',
        reason: 'no-published-cells',
        why:
          `${join(dir, LOGTS)} has no non-zero cell, so the inequality was never asked; a table of zeros ` +
          'is not a bound on anything',
      };
    }
    return { outcome: marginal.problems.length === 0 ? 'bounded' : 'disagreed', marginal };
  }

  const grid = reduceLogts(logRows(logs, columns, refusal), clusters);
  if (refusal.why !== '') return { outcome: 'refused', ...refusal };

  const published = comparePublished(readFileSync(join(dir, LOGTS), 'utf8'), grid, label);
  const problems = [...published.problems];
  // The two columns are two statements about the same row, and a row whose text
  // names one cluster and whose id names another is a corpus this rule would hide
  // by preferring one of them.
  if (grid.contradicted > 0) {
    problems.unshift(
      `${label}: ${grid.contradicted} row(s) name one cluster by 'cluster_id' and a different one by ` +
        "'log_template'; the two columns are two statements about the same row and this one disagrees " +
        'with itself',
    );
  }
  const notes = [];
  for (const refused of ['tracets_lat.csv', 'tracets_err.csv']) {
    if (!existsSync(join(dir, refused))) continue;
    notes.push(
      `${label}: ${refused} is present and is not produced by this repository -- it is not a function ` +
        `of traces.csv (seven candidate reductions, 0 of 1649 cells, finding 307)`,
    );
  }
  if (grid.maskedTemplate > 0) {
    notes.push(
      `${label}: ${grid.maskedTemplate} of ${grid.byClusterId} row(s) counted by id carried a template ` +
        'that matches no key -- a masked template, not a different cluster',
    );
  }
  if (grid.dropped > 0) {
    notes.push(`${label}: ${grid.dropped} log row(s) name no cluster and appear in no column`);
  }

  return {
    outcome: problems.length === 0 ? 'reproduced' : 'disagreed',
    cells: published.cells,
    rows: published.rows,
    columns: published.columns,
    wrong: published.wrong ?? 0,
    problems,
    notes,
    grid,
  };
}

/** One sentence per refusal reason, for the tally in the summary. */
const REFUSAL_REASONS = {
  'no-cluster-table': 'no cluster table',
  'unreadable-cluster-table': 'a cluster table that is not a table',
  'no-logs': 'no logs.csv',
  'no-position-column': 'no timestamp or container column',
  'unreadable-logts-header': 'a published table whose first column is not a bucket',
  'unreadable-logts-column': 'a published column that is not <container>_<cluster key>',
  'no-published-cells': 'a published table with no non-zero cell',
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
  let differingCells = 0;
  let disagreeing = 0;
  let countedById = 0;
  let countedByTemplate = 0;
  let masked = 0;
  let dropped = 0;
  let contradicted = 0;
  let bounded = 0;
  let boundedBreaches = 0;
  let boundedPairs = 0;
  let boundedCells = 0;
  let boundedRows = 0;
  let boundedTightest = Infinity;

  for (const dir of dirs) {
    const label = basename(dir) === dir ? dir : relative(root, dir) || dir;
    const result = checkCase(dir, label);

    if (result.outcome === 'refused') {
      refused += 1;
      refusedBy.set(result.reason, (refusedBy.get(result.reason) ?? 0) + 1);
      console.log(`${label}: refused -- ${result.why}`);
      continue;
    }

    // The weak claim is a different statement about a different set of files, so it
    // is counted and printed in its own clause rather than folded into the exact
    // one. A reviewer reading `25 reproduced` beside `81 342 cells` needs to know
    // that 246 more directories were checked and what was checked about them.
    if (result.marginal !== undefined) {
      const marginal = result.marginal;
      for (const problem of marginal.problems) problems.push(problem);
      if (marginal.problems.length > 0) {
        boundedBreaches += 1;
        console.log(
          `${label}: bounded -- ${marginal.publishedTotal} published log cell(s) against ${marginal.logRows} ` +
            `row(s), ${marginal.problems.length} (container, bucket) pair(s) over the bound`,
        );
        continue;
      }
      bounded += 1;
      boundedPairs += marginal.pairs;
      boundedCells += marginal.publishedTotal;
      boundedRows += marginal.logRows;
      if (marginal.tightest < boundedTightest) boundedTightest = marginal.tightest;
      console.log(
        `${label}: bounded -- ${marginal.pairs} (container, bucket) pair(s), ` +
          `${marginal.publishedTotal} published log cell(s) against ${marginal.logRows} row(s) of ` +
          `${marginal.columns} column(s), ${marginal.tightest} spare row(s) at the tightest`,
      );
      continue;
    }

    for (const note of result.notes) console.log(note);
    for (const problem of result.problems) problems.push(problem);
    countedById += result.grid.byClusterId;
    countedByTemplate += result.grid.byTemplate;
    masked += result.grid.maskedTemplate;
    dropped += result.grid.dropped;
    contradicted += result.grid.contradicted;
    if (result.outcome === 'disagreed') {
      disagreeing += 1;
      differingCells += result.wrong;
    }
    // Not "all equal": a case that disagrees with the corpus is the one case where
    // the sentence must not say it agrees. It said so until v3.90, and a case whose
    // cells all agree while its two columns contradict each other said so again
    // until v3.91 -- hence the trailing clause.
    const verdict =
      result.wrong > 0
        ? `${result.wrong} differ`
        : result.problems.length === 0
          ? 'all equal'
          : `all equal, but ${result.problems.length} problem(s) remain`;
    console.log(
      `${label}: ${result.rows} row(s) x ${result.columns} column(s) = ${result.cells} cell(s), ${verdict}`,
    );
    if (result.outcome === 'reproduced') {
      cells += result.cells;
      reproduced += 1;
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-aggregate-tables: ${problem}`);
    // The count of sentences is not the count of anything wrong: five cells in one
    // case produce five sentences and one further-cell sentence, so a run that says
    // "21 problem(s)" over 58 differing cells names a number nobody can act on
    // (finding 537). Both counts are printed now, and they are both counted.
    // Each cause is named only when it happened. A bounded-only run that breached the
    // inequality would otherwise print `0 cell(s) differ across 0 case(s)`, which reads
    // as "nothing was wrong" at the head of a failure line.
    const causes = [
      disagreeing > 0 ? `${differingCells} cell(s) differ across ${disagreeing} case(s)` : '',
      boundedBreaches > 0 ? `${boundedBreaches} case(s) publish more log cell(s) than their own logs.csv holds` : '',
    ]
      .filter((clause) => clause !== '')
      .join('; ');
    console.error(
      `check-aggregate-tables: FAILED (${causes === '' ? '' : `${causes}; `}${problems.length} problem(s) reported)`,
    );
    process.exit(1);
  }

  // A run that reproduced nothing has checked nothing, and "nothing was wrong" and
  // "nothing was compared" print the same number of failures. A bounded case is a
  // check, so it keeps this run from being vacuous -- but it is not a reproduction,
  // and the summary below says so in the clause that counts it (finding 542).
  if (reproduced === 0 && bounded === 0) {
    console.error(
      `check-aggregate-tables: FAILED (0 of ${dirs.length} case(s) could be reproduced or bounded, which is ` +
        'not a pass -- the refusals above say why each one could not be read)',
    );
    process.exit(1);
  }

  const tally = [...refusedBy.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([reason, count]) => `${count} for ${REFUSAL_REASONS[reason] ?? reason}`)
    .join(', ');
  // How a row was counted, not only how many were: a run where every row came in
  // through a masked template is a run whose table agrees with the corpus for a
  // reason nobody would have guessed from a cell count. A run that walked no exact
  // case at all says nothing here rather than printing the zeroes of a path it never
  // entered -- `0 row(s) counted by their own cluster id` in a bounded-only run reads
  // as a defect in the id column, which is not what happened.
  const provenance =
    countedById + countedByTemplate + dropped + contradicted === 0
      ? ''
      : [
          `${countedById} row(s) counted by their own cluster id`,
          masked > 0 ? `${masked} of them under a masked template` : '',
          countedByTemplate > 0 ? `${countedByTemplate} by their rendered template` : '',
          dropped > 0 ? `${dropped} named no cluster` : '',
          // Said even when it is zero, because a zero here is the claim that the two
          // columns agree everywhere they both speak -- which is what makes preferring
          // one of them a reading of the corpus rather than a choice made about it.
          `${contradicted} named two different clusters`,
        ]
          .filter((clause) => clause !== '')
          .join(', ');
  // The exact claim and the weak one are counted apart, and the weak one says what it
  // is in the same sentence that gives its number: `bounded` is a marginal inequality
  // over the container, not a reproduction of the cluster columns (finding 542).
  const exact =
    reproduced === 0
      ? '0 case(s) reproduced'
      : `${reproduced} case(s) reproduced, ${cells} cell(s) reduced from logs.csv and equal to the corpus's own ${LOGTS}`;
  const withinBound =
    bounded === 0
      ? ''
      : `; ${bounded} case(s) bounded, not reproduced: the marginals of logts.csv hold no more log cell(s) ` +
        `than logs.csv has rows for that container, ${boundedPairs} (container, bucket) pair(s), ` +
        `${boundedTightest} spare row(s) at the tightest over ${boundedCells} published cell(s) against ` +
        `${boundedRows} log row(s)`;
  console.log(
    `check-aggregate-tables: OK (${exact}` +
      (provenance === '' ? '' : `; ${provenance}`) +
      withinBound +
      (refused > 0 ? `; ${refused} refused, ${tally}` : '') +
      ')',
  );
}

main();
