#!/usr/bin/env node
/**
 * Read a remote corpus archive's file list without downloading the corpus.
 *
 * ## Why this exists
 *
 * The nine RCAEval archives are 5.2 GB compressed and expand to roughly 38 GB. Every
 * question this repository asks *about case labels* -- which fault types the corpus
 * injects, how many cases each suite holds, whether a directory is a case -- is answered
 * by the archive's **central directory**, which is a contiguous block at the end of the
 * file listing every entry name, size and offset. That block is 24–139 KB per archive.
 *
 * Measured: all nine indexes together are **625 KB and 63 s**, against 5.2 GB to download
 * the same names by extracting the archives. The census this feeds
 * (`scripts/census-corpus.mjs`) is therefore a two-minute measurement rather than a
 * disk-space decision, and it can be re-taken whenever a pin moves.
 *
 * ## What it is careful about
 *
 *   - **Nothing lands in the repository.** `--out` is resolved and refused if it lies
 *     inside the working tree. An entry list is the corpus's *labels* -- every case's
 *     service and fault -- which is answer-key data even though no telemetry is in it.
 *   - **The end of the file is read as bytes, not as a guess.** The reader locates the
 *     end-of-central-directory record by scanning backwards for its signature and parses
 *     exactly `entries` records, checking each signature. An archive that does not parse is
 *     an error rather than an empty list, because an empty list would read as "a corpus
 *     with no cases". An archive that needs a zip64 central directory is refused by name:
 *     none of the nine in the registry needs one (measured), so that path would ship
 *     untested.
 *   - **The transfer is accounted.** The number of bytes fetched is printed against the
 *     archive's size, so a reader can see what the shortcut cost.
 *
 * ## The user agent is load-bearing, and it was measured
 *
 * The corpus host answers **403** to Node's default `User-Agent: node` and **206** to any
 * agent that names itself -- `curl`, `Wget`, `node-fetch`, and this script's own string all
 * work. That is a fact about the host, not about the request: the same range request with
 * only the agent changed goes from refused to served. Sending no agent at all would make
 * this script fail in a way that reads as a network outage, so it names itself.
 *
 * ## Exit codes
 *
 *   0  an index was read and written
 *   1  the archive could not be reached, or the host refused the request after retrying
 *   2  the bytes are not a zip archive this reader can parse
 *   3  the destination is inside the repository, or the flag value is missing
 *
 *   node scripts/read-remote-index.mjs --url <archive-url> --out /tmp/re2-ob.index.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const USER_AGENT = 'rca-bench-factory-index/0.1 (+https://github.com/AgentiX-E/rca-bench-factory)';
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = Number(process.env.RCA_BENCH_INDEX_BACKOFF ?? '2000');
/** Enough to hold an end-of-central-directory record and the longest comment it allows. */
const TAIL_BYTES = 65558;

function fail(code, message) {
  console.error(`error: ${message}`);
  process.exit(code);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) fail(3, `${flag} requires a value`);
  return value;
}

function assertOutsideRepo(target) {
  const rel = relative(ROOT, target);
  const inside = rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
  if (inside) {
    fail(3, `--out '${target}' is inside the repository. An entry list is the corpus's labels, not telemetry, ` +
      `and it is not committed either; use a path such as /tmp/${'corpus'}.index.json.`);
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function request(url, range) {
  let last = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Range: range } });
    if (response.status === 206 || response.status === 200) {
      return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
    }
    last = `HTTP ${response.status}`;
    if (response.status !== 429 && response.status < 500) break;
    if (attempt + 1 < MAX_ATTEMPTS) await sleep(BACKOFF_MS * (attempt + 1));
  }
  fail(1, `${url} did not serve ${range}: ${last}`);
}

/** The total size, from `Content-Range`, because the host refuses `HEAD`. */
function totalFrom(headers) {
  const range = headers.get('content-range') ?? '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

function findEndOfCentralDirectory(tail) {
  for (let at = tail.length - 22; at >= 0; at -= 1) {
    if (tail.readUInt32LE(at) === 0x06054b50) return at;
  }
  return -1;
}

const url = argValue('--url');
const out = argValue('--out');
if (url === undefined) fail(3, '--url is required');
if (out === undefined) fail(3, '--out is required');
assertOutsideRepo(resolve(out));

let fetched = 0;
const probe = await request(url, 'bytes=0-0');
fetched += probe.body.length;
const total = totalFrom(probe.headers);
if (total === undefined) fail(2, `${url} served no Content-Range, so the archive's size is unknown`);

const tailStart = Math.max(0, total - TAIL_BYTES);
const tail = await request(url, `bytes=${tailStart}-${total - 1}`);
fetched += tail.body.length;
const eocdAt = findEndOfCentralDirectory(tail.body);
if (eocdAt < 0) fail(2, `no end-of-central-directory record in the last ${TAIL_BYTES} bytes of ${url}`);

let entries = tail.body.readUInt16LE(eocdAt + 10);
const cdBytes = tail.body.readUInt32LE(eocdAt + 12);
const cdStart = tail.body.readUInt32LE(eocdAt + 16);

if (cdStart === 0xffffffff || cdBytes === 0xffffffff || entries === 0xffff) {
  // zip64 is refused rather than read, and the refusal is a measurement: all nine archives
  // in the registry report 32-bit offsets (the largest, 2.8 GB, holds 1 201 entries), so the
  // locator-and-record path has no archive to be tested against. Refusing it with this
  // sentence is a supported-scope statement; reading it with an untested branch would be a
  // guess wearing the same clothes.
  fail(
    2,
    `${url} needs zip64 (its central directory is beyond 4 GiB or holds more than 65535 entries), ` +
      `and no archive in golden-master/official-assets.json does`,
  );
}

const directory = await request(url, `bytes=${cdStart}-${cdStart + cdBytes - 1}`);
fetched += directory.body.length;

const names = [];
let at = 0;
for (let index = 0; index < entries; index += 1) {
  if (at + 46 > directory.body.length) fail(2, `${url} central directory ended after ${index} of ${entries} record(s)`);
  if (directory.body.readUInt32LE(at) !== 0x02014b50) {
    fail(2, `${url} central directory record ${index} has signature 0x${directory.body.readUInt32LE(at).toString(16)}`);
  }
  const nameLength = directory.body.readUInt16LE(at + 28);
  const extraLength = directory.body.readUInt16LE(at + 30);
  const commentLength = directory.body.readUInt16LE(at + 32);
  const nameAt = at + 46;
  // Entry names in these archives are ASCII; latin1 preserves bytes rather than replacing
  // anything a UTF-8 decode would mangle, so a name this reader cannot show is still counted.
  names.push(directory.body.toString('latin1', nameAt, nameAt + nameLength));
  at += 46 + nameLength + extraLength + commentLength;
}

const document = {
  schema: 'rca-bench-archive-index/1',
  url,
  bytes: total,
  entries: names.length,
  centralDirectoryBytes: cdBytes,
  bytesFetched: fetched,
  paths: names,
};
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), `${JSON.stringify(document, null, 1)}\n`);

const percent = ((fetched / total) * 100).toFixed(3);
console.log(
  `INDEX ${names.length} entry(ies) from ${url}\n` +
    `INDEX fetched ${fetched} of ${total} byte(s) (${percent}%) -> ${resolve(out)}`,
);
