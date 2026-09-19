#!/usr/bin/env node
/**
 * Download an upstream corpus for the official-data round trip.
 *
 * This is the script `golden-master/fetch-and-verify.sh` always claimed existed.
 * That one printed instructions and downloaded nothing, so every document that
 * said "the fetch script downloads the official data" was describing an
 * intention rather than a fact. This one performs the fetch, and the documents
 * now point here.
 *
 * Three properties are enforced rather than assumed:
 *
 *   1. **Nothing lands in the repository.** `--out` is resolved and refused if
 *      it lies inside the working tree. The anchor design exists so that no
 *      licensed corpus is ever committed; a download path that *can* write into
 *      the tree is the one mistake that would undo it, and it would do so
 *      quietly, in a directory a reviewer sees on every `git status`.
 *   2. **Every byte is accounted for.** When the registry pins a sha256 or a
 *      byte count, the downloaded file must match or the run fails. When it does
 *      not pin one, the measured value is printed under `UNPINNED` so the first
 *      run is recorded rather than implied.
 *   3. **A missing corpus is not a crash.** The round trip is opt-in; an
 *      unreachable upstream is reported as a legible state with the reason, not
 *      as a stack trace.
 *   4. **The measurement is machine-readable.** `--report-pins` writes the
 *      measured digests to a file. Without it the digest was printed and a human
 *      read it out of a CI log and typed it into the registry -- a transcription
 *      step, in the one place where the whole design is about not transcribing.
 *      Writing a report is *not* pinning: the registry is never modified here,
 *      so a report cannot silently become the thing future runs verify against.
 *
 *   node scripts/fetch-official.mjs --anchor rcaeval-re2 --out /tmp/official
 *   node scripts/fetch-official.mjs --anchor rcaeval-re2 --out /tmp/official --report-pins /tmp/pins.json
 *   node scripts/fetch-official.mjs --list
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/**
 * The registry path is injectable so the guards can be exercised against a
 * fixture that serves real bytes from a local server. It defaults to the
 * committed registry, and the containment guard below is measured against the
 * *repository*, not against the registry, so an injected path cannot be used to
 * point the download into the tree.
 */
const REGISTRY_PATH = resolve(argValue('--registry') ?? resolve(ROOT, 'golden-master', 'official-assets.json'));

/** Attempts per asset. Zenodo answers 429 under load and recovers. */
const MAX_ATTEMPTS = 3;

/**
 * Seconds to wait between attempts: `2^attempt`, so 2s then 4s.
 *
 * Overridable so the suite can exercise the retry-and-give-up path without
 * spending the real backoff. Measured: the unreachable-asset test held 15.08 s
 * of a 16.45 s suite, all of it sleeping. Production keeps the real delay, and
 * the override only changes how long we wait -- never what counts as a failure.
 */
const BACKOFF = Number(process.env.RCA_BENCH_FETCH_BACKOFF ?? '1');

/**
 * The chunk `sha256Of` reads at a time: 8 MiB.
 *
 * Sized by what it is for. The digest is I/O bound, so the chunk only has to be
 * large enough that the per-read overhead disappears -- 8 MiB turns a 2.8 GB
 * file into ~340 reads instead of the ~44 000 that a 64 KiB default would cost,
 * and it stays a fixed, negligible amount of memory rather than anything
 * proportional to the file.
 */
const DIGEST_CHUNK_BYTES = 8 * 1024 * 1024;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}
function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  // A missing value is a malformed invocation, which is the caller's mistake to
  // fix -- so it is reported the way every other bad flag is, with the flag
  // named, not as an uncaught throw whose stack trace ends in this file.
  if (value === undefined || value.startsWith('--')) {
    fail(`${flag} requires a value`);
  }
  return value;
}

/**
 * Refuse a destination inside the repository.
 *
 * `relative()` is the containment test rather than a string prefix: a prefix
 * test accepts `/workspace/rca-bench-factory-evil` as "inside" the repository,
 * and rejects a legitimate sibling whose name merely starts the same way.
 */
function assertOutsideRepo(target) {
  const rel = relative(ROOT, target);
  const inside = rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
  if (inside) {
    fail(
      `--out '${target}' is inside the repository. Upstream corpora are fetched outside it and never committed; ` +
        `use a path such as /tmp/official.`,
    );
  }
}

/**
 * Run a command and resolve with its exit code and stderr.
 *
 * `spawn` rather than `execFileSync`, and not for style. A synchronous
 * `execFileSync` against a server that lives in the same process deadlocks: the
 * child inherits the listening socket, so the parent's event loop is blocked
 * waiting for a child that is waiting for a parent that will never accept. That
 * is exactly the shape of this script's own tests, which serve real bytes from a
 * real loopback server, and it hung the suite for six minutes before the cause
 * was found.
 *
 * Async also lets `--max-time` do its job: with `execFileSync` a stalled
 * connection holds the whole process regardless of what curl decides.
 */
function run(command, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => resolvePromise({ code: -1, stderr: error.message }));
    child.on('close', (code) => resolvePromise({ code: code ?? -1, stderr }));
  });
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

/** A duration a human reads in a log line: `12m 21s`, `0.4s`, `900s`. */
function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 1) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/**
 * Turn a failed attempt into the one sentence that says what to change.
 *
 * Deliberately a classification and not a guess at the cause. It reads two
 * things that were measured -- how long the attempt took and what curl said --
 * and names the failure class, because the alternative in the first real run was
 * a log that was accurate and useless.
 *
 * ## Why this reads curl's message and not curl's exit code
 *
 * curl's exit status is read out of its own message, because `--fail` collapses
 * every HTTP error into one number: a 404, a 500 and a 503 all exit 22. Measured
 * against a local server, the three produce the identical exit code and differ
 * only in the status text -- `curl: (22) The requested URL returned error: 404`.
 * So a rule keyed on the exit code cannot tell "the URL is stale, edit the
 * registry" from "the server is unwell, retry", and those are the two responses
 * an operator is choosing between. The HTTP status is the discriminator, and the
 * only place it appears is the message.
 *
 * The transport codes (`6`, `7`, `28`, `35`) are genuine exit codes and are read
 * the same way, accepting both spellings -- `curl: (7)` as curl prints it and
 * `exited 7` as a shell would report it.
 */
function classifyFailure(message, elapsedMs) {
  const transport = /exited (\d+)|curl: \((\d+)\)/.exec(message);
  const code = transport === null ? undefined : Number(transport[1] ?? transport[2]);
  const http = /returned error:\s*(\d{3})/.exec(message);
  const status = http === null ? undefined : Number(http[1]);

  // The HTTP status first, since `--fail` overwrites the transport code for
  // every response the server actually produced.
  if (status !== undefined && status >= 400 && status < 500) {
    return (
      `the server answered ${status}. The asset is not at this URL any more, and no amount of ` +
      `retrying will change that -- the registry needs the current URL.`
    );
  }
  if (status !== undefined && status >= 500) {
    return (
      `the server answered ${status}, which is a server-side failure and the one class a retry can ` +
      `legitimately fix. The URL is not the problem; the upstream is.`
    );
  }

  if (code === 28) {
    return (
      `the --max-time ceiling was reached, so this is a transfer that stalled rather than a host ` +
      `that is unreachable. Raise --max-time only if the link is known to be merely slow.`
    );
  }
  if (code === 6 || /Could not resolve|Name or service not known/i.test(message)) {
    return `DNS did not resolve. The runner reached the internet and the name did not resolve to it.`;
  }
  if (code === 7 || /Could not connect|Connection refused/i.test(message)) {
    return (
      `the connection was refused, so nothing was transferred. This is a reachability failure: the ` +
      `URL is not being answered, not a transfer that was cut short.`
    );
  }
  if (code === 52 || /Empty reply from server/i.test(message)) {
    return (
      `the server accepted the connection and sent nothing before closing it. Nothing was ` +
      `transferred, so this is the far end refusing to serve rather than a transfer cut short -- ` +
      `with curl's own retries gone, code 52 is what a host that resets mid-request looks like.`
    );
  }
  if (code === 35 || /SSL|TLS/i.test(message)) {
    return `the TLS handshake failed, so no bytes moved. This is a policy or interception failure, not a data one.`;
  }
  if (elapsedMs > 60_000) {
    return (
      `the attempt ran ${formatDuration(elapsedMs)} before failing. Bytes were moving, so this is a ` +
        `transfer that was cut short -- a size or duration limit, or a host that throttles -- not a dead URL.`
    );
  }
  return `the attempt failed early and curl's message names a transport error; see the line above.`;
}

/**
 * `curl` over `fetch`: it streams to disk and honours redirects without buffering.
 *
 * ## Why every attempt is timed, and why the timing is printed
 *
 * The first real run of this path failed twelve minutes into the fetch and said
 * only `SKIPPED <asset>: <one line>`. Twelve minutes is the diagnostic that
 * mattered and it was not in the output: a URL that does not exist fails in
 * seconds, so anything that takes minutes is a transfer that *started*. Without
 * the elapsed time the failure reads the same whether the host refused the
 * connection (nothing was ever there) or the transfer died partway (the URL was
 * fine and the network or the size limit was not) -- two different problems with
 * two different fixes, one indistinguishable message.
 *
 * So each attempt is timed and the time is printed on failure. This costs one
 * `Date.now()` and it is the difference between a report an operator can act on
 * and one that only says "it did not work".
 *
 * ## Why `--retry` is not doing the retrying
 *
 * `--retry 2` was here first, and it retries *inside* curl where nothing is
 * recorded: a failure that curl absorbed and then succeeded on is invisible, and
 * one that exhausted the retries reports a single line. The attempt loop below
 * is the retry that counts, because it can name the attempt, the elapsed time
 * and the exit status.
 *
 * So `--retry` is dropped entirely rather than narrowed. It was narrowed to
 * `--retry-connrefused` first, on the reasoning that the outer loop should own
 * the retries and curl should only repeat the transport-level ones -- and that
 * made both bugs below. `--retry-connrefused` *also* implies a retry count, so
 * an attempt that could not connect was tried three times by curl and once by
 * the loop: nine requests for three reported attempts, and every attempt
 * measured three seconds for a connection that was refused in zero milliseconds.
 * The elapsed time is the whole diagnostic, and it was reporting curl's retries
 * as though they were the transfer's duration.
 *
 * One curl invocation is now one attempt, so the number on the line is the time
 * that attempt really took. The loop retries, and only the loop does.
 */
async function download(url, destination) {
  const startedAt = Date.now();
  const result = await run('curl', [
    '--fail',
    '--location',
    '--silent',
    '--show-error',
    '--max-time',
    '900',
    '-o',
    destination,
    url,
  ]);
  return { ...result, elapsedMs: Date.now() - startedAt };
}

/**
 * The sha256 of a file, taken off the stream.
 *
 * ## Why this is not `readFileSync`
 *
 * It was, and the fourth anchor's first *successful* fetch died on it. Both
 * smaller RCAEval archives measured clean, then `RE2-TT.zip` -- 2 801 345 134
 * bytes -- ended the run with `RangeError [ERR_FS_FILE_TOO_LARGE]: File size
 * (2801345134) is greater than 2 GiB`, thrown from `readFileSync` deep inside
 * this function. The download was fine. The verification of it was the thing
 * that could not handle the size, and the two are easy to confuse because the
 * stack trace names neither the asset nor the byte count that was fine.
 *
 * Reading in fixed-size chunks makes the ceiling structural rather than
 * raised: there is no buffer the size of the file, so there is no limit on it.
 * Memory is bounded by the chunk, and a 40 GiB corpus would digest the same way
 * this one does.
 */
async function sha256Of(path) {
  const hash = createHash('sha256');
  const stream = createReadStream(path, { highWaterMark: DIGEST_CHUNK_BYTES });
  // `for await` over the stream, so a read error rejects here instead of
  // arriving as an 'error' event on an object nobody is listening to -- which
  // is how a permissions problem becomes a hang rather than a message.
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

/**
 * Fetch one asset, with backoff, and verify whatever the registry pins.
 *
 * Returns `{ status }` where the status is one of `verified`, `unpinned` or
 * `skipped`. It does not throw on a network failure: the caller decides whether
 * an unreachable upstream should fail the run, and for the round trip it must
 * not -- a corpus we could not reach has told us nothing about our exporter.
 */
async function fetchAsset(asset, outDir) {
  const destination = resolve(outDir, `${asset.id}${isArchive(asset.url) ? '.zip' : ''}`);
  let lastError = '';
  let lastElapsedMs = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { code, stderr, elapsedMs } = await download(asset.url, destination);
    lastElapsedMs = elapsedMs;
    if (code === 0) {
      lastError = '';
      break;
    }
    const detail = stderr.split('\n').find((line) => line.trim() !== '') ?? `curl exited ${code}`;
    // The attempt number and its duration, on every attempt rather than only
    // the last. An operator reading a three-attempt failure needs to see that
    // all three burned the same twelve minutes -- that is what says the transfer
    // is dying partway each time rather than the host refusing -- and a summary
    // printed once at the end cannot express it.
    lastError = `attempt ${attempt}/${MAX_ATTEMPTS} after ${formatDuration(elapsedMs)}: ${detail}`;
    if (attempt < MAX_ATTEMPTS) {
      console.log(`RETRYING  ${asset.id}: ${lastError}`);
      // 2s, 4s by default. Long enough to clear a rate-limit window, short
      // enough that a genuinely dead host does not stall the job.
      //
      // This was `BACKOFF === 0 ? 0 : 2 ** attempt * 1000 * BACKOFF` and is now
      // the plain product. The two are equivalent -- `0` times any factor is
      // already `0` -- so the guard was dead weight rather than a defect, and it
      // was removed after being wrongly accused of one. The measured 9-second
      // delay against a connection refused in zero milliseconds came from
      // `--retry-connrefused` inside curl, not from here; see the note on
      // `download` above. Recording the correction because the first version of
      // the audit blamed this line, and a guard that is blamed for a bug it did
      // not cause is a guard the next reader will not trust for the right reason.
      await sleep(2 ** attempt * 1000 * BACKOFF);
    }
  }

  if (lastError !== '') {
    console.log(`SKIPPED   ${asset.id}: ${lastError}`);
    // The failure class is the one fact the per-attempt lines do not carry, and
    // it is the one that decides what to do next. Twelve minutes spent failing
    // to *connect* means the host is unreachable from the runner; twelve minutes
    // spent mid-transfer means the bytes were available and something stopped
    // them. Both are reported here so the log answers "what should I change?"
    // rather than only "what happened?".
    console.log(`          ${asset.id}: ${classifyFailure(lastError, lastElapsedMs)}`);
    return { status: 'skipped', asset, reason: lastError };
  }

  const bytes = statSync(destination).size;
  const digest = await sha256Of(destination);

  if (asset.bytes !== null && bytes !== asset.bytes) {
    fail(`${asset.id}: expected ${asset.bytes} bytes, got ${bytes}`);
  }
  if (asset.sha256 !== null && digest !== asset.sha256) {
    fail(`${asset.id}: expected sha256 ${asset.sha256}, got ${digest}`);
  }

  if (asset.sha256 === null) {
    console.log(`UNPINNED  ${asset.id}: bytes=${bytes} sha256=${digest}`);
    return { status: 'unpinned', asset, bytes, digest, destination, archive: isArchive(asset.url) };
  }

  console.log(`VERIFIED  ${asset.id}: bytes=${bytes} sha256=${digest}`);
  return { status: 'verified', asset, bytes, digest, destination, archive: isArchive(asset.url) };
}

function isArchive(url) {
  return url.split('?')[0].endsWith('.zip');
}

/**
 * Unpack an archive, then drop the archive.
 *
 * Called only for an asset whose URL is a `.zip`. `unzip` on a file that is not
 * an archive fails with "End-of-central-directory signature not found", a
 * message about zip internals that names neither the asset nor the fact that
 * nothing was wrong with the download -- so the decision belongs to the URL, not
 * to the attempt.
 *
 * The extracted tree is what the ingest reads. The archive is removed because
 * keeping both doubles the disk a job holds at peak, which matters at these
 * sizes.
 */
async function extract(asset, destination, outDir) {
  const { code, stderr } = await run('unzip', ['-o', '-q', destination, '-d', outDir]);
  if (code !== 0) {
    fail(`${asset.id}: unzip failed - ${stderr.trim()}`);
  }
  rmSync(destination, { force: true });
  console.log(`EXTRACTED ${asset.id}`);
}

const registryRaw = readFileSync(REGISTRY_PATH, 'utf8');
const registry = JSON.parse(registryRaw);

if (process.argv.includes('--list')) {
  console.log('Fetchable assets:');
  for (const a of registry.assets) {
    const pin = a.sha256 === null ? 'unpinned' : 'pinned';
    console.log(`  ${a.id.padEnd(22)} ${a.anchor.padEnd(14)} ${pin}`);
  }
  console.log('\nNot fetchable:');
  for (const n of registry.notFetchable) {
    console.log(`  ${n.id.padEnd(22)} ${(n.anchor ?? '-').padEnd(14)} ${n.license}`);
  }
  process.exit(0);
}

const anchor = argValue('--anchor');
if (anchor === undefined) {
  fail('--anchor is required (one of the score targets), or pass --list');
}

const outDir = resolve(argValue('--out') ?? '/tmp/official');
assertOutsideRepo(outDir);
mkdirSync(outDir, { recursive: true });

const selected = registry.assets.filter((a) => a.anchor === anchor);
if (selected.length === 0) {
  const known = [...new Set(registry.assets.map((a) => a.anchor))].sort();
  const notFetchable = registry.notFetchable.find((n) => n.anchor === anchor);
  const because = notFetchable === undefined ? '' : `\n  reason: ${notFetchable.reason}`;
  fail(`no fetchable asset is anchored to '${anchor}'.\n  fetchable anchors: ${known.join(', ')}${because}`);
}

console.log(`Fetching ${selected.length} asset(s) for '${anchor}' into ${outDir}\n`);

const results = [];
for (const asset of selected) {
  const result = await fetchAsset(asset, outDir);
  // Only an archive is extracted. A `.csv` asset is already the file the caller
  // wanted, and running `unzip` over it produced a message about zip internals
  // for a download that had succeeded and verified.
  if (result.archive === true) {
    await extract(asset, result.destination, outDir);
  }
  results.push(result);
}

const skipped = results.filter((r) => r.status === 'skipped');

/**
 * Write the measured digests, if asked.
 *
 * Runs before the exit code is decided, so a partial run still reports what it
 * did measure -- and reports *only* that. `results` excludes a skipped asset
 * entirely rather than including it with a null digest, because a null in this
 * file would be read as "pin this to nothing" by a future merge, and the honest
 * representation of "we never saw these bytes" is absence.
 *
 * Only `bytes` and `sha256` are taken from the run. The url, licence and
 * extractsTo fields belong to the registry, which is reviewed by hand; a fetch
 * that could rewrite them would let a redirect or a substituted host change
 * where the next run looks without anyone reading a diff.
 *
 * The digest is measured in `fetchAsset`, before `extract` removes the archive,
 * so an archive's pin describes the archive -- the thing a future run downloads
 * and verifies -- rather than a tree that no longer exists in that form.
 */
const reportPath = argValue('--report-pins');
if (reportPath !== undefined) {
  const report = {
    schema: 'rca-bench-official-pins/1',
    anchor,
    note:
      'Measured by scripts/fetch-official.mjs. Merge these into ' +
      'golden-master/official-assets.json to pin the download. This file is not ' +
      'read by anything: it is a hand-off, and the registry remains the only ' +
      'thing a fetch verifies against.',
    assets: results
      .filter((r) => r.bytes !== undefined)
      .map((r) => ({ id: r.asset.id, url: r.asset.url, bytes: r.bytes, sha256: r.digest })),
  };
  writeFileSync(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nREPORT    ${reportPath}: ${report.assets.length} pin(s) measured`);
}

if (skipped.length > 0) {
  console.error(
    `\n${skipped.length} of ${results.length} asset(s) could not be reached. ` +
      `The round trip will have no data for them; this is reported, not worked around.`,
  );
  process.exit(1);
}

const unpinned = results.filter((r) => r.status === 'unpinned');
if (unpinned.length > 0) {
  console.log(
    `\n${unpinned.length} asset(s) are not yet pinned. Add the measured sha256 and bytes to ` +
      `golden-master/official-assets.json so the next run verifies rather than records.`,
  );
}

console.log(`\nFetched ${results.length} asset(s) into ${outDir}`);
