#!/usr/bin/env node
/**
 * Group the published corpus's cases by fault category, and say which reading named each one.
 *
 * ## The question this answers
 *
 * v3.34 fixed a case that the code-level slice was scoring at `oracle=1.00` because the
 * suite stamped `faultCategory: 'code'` on every RE3 case. The fix was right and it changed
 * nothing on the shipped corpus, because on the shipped corpus every RE3 label is a number
 * (`f1`…`f5`) and `inferFaultCategory` reads numbers as `unknown`. That left a question the
 * fix could not answer and this script exists to answer, measured rather than argued:
 *
 *   **What fault categories does the corpus actually contain, and can anything here read
 *   them off a case?**
 *
 * The answer, taken on 2026-11-01 over all nine archives:
 *
 * ```
 * CENSUS 735 case(s) in 3 suite(s), 11 fault type(s): resource 405, network 240, code 90
 * ```
 *
 * Eleven fault types in six categories … and before this round **135 of those 735 cases
 * (18.4%) were `unknown`**: the 45 `socket` cases and the 90 code-level ones. Both families
 * are named by the corpus's own paper; neither is a gap in the data.
 *
 * ## Why it reads central directories instead of a corpus
 *
 * `--index` takes a file written by `scripts/read-remote-index.mjs`, which lists an
 * archive's entries from its central directory over a range request. Nine of those are
 * 625 KB against 5.2 GB, so the census is cheap enough to re-take whenever a pin moves.
 * `--official-dir` reads an extracted tree for a run that already has one, and `--cases`
 * reads a descriptor file — three sources, one reading, because a census that only works
 * on the shape its author had is a census of that shape.
 *
 * ## The directory that is not a case
 *
 * `RE2-OB/checkoutservice_cpu/multi-source-data/` carries an `inject_time.txt` — the file
 * that makes a directory a case — and is not one of the 735: its run component is not a
 * number, its sibling is `multi-source-data.zip`, and it holds a `.DS_Store`. `parseRcaEvalPath`
 * refuses it, which is why the round trip has always reported 735 rather than 736. That was
 * right by a rule nobody had written down; this script prints the directory by path so the
 * rule is a measurement instead of an accident.
 *
 * ## Exit codes
 *
 *   0  every declared case's fault was named by a reading in this repository
 *   1  a fault type no reading names, or `--check` disagrees with the committed census
 *   2  the input could not be read, or it declared no cases at all
 *
 *   node scripts/census-corpus.mjs --index /tmp/idx-RE1-OB.json --index /tmp/idx-RE2-OB.json …
 *   node scripts/census-corpus.mjs --cases /tmp/cases.json
 *   node scripts/census-corpus.mjs --index … --check golden-master/corpus-census.json
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { censusCorpus, describeCensus, parseRcaEvalPath } from '../packages/core/dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MARKER = '/inject_time.txt';

function fail(code, message) {
  console.error(`error: ${message}`);
  process.exit(code);
}

function argValues(flag) {
  const out = [];
  process.argv.forEach((value, index) => {
    if (value !== flag) return;
    const next = process.argv[index + 1];
    if (next === undefined || next.startsWith('--')) fail(2, `${flag} requires a value`);
    out.push(next);
  });
  return out;
}

function argValue(flag) {
  return argValues(flag)[0];
}

/** Every `inject_time.txt` under a directory, as paths relative to it. */
function walk(dir) {
  const found = [];
  const stack = [dir];
  while (stack.length > 0) {
    const here = stack.pop();
    for (const name of readdirSync(here)) {
      const path = join(here, name);
      if (statSync(path).isDirectory()) stack.push(path);
      else if (name === 'inject_time.txt') found.push(path.slice(dir.length + 1));
    }
  }
  return found;
}

/** One declared case from a case directory: the suite is the head component, as the corpus writes it. */
function fromPath(dir) {
  const parsed = parseRcaEvalPath(dir);
  if (parsed === undefined) return undefined;
  return { caseId: dir, suite: parsed.suite, faultType: parsed.fault };
}

const indexPaths = argValues('--index');
const casesPath = argValue('--cases');
const officialDir = argValue('--official-dir');
const jsonOut = argValue('--json');
const checkPath = argValue('--check');

const declared = [];
const notCases = [];
const seenPath = new Set();
/**
 * Where the cases came from, so the census carries its own provenance.
 *
 * An index document already states the URL it was read from, the archive's size, the byte
 * count of its central directory and how much of the archive the reader actually fetched.
 * Repeating those four numbers in the census is not duplication: it is what lets a later
 * reader see that 735 cases were read from 1.19 MB of a 5.16 GB corpus rather than from nine
 * extractions nobody wrote down.
 */
const measurements = [];

for (const path of indexPaths) {
  if (!existsSync(path)) fail(2, `--index '${path}' does not exist`);
  const document = JSON.parse(readFileSync(path, 'utf8'));
  const entries = Array.isArray(document) ? document : document.paths;
  if (!Array.isArray(entries)) fail(2, `--index '${path}' holds no entry list`);
  if (!Array.isArray(document)) {
    measurements.push({
      // `…/RE2-OB.zip?download=1` -> `RE2-OB`, the id the asset registry uses.
      archive: String(document.url ?? path).split('/').pop().replace(/\.zip.*$/, ''),
      url: document.url,
      bytes: document.bytes,
      entries: document.entries,
      centralDirectoryBytes: document.centralDirectoryBytes,
      bytesFetched: document.bytesFetched,
    });
  }
  for (const entry of entries) {
    if (!entry.endsWith(MARKER)) continue;
    const dir = entry.slice(0, entry.length - MARKER.length);
    if (seenPath.has(dir)) continue;
    seenPath.add(dir);
    const one = fromPath(dir);
    if (one === undefined) notCases.push(dir);
    else declared.push(one);
  }
}

if (officialDir !== undefined) {
  if (!existsSync(officialDir)) fail(2, `--official-dir '${officialDir}' does not exist`);
  for (const relative of walk(officialDir)) {
    const dir = relative.slice(0, relative.length - MARKER.length);
    if (seenPath.has(dir)) continue;
    seenPath.add(dir);
    const one = fromPath(dir);
    if (one === undefined) notCases.push(dir);
    else declared.push(one);
  }
}

if (casesPath !== undefined) {
  if (!existsSync(casesPath)) fail(2, `--cases '${casesPath}' does not exist`);
  const document = JSON.parse(readFileSync(casesPath, 'utf8'));
  const entries = Array.isArray(document) ? document : document.cases;
  if (!Array.isArray(entries)) fail(2, `--cases '${casesPath}' holds no case list`);
  for (const entry of entries) {
    declared.push({ caseId: entry.caseId, suite: entry.suite, faultType: entry.faultType });
  }
}

if (declared.length === 0) fail(2, 'no cases were declared, so the census would describe nothing');

const census = censusCorpus({ cases: declared, notCases });
const lines = describeCensus(census);
for (const line of lines) console.log(line);

if (jsonOut !== undefined) {
  const document = {
    schema: 'rca-bench-corpus-census/1',
    takenAt: new Date().toISOString().slice(0, 10),
    measurements,
    cases: census.cases,
    suites: census.suites,
    faultTypes: census.faultTypes,
    categories: census.categories,
    rows: census.rows,
    unnameable: census.unnameable,
    notCases: census.notCases,
  };
  writeFileSync(resolve(jsonOut), `${JSON.stringify(document, null, 1)}\n`);
  console.log(`CENSUS written to ${resolve(jsonOut)}`);
}

if (checkPath !== undefined) {
  if (!existsSync(checkPath)) fail(2, `--check '${checkPath}' does not exist`);
  const committed = JSON.parse(readFileSync(checkPath, 'utf8'));
  const differences = [];
  if (committed.cases !== census.cases) differences.push(`cases: committed ${committed.cases}, measured ${census.cases}`);
  if (committed.faultTypes !== census.faultTypes) {
    differences.push(`fault types: committed ${committed.faultTypes}, measured ${census.faultTypes}`);
  }
  const key = (row) => `${row.suite}/${row.faultType}`;
  const committedRows = new Map((committed.rows ?? []).map((row) => [key(row), row]));
  for (const row of census.rows) {
    const before = committedRows.get(key(row));
    if (before === undefined) differences.push(`${key(row)}: measured ${row.cases} case(s), absent from the committed census`);
    else if (before.cases !== row.cases) differences.push(`${key(row)}: committed ${before.cases}, measured ${row.cases}`);
  }
  for (const row of committedRows.values()) {
    if (!census.rows.some((one) => key(one) === key(row))) differences.push(`${key(row)}: committed, absent from the measurement`);
  }
  const committedNotCases = [...(committed.notCases ?? [])].sort().join('|');
  if (committedNotCases !== [...census.notCases].sort().join('|')) {
    differences.push(`not a case: committed [${committedNotCases}], measured [${census.notCases.join('|')}]`);
  }
  if (differences.length > 0) {
    for (const difference of differences) console.error(`CENSUS MISMATCH ${difference}`);
    console.error(`CENSUS MISMATCH ${differences.length} difference(s) against ${resolve(checkPath)}`);
    process.exit(1);
  }
  console.log(`CENSUS MATCHES ${resolve(checkPath)} (${census.cases} case(s), ${census.faultTypes} fault type(s))`);
}

if (census.unnameable.length > 0) {
  // A fault type nothing here can name is not a style problem: the category it lands in is
  // `unknown`, and every figure grouped by category then carries that case in a bucket
  // labelled "we do not know". Naming the token is the whole output of this branch.
  console.error(
    `CENSUS UNNAMED ${census.unnameable.reduce((total, one) => total + one.cases, 0)} case(s) in ` +
      `${census.unnameable.length} fault type(s) no reading names: ` +
      census.unnameable.map((one) => `${one.faultType} (${one.cases})`).join(', '),
  );
  process.exit(1);
}

console.log(`CENSUS NAMED every case's fault type (${census.cases} case(s))`);
void ROOT;
