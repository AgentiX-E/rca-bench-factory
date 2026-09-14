#!/usr/bin/env node
/**
 * Verify the shipped example pack the way a recipient does.
 *
 * This is the check CI runs against `site/assets/rca-bench-factory-examples.tar.gz`.
 * It extracts the archive into a temporary directory and hands the extraction to
 * core's `verifyPackManifest` -- the same function the test suite uses -- so the
 * repository cannot ship a pack that fails its own manifest.
 *
 * It replaces an inline `node -e` block in `.github/workflows/ci.yml` that
 * reimplemented this check by hand. That copy was never executed by a test, so
 * when the pack's manifest was corrected to name archive paths the inline block
 * still assumed pack-relative rows: it joined a row onto the pack root and
 * produced `rca-bench-factory-examples/rca-bench-factory-examples/README.md`.
 * CI failed on the commit that fixed the pack.
 *
 * A verification step that reimplements the verifier is a second implementation
 * of the same rule, and a second implementation is free to disagree. This script
 * delegates instead, so there is one definition of "a valid pack".
 *
 *   node scripts/verify-example-pack.mjs [extraction-root]
 *
 * With no argument it extracts the committed archive itself; the test suite
 * passes a directory it has already extracted.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyPackManifest } from '../packages/core/dist/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE = resolve(ROOT, 'site/assets/rca-bench-factory-examples.tar.gz');

/**
 * Every regular file under `dir`, as paths relative to `dir`.
 *
 * A recipient holds a directory tree, not a manifest, so the tree is what the
 * entries are read from. Sorting keeps the reported order stable.
 */
function walk(dir, prefix = '') {
  const paths = [];
  for (const name of readdirSync(join(dir, prefix)).sort()) {
    const relative = prefix === '' ? name : `${prefix}/${name}`;
    if (statSync(join(dir, relative)).isDirectory()) paths.push(...walk(dir, relative));
    else paths.push(relative);
  }
  return paths;
}

/** The manifest a recipient would find, at the pack root or one directory deep. */
function findManifestPath(paths) {
  const candidates = paths.filter((path) => {
    if (path === 'MANIFEST.json') return true;
    const slash = path.indexOf('/');
    return slash !== -1 && path.indexOf('/', slash + 1) === -1 && path.slice(slash + 1) === 'MANIFEST.json';
  });
  // Shallowest wins, matching core's own rule.
  return [...candidates].sort((a, b) => a.length - b.length)[0];
}

/** Extract the committed archive into a fresh temporary directory. */
function extractArchive() {
  const dir = mkdtempSync(join(tmpdir(), 'example-pack-'));
  execFileSync('tar', ['-xzf', ARCHIVE, '-C', dir], { stdio: 'inherit' });
  return dir;
}

const given = process.argv[2];
const root = given === undefined ? extractArchive() : resolve(given);

try {
  const paths = walk(root);
  if (paths.length === 0) {
    console.error(`verify: ${root} holds no files`);
    process.exit(1);
  }

  const manifestPath = findManifestPath(paths);
  if (manifestPath === undefined) {
    console.error('verify: the extraction carries no MANIFEST.json, so nothing can be checked');
    process.exit(1);
  }

  // Entries carry the content exactly as extracted. Nothing is rewritten: a
  // verifier that normalises the layout before checking would accept a pack
  // whose manifest describes a different tree.
  const entries = paths.map((path) => ({ path, content: readFileSync(join(root, path), 'utf8') }));
  const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'));

  const result = verifyPackManifest(entries, manifest);
  if (!result.ok) {
    console.error(`verify: the pack does not match its own ${manifestPath}`);
    for (const [label, list] of [
      ['missing (required by the manifest, absent from the pack)', result.missing],
      ['undeclared (in the pack, absent from the manifest)', result.extra],
      ['checksum mismatch', result.checksumMismatch],
      ['size mismatch', result.sizeMismatch],
    ]) {
      for (const path of list) console.error(`  ${label}: ${path}`);
    }
    process.exit(1);
  }

  // The manifest counts what a recipient extracts, so the count is checked
  // against the tree rather than printed for a human to trust.
  const onDisk = paths.length;
  if (manifest.archiveFileCount !== onDisk) {
    console.error(`verify: the manifest says ${manifest.archiveFileCount} files but the extraction holds ${onDisk}`);
    process.exit(1);
  }

  console.log(`${onDisk} packed files verified against ${manifestPath}`);
} finally {
  if (given === undefined) rmSync(root, { recursive: true, force: true });
}
