#!/usr/bin/env node
/**
 * Measure what one modality comparison costs, in bytes per row.
 *
 * ## Why this is a script and not a paragraph
 *
 * The round trip's heap budget (12,288 MB) exists because a run died at 12,005 MB
 * inside the first TrainTicket case, and the reading that mattered afterward was
 * *which* stage held the memory. The ingest was bounded and instrumented; the
 * comparison was neither, and the sentence recording that said "what the comparison
 * costs has never been measured" for one round (finding 511).
 *
 * A number in a document is a claim about a run nobody can repeat. This is the run:
 * a synthetic table in the corpus's shape, built in memory, measured before and
 * after the comparison, with the module and the function named so the reading
 * cannot be about a different build.
 *
 * ## What it does not measure
 *
 * The corpus. A real TrainTicket case ships 1,433,140 spans, and fetching it is the
 * `official-data` workflow's job (19 GB from Zenodo). What this reproduces is the
 * **shape**: the row count, the column count, a message column with a value in
 * every row, and an export that differs in one row.
 *
 * ## Usage
 *
 *   node scripts/probe-modality-memory.mjs                 # 400,000 rows, one difference
 *   node scripts/probe-modality-memory.mjs 1400000         # the corpus's largest case
 *   node scripts/probe-modality-memory.mjs 1400000 --same  # an export that matches
 *   node scripts/probe-modality-memory.mjs --json
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
// `RCA_MODALITY_BUNDLE` exists so the refusal below can be driven by a test: a
// site whose only witness is "it would fail on a machine where the build is
// missing" is a site nobody has run. It is a seam for the measurement, not a
// configuration -- the shipped path is the one in this file.
const BUNDLE = process.env.RCA_MODALITY_BUNDLE ?? resolve(REPO, 'packages', 'core', 'dist', 'score', 'modalities.js');

if (!existsSync(BUNDLE)) {
  process.stderr.write(
    `error: ${BUNDLE} is missing.\n` +
      '  This probe reads the built module, not the source.\n' +
      '  Run: npx tsc -p packages/core/tsconfig.json\n',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const same = args.includes('--same');
const positional = args.filter((arg) => !arg.startsWith('--'));
const rows = positional.length === 0 ? 400000 : Number(positional[0]);
if (!Number.isSafeInteger(rows) || rows < 1) {
  process.stderr.write(`error: '${String(positional[0])}' is not a row count\n`);
  process.exit(1);
}

const { compareModalityTables } = await import(pathToFileURL(BUNDLE).href);

/**
 * One table in the shape RE2 writes: an instant with nanosecond digits, a severity
 * in the corpus's spelling, a service, a message that differs on every row, a column
 * the exporter leaves empty, and a minute the exporter derives.
 */
const PLAN = [
  { column: 'timestamp', kind: 'truncated', unit: 'ns' },
  { column: 'level', kind: 'normalised', transform: 'upper-case' },
  { column: 'service', kind: 'exact' },
  { column: 'message', kind: 'exact' },
  { column: 'error', kind: 'not-carried' },
];

function table(rowCount, mutateAt) {
  const lines = ['timestamp,level,service,message,error'];
  for (let i = 0; i < rowCount; i += 1) {
    const message = i === mutateAt ? 'a message the export did not write' : `the message body for row ${String(i)}`;
    lines.push(`1700000010000000000,info,svc-${String(i % 50)},${message},`);
  }
  return lines.join('\n');
}

// The export holds the truncated instant and the upper-cased severity, because that
// is what the reader wrote into the IR and the exporter wrote out of it.
function exportedTable(rowCount, mutateAt) {
  const lines = ['timestamp,level,service,message,error'];
  for (let i = 0; i < rowCount; i += 1) {
    const message = i === mutateAt ? 'a message the export did not write' : `the message body for row ${String(i)}`;
    lines.push(`1700000010000000000,INFO,svc-${String(i % 50)},${message},`);
  }
  return lines.join('\n');
}

const corpus = table(rows, -1);
const exported = exportedTable(rows, same ? -1 : Math.floor(rows / 2));

let peak = 0;
const base = process.memoryUsage().heapUsed;
const timer = setInterval(() => {
  const now = process.memoryUsage().heapUsed;
  if (now > peak) peak = now;
}, 20);

const started = Date.now();
const verdict = compareModalityTables({ table: 'logs', corpus, exported, plan: PLAN });
const elapsed = Date.now() - started;
clearInterval(timer);
peak = Math.max(peak, process.memoryUsage().heapUsed);

const reading = {
  module: 'packages/core/dist/score/modalities.js',
  function: 'compareModalityTables',
  rows,
  same,
  inputBytes: corpus.length + exported.length,
  peakHeapBytes: peak - base,
  bytesPerRow: Math.round((peak - base) / rows),
  elapsedMs: elapsed,
  rowsMatch: verdict.rowsMatch,
  corpusRows: verdict.corpusRows,
  exportedRows: verdict.exportedRows,
  onlyInCorpus: verdict.onlyInCorpus,
  onlyInExport: verdict.onlyInExport,
};

if (json) {
  process.stdout.write(`${JSON.stringify(reading, null, 2)}\n`);
} else {
  const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
  process.stdout.write(
    `modality comparison: ${String(rows)} row(s), ${same ? 'an export that matches' : 'one row different'}\n` +
      `  input text      ${mb(reading.inputBytes)} (two tables)\n` +
      `  peak heap       ${mb(reading.peakHeapBytes)}  ${String(reading.bytesPerRow)} bytes/row\n` +
      `  elapsed         ${String(elapsed)} ms\n` +
      `  verdict         rowsMatch=${String(verdict.rowsMatch)} ` +
      `${String(verdict.exportedRows)}/${String(verdict.corpusRows)} row(s), ` +
      `onlyInCorpus=${String(verdict.onlyInCorpus)}, onlyInExport=${String(verdict.onlyInExport)}\n`,
  );
}
