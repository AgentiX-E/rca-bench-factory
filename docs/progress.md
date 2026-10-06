# Progress tracking

Status of the acceptance pyramid, with the evidence for each line. "Path
executable" and "number reproduced" are kept apart throughout: the first is
something CI can prove today, the second needs official data that is not
vendored.

## Headline

| Layer | Claim | Status | Evidence |
| --- | --- | --- | --- |
| L0 | Deterministic core correctness | **met** | `pnpm typecheck` clean **from a cold check-out** (the script builds core first; see below); `pnpm lint` clean (4 guards); 2341 core + 173 CLI tests pass |
| L1 | Transform invariants | **met** | 7-strategy matrix, idempotency and zero-silent-loss suites |
| L2 | IR contract integrity | **met** | G1/G2/G3 gates, reference integrity, time consistency; G3 carries a signal-validity half (P1-1) |
| L3 | Gate and export soundness | **met** | 26-mutation suite, 100% intercepted; export surface enumerated across **every module in `src/` (47 at this revision), 538 runtime symbols, 0 orphans**, exemptions keyed by symbol rather than by module |
| L4 | Official reproduction | **3 of 4 anchors met** | see below |
| L5 | End-to-end scenarios | **met** | CLI scenarios and HITL budget suites |

**Both CI workflows are green on the revision this document describes** (`4181060ee`):
`CI` run `36122305441` has all 18 steps `success`, and `Anchor round trip` run
`36122305396` has all 12 `success`. That is the full local gate list executed on a
clean machine.

The evidence here is weaker than the previous revision's and the difference is worth
stating. Last time the job log was fetched and the coverage percentile was compared
against these figures line by line. This time the logs endpoint redirects to
`productionresultssa17.blob.core.windows.net`, which resolves to `198.18.0.16` in the
sandbox -- a policy sinkhole -- so `curl` returns `000` and the log body is unreachable.
What was verified instead is the API's structured per-step conclusion. That proves each
step passed; it does **not** prove the numbers above match CI's byte for byte. Both are
real evidence, at different resolutions, and they are not written as the same sentence.

The blob hostname has now been different on all three occasions it has been recorded
(`...sa11`, `...sa15`, `...sa17`), which is why the procedure says to read it from each
redirect rather than pin it.

The L0 row used to read `pnpm typecheck` clean with no qualifier, and on a cold
check-out that was false. `packages/cli` resolves `@rca-bench-factory/core`
through core's published entry points (`dist/index.js`, `dist/index.d.ts`), which
exist only after a build; running the script on a fresh clone failed with fifteen
type errors in `cli/src/run.ts` that named a symptom and not the cause. CI never
saw it because `.github/workflows/ci.yml` runs `Build` before `Type-check`, so the
step that would have failed was satisfied by the step before it. The script now
carries a `pretypecheck` hook that builds core, and
`test/typecheck-entrypoint.test.ts` runs the real script in a detached worktree
with every `dist` removed and requires exit 0. That test is red on the previous
revision and green on this one, which is how the qualifier above is meant to be
read: the claim is about the cold tree, not the warm one this document was
previously measuring.

## Coverage

Measured by `vitest run --coverage` (v8) over `packages/core`, the only package
with a coverage gate.

| Dimension | Result | Gate |
| --- | --- | --- |
| Statements | 99.96% | ≥ 95% |
| Branches | 99.93% | ≥ 95% |
| Functions | 100% | ≥ 95% |
| Lines | 99.96% | ≥ 95% |

The residual is two statements and four branches, all of them documented
backstops rather than gaps, across four sites (the pass-13 additions are all at
100% and do not enter this list):

1. The `never` guard at the end of `aggregateFor` (`src/score/official.ts`).
   Every member of `ScoreTargetId` returns from a branch above it, so no input
   reaches it — it is a compile-time backstop.
2. The `never` guard at the end of `readGroundTruth` in the same file, added for
   the same reason and stated as such in the comment above it.
3. The `typeof value !== 'string'` branch in `asNonBlank`, and the
   `Number.isSafeInteger` test in `parseInteger`, both added by pass 5. The
   first is unreachable because every flag read through `asNonBlank` is declared
   `type: 'string'` and `parseArgs` refuses a string flag with no value; the
   second is provably redundant within every range the CLI currently declares.
   The measurements are in `audit.md` and the exemption is argued in
   `acceptance.md` §2.39.

The count of *sites* and the count of *branch positions* are not the same
number, and the two were conflated in an earlier revision of this table. v8
counts a branch **position** — one record per outcome of a conditional — so the
two `never` guards account for three positions between them, not two, and a
`||` whose left side is true on every input still leaves its right side
unmeasured. The table reports the aggregate the tool prints; the enumeration
above is the reviewable decomposition of it. Listing four sites against a
figure the tool derives from positions is how the earlier revision came to claim
two branches where the tool measured four.

The comments on those lines record why they are not deleted to turn the numbers
green. A guard removed because a test cannot see it is not a covered line; it is
a missing guarantee.

Every module touched by an audit pass is at **100% on all four dimensions**:
`src/ingest/otlp.ts` after pass 2; `src/llm/openai-compat.ts` and
`src/fault/importer.ts` after pass 3; `src/llm/rulegen.ts`,
`src/llm/anthropic.ts` and `src/ir/types.ts` after pass 4; `src/gates/validity.ts`
after pass 9 -- `100 | 100 | 100 | 100`, driven there from
`93.7 | 89.24 | 100 | 93.7` while the package average read `99.95 | 99.93 | 100 |
99.95` and did not move. That is finding 49's sixth clause in the number itself: a
new module can sit entirely below the floor while the average it is being judged
against stays flat, because the average is a rate and the gap is a granularity.
`src/fault/injector.ts` after pass 12, reached the same way -- the package average
was `99.95` while that module was `100 | 85.89 | 100 | 100`.
`src/fault/extraction-scoring.ts` after pass 13, driven the same way: the *first*
full run put it at `96.58 | 94.38 | 100 | 96.58` -- **branches under the gate
while the package average read `99.85`** -- and it reached `100 | 100 | 100 | 100`
by four rounds of real tests plus the removal of one unreachable guard. That is
finding 49's clause and this file's own "a new module must clear the floor on its
own" section, demonstrated for the third time.

Pass 2 raised the aggregate branch figure from 99.89% to 99.96%: the
exact-nanosecond conversion introduced a negative-timestamp path that nothing
exercised, and it was covered with a real pre-epoch case rather than an ignore
comment.

### Pass 7: three branch positions that were reachable and unmeasured

The aggregate branch figure was measured at **99.86%** before this pass, against
the 99.93% this table had been reporting. The gap was not drift in the tool or a
stale decimal: three branch positions in `parseRcaEvalPath` (`src/score/official.ts`)
were reachable by ordinary input and no test took them.

| Position | Condition | Why it was unmeasured |
| --- | --- | --- |
| `headMatch === null` | the head segment is not `RE{1,2,3}-{system}` | every fixture used a suite the vocabulary names |
| `underscore === labelled.length - 1` | the label ends with the split underscore | no fixture had an empty fault half |
| `underscore <= 0` | the label starts with the split underscore | the `\|\|` short-circuited on the left for every fixture, so the right side was never evaluated |

The third row is the one worth naming. It is not a missing test for a missing
input — `RE2-OB/cpu_/1` was constructible from the first day the function
existed. It is that **the left side of a disjunction being true on every input
hides the right side from the instrument**, so a guard can be half-measured
while the line reads as covered. Three tests were added, one per row, and the
aggregate moved to 99.93%.

The injection that matters: deleting `if (headMatch === null) return undefined;`
leaves the parser reading an unknown suite as a parsed case, and exactly the two
tests written for it go red. The other two rows are asserted through the same
`||`: removing either half now fails a named test rather than silently reducing
the measured figure.

`src/cli/args.ts` is the one module where a pass left statements and lines at
100% but branches at 99.72%, because pass 5 added two guards that no input can
take. Closing that to 100% would require either deleting the guards or writing a
test for a call that cannot happen; both trade a real guarantee for a number.
The exemption is bounded to those two branches, is recorded in
`acceptance.md` §2.39, and is guarded from the other side by a test that pins the
invariant keeping them unreachable.

Two thresholds sit where they do on purpose. The gate is ≥ 95%, the measured
figure is ≈ 99.95%, and the one uncovered branch is a deliberate compile-time
backstop. An uncovered backstop is not coverage debt — it is the shape of the
guarantee, and deleting it to move the number is the one edit that would remove
the thing it exists to prove.

### A new module must clear the floor on its own

P1-1 added `src/gates/validity.ts` (569 lines) and the module's own figures were
read before the package figure was trusted. That mattered: the first full run
reported a package average of `99.95 | 99.93 | 100 | 99.95` while the new file sat
at `93.7 | 89.24 | 100 | 93.7`, with **both** statements and branches under the
gate. A 569-line module cannot move a 20 000-line average, so a new file can land
well below the floor without the package number changing at all.

The number to quote for new code is therefore the file's, not the package's:

| Module | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| `src/gates/validity.ts` | 100% | 100% | 100% | 100% |

Raising it from 93.7 to 100 was not cosmetic. Two of the three uncovered regions
were the entry points to defects recorded in `audit.md` finding 49 — a thin
baseline that certified every fault it was shown, and a branch that was dead
rather than merely unexercised. The third was the empty-bundle path. Reading the
coverage report module-first is what put the baseline construction in front of a
reader at all.

`packages/cli` is at 100% on all four dimensions. It carries no gate of its own,
because it is a thin argument-parsing shell over core and the gate belongs where
the logic is; the figure is recorded because it is measured on every run.

## Audit passes

| Pass | Scope | Defects | Guards added |
| --- | --- | --- | --- |
| 1 | `src/score/` | 6 | 37 tests across 5 new files |
| 2 | `src/ingest/otlp.ts` | 5 | 27 tests in 1 new file |
| 3 | `src/llm/openai-compat.ts`, `src/fault/importer.ts` | 4 | 30 tests in 2 new files |
| 4 | `src/llm/rulegen.ts`, `src/llm/anthropic.ts` | 8 | 48 tests across 2 files (21 new in `rulegen`, 19 in `anthropic`) |
| 5 | `src/cli/args.ts` | 5 | 56 tests in `cli.test.ts` (5 new describe blocks + 4 invariant cases) |
| 6 | `scripts/fetch-official.mjs` | 3 (1 withdrawn) | 5 injections; the withdrawn row is the finding |
| 7 | root `typecheck` entry point, `parseRcaEvalPath` | 2 | 6 tests across 2 files (3 cold-tree, 3 parser) |
| 8 | `src/gates/` export enumeration, `test/typecheck-entrypoint.test.ts` | 2 | 18 enumerated modules; `TESTED` rewritten and both directions asserted |
| 9 | `src/gates/validity.ts` (P1-1) | 3 | 59 tests in 1 new file; 7-row falsification matrix |
| 10 | `test/export-surface-enumerated.test.ts` (P1-2 rest) | 2 | 45 enumerated modules (was 18); symbol-keyed exemptions; 8-row injection matrix |
| 11 | `src/fault/injector.ts` (P1-3) | 2 | 70 tests in 1 new file; `100/100/100/100`; 11-row injection matrix; 1 dead branch removed |

Pass 2 was chosen by measurement, not by guesswork: ranking modules by test
references per source line put `otlp.ts` at the top of the under-verified list
(403 lines, one test file) while also being the main real-world ingest path.

Pass 3 took the next two on that same ranking — `llm/openai-compat.ts` (0 test
references for 98 lines, the shared transport under both LLM adapters) and
`fault/importer.ts` (1 for 157). Pass 3's finding 15 is the first in this report
where the defect spans **two functions**: the prompt never stated the rule the
parser enforced, so reading either file alone shows nothing wrong.

Pass 4 took the remaining two modules in `llm/`, which by then was the last
directory in the package with no 100% module: `rulegen.ts` (158 lines, one test
file) and `anthropic.ts` (111 lines, one test file). Together with pass 3 this
covers the whole provider-agnostic layer, which is the part of the package that
exists specifically so no single vendor's wire format can leak into the contract.
Pass 4 is also the first pass where the count of defects exceeds the count of
modules: three of its eight findings (17, 20, 22) surfaced while building the guard
for an earlier one, which is the same pattern pass 1 saw twice.

Pass 5 took `src/cli/args.ts` (1063 lines, the largest single source file, six
test files referencing it). It was chosen because it is the boundary where a
malformed invocation becomes an internal one: every finding in the pass is a
check that established less than its consumer required, so the parser reported
success and a later stage reported failure. Unlike pass 1, none of these could
mislabel a number — they moved a failure from "refused, with a reason" to
"threw", and the caller cannot tell those apart from an exit code. Pass 5 is
also the first pass to leave a module below 100% branches, with two documented
exemptions rather than a closed gap.

All passes are recorded in full in [`audit.md`](./audit.md), with the observed
number for each finding.

### Injection matrix, pass 2

Five injections, each reintroducing one defect, plus two negative controls:

| Injection | Tests that fail |
| --- | --- |
| `asInt` accepts the quoted form only | 1 |
| nanoseconds scaled by `1e-6` | 4 |
| span status matched by number only | 4 |
| empty severity compared as a token | 1 |
| negative duration judged on truncated ms | 1 |
| NEGATIVE CONTROL — comment edit | 0 (stays green) |
| NEGATIVE CONTROL — comment edit, metric loop | 0 (stays green) |

Every injection was caught by a **test**, not by the compiler. Two were rewritten
during this pass for exactly that reason: as first written, `tsc` rejected them
for an unused symbol, which would have been recorded as "caught" while proving
nothing about the assertions.

### Injection matrix, pass 3

Six injections, each reintroducing one defect, plus two negative controls:

| Injection | Tests that fail |
| --- | --- |
| read `choices[0]` only | 3 |
| accept `''` as a completion | 1 |
| drop the choice-shape guard | 2 |
| store the category verbatim | 3 |
| skip the early category rejection | 2 |
| drop the prompt's casing rule | 1 |
| NEGATIVE CONTROL — comment edit (HITL threshold) | 0 (stays green) |
| NEGATIVE CONTROL — comment edit (openai parser) | 0 (stays green) |

12 test failures across 6 injections, **0 silent**.

The "drop the choice-shape guard" injection was again rejected by `tsc` on its
first wording, exactly as two injections were in pass 2. It was caught because
that rule was already written down — which is the argument for writing it down.
Across three passes, 4 of 26 injections were mis-rejected this way; all four were
rewritten and re-run, and on re-run every one was caught by the tests.

### Injection matrix, pass 4

Ten injections, each reintroducing one defect, plus two negative controls:

| Injection | Tests that fail |
| --- | --- |
| drop the field-membership check | 6 |
| check membership against every kind's fields | 3 |
| accept any `semanticType` string | 2 |
| let an empty sample set validate | 3 |
| drop the prompt's closed-list sentence | 1 |
| drop the prompt's semantic-type vocabulary | 1 |
| read `content[0]` only | 6 |
| drop the content-block shape guard | 2 |
| accept a blank completion | 1 |
| stop separating a non-array `content` | 1 |
| NEGATIVE CONTROL — comment edit (`SampleRecord`) | 0 (stays green) |
| NEGATIVE CONTROL — comment edit (anthropic parser) | 0 (stays green) |

26 test failures across 10 injections, **0 silent**.

This is the first pass in which **no injection was rejected by `tsc`**: all ten
compiled and reached the test run on their first wording. The reason is not that
pass 4 wrote easier injections — two of them remove a guard that the compiler would
otherwise report as an unused symbol. It is that the rule from pass 2 was applied
before the matrix ran, using the `void symbol;` form from the start. Across four
passes the mis-rejection count is 4 of 36, and all four are in the first three.

### Injection matrix, pass 5

Twelve injections, each reintroducing one defect, plus two negative controls:

| Injection | Tests that fail |
| --- | --- |
| `evolve stale --cases` checked for JSON-ness only | 1 |
| `--anchors` validated as an outer object only | 6 |
| the digest pattern loosened to `[0-9a-fA-F]+` | 1 |
| the empty anchor object re-accepted | 2 (1 core + 1 CLI) |
| the offset accepted as any finite number | 4 |
| the offset range dropped, integer check kept | 5 |
| the window flags back on `/^\d+$/` + `Number()` | 3 |
| the safe-integer check dropped, range kept | **0 — provably a no-op** |
| `asNonBlank` rejecting `''` but not `'   '` | 4 |
| the blankness test removed entirely | 6 |
| NEGATIVE CONTROL — comment edit (after `asNonBlank`) | 0 (stays green) |
| NEGATIVE CONTROL — comment edit (`SHA256_HEX`) | 0 (stays green) |

32 failing assertions across 10 injections, **2 negative controls green, 0 silent
defects**, and one deliberately green injection. No injection was rejected by
`tsc` on the final wording.

That green row is the interesting one. Removing `Number.isSafeInteger` changes
no verdict on any argv, because every unsafe integer is at least nine orders of
magnitude outside the declared ranges and the range test rejects it instead. The
matrix is what established that, and the check is kept anyway — see
`audit.md`, "A check the matrix proved is redundant, kept on purpose".

Two injections were rejected by `tsc` on their first wording
(`anchors-outer-object-only` left `SHA256_HEX` unread; `offset-finite-only` left
three constants unread). Both were rewritten using the `void symbol;` form from
pass 2 and re-run, and on re-run both were caught — 6 and 4 failures. Across
five passes the mis-rejection count is 6 of 48, and pass 5 is the first pass
where **all twelve** reached the test run on the final wording.

### Injection matrix, pass 6

Five injections — three defects, one withdrawn finding, one negative control:

| Injection | Tests that fail |
| --- | --- |
| `--retry-connrefused` re-added to the curl argv | 2 (both at 9.08s, the defect's signature) |
| the HTTP status read collapsed (`const http = null`) | 2 (the 404 case and the 500 case) |
| directories folded into the file count in the summary | 1 |
| the `BACKOFF === 0 ? 0 : …` ternary restored | **0 — provably a no-op, see below** |
| NEGATIVE CONTROL — comment edit in `fetch-official.mjs` | 0 (stays green) |

5 failing assertions across 3 injections, **1 negative control green, 0 silent
defects**, and one injection that is green because there is no defect to catch.

The withdrawn row is the pass. `BACKOFF === 0 ? 0 : 2 ** attempt * 1000 * BACKOFF`
was recorded in the audit as a defect that silently restored the full backoff when
the override was set to zero. It does not: `0` times any factor is already `0`, so
the ternary and the plain product are equivalent, and restoring it left the measured
time unchanged at 9.074s → 9.075s. The nine seconds came from `--retry-connrefused`
in the curl argv, which this pass had added itself minutes earlier.

What made the difference is the check that was skipped once and used for everything
else: **remove the suspected cause and see whether the number returns.** Removing the
flag moved 9.075s to 0.067s; restoring the ternary moved nothing. The first version of
the finding was produced by measuring the number honestly and then attributing it to
the nearest suspicious-looking code, which is a reading of the source borrowing a
probe's authority. Both that finding and the test written for it were corrected rather
than deleted, because a test whose comment claims it fails without a fix that does not
exist is worse than the missing guard it replaced.

Both failing-injection tests initially passed *with the flag injected*, and the reason
is worth carrying forward: they pointed at the fixture's socket-destroying route,
which produces curl's exit code **52**, while `--retry-connrefused` repeats only code
**7** — and a server cannot produce code 7, because the failure is that no server
exists. The fixture now binds a port, releases it, and uses the dead port. A guard
whose fixture cannot reach the defect is not a guard, and green from it is the exact
failure mode this whole document is about.

### Injection matrix, pass 7

Four injections, each reintroducing one defect, plus two negative controls:

| Injection | Tests that fail |
| --- | --- |
| the `pretypecheck` hook removed from `package.json` | 2 (cold check-out) |
| `if (headMatch === null) return undefined;` deleted | 2 (unknown suite, systemless head) |
| the `underscore <= 0` half of the disjunction deleted | 1 (`RE2-OB/_cpu/1`) |
| the `underscore === labelled.length - 1` half deleted | 1 (`RE2-OB/cpu_/1`) |
| NEGATIVE CONTROL — comment edit above `parseRcaEvalPath` | 0 (stays green) |
| NEGATIVE CONTROL — comment edit in `typecheck-entrypoint.test.ts` | 0 (stays green) |

6 test failures across 4 injections, **2 negative controls green, 0 silent**.

The first row is the one that closes the L0 claim from the other side. Without the
hook the cold tree fails, and the failure is the fifteen original messages rather
than anything the test wrote. The remaining three rows are one per branch position
from the coverage section, and they are separated here on purpose: the `||` in the
middle had been half-measured for the whole life of the function, and an injection
matrix that treated it as one row would have reported it as one row.

### Injection matrix, pass 8

The gates were audited for testability, which found that three of them could be
hollowed out with the suite staying green, and that the test written for a fourth
was a false green.

| Injection | Tests that fail |
| --- | --- |
| `check-no-mock.mjs` made unable to fail (`if (false && ...)`) | 2 (meta-gate) |
| the `jest.mock` pattern deleted from `BANNED` | 3 (meta-gate, naming it) |
| the `BANNED` array emptied | 4 (meta-gate) |
| `check-no-secrets.mjs` made unable to fail | 2 (meta-gate) |
| `check-cli-reference.mjs`'s no-table guard removed | 1 (meta-gate) |
| NEGATIVE CONTROL — a legitimate test file added | 0 (stays green) |
| NEGATIVE CONTROL — the meta-gate run against the real tree | 0 (stays green) |

12 test failures across 5 injections, **2 negative controls green, 0 silent**.

Two of these rows are only red *after* the file was fixed, and the way they were
wrong is worth keeping:

- With fixtures derived from the gate's own ban list, deleting a pattern deleted
  its test along with it and nothing failed. The meta-gate now holds an independent
  list for deletion and a derived list for drift, because one list cannot do both.
- The `check-cli-reference.mjs` row passed before the fix *and* after the guard was
  removed, because the gate fell through to a module-resolution crash that also
  exits 1. The assertion now names the gate's own diagnostic and rejects the crash,
  so a gate that reports nothing and dies cannot satisfy it.

A derived expectation and an exit code are both weak on their own: the first
disappears with the thing it measures, and the second is satisfied by any failure.

### Injection matrix, pass 9

P1-2: the coverage threshold cannot see a symbol nothing calls, so the export
surface of `ir/`, `score/`, `export/` and `gates/` is now enumerated — every export
must be named by a module outside `test/`. Writing that gate reproduced the pass-8
defect twice, in the gate itself.

| Injection | Before the fix | After the fix |
| --- | --- | --- |
| an un-named export appended to a scanned module | `153 passed`, silent | **red, naming it** |
| the same export appended after only the module-list fix | `184 passed`, silent | **red** |
| a brand-new module created under `src/util/` | — | **red**, `neither enumerated nor explained` |
| a module deleted while still listed | — | **red**, stale entry |
| a module exempted that nothing imports | — | **red**, `no module imports it` |
| NEGATIVE CONTROL — tree unchanged | — | 0 (stays green) |

The first row is the finding. The module list was hand-written, so a module outside
it was never scanned and a new export in the tree was invisible to the test whose
whole purpose is to find exactly that. Fixing the module list was not enough: the
per-symbol cases were a `const cases = …` at describe scope, so `it.each` froze them
at collection time and the same injection passed *again*. **Enumerating modules does
not help if symbols are enumerated too early.**

Both are now resolved inside the assertion body, and because this was the third
occurrence of the same shape, the property itself has a test: it appends an export to
a real file, requires the enumerated count to move, and restores the file in a
`finally`.

137 export names are enumerated. All 137 are named by a non-test module — nothing
dead was found, and the value is that the question is now asked on every run.
Neither is a substitute for asserting the reason.

### Injection matrix, pass 10

P1-1: G3 asks whether *some* metric moved; the new validity half asks whether **this**
fault happened. Six checks, each of which had to be made to fail before it could be
called a check.

| Injection | Tests that fail |
| --- | --- |
| `target-resolves` always passes | 1 |
| `target-observed` always passes | 2 |
| `mechanism-manifested` always passes | 5 |
| `onset-precision` always passes | 2 |
| `sustained-duration` always passes | 2 |
| `no-preexisting-anomaly` always passes | 2 |
| thin-baseline guard forced true | 4 |
| NEGATIVE CONTROL — source restored | 0 (stays green) |

The source was diffed against a saved copy after every row and is byte-identical, so
no row is a residual of the one before it.

The thin-baseline row is the one that paid for the pass. It exists because a coverage
sweep — not a test — reached the last unreachable branch and found that the comment
promising a guard had no guard behind it. `stddev([20,21])` is 0.707, so a competing
value of 99 sits at |Z| = 111 and **every** injected fault cleared the threshold. A
verifier that says yes to everything is worse than no verifier, because it is believed.
See `audit.md` finding 49 for the three defects and the two wrong repairs that
preceded the right one.

Cost, stated because it is real: the coverage of an existing module has to be read
per-file, and the package figure will not tell you when a new file is under the floor.

### Injection matrix, pass 13

P1-4 / P0-1: the extraction scorer and the fetch retry layer. Two batteries, because
the two modules fail in different ways — the scorer is a pure function of
(sample, prediction) and the fetch layer is a process with exit codes.

**`src/fault/extraction-scoring.ts`** — 12 rows, source restored and re-run green
after each. The full table is in `audit.md` finding 53; the two that matter most:

| Injection | Tests that fail |
| --- | --- |
| `unvalidated` graded as if valid | 4 |
| `unparseable` graded instead of skipped | 8 |
| an omitted optional field scored `false` instead of excluded | 13 |
| the strict rate computed over all samples instead of graded ones | 3 |
| the M1 threshold relaxed to accept an unmeasured rate | 3 |
| NEGATIVE CONTROL — source restored | 0 (stays green) |

**`scripts/fetch-official.mjs`** — 5 rows, the same discipline, checked in at
`scripts/injection/fetch-official-retry.py`:

| Injection | Tests that fail |
| --- | --- |
| verification moved back outside the retry loop (the pre-fix shape) | 6 |
| the pin mismatch exits 1 instead of 2 | 3 |
| an over-long file is treated as short | 1 |
| the digest comparison always agrees | 2 |
| the byte-count comparison always agrees | 4 |
| NEGATIVE CONTROL — source restored | 0 (stays green) |

**These five figures were wrong in the first version of this table** (1/1/3/2 across six
rows), because the battery was run ad hoc and the numbers were written from memory. Checking
it in and re-running produced the values above. An unpersisted measurement gets retold in a
stronger form than it had — which is why the fix is a script, not an edit. This is also why
this table and the scorer battery above are **never combined**: two files, two runs.

The scorer battery is checked in at `scripts/injection/fault-extraction-scoring.py`,
so the table can be re-derived rather than believed.

**One injection was a no-op, and that is the honest finding of this pass.** Replacing
`graded` with `verdicts` in the per-field loop left the suite green. Investigated
rather than written up as a hole: the three ungraded states all return the **all-null**
field record, so `fields[field] !== null` already implies `state === 'graded'` and the
two expressions are provably equal. The original code carried two filters where one
carried the information. The repair is a comment naming which is load-bearing and why
the other is implied — not a removal, because the next reader will look for the
`state === 'graded'` test and should be told where it went.

**One guard was deleted rather than covered.** `sameValue` accepted
`string | undefined` on both sides and returned `false` for undefined, which read as
defensive programming and was unreachable: its only caller has already established
that both sides are present. A branch nothing can reach is not a guarantee — it is a
branch a reader will trust and a threshold cannot see. The types were narrowed to
`string`, and the *decisions* it appeared to make are in `scoreField`, where each has
its own test.

## L4 anchor status
Four anchors, each strictly stronger than the one before:

| # | Anchor | Status |
| --- | --- | --- |
| 1 | Golden Master — exporters byte-stable against committed anchors | **met** (`pnpm golden-master` / 6 OpenRCA + 4 RCAEval files) |
| 2 | Mutation suite — declared facets sensitive, undeclared inert | **met** (`pnpm mutation`, 26 cases) |
| 3 | Official-metric regression — `oraclePerfect ∧ mutationsDegrade ∧ unscoredFacetsInert` | **met** (`pnpm official:check`, 8 targets scored, 1 skipped by contract) |
| 4 | Official-data round trip — ingest → export → official, label-blind | **the fetch, the derivation and the round trip all run on a real runner; the score is not yet reproduced** (`official-data.yml`; RE2 passes 270/270 and RE1 reads its `data.csv` after finding 115; see findings 45, 52 and 115) |

Anchor 4 is the one that would detect a misunderstanding shared by our exporter
and our scorer. Anchors 1–3 all begin from a bundle this repository authored, so
agreement between them proves internal consistency, not correctness against the
upstream rule.

The path is built, the wiring is gated on every push, and the number has **not**
been reproduced on real telemetry. Say so plainly rather than implying the anchor
is closed.

The reason given for that, in this paragraph until finding 114, was that "the
corpus is 19 GB and this session's sandbox has no route to Zenodo." **That was the
wrong reason, and the paragraph below already refuted it.** The fetch does not run
in this session: it runs on `ubuntu-latest`, and this file's own next section
describes eleven dispatches of it, three of which successfully transferred 4.24 GB
from Zenodo. So the sandbox's egress was never the constraint and was never
measured as one — finding 55 measured which hosts *this machine* reaches, which is
a fact about the instrument, not about the anchor. What was actually untried was
the dispatch call itself; finding 114 records that it returns `HTTP 204`, and run
`37192624818` is the dispatch that tried it.

**Where the fourth anchor actually stands.** The fetch, the pin comparison and the
descriptor derivation all succeed on a real runner; the round trip then dies on its
first case with `ENOENT` for a `metrics.json` the derive step had already excluded.
Finding 45 records the whole chain, the byte-exact log lines, and why every
in-repo fixture was unable to express the disagreement. The fix is argued and not
applied, so the accurate status is *"the failure is identified; the fix is not
verified"* — weaker than "fixed", and stronger than the previous entry, which said
the failure "has moved down the job three times". It had stopped moving: eleven
dispatches, the two most recent both failing at **the same step**.

**What changed after twelve failures (finding 52).** The fetch step's retry loop
wrapped only `download()`. `statSync`, `sha256Of` and both digest comparisons sat
*after* the loop, so a transfer that returned HTTP 200 with a truncated body went
straight to `fail()` — one bad attempt, no retry, job over. **The loop protected
"can we get bytes", never "are the bytes right".** The mechanism's name promised a
retry and its scope provided a single attempt.

Verification now runs *inside* the loop, and the two failure classes have separate
exit codes because they need opposite responses: a **short** file is a truncated
transfer and is retried; a file of the **right length with the wrong digest** is a
*different file* — upstream substitution or a bad pin — and retrying cannot turn
one file into another. `official-data.yml` now names `124`/`2`/`1` in its step
summary instead of printing `Failed with exit status N`.

This is a genuine narrowing of the unknown, and it is **not** a claim that the
anchor is closed. All twelve failures produced no measurement, and which class they
belonged to is not yet known — the new exit code is what will say, on the next run.
The status is *"the defect is fixed and the fix is verified in isolation; its effect
on the anchor is unobserved."*

The first attempt on a real runner is recorded and it failed. `official-data.yml`
run #35480663989 completed as `failure`, with the fetch step dying after 12.35
minutes and the three steps that would have produced the descriptors, the pins
and the score all skipped. That is one step further than "not attempted" and it
is still not "reproduced": no number was produced, no digest was measured, and
the reason for the failure was not readable from this session (the job log
redirects to a host outside the egress allowlist). The timing is the only
evidence it yielded, and it rules out the one explanation that would have been
cheap — a URL that does not exist fails in seconds, and this took twelve minutes.

> The parenthetical above has since been retracted: the redirect's *signed URL* is a
> plain HTTPS host that a fetch tool can read, which is how finding 45 was
> diagnosed from this session after all. The unreadable-log claim was a limitation
> of the shell being reported as a property of the API — the third time in this
> document that an instrument's limit has been mistaken for a fact about the thing
> measured.

What that run did change is the diagnostics, because a failure whose reason takes
a second run to discover is a failure that will not get diagnosed. The fetch now
prints each attempt with its number, its measured duration and a classified
reason; it no longer lets two retry mechanisms both fire and report curl's
internal backoff as the transfer's duration; and the workflow writes the outcome
to the step summary. Re-running it is the next step and it has not been done.

What is established:

- `scripts/fetch-official.mjs` downloads and digest-verifies an asset, refusing a
  destination inside the working tree.
- `scripts/gen-rcaeval-cases.mjs` derives the case descriptors from the extracted
  corpus, so no label is transcribed.
- `scripts/check-official.mjs --official-dir` ingests the corpus, exports it, and
  scores it with RCAEval's own published rule.
- The three run end to end on a synthetic corpus in the official layout, and the
  result scores 1.00 (`anchor-roundtrip.yml`).

What is not: a *successful* run against `RE1-OB`, `RE2-TT` and the rest. Until
that happens this anchor is *executable*, not *reproduced*, and the two are not
the same claim. One failed attempt does not narrow the gap between them — it
documents where the attempt stopped.

The second attempt (run #35486129312, on `307fb460`) failed one step later again,
and the sequence is now worth recording as a progress measure rather than as a
failure count, because each attempt has moved the stop line exactly one step:

| Step | Run #35480663989 | Run #35486129312 |
| --- | --- | --- |
| Fetch the corpus | **failure** (12m35s) | success — 3 assets, 4.24 GB verified |
| Compare the measured pins | skipped | success |
| Derive the case descriptors | skipped | **success** — `270 case(s): RE1=0 RE2=270 RE3=0` |
| Round-trip and score | skipped | **failure** — `heap out of memory`, exit 134 |

The descriptor step passing is finding 42's fix working on real data: 270 cases
is 90 each for `RE2-OB`, `RE2-SS` and `RE2-TT`, and
`RE2-OB/checkoutservice_cpu/multi-source-data` was skipped by name as a path that
does not carry the case layout. That number is the first real-corpus quantity this
project has produced.

The round-trip step then died before printing any verdict, because the corpus walk
held all ~32 GB of extracted telemetry as strings in a 4 GB heap (finding 45). It
now holds none of it: the walk answers membership and a count and never opens a
body, and the one file the adapter needs it reads itself. Measured on a 31 GB
corpus in the corpus's own layout, with the same `--max-old-space-size=4096` that
CI uses:

| Implementation | Exit | Peak | Result |
| --- | --- | --- | --- |
| before finding 45 | 134 | 4182 MB heap | `heap out of memory`; no `ROUNDTRIP` line |
| after finding 45 | 0 | 166 MB RSS | `ROUNDTRIP PASSED (270 case(s) round-tripped through the official layout)` |

**Still not reproduced.** A local corpus of the right *shape* and *size* is not the
corpus: the numbers above are a memory bound and a verdict on synthetic telemetry,
not RCAEval's own scores. Anchor 4 stays *executable, not reproduced* until a run
of `official-data.yml` against the real download reports its own
`ROUNDTRIP PASSED`. Run `37192624818` is the first dispatch made since finding 45's
fix and the first made since this project stopped attributing the gap to the
sandbox (finding 114); its outcome is recorded in the next section rather than
predicted here. What finding 45's fix buys is that the run reaches the round trip
instead of aborting at it.

`golden-master/fetch-and-verify.sh` is superseded by `scripts/fetch-official.mjs`
and is kept only because the Golden Master verifies it byte-for-byte; every
document that described it as downloading the data was describing an intention.

## Repository

| Metric | Value |
| --- | --- |
| Commits | 95 |
| Packages | `@rca-bench-factory/core`, `@rca-bench-factory/cli` |
| Source files | 45 (`src/`, excluding tests and build output) |
| Source lines | 13,483 |
| Test files | 78 core + 3 CLI |
| Test lines | 25,174 core + 2,740 CLI |
| Tests | 2341 core + 173 CLI |
| Tracked files | 208 |

Re-taken from `git ls-files` and `git rev-list --count HEAD` at this revision. The
previous table's own closing sentence -- that a status table is a column of
measurements and they decay together -- was written after four of six rows went
stale in one pass, and it held: three rows moved again here, for reasons worth
naming. **Commits** `85 → 88 → 90 → 92 → 93 → 94 → 95`: the anchor diagnostic, the
payload-name fix, the rule fix, then pass 8's meta-gate, pass 9's export enumeration,
pass 10's signal-validity module, pass 12's injection planner, and pass 13's two halves
-- the extraction scorer and the fetch-layer retry scope. **Test lines**
`23,440 → 24,198 → 24,501 → 23,505 → 23,510 → 25,229 → 25,174` and **Tests**
`1959 → 1978 → 2042 → 2106 → 2186 → 2256 → 2341`: pass 8 adds eleven meta-gate tests,
pass 9 adds sixty-four enumeration tests, pass 10 adds sixty-four validity tests, pass 11
adds eighty to the enumeration file, pass 12 adds seventy for the injection planner, and
pass 13 adds fifty-two for the extraction scorer, twenty-five for its script contract,
and five net for the fetch retry layer. **Source lines** `12,900 → 13,483` and **Source
files** `44 → 45` are pass 13's scorer, the largest single module the fault directory has
gained.

**Two rows in this pass move for a reason that is not the table decaying, and both are
the same reason: the injection batteries became scripts.** `Tracked files` is new here
(`208`) and reports what `check-no-vendored-data.mjs` reports, so the two cannot drift.
`Test lines` core went `25,229 → 25,174`, a fall of fifty-five, even though two new
test files were added -- because the two batteries now live in `scripts/injection/` as
`.py` files and are therefore *not* counted in a `.ts` test-line total. The measurement
did not shrink; the denominator changed shape. Reporting the figure without that
sentence would invite the reading that pass 13 removed tests, which is the opposite of
what happened.

The two rows that fell in this pass point the same way and are worth separating,
because only one of them is the table decaying. **Test lines** `24,501 → 23,505` is
a real fall: pass 11 rewrote `export-surface-enumerated.test.ts`, replacing 144 lines
of hand-written module-keyed exemption comments -- one short reason per exempted
module, 26 of them -- with three symbol-keyed entries and the assertions that hold
them. **Source lines** `13,205 → 12,500` and **Source files** `46 → 43` are not a
fall at all: the old figures were taken before the count was restricted to `src/`,
and they included three `.ts` files under `packages/core/` that are not source -- the
`vitest.config.ts` and the two entry points the package publishes by path. Both
figures are re-derived from `git ls-files 'packages/core/src/**/*.ts'`, which is what
the row says it counts.

**Test files** counts `*.test.ts`, which is what the runner counts, and the two
agree at `74`. Counting every `.ts` under `test/` gives `76`, because that directory
also holds `fixtures.ts` and `helpers.ts` -- support modules with no tests in them.
The first draft of this row used `75`, then explained the two-number gap with a
mechanism that does not exist (files excluded by config). Both the figure and the
explanation were wrong, and the explanation was the worse of the two: it was
plausible, it cited config that says nothing of the kind, and it would have been
believed. Re-derived from `ls packages/core/test/*.test.ts` against the runner's own
count.

How the previous pass's numbers moved, kept because the pattern is the point:

- **Commits** was `79` and went to `85`. That one was not a decay, it was
  arithmetic: the revision before it recorded six commits and then added six more
  without re-running the count.
- **Test lines** was `23,401` and went to `23,440`; **Tests** was `1951 core` and
  went to `1959`. Nine core tests were added by pass 7 -- three for the reachable
  branch positions it found in `parseRcaEvalPath`, three for the cold check-out in
  `typecheck-entrypoint.test.ts`, and three for the file-level split, which is why
  the test-file row showed two numbers rather than one.

The sentence this table replaces said the test count was "the one figure that
moves for a reason worth naming". It moved on the next pass too, and so did four
others, which is the argument against singling one out: a status table is a
column of measurements and they decay together. Re-take all of them or the table
is a list of the ones somebody happened to check.


## Test strategy

- **TDD**: the test that fails without the fix is written first, and the failure
  is recorded in the commit message. A fix whose test would pass before the fix
  is not a fix.
- **No mocks**: `pnpm lint` runs `check-no-mock`, which fails the build on any
  mocking construct. Every test exercises the real code path.
- **Injection matrix**: for each defect, a source injection that reintroduces it
  and must be caught, plus negative controls that must stay green. A matrix that
  is red on everything proves nothing, so both directions are recorded.
- **Gates are tested, not just run**: `gates-are-testable.test.ts` runs each gate
  against the repository (must pass) and against a synthesised violation in a
  throwaway copy of the tree (must fail). This is the floor, not a ceiling -- two
  expectations matter and they are separate. A **derived** list read from the gate
  catches drift but vanishes with the thing it measures, so the constructs the gate
  must keep banning are held **independently** and asserted as a superset. And an
  exit code is not an assertion: a gate that crashes on a missing module also exits
  1, so each failure is asserted by the gate's own diagnostic being present and a
  crash being absent.
- **Coverage is enumerated, not only thresholded**: `pnpm test:coverage` asks whether
  a line ran; `export-surface-enumerated.test.ts` asks whether anything outside the
  tests *names* an export. The second question is the one a 99.9x threshold cannot
  answer, and it is now asked of `ir/`, `score/`, `export/` and `gates/` -- 137 export
  names. Both of the enumerations in that file are read at run time, and the property
  is itself tested by appending to a real file and requiring the count to move. That
  test exists because the file was written twice with the enumeration frozen too
  early, and each frozen version passed the injection it was meant to catch.

## Open

- **The real-corpus runs are diagnosed, and the mechanism was named wrong twice
  before it was named right.** Five runs of the fourth anchor's path, each failing
  one step later than the last.

  "The failure has moved down the job three times" was true of those five runs and
  false as a description of the workflow's current state: by the time it was
  written the failure had stopped moving and was sitting still in one place. It was
  then replaced with a mechanism -- the derive step skipping a directory the
  scoring step still read -- that the log does not support. Finding 46 corrected it
  from the run artifact. The lesson is that adjacent log lines are not a causal
  chain, and the path named in the stack trace is.

  | run | revision | outcome | what it established |
  | --- | --- | --- | --- |
  | [#35480663989](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35480663989) | `98fdf601` | fetch failed after **12.35 min** | nothing — the diagnostics did not exist yet |
  | [#35482150957](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35482150957) | `07a0001f` | fetch failed after **12.26 min** | `ERR_FS_FILE_TOO_LARGE`, i.e. the *verifier* could not read 2.8 GB |
  | [#35483403527](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35483403527) | `c57fd7eb` | fetch **passed**, derive failed | 3 assets extracted, 3 pins measured; the reader did not know the corpus layout |
  | [#35486129312](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35486129312) | `307fb460` | derive **passed**, round trip failed | `270 case(s)` derived; the walk could not hold 32 GB in a 4 GB heap |
  | *(next)* | — | — | finding 46's fix; the first run that can reach a verdict |

  The second run answered it, and the answer was in neither of the two places this
  document had been looking. Both assets that come first measured clean:

  ```
  UNPINNED  rcaeval-re2-ob: bytes=1191025569 sha256=0605a36cdcad8a6ae0107f2357c9c91ecee2c4ab5d72579bffea0372d9747513
  UNPINNED  rcaeval-re2-ss: bytes=245629018  sha256=7aff9a3a0df7e2febbce4f75f0b7ba332da943aacadbffe6d5113a588ef6e295
  ```

  `RE2-TT.zip` is 2 801 345 134 bytes. `sha256Of` was `readFileSync`, and
  `readFileSync` throws above 2 GiB:

  ```
  RangeError [ERR_FS_FILE_TOO_LARGE]: File size (2801345134) is greater than 2 GiB
      at readFileSync (node:fs:455:14)
      at sha256Of (.../scripts/fetch-official.mjs:277:38)
  ```

  So the *download* worked and the *verification* of it did not, and the 12.35
  minutes of the first run was never evidence of unreachability — it was a large
  file transferring successfully and then being refused by its own verifier. The
  three candidates this document previously listed (Zenodo rate-limiting, disk
  exhaustion, `--max-time`) were all wrong, and none of them is retracted casually:
  the first run's 12.35 minutes was consistent with all three, which is why the
  fix was to make the next run report a reason rather than to guess one.

  **Fixed** in finding 39: the digest is taken off the stream in 8 MiB chunks, so
  the ceiling is structural rather than raised.

  Two things this run also settled:
  - The `Compare the measured pins` step ran with `if: always()` and printed
    exactly `no pin report was written; the fetch did not complete`. Findings 40
    and 41 came out of checking whether that meant what it appeared to mean.
  - The job log was readable this time. `GET /actions/jobs/{id}/logs` still answers
    302 to a host this session cannot reach, but the *token in the redirect URL* is
    a plain HTTPS host that `WebFetch` can read. The first run's log is therefore
    recoverable too, and the "unreadable log" claim in the previous version of this
    section was a limitation of the shell, not of the API.

  **The mechanism, from the artifact rather than the log.** The failing step's
  *descriptor* was recovered the same way (`GET /actions/artifacts/{id}/zip` also
  302s to the blob host), and it holds 270 RE2 cases under
  `checkoutservice_cpu/{1,2,3}` with real injection times and **zero** under
  `multi-source`. So the skipped directory and the crash are unrelated: the reader
  asked for `metrics.json` in a case directory that exists, because
  `metrics.json` is the name *our exporter* writes and the corpus writes
  `data.csv`. Finding 42's writer-versus-reader disagreement about a name, one
  layer down.

  The fix resolves the payload against a named set, reports a case carrying none of
  the names by listing the names tried and the names found, and continues rather
  than aborting at the first. Verified against a fixture in the official layout and
  against the artifact, and reproduced locally byte-for-byte -- so the step no
  longer costs a 90-minute dispatch to observe.

  What it is not: verified in CI. The honest status is *reproduced locally, not
  verified in CI*, and the remaining unknown is whether `data.csv` holds samples in
  a shape `assertRcaevalMetrics` accepts. The descriptor records no payload name, so
  that is not derivable from the artifact -- it is the first thing the next dispatch
  will say.

  **The re-run, with the fix, is [#35483403527](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35483403527)
  at `c57fd7eb`.** CI and Anchor round trip are both green on the same revision
  (`35483391864`, `35483391869`).

  **Outcome: the fetch passed and the failure moved one step downstream.** This is
  the first run in which the fourth anchor's download worked end to end:

  ```
  UNPINNED   rcaeval-re2-ob: ... bytes=1191025569
  UNPINNED   rcaeval-re2-ss: ... bytes=245629018
  UNPINNED   rcaeval-re2-tt: ... bytes=2801345134      <- the file that killed run 2
  EXTRACTED  rcaeval-re2-ob / -ss / -tt
  REPORT /tmp/pins.json: 3 pin(s) measured
  Fetched 3 asset(s)
  ```

  Finding 39's fix held: 2 801 345 134 bytes digested off the stream, all three
  assets extracted, and a report with three real pins written. Those pins are now
  in `golden-master/official-assets.json`, which is the first time the registry
  has held a measured digest rather than `null`.

  The job then failed at the **next** step, `derive the case descriptors`:

  ```
  error: no RCAEval case directories found under '/tmp/official'. Expected names of
  the form {RE1|RE2|RE3}-{service}-{fault}_{instance} each holding inject_time.txt.
  ```

  **Fixed** in finding 42, and it was not a small thing. The corpus's layout is
  nested — `{suite}-{system}/{service}_{fault}/{run}/` — so a case is three path
  components and the parser's flat pattern matched nothing at any level. The
  pattern had come from our own exporter, which is why reader, writer and unit
  tests all agreed while none of them described the corpus. `parseRcaEvalPath`
  now reads the real layout, `readRcaEvalGroundTruth` accepts both, and
  `gen-rcaeval-cases.mjs` locates cases by `inject_time.txt` rather than by
  directory name.

  The injection that matters: restoring the pre-fix reader left **107 of 107 tests
  green**, because every existing assertion fed the reader the flat name we write.
  Three reader tests were added; all three go red under that injection and nothing
  else does.

  Verified end to end on a corpus shaped like the download:

  ```
  108 case(s): RE1=0 RE2=108 RE3=0
  ROUNDTRIP PASS   1/2 RE2-OB/checkoutservice_cpu/1  target=rcaeval-re2  oracle=1.00 signals=3600
  ROUNDTRIP PASS   2/2 RE2-OB/checkoutservice_cpu/2  target=rcaeval-re2  oracle=1.00 signals=3600
  ROUNDTRIP PASSED (2 case(s) round-tripped through the official layout)
  ```
  A further run is required to record the real corpus's numbers; the local chain
  is what says the next run will reach the round trip rather than stopping on the
  layout.

  **Finding 43: the fix for 42 was correct and `anchor-roundtrip.yml` still failed
  on it.** The push carrying 42 went up as `307fb460`, and the fast workflow — the
  one that builds a synthetic corpus on every push — failed at the same step:

  ```
  error: no RCAEval case directories found under '/tmp/synthetic'.
  Expected names of the form {RE1|RE2|RE3}-{system}/{service}_{fault}/{run} ...
  ```

  The message now carried the *new* pattern, so the script had taken the fix. The
  corpus it was given had not. That workflow's fixture was a single flat directory
  named, verbatim:

  ```
  mkdir -p /tmp/synthetic/RE2-ts-order-service-cpu_1
  ```

  which is the layout the reader had assumed. The fixture had been confirming the
  assumption instead of testing it, so fixing the code left the certification
  intact — the same error one level up, in the instrument. The fixture is now the
  corpus's own shape (`/tmp/synthetic/RE2-TT/ts-order-service_cpu/1`) and the
  workflow also asserts the derived `caseId`, so a future drift fails naming the
  field rather than surfacing as a zero score. Verified locally on that fixture:

  ```
  ROUNDTRIP PASS   1/1 RE2-TT/ts-order-service_cpu/1  target=rcaeval-re2  oracle=1.00 signals=80
  ROUNDTRIP PASSED (1 case(s) round-tripped through the official layout)
  ```

  The dispatch is worth noting on its own: it returned **204 with a zero-byte body**
  and was deliberately not retried, and exactly one run was created
  (`total_count` 6, one entry after the dispatch). In the earlier session the same
  call was retried until it returned a non-empty body, which fired it four times —
  an empty 204 from a successful dispatch being indistinguishable, to a retry loop,
  from an empty response from a failed request. The helper now treats a
  non-idempotent POST as fire-once-and-verify-by-reading.

- **The dispatch was fired four times, and the cause is now fixed in the tooling.**
  `POST .../actions/workflows/{id}/dispatches` returns **204 No Content** on
  success, and the ad-hoc API helper this session used retried until it got a
  non-empty body. An empty 204 from a *successful* dispatch is indistinguishable
  from an empty response from a *failed* request, so the retry loop fired the
  workflow once per attempt. Three of the four runs were cancelled; the fourth was
  the first failure. Four concurrent jobs each pulling several gigabytes from Zenodo
  is itself a plausible cause of a rate-limited fetch, which makes this a bug that
  may have manufactured the failure it was then used to diagnose.

  Resolved rather than diagnosed-and-left. The dispatch is now issued exactly once
  and its effect is confirmed by reading the runs list, which is what a
  non-idempotent POST requires — the confirmation is a separate read, never a
  repeat of the write. The re-run above produced one run and returned 204 with an
  empty body, which is the correct behaviour for both the call and the caller.

- **Anchor 4 is closed for the three RCAEval anchors only, and only once a
  real-corpus run has been recorded.** The 11 fetchable assets cover
  `rcaeval-re1`, `rcaeval-re2` and `rcaeval-re3`. The other six score targets —
  both OpenRCA targets, RCA100, AIOps2025, Cloud-OpsBench and ITBench — have no
  automated fetch, so for those targets the fourth anchor still rests on the
  synthetic path in `anchor-roundtrip.yml` and nothing more. That is a smaller
  claim than "the fourth anchor is closed" and it is the accurate one.
- **The fourth anchor's fetch defect is fixed; whether that was *the* cause is not
  yet known.** The retry loop wrapped only `download()`, so a bad transfer had no
  second attempt and ended the job. That much is proved from the source and is
  recorded as finding 52. What is *not* known is whether truncations, a bad pin or
  both accounted for the twelve failures: no run has happened since the fix, and
  the whole reason the fix adds an exit code is that the log could not say. The
  honest status is *"the defect is fixed and the fix is verified in isolation; its
  effect on the anchor is unobserved."*
- **There is still no measured extraction accuracy.** The scorer, the 19-sample
  golden dataset, the two runner scripts and the workflow are all in place and
  verified locally against synthetic predictions. The workflow has now been
  **dispatched once** (run `36201115545`) and it **stopped at step 8,
  `Check the key is present`**: `secrets.RCA_BENCH_LLM_API_KEY` is not visible to
  this repository. Steps 1-7 were `success` -- including the dataset check, which
  reported 19 samples at schema `rca-bench-fault-golden/1` -- and steps 9-10 were
  skipped, so **no model call was made and M1's 70% strict threshold still has no
  reading behind it**. Finding 53 is the instrument, not the measurement.
  Two things this run did establish. First, the blocker is **credential
  visibility, not network**: `curl https://api.deepseek.com` from the sandbox
  returns `401`, which is the endpoint answering without a key, not a route that
  does not exist. Second, the instrument's failure was **legible** -- the step
  name *is* the cause, and the guard fired before any request was paid for.
  That is the difference between this run and the fourth anchor's twelve, which
  produced no diagnosis at all. The honest status is *"the instrument works and
  it named its own blocker; the number it exists to produce is still absent."*
  Two further limits on the instrument: `--verifiable` is produced by nothing
  today, so the `unverifiable` state is exercised only by hand-written
  predictions; and 19 samples means the strict rate moves in steps of 5.3
  percentage points, which is coarse at the granularity of the threshold itself.
- **The OpenRCA shard-cache route does not work, and the registry said it did.**
  `golden-master/official-assets.json` used to give, as the alternative for
  OpenRCA 1.0, "reach it through the AgentiX-E/openrca-* shard repositories...
  which already cache it on a runner". Measured on 2026-09-20:
  - all six shard repositories (`{telecom,bank,market}-{dates-early,dates-late,cloudbed-1,cloudbed-2}`)
    report `total_count: 0` from `/actions/caches`. Their last successful
    `cache-dataset.yml` run was 2026-08-02, and Actions caches expire after 30
    days by default.
  - independently of the expiry, a GitHub Actions cache is **scoped to the
    repository that wrote it**. `actions/cache` in this repository looks up keys
    in *this* repository's cache scope, so a shard's cache would not be readable
    from here even while it existed.

  The correction matters because the false version was actionable in the wrong
  direction: it named a read that would silently find nothing, and a round trip
  built on it would have reported "no data" rather than "wrong mechanism". The
  registry now states what the shards are actually good for — they are the right
  place to perform the download — and what they are not, which is a source this
  repository can read. Making them a source means having them publish an artifact
  instead of populating a cache, which is a change in those repositories and is
  not done.
- **Anchor 4** is closed by `official-data.yml`, which fetches the corpora on a
  runner. Two claims here were wrong and are retracted in the audit:
  - *"It needs official data mounted by the operator."* A GitHub runner has
    general internet access, and the RCAEval corpora are on Zenodo -- a plain
    HTTPS host with no interactive step. There was never anything to mount.
  - *"The licences prevent us from using the data."* RCAEval distributes its own
    code **and its datasets** under MIT. CC BY-NC-SA's NonCommercial clause
    binds *commercial advantage or monetary compensation*, which an internal,
    unpaid, unreleased CI run is not, and ShareAlike triggers on *distribution*,
    which we do not do. The one real constraint is repository hygiene -- do not
    commit the data -- and that is `check-no-vendored-data.mjs`.
- **Active injection is planned, not performed.** `src/fault/injector.ts` emits a
  Chaos Mesh document for each of the five kinds and reads the controller's report
  back, and both halves are pure -- a probe over the source finds no `fetch`, `exec`,
  `kubectl`, `child_process` or filesystem access at all. Applying the document needs a
  cluster, and a test that needs a cluster is a test that does not run in CI. So the
  milestone's exit condition -- five kinds, each with at least one case, through the
  full chain to the official scorer -- is **not met**; what is met is that each kind's
  document is correct, refusable, and asserted against Chaos Mesh's API shape. The
  remaining work is a cluster runner. See finding 51.
- **The Chaos Mesh mapping is asserted against a hand-written table, not against the
  CRD.** The mapping was derived from the documentation and is asserted for internal
  consistency and for the `TimeChaos` trap specifically -- no test validates it with a
  live `kubectl apply --dry-run=server`, so a field renamed upstream would not be
  caught here.
- **Five gates are covered by CI running them, not by a test that forces them to
  fail.** `gates-are-testable.test.ts` proves no gate can be hollowed out, which is
  a floor. It does not reach every branch: `check-readme-sample.mjs`,
  `build-example-bundle.mjs` and `gen-examples.mjs` have no test naming them, and the
  second `exit(1)` of `check-cli-reference.mjs` (the drift report, as opposed to the
  empty-reference guard) and of `gen-rcaeval-cases.mjs` are unexercised. Closing
  those means fixtures that build a whole synthetic reference or example tree,
  which is doable and not done. Recorded rather than implied.
- **The export enumeration covers the whole package.** `cli/`, `ingest/`,
  `transform/`, `pack/`, `util/`, `llm/`, `fault/`, `evolution/`, `report/` and
  `entity/` were exempted in `UNENUMERATED` module by module, each with a reason
  pointing at another mechanism -- the CLI reference gate, the structure-dispatch
  tests, the vocabulary single-source tests. Pass 11 probed all 26 of them for
  exports that no file outside `test/` names and found **zero**, so the exemptions
  were not hiding dead code; they were hiding the question. They were replaced by
  **45 enumerated modules and three symbol-keyed exemptions**, taking the surface
  under assertion from **140 to 516 exports**. What remains outside this file's reach
  is call sites (it asserts a name is mentioned, not called) and the completeness of
  `index.ts` as a surface, which `pack-manifest-completeness` and the package
  `exports` field cover. See finding 50.

  **Those three figures are pass 11's measurement and are kept as such** — they are
  the record of what that pass changed, not a description of the tree today. At this
  revision the list holds **47 modules** and **538 runtime exports**, and the
  exemption count is **37 entries, two of which are runtime** (`llm/provider.ts::*`
  and `index.ts::assembleBundle`); the other 35 are `ir/types.ts` type aliases that
  erase at runtime. Pass 13 found that the same three literals had drifted three
  different ways — 43 in the test file's own comment, 45 here, 46 in the L3 row —
  which is why the test file no longer states any of them and points at the list
  instead.

- **`glm-embedding-3` benchmark scheduling** is out of scope for this package;
  the LLM-dependent paths here are behind a provider-agnostic abstraction.

## Pass 14 — the provider is configuration, and a battery that mutates a checked-in file

### The correction that started this pass

An earlier pass told the operator to grant `rca-bench-factory` access to a secret
named `RCA_BENCH_LLM_API_KEY`. That name was **invented by this repository** and
then demanded from the organisation, which already stores its keys under vendor
names. Asking for a second copy of a key under a second name is precisely the
single-vendor coupling the provider abstraction exists to remove, so the request
was wrong and the repair belonged in the code.

The abstraction had been real everywhere except the one place a user configures.
Three adapters existed and shared an OpenAI-compatible transport, but
`scripts/derive-fault-golden.mjs` called `core.createDeepSeekProvider(...)` **by
name** and read a DeepSeek-specific variable. So "provider-agnostic" held in the
library and not at the point of use.

### What was built

`packages/core/src/llm/registry.ts` — 155 lines, `100 / 100 / 100 / 100`:

| Symbol | Role |
|---|---|
| `LLM_PROVIDER_IDS` | the registry's contents, frozen and ordered |
| `LLM_PROVIDER_ENV_VARS` | the four neutral variable names, in one place |
| `resolveLlmProviderConfig(env)` | configuration → provider, or a legible error |
| `createLlmProvider(id, options)` | one options shape, every vendor |
| `isLlmProviderId(value)` | a type guard the workflow's `node -e` step uses |

Three design decisions worth recording, because each is a rejection of an easier
option:

- **A set-but-unrecognised provider is an error and never falls back.** Falling back
  would run against a different model and report the result under the requested
  name -- a reading that is wrong in the one way a reading must not be.
- **Blank is treated as unset, not as a value.** An unset repository variable
  expands to the empty string in a workflow, and that is the same situation as not
  configuring one at all.
- **Aliases are explicit and finite** (`deepseek-chat`→deepseek, `claude`→anthropic).
  An open-ended prefix match would silently accept `gpt-4o` as `gpt`.

`derive-fault-golden.mjs` now resolves the *provider* before the key and records
whichever provider ran in its artefact envelope, rather than the literal
`'deepseek'` it used to write. The artefact is the evidence a later reader has; a
hard-coded vendor in it would mislabel any other provider's run.

### The workflow, and the drift gate

`fault-extraction-accuracy.yml` no longer names a warehouse secret. It resolves the
provider through the registry, then maps the provider onto whichever secret the
organisation already defined:

| Step | What it does |
|---|---|
| `Resolve the LLM provider` | registry lookup, error names the variable and the known values |
| `Select the key for the resolved provider` | `case` over the provider, `::add-mask::`, then `$GITHUB_ENV` |

Adding a provider is now one registry entry plus one `KEY_*` line; nothing else in
the file changes, and that claim is asserted rather than asserted-in-a-comment.

`test/llm/workflow-provider.test.ts` (15 tests) is the anti-drift gate. The defect
was a **missing mapping**, so a presence test would have passed on the broken file:
what must hold is set *equality* between the registry and the workflow, and the way
to know the test checks equality is to break each side. Read as regex over the YAML
text -- not parsed, because a YAML evaluator would be a worse dependency than a
regex, and `check-no-mock.mjs` permits no mocking library.

Nine injections, all caught, negative control green. **Two of the nine are about
scope rather than content**: they leave every string the test looks for in place and
still must go red, which is the same shape as finding 52.

### Finding 56 — the battery and the suite cannot run at once

The local suite went red on an assertion that could not be false. The cause was
mine: the injection battery rewrites the workflow in place, and it ran concurrently
with `pnpm test:coverage`. A polling reader observed **11 distinct file states in
one battery run, four of them zero bytes**.

The zero-byte state is the part that mattered. `Path.write_text` truncates before
it writes, so a reader landing in that window sees an empty file and fails to a
`SyntaxError` that points nowhere -- and re-reading the file "disproves" it. A
wrong-but-valid revision is merely misleading; an empty one is undiagnosable.

Every write moved to an `os.replace`-based helper. Re-measuring then showed the
empty-file window was **still** open, because one site had not been converted:
`shutil.copyfile`, which truncates too. Measured in isolation, `copyfile` gave 2
zero-byte observations in 18 reads against 0 in 13 for `os.replace`. Five runs and
~116,000 reads later: zero empty, zero truncated.

The distinction the first version of the finding got wrong, and which is now the
rule: **an injected revision being visible is the battery working**; an *empty or
truncated* one is the defect. Atomicity bounds the damage from unreadable to
readable-but-wrong; it cannot hide the injection, and must not.

`test/injection-write-discipline.test.ts` (9 tests) gates the battery's own write
discipline, verified by 2 injections. Asserted against the battery's **source**
rather than by racing it -- a race-based test passes whenever the reader misses the
window, and a test that fails one run in ten is worse than no test. The scanner
strips comments and strings first, because the file documents *why* the rejected
functions are unused and a whole-file scan matched that documentation.

### Measured at this revision

| Gate | Result |
|---|---|
| build / typecheck / lint | clean; `no corpus data` over 208 tracked files |
| coverage core | `99.96 \| 99.93 \| 100 \| 99.96`, **2388 passed (81 files)** |
| coverage cli | `100 \| 100 \| 100 \| 100`, 173 passed |
| mutation | 26 passed |
| Golden Master / official-metric / examples / docs / bundle / verify | all pass |
| provider-registry battery | 9 injections, 9 caught, control green |
| write-discipline battery | 2 injections, 2 caught, control green |

### Still open

- **The operator's DeepSeek secret name.** Whether the org's key is stored as
  `DEEPSEEK_API_KEY` cannot be read from this session: this token gets
  `403 Resource not accessible by personal access token` for org and repo
  **secrets** (`200` for repo **variables**), and the `secrets` array is absent from
  the repository payload. The workflow's mapping is the best available guess and its
  error message names the line to edit.
- **`RCA_BENCH_LLM_MODEL` is unset**, so a run would use the `deepseek-chat` alias.
  The alias floats, and an unpinned model makes a score unauditable.
- **Concurrent battery execution is mitigated, not prevented.** A lock would close
  it. The exposure is a wrong red whose cause is now documented, and it stays on the
  unmeasured list rather than being declared solved.

### The workflow reached the model

Run `36216622078` against `842daee`: **13/13 steps `success`**, including the four
that had never executed — resolve the provider, select the key, derive, score. The
artefact went from `total_count: 0` on both prior runs to 3378 bytes.

Two operators' variables were also written, which is what made the run's inputs
explicit rather than implicit:

| Variable | Value at that time | Why it is set |
|---|---|---|
| `RCA_BENCH_LLM_PROVIDER` | `deepseek` | pins the *selection* to a recorded value instead of relying on the registry default |
| `RCA_BENCH_LLM_MODEL` | `deepseek-chat` | the artefact now records a configured model rather than `null` |

**That second value was wrong, and finding 58 corrects it.** `deepseek-chat` had been
disabled on 2026-07-24, two months before this dispatch, so the run asked a model that
does not exist — while reporting 13/13 green. It is now `deepseek-flash`, the name
DeepSeek's own documentation tells callers to use. The "weaker than it looks" note that
originally stood here was an understatement: it was not merely unpinned, it was
**invalid**.

### What the green job does and does not say

It says the instrument worked. It does **not** say the threshold was met, and the
number itself is still unread — see finding 57. The scorer's exit contract bounds the
possibility: `1` and `3` would have turned step 11 red, so the score exit was `0`
(met) or `2` (measured, not met), and resolving those two requires the report.

Every route to the report failed, and the failures are structural rather than
transient:

| Route | Why it failed |
|---|---|
| job log body | 302 → `productionresultssa17.blob.core.windows.net` → `http=000` |
| artefact zip | 302 → `productionresultssa7.blob.core.windows.net` → `http=000` |
| job summary over REST | not an endpoint (`404`) |
| run page | renders the shell; the summary is loaded dynamically |

The blob host resolves into `198.18.0.0/15`, the sinkhole range finding 55 measured,
so this is the egress allowlist. Fifth consecutive round without a log body, and the
first without an artefact.

#### A route that does work, and was found by probing rather than assuming

`GET /repos/{o}/{r}/check-runs/{job_id}` returns **200**, and its `output` carries an
annotation count. The annotations themselves came back over REST: the run had exactly
two, both infrastructure notices (a Node 20 deprecation and an `ubuntu-latest`
migration), and neither was a workflow `::error`.

That is two results at once. It is a readable channel this sandbox had not used, and
it independently confirms step 11's conclusion — the `No measurement` annotation the
score step emits on exit `3` is *absent*, so `score_exit` was not `3`.

The workflow now repeats the headline there: the score step emits an `::notice`
carrying `samples`, `graded_count`, `graded_rate`, `strict` and the M1 verdict,
extracted from the report it just wrote. At this revision the extraction is a
five-pattern `sed` over the report body, and it is covered by tests that run the
workflow's own patterns against the strings `formatExtractionReport` actually emits —
because that pairing is the part that fails silently.

**M1 therefore stays unticked**, and the reason is now narrower than it was: not "the
workflow cannot run", which is fixed, and no longer "the model name is valid", which
is also fixed, but "no run has yet been dispatched with a working configuration". The
reading channel exists; the reading has not been taken.

### Pass 15 — the first real reading, and it says M1 is not met

The reading came back, and it is a result rather than another inconclusive round:

```
samples=19  graded_count=19  graded_rate=19/19 (100.0%)  strict=0/19 (0.0%)
m1=NOT MET (>= 70% strict)
```

Run `36226968552` against `dec77b3`, dispatched with the corrected model name.

| Layer | Value | Reading |
|---|---|---|
| graded | 19/19 (100%) | every sample parsed and validated — the pipeline works |
| strict | **0/19 (0%)** | **every sample missed at least one scored field** |

**M1 is not met.** The two numbers disagreeing is what makes this readable: a blended
figure could not distinguish "the pipeline is broken" from "the model is not good
enough yet", and those have entirely different next actions.

### What the reading was taken on

| Change | Why |
|---|---|
| `DEEPSEEK_DEFAULT_MODEL` → `deepseek-flash` | the previous value had been disabled since 2026-07-24 |
| `RCA_BENCH_LLM_MODEL` → `deepseek-flash` | same, and this one was set by me |
| headline echoed as a check-run annotation | `GITHUB_STEP_SUMMARY` is not REST-served and the log/artefact hosts are sinkholed |
| per-field rows echoed as a second annotation | `strict=0/19` says *that* it failed, not *where* |

The channel was found by **probing endpoints rather than assuming they fail**.
`GET /check-runs/{id}` returns `200` and serves its annotations over REST; the same
endpoint is how the run's two infrastructure notices were read, which independently
confirmed step 11's exit code was not `3`.

### What is still open

- **Which field fails.** The report prints a per-field breakdown; the second
  annotation now carries it. Not yet read.
- **Whether the 0% is a normalisation gap or a genuine model miss.** `sameValue`
  normalises both sides for `type` and `category`, and the golden samples expect only
  `{type, category, component}` — no `description`. So the miss is in one of those
  three, and the breakdown will name it.
- **The model behind the name.** Pinned by name, not by weights. A vendor update
  changes the number without changing configuration.

### Gates at this revision

`build` / `typecheck` / `lint` (213 tracked files) / `examples:{check,bundle:check,verify}` /
`official:check` / `docs:check` all green. Coverage: core **2395 passed (81 files)** at
`99.96 | 99.93 | 100 | 99.96`; cli **173 passed** at `100 | 100 | 100 | 100`.
Mutation 26, export-surface 157.

### Pass 15b — the breakdown, and the failure is three failures

The per-field annotation added in finding 59 paid for itself on the next run:

```
type=5/19  category=11/19  component=3/19  description=0/0
strict=0/19 (0.0%)   m1=NOT MET
```

`strict=0/19` said *that* nothing was fully correct. The breakdown says *why*, and it
is three separable problems rather than one:

| Field | Graded rate | Reading |
|---|---|---|
| `type` | 26.3% | fault-type label rarely matches ours |
| `category` | 57.9% | partially aligned — the vocabulary works, not reliably |
| `component` | **15.8%** | worst; component naming conventions diverge |
| `description` | n/a (0/0) | correctly excluded — no sample states an expectation |

Three conclusions the single number could not support:

1. **No single fix clears M1.** All three scored fields are below 70%, so repairing
   `category` alone still leaves `strict` at 0.
2. **The prompt is being obeyed.** `category` at 57.9% is far above chance across seven
   vocabulary values. This is vocabulary alignment, not instruction-following.
3. **`description`'s `0/0` is the mechanism working**, not a missing measurement —
   scoring a model for an omission the ground truth made is the error finding 53 named.

**It reproduces**, which is what makes the rates actionable rather than anecdotal:

| Run | sha | graded | strict |
|---|---|---|---|
| `36226968552` | `dec77b3` | 19/19 | 0/19 |
| `36227614249` | `262fc0d` | 19/19 | 0/19 |

Two runs seven minutes and one revision apart, identical on both rates. One `0/19`
could be an unlucky run; two, with a stable `19/19` graded rate, cannot.

### What the next round has to settle

The rates cannot distinguish a **normalisation gap** (the model said something
equivalent that `sameValue` did not fold) from a **genuine model error** (the model
said something else entirely). That needs the predictions, which live in the sinkholed
artefact — so the next move is to get the answers, not another rate.

It is a code-versus-prompt decision, and reading rates cannot make it.

---

## Pass 16 — the prompt, not the model: two findings that need no new run

Finding 60 left one question and it was framed as "go fetch the predictions". Reading
the *dataset and the prompt* instead answered two thirds of it without spending a
request, and both answers are provable from what is already on disk.

### `component` has a ceiling of 14/19, and the hyphen story is wrong

Asking a question nobody had asked — for each sample, does the expected `component`
actually appear in the incident text the model was shown? — gives:

| Relationship | Count |
|---|---|
| Verbatim | 5/19 |
| Spaced prose only (`billing-service` vs "the billing service") | 9/19 |
| **Appears in no form** | **5/19** |

The 9 were the tempting conclusion: "the golden data hyphenates and the model does not,
so widen the comparator." That is wrong, and one line against the shipped build shows
it — `normalizeFaultType` already folds `billing service` to `billing-service`, and
`sameValue` normalises **both** sides. Those 9 already score. A hyphen-insensitive
comparator would have been a fix for a defect that does not exist.

The 5 that appear in no form are the real bound. `session-cache` is expected where the
text says "the session Redis"; `checkout-ui` where the text says "the storefront". That
is not extraction, it is guessing a naming scheme, so `component` **cannot exceed
73.7%** on this dataset however good the model gets. At 15.8% there is still real
headroom, but "fix component to 100%" was never an available goal.

### `type` at 26.3% is a prompt asymmetry, and it is the binding constraint

The prompt specifies `category` as a closed 7-value vocabulary and says it is closed.
It specifies `type` as `"fault type (short)"` — nothing else. Meanwhile:

| Property of expected `type` | Value |
|---|---|
| Appear verbatim in the incident text | **0/19** |
| Distinct labels | **19/19** |
| Length range / mean | 8–35 / 17.3 |

So the model must produce `database-connection-pool-exhaustion` from prose that never
says those words, with no statement that the answer is a slug. **0/19 derivable labels
against 26.3% measured** is the coherent reading of a 26.3% score, and the contrast
that makes it attributable is inside the same run: `category`, the field that *is*
specified, scores **57.9%** with the same model on the same texts.

This is a **prompt defect**. No comparator change addresses it, because the model is not
producing near-misses of a known label — it is drawing from a space it was never told
the shape of.

### What changes in the plan

1. `component`'s fix has a **ceiling** and it is a data-or-prompt decision, not a
   tolerance decision. Raising it means either tightening the golden data or stating
   the naming rule.
2. `type`'s fix is to give it what `category` has. Two variants are worth measuring,
   and the second is the honest one: a closed list (fits the test set) versus a stated
   *grammar* with an open vocabulary (tests format-vs-space, and generalises).
3. The prediction is on record so it can be falsified: `type` should jump a lot and
   `category` should become the thing that decides M1, because `category` is *already*
   specified and still misses 42%.

The instrument is known-good and the two cheapest experiments are identified. Pass 17
is the prompt change plus a real reading.

---

## Pass 17 — the prompt fix, and the three outcomes it can produce

Finding 62 said `type` was undescribed and that this was fixable. This pass fixes it.

### The change

`buildFaultExtractionPrompt` now states the shape of `type`:

> `type` is a short lower-case hyphenated slug naming the failure mechanism, e.g.
> `cpu-saturation`, `network-delay`, `database-connection-pool-exhaustion`. Use
> hyphens, never spaces or capitals. Prefer the mechanism over the symptom.

The grammar, not the 19 labels. Handing the model the label list would lift the
number by fitting the prompt to the same 19 samples the list came from, and the
result would be read as capability. The convention is the part that transfers to a
fault this repository has never seen, which is what the field is for.

### TDD, with the red state recorded

| Stage | Result |
|---|---|
| Tests written first, no source change | **2 failed / 6 passed** |
| After the shape rule | 8 passed |
| Injection: rule removed from the prompt | **2 failed** |
| Injection: one expected `type` made camelCase | **2 failed** (different pair) |

The 6 that passed *before* the change are the informative ones: they assert that
every expected `type` in the real golden file is already a slug and that
`normalizeFaultType` leaves each unchanged. Those held already, which is what makes
the rule a description of the data rather than a requirement invented to satisfy a
test. The two injections failing different tests shows the suite checks two
independent properties, not one assertion written twice.

### Gates at the committed revision

| Gate | Result |
|---|---|
| core tests | **2403 passed (82 files)** |
| core coverage | `99.96 | 99.93 | 100 | 99.96`, `importer.ts` at `100×4` |
| cli tests / coverage | 173 passed, `100×4` |
| lint / mutation / export-surface | OK, 26 passed, 157 passed |
| official / examples / docs | all OK |

### What the next reading decides

The fix is a falsifiable prediction, and one run distinguishes three outcomes:

1. **`type` barely moves** — finding 62's attribution is wrong; the low score was
   capability, and the closed-list variant becomes the right experiment.
2. **`type` jumps, `strict` stays 0** — finding 62's prediction holds: `category`
   (57.9%, already specified) is the binding constraint, and M1 turns on the field
   whose prompt was never the problem.
3. **`type` moves, `component` does not** — finding 61's ceiling is confirmed as what
   is holding `component`, and the remaining work there is a data or schema decision.

No new instrumentation is needed for any of the three: the existing `::notice`
annotations already carry the headline and the per-field breakdown.

---

## Pass 18 — the reading, and the prediction that did not survive it

### Run `36229820836` against `9c72a56026`

```
samples=19  graded_count=19  graded_rate=19/19 (100.0%)  strict=1/19 (5.3%)
m1=NOT MET (>= 70% strict)

type=6/19  category=11/19  component=3/19  description=0/0
```

| Field | before | after | Δ |
|---|---|---|---|
| `strict` | 0/19 | **1/19** | **+1** |
| `type` | 5/19 | **6/19** | **+1** |
| `category` | 11/19 | 11/19 | 0 |
| `component` | 3/19 | 3/19 | 0 |

### Finding 62 is refuted by its own pre-registered condition

Finding 62 wrote down, before this run, that a failure to move `type` materially would
mean "the low score was capability rather than specification". `type` moved by one
sample. That condition is met, so the finding is refuted and this is recorded as a
refutation rather than quietly folded into a narrative of gradual progress.

Writing the falsification down first is the only reason this counts. Had the prediction
not been stated, `strict` moving from 0 to 1 would have read as a success, and a prompt
change that bought one sample would have been recorded as a fix.

### What the prompt change is and is not

- **Not a fix.** One sample on a 19-sample set is within range of run-to-run variation.
- **Not harmful.** `category` and `component` are untouched, which is what the change
  was scoped to do, and `strict` reached a non-zero value for the first time, which at
  least establishes that a strict hit is reachable.
- **Kept.** It states a property of the schema that is true, and it is cheap. It just
  is not what was limiting the score.

### The suspect that remains, and why it is now the leading one

With the format stated and the score barely changed, the remaining explanation is the
one finding 62 deferred: **the label space itself**, not its formatting. The support
for that is internal to this run's numbers — `category` is a *closed 7-value* list,
was never the subject of a prompt defect, and still misses 42%. Specification is not
what holds `category` back, so it is unlikely to be what holds `type` back.

Under that reading `type` and `category` are one problem ordered by difficulty, not two
problems ordered by prompt quality.

### Next: ~~change the model, not the prompt~~ -- retracted, see Pass 19

This section recommended a provider swap as the next experiment. It was challenged and the
challenge was correct: the recommendation rested on the claim that specification does not
explain `category`'s 42%, but **what that 42% actually is had never been measured**. Pass 19
replaces it. The provider experiment is not withdrawn -- it is deferred until the miss
diagnosis has classified the misses, so it is run against a measured baseline rather than
an inferred one.

### Where M1 stands

**5.3% against a 70% bar.** 12 more samples would have to become fully correct. The
pipeline is sound, the instrument is readable, three fields are measured and bounded,
and one prompt hypothesis has been tested and rejected. M1 is not close, and the
remaining gap is not a wiring problem.

---

## Pass 19 -- the miss diagnosis, and four bugs it found in its own gate

**Trigger.** Pass 18 closed with a recommendation challenged on the spot: *"why do you need
another LLM?"* The answer was that I did not, yet -- the plan had jumped to a provider
comparison over an unmeasured quantity.

**What changed.** `ExtractionReport` gained `misses` and `missClassification`, built in the
same pass as the rates so the two cannot disagree; `formatExtractionReport` prints the
classifier counts and one row per miss; the workflow publishes both as annotations.

### The reading the last four rounds were missing

`derive-fault-golden.mjs` had been writing every prediction's `type`, `category`,
`component` and `description` all along. The report printed the rates and dropped the
answers. Four rounds of prompt hypotheses and comparator reasoning were trying to infer,
from aggregate rates, something the artefact already stated outright.

**This inverts the next experiment.** Before: change the provider to test whether the task
is hard. After: classify the misses, and only then ask. The annotation now carries both
`wrong value N, omitted M` and the per-sample `sample field reason expected -> actual` rows.

### Four bugs found in the new gate, none of them in the new feature

1. **An unreachable guard, documented as protection.** Three guards prevented a
   scored-`null` field from being reported as a miss; the comment claimed all three were
   reachable. Only two were. `scoreField` returns `null`, never `false`, when the ground
   truth states no expectation, so `=== false` already implies an expectation exists. The
   third guard was deleted, not annotated.
2. **An old equivalent mutant whose equivalence was no longer checked.** `graded` vs
   `verdicts` in the diagnosis loop cannot be killed -- the loops are equal -- but the
   invariant that makes them equal was asserted nowhere. It is now a test, and a mutation
   that gives `unvalidated` a scored field fails with a named message.
3. **A fixture that never reached its own state.** The `unvalidated` case omitted
   `extracted`, which lands in `unparseable`. A mutation aimed at `unvalidated` survived
   *because the state was never entered*. The test now asserts each fixture reaches its
   named state.
4. **An annotation cut mid-token.** `cut -c1-900` against a measured 4044-character payload
   ended `...type:network-loss>wrong network-`, half an expected value, while the adjacent
   comment claimed to avoid exactly that. Replaced by a whole-row cap of 60 (measured
   maximum is 57 rows), with the omitted count stated.

**And one that had been green for the wrong reason.** The workflow test's helper stripped a
hard-coded `s/` prefix; the detail expression uses `|`. The strip matched nothing, the `|p`
suffix stayed on the pattern, and the regex matched every line -- including the two positive
assertions, which were passing on a stray prefix rather than on a real row. A guessed
delimiter does not just miss defects, it can manufacture passes.

### Gates

| Gate | Result |
|---|---|
| typecheck (core, cli) | clean |
| core coverage | **2421 passed (83 files)** -- `99.96 \| 99.93 \| 100 \| 99.96` |
| `src/fault` | **100 \| 100 \| 100 \| 100** (was `99.38 \| 98.89`) |
| cli coverage | 173 passed -- `100 \| 100 \| 100 \| 100` |
| lint | OK (no-mock / no-secrets / no-vendored-data / official-registry) |
| mutation | 26 passed |
| export surface | 212 passed |
| official / examples / docs | PASSED / up to date / PASSED |

Injection battery, 11 injections: **9 caught, 1 proven equivalent, 1 proven unreachable and
removed**. The two survivors are recorded with the proofs, not folded into a passing count.

### What is still not known

The diagnosis has not been *read* yet -- the code that produces it is green and its own
gate is proven, but no run has published the classification. That run is the next step and
it is the first one in five rounds whose result cannot be predicted from the rates alone.

---

## Pass 20 -- the diagnosis, read at last

The run in Pass 19 dispatched and published. Run **36240660455** on `9932e766c`, all 13
steps green. The annotation, verbatim:

```
samples=19  graded_count=19  graded_rate=19/19 (100.0%)  strict=0/19 (0.0%)  m1=NOT MET (>= 70% strict)
type=4/19 category=11/19 component=4/19 description=0/0
classification=wrong value 38, omitted 0, samples with >= 1 miss 19
```

Four readings now exist on the same 19 samples. The rates have moved every time
(`type` 5 -> 6 -> 4, `strict` 0 -> 1 -> 0); the two facts below have not, because they are
about *how* the model fails rather than how often, and that is what four rounds of
prompt-and-comparator reasoning could not reach.

### `omitted 0`

All 38 misses are wrong answers. Not one is a missing field. This **eliminates the
"required fields" hypothesis outright** -- the standing explanation that the model omits
`description` and the rate suffers for it. The model always answers. It answers wrongly.

### Eight of eight wrong `category` values are legal vocabulary

Checked each against `FAULT_CATEGORIES = {resource, network, runtime, middleware, code,
config, dependency}`:

```
category misses: 8
  actual IS a legal vocabulary value: 8
  actual is OUTSIDE the vocabulary  : 0
```

Not one is outside the closed list. The model **reads the list and picks a different
member** -- and since an out-of-vocabulary category makes the whole response unparseable,
while `graded` is 19/19, it could not have been otherwise. That is a logical elimination,
not a measurement.

This is decisive against the framing finding 62 had settled on. `category`'s rate was read
as evidence that the failure is *specification* -- the model has the right idea and cannot
express it. It is not. The vocabulary is closed, printed in the prompt, and fully obeyed as
a format. The failure is **choosing**, and choosing is not reached by specifying harder.

### `component` is answered by quotation

The `component` misses are not near-misses. They are phrases lifted from the incident text:

```
session-cache    -> session Redis
billing-service  -> billing service database client pool
analytics-replica -> replica applier thread
payment-gateway  -> client node egress interface
```

The model finds the region of text that discusses the component and returns a description
of it. This is the one failure here that *is* a formatting defect in the strict sense, and
the one that is fixable: the expected values are identifiers, and an instruction to answer
with the identifier is **absent rather than contradicted**.

### The separated separator, and a misread that was mine

My first parse of the detail annotation reported two rows where expected equalled actual --
`order-service -> order-service`, `tax-calculation -> tax-calculation`. That would have
meant the scorer marking correct answers wrong. It had not.

The rows were space-joined and the values contain spaces (`order-service ConfigMap`,
`tax-calculation provider`), so tokenising on whitespace split *records*. Wrote up as
finding 70, fixed by joining with `\x1f`, and measured the fix rather than asserting it:
**57 rows become 285 whitespace tokens** -- a 5x over-split, which is finding 70's two
phantom rows quantified. Finding 71 records it, with three injections (space join, printable
separator, over-large cap -- 3 / 3 / 1 tests caught).

This is finding 59's complaint one level down: a reading that exists, is correct, and can
still be misread is, for a measurement channel, the same defect as a reading that is
missing. It cost a misdiagnosis to learn, and the repair is a byte.

### Gates

| gate | result |
| --- | --- |
| typecheck (core, cli) | clean |
| core coverage | **2422 passed (83 files)** -- `99.96 \| 99.93 \| 100 \| 99.96` |
| `src/fault` | **100 \| 100 \| 100 \| 100** |
| `src/llm` | **100 \| 100 \| 100 \| 100** |
| cli coverage | 173 passed -- `100 \| 100 \| 100 \| 100` |
| lint | OK (no-mock / no-secrets / no-vendored-data / official-registry) |
| mutation | 26 passed |
| export surface | 157 passed |
| official / examples / docs | PASSED / up to date / PASSED |

Injection battery total, 14 injections: **12 caught, 1 proven equivalent, 1 proven
unreachable and removed**.

### What this changes

The deferred provider experiment is now a **testable claim rather than a hunch**: eight
`category` answers are legal-but-different, so a second provider either produces the same
eight choices (capability ceiling, and prompts are exhausted) or different ones (sampling
variation, and the rate is noise). That is a falsifiable experiment with a measured
baseline, which is what it was missing when it was ordered.

M1's honest position is unchanged and now explained: `strict` needs 13 of 19, `type` is
4/19 and `component` 4/19 against a 14/19 structural ceiling, so no prompt change reaches
70%. The two paths are distinguishable rather than a matter of opinion -- tighten the
ground truth to admit the model's defensible readings (a data change, possibly a *correct*
one), or try a stronger model.

---

## Pass 21 -- the separator confirmed in production

Pass 20's fix had been proven on a synthetic payload. Run **36242319547** (`567118aea`,
`success`) proves it on the real one, and the real one is where it matters.

```
records: 39            (cap of 60 not reached)
tokens if split on whitespace: 70
records containing a space: 15 of 39
```

The old space join would have published **70 whitespace tokens for 39 records** -- a measured
1.79x over-split, against the 5x the synthetic worst case predicted. Fifteen rows would have
been silently fragmented.

More than that: two of the fifteen are

```
config-datasource-url-orders.component:order-service>order-service ConfigMap
dependency-upstream-5xx-pricing.component:tax-calculation>tax-calculation provider
```

which are exactly the rows that produced finding 70's apparent self-scoring contradiction. The
channel that made a correct scorer look broken is now a channel that can be read.

### The reading

```
strict=0/19  type=5/19  category=11/19  component=2/19
classification=wrong value 39, omitted 0, samples with >= 1 miss 19
```

`component` 4 -> 2, and the detail explains it: **all fifteen component rows are descriptions,
not identifiers** -- `session Redis`, `replica applier thread`, `native ffmpeg binding`, `rack
switch carrying the third node`, `scheduled job flag definition`. Finding 69 inferred this from
four examples; the full detail shows it is the mechanism, not a tendency.

`omitted 0` holds on a second run. The model does not decline; it answers, and for `component`
it answers with prose. **That is the one field of the three whose failure has a named fix** --
an instruction to return the identifier, which is absent rather than contradicted.

### Gates

| gate | result |
| --- | --- |
| CI on `567118aea` | both checks `success` |
| workflow run | `36242319547` `success`, 13/13 steps |
| core coverage | **2422 passed (83 files)** -- `99.96 \| 99.93 \| 100 \| 99.96` |
| `src/fault` / `src/llm` | **100 \| 100 \| 100 \| 100** each |

### What is next

`component` is now the clearest lever in the whole benchmark: a formatting defect, a named fix,
and a full census of the failure mode rather than a sample of it. The honest open question is
whether an instruction to return identifiers moves it -- and that is a one-line prompt change
against a measured baseline, which is the cheapest experiment this project has had.

---

## Pass 22 -- proving the instrument before believing its readings

Two passes produced a reading and then immediately produced a reason not to act on it.
This one is the opposite order: it establishes that the instrument is worth reading.

### The refutation that saved a run

Finding 72 ended with `component` as "the clearest lever in the benchmark": a formatting
defect, a named fix, a full census. Finding 73 refutes that before any prompt is edited.

Applying the real normaliser to all fifteen wrong `component` answers, **0 of 15** become the
expected value. If the failure were formatting that column would be mostly `YES`. It is not,
because the answers are **different entities**:

| expected (component identity) | answered (mechanism or location) |
| --- | --- |
| `media-transcoder` | `native ffmpeg binding` |
| `export-worker` | `CSV writer` |
| `api-gateway` | `WAF rule` |
| `session-cache` | `session Redis` |
| `payment-gateway` | `client node egress interface` |

A shape rule would have produced **well-formatted wrong answers** -- the exact trap finding 62
named for `type`, applied more sharply, because here the model is not even in the
neighbourhood. And the reason is structural: only **5 of 19** expected components appear
verbatim in their incident text, so the identifier must be *synthesised*, and the model instead
names the right service **plus its cache**, or the mechanism rather than the component.

The lever is not the prompt. The two honest options are a **data** decision (is `session Redis`
a wrong answer for a Redis-cache sample?) and a **design** decision (is `component` recoverable
from these texts at all). Neither is a prompt edit, and the run that would have discovered this
was not spent.

### Then the instrument

`strict` has read 0 -> 1 -> 0 and `type` 5 -> 6 -> 4 across four runs on identical inputs.
"The model is noisy" is a conclusion *about the model*, and it requires the instrument be
stable -- which had never been checked over the real dataset, only over hand-written fixtures.

Four properties, now asserted on the real 19 samples and **in the CI gate**:

| property | the invisible failure it prevents |
| --- | --- |
| determinism | a rate becomes a sample and is indistinguishable from a measurement |
| input purity | a second run differs for a reason unrelated to the model |
| order independence | positional pairing scores against the wrong ground truth; a re-sorted file reads as a model change |
| denominator completeness | the diagnosis and the headline can disagree while both look self-consistent |

**All four hold.** So the movement is model sampling, not measurement drift -- a negative result
and the useful one: a single run is not a capability estimate, and `component` 4 -> 2 is
sampling rather than regression.

### The battery that caught itself

Injection A initially reported `SURVIVED`. It had not survived: the injection's anchor did not
match the real `return {` shape, so **the mutation never applied**. An inert injection and a
toothless test produce the same output. That is finding 68's manufactured green in a new place
-- a signal that reads as a substantive conclusion while being an artefact of the instrument.

The battery now distinguishes three outcomes and fails on both non-`CAUGHT` ones:

```
CAUGHT  A. non-deterministic: embed a per-call counter in the report  (failed 2, passed 14)
CAUGHT  B. mutates its input: sorts the samples in place              (failed 2, passed 14)
CAUGHT  C. pairs by position instead of by id                         (failed 1, passed 15)
CAUGHT  D. drops the denominator: omits a sample that missed          (failed 1, passed 0)
battery: 4 caught, 0 survived, 0 inert
```

### Gates

| gate | result |
| --- | --- |
| typecheck (core, cli) | clean |
| core coverage | **2426 passed (83 files)** -- `99.96 \| 99.93 \| 100 \| 99.96` |
| `src/fault` / `src/llm` | **100 \| 100 \| 100 \| 100** each |
| cli coverage | 173 passed -- `100 \| 100 \| 100 \| 100` |
| lint / mutation / export surface | OK / 26 / 157 |
| official / examples / docs / pack | PASSED / up to date / PASSED / 9 files verified |
| scorer-stability battery | **4 caught, 0 survived, 0 inert** (new CI gate) |

### What is next

`component` is not a prompt problem, so the next real decision is about the ground truth. The
cheapest informative step is to grade the fifteen answers **against a stated rule for what a
component answer must be** -- and the honest question is whether the rule that makes
`session Redis` correct is one the project wants, or whether it makes the field meaningless.
That is a decision to take before another run, not after.


## Pass 23 -- Make the `component` rule executable, then let the battery delete it

Passes 21 and 22 read the miss diagnosis and then proved the instrument stable. Both left the
same hole: the diagnosis named `component` as the clearest lever and finding 73 refuted the
prompt-shaped fix, but nothing had *stated the rule*, so the field remained ungradeable in
principle. Pass 23 states it as a test and measures it.

### What was done

1. **Read all 19 incidents in full** rather than the miss list, because the question is what the
   ground truth means and that is only visible from the texts. This was the step that found the
   result: on 14 of 19 samples the model's answer is not a worse name for the component, it is a
   name for something else in the same incident.
2. **Measured three candidate rules** over all 19 expected components. Verbatim: 5/19. Verbatim
   with hyphens read as spaces: 13/19. Every hyphen token present: **18/19**. The one rejection is
   `config-feature-flag-checkout`, whose expected `checkout-ui` is not derivable from its text.
3. **Wrote the rule as a test group** in `fault-prompt-grammar.test.ts`, beside the `type` block
   it mirrors: the tripwire (exactly one rejection, named), the unrecoverable sample's properties,
   the discrimination contrast over the recorded run, the readable-set membership, and the
   well-formed samples' evidence for the rule finding 75 proposes.
4. **Wrote a battery** (`scripts/inject-component-rule.mjs`, 8 injections: two mutate the golden
   dataset, six mutate the suite) and drove the assertions through **three rewrites** until
   nothing survived.
5. **Corrected two overstatements in finding 75** that the executable version falsified -- the
   rule is not indiscriminate (4/4 right vs 11/15 wrong), and the accepted answers are not "one
   level off" but on a different axis. Both corrections are recorded as finding 76 rather than
   quietly edited into finding 75.
6. **Wired the battery into CI** after the stability battery, with a comment recording why the
   assertions were rewritten three times.

### The measurements

| measurement | value |
| --- | --- |
| expected components that are lower-case hyphenated slugs | 19/19 |
| expected components that appear verbatim in their incident | **5/19** |
| expected components recoverable by the loosest rule | **18/19** |
| the one rejection | `config-feature-flag-checkout` / `checkout-ui` |
| correct answers on record | **4** |
| wrong answers on record | **15** |
| right answers accepted by the token rule | 4/4 (**1.00**) |
| wrong answers accepted by the token rule | 11/15 (**0.73**) |
| accepted wrong answers that are *not* verbatim-readable | **8** |
| samples where the component is readable but the answer was wrong | **1** (`dependency-upstream-5xx-pricing`) |

### The battery, final state

```
CAUGHT  A. golden dataset: make a second component unrecoverable from its text   (failed 1, passed 18)
CAUGHT  B. golden dataset: fix the mislabelled sample so the rule reaches 19/19  (failed 2, passed 17)
CAUGHT  C. suite: break the contrast by accepting only right answers             (failed 1, passed 18)
CAUGHT  D. suite: make the rule accept every sample, so nothing is rejected      (failed 6, passed 13)
CAUGHT  E. suite: assert the rejected list is empty instead of the named sample  (failed 1, passed 18)
CAUGHT  F. suite: assert the right-answer rate is the ceiling it is not          (failed 1, passed 18)
CAUGHT  G. suite: assert the accepted-versus-readable gap is closed (it is not)  (failed 1, passed 18)
CAUGHT  H. suite: drop the empty-token guard, so a hyphens-only name passes      (failed 1, passed 18)
battery: 8 caught, 0 survived, 0 inert
source restored: identical to backup
```

Three rounds of `SURVIVED` preceded this, and each one identified a real defect in the assertions
rather than in the code under test:

| round | survivor | what it revealed |
| --- | --- | --- |
| 1 | `A. non-deterministic counter` | the injection's anchor was stale, not the test weak -- and an inert injection reads identically to a toothless test, so `INERT` became a separately counted outcome |
| 2 | `C, D` | the assertions compared a literal to itself and bounded a count it could not exceed |
| 3 | `G` | a distribution fact has no structural consequence, so "can it be deleted" is the wrong question; the right one is "does asserting the opposite direction fail" |

### Gates

| gate | result |
| --- | --- |
| typecheck | clean |
| core coverage | **2437 passed** (83 files) at `99.96 / 99.93 / 100 / 99.96` |
| `src/fault`, `src/llm` | `100 / 100 / 100 / 100` |
| cli coverage | 173 passed at `100 / 100 / 100 / 100` |
| lint | `check-no-mock` OK, `check-no-secrets` OK, `check-no-vendored-data` OK (217 files), `check-official-registry` OK (11 assets) |
| official regression | PASSED (8 targets scored, 1 skipped by contract) |
| docs | README sample OK, CLI reference PASSED (11 commands, 13 documented) |
| examples | up to date; 9 packed files verified against the manifest |
| stability battery | 4 caught, 0 survived, 0 inert |
| **component rule battery** | **8 caught, 0 survived, 0 inert** |
| both workflow YAMLs | parse |

Coverage moved 2426 -> 2437 tests with every dimension unchanged, which is the expected shape:
the new assertions constrain data rather than exercise branches, and `src/fault` was already at
100%.

### The open decision, now with the evidence attached

`component` needs a **stated rule** for what an answer denotes, and the benchmark's own data
supplies it: the three samples answered correctly and readable verbatim are deployed workload
names (`checkout-api`, `user-profile`, `media-transcoder`), and the fourth correct answer
(`order-service`) is the same shape. What the rule cannot be is anything validated by the
acceptance rate, because 73% of wrong answers pass it. And what must not happen is editing
`checkout-ui` away: it is the one sample where the ground truth is unrecoverable from its input,
which makes it the benchmark's own evidence that the definition was never written down.


## Pass 24 -- Read the CI failure to its real cause, then gate the class of defect

Pass 23 ended with a green local gate chain and a pushed commit. The push came back red. This
pass is about the four minutes spent reading that failure instead of assuming it was flaky.

### What was done

1. **Located the failure to a single step.** The log channel is unreachable (`302` to a sinkholed
   host, as in every prior pass), so the job step list was read through
   `GET /actions/jobs/{id}` -- which *is* reachable, and which reported step 11, the scorer
   stability battery, as the one failure with eight later steps skipped.
2. **Found the cause rather than a symptom.** Three hard-coded absolute paths in
   `scripts/inject-stability.mjs`, one of them this machine's checkout. On the runner,
   `copyFileSync` threw before the first injection.
3. **Fixed the cause and the class.** Paths resolve from `import.meta.url`; backups moved from a
   shared `/tmp` into the repository's own cache directory; a new static check
   (`scripts/check-no-absolute-paths.mjs`) wired into the `lint` chain.
4. **Verified the fix where it counts.** A directory that is not the author's checkout, running
   both batteries to exit 0 -- because passing locally is exactly what this defect did.
5. **Verified the new check has teeth** by reintroducing the defect, confirming failure, then
   restoring and confirming pass.

### The failure, in the job's own step list

```
4   Set up pnpm                                                           success
5   Install dependencies                                                  success
6   Build (core then cli; cli resolves core's dist)                       success
7   Type-check                                                            success
8   Lint (no mock / no secrets / no vendored corpus data)                 success
9   Test with coverage (core + cli, ≥95% per dimension, 100% functions)   success
10  Mutation suite (gate + export, 100% interception)                     success
11  Scorer stability battery (no survivors, no inert mutations)           failure  <== FAILED
12  Golden Master verification                                             skipped
```

### The gate audit

| file | occurrences | disposition |
| --- | --- | --- |
| `scripts/inject-stability.mjs` | 2 (checkout path, `/tmp` backup) | **the CI failure** -- fixed |
| `scripts/inject-component-rule.mjs` | 2 (`/tmp` report, read back) | written this pass, fixed before it could repeat the failure |
| `scripts/injection/fault-extraction-scoring.py` | 2 | fixed: documented as historical evidence in `docs/audit.md` |
| `scripts/injection/fetch-official-retry.py` | 2 | fixed: same |
| `scripts/injection/fault-extraction-workflow.py` | 1 | fixed: already resolved `REPO` correctly, only the backup path moved |
| `scripts/fetch-official.mjs` | 1 (`/tmp/official` default) | kept, and the rule narrowed: a portable fallback is not the defect |

Eight occurrences, five files, one of which was already correct in the part that mattered.

### Gates

| gate | result |
| --- | --- |
| typecheck | clean |
| core coverage | **2437 passed** (83 files) at `99.96 / 99.93 / 100 / 99.96` |
| `src/fault`, `src/llm` | `100 / 100 / 100 / 100` |
| lint | `check-no-mock` OK, `check-no-secrets` OK, `check-no-vendored-data` OK (218 files), `check-official-registry` OK (11 assets), **`check-no-absolute-paths` OK** |
| stability battery (author checkout) | 4 caught, 0 survived, 0 inert |
| stability battery (CI-shaped directory) | **exit 0** -- was the CI failure |
| component rule battery (CI-shaped directory) | 8 caught, 0 survived, 0 inert, **exit 0** |
| official regression | PASSED (8 targets scored, 1 skipped by contract) |
| Golden Master | PASSED (6 OpenRCA + 4 RCAEval files byte-stable) |
| docs | README sample OK, CLI reference PASSED (11 commands, 13 documented) |
| examples | up to date |
| both workflow YAMLs | parse |

### The lesson worth keeping

Every prior pass in this round has been about *reading* something correctly: the separator, the
miss diagnosis, the census, the rule. This pass is the first where the thing misread was my own
instrument, and it was misread in the direction that is easiest to miss -- **it appeared to
work**. A battery that exits 1 in CI and 0 locally is not a battery with a flaky suite; it is a
battery that never ran, and the only reason it was found is that the CI result was read instead of
being recorded as an environment problem.

The durable part is the gate. "Resolve paths from the script's own location" is a rule that can be
checked mechanically, and it now is, on every push, including the nine files that were already
fine -- so the check is not tuned to the one failure it was written for.


## Pass 25 -- Measure the milestone's ceiling instead of arguing about the `component` rule

Pass 24 ended by fixing a CI failure and gating its class of defect. This pass goes back to the
question passes 21 through 23 kept restating without answering: `component` has no stated rule, so the
field is ungradeable in principle -- and if that is true, what is M1's ceiling?

It turns out the question was never a design debate. It is a measurement, and the measurement
contradicts what the audit had been asserting.

### What was done

1. **Built `scripts/probe-m1-ceiling.mjs`**, which partitions the golden dataset into recoverable and
   unrecoverable components under finding 75's loosest defensible rule and reports the strict ceiling
   under two definitions -- with `component` required, and with it dropped. Two definitions rather
   than one, because the difference between them is the cost of the decision the round was stuck on.
2. **Wrote a battery for the probe** (`scripts/injection/m1-ceiling-probe.py`, 10 injections: 4 move
   the dataset, 6 move the probe's own definitions) and drove it to **10 caught, 0 survived, 0 inert**.
3. **Wrote 8 assertions about the probe** (`packages/core/test/m1-ceiling-probe.test.ts`), then a
   second battery (`scripts/inject-m1-ceiling-tests.mjs`, 8 paired mutations) that drove them to
   **8 caught, 0 survived, 0 inert** -- after a first run in which **seven of the eight survived**.
4. **Found and fixed two classification defects in a gate already running in CI**: both injection
   batteries tested `failed > 0` to decide whether a mutation was caught, which classifies a suite
   that never ran as a suite nothing could break.
5. **Found a contradiction in the audit** and recorded it as finding 78 rather than editing it away:
   finding 69's "14/19 structural ceiling" is not reproducible, and the conclusion drawn from it --
   "no prompt change reaches 70%" -- does not follow from a ceiling in any case.
6. **Wired both batteries into CI** after the component-rule battery, and registered
   `probe:m1-ceiling`, `inject:m1-ceiling` and `inject:m1-ceiling-tests` as scripts.

### The measurement

```
component, under the loosest defensible rule (all hyphen tokens present):
  recoverable   18/19
  unrecoverable 1/19  [config-feature-flag-checkout]

M1 strict threshold: 0.7
strict, every stated field required:           ceiling 18/19 = 94.7%  CLEARS M1
strict, component excluded from the definition: ceiling 19/19 = 100.0% CLEARS M1
```

| measurement | value |
| --- | --- |
| M1 strict ceiling, `component` required | **18/19 = 94.7%** |
| M1 strict ceiling, `component` dropped | 19/19 = 100% |
| headroom the `component` decision costs | **1 sample** |
| samples needed to clear the 0.7 threshold | 14 of 19 |
| headroom above the requirement | **4 samples** |
| the audit's previous claim | a 14/19 ceiling, i.e. 5 unrecoverable samples -- **measured: 1** |

### The probe battery, final state

```
CAUGHT   A. dataset: one more component unrecoverable
CAUGHT   B. dataset: one more unrecoverable, and the ceiling must follow it down
CAUGHT   C. dataset: fix the mislabelled sample, so nothing is unrecoverable
CAUGHT   D. dataset: drop four components, so the ceiling falls below the M1 threshold
CAUGHT   E. probe: count the relaxed ceiling as the strict one
CAUGHT   F. probe: compute the ceiling rate over the wrong denominator
CAUGHT   G. probe: report the ceiling as clearing M1 whatever it is
CAUGHT   H. probe: make the threshold impossible to fail
CAUGHT   I. probe: exempt the one rejected sample from the recoverable set
CAUGHT   J. probe: let the two halves disagree, so the partition guard has to fire
battery: 10 caught, 0 survived, 0 inert
```

### The test battery, and the seven survivors it started with

```
CAUGHT   A. test bounds the partition check, and the probe lets the halves overlap     (failed 3, passed 5)
CAUGHT   B. test drops every identity assertion, and the probe loses the sample it names (failed 1, passed 7)
CAUGHT   C. test recomputes the rate from the dataset instead of reading the reported one (failed 1, passed 7)
CAUGHT   D. test asserts the threshold against a literal, and the probe moves its own   (failed 1, passed 7)
CAUGHT   E. probe publishes the relaxed ceiling as the strict one                       (failed 1, passed 7)
CAUGHT   F. probe publishes the threshold as 0.0                                        (failed 1, passed 7)
CAUGHT   G. probe derives its two halves independently, so they can disagree            (no test ran at all)
CAUGHT   H. dataset drops the mislabelled sample, so the named tripwire must break      (failed 1, passed 7)
battery: 8 caught, 0 survived, 0 inert
```

Three rounds of `SURVIVED` preceded this, and each named a real defect rather than a weak injection:

| round | survivors | what it revealed |
| --- | --- | --- |
| 1 | A, B, D, F, G (5) | two classification bugs (`-1 > 0`, and zero tests counting as a pass) plus three test-only injections with no mutation to expose them |
| 2 | B, G | G was a crash misread as a survivor; B needed all four of its identity assertions relaxed before the claim was genuinely unenforced |
| 3 | B | the identity was unenforceable until the literal was converted into a **contrast** against the other end of the mutation |

### Gates

| gate | result |
| --- | --- |
| typecheck | clean |
| core coverage | **2445 passed** (84 files) at `99.96 / 99.93 / 100 / 99.96` |
| `src/fault`, `src/llm` | `100 / 100 / 100 / 100` |
| cli coverage | 173 passed at `100 / 100 / 100 / 100` |
| lint | `check-no-mock` OK, `check-no-secrets` OK, `check-no-vendored-data` OK (219 files), `check-official-registry` OK, `check-no-absolute-paths` OK |
| official regression | PASSED (8 targets scored, 1 skipped by contract) |
| Golden Master | PASSED (6 OpenRCA + 4 RCAEval files byte-stable) |
| docs | README sample OK, CLI reference PASSED (11 commands, 13 documented) |
| examples | up to date |
| stability battery | 4 caught, 0 survived, 0 inert |
| component rule battery | 8 caught, 0 survived, 0 inert |
| **M1-ceiling probe battery** | **10 caught, 0 survived, 0 inert** |
| **M1-ceiling test battery** | **8 caught, 0 survived, 0 inert** |
| both workflow YAMLs | parse |

Coverage moved 2437 -> 2445 tests with every dimension unchanged, the same shape as pass 23: the new
assertions constrain a published figure rather than exercise new branches, and `src/fault` was already
at 100%.

### The open decision, now arithmetic

Pass 23 framed the `component` question as the round's blocker. The measurement says it is worth one
sample of headroom out of four -- so it should be scheduled as one sample of cleanup, not carried as
the milestone's constraint. The binding constraint is `type` at 4/19, which is a model-accuracy figure
rather than a ceiling: all 19 expected types are distinct slugs that survive `normalizeFaultType`
unchanged, so nothing about the data limits how many the model can answer. That distinction is now
asserted rather than argued, which is the difference this pass was for.

## Pass 26 -- State the `component` rule, and re-annotate the one sample that violated it

Passes 21 through 23 each closed on the same sentence: the benchmark must state what a `component`
answer denotes. Pass 25 measured what that decision was worth (one sample of four of headroom).
This pass takes the decision and closes the field.

### The step that made it safe

Before changing anything, the 19 samples were partitioned three ways -- component present verbatim,
present as tokens, or absent -- and the result reproduced finding 75's table exactly (5 / 13 / 1).
The one absent sample was then read in full, and the reading changed the problem:

```
id:       config-feature-flag-checkout
expected: checkout-ui     <- not in the text
text:     "disappeared from the storefront"   <- a deployed workload, in the text
          "The flag service shows flag ..."   <- a second one, in the text
```

The sample was not unrecoverable. It was **mis-annotated**: `checkout-ui` names a UI element inferred
from the symptom, and the text names two workloads instead. That is a different finding from finding
75's, and it is the one that makes the rule statable -- a rule with no exception in the data, rather
than a rule with one named exception.

### The decision, and the measurement that bounded it

Re-annotating to `storefront` (the workload whose user-visible surface broke) takes the strict ceiling
from 18/19 to **19/19**, and the headroom cost of the field from one sample to zero. Rejected
alternatives, on the evidence: `flag-service` is equally defensible from the text and would give the
same ceiling, but the incident is the breakage, not the misconfiguration; and leaving it as a named
exception keeps the field gradeable only by a rule with a built-in exception, which is the state the
last five passes were trying to leave.

### TDD, in the order it ran

1. **Red first.** The component block's own tripwire (`expect(rejected).toEqual(['config-feature-flag-checkout'])`)
   was rewritten to `toEqual([])`, plus two new tests -- the rule has no exception, and no annotation
   is absent from its own text -- plus four tests for the prompt rule itself. 4 failed, 20 passed.
2. **Green.** `FAULT_COMPONENT_RULE` added beside `FAULT_TYPE_SHAPE_RULE` with the level stated as a
   contrast and the shape stated as a slug, wired into `buildFaultExtractionPrompt`; the dataset
   re-annotated with an `annotationNote` and an `annotationRule` in its provenance.
3. **The suite pushed back, correctly.** Two contrast tests failed because the re-annotation moved the
   readable set from 5 to 6 and the wrong-answer rate from 0.67 to 0.60. Both were updated to the
   *re-measured* values with the movement recorded, not smoothed.

### The batteries found the stale expectations, which is their job

Two of the four batteries reported non-caught outcomes on the new data:

```
probe battery:  6 caught, 3 survived, 1 inert
test battery:   4 caught, 3 survived, 1 inert
```

**None was a probe or test defect.** Four injections had encoded the day's numbers -- `unrecoverable == 1`,
`ceiling == 18`, an anchor on `"checkout-ui"` -- and two probe mutations had become no-ops because the
ceiling they moved past is now closed. The fix is the one worth keeping: the probe battery's
requirements now read the baseline the probe reports, so each asserts a *movement*. Two injections were
re-aimed at what the closed ceiling can still distinguish.

### Verification

| gate | result |
| --- | --- |
| core | 2623 passed (87 files); `src` 100 / 100 / 100 / 100 |
| cli | 173 passed |
| probe | 19/19, unrecoverable 0/19, cost 0 samples |
| four batteries | **30 caught, 0 survived, 0 inert** |
| golden master | PASSED (byte-stable) |
| official | PASSED (8 targets, 1 skipped by contract) |
| docs / examples / registry / bundle / typecheck / lint | all green |

### Where M1 stands

The benchmark asks 19 questions and the field's definition costs nothing. The open question is no
longer definitional: it is whether the model answers enough of those questions to clear the bar, and
`type` remains the binding constraint with no structural ceiling behind it.

## Pass 27 -- Read the `type` misses, and find the drift runs toward over-specification

Findings 69 and 78 both treated `type` as a settled matter: 69 classified `category`'s misses one by one
and 78 repeated the conclusion one field over, calling `type`'s 4/19 a "model-accuracy figure". Neither
read the answers. This pass takes the reading.

### What was read

The fifteen `type` misses of run `9932e766c`, recovered from the CI annotation, where they are recorded
as `expected>actual` rows. They are transcribed into `scripts/probe-type-misses.mjs` with the run named,
because the alternative is a figure that cannot be read without a live LLM key -- exactly when the Zhipu
quota makes it unavailable.

### What the reading says

| class | count | whose defect |
| --- | --- | --- |
| `form-variant` | **0** | -- |
| `shares-token` | 9 | the model's; a near miss |
| `different-mechanism` | 6 | the model's |

**The actionable class is empty.** No answer would have been accepted by a correct `normalizeFaultType`,
so there is no scoring defect here and no synonym table would reach nine of the fifteen. That is the
same shape as finding 69's `category` result, now established by measurement instead of by argument.

The new fact is the **direction** of the drift: 11 of 15 answers are *longer* than the expected slug
against 2 shorter. The model describes the incident where the prompt asks it to name the mechanism --
`replica-lag` -> `replica-apply-thread-saturation`, `redis-latency` -> `redis-command-thread-saturation`.
That is a prompt-level constraint on abstraction level, not a vocabulary problem.

### Paired injections

The battery is the first here whose injections are genuinely **paired**, and that required changing the
battery's own machinery rather than writing four more entries. A definition edit and the data edit that
makes it observable are now expressed as one injection with an `also` slot, and `main` refuses the pair
if the second edit changed nothing.

| injection | what the pair establishes |
| --- | --- |
| B | an unreachable `form-variant` class is invisible until a variant exists to be discarded |
| D | folding must be load-bearing; a variant that *also* shares a token cannot show it |
| E | the class-exhaustiveness guard is what throws, not an incidental downstream crash |
| E2 | E is testing the guard rather than a restructured condition |
| H | "the gate is open" is distinguishable from "there is nothing to gate" |

Two of the data halves had to be chosen rather than assumed. `POD_KILL` for D is a case variant *and* a
token-sharer, so removing folding leaves it a near miss and the count does not move -- the first version
of the pair survived for that reason. `CPU-SATURATION` has the needed property: its single folded token
is not a token of the expected slug.

### Verification

| gate | result |
| --- | --- |
| type-miss probe | `form-variant 0`, `shares-token 9`, `different-mechanism 6`, over-specified 11/15 |
| type-miss test | 8 passed |
| type-miss battery | **14 caught, 0 survived, 0 inert** |
| other three batteries | 26 caught, 0 survived, 0 inert |
| lint | no mock / no secrets / no vendored data / registry / paths -- all OK |
| all five workflow YAMLs | parse |

### Where M1 stands

The remaining gap is a capability gap and now has a hypothesis attached to it: the prompt asks for a
name and the model returns a summary. That is testable against these same fifteen rows, and it is a
different next step than "improve accuracy" would have been.

This pass raised no measured accuracy and claims none. It replaced an inherited assertion with a
measurement.

---

## Pass 28 -- Put the coverage claim under a battery, and find a gate nothing ran

Pass 27 measured `type` and left the M1 work with a hypothesis. This pass does the other half of the
round's instruction: it takes the coverage claim from the previous pass and asks whether it is true.

### The claim this pass tested

The previous finding's closing sentence was a claim about the *remaining* gates:

> the uncovered remainder should be assumed to contain more of the same, not less

That is a prediction, so it was checked by source rather than by reading the workflow's own comments.
Two things came back.

### What the check found

**Two gates have no test naming them anywhere.** `check-no-absolute-paths.mjs` is at least in the `lint`
chain, so a job runs it. `verify-scorer-stability.mjs` is not: it is named by a `package.json` script and
by nothing else -- no workflow step, no run chain, no test. Six properties, a documented rationale about
the *instrument* being stable, a dedicated package script, and no job had ever executed it.

**And being run is only half of it.** A probe was written to mutate the built scorer and require the
gate to name the property that broke. Four of the six properties survived:

| property | why it survived | whose fault |
| --- | --- | --- |
| input purity | the check snapshotted `samples` *after* two determinism runs, so an idempotent mutation had already happened and `before`/`after` agreed | the gate's |
| order independence | a positional pairing is refused upstream by the id-mismatch throw, so the gate's own check is never reached | nobody's -- genuinely guarded upstream |
| denominator (miss count) | every fixture made every sample miss, so the equality held with or without the guard; `if (true)` passed | the gate's |
| denominator (omitted) | the saturated fixture answers every field, so `omitted` was pinned at 0 and its counter was unfalsifiable | the gate's |

Two further defects surfaced while correcting those, both the same shape: **a check whose input cannot
exhibit the failure it looks for.** The input-purity snapshot was taken after the code under test had
already run. And `samplesWithMisses === graded` was true for the wrong reason in both fixtures.

### What was rejected, and why that matters

Changing `detail.length > 0` to `detail.length >= 0` looked like a fourth gap. It is not: `detail` only
grows by `push`, so it is never negative and the predicates are equivalent. That is an **equivalent
mutant**, and scoring it as a survivor would have produced a finding about the gate that was really an
observation about a comparison operator. The first determinism mutation was rejected for the same class
of reason -- `Date.now()` returns the same millisecond twice in a row, so it would have been a *flaky*
detector, reporting the property as enforced half the time and as a gap the other half.

### What changed

| item | before | after |
| --- | --- | --- |
| `verify-scorer-stability.mjs` in CI | no job ran it | sixth check in the `lint` chain |
| its checks | 6 over 1 fixture | **14 over 3 fixtures** (saturated, partial, mixed) |
| partial fixture | -- | `omitted=19, wrongValue=38` -- exercises the omitted path |
| mixed fixture | -- | `samplesWithMisses=18 of 19` -- the only state where the counter can fail |
| new probe | -- | `scripts/injection/scorer-stability-probe.py`, a CI step |
| new test file | -- | `verify-scorer-stability-script.test.ts`, 12 tests |

### Verification

| gate | result |
| --- | --- |
| scorer-stability probe | **4 caught, 1 guarded upstream, 0 survived, 0 inert** |
| `verify-scorer-stability.mjs` | ALL PROPERTIES HOLD, 14 checks, 3 fixtures |
| core tests | **2512 passed** (was 2500) |
| core coverage | `src 100/100/100/100`, `All files 99.96/99.93/100/99.96` |
| gate-test battery | 24 caught, 0 survived, 0 inert, 1 redundant |
| other five batteries | 26 + 14 caught, 0 survived, 0 inert |
| lint | 6 checks, all OK (the gate is now the sixth) |

### What this changes for the audit

Finding 83 records this in full. The one sentence worth carrying forward is the pattern both findings
now share, because it is what made four green properties green:

> **A property that has never been shown to fail is a comment with a print statement.**

That is now a CI step in its own right, so the gate's green is only meaningful while something
independent keeps trying to break it. The pass raised no measured accuracy and claims none.

## Pass 29 -- Dispatch the anchor instead of describing it as blocked, and read the CSV as CSV

Pass 28 ended by putting a coverage claim under a battery. This pass was prompted from
outside: the instruction to stop treating the sandbox as a blocker turned out to be right, the
dispatch turned out to be possible, and the run it produced turned up a reader defect that every
in-repo fixture had been shaped to miss.

### The blocker that was not one

Three iterations closed by saying P0-1 could not be advanced from here because the sandbox
cannot reach Zenodo. The egress measurement behind that (finding 55) was real and was answering
a different question. `official-data.yml` runs on `ubuntu-latest`, and its own header has said
so since it was written. The question was never whether *this machine* reaches Zenodo; it was
whether the runner can and whether anything here can start it. The first was answered and
reported as the second, and the second was never tried.

It is one call:

```
POST /repos/AgentiX-E/rca-bench-factory/actions/workflows/official-data.yml/dispatches
  {"ref":"master","inputs":{"anchor":"rcaeval-re1"}}   ->   HTTP 204
```

Run `37192624818` was created fifteen seconds later. The permission probe is a single header,
`x-accepted-github-permissions: actions=read`, returned on every Actions response including the
ones already being read to enumerate the workflow files.

### What the fetch produced

```
UNPINNED  rcaeval-re1-ob: bytes=30966778  sha256=4a709297e0a829f0f2ee8a7792a6d74da32d663c600565b7fffc860963b840c4
UNPINNED  rcaeval-re1-ss: bytes=79089075  sha256=b4424b0b3863b7397712caa0f305ef59964b03784dfcb23e23e0a95a2e746f99
UNPINNED  rcaeval-re1-tt: bytes=279663965 sha256=2b33b7ab07198e0d69f229e697bfcef794a656e8db73a1d732142effde17c595
REPORT    /tmp/pins.json: 3 pin(s) measured
```

Three assets, ~390 MB, digest-verified. The descriptor derivation then found **375 cases** --
RE1's real case count, against RE2's 270 -- and the round trip failed on **all 375**.

### The defect

```
ROUNDTRIP declared 375 case(s), found 1000 file(s), 453 directory(ies)
ROUNDTRIP FAIL 1/375 RE1-OB/adservice_cpu/1
  reason=data.csv is not valid JSON: Unexpected token 'i', "time,adserv"... is not valid JSON
ROUNDTRIP 0 of 375 declared case(s) round-tripped; 375 finding(s)
```

375 of 375, one uniform reason. That is not a corpus problem; it is a dispatch bug, and the
message names it in its first token: the reader has a file called `data.csv` and is parsing it as
JSON.

The lookup list was right -- finding 46 put `data.csv` in it, because the corpus ships
`metrics.json` for RE2 and `data.csv` for RE1. Where it broke is the step after the lookup:

```javascript
const metrics = assertRcaevalMetrics(bytes.toString('utf8'), entry, found.name);
```

`found.name` reached the JSON converter's error message and was used for nothing else. The name
decided what the failure was *called* and never what the reader *did*.

### Why every in-repo check passed

Every fixture in this repository is ours, and our exporter writes `metrics.json`. So the JSON
path is the only path any fixture had ever taken, and the CSV path had never been exercised. One
test appeared to cover it -- and overwrote its own CSV with JSON four lines after writing it, so
it passed on the JSON reader while asserting the CSV one.

### What changed

| item | before | after |
| --- | --- | --- |
| `check-official.mjs` payload dispatch | name reached the message only | content decides the reader |
| delimited payloads | `JSON.parse` on a CSV | `parseDelimited` from the ingest module |
| `data.csv` in the CI corpus | absent | RE1 case, every push |
| per-shape verdict in CI | none | both shapes must print `PASS` against their own target |
| reader guards | untested | 7 tests, one per refusal rule |
| vacuous `data.csv` test | wrote CSV, then JSON | separated into a CSV case and a JSON-in-`.csv` case |
| `writeCaseWithoutMetrics` | held a valid CSV | renamed `writeCsvCase`; a real `writeUnreadableCase` added |

### Verification

| gate | result |
| --- | --- |
| RE1 shape, before | `data.csv is not valid JSON` -- reverting the one line reproduces it |
| RE1 shape, after | `ROUNDTRIP PASS oracle=1.00 signals=3` |
| CI corpus, both shapes | `RE1 ... oracle=1.00 signals=80` / `RE2 ... oracle=1.00 signals=80` |
| Deliberate breaks | **8 of 8 fired**, restore byte-identical |
| core tests | **3045 passed / 107 files** (v1.53: 3031 / 106) |
| core coverage | `All files 99.96 / 99.91 / 100 / 99.96`; no file x dimension below 95% |
| `typecheck` / `lint` / `docs:check` / `examples:check` / `official:check` | clean |
| workflows | all 5 parse; the 8 corpus steps of `anchor-roundtrip.yml` run green by their own shell |

### What this does not do

- It does **not** pin the three RE1 assets. The digests are measured; the pins are a reviewed
  commit and nothing has merged them.
- It does **not** claim the RE1 anchor is reproduced. The round trip over real telemetry is the
  ingest-export-official path; whether the score matches upstream is the anchor's own claim.
- It does **not** explain RE2. RE2 passed 270/270 in an earlier dispatch, which is what made this
  look like a corpus difference -- and is why the defect needed the *other* anchor to surface.

## Pass 30 -- Dispatch RE1 again, and find the accumulator that could not hold a run

Pass 29 ended on the reader fix and left the obvious next action: dispatch the RE1
fetch again, because the reader was now correct and the three RE1 digests were
already measured. That dispatch ran.

Before it, though, this pass had to close something of its own. The v1.54 commits
were reported as delivered while they existed only in this working copy -- finding
116. The report had read `git log`, which cannot distinguish "committed" from
"pushed", and the arrow `ece5b3964 -> cfd35dc` described a transition that had
happened in one place only: the local reflog. The remote refs said otherwise:

```
GET /repos/AgentiX-E/rca-bench-factory/branches/master       -> ece5b3964
GET /repos/AgentiX-E/rca-bench-factory-docs/branches/master  -> 8f9bba124
```

Both were pushed and both landed, which is also what produced the first pipeline
evidence for v1.54's new workflow steps:

```
== Anchor round trip / Round-trip a synthetic corpus in the official layout: success
   [ok] Both payload shapes are derived, one per suite
   [ok] Both payload shapes round-trip, not just the one we emit
```

### The dispatch, and what it measured

`POST .../actions/workflows/official-data.yml/dispatches` returned **HTTP 204**
with `x-accepted-github-permissions: actions=write`, creating run `37196522469`
on sha `cfd35dccd`. The fetch, the digest comparison and the descriptor derivation
all passed. Then:

```
ROUNDTRIP declared 375 case(s), found 1000 file(s), 453 directory(ies)
RangeError: Maximum call stack size exceeded
    at ingestPrimeDataset (.../dist/ingest/prime.js:498:21)
            signals.push(...ingested.signals);
```

**375 cases declared, 1000 files found, zero scored.** The reader fix was working
-- the CSV payloads were being read, and all 375 declarations were accepted --
and the run then died in the accumulator that collects the results.

### The cause

`signals.push(...ingested.signals)` passes every element as a function argument.
The ceiling was probed rather than assumed:

```
[].push(...new Array(100000).fill(0))   -> ok
[].push(...new Array(125000).fill(0))   -> RangeError
```

One RE1 `data.csv` holds a whole run, which is past that. The synthetic fixture
holds a handful of rows, which is nowhere near it -- and **every fixture in this
project is ours and small**, so no test had ever fed a realistic size through this
path. The line had passed review, type checking and 3045 tests for the life of the
file.

This is finding 115's shape one layer in. There the reader was right for every
fixture and wrong for the corpus's *shape*; here the accumulator was right for
every fixture and wrong for the corpus's *scale*. Both were reachable only by
running the real thing.

### The fix, and the part that generalises

A loop replaces the spread. A behavioural test covers the calls it makes, and
this defect was in a call nobody made, so it is paired with a **source-level
guard**: `spread-append-guard.test.ts` walks `src` and fails on any `push(...x)`
not on an explicit known-bounded list. Four sites are exempt, each with the
property that bounds it; `ingest/prime.ts` deliberately is not.

### Verified

| gate | result |
| --- | --- |
| the defect reproduces locally | `RangeError` at `prime.ts:660` on a 130,000-row payload |
| the fix resolves it | same payload, `signals = 130000`, zero quarantine |
| breakout size | probed, not guessed: between 100,000 and 125,000 |
| deliberate breaks | **6 of 6 fired**, restore byte-identical |
| core tests | **3050 passed / 108 files** (v1.54: 3045 / 107) |
| core coverage | `All files 99.96 / 99.91 / 100 / 99.96`; **217 file x dimension pairs, 0 below 95%**, lowest 99.58% |
| `typecheck` / `lint` / `docs:check` / `examples:check` / `official:check` | clean |

### What this does not do

- It does **not** pin the three RE1 assets. The digests are measured; the pins are a reviewed
  commit and nothing has merged them.
- It does **not** claim the RE1 anchor is reproduced. This run died before scoring, so whether
  the 375 cases round-trip at `oracle=1.00` is the next dispatch's measurement.
- It does **not** explain RE2. RE2's per-case payloads are smaller, which is consistent with the
  size hypothesis, but that was not measured and is not offered as the explanation.
- It does **not** close the class. The guard covers `push(...x)` in `src`; a spread inside a call
  (`f(...arr)`) at the same scale is uncovered until checked.

## Pass 31 -- Dispatch RE1 on the fixed code, and get 253 of 375

Pass 30 ended with the accumulator fixed and the dispatch call measured to work.
This pass ran it. `POST .../workflows/official-data.yml/dispatches` returned **HTTP
204**, creating run `37283049425` on sha `92df8c6ec`.

Everything before the round trip passed. The round trip then ran for **23 minutes**
-- against 2 minutes when it was dying on the first file -- and printed:

```
ROUNDTRIP declared 375 case(s), found 1000 file(s), 453 directory(ies)
ROUNDTRIP PASS   1/375 RE1-OB/adservice_cpu/1  target=rcaeval-re1  oracle=1.00 signals=210050
...
ROUNDTRIP PASS 253/375 ...
ROUNDTRIP FAIL 314/375 RE1-TT/ts-route-service_disk/4  reason=data.csv line 195 column '..._istio-latency-50' is not a finite number: 'NaN'
```

**PASS 253, FAIL 122.** The RangeError is gone, and cases now process at
**~210,000 signals each** -- the real per-case scale of an RE1 run, which is the
number that explains why the spread could never have held one.

### The distribution is the result

| System | PASS | FAIL | Pass rate |
| --- | --- | --- | --- |
| RE1-OB | 125 | 0 | **100%** |
| RE1-SS | 123 | 2 | 98.4% |
| RE1-TT | 5 | 120 | **4.0%** |

One failure reason, 122 occurrences:

```
data.csv column '<service>_istio-latency-50' is not a finite number: 'NaN'
```

**This is the opposite of the pattern that identified findings 115 and 117.** There,
a uniform reason across *every* case meant a defect in the path. Here the failures
are confined to a recognisable subset -- one of three systems, and within it one
family of columns -- which is the signature of a property of that subset. Two of the
three systems round-trip essentially perfectly; a reader defect cannot do that.

The `NaN` is literal text in TrainTicket's shipped telemetry. The reader **refuses**
it rather than dropping the point, naming the line and column, which is v1.54's own
rule (`refuses a non-numeric cell rather than dropping the point`) behaving as
designed. **The design question it exposes is separate:** a corpus that ships `NaN`
in a latency percentile column is not malformed, and refusing the whole case over it
is a choice that was never justified against real data -- because until this run, no
real data had reached it.

### Why this pass matters more than its predecessors

Findings 115, 116, 117 and 118 were all defects. This is not. It is the first
measurement here that distinguishes **"our code is wrong"** from **"the corpus says
something we had not decided how to handle"**, and it distinguishes them **by
distribution rather than by inspection**.

That distinction was unavailable earlier for a structural reason: every earlier
fixture was ours, so every earlier result could only report on our own assumptions.
This is the first output where the corpus is the author.

### Verified

| gate | result |
| --- | --- |
| dispatch | `HTTP 204`, `x-accepted-github-permissions: actions=write`, run `37283049425` |
| RE1 round trip | **253 / 375 PASS at `oracle=1.00`**, one failure reason across the other 122 |
| per-case scale | ~210,000 signals, which is past the argument ceiling finding 117 measured |
| CI on the same sha | run `37282447866` **success**; log shows `108 passed` files and `All files 99.96 / 99.91 / 100 / 99.96`, identical to local |
| both repos pushed | factory `cfd35dccd -> 92df8c6ec`, docs `1ae338306 -> ffd983731`; both confirmed by run creation on the new sha |

### What this does not do

- It does **not** claim RE1's anchor is reproduced. The round trip is the
  ingest-export-official path; whether the score matches upstream is the anchor's own
  claim and has not been measured.
- It does **not** decide what `NaN` should mean. Dropping, zeroing or interpolating
  is a decision, not a measurement, and it is not made here.
- It does **not** read the two RE1-SS failures individually, so it does not claim they
  share TT's cause.
- It does **not** pin the three RE1 digests. They are measured; the pin is a reviewed
  commit and nothing has merged it.

## Pass 32 -- Read one RE1-TT case out of the archive, and decide what `NaN` means

Pass 31 ended on a question it refused to answer: 122 of RE1's 375 cases fail
because a `_istio-latency-50` column carries the literal text `NaN`, and whether
that should be refused, dropped, or read as a declared absence depends on a fact
nobody had looked at -- the *shape* of the `NaN` in the file.

This pass looks, then acts.

### Getting the corpus open

`RE1-TT.zip` is 279,663,965 bytes and the sandbox reaches `zenodo.org` at about
**17 KB/s**, so the archive is not fetchable in a useful time. Two observations
made one member reachable anyway:

- the **central directory is at the end** and records each member's offset and
  size, so two range requests (13,965 + 57,719 bytes) brought back all 526 entries
  and the exact byte range of any one `data.csv`;
- one range request of 2,094,646 bytes then carried
  `RE1-TT/ts-route-service_disk/4/data.csv` whole.

### A correction to Pass 31

Pass 31 recorded that RE1-TT.zip stores its members uncompressed. It does not:
the archive is **DEFLATE** (`method 8`), and the payload needed `zlib` to become
CSV. The claim came from reading the first local file header, which belongs to the
directory entry `RE1-TT/` and has `csize=0` -- an entry that cannot exhibit either
compression method. One member's zero-length header was generalised into a fact
about the archive. It is recorded rather than quietly edited because an
unsupported claim that reads like a measurement is the failure mode this audit
keeps finding.

### What the `NaN` is

One real case, decompressed to 12,806,155 bytes: 1,446 columns, 721 rows, one
second per sample.

| Service | Columns | istio columns | `NaN` onset | Distinct onsets |
| --- | --- | --- | --- | --- |
| `ts-preserve-other-service` | 26 | 9 | row 193 | **1** |
| every other service (71) | -- | -- | none | -- |

Of that service's 26 columns, 18 (all `container-*`, plus `istio-request-total`)
carry 528 live readings *after* row 193, and 8 (`istio-latency-50/90/95/99`,
`istio-bytes-50/90/95/99`) hold `NaN` from row 193 to the end -- one shared onset,
one suffix, no holes. `NaN` is the file's only non-numeric token; the time axis is
unbroken across the onset (row 193 is `1702396847`, row 194 is `1702396848`).

That is instrumentation reporting "no reading from here on" while the service
itself keeps running, not a file we failed to read. It is also not the fault
being scored: the case's root cause is `ts-route-service`, and the affected
service is a different one.

### The fix

The reader distinguished "unreadable" from "absent" nowhere: `Number.isFinite`
decided both, so a corpus stating an absence was refused as a parse failure.
`buildSignal` now returns three outcomes -- `ok`, `missing`, `reject` -- and the
union makes the third a type error to ignore rather than a branch an `if/else` can
collapse. `MISSING_VALUE_TOKENS` in `ir/types.ts` is the single definition of the
spelling, imported by the official adapter so the two layers cannot drift; the
adapter skips a `NaN` cell exactly as it already skipped a blank one. Absent rows
are counted in a new `missing` field on both the file result and the per-case
report, so `signals + quarantine + missing` still equals the source row count.

Acceptance is on the **exact token**, not on non-finiteness: `nan`, `NAN`,
`nan.0`, `Infinity`, `-Infinity`, `NA`, `inf`, `null` and `oops` are each pinned
to a refusal, because only one spelling has been measured in a corpus we score
against and accepting the family would be a guess dressed as tolerance.

### Verified

| gate | result |
| --- | --- |
| the real case, end to end | `ROUNDTRIP PASS 1/1 RE1-TT/ts-route-service_disk/4 target=rcaeval-re1 oracle=1.00 signals=1037517` |
| same case before the fix | `FAIL` -- `column '..._istio-latency-50' is not a finite number: 'NaN'`, 0 signals |
| repo test suite | **111 files, 3232 tests passed** (`pnpm test`, every workspace; retaken as 112 / 3245 by Pass 35) |
| coverage | **217 file x dimension pairs, 0 below 95%**, lowest `99.58%` (`score.ts` branches); `All files 99.96 / 99.91 / 100 / 99.96` |
| break battery | `break-v120.py` **6/6** mutations behave as required, byte-identical restore |
| gates | `typecheck`, `lint`, `docs:check`, `examples:check`, `official:check` (8 scored / 1 skipped) all clean |

The break battery's two controls are the point of it: emptying the vocabulary
must keep the exact-spelling refusals firing, and removing the adapter's skip must
leave the all-`NaN` boundary refusing. Both do. The first run of the battery also
caught a defect in the battery itself -- its restore used `replace(new, old)`,
which is a no-op when the mutation is a deletion, so it left one mutation applied
and reported its own bug as a mismatch.

### What this does not do

- It does **not** claim all 122 failures share this cause. One case is measured in
  full; the other 121 are counted, not inspected.
- It does **not** re-run RE1. The full corpus is 279 MB at ~17 KB/s, so the 122
  are not re-measured here; one of them is measured passing.
- It does **not** touch the reader's quarantine semantics for genuinely unreadable
  cells, which still reject the row with its line and column named.
- It does **not** pin the RE1 digests, and does **not** claim RE1's anchor is
  reproduced.

## Pass 33 -- Five real RE1-TT cases instead of one, and the layer the fix actually belongs to

Pass 32 ended with a fix, one case measured end to end, and this admission:

> It does **not** claim all 122 failures have this shape. It measures one case in
> full and the shape it found; the remaining 121 are counted, not inspected.

This pass narrows that from one case to five, and measures which layer the fix is
load-bearing for -- which is not the layer Pass 32 credited.

### Getting five members instead of one

The archive is 279,663,965 bytes at ~13 KB/s, so the whole thing is out of reach.
What makes a member reachable is the central directory at the end, which records
every local header offset and size, plus two facts learned the hard way:

- **the local header must be parsed before the payload is fetched.** The header
  carries the name *and* a variable-length extra field. The first extractor left
  the extra field out, so every chunk was shifted by **28 bytes**. The symptom is
  the dangerous kind: HTTP 206, the exact expected byte count, the right file
  length, and a DEFLATE stream that will not decompress. The extractor now parses
  the header it fetched, asserts name and sizes against the central directory, and
  **verifies crc32**;
- the host serves a **short range in seconds** and throttles a long one hard, so
  the payload is pulled in 64 KB chunks rather than one resuming request.

Five members, `cpu/1` of each faulted component, 12.8 MB apiece, all crc32-clean.

### Why one per component is the sample that answers it

RE1-TT scores five components -- `ts-auth-service`, `ts-order-service`,
`ts-route-service`, `ts-train-service`, `ts-travel-service` -- 25 cases each.
Finding 120's affected service is a **neighbour** of the faulted component, so one
case cannot separate two worlds: the gap is a property of the **fleet at that
timestamp**, or of **particular services**.

| case | `NaN` columns | services carrying a gap |
| --- | --- | --- |
| `ts-auth-service_cpu/1` | 16 | `ts-payment-service`, `ts-preserve-other-service` |
| `ts-order-service_cpu/1` | 8 | `ts-preserve-other-service` |
| `ts-route-service_cpu/1` | 16 | `ts-preserve-other-service`, `ts-preserve-service` |
| `ts-train-service_cpu/1` | 16 | `ts-payment-service`, `ts-preserve-other-service` |
| `ts-travel-service_cpu/1` | 8 | `ts-preserve-other-service` |

It is the second world. `ts-preserve-other-service` carries a gap in **all five**
and is the faulted component in **none**; `ts-payment-service` in three;
`ts-preserve-service` in one. And finding 120's single observation -- "onset row
193, suffix to the end" -- turns out to be the endpoint case of intermittent
dropout: the runs here are interior, of 3 to 49 rows, and they **resume**.

`NaN` is the file's only non-numeric token in all five files, every row is the
header's width, and no other anomaly appears.

### The `NaN`'s cause, measured and partly disconfirmed

"No traffic, so no percentile" is mostly right. For
`ts-preserve-other-service` in the auth member all 52 `NaN` rows have
`istio-request-total = 0`. For `ts-payment-service` **39 of 42** do, and **three
carry 2, 2 and 1** -- traffic served, percentile still absent. On that service's
live rows `request-total = 0` is the majority (797 of 961) and the percentile is
present. So zero traffic is the usual cause and not a sufficient one, and the
finding says so rather than rounding it off.

The service is up during the gap regardless: all 13 of its `container-*` columns
carry live readings at every row, and `istio-latency-50` goes
`0.0175 -> NaN x6 -> 0.0175`.

### The round trip, over five

```
ROUNDTRIP PASS   1/5 RE1-TT/ts-auth-service_cpu/1    target=rcaeval-re1 oracle=1.00 signals=1191849
ROUNDTRIP PASS   2/5 RE1-TT/ts-order-service_cpu/1   target=rcaeval-re1 oracle=1.00 signals=1191560
ROUNDTRIP PASS   3/5 RE1-TT/ts-route-service_cpu/1   target=rcaeval-re1 oracle=1.00 signals=1192345
ROUNDTRIP PASS   4/5 RE1-TT/ts-train-service_cpu/1   target=rcaeval-re1 oracle=1.00 signals=1194331
ROUNDTRIP PASS   5/5 RE1-TT/ts-travel-service_cpu/1  target=rcaeval-re1 oracle=1.00 signals=1197382
ROUNDTRIP PASSED (5 case(s) round-tripped through the official layout)
```

### The correction, and how it was found

The obvious reading of that output is "the Pass 32 fix did this". The battery says
otherwise. Removing the reader's missing-value branch from the built package
leaves **all five passing**:

```
Layer A -- the reader's own branch (packages/core/dist/ingest/file.js)
  M1 the reader stops treating the token as an absence
    6 pass line(s), 0 fail line(s)  exit=0
```

`check-official.mjs` skips a declared absence in its delimited path *before*
building the row's signal map, so the reader's branch is unreachable there.
Removing the **adapter's** skip refuses all five and names the cell:

```
Layer B -- the official adapter's skip (scripts/check-official.mjs)
  M2 the adapter stops skipping a declared absence
    0 pass line(s), 6 fail line(s)  exit=1
    ROUNDTRIP FAIL  1/5 RE1-TT/ts-auth-service_cpu/1  reason=data.csv line 568
      column 'ts-payment-service_istio-latency-50' is not a finite number: 'NaN'
```

The reader's branch is not dead -- it is on the `ingestFile` path, which the
reader's own test establishes, since a corpus that never reaches it cannot:

```
  ingestFile reaches buildSignal: True
  without the reader branch, 'keeps a row whose cell says NaN': fires
  restored, the same test: passes
```

| change | load-bearing for | evidence |
| --- | --- | --- |
| adapter skips a declared absence | the official round trip | removing it refuses 5/5 real cases |
| reader returns `missing` | `ingestFile` and its unit tests | removing it fails the reader's test; the round trip is unaffected |

A corpus-only battery would have called the reader's change unnecessary; a
test-only battery would have credited it for the round trip. Both statements are
wrong alone, which is why the battery now runs both and asserts each layer's
answer.

### The RE1 digests are pinned

Run `37283049425` fetched all three RE1 assets and wrote `/tmp/pins.json`; nothing
had merged it, so the registry still said `pending` and the next fetch would have
re-measured instead of verifying.

| asset | bytes | sha256 |
| --- | --- | --- |
| `rcaeval-re1-ob` | 30966778 | `4a709297e0a829f0f2ee8a7792a6d74da32d663c600565b7fffc860963b840c4` |
| `rcaeval-re1-ss` | 79089075 | `b4424b0b3863b7397712caa0f305ef59964b03784dfcb23e23e0a95a2e746f99` |
| `rcaeval-re1-tt` | 279663965 | `2b33b7ab07198e0d69f229e697bfcef794a656e8db73a1d732142effde17c595` |

`apply-pins.mjs` wrote only `sha256` and `bytes`; the diff confirms six changed
fields and the other five untouched. The registry now reads **6 pinned, 5
pending, 7 declared unfetchable** and the partition closes.

`pnpm docs:check` failed the instant the pin landed -- `check-l4-status.mjs`
derives the fetch axis from the registry, so the published `pending` cell became a
red build rather than a published error. That failure also exposed six assertions
in `check-l4-status.test.ts` **coupled to the pin ledger**: the fixture hard-coded
`rcaeval-re1` as pending and addressed rows by index, so "fails when a row calls a
pending anchor pinned" started setting a pinned anchor to pinned -- the correct
state -- and failed on its own premise. The fixture now classifies the registry.

### Verified

| gate | result |
| --- | --- |
| five real cases, one per faulted component | **5/5 PASS at `oracle=1.00`**, ~1.19M signals each |
| the layer battery | reader branch not needed for the round trip; adapter skip needed for all five; control passes |
| the reader branch's reachability | fails the reader's own test when removed, so it is live on `ingestFile` |
| core test suite | **108 files, 3059 tests passed** (one more than Pass 32) |
| coverage | **217 file x dimension pairs, 0 below 95%**, lowest `99.58%` (`score.ts` branches) |
| gates | `typecheck`, `lint`, `docs:check`, `examples:check` all clean |

### What this does not do

- It does **not** claim all 122 failures share this shape. Five are measured in
  full; the rest are counted. The five establish the gap is per-service rather
  than per-component, which makes the remaining 120 plausible, not proven.
- It does **not** re-run RE1, so the pass count is still Pass 31's 253 of 375.
- It does **not** claim RE1's anchor is reproduced. A pin says the bytes are the
  bytes; the score's agreement with upstream is unmeasured.
- It does **not** explain every `NaN` -- zero traffic accounts for most and
  demonstrably not all.
- It does **not** read the two RE1-SS failures individually.

## Pass 34 -- re-deriving finding 121's numbers to publish them in a second language

The pass before this one wrote the Chinese documentation for finding 121. Doing
that means restating its numbers, and a number restated is a number that can be
checked -- so this pass checked them instead of copying them. Five of finding
121's members were still on disk.

### What reproduced, and what did not

Everything substantive reproduced, to the unit:

| claim | finding 121 | re-derived |
|---|---|---|
| `NaN` cells | 752 / 80 / 256 / 192 / 24 | identical |
| `NaN` columns | 16 / 8 / 16 / 16 / 8 | identical |
| affected services | as published, per case | identical |
| run lengths | 3 to 49 rows | identical, 12 runs |

The run **positions** did not. All eight interval groups are exactly two lower
than the file:

| case | service | finding 121 | actual physical line |
|---|---|---|---|
| auth | `ts-preserve-other-service` | `820-868`, `958-960` | `822-870`, `960-962` |
| auth | `ts-payment-service` | `566-571`, `881-916` | `568-573`, `883-918` |
| order | `ts-preserve-other-service` | `319-322`, `812-817` | `321-324`, `814-819` |
| route | `ts-preserve-other-service` | `600-615` | `602-617` |
| route | `ts-preserve-service` | `111-126` | `113-128` |
| train | `ts-preserve-other-service` | `349-358`, `489-499` | `351-360`, `491-501` |
| train | `ts-payment-service` | `839-841` | `841-843` |
| travel | `ts-preserve-other-service` | `137-139` | `139-141` |

### The convention, decided by the code rather than chosen

The reader's refusal message already fixes it. Finding 121's battery recorded:

```
reason=data.csv line 195 column 'ts-preserve-other-service_istio-latency-50' is not a finite number
```

On the member that message came from, the first `NaN` in that column is on
physical line 195 -- so the reader counts the header, and finding 121's table,
at `physical - 2`, matches neither coherent convention. Finding 120 made the same
slip ("row 193" for a cell its own message called line 195); finding 121 fixed
the shape of that observation and inherited the numbering.

### Why it is recorded rather than quietly corrected

Because nothing in this repository reads a row number out of `audit.md`. The
table could have stayed wrong indefinitely and every gate would have been green,
which makes it the same class the audit has now named five times: a published
number with nothing re-reading it. What caught it is only that the number had to
**cross into a second language**, and that forced it to be restated, and
restating made it checkable.

### Verified

| gate | result |
| --- | --- |
| the five members | still present, 12.8 MB each, same bytes the round trip used |
| `NaN` counts and service sets | reproduce exactly, five files |
| run lengths under the shift | unchanged: 3, 3, 3, 4, 6, 6, 10, 11, 16, 16, 36, 49 |
| the corrected table | matches the re-derivation in all eight groups |
| core test suite | **108 files, 3059 tests passed**, unchanged (docs only) |
| gates | `typecheck`, `lint`, `docs:check`, `examples:check` all clean |

### What this does not do

- It does **not** change a single count, length, service set or round-trip
  result. Those all re-derived exactly, which is what makes the defect a label
  rather than a measurement.
- It does **not** re-fetch anything. It re-reads five files already verified.
- It does **not** clear the rest of this audit. Other findings that name a row
  were not re-derived, so their numbers are unmeasured here, not confirmed.

---

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
| `core` test suite | **109 files, 3073 tests passed** (as of this commit) |
| `cli` test suite | **3 files, 173 tests passed** (as of this commit) |
| repo test suite | **112 files, 3246 tests passed** (`pnpm test`, every workspace; as of this commit) |
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
