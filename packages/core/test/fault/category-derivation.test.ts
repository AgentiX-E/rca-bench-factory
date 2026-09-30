/**
 * The category rule the dataset uses, checked, and its own power measured.
 *
 * Every figure here is read from `golden-master/fault-extraction/samples.json` and from the
 * recorded run fixtures in `test/fixtures/miss-detail-*.txt`, never transcribed, so no
 * assertion can drift from its source.
 *
 * The load-bearing assertions are the two that say what the rest do **not** establish:
 *
 * - `discriminatingPower.separates === false` — the reading disagrees with the label on 2 of 19
 *   expected types, below `ALT_READING_FLOOR`, so no miss figure drawn from it can separate the
 *   model from a correct answerer. This is finding 100's result in a new place.
 * - `missStability.stable === false` — the one consistent miss exists in one recorded run and
 *   not the other, so the result is a property of the run rather than of the model.
 *
 * If a future change makes either of those false, the corresponding assertion fails and the
 * claim is restored rather than silently lost.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { inferFaultCategory } from '../../src/fault/collector.js';
import { CATEGORY_TERMS } from '../../src/fault/category-terms.js';
import { parseMissDetail } from '../../src/fault/miss-detail.js';
import { FAULT_CATEGORIES } from '../../src/ir/types.js';
import {
  ALT_READING_FLOOR,
  DOWNSTREAM_FLOOR,
  EXCESS_ALLOWANCE,
  assessDatasetConformance,
  assessDerivability,
  assessDiscriminatingPower,
  assessDownstreamAgreement,
  assessExcess,
  assessMissDerivability,
  assessMissStability,
  buildCategoryDerivationReport,
  downstreamCaveat,
  duplicateTypeDeclarations,
  type CategoryConsumer,
  type DerivationSample,
  type DownstreamReading,
  type MissSample,
  type RunMisses,
} from '../../src/fault/category-derivation.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const DATASET = resolve(REPO_ROOT, 'golden-master', 'fault-extraction', 'samples.json');
const FIXTURES = resolve(HERE, '..', 'fixtures');
const PROBE = resolve(REPO_ROOT, 'scripts', 'probe-category-derivation.mjs');

interface GoldenSample {
  id: string;
  incidentText: string;
  expected: { type: string; category: string; component: string };
}

function loadDataset(): GoldenSample[] {
  const parsed = JSON.parse(readFileSync(DATASET, 'utf8')) as { samples: GoldenSample[] };
  return parsed.samples;
}

function datasetSamples(): DerivationSample[] {
  return loadDataset().map((s) => ({
    sampleId: s.id,
    type: s.expected.type,
    category: s.expected.category,
  }));
}

/** The expected category for a sample id, read from the dataset. */
function expectedCategory(sampleId: string): string {
  const found = loadDataset().find((s) => s.id === sampleId);
  if (found === undefined) throw new Error(`no such sample: ${sampleId}`);
  return found.expected.category;
}

/**
 * The recorded misses for one run, read from its fixture.
 *
 * Both the answered `type` and the answered `category` come from the same run, so the two
 * cannot be mismatched across runs -- which is exactly the error the first version of this
 * module made by taking them from a transcription.
 *
 * A sample whose `category` row exists but whose `type` row does not was answered with no type
 * at all; it is left out of the pair and `assessMissDerivability` excludes it from `graded`,
 * because a pairing cannot be formed.
 */
function runMisses(run: string): RunMisses {
  const text = readFileSync(resolve(FIXTURES, `miss-detail-${run}.txt`), 'utf8');
  const rows = parseMissDetail(text);
  const answeredTypes = new Map(
    rows.filter((r) => r.field === 'type').map((r) => [r.sampleId, r.actual]),
  );

  const misses: MissSample[] = [];
  for (const row of rows) {
    if (row.field !== 'category') continue;
    const answeredType = answeredTypes.get(row.sampleId);
    if (answeredType === undefined) continue;
    misses.push({
      sampleId: row.sampleId,
      answeredType,
      answeredCategory: row.actual,
      expectedCategory: expectedCategory(row.sampleId),
    });
  }
  return { run, misses };
}

const CURRENT_RUN = '567118aea';
const EARLIER_RUN = '9932e766c';
const RECORDED_RUNS: RunMisses[] = [runMisses(CURRENT_RUN), runMisses(EARLIER_RUN)];

/**
 * The adversarial word list, read from the test that owns it.
 *
 * `fault.test.ts` builds these as slug fragments inside a table of `[input, keyword, wrong]`
 * rows. They are extracted from that file rather than copied, so a word added there is tested
 * here without a second edit -- and a word removed there stops being claimed here.
 */
function adversarialWords(): string[] {
  const text = readFileSync(resolve(HERE, '..', 'fault.test.ts'), 'utf8');
  const words: string[] = [];
  for (const match of text.matchAll(/\[\s*'([a-z0-9-]+)',\s*'[a-z-]+',\s*'[a-z]+'\s*\]/g)) {
    words.push(match[1]);
  }
  return words;
}

// ---------------------------------------------------------------------------
// A. Conformance -- the dataset obeys its own rule
// ---------------------------------------------------------------------------

describe('A. the dataset obeys the category rule', () => {
  it('derives the labelled category from the labelled type in all nineteen', () => {
    const reading = assessDatasetConformance(datasetSamples());
    expect(reading.graded).toBe(19);
    expect(reading.conforming).toBe(19);
    expect(reading.share).toBe(1);
    expect(reading.conforms).toBe(true);
  });

  it('reports no disagreements, and the list is empty rather than unread', () => {
    const reading = assessDatasetConformance(datasetSamples());
    expect(reading.disagreements).toEqual([]);
  });

  it('agrees with the classifier called directly, sample by sample', () => {
    // The reading must not be a second implementation that happens to agree. Calling
    // `inferFaultCategory` per sample and comparing is the only form that would catch a
    // reading which special-cased the corpus.
    for (const sample of loadDataset()) {
      expect(inferFaultCategory(sample.expected.type), sample.id).toBe(sample.expected.category);
    }
  });

  it('reports a rewritten category as a disagreement, so the check can fail', () => {
    // The failure mode this guards: a conformance check that cannot report non-conformance.
    // One sample's category is rewritten to a category its type does not derive.
    const broken = datasetSamples().map((s) =>
      s.sampleId === 'resource-cpu-saturation-checkout' ? { ...s, category: 'network' } : s,
    );
    const reading = assessDatasetConformance(broken);
    expect(reading.conforming).toBe(18);
    expect(reading.conforms).toBe(false);
    expect(reading.disagreements).toHaveLength(1);
    expect(reading.disagreements[0]?.sampleId).toBe('resource-cpu-saturation-checkout');
    expect(reading.disagreements[0]?.labelled).toBe('network');
    expect(reading.disagreements[0]?.derived).toBe('resource');
  });

  it('excludes a sample missing a field rather than counting it non-conforming', () => {
    // Finding 94's rule: a field that was not present was not read. Counting an absent field
    // as a disagreement would let a missing value move the figure.
    const reading = assessDatasetConformance([
      { sampleId: 'a', type: 'cpu-saturation', category: 'resource' },
      { sampleId: 'b', type: '', category: 'resource' },
      { sampleId: 'c', type: 'cpu-saturation', category: '' },
    ]);
    expect(reading.graded).toBe(1);
    expect(reading.conforming).toBe(1);
    expect(reading.disagreements).toEqual([]);
  });

  it('returns a zero share, not a vacuous one, when nothing is graded', () => {
    const reading = assessDatasetConformance([]);
    expect(reading.graded).toBe(0);
    expect(reading.share).toBe(0);
    expect(reading.conforms).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. Derivability -- the rule is total
// ---------------------------------------------------------------------------

describe('B. the rule covers every labelled type', () => {
  it('leaves no expected type undecidable', () => {
    const reading = assessDerivability(datasetSamples());
    expect(reading.graded).toBe(19);
    expect(reading.defined).toBe(19);
    expect(reading.undefinedTypes).toEqual([]);
    expect(reading.total).toBe(true);
  });

  it('reports an unmapped type as undefined, so this check can fail', () => {
    // A type the keyword table has no row for. `inferFaultCategory` falls back to `unknown`,
    // and that fallback must be visible here rather than silently counted as defined.
    const reading = assessDerivability([
      { sampleId: 'a', type: 'cpu-saturation', category: 'resource' },
      { sampleId: 'b', type: 'some-unmapped-mechanism', category: 'resource' },
    ]);
    expect(reading.graded).toBe(2);
    expect(reading.defined).toBe(1);
    expect(reading.undefinedTypes).toEqual(['some-unmapped-mechanism']);
    expect(reading.total).toBe(false);
  });

  it('keeps conformance and derivability separate, because a sample can pass one and fail the other', () => {
    // A sample labelled `unknown` for an unmapped type conforms perfectly and is still
    // undecidable. If the two checks were one, this case would be invisible.
    const reading = assessDatasetConformance([
      { sampleId: 'a', type: 'some-unmapped-mechanism', category: 'unknown' },
    ]);
    const derivability = assessDerivability([
      { sampleId: 'a', type: 'some-unmapped-mechanism', category: 'unknown' },
    ]);
    expect(reading.conforms).toBe(true);
    expect(derivability.total).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C. Excess -- the rule is silent on words it was not asked about
// ---------------------------------------------------------------------------

describe('C. the rule says nothing about words it was not asked about', () => {
  it('reads the adversarial word list from the test that owns it, and it is not empty', () => {
    const words = adversarialWords();
    expect(words.length).toBeGreaterThanOrEqual(20);
    expect(words).toContain('planetary-drift');
    expect(words).toContain('flagship-rollout');
  });

  it('classifies none of them', () => {
    const reading = assessExcess(adversarialWords());
    expect(reading.classified).toBe(0);
    expect(reading.hits).toEqual([]);
    expect(reading.within).toBe(true);
  });

  it('but the substring reading classifies some of them, so the zero measures the matcher', () => {
    // This is the assertion that keeps the zero honest. A zero from a reading that can only
    // return zero would say nothing; the same words under the pre-finding-95 matcher return a
    // non-zero, so the word list does provoke the defect and the current matcher is what
    // suppresses it.
    const reading = assessExcess(adversarialWords());
    expect(reading.underSubstringReading).toBeGreaterThan(0);
    expect(reading.underSubstringReading).toBeGreaterThan(reading.classified);
  });

  it('allows no excess, and the allowance is zero because zero was measured', () => {
    expect(EXCESS_ALLOWANCE).toBe(0);
    expect(assessExcess(adversarialWords()).within).toBe(true);
  });

  it('reports a classified word when one exists, so the allowance can be exceeded', () => {
    // `redis-latency` genuinely names a middleware fault, so a list containing it is not
    // empty. This proves `within` is a comparison rather than a constant.
    const reading = assessExcess(['redis-latency', 'planetary-drift']);
    expect(reading.classified).toBe(1);
    expect(reading.hits).toEqual([{ word: 'redis-latency', derived: 'middleware' }]);
    expect(reading.within).toBe(false);
  });

  it('returns a zero share, not a vacuous one, over an empty list', () => {
    const reading = assessExcess([]);
    expect(reading.tested).toBe(0);
    expect(reading.share).toBe(0);
    expect(reading.within).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D. Miss derivability -- the honest criterion and the loose one beside it
// ---------------------------------------------------------------------------

describe('D. the recorded misses under the honest criterion', () => {
  it('graded the same eight samples the run misses', () => {
    const reading = assessMissDerivability(runMisses(CURRENT_RUN).misses);
    expect(reading.graded).toBe(8);
  });

  it('finds none of them consistent in the current run', () => {
    const reading = assessMissDerivability(runMisses(CURRENT_RUN).misses);
    expect(reading.consistent).toBe(0);
    expect(reading.consistentIds).toEqual([]);
    expect(reading.noneConsistent).toBe(true);
  });

  it('but the loose criterion counts all eight, which is why it is not the criterion', () => {
    // Every answered category is one the vocabulary knows, so "reachable from some slug" is
    // true of every miss by construction. Reported so the choice of criterion is visible.
    const reading = assessMissDerivability(runMisses(CURRENT_RUN).misses);
    expect(reading.reachableLoosely).toBe(8);
    expect(reading.reachableLoosely).toBeGreaterThan(reading.consistent);
  });

  it('names each miss with the type that was answered and what it derives', () => {
    // The figure is checkable rather than a bare count: every row carries the slug the model
    // wrote, so a reader can recompute the verdict.
    const reading = assessMissDerivability(runMisses(CURRENT_RUN).misses);
    const row = reading.rows.find((r) => r.sampleId === 'middleware-redis-latency-cache');
    expect(row?.answeredType).toBe('redis-single-thread-cpu-saturation');
    expect(row?.derived).toBe('middleware');
    expect(row?.answeredCategory).toBe('resource');
    expect(row?.expectedCategory).toBe('middleware');
    expect(row?.consistent).toBe(false);
  });

  it('reports the case where the slug and the category the model chose disagree', () => {
    // The sharpest recorded miss: the model reported a slug inferring `middleware` and then
    // answered `resource`. It is not a failure to connect the fields; the two disagree.
    const reading = assessMissDerivability(runMisses(CURRENT_RUN).misses);
    const row = reading.rows.find((r) => r.sampleId === 'middleware-redis-latency-cache');
    expect(row?.derived).not.toBe(row?.answeredCategory);
    expect(row?.derived).not.toBe('unknown');
  });

  it('reports the cases where the answered type carries no category at all', () => {
    // Four of the eight answered a slug the table has no row for, then a category anyway.
    const reading = assessMissDerivability(runMisses(CURRENT_RUN).misses);
    const undefinedRows = reading.rows.filter((r) => r.derived === 'unknown');
    expect(undefinedRows).toHaveLength(4);
    expect(undefinedRows.map((r) => r.sampleId)).toContain('middleware-kafka-consumer-lag');
  });

  it('excludes a miss with no answered type rather than pairing it across runs', () => {
    // In the earlier run, `resource-memory-leak-recommendation` has a `category` row and no
    // `type` row. Pairing it with the current run's type would compare two different answers.
    const reading = assessMissDerivability(runMisses(EARLIER_RUN).misses);
    expect(reading.graded).toBe(7);
    expect(reading.rows.map((r) => r.sampleId)).not.toContain('resource-memory-leak-recommendation');
  });

  it('counts a consistent miss in the run that has one', () => {
    // The earlier run reported `replica-apply-thread-saturation`, which does derive
    // `resource` -- the category it answered. This is the entire population of consistent
    // misses across both recorded runs.
    const reading = assessMissDerivability(runMisses(EARLIER_RUN).misses);
    expect(reading.consistent).toBe(1);
    expect(reading.consistentIds).toEqual(['middleware-mysql-replica-lag-analytics']);
    expect(reading.noneConsistent).toBe(false);
  });

  it('returns a zero share over no misses rather than a vacuous pass', () => {
    const reading = assessMissDerivability([]);
    expect(reading.graded).toBe(0);
    expect(reading.consistent).toBe(0);
    expect(reading.noneConsistent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E. Stability -- the result does not survive the run change
// ---------------------------------------------------------------------------

describe('E. the miss result is a property of the run, not of the model', () => {
  it('reads every recorded run and keeps them labelled', () => {
    const stability = assessMissStability(RECORDED_RUNS);
    expect(stability.perRun.map((r) => r.run)).toEqual([CURRENT_RUN, EARLIER_RUN]);
    expect(stability.perRun.map((r) => r.reading.consistent)).toEqual([0, 1]);
  });

  it('finds one sample consistent in at least one run', () => {
    const stability = assessMissStability(RECORDED_RUNS);
    expect(stability.everIds).toEqual(['middleware-mysql-replica-lag-analytics']);
  });

  it('and none consistent in every run, which is the figure a claim would need', () => {
    const stability = assessMissStability(RECORDED_RUNS);
    expect(stability.stableIds).toEqual([]);
    expect(stability.stable).toBe(false);
  });

  it('says why, in a sentence that names both counts', () => {
    const stability = assessMissStability(RECORDED_RUNS);
    expect(stability.reason).toContain('no sample is consistent in every recorded run');
    expect(stability.reason).toContain('1 of 8');
  });

  it('reports a sample as stable when it is consistent in every supplied run', () => {
    // The guard is not hardcoded false. Two runs agreeing on one sample make it stable, which
    // is the case the recorded runs do not exhibit and the case a real finding would need.
    const agreed: RunMisses[] = [
      {
        run: 'x',
        misses: [
          {
            sampleId: 's',
            answeredType: 'redis-latency',
            answeredCategory: 'middleware',
            expectedCategory: 'middleware',
          },
        ],
      },
      {
        run: 'y',
        misses: [
          {
            sampleId: 's',
            answeredType: 'redis-latency',
            answeredCategory: 'middleware',
            expectedCategory: 'middleware',
          },
        ],
      },
    ];
    const stability = assessMissStability(agreed);
    expect(stability.stableIds).toEqual(['s']);
    expect(stability.stable).toBe(true);
    expect(stability.reason).toContain('consistent in every recorded run');
  });

  it('does not call a sample stable when only one of two runs shows it', () => {
    const split: RunMisses[] = [
      {
        run: 'x',
        misses: [
          {
            sampleId: 's',
            answeredType: 'redis-latency',
            answeredCategory: 'middleware',
            expectedCategory: 'middleware',
          },
        ],
      },
      {
        run: 'y',
        misses: [
          {
            sampleId: 's',
            answeredType: 'kubelet-eviction',
            answeredCategory: 'resource',
            expectedCategory: 'runtime',
          },
        ],
      },
    ];
    const stability = assessMissStability(split);
    expect(stability.stableIds).toEqual([]);
    expect(stability.everIds).toEqual(['s']);
    expect(stability.stable).toBe(false);
  });

  it('reports nothing stable over no runs rather than an empty stable set that reads as agreement', () => {
    const stability = assessMissStability([]);
    expect(stability.graded).toBe(0);
    expect(stability.stable).toBe(false);
    expect(stability.stableIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F. Discriminating power -- the verdict, measured before anything is quoted
// ---------------------------------------------------------------------------

describe('F. the reading cannot separate anyone, and says so', () => {
  it('finds the alternative readings disagreeing with the label on two of nineteen', () => {
    const power = assessDiscriminatingPower(datasetSamples());
    expect(power.graded).toBe(19);
    expect(power.differ).toHaveLength(2);
    expect(power.differ.sort()).toEqual(['feature-flag-misconfiguration', 'redis-latency']);
  });

  it('names which reading disagrees about which type', () => {
    // The two readings disagree about different types, which is why the union is two rather
    // than one. Asserting the split is what makes the union checkable rather than a count.
    const power = assessDiscriminatingPower(datasetSamples());
    const byName = new Map(power.alternativeReadings.map((r) => [r.name, r.differ]));
    expect(byName.get('substring')).toEqual(['feature-flag-misconfiguration']);
    expect(byName.get('row-shadowing')).toEqual(['redis-latency', 'feature-flag-misconfiguration']);
  });

  it('computes the share as two of nineteen', () => {
    const power = assessDiscriminatingPower(datasetSamples());
    expect(power.share).toBeCloseTo(2 / 19, 10);
  });

  it('does not call the reading load-bearing', () => {
    // The finding. A reading that already disagrees with two of nineteen correct labels has
    // almost nothing left to disagree with.
    const power = assessDiscriminatingPower(datasetSamples());
    expect(power.separates).toBe(false);
  });

  it('and the arithmetic that would have said otherwise is asserted in both directions', () => {
    // `differ.length > 0` is true, and `share > ALT_READING_FLOOR` is false. Reporting the
    // first as "the reading separates them" is the defect finding 100 shipped in its first
    // version; asserting both keeps the pair from being confused for each other.
    const power = assessDiscriminatingPower(datasetSamples());
    expect(power.differ.length > 0).toBe(true);
    expect(power.share > ALT_READING_FLOOR).toBe(false);
    expect(power.separates).toBe(false);
  });

  it('states the floor rather than burying it', () => {
    expect(ALT_READING_FLOOR).toBe(0.2);
    const power = assessDiscriminatingPower(datasetSamples());
    expect(power.floor).toBe(ALT_READING_FLOOR);
    // The reason carries the share to four places and the floor as written. Asserting the
    // exact floor text rather than a formatted one: the first version of this test expected
    // `0.2000`, which the module has never printed -- the test was wrong, not the module.
    expect(power.reason).toContain('0.1053');
    expect(power.reason).toContain(`floor of ${ALT_READING_FLOOR}`);
    expect(power.reason).toContain('at or below the floor');
  });

  it('reports a constructed corpus as separating, so the guard is not hardcoded false', () => {
    // Five of six types are read differently by an alternative reading, which is above the
    // floor. If `separates` were a constant this would fail.
    const strong: DerivationSample[] = [
      { sampleId: 's1', type: 'feature-flag-misconfiguration', category: 'config' },
      { sampleId: 's2', type: 'redis-latency', category: 'middleware' },
      { sampleId: 's3', type: 'planetary-drift', category: 'network' },
      { sampleId: 's4', type: 'room-assignment', category: 'resource' },
      { sampleId: 's5', type: 'skill-inventory', category: 'runtime' },
      { sampleId: 's6', type: 'cpu-saturation', category: 'resource' },
    ];
    const power = assessDiscriminatingPower(strong);
    expect(power.share).toBeGreaterThan(ALT_READING_FLOOR);
    expect(power.separates).toBe(true);
    expect(power.reason).toContain('above the floor');
  });

  it('returns a zero share, not a vacuous one, over no samples', () => {
    const power = assessDiscriminatingPower([]);
    expect(power.graded).toBe(0);
    expect(power.share).toBe(0);
    expect(power.separates).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// G. The report -- verdict first, caveats attached
// ---------------------------------------------------------------------------

describe('G. the report puts the verdict first and the caveats with it', () => {
  function report() {
    return buildCategoryDerivationReport({
      samples: datasetSamples(),
      misses: runMisses(CURRENT_RUN).misses,
      runs: RECORDED_RUNS,
      adversarialWords: adversarialWords(),
    });
  }

  it('carries the verdict as its first field, by key order', () => {
    // Order is the assertion, not presence. A reader who stops after one field must land on
    // the verdict, and a reader who quotes must have passed it.
    expect(Object.keys(report())[0]).toBe('discriminatingPower');
  });

  it('carries figures that agree with the individual assessments', () => {
    const built = report();
    expect(built.conformance).toEqual(assessDatasetConformance(datasetSamples()));
    expect(built.derivability).toEqual(assessDerivability(datasetSamples()));
    expect(built.excess).toEqual(assessExcess(adversarialWords()));
    expect(built.misses).toEqual(assessMissDerivability(runMisses(CURRENT_RUN).misses));
    expect(built.missStability).toEqual(assessMissStability(RECORDED_RUNS));
  });

  it('carries the verdict it measured, not one passed in', () => {
    expect(report().discriminatingPower.separates).toBe(false);
  });

  it('states what the figures do not show, and never in fewer than four sentences', () => {
    const honesty = report().honesty;
    expect(honesty.length).toBeGreaterThanOrEqual(5);
    for (const line of honesty) expect(line.length).toBeGreaterThan(40);
  });

  it('attaches the below-floor caveat to the miss figure it qualifies', () => {
    const built = report();
    const caveat = built.honesty.find((line) => line.includes('miss figure'));
    expect(caveat).toBeDefined();
    expect(caveat).toContain('below the floor');
    expect(caveat).toContain('must not be quoted as a result');
  });

  it('attaches the run-dependence caveat to the same figure', () => {
    const caveat = report().honesty.find((line) => line.includes('does not survive the run change'));
    expect(caveat).toBeDefined();
    expect(caveat).toContain('property of the run');
  });

  it('does not claim the dataset is right because it is self-consistent', () => {
    const caveat = report().honesty.find((line) => line.includes('written by the same hand'));
    expect(caveat).toBeDefined();
  });

  it('names the reading it does not replace', () => {
    const caveat = report().honesty.find((line) => line.includes("finding 98's reading"));
    expect(caveat).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// H. Sample by sample -- no figure is a transcription
// ---------------------------------------------------------------------------

describe('H. every figure recomputes from its source', () => {
  it('recomputes conformance per sample inside the test', () => {
    let agree = 0;
    for (const sample of loadDataset()) {
      if (inferFaultCategory(sample.expected.type) === sample.expected.category) agree += 1;
    }
    expect(agree).toBe(assessDatasetConformance(datasetSamples()).conforming);
  });

  it('recomputes the excess by classifying each word inside the test', () => {
    let classified = 0;
    for (const word of adversarialWords()) {
      if (inferFaultCategory(`${word}-service`) !== 'unknown') classified += 1;
    }
    expect(classified).toBe(assessExcess(adversarialWords()).classified);
  });

  it('recomputes the discriminating power against the vocabulary inside the test', () => {
    // The row-shadowing reading, rebuilt here from `CATEGORY_TERMS` rather than reusing the
    // module's copy, so a change to the module's reading that is not a change to the table
    // makes these two disagree.
    const rows = Object.entries(CATEGORY_TERMS);
    let differ = 0;
    for (const sample of loadDataset()) {
      const tokens = sample.expected.type.split('-');
      const hits = rows
        .filter(([, keywords]) => keywords.some((k) => tokens.includes(k)))
        .map(([category]) => category);
      const unique = [...new Set(hits)];
      if (unique.length > 1) differ += 1;
    }
    expect(differ).toBeGreaterThan(0);
  });

  it('recomputes the miss verdicts from the fixture inside the test', () => {
    const read = runMisses(CURRENT_RUN);
    let consistent = 0;
    for (const miss of read.misses) {
      if (inferFaultCategory(miss.answeredType) === miss.answeredCategory) consistent += 1;
    }
    expect(consistent).toBe(0);
    expect(consistent).toBe(assessMissDerivability(read.misses).consistent);
  });
});

// ---------------------------------------------------------------------------
// I. The probe
// ---------------------------------------------------------------------------

describe('I. the standalone probe prints the verdict beside the figures', () => {
  function probe(): string {
    return execFileSync('node', [PROBE], { cwd: REPO_ROOT, encoding: 'utf8' });
  }

  it('prints the verdict that the reading does not separate', () => {
    expect(probe()).toContain('the reading does NOT separate them');
  });

  it('prints the floor and the share that is below it', () => {
    const out = probe();
    expect(out).toContain('load-bearing: false');
    expect(out).toContain(String(ALT_READING_FLOOR));
  });

  it('prints the verdict before the figures it qualifies', () => {
    // The same rule as the report's key order, asserted on the output a human reads. A verdict
    // printed below the numbers is one a reader can skip.
    const out = probe();
    const verdictAt = out.indexOf('load-bearing: false');
    const missAt = out.indexOf('consistent');
    expect(verdictAt).toBeGreaterThanOrEqual(0);
    expect(missAt).toBeGreaterThan(verdictAt);
  });

  it('prints the run-dependence line, so the miss figure is never shown bare', () => {
    expect(probe()).toContain('property of the run');
  });
});

// ---------------------------------------------------------------------------
// J. Every branch the corpus cannot reach is reached by a control
// ---------------------------------------------------------------------------

/**
 * The battery found this, and it is the reason this group exists.
 *
 * Three injections were written against branches of this module and all three **SURVIVED**:
 * force the conformance branch to always-conform, remove the derivability module's `unknown`
 * branch, and hardcode `separates: false`. Each is a real weakening -- the first two make a
 * check report a property it has stopped testing, the third makes a verdict a constant -- and
 * each was invisible, because on this corpus:
 *
 *   * nothing disagrees, so the disagreement branch is never entered;
 *   * every type derives a real category, so the `unknown` branch is never entered;
 *   * `separates` is already `false`, so hardcoding it false changes nothing.
 *
 * A branch no input reaches is a branch no mutation can move, and the survival was the harness
 * reporting a **bad entry** rather than a defect in the module. The repair is the one finding
 * 100 applied to the `baseline` block and finding 96 applied to `notAssessable`: construct the
 * inputs that reach the branch, and report them.
 *
 * These tests are the module-side half of that repair. They assert that each branch is
 * *reachable* and that reaching it produces a different answer -- which is the property the
 * `controls` block in `probe-type-misses.mjs` publishes. Without them the controls would be a
 * claim about the harness that the module had never been asked to support.
 */
describe('J. every branch the corpus cannot reach is reached by a control', () => {
  it('reports the corpus as conforming, so the disagreement branch is unexercised by it', () => {
    // The premise. If this ever stops holding the controls below become redundant rather than
    // wrong, and the assertion says so instead of leaving a reader to work it out.
    const corpus = assessDatasetConformance(datasetSamples());
    expect(corpus.graded).toBe(19);
    expect(corpus.disagreements).toHaveLength(0);
  });

  it('reaches the disagreement branch with a sample that disagrees by construction', () => {
    const reading = assessDatasetConformance([
      { sampleId: 'control', type: 'container-crash', category: 'middleware' },
    ]);
    // The branch produces the figure that distinguishes "the dataset conforms" from "the check
    // stopped looking": 0 of 1, with the sample named.
    expect(reading.graded).toBe(1);
    expect(reading.conforming).toBe(0);
    expect(reading.disagreements).toHaveLength(1);
    expect(reading.disagreements[0]?.sampleId).toBe('control');
    expect(reading.conforms).toBe(false);
  });

  it('reports every corpus type as defined, so the unknown branch is unexercised by it', () => {
    const corpus = assessDerivability(datasetSamples());
    expect(corpus.graded).toBe(19);
    expect(corpus.undefinedTypes).toHaveLength(0);
    expect(corpus.total).toBe(true);
  });

  it('reaches the unknown branch with a type the table does not know', () => {
    // Paired with a known type on purpose. Passing only the unknown sample gives `defined: 0`
    // both before and after the mutation, so the control would be inert again -- the same trap
    // one level down.
    const reading = assessDerivability([
      { sampleId: 'unknown', type: 'quantum-entanglement-drift', category: 'code' },
      { sampleId: 'known', type: 'container-crash', category: 'runtime' },
    ]);
    expect(reading.graded).toBe(2);
    expect(reading.defined).toBe(1);
    expect(reading.undefinedTypes).toEqual(['quantum-entanglement-drift']);
    expect(reading.total).toBe(false);
  });

  it('reports the corpus reading as not separating, so `false` is the value a constant would produce', () => {
    const corpus = assessDiscriminatingPower(datasetSamples());
    // This is the trap: hardcoding `separates: false` is indistinguishable from the honest
    // answer *on this corpus*. A control is the only way to pin the other direction.
    expect(corpus.separates).toBe(false);
    expect(corpus.share).toBeLessThanOrEqual(ALT_READING_FLOOR);
  });

  it('reaches the separating branch with a reading whose alternatives disagree about everything', () => {
    const reading = assessDiscriminatingPower([
      { sampleId: 'a', type: 'redis-latency', category: 'code' },
      { sampleId: 'b', type: 'feature-flag-misconfiguration', category: 'runtime' },
    ]);
    // Both types are ones the alternative readings classify differently from these labels, so
    // the honest verdict here is `true` -- which is what makes a hardcoded `false` observable.
    expect(reading.graded).toBe(2);
    expect(reading.differ).toHaveLength(2);
    expect(reading.share).toBeGreaterThan(ALT_READING_FLOOR);
    expect(reading.separates).toBe(true);
  });

  it('and the two ends together pin a computed verdict, which neither end does alone', () => {
    // The pair's actual claim, stated as a test: there exists an input on which the honest
    // verdict is `false` and one on which it is `true`, so no constant satisfies both.
    const values = new Set([
      assessDiscriminatingPower(datasetSamples()).separates,
      assessDiscriminatingPower([
        { sampleId: 'a', type: 'redis-latency', category: 'code' },
        { sampleId: 'b', type: 'feature-flag-misconfiguration', category: 'runtime' },
      ]).separates,
    ]);
    expect(values).toEqual(new Set([false, true]));
  });

  it('reaches the duplicate-entry defect the union is built to prevent', () => {
    // Injection AJ replaces the set union with a concatenation of the per-reading lists, so a
    // type both readings disagree about appears twice. This asserts the shape that makes the
    // defect visible: the two readings overlap on exactly one type, so a union is a set and a
    // concatenation is not.
    const reading = assessDiscriminatingPower(datasetSamples());
    const byName = new Map(reading.alternativeReadings.map((r) => [r.name, r.differ]));
    const substring = byName.get('substring') ?? [];
    const shadowing = byName.get('row-shadowing') ?? [];
    const overlap = substring.filter((t) => shadowing.includes(t));
    expect(overlap).toEqual(['feature-flag-misconfiguration']);
    expect(reading.differ).toHaveLength(substring.length + shadowing.length - overlap.length);
    expect(new Set(reading.differ).size).toBe(reading.differ.length);
  });
});

// ---------------------------------------------------------------------------
// K. The excess reader normalises its input, and the normalisation is exercised
// ---------------------------------------------------------------------------

/**
 * `assessExcess` embeds each word in a slug and reads it twice: once through the current
 * matcher and once through the pre-finding-95 substring matcher, which exists only as a
 * contrast. Both normalise the slug before matching, and on the recorded word list -- all
 * lowercase, hyphen-only -- the two normalisation lines are dead: the corpus never carries a
 * space, an underscore, an uppercase letter or punctuation for them to remove.
 *
 * That is a coverage gap of exactly the kind this finding is about, so it is closed with tests
 * rather than with an exemption. The inputs below are chosen to make each replacement a no-op
 * *and* to make the `underSubstringReading` contrast move, so the normalisation is not merely
 * executed but observable.
 */
describe('K. the excess reader normalises the words it is given', () => {
  it('folds a word carrying a space, an underscore and capitals before matching it', () => {
    // `CPU_Saturation` normalises to `cpu-saturation`, which the table knows. If the
    // normalisation were skipped the slug would be `CPU_Saturation-service` and the matcher,
    // which is anchored on the normalised form, would not find it.
    const reading = assessExcess(['CPU_Saturation']);
    expect(reading.tested).toBe(1);
    expect(reading.classified).toBe(1);
    expect(reading.hits).toEqual([{ word: 'CPU_Saturation', derived: 'resource' }]);
    expect(reading.within).toBe(false);
  });

  it('strips punctuation, so a word the table does not know stays unknown', () => {
    // The other direction: the `[^a-z0-9-]` replacement has to actually run for this to be
    // `unknown` rather than a match on a punctuated form.
    const reading = assessExcess(['qu.antum!']);
    expect(reading.classified).toBe(0);
    expect(reading.within).toBe(true);
  });

  it('reads the same word through the substring contrast, so the two readers share the input', () => {
    // `lag` is a `middleware` term, so the substring reading of `feature-flag-service` finds
    // it. This asserts the contrast is computed over the normalised slug rather than over the
    // raw word, which is what makes the two figures comparable.
    const reading = assessExcess(['feature-flag']);
    expect(reading.classified).toBe(0);
    expect(reading.underSubstringReading).toBe(1);
  });

  it('and the contrast moves with the normalisation, not merely alongside it', () => {
    // `FEATURE_FLAG` reaches the substring matcher only after normalisation turns it into
    // something containing `lag`. Without normalisation the contrast would read 0 alongside a
    // current reading of 0, and the two would be equal for the wrong reason.
    const reading = assessExcess(['FEATURE_FLAG']);
    expect(reading.underSubstringReading).toBe(1);
    expect(reading.classified).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// L. A blank field is excluded from every denominator, in every reader
// ---------------------------------------------------------------------------

/**
 * Each reader that grades a `type` has a blank-field guard, and the corpus never triggers one:
 * every golden sample and every recorded miss carries a type. Unreached, the guards are three
 * branches that no input exercises, which is the coverage gap this group closes.
 *
 * They are worth exercising beyond the branch count. `assessDatasetConformance` and
 * `assessDerivability` use *different* conditions -- conformance excludes a sample blank in
 * either field, derivability only one blank in `type` -- and `assessMissDerivability` guards the
 * answered type. A regression that dropped one guard would inflate a denominator, and an
 * inflated denominator is a confident percentage over a set that is not the corpus.
 */
describe('L. a blank field is excluded from every denominator', () => {
  it('excludes a blank type from the conformance denominator', () => {
    const reading = assessDatasetConformance([
      { sampleId: 'blank-type', type: '   ', category: 'runtime' },
      { sampleId: 'graded', type: 'container-crash', category: 'runtime' },
    ]);
    expect(reading.graded).toBe(1);
    expect(reading.conforming).toBe(1);
  });

  it('excludes a blank category from the conformance denominator, unlike a blank type', () => {
    // The asymmetry is deliberate and asserted here so it cannot be quietly unified: a sample
    // with no label is not a sample that fails to conform, so it is not graded.
    const reading = assessDatasetConformance([
      { sampleId: 'blank-category', type: 'container-crash', category: '  ' },
      { sampleId: 'graded', type: 'container-crash', category: 'runtime' },
    ]);
    expect(reading.graded).toBe(1);
    expect(reading.conforming).toBe(1);
    expect(reading.disagreements).toHaveLength(0);
  });

  it('excludes a blank type from the derivability denominator', () => {
    const reading = assessDerivability([
      { sampleId: 'blank-type', type: '', category: 'runtime' },
      { sampleId: 'graded', type: 'container-crash', category: 'runtime' },
    ]);
    expect(reading.graded).toBe(1);
    expect(reading.defined).toBe(1);
    expect(reading.total).toBe(true);
  });

  it('excludes a miss with no answered type from the miss denominator', () => {
    // A miss whose answered type is blank cannot be tested at all: the criterion is whether the
    // *answered type* derives the answered category, and there is no answered type to read.
    const reading = assessMissDerivability([
      {
        sampleId: 'blank',
        answeredType: '  ',
        answeredCategory: 'runtime',
        expectedCategory: 'middleware',
      },
      {
        sampleId: 'graded',
        answeredType: 'container-crash',
        answeredCategory: 'runtime',
        expectedCategory: 'middleware',
      },
    ]);
    expect(reading.graded).toBe(1);
    expect(reading.consistent).toBe(1);
    expect(reading.rows).toHaveLength(1);
    expect(reading.rows[0]?.sampleId).toBe('graded');
  });

  it('returns an empty reading rather than a vacuous pass when every field is blank', () => {
    // The degenerate case: no input survives the guards. Every figure is zero and `total` is
    // true, which is the honest answer -- a rule is total over the empty set -- and the test
    // records that the zero is not a measurement.
    const conformance = assessDatasetConformance([{ sampleId: 'x', type: '', category: '' }]);
    expect(conformance.graded).toBe(0);
    expect(conformance.share).toBe(0);
    expect(conformance.conforms).toBe(true);

    const derivability = assessDerivability([{ sampleId: 'x', type: '', category: 'runtime' }]);
    expect(derivability.graded).toBe(0);
    expect(derivability.total).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M. The module's own declarations, and the defect that motivated checking them
// ---------------------------------------------------------------------------

/**
 * This module shipped a duplicated declaration, and the duplication is why this group exists.
 *
 * `category-derivation.ts` declared `export interface MissReading` twice, at two places ~65 lines
 * apart, with field-for-field identical bodies. Typescript **merges** duplicate interface
 * declarations: the build passed, the typecheck passed, and every test in this file that imports
 * `MissReading` passed. The only artefact that carried the evidence was the emitted declaration
 * file, `dist/fault/category-derivation.d.ts`, which declared it on line 155 and again on line 219.
 *
 * Two properties of that defect decide what a test can and cannot do about it:
 *
 *   1. The bodies were **identical**, so nothing observable changed and **no behavioural test was
 *      possible**. The defect was structural. Any test written as though it had caught a
 *      behavioural bug would be claiming a stronger result than the evidence supports, and this
 *      group states that plainly rather than dressing it up.
 *   2. When merged declarations **differ**, the merge silently produces a **union** of their
 *      fields -- one shape to a source reader, another to a type reader, neither wrong on its own
 *      terms. So the only signature covering both cases is the source text.
 *
 * Hence a reader of the source text, and hence these tests: the detector's positive case (a file
 * that does declare twice), its negative case (a file that does not), the pair control that makes
 * the identical/differing distinction explicit, and the assertion that this module is clean.
 *
 * The regex is deliberately the same one `export-surface-enumerated.test.ts` uses for
 * `export interface X`, so the two checks agree about what counts as a declaration. That is
 * asserted below rather than left as a comment, because two readers that disagree about the
 * definition of a declaration would let a third declaration form slip between them.
 */
describe('M. the module declares each of its names once', () => {
  function moduleSource(): string {
    return readFileSync(resolve(REPO_ROOT, 'packages', 'core', 'src', 'fault', 'category-derivation.ts'), 'utf8');
  }

  it('finds no duplicated declaration in this module', () => {
    // The regression this pins. Before the fix this returned `['MissReading']`; after it, empty.
    expect(duplicateTypeDeclarations(moduleSource())).toEqual([]);
  });

  it('finds nothing in the emitted declaration file either, which is where the duplicate surfaced', () => {
    // The source check is the primary one, but the `.d.ts` is what a consumer of this package
    // reads and it is a second artefact that could carry a duplicate the source no longer has --
    // for instance if a declaration were re-exported twice. Asserting the built file closes that.
    const declaration = readFileSync(
      resolve(REPO_ROOT, 'packages', 'core', 'dist', 'fault', 'category-derivation.d.ts'),
      'utf8',
    );
    expect(duplicateTypeDeclarations(declaration)).toEqual([]);
  });

  it('reports a name declared twice, so the detector can fail', () => {
    // The positive control. Without it the empty result above is equally consistent with a
    // detector that never matches anything.
    const source = [
      'export interface Alpha { a: string }',
      'export type Beta = number;',
      'export interface Alpha { a: string }',
    ].join('\n');
    expect(duplicateTypeDeclarations(source)).toEqual(['Alpha']);
  });

  it('reports nothing for a file that declares each name once', () => {
    const source = ['export interface Alpha { a: string }', 'export type Beta = number;'].join('\n');
    expect(duplicateTypeDeclarations(source)).toEqual([]);
  });

  it('reports a name declared once as an interface and once as a type alias', () => {
    // Both forms merge or collide at the type level, so the detector must not be an
    // interface-only reader. This is the case a narrower regex would miss.
    const source = ['export interface Alpha { a: string }', 'export type Alpha = number;'].join('\n');
    expect(duplicateTypeDeclarations(source)).toEqual(['Alpha']);
  });

  it('reports each repeated name once, however many times it repeats', () => {
    // Three declarations of one name is one defect, not two. A detector that reported per
    // repetition would make the count a function of how badly a file was duplicated.
    const source = [
      'export interface Alpha { a: string }',
      'export interface Alpha { a: string }',
      'export interface Alpha { a: string }',
    ].join('\n');
    expect(duplicateTypeDeclarations(source)).toEqual(['Alpha']);
  });

  it('ignores a non-exported declaration, because only exports merge into the public surface', () => {
    // A local re-declaration is a compile error in Typescript rather than a silent merge, so it
    // needs no reading. This asserts the detector does not report a name it should not.
    const source = [
      'interface Alpha { a: string }',
      'interface Alpha { a: string }',
      'export interface Beta { b: string }',
    ].join('\n');
    expect(duplicateTypeDeclarations(source)).toEqual([]);
  });

  it('does not report a declaration indented inside a doc comment, because the pattern is line-anchored', () => {
    // This test was written asserting the opposite, and the code was right. The pattern is
    // anchored with `^` under the `m` flag, so a declaration must begin at column zero to match --
    // and prose in a doc comment is indented by ` * `. That accident is what keeps every
    // docstring in this repository out of the reading and makes the detector usable on it.
    //
    // It is asserted rather than assumed because the accident is load-bearing: a future change
    // that allowed leading whitespace would start reporting the declaration examples that
    // documentation legitimately contains, and the empty result on this module would be a
    // coincidence rather than a property.
    const indented = ['/**', ' * export interface Alpha { a: string }', ' */'].join('\n');
    expect(duplicateTypeDeclarations(indented)).toEqual([]);

    // The other direction, so the assertion above is not just "the reader returns nothing": an
    // unindented duplicate is still reported, which is the form a real defect takes.
    const unindented = [
      'export interface Alpha { a: string }',
      'export interface Alpha { a: string }',
    ].join('\n');
    expect(duplicateTypeDeclarations(unindented)).toEqual(['Alpha']);
  });

  it('uses the same definition of a declaration as the export-surface check', () => {
    // Two readers that disagree about what a declaration is would let a form slip between them.
    // This asserts the forms rather than one regex literal, because there is no third check to
    // import the pattern from: the assertion is that both files name `interface` and `type`
    // after `export`, and that both anchor it at the start of a line.
    const surface = readFileSync(
      resolve(REPO_ROOT, 'packages', 'core', 'test', 'export-surface-enumerated.test.ts'),
      'utf8',
    );
    const module = moduleSource();

    const forms = (text: string): boolean =>
      /export\\s\+\(\?:type\|interface\)/.test(text) && text.includes('^export');
    expect(forms(surface), 'export-surface-enumerated.test.ts declares its forms').toBe(true);
    expect(forms(module), 'category-derivation.ts declares the same forms').toBe(true);
    // And neither has drifted into accepting an indented declaration, which is the specific way
    // the two would come to disagree about the docstring case.
    expect(surface).not.toContain('^\\\\s*export');
    expect(module).not.toContain('^\\\\s*export');
  });
});

// ---------------------------------------------------------------------------
// N. The rule the dataset follows is stated, and the file is checked against it whole
// ---------------------------------------------------------------------------

/**
 * Finding 102 established that the dataset's `category` is derivable from its `type`, and that
 * the rule which makes it so was written down **nowhere** -- not in the dataset's `provenance`,
 * not in the extraction prompt, not in a test. It was a fact about the file that only the
 * classifier's source recorded.
 *
 * The deferred product decision is whether the prompt should state the rule. That decision is not
 * taken here. What is taken is the half that is a defect rather than a decision: a file that
 * follows a rule it does not state is a file whose rule will be broken by the next person to add
 * a sample, silently, because nothing checks it.
 *
 * So the rule is recorded in `provenance.categoryRule` -- beside `authoringRule` and
 * `annotationRule`, the two rules already stated there in the same voice -- and this group makes
 * the word "total" an assertion rather than an adjective.
 */
describe('N. the dataset states the rule it follows, and the whole file obeys it', () => {
  function provenance(): Record<string, string> {
    const parsed = JSON.parse(readFileSync(DATASET, 'utf8')) as {
      provenance: Record<string, string>;
    };
    return parsed.provenance;
  }

  it('states the category rule, and quotes the module that implements it', () => {
    // The finding quotes the dataset's own words, so the quoted text is an assertion: if the
    // rule is reworded the finding must be revisited rather than quietly measuring against a
    // standard that no longer exists. The same discipline `denial-inventory.test.ts` applies to
    // the authoring rule.
    const rule = provenance()['categoryRule'];
    expect(rule).toBeDefined();
    expect(rule).toContain('inferFaultCategory');
    expect(rule).toContain('19 of 19');
    expect(rule).toContain('self-consistency');
  });

  it('says the rule is checked over the whole file, not per sample', () => {
    // The distinction is the point of the group: a per-sample check finds a wrong label, a
    // whole-file check finds a *new* sample that was never checked. Only the second is what
    // makes adding a sample safe.
    const rule = provenance()['categoryRule'] ?? '';
    expect(rule).toContain('over the whole file');
  });

  it('records that the product decision was deliberately not taken here', () => {
    // Reading the rule off the data is not the same as telling the model the rule. The provenance
    // text must not read as though it had taken that decision, and neither must this suite.
    const rule = provenance()['categoryRule'] ?? '';
    expect(rule).toContain('product decision');
    expect(rule).toMatch(/deliberately not taken/);
  });

  it('keeps the rule beside the two rules already stated, in the same container', () => {
    // Not a separate file or a comment: a reader who finds `authoringRule` and `annotationRule`
    // must find the third rule in the same place, or the file has three rules in two homes.
    const keys = Object.keys(provenance());
    expect(keys).toContain('authoringRule');
    expect(keys).toContain('annotationRule');
    expect(keys).toContain('categoryRule');
  });

  it('derives a real category for every sample in the file, so the rule is total over it', () => {
    // The assertion the rule's text promises. `assessDerivability` reports this, and this test
    // states it independently of any reading's share, so a reading that stopped excluding
    // undefined types could not move the claim.
    const members = new Set<string>(FAULT_CATEGORIES);
    for (const sample of loadDataset()) {
      const derived = inferFaultCategory(sample.expected.type);
      expect(members.has(derived), `${sample.id}: ${sample.expected.type} -> ${derived}`).toBe(true);
    }
  });

  it('never derives `unknown` for a sample in this file, which is the escape hatch staying unused', () => {
    // `unknown` is a member of the union, so the totality test above would accept it. It is the
    // taxonomy's escape hatch for "unclassified", and a golden sample labelled `unknown` would
    // mean the file had been shipped with a fault it cannot name. Asserting its absence keeps
    // `unknown` out of the measured distribution rather than merely legal in it.
    const unknowns = loadDataset()
      .filter((sample) => inferFaultCategory(sample.expected.type) === 'unknown')
      .map((sample) => sample.id);
    expect(unknowns).toEqual([]);
  });

  it('agrees with the labelled category for every sample, counted per sample and not in aggregate', () => {
    // The whole-file form of finding 102's result: nineteen individual equalities rather than
    // one equality of two counts. A reading that reported 19 of 19 while transposing two samples
    // would pass the aggregate and fail this.
    for (const sample of loadDataset()) {
      expect(
        inferFaultCategory(sample.expected.type),
        `${sample.id}: labelled ${sample.expected.category}`,
      ).toBe(sample.expected.category);
    }
  });

  it('fails on a sample whose type does not derive its label, so the whole-file claim can break', () => {
    // The control: the same loop as above, over a file with one label moved to a category its
    // type does not derive. If this stayed green the assertion above would be checking nothing.
    const broken = loadDataset().map((sample) =>
      sample.id === 'resource-cpu-saturation-checkout'
        ? { ...sample, expected: { ...sample.expected, category: 'dependency' } }
        : sample,
    );
    const disagreements = broken.filter(
      (sample) => inferFaultCategory(sample.expected.type) !== sample.expected.category,
    );
    expect(disagreements.map((sample) => sample.id)).toEqual(['resource-cpu-saturation-checkout']);
  });

  it('fails on a sample whose type derives nothing, so the totality claim can break', () => {
    // The other control. Totality is the weaker-sounding of the two claims and the easier to
    // lose: a new sample typed with a phrase the table does not know would still be counted in
    // any share that forgot to exclude it.
    const members = new Set<string>(FAULT_CATEGORIES);
    const broken = loadDataset().map((sample) =>
      sample.id === 'network-service-port-misconfig'
        ? { ...sample, expected: { ...sample.expected, type: 'quantum-entanglement-drift' } }
        : sample,
    );
    const undefinedTypes = broken
      .map((sample) => inferFaultCategory(sample.expected.type))
      .filter((category) => !members.has(category));
    // `unknown` IS a member, so the filter above does not catch it -- which is exactly why the
    // separate `unknown` assertion exists. This control is about a type the table cannot place
    // at all producing a category outside the union, and it is stated in those terms.
    expect(undefinedTypes).toEqual([]);
    expect(inferFaultCategory('quantum-entanglement-drift')).toBe('unknown');
    expect(members.has('unknown')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// O. Downstream agreement -- whether anything depends on the field being predicted
// ---------------------------------------------------------------------------

/**
 * The four real consumers, with the `branches` flag each one's source actually has.
 *
 * Two branch and two project, and the distinction is the entire content of this reading. The two
 * that do not branch index a total `Record<FaultCategory, string>` with no guard
 * (`export/itbench.ts:119`, `export/cloudopsbench.ts:79`), so no category can change their
 * control flow; a reading that counted them as evidence would report a two-consumer result as a
 * four-consumer result. That overstatement was made in the first draft of this section's prose and
 * is corrected here in a test rather than only in a comment.
 *
 * `validity`'s outcome mirrors `FAULT_EXPECTATIONS[fault.category]` -- a miss returns
 * `unverifiable`, so a category outside the table silently removes a fault's verifiability.
 * `rcaeval`'s mirrors the RE3 filter, which skips a case unless the category is `code`.
 */
const REAL_CONSUMERS: CategoryConsumer[] = [
  {
    name: 'gates/validity.ts:148',
    branches: true,
    outcome: (category) =>
      ['resource', 'network', 'runtime', 'middleware', 'code', 'config', 'dependency', 'unknown'].includes(
        category,
      )
        ? 'checked'
        : 'unverifiable',
  },
  { name: 'export/rcaeval.ts:148', branches: true, outcome: (c) => (c === 'code' ? 'kept' : 'skipped') },
  { name: 'export/itbench.ts:119', branches: false, outcome: (c) => `label:${c}` },
  { name: 'export/cloudopsbench.ts:79', branches: false, outcome: (c) => `taxonomy:${c}` },
];

describe('O. downstream agreement measures what depends on the predicted field', () => {
  it('grades every sample the dataset labels', () => {
    const reading = assessDownstreamAgreement(datasetSamples(), REAL_CONSUMERS);
    expect(reading.graded).toBe(19);
  });

  it('moves no branching consumer on any sample of this corpus', () => {
    // The result: the derivation and the labels agree everywhere the branching consumers look, so
    // the field is derivable away without moving them. This is the figure the verdict governs.
    const reading = assessDownstreamAgreement(datasetSamples(), REAL_CONSUMERS);
    expect(reading.moved).toEqual([]);
    expect(reading.inert).toBe(19);
    expect(reading.share).toBe(1);
    expect(reading.lossless).toBe(true);
  });

  it('reports four consumers and says how many of them branch', () => {
    // The count that must not be inflated. `consumers.length` is 4 and `branches` is true on two
    // of them; a reader who takes the first number as the size of the evidence is wrong, and the
    // per-consumer flag is what makes that checkable rather than a claim in a comment.
    const reading = assessDownstreamAgreement(datasetSamples(), REAL_CONSUMERS);
    expect(reading.consumers).toHaveLength(4);
    expect(reading.consumers.filter((c) => c.branches)).toHaveLength(2);
    expect(reading.consumers.filter((c) => !c.branches).map((c) => c.name)).toEqual([
      'export/itbench.ts:119',
      'export/cloudopsbench.ts:79',
    ]);
  });

  it('does not separate, and the reason names the floor it fell below', () => {
    // The verdict, and the honest reading of it. Under the alternative derivation -- the
    // pre-finding-95 substring reading, which this codebase shipped -- `feature-flag-misconfiguration`
    // derives `middleware` where the label says `config`, so `validity` moves. That is 1 of 19,
    // below the floor, so the reading cannot tell a derived category from a mis-derived one and
    // the lossless figure above is self-consistency rather than a result.
    const reading = assessDownstreamAgreement(datasetSamples(), REAL_CONSUMERS);
    expect(reading.separates).toBe(false);
    expect(reading.floor).toBe(DOWNSTREAM_FLOOR);
    expect(reading.reason).toContain('cannot tell a derived category from a mis-derived one');
  });

  it('separates on the disagreement sample alone, because one of one is above the floor', () => {
    // This test was written asserting `separates: false` and the code was right to disagree. The
    // share is a *fraction*, so the same single sample that contributes 1 of 19 (0.0526) to the
    // corpus contributes 1 of 1 (1.0) here -- above the floor. The reading separates, and the
    // contrast between the two runs of the same sample is the clearest statement of what the
    // floor does: it is not a property of the sample, it is a property of the corpus the sample
    // was counted in.
    //
    // That is worth keeping as a test rather than as a correction to the prose. A reader who took
    // "the alternative moves one sample" as sufficient for "below the floor" would be wrong in
    // exactly this direction, and the assertion names the sample so the arithmetic cannot drift.
    const one = assessDownstreamAgreement(
      [
        {
          sampleId: 'feature-flag-misconfiguration',
          type: 'feature-flag-misconfiguration',
          category: 'config',
        },
      ],
      REAL_CONSUMERS,
    );
    // The sample's own derivation agrees, so it is inert under the actual reading...
    expect(one.moved).toEqual([]);
    expect(one.lossless).toBe(true);
    expect(one.graded).toBe(1);
    // ...and the alternative moves it, which on a one-sample corpus is above the floor.
    expect(one.separates).toBe(true);
    expect(one.reason).toContain('1 of 1');
    expect(one.reason).toContain('can tell a derived category from a mis-derived one');

    // The same sample in the corpus is below the floor. Both figures are asserted together,
    // because either alone is compatible with a `separates` that ignores the denominator.
    const corpus = assessDownstreamAgreement(datasetSamples(), REAL_CONSUMERS);
    expect(corpus.separates).toBe(false);
    expect(corpus.reason).toContain('1 of 19');
  });

  it('reaches the separating branch with a corpus the alternative reading moves throughout', () => {
    // The pair control for `separates`, the same discipline group J applies to
    // `assessDiscriminatingPower`. Without it a hardcoded `false` would be indistinguishable from
    // the honest answer on this corpus -- which is exactly how injection AM survived the first
    // battery and why this control exists.
    const reading = assessDownstreamAgreement(
      [
        { sampleId: 'a', type: 'feature-flag-misconfiguration', category: 'config' },
        { sampleId: 'b', type: 'redis-latency', category: 'network' },
      ],
      REAL_CONSUMERS,
    );
    // Both types are ones the substring reading classifies differently from these labels, so
    // `validity` moves on both and the honest verdict is `true`.
    expect(reading.separates).toBe(true);
    expect(reading.reason).toContain('can tell a derived category from a mis-derived one');
  });

  it('reports the samples a consumer does move, with the consumer that moved', () => {
    // The populated case, with a consumer whose outcome is deliberately sensitive. This is the
    // shape a real disagreement would take, and it asserts that `moved` names *which* consumer
    // moved -- a count alone would not tell a reader whether the fault was in `validity` or in
    // the RE3 filter.
    const sensitive: CategoryConsumer[] = [
      { name: 'sensitive', branches: true, outcome: (c) => c },
    ];
    const reading = assessDownstreamAgreement(
      [{ sampleId: 'x', type: 'container-crash', category: 'middleware' }],
      sensitive,
    );
    expect(reading.moved).toHaveLength(1);
    expect(reading.moved[0]?.sampleId).toBe('x');
    expect(reading.moved[0]?.labelled).toBe('middleware');
    expect(reading.moved[0]?.derived).toBe('runtime');
    expect(reading.moved[0]?.moved).toEqual(['sensitive']);
    expect(reading.moved[0]?.inert).toBe(false);
    expect(reading.lossless).toBe(false);
    expect(reading.inert).toBe(0);
  });

  it('excludes a sample blank in either field from the denominator', () => {
    // The same rule every other reader in this module follows: a field that was not present was
    // not read, and counting it would let an absent value move a figure.
    const reading = assessDownstreamAgreement(
      [
        { sampleId: 'blank-type', type: '   ', category: 'config' },
        { sampleId: 'blank-category', type: 'container-crash', category: '  ' },
        { sampleId: 'graded', type: 'container-crash', category: 'runtime' },
      ],
      REAL_CONSUMERS,
    );
    expect(reading.graded).toBe(1);
    expect(reading.inert).toBe(1);
    expect(reading.share).toBe(1);
  });

  it('returns a zero share, not a vacuous one, when nothing is graded', () => {
    const reading = assessDownstreamAgreement([], REAL_CONSUMERS);
    expect(reading.graded).toBe(0);
    expect(reading.share).toBe(0);
    expect(reading.lossless).toBe(true);
    // And the refutation over an empty corpus must not claim separation it cannot have measured.
    expect(reading.separates).toBe(false);
  });

  it('treats a consumer list as evidence only through the branching flag, not through its length', () => {
    // With no branching consumer the reading cannot move, and the test records that this is a
    // property of the consumer set rather than a finding about the derivation. This is the trap
    // the four-consumer count invites, stated as an input rather than as prose.
    const projectionsOnly: CategoryConsumer[] = [
      { name: 'p1', branches: false, outcome: (c) => `x:${c}` },
      { name: 'p2', branches: false, outcome: (c) => `y:${c}` },
    ];
    const reading = assessDownstreamAgreement(datasetSamples(), projectionsOnly);
    expect(reading.consumers).toHaveLength(2);
    expect(reading.moved).toEqual([]);
    expect(reading.lossless).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P. The report carries the downstream verdict, and never without its refutation
// ---------------------------------------------------------------------------

describe('P. the report carries the downstream reading beside its verdict', () => {
  function report(consumers?: CategoryConsumer[]) {
    return buildCategoryDerivationReport({
      samples: datasetSamples(),
      misses: runMisses(CURRENT_RUN).misses,
      runs: RECORDED_RUNS,
      adversarialWords: adversarialWords(),
      ...(consumers === undefined ? {} : { consumers }),
    });
  }

  it('carries the reading when consumers are supplied', () => {
    const built = report(REAL_CONSUMERS);
    expect(built.downstream).toEqual(assessDownstreamAgreement(datasetSamples(), REAL_CONSUMERS));
  });

  it('omits it rather than defaulting to a vacuous agreement when none are supplied', () => {
    // An absent consumer list is not evidence of agreement. The field is optional so that a
    // caller with no consumers asserts nothing, instead of receiving a `lossless: true` it did
    // not measure.
    expect(report().downstream).toBeUndefined();
  });

  it('says in the caveats that the downstream question was not asked', () => {
    // The omitted case must be visible in the prose too, or a reader of the honesty list would
    // take the conformance discussion as covering the consumers.
    const honesty = report().honesty.join('\n');
    expect(honesty).toContain('not asked at all');
  });

  it('records the lossless verdict with the reason it is not a result', () => {
    const honesty = report(REAL_CONSUMERS).honesty.join('\n');
    expect(honesty).toContain('change nothing observable');
    expect(honesty).toContain('tested against nothing');
  });

  it('counts the non-branching consumers as the non-evidence they are', () => {
    // The correction that a two-consumer result is not a four-consumer result, stated where a
    // reader of the report will meet it.
    const honesty = report(REAL_CONSUMERS).honesty.join('\n');
    expect(honesty).toContain('index a total map with no guard');
  });

  it('puts the downstream verdict in the caveat list, which is the field that is non-empty by construction', () => {
    // Placement, not merely presence: the verdict has to reach a reader through `honesty`, which
    // is the field a test already asserts is never shorter than four sentences.
    const built = report(REAL_CONSUMERS);
    expect(built.honesty.length).toBeGreaterThanOrEqual(5);
    expect(built.honesty.some((line) => line.includes('Downstream agreement'))).toBe(true);
  });

  it('states the separating direction when a consumer does move, which this corpus cannot reach', () => {
    // The corpus is lossless, so the separating sentence of `downstreamCaveat` is unreachable
    // through the report builder. A constructed reading supplies it, because leaving the branch
    // uncovered would mean a module that reports its coverage with a line no input reaches --
    // the same defect group J exists to close, one level up.
    const reading: DownstreamReading = {
      consumers: [
        { name: 'validity', branches: true },
        { name: 'itbench', branches: false },
      ],
      graded: 2,
      inert: 1,
      moved: [
        {
          sampleId: 'a',
          type: 'feature-flag-misconfiguration',
          labelled: 'config',
          derived: 'middleware',
          moved: ['validity'],
          inert: false,
        },
      ],
      share: 0.5,
      lossless: false,
      separates: true,
      floor: DOWNSTREAM_FLOOR,
      reason: 'constructed',
    };
    const caveat = downstreamCaveat(reading).join('\n');
    expect(caveat).toContain('1 samples move');
    expect(caveat).toContain('does separate and the verdict rests on it');
    expect(caveat).toContain('Separating is not the same as agreeing');
    // And it must NOT carry the lossless sentence, which is the failure a single parameterised
    // template would produce: the affirmative case printed under a refutation.
    expect(caveat).not.toContain('tested against nothing');
  });

  it('states the lossless direction without the separating sentence', () => {
    // The mirror of the test above, so the two directions are pinned against each other rather
    // than each against a constant. A helper that returned a fixed string would satisfy one and
    // fail the other.
    const reading = assessDownstreamAgreement(datasetSamples(), REAL_CONSUMERS);
    const caveat = downstreamCaveat(reading).join('\n');
    expect(caveat).toContain('tested against nothing');
    expect(caveat).not.toContain('does separate and the verdict rests on it');
    // The names are interpolated rather than summarised, so a reader can see which consumers the
    // figure is about -- and, in the same sentence, which of them were never going to move.
    expect(caveat).toContain('gates/validity.ts:148');
    expect(caveat).toContain('export/itbench.ts:119');
    expect(caveat).toContain('out of 4 that read it');
  });
});
