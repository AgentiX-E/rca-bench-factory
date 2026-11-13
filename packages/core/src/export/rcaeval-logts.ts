import { renderCsv, type CsvCell } from '../util/csv.js';

/**
 * The `logts.csv` reduction, measured from the corpus rather than described.
 *
 * ## What the documentation said, and what the file is
 *
 * `docs/targets/rcaeval.md` described `logts.csv` as "log counts per pod" and
 * `tracets_lat.csv` as "per-endpoint request counts, **one row a minute**". Both
 * halves of that are wrong for the file the corpus ships, and the way they are
 * wrong is instructive:
 *
 *  - there is one row per **15 seconds**, not per minute. `RE2-OB/checkoutservice_cpu/1`
 *    has 97 rows spanning 1705353840..1705355280, and the step between consecutive
 *    `time` values is 15 on every row, with no gaps;
 *  - the columns are not pods. Each one is a **cluster key** from the same
 *    directory's `cluster_info.json`, spelled `<container>_<key>`, ordered by the
 *    key as an integer.
 *
 * Neither sentence could be checked by anything, because nothing in this
 * repository had ever opened either file. They are corrected here and in the
 * target document, and the correction is a measurement rather than a preference
 * (finding 307).
 *
 * ## The reduction is exact, and that is why it is here
 *
 * For that case, reducing `logs.csv` with `cluster_info.json` reproduces
 * `logts.csv` **cell for cell**: 97 rows by 30 columns, 2910 cells, none different.
 * That is a strong enough statement to be worth an executable check, and it is
 * what `scripts/check-aggregate-tables.mjs` does where the archive is. What this
 * module supplies is the rule that check applies.
 *
 * The rule, in full:
 *
 * 1. bucket = `floor(epochSeconds / 15) * 15`;
 * 2. a log row belongs to every cluster whose `container` equals its
 *    `container_name` **and** whose `template` equals its `log_template`, matched
 *    exactly -- the corpus writes the rendered template text, not an id;
 * 3. a row matching no cluster is dropped, and counted, because the corpus's own
 *    file drops twenty `redis` lines whose `log_template` is empty;
 * 4. the grid is dense from the first row's bucket to the last row's, so a quiet
 *    minute is a row of zeros rather than a missing row -- a sparser table would be
 *    indistinguishable from a shorter run;
 * 5. the grid is bounded by **every** row's instant, including the dropped ones:
 *    the window belongs to the log stream, not to the subset that was counted.
 *
 * ## Why the reduction is a fold and not a table
 *
 * The rule above is stated over "the rows", and the first implementation read that
 * as "an array of rows": `buildLogtsCsv(rows, clusters)` took the whole array and
 * returned the whole table. Both halves are proportional to the corpus, and the
 * corpus is 202 258 338 bytes for its largest `logs.csv`, so a caller that wanted
 * *one cell* had to hold every row and every bucket first (finding 533).
 *
 * `reduceLogts` is the same rule as a fold: it takes any iterable of rows and keeps
 * only what the rule needs -- one entry per (bucket, column) that was actually
 * observed. The grid is then *read* a bucket at a time by `logtsCells`, which is
 * what lets the gate compare a 202 MB reduction against the corpus one line at a
 * time. `buildLogtsCsv` is the materialising caller of that fold, kept because the
 * assembler and the Golden Master want text.
 *
 * ## Why this is a reducer and not an exporter
 *
 * `exportRcaEval` does not write `logts.csv`, and should not: its column *names*
 * are cluster keys, and cluster keys exist only in the corpus's
 * `cluster_info.json`. A bundle from this repository's ingest has no such table,
 * so an exporter would have to invent the keys -- and an invented key is a
 * plausible-looking number that no corpus will ever match. This module is the
 * instrument that keeps a *corpus reproduction* honest, which is a different job
 * from claiming the IR can carry the corpus's log clustering. It cannot, and
 * `RCAEVAL_UNFILLED_COLUMNS['logs/RE2']` already says so about the column the
 * clustering is derived from.
 */

/** One row per 15 seconds, measured from `RE2-OB/checkoutservice_cpu/1`. */
export const LOGTS_BUCKET_SECONDS = 15;

/** One cluster from `cluster_info.json`, flattened to a single container. */
export interface LogCluster {
  /** The map key, a decimal string (`"1"`..`"30"` in the measured case). */
  key: string;
  /** One container the cluster's template is emitted by. */
  container: string;
  /** The rendered template text, matched against `log_template` exactly. */
  template: string;
}

/**
 * One log line, reduced to what the aggregate needs.
 *
 * `atSeconds` is whole seconds, and the caller floors the corpus's own column to
 * get it. It does not accept the raw `timestamp` value: that column is
 * nanoseconds, and a 19-digit integer does not survive a round trip through a
 * double -- which is the same defect that made the exporter write microseconds
 * into it (finding 306). Keeping the division at the boundary where the newline
 * is parsed means the loss, if any, is visible in one place.
 */
export interface LogRow {
  container: string;
  template: string;
  /** Unix seconds. */
  atSeconds: number;
}

export interface LogtsTable {
  csv: string;
  /** Rows that matched no cluster, and so appear in no column. */
  dropped: number;
}

/**
 * The column of the table that carries the bucket's instant.
 *
 * Named once, because it is compared: the gate reads this column out of the
 * corpus's own file and out of the reduction, and two spellings of it would be two
 * things that could disagree about which column is which.
 */
export const LOGTS_TIME_COLUMN = 'time';

/**
 * Everything the reduction needs to keep, and nothing else.
 *
 * `lowest` and `highest` are `Infinity` and `-Infinity` when no row was seen, which
 * is the same pair `Math.min`/`Math.max` over an empty sequence produce: a caller
 * that compares them has to handle it, and a caller that loops `lowest..highest`
 * produces no row at all, which is the right answer for a case with no logs.
 */
export interface LogtsGrid {
  /** Column names, `<container>_<cluster key>`, deduplicated and ordered. */
  columns: string[];
  /** Per bucket, per column, the number of log rows in it. Only buckets with a match. */
  counts: Map<number, Map<string, number>>;
  lowest: number;
  highest: number;
  dropped: number;
  /** How many rows the fold consumed, so a caller can tell "no logs" from "no matches". */
  seen: number;
}

/**
 * Fold log rows into the counts `logts.csv` is made of.
 *
 * Deterministic and independent of the order rows arrive in: the columns come from
 * the cluster list, and the grid's extent from the minimum and maximum bucket --
 * including the buckets of rows that matched no cluster, because the window belongs
 * to the log stream rather than to the subset that was counted.
 */
export function reduceLogts(rows: Iterable<LogRow>, clusters: readonly LogCluster[]): LogtsGrid {
  const columns = columnsOf(clusters);
  const columnOfCluster = clusterColumns(clusters);

  const counts = new Map<number, Map<string, number>>();
  let lowest = Infinity;
  let highest = -Infinity;
  let dropped = 0;
  let seen = 0;

  for (const row of rows) {
    seen += 1;
    const bucket = Math.floor(row.atSeconds / LOGTS_BUCKET_SECONDS) * LOGTS_BUCKET_SECONDS;
    if (bucket < lowest) lowest = bucket;
    if (bucket > highest) highest = bucket;
    const into = columnOfCluster.get(`${row.container}\u0000${row.template}`);
    if (into === undefined) {
      dropped += 1;
      continue;
    }
    let perBucket = counts.get(bucket);
    if (perBucket === undefined) {
      perBucket = new Map<string, number>();
      counts.set(bucket, perBucket);
    }
    for (const column of into) perBucket.set(column, (perBucket.get(column) ?? 0) + 1);
  }

  return { columns, counts, lowest, highest, dropped, seen };
}

/** The header of the table, `time` then the column names in order. */
export function logtsHeader(columns: readonly string[]): string[] {
  return [LOGTS_TIME_COLUMN, ...columns];
}

/**
 * One bucket's row: its instant, then a count per column.
 *
 * A bucket with no matching row is a row of zeros rather than a missing row, which
 * is the density rule stated over a fold instead of over an array.
 */
export function logtsCells(grid: LogtsGrid, bucket: number): CsvCell[] {
  const perBucket = grid.counts.get(bucket);
  const cells: CsvCell[] = [bucket];
  for (const column of grid.columns) cells.push(perBucket?.get(column) ?? 0);
  return cells;
}

/**
 * The column names, deduplicated, sorted by the cluster key as an integer.
 *
 * Sorted by key as an integer, then by key as text so a non-numeric key still has a
 * defined place. The measured case needs neither half to be clever: its keys are
 * `1`..`30`, where a string sort would put `10` before `2` and push every column
 * past the ninth one position left.
 */
function columnsOf(clusters: readonly LogCluster[]): string[] {
  const ordered = [...clusters].sort(
    (left, right) => Number(left.key) - Number(right.key) || left.key.localeCompare(right.key),
  );
  const columns: string[] = [];
  for (const cluster of ordered) {
    const column = `${cluster.container}_${cluster.key}`;
    if (!columns.includes(column)) columns.push(column);
  }
  return columns;
}

/**
 * Which columns one `(container, template)` pair counts into.
 *
 * Deduplicated by column name: `cluster_info.json` lists a key's containers as an
 * array, so flattening it produces one entry per (key, container) and a key that
 * names the same container twice would otherwise be counted twice.
 */
function clusterColumns(clusters: readonly LogCluster[]): Map<string, string[]> {
  const columnOfCluster = new Map<string, string[]>();
  for (const cluster of clusters) {
    const column = `${cluster.container}_${cluster.key}`;
    const at = `${cluster.container}\u0000${cluster.template}`;
    const existing = columnOfCluster.get(at);
    if (existing === undefined) columnOfCluster.set(at, [column]);
    else if (!existing.includes(column)) existing.push(column);
  }
  return columnOfCluster;
}

export function buildLogtsCsv(
  rows: readonly LogRow[],
  clusters: readonly LogCluster[],
): LogtsTable {
  const grid = reduceLogts(rows, clusters);
  if (grid.seen === 0) return { csv: renderCsv(logtsHeader(grid.columns), []), dropped: 0 };

  // One `push` per column rather than `push(...columns.map(...))`: a spread whose
  // length is a function of the input is the shape the argument-limit guard
  // refuses, and an exemption for "it is only thirty" would weaken that guard to
  // save three lines.
  const body: CsvCell[][] = [];
  for (let bucket = grid.lowest; bucket <= grid.highest; bucket += LOGTS_BUCKET_SECONDS) {
    body.push(logtsCells(grid, bucket));
  }
  return { csv: renderCsv(logtsHeader(grid.columns), body), dropped: grid.dropped };
}
