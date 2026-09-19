#!/usr/bin/env node
/**
 * Generate the RCAEval case descriptors for the official-data round trip.
 *
 * The round trip needs a `--cases` file for `rca-bench ingest`: a list of case
 * descriptors naming the root-cause service, the fault type and the injection
 * time. When the corpus lives in an extracted upstream tree, those three facts
 * are recoverable from the tree itself --
 *
 *   {suite}-{service}-{fault}_{instance}/
 *     inject_time.txt    Unix seconds, the injection time
 *
 * -- so this script derives the descriptor list rather than asking an operator
 * to transcribe one. Transcription is exactly the step that goes wrong quietly:
 * a service misspelled in the descriptor does not fail the ingest, it produces a
 * bundle whose answer key names a component the telemetry never mentions.
 *
 * What it deliberately does not do:
 *
 *   - It does not read the telemetry. `--cases` is a declaration, and the
 *     `inject_time.txt` timestamps are the dataset's own record of when the
 *     fault was injected. Deriving them from metrics would be a different and
 *     much weaker claim.
 *   - It does not invent a `component` for a directory whose name does not parse.
 *     Such a directory is reported and skipped, not guessed at.
 *
 * The suite-to-directory parse is `parseRcaEvalDirectory`, imported from the
 * built package rather than restated, so the reader in the exporter and the
 * reader here cannot drift.
 *
 *   node scripts/gen-rcaeval-cases.mjs --official-dir /tmp/official --out /tmp/cases.json
 *   node scripts/gen-rcaeval-cases.mjs --official-dir /tmp/official --check
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRcaEvalDirectory } from '../packages/core/dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) fail(`${flag} requires a value`);
  return value;
}

const officialDir = argValue('--official-dir');
if (officialDir === undefined) {
  fail('--official-dir is required: point it at an extracted upstream corpus (see scripts/fetch-official.mjs)');
}
const check = process.argv.includes('--check');
const outPath = resolve(argValue('--out') ?? resolve(ROOT, 'golden-master', 'rcaeval-cases.json'));

if (!existsSync(officialDir)) {
  fail(`--official-dir '${officialDir}' does not exist. Fetch the corpus first: node scripts/fetch-official.mjs --anchor rcaeval-re2 --out ${officialDir}`);
}

/** Every case directory under a suite prefix, with its recorded injection time. */
function collectSuite(root, suite) {
  const found = [];
  const unparsed = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    fail(`could not read '${root}': ${error.message}`);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    // A suite directory may be the case itself (`RE2-..._1`) or hold them; both
    // layouts occur in the wild, so a directory that is not a case is descended
    // into once rather than treated as an unreadable name.
    const parsed = parseRcaEvalDirectory(entry.name);
    if (parsed === undefined) {
      const nested = collectSuite(dir, suite);
      found.push(...nested.found);
      unparsed.push(...nested.unparsed);
      continue;
    }
    if (parsed.suite !== suite) continue;

    const injectTimePath = join(dir, 'inject_time.txt');
    if (!existsSync(injectTimePath) || !statSync(injectTimePath).isFile()) {
      unparsed.push({ dir: entry.name, reason: 'no inject_time.txt' });
      continue;
    }
    const raw = readFileSync(injectTimePath, 'utf8').trim();
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || raw === '') {
      unparsed.push({ dir: entry.name, reason: `inject_time.txt is not a number ('${raw}')` });
      continue;
    }
    found.push({
      caseId: entry.name,
      component: parsed.service,
      faultType: parsed.fault,
      injectTime: new Date(seconds * 1000).toISOString(),
      pathPrefix: `${entry.name}/`,
      suite,
    });
  }
  found.sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));
  unparsed.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
  return { found, unparsed };
}

const suites = ['RE1', 'RE2', 'RE3'];
const cases = [];
const unparsed = [];
const perSuite = {};

for (const suite of suites) {
  const result = collectSuite(resolve(officialDir), suite);
  perSuite[suite] = result.found.length;
  cases.push(...result.found);
  unparsed.push(...result.unparsed.map((u) => ({ ...u, suite })));
}

// Reported before the "nothing found" verdict, and deliberately so. A corpus in
// which *every* directory was skipped is the case where the per-directory reason
// matters most, and printing it only on a non-empty result made that the one
// situation where the reason the operator needs was the one they did not get:
// they saw "no case directories found" over a directory plainly full of them.
for (const u of unparsed) {
  console.error(`warning: skipped ${u.suite}/${u.dir}: ${u.reason}`);
}

if (cases.length === 0) {
  fail(
    `no RCAEval case directories found under '${officialDir}'. Expected names of the form ` +
      `{RE1|RE2|RE3}-{service}-{fault}_{instance} each holding inject_time.txt.`,
  );
}

const document = {
  schema: 'rca-bench-rcaeval-cases/1',
  source: 'derived from an extracted official corpus; labels come from the directory names, injection times from inject_time.txt',
  officialDir,
  counts: perSuite,
  cases,
};

const serialised = JSON.stringify(document, null, 2) + '\n';

if (check) {
  if (!existsSync(outPath)) fail(`--check: '${outPath}' does not exist; run without --check to write it`);
  const current = readFileSync(outPath, 'utf8');
  if (current !== serialised) {
    fail(`--check: '${outPath}' is out of date with '${officialDir}'. Re-run without --check and commit the result.`);
  }
  console.log(`Cases match: ${outPath} (${cases.length} case(s): ${suites.map((s) => `${s}=${perSuite[s]}`).join(' ')})`);
  process.exit(0);
}

writeFileSync(outPath, serialised);
console.log(`Wrote ${outPath}`);
console.log(`  ${cases.length} case(s): ${suites.map((s) => `${s}=${perSuite[s]}`).join(' ')}`);
if (unparsed.length > 0) {
  console.log(`  ${unparsed.length} directory(ies) skipped; each is named above with its reason`);
}
