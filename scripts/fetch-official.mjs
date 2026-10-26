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
 * Five properties are enforced rather than assumed:
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
 *   5. **The destination can hold the corpus.** Both the archive and the tree it
 *      expands to are measured against the free space at `--out` before the
 *      bytes are written, and a shortfall is refused with both numbers rather
 *      than attempted (finding 261).
 *
 * ## Why property 5 exists, and why it is a refusal rather than a warning
 *
 * The 2026-10-26 scheduled run downloaded and verified `RE2-OB` -- 1 191 025 569
 * bytes, digest matching the registry -- and then died inside `unzip` with
 * `write error (disk full?)`. The destination was `/tmp`, which had been part of
 * the runner's 74 GiB root disk when the workflow was written; the `ubuntu-latest`
 * label moved from 24.04 to 26.04 on 2026-10-19, and `/tmp` there is a 7.9 GiB
 * tmpfs. The corpus did not change. The filesystem under it did, silently, and
 * nothing in this repository measured the assumption.
 *
 * A partial extraction is worse than no extraction: the ingest reads whatever
 * landed, the round trip scores it, and a truncated corpus produces a score that
 * looks like a statement about our exporter. So the check refuses, and it says
 * both numbers so the reader knows which one to change.
 *
 * The requirement is exact rather than estimated. For the archive it is the
 * registry's pinned byte count; for the expansion it is read out of the archive's
 * own central directory, which is what `unzip` will write -- no ratio, no margin,
 * no rule of thumb.
 *
 * ## Exit codes
 *
 *   0  every selected asset was fetched, verified and (if an archive) unpacked
 *   1  an asset could not be obtained: transport, or a URL that no longer serves it
 *   2  an asset's bytes do not match the registry pin -- the transfer completed
 *   3  the destination cannot hold the corpus; nothing was written for that asset
 *   4  an asset verified and then could not be unpacked -- the file is not the
 *      archive the registry says it is
 *
 * Each code names a different thing to change, which is the whole reason there
 * are five of them: 1 is answered by waiting, 2 by reading a digest, 3 by moving
 * the destination, 4 by looking at what upstream now serves under that URL.
 *
 *   node scripts/fetch-official.mjs --anchor rcaeval-re2 --out /tmp/official
 *   node scripts/fetch-official.mjs --anchor rcaeval-re2 --out /tmp/official --report-pins /tmp/pins.json
 *   node scripts/fetch-official.mjs --list
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  closeSync,
  createReadStream,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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
 * Zip record signatures, and the extra-field id that carries a 64-bit size.
 *
 * Declared here rather than beside the reader because they are the format, and
 * `bytesWithUnits` and `hasRoomFor` sit between the reader and its callers.
 */
const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const ZIP64_EXTRA_ID = 0x0001;

/** Assets refused for space. Read once at the end, to choose the exit code. */
const noRoom = [];

/**
 * A byte count with the unit a human would have chosen: `1191025569 bytes (1.1 GiB)`.
 *
 * Both forms, in that order, because the two readers want different halves. A
 * log paragraph is read in GiB; the registry, the shell and `df` are compared in
 * bytes, and a message that says only `1.1 GiB` cannot be checked against the
 * pinned `bytes` field without arithmetic in the reader's head. The first real
 * diagnosis of this failure was done by subtracting a `df` figure from a registry
 * figure, which is exactly the step this removes.
 */
function bytesWithUnits(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${bytes} bytes`;
  return `${bytes} bytes (${value.toFixed(1)} ${units[unit]})`;
}

/**
 * Bytes available to an unprivileged writer on the filesystem holding `directory`.
 *
 * `bavail` and not `bfree`: the two differ by the root reserve, and the reserve is
 * not ours to spend. `bigint` because a filesystem is allowed to be larger than
 * 2^53 bytes, and the multiplication `bsize * bavail` is done before the
 * conversion so no intermediate rounds -- a float here would be off by a few
 * bytes at these sizes, and the check compares to the byte.
 */
function freeBytesAt(directory) {
  const stats = statfsSync(directory, { bigint: true });
  return Number(stats.bsize * stats.bavail);
}

/**
 * How much a `.zip` will write when it is unpacked, read from the archive itself.
 *
 * ## Why the central directory and not `unzip -l`
 *
 * Because the number is used to *decide* whether to run `unzip`, and a decision
 * whose input is the output of the thing being decided about is a decision that
 * cannot be made before the damage. `unzip -l` also prints a table whose total
 * has to be parsed out of column positions, which is a second format to keep
 * agreeing with a second program's version.
 *
 * The central directory is the archive's own statement of what extraction will
 * write -- it is the structure `unzip` itself reads first -- and it can be read
 * with four syscalls: the tail (for the end-of-central-directory record), the
 * record, the directory, and nothing else. No extraction, no temporary tree, no
 * dependency on a tool beyond the ones already required.
 *
 * ## What it refuses to guess
 *
 * Returns `{ reason }` rather than a number when the file is not a zip, is
 * truncated, or carries a 4 GiB entry without the zip64 extra field that says how
 * large it really is. The caller prints the reason and proceeds to extraction,
 * which will fail with its own message if the archive is unusable -- an
 * unmeasurable archive is not the same finding as a destination that is too small,
 * and collapsing the two would refuse a corpus over a parser limitation.
 */
function readZipDirectory(path) {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    // The record is 22 bytes plus a comment of at most 64 KiB, so the search
    // window is bounded by the format rather than by a number chosen here.
    const tailLength = Math.min(size, 22 + 0xffff);
    if (tailLength < 22) return { reason: 'the file is smaller than a zip end-of-central-directory record' };
    const tail = Buffer.alloc(tailLength);
    readSync(fd, tail, 0, tailLength, size - tailLength);

    let eocd = -1;
    for (let at = tailLength - 22; at >= 0; at -= 1) {
      if (tail.readUInt32LE(at) === EOCD_SIGNATURE) {
        eocd = at;
        break;
      }
    }
    if (eocd === -1) return { reason: 'no end-of-central-directory record, so the file is not a zip archive' };

    let count = tail.readUInt16LE(eocd + 10);
    let directoryBytes = tail.readUInt32LE(eocd + 12);
    let directoryOffset = tail.readUInt32LE(eocd + 16);

    // Zip64 replaces any field that does not fit by writing the maximum in the
    // classic record and the real value in a second one. All three markers are
    // tested, because a 4 GiB entry can set the size marker while the count and
    // the offset stay classic.
    if (count === 0xffff || directoryBytes === 0xffffffff || directoryOffset === 0xffffffff) {
      const locatorAt = eocd - 20;
      if (locatorAt < 0 || tail.readUInt32LE(locatorAt) !== ZIP64_LOCATOR_SIGNATURE) {
        return { reason: 'the archive uses zip64 sentinels but carries no zip64 locator' };
      }
      const recordAt = Number(tail.readBigUInt64LE(locatorAt + 8));
      const record = Buffer.alloc(56);
      if (readSync(fd, record, 0, 56, recordAt) !== 56 || record.readUInt32LE(0) !== ZIP64_EOCD_SIGNATURE) {
        return { reason: 'the zip64 end-of-central-directory record is not where the locator points' };
      }
      count = Number(record.readBigUInt64LE(32));
      directoryBytes = Number(record.readBigUInt64LE(40));
      directoryOffset = Number(record.readBigUInt64LE(48));
    }

    // A directory that does not fit inside the file is a corrupt record, and
    // allocating it would be the one way this function could exhaust memory.
    if (directoryOffset + directoryBytes > size) {
      return { reason: 'the central directory lies outside the file' };
    }

    const directory = Buffer.alloc(directoryBytes);
    if (readSync(fd, directory, 0, directoryBytes, directoryOffset) !== directoryBytes) {
      return { reason: 'the central directory is shorter than the record declares' };
    }

    let at = 0;
    let seen = 0;
    let uncompressedBytes = 0;
    while (seen < count) {
      if (at + 46 > directoryBytes) return { reason: `the central directory ends after ${seen} of ${count} entries` };
      if (directory.readUInt32LE(at) !== CENTRAL_SIGNATURE) {
        return { reason: `entry ${seen + 1} does not start with a central-directory signature` };
      }
      let uncompressed = directory.readUInt32LE(at + 24);
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      if (uncompressed === 0xffffffff) {
        const zip64 = readZip64Uncompressed(directory, at + 46 + nameLength, extraLength);
        if (zip64 === null) {
          return { reason: `entry ${seen + 1} declares a 4 GiB size and carries no zip64 extra field` };
        }
        uncompressed = zip64;
      }
      uncompressedBytes += uncompressed;
      seen += 1;
      at += 46 + nameLength + extraLength + commentLength;
    }

    return { entries: seen, uncompressedBytes };
  } finally {
    closeSync(fd);
  }
}

/** The zip64 extra field's uncompressed size, or `null` when the field is absent. */
function readZip64Uncompressed(directory, start, length) {
  let at = start;
  const end = start + length;
  while (at + 4 <= end) {
    const headerId = directory.readUInt16LE(at);
    const fieldLength = directory.readUInt16LE(at + 2);
    if (headerId === ZIP64_EXTRA_ID && fieldLength >= 8 && at + 4 + 8 <= end) {
      return Number(directory.readBigUInt64LE(at + 4));
    }
    at += 4 + fieldLength;
  }
  return null;
}

/**
 * Refuse, by name, when `directory` cannot hold `needBytes`.
 *
 * Returns `true` when there is room. When there is not, the shortfall is recorded
 * and printed, and `false` tells the caller to stop fetching -- later assets would
 * only produce the same refusal for a destination that is already too small.
 *
 * The check is `needBytes <= freeBytes` rather than a margin, because both numbers
 * are exact: the requirement comes from the registry's pin or from the archive's
 * own directory, and the supply comes from `statfs` at this instant. A margin
 * would be a number nobody could defend and nobody would ever measure.
 *
 * The refusal is recorded rather than thrown so the pin report still describes the
 * assets that were measured before the destination ran out -- the same promise the
 * reporting already makes for an unreachable asset.
 */
function hasRoomFor({ asset, needBytes, directory, claim }) {
  const freeBytes = freeBytesAt(directory);
  if (needBytes <= freeBytes) return true;
  noRoom.push({ asset, needBytes, freeBytes, directory, claim });
  console.log(
    `NOROOM    ${asset.id}: ${claim} ${bytesWithUnits(needBytes)} and ` +
      `${bytesWithUnits(freeBytes)} are free at '${directory}'`,
  );
  return false;
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
  // Where this attempt starts. Zero when there is nothing on disk, which is the
  // first attempt and any attempt that follows a discarded partial.
  const resumeAt = existsSync(destination) ? statSync(destination).size : 0;
  const result = await run('curl', [
    '--fail',
    '--location',
    '--silent',
    '--show-error',
    '--max-time',
    '900',
    // Resume, because a retry that starts from zero is not a retry for a transfer
    // the ceiling cut at 97.6% -- see the header of `fetchAsset`. `-` means
    // "whatever is already in the output file", which is zero for a file that is
    // not there, so this is a no-op on the first attempt.
    '--continue-at',
    '-',
    '-o',
    destination,
    url,
  ]);
  return { ...result, elapsedMs: Date.now() - startedAt, resumeAt };
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
 * Decide whether a downloaded file matches the registry, and whether trying
 * again could plausibly change the answer.
 *
 * ## Why the byte count is read before the digest, and why that order is the point
 *
 * A file shorter than the pin is a transfer that lost its tail: the bytes
 * existed, something cut them off, and a fresh download can legitimately
 * produce a different result. A file of the right *length* whose digest
 * disagrees is a different file: the transfer completed, so retrying fetches
 * the same wrong bytes again, forever.
 *
 * Both arrive as "verification failed", and they call for opposite actions.
 * Treating them as one case is what made twelve scheduled runs of
 * `official-data.yml` fail without ever producing a measurement: the comparison
 * lived outside the attempt loop, so the one failure a retry exists for was the
 * one failure with no retry.
 *
 * `retryable` is not a guess about the cause. It is the narrower claim that a
 * second attempt could still be correct, which is exactly what the caller needs
 * to know and all it may assume.
 *
 * Returns `null` when the file verifies, so the caller's happy path is a null
 * check rather than a flag it has to remember to test.
 */
function classifyVerification(asset, actual) {
  if (asset.bytes !== null && actual.bytes !== asset.bytes) {
    // Only a file that came up *short* is retryable. A file that is longer than
    // the pin cannot be a truncation -- there are no missing bytes for a second
    // attempt to recover -- so it is reported as a pin problem for the same
    // reason a differing digest is: the file is not the file the registry
    // describes. Letting the two flags disagree here was a real defect, caught by
    // the over-length test, and it sent an over-long download down the "network
    // was unreachable" path where the log blamed a host that had answered.
    const short = actual.bytes < asset.bytes;
    return {
      retryable: short,
      reason: `expected ${asset.bytes} bytes, got ${actual.bytes}`,
      pinProblem: !short,
    };
  }
  if (asset.sha256 !== null && actual.digest !== asset.sha256) {
    return {
      retryable: false,
      reason:
        `expected sha256 ${asset.sha256}, got ${actual.digest} ` +
        `(byte count matches: ${actual.bytes}). The transfer completed, so this is a ` +
        `different file rather than a short one -- check the registry pin against a ` +
        `fresh --report-pins measurement before re-running.`,
      pinProblem: true,
    };
  }
  return null;
}

/**
 * Fetch one asset, with backoff, and verify whatever the registry pins.
 *
 * Returns `{ status }` where the status is one of `verified`, `unpinned` or
 * `skipped`. It does not throw on a network failure: the caller decides whether
 * an unreachable upstream should fail the run, and for the round trip it must
 * not -- a corpus we could not reach has told us nothing about our exporter.
 *
 * ## Why verification is inside the attempt loop
 *
 * It used to be after it, and that is the defect this function now exists to
 * not have. The loop wrapped `download` alone, so the sequence was: try to
 * fetch three times, then -- once, with whatever the third attempt left on disk
 * -- measure and compare. A transfer that arrived with a 200 and a truncated
 * body therefore spent none of its attempts on the problem, and the `fail()`
 * that followed ended the job under `set -eu`.
 *
 * An attempt is now the whole unit: get the bytes *and* confirm they are the
 * bytes. That is what makes the retry count mean "three chances at a correct
 * file" instead of "three chances at a response code".
 *
 * The `pinProblem` flag is carried out so the caller can exit with a code that
 * distinguishes it from an unreachable host. Both are failures and neither
 * should be silently tolerated, but one is answered by waiting and the other by
 * reading a digest.
 */
async function fetchAsset(asset, outDir) {
  const destination = resolve(outDir, `${asset.id}${isArchive(asset.url) ? '.zip' : ''}`);
  let lastError = '';
  let lastElapsedMs = 0;
  let pinProblem = false;

  // A partial file longer than the pin cannot be a prefix of the expected file, so
  // resuming from its end would ask the server for a range beyond the last byte.
  // It is discarded here, once, rather than inside the loop: the loop's job is to
  // spend attempts on transfers, not on files that cannot become the right one.
  if (asset.bytes !== null && existsSync(destination) && statSync(destination).size > asset.bytes) {
    console.log(
      `DISCARDED ${asset.id}: a partial file of ${bytesWithUnits(statSync(destination).size)} is longer ` +
        `than the pinned ${bytesWithUnits(asset.bytes)}, so it cannot be resumed`,
    );
    rmSync(destination, { force: true });
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { code, stderr, elapsedMs, resumeAt } = await download(asset.url, destination);
    lastElapsedMs = elapsedMs;

    if (code !== 0) {
      const detail = stderr.split('\n').find((line) => line.trim() !== '') ?? `curl exited ${code}`;
      // Exit 33 is curl refusing to resume: the server answered a ranged request
      // with the whole body. The partial is not the server's fault and cannot be
      // extended, so it is dropped and the next attempt starts clean -- which is
      // also the only attempt shape a server that ignores `Range` can satisfy.
      if (code === 33 && resumeAt > 0) {
        rmSync(destination, { force: true });
        lastError = `attempt ${attempt}/${MAX_ATTEMPTS} after ${formatDuration(elapsedMs)}: the server ` +
          `ignored the range request, so the ${bytesWithUnits(resumeAt)} already on disk was discarded ` +
          `and the next attempt starts from zero`;
        if (attempt < MAX_ATTEMPTS) {
          console.log(`DISCARDED ${asset.id}: ${lastError}`);
          await sleep(2 ** attempt * 1000 * BACKOFF);
        }
        continue;
      }
      // The attempt number and its duration, on every attempt rather than only
      // the last. An operator reading a three-attempt failure needs to see that
      // all three burned the same twelve minutes -- that is what says the transfer
      // is dying partway each time rather than the host refusing -- and a summary
      // printed once at the end cannot express it.
      lastError = `attempt ${attempt}/${MAX_ATTEMPTS} after ${formatDuration(elapsedMs)}: ${detail}`;
      if (attempt < MAX_ATTEMPTS) {
        // What the next attempt will resume from -- measured on disk *now*, not the
        // offset this attempt started at. Those differ exactly when the attempt
        // made progress, which is the fact that decides whether retrying is worth
        // anything: a second attempt that will start at 2 733 226 372 of
        // 2 801 345 134 is a different situation from one that starts at zero, and
        // before this line existed the production log could not tell them apart
        // (finding 262).
        const kept = existsSync(destination) ? statSync(destination).size : 0;
        console.log(
          `RETRYING  ${asset.id}: ${lastError}` +
            (kept > 0 ? ` [${bytesWithUnits(kept)} kept for the next attempt]` : ''),
        );
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
      continue;
    }

    // The transport succeeded, which is not the same as the file being right.
    // Measuring here rather than after the loop is the whole fix: a bad transfer
    // is now a bad *attempt*, and the loop still has chances left to spend on it.
    const bytes = statSync(destination).size;
    const digest = await sha256Of(destination);
    const problem = classifyVerification(asset, { bytes, digest });

    if (problem === null) {
      lastError = '';
      break;
    }

    lastError = `attempt ${attempt}/${MAX_ATTEMPTS} after ${formatDuration(elapsedMs)}: ${problem.reason}`;
    pinProblem = problem.pinProblem;
    console.log(`FAILED    ${asset.id}: ${problem.reason}`);

    if (!problem.retryable) {
      // Retrying cannot turn one file into another, so this exits the loop with
      // attempts unspent rather than burning the job's budget on the same bytes.
      // `lastError` is already set, so the reporting below stays uniform.
      break;
    }
    if (attempt < MAX_ATTEMPTS) {
      console.log(`RETRYING  ${asset.id}: ${lastError}`);
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
    //
    // A pin mismatch is neither of those and is not classified as one: it is a
    // statement about the registry, so it says so.
    console.log(
      `          ${asset.id}: ${
        pinProblem
          ? 'the downloaded file does not match the recorded pin. This is not a transport ' +
            'failure and downloading it again will not help; re-measure with --report-pins ' +
            'and review the digest in the registry.'
          : classifyFailure(lastError, lastElapsedMs)
      }`,
    );
    return { status: 'skipped', asset, reason: lastError, pinProblem };
  }

  const bytes = statSync(destination).size;
  const digest = await sha256Of(destination);

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
    // Reported, not thrown. This used to be `fail()`, which ended the process
    // inside the loop and so skipped the pin report for every asset already
    // measured -- the one thing the reporting claims never to do. It is also a
    // different failure class from a transport one: the bytes arrived and are
    // not the archive the registry describes, which no amount of re-downloading
    // changes.
    const detail = stderr.split('\n').find((line) => line.trim() !== '') ?? `unzip exited ${code}`;
    console.log(`FAILED    ${asset.id}: the archive could not be unpacked - ${detail.trim()}`);
    return { ok: false, reason: detail.trim() };
  }
  rmSync(destination, { force: true });
  console.log(`EXTRACTED ${asset.id}`);
  return { ok: true };
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

const outDir = resolve(argValue('--out') ?? resolve(process.env.TMPDIR ?? '/tmp', 'official'));
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

/**
 * Fetch, then either unpack or refuse -- one asset at a time, in registry order.
 *
 * Two space checks bracket the download, and they are not redundant:
 *
 *  - **before** it, against the registry's pinned byte count, because a 1.2 GB
 *    transfer into a 900 MB filesystem is a minute of network spent to learn
 *    something `statfs` already knew;
 *  - **after** it and before extraction, against the archive's own central
 *    directory, because that is the number `unzip` is about to write and it is
 *    not derivable from the compressed size.
 *
 * An unpinned asset has no byte count to check the first way; the second check
 * still applies to it, because the archive arrived and can be read.
 *
 * Both refusals stop the loop. A destination that is too small for this asset is
 * too small for the next one, and continuing would print the same sentence once
 * per asset while spending the time to download each.
 */
const results = [];
const unpackFailures = [];
for (const asset of selected) {
  if (asset.bytes !== null && !hasRoomFor({ asset, needBytes: asset.bytes, directory: outDir, claim: 'the archive needs' })) {
    break;
  }

  const result = await fetchAsset(asset, outDir);
  results.push(result);

  // Only an archive is extracted. A `.csv` asset is already the file the caller
  // wanted, and running `unzip` over it produced a message about zip internals
  // for a download that had succeeded and verified.
  if (result.archive !== true || result.status === 'skipped') continue;

  const expansion = readZipDirectory(result.destination);
  if (expansion.reason !== undefined) {
    // Not a refusal: an archive this reader cannot measure is a limitation of
    // this parser, not a statement about the destination. Extraction proceeds and
    // reports its own failure if the file is unusable, which is the honest
    // division -- the two outcomes have different causes and different fixes.
    console.log(`UNMEASURED ${asset.id}: ${expansion.reason}; extraction proceeds`);
  } else if (
    !hasRoomFor({
      asset,
      needBytes: expansion.uncompressedBytes,
      directory: outDir,
      claim: `the ${expansion.entries} entr${expansion.entries === 1 ? 'y' : 'ies'} declare`,
    })
  ) {
    // The archive stays on disk: it is the evidence for the number just printed.
    break;
  }

  const unpacked = await extract(asset, result.destination, outDir);
  if (!unpacked.ok) {
    unpackFailures.push({ asset, reason: unpacked.reason });
    break;
  }
}


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

// Four failure classes, four exit codes.
//
// All of them end the run and none is tolerated silently, but each is answered by
// a different action: an unreachable host is retried when it comes back, a file
// that does not match its pin needs a human to read a digest, a destination that
// is too small needs a different filesystem, and an archive that will not unpack
// needs someone to look at what upstream serves under that URL. One code for all
// of them is what made the anchor's twelve consecutive failures take a re-run and
// a log excavation to understand, because "the fetch failed" was all the run
// itself would say.
//
// ## Why this order
//
// Most specific and most actionable first, weakest claim last:
//
//   3  no room            -- a fact about the destination, decided before most of
//                            the work happened, and nothing downstream can be
//                            trusted while it holds
//   2  pin mismatch       -- a fact about the registry, measured on bytes that did
//                            arrive; the more specific half of "the download was
//                            wrong" and the half a retry cannot fix
//   4  unpack failed      -- a fact about the file upstream serves, discovered on a
//                            download that matched its pin, so it outranks the
//                            network by having already ruled it out
//   1  unreachable        -- the weakest claim: nothing was measured about the
//                            asset at all
//
// A run can only report one code, and the log above it names every class it hit.
const pinMismatches = results.filter((r) => r.pinProblem === true);
if (noRoom.length > 0) {
  const { asset, needBytes, freeBytes, directory, claim } = noRoom[0];
  console.error(
    `\nno room for '${asset.id}' at '${directory}': ${claim} ${bytesWithUnits(needBytes)} ` +
      `and ${bytesWithUnits(freeBytes)} are free. Nothing was unpacked for it, and the assets ` +
      `after it were not attempted -- a destination that is too small stays too small. ` +
      `Re-running on the same filesystem will fail identically; point --out at one with room.`,
  );
  process.exit(3);
}

if (pinMismatches.length > 0) {
  console.error(
    `\n${pinMismatches.length} of ${results.length} asset(s) downloaded a file that does not ` +
      `match the registry pin. The byte counts matched and the contents did not, so this is a ` +
      `substituted file or a mis-transcribed digest -- not a network failure, and re-running ` +
      `will produce the same result. Re-measure with --report-pins and review the pin.`,
  );
  process.exit(2);
}

if (unpackFailures.length > 0) {
  console.error(
    `\n${unpackFailures.length} of ${results.length} asset(s) matched their pin and could not be ` +
      `unpacked: ${unpackFailures.map((f) => `'${f.asset.id}' (${f.reason})`).join(', ')}. ` +
      `The bytes are the bytes the registry describes, so this is not a transfer problem and ` +
      `not a pin problem -- the archive upstream is unusable, or it is no longer a zip.`,
  );
  process.exit(4);
}

const unreachable = results.filter((r) => r.status === 'skipped' && r.pinProblem !== true);
if (unreachable.length > 0) {
  console.error(
    `\n${unreachable.length} of ${results.length} asset(s) could not be reached. ` +
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
