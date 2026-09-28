#!/usr/bin/env node
/**
 * Classify the `type` misses of a fault-extraction run.
 *
 * Finding 69 classified `category`'s eight misses one by one and concluded that
 * a legal vocabulary member was chosen, so the failure was *choosing* rather than
 * *formatting*. Finding 78 then argued `type` has no structural ceiling behind it
 * and called its 4/19 a model-accuracy figure. **Neither read the `type` answers.**
 * This script takes that reading.
 *
 * The question is narrow and decidable. When the model's `type` differs from the
 * expected slug, is it a form variant of that slug -- which `normalizeFaultType`
 * should already have folded -- or a different mechanism named at the same level?
 *
 *   form-variant         the scorer rejected an answer it should have accepted.
 *                        That is a BUG in this repository, not a model failure.
 *   shares-token         the answer names the same subject with more words
 *                        (`cpu-saturation` -> `cpu-throttling` shares `cpu`).
 *                        A near miss: capability, not a defect.
 *   different-mechanism  the answer names something else entirely
 *                        (`network-loss` -> `egress-packet-drop`). Capability.
 *
 * Only the first class is actionable in this repository, which is why the
 * partition exists rather than a single "wrong" count.
 *
 * Usage:
 *   node scripts/probe-type-misses.mjs [--predictions <path>] [--json]
 *
 * With no `--predictions`, the recorded misses from run `9932e766c` are used.
 * They live in the CI annotation rather than in the repository, so they are
 * transcribed in this file with their run named -- a figure that cannot be
 * re-derived is worth less than one whose provenance is stated, and requiring a
 * live LLM key to read it would make the reading unavailable exactly when the
 * quota is exhausted.
 *
 * Exit codes:
 *   0  the partition is complete and no form variant was found
 *   1  the input could not be read
 *   2  a form variant was found -- the scorer has a defect and this is a bug
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The reader is imported from the built package rather than reproduced here.
// Reproducing it was the earlier design and it is the defect this script is being
// repaired for: the classifier reproduced `normalizeFaultType` on purpose (a
// classifier whose definition moves with the artefact it classifies cannot report
// on that artefact) and that reasoning does not extend to the *reader*. The
// reader has one correct implementation and it is checked against the recorded
// annotation by its own tests; a second copy here would be a second thing to keep
// correct, and the failure would be silent -- a stale copy reads successfully.
import { adjudicateAll, countAdjudications, parseMissDetail } from '../packages/core/dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/**
 * The `type` misses of a recorded run, read from the recorded annotation.
 *
 * Each fixture is the verbatim annotation body of the run it names, with escapes
 * intact. Reading them through `parseMissDetail` rather than carrying a
 * transcription is the repair for the defect this script caused: it used to hold
 * a copy of run `9932e766c`'s rows inline, exact against that run, and a later
 * reading quoted those rows as the answers of run `567118aea`. Eight of fourteen
 * rows disagreed with the annotation and two rows were attributed a `type` miss
 * that their run assigned to `component`.
 *
 * A figure that cannot be re-derived is worth less than one whose provenance is
 * stated -- so the provenance is stated, by deriving it.
 */
const RUNS = {
  /** The current format: rows joined with U+001F. type=5/19. */
  '567118aea': 'miss-detail-567118aea.txt',
  /** Before finding 70 changed the separator: rows joined with a space. type=4/19. */
  '9932e766c': 'miss-detail-9932e766c.txt',
};

/** The run this script reads by default: the most recent recorded one. */
const DEFAULT_RUN = '567118aea';

/** Read a recorded run's `type` misses. Throws rather than returning an empty set. */
function recordedTypeMisses(run) {
  const file = RUNS[run];
  if (file === undefined) {
    throw new Error(
      `unknown run '${run}'; recorded runs are ${Object.keys(RUNS).join(', ')}`,
    );
  }
  const body = readFileSync(resolve(REPO, 'packages', 'core', 'test', 'fixtures', file), 'utf8');
  return {
    run,
    rows: parseMissDetail(body)
      .filter((row) => row.field === 'type')
      .map((row) => [row.sampleId, row.expected, row.actual ?? '(omitted)']),
  };
}


/**
 * The normalizer the scorer applies, reproduced.
 *
 * It is *not* imported from the built package, and that is deliberate: this
 * script has to run before the build in some pipelines, and a classifier whose
 * definition moves with the artefact it is classifying cannot report on that
 * artefact. The reproduction is checked by `type-miss-probe.test.ts`, which
 * asserts this script's output matches the independently written copy in the
 * test.
 */
function normalizeFaultType(type) {
  return type
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function classify(expected, actual) {
  if (normalizeFaultType(expected) === normalizeFaultType(actual)) {
    return 'form-variant';
  }
  const expectedTokens = normalizeFaultType(expected)
    .split('-')
    .filter((t) => t.length > 0);
  const actualTokens = new Set(
    normalizeFaultType(actual)
      .split('-')
      .filter((t) => t.length > 0),
  );
  if (expectedTokens.some((t) => actualTokens.has(t))) {
    return 'shares-token';
  }
  return 'different-mechanism';
}

function parseArgs(argv) {
  const out = { predictions: '', json: false, run: DEFAULT_RUN };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--predictions') {
      out.predictions = resolve(argv[i + 1] ?? '');
      i += 1;
    } else if (a === '--run') {
      // Which recorded run to read. Named rather than implied, because the defect
      // this replaced was exactly a run being implied: the script read one run's
      // contents while a reader assumed another's.
      out.run = argv[i + 1] ?? DEFAULT_RUN;
      i += 1;
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`unknown argument '${a}'`);
    }
  }
  return out;
}

/**
 * Read misses out of a scored report or a raw prediction file.
 *
 * Two shapes are accepted because two exist. A scored report carries `misses`,
 * each with `detail` rows of `{ field, expected, actual }`; a raw predictions
 * file does not, and reading it would mean reimplementing the scorer here. The
 * report is the supported input and the error message says so rather than
 * silently returning an empty classification -- an empty result and an unreadable
 * input are different findings.
 */
function typeMissesFrom(report) {
  const misses = report?.misses;
  if (!Array.isArray(misses)) {
    throw new Error(
      'input has no `misses` array; pass a scored report (scripts/score-fault-extraction.mjs), ' +
        'not a raw predictions file -- the classifier reads the scorer\'s own field comparisons',
    );
  }
  const rows = [];
  for (const m of misses) {
    for (const d of m?.detail ?? []) {
      if (d?.field !== 'type') continue;
      if (typeof d.expected !== 'string' || typeof d.actual !== 'string') continue;
      rows.push([m.sampleId ?? '<unknown>', d.expected, d.actual]);
    }
  }
  return rows;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(String(err.message));
    return 1;
  }
  if (args.help) {
    console.log(
      'Usage: node scripts/probe-type-misses.mjs [--predictions <report.json>] ' +
        '[--run <recorded-run>] [--json]',
    );
    console.log(`\nRecorded runs: ${Object.keys(RUNS).join(', ')} (default: ${DEFAULT_RUN})`);
    return 0;
  }

  let rows;
  let source;
  if (args.predictions === '') {
    const recorded = recordedTypeMisses(args.run);
    rows = recorded.rows;
    source = `recorded run ${recorded.run} (read from the CI annotation body, not transcribed)`;
  } else {
    try {
      const report = JSON.parse(readFileSync(args.predictions, 'utf8'));
      rows = typeMissesFrom(report);
      source = args.predictions;
    } catch (err) {
      console.error(`could not read ${args.predictions}: ${String(err.message ?? err)}`);
      return 1;
    }
  }

  const classified = rows.map(([sampleId, expected, actual]) => ({
    sampleId,
    expected,
    actual,
    kind: classify(expected, actual),
    overSpecified: actual.split('-').length > expected.split('-').length,
  }));

  // The partition, derived rather than filtered twice. Finding 78's probe held
  // two contradictory figures because its halves were computed independently; a
  // guard here makes that state unrepresentable.
  //
  // The keys are the same strings the classifier returns, so `counts[k]` and a
  // `kind === k` filter cannot drift apart. An earlier draft used camelCase keys
  // for kebab-case values and the mismatch was invisible in the human-readable
  // output while breaking every programmatic consumer.
  const counts = { 'form-variant': 0, 'shares-token': 0, 'different-mechanism': 0 };
  for (const c of classified) {
    counts[c.kind] += 1;
  }
  const covered = counts['form-variant'] + counts['shares-token'] + counts['different-mechanism'];
  if (covered !== classified.length) {
    throw new Error(
      `classification partition does not cover the misses: ${covered} != ${classified.length}`,
    );
  }

  const overSpecified = classified.filter((c) => c.overSpecified).length;

  // The adjudication, which answers the question the partition cannot.
  //
  // The partition above is lexical and it is about the *scorer*: is this answer
  // one the normalizer should have folded? It says nothing about whether the
  // answer is the same fault. Finding 91 needed that and could not build it;
  // finding 94 built it. Both run here because they are different instruments over
  // the same rows and reporting either as the other is the error finding 92 named.
  //
  // `different-fault` means **the rule could not reach this pair**, not "these are
  // different faults". The distinction is in the module note and it is the reason
  // the count is reported as "unreached" rather than as "wrong".
  const adjudicated = adjudicateAll(
    rows.map(([sampleId, expected, actual]) => ({
      sampleId,
      field: 'type',
      expected,
      actual: actual === '(omitted)' ? null : actual,
    })),
  );
  const adjudication = countAdjudications(adjudicated);
  const unreached = adjudicated.filter((m) => m.verdict === 'different-fault');

  const payload = {
    source,
    total: classified.length,
    counts,
    overSpecified,
    classified,
    adjudication,
    unreached: unreached.map((m) => ({ expected: m.expected, actual: m.actual })),
    adjudicated: adjudicated.map((m) => ({
      expected: m.expected,
      actual: m.actual,
      verdict: m.verdict,
      basis: m.basis,
    })),
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`type-miss classification\n`);
    console.log(`source: ${source}`);
    console.log(`misses: ${classified.length}\n`);
    for (const c of classified) {
      const flag = c.overSpecified ? ' [longer]' : '';
      console.log(`  ${c.kind.padEnd(19)} ${c.expected} -> ${c.actual}${flag}`);
    }
    console.log(
      `\nform-variant ${counts['form-variant']} | shares-token ${counts['shares-token']} | ` +
        `different-mechanism ${counts['different-mechanism']}`,
    );
    console.log(
      `over-specified (answer longer than the expected slug): ${overSpecified}/${classified.length}`,
    );
    console.log(
      `\nadjudication (finding 94): same-altitude ${adjudication['same-fault-different-altitude']} | ` +
        `unreached ${adjudication['different-fault']} | undecided ${adjudication.undecided}`,
    );
    for (const m of unreached) {
      console.log(`  unreached  ${m.expected} -> ${m.actual}`);
    }
    console.log(
      '\n`unreached` means no shared morpheme reaches the pair -- it is a limit of the rule, ' +
        'not a verdict that the two faults differ. Reading it as the latter is the inversion ' +
        'this probe exists to prevent.',
    );
    if (counts['form-variant'] === 0) {
      console.log(
        '\nno form variant: the normalizer is not the defect, so no answer here was rejected ' +
          'that should have been accepted',
      );
    } else {
      console.log(
        `\n${counts['form-variant']} form variant(s) found -- the scorer rejected an answer it should ` +
          'have accepted. That is a defect in this repository, not a model failure.',
      );
    }
  }

  return counts['form-variant'] === 0 ? 0 : 2;
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(REPO + '/', ''))) {
  process.exit(main());
}

export { RUNS, DEFAULT_RUN, classify, normalizeFaultType, recordedTypeMisses, typeMissesFrom };
