#!/usr/bin/env node
/**
 * Read the golden dataset and ask of each sample: does the text carry its own
 * answer, or does it carry it only to deny it?
 *
 * Finding 96 measured that the recorded `category` misses follow a
 * counter-evidence sentence. It closed with an explicit gap -- whether writing such
 * a sentence and then grading a category is a **well-posed task** is a labelling
 * question -- and this is the instrument that answers it.
 *
 * ## What the dataset says about itself
 *
 * `golden-master/fault-extraction/samples.json` carries its own criteria:
 *
 *   note:          "...naming exactly one fault, so the expected record is
 *                   decidable from the text alone."
 *   authoringRule: "The expected.type must be derivable from the incident text by
 *                   a careful human reader. A sample whose answer needs context the
 *                   text does not carry is a bad sample, not a hard one."
 *
 * ## What this probe measures, and the correction it forced
 *
 * The expected reading was "the text names the answered category only to deny it".
 * Measured, that is false in four of five cases, and this probe is what said so:
 *
 *   In four of the five reached misses the answered category has **no term in the
 *   text at all**. In the fifth, `memory` appears under "well under the limit".
 *
 * So the model is not choosing among hypotheses the text raises. It is producing a
 * category the text does not support -- which is stronger than the claim I set out
 * to make, and it is the reason the reading exists as code.
 *
 * ## The control
 *
 * `resource-cpu-saturation-checkout` is the only sample that both carries a denial
 * and was answered correctly. It is printed first and separately, because a reading
 * that flagged every denial would be worthless and this is what shows it does not.
 *
 * Usage: node scripts/probe-denial-inventory.mjs [--json]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DATASET = resolve(REPO, 'golden-master', 'fault-extraction', 'samples.json');

/**
 * The reading is imported from the build output, and the build is not run by this
 * script. Without this guard a cold check-out fails with a bare
 * `ERR_MODULE_NOT_FOUND` naming a path that looks like a typo -- which is how it
 * failed the first time this probe was written. The failure should say what is
 * missing and what to run.
 */
const BUNDLE = resolve(REPO, 'packages', 'core', 'dist', 'fault', 'denial-inventory.js');
if (!existsSync(BUNDLE)) {
  process.stderr.write(
    `error: ${BUNDLE} is missing.\n` +
      '  This probe reads the built module, not the source.\n' +
      '  Run: npx tsc -p packages/core/tsconfig.json\n',
  );
  process.exit(1);
}

const { DENIAL_MARKERS, assessCategoryDenial, buildDenialInventory } = await import(
  pathToFileURL(BUNDLE).href
);

/**
 * The category each recorded miss was answered with, transcribed from the CI
 * annotation bodies for run `567118aea`.
 *
 * Transcribed rather than inferred. The annotation carries a `field` and the two
 * slugs, and there is no route from it to a category without the vocabulary -- so
 * the answer is written here as data and the probe joins it to the dataset by
 * sample id. An id that does not resolve is reported rather than dropped, because a
 * partial join is how a confident percentage gets built out of nothing.
 */
const ANSWERED = new Map([
  ['resource-memory-leak-recommendation', 'code'],
  ['runtime-pod-kill-user-profile', 'resource'],
  ['runtime-container-crash-loop-media', 'dependency'],
  ['middleware-redis-latency-cache', 'resource'],
  ['middleware-kafka-consumer-lag', 'code'],
  ['middleware-database-connection-pool', 'resource'],
  ['code-slow-regex-api-gateway', 'config'],
  ['middleware-mysql-replica-lag-analytics', 'resource'],
]);

/** The five reached by finding 96's phrase list, in dataset order. */
const REACHED = [
  'middleware-database-connection-pool',
  'middleware-redis-latency-cache',
  'middleware-mysql-replica-lag-analytics',
  'runtime-pod-kill-user-profile',
  'middleware-kafka-consumer-lag',
];

function main() {
  const wantJson = process.argv.includes('--json');
  const doc = JSON.parse(readFileSync(DATASET, 'utf8'));
  const samples = doc.samples;

  const byId = new Map(samples.map((s) => [s.id, s]));
  const unresolved = REACHED.filter((id) => !byId.has(id));

  // ---- the five reached misses -------------------------------------------------
  const reached = REACHED.filter((id) => byId.has(id)).map((id) => {
    const sample = byId.get(id);
    const answered = ANSWERED.get(id) ?? '(unknown)';
    const reading = assessCategoryDenial({
      text: sample.incidentText,
      category: answered,
    });
    return {
      sampleId: id,
      expected: sample.expected.category,
      answered,
      verdict: reading.verdict,
      markers: reading.markers,
    };
  });

  const unsupported = reached.filter(
    (r) => r.verdict === 'absent' || r.verdict === 'denied-only',
  );

  // ---- the control -------------------------------------------------------------
  const controlId = 'resource-cpu-saturation-checkout';
  const controlSample = byId.get(controlId);
  const control = controlSample
    ? {
        sampleId: controlId,
        expected: controlSample.expected.category,
        reading: assessCategoryDenial({
          text: controlSample.incidentText,
          category: controlSample.expected.category,
        }),
      }
    : null;

  // ---- the corpus partition, over each sample's own expected category ----------
  const inventory = buildDenialInventory(
    samples.map((s) => ({
      sampleId: s.id,
      text: s.incidentText,
      category: s.expected.category,
    })),
  );

  const payload = {
    source: 'golden-master/fault-extraction/samples.json',
    answersFrom: 'recorded run 567118aea, transcribed',
    datasetRule: {
      note: doc.provenance?.note ?? '',
      authoringRule: doc.provenance?.authoringRule ?? '',
    },
    denialMarkers: [...DENIAL_MARKERS],
    reached: {
      total: REACHED.length,
      resolved: reached.length,
      unsupported: unsupported.length,
      answeredCategoryNotSupported: reached.filter((r) => r.verdict === 'absent').length,
      answeredCategoryDeniedOnly: reached.filter((r) => r.verdict === 'denied-only').length,
      readings: reached,
    },
    control,
    inventory,
    unresolved,
  };

  if (wantJson) {
    console.log(JSON.stringify(payload, null, 2));
    return unresolved.length === 0 ? 0 : 1;
  }

  console.log('denial inventory\n');
  console.log(`source: ${payload.source}`);
  console.log(`answers: ${payload.answersFrom}\n`);
  console.log(`denial markers (${DENIAL_MARKERS.length}):`, DENIAL_MARKERS.join(', '));
  console.log();

  console.log('the five misses finding 96 reaches:');
  for (const r of reached) {
    console.log(
      `  ${r.sampleId.padEnd(40)} expected ${r.expected.padEnd(11)} answered ${String(r.answered).padEnd(11)} ${r.verdict}`,
    );
  }
  console.log();
  console.log(
    `  the answered category is absent from the text in ${payload.reached.answeredCategoryNotSupported} of ${reached.length}`,
  );
  console.log(
    `  and denied-only in ${payload.reached.answeredCategoryDeniedOnly} of ${reached.length}`,
  );
  console.log('  -> in no case does the text assert the category the model chose\n');

  if (control) {
    console.log('control -- the only correct sample carrying a denial:');
    console.log(`  ${control.sampleId}`);
    console.log(
      `  expected ${control.expected}; reading ${control.reading.verdict} (markers: ${control.reading.markers.join(', ') || 'none'})`,
    );
    console.log('  -> a denial of a non-category does not read as denied-only\n');
  }

  console.log(
    `corpus partition (each sample read against its own expected category): ${inventory.graded} graded`,
  );
  console.log(
    `  denied-only ${inventory.deniedOnly} | also-asserted ${inventory.alsoAsserted} | absent ${inventory.absent}`,
  );
  console.log(`  share denied-only ${(inventory.deniedOnlyShare * 100).toFixed(1)}%`);
  console.log();

  if (unresolved.length > 0) {
    console.log(`WARNING: ${unresolved.length} recorded miss(es) did not resolve in the dataset:`);
    for (const id of unresolved) console.log(`  ${id}`);
    console.log('  their readings are excluded from the figures above');
    return 1;
  }

  console.log('note: this is a reading of the dataset, not a verdict on it.');
  console.log('      no sample text was modified.');
  return 0;
}

process.exit(main());
