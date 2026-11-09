#!/usr/bin/env node
/**
 * Score a fault-extraction run against the golden dataset.
 *
 * Reads the predictions `derive-fault-golden.mjs` wrote and the dataset it was
 * derived from, prints the layered report, and exits on the M1 exit condition.
 *
 * This script reads *no* LLM key and makes *no* network call. Scoring the
 * recorded predictions rather than re-asking the model is what makes the figure
 * reproducible: the same artefact scores the same way tomorrow, and a change in
 * the number is attributable to a change in the scorer rather than to model
 * nondeterminism.
 *
 * Usage:
 *   node scripts/score-fault-extraction.mjs --predictions <path> [--dataset <path>]
 *                                           [--record <readings.json>]
 *
 * `--record` adds one line to the report: what the recorded reading answered, measured against the
 * key it was taken from. It is optional because the scorer's first job is to score this run, and the
 * record is a different artefact about a different day -- but it is a *line* rather than a separate
 * command because the ratio a reader computes from the two is the thing that was missing.
 *
 * Exit codes:
 *   0  the M1 exit condition is met
 *   1  the run could not be read (missing file, malformed dataset or predictions)
 *   2  the measurement exists and does not meet the exit condition
 *   3  there is no measurement (no graded sample)
 *
 * Why 2 and 3 are different codes: they call for different actions. `2` says the
 * model is not good enough yet and the work is real; `3` says the pipeline never
 * produced a usable answer and the number to look at is the parse rate, not the
 * accuracy. Collapsing them is how a twelve-run failure stayed unread -- the job
 * was red either way, so nobody could tell which of the two it was from the
 * status alone.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';


const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_DATASET = resolve(REPO, 'golden-master/fault-extraction/samples.json');

function parseArgs(argv) {
  const out = { dataset: DEFAULT_DATASET, predictions: '', record: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--predictions') {
      out.predictions = resolve(argv[i + 1] ?? '');
      i += 1;
    } else if (a === '--dataset') {
      out.dataset = resolve(argv[i + 1] ?? '');
      i += 1;
    } else if (a === '--record') {
      out.record = resolve(argv[i + 1] ?? '');
      i += 1;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`unknown argument '${a}'`);
    }
  }
  return out;
}

/**
 * Load the core package's built entry point.
 *
 * The path is resolved from the repository root rather than through a bare
 * `@rca-bench-factory/core` specifier. The workspace links that package into
 * each package's own node_modules directory, not into the root's, so a bare
 * specifier works from a package script and fails from `scripts/`. Resolving the
 * file directly makes the script behave the same however it is invoked -- and it
 * still goes through the *built* output, so what runs is what the package ships.
 */
async function loadCore() {
  return await import(resolve(REPO, 'packages/core/dist/index.js'));
}

/**
 * Read the prediction list out of the derivation artefact.
 *
 * The envelope is checked rather than skipped. A file that is actually a
 * dataset, or an empty object, would otherwise reach the scorer as zero
 * predictions and fail with a count mismatch -- an error message about the wrong
 * problem.
 */
function readPredictions(core, path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${path} is not an object; expected the artefact derive-fault-golden.mjs writes`);
  }
  if (raw.schema !== 'rca-bench-fault-extraction-predictions/1') {
    throw new Error(
      `${path} has schema '${String(raw.schema)}', not 'rca-bench-fault-extraction-predictions/1'`,
    );
  }
  if (!Array.isArray(raw.predictions)) {
    throw new Error(`${path} has no 'predictions' array`);
  }
  // Round-tripped through the core parser's expectations by construction: every
  // field the scorer reads is optional except `sampleId` and `parseOk`, and a
  // missing one degrades to `unparseable` rather than throwing mid-report.
  return raw.predictions.map((p) => ({
    sampleId: typeof p?.sampleId === 'string' ? p.sampleId : '',
    parseOk: p?.parseOk === true,
    ...(p?.extracted !== undefined && typeof p.extracted === 'object' ? { extracted: p.extracted } : {}),
    ...(typeof p?.validationValid === 'boolean' ? { validationValid: p.validationValid } : {}),
    ...(typeof p?.verifiable === 'boolean' ? { verifiable: p.verifiable } : {}),
    // The diagnosis of a sample that produced no answer. Dropping these here was
    // the second half of the same defect: the artefact would carry the reason and
    // this mapping would silently discard it, so the report would print
    // "(no reason recorded)" about a file that recorded one.
    ...(typeof p?.parseError === 'string' ? { parseError: p.parseError } : {}),
    ...(typeof p?.responseExcerpt === 'string' ? { responseExcerpt: p.responseExcerpt } : {}),
    ...(typeof p?.transportError === 'string' ? { transportError: p.transportError } : {}),
  }));
}

/**
 * The recorded reading's own denominator, as one line.
 *
 * `readings.json` holds answers a *recorded* run gave, and every total in it is over the samples that
 * run answered. The key it was scored against is `key.size`, the corpus today is another number, and a
 * reader dividing `totals.strict` by either is using a denominator the line does not state. That is the
 * gap: the file is self-consistent and its coverage is invisible, so "the reading answers 30 of the 30
 * samples it was taken from" and "30 of the 32 the key holds now" are two readings of the same file
 * that nothing distinguished. `describeReadingCoverage` writes the second as a sentence, and this
 * prints it -- the arithmetic lives in the package so the sentence and its assertion are one text.
 *
 * The entry is found by `status: 'current'` rather than by index or by run number: the file is
 * append-only, an index is a position in a list that grows, and `current` is the one status that
 * states "this is the reading of the rule in the tree". A file with no such entry is reported as such
 * rather than printed as a reading of zero, because a missing reading and an empty one are different
 * findings and only one of them is about the model.
 */
function describeRecordCoverage(core, recordPath, dataset) {
  const raw = JSON.parse(readFileSync(recordPath, 'utf8'));
  const readings = Array.isArray(raw?.readings) ? raw.readings : [];
  const current = readings.filter((one) => one?.status === 'current');
  if (current.length !== 1) {
    return (
      `no reading recorded at ${recordPath} is marked current ` +
      `(${current.length} of ${readings.length} are), so there is no coverage to state`
    );
  }
  const entry = current[0];
  const samples = Array.isArray(entry?.samples) ? entry.samples : [];
  return core.describeReadingCoverage({ key: dataset.samples, reading: samples }).sentence;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'usage: node scripts/score-fault-extraction.mjs --predictions <path> [--dataset <path>]\n' +
        '                                                 [--record <readings.json>]',
    );
    return 0;
  }
  if (args.predictions === '') {
    console.error('error: --predictions is required');
    return 1;
  }

  const core = await loadCore();
  const dataset = core.parseGoldenDataset(JSON.parse(readFileSync(args.dataset, 'utf8')));
  const predictions = readPredictions(core, args.predictions);
  const report = core.buildExtractionReport(dataset.samples, predictions);

  console.log(core.formatExtractionReport(report));

  // Printed after the report and before either verdict, because it is a statement about a different
  // artefact: the run this command scored is not the run the record preserves, and a line that sat
  // inside the report would read as part of it.
  if (args.record !== '') {
    console.log(`  record         : ${describeRecordCoverage(core, args.record, dataset)}`);
  }

  if (report.strict.rate === null) {
    console.error(
      '\nNo graded sample: the run produced no scoreable extraction, so there is no accuracy to ' +
        'report. The parse and validation counts above are the numbers to read.',
    );
    return 3;
  }
  if (!core.meetsM1ExitCondition(report)) {
    const pct = (report.strict.rate * 100).toFixed(1);
    console.error(
      `\nM1 exit condition NOT met: strict all-fields ${report.strict.hits}/${report.strict.total} ` +
        `(${pct}%), threshold ${(core.M1_STRICT_THRESHOLD * 100).toFixed(0)}%.`,
    );
    return 2;
  }
  console.log('\nM1 exit condition met.');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`fatal: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
