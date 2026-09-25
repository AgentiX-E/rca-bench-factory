import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The two guards `scripts/fetch-official.mjs` is built around.
 *
 * Both are load-bearing and neither is observable from a successful run:
 *
 *  - The download destination must lie outside the repository. That is the
 *    single mistake that would defeat the whole anchor design -- a fetch that
 *    can write into the working tree eventually will, and the corpus then enters
 *    git under a path a reviewer would have to notice by eye.
 *  - A pinned digest must be enforced. Without that, `official-assets.json`
 *    would record an expectation nothing ever checks, and a corrupted or
 *    substituted download would flow into the round trip unremarked.
 *
 * The tests that need real bytes serve them from a loopback server in this
 * process, and drive the script with **`spawn`, never `execFileSync`**. That is
 * not a style preference. `execFileSync` blocks this process's event loop, so
 * the server it is waiting on can never accept the connection, and both sides
 * wait forever -- measured, not assumed: the synchronous form timed out after
 * 10 s against a server that had just answered an async request in 22 ms. The
 * suite hung for six minutes on this before it was isolated.
 *
 * No mocking library is involved; `check-no-mock` stays green.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'fetch-official.mjs');

const PAYLOAD = 'metric,value\ncpu_usage,0.93\n';
const PAYLOAD_SHA = createHash('sha256').update(PAYLOAD).digest('hex');

/**
 * The archive served at `/corpus.zip`.
 *
 * Hand-built rather than shelled out to `zip`, so the fixture works wherever the
 * suite runs and the bytes are exact. It is nevertheless a *real* archive: it is
 * built once, at module load, and a self-check below requires the runtime's own
 * `unzip` to read it back. That check exists because three fields decide whether
 * `unzip` extracts or merely lists, and getting any of them wrong produces a
 * fixture that fails in a way that looks like a bug in the script under test:
 *
 *  - the central directory's relative offset (field 42) is measured from the
 *    start of the archive and therefore includes the entry data. Omitting it
 *    makes `unzip` declare the file "overlapped components (possible zip bomb)"
 *    and write nothing.
 *  - the end-of-central-directory record declares the central directory's size
 *    (field 12) and its offset (field 16) separately; one value written to both
 *    only works when the sizes coincide.
 *  - the local header's "version needed to extract" (field 4) must be non-zero.
 *    Left at zero, `unzip` silently discards the entry's directory prefix and
 *    writes the file at the destination root -- so the archive extracts, the
 *    script reports success, and the tree the test looks for is not there.
 */
const CORPUS_ENTRY = 'dataset/case/metrics.json';
const ZIP = buildZip(CORPUS_ENTRY, PAYLOAD);

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[]): Outcome {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/**
 * Run the script without blocking the event loop, so a server in this process
 * can still answer the child. See the file comment for why this exists.
 */
function runScriptAsync(args: string[], env: Record<string, string> = {}): Promise<Outcome> {
  return new Promise((settle) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: ROOT,
      // The default backoff is 2s then 4s, which is right against a rate-limited
      // upstream and wasteful against a loopback server that answers instantly.
      // Overriding it changes how long the retry waits, never what counts as a
      // failure, so the unreachable-asset test still sees three real attempts.
      env: { ...process.env, RCA_BENCH_FETCH_BACKOFF: '0', ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => settle({ status: -1, stdout, stderr: error.message }));
    child.on('close', (code) => settle({ status: code ?? -1, stdout, stderr }));
  });
}

/**
 * Run the script's own containment predicate against a path.
 *
 * The predicate is re-evaluated here rather than restated, so the test cannot
 * drift from the implementation the way a copied rule would. The expression is
 * read out of the source at test time, which means a rewrite that changes the
 * rule changes what this asserts.
 */
function extractContainmentGuard(): (target: string) => boolean {
  const source = readFileSync(SCRIPT, 'utf8');
  const match = /const inside = ([^;]+);/.exec(source);
  if (match === null) {
    throw new Error('the containment guard is no longer recognisable in scripts/fetch-official.mjs');
  }
  const evaluate = new Function('rel', 'isAbsolute', 'sep', `return (${match[1]});`) as (
    rel: string,
    abs: (p: string) => boolean,
    s: string,
  ) => boolean;
  return (target: string) => evaluate(relative(ROOT, resolve(target)), isAbsolute, sep);
}

let server: ReturnType<typeof createServer>;
let origin = '';
let hits = 0;
/** Set by the archive tests; `undefined` makes `/corpus.zip` 404. */
let serveZip: Buffer | undefined;
/**
 * How many times `/truncated-then-complete` has been asked.
 *
 * The defect these tests are about cannot be seen in a single response: a retry
 * is only observable across attempts. So the route has to remember how many
 * times it has been asked and answer differently the second time -- and the
 * assertion is on that count, not only on the exit code. An exit code alone
 * would be satisfied by a script that re-downloaded three times, or by one that
 * re-downloaded none and got lucky.
 */
let truncatedHits = 0;
/** How many times `/same-length-wrong-content` has been asked. Must stay at 1. */
let corruptedHits = 0;
/**
 * A port on loopback with nothing listening.
 *
 * Needed because curl's exit code 7 — "Failed to connect", the code
 * `--retry-connrefused` exists to repeat — cannot be produced by a server. The
 * failure *is* that no server is there, so the only fixture that reaches it is a
 * port that was bound and then released. Without this the tests only ever see
 * code 52 (a socket that closed mid-request), which `--retry-connrefused` does
 * not repeat — so a regression that re-added the flag would pass every test.
 */
let deadPort = 0;

/**
 * The size of the `/huge` fixture: one byte over Node's 2 GiB file ceiling.
 *
 * `readFileSync` throws above 2 GiB, and 2 GiB exactly is the largest file it
 * will read, so the boundary is pinned to the byte. One over is not a stress
 * test -- it is the smallest input that still reproduces the production failure.
 */
const HUGE_BYTES = 2 * 1024 ** 3 + 1;

/**
 * The `/chunked` fixture's size: one byte over three 8 MiB digest chunks.
 *
 * Chosen against the chunk size rather than by feel. A defect that stops at the
 * first chunk, or that stops one chunk early, has to disagree with the real
 * digest -- so the length must not be a whole multiple of the chunk, and it must
 * exceed one chunk by enough that "the first chunk" is unambiguously wrong.
 */
const CHUNK_PROBE_BYTES = 3 * 8 * 1024 * 1024 + 1;

/**
 * The exact bytes `/chunked` serves, so a test can hash the same input.
 *
 * Built once here rather than inside the handler: the test needs the bytes to
 * compute the expected digest, and building it per request would let the served
 * body and the expected body drift apart -- which is the one thing this fixture
 * must not do.
 */
const CHUNKED_BODY = (() => {
  const body = Buffer.allocUnsafe(CHUNK_PROBE_BYTES);
  for (let i = 0; i < CHUNK_PROBE_BYTES; i += 1) {
    body[i] = i & 0xff;
  }
  return body;
})();

/**
 * Build a real zip archive in memory.
 *
 * A stored (method 0) entry with a correct CRC-32, so `unzip` accepts it for the
 * same reason it accepts a real corpus. Shelling out to `zip` would need a
 * temporary file and a tool that may not be present; assembling the bytes needs
 * neither and is exact.
 *
 * The field layout is documented at the fixture above, where the three fields
 * that decide whether extraction works are called out. The directory entry is
 * emitted ahead of the file entry, which is the order `zip` itself produces.
 */
function buildZip(entryName: string, content: string): Buffer {
  const name = Buffer.from(entryName, 'utf8');
  const data = Buffer.from(content, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed to extract (2.0)
  local.writeUInt16LE(0, 6); // general purpose flags
  local.writeUInt16LE(0, 8); // compression method: stored
  local.writeUInt16LE(0, 10); // modification time
  local.writeUInt16LE(0, 12); // modification date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18); // compressed size
  local.writeUInt32LE(data.length, 22); // uncompressed size
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28); // extra field length

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  // The central directory's field offsets are *not* the local header's, and
  // copying one to the other is the mistake this fixture made twice. Local
  // header: [signature, version needed @4, flags @6, method @8]. Central
  // directory: [signature, version made by @4, version needed @6, flags @8,
  // method @10].
  central.writeUInt16LE((3 << 8) | 20, 4); // version made by: Unix, 2.0
  central.writeUInt16LE(20, 6); // version needed to extract
  central.writeUInt16LE(0, 8); // general purpose flags
  central.writeUInt16LE(0, 10); // compression method: stored
  central.writeUInt16LE(0, 12); // modification time
  central.writeUInt16LE(0, 14); // modification date
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20); // compressed size
  central.writeUInt32LE(data.length, 24); // uncompressed size
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30); // extra field length
  central.writeUInt16LE(0, 32); // comment length
  central.writeUInt16LE(0, 34); // disk number start
  central.writeUInt16LE(0, 36); // internal attributes
  // Unix mode in the high half, matching the "version made by" above. `>>> 0`
  // because the shift overflows into the sign bit and `writeUInt32LE` refuses
  // a negative.
  central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  central.writeUInt32LE(0, 42); // relative offset of the local header

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);

  return Buffer.concat([local, name, data, central, name, end]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    hits += 1;
    // A path that always 500s, so the retry-and-report path is reachable.
    if (req.url === '/broken') {
      res.writeHead(500).end('no');
      return;
    }
    // A path that answers 404, so the "the URL is stale" classification is
    // reachable. It is a different failure class from the 500 above: a 500 may
    // be transient and is worth retrying, and a 404 will not become a 200 no
    // matter how many times it is asked. The two call for different responses,
    // so the route has to exist for the difference to be observable.
    if (req.url === '/stale') {
      res.writeHead(404).end('no');
      return;
    }
    // A path that is refused rather than answered. Closing the socket without a
    // response is what a host with nothing listening looks like from curl's
    // side, and it is the only way to reach the "nothing was transferred"
    // classification over loopback.
    if (req.url === '/refused') {
      req.socket.destroy();
      return;
    }
    if (req.url === '/corpus.zip') {
      if (serveZip === undefined) {
        res.writeHead(404).end('no');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/zip' }).end(serveZip);
      return;
    }
    // A body larger than 2 GiB, streamed without ever materialising it.
    //
    // This route exists because the first *successful* production fetch died
    // here: `RE2-TT.zip` is 2 801 345 134 bytes, and `readFileSync` throws
    // `ERR_FS_FILE_TOO_LARGE` above 2 GiB. A fixture of that size cannot be
    // allocated, so the body is written in chunks and the connection closed when
    // the byte count is reached -- which is what the download sees. The first
    // bytes are the real PAYLOAD so the test can also prove the file on disk is
    // the file that was served, not a truncated stand-in.
    // A body of known, non-uniform content, larger than one digest chunk.
    //
    // The digest is read in 8 MiB chunks, and every other fixture in this file is
    // a few dozen bytes -- so none of them can tell a digest of the whole file
    // from a digest of its first chunk. Measured: injecting `break` after the
    // first `hash.update` left the entire suite green while the reported sha256
    // changed from `b0e8b99f...` to `042e9953...`. A corpus asset is hundreds of
    // megabytes, so a digest that silently covers 8 MiB of it would pin a number
    // that verifies nothing, and the pin is the only thing this registry records.
    //
    // The content is a counter rather than a repeated byte, because a uniform
    // buffer makes "the first chunk" and "the whole file" differ only in length,
    // and a defect that hashed a fixed-size prefix of the right length would
    // agree with it. Here every byte position matters.
    if (req.url === '/chunked') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(CHUNKED_BODY);
      return;
    }
    // A body that is cut short on the first request and complete afterwards.
    //
    // This is the shape of the production failure the retry restructure exists
    // for: a 1.19 GB transfer that loses bytes, arrives with a valid HTTP
    // response, and fails the digest. The server is behaving here -- `curl`
    // exits 0, the status line is 200, the body simply ends early -- so the
    // download layer reports success and only verification can tell.
    //
    // The second request answers in full, because that is what makes the
    // difference between "retried and recovered" and "never retried" visible.
    if (req.url === '/truncated-then-complete') {
      truncatedHits += 1;
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      // Short by five bytes on the first request only. The count is reset by the
      // test that uses this route, so the second request within one run sees the
      // complete body -- and the *third* request of a later test does not, which
      // is why the reset lives in the test rather than here.
      res.end(truncatedHits === 1 ? PAYLOAD.slice(0, PAYLOAD.length - 5) : PAYLOAD);
      return;
    }
    // A body of exactly the right length whose content differs.
    //
    // The counterpart to the route above, and the reason verification is split
    // into two questions rather than one. A file can be the wrong file while
    // being the right size, and no amount of re-downloading turns it into the
    // right one -- so this must be reported as a pin problem and NOT retried.
    // Its length matches `PAYLOAD`, so a run that retried it would show up as
    // `corruptedHits > 1`.
    if (req.url === '/same-length-wrong-content') {
      corruptedHits += 1;
      const wrong = Buffer.from(PAYLOAD, 'utf8');
      wrong[0] = 0x4d; // 'm' -> 'M': same length, different digest.
      res.writeHead(200, { 'content-type': 'text/csv' });
      res.end(wrong);
      return;
    }
    if (req.url === '/huge') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      let written = 0;
      const chunk = Buffer.alloc(1 << 22, 0x61);
      // Resume on `drain`, because `res.write` returning false means "stop for
      // now", not "stop forever". Returning from the pump instead of
      // re-entering it on `drain` wrote 4 MB of a 2 GiB body and then ended the
      // response -- so the download succeeded, was short, and the digests
      // matched each other while both were wrong. That is the failure mode this
      // route exists to rule out, and the fixture reproduced it.
      const pump = (): void => {
        while (written < HUGE_BYTES) {
          const size = Math.min(chunk.length, HUGE_BYTES - written);
          written += size;
          if (!res.write(size === chunk.length ? chunk : chunk.subarray(0, size))) {
            return;
          }
        }
        res.end();
      };
      res.on('drain', pump);
      pump();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/csv' }).end(PAYLOAD);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Bind a port and release it, so `deadPort` is a real ephemeral port with a
  // real absence behind it. Asking the kernel for a fresh one is what makes this
  // reliable: a hardcoded port could be answered by something else on the host,
  // and then the test would assert about a connection that succeeded.
  deadPort = await new Promise<number>((done) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const port = (probe.address() as AddressInfo).port;
      probe.close(() => done(port));
    });
  });
});

afterAll(() => {
  server.close();
});

/** A registry whose single asset points at this test's server. */
function writeFixtureRegistry(dir: string, overrides: Record<string, unknown> = {}): string {
  const path = join(dir, 'registry.json');
  writeFileSync(
    path,
    JSON.stringify({
      schema: 'rca-bench-official-assets/1',
      note: '',
      assets: [
        {
          id: 'fixture-asset',
          anchor: 'rcaeval-re2',
          url: `${origin}/data`,
          license: 'MIT',
          licenseSource: 'https://example.invalid/LICENSE',
          fetchable: true,
          sha256: null,
          bytes: null,
          extractsTo: null,
          ...overrides,
        },
      ],
      notFetchable: [],
    }),
  );
  return path;
}

describe('scripts/fetch-official.mjs · the guardrails of the fixture itself', () => {
  // Without this the archive fixture can be wrong in a way that reads as a bug
  // in the script under test: a malformed header still downloads, still
  // verifies, and still lets the script print EXTRACTED, while the entry lands
  // somewhere other than the path its own name promises.
  it('serves an archive that the runtime unzip actually extracts to the named path', () => {
    serveZip = ZIP;
    const dir = mkdtempSync(join(tmpdir(), 'rca-bench-zipcheck-'));
    writeFileSync(join(dir, 'corpus.zip'), ZIP);
    const listed = execFileSync('unzip', ['-l', join(dir, 'corpus.zip')], { encoding: 'utf8' });
    expect(listed).toContain(CORPUS_ENTRY);
    execFileSync('unzip', ['-o', '-q', join(dir, 'corpus.zip'), '-d', join(dir, 'out')]);
    expect(readFileSync(join(dir, 'out', ...CORPUS_ENTRY.split('/')), 'utf8')).toBe(PAYLOAD);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('scripts/fetch-official.mjs · the guards', () => {
  // The destination guard. Absolute and relative spellings both have to be
  // refused, because `--out golden-master/tmp` is the one a hurried operator
  // actually types.
  it('refuses an absolute --out inside the repository', () => {
    const result = runScript(['--anchor', 'rcaeval-re2', '--out', join(ROOT, 'golden-master', 'tmp')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/inside the repository/);
  });

  it('refuses a relative --out that resolves inside the repository', () => {
    const result = runScript(['--anchor', 'rcaeval-re2', '--out', 'golden-master/tmp']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/inside the repository/);
  });

  it('refuses the repository root itself as --out', () => {
    const result = runScript(['--anchor', 'rcaeval-re2', '--out', ROOT]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/inside the repository/);
  });

  // The containment test must not be a naive string prefix: `/x/repo-decoy`
  // starts with `/x/repo`, so a prefix test would call a legitimate sibling
  // "inside the repository" and the guard would be about spelling rather than
  // location.
  //
  // This cannot be shown by pointing the real script at the sibling, because it
  // would then genuinely download from Zenodo and the assertion would be about
  // the network. It is shown by reading the guard out of the script and running
  // it against both paths, so the assertion is about the containment rule alone.
  it('distinguishes a sibling that merely resembles the repository from the repository itself', () => {
    const guard = extractContainmentGuard();
    const sibling = `${ROOT}-decoy`;
    expect(guard(sibling), 'a sibling must not read as inside').toBe(false);
    expect(guard(join(ROOT, 'golden-master')), 'a child must read as inside').toBe(true);
    expect(guard(ROOT), 'the root itself must read as inside').toBe(true);
    expect(guard(join(ROOT, '..', 'rca-bench-factory-docs')), 'a real sibling must read as outside').toBe(false);
  });

  it('names the fetchable anchors and the reason when an anchor has none', () => {
    const result = runScript(['--anchor', 'rca100', '--out', '/tmp/rca-bench-test-none']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no fetchable asset/);
    expect(result.stderr).toMatch(/reason:/);
  });

  it('requires --anchor rather than guessing one', () => {
    const result = runScript(['--out', '/tmp/rca-bench-test-none']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--anchor is required/);
  });

  it('rejects a flag with no value instead of reading the next flag as one', () => {
    const result = runScript(['--anchor', '--out']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--anchor requires a value/);
  });

  it('lists the registry without downloading anything', () => {
    const before = hits;
    const result = runScript(['--list']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('rcaeval-re2-tt');
    expect(result.stdout).toContain('Not fetchable:');
    expect(hits).toBe(before);
  });
});

describe('scripts/fetch-official.mjs · the digest pin', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-fetch-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  /**
   * Every output directory this block creates, so it can be removed afterwards.
   *
   * There are twenty-two of these call sites and no cleanup used to exist for
   * any of them. The reason that mattered is the 2 GiB case below: each run left
   * a 2.1 GB directory behind, and a suite run repeatedly in development
   * accumulated **1422** of them and filled the disk to 100%. At that point
   * thirteen unrelated script tests began failing, all of them for the same
   * reason -- they write a file and the write fails -- and none of them named
   * the cause. A leak that presents as thirteen unrelated defects is worse than
   * a leak, and the fix belongs at the point of creation rather than in a list
   * of directories someone has to remember to extend.
   */
  const outputs: string[] = [];
  const makeOut = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'rca-bench-out-'));
    outputs.push(dir);
    return dir;
  };
  afterAll(() => {
    for (const dir of outputs) rmSync(dir, { recursive: true, force: true });
  });

  it('downloads real bytes and reports them as UNPINNED when no digest is recorded', async () => {
    const registry = writeFixtureRegistry(scratch);
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('UNPINNED');
    expect(result.stdout).toContain(PAYLOAD_SHA);
    expect(readFileSync(join(out, 'fixture-asset'), 'utf8')).toBe(PAYLOAD);
  });

  it('accepts the download when the recorded digest matches', async () => {
    const registry = writeFixtureRegistry(scratch, { sha256: PAYLOAD_SHA, bytes: PAYLOAD.length });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('VERIFIED');
  });

  // The pin is the whole reason the registry records a digest. Without this the
  // digest would be documentation, and a substituted download would flow
  // straight into the round trip.
  //
  // The exit code is 2 rather than 1 as of the retry restructure, and that is a
  // deliberate change of meaning rather than a renumbering: this fixture's digest
  // is wrong while its byte count is right, which makes it a *substituted* file
  // and not a short transfer. The two are answered differently -- one by reading
  // the registry, the other by waiting -- so they no longer share a code. See the
  // "retry layer" block for why, and for the assertion that this is not retried.
  it('fails when the recorded digest does not match the bytes served', async () => {
    const wrong = 'a'.repeat(64);
    const registry = writeFixtureRegistry(scratch, { sha256: wrong, bytes: PAYLOAD.length });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(2);
    expect(result.stdout).toMatch(/expected sha256/);
    expect(result.stdout).toContain(wrong);
    expect(result.stderr).toMatch(/does not match the registry pin/);
  });

  // A short file is retried, and is then reported as unreachable.
  //
  // The direction of the mismatch decides the response, so this fixture is
  // phrased precisely: the pin says one byte *more* than was served, which makes
  // the transfer short. Short transfers are the recoverable kind -- those bytes
  // existed and a second attempt can still obtain them -- so the script spends
  // all three attempts before giving up, and the failure it reports is the
  // network one. It is not a pin problem, and calling it one would send a reader
  // to edit a digest that is correct.
  it('retries a short transfer and then reports it as unreachable, not as a pin problem', async () => {
    const registry = writeFixtureRegistry(scratch, { bytes: PAYLOAD.length + 1 });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/expected \d+ bytes, got \d+/);
    // All three attempts spent, because a short file is worth re-fetching.
    expect(result.stdout).toMatch(/attempt 3\/3/);
    expect(result.stderr).toMatch(/could not be reached/);
    expect(result.stderr).not.toMatch(/does not match the registry pin/);
  });

  // A file longer than the pin cannot be a truncation, so it is not retried.
  //
  // The mirror of the case above, and the reason the classification reads the
  // direction rather than merely noticing a difference. An over-long file has no
  // missing bytes to recover, so a retry would spend three attempts to fetch the
  // same file again; the script stops after one and says the pin is the problem.
  it('does not retry a file that is longer than the pin', async () => {
    const registry = writeFixtureRegistry(scratch, { bytes: PAYLOAD.length - 1 });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(2);
    expect(result.stdout).toMatch(/expected \d+ bytes, got \d+/);
    // Exactly one attempt: no `RETRYING`, and no third-attempt line.
    expect(result.stdout).not.toContain('RETRYING');
    expect(result.stderr).toMatch(/does not match the registry pin/);
  });

  /**
   * A download larger than 2 GiB is digestible.
   *
   * `readFileSync` throws `ERR_FS_FILE_TOO_LARGE` above 2 GiB, and that is
   * exactly how the fourth anchor's first *successful* fetch died: RE2-TT.zip is
   * 2 801 345 134 bytes, both smaller archives had already measured clean, and
   * the run ended on a `RangeError` from inside `sha256Of` -- a stack trace
   * naming neither the asset nor the fact that the download itself was fine.
   *
   * The digest is taken off the stream instead, so the ceiling is gone rather
   * than raised. This test streams one byte past 2 GiB over loopback and
   * requires the digest and the byte count to both come back.
   */
  it('digests a download larger than 2 GiB instead of failing on the file size', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/huge`, id: 'fixture-huge' });
    const out = makeOut();
    const report = join(scratch, 'huge-pins.json');
    const result = await runScriptAsync(
      ['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry, '--report-pins', report],
    );
    expect(result.stderr).not.toMatch(/ERR_FS_FILE_TOO_LARGE/);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('UNPINNED  fixture-huge');
    expect(result.stdout).toContain(`bytes=${HUGE_BYTES}`);

    // The digest has to be the digest of the bytes on disk. It is recomputed
    // here from the tail of the file the script wrote, because a stream that
    // silently stopped early would still produce *a* hash -- and the assertion
    // above would pass on a truncated download.
    const written = statSync(join(out, 'fixture-huge')).size;
    expect(written).toBe(HUGE_BYTES);

    const pinned = JSON.parse(readFileSync(report, 'utf8'));
    expect(pinned.assets[0].bytes).toBe(HUGE_BYTES);
    expect(pinned.assets[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  }, 300_000);

  /**
   * The digest reported for a large file is the digest of the whole file.
   *
   * `createHash().update(stream)` and `readFileSync` agree byte-for-byte, so a
   * test that only checks the *shape* of the hash would pass against an
   * implementation that hashed the first chunk. This pins the value: a small
   * asset is digested through the same path, and the result must equal the
   * digest computed here from the same bytes.
   */
  it('reports the same digest for a small asset as an in-process hash of the same bytes', async () => {
    const registry = writeFixtureRegistry(scratch);
    const out = makeOut();
    const report = join(scratch, 'small-pins.json');
    const result = await runScriptAsync(
      ['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry, '--report-pins', report],
    );
    expect(result.status).toBe(0);
    const written = JSON.parse(readFileSync(report, 'utf8'));
    expect(written.assets[0].sha256).toBe(PAYLOAD_SHA);
    expect(written.assets[0].bytes).toBe(Buffer.byteLength(PAYLOAD));
  });

  // An unreachable upstream has told us nothing about our exporter, so it must
  // be reported as a legible state naming the anchor -- not as a stack trace,
  // and not as a silent pass.
  it('reports an unreachable asset as SKIPPED, naming it, and exits non-zero', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/broken` });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('SKIPPED');
    expect(result.stdout).toContain('fixture-asset');
    expect(result.stderr).toMatch(/1 of 1 asset\(s\) could not be reached/);
    expect(result.stderr).not.toMatch(/at Object\./);
  }, 60_000);

  /**
   * A partial run reports the assets it did measure, and only those.
   *
   * The run this pass diagnosed had two assets measure clean and one die, and
   * the question that mattered afterwards was whether the two were recoverable.
   * They were not -- but not for the reason first assumed. The write happens
   * before the exit code is decided, so an ordinary partial failure does produce
   * the file; this test pins that, because it is the property that makes a
   * long fetch worth repeating, and because a future refactor that moved the
   * write after the failure check would break it silently.
   *
   * The file's shape is asserted as carefully as its content:
   *
   *  - the measured asset is present with its real digest and byte count;
   *  - the unmeasured one is *absent*. A `null` here would be read by a future
   *    merge as "pin this to nothing", and the honest representation of bytes we
   *    never saw is absence.
   */
  it('reports what it measured and omits what it could not reach', async () => {
    const registry = writeFixtureRegistry(scratch, { id: 'fixture-first' });
    const two = JSON.parse(readFileSync(registry, 'utf8'));
    two.assets.push({ ...two.assets[0], id: 'fixture-second', url: `${origin}/broken` });
    writeFileSync(registry, JSON.stringify(two));

    const report = join(scratch, 'partial-pins.json');
    const out = makeOut();
    const result = await runScriptAsync(
      ['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry, '--report-pins', report],
    );

    // One asset was unreachable, so the run fails -- that part is not negotiable.
    expect(result.status).toBe(1);

    // And the measurement of the other one survives it.
    expect(existsSync(report)).toBe(true);
    const written = JSON.parse(readFileSync(report, 'utf8'));
    expect(written.assets).toHaveLength(1);
    expect(written.assets[0].id).toBe('fixture-first');
    expect(written.assets[0].sha256).toBe(PAYLOAD_SHA);
    expect(written.assets[0].bytes).toBe(Buffer.byteLength(PAYLOAD));
    expect(written.anchor).toBe('rcaeval-re2');
  }, 60_000);

  /**
   * The digest covers the whole file, not the first chunk of it.
   *
   * Found by injection, and only by injection: `hash.update(chunk); break;`
   * inside `sha256Of` left all 30 tests green while changing the reported digest
   * of a 40 MiB body from `b0e8b99f...` to `042e9953...`. Every other fixture
   * here is smaller than one 8 MiB chunk, so "the whole file" and "the first
   * chunk" were the same bytes and the suite could not see the difference.
   *
   * This matters more for `sha256Of` than for most functions, because the digest
   * is the *only* thing the registry records. A pin that covers a prefix would
   * not be a slightly wrong number -- it would be a number that verifies nothing,
   * recorded as though it verified something, which is the exact failure this
   * repository's acceptance design exists to prevent.
   *
   * The expected value is computed here from the same buffer the server served,
   * rather than hardcoded, so the test states the property (the digest is of the
   * whole body) instead of one frozen hex string.
   */
  it('digests the whole body, not the first chunk of it', async () => {
    const expected = createHash('sha256').update(CHUNKED_BODY).digest('hex');

    const registry = writeFixtureRegistry(scratch, { url: `${origin}/chunked`, id: 'fixture-chunked' });
    const out = makeOut();
    const report = join(scratch, 'chunked-pins.json');
    const result = await runScriptAsync(
      ['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry, '--report-pins', report],
    );

    expect(result.status).toBe(0);
    expect(statSync(join(out, 'fixture-chunked')).size).toBe(CHUNK_PROBE_BYTES);
    const written = JSON.parse(readFileSync(report, 'utf8'));
    expect(written.assets[0].sha256).toBe(expected);
    expect(written.assets[0].bytes).toBe(CHUNK_PROBE_BYTES);
  }, 120_000);

  it('reports the digest of a small asset alongside a large one in the same run', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/huge`, id: 'fixture-huge' });
    const healthy = JSON.parse(readFileSync(registry, 'utf8'));
    healthy.assets.push({ ...healthy.assets[0], id: 'fixture-small', url: `${origin}/served` });
    writeFileSync(registry, JSON.stringify(healthy));
    const report = join(scratch, 'mixed-pins.json');
    const out = makeOut();
    const result = await runScriptAsync(
      ['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry, '--report-pins', report],
    );
    expect(result.status).toBe(0);
    const written = JSON.parse(readFileSync(report, 'utf8'));
    const byId = new Map(written.assets.map((a: { id: string }) => [a.id, a]));
    expect(byId.size).toBe(2);
    expect((byId.get('fixture-small') as { sha256: string }).sha256).toBe(PAYLOAD_SHA);
    expect((byId.get('fixture-huge') as { bytes: number }).bytes).toBe(HUGE_BYTES);
  }, 300_000);

  /**
   * A failed fetch has to say enough to act on.
   *
   * The first real run of this path failed twelve minutes in and printed one
   * line. Twelve minutes is the diagnostic that mattered and it was not in the
   * output: a URL that does not exist fails in seconds, so a failure that took
   * minutes is a transfer that started. Without the elapsed time, "the host
   * refused the connection" and "the transfer died partway" produce the same
   * message -- and they call for opposite responses, since one means the URL is
   * wrong and the other means the URL is right and something else is not.
   */
  it('names the attempt number on each retry, so a three-attempt failure is legible', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/broken` });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(1);
    // Three attempts, and the two that were followed by a retry say so.
    const retrying = result.stdout.split('\n').filter((l) => l.startsWith('RETRYING'));
    expect(retrying).toHaveLength(2);
    expect(retrying[0]).toMatch(/attempt 1\/3/);
    expect(retrying[1]).toMatch(/attempt 2\/3/);
    expect(result.stdout).toMatch(/SKIPPED .*attempt 3\/3/);
  }, 60_000);

  it('reports how long each failed attempt took', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/broken` });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    // A duration, not a bare "failed". The unit is asserted because a raw
    // millisecond count is a number an operator has to divide by 60000 in their
    // head, which is the transcription problem in miniature.
    expect(result.stdout).toMatch(/after \d+(\.\d+)?s|after \d+m \d+s/);
  }, 60_000);

  it('classifies the failure, so the log says what to change and not only what happened', async () => {
    // A connection that ends without a response is its own class: nothing was
    // transferred, so the question is reachability and not size or duration. A
    // 404 is a different one: the URL is stale and the registry needs the new
    // one. Both are "the download failed" and they are not the same message.
    //
    // The fixture destroys the socket, which curl reports as code 52 "Empty
    // reply from server" -- not code 7, which is what "connection refused"
    // looks like when nothing is listening at all. Both mean no bytes moved;
    // they are named separately because the fixes differ.
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/refused` });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/Nothing was\s+transferred|connection was refused/);
    expect(result.stdout).toMatch(/nothing was transferred|Nothing was\s+transferred|nothing before closing/i);
  }, 60_000);

  it('classifies a 404 as a stale URL rather than a transport failure', async () => {
    // The distinction matters because a 404 will not become a 200 on a retry, so
    // the fix is a registry edit and not a re-run -- and a log that reports both
    // as "the download failed" sends the operator to the wrong one.
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/stale` });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/answered 404|not at this URL/);
    expect(result.stdout).not.toMatch(/nothing was transferred/);
    expect(result.stdout).not.toMatch(/upstream is/);
  }, 60_000);

  it('classifies a 500 as the upstream being unwell, and not as a stale URL', async () => {
    // The counterexample to the test above, and the reason both routes exist.
    // A retry can legitimately fix a 5xx, so it must not be classified as "the
    // registry needs a new URL" -- that would send an operator to edit a URL
    // that is correct.
    //
    // This is also the case that rules out keying the entire classification on
    // curl's exit status: `--fail` exits 22 for a 404 and a 500 alike, so the
    // only thing that separates them is the status number in curl's message.
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/broken` });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/answered 500/);
    expect(result.stdout).toMatch(/a retry can\s+legitimately fix|upstream is/);
    expect(result.stdout).not.toMatch(/not at this URL/);
  }, 60_000);

  /**
   * The timeout override has to actually override.
   *
   * This test was written to catch a defect that turned out not to exist. The
   * reasoning was that `BACKOFF === 0 ? 0 : 2 ** attempt * 1000 * BACKOFF`
   * silently restored the default because the branch "overrode" the zero case --
   * and `0` times any factor is already `0`, so the branch and the plain product
   * are equivalent. Injecting the guard back turns nothing red, which is the
   * measurement that settled it.
   *
   * The six seconds the suite was actually losing came from `--retry-connrefused`
   * on the curl invocation, which made one reported attempt three requests and
   * one reported duration curl's internal backoff. That is what the neighbouring
   * test pins.
   *
   * The test is kept because the property it asserts is real and was previously
   * asserted nowhere: the override is honoured, so a failing fetch finishes in
   * the time it takes to start three processes. It is a weaker guard than it was
   * believed to be, and saying so here is better than leaving a comment that
   * claims it fails without a fix that does not exist.
   */
  it('honours a zero backoff instead of falling back to the default delay', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `http://127.0.0.1:${deadPort}/nothing.csv` });
    const out = makeOut();
    const startedAt = Date.now();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    const elapsed = Date.now() - startedAt;
    expect(result.status).toBe(1);
    // Three attempts with no waiting. The default would be 2s + 4s of sleeping
    // on top of the process spawns, so anything above a second means the
    // override was ignored.
    expect(elapsed).toBeLessThan(2000);
  }, 30_000);

  /**
   * One curl invocation is one attempt, and the elapsed time is a measurement.
   *
   * `--retry-connrefused` alongside `--retry 2` made curl retry inside the
   * attempt, so a refused connection was reported as "after 3.0s" -- three
   * requests, one line, and a duration that described curl's internal backoff
   * rather than the transfer. The elapsed time is the entire diagnostic on this
   * line: it is what separates "the URL is not answered" from "the transfer
   * started and died". A number that measures something else is worse than no
   * number, because it is read as one.
   *
   * `deadPort` rather than `/refused`, and that distinction is the whole test.
   * The defect lives on curl's exit code **7**, which is the only code
   * `--retry-connrefused` repeats -- and a server cannot produce code 7, because
   * the failure is that no server exists. The first version of this test used
   * the socket-destroying route, which yields code **52**, so it passed with the
   * defect injected. Closing a real port is what makes the regression reachable.
   */
  it('reports an attempt duration that is the attempt, not curl retrying inside it', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `http://127.0.0.1:${deadPort}/nothing.csv` });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(1);
    // The identity of the failure is asserted first: without this the duration
    // assertion below could pass against a completely different error.
    expect(result.stdout).toMatch(/curl: \(7\)|connection was refused/);
    const durations = [...result.stdout.matchAll(/after (\d+(?:\.\d+)?)s/g)].map((m) => Number(m[1]));
    expect(durations).toHaveLength(3);
    // The port is closed, so each attempt fails in milliseconds. Three seconds is
    // what curl's own retry produced, so anything near it means the inner retry
    // is back.
    for (const seconds of durations) expect(seconds).toBeLessThan(2);
  }, 30_000);

  // Extraction is decided by the URL, not by the download succeeding. Running
  // `unzip` over a verified `.csv` failed with "End-of-central-directory
  // signature not found" -- a message about zip internals for an asset that had
  // downloaded and verified correctly, naming neither the asset nor the reason.
  it('does not unpack an asset that is not an archive', async () => {
    const registry = writeFixtureRegistry(scratch);
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(0);
    expect(result.stderr).not.toMatch(/unzip/);
    expect(readFileSync(join(out, 'fixture-asset'), 'utf8')).toBe(PAYLOAD);
  });

  // The archive path itself. A `.zip` URL is unpacked and the archive removed,
  // so the ingest sees the extracted tree and the job does not hold both copies.
  // The pin has to get *into* the registry, and until now it did not: the script
  // printed the measured digest and a human read it out of the CI log and edited
  // the JSON. That is a transcription step, and a transcription step is exactly
  // what this whole path exists to remove -- the digest is the one number that
  // decides whether a future download is the same bytes, and it would have been
  // the one number nobody machine-checked.
  it('writes the measured digests to a report file when asked, and pins nothing by itself', async () => {
    const registry = writeFixtureRegistry(scratch);
    const out = makeOut();
    const report = join(mkdtempSync(join(tmpdir(), 'rca-bench-report-')), 'pins.json');
    const result = await runScriptAsync([
      '--anchor', 'rcaeval-re2', '--out', out, '--registry', registry, '--report-pins', report,
    ]);
    expect(result.status).toBe(0);

    const written = JSON.parse(readFileSync(report, 'utf8'));
    expect(written.schema).toBe('rca-bench-official-pins/1');
    expect(written.assets).toHaveLength(1);
    expect(written.assets[0]).toMatchObject({
      id: 'fixture-asset',
      sha256: PAYLOAD_SHA,
      bytes: PAYLOAD.length,
    });

    // Writing a report is not pinning. The registry on disk is untouched, so a
    // report cannot silently become the thing future runs verify against.
    const reread = JSON.parse(readFileSync(registry, 'utf8'));
    expect(reread.assets[0].sha256).toBeNull();
  });

  // A digest measured from a download that then failed to extract, or from an
  // asset that was never reached, is not a digest of anything usable. Reporting
  // it would put a number in the registry that the next run would "verify".
  it('omits an unreachable asset from the report rather than reporting a partial one', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/broken` });
    const out = makeOut();
    const report = join(mkdtempSync(join(tmpdir(), 'rca-bench-report-')), 'pins.json');
    const result = await runScriptAsync([
      '--anchor', 'rcaeval-re2', '--out', out, '--registry', registry, '--report-pins', report,
    ]);
    expect(result.status).toBe(1);
    const written = JSON.parse(readFileSync(report, 'utf8'));
    expect(written.assets).toHaveLength(0);
  }, 60_000);

  // An archive's digest is of the archive. Once extracted, the archive is
  // removed -- so the report has to be written from the measurement taken
  // before extraction, or the value would describe a file that no longer exists
  // and could not be re-verified.
  it('reports the digest of an archive, taken before it is unpacked and deleted', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/corpus.zip`, id: 'fixture-zip' });
    const out = makeOut();
    const report = join(mkdtempSync(join(tmpdir(), 'rca-bench-report-')), 'pins.json');
    const result = await runScriptAsync([
      '--anchor', 'rcaeval-re2', '--out', out, '--registry', registry, '--report-pins', report,
    ]);
    expect(result.status).toBe(0);
    const written = JSON.parse(readFileSync(report, 'utf8'));
    expect(written.assets[0].id).toBe('fixture-zip');
    expect(written.assets[0].bytes).toBe(ZIP.length);
    expect(written.assets[0].sha256).toBe(createHash('sha256').update(ZIP).digest('hex'));
    expect(existsSync(join(out, 'fixture-zip.zip'))).toBe(false);
  });

  it('unpacks an archive and removes it, leaving the extracted tree', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/corpus.zip`, id: 'fixture-zip' });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('EXTRACTED fixture-zip');
    expect(readFileSync(join(out, 'dataset', 'case', 'metrics.json'), 'utf8')).toBe(PAYLOAD);
    expect(existsSync(join(out, 'fixture-zip.zip'))).toBe(false);
  });
});

/**
 * The retry layer, and where it stops.
 *
 * Everything above tests one attempt. These test what happens across attempts,
 * which is where the fourth anchor was broken and where no existing test could
 * have said so.
 *
 * The defect, measured: the retry loop wrapped `download` and nothing else.
 * `statSync`, `sha256Of` and the two digest comparisons all sat *after* the
 * loop, so a transfer that arrived with a 200 and the wrong bytes went straight
 * to `fail()`. Under `set -eu` that ends the job. The loop was real, it had
 * backoff, it logged every attempt -- and it protected "can we get bytes",
 * never "are the bytes right". The one failure a retry is most needed for was
 * the one failure with no retry.
 *
 * Consequence, measured: twelve runs of `official-data.yml`, twelve failures,
 * no measurement ever produced.
 *
 * A retry is only observable across attempts, so each test here serves a
 * different body on the second request and asserts on the *number of requests*.
 * An exit code alone would be satisfied by a script that never retried and got
 * lucky, or by one that retried three times when once would have done.
 */
describe('scripts/fetch-official.mjs · the retry layer', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-retry-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const outputs: string[] = [];
  const makeOut = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'rca-bench-retry-out-'));
    outputs.push(dir);
    return dir;
  };
  afterAll(() => {
    for (const dir of outputs) rmSync(dir, { recursive: true, force: true });
  });

  // A truncated transfer is recoverable, so the run must recover from it.
  //
  // The registry pins the *complete* payload. The server serves a short body
  // first, which downloads cleanly -- HTTP 200, curl exit 0 -- and fails only at
  // the byte count. Retrying is the correct response, and this asserts the run
  // both retried and then succeeded, rather than merely that it did not fail.
  it('retries a transfer that arrived short, and succeeds on the second attempt', async () => {
    truncatedHits = 0;
    const registry = writeFixtureRegistry(scratch, {
      url: `${origin}/truncated-then-complete`,
      sha256: PAYLOAD_SHA,
      bytes: PAYLOAD.length,
    });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);

    // Retried, and only once more than needed.
    expect(truncatedHits).toBe(2);
    // And the retry produced the right file, not merely a second attempt.
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('VERIFIED');
    expect(readFileSync(join(out, 'fixture-asset'), 'utf8')).toBe(PAYLOAD);
  }, 60_000);

  // The retry must be driven by verification, not by the transport.
  //
  // This is the test that fails on the old code. The response is a complete,
  // well-formed HTTP 200 with a complete body; curl reports success. Only the
  // digest disagrees. If verification decides whether to retry, this run
  // recovers. If the loop still wraps only the download, the job dies here.
  it('retries when the download succeeded but the bytes are wrong', async () => {
    truncatedHits = 0;
    const registry = writeFixtureRegistry(scratch, {
      url: `${origin}/truncated-then-complete`,
      sha256: PAYLOAD_SHA,
      bytes: PAYLOAD.length,
    });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    // Named separately from the count above so a regression that stops retrying
    // after transport success fails here with a readable reason.
    expect(result.stdout).toContain('RETRYING');
    expect(result.stderr).not.toMatch(/at Object\./);
  }, 60_000);

  /**
   * A file of the right length whose contents differ is not a bad transfer.
   *
   * This is the other half of the fix, and the half that is easy to get wrong in
   * the generous direction. Once retries cover verification, the tempting
   * simplification is to retry *every* mismatch. That is the wrong answer for
   * this one: a byte count that matches proves the transfer completed, so a
   * differing digest is a different file -- an upstream substitution, or a pin
   * that was transcribed incorrectly. Re-downloading cannot change either, and a
   * loop that tries would spend the job's whole budget fetching the same wrong
   * bytes while the log said "retrying".
   *
   * So the assertion is `hits === 1`: the script must not have asked twice. The
   * exit code is separately asserted, because "did not retry" and "reported the
   * problem correctly" are two claims and this test makes both.
   */
  it('does not retry a same-length digest mismatch, and reports it as a pin problem', async () => {
    corruptedHits = 0;
    const registry = writeFixtureRegistry(scratch, {
      url: `${origin}/same-length-wrong-content`,
      sha256: PAYLOAD_SHA,
      bytes: PAYLOAD.length,
    });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);

    // The load-bearing assertion: it asked once and stopped.
    expect(corruptedHits).toBe(1);
    // A distinct exit code, so the workflow can tell this from an unreachable
    // host. Both are failures; they call for opposite next actions.
    expect(result.status).toBe(2);
    // And both channels name the actual problem rather than the symptom: the
    // per-attempt line on stdout says the lengths agreed, and the summary on
    // stderr says this is not a network failure. Asserted in both places because
    // they are written by different code paths and one of them being wrong is
    // exactly the kind of half-covered judgement this suite exists to catch.
    expect(result.stdout).toMatch(/byte count matches: \d+/);
    expect(result.stderr).toMatch(/byte counts matched/i);
    expect(result.stderr).not.toMatch(/could not be reached/);
  }, 60_000);

  // The exit code has to distinguish the two failure classes.
  //
  // "We could not reach the corpus" and "the corpus is not what we pinned" both
  // end a run, and they lead to opposite responses: the first is retried
  // tomorrow, the second needs a human to look at a digest. Collapsing them
  // into one code is what made the original twelve failures take a re-run to
  // understand.
  it('gives an unreachable asset a different exit code from a pin mismatch', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/broken` });
    const out = makeOut();
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/could not be reached/);
  }, 60_000);
});
