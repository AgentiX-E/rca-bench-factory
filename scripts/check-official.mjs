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
 * Every line the round trip adds is prefixed, so the nine verdict lines above it
 * stay parseable by the same readers and the two modes cannot be confused in a
 * log. The prefix is `ROUNDTRIP` for everything this mode decides, and `CENSUS`
 * for the one block it shares with `scripts/census-corpus.mjs` -- reused verbatim
 * rather than respelled, because a second spelling of the same table is how two
 * readers of it come to disagree.
 *
 *   node scripts/check-official.mjs
 *   node scripts/check-official.mjs --official-dir /tmp/official --cases /tmp/cases.json
 *
 * `--report <path>` writes the score report the round trip computed: one record
 * per declared case and a summary over the scored ones. Without it, the only
 * score in existence is the `oracle=` figure on each `ROUNDTRIP` line, which is a
 * log line -- P0-2 asks for a *score report* on the real corpus, and the artifact
 * a workflow uploads had carried the descriptors and the pins and no scores at
 * all. The report is written before **every** exit, including the failing ones,
 * because a run that failed after scoring 300 cases has measured something a
 * reader wants and a report that only appears on success withholds it.
 */

import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHeapStatistics } from 'node:v8';

import {
  accountRoundTrip,
  censusCorpus,
  compareModalityTables,
  describeCensus,
  describeCorpusFault,
  describeModalityComparison,
  exportForScoreTarget,
  ingestPrimeDataset,
  isVocabularyMember,
  MISSING_VALUE_TOKENS,
  MODALITY_TABLES,
  parseDelimited,
  runAllOfficialRegressions,
  SCORE_TARGET_IDS,
  scoreExport,
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
 * The metric-column name a delimited RCAEval payload is normalised under.
 *
 * `metrics.json` carries the metric as a *key* -- `{"cpu_usage": [...]}` -- so the
 * name is in the document. A `data.csv` carries it as a *column header* -- the
 * upstream files open `time,adservice_cpu` or `time,ts-admin-service_mem` -- so a
 * delimited payload is one metric per file and the header is where its name
 * lives. Both then reach the ingest as a `metric` column, because that is what
 * `ADAPTED_COLUMNS` declares and what the rest of the pipeline reads.
 *
 * The header is not used verbatim: it carries the service as well as the metric
 * (`adservice_cpu` is the service `adservice` under the fault's metric `cpu`),
 * and the descriptor already knows which case this is. Splitting it here would
 * invent a service name from a file name, which is the mistake finding 42 was.
 */
const DELIMITED_METRIC_COLUMN = 'metric';

/**
 * A delimited payload's records, as the same record shape `metrics.json` yields.
 *
 * ## Why this exists, and why it is not a second CSV parser
 *
 * The fourth anchor's first successful fetch ingested 375 RE1 cases and failed
 * every one of them with the same sentence:
 *
 *     ROUNDTRIP FAIL 1/375 RE1-OB/adservice_cpu/1
 *       reason=data.csv is not valid JSON: Unexpected token 'i', "time,adserv"...
 *
 * The reader had *found* `data.csv` -- finding 46 put it in the lookup list for
 * exactly this reason -- and then handed it to `assertRcaevalMetrics`, whose first
 * act is `JSON.parse`. `found.name` was threaded through the call for the error
 * message and used for nothing else, so the name decided what the failure was
 * *called* and never what the reader *did*. The result was a message that
 * accurately diagnoses the wrong question: it reports a JSON defect in a file
 * that was never JSON, on all 375 cases, and reads as a corpus problem rather than
 * a dispatch bug.
 *
 * This function does not parse CSV. `parseDelimited` in the ingest module already
 * does, correctly, including quoting and embedded newlines, and it is what every
 * other dataset in this project goes through. Writing a second one here would put
 * two implementations of one format in the tree and would give the corpus a reader
 * the rest of the pipeline does not share -- so the one thing this is allowed to
 * do is turn the rows into the record shape and hand them on.
 *
 * ## What it refuses, and what it does not
 *
 * The same standard `assertRcaevalMetrics` holds: rather than contributing the
 * points that happened to parse, a payload this cannot read in full makes the case
 * fail by name. A partly-read payload is one whose fault the round trip cannot
 * claim to have reproduced, and silently scoring the readable half would be a
 * green round trip that established nothing.
 *
 * "Cannot read" is drawn on the token, not on `Number.isFinite`, because the two
 * are not the same question and treating them as one refused 122 of 375 RE1 cases
 * for a condition the corpus states in plain text. A cell carrying `NaN` is a
 * series declaring it has no reading; a cell carrying `oops` is a file we failed
 * to read. The first is skipped like a blank cell, the second still fails the
 * case. `MISSING_VALUE_TOKENS` is imported from the ingest module so this layer
 * and the reader cannot drift apart on which spellings mean absence.
 */
function adaptDelimitedMetrics(raw, entry, payloadName) {
  const { rows, errors } = parseDelimited(raw, ',');
  if (errors.length > 0) {
    const first = errors[0];
    return {
      ok: false,
      reason: `${payloadName} is not readable as CSV: line ${first.line} ${first.reason}`,
    };
  }
  const header = rows[0];
  if (header === undefined) return { ok: false, reason: `${payloadName} is empty` };

  // The timestamp column, by name, case-insensitively. Upstream's own files call
  // it `time`; being tolerant of the casing is not a guess about the layout, it is
  // the same tolerance `detectFileLayout`'s aliases already carry.
  const timeIndex = header.findIndex((h) => h.trim().toLowerCase() === 'time');
  if (timeIndex === -1) {
    return {
      ok: false,
      reason: `${payloadName} has no 'time' column; its columns are ${header.join(', ')}`,
    };
  }

  const injectSeconds = Date.parse(entry.injectTime) / 1000;
  const out = [ADAPTED_COLUMNS.join(',')];

  /**
   * Which columns belong to the case's own component.
   *
   * ## Why a column name sometimes names an entity
   *
   * RE1's `data.csv` carries the case's own metrics: `time,adservice_cpu,...` for
   * a case about adservice, where the prefix repeats the component and the rest is
   * the metric. RE2's `simple_metrics.csv` carries *every* service in the same
   * table -- 72 columns, 12 entities -- because the corpus records one cluster
   * snapshot per case, not one service.
   *
   * Attributed naively, the second shape files adservice's CPU under
   * checkoutservice, which is not a shape a reader may repair by guessing: the row
   * would say "checkoutservice, adservice_cpu, 0.68" and the export would carry it
   * that way.
   *
   * ## The rule, and why it needs no configuration
   *
   * A table is `entity_metric` when **every** non-time column carries a prefix and
   * there is more than one distinct one. Both halves are observations about the
   * file in hand, and each rules out a shape the other would misread:
   *
   *  - *every column prefixed* is what distinguishes a naming convention from a
   *    metric that happens to contain an underscore. A table of `disk_io, cpu` has
   *    one prefixed column and one bare one, so it is not a convention.
   *  - *more than one prefix* is what distinguishes a cluster snapshot from a
   *    single-service dump. `adservice_cpu, adservice_mem` has one prefix, so it is
   *    a list of that service's metrics and reads exactly as it always did.
   *
   * The first version of this rule also required the component to be among the
   * prefixes, and that made the refusal below unreachable: a table naming
   * `adservice, frontend` for a *cart* case failed the clause, took the old path,
   * and filed both services' series under cartservice -- the mis-attribution this
   * rule exists to prevent, in its worst form, silently. The clause is gone; the
   * component's absence is now a refusal rather than a fallback.
   */
  const columns = header
    .map((name, index) => ({ name: name.trim(), index }))
    .filter((column) => column.index !== timeIndex && column.name !== '');
  const prefixOf = (name) => {
    const at = name.indexOf('_');
    return at <= 0 || at === name.length - 1 ? undefined : name.slice(0, at);
  };
  const prefixes = new Set(columns.map((column) => prefixOf(column.name)).filter((p) => p !== undefined));
  const everyColumnPrefixed = columns.length > 0 && columns.every((column) => prefixOf(column.name) !== undefined);
  const entityPrefixed = everyColumnPrefixed && prefixes.size > 1;
  const kept = entityPrefixed
    ? columns.filter((column) => prefixOf(column.name) === entry.component)
    : columns;
  if (entityPrefixed && kept.length === 0) {
    return {
      ok: false,
      reason:
        `${payloadName} names ${prefixes.size} entities in its columns (${[...prefixes].sort().join(', ')}) ` +
        `and none of them is '${entry.component}'`,
    };
  }
  const droppedColumns = columns.length - kept.length;

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const cell = row[timeIndex];
    if (cell === undefined) continue;
    const seconds = Number(cell.trim());
    if (!Number.isFinite(seconds)) {
      return {
        ok: false,
        reason: `${payloadName} line ${r + 1} has a non-numeric time '${cell}'`,
      };
    }
    // The corpus's own clock is real -- unlike `metrics.json`, whose array carries
    // ordering and no instants -- so it is used as given rather than synthesised
    // from the injection time. `injectSeconds` is read anyway, so a descriptor
    // whose `injectTime` did not parse is refused here instead of being carried
    // into a window that never selects the fault.
    if (!Number.isFinite(injectSeconds)) {
      return { ok: false, reason: `case '${entry.caseId}' has an unparseable injectTime` };
    }
    const ts = new Date(seconds * 1000).toISOString();
    for (const column of kept) {
      const value = row[column.index];
      if (value === undefined || value.trim() === '') continue;
      // The prefix is the entity, so it is not also part of the metric's name.
      // Keeping it would write `adservice_cpu` as a metric of adservice, which
      // reads as a metric named after a service that is already the row's subject.
      const name = entityPrefixed ? column.name.slice(prefixOf(column.name).length + 1) : column.name;
      // A declared missing value is skipped, exactly as a blank cell is, and for
      // the same reason: the corpus is stating that this series has no reading
      // here, which is a fact about the data rather than a failure to read it.
      // The vocabulary comes from the ingest module so the two layers cannot
      // disagree about which spellings mean this.
      //
      // Measured before it was believed: RE1-TT ships the literal text `NaN` in
      // eight `_istio-*` columns of `ts-preserve-other-service` from row 193 to
      // the end, at one shared onset, while that service's other eighteen
      // columns stay populated across the same rows -- a collection gap, not a
      // damaged file (finding 120). Refusing 122 of 375 cases over it was
      // discarding 193 real readings per column to avoid a condition the corpus
      // states in plain text.
      if (isVocabularyMember(MISSING_VALUE_TOKENS, value.trim())) continue;
      const numeric = Number(value.trim());
      if (!Number.isFinite(numeric)) {
        return {
          ok: false,
          reason: `${payloadName} line ${r + 1} column '${name}' is not a finite number: '${value}'`,
        };
      }
      out.push(`${ts},${entry.component},${name},${numeric}`);
    }
  }
  if (out.length === 1) return { ok: false, reason: `${payloadName} holds no samples` };
  return {
    ok: true,
    csv: out.join('\n') + '\n',
    // Reported rather than silently discarded: how much of the table described
    // something other than the case.
    context: entityPrefixed ? { entities: prefixes.size - 1, columns: droppedColumns } : undefined,
  };
}

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
      // JSON has no `NaN` literal, so a declared absence in this payload shape
      // can only arrive as the string. Accepted for the same reason the delimited
      // path accepts it, and skipped for the same reason a blank cell is: the
      // series says it has no reading here. Anything else non-finite is still
      // refused, because a value that is neither a number nor the corpus's
      // spelling of absence is a payload this cannot fully read.
      if (typeof value === 'string' && isVocabularyMember(MISSING_VALUE_TOKENS, value.trim())) continue;
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
const CASE_PAYLOAD_NAMES = ['metrics.json', 'data.csv', 'simple_metrics.csv', 'metrics.csv'];
const CASE_LABEL = 'inject_time.txt';

/**
 * The log and trace tables a corpus case ships, read as input rather than ignored.
 *
 * ## What this closes
 *
 * The fourth anchor scored 735 cases at `oracle=1.00` while every one of their
 * `logs.csv` and `traces.csv` held **a header and no rows**. The official metric
 * reads the case directory name and the metric table; the shape check was
 * satisfied by the two files being present. So RE3 -- the slice that exists to
 * exercise code-level RCA on logs and traces -- round-tripped as a metric-only
 * slice, and nothing said so (finding 315).
 *
 * ## Why the mapping is stated and not detected
 *
 * `detectFileLayout` was measured against these two files and is wrong about all
 * three of their decisions:
 *
 *   - `time` comes first in the timestamp aliases, and both tables open with a
 *     `time` column holding `HH:MM` while the instant sits in a later column --
 *     so detection takes `06:22` as the timestamp and `parseTimestamp` refuses it.
 *     Measured on `RE3-OB/emailservice_f1/1`: 70 076 log rows and 164 920 spans,
 *     0 signals, every row quarantined.
 *   - `container_name` is not a service alias, so a log table's service column is
 *     not found and every row is refused for a missing service.
 *   - `duration` is in the `durationMs` aliases, and this corpus writes
 *     microseconds; read as milliseconds every span is a thousand times too long.
 *
 * A schema that is known is stated. Detection stays what it is for: a file nobody
 * has described.
 *
 * ## Why RE2 was not here, and what was measured before it was
 *
 * Its log table is nine columns, four of which the IR has no field for
 * (`req_path`, `error`, `cluster_id`, `log_template`) and one of which -- `level`
 * -- feeds a closed severity vocabulary. The open question was what happens to a
 * `level` this reader has never seen, and it was answered by reading all 91
 * `logs.csv` files of `RE2-OB.zip`: 15 224 545 rows, six distinct values --
 * `info` 6 202 823, `debug` 5 105 988, `INFO` 2 138 278, empty 1 768 661,
 * `warning` 4 742, `error` 4 053. So there are two spellings problems in one
 * column, and both are mechanical: case (`info`/`INFO` in one cluster) and the
 * vocabulary gap (`warning` where `LOG_SEVERITIES` says `WARN`). Both are handled
 * in `normaliseLogSeverity`, and the column is compared under `transform:
 * 'severity'` so the round trip does not read a normalisation as a loss.
 *
 * The trace table needed nothing: it is the **same eleven columns** as RE3's,
 * verified by reading its header and first rows, with the same units.
 *
 * One thing RE2 does differently, and it is not a schema difference: it calls the
 * front end `frontendservice` in `traces.csv` and `frontend` in `logs.csv` and in
 * every metric column of the same case. That is one service written two ways, so
 * the plan names the map and the reader applies it -- otherwise the span and the
 * log line it caused are two entities.
 */
/**
 * The one service RE2-OB spells two ways.
 *
 * `frontendservice` in `traces.csv`, `frontend` in `logs.csv` and in every metric
 * column of the same case. One constant and not two literals, because the reading
 * plan applies it and the comparison expects it to have been applied: two copies
 * would be two chances to disagree.
 */
const RE2_SERVICE_ALIASES = { frontendservice: 'frontend' };

const MODALITY_PLANS = {
  RE3: [
    {
      table: 'logs',
      file: 'logs.csv',
      spec: {
        signalKind: 'log',
        format: 'csv',
        timeLayout: 'unix_ns',
        layout: {
          timestamp: 'timestamp',
          service: 'container_name',
          logBody: 'message',
          podName: 'pod_name',
          nodeName: 'node_name',
        },
      },
      columns: [
        // `time` is `HH:MM` of the instant, and the corpus stores its own rendering
        // of the same fact. One log row in 61 828 of `RE3-OB/currencyservice_f1/1`
        // has `time` = `06:17` beside a `timestamp` of `1731910619999999863` ns,
        // because the corpus derived that minute through a double at microsecond
        // resolution and 0.14 us below the boundary rounded up across it. So the
        // check is against the instant, and the corpus's disagreement with itself
        // is counted rather than followed.
        { column: 'time', kind: 'derived', from: 'timestamp' },
        { column: 'timestamp', kind: 'truncated', unit: 'ns' },
        { column: 'container_name', kind: 'exact' },
        { column: 'message', kind: 'exact' },
        // The two columns RE3's log table has and RE2's does not. The IR carries
        // them as resource attributes, and until the file layout could name them
        // they were written empty on every file-fed export -- in a table whose
        // declared unfilled columns are none.
        { column: 'pod_name', kind: 'exact' },
        { column: 'node_name', kind: 'exact' },
      ],
    },
    {
      table: 'traces',
      file: 'traces.csv',
      spec: {
        signalKind: 'trace',
        format: 'csv',
        // `startTime` is microseconds; `startTimeMillis` beside it is milliseconds
        // and would work too, but the microsecond column is the finer one and the
        // one the IR's millisecond clock truncates -- which is a fact worth
        // measuring rather than avoiding.
        timeLayout: 'unix_us',
        layout: {
          timestamp: 'startTime',
          service: 'serviceName',
          traceId: 'traceID',
          spanId: 'spanID',
          parentSpanId: 'parentSpanID',
          spanName: 'operationName',
          durationMs: 'duration',
          durationUnit: 'us',
        },
      },
      columns: [
        { column: 'time', kind: 'derived', from: 'startTime' },
        { column: 'traceID', kind: 'exact' },
        { column: 'spanID', kind: 'exact' },
        { column: 'serviceName', kind: 'exact' },
        // The corpus fills this with the last segment of `operationName` in RE2-OB
        // and leaves it empty in RE3-OB; the IR has no field either way.
        { column: 'methodName', kind: 'not-carried' },
        { column: 'operationName', kind: 'exact' },
        { column: 'startTimeMillis', kind: 'exact' },
        { column: 'startTime', kind: 'truncated', unit: 'us' },
        { column: 'duration', kind: 'exact' },
        // `14.0` is in this column 138 times in `emailservice_f1/1`, and 14 is gRPC
        // `UNAVAILABLE`, not an OpenTelemetry status. The exporter writes nothing
        // here, which is why this is `not-carried` rather than compared.
        { column: 'statusCode', kind: 'not-carried' },
        { column: 'parentSpanID', kind: 'exact' },
      ],
    },
  ],
  RE2: [
    {
      table: 'logs',
      file: 'logs.csv',
      spec: {
        signalKind: 'log',
        format: 'csv',
        timeLayout: 'unix_ns',
        layout: {
          timestamp: 'timestamp',
          service: 'container_name',
          logBody: 'message',
          severity: 'level',
        },
      },
      columns: [
        // The same `HH:MM`-beside-nanoseconds shape as RE3's, so the same decision:
        // checked against the instant, not against the corpus's rendering of it.
        { column: 'time', kind: 'derived', from: 'timestamp' },
        { column: 'timestamp', kind: 'truncated', unit: 'ns' },
        { column: 'container_name', kind: 'exact' },
        { column: 'message', kind: 'exact' },
        // Through `normaliseLogSeverity`, the same lookup the ingest uses. The
        // export writes `INFO` for a corpus cell of `info` (6 202 823 rows) and
        // `WARN` for one of `warning` (4 742), and neither is a loss.
        { column: 'level', kind: 'normalised', transform: 'severity' },
        // The four columns this table has and the IR does not. RE3's log table has
        // none of them; this is where `RCAEVAL_UNFILLED_COLUMNS['logs/RE2']` comes
        // from, and the round trip is what checks the two statements agree.
        { column: 'req_path', kind: 'not-carried' },
        { column: 'error', kind: 'not-carried' },
        { column: 'cluster_id', kind: 'not-carried' },
        { column: 'log_template', kind: 'not-carried' },
      ],
    },
    {
      table: 'traces',
      file: 'traces.csv',
      // Eleven columns, byte-identical header to RE3's, same microsecond units --
      // read from the archive rather than assumed, because "the same schema" was a
      // sentence in the target doc and this is the plan that acts on it.
      spec: {
        signalKind: 'trace',
        format: 'csv',
        timeLayout: 'unix_us',
        layout: {
          timestamp: 'startTime',
          service: 'serviceName',
          traceId: 'traceID',
          spanId: 'spanID',
          parentSpanId: 'parentSpanID',
          spanName: 'operationName',
          durationMs: 'duration',
          durationUnit: 'us',
        },
        serviceAliases: RE2_SERVICE_ALIASES,
      },
      columns: [
        { column: 'time', kind: 'derived', from: 'startTime' },
        { column: 'traceID', kind: 'exact' },
        { column: 'spanID', kind: 'exact' },
        // Normalised, not exact: the corpus says `frontendservice` for a service its
        // own log table calls `frontend`. The map is the same constant the reader
        // was given, so the export is expected to hold the mapped name.
        {
          column: 'serviceName',
          kind: 'normalised',
          transform: 'alias',
          aliases: RE2_SERVICE_ALIASES,
        },
        // Non-empty in RE2 and empty in RE3; the IR has no field either way.
        { column: 'methodName', kind: 'not-carried' },
        { column: 'operationName', kind: 'exact' },
        { column: 'startTimeMillis', kind: 'exact' },
        { column: 'startTime', kind: 'truncated', unit: 'us' },
        { column: 'duration', kind: 'exact' },
        { column: 'statusCode', kind: 'not-carried' },
        { column: 'parentSpanID', kind: 'exact' },
      ],
    },
  ],
};

/**
 * The tables a *slice* of a suite ships, when they are not the suite's tables.
 *
 * ## What this closes
 *
 * `MODALITY_PLANS` keys on `entry.suite`, and `RE2` is four characters that cover
 * three corpora -- Online Boutique, SockShop and TrainTicket. The plan said every
 * RE2 case ships both tables, so the 2026-11-09 dispatch failed **90 of 270 cases**
 * with the same sentence:
 *
 *     ROUNDTRIP FAIL 91/270 RE2-SS/carts_cpu/1
 *       reason=RE2 declares a traces table and traces.csv is not readable under RE2-SS/carts_cpu/1
 *
 * The whole SockShop slice, one case at a time. SockShop ships logs and no spans;
 * the failure was not the corpus disagreeing with itself but a plan written for a
 * suite applied to a slice that is not it. The count is the evidence: 90 of 90, so
 * it is a property of the slice and not a partial download -- and a *partial* one
 * would now be a single sentence naming the count (see the absence block after the
 * loop) rather than 90 identical lines.
 *
 * ## Why the logs plan is inherited rather than restated
 *
 * SockShop writes the same nine-column log table (v3.76 reads it for the first
 * time; before this round no run had ever reached a `RE2-SS` case's comparison).
 * Restating the columns here would be a second copy of a fact that a change to one
 * of them would leave behind, and `filter` on `table` says which entry is meant
 * without depending on its position in the list.
 *
 * A slice that is absent from this map uses the suite's plan, which is the right
 * default: a slice is only here when it differs, and inheriting cannot silently
 * empty a plan because `MODALITY_PLANS` is still the authority for the suite.
 */
const SLICE_MODALITY_PLANS = {
  'RE2-SS': MODALITY_PLANS.RE2.filter((one) => one.table === 'logs'),
};

/**
 * The file each modality table is written to, read off the plans.
 *
 * One source for the two names, because the census below asks the *directory* which
 * tables a case carries and the plans are where `logs` ↔ `logs.csv` is stated. A
 * literal map here would be a second copy of that correspondence, and the two would
 * be free to disagree about a table nobody had renamed yet.
 */
const MODALITY_FILES = new Map(
  [...Object.values(MODALITY_PLANS), ...Object.values(SLICE_MODALITY_PLANS)]
    .flat()
    .map((one) => [one.table, one.file]),
);

/**
 * The tables one case's plan names, by slice first and suite second.
 *
 * The slice is the first path component of the case id (`RE2-SS` of
 * `RE2-SS/carts_cpu/1`) and is derived from the id rather than from a new field:
 * the id is the label the corpus writes, and a descriptor cannot disagree with it
 * about which directory the case is.
 */
function planForCase(entry) {
  const slice = String(entry.caseId).split('/')[0];
  return SLICE_MODALITY_PLANS[slice] ?? MODALITY_PLANS[entry.suite] ?? [];
}


/**
 * The payload names are ordered by how much they say about their own schema.
 *
 * `metrics.json` and `data.csv` come first because they are the shapes this
 * repository writes and the shape RE1 ships, and every existing corpus and
 * fixture takes those paths -- putting a newer name in front would change what an
 * existing case reads without changing anything about that case.
 *
 * `simple_metrics.csv` then `metrics.csv` are RE2's, and the order between them is
 * a measurement rather than a preference: the two files describe the *same*
 * instants over 72 and 417 columns, the first per service and the second per pod,
 * and the official rule is defined on the per-service reduction. Reading the
 * larger table when the smaller one is right there would carry 345 columns per
 * sample that no target scores -- and, for `metrics.csv`, entities that are nodes
 * and a load generator rather than the services the answer key names.
 *
 * Both names were added after a dispatch of 2026-10-26 failed all 270 RE2 cases
 * with `no metric payload under any known name (metrics.json, data.csv)`. The
 * corpus was complete; the reader had two names and the corpus has four
 * (finding 263).
 */

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
  // The *content* chooses the reader, not the name.
  //
  // This line used to be `assertRcaevalMetrics(bytes, entry, found.name)`
  // unconditionally, and that is finding 115. `found.name` reached the JSON
  // converter's error message and nothing else, so a `data.csv` -- which finding
  // 46 deliberately added to the lookup list, because the RE1 corpus ships it --
  // was JSON-parsed and rejected on all 375 of RE1's cases with the sentence
  // `data.csv is not valid JSON`. The name was reported correctly and never acted
  // on.
  //
  // Dispatching on the name would be the other half of the same mistake: finding
  // 46's own test built a `data.csv` holding JSON, and a corpus that names a JSON
  // payload `data.csv` is a real thing to have to read. So the decision is made on
  // the bytes -- a payload whose first non-space character is `{` is the
  // `{metric: [values]}` document, and anything else is the delimited shape.
  const text = bytes.toString('utf8');
  const metrics = /^\s*\{/.test(text)
    ? assertRcaevalMetrics(text, entry, found.name)
    : adaptDelimitedMetrics(text, entry, found.name);
  if (!metrics.ok) return metrics;

  const files = { [`${entry.caseId}/metrics.csv`]: metrics.csv };
  const specs = [];
  const plans = [];
  /**
   * The plan's tables this case does not ship.
   *
   * Reported rather than returned as a failure, because "this case is not what its
   * slice is made of" and "this table is not in this corpus" are different claims
   * and only the second is a fact the plan can be wrong about. Before this, a table
   * named by the plan and absent from the directory failed the *case*, which is how
   * one plan written for a suite produced 90 identical failures on the one slice of
   * it that ships logs alone -- and how a genuine partial extraction would have been
   * reported as 90 cases each being individually wrong.
   *
   * What replaces the per-case verdict is counted: the caller sums the absences per
   * slice and table and says one sentence per (slice, table) with the counts. A
   * table absent from *every* case of a slice that plans it is a finding that names
   * the slice; a table absent from *some* is a finding that names the cases. Both are
   * refusals -- what changed is only how many lines they take, and the count that
   * tells the two apart.
   */
  const absent = [];
  for (const modality of planForCase(entry)) {
    const key = `${entry.caseId}/${modality.file}`;
    let body;
    try {
      body = readFileSync(join(dir, modality.file), 'utf8');
    } catch {
      absent.push({ table: modality.table, file: modality.file });
      continue;
    }
    files[key] = body;
    specs.push({ path: key, ...modality.spec });
    plans.push({ table: modality.table, file: modality.file, key, columns: modality.columns });
  }

  return {
    ok: true,
    files,
    specs,
    plans,
    absent,
    context: metrics.context,
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

/**
 * Compare one case's exported log and trace tables with the corpus's own.
 *
 * Returns the verdicts for the log line and the failure reasons for the report;
 * it touches nothing outside itself, so the caller decides what a failure does to
 * the case's record.
 *
 * The export's directory is found by suffix rather than by rebuilding `casePath`:
 * the directory is whatever the exporter says it is, and a second copy of that rule
 * here is a second thing that can drift. `inject_time.txt` is written once per
 * exported case, so the case under test names its own directory.
 */
function compareCaseModalities({ entry, adapted, exported }) {
  const verdicts = [];
  const failures = [];
  const stampKey = Object.keys(exported.files).find((key) => key.endsWith('/inject_time.txt'));
  const exportDir = stampKey === undefined ? undefined : stampKey.slice(0, -'/inject_time.txt'.length);

  for (const plan of adapted.plans) {
    const body = exportDir === undefined ? undefined : exported.files[`${exportDir}/${plan.file}`];
    if (body === undefined) {
      failures.push(`${entry.caseId}: the export carries no ${plan.file}`);
      continue;
    }
    const verdict = compareModalityTables({
      table: plan.table,
      corpus: adapted.files[plan.key],
      exported: body,
      plan: plan.columns,
    });
    verdicts.push(verdict);
    if (verdict.rowCountMatches && verdict.rowsMatch) continue;
    const why = [
      `${verdict.exportedRows} row(s) against the corpus's ${verdict.corpusRows}`,
      verdict.onlyInCorpus > 0 ? `${verdict.onlyInCorpus} signature(s) only in the corpus` : '',
      verdict.onlyInExport > 0 ? `${verdict.onlyInExport} only in the export` : '',
      ...verdict.problems,
      ...verdict.examples,
    ]
      .filter((part) => part !== '')
      .join('; ');
    failures.push(`${entry.caseId}: the exported ${plan.table} table is not the corpus's - ${why}`);
  }
  return { verdicts, failures };
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

/**
 * The bundle the regression verdict is taken on.
 *
 * `--bundle` exists so the failure verdict can be reached. Without it the only
 * input was the shipped example, which passes by construction, so the
 * `failures.length > 0` branch was unreachable and no test *executed* it -- yet
 * `golden-master/gate-sites.json` published it as proved, on the strength of a
 * test that regex-matched this block's source text. A site whose guard cannot
 * fire is not proved by asserting that it is spelled correctly.
 *
 * Additive: with no `--bundle` the resolved path is byte-identical to the
 * constant it replaced, so CI's verdict is unchanged. This mirrors how
 * `check-no-absolute-paths.mjs` gained `--root` for the same reason.
 *
 * `argValue` is a hoisted function declaration, so calling it here -- above its
 * textual definition -- is fine, and it already refuses a flag with no value.
 */
const bundle = JSON.parse(readFileSync(resolve(argValue('--bundle') ?? BUNDLE_PATH), 'utf8'));

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
const scoreReportPath = argValue('--report');
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

/**
 * The heap this run was given, and the number it is expected to stay under.
 *
 * Node's default cap on a 64-bit runner is 4 GB and nothing in this repository ever
 * said so out loud; the 2026-11-09 dispatch found it at case 91 of 270 with
 * `Mark-Compact 4016.6 (4137.1) -> 4015.9 MB` and no other number in 84 minutes of
 * log. The corpus is not ours, so its largest case is not a quantity we can bound by
 * wishing: the only honest arrangement is to measure what a case costs, declare a
 * heap that holds the largest one, and refuse when a run gets close enough to the
 * declaration that the next case of that size would not fit (finding 499).
 *
 * `--heap-budget` exists so the refusal can be reached by a test, which is the same
 * reason `--bundle` exists further up: the branch it drives is otherwise reachable
 * only by building a corpus that nearly exhausts a real runner.
 */
const heapLimitMb = Math.round(getHeapStatistics().heap_size_limit / 1048576);
const heapBudgetMb = Number(argValue('--heap-budget') ?? '') || heapLimitMb;

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
/**
 * One record per declared case, and the summary computed from them.
 *
 * `status` is a closed set: `scored` (the official rule produced a number),
 * `skipped` (the target's own contract refused the fault class, which is
 * neither a pass nor a failure -- RE3 refuses non-code faults), and `failed`
 * (the case did not reach a score). A case that is declared and absent from the
 * corpus is `failed` with that as its reason, because a report whose records do
 * not cover the declared set is a report about a subset.
 *
 * Declared *before* the loop that fills the first of those records. The first
 * version declared it after, so the absent-case branch pushed into a name in its
 * own temporal dead zone: the script threw a ReferenceError, exited non-zero
 * (which is the exit code that branch wants) and wrote no report at all -- a
 * failure that a reader would have taken for "the run failed", and the test that
 * caught it was the one asserting a failing run still produces a report.
 */
const scoreRecords = [];
const declared = [];
/**
 * Every modality table compared, so the run can report what it carried.
 *
 * A per-case line says whether *that* case's tables are the corpus's; this is the
 * total, and it is the number a reader compares between runs. It is also the only
 * place the truncations are summed: a million cells at the millisecond and none of
 * them exact is a fact about the IR's clock, and one line is where it belongs.
 */
const modalityComparisons = [];
for (const entry of descriptors.cases ?? []) {
  declared.push(entry.caseId);
  if (!files.has(`${entry.caseId}/inject_time.txt`)) {
    roundTripFailures.push(`${entry.caseId}: declared in ${casesPath} but absent from ${officialDir}`);
    scoreRecords.push({ caseId: entry.caseId, status: 'failed', reason: 'declared but absent from the corpus' });
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
  // The two numbers that decide whether the run can hold the corpus, printed before
  // the first case rather than discovered at case 181 of 270 (finding 499).
  console.log(
    `ROUNDTRIP heap ${heapLimitMb} MB available, ${heapBudgetMb} MB budget` +
      (heapBudgetMb === heapLimitMb ? '' : ' (declared by --heap-budget)'),
  );
}

let roundTripped = 0;
/**
 * Cases the target refused by its own contract, each with the exporter's reason.
 *
 * Kept as a list rather than a count because the count is what the enumeration
 * gate needs and the list is what a reader needs: "one case was refused" and "this
 * case was refused because RE3 admits code-level faults only" are the same fact
 * with and without the ability to check it.
 */
const contractSkips = [];
/**
 * How much of the corpus described something other than the case's component.
 *
 * A case's table may hold every service in the cluster; only the component's
 * columns are the case. The count is summed here rather than printed per case
 * because 270 lines of "dropped 64 columns" is noise, while one line at the end is
 * a measurement a reader can compare between runs (finding 263).
 */
const droppedContext = { cases: 0, entities: 0, columns: 0 };
/**
 * Per slice and table, how many cases shipped the table and how many did not.
 *
 * The measurement behind the absence refusals below, and the number a reader
 * compares between runs: `RE2-SS logs 90/90, traces 0/90` is the sentence that says
 * SockShop has no spans, and the same line saying `traces 90/90` one week and
 * `traces 0/90` the next is what a broken download looks like.
 */
const modalityCarriage = new Map();
const carriageOf = (slice, table) => {
  const key = `${slice} ${table}`;
  let entry = modalityCarriage.get(key);
  if (entry === undefined) {
    entry = { slice, table, present: 0, absent: 0, firstAbsent: [] };
    modalityCarriage.set(key, entry);
  }
  return entry;
};
/**
 * The largest heap each case was *observed* at, and how long it took.
 *
 * Sampled at the stage boundaries rather than watched continuously: a sample is
 * `process.memoryUsage().heapUsed` at points the run already knows about, so the
 * number is a floor on the true high-water mark and is reported as "the largest
 * heap this case was observed at" rather than as a peak. That is enough for the
 * question it exists to answer -- when a run dies of `Reached heap limit`, the log
 * says which case and how much it was holding, and the two numbers together say
 * whether the job's declared heap is still the right one.
 */
const caseCost = { peakMb: 0, peakCase: null, slowestMs: 0, slowestCase: null, totalMs: 0 };
for (const [index, entry] of (descriptors.cases ?? []).entries()) {
  const label = `${String(index + 1).padStart(3)}/${declared.length} ${entry.caseId.padEnd(30)}`;
  if (!files.has(`${entry.caseId}/inject_time.txt`)) continue;

  // The case's own cost, and the whole of this iteration's bookkeeping.
  //
  // In a `try`/`finally` because the report has to be written after every case: a
  // run that dies at minute 84 of a two-hour corpus took 180 measurements with it,
  // and `emitScoreReport` was called before every *exit* -- but an abort is not an
  // exit. `continue` runs a `finally`, so one call site covers all nine of the
  // loop's ways out (finding 498).
  const startedMs = performance.now();
  const heapSamples = [];
  const sample = () => {
    heapSamples.push(process.memoryUsage().heapUsed / 1048576);
  };
  try {

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
      scoreRecords.push({ caseId: entry.caseId, status: 'failed', reason: adapted.reason });
      continue;
    }

    sample();

    /**
     * What the slice ships, counted for every declared table, whether the plan
     * reads it or not.
     *
     * Counted from the walk's file set rather than from the adapter, so the line
     * describes the corpus and not this script's opinion of it: `RE2-SS traces
     * 0/90` is a fact about SockShop, and it is the fact that made 90 cases fail
     * before the plan knew it (finding 500).
     */
    const slice = String(entry.caseId).split('/')[0];
    for (const table of MODALITY_TABLES) {
      const modFile = MODALITY_FILES.get(table);
      if (modFile === undefined) continue;
      const carrier = carriageOf(slice, table);
      // From the walk's own file set, not from the adapter: `adapted.absent` only
      // names the tables this case's *plan* wanted, so a slice whose plan stopped
      // naming traces would report every case as carrying them. The census is about
      // the corpus, and the corpus is what was walked.
      if (files.has(`${entry.caseId}/${modFile}`)) {
        carrier.present += 1;
      } else {
        carrier.absent += 1;
        if (carrier.firstAbsent.length < 3) carrier.firstAbsent.push(entry.caseId);
      }
    }

    if (planForCase(entry).length > 0 && adapted.plans.length === 0) {
      // A case that ships none of the tables its plan names is not a case the plan
      // describes, and comparing nothing about it would make the round trip's claim
      // about this slice wider than what it read. The sentence names both sides,
      // because "the plan expects two tables" and "the directory holds neither" are
      // the two halves of the disagreement.
      const wanted = planForCase(entry).map((one) => one.file).join(' and ');
      const reason = `${entry.caseId}: its plan names ${wanted}, and the case ships none of them`;
      console.log(`ROUNDTRIP FAIL ${label} reason=no-tables`);
      roundTripFailures.push(reason);
      scoreRecords.push({ caseId: entry.caseId, status: 'failed', reason });
      continue;
    }

    if (adapted.context !== undefined) {
      droppedContext.cases += 1;
      droppedContext.entities += adapted.context.entities;
      droppedContext.columns += adapted.context.columns;
    }

    // What the corpus says this case's fault is, before anything is stamped on it. Computed
    // for every case, not only for RE3: `socket` is a RE2 fault the general classifier cannot
    // name either, and the same rule has to hold for both.
    const corpusFault = describeCorpusFault(entry.faultType);

    const ingested = ingestPrimeDataset(adapted.files, {
      dataset: 'rcaeval',
      system: 'rcaeval',
      cases: [
        {
          caseId: entry.caseId,
          component: entry.component,
          faultType: entry.faultType,
          // No `faultCategory` here any more. Some label states carry no category -- `f1`…`f5`
          // are five distinct code-level faults spelled as indices, `f3_1` spells one of them
          // with an instance suffix, and `socket` is a resource fault whose word this
          // repository's keyword table does not carry -- and until v3.36 this call site
          // restated the rule that resolves them:
          //
          //   - the **label** wins when it carries a category. `RE3-TT/ts-order-service_cpu/1`
          //     says `cpu`, and stamping it `code` round-tripped it `oracle=1.00` inside the one
          //     slice whose published rule admits code-level faults only (finding 343).
          //   - the **taxonomy** decides what an otherwise unreadable label means, and a label
          //     no reading names stays unstamped, so the export refuses it and the refusal
          //     travels as a skip the ledger can see.
          //
          // That rule now lives in `ingest/prime.ts`, because every caller needed it and only
          // this one had it: the ingest path read the descriptor's category and handed an
          // unstated one to the classifier, so an RE3 index label ingested through the library
          // arrived as `unknown`. One home, and this call site is a caller like any other.
          injectTime: entry.injectTime,
          pathPrefixes: [entry.pathPrefix],
          // The declared mapping for every table the case ships. Detection is for
          // files nobody has described; this corpus has been described.
          ...(adapted.specs.length > 0 ? { files: adapted.specs } : {}),
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
      scoreRecords.push({ caseId: entry.caseId, status: 'failed', reason: `ingest failed - ${ingested.error}` });
      continue;
    }

    sample();
    const signals = ingested.report[0]?.signals ?? 0;
    const quarantine = ingested.report[0]?.quarantine ?? [];
    if (signals === 0) {
      // A case that produced no signal has told us nothing about the exporter, and
      // counting it as a pass would be the fourth anchor certifying an empty run.
      const noSignals =
        `${entry.caseId}: the ingest read no signals from the corpus` +
        (quarantine.length > 0 ? ` (first reason: ${quarantine[0].reason})` : '');
      console.log(`ROUNDTRIP FAIL ${label} signals=0`);
      roundTripFailures.push(noSignals);
      scoreRecords.push({ caseId: entry.caseId, status: 'failed', reason: noSignals });
      continue;
    }

    const target = `rcaeval-${entry.suite.toLowerCase()}`;
    const exported = exportForScoreTarget(ingested.bundle, target);
    sample();

    // The shape contract, run on real data -- which it never was.
    //
    // `runAllOfficialRegressions` below applies the published *metric*, and the
    // metric reads the case directory name, not the files. So 270 RE2 cases scored
    // 1.00 while carrying a `traces.csv` with eight invented columns: the check that
    // would have refused it existed, was green against our own fixtures, and was
    // never called on a corpus (finding 266).
    //
    // It is called here rather than added to the metric on purpose: they answer
    // different questions, and folding one into the other is how a shape failure
    // would come to be reported as a wrong answer.
    /**
     * The layout contract, read against **this case's** tables rather than its
     * suite's.
     *
     * `scoreExport` derives the expected modality set from the target's suite --
     * "RE2 requires logs and traces" -- which is true of 180 of RE2's 270 cases and
     * false of the 90 SockShop ones that ship logs alone. Applied to those, the
     * contract reported a violation for the shape the corpus actually has, and the
     * run's own plan (once it stopped demanding traces) handed the case over to a
     * check that demanded them anyway. Two claims about one case have to have one
     * source, and the source is the directory the case sits in.
     */
    const ships = { logs: adapted.plans.some((one) => one.table === 'logs'), traces: adapted.plans.some((one) => one.table === 'traces') };
    const shape = scoreExport(target, exported.files, undefined, ships);
    sample();
    const report = runAllOfficialRegressions(
      Object.fromEntries(SCORE_TARGET_IDS.map((t) => [t, t === target ? exported.files : {}])),
      // No `allowEmptyReason` here, and the absence is the fix (finding 343).
      //
      // The reason this call used to pass -- "the round trip names the single target
      // under test" -- explains why the *other* seven targets are empty, which is a
      // fact about the caller and not about this target. It was accepted for every
      // target alike, so `status` read `skipped` for an exporter that had written
      // nothing at all, and the caller then made the same inference a second time
      // from `caseCount`. What makes an empty read legitimate is decided once,
      // below, against the answer the exporter itself gave.
    ).find((r) => r.target === target);

    if (report === undefined) {
      roundTripFailures.push(`${entry.caseId}: target '${target}' produced no report`);
      scoreRecords.push({ caseId: entry.caseId, status: 'failed', reason: `target '${target}' produced no report` });
      continue;
    }

    const caseReport = report.cases[0];
    const scored = caseReport === undefined ? 0 : caseReport.oracleScore;
    // A target can read zero cases for two reasons, and they are not the same
    // reason: the target's own contract refused the case, or the export did not
    // reach it. Only the exporter can tell them apart, because only the exporter
    // writes down which cases it declined and why -- `ExportOutcome.skipped`, the
    // field its own doc comment warns a caller not to drop.
    //
    // A named refusal is the contract: RE3 admits code-level faults only, so a
    // resource fault in that slice is not a failed export but a case the slice does
    // not hold. An empty read with no name beside it is a defect, and reporting it
    // as a skip is how a case leaves a green run without a line anywhere.
    const refusal = exported.skipped.find((one) => one.caseId === entry.caseId);
    const skipped = report.caseCount === 0 && refusal !== undefined;
    const mark = skipped ? 'SKIP' : scored === 1 ? 'PASS' : 'FAIL';
    console.log(
      `ROUNDTRIP ${mark} ${label} target=${target.padEnd(16)} oracle=${scored.toFixed(2)} signals=${signals}`,
    );

    if (skipped) {
      // The reason is the exporter's sentence, not a paraphrase of it: a skip that
      // reads "the target refuses this fault class" for a case dropped because its
      // telemetry carried no metric names the wrong party.
      console.log(`ROUNDTRIP SKIP ${label} target=${target} reason=${refusal.reason}`);
      contractSkips.push({ caseId: entry.caseId, target, reason: refusal.reason });
      scoreRecords.push({ caseId: entry.caseId, target, status: 'skipped', reason: refusal.reason });
      continue;
    }

    if (report.caseCount === 0) {
      const reason =
        `${entry.caseId}: ${target} read no case from the export and the exporter named no reason for it ` +
        `(it wrote ${String(Object.keys(exported.files).length)} file(s) and declined ` +
        `${String(exported.skipped.length)} case(s))`;
      console.log(`ROUNDTRIP FAIL ${label} empty-read`);
      roundTripFailures.push(reason);
      scoreRecords.push({ caseId: entry.caseId, target, status: 'failed', reason });
      continue;
    }

    // A refusal is not a shape: an RE3 case the exporter declines writes no files at
    // all, and judging that empty directory against the layout would report the
    // refusal as a malformed export. Both zero-case paths above `continue` before
    // this, so what reaches here has files to judge.
    if (!shape.passed) {
      // `scoreExport` answers with a report whose checks live under `structure`; this read used the
      // pre-report field name, `shape.checks`, which stopped existing when the report grew its terms.
      // Nothing noticed for two reasons, and the second is the defect: the branch is only reached by a
      // case that scores 1.00 and *still* does not match the target's layout, so every green run
      // stepped over it -- and the first run that reached it, the weekly official-corpus job on
      // 2026-11-02, ended in `TypeError: Cannot read properties of undefined (reading 'filter')`
      // instead of naming the field that was wrong (finding 496).
      const failing = shape.structure.checks.filter((c) => !c.passed).map((c) => `${c.id} (${c.detail})`);
      const sentence = `the export does not match ${target}'s field contract - ${failing.join('; ')}`;
      const reason = `${entry.caseId}: ${sentence}`;
      // The count *and* the sentence, on the case's own line. It used to be the count
      // alone, with the sentence going into the failure list that the epilogue prints
      // -- and the 2026-11-09 run printed `shape=1` twice and then died of the heap
      // before the epilogue, so the only two refusals that run found are now
      // unreadable, three lines of `id (detail)` that nobody has (finding 497).
      console.log(`ROUNDTRIP FAIL ${label} shape=${shape.structure.checks.filter((c) => !c.passed).length} ${sentence}`);
      roundTripFailures.push(reason);
      scoreRecords.push({ caseId: entry.caseId, target, status: 'failed', reason });
      continue;
    }

    if (scored !== 1) {
      const sentence =
        `our own export does not score 1.0 under ${target}'s published rule (got ${scored}); ` +
        `the official exporter read ${Object.keys(exported.files).length} file(s)`;
      const reason = `${entry.caseId}: ${sentence}`;
      // A line, because this branch had none: it pushed a finding and continued, so
      // the case's only trace was the `PASS`/`FAIL` mark above -- which says `FAIL`
      // only when the score is not 1.00 and therefore does say so -- and the reason
      // was again epilogue-only. Same defect as `shape` above, one branch over.
      console.log(`ROUNDTRIP FAIL ${label} oracle=${scored.toFixed(2)} ${sentence}`);
      roundTripFailures.push(reason);
      scoreRecords.push({ caseId: entry.caseId, target, status: 'failed', score: scored, reason });
      continue;
    }

    // The two tables RE3 exists for, compared with the corpus they came from.
    //
    // After the score rather than instead of it, because they answer different
    // questions: the score says the case is loadable by the official rule, and this
    // says the log and trace tables in the export are the corpus's tables rather than
    // two headers. Until this existed, both were empty on every RE3 case and the
    // score was 1.00 anyway (finding 315).
    //
    // Placed after the two branches above so a case is recorded exactly once: a
    // failing modality must not also be filed as `scored`.
    const modality = compareCaseModalities({ entry, adapted, exported });
    sample();
    modalityComparisons.push(...modality.verdicts);
    for (const verdict of modality.verdicts) {
      console.log(`ROUNDTRIP MODALITY ${label} ${describeModalityComparison(verdict)}`);
    }
    if (modality.failures.length > 0) {
      console.log(`ROUNDTRIP FAIL ${label} modalities`);
      for (const failure of modality.failures) roundTripFailures.push(failure);
      scoreRecords.push({ caseId: entry.caseId, target, status: 'failed', reason: modality.failures.join('; ') });
      continue;
    }

    scoreRecords.push({ caseId: entry.caseId, target, status: 'scored', score: scored });
    roundTripped += 1;
  } finally {
    /**
     * What this case cost, on its record and -- when it is a new high-water mark --
     * on its own line.
     *
     * The print is conditional because 270 identical "heap=… ms=…" lines are noise
     * and the useful shape is the *curve*: a case that costs more than any case
     * before it is the one that moved, and eight such lines across a corpus say
     * everything the 270 would. The exact number for every case is in the report,
     * which is written as JSON and read by a program rather than by eye.
     *
     * The numbers exist because the run that died did not have them: 84 minutes of
     * log, one line per case, and nothing anywhere saying how much memory the thing
     * was holding when the heap ran out at 4016 MB (finding 499).
     */
    const elapsedMs = performance.now() - startedMs;
    const peakMb = heapSamples.length === 0 ? 0 : Math.max(...heapSamples);
    const record = scoreRecords[scoreRecords.length - 1];
    if (record !== undefined && record.caseId === entry.caseId) {
      record.heapMb = Math.round(peakMb);
      record.ms = Math.round(elapsedMs);
    }
    caseCost.totalMs += elapsedMs;
    const heavier = peakMb > caseCost.peakMb;
    const slower = elapsedMs > caseCost.slowestMs;
    if (heavier) {
      caseCost.peakMb = peakMb;
      caseCost.peakCase = entry.caseId;
    }
    if (slower) {
      caseCost.slowestMs = elapsedMs;
      caseCost.slowestCase = entry.caseId;
    }
    if (heavier || slower) {
      console.log(
        `ROUNDTRIP COST ${label} heap=${Math.round(peakMb)}MB ${(elapsedMs / 1000).toFixed(1)}s ` +
          `(${heavier ? 'largest' : ''}${heavier && slower ? ' and ' : ''}${slower ? 'slowest' : ''} so far)`,
      );
    }
    emitScoreReport();
  }
}

/**
 * Write the score report, when one was asked for.
 *
 * Called after **every case** as well as before every exit, because the two are not
 * the same guarantee. The comment here used to say "called before every exit, so a
 * run that scored 300 of 375 has measured something" -- and then the 2026-11-09
 * dispatch died at case 181 of 270 with `FATAL ERROR: Reached heap limit` and the
 * uploaded artifact held `pins.json` and `rcaeval-cases.json` and **no scores at
 * all**. An abort is not an exit: `process.exit` was never called, so the writer
 * never ran, and 180 measurements plus the sentence for every case that had failed
 * went with it. The run that most needs a report is exactly the one that cannot
 * reach the end of the function (finding 498).
 *
 * The file is written atomically (temp then rename) so a reader never sees a
 * half-written report, which is also what makes it safe to write on every case: a
 * reader polling the artifact sees either the previous complete report or this one.
 * Two hundred and seventy rewrites of a small JSON document cost nothing against
 * twenty-five seconds per case.
 *
 * Silent, because it is now called per case: the path and the counts are printed
 * once by the caller.
 */
function emitScoreReport() {
  if (scoreReportPath === undefined) return;
  const scoredCases = scoreRecords.filter((r) => r.status === 'scored');
  const scores = scoredCases.map((r) => r.score);
  const distribution = {};
  for (const score of scores) {
    const key = String(score);
    distribution[key] = (distribution[key] ?? 0) + 1;
  }
  const report = {
    schema: 'rca-bench-rcaeval-scores/1',
    corpus: officialDir,
    casesFile: casesPath,
    targets: [...new Set(scoreRecords.map((r) => r.target).filter(Boolean))],
    summary: {
      declared: declared.length,
      scored: scoredCases.length,
      skipped: scoreRecords.filter((r) => r.status === 'skipped').length,
      failed: scoreRecords.filter((r) => r.status === 'failed').length,
      // An empty score set has no minimum. `null` rather than `0`, because zero
      // is a score and "no case scored" is not one; a reader comparing the two
      // would take an empty run for a failing one.
      oracle: scores.length === 0
        ? { min: null, max: null, mean: null, distribution }
        : {
            min: Math.min(...scores),
            max: Math.max(...scores),
            mean: scores.reduce((a, b) => a + b, 0) / scores.length,
            distribution,
          },
      // What the corpus ships, per slice and table, in every report -- including a
      // report written at case 40 of 270 by a run that then died, which is the only
      // place that number would otherwise never appear.
      modalities: [...modalityCarriage.values()].map((one) => ({
        slice: one.slice,
        table: one.table,
        present: one.present,
        absent: one.absent,
        firstAbsent: one.firstAbsent,
      })),
      cost: {
        peakMb: Math.round(caseCost.peakMb),
        peakCase: caseCost.peakCase,
        slowestMs: Math.round(caseCost.slowestMs),
        slowestCase: caseCost.slowestCase,
        totalMs: Math.round(caseCost.totalMs),
        // Both numbers, because the comparison above is against the budget and a
        // reader who saw only the limit would compute a different percentage.
        heapBudgetMb,
        heapLimitMb,
      },
    },
    cases: scoreRecords,
  };
  const temp = `${scoreReportPath}.partial`;
  writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(temp, scoreReportPath);
}

if (droppedContext.cases > 0) {
  console.log(
    `ROUNDTRIP context ${droppedContext.cases} case(s) carried other entities in their table; ` +
      `${droppedContext.columns} column(s) across ${droppedContext.entities} entity reference(s) were ` +
      `not the case's component and were not attributed to it`,
  );
}

/**
 * A table a slice plans and the corpus does not carry, said once per slice.
 *
 * Two outcomes and they are different sentences. A table absent from **every** case
 * of the slice is a claim about the slice that is wrong -- SockShop, 90 of 90 -- and
 * the repair is a slice-level plan, which is what `SLICE_MODALITY_PLANS` is. A table
 * absent from **some** cases of a slice that otherwise carries it is an anomaly: the
 * extraction lost part of the corpus, or those cases genuinely were not instrumented,
 * and either way the run must not pass, because the alternative is a subset silently
 * standing in for the slice (finding 500).
 *
 * Before this, both were 90 identical per-case lines, one per case, each saying the
 * same thing about a corpus that had not changed.
 */
for (const carrier of modalityCarriage.values()) {
  if (carrier.absent === 0) continue;
  const planned = (SLICE_MODALITY_PLANS[carrier.slice] ?? MODALITY_PLANS[carrier.slice.split('-')[0]] ?? []).some(
    (one) => one.table === carrier.table,
  );
  if (!planned) continue;
  const total = carrier.present + carrier.absent;
  // Which plan made the claim: the slice's own if it has one, and the suite's
  // otherwise. Named because the two repairs are different -- a slice ships what it
  // ships and needs a `SLICE_MODALITY_PLANS` entry, while a *partial* absence is about
  // the download rather than about the plan.
  const plannedBy = SLICE_MODALITY_PLANS[carrier.slice] !== undefined ? carrier.slice : carrier.slice.split('-')[0];
  roundTripFailures.push(
    carrier.present === 0
      ? `${carrier.slice}: none of its ${total} case(s) carries ${carrier.table}.csv, which the ` +
        `${plannedBy} plan names; either the slice ships no such table and needs a slice entry, or the ` +
        `download is incomplete`
      : `${carrier.slice}: ${carrier.absent} of ${total} case(s) carry no ${carrier.table}.csv, so the ` +
        `${carrier.table} table its plan names was compared on only ${carrier.present} of them ` +
        `(first: ${carrier.firstAbsent.join(', ')})`,
  );
}

if (modalityCarriage.size > 0) {
  // What the corpus ships, per slice and table, read from the walk rather than from
  // the plans: the plan is this script's claim and this line is the corpus's answer,
  // and a reader comparing two runs sees a slice lose its spans here before any
  // comparison notices. One line per slice, tables in the order the IR names them.
  const slices = [...new Set([...modalityCarriage.values()].map((one) => one.slice))]
    // Only the slices this script reads tables for. A slice with no plan at all (RE1
    // is metrics-only) gets no line, because a line of zeros about a suite whose
    // tables are never read is the same confusion the silence rule above exists for:
    // it would read as "read them, found nothing" rather than "not read".
    .filter((slice) => SLICE_MODALITY_PLANS[slice] !== undefined || MODALITY_PLANS[slice.split('-')[0]] !== undefined)
    .sort();
  for (const slice of slices) {
    const parts = MODALITY_TABLES.map((table) => {
      const carrier = modalityCarriage.get(`${slice} ${table}`);
      const total = carrier === undefined ? 0 : carrier.present + carrier.absent;
      return carrier === undefined ? '' : `${table} ${carrier.present}/${total}`;
    }).filter((part) => part !== '');
    console.log(`ROUNDTRIP CENSUS modalities ${slice}: ${parts.join(', ')}`);
  }
}

if (modalityComparisons.length > 0) {
  // One line for the whole run, because the per-case lines say "this case's tables
  // are the corpus's" and this says how much of the corpus was carried to say it.
  // An empty modalities section prints nothing at all rather than a zero, so a run
  // that read no log or trace table cannot be mistaken for one that read them and
  // found them empty.
  const rows = (table) => modalityComparisons.filter((c) => c.table === table).reduce((sum, c) => sum + c.exportedRows, 0);
  const corpusRows = (table) => modalityComparisons.filter((c) => c.table === table).reduce((sum, c) => sum + c.corpusRows, 0);
  const exactColumns = modalityComparisons.reduce((sum, c) => sum + c.columns.filter((col) => col.kind === 'exact').length, 0);
  const totalColumns = modalityComparisons.reduce((sum, c) => sum + c.columns.length, 0);
  const truncatedCells = modalityComparisons.reduce(
    (sum, c) => sum + c.columns.filter((col) => col.kind === 'truncated').reduce((n, col) => n + col.lossy, 0),
    0,
  );
  const notCarried = modalityComparisons.reduce(
    (sum, c) => sum + c.columns.filter((col) => col.kind === 'not-carried').reduce((n, col) => n + col.lossy, 0),
    0,
  );
  console.log(
    `ROUNDTRIP modalities ${modalityComparisons.length} table(s) over ` +
      `${new Set(modalityComparisons.map((c) => c.table)).size} modality(ies): ` +
      `${rows('logs')} of ${corpusRows('logs')} log row(s), ${rows('traces')} of ${corpusRows('traces')} span(s); ` +
      `${exactColumns} of ${totalColumns} column(s) exact, ` +
      `${truncatedCells} cell(s) truncated to the millisecond, ` +
      `${notCarried} value(s) in columns the IR does not carry`,
  );
}

/**
 * What the run cost, and whether it still fits.
 *
 * The peak is the largest heap any case was observed at; the comparison is against
 * the number this run was given, which on a runner is Node's cap and can be set with
 * `--max-old-space-size`. A run at 90% of its heap has not passed: it has one case
 * left before it dies, and the death has no sentence in it (`Reached heap limit` is
 * printed by V8, not by this script, and carries no case name). So the refusal is
 * made while the run can still say which case and by how much (finding 499).
 */
if (caseCost.peakCase !== null) {
  const share = heapBudgetMb === 0 ? 0 : caseCost.peakMb / heapBudgetMb;
  console.log(
    `ROUNDTRIP cost ${declared.length} case(s) in ${(caseCost.totalMs / 60000).toFixed(1)} min; largest ` +
      `${Math.round(caseCost.peakMb)} MB of the ${heapBudgetMb} MB this run was given ` +
      `(${Math.round(share * 100)}%) at ${caseCost.peakCase}; slowest ${(caseCost.slowestMs / 1000).toFixed(1)} s at ` +
      `${caseCost.slowestCase}`,
  );
  if (share >= 0.9) {
    roundTripFailures.push(
      `the largest case used ${Math.round(caseCost.peakMb)} MB, ${Math.round(share * 100)}% of the ` +
        `${heapBudgetMb} MB heap this run was given (${caseCost.peakCase}); the next case of that size ` +
        `would not fit, so the number in the job has to grow deliberately rather than by accident`,
    );
  }
}

if (scoreReportPath !== undefined) {
  // The path and the counts, printed once now that the file is rewritten after every
  // case. A reader who gets this line knows the file exists; the run that dies before
  // this line still leaves the file behind, which is the whole point.
  console.log(
    `ROUNDTRIP report ${scoreReportPath}: ${scoreRecords.filter((r) => r.status === 'scored').length} scored, ` +
      `${scoreRecords.filter((r) => r.status === 'skipped').length} skipped, ` +
      `${scoreRecords.filter((r) => r.status === 'failed').length} failed`,
  );
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
  emitScoreReport();
  process.exit(1);
}

// The enumeration gate. A run that scored nothing because every case was
// filtered out is not a pass, and the summary below cannot tell the difference
// on its own: `0 of 270` and `270 of 270` both print a number.
//
// This is the judgement progress.md states -- a threshold gate prevents
// regression, an enumeration gate discovers omission -- applied to the one place
// where the four anchors meet. It is a belt to the braces above: every path that
// can drop a case records a failure, so reaching here with a gap means a path was
// added that does not.
//
// The arithmetic is not here any more. It is `score/roundtrip-account.ts`, because
// this branch cannot be taken on purpose: a run that fails it means a path was
// added that drops a case silently, and there is no input to write for a path that
// does not exist. Extracting the sum leaves this block holding one decision -- exit
// or print -- and gives the part that *can* be tested a signature (finding 343).
//
// A case the target refused by its own contract counts as accounted for, and the
// earlier version did not say so: it compared `roundTripped` against `declared`,
// which made every named refusal a gap as well. The two sentences lived in one
// file -- the skip above says such a case "is not a pass and not a failure", this
// gate said it was a difference nobody had named -- and nothing could have noticed,
// because no corpus the script had ever been run on contained a refusal.
const account = accountRoundTrip({
  declared: declared.length,
  roundTripped,
  refused: contractSkips.length,
});

if (declared.length > 0 && !account.accounted) {
  console.error(`\nROUNDTRIP FAILED\nROUNDTRIP   - ${account.gap}`);
  emitScoreReport();
  process.exit(1);
}

emitScoreReport();
// What this corpus contains, by fault category, on every run.
//
// The round trip reports 735 scores and, until now, nothing about what those 735 cases
// *inject*: v3.34's fix turned on the sentence "RE3 is the code-level slice", and no reading
// in this repository had ever checked it against a case. `census-corpus.mjs` takes the same
// census as a gate over the archives; this prints it wherever `--official-dir` points, so the
// two agree by construction rather than by both being written down.
if (declared.length > 0) {
  const census = censusCorpus({
    cases: (descriptors.cases ?? []).map((entry) => ({
      caseId: entry.caseId,
      // A descriptor written by hand may omit the suite; the case id always carries it.
      suite: entry.suite ?? String(entry.caseId).split('-')[0],
      faultType: entry.faultType,
    })),
  });
  for (const line of describeCensus(census)) console.log(line);
}
// Printed on the passing path too. Before this the equality existed only as a
// failure condition, so it was evaluated only on the runs that failed -- which, on
// every corpus this repository ships, meant never.
console.log(`\n${account.line}`);
console.log(
  `ROUNDTRIP PASSED (${roundTripped} case(s) round-tripped through the official layout` +
    `${contractSkips.length === 0 ? '' : `, ${contractSkips.length} refused by the target's own contract`})`,
);
