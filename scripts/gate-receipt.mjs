#!/usr/bin/env node
/**
 * What the gate saw, kept as a file, so the push can ask instead of assume.
 *
 * ## The defect this exists for
 *
 * `scripts/verify-local.mjs` runs every CI step that can run here and prints a
 * verdict. The verdict is a sentence on a terminal. Nothing writes it down, and
 * nothing downstream reads it -- so the only thing standing between a red tree
 * and a push is that the person pushing remembers.
 *
 * Measured on this round's first push. Three revisions went up, the second and
 * third green, and the first red on three of six jobs:
 *
 *   05cd7a609  golden master / official metric / examples / documents  failure
 *   05cd7a609  cold tree / no build / every precondition declared      failure
 *   05cd7a609  build / typecheck / lint / coverage / mutation          failure
 *
 * The two causes were a `lint` failure and a stale `gate-sites.json` -- both of
 * which `verify:local` runs, and both of which the same tree fails locally in
 * under a minute. The gate was not weak. **The gate was not asked**, because the
 * push did not go through `git push`: it went through a small script speaking
 * the Git Data API, and a hook is a property of a command this repository no
 * longer uses to publish. A red revision in the middle of a push is not a
 * cosmetic failure -- `git bisect` lands on it and blames the wrong change.
 *
 * ## Why a receipt rather than running the gate in the pusher
 *
 * The pusher could run `verify:local` before uploading. That is the correct rule
 * and the wrong instrument: a full run spends fifteen minutes of wall clock per
 * revision, and a push that takes forty-five minutes is a push that gets killed
 * (see the note at the head of the pusher about why it is incremental at all).
 * What the pusher actually needs is not the run -- it is the *fact that the run
 * happened, for this exact tree*. That fact is cheap to record and cheap to
 * check, and it cannot be forged by editing the tree afterwards, because it is
 * filed under the tree's own SHA.
 *
 * The key is `git rev-parse HEAD^{tree}`, not `HEAD`: a receipt names content,
 * so amending a commit message does not invalidate it and changing one byte
 * does. A dirty working tree gets no receipt at all, because the thing that was
 * verified is then a tree that exists nowhere and cannot be pushed.
 *
 * ## Why a module and not four lines in the gate
 *
 * `verify-local.mjs` is a gate: `verify-gates-are-testable.mjs` proves it by
 * emptying it, so no test may import it. Which states issue a receipt and which
 * withhold it -- a subset run, a dirty tree, no repository -- is the piece worth
 * a test, so it lives here as a pure decision, and the gate prints what it says.
 *
 * ## What this cannot promise
 *
 * The receipt is only as good as its consumer. The consumer is the pusher, which
 * is not in this repository, so no test here holds the two together; what is
 * tested is that a receipt exists if and only if the gate ran over a clean tree.
 * A push path that ignores the file is indistinguishable, from inside the tree,
 * from a push path that reads it -- and that is stated rather than papered over.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { localCommands } from './gate-steps.mjs';

/** Where receipts live: inside `.git`, so they are never committed and never counted. */
export const RECEIPT_DIR = join('.git', 'rca-bench-verified');

/** A tree name is a SHA-1 and nothing else is: a receipt keyed on a guess is worse than none. */
const TREE = /^[0-9a-f]{40}$/;

/**
 * The path a receipt for `tree` occupies under `root`.
 *
 * One file per tree rather than one file holding a map: a map is a file two
 * gates write at once, and the loser's receipt disappears without a word.
 */
export function receiptPath(root, tree) {
  return join(root, RECEIPT_DIR, `${tree}.json`);
}

function requireTree(tree) {
  if (typeof tree !== 'string' || !TREE.test(tree)) {
    throw new TypeError(
      `a receipt is filed under a tree SHA-1, and '${String(tree)}' is not one; ` +
        'resolve HEAD^{tree} first -- a receipt filed under a branch name outlives the branch',
    );
  }
  return tree;
}

/** Run `git` in `root`, and answer `null` rather than throwing: every caller has a state for it. */
export function gitIn(root) {
  return (args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.error !== undefined || result.status !== 0) return null;
    return result.stdout;
  };
}

/**
 * The tree this working copy would commit, and whether the run may name it.
 *
 * Three states and no fourth. `absent` is a directory that is not a checkout --
 * the receipt cannot be filed, and the gate still has a verdict to print.
 * `dirty` carries the tree as well, because the caller may need to revoke a
 * receipt left by an earlier green run over the same content.
 */
export function verifiedTree({ root, run = gitIn(root) }) {
  const head = run(['rev-parse', '--verify', 'HEAD']);
  if (head === null) {
    return { state: 'absent', tree: null, why: 'this directory is not a git checkout with a HEAD' };
  }
  const tree = run(['rev-parse', '--verify', 'HEAD^{tree}']);
  if (tree === null) {
    return { state: 'absent', tree: null, why: 'git could not resolve HEAD^{tree}, so there is no tree to name' };
  }
  const name = tree.trim();
  const status = run(['status', '--porcelain', '--untracked-files=no']);
  if (status === null) {
    return { state: 'absent', tree: name, why: 'git could not report the working tree, so it is not known what ran' };
  }
  if (status.trim() !== '') {
    return {
      state: 'dirty',
      tree: name,
      why: `the working tree differs from ${name.slice(0, 7)}, so what ran is a tree that cannot be pushed`,
    };
  }
  return { state: 'clean', tree: name };
}

/**
 * Whether a finished green run may issue a receipt, and the sentence saying why.
 *
 * A subset run withholds: `--only docs` proves the documentation guards and says
 * nothing about the coverage step, and a receipt that says "the gate ran" would
 * be the same sentence whether thirty-one commands ran or one.
 *
 * ## The tree at the end, because the name is resolved at the start
 *
 * The receipt is filed under the tree the run *began* on -- resolved before the first
 * step, so a step that rewrites the tree cannot move the name it is filed under. That
 * is the right key and an incomplete question: a run that begins on one tree and ends
 * on another has measured neither, and its verdict names the first.
 *
 * Measured in v3.105. A battery hollows a gate while it measures it, and a commit made
 * while the gate ran swept the hollowed file in: the published tree carried
 * `process.exit(0);` on the second line of `scripts/check-official.mjs`, and the gate
 * reported `OK` with a receipt for the tree it had started on. The exit-site inventory
 * caught it -- the extra line moved six of that file's sites by one -- and the suite
 * catches it too (68 tests fail against the hollow form, measured). What did not catch
 * it is the sentence a reader trusts.
 *
 * So a caller that can read the tree again passes `ended`, and a tree that moved
 * withholds the receipt. That was v3.105, and it left the sentence a reader trusts
 * saying `verify:local: OK`: the receipt was refused and the verdict was not, so the
 * run that had measured nothing still ended on exit 0 (finding 563). The comparison
 * moved out into `treeMoved`, which both the receipt and the verdict now quote, and
 * a run whose tree moved prints `VOID` and exits 1 through the exit that already
 * exists for a failed step -- a second exit would be a second site, and a site is
 * proved by a test that reaches it.
 */
export function receiptDecision({ tree, full, ended }) {
  if (tree.state !== 'clean') return { state: 'withhold', because: 'starting-tree', why: tree.why };
  if (!full) {
    return {
      state: 'withhold',
      because: 'subset',
      why: 'this run selected a subset of the steps, and a receipt says the gate ran',
    };
  }
  const moved = ended === undefined ? null : treeMoved({ started: tree, ended });
  if (moved !== null) {
    return {
      state: 'withhold',
      because: 'moved',
      why: `${moved}, so the verdict names a tree that no longer exists`,
    };
  }
  return { state: 'issue', tree: tree.tree };
}

/**
 * Whether the tree a run ended on is the one it began on, and the sentence if not.
 *
 * One predicate and two consumers: the receipt withholds because of it, and the
 * verdict is void because of it. Two copies of this comparison would be finding 561
 * again -- a rule with a home and a copy, agreeing today and diverging on the day a
 * shape neither was written for appears.
 *
 * ## Why a dirty start is not a move
 *
 * A run over a dirty tree has measured content that cannot be published, and that is
 * the loop a developer works in: edit, run, edit. A run that *starts* clean and ends
 * dirty is something else -- a step writing to the tree while the gate ran, which is
 * the shape v3.105 published. Comparing `state` alone would fail every local run; the
 * comparison is against the start.
 *
 * A tree that cannot be read afterwards is a move for the same reason it is not a
 * clean end: nothing names what the steps measured.
 */
export function treeMoved({ started, ended }) {
  if (started.state !== 'clean') return null;
  if (ended.state === 'absent') {
    return 'the tree could not be read after the gate ran, so nothing can name what the steps measured';
  }
  if (ended.state === 'dirty') {
    return (
      `the tree moved while the gate ran -- it started on ${started.tree.slice(0, 7)} ` +
      'and ended with uncommitted changes'
    );
  }
  if (ended.tree !== started.tree) {
    return (
      `the tree moved while the gate ran -- it started on ${started.tree.slice(0, 7)} ` +
      `and ended on ${ended.tree.slice(0, 7)}`
    );
  }
  return null;
}

/** What a tree is, in the words a reader needs beside a verdict. */
function treeName(tree) {
  if (tree.state === 'absent' || tree.tree === null) return 'no tree could be read';
  if (tree.state === 'dirty') return `${tree.tree.slice(0, 7)} (uncommitted changes)`;
  return `${tree.tree.slice(0, 7)} (clean)`;
}

/**
 * What the run says, and what it exits with.
 *
 * The word and the code are decided together because they are one claim. v3.105 decided
 * the receipt and left the pair alone: the run printed `OK` and exited 0 over content
 * nothing had measured, and a reader who trusts either half was told the gate passed.
 *
 * `FAILED` outranks `VOID` because a step that failed is the actionable fact: the move
 * is a consequence of the same battery, and the withheld receipt is already on stderr.
 * `VOID` exists as a third word rather than reusing `FAILED` because a reader who sees
 * `FAILED` looks for the step that broke, and in this state no step did.
 */
export function runVerdict({ result, decision }) {
  if (!result.ok) return { word: 'FAILED', exit: 1 };
  if (decision.state === 'withhold' && decision.because === 'moved') return { word: 'VOID', exit: 1 };
  return { word: 'OK', exit: 0 };
}

/**
 * The block a run prints when its tree moved: the same shape as a failure report,
 * on stderr, from the same exit.
 *
 * The verdict word is `VOID` rather than `FAILED` because no step failed -- the steps
 * passed, over content that is no longer this tree. A reader who sees `FAILED` looks
 * for the step that broke; a reader who sees `VOID` looks at what moved.
 */
export function voidReport({ decision, started, ended, coverage }) {
  return [
    '',
    'verify:local: VOID — the tree moved while the gate ran',
    `  started: ${treeName(started)}`,
    `  ended:   ${treeName(ended)}`,
    `  measured: ${coverage}`,
    `  reason:  ${decision.why}`,
    '  receipt: none — the steps passed over content this tree no longer is, so no revision here may be published',
    '  next:    run it again on the tree you mean to publish',
  ];
}

/**
 * The inputs a rehearsal hands the gate, one per shape a run can end in.
 *
 * ## Why this table is here and not in `verify-local.mjs`
 *
 * It is the same reason `receiptDecision` is here: the gate may not be imported, so
 * anything the gate must be *driven* with has to live in a module a test can read. But
 * there is a second reason, and it is the one that keeps this table honest -- it is the
 * **enumeration of this file's own branches**. A shape is added when a branch is added,
 * and a reader who changes `receiptDecision` sees, twenty lines below, the sample that
 * would have to change with it. Two homes would let the samples describe last round's
 * rule, and a rehearsal is worthless if it rehearses a rule nothing follows.
 *
 * ## Why a rehearsal at all
 *
 * Finding 563 closed with a measurement rather than a claim: a gate told to ignore the
 * decision it computed -- `runVerdict({ result, decision: { state: 'issue' } })` -- was
 * green everywhere, because the inventory proves that exits exist and are reached, and
 * hollowing proves a gate is executed, and neither asks whether the value the gate
 * computed is the value it obeyed. The only spawn that could observe it for real would
 * have to rewrite the tree underneath a running gate. A rehearsal is the same gate with
 * its inputs taken from a table, so the close-out -- one decision, one verdict, one
 * branch, one exit -- is executed by a test in a second.
 *
 * A dirty start is deliberately absent from the table. It is a state a developer is in
 * all day, its verdict is `OK` with no receipt, and its shape is already driven through
 * the real path by `--only`; a rehearsal for it would be a copy of a test that exists.
 */
const TREE_A = '1f4a0c9b2e7d3a5f8c6b4d2e0a9f7c5b3d1e8a06';
const TREE_B = '9c2b7d4e1a8f6c3b5d0e2f4a7c9b1d3e5f8a0c62';

/** Sorted, because the gate publishes this list in its refusal and a test sorts too. */
export const REHEARSAL_SHAPES = ['dirty-end', 'failed', 'moved', 'passed', 'subset'];

/**
 * The inputs `verify-local.mjs` would have computed, for one named shape.
 *
 * `plan` is the shipped plan, so the failing shape names the step a real failure would
 * name first. That is the point of passing it: a rehearsal with a hand-written step would
 * be a second description of the workflow, and this repository has spent rounds removing
 * those.
 *
 * Returns `null` for a name in neither this table nor the caller's list, because a typo
 * that rehearsed a different shape would be silent -- the exact failure a table of inputs
 * invites.
 */
export function rehearsal(name, plan) {
  // A failure names the first command a run would execute, which is a *command* rather
  // than a step: `localCommands` merges steps that run the same shell line, and the merged
  // entry is what `failureReport` prints. Building one here rather than taking a step's key
  // keeps the rehearsal and the run naming the same thing.
  const step = localCommands(plan.local)[0];
  const total = plan.local.length + plan.remote.length;
  const coverage =
    `0 command(s) covering ${String(plan.local.length)} of the ${String(total)} run steps in ci.yml; ` +
    `the other ${String(plan.remote.length)} need a runner`;
  const clean = { state: 'clean', tree: TREE_A };
  const passed = {
    ok: true,
    timedOut: false,
    exhausted: false,
    index: -1,
    step: null,
    commands: 0,
    error: null,
    outcomes: [],
    failedJobs: [],
    cancelledJobs: [],
    jobs: [],
    budgets: [],
  };
  const endedWith = (state) => {
    if (state === 'clean') return { state: 'clean', tree: TREE_A };
    if (state === 'other') return { state: 'clean', tree: TREE_B };
    return {
      state: 'dirty',
      tree: TREE_A,
      why: `the working tree differs from ${TREE_A.slice(0, 7)}, so what ran is a tree that cannot be pushed`,
    };
  };
  switch (name) {
    case 'passed':
      return { result: passed, tree: clean, ended: endedWith('clean'), full: true, coverage };
    case 'subset':
      return {
        result: passed,
        tree: clean,
        ended: endedWith('clean'),
        full: false,
        coverage: `0 command(s), 1 of the ${String(plan.local.length)} local steps`,
      };
    case 'moved':
      return { result: passed, tree: clean, ended: endedWith('other'), full: true, coverage };
    case 'dirty-end':
      return { result: passed, tree: clean, ended: endedWith('dirty'), full: true, coverage };
    // Both are true here on purpose: a step failed *and* the tree moved. `FAILED` has to
    // outrank `VOID`, and this is the only place where one run is both.
    case 'failed':
      return {
        result: { ...passed, ok: false, index: 0, step, commands: 1, error: new Error('the step exited 1') },
        tree: clean,
        ended: endedWith('other'),
        full: true,
        coverage,
      };
    default:
      return null;
  }
}

/**
 * File the receipt. `note` is what the run called itself, so a human reading
 * `.git` later can tell a full gate from anything else that learns to write here.
 */
export function writeReceipt({ root, tree, note }) {
  const name = requireTree(tree);
  const path = receiptPath(root, name);
  mkdirSync(join(root, RECEIPT_DIR), { recursive: true });
  const receipt = { tree: name, at: new Date().toISOString(), note: String(note ?? '') };
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receipt;
}

/**
 * Read back what a tree is owed. Nothing here throws: a pusher asking about an
 * unverified revision is a normal answer, and `unreadable` is kept apart from
 * `absent` because a hand-edited receipt is a different event from a missing one.
 */
export function readReceipt({ root, tree }) {
  const path = receiptPath(root, String(tree));
  if (!existsSync(path)) return { state: 'absent', path };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { state: 'unreadable', path, why: `the receipt is not JSON: ${String(error.message)}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: 'unreadable', path, why: 'the receipt is not an object' };
  }
  if (parsed.tree !== tree) {
    return {
      state: 'unreadable',
      path,
      why: `the receipt names tree '${String(parsed.tree)}' and is filed under '${String(tree)}'`,
    };
  }
  return { state: 'verified', path, tree: parsed.tree, at: String(parsed.at ?? ''), note: String(parsed.note ?? '') };
}

/**
 * Withdraw a receipt. A red run over the same tree revokes it: two verdicts
 * about identical bytes cannot both stand, and the one that stands should be the
 * later one.
 */
export function revokeReceipt({ root, tree }) {
  const path = receiptPath(root, String(tree));
  if (!existsSync(path)) return { state: 'absent', path };
  rmSync(path, { force: true });
  return { state: 'revoked', path };
}
