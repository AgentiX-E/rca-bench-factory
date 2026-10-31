#!/usr/bin/env node
/**
 * The verdict for the batteries job's budgets: one bound per step, sized by a recording.
 *
 * The reading is `scripts/battery-budget.mjs` and this file is only the exit code, for
 * the reason `check-progress-volumes.mjs` is: `verify-gates-are-testable.mjs` proves a
 * gate by emptying it, and a test that imports the emptied file dies before it can name
 * a failing test.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { budgetErrors, budgetSummary } from './battery-budget.mjs';
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
  process.stderr.write(`check-battery-budget: ci.yml does not parse:\n  ${workflow.errors.join('\n  ')}\n`);
  process.exit(1);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch (error) {
  process.stderr.write(`check-battery-budget: no recording at ${BASELINE} -- ${String(error)}\n`);
  process.exit(1);
}

const errors = budgetErrors(workflow, baseline);
if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`check-battery-budget: ${error}\n`);
  process.stdout.write(`check-battery-budget: FAILED — ${String(errors.length)} problem(s)\n`);
  process.exit(1);
}
process.stdout.write(`${budgetSummary(workflow, baseline)}\n`);
