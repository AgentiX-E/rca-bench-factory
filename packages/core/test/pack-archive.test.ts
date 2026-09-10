import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  buildPackManifest,
  createTar,
  createTarGzip,
  normalizePackEntries,
  readTar,
  renderPackManifest,
  verifyPackManifest,
} from '../src/pack/archive.js';
import type { PackEntry } from '../src/pack/archive.js';

/**
 * Archive (pack) module tests.
 *
 * The hard contract is *reproducibility*: the same entries must always produce
 * the same bytes, on any machine, at any time. Two independent grounds back it:
 *
 *  1. `fixtures/foreign-ustar.tar.b64` is a real GNU tar archive (ustar, mtime
 *     0, uid/gid 0) containing a short name, a nested name and a name long
 *     enough to require ustar `prefix` splitting. Our parser must read it.
 *  2. Header field assertions are made directly against the ustar layout, so a
 *     regression that smuggles `Date.now()` into `mtime` fails even when two
 *     consecutive runs happen to land in the same second.
 *
 * No mocks: every assertion runs on real bytes produced by real code.
 */

const FOREIGN_TAR = Buffer.from(
  readFileSync(new URL('./fixtures/foreign-ustar.tar.b64', import.meta.url), 'utf8'),
  'base64',
);

/** Read one ustar header block and decode its fixed-width fields. */
function headerAt(tar: Uint8Array, index: number) {
  const start = index * 512;
  const field = (from: number, to: number): string =>
    Buffer.from(tar.subarray(start + from, start + to)).toString('binary').replace(/\0+$/, '');
  return {
    name: field(0, 100),
    mode: field(100, 108),
    uid: field(108, 116),
    gid: field(116, 124),
    size: field(124, 136),
    mtime: field(136, 148),
    chksum: field(148, 156),
    typeflag: field(156, 157),
    magic: Buffer.from(tar.subarray(start + 257, start + 263)).toString('binary'),
    version: field(263, 265),
    prefix: field(345, 500),
  };
}

const longPath =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/' +
  'cccccccccccccccccccccccccccccccc/d.txt';

describe('normalizePackEntries', () => {
  it('sorts entries by path so the archive is independent of insertion order', () => {
    const out = normalizePackEntries([
      { path: 'b.txt', content: 'b' },
      { path: 'a.txt', content: 'a' },
      { path: 'm/n.txt', content: 'n' },
    ]);
    expect(out.map((e) => e.path)).toEqual(['a.txt', 'b.txt', 'm/n.txt']);
  });

  it('strips leading ./ and collapses repeated separators', () => {
    const out = normalizePackEntries([{ path: './a//b/./c.txt', content: 'x' }]);
    expect(out.map((e) => e.path)).toEqual(['a/b/c.txt']);
  });

  it('rejects an empty path', () => {
    expect(() => normalizePackEntries([{ path: '', content: 'x' }])).toThrow(/must not be empty/);
  });

  it('rejects a path that normalizes to nothing', () => {
    expect(() => normalizePackEntries([{ path: './', content: 'x' }])).toThrow(/empty path/);
  });

  it('rejects an absolute path', () => {
    expect(() => normalizePackEntries([{ path: '/etc/passwd', content: 'x' }])).toThrow(/absolute/);
  });

  it('rejects a parent-traversal segment', () => {
    expect(() => normalizePackEntries([{ path: 'a/../../b.txt', content: 'x' }])).toThrow(/traverse upwards/);
    expect(() => normalizePackEntries([{ path: '../b.txt', content: 'x' }])).toThrow(/traverse upwards/);
  });

  it('rejects a windows separator so the archive stays POSIX-only', () => {
    expect(() => normalizePackEntries([{ path: 'a\\b.txt', content: 'x' }])).toThrow(/backslash/);
  });

  it('rejects duplicate paths', () => {
    expect(() =>
      normalizePackEntries([
        { path: 'a.txt', content: '1' },
        { path: './a.txt', content: '2' },
      ]),
    ).toThrow(/duplicate/);
  });

  it('keeps an explicit mode and defaults the rest', () => {
    const out = normalizePackEntries([
      { path: 'run.sh', content: '#!/bin/sh\n', mode: 0o755 },
      { path: 'a.txt', content: 'a' },
    ]);
    // Sorted by path, so `a.txt` (default mode) comes before `run.sh` (0755).
    expect(out.map((e) => [e.path, e.mode])).toEqual([
      ['a.txt', 0o644],
      ['run.sh', 0o755],
    ]);
  });

  it('accepts an empty entry list', () => {
    expect(normalizePackEntries([])).toEqual([]);
  });
});

describe('createTar', () => {
  it('emits a whole number of 512-byte blocks terminated by the end-of-archive marker', () => {
    const tar = createTar([{ path: 'a.txt', content: 'hello\n' }]);
    expect(tar.length % 512).toBe(0);
    // header + one data block + two zero blocks
    expect(tar.length).toBe(512 * 4);
    expect(tar.subarray(512 * 2).every((b) => b === 0)).toBe(true);
  });

  it('writes ustar headers with zeroed mtime/uid/gid so the bytes are reproducible', () => {
    const tar = createTar([{ path: 'a.txt', content: 'hello\n' }]);
    const h = headerAt(tar, 0);
    expect(h.name).toBe('a.txt');
    expect(h.mode).toBe('0000644');
    expect(h.uid).toBe('0000000');
    expect(h.gid).toBe('0000000');
    expect(h.size).toBe('00000000006');
    expect(h.mtime).toBe('00000000000');
    expect(h.typeflag).toBe('0');
    expect(h.magic).toBe('ustar\u0000');
    expect(h.version).toBe('00');
    expect(h.prefix).toBe('');
  });

  it('is byte-identical for the same entries and independent of insertion order', () => {
    const a = createTar([{ path: 'a.txt', content: '1' }, { path: 'b.txt', content: '2' }]);
    const b = createTar([{ path: 'b.txt', content: '2' }, { path: 'a.txt', content: '1' }]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('splits a path longer than 100 bytes across the ustar prefix field', () => {
    const tar = createTar([{ path: longPath, content: 'deep\n' }]);
    const h = headerAt(tar, 0);
    expect(h.prefix.length).toBeGreaterThan(0);
    expect(`${h.prefix}/${h.name}`).toBe(longPath);
    expect(readTar(tar)).toEqual([{ path: longPath, content: 'deep\n', mode: 0o644 }]);
  });

  it('rejects a path too long to be represented even with the prefix field', () => {
    expect(() => createTar([{ path: 'a'.repeat(120), content: 'x' }])).toThrow(/too long/);
  });

  it('rejects a mode that does not fit the octal mode field', () => {
    expect(() => createTar([{ path: 'a.txt', content: 'x', mode: 0o77777777 }])).toThrow(/octal digits/);
  });

  it('rejects a prefix longer than the 155-byte ustar field', () => {
    const path = `${'p'.repeat(200)}/name.txt`;
    expect(() => createTar([{ path, content: 'x' }])).toThrow(/too long/);
  });

  it('produces a valid archive for zero entries', () => {
    const tar = createTar([]);
    expect(tar.length).toBe(1024);
    expect(readTar(tar)).toEqual([]);
  });
});

describe('createTarGzip', () => {
  it('produces a gzip stream that decompresses to the exact tar bytes', () => {
    const entries: PackEntry[] = [{ path: 'a.txt', content: 'hello\n' }];
    const tar = createTar(entries);
    const gz = createTarGzip(entries);
    expect([gz[0], gz[1]]).toEqual([0x1f, 0x8b]);
    expect(Buffer.from(gunzipSync(gz)).equals(Buffer.from(tar))).toBe(true);
  });

  it('is byte-identical across runs', () => {
    const entries: PackEntry[] = [{ path: 'a.txt', content: 'hello\n' }, { path: 'b/c.txt', content: 'x'.repeat(5000) }];
    expect(Buffer.from(createTarGzip(entries)).equals(Buffer.from(createTarGzip(entries)))).toBe(true);
  });
});

describe('readTar', () => {
  it('round-trips content byte-exactly, including multibyte and empty files', () => {
    const entries: PackEntry[] = [
      { path: 'utf8.txt', content: '订单—服务 ✓\n' },
      { path: 'empty.txt', content: '' },
      { path: 'big.txt', content: 'x'.repeat(5000) },
      { path: 'crlf.txt', content: 'a\r\nb\r\n' },
    ];
    const byPath = (list: PackEntry[]): PackEntry[] => [...list].sort((a, b) => (a.path < b.path ? -1 : 1));
    expect(byPath(readTar(createTar(entries)))).toEqual(byPath(entries.map((e) => ({ ...e, mode: 0o644 }))));
  });

  it('preserves an executable mode across the round trip', () => {
    const tar = createTar([{ path: 'run.sh', content: '#!/bin/sh\n', mode: 0o755 }]);
    expect(readTar(tar)).toEqual([{ path: 'run.sh', content: '#!/bin/sh\n', mode: 0o755 }]);
  });

  it('reads an archive produced by GNU tar, including prefix splitting', () => {
    const entries = readTar(FOREIGN_TAR);
    expect(entries.map((e) => e.path)).toEqual(['a.txt', 'dir/b.txt', longPath]);
    expect(entries.map((e) => e.content)).toEqual(['hello\n', 'world\n', 'deep\n']);
  });

  it('stops at the end-of-archive marker and ignores trailing padding', () => {
    const tar = createTar([{ path: 'a.txt', content: 'hello\n' }]);
    const padded = Buffer.concat([Buffer.from(tar), Buffer.alloc(4096)]);
    expect(readTar(padded).map((e) => e.path)).toEqual(['a.txt']);
  });

  it('rejects a truncated content block', () => {
    const tar = createTar([{ path: 'a.txt', content: 'x'.repeat(1000) }]);
    expect(() => readTar(tar.subarray(0, 1024))).toThrow(/truncated/);
  });

  it('rejects a truncated header block', () => {
    const tar = createTar([{ path: 'a.txt', content: 'x' }]);
    expect(() => readTar(tar.subarray(0, 500))).toThrow(/truncated/);
  });

  it('rejects a corrupt header checksum', () => {
    const tar = Buffer.from(createTar([{ path: 'a.txt', content: 'x' }]));
    tar[0] = 0x7a; // corrupt the name, leaving the checksum stale
    expect(() => readTar(tar)).toThrow(/checksum/);
  });

  it('rejects a non-ustar archive', () => {
    const fake = Buffer.alloc(1024, 0x20);
    fake.write('notustar', 257, 'binary');
    expect(() => readTar(fake)).toThrow(/ustar/);
  });

  it('accepts a plain Uint8Array as well as a Buffer', () => {
    const tar = createTar([{ path: 'a.txt', content: 'hello\n' }]);
    // A caller reading a fetched body gets a Uint8Array, not a Buffer.
    expect(readTar(new Uint8Array(tar))).toEqual([{ path: 'a.txt', content: 'hello\n', mode: 0o644 }]);
  });

  it('rejects a size field that is not octal', () => {
    const tar = Buffer.from(createTar([{ path: 'a.txt', content: 'x' }]));
    tar.write('zzzzzzzzzzz', 124, 'binary');
    let sum = 0;
    for (let i = 0; i < 512; i += 1) sum += i >= 148 && i < 156 ? 0x20 : tar[i]!;
    tar.write(`${sum.toString(8).padStart(6, '0')}\u0000 `, 148, 'binary');
    expect(() => readTar(tar)).toThrow(/not octal/);
  });

  it('rejects an entry type it does not support', () => {
    const tar = Buffer.from(createTar([{ path: 'a.txt', content: 'x' }]));
    tar[156] = 0x32; // '2' = symlink
    // Fix the checksum so the failure is the type, not the checksum.
    let sum = 0;
    for (let i = 0; i < 512; i += 1) sum += i >= 148 && i < 156 ? 0x20 : tar[i]!;
    tar.write(`${sum.toString(8).padStart(6, '0')}\u0000 `, 148, 'binary');
    expect(() => readTar(tar)).toThrow(/unsupported entry type/);
  });
});

describe('buildPackManifest', () => {
  const entries: PackEntry[] = [
    { path: 'b.txt', content: 'bb' },
    { path: 'a.txt', content: '订单' },
  ];

  it('records path, UTF-8 byte length and sha256 for every entry, sorted by path', () => {
    const manifest = buildPackManifest(entries);
    expect(manifest.entries.map((e) => e.path)).toEqual(['a.txt', 'b.txt']);
    // '订单' is two characters but six UTF-8 bytes.
    expect(manifest.entries[0]).toEqual({
      path: 'a.txt',
      bytes: 6,
      sha256: '3d5436ea23d2e9a23eceecf41eaf15de80b51c12c649a07064e02373d2edf61a',
    });
  });

  it('aggregates file count and total bytes', () => {
    const manifest = buildPackManifest(entries);
    expect(manifest.fileCount).toBe(2);
    expect(manifest.totalBytes).toBe(8);
  });

  it('is stable for the same entry set in any order', () => {
    expect(buildPackManifest(entries)).toEqual(buildPackManifest([...entries].reverse()));
  });
});

describe('renderPackManifest', () => {
  it('renders stable JSON with a trailing newline', () => {
    const json = renderPackManifest(buildPackManifest([{ path: 'a.txt', content: 'a' }]));
    expect(json.endsWith('\n')).toBe(true);
    expect(JSON.parse(json)).toEqual({
      version: 1,
      fileCount: 1,
      totalBytes: 1,
      entries: [{ path: 'a.txt', bytes: 1, sha256: expect.any(String) }],
    });
  });
});

describe('verifyPackManifest', () => {
  const entries: PackEntry[] = [{ path: 'a.txt', content: 'a' }, { path: 'b.txt', content: 'b' }];

  it('passes for a matching entry set', () => {
    const result = verifyPackManifest(entries, buildPackManifest(entries));
    expect(result).toEqual({ ok: true, missing: [], extra: [], checksumMismatch: [], sizeMismatch: [] });
  });

  it('reports a missing file', () => {
    const result = verifyPackManifest([entries[0]!], buildPackManifest(entries));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['b.txt']);
  });

  it('reports an extra file', () => {
    const result = verifyPackManifest([...entries, { path: 'c.txt', content: 'c' }], buildPackManifest(entries));
    expect(result.ok).toBe(false);
    expect(result.extra).toEqual(['c.txt']);
  });

  it('reports a content change as a checksum mismatch', () => {
    const manifest = buildPackManifest(entries);
    const result = verifyPackManifest([{ path: 'a.txt', content: 'z' }, entries[1]!], manifest);
    expect(result.ok).toBe(false);
    expect(result.checksumMismatch).toEqual(['a.txt']);
    expect(result.sizeMismatch).toEqual([]);
  });

  it('reports a size change that keeps the length but changes the bytes', () => {
    const manifest = buildPackManifest([{ path: 'a.txt', content: 'aa' }]);
    const result = verifyPackManifest([{ path: 'a.txt', content: 'ab' }], manifest);
    expect(result.ok).toBe(false);
    expect(result.checksumMismatch).toEqual(['a.txt']);
  });

  it('reports a size mismatch separately from a checksum mismatch', () => {
    const manifest = buildPackManifest([{ path: 'a.txt', content: 'aa' }]);
    const tampered = {
      ...manifest,
      entries: manifest.entries.map((e) => ({ ...e, bytes: 99 })),
    };
    const result = verifyPackManifest([{ path: 'a.txt', content: 'aa' }], tampered);
    expect(result.ok).toBe(false);
    expect(result.sizeMismatch).toEqual(['a.txt']);
    expect(result.checksumMismatch).toEqual([]);
  });
});
