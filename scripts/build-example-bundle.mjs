#!/usr/bin/env node
/**
 * Build the downloadable example pack served by the GitHub Pages site.
 *
 * The archive is produced by the real `buildExamplePack` in core from the real
 * `examples/` directory, and it is byte-reproducible: every tar field that could
 * carry a timestamp or a user id is pinned, so `--check` can compare the
 * committed artefact against a fresh build.
 *
 *   node scripts/build-example-bundle.mjs            # rebuild
 *   node scripts/build-example-bundle.mjs --check    # fail if the committed files are stale
 *
 * Two artefacts are written:
 *   site/assets/rca-bench-factory-examples.tar.gz  - the download itself
 *   site/assets/example-pack.json                  - size, digest and file list for the site
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildExamplePack, createTarGzip, sha256Bytes } from '../packages/core/dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXAMPLE_DIR = resolve(ROOT, 'examples/order-prod');
const ARCHIVE_NAME = 'rca-bench-factory-examples.tar.gz';
const ARCHIVE_PATH = resolve(ROOT, `site/assets/${ARCHIVE_NAME}`);
const META_PATH = resolve(ROOT, 'site/assets/example-pack.json');

/** Read every regular file under `dir`, keyed by its repository-relative path. */
function readExampleFiles() {
  const files = {};
  for (const name of readdirSync(EXAMPLE_DIR).sort()) {
    const full = resolve(EXAMPLE_DIR, name);
    if (!statSync(full).isFile()) continue;
    files[`examples/order-prod/${name}`] = readFileSync(full, 'utf8');
  }
  if (Object.keys(files).length === 0) {
    throw new Error(`no example files found under ${EXAMPLE_DIR}`);
  }
  return files;
}

/** Build the archive and the metadata that describes it. */
export function buildBundle() {
  const files = readExampleFiles();
  const entries = buildExamplePack(files);
  const archive = createTarGzip(entries);
  const prefixLength = 'rca-bench-factory-examples/'.length;

  return {
    archive,
    meta: {
      generatedBy: 'scripts/build-example-bundle.mjs',
      file: ARCHIVE_NAME,
      bytes: archive.length,
      sha256: sha256Bytes(archive),
      fileCount: entries.length,
      paths: entries.map((entry) => entry.path.slice(prefixLength)).sort(),
    },
  };
}

const checkOnly = process.argv.includes('--check');
const { archive, meta } = buildBundle();
const renderedMeta = `${JSON.stringify(meta, null, 2)}\n`;

if (checkOnly) {
  let ok = true;
  for (const [path, expected] of [
    [ARCHIVE_PATH, Buffer.from(archive)],
    [META_PATH, Buffer.from(renderedMeta, 'utf8')],
  ]) {
    let current;
    try {
      current = readFileSync(path);
    } catch {
      console.error(`${path} is missing - run \`pnpm examples:bundle\`.`);
      ok = false;
      continue;
    }
    if (!current.equals(expected)) {
      console.error(`${path} is stale - run \`pnpm examples:bundle\` and commit the result.`);
      ok = false;
    }
  }
  if (!ok) process.exit(1);
  console.log('example pack is up to date');
} else {
  writeFileSync(ARCHIVE_PATH, archive);
  writeFileSync(META_PATH, renderedMeta);
  console.log(`wrote ${ARCHIVE_PATH} (${meta.bytes} bytes, ${meta.fileCount} files, sha256 ${meta.sha256.slice(0, 12)}…)`);
  console.log(`wrote ${META_PATH}`);
}
