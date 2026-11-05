import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { writeReceipt } from '../../../scripts/gate-receipt.mjs';
import { ApiError, githubTransport, localTransport, publish, requireReceipt } from '../../../scripts/publish.mjs';

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

const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-publish-'));
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
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} in ${root}: ${String(result.stderr)}`);
  return result.stdout;
}

let clock = 1762265460;

function repository(name: string): string {
  const root = join(SCRATCH, name);
  mkdirSync(root, { recursive: true });
  git(root, ['init', '-q', '-b', 'main', '.']);
  return root;
}

/** One commit; `null` content deletes a path, and `executable` names the paths to chmod. */
function commit(root: string, message: string, files: Record<string, string | null>, executable: string[] = []): string {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      rmSync(join(root, path), { force: true });
      git(root, ['rm', '-q', '--cached', '--', path]);
      continue;
    }
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content, 'utf8');
    git(root, ['add', '--', path]);
    if (executable.includes(path)) git(root, ['update-index', '--chmod=+x', '--', path]);
  }
  clock += 60;
  const date = `${new Date(clock * 1000).toISOString().slice(0, 19).replace('T', ' ')} +0000`;
  git(root, ['commit', '-q', '--allow-empty', '-m', message], {
    env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  return git(root, ['rev-parse', 'HEAD']).trim();
}

/**
 * A source repository with five commits, and a bare remote cloned from it.
 *
 * The clone gives the remote real objects for the commits it is pointed at and none for
 * the ones above it, which is the state a push is in: the blobs have to be uploaded.
 */
function stage(name: string) {
  const source = repository(`${name}-source`);
  const shas = [
    commit(source, 'first', { 'README.md': '# a\n' }),
    commit(source, 'second', { 'src/one.ts': 'export const one = 1;\n' }),
    commit(source, 'third', { 'src/two.ts': 'export const two = 2;\n', 'src/gone.ts': 'export const gone = 3;\n', 'run.sh': '#!/bin/sh\n' }, ['run.sh']),
    commit(source, 'fourth', { 'src/gone.ts': null }),
    commit(source, 'fifth', { 'docs/note.md': 'a note long enough that its base64 body is longer than the threshold\n' }),
  ];
  const remote = join(SCRATCH, `${name}-remote.git`);
  git(SCRATCH, ['clone', '-q', '--bare', source, remote]);
  return { source, remote, shas };
}

function at(remote: string, sha: string) {
  git(remote, ['update-ref', 'refs/heads/main', sha]);
}

function log(root: string, rev: string) {
  return git(root, ['log', '--format=%H %s', rev]).trim();
}

describe('publishing to a repository through the local transport', () => {
  it('replays every commit the remote does not have, and the remote log becomes the local log', () => {
    const { source, remote, shas } = stage('replay');
    at(remote, shas[1]!);
    const transport = localTransport({ remote });

    return publish({ root: source, rev: 'HEAD', branch: 'main', transport }).then((result) => {
      expect(result.state).toBe('published');
      expect(result.identical).toBe(true);
      // The assertion finding 404 would have failed: three commits went up and one
      // arrived, with every tree identical and the round's account of itself two thirds
      // shorter. A tree comparison is satisfied by that state; a log comparison is not.
      expect(log(remote, 'main')).toBe(log(source, 'HEAD'));
      expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[4]!);
    });
  });

  it('carries a deletion and a mode change, because both are entries and not absences', async () => {
    const { source, remote, shas } = stage('entries');
    at(remote, shas[0]!);
    const transport = localTransport({ remote });
    await publish({ root: source, rev: 'HEAD', branch: 'main', transport });

    const listing = git(remote, ['ls-tree', '-r', 'main']);
    expect(listing).not.toContain('gone.ts');
    expect(listing).toContain('100755 blob');
    expect(git(remote, ['ls-tree', '-r', '--name-only', 'main']).trim().split('\n').sort()).toEqual(
      git(source, ['ls-tree', '-r', '--name-only', 'HEAD']).trim().split('\n').sort(),
    );
  });

  it('says the remote is current on a second run rather than publishing the tip again', async () => {
    const { source, remote, shas } = stage('again');
    at(remote, shas[0]!);
    const transport = localTransport({ remote });
    await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
    const again = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
    expect(again.state).toBe('current');
    expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[4]!);
  });

  it('creates nothing on a dry run and still names the commits it would publish', async () => {
    const { source, remote, shas } = stage('dry');
    at(remote, shas[2]!);
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
    expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[2]!);
    expect(lines.join('\n')).toContain('on the remote tip');
  });

  it('publishes a whole history onto a branch that does not exist yet', async () => {
    const { source, remote, shas } = stage('unborn');
    git(remote, ['update-ref', '-d', 'refs/heads/main']);
    const transport = localTransport({ remote });
    const result = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });

    expect(result.identical).toBe(true);
    expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[4]!);
    expect(log(remote, 'main')).toBe(log(source, 'HEAD'));
  });

  it('refuses when the remote holds neither the revision nor any tree of its ancestry', async () => {
    const { source, remote } = stage('unrelated');
    const other = repository('unrelated-other');
    commit(other, 'somebody else', { 'other.txt': 'x\n' });
    git(SCRATCH, ['clone', '-q', '--bare', other, join(SCRATCH, 'unrelated-remote-2.git')]);
    const stranger = join(SCRATCH, 'unrelated-remote-2.git');

    await expect(
      publish({ root: source, rev: 'HEAD', branch: 'main', transport: localTransport({ remote: stranger, source }) }),
    ).rejects.toThrow(/Publishing the tip alone is how finding 404 lost two of three commits/);
    // Nothing was written to either repository: the refusal happens before the first
    // upload, so the stranger still has its one commit and the source is untouched.
    expect(git(stranger, ['rev-list', '--count', 'main']).trim()).toBe('1');
    expect(git(remote, ['rev-list', '--count', 'main']).trim()).toBe('5');
  });

  it('refuses when the remote already carries this tree on a commit that is not this one', async () => {
    const { source, remote, shas } = stage('sametree');
    const tree = git(source, ['rev-parse', 'HEAD^{tree}']).trim();
    const elsewhere = spawnSync('git', ['-C', remote, 'commit-tree', tree, '-m', 'a different message'], {
      encoding: 'utf8',
      env: { ...process.env, ...IDENTITY },
    }).stdout.trim();
    at(remote, elsewhere);

    await expect(
      publish({ root: source, rev: 'HEAD', branch: 'main', transport: localTransport({ remote }) }),
    ).rejects.toThrow(/already carries the tree of/);
    expect(git(remote, ['rev-parse', 'main']).trim()).toBe(elsewhere);
    expect(shas[4]).not.toBe(elsewhere);
  });

  it('refuses a branch that moved between the plan and the ref, and forces nothing', async () => {
    const { source, remote, shas } = stage('moved');
    at(remote, shas[0]!);
    const local = localTransport({ remote });
    const interrupted = {
      ...local,
      async updateRef(args: { branch: string; sha: string; expected: string | null }) {
        at(remote, shas[1]!);
        return local.updateRef(args);
      },
    };
    await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport: interrupted })).rejects.toThrow(
      /the branch moved while the plan was being executed/,
    );
    expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[1]!);
  });

  it('asks for a receipt when the repository has a gate, and publishes once it has one', async () => {
    const { source, remote, shas } = stage('receipt');
    at(remote, shas[0]!);
    mkdirSync(join(source, 'scripts'), { recursive: true });
    writeFileSync(join(source, 'scripts', 'verify-local.mjs'), '// a gate, in the only sense this test needs\n');
    git(source, ['add', '--', 'scripts/verify-local.mjs']);
    const head = commit(source, 'a gate appears', {});
    const tree = git(source, ['rev-parse', `${head}^{tree}`]).trim();

    expect(() => requireReceipt({ root: source, rev: head, tree })).toThrow(/no verify:local receipt exists/);
    writeReceipt({ root: source, tree, note: 'this test' });
    expect(requireReceipt({ root: source, rev: head, tree }).state).toBe('verified');

    const transport = localTransport({ remote });
    const result = await publish({ root: source, rev: head, branch: 'main', transport });
    expect(result.identical).toBe(true);
  });

  it('does not ask a repository that has no gate, so the prose repository can still be pushed', () => {
    const source = repository('no-gate');
    const head = commit(source, 'one', { 'a.txt': 'a\n' });
    const tree = git(source, ['rev-parse', `${head}^{tree}`]).trim();
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
      const key = `${request.method} ${url.pathname}`;
      behaviour.requests.push(key);

      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const body = chunks.length === 0 ? null : JSON.parse(Buffer.concat(chunks).toString('utf8'));

      if (behaviour.failOnce === key) {
        behaviour.failOnce = null;
        return fail(500, 'the API is having a moment');
      }

      const path = url.pathname.replace('/repos/owner/repo', '');
      if (request.method === 'GET' && path === '/git/ref/heads/main') {
        if (behaviour.refStatus !== null) return fail(behaviour.refStatus, 'the reader is not allowed to ask');
        const head = await local.head('main');
        return head === null ? fail(404, 'Not Found') : send(200, { object: { sha: head.sha } });
      }
      if (request.method === 'GET' && path.startsWith('/git/commits/')) {
        const commit = await local.commit(path.slice('/git/commits/'.length));
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
        const written = spawnSync('git', ['-C', remote, 'hash-object', '-w', '--stdin'], { input: raw });
        return send(201, { sha: String(written.stdout).trim() });
      }
      if (request.method === 'POST' && path === '/git/trees') {
        const blobs = new Map<string, Buffer>();
        for (const entry of body.tree) {
          if (entry.sha === null) continue;
          const raw = spawnSync('git', ['-C', remote, 'cat-file', 'blob', entry.sha]);
          blobs.set(entry.sha, raw.stdout);
        }
        const tree = await local.createTree({ base: body.base_tree ?? null, entries: body.tree, blobs });
        return send(201, { sha: tree });
      }
      if (request.method === 'POST' && path === '/git/commits') {
        const sha = await local.createCommit(body);
        return send(201, { sha });
      }
      if (request.method === 'PATCH' && path === '/git/refs/heads/main') {
        if (behaviour.patchStatus !== null) return fail(behaviour.patchStatus, 'not a ref you may write');
        // A push that arrives after somebody else's: the ref moves between the read this
        // channel did and the write it asks for, which is the state `force: false` exists
        // to refuse.
        const before = await local.head('main');
        if (behaviour.moveOnPatch !== null) at(remote, behaviour.moveOnPatch);
        try {
          await local.updateRef({ branch: 'main', sha: body.sha, expected: before === null ? null : before.sha });
        } catch (error) {
          return fail(422, String((error as Error).message));
        }
        return send(200, { object: { sha: body.sha } });
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

describe('publishing through the GitHub transport, against a server that writes real objects', () => {
  it('reconstructs three commits byte for byte over HTTP', async () => {
    const { source, remote, shas } = stage('http');
    at(remote, shas[1]!);
    const server = await api(remote);
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const result = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
      expect(result.identical).toBe(true);
      expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[4]!);
      expect(log(remote, 'main')).toBe(log(source, 'HEAD'));
    } finally {
      await server.close();
    }
  });

  it('retries a 500 and publishes the same history on the second attempt', async () => {
    const { source, remote, shas } = stage('retry');
    at(remote, shas[2]!);
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

  it('falls back to a utf-8 body when the base64 one is refused, and the commit is still the local one', async () => {
    const { source, remote, shas } = stage('utf8');
    at(remote, shas[3]!);
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
    const { source, remote, shas } = stage('short-listing');
    at(remote, shas[1]!);
    const server = await api(remote);
    try {
      server.behaviour.truncate = true;
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport })).rejects.toThrow(
        /the tree listing is truncated/,
      );
      expect(server.behaviour.requests.filter((key) => key.includes('/git/trees') && key.startsWith('POST'))).toEqual([]);
      expect(server.behaviour.requests.filter((key) => key.includes('/git/blobs'))).toEqual([]);
      expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[1]!);
    } finally {
      await server.close();
    }
  });

  it('publishes the whole history when the branch does not exist yet', async () => {
    const { source, remote, shas } = stage('http-unborn');
    git(remote, ['update-ref', '-d', 'refs/heads/main']);
    const server = await api(remote);
    try {
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      const result = await publish({ root: source, rev: 'HEAD', branch: 'main', transport });
      expect(result.identical).toBe(true);
      expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[4]!);
    } finally {
      await server.close();
    }
  });

  it('turns a moved ref into a sentence about the branch, and forces nothing', async () => {
    const { source, remote, shas } = stage('http-moved');
    at(remote, shas[0]!);
    const server = await api(remote);
    try {
      server.behaviour.moveOnPatch = shas[1]!;
      const transport = githubTransport({ token: 'a-token-for-the-server', owner: 'owner', repo: 'repo', api: server.base });
      await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport })).rejects.toThrow(
        /the branch moved while the plan was being executed/,
      );
      expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[1]!);
    } finally {
      await server.close();
    }
  });

  it('refuses a tree entry whose blob the executor never read', async () => {
    const { source, remote } = stage('no-blob');
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

  it('refuses an empty token rather than sending a request that will answer 401', () => {
    expect(() => githubTransport({ token: '', owner: 'owner', repo: 'repo' })).toThrow(
      /the GitHub transport needs a token/,
    );
  });

  it('reports the API status on the error it throws, so a caller can tell 404 from 422', async () => {
    const { source, remote, shas } = stage('status');
    at(remote, shas[0]!);
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
      expect((error as { status: number }).status).toBe(500);
    } finally {
      await server.close();
    }
  });
});

describe('the refusals that a broken transport produces', () => {
  it('refuses a rebuilt tip whose tree is not the tree the gate blessed', async () => {
    const { source, remote, shas } = stage('lying-tree');
    at(remote, shas[3]!);
    const local = localTransport({ remote });
    // A transport that answers with a tree it had lying around: the plan is right and the
    // repository would end up holding something else, which is the one state the assertion
    // before the ref update exists to catch.
    const lying = {
      ...local,
      async createTree() {
        return git(remote, ['rev-parse', `${shas[1]}^{tree}`]).trim();
      },
    };
    await expect(publish({ root: source, rev: 'HEAD', branch: 'main', transport: lying })).rejects.toThrow(
      /refusing to move the ref: the rebuilt tip has tree/,
    );
    expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[3]!);
  });

  it('refuses a blob the API will not take in either encoding, naming the path', async () => {
    const { source, remote } = stage('binary');
    const binary = Buffer.from([0xff, 0xfe, 0x00, 0x01]);
    writeFileSync(join(source, 'asset.bin'), binary);
    git(source, ['add', '--', 'asset.bin']);
    const head = commit(source, 'a binary file', {});
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
    const { source, remote, shas } = stage('blob-status');
    at(remote, shas[3]!);
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
    const { source, remote, shas } = stage('ref-status');
    at(remote, shas[4]!);
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
    const { source, remote, shas } = stage('patch-status');
    at(remote, shas[3]!);
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
    const { remote } = stage('local-no-blob');
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
    const { source, remote, shas } = stage('backwards');
    at(remote, shas[2]!);
    const transport = localTransport({ remote });
    try {
      await expect(
        transport.updateRef({ branch: 'main', sha: shas[0]!, expected: shas[2]! }),
      ).rejects.toThrow(/refusing to move main backwards/);
      expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[2]!);
    } finally {
      transport.dispose();
    }
    expect(source).toContain('source');
  });
});

describe('the command line a push goes through', () => {
  const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'publish-cli.mjs');

  function run(args: string[], env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '', ...env },
    });
  }

  it('refuses to publish without a token, naming what is missing', () => {
    const result = run(['--rev', 'HEAD', '--branch', 'main', '--repo', 'owner/repo']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('the GitHub transport needs a token');
  });

  it('refuses a local transport with no remote to write', () => {
    const result = run(['--rev', 'HEAD', '--branch', 'main', '--transport', 'local']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--transport local needs --remote DIR');
  });

  it('refuses a transport it does not have, and a GitHub push with no repository', () => {
    const unknown = run(['--rev', 'HEAD', '--branch', 'main', '--transport', 'carrier-pigeon']);
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain("'carrier-pigeon' is not a transport this channel has");

    const noRepo = run(['--rev', 'HEAD', '--branch', 'main']);
    expect(noRepo.status).toBe(1);
    expect(noRepo.stderr).toContain('--repo OWNER/NAME is required');
  });

  it('refuses an argument it does not know rather than falling back to a default', () => {
    const result = run(['--rev', 'HEAD', '--branch', 'main', '--force']);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("unknown argument '--force'");
  });

  it('publishes to a local remote and prints the plan it executed', () => {
    const { source, remote, shas } = stage('cli');
    at(remote, shas[3]!);
    const result = run([
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
    expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[4]!);
  });

  it('prints the plan a dry run would execute and moves nothing', () => {
    const { source, remote, shas } = stage('cli-dry');
    at(remote, shas[3]!);
    const result = run([
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
    expect(git(remote, ['rev-parse', 'main']).trim()).toBe(shas[3]!);
  });
});
