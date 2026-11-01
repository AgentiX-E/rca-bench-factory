import { describe, expect, it } from 'vitest';
import {
  assessPoolNarrowing,
  describePoolNarrowing,
  narrowToServices,
  type PoolCase,
} from '../src/fault/pool-width.js';

/** One case, one run, with the candidates in rank order. Kinds are spelled the way the graph spells them. */
function poolCase(input: {
  readonly caseId?: string;
  readonly answer: string;
  readonly kind: string;
  readonly candidates: readonly (readonly [string, string])[];
  readonly method?: string;
}): PoolCase {
  return {
    caseId: input.caseId ?? 'c1',
    answer: input.answer,
    answerKind: input.kind,
    runs: [
      {
        method: input.method ?? 'peak-z-by-service',
        candidates: input.candidates.map(([name, kind]) => ({ name, kind })),
      },
    ],
  };
}

describe('narrowToServices', () => {
  it('keeps the order and drops every entity that is not a service', () => {
    const kept = narrowToServices([
      { name: 'ingest-queue', kind: 'mq' },
      { name: 'ingest-writer', kind: 'service' },
      { name: 'node-1', kind: 'node' },
    ]);
    expect(kept.map((one) => one.name)).toEqual(['ingest-writer']);
  });

  it('returns an empty pool when nothing in the ranking is a service', () => {
    expect(narrowToServices([{ name: 'orders-db', kind: 'db' }])).toEqual([]);
  });

  it('does not invent a kind for a name the graph never declared', () => {
    // An unknown kind is not a service, so it leaves the pool. The alternative -- treating an
    // unrecognised name as a service -- would silently re-admit the loader's `-db` rewrites.
    expect(narrowToServices([{ name: 'billing', kind: 'absent' }])).toEqual([]);
  });
});

describe('assessPoolNarrowing', () => {
  it('reports both readings over every run, including the cases a narrowed pool cannot score', () => {
    const reading = assessPoolNarrowing([
      // The answer is rank 1 already: narrowing changes nothing.
      poolCase({
        answer: 'checkout-api',
        kind: 'service',
        candidates: [
          ['checkout-api', 'service'],
          ['checkout-api-0', 'pod'],
        ],
      }),
      // The answer is rank 2 behind a pod: narrowing promotes it.
      poolCase({
        caseId: 'c2',
        answer: 'search-cluster',
        kind: 'service',
        candidates: [
          ['search-node-4', 'pod'],
          ['search-cluster', 'service'],
        ],
      }),
      // The answer is not a service at all: a narrowed pool cannot name it.
      poolCase({
        caseId: 'c3',
        answer: 'orders-db',
        kind: 'db',
        candidates: [
          ['orders-db', 'db'],
          ['orders', 'service'],
        ],
      }),
    ]);
    expect(reading.cases).toBe(3);
    expect(reading.scorableCases).toBe(2);
    expect(reading.unscorable).toEqual([{ caseId: 'c3', answer: 'orders-db', kind: 'db' }]);
    expect(reading.before).toEqual({ rank1: 2, top3: 3, absent: 0 });
    expect(reading.after).toEqual({ rank1: 2, top3: 2, absent: 1 });
    expect(reading.gained.map((one) => one.caseId)).toEqual(['c2']);
    expect(reading.lost.map((one) => one.caseId)).toEqual(['c3']);
  });

  it('counts a case that is already absent as absent in both readings', () => {
    const reading = assessPoolNarrowing([
      poolCase({ answer: 'api-gateway', kind: 'service', candidates: [['pricing-service', 'service']] }),
    ]);
    expect(reading.before.absent).toBe(1);
    expect(reading.after.absent).toBe(1);
    expect(reading.before.rank1).toBe(0);
    expect(reading.lost).toEqual([]);
  });

  it('keeps the two baselines apart, because a per-method reading is what the guard publishes', () => {
    const reading = assessPoolNarrowing([
      {
        caseId: 'c1',
        answer: 'api-gateway',
        answerKind: 'service',
        runs: [
          {
            method: 'peak-z-by-service',
            candidates: [
              { name: 'api-gateway-0', kind: 'pod' },
              { name: 'api-gateway', kind: 'service' },
            ],
          },
          {
            method: 'median-shift-by-service',
            candidates: [
              { name: 'api-gateway', kind: 'service' },
              { name: 'api-gateway-0', kind: 'pod' },
            ],
          },
        ],
      },
    ]);
    expect(reading.runs.map((one) => `${one.method}:${String(one.before)}->${String(one.after)}`)).toEqual([
      'peak-z-by-service:2->1',
      'median-shift-by-service:1->1',
    ]);
  });

  it('names the cases that move, which is what makes the cost checkable', () => {
    const reading = assessPoolNarrowing([
      poolCase({
        caseId: 'gains',
        answer: 'search-cluster',
        kind: 'service',
        candidates: [
          ['search-node-4', 'pod'],
          ['search-cluster', 'service'],
        ],
      }),
      poolCase({
        caseId: 'loses',
        answer: 'tax-calculation',
        kind: 'external',
        candidates: [
          ['pricing-service', 'service'],
          ['tax-calculation', 'external'],
        ],
      }),
    ]);
    expect(reading.gained.map((one) => `${one.caseId}:${String(one.before)}->${String(one.after)}`)).toEqual([
      'gains:2->1',
    ]);
    expect(reading.lost.map((one) => `${one.caseId}:${String(one.before)}->${String(one.after)}`)).toEqual([
      'loses:2->null',
    ]);
  });

  it('refuses an empty corpus rather than reporting a share of nothing', () => {
    expect(() => assessPoolNarrowing([])).toThrow(/no case/u);
  });
});

describe('describePoolNarrowing', () => {
  it('states both readings, the cost, and does not read as an improvement', () => {
    const sentence = describePoolNarrowing(
      assessPoolNarrowing([
        poolCase({
          caseId: 'c1',
          answer: 'search-cluster',
          kind: 'service',
          candidates: [
            ['search-node-4', 'pod'],
            ['search-cluster', 'service'],
          ],
        }),
        poolCase({
          caseId: 'c2',
          answer: 'analytics-replica',
          kind: 'db',
          candidates: [
            ['orders-db', 'db'],
            ['analytics-replica', 'db'],
          ],
        }),
      ]),
    );
    expect(sentence).toContain('rank 1 0 of 2 -> 1 of 2');
    expect(sentence).toContain('top-3 2 -> 1');
    expect(sentence).toContain('absent 0 -> 1');
    expect(sentence).toContain("'c2' would stop being scorable");
    expect(sentence).toContain('analytics-replica is a db');
    expect(sentence).toContain('promotions inside a top-3 that already held the answer');
    expect(sentence).toContain('1 run(s) lose it outright');
  });

  it('says so when nothing moves, instead of printing an empty list', () => {
    const sentence = describePoolNarrowing(
      assessPoolNarrowing([poolCase({ answer: 'checkout-api', kind: 'service', candidates: [['checkout-api', 'service']] })]),
    );
    expect(sentence).toContain('every case keeps its answer');
    expect(sentence).toContain('no case moves');
  });

  it('spells each kind as a phrase rather than pasting the vocabulary in', () => {
    const sentence = describePoolNarrowing(
      assessPoolNarrowing([
        poolCase({
          caseId: 'c1',
          answer: 'tax-calculation',
          kind: 'external',
          candidates: [
            ['pricing-service', 'service'],
            ['tax-calculation', 'external'],
          ],
        }),
      ]),
    );
    expect(sentence).toContain('tax-calculation is an external dependency');
  });

  it('still names a kind this module has never seen, rather than printing undefined', () => {
    // The vocabulary is closed and the map covers it, but a corpus can grow a kind before this file
    // does -- and the sentence is the only place that says why a case leaves the pool.
    const sentence = describePoolNarrowing(
      assessPoolNarrowing([
        poolCase({
          caseId: 'c1',
          answer: 'shard-7',
          kind: 'replica-set',
          candidates: [
            ['shard-7', 'replica-set'],
            ['cart-service', 'service'],
          ],
        }),
      ]),
    );
    expect(sentence).toContain('shard-7 is a replica-set');
  });

  it('reads a name no entity carries as exactly that, not as a service', () => {
    const sentence = describePoolNarrowing(
      assessPoolNarrowing([
        poolCase({
          caseId: 'c1',
          answer: 'billing',
          kind: 'absent',
          candidates: [
            ['billing', 'absent'],
            ['billing-service', 'service'],
          ],
        }),
      ]),
    );
    expect(sentence).toContain('billing is a name no entity carries');
  });
});
