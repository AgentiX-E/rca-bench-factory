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
  const out = { dataset: DEFAULT_DATASET, predictions: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--predictions') {
      out.predictions = resolve(argv[i + 1] ?? '');
      i += 1;
    } else if (a === '--dataset') {
      out.dataset = resolve(argv[i + 1] ?? '');
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
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'usage: node scripts/score-fault-extraction.mjs --predictions <path> [--dataset <path>]',
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
