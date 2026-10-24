#!/usr/bin/env node
/**
 * Which accuracy runs happened and are not in the record.
 *
 * The record (`golden-master/fault-extraction/readings.json`) is written by hand, from a
 * workflow artefact, by whoever read the number. That is the one step in the sequence with no
 * gate behind it: the digest check catches an unmeasured prompt, the anti-regression rule
 * catches a measured worse one, and **a run that happened and was never written down is caught
 * by neither** — which is how run `39950191377` sat unread for twenty hours while four rounds
 * were written on top of "blocked" (finding 222).
 *
 * This is the missing piece, and it is a tool rather than a test because it needs the network.
 * Give it the workflow's run list — fetched with a token, or saved from the API — and it names
 * the successful runs whose ids are not in the record. A run is *recorded* if its id appears
 * anywhere in the record: as a reading, in `absent` (its artefact was lost and it is named
 * rather than reconstructed), or as `reverted`.
 *
 *   GITHUB_TOKEN=… node scripts/reconcile-readings.mjs
 *   node scripts/reconcile-readings.mjs --runs saved-runs.json
 *
 * Exit: 0 every successful run is recorded; 3 some are not; 2 the input could not be read.
 *
 * ## What is in scope, and why ids decide it
 *
 * Runs that predate the record are not audited: the record did not exist when they happened, and
 * demanding an entry for them would make the tool report a dozen historical successes and nothing
 * else. The boundary is the **smallest recorded id**, which is sound because GitHub run ids
 * increase with creation time -- so "the record starts here" is a fact about the ids rather than a
 * date somebody has to maintain. A run id smaller than that is out of scope; anything at or above
 * it must be accounted for.
 *
 * ## Why successful runs only
 *
 * A failed run has no numbers to record, and requiring a record entry for every `402` would
 * make the tool cry wolf on the exact occasions when the record is least interesting. What the
 * tool is for is a run that produced a number nobody wrote down.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = 'fault-extraction-accuracy.yml';

function usage(message) {
  console.error(`reconcile-readings: ${message}`);
  console.error('usage: node scripts/reconcile-readings.mjs [--runs <api-response.json>] [--readings <file>]');
  process.exit(2);
}

function parseArgs(argv) {
  const out = { runs: null, readings: resolve(ROOT, 'golden-master', 'fault-extraction', 'readings.json') };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--runs') out.runs = resolve(argv[(index += 1)] ?? usage('--runs needs a path'));
    else if (arg === '--readings') out.readings = resolve(argv[(index += 1)] ?? usage('--readings needs a path'));
    else usage(`unknown argument '${arg}'`);
  }
  return out;
}

/** The run ids the record already accounts for, whatever it says about them. */
function recordedIds(record) {
  const ids = new Set();
  for (const reading of record.readings ?? []) if (typeof reading.run === 'number') ids.add(reading.run);
  for (const entry of record.absent ?? []) if (typeof entry.run === 'number') ids.add(entry.run);
  return ids;
}

async function fetchRuns(token) {
  const url = `https://api.github.com/repos/AgentiX-E/rca-bench-factory/actions/workflows/${WORKFLOW}/runs?per_page=100`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'rca-bench-factory-reconcile-readings',
    },
  });
  if (!response.ok) usage(`the run list came back ${String(response.status)} (${response.statusText})`);
  return response.json();
}

const args = parseArgs(process.argv.slice(2));

let record;
try {
  record = JSON.parse(readFileSync(args.readings, 'utf8'));
} catch (error) {
  usage(`could not read the record at ${args.readings}: ${String(error)}`);
}

let payload;
if (args.runs !== null) {
  try {
    payload = JSON.parse(readFileSync(args.runs, 'utf8'));
  } catch (error) {
    usage(`could not read the run list at ${args.runs}: ${String(error)}`);
  }
} else {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token === undefined || token === '') {
    usage('no run list given and no GITHUB_TOKEN in the environment');
  }
  payload = await fetchRuns(token);
}

const runs = payload?.workflow_runs;
if (!Array.isArray(runs)) usage('the run list has no `workflow_runs` array; this is not the API payload shape');

const recorded = recordedIds(record);
const since = recorded.size === 0 ? 0 : Math.min(...recorded);
const successful = runs.filter((run) => run?.conclusion === 'success' && run.id >= since);
const unrecorded = successful.filter((run) => !recorded.has(run.id));

for (const run of unrecorded) {
  const when = String(run.created_at ?? 'unknown time');
  const sha = String(run.head_sha ?? '').slice(0, 8);
  console.log(`UNRECORDED ${String(run.id)}  ${when}  ${sha}  ${String(run.html_url ?? '')}`);
}

if (unrecorded.length > 0) {
  console.error(
    `reconcile-readings: ${String(unrecorded.length)} successful run(s) of ${WORKFLOW} since id ` +
      `${String(since)} are not in the record. ` +
      'Read the artefact with `record-reading.mjs --write`, or name the run in `absent` with the ' +
      'reason it cannot be read -- that route exists for the run whose artefact has really expired.',
  );
  process.exit(3);
}

console.log(
  `reconcile-readings: OK (${String(successful.length)} successful run(s) since id ${String(since)}, every one ` +
    'of them accounted for in ' +
    `${String(recorded.size)} recorded id(s))`,
);
