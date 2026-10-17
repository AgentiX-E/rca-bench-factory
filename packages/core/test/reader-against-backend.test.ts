import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The gate that points a reader at a server this repository did not write.
 *
 * ## Why it exists, and what three passes failed to do about it
 *
 * `docs/progress.md` has carried this entry since pass 48: **no reader is driven against a real
 * deployment by CI**, and the reason is not laziness -- the fixture server answers all six shapes
 * faithfully, and it was written by the same author as the readers. What that certifies is one
 * author's reading of six APIs, and it cannot fail in the way a real server fails.
 *
 * ## What this file is, and what it deliberately is not
 *
 * It is **not** the real-backend check. That runs in CI, against a Prometheus installed from the
 * distribution. This file proves the gate's **verdict logic** against a stand-in server the test
 * writes at runtime -- the same split `gates-are-testable-is-enumerated.test.ts` uses for the audit,
 * and for the same reason: the thing that can be proved cheaply and the thing that can only be
 * proved by the real article are different claims, and confusing them is how a fixture ends up
 * certifying itself.
 *
 * So a stand-in here is not a weakening. The gate's job is to *judge* what a server answered, and
 * judging is exactly what a stand-in can drive.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GATE = 'verify-reader-against-backend.mjs';

/**
 * The script this file drives.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles a declaration against what the spawn calls
 * reach, and reports a disagreement in either direction. The declaration is needed here because
 * the spawn below is handed a path built at runtime -- `resolve(ROOT, 'scripts', GATE)` -- so the
 * script's name cannot be inferred from the call's own argument list. The audit's test file
 * carries the same declaration for the same reason, and rule 7 refused this file without it on
 * the first run.
 */
const DRIVES = ['scripts/verify-reader-against-backend.mjs'];

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-real-backend-'));

/**
 * Server groups the tests had to clean up themselves.
 *
 * One test below starts a stand-in that refuses to die, because that is the only way to reach the
 * gate's last failure exit -- a gate that reports a verdict while its server is still listening is
 * the leak this repository keeps paying for, and the exit that refuses it has to be proved like
 * any other. The gate cannot stop that server; the test has to.
 */
const strays: number[] = [];

afterAll(() => {
  for (const pid of strays) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Already gone, which is what the test that put it here was checking for.
    }
  }
  rmSync(scratch, { recursive: true, force: true });
});

let counter = 0;

/**
 * A stand-in for a Prometheus, written here rather than checked in.
 *
 * It answers the two endpoints the gate touches and takes its shape from the environment, so one
 * template covers the positive case, the wrong-shape case, the unlabelled case and the
 * never-ready case. Written at runtime because a checked-in fixture would be a second thing to
 * keep honest, and this file's whole subject is what happens when a server is not the one you
 * wrote.
 */
const STANDIN = [
  '#!/usr/bin/env node',
  '// Written by the test at runtime, never checked in. See `STANDIN` above.',
  "import { createServer } from 'node:http';",
  "const addr = process.argv.slice(2).find((a) => a.startsWith('--web.listen-address='));",
  "const port = Number((addr ?? '').split(':').pop());",
  "const shape = process.env.STANDIN_SHAPE ?? 'matrix';",
  "const ready = process.env.STANDIN_READY !== 'off';",
  "const version = process.env.STANDIN_VERSION ?? '0.0.0';",
  "if (process.env.STANDIN_PID_FILE) {",
  "  (await import('node:fs')).writeFileSync(process.env.STANDIN_PID_FILE, String(process.pid));",
  '}',
  "if (process.env.STANDIN_STUBBORN === 'on') {",
  "  process.on('SIGTERM', () => {});",
  '}',
  "const warmup = Number(process.env.STANDIN_WARMUP_MS ?? '0');",
  'const born = Date.now();',
  'const server = createServer((req, res) => {',
  "  if (req.url === '/-/ready') {",
  '    res.writeHead(ready ? 200 : 503);',
  "    res.end(ready ? 'Ready' : 'not ready');",
  '    return;',
  '  }',
  "  if (req.url.startsWith('/api/v1/query_range')) {",
  "    if (shape === 'garbage') {",
  "      res.writeHead(200, { 'content-type': 'text/html' });",
  "      res.end('<html><body>this is the web console, not the API</body></html>');",
  '      return;',
  '    }',
  '    const now = Math.floor(Date.now() / 1000);',
  '    const metric =',
  "      shape === 'unlabelled'",
  "        ? { __name__: 'prometheus_build_info', version }",
  "        : { __name__: 'prometheus_build_info', service: 'prometheus', version };",
  '    const warming = Date.now() - born < warmup;',
  "    const result = shape === 'empty' || warming ? [] : [{ metric, values: [[now - 10, '1'], [now - 5, '1']] }];",
  "    res.writeHead(200, { 'content-type': 'application/json' });",
  "    res.end(JSON.stringify({ status: 'success', data: { resultType: 'matrix', result } }));",
  '    return;',
  '  }',
  '  res.writeHead(404);',
  "  res.end('no');",
  '});',
  "server.listen(port, '127.0.0.1');",
  '',
].join('\n');

function standin(): string {
  counter += 1;
  const dir = join(scratch, `server-${counter}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'prometheus-standin');
  writeFileSync(file, STANDIN);
  chmodSync(file, 0o755);
  return file;
}

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function gate(args: string[], env: Record<string, string> = {}): Outcome {
  const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts', GATE), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, ...env },
  });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** The address the gate said it started on, so a test can ask afterwards whether it is gone. */
function addressIn(stdout: string): number {
  const match = /127\.0\.0\.1:(\d+)/.exec(stdout);
  if (match === null) throw new Error(`the gate never said where it was listening:\n${stdout}`);
  return Number(match[1]);
}

/**
 * Whether anything answers on a port, asked by connecting to it.
 *
 * A port that is still open after the gate exits is a server nobody stopped, which is the failure
 * mode this repository keeps paying for -- two passes in a row left something behind and only
 * `git status` noticed. Here the server is observable from outside, so the leak is assertable
 * rather than inferable -- and it is asked by connecting rather than by binding, because what the
 * assertion means is "something is listening", not "a bind would have failed".
 */
async function portAnswers(port: number): Promise<boolean> {
  return await new Promise((resolveAnswer) => {
    const socket = connect({ port, host: '127.0.0.1' });
    const settle = (answer: boolean) => {
      socket.destroy();
      resolveAnswer(answer);
    };
    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
  });
}

describe(`scripts/${GATE} · a reader against a server this repository did not write`, () => {
  it('drives the reader, reads the version off the server, and stops the server afterwards', async () => {
    // The version is the point of the shape below: `1.2.3-from-the-server` cannot appear in the
    // gate's output unless the gate read it, so a version transcribed into the script would fail
    // this test rather than pass it.
    const outcome = gate(['--prometheus', standin()], {
      STANDIN_VERSION: '1.2.3-from-the-server',
      STANDIN_SHAPE: 'matrix',
    });
    expect(outcome.stderr).toBe('');
    expect(outcome.status, outcome.stderr).toBe(0);
    expect(outcome.stdout).toContain('1.2.3-from-the-server');
    expect(outcome.stdout).toContain('prometheus_build_info');
    expect(outcome.stdout).toMatch(/OK/);

    const port = addressIn(outcome.stdout);
    expect(await portAnswers(port), 'the gate left its server running').toBe(false);
  });

  it('stops the server even when the reading fails', async () => {
    // The other half of the line above, and the case that actually leaks: a gate that gives up
    // early is exactly the gate that forgets what it started. The stand-in here never becomes
    // ready, so the gate fails inside its wait -- with the process already running.
    const outcome = gate(['--prometheus', standin(), '--timeout', '2000'], {
      STANDIN_READY: 'off',
    });
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toMatch(/ready|wait/i);
    const port = addressIn(outcome.stdout);
    expect(await portAnswers(port), 'the gate left its server running').toBe(false);
  });

  it('fails at once on a server that answers 200 with something that is not the API', () => {
    // A real backend serves a web console at the same address, so "200 with HTML" is a wrong
    // address rather than a server that is warming up -- and the first version of this gate could
    // not tell them apart, so it waited its whole budget for the HTML to become JSON. **That
    // distinction is the second thing the real run taught**: an empty window is worth waiting for,
    // a body that is not JSON at all is not.
    const outcome = gate(['--prometheus', standin(), '--timeout', '20000'], {
      STANDIN_SHAPE: 'garbage',
    });
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('not JSON');
    expect(outcome.stderr, 'it waited for the budget instead of failing on the answer').not.toContain(
      'never produced a sample',
    );
  });

  it('refuses to call it a reading when no signal carried the service label', () => {
    // **The negative control, and the one only a real server could have taught.** A Prometheus
    // scrapes what it is told to and labels it however that configuration says; the reader's
    // contract is that a signal belongs to a service, and it quarantines a series that does not
    // say which. A gate that called that green would be reporting the absence of a label as a
    // successful reading -- so it has to fail, naming the label.
    const outcome = gate(['--prometheus', standin()], { STANDIN_SHAPE: 'unlabelled' });
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('service');
  });

  it('fails when the API answers the window with no series at all', () => {
    // The trap the other direction, and the one the bound exists for: a server that answers the
    // API correctly and has nothing in the window is not a reading either, and it must not be
    // reported as one -- nor waited for forever.
    const outcome = gate(['--prometheus', standin(), '--timeout', '1500'], {
      STANDIN_SHAPE: 'empty',
    });
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('never produced a sample');
    expect(outcome.stderr).toContain('no series');
  });

  it('names the package to install when the binary is not there', () => {
    // This machine and the runner both get it from the distribution, so an absent binary is an
    // environment that cannot run the check -- and the failure has to say that rather than read as
    // a broken reader. The message is the whole difference.
    const outcome = gate(['--prometheus', join(scratch, 'no-such-binary')]);
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('prometheus');
    expect(outcome.stderr).toMatch(/install/i);
  });

  it('reports what it measured rather than asserting a version of its own', () => {
    // The gate's own honesty clause, as a test: two runs against two servers that report different
    // versions must report different versions. A constant in the script passes the first test
    // above and fails this one.
    const one = gate(['--prometheus', standin()], { STANDIN_VERSION: 'first-version' });
    const two = gate(['--prometheus', standin()], { STANDIN_VERSION: 'second-version' });
    expect(one.status).toBe(0);
    expect(two.status).toBe(0);
    expect(one.stdout).toContain('first-version');
    expect(one.stdout).not.toContain('second-version');
    expect(two.stdout).toContain('second-version');
  });

  it('waits for the API to answer the question, rather than for the server to be up', () => {
    // **The first real run of this gate failed here, and this is the shape of that failure.**
    // `/-/ready` answers as soon as the HTTP handler is listening; the range query the reader
    // makes becomes answerable seconds later. A gate that believed the first one asked its
    // question against an empty window and reported the reader as broken -- about a server that
    // was working.
    //
    // The stand-in below answers `/-/ready` at once and withholds the window for 1.5 seconds, so
    // a gate that waits for the API passes and a gate that waits for `/-/ready` does not.
    const outcome = gate(['--prometheus', standin(), '--timeout', '10000'], {
      STANDIN_WARMUP_MS: '1500',
    });
    expect(outcome.status, outcome.stderr).toBe(0);
    expect(outcome.stdout).toContain('OK');
  });

  it('gives up, naming the wait, when the window never fills', () => {
    // The other half: an unbounded wait is a hang, and a hang is a budget spent rather than a
    // reading. The bound has to be the gate's, and the message has to say which phase ran out.
    const outcome = gate(['--prometheus', standin(), '--timeout', '1500'], {
      STANDIN_WARMUP_MS: '600000',
    });
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('never produced a sample');
    expect(outcome.stderr).toContain('1500');
  });

  it('fails rather than telling a verdict while its server is still listening', async () => {
    // The last failure exit, and the one that has to exist for the whole shape to mean anything: a
    // gate that leaves its server running has produced a reading and a leak at the same time, and
    // the second is what this repository has paid for twice. The stand-in ignores SIGTERM, so the
    // gate cannot stop it -- and `--gone-timeout` is a flag rather than a constant for exactly
    // this reason: without it, proving this branch would cost ten seconds a run.
    counter += 1;
    const pidFile = join(scratch, `stubborn-${counter}.pid`);
    const outcome = gate(['--prometheus', standin(), '--gone-timeout', '500'], {
      STANDIN_STUBBORN: 'on',
      STANDIN_PID_FILE: pidFile,
    });
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('still listening');

    const port = addressIn(outcome.stdout);
    expect(await portAnswers(port), 'the stand-in was meant to survive SIGTERM').toBe(true);

    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    strays.push(pid);
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // It died on its own, which would make the assertion above the interesting one.
    }
  });

  it('is reachable from a package script and from a workflow, not only by hand', () => {
    // Finding 148's rule, applied to a new script: one that no job names is a script nobody runs,
    // and this one exists precisely because nothing was running it.
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(Object.values(manifest.scripts ?? {}).some((command) => command.includes(GATE))).toBe(true);

    const workflows = readFileSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(
      workflows.includes(GATE),
      'no workflow runs the real-backend check, so a merge is not decided by it',
    ).toBe(true);
    expect(
      workflows.includes('prometheus'),
      'the workflow does not install the backend the gate starts',
    ).toBe(true);
  });
});
