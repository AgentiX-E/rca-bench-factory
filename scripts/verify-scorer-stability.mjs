/**
 * Is the extraction scorer deterministic and self-consistent over the REAL
 * dataset?
 *
 * Why this is worth a test rather than an assumption: the four live runs showed
 * `strict` moving 0 -> 1 -> 0 and `type` moving 5 -> 6 -> 4 on identical dataset,
 * identical prompt and a nominally identical model. Reading that as "the model is
 * noisy" is a conclusion about the model. It is only correct if the *instrument*
 * is stable -- and the instrument had never been checked for that over the real
 * data, as opposed to over hand-written fixtures.
 *
 * The four properties below are what "stable instrument" means concretely. Each
 * one has a failure mode that would produce a plausible number that is not a
 * true one:
 *
 *   1. Determinism       -- a second call must return the identical report, or
 *                           every rate is a sample rather than a measurement.
 *   2. Input purity      -- the scorer must not mutate the dataset it grades, or
 *                           a run that scored twice would score differently.
 *   3. Order independence-- the rates must not depend on the prediction order, or
 *                           a re-sorted prediction file reads as a model change.
 *   4. Denominator      -- the classified misses must account for the graded
 *      completeness      samples exactly, or the diagnosis and the headline can
 *                           disagree while both look self-consistent.
 *
 * Run: node scripts/verify-scorer-stability.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CORE = resolve(ROOT, 'packages/core');

const {
  parseGoldenDataset,
  scoreExtractionSample,
  buildExtractionReport,
  SCORED_FIELDS,
} = await import(resolve(CORE, 'dist/fault/extraction-scoring.js'));

const dataset = parseGoldenDataset(
  JSON.parse(readFileSync(resolve(ROOT, 'golden-master/fault-extraction/samples.json'), 'utf8')),
);
const samples = dataset.samples;

/** A prediction that answers every scored field wrongly -- the saturated case. */
function saturatedPredictions(list) {
  return list.map((s) => {
    const e = s.expected;
    const extracted = {};
    for (const f of SCORED_FIELDS) {
      if (e[f] !== undefined) extracted[f] = `wrong-value-for-${f}`;
    }
    return { sampleId: s.id, parseOk: true, validationValid: true, extracted };
  });
}

const failures = [];
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
  if (!ok) failures.push(label);
}

console.log(`dataset: ${samples.length} samples, scored fields: ${SCORED_FIELDS.join(', ')}`);
console.log('');

// --- 1. Determinism -------------------------------------------------------
const preds = saturatedPredictions(samples);
const r1 = buildExtractionReport(samples, preds);
const r2 = buildExtractionReport(samples, preds);
const same = JSON.stringify(r1) === JSON.stringify(r2);
check('determinism: two calls over the same input give byte-identical reports', same);

// --- 2. Input purity ------------------------------------------------------
const before = JSON.stringify(samples);
buildExtractionReport(samples, preds);
const after = JSON.stringify(samples);
check('input purity: scoring does not mutate the dataset it grades', before === after);

// --- 3. Order independence ------------------------------------------------
// Reverse the predictions. The report must be identical, because pairing is by
// id -- if it were by position the rates would silently become garbage.
const reversed = [...preds].reverse();
const r3 = buildExtractionReport(samples, reversed);
check(
  'order independence: reversing the prediction order leaves the report identical',
  JSON.stringify(r1) === JSON.stringify(r3),
  JSON.stringify(r1) === JSON.stringify(r3) ? '' : 'the report changed when the input was reordered',
);

// --- 4. Denominator completeness -----------------------------------------
// Every graded sample contributes exactly once to `samplesWithMisses`, and the
// per-field counts must sum to the classified total.
let graded = 0;
let samplesWithMiss = 0;
let detailRows = 0;
for (const s of samples) {
  const p = preds.find((x) => x.sampleId === s.id);
  const v = scoreExtractionSample(s, p);
  if (v.state !== 'graded') continue;
  graded += 1;
  if (r1.misses.some((m) => m.sampleId === s.id)) samplesWithMiss += 1;
}
for (const m of r1.misses) detailRows += m.detail.length;

check(
  'denominator: samplesWithMisses equals the number of graded samples with a miss',
  r1.missClassification.samplesWithMisses === samplesWithMiss,
  `${r1.missClassification.samplesWithMisses} vs ${samplesWithMiss}`,
);
check(
  'denominator: wrongValue + omitted equals the number of detail rows',
  r1.missClassification.wrongValue + r1.missClassification.omitted === detailRows,
  `${r1.missClassification.wrongValue} + ${r1.missClassification.omitted} vs ${detailRows}`,
);
check(
  'denominator: every graded sample in this fixture misses at least one field',
  samplesWithMiss === graded,
  `${samplesWithMiss} of ${graded}`,
);

console.log('');
console.log(`saturated run: graded=${graded} misses=${detailRows} wrongValue=${r1.missClassification.wrongValue} omitted=${r1.missClassification.omitted}`);

if (failures.length > 0) {
  console.log('');
  console.log(`FAILED: ${failures.length} propert(y/ies)`);
  process.exit(1);
}
console.log('');
console.log('ALL PROPERTIES HOLD');
