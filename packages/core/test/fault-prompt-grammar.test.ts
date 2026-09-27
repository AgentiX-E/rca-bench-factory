import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFaultExtractionPrompt } from '../src/fault/importer.js';
import { parseFaultExtractionResponse } from '../src/fault/importer.js';
import { normalizeFaultType } from '../src/fault/collector.js';

/**
 * The `type` field's prompt contract.
 *
 * Finding 62: `type` scored 5/19 (26.3%) while `category` scored 11/19 (57.9%) in
 * the same run, on the same texts, with the same model. The only thing that
 * differs between the two fields in the prompt is that `category` is given a
 * closed vocabulary and `type` is given the words "fault type (short)".
 *
 * The asymmetry is measurable, not a matter of taste. Every expected `type` in
 * the golden dataset is a lower-case hyphenated slug, none of the 19 appears
 * verbatim in its incident text, and all 19 are distinct up to 35 characters.
 * So the prompt was asking for a value from a space whose shape it never
 * described.
 *
 * These tests pin the *shape* rule rather than the 19 labels. Stating the labels
 * would fit the prompt to the test set; stating the grammar is what generalises,
 * and it is the fix finding 62 argues for. The distinction matters because it is
 * the difference between a prompt that describes the answer format and one that
 * has memorised the answer key.
 *
 * The dataset-backed tests read the real golden file rather than a fixture, so
 * that editing the dataset cannot silently invalidate the property being
 * asserted. A hand-written fixture here would prove only that the fixture obeys
 * the rule.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GOLDEN = resolve(REPO_ROOT, 'golden-master/fault-extraction/samples.json');

interface GoldenSample {
  id: string;
  incidentText: string;
  expected: { type: string; category: string; component: string };
}

interface GoldenDataset {
  samples: GoldenSample[];
}

function goldenSamples(): GoldenSample[] {
  const parsed = JSON.parse(readFileSync(GOLDEN, 'utf8')) as GoldenDataset;
  expect(parsed.samples.length).toBeGreaterThan(0);
  return parsed.samples;
}

describe('the type field states its shape', () => {
  it('says the value is a lower-case hyphenated slug', () => {
    const prompt = buildFaultExtractionPrompt('irrelevant incident text');
    // The rule, not an example. A prompt that showed `"cpu-saturation"` as a
    // sample value would teach the format too, but this asserts the statement of
    // the rule because that is what holds for the other 18 labels.
    expect(prompt).toMatch(/lower-?case/i);
    expect(prompt).toMatch(/hyphen/i);
  });

  it('distinguishes the stated shape of type from the closed vocabulary of category', () => {
    const prompt = buildFaultExtractionPrompt('irrelevant incident text');
    // category is closed and the prompt says so. type is open but shaped, and
    // the prompt has to say that too -- the failure in finding 62 was that only
    // one of the two fields was described.
    expect(prompt).toContain('resource | network | runtime | middleware | code | config | dependency');
    expect(prompt).toMatch(/hyphen/i);
  });
});

describe('the golden type labels obey the shape the prompt now states', () => {
  it('every expected type is already a lower-case hyphenated slug', () => {
    // This is the property that makes the prompt rule safe to state: it is a
    // description of the existing data, not a new requirement imposed on it. If
    // a future dataset edit introduces `CPU Saturation` or `cpuSaturation`, the
    // prompt would be lying and this test says so.
    for (const sample of goldenSamples()) {
      const type = sample.expected.type;
      expect(type, `${sample.id}: expected type is not lower-case`).toBe(type.toLowerCase());
      expect(type, `${sample.id}: expected type contains a character outside [a-z0-9-]`).toMatch(/^[a-z0-9-]+$/);
      expect(type, `${sample.id}: expected type has a leading or trailing hyphen`).not.toMatch(/^-|-$/);
      expect(type, `${sample.id}: expected type has consecutive hyphens`).not.toMatch(/--/);
    }
  });

  it('normalising an expected type is a no-op, so the shape rule and the comparator agree', () => {
    // `normalizeFaultType` is what `sameValue` applies to both sides. If the
    // golden labels already survive it unchanged, then a model that follows the
    // stated rule exactly is scored on its label choice and not on formatting.
    for (const sample of goldenSamples()) {
      expect(normalizeFaultType(sample.expected.type), sample.id).toBe(sample.expected.type);
    }
  });

  it('no expected type appears verbatim in its incident text, which is why the rule is needed', () => {
    // The measurement behind finding 62, asserted rather than quoted in a
    // comment. If a future dataset edit made the labels copyable from the text,
    // this test fails and the prompt rule deserves revisiting: a copyable label
    // needs no grammar.
    const copyable = goldenSamples().filter((s) => s.incidentText.includes(s.expected.type));
    expect(copyable.map((s) => s.id)).toEqual([]);
  });

  it('the expected types are distinct, so the field is not a small closed set in disguise', () => {
    const types = goldenSamples().map((s) => s.expected.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('a model following the stated shape scores on label choice alone', () => {
  it('round-trips a shaped answer through parse and normalisation unchanged', () => {
    // The end-to-end property the prompt rule is for: an answer that obeys the
    // grammar must reach the scorer with its label intact, so a miss means the
    // model chose the wrong label rather than the wrong punctuation.
    const shaped = 'database-connection-pool-exhaustion';
    const response = JSON.stringify({ type: shaped, category: 'middleware', confidence: 0.9 });
    const parsed = parseFaultExtractionResponse(response);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.extracted.type).toBe(shaped);
    expect(normalizeFaultType(parsed.extracted.type)).toBe(shaped);
  });

  it('still accepts a shaped answer that deviates only in case and spacing', () => {
    // The parser deliberately does not normalise `type` on the way in (only
    // `category` gets that treatment); `sameValue` handles it at scoring time.
    // This pins that division of labour so a future "helpful" normalisation in
    // the parser cannot silently change what the scorer sees.
    const parsed = parseFaultExtractionResponse(
      JSON.stringify({ type: 'Database Connection Pool Exhaustion', confidence: 0.9 }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.extracted.type).toBe('Database Connection Pool Exhaustion');
    expect(normalizeFaultType(parsed.extracted.type)).toBe('database-connection-pool-exhaustion');
  });
});


describe('the component field had no stated rule, and the ground truth proved it', () => {
  /**
   * The past tense is deliberate: this block is the record of how the rule was
   * found, and it is kept beside the tests that now pin the stated rule.
   *
   * Finding 73 showed that the fifteen wrong `component` answers are different
   * entities rather than malformed identifiers, so no shape rule rescues them.
   * Finding 74 showed the instrument is stable, so the reading is real. Finding
   * 75 then measured the rule the ground truth *itself* obeys and found it
   * rejects exactly one sample; finding 78 priced that sample at one of four
   * samples of headroom. This round re-annotated the sample by the rule, which
   * is what finding 75 asked for and finding 78 scheduled as cleanup.
   *
   * The method, kept because it generalises: a field's rule can be read off its
   * own ground truth, because a ground truth that violates its own rule is a
   * data defect rather than a model failure. Three candidate rules were measured
   * over all 19 expected values before any of them was adopted.
   */

  /** Every hyphen-delimited token of `name` occurs in `text`, case-insensitively. */
  function tokensAllPresent(name: string, text: string): boolean {
    const low = text.toLowerCase();
    return name.split('-').every((t) => t.length > 0 && low.includes(t));
  }

  /**
   * The rule's behaviour on constructed inputs.
   *
   * The first version of this block asserted only over the golden dataset, and
   * the injection battery showed why that is not enough: three separate
   * mutations -- loosening the accepted count, deleting the level-check, and
   * deleting the vacuity guard -- all SURVIVED, because on the current 19
   * samples those assertions happen to be satisfied by the data and never
   * exercised by it. An assertion the data satisfies incidentally is not tested;
   * it is corroborated.
   *
   * These cases pin the rule itself, so each property has an input that makes it
   * fail. They are the discriminating half; the dataset assertions above remain
   * as the record of what the real ground truth looks like.
   */
  describe('the token rule, on constructed inputs', () => {
    it('accepts a name whose tokens are all present, even re-joined or re-ordered', () => {
      // The property that makes the rule useful: it tolerates naming style
      // (`session-cache` vs "session cache") without tolerating a different
      // entity. Both cases below are the same component said two ways.
      expect(tokensAllPresent('session-cache', 'GETs against the session Redis cache went up')).toBe(true);
      expect(tokensAllPresent('order-events-consumer', 'the order events consumer group lag grew')).toBe(true);
    });

    it('rejects a name with a token absent from the text', () => {
      // The discriminating half. `inventory` occurs; `frontend` does not, so a
      // half-right name is rejected rather than accepted on partial evidence.
      expect(tokensAllPresent('inventory-frontend', 'the inventory service returned 500')).toBe(false);
      expect(tokensAllPresent('checkout-ui', 'the one-click checkout button disappeared')).toBe(false);
    });

    it('does not fold the name, so an upper-case token misses a lower-case text', () => {
      // The asymmetry, measured rather than assumed. The implementation
      // lower-cases the *text* and then searches for each token verbatim, so it
      // is the name that must already be lower-case -- the opposite of what
      // "case-insensitive" would suggest, and the opposite of what an earlier
      // draft of this test asserted.
      //
      // The consequence is real: a lower-case component matched against a text
      // containing `CSV WRITER` succeeds, because the text was folded for it,
      // while an upper-case component against a lower-case text fails. Since
      // every expected component in the dataset is lower-case (asserted in the
      // `type` block's style below), the rule works in practice for the case
      // that occurs and would not work for the one that does not.
      expect(tokensAllPresent('csv-writer', 'an unhandled TypeError in the csv writer')).toBe(true);
      expect(tokensAllPresent('csv-writer', 'an unhandled TypeError in the CSV WRITER')).toBe(true);
      expect(tokensAllPresent('CSV-WRITER', 'an unhandled TypeError in the csv writer')).toBe(false);
    });

    it('every expected component is lower-case, which keeps that asymmetry harmless', () => {
      // The property that keeps the asymmetry above from mattering: the ground
      // truth never relies on the case folding it lacks. If a future dataset edit
      // introduced `Checkout-API`, the rule would still work on the text side but
      // the dataset would have acquired a second naming style, and this test is
      // where that shows up.
      for (const sample of goldenSamples()) {
        const c = sample.expected.component;
        expect(c, `${sample.id}: expected component is not lower-case`).toBe(c.toLowerCase());
      }
    });

    it('ignores empty tokens, so consecutive hyphens cannot make a name vacuously pass', () => {
      // `every` over an empty array is `true`, so a name that is only hyphens
      // would otherwise satisfy the rule. The `length > 0` guard is what stops
      // "no evidence at all" from reading as "consistent with the text".
      expect(tokensAllPresent('---', 'any text at all')).toBe(false);
      expect(tokensAllPresent('-', '')).toBe(false);
    });

    it('rejects any name against empty text, so absence of evidence is never acceptance', () => {
      expect(tokensAllPresent('session-cache', '')).toBe(false);
      expect(tokensAllPresent('a', '')).toBe(false);
    });
  });

  /**
   * The fifteen wrong `component` answers from the run preceding `3a04d26`,
   * keyed by sample id.
   *
   * This is a recorded observation, not a fixture: it is the evidence finding 73
   * and finding 75 both rest on, kept beside the tests that measure it so a
   * future dataset edit that changes what these answers *are* cannot leave the
   * claims silently attached to stale data.
   */
  const WRONG_ANSWERS: Record<string, string> = {
    'resource-cpu-saturation-checkout': 'cpu-throttling',
    'resource-memory-leak-recommendation': 'unbounded-session-cache-growth',
    'resource-disk-full-log-collector': 'retention job flag definition',
    'network-delay-cart-to-inventory': 'client network path',
    'network-loss-payment-gateway': 'client node egress interface',
    'network-partition-search-cluster': 'rack switch carrying the third node',
    'runtime-pod-kill-user-profile': 'scheduled job flag definition',
    'runtime-container-crash-loop-media': 'native ffmpeg binding',
    'middleware-redis-latency-cache': 'session Redis',
    'middleware-kafka-consumer-lag': 'order-events',
    'middleware-database-connection-pool': 'billing service connection pool',
    'code-null-dereference-reporting': 'summarize()',
    'code-unhandled-exception-export': 'CSV writer',
    'code-slow-regex-api-gateway': 'WAF rule',
    'config-datasource-url-orders': 'order-service ConfigMap',
    'config-feature-flag-checkout': 'scheduled job flag definition',
    'dependency-upstream-5xx-pricing': 'tax-calculation provider',
    'dependency-version-incompatibility-shipping': 'client library',
    'middleware-mysql-replica-lag-analytics': 'replica applier thread',
  };

  /**
   * The four samples the same run answered correctly.
   *
   * Kept separate from `WRONG_ANSWERS` because the two sets are used for a
   * contrast rather than for a total: one is the evidence that the rule fails to
   * discriminate, the other is the evidence of what it is supposed to accept. A
   * single merged map would make the contrast unstatable.
   */
  const RIGHT_ANSWERS: Record<string, string> = {
    'resource-cpu-saturation-checkout': 'checkout-api',
    'runtime-pod-kill-user-profile': 'user-profile',
    'runtime-container-crash-loop-media': 'media-transcoder',
    'config-datasource-url-orders': 'order-service',
  };

  it('the rule the prompt states accepts every expected component in the dataset', () => {
    // This is the tripwire the previous version of this test set for itself:
    // it asserted `toEqual(['config-feature-flag-checkout'])` and said "if this
    // ever reaches 19/19, the rule becomes statable and the `component` field
    // stops being ungradeable -- that is the milestone". The re-annotation of
    // that one sample is what reaches it, so the assertion is now the stronger
    // one: the rule has no exception in the data at all.
    //
    // Stated over the real file rather than a fixture, so a future dataset edit
    // that reintroduces an unrecoverable component fails here rather than
    // silently restoring the gap the round closed.
    const rejected = goldenSamples()
      .filter((s) => !tokensAllPresent(s.expected.component, s.incidentText))
      .map((s) => s.id);
    expect(rejected, 'a stated rule must not have an exception in its own ground truth').toEqual([]);
  });

  it('no expected component is absent from its own incident text', () => {
    // The property that makes the rule statable, asserted directly on the
    // dataset rather than through the token helper, so it survives a rewrite of
    // that helper. This is the invariant the round's re-annotation established:
    // every annotation is readable from its own text, so a wrong answer is a
    // model failure rather than a question the data cannot answer.
    const absent = goldenSamples()
      .filter((s) => !s.incidentText.toLowerCase().includes(s.expected.component))
      .filter((s) => {
        // The component need not appear verbatim -- `session-cache` is written
        // "the session Redis cache" -- so the check is that every token is
        // present, which is the rule the prompt now states.
        const low = s.incidentText.toLowerCase();
        return !s.expected.component.split('-').every((t) => t.length > 0 && low.includes(t));
      })
      .map((s) => s.id);
    expect(absent, 'every annotated component must be recoverable from its own text').toEqual([]);
  });

  it('the re-annotated sample is readable from its own text, which is why the rule now closes', () => {
    // Finding 75 read this sample as "the sole one where the ground truth is not
    // recoverable from the input at all", and finding 78 measured that it cost
    // exactly one sample of headroom. Both readings rested on `checkout-ui`.
    //
    // The re-annotation is not a loosening of the rule to fit the data; it is
    // the observation that the text names a deployed workload and the annotation
    // named something else. `storefront` is the workload whose user-visible
    // surface broke, and it appears in the text; `checkout-ui` appears nowhere.
    // So the sample was always answerable -- it was annotated with a name the
    // text does not carry.
    const sample = goldenSamples().find((s) => s.id === 'config-feature-flag-checkout');
    expect(sample, 'config-feature-flag-checkout must exist for this claim to hold').toBeDefined();
    if (!sample) return;
    expect(sample.expected.component).toBe('storefront');
    expect(sample.incidentText).toContain('storefront');
    // The old annotation, and the reason it was wrong: a name the text never
    // carries is not a reading, so grading against it measured the annotator.
    expect(sample.incidentText).not.toContain('checkout-ui');
    expect(sample.incidentText).not.toContain('checkout ui');
    // The symptom is still where finding 75 said it was; only the annotation
    // changed. Pinned so a future edit cannot move the sample's subject and
    // leave this reasoning attached to a different incident.
    expect(sample.incidentText).toContain('one-click checkout button');
  });

  it('a rule fitted to the wrong answers cannot distinguish right from wrong', () => {
    // The trap this test exists to prevent: writing the rule by watching the
    // model. `WRONG_ANSWERS` are the fifteen wrong answers from the run
    // preceding `3a04d26`, plus the four the same run got right, so the
    // discrimination claim is measured against both halves of the run rather
    // than against the wrong half alone.
    //
    // Two earlier versions of this test failed the injection battery, and the
    // reason is worth keeping. The first asserted a literal against an identical
    // literal; the second asserted a count with a `>=` bound, which no mutation
    // inside the range could move. Both were satisfied by the data rather than
    // tested by it. What makes this version testable is that it asserts a
    // *contrast* -- the accepted rate over wrong answers versus the accepted rate
    // over right answers -- because a contrast can fail in either direction and a
    // mutation to either side changes it.
    const samples = goldenSamples();
    // Both halves of the recorded run, keyed the same way, so the contrast
    // compares the rule's behaviour on wrong answers against its behaviour on
    // right ones instead of comparing a number against an absent zero.
    const ANSWERED: Record<string, string> = { ...WRONG_ANSWERS, ...RIGHT_ANSWERS };
    const answered = samples.filter((s) => ANSWERED[s.id] !== undefined);
    const accepted = (s: GoldenSample): boolean =>
      tokensAllPresent((ANSWERED[s.id] as string).replace(/\s+/g, '-'), s.incidentText);
    const wrongSide = answered.filter((s) => RIGHT_ANSWERS[s.id] === undefined);
    const rightSide = answered.filter((s) => RIGHT_ANSWERS[s.id] !== undefined);
    const wrongAccepted = wrongSide.filter(accepted);
    const rightAccepted = rightSide.filter(accepted);

    // Both halves must be populated, or the contrast below is between a number
    // and zero-by-absence rather than between two measurements. This guard is
    // what makes deleting it detectable: without it a mutation that emptied one
    // side would silently turn the contrast into a tautology.
    expect(wrongSide.length, 'the wrong half of the run must be populated').toBeGreaterThan(0);
    expect(rightSide.length, 'the right half of the run must be populated').toBeGreaterThan(0);

    // The measurement: the rule accepts a large share of the wrong answers.
    // Stated as a share of the wrong half rather than an absolute count, so it
    // moves when either the dataset or the recorded run changes.
    const wrongRate = wrongAccepted.length / wrongSide.length;
    expect(wrongRate, 'the rule must accept most wrong answers, which is why it cannot grade them').toBeGreaterThan(0.5);

    // And the contrast that makes it a measurement rather than a coincidence.
    // The direction is *upward*, and that is the finding: the rule accepts
    // 100% of the right answers and 60% of the wrong ones, so it does have some
    // discriminating power -- it is not useless. What makes it unusable as a
    // grader is that a 60% acceptance rate over wrong answers means a prompt
    // edit could raise the measured rate by making the answers *more readable*
    // without making them more correct, which is the unfalsifiability finding 75
    // argues against. An earlier draft of this test asserted the opposite
    // direction (rightRate <= wrongRate) and was simply wrong about the data.
    //
    // The wrong-answer rate was 0.67 before this round's re-annotation and is
    // 0.60 after it, because the re-annotated sample's recorded answer now counts
    // as accepted where its old annotation did not. The claim is unchanged -- the
    // rule accepts most wrong answers -- and the movement is recorded rather than
    // smoothed over, since a rate quoted from a stale run would be a false reading.
    const rightRate = rightAccepted.length / rightSide.length;
    expect(rightRate, 'the rule accepts every right answer').toBe(1);
    expect(wrongRate, 'the rule accepts most wrong answers too, which is the defect').toBeGreaterThan(0.5);
    expect(wrongRate, 'the rule must not be a perfect discriminator').toBeLessThan(rightRate);

    // Cross-check that makes the acceptance rate causal rather than incidental.
    // The readable set -- samples whose component appears verbatim -- is the four
    // right answers plus two samples the model read correctly and then
    // over-qualified or mis-levelled. Those two sit on the *wrong* side, and they
    // are the reason `wrongRate` is not zero. Stating it as a *bijection* rather
    // than as two independent counts is deliberate -- an earlier version asserted
    // the gap in two separate places, and the injection battery showed both could
    // be deleted with the suite still green, because they were two statements of
    // one fact. A single assertion tying the gap to the rate cannot be removed
    // without the rate becoming unexplained.
    //
    // The re-annotation of `config-feature-flag-checkout` moved this set from 5 to
    // 6 and the wrong-side membership from 1 to 2: `storefront` appears verbatim
    // in its text where `checkout-ui` did not, so a sample that used to be
    // unreadable is now readable *and* was on the wrong side of the recorded run.
    // The figures below are the re-measured ones; the wrong-answer rate fell from
    // 0.67 to 0.60 as a result and remains above the threshold that makes the
    // rule unusable as a grader, which is the claim this test exists to make.
    const readable = samples.filter((s) => s.incidentText.includes(s.expected.component));
    const readableOnWrongSide = readable.filter((s) => RIGHT_ANSWERS[s.id] === undefined);
    expect(
      readableOnWrongSide.map((s) => s.id),
      'the readable-but-wrong samples are the entire cause of a non-zero wrong-answer rate',
    ).toEqual(['config-feature-flag-checkout', 'dependency-upstream-5xx-pricing']);
    expect(readableOnWrongSide.filter(accepted).map((s) => s.id)).toEqual([
      'config-feature-flag-checkout',
      'dependency-upstream-5xx-pricing',
    ]);
    // The relation between "accepted by the token rule" and "the expected
    // component is readable verbatim", measured rather than assumed. They are
    // *not* the same set, and the difference is the finding: of the nine
    // accepted wrong answers, seven are accepted because their own words appear
    // in the text even though the ground-truth component does not. So the rule
    // is even looser than "matches the text" -- it matches *token co-occurrence*,
    // which is why `order-events` is accepted for a sample whose component is
    // `order-events-consumer` and `client library` is accepted for one whose
    // component is `shipping-service`.
    //
    // An earlier draft asserted a bijection here (`accepted-and-wrong` equals
    // `readable-and-wrong`) and was wrong about the data; the set difference is
    // the sharper measurement, so it is what is pinned.
    const readableAndWrong = wrongAccepted.filter((s) => readable.some((r) => r.id === s.id));
    const acceptedByTokensOnly = wrongAccepted.filter((s) => !readable.some((r) => r.id === s.id));
    expect(
      readableAndWrong.map((s) => s.id),
      'exactly the over-qualified answers are both accepted and verbatim-readable',
    ).toEqual(['config-feature-flag-checkout', 'dependency-upstream-5xx-pricing']);
    expect(
      acceptedByTokensOnly.length,
      'seven wrong answers are accepted on token co-occurrence alone, with no readable component',
    ).toBe(7);
    // And token co-occurrence is strictly looser: every answer the text supports
    // verbatim is accepted, so the eight are a genuine widening and not a
    // different mechanism that happens to land in the same count.
    for (const s of readableAndWrong) {
      expect(accepted(s), `${s.id}: a verbatim-readable answer must be accepted`).toBe(true);
    }
  });

  it('the four answers the same run got right are the four it named verbatim', () => {
    // The other half of the contrast above, kept as its own assertion because it
    // is the evidence for what the field is *supposed* to accept. All four
    // correct answers on record are the samples whose workload is named verbatim
    // in the text; every other sample was answered with something one level off.
    // If a future run gets a sample right whose workload is *not* named in the
    // text, the rule finding 75 proposes is wrong and this fails.
    for (const [id, answer] of Object.entries(RIGHT_ANSWERS)) {
      const sample = goldenSamples().find((s) => s.id === id);
      expect(sample, `${id} must exist`).toBeDefined();
      if (!sample) continue;
      expect(answer, `${id}: the recorded right answer must equal the ground truth`).toBe(sample.expected.component);
      expect(sample.incidentText, `${id}: the right answer must be readable from the text`).toContain(answer);
    }
    // And the set itself, named: six samples now have a component that is
    // readable verbatim from the text, and four were answered correctly. This
    // states the *membership* of the readable set; the contrast test above states
    // the *consequence* (that the two-sample gap is what leaves the wrong-answer
    // acceptance rate above zero). The two are different claims about the same
    // data, which is why both are here -- an earlier pair that stated the same
    // claim twice could both be deleted with the suite green, and the injection
    // battery caught that.
    const readable = goldenSamples().filter((s) => s.incidentText.includes(s.expected.component));
    expect(
      readable.map((s) => s.id).sort(),
      'the readable set is the four right answers plus the two the model mis-levelled',
    ).toEqual(['config-datasource-url-orders', 'config-feature-flag-checkout', 'dependency-upstream-5xx-pricing', 'resource-cpu-saturation-checkout', 'runtime-container-crash-loop-media', 'runtime-pod-kill-user-profile']);
    // And every member of the set that was not answered correctly is on the wrong
    // side of the recorded run, so the set is not accidentally admitting a sample
    // the run got right by a different route.
    for (const s of readable) {
      if (RIGHT_ANSWERS[s.id] === undefined) continue;
      expect(RIGHT_ANSWERS[s.id], `${s.id}: a readable sample answered correctly must be answered with the readable name`).toBe(
        s.expected.component,
      );
    }
  });

  it('the well-formed expected components are all deployed workload names', () => {
    // The evidence for the rule the prompt now states: on the three samples whose
    // answer is recoverable, the expected value is the deployed workload that
    // owns the fault. Finding 75 proposed this rule from these three samples and
    // finding 78 measured its cost; this test pins the evidence so the statement
    // in the prompt is traceable to data rather than to taste.
    const wellFormed = ['checkout-api', 'user-profile', 'media-transcoder'];
    for (const name of wellFormed) {
      const sample = goldenSamples().find((s) => s.expected.component === name);
      expect(sample, `${name} must appear verbatim so it is a reading, not an inference`).toBeDefined();
      if (!sample) return;
      expect(sample.incidentText).toContain(name);
    }
  });
});

describe('the component field states its rule', () => {
  /**
   * Finding 75: without a stated rule the field is ungradeable in principle --
   * every answer is wrong for an unstated reason, which is indistinguishable
   * from the grader being wrong. The prompt described `component` as
   * "faulty component" and nothing else, so a model answering `session Redis`
   * (the datastore) where the answer key says `session-cache` (the service) was
   * answering a nearby question correctly.
   *
   * These tests pin the rule the way the `type` block pins its shape: by the
   * prompt *stating* a level and a shape, and by the statement being checkable
   * against the dataset rather than being an example of an answer.
   */
  it('names the level the answer should be at, so a nearby-but-different entity is wrong', () => {
    const prompt = buildFaultExtractionPrompt('irrelevant incident text');
    // The level is the load-bearing half of the rule: the fifteen wrong answers
    // from the recorded run are all real entities in the text, one level off.
    // A rule that only described the *shape* would not have changed any of them.
    expect(prompt, 'component must say which level of entity it wants').toMatch(/deployed|workload|service|component/i);
    expect(prompt, 'the level must be stated as a contrast, not a bare noun').toMatch(/not the|rather than|instead of/i);
  });

  it('does not list the dataset answers, which would fit the prompt to the test set', () => {
    const prompt = buildFaultExtractionPrompt('irrelevant incident text');
    // The other half of finding 62's argument, applied to `component`: stating
    // the convention is what transfers, memorising the answer key is not. If a
    // future edit lists the expected components, this fails and the resulting
    // accuracy number stops being interpretable.
    for (const sample of goldenSamples()) {
      expect(
        prompt,
        `${sample.id}: the prompt must not carry the answer key`,
      ).not.toContain(`"${sample.expected.component}"`);
    }
    // And the rule's own examples must not be dataset answers either, or an
    // example would double as a label. The three well-formed names below are the
    // ones finding 75 cites as evidence, and they must stay out of the prompt.
    for (const name of ['checkout-api', 'user-profile', 'media-transcoder']) {
      expect(prompt, `${name} is dataset evidence and must not be an example in the prompt`).not.toContain(name);
    }
  });

  it('states the shape too, so the answer is an identifier rather than prose', () => {
    const prompt = buildFaultExtractionPrompt('irrelevant incident text');
    // Without a shape the field attracts prose ("the scheduled job that flipped
    // the flag"), which is ungradeable for a different reason. The shape rule is
    // the same one `type` uses, and the dataset is already consistent with it --
    // every expected component is a lower-case hyphenated slug.
    expect(prompt).toMatch(/lower-?case/i);
    expect(prompt).toMatch(/hyphen/i);
  });

  it('every expected component is a lower-case hyphenated slug, so the stated shape is not aspirational', () => {
    // The rule is a description of the existing data, not a new requirement --
    // the same contract `FAULT_TYPE_SHAPE_RULE` makes. Asserted over the real
    // file so a dataset edit that breaks the shape fails a test rather than
    // silently invalidating the prompt text.
    for (const sample of goldenSamples()) {
      const c = sample.expected.component;
      expect(c, `${sample.id}: not a slug`).toBe(c.toLowerCase());
      expect(c, `${sample.id}: not hyphenated`).not.toMatch(/\s/);
      expect(c.length, `${sample.id}: empty`).toBeGreaterThan(0);
    }
  });
});
