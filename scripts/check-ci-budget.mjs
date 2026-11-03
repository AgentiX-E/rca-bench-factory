#!/usr/bin/env node
/**
 * The verdict for every CI job's step budgets, sized by a recording of one run.
 *
 * It was written for the job that timed out (`batteries`), and the name said so. The
 * rules now ask the same question of every job -- see `ci-budget.mjs` for the two
 * blind spots that came from asking it of one -- so the recording holds every job and
 * the verdict is about the workflow.
 *
 * The reading is `scripts/ci-budget.mjs` and this file is only the exit code, for
 * the reason `check-progress-volumes.mjs` is: `verify-gates-are-testable.mjs` proves a
 * gate by emptying it, and a test that imports the emptied file dies before it can name
 * a failing test.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { budgetErrors, budgetSummary } from './ci-budget.mjs';
import { readWorkflow, workflowPath } from './gate-steps.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Where the recording lives, overridable for the same reason `RCA_CI_WORKFLOW` is.
 *
 * The gate's three failure paths -- a workflow that does not parse, a recording that
 * is missing, a recording that disagrees with the workflow -- are the whole point of
 * it, and none of them can be observed by spawning it against the shipped tree, where
 * all three are false. The alternative is a test that edits a committed file, which
 * this repository does not do. The seam is one environment variable and it is read
 * only here.
 */
const BASELINE = resolve(ROOT, process.env['RCA_CI_BASELINE'] ?? join('golden-master', 'ci-baseline.json'));

const workflow = readWorkflow(readFileSync(workflowPath(), 'utf8'));
if (workflow.errors.length > 0) {
  process.stderr.write(`check-ci-budget: ci.yml does not parse:\n  ${workflow.errors.join('\n  ')}\n`);
  process.exit(1);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch (error) {
  process.stderr.write(`check-ci-budget: no recording at ${BASELINE} -- ${String(error)}\n`);
  process.exit(1);
}

const errors = budgetErrors(workflow, baseline);
if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`check-ci-budget: ${error}\n`);
  process.stdout.write(`check-ci-budget: FAILED — ${String(errors.length)} problem(s)\n`);
  process.exit(1);
}
process.stdout.write(`${budgetSummary(workflow, baseline)}\n`);
