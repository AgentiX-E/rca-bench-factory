import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OPENRCA_SCORING_TEMPLATES } from '../src/export/openrca.js';
import {
  openRcaRootCount,
  scoreOpenRcaRoots,
  type OpenRcaRoot,
  type OpenRcaScoringPoints,
} from '../src/score/official.js';

/**
 * The archive replay: 293 real submissions with upstream's own verdict.
 *
 * `golden-master/openrca-archive.json` is derived from the four CSV files
 * `microsoft/OpenRCA` publishes under `rca/archive/` at the pinned commit. Each
 * row is one case a baseline agent answered, the criteria the official evaluator
 * marked passed and failed, and the score it wrote down. `scripts/derive-openrca-archive.mjs`
 * turns a row into the scoring points the evaluator read and records exactly how.
 *
 * ## Why this corpus exists beside `openrca-evaluator.json`
 *
 * That one is faithful and small: 25 cases, each a `(prediction, scoring_points)`
 * pair exercised through the pinned `evaluate()` function. It is an oracle for
 * the *rule*, and it is composed by hand, in this repository, by someone who knew
 * what the rule was. Two of its cases are multi-root.
 *
 * This one is upstream's own output on its own data, and **75 of its 335 rows name
 * two root causes**. That number is the reason it was worth deriving: it is the
 * first measurement of how much of a released OpenRCA population the multi-root
 * branch is responsible for.
 *
 * ## What the replay covers, and what it cannot
 *
 * 293 of the 335 rows are replayable and 42 are not, and the shape of the
 * exclusion is the point:
 *
 *  - `task_1`..`task_3` declare one criterion kind, so the criteria recovered
 *    from the `passed`/`failed` columns are placed by the task index alone. All
 *    149 are replayable, including 33 two-root rows.
 *  - `task_4`..`task_7` interleave three kinds in one newline-flattened column.
 *    A single-root row still gives the placement, because its `groundtruth` cell
 *    names all three values and the derivation requires those to be exactly the
 *    recovered set; 144 rows pass that test.
 *  - A **two-root** row on `task_4`..`task_7` (42 rows) names one root in
 *    `groundtruth` and flattens the rest, so the second root's values have no
 *    kind. Guessing one would be a rule invented here, so they are excluded and
 *    counted rather than dropped.
 *
 * The corpus records that count in `excluded`, and the test below asserts it, so
 * a future derivation cannot quietly widen its coverage by guessing.
 *
 * ## What is not asserted here
 *
 * The placement of a criterion into `components`/`reasons`/`times` is the
 * derivation's claim. This file does not re-derive it: it fills the scoring
 * points from the corpus's own lists and holds the *score* to upstream's. A wrong
 * placement changes the score for every case whose value is not shared between
 * kinds, so the agreement below is what falsifies it -- and the derivation
 * refuses a row when the `groundtruth` values are not exactly the recovered set,
 * which is the check that would otherwise have to be repeated here.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface ArchiveCase {
  suite: string;
  rowId: string;
  taskIndex: string;
  basis: string;
  predicted: Array<{ component: string; reason: string; occurredAt: string }>;
  criteria: Partial<Record<'components' | 'reasons' | 'times', string[]>>;
  upstream: number;
}

interface ArchiveCorpus {
  schema: string;
  target: string;
  upstream: {
    repository: string;
    commit: string;
    files: Array<{ path: string; bytes: number; sha256: string; rows: number; twoRootRows: number }>;
  };
  method: string[];
  replayable: { cases: number; twoRootPredicted: number; byTask: Record<string, number> };
  excluded: { cases: number; byBasis: Record<string, number>; byTask: Record<string, number> };
  twoRootRowsInArchive: number;
  cases: ArchiveCase[];
}

const CORPUS = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'openrca-archive.json'), 'utf8'),
) as ArchiveCorpus;

/** Round to the two decimals upstream's `round(score, 2)` produces. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pointsOf(one: ArchiveCase): OpenRcaScoringPoints {
  return {
    components: one.criteria.components ?? [],
    reasons: one.criteria.reasons ?? [],
    times: one.criteria.times ?? [],
  };
}

function rootsOf(one: ArchiveCase): OpenRcaRoot[] {
  return one.predicted.map((root) => ({
    component: root.component,
    reason: root.reason,
    occurredAt: root.occurredAt,
  }));
}

function label(one: ArchiveCase): string {
  return `${one.suite} row ${one.rowId} (${one.taskIndex})`;
}

describe('the archive corpus says what it covers', () => {
  it('counts the rows it derived from, and the rows it could not', () => {
    const rows = CORPUS.upstream.files.reduce((sum, file) => sum + file.rows, 0);
    expect(rows).toBe(335);
    expect(CORPUS.cases.length).toBe(293);
    expect(CORPUS.excluded.cases).toBe(42);
    // The arithmetic has to close: every row is either replayed or excluded, and
    // a derivation that dropped a row without saying so fails here rather than
    // showing up as a smaller number nobody compares.
    expect(CORPUS.cases.length + CORPUS.excluded.cases).toBe(rows);
  });

  it('reports the multi-root population of the archive, which is what the branch is for', () => {
    expect(CORPUS.twoRootRowsInArchive).toBe(75);
    expect(CORPUS.upstream.files.reduce((sum, file) => sum + file.twoRootRows, 0)).toBe(75);
    expect(CORPUS.replayable.twoRootPredicted).toBe(33);
    // Excluded and two-root are the same 42 rows: the reason a row cannot be
    // placed is exactly that it declares two roots across three kinds.
    expect(CORPUS.excluded.byBasis['two-roots-three-kinds']).toBe(42);
  });

  it('derives every criterion from a task index the templates actually declare', () => {
    const tasks = new Set(Object.keys(OPENRCA_SCORING_TEMPLATES));
    for (const one of CORPUS.cases) {
      expect(tasks.has(one.taskIndex), `${label(one)} names an unknown task`).toBe(true);
      const lists = Object.keys(one.criteria);
      expect(lists.length, `${label(one)} declares no criterion`).toBeGreaterThan(0);
      for (const list of lists) {
        expect(['components', 'reasons', 'times']).toContain(list);
        expect(one.criteria[list as 'components'].length, `${label(one)}: empty ${list}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('this repository scores every replayed case the way upstream did', () => {
  it('agrees on all 293, with the case that disagrees named in the failure', () => {
    const disagreed = CORPUS.cases
      .map((one) => ({
        where: label(one),
        here: round2(scoreOpenRcaRoots(rootsOf(one), pointsOf(one))),
        upstream: round2(one.upstream),
      }))
      .filter((row) => row.here !== row.upstream);

    expect(
      disagreed,
      'the rule and the archive disagree; each row is suite, row, score here, score upstream',
    ).toEqual([]);
  });

  it('exercises partial credit in both directions rather than only 0 and 1', () => {
    // A corpus of perfect and empty answers would not distinguish a rule that
    // computes a ratio from one that returns a boolean. These are the counts of
    // each distinct score in the archive subset.
    const counts = new Map<number, number>();
    for (const one of CORPUS.cases) {
      const score = round2(scoreOpenRcaRoots(rootsOf(one), pointsOf(one)));
      counts.set(score, (counts.get(score) ?? 0) + 1);
    }
    const partial = [...counts.entries()]
      .filter(([score]) => score > 0 && score < 1)
      .reduce((sum, [, count]) => sum + count, 0);

    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([0, 0.33, 0.5, 0.67, 1]);
    expect(partial).toBe(39);
    expect(counts.get(1)).toBe(38);
  });

  it('needs the second root cause on ten cases, which is what makes the matching load-bearing', () => {
    // Dropping every root after the first is the shape a single-root reading of
    // the rule reduces to. On the 25-case corpus that mutation was worth one
    // case; here it changes ten, and the point of measuring it is that the
    // multi-root branch is no longer carried by a hand-composed example.
    const changed = CORPUS.cases.filter((one) => {
      const points = pointsOf(one);
      const full = round2(scoreOpenRcaRoots(rootsOf(one), points));
      const firstOnly = round2(scoreOpenRcaRoots(rootsOf(one).slice(0, 1), points));
      return full !== firstOnly;
    });

    expect(changed.length).toBe(10);
    // All ten are two-root rows: a one-root row cannot be affected by keeping
    // only the first root, so a changed case here would mean the corpus records
    // something other than what it says.
    expect(changed.every((one) => one.predicted.length > 1)).toBe(true);
  });

  it('scores the multi-root rows in all three directions', () => {
    const multi = CORPUS.cases.filter((one) => one.predicted.length > 1);
    const scores = multi.map((one) => round2(scoreOpenRcaRoots(rootsOf(one), pointsOf(one))));

    expect(multi.length).toBe(33);
    expect(scores.filter((score) => score === 1).length).toBe(1);
    expect(scores.filter((score) => score > 0 && score < 1).length).toBe(9);
    expect(scores.filter((score) => score === 0).length).toBe(23);
  });

  it('counts the roots the way the evaluator does, from the longest criterion list', () => {
    // `openRcaRootCount` is `max(len(components), len(reasons), len(times))`, and
    // the rule refuses a prediction whose length differs from it. A corpus case
    // whose two disagree would be a case where upstream scored nothing -- and 23
    // of the 33 two-root rows do score nothing, so the assertion cannot be "they
    // always agree". It asserts the weaker, true thing: the count is derived from
    // the lists and every list is at most that long.
    for (const one of CORPUS.cases) {
      const points = pointsOf(one);
      const count = openRcaRootCount(points);
      for (const list of [points.components, points.reasons, points.times]) {
        expect(list.length, `${label(one)} declares more criteria than roots`).toBeLessThanOrEqual(count);
      }
      expect(count, `${label(one)} declares no root`).toBeGreaterThan(0);
    }
  });
});
