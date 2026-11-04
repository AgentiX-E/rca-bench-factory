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

import { opendirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildExamplePack, createTarGzip, sha256Bytes } from '../packages/core/dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXAMPLE_DIR = resolve(ROOT, 'examples/order-prod');
const ARCHIVE_NAME = 'rca-bench-factory-examples.tar.gz';
const ARCHIVE_PATH = resolve(ROOT, `site/assets/${ARCHIVE_NAME}`);
const META_PATH = resolve(ROOT, 'site/assets/example-pack.json');

/**
 * Read every regular file under `dir`, keyed by its repository-relative path.
 *
 * **Recursive**, and that word is the whole of finding 398. The first version
 * walked one directory and skipped every entry that was not a file, so an example
 * tree that grew a subdirectory would lose its contents **silently**: the pack
 * would still build, still verify against `--check`, and still be one file short
 * of the tree it advertises. Nothing in the repository could see it -- the
 * download's own index is produced by this function, so it agreed with itself.
 *
 * The tree is flat today, which is why no test had ever asked. The question was
 * not answerable from the archive; it is answerable from the tree, and the fix
 * is to walk it rather than to have a test pin its current shape. Paths keep
 * their separators relative to the example directory, so a nested file lands on
 * `examples/order-prod/<dir>/<name>` -- a distinct pack row.
 */
function readExampleFiles() {
  const files = {};
  for (const name of readdirSync(EXAMPLE_DIR, { recursive: true }).sort()) {
    const full = resolve(EXAMPLE_DIR, name);
    if (!statSync(full).isFile()) continue;
    files[`examples/order-prod/${name.split('\\').join('/')}`] = readFileSync(full, 'utf8');
  }
  if (Object.keys(files).length === 0) {
    throw new Error(`no example files found under ${EXAMPLE_DIR}`);
  }
  return files;
}

/**
 * Every regular file under `dir`, listed by a different walk than the reader's.
 *
 * ## Why a second walk at all (finding 400)
 *
 * The pack's index is produced by `readExampleFiles()`, and `--check` compares the
 * archive against that index. Both sides of that comparison come from the **same
 * reader**, so a reader that drops a file produces an archive, an index and a passing
 * check that all agree with each other and disagree with the tree. Finding 398 was
 * exactly that, and it was found by a test, not by the tool.
 *
 * This function is the tool's third opinion: an `opendirSync` handle descended by hand,
 * instead of `readdirSync(dir, { recursive: true })`. The independence is in the
 * **descent** -- the recursion strategy is where 398's defect lived -- and it is stated
 * that way rather than overclaimed: both ultimately list a directory with the same
 * primitive underneath.
 *
 * The reader is not called here, and the two lists are compared as sets. A file the pack
 * does not carry is refused in both modes, because a download that omits part of the tree
 * it advertises is not something `--check` should be able to bless.
 */
export function treeListing(dir) {
  const listed = [];
  const descend = (relative) => {
    const handle = opendirSync(relative === '' ? dir : resolve(dir, relative));
    try {
      for (;;) {
        const entry = handle.readSync();
        if (entry === null) break;
        const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
        if (entry.isDirectory()) descend(path);
        else if (entry.isFile()) listed.push(path);
      }
    } finally {
      handle.closeSync();
    }
  };
  descend('');
  return listed.sort();
}

/** How many files the tree holds, and which of them the pack does not carry. */
export function orphansInTree(dir, carried) {
  return treeListing(dir).filter((path) => !carried.includes(path));
}

/** Build the archive and the metadata that describes it. */
export function buildBundle() {
  const files = readExampleFiles();
  const entries = buildExamplePack(files);
  const archive = createTarGzip(entries);
  const prefixLength = 'rca-bench-factory-examples/'.length;

  // The page advertises `fileCount` and lists `paths`. Both describe the
  // download, so both must count the same archive -- including a regression
  // where one of them starts excluding the manifest.
  const inArchive = entries.map((entry) => entry.path.slice(prefixLength));
  if (inArchive.length !== new Set(inArchive).size) {
    throw new Error('the example pack contains duplicate paths');
  }
  if (!inArchive.includes('MANIFEST.json')) {
    throw new Error('the example pack must ship a MANIFEST.json to be verifiable');
  }

  // The third opinion: the tree, listed by a walk the reader does not share. Without it
  // the archive and its index agree by construction and `--check` blesses a download that
  // is missing a file. `fileCount` and `treeFileCount` are published as two numbers so a
  // reader of the page can see the archive is three files larger than the tree: README,
  // run.sh and the manifest.
  const inTree = treeListing(EXAMPLE_DIR);
  const carried = Object.keys(files).map((key) => key.slice('examples/order-prod/'.length));
  const missing = inTree.filter((path) => !carried.includes(path));
  if (missing.length !== 0) {
    throw new Error(`the example pack does not carry ${missing.join(', ')}`);
  }
  // And the other direction, as arithmetic: the archive is the tree plus exactly the
  // three files `buildExamplePack` generates. A file the *listing* sees and the reader
  // does not is `missing` above; a row the archive has and neither sees is this count.
  // A symlink in the tree reads here and not above: the reader follows it and the
  // listing does not, so the two counts differ and this refuses -- which is the only
  // honest answer until somebody decides which of the two readings the pack means.
  const generated = ['README.md', 'run.sh', 'MANIFEST.json'];
  if (entries.length !== inTree.length + generated.length) {
    throw new Error(
      `the example pack holds ${String(entries.length)} row(s) and the tree holds ` +
        `${String(inTree.length)} file(s), which is not the ${String(generated.length)} ` +
        `generated files apart: ${generated.join(', ')}`,
    );
  }

  return {
    archive,
    meta: {
      generatedBy: 'scripts/build-example-bundle.mjs',
      file: ARCHIVE_NAME,
      bytes: archive.length,
      sha256: sha256Bytes(archive),
      // `fileCount` is every file in the archive, which is what a reader of the
      // download page wants, and what `paths` below enumerates. It includes the
      // manifest, so it is the archive total rather than the manifest's own
      // content count; `pack` reports both under those two names.
      fileCount: entries.length,
      // The tree's own count, from the listing rather than from the reader. The two are
      // published together so a reader can compare them without building anything.
      treeFileCount: inTree.length,
      paths: entries.map((entry) => entry.path.slice(prefixLength)).sort(),
    },
  };
}

/**
 * The script, as opposed to the module.
 *
 * `treeListing` and `orphansInTree` are exported so that the third opinion can be
 * measured without a reader that drops a file -- a fixture the shipped reader cannot
 * produce. Importing them must not build anything, so the work below runs only when this
 * file is the entry point.
 */
function main() {
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
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
