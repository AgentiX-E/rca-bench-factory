import { describe, expect, it } from 'vitest';
import { parseDelimited } from '../src/ingest/file.js';
import { compareModalityTables, type ColumnComparison } from '../src/score/modalities.js';

/**
 * The comparison, against an implementation of the same specification that holds
 * both tables.
 *
 * ## Why a second implementation exists in a test
 *
 * v3.81 replaced the comparison's shape: it used to materialise both tables and
 * count each side's row signatures in a `Map<string, number>`, and on the corpus's
 * largest case that cost 2.1 KB per row -- about 2.9 GB for the pair, which is what
 * the round trip's heap budget died on (finding 511). It now walks both tables,
 * keeps only a sorted array of signatures per side, and drops every row.
 *
 * A shape change of that size is where a comparison starts disagreeing with itself:
 * an index read from the wrong side, a row consumed twice, an array released before
 * it was counted. None of those is visible in the fixtures that were written for the
 * old shape, because they are small and hand-built. So the oracle below states the
 * same specification in the **opposite** shape -- materialise everything, count with
 * maps, index both sides by row number -- and the two are asked the same questions.
 * What they share is the specification; what they do not share is any line of code.
 *
 * ## Why the input is generated rather than written out
 *
 * A single fixture is one arrangement. These are 60 tables from a linear
 * congruential generator with a fixed seed, so the run is deterministic and the
 * arrangements are not the ones a person would think of: empty cells, duplicate
 * rows, an export that dropped a row, a `time` column the exporter got wrong, a
 * value in a column declared not carried.
 */

const SEP = '\u001f';

const PLAN: readonly ColumnComparison[] = [
  { column: 'timestamp', kind: 'truncated', unit: 'ns' },
  { column: 'level', kind: 'normalised', transform: 'upper-case' },
  { column: 'service', kind: 'exact' },
  { column: 'message', kind: 'exact' },
  { column: 'error', kind: 'not-carried' },
  { column: 'time', kind: 'derived', from: 'timestamp' },
];

const HEADER = 'timestamp,level,service,message,error,time';

/** One corpus row, before it is rendered. */
interface Row {
  readonly ns: string;
  readonly level: string;
  readonly service: string;
  readonly message: string;
  readonly error: string;
}

function truncate(ns: string): string | undefined {
  if (!/^-?\d+$/.test(ns)) return undefined;
  const value = BigInt(ns);
  const step = 1_000_000n;
  return ((value / step) * step).toString();
}

function minuteOf(ns: string): string | undefined {
  const truncated = truncate(ns);
  if (truncated === undefined) return undefined;
  const at = new Date(Number(BigInt(truncated) / 1_000_000n));
  return `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
}

function render(rows: readonly Row[]): string {
  const lines = [HEADER];
  for (const row of rows) {
    const time = minuteOf(row.ns) ?? '';
    lines.push(`${row.ns},${row.level},${row.service},${row.message},${row.error},${time}`);
  }
  return `${lines.join('\n')}\n`;
}

/** What the exporter writes for one corpus row. */
function exportRow(row: Row): Row {
  const truncated = truncate(row.ns) ?? row.ns;
  return {
    ns: truncated,
    level: row.level.toUpperCase(),
    service: row.service,
    message: row.message,
    error: '',
  };
}

/** A deterministic stand-in for randomness, so a failure names a seed and repeats. */
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function corpusOf(rows: number, next: () => number): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < rows; i += 1) {
    out.push({
      ns: `170000001${String(1000000 + Math.floor(next() * 900000)).slice(0, 7)}000${String(i % 1000).padStart(3, '0')}`,
      level: next() < 0.5 ? 'info' : 'ERROR',
      service: `svc-${String(Math.floor(next() * 4))}`,
      message: next() < 0.1 ? '' : `message ${String(Math.floor(next() * 20))}`,
      error: next() < 0.2 ? 'boom' : '',
    });
  }
  return out;
}

interface OracleReading {
  readonly column: string;
  readonly differ: number;
  readonly lossy: number;
}

/** The specification, in the shape this module no longer uses. */
function oracle(args: { corpus: string; exported: string }): {
  rowsMatch: boolean;
  onlyInCorpus: number;
  onlyInExport: number;
  corpusRows: number;
  exportedRows: number;
  columns: OracleReading[];
} {
  const corpus = parseDelimited(args.corpus, ',').rows;
  const exported = parseDelimited(args.exported, ',').rows;
  const corpusHeader = (corpus[0] ?? []).map((cell) => cell.trim());
  const exportHeader = (exported[0] ?? []).map((cell) => cell.trim());
  const corpusBody = corpus.slice(1);
  const exportBody = exported.slice(1);
  const at = new Map(corpusHeader.map((name, index) => [name, index]));
  const et = new Map(exportHeader.map((name, index) => [name, index]));

  const cell = (row: readonly string[] | undefined, index: number | undefined): string =>
    index === undefined ? '' : (row?.[index] ?? '').trim();

  // Row signatures over the columns the signature is made of.
  const compared = PLAN.filter(
    (planned) => planned.kind === 'exact' || planned.kind === 'truncated' || planned.kind === 'normalised',
  );
  const signature = (row: readonly string[], index: Map<string, number>, corpusSide: boolean): string | undefined => {
    const cells: string[] = [];
    for (const planned of compared) {
      const raw = cell(row, index.get(planned.column));
      if (planned.kind === 'truncated') {
        if (corpusSide) {
          const truncated = truncate(raw);
          if (truncated === undefined) return undefined;
          cells.push(truncated);
        } else {
          cells.push(raw);
        }
      } else if (planned.kind === 'normalised' && corpusSide) {
        cells.push(raw.toUpperCase());
      } else {
        cells.push(raw);
      }
    }
    return cells.join(SEP);
  };

  const count = (rows: readonly (readonly string[])[], index: Map<string, number>, corpusSide: boolean): Map<string, number> => {
    const out = new Map<string, number>();
    for (const row of rows) {
      const key = signature(row, index, corpusSide);
      if (key !== undefined) out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
  };

  const corpusCounts = count(corpusBody, at, true);
  const exportCounts = count(exportBody, et, false);
  const asymmetric = (left: Map<string, number>, right: Map<string, number>): number => {
    let total = 0;
    for (const [key, mine] of left) {
      const theirs = right.get(key) ?? 0;
      if (theirs < mine) total += mine - theirs;
    }
    return total;
  };

  const rows = Math.min(corpusBody.length, exportBody.length);
  const columns = PLAN.map((planned): OracleReading => {
    const column = planned.column;
    if (planned.kind === 'derived') {
      // A check with no instant column to read cannot run. Both implementations say so
      // the same way -- the column differs on every row it could not read -- because a
      // zero here is the reading a column that *was* compared gets (finding 513).
      if (at.get(planned.from) === undefined || at.get(column) === undefined || et.get(column) === undefined) {
        return { column, differ: rows, lossy: 0 };
      }
      let differ = 0;
      let disagreed = 0;
      for (let r = 0; r < rows; r += 1) {
        const instant = cell(corpusBody[r], at.get(planned.from));
        const expected = minuteOf(instant);
        if (expected === undefined) continue;
        if (cell(exportBody[r], et.get(column)) !== expected) differ += 1;
        if (cell(corpusBody[r], at.get(column)) !== expected) disagreed += 1;
      }
      return { column, differ, lossy: disagreed };
    }
    if (planned.kind === 'not-carried') {
      let written = 0;
      let lost = 0;
      for (let r = 0; r < rows; r += 1) {
        if (cell(exportBody[r], et.get(column)) !== '') written += 1;
        if (cell(corpusBody[r], at.get(column)) !== '') lost += 1;
      }
      return { column, differ: written, lossy: lost };
    }
    const mine = new Map<string, number>();
    const theirs = new Map<string, number>();
    let lossy = 0;
    for (let r = 0; r < rows; r += 1) {
      const rawTheir = cell(corpusBody[r], at.get(column));
      const rawOurs = cell(exportBody[r], et.get(column));
      if (planned.kind === 'truncated') {
        const truncated = truncate(rawTheir);
        if (truncated === undefined) continue;
        if (truncated !== rawTheir) lossy += 1;
        theirs.set(truncated, (theirs.get(truncated) ?? 0) + 1);
      } else if (planned.kind === 'normalised') {
        const normalised = rawTheir.toUpperCase();
        if (normalised !== rawTheir) lossy += 1;
        theirs.set(normalised, (theirs.get(normalised) ?? 0) + 1);
      } else {
        theirs.set(rawTheir, (theirs.get(rawTheir) ?? 0) + 1);
      }
      mine.set(rawOurs, (mine.get(rawOurs) ?? 0) + 1);
    }
    return {
      column,
      differ: Math.max(asymmetric(theirs, mine), asymmetric(mine, theirs)),
      lossy,
    };
  });

  return {
    rowsMatch:
      asymmetric(corpusCounts, exportCounts) === 0 &&
      asymmetric(exportCounts, corpusCounts) === 0 &&
      columns.every((reading) => reading.differ === 0),
    onlyInCorpus: asymmetric(corpusCounts, exportCounts),
    onlyInExport: asymmetric(exportCounts, corpusCounts),
    corpusRows: corpusBody.length,
    exportedRows: exportBody.length,
    columns,
  };
}

function compare(corpus: string, exported: string): ReturnType<typeof compareModalityTables> {
  return compareModalityTables({ table: 'logs', corpus, exported, plan: PLAN });
}

describe('the comparison agrees with the same specification in another shape', () => {
  it('agrees on 60 generated tables, including the ones that differ', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = sequence(seed);
      const corpusRows = corpusOf(5 + Math.floor(next() * 40), next);
      const exportedRows = corpusRows.map(exportRow);
      // One in three exports is damaged, in one of five ways.
      const damage = seed % 15;
      if (damage === 1 && exportedRows.length > 2) exportedRows.splice(1, 1);
      if (damage === 2) exportedRows.push(exportRow(corpusRows[0] as Row));
      if (damage === 3 && exportedRows[0] !== undefined) exportedRows[0] = { ...exportedRows[0], message: 'rewritten' };
      if (damage === 4 && exportedRows[1] !== undefined) exportedRows[1] = { ...exportedRows[1], level: 'warn' };
      const corpus = render(corpusRows);
      const exported = render(exportedRows);

      const expected = oracle({ corpus, exported });
      const actual = compare(corpus, exported);

      expect(actual.rowsMatch, `seed ${String(seed)}`).toBe(expected.rowsMatch);
      expect(actual.onlyInCorpus, `seed ${String(seed)}`).toBe(expected.onlyInCorpus);
      expect(actual.onlyInExport, `seed ${String(seed)}`).toBe(expected.onlyInExport);
      expect(actual.corpusRows, `seed ${String(seed)}`).toBe(expected.corpusRows);
      expect(actual.exportedRows, `seed ${String(seed)}`).toBe(expected.exportedRows);
      expect(
        actual.columns.map((column) => ({ column: column.column, differ: column.differ, lossy: column.lossy })),
        `seed ${String(seed)}`,
      ).toEqual(expected.columns);
    }
  });

  it('agrees on a table whose every cell differs', () => {
    const corpus = render([
      { ns: '1700000010000000001', level: 'info', service: 'a', message: 'one', error: 'x' },
      { ns: '1700000010000000002', level: 'error', service: 'b', message: 'two', error: '' },
    ]);
    const exported = render([
      { ns: '1700000010000000003', level: 'warn', service: 'c', message: 'three', error: '' },
    ]);

    const expected = oracle({ corpus, exported });
    const actual = compare(corpus, exported);

    expect(actual.rowsMatch).toBe(false);
    expect(actual.corpusRows).toBe(2);
    expect(actual.exportedRows).toBe(1);
    expect(actual.onlyInCorpus).toBe(expected.onlyInCorpus);
    expect(actual.onlyInExport).toBe(expected.onlyInExport);
  });

  it('agrees that a reordered table is the same table', () => {
    // Rows are compared as a multiset, so an export that wrote the same rows in
    // another order matches -- and the oracle and the walk agree that it does.
    const corpus = render([
      { ns: '1700000010000000001', level: 'info', service: 'a', message: 'one', error: '' },
      { ns: '1700000010000000002', level: 'error', service: 'b', message: 'two', error: 'x' },
    ]);
    const exported = render(
      [
        { ns: '1700000010000000002', level: 'error', service: 'b', message: 'two', error: 'x' },
        { ns: '1700000010000000001', level: 'info', service: 'a', message: 'one', error: '' },
      ]
        .map(exportRow)
        .reverse(),
    );

    expect(compare(corpus, exported).rowsMatch).toBe(true);
    expect(oracle({ corpus, exported }).rowsMatch).toBe(true);
  });

  it('agrees that a duplicated row is not the same table', () => {
    const rows: Row[] = [{ ns: '1700000010000000001', level: 'info', service: 'a', message: 'one', error: '' }];
    const corpus = render(rows);
    const exported = render([...rows, ...rows].map(exportRow));

    expect(compare(corpus, exported).rowsMatch).toBe(false);
    expect(compare(corpus, exported).onlyInExport).toBe(1);
    expect(oracle({ corpus, exported }).onlyInExport).toBe(1);
  });

  it('agrees that a derived column with no instant column did not pass', () => {
    // The corpus arrived without the column the minute is derived from, and nothing in
    // the corpus or the plan is called `timestamp` on that side. Neither implementation
    // can run the check, and both say the column differs on every row it could not read
    // rather than reporting the zero a passing column gets (finding 513).
    const corpus = ['level,service,message,error,time', 'info,a,one,,06:16'].join('\n');
    const exported = [HEADER, '1700000010000000000,INFO,a,one,,06:16'].join('\n');

    const expected = oracle({ corpus, exported });
    const actual = compare(corpus, exported);

    expect(actual.rowsMatch).toBe(false);
    expect(expected.rowsMatch).toBe(false);
    expect(actual.columns.find((column) => column.column === 'time')).toMatchObject({ differ: 1 });
    expect(
      actual.columns.map((column) => ({ column: column.column, differ: column.differ, lossy: column.lossy })),
    ).toEqual(expected.columns);
  });
});
