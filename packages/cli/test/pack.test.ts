import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../src/run.js';
import { readTar } from '@rca-bench-factory/core';

/**
 * `rca-bench pack` tests.
 *
 * The command is exercised against a real temporary directory, and the archive it
 * writes is read back by this package's own reader on every platform. Where the
 * host also provides a `tar` binary, the same archive is cross-checked against
 * it: a pack that only its own writer understands is worthless to whoever
 * downloaded it.
 */

const execFileAsync = promisify(execFile);
const dirs: string[] = [];

async function makeDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'rca-bench-pack-'));
  dirs.push(d);
  return d;
}

afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs.length = 0;
});

async function writeTree(dir: string): Promise<void> {
  await mkdir(join(dir, 'nested'), { recursive: true });
  await writeFile(join(dir, 'a.txt'), 'hello\n');
  await writeFile(join(dir, 'nested', 'b.json'), '{"b":true}\n');
}

/** Entries of an archive, read back through this package's own tar reader. */
function entriesOf(path: string): { path: string; content: string }[] {
  return readTar(gunzipSync(readFileSync(path))).map((entry) => ({ path: entry.path, content: entry.content }));
}

/** True when the host provides a `tar` binary to cross-check against. */
async function tarAvailable(): Promise<boolean> {
  try {
    await execFileAsync('tar', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function tarList(archive: string): Promise<string[]> {
  const { stdout } = await execFileAsync('tar', ['-tzf', archive]);
  return stdout.split('\n').filter((line) => line !== '').sort();
}

describe('rca-bench pack', () => {
  it('writes a reproducible archive and reports its digest', async () => {
    const dir = await makeDir();
    await writeTree(join(dir, 'src'));
    const out = join(dir, 'out', 'pack.tar.gz');
    const stdout: string[] = [];

    const code = await run(['pack', '--input', 'src', '--output', 'out/pack.tar.gz'], { cwd: dir, stdout: (c) => stdout.push(c) });
    expect(code).toBe(0);

    const summary = JSON.parse(stdout.join(''));
    expect(summary.output).toBe('out/pack.tar.gz');
    expect(summary.fileCount).toBe(2);
    expect(summary.totalBytes).toBe(Buffer.byteLength('hello\n') + Buffer.byteLength('{"b":true}\n'));
    expect(summary.archiveBytes).toBeGreaterThan(0);
    expect(summary.sha256).toMatch(/^[0-9a-f]{64}$/);

    const first = await readFile(out);
    await run(['pack', '--input', 'src', '--output', 'out/pack.tar.gz'], { cwd: dir, stdout: () => {} });
    const second = await readFile(out);
    expect(second.equals(first)).toBe(true);
  });

  it('ships a verified manifest alongside the packed files', async () => {
    const dir = await makeDir();
    await writeTree(join(dir, 'src'));
    await run(['pack', '--input', 'src', '--output', 'pack.tar.gz'], { cwd: dir, stdout: () => {} });

    const entries = entriesOf(join(dir, 'pack.tar.gz'));
    expect(entries.map((e) => e.path)).toEqual(['MANIFEST.json', 'a.txt', 'nested/b.json']);

    const manifest = JSON.parse(entries.find((e) => e.path === 'MANIFEST.json')!.content);
    expect(manifest.fileCount).toBe(2);
    expect(manifest.entries).toEqual([
      { path: 'a.txt', bytes: Buffer.byteLength('hello\n'), sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { path: 'nested/b.json', bytes: Buffer.byteLength('{"b":true}\n'), sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);
  });

  it('preserves nested paths and content byte-exactly', async () => {
    const dir = await makeDir();
    await writeTree(join(dir, 'src'));
    await run(['pack', '--input', 'src', '--output', 'pack.tar.gz'], { cwd: dir, stdout: () => {} });

    const entries = entriesOf(join(dir, 'pack.tar.gz'));
    expect(entries.find((e) => e.path === 'a.txt')!.content).toBe('hello\n');
    expect(entries.find((e) => e.path === 'nested/b.json')!.content).toBe('{"b":true}\n');
  });

  it('is listed correctly by the system tar when one is available', async () => {
    const dir = await makeDir();
    await writeTree(join(dir, 'src'));
    const out = join(dir, 'pack.tar.gz');
    await run(['pack', '--input', 'src', '--output', 'pack.tar.gz'], { cwd: dir, stdout: () => {} });

    if (await tarAvailable()) {
      expect(await tarList(out)).toEqual(['MANIFEST.json', 'a.txt', 'nested/b.json'].sort());
    } else {
      expect(entriesOf(out).map((e) => e.path)).toEqual(['MANIFEST.json', 'a.txt', 'nested/b.json']);
    }
  });

  it('nests every path under --prefix and strips it from the manifest', async () => {
    const dir = await makeDir();
    await writeTree(join(dir, 'src'));
    const out = join(dir, 'pack.tar.gz');
    const code = await run(['pack', '--input', 'src', '--output', 'pack.tar.gz', '--prefix', 'bundle'], {
      cwd: dir,
      stdout: () => {},
    });
    expect(code).toBe(0);

    const entries = entriesOf(out);
    expect(entries.map((e) => e.path)).toEqual(['bundle/MANIFEST.json', 'bundle/a.txt', 'bundle/nested/b.json']);

    const manifest = JSON.parse(entries.find((e) => e.path === 'bundle/MANIFEST.json')!.content);
    expect(manifest.entries.map((e: { path: string }) => e.path)).toEqual(['a.txt', 'nested/b.json']);

    if (await tarAvailable()) {
      expect(await tarList(out)).toEqual(['bundle/MANIFEST.json', 'bundle/a.txt', 'bundle/nested/b.json'].sort());
    }
  });

  it('refuses a directory that already reserves MANIFEST.json', async () => {
    const dir = await makeDir();
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'MANIFEST.json'), '{}');
    const stderr: string[] = [];
    const code = await run(['pack', '--input', 'src', '--output', 'pack.tar.gz'], {
      cwd: dir,
      stdout: () => {},
      stderr: (c) => stderr.push(c),
    });
    expect(code).toBe(1);
    expect(stderr.join('')).toContain('MANIFEST.json');
  });

  it('reports a missing input directory as an error, not a silently empty pack', async () => {
    const dir = await makeDir();
    const stderr: string[] = [];
    const code = await run(['pack', '--input', 'does-not-exist', '--output', 'pack.tar.gz'], {
      cwd: dir,
      stdout: () => {},
      stderr: (c) => stderr.push(c),
    });
    expect(code).toBe(1);
    expect(stderr.join('')).toContain('error:');
  });

  it('rejects an empty --prefix', async () => {
    const dir = await makeDir();
    await writeTree(join(dir, 'src'));
    const stderr: string[] = [];
    const code = await run(['pack', '--input', 'src', '--output', 'pack.tar.gz', '--prefix', ''], {
      cwd: dir,
      stdout: () => {},
      stderr: (c) => stderr.push(c),
    });
    expect(code).toBe(1);
    expect(stderr.join('')).toContain('--prefix');
  });

  it('requires --input and --output', async () => {
    const dir = await makeDir();
    const stderr: string[] = [];
    await writeTree(join(dir, 'src'));
    expect(await run(['pack', '--output', 'pack.tar.gz'], { cwd: dir, stdout: () => {}, stderr: (c) => stderr.push(c) })).toBe(1);
    expect(await run(['pack', '--input', 'src'], { cwd: dir, stdout: () => {}, stderr: (c) => stderr.push(c) })).toBe(1);
    expect(stderr.join('')).toContain('--input');
    expect(stderr.join('')).toContain('--output');
  });

  it('is advertised in the help text', async () => {
    const dir = await makeDir();
    const stdout: string[] = [];
    await run(['help'], { cwd: dir, stdout: (c) => stdout.push(c) });
    expect(stdout.join('')).toContain('pack');
  });

  it('creates the output directory when it does not exist', async () => {
    const dir = await makeDir();
    await writeTree(join(dir, 'src'));
    await run(['pack', '--input', 'src', '--output', 'deep/nested/pack.tar.gz'], { cwd: dir, stdout: () => {} });
    const bytes = await readFile(resolve(dir, 'deep/nested/pack.tar.gz'));
    expect(bytes.length).toBeGreaterThan(0);
  });
});
