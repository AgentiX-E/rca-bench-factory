import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOGTS_BUCKET_SECONDS } from '../src/export/rcaeval-logts.js';
import { RCAEVAL_INSTANT_COLUMNS } from '../src/export/rcaeval.js';

/**
 * `golden-master/rcaeval-aggregates.json` holds three tables printed side by side,
 * and this file does the arithmetic between them.
 *
 * ## Why a measurement needs a guard
 *
 * Finding 305 was three suite counts published in one table, disagreeing by one
 * file, with nothing computing the relation between them. This file is the same
 * shape one subject over: three aggregate tables, each with a row count, a column
 * count, a cell count and an interval, and every one of those has to be consistent
 * with the others or the table is describing something other than what it says.
 *
 * Two of them are also the *same* grid -- the same 97 buckets from the same first
 * instant -- and that is a claim worth checking, because a reader comparing
 * `logts.csv` to `tracets_lat.csv` for a single case has no other way to know the
 * rows line up.
 *
 * ## The two joins to code, and why they are joins rather than restatements
 *
 * `bucketSeconds` has to equal `LOGTS_BUCKET_SECONDS`, and each unit has to agree
 * with `RCAEVAL_INSTANT_COLUMNS`. Without those, the JSON would be an independent
 * copy of two facts that also live in source, and two copies of a fact are two
 * facts, one of which is stale (finding 305, again).
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SPEC = JSON.parse(readFileSync(join(ROOT, 'golden-master/rcaeval-aggregates.json'), 'utf8')) as {
  bucketSeconds: number;
  tables: Array<{
    file: string;
    bytes: number;
    rows: number;
    columns: number;
    firstSecond: number;
    lastSecond: number;
    cells: number;
    derivable: 'exact' | 'refuted';
    reducedFrom?: string[];
    verified?: string;
    refutation?: { candidates: string[]; cellsEqual: number; cells: number };
  }>;
  alsoMeasured: { units: Record<string, string> };
};

describe('golden-master/rcaeval-aggregates.json · the numbers are consistent', () => {
  it('names the three tables, and no fourth', () => {
    expect(SPEC.tables.map((one) => one.file)).toEqual([
      'logts.csv',
      'tracets_lat.csv',
      'tracets_err.csv',
    ]);
  });

  it('states the bucket the reducer is built on', () => {
    // The join. A spec that said 60 while the code bucketed on 15 would be a
    // document describing a reduction nobody performs.
    expect(SPEC.bucketSeconds).toBe(LOGTS_BUCKET_SECONDS);
  });

  it('derives each row count from its own interval, and each cell count from its own shape', () => {
    for (const table of SPEC.tables) {
      const span = table.lastSecond - table.firstSecond;
      expect(span % SPEC.bucketSeconds, `${table.file}: the interval is not a whole number of buckets`).toBe(0);
      expect(table.rows, `${table.file}: rows contradict the interval`).toBe(span / SPEC.bucketSeconds + 1);
      expect(table.cells, `${table.file}: cells contradict rows x columns`).toBe(table.rows * table.columns);
    }
  });

  it('puts all three on one grid, because a reader will compare them row by row', () => {
    const [first, ...rest] = SPEC.tables.map((one) => ({
      rows: one.rows,
      firstSecond: one.firstSecond,
      lastSecond: one.lastSecond,
    }));
    for (const one of rest) expect(one).toEqual(first);
  });

  it('starts each interval on a bucket boundary, which is what makes floor() the rule', () => {
    // If the grid were offset from the absolute boundary, `floor(t / 15) * 15`
    // would be wrong and the anchor for the offset would have to be carried in the
    // spec. It is not, and this is the check that says so.
    for (const table of SPEC.tables) {
      expect(table.firstSecond % SPEC.bucketSeconds, `${table.file}`).toBe(0);
    }
  });

  it('says of every table either how it was verified or what refuted it', () => {
    for (const table of SPEC.tables) {
      if (table.derivable === 'exact') {
        expect(table.reducedFrom, `${table.file}: an exact table must name its inputs`).toBeDefined();
        expect(table.verified, `${table.file}: an exact table must name the check`).toContain(
          'check-aggregate-tables.mjs',
        );
        expect(table.refutation, `${table.file}: exact and refuted are exclusive`).toBeUndefined();
      } else {
        // A refusal has to carry the work that produced it, or it is an opinion.
        expect(table.refutation, `${table.file}: a refused table must carry its refutation`).toBeDefined();
        expect(table.refutation?.cellsEqual, `${table.file}`).toBe(0);
        expect(table.refutation?.cells, `${table.file}`).toBe(table.cells);
        expect(table.refutation?.candidates.length, `${table.file}: too few candidates to be a search`).toBeGreaterThanOrEqual(
          5,
        );
      }
    }
  });

  it('agrees with the exporter about every instant unit', () => {
    const words: Record<string, string> = { ms: 'milliseconds', us: 'microseconds', ns: 'nanoseconds' };
    for (const [key, column] of Object.entries(RCAEVAL_INSTANT_COLUMNS)) {
      const published = SPEC.alsoMeasured.units[key];
      expect(published, `${key} is in the exporter's table and not in the spec`).toBeDefined();
      expect(published, `${key}: the spec and the exporter disagree about the unit`).toContain(
        words[column.unit] as string,
      );
    }
    // And the other direction: a unit the spec states that the exporter does not
    // carry would be a claim about a column nothing writes.
    for (const key of Object.keys(SPEC.alsoMeasured.units)) {
      if (key === 'traces.duration') continue;
      expect(Object.keys(RCAEVAL_INSTANT_COLUMNS), `${key} is measured but not written`).toContain(key);
    }
  });

  it('records that RE3 ships none of the three, so nothing there can be checked', () => {
    // The reduction is checked against RE2's own file. RE3 has no such file -- its
    // case directories hold `logs.csv` and `traces.csv` and no aggregate of either
    // -- so an unqualified "the aggregate is verified" would be a claim about a
    // corpus that cannot support it.
    expect(SPEC.alsoMeasured.re3).toContain('none of the three');
  });
});
