#!/usr/bin/env node
/**
 * Check the category rule the dataset uses, and print whether the reading can
 * distinguish anything **before** printing any figure drawn from it.
 *
 * ## The rule
 *
 * `golden-master/fault-extraction/samples.json` obeys one derivation:
 *
 *   inferFaultCategory(expected.type) === expected.category   ->  19 of 19
 *
 * The dataset's `provenance.annotationRule` states the token rule for `component` and
 * `fault-prompt-grammar.test.ts` enforces it. For `category` the dataset states nothing
 * and `buildFaultExtractionPrompt` never connects the two fields: it gives the model a
 * closed vocabulary for `category` and a shape rule for `type`, and asks for both
 * independently. The labeller applies a derivation the prompt does not state.
 *
 * ## And the part that matters more than the check
 *
 * Checking a rule produces numbers, and numbers get quoted. So this probe measures, and
 * prints first, whether the reading can separate the model from a correct answerer.
 *
 * It cannot. Two alternative readings -- the substring reading finding 95 removed, and a
 * row-shadowing reading that ignores the table's order -- each disagree with the label on
 * 1 of the 19 expected types, on different types, for a union of 2 of 19 = 0.1053. That is
 * below the floor of 0.2, so a miss count drawn from this reading is the difference between
 * two estimates of nothing.
 *
 * This is finding 100's result in a new place. There the reading was of the `component`
 * field and its baseline was 1 of 19; here it is the `category` field and the baseline is
 * 2 of 19. Same floor, same verdict.
 *
 * ## And the miss figure does not survive the run change
 *
 * The one consistent miss exists in one recorded run and not the other:
 * `middleware-mysql-replica-lag-analytics` is consistent in `9932e766c`, which reported
 * `replica-apply-thread-saturation` (which does carry `saturation`), and not in `567118aea`,
 * which reported `replication-apply-bottleneck` (which carries nothing the table knows).
 * **0 of 8 are consistent in both runs.** A property that appears in one run and not the
 * next is a property of the run.
 *
 * ## The downstream question
 *
 * Finding 102 left one question open that decides whether its own decision is available: does
 * anything downstream depend on `expected.category` being *predicted* rather than derived?
 * Four consumers read the field and **two of them branch** on it; the other two index a total
 * record and cannot disagree whatever the category is. Under the actual derivation no branching
 * consumer moves on any of the 19 samples, and under the alternative reading only 1 of 19
 * (0.0526) moves -- below the floor of 0.2, so the reading **does not separate** and the
 * lossless figure is self-consistency rather than evidence.
 *
 * ## What is not claimed
 *
 * Not that the prompt should state the derivation -- that is a decision this probe informs
 * and does not take. Not that finding 98 is wrong; it read the incident text and stands.
 * Not that the dataset is wrong: it is self-consistent, and self-consistent is all the
 * check establishes, since the dataset and the classifier were written by the same hand.
 * Not that the 19-of-19 agreement means the derivation is correct: the consumers branch on
 * the same label the derivation is checked against, so the agreement is a fixed point of a
 * shared author rather than an independent confirmation.
 *
 * Usage: node scripts/probe-category-derivation.mjs [--json]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DATASET = resolve(REPO, 'golden-master', 'fault-extraction', 'samples.json');
const FIXTURES = resolve(REPO, 'packages', 'core', 'test', 'fixtures');

const BUNDLE = resolve(REPO, 'packages', 'core', 'dist', 'fault', 'category-derivation.js');
if (!existsSync(BUNDLE)) {
  process.stderr.write(
    `error: ${BUNDLE} is missing.\n` +
      '  This probe reads the built module, not the source.\n' +
      '  Run: npx tsc -p packages/core/tsconfig.json\n',
  );
  process.exit(1);
}

const MISS_DETAIL = resolve(REPO, 'packages', 'core', 'dist', 'fault', 'miss-detail.js');
if (!existsSync(MISS_DETAIL)) {
  process.stderr.write(
    `error: ${MISS_DETAIL} is missing.\n` +
      '  This probe reads the recorded runs through the built parser.\n' +
      '  Run: npx tsc -p packages/core/tsconfig.json\n',
  );
  process.exit(1);
}

const {
  ALT_READING_FLOOR,
  EXCESS_ALLOWANCE,
  assessDatasetConformance,
  assessDerivability,
  assessDiscriminatingPower,
  assessDownstreamAgreement,
  assessExcess,
  assessMissDerivability,
  assessMissStability,
} = await import(pathToFileURL(BUNDLE).href);
const { parseMissDetail } = await import(pathToFileURL(MISS_DETAIL).href);

/**
 * The table `validity.expectedSignalsFor` looks categories up in, imported rather than copied.
 *
 * The probe must not restate this key set: a category added to the table would otherwise leave
 * the probe asserting that the consumer misses, which is a wrong reading produced by a stale
 * copy. Importing it means the mirror of `validity` stays a mirror.
 */
const { FAULT_EXPECTATIONS } = await import(
  pathToFileURL(resolve(REPO, 'packages', 'core', 'dist', 'gates', 'validity.js')).href
);

/**
 * The four consumers of `expected.category`, each with the behaviour its source actually has.
 *
 * Read from the source rather than assumed, because the `branches` flag is the whole content of
 * the downstream reading: two of these four select different behaviour on the category and two
 * merely project it into a label. Counting four branch points where there are two is precisely
 * the overstatement this list exists to prevent, so each `outcome` mirrors the source:
 *
 *   - `gates/validity.ts:148-155` looks the category up in `FAULT_EXPECTATIONS` and returns
 *     `unverifiable` on a miss -- a branch.
 *   - `export/rcaeval.ts:148` skips an RE3 case unless the category is `code` -- a branch.
 *   - `export/itbench.ts:119` and `export/cloudopsbench.ts:79` index a total
 *     `Record<FaultCategory, string>` with no guard -- no branch, so no category can change
 *     their control flow and neither is evidence of agreement.
 */
const CONSUMERS = [
  {
    name: 'gates/validity.ts:148',
    branches: true,
    outcome: (category) => (category in FAULT_EXPECTATIONS ? 'checked' : 'unverifiable'),
  },  {
    name: 'export/rcaeval.ts:148',
    branches: true,
    outcome: (category) => (category === 'code' ? 'kept' : 'skipped'),
  },
  {
    name: 'export/itbench.ts:119',
    branches: false,
    outcome: (category) => `label:${category}`,
  },
  {
    name: 'export/cloudopsbench.ts:79',
    branches: false,
    outcome: (category) => `taxonomy:${category}`,
  },
];

const parsed = JSON.parse(readFileSync(DATASET, 'utf8'));
const samples = parsed.samples.map((s) => ({
  sampleId: s.id,
  type: s.expected.type,
  category: s.expected.category,
}));
const expectedCategoryOf = new Map(parsed.samples.map((s) => [s.id, s.expected.category]));

/**
 * The recorded misses for one run, read from its fixture.
 *
 * Both the answered `type` and the answered `category` come from the same run, so the two
 * cannot be paired across runs -- the error a transcription makes silently.
 */
function runMisses(run) {
  const text = readFileSync(resolve(FIXTURES, `miss-detail-${run}.txt`), 'utf8');
  const rows = parseMissDetail(text);
  const answeredTypes = new Map(
    rows.filter((r) => r.field === 'type').map((r) => [r.sampleId, r.actual]),
  );
  const misses = [];
  for (const row of rows) {
    if (row.field !== 'category') continue;
    const answeredType = answeredTypes.get(row.sampleId);
    if (answeredType === undefined) continue;
    misses.push({
      sampleId: row.sampleId,
      answeredType,
      answeredCategory: row.actual,
      expectedCategory: expectedCategoryOf.get(row.sampleId),
    });
  }
  return { run, misses };
}

/**
 * The adversarial word list, read from the test that owns it.
 *
 * Extracted from `fault.test.ts` rather than copied, so a word added there is measured here
 * without a second edit.
 */
function adversarialWords() {
  const text = readFileSync(resolve(REPO, 'packages', 'core', 'test', 'fault.test.ts'), 'utf8');
  const words = [];
  for (const match of text.matchAll(/\[\s*'([a-z0-9-]+)',\s*'[a-z-]+',\s*'[a-z]+'\s*\]/g)) {
    words.push(match[1]);
  }
  return words;
}

const CURRENT_RUN = '567118aea';
const EARLIER_RUN = '9932e766c';
const runs = [runMisses(CURRENT_RUN), runMisses(EARLIER_RUN)];

const power = assessDiscriminatingPower(samples);
const conformance = assessDatasetConformance(samples);
const derivability = assessDerivability(samples);
const excess = assessExcess(adversarialWords());
const misses = assessMissDerivability(runs[0].misses);
const stability = assessMissStability(runs);
const downstream = assessDownstreamAgreement(samples, CONSUMERS);

if (process.argv.includes('--json')) {
  process.stdout.write(
    `${JSON.stringify(
      {
        source: 'golden-master/fault-extraction/samples.json',
        answersFrom: `recorded runs ${CURRENT_RUN}, ${EARLIER_RUN}, read from fixtures`,
        discriminatingPower: {
          differ: power.differ,
          share: power.share,
          separates: power.separates,
          floor: power.floor,
          reason: power.reason,
          alternativeReadings: power.alternativeReadings,
        },
        conformance: {
          conforming: conformance.conforming,
          graded: conformance.graded,
          disagreements: conformance.disagreements,
        },
        derivability: {
          defined: derivability.defined,
          graded: derivability.graded,
          undefinedTypes: derivability.undefinedTypes,
        },
        excess: {
          classified: excess.classified,
          tested: excess.tested,
          underSubstringReading: excess.underSubstringReading,
          allowance: EXCESS_ALLOWANCE,
        },
        misses: { consistent: misses.consistent, graded: misses.graded, rows: misses.rows },
        missStability: {
          stable: stability.stable,
          stableIds: stability.stableIds,
          everIds: stability.everIds,
          graded: stability.graded,
          reason: stability.reason,
        },
        downstream: {
          consumers: downstream.consumers,
          graded: downstream.graded,
          inert: downstream.inert,
          moved: downstream.moved,
          share: downstream.share,
          lossless: downstream.lossless,
          separates: downstream.separates,
          floor: downstream.floor,
          reason: downstream.reason,
        },
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const line = '='.repeat(72);

process.stdout.write(
  `category derivation -- the rule the dataset uses, checked, and its power measured\n` +
    `source: golden-master/fault-extraction/samples.json\n` +
    `answers: recorded runs ${CURRENT_RUN}, ${EARLIER_RUN}, read from the run fixtures\n\n` +
    `the rule is: inferFaultCategory(expected.type) === expected.category\n` +
    `${line}\n`,
);

// The verdict first, and in the same words the test asserts on. A reader who stops here must
// have read the thing that governs everything below it.
process.stdout.write(
  `VERDICT -- can this reading separate the model from a correct answerer?\n` +
    `  load-bearing: ${power.separates}\n` +
    `  alternative readings disagree with the label on: ${power.differ.length} of ${power.graded} (${power.share.toFixed(4)})\n` +
    `  floor: ${power.floor}\n` +
    `  reason: ${power.reason}\n\n`,
);

if (power.separates) {
  process.stdout.write(
    `  -> the alternatives disagree often enough that agreeing with the label is a\n` +
      `     property they do not share. A figure drawn from this reading could be a\n` +
      `     finding.\n\n`,
  );
} else {
  process.stdout.write(
    `  -> the reading does NOT separate them. It disagrees with the label on 2 of the\n` +
      `     19 expected types, so it has almost nothing left to disagree with, and no\n` +
      `     miss count drawn from it can be told apart from nothing.\n` +
      `     This is finding 100's result in a new place: there the reading was of the\n` +
      `     component field and the baseline was 1 of 19; here it is the category field\n` +
      `     and the baseline is 2 of 19. Same floor, same verdict.\n\n`,
  );
}

process.stdout.write(
  `${line}\n` +
    `THE CHECK -- what the rule does on this corpus (figures the verdict above governs)\n` +
    `  conformance: the dataset derives its own labels: ${conformance.conforming} of ${conformance.graded}\n` +
    `  derivability: expected types landing on a real category: ${derivability.defined} of ${derivability.graded}\n` +
    `  excess: adversarial words the rule classifies: ${excess.classified} of ${excess.tested} (allowance ${EXCESS_ALLOWANCE})\n` +
    `    the same words under the substring reading: ${excess.underSubstringReading}\n` +
    `    -> the 0 measures the current matcher, not the word list: the list does\n` +
    `       provoke the defect finding 95 removed, and the matcher is what suppresses it.\n` +
    `  conformance is self-consistency only: the dataset and the classifier were written\n` +
    `    by the same hand, so a shared mistake would conform perfectly.\n\n`,
);

process.stdout.write(
  `${line}\n` +
    `THE MISSES -- and why the figure below is not a result\n` +
    `  consistent in run ${CURRENT_RUN}: ${misses.consistent} of ${misses.graded}\n` +
    `  per run: ${stability.perRun.map((r) => `${r.run}=${r.reading.consistent}/${r.reading.graded}`).join('  ')}\n` +
    `  consistent in EVERY run: ${stability.stableIds.length} of ${stability.graded}\n` +
    `  consistent in AT LEAST ONE run: ${stability.everIds.length} of ${stability.graded} ${JSON.stringify(stability.everIds)}\n` +
    `  reason: ${stability.reason}\n` +
    `\n` +
    `  -> the one consistent miss is a property of the run: ${EARLIER_RUN} reported\n` +
    `     replica-apply-thread-saturation, which carries 'saturation' and so derives\n` +
    `     resource; ${CURRENT_RUN} reported replication-apply-bottleneck for the same\n` +
    `     sample, which carries nothing the table knows. Neither the below-floor share\n` +
    `     nor the run dependence is a defect to fix -- both are reasons not to quote the\n` +
    `     count as a measurement of the model.\n\n`,
);

process.stdout.write(
  `${line}\n` +
    `THE DOWNSTREAM QUESTION -- does anything depend on the field being predicted?\n` +
    `  consumers of expected.category: ${downstream.consumers.length}\n` +
    downstream.consumers
      .map((c) => `    ${c.branches ? 'BRANCHES' : 'projects'}  ${c.name}\n`)
      .join('') +
    `  samples where no BRANCHING consumer moves: ${downstream.inert} of ${downstream.graded} (${downstream.share.toFixed(4)})\n` +
    `  lossless (deriving the field away changes no branching consumer): ${downstream.lossless}\n\n` +
    `  VERDICT -- can this reading separate a derived category from a mis-derived one?\n` +
    `    load-bearing: ${downstream.separates}\n` +
    `    floor: ${downstream.floor}\n` +
    `    reason: ${downstream.reason}\n` +
    (downstream.separates
      ? `    -> separating, so the lossless figure above is a result and not an artefact\n` +
        `       of a reading with nothing to disagree with.\n\n`
      : `    -> NOT separating. The lossless figure is self-consistency: the consumers\n` +
        `       branch on the same label the derivation is checked against, and the\n` +
        `       dataset and the classifier share an author. An agreement that cannot be\n` +
        `       made to fail is not evidence that the derivation is right.\n\n`) +
    `  -> and the count of two branching consumers is load-bearing: two of the four\n` +
    `     index a total record with no guard, so they cannot disagree whatever the\n` +
    `     category is. The reading is over two chances to disagree, not four.\n` +
    (downstream.moved.length === 0
      ? `     No sample moves under the actual derivation, which is why the figure is a\n` +
        `     denominator and not a numerator.\n\n`
      : `     ${downstream.moved.length} samples move under the actual derivation; see --json.\n\n`),
);

process.stdout.write(`  detail -- per miss, in run ${CURRENT_RUN}:\n`);
for (const row of misses.rows) {
  const mark = row.consistent ? 'CONSISTENT' : row.derived === 'unknown' ? 'no category in slug' : `!= ${row.derived}`;
  process.stdout.write(
    `    ${row.sampleId.padEnd(40)} ${row.answeredType.padEnd(36)} answered ${row.answeredCategory.padEnd(12)} ${mark}\n`,
  );
}

process.stdout.write(`\n  detail -- the alternative readings, per type they disagree about:\n`);
for (const reading of power.alternativeReadings) {
  process.stdout.write(
    `    ${reading.name.padEnd(15)} ${reading.differ.length} : ${JSON.stringify(reading.differ)}\n`,
  );
}

process.stdout.write(
  `\n  what this does not claim:\n` +
    `    - not that the prompt should state the derivation. That is a decision this\n` +
    `      probe informs and does not take.\n` +
    `    - not that finding 98 is wrong. It read the incident text and stands.\n` +
    `    - not that the dataset is wrong. It is self-consistent, and self-consistent is\n` +
    `      all the check establishes.\n` +
    `    - not that the 19-of-19 downstream agreement is a confirmation. The consumers\n` +
    `      branch on the same label the derivation is checked against, and the reading\n` +
    `      does not separate (see the verdict above), so it cannot be made to fail.\n`,
);
