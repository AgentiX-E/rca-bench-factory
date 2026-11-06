import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
 * ## Why a push is a fixture and not a length
 *
 * v3.56 kept a flat list of rows, and the file it wrote held **five** pushes -- a reader
 * could count requests, retries and unanswered attempts and could not say how many pushes
 * they belonged to. The open list then described the file as one round deep, which was
 * wrong in the direction that matters: it was five deep and unreadable. So a push is now a
 * thing in the file, `{ rev, branch, rows }`, and every fixture below is one.
 *
 * ## The two questions, kept apart
 *
 * `readingErrors` asks whether a file is a record of pushes at all; it cannot ask whether
 * the numbers in it are true, and says so in the module's own docstring. The transport
 * tests ask the other question -- that what a request did is what got written -- by
 * comparing the row against the server's own account of the request it answered.
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

const SHA = 'a'.repeat(40);

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
  return { at: 1100, method: 'POST', path: '/git/blobs', attempt: 1, status: 201, ms: 12, sent: 40, received: 55, ...over };
}

/**
 * The row every push begins with.
 *
 * `publish()` asks the remote for the branch before it decides anything, so the first
 * request of a push is that read, and the file uses it as the boundary between pushes. A
 * fixture meant to be a push has to start here or it is not one.
 */
function head(over: Record<string, unknown> = {}) {
  return { at: 1000, method: 'GET', path: '/git/ref/heads/main', attempt: 1, status: 200, ms: 4, sent: 0, received: 55, ...over };
}

/** A push that passes every check, so a test can spoil exactly one thing about it. */
function push(over: Record<string, unknown> = {}) {
  return { rev: SHA, branch: 'main', rows: [head()], ...over };
}

/** A push whose rows are given, so a defect can be placed at a named position. */
function withRows(rows: Array<Record<string, unknown>>) {
  return push({ rows });
}

const PATCH_422 = { at: 1150, method: 'PATCH', path: '/git/refs/heads/main', attempt: 1, status: 422, ms: 9, sent: 20, received: 40 };

/* ------------------------------------------------------------- the file itself */

describe('the checks a readings file has to satisfy', () => {
  it('accepts a file of ordinary pushes', () => {
    expect(readingErrors([push(), push({ rev: null, rows: [head({ at: 5000 })] })])).toEqual([]);
  });

  it('refuses a file that is not a list, because a reader cannot walk it', () => {
    expect(readingErrors({ pushes: [] })).toHaveLength(1);
  });

  it('refuses an empty list, because a reading of nothing is not a reading', () => {
    const problems = readingErrors([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('nothing on this channel has ever been measured');
  });

  it('refuses a file of bare rows and says what a row is missing', () => {
    // The v3.56 shape. It is refused rather than upgraded, because a row on its own does
    // not say which push produced it, and a reader that guessed would be inventing the one
    // fact this round added.
    const problems = readingErrors([row()]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('is a row, not a push');
    expect(problems[0]).toContain('does not say which push it belonged to');
  });
});

/* ------------------------------------------------------------------ one push */

describe('the checks one push has to satisfy', () => {
  it('refuses a push that is not an object', () => {
    expect(readingErrors([[head()]])[0]).toContain('is not an object');
  });

  it('refuses a push with no rev field, so a tip nobody named differs from a forgotten field', () => {
    const { rev: _rev, ...withoutRev } = push();
    void _rev;
    expect(readingErrors([withoutRev])[0]).toContain('has no `rev` field');
  });

  it('accepts a null rev, because a push older than this field has no tip to name', () => {
    expect(readingErrors([push({ rev: null })])).toEqual([]);
  });

  it('refuses a rev that is neither a commit SHA nor null', () => {
    expect(readingErrors([push({ rev: 'HEAD' })])[0]).toContain('neither a 40-character commit SHA nor null');
    expect(readingErrors([push({ rev: 'A'.repeat(40) })])[0]).toContain('neither a 40-character commit SHA nor null');
  });

  it('refuses a branch name that is empty or carries whitespace', () => {
    expect(readingErrors([push({ branch: '' })])[0]).toContain('not a branch name');
    expect(readingErrors([push({ branch: 'ma in' })])[0]).toContain('not a branch name');
  });

  it('refuses a push with no rows, because a push that made no request is not one', () => {
    expect(readingErrors([push({ rows: [] })])[0]).toContain('made no request');
    expect(readingErrors([push({ rows: null })])[0]).toContain('made no request');
  });
});

/* ------------------------------------------------------------------- one row */

describe('the checks a row inside a push has to satisfy', () => {
  it('accepts an ordinary second row', () => {
    expect(readingErrors([withRows([head(), row()])])).toEqual([]);
  });

  it('refuses a status outside 100..599 rather than treating it as an answer', () => {
    expect(readingErrors([withRows([head(), row({ status: 42 })])])[0]).toContain('not an HTTP status');
  });

  it('refuses a row with no status field, so a missing answer and a forgotten field differ', () => {
    const { status: _status, ...withoutStatus } = row();
    void _status;
    expect(readingErrors([withRows([head(), withoutStatus])])[0]).toContain('has no `status` field');
  });

  it('refuses an answer that also carries an error', () => {
    expect(readingErrors([withRows([head(), row({ error: { code: 'X', message: 'a failure' } })])])[0]).toContain('both a status and an error');
  });

  it('refuses an unanswered attempt with no error, because that row says nothing happened', () => {
    expect(readingErrors([withRows([head(), row({ status: null })])])[0]).toContain('neither answered nor failed');
  });

  it('refuses an error with no message', () => {
    expect(readingErrors([withRows([head(), row({ status: null, error: { code: 'UND_ERR_SOCKET', message: '' } })])])[0]).toContain('no message');
  });

  it('refuses an error code that is not a string, because the retry rule reads strings', () => {
    expect(readingErrors([withRows([head(), row({ status: null, error: { code: 7, message: 'refused' } })])])[0]).toContain('neither a string nor null');
  });

  it('accepts an unanswered attempt whose error names no code', () => {
    expect(readingErrors([withRows([head(), row({ status: null, error: { code: null, message: 'fetch failed' } })])])).toEqual([]);
  });

  it('refuses a timestamp that runs backwards inside one push', () => {
    expect(readingErrors([withRows([head(), row({ at: 2000, path: '/git/trees' }), row({ at: 1999 })])])[0]).toContain('before the row above it');
  });

  it('refuses a second attempt whose first attempt is not above it', () => {
    expect(readingErrors([withRows([head(), row({ status: 500, attempt: 3 })])])[0]).toContain('needs its own first attempt');
  });

  it('refuses a second attempt of a different request', () => {
    expect(readingErrors([withRows([head(), row({ path: '/git/blobs' }), row({ at: 1200, path: '/git/trees', status: 500, attempt: 2 })])])[0]).toContain('needs its own first attempt');
  });

  it('accepts a retry that follows its own first attempt', () => {
    expect(readingErrors([withRows([head(), row({ status: 500 }), row({ at: 2000, attempt: 2 })])])).toEqual([]);
  });

  it('accepts two separate calls to one endpoint, each starting from attempt 1', () => {
    // The utf-8 fallback is exactly this shape: one call, then another call with a
    // different body, and both are attempt 1 because neither is a retry of the other.
    expect(readingErrors([withRows([head(), row({ status: 400 }), row({ at: 1200, sent: 20 })])])).toEqual([]);
  });

  it('refuses a negative duration and a fractional byte count', () => {
    expect(readingErrors([withRows([head(), row({ ms: -1 })])]).length).toBeGreaterThan(0);
    expect(readingErrors([withRows([head(), row({ sent: 1.5 })])]).length).toBeGreaterThan(0);
  });

  it('refuses a rate limit that is not a whole number, because it is acted on', () => {
    expect(readingErrors([withRows([head(), row({ remaining: 'lots' })])])[0]).toContain('`remaining`');
  });
});

/* ---------------------------------------------------------- the push boundary */

describe('the row that says where one push ends', () => {
  it('refuses a push that does not begin by reading its branch', () => {
    const problems = readingErrors([withRows([row({ method: 'POST', path: '/git/blobs' })])]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('begins with POST /git/blobs');
    expect(problems[0]).toContain('GET /git/ref/heads/main');
    expect(problems[0]).toContain('where one push ends and the next begins');
  });

  it('refuses a push whose first row reads a different branch', () => {
    const problems = readingErrors([withRows([head({ path: '/git/ref/heads/release' })])]);
    expect(problems[0]).toContain('GET /git/ref/heads/main');
  });

  it('refuses a push that begins with the second attempt of that read', () => {
    // Its first attempt is in a push the file does not hold, so the retry count this file
    // reports would be missing a row it must have had.
    const problems = readingErrors([withRows([head({ attempt: 2 })])]);
    expect(problems[0]).toContain('begins with attempt 2');
    expect(problems[0]).toContain('belongs to a push the file does not hold');
  });

  it('accepts a retry of the branch read that is not the first row', () => {
    expect(readingErrors([withRows([head({ status: 500 }), head({ at: 1100, attempt: 2 })])])).toEqual([]);
  });

  it('refuses two pushes folded into one, and names the row the second push began at', () => {
    // The defect the whole round is about: a flat list of rows swallowed the boundary, and
    // a reader could not tell five pushes from one.
    const problems = readingErrors([withRows([head(), row(), head({ at: 9000 })])]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('row 3');
    expect(problems[0]).toContain('reads the branch a second time');
    expect(problems[0]).toContain('this file began a new push there');
  });

  it('accepts a second branch read that a refused ref update asked for', () => {
    // `updateRef` answers a 422 by re-reading the branch to say what the remote moved to.
    // That read is the channel's own behaviour, so a rule that refused it would refuse a
    // push for being recorded correctly.
    expect(readingErrors([withRows([head(), row(), PATCH_422, head({ at: 1200, status: 200 })])])).toEqual([]);
  });

  it('accepts the ref listing a 404 on the branch read asks for, and does not read it as a second read', () => {
    // The shape a mistyped branch leaves: the branch read answers 404 and the push asks
    // what the repository does hold. It is a different path from the branch read, and a
    // rule that matched on a prefix would have counted it as the second push it is not.
    const listing = { at: 1050, method: 'GET', path: '/git/refs?per_page=100', attempt: 1, status: 200, ms: 6, sent: 0, received: 300 };
    expect(readingErrors([withRows([head({ status: 404 }), listing])])).toEqual([]);
  });

  it('refuses a push that starts before the push above it ended', () => {
    const problems = readingErrors([push({ rows: [head({ at: 9000 })] }), push({ rev: null, rows: [head({ at: 8999 })] })]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('push 2 starts 1 ms before push 1 ended');
  });

  it('accepts two pushes recorded back to back', () => {
    expect(readingErrors([push({ rows: [head({ at: 1000 })] }), push({ rev: null, rows: [head({ at: 1000 })] })])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ the summary */

describe('the sentence a readings file earns', () => {
  it('counts retries rather than rows, so one retry is not reported as two', () => {
    const summary = summariseReadings([withRows([head(), row({ at: 1, status: 500 }), row({ at: 2, attempt: 2 }), row({ at: 3, attempt: 3 })])]);
    expect(summary.total).toBe(4);
    expect(summary.retried).toBe(2);
  });

  it('orders the statuses numerically and puts the unanswered last', () => {
    const summary = summariseReadings([
      withRows([
        head({ at: 1 }),
        row({ at: 2, status: 500 }),
        row({ at: 3, status: null, error: { code: 'UND_ERR_SOCKET', message: 'closed' } }),
        row({ at: 4, method: 'GET', path: '/git/trees/x', status: 200 }),
      ]),
    ]);
    expect(summary.statuses.map((one) => one.status)).toEqual(['200', '500', 'no-answer']);
    expect(summary.unanswered).toBe(1);
  });

  it('names the slowest request, not the slowest attempt of a request', () => {
    const summary = summariseReadings([
      withRows([head({ ms: 12 }), row({ at: 2, method: 'PATCH', path: '/git/refs/heads/main', status: 200, ms: 2410 })]),
    ]);
    expect(summary.slowest).toEqual({ method: 'PATCH', path: '/git/refs/heads/main', ms: 2410 });
  });

  it('prints one line that carries every number it counted', () => {
    const line = formatSummary(summariseReadings([withRows([head({ status: 200, ms: 2401 })])]));
    expect(line).toContain('1 push(es)');
    expect(line).toContain('1 with a named tip');
    expect(line).toContain('1 request(s)');
    expect(line).toContain('0 retried');
    expect(line).toContain('1 answered');
    expect(line).toContain('0 unanswered');
    expect(line).toContain('slowest GET /git/ref/heads/main 2401 ms');
    expect(line).toContain('statuses 200x1');
  });

  it('says nothing was measured rather than naming a slowest request of none', () => {
    expect(formatSummary(summariseReadings([]))).toContain('nothing was measured');
  });

  it('breaks a file of several pushes into one line each, with its own latency', () => {
    const summary = summariseReadings([
      withRows([head({ at: 1, ms: 4 }), row({ at: 2, ms: 2100 })]),
      withRows([head({ at: 9000, ms: 5 }), row({ at: 9001, ms: 29632 })]),
    ]);
    expect(summary.pushes).toBe(2);
    expect(summary.per.map((one) => one.total)).toEqual([2, 2]);
    expect(summary.per.map((one) => one.slowest?.ms)).toEqual([2100, 29632]);
    const lines = formatSummary(summary).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('push 1/2');
    expect(lines[1]).toContain('slowest POST /git/blobs 2100 ms');
    expect(lines[2]).toContain('push 2/2');
    expect(lines[2]).toContain('slowest POST /git/blobs 29632 ms');
  });

  it('names a tip it does not have as none rather than as an empty string', () => {
    const lines = formatSummary(summariseReadings([push(), push({ rev: null, rows: [head({ at: 5000 })] })])).split('\n');
    expect(lines[1]).toContain(`rev=${SHA.slice(0, 9)}`);
    expect(lines[2]).toContain('rev=none');
    expect(summariseReadings([push({ rev: null })])).toMatchObject({ named: 0 });
  });
});

/* ------------------------------------------------------------------- the history */

describe('appending to the history', () => {
  it('creates the file when there is no history yet', () => {
    const file = join(scratch('append-new'), 'readings.json');
    expect(appendReadings(file, push())).toHaveLength(1);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
  });

  it('appends rather than replacing, so the day the socket closed is still there', () => {
    const file = join(scratch('append-old'), 'readings.json');
    appendReadings(file, push({ rows: [head({ at: 1 })] }));
    appendReadings(file, push({ rev: null, rows: [head({ at: 2 })] }));
    const pushes = JSON.parse(readFileSync(file, 'utf8'));
    expect(pushes.map((one: { rows: Array<{ at: number }> }) => one.rows[0].at)).toEqual([1, 2]);
  });

  it('appends a second push of the same revision, because a retried push is a push', () => {
    const file = join(scratch('append-same-rev'), 'readings.json');
    appendReadings(file, push({ rows: [head({ at: 1 })] }));
    appendReadings(file, push({ rows: [head({ at: 2 })] }));
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(2);
  });

  it('refuses to append a push that made no request, and leaves the file untouched', () => {
    const file = join(scratch('append-empty'), 'readings.json');
    appendReadings(file, push());
    const before = readFileSync(file, 'utf8');
    expect(() => appendReadings(file, push({ rows: [] }))).toThrow(/made no request/);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('refuses to append to a file that is not JSON, and leaves it untouched', () => {
    const file = join(scratch('append-bad'), 'readings.json');
    writeFileSync(file, 'not json at all', 'utf8');
    expect(() => appendReadings(file, push())).toThrow(/would replace it/);
    expect(readFileSync(file, 'utf8')).toBe('not json at all');
  });

  it('refuses to append to a JSON document that is not a list', () => {
    const file = join(scratch('append-object'), 'readings.json');
    writeFileSync(file, '{"pushes": []}', 'utf8');
    expect(() => appendReadings(file, push())).toThrow(/not an array/);
    expect(readFileSync(file, 'utf8')).toBe('{"pushes": []}');
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
      // The listing a 404 on the branch read asks for, and the only route whose path is a
      // prefix of another: `/git/refs` does not begin with `/git/ref/`, so it has to be
      // answered before the branch-read branches below rather than after them.
      if (key === 'GET /repos/owner/repo/git/refs') {
        return send(200, []);
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
      const headRead = await transport.head('main');
      expect(headRead).toEqual({ sha: 'd'.repeat(40) });
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

  it('writes one push carrying the revision it resolved, and prints the summary beside the plan', async () => {
    const root = repositoryFor('cli-repo');
    const revision = git(root, ['rev-parse', 'HEAD']).trim();
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
    expect(result.stdout).toContain('publish-readings: 1 push(es)');
    expect(result.stdout).toContain('1 with a named tip');
    // Two requests, not one: the 404 on the branch read is followed by the listing that
    // says whether the branch is new or the name is wrong, and the recording counts the
    // question as well as the answer. A summary that said "1 request" here would be a
    // number taken from before the channel learned to ask.
    expect(result.stdout).toContain('2 request(s)');
    expect(result.stdout).toContain('(1 push(es) in');
    const pushes = JSON.parse(readFileSync(file, 'utf8'));
    expect(readingErrors(pushes)).toEqual([]);
    expect(pushes[0]).toMatchObject({ rev: revision, branch: 'main' });
    expect(pushes[0].rows[0]).toMatchObject({ method: 'GET', path: '/git/ref/heads/main', attempt: 1, status: 404 });
    expect(pushes[0].rows[1]).toMatchObject({ method: 'GET', path: '/git/refs?per_page=100', attempt: 1, status: 200 });
  });

  it('appends to a history that already holds another push, and counts both', async () => {
    const root = repositoryFor('cli-append');
    const server = await api();
    server.behaviour.unborn = true;
    const file = join(scratch('cli-append-record'), 'readings.json');
    writeFileSync(file, `${JSON.stringify([{ rev: null, branch: 'main', rows: [head({ at: 1, status: 404 })] }], null, 2)}\n`, 'utf8');
    const result = await run(
      ['--rev', 'HEAD', '--branch', 'main', '--repo', 'owner/repo', '--root', root, '--api', server.base, '--record', file, '--dry-run', '--no-gate'],
      { GITHUB_TOKEN: 'test-token' },
    );
    await server.close();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('2 push(es) in');
    const pushes = JSON.parse(readFileSync(file, 'utf8'));
    expect(pushes).toHaveLength(2);
    expect(readingErrors(pushes)).toEqual([]);
  });

  it('records nothing when no request was made, rather than an empty push', async () => {
    const root = repositoryFor('cli-nothing');
    const file = join(scratch('cli-nothing-record'), 'readings.json');
    const result = await run(
      ['--rev', 'no-such-revision', '--branch', 'main', '--repo', 'owner/repo', '--root', root, '--api', 'http://127.0.0.1:1', '--record', file, '--dry-run', '--no-gate'],
      { GITHUB_TOKEN: 'test-token' },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('no request was made, so nothing was recorded');
    expect(existsSync(file)).toBe(false);
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
    writeFileSync(file, `${JSON.stringify([withRows([head({ status: 200, ms: 7 })])], null, 2)}\n`, 'utf8');
    const result = read(['--file', file, '--check']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('publish-readings: 1 push(es)');
    expect(result.stdout).toContain('slowest GET /git/ref/heads/main 7 ms');
    expect(result.stdout).toContain('publish-readings: OK (1 push(es), 1 row(s)');
  });

  it('refuses a file that holds no readings, and names the file it read', () => {
    const file = join(scratch('reader-empty'), 'readings.json');
    writeFileSync(file, '[]\n', 'utf8');
    const result = read(['--file', file, '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nothing on this channel has ever been measured');
    expect(result.stderr).toContain('FAILED');
  });

  it('refuses the flat list of rows a previous round wrote, and says what is missing', () => {
    const file = join(scratch('reader-flat'), 'readings.json');
    writeFileSync(file, `${JSON.stringify([row()], null, 2)}\n`, 'utf8');
    const result = read(['--file', file, '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is a row, not a push');
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
