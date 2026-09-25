import { describe, expect, it } from 'vitest';
import {
  M1_STRICT_THRESHOLD,
  buildExtractionReport,
  formatExtractionReport,
  meetsM1ExitCondition,
  parseGoldenDataset,
  scoreExtractionSample,
} from '../src/fault/extraction-scoring.js';
import type {
  ExtractionSamplePrediction,
  GoldenSample,
} from '../src/fault/extraction-scoring.js';

/**
 * Scoring for the historical-fault extraction channel (M13 channel B).
 *
 * This module exists because the product had no way to state its own extraction
 * accuracy, and an unstated number is not a number. Three design decisions are
 * load-bearing, and each of them is a place where the obvious implementation
 * would have produced a *plausible* figure that was not a true one.
 *
 * 1. Four states, not two. An extraction can fail to parse, parse but fail
 *    validation, parse and validate but concern a fault the verifier cannot
 *    check, or arrive fully graded. Collapsing the middle two into "wrong"
 *    charges the model for a defect the pipeline introduced (a validator that
 *    rejects correct answers) or for evidence that does not exist (a fault whose
 *    expected signal is not in telemetry). Collapsing them into "right" is worse
 *    and was the shape the first draft had.
 *
 * 2. Layered rates with their own denominators. A per-field rate over all
 *    samples and a per-field rate over valid samples answer different questions
 *    ("how often is this field right" versus "when the extraction is usable, how
 *    often is this field right"), and a single ratio cannot express both. Every
 *    rate carries `{hits, total, rate}` so a reader can see the denominator.
 *
 * 3. An empty cell is not a zero. A rate over zero samples is `null`, never 0.
 *    0 is a claim about the model; `null` is a statement that nothing was
 *    measured, and those must not be the same value in a report.
 */

/** A minimal golden sample; defaults keep each test about the assertion it makes. */
function sample(overrides: Partial<GoldenSample> = {}): GoldenSample {
  return {
    id: 'sample-1',
    incidentText: 'cpu saturation on checkout',
    expected: { type: 'cpu-saturation', category: 'resource' },
    ...overrides,
  };
}

/** A prediction that matches `sample()` exactly. */
function prediction(overrides: Partial<ExtractionSamplePrediction> = {}): ExtractionSamplePrediction {
  return {
    sampleId: 'sample-1',
    parseOk: true,
    validationValid: true,
    extracted: { type: 'cpu-saturation', category: 'resource', confidence: 0.9 },
    ...overrides,
  };
}

describe('fault/extraction-scoring · scoreExtractionSample', () => {
  it('grades a fully correct extraction as graded and all fields hit', () => {
    const verdict = scoreExtractionSample(sample(), prediction());
    expect(verdict.state).toBe('graded');
    expect(verdict.fields).toEqual({ type: true, category: true, component: null, description: null });
  });

  it('marks an unparseable response as unparseable and grades no field', () => {
    const verdict = scoreExtractionSample(
      sample(),
      prediction({ parseOk: false, extracted: undefined }),
    );
    expect(verdict.state).toBe('unparseable');
    // Not `false`: there is no answer to be wrong, and `false` would enter the
    // denominator as a miss the model did not commit.
    expect(verdict.fields).toEqual({ type: null, category: null, component: null, description: null });
  });

  it('marks a parse that fails validation as unvalidated, not as a miss', () => {
    const verdict = scoreExtractionSample(sample(), prediction({ validationValid: false }));
    expect(verdict.state).toBe('unvalidated');
    expect(verdict.fields).toEqual({ type: null, category: null, component: null, description: null });
  });

  it('marks a fault the verifier cannot check as unverifiable', () => {
    const verdict = scoreExtractionSample(
      sample(),
      prediction({ verifiable: false }),
    );
    expect(verdict.state).toBe('unverifiable');
  });

  it('reports a wrong type as graded with a false field rather than as a bad state', () => {
    const verdict = scoreExtractionSample(
      sample(),
      prediction({ extracted: { type: 'memory-saturation', category: 'resource', confidence: 0.9 } }),
    );
    expect(verdict.state).toBe('graded');
    expect(verdict.fields.type).toBe(false);
    expect(verdict.fields.category).toBe(true);
  });

  it('scores an omitted category as a miss when the sample stated one', () => {
    // The fixture is easy to misread, and the first draft of this test did: the
    // model omitted `category` while the sample expected `resource`, so `false`
    // is the only honest grade. What makes it worth a test is the trap on the
    // other side -- `validateExtractedFault` infers a category from the type, so
    // a scorer that read the *validated* spec back would find `resource` sitting
    // there and grade it as a model hit. The scorer reads the raw extraction for
    // exactly this reason, and this assertion is what holds that line.
    const verdict = scoreExtractionSample(
      sample(),
      prediction({ extracted: { type: 'cpu-saturation', confidence: 0.9 } }),
    );
    expect(verdict.fields.category).toBe(false);
    expect(verdict.state).toBe('graded');
    expect(verdict.fields.type).toBe(true);
  });

  it('scores a category as null, not as a miss, when the sample expected none', () => {
    // The other half of the rule, and the one that would have been wrong: with
    // no expectation in the sample there is nothing for the model's answer to be
    // wrong about, so the field leaves the denominator instead of counting as a
    // zero.
    const verdict = scoreExtractionSample(
      sample({ expected: { type: 'cpu-saturation' } }),
      prediction({ extracted: { type: 'cpu-saturation', category: 'resource', confidence: 0.9 } }),
    );
    expect(verdict.fields.category).toBeNull();
    expect(verdict.state).toBe('graded');
  });

  it('scores an omitted category as null when neither side names one', () => {
    const verdict = scoreExtractionSample(
      sample({ expected: { type: 'cpu-saturation' } }),
      prediction({ extracted: { type: 'cpu-saturation', confidence: 0.9 } }),
    );
    expect(verdict.fields.category).toBeNull();
  });

  it('grades an omitted component as null when the sample did not state one', () => {
    const verdict = scoreExtractionSample(sample(), prediction());
    expect(verdict.fields.component).toBeNull();
  });

  it('grades an omitted component as false when the sample did state one', () => {
    const verdict = scoreExtractionSample(
      sample({ expected: { type: 'cpu-saturation', category: 'resource', component: 'checkout' } }),
      prediction(),
    );
    expect(verdict.fields.component).toBe(false);
  });

  it('normalises fault types before comparing, so casing is not a miss', () => {
    const verdict = scoreExtractionSample(
      sample(),
      prediction({ extracted: { type: 'CPU_Saturation', category: 'resource', confidence: 0.9 } }),
    );
    expect(verdict.fields.type).toBe(true);
  });

  it('compares categories case-insensitively without inventing a synonym map', () => {
    const verdict = scoreExtractionSample(
      sample(),
      prediction({ extracted: { type: 'cpu-saturation', category: 'RESOURCE', confidence: 0.9 } }),
    );
    expect(verdict.fields.category).toBe(true);
  });

  it('records the sample id on the verdict', () => {
    const verdict = scoreExtractionSample(sample(), prediction());
    expect(verdict.sampleId).toBe('sample-1');
  });

  it('reports a mismatched sample id as a hard error rather than scoring it', () => {
    // Pairing by position is the failure mode this guards: one reordered sample
    // file would silently score every prediction against the wrong ground truth.
    expect(() => scoreExtractionSample(sample(), prediction({ sampleId: 'other' }))).toThrow(
      /prediction for 'other' does not match sample 'sample-1'/,
    );
  });

  it('treats a graded sample with no verifiable expectation as verifiable by default', () => {
    const verdict = scoreExtractionSample(sample(), prediction({ verifiable: undefined }));
    expect(verdict.state).toBe('graded');
  });

  it('scores a fault type as a miss when the model omitted it from a graded parse', () => {
    // `parseFaultExtractionResponse` rejects a blank `type`, so this shape only
    // reaches the scorer from a hand-written or older prediction file. It must
    // still be a miss rather than a crash: the scorer's job is to grade, and a
    // prediction artefact it cannot read is what the envelope check is for.
    const verdict = scoreExtractionSample(
      sample({ expected: { type: 'cpu-saturation', category: 'resource', component: 'checkout' } }),
      prediction({ extracted: { type: '', category: 'resource', confidence: 0.9 } }),
    );
    expect(verdict.state).toBe('graded');
    expect(verdict.fields.type).toBe(false);
  });

  it('does not read a sameValue comparison as a hit when either side is absent', () => {
    // `sameValue` returns false when either argument is undefined, and that
    // guard is reachable from two directions: a sample with an expectation and a
    // model with no answer (already covered) and a model with an answer and a
    // sample with no expectation. The second was untested, and it is the one
    // that would have leaked a `false` into a denominator the sample never
    // asked about -- the `scoreField` guard above is what prevents it.
    const verdict = scoreExtractionSample(
      sample({ expected: { type: 'cpu-saturation' } }),
      prediction({ extracted: { type: 'cpu-saturation', component: 'checkout', confidence: 0.9 } }),
    );
    expect(verdict.fields.component).toBeNull();
  });
});

describe('fault/extraction-scoring · buildExtractionReport', () => {
  it('counts each state separately and reports rates over their own denominators', () => {
    const samples = [sample({ id: 'a' }), sample({ id: 'b' }), sample({ id: 'c' }), sample({ id: 'd' })];
    const predictions = [
      prediction({ sampleId: 'a' }),
      prediction({ sampleId: 'b', validationValid: false }),
      prediction({ sampleId: 'c', parseOk: false, extracted: undefined }),
      prediction({ sampleId: 'd', verifiable: false }),
    ];
    const report = buildExtractionReport(samples, predictions);

    expect(report.counts).toEqual({ unparseable: 1, unvalidated: 1, unverifiable: 1, graded: 1 });
    expect(report.total).toBe(4);
    // The strict all-fields-correct rate is over *graded* samples only: 1 of 4
    // samples produced a scoreable answer, and that answer was fully right.
    expect(report.strict).toEqual({ hits: 1, total: 1, rate: 1 });
  });

  it('reports the field rate over graded samples and the coverage rate over all samples', () => {
    const samples = [sample({ id: 'a' }), sample({ id: 'b' }), sample({ id: 'c' }), sample({ id: 'd' })];
    const predictions = [
      prediction({ sampleId: 'a' }),
      prediction({ sampleId: 'b', extracted: { type: 'disk-full', category: 'resource', confidence: 0.9 } }),
      prediction({ sampleId: 'c', parseOk: false, extracted: undefined }),
      prediction({ sampleId: 'd', parseOk: false, extracted: undefined }),
    ];
    const report = buildExtractionReport(samples, predictions);

    // In the layers that exist, the type was right once and wrong once. The two
    // unparseable samples do not appear here at all -- they are the layer below.
    expect(report.layers.type.graded).toEqual({ hits: 1, total: 2, rate: 0.5 });
    expect(report.layers.type.overall).toEqual({ hits: 1, total: 4, rate: 0.25 });
    expect(report.layers.category.graded).toEqual({ hits: 2, total: 2, rate: 1 });
    expect(report.layers.category.overall).toEqual({ hits: 2, total: 4, rate: 0.5 });
  });

  it('reports the parse and validation layers as their own rates', () => {
    const samples = [sample({ id: 'a' }), sample({ id: 'b' }), sample({ id: 'c' }), sample({ id: 'd' })];
    const predictions = [
      prediction({ sampleId: 'a' }),
      prediction({ sampleId: 'b', validationValid: false }),
      prediction({ sampleId: 'c', parseOk: false, extracted: undefined }),
      prediction({ sampleId: 'd' }),
    ];
    const report = buildExtractionReport(samples, predictions);
    expect(report.layers.parse).toEqual({ hits: 3, total: 4, rate: 0.75 });
    expect(report.layers.validation).toEqual({ hits: 2, total: 4, rate: 0.5 });
  });

  it('reports a null rate, never a zero, when the denominator is empty', () => {
    const report = buildExtractionReport([], []);
    expect(report.total).toBe(0);
    expect(report.strict).toEqual({ hits: 0, total: 0, rate: null });
    expect(report.layers.type.graded).toEqual({ hits: 0, total: 0, rate: null });
    expect(report.layers.parse).toEqual({ hits: 0, total: 0, rate: null });
  });

  it('reports a null graded rate when every sample is unparseable', () => {
    const samples = [sample({ id: 'a' })];
    const report = buildExtractionReport(samples, [
      prediction({ sampleId: 'a', parseOk: false, extracted: undefined }),
    ]);
    // The graded layer is empty, so it has no rate. Reporting 0 here would have
    // read as "the model got every field wrong" when it produced no field at all.
    expect(report.layers.type.graded.rate).toBeNull();
    expect(report.layers.type.overall).toEqual({ hits: 0, total: 1, rate: 0 });
    expect(report.strict.rate).toBeNull();
  });

  it('refuses to score a run whose predictions do not cover the samples', () => {
    expect(() =>
      buildExtractionReport([sample({ id: 'a' }), sample({ id: 'b' })], [prediction({ sampleId: 'a' })]),
    ).toThrow(/2 sample\(s\) but 1 prediction\(s\)/);
  });

  it('names the duplicated sample id rather than averaging over it twice', () => {
    expect(() =>
      buildExtractionReport(
        [sample({ id: 'a' }), sample({ id: 'a' })],
        [prediction({ sampleId: 'a' }), prediction({ sampleId: 'a' })],
      ),
    ).toThrow(/duplicate sample id 'a'/);
  });

  it('excludes ungraded samples from the per-field denominator, both layers', () => {
    // This is the assertion a deliberate injection survived without.
    //
    // Widening both `scored` and the numerator to iterate over every verdict
    // instead of only the graded ones left the suite green, because in every
    // other fixture the ungraded samples happened to have no expected `type` to
    // be counted against. A pure `type` sample with a wrong answer gives the
    // layers something to disagree about: the graded denominator is 1 and the
    // overall denominator is 3, and a scorer that used one for both cannot
    // reproduce these two numbers.
    const samples = [
      sample({ id: 'a', expected: { type: 'cpu-saturation' } }),
      sample({ id: 'b', expected: { type: 'cpu-saturation' } }),
      sample({ id: 'c', expected: { type: 'cpu-saturation' } }),
    ];
    const predictions = [
      prediction({ sampleId: 'a', extracted: { type: 'disk-full', confidence: 0.9 } }),
      prediction({ sampleId: 'b', parseOk: false, extracted: undefined }),
      prediction({ sampleId: 'c', validationValid: false }),
    ];
    const report = buildExtractionReport(samples, predictions);
    expect(report.counts.graded).toBe(1);
    expect(report.layers.type.graded).toEqual({ hits: 0, total: 1, rate: 0 });
    expect(report.layers.type.overall).toEqual({ hits: 0, total: 3, rate: 0 });
    expect(report.strict.rate).toBe(0);
  });

  it('separates the graded and overall denominators with a hit, not only with a miss', () => {
    // The same gap from the other side. With a *hit* among the graded samples,
    // a scorer that used the graded denominator for both layers would report
    // 1/1 for `overall`; the correct figure is 1/2, because the unparseable
    // sample did not get the field right either.
    const samples = [
      sample({ id: 'a', expected: { type: 'cpu-saturation' } }),
      sample({ id: 'b', expected: { type: 'cpu-saturation' } }),
    ];
    const predictions = [
      prediction({ sampleId: 'a', extracted: { type: 'cpu-saturation', confidence: 0.9 } }),
      prediction({ sampleId: 'b', parseOk: false, extracted: undefined }),
    ];
    const report = buildExtractionReport(samples, predictions);
    expect(report.layers.type.graded).toEqual({ hits: 1, total: 1, rate: 1 });
    expect(report.layers.type.overall).toEqual({ hits: 1, total: 2, rate: 0.5 });
  });

  it('pairs samples and predictions by id, so file order does not matter', () => {
    const samples = [sample({ id: 'a' }), sample({ id: 'b' })];
    const predictions = [
      prediction({ sampleId: 'b' }),
      prediction({ sampleId: 'a' }),
    ];
    const report = buildExtractionReport(samples, predictions);
    expect(report.total).toBe(2);
    expect(report.strict).toEqual({ hits: 2, total: 2, rate: 1 });
  });

  it('names the sample that has no prediction rather than scoring it as a miss', () => {
    // The count check above catches a short file, but not a file of the right
    // length whose ids do not line up -- a rename on one side only. That case
    // has to be an error: scoring it would report a miss for a sample the model
    // was never asked about.
    expect(() =>
      buildExtractionReport(
        [sample({ id: 'a' }), sample({ id: 'b' })],
        [prediction({ sampleId: 'a' }), prediction({ sampleId: 'renamed' })],
      ),
    ).toThrow(/no prediction for sample 'b'/);
  });

  it('reports NOT MET for a measured run below the threshold', () => {
    const samples = [sample({ id: 'a' }), sample({ id: 'b' })];
    const predictions = [
      prediction({ sampleId: 'a' }),
      prediction({ sampleId: 'b', extracted: { type: 'wrong', category: 'resource', confidence: 0.9 } }),
    ];
    const text = formatExtractionReport(buildExtractionReport(samples, predictions));
    expect(text).toMatch(/M1 exit condition: NOT MET \(>= 70% strict\)/);
  });
});

describe('fault/extraction-scoring · parseGoldenDataset', () => {
  const valid = {
    schema: 'rca-bench-fault-golden/1',
    samples: [
      { id: 's1', incidentText: 'cpu saturation', expected: { type: 'cpu-saturation', category: 'resource' } },
    ],
  };

  it('accepts a well-formed dataset and returns the samples', () => {
    const result = parseGoldenDataset(valid);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]!.id).toBe('s1');
  });

  it('rejects a non-object dataset with a named error', () => {
    expect(() => parseGoldenDataset('nope')).toThrow(/dataset is not an object/);
  });

  it('rejects an unknown schema version rather than reading it optimistically', () => {
    expect(() => parseGoldenDataset({ ...valid, schema: 'rca-bench-fault-golden/2' })).toThrow(
      /unsupported dataset schema 'rca-bench-fault-golden\/2'/,
    );
  });

  it('rejects a missing samples array', () => {
    expect(() => parseGoldenDataset({ schema: 'rca-bench-fault-golden/1' })).toThrow(
      /'samples' is not an array/,
    );
  });

  it('rejects a sample missing its incident text', () => {
    expect(() =>
      parseGoldenDataset({
        ...valid,
        samples: [{ id: 's1', expected: { type: 'cpu-saturation' } }],
      }),
    ).toThrow(/sample 0 is missing a non-blank 'incidentText'/);
  });

  it('rejects a sample missing an expected type', () => {
    expect(() =>
      parseGoldenDataset({ ...valid, samples: [{ id: 's1', incidentText: 'x', expected: {} }] }),
    ).toThrow(/sample 's1' is missing an expected 'type'/);
  });

  it('rejects a blank sample id', () => {
    expect(() =>
      parseGoldenDataset({
        ...valid,
        samples: [{ id: '  ', incidentText: 'x', expected: { type: 'cpu-saturation' } }],
      }),
    ).toThrow(/sample 0 is missing a non-blank 'id'/);
  });

  it('rejects a duplicate sample id at parse time, not at scoring time', () => {
    expect(() =>
      parseGoldenDataset({
        ...valid,
        samples: [
          { id: 's1', incidentText: 'x', expected: { type: 'cpu-saturation' } },
          { id: 's1', incidentText: 'y', expected: { type: 'cpu-saturation' } },
        ],
      }),
    ).toThrow(/duplicate sample id 's1'/);
  });

  it('keeps the optional component and description when the sample states them', () => {
    const result = parseGoldenDataset({
      ...valid,
      samples: [
        {
          id: 's1',
          incidentText: 'x',
          expected: { type: 'cpu-saturation', component: 'checkout', description: 'runaway loop' },
        },
      ],
    });
    expect(result.samples[0]!.expected.component).toBe('checkout');
    expect(result.samples[0]!.expected.description).toBe('runaway loop');
  });

  it('drops non-string optional fields rather than carrying an unusable expectation', () => {
    const result = parseGoldenDataset({
      ...valid,
      samples: [
        { id: 's1', incidentText: 'x', expected: { type: 'cpu-saturation', component: 7, description: null } },
      ],
    });
    expect(result.samples[0]!.expected.component).toBeUndefined();
    expect(result.samples[0]!.expected.description).toBeUndefined();
  });

  it('reports an empty dataset as an error, because an empty run measures nothing', () => {
    expect(() => parseGoldenDataset({ ...valid, samples: [] })).toThrow(/contains no samples/);
  });

  it('rejects a non-object entry in the samples array', () => {
    expect(() => parseGoldenDataset({ ...valid, samples: ['not-an-object'] })).toThrow(
      /sample 0 is not an object/,
    );
  });

  it('rejects a sample whose expected field is not an object', () => {
    // Distinct from a missing `expected`: `expected: "cpu"` is a dataset that
    // was written by hand against a different schema, and reading it
    // optimistically would produce a sample that scores every prediction as a
    // miss on a type nobody stated.
    expect(() =>
      parseGoldenDataset({ ...valid, samples: [{ id: 's1', incidentText: 'x', expected: 'cpu' }] }),
    ).toThrow(/sample 's1' is missing an 'expected' object/);
  });

  it('rejects a blank expected type rather than treating it as unpinned', () => {
    expect(() =>
      parseGoldenDataset({ ...valid, samples: [{ id: 's1', incidentText: 'x', expected: { type: '  ' } }] }),
    ).toThrow(/sample 's1' is missing an expected 'type'/);
  });
});

describe('fault/extraction-scoring · meetsM1ExitCondition', () => {
  it('meets the exit condition when the strict all-fields rate clears the threshold', () => {
    const report = buildExtractionReport(
      [sample({ id: 'a' })],
      [prediction({ sampleId: 'a' })],
    );
    expect(report.strict.rate).toBe(1);
    expect(meetsM1ExitCondition(report)).toBe(true);
  });

  it('fails the exit condition below the threshold', () => {
    const samples = [sample({ id: 'a' }), sample({ id: 'b' }), sample({ id: 'c' }), sample({ id: 'd' })];
    const predictions = [
      prediction({ sampleId: 'a' }),
      prediction({ sampleId: 'b', extracted: { type: 'wrong', category: 'resource', confidence: 0.9 } }),
      prediction({ sampleId: 'c', extracted: { type: 'wrong', category: 'resource', confidence: 0.9 } }),
      prediction({ sampleId: 'd', extracted: { type: 'wrong', category: 'resource', confidence: 0.9 } }),
    ];
    const report = buildExtractionReport(samples, predictions);
    expect(report.strict).toEqual({ hits: 1, total: 4, rate: 0.25 });
    expect(meetsM1ExitCondition(report)).toBe(false);
  });

  it('does not treat an unmeasured rate as a pass', () => {
    const report = buildExtractionReport([], []);
    expect(report.strict.rate).toBeNull();
    // `null >= 0.7` is false in JS, so this would pass by accident; the explicit
    // guard is what makes the intent readable and the behaviour deliberate.
    expect(meetsM1ExitCondition(report)).toBe(false);
  });

  it('is inclusive at the threshold, so a measured 0.7 clears it', () => {
    const samples = Array.from({ length: 10 }, (_, i) => sample({ id: `s${i}` }));
    const predictions = samples.map((s, i) =>
      prediction({
        sampleId: s.id,
        extracted:
          i < 7
            ? { type: 'cpu-saturation', category: 'resource', confidence: 0.9 }
            : { type: 'wrong', category: 'resource', confidence: 0.9 },
      }),
    );
    const report = buildExtractionReport(samples, predictions);
    expect(report.strict.rate).toBeCloseTo(M1_STRICT_THRESHOLD, 10);
    expect(meetsM1ExitCondition(report)).toBe(true);
  });
});

describe('fault/extraction-scoring · formatExtractionReport', () => {
  it('renders every state count and both denominators for each graded field', () => {
    const samples = [sample({ id: 'a' }), sample({ id: 'b' })];
    const predictions = [
      prediction({ sampleId: 'a' }),
      prediction({ sampleId: 'b', parseOk: false, extracted: undefined }),
    ];
    const text = formatExtractionReport(buildExtractionReport(samples, predictions));
    expect(text).toMatch(/parsed\s*: 1\/2/);
    expect(text).toMatch(/validated\s*: 1\/2/);
    expect(text).toMatch(/graded\s*: 1\/2/);
    expect(text).toMatch(/type\s*: graded 1\/1 \(100\.0%\)  overall 1\/2 \(50\.0%\)/);
    expect(text).toMatch(/component\s*: graded 0\/0 \(n\/a\)  overall 0\/2 \(0\.0%\)/);
  });

  it('renders an unmeasured rate as n/a rather than as 0.0%', () => {
    const text = formatExtractionReport(buildExtractionReport([], []));
    expect(text).toMatch(/strict all-fields: 0\/0 \(n\/a\)/);
    expect(text).not.toMatch(/strict all-fields: 0\/0 \(0\.0%\)/);
  });

  it('names the strict rate with its denominator so a 1-of-1 run is not read as a 100% suite', () => {
    const text = formatExtractionReport(
      buildExtractionReport([sample({ id: 'a' })], [prediction({ sampleId: 'a' })]),
    );
    expect(text).toMatch(/strict all-fields: 1\/1 \(100\.0%\)/);
  });

  it('reports the M1 exit condition verdict in the rendered text', () => {
    const text = formatExtractionReport(buildExtractionReport([], []));
    expect(text).toMatch(/M1 exit condition: NOT MET \(no graded sample\)/);
  });

  it('states the threshold it compared against, so the verdict is checkable', () => {
    const text = formatExtractionReport(
      buildExtractionReport([sample({ id: 'a' })], [prediction({ sampleId: 'a' })]),
    );
    expect(text).toMatch(/M1 exit condition: MET \(>= 70%/);
  });
});
