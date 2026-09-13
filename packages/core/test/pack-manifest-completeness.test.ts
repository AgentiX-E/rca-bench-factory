import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  MANIFEST_FILE_NAME,
  buildPackManifest,
  createTarGzip,
  normalizePackEntries,
  readTar,
  renderPackManifest,
  verifyPackManifest,
  type PackEntry,
} from '../src/index.js';

/**
 * The pack manifest's completeness contract.
 *
 * `fileCount` is read by humans and by CI as "how many files are in this
 * archive". Every assertion below compares a reported count against the tree it
 * describes, rather than comparing one internal number against another: a
 * manifest that agrees with itself while disagreeing with the archive is the
 * failure this file exists to catch.
 */

/** Every entry a recipient sees after extracting an archive byte-for-byte. */
function extractedEntries(archive: Uint8Array): PackEntry[] {
  return readTar(gunzipSync(archive)).map((entry) => ({
    path: entry.path,
    content: entry.content,
  }));
}

/** Build an archive the way every caller does: content first, manifest last. */
function packWithManifest(content: PackEntry[]): PackEntry[] {
  const normalized = normalizePackEntries(content);
  const manifest = renderPackManifest(buildPackManifest(normalized));
  return normalizePackEntries([...normalized, { path: MANIFEST_FILE_NAME, content: manifest }]);
}

describe('MANIFEST_FILE_NAME', () => {
  it('is the single name every part of the packer agrees on', () => {
    // The literal appears in the archive, the reserved-name refusal and the
    // manifest describing itself. Exporting it means those three cannot drift.
    expect(MANIFEST_FILE_NAME).toBe('MANIFEST.json');
  });
});

describe('buildPackManifest completeness', () => {
  const content: PackEntry[] = [
    { path: 'a.txt', content: 'a' },
    { path: 'b.txt', content: 'b' },
  ];

  it('reports the number of content files it describes', () => {
    expect(buildPackManifest(content).fileCount).toBe(2);
  });

  it('excludes the manifest from the rows it lists and says so in its count', () => {
    const entries = packWithManifest(content);
    const manifest = JSON.parse(
      entries.find((e) => e.path === MANIFEST_FILE_NAME)!.content,
    );

    // The rows describe content only: the manifest cannot contain its own hash.
    expect(manifest.entries.map((e: { path: string }) => e.path)).toEqual(['a.txt', 'b.txt']);
    // ...and the count matches those rows, so it cannot claim to count the
    // archive while listing only its content.
    expect(manifest.fileCount).toBe(manifest.entries.length);
    expect(manifest.fileCount).toBe(2);
  });

  it('accounts for the manifest in the archive total, so both numbers are named', () => {
    const entries = packWithManifest(content);
    const manifest = JSON.parse(
      entries.find((e) => e.path === MANIFEST_FILE_NAME)!.content,
    );

    // A recipient extracting this archive gets three files. `fileCount` is a
    // content count, so the archive total needs its own name rather than
    // reusing `fileCount` for a second meaning.
    expect(entries.length).toBe(3);
    expect(manifest.archiveFileCount).toBe(3);
    expect(manifest.fileCount).toBe(manifest.archiveFileCount - 1);
  });

  it('keeps archiveFileCount equal to the archive it travelled inside', () => {
    const entries = packWithManifest(content);
    const restored = extractedEntries(createTarGzip(entries));
    const manifest = JSON.parse(
      restored.find((e) => e.path === MANIFEST_FILE_NAME)!.content,
    );
    expect(manifest.archiveFileCount).toBe(restored.length);
  });
});

describe('verifyPackManifest and the manifest it travels with', () => {
  const content: PackEntry[] = [{ path: 'a.txt', content: 'a' }];

  it('verifies a pack built by this module, including its own manifest', () => {
    const entries = packWithManifest(content);
    const manifest = JSON.parse(
      entries.find((e) => e.path === MANIFEST_FILE_NAME)!.content,
    );

    // A recipient hands the verifier everything they extracted. The verifier
    // must not then report the manifest -- a file the packer wrote -- as a file
    // the packer did not declare.
    expect(verifyPackManifest(entries, manifest)).toEqual({
      ok: true,
      missing: [],
      extra: [],
      checksumMismatch: [],
      sizeMismatch: [],
    });
  });

  it('still reports a file the manifest does not describe', () => {
    const entries = packWithManifest(content);
    const manifest = JSON.parse(
      entries.find((e) => e.path === MANIFEST_FILE_NAME)!.content,
    );
    const tampered = [...entries, { path: 'injected.txt', content: 'x' }];

    // Excluding the manifest must not blunt the check: a genuinely undeclared
    // file is still undeclared.
    const result = verifyPackManifest(tampered, manifest);
    expect(result.ok).toBe(false);
    expect(result.extra).toEqual(['injected.txt']);
  });

  it('still reports a content file the manifest requires but the pack lacks', () => {
    const entries = packWithManifest(content);
    const manifest = JSON.parse(
      entries.find((e) => e.path === MANIFEST_FILE_NAME)!.content,
    );
    const without = entries.filter((e) => e.path !== 'a.txt');

    const result = verifyPackManifest(without, manifest);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['a.txt']);
  });

  it('reports a manifest file that has been altered in transit', () => {
    const entries = packWithManifest(content);
    const manifest = JSON.parse(
      entries.find((e) => e.path === MANIFEST_FILE_NAME)!.content,
    );
    const altered = entries.map((e) =>
      e.path === 'a.txt' ? { ...e, content: 'z' } : e,
    );

    // The manifest's own row is excluded, but the rows it carries are not.
    const result = verifyPackManifest(altered, manifest);
    expect(result.ok).toBe(false);
    expect(result.checksumMismatch).toEqual(['a.txt']);
  });

  it('does not let a nested manifest satisfy the exclusion', () => {
    const entries = packWithManifest(content);
    const manifest = JSON.parse(
      entries.find((e) => e.path === MANIFEST_FILE_NAME)!.content,
    );
    const nested = [...entries, { path: `sub/${MANIFEST_FILE_NAME}`, content: '{}' }];

    const result = verifyPackManifest(nested, manifest);
    expect(result.ok).toBe(false);
    expect(result.extra).toEqual(['sub/MANIFEST.json']);
  });

  it('accepts entries that omit the manifest without requiring it', () => {
    const entries = packWithManifest(content);
    const manifest = JSON.parse(
      entries.find((e) => e.path === MANIFEST_FILE_NAME)!.content,
    );
    const contentOnly = entries.filter((e) => e.path !== MANIFEST_FILE_NAME);

    // Both callers exist: one passes everything extracted, one passes only the
    // content. Neither should be told the pack is wrong.
    expect(verifyPackManifest(contentOnly, manifest).ok).toBe(true);
  });
});

describe('renderPackManifest', () => {
  it('renders every aggregate the manifest carries', () => {
    const manifest = buildPackManifest([{ path: 'a.txt', content: 'a' }]);
    expect(JSON.parse(renderPackManifest(manifest))).toEqual({
      version: 1,
      fileCount: 1,
      archiveFileCount: 2,
      totalBytes: 1,
      entries: [{ path: 'a.txt', bytes: 1, sha256: expect.any(String) }],
    });
  });
});
