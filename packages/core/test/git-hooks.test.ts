import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { GUARD, HOOK, HOOKS_DIR, install } from '../../../scripts/git-hooks.mjs';

/**
 * The one command that makes a clone guarded, and the two silences it closes.
 *
 * ## Why this is a test and not a gate
 *
 * `batteries-reach-an-invoker.test.ts` holds the same kind of claim -- every guard
 * is reached by a package script and a CI workflow -- and it is a test because the
 * claim is about wiring rather than about a document or a tree of records. The
 * wiring here has the same shape and one more property: git **ignores** what it
 * cannot run, so an installer that is correct and never invoked is indistinguishable
 * from one that does not exist.
 *
 * ## The two silences, measured
 *
 * | what | what git does |
 * | --- | --- |
 * | a hook file with no execute bit | `hint: The '.githooks/pre-commit' hook was ignored because it's not set as executable.` and **commits anyway** |
 * | `core.hooksPath` naming a directory that is not there | every hook in it is ignored, with no message at all |
 *
 * The first is asserted in `staged-mutation.test.ts`, on a real commit, because that
 * is where it does its damage. Both are why the installer sets the mode bit instead
 * of trusting the checkout and **reads the setting back** instead of trusting the
 * exit status of the command that wrote it.
 *
 * ## The two assertions about this checkout
 *
 * `package.json`'s `prepare` runs the installer on every `pnpm install`, and this
 * clone's `core.hooksPath` is `HOOKS_DIR`. The second is a fact about a clone rather
 * than about the tree, so it can only be true where an install has run -- which is
 * every clone that can run this suite at all. When it fails, the message names the
 * one command that fixes it, because a guard that is one command away and does not
 * say which command is a guard nobody turns on.
 */

/** The installer this file spawns; see the note in `staged-mutation.test.ts`. */
const DRIVES = ['scripts/install-git-hooks.mjs'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const INSTALLER = resolve(ROOT, 'scripts', 'install-git-hooks.mjs');
const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-bench-hooks-'));

afterAll(() => {
  spawnSync('rm', ['-rf', SCRATCH]);
});

function env(extra = {}) {
  return { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...extra };
}

function git(cwd, args) {
  return spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.com', ...args], {
    cwd,
    encoding: 'utf8',
    env: env(),
  });
}

function checkout(name, hookMode = 0o755) {
  const root = join(SCRATCH, name);
  mkdirSync(join(root, HOOKS_DIR), { recursive: true });
  git(root, ['init', '-q', '--initial-branch=main', '.']);
  writeFileSync(join(root, 'a.txt'), 'a\n', 'utf8');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'one']);
  const hook = join(root, HOOKS_DIR, HOOK);
  writeFileSync(hook, '#!/bin/sh\nexit 0\n', 'utf8');
  chmodSync(hook, hookMode);
  return root;
}

/** Run the shipped installer, as `prepare` does. */
function installer(args, cwd = ROOT) {
  const result = spawnSync(process.execPath, [INSTALLER, ...args], { cwd, encoding: 'utf8', env: env() });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('git-hooks · installing', () => {
  it('sets core.hooksPath, makes the hook executable, and names the checkout it guarded', () => {
    const root = checkout('installed', 0o644);
    const result = install({ root });
    expect(result.state).toBe('installed');
    expect(result.message).toContain(root);
    expect(result.message).toContain('pre-commit runs before every commit');
    expect((statSync(join(root, HOOKS_DIR, HOOK)).mode & 0o111) !== 0).toBe(true);
    expect(git(root, ['config', '--get', 'core.hooksPath']).stdout.trim()).toBe(HOOKS_DIR);
  });

  it('is idempotent, because `prepare` runs on every install and not once per clone', () => {
    const root = checkout('twice');
    expect(install({ root }).state).toBe('installed');
    expect(install({ root }).state).toBe('installed');
    expect(git(root, ['config', '--get', 'core.hooksPath']).stdout.trim()).toBe(HOOKS_DIR);
  });

  it('leaves a hook that is already executable alone rather than rewriting its mode', () => {
    // `0o700` is executable and is not `0o755`; an installer that forced 755 would
    // be editing a file it was only asked to point git at.
    const root = checkout('mode-kept', 0o700);
    expect(install({ root }).state).toBe('installed');
    expect(statSync(join(root, HOOKS_DIR, HOOK)).mode & 0o777).toBe(0o700);
  });

  it('answers `no-checkout` where there is nothing to install, and exits zero there', () => {
    // A tarball, a restored cache, a vendored copy: `prepare` runs, finds no
    // checkout, and says so. Refusing would make `pnpm install` fail in a directory
    // where the hook could not have run in any case.
    const outside = join(SCRATCH, 'not-a-checkout');
    mkdirSync(outside, { recursive: true });
    expect(install({ root: outside }).state).toBe('no-checkout');
    const spawned = installer(['--root', outside]);
    expect(spawned.status).toBe(0);
    expect(spawned.stdout).toContain('no git checkout here');
  });

  it('refuses a checkout with no hook file, because the clone would be unguarded and silent about it', () => {
    const root = checkout('missing-hook');
    spawnSync('rm', ['-rf', join(root, HOOKS_DIR)]);
    const result = install({ root });
    expect(result.state).toBe('missing-hook');
    expect(result.message).toContain(`${HOOKS_DIR}/${HOOK}`);
    const spawned = installer(['--root', root]);
    expect(spawned.status).toBe(1);
    // stderr rather than stdout: the failing state is what `prepare` turns into a
    // failed install, and the sentence it prints is the whole diagnosis.
    expect(spawned.stderr).toContain('FAILED (missing-hook)');
    expect(spawned.stderr).toContain('is not in');
  });
});

describe('git-hooks · the states a fake git can reach and a real one cannot', () => {
  // The two remaining refusals are about `git config` failing or lying, and a
  // checkout where that happens is not one this test can build out of files: as
  // root, permissions do not refuse writes, and a `.git` that is broken enough to
  // fail `rev-parse` answers `no-checkout` before reaching these branches. The
  // runner is injectable for exactly this reason -- `verifiedTree` in gate-receipt
  // has the same seam, and for the same reason.

  it('refuses when git will not write the setting', () => {
    const root = checkout('config-refused');
    const result = install({
      root,
      run: (args: string[]) => (args[0] === 'rev-parse' ? `${root}\n` : null),
    });
    expect(result.state).toBe('unset');
    expect(result.message).toContain('refused to set core.hooksPath');
  });

  it('refuses when the setting reads back as something else, because the exit status was not the claim', () => {
    const root = checkout('config-misread');
    const result = install({
      root,
      run: (args: string[]) => {
        if (args[0] === 'rev-parse') return `${root}\n`;
        if (args[1] === '--get') return '.git/hooks\n';
        return '';
      },
    });
    expect(result.state).toBe('unset');
    expect(result.message).toContain('reads .git/hooks after being set');
  });

  it('refuses an argument list it cannot honour rather than installing somewhere unintended', () => {
    expect(installer(['--root']).status).toBe(1);
    expect(installer(['--root']).stderr).toContain('--root needs a directory');
    expect(installer(['--sideways']).status).toBe(1);
    expect(installer(['--sideways']).stderr).toContain('unknown argument');
  });
});

describe('git-hooks · the wiring this checkout carries', () => {
  it('keeps the hook executable in the tree, because git ignores it silently otherwise', () => {
    const mode = statSync(resolve(ROOT, HOOKS_DIR, HOOK)).mode;
    expect(
      mode & 0o111,
      `${HOOKS_DIR}/${HOOK} has no execute bit, so git will ignore it and commit anyway -- ` +
        'run `pnpm hooks:install`, which sets it',
    ).not.toBe(0);
  });

  it('has a hook that runs the guard, and says which file that is', () => {
    const source = readFileSync(resolve(ROOT, HOOKS_DIR, HOOK), 'utf8');
    expect(source.startsWith('#!/bin/sh')).toBe(true);
    expect(source).toContain(GUARD);
    // Exactly one program, counted **outside comments**: the hook's own comment
    // names the file it runs, and a rule that counted prose would read one command
    // as two -- the mistake `namesInCode` was written for, one register down.
    const code = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    expect([...code.matchAll(/scripts\/[\w.-]+\.mjs/g)].map((match) => match[0])).toEqual([GUARD]);
  });

  it('is installed by `prepare`, so a clone is guarded by the command it already runs', () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts['prepare']).toContain('install-git-hooks.mjs');
    expect(manifest.scripts['hooks:install']).toContain('install-git-hooks.mjs');
  });

  it('is actually pointed at `.githooks` in this clone', () => {
    // The one assertion about a clone rather than about the tree. Every clone that
    // can run this suite has installed, so it holds everywhere the suite runs --
    // and where it does not, the message is the repair.
    const read = git(ROOT, ['config', '--get', 'core.hooksPath']);
    expect(
      read.stdout.trim(),
      'this clone is not guarded: `core.hooksPath` is not .githooks, so no hook runs before a ' +
        'commit. Run `pnpm hooks:install` -- or any `pnpm install`, whose `prepare` does it',
    ).toBe(HOOKS_DIR);
  });
});
