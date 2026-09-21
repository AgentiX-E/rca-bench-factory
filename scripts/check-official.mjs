#!/usr/bin/env node
/**
 * Official-metric regression over the shipped example.
 *
 * Runs the published scoring rule of every one of the nine targets against the
 * real exporter output of `examples/order-prod/bundle.json` and pins the exact
 * outcome. This is the end-to-end guarantee the structural checks cannot give:
 * it proves the exported answer key is *scorable* by the upstream rule, not
 * merely well-formed.
 *
 * The expectation is deliberately exact rather than "everything passes": RCAEval
 * RE3 admits code-level faults only and the example is a CPU-saturation case, so
 * RE3 must be skipped for precisely that reason. The script fails if any of the
 * other eight regress, if a target is silently skipped, or if RE3 starts
 * exporting cases without the example gaining a code-level fault.
 *
 * The target-to-exporter mapping is read, not restated. This script used to
 * carry its own nine-entry catalogue beside the one in `packages/cli`, and the
 * copy was silent when wrong: pointing `rcaeval-re1` at the RE2 suite left it
 * printing `PASS rcaeval-re1 cases=1` and exiting 0, because the scorer's own
 * structural check noticed first and the script inherited that verdict. Only
 * RE2 against RE3 - same file names, different admitted cases - had nothing left
 * to catch it. `exportForScoreTarget` is now the single mapping, shared with the
 * CLI, so a wrong suite fails in `dispatch.test.ts` instead.
 *
 * What remains this script's own is the part no unit test can supply: the
 * verdict on the shipped `examples/order-prod/bundle.json`, target by target.
 *
 * ## The official-data round trip
 *
 * With `--official-dir` the script scores a *real* upstream corpus instead of
 * the example. That is the fourth anchor: the three above prove our export is
 * scorable, and this one proves it is scorable against data we did not write.
 *
 * The round trip is deliberately a separate mode rather than a replacement. The
 * default mode reads a committed bundle and its verdict is a contract - eight
 * targets scored, one refused by its own rule - that CI pins line by line. The
 * round trip reads whatever the operator fetched, so its case count is a fact
 * about that corpus and not something to pin.
 *
 * Every line the round trip adds is prefixed `ROUNDTRIP`, so the nine verdict
 * lines above it stay parseable by the same readers and the two modes cannot be
 * confused in a log.
 *
 *   node scripts/check-official.mjs
 *   node scripts/check-official.mjs --official-dir /tmp/official --cases /tmp/cases.json
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  exportForScoreTarget,
  ingestPrimeDataset,
  runAllOfficialRegressions,
  SCORE_TARGET_IDS,
} from '../packages/core/dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BUNDLE_PATH = resolve(ROOT, 'examples/order-prod/bundle.json');

/** The one target the shipped example cannot exercise, and why. */
const SKIPPED = { 'rcaeval-re3': 'the example is a resource fault and RE3 admits code-level faults only' };

/**
 * The column names the RCAEval corpus adapter emits.
 *
 * They are spelled the way `detectFileLayout`'s aliases spell them, so the
 * adapter's output is read by the same detection every other dataset goes
 * through -- there is no second layout contract to keep in step.
 */
const ADAPTED_COLUMNS = ['timestamp', 'service', 'metric', 'value'];

/**
 * The sampling interval RCAEval uses, in seconds.
 *
 * Recorded rather than assumed: the series it publishes is a bare array with no
 * time axis, so the instants have to come from somewhere. A wrong interval
 * shifts every point and the window then selects the wrong slice -- which
 * `assertRcaevalMetrics` refuses to let us do silently.
 */
const RCAEVAL_SAMPLE_SECONDS = 60;

/**
 * Convert the RCAEval `metrics.json` shape into records the ingest reads.
 *
 * RCAEval publishes `{ "metric_name": [v0, v1, ...] }` -- a value per sampling
 * tick, with the metric name as a *key* and no time column at all. The ingest
 * reads records with a timestamp and a metric column, so the two shapes do not
 * meet, and this is where they are joined.
 *
 * The conversion is deliberately loud. Anything the shape does not pin down --
 * a series of uneven length, no series at all, a value that is not a number --
 * makes the case fail by name instead of contributing the points that happened
 * to parse. A metrics.json we can only partly read is one whose fault the round
 * trip cannot claim to have reproduced.
 */
function assertRcaevalMetrics(raw, entry, payloadName = 'metrics.json') {
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (error) {
    return { ok: false, reason: `${payloadName} is not valid JSON: ${error.message}` };
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, reason: `${payloadName} is not a JSON object of metric -> values` };
  }
  const names = Object.keys(doc);
  if (names.length === 0) {
    return { ok: false, reason: `${payloadName} declares no metrics` };
  }
  let length = -1;
  for (const name of names) {
    if (!Array.isArray(doc[name])) {
      return { ok: false, reason: `metric '${name}' is not an array of values` };
    }
    if (length === -1) {
      length = doc[name].length;
      continue;
    }
    if (doc[name].length !== length) {
      // Uneven series have no common time axis. Padding the short one would
      // invent samples; truncating the long one would drop real ones.
      return {
        ok: false,
        reason: `metric '${name}' has ${doc[name].length} sample(s) but the first metric has ${length}`,
      };
    }
  }
  if (length === 0) {
    return { ok: false, reason: 'metrics.json holds zero samples' };
  }

  const injectSeconds = Date.parse(entry.injectTime) / 1000;
  const rows = [ADAPTED_COLUMNS.join(',')];
  for (let index = 0; index < length; index += 1) {
    // The series is centred on the injection instant, which is the only anchor
    // the corpus gives: RCAEval publishes the fault's timestamp and the samples
    // around it, not the sample's own clock.
    const at = new Date((injectSeconds + (index - Math.floor(length / 2)) * RCAEVAL_SAMPLE_SECONDS) * 1000);
    const ts = at.toISOString();
    for (const name of names) {
      const value = doc[name][index];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, reason: `metric '${name}' sample ${index} is not a finite number` };
      }
      rows.push(`${ts},${entry.component},${name},${value}`);
    }
  }
  return { ok: true, csv: rows.join('\n') + '\n' };
}

/**
 * Walk the extracted corpus without holding it.
 *
 * The first version of this read every non-binary file into one
 * `Record<path, string>` and handed that to the rest of the round trip. The real
 * corpus is three archives totalling 4.24 GB that extract to roughly 32 GB on
 * disk, and the run died on it:
 *
 *   FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
 *   [2670:0x42b1f000]  Mark-Compact (reduce) 4113.7 (4116.9) -> 4113.7 (4116.9) MB
 *
 * The map was not load-bearing. Of the three things that read it, two want a
 * fact rather than a body -- whether a case holds an `inject_time.txt`, and how
 * many files the tree has -- and the third, `adaptCase`, re-reads the one
 * `metrics.json` it needs from disk anyway. So the walk now answers those two
 * questions and keeps nothing else, and memory is a function of the largest
 * single case instead of the size of the corpus.
 *
 * What is counted is decided by the *file* rather than by decoding every candidate
 * to look for a NUL byte, so the cost of the walk does not scale with the bytes
 * either. The corpus is telemetry plus the archives' own packaging artefacts; of
 * those only the payload is JSON, CSV or a short text label, so `CORPUS_TEXT_
 * EXTENSIONS` below is the counted set. This agrees with what the body-sniffing
 * walk counted wherever the two overlap -- the payload is text, the packaging is
 * not -- and the two places they can disagree are both deliberate. A binary
 * `metrics.json` is counted here and then refused by name in `adaptCase`, because
 * a present-but-broken payload is a corpus defect to report rather than a file to
 * drop silently; a stray text file that is not telemetry is not counted, which is
 * the more honest number for the line the operator reads.
 *
 * `files` is keyed by path so the caller's lookups are unchanged, and holds one
 * entry per counted file with a `null` body: the map is a set, and its values say
 * so rather than inviting a reader to depend on a body nobody kept.
 *
 * `root` itself is not counted: it is the argument the caller passed, not
 * something the download produced.
 */
/**
 * The extensions the corpus carries telemetry and case labels under.
 *
 * Everything else in the extraction is the archives' own packaging -- `.DS_Store`,
 * icons, manifests -- which is neither counted nor read. `.txt` is here for
 * `inject_time.txt`, which is what identifies a case.
 */
const CORPUS_TEXT_EXTENSIONS = new Set(['.json', '.csv', '.txt', '.log', '.md']);

function walkTree(root) {
  const files = new Map();
  let directories = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        directories += 1;
        walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const dot = entry.name.lastIndexOf('.');
      const extension = dot === -1 ? '' : entry.name.slice(dot).toLowerCase();
      if (!CORPUS_TEXT_EXTENSIONS.has(extension)) continue;
      files.set(path.slice(root.length + 1), null);
    }
  };
  walk(root);
  return { files, directories };
}

/**
 * The payload names an RCAEval case may carry its metric samples under.
 *
 * `metrics.json` is the name *our exporter* writes, and for a long time this
 * script read the corpus under that name too. The corpus does not guarantee it.
 * The upstream harness locates its cases by globbing `**\/data.csv` and reading
 * the labels back out of the path -- recorded in `docs/targets/rcaeval.md` -- so
 * the payload's name belongs to the archive and is not something a reader may
 * assume.
 *
 * The assumption is what the real run died on: 270 descriptors were derived from
 * a download, and the first one read raised `ENOENT` for a `metrics.json` that
 * the corpus had named something else (finding 46). The list below is the set of
 * names this reader will look under, tried in order, and a case carrying none of
 * them is reported by name with the names it did carry -- so a layout that moves
 * again is a finding rather than a crash.
 *
 * `metrics.json` is first because it is what our own exporter writes, so the
 * example bundle and the corpus take the same path when both are well-formed.
 */
const CASE_PAYLOAD_NAMES = ['metrics.json', 'data.csv'];
const CASE_LABEL = 'inject_time.txt';

/**
 * Adapt one corpus subtree to what the ingest reads, or say why it cannot.
 *
 * `metrics.json` is rewritten into the record shape and everything else is
 * dropped: `inject_time.txt` is the case's own label and is already in the
 * descriptor, so feeding it to the ingest only produces a quarantine entry for
 * a file that was never telemetry.
 *
 * This reads the one file it needs, directly. It is why the corpus-wide walk can
 * stop keeping bodies: the adapter never asked for them.
 *
 * ## Why the open is guarded
 *
 * `readFileSync` on a path that is not there throws `ENOENT` from inside
 * `openSync`, and the first line of that stack trace names the syscall rather
 * than the corpus. On the real corpus that was the *entire* diagnostic a
 * ninety-minute run produced: an operator learned that the process crashed at
 * `adaptCase`, not that a case was missing its payload. The two call for
 * different actions -- one says "fix the reader", the other says "the download is
 * incomplete or the layout moved" -- and the log was giving the wrong one.
 *
 * So the failure is converted into a verdict. Every case is attempted rather
 * than abandoned at the first, because a corpus whose payload name is
 * systematically different would otherwise take one dispatch per case to
 * enumerate; the whole list is now reported by one run.
 */
function adaptCase(root, entry) {
  const dir = join(root, entry.caseId);
  const found = locatePayload(dir);

  if (found === undefined) {
    return {
      ok: false,
      reason:
        `no metric payload under any known name (${CASE_PAYLOAD_NAMES.join(', ')}); ` +
        `the case directory holds ${describeDir(dir)}`,
    };
  }
  if (found.reason !== undefined) return { ok: false, reason: found.reason };

  const bytes = readFileSync(found.path);
  // A payload with a NUL in it is not JSON and cannot be telemetry. The check is
  // kept where the bytes are opened, having moved out of the walk, so a binary
  // body under a payload name is still refused rather than decoded into a
  // megabyte of replacement characters for a scorer to search.
  if (bytes.includes(0)) {
    return { ok: false, reason: `${found.name} is binary, not telemetry` };
  }
  const metrics = assertRcaevalMetrics(bytes.toString('utf8'), entry, found.name);
  if (!metrics.ok) return metrics;
  return {
    ok: true,
    files: {
      [`${entry.caseId}/metrics.csv`]: metrics.csv,
    },
  };
}

/**
 * The first payload candidate that exists under `dir`, as a file.
 *
 * Three outcomes, and the caller distinguishes them: a readable candidate, a
 * candidate that is present but not a file, and none present. `undefined` is the
 * third; an object with `reason` is the second. Collapsing the last two would
 * make "the corpus names its payload differently" and "the download is
 * truncated" print the same sentence, and they need different responses.
 */
function locatePayload(dir) {
  const present = [];
  let sawNonFile = null;
  for (const name of CASE_PAYLOAD_NAMES) {
    const path = join(dir, name);
    let stats;
    try {
      stats = statSync(path);
    } catch {
      continue;
    }
    if (stats.isFile()) return { path, name };
    present.push(name);
    sawNonFile ??= `${name} is a ${describeEntryType(stats)}, not a file`;
  }
  if (sawNonFile !== null) return { reason: sawNonFile };
  return present.length === 0 ? undefined : { reason: 'unreachable: non-files are returned above' };
}

/** The names in a directory, sorted, for a reason string an operator can act on. */
function describeDir(dir) {
  try {
    return readdirSync(dir).sort().join(', ') || 'nothing';
  } catch {
    return 'a directory that could not be read';
  }
}

/** A `stat` result in words, for a reason string that has to read as English. */
function describeEntryType(stats) {
  if (stats.isDirectory()) return 'directory';
  if (stats.isSymbolicLink()) return 'symlink';
  return 'non-file entry';
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error(`error: ${flag} requires a value`);
    process.exit(1);
  }
  return value;
}

const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));

// Iterated over `SCORE_TARGET_IDS` and dispatched through the shared mapping, so
// a new target reaches this check the moment the scorer declares it. A hand-
// written table here would have to be remembered.
const exportsByTarget = Object.fromEntries(
  SCORE_TARGET_IDS.map((target) => [target, exportForScoreTarget(bundle, target).files]),
);

const reports = runAllOfficialRegressions(exportsByTarget, { allowEmptyReason: 'checked explicitly below' });
const failures = [];

for (const report of reports) {
  const expectedSkip = SKIPPED[report.target];
  if (expectedSkip !== undefined) {
    if (report.status !== 'skipped') {
      failures.push(`${report.target}: expected a skip (${expectedSkip}) but the status is '${report.status}'`);
    }
    continue;
  }
  if (report.status !== 'passed') {
    failures.push(`${report.target}: expected 'passed' but got '${report.status}' - ${report.failures.join('; ')}`);
  }
  if (report.caseCount === 0) {
    failures.push(`${report.target}: exported no cases, so the official metric was never exercised`);
  }
}

const unknown = Object.keys(SKIPPED).filter((t) => !SCORE_TARGET_IDS.includes(t));
if (unknown.length > 0) failures.push(`unknown skip targets: ${unknown.join(', ')}`);

for (const report of reports) {
  const mark = report.status === 'passed' ? 'PASS' : report.status === 'skipped' ? 'SKIP' : 'FAIL';
  console.log(`${mark}  ${report.target.padEnd(16)} cases=${report.caseCount}  ${report.metric.id}`);
}

if (failures.length > 0) {
  console.error('\nOfficial-metric regression FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const passed = reports.filter((r) => r.status === 'passed').length;
console.log(`\nOfficial-metric regression PASSED (${passed} targets scored, ${reports.length - passed} skipped by contract)`);

// ---------------------------------------------------------------------------
// The official-data round trip, only when asked for.
// ---------------------------------------------------------------------------
const officialDirArg = argValue('--official-dir');
if (officialDirArg === undefined) process.exit(0);

const officialDir = resolve(officialDirArg);
const casesPath = resolve(argValue('--cases') ?? resolve(ROOT, 'golden-master', 'rcaeval-cases.json'));

if (!existsSync(officialDir)) {
  console.error(`error: --official-dir '${officialDir}' does not exist.`);
  console.error('  Fetch the corpus first: node scripts/fetch-official.mjs --anchor rcaeval-re2 --out /tmp/official');
  process.exit(1);
}
if (!existsSync(casesPath)) {
  console.error(`error: --cases '${casesPath}' does not exist.`);
  console.error('  Generate it first: node scripts/gen-rcaeval-cases.mjs --official-dir /tmp/official');
  process.exit(1);
}

const roundTripFailures = [];
const descriptors = JSON.parse(readFileSync(casesPath, 'utf8'));
const { files, directories } = walkTree(officialDir);
const caseCount = Array.isArray(descriptors.cases) ? descriptors.cases.length : 0;

if (caseCount === 0) {
  // Scoring zero cases would report success while exercising nothing, which is
  // the one outcome the fourth anchor exists to prevent.
  roundTripFailures.push('the descriptor file lists no cases, so the round trip would score nothing');
}

/**
 * Every declared case must be present in the corpus.
 *
 * A descriptor that names a directory the corpus does not hold is a mismatch
 * between two artefacts a human generated at different times; the round trip
 * would otherwise score the subset that happens to still exist and report on it
 * as if it were the whole corpus.
 */
const declared = [];
for (const entry of descriptors.cases ?? []) {
  declared.push(entry.caseId);
  if (!files.has(`${entry.caseId}/inject_time.txt`)) {
    roundTripFailures.push(`${entry.caseId}: declared in ${casesPath} but absent from ${officialDir}`);
  }
}
if (declared.length > 0) {
  console.log(`\nROUNDTRIP corpus ${officialDir}`);
  // Files and directories are reported as two numbers under two labels. An
  // earlier version printed one directory count under the word "file", so the
  // line an operator compares between runs was describing two different things
  // depending on the corpus's shape. Counting a directory as a file is the kind
  // of wrong that never fails a test -- it made a shrunk corpus look bigger --
  // so the two are now named for what they are.
  console.log(
    `ROUNDTRIP declared ${declared.length} case(s), found ${files.size} file(s), ` +
      `${directories} directory(ies)`,
  );
}

let roundTripped = 0;
for (const [index, entry] of (descriptors.cases ?? []).entries()) {
  const label = `${String(index + 1).padStart(3)}/${declared.length} ${entry.caseId.padEnd(30)}`;
  if (!files.has(`${entry.caseId}/inject_time.txt`)) continue;

  // One case at a time, over an adapted single-case map.
  //
  // Feeding the whole corpus to one call would put every file in front of
  // `routeFiles`, which then has to decide ownership by prefix -- and a prefix
  // that is a prefix of another case id would silently claim the wrong files.
  // One call per case has no ambiguity to resolve.
  const adapted = adaptCase(officialDir, entry);
  if (!adapted.ok) {
    console.log(`ROUNDTRIP FAIL ${label} reason=${adapted.reason}`);
    roundTripFailures.push(`${entry.caseId}: ${adapted.reason}`);
    continue;
  }

  const ingested = ingestPrimeDataset(adapted.files, {
    dataset: 'rcaeval',
    system: 'rcaeval',
    cases: [
      {
        caseId: entry.caseId,
        component: entry.component,
        faultType: entry.faultType,
        injectTime: entry.injectTime,
        pathPrefixes: [entry.pathPrefix],
      },
    ],
    // The root cause is the service the directory name records, and the ingest
    // keys services as `service:{system}/{name}`. Declaring it is necessary
    // rather than redundant: the corpus records the label and the telemetry may
    // not mention the same name, and a case whose root cause does not resolve is
    // refused by the ingest -- correctly, but uselessly as round-trip evidence.
    //
    // The id is built the way `serviceEntity` builds it, so this declaration
    // merges with the entity derived from the signals instead of standing beside
    // it. Getting that wrong is not silent either: the ingest rejects the case
    // as ambiguous ("it names rcaeval:ob, service:rcaeval/ob"), which is what the
    // first attempt at this did.
    extraEntities: [
      {
        entityId: `service:rcaeval/${entry.component}`,
        kind: 'service',
        name: entry.component,
        system: 'rcaeval',
        aliases: [],
      },
    ],
    leadMs: 10 * 60 * 1000,
  });
  if (!ingested.ok) {
    console.log(`ROUNDTRIP FAIL ${label} reason=ingest refused the case`);
    roundTripFailures.push(`${entry.caseId}: ingest failed - ${ingested.error}`);
    continue;
  }

  const signals = ingested.report[0]?.signals ?? 0;
  const quarantine = ingested.report[0]?.quarantine ?? [];
  if (signals === 0) {
    // A case that produced no signal has told us nothing about the exporter, and
    // counting it as a pass would be the fourth anchor certifying an empty run.
    console.log(`ROUNDTRIP FAIL ${label} signals=0`);
    roundTripFailures.push(
      `${entry.caseId}: the ingest read no signals from the corpus` +
        (quarantine.length > 0 ? ` (first reason: ${quarantine[0].reason})` : ''),
    );
    continue;
  }

  const target = `rcaeval-${entry.suite.toLowerCase()}`;
  const exported = exportForScoreTarget(ingested.bundle, target);
  const report = runAllOfficialRegressions(
    Object.fromEntries(SCORE_TARGET_IDS.map((t) => [t, t === target ? exported.files : {}])),
    { allowEmptyReason: 'the round trip names the single target under test' },
  ).find((r) => r.target === target);

  if (report === undefined) {
    roundTripFailures.push(`${entry.caseId}: target '${target}' produced no report`);
    continue;
  }

  const caseReport = report.cases[0];
  const scored = caseReport === undefined ? 0 : caseReport.oracleScore;
  // RE3 refuses non-code faults, and RCAEval's RE3 slice is exactly the
  // code-level one. A skip here is the target's own contract, not a pass and not
  // a failure -- it is reported and not counted.
  const skipped = report.caseCount === 0;
  const mark = skipped ? 'SKIP' : scored === 1 ? 'PASS' : 'FAIL';
  console.log(
    `ROUNDTRIP ${mark} ${label} target=${target.padEnd(16)} oracle=${scored.toFixed(2)} signals=${signals}`,
  );

  if (skipped) continue;
  if (scored !== 1) {
    roundTripFailures.push(
      `${entry.caseId}: our own export does not score 1.0 under ${target}'s published rule (got ${scored}); ` +
        `the official exporter read ${Object.keys(exported.files).length} file(s)`,
    );
    continue;
  }
  roundTripped += 1;
}

if (roundTripFailures.length > 0) {
  console.error('\nROUNDTRIP FAILED');
  for (const f of roundTripFailures) console.error(`ROUNDTRIP   - ${f}`);
  // Every declared case is accounted for before the exit, so the failure count
  // and the declared count are the same kind of number. Without this line the
  // two can differ and nothing says so -- which is how a report that names four
  // failures can be read as a report about four cases when the run declared
  // three hundred.
  console.error(
    `ROUNDTRIP ${roundTripped} of ${declared.length} declared case(s) round-tripped; ` +
      `${roundTripFailures.length} finding(s)`,
  );
  process.exit(1);
}

// The enumeration gate. A run that scored nothing because every case was
// filtered out is not a pass, and the summary below cannot tell the difference
// on its own: `0 of 270` and `270 of 270` both print a number.
//
// This is the judgement progress.md states -- a threshold gate prevents
// regression, an enumeration gate discovers omission -- applied to the one place
// where the four anchors meet. It is a belt to the braces above: every path that
// can skip a case already records a failure, so reaching here with a gap means a
// path was added that does not.
if (declared.length > 0 && roundTripped !== declared.length) {
  console.error(
    `\nROUNDTRIP FAILED\nROUNDTRIP   - ${declared.length} case(s) declared but ${roundTripped} round-tripped, ` +
      `and no finding names the difference`,
  );
  process.exit(1);
}

console.log(`\nROUNDTRIP PASSED (${roundTripped} case(s) round-tripped through the official layout)`);
