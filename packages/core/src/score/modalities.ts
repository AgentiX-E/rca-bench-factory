import { delimitedRows, type FileParseError } from '../ingest/file.js';
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

/**
 * Read one table's header and hand the rest of the text to a walker.
 *
 * The table is never materialised. On the corpus's largest case it holds ~1.4
 * million rows, and the pair of them cost 2.1 KB per row when they were arrays of
 * arrays of cells (finding 511); what the comparison needs from a row is its
 * signature, which is computed and kept, and then the row is dropped.
 */
function openTable(text: string): {
  readonly header: readonly string[];
  readonly walk: Generator<string[], FileParseError[], void>;
  readonly empty: boolean;
  /**
   * The error list of a table that never produced a first row.
   *
   * A table whose very first cell opens a quote yields no row at all: the walker's first
   * `next()` runs to the end of the text and returns **the errors** instead. Dropping
   * that value is how a syntax error came to be reported as an empty file (finding 512),
   * and it is why `empty` is `errors.length === 0` rather than "there was no first row":
   * a table that could not be read is not a table that has nothing in it, and the two
   * need different sentences.
   *
   * Empty when a header was read, because the step that follows it always has a value
   * of its own -- another row, or the errors -- and `drain` takes whichever the walker
   * gives. `delimitedRows` returns its errors rather than nothing, so there is no case
   * where a table is finished and this list is the only thing left to say.
   */
  readonly headErrors: readonly FileParseError[];
} {
  const walk = delimitedRows(text, ',');
  const first = walk.next();
  if (first.done) {
    return { header: [], walk, empty: first.value.length === 0, headErrors: first.value };
  }
  return { header: first.value.map((cell) => cell.trim()), walk, empty: false, headErrors: [] };
}

/** Walk a table to its end, handing each row to `onRow`, and return its errors. */
function drain(
  walk: Generator<string[], FileParseError[], void>,
  onRow: (row: string[]) => void,
  headErrors: readonly FileParseError[],
): readonly FileParseError[] {
  let step = walk.next();
  while (!step.done) {
    onRow(step.value);
    step = walk.next();
  }
  // A generator that has already returned answers `undefined` to every later `next()`,
  // and a table with no rows has already returned once -- `openTable` read it and found
  // no header. Its error list is the one that first `next()` returned, so it is carried
  // in rather than guessed at. Both answers are live: a table with only a header ends
  // here with the walker's `return` value, and a table with nothing in it ends here with
  // the list the header step already took.
  return step.value === undefined ? headErrors : step.value;
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
function cellOrEmpty(row: readonly string[], index: number | undefined): string {
  if (index === undefined) return '';
  return (row[index] ?? '').trim();
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

/**
 * Cells on one side whose multiplicity the other side does not have.
 *
 * Two sorted arrays instead of two `Map<string, number>`: a TrainTicket case puts
 * 1.4 million signatures on each side, and a map entry costs about three times
 * what a slot in a sorted array does. The multiset difference is the same
 * quantity either way -- the arrays are sorted first, and this walks both once.
 */
function asymmetricSorted(left: readonly string[], right: readonly string[]): number {
  let total = 0;
  let i = 0;
  let j = 0;
  while (i < left.length) {
    const key = left[i];
    while (j < right.length && String(right[j]) < String(key)) j += 1;
    let mine = 0;
    while (i < left.length && left[i] === key) {
      mine += 1;
      i += 1;
    }
    let theirs = 0;
    while (j < right.length && right[j] === key) {
      theirs += 1;
      j += 1;
    }
    if (mine > theirs) total += mine - theirs;
  }
  return total;
}

/**
 * Up to `limit` signatures one side has and the other does not, corpus first.
 *
 * This is the part of a failure a reader can act on, and it is computed from the
 * sorted arrays rather than from a map's insertion order. The order changed with
 * the shape (finding 511) and the difference is stated rather than left to be
 * noticed: examples are now in signature order, which is a deterministic order and
 * the one `sort` already paid for.
 */
function examplesOf(corpus: readonly string[], exported: readonly string[], limit: number): string[] {
  const out: string[] = [];
  const collect = (left: readonly string[], right: readonly string[], side: string): void => {
    let i = 0;
    let j = 0;
    while (i < left.length && out.length < limit) {
      const key = left[i];
      while (j < right.length && String(right[j]) < String(key)) j += 1;
      let mine = 0;
      while (i < left.length && left[i] === key) {
        mine += 1;
        i += 1;
      }
      let theirs = 0;
      while (j < right.length && right[j] === key) {
        theirs += 1;
        j += 1;
      }
      if (mine > theirs) out.push(`${side} only: ${String(key).split(SEP).join(' | ')}`);
    }
  };
  collect(corpus, exported, 'corpus');
  collect(exported, corpus, 'export');
  return out;
}

/** The two defects a table can have before any of its columns is compared. */
function unreadable(label: string, empty: boolean, errors: readonly FileParseError[]): string[] {
  const out: string[] = [];
  const first = errors[0];
  if (first !== undefined) {
    out.push(`${label} is not readable as CSV: line ${String(first.line)} ${first.reason}`);
  }
  if (empty) out.push(`${label} is empty`);
  return out;
}

/**
 * Why a `derived` column's check cannot run, said in the vocabulary of what is missing.
 *
 * Three sentences and not one with a slot: a column the plan does not truncate is a plan
 * that has gone stale, a column the corpus does not have is a corpus that was re-cut, and
 * a column only one of the two tables has is an export that came up short. A reader who
 * is told the wrong one goes looking in the wrong file.
 */
function derivedProblem(args: {
  readonly column: string;
  readonly from: string;
  readonly unit: TruncatedUnit | undefined;
  readonly fromIndex: number | undefined;
}): string {
  const head = `'${args.column}' is derived from '${args.from}', which `;
  if (args.unit === undefined) return `${head}has no truncated plan entry`;
  if (args.fromIndex === undefined) return `${head}is not a column of the corpus's table`;
  return `${head}is not a column of both tables`;
}

/**
 * Where a `derived` column's expected value comes from.
 *
 * One value rather than a column index and a unit that are each allowed to be absent:
 * the check either has both and can run, or it has neither and has been reported. The
 * walk below is then never in the position of asking whether a unit it is holding is
 * there -- which it cannot be, since a column that could not be read never reaches it.
 */
interface DerivedSource {
  /** Which of the corpus's columns holds the instant, and where in a row it sits. */
  readonly from: number;
  /** The resolution the IR keeps that instant at. */
  readonly unit: TruncatedUnit;
}

/** What one planned column accumulates while the two tables are walked together. */
interface ColumnState {
  readonly planned: ColumnComparison;
  readonly at: number | undefined;
  readonly ot: number | undefined;
  /** `derived` columns only: the source, present exactly when the check can run. */
  readonly derived: DerivedSource | undefined;
  /** The two sides' cells, built only when a per-column difference is asked for. */
  readonly pair: { readonly mine: string[]; readonly theirs: string[] } | undefined;
  lossy: number;
  differ: number;
  disagreed: number;
  written: number;
  lost: number;
}

/**
 * One reading per planned column, from a single paired walk of the two tables.
 *
 * The walk is paired because two kinds of column need **the same row on both
 * sides**: a `derived` column is checked against the minute of the corpus's own
 * instant, and a `not-carried` cell is a value the export is not supposed to have
 * written. Nothing here holds a row -- the walker hands each one out and drops it.
 *
 * `needsDiffer` is the one branch. A per-column multiset difference is a projection
 * of the row-level one, so when the two multisets of signatures agree, every
 * `differ` is zero by construction and the arrays behind it are not built. On a
 * failed case they are, one column's worth at a time, and released before the next
 * one: the peak is a column, not the table.
 */
function readColumns(args: {
  table: ModalityTable;
  corpus: string;
  exported: string;
  plan: readonly ColumnComparison[];
  corpusIndex: ReadonlyMap<string, number>;
  exportIndex: ReadonlyMap<string, number>;
  rowCount: number;
  needsDiffer: boolean;
  problems: string[];
}): ColumnReading[] {
  const states: ColumnState[] = args.plan.map((planned): ColumnState => {
    const at = args.corpusIndex.get(planned.column);
    const ot = args.exportIndex.get(planned.column);
    const sourcePlan = planned.kind === 'derived' ? args.plan.find((other) => other.column === planned.from) : undefined;
    const unit = sourcePlan !== undefined && sourcePlan.kind === 'truncated' ? sourcePlan.unit : undefined;
    const fromIndex = planned.kind === 'derived' ? args.corpusIndex.get(planned.from) : undefined;
    // Every way the check can be unable to run, and the sentence each one needs. A
    // `derived` column whose instant column the corpus does not have used to slip past
    // this test -- `from` was not asked about, and `cellOrEmpty` answers `''` for an
    // index it was not given -- so a plan pointing at a column that is not there read
    // as a column that agreed on every row (finding 513).
    const missing =
      planned.kind !== 'derived' ||
      at === undefined ||
      ot === undefined ||
      fromIndex === undefined ||
      unit === undefined;
    const derived: DerivedSource | undefined = missing ? undefined : { from: fromIndex, unit };
    if (planned.kind === 'derived' && derived === undefined) {
      args.problems.push(derivedProblem({ column: planned.column, from: planned.from, unit, fromIndex }));
    }
    const compared = planned.kind === 'exact' || planned.kind === 'truncated' || planned.kind === 'normalised';
    return {
      planned,
      at,
      ot,
      derived,
      pair: compared && args.needsDiffer ? { mine: [], theirs: [] } : undefined,
      lossy: 0,
      differ: 0,
      disagreed: 0,
      written: 0,
      lost: 0,
    };
  });

  const corpusWalk = delimitedRows(args.corpus, ',');
  const exportWalk = delimitedRows(args.exported, ',');
  corpusWalk.next();
  exportWalk.next();

  let step = corpusWalk.next();
  let other = exportWalk.next();
  for (let r = 0; r < args.rowCount && !step.done && !other.done; r += 1) {
    const crow = step.value;
    const erow = other.value;
    for (const state of states) {
      const planned = state.planned;
      if (planned.kind === 'derived') {
        // A derived column that could not be read has no source to read from: the
        // problem naming it was raised before this walk, and no row is examined.
        const derived = state.derived;
        if (derived === undefined) continue;
        const expected = minuteOfInstant(cellOrEmpty(crow, derived.from), derived.unit);
        if (expected === undefined) continue;
        if (cellOrEmpty(erow, state.ot) !== expected) state.differ += 1;
        if (cellOrEmpty(crow, state.at) !== expected) state.disagreed += 1;
        continue;
      }
      if (planned.kind === 'not-carried') {
        // Non-empty here is a defect in the exporter, not a difference of opinion:
        // the column is declared unfilled, so a value means the two statements
        // disagree.
        if (cellOrEmpty(erow, state.ot) !== '') state.written += 1;
        if (cellOrEmpty(crow, state.at) !== '') state.lost += 1;
        continue;
      }
      const rawTheir = cellOrEmpty(crow, state.at);
      const rawOurs = cellOrEmpty(erow, state.ot);
      if (planned.kind === 'truncated') {
        const truncated = truncateInstant(rawTheir, planned.unit);
        if (truncated === undefined) continue;
        if (!truncated.exact) state.lossy += 1;
        state.pair?.theirs.push(truncated.text);
      } else if (planned.kind === 'normalised') {
        // One-sided, like the truncation: the corpus's spelling is what this module
        // reads, and the export is compared as written. A cell the transform changes
        // is counted as `lossy` -- the corpus did say `info`, and the exported table
        // cannot say it back.
        const normalised = applyTransform(rawTheir, planned.transform, planned.aliases);
        if (normalised !== rawTheir) state.lossy += 1;
        state.pair?.theirs.push(normalised);
      } else {
        state.pair?.theirs.push(rawTheir);
      }
      state.pair?.mine.push(rawOurs);
    }
    step = corpusWalk.next();
    other = exportWalk.next();
  }

  return states.map((state): ColumnReading => {
    const planned = state.planned;
    if (planned.kind === 'derived') {
      // A check that could not run is not a check that passed: the column is reported
      // as differing on every row, and the problem raised before the walk says why.
      return state.derived === undefined
        ? { column: planned.column, kind: planned.kind, differ: args.rowCount, lossy: 0 }
        : { column: planned.column, kind: planned.kind, differ: state.differ, lossy: state.disagreed };
    }
    if (planned.kind === 'not-carried') {
      return { column: planned.column, kind: planned.kind, differ: state.written, lossy: state.lost };
    }
    const pair = state.pair;
    if (pair === undefined) {
      return { column: planned.column, kind: planned.kind, differ: 0, lossy: state.lossy };
    }
    pair.mine.sort();
    pair.theirs.sort();
    // One substitution is one cell, so the two multiset differences are not added.
    // They were, and a single `x` where the corpus had an empty cell was reported as
    // two differences -- a diagnostic that reads as "twice as many cells are wrong as
    // there are rows".
    const differ = Math.max(asymmetricSorted(pair.theirs, pair.mine), asymmetricSorted(pair.mine, pair.theirs));
    return { column: planned.column, kind: planned.kind, differ, lossy: state.lossy };
  });
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
  const corpus = openTable(args.corpus);
  const exported = openTable(args.exported);
  const problems: string[] = [];

  const corpusIndex = new Map(corpus.header.map((name, index) => [name, index]));
  const exportIndex = new Map(exported.header.map((name, index) => [name, index]));

  for (const planned of args.plan) {
    if (!corpusIndex.has(planned.column)) {
      problems.push(`the corpus's ${args.table} table has no '${planned.column}' column`);
    }
    if (!exportIndex.has(planned.column)) {
      problems.push(`the exported ${args.table} table has no '${planned.column}' column`);
    }
  }
  for (const name of corpus.header) {
    if (!args.plan.some((planned) => planned.column === name)) {
      problems.push(`'${name}' is in the corpus's ${args.table} table and no plan column names it`);
    }
  }

  // `normalised` columns stay in the signature, under the transform: a severity is
  // information the row carries, so a row whose level was dropped must not collide
  // with one whose level was `INFO`. `derived` columns stay out for the opposite
  // reason -- `time` restates an instant the signature already holds.
  const compared = args.plan.filter(
    (planned) => planned.kind === 'exact' || planned.kind === 'truncated' || planned.kind === 'normalised',
  );

  // Row signatures over the compared columns, from one side and the other. The
  // truncation is applied to the corpus's side only, because the export already
  // holds the truncated value.
  const signature = (row: readonly string[], index: ReadonlyMap<string, number>, side: 'corpus' | 'export'): string | undefined => {
    const cells: string[] = [];
    for (const planned of compared) {
      const cell = cellOrEmpty(row, index.get(planned.column));
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

  // One pass per side, keeping only the signature of each row. The rows themselves
  // are handed out by the walker and dropped, which is the whole point: the pair of
  // tables costs 2.1 KB per row when they are held (finding 511).
  const corpusSignatures: string[] = [];
  let corpusRows = 0;
  const corpusErrors = drain(
    corpus.walk,
    (row) => {
      corpusRows += 1;
      const key = signature(row, corpusIndex, 'corpus');
      if (key !== undefined) corpusSignatures.push(key);
    },
    corpus.headErrors,
  );
  const exportSignatures: string[] = [];
  let exportedRows = 0;
  const exportErrors = drain(
    exported.walk,
    (row) => {
      exportedRows += 1;
      const key = signature(row, exportIndex, 'export');
      if (key !== undefined) exportSignatures.push(key);
    },
    exported.headErrors,
  );

  corpusSignatures.sort();
  exportSignatures.sort();
  const onlyInCorpus = asymmetricSorted(corpusSignatures, exportSignatures);
  const onlyInExport = asymmetricSorted(exportSignatures, corpusSignatures);
  const examples =
    onlyInCorpus === 0 && onlyInExport === 0 ? [] : examplesOf(corpusSignatures, exportSignatures, 3);
  // These are the largest thing this function holds -- 1.4 million strings a side on
  // the corpus's largest case -- and the column pass below allocates arrays of its
  // own. Released here rather than left to the return.
  corpusSignatures.length = 0;
  exportSignatures.length = 0;

  const rowCount = Math.min(corpusRows, exportedRows);

  const columns = readColumns({
    table: args.table,
    corpus: args.corpus,
    exported: args.exported,
    plan: args.plan,
    corpusIndex,
    exportIndex,
    rowCount,
    // A per-column difference is a projection of the row-level one: if the two
    // multisets of signatures are equal, the multiset of any column is equal too, so
    // `differ` is zero and does not have to be measured. This is the reason the
    // comparison can afford to walk a failed case twice and a passing one once.
    needsDiffer: onlyInCorpus > 0 || onlyInExport > 0,
    problems,
  });

  // A derived column is not in the row signature -- `time` is a rendering of an
  // instant the signature already carries -- so its verdict has to reach the gate
  // on its own. `time` an hour off is a defect, and it is one no other column would
  // notice.
  const derivedDiffer = columns.some((column) => column.kind === 'derived' && column.differ > 0);

  const corpusLabel = `the corpus's ${args.table} table`;
  const exportLabel = `the exported ${args.table} table`;

  return {
    table: args.table,
    corpusRows,
    exportedRows,
    rowCountMatches: corpusRows === exportedRows,
    rowsMatch: onlyInCorpus === 0 && onlyInExport === 0 && problems.length === 0 && !derivedDiffer,
    onlyInCorpus,
    onlyInExport,
    examples,
    columns,
    // The two tables' own defects come first, in the order they always did: a file
    // that could not be read is the first thing a reader needs, before any column of
    // it. Their errors are only known once the walk has finished, which is why they
    // are assembled here rather than seeded at the top.
    problems: [
      ...unreadable(corpusLabel, corpus.empty, corpusErrors),
      ...unreadable(exportLabel, exported.empty, exportErrors),
      ...problems,
    ],
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
