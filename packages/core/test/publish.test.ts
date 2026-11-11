import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { writeReceipt } from '../../../scripts/gate-receipt.mjs';
import { ApiError, githubTransport, isNetworkFailure, localTransport, publish, refSentence, requireReceipt } from '../../../scripts/publish.mjs';

/**
 * Executing a plan against a repository that stands where the API stands.
 *
 * ## The assertion this file exists for
 *
 * `git -C remote rev-parse main` must equal `git -C local rev-parse HEAD`. Not "the trees
 * match" -- the trees matched on the day finding 404 dropped two of three commits, which
 * is why the old channel's own assertion could not see it. A rebuilt commit is
 * byte-identical to the local one when the plan is right, because a commit is a
 * deterministic function of its tree, its parents, its message and its identities: so
 * comparing commit SHAs compares the history, not the content.
 *
 * ## Why a bare repository and an HTTP server rather than a mock
 *
 * The channel is two things: a decision, tested in `publish-plan.test.ts`, and a set of
 * four API calls. A mock of `fetch` would test that this file calls the shapes this file
 * expects. A server that speaks those shapes over a socket and writes real git objects
 * tests the same code against a real transport boundary -- base64 and utf-8 bodies, a 500
 * that clears on retry, a 422 on a ref that moved -- and it does so without a token, a
 * network, or a repository anybody else can see.
 */

/** The gate this file spawns, declared so the two accounts of it agree. */
export const DRIVES = ['scripts/publish-cli.mjs'];

/**
 * The budget every suite in this file carries, because the file is a sum of process starts.
 *
 * A push is executed by spawning `git`: a case that publishes four commits runs `rev-parse`,
 * `cat-file`, `read-tree`, `update-index`, `write-tree` and `commit-tree` once per commit and
 * once per blob, and the assertions after it run `ls-tree`, `log` and `rev-parse` again. No
 * single call is slow; the file is.
 *
 * Measured: **6.95 s** of test time standalone, worst of three passes (6.23 / 6.57 / 6.95), so
 * the file already costs more than vitest's 5 000 ms default before anything goes wrong. On CI
 * run 42331765380 one case -- *carries a deletion and a mode change* -- was reported at
 * `Test timed out in 5000ms` while every other test in the run passed, which is the shape
 * `timeout-budget.test.ts` records for three other files: a test that costs half a second and
 * is reported at five was not doing five seconds of work, the process it ran in was not being
 * scheduled.
 *
 * On the suite rather than on the test, for the reason that file states: a budget applied where
 * a stall happened to be noticed protects that test and leaves the next one written on the
 * default. 30 000 ms is five times the worst reading, and it is the number the two other files
 * in `SUITE_BUDGET_MS` carry.
 */
const FILE_TIMEOUT_MS = 30_000;

const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-publish-'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Lambertyan',
  GIT_AUTHOR_EMAIL: 'lambertyan@example.com',
  GIT_COMMITTER_NAME: 'Lambertyan',
  GIT_COMMITTER_EMAIL: 'lambertyan@example.com',
};

/** What a finished child says: the shape `spawnSync` returned, kept for its call sites. */
interface ChildResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * One child process, awaited.
 *
 * `spawnSync` blocks the event loop for as long as the child runs, and this file starts
 * about three hundred of them. That is invisible on an idle machine and fatal on a busy
 * one: the block was measured at 12,182 ms alone and at **61,987 ms** inside a coverage
 * run, against a 45,000 ms budget and a 60,000 ms worker RPC deadline -- a green suite
 * turned into a non-zero exit with no failing test (finding 507's failure mode, reached
 * from the one side the instrument could not fix). Every helper below awaits now, so the
 * time a child spends running is time this worker spends scheduling other files.
 *
 * The shape is `spawnSync`'s, deliberately: `{ status, stdout, stderr }`, with `status`
 * null when the child never started, because a hundred call sites read it and a hundred
 * rewritten assertions would be a bigger diff than the defect deserves.
 */
function runChild(
  command: string,
  args: string[],
  options: { readonly input?: string; readonly env?: NodeJS.ProcessEnv } = {},
): Promise<ChildResult> {
  return new Promise((done) => {
    const child = spawn(command, args, { env: options.env ?? process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', () => {
      done({ status: null, stdout, stderr });
    });
    child.on('close', (status) => {
      done({ status, stdout, stderr });
    });
    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

async function git(root: string, args: string[], options: Record<string, unknown> = {}): Promise<string> {
  const { env: extra, ...rest } = options;
  const result = await runChild('git', ['-C', root, ...args], {
    ...(rest['input'] === undefined ? {} : { input: String(rest['input']) }),
    env: { ...process.env, ...IDENTITY, ...((extra as object) ?? {}) },
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} in ${root}: ${result.stderr}`);
  return result.stdout;
}

let clock = 1762265460;

async function repository(name: string): Promise<string> {
  const root = join(SCRATCH, name);
  mkdirSync(root, { recursive: true });
  await git(root, ['init', '-q', '-b', 'main', '.']);
  return root;
}

/** One commit; `null` content deletes a path, and `executable` names the paths to chmod. */
async function commit(root: string, message: string, files: Record<string, string | null>, executable: string[] = []): Promise<string> {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      rmSync(join(root, path), { force: true });
      await git(root, ['rm', '-q', '--cached', '--', path]);
      continue;
    }
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content, 'utf8');
    await git(root, ['add', '--', path]);
    if (executable.includes(path)) await git(root, ['update-index', '--chmod=+x', '--', path]);
  }
  clock += 60;
  const date = `${new Date(clock * 1000).toISOString().slice(0, 19).replace('T', ' ')} +0000`;
  await git(root, ['commit', '-q', '--allow-empty', '-m', message], {
    env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  return (await git(root, ['rev-parse', 'HEAD'])).trim();
}

/** Five commits, one of each shape the plan has to carry: a file, a deletion, a mode change. */
async function history(name: string) {
  const source = await repository(`${name}-source`);
  const shas = [
    await commit(source, 'first', { 'README.md': '# a\n' }),
    await commit(source, 'second', { 'src/one.ts': 'export const one = 1;\n' }),
    await commit(source, 'third', { 'src/two.ts': 'export const two = 2;\n', 'src/gone.ts': 'export const gone = 3;\n', 'run.sh': '#!/bin/sh\n' }, ['run.sh']),
    await commit(source, 'fourth', { 'src/gone.ts': null }),
    await commit(source, 'fifth', { 'docs/note.md': 'a note long enough that its base64 body is longer than the threshold\n' }),
  ];
  return { source, shas };
}

/**
 * A source repository with five commits, and a bare remote **cloned** from it.
 *
 * A clone carries every object the source can reach, so this remote already holds the
 * commits above the branch it points at. That is the right fixture for the refusals -- every
 * one of them is settled before an object would have to be written -- and it is the **wrong**
 * one for a case that needs the remote to be without a commit, which is why `staged` exists.
 * It said "none for the ones above it" until v3.60, which a clone does not do: the comment
 * described a fidelity the fixture had never had (finding 449).
 */
async function stage(name: string) {
  const { source, shas } = await history(name);
  const remote = join(SCRATCH, `${name}-remote.git`);
  await git(SCRATCH, ['clone', '-q', '--bare', source, remote]);
  return { source, remote, shas };
}

/**
 * The same five commits, and a bare remote that holds exactly the history it was sent.
 *
 * Pushed rather than cloned, so a commit above `upto` is genuinely absent -- from the object
 * store, not only from the branch graph -- and an upload that silently did nothing leaves a
 * different tree. `upto: null` is a repository with no refs at all, which is the state a first
 * push meets and the only one where the root commit has no parent.
 */
async function staged(name: string, upto: number | null) {
  const { source, shas } = await history(name);
  const remote = join(SCRATCH, `${name}-remote.git`);
  await git(SCRATCH, ['init', '-q', '--bare', remote]);
  if (upto !== null) await git(source, ['push', '-q', remote, `${shas[upto]}:refs/heads/main`]);
  return { source, remote, shas };
}

async function at(remote: string, sha: string) {
  await git(remote, ['update-ref', 'refs/heads/main', sha]);
}

async function log(root: string, rev: string) {
  return (await git(root, ['log', '--format=%H %s', rev])).trim();
}

/**
 * The sentence a refusal answers a mistyped branch with.
 *
 * A refusal that says "this branch does not exist" leaves the operator to guess whether the
 * repository is empty -- which is the difference between a typo and a first push. The names
 * that do exist are the answer, and they are put in one sentence whose only judgement is
 * how much of a long list to print.
 */
describe('the sentence a refusal names the refs it found with', { timeout: FILE_TIMEOUT_MS }, () => {
  it('names branches and tags separately, because they are different kinds of ref', async () => {
    expect(refSentence(['refs/heads/main', 'refs/tags/v1.0'])).toBe('1 branch(es): main; 1 tag(s): v1.0');
  });

  it('prints a short list whole and cuts a long one, so a message stays a message', async () => {
    const three = ['refs/heads/a', 'refs/heads/b', 'refs/heads/c'];
    expect(refSentence(three)).toBe('3 branch(es): a, b, c');
    const seven = [...three, 'refs/heads/d', 'refs/heads/e', 'refs/heads/f', 'refs/heads/g'];
    expect(refSentence(seven)).toBe('7 branch(es): a, b, c, d, e and 2 more');
    // The boundary itself, which the two cases above walk past. A battery substituting `<=`
    // for `<` survived this file until these two lines existed: three names and seven names
    // answer the same under either comparison, and only five -- the number itself -- differs.
    const five = ['refs/heads/a', 'refs/heads/b', 'refs/heads/c', 'refs/heads/d', 'refs/heads/e'];
    expect(refSentence(five)).toBe('5 branch(es): a, b, c, d, e');
    expect(refSentence([...five, 'refs/heads/f'])).toBe('6 branch(es): a, b, c, d, e and 1 more');
  });

  it('counts a ref it cannot name as one, rather than dropping it', async () => {
    // `refs/pull/7/head` and `refs/notes/commits` are refs: a repository holding only those
    // is not empty, and a sentence that printed nothing would read exactly like one.
    expect(refSentence(['refs/pull/7/head', 'refs/notes/commits'])).toBe('2 other ref(s)');
    expect(refSentence(['refs/heads/main', 'refs/pull/7/head'])).toBe('1 branch(es): main; 1 other ref(s)');
  });

  it('says the count is a lower bound when the walk stopped before the end of the list', async () => {
    // A page walk is bounded, so there is a repository whose size the channel knows only as
    // "more than what it read". A number printed there would be a count of the part it saw,
    // presented as a count of the whole -- which is the defect the walk was added to fix.
    expect(refSentence(['refs/heads/a', 'refs/heads/b'], false)).toBe('at least 2 branch(es): a, b');
  });
});

describe('publishing to a repository through the local transport', { timeout: FILE_TIMEOUT_MS }, () => {
  it('replays every commit the remote does not have, and the remote log becomes the local log', async () => {
    // Pushed rather than cloned: the commits above the branch are absent from the remote's
    // object store, so the blobs this case uploads are the blobs that arrive.
    const { source, remote, shas } = await staged('replay', 1);
    const transport = localTransport({ remote });

    return publish({ root: source, rev: 'HEAD', branch: 'main', transport }).then(async (result) => {
      expect(result.state).toBe('published');
      expect(result.identical).toBe(true);
      // Every commit was reproduced from the bytes of its own object, so the names are the
      // local names: the base was the same commit, not a twin wearing the same tree.
      expect(result.identity).toEqual({ state: 'exact', commits: 3, base: 'commit' });
      // The assertion finding 404 would have failed: three commits went up and one
      // arrived, with every tree identical and the round's account of itself two thirds
      // shorter. A tree comparison is satisfied by that state; a log comparison is not.
      expect(await log(remote, 'main')).toBe(await log(source, 'HEAD'));
      expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[4]!);
    });
  });

  it('carries a deletion and a mode change, because both are entries and not absences', async () => {
    const { source, remote, shas } = await stage('entries');
    await at(remote, shas[0]!);
    const transport = localTransport({ remote });
    await publish({ root: source, rev: 'HEAD', branch: 'main', transport });

    const listing = await git(remote, ['ls-tree', '-r', 'main']);
    expect(listing).not.toContain('gone.ts');
    expect(listing).toContain('100755 blob');
    expect((await git(remote, ['ls-tree', '-r', '--name-only', 'main'])).trim().split('\n').sort()).toEqual(
      (await git(source, ['ls-tree', '-r', '--name-only', 'HEAD'])).trim().split('\n').sort(),
    );
  });

  it('says the remote is current on a second run rather than publishing the tip again', async () => {
    const { source, remote, shas } = await stage('again');
    await at(remote, shas[0]!);
    const transport = localTransport({ remote });
    await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
    const again = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
    expect(again.state).toBe('current');
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[4]!);
  });

  it('creates nothing on a dry run and still names the commits it would publish', async () => {
    const { source, remote, shas } = await stage('dry');
    await at(remote, shas[2]!);
    const lines: string[] = [];
    const result = await publish({
      root: source,
      rev: 'HEAD',
      branch: 'main',
      transport: localTransport({ remote }),
      dryRun: true,
      log: (line: string) => lines.push(line),
    });
    expect(result.state).toBe('planned');
    expect(result.plan.commits).toHaveLength(2);
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[2]!);
    expect(lines.join('\n')).toContain('on the remote tip');
  });

  it('publishes a whole history onto a branch on a repository with no refs at all', async () => {
    const { source, remote, shas } = await staged('unborn', null);
    const transport = localTransport({ remote });
    const result = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });

    expect(result.identical).toBe(true);
    // The root commit is published with no parent, which is the one step a plan can only
    // carry onto a repository that holds nothing: the five commits are named unchanged.
    expect(result.identity).toEqual({ state: 'exact', commits: 5, base: 'unborn' });
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[4]!);
    expect(await log(remote, 'main')).toBe(await log(source, 'HEAD'));
  });

  it('refuses a branch that does not exist on a repository that has branches', async () => {
    // The state a typo produces: `--branch mian` on a repository whose branch is `main`.
    // The read answers 404, which is the same status an unborn branch answers, and the plan
    // that follows publishes the whole history onto a branch nobody asked for.
    const { source, remote, shas } = await stage('mistyped');
    await at(remote, shas[1]!);
    const transport = localTransport({ remote });

    await expect(publish({ root: source, rev: 'HEAD', branch: 'mian', transport })).rejects.toThrow(
      /'mian' does not exist and the remote is not empty: it holds 1 branch\(es\): main/,
    );
    // Nothing was created: the refusal is two reads and no write, which is the difference
    // between a push that says no and a push that creates a branch and then says no.
    expect((await runChild('git', ['-C', remote, 'rev-parse', '--verify', '--quiet', 'refs/heads/mian'])).status).not.toBe(0);
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
  });

  it('creates a name for a commit the remote already holds, and builds nothing', async () => {
    // A clone carries every object the source has, so the remote holds the tip while no
    // branch says so. Until v3.60 the creation path replayed the whole history anyway: the
    // plan walked back from the absent branch and found nowhere to hang, so five commits
    // were rebuilt as new objects for a name that needed one reference (finding 447).
    const { source, remote, shas } = await stage('declared-new');
    await at(remote, shas[1]!);
    const transport = localTransport({ remote });
    const lines: string[] = [];

    const result = await publish({
      root: source,
      rev: 'HEAD',
      branch: 'release',
      transport,
      newBranch: true,
      log: (line: string) => lines.push(line),
    });
    expect(result.identical).toBe(true);
    expect(result.tip).toBe(shas[4]!);
    expect(result.identity).toEqual({ state: 'held', commits: 0, base: null });
    expect(result.plan.commits).toEqual([]);
    expect(lines.join('\n')).toContain(`the remote already holds ${shas[4]!.slice(0, 9)}`);
    expect((await git(remote, ['rev-parse', 'release'])).trim()).toBe(shas[4]!);
    // The branch that was there did not move: a new branch is a second name for the same
    // history, not a push that lands on the wrong one as well.
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
  });

  it('refuses to name a commit whose tree no gate blessed, because the name publishes that tree', async () => {
    // v3.60's closing note said the receipt rule "has nothing to say" about a push that
    // publishes no content, and bypassed it with `--no-gate` on the one real creation this
    // channel ever made. The rule is asked before the branch is even read -- `requireReceipt`
    // runs on the tip's tree -- so a pointer push is gated like every other push: what crosses
    // the wire is a reference, and what the reference makes reachable is a tree. The bypass was
    // honest about being a bypass; the sentence explaining it was wrong about why.
    const { source, shas } = await history('pointer-gate');
    mkdirSync(join(source, 'scripts'), { recursive: true });
    writeFileSync(join(source, 'scripts', 'verify-local.mjs'), '// a gate, in the only sense this test needs\n');
    await git(source, ['add', '--', 'scripts/verify-local.mjs']);
    const tip = await commit(source, 'a gate appears', {});
    expect(tip).not.toBe(shas[4]);
    const remote = join(SCRATCH, 'pointer-gate-remote.git');
    await git(SCRATCH, ['init', '-q', '--bare', remote]);
    await git(source, ['push', '-q', remote, `${tip}:refs/heads/main`]);
    const tree = (await git(source, ['rev-parse', `${tip}^{tree}`])).trim();
    const calls: string[] = [];
    const inner = localTransport({ remote });
    // Every method the executor calls is recorded, and the point of the case is that the
    // list is empty: a gate that fired after the branch read would have learned something
    // about the remote before asking whether the tree it is about to name was ever blessed.
    const transport = new Proxy(inner, {
      get(target, key) {
        const value = Reflect.get(target, key);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          calls.push(String(key));
          return (value as (...rest: unknown[]) => unknown).apply(target, args);
        };
      },
    });

    await expect(
      publish({ root: source, rev: tip, branch: 'release', transport, newBranch: true }),
    ).rejects.toThrow(/no verify:local receipt exists/);
    expect(calls).toEqual([]);
    // Refused before the name was made: a gate that fired after `POST /git/refs` would have
    // published exactly what it was refusing.
    expect((await runChild('git', ['-C', remote, 'rev-parse', '--verify', '--quiet', 'refs/heads/release'])).status).not.toBe(0);

    writeReceipt({ root: source, tree, note: 'this test' });
    const result = await publish({ root: source, rev: tip, branch: 'release', transport, newBranch: true });
    expect(result.identity).toEqual({ state: 'held', commits: 0, base: null });
    expect((await git(remote, ['rev-parse', 'release'])).trim()).toBe(tip);
  });

  it('replays only the window above a ref tip when the branch is created beside one', async () => {
    // A branch that does not exist has no tip to locate a base against, and until v3.61 that
    // made the window the whole ancestry: five commits built for a branch whose content was
    // four of them already on the remote, and on this repository the push could not happen at
    // all -- the history it insisted on replaying contains a merge, and a replayed merge is
    // refused (finding 455). A repository with refs has tips, and `main` is one: the window is
    // what is above it, and the branch is still created rather than moved.
    const { source, remote, shas } = await staged('declared-new-replay', 2);
    const transport = localTransport({ remote });
    const lines: string[] = [];

    const result = await publish({
      root: source,
      rev: 'HEAD',
      branch: 'release',
      transport,
      newBranch: true,
      log: (line: string) => lines.push(line),
    });
    expect(result.identity).toEqual({ state: 'exact', commits: 2, base: 'commit' });
    expect(lines.join('\n')).toContain(`the remote does not hold ${shas[4]!.slice(0, 9)}`);
    expect((await git(remote, ['rev-parse', 'release'])).trim()).toBe(shas[4]!);
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[2]!);
  });

  it('hangs a created branch on the nearest tip the remote has, not the first one it read', async () => {
    // Two branches, two depths. The window is everything above the base, so the useful base is
    // the one nearest the tip: `new` at the fourth commit is one commit from the tip and `main`
    // at the second is four. A walk that kept the first match -- and `main` is first in ref
    // order -- would replay four commits for a branch that needs one.
    const { source, remote, shas } = await staged('deepest-tip', 1);
    await git(source, ['push', '-q', remote, `${shas[3]}:refs/heads/new`]);
    const transport = localTransport({ remote });

    const result = await publish({ root: source, rev: 'HEAD', branch: 'release', transport, newBranch: true });
    expect(result.identity).toEqual({ state: 'exact', commits: 1, base: 'commit' });
    expect((await git(remote, ['rev-parse', 'release'])).trim()).toBe(shas[4]!);
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
    expect((await git(remote, ['rev-parse', 'new'])).trim()).toBe(shas[3]!);
  });

  /**
   * A branch that points at a commit this repository does not have, and at the same tree.
   *
   * That is a *twin*: the name on the far side differs from the local one because the remote
   * rebuilt the commit above a different parent, so the SHA cannot be compared and the tree
   * has to be. It is the shape every branch above the rename boundary has (finding 450), and
   * it is the only shape in which choosing a base costs a request -- which is why the three
   * cases below are about counting them.
   */
  async function twinOf({ source, remote, from, name, message }: { source: string; remote: string; from: string; name: string; message: string }) {
    const identity = { ...process.env, ...IDENTITY };
    const tree = (await git(source, ['rev-parse', `${from}^{tree}`])).trim();
    const twin = (await runChild('git', ['-C', source, 'commit-tree', tree, '-p', from, '-m', message], { env: identity })).stdout.trim();
    await git(source, ['push', '-q', remote, `${twin}:refs/heads/${name}`]);
    return twin;
  }

  /** A branch pointing at a commit whose tree no commit in this history has. */
  async function foreignTwin({ source, remote, name }: { source: string; remote: string; name: string }) {
    const identity = { ...process.env, ...IDENTITY };
    const empty = (await runChild('git', ['-C', source, 'mktree'], { env: identity, input: '' })).stdout.trim();
    const twin = (
      await runChild('git', ['-C', source, 'commit-tree', empty, '-m', `nothing under ${name}`], { env: identity })
    ).stdout.trim();
    await git(source, ['push', '-q', remote, `${twin}:refs/heads/${name}`]);
    return twin;
  }

  /** The requests a push makes, by name, so a count is a count and not an impression. */
  function counted(inner: ReturnType<typeof localTransport>) {
    const calls: string[] = [];
    const transport = new Proxy(inner, {
      get(target, key) {
        const value = Reflect.get(target, key);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          calls.push(String(key));
          return (value as (...rest: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    return { transport, calls, reads: () => calls.filter((one) => one === 'commit').length };
  }

  it('stops reading twin tips when the base it already has cannot be improved on', async () => {
    // A creation cannot replay fewer than one commit: zero would be a pointer push, and that
    // question has already been answered `no` -- it is what put this path here. So a base at
    // index 1 is as good as this search can get, and the two twin branches below cannot make
    // it better. They were read anyway: the walk compared every tip that was not a local
    // commit, whether or not `best` already held the optimum (finding 459).
    const { source, remote, shas } = await staged('free-base', 3);
    await twinOf({ source, remote, from: shas[0]!, name: 'a-twin', message: 'the same tree, a different name' });
    await twinOf({ source, remote, from: shas[0]!, name: 'z-twin', message: 'the same tree, a third name' });
    const { transport, reads } = counted(localTransport({ remote }));
    const lines: string[] = [];

    const result = await publish({ root: source, rev: 'HEAD', branch: 'release', transport, newBranch: true, log: (line: string) => lines.push(line) });
    expect(result.identity).toEqual({ state: 'exact', commits: 1, base: 'commit' });
    expect(reads()).toBe(0);
    expect(lines.join('\n')).toContain('the base is ' + shas[3]!.slice(0, 9));
    expect(lines.join('\n')).toContain('0 of the 2 remote tip(s) that are not local commits were read');
  });

  it('stops at the first twin that gives a one-commit window, and says how many it read', async () => {
    // `main` is a local commit four below the tip; `a-twin` carries the tree of the commit one
    // below it. Reading `a-twin` answers the question and nothing above it can improve on the
    // answer, so `z-twin` is not read -- and the count is printed, because it is the one number
    // in this path that grows with the repository rather than with the push.
    const { source, remote, shas } = await staged('twin-window', 0);
    await twinOf({ source, remote, from: shas[3]!, name: 'a-twin', message: 'the parent, rebuilt' });
    await foreignTwin({ source, remote, name: 'z-twin' });
    const { transport, reads } = counted(localTransport({ remote }));
    const lines: string[] = [];

    const result = await publish({ root: source, rev: 'HEAD', branch: 'release', transport, newBranch: true, log: (line: string) => lines.push(line) });
    // The base is a twin, so the one replayed commit hangs on the remote's name for its parent
    // and its SHA cannot be the local one -- which is exactly what `parents` means.
    expect(result.identity).toEqual({ state: 'parents', commits: 1, base: 'tree' });
    expect(reads()).toBe(1);
    expect(lines.join('\n')).toContain('1 of the 2 remote tip(s) that are not local commits were read');
    expect(lines.join('\n')).toContain('cannot replay fewer than one commit');
  });

  it('reads every twin when none of them can improve on the base, and says the search came up empty', async () => {
    // The other end: the only refs are twins whose trees this history does not have, so no
    // base is found at all and the whole ancestry is replayed. Both candidates are read, and
    // the sentence says so -- a reader would otherwise infer it from a five-commit plan.
    const { source, remote } = await staged('twin-none', null);
    await foreignTwin({ source, remote, name: 'a-twin' });
    await foreignTwin({ source, remote, name: 'z-twin' });
    const { transport, reads } = counted(localTransport({ remote }));
    const lines: string[] = [];

    const result = await publish({ root: source, rev: 'HEAD', branch: 'release', transport, newBranch: true, log: (line: string) => lines.push(line) });
    expect(result.identity).toEqual({ state: 'exact', commits: 5, base: 'unborn' });
    expect(reads()).toBe(2);
    expect(lines.join('\n')).toContain('none of the 2 remote tip(s) that are not local commits carries a tree');
    expect(lines.join('\n')).toContain('all 2 were read');
  });

  it('creates a branch above a merge it does not have to replay, and refuses the same push onto nothing', async () => {
    // The push that found this round's fifth finding, reduced to a fixture. The local history
    // contains a merge three commits back; the remote holds the commit above it. A branch
    // created beside that one replays the one commit above the tip it was given -- while the
    // same branch created on an empty repository has to replay the merge, and is refused by
    // the plan's own rule. Before v3.61 the creation path always took the second route, so this
    // branch could not be created at all (finding 455).
    const { source, shas } = await history('merge-deep');
    const identity = { ...process.env, ...IDENTITY };
    const second = (
      await runChild('git', ['-C', source, 'commit-tree', `${shas[1]}^{tree}`, '-p', shas[1], '-m', 'a second parent'], {
        env: identity,
      })
    ).stdout.trim();
    const merge = (
      await runChild('git', ['-C', source, 'commit-tree', `${shas[2]}^{tree}`, '-p', shas[2], '-p', second, '-m', 'a merge'], {
        env: identity,
      })
    ).stdout.trim();
    await git(source, ['reset', '-q', '--hard', merge]);
    const above = await commit(source, 'above the merge', { 'docs/a.md': 'a\n' });
    const tip = await commit(source, 'tip above that', { 'docs/b.md': 'b\n' });
    const remote = join(SCRATCH, 'merge-deep-remote.git');
    await git(SCRATCH, ['init', '-q', '--bare', remote]);
    await git(source, ['push', '-q', remote, `${above}:refs/heads/main`]);

    const transport = localTransport({ remote });
    const result = await publish({ root: source, rev: 'HEAD', branch: 'release', transport, newBranch: true });
    expect(result.identity).toEqual({ state: 'exact', commits: 1, base: 'commit' });
    expect((await git(remote, ['rev-parse', 'release'])).trim()).toBe(tip);

    // And the route the round removed, on a remote with no refs at all: the whole ancestry,
    // which reaches the merge, which a replay cannot carry.
    const bare = join(SCRATCH, 'merge-deep-empty.git');
    await git(SCRATCH, ['init', '-q', '--bare', bare]);
    await expect(
      publish({ root: source, rev: 'HEAD', branch: 'release', transport: localTransport({ remote: bare }), newBranch: true }),
    ).rejects.toThrow(/has 2 parents, and a replayed commit is published on one/);
  });

  it('replays the whole history only when the remote has no ref to hang it on', async () => {
    // The other side of the same decision: a repository with no refs has no base, and the
    // first push is the one case where the window really is the ancestry.
    const { source, remote, shas } = await staged('declared-new-empty', null);
    const transport = localTransport({ remote });
    const lines: string[] = [];

    const result = await publish({
      root: source,
      rev: 'HEAD',
      branch: 'release',
      transport,
      newBranch: true,
      log: (line: string) => lines.push(line),
    });
    expect(result.identity).toEqual({ state: 'exact', commits: 5, base: 'unborn' });
    expect(lines.join('\n')).toContain('the remote holds no refs');
    expect((await git(remote, ['rev-parse', 'release'])).trim()).toBe(shas[4]!);
  });

  it('refuses --new-branch for a branch that exists, because the flag is a claim about the remote', async () => {
    // The flag was read as permission and not as a statement. A push that says "this branch
    // is new" onto a branch that is there is a push whose author is wrong about the remote,
    // and publishing it would move a branch they believe they are creating.
    const { source, remote, shas } = await stage('claim');
    await at(remote, shas[3]!);
    const transport = localTransport({ remote });

    await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport, newBranch: true })).rejects.toThrow(
      /'main' already exists at [0-9a-f]{9} and --new-branch says it does not/,
    );
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[3]!);
  });

  it('publishes onto a twin of a local ancestor, and says the names are the only difference', async () => {
    // The state this repository has been in for two hundred and forty-six commits: the
    // remote's tip carries the tree of a local ancestor and is not that commit -- a twin,
    // produced by an earlier replay onto a twin. Every commit above it is renamed by the
    // push that follows, because a commit's name is its content *and its parents' names*.
    // The channel cannot undo that; what it can do is prove the replay lost nothing else.
    const { source, remote, shas } = await stage('twin');
    const twin = (await git(remote, ['commit-tree', `${shas[1]}^{tree}`, '-m', 'a twin of the second'])).trim();
    expect(twin).not.toBe(shas[1]);
    await at(remote, twin);

    const lines: string[] = [];
    const result = await publish({
      root: source,
      rev: 'HEAD',
      branch: 'main',
      transport: localTransport({ remote }),
      log: (line: string) => lines.push(line),
    });
    expect(result.identical).toBe(false);
    expect(result.identity).toEqual({ state: 'parents', commits: 3, base: 'tree' });
    // Said before the first request and again per commit: the announcement is what an operator
    // reads in a dry run, and the per-commit line is what a reader of the transcript counts.
    const announced = lines.findIndex((line) => line.includes('this plan hangs on the remote'));
    const firstBuild = lines.findIndex((line) => line.includes(' -> '));
    expect(announced).toBeGreaterThan(-1);
    expect(announced).toBeLessThan(firstBuild);
    expect(lines.filter((line) => line.includes('the same commit, hanging on'))).toHaveLength(3);
    // The content is the local content: same tree, same message, same parent count.
    expect((await git(remote, ['rev-parse', 'main^{tree}'])).trim()).toBe((await git(source, ['rev-parse', 'HEAD^{tree}'])).trim());
    expect((await git(remote, ['log', '-1', '--format=%B', 'main'])).trim()).toBe(
      (await git(source, ['log', '-1', '--format=%B', 'HEAD'])).trim(),
    );
    // And the difference is exactly the parent lines: the remote's tip is the local tip's
    // own bytes with its parents named after the commits the remote actually holds. Comparing
    // the objects with their `parent` lines removed is the isomorphism, stated as a test.
    const body = async (root: string, rev: string) =>
      (await git(root, ['cat-file', '-p', rev]))
        .split('\n')
        .filter((line) => !line.startsWith('parent '))
        .join('\n');
    expect(await body(remote, 'main')).toBe(await body(source, 'HEAD'));
    const oldest = (await git(remote, ['rev-list', '--max-count=3', 'main'])).trim().split('\n').pop() ?? '';
    expect((await git(remote, ['rev-list', '--parents', '-n', '1', oldest])).trim().split(' ')[1]).toBe(twin);
  });

  it('refuses to create a branch that appeared between the plan and the ref', async () => {
    // The race the creation path has to answer: the plan was made against an absent branch
    // and something else created it first. Asserted on the transport directly, because the
    // window it is about cannot be held open through `publish()`.
    const { remote, shas } = await stage('local-appeared');
    const transport = localTransport({ remote });
    await expect(transport.updateRef({ branch: 'main', sha: shas[2]!, expected: null })).rejects.toThrow(
      /the branch 'main' was absent when the plan was made and is not now: it is [0-9a-f]{9}/,
    );
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[4]!);
  });

  it('answers whether the remote holds a commit, and a blob it holds is not one', async () => {
    // The question the creation path turns on. A remote that holds a blob is not a remote
    // that holds the history that blob appears in, so the answer is asked of `^{commit}`
    // rather than of the object store at large.
    const { source, remote, shas } = await staged('holds', 2);
    const transport = localTransport({ remote });
    try {
      expect(await transport.holds(shas[2]!)).toBe(true);
      expect(await transport.holds(shas[3]!)).toBe(false);
      const blob = (await git(source, ['rev-parse', `${shas[2]}:README.md`])).trim();
      expect(await transport.holds(blob)).toBe(false);
    } finally {
      transport.dispose();
    }
  });

  it('does not ask for a ref listing on the ordinary path, where the branch read answered', async () => {
    const { source, remote, shas } = await stage('no-probe');
    await at(remote, shas[3]!);
    const asked: string[] = [];
    const transport = localTransport({ remote });
    const counted = { ...transport, refs: async () => { asked.push('refs'); return transport.refs(); } };

    await publish({ root: source, rev: 'HEAD', branch: 'main', transport: counted });
    expect(asked).toEqual([]);
  });

  it('does not ask whether the remote holds the tip when the listing already said it holds nothing', async () => {
    // Two questions, one answer. A repository with no refs cannot serve a commit by any name,
    // so "does it hold this commit" has a known answer the moment the listing comes back
    // empty -- and asking it anyway cost one request on every first push (finding 451). The
    // saving is deliberately conservative: the replay that follows is correct whatever the
    // object store contains, while naming a commit the listing never mentioned would rely on
    // objects a repository with no refs is about to collect.
    const { source, remote, shas } = await staged('empty-listing', null);
    const transport = localTransport({ remote });
    const asked: string[] = [];
    const lines: string[] = [];
    const counted = {
      ...transport,
      holds: async (sha: string) => {
        asked.push(sha);
        return transport.holds(sha);
      },
    };

    const result = await publish({
      root: source,
      rev: 'HEAD',
      branch: 'main',
      transport: counted,
      log: (line: string) => lines.push(line),
    });
    expect(asked).toEqual([]);
    expect(lines.join('\n')).toContain('the remote holds no refs');
    // And the sentence the other branch prints is not printed. "the remote does not hold
    // <sha>" is a claim about the object store, and this path never looked at it.
    expect(lines.join('\n')).not.toContain('the remote does not hold');
    expect(result.identical).toBe(true);
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[4]!);
  });

  it('refuses when the remote holds neither the revision nor any tree of its ancestry', async () => {
    const { source, remote } = await stage('unrelated');
    const other = await repository('unrelated-other');
    await commit(other, 'somebody else', { 'other.txt': 'x\n' });
    await git(SCRATCH, ['clone', '-q', '--bare', other, join(SCRATCH, 'unrelated-remote-2.git')]);
    const stranger = join(SCRATCH, 'unrelated-remote-2.git');

    await expect(
      publish({ root: source, rev: 'HEAD', branch: 'main', transport: localTransport({ remote: stranger, source }) }),
    ).rejects.toThrow(/Publishing the tip alone is how finding 404 lost two of three commits/);
    // Nothing was written to either repository: the refusal happens before the first
    // upload, so the stranger still has its one commit and the source is untouched.
    expect((await git(stranger, ['rev-list', '--count', 'main'])).trim()).toBe('1');
    expect((await git(remote, ['rev-list', '--count', 'main'])).trim()).toBe('5');
  });

  it('creates a branch at a tip the remote holds under another name, one commit and no blob', async () => {
    // The state every push leaves behind: the remote's tip carries the tree of the local tip
    // and is not that commit. For a branch that exists that is a refusal -- replaying would put
    // a second commit with the same message on top of a tree that is already there -- but a
    // branch being created has no first commit under its name, so the window is the tip itself
    // and its parent is the remote's name for the twin (finding 456).
    // `staged` with the history pushed up to the fourth commit, then a twin of the fifth made
    // in the source and pushed: the remote holds the twin's tree and blobs and *not* the local
    // commit, which is the state a push leaves behind and the one `holds` answers `false` to.
    const { source, remote, shas } = await staged('twin-creation', 3);
    const twin = (
      await runChild('git', ['-C', source, 'commit-tree', `${shas[4]}^{tree}`, '-p', shas[3]!, '-m', 'a twin of the fifth'], {
        env: { ...process.env, ...IDENTITY },
      })
    ).stdout.trim();
    await git(source, ['push', '-q', remote, `${twin}:refs/heads/main`]);
    const transport = localTransport({ remote });

    const result = await publish({ root: source, rev: 'HEAD', branch: 'copy', transport, newBranch: true });
    expect(result.identity).toEqual({ state: 'parents', commits: 1, base: 'tree' });
    expect(result.plan.commits).toHaveLength(1);
    const made = (await git(remote, ['rev-parse', 'copy'])).trim();
    expect(made).not.toBe(shas[4]);
    expect((await git(remote, ['rev-parse', `${made}^{tree}`])).trim()).toBe((await git(source, ['rev-parse', 'HEAD^{tree}'])).trim());
    // The parent is the twin, so the branch is one commit above what the remote had -- not a
    // second root, and not a history the branch was never asked to carry.
    expect((await git(remote, ['rev-parse', `${made}^`])).trim()).toBe(twin);
    // And the branch that was there did not move.
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(twin);
  });

  it('refuses when the remote already carries this tree on a commit that is not this one', async () => {
    const { source, remote, shas } = await stage('sametree');
    const tree = (await git(source, ['rev-parse', 'HEAD^{tree}'])).trim();
    const elsewhere = (
      await runChild('git', ['-C', remote, 'commit-tree', tree, '-m', 'a different message'], {
        env: { ...process.env, ...IDENTITY },
      })
    ).stdout.trim();
    await at(remote, elsewhere);

    await expect(
      publish({ root: source, rev: 'HEAD', branch: 'main', transport: localTransport({ remote }) }),
    ).rejects.toThrow(/already carries the tree of/);
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(elsewhere);
    expect(shas[4]).not.toBe(elsewhere);
  });

  it('refuses a branch that moved between the plan and the ref, and forces nothing', async () => {
    const { source, remote, shas } = await stage('moved');
    await at(remote, shas[0]!);
    const local = localTransport({ remote });
    const interrupted = {
      ...local,
      async updateRef(args: { branch: string; sha: string; expected: string | null }) {
        await at(remote, shas[1]!);
        return local.updateRef(args);
      },
    };
    await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport: interrupted })).rejects.toThrow(
      /the branch moved while the plan was being executed/,
    );
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
  });

  it('asks for a receipt when the repository has a gate, and publishes once it has one', async () => {
    const { source, remote, shas } = await stage('receipt');
    await at(remote, shas[0]!);
    mkdirSync(join(source, 'scripts'), { recursive: true });
    writeFileSync(join(source, 'scripts', 'verify-local.mjs'), '// a gate, in the only sense this test needs\n');
    await git(source, ['add', '--', 'scripts/verify-local.mjs']);
    const head = await commit(source, 'a gate appears', {});
    const tree = (await git(source, ['rev-parse', `${head}^{tree}`])).trim();

    expect(() => requireReceipt({ root: source, rev: head, tree })).toThrow(/no verify:local receipt exists/);
    writeReceipt({ root: source, tree, note: 'this test' });
    expect(requireReceipt({ root: source, rev: head, tree }).state).toBe('verified');

    const transport = localTransport({ remote });
    const result = await publish({ root: source, rev: head, branch: 'main', transport });
    expect(result.identical).toBe(true);
  });

  it('does not ask a repository that has no gate, so the prose repository can still be pushed', async () => {
    const source = await repository('no-gate');
    const head = await commit(source, 'one', { 'a.txt': 'a\n' });
    const tree = (await git(source, ['rev-parse', `${head}^{tree}`])).trim();
    expect(requireReceipt({ root: source, rev: head, tree })).toMatchObject({ state: 'absent' });
  });
});

/* ------------------------------------------------------------- the API shape */

interface Behaviour {
  requests: string[];
  truncate: boolean;
  failOnce: string | null;
  maxBase64: number | null;
  moveOnPatch: string | null;
  blobStatus: number | null;
  refStatus: number | null;
  patchStatus: number | null;
  dropOnce: string | null;
  dropAll: string | null;
  refsStatus: number | null;
  refsNotAList: boolean;
  /** A synthetic repository of this many branches, so a page walk has something to walk. */
  refsCount: number | null;
  /** A status every page after the first answers with, so `409` can be asked about. */
  refsStatusAfter: number | null;
  createStatus: number | null;
  commitStatus: number | null;
  loseMessageTail: boolean;
}

/**
 * A server that speaks the four endpoints this channel uses, over a real repository.
 *
 * It is not an emulator of GitHub: it is the smallest set of answers a correct channel
 * needs, and each answer is produced by git rather than by a table, so a tree the API
 * "creates" here is a tree object with a hash. That is what lets the assertion at the end
 * be an equality of commit SHAs.
 */
async function api(remote: string) {
  const behaviour: Behaviour = {
    requests: [],
    truncate: false,
    failOnce: null,
    maxBase64: null,
    moveOnPatch: null,
    blobStatus: null,
    refStatus: null,
    patchStatus: null,
    dropOnce: null,
    dropAll: null,
    refsStatus: null,
    refsNotAList: false,
    refsCount: null,
    refsStatusAfter: null,
    createStatus: null,
    commitStatus: null,
    loseMessageTail: false,
  };
  const local = localTransport({ remote });

  const server = createServer((request, response) => {
    void (async () => {
      const send = (status: number, payload: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(payload));
      };
      const fail = (status: number, message: string) => send(status, { message });
      try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      // The query is part of the key. A page walk asks the same path with a different `page`
      // and the two are different questions; a key that dropped the query would record one
      // request where the channel made two, which is the reading a pagination case turns on.
      const key = `${request.method} ${url.pathname}${url.search}`;
      behaviour.requests.push(key);

      if (behaviour.dropOnce === key || behaviour.dropAll === key) {
        behaviour.dropOnce = null;
        // The peer closes the connection without an answer: undici reports a TypeError
        // whose cause is UND_ERR_SOCKET, which is not a status and cannot be answered by
        // the 500 retry. This is the shape the first real push met.
        request.socket.destroy();
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const body = chunks.length === 0 ? null : JSON.parse(Buffer.concat(chunks).toString('utf8'));

      if (behaviour.failOnce === key) {
        behaviour.failOnce = null;
        return fail(500, 'the API is having a moment');
      }

      const path = url.pathname.replace('/repos/owner/repo', '');
      // The branch is taken from the path rather than fixed to `main`: a case about a
      // mistyped branch asks for one that does not exist, and a route that only knew
      // `main` would answer it with the router's 404 -- the right status for the wrong
      // reason, which is a case that would pass on a channel that never asked.
      const refRead = /^\/git\/ref\/heads\/(.+)$/.exec(path);
      if (request.method === 'GET' && refRead !== null) {
        if (behaviour.refStatus !== null) return fail(behaviour.refStatus, 'the reader is not allowed to ask');
        const head = await local.head(refRead[1]!);
        return head === null ? fail(404, 'Not Found') : send(200, { object: { sha: head.sha } });
      }
      if (request.method === 'GET' && path === '/git/refs') {
        if (behaviour.refsStatus !== null) return fail(behaviour.refsStatus, 'the listing is not available');
        const perPage = Number(url.searchParams.get('per_page') ?? '30');
        const page = Number(url.searchParams.get('page') ?? '1');
        // A `409` that only a *later* page answers. `409` on the first page is the API
        // saying "this repository has no refs"; on a later page it cannot mean that, because
        // the first page of an empty repository is `[]` -- so the channel owes the two
        // different verdicts and this is how the difference becomes visible.
        if (behaviour.refsStatusAfter !== null && page > 1) {
          return fail(behaviour.refsStatusAfter, 'this page is not available');
        }
        // A listing that honours `per_page` and `page`, because a stand-in that answered
        // every page with the whole list could never show that the channel asked twice --
        // and a page walk is only observable to a test through the requests it makes.
        // `refsCount` fabricates a repository of that many branches, so a walk can be
        // exercised on a machine that has no such repository.
        const tips =
          behaviour.refsCount === null
            ? (await local.refs()).tips
            : Array.from({ length: behaviour.refsCount }, (_, index) => ({
                name: `refs/heads/b${String(index).padStart(4, '0')}`,
                sha: '0'.repeat(40),
              }));
        const shown = tips.slice((page - 1) * perPage, page * perPage);
        // Two shapes, and only one of them is a list: `refsNotAList` produces the answer a
        // reader must refuse rather than read as "no refs", because an empty repository and
        // an answer this channel cannot parse are not the same fact.
        //
        // The SHA is the one the ref really points at. It was a row of zeroes until v3.61,
        // which was invisible while the listing was only counted and became a lie the moment
        // a plan started hanging on a tip: a stand-in that answers "this name points at
        // 0000…" is a stand-in whose answer no reader can use (finding 454).
        return send(200, behaviour.refsNotAList ? { refs: shown.map((tip) => tip.name) } : shown.map((tip) => ({ ref: tip.name, object: { sha: tip.sha } })));
      }
      if (request.method === 'GET' && path.startsWith('/git/commits/')) {
        if (behaviour.commitStatus !== null) return fail(behaviour.commitStatus, 'this commit is not readable');
        const sha = path.slice('/git/commits/'.length);
        // The API answers 404 for a commit it does not hold, and until v3.60 this route
        // could not: `local.commit` throws on a missing object, the catch answered 500, and
        // the one state the creation path has to tell apart -- "the remote already holds it"
        // -- was inexpressible here. `holds` reads that status, so the stand-in owes it.
        //
        // Asked with `cat-file -e` directly rather than through the transport's own `holds`:
        // a fixture that answers the question with the code being asked about it would agree
        // with any answer that code gave.
        if ((await runChild('git', ['-C', remote, 'cat-file', '-e', `${sha}^{commit}`])).status !== 0) {
          return fail(404, 'Not Found');
        }
        const commit = await local.commit(sha);
        return send(200, { sha: commit.sha, tree: { sha: commit.tree } });
      }
      if (request.method === 'GET' && path.startsWith('/git/trees/')) {
        const listing = await local.tree(path.slice('/git/trees/'.length));
        const tree = behaviour.truncate ? listing.entries.slice(0, 1) : listing.entries;
        return send(200, { sha: path.slice('/git/trees/'.length), tree, truncated: behaviour.truncate });
      }
      if (request.method === 'POST' && path === '/git/blobs') {
        if (behaviour.blobStatus !== null) return fail(behaviour.blobStatus, 'this blob is not acceptable');
        const raw =
          body.encoding === 'base64' ? Buffer.from(body.content, 'base64') : Buffer.from(body.content, 'utf8');
        if (body.encoding === 'base64' && behaviour.maxBase64 !== null && body.content.length > behaviour.maxBase64) {
          return fail(400, 'malformed request');
        }
        const written = await runChild('git', ['-C', remote, 'hash-object', '-w', '--stdin'], { input: raw });
        return send(201, { sha: String(written.stdout).trim() });
      }
      if (request.method === 'POST' && path === '/git/trees') {
        const blobs = new Map<string, Buffer>();
        for (const entry of body.tree) {
          if (entry.sha === null) continue;
          const raw = await runChild('git', ['-C', remote, 'cat-file', 'blob', entry.sha]);
          blobs.set(entry.sha, Buffer.from(raw.stdout, 'utf8'));
        }
        const tree = await local.createTree({ base: body.base_tree ?? null, entries: body.tree, blobs });
        return send(201, { sha: tree });
      }
      if (request.method === 'POST' && path === '/git/commits') {
        // A stand-in that drops a byte, which the API does not: the point is the channel's
        // verdict, not the API's manners. A rebuild that lost a byte is a rebuild the
        // channel must refuse rather than describe, and this is the only way to hand it one.
        const stored = behaviour.loseMessageTail ? { ...body, message: String(body.message).replace(/\n$/, '') } : body;
        const sha = await local.createCommit(stored);
        return send(201, { sha });
      }
      const refWrite = /^\/git\/refs\/heads\/(.+)$/.exec(path);
      if (request.method === 'PATCH' && refWrite !== null) {
        const name = refWrite[1]!;
        if (behaviour.patchStatus !== null) return fail(behaviour.patchStatus, 'not a ref you may write');
        const before = await local.head(name);
        // A branch is created with `POST /git/refs` and never by moving it: the ref update
        // is a PATCH on a reference that has to be there. A server that created the ref
        // here would let the channel's unborn path pass on a call the API refuses, which
        // is the difference this round is about.
        if (before === null) return fail(422, 'Reference does not exist');
        // A push that arrives after somebody else's: the ref moves between the read this
        // channel did and the write it asks for, which is the state `force: false` exists
        // to refuse.
        if (behaviour.moveOnPatch !== null) await at(remote, behaviour.moveOnPatch);
        try {
          await local.updateRef({ branch: name, sha: body.sha, expected: before.sha });
        } catch (error) {
          return fail(422, String((error as Error).message));
        }
        return send(200, { object: { sha: body.sha } });
      }
      if (request.method === 'POST' && path === '/git/refs') {
        if (behaviour.createStatus !== null) return fail(behaviour.createStatus, 'Reference already exists');
        const name = String(body.ref).replace('refs/heads/', '');
        if ((await local.head(name)) !== null) return fail(422, 'Reference already exists');
        await local.updateRef({ branch: name, sha: body.sha, expected: null });
        return send(201, { ref: body.ref, object: { sha: body.sha } });
      }
        return fail(404, `no route for ${key}`);
      } catch (error) {
        // A server that threw answers something: a socket with no reply is not a 500, and
        // a client waiting on one reports a timeout rather than the request that failed.
        if (!response.headersSent) return fail(500, String((error as Error).message));
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;

  return {
    base: `http://127.0.0.1:${port}`,
    behaviour,
    close: () =>
      new Promise<void>((resolve) => {
        local.dispose();
        server.close(() => resolve());
      }),
  };
}

describe('publishing through the GitHub transport, against a server that writes real objects', { timeout: FILE_TIMEOUT_MS }, () => {
  it('reconstructs three commits byte for byte over HTTP', async () => {
    const { source, remote, shas } = await stage('http');
    await at(remote, shas[1]!);
    const server = await api(remote);
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const result = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
      expect(result.identical).toBe(true);
      expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[4]!);
      expect(await log(remote, 'main')).toBe(await log(source, 'HEAD'));
    } finally {
      await server.close();
    }
  });

  it('retries a 500 and publishes the same history on the second attempt', async () => {
    const { source, remote, shas } = await stage('retry');
    await at(remote, shas[2]!);
    const server = await api(remote);
    try {
      server.behaviour.failOnce = 'POST /repos/owner/repo/git/commits';
      const transport = githubTransport({
        token: 'a-token-for-the-server',
        owner: 'owner',
        repo: 'repo',
        api: server.base,
        sleep: async () => undefined,
      });
      const result = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
      expect(result.identical).toBe(true);
      // Two commits to publish, one 500 on the first of them, and the same body accepted on
      // the retry: three requests, two of which became objects.
      expect(server.behaviour.requests.filter((key) => key === 'POST /repos/owner/repo/git/commits')).toHaveLength(3);
    } finally {
      await server.close();
    }
  });

  it('retries a request whose socket the peer closed, and the push still ends at the local tip', async () => {
    const { source, remote, shas } = await stage('socket-drop');
    await at(remote, shas[3]!);
    const server = await api(remote);
    try {
      server.behaviour.dropOnce = 'POST /repos/owner/repo/git/blobs';
      const transport = githubTransport({
        token: 'a-token-for-the-server',
        owner: 'owner',
        repo: 'repo',
        api: server.base,
        sleep: async () => undefined,
      });
      const result = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
      expect(result.identical).toBe(true);
      expect(await log(remote, 'main')).toBe(await log(source, 'HEAD'));
      // The dropped request has no answer to count as an object; the retry does. Assert
      // the retry happened rather than that the first request silently disappeared.
      expect(server.behaviour.requests.filter((key) => key === 'POST /repos/owner/repo/git/blobs').length).toBeGreaterThan(1);
    } finally {
      await server.close();
    }
  });

  it('spends exactly its retry budget on a connection that never answers, then refuses', async () => {
    const { source, remote, shas } = await stage('socket-always');
    await at(remote, shas[3]!);
    const server = await api(remote);
    try {
      server.behaviour.dropAll = 'POST /repos/owner/repo/git/blobs';
      const transport = githubTransport({
        token: 'a-token-for-the-server',
        owner: 'owner',
        repo: 'repo',
        api: server.base,
        sleep: async () => undefined,
        retries: 3,
      });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport })).rejects.toThrow(/fetch failed|other side closed|UND_ERR/);
      expect(server.behaviour.requests.filter((key) => key === 'POST /repos/owner/repo/git/blobs')).toHaveLength(3);
      // Nothing was forced: the ref is where it started.
      expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[3]!);
    } finally {
      await server.close();
    }
  });

  it('does not retry a failure that is not a broken connection', async () => {
    let calls = 0;
    const transport = githubTransport({
      token: 'a-token-for-the-server',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: async () => {
        calls += 1;
        throw new Error('the caller built a request it cannot send');
      },
      sleep: async () => undefined,
    });
    await expect(transport.head('main')).rejects.toThrow('the caller built a request it cannot send');
    expect(calls).toBe(1);
  });

  it('names only the errors a connection can produce, so a programmer error stays an error', async () => {
    const closed = new TypeError('fetch failed');
    Object.defineProperty(closed, 'cause', { value: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) });
    expect(isNetworkFailure(closed)).toBe(true);
    expect(isNetworkFailure(new TypeError('fetch failed'))).toBe(true);
    expect(isNetworkFailure(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isNetworkFailure(new Error('the caller built a request it cannot send'))).toBe(false);
    expect(isNetworkFailure(new TypeError('wrong number of arguments'))).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });

  it('falls back to a utf-8 body when the base64 one is refused, and the commit is still the local one', async () => {
    const { source, remote, shas } = await stage('utf8');
    await at(remote, shas[3]!);
    const server = await api(remote);
    try {
      server.behaviour.maxBase64 = 32;
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const result = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
      expect(result.identical).toBe(true);
      // The base64 body was offered and refused; the same bytes as utf-8 were accepted.
      expect(server.behaviour.requests.filter((key) => key === 'POST /repos/owner/repo/git/blobs').length).toBeGreaterThan(1);
    } finally {
      await server.close();
    }
  });

  it('refuses a truncated listing before it creates a single object', async () => {
    const { source, remote, shas } = await stage('short-listing');
    await at(remote, shas[1]!);
    const server = await api(remote);
    try {
      server.behaviour.truncate = true;
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport })).rejects.toThrow(
        /the tree listing is truncated/,
      );
      expect(server.behaviour.requests.filter((key) => key.includes('/git/trees') && key.startsWith('POST'))).toEqual([]);
      expect(server.behaviour.requests.filter((key) => key.includes('/git/blobs'))).toEqual([]);
      expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
    } finally {
      await server.close();
    }
  });

  it('refuses a rebuild that lost a byte, rather than describing it as a different history', async () => {
    // Every other status the API can answer is the API's, but a commit whose body is not the
    // body that was sent is the channel's own verdict failing. The stand-in drops the byte the
    // API keeps, so the case can put the channel in front of a rebuild that is wrong by one
    // byte -- and the refusal is the point: a channel that described this as "a different
    // history" would be guessing at a cause it had never checked.
    const { source, remote, shas } = await stage('http-lost-byte');
    await at(remote, shas[1]!);
    const server = await api(remote);
    server.behaviour.loseMessageTail = true;
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport })).rejects.toThrow(
        new RegExp(
          `the rebuilt commit is not ${shas[2]!.slice(0, 9)} with its parents renamed: the API answered ` +
            '[0-9a-f]{9} for a commit whose tree, message, identities and parent count are the ones it was sent',
        ),
      );
      // Nothing was forced: the ref is where it was when the push started.
      expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
    } finally {
      await server.close();
    }
  });

  it('publishes the whole history when the branch does not exist yet', async () => {
    // A repository with no refs at all, and objects the remote has never seen: this is the
    // state a first push meets, and the only one where the root commit is published on
    // nothing. A clone would not do -- it carries every object, so the push would be a name
    // for a commit that was already there.
    const { source, remote, shas } = await staged('http-unborn', null);
    const server = await api(remote);
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const result = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
      expect(result.identical).toBe(true);
      expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[4]!);
      // The 404 is answered by asking what the repository does hold: one read, and it is
      // what tells an unborn branch on an empty repository from a name that is wrong.
      expect(server.behaviour.requests.filter((key) => key === 'GET /repos/owner/repo/git/refs?per_page=100&page=1')).toHaveLength(1);
      // And the branch is *created* rather than moved: the ref update is a PATCH on a
      // reference that has to exist, so a channel that can publish an unborn branch at all
      // is one that asks for `POST /git/refs`. Until v3.58 it did not, and this case passed
      // because the server here created the branch on the PATCH -- a call the API refuses.
      expect(server.behaviour.requests).toContain('POST /repos/owner/repo/git/refs');
      expect(server.behaviour.requests.filter((key) => key.startsWith('PATCH'))).toEqual([]);
      // The listing answered "no refs", which is also the answer to "does it hold this
      // commit" for every name a ref could carry, so the question is not asked: v3.60 asked
      // it here and paid a request for an answer it already had (finding 451).
      const asked = server.behaviour.requests;
      expect(asked.filter((key) => key.includes('/git/commits/'))).toEqual([]);
      expect(asked.filter((key) => key.includes('/git/refs?'))).toEqual([
        'GET /repos/owner/repo/git/refs?per_page=100&page=1',
      ]);
    } finally {
      await server.close();
    }
  });

  it('names a commit the remote already holds with three requests, and writes no object', async () => {
    // The creation path's whole cost when the objects are there: the branch read, the
    // question, the creation. The plan it prints is empty, because there is nothing to build.
    const { source, remote, shas } = await stage('http-pointer');
    await at(remote, shas[1]!);
    const server = await api(remote);
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const result = await publish({ root: source, rev: 'HEAD', branch: 'release', transport, newBranch: true });
      expect(result.state).toBe('published');
      expect(result.identical).toBe(true);
      expect(result.identity).toEqual({ state: 'held', commits: 0, base: null });
      expect((await git(remote, ['rev-parse', 'release'])).trim()).toBe(shas[4]!);
      expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
      expect(server.behaviour.requests).toEqual([
        'GET /repos/owner/repo/git/ref/heads/release',
        `GET /repos/owner/repo/git/commits/${shas[4]}`,
        'POST /repos/owner/repo/git/refs',
      ]);
    } finally {
      await server.close();
    }
  });

  it('walks the listing past its first page, because a refusal that counted one page counted nothing', async () => {
    // `/git/refs` answers a hundred refs at a time and the channel read one page as "every
    // ref in the repository". The refusal that turns on that listing counts what it reads and
    // prints a few names, so a repository with a hundred and forty branches was refused with
    // "100 branch(es)" -- a number the reader is entitled to act on, off by forty.
    const { source, remote } = await staged('http-refs-pages', 1);
    const server = await api(remote);
    server.behaviour.refsCount = 140;
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'relese', transport })).rejects.toThrow(
        /it holds 140 branch\(es\)/,
      );
      expect(server.behaviour.requests.filter((key) => key.includes('/git/refs?'))).toEqual([
        'GET /repos/owner/repo/git/refs?per_page=100&page=1',
        'GET /repos/owner/repo/git/refs?per_page=100&page=2',
      ]);
    } finally {
      await server.close();
    }
  });

  it('hangs a created branch on a tip the listing named, and pays nothing to learn where it is', async () => {
    // The creation path's base, over the real API's shapes. `main` points at a commit the
    // local ancestry already carries, so the listing's SHA is enough to place it -- no commit
    // read, no tree read until the base has been chosen -- and the window is what is above it.
    const { source, remote, shas } = await staged('http-creation-base', 2);
    const server = await api(remote);
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const result = await publish({ root: source, rev: 'HEAD', branch: 'release', transport, newBranch: true });
      expect(result.identity).toEqual({ state: 'exact', commits: 2, base: 'commit' });
      expect((await git(remote, ['rev-parse', 'release'])).trim()).toBe(shas[4]!);
      const asked = server.behaviour.requests;
      // The tip's name is in the ancestry, so the only read of it is the question about the
      // tip itself -- answered `404`, because the commit above it is the one being published.
      expect(asked.filter((key) => key.startsWith(`GET /repos/owner/repo/git/commits/`))).toEqual([
        `GET /repos/owner/repo/git/commits/${shas[4]}`,
      ]);
      expect(asked).toContain('GET /repos/owner/repo/git/refs?per_page=100&page=1');
      expect(asked).toContain('POST /repos/owner/repo/git/refs');
      expect(asked.filter((key) => key.startsWith('PATCH'))).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('asks a second time when the first page is exactly full, because full is not the same as last', async () => {
    // The case a page walk gets wrong by assuming: a hundred is both "the page size" and "the
    // size of a repository with a hundred refs". Only the next page can tell them apart, so
    // the walk asks one more question than the obvious implementation and the count is exact.
    const { source, remote } = await staged('http-refs-exact', 1);
    const server = await api(remote);
    server.behaviour.refsCount = 100;
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'relese', transport })).rejects.toThrow(
        /it holds 100 branch\(es\)/,
      );
      expect(server.behaviour.requests.filter((key) => key.includes('/git/refs?'))).toHaveLength(2);
    } finally {
      await server.close();
    }
  });

  it('stops at a thousand refs and says the count is a lower bound', async () => {
    // A walk in a refusal path is a walk nobody asked for, so it is bounded: ten pages, and
    // the sentence says "at least" rather than printing a number it did not finish counting.
    // A refusal is read by somebody looking for their own branch, and the two facts it owes
    // them are "this repository is not empty" and "here is roughly how much is in it".
    const { source, remote } = await staged('http-refs-bound', 1);
    const server = await api(remote);
    server.behaviour.refsCount = 1400;
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'relese', transport })).rejects.toThrow(
        /it holds at least 1000 branch\(es\)/,
      );
      expect(server.behaviour.requests.filter((key) => key.includes('/git/refs?'))).toHaveLength(10);
    } finally {
      await server.close();
    }
  });

  it('asks for the listing once when the first page is short, which is every repository here', async () => {
    // The cost claim: pagination is free on the repositories this channel actually pushes to.
    // A short page is a complete listing, and the request after it would be a request that
    // could only confirm a count it already has.
    const { source, remote } = await staged('http-refs-short', 1);
    const server = await api(remote);
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'relese', transport })).rejects.toThrow(
        /it holds 1 branch\(es\): main/,
      );
      expect(server.behaviour.requests.filter((key) => key.includes('/git/refs?'))).toEqual([
        'GET /repos/owner/repo/git/refs?per_page=100&page=1',
      ]);
    } finally {
      await server.close();
    }
  });

  it('forwards a refusal on a later page instead of reading it as a repository with no refs', async () => {
    // `409` on the first page is the API saying "this repository has no refs". On a later
    // page it cannot mean that -- the first page of an empty repository is `[]`, so a second
    // page exists only because the first one was full. Reading the status as "no refs"
    // anyway would turn the one listing that proves the repository is not empty into a
    // licence to publish a whole history onto a name that is wrong.
    const { source, remote } = await staged('http-refs-late-409', 1);
    const server = await api(remote);
    server.behaviour.refsCount = 140;
    server.behaviour.refsStatusAfter = 409;
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'relese', transport })).rejects.toThrow(
        /git\/refs\?per_page=100&page=2 -> 409/,
      );
      // And nothing was published: the refusal is the whole outcome of a mistyped branch.
      expect((await runChild('git', ['-C', remote, 'rev-parse', '--verify', '--quiet', 'refs/heads/relese'])).status).not.toBe(0);
    } finally {
      await server.close();
    }
  });

  it('says what a dry run would do rather than naming commits it would not build', async () => {
    const { source, remote, shas } = await stage('http-pointer-dry');
    await at(remote, shas[2]!);
    const server = await api(remote);
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const result = await publish({
        root: source,
        rev: 'HEAD',
        branch: 'release',
        transport,
        newBranch: true,
        dryRun: true,
      });
      expect(result.state).toBe('planned');
      expect(result.plan.commits).toEqual([]);
      // Still absent: a dry run reads the remote and creates nothing, including the name.
      expect((await runChild('git', ['-C', remote, 'rev-parse', '--verify', '--quiet', 'refs/heads/release'])).status).not.toBe(0);
      expect(server.behaviour.requests.filter((key) => key.startsWith('POST'))).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('forwards a refusal on the question rather than replaying a history it could not read', async () => {
    // A `403` on the commit read is not a commit that is absent, and the two differ by a
    // replay of a history the remote already has -- which for this channel is three hundred
    // uploads. So the status is forwarded, and nothing is written.
    const { source, remote, shas } = await staged('http-pointer-refused', 1);
    const server = await api(remote);
    server.behaviour.commitStatus = 403;
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const error = await publish({ root: source, rev: 'HEAD', branch: 'release', transport, newBranch: true }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(ApiError);
      expect((error as { status: number }).status).toBe(403);
      expect(server.behaviour.requests.filter((key) => key.startsWith('POST'))).toEqual([]);
      expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
    } finally {
      await server.close();
    }
  });

  it('turns a branch that appeared during the push into a sentence, and forces nothing', async () => {
    // The mirror of the moved-ref refusal: the plan was made against an absent branch and
    // the creation is refused because the name is taken. The channel does not re-read the
    // branch here -- see the comment on `updateRef` -- so the sentence says what it knows.
    const { source, remote } = await stage('http-create-refused');
    await git(remote, ['update-ref', '-d', 'refs/heads/main']);
    const server = await api(remote);
    server.behaviour.createStatus = 422;
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const error = await publish({ root: source, rev: 'HEAD', branch: 'main', transport }).catch(
        (caught: unknown) => caught,
      );
      // Two states wear this 422, and the sentence names both: the name was taken while the
      // push was being made, or the commit the ref was to name is not there after all (a
      // remote may collect an object between the question and the creation). The channel
      // cannot tell them apart without a second read it refuses to make, so it says so.
      expect(String((error as Error).message)).toMatch(/was absent when the plan was made and is not now/);
      expect(String((error as Error).message)).toMatch(/or the commit it was to name is not there after all/);
      expect((await runChild('git', ['-C', remote, 'rev-parse', '--verify', '--quiet', 'refs/heads/main'])).status).not.toBe(0);
    } finally {
      await server.close();
    }
  });

  it('refuses a branch the remote does not have, before it creates a single object', async () => {
    const { source, remote, shas } = await stage('http-mistyped');
    await at(remote, shas[1]!);
    const server = await api(remote);
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'mian', transport })).rejects.toThrow(
        /'mian' does not exist and the remote is not empty/,
      );
      expect(server.behaviour.requests).toEqual([
        'GET /repos/owner/repo/git/ref/heads/mian',
        'GET /repos/owner/repo/git/refs?per_page=100&page=1',
      ]);
    } finally {
      await server.close();
    }
  });

  it('reads a 409 on the listing as an empty repository, which is what the status says', async () => {
    // A repository with no refs at all: the API announces it with a status instead of a
    // list, and what follows is a first push. Until v3.60 the fixture was a clone with its
    // branch deleted -- objects and all -- so the push that followed was a name for a commit
    // that was already there, and the case passed without ever publishing anything.
    const { source, remote, shas } = await staged('http-empty-409', null);
    const server = await api(remote);
    server.behaviour.refsStatus = 409;
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const result = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
      expect(result.identical).toBe(true);
      expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[4]!);
    } finally {
      await server.close();
    }
  });

  it('forwards a refusal on the listing rather than reading it as an empty repository', async () => {
    // A listing this channel was not allowed to read is not a repository with no refs, and
    // the difference is a push onto a branch that may already exist.
    const { source, remote } = await stage('http-refs-refused');
    await git(remote, ['update-ref', '-d', 'refs/heads/main']);
    const server = await api(remote);
    server.behaviour.refsStatus = 403;
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport })).rejects.toThrow(/-> 403/);
      expect(server.behaviour.requests.filter((key) => key.startsWith('POST'))).toEqual([]);
      expect(server.behaviour.requests).toEqual([
        'GET /repos/owner/repo/git/ref/heads/main',
        'GET /repos/owner/repo/git/refs?per_page=100&page=1',
      ]);
    } finally {
      await server.close();
    }
  });

  it('refuses a listing that is not a list, instead of counting it as no refs', async () => {
    const { source, remote } = await stage('http-refs-shape');
    await git(remote, ['update-ref', '-d', 'refs/heads/main']);
    const server = await api(remote);
    server.behaviour.refsNotAList = true;
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport })).rejects.toThrow(
        /is not a list of refs/,
      );
    } finally {
      await server.close();
    }
  });

  it('turns a moved ref into a sentence about the branch, and forces nothing', async () => {
    const { source, remote, shas } = await stage('http-moved');
    await at(remote, shas[0]!);
    const server = await api(remote);
    try {
      server.behaviour.moveOnPatch = shas[1]!;
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport })).rejects.toThrow(
        /the branch moved while the plan was being executed/,
      );
      expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
    } finally {
      await server.close();
    }
  });

  it('refuses a tree entry whose blob the executor never read', async () => {
    const { source, remote } = await stage('no-blob');
    const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: 'http://127.0.0.1:1' });
    await expect(
      transport.createTree({
        base: null,
        entries: [{ path: 'a.txt', mode: '100644', type: 'blob', sha: 'a'.repeat(40) }],
        blobs: new Map(),
      }),
    ).rejects.toThrow(/that the executor did not read/);
    expect(remote).toContain('remote.git');
    expect(source).toContain('source');
  });

  it('refuses an empty token rather than sending a request that will answer 401', async () => {
    expect(() => githubTransport({ token: '', owner: 'owner', repo: 'repo' })).toThrow(
      /the GitHub transport needs a token/,
    );
  });

  it('reports the API status on the error it throws, so a caller can tell 404 from 422', async () => {
    const { source, remote, shas } = await stage('status');
    await at(remote, shas[0]!);
    const server = await api(remote);
    try {
      const transport = githubTransport({
        token: 'a-token-for-the-server',
        owner: 'owner',
        repo: 'repo',
        api: server.base,
        sleep: async () => undefined,
      });
      const error = await transport.commit('f'.repeat(40)).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiError);
      // The status a caller must tell from a `422` is the one the API actually answers for a
      // commit it does not hold. This case asserted `500` until v3.60, because the stand-in
      // read a missing object through git and forwarded the exception -- so the number here
      // was the fixture's, not the API's (finding 449).
      expect((error as { status: number }).status).toBe(404);
    } finally {
      await server.close();
    }
  });
});

describe('the refusals that a broken transport produces', { timeout: FILE_TIMEOUT_MS }, () => {
  it('refuses a rebuilt tip whose tree is not the tree the gate blessed', async () => {
    const { source, remote, shas } = await stage('lying-tree');
    await at(remote, shas[3]!);
    const local = localTransport({ remote });
    // A transport that answers with a tree it had lying around: the plan is right and the
    // repository would end up holding something else, which is the one state the assertion
    // before the ref update exists to catch.
    const lying = {
      ...local,
      async createTree() {
        return (await git(remote, ['rev-parse', `${shas[1]}^{tree}`])).trim();
      },
    };
    await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport: lying })).rejects.toThrow(
      /refusing to move the ref: the rebuilt tip has tree/,
    );
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[3]!);
  });

  it('refuses a blob the API will not take in either encoding, naming the path', async () => {
    const { source, remote } = await stage('binary');
    const binary = Buffer.from([0xff, 0xfe, 0x00, 0x01]);
    writeFileSync(join(source, 'asset.bin'), binary);
    await git(source, ['add', '--', 'asset.bin']);
    const head = await commit(source, 'a binary file', {});
    const server = await api(remote);
    try {
      // No base64 body is accepted, and this file has no utf-8 form to fall back to.
      server.behaviour.maxBase64 = 0;
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: head, branch: 'main', transport })).rejects.toThrow(
        /the API refuses asset\.bin in every encoding/,
      );
    } finally {
      await server.close();
    }
  });

  it('forwards a status that is neither a retryable 5xx nor a fallback 400', async () => {
    const { source, remote, shas } = await stage('blob-status');
    await at(remote, shas[3]!);
    const server = await api(remote);
    try {
      server.behaviour.blobStatus = 422;
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const error = await publish({ root: source, rev: 'HEAD', branch: 'main', transport }).catch(
        (caught: unknown) => caught,
      );
      // The claim is about *which* error came out, not about what it says: a status that is
      // neither a retryable 5xx nor the 400 that invites a second encoding must be forwarded
      // as itself. Asserting the text passed while the rethrow was hollowed -- the fallback's
      // own sentence quotes the API's message, so it contains the status too.
      expect(error).toBeInstanceOf(ApiError);
      expect((error as { status: number }).status).toBe(422);
    } finally {
      await server.close();
    }
  });

  it('forwards a refusal on the ref read that is not the 404 of an unborn branch', async () => {
    const { source, remote, shas } = await stage('ref-status');
    await at(remote, shas[4]!);
    const server = await api(remote);
    try {
      server.behaviour.refStatus = 401;
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport })).rejects.toThrow(/-> 401:/);
    } finally {
      await server.close();
    }
  });

  it('forwards a refusal on the ref write that is not the 422 of a moved branch', async () => {
    const { source, remote, shas } = await stage('patch-status');
    await at(remote, shas[3]!);
    const server = await api(remote);
    try {
      server.behaviour.patchStatus = 400;
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport })).rejects.toThrow(/-> 400:/);
    } finally {
      await server.close();
    }
  });

  it('refuses a local tree request whose blob is not in hand', async () => {
    const { remote } = await stage('local-no-blob');
    const transport = localTransport({ remote });
    try {
      await expect(
        transport.createTree({
          base: null,
          entries: [{ path: 'a.txt', mode: '100644', type: 'blob', sha: 'a'.repeat(40) }],
          blobs: new Map(),
        }),
      ).rejects.toThrow(/that the executor did not read/);
    } finally {
      transport.dispose();
    }
  });

  it('refuses to move a branch to a commit that does not descend from it', async () => {
    const { source, remote, shas } = await stage('backwards');
    await at(remote, shas[2]!);
    const transport = localTransport({ remote });
    try {
      await expect(
        transport.updateRef({ branch: 'main', sha: shas[0]!, expected: shas[2]! }),
      ).rejects.toThrow(/refusing to move main backwards/);
      expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[2]!);
    } finally {
      transport.dispose();
    }
    expect(source).toContain('source');
  });
});

describe('the command line a push goes through', { timeout: FILE_TIMEOUT_MS }, () => {
  const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'publish-cli.mjs');

  async function run(args: string[], env: Record<string, string> = {}) {
    return runChild(process.execPath, [CLI, ...args], {
      env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '', ...env },
    });
  }

  it('refuses to publish without a token, naming what is missing', async () => {
    const result = await run(['--rev', 'HEAD', '--branch', 'main', '--repo', 'owner/repo']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('the GitHub transport needs a token');
  });

  it('refuses a local transport with no remote to write', async () => {
    const result = await run(['--rev', 'HEAD', '--branch', 'main', '--transport', 'local']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--transport local needs --remote DIR');
  });

  it('refuses a transport it does not have, and a GitHub push with no repository', async () => {
    const unknown = await run(['--rev', 'HEAD', '--branch', 'main', '--transport', 'carrier-pigeon']);
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain("'carrier-pigeon' is not a transport this channel has");

    const noRepo = await run(['--rev', 'HEAD', '--branch', 'main']);
    expect(noRepo.status).toBe(1);
    expect(noRepo.stderr).toContain('--repo OWNER/NAME is required');
  });

  it('refuses an argument it does not know rather than falling back to a default', async () => {
    const result = await run(['--rev', 'HEAD', '--branch', 'main', '--force']);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("unknown argument '--force'");
  });

  it('publishes to a local remote and prints the plan it executed', async () => {
    const { source, remote, shas } = await stage('cli');
    await at(remote, shas[3]!);
    const result = await run([
      '--rev',
      'HEAD',
      '--branch',
      'main',
      '--root',
      source,
      '--transport',
      'local',
      '--remote',
      remote,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('1/1');
    expect(result.stdout).toContain('VERIFIED');
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[4]!);
  });

  it('refuses a mistyped branch from the command line, and names the flag that would allow it', async () => {
    const { source, remote, shas } = await stage('cli-mistyped');
    await at(remote, shas[1]!);
    const result = await run(['--rev', 'HEAD', '--branch', 'mian', '--root', source, '--transport', 'local', '--remote', remote]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("'mian' does not exist and the remote is not empty");
    expect(result.stderr).toContain('--new-branch');
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
  });

  it('forwards a refusal on the creation that is not the one of a taken name', async () => {
    // The creation has exactly one refusal of its own -- the name was taken -- and every
    // other status is the API's, forwarded as itself. A channel that read a `403` as "the
    // branch appeared" would tell the operator to re-read a branch it was never allowed to
    // create.
    const { source, remote } = await stage('http-create-refused-403');
    await git(remote, ['update-ref', '-d', 'refs/heads/main']);
    const server = await api(remote);
    server.behaviour.createStatus = 403;
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport })).rejects.toThrow(/-> 403/);
    } finally {
      await server.close();
    }
  });

  it('creates a new branch on a commit the remote already holds, and says it built nothing', async () => {
    const { source, remote, shas } = await stage('cli-new-branch');
    await at(remote, shas[1]!);
    // `--new-branch` is first on purpose: the argument loop advances by two for a flag that
    // takes a value, so a valueless flag missing from that list swallows the argument after
    // it -- here `--rev`, which would fail as `--rev is required` rather than as itself.
    const result = await run([
      '--new-branch', '--rev', 'HEAD', '--branch', 'release', '--root', source,
      '--transport', 'local', '--remote', remote,
    ]);
    expect(result.status).toBe(0);
    // Not `VERIFIED`: nothing was rebuilt, so there is no round trip to certify. The sentence
    // is the one this push earned -- the name was created, and the bytes were already there.
    expect(result.stdout).toContain('this push created the name and rebuilt nothing');
    expect(result.stdout).not.toContain('VERIFIED');
    expect((await git(remote, ['rev-parse', 'release'])).trim()).toBe(shas[4]!);
  });

  it('publishes onto a new branch the remote does not hold, and certifies the bytes', async () => {
    const { source, remote, shas } = await staged('cli-new-branch-replay', 2);
    const result = await run([
      '--new-branch', '--rev', 'HEAD', '--branch', 'release', '--root', source,
      '--transport', 'local', '--remote', remote,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('the remote does not hold');
    // Two commits, not five: the tip of `main` gives the plan a base, so the branch is
    // created from what is above it rather than from the root of the history (finding 455).
    expect(result.stdout).toContain('1/2');
    expect(result.stdout).toContain('VERIFIED');
    expect((await git(remote, ['rev-parse', 'release'])).trim()).toBe(shas[4]!);
  });

  it('refuses --new-branch from the command line when the branch is already there', async () => {
    const { source, remote, shas } = await stage('cli-new-branch-claim');
    await at(remote, shas[1]!);
    const result = await run([
      '--new-branch', '--rev', 'HEAD', '--branch', 'main', '--root', source,
      '--transport', 'local', '--remote', remote,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("'main' already exists");
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
  });

  it('says a twin made the names differ, instead of calling the history foreign', async () => {
    // The sentence the channel used to print -- "the history it hangs on is not the local
    // history" -- was true of the SHAs and silent about the contents, which are the same. The
    // operator reading it cannot tell a rewritten parent from a lost commit, and that is the
    // difference between a push that worked and one that has to be redone by hand.
    const { source, remote, shas } = await stage('cli-twin');
    const twin = (await git(remote, ['commit-tree', `${shas[1]}^{tree}`, '-m', 'a twin of the second'])).trim();
    await at(remote, twin);
    const result = await run(['--rev', 'HEAD', '--branch', 'main', '--root', source, '--transport', 'local', '--remote', remote]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('this plan hangs on the remote');
    expect(result.stdout).toContain('every one of the 3 commit(s) this push carried');
    expect((await git(remote, ['rev-parse', 'main'])).trim()).not.toBe(shas[4]!);
  });

  it('prints the plan a dry run would execute and moves nothing', async () => {
    const { source, remote, shas } = await stage('cli-dry');
    await at(remote, shas[3]!);
    const result = await run([
      '--rev',
      'HEAD',
      '--branch',
      'main',
      '--root',
      source,
      '--transport',
      'local',
      '--remote',
      remote,
      '--dry-run',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('nothing was created');
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[3]!);
  });

  it('says when the receipt rule was not asked, rather than skipping it quietly', async () => {
    // `--no-gate` is used by the one push that publishes no content, so the difference
    // between "the gate blessed this tree" and "nobody asked" has to be in the transcript.
    const { source, remote, shas } = await stage('cli-no-gate');
    await at(remote, shas[3]!);
    const result = await run([
      '--rev', 'HEAD', '--branch', 'main', '--root', source, '--transport', 'local', '--remote', remote, '--no-gate',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--no-gate: the receipt rule was not asked');
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[4]!);
  });

  it('says a dry run of the pointer path would create the name, not publish no commits', async () => {
    // "0 commit(s) would be published; nothing was created" is true of this plan and tells
    // the reader the opposite of what would happen: the ref would move, and it is the only
    // thing that would.
    const { source, remote, shas } = await stage('cli-dry-pointer');
    await at(remote, shas[1]!);
    const result = await run([
      '--new-branch', '--rev', 'HEAD', '--branch', 'release', '--root', source,
      '--transport', 'local', '--remote', remote, '--dry-run',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('one request would create the branch');
    expect(result.stdout).not.toContain('0 commit(s) would be published');
    expect((await runChild('git', ['-C', remote, 'rev-parse', '--verify', '--quiet', 'refs/heads/release'])).status).not.toBe(0);
    expect((await git(remote, ['rev-parse', 'main'])).trim()).toBe(shas[1]!);
  });
});
