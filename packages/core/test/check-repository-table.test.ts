import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The `## Repository` table has a reader, and the reader can fail.
 *
 * ## The defect
 *
 * The table publishes eight measurements of this repository -- commits, packages, source
 * files and lines, test files, lines and counts, tracked files -- and until v3.80 nothing
 * read any of them. Measured against the tree: `95` commits for 530, `45` source files for
 * 97, `2341` tests for 6,246. Every row wrong, in a document whose first principle is that
 * a claim is only accepted when something produced it, and the reason is structural: a
 * current-state table with no reader is right exactly once.
 *
 * ## What this file has to prove, and it is not "the shipped table passes"
 *
 * A gate whose only test is the shipped tree is a gate that goes green because nothing was
 * checked -- the shape `docs/acceptance.md` records for five gates before the mutation
 * battery existed. So the battery below builds a **repository of five files** in `tmpdir()`,
 * commits it, and drives the guard against that: every rule is exercised by a tree small
 * enough to state in full, and every failure is a message rather than an exit code.
 *
 * The five-file tree is also the point of `--root` and `--doc`. A guard that could only be
 * pointed at the repository it lives in can only ever be tested by editing that
 * repository, which is how a corpus ends up with gates that no test can make red.
 */
export const DRIVES = ['scripts/check-repository-table.mjs'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-repository-table.mjs');

const scratch = mkdtempSync(join(tmpdir(), 'rca-repository-table-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Lambertyan',
  GIT_AUTHOR_EMAIL: 'lambertyan@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'Lambertyan',
  GIT_COMMITTER_EMAIL: 'lambertyan@users.noreply.github.com',
};

interface Fixture {
  readonly root: string;
  /** The short revision the fixture was committed at: what a `Commits` row has to name. */
  readonly rev: string;
  readonly doc: string;
  readonly snapshot: string;
}

/**
 * A repository the guard can be driven against, with every row derivable from it.
 *
 * Deliberately not a copy of this tree: a copy would make every assertion here a number
 * that changes whenever the real repository does, and the battery would then be about the
 * tree's size rather than about the guard's rules.
 */
function makeTree(name: string, overrides: { table?: (rev: string) => string; counts?: unknown } = {}): Fixture {
  const root = join(scratch, name);
  mkdirSync(join(root, 'packages/core/src'), { recursive: true });
  mkdirSync(join(root, 'packages/core/test'), { recursive: true });
  mkdirSync(join(root, 'packages/cli/src'), { recursive: true });
  mkdirSync(join(root, 'packages/cli/test'), { recursive: true });
  mkdirSync(join(root, 'golden-master'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });

  writeFileSync(join(root, 'packages/core/package.json'), JSON.stringify({ name: '@rca-bench-factory/core' }));
  writeFileSync(join(root, 'packages/cli/package.json'), JSON.stringify({ name: '@rca-bench-factory/cli' }));
  // Three lines in one source file and two in the other, so `Source lines` is a sum that a
  // row can get wrong by taking one file instead of both.
  writeFileSync(join(root, 'packages/core/src/a.ts'), 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n');
  writeFileSync(join(root, 'packages/cli/src/b.ts'), 'export const d = 4;\nexport const e = 5;\n');
  // Five lines of test in one file and four in the other; the *tests* count comes from the
  // snapshot rather than from the file, which is the second account compared below.
  writeFileSync(
    join(root, 'packages/core/test/a.test.ts'),
    "it('one', () => {});\nit('two', () => {});\nit('three', () => {});\n// padding\n// padding\n",
  );
  writeFileSync(join(root, 'packages/cli/test/b.test.ts'), "it('one', () => {});\n// padding\n// padding\n// padding\n");

  const snapshot = join(root, 'golden-master/doc-counts.json');
  writeFileSync(
    snapshot,
    `${JSON.stringify(overrides.counts ?? { core: { files: 1, tests: 7 }, cli: { files: 1, tests: 3 } }, null, 2)}\n`,
  );

  for (const args of [
    ['init', '-q', '-b', 'main'],
    ['add', '-A'],
    ['commit', '-q', '-m', 'fixture'],
  ]) {
    const done = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, ...IDENTITY } });
    expect(done.status, `git ${args.join(' ')}: ${done.stderr}`).toBe(0);
  }
  const rev = spawnSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

  const doc = join(root, 'docs/progress.md');
  writeFileSync(doc, `# Progress\n\nIntro.\n\n${(overrides.table ?? defaultTable)(rev)}\n\n## Next section\n\nText.\n`);
  return { root, rev, doc, snapshot };
}

/** The table a correct guard should accept, derived by hand from the fixture above. */
function defaultTable(rev: string): string {
  return [
    '## Repository',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Commits (at \`${rev}\`) | 1 |`,
    '| Packages | `@rca-bench-factory/cli`, `@rca-bench-factory/core` |',
    '| Source files | 2 |',
    '| Source lines | 5 |',
    '| Test files | 1 core + 1 cli |',
    '| Test lines | 5 core + 4 cli |',
    '| Tests | 7 core + 3 cli |',
    '| Tracked files | 7 |',
  ].join('\n');
}

interface Run {
  readonly status: number;
  readonly out: string;
  readonly err: string;
}

function run(fixture: Fixture, ...flags: string[]): Run {
  const done = spawnSync(process.execPath, [SCRIPT, '--root', fixture.root, '--doc', fixture.doc, ...flags], {
    encoding: 'utf8',
  });
  return { status: done.status ?? -1, out: done.stdout, err: done.stderr };
}

/** Rewrite the fixture's table and return what the guard says about it. */
function withTable(fixture: Fixture, table: string): Run {
  writeFileSync(fixture.doc, `# Progress\n\nIntro.\n\n${table}\n\n## Next section\n\nText.\n`);
  return run(fixture);
}

describe('scripts/check-repository-table.mjs · the table is derived, not typed', () => {
  it('accepts a tree whose table says what the tree says', () => {
    const fixture = makeTree('accepts');
    const accepted = run(fixture);

    expect(accepted.err).toBe('');
    expect(accepted.status).toBe(0);
    // The verdict names every row it derived. A guard that printed only "OK" would leave a
    // reader unable to tell eight derivations from eight skips.
    expect(accepted.out).toContain('8 row(s)');
    expect(accepted.out).toContain('Source lines = 5');
    expect(accepted.out).toContain('Tests = 7 core + 3 cli');
  });

  it('refuses a value that drifted, and says both numbers', () => {
    // The defect in one assertion: `2341` tests against 6,246 is this failure with the
    // right-hand side never read. The message has to carry both, because a reader who is
    // told only "stale" cannot tell a changed tree from a typo.
    const fixture = makeTree('drifted');
    const rejected = withTable(fixture, defaultTable(fixture.rev).replace('| Source lines | 5 |', '| Source lines | 4 |'));

    expect(rejected.status).toBe(1);
    expect(rejected.err).toContain("says '4' for Source lines; the tree says '5'");
    expect(rejected.err).toContain('check-repository-table: FAILED');
  });

  it('refuses a label it cannot derive, instead of skipping it', () => {
    // A skipped row is the original defect wearing a new name: a number in the document
    // that nothing computes. The vocabulary is closed for that reason.
    const fixture = makeTree('unknown-label');
    const rejected = withTable(fixture, `${defaultTable(fixture.rev)}\n| Stars | 12 |`);

    expect(rejected.status).toBe(1);
    expect(rejected.err).toContain("publishes 'Stars', which names no derivation this guard performs");
  });

  it('refuses a table that lost a row', () => {
    const fixture = makeTree('missing-row');
    const table = defaultTable(fixture.rev)
      .split('\n')
      .filter((line) => !line.startsWith('| Test lines |'))
      .join('\n');
    const rejected = withTable(fixture, table);

    expect(rejected.status).toBe(1);
    expect(rejected.err).toContain("publishes no 'Test lines' row");
  });

  it('refuses a Commits row that names no revision', () => {
    // The row that cannot be current. Without a revision it is the silent number this
    // guard exists to remove, and `95` for 530 is what that looks like after a hundred
    // rounds of nobody reading it.
    const fixture = makeTree('undated-commits');
    const rejected = withTable(
      fixture,
      defaultTable(fixture.rev).replace(`| Commits (at \`${fixture.rev}\`) | 1 |`, '| Commits | 1 |'),
    );

    expect(rejected.status).toBe(1);
    expect(rejected.err).toContain("publishes 'Commits', which names no derivation");
  });

  it('refuses a revision that does not resolve, as a refusal and not a count of zero', () => {
    const fixture = makeTree('bad-revision');
    const rejected = withTable(
      fixture,
      defaultTable(fixture.rev).replace(`Commits (at \`${fixture.rev}\`)`, 'Commits (at `deadbeef`)'),
    );

    expect(rejected.status).toBe(1);
    expect(rejected.err).toContain('the revision `deadbeef` does not resolve to a commit');
  });

  it('refuses a test-file count the runner and the glob disagree about', () => {
    // Two accounts of one set. The snapshot says the suite ran two core test files and the
    // tree holds one; taking either side silently would publish a repository that is not
    // the repository, which is what a glob that stopped matching looks like.
    const fixture = makeTree('glob-disagrees', { counts: { core: { files: 2, tests: 7 }, cli: { files: 1, tests: 3 } } });
    const rejected = run(fixture);

    expect(rejected.status).toBe(1);
    expect(rejected.err).toContain('packages/core/test holds 1 test file(s) and the suite reported 2');
  });

  it('refuses a document it cannot read rather than reporting every row as wrong', () => {
    const fixture = makeTree('no-document');
    const missing = { ...fixture, doc: join(fixture.root, 'docs', 'absent.md') };
    const rejected = run(missing);

    expect(rejected.status).toBe(1);
    expect(rejected.err).toContain('there is no document at');
    expect(rejected.err).not.toContain('says');
  });

  it('rewrites only the value cells, and only when they are wrong', () => {
    // `--write` is the repair, and the two things that can go wrong with a repair tool are
    // both asserted: it must not touch anything but the cells (a rewriter that reformats the
    // document makes every later diff unreadable), and it must be idempotent (a second run
    // that writes again is a run whose output depends on the first).
    const fixture = makeTree('write');
    const stale = defaultTable(fixture.rev)
      .replace('| Source lines | 5 |', '| Source lines | 999 |')
      .replace('| Tracked files | 7 |', '| Tracked files | 6 |');
    withTable(fixture, stale);

    const repaired = run(fixture, '--write');
    expect(repaired.status).toBe(0);
    const written = readFileSync(fixture.doc, 'utf8');
    // Everything outside the two cells is byte-identical, including the prose around it.
    expect(written).toContain('# Progress\n\nIntro.\n\n## Repository');
    expect(written).toContain('\n\n## Next section\n\nText.\n');
    expect(written).toContain('| Source lines | 5 |');
    expect(written).toContain('| Tracked files | 7 |');

    const again = run(fixture, '--write');
    expect(again.status).toBe(0);
    expect(readFileSync(fixture.doc, 'utf8')).toBe(written);
  });
});

describe('scripts/check-repository-table.mjs · the refusals inside the derivation', () => {
  it('refuses a suite measurement that carries no scope for a row it must derive', () => {
    // The snapshot is an input, and a missing scope is not a zero: a `Tests` row computed
    // from a scope the file does not carry would publish `7 core + 0 cli` for a package
    // whose tests were never counted -- the same defect as a count read from a stale table,
    // one layer in.
    const fixture = makeTree('no-scope', { counts: { core: { files: 1, tests: 7 } } });
    const rejected = run(fixture);

    expect(rejected.status).toBe(1);
    expect(rejected.err).toContain("carries no 'cli' scope");
  });

  it('refuses to rewrite a document with no table to rewrite', () => {
    // `--write` on a document whose heading is gone must not create the table: the guard
    // knows eight rows and not what they were for, and a tool that invented them would make
    // a deleted section look like a section somebody re-derived.
    const fixture = makeTree('write-no-table');
    writeFileSync(fixture.doc, '# Progress\n\nNo table here.\n');
    const rejected = run(fixture, '--write');

    expect(rejected.status).toBe(1);
    expect(rejected.err).toContain(`has no '## Repository' heading`);
    expect(readFileSync(fixture.doc, 'utf8')).toBe('# Progress\n\nNo table here.\n');
  });

  it('stops before writing when a row it must rewrite cannot be derived', () => {
    // The rewrite derives every cell, so it meets the same unresolvable revision the check
    // does -- and it has to stop **before** it writes, rather than write the other seven and
    // leave the eighth as it was, which is a half-repaired table that reads as a repaired one.
    //
    // This test used to assert that the label was still there, and that assertion holds for a
    // rewrite that wrote `[object Object]` into the cell: deleting the `throw` below this
    // script's `rewrite` left all twelve tests green, because the guard still exited 1 (its
    // re-read then finds the same unresolvable revision) and still named it. What it did not
    // notice was the damage. The property is byte equality with what was there before, which
    // is the only form of "it did not write" a reader can act on.
    const fixture = makeTree('write-bad-revision');
    const table = defaultTable(fixture.rev).replace(`Commits (at \`${fixture.rev}\`)`, 'Commits (at `deadbeef`)');
    withTable(fixture, table);
    const before = readFileSync(fixture.doc, 'utf8');
    const rejected = run(fixture, '--write');

    expect(rejected.status).toBe(1);
    expect(rejected.err).toContain('the revision `deadbeef` does not resolve to a commit');
    expect(readFileSync(fixture.doc, 'utf8')).toBe(before);
  });
});
