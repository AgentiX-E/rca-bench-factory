import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    if (req.url === '/corpus.zip') {
      if (serveZip === undefined) {
        res.writeHead(404).end('no');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/zip' }).end(serveZip);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/csv' }).end(PAYLOAD);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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

  it('downloads real bytes and reports them as UNPINNED when no digest is recorded', async () => {
    const registry = writeFixtureRegistry(scratch);
    const out = mkdtempSync(join(tmpdir(), 'rca-bench-out-'));
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('UNPINNED');
    expect(result.stdout).toContain(PAYLOAD_SHA);
    expect(readFileSync(join(out, 'fixture-asset'), 'utf8')).toBe(PAYLOAD);
  });

  it('accepts the download when the recorded digest matches', async () => {
    const registry = writeFixtureRegistry(scratch, { sha256: PAYLOAD_SHA, bytes: PAYLOAD.length });
    const out = mkdtempSync(join(tmpdir(), 'rca-bench-out-'));
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('VERIFIED');
  });

  // The pin is the whole reason the registry records a digest. Without this the
  // digest would be documentation, and a substituted or truncated download
  // would flow straight into the round trip.
  it('fails when the recorded digest does not match the bytes served', async () => {
    const wrong = 'a'.repeat(64);
    const registry = writeFixtureRegistry(scratch, { sha256: wrong });
    const out = mkdtempSync(join(tmpdir(), 'rca-bench-out-'));
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/expected sha256/);
    expect(result.stderr).toContain(wrong);
  });

  it('fails when the recorded byte count does not match', async () => {
    const registry = writeFixtureRegistry(scratch, { bytes: PAYLOAD.length + 1 });
    const out = mkdtempSync(join(tmpdir(), 'rca-bench-out-'));
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/expected \d+ bytes/);
  });

  // An unreachable upstream has told us nothing about our exporter, so it must
  // be reported as a legible state naming the anchor -- not as a stack trace,
  // and not as a silent pass.
  it('reports an unreachable asset as SKIPPED, naming it, and exits non-zero', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/broken` });
    const out = mkdtempSync(join(tmpdir(), 'rca-bench-out-'));
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('SKIPPED');
    expect(result.stdout).toContain('fixture-asset');
    expect(result.stderr).toMatch(/could not be reached/);
    expect(result.stderr).not.toMatch(/at Object\./);
  }, 60_000);

  // Extraction is decided by the URL, not by the download succeeding. Running
  // `unzip` over a verified `.csv` failed with "End-of-central-directory
  // signature not found" -- a message about zip internals for an asset that had
  // downloaded and verified correctly, naming neither the asset nor the reason.
  it('does not unpack an asset that is not an archive', async () => {
    const registry = writeFixtureRegistry(scratch);
    const out = mkdtempSync(join(tmpdir(), 'rca-bench-out-'));
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(0);
    expect(result.stderr).not.toMatch(/unzip/);
    expect(readFileSync(join(out, 'fixture-asset'), 'utf8')).toBe(PAYLOAD);
  });

  // The archive path itself. A `.zip` URL is unpacked and the archive removed,
  // so the ingest sees the extracted tree and the job does not hold both copies.
  it('unpacks an archive and removes it, leaving the extracted tree', async () => {
    const registry = writeFixtureRegistry(scratch, { url: `${origin}/corpus.zip`, id: 'fixture-zip' });
    const out = mkdtempSync(join(tmpdir(), 'rca-bench-out-'));
    const result = await runScriptAsync(['--anchor', 'rcaeval-re2', '--out', out, '--registry', registry]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('EXTRACTED fixture-zip');
    expect(readFileSync(join(out, 'dataset', 'case', 'metrics.json'), 'utf8')).toBe(PAYLOAD);
    expect(existsSync(join(out, 'fixture-zip.zip'))).toBe(false);
  });
});
