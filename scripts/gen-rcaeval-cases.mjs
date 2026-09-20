#!/usr/bin/env node
/**
 * Generate the RCAEval case descriptors for the official-data round trip.
 *
 * The round trip needs a `--cases` file for `rca-bench ingest`: a list of case
 * descriptors naming the root-cause service, the fault type and the injection
 * time. When the corpus lives in an extracted upstream tree, those three facts
 * are recoverable from the tree itself. The corpus's layout is nested --
 *
 *   {suite}-{system}/{service}_{fault}/{run}/
 *     inject_time.txt    Unix seconds, the injection time
 *
 * -- and the labels are the path, so this script derives the descriptor list
 * rather than asking an operator to transcribe one. Transcription is exactly the
 * step that goes wrong quietly: a service misspelled in the descriptor does not
 * fail the ingest, it produces a bundle whose answer key names a component the
 * telemetry never mentions.
 *
 * ## Why this walks `inject_time.txt` and not directory names
 *
 * It used to descend the tree and test each *directory name* against the flat
 * `{suite}-{service}-{fault}_{instance}` pattern. The corpus has no such
 * directory, and the first real run failed here with "no RCAEval case
 * directories found" over a tree full of them. Two things were wrong with that
 * approach and only one of them was the pattern:
 *
 *   - the layout is nested, so no single directory component carries the case;
 *   - descending is unbounded. `{service}_{fault}` is itself a directory, and
 *     the flat pattern happens to match names like `RE1-ob-cpu_1`, so the walk
 *     could descend into a case and find nothing, or match a directory that is
 *     not a case at all.
 *
 * A case is now identified by the file only a case has -- `inject_time.txt` --
 * and its three path components are parsed from the path that file sits on. That
 * is the same anchor the upstream harness uses, and it makes the search bounded
 * by the number of cases rather than by the depth of the tree.
 *
 * What it deliberately does not do:
 *
 *   - It does not read the telemetry. `--cases` is a declaration, and the
 *     `inject_time.txt` timestamps are the dataset's own record of when the
 *     fault was injected. Deriving them from metrics would be a different and
 *     much weaker claim.
 *   - It does not invent a `component` for a path that does not parse. Such a
 *     path is reported and skipped, not guessed at.
 *
 * The path parse is `parseRcaEvalPath`, imported from the built package rather
 * than restated, so the reader in the exporter and the reader here cannot drift.
 *
 *   node scripts/gen-rcaeval-cases.mjs --official-dir /tmp/official --out /tmp/cases.json
 *   node scripts/gen-rcaeval-cases.mjs --official-dir /tmp/official --check
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRcaEvalPath } from '../packages/core/dist/index.js';

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

/**
 * Every case under `root`, located by its `inject_time.txt` and labelled by the
 * path that file sits on.
 *
 * The walk is bounded to the depth a case can occur at. `parseRcaEvalPath` wants
 * exactly three components, so there is nothing to find below the third level
 * and no reason to look: an unbounded `find` over an extracted corpus spends its
 * time inside `{service}_{fault}` directories and inside whatever the archive
 * shipped beside them, and the deeper it goes the more likely it matches
 * something that is not a case.
 */
function collectCases(root) {
  const found = [];
  const unparsed = [];
  let suiteDirs;
  try {
    suiteDirs = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    fail(`could not read '${root}': ${error.message}`);
  }

  for (const suiteDir of suiteDirs) {
    if (!suiteDir.isDirectory()) continue;
    const suitePath = join(root, suiteDir.name);
    let faultDirs;
    try {
      faultDirs = readdirSync(suitePath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const faultDir of faultDirs) {
      if (!faultDir.isDirectory()) continue;
      const faultPath = join(suitePath, faultDir.name);
      let runDirs;
      try {
        runDirs = readdirSync(faultPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const runDir of runDirs) {
        if (!runDir.isDirectory()) continue;
        const casePath = join(faultPath, runDir.name);
        const injectTimePath = join(casePath, 'inject_time.txt');
        if (!existsSync(injectTimePath) || !statSync(injectTimePath).isFile()) continue;

        // Relative to the corpus root, which is the prefix the ingest resolves
        // every file against. An absolute path here would name a location that
        // does not exist inside the bundle.
        const relativePath = `${suiteDir.name}/${faultDir.name}/${runDir.name}`;
        const parsed = parseRcaEvalPath(relativePath);
        if (parsed === undefined) {
          unparsed.push({ dir: relativePath, reason: 'path does not carry the case layout' });
          continue;
        }

        const raw = readFileSync(injectTimePath, 'utf8').trim();
        const seconds = Number(raw);
        if (!Number.isFinite(seconds) || raw === '') {
          unparsed.push({ dir: relativePath, reason: `inject_time.txt is not a number ('${raw}')` });
          continue;
        }

        found.push({
          // The corpus's own path is the id. Not a re-rendering of it:
          // `rca-bench ingest` keys the bundle on this id and the round trip
          // matches it against the directory it read, so an id spelled
          // differently from the path would make the two sides disagree about
          // which case was scored while both still looked well-formed.
          caseId: relativePath,
          component: parsed.service,
          faultType: parsed.fault,
          injectTime: new Date(seconds * 1000).toISOString(),
          pathPrefix: `${relativePath}/`,
          suite: parsed.suite,
        });
      }
    }
  }

  found.sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));
  unparsed.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
  return { found, unparsed };
}

const cases = [];
const unparsed = [];
const perSuite = { RE1: 0, RE2: 0, RE3: 0 };

const collected = collectCases(resolve(officialDir));
for (const c of collected.found) {
  if (perSuite[c.suite] === undefined) perSuite[c.suite] = 0;
  perSuite[c.suite] += 1;
  cases.push(c);
}
unparsed.push(...collected.unparsed);

// Reported before the "nothing found" verdict, and deliberately so. A corpus in
// which *every* path was skipped is the case where the per-path reason matters
// most, and printing it only on a non-empty result made that the one situation
// where the reason the operator needs was the one they did not get: they saw
// "no case directories found" over a directory plainly full of them.
for (const u of unparsed) {
  console.error(`warning: skipped ${u.dir}: ${u.reason}`);
}

if (cases.length === 0) {
  fail(
    `no RCAEval case directories found under '${officialDir}'. Expected names of the form ` +
      `{RE1|RE2|RE3}-{system}/{service}_{fault}/{run} each holding inject_time.txt.`,
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

/**
 * The per-suite tally, as one line.
 *
 * Rendered from `counts` rather than from a restated suite list: the suites come
 * from the corpus now, not from a constant, and a hard-coded list would print
 * `RE1=0 RE2=0 RE3=0` for the RE3 corpus while every case in it was counted.
 */
function suiteTally() {
  return Object.entries(perSuite)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([suite, count]) => `${suite}=${count}`)
    .join(' ');
}

if (check) {
  if (!existsSync(outPath)) fail(`--check: '${outPath}' does not exist; run without --check to write it`);
  const current = readFileSync(outPath, 'utf8');
  if (current !== serialised) {
    fail(`--check: '${outPath}' is out of date with '${officialDir}'. Re-run without --check and commit the result.`);
  }
  console.log(`Cases match: ${outPath} (${cases.length} case(s): ${suiteTally()})`);
  process.exit(0);
}

writeFileSync(outPath, serialised);
console.log(`Wrote ${outPath}`);
console.log(`  ${cases.length} case(s): ${suiteTally()}`);
if (unparsed.length > 0) {
  console.log(`  ${unparsed.length} path(s) skipped; each is named above with its reason`);
}
