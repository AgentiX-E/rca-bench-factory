#!/usr/bin/env node
/**
 * Classify the `type` misses of a fault-extraction run.
 *
 * Finding 69 classified `category`'s eight misses one by one and concluded that
 * a legal vocabulary member was chosen, so the failure was *choosing* rather than
 * *formatting*. Finding 78 then argued `type` has no structural ceiling behind it
 * and called its 4/19 a model-accuracy figure. **Neither read the `type` answers.**
 * This script takes that reading.
 *
 * The question is narrow and decidable. When the model's `type` differs from the
 * expected slug, is it a form variant of that slug -- which `normalizeFaultType`
 * should already have folded -- or a different mechanism named at the same level?
 *
 *   form-variant         the scorer rejected an answer it should have accepted.
 *                        That is a BUG in this repository, not a model failure.
 *   shares-token         the answer names the same subject with more words
 *                        (`cpu-saturation` -> `cpu-throttling` shares `cpu`).
 *                        A near miss: capability, not a defect.
 *   different-mechanism  the answer names something else entirely
 *                        (`network-loss` -> `egress-packet-drop`). Capability.
 *
 * Only the first class is actionable in this repository, which is why the
 * partition exists rather than a single "wrong" count.
 *
 * Usage:
 *   node scripts/probe-type-misses.mjs [--predictions <path>] [--json]
 *
 * With no `--predictions`, the recorded misses from run `9932e766c` are used.
 * They live in the CI annotation rather than in the repository, so they are
 * transcribed in this file with their run named -- a figure that cannot be
 * re-derived is worth less than one whose provenance is stated, and requiring a
 * live LLM key to read it would make the reading unavailable exactly when the
 * quota is exhausted.
 *
 * Exit codes:
 *   0  the partition is complete and no form variant was found
 *   1  the input could not be read
 *   2  a form variant was found -- the scorer has a defect and this is a bug
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The reader is imported from the built package rather than reproduced here.
// Reproducing it was the earlier design and it is the defect this script is being
// repaired for: the classifier reproduced `normalizeFaultType` on purpose (a
// classifier whose definition moves with the artefact it classifies cannot report
// on that artefact) and that reasoning does not extend to the *reader*. The
// reader has one correct implementation and it is checked against the recorded
// annotation by its own tests; a second copy here would be a second thing to keep
// correct, and the failure would be silent -- a stale copy reads successfully.
import { adjudicateAll, countAdjudications, parseMissDetail } from '../packages/core/dist/index.js';
import {
  assessCounterEvidence,
  countCounterEvidence,
  counterEvidenceReport,
} from '../packages/core/dist/index.js';
// And the denial inventory, imported for the same reason: it has one correct
// implementation and the probe is a reader of it. Finding 98's block below is the
// only consumer, and it is what turns "the text carries counter-evidence" into "the
// answer the model gave has no term in the text".
import { assessCategoryDenial, buildDenialInventory } from '../packages/core/dist/index.js';
// And the agreement reading, which needs nothing from the dataset: it reads the model's own
// `component` against the model's own `category`. Finding 99 is the mechanism finding 98
// could not reach, and the reason it needs no incident text is that it is an internal
// consistency check on the answer.
import { assessComponentAgreement, buildAgreementInventory } from '../packages/core/dist/index.js';

// The control for the block above. `7 of 7` was reported without a baseline; this is the
// measurement it needed, and it refutes the figure rather than supporting it.
import { buildAgreementContrast } from '../packages/core/dist/index.js';

// And the category rule the dataset uses, with its discriminating power measured. Finding
// 101 closed by saying the next step is a decision about whether the fix belongs in the
// dataset's authoring rule or in the model's prompt, and that the decision needs the
// labelling question answered first. This block is the answer: the dataset derives its own
// `category` from its own `type` on 19 of 19, so the derivation is the authoring rule --
// and, printed above every figure, the reading that reports it cannot separate the model
// from a correct answerer (2 of 19, below the floor of 0.2).
import {
  buildCategoryDerivationReport,
  assessDatasetConformance,
  assessDerivability,
  assessDownstreamAgreement,
  assessDiscriminatingPower,
  duplicateTypeDeclarations,
  CATEGORY_CONSUMERS,
} from '../packages/core/dist/index.js';
// And the table `validity.expectedSignalsFor` looks categories up in, imported rather than
// copied so that the consumer mirror below cannot go stale: a category added to the table would
// otherwise leave the probe asserting that the consumer misses.
import { FAULT_EXPECTATIONS } from '../packages/core/dist/gates/validity.js';
import {
  AIOPS2025_CATEGORIES,
  AIOPS2025_CATEGORY,
  checkAioPs2025Structure,
} from '../packages/core/dist/index.js';
import { FAULT_CATEGORIES } from '../packages/core/dist/ir/types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DATASET = resolve(REPO, 'golden-master', 'fault-extraction', 'samples.json');

/**
 * The emitted `fault_category` vocabulary, read as figures that move independently.
 *
 * `admitted` is the size of the declared domain and `stray` counts the words no source can
 * account for. They are two figures rather than one because the two defects they detect are
 * opposite: a union that lost its IR half shrinks `admitted` while leaving `stray` at zero,
 * and a vocabulary widened past its sources leaves `admitted` unchanged and moves `stray`.
 * A single count would let either defect mask the other.
 *
 * `outsideIrVocabulary` is published because it is the figure that says the table is doing
 * work at all: if it were zero the vocabulary would be describable by `FAULT_CATEGORIES`
 * alone, and the union would be a longer way of writing the IR's own list.
 */
function readEmittedCategoryVocabulary() {
  const irWords = new Set(FAULT_CATEGORIES);
  const tableImage = new Set(Object.values(AIOPS2025_CATEGORY));
  const producible = new Set([...irWords, ...tableImage]);
  return {
    admitted: AIOPS2025_CATEGORIES.length,
    distinct: new Set(AIOPS2025_CATEGORIES).size,
    inIrVocabulary: AIOPS2025_CATEGORIES.filter((word) => irWords.has(word)).length,
    outsideIrVocabulary: AIOPS2025_CATEGORIES.filter((word) => !irWords.has(word)).length,
    stray: AIOPS2025_CATEGORIES.filter((word) => !producible.has(word)).length,
  };
}

/**
 * What `checkAioPs2025Structure` does with a `fault_category` outside the vocabulary.
 *
 * Two payloads that differ in one field: one carrying a word the emitter can produce, one
 * carrying a word it cannot. Both figures are published because a check that rejected
 * *everything* would satisfy a requirement that only read `rejected`, so `acceptedLegal` is
 * the control that keeps the reading from being satisfiable by a broken check.
 *
 * The payload is assembled here rather than exported, because the example corpus carries no
 * out-of-vocabulary category and therefore cannot reach the branch at all.
 */
function readScorerCategoryVerdict() {
  const line = (faultCategory) => ({
    uuid: 'case-001',
    fault_category: faultCategory,
    fault_type: 'network-delay',
    instance_type: 'service',
    service: 'order',
    instance: 'order',
    start_time: '2026-09-06T00:00:00.000Z',
    end_time: '2026-09-06T00:20:00.000Z',
    key_metrics: [],
    key_observations: { log: [], metric: [], trace: [] },
    fault_description: 'a probe payload',
  });
  const input = JSON.stringify([
    {
      uuid: 'case-001',
      description: 'a probe payload',
      start_time: '2026-09-06T00:00:00.000Z',
      end_time: '2026-09-06T00:20:00.000Z',
    },
  ]);
  const refuses = (faultCategory) => {
    const report = checkAioPs2025Structure({
      'input.json': input,
      'groundtruth.jsonl': `${JSON.stringify(line(faultCategory))}\n`,
    });
    return report.checks.find((c) => c.id === 'groundtruth-shape')?.passed === false;
  };
  return {
    rejected: refuses('ghost-category') ? 1 : 0,
    acceptedLegal: refuses('network') ? 0 : 1,
  };
}

/**
 * The consumers of `expected.category`, imported from the module that owns the census.
 *
 * This list used to be written out here, and the same four entries were written out again in
 * `probe-category-derivation.mjs`. Finding 104 moved the census into `category-derivation.ts`
 * because two hand-maintained copies were both missing `export/aiops2025.ts:76` -- a consumer
 * reached on 16 of the 19 corpus samples -- and because the two-valued `branches` flag had no way
 * to record what that consumer does. The census now carries a three-way `role` and an `evidence`
 * count, and this probe reads them.
 */
/**
 * The `type` misses of a recorded run, read from the recorded annotation.
 *
 * Each fixture is the verbatim annotation body of the run it names, with escapes
 * intact. Reading them through `parseMissDetail` rather than carrying a
 * transcription is the repair for the defect this script caused: it used to hold
 * a copy of run `9932e766c`'s rows inline, exact against that run, and a later
 * reading quoted those rows as the answers of run `567118aea`. Eight of fourteen
 * rows disagreed with the annotation and two rows were attributed a `type` miss
 * that their run assigned to `component`.
 *
 * A figure that cannot be re-derived is worth less than one whose provenance is
 * stated -- so the provenance is stated, by deriving it.
 */
const RUNS = {
  /** The current format: rows joined with U+001F. type=5/19. */
  '567118aea': 'miss-detail-567118aea.txt',
  /** Before finding 70 changed the separator: rows joined with a space. type=4/19. */
  '9932e766c': 'miss-detail-9932e766c.txt',
};

/** The run this script reads by default: the most recent recorded one. */
const DEFAULT_RUN = '567118aea';

/** Read a recorded run's `type` misses. Throws rather than returning an empty set. */
function recordedTypeMisses(run) {
  const file = RUNS[run];
  if (file === undefined) {
    throw new Error(
      `unknown run '${run}'; recorded runs are ${Object.keys(RUNS).join(', ')}`,
    );
  }
  const body = readFileSync(resolve(REPO, 'packages', 'core', 'test', 'fixtures', file), 'utf8');
  return {
    run,
    rows: parseMissDetail(body)
      .filter((row) => row.field === 'type')
      .map((row) => [row.sampleId, row.expected, row.actual ?? '(omitted)']),
  };
}

/**
 * Read a recorded run's `category` misses.
 *
 * The same fixture as `recordedTypeMisses`, filtered on a different field. Both
 * fields are in one annotation body, so reading them through one parser is what
 * keeps the two blocks agreeing about which run they describe -- finding 92's
 * defect was a block quoting rows from a run it did not name.
 */
function recordedCategoryMisses(run) {
  const file = RUNS[run];
  if (file === undefined) {
    throw new Error(
      `unknown run '${run}'; recorded runs are ${Object.keys(RUNS).join(', ')}`,
    );
  }
  const body = readFileSync(resolve(REPO, 'packages', 'core', 'test', 'fixtures', file), 'utf8');
  return parseMissDetail(body).filter((row) => row.field === 'category');
}

/**
 * Build the `category` block: the misses, the reading for each, and the figures.
 *
 * A missed sample whose id is not in the golden dataset is reported in
 * `unresolved` and excluded from the figures rather than skipped. Skipping it would
 * make the denominators depend on the join succeeding, which is the shape of error
 * that turns a partial join into a confident percentage.
 */
function categoryEvidence(run, rows) {
  const goldenPath = resolve(REPO, 'golden-master', 'fault-extraction', 'samples.json');
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
  if (!Array.isArray(golden.samples)) {
    throw new Error(`${goldenPath} carries no samples array`);
  }
  const textById = new Map(golden.samples.map((sample) => [sample.id, sample.incidentText]));
  const missedIds = new Set(rows.map((row) => row.sampleId));

  const unresolved = rows.filter((row) => !textById.has(row.sampleId)).map((row) => row.sampleId);

  // Every graded sample, not only the misses: precision needs the texts the model
  // got *right*, because a phrase that appears in a correct answer is a false
  // positive and the block would otherwise report only its hits.
  const graded = golden.samples
    .filter((sample) => typeof sample.incidentText === 'string')
    .map((sample) => ({
      sampleId: sample.id,
      incidentText: sample.incidentText,
      missed: missedIds.has(sample.id),
    }));

  const report = counterEvidenceReport(graded);
  const readings = rows.map((row) => {
    const text = textById.get(row.sampleId);
    const reading = assessCounterEvidence(text ?? '');
    return {
      sampleId: row.sampleId,
      expected: row.expected,
      actual: row.actual,
      verdict: reading.verdict,
      phrase: reading.phrase,
    };
  });

  // The three values are counted over the *graded* texts above, where the third
  // value never occurs -- every golden sample has text, so `not-assessable` would
  // be reported as 0 and stay 0 no matter what the reader did with a missing input.
  // That is an unobservable branch, and an unobservable branch is one the battery
  // cannot defend (v1.35's injection N is the recorded case: it SURVIVED because
  // the figure it moved was never the deciding one).
  //
  // So the empty and whitespace-only cases are probed explicitly, alongside the
  // real texts. These are the inputs the third value exists for, and reporting them
  // is what makes "no text to read" distinguishable from "text with no phrase" in
  // the output rather than only in the module's docstring.
  const synthetic = ['', '   \n\t '].map((text) => assessCounterEvidence(text));
  const syntheticCounts = countCounterEvidence(synthetic);
  const realReadings = rows.map((row) => assessCounterEvidence(textById.get(row.sampleId) ?? ''));
  const realCounts = countCounterEvidence(realReadings);

  return {
    run,
    misses: rows.length,
    unresolved,
    // The synthetic readings are folded into the same counts, so the reported
    // total is what the reader was actually asked, not what the dataset happened
    // to contain.
    counts: {
      present: realCounts.present,
      absent: realCounts.absent,
      notAssessable: realCounts.notAssessable + syntheticCounts.notAssessable,
    },
    ...report,
    readings,
    syntheticNotAssessable: syntheticCounts.notAssessable,
  };
}


/**
 * Build the `denial` block: of the misses, how many were answered with a category
 * the incident text does not carry.
 *
 * The block above asks a question about the *text* -- does it carry counter-evidence.
 * This one asks a question about the *answer* -- is the category the model chose
 * supported by the text at all. They are different measurements, and finding 98 is
 * the record of why the difference matters: the first was expected to explain the
 * second and, measured, it does not. Four of the five reached misses were answered
 * with a category the text never mentions; only one was answered with a category the
 * text names in order to deny.
 *
 * The reading is three-valued per the module: `denied-only`, `also-asserted`,
 * `absent`, and `not-assessable` for a blank input. All four are counted, because a
 * value that is never observed is a value the battery cannot defend.
 *
 * The misses are read against the category the model **answered**, not the category
 * that was expected. That is the whole point: `expected` is what the answer should
 * have been and the text will of course carry it. Reading the expected category would
 * report `also-asserted` for every sample and measure nothing.
 *
 * The control is reported separately. `resource-cpu-saturation-checkout` is the only
 * sample that both carries a denial and was answered correctly, and it reads
 * `also-asserted` -- so the reading does not simply flag every denial it sees.
 */
function denialEvidence(run, rows) {
  const goldenPath = resolve(REPO, 'golden-master', 'fault-extraction', 'samples.json');
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
  if (!Array.isArray(golden.samples)) {
    throw new Error(`${goldenPath} carries no samples array`);
  }
  const byId = new Map(golden.samples.map((sample) => [sample.id, sample]));
  const missedIds = new Set(rows.map((row) => row.sampleId));
  const unresolved = rows.filter((row) => !byId.has(row.sampleId)).map((row) => row.sampleId);

  const readings = rows
    .filter((row) => byId.has(row.sampleId))
    .map((row) => {
      const sample = byId.get(row.sampleId);
      const reading = assessCategoryDenial({
        text: sample.incidentText,
        category: row.actual,
      });
      return {
        sampleId: row.sampleId,
        expected: row.expected,
        answered: row.actual,
        verdict: reading.verdict,
        markers: reading.markers,
      };
    });

  // The corpus partition, each sample read against its own *expected* category.
  //
  // This is the denominator the finding has to state: of 19 samples, how many carry
  // their own answer only as a denial. It is deliberately not restricted to the
  // misses -- a reading that only ever looks at the failures cannot say whether the
  // failures are unusual.
  const inventory = buildDenialInventory(
    golden.samples
      .filter((sample) => typeof sample.incidentText === 'string')
      .map((sample) => ({
        sampleId: sample.id,
        text: sample.incidentText,
        category: sample.expected?.category ?? '',
      })),
  );

  // The blank inputs, probed explicitly for the reason the counter-evidence block
  // probes them: the dataset has no blank text, so the fourth value would otherwise
  // be reported as 0 forever and no mutation of it could be observed.
  const synthetic = ['', '   \n\t '].map((text) =>
    assessCategoryDenial({ text, category: 'resource' }).verdict,
  );

  // The control, looked up by id rather than by position so a dataset reorder does
  // not silently move it.
  const controlId = 'resource-cpu-saturation-checkout';
  const controlSample = byId.get(controlId);
  const control = controlSample
    ? {
        sampleId: controlId,
        expected: controlSample.expected.category,
        ...assessCategoryDenial({
          text: controlSample.incidentText,
          category: controlSample.expected.category,
        }),
      }
    : null;

  return {
    run,
    misses: rows.length,
    unresolved,
    graded: inventory.graded,
    counts: {
      deniedOnly: inventory.deniedOnly,
      alsoAsserted: inventory.alsoAsserted,
      absent: inventory.absent,
      notAssessable: inventory.notAssessable + synthetic.filter((v) => v === 'not-assessable').length,
    },
    deniedOnlyShare: inventory.deniedOnlyShare,
    unsupportedMisses: readings.filter(
      (r) => r.verdict === 'absent' || r.verdict === 'denied-only',
    ).length,
    answeredCategoryAbsent: readings.filter((r) => r.verdict === 'absent').length,
    answeredCategoryDeniedOnly: readings.filter((r) => r.verdict === 'denied-only').length,
    control,
    readings,
    syntheticNotAssessable: synthetic.filter((v) => v === 'not-assessable').length,
  };
}

/**
 * Build the `agreement` block: is the category a miss emitted derivable from the component
 * that same answer named?
 *
 * This is the block that answers the question the `denial` block leaves open. That block
 * measures the answered category's absence from the **incident text**, which admits two
 * explanations -- the model could not read the incident, or it read it and mislabelled the
 * category. Both produce the same figure.
 *
 * The `component` field separates them, because it is the model's **own** output, produced by
 * the same call from the same text. If the category were read off the mechanism the model
 * identified, the answered category's vocabulary would appear in the component it named.
 *
 * It reads only the recorded annotation, so a sample missing a `component` row is reported in
 * `unassessableIds` rather than counted either way. `middleware-kafka-consumer-lag` is the
 * live instance: it has no component row because the model answered the component *correctly*
 * there, which makes it the counter-case for the finding rather than a silent pass.
 */
function agreementEvidence(run, rows) {
  const components = new Map();
  for (const row of rows) {
    if (row.field === 'component') components.set(row.sampleId, row.actual);
  }

  const samples = rows
    .filter((row) => row.field === 'category')
    .map((row) => ({
      sampleId: row.sampleId,
      category: row.actual,
      component: components.get(row.sampleId) ?? null,
    }));

  const inventory = buildAgreementInventory(samples);

  const readings = samples
    .filter((sample) => sample.component !== null)
    .map((sample) => {
      const reading = assessComponentAgreement({
        component: sample.component,
        category: sample.category,
      });
      return {
        sampleId: sample.sampleId,
        answered: sample.category,
        component: sample.component,
        verdict: reading.verdict,
        terms: reading.terms,
      };
    });

  // The branches the recorded run cannot reach, exercised explicitly.
  //
  // `buildAgreementInventory` filters out the samples with no component *before* calling the
  // reading, so on this fixture the reading's own blank-input branch is never executed -- and
  // neither is its agreeing branch, because all seven recorded misses disagree. Both are
  // real branches with real verdicts, and a branch no input reaches is a branch the battery
  // cannot defend: injections Z and AA were written against exactly these two and both
  // SURVIVED, which is how this was found.
  //
  // So the empty component and a component that genuinely supports its category are probed
  // alongside the real ones. This is the same repair finding 96's block needed for U's
  // `notAssessable` baseline, and it is recorded here rather than rediscovered: a figure at
  // its floor is a figure no mutation can move.
  const synthetic = [
    { sampleId: '(empty component)', component: '', category: 'middleware' },
    { sampleId: '(component supports it)', component: 'the session Redis cache', category: 'middleware' },
  ].map((s) => ({ ...s, ...assessComponentAgreement(s) }));

  return {
    run,
    ...inventory,
    readings,
    synthetic,
    // Counted apart from `inventory`, which is about the recorded run. Folding them in would
    // make `graded` and `disagrees` describe a set that is not the annotation, and the whole
    // point of the denominator is that it is the rows the run actually recorded.
    syntheticCounts: {
      agrees: synthetic.filter((s) => s.verdict === 'agrees').length,
      disagrees: synthetic.filter((s) => s.verdict === 'disagrees').length,
      notAssessable: synthetic.filter((s) => s.verdict === 'not-assessable').length,
    },
  };
}

/**
 * The control for the `agreement` block: run the same reading over components that are known to be right.
 *
 * The agreement block reported `7 of 7` and had no baseline, so the figure had nothing to be
 * compared against. This reads the golden dataset's own `expected.component` values -- right by
 * construction -- with the identical reading, and reports both sides plus whether the
 * difference is load-bearing.
 *
 * The predicted side is taken from the agreement block rather than transcribed again: two
 * transcriptions of the same run is two chances to disagree with each other, and finding 96
 * already recorded what two instruments sharing one name costs.
 */
function baselineEvidence(agreement) {
  if (agreement === null) return null;

  const parsed = JSON.parse(readFileSync(DATASET, 'utf8'));
  const expected = parsed.samples.map((s) => ({
    sampleId: s.id,
    category: s.expected.category,
    component: s.expected.component,
  }));

  const predicted = agreement.readings.map((r) => ({
    sampleId: r.sampleId,
    category: r.answered,
    component: r.component,
  }));

  const contrast = buildAgreementContrast({ expected, predicted });

  return {
    expected: {
      graded: contrast.expected.graded,
      supporting: contrast.expected.supporting,
      supportingIds: contrast.expected.supportingIds,
      supportShare: contrast.expected.supportShare,
    },
    predicted: {
      graded: contrast.predicted.graded,
      supporting: contrast.predicted.supporting,
      supportingIds: contrast.predicted.supportingIds,
      supportShare: contrast.predicted.supportShare,
    },
    shareDelta: contrast.shareDelta,
    baselineFloor: contrast.baselineFloor,
    separates: contrast.separates,
    reason: contrast.reason,
    // The columns the contrast is read from, so a report can be diagnosed without a re-run.
    expectedRows: contrast.expected.rows,
  };
}

/**
 * Build the `derivation` block: the rule the dataset uses, checked, and its power measured.
 *
 * Finding 101's own recorded next step was a decision -- does the fix belong in the
 * dataset's authoring rule or in the model's prompt -- and it said that decision needs the
 * labelling question answered first. This block is the answer, and it is what the decision
 * is made from:
 *
 *   inferFaultCategory(expected.type) === expected.category   ->  19 of 19
 *
 * The dataset and the classifier were both written here, so conforming proves
 * self-consistency and nothing more -- the block says so in its own `honesty` list rather
 * than leaving a reader to infer it. The rule is also checked for *excess*: on 21
 * adversarial words extracted from `fault.test.ts`, the current matcher classifies 0, while
 * the substring reading finding 95 removed classifies 21, so the 0 measures the matcher and
 * not the word list.
 *
 * ## Why the verdict comes first, and why that is not a style choice
 *
 * Checking a rule produces figures, and figures get quoted. Two alternative readings -- the
 * substring reading finding 95 removed, and a row-shadowing reading that ignores the table's
 * order -- disagree with the label on 1 of 19 expected types each, on *different* types, for
 * a union of 2 of 19 = 0.1053. That is below the floor of 0.2, so the reading agrees with
 * almost everything and a miss count drawn from it cannot be told apart from nothing.
 *
 * So the verdict is the first field of the report and this block prints it first, above every
 * figure it governs. This is finding 100's result in a new place: there the reading was of
 * the `component` field with a baseline of 1 of 19; here it is `category` with 2 of 19. Same
 * floor, same verdict.
 *
 * ## And the miss figure does not survive the run change
 *
 * The consistency reading is taken over both recorded runs, not one, because a figure that
 * appears in one run and not the next is a property of the run. It is 0 of 8 in both: the
 * one consistent miss is `middleware-mysql-replica-lag-analytics`, consistent in `9932e766c`
 * only because that run reported `replica-apply-thread-saturation` (which carries
 * `saturation`) where the current run reports `replication-apply-bottleneck` (which carries
 * nothing the table knows).
 *
 * Every input is read from disk or from the recorded fixtures. Nothing is transcribed, for
 * the reason `RUNS` above records: this script already shipped one wrong figure by holding a
 * copy of a run's rows.
 */
function derivationEvidence(rowsByRun) {
  const golden = JSON.parse(readFileSync(DATASET, 'utf8'));
  if (!Array.isArray(golden.samples)) {
    throw new Error(`${DATASET} carries no samples array`);
  }

  const samples = golden.samples.map((s) => ({
    sampleId: s.id,
    type: s.expected.type,
    category: s.expected.category,
  }));
  const expectedCategoryOf = new Map(golden.samples.map((s) => [s.id, s.expected.category]));

  // Both fields come from the same run's rows, so the answered `type` and the answered
  // `category` cannot be paired across runs. Pairing them across runs is the exact defect
  // this script was repaired for -- a `type` from one run quoted beside a `category` from
  // another reads as a finding and is an artifact.
  const runs = rowsByRun.map(({ run, rows }) => {
    const answeredTypes = new Map(
      rows.filter((row) => row.field === 'type').map((row) => [row.sampleId, row.actual]),
    );
    const misses = [];
    for (const row of rows) {
      if (row.field !== 'category') continue;
      const answeredType = answeredTypes.get(row.sampleId);
      // A category miss whose sample carried no type miss has an answered type the fixture
      // does not record. Excluded and counted, rather than defaulted: a default would enter
      // the denominator as a data point and the figure would depend on the default.
      if (answeredType === undefined) continue;
      misses.push({
        sampleId: row.sampleId,
        answeredType,
        answeredCategory: row.actual,
        expectedCategory: expectedCategoryOf.get(row.sampleId),
      });
    }
    return { run, misses };
  });

  // The adversarial words, extracted from the test that owns them rather than copied, so a
  // word added there is measured here without a second edit.
  const faultTest = readFileSync(resolve(REPO, 'packages', 'core', 'test', 'fault.test.ts'), 'utf8');
  const adversarialWords = [];
  for (const match of faultTest.matchAll(/\[\s*'([a-z0-9-]+)',\s*'[a-z-]+',\s*'[a-z]+'\s*\]/g)) {
    adversarialWords.push(match[1]);
  }

  const report = buildCategoryDerivationReport({
    samples,
    misses: runs[0] === undefined ? [] : runs[0].misses,
    runs,
    adversarialWords,
    consumers: CATEGORY_CONSUMERS,
  });

  // The branches the golden corpus cannot reach, exercised explicitly.
  //
  // This is the repair for the defect the battery found, and it is Finding 100's `synthetic`
  // argument arriving at a second module. The corpus conforms 19 of 19, derives 19 of 19, and
  // legitimately reports `separates: false`. So on this corpus:
  //
  //   * `assessDatasetConformance`'s disagreement branch is **never entered** -- nothing
  //     disagrees. Injections AF forced the branch to always-conform and SURVIVED, because a
  //     branch nothing reaches cannot be moved by editing it. The figure stayed 19 of 19.
  //   * `assessDerivability`'s `unknown` branch is **never entered** -- every labelled type
  //     lands on a real category. AG removed that branch and SURVIVED, for the same reason.
  //   * `separates` is **already false**, so an edit that hardcodes it false changes nothing.
  //     AI pinned that end and SURVIVED. AH, which hardcodes true, was caught -- and the pair
  //     is only informative once both ends are observable.
  //
  // A branch no input reaches is a branch the battery cannot defend, and reporting it as
  // "the mutation changed nothing observable" is the harness working correctly on a bad entry.
  // So the inputs that reach those branches are constructed and reported here, the way the
  // `category` block above constructs the empty and whitespace-only texts for its own
  // third value.
  //
  // They are counted apart from the corpus figures rather than folded in, for the reason that
  // block states: folding them in would make `graded` describe a set that is not the dataset.
  const controls = {
    // One sample that disagrees by construction: its type derives `runtime`, its label says
    // `middleware`. This is the input `disagreements` exists for, and the only thing that makes
    // "the dataset conforms" distinguishable from "the check stopped looking".
    disagreement: assessDatasetConformance([
      { sampleId: '(disagreeing sample)', type: 'container-crash', category: 'middleware' },
    ]),
    // One type that derives nothing the table knows. `undefinedTypes` exists for this input
    // and would otherwise stay empty forever, which is how `total` came to be a figure that
    // could not move.
    undefined: assessDerivability([
      { sampleId: '(undefined type)', type: 'quantum-entanglement-drift', category: 'code' },
      { sampleId: '(defined type)', type: 'container-crash', category: 'runtime' },
    ]),
    // And the verdict's other end. A reading whose alternatives disagree about *everything* is
    // one where `separates` must be true, so a module that hardcodes false is caught here
    // rather than passing on a corpus that happens to produce false.
    separating: assessDiscriminatingPower([
      { sampleId: '(a)', type: 'redis-latency', category: 'code' },
      { sampleId: '(b)', type: 'feature-flag-misconfiguration', category: 'runtime' },
    ]),
    // The downstream reading's two unreachable directions, and the third occurrence of the
    // same repair in this module.
    //
    // On this corpus no branching consumer moves on any sample, so `lossless` is true, `moved`
    // is empty and `separates` is false -- three values a hardcode would reproduce exactly. The
    // controls below supply the inputs that reach the other ends:
    //
    //   * `moved` -- a corpus where the label and the derivation disagree, so the `moved` list
    //     is populated. `lossless` is asserted here too, because an entry that read the corpus
    //     figure would be satisfied by the mutation it is meant to catch.
    //   * `separating` -- two samples the alternative reading moves *throughout*, so an honest
    //     `separates` is true. This is AH/AI's pair at the third reading: with the corpus at
    //     false, only an input that must give true makes a hardcoded false observable.
    sensitive: assessDownstreamAgreement(
      [{ sampleId: '(diverging sample)', type: 'container-crash', category: 'middleware' }],
      [{ name: '(category itself)', branches: true, outcome: (category) => category }],
    ),
    downstreamSeparating: assessDownstreamAgreement(
      [
        { sampleId: '(a)', type: 'feature-flag-misconfiguration', category: 'config' },
        { sampleId: '(b)', type: 'redis-latency', category: 'network' },
      ],
      CATEGORY_CONSUMERS,
    ),
  };

  // The module's own declarations, read from its source rather than from any figure it
  // publishes.
  //
  // This is the one part of the block that reads a *file* rather than a reading, and it is here
  // because the defect it detects is invisible to every reading. Typescript merges duplicate
  // `interface` declarations silently, so a module that declares `MissReading` twice typechecks,
  // builds, passes every behavioural test, and can only be caught by looking at the text. The
  // module ships `duplicateTypeDeclarations` for exactly this, and the count of declarations read
  // is published beside the duplicate list so the two figures can be checked against each other:
  // a duplicate list that is empty because the reader found nothing is a different claim from one
  // that is empty because the reader read nothing.
  const moduleText = readFileSync(
    resolve(REPO, 'packages', 'core', 'src', 'fault', 'category-derivation.ts'),
    'utf8',
  );
  const declarationsRead = [...moduleText.matchAll(/^export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/gm)];
  // The detector's *positive* control, and the reason AN can be caught at all.
  //
  // On this corpus `duplicates` is empty and the honest implementation returns an empty list, so
  // a version that hardcoded `[]` would be indistinguishable -- AN read the corpus figure and
  // survived, correctly. The detector takes its source as a parameter, so a source that declares
  // one name twice can be supplied directly: there an honest implementation reports the name and
  // a hardcoded empty list does not. This is the same repair AI and AQ needed, made possible here
  // because the function is pure over its input rather than tied to one file.
  const duplicateControlSource =
    'export interface Repeated {\n' +
    '  value: number;\n' +
    '}\n' +
    'export interface Repeated {\n' +
    '  value: number;\n' +
    '}\n' +
    'export type Unique = string;\n';
  const declarations = {
    declarationsRead: declarationsRead.length,
    duplicates: duplicateTypeDeclarations(moduleText),
    duplicatesFoundInControl: duplicateTypeDeclarations(duplicateControlSource),
  };

  // The report is spread rather than re-listed field by field, so a field added to the
  // module reaches this block without an edit here. The first version of the `baseline`
  // block above listed its fields by hand and a later field was silently absent from the
  // published report while the test -- which read the module directly -- stayed green.
  return {
    ...report,
    declarations,
    // The size of the evidence, published beside the reading rather than left for a reader to
    // count. `consumers.length` is five since finding 104 and this is three; the difference is the
    // whole claim, and injections AT/AU/AX/AY exist because it is: two of the five interpolate the
    // category into an emitted label with no guard, so they cannot disagree whatever the category
    // is, and one of the three that can is a `verified` table lookup rather than a branch.
    //
    // Recomputed here from the report's own roles rather than copied, so a change to the census
    // moves this figure through the module under test -- the property every other figure in this
    // block has. The `branching` count is kept beside it because the two are no longer the same
    // number: `branching` counts the filters, `evidence` counts the consumers that can reject.
    downstream: report.downstream === undefined
      ? undefined
      : {
          ...report.downstream,
          branching: report.downstream.consumers.filter((c) => c.role === 'branches').length,
          verifying: report.downstream.consumers.filter((c) => c.role === 'verified').length,
          projecting: report.downstream.consumers.filter((c) => c.role === 'projects').length,
          evidenceRecomputed: report.downstream.consumers.filter((c) => c.role !== 'projects')
            .length,
        },
    controls: {
      disagreement: {
        conforming: controls.disagreement.conforming,
        graded: controls.disagreement.graded,
        disagreementIds: controls.disagreement.disagreements.map((d) => d.sampleId),
        conforms: controls.disagreement.conforms,
      },
      undefined: {
        defined: controls.undefined.defined,
        graded: controls.undefined.graded,
        undefinedTypes: controls.undefined.undefinedTypes,
        total: controls.undefined.total,
      },
      separating: {
        separates: controls.separating.separates,
        differ: controls.separating.differ.length,
        graded: controls.separating.graded,
        share: controls.separating.share,
      },
      sensitive: {
        moved: controls.sensitive.moved.length,
        inert: controls.sensitive.inert,
        graded: controls.sensitive.graded,
        lossless: controls.sensitive.lossless,
      },
      downstreamSeparating: {
        separates: controls.downstreamSeparating.separates,
        graded: controls.downstreamSeparating.graded,
        reason: controls.downstreamSeparating.reason,
      },
    },
    // The emitted `fault_category` vocabulary, and what the scorer does with a value outside it.
    //
    // The census above counts the *consumers* of the category field. Neither block below is a
    // consumer, which is why they are here rather than folded into `downstream`: one describes
    // the domain the exporter declares, the other what the structure check accepts. Finding 104
    // widened the census to five consumers and left the field's *domain* unexamined; v1.45 is
    // that examination, and its subject is a word list rather than a verdict.
    //
    // The two are separate objects on purpose. `admitted` moves if the composition loses a half
    // of its union; `rejected` moves if the scorer's membership clause goes away. A single block
    // would let an exporter edit and a scorer edit produce the same reading, which is the
    // wrong-field trap in its structural form.
    categories: readEmittedCategoryVocabulary(),
    scorerCategories: readScorerCategoryVerdict(),
    readingsPerRun: runs.map(({ run, misses }) => ({ run, misses: misses.length })),
    adversarialWords,
  };
}

/**
 * The normalizer the scorer applies, reproduced.
 *
 * It is *not* imported from the built package, and that is deliberate: this
 * script has to run before the build in some pipelines, and a classifier whose
 * definition moves with the artefact it is classifying cannot report on that
 * artefact. The reproduction is checked by `type-miss-probe.test.ts`, which
 * asserts this script's output matches the independently written copy in the
 * test.
 */
function normalizeFaultType(type) {
  return type
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function classify(expected, actual) {
  if (normalizeFaultType(expected) === normalizeFaultType(actual)) {
    return 'form-variant';
  }
  const expectedTokens = normalizeFaultType(expected)
    .split('-')
    .filter((t) => t.length > 0);
  const actualTokens = new Set(
    normalizeFaultType(actual)
      .split('-')
      .filter((t) => t.length > 0),
  );
  if (expectedTokens.some((t) => actualTokens.has(t))) {
    return 'shares-token';
  }
  return 'different-mechanism';
}

function parseArgs(argv) {
  const out = { predictions: '', json: false, run: DEFAULT_RUN };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--predictions') {
      out.predictions = resolve(argv[i + 1] ?? '');
      i += 1;
    } else if (a === '--run') {
      // Which recorded run to read. Named rather than implied, because the defect
      // this replaced was exactly a run being implied: the script read one run's
      // contents while a reader assumed another's.
      out.run = argv[i + 1] ?? DEFAULT_RUN;
      i += 1;
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`unknown argument '${a}'`);
    }
  }
  return out;
}

/**
 * Read misses out of a scored report or a raw prediction file.
 *
 * Two shapes are accepted because two exist. A scored report carries `misses`,
 * each with `detail` rows of `{ field, expected, actual }`; a raw predictions
 * file does not, and reading it would mean reimplementing the scorer here. The
 * report is the supported input and the error message says so rather than
 * silently returning an empty classification -- an empty result and an unreadable
 * input are different findings.
 */
function typeMissesFrom(report) {
  const misses = report?.misses;
  if (!Array.isArray(misses)) {
    throw new Error(
      'input has no `misses` array; pass a scored report (scripts/score-fault-extraction.mjs), ' +
        'not a raw predictions file -- the classifier reads the scorer\'s own field comparisons',
    );
  }
  const rows = [];
  for (const m of misses) {
    for (const d of m?.detail ?? []) {
      if (d?.field !== 'type') continue;
      if (typeof d.expected !== 'string' || typeof d.actual !== 'string') continue;
      rows.push([m.sampleId ?? '<unknown>', d.expected, d.actual]);
    }
  }
  return rows;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(String(err.message));
    return 1;
  }
  if (args.help) {
    console.log(
      'Usage: node scripts/probe-type-misses.mjs [--predictions <report.json>] ' +
        '[--run <recorded-run>] [--json]',
    );
    console.log(`\nRecorded runs: ${Object.keys(RUNS).join(', ')} (default: ${DEFAULT_RUN})`);
    return 0;
  }

  let rows;
  let source;
  if (args.predictions === '') {
    const recorded = recordedTypeMisses(args.run);
    rows = recorded.rows;
    source = `recorded run ${recorded.run} (read from the CI annotation body, not transcribed)`;
  } else {
    try {
      const report = JSON.parse(readFileSync(args.predictions, 'utf8'));
      rows = typeMissesFrom(report);
      source = args.predictions;
    } catch (err) {
      console.error(`could not read ${args.predictions}: ${String(err.message ?? err)}`);
      return 1;
    }
  }

  const classified = rows.map(([sampleId, expected, actual]) => ({
    sampleId,
    expected,
    actual,
    kind: classify(expected, actual),
    overSpecified: actual.split('-').length > expected.split('-').length,
  }));

  // The partition, derived rather than filtered twice. Finding 78's probe held
  // two contradictory figures because its halves were computed independently; a
  // guard here makes that state unrepresentable.
  //
  // The keys are the same strings the classifier returns, so `counts[k]` and a
  // `kind === k` filter cannot drift apart. An earlier draft used camelCase keys
  // for kebab-case values and the mismatch was invisible in the human-readable
  // output while breaking every programmatic consumer.
  const counts = { 'form-variant': 0, 'shares-token': 0, 'different-mechanism': 0 };
  for (const c of classified) {
    counts[c.kind] += 1;
  }
  const covered = counts['form-variant'] + counts['shares-token'] + counts['different-mechanism'];
  if (covered !== classified.length) {
    throw new Error(
      `classification partition does not cover the misses: ${covered} != ${classified.length}`,
    );
  }

  const overSpecified = classified.filter((c) => c.overSpecified).length;

  // The adjudication, which answers the question the partition cannot.
  //
  // The partition above is lexical and it is about the *scorer*: is this answer
  // one the normalizer should have folded? It says nothing about whether the
  // answer is the same fault. Finding 91 needed that and could not build it;
  // finding 94 built it. Both run here because they are different instruments over
  // the same rows and reporting either as the other is the error finding 92 named.
  //
  // `different-fault` means **the rule could not reach this pair**, not "these are
  // different faults". The distinction is in the module note and it is the reason
  // the count is reported as "unreached" rather than as "wrong".
  const adjudicated = adjudicateAll(
    rows.map(([sampleId, expected, actual]) => ({
      sampleId,
      field: 'type',
      expected,
      actual: actual === '(omitted)' ? null : actual,
    })),
  );
  const adjudication = countAdjudications(adjudicated);
  const unreached = adjudicated.filter((m) => m.verdict === 'different-fault');

  // The `category` block, which answers a question neither instrument above asks.
  //
  // The partition and the adjudication are both about the `type` field. Finding 69
  // read `category`'s eight misses by eye and concluded that a legal vocabulary
  // member was chosen, so the failure was *choosing* rather than *formatting* --
  // an unfalsified reading naming no mechanism. Finding 96 measured the mechanism:
  // each missed incident contains a sentence naming a *different* category as the
  // thing that is not happening, and the model answers with that category.
  //
  // This block is where that becomes re-derivable. It reads the incident text of
  // each missed sample out of the golden dataset -- resolving the sample id, so a
  // miss the dataset does not carry is reported rather than silently skipped -- and
  // runs the counter-evidence reading over it. Both denominators are printed
  // because the predictor is incomplete: it reaches 5 of the 8, and the report says
  // so rather than rounding to "all eight".
  //
  // It is only computable against a recorded run: the incident texts belong to the
  // dataset, and a `--predictions` file names sample ids that may not be in it. The
  // block is therefore absent rather than wrong when a predictions file is given,
  // and `--json` consumers see the key missing.
  const categoryBlock = args.predictions === ''
    ? categoryEvidence(args.run, recordedCategoryMisses(args.run))
    : null;

  // The `denial` block, which is a question about the answer rather than the text.
  //
  // Finding 96 recorded counter-evidence in the *text* and closed with an explicit
  // gap: whether writing such a sentence and then grading a category is a well-posed
  // task. This block answers it from the dataset side, without editing the dataset,
  // by asking of each missed sample whether the category the model *answered* has any
  // term in the text at all.
  //
  // It is the block that corrected its own founding claim. The expectation was "the
  // text names the answered category only to deny it, five of five"; the measurement
  // is four absent and one denied-only, which is a stronger statement than the one it
  // replaced. That correction is why the block exists rather than a paragraph in a
  // finding: the tidy version is the one a careful writer produces by hand.
  const denialBlock = args.predictions === ''
    ? denialEvidence(args.run, recordedCategoryMisses(args.run))
    : null;

  // The `agreement` block, which needs the model's own two fields rather than the dataset.
  //
  // Unlike the two blocks above it does not read the incident text at all: it reads the
  // `category` an answer emitted against the `component` the same answer emitted. That is
  // what makes it a statement about the model rather than about the dataset, and it is the
  // mechanism finding 98 could not reach.
  //
  // It reads the *unfiltered* recorded rows, because the component for a sample lives on a
  // different row than its category miss -- filtering to `category` first would discard the
  // very records this block needs, and every sample would read `not-assessable`, which is a
  // well-formed report that measures nothing.
  const agreementBlock = args.predictions === ''
    ? agreementEvidence(args.run, parseMissDetail(readFileSync(resolve(REPO, 'packages', 'core', 'test', 'fixtures', RUNS[args.run]), 'utf8')))
    : null;

  // The `baseline` block -- the control the agreement block above did not have.
  //
  // The agreement reading reported `7 of 7` and nothing to compare it against. This runs
  // the same reading over the dataset's **own** components, which are right by
  // construction, and reports both sides and whether the difference is load-bearing.
  //
  // It reads the golden dataset rather than the recorded run, because the whole point is
  // to read components whose correctness is not in question. The predicted side is passed
  // in from the agreement block so the two cannot be built from different transcriptions.
  const baselineBlock = args.predictions === ''
    ? baselineEvidence(agreementBlock)
    : null;

  // The `derivation` block -- the rule the dataset uses, checked, and its power measured.
  //
  // This is the block finding 101 asked for. Its next step was a decision -- dataset
  // authoring rule or model prompt -- and it recorded that the decision needs the labelling
  // question answered first. The block answers it and then, above every figure, records that
  // the reading which answers it cannot separate the model from a correct answerer.
  //
  // It reads **every** recorded run rather than the selected one, which no block above does.
  // The reason is that one of its figures is a stability result: whether the consistency
  // count survives the run change. A single run cannot report that, and a count taken from
  // one run while claiming to describe the model is exactly the artifact this block exists
  // to refuse.
  const derivationBlock = args.predictions === ''
    ? derivationEvidence(
        Object.keys(RUNS).map((run) => ({ run, rows: parseMissDetail(readFileSync(resolve(REPO, 'packages', 'core', 'test', 'fixtures', RUNS[run]), 'utf8')) })),
      )
    : null;

  const payload = {
    source,
    total: classified.length,
    counts,
    overSpecified,
    classified,
    adjudication,
    unreached: unreached.map((m) => ({ expected: m.expected, actual: m.actual })),
    adjudicated: adjudicated.map((m) => ({
      expected: m.expected,
      actual: m.actual,
      verdict: m.verdict,
      basis: m.basis,
    })),
    ...(categoryBlock === null ? {} : { category: categoryBlock }),
    ...(denialBlock === null ? {} : { denial: denialBlock }),
    ...(agreementBlock === null ? {} : { agreement: agreementBlock }),
    ...(baselineBlock === null ? {} : { baseline: baselineBlock }),
    ...(derivationBlock === null ? {} : { derivation: derivationBlock }),
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`type-miss classification\n`);
    console.log(`source: ${source}`);
    console.log(`misses: ${classified.length}\n`);
    for (const c of classified) {
      const flag = c.overSpecified ? ' [longer]' : '';
      console.log(`  ${c.kind.padEnd(19)} ${c.expected} -> ${c.actual}${flag}`);
    }
    console.log(
      `\nform-variant ${counts['form-variant']} | shares-token ${counts['shares-token']} | ` +
        `different-mechanism ${counts['different-mechanism']}`,
    );
    console.log(
      `over-specified (answer longer than the expected slug): ${overSpecified}/${classified.length}`,
    );
    console.log(
      `\nadjudication (finding 94): same-altitude ${adjudication['same-fault-different-altitude']} | ` +
        `unreached ${adjudication['different-fault']} | undecided ${adjudication.undecided}`,
    );
    for (const m of unreached) {
      console.log(`  unreached  ${m.expected} -> ${m.actual}`);
    }
    console.log(
      '\n`unreached` means no shared morpheme reaches the pair -- it is a limit of the rule, ' +
        'not a verdict that the two faults differ. Reading it as the latter is the inversion ' +
        'this probe exists to prevent.',
    );
    if (categoryBlock !== null) {
      const c = categoryBlock;
      console.log(
        `\ncategory counter-evidence (finding 96): ${c.misses} misses | ` +
          `present ${c.counts.present} | absent ${c.counts.absent} | not-assessable ${c.counts.notAssessable}`,
      );
      for (const r of c.readings) {
        const basis = r.phrase === null ? '' : `  (via '${r.phrase}')`;
        console.log(`  ${r.verdict.padEnd(26)} ${r.expected} -> ${r.actual}${basis}`);
      }
      console.log(
        `\nprecision ${c.missedWithPhrase}/${c.withPhrase} (of the texts carrying a phrase, ` +
          `the share that are misses) | recall ${c.missedWithPhrase}/${c.missedTotal} ` +
          `(of the misses, the share reached) | not reached ${c.missedWithoutPhrase}`,
      );
      console.log(
        `\nThe predictor is incomplete: ${c.missedWithoutPhrase} of ${c.missedTotal} misses ` +
          'carry no phrase from the list. It is a correlate at these counts, not a cause, ' +
          'and the dataset writes the counter-evidence into the text by construction.',
      );
      if (c.unresolved.length > 0) {
        console.log(
          `\nWARNING: ${c.unresolved.length} missed sample id(s) are not in the golden dataset ` +
            `and are excluded from the figures: ${c.unresolved.join(', ')}`,
        );
      }
    }
    if (denialBlock !== null) {
      const d = denialBlock;
      console.log(
        `\ndenial inventory (finding 98): ${d.misses} misses read against the category the model ` +
          `answered -- ${d.answeredCategoryAbsent} absent, ${d.answeredCategoryDeniedOnly} denied-only, ` +
          `${d.unsupportedMisses} unsupported in total`,
      );
      for (const r of d.readings) {
        const via = r.markers.length === 0 ? '' : `  (via ${r.markers.map((m) => `'${m}'`).join(', ')})`;
        console.log(
          `  ${r.verdict.padEnd(15)} ${r.expected.padEnd(11)} -> answered ${String(r.answered).padEnd(11)}${via}`,
        );
      }
      console.log(
        `\nin no case does the text assert the category the model chose. The expected shape ` +
          `was "named only to deny it" in all five; measured, it is ${d.answeredCategoryAbsent} ` +
          `of ${d.misses} that are absent and ${d.answeredCategoryDeniedOnly} of ${d.misses} ` +
          'denied-only, which is the correction this block exists to carry.',
      );
      console.log(
        `\ncorpus partition (each sample read against its own expected category): ` +
          `${d.graded} graded | denied-only ${d.counts.deniedOnly} | also-asserted ${d.counts.alsoAsserted} | ` +
          `absent ${d.counts.absent} | not-assessable ${d.counts.notAssessable} ` +
          `(share denied-only ${(d.deniedOnlyShare * 100).toFixed(1)}%)`,
      );
      if (d.control !== null) {
        console.log(
          `control ${d.control.sampleId}: expected ${d.control.expected}, read ${d.control.verdict} ` +
            `(markers: ${d.control.markers.join(', ') || 'none'}) -- a denial of a non-category ` +
            'does not read as denied-only',
        );
      } else {
        console.log(
          'control resource-cpu-saturation-checkout: NOT FOUND in the dataset, so the reading is ' +
            'not shown to be discriminating',
        );
      }
      if (d.unresolved.length > 0) {
        console.log(
          `\nWARNING: ${d.unresolved.length} missed sample id(s) are not in the golden dataset ` +
            `and are excluded from the figures: ${d.unresolved.join(', ')}`,
        );
      }
    }
    if (agreementBlock !== null) {
      const a = agreementBlock;
      console.log(
        `\ncomponent agreement (finding 99): ${a.disagrees}/${a.graded} misses named a component ` +
          `that carries no term of the category they answered -- ${a.agrees} agree, ` +
          `${a.notAssessable} not assessable`,
      );
      for (const r of a.readings) {
        console.log(
          `  ${r.verdict.padEnd(10)} ${r.sampleId.padEnd(42)} answered ${String(r.answered).padEnd(11)} ` +
            `component "${r.component}"`,
        );
      }
      console.log(
        `\nThe components are the mechanism the incident describes -- \`kubelet\` for pod-kill, ` +
          `\`session Redis\` for redis-latency. The model names the mechanism correctly and then ` +
          `emits a category that is not derivable from it, so the failure is in the relation ` +
          `between the two fields rather than in reading the incident.`,
      );
      if (a.notAssessable > 0) {
        console.log(
          `\nExcluded, not passed: ${a.unassessableIds.join(', ')} -- no component row was ` +
            'recorded because the component was answered *correctly* there. Counting it as an ' +
            'eighth pass would be the partial-join defect finding 92 records.',
        );
      }
    }
    if (baselineBlock !== null) {
      const b = baselineBlock;
      console.log(
        `\nTHE CONTROL, which refutes the block above: read the same way against components ` +
          `that are right by construction -- ${b.expected.supporting} of ${b.expected.graded} ` +
          `support their category, against ${b.predicted.supporting} of ${b.predicted.graded} ` +
          `for the model's.`,
      );
      console.log(
        `  the reading fails ${b.expected.graded - b.expected.supporting} of ${b.expected.graded} ` +
          `components that are correct, so it cannot have distinguished anything when it failed ` +
          `the ${b.predicted.graded}.`,
      );
      console.log(`  the one that supports: ${b.expected.supportingIds.join(', ') || 'none'}`);
      console.log(
        `  load-bearing: ${b.separates} (floor ${b.baselineFloor}) -- ${b.reason}`,
      );
      console.log(
        `\n  so finding 99's ${b.predicted.graded - b.predicted.supporting} of ${b.predicted.graded} ` +
          `is an artifact of the vocabulary, not a measurement of the model. CATEGORY_TERMS is the ` +
          `classifier's *slug* table; a component is a service name or an infrastructure noun, and ` +
          `is not a slug.`,
      );
    }
    if (derivationBlock !== null) {
      const d = derivationBlock;
      // The verdict first, before any figure it governs. A reader who stops one line into
      // this block must have read the thing that governs everything below it -- which is the
      // ordering the module's report enforces and a test asserts, printed here in the same
      // words so the two cannot drift.
      console.log(
        `\nTHE RULE the dataset uses, checked -- and, first, whether the check can separate ` +
          `anything:`,
      );
      console.log(
        `  can this reading separate the model from a correct answerer? ` +
          `${d.discriminatingPower.separates}`,
      );
      console.log(
        `    alternative readings disagree with the label on ${d.discriminatingPower.differ.length} ` +
          `of ${d.discriminatingPower.graded} (${d.discriminatingPower.share.toFixed(4)}), ` +
          `floor ${d.discriminatingPower.floor}`,
      );
      for (const alt of d.discriminatingPower.alternativeReadings) {
        console.log(`      ${alt.name}: ${alt.differ.length} -- ${JSON.stringify(alt.differ)}`);
      }
      console.log(
        `\n  the rule is: inferFaultCategory(expected.type) === expected.category`,
      );
      console.log(
        `    conformance: the dataset derives its own labels: ${d.conformance.conforming} ` +
          `of ${d.conformance.graded}`,
      );
      console.log(
        `    derivability: expected types landing on a real category: ${d.derivability.defined} ` +
          `of ${d.derivability.graded}`,
      );
      console.log(
        `    excess: adversarial words the rule classifies: ${d.excess.classified} ` +
          `of ${d.excess.tested} (allowance ${d.excess.within ? 'met' : 'exceeded'})`,
      );
      console.log(
        `      the same words under the substring reading: ${d.excess.underSubstringReading} ` +
          `-- so the 0 measures the matcher, not the word list`,
      );
      console.log(
        `\n  and the miss figure this check would license does not survive the run change:`,
      );
      console.log(
        `    per run: ${d.missStability.perRun.map((r) => `${r.run}=${r.reading.consistent}/${r.reading.graded}`).join('  ')}`,
      );
      console.log(
        `    consistent in EVERY run: ${d.missStability.stableIds.length} of ${d.missStability.graded}` +
          ` (consistent in at least one: ${d.missStability.everIds.length})`,
      );
      console.log(
        `\n  so the labelling question is answered -- the derivation is the dataset's own ` +
          `authoring rule, total on all ${d.derivability.graded} types -- and the figures above ` +
          `are not a result. What the answer licenses is a *decision* about where the fix ` +
          `belongs, which this block informs and does not take.`,
      );
      if (d.downstream !== undefined) {
        // The question that decides whether the decision is available at all, printed with its
        // own verdict above its own figures. The consumer count is split by role rather than
        // reported as a total, because the total is the number a reader would take as the size
        // of the evidence and, since finding 104, it is larger than the honest one -- three of
        // the five can reject a wrong category and two only interpolate it into a label.
        const evidence = d.downstream.consumers.filter((c) => c.role !== 'projects');
        const projections = d.downstream.consumers.filter((c) => c.role === 'projects');
        console.log(
          `\n  and whether anything downstream depends on the field being *predicted*:`,
        );
        console.log(
          `    consumers of expected.category: ${d.downstream.consumers.length}, of which ` +
            `${d.downstream.evidence} can reject a wrong category -- ` +
            `${evidence.map((c) => c.name).join(', ')}`,
        );
        console.log(
          `    the other ${projections.length} interpolate the category into an emitted label ` +
            `with no guard (${projections.map((c) => c.name).join(', ')}), so no category can ` +
            `change their control flow and they cannot reject anything`,
        );
        console.log(
          `    samples where no evidence consumer moves: ${d.downstream.inert} of ` +
            `${d.downstream.graded} (${d.downstream.share.toFixed(4)}), lossless ` +
            `${d.downstream.lossless}`,
        );
        console.log(
          `    can this reading separate a derived category from a mis-derived one? ` +
            `${d.downstream.separates} (floor ${d.downstream.floor})`,
        );
        console.log(`      reason: ${d.downstream.reason}`);
        console.log(
          d.downstream.separates
            ? `      -> so the lossless figure is a result and not an artefact of a reading ` +
                `with nothing to disagree with.`
            : `      -> so the lossless figure is self-consistency: the consumers read the ` +
                `same label the derivation is checked against, and the dataset and the ` +
                `classifier share an author. It is not evidence that the derivation is right.`,
        );
      }
      console.log(`\n  what this does not establish:`);
      for (const sentence of d.honesty) {
        console.log(`    - ${sentence}`);
      }
    }
    if (counts['form-variant'] === 0) {
      console.log(
        '\nno form variant: the normalizer is not the defect, so no answer here was rejected ' +
          'that should have been accepted',
      );
    } else {
      console.log(
        `\n${counts['form-variant']} form variant(s) found -- the scorer rejected an answer it should ` +
          'have accepted. That is a defect in this repository, not a model failure.',
      );
    }
  }

  return counts['form-variant'] === 0 ? 0 : 2;
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(REPO + '/', ''))) {
  process.exit(main());
}

export { RUNS, DEFAULT_RUN, classify, normalizeFaultType, recordedTypeMisses, typeMissesFrom };
