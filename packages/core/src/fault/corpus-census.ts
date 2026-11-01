/**
 * What the published corpus actually contains, by fault category.
 *
 * ## Why a census and not a count
 *
 * Every document in this repository that quotes the corpus quotes one number: 735 cases,
 * all at `oracle=1.00`. That number is a property of the *round trip*, not of the corpus:
 * it says every case reached a verdict, and says nothing about which fault each case
 * injects. The corpus's own paper, meanwhile, describes eleven fault types across three
 * datasets -- and v3.34's fix turned on a sentence ("RE3 is the code-level slice") that
 * nothing here had ever measured. Finding 343 was a category read from a *suite name*,
 * because no reading existed that could read it from a case.
 *
 * This module is that reading. It takes the declared cases -- from a local tree or from an
 * archive's central directory -- and groups them by suite, category and fault type, so the
 * claims other files make about the corpus can be checked against it. It reports three
 * things a simple count cannot:
 *
 *   1. **Which reading named each fault.** `classifier` means `inferFaultCategory` decided;
 *      `taxonomy` means it could not and the corpus's own table did; `unknown` means
 *      neither could. A census that does not print this cannot tell "we classify the
 *      corpus" from "we coined a category for it".
 *   2. **The fault types no reading names**, with counts. On the published corpus this was
 *      135 of 735 cases (18.4%) before the taxonomy existed -- `socket` and `f1`…`f5`.
 *   3. **The directories that are not cases.** Reading the archives' central directories
 *      turned one up: `RE2-OB/checkoutservice_cpu/multi-source-data/` carries an
 *      `inject_time.txt`, so a walker keyed on that file sees a 91st RE2-OB case where the
 *      published corpus has 90. `parseRcaEvalPath` refuses it (its run component is not a
 *      number), which is why the round trip has always reported 735. It was right by a
 *      rule nobody had stated, and a census that drops it silently would keep it that way.
 *
 * ## Why duplicates are a field and not an exception
 *
 * A census's whole product is a denominator. Counting one case twice moves every figure
 * derived from it, and it does so without failing anything -- the same shape as the
 * 736-versus-735 near miss above. So a repeated case id is reported rather than thrown:
 * the count excludes it, and the caller prints that it did.
 */

import { FAULT_CATEGORIES, type FaultCategory } from '../ir/types.js';
import { describeCorpusFault } from './corpus-fault-taxonomy.js';

/** One declared case: its id, the suite it belongs to, and the fault token its path carries. */
export interface CensusCase {
  readonly caseId: string;
  readonly suite: string;
  readonly faultType: string;
}

export interface CensusRow {
  readonly suite: string;
  readonly category: FaultCategory;
  readonly faultType: string;
  /** The corpus's name for the fault, or `null` when no reading names it. */
  readonly name: string | null;
  readonly readAs: 'classifier' | 'taxonomy' | 'unknown';
  readonly cases: number;
}

export interface CategoryTally {
  readonly category: FaultCategory;
  readonly cases: number;
}

export interface CorpusCensus {
  readonly cases: number;
  readonly suites: readonly string[];
  readonly faultTypes: number;
  readonly rows: readonly CensusRow[];
  /** Every category present, by case count descending; ties in vocabulary order, `unknown` last. */
  readonly categories: readonly CategoryTally[];
  readonly unnameable: ReadonlyArray<{ readonly faultType: string; readonly cases: number }>;
  readonly duplicates: readonly string[];
  /** Directories that carry a case's marker file and are not cases. */
  readonly notCases: readonly string[];
}

/** Where a category sits in the vocabulary, used only to break ties between equal counts. */
function vocabularyOrder(category: FaultCategory): number {
  const at = FAULT_CATEGORIES.indexOf(category);
  return at === -1 ? FAULT_CATEGORIES.length : at;
}

/**
 * Group the declared cases by suite, category and fault type.
 *
 * The input is what a caller *declares*: a descriptor list, or the case directories an
 * archive lists. Nothing here reads telemetry, so the census can be taken over 735 cases
 * from 625 KB of central directories instead of 5.2 GB of archives.
 */
export function censusCorpus(input: {
  readonly cases: readonly CensusCase[];
  readonly notCases?: readonly string[];
}): CorpusCensus {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const groups = new Map<string, CensusRow & { cases: number }>();
  const suites = new Set<string>();

  for (const entry of input.cases) {
    if (seen.has(entry.caseId)) {
      if (!duplicates.includes(entry.caseId)) duplicates.push(entry.caseId);
      continue;
    }
    seen.add(entry.caseId);
    suites.add(entry.suite);
    const described = describeCorpusFault(entry.faultType);
    const key = `${entry.suite}\u0000${described.category}\u0000${entry.faultType}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        suite: entry.suite,
        category: described.category,
        faultType: entry.faultType,
        name: described.name,
        readAs: described.readAs,
        cases: 1,
      });
    } else {
      existing.cases += 1;
    }
  }

  const rows = [...groups.values()].sort(
    (a, b) =>
      a.suite.localeCompare(b.suite) ||
      b.cases - a.cases ||
      a.faultType.localeCompare(b.faultType),
  );

  const byCategory = new Map<FaultCategory, number>();
  for (const row of rows) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.cases);
  }
  const categories = [...byCategory.entries()]
    .map(([category, cases]) => ({ category, cases }))
    .sort((a, b) => b.cases - a.cases || vocabularyOrder(a.category) - vocabularyOrder(b.category));

  const unnameableRows = new Map<string, number>();
  for (const row of rows) {
    if (row.category !== 'unknown') continue;
    unnameableRows.set(row.faultType, (unnameableRows.get(row.faultType) ?? 0) + row.cases);
  }
  const unnameable = [...unnameableRows.entries()]
    .map(([faultType, cases]) => ({ faultType, cases }))
    .sort((a, b) => b.cases - a.cases || a.faultType.localeCompare(b.faultType));

  return {
    cases: seen.size,
    suites: [...suites].sort(),
    faultTypes: new Set(rows.map((row) => row.faultType)).size,
    rows,
    categories,
    unnameable,
    duplicates,
    notCases: [...(input.notCases ?? [])],
  };
}

/**
 * The census as lines a log can be diffed on.
 *
 * Fixed widths and a `CENSUS` prefix, for the same reason the round trip prefixes its
 * lines: a reader that scans for the prefix cannot pick up a line from somewhere else, and
 * the two figures a reader compares between runs -- the category totals and the unnameable
 * set -- are on lines of their own.
 */
export function describeCensus(census: CorpusCensus): string[] {
  const totals = census.categories.map((one) => `${one.category} ${one.cases}`).join(', ');
  const lines = [
    `CENSUS ${census.cases} case(s) in ${census.suites.length} suite(s), ` +
      `${census.faultTypes} fault type(s): ${totals === '' ? 'none' : totals}`,
  ];
  for (const row of census.rows) {
    lines.push(
      `CENSUS   ${row.suite.padEnd(5)}${row.category.padEnd(11)}${row.faultType.padEnd(9)}` +
        `${row.cases}  ${row.name ?? '(unnamed)'}`,
    );
  }
  lines.push(
    census.unnameable.length === 0
      ? 'CENSUS unnameable 0 case(s)'
      : `CENSUS unnameable ${census.unnameable.reduce((total, one) => total + one.cases, 0)} case(s): ` +
          census.unnameable.map((one) => `${one.faultType} (${one.cases})`).join(', '),
  );
  if (census.duplicates.length > 0) {
    lines.push(`CENSUS duplicate ${census.duplicates.length} case id(s), counted once: ${census.duplicates.join(', ')}`);
  }
  if (census.notCases.length === 0) {
    lines.push('CENSUS not a case 0');
  } else {
    for (const path of census.notCases) lines.push(`CENSUS not a case: ${path}`);
  }
  return lines;
}
