import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The battery's report has to reach a channel that carries content, not just metadata.
 *
 * ## The three channels, measured
 *
 * Finding 86 found the gate-test battery's CI failure unreadable because the job
 * log is unreachable from this project's environment: `GET /actions/jobs/{id}/logs`
 * 302s to `productionresultssa*.blob.core.windows.net` and the proxy refuses the
 * connection (`http=000`). Writing the report to a file and uploading it with
 * `actions/upload-artifact` moved the problem rather than solving it -- the next
 * run showed the artifact **listed** (1152 bytes, `id=10934848175`) and the
 * `zip` endpoint 302ing to the same blocked host. Metadata reachable, content not:
 *
 * | channel | metadata | content |
 * | --- | --- | --- |
 * | job log | n/a | blocked (finding 55) |
 * | artifact | listed | blocked (`blob.core.windows.net`) |
 * | check-run output | empty without `checks:write` | n/a |
 * | **git object** | reachable | **reachable** |
 *
 * Git objects are the one channel that is both, because `api.github.com` serves
 * them itself: `GET /repos/{o}/{r}/contents/{path}?ref={branch}` returns the bytes
 * base64-encoded in the response. Verified before writing this file -- the script
 * published a report to a scratch `ci-reports` branch and both `HEAD` and the
 * report came back byte-exact through the API from inside this environment.
 *
 * ## What this file asserts
 *
 * Not that a branch exists -- existence is satisfied by a branch nobody updates.
 * The properties that make the channel usable are: the report is published from
 * the file the battery wrote, the branch is not `master`, a missing report is a
 * clean skip rather than a crash, and **a publish that was attempted and failed
 * is reported as a failure**.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'publish-battery-report.py');
const SOURCE = readFileSync(SCRIPT, 'utf8');

/**
 * The budget for a test that spawns the publish script with a token.
 *
 * ## The measurement this exists for
 *
 * Two tests in this file pass `GITHUB_TOKEN: 'not-a-real-token'`, so the child
 * reads the report, decides to publish, and makes a real HTTPS call to
 * `api.github.com` -- which answers 403, because the token is not real. The
 * spawn itself is allowed 60 s (`run`'s own `timeout`), but the **vitest test**
 * around it was left at the 5000 ms default, and under load the child does not
 * finish inside it:
 *
 *     FAIL  publish-battery-report.test.ts > a publish that was attempted and
 *           failed exits non-zero
 *     Error: Test timed out in 5000ms.
 *
 * Measured standalone, per test: 997 ms, 1390 ms, 2391 ms -- all inside the
 * default, which is why the file read as sound. The failure is a property of the
 * *suite*, not of the file: this container is throttled to 4 CPUs while reporting
 * 32 (`cpu.max = 400000/100000`, and `nr_throttled` 4885 of 20181 periods), so
 * an in-suite cost inflates well past its standalone one. `timeout-budget.test.ts`
 * measures that inflation at up to 3.1x and holds the standalone table for the
 * files that need it.
 *
 * ## Why 60 s and not "whatever passes"
 *
 * The child's own budget is 60 s, so a test budget below that would report a
 * timeout for a child that was still working -- a verdict about the harness
 * rather than about the script. Matching the two means the failure a reader sees
 * is the script's own exit, which is what the assertion is about.
 */
const NETWORK_TIMEOUT_MS = 60_000;

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-publish-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function run(args: { cwd: string; env?: Record<string, string> }) {
  const proc = spawnSync('python3', [SCRIPT], {
    cwd: args.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...(args.env ?? {}) },
    timeout: 60_000,
  });
  return { status: proc.status, output: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
}

/**
 * The asynchronous form of `run`, for the tests that answer from a loopback server.
 *
 * `spawnSync` blocks this process's event loop for the whole child lifetime, so a
 * server living in this process can never accept the connection: both sides wait
 * until the child's own 60 s timeout and the test reports a timeout for a script
 * that was working. `fetch-official.test.ts` measured that deadlock (the
 * synchronous form timed out after 10 s against a server that had just answered
 * asynchronously in 22 ms) before writing it down; this is the same helper shape.
 */
function runAsync(args: {
  cwd: string;
  env: Record<string, string>;
}): Promise<{ status: number | null; output: string }> {
  return new Promise((done) => {
    const child = spawn('python3', [SCRIPT], {
      cwd: args.cwd,
      env: { ...process.env, ...args.env },
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (output += chunk));
    child.stderr.on('data', (chunk: string) => (output += chunk));
    child.on('close', (status) => done({ status, output }));
  });
}

interface Recorded {
  method: string;
  path: string;
  body: string;
}

interface Answer {
  status: number;
  json?: unknown;
  text?: string;
  /**
   * Close the socket before writing any response line.
   *
   * This is the third class of failure and the only one with no status at all:
   * `urllib` raises an `OSError` rather than an `HTTPError`, so the retry
   * decision is made without a code. A stand-in can only produce it by refusing
   * to answer, which is what this field is for.
   */
  hangUp?: boolean;
}

/**
 * A loopback stand-in for the endpoints `publish-battery-report.py` calls.
 *
 * ## Why a server rather than a patched `urlopen`
 *
 * The failure being characterised *is the transport answering 500*. A fake that
 * raised in place of `urlopen` would test the wrong thing: it would never
 * construct an `HTTPError`, so it would carry no status, and the branch that
 * decides whether a status is worth retrying would never run. A loopback server
 * produces the real exception from the real stack, and `check-no-mock` stays
 * green because no mocking library is involved.
 *
 * The handler receives the request and **how many requests with that exact
 * method and path came before it**, so a scenario can answer 500 on the first
 * attempt and 201 afterwards without keeping state of its own.
 */
async function serve(
  answer: (call: Recorded, seen: number) => Answer,
): Promise<{ base: string; calls: Recorded[]; close: () => Promise<void> }> {
  const calls: Recorded[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const call: Recorded = {
        method: request.method ?? '',
        path: request.url ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
      };
      const seen = calls.filter((prior) => prior.method === call.method && prior.path === call.path).length;
      calls.push(call);
      const { status, json, text, hangUp } = answer(call, seen);
      if (hangUp === true) {
        request.socket.destroy();
        return;
      }
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(text ?? JSON.stringify(json ?? {}));
    });
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((closed) => server.close(() => closed())),
  };
}

/** The three object ids a stand-in server hands back, distinct so a mix-up shows. */
const BLOB = 'b'.repeat(40);
const TREE = 'c'.repeat(40);
const COMMIT = 'd'.repeat(40);

/**
 * A directory holding a report the script will decide to publish.
 *
 * Built per test rather than shared: a scenario that fails half-way leaves the
 * file untouched, but a scenario that *succeeds* moves a ref, and the two must
 * not be able to read each other's state.
 */
function withReport(report: Record<string, unknown> = { caught: 3, survived: 0, restore_status: 0 }): string {
  const dir = mkdtempSync(join(scratch, 'report-'));
  writeFileSync(join(dir, 'gate-tests-battery-report.json'), JSON.stringify(report));
  return dir;
}

/** The environment a stand-in scenario needs: no waiting, and a bounded attempt count. */
function against(base: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    GITHUB_TOKEN: 'stand-in-token',
    RCA_BENCH_PUBLISH_API: base,
    RCA_BENCH_PUBLISH_BACKOFF: '0',
    ...extra,
  };
}

describe('scripts · the battery report is published to a channel that carries content', () => {
  it('publishes to git objects rather than to an artifact', () => {
    // The distinction is the whole point: an artifact is *listed* through the API
    // and *downloaded* from a blocked host, so a fix that stops at `upload-artifact`
    // reproduces finding 86 one channel over. Asserted on the endpoints actually
    // called, not on a comment saying so.
    expect(SOURCE).toContain('/git/blobs');
    expect(SOURCE).toContain('/git/trees');
    expect(SOURCE).toContain('/git/commits');
    expect(SOURCE).toContain('api.github.com');
  });

  it('never writes to master', () => {
    // CI output must not be able to land on the branch under review. The report
    // is diagnostic, it is overwritten on every run, and a commit to `master`
    // would put an unreviewed file in the tree every gate reads.
    expect(SOURCE).toMatch(/BRANCH = "ci-reports"/);
    expect(SOURCE).not.toMatch(/refs\/heads\/master/);
    expect(SOURCE).not.toMatch(/"master"/);
  });

  it('skips cleanly when the battery produced no report, and without a token', () => {
    // Both are ordinary states, not failures. Without a token the script must not
    // try to authenticate; without a report it must not publish an empty file,
    // which would make the branch's tip disagree with the run that produced it.
    const noReport = run({ cwd: scratch, env: { GITHUB_TOKEN: '' } });
    expect(noReport.status).toBe(0);
    expect(noReport.output).toMatch(/no GITHUB_TOKEN|nothing to publish/);

    const withToken = run({ cwd: scratch, env: { GITHUB_TOKEN: 'not-a-real-token' } });
    expect(withToken.status).toBe(0);
    expect(withToken.output).toContain('nothing to publish');
  }, NETWORK_TIMEOUT_MS);

  it('a publish that was attempted and failed exits non-zero', () => {
    // **This assertion is the correction of a real CI failure, not a preference.**
    //
    // The first version of this test asserted the opposite -- a real report plus a
    // token that cannot authenticate exits 0 -- reasoned from "a diagnostic channel
    // must not manufacture the failure it was added to explain". The reasoning was
    // sound and the assertion was wrong, and CI showed exactly why: the workflow's
    // `GITHUB_TOKEN` was scoped `contents: read`, the publish answered 403, the
    // handler printed `could not publish the report` and returned 0, and **step 17
    // reported success while no `ci-reports` branch existed**. A green step that
    // published nothing is the same mistake this whole sequence is about -- a
    // channel reporting success while carrying no content -- and an exiting-zero
    // handler is what kept it invisible for a whole run.
    //
    // Failing here cannot flatter the battery: step 16 has already run and its exit
    // code is already recorded, so this exit code cannot turn a red battery green.
    // It reports a broken channel, which is a different fact and must not look green.
    const dir = mkdtempSync(join(scratch, 'report-'));
    writeFileSync(
      join(dir, 'gate-tests-battery-report.json'),
      JSON.stringify({ injections: [], caught: 0, survived: 1, restore_status: 0 }),
    );
    const result = run({ cwd: dir, env: { GITHUB_TOKEN: 'not-a-real-token' } });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/could not publish/);
    expect(result.output).toMatch(/channel is broken/);
  }, NETWORK_TIMEOUT_MS);

  it('the write permission the publish needs is granted, and master is not it', () => {
    // The 403 above was a workflow file, not a code, defect: `permissions:
    // contents: read` at the workflow level means no `GITHUB_TOKEN` in the job can
    // create a ref. Asserted on the shipped workflow because that is the file that
    // was wrong, and the assertion is narrow -- `contents: write` present, no
    // `contents: write` reaching `master`, and the publish step still `if: always()`.
    const workflow = readFileSync(
      resolve(ROOT, '.github', 'workflows', 'ci.yml'),
      'utf8',
    );
    expect(workflow).toMatch(/permissions:\n\s+contents: write/);
    expect(workflow).not.toMatch(/contents: write[\s\S]{0,400}?refs\/heads\/master/);
    expect(workflow).toMatch(
      /- name: Publish the gate-test battery report\n\s+if: always\(\)/,
    );
  });

  it('the summary line is built from the report it is publishing', () => {
    // A summary that is written but not read from the report would print zeroes
    // forever while the JSON said otherwise -- the "computed and never printed"
    // shape from finding 85, inverted. So the builder is asserted to read the
    // report's own fields and both call sites are required.
    const code = SOURCE.replace(/"""[\s\S]*?"""/g, '');
    expect(code).toMatch(/def head_summary\(report/);
    expect(code).toMatch(/report\.get\('caught'/);
    expect(code).toMatch(/summary = head_summary\(report\)/);
    expect(code).toMatch(/json\.loads\(path\.read_text\(\)\)/);
  });
});

describe('scripts · a publish that met one bad answer from the API', () => {
  /**
   * ## What this block was written for, measured
   *
   * CI run 41067634391 on `234fef4b0` failed. Every battery passed -- 25 steps,
   * 28 witnesses -- and then:
   *
   *     could not publish the report: HTTP Error 500: Internal Server Error
   *
   * Two defects in one line, and the second is why the first took a probe to
   * find:
   *
   *  1. **The call is not named.** `HTTP Error 500` says what the answer was and
   *     not which of the six requests got it -- the report blob, the `HEAD` blob,
   *     the tree, the commit, or the ref creation. The script catches
   *     `HTTPError`, and the path exists at the call site but is not carried into
   *     the message. Recovering it took replaying the five calls by hand against
   *     the real API with a PAT, one at a time, to see which one answered 500.
   *
   *  2. **One 500 fails the job, and 500 is the class a retry can fix.** The same
   *     bytes posted from this machine, twenty minutes later: `201` six times out
   *     of six, and `utf-8` six of six. So the report was publishable throughout;
   *     what was not survivable was a single transient answer from the endpoint.
   *     The repository already states the discriminator in
   *     `scripts/fetch-official.mjs`: 4xx is "no amount of retrying will change
   *     that", 5xx is "the one class a retry can legitimately fix". The publish
   *     channel never learned it.
   *
   * ## What a retry must not do
   *
   * Turn a broken channel green. The attempt count is bounded, 4xx is never
   * retried, and exhausting the attempts still exits 1 with the call named -- so
   * an endpoint that is *systematically* unwell stays red, and one that hiccuped
   * once does not. The retries that were needed are printed, so a publish that
   * only succeeded on its third attempt is visible rather than silent.
   */
  it('names the call that failed, not only the status it failed with', async () => {
    // The assertion the failing CI line could not satisfy: a reader of the log has
    // to be able to tell *which* request answered 500 without replaying them.
    //
    // Measured while writing it: the first version of this test asserted that the
    // output *somewhere* contained `POST /git/blobs`, and that version passed with
    // the path deleted from `ChannelFailure` -- because the retry line above the
    // failure carries the method and the path too. A test that is satisfied by the
    // log line describing the retry says nothing about the line a reader sees when
    // the publish gives up. So the assertion is on **the failure line itself**,
    // selected by its own text, and it also requires the attempt count to be
    // stated there.
    const failing = await serve((call) =>
      call.method === 'GET' ? { status: 404, json: { message: 'Not Found' } } : { status: 500, json: {} },
    );
    try {
      const result = await runAsync({
        cwd: withReport(),
        env: against(failing.base, { RCA_BENCH_PUBLISH_ATTEMPTS: '2' }),
      });
      expect(result.status).toBe(1);
      const failure =
        result.output.split('\n').find((line) => line.includes('could not publish the report')) ?? '';
      expect(failure).toContain('POST /git/blobs');
      expect(failure).toMatch(/\b500\b/);
      expect(failure).toMatch(/after 2 attempt/);
    } finally {
      await failing.close();
    }
  }, NETWORK_TIMEOUT_MS);

  it('a 500 on the first attempt is retried, and the publish completes', async () => {
    // The scenario CI hit, replayed: the first object write answers 500 and every
    // later call is fine. Before the retry existed this exited 1 and published
    // nothing, over a report the endpoint would accept a second later.
    const flaky = await serve((call, seen) => {
      if (call.method === 'GET') return { status: 404, json: { message: 'Not Found' } };
      if (call.path.endsWith('/git/blobs')) {
        return seen === 0 ? { status: 500, json: {} } : { status: 201, json: { sha: BLOB } };
      }
      if (call.path.endsWith('/git/trees')) return { status: 201, json: { sha: TREE } };
      if (call.path.endsWith('/git/commits')) return { status: 201, json: { sha: COMMIT, tree: { sha: TREE } } };
      return { status: 201, json: { ref: 'refs/heads/ci-reports' } };
    });
    try {
      const result = await runAsync({ cwd: withReport(), env: against(flaky.base) });
      expect(result.output).toMatch(/published the report to ci-reports/);
      expect(result.status).toBe(0);

      // The tree must be built from the blob the endpoint accepted, not from an
      // id the retry invented: the publish is only real if the objects link up.
      const tree = flaky.calls.find((call) => call.path.endsWith('/git/trees'));
      expect(tree?.body).toContain(BLOB);

      // And the retry is announced. A publish that needed one is exactly the fact
      // an operator needs when the endpoint starts answering 500 more often.
      expect(result.output).toMatch(/1 retr/);
    } finally {
      await flaky.close();
    }
  }, NETWORK_TIMEOUT_MS);

  it('a 4xx is never retried, because the answer is the answer', async () => {
    // The other half of the discriminator, and the one that keeps the retry from
    // becoming a way to hammer an endpoint that has already said no. Measured on
    // the request count, not on the exit code: a script that retried a 403 four
    // times and then failed would look identical from the outside.
    const refusing = await serve((call) =>
      call.method === 'GET' ? { status: 404, json: { message: 'Not Found' } } : { status: 403, json: { message: 'Forbidden' } },
    );
    try {
      const result = await runAsync({
        cwd: withReport(),
        env: against(refusing.base, { RCA_BENCH_PUBLISH_ATTEMPTS: '4' }),
      });
      expect(result.status).toBe(1);
      expect(refusing.calls.filter((call) => call.path.endsWith('/git/blobs'))).toHaveLength(1);
    } finally {
      await refusing.close();
    }
  }, NETWORK_TIMEOUT_MS);

  it('gives up after the declared number of attempts, and still fails', async () => {
    // The property that keeps the retry honest: an endpoint that is unwell for
    // every attempt ends in the same red step it ended in before, with the count
    // stated. Bounded at three here rather than four so the test does not pay the
    // production budget to observe the same fact.
    const unwell = await serve((call) =>
      call.method === 'GET' ? { status: 404, json: { message: 'Not Found' } } : { status: 500, json: {} },
    );
    try {
      const result = await runAsync({
        cwd: withReport(),
        env: against(unwell.base, { RCA_BENCH_PUBLISH_ATTEMPTS: '3' }),
      });
      expect(result.status).toBe(1);
      expect(unwell.calls.filter((call) => call.path.endsWith('/git/blobs'))).toHaveLength(3);
      const failure =
        result.output.split('\n').find((line) => line.includes('could not publish the report')) ?? '';
      expect(failure).toContain('POST /git/blobs');
      expect(failure).toMatch(/after 3 attempts/);
      expect(result.output).toMatch(/channel is broken/);
    } finally {
      await unwell.close();
    }
  }, NETWORK_TIMEOUT_MS);

  it('retries a connection that closed without an answer, and names the transport', async () => {
    // The third class of failure, and the only one with no status at all: the
    // socket is closed before any response line arrives, so `urllib` raises an
    // `OSError` rather than an `HTTPError`. It must be retried -- a closed
    // connection is not the server's considered answer -- and when every attempt
    // ends that way the refusal has to reach the log naming the call. Without this
    // test the `status is None` arm of `retryable` is unreachable, and a mutation
    // that refuses to retry it survives.
    let drops = 1;
    const closing = await serve((call) => {
      if (call.method === 'GET') return { status: 404, json: { message: 'Not Found' } };
      if (call.path.endsWith('/git/blobs') && drops > 0) {
        drops -= 1;
        return { status: 0, hangUp: true };
      }
      if (call.path.endsWith('/git/blobs')) return { status: 201, json: { sha: BLOB } };
      if (call.path.endsWith('/git/trees')) return { status: 201, json: { sha: TREE } };
      if (call.path.endsWith('/git/commits')) return { status: 201, json: { sha: COMMIT, tree: { sha: TREE } } };
      return { status: 201, json: { ref: 'refs/heads/ci-reports' } };
    });
    try {
      const recovered = await runAsync({ cwd: withReport(), env: against(closing.base) });
      expect(recovered.status).toBe(0);
      expect(recovered.output).toMatch(/1 retr/);
      expect(recovered.output).toMatch(/transport failure/);
    } finally {
      await closing.close();
    }

    // And when it never recovers, the same class of failure is still a red step
    // whose message names the call and the reason rather than a bare traceback.
    const silent = await serve((call) =>
      call.method === 'GET'
        ? { status: 404, json: { message: 'Not Found' } }
        : { status: 0, hangUp: true },
    );
    try {
      const result = await runAsync({
        cwd: withReport(),
        env: against(silent.base, { RCA_BENCH_PUBLISH_ATTEMPTS: '2' }),
      });
      expect(result.status).toBe(1);
      const failure =
        result.output.split('\n').find((line) => line.includes('could not publish the report')) ?? '';
      expect(failure).toContain('POST /git/blobs');
      expect(failure).toMatch(/transport failure/);
    } finally {
      await silent.close();
    }
  }, NETWORK_TIMEOUT_MS);

  it('a 422 about a branch that points somewhere else is still a failure', async () => {
    // The other half of the acceptance above, and the half that keeps it from
    // becoming a way to report success for a publish that went nowhere: a 422 is
    // read as "our own retry made it" only when the branch now points at the commit
    // just built. A stale branch -- another run's, or an older one -- is a genuine
    // conflict, and `ci-reports` would then describe a run other than this one.
    const stale = await serve((call, seen) => {
      if (call.method === 'GET' && call.path.endsWith('/git/ref/heads/ci-reports')) {
        return seen === 0
          ? { status: 404, json: { message: 'Not Found' } }
          : { status: 200, json: { object: { sha: 'e'.repeat(40) } } };
      }
      if (call.method === 'GET') return { status: 404, json: { message: 'Not Found' } };
      if (call.path.endsWith('/git/blobs')) return { status: 201, json: { sha: BLOB } };
      if (call.path.endsWith('/git/trees')) return { status: 201, json: { sha: TREE } };
      if (call.path.endsWith('/git/commits')) return { status: 201, json: { sha: COMMIT, tree: { sha: TREE } } };
      return { status: 422, json: { message: 'Reference already exists' } };
    });
    try {
      const result = await runAsync({ cwd: withReport(), env: against(stale.base) });
      expect(result.status).toBe(1);
      const failure =
        result.output.split('\n').find((line) => line.includes('could not publish the report')) ?? '';
      expect(failure).toContain('/git/refs');
      expect(failure).toMatch(/already exists at e{9}/);
    } finally {
      await stale.close();
    }
  }, NETWORK_TIMEOUT_MS);

  it('takes an already-existing branch that points at this commit as published', async () => {
    // A consequence of the retry, and the reason this test exists rather than
    // being a nicety: if `POST /git/refs` answers 500 *after* creating the ref,
    // the retry is answered `422 Reference already exists` -- about the very ref
    // the previous attempt created. Treating that as a failure would make the
    // retry convert a success into a red step, which is worse than not retrying.
    // It is accepted only when the ref now points at the commit just built.
    const racing = await serve((call, seen) => {
      if (call.method === 'GET' && call.path.endsWith('/git/ref/heads/ci-reports')) {
        return seen === 0
          ? { status: 404, json: { message: 'Not Found' } }
          : { status: 200, json: { object: { sha: COMMIT } } };
      }
      if (call.method === 'GET') return { status: 404, json: { message: 'Not Found' } };
      if (call.path.endsWith('/git/blobs')) return { status: 201, json: { sha: BLOB } };
      if (call.path.endsWith('/git/trees')) return { status: 201, json: { sha: TREE } };
      if (call.path.endsWith('/git/commits')) return { status: 201, json: { sha: COMMIT, tree: { sha: TREE } } };
      return { status: 422, json: { message: 'Reference already exists' } };
    });
    try {
      const result = await runAsync({ cwd: withReport(), env: against(racing.base) });
      expect(result.status).toBe(0);
      expect(result.output).toMatch(/published the report to ci-reports/);
    } finally {
      await racing.close();
    }
  }, NETWORK_TIMEOUT_MS);
});
