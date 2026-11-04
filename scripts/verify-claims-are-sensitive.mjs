#!/usr/bin/env node
/**
 * Every exemption's claim is falsified by a change to the code, or this says which claim
 * nothing can break.
 *
 * ## The half of an exemption that a title does not answer
 *
 * Rule 9 of `gate-sites-are-proven.test.ts` requires an exempt `throw` to state a claim
 * and to name the test that holds it. That was this campaign's answer to six exemptions
 * that were prose -- and it is still a claim about a **title**. A file can carry a test
 * with that exact name whose body asserts something else, or something weaker, and the
 * inventory goes on reading as a proof. The row would then be an index of an index: a
 * title pointing at a test that no longer measures the sentence beside it.
 *
 * Nothing can read an assertion and decide whether it is the claim. What *can* be done
 * is the thing the claim is actually about: **change the code so the claim is false, and
 * see whether that test goes red.** A claim with no such change is a sentence, however
 * well it is filed.
 *
 * ## The mutant is a value in the inventory, not an edit here
 *
 * Each exempt row carries a `mutant` -- `{file, find, replace, defect}` -- so what
 * falsifies the claim is published next to the claim. Three consequences, and each is
 * the reason for the shape:
 *
 *   - The table can be **checked without running anything**: `find` must occur exactly
 *     once in `file`, an edit that has drifted out of the tree is a red gate rather than
 *     a silent no-op. That is rule 10.
 *   - The mutation is a **substitution**, so it cannot quietly become a rewrite. The
 *     bytes before and after are both known, so the restore is a comparison rather than
 *     a hope.
 *   - The `defect` sentence is what a reader meets first. A mutation whose purpose has to
 *     be inferred is a mutation nobody will maintain.
 *
 * ## Serial, and why that is not a limitation to fix
 *
 * The battery in `verify-sites-are-sensitive.mjs` runs four claimants at once because
 * its mutant is a **value** injected through a hook. This one writes to tracked files, so
 * two mutants on one file cannot be in the tree at the same time, and a pool would need a
 * per-file queue to say so. The whole run is eleven single-file suites -- measured at 35
 * seconds on the tree this was written in -- and a pool would buy seconds in exchange for
 * a lock. Serial is the cheaper correctness.
 *
 * ## Three answers, and one of them is about the instrument
 *
 * | what the mutant run did | what it means |
 * | --- | --- |
 * | went red on an assertion | the test measures the claim -- the exemption is held |
 * | went red on the code's own guard | the claim is enforced where it lives, and the test notices |
 * | stayed green | the test does not measure the claim, whatever its title says |
 * | red, but the tree failed to parse or load | nothing was measured: the mutation broke the subject |
 *
 * The last row is why this is not "red is caught". A mutation that does not parse fails
 * every suite for a reason about the mutation, and crediting that as a caught claim is
 * the oldest defect shape in this repository -- the audit that read a SyntaxError as
 * proof. The failure text is scanned before the verdict is given, and a run whose output
 * carries a transform or module-load failure is reported as unmeasured with the failure
 * quoted, never as `survived`.
 *
 * ## The tree is restored, and the restore is checked
 *
 * Every mutant is written back from the bytes read before it, and the write is read back
 * and compared. A failed restore stops the run: a battery that leaves a tracked file
 * mutated corrupts every later step, which is finding 173's disaster and not a warning.
 * A `SIGTERM` restores what is pending; a `SIGKILL` cannot, and for that case the file is
 * tracked, so `git status` names it and the next run refuses to measure a tree that is
 * already mutated.
 *
 * ## The seams
 *
 * `RCA_CLAIMS_ROOT`, `RCA_CLAIMS_INVENTORY` and `RCA_CLAIMS_RUNNER` exist so that every
 * verdict above can be observed by a test -- a surviving mutant, a claimant that is red
 * before any mutation, a row whose text has drifted, a tree with nothing to measure. None
 * of them is reachable against the shipped tree, where every claim is held. Same pattern
 * as `RCA_SENSITIVE_*`, `RCA_CI_*` and `RCA_SITE_PROOFS_*`.
 *
 * ## Usage
 *
 *   node scripts/verify-claims-are-sensitive.mjs           # measure every exemption
 *   node scripts/verify-claims-are-sensitive.mjs --list    # print the plan, run nothing
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env['RCA_CLAIMS_ROOT'] ?? resolve(HERE, '..'));
const INVENTORY = resolve(
  ROOT,
  process.env['RCA_CLAIMS_INVENTORY'] ?? 'golden-master/gate-sites.json',
);
const TESTS = resolve(ROOT, 'packages', 'core');

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const unknown = args.filter((one) => one !== '--list');
if (unknown.length > 0) {
  process.stderr.write(`verify-claims-are-sensitive: unknown argument '${unknown[0]}'\n`);
  process.stderr.write('usage: node scripts/verify-claims-are-sensitive.mjs [--list]\n');
  process.exit(1);
}

/** A failure the mutation itself caused, so the run says nothing about the claim. */
const BROKEN = /SyntaxError|Transform failed|Failed to load|Cannot find module|ERR_MODULE_NOT_FOUND|Unexpected token|\[plugin |error TS\d+/;

let inventory;
try {
  inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
} catch (error) {
  process.stderr.write(
    `verify-claims-are-sensitive: cannot read ${relative(ROOT, INVENTORY) || INVENTORY} -- ${String(error)}\n`,
  );
  process.exit(1);
}

/**
 * The exemptions, with the three parts each one has to carry.
 *
 * A row without a `mutant` is refused rather than skipped: a battery that measured the
 * rows it understood and reported a clean run would be the defect it exists to find,
 * one layer up.
 */
const exempt = (inventory.throws?.rows ?? []).filter((row) => row.status === 'exempt');
if (exempt.length === 0) {
  process.stderr.write(
    `verify-claims-are-sensitive: ${relative(ROOT, INVENTORY) || INVENTORY} holds no exempt ` +
      'throw, so this run would pass while measuring nothing\n',
  );
  process.exit(1);
}

/**
 * What each exemption is missing, in the words a reader needs.
 *
 * Both parts are checked here rather than trusted from rule 9: a battery is run on trees
 * rule 9 has not blessed -- a fixture, a branch mid-edit -- and a row without a holding
 * test would otherwise reach the plan and die on a property read, naming no row.
 */
function missingParts(row) {
  const parts = [];
  if (
    row.heldBy === undefined ||
    typeof row.heldBy.file !== 'string' ||
    typeof row.heldBy.test !== 'string'
  ) {
    parts.push('a holding test');
  }
  if (
    row.mutant === undefined ||
    typeof row.mutant.file !== 'string' ||
    typeof row.mutant.find !== 'string' ||
    typeof row.mutant.replace !== 'string'
  ) {
    parts.push('a mutation');
  }
  return parts;
}

const missing = exempt
  .map((row) => ({ row, parts: missingParts(row) }))
  .filter((one) => one.parts.length > 0);
if (missing.length > 0) {
  const where = missing[0];
  process.stderr.write(
    `verify-claims-are-sensitive: ${String(where.row.script)}:${String(where.row.line)} is exempt ` +
      `without ${String(where.parts.join(' or '))}, so its claim cannot be falsified by this run ` +
      `(${String(missing.length)} row(s) like it)\n`,
  );
  process.exit(1);
}

const claims = exempt.map((row) => ({
  id: `${String(row.script)}:${String(row.line)}`,
  test: row.heldBy.file,
  title: row.heldBy.test,
  mutant: row.mutant,
}));

if (listOnly) {
  for (const claim of claims) {
    process.stdout.write(
      `${claim.id} -> ${claim.test} '${claim.title}' :: mutates ${claim.mutant.file}\n`,
    );
  }
  process.exit(0);
}

/** The interpreter entry `npx vitest` would run, resolved rather than guessed. */
function vitestEntry() {
  const require = createRequire(join(HERE, 'site-proofs.mjs'));
  return require.resolve('vitest/vitest.mjs');
}

/**
 * How one test file is run.
 *
 * The default is the shipped runner; the override exists so a fixture can answer
 * "red"/"green" without a suite, which is what makes the three verdicts reachable.
 */
function runnerPrefix() {
  const override = process.env['RCA_CLAIMS_RUNNER'];
  if (override !== undefined && override.trim() !== '') return override.trim().split(/\s+/);
  return [process.execPath, vitestEntry(), 'run'];
}

/** One suite run: the exit status and everything it printed. */
function runTest(file) {
  const [command, ...prefix] = runnerPrefix();
  const absolute = resolve(ROOT, file);
  return new Promise((done) => {
    const child = spawn(command, [...prefix, absolute], {
      cwd: existsSync(TESTS) ? TESTS : ROOT,
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    child.on('error', (error) => done({ status: null, output: error.message }));
    child.on('close', (status) => done({ status: status ?? -1, output }));
  });
}

/**
 * Whether a tracked file has edits this run would destroy.
 *
 * `null` for a tree git does not own, which is what a fixture is. The precondition only
 * needs to answer "is this file what the repository says it is"; a scratch tree has no
 * repository and no other writer.
 */
function uncommitted(file) {
  const status = spawnSync('git', ['-C', ROOT, 'status', '--porcelain', '--', file], {
    encoding: 'utf8',
  });
  if (status.status !== 0) return null;
  return status.stdout.trim() !== '';
}

/** The mutant in the tree, so a signal can still put the file back. */
let pending = null;
function restorePending() {
  if (pending === null) return;
  writeFileSync(pending.file, pending.original);
  pending = null;
}
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.on(signal, () => {
    restorePending();
    process.exit(code);
  });
}

const startedAt = Date.now();
/** Baselines are per file, and two claims can be held by one file. */
const baselines = new Map();
const survivors = [];
const unmeasured = [];
const caught = [];
let runs = 0;

for (const claim of claims) {
  const target = resolve(ROOT, claim.mutant.file);
  const problem = (reason, detail) => unmeasured.push({ id: claim.id, head: reason, detail });

  if (!existsSync(target)) {
    problem(`${claim.id} mutates ${claim.mutant.file}, which does not exist`, []);
    continue;
  }
  if (uncommitted(claim.mutant.file) === true) {
    problem(
      `${claim.id} mutates ${claim.mutant.file}, which has uncommitted changes, so a mutation would ` +
        'overwrite work this run cannot restore',
      [`commit or stash ${claim.mutant.file}`],
    );
    continue;
  }

  if (!baselines.has(claim.test)) {
    runs += 1;
    const baseline = await runTest(claim.test);
    if (baseline.status === null) {
      baselines.set(claim.test, { problem: `${claim.test} could not be run -- ${baseline.output}` });
    } else if (baseline.status !== 0) {
      baselines.set(claim.test, {
        problem: `${claim.test} does not pass on its own, so its claims are unmeasured`,
        output: baseline.output,
      });
    } else {
      baselines.set(claim.test, { ok: true });
    }
  }
  const baseline = baselines.get(claim.test);
  if (baseline?.ok !== true) {
    problem(baseline.problem, failureDetail(baseline.output ?? ''));
    continue;
  }

  const source = readFileSync(target, 'utf8');
  const occurrences = source.split(claim.mutant.find).length - 1;
  if (occurrences !== 1) {
    problem(
      `${claim.id} mutates '${firstLine(claim.mutant.find)}', which occurs ${String(occurrences)} ` +
        `time(s) in ${claim.mutant.file}: a mutant whose text has drifted is not a measurement`,
      [`${claim.mutant.file} no longer carries that text once`],
    );
    continue;
  }

  const mutated = source.replace(claim.mutant.find, claim.mutant.replace);
  pending = { file: target, original: source };
  writeFileSync(target, mutated);
  // A write that did not reach the file is not a measurement, and a run that went on
  // would report the claim as held on the strength of a tree it never changed.
  if (readFileSync(target, 'utf8') !== mutated) {
    pending = null;
    problem(
      `${claim.id} could not be measured -- the mutation did not reach ${claim.mutant.file}`,
      [`${claim.mutant.file} still holds the bytes this run read`],
    );
    break;
  }

  runs += 1;
  const outcome = await runTest(claim.test);
  restorePending();
  // The restore is read back, and a restore that did not take stops the run: every
  // later claim would be measured against a mutated tree, which is finding 173's
  // disaster. It is reported as unmeasured rather than as its own verdict, so the
  // failure travels through the one exit an unmeasured claim already has.
  if (readFileSync(target, 'utf8') !== source) {
    problem(
      `${claim.id} could not be measured -- ${claim.mutant.file} was not restored, so the tree is ` +
        'now mutated and no later claim can be trusted',
      [`restore ${claim.mutant.file} from the working tree before measuring again`],
    );
    break;
  }

  if (outcome.status === null) {
    problem(`${claim.id} could not be measured -- ${outcome.output}`, []);
  } else if (outcome.status === 0) {
    survivors.push(claim);
  } else if (BROKEN.test(outcome.output)) {
    problem(
      `${claim.id} mutated ${claim.mutant.file} into something that does not load, so the red run ` +
        'says nothing about the claim',
      [firstBrokenLine(outcome.output)],
    );
  } else {
    caught.push({ claim, assertion: /AssertionError/.test(outcome.output) });
  }
}

const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
const failures = survivors.length + unmeasured.length;

if (failures > 0) {
  if (survivors.length > 0) {
    process.stderr.write('verify-claims-are-sensitive: these claims nothing in the code can falsify:\n');
    for (const claim of survivors) {
      process.stderr.write(`  ${claim.id} is exempt, and ${claim.test} passes with:\n`);
      process.stderr.write(`    ${claim.mutant.defect ?? '(the mutant states no defect)'}\n`);
      process.stderr.write(`    the mutation is '${firstLine(claim.mutant.find)}' in ${claim.mutant.file}\n`);
    }
    process.stderr.write('  The test carries the title the inventory names and does not measure the\n');
    process.stderr.write('  claim beside it, so the exemption is a sentence with a pointer.\n');
  }
  if (unmeasured.length > 0) {
    process.stderr.write('verify-claims-are-sensitive: some claims could not be measured at all:\n');
    for (const each of unmeasured) {
      process.stderr.write(`  ${each.head}\n`);
      for (const line of each.detail) process.stderr.write(`    ${line}\n`);
    }
  }
  process.stderr.write('');
  process.stderr.write(`verify-claims-are-sensitive: FAILED -- ${String(failures)} problem(s)\n`);
  process.exit(1);
}

const assertion = caught.filter((one) => one.assertion).length;
process.stdout.write(
  `verify-claims-are-sensitive: PASSED (${String(claims.length)} claim(s), ${String(runs)} run(s), ` +
    `${minutes} min -- every exemption's claim is falsified by a change in the tree and its test goes ` +
    `red: ${String(assertion)} on an assertion, ${String(caught.length - assertion)} on the code's own guard)\n`,
);

/** The first line of a multi-line mutant, for a message that has to fit one. */
function firstLine(text) {
  return String(text).split('\n')[0];
}

/** The lines of a child's output that say why it failed. */
function failureDetail(output) {
  return String(output)
    .split('\n')
    .filter((line) => /AssertionError|Expected|Received|×|FAIL/.test(line))
    .slice(0, 6)
    .map((line) => line.trim());
}

/** The line of a broken run that names the breakage. */
function firstBrokenLine(output) {
  return (
    String(output)
      .split('\n')
      .find((line) => BROKEN.test(line))
      ?.trim() ?? 'the run failed without saying why'
  );
}
