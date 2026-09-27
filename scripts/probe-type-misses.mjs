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

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/**
 * The fifteen `type` misses from run `9932e766c`, transcribed `expected, actual`.
 *
 * The same run's `component` misses are recorded as `WRONG_ANSWERS` in
 * `fault-prompt-grammar.test.ts`; this is the `type` half that was missing.
 */
const RECORDED_TYPE_MISSES = [
  ['resource-cpu-saturation-checkout', 'cpu-saturation', 'cpu-throttling'],
  ['resource-disk-full-log-collector', 'disk-full', 'disk-space-exhaustion'],
  ['network-loss-payment-gateway', 'network-loss', 'egress-packet-drop'],
  ['runtime-pod-kill-user-profile', 'pod-kill', 'kubelet-eviction'],
  ['runtime-container-crash-loop-media', 'container-crash', 'native-ffmpeg-segfault'],
  ['middleware-redis-latency-cache', 'redis-latency', 'redis-command-thread-saturation'],
  ['middleware-kafka-consumer-lag', 'kafka-consumer-lag', 'synchronous-outbound-call-per-record'],
  [
    'middleware-database-connection-pool',
    'database-connection-pool-exhaustion',
    'connection-pool-deadlock',
  ],
  ['code-null-dereference-reporting', 'null-dereference', 'null-pointer-dereference'],
  ['code-unhandled-exception-export', 'unhandled-exception', 'csv-writer-typeerror'],
  ['code-slow-regex-api-gateway', 'regex-catastrophic-backtracking', 'regex-backtracking'],
  ['config-datasource-url-orders', 'config-mismatch', 'stale-config-key'],
  ['dependency-upstream-5xx-pricing', 'upstream-5xx', 'upstream-dependency-outage'],
  [
    'dependency-version-incompatibility-shipping',
    'library-version-incompatibility',
    'breaking-dependency-api-change',
  ],
  ['middleware-mysql-replica-lag-analytics', 'replica-lag', 'replica-apply-thread-saturation'],
];

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
  const out = { predictions: '', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--predictions') {
      out.predictions = resolve(argv[i + 1] ?? '');
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
    console.log('Usage: node scripts/probe-type-misses.mjs [--predictions <report.json>] [--json]');
    return 0;
  }

  let rows;
  let source;
  if (args.predictions === '') {
    rows = RECORDED_TYPE_MISSES;
    source = 'recorded run 9932e766c (transcribed from the CI annotation)';
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
  const payload = {
    source,
    total: classified.length,
    counts,
    overSpecified,
    classified,
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

export { RECORDED_TYPE_MISSES, classify, normalizeFaultType, typeMissesFrom };
