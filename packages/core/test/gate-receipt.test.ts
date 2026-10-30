import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  RECEIPT_DIR,
  gitIn,
  readReceipt,
  receiptDecision,
  receiptPath,
  revokeReceipt,
  verifiedTree,
  writeReceipt,
} from '../../../scripts/gate-receipt.mjs';

/**
 * The receipt a green gate run leaves behind, and the three ways it withholds one.
 *
 * ## What is being tested, and what is not
 *
 * The rule under test is: a receipt exists if and only if the gate ran over a
 * clean tree and ran all of it. The consumer is the pusher, which is not in this
 * repository, so nothing here proves that a push consults the file -- that is
 * stated at the head of the module rather than pretended. What is provable is the
 * file: its key, its shape, and the states that refuse to produce one.
 *
 * ## Why the runner is injected and the repository is real
 *
 * `verifiedTree` needs three answers from `git` -- HEAD, the tree, and whether the
 * working copy differs -- and two of those answers cannot be produced on demand:
 * a directory that is not a checkout, and a `git` that fails mid-way. The
 * injection covers those two, and a real temporary repository covers the clean and
 * dirty answers, so the mapping from `git`'s output to a state is exercised against
 * `git` rather than against this file's idea of it.
 */

const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-gate-receipt-'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

/** Two tree SHAs that are well-formed and distinct. Content is irrelevant here. */
const TREE_A = 'a'.repeat(40);
const TREE_B = 'b'.repeat(40);

/** A runner that answers from a table, for the two states a real repository cannot be put into. */
function runner(answers) {
  return (args) => {
    const key = args.join(' ');
    return key in answers ? answers[key] : null;
  };
}

function repository(name) {
  const root = join(SCRATCH, name);
  mkdirSync(root, { recursive: true });
  const git = (...args) =>
    spawnSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Lambertyan',
        GIT_AUTHOR_EMAIL: 'lambertyan@example.invalid',
        GIT_COMMITTER_NAME: 'Lambertyan',
        GIT_COMMITTER_EMAIL: 'lambertyan@example.invalid',
      },
    });
  git('init', '-q', '--initial-branch=main');
  writeFileSync(join(root, 'a.txt'), 'one\n', 'utf8');
  git('add', 'a.txt');
  git('commit', '-q', '-m', 'one');
  return { root, git };
}

describe('gate-receipt · the file a green run leaves', () => {
  it('files a receipt under the tree it verified, and reads the note back', () => {
    const receipt = writeReceipt({ root: SCRATCH, tree: TREE_A, note: 'verify:local' });
    expect(receipt.tree).toBe(TREE_A);
    expect(receipt.note).toBe('verify:local');
    expect(existsSync(receiptPath(SCRATCH, TREE_A))).toBe(true);

    const read = readReceipt({ root: SCRATCH, tree: TREE_A });
    expect(read.state).toBe('verified');
    expect(read.tree).toBe(TREE_A);
    expect(read.note).toBe('verify:local');
    expect(read.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps one file per tree, so two verified trees do not overwrite each other', () => {
    writeReceipt({ root: SCRATCH, tree: TREE_B, note: 'second' });
    expect(readReceipt({ root: SCRATCH, tree: TREE_A }).note).toBe('verify:local');
    expect(readReceipt({ root: SCRATCH, tree: TREE_B }).note).toBe('second');
  });

  it('refuses a name that is not a tree SHA-1, and says what to resolve instead', () => {
    expect(() => writeReceipt({ root: SCRATCH, tree: 'HEAD', note: 'x' })).toThrow(/not one/);
    expect(() => writeReceipt({ root: SCRATCH, tree: 'HEAD', note: 'x' })).toThrow(/HEAD\^\{tree\}/);
    expect(() => writeReceipt({ root: SCRATCH, tree: TREE_A.slice(0, 7), note: 'x' })).toThrow(TypeError);
  });

  it('answers absent, with the path, for a tree the gate never blessed', () => {
    const read = readReceipt({ root: SCRATCH, tree: 'c'.repeat(40) });
    expect(read.state).toBe('absent');
    expect(read.path).toContain(RECEIPT_DIR);
  });
});

describe('gate-receipt · what an unreadable receipt is', () => {
  it('separates a receipt that is not JSON from a receipt that is missing', () => {
    const tree = 'd'.repeat(40);
    mkdirSync(join(SCRATCH, RECEIPT_DIR), { recursive: true });
    writeFileSync(receiptPath(SCRATCH, tree), 'not json at all', 'utf8');
    const read = readReceipt({ root: SCRATCH, tree });
    expect(read.state).toBe('unreadable');
    expect(read.why).toMatch(/not JSON/);
  });

  it('refuses a receipt copied from another tree, because the name is the whole claim', () => {
    const named = 'e'.repeat(40);
    const filed = 'f'.repeat(40);
    writeReceipt({ root: SCRATCH, tree: named, note: 'mine' });
    writeFileSync(receiptPath(SCRATCH, filed), readFileSync(receiptPath(SCRATCH, named), 'utf8'), 'utf8');
    const read = readReceipt({ root: SCRATCH, tree: filed });
    expect(read.state).toBe('unreadable');
    expect(read.why).toContain(filed);
    expect(read.why).toContain(named);
  });

  it('refuses a receipt that is an array or a bare value rather than trimming it', () => {
    const tree = '1'.repeat(40);
    writeFileSync(receiptPath(SCRATCH, tree), '[]', 'utf8');
    expect(readReceipt({ root: SCRATCH, tree }).why).toBe('the receipt is not an object');
    writeFileSync(receiptPath(SCRATCH, tree), '7', 'utf8');
    expect(readReceipt({ root: SCRATCH, tree }).state).toBe('unreadable');
  });
});

describe('gate-receipt · withdrawing one', () => {
  it('revokes a receipt and reports the second attempt as absent', () => {
    const tree = '2'.repeat(40);
    writeReceipt({ root: SCRATCH, tree, note: 'then a red run' });
    expect(revokeReceipt({ root: SCRATCH, tree }).state).toBe('revoked');
    expect(readReceipt({ root: SCRATCH, tree }).state).toBe('absent');
    expect(revokeReceipt({ root: SCRATCH, tree }).state).toBe('absent');
  });
});

describe('gate-receipt · which tree the gate was about', () => {
  it('names the tree of a clean checkout', () => {
    const { root } = repository('clean');
    const tree = verifiedTree({ root });
    expect(tree.state).toBe('clean');
    expect(tree.tree).toMatch(/^[0-9a-f]{40}$/);
  });

  it('refuses a dirty tree, because what ran is content that cannot be pushed', () => {
    const { root } = repository('dirty');
    writeFileSync(join(root, 'a.txt'), 'two\n', 'utf8');
    const tree = verifiedTree({ root });
    expect(tree.state).toBe('dirty');
    expect(tree.why).toContain('cannot be pushed');
    expect(tree.tree).toMatch(/^[0-9a-f]{40}$/);
  });

  it('answers absent outside a checkout, and absent when git cannot answer', () => {
    const outside = mkdtempSync(join(SCRATCH, 'not-a-repository-'));
    expect(verifiedTree({ root: outside }).state).toBe('absent');
    expect(verifiedTree({ root: outside }).why).toContain('not a git checkout');

    const noStatus = verifiedTree({
      root: SCRATCH,
      run: runner({
        'rev-parse --verify HEAD': 'abc\n',
        'rev-parse --verify HEAD^{tree}': `${TREE_A}\n`,
      }),
    });
    expect(noStatus.state).toBe('absent');
    expect(noStatus.why).toContain('could not report the working tree');
  });

  it('answers absent when the tree itself cannot be resolved, keeping the HEAD it saw', () => {
    const noTree = verifiedTree({
      root: SCRATCH,
      run: runner({ 'rev-parse --verify HEAD': 'abc\n' }),
    });
    expect(noTree.state).toBe('absent');
    expect(noTree.tree).toBeNull();
    expect(noTree.why).toContain('HEAD^{tree}');
  });

  it('reads a clean status as clean, through the injected runner', () => {
    const clean = verifiedTree({
      root: SCRATCH,
      run: runner({
        'rev-parse --verify HEAD': 'abc\n',
        'rev-parse --verify HEAD^{tree}': `${TREE_B}\n`,
        'status --porcelain --untracked-files=no': '',
      }),
    });
    expect(clean).toEqual({ state: 'clean', tree: TREE_B });
  });
});

describe('gate-receipt · the decision the gate obeys', () => {
  it('issues for a clean tree on a full run', () => {
    expect(receiptDecision({ tree: { state: 'clean', tree: TREE_A }, full: true })).toEqual({
      state: 'issue',
      tree: TREE_A,
    });
  });

  it('withholds on a subset run, because a receipt says the gate ran', () => {
    const decision = receiptDecision({ tree: { state: 'clean', tree: TREE_A }, full: false });
    expect(decision.state).toBe('withhold');
    expect(decision.why).toContain('subset of the steps');
  });

  it('withholds on a dirty tree for the reason the tree gave, not a new one', () => {
    const tree = { state: 'dirty', tree: TREE_A, why: 'the working tree differs from aaaaaaa' };
    expect(receiptDecision({ tree, full: true })).toEqual({ state: 'withhold', why: tree.why });
  });

  it('withholds when there is no repository, even on a full run', () => {
    const tree = { state: 'absent', tree: null, why: 'this directory is not a git checkout with a HEAD' };
    expect(receiptDecision({ tree, full: true }).state).toBe('withhold');
  });
});

describe('gate-receipt · the git runner itself', () => {
  it('answers stdout for a command that works and null for one that does not', () => {
    const { root } = repository('runner');
    const run = gitIn(root);
    expect(run(['rev-parse', '--verify', 'HEAD'])).toMatch(/^[0-9a-f]{40}\n$/);
    expect(run(['rev-parse', '--verify', 'no-such-revision-here'])).toBeNull();
    expect(run(['not-a-git-subcommand'])).toBeNull();
  });
});
