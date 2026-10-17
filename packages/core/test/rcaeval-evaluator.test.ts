import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  officialMetric,
  scoreOfficial,
  type OfficialPrediction,
  type OfficialScoreReport,
} from '../src/score/official.js';

/**
 * This repository's RCAEval scorer, held to upstream's own evaluator.
 *
 * `golden-master/rcaeval-evaluator.json` was produced by **running**
 * `RCAEval/benchmark/evaluation.py` -- not by reading it -- over 86 case sets, and every
 * number in it is upstream's. Until this file existed, the metric was a transcription:
 * `officialMetric('rcaeval-re2').quote` is the rule in prose, and nothing checked that the
 * code below it computed the same thing. The transcription was wrong, in one place, for as
 * long as it has existed:
 *
 * > the scorer rounded each AC@k to two decimals and then averaged the rounded values, while
 * > upstream averages the exact rates and rounds once. Twenty-nine of the 317 sets in the
 * > search came out **0.01** away, in both directions.
 *
 * That defect could not have been found by a test written from the same reading of the paper
 * that the scorer was written from, which is the whole argument for pinning an oracle. It
 * also could not have been found by this repository's own end-to-end run: an oracle export
 * scores 1.00 at every k, so every rate is exactly 1 and the two averages are equal. The bug
 * was invisible on every input the project had ever scored, and would first have appeared on
 * a user's partial-rerank submission.
 *
 * ## Why each entry says what it is for
 *
 * `kind` is not decoration. A set that cannot tell "average the rounded rates" from "round
 * the average" would let the test pass on the broken code, so `disagreed` entries assert that
 * they still separate the two readings -- a per-entry witness, checked below. `design` sets
 * pin the readings a transcription can conflate (rank positions inside and beyond max_k, a
 * ranking that omits the answer, a repeated candidate). `control` sets agreed before the fix
 * and are kept so the record can still notice a divergence somewhere else.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RECORD = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'rcaeval-evaluator.json'), 'utf8'),
) as {
  readonly note: string;
  readonly services: readonly string[];
  readonly provenance: {
    readonly repo: string;
    readonly branch: string;
    readonly commit: string;
    readonly maxK: number;
    readonly files: readonly { readonly path: string; readonly sha256: string }[];
    readonly howToReproduce: readonly string[];
  };
  readonly divergences: readonly { readonly what: string; readonly why: string }[];
  readonly sets: readonly {
    readonly name: string;
    readonly kind: 'design' | 'disagreed' | 'control';
    readonly cases: readonly (readonly number[])[];
    readonly verdict: {
      readonly num: number;
      readonly accuracy: readonly number[];
      readonly average5: number;
    };
  }[];
};

/** The same rounding the report publishes, so the comparison is at the published precision. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Score one record entry the way an exported corpus would be scored.
 *
 * The answer key is a `RE2-TT/<service>_<fault>/<index>/inject_time.txt` per case, which is
 * the corpus layout `readRcaEvalPath` accepts, and the prediction carries the ranking. The
 * predictions are ordered by the answer-key path because that is the order the reader returns
 * ground truth in -- a harness that assumed insertion order would be measuring its own array.
 */
function scoreSet(entry: (typeof RECORD)['sets'][number]): OfficialScoreReport {
  const files: Record<string, string> = {};
  const dirs: string[] = [];
  entry.cases.forEach(([answer, ...ranking], index) => {
    const service = RECORD.services[answer];
    const dir = `RE2-TT/${String(service)}_cpu/${String(index).padStart(4, '0')}`;
    files[`${dir}/inject_time.txt`] = '2021-01-01 00:00:00\n';
    dirs.push(dir);
  });

  const order = Object.keys(files)
    .filter((path) => path.endsWith('/inject_time.txt'))
    .sort()
    .map((path) => path.slice(0, path.length - '/inject_time.txt'.length));
  const byDir = new Map(dirs.map((dir, i) => [dir, entry.cases[i]!]));

  const predictions: OfficialPrediction[] = order.map((dir) => {
    const [, ...ranking] = byDir.get(dir)!;
    return {
      component: ranking.length === 0 ? '' : (RECORD.services[ranking[0]!] ?? ''),
      faultType: 'cpu',
      reason: '',
      occurredAt: '',
      ranks: ranking.map((index) => RECORD.services[index] ?? ''),
      chain: [],
      evidence: [],
      traceWords: 5,
    };
  });

  return scoreOfficial('rcaeval-re2', files, predictions);
}

/** The mean a scorer gets by averaging the two-decimal rates, which is what this file guards. */
function averageOfRounded(entry: (typeof RECORD)['sets'][number]): number {
  return round2(entry.verdict.accuracy.reduce((sum, rate) => sum + round2(rate), 0) / 5);
}

describe('upstream\u2019s evaluator, pinned and reproduced', () => {
  it('has a record worth holding the scorer to', () => {
    // Vacuity first: a record that lost its sets, or kept only one kind, would make every
    // assertion below true of nothing.
    expect(RECORD.sets.length).toBeGreaterThanOrEqual(80);
    expect(RECORD.services.length).toBe(12);
    for (const kind of ['design', 'disagreed', 'control']) {
      expect(RECORD.sets.filter((set) => set.kind === kind).length).toBeGreaterThan(0);
    }
    const cases = RECORD.sets.reduce((sum, set) => sum + set.cases.length, 0);
    expect(cases).toBeGreaterThan(1000);
  });

  it('names the upstream it was taken from, at a commit and by file digest', () => {
    // A pinned oracle with no provenance is a number from nowhere, which is the defect
    // finding 156 records about scores that lived only in a log line.
    expect(RECORD.provenance.repo).toBe('phamquiluan/RCAEval');
    expect(RECORD.provenance.branch).toBe('main');
    expect(RECORD.provenance.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(RECORD.provenance.maxK).toBe(5);
    expect(RECORD.provenance.files.map((file) => file.path).sort()).toEqual([
      'RCAEval/benchmark/evaluation.py',
      'RCAEval/classes/graph.py',
    ]);
    for (const file of RECORD.provenance.files) {
      expect(file.sha256, file.path).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(RECORD.provenance.howToReproduce.length).toBeGreaterThanOrEqual(5);
  });

  it('cites the same upstream the record was taken from', () => {
    // Two accounts of one fact: the metric's `source` string and this record's provenance.
    // They disagreed -- the metric cited `cruiseresearchgroup/RCAEval`, a repository whose
    // default branch is `v2`, whose last push was 2026-02-17, and which has no `main` --
    // and nothing read either against the other. Both copies of the evaluator compute the
    // same arithmetic, so no number was ever wrong; the citation was.
    const source = officialMetric('rcaeval-re2').source;
    expect(source).toContain(RECORD.provenance.repo);
    expect(source, 'the citation should name the file the digest above covers').toContain(
      RECORD.provenance.files[0]!.path,
    );
  });

  it('reproduces every pinned verdict', () => {
    const wrong: string[] = [];
    for (const entry of RECORD.sets) {
      const report = scoreSet(entry);
      if (report.caseCount !== entry.verdict.num) {
        wrong.push(`${entry.name}: ${report.caseCount} cases, upstream scored ${entry.verdict.num}`);
        continue;
      }
      for (let k = 1; k <= 5; k += 1) {
        const ours = report.breakdown[`ac${String(k)}`];
        const theirs = round2(entry.verdict.accuracy[k - 1]!);
        if (ours !== theirs) wrong.push(`${entry.name}: ac${String(k)} ${String(ours)} vs ${String(theirs)}`);
      }
      const oursAvg = report.breakdown['avg5'];
      const theirsAvg = round2(entry.verdict.average5);
      if (oursAvg !== theirsAvg) {
        wrong.push(
          `${entry.name}: avg5 ${String(oursAvg)} vs ${String(theirsAvg)} ` +
            `(averaging rounded rates gives ${String(averageOfRounded(entry))})`,
        );
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([]);
  });

  it('keeps the sets that separate averaging-rounded-rates from rounding-the-average', () => {
    // The anti-vacuity assertion this file would be worthless without. If every pinned set
    // happened to satisfy `mean(rounded) === round(mean)`, the suite would have passed on the
    // defective scorer -- which it did, for as long as the scorer existed, because every
    // input the project ever scored was a perfect one.
    const disagreed = RECORD.sets.filter((set) => set.kind === 'disagreed');
    expect(disagreed.length).toBeGreaterThanOrEqual(20);
    const insensitive = disagreed.filter((set) => averageOfRounded(set) === round2(set.verdict.average5));
    expect(
      insensitive.map((set) => set.name),
      'these entries no longer separate the two readings, so they cannot witness the fix',
    ).toEqual([]);
  });

  it('states the divergences it does not reproduce, rather than leaving them implicit', () => {
    const named = RECORD.divergences.map((entry) => entry.what).join('\n');
    expect(named).toContain('empty corpus');
    expect(named).toContain('did not parse');
    for (const entry of RECORD.divergences) {
      expect(entry.why.length, entry.what).toBeGreaterThan(80);
    }
  });
});
