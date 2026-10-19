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
| L4 | Official reproduction | **3 of 4 anchors met; the fourth's path now runs on the real corpus** | Golden Master, mutation suite and the official-metric regression are green in CI every push; the real-corpus round trip round-tripped **375 / 375 at `oracle=1.00`** (run `38250480271`, see `## The last measured round trip`). **The number is still not reproduced**: no comparison against upstream published figures exists, which is P0-2 |
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

## The last measured round trip

The fourth anchor's path now runs on the real corpus. Measured by
`official-data.yml` run `38250480271` at `167e08f28`; the figures below are held to
`golden-master/roundtrip.json` by `scripts/check-roundtrip-record.mjs`, and that
file's pins are held to `golden-master/official-assets.json` by the same guard --
so a number here that stops matching the record fails the documentation gate in
both the warm and the cold-tree job.

| item | value |
| --- | --- |
| anchor | `rcaeval-re1` |
| cases declared by the corpus | **375** |
| cases round-tripped at `oracle=1.00` | **375** |
| cases that did not | **0** |
| mean oracle score across the scored cases | **1.00** |
| worst per-case oracle score | **1.00** |

Three things about this table are deliberately absent from it. It does **not**
claim the score agrees with upstream's published numbers -- `oracle=1.00` is the
official rule applied to the ground-truth root cause, which is the scorer's own
ceiling and not a solver's accuracy. Upstream's published figures are *solver*
accuracies over the same corpora; ours is the metric's ceiling, so the two are not
comparable as they stand. What would make them comparable is running upstream's own
scorer, with its own answer key, over the same corpus -- that is the remaining half
of P0-2 and it is unmeasured. It
does **not** cover RE2 or RE3, which are separate anchors with separate fetches. And
it does **not** replace the dated per-pass records further down this file, which
say what each pass measured at the time.

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
| repo | 2623 passed (87 files); `src` 100 / 100 / 100 / 100 |
| cli | 173 passed |
| probe | 19/19, unrecoverable 0/19, cost 0 samples |
| four batteries | **30 caught, 0 survived, 0 inert** |
| golden master | PASSED (byte-stable) |
| official | PASSED (8 targets, 1 skipped by contract) |
| docs / examples / registry / bundle / typecheck / lint | all green |

> This table's first row read `core` for fifteen passes. It is the workspace
> figure, and finding 153 is why that could be said: 87 is every workspace's test
> file count at this pass (84 in `packages/core` plus 3 in `packages/cli`, which
> is where every other table's `repo` row gets its number), and `packages/core/test`
> has never held 87 test files -- checked against every commit in the repository's
> history, not remembered. The test count closes the same identity:
> 2623 = 2445 + 173 + 5, which is Pass 25's `core coverage` row plus this scope's
> own `cli` row plus the five tests this pass added. Corrected here rather than
> left as a record, because a record of the wrong scope is not a record.

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
- It does **not** re-run RE1, so the pass count it reports is Pass 31's 253 of 375 -- which **was true when this pass was written and is not any more**: run `38250480271` round-tripped 375 of 375 under the semantics this pass established. See `## The last measured round trip` at the top of this file, and finding 155. The sentence is left with its correction rather than deleted, because the claim it records is part of what the pass did.
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

Writing up finding 133 turned into finding 134 and then finding 135, and all
three are the same statement at three removes from the rule: *a check whose
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

### Open

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

### Open

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

### Open

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

### Open

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

### Open

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

### Open

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

### Open

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

### Open

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

### Open

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

## Pass 49 — a gate is a property, and the enumeration was reading a spelling

### What was found, by asking what the two mechanisms cover

`derive-gate-sites.mjs` reported `50 failure site(s) across 32 of 40 script(s)`, and the eight
scripts with no site were not the ones a reader would guess. They were **the batteries and the
probes** -- including three the pipeline runs on every push:

```
scripts/inject-stability.mjs      scripts/probe-m1-ceiling.mjs
scripts/inject-component-rule.mjs scripts/probe-type-misses.mjs
scripts/inject-m1-ceiling-tests.mjs
scripts/probe-denial-inventory.mjs  scripts/serve-site.mjs  scripts/format-spec.mjs
```

The reason was one line. The deriver's rule was written as **`process.exit(1)`** -- a literal --
and everything else went into `excluded`. So `process.exit(main())`, which is how every battery
here reports its verdict, and `process.exit(2)`, which `fetch-official.mjs` uses for "the pin does
not match and retrying cannot help", were **not failure sites**. And the site list is the only
mechanism in this repository that asks whether a failure exit is proved.

> **A gate is a property -- it exits non-zero when it is unhappy -- and the enumeration was
> reading a spelling.** That is finding 168's shape one level up: there the guard's subject was
> the *document* where it said "section", and here it was the *file* the rule was about.

### The fix, and what the first re-derivation exposed

The deriver now treats any **statement-position** exit whose argument is not the literal `0` as a
failure site, and the exclusions are reported as what they are: `{zero: 7, indirect: 3, multiline:
0}`. `computed` and `numeric_other` are gone as tallies because they are no longer exclusions --
a number under a label that says "we threw this away" is a claim that something was thrown away.

That took the inventory from **50 sites across 32 scripts** to **57 across 37**, and the seven new
sites arrived **unannotated**:

| script | what its exit means |
| --- | --- |
| `fetch-official.mjs` | `process.exit(2)`: a downloaded file does not match its registry pin |
| `inject-stability.mjs` | `main()`: a survivor, an inert anchor, or a failed restore |
| `inject-component-rule.mjs` | same shape, different subject |
| `inject-m1-ceiling-tests.mjs` | same shape, different subject |
| `probe-denial-inventory.mjs` | `unresolved.length > 0` |
| `probe-m1-ceiling.mjs` | `main()`: the ceiling it measured |
| `probe-type-misses.mjs` | `main()`: an aggregate of per-type counts |

Six are exempt with **reasons of their own**, because this file refuses a shared reason -- a
sentence covering two sites would say they are the same check. The seventh, `fetch-official`'s,
is **proved**: `fetch-official.test.ts` already asserts `status === 2` in three places, against a
pin mismatch served from its own loopback server.

### Two second accounts of the same predicate, found by the change

Widening the deriver broke two other guards, and both were **restatements of the predicate it
had just corrected**:

- The first draft of the new `isFailureExitStatement` dropped the path that matched an exit
  **not at the start of a line** -- `if (!ok) process.exit(1);`. `exitArgument` anchors at the
  line's beginning, so it returns `undefined` there, and the new code read that as "not an exit".
  `build-example-bundle.mjs` lost its only failure site, and **`scripts-are-classified.test.ts`
  caught it on the same run** -- which is what that register is for, and it is recorded in the
  code rather than only here.
- `scripts-are-classified.test.ts` carried its **own regex** for "does this script have a failure
  exit", so when the inventory grew by seven sites the two accounts disagreed and five scripts
  were reported as "declared a gate or probe without a failure exit" when each has one. It reads
  the inventory now.

### A class whose reason had gone, and nothing that would remove it

`scripts-are-classified.test.ts` filed six scripts under two headings that both existed **because
the deriver could not read a computed exit**: `computed-probe`, whose members were "absent from
`gate-sites.json` and counted under `excluded.computed`", and three batteries under `harness` on
the ground that each "has no verdict of its own". Measured, each of the three ends in
`process.exit(main())` and `main()` returns non-zero when its own checks fail.

Both headings are removed, the six scripts are now `probe` and `gate`, and `probe-category-inference.mjs`
-- the one member with genuinely no exit -- became a `tool`, because this register requires that
the classes with a failure exit be exactly the scripts the inventory names.

> **A class is a recorded decision, and the decision expires while the class does not.** The
> `computed-probe` heading carried its own justification in a doc comment four lines long, and
> nothing tied that justification to the thing it justified -- so it stood until somebody read it.

### Verified (Pass 49)

| gate | result |
| --- | --- |
| the inventory | **57 failure site(s) across 37 of 40 script(s)**; **49 proved, 6 exempt, 0 unannotated**; exclusions `{zero: 7, indirect: 3, multiline: 0}` |
| what the first re-derivation exposed | **7 unannotated sites** across six scripts, four of them batteries or probes the pipeline runs |
| the guards that refused the change | `scripts-are-classified` (both directions), `probe-built-module-guards` (a probe's second exit stopped being a built-module guard), and `gate-sites-are-proven` on the two sites the deriver's own edit displaced |
| `core` test suite | **141 files, 3756 tests passed** (as of `56079af5f`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `56079af5f`) |
| repo test suite | **145 files, 3942 tests passed** (as of `56079af5f`) |
| `typecheck` / `lint` / `docs:check` | green |

### A green local run and a red CI, and the reading that separated them

The first push of this pass failed CI in `build / typecheck / lint / coverage`, with **every test
passing on the runner**:

```
Test Files  140 passed (140)
     Tests  3756 passed (3756)
    Errors  1 error

Vitest caught 1 unhandled error during the test run.
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
```

The suite was green and vitest exited non-zero. Every case in `check-cli-reference.test.ts`
spawns the gate, the gate imports core's built `dist/index.js`, and one case costs about 2.3 s --
so the five cases this pass added took that file from ~21 s of serial work to ~32 s, and the
worker's RPC to the main process timed out under the accumulated update traffic. This machine is
faster, which is why the same run passed here.

The fix is a second test file rather than a wider timeout: it restores the parallelism the extra
cases were taking away, and the five moved to `cli-reference-backend-table.test.ts` with their
two helpers. **The number to read is `141 files` where the previous pass had `140`** -- one file
became two, which is what the green CI is a statement about.

> **A local green is not a reading about the runner.** That sentence is in
> `.github/workflows/ci.yml` beside the job budgets, and this pass is a second instance of it: a
> shared budget (here, an RPC timeout nobody had measured against) exhausted by work that is
> serial in one file and parallel across two.

### Open

- **`verify-gates-are-testable` reads its subjects from a filename prefix.** `gate-sites.json`
  now enumerates **37** scripts with failure exits; the hollowing check covers the **16** named
  `check-*.mjs`. The two mechanisms disagree about what a gate is, and the disagreement is
  invisible from either one alone. `[open: pointing the hollowing at the inventory's script set
  would take it from 16 subjects to 37, and the cost of that -- one vitest run per referencing test
  file, per subject -- has to be measured before it is paid rather than assumed to be affordable]`

## Pass 50 -- the audit's subjects are the property, and two preconditions it was missing

Pass 49 left one entry in this list: `verify-gates-are-testable` read its subjects from a filename
prefix, `gate-sites.json` enumerated 37 scripts, and the two mechanisms disagreed about what a
gate is. The entry named its own condition -- *the cost has to be measured before it is paid
rather than assumed to be affordable* -- so this pass measured it first.

### The measurement, taken before the change

| | prefix rule | inventory |
| --- | --- | --- |
| subjects | **16** | **37** |
| in one and not the other | 0 | **21** |
| named by at least one test file | 16 | **37** |
| `(subject, test file)` links | 63 | **146** |
| wall time, one full run | **51.26 s** | **103.96 s** |
| peak RSS | 171 MB | 561 MB |

The prefix set is a strict subset of the inventory's, so the change could only widen. Zero
NO-TEST among the 37 was measured before running, not after. The floor for one nested `npx vitest`
invocation was measured separately at **1.4-1.5 s regardless of whether it is handed one file or
five**, so the cost scales with subjects rather than with links -- and 21 more subjects for
**+52.7 s** in a job whose budget is 30 minutes is affordable on the evidence rather than on the
assumption.

**The verdict was the best available and not the one expected:** 37 caught, **0 survived, 0
no-test, 0 unattributed, 0 unparsable**, and `restored byte-for-byte: 37 of 37`. Twenty-one
scripts were fully covered by tests the whole time. Nothing was broken; **the instrument could not
see them**, which is a different defect and the one this audit exists to find in other people's
guards.

| the 21 newly-visible subjects | red tests |
| --- | --- |
| `fetch-official.mjs` | 37 |
| `gen-rcaeval-cases.mjs`, `score-fault-extraction.mjs` | 20, 15 |
| `apply-pins.mjs`, `verify-gates-are-testable.mjs` | 15 each |
| `build-example-bundle.mjs`, `gen-examples.mjs`, `derive-fault-golden.mjs` | 10, 13, 13 |
| `inject-stability.mjs`, `inject-component-rule.mjs`, `inject-m1-ceiling-tests.mjs` | 7, 3, 3 |
| `probe-m1-ceiling.mjs`, `probe-agreement-baseline.mjs`, `probe-denial-inventory.mjs` | 3, 3, 3 |
| `measure-doc-counts.mjs`, `verify-example-pack.mjs`, `verify-scorer-stability.mjs` | 4, 8, 9 |
| `derive-backend-support.mjs`, `derive-gate-sites.mjs` | 3, 5 |

### The defect the widening exposed, in the audit itself

Widening the subject list made `verify-gates-are-testable.mjs` a subject **of itself**, and its
own test file is named by it -- so between the first draft of the tests and the fix, the audit ran
on the real tree from inside its own nested suite, recursively. The working tree was found with
**twelve scripts left hollowed, eight of them carrying two or three `process.exit(0);` markers**,
and the journal's repair record held a hollowed file as its "original".

The mechanism is three links, and only the third is about the audit's code:

1. **A test ran the audit for real.** The only cheap way to ask the script what it measures was to
   run it, and running it recurses. `--list` is now that way, and no test on the real tree runs
   the audit.
2. **Killing a run does not kill its children.** `spawnSync`'s `timeout` kills its direct child and
   nothing below it, so the killed audit's `npx vitest` kept running and kept driving the audit --
   **five orphan `node (vitest N)` processes were observed still rewriting the tree minutes after
   the run they belonged to had died.** This is finding 172's lesson one process down the tree, and
   the reason the first listed precondition is what makes a surviving orphan harmless.
3. **The audit had no precondition and no owner.** It would measure a tree it could see was already
   mutated, and it would read whatever was on disk as the "original" to restore.

So two statements were added, both before anything is written:

- **A tree that is already hollowed is not the shipped tree, and measuring it measures nothing.**
  The marker the mutation writes is the marker the precondition reads, from one constant, so the
  two cannot drift; and because a hollowed "original" can no longer be journalled, the repair can no
  longer be a no-op reported as a repair.
- **Two runs cannot measure one tree at the same time.** The journal records a pid, so a holder that
  is alive makes the next run refuse (repairing under a live run would make *it* read a pristine
  gate and record SURVIVED -- a verdict about nothing) and a holder that was killed is taken over.
  The journal also became a **list** rather than one object, because two kills in a session
  overwrote each other, and a lock acquired with `openSync(..., 'wx')` closes the window the
  journal cannot see: it is empty between two subjects.

Both branches were mutation-checked rather than asserted: disabling the already-hollowed guard
fails exactly `refuses a tree that is already hollowed, rather than measuring one`, and disabling
the liveness test fails exactly `refuses while a live run holds the tree, and takes over from a
dead one`.

### Two more "second accounts", both found by running things

- **`derive-gate-sites.mjs`'s own header documented the rule it had stopped implementing.** It
  still said *"a call to `process.exit(...)` whose argument is the literal `1`"* and listed
  `process.exit(2)` and `process.exit(cond ? 0 : 1)` as deliberately not counted -- three paragraphs
  describing what finding 172 removed, unchanged for a whole pass, with nothing reading them. A
  script's prose about its own rule is as far outside the gates as a tracking document's status
  column.
- **A negative assertion is a mention.** The new test asserted that three scripts with no exit must
  not appear in the subject list, and writing their names in that assertion put them into the corpus
  `scripts-are-classified.test.ts` searches when it asks which scripts **no test file names** -- so
  an assertion that a script must not be a subject deleted one from another guard's evidence. The
  assertion is now over the property -- *every script whose source contains no `process.exit` must
  not be listed* -- and names nothing; and that guard's own claim was restated as what its
  instrument can support, since pinning the exact set would report a coverage change where only
  prose had changed.

### Acceptance

| gate | result |
| --- | --- |
| `verify-gates-are-testable`, full run | **37 subjects, 37 caught, 0 survived, 0 no-test, 0 unattributed, 0 unparsable**; **restored byte-for-byte 37 of 37**; 103.96 s |
| `gate-sites.json` | **60 sites across 37 of 40 scripts**; **54 proved + 6 exempt + 0 unannotated**; excluded `{zero: 8, indirect: 3, multiline: 0}` |
| the audit's own test file | **13 -> 16 tests** (subjects from the inventory both ways; a subject the prefix would miss; the already-hollowed refusal; the live-holder refusal and the dead-holder takeover) |
| `scripts-are-classified.test.ts` | the same claim restated over mentions, and it no longer names a script in a negative form |
| `core` test suite | **141 files, 3761 tests passed** (as of `3148b9410`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `3148b9410`) |
| repo test suite | **145 files, 3947 tests passed** (as of `3148b9410`) |
| `typecheck` / `lint` / `docs:check` / `docs:counts:check` | green |
| CI | run `38924872859` on `7c8561db0` -- **four jobs, all success**; the audit's step **153 s on the runner against 103.96 s here** |

### The budget, measured twice, because one run is not a measurement

The audit's step is the one that changed, and on the runner it went from a step nobody had timed to
**153 s** -- 1.5x the local figure, a ratio only a runner can give you.

The job that hosts every battery is where that lands, and **four runs of this same tree** measured it
at **1375 s**, **1164 s**, **1423 s** and **1059 s** of its 1800 s budget. Same work, a spread of
**364 seconds**.

The planning number is **the largest observed: 1423 s, 79%**, because a budget is exhausted by the
worst run and not by the average. The spread is an estimate of a distribution that more runs can widen
and cannot narrow, so the honest form is *at least* this wide rather than *exactly* this wide.

This paragraph was corrected **three times**, and each correction is the same mistake one sample
smaller. It first wrote `1375 s` down as *the* figure; then reported two samples (`1375`, `1164`) and
called the margin seven to ten minutes; then reported three (`1375`, `1164`, `1423`) and called it two
thirds to four fifths -- and **the fourth run came in at 1059 s, below the floor of that claim**, from
CI, an hour later, for free. Every version was falsified by the next run, and only the version that
names the worst case and says the range can widen is not a sample dressed as a measurement. Finding
166 is this file's record of a budget being exceeded; this is the same file failing four times to say
what a budget measurement is.

### Open

- ~~**`verify-gates-are-testable` reads its subjects from a filename prefix.**~~ **Closed by finding
  173.** The audit takes its subjects from `gate-sites.json`, and the tie is asserted in both
  directions against the real tree rather than by pattern-matching the source: 37 subjects, all 37
  caught, 37 of 37 restored byte-for-byte.
- **The batteries job's worst observed run is 79% of its budget, and four readings of one tree span
  364 s.** Measured on the runner: the audit's step is **153 s** for 37 subjects where it was a step
  nobody had timed for 16, and the job that hosts every battery took **1375 s**, **1164 s**,
  **1423 s** and **1059 s** of its 1800 s on the same tree. Plan with 1423 s. `[open: the last time a
  budget in this file was exhausted the run read as `cancelled` rather than as a limit (finding 166),
  and splitting the audit into its own job is the shape that would buy the margin back -- at the cost
  of a fourth job's checkout, install and build, which is a price this pass did not measure]`
- **A killed run leaves its nested suite behind.** Measured, not inferred: `spawnSync`'s timeout
  killed the audit and five `npx vitest` grandchildren kept running. `[open: the audit's first
  precondition makes a surviving orphan harmless -- it refuses instead of measuring -- but the
  orphan still runs for minutes, holding a CPU and re-reading a tree that is being edited, and
  nothing names it. A nested run in its own process group, killed as a group, is the shape that
  would fix it, and it is a change to how the audit spawns rather than to what it measures]`
- **Nothing in this tree has ever been pointed at a backend it did not write.** Carried from pass
  48 for the third time, and re-signed rather than repeated: the fixture replies to all six readers
  in shapes this repository chose, so what the six readers are tested against is one author's
  reading of six APIs, and every reader in the tree is certified by a document rather than by a
  service. `[open: two of the six were driven against real deployments once, by hand, in passes 44
  and 45, and what that cost was a running service -- so the question this entry keeps asking is
  whether a job can stand one up, and it has been asked three times without an answer]`
- **The tracking documents' status columns are outside every gate in this repository.** Unchanged
  from pass 48, and this pass found a second instance of the same shape *inside* the tree: a
  script's header describing the rule its own function had stopped implementing. `[open: holding
  those columns to anything would need either a cross-repository check or the same facts mirrored
  where a gate can reach them, and neither is obviously the right shape yet]`

## Pass 51 -- a run that dies leaves nothing behind: not the mutation, and not the process

Pass 50 left this entry: *a killed run's nested suite keeps running for minutes, holding a CPU and
re-reading a tree that is being edited, and nothing names it.* Its fix was named as "a change to how
the audit spawns", and three measurements decided what shape that change could take.

### The three measurements that decided the shape

| measured | result | what it settled |
| --- | --- | --- |
| `spawnSync(…, { detached: true })` | the child's pid **is** its own group id | a group can be made and later signalled without touching this process |
| what is in a group | the leader **and its children** -- the first experiment's group held a `sleep` that a pid-only kill would have left | stop the group, not the pid |
| `spawnSync` and the child's pid | returned only **after the child exits** | the current spawn cannot name its suite while the suite is running, which is the only moment the name is worth having |

The third is the one that changed the code rather than adding to it. `runTests` is now `spawn` +
`await`, so the group is known while it runs; `detached` puts it in a group of its own; and the
journal entry for the file being mutated is completed with `suite` a few milliseconds after the
mutation begins.

### Three mechanisms, for three ways to die

The file already had two -- a journal for a run that was killed, and a precondition for a tree a
survivor has left mutated. It now has three, and each is written down with the case the others
cannot cover:

- **A signal** is cleaned up by `interrupted`, which stops the suite, puts the file back and exits
  non-zero. `JOURNAL`'s header has recorded since finding 148 that a handler "does not work", with
  the reason: during a `spawnSync` the event loop is blocked, so it cannot run until the child it is
  waiting for has exited, which is exactly where the kill arrived. **That was a fact about blocking,
  read as a fact about signals** -- awaiting the child frees the loop, and the handler that was
  abandoned for two passes now does the whole sweep.
- **A SIGKILL** cannot be handled by any process, so the journal carries the group and the next run
  stops it before repairing the file.
- **A survivor of either** is made harmless by the precondition on the tree, which is what turns a
  twelve-file corruption into a failed run.

The group is checked against **what it is running** before anything is signalled, and the check
refuses more often than it kills: a group id is reused, so a recorded number can name somebody
else's group an hour later, and a script that signals whatever a stale record points at is worse than
one that leaves an orphan. Two refusals are proved rather than asserted -- a decoy group is left
alone, and the group the audit is *in* is left alone, which is the catastrophic case because a signal
there would take down the shell and the runner with it.

### What an experiment found that reading the code did not

`stopSuite` begins with two guards, and the first version of the second one returned in **silence**
for a value that is neither a usable group nor the documented `null`:

```
if (!Number.isInteger(group) || group <= 0) return false;
```

The comment above it said *every refusal is reported, because a sweep that declines in silence cannot
be told apart from one that found nothing.* The code did not do what the comment said, and what found
it was a **test passing for the wrong reason**: the sandbox handed the audit a group id through a
`sed` substitution, the placeholder was inside quotes, and the result was the string `"96828"` rather
than the number `96828` -- so the guard declined silently, the own-group branch was never reached, and
the test timed out instead of failing. Fixing the test exposed the contradiction; both are fixed, and
the malformed case now has its own test.

### The leak this pass made, in the way this pass is about

One test run left `packages/core/bystander.pid` in the repository. The wrapper played the audit's
part in a group whose members the test could watch, and wrote its bystander's pid **by relative
path** into whatever directory the runner happened to have -- the package, not the sandbox. It was
found by `git status`, which is also how finding 173's twelve-file corruption was found:

> **The measurement that finds a leak is not the verdict; it is the working tree.** Two passes in a
> row have now paid for that sentence, and neither leak was visible in any gate's output.

### Acceptance

| gate | result |
| --- | --- |
| the audit, full run against the real tree | **37 subjects, 37 caught, 0 survived, 0 no-test, 0 unattributed, 0 unparsable**; **restored byte-for-byte 37 of 37**; **108.43 s** (103.96 s before this pass) |
| orphaned processes after that run | **none** |
| mutation checks, one per new guard | **5 of 5 CAUGHT**, each by exactly its own test: same-group spawn, no reap, no identity check, no own-group guard, no signal handler |
| `gate-sites.json` | **61 sites across 37 of 40 scripts**; **55 proved + 6 exempt + 0 unannotated** |
| the audit's own test file | **16 -> 22 tests** |
| `core` test suite | **141 files, 3767 tests passed** (as of `e9e87e9e0`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `e9e87e9e0`) |
| repo test suite | **145 files, 3953 tests passed** (as of `e9e87e9e0`) |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- ~~**A killed run leaves its nested suite behind.**~~ **Closed by finding 174.** The suite runs in
  a group of its own, the group is written down before it can outlive the run that started it, a
  signal is cleaned up on the spot, and a SIGKILL is cleaned up by the next run -- with the group's
  members checked before anything is signalled.
- **The journal cannot name the suite for the few milliseconds before it exists.** The entry is
  written before the mutation and completed after the `spawn` returns, so a kill inside that window
  leaves a file the next run repairs and a suite it cannot name. `[open: the window is written down
  rather than closed, and closing it would mean writing the record before the thing it records --
  which would need a name for the suite that does not exist yet]`
- **No reader is driven against a real deployment by CI.** Unchanged from pass 48: the fixture
  server answers all six shapes faithfully, and it is this repository's reading of six APIs rather
  than the APIs themselves. `[open: a real deployment is what would turn a reader from answering
  our fixture into answering the backend, and it needs either a service to point at or a way to
  stand one up inside the job -- neither of which this repository has today]`
- **The batteries job's worst observed run is 79% of its budget, and four readings of one tree span
  364 s.** Unchanged from pass 50, except that the audit now costs 108 s locally where it cost 104.
  `[open: the numbers are in pass 50; the job gains a battery every few passes, and splitting this
  audit into its own job is the shape that would buy the margin back at a price nobody has measured]`

## Pass 52 -- one reader, against a server this repository did not write

This entry had been carried since pass 48, and the reason it survived three passes was written on
it: the six readers are certified by a fixture **written by the same author**, so what that
certifies is one reading of six APIs, and the fix "needs either a service to point at or a way to
stand one up inside the job". What made it cheap was a measurement rather than a decision.

### The measurement that made it cheap

`prometheus` is a **distribution package**, and on this machine it is already installed at
**2.45.3+ds-2ubuntu0.3** -- the version finding 154 measured by hand, and the sandbox is Ubuntu
24.04.3, the same distribution as `ubuntu-latest`. So the service this entry kept asking for costs
`apt-get install` and no download, and the reader answered it on the first try:

```
ok: true | signals: 1 | quarantine: 0
{ "resource": { "service.name": "prometheus" }, "payload": { "kind": "metric", "name": "up", "value": 1 } }
```

### The first run of the gate failed, and it is the finding

The gate's first version waited for `/-/ready`, then asked. It failed in **0.20 seconds** with
`the reader produced no signal ... Quarantined: nothing` -- about a server that was working. The
three questions it could have waited for are not the same question:

| asked | first true |
| --- | --- |
| `/-/ready` | **0.0 s** |
| an instant query for the same metric | **4.9 s** |
| the range query the reader actually makes | **5.5 s** |

The 0.6-second gap between the last two is exactly where the gate landed. This is the oldest shape
in this campaign one layer out -- **a mechanism's check read as the property's check** -- and it
is the third time this pass alone: closing the readers' gap needed a question the readers do not
ask, and the warm-up needed the question the readers *do* ask.

The second thing the same run taught: a server that answers `200` with **HTML** is not warming up,
it is the wrong address. The first version could not tell those apart and waited its whole budget
for a web console to become an API. An empty window is worth waiting for; a body that is not JSON
is not.

### What the gate is

`scripts/verify-reader-against-backend.mjs`: it finds the binary on `PATH` (no shell), takes a free
port by binding and releasing it, writes a scrape config that labels the target with
`service: prometheus`, starts the server **detached** so its whole group can be stopped, waits for
the range form of *the query it is about to make*, reads it through `pullPrometheusMetrics`, reads
it again with a label the server does not set, stops the server, and waits for the port to stop
answering before it reports anything.

The version it prints is the one **the server said** -- `prometheus_build_info`'s own `version`
label, read through the reader -- and two tests hold that: one asserts a version the stand-in
invents appears in the output, and one asserts two runs against two servers report two different
versions. A constant in the script passes the first and fails the second.

The negative control is the half a fixture cannot supply. A fixture contains the labels its author
chose, so "the reader quarantines a series with no service" is not something a fixture can fail at
honestly. Against the real server the gate reads the same series twice, once with `service` and
once with `not_a_label_this_server_sets`, and requires **zero signals and a quarantine** the second
time. The first run of this check against the real server, before the config labelled anything,
quarantined `prometheus_build_info` for exactly this reason -- which is what made the control
possible rather than an obstacle to it.

### What it does not establish

- **Five of the six readers.** One is not six, and `docs/architecture.md` now says which degree of
  evidence each reader has.
- **A deployment's configuration.** The server here scrapes itself with a label the gate writes.
  What is certified is that the reader meets the real query API, not that it meets anybody's
  Prometheus.
- **That the fixture was wrong.** The fixture answers a different question, thousands of times a
  day, and it stays.

| gate | result |
| --- | --- |
| the gate, against the real distribution server, three runs | **OK**, `prometheus 2.45.3+ds`, 1 real signal, and none without the label; **5.87 s / 6.88 s / 7.09 s** |
| processes left behind, checked after every run | **none** |
| the gate's own tests | **12**, every failure exit and both refusals proved, including a stand-in that ignores `SIGTERM` (the gate cannot stop it, and must say so rather than report a verdict) |
| `gate-sites.json` | **63 sites across 38 of 40 scripts**; **57 proved + 6 exempt + 0 unannotated** |
| `core` test suite | **142 files, 3778 tests passed** (as of `98d9a3c`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `98d9a3c`) |
| repo test suite | **146 files, 3964 tests passed** (as of `98d9a3c`) |
| `typecheck` / `lint` / `docs:check` | green |
| CI | run `38987237960` on `4bb688f6d` -- **four jobs, all success**, and the two new steps ran on the runner: **15 s** to install the backend and **7 s** to read it |

### What the runner said, and why the reading is the point

The two new steps measured **15 s and 7 s** on the runner, and the second number is the interesting
one: locally the gate costs 5.87-7.09 s, so the runner is not slower at all. That is not a
coincidence and it is worth writing down -- **the gate's cost is the server's warm-up, not the
machine's speed**, because the four seconds it spends waiting are four seconds of a Prometheus
starting up on any hardware. The install is the part that is a download.

The job that hosts them went from roughly two minutes to **153 s of its 15-minute budget** across
earlier readings, so the pair costs a fraction of the margin that job has.

### Open

- ~~**No reader is driven against a real deployment by CI.**~~ **Closed for one of six by finding
  175.** Prometheus is read from the distribution's own server in the `verify` job, on every push,
  in a step that took 7 s on the runner.
- **Five readers are still certified by a fixture written by the same author.** `[open: the same
  shape as the entry this pass closed, five times over, and the cost is now known to be "a service
  that can be installed" rather than "somebody stands something up" -- Jaeger, Loki, Elasticsearch
  and Kubernetes are the four, and ClickHouse is the one that was measured by hand and nothing
  re-measures]`
- ~~**The gate's own cost in the job is the apt install, which has not been measured on the
  runner.**~~ **Closed in this pass by the run itself**: 15 s for the install, 7 s for the gate, and
  the job at 153 s of 900. The next entry that needs these numbers has them.
- **The journal cannot name the audit's nested suite for the few milliseconds before it exists.**
  Unchanged from pass 51. `[open: written down rather than closed, and closing it would mean naming
  a process before it exists]`

## Pass 53 -- the official metric was never checked against the official code

This pass started from the roadmap rather than from its own Open list. `04-里程碑与路线图.md` has
one unchecked item under M2:

> **Golden Master 复现 RCAEval `BARO@re2-tt = [0.72, 0.99, 1, 0.83, 0.64, 0.8]`**

Six numbers. Before deciding it was blocked, this pass measured what they are.

### What that vector is, and the two ways it cannot be reproduced

Upstream's README, in the section that shows how to reproduce it:

> "in Table 6, BARO achieves **Avg@5** of 0.72, 0.99, 1, 0.83, 0.64, and 0.8 for CPU, MEM, DISK,
> SOCKET, DELAY, LOSS, and AVERAGE on the Train Ticket dataset"

**Six numbers against seven labels.** The expected-output block immediately below is the artefact
rather than the prose, and it says:

| fault | Avg@5 |
| --- | --- |
| CPU | 0.72 |
| MEM | 0.99 |
| DISK | 1.0 |
| SOCKET | 0.83 |
| DELAY | **0.63** |
| LOSS | 0.64 |

No AVERAGE row, and DELAY is 0.63 rather than the 0.64 a reader gets by pairing the prose's list
in order. So the vector in the roadmap dropped DELAY entirely and took the mean (0.8) for LOSS --
**it is a transcription of upstream's prose, not of upstream's output**, and upstream's prose is
wrong about its own table.

The second way is more fundamental: `Avg@5` is a **solver's** accuracy. BARO is a method that
ranks candidate root causes; reproducing its number means running BARO. This product builds
corpora, exports them and scores submissions -- it does not solve RCA. The exit condition asks the
benchmark factory to be a contestant.

> **An exit condition that names a number the product cannot produce is not an unfinished item.**
> It is an item that will sit unchecked forever, and read as a backlog for exactly that long.

### What the product can hold instead

The property that *is* ours: **our scorer computes the same number as upstream's scorer, given the
same input.** That had never been checked. `officialMetric('rcaeval-re2')` carries the rule as a
prose quote and a `source` string, and the implementation below it was a transcription -- by the
same author, from the same reading, with nothing to disagree with.

So this pass ran **upstream's own `Evaluator`**. Its files were read at a commit
(`259ea4167160256a74ad30004aa3d96a998c846e`) and pinned by sha256; `RCAEval/utility.py` is the one
file supplied by the harness, because `evaluation.py` imports `dump_json`/`load_json` and never
calls them while the real utility package pulls pandas, sklearn, requests and tqdm. Every number in
the new record is upstream's.

**317 case sets, 6162 cases, and 29 of them disagreed** -- all of them on `avg5`, all by exactly
**0.01**, in both directions:

| set | ours | upstream | averaging the rounded rates gives |
| --- | --- | --- | --- |
| `random-40-n29` | 0.49 | **0.48** | 0.49 |
| `random-54-n7` | 0.48 | **0.49** | 0.48 |
| `random-105-n3` | 0.26 | **0.27** | 0.26 |
| `random-137-n16` | 0.42 | **0.41** | 0.42 |

The five `AC@k` values agreed in **all 317 sets**. The defect was in one line: `avg5` was the mean
of the per-k rates **after** each had been rounded to two decimals, while upstream averages the
exact rates and rounds once. The repository already knew this rule -- finding 156 records that *"a
mean written beside a distribution rather than computed from it is a second number that can
drift"*, and `check-roundtrip-record.mjs` asserts exactly that of the score block -- and this was
the one place it was broken.

**Why no existing gate could have found it.** The only RCAEval corpus this project has ever scored
is an oracle export: 375 cases, every one perfect, so every rate is exactly 1 and the two averages
are equal by construction. The bug was invisible on every input that has ever run, and its first
symptom would have been a user's partial-rerank submission being reported one point off.

### The record, and why each entry says what it is for

`golden-master/rcaeval-evaluator.json` holds **86 sets**: the 17 designed ones, the 29 that
disagreed, and 40 controls that agreed. Each carries `kind`, and the test asserts that every
`disagreed` entry still separates "average the rounded rates" from "round the average". Without
that assertion the whole file could be satisfied by a set of perfect cases -- which is precisely
the situation that let the bug live.

The record also states the two divergences it does **not** reproduce: an empty corpus scores 0 here
and prints nothing upstream (a deliberate convention, tested in `official-no-denominator.test.ts`),
and a case whose service did not parse counts as a miss here and can be a hit upstream (reachable
only through an export the structural gate rejects).

### The citation was to a repository with no `main`

`officialMetric('rcaeval-re2').source` read `cruiseresearchgroup/RCAEval`. Measured:

| | `cruiseresearchgroup/RCAEval` | `phamquiluan/RCAEval` |
| --- | --- | --- |
| default branch | `v2` | `main` |
| last push | 2026-02-17 | 2026-09-29 |
| stars | 0 | 242 |
| `evaluation.py` | 2,077 bytes | 8,463 bytes |

Both copies compute the same `accuracy(k)` and `average(k)` -- read side by side to be sure -- so no
number was ever wrong. But the corpus registry, the README whose numbers this metric claims to
reproduce, and the branch that is still moving all point at the other repository, and nothing
compared the two accounts. The citation now names the repository the record was taken from, and a
test holds the two strings to each other.

### Acceptance

| gate | result |
| --- | --- |
| the differential search | **317 sets / 6162 cases** against upstream's `Evaluator`; **5 of 5 AC@k agreed everywhere**, **29 sets differed on `avg5` by 0.01** before the fix, **0 after** |
| `golden-master/rcaeval-evaluator.json` | **86 sets / 1506 cases**; 17 `design` + 29 `disagreed` + 40 `control`; provenance carries the commit and the sha256 of both upstream files, and a six-step reproduction recipe |
| `rcaeval-evaluator.test.ts` | **6 tests**: the record is worth holding (counts, kinds, >1000 cases), the provenance is complete, the citation names the same repository, every pinned verdict reproduced, every `disagreed` entry still separates the two readings, and both divergences stated |
| mutation checks, one per guard | **3 of 3 CAUGHT**: averaging the rounded rates again, a per-k denominator off by one, the citation back to the other repository |
| `core` test suite | **143 files, 3784 tests passed** (as of `4369140`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `4369140`) |
| repo test suite | **147 files, 3970 tests passed** (as of `4369140`) |
| `typecheck` / `lint` / `derive-gate-sites --check` | green |

### Open

- **The other eight targets are still transcriptions.** OpenRCA 1.0/2.0, RCA100, AIOps2025,
  Cloud-OpsBench and ITBench each carry a prose rule and a `source` string, and only RCAEval is now
  held to code somebody else wrote. `[open: two of those six quote a paper rather than a released
  evaluator, so there may be nothing to run -- which is a different and equally worth-writing
  answer, and it has not been established which targets have a runnable oracle]`
- **The record cannot be regenerated inside CI.** It needs upstream's source, which is fetched by
  hand and pinned by digest; the recipe is in the record, but nothing runs it. `[open: a job that
  re-fetches the two files and re-runs the generator would turn the pin into a drift detector, at
  the cost of a network dependency in a gate -- and the value depends on how often upstream's
  evaluator changes, which is a number nobody has measured]`
- ~~**The roadmap's M2 exit condition asked for a contestant's score.**~~ **Closed by finding
  176**: corrected in `04-里程碑与路线图.md` and in the acceptance table of
  `03-验收计划与验收标准.md`, and the vector it quoted is recorded as unproducible rather than
  pending -- it drops DELAY and reads upstream's average as LOSS.
- **Five readers are still certified by a fixture written by the same author.** The one time an
  outside implementation was consulted -- upstream's evaluator, this pass -- it found a defect that
  seven passes of self-consistency had not, which is the argument. `[open: Jaeger, Loki, Elasticsearch
  and Kubernetes need a server the sandbox cannot currently obtain, and ClickHouse needs 253 MB
  through a channel that is timing out today; the four are unchanged, and the measurements that say
  so are in pass 52's cost table rather than in a hunch]`


## Pass 54 -- the check existed, the wiring was attempted, and the pipeline refused it

This came out of pass 53's own bookkeeping. Every pass updates
`golden-master/doc-counts.json` by hand, and the question that had never been asked is **what
fails if that update is forgotten**.

### The hole, stated exactly

| question | who answers it | in CI |
| --- | --- | --- |
| do the documents agree with the snapshot? | `check-doc-counts.mjs`, inside `docs:check` | **yes** |
| does the snapshot agree with the suite? | `measure-doc-counts.mjs --check` (`docs:counts:check`) | **no** |

`grep -n 'counts:check' .github/workflows/ci.yml` returned nothing. A snapshot that drifts in
**both** places at once -- somebody adds tests and forgets the number -- leaves every document and
every guard internally consistent and wrong, with the pipeline green.

That is not hypothetical: pass 52 found the snapshot at **139 files / 3686 tests** against a suite of
**140 / 3747**, with every gate green, and found it by reading two numbers side by side.

### The attempt

One step in the `verify` job, measured at **80.09 s** locally against a job at 153 s of its 900 s
budget, plus two tests in the file that already owns the routing rule:

- the workflow must `run: pnpm docs:counts:check`, anchored to a `run:` line, because that file's
  own header records the break where a **comment** satisfied a bare `includes`;
- the package script must point at `measure-doc-counts.mjs **--check**`, not at the writing mode --
  a check that rewrote the snapshot would green-light exactly the drift it was added to report.

Mutation-checked locally: deleting the step failed **exactly one** test and left the other eight
green.

### What the pipeline said, and why it is not "flaky"

CI failed the step, and the reason is not the counts:

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
Error: Command failed: pnpm --filter @rca-bench-factory/core test
    at measure (scripts/measure-doc-counts.mjs:103:17)
```

**Every test passed.** The step runs the whole suite a **second time** in the same job -- the
coverage step already ran it once -- and on a two-core runner the worker RPC to the main process
timed out under the accumulated update traffic. Vitest exits non-zero for an unhandled error even
when the suite is green.

This is pass 49's failure with a different cause. There, the trigger was one test file that spawned
the CLI per case (32 s of serial work), and the fix was to split it. Here the trigger is
**repetition of a suite that is already at the edge of that budget**. The same error message, and
the same wrong lesson available: it looks like a flake, and calling it one would have meant a retry
button instead of a measurement.

### The decision, on evidence

**The wiring was reverted.** What remains is the finding, the measured price, and the precise
constraint:

| reading | value |
| --- | --- |
| `docs:counts:check` alone, locally | **80.09 s**, OK |
| the `verify` job before the step | **153 s** of 900 |
| the suite run a second time in that job, on the runner | **`onTaskUpdate` timeout**, suite green |

The shape that would work is not another job and not a retry: it is **reading the run the job
already took**. `measure-doc-counts.mjs` runs each package separately today (`--filter core test`,
`--filter cli test`) precisely so it can attribute counts; the coverage step produces one combined
transcript, so reusing it needs per-package attribution from a single log -- a change to both
scripts, and one that is verifiable locally instead of only on a runner.

### The leak this pass found in its own tooling

The thirteen batteries were running when the session ended. The process died inside
`inject:fault-extraction-scoring`, and `packages/core/src/fault/extraction-scoring.ts` was left with
a seven-line guard **deleted** -- found by `git status`, restored, and then the battery was re-run
(12 of 12 caught).

Nothing repairs that: **no battery writes a journal**, and each takes its backup with
`shutil.copy(SRC, PRISTINE)` at start -- so a run that begins before somebody reverts **copies the
mutated file into the pristine slot**, then certifies `source restored: identical to the pristine
capture`, which is true and worthless. Finding 173's defect, one layer out: the audit got a journal
and a precondition; the batteries that mutate a dozen source files did not.

### Acceptance

| gate | result |
| --- | --- |
| the attempt | step + 2 tests, mutation-checked locally (deleting the step fails exactly one) |
| CI on the attempt | **failed**: `onTaskUpdate` timeout on the second suite run, every test green |
| the revert | `ci.yml` and the routing test are back to 7 tests; the hole is **open and recorded** |
| `core` test suite | **143 files, 3784 tests passed** (as of `209d20e`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `209d20e`) |
| repo test suite | **147 files, 3970 tests passed** (as of `209d20e`) |
| batteries | **13 of 13, rc=0**, after restoring the mutation the interrupted run left behind |
| `typecheck` / `lint` / `docs:check` / `docs:check:cold` | green |

### Open

- **The counts snapshot is still not compared to the suite in CI.** `[open: the attempt is measured
  and rejected -- a second full suite run in the same job trips `onTaskUpdate` on a two-core runner
  with every test green. The shape that would work is reusing the coverage run's transcript, which
  needs per-package attribution from one log; that is locally verifiable and is the next step here,
  rather than a retry or a fifth job]`
- **A killed run leaves every battery's mutation behind, and the next run adopts it as pristine.**
  Measured in this pass: one file, seven lines, left by `inject:fault-extraction-scoring`. No battery
  writes a journal, and `shutil.copy(SRC, PRISTINE)` at start means a run that begins before somebody
  reverts copies the mutation into the pristine slot and then certifies it. Finding 173's defect one
  layer out. `[open: the shape is known because finding 174 built it for the audit -- journal before
  the mutation, repair at start, refuse a mutated tree -- and it needs a shared helper the twelve
  Python batteries call, which is a change to the battery protocol rather than to any one battery]`
- **The snapshot is still a number somebody types.** Nothing generates it. `[open: generating it
  means writing a tracked file from CI, which is a change to how the repository is maintained rather
  than to what it checks]`

## Pass 55 -- a killed battery left a mutation, and the next run adopted it as pristine

Pass 54 recorded the leak it walked into: the thirteen batteries were running when the session
ended, the process died inside `inject:fault-extraction-scoring`, and
`packages/core/src/fault/extraction-scoring.ts` was left with a seven-line guard deleted. That was
the second time -- finding 173 found **twelve** files in the same state -- and both times the only
thing that noticed was `git status`.

### The half that made it permanent

A battery does not merely leave a mutation. Each one captures its backup **at start**:

```python
shutil.copy(SRC, PRISTINE)
...
shutil.copy(PRISTINE, SRC)      # after every injection
...
assert_source_restored()        # compares SRC against PRISTINE
```

So the next run, starting before somebody reverts, **copies the mutated file into the pristine
slot** and then certifies `source restored: identical to the pristine capture`. The check is true
and worthless -- finding 173's `repairFromJournal` defect, which compared a file against the bytes
it had just written, in a second place.

> **An assertion is only in force while the process that makes it is alive.** The reasoning that
> left this gap was "each battery asserts its own restore, so nothing else needs to". After a kill
> there is no process to make the assertion, and the backup slot is refilled by the next run's
> confidence.

### The experiment, run before the fix and again after

| step | measured |
| --- | --- |
| `inject:doc-counts`, **SIGKILL** its python process mid-loop | journal `battery-journal-87159.json` present; `scripts/check-doc-counts.mjs` one line mutated; process gone |
| the same battery again | stderr `_witnesses: repaired doc-counts-shapes (pid 87159 is gone), 1 file(s) put back`; then `12 caught, 0 survived, 0 inert`; journal gone; tree clean |

### `guard(label)`, and the four decisions in it

`scripts/injection/_witnesses.py`:

- **Repair at entry.** Every leftover journal is examined; the holder is identified by reading
  `/proc/<pid>/cmdline` and asking whether it is a battery at all -- **a pid is reused**, and this
  is finding 174's group-id lesson one identifier down. A dead holder's bytes are written back and
  **verified against the record**; a live holder makes the run refuse, because repairing under it
  would make *it* read a file it did not mutate.
- **Record subtrees, not names.** `scripts`, `packages/core/{src,test}`, `packages/cli/{src,test}`,
  `golden-master`: **270 files / 4.3 MB / 4 ms**. A hand-written subject list that forgets one file
  is the defect itself, so the record is deliberately larger than any battery needs.
- **Restore on the exception path**, including Ctrl-C, and clear the journal.
- **Do not restore on a normal exit, and do not leave a record either.** If the guard repaired on
  the way out, every battery's `assert_source_restored` would pass no matter what it did, and the
  check this repository spent a finding on would become vacuous.

  The second half was learned by being bitten, in this pass. The first version kept the journal when
  a file still differed, so the next run could repair a battery that forgot -- which meant a journal
  also outlived a run whose subject had been edited by a **person** while it ran. That is not
  hypothetical: `golden-master/doc-counts.json` was edited during a battery run here, and the next
  battery's repair put the old bytes back over the edit. A record taken at start cannot tell a
  battery's mutation from a person's edit, so it is dropped at a normal exit; a battery whose
  restore failed says so through its own assertion and a non-zero exit.

The ten Python batteries now run as `with W.guard("<name>"): return _measure()`.

**The three Node batteries do not, and the census cannot see them.** `inject-stability.mjs`,
`inject-component-rule.mjs` and `inject-m1-ceiling-tests.mjs` mutate tracked files and restore them at
the end of a loop, exactly like the Python ones -- but they carry no `INJECTIONS` table, and the
register in `batteries-verify-their-restore.test.ts` admits a file to its census by `table && writes`.
So they are outside both the guard and the census, and a kill during one of them leaves the same
mutation with **no record to repair from**. Stated here because the alternative is a sentence that
reads as "every battery is covered" while three are not.

### The second thing a kill leaves: the battery's own lock

`gate-tests-battery.py` -- the one that rewrites the gate scripts -- keeps a lock in `tmpdir` so two
copies cannot share the tree. Its own docstring says a SIGKILL leaves the file behind and the next
run refuses until somebody removes it, and calls that the safer failure.

It is safer than the alternative, and it is still a failure a retry cannot get past: the job that
was killed is exactly the job that will be retried, and it fails on a lock left by itself. Measured
here -- the run this session killed left `/tmp/rca-bench-factory-gate-tests-battery.lock` holding
pid 226480, and the next `gate-test-battery-attribution` run failed with **exit 3** and a message
telling a CI reader to `rm` a file.

The lock already writes the owner's pid into the file, so the question is answerable with the check
the journal already had: **is the owner still a battery?** A lock whose owner is gone is taken over,
and the takeover is printed; a live owner still refuses. The three tests that were failing on the
stale lock pass again, and the file gained a case for both halves.

### The leak this pass found in its own test

The first version of `battery-journal.test.ts` wrote journals into `node_modules/.cache` -- the real
one -- and its cases repaired each other's subjects. The failure it produced was a repair of a
subject belonging to a finished test. That is the same shape as the defect being fixed, one level
up: **a test's scratch escaping into the tree it measures.** The cache is now overridable through
`RCA_BENCH_BATTERY_CACHE`, and the test points it at its own directory.

A second guard caught the file too, and was right to: `coverage-writes-are-drained.test.ts` refuses
a test file that starts an asynchronous child without joining it. The two holders in these cases are
now killed and **awaited**, which is also what keeps the file from pushing coverage into the
reporter after its queue is drained.

### Acceptance

| gate | result |
| --- | --- |
| mechanism tests | **7**: a dead holder is repaired, a live battery is refused, a recycled pid is not a holder, an unverifiable repair fails, an exception restores, **a normal exit neither repairs nor leaves a record**, and a lock whose owner is gone is taken over |
| mutation checks | **5 of 5 CAUGHT**, each by exactly its own test |
| the wiring, asserted | `batteries-verify-their-restore.test.ts` gained `guardsWithJournal`; **deleting any battery's guard turns it red** |
| the end-to-end experiment | SIGKILL -> repair -> `12 caught`, tree clean (table above) |
| `core` test suite | **144 files, 3792 tests passed** (as of `d43a2d9`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `d43a2d9`) |
| repo test suite | **148 files, 3978 tests passed** (as of `d43a2d9`) |
| batteries | **13 of 13, rc=0**; the ten Python ones run inside the guard, the three Node ones do not |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- ~~**Three Node batteries are outside the journal, and the census cannot see them either.**
  `inject-stability.mjs`, `inject-component-rule.mjs` and `inject-m1-ceiling-tests.mjs` mutate tracked
  files without an `INJECTIONS` table, which is the register's admission rule -- so their absence is
  invisible rather than recorded.~~ **Closed by finding 179.** The guessed repair -- "admit a file by
  *writes a tracked path and restores it* rather than by a table" -- was wrong, and it was wrong in a
  way worth keeping: every generator in `scripts/` writes a tracked path, so that rule would have
  admitted twelve tools and called them batteries. The table was never the problem; the *case* was.
  The rule is case-insensitive now, and admitting the three files made the census report four more
  defects it had never been able to see.
- **A kill plus a concurrent edit is still ambiguous.** A normal exit now drops the record, so an
  edit made during a run survives. But a *kill* leaves the record, and if a person edited a guarded
  file in the same window the repair will revert that edit. Narrow, and not reachable from CI.
  `[open: the shape that would close it is recording at write time instead of at start -- one more
  IO per injection, at 25 write sites -- and it needs a decision about what a record means when the
  writer is a person]`
- ~~**The counts snapshot is still not compared to the suite in CI.**~~ **Closed by finding 180.**
  Pass 54 was right that the obvious wiring fails and wrong about what it needed: not a transcript
  to parse, but a **report vitest already writes**. `test:coverage` now emits its JSON report, and
  `--from` derives the same three scopes from it in **0.056 s** against the spawn's **77.35 s**.
- ~~**Eight score targets are still transcriptions.**~~ **Narrowed by finding 181**: OpenRCA 1.0 is
  now held to `main/evaluate.py` over 28 cases, and the transcription it replaced was wrong on 10 of
  the first 25. Seven remain.

## Pass 56 -- the census could not see three batteries, and "could not see" was the finding

### The item was a sentence, and a sentence is not an instrument

Pass 55 ended with a paragraph saying that three batteries were outside the journal *and* outside the
census, because the census admits a file by a mutation table and those three had none. That is a
true sentence. It is also the shape this campaign keeps finding: **a hole that is documented reads
like a hole that has been dealt with.** Nothing failed when those three were killed; nothing failed
when they were wired, either -- the wiring was invisible to every rule in the repository.

So the subject of this pass is not "add a journal to three files". It is: *why could a census built
to catch exactly this not see three of thirteen?*

### What the admission rule was keyed on

```js
const hasTable = /\b(INJECTIONS|MUTATIONS|mutations)\s*[:=]/.test(source);
```

Three spellings, and the third is the lowercase form of one of the first two, which means the
alternation was never about case -- it was a list of the words somebody had typed. All three
JavaScript batteries write `const injections = [`. One character of regex stood between ten batteries
and thirteen, and no amount of reading the rules would have shown it, because the rules are stated
*over the set*.

With `/i`, the census reported four more defects in those three files, and each is a rule that had
been written against the file in front of its author:

| rule | what it was reading | what the files say |
| --- | --- | --- |
| the restore verdict gates the exit | a *bare* `restored = ...` | `const restored = ...`, and `const mismatched = ...` in one of them |
| the battery runs inside the journal | `W.guard('...')` | `withJournal('...')` |
| the backup is outside the tree | any `.bak` anywhere in the source | `node_modules/.cache/extraction-scoring.bak.ts`, which is the recommended location |
| the record's label is the battery's name | `name.slice(0, -3)`, which strips `.py` | `.mjs` is four characters, so the label was `inject-stability.` |

The last one was introduced *while fixing the third*, one line lower in the same object literal. That
is the most useful thing in the table: the failure mode is not carelessness, it is that a rule
inherits the shape of its first subject and then looks general.

### The fifth defect, which no rule was asking about

Two of the three batteries captured their subject while the module loaded:

```js
const suiteOriginal = readFileSync(SUITE, 'utf8');   // runs before withJournal is called
```

Everything about the guard was correct and this one line would have defeated it. A battery that reads
at load time captures whatever a killed run left, mutates from that, and writes it back as "the
original" -- and then prints `source restored: identical to backup`, because it is. Finding 173's
defect wearing the repair, and it would have shipped in this pass if the wiring had been the whole of
it. The census now has a rule for it (`readsBeforeTheRepair`), and the rule is proved by putting the
line back: red.

### The handler that was written, measured, and deleted

`journal.mjs` first installed `SIGINT`/`SIGTERM`/`SIGHUP` handlers that restored and re-raised. It
looked like a strict improvement on the Python side, which only gets Ctrl-C for free. Then a
three-line experiment:

```
process.on('SIGTERM', restore);  execFileSync('sleep', ['5']);
---------------- SIGTERM sent here ----------------
stderr: (nothing)     exit 0     handler never ran
```

A Node signal callback runs on the event loop, and a battery's entire mutation window is spent
blocked inside `execFileSync`. The handler would fire between injections -- the interval that needs
it least -- and never during the sixty seconds that matter. That is worse than no handler, because it
invites the reader to rely on it.

> A guard that fires everywhere except the window it was written for is worse than no guard.

So the module has none, and the guarantee is the record on disk plus the next run. The test asserts
it in the state that matters: a child blocked in `Atomics.wait` is killed with SIGTERM, the tree stays
mutated, the record stays, and the next run repairs it.

### The end-to-end, with the real batteries

| step | measured |
| --- | --- |
| `node scripts/inject-component-rule.mjs`, **SIGKILL** at 4 s | record `battery-journal-614736.json` (label, script name, **272** entries); `fault-prompt-grammar.test.ts` mutated |
| `node scripts/inject-stability.mjs` -- a different battery | `journal: repaired inject-component-rule (pid 614736 is gone), 1 file(s) put back`; `4 caught, 0 survived, 0 inert`; tree clean; no record |
| a Node record read by `_witnesses.py`, and a Python record read by `journal.mjs` | both directions asserted in the suite, not assumed from "the formats look the same" |

One format, two writers, because the battery that repairs a kill is whatever runs next and the
schedule does not promise a language.

### Two exemptions whose reasons had expired

Re-deriving `gate-sites.json` moved three lines and dropped their annotations. The reasons they came
back with were the old ones, and the old ones said:

> Until `verify-gates-are-testable` takes its subjects from this inventory instead of from a filename
> prefix, a computed exit here has no mechanism that would notice the line being emptied.

That was true when it was written and stopped being true at finding 172. The sites stay `exempt`
because no test *executes* a battery that spends a suite run mutating tracked files, so `provedBy`
has nothing to point at -- but each now says what is actually the case: emptying the line surfaces as
inventory drift, which is a static claim, not a test driving the status. An exemption whose reason
expired is the same defect as a proof whose test was deleted, and only a re-derivation would have
surfaced it.

### Acceptance

| gate | result |
| --- | --- |
| mechanism tests | **9** in `battery-journal-node.test.ts`, each naming one property of the record |
| mutation checks | **13 of 13 CAUGHT** (6 against `journal.mjs`, 6 against the census rules, 1 against a battery capturing at module scope), each by the case named in its row |
| the wiring, asserted | `readsBeforeTheRepair` and the two guard spellings; deleting any of them turns the census red |
| end-to-end | SIGKILL -> repair by a different battery -> `4 caught`, tree clean |
| `core` test suite | **145 files, 3803 tests passed** (as of `224b1a8`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `224b1a8`) |
| repo test suite | **149 files, 3989 tests passed** (as of `224b1a8`) |
| coverage | core **99.97 / 99.93 / 100 / 99.97**, cli **100 × 4** |
| gate sites | **63 across 38 scripts**, deriver `--check` OK |
| the three JavaScript batteries | **4 / 8 / 8** caught, 0 survived, 0 inert, restores identical |
| record cost | **272 files / 4.35 MB / 34 ms** per entry and exit, against batteries that take 3 to 60 s |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **A kill plus a concurrent edit is still ambiguous.** A normal exit drops the record, so an edit
  made during a run survives. A *kill* leaves the record, and a person's edit inside that window is
  reverted by the repair. `[open: the shape that would close it is recording at write time rather
  than at start -- one more IO per injection, at 25 write sites -- and it needs a decision about what
  a record means when the writer is a person]`
- ~~**The counts snapshot is still not compared to the suite in CI.**~~ **Closed by finding 180**,
  one pass after this entry was copied forward. The reading exists; what was missing was a way to
  reuse it, and that turned out to be a file the coverage step already writes.
- ~~**Eight score targets are still transcriptions.**~~ **Narrowed by finding 181**, one pass after
  this entry was copied forward. OpenRCA 1.0 is held to the evaluator; seven targets are not.
- **The JavaScript journal has no way to tell a `python3 -c` battery from a stranger.** A record with
  no `script` field falls back to "does the command line mention `injection`", which is right for the
  ten Python batteries and wrong for a Node battery that was somehow started without a file.
  `[open: not reachable today -- every battery is a file -- but the fallback is a heuristic kept for
  old records, and the condition under which it should be deleted has not been written down]`
- **One CI run of this commit failed 21 files with a module namespace that should be impossible, and
  a rerun of the same commit was green.** Step 10 reported **361** failing tests, every one of them
  either `(0, __vite_ssr_import_N__.assertExportableBundle) is not a function` or
  `STRUCTURAL_CODES is not iterable`. A function declaration is hoisted and a module-scope `const` is
  initialised at evaluation, so a namespace that has `exportAioPs2025` but not
  `assertExportableBundle` means the module was still evaluating when its caller ran -- and no import
  cycle reaches `export/guard.ts`. The two cycles that do exist are `score/score.ts <-> score/official.ts`
  (type-only in the runtime direction) and `score/score.ts <-> targets.ts <-> cli/args.ts <-> score.ts`;
  neither includes the guard, and every failing test was in a file that imports the exporters or the
  scorer. Ruled out by measurement: three local full coverage runs green -- 32 cores at 8 workers,
  the same suite pinned to two cores with `taskset`, and `CI=true` -- and a rerun of the same commit on
  the same runner image, green in **154 s**. `[open: 361 red tests is not noise, so this is recorded
  rather than dismissed. The next instrument is the module graph the failing worker actually saw --
  vite-node's `__vite_ssr_import__` resolution per file -- and that needs a run that reproduces;
  the honest state is that one has not]`

## Pass 57 -- the reading was never missing; the pipeline had no way to reuse it

### Two copies of one fact, and neither one could notice the other

`docs/progress.md` publishes how many test files and tests the suite has.
`golden-master/doc-counts.json` is the measurement those rows are checked
against. `docs:check` holds the **document to the snapshot** -- and nothing held
the **snapshot to the suite**, so the pair could be wrong together while every
gate reported agreement. That has been written down since pass 54 as an open
item, with the measurement that killed the obvious fix:

> a second full suite run in the same job trips `onTaskUpdate` with every test
> green

The diagnosis in that sentence is about cost. The actual obstacle was that
**nobody had asked vitest for the reading it was already producing**: the
coverage step runs the whole suite on every push, and `--reporter=json` writes a
file with one entry per test file and one per assertion.

Two findings came out of that question, and they share a shape: *a fact stored
by coordinate instead of by identity goes stale, and nothing is watching it.*

### Finding 180a -- the counts, read from the run that already happened

`test:coverage` now writes `node_modules/.cache/vitest-report.json` beside its
coverage output, and `measure-doc-counts.mjs --from` derives the same three
scopes from those reports.

**The reading had to be shown to be the same reading.** Counting files and
assertions from a report is a second definition of "a passing test", and this
repository has twice shipped two green numbers that disagreed. So both readers
are held against **one captured run** -- `vitest-report-{core,cli}-sample.json`
are real captures, with the summary lines their runs printed recorded in the
test beside them -- and the mutation check counts a skipped assertion or a
failed file as a pass if the rule is loosened.

| path | cost | result |
| --- | --- | --- |
| `pnpm docs:counts` (spawns three suites) | **77.35 s** | 147 / 3818 · 4 / 186 · 151 / 4004 |
| `--check --from <the two reports>` | **0.056 s** | identical |

And because `--from` reads `pnpm-workspace.yaml` rather than trusting the root
`test` script's two `--filter` flags, it also asserts something the spawn could
not: **every workspace package that declares a `test` script must contribute a
test file**, and **every test file in a report must belong to one**. A third
package added to the workspace and forgotten by the root filter is now a failure
that names it, instead of a `repo` count that is quietly short.

### Finding 180b -- an annotation carried by coordinate is lost by any edit above it

The first full run of the new tests failed, and the failure was not mine: adding
a docstring to `measure-doc-counts.mjs` moved its failure site from line 66 to
97, and re-deriving dropped the site's `proved` status.

`derive-gate-sites.mjs` carried the three hand-authored columns across a rewrite
**by `script:line`**, and said so in a sentence that reads as a considered trade:

> Annotations are matched by `script:line` and dropped for a site that no longer
> exists, so a moved guard loses a stale proof rather than inheriting a wrong one.

The second half is right. The first half is not what happens: **every edit above
a site moves its line**, so a proof is dropped for a guard that did not change at
all -- and the guard then fails on `main` with

```
scripts/measure-doc-counts.mjs:97 has status 'undefined'
```

which names a coordinate rather than a defect, and reads like a missing proof
where there is a moved one. Measured twice: three sites in pass 56, one here. The
same file already computes the identifier that is stable under exactly that edit
-- the fingerprint, which its own header calls *"stable under reindentation and
reformatting"* -- and `--check` compares fingerprints. Carrying by line while
checking by fingerprint was two answers to one question, and the coordinate
answer was the wrong one.

The carry now uses the fingerprint. Re-deriving the real tree reports
**`annotations: 63 of 63 carried`**, and the site that moved keeps `proved`.

Two details the first version could not have had:

- **a proof is consumed when it is used.** Two `process.exit(1)` calls with no
  diagnostic above them have the same fingerprint; without consuming the
  candidate, one proof would be attached to both and one of them would be a proof
  about a line it is not.
- **an ambiguous fingerprint is refused, not guessed.** With several identical
  candidates the line is the only evidence left, so an unmoved one is preferred;
  if none matches, the annotation is dropped and the site is named
  (`ambiguous: ...`). A wrong proof is worse than a missing one -- which is what
  the old sentence was trying to say, one implementation too early.

### Acceptance

| gate | result |
| --- | --- |
| mechanism tests | **15**: 8 on the two readings of one run, 7 on the carry |
| mutation checks | **7 of 7 CAUGHT**, each by the case named in its row |
| the carry, end to end | a re-derivation over a copy whose prior lines were all shifted by 1000 still carries **63 of 63**; the line-keyed version carries **0** |
| the two readings | agree exactly on the real tree, and on the captured pair |
| `core` test suite | **147 files, 3818 tests passed** (as of `01a57c7`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `01a57c7`) |
| repo test suite | **151 files, 4004 tests passed** (as of `01a57c7`) |
| coverage | core **99.97 / 99.93 / 100 / 99.97**, cli **100 × 4** |
| gate sites | **63 across 38 scripts**, 63 of 63 annotations carried |
| CI | the new step reads the reports in **0.056 s**; the job that could not afford a second suite run now has the comparison for free |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **A kill plus a concurrent edit is still ambiguous**, and this pass touched no battery.
  `[open: the closing shape is a record written at write time rather than at start -- one more IO at
  25 write sites -- and it needs a decision about what a record means when the writer is a person]`
- **Seven score targets are still transcriptions**, and this pass established one oracle, not seven.
  `[open: RCAEval and OpenRCA 1.0 are held to code somebody else wrote; OpenRCA 2.0, RCA100,
  AIOps2025, Cloud-OpsBench and ITBench carry a prose rule and a `source` string, and whether any of
  them has a runnable evaluator at all has not been decided]`
- **The JavaScript journal cannot tell a `python3 -c` battery from a stranger**, unchanged.
  `[open: unreachable today, but the fallback exists for records written before the field did, and
  the condition for deleting it has not been written down]`
- **One CI run of pass 56 failed 21 files with a module namespace missing its own exports**, and a
  rerun of the same commit was green. Nothing here touched it.
  `[open: the next instrument is the module graph the failing worker saw, and that needs a run that
  reproduces -- none has appeared in three local coverage runs or in the rerun]`

## Pass 58 -- the rule was written for a list, and this repository implemented it for one

### What the citation pointed at, and what the rule actually says

`openrca-1.0`'s metric carried `source: 'microsoft/OpenRCA main/evaluate.py'` and
`provenance: 'official'`. Finding 176 established the standard for that claim on
RCAEval: a rule transcribed by the author of the scorer is not an oracle. The
same file was read this pass, at
`c121a483a5a91dbae50708e5942c42a6609098b2` (10,536 bytes, sha256
`9a1c2351…d53f1`), and the transcription is wrong in three ways:

| upstream | here, before |
| --- | --- |
| the denominator is every declared criterion in **every** root (`scores_num = len(components)+len(reasons)+len(times)`) | three criteria, from the first root only |
| a count mismatch scores **zero** (`if scoringpoints_length == prediction_length`) | scored whatever was answered |
| the numerator is the **best assignment** over permutations | compared by position |

So the rule was a *projection* of the published metric onto a single-fault
answer, and the product's own data model is single-fault
(`GroundTruth.rootCauseComponent`), which is why nobody noticed: every fixture
in the tree was single-root.

### The measurement, before the change

28 `(prediction, scoring_points)` pairs in `golden-master/openrca-evaluator.json`,
each with the `(passing, failing, score)` triple upstream's own `evaluate()`
returns. On the first 25:

```
disagreements 10 of 25
two-second-component-wrong   here 1.0    upstream 0.83
two-out-of-order             here 0      upstream 1.0
two-but-one-prediction       here 1.0    upstream 0
three-one-criterion-wrong    here 1.0    upstream 0.89
```

**Not one direction.** The projection inflated a two-root key to a perfect 1.0
where upstream says 0.83, and scored a correctly permuted two-root answer 0 where
upstream says 1.0. A benchmark number that is wrong in both directions cannot be
corrected by a caveat.

### After

```
disagreements 2 of 28
reason-with-quotes   here 1.0   upstream 0.67
embedded-in-prose    here 0     upstream 1.0
```

Both are **parsers, not rules**, and both are recorded in the corpus with their
direction and an argument rather than quietly matched:

- upstream recovers a block with a non-greedy regex, so a reason containing a
  double quote is truncated and its criterion is lost. This repository parses the
  cell as JSON. **Reproducing the truncation would score a correct answer lower
  for being correct.**
- upstream finds a JSON block anywhere in the cell; this repository requires the
  cell to parse. Our exporter writes JSON, so an export is unaffected -- a
  model's prose answer is not.

The direction is asserted, so a change that starts agreeing fails the test.

### What changed in the scorer

- `readOpenRcaRoots` reads **every** block a cell declares, in numeric order,
  instead of `parsed['1']`.
- `scoreOpenRcaRoots` implements the published rule: the denominator is the sum of
  the three declared lists, a length mismatch returns 0, and the numerator is the
  maximum weight of a perfect matching between predictions and scoring points --
  computed as a bitmask DP over the same maximisation upstream enumerates as
  permutations, bounded by the key's root count because a mismatch returns first.
- One upstream **quirk is reproduced deliberately**: a criterion list shorter than
  the root count is not scored, while its length still divides. A key with two
  components and one reason can therefore never be fully earned, and two corpus
  cases pin that.
- A one-root key carries no block: the scorer rebuilds the same three lists from
  the flattened triple, and a second copy would be a second place to keep in step.
  The block is carried only when the triple cannot stand for the key.

### Acceptance

| gate | result |
| --- | --- |
| corpus | **28 cases**, pinned by repo + commit + bytes + sha256, with the method written into the file |
| agreement | **26 of 28**; the 2 differences are declared, argued, and asserted in their direction |
| mechanism tests | **8**: the corpus's identity, its multi-root coverage, its difference arithmetic, the agreement set, the direction of each difference, the count gate, the assignment, and multi-block reading |
| mutation checks | **7 of 7 CAUGHT**, each by the case named in its row |
| `official:check` | 8 targets scored, 1 skipped by contract, all PASS |
| `core` test suite | **148 files, 3826 tests passed** (as of `de7996f`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `de7996f`) |
| repo test suite | **152 files, 4012 tests passed** (as of `de7996f`) |
| coverage | core **99.97 / 99.93 / 100 / 99.97**, cli **100 × 4** |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- ~~**Eight score targets are still transcriptions**, and this pass established no oracle.~~ **Narrowed
  by finding 181**: OpenRCA 1.0 is now held to its evaluator over 28 cases, and seven targets are not.
  **Counted by finding 182**: five now replay against released code. The replacement entry is in
  pass 59's Open list, where the census lives.
- **The product cannot represent a multi-fault answer**, and the official metric for such a case is
  therefore zero.
  `[open: `GroundTruth` carries one root cause, so an export answers one root for a key that may
  declare two; the scorer now computes the published number -- zero -- instead of a projection, which
  makes the reported accuracy honest but says nothing about whether the model should grow. That is a
  product decision, not a scoring one]`

## Pass 59 -- nine claims of "official", counted, and the one that disagreed

### The question nobody had asked

After finding 176 and finding 181 the standard was written down twice in this
document: *a rule transcribed by the author of the scorer is not an oracle.* What
had never been counted was **how many of the nine targets had anything runnable
behind their `source` string**. Each carries a `provenance` label -- `official` or
`derived` -- and a citation, and two of those citations turned out to be wrong when
somebody finally opened them. A label that has never been tested against the thing
it names is a word, not a claim.

So this pass asked one question of each target: **does an artefact upstream define
this number, and can it be replayed here rather than transcribed?** The answers are
in `golden-master/oracle-census.json`, one row per target, each with the probe that
produced it.

| class | meaning | targets |
| --- | --- | --- |
| `code` | released evaluator, replayed case by case | OpenRCA 1.0, RCAEval ×3, **Cloud-OpsBench** |
| `rubric` | machine-readable scoring data, no evaluator code | RCA100 |
| `prose` | only a paper or a dataset README describes it | AIOps2025 |
| `absent` | the citation itself says no scorer is published | OpenRCA 2.0, ITBench |

Two things came out of the count that were not in anybody's plan.

### Finding 182a -- Cloud-OpsBench had an evaluator, and it disagrees

`LLM4Ops/Cloud-OpsBench` ships `agents/cloudops_agent/evaluation.py`, whose
`prediction_scores` computes CA, FA and JRA. Read at
`c84f5ebd448983322b06c24022b126125c632a22` (seven files, each with a digest), the
rule is not an equality of strings:

```python
def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())
```

Both sides of both comparisons go through it. This repository compared them with
`===`. Measured over 22 recorded pairs: **9 disagreed, every one in the same
direction** -- an answer the benchmark counts as correct was scored wrong here.

| input | upstream | here, before |
| --- | --- | --- |
| `CheckoutService` vs `checkoutservice` | 1 | 0 |
| `" checkoutservice"` vs `"checkoutservice"` | 1 | 0 |
| `"cpu\nsaturation"` vs `"cpu saturation"` | 1 | 0 |
| `"checkout\u00a0service"` vs `"checkout service"` | 1 | 0 |

A single-direction error is the rarer and more dangerous kind: it does not average
out, it makes every number this product reports for that target an understatement
that looks like a weak model.

Two upstream behaviours are **not** reproduced, and both are declared in the corpus
with their direction and an argument:

- a key that declares nothing scores 1.0 there, because `"" == ""`. Here a facet the
  key does not declare is not scored at all. Reproducing it would let an export of
  empty keys report a perfect JRA.
- `str(value)` stringifies a number, so `8080` matches `"8080"` upstream. Our export
  contract types both fields as strings, so a number reads as absent. The difference
  is in the reader, not in the rule.

After: **22 of 24 agree**, and the two that do not are the two above.

The CA and FA in the breakdown now go through the same comparison, because they are
the same two comparisons reported apart. A `jra: 1` printed beside `ca: 0.96` is not
a rounding difference, it is two rules in one report -- and that is exactly what the
old breakdown would print for a corpus full of capital letters.

### Finding 182b -- RCA100 has a rubric, and this repository pays 1.0 or 0

The AIOps2025 and RCA100 datasets are not on GitHub: the paper points at a JiHu
GitLab project, `aiops-live-benchmark/agenticopseval`, whose raw files are reachable
anonymously. `RCA100/answer_key/taxonomy.json` (25,823 bytes, sha256 `840f3cfa…`) is
not documentation -- it is the scoring rubric as data:

```json
"scoring_rubric": { "T3_exact_L3": 1.0, "T2_same_L2": 0.5, "T1_same_L1": 0.2, "T0_different": 0.0 }
```

with `hierarchy.{L1_categories, L2_to_L1, L3_to_L2}` underneath it. This repository's
`rca100` rule pays `1` for an exact fault-type match and `0` otherwise, so a
prediction in the right L2 family earns nothing where the published rubric pays half.

That is **recorded as a `gap` on the census row rather than fixed here**, and the
reason is the difference between this finding and 182a: 182a is *code that was
evaluated against a corpus in one session*. 182b needs the hierarchy carried into
the export and a tier function replayed against 28 fault types -- a change to the
contract, not a comparison. Doing it in the same pass as 182a would have meant
verifying neither properly.

Two smaller answers from the same probe: `aiops2025`'s dataset README documents the
data and **not** the score (`grep` finds no formula), so its rule stays `prose` --
though the project README does state `0.40 / 0.40 / 0.10 / 0.10`, which agrees with
this repository; and ITBench's repository contains **no evaluator at all** --
`src/itbench` is a CLI to create, deploy and show scenarios, and its two name matches
for `eval` are leaderboard markdown that reports **NTAM and % resolved, not pass@1**.
Our metric is named after a quantity upstream does not tabulate.

### What a census can prove, and what it cannot

The nine tests behind this file assert **internal consistency**: one row per target
and no row without a target; only the four documented classes; every `code` row
backed by a corpus that really carries the digests the row cites; every row dated,
with the probe that produced it; and a `gap` only on a row that has no replay.

They cannot assert that the census is **true about the world**. A static inventory of
external facts ages, and no test can re-probe GitHub from inside a suite. The only
honest claim such a table can make about itself is that it was taken on a date, which
is why `takenAt` and a per-row `probe` record are required fields rather than
decoration -- and why the next pass that touches a target has to re-probe that row
instead of trusting it.

One direction **is** falsifiable, and is asserted: a row may claim `code` only with a
corpus behind it. A future pass that quietly downgrades a target to "transcription"
has to delete a file that another test replays.

### Acceptance

| gate | result |
| --- | --- |
| census | **9 rows**: 5 `code`, 1 `rubric`, 1 `prose`, 2 `absent`; every row dated and probed |
| Cloud-OpsBench corpus | **24 pairs** from seven pinned files; **22 agree**, 2 declared differences in their direction |
| mechanism tests | **17**: 8 on the Cloud-OpsBench corpus, 9 on the census |
| mutation checks | **14 of 14 CAUGHT**, each by the test named in its row |
| the rule that changed | reverting the comparison to `===` fails 9 corpus cases; dropping the lowercase, the collapse or the `\u00a0` handling each fails its own case |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **150 files, 3843 tests passed** (as of `37de366`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `37de366`) |
| repo test suite | **154 files, 4029 tests passed** (as of `37de366`) |
| coverage | core **99.97 / 99.91 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **Four targets have no replay**, and the census says which for each.
  `[open: rca100 has a rubric this rule does not use -- the fault-type term is a coin
  flip where the published rubric pays 1.0/0.5/0.2; aiops2025 has a paper and no code;
  openrca-2.0 and itbench have no scorer published at all. The first is implementable
  as data and is the next pass's subject; the other three need a decision about
  whether a `derived` metric should keep a weight it cannot test]`
- **The census ages.** `[open: nothing re-probes it. The next pass that touches a
  target has to fetch that row's artefact again, and the `probe.takenAt` field is
  there to make "I checked" a claim with a date on it rather than a habit]`
- **The product cannot represent a multi-fault answer**, carried from pass 58 and untouched here.
  `[open: `GroundTruth` carries one root cause, so a two-root key scores zero under
  the published rule; whether the model grows is a product decision, not a scoring one]`
- **A kill plus a concurrent edit is still ambiguous**, carried from pass 57; this pass touched no
  battery. `[open: the closing shape is a record written at write time rather than at start -- one
  more IO at 25 write sites -- and it needs a decision about what a record means when the writer is
  a person]`

## Pass 60 -- one section of one paper, and three clauses that had been dropped

### The source was a paper, and nobody had read the section the rule cited

`rca100`'s metric carried `source: 'arXiv 2606.29193 section 5.4'` and a formula.
Finding 176 had established the standard on RCAEval ("a rule transcribed by the
author of the scorer is not an oracle") and finding 181 had applied it to OpenRCA
1.0. This pass applied it to the one target whose source is a *paper*, and read the
section.

Three clauses were not in the rule, and one of them was in the rule as a number
that appears nowhere:

| The section says | The rule did |
| --- | --- |
| "A UModel entity-ID match with partial credit on topologically adjacent entities (**0.40**)." | paid **0.5** -- a number with no source in the paper, the dataset or the README |
| "99.5% carry a `⟨comparator, value, unit⟩` numeric constraint, so the agent must match the numeric condition, **not merely mention the metric**." | compared the signal **name** alone: `error_count` with a threshold two orders of magnitude wrong scored the checkpoint |
| "`Final_B = (0.4 Entity + 0.3 Fault + 0.3 Process) × 100`" | correct, and implemented **twice** |

### The third one only surfaced because of the first

Changing the adjacent credit moved the per-case score and left the report's
breakdown at 0.5, because `aggregateFor` recomputed the three terms instead of
reading them from the case records. The report then carried `accuracy: 0.94` beside
`final: 95` -- **one quantity, twice, disagreeing**, inside a single report, with
every test green.

That is finding 181's shape one level down, and it is the reason the aggregate now
averages the terms each case record carries. `Final_B` is a linear combination of
the terms, so a headline computed from the mean of the per-case scores and a mean
computed from the terms have to be the same number; the suite asserts they are, on
a three-case export whose cases carry different term sets (a single-case export
cannot tell the two apart, which is why the previous 148 files never did).

The same duplication was in `aiops2025`, and there it was not merely a duplicate but
a **contradiction**: finding 159 had fixed the aggregate's `Exp.` to answer 0 for an
empty denominator, and the per-case rule still answered **1**. It was invisible
because `evidenceComplete` fails such an export first, for a different reason --
*a guard elsewhere is not a guard here*.

### The token

A checkpoint is now `signal|comparator|value|unit`, and a hit requires all four:

```text
order|cpu_usage|>|90|%      # the checkpoint the answer key declares
order|cpu_usage|>|9|%       # a different threshold: not a hit
order|cpu_usage|>|90|ms     # a different unit: not a hit
order|cpu_usage             # the metric, named, with no condition: not a hit
```

Exact equality on the value is the literal reading of "match the numeric
condition", and it is not forgiving -- the dataset's own ground truth carries
`0.4964574898785425`. A tolerance is a rule the paper does not state, so inventing
one would be the same defect pointing the other way. That consequence is an open
item below rather than a fudge.

### What the mutation grid could not see

`mutatePrediction` replaces a facet **whole**: the `evidence` mutation swaps the
list for a sentinel. A rule that keeps the signal name and drops the value therefore
passes the grid, because the grid never keeps the part the rule should be sensitive
to. **A mutation that changes a facet cannot test a rule that reads part of one.**
The case-level assertions in `rca100-evaluator.test.ts` are what close that, and the
grid was left alone rather than widened for one target.

### The corpus is a set of sentences

`golden-master/rca100-evaluator.json` pins the paper by digest
(`2606.29193v1`, 2,958,887 bytes, sha256 `b8b8de83…`) and each clause by verbatim
quote, plus the extraction method -- `pdftotext` **without** `-layout`, because the
layout extraction reproduces the two-column grid and a sentence spanning the column
break comes out interleaved with the other column, so the quote would not appear.

It also records the dataset's own rubric -- `{T3_exact_L3: 1.0, T2_same_L2: 0.5,
T1_same_L1: 0.2, T0_different: 0}` -- with its digest and the reason it is **not
shipped**: 25 KB of CC BY-NC 4.0 data, and this project states that it does not
redistribute the official datasets. So the rubric stays a pinned gap rather than a
half-applied rule, and the census row says what closing it would cost.

### Two intermittent reds, and what they turned out to be about

The full suite went red twice while this pass was being finished, each time in a
different file, each time green on every run of that file alone: `gate-test
battery · reaches UNPARSEABLE` failed with `SyntaxError: Unexpected token '_',
"_witnesses"... is not valid JSON`, and `check-doc-counts · refuses a document with
no counts at all` failed on `expected null to be 1`.

Both are `spawnSync` helpers, and both reported a **child that never ran** as a
verdict about the child's subject. `spawnSync` answers `status: null` when the
process could not be started -- and every assertion in both files reads `status`,
so a resource failure at fork time arrives as a complaint about the battery or
about the guard.

Three things changed, and none of them is a retry of a red:

- the JSON helper in the attribution file parses **stdout only**. It read
  `stdout + stderr`, so anything Python wrote to the other stream became the "last
  line" and the parse error named a stream the reader could not see. Both streams
  are in the failure message now, and the parse says "the snippet printed no JSON
  line. Last line was: …" instead of `Unexpected token`.
- both helpers assert `error` is undefined, so a child that never started says so.
- both retry once, **only** on `EAGAIN` / `ENOMEM` -- a process that was never
  created observed nothing, and retrying it is not the same act as retrying an
  assertion that failed.

Four consecutive full runs were green afterwards and the two reds were not
reproduced. That is not a diagnosis, and it is recorded as an open item rather
than as a fix.

### Acceptance

| gate | result |
| --- | --- |
| corpus | paper pinned by digest; **4 clauses**, each with a verbatim quote and an argument |
| mechanism tests | **15** on the RCA100 corpus + 1 on the AIOps2025 empty denominator |
| mutation checks | **12 of 12 CAUGHT**, each by the test named in its row |
| the clauses that changed | reverting the credit to 0.5, or the token to the signal name, or the aggregate to a recomputation, each turns the suite red |
| the two numbers | `final === 100 × accuracy` on a three-case export; recomposing the headline from term means reports **93** for cases that average **85** |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **151 files, 3859 tests passed** (as of `2444bd8`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `2444bd8`) |
| repo test suite | **155 files, 4045 tests passed** (as of `2444bd8`) |
| coverage | core **99.97 / 99.8 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **The checkpoint value is matched exactly**, and the dataset's own thresholds carry
  full float precision.
  `[open: "match the numeric condition" is the paper's phrase and it states no
  tolerance, so a tolerance would be an invented rule; the cost is that a submission
  naming the right metric and a rounded threshold scores nothing. This needs a
  decision, not a fudge]`
- **RCA100's fault-type rubric is still not applied**, and this pass established that
  closing it is not a code change.
  `[open: the rubric is 25 KB of CC BY-NC data this project does not redistribute, and
  the exported fault type is a free-form IR string, so a tier would resolve only when
  the data already speaks RCA100 labels. Two ways out: a licence decision, or an
  offline fixture regenerated on demand]`
- **Two whole-suite reds in this pass were not reproduced**, and both were `spawnSync`
  children that reported `status: null`.
  `[open: four full runs after the diagnostic hardening were green, and the two reds
  came from different files, so the common cause is not established. What is
  established is that a child which never started used to read as a verdict about its
  subject, and that the machine is spawning ~200 child processes inside a parallel
  suite. The next instrument is `r.error.code` from a run that reproduces]`
- **The census ages**, carried from pass 59; this pass read a paper and did not re-probe
  a single repository. `[open: nothing re-probes it, and the next pass that touches a
  target has to fetch that row's artefact again rather than trusting the table]`
- **The product cannot represent a multi-fault answer**, carried from pass 58.
  `[open: `GroundTruth` carries one root cause, so a two-root key scores zero under the
  published OpenRCA rule; whether the model grows is a product decision]`

## Pass 61 -- the same paper, a different section, and the relaxation it grants

### The target next to the one just read

Pass 60 read §5.4 for RCA100. §4.4, three pages earlier, defines AIOps2025's
Final_A, and `aiops2025` had the same provenance as `rca100` had: a paper citation
and a rule written from memory. Reading it found one clause missing that changes a
score, and one that cannot be implemented without a decision.

| §4.4 | The rule |
| --- | --- |
| "Two fault families need targeted relaxations: for network attacks, LA accepts a hit on either **source or destination** ..." | compared `component` only -- the reader discarded both endpoint fields |
| "TA ... via two-step matching: keyword detection ... **with embedding-similarity fallback for unhit cases**" | the first step only |
| "The reason field is truncated to its first 20 words" | correct |
| "each observation contributes only its first 20 characters" | correct |
| "`Efficiency = min(1.0, exp(−(APL−5)/5))`, where APL is the mean ... over **LA-correct** cases" | correct |
| "`Final_A = (0.4 LA + 0.4 TA + 0.1 Exp. + 0.1 Eff.) × 100`" | correct |

### The relaxation, and the fields it needs

The dataset's answer key names both endpoints of a network fault in `source` and
`destination` -- the README says so in as many words, and the corpus records that
sentence next to the paper's. The reader read neither, so an answer that named the
**far** end of an injected network fault scored zero on localisation where the
protocol pays full credit.

The fix is one field, `OfficialGroundTruth.alternatives`, and the rule is
`component || alternatives.includes(predicted)`. It is deliberately not
`adjacent`: `adjacent` earns *partial* credit for a topology neighbour (RCA100's
0.40), while an alternative earns a **full** hit. One field carrying both meanings
would be the defect this repository has a finding about.

Scope is enforced by the data rather than by a fault-type list: a case whose key
declares no endpoints has an empty list, and an empty list cannot manufacture a
match. The suite asserts the negative case explicitly -- the same answer on a key
without endpoints still scores zero -- because a relaxation that quietly widened
to "anything the topology mentions" would be a different rule.

### The fallback, which is not a transcription problem

"Weighted ... with embedding-similarity fallback for unhit cases" names neither a
model nor a threshold. Choosing one changes the number; choosing one to reproduce
the paper's reported TA is fitting the metric to its own result. So the first step
is implemented, the second is recorded as a gap with its direction -- a paraphrase
carrying none of the description's words scores 0 here and may be credited there --
and the `gaps` block says what closing it would take.

This is the second target in a row where the honest answer to "implement the
published rule" is "part of it is a decision". That is worth saying plainly: the
census counts five targets as `code`, and of the remaining four, two cannot be
closed by writing code.

### The third copy of the evidence term

The mutation check found it. Removing the 20-character cut from the case rule left
every test green, because the aggregate had **its own copy**:

```ts
// before
const em = groundTruth.reduce((sum, gt, i) =>
  sum + intersectCount((predictions[i]?.evidence ?? []).map((e) => e.slice(0, 20)), gt.evidence), 0);
```

Two implementations of "which cited observation hit", and only one of them had been
changed. The case record now carries `evidenceHits` -- a count, not a rate -- and the
pooled `Exp.` is the sum of those counts over the sum of the denominators. Pooling
rates needs the numerators back; recomputing them was the second copy.

This is the third appearance of the same shape in three passes (181: two averages;
183: case rule vs aggregate; here: case rule vs aggregate again, one term deeper).
The pattern is not "somebody wrote it twice" but **"a term that is reported at two
levels gets computed at the level where it is reported"**, and the level that is
never tested is the one that is only reported.

### The second reader of a directory

The full suite failed twice more while this pass was finishing, this time in
`scripts-are-classified`: `scripts/` was one file longer than the register. The
extra file is `scripts/.probe-figures-harness-type-miss.mjs`, a harness one probe
writes for the duration of a single test and removes in `finally` -- and
`derive-gate-sites.mjs` had **already been taught to ignore dotfiles**, for exactly
this reason, in an earlier pass whose comment says the window "is still a hazard for
any *future* reader of `scripts/`".

This file was that future reader. It filtered on `.endsWith('.mjs')` and nothing
else.

Two fixes, both about a claim rather than a symptom:

- the scan skips dotfiles, with the reason the deriver uses: a file that is not
  committed, not named by `pnpm lint` and never resolved by an operator is not part
  of the tree;
- the probe file gains an `afterAll` that removes the harness. `finally` runs on a
  throw, not on a kill -- and a worker killed by the resource pressure that also
  produced pass 60's two reds leaves the file behind, which is why the second run of
  a broken tree failed too.

**The second reader of a directory is the one that does not know what the first one
learned.** That is the same shape as the duplicated terms, one level out: the fact
was written down once and read twice, and the reading that had to be corrected was
the new one.

### Acceptance

| gate | result |
| --- | --- |
| corpus | paper pinned by digest and **cross-checked against the RCA100 corpus's pin**; dataset README pinned; **9 clauses** quoted, 4 README fields |
| mechanism tests | **16** |
| mutation checks | **9 of 9 CAUGHT** |
| the relaxation | either endpoint accepted; a third entity refused; a key without endpoints unchanged |
| the truncations | a keyword at word 21 does not count; twenty characters decide an evidence point |
| the APL restriction | a long wrong answer no longer enters the efficiency average |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **152 files, 3875 tests passed** (as of `5997dcc`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `5997dcc`) |
| repo test suite | **156 files, 4061 tests passed** (as of `5997dcc`) |
| coverage | core **99.97 / 99.75 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **A directory's contents are described in more than one place**, and this pass
  found the second copy the hard way.
  `[open: `derive-gate-sites.mjs` ignores dotfiles in `scripts/`; the classification
  scan now does too, because a probe writes one there. Nothing enumerates the readers
  of `scripts/`, so the next one has to learn the same rule from the same comment --
  unless the probe stops writing into the tree at all, which needs its relative
  imports to resolve from somewhere else]`
- **TA's embedding fallback is not implemented**, and cannot be transcribed.
  `[open: the paper names neither the model nor the threshold, so reproducing it
  means choosing both; a threshold picked to match the reported TA would be fitting
  the metric to its own result. The direction it costs is recorded: a paraphrase
  using none of the description's words scores 0 here and may be credited there]`
- **Three items are carried unchanged**, and this pass touched none of them: the
  exact match on a checkpoint value, RCA100's fault-type rubric waiting on a licence
  decision, and the two whole-suite reds that were never reproduced.
  `[open: each has its own entry with its own reason in the pass that raised it (60,
  60 and 60 respectively); repeating the reasons here would make this list the place
  they are maintained, and the earlier entries the place they are read]`

## Pass 62 -- a label with two values for three states, and a metric named after a rule it did not compute

### Two things that were both true and neither of which was checkable

This pass started as the last item on the census: the two targets left with no
replay are `openrca-2.0` and `itbench`, both labelled `derived`, and the question
was whether either could be given a testable source. Opening the ITBench paper
answered that and raised a second question, which turned out to be the larger one.

### 185a -- `itbench-pass-at-1` was not pass@1

The metric carried `id: 'itbench-pass-at-1'`, a `quote` from arXiv 2502.05352
§4.2, and `facets: ['component', 'chain', 'evidence']`. Two things were wrong with
that, and the first was visible in the file itself:

**The quote was not verbatim.** The paper writes

> Diagnosis efficiency is measured using pass@1**(Chen et al., 2021)** (i.e.,
> identifying the cause as mentioned in ground truth), NTAM (Normalized
> Topology-Aware Metric) for root cause and fault propagation chain, **and time to
> diagnosis**.

The field in this repository had dropped the citation and the final clause — which
is the clause that makes the sentence a list of three metrics rather than a
description of one. A `quote` is the one field whose whole value is that it was not
edited, and it had been edited in the direction that made the rule look right.

**And the rule computed something else.** Table 3 of the paper lists the SRE
diagnosis metrics as "pass@1, Fault Localization, Fault Propagation Chain, Mean Time
to Diagnosis" — four, of which pass@1 is the cause alone. The rule here required
the cause *and* the chain *and* the conditions, so a submission that named the right
cause and nothing else scored 0 on a quantity called pass@1.

`golden-master/itbench-evaluator.json`: the paper pinned by digest (v1, 4,068,098
bytes, sha256 `da47aa02…`), six clauses quoted verbatim, and nine cases.

```
published=1 strict=1.00 old=1   oracle
published=1 strict=0.33 old=0   cause-only                    <- disagreed
published=1 strict=0.67 old=0   cause-and-chain               <- disagreed
published=1 strict=0.67 old=0   cause-right-chain-wrong       <- disagreed
published=0 strict=0.67 old=0   wrong-cause-right-rest
published=1 strict=1.00 old=1   key-with-no-chain
published=0 strict=0.00 old=0   empty-key-empty-answer
...
```

**Three of nine disagreed, every one in the same direction.** That is the third
time: Cloud-OpsBench's normalisation (9 of 22), AIOps2025's endpoints (one direction),
and now this. A one-directional error does not average out into noise — it makes
every number the product reports for the target an understatement that reads as a
weak model, which is the failure mode hardest to notice, because a low score looks
like a result.

The fix reports both numbers, each named what it is:

| Number | Rule | Published? |
| --- | --- | --- |
| `passAt1` | predicted root cause equals the key's | yes — §4.2 |
| `strict` | cause **and** chain **and** conditions | **no** — this repository's own conjunction, and the metric's id is `itbench-diagnosis-strict` |

### The decision this pass did **not** make

The two NTAM metrics could be implemented *as an approximation*, and both previous
passes established why that is worse than not implementing them: their components
"have corresponding hyper-parameters that can be tuned to adjust their
contributions", the values are not published, and a set of weights chosen to
reproduce the paper's table would be the metric fitted to its own result. So the
census row now carries a `gap` naming the two metrics, the sentence that makes them
un-replayable, and the direction of the cost.

Of the four targets with no replay, **three are now decided rather than pending**:
RCA100 needs a licence decision, AIOps2025's TA needs a model and a threshold,
ITBench's NTAM needs weights. None of them is waiting for an implementer, and saying
so is more useful than a backlog entry implying otherwise.

### 185b -- `provenance` had two values for three states, and nothing read it

The larger finding came from a smaller observation: **`provenance` was not asserted
anywhere and not summed anywhere.** It travelled to the report and stopped.

It had two values, `official` and `derived`, where `official` meant "transcribed
from the upstream scorer *or* the paper's protocol". Every rule this campaign has
caught — OpenRCA's projection (10 of 25), Cloud-OpsBench's comparison (9 of 22),
RCA100's three dropped clauses, AIOps2025's relaxation, and now ITBench's name — was
labelled `official`. The label was not false. It was **unable to say the one thing
that mattered**: whether anybody else's code had ever computed this number.

Three states, and the label now has three values:

| Label | Meaning | Targets |
| --- | --- | --- |
| `replayed` | a corpus in `golden-master/` runs the released artefact's rule case by case | OpenRCA 1.0, RCAEval ×3, Cloud-OpsBench |
| `transcribed` | a published prose rule, no released code; nothing else computes it | RCA100, AIOps2025 |
| `derived` | upstream publishes neither the rule nor its constants | OpenRCA 2.0, ITBench |

And the label is **derived rather than authored**:
`provenance-matches-the-census.test.ts` maps each census class to exactly one label
and fails on any drift, so the registry cannot claim more than the census supports.
That is the link that was missing — `source` strings were compared between the two
files (pass 59) and `provenance` and `class` were not, so two files described the
same fact and nothing held them together.

The label is also **read** now: `rca-bench official` sums it per run.

```json
"counts": { "passed": 9, "skipped": 0, "failed": 0 },
"provenance": { "replayed": 5, "transcribed": 2, "derived": 2 },
```

Five of nine. A consumer deciding whether to trust a headline should not have to
read nine metric specs to learn that, and a label nobody sums is a label nobody
needs.

### Acceptance

| gate | result |
| --- | --- |
| corpus | ITBench paper pinned by digest; **6 clauses** quoted verbatim, each with an argument; **9 cases** with their published and previous values |
| mechanism tests | **13**: 10 on the ITBench corpus, 4 on the provenance mapping, 1 in the CLI for the split |
| mutation checks | **11 of 11 CAUGHT**, each by the test named in its row |
| the naming | the metric id is not one of the four the paper publishes, and the quote is the whole sentence |
| the direction | every case where the old rule and the paper disagree is one-way; the reverse set is asserted empty |
| the label | 5 `replayed` / 2 `transcribed` / 2 `derived`, derived from the census and asserted both ways |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **154 files, 3889 tests passed** (as of `3d5d62b`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `3d5d62b`) |
| repo test suite | **158 files, 4076 tests passed** (as of `3d5d62b`) |
| coverage | core **99.97 / 99.75 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **Three of the four un-replayable targets now wait on a decision, not on code**, and
  the fourth is the same shape one step out.
  `[open: RCA100's fault-type rubric is 25 KB of CC BY-NC data this project does not
  redistribute; AIOps2025's TA fallback needs a model and a threshold; ITBench's two
  NTAM metrics need weights the paper leaves tunable; OpenRCA 2.0 has announced that no
  scorer is published. Each entry exists in the pass that measured it, with the cost of
  closing it]`
- **`transcribed` is a confidence level, not a measurement.** `[open: the label says no
  released code exists, which is a fact about upstream; it cannot say how faithfully the
  prose was read. Findings 181, 183 and 184 are three readings of three sections that
  were wrong the first time, so the honest reading of `transcribed` is "unverified except
  by a second reading of the same sentences"]`
- **Four items are carried unchanged**: the exact match on a checkpoint value, the two
  whole-suite reds never reproduced, the census ageing, and the multi-fault model.
  `[open: each has its own entry in the pass that raised it; this list is not the place
  they are maintained]`

## Pass 63 -- a citation that pointed at this repository, and a metric set nobody had opened

### The last target with no source

Pass 62 closed by naming the four targets with no replay and observing that three
of them wait on a decision. The fourth was `openrca-2.0`, and it was the one row
in the census whose `source` string was not merely unopened -- it was **this
repository**:

```ts
source: 'docs/targets/openrca-2.0.md — the official OpenRCA 2.0 scorer is not open-sourced',
quote:  'The official OpenRCA 2.0 evaluation framework and scorer are not open-sourced.',
```

That second line is `docs/targets/openrca-2.0.md:157`. It is not in the paper.
Checked at `arXiv:2606.27154v2`: the string `open-sourced` occurs **zero** times.
Checked at `microsoft/OpenRCA`'s README, at the commit the 1.0 evaluator is pinned
to: `2.0` and `PAVE` occur **zero** times.

> A `quote` field whose entire value is that it was not written here, holding a
> sentence written here.

This is the one defect in the campaign that no amount of replaying would have
found, because there was nothing to replay against: the claim's evidence was the
document making the claim. Every other finding has been "the rule disagreed with
the artefact"; this one is "there was no artefact".

### What the paper actually defines

§3.2, with formal definitions in Appendix G: nine quantities across an outcome and
a process layer.

| Quantity | Computable from this contract? |
| --- | --- |
| EM — exact set equality over `(service, fault_kind)` pairs | yes, and it is one pair here |
| AnySvc — a correct service, ignoring the fault kind | yes |
| Node F1 / Edge F1 — the predicted graph against the annotated one | yes, from the exported path |
| F1 / Precision / Recall over the pair set | degenerates to EM for a one-pair submission — three names for one number |
| Path Reachability — needs the ground-truth **alarm nodes** | **no**: PAVE annotates them, this export does not carry them |
| SQL Exec | no SQL in this contract |

The rule that was there scored `matched facets / scored facets` over four facets.
That is none of the nine. It paid a quarter of a case for the checkpoint
references, which no published metric reads; and it reported a correct service with
no verified path as **three quarters of a success**, which is the exact failure the
paper was written to expose:

> We reserve the term ungrounded diagnosis for cases that satisfy AnySvc but not
> PR: a correct root-cause identification not grounded in a verified causal
> propagation path to the observed symptom.

The report now carries the layers apart — `em` (the headline), `anySvc`, `nodeF1`,
`edgeF1` — so `anySvc: 1` beside `em: 0` and `em: 1` beside `nodeF1: 0` are both
expressible. A single averaged number could say neither.

### One facet that had to leave the list

`chain` was declared a facet of a score that never read it, and the mutation grid
said so before this pass did:

```
case case-001: mutating 'chain' did not lower the score (1)
```

That is the grid working. The score is EM; the graph is a *different published
layer*, and folding it back into `score` would reproduce exactly the averaging the
paper exists to argue against. So `facets` is `['component', 'faultType']` — what
`score` reads — and the graph comparison is asserted case by case in
`openrca2-evaluator.test.ts` instead, which is a stronger instrument for it than a
mutation grid that can only ask whether *the* score moved.

`evidence` left the list entirely: no published metric scores the checkpoint
references, and paying a quarter of a case for them was inventing a fourth term.

### The label moved, because the census moved

`openrca-2.0` was `derived`. It is `transcribed` now — the paper defines the
metrics, and four of the nine are replayable. The census row is `prose` rather than
`absent`, and the registry's label is *derived from that class* by
`provenance-matches-the-census.test.ts`, which is why the two moved together without
anyone editing both: **5 replayed / 3 transcribed / 1 derived.**

### Acceptance

| gate | result |
| --- | --- |
| corpus | paper pinned by digest (v2, 962,086 bytes, sha256 `2c8388aa…`); **5 clauses** quoted verbatim; **7 cases** with `em`/`anySvc`/`nodeF1`/`edgeF1` |
| mechanism tests | **10** on the corpus + 2 on the census and 1 on the aggregate, all updated rather than added around |
| mutation checks | **14 of 14 CAUGHT**, each by the test named in its row |
| the citation | `source` is not a `docs/` path; the invented sentence is not the quote; the negative result is recorded |
| the layers | `anySvc: 0.71` / `em: 0.57` / `nodeF1: 0.78` / `edgeF1: 0.74` on the nine-case export |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **155 files, 3901 tests passed** (as of `041ca04`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `041ca04`) |
| repo test suite | **159 files, 4088 tests passed** (as of `041ca04`) |
| coverage | core **99.97 / 99.75 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **A quote can no longer be checked mechanically, and that is the residual risk.**
  `[open: the corpus test asserts the quote equals a clause, and the clause was pasted
  from the paper by hand. What is now asserted is that the *source* is external and that
  the old invented sentence is gone -- not that the new sentence is in the PDF. Doing
  that would need the PDF in the repository, which this project does not do, or a network
  test, which the suite does not run]`
- **PR needs a field the contract does not carry.** `[open: closing it means adding the
  alarm-node set to the annotation and to the export, which is a contract change and not a
  scoring one; the paper's own headline number is the AnySvc/PR gap, so this is the most
  valuable of the remaining gaps]`
- **Three non-replayable targets still wait on decisions**, unchanged this pass.
  `[open: RCA100's fault-type rubric is 25 KB of CC BY-NC data this project does not
  redistribute, AIOps2025's TA fallback needs a model and a threshold, and ITBench's two
  NTAM metrics need weights the paper leaves tunable; each has its own entry in the pass
  that measured it, with the cost of closing it]`

## Pass 64 -- the field PR needed was already in the export

### A self-correction, one pass later

Pass 63's Open list said:

> **PR needs a field the contract does not carry.** `[open: closing it means adding the
> alarm-node set to the annotation and to the export…]`

That was wrong, and the sentence that refutes it is in §2.3 of the same paper, three
pages before the metric definitions:

> A candidate path π is verified only if all of **(i) every node along π exhibits a
> deviation beyond its baseline screen**, (ii) every consecutive edge conforms to R …,
> and (iii) each downstream anomaly onsets no earlier than its upstream cause.

An alarm node is "a component observed to behave abnormally during the injection window".
PAVE admits a path only if every node on it crossed its baseline screen. **So every node
of the annotated path is an alarm node by construction** — the field was the chain all
along, and adding one would have been inventing a second copy of a fact the annotation
already asserts.

This is the same shape as finding 180 and finding 183, one level out: not two
implementations of a rule, and not two vocabularies for a fact, but **a missing field that
was already present under a different name**. Reading the *definition of the input* is
what found it; reading only the definition of the metric was not enough.

### What PR is, exactly

Two conjuncts, and the second is why it is stronger than `anySvc`:

- the named root cause is the key's root cause, **and**
- the submitted graph carries a path of **length at least one** from it to a node of the
  annotated path.

Length at least one is the whole distinction. A submission that names the service and
propagates nowhere has not grounded the diagnosis — the paper's `ungrounded diagnosis` —
and a zero-length "path" would make PR identical to AnySvc, which the reported numbers in
the paper rule out (61.5% versus 76.0%).

| Number | Corpus | Rule |
| --- | --- | --- |
| `em` | 0.70 | service and fault kind, the strict outcome layer |
| `anySvc` | 0.80 | the service alone |
| `pr` | 0.56 | a correct cause **and** a path to an alarm node |
| `nodeF1` | 0.67 | graph nodes, exact matching |
| `edgeF1` | 0.50 | graph edges, exact matching |

### The direction of the error, recorded rather than glossed

G*'s nodes are a **subset** of the paper's alarm set: a component that deviated but sat on
no surviving path is absent from the annotation. So this `pr` is a **lower bound**, and the
corpus carries that under `alarmNodeBasis` — the set used, the clause that licenses it, and
the direction. A claim of parity would be exactly the defect this campaign keeps finding.

### Two cases that exist because the numbers would otherwise agree

`detour-that-arrives` has `edgeF1: 0` and `pr: 1` — one valid path is all PR asks for, and
the graph is wrong everywhere else. `cycle-that-arrives-nowhere` closes a loop that never
touches the annotation: PR must be 0, and the walk must terminate, which is a property of
the algorithm rather than of the corpus.

And `wrong-first-hop` is the paper's failure written as a fixture: `em: 1`, `anySvc: 1`,
`pr: 0`. Before this pass the report could not say it at all.

### One thing the gate caught

The first draft walked the graph with `queue.push(...successors)`. The repository has a
test that forbids spreading a size-dependent array into a call — the successor list is the
*submission's*, so its length is unbounded by anything this file controls. Replaced with a
per-successor `push`. That is the second time this campaign has been corrected by a gate it
did not write for the occasion.

### Acceptance

| gate | result |
| --- | --- |
| corpus | **8 clauses** (3 new, all quoted verbatim), **10 cases** with `em`/`anySvc`/`pr`/`nodeF1`/`edgeF1` |
| mechanism tests | **13** on the corpus, 1 of them the termination property |
| mutation checks | **9 of 9 CAUGHT**, each by the test named in its row |
| the alarm set | `alarmNodeBasis` names the set, the clause, and the direction of the error |
| the layers | 0.70 / 0.80 / 0.56 / 0.67 / 0.50 on the ten-case export |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **155 files, 3904 tests passed** (as of `39eec9d`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `39eec9d`) |
| repo test suite | **159 files, 4091 tests passed** (as of `39eec9d`) |
| coverage | core **99.97 / 99.73 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **`pr` is a lower bound and the corpus says so**, which is not the same as being right.
  `[open: closing the gap needs the PAVE observation graph -- every component that deviated,
  not only the ones on a surviving path -- which the paper describes but does not release;
  or a decision that G* *is* the alarm set, which would make this PR the paper's definition
  rather than a conservative reading of it]`
- **`em` and the four reported quantities are one root cause wide.** `[open: F1, Precision
  and Recall are defined over a predicted pair *set*, and this data model carries one pair,
  so they collapse onto EM. Growing the model is a product decision that would also change
  OpenRCA 1.0's multi-root behaviour]`
- **A quote still cannot be checked mechanically**, unchanged since pass 63.
  `[open: what is asserted is that the source is external and that the old invented
  sentence is gone; the clause itself was pasted by hand, so the guarantee is "nobody can
  quietly cite themselves again", not "this sentence is in that PDF"]`
- **Three non-replayable targets still wait on decisions**, unchanged this pass.
  `[open: RCA100's fault-type rubric is 25 KB of CC BY-NC data this project does not
  redistribute, AIOps2025's TA fallback needs a model and a threshold, and ITBench's two
  NTAM metrics need weights the paper leaves tunable]`

---

## v2.06 — the corpus nobody in this repository wrote

### One thing a released artefact had, and this project had never opened

`microsoft/OpenRCA` publishes four CSVs under `rca/archive/`: what a baseline agent
submitted, the criteria the official evaluator marked passed and failed, and the score
it wrote down. 335 rows. They are the only real OpenRCA population in existence, and
until this pass the rule had been replayed against 25 cases composed here.

The derivation is `scripts/derive-openrca-archive.mjs`; the corpus is
`golden-master/openrca-archive.json`, 139 KB of `(roots, criteria, score)` triples with
the four file digests beside them.

### What a row gives away, and what it does not

`passed` and `failed` are newline-joined values, not lists — that is what pandas does to
a list written into one cell. Together they **are** the criterion set, because
`file_evaluate` writes `failing_criteria = set(components+reasons+times) - set(passing)`.
What the columns do not say is which *kind* each value belongs to.

That is decided by `task_index`. `task_1`..`task_3` declare one kind, so placement is
forced. `task_4`..`task_7` interleave three, and the flattening has lost which is which —
unless the row names one root, in which case the `groundtruth` cell names all three values
and the derivation *reads* the placement rather than guessing it, refusing any row whose
key is not exactly the recovered set.

| | rows | two-root |
| --- | --- | --- |
| `Bank` | 136 | 20 |
| `Market-cloudbed-1` | 70 | 26 |
| `Market-cloudbed-2` | 78 | 29 |
| `Telecom` | 51 | **0** |
| **all** | **335** | **75 (22.4%)** |

**Telecom has none**, and the three others run between 14.7% and 37.2%. The multi-root
branch is not a corner case that happens to exist; it is a third of two of the four
systems, and its absence from one of them is a fact about the 30-minute conflict window
`generate.py` uses to decide what "multi-response" means.

### The number the 25-case corpus could not produce

Of those 75, **33 are replayable** and 42 are not: a two-root key spread across three
criterion kinds leaves the second root's values with no kind, and inventing one would be a
rule written here. So they are excluded and counted, and the test asserts the count.

**33 against 2.** The hand-composed corpus named two multi-root cases; the released
population has thirty-three in the slice that can be reconstructed. Every previous claim
about the matching rule rested on the smaller number.

### Acceptance

| gate | result |
| --- | --- |
| corpus | **293 cases** replayed, 42 excluded and counted, 335 rows accounted for |
| agreement | **293 of 293** reproduce the score the official evaluator wrote |
| partial credit | 0 ×216 · 0.33 ×9 · 0.5 ×28 · 0.67 ×2 · 1 ×38 — five distinct values, not a boolean |
| multi-root | 33 replayed (1 full, 9 partial, 23 zero); **10 cases change score** when only the first root is kept |
| derivation tested | both refusal branches and both failure exits, on a synthetic archive built with `renderCsv` |
| `core` test suite | **157 files, 3917 tests passed** (as of `9f18c78`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `9f18c78`) |
| repo test suite | **161 files, 4104 tests passed** (as of `9f18c78`) |
| coverage | core **99.97 / 99.73 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Free credit, and the second half of the same defect

The derivation was wrong on its first run in a way worth recording: it mapped a criterion
kind back to an answer-key field by stripping a plural `s`, which turns `times` into `time`
while the field is `datetime`. Every three-kind task failed the reconstruction, and the
failure read as *"the archive disagrees with this repository"* — 102 rows of it. The archive
agreed with nothing; the reader could not see a field.

That is the same shape as the finding this whole campaign keeps meeting: **a mismatch is
not evidence about the other side until the reader has been checked.** The fix was one
table instead of a string operation, and the 102 rows became replayable on the next run.

### Open

- **42 rows of the archive are outside the replay.** `[open: a two-root key across three
  criterion kinds needs the second root's `groundtruth` row, which the archive does not
  keep; recovering them would mean re-running upstream's `generate.py` over its own
  metadata, which needs the dataset the README points at Google Drive for]`
- **The corpus cannot be re-derived in CI.** `[open: its input is the four CSVs, which
  `check-no-vendored-data.mjs` refuses to keep; `--check` exists and is tested, but no job
  can supply the bytes, so the digests are the only thing tying the file to a tree]`
- **Four v2.05 items did not move this pass**: `pr` is a lower bound, `em` is one root
  cause wide, a quote cannot be checked mechanically, and three targets wait on decisions.
  `[open: each carries its own reason in the v2.05 section; restating them here would be a
  second copy of an argument, so this line only says they are still open]`

---

## v2.07 — the task file answered one of the three questions

### The column

`{system}/query.csv` has carried, since the format existed:

```
instruction_id,query,occurrence_datetime
case-001,The order service became slow at 08:10 UTC+8. Find the root cause.,2026-09-06 08:10:00
```

`occurrence_datetime = localTime(injectTime)`. The file's own documentation says *"Task
input. One row per case. Must never contain the root-cause answer"*, and the name of the
directory above the code says `# tasks (safe to hand to the agent)`.

`main/evaluate.py` scores three things: the component (string equality), the reason (string
equality) and the occurrence time (**within 60 seconds**). Every case this exporter emits
carries all three elements, so `openRcaTaskIndex` always selects `task_7`, so the time
criterion is scored on every case. **The task file stated it, to the second, in a column.**

### Why `answer-key-isolated` was green

The check greps the file for the literal tokens `root cause component`, `root cause reason`
and `root cause occurrence`. The leak was a *column named* `occurrence_datetime`. No token
matched, because the check was looking for a sentence and the defect was a field.

That is the third time in this campaign that a check has been right about the shape it was
written for and blind to the shape that arrived. It is the same failure as the reader that
could not see `datetime` (v2.06), one level up: **a predicate expressed in a vocabulary
cannot see a value expressed in another.**

### What upstream does, and where the sentence is

`generate.py` builds the solver-facing prompt from `main/task_specification.json`, whose
first input line is `time range: {time_period}`; `time_period` comes from
`timestamp2timeperiod`, which floors the wall clock to a half hour and renders
`"{start} to {end}"`. Both files are pinned here by digest (`af63c4d2…` and `113bf4b6…`),
fetched through the contents API at the commit the evaluator is pinned at.

So the question upstream asks inside a 30-minute window is *which second*, and the answer
is worth 60 seconds of tolerance. This repository asked it inside the same window and then
printed the answer beside it.

### The fix, and the check that would have caught it

The column is now `occurrence_window`, and its value is `openRcaTimePeriod(injectTime)` —
the same half-hour bucket, in the same `A to B` shape, in UTC+8.

`task-carries-no-scored-value` is new, and it is not a spelling rule. It reads the answer
key the export already carries, collects every value the scorer awards credit for
(component, reason, onset, across every root), and requires that **no cell of the task file
equals one of them**. Three choices are deliberate and stated in the code:

- **Whole cells only.** Whole-word matching in the prose would flag "the order service
  became slow" when the component is `order` — which is how every incident report a human
  writes reads. The leak this exists for is a field that holds the answer, not a sentence
  that mentions it.
- **Against the exported key, not a template.** A future exporter that writes the onset
  under a new name is followed without being told.
- **A task row with no key row is skipped.** `row-alignment` owns "these files describe the
  same cases"; a second, differently worded verdict on the same fact is how two checks
  start disagreeing.

The report names the column that leaked and never the value: a score report is a document
a solver may be shown.

### Acceptance

| gate | result |
| --- | --- |
| the task file | `occurrence_window`, `2026-09-06 08:00:00 to 2026-09-06 08:30:00` for an 08:10 onset |
| the check | `task-carries-no-scored-value`, 5 tests: the real export, an onset cell, a component cell, a reason cell, a row with no key |
| the blind spot | the onset-cell test asserts `answer-key-isolated` is **green** on the same input, so the two checks are provably not the same check |
| `openRcaTimePeriod` | 5 tests: floor, both boundaries, last second of a window, midnight rollover, and "never renders the instant" |
| `core` test suite | **157 files, 3927 tests passed** (as of `902edd5`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `902edd5`) |
| repo test suite | **161 files, 4114 tests passed** (as of `902edd5`) |
| coverage | core **99.97 / 99.73 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **The example incident states its own answer.** `[open: `examples/order-prod/bundle.json`
  and three siblings carry `"The order service became slow at 08:10 UTC+8"` as the query
  text, which names the onset and the component of a fixture whose ground truth is those
  two values, and the OpenRCA export now prints a window beside a sentence that says the
  second. The check above compares cells, so it does not fire; fixing it is a fixture change
  across nine targets and is recorded rather than folded into a contract change]`
- **Upstream's own task format has the same shape, at 1 in 30.** `[open: a window whose
  start is within 60 seconds of the onset hands that case's time criterion to a solver who
  guesses the start. This repository may floor exactly as upstream does or may not; the
  choice is not derivable from any released artefact]`
- v2.06's two items, and v2.05's four, are unchanged.
  `[open: each carries its own reason in its own section]`

---

## v2.08 — the anchor was checked in one place, and half of it at all

### What CI said that the suite could not

v2.07 renamed a column. `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`,
`pnpm official:check` and every example check were green locally. CI failed at one step:

```
Golden Master verification FAILED
  - files/order-prod/query.csv: expected aec9318e… got 469715c7…
```

`golden-master/verify.mjs` re-exports the committed fixture and compares every emitted
byte against `expected.json`. **Nothing in the suite ran it.** It was wired into CI and
nowhere else, so the one check that exists to prove byte stability was the one check a
local run could not fail — which is the precise drift every other guard in this
repository was built to prevent.

The anchor itself was right to fail. The export changed on purpose.

### Half of the anchor was never read

`expected.json` records `sha256` **and** `bytes` for every file. The verifier compared the
digest and ignored the count. A recorded field that is never read is worse than an absent
one: a reader takes it as checked, and the file it lives in is the one
`check-no-vendored-data.mjs` exempts from its size rule on the strength of being an index
rather than data — so the number is not decoration, it is how big the artefact is.

Both are compared now, and each has its own failure message, so deleting one cannot hide
behind the other.

### What changed

| | before | after |
| --- | --- | --- |
| who runs the verifier | CI only | CI **and** the suite, at the point a change is made |
| `sha256` | compared | compared |
| `bytes` | recorded, never read | compared, with its own message |
| the failure branch | unreachable outside a real regression | reachable, and observed by three tests |
| the anchor path | fixed to the shipped file | `--expected <path>`, defaulting to the shipped file |

The `--expected` flag exists for the same reason `derive-backend-support.mjs` has one: a
guard that is only ever seen passing is the defect finding 121 was written about. No CI
step changes, because the shipped path is the default.

### The anchor moved, deliberately

```
files/order-prod/query.csv
  sha256  aec9318e1a84ece2ec05b1035dcba5a9597bc3d57aacd164d221645016d3513d
       →  469715c78c325ae1ebf03d7907b8b01f0461edf9fdcaa9af2414a0c3dbc91d23
  bytes   137 → 158
```

Two changes in one file: the header column name, and an onset replaced by a 30-minute
window that is 21 bytes longer. It is exactly the diff v2.07 argued for, and it is now
also the first anchor move that a local run can catch.

### Acceptance

| gate | result |
| --- | --- |
| the suite runs the comparison | 8 tests: the shipped anchor, both empty-group guards, and five branch cases |
| digest vs byte count | separate assertions, separate messages |
| why not spawn the script | a spawned run reads `dist`, which other files mutate and rebuild; the export is computed from `src` instead |
| missing on either side | `<missing>` reported for a file the anchor omits and for one it invents |
| `core` test suite | **158 files, 3935 tests passed** (as of `7c830b7`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `7c830b7`) |
| repo test suite | **162 files, 4122 tests passed** (as of `7c830b7`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / `golden-master/verify.mjs` | green |

### Open

- **A moved anchor is still updated by hand.** `[open: `expected.json` has no writer, and
  giving it one would let a broken export re-anchor itself -- which is worse than the
  manual step. What the suite now guarantees is that the step cannot be *forgotten*; it
  cannot guarantee it was *justified*. The commit message is the only record of that, so
  every anchor move has to be stated in one]`
- **Eight earlier items are unchanged**: v2.07's two, v2.06's two, v2.05's four.
  `[open: nothing in this pass touched any of them -- it is a list of what is still
  owed, and the argument for each one lives where it was made rather than here]`

---

## v2.09 — the example answered the question it was asking

### The sentence

Every format doc renders the same case. The task text was

> The order service became slow at 08:10 UTC+8. Find the root cause.

against ground truth `component: order`, `reason: CPU saturation on the order service`,
injection at `2026-09-06 08:10:00` UTC+8. **Two of the three scored criteria are in the
sentence**, and since v2.07 the same export prints `occurrence_window = 08:00–08:30`
beside it — the window `main/evaluate.py` actually asks about, with the answer written
next to it.

### Why the fix is not in the exporter

v2.07 put `task-carries-no-scored-value` in the structural check, and that check compares
**cells**. It deliberately does not scan prose: a whole-word rule would flag "the order
service became slow" when the component is `order`, which is how every incident report a
human writes reads. **A caller's prose is the caller's business**, and a check that
punishes it would be a check people route around.

This file is the other half of that decision. The repository's own example is not a
caller's prose — it is the artefact every doc shows as the shape to copy. So the rule is
enforced where it can hold without a false positive: **on the fixtures this repository
ships.**

### The word boundary that was wrong

The first version of the guard used `\border\b`. It fired on

> A checkout request on order-prod failed.

`order-prod` is the **system name**, which a task legitimately carries, and `\b` puts a
boundary at every hyphen, so the system read as a leak of the component `order`.

The rule is "the component must not appear as a token of its own", and a token may contain
hyphens: `(?<![A-Za-z0-9_-])order(?![A-Za-z0-9_-])` matches `the order service` and
`order.` and does not match `order-prod`. The negative test above is the one that found
this, which is the reason it is in the file.

### What replaced it

Upstream's task text is template-shaped: `main/task_specification.json` asks for
`time range: {time_period}` and `number of failures: {num}`, and the answer is three
separate fields. The fixture now reads the same way:

> A failure was detected between 08:00 and 08:30 UTC+8. Identify the affected component,
> when it occurred within that window, and the reason.

No component, no onset, no reason, and no `root cause …` token — the last one asserted
too, because a fixture that tripped `answer-key-isolated` would show up as an export
failure rather than as a sentence somebody wrote.

### Two anchors moved, and the pass before this one named them

```
files/order-prod/query.csv         469715c7 → e1fbfec9   158 → 233 bytes
files/order-prod/groundtruth.csv   2d6c3334 → 1136f28a   334 → 409 bytes
```

`groundtruth.csv` moves because the `instruction` column carries the same sentence. The
verifier reported **both fields of both files** in one run — the byte count included, which
is the comparison v2.08 added. Without it the message would have said only "the digest
moved" for two files, and a reader would have had to work out what changed.

### A gap's recorded reason was about the wrong thing

v2.04 recorded, for OpenRCA 2.0, that F1 / Precision / Recall are not implemented because
*"this data model carries exactly one root cause"*. That sentence is false, and it points a
future reader at the wrong repair.

The model is not narrow — `contract` is. `causal_path.json` carries one `root_cause`
object, and every answer key in the corpus names one root. **A pair set of size one makes
the three equal to EM whether or not a field exists to hold more**, so widening the model
would change no number on any case here. What the 33 two-root rows in the OpenRCA 1.0
archive establish is that a *format* can be wider — not that this one is.

The reason now says that, and `openrca2-evaluator.test.ts` holds it to two words: it must
contain `contract` and must not contain the sentence that blamed the model. A recorded
reason is the only thing standing between a reader and the wrong repair, so it gets the
same treatment as a number.

### What this pass learned about the suite's own ordering

`typecheck-entrypoint.test.ts` copies the working tree by applying `git diff HEAD` to a
clean checkout. `git apply` cannot apply a binary diff without a full index line, so a
regenerated `site/assets/rca-bench-factory-examples.tar.gz` makes that test fail **until
the pack is committed**. The failure is not a defect in the test's subject; it is a
statement that a binary artefact has no representation in a text patch. Recorded as an
open item rather than worked around.

### Acceptance

| gate | result |
| --- | --- |
| the shipped example | three fixture files, every case, no component / onset / reason / answer-key token |
| the guard | 6 tests: three fixtures, the old sentence detected, two innocent sentences not |
| the trap | `order-prod` is not `order`; the negative test is what found that `\b` was wrong |
| anchors | two files, both fields, named by the verifier in one run |
| `core` test suite | **159 files, 3941 tests passed** (as of `2a6f872`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `2a6f872`) |
| repo test suite | **163 files, 4128 tests passed** (as of `2a6f872`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **A binary artefact cannot be represented in `git apply`.** `[open: regenerating
  `site/assets/rca-bench-factory-examples.tar.gz` makes `typecheck-entrypoint.test.ts` red
  until it is committed, because the test applies a text patch of the working tree. The
  honest options are to exclude the pack from that copy, to use `git diff --binary`, or to
  leave it as a documented ordering constraint -- and the third is what this pass chose,
  since the first two change what that test proves]`
- **Widening a format is a product decision nobody has made.** `[open: the pair-set
  metrics collapse for OpenRCA 2.0 because its contract carries one root, and the reason is
  now recorded that way. Whether to widen the contract so a case can name two roots is a
  separate question -- 75 of 335 released OpenRCA 1.0 submissions name two, so the failure
  mode is real -- and it would need a target that scores a set, which none of the nine does]`
- v2.07's two, v2.06's two, v2.05's four, and v2.08's one are unchanged.
  `[open: none of them moved; each carries its argument where it was made]`

---

## v2.10 — the copy step could not carry a binary, and the failure looked like the subject

### The error

`typecheck-entrypoint.test.ts` builds a cold worktree and replays the uncommitted working
tree onto it, so the assertion is about the revision a developer is looking at rather than
the one they last committed. That replay was two inline commands:

```
git diff HEAD | git apply --whitespace=nowarn -
```

Regenerating `site/assets/rca-bench-factory-examples.tar.gz` made it fail:

```
error: cannot apply binary patch to 'site/assets/rca-bench-factory-examples.tar.gz'
       without full index line
```

and the file stayed red **until the artefact was committed**. Nothing was wrong with the
subject — the cold-tree typecheck was fine. **The fixture could not describe its own
inputs**, and reported that as a verdict about the thing it measures.

### What the old command pair actually produced

`git diff` without `--binary` writes, for every binary file:

```
Binary files a/site/assets/…tar.gz and b/site/assets/…tar.gz differ
```

That is a *description of a change*, not a patch: no bytes, no index line. `git apply`
refuses it, correctly. Measured on this tree, one appended byte:

```
$ git diff HEAD --stat  -- site/assets/…tar.gz
  Bin 5951 -> 5952 bytes
$ git diff HEAD --binary -- site/assets/…tar.gz | head -4
  index 1a7fca73…..aeb3f81d… 100644
  GIT binary patch
  delta 9
```

The flag is the difference between a sentence about a change and the change.

### The fix is a function, and the test is in a throwaway repository

`carryUncommitted(source, destination)` now lives in `packages/core/test/uncommitted-carry.ts`
and passes `--binary` to both commands (`git apply --binary` is a documented no-op on
current git; passing it states the intent instead of hoping). `maxBuffer` is raised because
a diff of a large binary is bigger than the default, and the failure would be an opaque
`maxBuffer exceeded` rather than a statement about the copy.

The tests **do not touch this repository**. They build a throwaway one, write a text file
and a file with a NUL byte in it, commit, and replay. A test whose setup mutates the tree it
is measuring can leave that tree broken, which is the defect class this pass is about.

### The control is the point

One of the six tests runs the **old** command pair and requires it to fail, with `binary` in
its stderr, and requires the destination to be untouched — which is what made the original
failure silent: the copy simply lacked the change.

> A flag whose necessity nobody has observed is a flag the next edit can delete.

That test also caught a defect in itself first: without `encoding: 'utf8'` the thrown
error carries stderr as a `Uint8Array`, and `toContain('binary')` compared a string to bytes
and failed for a reason that had nothing to do with git.

### The end-to-end proof

The unit tests prove the mechanism in a small repository. The claim being made is about
*this* repository, so the heavy fixture was run once in the failing configuration: one byte
appended to the pack, then

```
Tests  4 passed (4)
```

and the byte removed. Before the fix that run failed at `collect`, with no tests.

### Acceptance

| gate | result |
| --- | --- |
| the carry function | 6 tests: text, binary, both, the control, an empty diff, an untracked file |
| the control | the old pair fails, names `binary`, and leaves the destination untouched |
| end-to-end | the heavy fixture passes with a modified binary in the working tree |
| `core` test suite | **160 files, 3947 tests passed** (as of `488d3b1`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `488d3b1`) |
| repo test suite | **164 files, 4134 tests passed** (as of `488d3b1`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **`measure-doc-counts` dies with a stack when the suite is red.** `[open: it spawns
  `pnpm test`, and an `execFileSync` that exits non-zero propagates as an unhandled error,
  so the tool prints a captured transcript and a Node stack instead of saying "the suite is
  red, counts cannot be measured". It is the one tool whose output a person reads while
  something else is already wrong]`
- **The counts snapshot can drift from the suite.** `[open: `check-doc-counts` compares the
  documented counts against `golden-master/doc-counts.json`, not against a run -- which is
  deliberate, because it must work in a cold tree. CI closes the loop with
  `measure-doc-counts --check --from <report>`; a local edit that adds tests and refreshes
  neither file stays green locally until that CI step. The two-step update is the cost of a
  guard that never runs the suite from inside the suite]`
- v2.09's three, v2.08's one, v2.07's two, v2.06's two, and v2.05's four are unchanged.
  `[open: none of them moved this pass; each carries its argument where it was made]`

---

## v2.11 — the tool that counts answered a failure with a stack trace

### What it printed

`measure-doc-counts.mjs` spawns `pnpm test` once per scope. The spawn had no `catch`, so a
red suite became an uncaught exception:

```
Error: Command failed: pnpm --filter @rca-bench-factory/core test

  ✓ test/agent-browser…  (thousands of lines)

    at checkChildProcessResult (node:internal/child_process:324:7)
```

Someone asked for three numbers and received a transcript with a stack attached. **The one
fact they needed — the suite is red, and a count of what passed does not exist for a failed
run — was the only sentence not printed.**

That is worse than an ugly message because of *when* this tool runs. It is what a person
reaches for **after** something else has already gone wrong. A tool that answers a second
failure with a third is how a debugging session loses its place.

### Three sentences instead

```
measure-doc-counts: FAILED
  the core suite is red, so its counts cannot be measured.
  A count is what passed; a failed run has no number to publish.
  first failing test(s):
    test/alpha.test.ts > keeps the invariant
  the full run is above; re-run it with `pnpm --filter @rca-bench-factory/core test`.
```

The transcript is not replayed: `stdio` already sends vitest's own output to the terminal,
so the full text is one scroll up. The list is capped at five and deduplicated, because the
point is to name the work, not to reproduce the log.

### The distinction that keeps a broken environment from looking like a broken test

`execFileSync` fails in two different ways and they want different repairs:

- **exited non-zero** — the suite ran and something in it failed
- **never started** — `ENOENT` for `pnpm`, a signal, a working directory that is not there

Reporting the second as the first sends a reader hunting for a failing test that does not
exist. They are separate branches, and both are asserted.

### Why the diagnosis is a function

`diagnoseRedRun(scope, error)` is pure: it takes the captured error and returns lines. The
branch that used to be unreachable is now driven five ways, and the *end-to-end* path is
proven by putting a fake `pnpm` on `PATH` that exits 1 with a vitest-shaped transcript —
which is the only way to show the text reaches a terminal. The negative assertion is the
one that matters: **`Error: Command failed` must not appear**.

`SuiteFailed` is thrown rather than calling `fail()` directly, for the same reason
`derive-backend-support.mjs` takes `--out`: a branch that can only be observed by exiting
the process is the shape finding 121 was written about.

### Acceptance

| gate | result |
| --- | --- |
| the diagnosis | 6 unit tests: red, no transcript, cap, dedupe, re-run hint, never-started |
| end to end | a fake `pnpm` on `PATH`; exit 1, the three sentences, no stack |
| the old behaviour | asserted absent by name (`Error: Command failed`) |
| `core` test suite | **161 files, 3954 tests passed** (as of `711185be2`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `711185be2`) |
| repo test suite | **165 files, 4141 tests passed** (as of `711185be2`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **The counts snapshot still updates in two steps.** `[open: `doc-counts.json` and the
  published row are both hand-refreshed, and doing one without the other is green locally
  until CI's `--check --from` step. Making it one command would mean the guard running the
  suite, which is what the split exists to avoid; the honest repair is a `--write-doc` mode
  that rewrites both from a single run, and it is a design decision rather than a fix]`
- **A red suite is still a red suite.** `[open: this pass made the *report* honest, not the
  failure. Nothing short-circuits the measurement when a scope fails; the first failing
  scope stops the run, which is correct, but the two scopes after it are simply not
  measured rather than reported as unmeasured]`
- **Twelve earlier items are still owed**: v2.10's two, v2.09's three, v2.08's one,
  v2.07's two, v2.06's two, v2.05's four. `[open: this pass narrowed to one tool's failure
  message and touched no contract, no exporter and no corpus, so every one of them is
  exactly where the previous section left it]`

---

## v2.12 — the counts were updated in two steps, and only one of them was a command

### The two steps

`doc-counts.json` was written by `pnpm docs:counts`. The row in `docs/progress.md` was
written by a hand `str.replace` on a 7000-line file. The guard compares the row against the
snapshot, so **doing one without the other is green locally** and red only at the CI step
that runs `measure-doc-counts --check --from <report>`.

The two steps are not equally obvious. One is a command with a name; the other is a
transformation a person performs in an editor, and every pass in this log that added tests
had to remember it. Three of the last six passes got it wrong the first time, which is what
"remember to" looks like when measured.

### One command, one measurement, both files

```
pnpm docs:counts:write
  core  162 files, 3967 tests
  cli   4 files, 187 tests
  repo  166 files, 4154 tests
  written to golden-master/doc-counts.json and docs/progress.md (2 row(s) updated)
```

That is a real run on this tree. The diff it produced was **two lines** — `core` and repo —
because the `cli` row already carried `4 files, 187 tests` and its digits did not move.
Reporting that as three updated rows would be reporting a change the tool did not make.

Nothing is written until both writes can succeed. A failure between them would leave
exactly the half-state the flag exists to remove, so the document is rewritten in memory
first and both files are written after.

### Which rows are "current" is now one predicate, read twice

`check-doc-counts.mjs` refuses a row that claims to describe this commit and does not match
the measurement. `measure-doc-counts.mjs` rewrites the rows that claim it. If the two
disagree, the failure is silent in one direction and destructive in the other: a writer
whose predicate is too wide **edits a dated record** — the numbers a past pass measured,
which are supposed to differ — and a writer whose predicate is too narrow reports success
over a stale number.

So `CURRENT_MARKERS` and `scopeOf` moved into `scripts/doc-counts-vocabulary.mjs`, a data
module with no `main` and nothing to prove, read by both.

The `scopeOf` move was not cosmetic. The checker reads the scope from a row's label cell;
the first writer matched on `` `core` `` with backticks and therefore **skipped the `repo`
row**, whose label in this document is written without them. That version would have
updated two rows of three and printed success.

### The first live run refused, correctly

Against the shipped document it reported five lines and wrote nothing:

```
line 837: a current-state row names no scope: false as a description of the workflow's current state: …
line 3980: a current-state row names no scope: | `check-doc-counts` | refused the change first: pass 39's
           and pass 40's `as of this commit` rows were dated …
```

The predicate was "a line containing a current-state phrase". The *document* uses that
phrase in prose, in blockquotes, and in a change-log table that quotes it. So the rule is
narrowed to what the checker actually reads — **a table row that either names a scope or
publishes the count shape** — and a row that only quotes the phrase is left alone. A writer
that cannot tell a claim from a sentence about a claim edits sentences.

That regression is now a test, and the case that found it is the fixture: a change-log row
quoting `as of this commit` must survive untouched.

### Acceptance

| gate | result |
| --- | --- |
| the rewrite | 10 unit tests: three rows, digits only, idempotent, four refusals, marker wording, a quoting row |
| end to end | synthetic vitest reports; snapshot and document both written from one measurement |
| the half-state | a document with no current row writes **neither** file, and says so |
| contradiction | `--check --write-doc` exits 1 rather than picking a verdict |
| a live run | `pnpm docs:counts:write` on this tree: 2 rows moved, `cli` correctly untouched |
| `core` test suite | **162 files, 3967 tests passed** (as of `4ebcec791`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `4ebcec791`) |
| repo test suite | **166 files, 4154 tests passed** (as of `4ebcec791`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **Starting a new pass still means dating the old rows by hand.** `[open: the writer
  maintains "the rows that say they are current", and a new pass turns the previous pass's
  rows into a dated record -- which is an edit no tool can infer, because it is a statement
  about what that pass measured. Two lines per pass, and getting them wrong is caught by
  `check-doc-counts` on the next run]`
- **A red suite still blocks the write.** `[open: `--write-doc` takes its measurement by
  running the suite, so a red suite means no measurement and no write. That is correct --
  a count of what passed is meaningless for a failed run -- but it means the tool cannot
  repair the document when the document is what made the suite red. Escaping that needs the
  write to accept `--from <reports>`, which it already does; the tool does not say so when
  it refuses]`
- v2.11's two, v2.10's two, v2.09's three, v2.08's one, v2.07's two, v2.06's two, and
  v2.05's four are unchanged. `[open: this pass touched the counting tool and nothing else;
  each argument is where it was made]`

---

## v2.13 — the report carried a verdict, and nothing read it

### Two paths, one verdict, one reader

The spawn path knows a run failed because `execFileSync` throws. The exit code **is** the
verdict, and `parseSummary` never sees the summary line of a red transcript.

A report has no exit code. The verdict is *in* the record — `status: 'failed'` on a file,
`status: 'failed'` on an assertion — and `countsFromReports` did not read either. It read
only two things: whether a file said `passed` (to count files) and whether an assertion
said `passed` (to count tests). Both are the *right* readings of a green run. On a red one
they compose into a number nothing prints:

```
Test Files  1 failed | 1 passed (2)      →  files: 1
     Tests  20 passed | 3 failed (23)    →  tests: 20
```

That is the passing half of both lines at once: the failing file dropped from the file
count, its passing assertions kept in the test count. A file count that says almost nothing
ran, beside a test count that says twenty did.

### The tool contradicted itself

v2.11 taught the spawn path to say, in one sentence, that a red run has no count:

> A count is what passed; a failed run has no number to publish.

The report path, in the same file, published one. **One rule, two implementations, and the
untested one was the one that writes into the document** — `--write-doc --from <red report>`
put that number into `docs/progress.md` and printed success.

### A test asserted the arithmetic and never asked whether the number should exist

`measure-doc-counts-readings.test.ts` had this:

```ts
const editFailed = report('core', (parsed) => { parsed.testResults[0]!.status = 'failed'; });
expect(countsFromReports([editFailed, report('cli')]).core.files).toBe(0);
```

It is named "does not count a skipped assertion or a failed file as a pass", and it checks
exactly what the name says: the failed file is not counted as a file. It never asks what the
count is *for*. The test was green for eleven passes while the number it endorsed was
unpublishable, which is the same shape as v2.06's reader that could not see a `datetime`
field: **a check is only as good as the question it was written to answer.**

### What the refusal says

```
measure-doc-counts: FAILED
  the report at …/core.json records a failure, so it is not a measurement:
    packages/core/test/beta.test.ts
  A count is what passed; a failed run has no number to publish.
  What this function would produce is the passing half of vitest's `N failed | M passed`
  line -- the failing file dropped from the file count, its passing assertions kept in
  the test count -- which is a number neither reading prints.
  Fix the failure and take the measurement from a run that passed.
```

Both halves of the record are read, because either alone leaves a report that a person would
call red and this function would call counted: a file can say `passed` while carrying a
failed assertion, and a file can say `failed` while carrying none at all (a collection
error). A failing file is named **once**, and its assertions are not repeated — the file is
what someone opens. Assertions are named only when the file claims to have passed, which is
the one case where the file name alone points at something that does not look broken.
Duplicates are removed and the list is capped at five, as in the run diagnosis.

`COUNT_UNAVAILABLE` is now one exported constant, said by both paths, because they refuse
the same fact. Two copies of that sentence would drift the way the two readings did.

### The refusal also had to say what the flag is for

v2.12's open list ended with: *"the tool does not say so when it refuses"*. It does now, and
it had to be worded carefully, because `--from` is **not** a way around a failure — a report
of *this* run is refused. What it saves is the second 80-second run when a green one already
wrote its report:

```
If a green coverage run already wrote its report, `--from <report>[,<report>]` reuses that run instead of a second one:
  --from packages/core/node_modules/.cache/vitest-report.json,packages/cli/node_modules/.cache/vitest-report.json
```

The word *green* is load-bearing: it is the difference between advice and a workaround.

### Acceptance

| gate | result |
| --- | --- |
| a red file in a report | refused; the file named once, `COUNT_UNAVAILABLE` present |
| a red assertion in a file that says `passed` | refused; `file > fullName` named |
| list shape | capped at five, deduplicated, `fullName` / `title` / neither all named |
| `--check --from <red>` | exits 1 and does **not** print `is stale` or `OK (` |
| `--write-doc --from <red>` | exits 1, writes **neither** file, prints no `row(s) updated` |
| the old assertion | replaced by the refusal it should have been; the arithmetic it endorsed is named in the test |
| the diagnosis | names `--from`, the word `green`, and both report paths |
| `core` test suite | **162 files, 3974 tests passed** (as of `e6709c32b`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `e6709c32b`) |
| repo test suite | **166 files, 4161 tests passed** (as of `e6709c32b`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

The two readings were held against each other once more, on this tree: `pnpm docs:counts:write`
took 162/3974 from a spawned `pnpm test`, and `--check --from` read 162/3974 from the coverage
run's report. **They agree**, which is the only reason either number may be published.

### Open

- **Starting a new pass still means dating the previous pass's rows by hand.** `[open: the
  writer maintains "the rows that say they are current"; turning yesterday's into a dated
  record is a statement about what that pass measured, and no tool can infer it. Two lines
  per pass, and getting them wrong is caught by `check-doc-counts` on the next run]`
- **A red suite still blocks the write, and that is correct.** `[open: `--write-doc` takes
  its measurement by running the suite, so a red suite means no measurement and no write.
  `--from` lets a green report stand in for the run; nothing lets a red one, which is the
  point of this pass]`
- **`diagnoseRedRun` and the report refusal are two diagnoses with one sentence.** `[open:
  they share `COUNT_UNAVAILABLE` and nothing else -- the run names tests from a terminal
  transcript, the report names files from a record, and neither can produce the other's
  evidence. That is two implementations of one *claim* rather than of one rule, but it is
  the shape this campaign keeps finding, so it is recorded rather than declared safe]`
- v2.12's first item, and the fourteen items before it, are unchanged. `[open: this pass
  touched one function's verdict and the sentence next to it; every argument is where it
  was made]`

---

## v2.14 — the transcript was being guarded by its own layout

### The rule nobody wrote

A red vitest summary line reads:

```
Test Files  1 failed (1)
      Tests  2 failed | 19 passed (21)
```

The pattern this repository reads a transcript with is anchored on `Test Files` followed by a
number and then `passed`. On a red line the first number is the **failed** count, so the
pattern cannot match. A red transcript was therefore never counted.

**Nobody had written that rule.** The layout of the line was doing the guarding, which is the
same thing as saying there was no guard: nobody could point at it, nobody had tested it, and
the next person to relax the pattern would not know they were removing one.

Two defects were living behind it.

### The diagnosis was about the wrong thing

A red transcript fell through to `could not read <scope> counts … vitest may have changed its
summary format`. The counts were indeed unreadable, and the sentence sent the reader to look
at a version bump rather than at a failing test. A message is a hypothesis, and this one was
usually false.

### It only held for a line that was entirely red

```
 Test Files  1 passed (1)          ← matched, summed
      Tests  20 passed (20)
 Test Files  1 failed (1)          ← matched by nothing, invisible
      Tests  2 failed | 3 passed (5)
```

This returned `{files: 1, tests: 20}`. A transcript with one green block and one red block is
exactly what `pnpm test` produces when the first workspace passes and the second does not —
and that is **the same silent dropping `--from` was doing in v2.13, one format over**.

### Reachability, stated honestly

`measure()` never sees a red transcript today: `execFileSync` throws on the exit code before
the summary is parsed. So the shape above is unreachable **through this script's only caller**.

It is not unreachable in principle, because the exit code is a claim about a process, not a
fact about the output: a wrapper script, a `|| true`, a reporter that swallows the status, or
a caller that feeds captured output from an earlier run all break it. `parseSummary` is
exported and documented as *the* reading of a transcript, and the program it lives in already
had two other readers with their own verdicts.

So the reader got one. The end-to-end test in `measure-doc-counts-red-run.test.ts` puts a fake
`pnpm` on `PATH` that prints

```
 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
```

and **exits 0**. The script exits 1 anyway, having read the transcript and disagreed with the
process:

```
measure-doc-counts: FAILED
  the core transcript records a failing run, so it is not a measurement:
    1 test file(s) failed, 2 test(s) failed
  A count is what passed; a failed run has no number to publish.
  Take the measurement from a run that passed.
```

**The exit code is not the record**, and the reader that exists to read the record needs its
own opinion of it.

### The branch that could only be observed by exiting

`parseSummary` reported both of its failures with `fail()`, which ends the process. A refusal
that can only be observed by exiting is the shape finding 121 was written about — and it is
why the "could not read" message had never been asserted anywhere. Both refusals are thrown
now (`TranscriptRecordsFailures`, `MeasurementUnavailable`) and are driven directly by four
tests, including one that asserts a *negative*: the format sentence must not appear when the
transcript clearly says what happened.

### Acceptance

| gate | result |
| --- | --- |
| a red summary | refused, with the failed counts on their own line, and no format diagnosis |
| green block then red block | refused — it used to return the green half (`{1, 20}`) |
| no summary at all | still says the format may have changed, because that is when it is true |
| exit code 0, transcript red | the script exits 1 on the reader's verdict, not the process's |
| the shared sentence | `COUNT_UNAVAILABLE` is said by all three refusals; the two readers are asserted to be different mechanisms |
| `core` test suite | **162 files, 3979 tests passed** (as of `7d980bf4c`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `7d980bf4c`) |
| repo test suite | **166 files, 4166 tests passed** (as of `7d980bf4c`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **Three readers, one sentence, three mechanisms.** `[open: an exit code, a `status` field
  and a summary line are three different kinds of evidence, so the three refusals cannot share
  a body -- only the sentence and the conclusion. Sharing the sentence is what makes them
  recognisable as one rule; it does not make them one implementation, and this campaign has
  already been wrong once about which of two copies was the tested one]`
- **`skipped` is still not a failure and still not a count.** `[open: a run whose files are
  all skipped prints no `N passed` line, so it is refused as unreadable rather than counted as
  zero. That is the same answer by a different route, and it is not asserted anywhere]`
- **The rest of the open list is untouched.** `[open: v2.13's three, v2.12's first, and the
  fourteen before them; this pass changed one function's two refusals and the sentence they
  say]`

---

## v2.15 — a skipped file was subtracted, and a skipped suite was called a format change

### Three shapes, captured

Every line below came from this vitest, on a scratch project, rather than from memory. The
exit code is beside each, because it decides whether the reader ever sees it.

| shape | summary lines | exit |
| --- | --- | --- |
| one file, all `it.skip` | `Test Files  1 skipped (1)` / `Tests  3 skipped (3)` | **0** |
| one passing file, one file all skipped | `Test Files  1 passed \| 1 skipped (2)` / `Tests  2 passed \| 2 skipped (4)` | **0** |
| one passing test, one `it.todo` | `Test Files  1 passed (1)` / `Tests  1 passed \| 1 todo (2)` | **0** |

All three exit 0, so none of them is caught by an exit code — and all three reached this
repository's readers.

### What the readers did with them

**The whole-suite case was misdiagnosed.** `Test Files  1 skipped (1)` contains no
`N passed`, so it fell through to *"could not read the counts … vitest may have changed its
summary format"*. That sentence was written for a shape nobody had seen; a quarantined suite
is not a shape change, it is a decision somebody made in a `describe.skip`, and the message
sent the reader to the wrong file.

**The partial case was silently subtracted.** `Test Files  1 passed | 1 skipped (2)` matched
the `1 passed`, summed it, and returned one file. The skipped file vanished from a count that
claims to say how much of the suite passes — the second file was simply not in the number, and
nothing said so. `--from` agreed, because it reads the same record and a skipped file has
`status: 'skipped'`, which is neither a pass nor a failure.

That agreement is what made it invisible: **two independent readers producing the same wrong
number look like a cross-check.**

### The rule, decided once

A skipped test is not a pass, so it does not belong in the published count — the row says how
many tests *passed*, and `1 passed | 1 skipped (2)` has to read as one file. The defect was
never the arithmetic; it was that the arithmetic had no voice.

So:

- **A run in which nothing passed is not a measurement.** Zero is what an empty suite, a
  quarantined one and a suite that failed to be collected all report, and a published row
  cannot tell those three apart. Refused, on both readers, in one body with one differing
  word: `run` for a summary line, `record` for a `status` field.
- **A run in which something passed is measured**, and the amount skipped travels beside the
  number:

```
core  162 files, 3985 tests  (1 file(s) and 2 test(s) skipped, not counted)
```

That line prints only when there is something to say, so a count that moves because six tests
were skipped now has its reason on the same line — which is the difference between a number a
person can check and a number they have to trust.

### Three things the snapshot must not learn

`doc-counts.json` is a committed contract read by `check-doc-counts.mjs`, `--check` and the
document rewrite. The reader now returns a third key, and `serialise` chooses `{files, tests}`
explicitly rather than copying whatever the reader returned — so a diagnostic cannot change
the file's shape as a side effect. The end-to-end test asserts the written file has exactly
those two keys, and that the note appears once per scope on the terminal.

### One parser, not eight regexes

The first version of this pass added two more `matchAll` calls to the four already there: one
per status, per line. That is how the two readings of "a passing test" got born in v2.13 — the
same record read by parallel copies of one idea. `tally()` now scans a summary line once for
`N (passed|failed|skipped|todo)` and sums into one object, and the parenthesised total is
deliberately not read: it is the sum of the four terms that are.

### Acceptance

| gate | result |
| --- | --- |
| a fully skipped suite | refused as *passed nothing*, with the skip counts, and **no** format diagnosis |
| a partially skipped run | counted as what passed, with the skip counts carried beside it |
| a `todo` | counted as skipped, never as a pass |
| the report reader | refuses the same fact, says `record` instead of `run` |
| the snapshot | `{files, tests}` and nothing else, asserted by key list |
| the terminal | one note per scope, only when non-zero |
| `core` test suite | **162 files, 3985 tests passed** (as of `d888e3cc1`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `d888e3cc1`) |
| repo test suite | **166 files, 4172 tests passed** (as of `d888e3cc1`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **A skip is now reported, not prevented.** `[open: nothing stops a passing test from
  becoming `it.skip` -- the count drops, the guard calls it stale, and the note explains why.
  Whether the guard should *refuse* a drop that is entirely explained by skips is a policy
  question about whether quarantine may change a published baseline, and this repository has
  no answer in any document]`
- **The `0 passed` rule is per scope, and `repo` is a scope.** `[open: a fully skipped `cli`
  refuses `cli` and therefore `repo`, so `--write-doc` cannot run; that is the intended
  consequence, and it has not been exercised against a real two-package tree with one package
  quarantined -- only against synthetic reports]`
- **v2.14's and v2.13's items, and the fourteen before them, are unchanged.** `[open: this
  pass touched the reader's arithmetic and its two printed forms]`

---

## v2.15, addendum — the gate I ran could not fail

CI failed this pass on `lint:cold`, at `check-no-mock.mjs`:

```
  …/measure-doc-counts-readings.test.ts:89  // `it.skip` x3 in one file -- exit 0.
  …/measure-doc-counts-readings.test.ts:320  // in a `describe.skip`.
```

The guard scans every `.ts` under `packages/*/test` line by line for the skip tokens and does
not distinguish a comment from code. Two comments that *documented measured behaviour* read as
the behaviour itself.

The comments are reworded. But the part worth recording is why they were committed at all.

### What I was actually running

For this pass and several before it, the local gate was:

```sh
pnpm lint 2>&1 | grep -c FAIL
```

It printed `0` every time. `check-no-mock` does not print the word `FAIL` — on failure it says
`Mock / skip usage is not allowed:` and exits 1, and `pnpm` appends `ELIFECYCLE`. So the
number was zero because the string never occurs, not because nothing failed. **The check could
not fail**, and it certified ten passes of lint that it never looked at.

The correct gate is one line longer and says something:

```sh
pnpm lint >/dev/null; echo $?
```

This is the same defect this whole campaign is about, one level up: a predicate expressed in a
vocabulary the record does not use. Every other guard in this repository was checked against
the thing it claims to measure; the check *on* those guards was a grep for a word, run by hand,
recorded as "green".

### What caught it

CI, which runs the exit code. That is the second time in ten passes that the remote job
reported something a local run had already "verified" — v2.08 was the first, and its
counterpart was a suite that never ran the verifier.

### Not fixed here

- **`check-no-mock` still reads comments as code.** `[open: the alternative is a comment
  stripper in front of the scan, and a commented-out skip is arguably dead code that the guard
  is right to refuse. What it costs is that a test cannot explain a skip in its own words --
  the explanation has to live somewhere the guard does not read, which is why the captured
  shapes are documented in the script instead]`
- **The verification recipe is still prose.** `[open: nothing in the repository states how to
  check a change locally, so each pass invents one -- this pass invented a broken one. A
  `verify:local` target would give one exit code and would also be a second copy of CI's step
  list, which is the kind of duplicate this log keeps finding; the honest form of it has not
  been designed yet]`

---

## v2.16 — how to check a change here is now a command, and it reads the workflow

### What the last pass left

F-82's second half: *"nothing in the repository states how to check a change locally, so each
pass invents one -- this pass invented a broken one."* The obvious repair, a `verify:local`
script listing the commands, is a **second copy of `ci.yml`**, and a copy drifts: the day a gate
is added to the workflow, the copy keeps saying green. That is the same defect one turn further
out.

So the commands are not written down anywhere. They are **read out of `ci.yml`**, and the only
hand-written thing is the one thing that cannot be derived:

```
verify:local — 36 of 43 run steps can run here

  local   verify / Build (core then cli; cli resolves core's dist)
  local   verify / Test with coverage (core + cli, ≥95% per dimension, 100% functions)
  …
  remote  verify / Install a backend this repository did not write
          installs prometheus through apt and binds a port
  remote  batteries / Publish the gate-test battery report
          writes to a GitHub artefact/annotation, which needs the run token
```

`pnpm verify:local` runs 31 distinct commands covering those 36 steps, in CI order, and stops at
the first failure with the step's name and its command. Commands that appear in several jobs —
`pnpm install`, `pnpm build` — run once; a second identical command on one machine proves nothing.

### The table is the artifact, and it is checked four ways

`scripts/gate-steps.mjs` holds `STEP_PLAN`: one entry per `run:` step, `local` or
`remoteOnly: "<reason>"`. `gate-steps.test.ts` holds it against the workflow:

| rule | what it prevents |
| --- | --- |
| every `run:` step has an entry | a gate added to CI and silently missing from the local plan |
| every entry has a step | a renamed step leaving the plan quietly |
| every `remoteOnly` reason is ≥ 40 characters | "needs a runner" as a reason |
| every `uses:` is one of four setup actions | a gate hidden in an action, which the plan cannot see |

The last one was not in the first draft and is the one worth keeping: **a `uses:` step is not
classified by the table, so an action that decided something would be invisible to it.** The
closed list of four — checkout, node, pnpm, artefact upload — is what makes "no gate is an
action" checkable rather than assumed.

### A closed list that closed itself

Writing the table by hand, five keys came out truncated — `…(no survivors, no inert, no
misattributed)` for a step whose name continues `mutations`. The validator reported all five as
a pair: *"no plan entry"* and *"in the plan, but no such step exists"* — the same wrong key seen
from both sides. That is exactly the class of error the table exists to catch, and it caught it
before the file was ever committed.

### The two exits that had no test

`verify-local.mjs` has three failures: the plan does not match, the filter selects nothing, and
a step fails. The second is easy. The other two need a workflow that differs from the shipped
one, and a test may not edit `ci.yml` to observe a branch.

`RCA_CI_WORKFLOW` is the answer, and it is not a testing hook: checking a workflow edit before
pushing is `RCA_CI_WORKFLOW=/tmp/ci.yml pnpm verify:local --list`. With it, both branches are
driven by **the shipped workflow with one thing changed** — a renamed step, and a command
replaced by `exit 3`. Same shape as `golden-master/verify.mjs --expected`.

### CI found the one thing this pass got wrong, and it was the shape of the fix

The first push failed at `Every gate can be shown to fail`:

```
UNATTRIBUTED  verify-local.mjs  exited 1 and named no failing test
```

That harness hollows each gate with `process.exit(0)` and requires a *named* failing test. The
gate was hollowed, `gate-steps.test.ts` failed -- but the test **imported** the hollowed module,
so the vitest worker died at import and vitest reported a crashed file, not a failing test.

The fix is a rule worth keeping: **a module that can be hollowed must not be a module a test
imports.** `runSteps` and `describePlan` moved to `gate-steps.mjs`, which has no exit and
therefore is never a subject of that harness; `verify-local.mjs` is now imported by nothing and
only spawned. Hollowed, the spawns return 0 where the tests require 1, and five tests fail by
name. Verified by doing exactly that to the file and restoring it byte-for-byte.

A crashed worker is not a verdict, and the harness was right to say so.

### Where the tool immediately paid for itself

Two spot runs, on this tree:

```
$ node scripts/verify-local.mjs --only "Documentation guards"
  … gate-sites.json is stale: scripts/verify-local.mjs:123 …
verify:local: FAILED at 1/2
  step:    artefacts / Documentation guards are satisfied
  command: pnpm docs:check
```

That is a real failure, in this pass's own files, found by a command rather than by a grep —
which is precisely what the previous pass did not have.

### Acceptance

| gate | result |
| --- | --- |
| the plan | 56 steps read, 43 with `run:`, 36 local, 7 remote-only, 0 errors |
| the commands | 31 distinct, in CI order, deduplicated |
| all four validator rules | driven by 29 tests, including a synthetic workflow per parser shape |
| the three exits | all driven: plan mismatch, empty selection, failing step |
| `verify:local --list` | prints every step and every reason |
| `gate-sites` | 68 sites across 40 scripts, 68 annotated, `--check` OK |
| `core` test suite | **163 files, 4014 tests passed** (as of `5647737e5`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `5647737e5`) |
| repo test suite | **167 files, 4201 tests passed** (as of `5647737e5`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green, by exit code |

### Open

- **A green local run is not a green CI run, and the tool says so rather than fixing it.**
  `[open: seven steps need a runner, and no amount of local work will run them. The plan prints
  them every time, with reasons, which is the honest form -- but "verify:local passed" will
  still be quoted by someone as "CI will pass", and nothing in the output stops that reading]`
- **`remoteOnly` is checked for length, not for truth.** `[open: a 60-character reason that is
  wrong passes. The only defence is that seven entries are few enough to read, and the test
  asserts the count is stable at seven -- adding a step that "needs a runner" for a lazy reason
  would move that number and be visible in a diff]`
- **The plan covers the workflow, not the workflow's `if:` conditions.** `[open: no step in
  ci.yml is conditional today; the day one is, the plan will claim to run something CI skips,
  and the parser will not notice because it does not read `if:`]`
- **v2.15's four items and the fifteen before them are unchanged.** `[open: this pass added a
  tool and its table, and touched no guard, no exporter and no corpus]`

---

## v2.17 — the plan read three keys and stepped over seven

### What the previous pass could not see

`readWorkflow` looked for `run:` and `uses:` inside a step block and ignored every other key.
The shipped workflow has thirteen `with:`, two `if:` and one `env:` — and the reader noticed none
of them.

Two of those three matter, and one nearly did:

- `if: always()` on **Publish the gate-test battery report** and on **Upload** — both outside the
  local plan, so the ignore was harmless *by luck*.
- `env: GITHUB_TOKEN: …` on the publisher — also outside the plan.

The failure mode was one edit away. `if:` on a step marked local would have made `verify:local`
report `[4/31] verify / Something` for a step CI skips on most runs, and nothing in the output
would have said so. **A key that is not read is not absent; it is unchecked.**

### Read, tolerate, or refuse — and no fourth case

`STEP_KEYS` now states what this reader does with each key, and `LOCAL_INCOMPATIBLE` names the
ones that change *whether*, *where* or *with what* a command runs:

| key | on a local step |
| --- | --- |
| `if:` | refused — the condition decides whether the step runs at all |
| `env:` | refused — the runner does not reproduce the environment |
| `shell:` | refused — the runner always uses `sh -c` |
| `continue-on-error:` | refused — a failure that does not fail the job, read here as a failure |
| `working-directory:` | refused — the runner always uses the repository root |
| `with:` | refused on a `run:` step, which GitHub does not allow either |

The same keys are **tolerated on a step that does not run here**, because there they cannot make
the claim false — and the tolerance is now *printed*:

```
  2 step(s) outside the plan carry a key this runner does not reproduce:
    batteries / Publish the gate-test battery report — if, env
    batteries / Upload the gate-test battery report — if
```

Ignoring and tolerating look identical in a diff. One of them is a decision and the other is a
gap, so the plan says which.

Two keys are tolerated anywhere, for a stated reason: `id:` is a name, and `timeout-minutes:` is a
resource bound — a step that is slower on this machine still fails in the same way.

An unknown key is an error. `strategy:` today means a matrix, and a matrix would make "the plan"
mean several runs; the reader says it does not know rather than guessing it is harmless.

### The tolerance is used, which is how it was tested

A rule that permits something the tree never does is a rule nobody has exercised. The shipped
workflow carries `if:` twice, both outside the plan, so `gate-steps.test.ts` asserts exactly that:
those two keys, those two steps, and that neither appears among the local ones. If one of them
ever became local, the shipped-plan test fails before CI does — which is what a plan is for.

### Acceptance

| gate | result |
| --- | --- |
| the ten key rules | each driven both ways: refused on a local step, tolerated on a remote one |
| unknown key | refused, with the key named |
| `with:` on `run:` | refused; `with:` on `uses:` kept |
| the shipped plan | 0 errors, 2 tolerated conditionals named in `--list` |
| `gate-steps.test.ts` | **46 tests** |
| `core` test suite | **163 files, 4031 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **167 files, 4218 tests passed** (as of this commit) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 68 across 40 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green, by exit code |

### Open

- **A tolerated key is checked for presence, not for meaning.** `[open: `if: always()` and
  `if: github.ref == 'refs/heads/main'` are both "a condition", and both are refused on a local
  step -- but on a remote-only one the difference is invisible. That is acceptable while the only
  tolerated conditions are `always()`, and it stops being acceptable the first time one is not]`
- **The runner still cannot honour any of the five.** `[open: each refusal offers two repairs --
  make it remote-only, or teach the runner the key. Teaching it `working-directory` is a `cwd`
  per command and teaching it `shell` is a shell per command; neither is hard, and neither has a
  caller today. Building them before there is a step that needs them would be inventing a
  feature to satisfy a test]`
- **`timeout-minutes:` is tolerated without being enforced.** `[open: a step that hangs locally
  hangs for as long as the machine allows, where CI would kill it. The tolerance is about the
  verdict, not about the wall clock, and the distinction is now written down but not tested]`
- **v2.16's three items and the nineteen before them are unchanged.** `[open: this pass touched
  the reader's key handling and the plan's printed form]`
