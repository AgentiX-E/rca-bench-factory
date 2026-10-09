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
 * Run the gate over a *command*, the way an agent would before executing it.
 *
 * `spawnSync`'s `input` option rather than a shell pipe, so the fixture does not
 * itself depend on quoting -- a test for a quoting defect that is itself quoted
 * would be the finding this file is about, one level up.
 */
function runStdin(command: string, label?: string): Outcome {
  const args = [SCRIPT, '--stdin'];
  if (label !== undefined) args.push('--label', label);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT, input: command });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Assert the gate refuses for its own stated reason.
 *
 * A refusal is not a finding: the argument guard and the pipeline guard both
 * exit 1 because the gate declined to answer, and asserting only the status
 * would let a crash satisfy them. The reason text is what distinguishes
 * "I will not" from "I broke".
 */
function expectRefusedForOwnReason(outcome: Outcome, reason: string): void {
  expect(outcome.status, `expected a refusal, got ${outcome.status}\n${outcome.stderr}`).toBe(1);
  expect(outcome.stderr).toContain(reason);
  expect(outcome.stderr).not.toContain('Cannot find module');
  expect(outcome.stderr).not.toMatch(/node:internal/);
}

/**
 * Run the gate with an arbitrary argument vector.
 *
 * The positional-argument finding is about *which* spellings the gate accepts,
 * so the fixtures have to be able to pass a spelling the gate does not support.
 */
function runArgs(args: string[]): Outcome {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
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

/**
 * The budget for the tests that spawn the gate once per construct.
 *
 * This file's assertions are mostly *process spawns* -- every check runs the
 * gate as a child -- so their wall time is a function of how many children the
 * machine can start, not of the code under test.
 *
 * Measured, one revision, no change to the test:
 *
 *     830 ms   standalone, three runs: 820 / 854 / 825
 *     >5000 ms in the full 32-worker suite (vitest's default), which is a
 *              *timeout*, and it made `measure-doc-counts` fail outright
 *
 * A 6x spread, and the failure surfaced in the one place that runs the suite
 * without `--coverage` -- the same route finding 129 took. This is the budget
 * omission `timeout-budget.test.ts` describes, and it is a good illustration of
 * that reader's stated limit: it enumerates the budgets a file *states*, so a
 * spawn-heavy test with no budget at all is exactly what it cannot see.
 *
 * 30 s is an order of magnitude over the standalone cost and well under the
 * suite's worst case, which is the same reasoning `BULK_TIMEOUT_MS` records in
 * `check-official-roundtrip.test.ts`.
 */
const PER_CONSTRUCT_TIMEOUT_MS = 30_000;

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
      expect(outcome.status, outcome.stderr).toBe(0);
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
    // The variables every probe starts from, so a construct that *reads* a
    // variable is measured against one that is set.
    //
    // `ref=HOME` exists for `${!ref}`: bash's indirect expansion needs its
    // operand bound, and without it bash reports `invalid indirect expansion`
    // at *runtime* while accepting the syntax -- a verdict about the probe's
    // environment rather than about the construct. That is the same
    // "asserting a property of the machine rather than of the subject" defect
    // as findings 124/130, caught here by the assertion it broke.
    const PROBE = 'a=x; b=y; r=HOME; ref=HOME; arr=(1 2); ';

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
     * (`-` is a special parameter), and `${a.b}` / `${a(b)}` / `${a b}` /
     * `${ a}` / `${1.2}` are the spellings both shells reject.
     *
     * `${}` used to be excluded here on the grounds that "the two shells differ
     * and it is therefore excluded from the comparison". That was wrong twice
     * over, and finding 132 is about both halves:
     *
     *   - The difference is *how* they reject it, not *whether*. `zsh` prints
     *     an empty value and `bash` raises `bad substitution`; the gate's own
     *     source comment had recorded `zsh: empty  bash: bad substitution` all
     *     along. `bash` -- the shell the repository's shebangs name and the one
     *     CI runs -- refuses it outright.
     *   - More importantly, "the shells disagree" is not a reason to exempt a
     *     construct from a gate whose whole purpose is to refuse anything an
     *     author cannot rely on. A construct one shell rejects and another
     *     silently empties is the *strongest* case for flagging, not an
     *     exception to it.
     *
     * It is now on the malformed side, which is where the shells put it.
     */
    const MALFORMED = [
      '${a.b}',
      '${a(b)}',
      '${JSON.stringify(x)}',
      '${a b}',
      '${ a}',
      '${1.2}',
      '${a.b:-c}',
      '${}',
      // A leading operator character with a name after it. Each is rejected by
      // bash -- measured, `echo "v=${+a}"` prints `bad substitution` -- and
      // each was covered by no test before finding 132. The gate's
      // leading-character branch is what refuses them, and disabling that
      // branch left the whole suite green, which is how the gap was found.
      '${ }',
      '${+a}',
      '${.a}',
      '${(a)}',
      '${/a}',
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
      // A bash-only construct, listed here so the gate's decision not to flag it
      // is asserted rather than incidental. `${!ref}` is bash's indirect
      // expansion and works there (`ref=HOME` prints `/root`); `zsh` rejects it
      // outright. It is legal in the shell this repository's shebangs name, so
      // the gate allows it -- the same disjunction finding 132 settled for
      // `${}`, applied in the other direction. A construct legal in *one* of
      // the two shells is refused only when the shell that refuses it is the
      // one the code is written for.
      '${!ref}',
      '${#}',
      '${!}',
    ];

    it('both shells are installed, so the cross-check below has something to compare against', () => {
      // Stated before the two comparisons, and not folded into them. A missing
      // shell is a fact about the runner, and the failure it used to produce --
      // `zsh rejected ${a}` -- was a fact about neither the gate nor the shell.
      expect(shellAvailable('zsh'), 'zsh is not installed on this runner').toBe(true);
      expect(shellAvailable('bash'), 'bash is not installed on this runner').toBe(true);
    });

    it('rejects everything at least one shell rejects, and nothing both accept', () => {
      // The assertion that was wrong before finding 132 stated it as "both
      // shells reject every malformed expansion". A construct only *one* shell
      // rejects is still a construct an author cannot rely on -- the file may
      // be run by either, and this repository's shebangs name `bash` while the
      // sandbox's interactive shell is `zsh` -- so the requirement is a
      // disjunction, not a conjunction.
      //
      // The strictness must also be bounded: nothing both shells accept may be
      // flagged, or the fixture list would be satisfied by a gate that flags
      // everything.
      for (const expansion of MALFORMED) {
        const zsh = shellRejects('zsh', expansion);
        const bash = shellRejects('bash', expansion);
        expect(
          zsh !== false || bash !== false,
          `both shells accepted ${expansion}, so it does not belong in this list`,
        ).toBe(true);
      }
    });

    it('`${}` is rejected by bash, which is the shell the gate must model', () => {
      // The construct finding 132 found unguarded, pinned by measurement rather
      // than by a list membership. `zsh` prints an empty value for it; `bash`
      // raises `bad substitution`. Both facts are asserted, because a future
      // fix that made the two shells agree would change the premise and this
      // test should then fail rather than silently keep passing.
      expect(shellRejects('zsh', '${}'), 'zsh no longer accepts ${}').toBe(false);
      expect(shellRejects('bash', '${}'), 'bash no longer rejects ${}').toBe(true);
    });

    it('the gate does not flag anything the shell it models accepts', () => {
      // The over-strictness bound, stated against `bash` alone.
      //
      // The previous wording was "both shells accept every well-formed
      // expansion", and finding 132 is the story of what that conflation cost:
      // `${}` was left out of the comparison because the shells disagreed, and
      // the construct bash outright rejects went unguarded for two iterations.
      //
      // The correct bound is asymmetric. A construct bash accepts is one the
      // repository's own scripts may use, so flagging it is a false positive
      // that would get the gate switched off. A construct *only* zsh rejects is
      // not the gate's subject at all: the gate models bash, and `${!ref}` in
      // this list is bash's indirect expansion, which works there.
      for (const expansion of WELL_FORMED) {
        expect(shellRejects('bash', expansion), `bash rejected ${expansion}`).toBe(false);
      }
    });

    it('rejects each malformed construct on its own, and accepts each well-formed one', { timeout: PER_CONSTRUCT_TIMEOUT_MS }, () => {
      // Per construct, not as one batch. This test used to build a single file
      // from the whole `MALFORMED` list and assert that file failed -- which was
      // satisfied by whichever construct the gate *did* catch, so a construct
      // that slipped through was invisible as long as it kept company with one
      // that did not.
      //
      // Finding 132 proved that with the hole in place: `${}` alone returns 0,
      // while the batched file still fails, because `${a.b}` is on the next
      // line. An assertion satisfied by its neighbours is a claim about the
      // neighbours. Each construct now gets its own file and its own verdict,
      // and the failure names the construct rather than the batch.
      for (const expansion of MALFORMED) {
        const rejected = shellFile(`#!/bin/bash\necho "${expansion}"\n`);
        expectFailedForOwnReason(run(rejected));
      }
      for (const expansion of WELL_FORMED) {
        const accepted = shellFile(`#!/bin/bash\necho "${expansion}"\n`);
        const outcome = run(accepted);
        expect(
          outcome.status,
          `the gate flagged the legal ${expansion}\n--- stderr ---\n${outcome.stderr}`,
        ).toBe(0);
      }
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
      expect(outcome.status, outcome.stderr).toBe(0);
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
      // This asserted `toHaveLength(1)` until findings 134 and 135 added two
      // more exit sites to the same script, at which point it failed for the
      // right reason: the claim is "every exit site of this gate is proved by
      // this file", not "this gate has one exit site". The count was a proxy
      // for the claim and the proxy broke while the claim held.
      expect(sites.length).toBeGreaterThanOrEqual(1);
      for (const site of sites) {
        expect(site.status, JSON.stringify(site)).toBe('proved');
        expect(site.provedBy).toBe('packages/core/test/check-no-unsafe-shell.test.ts');
      }
      // Non-vacuity: an empty list would satisfy the loop above.
      expect(sites.length).toBe(inventory.sites.filter((s) => s.provedBy === 'packages/core/test/check-no-unsafe-shell.test.ts').length);
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

/**
 * `--stdin`: the gate applied to a command that is not yet a file.
 *
 * ## The finding that produced these tests
 *
 * The gate's rule was correct and this file already proved it against both real
 * shells. The driving agent still interrupted three tool calls with
 * `Bad substitution`, and both facts are true because they are about different
 * objects: the gate reads the *repository*, and the failure was in a *command*.
 * A tool call is a shell string that is never committed, so it was never an
 * input to anything and no test could fail.
 *
 * `--stdin` makes that string an input. The rule is deliberately unchanged --
 * a second, laxer predicate for "a command a human typed" would be the
 * two-readers-of-one-claim defect this whole file hunts.
 */
describe('scripts/check-no-unsafe-shell.mjs --stdin', () => {
  it('catches the construct that actually interrupted a tool call', () => {
    // Verbatim from the reported failure. The program's own text is inside a
    // double-quoted shell string, so `zsh` parses `${Math.floor(1.5)}` as a
    // substitution, fails, and reports `Bad substitution` against itself.
    expectFailedForOwnReason(runStdin('node -e "console.log(${Math.floor(1.5)})"\n'));
  });

  it('accepts the same program written the safe way', () => {
    // The negative control. A mode that flagged every `$` would catch the line
    // above and make the gate useless, so the corrected spelling is asserted
    // beside it -- and this is the spelling the gate tells the reader to use.
    const outcome = runStdin("node -e 'console.log(Math.floor(1.5))'\n");
    expect(outcome.status).toBe(0);
    expect(outcome.status, outcome.stderr).toBe(0);
  });

  it('reads the command it was given, rather than reporting a verdict about nothing', () => {
    // The regression test for the defect this mode's *first draft* had.
    //
    // It parsed `--stdin` inside `targets()` and tested the flag above the call,
    // so the flag was still false, the scan selected no files, and the gate
    // printed OK for every input including the failing one. That is the same
    // "reports a verdict about something it never read" shape as findings
    // 123-130 -- reintroduced *inside the fix for it*, which is why the
    // assertion is a pair: one input that must fail and one that must pass.
    // A mode that reads nothing cannot satisfy both.
    expectFailedForOwnReason(runStdin('echo "${a.b}"\n'));
    expect(runStdin('echo "${a}"\n').status).toBe(0);
  });

  it('names the source it was given, so a failure points at the tool call', () => {
    const outcome = runStdin('echo "${a.b}"\n', 'tool-call-42');
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toContain('tool-call-42:1:');
  });

  it('falls back to a placeholder name rather than reporting an empty path', () => {
    const outcome = runStdin('echo "${a.b}"\n');
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toContain('<stdin>:1:');
  });

  it('checks every line of a multi-line command, not only the first', () => {
    // A tool call is frequently several commands. Checking line 1 and stopping
    // would report OK for a script whose last line is the broken one.
    const outcome = runStdin('set -eu\necho fine\nnode -e "console.log(${a.b})"\n');
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toContain('<stdin>:3:');
  });

  it('finds a defect on a later line even when an earlier line is quoted', () => {
    // The naive implementation of "skip comments" truncates at a `#` anywhere,
    // including inside a quoted string, and would then miss a defect after it.
    const outcome = runStdin('echo "a # b"\necho "${a.b}"\n');
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toContain('<stdin>:2:');
  });

  it('reads nothing and stays silent when the input is empty', () => {
    // An empty command has no defect, but the mode must still be *reached* and
    // terminate -- a `readFileSync(0)` on a closed stdin throws, and that would
    // be a crash reported as a finding.
    const outcome = runStdin('');
    expect(outcome.status).toBe(0);
    expect(outcome.status, outcome.stderr).toBe(0);
  });

  it('does not scan the repository when asked about a command', () => {
    // `--stdin` selects one input. If it also walked the default roots, a defect
    // anywhere in the tree would be reported against a tool call that does not
    // contain it -- and the reader would fix the wrong file.
    const outcome = runStdin('echo "${a}"\n');
    expect(outcome.status).toBe(0);
    expect(outcome.stderr).not.toContain('scripts/');
  });
});

/**
 * Findings 134 and 135: the two ways a caller destroys this gate's verdict.
 *
 * These are not tests of the shell rule. They are tests of the boundary: the
 * gate's rule was correct and fully covered, and the verdict was still lost --
 * once because a positional path selected nothing and the gate scanned the tree
 * instead, and once because a pipe replaced the exit status with `head`'s.
 *
 * Both are the same finding at a different layer: a check whose answer nothing
 * reads. The suite had 30 tests about the *rule* and none about the *contract*,
 * which is why neither was caught.
 */
describe('scripts/check-no-unsafe-shell.mjs · the invocation contract', () => {
  it('rejects a positional argument instead of silently scanning the tree', () => {
    // The reproducer, verbatim: this printed `OK` before the fix, because a
    // positional argument matched no flag and the scan fell through to the
    // default roots -- a correct verdict about the tree, and a false one about
    // the file the caller named.
    const outcome = runArgs(['t1.sh']);
    expectRefusedForOwnReason(outcome, 'unrecognised argument: t1.sh');
  });

  it('rejects a positional argument even when it names a real defective file', () => {
    // The dangerous form. With the defect present, a silent fall-through does
    // not merely answer the wrong question -- it answers `OK` about a file that
    // the supported spelling rejects, so the caller concludes there is no defect.
    const file = shellFile('#!/bin/bash\necho "${a.b}"\n');
    expectFailedForOwnReason(run(file));

    const outcome = runArgs([file]);
    expectRefusedForOwnReason(outcome, `unrecognised argument: ${file}`);
    expect(outcome.stdout).not.toContain('OK');
  });

  it('rejects a dangling --root with no value', () => {
    // `--root` at the end of the line consumed nothing and scanned the default
    // roots: the same silent `OK` as a positional path, spelled with a flag the
    // gate *does* document.
    const outcome = runArgs(['--root']);
    expectRefusedForOwnReason(outcome, '--root was given no value');
  });

  it('rejects a dangling --file with no value', () => {
    const outcome = runArgs(['--file']);
    expectRefusedForOwnReason(outcome, '--file was given no value');
  });

  it('rejects a dangling --label with no value', () => {
    const outcome = runArgs(['--label']);
    expectRefusedForOwnReason(outcome, '--label was given no value');
  });

  it('treats a flag-looking token after --file as a missing value, not as a path', () => {
    // `--file --stdin` would otherwise resolve to a path named `--stdin` and
    // report a read error as if the tree contained a broken file.
    const outcome = runArgs(['--file', '--stdin']);
    expectRefusedForOwnReason(outcome, '--file was given no value');
    expect(outcome.stderr).not.toContain('ENOENT');
  });

  it('still scans the committed tree when given no arguments at all', () => {
    // The positive control for the whole block. `pnpm lint` invokes the gate
    // with no arguments, so a fix that rejected arguments it did not understand
    // too aggressively would pass every test above and break the pipeline.
    const outcome = runArgs([]);
    expect(outcome.status, outcome.stderr).toBe(0);
    expect(outcome.status, outcome.stderr).toBe(0);
  });

  it('composes with `&&`, so a caller can check a command and then run it', () => {
    // ## The fourth occurrence, and the property that had to be built for it
    //
    // `Bad substitution: new` interrupted a tool call while this file was being
    // written up. The remedy had existed for three findings and could not have
    // fired, for one reason: **the remedy was always composed inside the command
    // it was meant to check.** `--stdin` requires
    // `printf '%s' "$cmd" | gate --stdin && eval "$cmd"`, and that composition
    // is itself a shell string that nothing checks.
    //
    // So the gate has to be usable as a component, which means a pass must print
    // nothing on stdout: `gate ... && run-the-thing` then works, `$(gate ...)`
    // compares clean, and a failure still stops the chain through the status.
    const file = shellFile('#!/bin/bash\necho ok\n');
    const composed = spawnSync(
      '/bin/sh',
      ['-c', `"${process.execPath}" "${SCRIPT}" --file "${file}" && echo RAN`],
      { encoding: 'utf8', cwd: ROOT },
    );
    expect(composed.status, composed.stderr).toBe(0);
    expect(composed.stdout.trim()).toBe('RAN');
  });

  it('prints nothing on stdout when composed, so the caller sees only their own output', () => {
    // The measured shape of stdout: `other` when run directly in this sandbox
    // (the harness captures it), `fifo` under a pipe, `file` under redirection.
    // A pass line would be prefixed onto every capture and every transcript
    // comparison, which is why the line follows the terminal rather than being
    // printed unconditionally.
    const file = shellFile('#!/bin/bash\necho ok\n');
    const captured = spawnSync(process.execPath, [SCRIPT, '--file', file], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(captured.status, captured.stderr).toBe(0);
    expect(captured.stdout).toBe('');
    // Non-vacuity: the failure report still reaches stderr when there is one, so
    // "silent" cannot be satisfied by a gate that never speaks at all.
    const defective = shellFile('#!/bin/bash\necho "${a.b}"\n');
    const failed = spawnSync(process.execPath, [SCRIPT, '--file', defective], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('bad-substitution');
  });

  it('allows --stdin to be fed by a pipe, which is the mode’s documented invocation', () => {
    // `printf ... | gate --stdin` pipes *into* the gate; the gate is not the
    // last command and nothing of its verdict is lost. Rejecting this would
    // make the one mode added for exactly this problem unusable.
    const outcome = runStdin('echo "ok"\n');
    expect(outcome.status, outcome.stderr).toBe(0);
    expect(outcome.status, outcome.stderr).toBe(0);
  });

  it('allows output redirection to a file, which preserves the status', () => {
    const file = shellFile('#!/bin/bash\necho "ok"\n');
    const piped = spawnSync('/bin/sh', ['-c', `"${process.execPath}" "${SCRIPT}" --file "${file}" > /dev/null`], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(piped.status).toBe(0);
  });
});
