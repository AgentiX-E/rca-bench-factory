import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

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
});
