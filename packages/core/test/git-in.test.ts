import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gitIn } from '../../../scripts/git-in.mjs';

/**
 * The runner both callers inject: `git -C <root> <args>`, stdout or `null`.
 *
 * ## Why this file exists
 *
 * The same six lines were written twice, once in `gate-receipt.mjs` and once in
 * `git-hooks.mjs`, under two different comments and with two different spellings
 * (`cwd: root` and `-C root`). A census of exports keyed by symbol (finding 566)
 * reported both as names nothing outside their own module took -- one of them the
 * copy a test had already taken, which is why the duplication survived: the
 * module that had a test looked proved.
 *
 * So the two questions this file answers are the two the duplication left open.
 * **What is the contract** -- stdout for a command that works, `null` for every
 * way a command can fail -- and **is `-C` the same answer as `cwd`**, which is the
 * claim the consolidation rests on. The second is not a style question: if the two
 * spellings disagreed on any root, moving the callers onto one definition would
 * have changed behaviour in whichever caller had the other.
 *
 * ## What `null` has to cover
 *
 * Four shapes, and the fourth is the one a caller notices. A subcommand that does
 * not exist, a revision that does not resolve, a root that is not a checkout, and
 * a root that is not a directory at all. The last one is why the answer cannot be
 * decided by the exit code alone in every spelling: `spawnSync` with a `cwd` that
 * does not exist never starts the child, so it reports `status: null` and an
 * `error` -- a reader that only checked the status would read `null !== 0` as
 * success and answer `undefined`.
 */

const SCRATCH = mkdtempSync(join(tmpdir(), 'git-in-runner-'));

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

function repository(name: string) {
  const root = join(SCRATCH, name);
  mkdirSync(root, { recursive: true });
  const git = (...args: string[]) =>
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
  // The name goes into the commit as well as the directory: two checkouts built in the same second
  // with the same content, message and author are the same commit, so a test that compares their
  // HEADs would be comparing one object with itself.
  writeFileSync(join(root, 'a.txt'), 'one\n', 'utf8');
  writeFileSync(join(root, 'name.txt'), `${name}\n`, 'utf8');
  git('add', 'a.txt', 'name.txt');
  git('commit', '-q', '-m', `one in ${name}`);
  return { root, git };
}

describe('git-in · the runner two modules share', () => {
  it('answers stdout for a command that works, byte for byte', () => {
    const { root } = repository('works');
    const run = gitIn(root);
    const head = run(['rev-parse', '--verify', 'HEAD']);
    expect(head).toMatch(/^[0-9a-f]{40}\n$/);
    // The newline is part of git's answer and part of what both callers trim. A runner that
    // stripped it would make `verifiedTree`'s comparison and `install`'s `--show-toplevel` agree
    // by accident, and the day one of them stopped trimming, the two would disagree silently.
    expect(run(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main\n');
  });

  it('answers null for a command that fails, rather than throwing or answering empty', () => {
    const { root } = repository('fails');
    const run = gitIn(root);
    // Three ways to fail inside a working checkout, and one that is not a checkout at all.
    expect(run(['rev-parse', '--verify', 'no-such-revision-here'])).toBeNull();
    expect(run(['not-a-git-subcommand'])).toBeNull();
    expect(run(['cat-file', 'blob', 'not-a-sha'])).toBeNull();
    const empty = join(SCRATCH, 'not-a-checkout');
    mkdirSync(empty, { recursive: true });
    expect(gitIn(empty)(['rev-parse', '--verify', 'HEAD'])).toBeNull();
  });

  it('answers null for a root that is not a directory, because git says so', () => {
    // `git -C <missing>` starts, fails, and exits 128: a status, not a spawn error.
    const run = gitIn(join(SCRATCH, 'missing-directory'));
    expect(run(['rev-parse', '--verify', 'HEAD'])).toBeNull();
  });

  it('answers null for a spawn that never started, which is the same comparison', () => {
    // The shape the first draft tested separately: a child that cannot be started reports
    // `status: null` and an `error`, and a child killed by a signal reports `status: null` too. So
    // `status === 0` already answers `null` for both -- the extra `error` guard the consolidation
    // first carried was deletable without changing a test, and this case is what says so. The only
    // way to reach it on a machine that has git is to take git off the path for one call.
    const path = process.env['PATH'];
    process.env['PATH'] = '';
    try {
      expect(gitIn(SCRATCH)(['--version'])).toBeNull();
    } finally {
      process.env['PATH'] = path;
    }
  });

  it('says the same thing whichever way the root is given, which is what the consolidation rests on', () => {
    // The claim, proved rather than asserted: the `cwd` spelling both callers used before v3.109 and
    // the `-C` spelling this module settled on answer identically over the four shapes above.
    const { root } = repository('equivalent');
    const viaCwd = (args: string[]) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      return result.error === undefined && result.status === 0 ? result.stdout : null;
    };
    const viaFlag = gitIn(root);
    for (const args of [
      ['rev-parse', '--verify', 'HEAD'],
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      ['rev-parse', '--verify', 'no-such-revision-here'],
      ['not-a-git-subcommand'],
      ['cat-file', 'blob', 'not-a-sha'],
    ]) {
      expect([args.join(' '), viaFlag(args)]).toEqual([args.join(' '), viaCwd(args)]);
    }
  });

  it('takes the root at the call site, so a caller can point it at any checkout', () => {
    // The parameter is the whole reason this is shared instead of inlined: two modules hold different
    // roots at the same time, and one runner that had captured a root would be two runners again.
    const first = repository('first');
    const second = repository('second');
    expect(gitIn(first.root)(['rev-parse', '--verify', 'HEAD'])).not.toBe(
      gitIn(second.root)(['rev-parse', '--verify', 'HEAD']),
    );
  });
});
