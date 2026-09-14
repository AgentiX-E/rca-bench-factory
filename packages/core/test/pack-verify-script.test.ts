import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildExamplePack, createTarGzip, readTar } from '../src/index.js';

/**
 * The pinned pack verification script.
 *
 * The repository ships a downloadable example pack, and CI is supposed to prove
 * that a recipient can verify it. Until now that proof was an inline `node -e`
 * block in the workflow file: a fourth hand-written implementation of a check
 * that core already exports (`verifyPackManifest`). It was not executed by any
 * test, so when the pack's manifest was corrected to name archive paths, the
 * inline block kept assuming pack-relative rows and started resolving every path
 * twice -- `rca-bench-factory-examples/rca-bench-factory-examples/README.md` --
 * failing CI on the very commit that fixed the pack.
 *
 * The script is now a file in the repository, and these tests run it against a
 * real extraction on a real filesystem. A verifier that is never executed is a
 * claim, not a check.
 */

const SCRIPT = resolve(__dirname, '../../../scripts/verify-example-pack.mjs');

/**
 * Extract an archive the way a recipient does: every path exactly as stored.
 *
 * Nothing here strips a prefix or rewrites a path. A helper that normalised the
 * layout before verifying would hide the defect this file exists to catch, which
 * is precisely how the earlier round of tests came to encode the bug.
 */
function extract(archive: Uint8Array, root: string): void {
  for (const entry of readTar(gunzipSync(archive))) {
    const target = join(root, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.content);
  }
}

/** Every regular file under `root`, as paths relative to it. */
function filesUnder(root: string, prefix = ''): string[] {
  const paths: string[] = [];
  for (const name of readdirSync(join(root, prefix)).sort()) {
    const relative = prefix === '' ? name : `${prefix}/${name}`;
    if (statSync(join(root, relative)).isDirectory()) paths.push(...filesUnder(root, relative));
    else paths.push(relative);
  }
  return paths;
}

/**
 * Run the shipped verifier against `root`.
 *
 * Diagnostics go to stderr, so the harness reports whichever stream was written
 * rather than assuming one: a failure message that lands on the other stream
 * would otherwise look like silence, and "the script said nothing" is not a
 * finding a test should be able to produce by accident.
 */
function runVerifier(root: string): { output: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { output: stdout, status: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { output: `${e.stdout ?? ''}${e.stderr ?? ''}`, status: e.status ?? 1 };
  }
}

/** A real example pack, extracted byte-for-byte, in a fresh temporary tree. */
function withExtractedExamplePack(run: (root: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'verify-pack-'));
  try {
    extract(createTarGzip(buildExamplePack(exampleFiles())), dir);
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The real example inputs, read from the repository rather than restated. */
function exampleFiles(): Record<string, string> {
  const dir = new URL('../../../examples/order-prod/', import.meta.url);
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json') && !name.endsWith('.csv')) continue;
    files[`examples/order-prod/${name}`] = readFileSync(new URL(name, dir), 'utf8');
  }
  return files;
}

describe('the pinned pack verification script', () => {
  it('accepts a faithful extraction of the shipped example pack', () => {
    withExtractedExamplePack((root) => {
      const { output, status } = runVerifier(root);
      expect(status).toBe(0);
      // The count is the number of files a recipient actually holds, so the
      // script must derive it from the tree rather than repeat a constant.
      const extracted = readTar(gunzipSync(createTarGzip(buildExamplePack(exampleFiles()))));
      expect(output).toContain(`${extracted.length} packed files verified`);
    });
  });

  it('resolves manifest rows against the extraction root, not the pack root', () => {
    // The regression: rows are archive-root-relative, so joining them onto a
    // pack-root path produces a doubled prefix and the first readFileSync throws.
    withExtractedExamplePack((root) => {
      const packRoot = join(root, 'rca-bench-factory-examples');
      const manifest = JSON.parse(readFileSync(join(packRoot, 'MANIFEST.json'), 'utf8')) as {
        entries: { path: string }[];
      };
      const first = manifest.entries[0]!.path;
      // The row must resolve from the extraction root, and must not double up.
      expect(() => readFileSync(join(root, first))).not.toThrow();
      expect(() => readFileSync(join(packRoot, first))).toThrow();
    });
  });

  /**
   * The half that makes the verifier worth running.
   *
   * Accepting a good pack proves nothing on its own: a script that always exits
   * 0 passes that test too. These cases corrupt an otherwise faithful extraction
   * and require the script to refuse it, and to name what it found.
   */
  describe('can fail', () => {
    /** Mutate one file in an extracted pack, then run the verifier over it. */
    function withTamperedPack(mutate: (root: string, files: string[]) => void, run: (root: string) => void): void {
      withExtractedExamplePack((root) => {
        const files = filesUnder(root);
        mutate(root, files);
        run(root);
      });
    }

    it('rejects a file whose content was altered in transit', () => {
      withTamperedPack(
        (root, files) => {
          const target = files.find((p) => p.endsWith('/records.json'))!;
          writeFileSync(join(root, target), `${readFileSync(join(root, target), 'utf8')}\n`);
        },
        (root) => {
          const { output, status } = runVerifier(root);
          expect(status).toBe(1);
          expect(output).toContain('does not match its own');
          expect(output).toContain('size mismatch');
        },
      );
    });

    it('rejects an altered file of the same size, as a checksum failure', () => {
      // Substituting one ASCII character keeps the byte length, so only the
      // digest can catch it: this is why size and hash are reported separately
      // rather than merged into one "does not match" verdict.
      withTamperedPack(
        (root, files) => {
          const target = files.find((p) => p.endsWith('/metrics.csv'))!;
          const original = readFileSync(join(root, target), 'utf8');
          // Find a character that actually differs from its replacement, so the
          // edit is guaranteed to change the content and not silently no-op.
          const at = original.split('').findIndex((ch) => ch !== 'Z' && /[a-z]/.test(ch));
          expect(at).toBeGreaterThanOrEqual(0);
          const flipped = `${original.slice(0, at)}Z${original.slice(at + 1)}`;
          expect(flipped).toHaveLength(original.length);
          expect(flipped).not.toBe(original);
          writeFileSync(join(root, target), flipped);
        },
        (root) => {
          const { output, status } = runVerifier(root);
          expect(status).toBe(1);
          expect(output).toContain('checksum mismatch');
          // A same-size edit must not be reported as a size problem.
          expect(output).not.toContain('size mismatch');
        },
      );
    });

    it('rejects a pack missing a file the manifest requires', () => {
      withTamperedPack(
        (root, files) => {
          rmSync(join(root, files.find((p) => p.endsWith('/metrics.csv'))!));
        },
        (root) => {
          const { output, status } = runVerifier(root);
          expect(status).toBe(1);
          expect(output).toContain('missing (required by the manifest, absent from the pack)');
        },
      );
    });

    it('rejects an undeclared file smuggled into the pack', () => {
      withTamperedPack(
        (root) => {
          writeFileSync(join(root, 'rca-bench-factory-examples/extra.txt'), 'not in the manifest\n');
        },
        (root) => {
          const { output, status } = runVerifier(root);
          expect(status).toBe(1);
          expect(output).toContain('undeclared (in the pack, absent from the manifest)');
        },
      );
    });

    it('rejects a manifest whose own count disagrees with the extraction', () => {
      // The count is the one claim a reader cannot check by eye, so it is checked
      // against the tree instead of being printed for them to trust.
      withTamperedPack(
        (root, files) => {
          const manifestPath = files.find((p) => p.endsWith('/MANIFEST.json'))!;
          const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'));
          manifest.archiveFileCount += 1;
          writeFileSync(join(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
        },
        (root) => {
          const { output, status } = runVerifier(root);
          expect(status).toBe(1);
          expect(output).toContain('but the extraction holds');
        },
      );
    });

    it('refuses an extraction that carries no manifest at all', () => {
      withTamperedPack(
        (root, files) => {
          rmSync(join(root, files.find((p) => p.endsWith('/MANIFEST.json'))!));
        },
        (root) => {
          const { output, status } = runVerifier(root);
          expect(status).toBe(1);
          expect(output).toContain('carries no MANIFEST.json');
        },
      );
    });
  });
});
