import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { MANIFEST_FILE_NAME } from '../src/pack/archive.js';
import { EXAMPLE_PACK_PREFIX, buildExamplePack } from '../src/pack/example.js';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement
 * in either direction: declaring one that is never spawned is as much a
 * violation as spawning one that is not declared. The declaration is needed
 * because several of these files drive a gate through a local `run(script)`
 * helper or a data table, so the script name never appears in a spawn's own
 * argument list and cannot be inferred from one.
 */
const DRIVES = [
  'scripts/build-example-bundle.mjs',
];


/**
 * `scripts/build-example-bundle.mjs` builds the downloadable example pack.
 *
 * Two properties carry the weight, and neither is visible from a green CI run:
 *
 *  - **Byte reproducibility.** Every tar field that could carry a timestamp or
 *    a user id is pinned, so `--check` can compare the committed artefact
 *    against a fresh build. If the pinning ever slipped, the comparison would
 *    still pass on the machine that built it and fail on the next one -- the
 *    worst kind of failure, because it looks like someone else's problem.
 *  - **The two internal invariants.** No duplicate paths, and `MANIFEST.json`
 *    must ship. Both are inside the archive, so neither is visible to a reader
 *    of the download page, and both are `throw`s that no test ever executed.
 *
 * The gate is run as a subprocess against a copy of the script in a throwaway
 * tree, because what it reads is a directory of example files and a set of
 * committed artefacts, and the only honest way to assert "it refuses a stale
 * artefact" is to hand it a stale one.
 *
 * ## Why the fixture symlinks `packages/` and `node_modules/`
 *
 * The gate imports the real built `core`, which imports `zod`. Copying
 * `packages/` alone produced `ERR_MODULE_NOT_FOUND` on the first fixture --
 * a failure that names neither the archive nor the comparison and would be
 * misread as the gate working. Both are linked so the fixture exercises the
 * shipped build rather than a stub.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = 'build-example-bundle.mjs';
const REAL_EXAMPLES = resolve(ROOT, 'examples/order-prod');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-bundle-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A throwaway tree holding the gate, a copy of the example directory and links
 * to the real build.
 *
 * The example files are **copied**, not linked: several tests below edit them,
 * and a link would make those edits land in the repository.
 *
 * `site/assets/` is created here rather than by the gate, and that is worth
 * stating: the gate writes both artefacts with a single `writeFileSync` each
 * and never creates the directory. Against the repository that is fine -- the
 * directory is committed and holds the artefacts -- but it means the gate's
 * own failure mode on a fresh checkout is `ENOENT` from `writeFileSync`, with
 * no diagnostic. The fixture reproduces the committed state, which is the state
 * the gate is designed for, so the tests below measure the gate rather than
 * that omission.
 */
function treeWithExamples(mutate: (dir: string) => void = () => {}): string {
  counter += 1;
  const tree = join(scratch, `tree-${counter}`);
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'site', 'assets'), { recursive: true });
  writeFileSync(join(tree, 'scripts', SCRIPT), readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8'));
  cpSync(REAL_EXAMPLES, join(tree, 'examples', 'order-prod'), { recursive: true });
  symlinkSync(resolve(ROOT, 'packages'), join(tree, 'packages'), 'dir');
  symlinkSync(resolve(ROOT, 'node_modules'), join(tree, 'node_modules'), 'dir');
  mutate(join(tree, 'examples', 'order-prod'));
  return tree;
}

function run(tree: string, args: string[] = []): Outcome {
  const result = spawnSync(process.execPath, [join(tree, 'scripts', SCRIPT), ...args], {
    encoding: 'utf8',
    cwd: tree,
  });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('scripts/build-example-bundle.mjs · the build', () => {
  it('writes both artefacts and reports the size, the count and the digest', () => {
    // The precondition. A gate that failed everything would satisfy every
    // negative below and would also make the pack undownloadable.
    const tree = treeWithExamples();
    const result = run(tree);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('rca-bench-factory-examples.tar.gz');
    // The digest is truncated for the line and so is the assertion: the point
    // is that a digest is printed, not what it is -- the committed metadata is
    // where the full value has to agree.
    expect(result.stdout).toMatch(/sha256 [0-9a-f]{12}…/);
    expect(result.stdout).toContain('example-pack.json');
  });

  it('pins every tar field that could vary between machines', () => {
    // Byte reproducibility, asserted directly rather than inferred from
    // `--check` passing. Two builds of the same inputs must produce the same
    // bytes, and the digest is what makes that checkable.
    const tree = treeWithExamples();
    expect(run(tree).status).toBe(0);
    const first = readFileSync(join(tree, 'site', 'assets', 'example-pack.json'), 'utf8');

    // A second build of the same tree. A timestamp in the header -- mtime,
    // an owner id, an ordering that follows the directory listing -- would
    // make this differ, and it would differ on somebody else's runner too.
    expect(run(tree).status).toBe(0);
    const second = readFileSync(join(tree, 'site', 'assets', 'example-pack.json'), 'utf8');

    expect(second).toBe(first);
    const meta = JSON.parse(first) as { bytes: number; sha256: string; paths: string[] };
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.bytes).toBeGreaterThan(0);
    // Every path in the listing is a file the packs ships, MANIFEST included.
    expect(meta.paths).toContain('MANIFEST.json');
    expect(meta.paths.length).toBeGreaterThan(1);
  });

  it('counts the manifest in the file count it advertises', () => {
    // The comment in the gate says `fileCount` "is the archive total rather
    // than the manifest's own content count". A regression that started
    // excluding the manifest from one of the two -- exactly the shape the
    // comment names -- would leave the page advertising one number and listing
    // another.
    const tree = treeWithExamples();
    expect(run(tree).status).toBe(0);
    const meta = JSON.parse(
      readFileSync(join(tree, 'site', 'assets', 'example-pack.json'), 'utf8'),
    ) as { fileCount: number; paths: string[] };

    expect(meta.fileCount).toBe(meta.paths.length);
  });

  it('reads the example directory, so a new file reaches the archive', () => {
    // Guards against the archive being assembled from a constant list. Adding
    // a file to `examples/order-prod` must change the pack; a gate that read a
    // hard-coded inventory would keep producing the same archive while the
    // repository moved on.
    //
    // The listed path is the **archive-relative** one, which is the path the
    // manifest's rows also carry -- the comment in the gate says the two
    // "describe the download, so both must count the same archive". Asserting
    // the bare basename first is what this test did on its first run, and it
    // failed: `paths` is not a list of file names but of archive rows.
    const bare = treeWithExamples();
    expect(run(bare).status).toBe(0);
    const before = JSON.parse(
      readFileSync(join(bare, 'site', 'assets', 'example-pack.json'), 'utf8'),
    ) as { paths: string[] };

    const withExtra = treeWithExamples((dir) => writeFileSync(join(dir, 'extra-notes.md'), 'a new file\n'));
    expect(run(withExtra).status).toBe(0);
    const after = JSON.parse(
      readFileSync(join(withExtra, 'site', 'assets', 'example-pack.json'), 'utf8'),
    ) as { paths: string[] };

    expect(after.paths).toContain('examples/order-prod/extra-notes.md');
    expect(before.paths).not.toContain('examples/order-prod/extra-notes.md');
    expect(after.paths.length).toBe(before.paths.length + 1);
  });

  it('passes --check against artefacts it has just built', () => {
    // The other half of the contrast for the two "refuses" cases below: a gate
    // that always reported stale would satisfy them both.
    const tree = treeWithExamples();
    expect(run(tree).status).toBe(0);

    const result = run(tree, ['--check']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('example pack is up to date');
  });
});

describe('scripts/build-example-bundle.mjs · what it refuses', () => {
  it('refuses a stale archive', () => {
    // The guarantee that makes the committed artefact meaningful: an example
    // directory that changed without the pack being rebuilt is a download that
    // ships something other than what the repository says it ships.
    const tree = treeWithExamples();
    expect(run(tree).status).toBe(0);

    const archive = join(tree, 'site', 'assets', 'rca-bench-factory-examples.tar.gz');
    writeFileSync(archive, Buffer.from('not the archive\n'));

    const result = run(tree, ['--check']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(archive);
    expect(result.stderr).toContain('is stale');
  });

  it('refuses a stale metadata file', () => {
    // The archive and the metadata are *two* comparisons, not one. A gate that
    // checked only the tarball would let the page advertise a size and a digest
    // that describe a different download.
    const tree = treeWithExamples();
    expect(run(tree).status).toBe(0);

    const metaPath = join(tree, 'site', 'assets', 'example-pack.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { sha256: string };
    meta.sha256 = '0'.repeat(64);
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

    const result = run(tree, ['--check']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(metaPath);
    expect(result.stderr).toContain('is stale');
  });

  it('reports both missing artefacts rather than stopping at the first', () => {
    // Both files are checked in one pass so an operator whose tree is missing
    // both learns it in one run. A gate that returned at the first failure
    // would turn one fix into two runs, which is the same judgement
    // `check-no-mock.mjs` made about reporting every offending line.
    const tree = treeWithExamples();
    expect(run(tree).status).toBe(0);
    rmSync(join(tree, 'site', 'assets', 'rca-bench-factory-examples.tar.gz'));
    rmSync(join(tree, 'site', 'assets', 'example-pack.json'));

    const result = run(tree, ['--check']);

    expect(result.status).toBe(1);
    // Both paths named, one line each.
    expect(result.stderr).toContain('rca-bench-factory-examples.tar.gz is missing');
    expect(result.stderr).toContain('example-pack.json is missing');
    expect(result.stderr).toContain('pnpm examples:bundle');
  });

  it('refuses an example directory holding no files at all', () => {
    // The invariant a reader never sees. An empty pack is a download that
    // extracts to nothing, and the archive itself is still a valid gzip -- so
    // nothing downstream can tell it apart from a real one.
    const tree = treeWithExamples((dir) => {
      for (const name of readdirSync(dir)) rmSync(join(dir, name), { recursive: true, force: true });
    });

    const result = run(tree);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no example files found');
  });

  it('keeps an example file named MANIFEST.json apart from the pack manifest', () => {
    // This began as an attempt to reach the gate's duplicate-path refusal, and it
    // answered a different question: **the collision that refusal guards against
    // cannot happen**, and the reason is one line of the pack.
    //
    // `buildExamplePack` prefixes every example file with its repository path
    // (`examples/order-prod/…`) and writes the manifest at the pack root
    // (`MANIFEST.json`), so an example directory holding a file of that name lands
    // on `examples/order-prod/MANIFEST.json` -- a different row. And a *real*
    // duplicate could not reach the gate either: the pack ends by normalising its
    // own output through `normalizePackEntries`, which refuses a repeated path, and
    // `pack-archive.test.ts` holds that refusal.
    //
    // So the gate's two internal invariants are guards on the pack's contract rather
    // than conditions an input can produce, and both are exempt in the inventory.
    // This test is the evidence for the first half: the two rows are distinct.
    const tree = treeWithExamples((dir) => {
      writeFileSync(join(dir, 'MANIFEST.json'), '{"files":[]}\n');
    });

    expect(run(tree).status).toBe(0);
    const meta = JSON.parse(
      readFileSync(join(tree, 'site', 'assets', 'example-pack.json'), 'utf8'),
    ) as { paths: string[] };
    expect(meta.paths).toContain('MANIFEST.json');
    expect(meta.paths).toContain('examples/order-prod/MANIFEST.json');
  });
});

/**
 * The gate's two internal invariants, measured on the tree that ships.
 *
 * Both are `throw`s inside `buildBundle()` that no input can reach: the pack ends
 * by normalising its own output, so a duplicate path is refused before the gate
 * sees one, and the manifest is appended by the pack itself. Both rows are
 * therefore `exempt` in `golden-master/gate-sites.json` -- and until v3.50 each
 * exemption was a *sentence*, which cannot fail.
 *
 * These two tests are the sentences made falsifiable. They are not aimed at the
 * lines; they measure what the lines assert, on the shipped example tree and on
 * the committed index the download page reads.
 *
 * The flat-read assertion is the part with teeth. `readExampleFiles()` walks one
 * directory and skips entries that are not files, so an example tree that grew a
 * subdirectory would lose it **silently** -- the pack would still build, still
 * verify, and still be one file short. Nothing else in this repository looks at
 * that, and it is the reason the statement is about the tree rather than about
 * the archive.
 */
describe('the pack invariants · held by the shipped tree, not by a sentence', () => {
  const exampleFiles = (): Record<string, string> => {
    // Recursive, because the claim is about the *tree* and the shipped reader now
    // walks it: a listing that stopped at the top level would agree with the old
    // reader and disagree with the tree, which is finding 398 exactly.
    const names = readdirSync(REAL_EXAMPLES, { recursive: true }).sort();
    const files: Record<string, string> = {};
    for (const name of names) {
      const full = resolve(REAL_EXAMPLES, name);
      if (!statSync(full).isFile()) continue;
      files[`examples/order-prod/${name}`] = readFileSync(full, 'utf8');
    }
    expect(Object.keys(files).length).toBeGreaterThan(0);
    return files;
  };

  /** Archive paths with the pack's own prefix removed, which is what the page lists. */
  const shippedPaths = (): string[] =>
    buildExamplePack(exampleFiles()).map((entry) => entry.path.slice(EXAMPLE_PACK_PREFIX.length + 1));

  const committedIndex = (): { fileCount: number; paths: string[] } =>
    JSON.parse(readFileSync(resolve(ROOT, 'site', 'assets', 'example-pack.json'), 'utf8')) as {
      fileCount: number;
      paths: string[];
    };

  it('ships each archive path once, so no example file can shadow another', () => {
    const paths = shippedPaths();
    expect(paths.length).toBeGreaterThan(Object.keys(exampleFiles()).length);
    expect(new Set(paths).size, 'a repeated path means two files landed on one row').toBe(paths.length);

    // The artefact the page serves, held to the same statement. A fresh build and
    // the committed index are two readings of one archive, and the claim is about
    // both: `fileCount` is the number of rows, so it cannot disagree with them.
    const index = committedIndex();
    expect(new Set(index.paths).size).toBe(index.paths.length);
    expect(index.fileCount).toBe(index.paths.length);
  });

  it('carries a nested example rather than dropping it without a word', () => {
    // Finding 398, reproduced as a fixture. The reader used to walk one directory
    // and skip every entry that was not a file, so this tree produced a pack that
    // was one file short of the tree it advertises -- and every gate in the
    // repository agreed, because the index is written by the same reader.
    //
    // The tree is flat today, which is what made the defect invisible rather than
    // harmless: the next example somebody adds under a subdirectory is the one
    // that would have gone missing, and the download would have looked complete.
    const tree = treeWithExamples((dir) => {
      mkdirSync(join(dir, 'nested'), { recursive: true });
      writeFileSync(join(dir, 'nested', 'extra.json'), '{"nested":true}\n');
    });

    expect(run(tree).status).toBe(0);
    const meta = JSON.parse(
      readFileSync(join(tree, 'site', 'assets', 'example-pack.json'), 'utf8'),
    ) as { fileCount: number; paths: string[] };
    expect(meta.paths).toContain('examples/order-prod/nested/extra.json');
    expect(meta.fileCount).toBe(meta.paths.length);
  });

  it(
    'carries every file in the real example tree and the manifest, and counts them in one number',
    () => {
      const paths = shippedPaths();
      const files = Object.keys(exampleFiles());
      for (const file of files) {
        expect(paths, `${file} is in the tree and must be in the pack`).toContain(file);
      }
      expect(paths).toContain(MANIFEST_FILE_NAME);
      expect([...paths].sort()).toEqual(committedIndex().paths.sort());
    },
  );
});

/**
 * The tool's third opinion, and the reason it exists.
 *
 * Finding 400: the archive and `example-pack.json` are both produced by
 * `readExampleFiles()`, and `--check` compares them with each other. Every gate in the
 * repository agrees while the tree quietly holds one file more than the download -- which
 * is finding 398 one layer out, and 398 was found by a *test* rather than by the tool
 * that is supposed to catch it.
 *
 * `treeListing()` walks the tree with `opendirSync` handles instead of
 * `readdirSync(..., { recursive: true })`, and `buildBundle()` refuses when the two
 * disagree. These tests measure the walk on a tree the shipped reader cannot be wrong
 * about, and the published counts on the tree that ships: the archive must be exactly the
 * three generated files larger than the tree, which is a relationship two independent
 * enumerations can disagree about and one enumeration cannot.
 */
describe('the pack and the tree · the tool, not only the test', () => {
  it('lists a nested file the tree holds, by descending rather than by a recursive readdir', async () => {
    const { treeListing } = (await import(
      pathToFileURL(resolve(ROOT, 'scripts', SCRIPT)).href
    )) as {
      treeListing: (dir: string) => string[];
    };
    const dir = mkdtempSync(join(tmpdir(), 'rca-listing-'));
    try {
      mkdirSync(join(dir, 'deep', 'deeper'), { recursive: true });
      writeFileSync(join(dir, 'top.json'), '{}\n');
      writeFileSync(join(dir, 'deep', 'middle.json'), '{}\n');
      writeFileSync(join(dir, 'deep', 'deeper', 'bottom.json'), '{}\n');
      expect(treeListing(dir)).toEqual(['deep/deeper/bottom.json', 'deep/middle.json', 'top.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('names a tree file the pack does not carry, and is silent when it carries them all', async () => {
    const { orphansInTree } = (await import(
      pathToFileURL(resolve(ROOT, 'scripts', SCRIPT)).href
    )) as {
      orphansInTree: (dir: string, carried: string[]) => string[];
    };
    const dir = mkdtempSync(join(tmpdir(), 'rca-orphan-'));
    try {
      mkdirSync(join(dir, 'nested'), { recursive: true });
      writeFileSync(join(dir, 'a.json'), '{}\n');
      writeFileSync(join(dir, 'nested', 'b.json'), '{}\n');
      // The direction that matters: a file the tree holds and the pack omits. A walk that
      // agreed with a broken reader would return an empty list here, which is exactly the
      // silence finding 398 shipped with.
      expect(orphansInTree(dir, ['a.json'])).toEqual(['nested/b.json']);
      expect(orphansInTree(dir, ['a.json', 'nested/b.json'])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('publishes the tree count beside the archive count, three generated files apart', () => {
    // Two numbers from two enumerations. `fileCount` counts archive rows and
    // `treeFileCount` counts the tree, so a page reader can compare them without building
    // anything -- and the build refuses when they are not exactly README.md, run.sh and
    // MANIFEST.json apart.
    const meta = JSON.parse(readFileSync(resolve(ROOT, 'site', 'assets', 'example-pack.json'), 'utf8')) as {
      fileCount: number;
      treeFileCount: number;
      paths: string[];
    };
    expect(meta.treeFileCount).toBeGreaterThan(0);
    expect(meta.fileCount).toBe(meta.treeFileCount + 3);
    expect(meta.paths).toHaveLength(meta.fileCount);
  });
});

/**
 * Finding 400's second half: the two enumerations are compared, and the comparison has
 * an outside.
 *
 * A symlink is where they legitimately disagree -- `statSync` follows it, `Dirent.isFile`
 * does not -- so the tree holds a file the reader carries and the listing does not. That
 * makes the counts differ by more than the three generated files, and the build refuses.
 * The test is here because a check that cannot be shown to fire is a check whose silence
 * means nothing, and this is the one input the shipped tree can produce that reaches it.
 */
describe('the pack and the tree · the disagreement the build refuses', () => {
  it('refuses a tree the two enumerations read differently, and names both counts', () => {
    const tree = treeWithExamples((dir) => {
      symlinkSync(resolve(dir, 'bundle.json'), join(dir, 'linked.json'));
    });
    const result = run(tree);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('generated files apart');
    // The listing does not follow the link, so the tree count is the six real files and
    // the archive's is one more. Both numbers are in the message, which is what makes the
    // refusal diagnosable rather than mysterious.
    expect(result.stderr).toContain(`${String(readdirSync(resolve(REAL_EXAMPLES)).length)} file(s)`);
  });
});
