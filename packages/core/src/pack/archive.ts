import { gzipSync } from 'node:zlib';
import { sha256 } from '../util/hash.js';

/**
 * Reproducible archive packing.
 *
 * A benchmark artefact is only trustworthy if anyone can rebuild it and get the
 * same bytes, so this module writes ustar archives with every volatile field
 * pinned:
 *
 *   - `mtime` is 0 (never the wall clock);
 *   - `uid`/`gid` are 0 and `uname`/`gname` are empty (never the current user);
 *   - entries are sorted by path, so insertion order cannot change the bytes;
 *   - the gzip layer uses a fixed level with the MTIME field zeroed by Node.
 *
 * The archive is paired with a manifest (`path`, `bytes`, `sha256`) so a
 * recipient can verify the extracted tree without trusting the transport.
 *
 * All functions are pure: bytes in, bytes out. No IO, no mocks.
 */

/** One file inside a pack. */
export interface PackEntry {
  /** POSIX-relative path, no leading `./`, no `..`, no backslashes. */
  path: string;
  /** UTF-8 text content. */
  content: string;
  /** Permission bits. Defaults to `0o644`; use `0o755` for scripts. */
  mode?: number;
}

/**
 * A pack entry after normalisation.
 *
 * The only difference from `PackEntry` is that `mode` is resolved, so writers
 * never have to carry a default of their own (and cannot disagree about it).
 */
export interface NormalizedPackEntry extends PackEntry {
  mode: number;
}

/** One row of a pack manifest. */
export interface PackManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
}

/** Verifiable description of a pack's contents. */
export interface PackManifest {
  version: 1;
  fileCount: number;
  totalBytes: number;
  entries: PackManifestEntry[];
}

/** Outcome of checking a set of entries against a manifest. */
export interface PackVerifyResult {
  ok: boolean;
  /** Paths the manifest requires but the entries do not carry. */
  missing: string[];
  /** Paths the entries carry but the manifest does not list. */
  extra: string[];
  /** Paths whose content hash differs from the manifest. */
  checksumMismatch: string[];
  /** Paths whose byte length differs from the manifest. */
  sizeMismatch: string[];
}

const BLOCK = 512;
/** Default permission bits for an archived file. */
export const DEFAULT_FILE_MODE = 0o644;
const USTAR_MAGIC = 'ustar\u0000';
const NAME_LEN = 100;
const PREFIX_LEN = 155;
/** Longest path ustar can express: 155-byte prefix + '/' + 100-byte name. */
const MAX_USTAR_PATH = PREFIX_LEN + 1 + NAME_LEN;

function normalizePath(raw: string): string {
  if (raw === '') throw new Error('pack entry path must not be empty');
  if (raw.includes('\\')) throw new Error(`pack entry path '${raw}' must not contain a backslash`);
  if (raw.startsWith('/')) throw new Error(`pack entry path '${raw}' must be relative, not absolute`);
  const segments = raw.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.some((segment) => segment === '..')) {
    throw new Error(`pack entry path '${raw}' must not traverse upwards (..)`);
  }
  const path = segments.join('/');
  if (path === '') throw new Error(`pack entry path '${raw}' resolves to an empty path`);
  return path;
}

/**
 * Validate, canonicalise and sort pack entries.
 *
 * Sorting happens here rather than at write time so every consumer (tar writer,
 * manifest builder, verifier) sees one canonical order.
 */
export function normalizePackEntries(entries: readonly PackEntry[]): NormalizedPackEntry[] {
  const byPath = new Map<string, NormalizedPackEntry>();
  for (const entry of entries) {
    const path = normalizePath(entry.path);
    if (byPath.has(path)) throw new Error(`duplicate pack entry path '${path}'`);
    byPath.set(path, { path, content: entry.content, mode: entry.mode ?? DEFAULT_FILE_MODE });
  }
  // Duplicates are rejected above, so the comparator never sees two equal paths.
  return [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * Write a NUL-padded fixed-width field.
 *
 * Callers own the length invariant: `splitUstarName` guarantees the name and
 * prefix fit, and every other field is a constant.
 */
function writeField(header: Buffer, value: string, offset: number, length: number): void {
  header.write(value, offset, length, 'binary');
}

function writeOctal(header: Buffer, value: number, offset: number, length: number): void {
  const digits = value.toString(8);
  if (digits.length > length - 1) {
    throw new Error(`ustar field at ${offset} cannot hold value ${value} (max ${length - 1} octal digits)`);
  }
  writeField(header, `${digits.padStart(length - 1, '0')}\u0000`, offset, length);
}

function readField(header: Buffer, offset: number, length: number): string {
  return header.subarray(offset, offset + length).toString('binary').replace(/\0+$/, '');
}

function parseOctal(raw: string, field: string): number {
  const value = Number.parseInt(raw.trim(), 8);
  if (!Number.isFinite(value)) throw new Error(`ustar ${field} field '${raw}' is not octal`);
  return value;
}

/**
 * Split a path across the ustar `prefix` and `name` fields.
 *
 * The shortest prefix that leaves a legal name is chosen, which keeps the name
 * field as informative as possible for tools that ignore `prefix`.
 */
function splitUstarName(path: string): { name: string; prefix: string } {
  if (path.length <= NAME_LEN) return { name: path, prefix: '' };
  for (let i = Math.max(0, path.length - NAME_LEN - 1); i <= PREFIX_LEN && i < path.length; i += 1) {
    if (path[i] === '/' && path.length - i - 1 <= NAME_LEN) {
      return { name: path.slice(i + 1), prefix: path.slice(0, i) };
    }
  }
  throw new Error(`pack entry path is too long for ustar (${path.length} bytes, max ${MAX_USTAR_PATH})`);
}

function pad(length: number): number {
  const remainder = length % BLOCK;
  return remainder === 0 ? 0 : BLOCK - remainder;
}

/** Write a reproducible ustar archive containing `entries`. */
export function createTar(entries: readonly PackEntry[]): Uint8Array {
  const normalized = normalizePackEntries(entries);
  const blocks: Buffer[] = [];

  for (const entry of normalized) {
    const body = Buffer.from(entry.content, 'utf8');
    const { name, prefix } = splitUstarName(entry.path);
    const header = Buffer.alloc(BLOCK);

    writeField(header, name, 0, NAME_LEN);
    writeOctal(header, entry.mode, 100, 8);
    writeOctal(header, 0, 108, 8); // uid - pinned for reproducibility
    writeOctal(header, 0, 116, 8); // gid - pinned for reproducibility
    writeOctal(header, body.length, 124, 12);
    writeOctal(header, 0, 136, 12); // mtime - pinned for reproducibility
    header.fill(0x20, 148, 156); // the checksum field counts as spaces
    writeField(header, '0', 156, 1); // typeflag: regular file
    writeField(header, USTAR_MAGIC, 257, 6);
    writeField(header, '00', 263, 2);
    writeField(header, prefix, 345, PREFIX_LEN);

    let sum = 0;
    for (const byte of header) sum += byte;
    writeField(header, `${sum.toString(8).padStart(6, '0')}\u0000 `, 148, 8);

    blocks.push(header, body, Buffer.alloc(pad(body.length)));
  }

  // Two zero blocks mark the end of the archive.
  blocks.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(blocks);
}

/** Write a reproducible gzip-compressed ustar archive containing `entries`. */
export function createTarGzip(entries: readonly PackEntry[]): Uint8Array {
  return gzipSync(createTar(entries), { level: 9 });
}

/**
 * Read a ustar archive back into entries.
 *
 * The parser exists so a pack can be verified after transport: it validates the
 * magic, every header checksum and the declared sizes, and it reads archives
 * written by other tools (a GNU tar archive is a fixture in the test suite).
 */
export function readTar(bytes: Uint8Array): PackEntry[] {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const entries: PackEntry[] = [];
  let offset = 0;

  while (offset < buf.length) {
    if (offset + BLOCK > buf.length) {
      throw new Error(`archive truncated: ${buf.length - offset} trailing byte(s) are shorter than a ${BLOCK}-byte header block`);
    }
    const header = buf.subarray(offset, offset + BLOCK);
    // Two zero blocks (or the padding after them) end the archive.
    if (header.every((byte) => byte === 0)) break;
    offset += BLOCK;

    const magic = header.subarray(257, 263).toString('binary');
    if (magic !== USTAR_MAGIC) {
      throw new Error(`not a ustar archive: bad magic at block ${(offset - BLOCK) / BLOCK}`);
    }

    let sum = 0;
    for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : header[i]!;
    const declared = parseOctal(readField(header, 148, 8), 'checksum');
    if (sum !== declared) {
      throw new Error(`header checksum mismatch at block ${(offset - BLOCK) / BLOCK}: computed ${sum}, stored ${declared}`);
    }

    const typeflag = String.fromCharCode(header[156]!);
    if (typeflag !== '0' && typeflag !== '\u0000') {
      throw new Error(`unsupported entry type '${typeflag}' at block ${(offset - BLOCK) / BLOCK}; only regular files are packed`);
    }

    const size = parseOctal(readField(header, 124, 12), 'size');
    const name = readField(header, 0, NAME_LEN);
    const prefix = readField(header, 345, PREFIX_LEN);
    const path = prefix === '' ? name : `${prefix}/${name}`;

    if (offset + size > buf.length) {
      throw new Error(`archive truncated: entry '${path}' declares ${size} bytes but only ${buf.length - offset} remain`);
    }
    const content = buf.subarray(offset, offset + size).toString('utf8');
    offset += Math.ceil(size / BLOCK) * BLOCK;

    entries.push({ path, content, mode: parseOctal(readField(header, 100, 8), 'mode') });
  }

  return entries;
}

/** Describe a set of entries so a recipient can verify them without the sender. */
export function buildPackManifest(entries: readonly PackEntry[]): PackManifest {
  const list = normalizePackEntries(entries).map((entry) => ({
    path: entry.path,
    bytes: Buffer.byteLength(entry.content, 'utf8'),
    sha256: sha256(entry.content),
  }));
  return {
    version: 1,
    fileCount: list.length,
    totalBytes: list.reduce((total, entry) => total + entry.bytes, 0),
    entries: list,
  };
}

/** Render a manifest as stable, pretty-printed JSON with a trailing newline. */
export function renderPackManifest(manifest: PackManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Check entries against a manifest.
 *
 * Size and hash are reported separately: a size mismatch alone means the file
 * was truncated in transit, while a hash mismatch with the same size means it
 * was altered. Both are failures, but they have different causes.
 */
export function verifyPackManifest(entries: readonly PackEntry[], manifest: PackManifest): PackVerifyResult {
  const actual = new Map(buildPackManifest(entries).entries.map((entry) => [entry.path, entry]));
  const expected = new Map(manifest.entries.map((entry) => [entry.path, entry]));

  const missing: string[] = [];
  const extra: string[] = [];
  const checksumMismatch: string[] = [];
  const sizeMismatch: string[] = [];

  for (const path of expected.keys()) if (!actual.has(path)) missing.push(path);
  for (const path of actual.keys()) if (!expected.has(path)) extra.push(path);

  for (const [path, want] of expected) {
    const got = actual.get(path);
    if (got === undefined) continue;
    if (got.sha256 !== want.sha256) checksumMismatch.push(path);
    if (got.bytes !== want.bytes) sizeMismatch.push(path);
  }

  const sort = (paths: string[]): string[] => [...paths].sort();
  const result: PackVerifyResult = {
    ok: missing.length === 0 && extra.length === 0 && checksumMismatch.length === 0 && sizeMismatch.length === 0,
    missing: sort(missing),
    extra: sort(extra),
    checksumMismatch: sort(checksumMismatch),
    sizeMismatch: sort(sizeMismatch),
  };
  return result;
}
