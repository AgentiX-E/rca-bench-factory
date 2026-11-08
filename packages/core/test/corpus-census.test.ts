import { describe, expect, it } from 'vitest';
import { censusCorpus, describeCensus, type CensusCase } from '../src/fault/corpus-census.js';

/** Build one declared case. The suite comes from the case's own first path component. */
function one(caseId: string, faultType: string): CensusCase {
  return { caseId, suite: caseId.split('-')[0]!.split('/')[0]!, faultType };
}

describe('censusCorpus', () => {
  it('counts cases, suites and fault types', () => {
    const census = censusCorpus({
      cases: [one('RE1-OB/a_cpu/1', 'cpu'), one('RE1-OB/b_cpu/1', 'cpu'), one('RE3-OB/c_f1/1', 'f1')],
    });
    expect(census.cases).toBe(3);
    expect(census.suites).toEqual(['RE1', 'RE3']);
    expect(census.faultTypes).toBe(2);
  });

  it('groups by suite, category and fault type', () => {
    const census = censusCorpus({
      cases: [one('RE1-OB/a_cpu/1', 'cpu'), one('RE1-SS/b_cpu/1', 'cpu'), one('RE1-OB/c_mem/1', 'mem')],
    });
    expect(census.rows.map((row) => [row.suite, row.category, row.faultType, row.cases])).toEqual([
      ['RE1', 'resource', 'cpu', 2],
      ['RE1', 'resource', 'mem', 1],
    ]);
  });

  it('names every row it can and says which reading named it', () => {
    const census = censusCorpus({
      cases: [one('RE1-OB/a_cpu/1', 'cpu'), one('RE2-OB/b_socket/1', 'socket'), one('RE3-OB/c_f4/1', 'f4')],
    });
    const byToken = new Map(census.rows.map((row) => [row.faultType, row]));
    expect(byToken.get('cpu')).toMatchObject({ name: 'CPU hog', readAs: 'classifier' });
    expect(byToken.get('socket')).toMatchObject({ name: 'Socket stress', readAs: 'taxonomy' });
    expect(byToken.get('f4')).toMatchObject({ name: 'Incorrect Return Values', readAs: 'taxonomy' });
  });

  it('tallies categories in descending order, with unknown last', () => {
    const census = censusCorpus({
      cases: [
        one('RE3-OB/a_f1/1', 'f1'),
        one('RE3-OB/b_f1/1', 'f1'),
        one('RE3-OB/c_f1/1', 'f1'),
        one('RE1-OB/d_cpu/1', 'cpu'),
        one('RE1-OB/e_cpu/1', 'cpu'),
        one('RE1-OB/f_delay/1', 'delay'),
        one('RE1-OB/g_mystery/1', 'mystery'),
      ],
    });
    expect(census.categories).toEqual([
      { category: 'code', cases: 3 },
      { category: 'resource', cases: 2 },
      { category: 'network', cases: 1 },
      { category: 'unknown', cases: 1 },
    ]);
  });

  it('reports the fault types no reading names, with their counts', () => {
    const census = censusCorpus({
      cases: [one('RE1-OB/a_mystery/1', 'mystery'), one('RE1-OB/b_mystery/1', 'mystery'), one('RE1-OB/c_cpu/1', 'cpu')],
    });
    expect(census.unnameable).toEqual([{ faultType: 'mystery', cases: 2 }]);
  });

  it('adds up: the categories cover every case exactly once', () => {
    const census = censusCorpus({
      cases: [
        one('RE1-OB/a_cpu/1', 'cpu'),
        one('RE2-OB/b_socket/1', 'socket'),
        one('RE3-OB/c_f1/1', 'f1'),
        one('RE3-OB/d_f3_1/1', 'f3_1'),
        one('RE1-OB/e_unknown_token/1', 'unknown_token'),
      ],
    });
    expect(census.categories.reduce((total, row) => total + row.cases, 0)).toBe(census.cases);
    expect(census.rows.reduce((total, row) => total + row.cases, 0)).toBe(census.cases);
  });

  it('reads a suffixed label as its stem without merging it into the stem row', () => {
    const census = censusCorpus({
      cases: [one('RE3-TT/a_f3/1', 'f3'), one('RE3-TT/b_f3_1/1', 'f3_1')],
    });
    // Two spellings, one fault: the category total is 2 and the rows stay separate so a
    // reader can see the corpus writes both.
    expect(census.categories).toEqual([{ category: 'code', cases: 2 }]);
    expect(census.rows.map((row) => row.faultType).sort()).toEqual(['f3', 'f3_1']);
    expect(census.rows.every((row) => row.name === 'Missing Function Call')).toBe(true);
  });

  it('refuses to count one case twice', () => {
    const census = censusCorpus({
      cases: [one('RE1-OB/a_cpu/1', 'cpu'), one('RE1-OB/a_cpu/1', 'cpu')],
    });
    expect(census.cases).toBe(1);
    expect(census.duplicates).toEqual(['RE1-OB/a_cpu/1']);
  });

  it('carries the directories that are not cases, rather than dropping them', () => {
    const census = censusCorpus({
      cases: [one('RE1-OB/a_cpu/1', 'cpu')],
      notCases: ['RE2-OB/checkoutservice_cpu/multi-source-data'],
    });
    expect(census.notCases).toEqual(['RE2-OB/checkoutservice_cpu/multi-source-data']);
  });

  it('survives an empty corpus without inventing a row', () => {
    const census = censusCorpus({ cases: [] });
    expect(census).toMatchObject({ cases: 0, faultTypes: 0, rows: [], categories: [], unnameable: [] });
  });
});

describe('describeCensus', () => {
  const census = censusCorpus({
    cases: [
      one('RE1-OB/a_cpu/1', 'cpu'),
      one('RE1-OB/b_delay/1', 'delay'),
      one('RE3-TT/c_f4/1', 'f4'),
      one('RE1-OB/d_strange/1', 'strange'),
    ],
    notCases: ['RE2-OB/checkoutservice_cpu/multi-source-data'],
  });
  const lines = describeCensus(census);

  it('opens with the totals a reader compares between runs', () => {
    expect(lines[0]).toBe(
      'CENSUS 4 case(s) in 2 suite(s), 4 fault type(s): resource 1, network 1, code 1, unknown 1',
    );
  });

  it('names every fault type with its category and its corpus name', () => {
    expect(lines).toContain('CENSUS   RE1  network    delay    1  Network delay');
    expect(lines).toContain('CENSUS   RE3  code       f4       1  Incorrect Return Values');
    expect(lines).toContain('CENSUS   RE1  unknown    strange  1  (unnamed)');
  });

  it('states the unnameable set even when it is empty', () => {
    const clean = describeCensus(censusCorpus({ cases: [one('RE1-OB/a_cpu/1', 'cpu')] }));
    expect(clean).toContain('CENSUS unnameable 0 case(s)');
    expect(lines).toContain('CENSUS unnameable 1 case(s): strange (1)');
  });

  it('states the directories that are not cases, by path', () => {
    expect(lines).toContain('CENSUS not a case: RE2-OB/checkoutservice_cpu/multi-source-data');
    const clean = describeCensus(censusCorpus({ cases: [one('RE1-OB/a_cpu/1', 'cpu')] }));
    expect(clean).toContain('CENSUS not a case 0');
  });

  it('states the duplicate ids it counted once', () => {
    // The census drops the repeat to keep the totals honest, and says which id it dropped. A count
    // that is quietly corrected is a count whose correction nobody can check.
    const twice = describeCensus(
      censusCorpus({ cases: [one('RE1-OB/a_cpu/1', 'cpu'), one('RE1-OB/a_cpu/1', 'cpu')] }),
    );
    expect(twice).toContain('CENSUS duplicate 1 case id(s), counted once: RE1-OB/a_cpu/1');
    expect(twice).not.toContain('CENSUS duplicate 1 case id(s), counted once: RE1-OB/a_cpu/1, ');
  });

  it('says the category totals are none rather than printing an empty list', () => {
    // An empty corpus still opens with the line a reader diffs between runs, and the space after
    // the colon has to say something: a trailing `: ` reads as a truncation.
    const empty = describeCensus(censusCorpus({ cases: [] }));
    expect(empty[0]).toBe('CENSUS 0 case(s) in 0 suite(s), 0 fault type(s): none');
  });
});
