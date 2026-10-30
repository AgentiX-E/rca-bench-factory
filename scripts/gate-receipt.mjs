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
 */
export function receiptDecision({ tree, full }) {
  if (tree.state !== 'clean') return { state: 'withhold', why: tree.why };
  if (!full) {
    return {
      state: 'withhold',
      why: 'this run selected a subset of the steps, and a receipt says the gate ran',
    };
  }
  return { state: 'issue', tree: tree.tree };
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
