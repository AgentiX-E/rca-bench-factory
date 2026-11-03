#!/usr/bin/env node
/**
 * Every proof the inventory claims is an exit that was actually reached, or this
 * says which claim is not.
 *
 * ## The claim this measures
 *
 * `golden-master/gate-sites.json` records, for each failure site, the test file that
 * proves it. Three rules in `gate-sites-are-proven.test.ts` read that record and all
 * three are satisfied by less than it says: rule 3 asks whether the file *mentions*
 * the script, rule 7 whether the file *executes* it. Neither is site level. So the
 * inventory could publish, and did publish, pointers that are wrong by one branch.
 *
 * This script asks the only form of the question that cannot be answered by reading:
 * run the named file once with a hook on `process.exit`, and check that the exit
 * arrived. The hook and the comparison live in `site-proofs.mjs`; this file is the
 * runner and the exit code, for the reason `check-ci-budget.mjs` gives -- a gate
 * is proved by being emptied, and a test that imported it would die before it could
 * name a failing test.
 *
 * ## The measurement that produced it
 *
 * Pointed at the tree it was written in: **96 claims, 43 files, 2 minutes**, two
 * violations. One was a pointer that named a file reaching line 301 only, where the
 * empty-table exit is reached in another file entirely. The other was a claim whose
 * file drove the gate exclusively through datasets the parser rejects, so the gate's
 * `FAILED: ... propert(y/ies)` arm -- the one that reports a *property* failure as
 * opposed to a crash -- had never executed. Both were fixed in the round that
 * measured them; this script is what keeps the next one from being published.
 *
 * ## Why one child per file, and not one run of everything
 *
 * Pooling the files into a single run would answer "was this exit reached by
 * somebody", which is not the claim. `check-cli-reference.mjs:51` is reached by
 * `gates-are-testable.test.ts` and the inventory named a different file; a pooled
 * run calls that honoured. The cost of the stronger question is one child per file,
 * and it was measured rather than guessed: 43 files, 119 seconds, serial.
 *
 * ## Two ways a run can fail to see, and why they are printed differently
 *
 * A file started with an environment that drops `NODE_OPTIONS` runs without the hook,
 * and a file whose own tests are red produces no exit trace either. Both used to
 * read as "this claim is false", and neither is: the first is a measurement that
 * could not see, the second is a measurement that could not run. The hook records
 * each child's environment, so the first is now a state in the trace rather than an
 * assumption; and a red file's own report is quoted back -- the failing test, the
 * error line, and the totals -- because the alternative is telling a reader to re-run
 * a file to find out why.
 *
 * ## The seams, and why they are environment variables
 *
 * `RCA_SITE_PROOFS_INVENTORY`, `RCA_SITE_PROOFS_VITEST`, `RCA_SITE_PROOFS_TESTS` and
 * `RCA_SITE_PROOFS_ROOT` exist so the gate's four verdicts can be observed at all: a
 * missing inventory, an inventory with no claims, a claim that did not fire, and a
 * file that could not be run. None of them can be produced against the shipped tree,
 * where all four are false, and the alternative is a test that edits a committed
 * file -- which this repository does not do. Same pattern as `RCA_CI_WORKFLOW` and
 * `RCA_CI_BASELINE`, and read only here.
 *
 * ## Usage
 *
 *   node scripts/verify-site-proofs.mjs            # run every claim
 *   node scripts/verify-site-proofs.mjs --list     # print the plan, run nothing
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  blindScripts,
  claimedSites,
  failureSummary,
  hookFile,
  parseReached,
  parseThrows,
  parseTrace,
  unprovenClaims,
  witnessArmed,
} from './site-proofs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env['RCA_SITE_PROOFS_ROOT'] ?? process.cwd());
const INVENTORY = resolve(
  ROOT,
  process.env['RCA_SITE_PROOFS_INVENTORY'] ?? join('golden-master', 'gate-sites.json'),
);
// The package whose vitest runs the claimants. A claim names a file relative to the
// repository root; `TESTS` is what that path is relative *to* when the runner is
// invoked. The two are separate so that a scratch fixture can put a claimant
// anywhere while still being run from one directory.
const TESTS = resolve(process.env['RCA_SITE_PROOFS_TESTS'] ?? join(ROOT, 'packages', 'core'));

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const unknown = args.filter((one) => one !== '--list');
if (unknown.length > 0) {
  process.stderr.write(`verify-site-proofs: unknown argument '${unknown[0]}'\n`);
  process.stderr.write('usage: node scripts/verify-site-proofs.mjs [--list]\n');
  process.exit(1);
}

let inventory;
try {
  inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
} catch (error) {
  process.stderr.write(
    `verify-site-proofs: cannot read ${relative(ROOT, INVENTORY) || INVENTORY} -- ${String(error)}\n`,
  );
  process.exit(1);
}

const claimed = claimedSites(inventory);
if (claimed.length === 0) {
  // The shape that would pass forever: no claims, so nothing to violate. It is the
  // same refusal `check-cli-reference.mjs` makes for an empty command table.
  process.stderr.write(
    `verify-site-proofs: ${relative(ROOT, INVENTORY) || INVENTORY} holds no proved site, ` +
      'so this run would pass while measuring nothing\n',
  );
  process.exit(1);
}

/** The claims grouped by the file that makes them, in a stable order. */
function byFile() {
  const groups = new Map();
  for (const claim of claimed) {
    const list = groups.get(claim.file) ?? [];
    list.push(claim);
    groups.set(claim.file, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

if (listOnly) {
  for (const [file, claims] of byFile()) {
    for (const claim of claims) {
      const kind = claim.kind === 'throw' ? ' (throw)' : '';
      process.stdout.write(`${claim.site} <- ${file}${kind}\n`);
    }
  }
  process.exit(0);
}

/** The interpreter entry `npx vitest` would run, resolved rather than guessed. */
function vitestEntry() {
  const override = process.env['RCA_SITE_PROOFS_VITEST'];
  if (override !== undefined && override !== '') return override;
  const require = createRequire(join(HERE, 'site-proofs.mjs'));
  return require.resolve('vitest/vitest.mjs');
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-site-proofs-'));
let traceCount = 0;

/** How to re-run one claimant alone, which is the first step of every repair below. */
function rerun(file) {
  const entry = relative(ROOT, vitestEntry());
  const runner = entry.startsWith('..') ? vitestEntry() : entry;
  return `run it alone: node ${runner} run ${file} --reporter=dot`;
}

/**
 * The trace of one file, and whether the run itself can be trusted.
 *
 * A file the runner could not start produces no trace, and an empty trace is exactly
 * what a claim that did not fire looks like. The two are kept apart so that a broken
 * runner is not reported as a set of wrong claims -- the same distinction
 * `verify-gates-are-testable.mjs` makes between SURVIVED and UNATTRIBUTED.
 *
 * A file whose own tests fail is now reported with *why*, quoted from the run: the
 * test that failed, the error line, the totals. "Unmeasured" alone sent a reader back
 * to the file to work out what the gate had already read.
 */
function traceOf(file, hook) {
  const absolute = resolve(ROOT, file);
  if (!existsSync(absolute)) {
    return { problem: `${file} does not exist, so its claims are unmeasured`, detail: [] };
  }
  const trace = join(scratch, `${String(traceCount)}.log`);
  traceCount += 1;
  const result = spawnSync(process.execPath, [vitestEntry(), 'run', relative(TESTS, absolute), '--reporter=dot'], {
    cwd: TESTS,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --require=${hook}`.trim(),
      RCA_SITE_TRACE: trace,
      ...(witness === '' ? {} : { RCA_THROW_WITNESS: witness }),
    },
  });
  if (result.error !== undefined) {
    return {
      problem: `${file} could not be run -- ${result.error.message}`,
      detail: [rerun(file)],
    };
  }
  if (result.status !== 0) {
    // A file whose own tests fail is not evidence about anybody's proof, and
    // crediting it would make a red suite look like a measurement.
    return {
      problem: `${file} did not pass, so its claims are unmeasured`,
      detail: [...failureSummary(`${result.stdout ?? ''}\n${result.stderr ?? ''}`), rerun(file)],
    };
  }
  const text = existsSync(trace) ? readFileSync(trace, 'utf8') : '';
  return {
    fired: new Set(parseTrace(text)),
    blind: blindScripts(text),
    thrown: new Set(parseThrows(text)),
    reached: new Set(parseReached(text)),
    armed: witnessArmed(text),
  };
}

const hook = hookFile(scratch);
// The witness costs a parser load per child that reads a script, so it is asked for
// only by a run that has a throw claim to settle. A tree with no throw claim pays
// nothing for an instrument it would not read.
const witness = claimed.some((claim) => claim.kind === 'throw') ? join(HERE, 'throw-witness.mjs') : '';

const firedByFile = new Map();
const blindByFile = new Map();
const thrownByFile = new Map();
const reachedByFile = new Map();
const armedByFile = new Set();
const problems = [];
for (const [file] of byFile()) {
  const outcome = traceOf(file, hook);
  if (outcome.problem !== undefined) {
    problems.push({ head: outcome.problem, detail: outcome.detail });
    continue;
  }
  firedByFile.set(file, outcome.fired);
  blindByFile.set(file, outcome.blind);
  thrownByFile.set(file, outcome.thrown);
  reachedByFile.set(file, outcome.reached);
  if (outcome.armed) armedByFile.add(file);
}
rmSync(scratch, { recursive: true, force: true });

const violations = unprovenClaims(claimed, firedByFile, blindByFile, thrownByFile, reachedByFile, armedByFile);
const failures = problems.length + violations.length;

if (failures > 0) {
  process.stderr.write('');
  if (violations.length > 0) {
    process.stderr.write('verify-site-proofs: the inventory names proofs this run did not see:\n');
    for (const violation of violations) process.stderr.write(`  ${violation}\n`);
    process.stderr.write('  Either the pointer names the wrong file, or that file does not reach the exit,\n');
    process.stderr.write('  or the child that ran it was started out of sight -- three repairs, and the\n');
    process.stderr.write('  sentence above says which one is called for.\n');
  }
  if (problems.length > 0) {
    process.stderr.write('verify-site-proofs: some claims could not be measured at all:\n');
    for (const problem of problems) {
      process.stderr.write(`  ${problem.head}\n`);
      for (const line of problem.detail) process.stderr.write(`    ${line}\n`);
    }
  }
  process.stderr.write('');
  process.stderr.write(`verify-site-proofs: FAILED -- ${String(failures)} problem(s)\n`);
  process.exit(1);
}

const sites = claimed.length;
process.stdout.write(
  `verify-site-proofs: PASSED (${String(sites)} claim(s) across ${String(firedByFile.size)} file(s), ` +
    'every claim reached by the file that names it -- an exit it took, or a throw it ended on)\n',
);
