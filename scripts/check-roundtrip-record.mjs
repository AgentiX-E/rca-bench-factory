#!/usr/bin/env node
/**
 * Hold the recorded round trip, the asset registry and the published figures together.
 *
 * ## What this closes
 *
 * P0-1 asked for the real RC AEval corpus to round-trip through this project's
 * export at the official scorer's own rule, and it was open for the whole life of
 * this repository. It is closed: run `38250480271` fetched RE1's three assets,
 * verified all three digests against the registry, derived 375 case descriptors
 * from what it downloaded, and round-tripped **375 of 375 at `oracle=1.00`**.
 *
 * Before this guard, that result existed in exactly one place -- a line in a
 * workflow log -- and the documents that describe it were writing down numbers
 * from a *different* run. `docs/progress.md` said, in a present-tense sentence,
 * "the pass count is still Pass 31's 253 of 375", which had stopped being true.
 * A log line nobody re-reads and a sentence nobody re-checks are the same defect
 * (finding 153), so the result is recorded in `golden-master/roundtrip.json` and
 * this guard holds three things to it: the record's internal consistency, the
 * registry the record claims to agree with, and the figures the documents publish.
 *
 * ## Why the record is committed rather than derived in CI
 *
 * The round trip takes ~65 minutes and downloads 390 MB from a third party; it
 * cannot run in the gate, and `official-data.yml` is the only thing that can
 * produce it. So the record is a **measurement taken elsewhere and committed**,
 * which is the same shape as `golden-master/doc-counts.json` and
 * `golden-master/backend-support.json` -- and, like those, it is only worth
 * anything if something reads it. That is this script, plus the check that the
 * run's own artifact agrees with it, which is the `pins` half below: the registry
 * is machine-readable and already authoritative for the fetch axis, so a record
 * claiming a digest the registry denies fails, and so does a record that omits an
 * asset the registry has pinned.
 *
 * ## Cold-safe
 *
 * It reads three files, so it runs in `docs:check` and in the `cold-tree` job,
 * where no build exists. The two `process.exit(1)` sites in this file are proved
 * by `packages/core/test/check-roundtrip-record.test.ts`, which drives each
 * refusal against a fixture record.
 *
 *   node scripts/check-roundtrip-record.mjs
 *   node scripts/check-roundtrip-record.mjs --record <path> --registry <path> --doc <path>
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const RECORD = resolve(ROOT, 'golden-master', 'roundtrip.json');
const REGISTRY = resolve(ROOT, 'golden-master', 'official-assets.json');
const DOC = resolve(ROOT, 'docs', 'progress.md');

/** The heading the published figures live under. Matched case-insensitively. */
const SECTION = 'the last measured round trip';

function fail(lines) {
  console.error('check-roundtrip-record: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail([`cannot read ${what} at ${path}: ${error.message}`]);
  }
}

/** The registry's assets, whether it is a bare array or wrapped in an object. */
function registryAssets(registry) {
  const value = Array.isArray(registry) ? registry : registry.assets;
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === 'object') return Object.values(value);
  return [];
}

/**
 * The numeric and named figures the document publishes, read from its own rows.
 *
 * Scoped to the section rather than to the file, so a `253 / 375` left standing
 * inside a *dated* record elsewhere in the same file cannot satisfy this: those
 * rows are histories and are supposed to differ, which is exactly the distinction
 * the counts guard learned the hard way (finding 123's round).
 *
 * Scoped to the *heading* rather than to any line that mentions the phrase, and
 * that correction was measured: the first version matched a cross-reference to
 * this section from the headline table near the top of the file, so it read the
 * L5 row and the prose under it and reported every figure as `undefined`. A
 * pointer to a section is not the section.
 */
function readPublished(doc) {
  const lines = doc.split('\n');
  const start = lines.findIndex(
    (line) => line.startsWith('#') && line.toLowerCase().includes(SECTION),
  );
  if (start === -1) return null;

  const figures = {};
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('#')) break;
    if (!line.trimStart().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1);
    if (cells.length < 2) continue;
    const key = cells[0].replace(/`/g, '').trim().toLowerCase();
    const value = cells[1].replace(/`/g, '').trim();
    if (key.includes('anchor')) figures.anchor = value;
    else if (key.includes('cases declared')) figures.declaredCases = Number(value.replace(/[^0-9]/g, ''));
    else if (key.includes('round-tripped')) figures.roundTripped = Number(value.replace(/[^0-9]/g, ''));
    else if (key.includes('did not')) figures.failed = Number(value.replace(/[^0-9]/g, ''));
    else if (key.includes('mean oracle')) figures.meanOracle = Number(value.replace(/[^0-9.]/g, ''));
    else if (key.includes('worst per-case')) figures.worstOracle = Number(value.replace(/[^0-9.]/g, ''));
  }
  return figures;
}

function main() {
  const recordPath = argValue('--record') ?? RECORD;
  const registryPath = argValue('--registry') ?? REGISTRY;
  const docPath = argValue('--doc') ?? DOC;

  const record = readJson(recordPath, 'the round-trip record');
  const problems = [];

  // 1. A record with no run is a claim with no source.
  const run = record.run ?? {};
  if (typeof record.anchor !== 'string' || record.anchor === '') {
    problems.push('the record names no anchor, so nothing says what was round-tripped');
  }
  if (!Number.isInteger(run.id) || run.id <= 0) {
    problems.push('the record names no run id, so its numbers cannot be traced to a run');
  }
  if (typeof run.headSha !== 'string' || !/^[0-9a-f]{7,40}$/.test(run.headSha)) {
    problems.push('the record names no commit, so there is no revision its numbers were measured at');
  }

  // 2. The counts have to be a partition of the corpus.
  const corpus = record.corpus ?? {};
  const { declaredCases, roundTripped } = corpus;
  if (!Number.isInteger(declaredCases) || declaredCases <= 0) {
    problems.push('the record declares no cases, so a pass rate over it would be undefined');
  } else if (!Number.isInteger(roundTripped) || roundTripped < 0 || roundTripped > declaredCases) {
    problems.push(
      `the record reports ${roundTripped} round-tripped out of ${declaredCases}, which is not a ` +
        'subset of the corpus',
    );
  }
  if (typeof corpus.oracle !== 'number' || corpus.oracle <= 0 || corpus.oracle > 1) {
    problems.push(`the record reports oracle ${corpus.oracle}, which is not a score in (0, 1]`);
  }

  // 3. The score block, and the partition it claims.
  //
  // P0-2 asked for a score report on the real corpus and the answer used to be
  // log lines (finding 155). The block is checked here for the property that
  // makes a report readable rather than for its arithmetic: the three statuses
  // partition the declared set, the distribution accounts for every scored case,
  // and the mean is the distribution's mean rather than a number written beside
  // it.
  const scores = record.scores ?? {};
  const oracle = scores.oracle ?? {};
  const distribution = oracle.distribution ?? {};
  if (typeof scores.source !== 'string' || scores.source === '') {
    problems.push('the score block does not say where its numbers came from, which is the defect this record exists to fix');
  }
  const partition = (scores.scored ?? 0) + (scores.skipped ?? 0) + (scores.failed ?? 0);
  if (!Number.isInteger(scores.scored) || partition !== declaredCases) {
    problems.push(
      `the score block accounts for ${partition} of ${declaredCases} declared case(s) ` +
        `(${scores.scored} scored + ${scores.skipped} skipped + ${scores.failed} failed). A report whose ` +
        'records do not cover the declared set is a report about a subset.',
    );
  }
  if (scores.scored !== roundTripped) {
    problems.push(
      `the record says ${roundTripped} case(s) round-tripped and ${scores.scored} scored; those are two ` +
        'names for the same fact and they disagree',
    );
  }
  const distributionTotal = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (Object.keys(distribution).length > 0 && distributionTotal !== scores.scored) {
    problems.push(
      `the distribution accounts for ${distributionTotal} case(s) and ${scores.scored} were scored, so it ` +
        'is a second, independent count that can disagree with the first',
    );
  }
  if (scores.scored === 0) {
    for (const field of ['min', 'max', 'mean']) {
      if (oracle[field] !== null) {
        problems.push(
          `no case was scored and the oracle's ${field} is ${oracle[field]}; an empty score set has no ` +
            `${field}, and zero is a score rather than the absence of one`,
        );
      }
    }
  } else {
    for (const field of ['min', 'max', 'mean']) {
      if (typeof oracle[field] !== 'number') {
        problems.push(`the oracle's ${field} is not a number, so the score block is not readable`);
      }
    }
    if (typeof oracle.min === 'number' && typeof oracle.max === 'number' && typeof oracle.mean === 'number') {
      if (!(oracle.min <= oracle.mean && oracle.mean <= oracle.max)) {
        problems.push(
          `the oracle's mean (${oracle.mean}) is outside [${oracle.min}, ${oracle.max}], which no set of ` +
            'scores can produce',
        );
      }
      for (const [score, count] of Object.entries(distribution)) {
        const value = Number(score);
        if (!(value >= oracle.min && value <= oracle.max)) {
          problems.push(`the distribution holds a score of ${score}, outside [${oracle.min}, ${oracle.max}]`);
        }
        if (!Number.isInteger(count) || count <= 0) {
          problems.push(`the distribution holds ${count} case(s) at ${score}, which is not a count`);
        }
      }
      if (Object.keys(distribution).length > 0) {
        const weighted = Object.entries(distribution).reduce((a, [score, count]) => a + Number(score) * count, 0) / distributionTotal;
        if (Math.abs(weighted - oracle.mean) > 1e-9) {
          problems.push(
            `the mean is ${oracle.mean} and the distribution's mean is ${weighted}; a mean written beside ` +
              'a distribution rather than computed from it is a second number that can drift',
          );
        }
      }
    }
  }

  // 4. The pins, against the registry the workflow itself verifies a fetch against.
  const registry = registryAssets(readJson(registryPath, 'the asset registry'));
  const pins = Array.isArray(record.pins) ? record.pins : [];
  if (pins.length === 0) {
    problems.push('the record carries no pins, so nothing ties it to a particular download');
  }
  for (const pin of pins) {
    if (!/^[0-9a-f]{64}$/.test(String(pin.sha256))) {
      problems.push(`pin '${pin.id}': sha256 is not 64 hex characters, so it is not a digest`);
      continue;
    }
    const asset = registry.find((a) => a.id === pin.id);
    if (asset === undefined) {
      problems.push(`pin '${pin.id}': the registry does not list this asset, so the pin is about nothing`);
      continue;
    }
    if (asset.sha256 !== pin.sha256 || asset.bytes !== pin.bytes) {
      problems.push(
        `pin '${pin.id}': the record says ${pin.bytes} bytes / ${pin.sha256}, the registry says ` +
          `${asset.bytes} bytes / ${asset.sha256}. A record cannot claim a download the registry denies.`,
      );
    }
  }
  // And the other direction: every asset the registry has pinned for this anchor
  // must appear, or a record could quietly drop the one that failed to verify.
  for (const asset of registry) {
    if (typeof asset.sha256 !== 'string') continue;
    if (!asset.id.startsWith(`${record.anchor}-`)) continue;
    if (!pins.some((pin) => pin.id === asset.id)) {
      problems.push(
        `the registry pins '${asset.id}' and the record does not mention it, so the record is a ` +
          'partial account of the download that a reader would take as complete',
      );
    }
  }

  // 5. The documents, scoped to the section that claims to be current.
  const published = readPublished(readFileSync(docPath, 'utf8'));
  if (published === null) {
    fail([
      `no '${SECTION}' section found in ${docPath}.`,
      'The figures have to be published somewhere a reader looks, or the record is a',
      'file nobody reads -- which is the state this guard exists to end.',
    ]);
  }
  if (published.anchor !== record.anchor) {
    problems.push(
      `the document publishes anchor '${published.anchor}' and the record measured '${record.anchor}'`,
    );
  }
  if (published.declaredCases !== declaredCases) {
    problems.push(
      `the document says the corpus declares ${published.declaredCases} cases and the record says ` +
        `${declaredCases}. One of the two is a different run's number.`,
    );
  }
  if (published.roundTripped !== roundTripped) {
    problems.push(
      `the document says ${published.roundTripped} cases round-tripped and the record says ` +
        `${roundTripped}. This is the sentence that stood at 253 for two passes after the run ` +
        'reported 375.',
    );
  }
  const failed = declaredCases - roundTripped;
  if (published.failed !== failed) {
    problems.push(`the document says ${published.failed} cases did not round-trip; the record implies ${failed}`);
  }
  if (scores.scored > 0 && typeof oracle.mean === 'number') {
    if (published.meanOracle !== Number(oracle.mean.toFixed(2))) {
      problems.push(
        `the document publishes a mean oracle of ${published.meanOracle} and the record's distribution has ` +
          `a mean of ${oracle.mean.toFixed(2)}. This is the number P0-2 asks for, so it is the one a reader ` +
          'compares against upstream.',
      );
    }
    if (typeof oracle.min === 'number' && published.worstOracle !== Number(oracle.min.toFixed(2))) {
      problems.push(
        `the document publishes a worst case of ${published.worstOracle} and the record's minimum is ` +
          `${oracle.min.toFixed(2)}`,
      );
    }
  }

  if (problems.length) fail(problems);

  console.log(
    `check-roundtrip-record: OK (${record.anchor}: ${roundTripped}/${declaredCases} at ` +
      `oracle=${corpus.oracle}, mean ${oracle.mean ?? 'n/a'} over ${scores.scored} scored ` +
      `(${scores.skipped} skipped, ${scores.failed} failed), ${pins.length} pin(s) agree with the registry, ` +
      `run ${run.id} on ${run.headSha}; and ${docPath.endsWith('progress.md') ? 'docs/progress.md' : docPath} ` +
      'publishes the same)',
  );
}

main();
