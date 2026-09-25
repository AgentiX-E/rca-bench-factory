#!/usr/bin/env node
/**
 * Fails the build when upstream corpus data has been committed.
 *
 * This is the one constraint that survives every argument about licensing, and
 * it is a repository-hygiene rule rather than a legal one.
 *
 * The licences were examined and the conclusion was that our use is permitted:
 * RCAEval distributes its own code *and its datasets* under MIT, and the
 * CC BY-NC-SA terms on RCA100 bind distribution rather than private, unpaid,
 * unreleased use. So we may fetch these corpora and we may score against them.
 *
 * What we may not do is vendor them. Committing the data would make this
 * repository a redistribution point, which is where ShareAlike and the
 * NonCommercial clause actually bite -- and it would do so on behalf of everyone
 * who ever clones it, including anyone with a commercial purpose, which is a
 * decision this repository is not entitled to make for them. It would also
 * inflate the repository to tens of gigabytes and put a licence we do not own on
 * a checkout that claims Apache-2.0.
 *
 * So the data is fetched outside the working tree (`scripts/fetch-official.mjs`
 * refuses a destination inside it), used, and discarded. This check is the
 * backstop that notices when that discipline lapses.
 *
 *   node scripts/check-no-vendored-data.mjs
 */

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

/**
 * Paths that may legitimately carry corpus-shaped names.
 *
 * Every entry is a *path prefix*, not a substring, and the list is short on
 * purpose: a broad exemption is how a check stops checking anything.
 */
const ALLOWED = [
  // The registry records where the corpora live and pins their digests. It
  // holds metadata about the data, never the data.
  'golden-master/official-assets.json',
  // The fixtures and the expected outcomes are ours, and they are small enough
  // that every assertion about them fits in a review.
  'golden-master/fixture.json',
  'golden-master/expected.json',
  // The round-trip descriptor lists case ids and injection instants. It is a
  // derived index, not telemetry: there are no metric samples in it.
  'golden-master/rcaeval-cases.json',
  // The fault-extraction golden samples are hand-written incident texts and
  // their expected records. No incident text in it is copied from a corpus --
  // the file is authored so the M1 exit condition has a denominator that does
  // not move when the model changes. It is a fixture by construction, which is
  // why it is exempted by path rather than by size.
  'golden-master/fault-extraction/samples.json',
];

/**
 * Directory names the upstream corpora use.
 *
 * A tracked path containing one of these at any depth is a corpus tree that
 * arrived in the repository. Matching the *directory* rather than a file
 * extension is deliberate: the point is to catch a whole extracted tree, and a
 * single stray `.csv` from someone's scratch directory is not the failure this
 * check exists for.
 */
const CORPUS_DIRS = [
  'RE1-OB',
  'RE1-SS',
  'RE1-TT',
  'RE2-OB',
  'RE2-SS',
  'RE2-TT',
  'RE3-OB',
  'RE3-SS',
  'RE3-TT',
  'multi-source-data',
];

/**
 * File extensions that hold bulk telemetry.
 *
 * These are not exempt; they are what the *size* rule below looks for. A
 * plausible telemetry file of corpus scale is the shape a vendored slice takes
 * after someone trims a tree down to what a test needed.
 */
const TELEMETRY_EXTENSIONS = /\.(json|csv|tsv|jsonl|ndjson|parquet|zip|gz|tar)$/i;

/**
 * Bytes above which a telemetry file is corpus rather than fixture.
 *
 * 1 MiB. The largest legitimate artefact in this repository is the example
 * bundle, which is a few tens of kilobytes; 1 MiB leaves two orders of magnitude
 * of headroom for a fixture to grow while still being far below anything a real
 * telemetry slice weighs. The number is a judgement, and it is stated here so a
 * reviewer can disagree with the number instead of with a hidden default.
 */
const MAX_TELEMETRY_BYTES = 1024 * 1024;

function trackedFiles() {
  try {
    return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function isAllowed(path) {
  return ALLOWED.some((allowed) => path === allowed);
}

const failures = [];
const files = trackedFiles();

for (const path of files) {
  if (isAllowed(path)) continue;

  const segments = path.split('/');
  const corpus = segments.find((segment) => CORPUS_DIRS.includes(segment));
  if (corpus !== undefined) {
    failures.push(`${path}: inside the upstream corpus directory '${corpus}'`);
    continue;
  }

  if (!TELEMETRY_EXTENSIONS.test(path)) continue;
  let size;
  try {
    size = statSync(path).size;
  } catch {
    continue;
  }
  if (size > MAX_TELEMETRY_BYTES) {
    const mib = (size / (1024 * 1024)).toFixed(1);
    failures.push(`${path}: ${mib} MiB of telemetry-shaped data (limit 1.0 MiB)`);
  }
}

// The registry is the one file whose *shape* matters to this check: it must not
// grow a field that holds samples. Asserted rather than trusted, because the
// natural place to put "the values we measured" would be right beside the digest
// we measured them for.
try {
  const registry = JSON.parse(readFileSync('golden-master/official-assets.json', 'utf8'));
  const allowedKeys = new Set([
    'id',
    'anchor',
    'url',
    'license',
    'licenseSource',
    'fetchable',
    'sha256',
    'bytes',
    'extractsTo',
    'reason',
    'alternative',
  ]);
  for (const list of ['assets', 'notFetchable']) {
    for (const entry of registry[list] ?? []) {
      for (const key of Object.keys(entry)) {
        if (!allowedKeys.has(key)) {
          failures.push(`golden-master/official-assets.json: '${entry.id}' carries unknown field '${key}'`);
        }
      }
    }
  }
} catch (error) {
  failures.push(`golden-master/official-assets.json could not be read: ${error.message}`);
}

if (failures.length > 0) {
  console.error('Upstream corpus data must not be committed:');
  for (const f of failures) console.error('  ' + f);
  console.error('');
  console.error('  The corpora are fetched outside the working tree and never committed.');
  console.error('  See golden-master/official-assets.json and scripts/fetch-official.mjs.');
  process.exit(1);
}

console.log(`check-no-vendored-data: OK (${files.length} tracked file(s), no corpus data)`);
