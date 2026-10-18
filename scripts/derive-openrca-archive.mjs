#!/usr/bin/env node
/**
 * Derive the replay corpus from the released OpenRCA agent archives.
 *
 * `microsoft/OpenRCA` publishes, under `rca/archive/`, four CSV files that
 * record what a baseline agent submitted, which criteria it passed, which it
 * failed, and the score the official evaluator assigned. That is a corpus of
 * *real* cases with an *upstream* verdict -- 335 rows across the four systems --
 * and it is the only such artefact this project has for OpenRCA 1.0.
 *
 * ## Why this exists beside `golden-master/openrca-evaluator.json`
 *
 * That corpus holds 25 hand-written cases whose expected scores were produced by
 * importing `main/evaluate.py` and calling it. It is a faithful oracle and it is
 * small: two of its cases are multi-root, which is the whole evidence base for a
 * rule whose multi-root branch is a matching problem.
 *
 * The archive is not hand-written. It is upstream's own output on its own data,
 * and it contains 75 multi-root rows. Replaying it is a stronger claim than
 * replaying 25 cases a person composed.
 *
 * ## What can and cannot be recovered from a row
 *
 * A row carries `prediction`, `passed`, `failed`, `score`, `task_index` and a
 * `groundtruth` column whose body is the raw metadata of **one** root
 * (`level/component/timestamp/datetime/reason`). It does not carry the
 * `scoring_points` text the evaluator actually read.
 *
 * Two facts make the block recoverable anyway:
 *
 *  1. `passed` and `failed` partition the criteria exactly. `file_evaluate`
 *     computes `failing_criteria = set(components+reasons+times) - set(passing)`
 *     and writes both columns; a newline joins the values, because that is what
 *     pandas does to a list written into one cell. So `passed ∪ failed` **is**
 *     the criterion set, with no arithmetic on our side.
 *  2. Which *kind* each criterion belongs to is decided by the task index, whose
 *     templates are pinned in `OPENRCA_SCORING_TEMPLATES`. For `task_1`,
 *     `task_2` and `task_3` one kind is declared, so placement is forced. For
 *     `task_4`..`task_7` three kinds are interleaved and the recovered strings
 *     no longer say which is which -- unless the row is single-root, in which
 *     case the `groundtruth` column names all three values and the placement is
 *     read rather than guessed.
 *
 * A two-root row on `task_4`..`task_7` therefore cannot be reconstructed: the
 * answer key's second root is nowhere in the row, and the flattened `passed`
 * column does not say which of its lines is a time, a component or a reason.
 * Those 42 rows are **excluded and counted**, not silently dropped, and the
 * corpus file states the number so a reader can see how much of the archive the
 * replay covers.
 *
 * ## Usage
 *
 *   node scripts/derive-openrca-archive.mjs --archive <dir>        # write
 *   node scripts/derive-openrca-archive.mjs --archive <dir> --check # fail if stale
 *
 * `<dir>` must contain `agent-Bank.csv`, `agent-Market-cloudbed-1.csv`,
 * `agent-Market-cloudbed-2.csv` and `agent-Telecom.csv`, fetched from the pinned
 * commit. `scripts/fetch-official.mjs` refuses a destination inside the working
 * tree, which is why this script takes a path rather than looking one up: the
 * bytes are never committed, only the derivation.
 *
 * The committed corpus is what the suite replays. This script is what a future
 * reader runs to confirm the corpus still describes upstream rather than
 * describing itself.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OPENRCA_SCORING_TEMPLATES, parseCsvObjects } from '../packages/core/dist/index.js';
// `readOpenRcaRoots` is the reader the evaluator's own prediction format needs,
// and it is deliberately not on the package surface: the surface is the API a
// consumer of the factory calls, and this is a tool that reads upstream's
// archive. Deep import keeps that distinction instead of widening the API for a
// script.
import { readOpenRcaRoots } from '../packages/core/dist/score/official.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** Upstream repository and commit the archives were taken from. */
const REPO = 'microsoft/OpenRCA';
const COMMIT = 'c121a483a5a91dbae50708e5942c42a6609098b2';

/**
 * The four archives, in a fixed order.
 *
 * Fixed because the corpus is a committed file and a re-derivation must produce
 * the same bytes: `readdir` order is not stable across filesystems.
 */
const SUITES = ['Bank', 'Market-cloudbed-1', 'Market-cloudbed-2', 'Telecom'];

/**
 * Which scoring-point kinds a task index declares, derived from its templates.
 *
 * Read from `OPENRCA_SCORING_TEMPLATES` rather than restated: a table from task
 * to kinds would be a second description of what those templates ask for, and
 * the first time a template changed the two would disagree with nothing to say
 * which was right. Each placeholder appears in exactly the templates that score
 * that kind, so the mapping is a projection of the one source.
 */
/**
 * The scoring-point list each kind names, and the answer-key field that holds it.
 *
 * One table rather than two: the kind is the list name the evaluator's regex
 * fills, and the field is where the same value sits in a `groundtruth` cell. The
 * earlier shape mapped a kind back to a field by stripping a plural `s`, which
 * turns `times` into `time` while the field is called `datetime` -- every
 * three-kind task failed the reconstruction for that reason and the failure read
 * as "the archive disagrees", which it did not.
 */
const KIND_FIELDS = [
  { kind: 'components', field: 'component', placeholder: '{component}' },
  { kind: 'reasons', field: 'reason', placeholder: '{reason}' },
  { kind: 'times', field: 'dateTime', placeholder: '{datetime}' },
];

function kindsOf(taskIndex) {
  const templates = OPENRCA_SCORING_TEMPLATES[taskIndex];
  return KIND_FIELDS.filter(({ placeholder }) =>
    templates.some((template) => template.includes(placeholder)),
  );
}

/** The values a row's task index scores, read from the flattened pass/fail columns. */
function criteriaOf(row) {
  const values = [];
  const seen = new Set();
  for (const column of [row.passed, row.failed]) {
    for (const line of String(column ?? '').split('\n')) {
      const value = line.trim();
      if (value === '' || seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
  }
  return values;
}

/**
 * The raw metadata of the one root a `groundtruth` cell names.
 *
 * The cell is `key: value` lines, not JSON, and the values are the raw dataset
 * tokens (`timestamp` is a Unix second, `datetime` the rendered local time).
 */
function answerKeyOf(row) {
  const out = {};
  for (const line of String(row.groundtruth ?? '').split('\n')) {
    const split = line.indexOf(':');
    if (split < 0) continue;
    out[line.slice(0, split).trim()] = line.slice(split + 1).trim();
  }
  return { component: out.component ?? '', reason: out.reason ?? '', dateTime: out.datetime ?? '' };
}

/** Place a row's criteria into the kinds its task index declares, or refuse. */
function placeCriteria(row, roots) {
  const kinds = kindsOf(row.task_index);
  const criteria = criteriaOf(row);
  const answerKey = answerKeyOf(row);

  if (kinds.length === 0) return { placed: undefined, basis: 'no-kind-declared' };

  if (kinds.length === 1) {
    return { placed: { [kinds[0].kind]: criteria }, basis: 'single-kind-task' };
  }

  // More than one kind: the values are only recoverable when the row names one
  // root, because that row supplies each value's kind. A two-root row on these
  // tasks cannot be placed, and guessing would be a rule invented here.
  if (roots.length !== 1) return { placed: undefined, basis: 'two-roots-three-kinds' };

  const declared = kinds.map(({ field }) => answerKey[field]).filter((value) => value !== '');
  const sameSet =
    declared.length === criteria.length &&
    new Set(declared).size === new Set(criteria).size &&
    declared.every((value) => criteria.includes(value));
  if (!sameSet) return { placed: undefined, basis: 'key-wider-than-one-root' };

  const placed = {};
  for (const { kind, field } of kinds) {
    const value = answerKey[field];
    if (value !== '') placed[kind] = [value];
  }
  return { placed, basis: 'answer-key-row' };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function derive(archiveDir) {
  const files = [];
  const cases = [];
  const excluded = { total: 0, byBasis: {}, byTask: {} };
  let twoRoot = 0;

  for (const suite of SUITES) {
    const path = resolve(archiveDir, `agent-${suite}.csv`);
    if (!existsSync(path)) {
      throw new Error(`missing ${path}; fetch the four archives from ${REPO} at ${COMMIT}`);
    }
    const bytes = readFileSync(path);
    const rows = parseCsvObjects(bytes.toString('utf8'));
    let suiteTwoRoot = 0;

    for (const row of rows) {
      const roots = readOpenRcaRoots(row.prediction ?? '');
      if (roots.length > 1) suiteTwoRoot += 1;
      const { placed, basis } = placeCriteria(row, roots);
      if (placed === undefined) {
        excluded.total += 1;
        excluded.byBasis[basis] = (excluded.byBasis[basis] ?? 0) + 1;
        const task = row.task_index ?? '(none)';
        excluded.byTask[task] = (excluded.byTask[task] ?? 0) + 1;
        continue;
      }
      cases.push({
        suite,
        rowId: row.row_id ?? '',
        taskIndex: row.task_index ?? '',
        basis,
        predicted: roots.map((root) => ({
          component: root.component,
          reason: root.reason,
          occurredAt: root.occurredAt,
        })),
        criteria: Object.fromEntries(
          Object.entries(placed).map(([kind, values]) => [kind, [...values].sort()]),
        ),
        upstream: Number(row.score),
      });
    }

    twoRoot += suiteTwoRoot;
    files.push({
      path: `rca/archive/agent-${suite}.csv`,
      bytes: bytes.length,
      sha256: sha256(bytes),
      rows: rows.length,
      twoRootRows: suiteTwoRoot,
    });
  }

  const byTask = {};
  for (const one of cases) byTask[one.taskIndex] = (byTask[one.taskIndex] ?? 0) + 1;
  const sortedObject = (object) =>
    Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));

  return {
    schema: 'rca-bench-archive-replay/1',
    target: 'openrca-1.0',
    takenAt: '2026-10-18',
    upstream: {
      kind: 'github',
      repository: REPO,
      commit: COMMIT,
      license: { spdx: 'MIT', path: 'LICENSE' },
      files,
    },
    what: 'A baseline agent\'s own submissions with the verdict the official evaluator gave them, reconstructed into the scoring points the evaluator read.',
    why: [
      'The 25-case corpus in golden-master/openrca-evaluator.json is faithful and small: two of its cases are multi-root, which is the entire evidence base for a matching rule.',
      'These 335 rows are upstream\'s output on its own data, 75 of them multi-root. A replay over them is a claim about the rule on cases nobody in this repository composed.',
      'It also measures something no previous pass could: how much of a released OpenRCA population is multi-root. 75 of 335 rows (22.4%) name two roots, while this repository\'s export path can produce exactly one. The number is the size of that gap.',
    ],
    method: [
      'GET the four files under rca/archive/ at the pinned commit; assert their bytes hash to the digests beside them.',
      'Read each row with an RFC 4180 reader -- the cells contain embedded newlines and doubled quotes.',
      '`passed` and `failed` are newline-joined values, not JSON lists. Together they are exactly the criteria the scoring_points block declared: file_evaluate writes `failing_criteria = set(components+reasons+times) - set(passing)` and both columns come from the same list.',
      'Recover the kind of each criterion from `task_index`: the templates in main/task_specification.json name one to three of {datetime, component, reason}. task_1..task_3 declare one kind, so placement is forced.',
      'For task_4..task_7 the values are interleaved and the flattened columns no longer say which is which. A single-root row still yields the placement, because its `groundtruth` column names all three values; the derivation requires that those values be exactly the recovered set, so a row that fails the test is excluded rather than placed by guess.',
      'A two-root row on task_4..task_7 is unrecoverable: the key\'s second root is not in the row at all. Those rows are counted under `excluded`.',
      'No score is computed here. `upstream` is the number the official evaluator wrote into the archive; the suite computes this repository\'s and requires equality.',
    ],
    replayable: { cases: cases.length, twoRootPredicted: cases.filter((c) => c.predicted.length > 1).length, byTask: sortedObject(byTask) },
    excluded: {
      cases: excluded.total,
      byBasis: sortedObject(excluded.byBasis),
      byTask: sortedObject(excluded.byTask),
      why: 'A two-root answer key interleaved across three criterion kinds cannot be recovered from a row that names one root and flattens the rest into newlines. Recorded with its count rather than dropped.',
    },
    twoRootRowsInArchive: twoRoot,
    cases,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const archiveIndex = argv.indexOf('--archive');
  if (archiveIndex < 0 || argv[archiveIndex + 1] === undefined) {
    console.error('usage: node scripts/derive-openrca-archive.mjs --archive <dir> [--check]');
    process.exit(2);
  }
  const outIndex = argv.indexOf('--out');
  const out =
    outIndex < 0 ? resolve(ROOT, 'golden-master', 'openrca-archive.json') : resolve(argv[outIndex + 1]);

  const text = JSON.stringify(derive(resolve(argv[archiveIndex + 1])), null, 2) + '\n';

  if (argv.includes('--check')) {
    const current = existsSync(out) ? readFileSync(out, 'utf8') : undefined;
    if (current !== text) {
      console.error(`derive-openrca-archive: ${out} is stale`);
      if (current === undefined) console.error('  the file does not exist');
      else console.error(`  committed ${current.length} bytes, derived ${text.length} bytes`);
      process.exit(1);
    }
    console.log(`derive-openrca-archive: ${out} is current`);
    return;
  }

  writeFileSync(out, text);
  console.log(`derive-openrca-archive: wrote ${text.length} bytes to ${out}`);
}

main();
