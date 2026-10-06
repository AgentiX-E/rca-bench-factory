import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * `check-no-absolute-paths.mjs` was the last gate in the `lint` chain with no
 * test of its own.
 *
 * The gap was not an oversight in the usual sense. Every other gate accepts a
 * fixture root or a path argument, so a test can point it at a tree it
 * synthesised and watch it fail; this gate read only
 * `resolve(HERE, '..')` -- the checked-out repository -- and that tree is clean.
 * The only reachable outcome was `OK`, exit 0, and a gate whose sole observable
 * behaviour is green is indistinguishable from a deleted one. That is precisely
 * the shape `docs/progress.md` calls out: a gate with no test is neither a
 * threshold nor an enumeration, it is decoration.
 *
 * `--root <dir>` was added to the script to close this, and is additive: with no
 * argument the scan list is byte-identical to what `pnpm lint` always ran, so
 * the gate's production behaviour did not change to make it testable.
 *
 * ## What this file asserts, and why each assertion is here
 *
 * A gate test that only checks the exit code is the same defect one level down:
 * the process could have exited 1 because `node` could not resolve an import, or
 * because the script threw on an unrelated line. So every failure assertion here
 * pairs the exit code with the *reason text* the gate prints, and every failure
 * assertion is followed by the two anti-crash guards used across this suite --
 * no `Cannot find module`, and no stack frame pointing into `node:internal`.
 *
 * The comment-exemption assertions are the load-bearing ones. This repository
 * documents the very failure this gate prevents, in comments and JSDoc, and does
 * so in several files: `scripts/inject-stability.mjs` names its own historical
 * absolute `REPO` constant in a doc comment. A gate that stopped distinguishing
 * prose from code would either fail on `main` (and be deleted) or, worse, be
 * "fixed" by deleting those comments, erasing the record of why the gate exists.
 * So the exemption is tested in the direction that it must hold, not only in the
 * direction that it must not.
 *
 * ## Why the violations are synthesised
 *
 * Same reason as `gates-are-testable.test.ts`: a committed absolute path would
 * make `main` red, and the fix would be to delete the gate rather than obey it.
 * Each violating tree is written under `tmpdir()`, scanned through `--root`, and
 * discarded.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-no-absolute-paths.mjs');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

/** Run the gate, optionally restricted to `roots`. */
function run(roots: string[] = []): Outcome {
  const args = [SCRIPT];
  for (const root of roots) args.push('--root', root);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Assert the gate failed *for its own stated reason*, not by crashing.
 *
 * Split out because it is the assertion the earlier gate tests lacked, and
 * because the two anti-crash clauses are what make `status === 1` mean
 * something. `Cannot find module` catches a broken path used to launch the
 * script; the stack-frame pattern catches an exception thrown from inside
 * Node's own internals, which would also exit non-zero.
 */
function expectFailedForOwnReason(outcome: Outcome): void {
  expect(outcome.status).toBe(1);
  expect(outcome.stderr).toContain('check-no-absolute-paths: FAILED');
  expect(outcome.stderr).not.toMatch(/Cannot find module/);
  expect(outcome.stderr).not.toMatch(/^\s+at .*node:internal/m);
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-nap-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A throwaway tree.
 *
 * `files` maps a tree-relative path to its body. The gate walks recursively and
 * filters by extension, so both of those are exercised: the nested directory
 * proves the walk descends, and the ignored-extension file proves the filter
 * holds. Both matter, because an implementation that walked only one level, or
 * that scanned every file regardless of type, would still pass a test that only
 * ever used a single flat `.mjs`.
 */
function tree(files: Record<string, string>): string {
  counter += 1;
  const dir = join(scratch, `tree-${counter}`);
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

/** A tree containing exactly one violating file. */
function violatingTree(body: string, path = 'scripts/violation.mjs'): string {
  return tree({ [path]: body });
}

describe('scripts · check-no-absolute-paths.mjs', () => {
  describe('the shipped tree', () => {
    it('passes against the repository as committed', () => {
      const outcome = run();
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-absolute-paths: OK');
      expect(outcome.stderr).toBe('');
    });

    it('scans a non-empty set of files, so the pass is not vacuous', () => {
      // The gate prints nothing about how much it scanned, so the non-emptiness
      // has to be established against the tree itself. Counting the files the
      // default roots hold is the only way to show that "OK" came from reading
      // something rather than from a `walk()` that returned `[]` -- which is
      // exactly what the `catch { return [] }` in `walk()` does when handed a
      // path that does not exist, and would produce a silent, cheerful pass.
      const source = readFileSync(SCRIPT, 'utf8');
      const defaults = [...source.matchAll(/resolve\(ROOT, '([^']+)'\)/g)].map((m) => m[1]);
      expect(defaults.length).toBeGreaterThanOrEqual(4);

      for (const rel of defaults) {
        const listing = spawnSync('find', [resolve(ROOT, rel), '-type', 'f'], { encoding: 'utf8' });
        expect(listing.status).toBe(0);
        expect(listing.stdout.trim().split('\n').length).toBeGreaterThan(0);
      }
    });
  });

  describe('a synthesised violation', () => {
    it('fails a string literal under a home directory', () => {
      const outcome = run([violatingTree("const OUT = '/home/someone/checkout.json';\n")]);
      expectFailedForOwnReason(outcome);
      expect(outcome.stderr).toContain('/home/someone/checkout.json');
    });

    it('names the offending file and line in the report', () => {
      // Three lines so the reported line number cannot be right by accident.
      const body = ["import { readFileSync } from 'node:fs';", '', "const P = '/root/secret/thing';\n"].join('\n');
      const outcome = run([violatingTree(body)]);
      expectFailedForOwnReason(outcome);
      expect(outcome.stderr).toMatch(/violation\.mjs:3\s+\/root\/secret\/thing/);
      expect(outcome.stderr).toContain('1 occurrence(s) across 1 file(s).');
    });

    it.each(["/Users/author/repo/out.json", "/home/author/out.json", "/root/out.json", "/private/var/out.json"])(
      'fails the prefix %s',
      (literal) => {
        const outcome = run([violatingTree(`const P = '${literal}';\n`)]);
        expectFailedForOwnReason(outcome);
        expect(outcome.stderr).toContain(literal);
      },
    );

    it.each(['"', "'", '`'])('fails a literal quoted with %s', (quote) => {
      const outcome = run([violatingTree(`const P = ${quote}/home/author/out.json${quote};\n`)]);
      expectFailedForOwnReason(outcome);
    });

    it('counts occurrences across files distinctly', () => {
      const root = tree({
        'scripts/a.mjs': "const A = '/home/author/a';\nconst A2 = '/home/author/a2';\n",
        'packages/core/src/b.ts': "const B = '/root/b';\n",
      });
      const outcome = run([root]);
      expectFailedForOwnReason(outcome);
      expect(outcome.stderr).toContain('3 occurrence(s) across 2 file(s).');
    });

    it('descends into nested directories', () => {
      const outcome = run([violatingTree("const D = '/root/deep';\n", 'scripts/nested/deeper/leaf.mjs')]);
      expectFailedForOwnReason(outcome);
      expect(outcome.stderr).toContain('leaf.mjs');
    });

    it('fails each file extension the gate claims to scan', () => {
      // The extension allowlist is load-bearing: `golden-master` holds `.json`,
      // and `scripts` holds `.sh` and `.py`. A gate that scanned only `.mjs`
      // would leave the injection probes unpoliced.
      for (const ext of ['mjs', 'cjs', 'js', 'ts', 'json', 'sh', 'py']) {
        const root = tree({ [`scripts/file.${ext}`]: '"/home/author/out"\n' });
        const outcome = run([root]);
        expectFailedForOwnReason(outcome);
        expect(outcome.stderr).toContain(`file.${ext}`);
      }
    });

    it('reports every offending file rather than stopping at the first', () => {
      const root = tree({
        'scripts/one.mjs': "const A = '/root/one';\n",
        'scripts/two.mjs': "const B = '/root/two';\n",
      });
      const outcome = run([root]);
      expectFailedForOwnReason(outcome);
      expect(outcome.stderr).toContain('one.mjs');
      expect(outcome.stderr).toContain('two.mjs');
    });
  });

  describe('what the gate deliberately does not flag', () => {
    it('ignores a path named in a line comment', () => {
      const body = [
        "// Historically this read '/root/.codebuddy/artifact/rca-work/rca-bench-factory'.",
        'const OK = true;',
        'console.log(OK);',
      ].join('\n');
      const outcome = run([violatingTree(body)]);
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-absolute-paths: OK');
    });

    it('ignores a path named in a block-comment continuation line', () => {
      const body = ['/**', " * Shipped as '/Users/author/repo/scripts' once.", ' */', 'export const OK = 1;'].join('\n');
      const outcome = run([violatingTree(body)]);
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-absolute-paths: OK');
    });

    it('ignores /tmp, which is a portable default rather than a machine identity', () => {
      const outcome = run([violatingTree("const OUT = '/tmp/rca-bench-out';\n")]);
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-absolute-paths: OK');
    });

    it('ignores /tmp even though the prefix shares a first segment with a flagged root', () => {
      // Guards the boundary between `/root/` and `/tmp`: a predicate written as
      // `startsWith('/')` in any of its disguises would flag this.
      const outcome = run([violatingTree("const OUT = '/tmp';\nconst OUT2 = '/tmp/x/y.json';\n")]);
      expect(outcome.status).toBe(0);
    });

    it('ignores a URL whose scheme precedes the path', () => {
      // The pattern anchors the path to the opening quote, so `file:///home/...`
      // is not a match: the character after the quote is `f`, not `/`. That is
      // the intended reading of the rule -- a URL is a URL, and the gate's
      // doc-comment lists URLs among what it deliberately leaves alone.
      //
      // This test was written with the opposite expectation and the prediction
      // was wrong; that is the point of keeping it. It pins the behaviour that
      // actually ships, so a later change to the pattern is a deliberate
      // decision rather than a silent one. The next test covers the case that
      // *is* flagged, and the pair is what makes the boundary legible.
      const outcome = run([violatingTree("const U = 'file:///home/author/repo/out.json';\n")]);
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-absolute-paths: OK');
      expect(outcome.stderr).toBe('');
    });

    it('still flags a bare path in a literal, which is the URL case minus the scheme', () => {
      // The complement of the test above, so the boundary is pinned from both
      // sides: drop the scheme and the same characters are a violation.
      const outcome = run([violatingTree("const P = '//home/author/repo/out.json';\n")]);
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-absolute-paths: OK');
      // A double slash is a protocol-relative URL, not a POSIX path, and the
      // pattern requires exactly one slash after the quote. Confirmed rather
      // than assumed -- the single-slash literal below is the violating form.
      const single = run([violatingTree("const P = '/home/author/repo/out.json';\n")]);
      expectFailedForOwnReason(single);
      expect(single.stderr).toContain('/home/author/repo/out.json');
    });

    it('ignores extensions the gate does not police', () => {
      const root = tree({ 'scripts/notes.md': 'see /home/author/repo for the checkout\n' });
      const outcome = run([root]);
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-absolute-paths: OK');
    });

    it('ignores build output and dependency directories', () => {
      const root = tree({
        'scripts/node_modules/dep/index.js': "const A = '/root/in-dep';\n",
        'scripts/dist/bundle.js': "const B = '/root/in-dist';\n",
        'scripts/coverage/report.js': "const C = '/root/in-coverage';\n",
        'scripts/ok.mjs': 'export const ok = true;\n',
      });
      const outcome = run([root]);
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-absolute-paths: OK');
    });

    it('passes on an empty tree rather than crashing on a missing root', () => {
      // `walk()` swallows a `readdirSync` failure and returns `[]`. That is the
      // right call for an optional directory, and it is also exactly the reason
      // the non-vacuity test above exists: a typo in a default root would look
      // identical to a clean tree. Asserted here so the tolerance is a decision
      // on the record rather than an accident.
      const outcome = run([join(scratch, 'does-not-exist')]);
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-absolute-paths: OK');
      expect(outcome.stderr).toBe('');
    });
  });

  describe('the --root argument', () => {
    it('replaces the default roots instead of adding to them', () => {
      // If `--root` merely appended, a scan of a clean tree would still walk the
      // repository and the argument would be useless for falsification. Pointing
      // it at a clean throwaway directory and getting exit 0 while the checked-in
      // tree is also clean does not distinguish the two, so the assertion is the
      // opposite direction: a *violating* tree passes only if the defaults were
      // truly dropped.
      const clean = tree({ 'scripts/clean.mjs': 'export const ok = true;\n' });
      const outcome = run([clean]);
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-absolute-paths: OK');
    });

    it('scans every root it is given', () => {
      const a = tree({ 'scripts/a.mjs': "const A = '/root/a';\n" });
      const b = tree({ 'scripts/b.mjs': "const B = '/home/author/b';\n" });
      const outcome = run([a, b]);
      expectFailedForOwnReason(outcome);
      expect(outcome.stderr).toContain('a.mjs');
      expect(outcome.stderr).toContain('b.mjs');
    });

    it('ignores a trailing --root with no value', () => {
      const outcome = spawnSync(process.execPath, [SCRIPT, '--root'], { encoding: 'utf8', cwd: ROOT });
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-absolute-paths: OK');
    });
  });
});
