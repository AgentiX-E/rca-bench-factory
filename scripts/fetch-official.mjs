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
 *
 *   node scripts/fetch-official.mjs --anchor rcaeval-re2 --out /tmp/official
 *   node scripts/fetch-official.mjs --list
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

/** `curl` over `fetch`: it streams to disk and honours redirects without buffering. */
async function download(url, destination) {
  return run('curl', [
    '--fail',
    '--location',
    '--silent',
    '--show-error',
    '--retry',
    '2',
    '--max-time',
    '900',
    '-o',
    destination,
    url,
  ]);
}

function sha256Of(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
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

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { code, stderr } = await download(asset.url, destination);
    if (code === 0) {
      lastError = '';
      break;
    }
    lastError = stderr.split('\n').find((line) => line.trim() !== '') ?? `curl exited ${code}`;
    if (attempt < MAX_ATTEMPTS) {
      // 2s, 4s by default. Long enough to clear a rate-limit window, short
      // enough that a genuinely dead host does not stall the job.
      await sleep(BACKOFF === 0 ? 0 : 2 ** attempt * 1000 * BACKOFF);
    }
  }

  if (lastError !== '') {
    console.log(`SKIPPED   ${asset.id}: ${lastError}`);
    return { status: 'skipped', asset, reason: lastError };
  }

  const bytes = statSync(destination).size;
  const digest = sha256Of(destination);

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
