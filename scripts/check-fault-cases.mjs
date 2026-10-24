#!/usr/bin/env node
/**
 * Every fault case in the corpus is annotated in all four layers, and its references answer.
 *
 * M1's exit condition says "GT four-layer annotation (entity / fault / process / evidence) can
 * all be filled". Nothing checked it: `causalChain` and `evidenceCheckpoints` are optional in
 * the schema, `rootCauseEntityId` is a string that no code resolves, and every case in this
 * repository carried a type and a component and nothing else. A condition nobody can check is
 * met by definition -- which is the state this guard exists to end.
 *
 * `assessFourLayer` is the definition; this is the guard. It walks
 * `golden-master/fault-cases/index.json`, parses each case and its graph through the shipped
 * schemas, asks the core module whether the four layers are filled and every reference
 * resolves, and refuses the whole file if any case is incomplete.
 *
 * ## The count is reported, not gated
 *
 * One of thirty extraction samples carries a four-layer case today. Requiring thirty would make
 * the guard red for the next thirty rounds and teach everyone to ignore it; requiring nothing
 * would let the number go to zero in silence. So the count is printed on every run and
 * `min` in the index is the floor, raised as annotation proceeds -- the same shape
 * `M1_STRICT_THRESHOLD` has, and for the same reason: a threshold that is not written down is
 * a threshold that drifts.
 *
 * ## Why the sample ids are cross-checked
 *
 * A case annotated from an incident that is not in the extraction key is not wrong, but it is
 * a case nobody can compare against the thing it came from. The link is what makes "1 of 30"
 * mean something, so a `sampleId` the key does not carry fails here rather than being counted
 * toward coverage that does not exist.
 *
 * Usage:
 *   node scripts/check-fault-cases.mjs [--cases <dir>] [--samples <file>]
 *
 * Exit codes:
 *   0  every case is complete, every reference resolves, and the count is at or above the floor
 *   1  an input could not be read, or a case does not parse, or a sample id is unknown
 *   2  a case is incomplete, or the count is below the floor
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_CASES = resolve(REPO, 'golden-master', 'fault-cases');
const DEFAULT_SAMPLES = resolve(REPO, 'golden-master', 'fault-extraction', 'samples.json');
const INDEX_SCHEMA = 'rca-bench-fault-cases/1';

function parseArgs(argv) {
  const out = { cases: DEFAULT_CASES, samples: DEFAULT_SAMPLES };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cases') out.cases = resolve(argv[(index += 1)] ?? '');
    else if (arg === '--samples') out.samples = resolve(argv[(index += 1)] ?? '');
    else if (arg === '--help' || arg === '-h') out.help = true;
    else {
      console.error(`check-fault-cases: unknown argument '${arg}'`);
      console.error('usage: node scripts/check-fault-cases.mjs [--cases <dir>] [--samples <file>]');
      process.exit(1);
    }
  }
  return out;
}

async function loadCore() {
  return await import(resolve(REPO, 'packages/core/dist/index.js'));
}

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`check-fault-cases: could not read the ${what} at ${path}: ${String(error instanceof Error ? error.message : error)}`);
    process.exit(1);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log('usage: node scripts/check-fault-cases.mjs [--cases <dir>] [--samples <file>]');
  process.exit(0);
}

const core = await loadCore();
const index = readJson(join(args.cases, 'index.json'), 'case index');
if (index.schema !== INDEX_SCHEMA) {
  console.error(`check-fault-cases: the index has schema '${String(index.schema)}', not '${INDEX_SCHEMA}'`);
  process.exit(1);
}
if (!Array.isArray(index.cases)) {
  console.error("check-fault-cases: the index has no 'cases' array");
  process.exit(1);
}
const samples = readJson(args.samples, 'extraction key');
const known = new Set((samples.samples ?? []).map((sample) => sample?.id));
const floor = typeof index.min === 'number' ? index.min : 0;

const problems = [];
const invalid = [];
const seen = new Set();

for (const entry of index.cases) {
  const caseId = typeof entry?.caseId === 'string' ? entry.caseId : '';
  if (caseId === '') {
    problems.push('an entry in the index has no caseId');
    continue;
  }
  if (seen.has(caseId)) {
    problems.push(`'${caseId}' appears twice in the index; two annotations of one case is an ambiguity, not coverage`);
    continue;
  }
  seen.add(caseId);

  // The link back to the extraction key. Without it the count is a number about a directory.
  const sampleId = typeof entry.sampleId === 'string' ? entry.sampleId : '';
  if (sampleId === '' || !known.has(sampleId)) {
    problems.push(`'${caseId}' names sample '${sampleId}', which the extraction key does not carry`);
    continue;
  }
  if (typeof entry.why !== 'string' || entry.why.length < 40) {
    // The `why` is the annotation's argument: which parts of the text each layer came from.
    // A case added without it is a case nobody can review.
    problems.push(`'${caseId}' does not say in at least forty characters where the annotation came from`);
  }

  const rawCase = readJson(join(args.cases, String(entry.case)), `case file for '${caseId}'`);
  const rawGraph = readJson(join(args.cases, String(entry.graph)), `graph for '${caseId}'`);

  let parsedCase;
  let parsedGraph;
  try {
    parsedCase = core.faultCaseSchema.parse(rawCase);
    parsedGraph = core.entityGraphSchema.parse(rawGraph);
  } catch (error) {
    // A case that does not parse is an unreadable input, not a case with an empty layer: the
    // two call for different repairs, so they get different exit codes.
    invalid.push(`'${caseId}' does not parse: ${String(error instanceof Error ? error.message : error).split('\n')[0]}`);
    continue;
  }

  const reading = core.assessFourLayer({ case: parsedCase, graph: parsedGraph });
  if (!reading.complete) {
    const empty = reading.layers.filter((layer) => !layer.filled).map((layer) => `${layer.layer}: ${String(layer.reason)}`);
    const refs = reading.unresolved.map((ref) => `${ref.where} -> ${ref.ref}`);
    const dangling = reading.danglingEvidence.map((ref) => `step ${String(ref.step)} -> ${ref.ref}`);
    problems.push(`'${caseId}' is not complete: ${[...empty, ...refs, ...dangling].join('; ')}`);
  }
}

// A file in the directory that the index does not name is a case nobody will run.
const named = new Set(['index.json', ...index.cases.flatMap((entry) => [entry?.case, entry?.graph])]);
const unnamed = readdirSync(args.cases).filter((file) => file.endsWith('.json') && !named.has(file));

if (invalid.length > 0) {
  for (const problem of invalid) console.error(`check-fault-cases: ${problem}`);
  console.error(`check-fault-cases: FAILED — ${String(invalid.length)} case(s) could not be read as a FaultCase`);
  process.exit(1);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`check-fault-cases: ${problem}`);
  console.error(
    `check-fault-cases: FAILED — ${String(problems.length)} problem(s) across ${String(index.cases.length)} case(s)`,
  );
  process.exit(2);
}

if (unnamed.length > 0) {
  // Named rather than ignored: a case file the index does not list is a case that never runs,
  // and the directory reading as "one case" while holding two is the kind of count this
  // repository keeps having to fix.
  for (const file of unnamed) console.error(`check-fault-cases: ${file} is not named in index.json`);
  console.error(`check-fault-cases: FAILED — ${String(unnamed.length)} file(s) in ${args.cases} are not indexed`);
  process.exit(2);
}

if (index.cases.length < floor) {
  console.error(
    `check-fault-cases: FAILED — ${String(index.cases.length)} four-layer case(s), below the floor of ` +
      `${String(floor)}. The floor is raised as annotation proceeds; lowering it is a decision, not a repair.`,
  );
  process.exit(2);
}

console.log(
  `check-fault-cases: OK (${String(index.cases.length)} of ${String(known.size)} sample(s) carry a four-layer ` +
    `case; each is complete and every reference resolves; floor ${String(floor)})`,
);
