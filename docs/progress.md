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
**v3.68** (2026-11-08); each round's own copy of them is the `coverage` row of its
`### Readings` ledger in the progress log, and that row is written by the round that
ran the suite. This section is retaken when the residual's *shape*
changes, not every round -- a table retaken every round is a table whose figures
get typed rather than measured, which is how the 99.93 this table used to publish
came to exist (finding 481).

| Dimension | Result | Gate |
| --- | --- | --- |
| Statements | 99.97% | ≥ 95% |
| Branches | 99.80% | ≥ 95% |
| Functions | 100% | ≥ 95% |
| Lines | 99.97% | ≥ 95% |

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

**This is the only live list.** An entry arrives when the round that raised it declined to
close it, and is struck when something closes it. A round's own heading is `### Left open`,
and it is a record of that round, frozen: nothing appends to it afterwards, and a reader who
greps for what is open is asking this list, not those.

Both headings were called `Open` until finding 207, which is how the same reader got
fifty-eight answers, one of which was current. The rename was the repair; a sentence saying
which was which would have left the names lying.

Most entries below are **limits** rather than tasks: each names something this repository
does not do, why, and what would close it. The last one is a question this round could not
settle.

Checked at v3.69: **22** entries open. The number is arithmetic: `check-open-list.mjs` counts the entries
below it, refuses a number that is not that count, and refuses a round older than the newest round in this
corpus. It cannot check that a surviving entry is still *true* -- that takes the measurement the entry is
about -- so what it buys is that a round stood in front of every entry it counts. v3.62 is the round
that needed it: the list had said "open" about a page that had been made a page, about a flag whose other
half had been read, and about a creation path a real push had already paid for.

v3.63 is the round that found the number itself was counting a **rule** that had gone wrong. Two entries
below used half of a shape this log has used since v2.44 -- the reason struck through, the closure named
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

- ~~**The real-corpus runs are diagnosed, and the mechanism was named wrong twice
  before it was named right.**~~ **Closed without a finding: the third naming came from
  the run's own stack trace, quoted below, and that is what the entry was waiting for.**
  Five runs of the fourth anchor's path, each failing
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

- ~~**The dispatch was fired four times, and the cause is now fixed in the tooling.**~~
  **Closed without a finding: the fix was in a scratch API helper outside this tree, and
  the paragraphs below record both the repair and its confirmation.**
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
  `[open: the six remaining score targets -- both OpenRCA targets, RCA100, AIOps2025, Cloud-OpsBench and ITBench -- still have no automated fetch, so for them the fourth anchor rests on the synthetic path alone]`
- ~~**The fourth anchor's fetch defect is fixed; whether that was *the* cause is not
  yet known.**~~ **Closed by Pass 15**, which is the first round to record a reading from
  a real-corpus run -- so the open question, "no run has happened since the fix", has an
  answer, and the fix was not the whole story either. The retry loop wrapped only `download()`, so a bad transfer had no
  second attempt and ended the job. That much is proved from the source and is
  recorded as finding 52. What is *not* known is whether truncations, a bad pin or
  both accounted for the twelve failures: no run has happened since the fix, and
  the whole reason the fix adds an exit code is that the log could not say. The
  honest status is *"the defect is fixed and the fix is verified in isolation; its
  effect on the anchor is unobserved."*
- ~~**There is still no measured extraction accuracy.**~~ **Closed by Pass 15**, whose
  title is the answer: "the first real reading, and it says M1 is not met". The
  instrument produced a number; whether the number clears 70% is a different entry. The scorer, the 19-sample
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
  `[open: making the six shard repositories a source means having them publish an artifact instead of populating a cache, which is a change in those repositories and is not made here]`
- ~~**Anchor 4** is closed by `official-data.yml`, which fetches the corpora on a
  runner.~~ **Closed without a finding: the closure is the workflow itself, and the two
  retractions it exists to record are in the audit rather than in a finding.** Two claims here were wrong and are retracted in the audit:
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
  `[open: applying the document needs a cluster, and a test that needs a cluster is a test that does not run in CI, so the remaining work is a cluster runner rather than another unit test]`
- **The Chaos Mesh mapping is asserted against a hand-written table, not against the
  CRD.** The mapping was derived from the documentation and is asserted for internal
  consistency and for the `TimeChaos` trap specifically -- no test validates it with a
  live `kubectl apply --dry-run=server`, so a field renamed upstream would not be
  caught here.
  `[open: no test validates the mapping with a live kubectl apply --dry-run=server, so a field renamed upstream would still not be caught here]`
- ~~**Five gates are covered by CI running them, not by a test that forces them to
  fail.**~~ **Closed by finding 340**, and not by the fixtures this entry predicted.
  `gates-are-testable.test.ts` proves no gate can be hollowed out, which is a floor:
  it says a gate is caught by at least one test, not that every exit has one, and the
  ledger's `proved` was computed from a test that *names* the site. Measured instead
  of argued: block coverage for each of the 41 naming tests, run alone, with every
  site's line converted to a byte offset. **93 of 93 proved sites are reached by the
  test that proves them**, and 1 of the 6 exempt sites fires anywhere. The three
  scripts this entry named (`check-readme-sample.mjs`, `build-example-bundle.mjs`,
  `gen-examples.mjs`) all fire, as do both secondary exits — the fixtures it called
  "doable and not done" exist under other names. What remains is not a gap in the
  gates but a limit of the measurement: it establishes the line ran, not that the
  test asserted what it prints.
- ~~**The reading that closed the caveat was sharp for only two thirds of the sites,
  and four sites survive being turned into a success.**~~ v3.32 asked whether the site's
  byte offset fell in a V8 range with a non-zero count; for **60** of the 93 proved
  sites that range is a branch block, and for **33** it is the module body -- a
  `process.exit(1)` inside a module-level `if` reads "reached" the moment the script
  starts. The falsifiable question needs no coverage: change the exit and run the test.
  Under `process.exit(44)` **88 of 93** are caught and under `process.exit(0)` **89**;
  the four that survive both are closed here by one case each in their naming tests
  (`check-citations.mjs:86`, `verify-example-pack.mjs:79`), found to be driven by a
  sibling test the ledger does not name (`check-cli-reference.mjs:51`), or left open
  with a diagnosis -- `check-official.mjs:1378` is reachable only by a case its target
  skips *by contract*, and the file's own skip paragraph says such a case "is not a
  pass and not a failure" while the enumeration gate counts it as an unnamed gap.
  See finding 342. ~~`[open: the enumeration gate and the skip paragraph disagree about
  whether a contract skip is a gap, and deciding that needs a fixture whose target
  refuses a case]`~~ — Closed by finding 343, which found that the runner could not
  produce a refusal at all: `suite === 'RE3'` stamped `code` on every case, so a CPU
  fault in the code-only slice round-tripped `oracle=1.00` (measured). The category a
  directory names now wins over the suite's default, the export's own `skipped` entry
  is what the gate reads, and `roundTripped + refused === declared` is printed on every
  run as `ROUNDTRIP ACCOUNTED`.
- ~~**The RE3 slice's own fault categories have now been counted, and the count was worse than
  "uncounted".**~~ v3.34 found that the round trip would score a resource fault at 1.00 inside the
  one slice whose published rule admits code-level faults only, and fixed it by letting a
  directory's category win over the suite's default. The open item was that no reading here said
  what the cases' categories were. v3.35 took that reading over the nine published archives'
  central directories -- 1 190 358 bytes of 5 161 758 943, no telemetry downloaded -- and found
  **135 of 735 cases (18.4%) with no category at all**: 45 `socket` cases (the fourth *resource*
  fault, per the corpus's own paper) and 90 `f1`…`f5` cases (five distinct *code-level* faults,
  which this repository called one word, and only because a suite said so). Both families are now
  named by `fault/corpus-fault-taxonomy.ts`, which may only add to the classifier and never
  overrule it; the census reads `resource 405, network 240, code 90, unknown 0`. The same walk
  turned up the corpus's **736th** `inject_time.txt` --
  `RE2-OB/checkoutservice_cpu/multi-source-data/`, a hand-made bundle with a `.DS_Store` beside
  it -- which `parseRcaEvalPath` has always refused by requiring a numeric instance. See findings
  344 and 345.
  ~~`[open: nothing here groups the shipped corpus by fault category, so the refusal is correct
  and the population it acts on is unknown]`~~ — Closed by finding 344.
- **The corpus's label table reached two call sites, and the product's front door was not one of
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

- **`glm-embedding-3` benchmark scheduling** is out of scope for this package;
  the LLM-dependent paths here are behind a provider-agnostic abstraction.
  `[open: the LLM-dependent paths here sit behind a provider-agnostic abstraction, and
  scheduling a benchmark against a hosted embedding model belongs to whichever package
  owns the model rather than to this one]`
- ~~**A closed volume's budget answers a repair with "start the next volume", which is advice a
  closed volume cannot take.**~~ **Closed by finding 208**, which applies the bound to the
  volume that can still grow and prints every size instead of judging the closed ones.

- ~~**The publish readings begin at v3.56, and the history is one round deep.**~~
  **Closed by finding 433**, which found the file holding **five** pushes -- 65 rows, three
  retries, three unanswered attempts, written the same afternoon -- and no unit in which that
  could be said. The entry was not a lie about the file's contents but a sentence about a file
  whose depth could not be measured, which is why it read as one push. The attempt is now a thing
  in the file, and the reader prints how many it holds.
- ~~**A push cannot be told from the requests that carried it.**~~ **Closed by finding 433**, which
  put the boundary at the caller: `publish()` asks the remote for the branch before it decides
  anything, so the first row of every attempt is `GET /git/ref/heads/<branch>`, and the reader
  refuses an attempt that begins with anything else as well as one that reads the branch a second
  time. The summary now names the attempts, each one's own slowest request, and how many named a
  tip -- and the two lines that showed the variance were enough to justify the unit: 2 120 ms on
  one attempt against 29 632 ms on another (finding 434).
- ~~**A wrong `--branch` is read as an unborn branch.**~~ **Closed by finding 436**, which
  found the entry naming the smaller half of the defect. A `404` on the branch read answers for a
  branch that has never been created and for one whose name is wrong, and the plan is the same for
  both -- so the channel now asks what the repository holds, and refuses a name that is wrong
  unless the caller says `--new-branch`. The other half (finding 437) is that the branch could not
  be created at all: the ref update is a `PATCH` on a reference that must exist, so every real push
  onto an unborn branch ended in a `422` described as *"the branch moved ... it was null and is
  undefined"*. The creation is `POST /git/refs` now, with its own refusal for a name taken while
  the commits were being made.
  **The other half is closed by finding 455**, which paid for it: the push that created `v3.61-tip`
  carried three commits and twenty-one blobs and ended in one `POST /git/refs`, and the branch's tree is
  the one the gate had blessed (`546b38da`, read back from the branch's own bytes). What made it possible
  was not a cheaper rebuild but a different question: a creation hangs on a **tip the remote already
  has**, because a repository with refs has tips even when it does not have the branch. Before that the
  window was the whole ancestry, and on this history that was not expensive but impossible -- the replay
  reaches a merge, and a replayed merge is refused (finding 455's first attempt, two requests, no objects).
- ~~**The listing that decides a `404` is one page of a hundred.**~~ **Closed by finding 451**, which made
  the listing walk pages instead of assuming the first hundred were the repository: 100 is both the page
  size and the size of a repository that holds exactly a hundred refs, so a full page is not a last page
  and the walk asks one more time. It stops at ten pages because it runs inside a refusal, and a walk that
  stopped at its bound says **"at least"** -- printing the pages it read as the number the repository holds
  is the defect the walk was added to fix, and printing a bound as a count is the same error with a smaller
  number. `refs()` answers `{ names, tips, complete }`, so the sentence a reader acts on can tell "counted"
  from "stopped counting". The old reason's other half is gone with it: nothing here walks a `Link` header,
  because the page size is a constant this channel sends.
- ~~**`--new-branch` permits an absent base and does not require one.**~~ **Closed by finding 446**, which
  read the flag's second half: it is a statement about the remote -- *this branch does not exist* -- so a
  push carrying it onto a branch that does exist is refused and names the commit it found. What was open
  was whether a permission should also be a requirement, and the answer is that the two halves are one
  statement: the permission to create is not a licence to move the branch the caller said they were
  creating.
- **The attempts recorded before v3.57 name no tip, and the file is one attempt behind.** All five
  carry `rev: null`, because their rows never named a commit and a reader that filled one in would
  be inventing the fact the field exists to report. The attempt that carries this round's push is
  appended after the ref has moved, so it lands in the tree one push later.
  `[open: the field is written from the next attempt on, so the count the summary prints --
  `0 with a named tip` -- is the measure of how much of the history predates it; and an attempt
  cannot record itself in the push that carries it, so the file is always its own last reader]`
- **P13: a mutation is one substitution.** Every mutation battery in this repository makes a
  single edit, so a rule that is only wrong when two edits are made together is covered by
  none of them. v3.57 measured the prediction instead of restating it: every **pair** of its
  thirteen substitutions was applied and restored together, and **78 pairs, 78 red, 0 survived**.
  `[open: 78 pairs of *known* mutants is not the space of double edits -- a pair composing two
  changes neither of which is in the battery is still unmeasured, and so is a mutation of the
  assertion rather than of the code]`
- **`backend`'s install bound has not met a slow day.** The 16-minute bound is sized from a
  648-second cold runner and a 273-second ordinary one.
  `[open: no recorded run has installed prometheus from a mirror slower than 648 seconds, and
  the bound will be re-sized from the first one that does rather than guessed at now]`
- **The sensitivity shards are cut by file count, not by cost.** Both hold 25 claimant files, and
  the step that does the work measured **439 s** in shard 1 against **199 s** in shard 2 on run
  `466` -- and **248 s** against **387 s**, the other way round, on the run that split them
  (v3.54). Near-equal claim counts (55 and 64) predict neither number, so the cost is per-file
  suite cost, which only the battery can measure, on the machine that pays it. See finding 462.
  `[open: a split by cost needs a per-file recording made where the cost is paid -- on a runner --
  published where a plan can read it, and a rule for when that recording is stale; the shard's own
  bound is the backstop, so the split is expensive rather than unsafe, by 240 s of every run]`
- ~~**A record written as a table is counted, not judged.**~~ Since v3.45 a round's record is a
  table with a `state` column, and the nineteen of them hold **147** rows no gate reads: v3.64 made
  the guard check the header's four names, the rule under it, every row's cell count and a
  non-empty state cell, and corrected the count it printed from 185 to 147. See findings 464, 465.
  ~~`[open: judging a row needs a closed vocabulary for the state column, and the nineteen records
  predate one -- a gate that read the column today would have to accept whatever the last nineteen
  rounds happened to write, which is not a rule]`~~
  **Closed as a measured decision by finding 466**, which measured the column instead of planning a
  vocabulary for it: 147 readings, 78 distinct values, `unchanged` 38 times, a median of 75
  characters and a longest of 251. There is no vocabulary to close, because the column is prose --
  so what a gate can do about it is locate it, and that is now what the guard does.
- **The remote's history and the local one share no name above a boundary 272 commits old.** Every
  push here rebuilds a commit from the local revision, so the remote's tip is a reconstruction rather
  than the object this checkout holds: below the boundary the two agree byte for byte, and above it
  they are two histories that carry the same trees. That is why a record's `the remote tip is <sha>`
  line names a commit no local command can print.
  `[open: convergence means rewriting the remote's history, and this channel refuses to move a ref backwards by design -- a force push is the one ref update it will not make, so the two histories stay two]`
- **The currency line proves a round counted the list, not that it read it.** The stamp at the top of
  this section -- fifteen entries open, read at v3.65 -- is arithmetic over the entries below it, and the guard recomputes it. A number
  computed from the guard cannot disagree with the guard, so the stamp is sharp about the count and
  silent about whether a round looked at any entry -- and v3.63 and v3.64 each printed a number that
  was wrong about the thing it stood for.
  `[open: the one sentence a round cannot fake is an entry's headline saying what closed it, and that shape is required of a struck entry only -- a round's reading of the entries it leaves open is still a count, which is the half this stamp cannot check]`
- **The base search reads one remote tip per branch this checkout does not have.** `locateBaseAmongRefs`
  walks every remote head whose commit is not in the local ancestry and asks the transport for its
  tree, stopping early only when a candidate lands at depth one. The cost is the repository's branch
  count rather than the push's size.
  `[open: bounding it needs a reading of how many twin tips a real push meets, and this repository holds five refs -- no attempt here has met enough of them to size a bound, so a constant chosen now would be sized from this repository alone]`
- **A bounded ref count is a floor, not a count.** `refs()` walks at most ten pages of a hundred and
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
- **The coverage figure has no reader that computes it.** `docs/progress.md` publishes the
  four-dimension reading under a sentence beginning "Measured by `vitest run --coverage`", and the
  per-round copy of it lives in a `### Readings` ledger. `check-doc-counts` holds the suite counts to
  a run and `derive-gate-sites --check` holds the gate-site count to a derivation; nothing holds this
  one to anything, which is why it published **99.93** branches for at least eight rounds while every
  ledger read 99.80 (finding 481).
  `[open: the repair corrected the figure, not the gap -- a guard would need a coverage report during
  `docs:check`, which does not run the suite, so the honest state is that one of the two copies is
  remembered. Either a `docs:check` step reads a report when one exists, or the table says in a
  sentence that the ledger is the only computed copy and this one is a convenience]`
- ~~**G3's two thresholds have no grid.**~~ `minAbsZ` (2.0) and `minSustainedSamples` (3) are
  parameters with no sensitivity reading, and `probe-z-floor` measures epsilon rather than either
  of them.
  **Closed by finding 482.** The grid exists: 4x4 over `|Z|` 1/2/10/100 and 1/3/5/8 samples, printed
  by `check-fault-cases.mjs` on both exits, with every cell's refused set asserted equal to
  `checkG3Validity`'s own violations. Its answer is that **the admission rate does not move** -- 30
  of 30 in every reachable cell -- and the reading that separates "the default is defended" from "the
  corpus cannot see the line" is each case's flip point: weakest **126.85**, **63.42x** the default.
  Both defaults are now `G3_DEFAULTS`, read by the gate and by the grid rather than written twice.
  What the grid could not do is defend the *value*, and that is the item opened below.
- ~~**`rulegen` has no refusal count and no agreement reading.**~~ The module extracts a structured
  rule from an incident and validates it; it does not report how often validation refused, and
  nothing compares its output with the thirty human annotations that already exist.
  **Closed by finding 483, with two of its three premises corrected.** The thirty annotations are
  `fault-extraction`'s, and `buildExtractionReport` already reads them; and `rulegen` has **no
  production caller at all**, so a rate over model output would describe a channel that does not run.
  What was built is `golden-master/rulegen-layouts.json` (16 authored cases) plus
  `scripts/check-rulegen-agreement.mjs`: the alias table reproduces **14 of 16** specified layouts,
  the validator agrees on **16 of 16** verdicts (9 accepted, 7 refused) and **7 of 7** reasons, and
  **1** accepted answer maps a field to another real column -- the class a replay cannot refuse.
  Kappa is absent and the absence is stated where the figure is printed. The defect worth the round
  was neither of those: `REQUIRED_FIELDS` was written twice, byte for byte, and is now one constant
  in `ingest/file.ts` imported by both readers.
- **The corpus cannot move the z-score axis.** Every one of the thirty cases stops sustaining three
  samples only above `|Z| >= 126.85`, so a grid over 1 to 100 has one answer in all sixteen cells.
  The gate's threshold is therefore unexamined by the corpus rather than defended by it: any line in
  that range classifies this set identically (finding 482).
  `[open: the fix is a case whose separation sits near 2-4 sigma -- a fault that is real and quiet
  rather than a step from 180ms to 4.3s -- and the flip-point reading is what a reviewer checks it
  against, because a case added to move the grid is a case added to move a number]`
- **The layout validator cannot see a wrong-but-valid mapping.** `validateGeneratedLayout` replays a
  layout against the samples, so it refuses a column that is absent or empty. A mapping to a real,
  populated column that means the wrong thing passes: the answer set carries one
  (`metricValue` at `limit` where the specification says `usage`) and it is accepted, correctly, for
  the contract the validator enforces (finding 483).
  `[open: the statement "a replay checks structure, not semantics" needs either a second reader when
  the model-side channel gets a caller, or a sentence in the module saying what a replay can claim
  -- today the module documents the rule and not its limit]`
- **`score` divides by a different denominator per target, and the documents did not say so.**
  `scoreExport` returns a pass-rate times 100 over the checks that target has: seven targets,
  seven denominators, and a 100 that is not one quantity.
  `[open: the sentence "different targets are not comparable" needs a measurement under it,
  which is a test asserting that two targets' check counts differ -- and that test does not exist,
  so the sentence would be the same kind of claim as the 105]`
- **`docs/acceptance.md` is 96 KB and grows by clause per round.** L3 is 284 lines and L4 is 405;
  L0, L1, L2 and L5 are 14, 7, 7 and 6, so the obvious split by layer would produce four files
  of a dozen lines.
  `[open: the axis is "current rule" against "how it was reached", not the layer -- the
  per-round clauses are 139 lines and 11,139 bytes of history sitting in a specification, and
  moving them needs the measurement of how many sections match that shape before the index
  relation is re-checked]`
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
- **Cloud-OpsBench has no established vendor.** The field held `arXiv 2603.00468`, which is a citation,
  and the contract page answered the mismatch by renaming its row to `Reference`; the value is `null`
  now and the page prints `*not established*`. The other six formats name an institution.
  `[open: the paper's author block has to be read and quoted, the way `openrca-2.0`'s was this round,
  and until it is the field stays empty -- a near-miss is what the row was doing before]`
- **Two prose targets cite a paper no digest pins.** `itbench` and `cloud-opsbench` print an arXiv id
  beside the one the oracle corpus pins (`openrca-2.0`, 962,086 bytes, sha256 recorded), so the
  identifier is a claim no transfer measured.
  `[open: each needs a sha256 and a byte count, or a declaration saying the identifier is all this
  repository read -- `official-assets.json` already has both states for data assets and neither for a
  paper]`


## Pass log

The rounds are recorded in the volumes below, in the order they were run. They were one
document until it reached 519,758 bytes -- the size at which `docs/audit.md` stopped
being a document (finding 195), and for the same reason: the push that carries one
round carries all of them, and a reader cannot find a round without `grep`.

The split is by **run order**, not by size and not by subject. A round is read
together with the round before it -- "the gate was right, the error recurred, and the
reason was one step to the ..." is only a sentence if the previous round is there --
so a volume holds a contiguous run of rounds and the volumes **tile** the log: the
concatenation of the four files is the body that was moved, byte for byte.
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
| [volume-11.md](progress/volume-11.md) | 7 | v3.47 | v3.53 |
| [volume-12.md](progress/volume-12.md) | 16 | v3.54 | v3.69 |

**Where a new round goes.** Append to the last volume. When it would grow past
200,000 bytes -- a third of a megabyte is the point at which diffing one round
becomes diffing the pile -- start the next volume and add its row above. A round is
never split across two volumes: a boundary falls between two `## ` headings or it
does not exist.

The new volume takes a contiguous **run** of the most recent rounds, not one, and the
run has to be larger than this file. That is not a preference: a volume holding one
round was 4,250 bytes against an index of 74,443, and the checker refused it, because
an index bigger than the smallest thing it indexes is no longer an index -- the reader
who follows it lands in a document larger than its target. `v2.56`--`v2.79` moved
together for that reason, and the run will be longer next time.
