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
 * 2. a row belongs to the column `<container_name>_<cluster_id>` when the file
 *    carries a `cluster_id` column, the id is non-empty, and `cluster_info.json`
 *    names that key for that container;
 * 3. a row that carries no id is matched by its **rendered** `log_template`
 *    against the cluster table's `template`, exactly, and counts into every
 *    column whose (container, template) it equals;
 * 4. a row matching neither is dropped, and counted, because the corpus's own
 *    file drops the `redis` lines whose id and template are both empty;
 * 5. the grid is dense from the first row's bucket to the last row's, so a quiet
 *    minute is a row of zeros rather than a missing row -- a sparser table would be
 *    indistinguishable from a shorter run;
 * 6. the grid is bounded by **every** row's instant, including the dropped ones:
 *    the window belongs to the log stream, not to the subset that was counted.
 *
 * ## Why the id is read before the template, and what the template was hiding
 *
 * Rule 3 alone reproduced the corpus for 20 of the 24 cases that carry a rendered
 * template, and disagreed on the other four -- all four of them `_loss` cases, and
 * all four by a handful of cells. The reason is that `log_template` is **not
 * always the rendered text**: some of a case's rows carry a Drain-masked template
 * instead (`... for product <:*:> rpc error ...`), which matches no key in
 * `cluster_info.json` and so was dropped, while the corpus's own file had counted
 * it. Measured on the archive, one case each:
 *
 * | case | rows with a masked template | cells different, template rule | cells different, id rule |
 * | --- | --- | --- | --- |
 * | `RE2-OB/currencyservice_loss/1` | 162 of 131 811 | 37 of 4559 | 0 |
 * | `RE2-OB/emailservice_loss/1` | 6 | 6 of 3395 | 0 |
 * | `RE2-OB/productcatalogservice_loss/1` | 5 | 3 of 7008 | 0 |
 * | `RE2-OB/recommendationservice_loss/1` | 548 | 12 of 6305 | 0 |
 * | `RE2-OB/checkoutservice_cpu/1` (control) | 0 | 0 of 2910 | 0 |
 *
 * So the column the corpus groups by is `cluster_id`; the template is a rendering
 * of it, and the rendering is inconsistent in exactly the cases a fault injector
 * re-clustered. Reading the id first is therefore not a shortcut, it is the rule
 * the corpus applies -- and rule 3 is kept as the fallback **and** as a second
 * claim, because on the rows where both columns speak the two must agree. Where
 * they do not, this module counts the disagreement (finding 536) and the gate
 * fails on it: a row whose text names one cluster and whose id names another is a
 * corpus this reduction would otherwise paper over.
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
  /**
   * The cluster key the corpus itself filed this row under.
   *
   * Present when the case's `logs.csv` carries a `cluster_id` column, which 24 of
   * the 181 case directories do. It is the column the corpus's own `logts.csv`
   * groups by -- see the module comment -- and an empty string is the corpus's way
   * of saying the row was never clustered, which is a drop rather than a column.
   */
  clusterId?: string;
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
  /** Rows counted into the column their own `cluster_id` names. */
  byClusterId: number;
  /** Rows counted by an exact match on their rendered template, because they had no id. */
  byTemplate: number;
  /**
   * Rows counted by id whose rendered template names no cluster at all.
   *
   * That is what a masked template looks like from here (`... product <:*:> ...`),
   * and counting them rather than dropping them is the whole of finding 536: the
   * corpus counted them too, and the earlier rule counted them as absent.
   */
  maskedTemplate: number;
  /** Rows whose id and rendered template name **different** clusters. Must be zero. */
  contradicted: number;
}

/**
 * Fold log rows into the counts `logts.csv` is made of.
 *
 * Deterministic and independent of the order rows arrive in: the columns come from
 * the cluster list, the extent from the minimum and maximum bucket -- including the
 * buckets of rows that matched no cluster, because the window belongs to the log
 * stream rather than to the subset that was counted -- and the four tallies say
 * *how* a row was counted rather than only that it was.
 */
export function reduceLogts(rows: Iterable<LogRow>, clusters: readonly LogCluster[]): LogtsGrid {
  const columns = columnsOf(clusters);
  const columnOfId = columnsByClusterId(clusters);
  const columnOfTemplate = columnsByTemplate(clusters);

  const counts = new Map<number, Map<string, number>>();
  let lowest = Infinity;
  let highest = -Infinity;
  let dropped = 0;
  let seen = 0;
  let byClusterId = 0;
  let byTemplate = 0;
  let maskedTemplate = 0;
  let contradicted = 0;

  for (const row of rows) {
    seen += 1;
    const bucket = Math.floor(row.atSeconds / LOGTS_BUCKET_SECONDS) * LOGTS_BUCKET_SECONDS;
    if (bucket < lowest) lowest = bucket;
    if (bucket > highest) highest = bucket;

    const fromId =
      row.clusterId === undefined || row.clusterId === ''
        ? undefined
        : columnOfId.get(`${row.container}\u0000${row.clusterId}`);
    const fromTemplate = columnOfTemplate.get(`${row.container}\u0000${row.template}`);

    let into: string[];
    if (fromId !== undefined) {
      // The id speaks, and the template is read only to be able to say whether it
      // agreed: a masked template names no cluster, and a template naming a
      // different cluster than the id is a corpus this rule should not hide.
      into = [fromId];
      byClusterId += 1;
      if (fromTemplate === undefined) maskedTemplate += 1;
      else if (!fromTemplate.includes(fromId)) contradicted += 1;
    } else if (fromTemplate !== undefined) {
      into = fromTemplate;
      byTemplate += 1;
    } else {
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

  return {
    columns,
    counts,
    lowest,
    highest,
    dropped,
    seen,
    byClusterId,
    byTemplate,
    maskedTemplate,
    contradicted,
  };
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
 * Which column one `(container, cluster id)` pair counts into.
 *
 * One entry per pair: a key names its containers as an array, so the same key can
 * produce several columns and the same column cannot be produced twice.
 */
function columnsByClusterId(clusters: readonly LogCluster[]): Map<string, string> {
  const columnOfId = new Map<string, string>();
  for (const cluster of clusters) {
    columnOfId.set(`${cluster.container}\u0000${cluster.key}`, `${cluster.container}_${cluster.key}`);
  }
  return columnOfId;
}

/**
 * Which columns one `(container, template)` pair counts into.
 *
 * Deduplicated by column name: `cluster_info.json` lists a key's containers as an
 * array, so flattening it produces one entry per (key, container) and a key that
 * names the same container twice would otherwise be counted twice.
 */
function columnsByTemplate(clusters: readonly LogCluster[]): Map<string, string[]> {
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
