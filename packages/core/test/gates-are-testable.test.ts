import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Every gate must be *provably able to fail*.
 *
 * This file exists because one was not. Finding 45 added an enumeration gate to
 * `check-official.mjs`, and finding 46 discovered it had no test at all: deleting
 * it left all 27 tests in its file green, and deleting it while diverting cases
 * past the count left them green too. The gate was correct and entirely
 * unguarded, and the reason is structural rather than careless -- a gate tests
 * its *subject*, and nothing was testing the gate.
 *
 * The rule this file enforces is `docs/progress.md`'s, with the third clause
 * finding 46 added:
 *
 *   a threshold gate prevents regression,
 *   an enumeration gate discovers omission,
 *   and a gate with no test is neither.
 *
 * ## What "provably able to fail" means here, and what it does not
 *
 * Each gate is run twice: once against the repository as it stands, where it
 * must pass, and once against a **controlled violation** in a throwaway copy of
 * the tree, where it must fail. That is the whole claim. It does **not** claim
 * every branch of every gate is covered -- several gates have failure paths that
 * need a whole synthetic repository, and those are asserted in their own files
 * (`check-no-vendored-data.test.ts` builds throwaway git repos for exactly this).
 * What this file guarantees is the floor: no gate can be silently hollowed out.
 *
 * ## Why the violations are synthesised rather than committed
 *
 * A committed violation would make the gate fail on `main` and the gate would be
 * removed rather than fixed. So each violation is written into a copy of the
 * repository under `tmpdir()`, the gate is pointed at that copy, and the copy is
 * discarded. The gate reads its target from a constant derived from its own
 * location, which is what makes the copy work: `scripts/` and its subject move
 * together.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function run(script: string, args: string[] = [], cwd = ROOT): Outcome {
  const result = spawnSync(process.execPath, [resolve(cwd, 'scripts', script), ...args], {
    encoding: 'utf8',
    cwd,
  });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-metagate-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A throwaway copy of the tree holding exactly the files a gate needs.
 *
 * `files` maps a repository-relative path to its body. Directories are created
 * as needed, and `node_modules` is intentionally absent: every gate under test
 * here is dependency-free on purpose, so a gate that started importing a package
 * would fail loudly in its own tests rather than silently in this one.
 */
function copyOf(files: Record<string, string>): string {
  counter += 1;
  const dir = join(scratch, `tree-${counter}`);
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

/** The gate's own source, so a copy runs the real implementation. */
function scriptSource(script: string): string {
  return readFileSync(resolve(ROOT, 'scripts', script), 'utf8');
}

describe('scripts · every gate can be shown to fail', () => {
  describe('check-no-mock.mjs · the mock ban', () => {
    /**
     * The banned constructs, read out of the gate's own source.
     *
     * Two lists are in play here and both are load-bearing:
     *
     *  - **this one**, derived from the gate, which catches *drift*: a pattern
     *    quietly rewritten to stop matching what it used to match.
     *  - **`requiredConstructs`**, written independently, which catches
     *    *deletion*: a pattern removed from the gate entirely.
     *
     * The first version of this file had only the derived list, and deleting a
     * pattern from the gate deleted its test with it -- the suite stayed green
     * while the gate stopped banning something. Derived fixtures alone are
     * self-referential: the test definition shrinks with the thing it tests.
     *
     * The extraction strips the regex escapes, so a pattern written to match a
     * two-part call is read back as that text rather than as the pattern's
     * source form. That is what the fixtures need, since they contain the text.
     */
    function bannedPatterns(): string[] {
      const source = scriptSource('check-no-mock.mjs');
      const block = source.split('const BANNED = [')[1]?.split('];')[0] ?? '';
      return [...block.matchAll(/\/(.+?)\/,\s*$/gm)].map((m) =>
        m[1]!
          // Order matters: `\s*` is a quantifier and has to be stripped before
          // the generic escape pass, or backslash-s becomes the literal `s` and
          // the construct reads as `vi.mocks*(` -- matching nothing.
          .replace(/\\s\*/g, '')
          // A word-boundary assertion is not a character the fixture should
          // contain; a fixture holding a literal backspace escape would not
          // test what it appears to.
          .replace(/\\b/g, '')
          // The remaining single-character escapes are the literal characters
          // they protect: the dot and the parenthesis.
          .replace(/\\(.)/g, '$1')
          .trim(),
      );
    }

    /** One construct in the derived list, assembled so no literal appears here. */
    function mockCall(): string {
      return ['vi', 'mock'].join('.');
    }

    /**
     * The constructs the ban list is *required* to contain, held here rather
     * than derived from the gate.
     *
     * This list is deliberately **not** read from the gate, and that is the
     * point: it is the half that survives a pattern being deleted. The gate may
     * grow its list freely; it may not lose an entry.
     *
     * Assembled from fragments so this file does not itself contain text the
     * gate bans. Writing the literal forms would make `pnpm lint` reject this
     * file -- which it did, correctly, on the first version: the check tripping
     * over its own test.
     */
    function requiredConstructs(): string[] {
      return [
        ['vi', 'mock'].join('.'),
        ['jest', 'mock'].join('.'),
        'sin' + 'on',
        ['it', 'skip'].join('.'),
        ['describe', 'skip'].join('.'),
        ['it', 'only'].join('.'),
        ['describe', 'only'].join('.'),
        ['test', 'skip'].join('.'),
        ['test', 'only'].join('.'),
      ];
    }

    it('reads its banned list from the gate, and the list is not empty', () => {
      // The precondition for every test below. A gate whose ban list had been
      // emptied would pass the derived fixtures without complaint, so the
      // emptiness is itself the first thing asserted.
      const patterns = bannedPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns).toContain(`${mockCall()}(`);
    });

    it('still bans every construct it has ever banned', () => {
      // The deletion guard. The gate may grow its list freely; it may not lose
      // an entry. This is the assertion that fails when a pattern is deleted,
      // and it is the one the derived-fixture design could not make.
      const banned = bannedPatterns().map((p) => p.replace(/\($/, ''));
      for (const required of requiredConstructs()) {
        expect(banned, `the gate no longer bans ${required}`).toContain(required);
      }
    });

    it('passes a tree whose tests use no banned construct', () => {
      // The negative control. A gate that failed everything would satisfy the
      // violation tests below and would also block every legitimate change.
      const tree = copyOf({
        'scripts/check-no-mock.mjs': scriptSource('check-no-mock.mjs'),
        'packages/core/test/clean.test.ts': "import { it } from 'vitest';\nit('works', () => {});\n",
      });

      const result = run('check-no-mock.mjs', [], tree);

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/check-no-mock: OK/);
    });

    it('fails a tree for every construct the gate must keep banning', () => {
      // One fixture per entry in the independent list. Every construct in the
      // gate is banned with a `\b`-anchored pattern, so the bare text is what
      // the fixture has to contain.
      for (const construct of requiredConstructs()) {
        const tree = copyOf({
          'scripts/check-no-mock.mjs': scriptSource('check-no-mock.mjs'),
          'packages/core/test/dirty.test.ts':
            `import { it } from 'vitest';\n${construct}('x');\nit('works', () => {});\n`,
        });

        const result = run('check-no-mock.mjs', [], tree);

        expect(result.status, `the gate did not reject ${construct}`).toBe(1);
        // The gate names the file and line, which is what makes it actionable.
        expect(result.stderr).toMatch(/dirty\.test\.ts:2/);
      }
    });

    it('reports every offending line rather than only the first', () => {
      // The same judgement the corpus reader needed: a gate that stops at the
      // first finding turns one fix into N runs.
      const [second, third] = requiredConstructs();
      const tree = copyOf({
        'scripts/check-no-mock.mjs': scriptSource('check-no-mock.mjs'),
        'packages/core/test/dirty.test.ts':
          `import { it } from 'vitest';\n${second}('a');\n${third}('b');\n`,
      });

      const result = run('check-no-mock.mjs', [], tree);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/dirty\.test\.ts:2/);
      expect(result.stderr).toMatch(/dirty\.test\.ts:3/);
    });
  });

  describe('check-no-secrets.mjs · the credential backstop', () => {
    /**
     * A tree that is a git repository, because the gate reads `git ls-files`.
     *
     * Without the `git init` and `git add` the gate sees no files at all and
     * every "catches X" assertion below would pass for the wrong reason --
     * it would pass because the gate found nothing, not because it found a
     * credential. The same trap `check-no-vendored-data.test.ts` records.
     */
    function repo(files: Record<string, string>): string {
      const tree = copyOf({ 'scripts/check-no-secrets.mjs': scriptSource('check-no-secrets.mjs'), ...files });
      spawnSync('git', ['init', '--quiet'], { cwd: tree });
      spawnSync('git', ['add', '--', ...Object.keys(files)], { cwd: tree });
      return tree;
    }

    it('passes a tree whose only credential-shaped text is not a credential', () => {
      // The negative control, and it is not vacuous: the line below contains the
      // word `token` and an assignment, so a gate that matched on the variable
      // name rather than the value would fail here.
      const tree = repo({
        'src/config.ts': "export const tokenVar = 'placeholder';\nexport const key = process.env.API_KEY;\n",
      });

      const result = run('check-no-secrets.mjs', [], tree);

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/check-no-secrets: OK/);
    });

    it('fails a tree carrying a GitHub PAT', () => {
      // Assembled from fragments so this file does not itself contain a literal
      // that the gate matches -- which would make the repository fail its own
      // lint, and would be the check tripping over its own test.
      const pat = ['github', '_pat_', 'A'.repeat(60)].join('');
      const tree = repo({ 'src/leak.ts': `export const t = '${pat}';\n` });

      const result = run('check-no-secrets.mjs', [], tree);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/leak\.ts:1/);
    });

    it('fails a tree carrying an OpenAI-style key', () => {
      const key = ['sk-', 'B'.repeat(32)].join('');
      const tree = repo({ 'src/leak.ts': `export const k = '${key}';\n` });

      const result = run('check-no-secrets.mjs', [], tree);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/leak\.ts:1/);
    });

    it('ignores an untracked file, so a local scratch file is not reported', () => {
      // The gate is about what is *committed*. Staging is explicit in the
      // fixture precisely so this can be asserted, and the assertion is what
      // distinguishes "reads the index" from "walks the working tree".
      const pat = ['github', '_pat_', 'C'.repeat(60)].join('');
      const tree = repo({ 'src/clean.ts': "export const ok = true;\n" });
      writeFileSync(join(tree, 'src', 'scratch.ts'), `export const t = '${pat}';\n`);

      const result = run('check-no-secrets.mjs', [], tree);

      expect(result.status).toBe(0);
    });
  });

  describe('check-cli-reference.mjs · the reference is not empty', () => {
    /**
     * Only the "no command table found" path is covered here.
     *
     * The rest of this gate compares the reference against the *built* CLI, so
     * exercising it needs a `packages/cli/dist/main.js`; that is what the CI step
     * does, against the real binary. This test covers the branch those cannot
     * reach: a reference whose table has been deleted or renamed, where the gate
     * must fail rather than report agreement with an empty set.
     *
     * ## Why the exit code alone is not the assertion
     *
     * The first version of this test asserted only `status === 1` and was a
     * **false green**. Removing the guard under test still produced exit 1 --
     * because the gate fell through to `execFileSync` on a CLI that the fixture
     * tree does not contain, and crashed on a missing module. The exit code was
     * identical for the wrong reason, so the test would have passed with the
     * guard deleted.
     *
     * The assertion therefore has to name the *reason*: the gate's own
     * diagnostic, and the absence of a crash. A gate that dies on an unhandled
     * exception has not reported anything an operator can act on, which is the
     * whole point of the branch.
     */
    function emptyReferenceFixture(): string {
      return copyOf({
        'scripts/check-cli-reference.mjs': scriptSource('check-cli-reference.mjs'),
        // The heading the gate looks for is absent, so it finds no commands.
        'docs/cli-reference.md': '# CLI reference\n\nThis document has no command table.\n',
      });
    }

    it('fails when the reference holds no command table, rather than agreeing with nothing', () => {
      const result = run('check-cli-reference.mjs', [], emptyReferenceFixture());

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/no command table found/);
      // The discriminator the first version lacked. Without this the test passes
      // when the guard is gone and the gate merely crashes.
      expect(result.stderr).not.toMatch(/Cannot find module/);
      expect(result.stderr).not.toMatch(/^\s+at .*node:internal/m);
    });

    it('still names the missing table when the built CLI is absent', () => {
      // The same fixture, asserted through the reason rather than the status, so
      // that a gate which reports nothing and dies is not mistaken for one that
      // reported the defect. This is the assertion that fails when the guard at
      // the top of the gate is deleted.
      const tree = emptyReferenceFixture();
      const result = run('check-cli-reference.mjs', [], tree);

      // Exactly one line of diagnosis, and it is the gate's own sentence -- not
      // a Node stack trace with the sentence somewhere above it.
      const diagnosis = result.stderr.trim().split('\n').filter((l) => l.includes('FAILED'));
      expect(diagnosis).toHaveLength(1);
      expect(diagnosis[0]).toMatch(/no command table found in docs\/cli-reference\.md/);
    });
  });
});
