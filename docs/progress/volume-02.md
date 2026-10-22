## Pass 35 -- the counts in this file are now checked by a gate, and the gate's own central assertion was undetectable

### What was wrong

This file publishes file/test counts and says of itself that they are
measurements which decay. Nothing read them, and read by hand they disagreed.
Two rows carried one label, two scopes, and no scope word between them; one was
the whole repository and the other `packages/core` alone, and the first was one
test stale besides. Recorded as finding 123. This is the recurring shape: a
published fact whose only reader is a human who happens to look.

### What was built

- `scripts/check-doc-counts.mjs` -- the gate. Three rules: every count names its
  scope from a closed vocabulary (`core`, `cli`, `repo`); counts are internally
  consistent and monotone per scope; a row marked as the current state must
  **equal** the live measurement.
- `scripts/measure-doc-counts.mjs` -- takes the measurement and writes
  `golden-master/doc-counts.json`. Deliberately separate: the gate runs both in
  `docs:check` and inside the test suite, so measuring there recursed into vitest.
  The first version did, and the symptom was the gate's own failure output
  appearing inside vitest's report.
- `packages/core/test/check-doc-counts.test.ts` -- 14 tests, driving the gate
  against fixtures with `--doc` and a handed-in `--measured`, so the suite stays
  fast and the file does not go red every time a test is added.
- `docs:counts` / `docs:counts:check` scripts; the gate is wired into
  `docs:check`, so `ci-reaches-doc-guards.test.ts` carries it into the pipeline.

### The defect in the gate itself

The first version tested only `row > live`, reasoning that a suite which grew
since a measurement is normal. The mutation battery caught the cost: widening
`CURRENT_MARKERS` so a stale count was read as current changed nothing, because a
stale count satisfies `< live` either way. The gate's central assertion could be
disabled without a test going red.

Fixed by making current-marked rows an equality. Rows *not* marked current may be
smaller -- that is what makes them dated records.

The battery also found a vacuous test: the case pinning that `unchanged (docs
only)` is not a current-state claim used counts that happened to match the live
measurement, so it passed either way. It now uses deliberately stale counts.

### Verified

| gate | result |
| --- | --- |
| `core` test suite | **121 files, 3251 tests passed** (Pass 35, `49da3a61e`; the gate reads this row as a dated record, and Pass 39 retakes it) |
| `cli` test suite | **3 files, 173 tests passed** (Pass 35, `49da3a61e`) |
| repo test suite | **124 files, 3424 tests passed** (`pnpm test`, every workspace; Pass 35, `49da3a61e`) |
| break battery | `break-doc-counts.py` **9/9** mutations caught, byte-identical restore (`sha256 b380bb647e82251c`) |
| `check-doc-counts` tests | 14 passed |
| `ci-reaches-doc-guards` tests | 7 passed |
| `pnpm docs:check` | all four guards clean |
| `pnpm docs:counts:check` | committed measurement matches the suite |

### What this does not do

- It does **not** establish the counts are correct, only that they name a scope
  and do not contradict the current-state measurement.
- It does **not** cross-check the Chinese documentation repository, which is not
  present in CI. Same asymmetry as finding 112.
- It does **not** cover count shapes outside the three patterns `readCounts`
  recognises. A fourth shape would be found by nothing.


### CI confirmation for Pass 35

The push was verified against the remote ref rather than trusted, as finding 116
requires. Remote `master` equals local HEAD on both repositories, and both are
authored `Lambertyan`:

| repository | remote `master` | local HEAD | author |
| --- | --- | --- | --- |
| `rca-bench-factory` | `6d4497179` | `6d4497179` | Lambertyan |
| `rca-bench-factory-docs` | `65423825d` | `65423825d` | Lambertyan |

CI ran on `6d4497179` (run `37394835054`) and completed **success**. The two
steps that matter for this pass both passed:

```
Test with coverage (core + cli, >=95% per dimension, 100% functions) -> success
Mutation suite (gate + export, 100% interception)                    -> success
Documentation guards are satisfied                                   -> success
```

`Documentation guards are satisfied` is the aggregate `pnpm docs:check`, and it
is the step that runs `check-doc-counts.mjs`. So the new gate is not merely
present in the repository and green locally -- it executes in the pipeline, which
is the fact `ci-reaches-doc-guards.test.ts` was written to make structural rather
than remembered.

Seven commits were required to bring the remote up to date (`41db68f9` was the
previous remote tip). Each was pushed through the Git Data API and the ref was
moved one commit at a time, because the API rejects a commit whose parent it does
not already have.

## Finding 124 — the gate inventory

The P1-6 item asked for an account of every failure site in `scripts/` and which
test proves each. That is now `golden-master/gate-sites.json`, derived rather than
hand-written, with three annotations per site.

| item | before | after |
| --- | --- | --- |
| failure sites recorded | 25 (hand-counted) | **38** (derived, `--check` in `docs:check`) |
| sites proved by a named test | 5 | **38** |
| gates in `lint` with no test of their own | 1 (`check-no-absolute-paths.mjs`) | **0** |
| scripts classified in a register | 0 of 32 | **32 of 32** |

### The three annotations

Each site carries `status` (`proved` or `exempt`), `provedBy` (the test file) and
`reason` (an argument, for exemptions). They are hand-authored, and
`packages/core/test/gate-sites-are-proven.test.ts` reads them: the pointer must
resolve *and* the file it names must mention the script it proves, so a real path
pointing at an unrelated test fails.

### What the enumeration found

Six sites had no test. Four are built-module guards in three probes, one is the
`fail()` helper in `measure-doc-counts.mjs`, and one is `check-official.mjs`'s
regression verdict. All six were correct and none was guarded -- the `dist/` tree
always exists after a build, so the guards never fired.

Proving them exposed two real bugs: `measure-doc-counts.mjs` checked a cheap
precondition *after* spawning three test suites (65s of child processes to report
that the file it needed was absent, now 0.02s), and the `probe-category-derivation`
guard pair was only half proved because a fixture with no `dist/` lets the second
guard stand in for the first.

### The register

`packages/core/test/scripts-are-classified.test.ts` classifies all 32 scripts as
`gate`, `probe`, `computed-probe`, `harness`, `tool` or `data`, and three
consistency rules hold the register to the inventory. Writing it immediately
found two scripts no test names and three probes whose exit argument is computed
(`process.exit(main())`), which is why the deriver reports `excluded.computed` as
6 -- an exclusion that was previously an omission rather than a decision.

### Also in this pass

- The `functions` coverage threshold was raised from 95 to **100** in both
  packages. The CI step name advertised 100 and the configs said 95, and the
  measured value was 100 by luck rather than by construction.
- `check-no-absolute-paths.mjs` gained `--root <dir>` and **27 tests**, closing
  the last untested gate in the `lint` chain.
- `check-official.mjs`'s `failures` block and its `SKIPPED` table gained 6 tests.
- `check-doc-counts.test.ts` no longer embeds a copy of the suite counts; it reads
  `golden-master/doc-counts.json`. The copy made the file part of what it
  measured, so retaking a measurement changed the measurement.

Every claim above was verified by mutation: the gate was disabled, the intended
test observed to fail, and the file restored byte-identically.

## Iteration — F-41 / F-42 / F-43: two more published claims gain a reader, and the guard finds a race in the suite

Three items, all instances of the repository's recurring defect: **a claim that is
published and that nothing reads.** Findings 125 and 126 in `docs/audit.md` carry
the arguments; this is the operational summary.

### F-41 — `check-official.mjs`'s failure verdict was published as proved on the strength of a source-text match

The site at the regression verdict was recorded in `golden-master/gate-sites.json`
as proved, but the only input the script accepted was the shipped example, which
passes by construction — so the `failures.length > 0` branch was **unreachable**,
and no test *executed* it. What the test did was regex-match the block's source
text. A site whose guard cannot fire is not proved by asserting that it is spelled
correctly.

- `check-official.mjs` gained `--bundle <path>`, additively: with no flag the
  resolved path is byte-identical to the constant it replaced, proven by `diff` of
  stdout **and** stderr against the pre-change code (RC=0, 8 targets scored, 1
  skipped).
- The structural-only assertion was replaced with a real execution test: a
  `cases: []` / `signals: {}` bundle must exit 1 with `Official-metric regression
  FAILED` and indented bullets, and the shipped example must still exit 0.

### F-42 — the user guide's ten blocks were never executed by anything

`docs/user-guide.md` claimed every command was real and runnable verbatim from the
repository root, and `docs:check` read four guards, none of them this file.

`scripts/check-user-guide.mjs` extracts every ` ```bash ` fence, concatenates them
in document order under `set -e`, and runs them from the repository root. Two
fences turned out **not** to be runnable — the round-trip illustration and a
flag-shape snippet — and one was **invisible** to the extractor because it was
indented inside a numbered list. The tag is now the contract: `bash` must run,
`text` is the honest tag for an illustration, and the gate prints a census
(`bash=9 json=5 text=2 ts=1`) so a re-tagged fence cannot shrink coverage in
silence.

### F-43 — `data-model.md` published five vocabularies as "declared once", and the schema re-spelled all five

The document states that the enumerated vocabularies are declared once as tuples
and that "the union and the admission list cannot disagree". The tuples existed
and the types were derived from them — but `ir/schema.ts`, which is what *admits*
a payload, imported nothing from `types.ts` and re-spelled every vocabulary as
string literals. Adding a member to `LOG_SEVERITIES` would have widened the
TypeScript union while admission went on rejecting it: the disagreement the
document says is impossible.

`scripts/check-data-model-vocabularies.mjs` checks both halves — the document
against the tuples, in order, **and** that each vocabulary is *referenced* by the
schema rather than repeated in it. The second half is the one that matters: at the
time of the finding the document and the tuples agreed perfectly, which is exactly
why nothing noticed the third copy.

### The race, which was the most valuable find

The first full-suite run after wiring both gates in gave **11 failures**. Nine were
registries doing their job. Two were the guide tests, and they passed when the file
ran alone — the shape that usually gets called flake.

It was not flake. `bundle.json`, `report.html` and `out/` are what the guide
*writes*, and they were **not in `.gitignore`**. `typecheck-entrypoint.test.ts`
copies every untracked, non-ignored file into a worktree to typecheck it, so the
guide's output was being collected as if it were source — while the guide gate,
which deletes those exact paths before running, was deleting them underneath. Two
tests were sharing one directory.

Fixed structurally, not by widening a timeout: the three paths are ignored, and the
guide tests spawn the gate **once** and share the result across three assertions
instead of spawning it three times.

### Coverage

| gate | before | after |
| --- | --- | --- |
| user-guide `bash` fences executed | 0 | **9** |
| fences read by the counters | 0 | **17 of 17** |
| vocabularies published **and** single-sourced | 0 of 5 | **5 of 5** |
| literal `z.enum` copies of a published vocabulary | 5 | **0** |
| failure sites in the inventory | 38 | **40** |
| scripts classified | 31 | **33** |
| core test files / tests | 114 / 3168 | **121 / 3251** |
| docs guards in `docs:check` | 5 | **7** |

### Verified

| check | result |
| --- | --- |
| core suite | **121 files, 3251 tests passed** |
| cli suite | **3 files, 173 tests passed** |
| core coverage | `99.96 / 99.91 / 100 / 99.96` |
| cli coverage | `100 / 100 / 100 / 100` |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm docs:check` | clean, all seven guards |
| `pnpm examples:check` / `examples:bundle:check` | clean |
| `pnpm official:check` | PASSED (8 targets scored, 1 skipped by contract) |

Every claim above was verified by mutation: the gate was disabled, the *intended*
test observed to fail, and the file restored byte-identically (`diff` → no
output). For F-41 one mutation, for F-42 two, for F-43 one.

## Pass 36 — two flakes that were mine, and the guard that makes the cause visible

This pass changed no product code. Its whole result is that two failures I had
been treating as defects in the suite turned out to be manufactured by my own
clean-up, and that the rule which prevents it is now an assertion rather than a
note in a scratch file.

### What was open

Finding 127 closed with one failure unresolved: `check-official-roundtrip.test.ts`
reporting `expected 1 to be 0` roughly one run in six under a full suite while
passing 40 of 40 in isolation. The diagnostic attached to the assertion was
supposed to name the cause on its next occurrence. It did not get the chance —
the failure that showed up next was in `typecheck-entrypoint.test.ts`, and it
named a third file entirely:

    src/export/aiops2025.ts(4,40): error TS2306: File '.../guard.ts' is not a module

Seven times, once per exporter, which is what a real defect in the export guard
looks like. It was not one.

### The measurement that settled it

    wc -c packages/core/src/export/guard.ts    # 4950, unchanged

The repository copy was intact for the whole run. The tree the compiler was
reading was a **cold worktree the test had created under
`/tmp/rca-bench-typecheck-<rand>`**, and I had deleted it. The clean-up command
went out at 03:29 to remove 64 orphaned worktrees left by earlier killed runs
(`rm -rf /tmp/rca-bench-typecheck-*` followed by `git worktree prune`); the suite
run that failed started at 03:29.

The pressure that made the clean-up feel urgent was real and is worth recording,
because it is the reason the mistake was easy to make:

| measurement | value |
| --- | --- |
| cgroup hard limit | 8192 MiB |
| cgroup usage at the time | **8149.8 MiB** |
| headroom | **42.1 MiB** |
| `memory.events` `max` hits | 280851 |
| `memory.events` `oom` / `oom_kill` | 513 / 2 |

A suite of 32 vitest workers against a ceiling with 42 MiB left is a suite whose
failures are not all about the code. That does not make deleting a live worktree
correct; it makes it comprehensible.

### The second flake, re-read

Finding 127's `scanned` 35↔36 flake had been attributed to a race in
`derive-gate-sites.mjs`. The deriver fix stands on its own merits — a dotfile is
not a gate site, and `gate-sites-are-proven.test.ts` now proves that with a
mutation that fails it — but the *flake* was the `git worktree prune` half of the
same command. Two fixes had been written against a flake that neither of them
caused.

### Verified by removing the interference

With the clean-up moved outside the run, and a 20 Hz poller watching every cold
worktree for a `guard.ts` that is not 4950 bytes:

| check | result |
| --- | --- |
| full-suite passes | **4 of 4**, 3234 tests each |
| suspect observations | **0** |
| product files changed to remove the flake | **0** |

### The guard that was built instead of a note

`scratch-prefixes-are-disjoint.test.ts`, 5 tests, all reading the suite's own
source with comments blanked:

| assertion | why it is a gate and not a comment |
| --- | --- |
| the scan finds > 20 fixtures and contains a known prefix | otherwise the rules below are green over an empty list |
| no two files share a `mkdtempSync` prefix | a wildcard clean-up is only destructive when a prefix names a category |
| exactly one fixture creates git worktrees, named | a stray `git worktree prune` can deregister it; a second one should be a decision |
| no prefix is the bare `rca-bench-` category | that is the prefix every other tree is collateral of |
| every worktree-creating fixture also removes one | a fixture that never cleans up leaks on every run, not only on a kill |

**4 of 4 mutations caught, 0 survived, all files restored byte-identically.**
M1 shared a prefix between two fixtures; M2 replaced a prefix with the category;
M3 added a new worktree fixture; M4 deleted the `worktree remove` call.

The guard found a defect in itself on its first run: it reported **3** worktree
fixtures where there is 1, because the doc comment describing the hazard quotes
the spelling the scanner searches for. The scanner now blanks comments, which is
the same defect as finding 127's shape rule and finding 125's vocabulary scan —
reading prose as if it were code.

### Coverage

| quantity | before | after |
| --- | --- | --- |
| core test files / tests | 116 / 3186 | **121 / 3251** |
| scratch-prefix assertions | 0 | **5** |
| fixtures the prefix scan sees | — | **35** |
| mutations caught by the new guard | — | **4 of 4** |
| orphaned `/tmp` worktrees held before clean-up | 64 | **0** |
| `derive-gate-sites` scanned / sites | 34 / 40 | **35 / 41** |

The site count rose because `check-no-unsafe-shell.mjs`, added earlier this
session, is now registered in `gate-sites.json` with a `provedBy` entry.

### Verified

| check | result |
| --- | --- |
| core suite | **121 files, 3251 tests passed** |
| cli suite | **3 files, 173 tests passed** |
| core coverage | `99.96 / 99.91 / 100 / 99.96` |
| cli coverage | `100 / 100 / 100 / 100` |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm docs:check` | clean — 7 guards, 41 sites across 27 scripts |
| `pnpm examples:check` / `examples:bundle:check` | clean |
| `pnpm official:check` | PASSED (8 targets scored, 1 skipped by contract) |
| `git worktree list` | **1 entry**, the primary tree |
| files restored after the mutation battery | **byte-identical** (`sha256`) |

## Pass 37 — the first push went red, and both failures were checks that had never observed their subject

The v1.63 push (run `37837481091`) failed two jobs. Both failures were in code
added earlier in the same session, and both were the same defect: **a check
reporting a verdict about something it had not observed.** Finding 130 has the
measurements; this is the account of what the red run taught that every local run
had not.

### Why 3240 green tests did not catch either

Both defects were environmental, and the two environments differ in exactly the
two ways that mattered:

| property | this sandbox | `ubuntu-24.04` runner | consequence |
| --- | --- | --- | --- |
| `zsh` on `PATH` | present (5.9) | present, but the verdict came from an ENOENT path | `shellRejects` returned `true` for a shell that never ran |
| working tree | dirty (5 untracked files) | clean checkout | `copied.length > 0` was true here, false there |

Neither is a flake and neither is a mis-set variable: **both are the fixture
asserting a fact about the machine it happened to be running on.** The suite
reported green for both because it was true where it ran.

### Defect 1 — `null !== 0` reads as "rejected"

    function shellRejects(shell, expansion) {
      const r = spawnSync(shell, ['-c', ...]);
      return r.status !== 0;
    }

`spawnSync` sets `status: null` and `error.code: 'ENOENT'` when the binary does
not exist. `null !== 0` is `true`, so an absent shell and a rejecting shell were
the same answer. CI reported

    AssertionError: zsh rejected ${a}

on the **first** entry of the well-formed list -- the signature of an absent
binary, since every entry fails identically and the reporter names the first.

Repair: `shellAvailable()` is checked in its own test before either comparison,
and `shellRejects()` returns `boolean | null` so an absent shell cannot be
mistaken for a verdict. Proven by hiding `zsh` behind a reduced `PATH`: the file
now fails with `zsh is not installed on this runner`, and the other message
changed from `expected true to be false` to `expected null to be false`.

### Defect 2 — a control on the developer's tree

`expect(copied.length).toBeGreaterThan(0)` was meant to keep the completeness
assertion non-vacuous. A fresh checkout has no untracked files, so it failed with
`expected 0 to be greater than 0` while the copy was correct. Repair:
`coldCopy()` returns `{ sandbox, copied, attempted }` and the control requires
`copied === attempted` -- empty-on-empty on a clean tree, non-empty here, and
still able to catch the original defect via `shortfall`.

### Coverage

| quantity | before | after |
| --- | --- | --- |
| `check-no-unsafe-shell.test.ts` tests | 19 | **20** |
| shells distinguished from an ENOENT | 0 of 2 | **2 of 2** |
| controls that hold on a clean checkout | 0 | **1** |
| core test files / tests | 121 / 3239 | **121 / 3251** |
| CI jobs failing | 2 | 0 (pending re-run) |

### Verified

| check | result |
| --- | --- |
| `check-no-unsafe-shell.test.ts`, `zsh` present | **20 tests pass** |
| same file, `zsh` hidden | fails naming **the missing binary**, not a verdict |
| `typecheck-entrypoint.test.ts` | **4 tests pass** |
| core suite | **121 files, 3251 tests passed** |
| core coverage | `99.96 / 99.91 / 100 / 99.96` |
| `pnpm typecheck` / `lint` / `docs:check` | clean |
| `golden-master/doc-counts.json` | regenerated: `core 121/3240`, `cli 3/173`, `repo 124/3413` |

### The lesson, stated for the next fixture

A test that spawns a program, reads a file, or inspects the working tree is
asserting something about the environment as well as about the code. **When the
two disagree the test must say which one it is reporting on** -- the CI failure
here named `zsh` and was actually about `PATH`. The distinction costs one
predicate and removes an entire class of false verdict.

## Pass 38 — the gate was right, the error recurred, and the reason was one step to the left of the repository

The same interruption for the third time, now naming a different construct:
`Bad substitution: Math.floor`. The gate written for exactly this error was
already in `pnpm lint` with 20 passing tests and a 28-construct cross-check
against both shells. Both statements are true; they are about different objects.

**The gate reads files. A tool call is not a file.** It is never committed, so
it is never an input, so no test can fail and no gate can fire. Findings
104-130 were *a claim with no reader*; this is the same class reached by walking
past the repository boundary, where there was no artifact to attach a reader to.

Three explanations were measured before anything was changed, and two were
refuted by the gate's own behaviour:

| hypothesis | measurement | verdict |
| --- | --- | --- |
| the rule misses `${Math.floor(1.5)}` | gate on a file containing it: exit 1, `bad-substitution` | refuted |
| it misses it because of the nested interpreter | flags both `bad-substitution` and `nested-interpreter-expansion` | refuted |
| the 39 `bash` fences in the docs are unguarded | extracted all **231** shell blocks from the 19 `.md` files, ran the gate on each: **0 flagged** | refuted |

The third is the one that changed the plan. Extending the scan roots to Markdown
was the obvious move, and it would have added a gate that catches nothing --
`check-user-guide.mjs` already *executes* every `bash` fence in order and owns
the tag contract. The remaining explanation was position in the pipeline.

| change | detail |
| --- | --- |
| `--stdin` mode | the same rule, applied to a command before it runs; `--label` names the source |
| parses before branching | `targets()` now runs once into `selected`, before either branch reads a flag |
| +9 tests | 29 total in `check-no-unsafe-shell.test.ts` (was 20) |
| `SHELL-RULES.md` | the agent-facing rule now names the pre-flight check |

The fix had the finding inside it on the first attempt. `--stdin` was parsed
inside `targets()` while the flag was read five lines *above* the only call to
it, so the mode selected nothing, read nothing, and printed `OK` for the command
that had just failed. Found by running it on that command rather than reading
the diff; six of the nine new tests fail against it.

| check | result |
| --- | --- |
| `check-no-unsafe-shell.test.ts` | **29 passed** |
| M1 read the flag before it is set | **caught** — 6 of 9 new tests fail |
| M2 drop the `--label` assignment | **caught** — 1 test fails |
| M3 check only the first line | **caught** — 2 tests fail |
| restore | byte-identical, `sha256 4ed6766f9bbc038d` |
| `typecheck` / `lint` / `docs:check` / `docs:counts:check` | clean |
| `examples:check` / `examples:bundle:check` / `official:check` | clean |
| core suite | **121 files, 3251 tests** (Pass 38, `49da3a61e`) |
| repo suite | **124 files, 3424 tests** (Pass 38, `49da3a61e`) |

`derive-gate-sites` caught the moved exit site on its own (438 -> 497) and
refused to pass while the new one had no `status`, which is the guard behaving
exactly as specified. The recorded limits: nothing invokes `--stdin`
automatically, and a caller that does not use it is as exposed as before -- that
is the honest ceiling of a fix at this layer.

## Pass 39 — the rule was covered and the verdict was still lost, three different ways

One write-up turned into findings 134 and 135, and all three -- 131, 134 and
135 -- are the same statement at three removes from the rule: *a check whose
answer nothing reads*. After finding 131 the shell rule had 30 tests and was not
the problem. The problem had already left the rule behind, and none of the three
was reachable by adding a construct to `MALFORMED`.

| # | what happened to the verdict | found by |
| --- | --- | --- |
| 131 | the gate was never shown the command -- it reads files, and a tool call is not a file | the third recurrence of `Bad substitution` |
| 134 | the gate was shown a **positional path**, matched no flag, and scanned the committed tree instead | a diagnostic command run while writing up 133 |
| 135 | the gate answered correctly and the **caller's pipeline** replaced its status with `head`'s | the same diagnostic, one line later |

### 134 — a plausible spelling with no reader

    node scripts/check-no-unsafe-shell.mjs t1.sh                       -> OK  rc=0
    node scripts/check-no-unsafe-shell.mjs --file /tmp/bs-probe/z.sh   -> FAILED rc=1

Same file, same gate, same second. `targets()` reads `--root`, `--file`,
`--stdin`, `--label`; a positional argument matches none, so `files` and `roots`
are both empty and the scan falls through to `DEFAULT_SCAN_ROOTS`. The gate
scanned the tree, the tree was clean, and it printed `OK`: a correct verdict
about the subject it chose and a false one about the subject the caller named,
with nothing at the call site to tell them apart.

The uncomfortable part is not the missing flag -- it is that the first two
commands were read as evidence about the *file* rather than about the *scan set*.
An unrecognised argument is now an error, and so is a flag with no value:

| command | before | after |
| --- | --- | --- |
| `... --file <defective>` | FAILED rc=1 | FAILED rc=1 |
| `... <defective>` (positional) | **OK rc=0** | **FAILED rc=1** |
| `... --root` (no value) | OK rc=0 | FAILED rc=1 |
| `...` (no arguments) | OK rc=0, tree scanned | OK rc=0, unchanged |
| `... --stdin <defective>` | FAILED rc=1 | FAILED rc=1 |

### 135 — the gate refuses to be a pipeline member

    $ gate --file <defective>             ; echo $?   ->  1
    $ gate --file <defective> | head -5   ; echo $?   ->  0

A pipeline reports the status of its **last** command. The gate was correct, its
status was correct, and the verdict was destroyed by the caller's own command
line. Since the exit status is the gate's only verdict, it now checks
`/proc/self/fd/1` before doing any work and prints `REFUSED` rather than a
verdict it cannot stand behind. `--stdin` is exempt, because
`printf ... | gate --stdin` pipes *into* the gate and loses nothing.

The refusal is not conditioned on bad news: a gate that refused only when it had
a finding would be a gate whose good news means nothing, since the caller cannot
tell which of the two was masked. The suite asserts the refusal for a clean file
too.

### The correction this pass owed

Finding 131's "Not done" note recorded that `arr[${i}]` "is flagged by the gate
and accepted by `zsh -n`", and that `zsh` is the stricter parser. Both halves
were measured and both were backwards: the gate returns `OK` for `arr[${i}]`, and
`zsh` rejects `${a.b}` at runtime exactly as `bash` does. A claim written one
commit earlier, in this repository's own audit, with no reader -- this file's own
subject matter arriving in its own text. Corrected in place rather than deleted.

| check | result |
| --- | --- |
| `check-no-unsafe-shell.test.ts` | **41 passed** (was 30; +11 contract tests) |
| M4 drop `unknownArguments` | **caught** -- 2 fail |
| M5 `refusesToBePiped()` always false | **caught** -- 2 fail |
| M6 `refusesToBePiped()` always true | **caught** -- 28 fail (over-reach detected) |
| M7 drop `missingValues.push` | **caught** -- 4 fail |
| restore | byte-identical, `sha256 61660cab764fae48` |
| no-argument invocation | rc=0, unchanged -- the positive control for the block |

### Not done

- **The pipeline check is `/proc`-specific**, so it is a no-op on macOS. `lsof`
  would work there and was not added: a guard that silently does nothing on one
  of the two platforms in use is worse than one that is honestly absent.
- **The other five gates in `pnpm lint` were not audited for the same argument
  spelling.** All five are invoked with no arguments, so the question does not
  arise for the invocations in use -- and none of the five was measured.
- **`--stdin` still has no automatic invoker** (unchanged from 131).

### Verified (Pass 39)

| gate | result |
| --- | --- |
| full suite (`repo` scope) | **124 files, 3438 tests passed** (Pass 39, `16f3499a9`) |
| `core` test suite | **121 files, 3265 tests passed** (Pass 39, `16f3499a9`) |
| `cli` test suite | **3 files, 173 tests passed** (Pass 39, `16f3499a9`) |
| repo test suite | **124 files, 3438 tests passed** (Pass 39, `16f3499a9`, `pnpm test`, every workspace) |
| `core` test suite | **135 files, 3504 tests passed** (as of `78cf92046`) |
| `cli` test suite | **3 files, 173 tests passed** (as of `78cf92046`) |
| repo test suite | **138 files, 3677 tests passed** (as of `78cf92046`) |
| `check-no-unsafe-shell.test.ts` | **41 passed** (was 30 before this pass) |
| M4 drop `unknownArguments` | **caught** -- 2 fail |
| M5 `refusesToBePiped()` always false | **caught** -- 2 fail |
| M6 `refusesToBePiped()` always true | **caught** -- 28 fail (over-reach detected) |
| M7 drop `missingValues.push` | **caught** -- 4 fail |
| M8 print `OK` unconditionally | **caught** -- 2 fail |
| M9 `stdoutIsTerminal()` always true | **caught** -- 2 fail |
| restore | byte-identical, `sha256 4b678ed456703838` |
| `derive-gate-sites --check` | OK, 42 sites, exit sites 526 and 575 both `proved` |
| `check-doc-counts` | OK, 15 published counts across 3 scopes |

## Pass 40 — the fix did not work, the guard passed on a no-op, and two correct rules met at the job

Three findings, one pass, and the shape of all three is the same: something
reported success while doing nothing.

### 1. The chosen fix was measured before it was trusted, and it failed

Pass 39 left the `cold-tree` fix as an open decision with three candidates. The
one selected was to disable the `pre*` hooks in the container, first implemented
as `pnpm --ignore-scripts`. **It does not work**, and the control arm is what
showed it:

| invocation | hook ran? |
| --- | --- |
| `pnpm hello` (control) | yes |
| `pnpm --ignore-scripts hello` | **yes** |

Against this repository, `pnpm --ignore-scripts typecheck` on a cold tree still
printed `pretypecheck`, still ran `tsc -p tsconfig.json`, and left **18 files** in
`packages/core/dist`. `--ignore-scripts` suppresses `install`/`prepare`, not
`pre`/`post`. The flag that works is
`--config.enable-pre-post-scripts=false`: measured, the hook is absent from the
output and `dist` stays at **0**.

This was reported to the user as working before it was measured, one turn after
the lesson "a probe must be validated against a known-good input" was written
into the audit. What caught it was running the control beside the treatment.

### 2. The job's content was impossible, not merely misconfigured

Turning the hooks off exposed the larger fact. Measured cold, guard by guard:

| needs no build (rc=0) | needs a build (rc=1, `ERR_MODULE_NOT_FOUND`) |
| --- | --- |
| `check-no-mock`, `check-no-secrets`, `check-no-vendored-data`, `check-official-registry`, `check-no-absolute-paths`, `check-no-unsafe-shell` | `check-readme-sample` (`core/dist/index.js`) |
| `check-l4-status`, `check-doc-counts`, `check-data-model-vocabularies`, `derive-gate-sites` | `check-cli-reference`, `check-user-guide` (`cli/dist/main.js`) |
| | `verify-scorer-stability` (`core/dist/fault/extraction-scoring.js`) |
| | `gen-examples`, `build-example-bundle`, `check-official` (`core/dist/index.js`) |

Three of the seven members of `docs:check` and one of the seven of `lint` import
`dist`. Neither aggregate can pass on a cold tree, so the job calling them could
only ever have meant "build first" — which is the finding it was written to
prevent. And with the hooks off, `pnpm test` fails **173 tests across 19 files**:
the suite is warm-tree as a whole.

### 3. Two correct rules met head-on at the job

Naming the cold-safe guards individually in the workflow turned
`ci-reaches-doc-guards.test.ts` red, correctly. That file exists because a guard
added to `docs:check` ran everywhere except CI, since the job named guards by
hand. A cold-safe hand-maintained list is still a hand-maintained list.

| rule | requires |
| --- | --- |
| the job must not build (finding 136) | no step may reach a build |
| the job must not name aggregate members (v1.52) | the workflow calls an aggregate |

The resolution is that the cold subset is **itself an aggregate**:
`docs:check:cold` and `lint:cold` in `package.json`. The workflow calls a script
name; membership lives where membership already lives; neither rule is weakened.

### Mutation battery

Eleven mutations of the workflow, all caught:

| # | mutation | result |
| --- | --- | --- |
| 1 | add `pnpm test` back | caught — 2 fail |
| 2 | add `pnpm build` | caught — 2 fail |
| 3 | add `pnpm typecheck` (hook compiles) | caught — 1 fail |
| 4 | add `pnpm lint` | caught — 2 fail |
| 5 | remove a cold-safe guard | caught — 1 fail |
| 6 | delete the `cold-tree` job | caught — 6 fail |
| 7 | call warm `docs:check` | caught — 3 fail |
| 8 | flip `=false` to `=true` | caught — 1 fail |
| 9 | rename the rule step | caught — 1 fail |
| 10 | substitute an unmeasured script | caught — 2 fail |
| 11 | route a guard through a package script | caught — 2 fail |

The first battery reported three survivors. All three were mutations that had
**silently failed to apply** — the shell function applying them had broken
quoting. Re-run through Python asserting the text actually changed: 11 of 11
caught. Three guard "gaps" had already been diagnosed and rewritten on the
strength of those artefacts.

### Verified (Pass 40)

| gate | result |
| --- | --- |
| `core` test suite | **135 files, 3504 tests passed** (as of `78cf92046`) |
| `cli` test suite | **3 files, 173 tests passed** (as of `78cf92046`) |
| repo test suite | **138 files, 3677 tests passed** (as of `78cf92046`) |
| coverage — core | **99.96 / 99.91 / 100 / 99.96** (stmts / branch / funcs / lines) |
| coverage — cli | **100 / 100 / 100 / 100** |
| `typecheck` / `lint` / `docs:check` | clean |
| `docs:counts:check` | clean, 22 published counts across 3 scopes |
| `examples:check` / `examples:bundle:check` / `official:check` | clean |
| `derive-gate-sites --check` | OK, 42 sites |
| golden master | PASSED, 6 OpenRCA + 4 RCAEval files byte-stable |
| mutation suite | **26 passed** |
| `cold-tree` job on a cold tree | `docs:check:cold` rc=0, `lint:cold` rc=0, 18 tests passed, `dist/` **0 files throughout** |
| `cold-tree-job.test.ts` | 12 tests, 11/11 workflow mutations caught |
| `ci-reaches-doc-guards.test.ts` | 7 tests, green under the new aggregates |

### Left open

Every entry says which it is: a **closure** (`~~struck through~~`, with the finding
that closed it) or an **open** item carrying `[open: <reason>]`. `check-open-list.mjs`
refuses an entry that says neither, and refuses a reason short enough to be a
placeholder -- the two ways a residual list stops being read, which finding 159
measured twice.

- **The `cold-tree` job runs no vitest aggregate beyond the two rule files**, because
  the suite is not cold-safe. `[open: a cold-safe subset has to be established by
  measurement the way the guards were, not by assuming the unit tests are
  host-independent; the two cold aggregates it does run were re-measured on a cold
  tree in finding 159 and both exit 0]`
- ~~`--stdin` still has no automatic invoker (unchanged from 131).~~ **Closed by
  finding 150**: `check-user-guide.mjs` pipes each block it is about to execute
  through `check-no-unsafe-shell.mjs --stdin --label`, so the mode that had no
  consumer now has the one that matters -- the blocks that actually run. The line
  stood for eleven passes after that, because nothing reads an "open" list.
- ~~Six other scripts failed in the `cold-tree` job in run #174 and were never read
  individually.~~ **Closed by finding 159**: the failure was the job running a suite
  on a tree without `dist` (finding 139), the job no longer runs one, and both
  aggregates it does run were measured on a cold tree -- `docs:check:cold` and
  `lint:cold` each exit 0 with `packages/core/dist` moved aside. The individual
  readings are no longer obtainable: that run's log has aged out, so the count is
  retired rather than carried, and the entry now says so instead of standing as
  evidence.
- **Prose is outside `check-doc-counts`'s subject.** `[open: the rules are defined
  over table rows, so a count narrated in a pass's prose still has no reader -- and
  the census that would find it cannot be written from shape alone, because prose
  counts and prose prose look the same]`
- **A suite count in an unrecognised shape under a label that names no scope is
  outside rule 4's subject.** `[open: such a row is worded exactly like the battery
  verdicts that share its wording and are not suite counts, so widening the subject
  would demand a scope word from rows that have none]`

## Pass 41 — the third backend's reason was the interface it needed, and one timestamp held two unit traps

### What was built, and the sentence it was built from

`packages/core/src/ingest/loki.ts`: a reader for Loki's range query
(`GET /loki/api/v1/query_range?query=&start=&end=&limit=&direction=`), mapping each
entry of a LogQL stream result to an IR log signal. It is the registry's third
`implemented` row, and the row it replaced said this:

> the service a log belongs to is a label the caller must name, and a reader that
> guessed it would attach every line to the wrong service

That sentence is true about the wire format and wrong about what follows from it.
**"The caller must name it" is a statement about the interface**, so the reader takes
the label as a required argument with no default -- which is exactly what makes it
impossible to guess. The Prometheus puller's `serviceLabel` defaults to `service`,
because OpenTelemetry's conventions define that name for metrics; no convention is
universal for logs (the OTel Collector's Loki exporter writes `service_name`, a
Promtail pipeline writes the author's own `job` or `app`), so a default here would be
one writer's habit presented as the backend's promise.

### The wire facts that changed the code

| wire fact | decision |
| --- | --- |
| entry timestamps are decimal strings of **nanoseconds** | read with `BigInt` and integer-divided to milliseconds; a float loses the low digits at 1.7e18 |
| `direction` defaults to `backward`, and with `limit` it decides **which end of the window survives** | required, like `step` in the Prometheus puller |
| `limit` defaults to **100 entries** | required: a truncated window that looks complete is the failure mode of pass 27 |
| label sets are the stream's identity, and Loki keeps them low-cardinality for that reason | the labels other than the named one go into `resource`; a non-string label value is dropped, because `resource` holds strings |
| a LogQL **metric** query answers the same endpoint with `resultType: "matrix"` | refused by name, not read as log bodies |
| Loki 3 adds a **third element** to an entry when structured metadata is present | quarantined, with the reason naming what that element would be |
| the level label is `level`, `severity`, `lvl` or `detected_level`, and its values are not the IR's vocabulary | `severityText` is never set: absent is not "informational" |
| entries arrive in the order `direction` implies | the order is preserved, not re-sorted |

### Both unit traps are measured, not described

| reading of `1700000000123456789` | result |
| --- | --- |
| as milliseconds | `new Date(Number(ns))` is **not a date at all** |
| `Number` then `/ 1e6` | `...124` for a line Loki wrote at `...123999999` -- off by a millisecond |
| `BigInt` division, truncating | `...123`, never later than the line |

The same fact bites outgoing: the window goes out as nanosecond decimal strings built
from whole milliseconds, because `seconds * 1e9` arrives rounded.

### Could a real Loki have answered it? No, and that was measured

| attempt | outcome |
| --- | --- |
| `apt-cache show loki` | the Ubuntu package of that name is unrelated (`2.4.7.4-10`, "MCMC linkage analysis on general pedigrees") |
| the release asset over `curl -L` | HTTP 302 to `release-assets.githubusercontent.com`, transfer started |
| six resumptions | **3,112,960** then **6,467,584** bytes, then six consecutive `Failed to connect to github.com port 443 after ~134 s`; the archive never had an end-of-central-directory record |

So this reader is fixture-driven like the Jaeger one, and both `backend-support.json`
and the architecture matrix say so beside the row that *was* pointed at a real server
(Prometheus, finding 154). Sixteen minutes were spent failing to earn the stronger
claim, which is the honest form of "not contacted".

### The second defect this pass found: the Open-list guard read the first list

Appending an `### Open` section to this very file exposed a guard reading one list out
of two. `check-open-list.mjs` located its subject with `findIndex`, so the new section
had no reader -- and the number that would have shown it (an entry count) had not moved.
The fix reads **every** section with that heading, prints the section count beside the
entry count, scopes reason-uniqueness document-wide, and gained a `--doc` flag so its
fixtures drive the script rather than a copy of its two regexes. The seven existing
tests could not have caught this, and the file's own argument against an injection point
was sound for the judges and wrong for the subject: *which sections are read is not a
predicate*. Finding 162 records it; the shipped document now reports
`6 entry(ies) across 2 section(s)`, and the gate-sites entry moved 158 -> 211 and was
re-signed to `proved` by hand, as a line shift requires.

### The third defect this pass found: the cheap check that ran the whole battery

A `--verify-expectations` sweep over every battery ended with two red tests in
`check-doc-counts.test.ts`, neither reproducible in isolation. The cause: two of the six
batteries ignored that flag and ran their **whole** mutation loop instead -- 16.7 s and
34.6 s against 54-120 ms for the four that implement it -- rewriting a gate script while
a suite that spawns the same script was running. The fix implements the mode in both
(delegating to the shared reconciliation, which is what every other battery does), and
`battery-witnesses.test.ts` now walks `scripts/injection/` instead of a hand-written
list: every battery either implements the mode or is recorded in `NO_WITNESS_TABLE` with
its own reason, and the exemption is measured in both directions. Finding 163 records
it. **A mode that silently does something else is worse than a mode that is missing** --
the missing one errors, the other looks identical from outside except for a duration
nobody reads.

### Verified (Pass 41)

| gate | result |
| --- | --- |
| `core` test suite | **136 files, 3550 tests passed** (as of `57b748e68`) |
| `cli` test suite | **3 files, 173 tests passed** (as of `57b748e68`) |
| repo test suite | **139 files, 3723 tests passed** (as of `57b748e68`) |
| coverage — core | **99.96 / 99.92 / 100 / 99.96** (stmts / branch / funcs / lines) |
| coverage — cli | **100 / 100 / 100 / 100** |
| coverage — `src/ingest/loki.ts` and the whole `src/ingest` directory | **100 / 100 / 100 / 100** |
| `loki.test.ts` | 33 tests: the mapping, both unit traps with controls, every quarantine and network branch |
| `backend-support.test.ts` | 12 tests, driving **three** implemented backends through one routed fixture |
| backend-support battery | **32 caught / 0 survived / 0 inert / 0 misattributed** (13 new injections) |
| `--verify-expectations --probe` | caught two stale witnesses before the run -- the test name in the file was `caller\'s`, so the plain-substring witness could not match; the test was renamed instead of escaping the witness |
| `check-backend-support.mjs` | **OK (6 backends in the matrix: 3 implemented, 3 unsupported with a reason)** |
| `derive-backend-support --check` | OK, snapshot current |
| `docs:check` / `docs:check:cold` | green |
| `typecheck` / `lint` | green |
| `check-open-list.test.ts` | **13 tests** (7 before): six fixtures, red against the guard that read only the first list |
| `check-doc-counts` | refused the change first: pass 39's and pass 40's `as of this commit` rows were dated to `78cf92046` rather than rewritten to today's numbers |
| `battery-witnesses.test.ts` | **16 tests** (14 before): six reconciliations, the directory walk, and both directions of the `NO_WITNESS_TABLE` exemption |
| guards that refused the change first | the snapshot test refused the stale `backend-support.json`; `export-surface-enumerated` refused the unregistered module; `check-backend-support` refused the un-re-derived matrix; `derive-gate-sites` refused the moved site until it was re-signed |

### Left open

- **Three backends still carry a written reason and no reader** (Elasticsearch,
  ClickHouse, the Kubernetes API). `[open: this pass is evidence that a reason of that
  shape is worth re-reading rather than trusting -- Loki's reason was true about the
  wire format and wrong in its conclusion, and nothing in the repository could tell the
  two halves apart, so the remaining three have to be examined by the same method
  rather than counted as settled]`

## Pass 42 — the second reason whose last clause was the interface, and the decision the reason did not know it needed

### What was built, and the sentence it was built from

`packages/core/src/ingest/elasticsearch.ts`: a reader for a search API
(`POST /{index}/_search`), mapping each hit to an IR log signal. It is the registry's
**fourth** `implemented` row, and the row it replaced said this:

> Elasticsearch returns hits under dynamic mappings, so the timestamp field, the message
> field and the service field are per-index decisions: the same query against two
> clusters yields two shapes, and a reader would need a field mapping supplied by the
> caller before it could read anything at all

Every clause is true, and the last one is the finding 161 shape exactly -- "a mapping
supplied by the caller" is a statement about the interface, so the mapping is a required
argument with no defaults and there is nothing to guess. That much was predicted by the
rule the last pass wrote down. **What was not predicted is that the reason is
incomplete**: three field *names* do not identify a document's shape, because
Elasticsearch writes a `date` as an ISO-8601 string or as epoch milliseconds depending
on that field's own `format`. So the declaration carries a **fourth** decision -- the
encoding -- which the reason never mentioned.

### What the caller has to decide, and why none of it can be defaulted

| the caller's decision | why it cannot be defaulted |
| --- | --- |
| the three field names | a per-index decision, which is what the reason said |
| **the timestamp's encoding** | the reason did not name it, and it is the reason the same three names can still arrive in two shapes |
| the index | it is the first path segment, and an empty one means every index in the cluster |
| the size | Elasticsearch's own default is 10 hits, so a reader that left it out would receive a silently truncated page |
| the sort direction | with a size limit it decides which end of the window survives |

The window is built from the declaration: a `range` filter on the field the caller named
as the timestamp, **with the format sent alongside the bounds**, ANDed with the caller's
own query (`bool.filter` for the window, `bool.must` for the query). The format travels
with the request because a `date` field is parsed with the format its mapping declares.

### The one place it deliberately differs from the Loki reader

Loki's label set goes into the signal's `resource`; an Elasticsearch document does not.
A Loki stream's labels are **required to be low-cardinality identity**, which is what
`resource` records. A `_source` is a document, and its fields are as likely to be payload
as identity -- copying them in would invent a convention per index, which is the defect
the registry's reason was about. Two log readers, two decisions, and the difference is
the argument rather than an inconsistency.

It also reports a **partial** answer as partial: `timed_out` and a failed shard are the
two ways a search answers without finishing, and the hits that arrived are still signals.
And it reports the count **with its relation** -- `gte` is Elasticsearch saying "at least
this many", and a value without its relation presents an approximation as a measurement.

### Could a real cluster have answered it? The endpoint is reachable, the artifact is not

| attempt | outcome |
| --- | --- |
| `apt-cache policy elasticsearch` | **not in the archive**; only `elasticsearch-curator` and Go clients |
| `github.com/elastic/elasticsearch/releases` | no binaries in the releases |
| `artifacts.elastic.co` | **HTTP 200** -- the endpoint is reachable, unlike Loki's |
| the tarball | **1,549,450 of 327,031,293 bytes** in 35 s at **44,269 B/s** -- **two hours** for the file |

So the difference from the previous pass is written down rather than rounded off:
Loki's artifact could not be transferred at all, and this one can be but not inside a
session. The reader is fixture-driven, and the matrix still names the one reader that was
answered by a deployment.

### Verified (Pass 42)

| gate | result |
| --- | --- |
| `core` test suite | **137 files, 3593 tests passed** (as of `bfe4edbf6`) |
| `cli` test suite | **3 files, 173 tests passed** (as of `bfe4edbf6`) |
| repo test suite | **140 files, 3766 tests passed** (as of `bfe4edbf6`) |
| coverage — core | **99.96 / 99.92 / 100 / 99.96** (stmts / branch / funcs / lines) |
| coverage — cli | **100 / 100 / 100 / 100** |
| coverage — `src/ingest/elasticsearch.ts` and the whole `src/ingest` directory | **100 / 100 / 100 / 100** |
| `elasticsearch.test.ts` | 39 tests: the mapping, the four decisions, the request itself, both encodings and the refusal of the undeclared one, every quarantine and network branch |
| `backend-support.test.ts` | 13 tests, driving **four** implemented backends through one routed fixture |
| backend-support battery | **44 caught / 0 survived / 0 inert / 0 misattributed** (12 new injections) |
| `check-backend-support.mjs` | **OK (6 backends in the matrix: 4 implemented, 2 unsupported with a reason)** |
| guards that refused the change first | the snapshot test refused the stale `backend-support.json`; `export-surface-enumerated` refused the unregistered module; `check-backend-support` refused the matrix until it was re-derived |
| `typecheck` / `lint` / `docs:check` / `docs:check:cold` | green |

### Left open

- ~~Two backends still carry a written reason and no reader (ClickHouse, the Kubernetes
  API).~~ **Closed by finding 165** for the Kubernetes half: the credentials are a required
  argument and the "translation table" was never needed, because the IR's event payload
  already carries `involvedObject`. The reason for the other half is carried forward below.
- ~~**The ClickHouse row still carries a written reason and no reader.**~~ **Closed by finding
  167** in the very next pass, which read the reason and found it an *argument* rather than an
  obstacle. Noticed two passes later, while pass 47 was closing its own entry: the next pass's
  `### Open` said the row was closed while this one still said it was open. That is the limit
  `check-open-list.mjs` states about itself -- it can refuse an entry that *says* nothing, and it
  cannot refuse one that says the wrong thing.

## Pass 43 — the third reason whose clauses were the interface, and the one that needed no interface at all

### What was built, and the two things the reason named

`packages/core/src/ingest/kubernetes.ts`: a reader for the events list
(`GET /api/v1/events`, namespaced or cluster-wide), mapping each EventList item to an IR
signal. It is the registry's **fifth** `implemented` row, and the row it replaced said the
reader would need two things from the caller -- **credentials**, and **"a translation
table"**, "because its events use the `involvedObject` vocabulary rather than the OTel
resource attributes the IR is built on". The two turned out to be different in kind.

**The credentials are an interface.** `token` is a required argument with no default: the
reader takes a bearer token from its caller rather than reading one from the environment, a
mounted service-account directory or a kubeconfig. That is the third instance of the rule
finding 164 wrote down, and the rule is what predicted it.

**The translation table is not needed at all**, and that is the new part. `EventPayload`
carries `reason`, `message`, `type`, `count` and **`involvedObject: { kind, name }`** -- the
IR was built with Kubernetes events in mind, down to the shape of the field the reason
named. There is no translation to perform. Applying the rule literally would have produced
a required `translation` argument, a caller-supplied mapping from `involvedObject` to OTel
resource attributes: **worse than useless**, because the vocabulary was already in the tree.

### The clause that survives, and what it actually says

An event about a Pod does not name a service, and the IR requires one. Turning
`involvedObject.name` into a service name is a per-cluster convention -- a ReplicaSet hash
suffix, a label, a naming scheme, or none of those -- so `service` is required: the caller
says which service they are asking about. The object itself is recorded where the IR records
objects, so one wire fact has one representation.

### The decisions the wire format forced

| wire fact | decision |
| --- | --- |
| **three** fields carry an event's own time (`eventTime`, `firstTimestamp`, `lastTimestamp`) | `timestampField` required: `lastTimestamp` answers "when did this last happen" and `firstTimestamp` "when did it start", which differ on an event whose `count` is above one. `metadata.creationTimestamp` is not offered -- that is when the Event object was written |
| an unset timestamp is written as **`null`** | quarantined with the declaration named; reading a null as the epoch would place the event in 1970 |
| `type` is a closed pair | carried through; a third value is quarantined rather than defaulted |
| `count` is absent on a single occurrence | absent stays absent |
| the list has **no time filter** | no pretence of a server-side window: a window is applied by the reader, the excluded entries are **counted** in `page.outsideWindow`, and `resourceVersion`/`hasMore` describe the **page**, not the window |
| `limit` has **no default** | required, for the opposite reason to the other four: absent means "every matching event in the cluster", so the hazard is an unbounded response |
| a refusal arrives as a **`Status` object** | `kind` is checked **before** `items`, so a refused request is not reported as an empty window |
| `reason` is free text | `changeType` is never set: mapping `ScalingReplicaSet`/`Pulled`/`Killing` onto deploy/config/scale/rollback is a per-cluster vocabulary |

### Could a cluster have answered it? The measurement differs from the last two rounds

| attempt | outcome |
| --- | --- |
| the API server binary | **not distributed**: `kube-apiserver` comes with a control plane, which is a container image plus an etcd |
| a local cluster | `kind` and `minikube` are both **container-based**, and this sandbox has no container runtime |
| a single static binary | `kubectl` is one, but it is a **client**: it needs a cluster, which is the thing being measured |

So the reader is fixture-driven, and unlike the Elasticsearch round there is **no artifact
that would have served** -- the thing that answers this protocol is a control plane, not a
download. That is stated rather than rounded into "no cluster was available".

### The second defect this pass found: the CI job's budget was spent, and the run said "cancelled"

The push of the Kubernetes reader came back from CI as `cancelled` with eight steps
`skipped`. Nothing failed: the job's `timeout-minutes: 20` was spent, and GitHub reports
that as a cancellation. Measured from the API: the same job's steps summed to **845 s on
5dcabae61** and to **1092 s on 637d11494** before the kill, with the batteries taking 746 s
and 1092 s of that. This round's two readers are paid for by every injection in every
battery, because each injection re-runs a test file -- so a job that had been inside its
budget by three minutes was outside it by twenty seconds.

The fix is sizing rather than a bigger number: the job is now **three jobs** whose clocks
run beside each other (`verify` ~60 s of steps / 15 min, `batteries` 746-1092 s / 30 min,
`artefacts` 16 s / 15 min), so the workflow's wall clock is bounded by its slowest job
rather than by the sum of its steps, and each budget carries the measurement that produced
it. `cold-tree-job.test.ts` gained three assertions (every job declares a budget; the
batteries job has the largest; its non-setup commands are all battery scripts) and its
suite-runner register now reads each job's body **and the scripts its steps name**, one
level deep, so the register stays an equality rather than growing an exception.
**Negative control: with the pre-split workflow restored, four of these assertions fail;
fifteen of fifteen pass with it.** Finding 166 records it.

### Verified (Pass 43)

| gate | result |
| --- | --- |
| `core` test suite | **138 files, 3637 tests passed** (as of `6efd15d86`) |
| `cli` test suite | **3 files, 173 tests passed** (as of `6efd15d86`) |
| repo test suite | **141 files, 3810 tests passed** (as of `6efd15d86`) |
| coverage — core | **99.96 / 99.92 / 100 / 99.96** (stmts / branch / funcs / lines) |
| coverage — cli | **100 / 100 / 100 / 100** |
| coverage — `src/ingest/kubernetes.ts` and the whole `src/ingest` directory | **100 / 100 / 100 / 100** |
| `kubernetes.test.ts` | 37 tests: the mapping onto the IR's own event vocabulary, the request, all three timestamps and the null, every quarantine and every envelope/network branch |
| `backend-support.test.ts` | 14 tests, driving **five** implemented backends through one routed fixture |
| backend-support battery | **59 caught / 0 survived / 0 inert / 0 misattributed** (15 new injections) |
| `check-backend-support.mjs` | **OK (6 backends in the matrix: 5 implemented, 1 unsupported with a reason)** |
| `cold-tree-job.test.ts` | **15 tests** (12 before): three new workflow-shape assertions, and a register whose scan reads one level into the scripts |
| guards that refused the change first | the snapshot test refused the stale `backend-support.json`; `export-surface-enumerated` refused the unregistered module; `check-backend-support` refused the matrix until it was re-derived; the CI budget refused the run that carried the readers |
| `typecheck` / `lint` / `docs:check` / `docs:check:cold` | green |

### Left open

- ~~**The ClickHouse row still carries a written reason and no reader.**~~ **Closed by finding
  167**, and not the way this list predicted. The prediction was that the reason might survive
  being read and that the honest outcome might be a reason rather than a reader. It did not
  survive: it was an argument with two real horns, and the wire offered a third option the
  reason had not been written to include -- the backend types the result it returns.

## Pass 44 — the last reason was an argument, and a real server witnessed for the caller

### What was built, and the reason it was built from

`packages/core/src/ingest/clickhouse.ts`: a reader for the HTTP interface
(`POST /` with the statement in the body), mapping each row of a JSON envelope to an IR log
signal. It is the registry's **sixth and last** `implemented` row, and the row it replaced
carried the only reason in the set that argues rather than describes:

> the ClickHouse HTTP interface executes a SQL statement the caller writes and returns it in
> whichever format was asked for, so supporting it means either fixing a schema this project
> does not own or accepting arbitrary SQL -- the second of which would make the ingest path
> untyped

**Both horns are real**, which is why this one is unlike findings 161, 164 and 165: there is
no clause that can be read as an interface. The third option is that **this backend types the
result it returns** -- the `JSON` format answers with a `meta` block giving every column's own
type, so the caller declares which columns hold the timestamp, the message and the service and
the reader **checks that declaration against the backend**. The four readers before it had to
believe a `serviceLabel`, a `timestampFormat` or a `timestampField` on faith; this is the
first that can refuse one.

### A real server, which the last four rounds could not get

| step | outcome |
| --- | --- |
| `apt-cache policy clickhouse-server` | a real package, `18.16.1+ds-7.4build2` |
| `packages.clickhouse.com/tgz/stable/…24.3.4.147-amd64.tgz` | **HTTP 200**, whole 253,570,044 bytes in **18.7 s at 13.5 MB/s** |
| the extracted static binary | `ClickHouse local version 24.3.4.147 (official build)` |
| a two-file config | answering on `127.0.0.1:8123` within a second |

So this reader was not merely written: it was **driven against a deployment**, and its
instants were checked against the server's own arithmetic:

| the reader says | the server says | agree |
| --- | --- | --- |
| `ts = DateTime64(3)` → `2023-11-14T14:13:20.123Z` | `toUnixTimestamp64Milli(ts)` → `1699971200123` | **yes** |

That is a correction to finding 161 as much as a delivery: it concluded from two failed
downloads that this sandbox walls off release artifacts. **A wall measured on two artifacts is
a wall on those two artifacts.**

### The wire facts that changed the design

| measured | decision |
| --- | --- |
| a rejected statement is **HTTP 404** with `{"meta":[],"data":[],"rows":0,"exception":"Code: 47. …"}` | **a failure is shaped like an empty window**; `exception` is read before `data` |
| `DateTime64(3)` renders as `2023-11-14 22:13:20.123` -- no `T`, no offset, no zone | send `date_time_output_format=iso` (→ `2023-11-14T14:13:20.123Z`), and **quarantine** what cannot be placed |
| `session_timezone=UTC` moves `timezone()` **and the `X-ClickHouse-Timezone` header** and **not** the rendering | the header is **not** the authority; trusting it is **eight hours** wrong on this server |
| an explicit `FORMAT` beats `default_format` | a non-JSON body is a **named diagnosis**, not a parse error |
| 64-bit integers arrive **quoted** (`"9007199254740993"`) | the value may be a string; reading it through `Number` undoes the backend's own protection |
| `max_result_rows=1&result_overflow_mode=break` returned **all five** rows of `numbers(5)` | the reader bounds what it **emits** and reports `page.truncated` |
| `CAST(1700000000.5 AS Float32)` → `1700000000`; Float32 spacing at epoch magnitude is **128 s** | `Float32` is **refused** |
| under `iso`, `Date` renders as `2023-11-14` | `Date` is **refused**: a calendar day has no time of day |
| `rows_before_limit_at_least: 2` with `LIMIT 1` | the count is reported **with its relation** |

### Two traps the measurement caught in the work itself

1. **I reproduced the empty-window trap by accident.** A probe script of mine ran a statement
   using a function this server does not have; the reply was a well-formed envelope with
   `data: []`, and the script printed **nothing at all**. A failure rendered as a quiet answer
   -- the defect this reader refuses, happening to its author ninety seconds into writing the
   refusal.
2. **The battery found a guess inside the reader.** Four arms were unreachable,
   `unit ?? 'milliseconds'` in each numeric path, because the classifier had already refused
   every type that could leave the unit undefined. A default that cannot be taken is a claim
   about a case that cannot arise, and this one claimed `milliseconds` -- the exact guess the
   reader exists to refuse. The unit now lives **inside** the reading, so the invariant is the
   compiler's rather than a fallback's, and the module reached 100% on all four dimensions
   with no `v8 ignore`.

### The registry has no unsupported rows, and says so

`check-backend-support.mjs`: **OK (6 backends: 6 implemented, 0 unsupported)**. The two
unsupported rules are replaced by a **pairing** rule -- `implemented` carries no `reason`,
`unsupported` carries a reason of substance and no `entry` -- and a line that **pins the
unsupported set to empty**, because an empty set read off a list is indistinguishable from a
list nobody filled in.

### The interference finding 163 described, reproduced this round by accident

The suite was run **beside** the mutation battery and came back with two red `loki.test.ts`
tests -- exact-string assertions in a file this round never touched, neither reproducing in
isolation. The battery carries **12 injections whose subject is `loki.ts`**, so a suite
running beside it imports a **mutated** module, and by the time anyone looks `git status` is
clean because the battery has restored it. The trace on disk mid-run was
`packages/core/src/ingest/kubernetes.ts` showing as modified while the run was in flight.

Finding 163 recorded this for a battery rewriting a *gate script another test spawns*; this is
the same shape one step further in, for **any source file another test imports**. The remedy
is a process one: **do not run a battery and a suite at once**, and when a red test appears in
an untouched file, the first hypothesis is the battery rather than the file.

### Verified (Pass 44)

| gate | result |
| --- | --- |
| `core` test suite | **139 files, 3683 tests passed** (as of `153b72971`) |
| `cli` test suite | **3 files, 173 tests passed** (as of `153b72971`) |
| repo test suite | **142 files, 3856 tests passed** (as of `153b72971`) |
| coverage — core | **99.97 / 99.93 / 100 / 99.97** (stmts / branch / funcs / lines) |
| coverage — cli | **100 / 100 / 100 / 100** |
| coverage — `src/ingest/clickhouse.ts` and the whole `src/ingest` directory | **100 / 100 / 100 / 100** |
| `clickhouse.test.ts` | 42 tests: the request with both settings pinned, the credentials-in-headers rule, the zone guard with its control, the unit arithmetic beside the double's reading, every quarantine and envelope branch, every refused type, the truncation |
| `backend-support.test.ts` | 15 tests, driving **six** implemented backends through one routed fixture |
| backend-support battery | **83 caught / 0 survived / 0 inert / 0 misattributed** (24 new injections) |
| driven against a real server | `ClickHouse 24.3.4.147` on `127.0.0.1:8123`; the instants agree with `toUnixTimestamp64Milli` |
| guards that refused the change first | the snapshot test refused the stale `backend-support.json`; `export-surface-enumerated` refused the unregistered module; `check-backend-support` refused the matrix twice -- once for the stale row and once for the duplicate it left behind |
| `typecheck` / `lint` / `docs:check` / `docs:check:cold` | green |

### Left open

- ~~**No reader has a CLI command.**~~ **Closed by finding 170**: `rca-bench pull --backend
  <id>` reads any of the six, and the command's backend table *is* the registry's `implemented`
  set rather than a second list that agrees with it.
- **The ClickHouse statement is not validated.** The reader does not parse SQL, so it cannot
  tell a `SELECT` from a `DROP` and relies on the account being read-only. `[open: stated in
  the module rather than implied; a read-only account is the mitigation and it is the
  caller's to configure]`


## Pass 45 — the guard that read the document where it said "section", and the three drifts under it

### What the guard claimed, and what it read

`scripts/check-cli-reference.mjs` opens by claiming it catches "a command whose `--help` output
and whose reference **section** disagree about the flag set". Measured before anything was
changed, the claim was false in two ways at once:

| what was written | what the gate said |
| --- | --- |
| a flag **no command accepts** (`--not-a-real-flag`), added to a command's section | **PASSED** |
| `--lead-ms` deleted from the `ingest` section and written under `pack` | **PASSED** |

The cause is one line -- `mentionsFlag(markdown, flag)` searched the **whole document** -- so a
flag satisfied the command that advertises it as long as the name appeared *somewhere*, and
nothing checked the other direction at all. Every test ran from the help text towards the
document, so a document that invented a flag, or kept one after it was removed from the binary,
was never contradicted.

### The fix, and what it found on its first run

Flags are now compared **within each command's own section**, both directions: every flag the
help advertises must be written in that command's section, and every flag written there must be
one the command accepts. Sections are bounded the way finding 162 established -- their heading
to the next heading at the same or a higher level.

The stricter rule did **not** pass the shipped document. It reported eight disagreements:

| what | what was wrong |
| --- | --- |
| `--output` under `export` | **the command does not accept it** -- measured, `rca-bench export --output z` answers `error: Unknown option '--output'`. The reference told a reader to type a flag the binary rejects, in the sentence about where the skip warning goes. It is `--out-dir`. |
| six under `ingest` | one editorial mistake: the section carried a three-command round-trip example inside a `bash` fence, so `--suite`, `--input`, `--out-dir` and `--dir` appeared under a command that does not take them, plus `--layout` and `--anchors` named as if they were `ingest`'s own. |
| `---` under `official` | the rule, not the document: a Markdown table's separator row is `\| --- \|`. Narrowed to `--` followed by a lowercase letter. |

The tempting fix for the six was an exemption -- "flags in a fenced block do not count" -- and it
is the wrong one: the example is about **three** commands, and documenting it under one of them
is what put another command's flags in that section. It moved to a `## Worked example: the L4
round trip` section of its own. **The document got better, not merely quieter.**

### What is deliberately not compared, stated rather than left out

The text before the first per-command heading documents global behaviour (`--help`, `-h`,
`help <command>`), which no command advertises as its own flag -- measured -- and every command
accepts. The per-command sections are the contract and the preamble is prose, and the script
says so instead of leaving a silent gap.

### A defect hunted for, and not found, with the measurement

The same hunt produced a candidate: a command added to the spec table without a handler in
`run.ts` would be advertised, documented and reachable, and `run`'s switch has no `default`, so
the fall-through would return `undefined` -- a command that does nothing and exits 0. Measured:
adding a variant to the `CliCommand` union and stopping there fails `pnpm typecheck` with
`TS2366: Function lacks ending return statement`, and CI runs the typecheck. Recorded because a
hunt that finds nothing is a result.

### Verified (Pass 45)

| gate | result |
| --- | --- |
| `core` test suite | **139 files, 3686 tests passed** (as of `63f703f7a`) |
| `cli` test suite | **3 files, 173 tests passed** (as of `63f703f7a`) |
| repo test suite | **142 files, 3859 tests passed** (as of `63f703f7a`) |
| the reference gate's own tests | **9 tests** (6 before): the drift report, the two directions section-scoping added, and the new "no section of its own" state |
| the shipped reference, before / after | **8 disagreements** reported, then `CLI reference check PASSED (11 commands, 13 documented)` |
| the fixture that had to change | `referenceFor(..., { flags: false })` wrote **no sections**; once sections became the subject it exercised the "no section" branch instead of the one it names. It now writes a section per command with no flags in it |
| `derive-gate-sites` | the one moved site (`check-cli-reference.mjs`, 123 -> 199) lost its signature as a line shift always does, and was **re-signed by hand** to `proved`; the inventory is back to **50 of 50** |

### Left open

- ~~**The CLI still cannot drive any of the six T2 readers.**~~ **Closed by finding 170**, which
  built the command this paragraph asked for: `rca-bench pull --backend <id>`, whose backend
  table is derived from the registry's `implemented` set and held to it in both directions by a
  test -- the tie as a guard, which is what this entry named as the requirement.

## Pass 46 — the cheap check verified the witness and not the anchor

### What failed

Finding 168 was pushed with every local gate green -- typecheck, lint, `docs:check`,
`docs:check:cold`, `docs:counts:check`, the suite at 139 files / 3686 tests, coverage
99.97/99.93/100/99.97 -- and CI failed:

```
38727106150  CI  failure
  job injection batteries ...  failure
      !! step 17: Gate-test battery  failure
```

Locally the same battery explains itself:

```
INERT    CLIREF 1. the flag lookup loses its word boundary
INERT    CLIREF 4. a flag the reference never mentions stops being reported
```

Both injections anchored on lines the guard rewrite **deleted**. An injection whose anchor is
gone does not fail -- `rename` raises, the battery records `INERT`, keeps going, and prints a
number one lower than the reader expects.

### The gap, which is the finding rather than the incident

The cheap mode, `--verify-expectations`, verified the **witness** -- that the test each
injection names still exists -- and not the **anchor** -- that the code text the injection edits
is still in the subject. Those are the two ways an injection goes quiet:

| what is stale | the battery reports | caught locally? |
| --- | --- | --- |
| the witness (a renamed test) | `MISATTRIBUTED` | **yes** -- finding 157 made it a mode |
| the anchor (deleted code) | `INERT` | **no** -- only by running the battery, 111 s, on the runner |

The suite drives the reconciliation mode for every battery already
(`battery-witnesses.test.ts`), so closing this half makes a stale anchor a
**tenth-of-a-second local failure** instead of a runner-only one. It is also why the local run
was green: thirteen `pnpm inject:*` commands, all of which run together only in CI, and nothing
says which of them a given change needs.

### The fix

`_witnesses.anchor_problems` applies **each injection's own edit to the subject as it is**: a
table that keeps edits as data is checked for the anchor's presence and for a replacement that
differs; a table that keeps edits as a callable is **called**, and `rename`'s own
`AssertionError` is the report, so no anchor list is extracted or duplicated. It is wired into
all seven batteries from their own row shapes -- four different ones -- and `--probe` gained a
control: an anchor that cannot exist must come back **named**. That control found a defect in
its own message on the first run, because the pair branch did not include the anchor text.

The two injections were **retargeted rather than deleted**, each keeping what it proves: CLIREF 1
now makes the section-scoped comparison loose (`Set.has` -> a `startsWith` scan), and CLIREF 4
removes direction one's failure push as it now stands.

### One failure that could not be reproduced, recorded rather than dismissed

One invocation of `pnpm docs:counts:check` in this pass failed with `ELIFECYCLE Command failed
with exit code 1` while the suite was green immediately before and after; two later runs of the
same command passed, and the coverage run in the same sequence reported 139 files / 3686 tests.
Its diagnostic is **not** in the record because my own capture piped through `tail -2` and kept
pnpm's wrapper line instead of what the check printed. Written down rather than called flake:
"it passed the next time" is not evidence about a check whose output nobody kept.

### Verified (Pass 46)

| gate | result |
| --- | --- |
| the battery that failed | **24 caught, 0 survived, 0 inert, 0 unparseable, 0 unattributed, 1 redundant (expected)**, rc=0 |
| every battery's reconciliation | `gate-tests-battery` 28, `doc-counts-shapes` 12, `backend-support` 83, `roundtrip-record` 25, `fault-extraction-scoring` 12, `fault-extraction-workflow` 9, `fetch-official-retry` 5 -- all **OK with the comparator probed** |
| the full battery set, locally | run end to end in one pass rather than trusting CI to be the first place they all run |
| `core` test suite | **139 files, 3686 tests passed** (as of `a81beb522`) |
| `cli` test suite | **3 files, 173 tests passed** (as of `a81beb522`) |
| repo test suite | **142 files, 3859 tests passed** (as of `a81beb522`) |
| `typecheck` / `lint` / `docs:check` / `docs:check:cold` / `docs:counts:check` | green |

### Left open

- ~~**The CLI still cannot drive any of the six T2 readers.**~~ **Closed by finding 170.** The next
  pass built the command; `packages/cli/test/pull.test.ts` drives all six through `argv` against a
  real HTTP server, so the six rows are now an operation rather than a capability.

## Pass 47 — the command the six readers did not have, and the three ways they differ

### What was missing, in this list's own words

The registry's six `implemented` rows were reachable from a test and from the package entry
point, and from nothing a user could type. The entry said what closing it required: *"a pull
command whose backend table is held equal to the registry's implemented set, so the tie is a
guard rather than a convention"*. That is `rca-bench pull`.

### The shape, and why it is one command rather than six

`pull --backend <id>` carries the **union** of the six readers' options and lets `--backend`
decide which part is legal, the same shape `evolve` gives its four actions. `--token` at a
Prometheus backend is refused rather than ignored, because a silently dropped flag is a
configuration the caller believes took effect.

The tie is a derivation, not a copy: `PULL_BACKEND_IDS` **is**
`T2_IMPLEMENTED_BACKEND_IDS`, which is `T2_BACKENDS` filtered to `implemented`. A row that
changes status leaves the command without anybody editing the command.

| what holds the tie | how |
| --- | --- |
| the backend table | `pull-cli.test.ts` asserts `PULL_BACKEND_IDS` equals the registry's `implemented` ids, in the registry's order |
| the flag table | `PULL_BACKEND_FLAGS` is a `satisfies Record<T2BackendId, …>`, so a seventh backend fails `typecheck` on its missing row |
| the dispatch | a named `case 'kubernetes'` rather than a `default`, so a seventh backend fails there too (TS2366) instead of being parsed as Kubernetes |
| the *ability*, not the claim | `packages/cli/test/pull.test.ts` drives all six through `argv` against a real HTTP server; a backend that is implemented and unreachable from the command line fails there |

### A premise the compiler disproved before any test ran

The implementation began from "the six readers' results are the same shape". They are not, and
`pnpm typecheck` said so. The six agree on three fields -- `ok`, `signals`, `quarantine` -- and
split three ways on the fourth:

| field | readers |
| --- | --- |
| `warnings` | Prometheus, Jaeger, Loki |
| `partial` + `total` | Elasticsearch |
| `page` | ClickHouse, Kubernetes |

Three different questions, so the renderer takes only the common part and each case contributes
its own reader's facts as `notes`. The first draft required `warnings` of every result, which
would have made ClickHouse and Kubernetes **invent** an empty one to satisfy a shared type -- a
field two readers never produced, asserted into existence by the command that reads them.

### Three measurements the command needed

1. **`Date.parse('1700000000')` is `Invalid Date`.** The readers document `start` as
   `number | string | Date`, and a `number` means epoch seconds. A CLI that passed the text
   through would refuse the very encoding the reader documents, so the integer form is
   recognised at the flag layer, where the flag name is known.
2. **`--start -1` needs the `=` form**: `node:parseArgs` reads a bare `-1` after an option as
   another option and answers "argument is ambiguous". Recorded as the spelling to type rather
   than papered over.
3. **Only two of the six readers had a named re-export.** `pullPrometheusMetrics` and
   `pullJaegerTraces` were in `index.ts`; the other four were reachable *only* as a registry
   `entry`. Enough for a test, not enough for a `switch`: `backendEntry(id)` returns the union
   of six signatures, so a caller that has already narrowed `id` still has to narrow again to
   call it. The four are re-exported by name now, which is what makes the dispatch compile.

### One failure that could not be reproduced, with its diagnostic

While the three guard tests were being repaired, one run of two test files reported **four
failures** in `vocabulary-single-source.test.ts`, all inside `aiopsFilesWith` -- a pure function
of `exportAioPs2025(validBundle())` with no IO. Six later runs of the same two files (serial,
and in parallel with `check-cli-reference.mjs`) passed, and the full suite passed on the next
attempt. Written down rather than called flake: four red tests are evidence, and the only
honest statement about them is what they said and that they did not recur.

### An exemption this pass moved, rather than left standing

`acceptance.md` excused `parseInteger`'s `Number.isSafeInteger` test as "provably redundant
**within every range the CLI currently declares**", on the ground that an unsafe integer is nine
orders of magnitude outside `0..86400000`. `--limit`, `--size` and `--timeout-ms` declare
`1..Number.MAX_SAFE_INTEGER`, where that is not the reason. The redundancy survives -- `n >
2^53 - 1` is the same bound the range test applies -- but the stated reason does not, so the
entry was rewritten to the one that is true of both ranges. `pullInstant` is the one check that
is **not** redundant: it has no range beside it, and `Number.isSafeInteger` is the whole of the
bound.

### Verified (Pass 47)

| gate | result |
| --- | --- |
| `core` test suite | **140 files, 3747 tests passed** (as of `b215811db`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `b215811db`) |
| repo test suite | **144 files, 3933 tests passed** (as of `b215811db`) |
| coverage — core | **99.97 / 99.93 / 100 / 99.97** (unchanged from pass 46) |
| coverage — cli | **100 / 100 / 100 / 100** |
| coverage — `src/ingest/backends.ts` | **100 / 100 / 100 / 100** |
| the `pull` parser's own tests | **60 tests**: the table derivation both ways, per-backend flag legality, every required flag dropped one at a time, the epoch/ISO/JSON/enum conversions and their refusals |
| the `pull` runner's own tests | **13 tests**: all six backends driven through `argv` against a real HTTP server, the document's shape per backend, the three kinds of note, and the four ways it fails |
| the full battery set, locally | run end to end in one pass: **13 batteries, rc=0, 0 survived, 0 inert, 0 misattributed** |
| `typecheck` / `lint` / `docs:check` / `docs:check:cold` | green |
| the guards that refused the change first | `check-cli-reference` (the reference had no `pull` section), `vocabulary-single-source` (the documented command list was 11), `export-surface-enumerated` (two new names) |

### Left open

- ~~**The reference's per-backend table is prose beside a generated help.**~~ **Closed by finding
  171**, which built the guard this entry named as missing: `check-cli-reference.mjs` now reads
  the table by its header and holds it to `PULL_BACKEND_FLAGS`, **column by column** -- a
  comparison of the two unions would have accepted a flag moved from `Required` to `Optional`.
- **No reader is driven against a real deployment by CI.** The fixture server answers all six
  shapes faithfully, but it is this repository's reading of six APIs rather than the APIs.
  `[open: the asymmetry pass 44 recorded for ClickHouse alone, now true of five more -- a real
  deployment is what would turn a reader from "answers our fixture" into "answers the backend"]`

## Pass 48 — the table nothing read, and a status column that stood a pass behind

### What was open, and the shape of closing it

Pass 47's own Open list named it: `docs/cli-reference.md`'s per-backend table was "prose beside
a generated help". The flag *set* of every command is compared in both directions, so a flag
cannot drift out of the document -- and the table saying **which backend needs which flag** was
a hand-written copy of `PULL_BACKEND_FLAGS` that **nothing read**. It could have said `--token`
under Prometheus, or that every backend requires every flag, and the gate would have stayed
green.

| what is compared | how |
| --- | --- |
| the backend rows | located by the table's **header** -- a row naming both `Required` and `Optional` -- not by position, because the section has a fenced `text` block above it |
| **both directions** | a backend `PULL_BACKEND_FLAGS` declares and the table omits, and a backend the table invents |
| **both columns, separately** | a flag moved from `Required` to `Optional` still *names* the flag, so a union comparison accepts it; the column is what a reader acts on |
| the truth | `packages/core/dist/index.js`'s own `PULL_BACKEND_FLAGS`, imported rather than restated, with `docs:check` building first |

### The first run reported 96 disagreements, and they were one disagreement

The check had never run against the shipped document. Its first run reported **96** failures,
and reading them rather than counting them says what they were:

```
'base-url' is required for 'prometheus' but pull's table does not say so
pull's table calls '--base-url' required for 'prometheus', which does not declare it
```

`PULL_BACKEND_FLAGS` names flags without their dashes -- it is read beside `COMMAND_SPECS`'
option map, which is keyed that way -- and the document writes what a reader *types*. One
representation difference, reported once per flag **on both sides**, for six backends. The
prefix is added on the gate's side, with the reason written where the normalisation is: a number
that large is a reason to read the list, not a reason to widen a threshold.

### A status column, one repository over, that nothing reads

The same asymmetry turned up while this pass was being planned. `09-推进进度追踪.md` records
P1-5 -- *"measure the six T2 backends one by one"* -- and said:

> **当前状态：六分之一（v1.75）** … **v1.81 更新为六分之二（finding 160）** …
> **剩余六分之四**：Loki / ES / ClickHouse / K8s API

Four readers and a command were delivered in the passes after that sentence was written. The
row stood as the current state through all of them, because **it has no reader**: the status
line is prose in a document this repository's gates do not open, and the one gate that reads a
progress list states its own limit in its header -- `check-open-list.mjs` can refuse an entry
that *says* nothing and cannot refuse one that says the wrong thing.

> **A "current state" column is a claim, and a claim without a reader decays at the rate of the
> passes that follow it.** This campaign has written that sentence about published counts, gate
> summaries and release reasons. It applies to a progress table.

`04-里程碑与路线图.md` carried the same drift in another shape -- M3's exit condition "T2
backend pulling for Prometheus / Jaeger / Loki / ES / ClickHouse / K8s API" still marked `[ ]`
-- and `08-实测现状基线.md` §7 still said ⬜ **未测量**. All three are corrected in this pass,
and the correction *is* the measurement: six readers, six `implemented` rows, one command that
can drive them, and a gate holding the table to the code.

### Verified (Pass 48)

| gate | result |
| --- | --- |
| `check-cli-reference.mjs` against the committed reference | **PASSED** (12 commands, 14 documented) |
| the new check, first run | **96 disagreements**, all one representation difference (recorded above) |
| the reference gate's own tests | **14 tests** (9 before): the committed table accepted, and four negatives -- a backend omitted, a backend invented, a required flag unnamed, and a flag moved between columns |
| `gate-sites.json` | re-derived (the one site moved 199 -> 301) and **re-signed by hand** to `proved`; **50 of 50** |
| `verify-gates-are-testable` | **16 gates, 16 caught, 0 survived, 0 no-test**; every source restored byte-for-byte |
| `core` test suite | **140 files, 3752 tests passed** (as of `b45514f68`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `b45514f68`) |
| repo test suite | **144 files, 3938 tests passed** (as of `b45514f68`) |
| `typecheck` / `lint` / `docs:check` / `docs:check:cold` / `docs:counts:check` | green |
| the guard that refused the change first | `derive-gate-sites --check`, on the moved site -- the gate doing what finding 150 built it for |

### Left open

- **No reader is driven against a real deployment by CI.** Unchanged from pass 47: the fixture
  server answers all six shapes faithfully, and it is this repository's reading of six APIs
  rather than the APIs themselves. `[open: a real deployment is what would turn a reader from
  answering our fixture into answering the backend, and it needs either a service to point at or
  a way to stand one up inside the job -- neither of which this repository has today]`
- **The tracking documents' status columns are outside every gate in this repository.** The
  staleness this pass corrected was found by reading, not by a check. `[open: those columns live
  in a second repository whose files no gate here opens, so holding them to anything would need
  either a cross-repository check or the same facts mirrored where a gate can reach them, and
  neither is obviously the right shape yet]`
