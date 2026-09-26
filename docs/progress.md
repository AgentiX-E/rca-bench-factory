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
| 4 | Official-data round trip — ingest → export → official, label-blind | **path executable; the real run fails at the fetch, for a cause now fixed and a consequence not yet observed** (`official-data.yml`; the path is exercised on a synthetic corpus by `anchor-roundtrip.yml`; see findings 45 and 52) |

Anchor 4 is the one that would detect a misunderstanding shared by our exporter
and our scorer. Anchors 1–3 all begin from a bundle this repository authored, so
agreement between them proves internal consistency, not correctness against the
upstream rule.

The path is built, the wiring is gated on every push, and the number has **not**
been reproduced on real telemetry: the corpus is 19 GB and this session's
sandbox has no route to Zenodo. Say so plainly rather than implying the anchor is
closed.

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
`ROUNDTRIP PASSED`, and that run has not been made since this fix. What the fix
buys is that the next run reaches the round trip instead of aborting at it.

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
