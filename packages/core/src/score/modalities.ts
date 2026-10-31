import { parseDelimited } from '../ingest/file.js';
import { normaliseLogSeverity } from '../ir/types.js';

/**
 * Comparing a corpus's log/trace table with the export of that same case.
 *
 * ## Why this exists
 *
 * The fourth anchor round-trips a real corpus through this project's export and
 * scores the result with RCAEval's published rule. For four rounds that number was
 * 1.00 on 735 cases while `logs.csv` and `traces.csv` held **a header and no
 * rows**: the official metric reads the case *directory name* and the metric
 * table, so the two files the RE3 slice exists for were never looked at by
 * anything, and the shape check was satisfied by their being present. A file that
 * exists and says nothing is the "empty run" this project keeps finding one layer
 * out (finding 266 found it in the columns; finding 315 found it in the rows).
 *
 * With the corpus's own tables fed through the ingest, the question becomes exact
 * rather than rhetorical: **is the exported table the corpus's table?** That is
 * this module, and its answer is not one bit. Four things can be true of a
 * column:
 *
 *  - `exact` -- every cell survives, so the column is compared as a multiset of
 *    strings;
 *  - `truncated` -- the cell is an instant the IR stores at millisecond
 *    resolution while the corpus writes microseconds or nanoseconds; the export
 *    carries the same instant with the finer digits zeroed, so the comparison is
 *    made against the truncation and the count of cells that were *not* exactly
 *    representable is reported rather than absorbed;
 *  - `not-carried` -- the IR has no field for it (or, for `traces.statusCode, a
 *    field in a different vocabulary), so the export writes it empty and the
 *    count of values the corpus had is reported as a loss.
 *
 * ## What the gate is, and what is only diagnosis
 *
 * `rowsMatch` is the assertion: the multiset of row signatures over the compared
 * columns is identical on both sides. Per-column counts are *diagnosis* -- they
 * say which column to look at when the assertion fails -- and they are computed
 * per column independently, so a column's count being zero does not prove the
 * rows agree. Keeping the two apart is what stops a per-column reading from being
 * mistaken for the proof, which is the failure mode `provenance` had before
 * finding 181.
 *
 * Signatures are built from the compared columns only, joined by a separator that
 * cannot occur in a cell (`\u001f`), so a message containing a comma is not a
 * column boundary.
 */

/** The two per-case tables whose content this module compares. */
export const MODALITY_TABLES = ['logs', 'traces'] as const;

export type ModalityTable = (typeof MODALITY_TABLES)[number];

/**
 * The units an instant column can be truncated from.
 *
 * Derived from the same statement the exporter makes in
 * `RCAEVAL_INSTANT_COLUMNS`: a column either holds nanoseconds or microseconds,
 * and the IR holds milliseconds. Only these two, because those are the two the
 * corpora write.
 */
export const TRUNCATED_UNITS = ['ns', 'us'] as const;

export type TruncatedUnit = (typeof TRUNCATED_UNITS)[number];

/**
 * The spelling normalisations a column can go through on its way into the IR.
 *
 * The IR's severity vocabulary is upper case (`LOG_SEVERITIES`), and RE2-OB's
 * `level` column is not: of the 171 322 log rows in `RE2-OB/checkoutservice_cpu/1`,
 * 70 921 say `info` and 23 971 say `INFO`. That is one severity written two ways by
 * two log libraries in one cluster, not two severities, so the reader upper-cases
 * the cell and the closed vocabulary admits both.
 *
 * The consequence for the round trip is that the exported cell is `INFO` where the
 * corpus's cell was `info`. Comparing those two directly would report 70 921
 * differences per case -- a normalisation read as a loss. So the comparison is made
 * after the same transform, and the column is neither "exact" (it is not
 * byte-identical) nor "truncated" (no digits were dropped).
 */
export const COLUMN_TRANSFORMS = ['upper-case', 'severity', 'alias'] as const;

export type ColumnTransform = (typeof COLUMN_TRANSFORMS)[number];

/** How one column of the corpus's table relates to the export's. */
export type ColumnComparison =
  | { readonly column: string; readonly kind: 'exact' }
  | { readonly column: string; readonly kind: 'truncated'; readonly unit: TruncatedUnit }
  /**
   * A column whose spelling is normalised on the way into the IR; compared normalised.
   *
   * `aliases` belongs to `transform: 'alias'` -- the same table the reading plan gave
   * the ingest as `serviceAliases`. It is passed rather than looked up because the
   * mapping is a fact about one corpus (RE2-OB writes `frontendservice` in its spans
   * and `frontend` in its logs), and a table hard-coded here would be a second copy
   * of that fact with nothing keeping the two in step.
   */
  | {
      readonly column: string;
      readonly kind: 'normalised';
      readonly transform: ColumnTransform;
      readonly aliases?: Readonly<Record<string, string>>;
    }
  /**
   * A column the exporter derives from an instant in the same table.
   *
   * `time` is `HH:MM` of the instant, and the corpus stores its own rendering of
   * the same fact. Comparing the two cells directly would be comparing two
   * *derivations*, and RE3-OB's own derivations disagree with each other: of the
   * 61 828 log rows in `RE3-OB/currencyservice_f1/1`, one has `time` = `06:17`
   * beside a `timestamp` of `1731910619999999863` ns -- 06:16:59.999999863. The
   * corpus computed that minute through a double, at microsecond resolution, and
   * 0.14 us below the boundary rounded up across it.
   *
   * So the check is against the **instant**, not against the corpus's rendering:
   * the exported cell must be the minute of the corpus's own instant, and the
   * cells where the corpus disagrees with itself are counted and reported. A
   * `time` column an hour off, or empty, still fails; a corpus that rounds its own
   * timestamps does not.
   */
  | { readonly column: string; readonly kind: 'derived'; readonly from: string }
  | { readonly column: string; readonly kind: 'not-carried' };

/** One column's diagnosis. Never the proof; see the module comment. */
export interface ColumnReading {
  readonly column: string;
  readonly kind: ColumnComparison['kind'];
  /** Cells that differ between the two tables under this column's comparison. */
  readonly differ: number;
  /**
   * Cells the export could not reproduce for a stated reason: the finer digits of
   * an instant, or a value in a column the IR does not carry.
   */
  readonly lossy: number;
}

export interface ModalityComparison {
  readonly table: ModalityTable;
  readonly corpusRows: number;
  readonly exportedRows: number;
  /** The two tables have the same number of rows. */
  readonly rowCountMatches: boolean;
  /** The multiset of compared rows is the same on both sides. **This is the gate.** */
  readonly rowsMatch: boolean;
  /** Signatures present on one side and not the number of times the other has them. */
  readonly onlyInCorpus: number;
  readonly onlyInExport: number;
  /** Up to three signatures, for a failure a reader can act on. */
  readonly examples: readonly string[];
  /** Per column, in the plan's order. Diagnosis only. */
  readonly columns: readonly ColumnReading[];
  /** Anything that made a comparison impossible: a missing column, a non-numeric leaf. */
  readonly problems: readonly string[];
}

/** The separator between two cells of a row signature. Cannot occur in a CSV cell. */
const SEP = '\u001f';

/** How many digits of a second each truncated unit has, and how many the IR keeps. */
const UNIT_SCALE: Record<TruncatedUnit, { perSecond: bigint; kept: bigint }> = {
  ns: { perSecond: 1_000_000_000n, kept: 1_000n },
  us: { perSecond: 1_000_000n, kept: 1_000n },
};

interface ParsedTable {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly problems: readonly string[];
}

function parseTable(text: string, label: string): ParsedTable {
  const { rows, errors } = parseDelimited(text, ',');
  const problems: string[] = [];
  const first = errors[0];
  if (first !== undefined) {
    problems.push(`${label} is not readable as CSV: line ${first.line} ${first.reason}`);
  }
  const header = rows[0];
  if (header === undefined) return { header: [], rows: [], problems: [...problems, `${label} is empty`] };
  return { header, rows: rows.slice(1), problems };
}

/**
 * One instant cell, truncated to the resolution the IR keeps.
 *
 * `BigInt` and not `Number`: a nanosecond instant needs 61 bits
 * (`1731910960181130857` is 1.7e18) and a double carries 53, so `Number(cell)`
 * would compare a neighbouring instant and call it equal. The exporter multiplies
 * with `BigInt` for the same reason, and this is the reader's half of that
 * decision -- a pair of conversions that agree only because both are exact.
 */
function truncateInstant(cell: string, unit: TruncatedUnit): { text: string; exact: boolean } | undefined {
  // An empty cell is not the epoch, and `BigInt('')` is `0n`: without this line a
  // missing instant would compare as 1970-01-01 and agree with an export that wrote
  // a zero. The shape is the reader's, taken from `parseTimestamp`, so a value this
  // module accepts is a value that parser would accept too.
  if (!/^-?\d+$/.test(cell)) return undefined;
  const value = BigInt(cell);
  const { perSecond, kept } = UNIT_SCALE[unit];
  const step = perSecond / kept;
  const truncated = (value / step) * step;
  return { text: truncated.toString(), exact: value === truncated };
}

function addTo(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * A cell in the shape the IR holds it.
 *
 * Exhaustive over `ColumnTransform` and ending in nothing: one member today, and a
 * second would fail to compile here rather than pass through silently -- which is
 * the mistake `COLUMN_ALIASES` made once, keeping a branch for a transform that no
 * longer existed while a new one went unhandled.
 */
function applyTransform(cell: string, transform: ColumnTransform, aliases?: Readonly<Record<string, string>>): string {
  switch (transform) {
    case 'upper-case':
      return cell.toUpperCase();
    case 'severity':
      // Through the same lookup the ingest uses. A cell the IR would have rejected
      // falls back to its upper-cased form, so it differs from the exported cell
      // instead of quietly agreeing with a value nothing wrote.
      return normaliseLogSeverity(cell) ?? cell.toUpperCase();
    case 'alias':
      // Exact-match and one-way, exactly as `FileIngestOptions.serviceAliases` is.
      return aliases?.[cell] ?? cell;
  }
}

/** `HH:MM` in UTC of a whole-millisecond instant. */
function utcMinute(epochMs: number): string {
  const at = new Date(epochMs);
  return `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * A cell, or the empty string when the column or the cell is absent.
 *
 * Six inline `index === undefined ? '' : (row[index] ?? '').trim()` expressions
 * stood here, one per column kind and one per phase, and five of their twelve arms
 * were reached by no test -- which is the shape that hides a defect: a fallback
 * nobody exercises is a claim nobody has checked. The two absences are different
 * facts (a column a stale plan names; a row shorter than its header) and they are
 * one outcome here, because for a comparison both mean "no value on this side".
 */
function cellOrEmpty(rows: readonly (readonly string[])[], index: number | undefined, r: number): string {
  if (index === undefined) return '';
  return (rows[r]?.[index] ?? '').trim();
}

/** The minute an instant column holds, at the resolution the IR keeps. */
function minuteOfInstant(cell: string, unit: TruncatedUnit): string | undefined {
  const truncated = truncateInstant(cell, unit);
  if (truncated === undefined) return undefined;
  // Back to whole milliseconds before touching `Number`: a nanosecond instant is
  // 1.7e18 and converting that to a double first is the very defect this module's
  // caller was written to avoid (finding 316).
  const { perSecond, kept } = UNIT_SCALE[unit];
  return utcMinute(Number(BigInt(truncated.text) / (perSecond / kept)));
}

/** Cells on one side whose multiplicity the other side does not have. */
function asymmetricCount(left: Map<string, number>, right: Map<string, number>): number {
  let total = 0;
  for (const [key, count] of left) {
    const other = right.get(key) ?? 0;
    if (other < count) total += count - other;
  }
  return total;
}

/**
 * Compare one corpus table with the export of the same case.
 *
 * `plan` states, for every column of the corpus's table, how the export relates to
 * it. A column of the corpus that the plan omits is a `problem` rather than being
 * silently skipped: the plan is the claim, and a table with a column nobody
 * planned for is a claim that has already gone stale.
 */
export function compareModalityTables(args: {
  table: ModalityTable;
  corpus: string;
  exported: string;
  plan: readonly ColumnComparison[];
}): ModalityComparison {
  const corpus = parseTable(args.corpus, `the corpus's ${args.table} table`);
  const exported = parseTable(args.exported, `the exported ${args.table} table`);
  const problems: string[] = [...corpus.problems, ...exported.problems];

  const corpusIndex = new Map(corpus.header.map((name, index) => [name.trim(), index]));
  const exportIndex = new Map(exported.header.map((name, index) => [name.trim(), index]));

  for (const planned of args.plan) {
    if (!corpusIndex.has(planned.column)) {
      problems.push(`the corpus's ${args.table} table has no '${planned.column}' column`);
    }
    if (!exportIndex.has(planned.column)) {
      problems.push(`the exported ${args.table} table has no '${planned.column}' column`);
    }
  }
  for (const name of corpus.header) {
    if (!args.plan.some((planned) => planned.column === name.trim())) {
      problems.push(`'${name.trim()}' is in the corpus's ${args.table} table and no plan column names it`);
    }
  }

  // `normalised` columns stay in the signature, under the transform: a severity is
  // information the row carries, so a row whose level was dropped must not collide
  // with one whose level was `INFO`. `derived` columns stay out for the opposite
  // reason -- `time` restates an instant the signature already holds.
  const compared = args.plan.filter(
    (planned) => planned.kind === 'exact' || planned.kind === 'truncated' || planned.kind === 'normalised',
  );
  const rowCount = Math.min(corpus.rows.length, exported.rows.length);

  // Row signatures over the compared columns, from one side and the other. The
  // truncation is applied to the corpus's side only, because the export already
  // holds the truncated value.
  const signature = (row: readonly string[], index: Map<string, number>, side: 'corpus' | 'export'): string | undefined => {
    const cells: string[] = [];
    for (const planned of compared) {
      const at = index.get(planned.column);
      const cell = cellOrEmpty([row], at, 0);
      if (planned.kind === 'truncated') {
        if (side === 'corpus') {
          const truncated = truncateInstant(cell, planned.unit);
          if (truncated === undefined) {
            problems.push(`${args.table}.${planned.column} holds '${cell}', which is not an integer instant`);
            return undefined;
          }
          cells.push(truncated.text);
        } else {
          cells.push(cell);
        }
      } else if (planned.kind === 'normalised' && side === 'corpus') {
        // Same one-sided rule as the truncation above: the export must hold the
        // normalised spelling, so it is compared as written. Normalising both sides
        // would make an exporter that never upper-cased anything agree with a corpus
        // it did not reproduce.
        cells.push(applyTransform(cell, planned.transform, planned.aliases));
      } else {
        cells.push(cell);
      }
    }
    return cells.join(SEP);
  };

  const corpusCounts = new Map<string, number>();
  for (const row of corpus.rows) {
    const key = signature(row, corpusIndex, 'corpus');
    if (key !== undefined) addTo(corpusCounts, key);
  }
  const exportCounts = new Map<string, number>();
  for (const row of exported.rows) {
    const key = signature(row, exportIndex, 'export');
    if (key !== undefined) addTo(exportCounts, key);
  }

  const onlyInCorpus = asymmetricCount(corpusCounts, exportCounts);
  const onlyInExport = asymmetricCount(exportCounts, corpusCounts);
  const examples: string[] = [];
  for (const [key, count] of corpusCounts) {
    if ((exportCounts.get(key) ?? 0) < count && examples.length < 3) examples.push(`corpus only: ${key.split(SEP).join(' | ')}`);
  }
  for (const [key, count] of exportCounts) {
    if ((corpusCounts.get(key) ?? 0) < count && examples.length < 3) examples.push(`export only: ${key.split(SEP).join(' | ')}`);
  }

  const columns = args.plan.map((planned): ColumnReading => {
    const at = corpusIndex.get(planned.column);
    const ot = exportIndex.get(planned.column);
    if (planned.kind === 'derived') {
      // Against the corpus's instant, not against its rendering of it.
      const sourcePlan = args.plan.find((other) => other.column === planned.from);
      const unit = sourcePlan !== undefined && sourcePlan.kind === 'truncated' ? sourcePlan.unit : undefined;
      if (at === undefined || ot === undefined || unit === undefined) {
        problems.push(
          `'${planned.column}' is derived from '${planned.from}', which ` +
            (unit === undefined ? 'has no truncated plan entry' : 'is not a column of both tables'),
        );
        return { column: planned.column, kind: planned.kind, differ: rowCount, lossy: 0 };
      }
      const from = corpusIndex.get(planned.from);
      let differ = 0;
      let disagreed = 0;
      for (let r = 0; r < rowCount; r += 1) {
        const instant = cellOrEmpty(corpus.rows, from, r);
        const expected = minuteOfInstant(instant, unit);
        if (expected === undefined) continue;
        const ours = cellOrEmpty(exported.rows, ot, r);
        const theirs = cellOrEmpty(corpus.rows, at, r);
        if (ours !== expected) differ += 1;
        if (theirs !== expected) disagreed += 1;
      }
      return { column: planned.column, kind: planned.kind, differ, lossy: disagreed };
    }
    if (planned.kind === 'not-carried') {
      let carried = 0;
      let lost = 0;
      for (let r = 0; r < rowCount; r += 1) {
        const ours = cellOrEmpty(exported.rows, ot, r);
        const theirs = cellOrEmpty(corpus.rows, at, r);
        if (ours !== '') carried += 1;
        if (theirs !== '') lost += 1;
      }
      // Non-empty here is a defect in the exporter, not a difference of opinion:
      // the column is declared unfilled, so a value means the two statements
      // disagree.
      return { column: planned.column, kind: planned.kind, differ: carried, lossy: lost };
    }
    const mine = new Map<string, number>();
    const theirs = new Map<string, number>();
    let lossy = 0;
    for (let r = 0; r < rowCount; r += 1) {
      const rawTheir = cellOrEmpty(corpus.rows, at, r);
      const rawOurs = cellOrEmpty(exported.rows, ot, r);
      if (planned.kind === 'truncated') {
        const truncated = truncateInstant(rawTheir, planned.unit);
        if (truncated === undefined) continue;
        if (!truncated.exact) lossy += 1;
        addTo(theirs, truncated.text);
      } else if (planned.kind === 'normalised') {
        // One-sided, like the truncation: the corpus's spelling is what this module
        // reads, and the export is compared as written. A cell the transform changes
        // is counted as `lossy` -- the corpus did say `info`, and the exported table
        // cannot say it back.
        const normalised = applyTransform(rawTheir, planned.transform, planned.aliases);
        if (normalised !== rawTheir) lossy += 1;
        addTo(theirs, normalised);
      } else {
        addTo(theirs, rawTheir);
      }
      addTo(mine, rawOurs);
    }
    // One substitution is one cell, so the two multiset differences are not added.
    // They were, and a single `x` where the corpus had an empty cell was reported as
    // two differences -- a diagnostic that reads as "twice as many cells are wrong as
    // there are rows".
    const differ = Math.max(asymmetricCount(theirs, mine), asymmetricCount(mine, theirs));
    return { column: planned.column, kind: planned.kind, differ, lossy };
  });

  // A derived column is not in the row signature -- `time` is a rendering of an
  // instant the signature already carries -- so its verdict has to reach the gate
  // on its own. `time` an hour off is a defect, and it is one no other column would
  // notice.
  const derivedDiffer = columns.some((column) => column.kind === 'derived' && column.differ > 0);

  return {
    table: args.table,
    corpusRows: corpus.rows.length,
    exportedRows: exported.rows.length,
    rowCountMatches: corpus.rows.length === exported.rows.length,
    rowsMatch: onlyInCorpus === 0 && onlyInExport === 0 && problems.length === 0 && !derivedDiffer,
    onlyInCorpus,
    onlyInExport,
    examples,
    columns,
    problems,
  };
}

/** A one-line verdict, for a workflow log a reader compares between runs. */
export function describeModalityComparison(comparison: ModalityComparison): string {
  const exact = comparison.columns.filter((c) => c.kind === 'exact' && c.differ === 0).map((c) => c.column);
  const derived = comparison.columns
    .filter((c) => c.kind === 'derived')
    .map((c) => {
      if (c.differ > 0) return `${c.column} WRONG in ${c.differ} cell(s)`;
      return c.lossy === 0
        ? `${c.column} from the instant`
        : `${c.column} from the instant (${c.lossy} corpus cell(s) disagree with the corpus's own instant)`;
    });
  const truncated = comparison.columns
    .filter((c) => c.kind === 'truncated')
    .map((c) => `${c.column} to the millisecond (${c.lossy} of ${comparison.corpusRows} cells had finer digits)`);
  const normalised = comparison.columns
    .filter((c) => c.kind === 'normalised')
    .map((c) => `${c.column} normalised (${c.lossy} of ${comparison.corpusRows} cell(s) spelled differently)`);
  const lost = comparison.columns
    .filter((c) => c.kind === 'not-carried')
    .map((c) => `${c.column} (${c.lossy} value(s) in the corpus, ${c.differ} written)`);
  return (
    `${comparison.table}: ${comparison.exportedRows}/${comparison.corpusRows} row(s); ` +
    `exact ${exact.length}/${comparison.columns.length}` +
    (exact.length > 0 ? ` (${exact.join(', ')})` : '') +
    (derived.length > 0 ? `; derived ${derived.join(', ')}` : '') +
    (truncated.length > 0 ? `; truncated ${truncated.join(', ')}` : '') +
    (normalised.length > 0 ? `; normalised ${normalised.join(', ')}` : '') +
    (lost.length > 0 ? `; not carried ${lost.join(', ')}` : '')
  );
}
