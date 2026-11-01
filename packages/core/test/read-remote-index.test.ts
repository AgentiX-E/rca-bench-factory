import { spawn, spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

/**
 * `scripts/read-remote-index.mjs`, driven against a real archive over a real socket.
 *
 * The script exists so a 5.2 GB corpus can be censused from 1.2 MB of central directories, and
 * the claim that makes it safe to use is that the entry list it produces is the archive's own
 * -- not a reconstruction. So every test below serves actual bytes: a zip built here by `zip`,
 * sliced by a range-honouring server, and compared against the names the zip really holds.
 *
 * The failures are served rather than simulated, for the same reason. A reader that returned
 * an empty list on a 403 would read as "a corpus with no cases", which is the shape of failure
 * this repository has spent several rounds removing -- so each refusal has to be a non-zero
 * exit carrying a sentence, and it has to be measured.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'read-remote-index.mjs');

/** Declared for rule 7 of `gate-sites-are-proven.test.ts`, which reconciles it against the spawns below. */
const DRIVES = ['scripts/read-remote-index.mjs'];
void DRIVES;

const scratch = mkdtempSync(join(tmpdir(), 'rca-index-test-'));
const servers: Server[] = [];

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
});

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): Promise<Outcome> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, RCA_BENCH_INDEX_BACKOFF: '0' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => resolvePromise({ status: code ?? -1, stdout, stderr }));
  });
}

/**
 * Answer range requests the way the corpus host does, over a body the caller supplies.
 *
 * `queue` makes the first N requests answer with something else: 429 is what the corpus host
 * sends under load, and the reader retries it rather than reporting an archive that is not
 * there.
 */
function serve(body: Buffer, queue: number[] = []): Promise<string> {
  const pending = [...queue];
  const server = createServer((request, response) => {
    const forced = pending.shift();
    if (forced !== undefined) {
      response.writeHead(forced, { 'retry-after': '0' });
      response.end();
      return;
    }
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? '');
    if (match === null) {
      response.writeHead(200, { 'content-length': String(body.length) });
      response.end(body);
      return;
    }
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), body.length - 1);
    const slice = body.subarray(start, end + 1);
    response.writeHead(206, {
      'content-type': 'application/octet-stream',
      'content-length': String(slice.length),
      'content-range': `bytes ${start}-${end}/${body.length}`,
      'accept-ranges': 'bytes',
    });
    response.end(slice);
  });
  servers.push(server);
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('no port');
      resolvePromise(`http://127.0.0.1:${address.port}/corpus.zip`);
    });
  });
}

/**
 * A real zip, built by `zip`, holding one case directory of the corpus's shape.
 *
 * The 256 KiB of incompressible bytes are load-bearing: without them the archive is smaller
 * than the tail window this reader asks for, and a "fetches a fraction" assertion would pass
 * because there was nothing to download. `-D` keeps directory entries out so the expected
 * count is the number of files.
 */
function buildZip(dir: string): Buffer {
  const tree = join(dir, 'RE3-OB', 'adservice_f3', '1');
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, 'inject_time.txt'), '1732000000\n');
  writeFileSync(join(tree, 'metrics.csv'), 'time,adservice_cpu\n1732000000,0.1\n');
  const blob = Buffer.alloc(256 * 1024);
  for (let at = 0; at < blob.length; at += 1) blob[at] = Math.floor(Math.random() * 256);
  writeFileSync(join(tree, 'metrics.png'), blob);
  const archive = join(dir, 'corpus.zip');
  const made = spawnSync('zip', ['-q', '-r', '-D', archive, 'RE3-OB'], { cwd: dir });
  if (made.status !== 0) throw new Error(`zip exited ${String(made.status)}: ${String(made.stderr)}`);
  return readFileSync(archive);
}

/** An end-of-central-directory record with the marker values a zip64 archive uses. */
function zip64Marker(): Buffer {
  const body = Buffer.alloc(512, 0);
  const at = body.length - 22;
  body.writeUInt32LE(0x06054b50, at);
  body.writeUInt16LE(0xffff, at + 10);
  return body;
}

const MAILBOX = buildZip(scratch);

describe('read-remote-index.mjs', () => {
  it('lists the archive’s entries from its central directory and nothing else', async () => {
    const url = await serve(MAILBOX);
    const out = join(scratch, 'index.json');
    const result = await run(['--url', url, '--out', out]);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const document = JSON.parse(readFileSync(out, 'utf8'));
    expect(document.schema).toBe('rca-bench-archive-index/1');
    expect(document.entries).toBe(3);
    expect(document.paths).toContain('RE3-OB/adservice_f3/1/inject_time.txt');
    expect(document.paths).toContain('RE3-OB/adservice_f3/1/metrics.csv');
    expect(document.bytes).toBe(MAILBOX.length);
  });

  it('fetches a fraction of the archive and prints which fraction', async () => {
    const url = await serve(MAILBOX);
    const result = await run(['--url', url, '--out', join(scratch, 'fraction.json')]);
    const line = result.stdout.split('\n').find((one) => one.startsWith('INDEX fetched'));
    expect(line).toBeDefined();
    const match = /INDEX fetched (\d+) of (\d+) byte\(s\) \(([\d.]+)%\)/.exec(line!);
    expect(match).not.toBeNull();
    // The claim is a ratio, so it is asserted as one: a reader that downloaded the whole
    // archive would satisfy every other assertion in this file.
    expect(Number(match![1])).toBeLessThan(Number(match![2]) / 2);
  });

  it('retries a 429 rather than reporting an unreachable archive', async () => {
    const url = await serve(MAILBOX, [429, 429]);
    const out = join(scratch, 'retried.json');
    const result = await run(['--url', url, '--out', out]);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(out)).toBe(true);
  });

  it('exits 1 when the host keeps refusing, and writes nothing', async () => {
    const url = await serve(MAILBOX, [403, 403, 403]);
    const out = join(scratch, 'refused.json');
    const result = await run(['--url', url, '--out', out]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('did not serve');
    expect(existsSync(out)).toBe(false);
  });

  it('exits 2 on bytes that are not a zip archive', async () => {
    const url = await serve(Buffer.alloc(4096, 0x41));
    const result = await run(['--url', url, '--out', join(scratch, 'broken.json')]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('no end-of-central-directory record');
    expect(existsSync(join(scratch, 'broken.json'))).toBe(false);
  });

  it('exits 2 on an archive that needs a zip64 central directory', async () => {
    const url = await serve(zip64Marker());
    const result = await run(['--url', url, '--out', join(scratch, 'zip64.json')]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('needs zip64');
  });

  it('refuses a destination inside the repository', async () => {
    const url = await serve(MAILBOX);
    const inside = join(ROOT, 'golden-master', 'should-never-exist.json');
    const result = await run(['--url', url, '--out', inside]);
    expect(result.status).toBe(3);
    expect(result.stderr).toContain('is inside the repository');
    expect(existsSync(inside)).toBe(false);
  });

  it('names the flag it is missing', async () => {
    const missingUrl = await run(['--out', join(scratch, 'x.json')]);
    expect(missingUrl.status).toBe(3);
    expect(missingUrl.stderr).toContain('--url is required');

    const missingValue = await run(['--url', '--out', join(scratch, 'y.json')]);
    expect(missingValue.status).toBe(3);
    expect(missingValue.stderr).toContain('--url requires a value');

    const missingOut = await run(['--url', 'http://127.0.0.1:1/x.zip']);
    expect(missingOut.status).toBe(3);
    expect(missingOut.stderr).toContain('--out is required');
  });
});
