#!/usr/bin/env node
/**
 * Every exit the inventory claims is proved disappears without a word, or this says
 * which one does.
 *
 * ## The half of a proof that reaching does not answer
 *
 * `verify-site-proofs.mjs` runs each claimant once and checks that the exit it claims
 * actually fired. That is reachability, and it is **not** what "proved by" says. A
 * test that drives a gate, watches it fail, and asserts nothing about *why* it failed
 * reaches every exit the gate has; it would still pass if the gate stopped failing
 * altogether. The property is two-part -- reaches the exit, and would notice its
 * absence -- and only the first had ever been run.
 *
 * The measurement this was written for, over the 100 claims in `gate-sites.json`:
 * **0 survivors**, 44 files, 144 runs. The ledger is checked by hand at each revision
 * (v3.33 did it for 93 sites in 6 min 28 s, by editing each gate and restoring it);
 * this is what makes it arrive without a person remembering.
 *
 * ## The mutant is a value, not an edit
 *
 * `RCA_HOLLOW_SITE` names one site. `site-proofs.mjs`'s hook already computes the
 * frame that decides reachability, so the mutant is one branch on top of it: from
 * that frame, `process.exit(0)` instead of the code the gate asked for. Nothing in
 * the tree is written, so none of what `verify-gates-are-testable.mjs` needs for a
 * file edit -- the journal, the precondition against overlapping runs, the restore
 * path, the process-group kill -- is needed here. A tree that is never mutated cannot
 * be left mutated.
 *
 * ## Per site, not per file
 *
 * A file sensitive to one of its exits says nothing about the other nine, and pooling
 * would answer "somebody noticed something". The cost is one run per claim plus one
 * baseline per file -- 144 here -- and it is paid in parallel: four children at a
 * time, measured rather than guessed.
 *
 * ## Three answers, and the third is about the measurement
 *
 * | what the mutant run did | what it means |
 * | --- | --- |
 * | went red | the witness depends on this exit -- the claim holds |
 * | stayed green, and the hook recorded the mutant | the witness reaches the exit and does not depend on it |
 * | stayed green, and no record | the child that should have carried the mutant did not, so nothing was measured |
 *
 * The third is finding 359's lesson one question over: a green run is not evidence
 * about a mutant that never arrived, and reading it as "survived" would accuse the
 * test of a defect that belongs to the instrument. It is printed as unmeasured, not
 * as a survivor.
 *
 * ## Baseline first, because a red file proves everything
 *
 * A claimant that is already red without any mutation would be counted as catching
 * every mutant applied to it. So each file is run once unhollowed, and a file that
 * does not pass is reported as unmeasured -- with its own failure quoted, the same
 * way `verify-site-proofs.mjs` reports one.
 *
 * ## The seams
 *
 * `RCA_SENSITIVE_ROOT`, `RCA_SENSITIVE_INVENTORY`, `RCA_SENSITIVE_VITEST`,
 * `RCA_SENSITIVE_TESTS` and `RCA_SENSITIVE_CONCURRENCY` exist so the four verdicts
 * can be observed at all: a survivor, a file that cannot run, a mutant that never
 * arrives, and an inventory with nothing to measure. None of them is reachable
 * against the shipped tree, where every verdict is "the claim holds", and the
 * alternative is a test that edits a committed file -- which this repository does
 * not do. Same pattern as `RCA_SITE_PROOFS_*`, `RCA_CI_WORKFLOW` and `RCA_CI_BASELINE`.
 *
 * ## A split by sorted position (v3.54, P3)
 *
 * The runner measured 626 s for this battery, 52 s short of the bound `R4` asked for,
 * so its claimants are divided across two jobs. `--shard <i>/<n>` takes every
 * `i`-th file of the sorted `claimsByFile` list; with no flag the run measures the whole
 * inventory, which is what a local repair still wants. Position rather than measured
 * cost, because a plan written in `ci.yml` and a plan checked by a test have to be the
 * same plan on every machine.
 *
 * A shard with no claimant is refused, not reported green. Two green jobs, one of which
 * measured nothing, is the shape a split can produce that a single job never can; the
 * partition itself is checked by `checkShardPlan` against the real workflow and the
 * real inventory, because the summary of one shard cannot see the claims it did not run.
 *
 * ## Usage
 *
 *   node scripts/verify-sites-are-sensitive.mjs            # measure every claim
 *   node scripts/verify-sites-are-sensitive.mjs --list     # print the plan, run nothing
 *   node scripts/verify-sites-are-sensitive.mjs --shard 1/2
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimedSites,
  claimsByFile,
  failureSummary,
  outputTail,
  hookFile,
  parseHollows,
  parseShard,
  parseTrace,
  shardClaims,
} from './site-proofs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env['RCA_SENSITIVE_ROOT'] ?? process.cwd());
const INVENTORY = resolve(
  ROOT,
  process.env['RCA_SENSITIVE_INVENTORY'] ?? join('golden-master', 'gate-sites.json'),
);
const TESTS = resolve(process.env['RCA_SENSITIVE_TESTS'] ?? join(ROOT, 'packages', 'core'));

/**
 * How many claimants run at once.
 *
 * Four, because that is the number of cores a GitHub runner has and one vitest run of
 * a single file does not saturate a core. Measured on the tree this was written in:
 * 144 runs serial took 8 min 54 s, and the same 144 runs at four took **2 min 41 s**.
 * The knob exists so the figure can be re-measured on a different machine rather than
 * believed.
 */
const CONCURRENCY = Number(process.env['RCA_SENSITIVE_CONCURRENCY'] ?? '4');

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const unknown = [];
let shardText = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--list') continue;
  if (args[index] === '--shard') {
    shardText = String(args[index + 1] ?? '');
    index += 1; // the value is consumed, not a stray argument
    continue;
  }
  unknown.push(args[index]);
}
const shard = shardText === null ? null : parseShard(shardText);
if (unknown.length > 0 || (shard !== null && !shard.ok)) {
  // One refusal for both shapes. A battery that was given an argument it cannot read
  // and a battery asked to measure no claims are the same risk -- a green line about a
  // measurement that did not happen -- and both are kept out of the same exit.
  const reason =
    unknown.length > 0
      ? `unknown argument '${unknown[0]}'`
      : `invalid --shard '${String(shardText)}': ${shard.error}`;
  process.stderr.write(`verify-sites-are-sensitive: ${reason}\n`);
  process.stderr.write(
    'usage: node scripts/verify-sites-are-sensitive.mjs [--list] [--shard <i>/<n>]\n',
  );
  process.exit(1);
}
if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1) {
  // A pool of zero would report an empty run as a pass, which is the shape this
  // repository refuses everywhere else: a measurement that measured nothing.
  process.stderr.write(
    `verify-sites-are-sensitive: RCA_SENSITIVE_CONCURRENCY must be a positive integer, ` +
      `not '${String(process.env['RCA_SENSITIVE_CONCURRENCY'])}'\n`,
  );
  process.exit(1);
}

let inventory;
try {
  inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
} catch (error) {
  process.stderr.write(
    `verify-sites-are-sensitive: cannot read ${relative(ROOT, INVENTORY) || INVENTORY} -- ${String(error)}\n`,
  );
  process.exit(1);
}

/**
 * The claims this gate can mutate, and the ones it cannot.
 *
 * A mutant here is a *value*: the hook replaces the exit code with zero from the frame
 * that called it. That works because `process.exit` is a function this hook can
 * replace, and a `throw` is not -- the language has no seam between the statement and
 * the unwind. So a fatal throw is claimed and reached (that is `verify-site-proofs`),
 * but its disappearance cannot be simulated from outside the process, and pretending
 * otherwise would report the instrument's blindness as a witness that does not care.
 *
 * They are counted and printed rather than dropped, for the reason every other basket
 * in this campaign is: a summary that reads "108 claims, all proved" while one of them
 * was never asked is the defect this gate exists to prevent.
 */
const everything = claimedSites(inventory);
const allByFile = claimsByFile(everything);
const byFile =
  shard === null ? allByFile : shardClaims(allByFile, shard.index, shard.count);
if (everything.length === 0 || byFile.length === 0) {
  // The shape that would pass forever: no claims in this run, so nothing to violate,
  // and a summary line that reads like a clean bill of health. A shard past the file
  // count is exactly that shape, and is refused here rather than by a reader noticing
  // that one of the two green jobs measured nothing.
  const what =
    everything.length === 0
      ? `${relative(ROOT, INVENTORY) || INVENTORY} holds no proved site`
      : `shard ${String(shard.index)}/${String(shard.count)} holds no claimant`;
  process.stderr.write(
    `verify-sites-are-sensitive: ${what}, so this run would pass while measuring nothing\n`,
  );
  process.exit(1);
}

const claimed = byFile.flatMap(([, claims]) => claims);
/** The same entries, by file, for the run phase. */
const claimsOf = new Map(byFile);

if (listOnly) {
  for (const [file, claims] of byFile) {
    for (const claim of claims) process.stdout.write(`${claim.site} <- ${file}\n`);
  }
  process.exit(0);
}

/** The interpreter entry `npx vitest` would run, resolved rather than guessed. */
function vitestEntry() {
  const override = process.env['RCA_SENSITIVE_VITEST'];
  if (override !== undefined && override !== '') return override;
  const require = createRequire(join(HERE, 'site-proofs.mjs'));
  return require.resolve('vitest/vitest.mjs');
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-sensitive-'));
const hook = hookFile(scratch);
let traceCount = 0;

/** How to re-run one claimant alone, which is the first step of every repair. */
function rerun(file) {
  const entry = relative(ROOT, vitestEntry());
  const runner = entry.startsWith('..') ? vitestEntry() : entry;
  return `run it alone: node ${runner} run ${file} --reporter=dot`;
}

/**
 * One claimant run, resolved to the three facts the verdict needs.
 *
 * `hollow` is the site whose exit is replaced with success, or `null` for the
 * baseline run. The trace is always written: the baseline needs to know the run could
 * be measured at all, and the mutant run needs to know the mutant arrived.
 */
function runOnce(file, site) {
  // `site` is the claim being hollowed, or null for the baseline run.
  const absolute = resolve(ROOT, file);
  if (!existsSync(absolute)) {
    return Promise.resolve({
      file,
      status: null,
      problem: `${file} does not exist, so its claims are unmeasured`,
      detail: [],
    });
  }
  const trace = join(scratch, `${String(traceCount)}.log`);
  traceCount += 1;
  const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --require=${hook}`.trim(),
    RCA_SITE_TRACE: trace,
  };
  // One mutant per kind of claim. An exit is hollowed by replacing the argument of a
  // call the hook can see; a throw is hollowed by removing the statement, which only
  // the loader in `throw-witness.mjs` can do, so that run also arms the witness.
  delete env.RCA_HOLLOW_SITE;
  delete env.RCA_HOLLOW_THROW;
  delete env.RCA_THROW_WITNESS;
  if (site !== null) {
    if (site.kind === 'throw') {
      env.RCA_HOLLOW_THROW = site.site;
      env.RCA_THROW_WITNESS = join(HERE, 'throw-witness.mjs');
    } else {
      env.RCA_HOLLOW_SITE = site.site;
    }
  }
  // One worker, because this run is one file.
  //
  // The battery runs four claimants at a time, and each child is a vitest of its own:
  // left to the default, every child sizes its pool from the machine, so four claimants
  // on a four-vCPU runner ask for sixteen workers. That is the oversubscription finding
  // 297 removed inside the suite, one layer out, and its signature is the same -- a red
  // with every test passing, because the files that pay are the synchronous ones. A
  // one-file run has nothing to parallelise, so the flag costs no wall clock.
  const child = spawn(
    process.execPath,
    [vitestEntry(), 'run', relative(TESTS, absolute), '--reporter=dot', '--maxWorkers=1'],
    {
      cwd: TESTS,
      env,
    },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });
  return new Promise((done) => {
    child.on('error', (error) => {
      done({
        file,
        status: null,
        problem: `${file} could not be run -- ${error.message}`,
        detail: [rerun(file)],
      });
    });
    child.on('close', (status) => {
      const text = existsSync(trace) ? readFileSync(trace, 'utf8') : '';
      done({
        file,
        status: status ?? -1,
        fired: parseTrace(text),
        hollowed: parseHollows(text),
        output,
      });
    });
  });
}

/** Run `job` over `items`, at most `limit` at a time, results in input order. */
function pool(items, limit, job) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await job(items[index], index);
    }
  });
  return Promise.all(workers).then(() => results);
}

const startedAt = Date.now();

const baselines = await pool(
  byFile.map(([file]) => file),
  CONCURRENCY,
  (file) => runOnce(file, null),
);
const problems = [];
const runnable = [];
for (const outcome of baselines) {
  if (outcome.problem !== undefined) {
    problems.push({ head: outcome.problem, detail: outcome.detail });
  } else if (outcome.status !== 0) {
    // Red before any mutation. Crediting it would make every mutant look caught.
    // The exit code is part of the sentence because the two shapes of this red are not
    // the same finding: a red test and a runner that died with every test passing both
    // arrive here, and only the number tells them apart before the output is read.
    const reported = failureSummary(outcome.output);
    problems.push({
      head:
        `${outcome.file} does not pass on its own (exit ${String(outcome.status)}), so its claims are ` +
        'unmeasured',
      // A run whose output carries no report at all -- the shape vitest takes when its
      // worker's RPC deadline expires, with every test passing -- leaves the summary
      // empty. The tail is quoted rather than summarised: it is evidence, and the
      // sentence says whose.
      detail:
        reported.length === 0
          ? [...outputTail(outcome.output).map((line) => `its own output ends: ${line}`), rerun(outcome.file)]
          : [...reported, rerun(outcome.file)],
    });
  } else {
    runnable.push(outcome.file);
  }
}

const claims = runnable.flatMap((file) => (claimsOf.get(file) ?? []).map((claim) => ({ file, claim })));
const mutants = await pool(claims, CONCURRENCY, ({ file, claim }) => runOnce(file, claim));

const survivors = [];
const unmeasured = [];
for (const [index, outcome] of mutants.entries()) {
  const { file, claim } = claims[index];
  if (outcome.problem !== undefined) {
    unmeasured.push({ head: outcome.problem, detail: outcome.detail });
    continue;
  }
  if (outcome.status !== 0) continue;
  if (outcome.hollowed.includes(claim.site)) {
    survivors.push({ site: claim.site, file, detail: rerun(file) });
  } else {
    // The exit fired and was hollowed in a child that did not carry the mutant, or it
    // did not fire at all. Either way the run says nothing about the claim, and the
    // sentence has to say that rather than call the test insensitive.
    unmeasured.push({
      head:
        `${claim.site} is claimed by ${file}, which passed with ` +
        `${claim.kind === 'throw' ? 'the throw removed' : 'the exit hollowed'} but never ` +
        'recorded the mutant, so this run cannot say whether it would notice',
      detail: [rerun(file)],
    });
  }
}
rmSync(scratch, { recursive: true, force: true });

const runs = baselines.length + mutants.length;
const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
const failures = survivors.length + problems.length + unmeasured.length;

if (failures > 0) {
  if (survivors.length > 0) {
    process.stderr.write('verify-sites-are-sensitive: these exits can stop failing and no test minds:\n');
    for (const survivor of survivors) {
      process.stderr.write(`  ${survivor.site} is claimed by ${survivor.file}\n`);
      process.stderr.write('    the file passes with that exit replaced by success\n');
      process.stderr.write(`    ${survivor.detail}\n`);
    }
    process.stderr.write('  The witness reaches the exit. It does not depend on it, so it is not a proof\n');
    process.stderr.write('  of that exit -- it is a proof that the gate ran.\n');
  }
  if (problems.length > 0) {
    process.stderr.write('verify-sites-are-sensitive: some claimants could not be measured at all:\n');
    for (const problem of problems) {
      process.stderr.write(`  ${problem.head}\n`);
      for (const line of problem.detail) process.stderr.write(`    ${line}\n`);
    }
  }
  if (unmeasured.length > 0) {
    process.stderr.write('verify-sites-are-sensitive: some mutants never reached the child that mattered:\n');
    for (const problem of unmeasured) {
      process.stderr.write(`  ${problem.head}\n`);
      for (const line of problem.detail) process.stderr.write(`    ${line}\n`);
    }
  }
  process.stderr.write('');
  process.stderr.write(`verify-sites-are-sensitive: FAILED -- ${String(failures)} problem(s)\n`);
  process.exit(1);
}

const exits = claimed.filter((claim) => claim.kind === 'exit').length;
const throws = claimed.length - exits;
process.stdout.write(
  `verify-sites-are-sensitive: PASSED (${String(claimed.length)} claim(s) across ` +
    `${String(runnable.length)} file(s), ${String(runs)} run(s), ${minutes} min -- ` +
    `${String(exits)} exit(s) hollowed, ${String(throws)} throw(s) removed -- and some test goes red ` +
    'for every one of them)\n',
);
