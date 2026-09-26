import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildExtractionReport,
  formatExtractionReport,
  parseGoldenDataset,
  scoreExtractionSample,
  type GoldenSample,
  type ExtractionSamplePrediction,
} from '../src/fault/extraction-scoring.js';

/**
 * Per-sample miss diagnosis.
 *
 * The headline and per-field rates say *that* a field missed; they cannot say
 * *why*, and the distinction decides whether the fix is code, prompt or data. A
 * field can miss for reasons that are not model errors at all:
 *
 *   - the model omitted a field the sample expected (a real miss), or
 *   - the model answered a value that is not in a closed vocabulary, which the
 *     parser rejects -- making the *whole sample* unparseable and charging the
 *     other three fields for one bad one, or
 *   - the model was never told what shape the value should take.
 *
 * The first is the model's; the second is a scoring-pipeline question; the third
 * is the prompt's. Reading a rate cannot separate them, which is why three rounds
 * of prompt and comparator reasoning produced hypotheses that a single run
 * refuted. This module separates them from the data already recorded.
 *
 * One discrimination is available *without* the answers, and it is the strongest
 * available fact, so it is asserted rather than assumed. `parseFaultExtractionResponse`
 * returns `ok: false` for an out-of-vocabulary category. A sample in state
 * `graded` therefore cannot have answered an out-of-vocabulary category, whatever
 * its prediction contains. Proving that from the real data forecloses a whole
 * class of explanation for free.
 *
 * The tests read the real golden dataset rather than a fixture for the reason
 * established in `fault-prompt-grammar.test.ts`: a fixture proves only that the
 * fixture has the property, and the property here is about the data.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GOLDEN = resolve(REPO_ROOT, 'golden-master/fault-extraction/samples.json');

function golden(): GoldenSample[] {
  const ds = parseGoldenDataset(JSON.parse(readFileSync(GOLDEN, 'utf8')));
  expect(ds.samples.length).toBeGreaterThan(0);
  return ds.samples;
}

/** A prediction that answers every field correctly, then apply overrides. */
function perfectPrediction(
  sample: GoldenSample,
  override: Partial<Record<'type' | 'category' | 'component' | 'description', string | undefined>> = {},
): ExtractionSamplePrediction {
  const e = sample.expected as unknown as Record<string, string | undefined>;
  const pick = (k: 'type' | 'category' | 'component' | 'description'): string | undefined =>
    k in override ? override[k] : e[k];
  const extracted: Record<string, string> = {};
  for (const k of ['type', 'category', 'component', 'description'] as const) {
    const v = pick(k);
    if (v !== undefined) extracted[k] = v;
  }
  return { sampleId: sample.id, parseOk: true, extracted, validationValid: true } as ExtractionSamplePrediction;
}

describe('an out-of-vocabulary category is rejected before scoring, so it cannot be a miss reason', () => {
  it('a graded sample never answered a category outside the vocabulary', () => {
    // This is a *logical* fact, not a measurement: an unparseable response makes
    // the sample `unparseable`, and `graded` excludes that state. It holds for
    // every dataset and every model, which is what makes it worth asserting --
    // it eliminates "the parser rejected a reasonable synonym" as an explanation
    // for any category miss in any graded run.
    //
    // The assertion is `counts.graded === total` with no misses beyond the ones
    // the predictions injected: every sample reaching `graded` while answering a
    // value the parser rejects is impossible by construction, so if this ever
    // fails the parser's rejection rule changed, not the model's behaviour.
    const samples = golden();
    const report = buildExtractionReport(samples, samples.map((s) => perfectPrediction(s)));
    expect(report.counts.graded).toBe(samples.length);
    expect(report.counts.unparseable).toBe(0);
    expect(report.misses).toEqual([]);
  });

  it('the diagnosis is present per sample and names the failing fields', () => {
    const samples = golden();
    const predictions = samples.map((s, i) =>
      // The first sample gets a wrong type; the rest are perfect.
      i === 0 ? perfectPrediction(s, { type: 'some-other-fault' }) : perfectPrediction(s),
    );
    const report = buildExtractionReport(samples, predictions);
    const misses = report.misses;
    expect(Array.isArray(misses)).toBe(true);
    expect(misses.length).toBe(1);
    expect(misses[0]?.sampleId).toBe(samples[0]?.id);
    expect(misses[0]?.fields).toContain('type');
    expect(misses[0]?.fields).not.toContain('category');
  });

  it('records what the model said against what was expected, so a human can judge it', () => {
    const samples = golden();
    const target = samples[0]!;
    const predictions = samples.map((s) =>
      s.id === target.id ? perfectPrediction(s, { component: 'the-analytics-cluster' }) : perfectPrediction(s),
    );
    const report = buildExtractionReport(samples, predictions);
    const miss = report.misses.find((m) => m.sampleId === target.id);
    expect(miss).toBeDefined();
    const componentMiss = miss?.detail.find((d) => d.field === 'component');
    expect(componentMiss).toBeDefined();
    expect(componentMiss?.expected).toBe(target.expected.component);
    expect(componentMiss?.actual).toBe('the-analytics-cluster');
  });

  it('classifies an omitted field differently from a wrong value', () => {
    // The two have different fixes: an omission is the model declining to answer
    // (prompt), a wrong value is the model answering incorrectly (capability or
    // vocabulary). Collapsing them loses exactly the distinction this exists for.
    //
    // `component` is used and not `description`, because no sample states a
    // description expectation -- a test over `description` would assert about a
    // field that is never scored and would pass no matter how the classifier
    // behaved. The first version of this test made that mistake, and a deliberate
    // collapse of the two reasons did not turn it red. `component` is stated by
    // all 19 samples, so both branches are reachable.
    const samples = golden();
    const [a, b] = [samples[0]!, samples[1]!];
    const predictions = samples.map((s) => {
      if (s.id === a.id) return perfectPrediction(s, { component: undefined });
      if (s.id === b.id) return perfectPrediction(s, { component: 'a-wrong-component' });
      return perfectPrediction(s);
    });
    const report = buildExtractionReport(samples, predictions);

    const missA = report.misses.find((m) => m.sampleId === a.id)?.detail.find((d) => d.field === 'component');
    const missB = report.misses.find((m) => m.sampleId === b.id)?.detail.find((d) => d.field === 'component');

    expect(missA?.reason).toBe('omitted');
    expect(missA?.actual).toBeNull();
    expect(missB?.reason).toBe('wrongValue');
    expect(missB?.actual).toBe('a-wrong-component');

    // And the tallies must separate them, which is what the workflow publishes.
    expect(report.missClassification.omitted).toBe(1);
    expect(report.missClassification.wrongValue).toBe(1);
  });

  it('ignores ungraded samples entirely, whose null fields are not misses', () => {
    // Reachability matters here. With all-perfect predictions every sample is
    // `graded`, and a deliberate change of `graded` to `verdicts` in the
    // diagnosis loop stayed green -- because the three ungraded states carry
    // all-null fields and the `!== false` test already skips them, making the
    // two loops equal. The same phenomenon is documented for the rate loop.
    //
    // That equivalence is a property worth *checking*, not assuming, since it is
    // what licenses the shorter form. An unparseable prediction is the input that
    // reaches it: the sample is ungraded, all four fields are `null`, and none
    // may be reported as a miss -- a null field is the absence of a comparison.
    const samples = golden();
    const predictions: ExtractionSamplePrediction[] = samples.map((s, i) =>
      i === 0
        ? ({ sampleId: s.id, parseOk: false } as ExtractionSamplePrediction)
        : perfectPrediction(s),
    );
    const report = buildExtractionReport(samples, predictions);

    expect(report.counts.unparseable).toBe(1);
    expect(report.counts.graded).toBe(samples.length - 1);
    // The ungraded sample must not appear, and must not inflate the tallies.
    expect(report.misses.find((m) => m.sampleId === samples[0]?.id)).toBeUndefined();
    expect(report.missClassification).toEqual({ wrongValue: 0, omitted: 0, samplesWithMisses: 0 });
  });

  it('leaves every ungraded verdict with all-null fields, which is what makes graded == verdicts', () => {
    // This is the *proof obligation* behind the comment above, asserted rather
    // than argued. `for (const verdict of graded)` and `for (const verdict of
    // verdicts)` are equivalent in the diagnosis loop only if no ungraded verdict
    // carries a `false`. If `scoreExtractionSample` ever graded a state as
    // non-graded while leaving a `false` behind, the two loops would diverge and
    // the shorter one would silently drop misses -- which no rate would show,
    // because the rates are computed from `graded` in either case.
    //
    // Checked for every state the scorer can produce, so a new state with a
    // populated `fields` record fails here instead of in production.
    const sample = golden()[0] as GoldenSample;
    const answered = { type: 'cpu-saturation', category: 'resource', component: 'checkout' };

    // `extracted` must be present on the `unparseable` case too. The branch is
    // `!parseOk || extracted === undefined`, so a prediction with `parseOk: false`
    // and *no* `extracted` reaches it -- but so does one that has `extracted` and
    // `parseOk: false`, and only the second shape distinguishes the two guards.
    // The first draft of this fixture omitted `extracted`, which made the
    // `unvalidated` state below unreachable as written: it hit `unparseable`
    // first, and a mutation that gave `unvalidated` a scored field survived.
    const states: Array<[string, ExtractionSamplePrediction]> = [
      [
        'unparseable',
        { sampleId: sample.id, parseOk: false, extracted: { ...answered } } as ExtractionSamplePrediction,
      ],
      [
        'unvalidated',
        {
          sampleId: sample.id,
          parseOk: true,
          validationValid: false,
          extracted: { ...answered },
        } as ExtractionSamplePrediction,
      ],
      [
        'unverifiable',
        {
          sampleId: sample.id,
          parseOk: true,
          validationValid: true,
          verifiable: false,
          extracted: { ...answered },
        } as ExtractionSamplePrediction,
      ],
    ];

    let sawUngraded = 0;
    const reached: string[] = [];
    for (const [label, prediction] of states) {
      const verdict = scoreExtractionSample(sample, prediction);
      // The fixture must reach the state it is named for. Without this the
      // `unvalidated` case can silently land in `unparseable` -- which it did --
      // and the test then proves nothing about the state it claims to cover.
      expect(verdict.state, `fixture '${label}' does not reach that state`).toBe(label);
      reached.push(verdict.state);
      if (verdict.state === 'graded') {
        // A state that reached `graded` is not evidence about the ungraded case.
        continue;
      }
      sawUngraded += 1;
      const falses = Object.entries(verdict.fields).filter(([, v]) => v === false);
      expect(falses, `${label} is ungraded but carries scored misses: ${JSON.stringify(falses)}`).toEqual(
        [],
      );
    }
    expect(reached).toEqual(['unparseable', 'unvalidated', 'unverifiable']);
    // The assertion above is vacuous if no state was actually ungraded, and a
    // vacuous guard is the failure mode this whole file exists to avoid.
    expect(sawUngraded, 'at least one state must be ungraded for this test to mean anything').toBeGreaterThan(
      0,
    );
  });

  it('does not report a miss for a field the ground truth never asked about', () => {
    // `description` is the live case: no sample states one, so an answer or an
    // omission are both correct behaviour and neither may be counted. This is
    // the exclusion mechanism, and it is asserted here rather than only in the
    // prompt-grammar suite because a diagnosis that counted it would inflate
    // every published miss tally without changing any rate.
    const samples = golden();
    const answered = samples.map((s) => perfectPrediction(s, { description: 'a plausible root cause' }));
    const omitted = samples.map((s) => perfectPrediction(s, { description: undefined }));

    const withAnswers = buildExtractionReport(samples, answered);
    const withOmissions = buildExtractionReport(samples, omitted);

    expect(withAnswers.misses).toEqual([]);
    expect(withOmissions.misses).toEqual([]);
    expect(withAnswers.missClassification).toEqual({ wrongValue: 0, omitted: 0, samplesWithMisses: 0 });
    expect(withOmissions.missClassification).toEqual({ wrongValue: 0, omitted: 0, samplesWithMisses: 0 });
  });

  it('never reports a miss for a field the sample does not score', () => {
    const samples = golden();
    const report = buildExtractionReport(samples, samples.map((s) => perfectPrediction(s)));
    expect(report.misses).toEqual([]);
    // `description` is excluded for every sample because none states one, and
    // the exclusion is visible as a per-field rate with a zero denominator
    // rather than as a zero rate -- the two read very differently.
    expect(report.layers.description.graded.total).toBe(0);
    expect(report.layers.description.graded.rate).toBeNull();
  });

  it('classifier counts account for every graded sample exactly once', () => {
    // A summary that double-counts or drops samples is worse than none, because
    // it looks authoritative. The counts are asserted to reconcile against the
    // verdict count rather than merely to look plausible.
    const samples = golden();
    const injected = samples.filter((_, i) => i % 3 === 0).length;
    const predictions = samples.map((s, i) =>
      i % 3 === 0 ? perfectPrediction(s, { type: 'wrong-a' }) : perfectPrediction(s),
    );
    const report = buildExtractionReport(samples, predictions);
    const total = report.missClassification.wrongValue + report.missClassification.omitted;
    // Every injected miss is a wrong value, none is an omission, and each
    // injected sample contributes exactly one.
    expect(report.missClassification.wrongValue).toBe(injected);
    expect(report.missClassification.omitted).toBe(0);
    expect(report.missClassification.samplesWithMisses).toBe(injected);
    expect(total).toBe(report.layers.type.graded.total - report.layers.type.graded.hits);
  });
});

describe('the report prints the diagnosis', () => {
  it('names each missing sample and its failing fields', () => {
    const samples = golden();
    const target = samples[0]!;
    const predictions = samples.map((s) =>
      s.id === target.id ? perfectPrediction(s, { type: 'wrong-a', component: 'wrong-b' }) : perfectPrediction(s),
    );
    const text = formatExtractionReport(buildExtractionReport(samples, predictions));
    expect(text).toContain(target.id);
    expect(text).toMatch(/type/);
    expect(text).toMatch(/component/);
  });

  it('prints the classifier counts so the workflow can publish them', () => {
    const samples = golden();
    const predictions = samples.map((s, i) =>
      i === 0 ? perfectPrediction(s, { type: 'wrong-a' }) : perfectPrediction(s),
    );
    const text = formatExtractionReport(buildExtractionReport(samples, predictions));
    expect(text).toMatch(/wrong value/i);
    expect(text).toMatch(/omitted/i);
  });

  it('renders an omission as (omitted) and a wrong value as the answer itself', () => {
    // This is the exact row shape the workflow's `sed` substitution is written
    // against, so it is pinned here rather than left to the workflow test to
    // infer. Two reasons it must be asserted at the source:
    //
    //   - the `sed` pattern requires a literal ` -> ` and a four-space indent, so
    //     a format change here silently empties the annotation -- the run still
    //     succeeds and the detail line reads `... :` with nothing after it;
    //   - a miss with `actual === null` must print `(omitted)`, not `null` or an
    //     empty string. `null` in an annotation reads as a serialisation bug
    //     rather than as "the model did not answer", which is the one distinction
    //     the classifier exists to draw.
    const samples = golden();
    const target = samples[0]!;
    // `type` is stated by every sample, so it is the field to use for both
    // reasons: one sample omits it, another answers it wrongly.
    const omitted = samples.map((s) =>
      s.id === target.id ? perfectPrediction(s, { type: undefined }) : perfectPrediction(s),
    );
    const wrong = samples.map((s) =>
      s.id === target.id ? perfectPrediction(s, { type: 'wrong-a' }) : perfectPrediction(s),
    );

    const omittedText = formatExtractionReport(buildExtractionReport(samples, omitted));
    const wrongText = formatExtractionReport(buildExtractionReport(samples, wrong));

    // The omission row: reason `omitted`, expected the ground truth, actual
    // rendered as the placeholder.
    expect(omittedText).toMatch(
      new RegExp(`^ {4}${target.id} +type +omitted +\\S+ -> \\(omitted\\)$`, 'm'),
    );
    // The wrong-value row: reason `wrongValue`, and the actual is the answer.
    expect(wrongText).toMatch(new RegExp(`^ {4}${target.id} +type +wrongValue +\\S+ -> wrong-a$`, 'm'));
    // And the placeholder must be reserved for the omission. A wrong answer that
    // happens to be the literal string `(omitted)` is not a case the scorer can
    // produce, but the assertion records that the two rows differ by more than
    // the reason column.
    expect(wrongText).not.toContain('-> (omitted)');
    expect(omittedText).not.toContain('wrong-a');
  });
});
