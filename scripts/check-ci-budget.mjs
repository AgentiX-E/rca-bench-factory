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

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { budgetErrors, budgetSummary } from './ci-budget.mjs';
import { readWorkflow, workflowPath } from './gate-steps.mjs';
import { readLedger, VOLUMES } from './ledger-runs.mjs';

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

/**
 * Where the progress ledger lives, overridable for the same reason the recording is.
 *
 * `R7` compares the recording against the newest run the ledger reports, and both of its
 * refusals are about a state the shipped tree is never in -- a recording one run behind,
 * and a closing row that names no run. Neither can be observed by spawning this against
 * the tree, and a test that edited a committed volume would be editing the log to test
 * the log.
 */
const LEDGER = process.env['RCA_CI_LEDGER'] === undefined ? VOLUMES : resolve(ROOT, process.env['RCA_CI_LEDGER']);

/**
 * Where the declarations live: the steps this tree added that no run has measured yet.
 *
 * A separate file from the recording because the two are different kinds of statement.
 * The recording is a measurement and `measure-ci-baseline.mjs` is its only writer; a
 * declaration is a promise, written by the round that adds the step and deleted by the
 * round whose run measures it. Keeping the promise inside the measurement would put a
 * number in a file that only measurements may enter -- and would leave the promise with
 * no owner to delete it, since the tool rewrites the whole object.
 *
 * A missing file is the normal state and not an error. A file that cannot be read is.
 */
const DECLARATIONS =
  process.env['RCA_CI_DECLARATIONS'] === undefined
    ? join(ROOT, 'golden-master', 'ci-declarations.json')
    : resolve(ROOT, process.env['RCA_CI_DECLARATIONS']);


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

const ledger = readLedger(LEDGER);

/**
 * The declarations, or nothing at all when the tree has none.
 *
 * `existsSync` rather than a `catch` around the read: the two states are different, and
 * a reader that treated "no file" as "an empty list" would also treat "a file with a
 * typo in it" as one, which is the mistake `R8` exists to catch one level up.
 */
let declarations = null;
if (existsSync(DECLARATIONS)) {
  try {
    declarations = JSON.parse(readFileSync(DECLARATIONS, 'utf8'));
  } catch (error) {
    process.stderr.write(`check-ci-budget: no readable declarations at ${DECLARATIONS} -- ${String(error)}\n`);
    process.exit(1);
  }
}

const errors = budgetErrors(workflow, baseline, ledger, declarations);
if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`check-ci-budget: ${error}\n`);
  process.stdout.write(`check-ci-budget: FAILED — ${String(errors.length)} problem(s)\n`);
  process.exit(1);
}
process.stdout.write(`${budgetSummary(workflow, baseline, ledger, declarations)}\n`);
