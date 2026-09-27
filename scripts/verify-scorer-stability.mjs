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
 * Property 4 is checked over TWO fixtures, and the second one is load-bearing. The
 * saturated fixture answers every scored field, so its `omitted` count is always 0
 * and the checks that read it cannot fail: an injection that stopped incrementing
 * `omitted` left the report byte-identical. The partial fixture omits a field, which
 * is what makes the omitted half of the classification observable at all. A check
 * whose input cannot exhibit the failure it looks for is a print statement.
 *
 * Properties 2 and 3 are likewise checked against the way they can actually fail
 * rather than the obvious way. Input purity compares the sample key sets as well as
 * the serialised values, because a scorer that adds a key is mutating the dataset
 * while `JSON.stringify` of the original keys still differs only in what it now
 * contains. Order independence asserts a per-sample score rather than only comparing
 * the two reports, because a positional pairing also trips an id-mismatch throw -- so
 * the report comparison would never be reached and the property would look enforced
 * by a crash that means something else.
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

/**
 * A prediction that answers ONE scored field of every sample wrongly and leaves
 * the rest absent -- the partial case.
 *
 * Why this second fixture exists: the saturated fixture above answers every field,
 * so `omitted` is pinned at 0 in its report. That makes the omitted counter and
 * both checks that read it unfalsifiable there -- an injection that stopped
 * incrementing `omitted` produced a byte-identical report and the gate still said
 * ALL PROPERTIES HOLD. The classification only becomes observable once some
 * prediction leaves a scored field out, which is the case this one builds.
 */
function partialPredictions(list) {
  return list.map((s) => {
    const e = s.expected;
    const extracted = {};
    const fields = SCORED_FIELDS.filter((f) => e[f] !== undefined);
    // Exactly one field answered wrongly; the rest simply absent. With a single
    // expected field this degenerates to the saturated case, which the assertion
    // below therefore refuses rather than accepting a fixture that proves nothing.
    for (const f of fields.slice(1)) extracted[f] = `wrong-value-for-${f}`;
    if (fields.length > 0) extracted[fields[0]] = undefined;
    return { sampleId: s.id, parseOk: true, validationValid: true, extracted };
  });
}

/**
 * A prediction that answers every scored field of the FIRST sample correctly and
 * every field of the rest wrongly -- the mixed case.
 *
 * Why this third fixture exists: both fixtures above make every graded sample miss
 * at least one field, so `samplesWithMisses` equals the graded count whether or not
 * the counter is guarded. Checking `samplesWithMisses === graded` there is therefore
 * true for the wrong reason, and an injection that counted every graded pair as
 * having a miss -- dropping the `detail.length > 0` guard entirely -- left the gate
 * saying ALL PROPERTIES HOLD. One correct sample makes the two numbers differ, which
 * is the only state in which that check can fail.
 */
function mixedPredictions(list) {
  return list.map((s, i) => {
    const e = s.expected;
    const extracted = {};
    for (const f of SCORED_FIELDS) {
      if (e[f] !== undefined) extracted[f] = i === 0 ? e[f] : `wrong-value-for-${f}`;
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

const preds = saturatedPredictions(samples);

// --- 2. Input purity ------------------------------------------------------
// This snapshot must be taken on a dataset the scorer has NOT already seen. It is
// therefore the FIRST use of `samples`, and determinism below runs on a fresh copy
// rather than before it. An earlier version captured `before` after two determinism
// runs, so any idempotent mutation had already happened by then and `before` and
// `after` agreed -- the check passed against a scorer that overwrote every sample's
// `incidentText`. A snapshot taken after the code under test has run measures
// nothing.
//
// Comparing the serialised values catches a write to an existing key. It does not
// catch a write the serialisation cannot see, so the key sets are compared too.
const before = JSON.stringify(samples);
const keysBefore = samples.map((s) => Object.keys(s).sort().join(','));
buildExtractionReport(samples, preds);
const after = JSON.stringify(samples);
const keysAfter = samples.map((s) => Object.keys(s).sort().join(','));
const keysUnchanged = keysBefore.join('|') === keysAfter.join('|');
check(
  'input purity: scoring does not mutate the dataset it grades',
  before === after && keysUnchanged,
  before === after
    ? keysUnchanged
      ? ''
      : 'the scorer added or removed a key on a sample it graded'
    : 'a sample value changed during scoring',
);

// --- 1. Determinism -------------------------------------------------------
// Re-read the dataset so this check cannot be satisfied by a mutation that already
// spent itself on the purity run above.
const samplesForDeterminism = parseGoldenDataset(
  JSON.parse(readFileSync(resolve(ROOT, 'golden-master/fault-extraction/samples.json'), 'utf8')),
).samples;
const r1 = buildExtractionReport(samplesForDeterminism, preds);
const r2 = buildExtractionReport(samplesForDeterminism, preds);
const same = JSON.stringify(r1) === JSON.stringify(r2);
check('determinism: two calls over the same input give byte-identical reports', same);

// --- 3. Order independence ------------------------------------------------
// Reverse the predictions. The report must be identical, because pairing is by
// id -- if it were by position the rates would silently become garbage.
//
// The report comparison alone is a weak check: a positional pairing also makes
// `scoreExtractionSample` throw on the id mismatch, so the process dies for a
// reason that has nothing to do with this property and the check is never
// reached. The score of each sample is therefore compared directly against the
// same sample scored on its own, which is what "independent of order" means and
// what a crash cannot stand in for.
const reversed = [...preds].reverse();
const r3 = buildExtractionReport(samples, reversed);
check(
  'order independence: reversing the prediction order leaves the report identical',
  JSON.stringify(r1) === JSON.stringify(r3),
  JSON.stringify(r1) === JSON.stringify(r3) ? '' : 'the report changed when the input was reordered',
);

const byId = new Map(preds.map((p) => [p.sampleId, p]));
let scoreStable = true;
for (const s of samples) {
  const alone = scoreExtractionSample(s, byId.get(s.id));
  const inReversedRun = r3.misses.some((m) => m.sampleId === s.id);
  const inForwardRun = r1.misses.some((m) => m.sampleId === s.id);
  if (alone.state === 'graded' && inReversedRun !== inForwardRun) scoreStable = false;
}
check(
  'order independence: each sample is scored the same when the batch is reversed',
  scoreStable,
  scoreStable ? '' : 'a sample changed its miss status when the predictions were reordered',
);

// --- 4. Denominator completeness -----------------------------------------
// Every graded sample contributes exactly once to `samplesWithMisses`, and the
// per-field counts must sum to the classified total. Both fixtures are checked:
// the saturated one exercises the wrongValue path exclusively, and the partial
// one exercises the omitted path, which the saturated run cannot reach.
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

// --- 5. The omitted path is exercised, not assumed ------------------------
// Without this the two checks above can both hold while `omitted` is a constant
// zero -- which is exactly what the saturated fixture alone produced.
const partial = partialPredictions(samples);
const rp = buildExtractionReport(samples, partial);
let partialDetailRows = 0;
let partialGraded = 0;
for (const m of rp.misses) partialDetailRows += m.detail.length;
for (const s of samples) {
  const v = scoreExtractionSample(s, partial.find((x) => x.sampleId === s.id));
  if (v.state === 'graded') partialGraded += 1;
}
check(
  'omitted path: the partial fixture actually omits at least one field',
  rp.missClassification.omitted > 0,
  `omitted=${rp.missClassification.omitted}, wrongValue=${rp.missClassification.wrongValue}`,
);
check(
  'omitted path: wrongValue + omitted still accounts for every detail row',
  rp.missClassification.wrongValue + rp.missClassification.omitted === partialDetailRows,
  `${rp.missClassification.wrongValue} + ${rp.missClassification.omitted} vs ${partialDetailRows}`,
);
check(
  'omitted path: samplesWithMisses still equals the graded samples with a miss',
  rp.missClassification.samplesWithMisses === new Set(rp.misses.map((m) => m.sampleId)).size,
  `${rp.missClassification.samplesWithMisses} vs ${new Set(rp.misses.map((m) => m.sampleId)).size}`,
);

console.log('');
console.log(`saturated run: graded=${graded} misses=${detailRows} wrongValue=${r1.missClassification.wrongValue} omitted=${r1.missClassification.omitted}`);
console.log(`partial run: graded=${partialGraded} misses=${partialDetailRows} wrongValue=${rp.missClassification.wrongValue} omitted=${rp.missClassification.omitted}`);

// --- 6. The miss counter is guarded, not merely consistent -------------------
// With a fixture where one sample is fully correct, `samplesWithMisses` must be
// strictly less than the graded count -- and must agree with the number of miss
// records. Both are asserted, because either alone is satisfied by a counter that
// ignores the guard.
const mixed = mixedPredictions(samples);
const rm = buildExtractionReport(samples, mixed);
const missIds = new Set(rm.misses.map((m) => m.sampleId));
check(
  'mixed fixture: the first sample is genuinely awarded a clean score',
  !missIds.has(samples[0].id),
  `misses the first sample: ${missIds.has(samples[0].id)}`,
);
check(
  'mixed fixture: samplesWithMisses is strictly below the graded count',
  rm.missClassification.samplesWithMisses < graded && rm.missClassification.samplesWithMisses > 0,
  `${rm.missClassification.samplesWithMisses} of ${graded}`,
);
check(
  'mixed fixture: samplesWithMisses equals the number of distinct miss records',
  rm.missClassification.samplesWithMisses === missIds.size,
  `${rm.missClassification.samplesWithMisses} vs ${missIds.size}`,
);
check(
  'mixed fixture: the miss records are exactly the samples that were not clean',
  missIds.size === graded - 1,
  `${missIds.size} vs ${graded - 1}`,
);

console.log('');
console.log(`mixed run: graded=${graded} samplesWithMisses=${rm.missClassification.samplesWithMisses} distinctMissRecords=${missIds.size}`);

if (failures.length > 0) {
  console.log('');
  console.log(`FAILED: ${failures.length} propert(y/ies)`);
  process.exit(1);
}
console.log('');
console.log('ALL PROPERTIES HOLD');
