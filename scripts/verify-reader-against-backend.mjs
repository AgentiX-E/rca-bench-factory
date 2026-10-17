#!/usr/bin/env node
/**
 * Point one reader at a server this repository did not write.
 *
 * ## What this establishes, and what three passes could not
 *
 * `docs/progress.md` carried this entry from pass 48: **no reader is driven against a real
 * deployment by CI.** Six readers are certified by `pull.test.ts` against a fixture server, and
 * that fixture was written by the same author as the readers -- so what it certifies is one
 * reading of six APIs, and it cannot fail in the way the APIs can. Two of the six were pointed at
 * real deployments once, by hand, in passes 44 and 45, and what that cost was somebody standing a
 * service up.
 *
 * This script starts a **Prometheus** from the distribution on a port of its own, drives
 * `pullPrometheusMetrics` against it, and stops it again. Nothing is mocked, nothing is vendored,
 * and the version it reports is the one the server said.
 *
 * ## What it does *not* establish
 *
 * - **Five of the six readers.** This is one, and the other five need their own services. The
 *   matrix in `docs/architecture.md` says which.
 * - **A deployment's configuration.** The server here scrapes itself with a label this script
 *   writes. What that certifies is that the reader meets the real query API, not that it meets
 *   your Prometheus.
 * - **That the fixture is wrong.** The fixture and this check answer different questions, and the
 *   fixture stays: it is the only thing that can be run thousands of times a day.
 *
 * ## The negative control, and why it is the half a fixture cannot supply
 *
 * After the positive pull, the same server is read again with a service label it does not set. The
 * reader's contract is that a signal belongs to a service, so every series must come back
 * **quarantined** and no signal may be produced. A gate that accepted that as a reading would be
 * reporting the absence of a label as a successful pull.
 *
 * This is the shape of assertion a fixture cannot make honestly, because a fixture contains the
 * labels its author chose; the first run of this check against the real server quarantined
 * `prometheus_build_info` for exactly this reason, which is the finding that made this script
 * possible rather than an obstacle to it.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const BACKEND = 'prometheus';
const SERVICE = 'prometheus';
const QUERY = 'prometheus_build_info';
/** The window and resolution, used by the warm-up wait *and* by the reading, from one place. */
const WINDOW_SECONDS = 60;
const STEP = '5s';

function argValue(flag) {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

/**
 * The binary to run, found on `PATH` rather than through a shell.
 *
 * `command -v` would mean spawning a shell to answer a question about a filesystem, and this
 * repository has a gate against unsafe shell use; walking `PATH` answers the same question with
 * less machinery and no interpolation.
 */
function findBinary() {
  const named = argValue('--prometheus');
  if (named !== undefined) return existsSync(named) ? named : null;
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (dir === '') continue;
    const candidate = join(dir, BACKEND);
    if (!existsSync(candidate)) continue;
    try {
      if ((statSync(candidate).mode & 0o111) !== 0) return candidate;
    } catch {
      // A directory entry that cannot be stat'ed is not a binary to run.
    }
  }
  return null;
}

/** A port nothing is listening on, chosen by binding and immediately releasing it. */
async function freePort() {
  return await new Promise((done, failed) => {
    const probe = createServer();
    probe.once('error', failed);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

/**
 * Whether the web server is up, or the last thing it said instead.
 *
 * **Not the same question as "can it answer us", and the first version of this gate conflated
 * them.** `/-/ready` answers `200` as soon as the HTTP handler is listening, which is before the
 * first scrape has completed -- so the gate asked its question against an empty window and
 * reported `the reader produced no signal ... Quarantined: nothing` about a server that was
 * working perfectly. Measured, on the first run: 0.20 seconds.
 *
 * That is this campaign's oldest shape one layer out: a **mechanism's** check read as the
 * **property's** check. Ready is a statement about the process; having samples is a statement
 * about the reading.
 */
async function waitForReady(url, deadline) {
  let last = 'no answer at all';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/-/ready`);
      if (response.ok) return true;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error.message;
    }
    await new Promise((settle) => setTimeout(settle, 200));
  }
  return last;
}

/**
 * Whether the server has begun answering **the question this gate is about to ask**.
 *
 * The same endpoint, the same query, the same window and the same step the reader will use --
 * because "the server is up" and "the server can answer this" were measured to be different
 * things, twice, and both times the first version of this file believed the first one:
 *
 *   | question asked | first true |
 *   | --- | --- |
 *   | `/-/ready` | **0.0 s** |
 *   | an instant query for the same metric | **4.9 s** |
 *   | the range query the reader actually makes | **5.5 s** |
 *
 * The gap between the last two is 0.6 seconds, and the first run of this gate landed inside it:
 * the warm-up wait was satisfied by the instant query, the reader's range query followed
 * immediately, and the gate reported `the reader produced no signal ... Quarantined: nothing`
 * about a server that was working. So the wait is for the range form, in the window form, and
 * there is nothing left between it and the reading for a race to hide in.
 *
 * What this deliberately does **not** do is retry the *reader*. Once the API has answered this
 * query in this window, a reader that produces nothing is a statement about the reader, and the
 * failure has to point at it rather than at a warm-up.
 */
async function waitForSamples(url, query, deadline) {
  let last = 'no answer at all';
  while (Date.now() < deadline) {
    const end = Math.floor(Date.now() / 1000);
    const range =
      `/api/v1/query_range?query=${encodeURIComponent(query)}` +
      `&start=${end - 60}&end=${end}&step=${encodeURIComponent(STEP)}`;
    try {
      const response = await fetch(`${url}${range}`);
      if (response.ok) {
        let body;
        try {
          body = await response.json();
        } catch (error) {
          // Not a warming server -- a wrong one. An empty window is a server that has not
          // scraped yet, and it is worth waiting for; a body that is not JSON at this address is
          // a web console or somebody else's service, and waiting thirty seconds for it to become
          // an API is waiting for something that is not going to happen. Failing here rather than
          // at the deadline is also what keeps the reason: the reader never gets a chance to say
          // "I refused this", because the gate never asks it.
          await fail(
            `the API at ${address} answered 200 with something that is not JSON ` +
              `(${error.message}), so there is no ${BACKEND} query API here`,
          );
        }
        const result = body?.data?.result;
        if (Array.isArray(result) && result.length > 0) return true;
        last = 'the API answered the window with no series';
      } else {
        last = `HTTP ${response.status}`;
      }
    } catch (error) {
      last = error.message;
    }
    await new Promise((settle) => setTimeout(settle, 200));
  }
  return last;
}

/** Whether the address has stopped answering, waited for rather than assumed. */
async function waitForGone(url, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      await fetch(`${url}/-/ready`);
    } catch {
      return true;
    }
    await new Promise((settle) => setTimeout(settle, 100));
  }
  return false;
}

/**
 * Stop the server, and do not report a verdict until it is gone.
 *
 * The group rather than the pid, for the reason finding 174 measured: the process this script
 * started has a `sh` and a `sleep`'s worth of children below it in the general case, and a
 * pid-only signal leaves them. `detached` at spawn time is what makes the group addressable.
 */
async function stopServer(child, url) {
  if (child === null) return true;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already gone, which is the outcome this is for.
  }
  // Waited for rather than assumed. A server that is still listening when this script exits is a
  // server nobody stopped, and the guards' own tests would have to guess how long to wait before
  // asking -- which is how a leak becomes a flake instead of a failure.
  return await waitForGone(url, Number(argValue('--gone-timeout') ?? 10_000));
}

let server = null;
let address = null;

async function fail(reason) {
  // The verdict is not reported until what was started is stopped: a gate that exits while its
  // server is still listening is the failure this repository has now paid for twice, and here the
  // server is observable, so leaving one behind is a failure rather than an untidiness.
  //
  // One line rather than two, so that the failure exit has a **single** diagnostic above it. Two
  // would leave the inventory's fingerprint for this site reading as whichever message happened to
  // come second, which is how a site stops saying which refusal it is.
  const stopped = await stopServer(server, address ?? 'http://127.0.0.1:0');
  const note = stopped ? reason : `${reason} (and ${address} may still be listening)`;
  console.error(`verify-reader-against-backend: FAILED -- ${note}`);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    void fail(`interrupted by ${signal}`);
  });
}

const binary = findBinary();
if (binary === null) {
  await fail(
    `no ${BACKEND} binary was found. This check needs a server this repository did not write, ` +
      `so it is not vendored: install it (apt-get install -y ${BACKEND}) or pass ` +
      '--prometheus <path>',
  );
}

const core = join(ROOT, 'packages', 'core', 'dist', 'index.js');
if (!existsSync(core)) {
  await fail(`the built package is not at ${core}: run pnpm build first`);
}

const port = await freePort();
address = `http://127.0.0.1:${port}`;
const work = mkdtempSync(join(tmpdir(), 'rca-bench-real-backend-'));
writeFileSync(
  join(work, 'prometheus.yml'),
  [
    'global:',
    '  scrape_interval: 1s',
    'scrape_configs:',
    `  - job_name: ${BACKEND}`,
    '    static_configs:',
    `      - targets: ['127.0.0.1:${port}']`,
    '        labels:',
    `          service: ${SERVICE}`,
    '',
  ].join('\n'),
);

server = spawn(
  binary,
  [
    `--config.file=${join(work, 'prometheus.yml')}`,
    `--storage.tsdb.path=${join(work, 'data')}`,
    `--web.listen-address=127.0.0.1:${port}`,
  ],
  { detached: true, stdio: ['ignore', 'ignore', 'pipe'] },
);
// Printed before the wait rather than after it, so a run that is still starting is legible to
// whoever is watching -- and so the guards' own tests can ask afterwards whether it was stopped.
console.log(`starting ${binary} on ${address}`);

// One budget for "the server became usable", spent in two phases, because the two phases fail for
// different reasons and the message has to say which one ran out.
const budget = Number(argValue('--timeout') ?? 30_000);
const deadline = Date.now() + budget;

const ready = await waitForReady(address, deadline);
if (ready !== true) {
  await fail(`nothing answered ${address}/-/ready within ${budget} ms (${ready})`);
}
const warm = await waitForSamples(address, QUERY, deadline);
if (warm !== true) {
  await fail(
    `the server answered /-/ready but never produced a sample of ${QUERY} within ${budget} ms ` +
      `(${warm}), so there was nothing for the reader to read`,
  );
}

const reader = await import(core);

/** The service a signal belongs to, as the reader publishes it. */
function resourceOf(signal) {
  return signal.resource?.['service.name'] ?? null;
}

const end = Math.floor(Date.now() / 1000);
const positive = await reader.pullPrometheusMetrics({
  baseUrl: address,
  query: QUERY,
  start: end - WINDOW_SECONDS,
  end,
  step: STEP,
});

if (positive.ok !== true) {
  await fail(`the reader refused a real ${BACKEND}: ${positive.error}`);
}
if (positive.signals.length === 0) {
  await fail(
    `the reader produced no signal from ${QUERY} on a real ${BACKEND}, so this is not a reading. ` +
      `Quarantined: ${positive.quarantine.map((row) => row.reason).join('; ') || 'nothing'}`,
  );
}
const wrongService = positive.signals.filter((signal) => resourceOf(signal) !== SERVICE);
if (wrongService.length > 0) {
  await fail(
    `the reader produced ${wrongService.length} signal(s) that do not belong to ${SERVICE}, ` +
      `so the label it read is not the label the server set`,
  );
}
const versions = new Set(
  positive.signals
    .map((signal) => signal.payload?.tags?.version)
    .filter((version) => typeof version === 'string' && version.length > 0),
);
if (versions.size === 0) {
  await fail(
    `the server answered, but no signal carried a version, so this check cannot say what it ` +
      'measured -- and a version typed into this file is the transcription this gate exists to ' +
      'replace',
  );
}

/**
 * The negative control: the same server, read with a label it does not set.
 *
 * Every series must be quarantined and no signal may come back. Anything else means the reader
 * invented a service for a series that does not name one.
 */
const negative = await reader.pullPrometheusMetrics({
  baseUrl: address,
  query: QUERY,
  start: end - WINDOW_SECONDS,
  end,
  step: STEP,
  serviceLabel: 'not_a_label_this_server_sets',
});
if (negative.ok !== true) {
  await fail(`the reader refused the same server when the label was absent: ${negative.error}`);
}
if (negative.signals.length > 0) {
  await fail(
    `the reader produced ${negative.signals.length} signal(s) from series that carry no service ` +
      'label, so it supplies the service itself',
  );
}
if (negative.quarantine.length === 0) {
  await fail('nothing was quarantined when the label was absent, so nothing was read either');
}

if (!(await stopServer(server, address))) {
  console.error(`verify-reader-against-backend: FAILED -- the server is still listening on ${address}`);
  process.exit(1);
}
rmSync(work, { recursive: true, force: true });

console.log(
  `signals ${positive.signals.length}, quarantined ${negative.quarantine.length} without the label`,
);
console.log(
  `verify-reader-against-backend: OK (${BACKEND} ${[...versions].join(', ')}: ` +
    `${positive.signals.length} real signal(s) from ${QUERY}, and none when the label was absent)`,
);
