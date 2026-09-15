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
 *   node scripts/check-official.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { exportForScoreTarget, runAllOfficialRegressions, SCORE_TARGET_IDS } from '../packages/core/dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BUNDLE_PATH = resolve(ROOT, 'examples/order-prod/bundle.json');

/** The one target the shipped example cannot exercise, and why. */
const SKIPPED = { 'rcaeval-re3': 'the example is a resource fault and RE3 admits code-level faults only' };

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
