import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportRca100 } from '../src/export/rca100.js';
import { validBundle } from './fixtures.js';
import {
  RCA100_ADJACENT_CREDIT,
  readOfficialGroundTruth,
  rca100Score,
  rca100Terms,
  scoreOfficial,
} from '../src/score/official.js';
import type { OfficialPrediction } from '../src/score/official.js';

/**
 * RCA100's Final_B, held to the three sentences that define it.
 *
 * `golden-master/rca100-evaluator.json` pins arXiv 2606.29193v1 §5.4 -- the paper
 * by digest, each clause by verbatim quote -- and records the dataset's own
 * scoring rubric with its digest and the reason it is not vendored.
 *
 * ## Two clauses of one section were dropped
 *
 *   - **The adjacent credit.** "A UModel entity-ID match with partial credit on
 *     topologically adjacent entities (0.40)." This repository paid 0.5, a number
 *     with no source anywhere.
 *   - **The numeric condition.** "99.5% carry a `⟨comparator, value, unit⟩`
 *     numeric constraint, so the agent must match the numeric condition, not
 *     merely mention the metric." The reader kept `signal_ref` alone, so an
 *     answer that named the right metric with the wrong threshold scored the
 *     checkpoint.
 *
 * ## And the two halves of the rule were two implementations
 *
 * Changing the adjacent credit moved the per-case score and left the report's
 * breakdown at 0.5, because `aggregateFor` recomputed the three terms instead of
 * reading them. The report then printed `accuracy: 0.94` beside `final: 95` --
 * one quantity, twice, disagreeing. The aggregate now averages the terms the case
 * record carries, and the assertions below hold the two numbers together.
 *
 * ## What the facet-level mutation grid cannot see
 *
 * `mutatePrediction` replaces a facet whole: the `evidence` mutation swaps the
 * list for a sentinel. A rule that keeps the signal name and ignores the value
 * therefore passes the grid -- the grid never keeps the part the rule should be
 * sensitive to. The case-level assertions here are what close that, and the
 * lesson is recorded rather than the grid being widened for one target.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORPUS = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'rca100-evaluator.json'), 'utf8'),
) as Corpus;

interface Clause {
  id: string;
  term: string;
  quote: string;
  value?: number | null;
  was?: number | null;
  weights?: number[];
  why: string;
}

interface Corpus {
  schema: string;
  takenAt: string;
  paper: { id: string; version: string; section: string; pdf: { bytes: number; sha256: string } };
  clauses: Clause[];
  token: { format: string; separator: string; example: string };
  rubric: {
    url: string;
    bytes: number;
    sha256: string;
    values: Record<string, number>;
    vendored: boolean;
    why_not_vendored: string;
  };
}

const clause = (id: string): Clause => {
  const found = CORPUS.clauses.find((c) => c.id === id);
  expect(found, `${id} is not in the corpus`).toBeDefined();
  return found!;
};

// ---------------------------------------------------------------------------
// A one-case export, built through the real exporter so the token format is the
// one an export actually produces.
// ---------------------------------------------------------------------------

const files = (): Record<string, string> => exportRca100(validBundle()).files;

function oracle(): OfficialPrediction {
  const gt = readOfficialGroundTruth('rca100', files())[0]!;
  return {
    component: gt.component,
    faultType: gt.faultType,
    reason: '',
    occurredAt: '',
    ranks: [],
    chain: [...gt.chain],
    evidence: [...gt.evidence],
    traceWords: 0,
  };
}

describe('the corpus is the thing it claims to be', () => {
  it('pins the paper by digest and the section it read', () => {
    expect(CORPUS.schema).toBe('rca-bench-official-corpus/1');
    expect(CORPUS.paper.id).toBe('2606.29193');
    expect(CORPUS.paper.version).toBe('v1');
    expect(CORPUS.paper.section).toContain('5.4');
    expect(CORPUS.paper.pdf.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(CORPUS.paper.pdf.bytes).toBeGreaterThan(1_000_000);
  });

  it('quotes every clause it turns into a rule', () => {
    // Four clauses, one per term the rule computes. A clause without a quote is
    // an author's memory of a paper, which is what this whole campaign is about.
    const terms = CORPUS.clauses.map((c) => c.term).sort();
    expect(terms).toEqual(['checkpoints', 'entity', 'fault', 'formula']);
    // 40 characters, not 60: the formula clause is a formula, and
    // `Final𝐵 = (0.4 Entity + 0.3 Fault + 0.3 Process) × 100.` is 55 characters
    // and self-identifying. The three prose clauses are held to the same floor and
    // clear it by a factor of two; the total is what rules out a quote made of
    // filler.
    let total = 0;
    for (const entry of CORPUS.clauses) {
      expect(entry.quote.length, `${entry.id} quotes nothing`).toBeGreaterThan(40);
      expect(entry.why.length, `${entry.id} argues nothing`).toBeGreaterThan(60);
      total += entry.quote.length;
    }
    expect(total).toBeGreaterThan(300);
  });

  it('states the token format the reader writes', () => {
    // One statement of the format, in the corpus, because the docs and the code
    // both describe it and a second prose copy would drift.
    expect(CORPUS.token.separator).toBe('|');
    expect(CORPUS.token.format).toBe('signal|comparator|value|unit');
    const gt = readOfficialGroundTruth('rca100', files())[0]!;
    expect(gt.evidence).toEqual(['order|cpu_usage|>|90|%']);
  });

  it('records the rubric without shipping it, and says why', () => {
    expect(CORPUS.rubric.vendored).toBe(false);
    expect(CORPUS.rubric.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(CORPUS.rubric.why_not_vendored.length).toBeGreaterThan(120);
    // The four numbers are the rubric's own names and values, so a rule that
    // eventually applies it has them without a second fetch.
    expect(CORPUS.rubric.values).toEqual({
      T3_exact_L3: 1,
      T2_same_L2: 0.5,
      T1_same_L1: 0.2,
      T0_different: 0,
    });
  });
});

describe('the adjacent credit is the number the paper writes', () => {
  it('pays 0.40 for a neighbour, not 0.5', () => {
    const entity = clause('entity-adjacent-credit');
    expect(RCA100_ADJACENT_CREDIT).toBe(entity.value);
    expect(entity.value).toBe(0.4);
    expect(RCA100_ADJACENT_CREDIT).not.toBe(entity.was);
  });

  it('shows the credit in the case score and in the report', () => {
    const neighbour = { ...oracle(), component: 'cart' };
    const report = scoreOfficial('rca100', files(), [neighbour]);
    expect(report.breakdown.entity).toBe(0.4);
    // 0.4 * 0.40 + 0.3 * 1 + 0.3 * 1
    expect(report.final).toBe(76);
  });
});

describe('the numeric condition is part of the checkpoint', () => {
  const withEvidence = (evidence: string[]): number =>
    scoreOfficial('rca100', files(), [{ ...oracle(), evidence }]).final;

  it('accepts only the four fields the answer key declares', () => {
    expect(withEvidence(['order|cpu_usage|>|90|%'])).toBe(100);
  });

  it('refuses the same signal with a different value', () => {
    // The clause this file exists for. Under the old reader both of these were
    // the string `order|cpu_usage` and both scored the checkpoint.
    expect(withEvidence(['order|cpu_usage|>|9|%'])).toBeLessThan(100);
    expect(withEvidence(['order|cpu_usage|>|9000|%'])).toBeLessThan(100);
  });

  it('refuses the same signal and value with a different comparator or unit', () => {
    expect(withEvidence(['order|cpu_usage|<|90|%'])).toBeLessThan(100);
    expect(withEvidence(['order|cpu_usage|>|90|ms'])).toBeLessThan(100);
    expect(withEvidence(['order|cpu_usage|>|90|'])).toBeLessThan(100);
  });

  it('refuses a bare signal name, which is what the old rule accepted', () => {
    // The exact input that scored full marks before: the metric, named, with no
    // condition attached.
    expect(withEvidence(['order|cpu_usage'])).toBeLessThan(100);
    expect(withEvidence([])).toBeLessThan(100);
  });

  it('keeps the chain term out of the comparison, so one term cannot stand for the other', () => {
    // A prediction that walks the chain and cites nothing scores the chain term
    // and not the checkpoint term; the process pillar is their mean.
    const report = scoreOfficial('rca100', files(), [{ ...oracle(), evidence: [] }]);
    expect(report.breakdown.chainNodeMatch).toBe(1);
    expect(report.breakdown.checkpointHit).toBe(0);
    expect(report.breakdown.process).toBe(0.5);
    expect(report.final).toBe(85);
  });
});

describe('one quantity, one number', () => {
  it('reports the same value as accuracy and as final', () => {
    // The two numbers that disagreed while the rule was written twice. Final_B is
    // a linear combination of the terms and the aggregate is their mean, so the
    // headline and the mean case score are the same quantity.
    for (const prediction of [
      oracle(),
      { ...oracle(), component: 'cart' },
      { ...oracle(), faultType: 'unrelated-candidate' },
      { ...oracle(), evidence: ['order|cpu_usage|>|9|%'] },
      { ...oracle(), chain: [] },
    ]) {
      const report = scoreOfficial('rca100', files(), [prediction]);
      expect(report.final, JSON.stringify(prediction.evidence)).toBe(
        Math.round(100 * report.accuracy),
      );
    }
  });

  it('keeps the headline and the case mean together when the cases disagree', () => {
    // A single-case export cannot tell a mean of case scores from a
    // re-composition of the mean terms: with one case they are the same number.
    // Three cases whose term sets differ can, and that is where the second
    // implementation hid: `process` is the mean of the terms a case *carries*,
    // so averaging the terms after averaging is not averaging the case scores.
    //
    //   case A  chain matched, checkpoint matched       -> 1.00
    //   case B  chain matched, checkpoint missed        -> 0.85
    //   case C  no chain, no checkpoint                 -> 0.70
    //   mean of the three                               -> 0.85
    //
    // Re-composed from the term means: chain 1.0 over the two cases that declare
    // one, checkpoints 0.5 over the same two, process 0.75 -> 0.925, which the
    // report would print as 93 for the same three cases.
    const template = files()['cases/case-001/topology.json']!;
    const keyed = (steps: unknown[], component = 'order', fault = 'cpu'): string =>
      JSON.stringify({
        root_cause_entities: [component],
        root_cause_types: [fault],
        raw_ground_truth: JSON.stringify({ reasoning: { steps } }),
      });
    const step = (to: string, signal: string | null): unknown => ({
      from_entity: 'order',
      to_entity: to,
      checkpoints:
        signal === null ? [] : [{ signal_ref: signal, comparator: '>', value: 90, unit: '%' }],
    });
    const cases = [
      { id: 'a', steps: [step('cart', 'order|cpu_usage')] },
      { id: 'b', steps: [step('cart', 'order|cpu_usage')] },
      { id: 'c', steps: [step('', null)] },
    ];
    const exportFiles: Record<string, string> = {};
    for (const entry of cases) {
      exportFiles[`cases/${entry.id}/topology.json`] = template;
      exportFiles[`answer_key/${entry.id}.gt.json`] = keyed(entry.steps);
    }
    const predictions: OfficialPrediction[] = [
      oracle(),
      { ...oracle(), evidence: [] },
      oracle(),
    ];

    const report = scoreOfficial('rca100', exportFiles, predictions);
    const perCase = report.cases.map((c) => Math.round(c.score * 100) / 100);
    // Stated as data, so the headline below cannot drift from the cases it is a
    // mean of.
    expect(perCase).toEqual([1, 0.85, 0.7]);
    expect(report.final).toBe(85);
    expect(report.final).toBe(Math.round(100 * report.accuracy));
    // Case C declares no process at all, so its process term is absent rather
    // than zero: the mean is over the two cases that have one, (1 + 0.5) / 2. A
    // zero would be a different claim -- that C's answer was wrong -- and a one
    // would be the free denominator.
    expect(report.breakdown.process).toBe(0.75);
  });

  it('computes the headline from the terms and not from a second copy of the rule', () => {
    // `rca100Score` is the only composer; the aggregate reads terms and averages
    // them. Recomposing here from the breakdown's own numbers is the check that
    // the two cannot drift: if the aggregate recomputed the rule, its weighted sum
    // would stop agreeing with the case score.
    const predictions: OfficialPrediction[] = [
      oracle(),
      { ...oracle(), component: 'cart' },
      { ...oracle(), evidence: ['order|cpu_usage|>|9|%'] },
    ];
    for (const prediction of predictions) {
      const gt = readOfficialGroundTruth('rca100', files())[0]!;
      const terms = rca100Terms(prediction, gt);
      const present = [terms['chain'], terms['checkpoints']].filter(
        (term): term is number => term !== undefined,
      );
      const process = present.reduce((sum, term) => sum + term, 0) / present.length;
      expect(rca100Score(terms)).toBe(0.4 * terms['entity']! + 0.3 * terms['fault']! + 0.3 * process);
    }
  });

  it('drops a term the answer key does not declare instead of crediting it', () => {
    // The free-denominator defect, from the other side: an answer key with no
    // checkpoints must not hand the checkpoint term away.
    const withoutEvidence = Object.fromEntries(
      Object.entries(files()).filter(([path]) => !path.endsWith('.gt.json')),
    );
    const gt = {
      ...JSON.parse(files()['answer_key/case-001.gt.json']!),
      raw_ground_truth: JSON.stringify({
        reasoning: {
          steps: [
            {
              from_entity: 'order',
              to_entity: 'cart',
              checkpoints: [],
            },
          ],
        },
      }),
    };
    const report = scoreOfficial('rca100', {
      ...withoutEvidence,
      'answer_key/case-001.gt.json': JSON.stringify(gt),
    });
    expect(report.breakdown.checkpointHit).toBe(0);
    // Chain matched, checkpoint term absent, so process is the chain term alone.
    expect(report.breakdown.process).toBe(1);
    expect(report.final).toBe(100);
  });
});
