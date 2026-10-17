import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  openRcaRootCount,
  parseOpenRcaPrediction,
  parseOpenRcaScoringPoints,
  scoreOfficial,
  scoreOpenRcaRoots,
} from '../src/score/official.js';

/**
 * The OpenRCA metric, held to the code that defines it.
 *
 * `golden-master/openrca-evaluator.json` records 27 `(prediction, scoring_points)`
 * pairs and the `(passing, failing, score)` triple that `microsoft/OpenRCA`'s
 * `main/evaluate.py` returns for each, at a pinned commit and digest. This file
 * replays them through this repository's scorer.
 *
 * ## What the corpus found
 *
 * Before this pass the rule was transcribed as "matched criteria / criteria" over
 * **one** root cause. The published evaluator is a rule over **lists**: the
 * denominator is every declared criterion in every root, the numerator is the
 * best assignment of predictions to scoring points, and a count mismatch scores
 * zero rather than a fraction.
 *
 * Measured on the first 25 cases: **10 disagreed**, and not in one direction.
 * The inflation cases are the projection -- a two-root key scored 1.0 here where
 * upstream says 0.83, and a one-root answer to a two-root key scored 1.0 where
 * upstream says 0. The deflation cases are the missing assignment -- a correct
 * two-root answer submitted in the other order scored 0 here and 1.0 there.
 *
 * ## The two differences that remain, and why they are declared
 *
 * Both are *parsers*, not rules, and both are in the corpus rather than absent
 * from it, because a corpus that only contains agreements cannot tell a fix from
 * a coincidence:
 *
 *   - `reason-with-quotes`: upstream's non-greedy regex truncates a reason at an
 *     embedded quote and loses that criterion. This repository parses JSON and
 *     keeps it. Reproducing the truncation would score a correct answer lower for
 *     being correct.
 *   - `embedded-in-prose`: upstream finds a block anywhere in the cell; this
 *     repository requires the cell to parse. Our exporter writes JSON, so an
 *     export is unaffected; a model's prose answer is not.
 *
 * Each difference is asserted **in its direction**, so a change that starts
 * reproducing one -- or stops -- fails here rather than passing unnoticed.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORPUS = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'openrca-evaluator.json'), 'utf8'),
) as Corpus;

interface Case {
  id: string;
  note: string;
  prediction: string;
  scoringPoints: string;
  upstream: { passing: string[]; failing: string[]; score: number };
}

interface Difference {
  case: string;
  upstream: number;
  here: number;
  why: string;
}

interface Corpus {
  upstream: { repo: string; commit: string; path: string; bytes: number; sha256: string };
  method: string[];
  cases: Case[];
  differences: Difference[];
  agreements: number;
}

/** A one-row export, so `scoreOfficial` sees the same strings upstream was given. */
function filesFor(entry: Case): Record<string, string> {
  const quote = (text: string): string => `"${text.replace(/"/g, '""')}"`;
  return {
    'cases/sys/groundtruth.csv': `scoring_points\n${quote(entry.scoringPoints)}\n`,
    'cases/sys/record.csv': `instruction_id,prediction\n${entry.id},${quote(entry.prediction)}\n`,
  };
}

function score(entry: Case): number {
  const report = scoreOfficial('openrca-1.0', filesFor(entry));
  expect(report.caseCount, `${entry.id} produced no case`).toBe(1);
  return Math.round(report.cases[0]!.score * 100) / 100;
}

const DIFFERENCES = new Map(CORPUS.differences.map((d) => [d.case, d]));

describe('the corpus is the thing it claims to be', () => {
  it('pins the evaluator it was taken from, by commit and by digest', () => {
    // A corpus without the identity of the code that produced it is a set of
    // numbers somebody wrote down. The digest is what makes `git archive` of
    // that commit reproducible; the byte count catches a truncated download.
    expect(CORPUS.upstream.repo).toBe('microsoft/OpenRCA');
    expect(CORPUS.upstream.path).toBe('main/evaluate.py');
    expect(CORPUS.upstream.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(CORPUS.upstream.bytes).toBeGreaterThan(1000);
    expect(CORPUS.method.length).toBeGreaterThanOrEqual(5);
  });

  it('covers the multi-root cases, so the projection bug cannot hide behind a single-root corpus', () => {
    // The property that makes the corpus able to see the defect. Asserted by
    // name rather than by count: a count of 27 could be satisfied by 27
    // single-root cases, and single-root cases agreed with the projection.
    const ids = new Set(CORPUS.cases.map((c) => c.id));
    for (const id of ['two-perfect', 'two-out-of-order', 'three-perfect', 'two-but-one-prediction']) {
      expect(ids, `the corpus lost ${id}, which is one of the cases the projection failed`).toContain(id);
    }
    const multiRoot = CORPUS.cases.filter(
      (c) => openRcaRootCount(parseOpenRcaScoringPoints(c.scoringPoints)) > 1,
    );
    expect(multiRoot.length).toBeGreaterThanOrEqual(8);
  });

  it('states every difference it has, and no more', () => {
    expect(CORPUS.differences.length + CORPUS.agreements).toBe(CORPUS.cases.length);
    for (const difference of CORPUS.differences) {
      expect(difference.why.length, `${difference.case} offers no argument`).toBeGreaterThan(120);
    }
  });
});

describe('the score is the one upstream computes', () => {
  it('reproduces every case the corpus records as an agreement', () => {
    const mismatched = CORPUS.cases
      .filter((entry) => !DIFFERENCES.has(entry.id))
      .filter((entry) => score(entry) !== entry.upstream.score)
      .map((entry) => `${entry.id}: here ${String(score(entry))}, upstream ${String(entry.upstream.score)}`);
    expect(mismatched, 'these cases no longer match the pinned evaluator').toEqual([]);
  });

  it('keeps each declared difference, in the direction it was declared', () => {
    // Asserting the *direction* is what stops this from being a list of excuses:
    // a difference that quietly starts agreeing means either the rule or the
    // corpus moved, and both are worth a red.
    for (const difference of CORPUS.differences) {
      const entry = CORPUS.cases.find((c) => c.id === difference.case);
      expect(entry, `${difference.case} is declared but not in the corpus`).toBeDefined();
      expect(score(entry!), `${difference.case} now scores what upstream scores`).toBe(difference.here);
      expect(difference.here).not.toBe(difference.upstream);
    }
  });
});

describe('the rule itself, at the unit it is written at', () => {
  it('scores zero when the answer declares a different number of roots than the key', () => {
    // Upstream's gate: `if scoringpoints_length == prediction_length`. Half of a
    // two-root case is not half a case, it is a different question.
    const one = [{ component: 'svc-a', reason: 'memory leak', occurredAt: '2022-03-20 10:00:00' }];
    const points = parseOpenRcaScoringPoints(
      [
        'The 1-th predicted root cause component is svc-a',
        'The 1-th predicted root cause reason is memory leak',
        'The 1-th root cause occurrence time is within 1 minutes (i.e., <=1min) of 2022-03-20 10:00:00',
        'The 2-th predicted root cause component is svc-b',
        'The 2-th predicted root cause reason is network delay',
        'The 2-th root cause occurrence time is within 1 minutes (i.e., <=1min) of 2022-03-20 10:05:00',
      ].join('\n'),
    );
    expect(openRcaRootCount(points)).toBe(2);
    expect(scoreOpenRcaRoots(one, points)).toBe(0);
    // The same root twice: one of them can be assigned to the first scoring
    // point and earns its three criteria; the second cannot earn the other
    // root's, so the answer is 3 of 6 rather than a full score.
    expect(scoreOpenRcaRoots([...one, ...one], points)).toBe(0.5);
  });

  it('chooses the assignment rather than the position', () => {
    // The same two roots, submitted in the other order. A positional reading
    // scores 0 here; the published rule scores 3/3.
    const points = parseOpenRcaScoringPoints(
      [
        'The 1-th predicted root cause component is svc-a',
        'The 1-th predicted root cause reason is memory leak',
        'The 1-th root cause occurrence time is within 1 minutes (i.e., <=1min) of 2022-03-20 10:00:00',
        'The 2-th predicted root cause component is svc-b',
        'The 2-th predicted root cause reason is network delay',
        'The 2-th root cause occurrence time is within 1 minutes (i.e., <=1min) of 2022-03-20 10:05:00',
      ].join('\n'),
    );
    expect(
      scoreOpenRcaRoots(
        [
          { component: 'svc-b', reason: 'network delay', occurredAt: '2022-03-20 10:05:00' },
          { component: 'svc-a', reason: 'memory leak', occurredAt: '2022-03-20 10:00:00' },
        ],
        points,
      ),
    ).toBe(1);
  });

  it('reads every block a cell declares, not only the first', () => {
    const prediction = parseOpenRcaPrediction(
      JSON.stringify({
        '2': { 'root cause component': 'svc-b', 'root cause reason': 'network delay' },
        '1': { 'root cause component': 'svc-a', 'root cause reason': 'memory leak' },
      }),
    );
    expect(prediction.component).toBe('svc-a');
    expect(prediction.extraRoots?.map((root) => root.component)).toEqual(['svc-b']);
  });
});
