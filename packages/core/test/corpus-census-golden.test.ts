import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { censusCorpus } from '../src/fault/corpus-census.js';
import { RCAEVAL_CORPUS_FAULTS, readCorpusFault } from '../src/fault/corpus-fault-taxonomy.js';

/**
 * The committed census, held to arithmetic instead of to trust.
 *
 * `golden-master/corpus-census.json` is a measurement of the published corpus that cannot be
 * re-taken in CI: it needs nine HTTP range requests against a host that is not a build
 * dependency. What *can* run on every commit is the part that makes the number quotable --
 * that the file adds up, that every row is a fault the taxonomy names, and that the rows are
 * the corpus's own fault tokens rather than a transcription of them.
 *
 * The distinction matters because the figure is already load-bearing: `docs/` quotes
 * 735 cases and 405 / 240 / 90 by category, and v3.34's fix rested on "RE3 is the code-level
 * slice". A committed figure with no arithmetic behind it is a figure that drifts quietly.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = resolve(HERE, '..', '..', '..', 'golden-master', 'corpus-census.json');

interface GoldenRow {
  suite: string;
  category: string;
  faultType: string;
  name: string | null;
  readAs: string;
  cases: number;
}

interface Golden {
  schema: string;
  cases: number;
  faultTypes: number;
  suites: string[];
  measurements: Array<{ archive: string; assetId: string; bytes: number; entries: number; bytesFetched: number }>;
  categories: Array<{ category: string; cases: number }>;
  rows: GoldenRow[];
  unnameable: Array<{ faultType: string; cases: number }>;
  notCases: string[];
}

const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden;

describe('golden-master/corpus-census.json', () => {
  it('is a census of the three suites the corpus publishes', () => {
    expect(golden.schema).toBe('rca-bench-corpus-census/1');
    expect(golden.suites).toEqual(['RE1', 'RE2', 'RE3']);
    // 375 + 270 + 90, the nine archives' case directories and the README's own total.
    expect(golden.cases).toBe(735);
  });

  it('adds up three ways', () => {
    const byRow = golden.rows.reduce((total, row) => total + row.cases, 0);
    const byCategory = golden.categories.reduce((total, row) => total + row.cases, 0);
    expect(byRow).toBe(golden.cases);
    expect(byCategory).toBe(golden.cases);
    // And per suite, which the total cannot see: a row moved from RE1 to RE2 keeps both sums.
    for (const suite of golden.suites) {
      const expected = { RE1: 375, RE2: 270, RE3: 90 }[suite];
      expect(golden.rows.filter((row) => row.suite === suite).reduce((t, r) => t + r.cases, 0), suite).toBe(expected);
    }
  });

  it('names every fault with the taxonomy’s own row', () => {
    for (const row of golden.rows) {
      const fault = readCorpusFault(row.faultType);
      expect(fault, row.faultType).toBeDefined();
      expect(row.name, row.faultType).toBe(fault!.name);
      expect(row.category, row.faultType).toBe(fault!.category);
    }
  });

  it('leaves nothing unnameable, which is the whole point of the taxonomy', () => {
    expect(golden.unnameable).toEqual([]);
    // The before figure, so the improvement is a subtraction rather than a claim: the two
    // families the shipped classifier could not read were 45 `socket` and 90 code-level cases.
    const viaTaxonomy = golden.rows.filter((row) => row.readAs === 'taxonomy');
    expect(viaTaxonomy.reduce((total, row) => total + row.cases, 0)).toBe(135);
  });

  it('reproduces the categories from the rows, not from a second table', () => {
    const rebuilt = censusCorpus({
      // One synthetic case per row keeps this a statement about the groupers rather than
      // about the corpus, whose telemetry is not here.
      cases: golden.rows.map((row) => ({ caseId: `${row.suite}/${row.faultType}`, suite: row.suite, faultType: row.faultType })),
      notCases: golden.notCases,
    });
    // Compared as a set: the committed file is ordered by case count, and one synthetic case
    // per row makes every count 1, so ordering is the one thing this reconstruction cannot
    // reproduce -- and it is not what is under test here.
    const key = (row: { suite: string; faultType: string }): string => `${row.suite}/${row.faultType}`;
    expect(rebuilt.rows.map(key).sort()).toEqual(golden.rows.map(key).sort());
    expect(rebuilt.notCases).toEqual(golden.notCases);
  });

  it('carries the one directory that is not a case, by path', () => {
    expect(golden.notCases).toEqual(['RE2-OB/checkoutservice_cpu/multi-source-data']);
  });

  it('accounts for every archive it measured, against the registry that pins it', () => {
    expect(golden.measurements).toHaveLength(9);
    for (const measurement of golden.measurements) {
      // The asset id is the registry's, so the digest that pins the archive is one lookup
      // away rather than a second copy of the same number.
      expect(measurement.assetId).toBe(`rcaeval-${measurement.archive.toLowerCase()}`);
      // A census read from central directories costs a fraction of the archive. A row that
      // fetched everything would mean the shortcut stopped being one.
      expect(measurement.bytesFetched, measurement.archive).toBeLessThan(measurement.bytes / 4);
      expect(measurement.entries).toBeGreaterThan(0);
    }
  });

  it('uses no fault type outside the eleven the paper defines, plus the one spelling', () => {
    const tokens = new Set(RCAEVAL_CORPUS_FAULTS.map((one) => one.token));
    for (const row of golden.rows) {
      // `f3_1` is the corpus's own spelling of `f3` with an instance suffix; everything else
      // has to be a token the taxonomy carries.
      const stem = row.faultType.split('_')[0]!;
      expect(tokens, row.faultType).toContain(stem);
    }
  });
});
