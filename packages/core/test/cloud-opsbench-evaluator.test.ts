import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readOfficialSubmission, scoreOfficial } from '../src/score/official.js';

/**
 * The Cloud-OpsBench metric, held to the code that defines it.
 *
 * `golden-master/cloud-opsbench-evaluator.json` records 23
 * `(top_3_predictions, ground_truth)` pairs and the `(CA, FA, JRA)` triple that
 * `LLM4Ops/Cloud-OpsBench`'s `prediction_scores` returns for each, at a pinned
 * commit and per-file digest. This file replays them through this repository's
 * scorer.
 *
 * ## What the corpus found
 *
 * The rule was transcribed from the paper as an equality of the two strings.
 * The evaluator *normalises both sides first*:
 *
 * ```python
 * def normalize_text(value: Any) -> str:
 *     return re.sub(r"\s+", " ", str(value or "").strip().lower())
 * ```
 *
 * Measured on the pinned evaluator: **9 of 22 cases disagreed, every one in the
 * same direction** -- an answer the benchmark counts as correct was scored wrong
 * here. `CheckoutService` against `checkoutservice` lost the case; so did a
 * trailing space, a tab, a newline and a no-break space. The error is not a
 * difference of opinion about a benchmark's philosophy: it is a comparison that
 * reads two strings as equal under one definition and not the other, and it can
 * only ever make this repository's number lower.
 *
 * ## The two differences that remain, and why they are declared
 *
 *   - `empty-key-empty-prediction`: upstream awards JRA 1.0 when the key declares
 *     nothing and the answer says nothing, because `"" == ""`. Here a facet the
 *     key does not declare is not scored, and a case with nothing scored is 0.
 *     Reproducing it would make an export of empty keys score a perfect JRA.
 *   - `numeric-component`: upstream stringifies with `str(value)`, so the number
 *     `8080` matches the component `"8080"`. This repository's export contract
 *     types the field as a string, so a number reads as absent. The difference is
 *     in the reader, not in the rule.
 *
 * Each is asserted **in its direction**, so a change that starts reproducing one
 * -- or stops -- fails here rather than passing unnoticed.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORPUS = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'cloud-opsbench-evaluator.json'), 'utf8'),
) as Corpus;

interface Case {
  id: string;
  note: string;
  predictions: Record<string, unknown>[];
  groundTruth: Record<string, unknown>;
  upstream: { CA: number; FA: number; JRA: number };
}

interface Difference {
  case: string;
  upstream: number;
  here: number;
  why: string;
}

interface Corpus {
  schema: string;
  takenAt: string;
  upstream: {
    repository: string;
    commit: string;
    function: string;
    files: Record<string, { bytes: number; sha256: string }>;
  };
  method: string[];
  cases: Case[];
  differences: Difference[];
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/** A one-case export plus the answer the case records. */
function score(entry: Case): { correct: boolean; breakdown: Record<string, number> } {
  const files = { [`cases/${entry.id}/metadata.json`]: JSON.stringify({ result: entry.groundTruth }) };
  const first = entry.predictions[0] ?? {};
  const report = scoreOfficial('cloud-opsbench', files, [
    {
      component: asString(first['fault_object']),
      faultType: asString(first['root_cause']),
      reason: '',
      occurredAt: '',
      ranks: [],
      chain: [],
      evidence: [],
      traceWords: 0,
    },
  ]);
  expect(report.caseCount, `${entry.id} produced no case`).toBe(1);
  return { correct: report.cases[0]!.correct, breakdown: report.breakdown as Record<string, number> };
}

const DIFFERENCES = new Map(CORPUS.differences.map((d) => [d.case, d]));

describe('the corpus is the thing it claims to be', () => {
  it('pins the evaluator it was taken from, file by file', () => {
    // A corpus without the identity of the code that produced it is a set of
    // numbers somebody wrote down. Seven files rather than one, because the
    // function under test is imported through the package and every module it
    // imports can change the answer.
    expect(CORPUS.schema).toBe('rca-bench-official-corpus/1');
    expect(CORPUS.upstream.repository).toBe('LLM4Ops/Cloud-OpsBench');
    expect(CORPUS.upstream.commit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(CORPUS.upstream.function).toBe(
      'agents/cloudops_agent/evaluation.py :: prediction_scores',
    );

    const paths = Object.keys(CORPUS.upstream.files);
    expect(paths).toContain('evaluation.py');
    expect(paths.filter((p) => p.startsWith('evaluation_utils/')).length).toBeGreaterThanOrEqual(5);
    for (const path of paths) {
      const file = CORPUS.upstream.files[path]!;
      expect(file.sha256, `${path} has no digest`).toMatch(/^[0-9a-f]{64}$/);
      expect(file.bytes, `${path} has no size`).toBeGreaterThan(0);
    }
    expect(CORPUS.method.length).toBeGreaterThanOrEqual(5);
  });

  it('covers the inputs that separate the two comparisons', () => {
    // Asserted by name, because a count can be satisfied by cases that all agree.
    // Each of these is an answer the evaluator accepts and a raw equality does
    // not, and each one is a different character class: case, leading space,
    // trailing space, collapsed double space, tab, newline, no-break space, and a
    // key whose own text needs normalising.
    const ids = new Set(CORPUS.cases.map((c) => c.id));
    for (const id of [
      'component-case-differs',
      'fault-type-case-differs',
      'leading-space',
      'trailing-space',
      'double-internal-space',
      'tab-instead-of-space',
      'newline-inside-the-reason',
      'non-breaking-space',
      'key-has-the-extra-space',
    ]) {
      expect(ids, `the corpus lost ${id}`).toContain(id);
    }
  });

  it('states every difference it has, and no more', () => {
    expect(new Set(CORPUS.cases.map((c) => c.id)).size).toBe(CORPUS.cases.length);
    expect(CORPUS.differences.length).toBe(2);
    for (const difference of CORPUS.differences) {
      expect(difference.why.length, `${difference.case} offers no argument`).toBeGreaterThan(120);
    }
  });
});

describe('the score is the one upstream computes', () => {
  it('reproduces every case the corpus records as an agreement', () => {
    const mismatched = CORPUS.cases
      .filter((entry) => !DIFFERENCES.has(entry.id))
      .map((entry) => ({ entry, here: score(entry) }))
      // `correct` is the per-case verdict and `jra` is its aggregate; both are
      // asserted because a scorer can be right case by case and wrong when it
      // averages, which is exactly what the OpenRCA projection did.
      .filter(
        ({ entry, here }) =>
          (here.correct ? 1 : 0) !== entry.upstream.JRA || here.breakdown['jra'] !== entry.upstream.JRA,
      )
      .map(
        ({ entry, here }) =>
          `${entry.id}: here ${String(here.breakdown['jra'])}, upstream ${String(entry.upstream.JRA)}`,
      );
    expect(mismatched, 'these cases no longer match the pinned evaluator').toEqual([]);
  });

  it('reports CA and FA by the same comparison as JRA', () => {
    // The parts have to be computed by the same rule as the whole. Reporting
    // `jra: 1` beside `ca: 0.96` is not a rounding difference, it is two rules
    // in one report -- and it is what a breakdown computed with the old equality
    // would print for a corpus full of capital letters.
    const mismatched = CORPUS.cases
      .filter((entry) => !DIFFERENCES.has(entry.id))
      .map((entry) => ({ entry, here: score(entry).breakdown }))
      .filter(
        ({ entry, here }) => here['ca'] !== entry.upstream.CA || here['fa'] !== entry.upstream.FA,
      )
      .map(({ entry, here }) => `${entry.id}: ca ${String(here['ca'])}/fa ${String(here['fa'])}`);
    expect(mismatched).toEqual([]);
  });

  it('keeps each declared difference, in the direction it was declared', () => {
    for (const difference of CORPUS.differences) {
      const entry = CORPUS.cases.find((c) => c.id === difference.case);
      expect(entry, `${difference.case} is declared but not in the corpus`).toBeDefined();
      const here = score(entry!).correct ? 1 : 0;
      expect(here, `${difference.case} now scores what upstream scores`).toBe(difference.here);
      expect(difference.here).not.toBe(difference.upstream);
    }
  });
});

describe('the rule itself, at the unit it is written at', () => {
  it('reads one answer per case, which is what at-1 means', () => {
    // The evaluator scores `predictions[:1]`; this repository's reader produces
    // one prediction per case by construction, so the clause cannot be violated
    // silently. Two corpus cases pin the behaviour rather than the construction:
    // the same two answers in the two orders score 1 and 0.
    const files = { 'cases/sys/metadata.json': JSON.stringify({ result: { fault_object: 'a', root_cause: 'cpu' } }) };
    expect(readOfficialSubmission('cloud-opsbench', files)).toHaveLength(1);

    const firstRight = CORPUS.cases.find((c) => c.id === 'two-predictions-first-right')!;
    const secondRight = CORPUS.cases.find((c) => c.id === 'two-predictions-second-right')!;
    expect(firstRight.predictions.length).toBe(2);
    expect(score(firstRight).correct).toBe(true);
    expect(score(secondRight).correct).toBe(false);
  });

  it('is not satisfied by raw equality on any of the inputs it accepts', () => {
    // The anti-vacuity check. If every accepted case were also a literal match,
    // the nine normalised cases would prove nothing and the rule could be the old
    // one with the corpus quietly edited around it.
    const normalised = CORPUS.cases.filter((entry) => {
      if (entry.upstream.JRA !== 1) return false;
      const first = entry.predictions[0] ?? {};
      const component = asString(first['fault_object']);
      const faultType = asString(first['root_cause']);
      return (
        asString(entry.groundTruth['fault_object']) !== component ||
        asString(entry.groundTruth['root_cause']) !== faultType
      );
    });
    expect(normalised.length, 'no accepted case needs normalising').toBeGreaterThanOrEqual(9);
  });
});
