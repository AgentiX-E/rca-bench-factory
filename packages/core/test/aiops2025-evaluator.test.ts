import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scoreOfficial } from '../src/score/official.js';
import type { OfficialPrediction } from '../src/score/official.js';

/**
 * AIOps2025's Final_A, held to the section that defines it.
 *
 * `golden-master/aiops2025-evaluator.json` pins arXiv 2606.29193v1 §4.4 (the same
 * PDF as the RCA100 corpus, and the test asserts the two digests are equal so the
 * pins cannot drift apart) and the dataset README, which is where `source`,
 * `destination`, `key_metrics` and `fault_description` are described.
 *
 * ## The clause that was missing
 *
 * > Two fault families need targeted relaxations: for network attacks, LA accepts
 * > a hit on either source or destination since evidence is prominent at both
 * > endpoints.
 *
 * The reader discarded the answer key's `source` and `destination` entirely, so an
 * answer that named the *other* endpoint of an injected network fault scored zero
 * on localisation where the protocol pays full credit. Every case in the tree was
 * a single-endpoint case, so nothing could notice -- the same shape as the
 * Cloud-OpsBench corpus, one target over.
 *
 * ## The clause that is still missing, and why it is recorded rather than faked
 *
 * > with embedding-similarity fallback for unhit cases
 *
 * The first step (keyword detection) is implemented. The fallback needs an
 * embedding model and a similarity threshold the paper does not name; choosing one
 * would change the number, and choosing one to match the paper's reported TA would
 * be fitting the metric to its own result. So the direction it costs is written
 * down -- a paraphrase with none of the description's words scores 0 here and may
 * be credited there -- and the fallback stays a gap.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORPUS = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'aiops2025-evaluator.json'), 'utf8'),
) as Corpus;
const RCA100_CORPUS = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'rca100-evaluator.json'), 'utf8'),
) as { paper: { pdf: { sha256: string } } };

interface Clause {
  id: string;
  term: string;
  quote: string;
  implemented?: boolean;
  was?: boolean;
  weights?: number[];
  why: string;
}

interface Corpus {
  schema: string;
  takenAt: string;
  paper: { id: string; version: string; section: string; pdf: { bytes: number; sha256: string } };
  dataset: { readme: { bytes: number; sha256: string }; fields: Array<{ name: string; quote: string; why: string }> };
  clauses: Clause[];
  gaps: Array<{ id: string; clause: string; costs: string; next: string }>;
}

const clause = (id: string): Clause => {
  const found = CORPUS.clauses.find((c) => c.id === id);
  expect(found, `${id} is not in the corpus`).toBeDefined();
  return found!;
};

// ---------------------------------------------------------------------------
// A ground-truth line, and a prediction built from it.
// ---------------------------------------------------------------------------

interface Key {
  service: string;
  instance?: string;
  instanceType?: string;
  source?: string;
  destination?: string;
  description?: string;
  observations?: string[];
  metrics?: string[];
}

const defaults = {
  description: 'CPU saturation on the order service',
  observations: ['order|cpu_usage', 'log:pool exhausted'],
  metrics: ['order|latency_ms'],
};

function line(key: Key, id = 'case-1'): string {
  return JSON.stringify({
    uuid: id,
    fault_category: 'resource',
    fault_type: 'cpu_stress',
    instance_type: key.instanceType ?? 'service',
    service: key.service,
    instance: key.instance ?? key.service,
    ...(key.source === undefined ? {} : { source: key.source }),
    ...(key.destination === undefined ? {} : { destination: key.destination }),
    start_time: '2026-09-06T00:00:00.000Z',
    end_time: '2026-09-06T00:20:00.000Z',
    key_observations: {
      log: (key.observations ?? defaults.observations)
        .filter((o) => o.startsWith('log:'))
        .map((o) => ({ ref: o })),
      metric: (key.observations ?? defaults.observations)
        .filter((o) => !o.startsWith('log:'))
        .map((o) => ({ ref: o })),
      trace: [],
    },
    key_metrics: key.metrics ?? defaults.metrics,
    fault_description: key.description ?? defaults.description,
  });
}

function exportOf(keys: Key[]): Record<string, string> {
  return {
    'groundtruth.jsonl': keys.map((key, index) => line(key, `case-${String(index + 1)}`)).join('\n'),
  };
}

function answer(overrides: Partial<OfficialPrediction> = {}): OfficialPrediction {
  return {
    component: 'order',
    faultType: 'cpu_stress',
    reason: 'cpu saturation',
    occurredAt: '',
    ranks: [],
    chain: [],
    evidence: ['order|cpu_usage', 'log:pool exhausted', 'order|latency_ms'],
    traceWords: 5,
    ...overrides,
  };
}

function report(keys: Key[], predictions: OfficialPrediction[]) {
  return scoreOfficial('aiops2025', exportOf(keys), predictions);
}

describe('the corpus is the thing it claims to be', () => {
  it('pins the same paper as the RCA100 corpus, by digest', () => {
    expect(CORPUS.schema).toBe('rca-bench-official-corpus/1');
    expect(CORPUS.paper.id).toBe('2606.29193');
    expect(CORPUS.paper.section).toContain('4.4');
    expect(CORPUS.paper.pdf.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Two files, one PDF. Pinning it twice is fine; letting the two pins drift is
    // not, and this is what stops it.
    expect(CORPUS.paper.pdf.sha256).toBe(RCA100_CORPUS.paper.pdf.sha256);
    expect(CORPUS.paper.pdf.bytes).toBe(2958887);
  });

  it('pins the dataset README, which is where the endpoints are described', () => {
    expect(CORPUS.dataset.readme.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(CORPUS.dataset.readme.bytes).toBeGreaterThan(1000);
    const fields = CORPUS.dataset.fields.map((f) => f.name);
    for (const name of ['source', 'destination', 'key_metrics', 'fault_description']) {
      expect(fields, `${name} is not documented`).toContain(name);
    }
  });

  it('quotes every clause, and says which of them the rule implements', () => {
    let total = 0;
    for (const entry of CORPUS.clauses) {
      expect(entry.quote.length, `${entry.id} quotes nothing`).toBeGreaterThan(40);
      expect(entry.why.length, `${entry.id} argues nothing`).toBeGreaterThan(60);
      total += entry.quote.length;
    }
    expect(total).toBeGreaterThan(800);
    // The two clauses that are not fully implemented, named rather than inferred:
    // a reader must be able to count them without reading the scorer.
    expect(clause('la-network-relaxation').was).toBe(false);
    expect(clause('ta-two-step').implemented).toBe(false);
  });

  it('states the gap the first step of TA leaves open, with its direction', () => {
    expect(CORPUS.gaps).toHaveLength(1);
    const gap = CORPUS.gaps[0]!;
    expect(gap.clause).toBe('ta-two-step');
    expect(gap.costs.length).toBeGreaterThan(60);
    expect(gap.next.length).toBeGreaterThan(120);
    // The gap is about a *missing* fallback, so the clause it points at must be the
    // one whose quote contains it.
    expect(clause(gap.clause).quote).toContain('embedding-similarity fallback');
  });
});

describe('localisation is strict, with the one relaxation the protocol grants', () => {
  it('accepts an exact match and refuses a prefix or a qualified instance', () => {
    const keys = [{ service: 'emailservice' }];
    expect(report(keys, [answer({ component: 'emailservice' })]).breakdown.la).toBe(1);
    // "Strict matching distinguishes right service from right instance
    // (e.g., emailservice != emailservice-0)".
    expect(report(keys, [answer({ component: 'emailservice-0' })]).breakdown.la).toBe(0);
    expect(report(keys, [answer({ component: 'email' })]).breakdown.la).toBe(0);
  });

  it('accepts either endpoint of a network fault', () => {
    const keys = [{ service: 'checkout', source: 'checkout', destination: 'payment' }];
    expect(report(keys, [answer({ component: 'checkout' })]).breakdown.la).toBe(1);
    expect(report(keys, [answer({ component: 'payment' })]).breakdown.la).toBe(1);
    expect(report(keys, [answer({ component: 'payment' })]).final).toBe(100);
  });

  it('does not extend the relaxation to a third entity', () => {
    const keys = [{ service: 'checkout', source: 'checkout', destination: 'payment' }];
    expect(report(keys, [answer({ component: 'cart' })]).breakdown.la).toBe(0);
  });

  it('applies the relaxation only where the key declares the endpoints', () => {
    // The anti-vacuity half. The same answer, on a key that names no endpoints,
    // must still score zero -- otherwise the relaxation would be a general
    // "anything the topology mentions" rule, which is not what the clause says.
    const without = [{ service: 'checkout' }];
    expect(report(without, [answer({ component: 'payment' })]).breakdown.la).toBe(0);
    expect(report(without, [answer({ component: 'payment' })]).final).toBeLessThan(100);
  });

  it('counts an endpoint-correct case as LA-correct for the efficiency term', () => {
    // "APL is the mean reasoning_trace length over LA-correct cases", and LA is now
    // correct for a destination answer, so its trace length enters APL.
    const keys = [{ service: 'checkout', source: 'checkout', destination: 'payment' }];
    const short = report(keys, [answer({ component: 'payment', traceWords: 5 })]);
    const long = report(keys, [answer({ component: 'payment', traceWords: 15 })]);
    expect(short.breakdown.efficiency).toBe(1);
    expect(long.breakdown.efficiency).toBeLessThan(1);
  });

  it('keeps a wrong answer out of the efficiency average, however long its trace', () => {
    // "Restricting to LA-correct prevents wrong-answer short-path gaming" -- and
    // the same restriction stops a long wrong answer from depressing the term for
    // the cases that were right. One long wrong answer beside one short correct
    // one: APL is 5, not 27.5.
    const keys = [
      { service: 'checkout', source: 'checkout', destination: 'payment' },
      { service: 'checkout', source: 'checkout', destination: 'payment' },
    ];
    const r = report(keys, [
      answer({ component: 'payment', traceWords: 5 }),
      answer({ component: 'cart', traceWords: 50 }),
    ]);
    expect(r.breakdown.la).toBe(0.5);
    expect(r.breakdown.efficiency).toBe(1);
  });
});

describe('the reason field is read for twenty words and no more', () => {
  const filler = (n: number): string => Array.from({ length: n }, () => 'aa').join(' ');

  it('accepts a keyword inside the first twenty words', () => {
    const r = report([{ service: 'order' }], [answer({ reason: `${filler(19)} cpu` })]);
    expect(r.breakdown.ta).toBe(1);
  });

  it('refuses a keyword at word twenty-one', () => {
    // "The reason field is truncated to its first 20 words to suppress keyword
    // stuffing." The keyword is there, and it does not count.
    const r = report([{ service: 'order' }], [answer({ reason: `${filler(20)} cpu` })]);
    expect(r.breakdown.ta).toBe(0);
  });
});

describe('an evidence point is its first twenty characters', () => {
  it('counts an observation that agrees on the first twenty and differs after', () => {
    // The published rule, pinned as a case rather than lamented: both sides are cut
    // to 20 characters, so the tail is not compared.
    // Twenty characters exactly, so the truncation boundary is the thing under
    // test rather than a property of the fixture's length.
    const prefix = 'order|cpu_usage|1234';
    expect(prefix).toHaveLength(20);
    const keys = [{ service: 'order', observations: [prefix], metrics: [] }];
    const cited = `${prefix}and then a tail nobody compares`;
    const r = report(keys, [answer({ evidence: [cited] })]);
    expect(r.breakdown.explainability).toBe(1);
  });

  it('refuses an observation that differs inside the first twenty characters', () => {
    const keys = [{ service: 'order', observations: ['order|cpu_usage'], metrics: [] }];
    const r = report(keys, [answer({ evidence: ['order|cpu_usageX'] })]);
    expect(r.breakdown.explainability).toBe(0);
  });
});

describe('the report is the formula in the section', () => {
  it('computes Final_A from the four terms it prints', () => {
    const keys = [{ service: 'checkout', source: 'checkout', destination: 'payment' }];
    const r = report(keys, [answer({ component: 'payment', reason: 'cpu saturation' })]);
    const weights = clause('final-formula').weights!;
    expect(weights).toEqual([0.4, 0.4, 0.1, 0.1]);
    const breakdown = r.breakdown as Record<string, number>;
    const recomposed =
      weights[0]! * breakdown['la']! +
      weights[1]! * breakdown['ta']! +
      weights[2]! * breakdown['explainability']! +
      weights[3]! * breakdown['efficiency']!;
    // `final` is the 0-100 form of the same formula.
    expect(r.final).toBe(Math.round(recomposed * 100 * 100) / 100);
  });

  it('takes the localisation term from the case records, not a second copy of the rule', () => {
    // Finding 183's lesson, applied before it could bite here: the aggregate used
    // to recompute LA with a bare equality, so the endpoint relaxation would have
    // moved the case scores and left the report at the old rule.
    const keys = [{ service: 'checkout', source: 'checkout', destination: 'payment' }];
    const r = report(keys, [answer({ component: 'payment' })]);
    expect(r.cases[0]!.terms?.['la']).toBe(1);
    expect(r.breakdown.la).toBe(1);
  });
});
