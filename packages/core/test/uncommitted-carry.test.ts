import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { carryUncommitted } from './uncommitted-carry.js';

/**
 * The step that replays a working tree onto a clean copy, tested apart from the
 * thing that uses it.
 *
 * `typecheck-entrypoint.test.ts` builds a cold worktree and replays the
 * uncommitted changes onto it. When that replay was two inline commands —
 *
 *     git diff HEAD | git apply --whitespace=nowarn -
 *
 * — regenerating `site/assets/rca-bench-factory-examples.tar.gz` made it fail
 * with
 *
 *     error: cannot apply binary patch to 'site/assets/…tar.gz'
 *            without full index line
 *
 * and the test stayed red until the artefact was committed. `git diff` without
 * `--binary` writes the sentence *Binary files a/… and b/… differ* — a
 * description, not a patch. Testing that inline was impossible without dirtying
 * a tracked binary: a test whose setup mutates the repository it is measuring is
 * a test that can leave it broken.
 *
 * So the carry is a function, and these tests run it against a throwaway
 * repository. Nothing here touches the working tree.
 *
 * ## The control is the point
 *
 * The third test runs the **old** command pair and requires it to fail. Without
 * it, `--binary` is a flag whose necessity nobody has observed, and the next
 * edit that removes it passes every test in this file.
 */

const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rca-carry-'));
  dirs.push(dir);
  return dir;
}

const TEXT = 'first line\nsecond line\n';
/** A NUL byte is what makes git call a file binary, so the fixture has one. */
const BINARY = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x7f, 0x0a]);
const BINARY_PATH = 'pack.tar.gz';
const TEXT_PATH = 'notes.txt';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

/**
 * A repository at HEAD, and a directory holding exactly the bytes at HEAD.
 *
 * The second directory is what the real caller has (`git worktree add --detach`)
 * and is written here rather than cloned, so the fixture states its own
 * pre-image instead of inheriting one from git's checkout behaviour.
 */
function committed(): { repo: string; clean: string } {
  const repo = scratch();
  git(repo, 'init', '-q');
  writeFileSync(join(repo, TEXT_PATH), TEXT);
  writeFileSync(join(repo, BINARY_PATH), BINARY);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');

  const clean = scratch();
  writeFileSync(join(clean, TEXT_PATH), TEXT);
  writeFileSync(join(clean, BINARY_PATH), BINARY);
  return { repo, clean };
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('carryUncommitted', () => {
  it('carries a text change', () => {
    const { repo, clean } = committed();
    writeFileSync(join(repo, TEXT_PATH), 'first line\nsecond line CHANGED\n');
    carryUncommitted(repo, clean);
    expect(readFileSync(join(clean, TEXT_PATH), 'utf8')).toBe('first line\nsecond line CHANGED\n');
  });

  it('carries a binary change, which is the case that used to throw', () => {
    const { repo, clean } = committed();
    const changed = Buffer.from([0x00, 0x09, 0x09, 0x00, 0x42]);
    writeFileSync(join(repo, BINARY_PATH), changed);
    carryUncommitted(repo, clean);
    expect(readFileSync(join(clean, BINARY_PATH)).equals(changed)).toBe(true);
  });

  it('carries both in one patch', () => {
    const { repo, clean } = committed();
    writeFileSync(join(repo, TEXT_PATH), 'replaced\n');
    const changed = Buffer.from([0x00, 0x11, 0x22, 0x00]);
    writeFileSync(join(repo, BINARY_PATH), changed);
    carryUncommitted(repo, clean);
    expect(readFileSync(join(clean, TEXT_PATH), 'utf8')).toBe('replaced\n');
    expect(readFileSync(join(clean, BINARY_PATH)).equals(changed)).toBe(true);
  });

  it('is the `--binary` flag that makes the binary case work', () => {
    // The control. Same repository, same files, the command pair this function
    // replaced. It must fail, and it must fail for the reason in the header.
    const { repo, clean } = committed();
    writeFileSync(join(repo, BINARY_PATH), Buffer.from([0x00, 0x33, 0x00]));
    const diff = git(repo, 'diff', 'HEAD');

    let failure: { status?: number; stderr?: string } | undefined;
    try {
      // `encoding` matters: without it the thrown error carries stderr as bytes,
      // and `toContain('binary')` would compare a string to a Uint8Array and fail
      // for a reason that has nothing to do with git.
      execFileSync('git', ['apply', '--whitespace=nowarn', '-'], {
        cwd: clean,
        input: diff,
        encoding: 'utf8',
      });
    } catch (error) {
      failure = error as { status?: number; stderr?: string };
    }

    expect(failure, 'the old command pair applied a binary change, so the flag is not load-bearing').toBeDefined();
    expect(failure?.status).not.toBe(0);
    expect(failure?.stderr).toContain('binary');
    // And the destination is untouched, which is what makes the failure silent in
    // the test that used it: the copy simply lacks the change.
    expect(readFileSync(join(clean, BINARY_PATH)).equals(BINARY)).toBe(true);
  });

  it('does nothing when the working tree matches HEAD', () => {
    // An empty diff is not an empty patch that applies: `git apply` with no input
    // is an error. The function returns instead, and the destination is left as
    // it was rather than being failed.
    const { repo, clean } = committed();
    carryUncommitted(repo, clean);
    expect(readFileSync(join(clean, TEXT_PATH), 'utf8')).toBe(TEXT);
    expect(readFileSync(join(clean, BINARY_PATH)).equals(BINARY)).toBe(true);
  });

  it('does not carry an untracked file', () => {
    // The division of labour with the caller, stated once. `git diff HEAD` only
    // describes tracked paths, so the caller copies untracked files itself --
    // `typecheck-entrypoint.test.ts` does, and asserts its own copy list.
    const { repo, clean } = committed();
    writeFileSync(join(repo, 'scratch.txt'), 'not committed\n');
    carryUncommitted(repo, clean);
    expect(existsSync(join(clean, 'scratch.txt'))).toBe(false);
  });
});
