# The audit passes

This section lived in `docs/progress.md` until v3.65, as `## Audit passes`. It moved because the index
grew past the smallest volume it indexes -- a relation `check-progress-volumes.mjs` has printed since
v2.35, with the sentence that said what would happen next: *twenty kilobytes of headroom, about six
rounds, and then the split becomes an instruction instead of an opinion.* A record of passes is not what
an index is, and the document it belongs to is this one.

Nothing was rewritten in the move. The table, each pass's account of why it was chosen, and the
injection matrix for each are the text that was in the progress log, with the heading promoted one
level because it is now the document's title rather than a section of another one.

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

**The `Defects` column is each pass's own count at the time, and it is not the finding
numbering.** The eleven numbers sum to **42**, which is also how many findings are numbered
1–42 — and the correspondence is a coincidence, not an identity: finding 39 is the 2 GiB
`readFileSync` defect, whose subject is **pass 6** (`scripts/fetch-official.mjs`), numbered
39 because the real-corpus runs found it. Findings are numbered by when they were found and
passes by when they were run, and the two orders diverge. Nothing checks this column, and
nothing can: it is the only record of the counts, so writing the sum into a guard would
have made an equation that stays true when one of the numbers is edited. See finding 204.

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
