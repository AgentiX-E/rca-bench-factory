import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { gitBlobId, judgeJournals, parseIndex, readJournals } from '../../../scripts/staged-mutation.mjs';
import { JOURNAL_PREFIX } from '../../../scripts/injection/journal.mjs';
// The hook directory and file name come from the module that installs them rather
// than from a literal here. Two reasons, and the second is measured: a second
// spelling of `.githooks` is a drift waiting to happen, and
// `scratch-prefixes-are-disjoint.test.ts` reads a dot-prefixed path spelled as a
// literal as a scratch file this suite writes **inside the tree** -- which is exactly
// what a directory copied out of the tree is not.
import { HOOK, HOOKS_DIR } from '../../../scripts/git-hooks.mjs';

/**
 * The pair nothing read: the index against the mutation batteries' record.
 *
 * ## The event this exists for
 *
 * v3.18 was committed while `pnpm verify:local` was running in another process. At
 * the moment of `git add -A`, the gate-test battery held `serviceName`'s
 * process-table fallback in `ingest/jaeger.ts` rewritten to `return undefined;`.
 * The commit published the mutation; the session put the bytes back minutes later.
 * Finding 310.
 *
 * `git status` was clean, and it was right: it compares the working tree to the
 * index, and `git add -A` had put the mutation in both. The three things in play
 * are the tree, the index and **what the tree was meant to hold** -- the journal a
 * battery writes before its first mutation -- and the pair that was never compared
 * is the second against the third. The index is the only one of the three that a
 * commit publishes.
 *
 * ## Why these tests drive `git` instead of a fake
 *
 * The comparison is "does the staged blob id equal `hash(\"blob <n>\\0\" + recorded
 * bytes)`". A fake index would agree with whatever this file believes git does.
 * So `gitBlobId` is pinned against `git hash-object` -- the only thing that can say
 * whether the header is right -- and the end-to-end cases run the shipped hook
 * through a real `git commit` in a real checkout, because "the guard exists" and
 * "the guard runs" are the two sentences finding 312 keeps apart.
 */

/**
 * The gate this file spawns, named rather than inferred from a `spawnSync`.
 *
 * `gate-sites-are-proven.test.ts` reads `provedBy` and requires the named test to
 * either spawn the script or declare it here; a path built with `resolve` is not a
 * literal it can see, and a proof nobody can find from the inventory is a proof for
 * the person who wrote it.
 */
const DRIVES = ['scripts/check-staged-mutation.mjs'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GATE = resolve(ROOT, 'scripts', 'check-staged-mutation.mjs');
const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-bench-staged-'));

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

/** A hermetic git: no global or system config, so the fixture's settings are the only ones. */
function env(extra = {}) {
  return { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...extra };
}

function git(cwd, args, extra = {}) {
  const result = spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.com', ...args], {
    cwd,
    encoding: 'utf8',
    env: env(extra),
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** A checkout with one committed file, and the shipped hook installed into it. */
function checkout(name, files = { 'f.txt': 'a\nb\nc\n' }) {
  const root = join(SCRATCH, name);
  mkdirSync(root, { recursive: true });
  git(root, ['init', '-q', '--initial-branch=main', '.']);
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text, 'utf8');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'base']);
  return root;
}

/** Put the shipped hook and the three files it imports into `root`, byte for byte. */
function installHook(root) {
  mkdirSync(join(root, 'scripts', 'injection'), { recursive: true });
  cpSync(resolve(ROOT, HOOKS_DIR), join(root, HOOKS_DIR), { recursive: true });
  for (const relative of ['scripts/check-staged-mutation.mjs', 'scripts/staged-mutation.mjs', 'scripts/injection/journal.mjs']) {
    cpSync(resolve(ROOT, relative), join(root, relative));
  }
  chmodSync(join(root, HOOKS_DIR, HOOK), 0o755);
  git(root, ['config', 'core.hooksPath', '.githooks']);
}

/** A cache directory holding one journal, as `_witnesses.guard` writes it. */
function journalFor(directory, entries, extra = {}) {
  mkdirSync(directory, { recursive: true });
  const record = {
    schema: 'rca-bench-battery-journal/2',
    pid: 2 ** 22 + 7,
    label: 'gate tests',
    script: 'gate-tests-battery.py',
    startedAt: '2026-01-01T00:00:00Z',
    entries,
    ...extra,
  };
  const path = join(directory, `${JOURNAL_PREFIX}${String(record.pid)}.json`);
  writeFileSync(path, JSON.stringify(record), 'utf8');
  return { path, record };
}

/** One recorded file: the bytes it held, in both forms the journal carries them. */
function entryFor(path, text) {
  const raw = Buffer.from(text, 'utf8');
  return {
    path: resolve(path),
    sha256: createHash('sha256').update(raw).digest('hex'),
    bytes: raw.toString('base64'),
  };
}

function run(cwd, args, extra = {}) {
  const result = spawnSync(process.execPath, [GATE, ...args], { cwd, encoding: 'utf8', env: env(extra) });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('staged-mutation · git\'s name for a byte string', () => {
  it('agrees with `git hash-object`, which is the only thing that can say whether the header is right', () => {
    // Three payloads, and the third is the one a hand-written constant gets wrong:
    // a NUL byte and a trailing newline, where the length is a count of **bytes**
    // and not of characters. The comparison is against git's own answer rather than
    // against a constant copied out of git's source, because a constant would agree
    // with whatever this file already believes.
    for (const text of ['', 'a\nb\nc\n', 'x\u0000\u0000\ny']) {
      const raw = Buffer.from(text, 'utf8');
      const expected = spawnSync('git', ['hash-object', '--stdin'], { input: raw, cwd: SCRATCH, encoding: 'utf8' });
      expect(expected.status, 'git hash-object refused the fixture').toBe(0);
      expect(gitBlobId(raw)).toBe(expected.stdout.trim());
    }
  });

  it('counts bytes rather than characters, so a multi-byte line is not hashed two ways', () => {
    const raw = Buffer.from('故障\n', 'utf8');
    const local = spawnSync('git', ['hash-object', '--stdin'], { input: raw, cwd: SCRATCH, encoding: 'utf8' });
    expect(gitBlobId(raw)).toBe(local.stdout.trim());
    expect(gitBlobId(raw)).not.toBe(gitBlobId(Buffer.from('故障', 'utf8')));
  });

  it('is parameterised by the object format, because a sha256 checkout would make every comparison false', () => {
    const raw = Buffer.from('a\nb\nc\n', 'utf8');
    expect(gitBlobId(raw, 'sha256')).toHaveLength(64);
    expect(gitBlobId(raw, 'sha1')).toHaveLength(40);
  });
});

describe('staged-mutation · reading the index', () => {
  it('reads path -> blob id, and skips the stages a conflicted path carries', () => {
    const output = [
      '100644 6f1c2d3e4a5b6c7d8e9f0a1b2c3d4e5f60718293 0\tkept.ts',
      '100644 1111111111111111111111111111111111111111 1\tconflicted.ts',
      '100644 2222222222222222222222222222222222222222 2\tconflicted.ts',
      '100755 3333333333333333333333333333333333333333 0\trun.sh',
      '',
    ].join('\u0000');
    const staged = parseIndex(output);
    expect([...staged.keys()]).toEqual(['kept.ts', 'run.sh']);
    expect(staged.get('kept.ts')?.mode).toBe('100644');
    expect(staged.get('run.sh')?.mode).toBe('100755');
  });

  it('skips a record with no tab rather than inventing a path', () => {
    expect(parseIndex('not a real line\u0000').size).toBe(0);
  });
});

describe('staged-mutation · reading the journals', () => {
  it('answers nothing, not an error, for a checkout where no battery has ever run', () => {
    const journals = readJournals(join(SCRATCH, 'no-such-cache'));
    expect(journals.records).toEqual([]);
    expect(journals.unreadable).toEqual([]);
  });

  it('separates a record that will not parse from a record that parses into nothing', () => {
    const directory = join(SCRATCH, 'broken-cache');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${JOURNAL_PREFIX}1.json`), 'not json at all', 'utf8');
    writeFileSync(join(directory, `${JOURNAL_PREFIX}2.json`), JSON.stringify({ entries: 'no' }), 'utf8');
    // Not a journal at all: the cache directory holds other files too, and a reader
    // that refused on `vitest-report.json` would refuse in every real checkout.
    writeFileSync(join(directory, 'vitest-report.json'), '{}', 'utf8');
    const journals = readJournals(directory);
    expect(journals.records).toEqual([]);
    expect(journals.unreadable.map((one) => one.name)).toEqual([`${JOURNAL_PREFIX}1.json`, `${JOURNAL_PREFIX}2.json`]);
    expect(journals.unreadable[1]?.why).toContain('entries array');
  });

  it('reads a good record whole, including the fields the decision does not use', () => {
    const directory = join(SCRATCH, 'good-cache');
    journalFor(directory, [entryFor(join(SCRATCH, 'f.txt'), 'a\n')]);
    const journals = readJournals(directory);
    expect(journals.records).toHaveLength(1);
    expect(journals.records[0]?.label).toBe('gate tests');
    expect(journals.records[0]?.entries).toHaveLength(1);
  });
});

describe('staged-mutation · the comparison', () => {
  const file = join(SCRATCH, 'target.ts');

  it('reports a file staged at a blob the record says was mutated, naming both digests', () => {
    const recorded = entryFor(file, 'the original\n');
    const staged = new Map([['target.ts', { id: gitBlobId(Buffer.from('the mutation\n')), mode: '100644' }]]);
    const verdict = judgeJournals({ records: [{ name: 'j.json', entries: [recorded] }], staged, root: SCRATCH });
    expect(verdict.asked).toBe(1);
    expect(verdict.differing).toEqual([
      { path: 'target.ts', recorded: recorded.sha256.slice(0, 12), staged: gitBlobId(Buffer.from('the mutation\n')).slice(0, 12) },
    ]);
  });

  it('says nothing about a file staged at the bytes the record holds', () => {
    const staged = new Map([['target.ts', { id: gitBlobId(Buffer.from('the original\n')), mode: '100644' }]]);
    const verdict = judgeJournals({
      records: [{ name: 'j.json', entries: [entryFor(file, 'the original\n')] }],
      staged,
      root: SCRATCH,
    });
    expect(verdict.differing).toEqual([]);
    expect(verdict.asked).toBe(1);
  });

  it('asks only about the recorded files the index actually has, and counts the ones it asked', () => {
    // A journal covers 284 files; a commit stages four. The count is the reading
    // that says the guard looked at something, and a guard that asked about zero
    // files is the failure this campaign keeps finding.
    const staged = new Map([
      ['target.ts', { id: gitBlobId(Buffer.from('a\n')), mode: '100644' }],
      ['other.ts', { id: gitBlobId(Buffer.from('b\n')), mode: '100644' }],
    ]);
    const verdict = judgeJournals({
      records: [
        {
          name: 'j.json',
          entries: [entryFor(file, 'a\n'), entryFor(join(SCRATCH, 'absent.ts'), 'x\n'), entryFor(join(SCRATCH, 'other.ts'), 'b\n')],
        },
      ],
      staged,
      root: SCRATCH,
    });
    expect(verdict.asked).toBe(2);
    expect(verdict.differing).toEqual([]);
  });

  it('reports a recorded path that is not in this checkout, rather than comparing a subset', () => {
    const staged = new Map([['target.ts', { id: gitBlobId(Buffer.from('a\n')), mode: '100644' }]]);
    const verdict = judgeJournals({
      records: [{ name: 'j.json', entries: [entryFor(join(SCRATCH, '..', 'elsewhere', 'x.ts'), 'a\n')] }],
      staged,
      root: SCRATCH,
    });
    expect(verdict.outside).toHaveLength(1);
    expect(verdict.outside[0]).toContain('elsewhere');
  });

  it('refuses to compare an entry whose bytes it cannot find, instead of reading undefined as clean', () => {
    // The shape a schema change would take: the field is renamed, the digest is
    // still there, and `Buffer.from(undefined, 'base64')` throws inside the loop.
    const staged = new Map([['target.ts', { id: gitBlobId(Buffer.from('a\n')), mode: '100644' }]]);
    const verdict = judgeJournals({
      records: [{ name: 'j.json', entries: [{ path: resolve(file), sha256: 'a'.repeat(64) }] }],
      staged,
      root: SCRATCH,
    });
    expect(verdict.unnamed).toEqual([{ path: 'target.ts', journal: 'j.json' }]);
    expect(verdict.differing).toEqual([]);
  });

  it('names the writer that is still holding the tree, so the refusal can say whether to wait', () => {
    const verdict = judgeJournals({
      records: [{ name: 'j.json', pid: 4242, label: 'gate tests', entries: [] }],
      staged: new Map(),
      root: SCRATCH,
      live: (record: { pid: number }) => record.pid === 4242,
    });
    expect(verdict.running).toEqual([{ label: 'gate tests', pid: 4242 }]);
  });

  it('compares a path once even when two journals recorded it', () => {
    const staged = new Map([['target.ts', { id: gitBlobId(Buffer.from('a\n')), mode: '100644' }]]);
    const verdict = judgeJournals({
      records: [
        { name: 'one.json', entries: [entryFor(file, 'a\n')] },
        { name: 'two.json', entries: [entryFor(file, 'a\n')] },
      ],
      staged,
      root: SCRATCH,
    });
    expect(verdict.asked).toBe(1);
    expect(verdict.differing).toEqual([]);
  });
});

describe('staged-mutation · the guard as a program', () => {
  it('refuses the argument list it cannot honour rather than checking nothing', () => {
    expect(run(SCRATCH, ['--cache']).status).toBe(1);
    expect(run(SCRATCH, ['--cache']).stderr).toContain('--cache needs a directory');
    expect(run(SCRATCH, ['--everything']).status).toBe(1);
    expect(run(SCRATCH, ['--everything']).stderr).toContain('unknown argument');
  });

  it('says the directory is not a checkout, because a hook that cannot see an index has not checked one', () => {
    const outside = join(SCRATCH, 'not-a-checkout');
    mkdirSync(outside, { recursive: true });
    const result = run(outside, []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not a git checkout');
  });

  it('refuses an unreadable journal, because the tree it was holding is unknown', () => {
    const root = checkout('unreadable');
    const cache = join(SCRATCH, 'unreadable-cache');
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, `${JOURNAL_PREFIX}9.json`), 'not json', 'utf8');
    const result = run(root, ['--cache', cache]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot be read');
    expect(result.stderr).toContain('pnpm verify:local');
  });

  it('is silent on a passing commit when asked to be, and one line otherwise', () => {
    const root = checkout('quiet');
    const cache = join(SCRATCH, 'quiet-cache');
    journalFor(cache, [entryFor(join(root, 'f.txt'), 'a\nb\nc\n')]);
    expect(run(root, ['--cache', cache, '--quiet']).stdout).toBe('');
    expect(run(root, ['--cache', cache]).stdout).toContain('are staged at the bytes their journal recorded');
  });

  it('says so when no battery has ever run here, rather than reporting a comparison it did not make', () => {
    const root = checkout('no-journal');
    const result = run(root, ['--cache', join(SCRATCH, 'missing-cache')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no battery journal');
  });
});

describe('staged-mutation · a real commit, through the shipped hook', () => {
  it('refuses a commit whose index holds a mutation, and leaves the log alone', () => {
    const root = checkout('refused');
    const cache = join(SCRATCH, 'refused-cache');
    installHook(root);
    journalFor(cache, [entryFor(join(root, 'f.txt'), 'a\nb\nc\n')]);

    writeFileSync(join(root, 'f.txt'), 'a\nb\nMUTATED\n', 'utf8');
    git(root, ['add', 'f.txt']);
    const committed = git(root, ['commit', '-m', 'publish the mutation'], { RCA_BENCH_BATTERY_CACHE: cache });

    expect(committed.status).not.toBe(0);
    expect(committed.stderr).toContain('f.txt is staged at a blob a battery\'s journal says was mutated');
    expect(committed.stderr).toContain('git restore --staged');
    expect(git(root, ['log', '--oneline']).stdout.trim().split('\n')).toHaveLength(1);
  });

  it('allows the same commit once the index holds the bytes the journal recorded', () => {
    // The half a blanket refusal would have got wrong: a journal exists, a battery
    // is holding the tree, and the commit publishes nothing the record contradicts.
    const root = checkout('allowed');
    const cache = join(SCRATCH, 'allowed-cache');
    installHook(root);
    journalFor(cache, [entryFor(join(root, 'f.txt'), 'a\nb\nc\n')]);

    writeFileSync(join(root, 'g.txt'), 'brand new\n', 'utf8');
    git(root, ['add', 'g.txt']);
    const committed = git(root, ['commit', '-m', 'add a file the record does not cover'], {
      RCA_BENCH_BATTERY_CACHE: cache,
    });

    expect(committed.status, committed.stderr).toBe(0);
    expect(git(root, ['log', '--oneline']).stdout.trim().split('\n')).toHaveLength(2);
  });

  it('lets the commit through when the hook is not executable, which is the silence finding 312 names', () => {
    // Measured, not assumed: git prints two `hint:` lines and commits anyway, and
    // `advice.ignoredHook false` — or any log that drops stderr — leaves nothing at
    // all. The guard's existence is not its execution.
    const root = checkout('not-executable');
    const cache = join(SCRATCH, 'not-executable-cache');
    installHook(root);
    journalFor(cache, [entryFor(join(root, 'f.txt'), 'a\nb\nc\n')]);
    chmodSync(join(root, HOOKS_DIR, HOOK), 0o644);

    writeFileSync(join(root, 'f.txt'), 'a\nb\nMUTATED\n', 'utf8');
    git(root, ['add', 'f.txt']);
    const committed = git(root, ['commit', '-m', 'the guard did not run'], { RCA_BENCH_BATTERY_CACHE: cache });

    expect(committed.status).toBe(0);
    expect(committed.stderr).toContain("hook was ignored because it's not set as executable");
    expect(git(root, ['log', '--oneline']).stdout.trim().split('\n')).toHaveLength(2);
  });

  it('lets `--no-verify` through, which is the hole the module states it cannot close', () => {
    const root = checkout('no-verify');
    const cache = join(SCRATCH, 'no-verify-cache');
    installHook(root);
    journalFor(cache, [entryFor(join(root, 'f.txt'), 'a\nb\nc\n')]);

    writeFileSync(join(root, 'f.txt'), 'a\nb\nMUTATED\n', 'utf8');
    git(root, ['add', 'f.txt']);
    const committed = git(root, ['commit', '--no-verify', '-m', 'skipped'], { RCA_BENCH_BATTERY_CACHE: cache });
    expect(committed.status).toBe(0);
    // Stated rather than papered over: the mutation is now the content of a
    // revision, and nothing downstream can tell these bytes from any others --
    // the publish receipt is keyed on the tree's identity, and a mutation has an
    // identity too.
    expect(git(root, ['show', 'HEAD:f.txt']).stdout).toBe('a\nb\nMUTATED\n');
  });
});
