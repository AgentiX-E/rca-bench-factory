/**
 * Adjudicate the recorded misses: same fault at a different altitude, or a
 * genuinely different fault?
 *
 * Finding 91 ended by naming this as the one thing it could not do from where it
 * stood:
 *
 * > The 39 misses are *all* same-mechanism by inspection, but inspection is mine,
 * > and the adjudication has to be a rule over the recorded rows rather than a
 * > reading of them. Until that rule exists, "the labels are too fine" is a
 * > hypothesis with strong support, not a measurement.
 *
 * Finding 92 then made the row set correct -- 14 `type` misses from `567118aea`,
 * not 15 from `9932e766c`. This file is the rule, run over that row set.
 *
 * The property under test is **the honesty of the rule**, not the answer it
 * gives. A rule that called all 14 rows "same fault" would produce the reading
 * finding 91 wanted and would be worthless, because a rule that cannot say no is
 * not a test. So the tests that matter here are the ones that make the rule
 * **refuse**: constructed pairs from outside the dataset that are genuinely
 * different faults and must be reported as such, and a documented boundary where
 * the rule declines to decide.
 *
 * Everything below reads the real fixture through the real reader. No row is
 * transcribed, because finding 92's defect was a transcription.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  adjudicateAll,
  adjudicateMiss,
  countAdjudications,
  crossProduct,
  sampleAdjudication,
  tokenize,
} from '../../src/fault/miss-adjudication.js';
import { parseMissDetail, type MissDetailRow } from '../../src/fault/miss-detail.js';
import type { ScoredField } from '../../src/fault/extraction-scoring.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIXTURES = resolve(ROOT, 'fixtures');

/** The run the `type` reading is taken from. Finding 92 settled this. */
const CURRENT_RUN = '567118aea';

function recorded(run: string): string {
  return readFileSync(resolve(FIXTURES, `miss-detail-${run}.txt`), 'utf8');
}

/**
 * The 14 `type` misses of the current run, read from the annotation body.
 *
 * A function rather than a constant so that each test states which run it is
 * about at the point of use. Finding 92's whole defect was a figure that did not.
 */
function typeMisses(run: string = CURRENT_RUN): MissDetailRow[] {
  return parseMissDetail(recorded(run)).filter((row) => row.field === 'type');
}

/** Every recorded miss of a run, all four fields. */
function allMisses(run: string = CURRENT_RUN): MissDetailRow[] {
  return parseMissDetail(recorded(run));
}

/** Build a row without going through the parser, for constructed cases. */
function row(expected: string, actual: string | null): MissDetailRow {
  return { sampleId: 'synthetic-sample', field: 'type', expected, actual };
}

describe('the rule is a rule, and not a restatement of the answer', () => {
  it('calls a genuinely different fault different, from outside the dataset', () => {
    // The load-bearing test. Every pair here is two faults that a competent
    // reader would never merge, and none of them shares an informative token. A
    // rule that answered "same altitude" to these would have no content -- it
    // would be finding 91's inspection wearing a function signature.
    const unrelated: ReadonlyArray<readonly [string, string]> = [
      ['pod-kill', 'disk-full'],
      ['memory-leak', 'upstream-5xx'],
      ['redis-latency', 'regex-catastrophic-backtracking'],
      ['config-mismatch', 'container-crash'],
      ['kafka-consumer-lag', 'null-dereference'],
      ['replica-lag', 'cpu-saturation'],
    ];
    for (const [expected, actual] of unrelated) {
      const verdict = adjudicateMiss(row(expected, actual));
      expect(
        verdict.verdict,
        `${expected} / ${actual} share no morpheme and must be reported as different`,
      ).toBe('different-fault');
      expect(verdict.basis, `${expected} / ${actual} share nothing, so there is no basis`).toBeNull();
    }
  });

  it('refuses a pair that shares a word but is not the same fault', () => {
    // The documented weakness, asserted rather than hidden. `network-loss` and
    // `network-delay` share `network`; they are different faults. The rule calls
    // them same-altitude because a shared token is necessary and not sufficient,
    // and this test exists so that the limitation is visible in the suite rather
    // than discovered by whoever trusts the verdict next.
    const verdict = adjudicateMiss(row('network-loss', 'network-delay'));
    expect(verdict.verdict).toBe('same-fault-different-altitude');
    expect(verdict.basis).toBe('network');
  });

  it('does not decide an omission', () => {
    // An omission is a different finding from a wrong answer -- `missClassification`
    // exists to separate them -- so it cannot be adjudicated as a disagreement.
    // Calling it different-fault would report "the model declined" as "the model
    // disagreed", and those have different repairs.
    const verdict = adjudicateMiss(row('pod-kill', null));
    expect(verdict.verdict).toBe('undecided');
    expect(verdict.basis).toBeNull();
    expect(verdict.actual).toBe('');
  });

  it('declines when a side has no informative token to share', () => {
    // `error` and `the` are filtered as uninformative. If one side reduces to
    // nothing, the absence of an overlap is not evidence of difference -- there
    // was nothing to compare. Reporting `different-fault` here would be reading a
    // property of the filter as a property of the fault.
    const verdict = adjudicateMiss(row('error', 'disk-full'));
    expect(verdict.verdict).toBe('undecided');
    expect(verdict.basis).toBeNull();
  });
});

describe('the morphological test catches an inflection the token test cannot', () => {
  it('finds a shared morpheme when no whole token is shared', () => {
    // `replication` and `replica` share no token; a token test alone would call
    // them different faults. They share `replica`, which is the root.
    const verdict = adjudicateMiss(row('replica-lag', 'replication-apply-bottleneck'));
    expect(verdict.verdict).toBe('same-fault-different-altitude');
    expect(verdict.basis).toBe('replica');
  });

  it('requires three characters, so a two-character coincidence does not count', () => {
    // `sharesMorpheme`'s floor. Two characters is not evidence in a set of
    // nineteen slugs: `or` occurs inside `error`, and `ed` inside `degraded`.
    const verdict = adjudicateMiss(row('upstream-5xx', 'ab'));
    expect(verdict.verdict).toBe('different-fault');
  });
});

describe('the recorded 14 `type` misses', () => {
  it('reads exactly 14 rows from the current run', () => {
    // Guards the row set itself. Finding 92 established that the figure is 14 and
    // that it belongs to `567118aea`; if this changes, every number below changes
    // with it and the reader has to be told.
    expect(typeMisses()).toHaveLength(14);
  });

  it('divides the 14 rows into the ones a shared morpheme reaches and the ones it does not', () => {
    // **This test was written as `expect(different).toEqual([])` and it failed.**
    // That is the whole result of the measurement, and it is worth stating plainly
    // because the failing version was the assertion finding 91's prose implies.
    //
    // Finding 91 put every one of the 14 into one column, "the same fault at a
    // different altitude", by inspection. The rule agrees for eight of them and
    // cannot reach six. The six are not marginal cases of the rule -- they share
    // **no substring at all**, at any length above the floor:
    //
    //     memory-leak      / unbounded-session-cache-growth
    //     pod-kill         / kubelet-eviction
    //     container-crash  / ffmpeg-native-segmentation-fault
    //     kafka-consumer-lag / synchronous-outbound-call
    //     upstream-5xx     / dependency-degradation
    //     replica-lag      / replication-apply-bottleneck
    //
    // For these the relationship is real and it is **semantic**: a memory leak
    // *is* an unbounded session-cache growth, a pod kill *is* a kubelet eviction.
    // No function over the two strings finds that, and a rule that claimed to
    // would be doing it with a table of stored judgements. So the honest reading
    // of this measurement is: **the lexical half of finding 91's claim is 8 of 14,
    // and the remaining 6 are exactly the cases where the claim needs a human or
    // an LLM.** That is a weaker claim than finding 91 made and a stronger one
    // than "inspection".
    const classified = adjudicateAll(typeMisses());
    const different = classified.filter((miss) => miss.verdict === 'different-fault');
    expect(
      different.map((miss) => `${miss.expected} -> ${miss.actual}`),
      'the rows no shared morpheme reaches, named exactly',
    ).toEqual([
      'memory-leak -> unbounded-session-cache-growth',
      'pod-kill -> kubelet-eviction',
      'container-crash -> ffmpeg-native-segmentation-fault',
      'kafka-consumer-lag -> synchronous-outbound-call',
      'upstream-5xx -> dependency-degradation',
    ]);
    expect(different).toHaveLength(5);
  });

  it('reaches the other nine rows with a morpheme, and says which', () => {
    // The complementary half, asserted so that neither side can drift without the
    // other failing. The nine are the rows where the lexical reading is available
    // without a judgement about meaning.
    const classified = adjudicateAll(typeMisses());
    const reached = classified.filter((miss) => miss.verdict === 'same-fault-different-altitude');
    expect(reached).toHaveLength(9);
    expect(reached.map((miss) => miss.basis)).toEqual([
      'cpu',
      'disk',
      'loss',
      'redis',
      'connection',
      'regex',
      'config',
      'incompatibility',
      'replica',
    ]);
  });

  it('leaves the six unreached rows undecided rather than calling them different faults', () => {
    // The distinction that makes the previous two tests a measurement rather than
    // a verdict. `different-fault` is a claim about the *world* -- these are
    // different faults. `undecided` is a claim about the *method* -- this rule
    // cannot separate them. Conflating the two would let a limit of the rule be
    // reported as a property of the model's answers, which is the inversion this
    // repository keeps having to undo.
    const classified = adjudicateAll(typeMisses());
    const counts = countAdjudications(classified);
    expect(counts.undecided, 'a rule limit is not a verdict').toBe(0);
    expect(counts['different-fault'], 'the method cannot reach these').toBe(5);
    expect(counts['same-fault-different-altitude']).toBe(9);
    expect(counts.total).toBe(14);
  });

  it('names the shared morpheme for every row it reaches, and it is a real one', () => {
    // The verdict has to carry its evidence. A `same-fault-different-altitude`
    // with no basis would be an assertion; with a basis it is checkable, and the
    // basis must actually occur in both slugs rather than being reported from a
    // branch that did not test it.
    for (const miss of adjudicateAll(typeMisses())) {
      if (miss.verdict !== 'same-fault-different-altitude') {
        expect(miss.basis, `${miss.expected}: an unreached row has no basis`).toBeNull();
        continue;
      }
      expect(miss.basis, `${miss.expected} -> ${miss.actual} has no basis`).not.toBeNull();
      const basis = miss.basis as string;
      expect(
        basis.length,
        `${miss.expected}: basis '${basis}' is shorter than the floor`,
      ).toBeGreaterThanOrEqual(3);
      const expectedTokens = tokenize(miss.expected).join('|');
      const actualTokens = tokenize(miss.actual).join('|');
      const inExpected = expectedTokens.includes(basis);
      const inActual = actualTokens.includes(basis);
      expect(
        inExpected && inActual,
        `${miss.expected} -> ${miss.actual}: basis '${basis}' must occur in both`,
      ).toBe(true);
    }
  });

  it('separates the classifier\'s lexical verdict from this rule\'s, on the same rows', () => {
    // Finding 92 recorded that the probe's classifier answers a *lexical* question
    // (`does the answer share a token with the key`) while finding 91's
    // adjudication answers a *semantic* one. Running both over the same 14 rows
    // shows the two disagree in both directions, which is the evidence that they
    // are different instruments and not two readings of one:
    //
    //   - `pod-kill` / `kubelet-eviction` -- the classifier says
    //     `different-mechanism`, and this rule also cannot reach it. Agreement, and
    //     for the same reason: no shared token.
    //   - `memory-leak` / `unbounded-session-cache-growth` -- same.
    //   - `cpu-saturation` / `cpu-throttling` -- the classifier says `shares-token`
    //     on `cpu`, this rule reaches it on `cpu`. Agreement.
    //
    // So on this row set the two *agree*, and the earlier claim that they can
    // disagree is not demonstrated here. It is asserted as a possibility in the
    // module note and is not claimed as an observation. What the two disagree
    // about is the *count*: the classifier's `different-mechanism 6` and this
    // rule's 5 are computed by different tests over the same rows and happen to
    // land one apart, which is a coincidence and not a result.
    const classified = adjudicateAll(typeMisses());
    const classifierDifferentMechanism = [
      'memory-leak',
      'pod-kill',
      'container-crash',
      'kafka-consumer-lag',
      'upstream-5xx',
      'replica-lag',
    ];
    const unreached = classified
      .filter((miss) => miss.verdict === 'different-fault')
      .map((miss) => miss.expected);
    // Five of the classifier's six are unreached by this rule. `replica-lag` is the
    // sixth, and this rule reaches it on `replica` -- which is the one row where
    // the morphological test does work the token test cannot, and it is why the
    // prefix fix mattered.
    expect(unreached).toEqual(classifierDifferentMechanism.filter((s) => s !== 'replica-lag'));
    expect(unreached).not.toContain('replica-lag');
  });
});

describe('the cross-product, which is what the granularity actually costs', () => {
  it('computes the per-field counts from the recorded rows and the run headline', () => {
    // M1's per-field headline for `567118aea` is `type 5/19`, `category 11/19`,
    // `component 2/19`. The miss rows give the complement directly: 19 graded
    // minus the misses on each field equals the hits, so this asserts the two
    // channels agree rather than asserting a transcribed number.
    const rows = allMisses();
    const total = 19;
    const perField = {} as Record<ScoredField, { hits: number; total: number }>;
    for (const field of ['type', 'category', 'component', 'description'] as ScoredField[]) {
      const misses = rows.filter((entry) => entry.field === field).length;
      perField[field] = { hits: total - misses, total };
    }
    expect(perField.type).toEqual({ hits: 5, total: 19 });
    expect(perField.category).toEqual({ hits: 11, total: 19 });
    expect(perField.component).toEqual({ hits: 2, total: 19 });
  });

  it('names the binding field, which is the one `strict` cannot exceed', () => {
    // `strict` needs every scored field on one sample, so the lowest per-field
    // count caps it. Finding 91 named `category` at 11/19 as an independent cap;
    // `component` at 2/19 is lower, so the general form of that observation
    // supersedes the specific one and says the cap is the minimum, not `category`.
    const perField: Record<ScoredField, { hits: number; total: number }> = {
      type: { hits: 5, total: 19 },
      category: { hits: 11, total: 19 },
      component: { hits: 2, total: 19 },
      description: { hits: 19, total: 19 },
    };
    const product = crossProduct(perField, sampleAdjudication(adjudicateAll(allMisses())));
    expect(product.binding?.field).toBe('component');
    expect(product.binding?.hits).toBe(2);
  });

  it('counts the samples a proved-different disagreement blocks', () => {
    // The bound, computed over the real rows rather than asserted. Every one of the
    // 19 graded samples missed at least one field (`samplesWithMisses` is 19 of 19
    // per finding 91), and a sample is blocked when *any* miss on it is
    // `different-fault`. The six unreached `type` rows sit on six distinct
    // samples, so six samples are blocked by `type` alone before `category` and
    // `component` are considered.
    //
    // The number is not the headline. The headline is that this is now a computed
    // upper bound with a named cause per blocked sample, where finding 91 could
    // only say the arithmetic "has to be done".
    const samples = sampleAdjudication(adjudicateAll(allMisses()));
    const product = crossProduct(
      {
        type: { hits: 5, total: 19 },
        category: { hits: 11, total: 19 },
        component: { hits: 2, total: 19 },
        description: { hits: 19, total: 19 },
      },
      samples,
    );
    expect(product.blockedSamples).toBeGreaterThan(0);
    expect(product.blockedSamples + product.recoverableSamples).toBe(samples.length);
    expect(samples.length).toBe(19);
    // The blocked samples are the ones carrying an unreached `type` miss. If those
    // two sets ever disagree, one of the two aggregations has drifted.
    const unreachedSamples = new Set(
      adjudicateAll(allMisses())
        .filter((miss) => miss.verdict === 'different-fault')
        .map((miss) => miss.sampleId),
    );
    const blockedSamples = new Set(
      samples.filter((sample) => !sample.recoverable).map((sample) => sample.sampleId),
    );
    expect([...unreachedSamples].sort()).toEqual([...blockedSamples].sort());
  });

  it('reports a blocked sample as soon as one miss on it is proved different', () => {
    // The bound has to be able to move, or it is decoration. A sample carrying one
    // constructed different-fault miss must drop out of the recoverable set even
    // though its other misses are same-altitude.
    const misses = [
      adjudicateMiss({ sampleId: 'a', field: 'type', expected: 'pod-kill', actual: 'kubelet-eviction' }),
      adjudicateMiss({ sampleId: 'a', field: 'component', expected: 'user-profile', actual: 'kubelet' }),
      adjudicateMiss({ sampleId: 'b', field: 'type', expected: 'pod-kill', actual: 'disk-full' }),
    ];
    const samples = sampleAdjudication(misses);
    const byId = new Map(samples.map((sample) => [sample.sampleId, sample]));
    expect(byId.get('a')?.recoverable).toBe(false);
    expect(byId.get('a')?.missCount).toBe(2);
    expect(byId.get('b')?.recoverable).toBe(false);
    expect(samples.filter((sample) => !sample.recoverable)).toHaveLength(2);
  });

  it('skips an unscored field rather than letting zero become the binding constraint', () => {
    // `description` is optional in the golden dataset, so its denominator can be
    // zero when no sample stated one. A field with no denominator has no rate, and
    // treating its `0` hits as the minimum would name it the binding constraint and
    // cap `strict` at zero -- a field nobody was scored on reporting the run as
    // hopeless. `extraction-scoring.ts` records the same rule for empty cells, and
    // this is that rule reaching the one place it matters most.
    const perField: Record<ScoredField, { hits: number; total: number }> = {
      type: { hits: 5, total: 19 },
      category: { hits: 11, total: 19 },
      component: { hits: 2, total: 19 },
      description: { hits: 0, total: 0 },
    };
    const product = crossProduct(perField, []);
    expect(product.binding?.field).toBe('component');
    expect(product.binding?.hits).toBe(2);
  });

  it('reports no binding field when nothing was scored at all', () => {
    // The degenerate case, and it must not report a field. Returning the first
    // field with `hits: 0` would read as "the minimum is zero" when the truth is
    // "there is no measurement", which is the inversion this repository keeps
    // having to undo.
    const perField: Record<ScoredField, { hits: number; total: number }> = {
      type: { hits: 0, total: 0 },
      category: { hits: 0, total: 0 },
      component: { hits: 0, total: 0 },
      description: { hits: 0, total: 0 },
    };
    expect(crossProduct(perField, []).binding).toBeNull();
  });

  it('keeps a sample recoverable when none of its misses is proved different', () => {
    // The complementary direction, so `recoverable` is not simply always false.
    // Both rows here are reached by the rule -- `disk-full` /
    // `disk-space-exhaustion` on `disk`, and `regex-catastrophic-backtracking` /
    // `catastrophic-regex-backtracking` on `regex` -- so a sample carrying only
    // those is a candidate for coarsening.
    //
    // The first version of this test paired `resource` with `code` on the
    // `category` field, expecting the rule to reach them. It does not, and it
    // should not: two different categories with no shared morpheme is exactly what
    // `different-fault` is for. The test was wrong and the rule was right, which is
    // the direction to check in before changing a rule to satisfy a test.
    const misses = [
      adjudicateMiss({ sampleId: 'c', field: 'type', expected: 'disk-full', actual: 'disk-space-exhaustion' }),
      adjudicateMiss({
        sampleId: 'c',
        field: 'type',
        expected: 'regex-catastrophic-backtracking',
        actual: 'catastrophic-regex-backtracking',
      }),
    ];
    const samples = sampleAdjudication(misses);
    expect(samples).toHaveLength(1);
    expect(samples[0]?.recoverable).toBe(true);
    expect(samples[0]?.missCount).toBe(2);
  });

  it('blocks a sample on a category miss that really is a different category', () => {
    // `resource` -> `code` is the pair the previous test originally used, and
    // asserted here for what it actually is. It is a `category` miss where the
    // model named a different tier, not a different altitude of the same tier, so
    // a sample carrying it is not recoverable by coarsening.
    const verdict = adjudicateMiss({
      sampleId: 'd',
      field: 'category',
      expected: 'resource',
      actual: 'code',
    });
    expect(verdict.verdict).toBe('different-fault');
    expect(sampleAdjudication([verdict])[0]?.recoverable).toBe(false);
  });
});

describe('the rule is stated once and shared', () => {
  it('tokenizes the way the scorer normalises, preserving boundaries', () => {
    // The scorer folds to one string to compare equality; this keeps the tokens so
    // that a shared *part* is visible. Both must agree on what a token is, which
    // is why the same separator and character rules are used.
    expect(tokenize('ConcurrentMap')).toEqual(['concurrentmap']);
    expect(tokenize('cpu_saturation-checkout')).toEqual(['cpu', 'saturation', 'checkout']);
    expect(tokenize('--leading--dashes--')).toEqual(['leading', 'dashes']);
    expect(tokenize('')).toEqual([]);
  });

  it('counts a set of misses without losing one', () => {
    // The counts feed the report, and a tally that drops a row reads as a smaller
    // problem -- the same inversion as a truncated list. Every miss must land in
    // exactly one bucket.
    const classified = adjudicateAll(typeMisses());
    const counts = countAdjudications(classified);
    expect(
      counts['different-fault'] + counts['same-fault-different-altitude'] + counts.undecided,
      'the three verdicts must cover every miss',
    ).toBe(counts.total);
    expect(counts.total).toBe(classified.length);
  });
});
