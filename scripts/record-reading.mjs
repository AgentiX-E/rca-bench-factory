#!/usr/bin/env node
/**
 * Write a reading into the record, or check one that is there.
 *
 * `golden-master/fault-extraction/readings.json` was hand-written from a workflow artefact
 * for six readings. Three of them were checked against their artefacts while this script was
 * written and all three were faithful -- but that is a fact about three files, not a
 * guarantee about the next one, and the transcription is the only step in the M1 sequence
 * performed from memory. The artefact is downloaded, the entry is derived, and the two
 * numbers a person could mistype (`key.digest` and `totals`) have no path from a keyboard.
 *
 * Two modes, because the record needs both:
 *
 *   --write   derive the entry from the artefact and append it to the record.
 *   --check   compare an entry that is already recorded against the artefact it names,
 *             field by field, and exit 2 if any answer, total or row disagrees.
 *
 * `--check` is the one that can be run against history. All six readings name a run whose
 * artefact still exists, so the record can be audited rather than believed.
 *
 * Usage:
 *   # fetch the artefact first; this script reads files, not the network:
 *   curl -sL -H "Authorization: token $GITHUB_TOKEN" \
 *     "$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
 *        https://api.github.com/repos/AgentiX-E/rca-bench-factory/actions/runs/<id>/artifacts \
 *        | python3 -c 'import json,sys; print(json.load(sys.stdin)["artifacts"][0]["archive_download_url"])')" \
 *     -o /tmp/run.zip && unzip -o /tmp/run.zip -d /tmp/run-<id>
 *
 *   node scripts/record-reading.mjs --run 39950191377 --artefact /tmp/run-39950191377 \
 *     --check
 *
 *   node scripts/record-reading.mjs --run 40123456789 --artefact /tmp/run-40123456789 \
 *     --status current --prompt-change "..." --prompt-digest <sha256> --write
 *
 * Exit codes:
 *   0  the entry was derived, or every recorded answer matches the artefact
 *   1  the input could not be read (arguments, artefact, schema, dataset, record)
 *   2  --check found a difference between the record and the artefact
 *   3  the run cannot be recorded as it stands (already recorded, or not wholly graded)
 *
 * ## Why the network is not in here
 *
 * The `curl` above is one line and the alternative is a zip parser in a repository with no
 * runtime dependencies. What matters for the record is the *transcription*, and that is the
 * part this script removes; fetching a file is the part a shell does in one line and that a
 * workflow does with `actions/download-artifact`. Keeping the network out also keeps the
 * script runnable under `--check` against a directory somebody already downloaded, which is
 * the only form a test can drive.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_DATASET = resolve(REPO, 'golden-master/fault-extraction/samples.json');
const DEFAULT_READINGS = resolve(REPO, 'golden-master/fault-extraction/readings.json');
const PREDICTIONS_FILE = 'extraction-predictions.json';
const PREDICTIONS_SCHEMA = 'rca-bench-fault-extraction-predictions/1';

function usage(message) {
  console.error(`record-reading: ${message}`);
  console.error(
    'usage: node scripts/record-reading.mjs --run <id> --artefact <dir|file> ' +
      '[--status current|reverted|old-key] [--prompt-change <text>] [--prompt-digest <hex>] ' +
      '[--model <name>] [--dataset <path>] [--readings <path>] [--write|--check]',
  );
  process.exit(1);
}

function parseArgs(argv) {
  const out = {
    dataset: DEFAULT_DATASET,
    readings: DEFAULT_READINGS,
    artefact: '',
    run: 0,
    status: '',
    promptChange: '',
    promptDigest: '',
    model: '',
    write: false,
    check: false,
  };
  const value = (index, name) => {
    const given = argv[index + 1];
    if (given === undefined || given.startsWith('--')) usage(`${name} needs a value`);
    return given;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--run') {
      const raw = value(index, '--run');
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) usage(`--run takes a run id, not '${raw}'`);
      out.run = parsed;
      index += 1;
    } else if (arg === '--artefact') {
      out.artefact = value(index, '--artefact');
      index += 1;
    } else if (arg === '--status') {
      out.status = value(index, '--status');
      index += 1;
    } else if (arg === '--prompt-change') {
      out.promptChange = value(index, '--prompt-change');
      index += 1;
    } else if (arg === '--prompt-digest') {
      out.promptDigest = value(index, '--prompt-digest');
      index += 1;
    } else if (arg === '--model') {
      out.model = value(index, '--model');
      index += 1;
    } else if (arg === '--dataset') {
      out.dataset = resolve(value(index, '--dataset'));
      index += 1;
    } else if (arg === '--readings') {
      out.readings = resolve(value(index, '--readings'));
      index += 1;
    } else if (arg === '--write') {
      out.write = true;
    } else if (arg === '--check') {
      out.check = true;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else {
      usage(`unknown argument '${arg}'`);
    }
  }
  return out;
}

/** Load the core package the same way every script in this repository does. */
async function loadCore() {
  return await import(resolve(REPO, 'packages/core/dist/index.js'));
}

/**
 * Read the artefact, accepting a directory or the file itself.
 *
 * A `.zip` is refused by name rather than by a stack trace: the path is what a reader will
 * have in front of them, and `unzip` is one word away.
 */
function readArtefact(path) {
  if (/\.zip$/i.test(path)) {
    usage(`${path} is a zip; extract it first (unzip -o ${path} -d <dir>) and pass the directory`);
  }
  const file = path.endsWith('.json') ? path : join(path, PREDICTIONS_FILE);
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    usage(`could not read the artefact at ${file}: ${String(error instanceof Error ? error.message : error)}`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    usage(`${file} is not an object; expected the artefact derive-fault-golden.mjs writes`);
  }
  if (raw.schema !== PREDICTIONS_SCHEMA) {
    usage(`${file} has schema '${String(raw.schema)}', not '${PREDICTIONS_SCHEMA}'`);
  }
  if (!Array.isArray(raw.predictions)) usage(`${file} has no 'predictions' array`);
  return {
    predictions: raw.predictions,
    model: typeof raw.model === 'string' ? raw.model : '',
  };
}

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    usage(`could not read the ${what} at ${path}: ${String(error instanceof Error ? error.message : error)}`);
  }
}

/**
 * Place the entry by run id rather than at the end.
 *
 * The record's contract is that its readings appear in run order, and run ids increase with
 * creation time -- the same fact `reconcile-readings.mjs` uses to decide what is in scope. A
 * plain append would hold that contract only for runs recorded as they happen, and the record
 * is being backfilled with a run older than every entry in it. Sorting on the way in is what
 * makes the order a property of the data rather than of the order somebody typed.
 */
function insertInRunOrder(readings, entry) {
  const at = readings.findIndex((reading) => typeof reading?.run === 'number' && reading.run > entry.run);
  if (at === -1) return [...readings, entry];
  return [...readings.slice(0, at), entry, ...readings.slice(at)];
}

/**
 * Derive the entry, or say why this run is not a reading.
 *
 * Returns a decision rather than letting the error out, because the caller has to print it and
 * exit 3 -- and a `try`/`catch` at the top level makes that exit look unconditional to the site
 * deriver, which then attributes it to whichever `if` happens to precede it. On the first run of
 * `derive-gate-sites.mjs` it was attributed to the `absent` guard, nine lines away and about a
 * different question. The condition belongs in the code that makes the decision.
 */
function deriveEntry(core, request) {
  try {
    return { ok: true, entry: core.assembleReading(request) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(
    'usage: node scripts/record-reading.mjs --run <id> --artefact <dir|file> ' +
      '[--status ...] [--prompt-change ...] [--prompt-digest ...] [--write|--check]',
  );
  process.exit(0);
}
if (args.run === 0) usage('--run is required: an entry without a run id names no artefact');
if (args.artefact === '') usage('--artefact is required: the entry is derived from it, not remembered');
if (args.write && args.check) usage('--write and --check are different jobs; pass one');

const core = await loadCore();
const dataset = core.parseGoldenDataset(readJson(args.dataset, 'dataset'));
const artefact = readArtefact(resolve(args.artefact));
const record = readJson(args.readings, 'record');

if (args.check) {
  const entry = (record.readings ?? []).find((reading) => reading?.run === args.run);
  if (entry === undefined) {
    usage(`run ${String(args.run)} is not in the record at ${args.readings}; --check compares, it does not add`);
  }
  const differences = core.compareReadingToArtefact(entry, artefact.predictions);
  for (const difference of differences) {
    const where = difference.sampleId === undefined ? '' : ` ${difference.sampleId}`;
    const field = difference.field === undefined ? '' : `.${difference.field}`;
    console.log(
      `${difference.kind.toUpperCase()}${where}${field}: recorded ${JSON.stringify(difference.recorded)}, ` +
        `artefact ${JSON.stringify(difference.artefact)}`,
    );
  }
  if (differences.length > 0) {
    // The record is the evidence the milestone rests on, so a disagreement is not a warning.
    console.error(
      `record-reading: run ${String(args.run)} in the record disagrees with its artefact in ` +
        `${String(differences.length)} place(s). The artefact is the measurement; correct the record.`,
    );
    process.exit(2);
  }
  console.log(
    `record-reading: run ${String(args.run)} matches its artefact across ` +
      `${String(entry.samples?.length ?? 0)} sample(s) and four totals.`,
  );
  process.exit(0);
}

if (args.status === '') {
  usage('--status is required to derive an entry (current, reverted or old-key)');
}
if (args.promptChange === '') {
  usage('--prompt-change is required: the prose is the part of a reading a script cannot know');
}

const already = (record.readings ?? []).some((reading) => reading?.run === args.run);
if (already) {
  // Appending a second entry for one run would make "the readings in run order" false and
  // would let a re-derivation silently replace a measurement with a transcription of the
  // same artefact at a later date.
  usage(`run ${String(args.run)} is already recorded; edit that entry or check it with --check`);
}

const namedAbsent = (record.absent ?? []).some((entry) => entry?.run === args.run);
if (namedAbsent) {
  // `absent` says the artefact is gone. Writing a reading from it and leaving the claim in
  // place would leave the record holding both "we could not read this" and the reading, and
  // the next reader would have to decide which is true. Removing the entry is a decision, so
  // it is not taken here: it is visible in the diff of the same change.
  usage(
    `run ${String(args.run)} is named in 'absent' as unreadable; if you have its artefact, ` +
      "remove that entry in the same change, because a run cannot be both absent and recorded",
  );
}

const derived = deriveEntry(core, {
  run: args.run,
  model: args.model === '' ? artefact.model : args.model,
  promptChange: args.promptChange,
  status: args.status,
  dataset,
  predictions: artefact.predictions,
  ...(args.promptDigest === '' ? {} : { promptDigest: args.promptDigest }),
});
if (!derived.ok) {
  console.error(`record-reading: ${derived.reason}`);
  process.exit(3);
}
const { entry } = derived;

if (!args.write) {
  console.log(JSON.stringify(entry, null, 2));
  process.exit(0);
}

record.readings = insertInRunOrder(record.readings ?? [], entry);
writeFileSync(args.readings, `${JSON.stringify(record, null, 2)}\n`);
console.log(
  `record-reading: wrote run ${String(args.run)} into ${args.readings} at position ` +
    `${String(record.readings.findIndex((reading) => reading.run === args.run) + 1)} of ` +
    `${String(record.readings.length)}: strict ${String(entry.totals.strict)}/${String(entry.key.size)}, ` +
    `status ${entry.status}.`,
);
console.log('next: node scripts/derive-gate-sites.mjs --check && pnpm test');
