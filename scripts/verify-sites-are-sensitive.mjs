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
 * ## The price of a claim, which is the test that can see it (v3.158)
 *
 * That cost was, until v3.158, **the whole file, once per claim**: a mutant run went red
 * somewhere in the file and the run paid for every test up to that point. So the price of
 * a claim was its neighbours' runtime, and a file's price was its own runtime multiplied
 * by its claim count. Measured on the tree v3.157 shipped: 68 claimants, 2 632 s of child
 * time, and two of them -- `ci-budget.test.ts` (30 claims) and `publish.test.ts` (29) --
 * were **45%** of it. The partition that table described then read 0.1% apart and, one
 * run later, 30% apart by the runner's own rows: a static table cannot balance a pair
 * whose price is not stable, and the instability was the shape of the claimant rather
 * than the partition.
 *
 * The report every run now writes names the test that failed, so the table records a
 * **witness** per claim and the next run is aimed at that one test with
 * `--testNamePattern`. Measured on this tree (`measure-ci-baseline.mjs:1043`, claimed by
 * `ci-budget.test.ts`): **1 375 ms** aimed against **7 868 ms** for the whole file.
 *
 * The aim cannot make a claim truer. A green aimed run is measured again against the
 * whole file, and an aim that goes red on some other test is treated the same way: only
 * a red **on the aimed test**, with the mutant recorded, decides a claim. What the aim
 * changes is the number of tests a claim pays for, and the summary prints how many aims
 * held and how many missed, because a witness that has stopped existing looks exactly
 * like a battery that got slower.
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
 * ## The split, by what each claimant cost (v3.54, then v3.157)
 *
 * The runner measured 626 s for this battery, 52 s short of the bound `R4` asked for,
 * so its claimants are divided across two jobs. `--shard <i>/<n>` runs one of them;
 * with no flag the run measures the whole inventory, which is what a local repair still
 * wants.
 *
 * The division was by sorted position until v3.157 -- every i-th file of
 * `claimsByFile` -- and the reason written down was that a plan in `ci.yml` and a plan
 * checked by a test have to be the same plan on every machine. Both shards' job seconds
 * then read **247 s** and **438 s** of the same command (reading 52), 44% apart, because
 * where a name sorts says nothing about what a file costs. The division is now by
 * `golden-master/sensitivity-costs.json`: a committed table of one baseline plus one run
 * per claim for every claimant, written by `--costs` from a run that measured them all.
 * A **committed** table is what keeps the old argument's conclusion -- every machine
 * divides identically -- while answering its premise: the numbers are a file, not a
 * reading taken on the machine that happens to be running.
 *
 * The table is refused when it no longer describes the inventory (a file added, a claim
 * added, a file that stopped making claims) in both directions, and a shard run without
 * a readable table stops rather than falling back to position: a fallback would be a
 * second partition under one name.
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
 *   node scripts/verify-sites-are-sensitive.mjs --costs golden-master/sensitivity-costs.json
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assignShards,
  checkShardCosts,
  claimedSites,
  claimsByFile,
  exhaustedTestBudget,
  failedTests,
  failureSummary,
  governingTestBudget,
  hungTestClause,
  hungTests,
  longestTest,
  outputTail,
  hookFile,
  parseHollows,
  parseShard,
  parseTrace,
  shardClaims,
  shardLoad,
  tableCosts,
  testBudgetDeclarations,
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

/**
 * The per-test ceiling a claimant run is given, in milliseconds.
 *
 * A claimant is run to answer one question -- does this file pass on its own -- and the
 * run is also four of them at a time on a shared machine. Vitest's default ceiling is
 * 30,000 ms, which is a statement about a test on an idle box: the slowest test in the
 * claimant set here is `rejects a site that is both proved and exempt` at **2,370 ms**
 * and its whole file is **4,900 ms** alone, but the same file timed out at 30,000 ms
 * inside a shard run and the shard reported it as a claimant that "does not pass on its
 * own (exit 1)" -- a verdict about the machine, filed as a verdict about the claims.
 *
 * 120,000 ms is 24x the whole file, which is headroom rather than a budget: a test that
 * hangs still fails, twenty-four times later. The duration of every baseline is reported
 * by the summary line, so a margin that shrinks is a number a reader sees rather than a
 * discovery a later round makes by timing out.
 */
const CLAIMANT_TIMEOUT_MS = 120_000;

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const unknown = [];
let shardText = null;
let costsText = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--list') continue;
  if (args[index] === '--shard') {
    shardText = String(args[index + 1] ?? '');
    index += 1; // the value is consumed, not a stray argument
    continue;
  }
  if (args[index] === '--costs') {
    costsText = String(args[index + 1] ?? '');
    index += 1; // likewise
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
    'usage: node scripts/verify-sites-are-sensitive.mjs [--list] [--shard <i>/<n>] [--costs <path>]\n',
  );
  process.exit(1);
}
// `--costs` writes the table the shards are divided by, so it can only be asked of a
// run that measured every claimant. A shard measures half an inventory and a `--list`
// measures none, and either would produce a table that divides the next run by the
// wrong set -- the second shape with zeros in it, which is worse, because the numbers
// would look like a measurement.
if (costsText !== null && (shard !== null || listOnly)) {
  const why =
    shard !== null
      ? `a shard measures ${String(shard.index)}/${String(shard.count)} of the inventory, so the table it wrote would ` +
        'name half the claimants and omit the rest'
      : '`--list` runs no claimant, so the table it wrote would be a table of zeros';
  process.stderr.write(
    `verify-sites-are-sensitive: --costs writes the table an unsharded run measured -- ${why}\n`,
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

/**
 * Where the cost table lives, and what a shard does without one.
 *
 * The table is a file in the repository rather than a live measurement, which is what
 * lets `ci.yml`'s two halves and a local `--shard` be the same halves on every machine
 * (the argument `shardClaims` carries in full). A shard run reads it, refuses it if it
 * no longer describes the inventory, and stops otherwise -- there is no positional
 * fallback, because a fallback is a second partition under one name.
 */
const COSTS = resolve(
  ROOT,
  process.env['RCA_SENSITIVE_COSTS'] ?? join('golden-master', 'sensitivity-costs.json'),
);
/**
 * The test that noticed each claim the last time it was measured.
 *
 * The cost table carries two things now, and they are two halves of one question: what a
 * claimant costs (`claims`, `runs`, `baselineMs`, `mutantMs`) and **which test can see
 * each of its claims** (`witnesses`, keyed by site). The second explains the first --
 * a claim's price is one run of the file it lives in, so a file's price is its own
 * runtime multiplied by its claim count.
 *
 * Measured on the tree v3.157 shipped: 68 claimants, 2 632 s of child time, of which
 * `ci-budget.test.ts` (30 claims) and `publish.test.ts` (29) were **45%** between them.
 * No table can balance that pair for long, and reading 54 showed it: the same partition
 * priced by two consecutive runs' own rows was 0.1% apart and then 30% apart. The
 * imbalance was never the partition's -- it was the price of a claim.
 */
const witnesses = new Map();
/**
 * Read the witnesses out of a table, tolerating every shape a file can be in.
 *
 * A row for a site this run does not measure is simply never consulted, and a row whose
 * name has stopped existing is caught by the run rather than here: the aimed run reports
 * the tests that failed, and an aim that does not appear in that report is measured
 * against the whole file. That is why this reader refuses nothing -- the aim can only
 * make a run cheaper, and the run itself is the check that it was aimed at something
 * real.
 */
function readWitnesses(table) {
  const rows = table?.files;
  if (rows === null || typeof rows !== 'object') return;
  for (const row of Object.values(rows)) {
    const named = row?.witnesses;
    if (named === null || typeof named !== 'object') continue;
    for (const [site, name] of Object.entries(named)) {
      if (typeof name === 'string' && name !== '') witnesses.set(site, name);
    }
  }
}
let costs = null;
if (shard !== null) {
  let table;
  try {
    table = JSON.parse(readFileSync(COSTS, 'utf8'));
  } catch (error) {
    process.stderr.write(
      `verify-sites-are-sensitive: cannot read ${relative(ROOT, COSTS) || COSTS} -- ${String(error)}\n`,
    );
    process.stderr.write(
      '  a shard is divided by that table and by nothing else; regenerate it with\n' +
        '  node scripts/verify-sites-are-sensitive.mjs --costs golden-master/sensitivity-costs.json\n',
    );
    process.exit(1);
  }
  const wrong = checkShardCosts(allByFile, table);
  if (wrong.length > 0) {
    process.stderr.write(
      `verify-sites-are-sensitive: ${relative(ROOT, COSTS) || COSTS} does not describe this inventory, ` +
        'so no shard can be divided by it:\n',
    );
    for (const line of wrong) process.stderr.write(`  ${line}\n`);
    process.stderr.write(
      '  regenerate it with: node scripts/verify-sites-are-sensitive.mjs --costs golden-master/sensitivity-costs.json\n',
    );
    process.exit(1);
  }
  costs = tableCosts(table);
  readWitnesses(table);
} else {
  // Unsharded, the table is optional: this is the run that **writes** it, so refusing a
  // table that no longer describes the tree would be refusing the repair. It is read for
  // its witnesses alone, and a table that cannot be read costs the aim rather than the
  // run -- which is the direction that leaves the measurement whole.
  try {
    readWitnesses(JSON.parse(readFileSync(COSTS, 'utf8')));
  } catch {
    // No table, or one this run will replace. Every claim is then measured against the
    // whole of its file, which is what this battery did before v3.158.
  }
}

const byFile =
  shard === null ? allByFile : shardClaims(allByFile, shard.index, shard.count, costs);
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

if (shard !== null && !listOnly) {
  // What the table says the two jobs will cost. Printed by the shard itself, because
  // the CI log is where a reader asks "which half is this", and a split whose halves
  // are only visible in a file is a split nobody checks.
  const loads = shardLoad(assignShards(allByFile, shard.count, costs), costs);
  const heavier = Math.max(...loads);
  const lighter = Math.min(...loads);
  const apart = heavier > 0 ? ((heavier - lighter) / heavier) * 100 : 0;
  process.stdout.write(
    `verify-sites-are-sensitive: the cost table divides ${String(allByFile.length)} claimant(s) as ` +
      `${loads.map((ms, position) => `${String(position + 1)}/${String(shard.count)}=${(ms / 1000).toFixed(1)} s`).join(', ')} ` +
      `of child time -- ${apart.toFixed(0)}% apart -- and this run is shard ` +
      `${String(shard.index)}/${String(shard.count)}\n`,
  );
}

const claimed = byFile.flatMap(([, claims]) => claims);
/** The same entries, by file, for the run phase. */
const claimsOf = new Map(byFile);

/**
 * The budget each claimant will actually be held to, read from its own source.
 *
 * `--testTimeout` is passed on the command line below and it sets the **inherited**
 * default; a file that writes `describe(…, { timeout: N })` keeps its own N, and an
 * inherited default loses to a declaration. So the sentence this battery published --
 * `budget 120000 ms per test` -- was a statement about the flag, and this tree has
 * **nine claimants that declare less than that**, one of them by a factor of four.
 *
 * That is finding 519's shape one layer out. There, one file kept 30 000 while the flag
 * said 120 000 and the alignment was applied to the flag and to that file, and every
 * other claimant's declaration went on being unread. The consequence is not symmetric:
 * a file that furnishes *more* than the battery's number only costs wall clock on a
 * hang, while a file that furnishes *less* re-introduces the failure the flag was raised
 * for -- a claimant that runs out of its own budget is reported as **unmeasured**, so
 * its claims stop being proved, and the reason is a number nobody was comparing.
 */
const budgets = new Map();
function budgetOf(file) {
  if (budgets.has(file)) return budgets.get(file);
  const absolute = resolve(ROOT, file);
  let value = null;
  try {
    const declared = testBudgetDeclarations(readFileSync(absolute, 'utf8'));
    value = { declared, governing: governingTestBudget(CLAIMANT_TIMEOUT_MS, declared) };
  } catch {
    value = null;
  }
  budgets.set(file, value);
  return value;
}

if (listOnly) {
  // Written once, synchronously, and only then exited (finding 432).
  //
  // `process.stdout.write` on a pipe is asynchronous: the bytes go into the stream's buffer
  // and the process may end before the kernel has them. `process.exit(0)` after a write per
  // line is therefore a plan that is printed only as far as the pipe happened to drain --
  // and the two shards' calls, run after it in one test, read the same file and answered 193
  // claims between them against this call's 183. Ten lines, scattered through the output.
  //
  // `writeFileSync(1, ...)` is the same bytes down the same descriptor with the caller waiting,
  // which is what a program about to exit owes its reader. It costs nothing a gate cares about,
  // and the alternative -- letting the process end naturally -- would mean restructuring the
  // run phase below for a branch that never reaches it.
  let plan = '';
  for (const [file, claims] of byFile) {
    for (const claim of claims) plan += `${claim.site} <- ${file}\n`;
  }
  writeFileSync(1, plan);
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
 * A test name as a pattern that matches exactly that name and nothing else.
 *
 * `--testNamePattern` is a **regular expression**, so a witness passed through unescaped
 * is a pattern: `a bound's margin (v3.157)` would open a group and match a family of
 * names, and a name with `*` or `+` in it would match tests that were never its own.
 * The aim is a device for measuring one claim cheaply, and a filter that quietly widens
 * is the one failure mode it must not have -- the run would go red on a test that has
 * nothing to do with the claim and be credited for it.
 *
 * Escaping is the whole of the repair: every metacharacter becomes its own literal, and
 * `.` becomes `\\.` rather than the pattern it is by default.
 */
function escapePattern(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One claimant run, resolved to the four facts the verdict needs.
 *
 * `hollow` is the site whose exit is replaced with success, or `null` for the
 * baseline run. `aim` is the one test a mutant run is pointed at, or `null` for a run
 * of the whole file. The trace is always written: the baseline needs to know the run
 * could be measured at all, and the mutant run needs to know the mutant arrived.
 */
function runOnce(file, site, aim = null) {
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
  // The baseline's per-test durations, which is the only reading the margin can be
  // computed from. Written by vitest's own JSON reporter into the same scratch
  // directory as the trace, and read back in `close` below: a file's wall clock
  // divided by a per-test budget is a percentage of nothing (finding 528).
  //
  // Every run writes it since v3.158, the mutant's included: the baseline's report is
  // read for the longest *duration*, and the mutant's for the one test that *failed*,
  // which is the name the next run of the same claim is aimed at.
  const report = join(scratch, `${String(traceCount)}.json`);
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
    [
      vitestEntry(),
      'run',
      relative(TESTS, absolute),
      '--reporter=dot',
      // Every run also writes a machine-readable report, and each is read for a
      // different fact. The baseline's says how long its longest **test** took, because
      // the margin this gate prints is a per-test fact and the dot reporter only says
      // how long the file took. The mutant's says which test **failed**, and since
      // v3.158 that name is the whole point: the next run of the same claim is aimed at
      // it, so the claim costs one test instead of one file.
      //
      // Two reporters rather than one because the two readings come from the two
      // streams: `--reporter=json` alone writes the report to its file and prints
      // nothing, which leaves `failureSummary` and the budget readers examining an
      // empty console -- the red of a claimant quoting its own output and finding none.
      '--reporter=json',
      `--outputFile.json=${report}`,
      // And the same division of labour decides this flag, in the other direction.
      //
      // A mutant's verdict is "some test went red", and the first red is that test.
      // What the file does afterwards is charged to the claim and adds nothing to the
      // proof: a survivor still runs every test, because a survivor's verdict *is* the
      // whole file staying green, so `--bail` cannot hide one. The baseline cannot take
      // it -- its verdict is a duration ("the longest single test of this file"), and a
      // run that stopped at the first red would report the longest test of a file it
      // had not finished, which is a number about a subset printed as a number about
      // the file.
      //
      // Measured on this tree (v3.153, second shard, same box, minutes apart): the 129
      // mutant runs cost 402 s of child time before the flag. See the volume for the
      // pair; the flag is asserted on the mutant's argv and its absence on the
      // baseline's, in `verify-sites-are-sensitive.test.ts`.
      ...(site === null ? [] : ['--bail=1']),
      // The aim, and the one thing it must not do.
      //
      // A witness is the test that noticed last time, recorded in the cost table; the
      // run is pointed at it with `--testNamePattern`, which vitest matches as a
      // **regular expression**, so the name is escaped rather than passed through -- a
      // test called `a bound's margin (v3.157)` would otherwise be a pattern that
      // matches something else. Measured on this tree, one claim of
      // `ci-budget.test.ts` (v3.158): **1 375 ms** aimed against **7 868 ms** for the
      // whole file.
      //
      // The flag rides on the mutant only. Aiming a baseline would report the longest
      // test of a file whose other tests were never run, and a claimant's baseline is
      // also the question "does this file pass on its own".
      ...(aim === null ? [] : ['-t', escapePattern(aim)]),
      '--maxWorkers=1',
      `--testTimeout=${String(CLAIMANT_TIMEOUT_MS)}`,
    ],
    {
      cwd: TESTS,
      env,
    },
  );
  const launchedAt = Date.now();
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
        elapsedMs: Date.now() - launchedAt,
        problem: `${file} could not be run -- ${error.message}`,
        detail: [rerun(file)],
      });
    });
    child.on('close', (status) => {
      const text = existsSync(trace) ? readFileSync(trace, 'utf8') : '';
      const reportText = existsSync(report) ? readFileSync(report, 'utf8') : null;
      done({
        file,
        status: status ?? -1,
        elapsedMs: Date.now() - launchedAt,
        fired: parseTrace(text),
        hollowed: parseHollows(text),
        // `null` when the run wrote no report -- a claimant replaced by a stand-in,
        // or a vitest that died before its reporter could write. The margin sentence
        // says which of the two it is looking at rather than reporting zero.
        longest: reportText === null ? null : longestTest(reportText),
        // The tests that ran and failed. Empty for a green run, for a report that
        // cannot be parsed, and for an aim that matched nothing -- and the caller
        // treats all three the same way, by measuring the whole file.
        failed: reportText === null ? [] : failedTests(reportText),
        aimedAt: aim,
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

/**
 * Which of the two numbers a timed-out claimant's sentence came from.
 *
 * The sentence already named the number it read out of the output; what it could not say
 * was whose number that is. The two repairs are different -- raise a declaration, or raise
 * the flag -- so a reader who cannot tell them apart has to open the file to find out.
 */
function budgetProvenance(file, budget) {
  const known = budgetOf(file);
  if (known !== null && known.declared.tightest !== null && known.declared.tightest.ms === budget) {
    return (
      `its own declaration furnishes (line ${String(known.declared.tightest.line)}; ` +
      `the battery furnishes ${String(CLAIMANT_TIMEOUT_MS)} ms)`
    );
  }
  if (budget === CLAIMANT_TIMEOUT_MS) return 'the battery furnishes, and this file declares none of its own';
  return 'neither the battery nor any declaration in this file furnishes';
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
    // A third shape, and the one that has already been filed as the first: the file did
    // not finish. Its own sentence says so, because "does not pass" sends a reader to
    // the test and the truth is the budget.
    const budget = exhaustedTestBudget(outcome.output);
    problems.push({
      head:
        budget === null
          ? `${outcome.file} does not pass on its own (exit ${String(outcome.status)}), so its claims are ` +
            'unmeasured'
          : `${outcome.file} did not finish inside the ${String(budget)} ms of test budget ` +
            `${budgetProvenance(outcome.file, budget)} ` +
            `(exit ${String(outcome.status)}), so its claims are unmeasured rather than unproven` +
            `, and ${hungTestClause(hungTests(outcome.output))}`,
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

/**
 * The claimants that furnish their tests less than the battery does.
 *
 * Reported rather than repaired here: the file's number is the one vitest enforces, and
 * this gate's business is to say that the two disagree before a claim goes unmeasured
 * rather than after. The order is by budget and then by name so that the list a round
 * reads is the list the next round reads.
 */
const undercuts = [];
const unpriced = [];
for (const [file] of byFile) {
  const known = budgetOf(file);
  if (known === null) continue;
  for (const one of known.declared.unresolved) {
    unpriced.push({
      head:
        `${file}:${String(one.line)} states a test budget named '${one.name}', which is not a \`const\` ` +
        'in that file, so what the claimant furnishes is unknown',
      detail: [`read it here: ${file}:${String(one.line)}`],
    });
  }
  if (known.governing.below) {
    undercuts.push({
      file,
      ms: known.governing.ms,
      line: known.governing.line,
      declared: known.declared.declarations.length,
    });
  }
}
undercuts.sort((left, right) => left.ms - right.ms || left.file.localeCompare(right.file));

const claims = runnable.flatMap((file) => (claimsOf.get(file) ?? []).map((claim) => ({ file, claim })));

/**
 * Every claim measured twice at most, and the second run only when the first earned it.
 *
 * ## What the aim is, and what it cannot be allowed to become
 *
 * A mutant run's verdict is "some test went red", and the run that produces it pays for
 * the whole file. The report of that run names the test, so the next run of the same
 * claim is pointed at that one test and pays for one test instead. Measured on this tree
 * (v3.158, one claim of `ci-budget.test.ts`): **1 375 ms** aimed, **7 868 ms** whole.
 *
 * The two directions are not symmetric, and that asymmetry is the whole of the design:
 *
 *   - An aimed run that goes red **on the aimed test**, with the mutant recorded, is the
 *     same evidence the whole run would have given -- one test depended on the exit.
 *   - An aimed run that stays **green** is not evidence of anything, because the other
 *     tests in the file were never run. It is measured again against the whole file, and
 *     the whole run decides.
 *   - An aimed run that goes red on some **other** test is reported the same way: the
 *     aim matched something, the run failed, and neither fact says the witness noticed.
 *
 * So the aim can make a run cheaper and can never make a claim truer. When it misses,
 * the claim is measured exactly as it was before v3.158 -- and the miss is counted in
 * the summary, because a witness that has stopped existing is a fact about the table
 * that a reader has to be able to see.
 */
const firstRuns = await pool(claims, CONCURRENCY, ({ file, claim }) =>
  runOnce(file, claim, witnesses.get(claim.site) ?? null),
);

/** The claims whose aimed run does not decide them, measured against their whole file. */
const decided = new Array(claims.length);
const missed = [];
for (const [index, outcome] of firstRuns.entries()) {
  const { claim } = claims[index];
  const aim = outcome.aimedAt ?? null;
  const held =
    aim !== null &&
    outcome.problem === undefined &&
    outcome.status !== 0 &&
    outcome.hollowed.includes(claim.site) &&
    outcome.failed.includes(aim);
  if (aim === null || held) {
    decided[index] = outcome;
  } else {
    missed.push(index);
    decided[index] = null;
  }
}
const secondRuns = await pool(missed, CONCURRENCY, (index) =>
  runOnce(claims[index].file, claims[index].claim, null),
);
for (const [position, index] of missed.entries()) {
  decided[index] = secondRuns[position];
}
/**
 * Every child this phase started, in the order the claims were measured.
 *
 * The decided run is what the verdict reads, and this is what the *cost* reads: a claim
 * that missed its aim paid for two runs, and a table that counted one would under-report
 * the price of exactly the rows a reader has to repair.
 */
const attempts = [...firstRuns, ...secondRuns].filter((outcome) => outcome.problem === undefined);
const mutants = decided;

const survivors = [];
const unmeasured = [];
/**
 * The two ways a red mutant run is not a proof, and why the loop below asks at all.
 *
 * Until v3.87 this loop credited **any** non-zero exit with a catch. That is a
 * statement about the *file* -- "it went red" -- doing duty for a statement about the
 * *mutation* -- "it went red because of the mutation", and the two are not the same
 * sentence. A claimant that crashes whenever a mutant is armed (a preload that cannot
 * load in this child, a mutated statement that throws before the test asserts
 * anything, a body that hangs until the test budget kills it) exits non-zero for a
 * reason that says nothing about whether the test would notice the difference. Under
 * the old reader such a claimant was credited with every claim it made, including
 * claims about gates it never runs -- the false half of the very sentence this gate
 * exists to make true.
 *
 * Two facts are cheap and between them they separate the two sentences: the run
 * recorded the mutant (`hollowed`), and the run was not truncated by a budget
 * (`Test timed out in Nms`). A red run missing either is reported in its own basket
 * rather than credited, because the census cannot be honest about a catch it cannot
 * distinguish from a crash.
 *
 * The second basket is also the answer to the leftover the previous round left open --
 * a claimant's declaration was compared and the comparison refused nothing. It refuses
 * this now: a declaration below the battery's number is the ordinary way a mutant run
 * gets truncated, and a truncated run proves nothing, so the number a claimant states
 * for itself can cost it the claim it was meant to prove. That is a ceiling stated as a
 * rule rather than a threshold: no declaration may be the thing that ends a run whose
 * whole product is a failure.
 */
const truncated = [];
const unrecorded = [];
let credited = 0;
for (const [index, outcome] of mutants.entries()) {
  const { file, claim } = claims[index];
  if (outcome.problem !== undefined) {
    unmeasured.push({ head: outcome.problem, detail: outcome.detail });
    continue;
  }
  if (outcome.status !== 0) {
    if (!outcome.hollowed.includes(claim.site)) {
      unrecorded.push({
        head:
          `${claim.site} is claimed by ${file}, which exited ${String(outcome.status)} with ` +
          `${claim.kind === 'throw' ? 'the throw removed' : 'the exit hollowed'} but never recorded the ` +
          'mutant, so the failure was not the mutant\'s and this claim is not proved by it',
        detail: [rerun(file)],
      });
      continue;
    }
    const budget = exhaustedTestBudget(outcome.output);
    if (budget !== null) {
      truncated.push({
        head:
          `${claim.site} is claimed by ${file}, which did not finish inside the ${String(budget)} ms of ` +
          `test budget ${budgetProvenance(file, budget)}, so the run was stopped rather than failed` +
          `, and ${hungTestClause(hungTests(outcome.output))}`,
        detail: [
          'a claim is proved by a test that fails, not by a run the harness ended: nothing here asserted anything',
          rerun(file),
        ],
      });
      continue;
    }
    credited += 1;
    // The name the next run of this claim will be aimed at: the test that noticed.
    //
    // An aim that held writes back the name it used, so the table keeps a witness the
    // run has just re-confirmed; a claim measured against its whole file hands over its
    // witness for the first time. Nothing else writes this map, and it is only written
    // for a claim the run *credited* -- a survivor has no failed test to name, and an
    // unmeasured run has nothing to teach the next one.
    const noticed = outcome.failed[0];
    if (typeof noticed === 'string' && noticed !== '') witnesses.set(claim.site, noticed);
    continue;
  }
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

const runs = baselines.length + firstRuns.length + secondRuns.length;
const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
const failures =
  survivors.length +
  problems.length +
  unmeasured.length +
  unpriced.length +
  truncated.length +
  unrecorded.length;

// The margin, printed rather than implied -- and this time as the quantity that has a
// ceiling.
//
// Until v3.87 this line divided the slowest **file**'s wall clock by a budget that
// applies **per test** and printed the quotient as a percentage. On this tree it read
// `check-fault-cases.test.ts 29590 ms of the 30000 ms it is given (99%)`, and the round
// that added it read that as "one hiccup from a red gate" and went looking for a
// declaration to raise. The arithmetic is between two different things: that file runs
// fifty-odd tests in those 29 590 ms, and its longest single test is a fraction of them.
// A percentage of the wrong denominator is worse than no percentage, because it names a
// repair -- raise the number -- for a ceiling nothing was near.
//
// The per-test duration is measured by vitest and reported by it, so the reading is one
// line: `--reporter=json` into the scratch directory for the baseline runs, and the
// longest `assertionResults[].duration` becomes the margin. A run that wrote no report
// (the fixture stand-in, or a vitest that died before its reporter wrote) says so
// instead of reporting a share of a number nobody measured.
const margins = baselines
  .filter(
    (outcome) => outcome.problem === undefined && outcome.longest !== null && outcome.longest !== undefined,
  )
  .map((outcome) => {
    const known = budgetOf(outcome.file);
    const ms = known === null ? CLAIMANT_TIMEOUT_MS : known.governing.ms;
    return {
      file: outcome.file,
      ms,
      elapsed: outcome.longest.ms,
      test: outcome.longest.name,
      share: outcome.longest.ms / ms,
    };
  })
  .sort((left, right) => right.share - left.share || right.elapsed - left.elapsed);
const widest = margins.length > 0 ? margins[0] : null;
const slowest = baselines.reduce(
  (worst, outcome) => (outcome.elapsedMs > worst.elapsedMs ? outcome : worst),
  baselines[0],
);
const field = `of ${String(baselines.length)} claimant(s) run ${String(CONCURRENCY)} at a time`;
if (widest !== null) {
  process.stdout.write(
    `verify-sites-are-sensitive: the longest single test of any claimant is ${String(widest.elapsed)} ms of the ` +
      `${String(widest.ms)} ms it is given (${String(Math.round(widest.share * 100))}%), in ${widest.file}: ` +
      `${widest.test} -- ${field}\n`,
  );
} else if (slowest !== undefined) {
  const other = slowest.problem === undefined ? budgetOf(slowest.file) : null;
  const budget = other === null ? CLAIMANT_TIMEOUT_MS : other.governing.ms;
  process.stdout.write(
    `verify-sites-are-sensitive: slowest claimant ${slowest.file} ${String(slowest.elapsedMs)} ms of wall clock, ` +
      `and no run wrote a per-test report, so how much of the ${String(budget)} ms any one test used is ` +
      `unmeasured -- ${field}\n`,
  );
}

// The census, always: how many claimants state a budget of their own, and which one is
// the tightest. A run that prints nothing about this leaves the reader to assume the
// battery's number is the one every claimant got, which is the assumption this reader
// was added to replace with a count.
const declaring = [...byFile].filter(([file]) => {
  const known = budgetOf(file);
  return known !== null && known.declared.tightest !== null;
});
const tightest = undercuts[0] ?? null;
process.stdout.write(
  declaring.length === 0
    ? `verify-sites-are-sensitive: none of the ${String(byFile.length)} claimant(s) declares a test budget ` +
        `of its own, so the battery's ${String(CLAIMANT_TIMEOUT_MS)} ms is the one every one of them gets\n`
    : `verify-sites-are-sensitive: ${String(declaring.length)} of ${String(byFile.length)} claimant(s) declare a ` +
        `test budget of their own against the battery's ${String(CLAIMANT_TIMEOUT_MS)} ms` +
        (tightest === null
          ? ', and none of them is below it\n'
          : `, and ${String(undercuts.length)} of those are below it: ` +
            `${undercuts
              .map((one) => `${one.file}:${String(one.line)}=${String(one.ms)}`)
              .join(', ')}\n`),
);
// Not a refusal. A claimant's declaration is a statement about that file's own work --
// `fetch-official` gives one test 60 s and another 30 s because it knows which one waits
// on a socket -- and this gate has no measurement that says those numbers are wrong. What
// it can say is that they exist, which the run above now does, and that the flag's number
// is not the one they were held to. Only an unpriceable budget is refused, because there
// the census itself would be a guess.
//
// What the declaration *can* cost is stated one line below: a truncated run is not a
// proof, so a claimant that gives its own test less room than the battery would have
// loses the claim rather than the wall clock. That is the one direction with a victim,
// and it is the direction this line measures.
process.stdout.write(
  `verify-sites-are-sensitive: ${String(credited)} of ${String(mutants.length)} mutant run(s) are credited -- ` +
    'each exited non-zero, recorded its mutant, and finished inside the budget it was given ' +
    `(${String(truncated.length)} truncated by a budget, ${String(unrecorded.length)} exited without recording ` +
    `the mutant, ${String(survivors.length)} survived, ${String(unmeasured.length)} unmeasured)\n`,
);

// Where the seconds went, and the number that says whether the aim is earning its keep.
//
// A reader has two questions about this line. The first is how much of the battery is
// still paying for whole files, and the second is whether the table's witnesses have
// stopped existing -- a claimant whose tests were renamed is measured in full, which is
// correct and slow, and the count is the only thing that distinguishes that from a tree
// where every aim held.
const aimedHeld = firstRuns.filter(
  (outcome) =>
    outcome.aimedAt !== null &&
    outcome.aimedAt !== undefined &&
    outcome.status !== 0 &&
    outcome.failed.includes(outcome.aimedAt),
).length;
const aimedAtAll = firstRuns.filter((outcome) => outcome.aimedAt !== null).length;
process.stdout.write(
  aimedAtAll === 0
    ? 'verify-sites-are-sensitive: no claim had a witness in the cost table, so every mutant run measured ' +
        'its whole file -- regenerate it with --costs to record one per claim\n'
    : `verify-sites-are-sensitive: ${String(aimedAtAll)} of ${String(mutants.length)} claim(s) named a test ` +
        `that could see them, and ${String(aimedHeld)} of those aims held; ${String(missed.length)} aim(s) ` +
        'missed and were measured against the whole file instead, which is what a renamed test looks like ' +
        'from here\n',
);

// What each claimant's mutant runs cost, charged to the claimant that paid for them.
//
// Until v3.153 this gate printed one total, and the recorder only ever saw the step's
// wall clock. A round that added six claims to one file then charged them the
// difference between two afternoons: a shard's clock is not a claim's price, and a
// total cannot be divided after the fact. The rows below are the division -- runs and
// seconds measured around each claimant's own children, so the next claim added is
// charged to the file it was added to.
const paid = new Map();
for (const outcome of attempts) {
  const row = paid.get(outcome.file) ?? { claims: 0, runs: 0, ms: 0, slowest: 0 };
  row.runs += 1;
  row.ms += outcome.elapsedMs;
  row.slowest = Math.max(row.slowest, outcome.elapsedMs);
  paid.set(outcome.file, row);
}
for (const { file } of claims) {
  const row = paid.get(file);
  if (row !== undefined) row.claims += 1;
}
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
const dearer = [...paid.entries()].sort(
  (left, right) => right[1].ms - left[1].ms || left[0].localeCompare(right[0]),
);
const mutantMs = dearer.reduce((total, [, row]) => total + row.ms, 0);
// The baseline is half of a claimant's price -- one run of the file, before any mutant
// -- and until v3.157 it was the half the rows did not print. The cost table is made of
// these two numbers, so a row that carries only one of them cannot be reconciled with
// the table from a CI log, which is where the table has to be re-derivable from.
const baselineOf = new Map(baselines.map((outcome) => [outcome.file, outcome.elapsedMs ?? 0]));
for (const [file, row] of dearer) {
  process.stdout.write(
    `verify-sites-are-sensitive: ${file} -- ${String(row.claims)} claim(s) in ${String(row.runs)} run(s), ` +
      `baseline ${seconds(baselineOf.get(file) ?? 0)}, mutants ${seconds(row.ms)} ` +
      `(slowest ${seconds(row.slowest)})\n`,
  );
}
if (dearer.length > 0 && mutantMs > 0) {
  // The clock can be too short to divide: a fixture's runs finish inside a second, and
  // a ratio against zero is a number that would be printed as `Infinity`.
  const clock = Number(minutes);
  const parallel =
    clock > 0 ? `, ${(mutantMs / 60000 / clock).toFixed(1)}x the clock with ${String(CONCURRENCY)} at a time` : '';
  const [dearest, row] = dearer[0];
  process.stdout.write(
    `verify-sites-are-sensitive: ${String(claims.length)} mutant run(s) cost ${seconds(mutantMs)} of child time ` +
      `inside ${minutes} min of wall clock${parallel}; the dearest claimant is ${dearest} at ` +
      `${String(Math.round((row.ms / mutantMs) * 100))}% of that\n`,
  );
}

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
  if (unpriced.length > 0) {
    process.stderr.write('verify-sites-are-sensitive: some claimants state a budget this gate cannot price:\n');
    for (const problem of unpriced) {
      process.stderr.write(`  ${problem.head}\n`);
      for (const line of problem.detail) process.stderr.write(`    ${line}\n`);
    }
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
  if (unrecorded.length > 0) {
    process.stderr.write('verify-sites-are-sensitive: these claimants went red without the mutant, so the red is not theirs:\n');
    for (const problem of unrecorded) {
      process.stderr.write(`  ${problem.head}\n`);
      for (const line of problem.detail) process.stderr.write(`    ${line}\n`);
    }
    process.stderr.write('  A non-zero exit is a fact about the file. The claim is about the mutation, and a\n');
    process.stderr.write('  run that never recorded the mutant has not been told the difference.\n');
  }
  if (truncated.length > 0) {
    process.stderr.write('verify-sites-are-sensitive: these claimants were stopped by a test budget instead of failing:\n');
    for (const problem of truncated) {
      process.stderr.write(`  ${problem.head}\n`);
      for (const line of problem.detail) process.stderr.write(`    ${line}\n`);
    }
    process.stderr.write('  Raise the declaration to the battery\'s number, or make the mutated path fail rather\n');
    process.stderr.write('  than wait: a run the harness ended is a claim nobody read.\n');
  }
  process.stderr.write('');
  process.stderr.write(`verify-sites-are-sensitive: FAILED -- ${String(failures)} problem(s)\n`);
  process.exit(1);
}

if (costsText !== null) {
  // The table is written only here: after every claimant was measured and nothing
  // failed. A run that stopped early exits above, so a table can never name a subset
  // and never carries a number for a run that did not happen.
  //
  // The rows are the two halves the per-file lines print -- one baseline and the runs
  // per claim -- because those are what the pool spends, and the partition balances the
  // pool. `measured`, `machine` and `source` are the table's provenance: the coverage
  // verdict reads all three, and a round that refreshes the table needs to know which
  // run and which box the numbers belong to before comparing them with the next pair of
  // job seconds.
  //
  // Each row also carries `witnesses`: the test that noticed, per claim. It is the same
  // measurement as the seconds -- both come from the run that credited the claim -- and
  // it is what makes the seconds *smaller* next time, so a table that carried one and not
  // the other would describe a battery nobody could re-derive.
  const where = resolve(ROOT, costsText);
  const rows = {};
  for (const [file, claims] of byFile) {
    const row = paid.get(file) ?? { runs: 0, ms: 0 };
    const seen = {};
    for (const claim of claims) {
      const witness = witnesses.get(claim.site);
      if (typeof witness === 'string' && witness !== '') seen[claim.site] = witness;
    }
    rows[file] = {
      claims: claims.length,
      runs: row.runs + 1,
      baselineMs: Math.max(1, Math.round(baselineOf.get(file) ?? 0)),
      mutantMs: Math.max(1, Math.round(row.ms)),
      witnesses: seen,
    };
  }
  const table = {
    measured: new Date().toISOString().slice(0, 10),
    machine: `${platform()} ${arch()}, ${String(cpus().length)} cpu`,
    source: `node scripts/verify-sites-are-sensitive.mjs --costs ${relative(ROOT, where) || where}`,
    files: rows,
  };
  writeFileSync(where, `${JSON.stringify(table, null, 2)}\n`);
  const totalMs = Object.values(rows).reduce((total, row) => total + row.baselineMs + row.mutantMs, 0);
  process.stdout.write(
    `verify-sites-are-sensitive: wrote ${relative(ROOT, where) || where} -- ${String(Object.keys(rows).length)} ` +
      `claimant(s), ${String(claimed.length)} claim(s), ${seconds(totalMs)} of child time measured on ` +
      `${table.measured} by ${table.machine}\n`,
  );
}

const exits = claimed.filter((claim) => claim.kind === 'exit').length;
const throws = claimed.length - exits;
process.stdout.write(
  `verify-sites-are-sensitive: PASSED (${String(claimed.length)} claim(s) across ` +
    `${String(runnable.length)} file(s), ${String(runs)} run(s), ${minutes} min -- ` +
    `${String(exits)} exit(s) hollowed, ${String(throws)} throw(s) removed -- and some test goes red ` +
    'for every one of them)\n',
);
