import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { failureCode, githubTransport, isNetworkFailure } from '../../../scripts/publish.mjs';
import {
  appendReadings,
  formatSummary,
  readingErrors,
  summariseReadings,
} from '../../../scripts/publish-readings.mjs';

/**
 * The reading a push leaves behind, and the checks that stop it from lying.
 *
 * ## Why the transport is driven against a socket rather than a stub
 *
 * Every number in this file is about a real request: a `201` the server actually wrote, a
 * body that really went over the wire, a socket the peer really destroyed. A stub of
 * `fetch` would let the recorder be tested against the shapes the recorder expects, which
 * is the one thing it cannot be wrong about -- finding 428's lesson, one layer down.
 *
 * ## The two questions, kept apart
 *
 * `readingErrors` asks whether a file is a record of attempts at all; it cannot ask
 * whether the numbers in it are true, and says so in the module's own docstring. The
 * transport tests ask the other question -- that what a request did is what got written --
 * by comparing the row against the server's own account of the request it answered.
 */

/** The gate this file spawns, declared so the inventory and the test agree. */
export const DRIVES = ['scripts/publish-readings-cli.mjs'];

const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-publish-readings-'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Lambertyan',
  GIT_AUTHOR_EMAIL: 'lambertyan@example.com',
  GIT_COMMITTER_NAME: 'Lambertyan',
  GIT_COMMITTER_EMAIL: 'lambertyan@example.com',
};

function git(root: string, args: string[], extraEnv: Record<string, string> = {}) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...IDENTITY, ...extraEnv },
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(result.stderr)}`);
  return result.stdout;
}

function scratch(name: string): string {
  const root = join(SCRATCH, name);
  mkdirSync(root, { recursive: true });
  return root;
}

/** A row that passes every check, so a test can spoil exactly one field of it. */
function row(over: Record<string, unknown> = {}) {
  return { at: 1000, method: 'POST', path: '/git/blobs', attempt: 1, status: 201, ms: 12, sent: 40, received: 55, ...over };
}

/* ------------------------------------------------------------------- the shape */

describe('the checks a readings file has to satisfy', () => {
  it('accepts a file of ordinary rows', () => {
    expect(readingErrors([row(), row({ at: 1100, method: 'GET', path: '/git/ref/heads/main', status: 200 })])).toEqual([]);
  });

  it('refuses a file that is not a list, because a reader cannot walk it', () => {
    expect(readingErrors({ rows: [] })).toHaveLength(1);
  });

  it('refuses an empty list, because a reading of nothing is not a reading', () => {
    const problems = readingErrors([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('nothing on this channel has ever been measured');
  });

  it('refuses a status outside 100..599 rather than treating it as an answer', () => {
    expect(readingErrors([row({ status: 42 })])[0]).toContain('not an HTTP status');
  });

  it('refuses a row with no status field, so a missing answer and a forgotten field differ', () => {
    const { status: _status, ...withoutStatus } = row();
    void _status;
    expect(readingErrors([withoutStatus])[0]).toContain('has no `status` field');
  });

  it('refuses an answer that also carries an error', () => {
    expect(readingErrors([row({ error: { code: 'X', message: 'a failure' } })])[0]).toContain('both a status and an error');
  });

  it('refuses an unanswered attempt with no error, because that row says nothing happened', () => {
    expect(readingErrors([row({ status: null })])[0]).toContain('neither answered nor failed');
  });

  it('refuses an error with no message', () => {
    expect(readingErrors([row({ status: null, error: { code: 'UND_ERR_SOCKET', message: '' } })])[0]).toContain('no message');
  });

  it('refuses an error code that is not a string, because the retry rule reads strings', () => {
    expect(readingErrors([row({ status: null, error: { code: 7, message: 'refused' } })])[0]).toContain('neither a string nor null');
  });

  it('accepts an unanswered attempt whose error names no code', () => {
    expect(readingErrors([row({ status: null, error: { code: null, message: 'fetch failed' } })])).toEqual([]);
  });

  it('refuses a timestamp that runs backwards', () => {
    expect(readingErrors([row({ at: 2000 }), row({ at: 1999, path: '/git/trees' })])[0]).toContain('before the row above it');
  });

  it('refuses a second attempt whose first attempt is not above it', () => {
    expect(readingErrors([row({ at: 1000 }), row({ at: 1001, status: 500, attempt: 3 })])[0]).toContain('needs its own first attempt');
  });

  it('refuses a second attempt of a different request', () => {
    const first = row({ at: 1000, path: '/git/blobs' });
    const second = row({ at: 1001, path: '/git/trees', status: 500, attempt: 2 });
    expect(readingErrors([first, second])[0]).toContain('needs its own first attempt');
  });

  it('accepts a retry that follows its own first attempt', () => {
    expect(readingErrors([row({ at: 1000, status: 500 }), row({ at: 2000, attempt: 2 })])).toEqual([]);
  });

  it('accepts two separate calls to one endpoint, each starting from attempt 1', () => {
    // The utf-8 fallback is exactly this shape: one call, then another call with a
    // different body, and both are attempt 1 because neither is a retry of the other.
    expect(readingErrors([row({ at: 1000, status: 400 }), row({ at: 1001, sent: 20 })])).toEqual([]);
  });

  it('refuses a negative duration and a fractional byte count', () => {
    expect(readingErrors([row({ ms: -1 })]).length).toBeGreaterThan(0);
    expect(readingErrors([row({ sent: 1.5 })]).length).toBeGreaterThan(0);
  });

  it('refuses a rate limit that is not a whole number, because it is acted on', () => {
    expect(readingErrors([row({ remaining: 'lots' })])[0]).toContain('`remaining`');
  });
});

/* ------------------------------------------------------------------ the summary */

describe('the sentence a readings file earns', () => {
  it('counts retries rather than rows, so one retry is not reported as two', () => {
    const summary = summariseReadings([row({ at: 1, status: 500 }), row({ at: 2, attempt: 2 }), row({ at: 3, attempt: 3 })]);
    expect(summary.total).toBe(3);
    expect(summary.retried).toBe(2);
  });

  it('orders the statuses numerically and puts the unanswered last', () => {
    const summary = summariseReadings([
      row({ at: 1, status: 500 }),
      row({ at: 2, status: null, error: { code: 'UND_ERR_SOCKET', message: 'closed' } }),
      row({ at: 3, method: 'GET', path: '/git/ref/heads/main', status: 200 }),
    ]);
    expect(summary.statuses.map((one) => one.status)).toEqual(['200', '500', 'no-answer']);
    expect(summary.unanswered).toBe(1);
  });

  it('names the slowest request, not the slowest attempt of a request', () => {
    const summary = summariseReadings([
      row({ at: 1, ms: 12 }),
      row({ at: 2, method: 'PATCH', path: '/git/refs/heads/main', status: 200, ms: 2410 }),
    ]);
    expect(summary.slowest).toEqual({ method: 'PATCH', path: '/git/refs/heads/main', ms: 2410 });
  });

  it('prints one line that carries every number it counted', () => {
    const line = formatSummary(summariseReadings([row({ at: 1, status: 200, ms: 2401 })]));
    expect(line).toContain('1 request(s)');
    expect(line).toContain('0 retried');
    expect(line).toContain('1 answered');
    expect(line).toContain('0 unanswered');
    expect(line).toContain('slowest POST /git/blobs 2401 ms');
    expect(line).toContain('statuses 200x1');
  });

  it('says nothing was measured rather than naming a slowest request of none', () => {
    expect(formatSummary(summariseReadings([]))).toContain('nothing was measured');
  });
});

/* ------------------------------------------------------------------- the history */

describe('appending to the history', () => {
  it('creates the file when there is no history yet', () => {
    const file = join(scratch('append-new'), 'readings.json');
    expect(appendReadings(file, [row()])).toBe(1);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
  });

  it('appends rather than replacing, so the day the socket closed is still there', () => {
    const file = join(scratch('append-old'), 'readings.json');
    appendReadings(file, [row({ at: 1 })]);
    appendReadings(file, [row({ at: 2 })]);
    const rows = JSON.parse(readFileSync(file, 'utf8'));
    expect(rows.map((one: { at: number }) => one.at)).toEqual([1, 2]);
  });

  it('refuses to append to a file that is not JSON, and leaves it untouched', () => {
    const file = join(scratch('append-bad'), 'readings.json');
    writeFileSync(file, 'not json at all', 'utf8');
    expect(() => appendReadings(file, [row()])).toThrow(/would replace it/);
    expect(readFileSync(file, 'utf8')).toBe('not json at all');
  });

  it('refuses to append to a JSON document that is not a list', () => {
    const file = join(scratch('append-object'), 'readings.json');
    writeFileSync(file, '{"rows": []}', 'utf8');
    expect(() => appendReadings(file, [row()])).toThrow(/not an array/);
    expect(readFileSync(file, 'utf8')).toBe('{"rows": []}');
  });
});

/* ---------------------------------------------------------------- the transport */

interface Behaviour {
  requests: Array<{ method: string; path: string; sent: number }>;
  failOnce: string | null;
  dropOnce: string | null;
  refuseBase64: boolean;
  rateLimit: boolean;
  unborn: boolean;
}

/**
 * The smallest server that answers the four endpoints, over a socket.
 *
 * The bodies are fixtures rather than git objects: this file asks what the *recorder* wrote
 * about a request, so the answer only has to be an answer -- its content is
 * `publish.test.ts`'s subject, where the server writes real objects.
 */
async function api() {
  const behaviour: Behaviour = { requests: [], failOnce: null, dropOnce: null, refuseBase64: false, rateLimit: false, unborn: false };
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks);
      const key = `${request.method} ${new URL(request.url ?? '/', 'http://127.0.0.1').pathname}`;
      behaviour.requests.push({ method: request.method ?? '', path: key.slice(key.indexOf(' ')), sent: raw.length });
      const send = (status: number, payload: unknown) => {
        const text = JSON.stringify(payload);
        response.writeHead(status, {
          'content-type': 'application/json',
          ...(behaviour.rateLimit ? { 'x-ratelimit-remaining': '4999' } : {}),
        });
        response.end(text);
      };
      if (behaviour.dropOnce === key.split(' ')[0]) {
        behaviour.dropOnce = null;
        request.socket.destroy();
        return;
      }
      if (behaviour.unborn && key.startsWith('GET /repos/owner/repo/git/ref/')) {
        return send(404, { message: 'Not Found' });
      }
      if (behaviour.failOnce !== null && key.startsWith(behaviour.failOnce)) {
        behaviour.failOnce = null;
        return send(500, { message: 'the API is having a moment' });
      }
      if (key.startsWith('GET /repos/owner/repo/git/ref/')) {
        return send(200, { object: { sha: 'd'.repeat(40) } });
      }
      const body = raw.length === 0 ? null : JSON.parse(raw.toString('utf8'));
      if (key.startsWith('POST /repos/owner/repo/git/blobs')) {
        if (behaviour.refuseBase64 && body.encoding === 'base64') return send(400, { message: 'malformed request' });
        return send(201, { sha: 'b'.repeat(40) });
      }
      return send(201, { sha: 'c'.repeat(40) });
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    behaviour,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** A transport wired to that server, with a recorder and no real backoff. */
function transportFor(base: string, rows: unknown[]) {
  return githubTransport({
    token: 'test-token',
    owner: 'owner',
    repo: 'repo',
    api: base,
    sleep: () => Promise.resolve(),
    record: (one: unknown) => rows.push(one),
  });
}

describe('what the transport hands the recorder', () => {
  it('records one row per request, with the answer the server actually gave', async () => {
    const server = await api();
    const rows: Array<Record<string, unknown>> = [];
    try {
      const transport = transportFor(server.base, rows);
      await transport.head('main');
    } finally {
      await server.close();
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: 'GET', path: '/git/ref/heads/main', attempt: 1, status: 200 });
    expect(rows[0].sent).toBe(0);
    expect(rows[0].received).toBeGreaterThan(0);
    expect(rows[0].ms).toBeGreaterThanOrEqual(0);
  });

  it('records the second attempt separately when a 500 clears on retry', async () => {
    const server = await api();
    server.behaviour.failOnce = 'POST /repos/owner/repo/git/commits';
    const rows: Array<Record<string, unknown>> = [];
    try {
      const transport = transportFor(server.base, rows);
      await transport.createCommit({ message: 'm', tree: 't', parents: [], author: { name: 'a', email: 'a@b', date: 'now' }, committer: { name: 'a', email: 'a@b', date: 'now' } });
    } finally {
      await server.close();
    }
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ method: 'POST', path: '/git/commits', attempt: 1, status: 500 });
    expect(rows[1]).toMatchObject({ method: 'POST', path: '/git/commits', attempt: 2, status: 201 });
    expect(rows[1].at as number).toBeGreaterThanOrEqual(rows[0].at as number);
  });

  it('records a socket that closed as an unanswered attempt, with the code the retry reads', async () => {
    const server = await api();
    server.behaviour.dropOnce = 'GET';
    const rows: Array<Record<string, unknown>> = [];
    try {
      const transport = transportFor(server.base, rows);
      await transport.head('main');
    } finally {
      await server.close();
    }
    expect(rows).toHaveLength(2);
    const [first, second] = rows;
    expect(first.status).toBeNull();
    const error = first.error as { code: string | null; message: string };
    expect(typeof error.message).toBe('string');
    expect(error.code === null || /^(UND_ERR_|ECONNRESET|EPIPE)/.test(error.code)).toBe(true);
    expect(second).toMatchObject({ attempt: 2, status: 200 });
  });

  it('records the utf-8 fallback as a second call with a smaller body, not as a retry', async () => {
    const server = await api();
    server.behaviour.refuseBase64 = true;
    const rows: Array<Record<string, unknown>> = [];
    try {
      const transport = transportFor(server.base, rows);
      await transport.createTree({ base: null, entries: [{ path: 'a.txt', mode: '100644', type: 'blob', sha: 'a'.repeat(40) }], blobs: new Map([['a'.repeat(40), Buffer.from('a text body long enough to differ in length\n')]]) });
    } finally {
      await server.close();
    }
    const blobs = rows.filter((one) => one.path === '/git/blobs');
    expect(blobs).toHaveLength(2);
    expect(blobs[0]).toMatchObject({ status: 400, attempt: 1 });
    expect(blobs[1]).toMatchObject({ status: 201, attempt: 1 });
    expect(blobs[0].sent as number).toBeGreaterThan(blobs[1].sent as number);
  });

  it('records the rate limit the API reported, and omits it when the API said nothing', async () => {
    const quiet = await api();
    const rows: Array<Record<string, unknown>> = [];
    try {
      const transport = transportFor(quiet.base, rows);
      await transport.head('main');
    } finally {
      await quiet.close();
    }
    expect('remaining' in rows[0]).toBe(false);

    const throttled = await api();
    throttled.behaviour.rateLimit = true;
    const second: Array<Record<string, unknown>> = [];
    try {
      const transport = transportFor(throttled.base, second);
      await transport.head('main');
    } finally {
      await throttled.close();
    }
    expect(second[0].remaining).toBe(4999);
  });

  it('reads the same error field the retry rule reads, so the two cannot disagree', () => {
    const socket = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_SOCKET' } });
    expect(isNetworkFailure(socket)).toBe(true);
    expect(failureCode(socket)).toBe('UND_ERR_SOCKET');
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(isNetworkFailure(refused)).toBe(false);
    expect(failureCode(refused)).toBe('ECONNREFUSED');
    expect(failureCode('a string is not an error')).toBeNull();
  });

  it('records nothing when no recorder is wired, and the push is unchanged', async () => {
    const server = await api();
    try {
      const transport = githubTransport({ token: 't', owner: 'owner', repo: 'repo', api: server.base, sleep: () => Promise.resolve() });
      const head = await transport.head('main');
      expect(head).toEqual({ sha: 'd'.repeat(40) });
    } finally {
      await server.close();
    }
  });
});

/* ----------------------------------------------------------------------- the CLI */

describe('the command line that keeps the reading', () => {
  const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'publish-cli.mjs');

  /**
   * Spawned asynchronously on purpose: the server that answers it lives in this process,
   * and a synchronous spawn would block the event loop that has to answer -- a deadlock
   * that looks like a timeout and has nothing to do with the channel.
   */
  function run(args: string[], env: Record<string, string> = {}) {
    return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolvePromise) => {
      const child = spawn(process.execPath, [CLI, ...args], {
        env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '', ...env },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
      child.on('close', (status) => resolvePromise({ status, stdout, stderr }));
    });
  }

  function repositoryFor(name: string): string {
    const root = scratch(name);
    git(root, ['init', '-q', '-b', 'main', '.']);
    writeFileSync(join(root, 'a.txt'), 'a\n', 'utf8');
    git(root, ['add', '--', 'a.txt']);
    git(root, ['commit', '-q', '-m', 'first']);
    return root;
  }

  it('refuses --record with a transport that makes no request', async () => {
    const result = await run(['--rev', 'HEAD', '--branch', 'main', '--transport', 'local', '--remote', '/tmp/x', '--record', join(SCRATCH, 'refused.json')]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('the local transport makes no request to record');
  });

  it('writes one row per request a dry run made, and prints the summary beside the plan', async () => {
    const root = repositoryFor('cli-repo');
    const server = await api();
    server.behaviour.unborn = true;
    const file = join(scratch('cli-record'), 'readings.json');
    const result = await run(
      ['--rev', 'HEAD', '--branch', 'main', '--repo', 'owner/repo', '--root', root, '--api', server.base, '--record', file, '--dry-run', '--no-gate'],
      { GITHUB_TOKEN: 'test-token' },
    );
    await server.close();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('nothing was created');
    expect(result.stdout).toContain('publish-readings: 1 request(s)');
    const rows = JSON.parse(readFileSync(file, 'utf8'));
    expect(readingErrors(rows)).toEqual([]);
    expect(rows[0]).toMatchObject({ method: 'GET', path: '/git/ref/heads/main', attempt: 1, status: 404 });
  });

  it('appends to a history that already holds another push', async () => {
    const root = repositoryFor('cli-append');
    const server = await api();
    server.behaviour.unborn = true;
    const file = join(scratch('cli-append-record'), 'readings.json');
    writeFileSync(file, `${JSON.stringify([{ at: 1, method: 'GET', path: '/git/ref/heads/main', attempt: 1, status: 404, ms: 1, sent: 0, received: 2 }], null, 2)}\n`, 'utf8');
    const result = await run(
      ['--rev', 'HEAD', '--branch', 'main', '--repo', 'owner/repo', '--root', root, '--api', server.base, '--record', file, '--dry-run', '--no-gate'],
      { GITHUB_TOKEN: 'test-token' },
    );
    await server.close();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('2 row(s) in');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(2);
  });

  it('says the reading could not be written, and exits non-zero, after the push it recorded', async () => {
    const root = repositoryFor('cli-unwritable');
    const server = await api();
    server.behaviour.unborn = true;
    const result = await run(
      ['--rev', 'HEAD', '--branch', 'main', '--repo', 'owner/repo', '--root', root, '--api', server.base, '--record', join(SCRATCH, 'no-such-directory', 'readings.json'), '--dry-run', '--no-gate'],
      { GITHUB_TOKEN: 'test-token' },
    );
    await server.close();

    // The two facts are separate and both are printed: the plan was made, and the record of
    // making it was not written. One exit code stands for the failure of the reading, and
    // the line above it says which part succeeded.
    expect(result.stdout).toContain('nothing was created');
    expect(result.stdout).toContain('RECORD FAILED');
    expect(result.status).toBe(1);
  });
});

/* ---------------------------------------------------------------- the reader */

describe('the reader a gate runs', () => {
  const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'publish-readings-cli.mjs');

  function read(args: string[]) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  }

  it('prints the summary and a verdict for a file it can read', () => {
    const file = join(scratch('reader-ok'), 'readings.json');
    writeFileSync(file, `${JSON.stringify([row({ at: 1, status: 200, ms: 7 })], null, 2)}\n`, 'utf8');
    const result = read(['--file', file, '--check']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('publish-readings: OK (1 row(s)');
    expect(result.stdout).toContain('slowest POST /git/blobs 7 ms');
  });

  it('refuses a file that holds no readings, and names the file it read', () => {
    const file = join(scratch('reader-empty'), 'readings.json');
    writeFileSync(file, '[]\n', 'utf8');
    const result = read(['--file', file, '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nothing on this channel has ever been measured');
    expect(result.stderr).toContain('FAILED');
  });

  it('refuses --file with no value, and an argument it does not know', () => {
    const missing = read(['--file']);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('--file needs a path');
    expect(missing.stderr).toContain('usage: publish-readings-cli.mjs');

    const unknown = read(['--frobnicate']);
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain("unknown argument '--frobnicate'");
  });

  it('names the path when the file is not there, rather than passing on a question it did not ask', () => {
    const file = join(scratch('reader-missing'), 'absent.json');
    const result = read(['--file', file, '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
    expect(result.stderr).toContain('cannot read');
  });
});
