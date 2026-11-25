# Progress tracking

Status of the acceptance pyramid, with the evidence for each line. "Path
executable" and "number reproduced" are kept apart throughout: the first is
something CI can prove today, the second needs official data that is not
vendored.

## Headline

| Layer | Claim | Status | Evidence |
| --- | --- | --- | --- |
| L0 | Deterministic core correctness | **met** | `pnpm typecheck` clean **from a cold check-out** (the script builds core first; see below); `pnpm lint` clean; the suite's counts are published once and checked against a run by `check-doc-counts`, so they are not restated here |
| L1 | Transform invariants | **met** | 7-strategy matrix, idempotency and zero-silent-loss suites |
| L2 | IR contract integrity | **met** | G1/G2/G3 gates, reference integrity, time consistency; G3 carries a signal-validity half (P1-1) |
| L3 | Gate and export soundness | **met** | mutation batteries with no survivors and no inert steps; the export surface is enumerated across **every module in `src/`, every runtime symbol, 0 orphans**, with exemptions keyed by symbol rather than by module |
| L4 | Official reproduction | **3 of 4 anchors met; the fourth round-trips all three corpora** | Golden Master, mutation suite and the official-metric regression are green in CI every push; the real-corpus round trip is **375 / 375** (`rcaeval-re1`), **270 / 270** (`rcaeval-re2`) and **90 / 90** (`rcaeval-re3`), all at `oracle=1.00` with their pins agreeing -- see `## The last measured round trip`. **What remains is not the number**: `oracle` is the metric's ceiling, not a solver's accuracy, and the upstream loader still refuses to rank a system it does not know (`SLI not implemented`), which is a product decision rather than a measurement |
| L5 | End-to-end scenarios | **met** | CLI scenarios and HITL budget suites |

**Both CI workflows were green on the revision this paragraph was written about**
(`4181060ee`): `CI` run `36122305441` has all 18 steps `success`, and `Anchor round trip`
run `36122305396` has all 12 `success`. That is the full local gate list executed on a
clean machine. The paragraph is kept as the record of one verification, and the run ids
are not updated: the current round-trip numbers live in `## The last measured round trip`,
which is checked, while a run id in prose is a number nothing re-reads.

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
with a coverage gate. The four figures below are the measurement taken at
**v3.83** (2026-11-11); each round's own copy of them is the `coverage` row of its
`### Readings` ledger in the progress log, and that row is written by the round that
ran the suite. This section is retaken when the residual's *shape*
changes, not every round -- a table retaken every round is a table whose figures
get typed rather than measured, which is how the 99.93 this table used to publish
came to exist (finding 481). v3.83 is such a retake: six branch positions closed
(nine to three), and the residual below re-enumerated one position at a time
rather than in one sentence (findings 517 and 518).

**What reads these four numbers now.** `scripts/check-coverage-readings.mjs` compares them
with the `total.<dimension>.pct` of that run's own `coverage-summary.json` -- v8's counters,
which is the instrument the table names -- at two decimal places, and prints the figure with
the instrument in the same sentence. CI runs it with `--require` in the step that already
reads that run's reports, immediately after `pnpm test:coverage`; `docs:check` does not run
the suite, so it does not carry that guard, and where there is no report the script says
`UNCHECKED` rather than passing on nothing (finding 543). The two instruments differ by 0.01
on this tree -- v3.102 moved statements and lines from 99.97 to 99.98 by adding one covered
function -- which is why the sentence names the instrument instead of saying "coverage"
(finding 539).

| Dimension | Result | Gate |
| --- | --- | --- |
| Statements | 99.98% | ≥ 95% |
| Branches | 99.95% | ≥ 95% |
| Functions | 100% | ≥ 95% |
| Lines | 99.98% | ≥ 95% |

The residual is three statements and three branch positions, enumerated by the
position the tool counts and not by the source line that carries it: v8 records
one outcome per conditional, so a `||` whose left side is true on every input
still leaves its right side unmeasured (the lesson of pass 7, below), and one
guard can therefore be three positions.

1. The `never` guard at the end of `aggregateFor` (`src/score/official.ts:2056`,
   three statements and the position at `:2037`, which is the fall-through that
   reaches it). Every member of `ScoreTargetId` returns from a branch above it, so
   no input reaches it — it is a compile-time backstop, and it is the one group
   here that a tenth score target trips at *build* time.
2. The `?? 0` on `evidenceHits` in the pooled AIOps2025 aggregate
   (`src/score/official.ts:1973`). Every case of that target writes the count, so
   no input reaches the fallback, and it stays because its absence is worse than
   its cost: the count is **summed**, and `undefined` in a sum is `NaN` — a report
   whose Explainability tenth reads `NaN` while every other figure reads 0..100.
   The fallback five lines below it, on the compared `la` term, was removed for
   the opposite reason (finding 518). Closing this last one means a `terms` map
   typed per target rather than `Record<string, number>`, which is a structural
   change and is carried as a leftover, not as a coverage figure.
3. The `Number.isSafeInteger` test in the CLI's `parseInteger`
   (`src/cli/args.ts:240`), provably redundant within every range the CLI
   declares. The measurement is in `audit.md` and the exemption is argued in
   `acceptance.md` §2.39.

Group (1) is a backstop the type system enforces, group (2) is one the type
system cannot express, and group (3) is an exemption with an argument — three
different reasons for an uncovered position, and none of them a covered line. A
guard removed because a test cannot see it is not a covered line; it is a missing
guarantee. A guard removed because the type makes it impossible is a smaller
type. And a guard kept because its absence prints `NaN` is a guard that owes a
reader the sentence saying so, which is why (2) is *one* position and not two.

Groups (1) and (2) are therefore opposite cases and are not allowed to shelter
each other. A guard removed because a test cannot see it is not a covered line;
it is a missing guarantee. A guard removed because the type makes it impossible
is a smaller type.

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
`src/score/modalities.ts` after the v3.81 rewrite, driven from `100 | 98.29 | 100
| 100` to `100 × 4` by three positions: two that no input could reach and were
deleted, and one that was reachable and had never been taken (findings 513, 514).

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

The fourth anchor's path now runs on the real corpus, twice. Each figure below is held to
`golden-master/roundtrip.json` by `scripts/check-roundtrip-record.mjs`, and that file's pins are held to
`golden-master/official-assets.json` by the same guard -- so a number here that stops matching the
record fails the documentation gate in both the warm and the cold-tree job. One block per anchor,
because the two runs measured different corpora and a single table would have to sum things that are
not the same thing.

### rcaeval-re1

Measured by `official-data.yml` run `38250480271` at `167e08f28`.

| item | value |
| --- | --- |
| anchor | `rcaeval-re1` |
| cases declared by the corpus | **375** |
| cases round-tripped at `oracle=1.00` | **375** |
| cases that did not | **0** |
| mean oracle score across the scored cases | **1.00** |
| worst per-case oracle score | **1.00** |

### rcaeval-re2

Measured by `official-data.yml` run `40400190945` at `fe871088b`. This is the run that closed the gap
findings 261 to 264 worked through: the fetch ran to completion against a destination that can hold the
corpus, the two cut transfers resumed, the registry's three pins agreed with a fresh measurement, and
the 270 cases loaded once the reader learned the corpus's second shape.

| item | value |
| --- | --- |
| anchor | `rcaeval-re2` |
| cases declared by the corpus | **270** |
| cases round-tripped at `oracle=1.00` | **270** |
| cases that did not | **0** |
| mean oracle score across the scored cases | **1.00** |
| worst per-case oracle score | **1.00** |

### rcaeval-re3

Measured by `official-data.yml` run `40430588523` at `ecec7f581`. This is the run that closed the
anchor: 90 cases, 0 skipped, 0 failed, all five assets pinned by the same download, and the first
time the code-level slice produced a score at all — before it, every case in it was refused by the
exporter for a fault category the corpus states only through its suite name (finding 268).

| item | value |
| --- | --- |
| anchor | `rcaeval-re3` |
| cases declared by the corpus | **90** |
| cases round-tripped at `oracle=1.00` | **90** |
| cases that did not | **0** |
| mean oracle score across the scored cases | **1.00** |
| worst per-case oracle score | **1.00** |

### What these tables do not claim

They do **not** claim either score agrees with upstream's published numbers.
`oracle=1.00` is the official rule applied to the ground-truth root cause, which is the scorer's own
ceiling and not a solver's accuracy. Upstream's published figures are *solver* accuracies over the same
corpora; ours is the metric's ceiling, so the two are not comparable as they stand. What would make
them comparable is running upstream's own scorer, with its own answer key, over the same corpus --
that is the remaining half of P0-2 and it is unmeasured.

And they do **not** replace the dated per-pass records further down this file, which say what each
pass measured at the time.

## Audit passes

The passes -- what each audited, how many defects it found, what guards it added, and the injection
matrix for each -- are `docs/audit/passes.md`. They moved there at v3.65, when this index passed the
smallest volume it indexes: a record of passes is not what an index is, and the audit is the document
that keeps records of them.

One reading stays here, because it is about this index rather than about the passes: the `Defects`
column summed to **42**, and exactly 42 findings were numbered 1–42, and the two facts are unrelated
-- passes are numbered by when they were run, findings by when they were found. The story is in
`audit/passes.md`, and it is kept because it is the reason no guard compares the two columns.

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
| Commits (at `e22e2de`) | 536 |
| Packages | `@rca-bench-factory/cli`, `@rca-bench-factory/core` |
| Source files | 98 |
| Source lines | 34,609 |
| Test files | 260 core + 4 cli |
| Test lines | 119,593 core + 3,242 cli |
| Tests | 7,007 core + 187 cli |
| Tracked files | 679 |

`node scripts/check-repository-table.mjs` derives all eight rows and fails when one has
drifted, when a label is one it cannot derive, and when a row has gone missing. That is
what this table did not have until v3.80, and the reading is worth keeping: **every one of
the eight was wrong** when the guard was first run against it -- commits `95` for 530,
source files `45` for 97, tests `2341` for 6,246 -- because a current-state table with no
reader is right exactly once, at the pass that took it (finding 508).

What each row counts, because a number without its population is a different number:

| Row | Derivation |
| --- | --- |
| `Commits` | `git rev-list --count <revision>`, at the revision the label names |
| `Packages` | `packages/*/package.json`, in the order `git ls-files` reports them |
| `Source files` | every `.ts` file under `packages/*/src/` |
| `Source lines` | newlines in those files -- `wc -l`, which is what a line count means |
| `Test files` | every `.test.ts` under `packages/<scope>/test/`, held **equal** to the `files` count in `golden-master/doc-counts.json` |
| `Test lines` | newlines in those files |
| `Tests` | `golden-master/doc-counts.json`, which the suite itself measures |
| `Tracked files` | `git ls-files` |

Two properties are worth stating because they are the ones that can fail.

**`Test files` and `Tests` are read from two places and compared.** The guard globs the
test directories and the snapshot records what the runner reported; a glob that stopped
matching would describe a smaller repository in perfect silence, so the disagreement is
refused rather than averaged.

**`Commits` is dated, and the date is checked.** It is the one row that cannot be
current: the commit that writes it would be the commit it would have to count. So it names
the revision it measured -- `Commits (at `e22e2de`)`, retaken at v3.86 -- and the guard
resolves that revision and recomputes the count from it. A reader can verify it against a
checkout forever; a current number could only ever be verified once.

The numbers describe the **working tree**, which is what lets them corroborate a suite that
reads the working tree: the first draft globbed `git ls-files`, and a test file that had not been
committed yet was invisible to it, so the row said 244 files beside a runner that had just counted
245. A tree with uncommitted source edits fails the guard until the numbers are re-taken with
`--write`, and that is the intended direction -- the table describes the tree the gate ran on.

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

**This is the only live list.** An entry arrives when the round that raised it declined to
close it, and **leaves** when something closes it: it is deleted from here and moved into
[the record of closures](progress/closed.md), where it **keeps its number** and slots in at its place. A
round's own heading is `### Left open`, and it is a record of that round, frozen: nothing
appends to it afterwards, and a reader who greps for what is open is asking this list, not
those.

The split is v3.111's, and it is a repair rather than tidying: an entry used to be struck
where it stood, so this list carried its own history and grew by it -- **65,544 of 98,927
bytes** at v3.110, two thirds of the file a reader opens to find out what is left. The index
is bounded by the volume that is still open, so the size of a list of closures was the reason
the log could not start another volume (finding 568). `check-open-list.mjs` refuses a struck
entry here and an unstruck one there, which is what keeps the two apart.

The record is a **set of files** from v3.113: `closed.md`, then `closed-NN.md` from `02` up, contiguous, and
the guard discovers them rather than naming one -- a second file it did not read once took ten closures out of
the corpus while it printed `none is missing` (finding 572). The budget that bounds a volume bounds the last of
them, and names the next one for the round that crosses it.

Both headings were called `Open` until finding 207, which is how the same reader got
fifty-eight answers, one of which was current. The rename was the repair; a sentence saying
which was which would have left the names lying.

**Every entry carries an id**, `O-001` to `O-0NN`, right after the bullet and outside the claim:
`- O-001 · **The claim.**`. One space, shared with [the record](progress/closed.md), and **dense** -- the two
files hold 1..N between them with nothing missing, which is what `check-open-list.mjs` recomputes on every run
(finding 570). Two consequences a round has to live with. **A new entry takes one more than the highest number
the two lists hold**, because any other number leaves a hole: the convention is now arithmetic. And **an entry
still leaves by being closed**, carrying its id into the record -- a hole in the space is refused as an entry
that left without being closed, and an id in two files is refused as the copy that both of the split's
refusals walk past. A closure is therefore always two edits, and the number of open entries below is
counted, not remembered.

Most entries below are **limits** rather than tasks: each names something this repository
does not do, why, and what would close it.

Checked at v3.146: **47** entries open. The number is arithmetic: `check-open-list.mjs` counts the entries
below it, refuses a number that is not that count, and refuses a round older than the newest round in this
corpus. It cannot check that a surviving entry is still *true* -- that takes the measurement the entry is
about -- so what it buys is that a round stood in front of every entry it counts. v3.62 is the round
that needed it: the list had said "open" about a page that had been made a page, about a flag whose other
half had been read, and about a creation path a real push had already paid for.

v3.93 is the round that closed two entries by making their subject a sentence the tree can check: the
246 directories with no cluster column now have a *weak* claim with a name and a failure path
(finding 542), and the four coverage figures now have a reader that computes them from the run's own
report and names the instrument (finding 543). Both closures are guarded, and neither closure is a
measurement of the corpus: the inequality has run on fixtures only, and that is written in the entry
itself rather than left for the next round to discover.

v3.95 is the round that turned that last sentence into a number, and the number refused everything.
The inequality's first reading of the corpus failed step 13 with **246 of 246** directories over the
bound, because its log side was keyed by the second a row fell on while the table is keyed by the
fifteen-second window that second starts (finding 545). Every fixture had written its rows on a
boundary, which is the one instant where the two clocks agree. After the floor, the same 271
directories read 25 reproduced and 246 bounded with nothing refused, in 2 m 13 s, from three archives
whose digests match the registry. The entry that asked for that reading is in the record now, and the three
entries this round adds are what the reading left behind: the workflow that found the defect has not
run since the repair, the gate compares buckets without asking whether the table's time column is on
the grid -- 0 of 26 116 published rows are off it, so the refusal is available and unbuilt -- and three
rounds in this log are prose in a language the rest of it is not written in.

v3.63 is the round that found the number itself was counting a **rule** that had gone wrong. Two entries --
both in the record now -- used half of a shape this log has used since v2.44: the reason struck through, the closure named
after it -- and the headline, which the guard reads, was never struck. The guard counted them as work,
and the stamp agreed, because the stamp is computed from the guard. Reading the list is what disagreed.

v3.64 read the same list and found its own sentence in the previous round's write-up: `19 record(s) in
table form (185 row(s)) whose rows were not judged`, where 147 are rows and 185 is the number of pipe
lines. The entry that asked for a vocabulary for the `state` column was closed by measuring the column
instead -- 78 values over 147 rows, a median cell of 75 characters -- so the list is one shorter and the
numbers in it are the numbers their subjects have.

v3.65 read the list against the **record the newest round left**, and four residuals were in that record
and nowhere else -- the only P1 in this log among them. A record's `item` column is a place a residual can
live with no entry behind it, and the stamp could not see it: the number is arithmetic over the entries
below, so a residual that is not an entry is not a residual as far as the stamp is concerned. The guard
prints both counts and had never asked whether they were talking about one set. The four are entries now,
which is why this list is longer rather than shorter, and the newest round's record must quote an entry it
is a row about rather than paraphrase one that no `grep` will find.

- O-001 · **Anchor 4 is closed for the three RCAEval anchors only, and only once a
  real-corpus run has been recorded.** The 11 fetchable assets cover
  `rcaeval-re1`, `rcaeval-re2` and `rcaeval-re3`. The other six score targets —
  both OpenRCA targets, RCA100, AIOps2025, Cloud-OpsBench and ITBench — have no
  automated fetch, so for those targets the fourth anchor still rests on the
  synthetic path in `anchor-roundtrip.yml` and nothing more. That is a smaller
  claim than "the fourth anchor is closed" and it is the accurate one.
  `[open: the six remaining score targets -- both OpenRCA targets, RCA100, AIOps2025, Cloud-OpsBench and ITBench -- still have no automated fetch, so for them the fourth anchor rests on the synthetic path alone]`

- O-002 · **The OpenRCA shard-cache route does not work, and the registry said it did.**
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
  `[open: making the six shard repositories a source means having them publish an artifact instead of populating a cache, which is a change in those repositories and is not made here]`

- O-003 · **Active injection is planned, not performed.** `src/fault/injector.ts` emits a
  Chaos Mesh document for each of the five kinds and reads the controller's report
  back, and both halves are pure -- a probe over the source finds no `fetch`, `exec`,
  `kubectl`, `child_process` or filesystem access at all. Applying the document needs a
  cluster, and a test that needs a cluster is a test that does not run in CI. So the
  milestone's exit condition -- five kinds, each with at least one case, through the
  full chain to the official scorer -- is **not met**; what is met is that each kind's
  document is correct, refusable, and asserted against Chaos Mesh's API shape. The
  remaining work is a cluster runner. See finding 51.
  `[open: applying the document needs a cluster, and a test that needs a cluster is a test that does not run in CI, so the remaining work is a cluster runner rather than another unit test]`

- O-004 · **The Chaos Mesh mapping is asserted against a hand-written table, not against the
  CRD.** The mapping was derived from the documentation and is asserted for internal
  consistency and for the `TimeChaos` trap specifically -- no test validates it with a
  live `kubectl apply --dry-run=server`, so a field renamed upstream would not be
  caught here.
  `[open: no test validates the mapping with a live kubectl apply --dry-run=server, so a field renamed upstream would still not be caught here]`

- O-005 · **The corpus's label table reached two call sites, and the product's front door was not one of
  them.** v3.35 named the corpus's eleven fault types; v3.36 measured how far that reading travelled,
  and the answer was two places -- the census and `scripts/check-official.mjs`. Every other way into the
  product reads a fault type through `ingestPrimeDataset`, which asked the descriptor for a category and
  otherwise handed an unstated one to `inferFaultCategory`, so `socket`, `f1` and `f3_1` all arrived as
  `unknown` and the target that admits code-level faults only refused the slice that exists to exercise
  it. `readCorpusCategory` answers only where the classifier is silent and `undefined` everywhere else,
  and `prime` now falls through to it; a descriptor that states a category still wins, including against
  the table, because a descriptor may describe a corpus this table has never read. The runner's own copy
  of the rule was deleted, and the deletion is the measurement: all 84 assertions across the round-trip
  and census files pass without it, including the `zzz` case that must stay unstamped. See finding 346.
  `[open: the five code-level names read out of the paper still reach no target -- nothing exports a fault's name]`

- O-006 · **The export enumeration covers the whole package.** `cli/`, `ingest/`,
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
  the record of what that pass changed, not a description of the tree today. The
  module and export counts are the list's own and this paragraph no longer restates
  them: v3.102 added one export, and the sentence that said **538** was the second
  place that had to be edited -- which is the drift it describes and not an exception
  to it (finding 554). The exemption count is **37 entries, two of which are runtime**
  (`llm/provider.ts::*` and `index.ts::assembleBundle`); the other 35 are
  `ir/types.ts` type aliases that erase at runtime. Pass 13 found that the same three literals had drifted three
  different ways — 43 in the test file's own comment, 45 here, 46 in the L3 row —
  which is why the test file no longer states any of them and points at the list
  instead.
  **v2.46 measured the clause this entry has carried since pass 11**, and it was
  two claims wearing one sentence. The first — "it asserts a name is mentioned,
  not called" — is a measurement nobody had taken: **61 of the 506 names in
  `TESTED` are named by no test file at all**. The second — that the list
  therefore over-claims — is not what the list says, and the obvious repair would
  have been wrong: `readOpenRcaGroundTruth` is called by `score/official.ts`,
  `getUnitDef` by `convertUnit`, the four CSV builders by
  `scripts/format-spec.mjs`, `isVocabularyMember` by a gate. A name-level rule
  would have produced 61 findings, most false, and the repair would have been an
  exemption table with 61 rows.

  What actually answers "is this export exercised" is the **coverage gate**, which
  runs the suite and requires **100% function coverage** — asserted inside the
  enumeration test now, so lowering it fails there rather than leaving this list
  reading as if it covered execution.
  `[open: the list proves an export exists and is listed; the coverage gate proves it runs; no instrument states *how* it is exercised, and the completeness of index.ts as a surface still rests on pack-manifest-completeness and the package exports field]`

- O-007 · **`glm-embedding-3` benchmark scheduling** is out of scope for this package;
  the LLM-dependent paths here are behind a provider-agnostic abstraction.
  `[open: the LLM-dependent paths here sit behind a provider-agnostic abstraction, and
  scheduling a benchmark against a hosted embedding model belongs to whichever package
  owns the model rather than to this one]`

- O-008 · **The attempts recorded before v3.57 name no tip, and the file is one attempt behind.** All five
  carry `rev: null`, because their rows never named a commit and a reader that filled one in would
  be inventing the fact the field exists to report. The attempt that carries this round's push is
  appended after the ref has moved, so it lands in the tree one push later.
  `[open: the field is written from the next attempt on, so the count the summary prints --
  `0 with a named tip` -- is the measure of how much of the history predates it; and an attempt
  cannot record itself in the push that carries it, so the file is always its own last reader]`

- O-009 · **P13: a mutation is one substitution.** Every mutation battery in this repository makes a
  single edit, so a rule that is only wrong when two edits are made together is covered by
  none of them. v3.57 measured the prediction instead of restating it: every **pair** of its
  thirteen substitutions was applied and restored together, and **78 pairs, 78 red, 0 survived**.
  `[open: 78 pairs of *known* mutants is not the space of double edits -- a pair composing two
  changes neither of which is in the battery is still unmeasured, and so is a mutation of the
  assertion rather than of the code]`

- O-010 · **`backend`'s install bound has not met a slow day.** The 16-minute bound is sized from a
  648-second cold runner and a 273-second ordinary one.
  `[open: no recorded run has installed prometheus from a mirror slower than 648 seconds, and
  the bound will be re-sized from the first one that does rather than guessed at now]`

- O-011 · **The sensitivity shards are cut by file count, not by cost.** Both hold 25 claimant files, and
  the step that does the work measured **439 s** in shard 1 against **199 s** in shard 2 on run
  `466` -- and **248 s** against **387 s**, the other way round, on the run that split them
  (v3.54). Near-equal claim counts (55 and 64) predict neither number, so the cost is per-file
  suite cost, which only the battery can measure, on the machine that pays it. See finding 462.
  `[open: a split by cost needs a per-file recording made where the cost is paid -- on a runner --
  published where a plan can read it, and a rule for when that recording is stale; the shard's own
  bound is the backstop, so the split is expensive rather than unsafe, by 240 s of every run]`

- O-012 · **The remote's history and the local one share no name above a boundary 272 commits old.** Every
  push here rebuilds a commit from the local revision, so the remote's tip is a reconstruction rather
  than the object this checkout holds: below the boundary the two agree byte for byte, and above it
  they are two histories that carry the same trees. That is why a record's `the remote tip is <sha>`
  line names a commit no local command can print.
  `[open: convergence means rewriting the remote's history, and this channel refuses to move a ref backwards by design -- a force push is the one ref update it will not make, so the two histories stay two]`

- O-013 · **The currency line proves a round counted the list, not that it read it.** The stamp at the top of
  this section -- fifteen entries open, read at v3.65 -- is arithmetic over the entries below it, and the guard recomputes it. A number
  computed from the guard cannot disagree with the guard, so the stamp is sharp about the count and
  silent about whether a round looked at any entry -- and v3.63 and v3.64 each printed a number that
  was wrong about the thing it stood for.
  `[open: the one sentence a round cannot fake is an entry's headline saying what closed it, and that shape is required of a struck entry only -- a round's reading of the entries it leaves open is still a count, which is the half this stamp cannot check]`

- O-014 · **The base search reads one remote tip per branch this checkout does not have.** `locateBaseAmongRefs`
  walks every remote head whose commit is not in the local ancestry and asks the transport for its
  tree, stopping early only when a candidate lands at depth one. The cost is the repository's branch
  count rather than the push's size.
  `[open: bounding it needs a reading of how many twin tips a real push meets, and this repository holds five refs -- no attempt here has met enough of them to size a bound, so a constant chosen now would be sized from this repository alone]`

- O-015 · **A bounded ref count is a floor, not a count.** `refs()` walks at most ten pages of a hundred and
  answers `complete: false` when it stops, so the sentence a reader acts on says "at least". The bound
  is unexercised rather than wrong: this repository holds five refs, and the walk has never stopped.
  `[open: only a repository of more than a thousand refs would make the walk stop early, and this one holds five -- the floor is stated as a floor, and the sentence that reads it is the only thing that could turn it into a count]`

~~**The seven target contracts carry three copies of one version and no equation.**
  `*_CONTRACT_VERSION` constants, a `Contract version` line in each `docs/targets/*.md`, and a
  field in `scripts/format-spec.mjs` are written separately. They agree today and nothing
  requires them to, which is the shape of finding 462 -- one fact in three places is three
  facts the first time one is edited.
  `[open: equality across the three needs a guard that reads a constant, a markdown cell and a
  generator's field as one claim, and the vendor row in the same table is a fourth field with
  no reader at all -- it has said "Microsoft" about a paper from another institution since
  2026-09-10, so the repair is to give the table a guard before giving it a fourth equal sign]`~~
  **Closed by finding 477**, which is the reason this entry named a fourth field: the vendor was
  not a fifth thing to equate, it was the proof that the table was a paraphrase. `contractVersion`
  left the specification (the constant is the only writer), the whole table is generated, and
  `gen-examples.mjs --check` refuses a page that disagrees (finding 478).
~~**G5 has no near-duplicate and no window-overlap arm.** The fingerprint is a six-tuple hashed
  with FNV, so it catches an exact copy and nothing else: two cases built from the same incident
  with a minute moved are two cases as far as this gate is concerned.
  `[open: the shipped corpus offers no witness -- 435 same-system pairs, 0 with a window IoU above
  0.8, 0 fingerprint collisions, and a maximum task-text Jaccard of 0.308 -- so the only evidence
  a new arm could have is a fixture, and a rule whose only failure is synthetic is a rule this
  list has learned to distrust]`~~
  **Closed by finding 479.** Two arms now compare a case with its neighbours -- `NEAR_DUPLICATE_QUERY`
  at a 0.90 set Jaccard over the task text with function words dropped, `OVERLAPPING_WINDOW` at a
  0.50 IoU over two half-open windows -- and the corpus's own figures are the reading the entry said
  it could not have: **435** pairs, closest task text **0.25**, most overlapping window **1/6**, and
  **0** refused on either arm. The 0.308 this entry published was not a measurement the rule can
  reproduce; the figure it can is 0.25, and a test asserts it. The entry was also wrong about where
  the risk sat: the guard fed G5 **one case per bundle**, so even a working pairwise arm would have
  been silent, and the ten identical copies in `check-fault-cases.test.ts` passed for that reason.

- O-016 · **A record's terms are a map of strings to numbers, so nothing can say which keys a rule writes.**
  The aggregate reads `evidenceHits` and `la` out of `OfficialCaseScore.terms` with index access,
  and `noUncheckedIndexedAccess` therefore hands it `number | undefined` for a key that target's
  producer writes every time. One of the two reads keeps a `?? 0` because of it -- the summed one,
  where absent would be `NaN` -- and the other lost its fallback at v3.83, when the measurement said
  that absent and `0` answer the same comparison (finding 518).
  **Decided at v3.94 (finding 544), and still open.** Both cast-free designs were derived and both are
  a rewrite rather than an annotation. A generic record plus a `{[K in ScoreTargetId]: Aggregator<K>}`
  table is total by construction, but the dispatch indexes it with a target of the *union* type, so the
  value is a union of function types and calling one requires the argument to satisfy every member --
  one `as` at the lookup is the only way through. A discriminated report narrows correctly, but only
  when the `{ target, cases }` pair is *constructed* inside the arm: assembled from a union-typed
  target and an `A[] | B[]` array the correlation is gone, so the cast-free version collapses the case
  scorer, the aggregator and the report assembly into one per-target builder, nine times over. That is
  a rewrite of the module every published number comes from, for one branch -- the summed `?? 0` at
  `official.ts:1973` -- and the risk is already covered at run time: `official.test.ts` asserts
  `report.breakdown.evidenceHits` on a real export, so a producer that stopped writing the key fails
  a test today. What the type would add is that it fails at build time instead.
  `[open: one of the two things that would make the price worth paying -- a second target reading a key
  another target writes, which is the shape where a wrong key silently answers 0 and no report test
  pins it, or a `?? 0` in a sum whose 0 is a wrong answer rather than a no-op]`

- O-017 · **A window can still outlive the sentence that describes it, when the sentence is prose.** The two
  repairs in v3.73 were each pointed at the right number by a *string*: a log body reading
  `degradation window 09:12-09:30 UTC` and a checkpoint description reading "the two hours between the
  deploy at 09:00 and the revert at 11:00". Nothing compares either with `window.end`, and the guard
  that found them was asking about a parameter, not about the window.
  `[open: a place where a window's two endpoints are cited as data rather than written in a sentence --
  the same question `signalRef` answered for a reading's identity]`

- O-018 · **A case that states no level publishes a default beside a floor that may outrank it.** `difficulty`
  carries the documented `unset -> medium` row, so a case with a three-step chain and no annotation
  prints `medium` beside a `difficulty_floor` of `hard`: two words that disagree, and nothing that says
  which is which. The shipped corpus holds **0 of 34** such cases, which makes the repair a rule whose
  only failure is synthetic, and the three ways to write it each move a documented row -- the level
  could default to the floor, the pair could carry a third word for "nobody claimed", or the export
  could refuse the case outright.
  `[open: which of the three, decided by a corpus that has one -- the shipped thirty-four have none]`

- O-019 · **`docs/acceptance.md` grows by a clause per round, and the clauses are nearly half of it.**
  The per-round clauses are **960 lines at v3.133** and **82,344 bytes at v3.133**, in a document of
  **2,114 lines at v3.133**. L3 is **330 lines at v3.131** and L4 is 405; L0, L1, L2 and L5 are 14, 7, 7
  and 6, so the obvious split by layer would produce four files of a dozen lines.
  The measurement the entry asked for exists now, and it refuses the section as the unit: of the **37**
  per-round clauses, **35** hold both a current rule and the way it was reached, so moving the clauses
  would carry **431 lines at v3.133** of rule into the history with **414 lines at v3.133** of
  provenance. Read per bullet -- the
  unit the shape actually has -- **125** of the **217** state a rule and **92** state that a number
  moved.
  `[open: the axis is "current rule" against "how it was reached" and the unit is the bullet, not the
  section -- the move itself has not been made, and the index relation is re-checked after it]`
~~**The newest round's ledger is not required to carry a coverage row.** Of the **54** `### Readings`
  blocks this log holds, **24** carry one and **30** do not, v3.64's and v3.65's among them. The row is
  what a later reader looks for when asking what a round cost, and v3.66 answered it only after
  measuring its own two new arms at **six** uncovered branches -- none of them red, because the coverage
  gate is per-file at 95 / 95 / 100 / 95 (finding 475).
  `[open: the rule is failable and narrow -- the newest round's Readings table must carry a coverage
  row, the way the size budget is judged only on the last volume -- and the asymmetry is why it was not
  written in the round that found it: 30 of 54 sections have no row, so the rule can only be judged on
  the one section a round is still writing]`~~
  **Closed by finding 475**, which is that rule now: `readVolumes` refuses a newest round whose ledger
  carries no `| coverage |` row reporting four dimensions for `core` and four for `cli`, and the
  asymmetry is asserted rather than described -- a closed round is a record and is not judged, so the
  thirty that never carried the row stay as they were. The finding is the defect; this is the rule it
  asked for, written in the round after it.

- O-020 · **Cloud-OpsBench has no established vendor.** The field held `arXiv 2603.00468`, which is a citation,
  and the contract page answered the mismatch by renaming its row to `Reference`; the value is `null`
  now and the page prints `*not established*`. The other six formats name an institution.
  `[open: the paper's author block has to be read and quoted, the way `openrca-2.0`'s was this round,
  and until it is the field stays empty -- a near-miss is what the row was doing before]`

- O-021 · **Two prose targets cite a paper no digest pins.** `itbench` and `cloud-opsbench` print an arXiv id
  beside the one the oracle corpus pins (`openrca-2.0`, sha256 recorded), so the
  identifier is a claim no transfer measured.
  `[open: each needs a sha256 and a byte count, or a declaration saying the identifier is all this
  repository read -- `official-assets.json` already has both states for data assets and neither for a
  paper]`

- O-022 · **The ceiling of 8 has never been measured where it is not oversubscription.** Every reading of eight
  workers in this repository is on a 4-CPU quota, where eight is 2x and the row is the *cost* of getting the
  allowance wrong (89% of the stall budget, 93% of the memory limit). On a machine that can feed it, eight
  workers is not oversubscription and the row would be a different number -- and no such machine has run
  this suite.
  `[open: one full-suite run on nine or more usable CPUs, with the same harness and the same report]`

- O-023 · **How close a *failing* run comes to its ceiling is unmeasured.** The margin divides a per-test
  duration by the budget that governs it, and the duration comes from a vitest JSON report that only
  baseline runs are asked for. A run whose product is a failure is read for its exit code, so the
  question the margin answers for the 61 witnesses is unanswered for the 220 mutants -- including the
  runs that were stopped, once they finish inside their budget without failing.
  `[open: a per-test duration from runs whose verdict is the exit code, which is one report per mutant
  run -- the name is free now (finding 544), the duration is not]`

- O-024 · **An in-row `#` inside a block scalar is read by nothing, and 13 of them are in this tree.** `echo hi  # why`
  and `echo "a # b"` cannot be told apart at the YAML layer: both are content of a block whose language YAML
  does not record, so the reader takes the row-leading `#` -- the one shape that is a comment in shell, Python,
  Ruby and make alike -- and declines the rest. Every one of the 13 is a shell string today, so the rule costs
  nothing; what it would cost is a block in a language whose comments are not row-leading.
  `[open: a reader for the in-row `#`, which needs the block's language rather than the file's -- a `run: |`
  holding shell and a `path: |` holding paths are the same bytes to YAML]`

- O-025 · **`crossesProcessBoundary` answers a weaker question than the table used to claim.** It asks whether a body takes
  an input the test does not hold, not whether the function can be called: `workflowPath` reads the environment and
  is now tested by setting it, with the value restored in a `finally`. The rule is honest about the gap and the
  gap is the point -- a predicate strong enough to prove uncallability would have to name something no test can
  construct, and no symbol in this tree answers to that.
  `[open: a symbol that is genuinely uncallable would need an exit that ends the worker, or an input no test can build, as its marker; the table is empty because every symbol examined could be called]`

- O-080 · **The record's set is one directory deep, and a file moved below it is invisible.** `recordSet()` reads
  `docs/progress/` and nothing else, so the discovery rule this round wrote has the limit the single path had, one
  level down: `docs/progress/archive/closed.md` is a closure log to a reader and to no rule here. The three
  refusals cannot help -- they are about names inside the directory that was read -- and the id space is dense
  within what was opened, which is the sentence finding 572 is about.
  `[open: a recursive walk would need a rule for what a file one level down means -- an archive is not the record, and a record in two places is the thing the numbering refuses -- so the widening waits for a statement about where the record lives]`

- O-082 · **The structural rule reads a table's first column, so a record that reorders its columns is a record
  to a reader and not to the guard.** `recordTableUnderUnknownHeading` asks whether `cellsOf(header)[0]` is
  `priority`, which is what makes it precise over this corpus -- 47 of 555 tables begin with that column and every
  one is a round's record -- and what makes it blind in the other direction: a table ordered `| item | priority |
  state | next step |` under `### The leftovers of round 12` is refused by nothing, and its rows are counted by
  nothing either, because `spellingOf` does not know the name. The guard would read such a record correctly if it
  could see it -- the item comes from the column its header names since v3.115 -- so what is missing is the
  seeing. None of the 47 reorders its columns; the rule is one cell wide where the vocabulary it enforces is four.
  `[open: a header that names the four columns in any order is a record by the same argument, and the price is a scan of every table in the corpus rather than of the tables whose first cell is already known to be a priority]`

- O-084 · **The arm cannot see what a round changed, so a round that raises an entry writes no record and nothing
  says so.** The live list holds the current state, and a round's effect on it exists only in git: eleven of the
  seventeen rounds that wrote no record **opened** at least one entry, by their own ledger rows, and the arm reads
  neither the row nor the diff. The corpus has a name for the round on a closure ("Closed by finding N", which
  resolves to a round through the finding) and none on an entry, so the owner of a residual is a fact recorded at
  the moment it stops being open rather than at the moment it starts.
  `[open: an entry that named the round that raised it would make "this round opened something and wrote no record" a rule; the entry carries an id and a reason and no round, and adding one is a change to the format every round writes]`

- O-085 · **The suite's counting assertions are censused, and none of them is empty, and the question a census
  cannot ask is whether the number belongs to the subject the sentence names.** Finding 589 opened this with
  `toContain('0 closed by a finding')`, satisfied by `30 closed by a finding`, and the assertion had been read as a
  claim about the wrong subject for as long as it existed. v3.118 measured the population: **240** assertions whose
  literal argument begins with a digit, each one mutated by prefixing a `9`, and **240** of them go red -- so no
  assertion in this suite is satisfied by a number it does not read. What a substitution cannot reach is the other
  half: finding 589's assertion survives the substitution and is still wrong, because its subject was the live list
  and the line counts the index and its volumes (finding 594).
  `[open: 240 assertions whose literal begins with a digit, all of them red when the digit moves; finding 589's assertion passed that test and was still wrong, because its subject was the live list and the line counts the index and its volumes -- one assertion at a time, and no substitution reaches it]`

- O-086 · **One volume writes its sections two ways, and the form is the only thing a reader could key on.**
  `volume-17.md` holds **44** headings spelled `### One · …` and **42** spelled `### 1. …`, because the
  convention changed while the volume was being written. Both are English and both are readable, so this is
  a shape rather than a language defect -- and the reason it is worth a line is that it is the *third*
  spelling in the log: `volume-09.md` writes `### One: `, `volume-12.md` writes `### One — `,
  `volume-13.md` wrote `### One · `.
  `[open: v3.118 unified the twenty-eight headings that carried a Han numeral into the separator of the volume they stood in, which left each volume internally consistent and four volumes differing from each other; making the log agree with itself costs a renumbering of 86 headings and buys a form that no reader in this tree keys on yet]`

- O-087 · **The local rehearsal's fourth step failed twice at a settled tree, and five rehearsals of the same
  sequence have not produced a third.**
  The entry used to end `the aggregate prints nothing when it exits 1`, and that is false as a general claim.
  Five rehearsals of `install` / `build` / `typecheck` / `lint` -- the four steps CI runs before anything else --
  were run with every byte of every step captured: **three greens** (lint at 267 s, 262 s, 263 s) and **two
  reds**, both on trees that were deliberately carrying a red test, both attributed in **thirteen lines** that
  name the claimant file, the test and the assertion and end `verify-site-proofs: FAILED -- 13 problem(s)`. The
  aggregate also has **eight members**, not seven: `check-no-mock`, `check-no-secrets`, `check-no-vendored-data`,
  `check-official-registry`, `check-no-absolute-paths`, `check-no-unsafe-shell`, `verify-scorer-stability` and
  `verify-site-proofs`, and it is the last one that reaches through to the suite.
  `[open: what remains is the red that was not caused by a red tree, which no run of this sequence has produced;
  the two historical reds left their words in a transcript the report does not reproduce, so the next one has to
  be read at the terminal -- `failureReport` names the step, the directory, the command and the exit code, and
  nothing the step wrote]`
- O-088 · **Two hundred and three rounds before this one carry no closing reading, and 12 of 215 do.**
  `R7` refuses a recording older than the run the ledger's newest `| CI |` row reports, and the ledger's
  newest row sat under `v3.54` for **65 rounds** (`volume-11.md:1464`), so a recording from any run newer than
  `42160224254` passed -- including one **three CI runs behind** the tree. `R11` is the repair: the newest
  round's section must carry a row that names a run and states `**<n> of <m> jobs success**`, with `m` equal
  to `ci.yml`'s job count, and the green line prints how many rounds back the row it compares against sits.
  `[open: the other 203 rows would each have to name a run nobody wrote down here, and a row written from
  memory is the one thing a recording may never do -- the gap is stated as a distance, and the rule is about
  the present]`
- O-089 · **The install step's spread is 52x and a bound can only sit above it.**
  `apt-get install prometheus` measured **17 s** on a warm runner and **888 s** on `44516888528`; the 16-minute
  bound was **1.08x** that day, and the multiple is two. It is **30** minutes now (2.0x) and the `backend`
  job's ceiling moved **34 -> 48**.
  `[open: a slow mirror and a hang look the same to `timeout-minutes`, so the bound covers the worst day
  recorded and the day that beats 888 s will raise it again -- the step is an external install, and no
  arithmetic can bound a network]]
- O-090 · **The budget rule divides by a reading the box decides, and this box is shared.**
  `check-test-budgets` refuses a file whose slowest test takes more than half its stated budget, and the
  reading comes from the vitest report -- one afternoon produced **1 635**, **2 091** and **2 873 ms** for
  `step-process.test.ts` as the host's load average moved from **1.2** to **6.9** (this box is four cores
  inside a shared host). A budget that satisfies the rule on a quiet box fails on a loaded one, so the
  repair is a number that ratchets with the box: `step-process.test.ts` went **4 000 -> 6 000** ms this
  round, 2.1x the slowest reading and 6.4x the isolated one.
  `[open: the ratio is against a number the machine decides, and no declaration of intent can turn it into
  a property of the test -- what would is a budget taken from the isolated reading, which is a different
  question (a file measured alone is sized for a machine this one is never run on)]`
- O-092 · **Five ledger rows state a count of the log that is one behind it.**
  `v3.116`..`v3.120` each counted the `vX.YY` numbers before their own heading was written -- **210**, **211**,
  **212**, **212 -> 213**, **213 -> 214** against **211**, **212**, **213**, **214**, **215** -- and `v3.120`'s
  row prints its own contradiction: `94 in v2, 120 in v3 (v3.00..v3.120)`, a range of **121** numbers. The
  rule added in v3.121 reads only the round that can still be written, so those five stay as they were
  written (finding 601).
  `[open: correcting them would be editing frozen records to satisfy a rule invented after them, which is the
  asymmetry the coverage row already lives with -- 30 of the log's first 54 ledgers carry none -- so the five
  are stated in the round that found them rather than rewritten]`
- O-094 · **Thirty closures live in rounds' records, and the record of closures does not hold them.**
  The two lists were split at v3.111 so that history had one home, and the split's two refusals are
  `kind`-scoped: a struck entry in the live list is refused, an unstruck entry in the record of closures is
  refused. Nothing refuses a struck entry inside a **round's record** -- the `### Left open` a round closes
  with -- and 30 of them are there, nine in `volume-02`, eleven in `volume-03` and ten across `volume-05` to
  `volume-09`, every one of them written before the split at v3.111, each a closure the record of closures cannot name.
  v3.122 counted them for the first time, because the population line now says where each number came from;
  until then they were the last 30 of a `627 entry(ies)` whose `30 closed` did not say which list held them.
  `[open: what the entries mean is decided -- they are history restated in the round that closed them, and
  the round is frozen -- but which of the two homes a closure has when the round that closes it also
  restates it is not decided anywhere, and the answer decides whether 30 records are corrected or the rule
  is scoped; neither can be done by a round that is not allowed to edit a frozen record]`
- O-105 · **The acceptance file is 40 clauses of case law, and a reader who wants the rules must read all of it.**
  The index added at v3.134 makes the file navigable and does not make it shorter: **40** clauses across
  **31** rounds, **2,247 lines at v3.135**, each a judgement with the case that decided it. A reader who
  wants to know what this tree requires today reads it mixed into the same page with how each clause was
  reached.
  `[open: whether the acceptance file should be two files -- the rules, and the case law -- with each rule
  naming the case that decided it, and whether a rule whose case is one section away is still checkable by
  the reader who has to apply it]`
- O-108 · **`lint` is seven members and two of them spawn the tree, so the step is not a static scan.**
  `pnpm lint` runs six guards that read files and two verifiers that copy the repository and run a
  suite in each (`verify-scorer-stability`, `verify-site-proofs`), which is why the step is twice the
  size of its siblings and why its bound has moved 14 -> 16 -> 17 -> 18 as the suite grew. At the
  +2.6% a round its six readings show, 521 s reaches the 2.0x boundary of an 18-minute bound in about
  four rounds -- finding 628's own arithmetic, and the reason the last repair was a minute rather than
  a structure. A separate `verify` step is what v3.124 did for the six guards; the two spawners are
  the remaining half of that split.
  `[open: whether the two spawners belong in `lint` at all -- they are "is the tree in a state we are
  willing to measure" like their neighbours and they are also a quarter of an hour of a suite -- and
  whether a step whose cost is a suite should ever be inside the aggregate whose name says static
  scan]`
- O-119 · **A silence sentence never has to stop being true.**
  `budget(s)` carries the first one: a reason why a round can print none. Nothing asks whether the
  branch that stopped being taken still exists, whether the gate that printed the noun is still in
  `docs:check`, or whether the sentence has described a state the tree left several rounds ago. A
  stale sentence is the same failure as a missing one from the other side -- a record asserting
  something about a gate nobody has looked at -- and the corpus has one such entry, which is why the
  question has no population to be measured on yet.
  `[open: whether a noun silent for many rounds should be asked about -- a sentence is a bet that the
  branch will be taken again, and no round has yet seen one lose -- and whether the question is a count
  of rounds the noun has been absent or a comparison with the gate's own source]`

- O-120 · **A range over the middles prints two numbers, and thirty-six bounds' middles are printed by
  nothing.**
  v3.141 compressed the population of middles to its ends -- `2.4x` to `86x` -- so a reader asking
  whether a usual day comes near any bound is answered at once. The individual answer is not printed
  and not unprintable: `pnpm lint`'s middle is **375 s** under a 1080 s bound, which is `2.9x`, and the
  number is derivable from `golden-master/ci-readings.json` by anyone holding the file.
  `[open: whether a figure that is derivable from a committed file needs to be printed at all -- the
  range answers the population question and the file answers the individual one -- and whether the
  answer changes for a reader who has the summary and not the tree]`
- O-123 · **A span says how large the suite is and not which suite.**
  A round's `new tests` row states the size before and after, and **70** of the **72** spans about the
  suite end at its `core` count while one ends at its `repo` count -- v3.54's, whose ledger was
  measured before its own tests landed. The label says `new tests`, which is true of all three scopes,
  and the span says nothing at all, so the reader offers every scope and prints which one each span
  landed in. That is a reader that cannot tell a typo from a different population: a round that meant
  `repo` and wrote the `core` number is refused, and a round that meant `repo` and wrote the `repo`
  number is accepted without anyone saying so.
  `[open: whether a span should name its scope in words, the way a suite row must -- a span that named
  one would be checkable in one place instead of two, and rule 1 already demands it of every other
  count in the corpus; and whether that is worth 74 edits to ledgers whose numbers are records]`
- O-124 · **Thirty-one rounds publish a delta and no before-count, and two spans count one file.**
  A `new tests` row that says only `**9**: four for the rule` is a number comparable with nothing,
  which is the defect v3.142 was about -- left in place for a third of the rows, because the older
  rounds wrote it that way when the suite's size was four rows further up. The two `(18 -> 30)` spans
  are one test file's counts, and the reader counts them rather than reading them: the file is named
  before the span, which is what separates them from the rows that name test files after it.
  `[open: whether a delta should require its before-count -- demanding one would mean reconstructing
  thirty-one numbers nobody measured, and the round that wrote them had the number in the table above
  -- and whether a file's own count could be read at all, since it would take counting the cases in
  that file rather than reading a ledger]`
- O-125 · **The rule can refuse a contradiction but not say which side is the record.**
  Five rounds were repaired and the direction came from `git log -S`: for three of them the commit
  that wrote the number was a later round's. The gate sees two numbers and no history, so a sixth
  round meeting the same state would have to do the archaeology again -- and a reader who "repairs"
  the span instead of the count turns the gate green while making the record worse.
  `[open: whether the corpus should record which commit wrote a ledger row, so a repair has a side to
  take without git -- the snapshot that holds the counts is rewritten every round, so the question is
  whether the place for it is a history rather than a snapshot; and whether the refusal could name the
  round whose count the offending number belongs to, since the number is usually one of the spans the
  corpus already publishes]`
- O-126 · **A bound sized in one mode of a bimodal step.**
  Two readings of one tree put `sensitivity / Install the shells the suite cross-checks against` at
  **109 s** and **10 s**, and `batteries / Install ...` at **23 s** and **9 s** -- a package store
  hit and a store miss, which is the tree's state rather than the runner's speed. Both jobs bound it
  at 420 s, which covers every reading either mode has produced, but by the margin and not by an
  argument: nothing in the workflow says the step has two modes, so a bound sized from a hit would be
  a bound sized for half the step's behaviour.
  `[open: whether a step whose cost is dominated by a cache state should declare it, so that `R10`'s
  denominator is read per mode rather than across them -- a declaration would be a promise about a
  state no recording holds, which is what `R15` already does for the cold prefix; and whether the
  margin clause should say which of its 38 bounds rest on a step that moved by more than half its own
  reading, since two of them do]`
- O-129 · **The worker cap is derived from the CPU count, and this container's derived count makes four files fail per run.**
  `workerCount` reads the cgroup quota and leaves one CPU for the main process, so a 4-CPU container runs
  three workers. On this box three consecutive full runs each failed four or five *different* files with
  `STACK_TRACE_ERROR` -- vitest's placeholder for a hook that timed out -- while two workers ran
  **7 183 of 7 183** green. The suite collected for 336 s at three workers, so the filesystem and not the
  tree is the variable, and CI's 4-vCPU runner is green at the same derived count.
  `[open: whether the cap should read measured contention (load average, or a collection-time budget)
  rather than only the CPU allowance, and whether the files that spawn processes should declare their own
  hook budgets instead -- the two are one question about where a machine's slowness is allowed to be
  answered, and neither can be decided from this container alone]`
  `v3.146` measured it once more: at the same derived three workers the full suite was **7,007 of 7,007**
  green in 92 s, so the four failures a round are intermittent rather than necessary -- which is why the
  entry is not closed: a rule that fires one run in four is not answered by a run in which it did not.
- O-131 · **A red day's bound is looked up by step name, and a step's identity in this file is its command.**
  `boundsOfThatDay` keys that day's bounds by `step.name` and the recorder looks today's step up by the
  same name, so a step renamed between the two days -- the bound still managing the same command -- reads
  as a step that day gave no bound, and a number equal to that bound is kept. Everywhere else a reading is
  keyed by `commandOf(step)`, because `R10`'s denominator is a series over commands rather than over names.
  `[open: whether the lookup should key on the command, which is the identity the rest of this file uses,
  or keep the name and accept the gap -- a command match would also have to decide what two steps of one
  job that ran the same command mean, and a bound is one number while a command can be run twice]`
- O-130 · **A seed whose commit predates a syntax this reader accepts can no longer be appended at all.**
  `boundsOfThatDay` walks that day's `ci.yml` with the same strict line reader the gate uses, and a shape it
  does not recognise is a refusal (`O-128`'s repair) -- so a day from before a syntax change is unseedable,
  where `v3.145` would have appended it with a bound nobody could read. The alternative is a second,
  permissive reader for that day alone, which is a bound decided by a rule no gate enforces.
  `[open: whether a refused day should be appended with only its `success` steps -- the route `O-128`
  refused for a day it could read, and a different proposition for one it cannot -- or whether the reader
  should return the bounds it did recognise alongside its errors, so a day is refused for the steps it
  cannot place rather than as a whole]`

## Pass log

The rounds are recorded in the volumes below, in the order they were run. They were one
document until it reached 519,758 bytes -- the size at which `docs/audit.md` stopped
being a document (finding 195), and for the same reason: the push that carries one
round carries all of them, and a reader cannot find a round without `grep`.

The split is by **run order**, not by size and not by subject. A round is read
together with the round before it -- "the gate was right, the error recurred, and the
reason was one step to the ..." is only a sentence if the previous round is there --
so a volume holds a contiguous run of rounds and the volumes **tile** the log: the
concatenation of the volumes is the body that was moved, byte for byte.
`node scripts/check-progress-volumes.mjs` holds the tiling, the ordering, the size,
and this table.

| file | entries | first | last |
| --- | --- | --- | --- |
| [volume-01.md](progress/volume-01.md) | 20 | Pass 14 | Pass 34 |
| [volume-02.md](progress/volume-02.md) | 16 | Pass 35 | Pass 48 |
| [volume-03.md](progress/volume-03.md) | 16 | Pass 49 | Pass 64 |
| [volume-04.md](progress/volume-04.md) | 21 | v2.06 | v2.25 |
| [volume-05.md](progress/volume-05.md) | 30 | v2.26 | v2.55 |
| [volume-06.md](progress/volume-06.md) | 30 | v2.56 | v2.85 |
| [volume-07.md](progress/volume-07.md) | 21 | v2.86 | v3.06 |
| [volume-08.md](progress/volume-08.md) | 14 | v3.07 | v3.20 |
| [volume-09.md](progress/volume-09.md) | 13 | v3.21 | v3.33 |
| [volume-10.md](progress/volume-10.md) | 13 | v3.34 | v3.46 |
| [volume-11.md](progress/volume-11.md) | 9 | v3.47 | v3.55 |
| [volume-12.md](progress/volume-12.md) | 8 | v3.56 | v3.63 |
| [volume-13.md](progress/volume-13.md) | 9 | v3.64 | v3.72 |
| [volume-14.md](progress/volume-14.md) | 11 | v3.73 | v3.83 |
| [volume-15.md](progress/volume-15.md) | 7 | v3.84 | v3.90 |
| [volume-16.md](progress/volume-16.md) | 8 | v3.91 | v3.98 |
| [volume-17.md](progress/volume-17.md) | 13 | v3.99 | v3.111 |
| [volume-18.md](progress/volume-18.md) | 9 | v3.112 | v3.120 |
| [volume-19.md](progress/volume-19.md) | 13 | v3.121 | v3.133 |
| [volume-20.md](progress/volume-20.md) | 13 | v3.134 | v3.146 |

**Where a new round goes.** Append to the last volume. When it would grow past
200,000 bytes -- a third of a megabyte is the point at which diffing one round
becomes diffing the pile -- start the next volume and add its row above. A round is
never split across two volumes: a boundary falls between two `## ` headings or it
does not exist.

The new volume takes a contiguous **run** of the most recent rounds, not one, and the
run has to be larger than this file. That is not a preference: a volume holding one
round was 4,250 bytes against an index of 74,443, and the checker refused it, because
the volume still being written is the only thing this file is compared with, and a
reader who follows an index must not land in a document smaller than its target.
`v2.56`--`v2.79` moved together for that reason, and the run will be longer next time.
