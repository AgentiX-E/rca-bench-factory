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
  runVerdict,
  treeMoved,
  verifiedTree,
  voidReport,
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
    // `because` is what the verdict reads. Reading the sentence instead would make a
    // wording change a behaviour change, and the corpus has been here: finding 562's
    // decision was right and nothing could ask it which kind of right it was.
    expect(decision.because).toBe('subset');
    expect(decision.why).toContain('subset of the steps');
  });

  it('withholds on a dirty tree for the reason the tree gave, not a new one', () => {
    const tree = { state: 'dirty', tree: TREE_A, why: 'the working tree differs from aaaaaaa' };
    expect(receiptDecision({ tree, full: true })).toEqual({
      state: 'withhold',
      because: 'starting-tree',
      why: tree.why,
    });
  });

  it('withholds when the tree moved while the gate ran', () => {
    // The name is resolved before the first step, so a step that rewrites the tree
    // leaves the receipt describing content nothing measured. v3.105 published a gate
    // with `process.exit(0)` on its second line exactly this way, on a run whose
    // verdict said `OK`: a battery hollows a gate while it measures it, a commit made
    // during the run swept the hollowed file in, and the receipt named the tree the
    // run had started on.
    const decision = receiptDecision({
      tree: { state: 'clean', tree: TREE_A },
      full: true,
      ended: { state: 'clean', tree: TREE_B },
    });
    expect(decision.state).toBe('withhold');
    expect(decision.because).toBe('moved');
    expect(decision.why).toContain('the tree moved while the gate ran');
    expect(decision.why).toContain(TREE_A.slice(0, 7));
    expect(decision.why).toContain(TREE_B.slice(0, 7));
  });

  it('withholds when the tree it ended on has uncommitted changes', () => {
    const decision = receiptDecision({
      tree: { state: 'clean', tree: TREE_A },
      full: true,
      ended: { state: 'dirty', tree: TREE_A, why: 'the working tree differs from aaaaaaa' },
    });
    expect(decision.state).toBe('withhold');
    expect(decision.because).toBe('moved');
    expect(decision.why).toContain('with uncommitted changes');
  });

  it('issues when the tree it ended on is the one it started on', () => {
    expect(
      receiptDecision({
        tree: { state: 'clean', tree: TREE_A },
        full: true,
        ended: { state: 'clean', tree: TREE_A },
      }),
    ).toEqual({ state: 'issue', tree: TREE_A });
  });

  it('withholds when there is no repository, even on a full run', () => {
    const tree = { state: 'absent', tree: null, why: 'this directory is not a git checkout with a HEAD' };
    expect(receiptDecision({ tree, full: true }).state).toBe('withhold');
  });
});

/**
 * The one predicate two readers share, and the verdict that follows from it.
 *
 * Finding 563: v3.105 made the receipt withhold when the tree moved, and left the
 * sentence a reader trusts saying `verify:local: OK`. The run had measured a tree
 * that no longer existed, said so on its second line, and ended on exit 0 -- so a
 * reader who trusts the verdict (or a script that trusts the code) was told the
 * gate passed, about content nothing had measured. The repair splits the fact from
 * the sentence: `treeMoved` states it once, the receipt quotes it, and the verdict
 * becomes `VOID` on exit 1 when it is not null.
 *
 * Every shape here is driven directly, because the gate branch that consumes them
 * is reachable only by rewriting the tree underneath a running gate -- which is the
 * thing being refused. What that leaves unproved is the wiring, and it is stated
 * in the finding rather than implied.
 */
describe('gate-receipt · the tree a run ended on', () => {
  const clean = (tree) => ({ state: 'clean', tree });
  const dirty = (tree) => ({ state: 'dirty', tree, why: `the working tree differs from ${tree.slice(0, 7)}` });

  it('says nothing when the run ended on the tree it began on', () => {
    expect(treeMoved({ started: clean(TREE_A), ended: clean(TREE_A) })).toBeNull();
  });

  it('names both trees when the run ended on another one', () => {
    const sentence = treeMoved({ started: clean(TREE_A), ended: clean(TREE_B) });
    expect(sentence).toContain('the tree moved while the gate ran');
    expect(sentence).toContain(TREE_A.slice(0, 7));
    expect(sentence).toContain(TREE_B.slice(0, 7));
  });

  it('names the uncommitted changes when the run wrote to the tree it began on', () => {
    const sentence = treeMoved({ started: clean(TREE_A), ended: dirty(TREE_A) });
    expect(sentence).toContain('the tree moved while the gate ran');
    expect(sentence).toContain('with uncommitted changes');
  });

  it('says nothing when the run began dirty, because that is a developer at work', () => {
    // The distinction the rule needs and the one it is easy to lose: a run over a
    // dirty tree has measured content that cannot be pushed, and that is the normal
    // loop -- edit, run, edit. A run that *starts* clean and ends dirty is a step
    // writing while the gate ran, which is not. Comparing `state` alone would fail
    // every local run a developer makes, so the comparison is against the start.
    expect(treeMoved({ started: dirty(TREE_A), ended: dirty(TREE_A) })).toBeNull();
  });

  it('treats a tree that cannot be read afterwards as a move, because nothing names it', () => {
    const sentence = treeMoved({ started: clean(TREE_A), ended: { state: 'absent', tree: null, why: 'git failed' } });
    expect(sentence).toContain('could not be read after the gate ran');
  });

  it('says nothing when there was no tree to begin with', () => {
    const absent = { state: 'absent', tree: null, why: 'not a checkout' };
    expect(treeMoved({ started: absent, ended: absent })).toBeNull();
  });

  it('is the sentence the receipt withholds for, rather than a second copy of the rule', () => {
    const started = clean(TREE_A);
    const ended = clean(TREE_B);
    const sentence = treeMoved({ started, ended });
    expect(receiptDecision({ tree: started, full: true, ended }).why).toContain(sentence);
  });
});

describe('gate-receipt · the verdict a void run prints', () => {
  const COVERAGE = '35 command(s) covering 48 of the 58 run steps in ci.yml; the other 10 need a runner';
  const PASSED = { ok: true, commands: 35, outcomes: [] };
  const FAILED = { ok: false, commands: 35, outcomes: [], step: { first: 'a / one' }, index: 3 };

  const decisionFor = (over) => receiptDecision({
    tree: { state: 'clean', tree: TREE_A },
    full: true,
    ...(over === undefined ? {} : { ended: over }),
  });

  it('says OK and exits 0 when the steps passed over the tree it ended on', () => {
    expect(runVerdict({ result: PASSED, decision: decisionFor() })).toEqual({ word: 'OK', exit: 0 });
  });

  it('says OK for the kinds of withholding that are not a move', () => {
    // A subset run and a dirty start are states the run names and a reader can act on;
    // neither is evidence that what ran is not what is here. Only a move is.
    expect(runVerdict({ result: PASSED, decision: decisionFor() })).toEqual({ word: 'OK', exit: 0 });
    expect(runVerdict({ result: PASSED, decision: { state: 'withhold', because: 'subset', why: '' } })).toEqual({
      word: 'OK',
      exit: 0,
    });
  });

  it('says VOID and exits 1 when the steps passed over a tree that moved', () => {
    // The half v3.105 left undone: the receipt was refused and the exit code was 0.
    // A reader who trusts `$?` was told the gate passed, about content nothing had
    // measured. The word and the code come from one function so they cannot disagree.
    expect(runVerdict({ result: PASSED, decision: decisionFor({ state: 'clean', tree: TREE_B }) })).toEqual({
      word: 'VOID',
      exit: 1,
    });
  });

  it('says FAILED and exits 1 when a step failed, whichever tree it ended on', () => {
    expect(runVerdict({ result: FAILED, decision: decisionFor() })).toEqual({ word: 'FAILED', exit: 1 });
    expect(runVerdict({ result: FAILED, decision: decisionFor({ state: 'clean', tree: TREE_B }) })).toEqual({
      word: 'FAILED',
      exit: 1,
    });
  });

  it('says VOID with both names and what ran, and never the word OK', () => {
    const started = { state: 'clean', tree: TREE_A };
    const ended = { state: 'clean', tree: TREE_B };
    const decision = receiptDecision({ tree: started, full: true, ended });
    const text = voidReport({ decision, started, ended, coverage: COVERAGE }).join('\n');
    expect(text).toContain('verify:local: VOID');
    expect(text).not.toContain('verify:local: OK');
    expect(text).toContain(`started: ${TREE_A.slice(0, 7)} (clean)`);
    expect(text).toContain(`ended:   ${TREE_B.slice(0, 7)} (clean)`);
    expect(text).toContain(COVERAGE);
    // The sentence is the point of the block: a reader who is told `VOID` and not why
    // has been given a verdict about a tree they cannot find. Pinned here after a
    // falsification found that deleting the line was green -- the report is assembled
    // from six strings and five of them had a reader.
    expect(text).toContain(decision.why);
  });

  it('says the receipt is refused rather than missing, and says what to do next', () => {
    const started = { state: 'clean', tree: TREE_A };
    const ended = { state: 'dirty', tree: TREE_A, why: 'the working tree differs from aaaaaaa' };
    const text = voidReport({
      decision: receiptDecision({ tree: started, full: true, ended }),
      started,
      ended,
      coverage: COVERAGE,
    }).join('\n');
    expect(text).toContain('receipt: none');
    expect(text).toContain('uncommitted changes');
    expect(text).toContain('run it again');
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
