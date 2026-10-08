import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach. Both spawns here name the
 * script through the `SCRIPT` constant, which the rule's argument-list scan
 * resolves, so the declaration and the inference agree.
 */
const DRIVES = [
  'scripts/check-no-unsafe-shell.mjs',
];

/**
 * `check-no-unsafe-shell.mjs` exists because the agent driving this repository
 * interrupted its own tool calls three times with the same error:
 *
 *     Failed to run function tools: Error: Bad substitution: JSON.stringify
 *
 * The mechanism was never the program being run. It was the **quoting** around
 * it: a `node -e "..."` whose body contained `${JSON.stringify(x)}`. A POSIX
 * shell expands `$` inside double quotes, and `${JSON.stringify(x)}` is not an
 * expansion it can parse -- after the name `JSON` it expects an operator or a
 * closing brace and finds a `.` -- so the shell rejected the word and reported
 * `bad substitution` against *itself*, at the line of the outer command, naming
 * neither the inner program nor the inner language. The message pointed at the
 * wrong file, the wrong language, and the wrong author.
 *
 * Measured reproducer, which this file pins as a fixture rather than trusting:
 *
 *     $ zsh -c 'echo "${JSON.stringify(x)}"'
 *     zsh:1: bad substitution
 *
 * ## The defect this test found in the gate itself
 *
 * The gate's first version looked for `$` followed by a character that cannot
 * begin *any* expansion. It passed against the shipped tree, and then it was
 * handed a file containing `${JSON.stringify(x)}` -- the exact string that
 * motivated it -- and *also* passed. The rule was about a different failure than
 * the one it was written for, which is the claim-with-no-reader pattern this
 * repository tracks, discovered here in the gate by testing the gate on its own
 * motivating input.
 *
 * The second version over-corrected: it added an `EXPANSION_OK` allowlist of
 * operator spellings and rejected the legal nested expansion `${a:-${b}}`,
 * because a regex cannot count brace depth. A gate that rejects valid input is
 * worse than no gate, because the remedy is to delete it. Both versions are
 * recorded in the script's own header, and both are pinned below: the defect
 * must fail, and the legal expansions must pass.
 *
 * ## Why each assertion is here
 *
 * A gate test that only checks the exit code is the same defect one level down:
 * the process could have exited 1 because `node` could not resolve an import, or
 * because the script threw on an unrelated line. So every failure assertion
 * pairs the exit code with the **reason text** the gate prints, and is followed
 * by the two anti-crash guards used across this suite -- no `Cannot find
 * module`, and no stack frame pointing into `node:internal`.
 *
 * The validity assertions are the load-bearing ones in the other direction. A
 * gate that flagged `${HOME}` or `${1:-x}` would fail on `main`, and the fix
 * would be to remove the gate rather than to obey it. The valid-expansion
 * fixture is therefore exhaustive over the operator spellings this repository
 * actually uses, not a single representative sample.
 *
 * ## Why the fixtures are synthesised
 *
 * Same reason as `check-no-absolute-paths.test.ts`: a committed defect would
 * make `main` red, and the fix would be to delete the gate rather than obey it.
 * Each fixture is written under `tmpdir()` and discarded.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-no-unsafe-shell.mjs');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

/** Run the gate, optionally against one synthesised file. */
function run(file?: string): Outcome {
  const args = [SCRIPT];
  if (file !== undefined) args.push('--file', file);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Assert the gate failed *for its own stated reason*, not by crashing.
 *
 * The two anti-crash clauses are what make `status === 1` mean something.
 * `Cannot find module` catches a broken path used to launch the script; the
 * stack-frame pattern catches an exception thrown from inside Node's own
 * internals, which would also exit non-zero.
 */
function expectFailedForOwnReason(outcome: Outcome): void {
  expect(outcome.status).toBe(1);
  expect(outcome.stderr).toContain('check-no-unsafe-shell: FAILED');
  expect(outcome.stderr).not.toMatch(/Cannot find module/);
  expect(outcome.stderr).not.toMatch(/^\s+at .*node:internal/m);
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-shell-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/** Write one throwaway shell file and return its path. */
function shellFile(body: string): string {
  counter += 1;
  const file = join(scratch, `fixture-${counter}.sh`);
  writeFileSync(file, body);
  return file;
}

describe('scripts · check-no-unsafe-shell.mjs', () => {
  describe('the shipped tree', () => {
    it('passes against the repository as committed', () => {
      const outcome = run();
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-unsafe-shell: OK');
      expect(outcome.stderr).toBe('');
    });

    it('scans a non-empty set of files, so the pass is not vacuous', () => {
      // The gate prints nothing about how much it scanned, so the non-emptiness
      // has to be established against the tree itself. A `walk()` that returned
      // `[]` -- which is what its `catch { return [] }` does when handed a path
      // that does not exist -- would also print `OK`.
      //
      // The check is that pointing the gate at a directory it can read yields a
      // *different* result from pointing it at one it cannot: the first must
      // still succeed, and the second must succeed too, which together show the
      // `catch` is not silently absorbing a real root. What proves the scan is
      // non-vacuous is that a fixture written *into* a `--root` tree is found,
      // which is the assertion below.
      counter += 1;
      const dir = join(scratch, `roots-${counter}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'vacuous.sh'), '#!/bin/bash\necho "${JSON.stringify(x)}"\n');
      const outcome = run();
      expect(outcome.status).toBe(0); // the shipped tree is clean
      const pointed = spawnSync(
        process.execPath,
        [SCRIPT, '--root', dir],
        { encoding: 'utf8', cwd: ROOT },
      );
      expect(pointed.status).toBe(1); // and the scanner does read a root
      expect(pointed.stderr).toContain('vacuous.sh');
    });
  });

  describe('the defect the gate was written for', () => {
    it('fails on the exact string that motivated it', () => {
      // The measured reproducer. This is the assertion that the gate's first
      // version could not make, and it is the reason the gate exists.
      const file = shellFile('#!/bin/bash\necho "${JSON.stringify(x)}"\n');
      const outcome = run(file);
      expectFailedForOwnReason(outcome);
      expect(outcome.stderr).toContain('bad-substitution');
      expect(outcome.stderr).toContain('${JSON.stringify(x)}');
    });

    it('fails on a dotted name, which shares the mechanism', () => {
      // `${a.b}` is the same parse failure by the same route: after the name
      // `a` the shell expects an operator and finds a `.`.
      const file = shellFile('#!/bin/bash\necho "a ${a.b} c"\n');
      const outcome = run(file);
      expectFailedForOwnReason(outcome);
      expect(outcome.stderr).toContain('bad-substitution');
    });

    it('fails on a call-like group inside a nested interpreter', () => {
      const file = shellFile('#!/bin/bash\nnode -e "const x = ${get(1)};"\n');
      const outcome = run(file);
      expectFailedForOwnReason(outcome);
      expect(outcome.stderr).toContain('bad-substitution');
    });
  });

  describe('the rule agrees with the shells it models', () => {
    /**
     * The ground truth, asked directly.
     *
     * This is the strongest acceptance criterion available for this gate and it
     * is available for no other gate in the tree: the thing being modelled is
     * *installed*, so the gate's verdict can be compared against what `zsh` and
     * `bash` actually do with the same string. A rule that agrees with a spec is
     * a reading; a rule that agrees with both shells is a measurement.
     *
     * The variables are defined in the child (`a=x; b=y; r=HOME; arr=(1 2)`)
     * so the two shells are answering the *syntax* question. Without that,
     * `${!r}` and `${a:?m}` fail for being unset rather than for being
     * malformed, and the comparison would be measuring variable state instead
     * of grammar -- which is how the first run of this cross-check reported two
     * mismatches that were not gate defects.
     */
    const PROBE = 'a=x; b=y; r=HOME; arr=(1 2); ';

    /**
     * Whether this shell is installed at all.
     *
     * This guard is the one place in the tree whose acceptance criterion is a
     * *second program*, and a missing `zsh` used to be indistinguishable from a
     * `zsh` that rejects a construct. `spawnSync` returns `status: null` with
     * `error.code === 'ENOENT'` when the binary is absent, and the original
     * `r.status !== 0` read that as a rejection -- so on a runner without `zsh`
     * the gate reported `zsh rejected ${a}`, naming the simplest legal expansion
     * in the language as malformed.
     *
     * Measured on `ubuntu-24.04` (run 37837481091): both jobs failed with
     * `zsh rejected ${a}: expected true to be false`, on the *first* entry of the
     * well-formed list, which is what an absent binary looks like -- every entry
     * would fail the same way and the first is the one reported. It passed here
     * because this sandbox has zsh 5.9.
     *
     * The distinction is now stated: a verdict is only a verdict if the shell
     * ran.
     */
    function shellAvailable(shell: string): boolean {
      const r = spawnSync(shell, ['-c', 'exit 0'], { encoding: 'utf8' });
      return r.status === 0;
    }

    /**
     * Does this shell reject the expansion as a syntax error?
     *
     * Returns `null` when the shell is not installed, rather than `true`. The
     * caller asserts availability first, so a missing shell fails the file with
     * a message that says so instead of producing a verdict out of an ENOENT.
     */
    function shellRejects(shell: string, expansion: string): boolean | null {
      const r = spawnSync(shell, ['-c', `${PROBE}echo "${expansion}"`], { encoding: 'utf8' });
      if (r.error !== undefined && r.status === null) return null;
      return r.status !== 0;
    }

    /**
     * The cases, each labelled with the verdict the shells return.
     *
     * A table rather than two hard-coded lists, because the interesting content
     * is *which* constructs sit on which side and why: `${a-b}` is legal
     * (`-` is a special parameter), `${}` differs between the two shells and is
     * therefore excluded from the comparison, and `${a.b}` / `${a(b)}` /
     * `${a b}` / `${ a}` / `${1.2}` are the five spellings both shells reject.
     */
    const MALFORMED = [
      '${a.b}',
      '${a(b)}',
      '${JSON.stringify(x)}',
      '${a b}',
      '${ a}',
      '${1.2}',
      '${a.b:-c}',
    ];
    const WELL_FORMED = [
      '${a}',
      '${a-b}',
      '${HOME}',
      '${1:-x}',
      '${a:-${b}}',
      '${#a}',
      '${a:=b}',
      '${a:+b}',
      '${a#p}',
      '${a##p}',
      '${a%p}',
      '${a%%p}',
      '${a/b/c}',
      '${a//b/c}',
      '${@}',
      '${*}',
      '${?}',
      '${a[0]}',
      '${arr[@]}',
      '${BASH_SOURCE[0]}',
    ];

    it('both shells are installed, so the cross-check below has something to compare against', () => {
      // Stated before the two comparisons, and not folded into them. A missing
      // shell is a fact about the runner, and the failure it used to produce --
      // `zsh rejected ${a}` -- was a fact about neither the gate nor the shell.
      expect(shellAvailable('zsh'), 'zsh is not installed on this runner').toBe(true);
      expect(shellAvailable('bash'), 'bash is not installed on this runner').toBe(true);
    });

    it('both shells reject every malformed expansion, so the fixture list is real', () => {
      // Without this, the assertion below could pass by testing a list the
      // shells happen not to care about.
      for (const expansion of MALFORMED) {
        expect(shellRejects('zsh', expansion), `zsh accepted ${expansion}`).toBe(true);
        expect(shellRejects('bash', expansion), `bash accepted ${expansion}`).toBe(true);
      }
    });

    it('both shells accept every well-formed expansion, so the gate is not over-strict', () => {
      for (const expansion of WELL_FORMED) {
        expect(shellRejects('zsh', expansion), `zsh rejected ${expansion}`).toBe(false);
        expect(shellRejects('bash', expansion), `bash rejected ${expansion}`).toBe(false);
      }
    });

    it('rejects exactly what the shells reject, in both directions', () => {
      const rejected = shellFile(
        ['#!/bin/bash', ...MALFORMED.map((e) => `echo "${e}"`), ''].join('\n'),
      );
      const accepted = shellFile(
        ['#!/bin/bash', ...WELL_FORMED.map((e) => `echo "${e}"`), ''].join('\n'),
      );
      expectFailedForOwnReason(run(rejected));
      expect(run(accepted).status).toBe(0);
    });
  });

  describe('the legal expansions it must NOT flag', () => {
    it('accepts every expansion spelling the shell actually supports', () => {
      // Exhaustive over the operators, because the gate's second version
      // rejected `${a:-${b}}` and a single representative sample would have
      // missed it. A gate that fails on `main` gets deleted, so this direction
      // is the one that decides whether the gate survives contact with the tree.
      const file = shellFile(
        [
          '#!/bin/bash',
          'echo "${HOME}"',
          'echo "${PATH}"',
          'echo "${1:-default}"',
          'echo "${a:=b}"',
          'echo "${a:?msg}"',
          'echo "${a:+b}"',
          'echo "${a#prefix}"',
          'echo "${a##prefix}"',
          'echo "${a%suffix}"',
          'echo "${a%%suffix}"',
          'echo "${a/b/c}"',
          'echo "${a//b/c}"',
          'echo "${a^^}"',
          'echo "${a,,}"',
          'echo "${#a}"',
          'echo "${@}"',
          'echo "${*}"',
          'echo "${?}"',
          'echo "${a[0]}"',
          'echo "${arr[@]}"',
          'echo "${a:-${b}}"', // the nested case the allowlist version rejected
          'echo "${BASH_SOURCE[0]}"',
          'echo "$HOME $1 $@ $? $$"',
          'echo "an escaped dollar: \\$not_an_expansion"',
          '',
        ].join('\n'),
      );
      const outcome = run(file);
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('check-no-unsafe-shell: OK');
    });

    it('does not flag a command substitution, which is the correct spelling', () => {
      // `$(JSON.stringify(x))` parses, because `(` after `$` begins a command
      // substitution. It is the safe form and the gate must leave it alone --
      // flagging it would push the author toward a heredoc for no reason.
      const file = shellFile('#!/bin/bash\necho "$(JSON.stringify(x))"\n');
      const outcome = run(file);
      expect(outcome.status).toBe(0);
    });

    it('does not flag a dollar inside a comment', () => {
      // This repository documents several failures in prose. A gate that read
      // prose as code would fail on `main` and be deleted.
      const file = shellFile('#!/bin/bash\n# the defect was ${JSON.stringify(x)}\necho ok\n');
      const outcome = run(file);
      expect(outcome.status).toBe(0);
    });

    it('does not flag a dollar inside single quotes', () => {
      // The recommended spelling. Single quotes make the body inert, which is
      // exactly why the gate tells the reader to use them.
      const file = shellFile("#!/bin/bash\nnode -e 'console.log(${JSON.stringify(x)})'\n");
      const outcome = run(file);
      expect(outcome.status).toBe(0);
    });
  });

  describe('the nested-interpreter rule', () => {
    it('fails when a nested interpreter body carries an unescaped expansion', () => {
      // `sh -c "echo $HOME"` is a defect even though `$HOME` is a valid
      // expansion: the *outer* shell expands it, so the inner shell receives
      // `/root` rather than the literal `$HOME` the author wrote. Author and
      // parser disagree about who does the expanding, which is the class.
      const file = shellFile('#!/bin/bash\nsh -c "echo $HOME"\n');
      const outcome = run(file);
      expectFailedForOwnReason(outcome);
      expect(outcome.stderr).toContain('nested-interpreter-expansion');
    });

    it('does not flag an expansion in a plain shell line', () => {
      // The same `$HOME`, one line up, with no nested interpreter. Ordinary
      // shell, and the rule must not spill onto it.
      const file = shellFile('#!/bin/bash\necho "home is $HOME"\n');
      const outcome = run(file);
      expect(outcome.status).toBe(0);
    });

    it('accepts the escaped spelling inside a nested interpreter', () => {
      const file = shellFile('#!/bin/bash\nsh -c "echo \\$HOME"\n');
      const outcome = run(file);
      expect(outcome.status).toBe(0);
    });
  });

  describe('the gate is actually wired into the pipeline', () => {
    it('is named by the root `lint` script', () => {
      // The mutation that exposed this: deleting `check-no-unsafe-shell.mjs`
      // from the `lint` chain left every test in this file green, because the
      // file only ever ran the gate *directly*. A gate that exists, passes, and
      // is never invoked is the claim-with-no-reader pattern -- a passing test
      // beside an unenforced rule -- and it is the same defect one level up from
      // the one the gate itself catches.
      //
      // Asserted against the manifest rather than against `pnpm lint`'s output,
      // because running the whole chain here would make this file depend on
      // every other guard, and a failure in one of them would be reported as a
      // failure of this one.
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      };
      expect(pkg.scripts.lint).toBeDefined();
      expect(pkg.scripts.lint).toContain('node scripts/check-no-unsafe-shell.mjs');
    });

    it('is in the gate inventory with a provedBy pointer to this file', () => {
      // The second half of the same claim. The inventory is read by rules 1-7
      // of `gate-sites-are-proven.test.ts`, so a site with no `provedBy` is a
      // site whose failure branch is unproven -- and the pointer has to name a
      // file that exists and drives the script, which rule 7 checks.
      const inventory = JSON.parse(
        readFileSync(join(ROOT, 'golden-master', 'gate-sites.json'), 'utf8'),
      ) as { sites: { script: string; status?: string; provedBy?: string }[] };
      const sites = inventory.sites.filter((s) => s.script === 'scripts/check-no-unsafe-shell.mjs');
      expect(sites).toHaveLength(1);
      expect(sites[0]!.status).toBe('proved');
      expect(sites[0]!.provedBy).toBe('packages/core/test/check-no-unsafe-shell.test.ts');
    });
  });

  describe('the scan is bounded to shell-bearing files', () => {
    it('reads a workflow `run:` line but not a `${{ }}` expression', () => {
      // GitHub's `${{ ... }}` is expanded before any shell sees it, so flagging
      // it would make the gate wrong about its own subject -- and a gate that is
      // wrong about its subject is switched off within a week. Both halves are
      // asserted: the expression must pass, and a real defect in a `run:` body
      // must fail.
      counter += 1;
      const dir = join(scratch, `wf-${counter}`);
      mkdirSync(dir, { recursive: true });
      const good = join(dir, 'good.yml');
      writeFileSync(
        good,
        [
          'jobs:',
          '  a:',
          '    steps:',
          '      - name: uses a github expression',
          '        run: echo "sha is ${{ github.sha }}"',
          '',
        ].join('\n'),
      );
      expect(run(good).status).toBe(0);

      const bad = join(dir, 'bad.yml');
      writeFileSync(
        bad,
        [
          'jobs:',
          '  a:',
          '    steps:',
          '      - name: carries the defect',
          '        run: echo "${JSON.stringify(x)}"',
          '',
        ].join('\n'),
      );
      expectFailedForOwnReason(run(bad));
    });

    it('ignores a file whose extension carries no shell', () => {
      counter += 1;
      const file = join(scratch, `notshell-${counter}.ts`);
      writeFileSync(file, 'const s = "${JSON.stringify(x)}";\n');
      const outcome = run(file);
      expect(outcome.status).toBe(0);
    });
  });
});
