import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  EMPTY_TREE,
  diffEntries,
  filesFromEntries,
  locateBase,
  parseIdent,
  planPublish,
  predictRebuild,
  readAncestry,
  readCommit,
  readFiles,
  readTreeOf,
  requireSha,
  resolveSymbol,
  runGit,
  summarisePlan,
} from '../../../scripts/publish-plan.mjs';

/**
 * What a push decides before it writes anything, on real repositories.
 *
 * ## What was wrong with asking this of the pusher
 *
 * The arithmetic under test here existed for one round as a function inside a Python
 * script kept outside both repositories, with no test and no consumer but itself. It ran
 * exactly once, against a live branch, in the round that repaired finding 404 -- so the
 * only evidence that the repair worked was the incident it repaired. Every case below
 * would have had to be run by hand against `api.github.com`, one branch per case.
 *
 * ## Why the repositories are real
 *
 * The planner reads `git`, and its whole input is a history: trees, parents, a message
 * with the exact bytes the commit object stores, and the two identities. A fixture
 * invented in TypeScript would agree with whatever this file believes a commit looks
 * like -- and the one defect found while writing these cases was exactly that: `git log
 * --format=%B` renders a message and drops the trailing newline the object stores, so a
 * plan built from it produced commits that were right in every field a reader checks and
 * wrong in their names. Only a real repository can catch that.
 *
 * Every repository is created under one scratch directory and removed at the end.
 */

const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-publish-plan-'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Lambertyan',
  GIT_AUTHOR_EMAIL: 'lambertyan@example.com',
  GIT_COMMITTER_NAME: 'Lambertyan',
  GIT_COMMITTER_EMAIL: 'lambertyan@example.com',
};

function git(root: string, args: string[], options: Record<string, unknown> = {}) {
  const { env: extra, ...rest } = options;
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    ...rest,
    env: { ...process.env, ...IDENTITY, ...((extra as object) ?? {}) },
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(result.stderr)}`);
  return result.stdout;
}

/** A repository whose commits carry fixed dates, so two runs of a case produce one history. */
function repository(name: string): string {
  const root = join(SCRATCH, name);
  mkdirSync(root, { recursive: true });
  git(root, ['init', '-q', '-b', 'main', '.']);
  return root;
}

let clock = 1762265460;

/** One commit: `files` is path -> content, and `-1` for a path means "delete it". */
function commit(root: string, message: string, files: Record<string, string | null>, executable: string[] = []): string {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    if (content === null) {
      rmSync(full, { force: true });
      git(root, ['rm', '-q', '--cached', '--', path]);
      continue;
    }
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
    git(root, ['add', '--', path]);
    if (executable.includes(path)) git(root, ['update-index', '--chmod=+x', '--', path]);
  }
  clock += 60;
  const date = `${new Date(clock * 1000).toISOString().slice(0, 19).replace('T', ' ')} +0000`;
  git(root, ['commit', '-q', '--allow-empty', '-m', message], { env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  return git(root, ['rev-parse', 'HEAD']).trim();
}

function treeAt(root: string, rev: string) {
  return readTreeOf({ root, rev });
}

function ancestryOf(root: string, rev = 'HEAD') {
  return readAncestry({ root, rev });
}

function commitOf(root: string, rev: string) {
  return readCommit({ root, sha: git(root, ['rev-parse', rev]).trim() });
}

/**
 * A remote in the shape the planner expects: what `publish` builds from a transport.
 *
 * The file map is read from the tree rather than left empty, because an empty map is not
 * a remote with no files -- it is a remote whose every path differs, and a case built on
 * one would prove a diff of everything.
 */
function remoteOf(root: string, head: string | null, tree: string | null): Record<string, unknown> {
  return { head, tree, files: tree === null ? {} : readFiles({ root, tree }), truncated: false };
}

describe('locating the base the remote already holds', () => {
  it('prefers a commit the remote holds to a tree that merely matches', () => {
    const ancestry = [
      { sha: 'a'.repeat(40), tree: '1'.repeat(40), parents: ['b'.repeat(40)] },
      { sha: 'b'.repeat(40), tree: '2'.repeat(40), parents: [] },
    ];
    // The tip's tree also appears deeper in the history; the commit is the better answer
    // because it says where in the *history* the remote sits, not merely what it holds.
    const located = locateBase({ ancestry, remote: { head: 'b'.repeat(40), tree: '1'.repeat(40) } });
    expect(located).toEqual({ kind: 'commit', index: 1 });
  });

  it('falls back to a tree match, which is the only comparison a rebuilt commit allows', () => {
    const ancestry = [
      { sha: 'a'.repeat(40), tree: '1'.repeat(40), parents: [] },
      { sha: 'b'.repeat(40), tree: '2'.repeat(40), parents: ['a'.repeat(40)] },
    ];
    const located = locateBase({ ancestry, remote: { head: 'f'.repeat(40), tree: '1'.repeat(40) } });
    expect(located).toEqual({ kind: 'tree', index: 0 });
  });

  it('answers null when the remote holds neither, which is the state finding 404 was published in', () => {
    const ancestry = [{ sha: 'a'.repeat(40), tree: '1'.repeat(40), parents: [] }];
    expect(locateBase({ ancestry, remote: { head: 'f'.repeat(40), tree: 'e'.repeat(40) } })).toBeNull();
  });

  it('is answered from a real history: three commits, and the remote sits on the first', () => {
    const root = repository('locate');
    const first = commit(root, 'first', { 'a.txt': 'a\n' });
    commit(root, 'second', { 'b.txt': 'b\n' });
    const third = commit(root, 'third', { 'c.txt': 'c\n' });

    const located = locateBase({ ancestry: ancestryOf(root), remote: { head: first, tree: treeAt(root, first) } });
    expect(located).toEqual({ kind: 'commit', index: 2 });
    expect(readAncestry({ root, rev: third })[0]).toMatchObject({ sha: third });
  });
});

describe('reading a commit the way a rebuild needs it', () => {
  it('keeps the message exactly as the object stores it, including its final newline', () => {
    const root = repository('message');
    const sha = commit(root, 'subject line\n\nbody paragraph', { 'a.txt': 'a\n' });
    const raw = git(root, ['cat-file', 'commit', sha]);
    const stored = raw.slice(raw.indexOf('\n\n') + 2);

    const read = commitOf(root, sha);
    // `git log --format=%B` renders this same message without the trailing newline. A
    // rebuilt commit carrying the rendered form has a different SHA, and nothing a reader
    // looks at would say so -- which is why the assertion is on the byte.
    expect(read.message).toBe(stored);
    expect(read.message.endsWith('\n')).toBe(true);
    expect(read.message).not.toBe(git(root, ['log', '-1', '--format=%B', sha]));
  });

  it('reads both identities with their own offsets', () => {
    const root = repository('identities');
    const sha = commit(root, 'one', { 'a.txt': 'a\n' });
    const read = commitOf(root, sha);
    expect(read.author).toEqual({ name: 'Lambertyan', email: 'lambertyan@example.com', date: read.author.date });
    expect(read.author.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(read.tree).toBe(treeAt(root, sha));
  });

  it('reads every blob of a tree with its mode', () => {
    const root = repository('files');
    const sha = commit(root, 'executable', { 'run.sh': '#!/bin/sh\n', 'plain.txt': 'p\n' }, ['run.sh']);
    const files = readFiles({ root, tree: treeAt(root, sha) });
    expect(files['run.sh']).toMatchObject({ mode: '100755' });
    expect(files['plain.txt']).toMatchObject({ mode: '100644' });
  });

  it('refuses when git cannot answer, quoting the command and not a stack frame', () => {
    // A directory that is not a repository, and a `git` that cannot be found: the two ways
    // a read fails, and the two messages a reader needs in order to tell them apart.
    expect(() => readAncestry({ root: SCRATCH, rev: 'HEAD' })).toThrow(/git log .* failed in/);
    expect(() => runGit(SCRATCH, ['log'], { env: { PATH: '/nonexistent' }, encoding: 'utf8' })).toThrow(
      /could not start/,
    );
  });

  it('refuses a gitlink rather than publishing a tree that is missing a directory', () => {
    const root = repository('gitlink');
    const inner = commit(root, 'inner', { 'x.txt': 'x\n' });
    git(root, ['update-index', '--add', '--cacheinfo', `160000,${inner},vendor`]);
    git(root, ['commit', '-q', '-m', 'a submodule pointer']);
    const tree = treeAt(root, 'HEAD');

    expect(() => readFiles({ root, tree })).toThrow(/is a commit and a plan can only carry blobs/);
  });
});

describe('the file table, from either source', () => {
  it('skips a directory entry and refuses a gitlink', () => {
    expect(
      filesFromEntries([
        { path: 'src', mode: '040000', type: 'tree', sha: 'a'.repeat(40) },
        { path: 'src/a.ts', mode: '100644', type: 'blob', sha: 'b'.repeat(40) },
      ]),
    ).toEqual({ 'src/a.ts': { mode: '100644', sha: 'b'.repeat(40) } });

    expect(() => filesFromEntries([{ path: 'vendor', mode: '160000', type: 'commit', sha: 'a'.repeat(40) }])).toThrow(
      /is a commit and a plan can only carry blobs/,
    );
  });

  it('refuses a blob whose name is not a SHA, from a listing that arrives over a wire', () => {
    expect(() => filesFromEntries([{ path: 'a.txt', mode: '100644', type: 'blob', sha: 'HEAD' }])).toThrow(
      /must be a 40-character SHA-1/,
    );
    expect(() => requireSha(null, 'a tree')).toThrow(/must be a 40-character SHA-1/);
  });
});

describe('the identity a commit carries', () => {
  it('parses an offset into a wall clock that keeps the offset it came with', () => {
    expect(parseIdent('Lambertyan <l@example.com> 1762265460 +0800')).toEqual({
      name: 'Lambertyan',
      email: 'l@example.com',
      date: '2025-11-04T22:11:00+08:00',
    });
    expect(parseIdent('Lambertyan <l@example.com> 1762265460 -0430').date).toBe('2025-11-04T09:41:00-04:30');
  });

  it('refuses a line it cannot parse rather than inventing a name', () => {
    expect(() => parseIdent('Lambertyan 1762265460')).toThrow(/identity this reader cannot parse/);
  });
});

describe('the entries that turn one tree into the next', () => {
  it('names a deletion with the mode of the file being removed', () => {
    const entries = diffEntries({
      before: { 'gone.sh': { mode: '100755', sha: 'a'.repeat(40) } },
      after: {},
    });
    expect(entries).toEqual([{ path: 'gone.sh', mode: '100755', type: 'blob', sha: null }]);
  });

  it('treats a mode change as a change, because a mode is part of the object', () => {
    const entries = diffEntries({
      before: { 'run.sh': { mode: '100644', sha: 'a'.repeat(40) } },
      after: { 'run.sh': { mode: '100755', sha: 'a'.repeat(40) } },
    });
    expect(entries).toEqual([{ path: 'run.sh', mode: '100755', type: 'blob', sha: 'a'.repeat(40) }]);
  });

  it('is empty when the two trees are the same object, which is what an up-to-date push costs', () => {
    const files = { 'a.txt': { mode: '100644', sha: 'a'.repeat(40) } };
    expect(diffEntries({ before: files, after: files })).toEqual([]);
  });

  it('refuses a mode a tree entry cannot carry', () => {
    expect(() =>
      diffEntries({ before: {}, after: { 'sub': { mode: '160000', sha: 'a'.repeat(40) } } }),
    ).toThrow(/mode 160000, and a tree entry can only be 100644, 100755, 120000/);
  });
});

describe('a plan, which is the thing a push decides', () => {
  it('replays three commits onto the remote tip, each hanging on the one before it', () => {
    const root = repository('plan');
    const first = commit(root, 'first', { 'a.txt': 'a\n' });
    const second = commit(root, 'second', { 'b.txt': 'b\n' });
    const third = commit(root, 'third', { 'c.txt': 'c\n' });

    const ancestry = ancestryOf(root);
    const located = locateBase({ ancestry, remote: { head: first, tree: treeAt(root, first) } });
    const window = ancestry.slice(0, located.index).reverse();
    const plan = planPublish({
      remote: remoteOf(root, first, treeAt(root, first)),
      commits: window.map((entry) => readCommit({ root, sha: entry.sha })),
    });

    expect(plan.commits.map((step) => step.sha)).toEqual([second, third]);
    expect(plan.commits[0].parent).toEqual({ kind: 'remote' });
    expect(plan.commits[0].base).toEqual({ kind: 'remote' });
    expect(plan.commits[1].parent).toEqual({ kind: 'commit', sha: second });
    expect(plan.commits[1].base).toEqual({ kind: 'commit', sha: second });
    expect(plan.commits[0].entries).toEqual([{ path: 'b.txt', mode: '100644', type: 'blob', sha: expect.any(String) }]);
    expect(plan.commits[0].changed).toBe(1);
    expect(plan.commits[0].removed).toBe(0);
    expect(plan.tipTree).toBe(treeAt(root, third));
  });

  it('carries a deletion into the next commit rather than leaving the file behind', () => {
    const root = repository('deletion');
    const first = commit(root, 'first', { 'a.txt': 'a\n', 'gone.txt': 'g\n' });
    const second = commit(root, 'second', { 'gone.txt': null });

    const plan = planPublish({
      remote: remoteOf(root, first, treeAt(root, first)),
      commits: [readCommit({ root, sha: second })],
    });
    expect(plan.commits[0].entries).toEqual([{ path: 'gone.txt', mode: '100644', type: 'blob', sha: null }]);
    expect(plan.commits[0].removed).toBe(1);
  });

  it('publishes a whole history onto an unborn branch, root first and with no parent', () => {
    const root = repository('unborn');
    const first = commit(root, 'first', { 'a.txt': 'a\n' });
    const second = commit(root, 'second', { 'b.txt': 'b\n' });

    const plan = planPublish({
      remote: { head: null, tree: null, files: {}, truncated: false },
      commits: [first, second].map((sha) => readCommit({ root, sha })),
    });
    expect(plan.commits.map((step) => step.parent)).toEqual([{ kind: 'none' }, { kind: 'commit', sha: first }]);
    expect(plan.commits[0].base).toEqual({ kind: 'empty' });
    expect(plan.commits[0].entries.map((entry) => entry.path)).toEqual(['a.txt']);
  });

  it('refuses a truncated listing before it decides what to delete', () => {
    const root = repository('truncated');
    const first = commit(root, 'first', { 'a.txt': 'a\n' });
    expect(() =>
      planPublish({
        remote: { head: 'b'.repeat(40), tree: 'c'.repeat(40), files: {}, truncated: true },
        commits: [readCommit({ root, sha: first })],
      }),
    ).toThrow(/the tree listing is truncated/);
  });

  it('refuses an empty plan, because a ref moved to where it is is not a push', () => {
    expect(() => planPublish({ remote: { head: 'a'.repeat(40), tree: null, files: {}, truncated: false }, commits: [] })).toThrow(
      /a plan with no commits would move a ref to where it already is/,
    );
  });

  it('refuses a merge, whose second parent the remote would never receive', () => {
    const root = repository('merge');
    const base = commit(root, 'base', { 'a.txt': 'a\n' });
    git(root, ['checkout', '-q', '-b', 'side', base]);
    commit(root, 'side', { 'b.txt': 'b\n' });
    git(root, ['checkout', '-q', 'main']);
    commit(root, 'trunk', { 'c.txt': 'c\n' });
    git(root, ['merge', '-q', '--no-ff', 'side', '-m', 'a merge']);
    const merge = git(root, ['rev-parse', 'HEAD']).trim();

    expect(() =>
      planPublish({
        remote: { head: 'f'.repeat(40), tree: treeAt(root, base), files: readFiles({ root, tree: treeAt(root, base) }), truncated: false },
        commits: [readCommit({ root, sha: merge })],
      }),
    ).toThrow(/has 2 parents, and a replayed commit is published on one/);
  });

  it('refuses a commit with no parent unless it is the root of an unborn branch', () => {
    const root = repository('rooted');
    const first = commit(root, 'first', { 'a.txt': 'a\n' });
    const orphan = readCommit({ root, sha: first });
    expect(() => planPublish({ remote: remoteOf(root, 'f'.repeat(40), null), commits: [orphan] })).toThrow(
      /has 0 parents/,
    );
  });
});

describe('the plan as a sentence, and the symbols it hands to an executor', () => {
  it('prints where each commit hangs, not a number it cannot know', () => {
    const root = repository('summary');
    const first = commit(root, 'first', { 'a.txt': 'a\n' });
    const second = commit(root, 'second', { 'b.txt': 'b\n' });
    const plan = planPublish({
      remote: remoteOf(root, first, treeAt(root, first)),
      commits: [readCommit({ root, sha: second })],
    });
    const [line] = summarisePlan(plan);
    expect(line).toContain(`${second.slice(0, 9)} on the remote tip`);
    expect(line).toContain('1 changed, 0 removed, 2 file(s)');
  });

  it('resolves a symbol against the objects that exist, and refuses one that does not', () => {
    const remote = { head: 'a'.repeat(40), tree: 'b'.repeat(40) };
    const built = new Map([['c'.repeat(40), { commit: 'd'.repeat(40), tree: 'e'.repeat(40) }]]);
    expect(resolveSymbol({ kind: 'remote' }, { remote, built, field: 'commit' })).toBe(remote.head);
    expect(resolveSymbol({ kind: 'remote' }, { remote, built, field: 'tree' })).toBe(remote.tree);
    expect(resolveSymbol({ kind: 'none' }, { remote, built, field: 'commit' })).toBeNull();
    expect(resolveSymbol({ kind: 'empty' }, { remote, built, field: 'tree' })).toBeNull();
    expect(resolveSymbol({ kind: 'commit', sha: 'c'.repeat(40) }, { remote, built, field: 'tree' })).toBe('e'.repeat(40));
    expect(resolveSymbol({ kind: 'commit', sha: 'c'.repeat(40) }, { remote, built, field: 'commit' })).toBe('d'.repeat(40));
    expect(() => resolveSymbol({ kind: 'commit', sha: 'f'.repeat(40) }, { remote, built, field: 'commit' })).toThrow(
      /that commit has not been built/,
    );
  });

  it('names the empty tree git itself uses, so an unborn plan is expressible', () => {
    expect(EMPTY_TREE).toHaveLength(40);
    expect(EMPTY_TREE).toMatch(/^[0-9a-f]{40}$/);
  });
});

/**
 * The commit a replay will produce, predicted before the API is asked for it.
 *
 * A push that hangs on a remote tip carrying the tree of a local ancestor -- a twin -- can
 * never reproduce the local SHAs: a commit's name is its content *and its parents' names*,
 * so replaying onto a twin renames every commit above it. The channel used to report that
 * as "the history it hangs on is not the local history" without ever checking the claim.
 * These cases give it the means to check it: the prediction is the local commit's own bytes
 * with the parent lines replaced, and `git hash-object` is the oracle.
 */
describe('the commit a replay will produce', () => {
  const parentsOf = (root: string, sha: string) =>
    git(root, ['rev-list', '--parents', '-n', '1', sha]).trim().split(' ').slice(1);

  it('is the commit itself when it is given that commit\'s own parents', () => {
    const root = repository('predict-identity');
    commit(root, 'first', { 'a.txt': 'a\n' });
    git(root, ['checkout', '-q', '-b', 'side']);
    commit(root, 'side', { 'b.txt': 'b\n' });
    git(root, ['checkout', '-q', 'main']);
    commit(root, 'trunk', { 'c.txt': 'c\n' });
    git(root, ['merge', '-q', '--no-ff', 'side', '-m', 'a merge']);
    // A merge is in the list on purpose: it is the one commit with two parent lines, and the
    // rewrite walks the lines in order. A prediction that used the first parent twice would
    // pass every single-parent case in this file and be wrong for exactly this one -- the
    // shape of a survivor, planted here rather than found by a battery.
    const shas = git(root, ['rev-list', '--reverse', 'HEAD']).trim().split('\n');
    expect(shas).toHaveLength(4);
    for (const sha of shas) {
      // The round trip is the whole proof of the reader: a function that reconstructed the
      // bytes wrongly would have to be wrong in a way that cancelled out in `hash-object`.
      expect(predictRebuild({ root, sha, parents: parentsOf(root, sha) })).toBe(sha);
    }
  });

  it('is the commit git itself writes for the new parents', () => {
    // An oracle the code does not share a line with: `commit-tree` builds the object from
    // the tree, the parent, the message and the two identities, and its output name is the
    // answer. Anything the prediction got wrong would show up as a different SHA.
    const root = repository('predict-oracle');
    const first = commit(root, 'first', { 'a.txt': 'a\n' });
    commit(root, 'second', { 'b.txt': 'b\n' });
    const third = commit(root, 'third', { 'c.txt': 'c\n' });
    // `third` really hangs on `second`; the prediction below hangs it on `first` instead, so
    // the two names must differ and `commit-tree` is asked to produce the second one.
    const raw = git(root, ['cat-file', 'commit', third]);
    const date = /^author .* (\d+ [+-]\d{4})$/m.exec(raw)?.[1] ?? '';
    const tree = git(root, ['rev-parse', `${third}^{tree}`]).trim();

    const rewritten = git(root, ['commit-tree', tree, '-p', first], {
      input: 'third\n',
      env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    }).trim();
    expect(predictRebuild({ root, sha: third, parents: [first] })).toBe(rewritten);
    expect(rewritten).not.toBe(third);
    expect(git(root, ['log', '-1', '--format=%s', rewritten]).trim()).toBe('third');
  });

  it('refuses a parent count the commit does not have, rather than guessing which to keep', () => {
    const root = repository('predict-count');
    const first = commit(root, 'first', { 'a.txt': 'a\n' });
    const second = commit(root, 'second', { 'b.txt': 'b\n' });
    expect(() => predictRebuild({ root, sha: second, parents: [] })).toThrow(/has 1 parent\(s\) and 0 were given/);
    expect(() => predictRebuild({ root, sha: second, parents: [first, first] })).toThrow(
      /has 1 parent\(s\) and 2 were given/,
    );
  });

  it('refuses a parent that is not a commit name', () => {
    const root = repository('predict-parent');
    const first = commit(root, 'first', { 'a.txt': 'a\n' });
    const second = commit(root, 'second', { 'b.txt': 'b\n' });
    expect(() => predictRebuild({ root, sha: second, parents: ['not-a-sha'] })).toThrow(/a parent to hang on/);
  });
});
