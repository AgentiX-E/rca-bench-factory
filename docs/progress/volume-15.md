## v3.84 · the switch v3.82 set never reached the one file it was written for

The first full gate run after v3.83 committed went red on the same step **again**, and this time the
sentence it printed was the one v3.82 had installed: `gate-sites-are-proven.test.ts did not finish
inside its own 30000 ms of test budget`. **30,000, not 120,000** -- and the number on the switch v3.82
passed was 120,000.

### One · a switch that sets a default cannot reach a file that declares its own budget (finding 519)

`--testTimeout` sets the **default a test inherits**; a file that writes
`describe(…, { timeout: RULE_TIMEOUT_MS })` keeps its own number. So the flag arrived at every
claimant **except the slowest one** -- and that was the only one the flag had been written for.

Whether 30,000 is a statement about the work has to be measured. The three tests that timed out are
**4 / 50 / 44 ms** under coverage, the whole file is **476 ms** on its own, four copies at once
(measured at v3.83) take **8.22 / 8.32 / 8.33 / 8.22 s** each with 69 of 69 green in every one, and
this repository has already measured a stall of **47,727 ms** (finding 507). The budget sat below a
disturbance that had been observed.

So the number became **120,000**, **equal** to the ceiling the battery gives each claimant -- not
because this file needs two minutes, but because two numbers that ought to be one number should be one
number, and a budget below a measured stall measures the machine.

What made this visible was the verdict: it printed **the budget it used** (30000), not the 120,000 on
the flag. Had it printed the latter, the file's own declaration would have stayed hidden another round.

### Two · a count derived before `git add` is the count of a tree that never existed (finding 520)

v3.83 published `Tracked files 638`. The commit carrying it held 639, and the next `docs:check`
refused outright. The mechanism is not new: the file rows are cut from `git ls-files`, which is the
**index**, and the new test file had not been staged when `--write` ran. The guard's own success
sentence says "every one derived from the tree it was just rewritten from" -- true, and useless: the
tree it derived from was not the tree the commit would contain.

The repair is a refusal rather than a warning. This repository's flow is `git add -A`, so `--write`
refuses while the index and the working tree disagree, names the first untracked file, and says what
the way out is.

The fixture is the interesting part. `check-repository-table.test.ts` builds a five-file repository
and asserts `Tracked files | 7`, and its document is written **after** the commit, so in every fixture
that document is untracked -- 7 is the count of a tree that **omits the document the table lives in**.
The fixture reproduced the defect for the whole life of the guard, which is why no test ever objected
to it: the fixture reproduced the measurement its author had made, and the author and the round were
making the same one. The moment the guard learned to refuse, the number became 8.

### Readings

> Ledger for `v3.84`.

| item | value |
| --- | --- |
| `core` test suite | **248 files, 6300 tests passed** (at v3.84) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.84) |
| repo test suite | **252 files, 6487 tests passed** (at v3.84) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100** (per-file thresholds, no exemption); unchanged, because this round changed no file under `src/` |
| new tests | **6299 -> 6300, net +1**: one for the rewrite refusing a tree with an untracked file, and the same test's second half proving the way out |
| the claimant budget | `RULE_TIMEOUT_MS` **30,000 -> 120,000**, which is the ceiling the battery gives each claimant run, so the two numbers are one |
| the claimant's cost | 4 / 50 / 44 ms per test, 476 ms per file standalone, and **8.22 / 8.32 / 8.33 / 8.22 s** for four copies run at once, 69 of 69 green in each |
| the derived count | **638 -> 639** tracked files: the number v3.83 published was a count of a tree that omitted the file the commit added |
| the fixture's own number | **7 -> 8**: it had been counting a tree that omitted the document the table lives in |
| list | **27 open**, unchanged: both repairs closed a defect rather than an entry |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P0 | a round trip that carries all 270 cases | the run fired at `5c1a8a9` (43085008634) reached the round-trip step with fetch, pins and derive green | read `ROUNDTRIP cost ... largest ... MB` off that run and compare it with the 12,288 MB budget |
| P1 | worker count decided by memory rather than by the stall reading | open since v3.80 | choose the cap from the stall measurement |
| P1 | a budget stated as a default and a budget stated by the file | **new**: two claimants now agree, but nothing checks that a file's declared budget is at least the battery's | make the battery read each claimant's declared budget and report the smaller of the two |
| P2 | a `terms` map per target, so the aggregate can say which keys a rule writes | open since v3.83 | nine shapes instead of one, decided as a record change |
| P2 | the index grows every round | unchanged | measure the distance to the ceiling first |
| P3 | coverage numbers have no reader that computes them | unchanged | teach `docs:check` to read a report |

**The lesson.** Both repairs were in the **right file** and were ineffective for the **right file**:
v3.82's flag set a default, and the one file that needed it declared a budget of its own; v3.83's
derivation read the index, and the number was taken before the index was updated. Neither was written
wrongly; both were **right in the wrong place**, which is the boundary of the word "reader" -- a switch
has a scope, a derivation has an instant, and neither of them is in its name.

What catches this class is not a stronger assertion. It is **making every number state its own source
and its own instant**: the verdict prints the budget it actually used (30000), the refusal prints the
first untracked file (`notes.md`). Both repairs have that shape -- turning a silent scope into a
sentence.

## v3.85 · the plan said one table, and the corpus writes two

The 2026-11-11 dispatch (`5c1a8a9`, run `43085008634`) carried **all 270 cases** through the round
trip for the first time -- 8,075 MB of a 12,336 MB budget, 151.6 minutes, no case killed -- and
scored **24**. This round is about the other 246, and none of them had anything to do with memory.

### One · a plan keyed on the suite cannot state a header that varies inside the suite (finding 521)

244 cases failed with the same sentence:

> `the exported logs table is not the corpus's - 178461 row(s) against the corpus's 178461; the
> corpus's logs table has no 'cluster_id' column; the corpus's logs table has no 'log_template'
> column`

Same row count, and two columns the plan names that the corpus does not have. The counts are
exact and they name the cause: **24 cases carry `cluster_id` values in their corpus and 244 carry
none, and 24 is the number that scored.** The archives agree, read directly on 2026-11-12 with
their sha256 checked against the registry:

| case | `logs.csv` header |
| --- | --- |
| `RE2-OB/checkoutservice_cpu/1` | nine columns, ending `,cluster_id,log_template` |
| `RE2-OB/checkoutservice_cpu/3` | seven columns, ending `,req_path,error` |
| `RE2-SS/carts_cpu/1` | seven columns |

Two case directories of the **same service and fault type**, eleven apart in the list, two different
log schemas. The split is inside `RE2-OB`, so `SLICE_MODALITY_PLANS` cannot express it either -- the
slice entry exists for a slice-level difference, and this is not one.

So the comparison changed, not the plan: a planned `not-carried` column the corpus does not have is
a **reading**, not a defect. It is a statement about what the *exporter* writes; the export's header
is the format's nine columns, the IR has no field for four of them, and a corpus that does not carry
one of them loses nothing. The reading carries `absent: 'corpus' | 'export' | 'both' | undefined`,
because `lossy: 0` cannot distinguish "the column is there and every cell is empty" from "there is no
such column", and the run printed the second as if it were the first 244 times. A column the
comparison *reads values from* is unchanged: a corpus without `message` is a corpus that was re-cut,
and it still fails.

The absence reaches the log as one line per slice rather than 244 per-case lines, which is the shape
the absences-per-table census already had:

> `ROUNDTRIP CENSUS columns RE2-SS: logs lacks cluster_id on 90/90 case(s), log_template on 90/90 case(s)`

### Two · an empty cell is not a missing column (finding 522)

The SockShop and TrainTicket cases were also short of rows -- `85020/86592`, `279624/279630` -- with
signatures only in the corpus of the shape `1705595459383000000 | front-end |  | `. Counting the
archive: `RE2-SS/carts_cpu/1` has **1,572 rows whose `message` cell is empty** of 86,592, and 1,572
is the gap. The reader's log branch folded `''` into `undefined` through `asText`, and the sentence
it produced named a **column** that was there:

> `missing required column 'message' (log body)`

Three facts were one branch: a layout naming no body column, a record without one, and a cell that is
empty. The refusal was also the odd one out in its own package -- `loki`, `elasticsearch` and
`clickhouse` all emit `{ kind: 'log', body: '' }` for an empty line, each with a test -- so the branch
now tests the *presence* of the value and keeps its text. `LogPayload.body: string` is what a line
with no text is for: it is still a line, at an instant, on a service.

### Three · an empty cell is not the epoch, in the second place that was true (finding 523)

Two cases failed with `the table's first instant is '0' and the injection time is '1708475361'`. That
case's `simple_metrics.csv` ends in rows of the shape `,,,,,,,,,,,,11028480,43077632,…`: the
collection stopped writing the clock before it stopped writing readings, 256 rows of it. In the
adapter, `Number('')` is `0` and `Number.isFinite(0)` is true, so those rows were filed at
**1970-01-01** and the exported `data.csv` led with an instant of `0`. The guard that existed
(`cell === undefined`) catches a row *shorter* than the header and not a row whose cell is blank.

`modalities.ts` already carries the sentence for this class -- "An empty cell is not the epoch, and
`BigInt('')` is `0n`" -- and this is the second module to need it. The row is dropped and **counted**:

> `ROUNDTRIP context 1 case(s) carried 256 row(s) with no instant; a row with no clock is not a
> sample, and filing it at 1970 would put it on no clock at all`

### Four · the witness could not testify to the one thing it witnesses (finding 524)

`differ` on a `not-carried` column is the number of cells the export **wrote** into a column it
declares empty, and `rowsMatch` never read it. An exporter that filled `methodName` passed the fourth
anchor, with the contradiction appearing as `1 written` inside one of 270 lines.

The oracle found it. `modality-comparison-shape.test.ts` holds a second implementation of the same
specification, that one counts `columns.every(reading => reading.differ === 0)` toward `rowsMatch`,
and its own comment claims the generator produces "a value in a column declared not carried". It did
not. Seeding the case the comment promised made the two implementations disagree, and the oracle was
right. A value in a declared-unfilled column is now a `problem`, so the case fails and the reason
names the column, the count, and the statement it contradicts. All 270 real cases write 0 values in
all four columns; nothing in the estate changes, and a future exporter cannot pass by writing one.

### Readings

> Ledger for `v3.85`.

| item | value |
| --- | --- |
| `core` test suite | **248 files, 6307 tests passed** (at v3.85) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.85) |
| repo test suite | **252 files, 6494 tests passed** (at v3.85) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100** (per-file thresholds, no exemption); unchanged, and both changed modules measure 100 of 100 |
| new tests | **6300 -> 6307, net +7**: four for the absent column (corpus, both, export, read-from column), two for the body (an empty cell is a line, a null one is not), one for a dateless row |
| the corpus's log schemas | **24 nine-column, 244 seven-column** of the 268 the comparison reached; the two that failed before it are seven-column when read from the archive |
| rows the reader refused | **1,572 of 86,592** in `RE2-SS/carts_cpu/1` (1.8%), 6 and 16 in the two TrainTicket cases quoted |
| rows with no clock | **256** in `RE2-OB/checkoutservice_cpu/2`, filed at 1970 until this round |
| the SS case, on the archive | **86,592 of 86,592 log rows, 0 signatures only in the corpus**, 3.7 s, 962 MB |
| the OB case, on the archive | **110,067 log rows and 199,960 spans**, 10.5 s, 1,499 MB, `data-csv-time` green |
| list | **27 -> 25**: the run's readings close the heap entry and the header entry |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P0 | a round trip that carries all 270 cases | **the comparison no longer fails a case for its corpus's schema**, and the three causes are repaired; 24 scored last time | one more dispatch, and read `ROUNDTRIP PASSED (270 case(s))` |
| P1 | worker count decided by memory rather than by the stall reading | open since v3.80 | choose the cap from the stall measurement |
| P1 | a budget stated as a default and a budget stated by the file | open since v3.84 | make the battery read each claimant's declared budget and report the smaller |
| P2 | a `terms` map per target, so the aggregate can say which keys a rule writes | open since v3.83 | nine shapes instead of one, decided as a record change |
| P2 | the index grows every round | unchanged | measure the distance to the ceiling first |
| P3 | coverage numbers have no reader that computes them | unchanged | teach `docs:check` to read a report |

**The lesson.** A plan is a claim about a corpus, and a claim that a *suite* has one shape is a claim
about four case directories being identical. They are not: two directories eleven apart differ in
their log header, and the difference is not a defect in either. The instrument that could have said
so was the census -- and the census existed, one level up, counting *tables* per slice. It never
counted *columns*, because the plan was taken to be the answer to that question.

The same shape appears in the other three findings: `message` is a column and an empty cell is a
value; a time cell is an instant and an empty one is nothing at all; `differ` is a count and it was
never read. Four times, one fact was read as another because the code had a name for the first. The
repairs are all the same: give the second fact its own field, its own sentence, and -- for the
census -- a count.




## v3.86 · the battery published one budget for 61 claimants, and nine of them are held to another

The line the round started from is the one this battery prints when everything is green:

> `verify-sites-are-sensitive: PASSED (135 claim(s) across 61 file(s) …)`
> `slowest claimant … 23 000 ms (budget 120000 ms per test)`

`--testTimeout=120000` is what the gate passes, and it sets the **inherited** default. A file that
writes `describe(…, { timeout: 30_000 }, …)` keeps 30 000, because replacing a default is what a
declaration is for. Finding 519 met this one file deep -- a claimant kept its own 30 000 for a whole
round while the flag had been raised -- and the repair raised both numbers, the file's constant and the
flag, because two numbers that should be one should be one. Nobody asked how many other files state a
number.

### One · ten claimants declare a budget, and nine of them are below the battery's

Read over the 61 files `golden-master/gate-sites.json` calls claimants (finding 525):

| claimant | its own declaration |
| --- | --- |
| `check-cli-reference.test.ts:153` | 30 000 |
| `check-fault-cases.test.ts:384` | 30 000 |
| `check-no-unsafe-shell.test.ts:465` | 30 000 |
| `check-official-roundtrip.test.ts:330` | 30 000 |
| `check-user-guide.test.ts:278` | 30 000 |
| `fetch-official.test.ts:613` | 30 000 |
| `probe-built-module-guards.test.ts:367` | 30 000 |
| `publish.test.ts:221` | 30 000 |
| `reader-against-backend.test.ts:199` | 30 000 |
| `gate-sites-are-proven.test.ts:1115` | 120 000 |

Nine of the ten are below the battery's number, the tightest by a factor of four. The direction is
what makes it a defect: a claimant that runs out of *its own* budget is reported as **unmeasured**, so
the claims that file proves stop being proved -- and the reason is a number nothing compared with the
one that furnished it.

The reader is `testBudgetDeclarations`, in `site-proofs.mjs`: the options object, the positional third
argument, and `vi.setConfig({ testTimeout })`, each resolved against a `const NAME = N;` in the same
file. The number a claimant will be held to is `governingTestBudget`'s answer, and the battery now
prints both:

> `verify-sites-are-sensitive: 10 of 61 claimant(s) declare a test budget of their own against the
> battery's 120000 ms, and 9 of those are below it: …`

### Two · the sentence could not say whose number it was quoting

A timed-out claimant printed `Test timed out in 30000ms` and the gate said *"its own 30000 ms of test
budget"* -- which is a number from the output and a claim about its provenance that had never been
checked. Three provenances now, and the third one is reachable:

| what the number is | what the sentence says |
| --- | --- |
| the file's declaration | `its own declaration furnishes (line 153; the battery furnishes 120000 ms)` |
| the battery's flag | `the battery furnishes, and this file declares none of its own` |
| neither | `neither the battery nor any declaration in this file furnishes` |

The third is what this battery's own fixture printed before it was a state the gate could name: 30 000
in the output, 120 000 on the flag, no declaration in the file. Something the gate cannot see gave that
run its ceiling -- an environment variable, or a `vi.setConfig` executed at runtime.

### Three · the reader's first reading was its own fixture (finding 526)

The first run over the claimant set reported **eleven** files and a tightest of **15 000 ms**, in
`site-proofs.test.ts` -- the file whose tests are about this reader. It carries a dozen fixture sources
as string literals, one of which is `vi.setConfig({ testTimeout: 15_000 })`. The scan now runs over a
copy with comments and string bodies blanked to spaces, offsets preserved so every printed line number
still opens the file. Re-measured: ten files, tightest 30 000, phantom gone -- and the *declined* count
becomes a number with meaning, 8 `timeout:` keys that belong to `spawnSync` and to a top-level object.

### Four · what the gate refuses, and what it only says

The nine are reported and not refused. A claimant's declaration is that file's statement about its own
work: `fetch-official.test.ts` gives one test 60 s and another 30 s because it knows which of them
waits on a socket, and there is no measurement here saying 30 s is wrong for those tests. What the gate
*does* refuse is a budget it cannot price -- a name with no `const` -- because the census would then be
a guess published as the battery's number.

### Readings

> Ledger for `v3.86`.

| item | value |
| --- | --- |
| `core` test suite | **248 files, 6316 tests passed** (at v3.86) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.86) |
| repo test suite | **252 files, 6503 tests passed** (at v3.86) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100**; per-file thresholds, no exemption, unchanged -- this round changed no file under `src/` |
| new tests | **6307 -> 6316, net +9**: six for the reader (literal and named, a child's budget declined, an unresolvable name, the positional form, the `vi.setConfig` form, which side governs), three for the battery (a claimant below the battery, a census with no declaration, a budget that cannot be priced) |
| claimants read | **61**: 10 declare a budget of their own, **9 below** the battery's 120 000, **0** unpriceable, **8** `timeout:` keys declined as a child's |
| the tightest declaration | **30 000 ms** at `check-cli-reference.test.ts:153`, against 120 000 furnished |
| gate sites | **135 across 62 of 88 scripts**; the round's own edits moved **5** sites in `verify-sites-are-sensitive.mjs`, and all five annotations were re-attached by their content rather than their line |
| the 270-case dispatch | **triggered, not read** -- `official-data.yml` run `43406267321` on `rcaeval-re2` was opened at the start of the round and was still running when this was written |
| list | **25 -> 26**: the ordering of the two budgets is reported and not required, which is a residual rather than a repair |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P0 | Anchor 4 is closed for the three RCAEval anchors only | run `43406267321` dispatched this round against `rcaeval-re2` | read its `ROUNDTRIP` line, and the `cost` line beside it |
| P1 | The worker count decides the stall verdict | open since v3.80; the cap still follows the CPU quota and the memory measurement, not a stall reading | choose the cap from the stall measurement |
| P2 | A claimant's budget is compared and the comparison refuses nothing | new at v3.86: nine claimants are named below the battery and the run is green | decide a ceiling for the direction that costs a claim |
| P2 | A record's terms are a map of strings to numbers | open since v3.83 | nine shapes instead of one, decided as a record change |
| P2 | The live list grows whatever the bound is | **measured this round**: the open volume is 197,246 of 200,000 bytes (0.3 of a round away), but the binding constraint is `index < openBytes` -- the index is 113,067, so the next volume cannot be born from one round | perform the split: a new volume born larger than the index, and the closed part of `## Open` moved into a volume |
| P3 | The coverage figure has no reader that computes it | unchanged, and now demonstrated: finding 539 is a ledger row that quoted the second instrument for four rounds, because nothing divides 14 996 by 14 999 in a gate | teach `docs:check` to read a report, and to say which instrument printed the number |

**The lesson.** The battery had a number for the machine and a number for the file, and it published
the first as if it were the second. The repair is not a stricter rule -- nine files at 30 000 are making
a considered statement about their own work -- it is that a number a gate prints has to name the
population it was taken over, and a number read out of a claimant's own output has to say *whose* it is.
Both repairs are one sentence longer, and both make a sentence that was already true narrower.

## v3.87 · the battery credited every red run with a catch, and its margin was a share of the wrong denominator

The previous round left two sentences in this gate and one leftover. The leftover was *"a claimant's
budget is compared and the comparison refuses nothing"*, and the sentences were the census and the
margin. Reading the margin line on the shipped tree is what started this round:

> `verify-sites-are-sensitive: slowest claimant packages/core/test/check-fault-cases.test.ts 29590 ms
> of the 30000 ms it is given (99%), of 61 run 4 at a time`

*One hiccup from a red gate* -- and the reflex is to raise a declaration. The arithmetic is between a
file's wall clock and a per-test ceiling, and that file runs fifty-odd tests (finding 528).

### One · the catch was a fact about the file, and the claim is a fact about the mutation

The verdict was one line:

```js
if (outcome.status !== 0) continue;   // credited
```

Three different events produce that exit code, and only the first is the proof (finding 527): the
mutant arrived and the witness failed; the mutant arrived and a test budget stopped the run; the file
went red without the mutant ever arriving. A claimant that throws as soon as `RCA_HOLLOW_SITE` is set
-- a preload that cannot load in that child, a mutated statement that breaks an import -- would have
been credited with **every** claim it makes. The gate's published sentence is *"some test goes red for
every one of them"*, and the instrument could not tell *the test noticed* from *the file crashed*.

### Two · two facts the run already had, and two baskets

`hollowed` (from the trace) says the mutant arrived at the claimed line; `exhaustedTestBudget` (from
the output) says the run was not stopped by a budget. A red run missing either is reported in its own
basket with its own sentence and is **not** a proof:

| basket | the sentence it produces |
| --- | --- |
| exited without recording the mutant | `which exited 1 with the exit hollowed but never recorded the mutant, so the failure was not the mutant's and this claim is not proved by it` |
| truncated by a budget | `which did not finish inside the 30000 ms of test budget its own declaration furnishes (line 384), so the run was stopped rather than failed` |

and the counts are printed on every run, because a total that could be made of crashes is not a
reading:

> `220 of 220 mutant run(s) are credited -- each exited non-zero, recorded its mutant, and finished
> inside the budget it was given (0 truncated by a budget, 0 exited without recording the mutant, 0
> survived, 0 unmeasured)`

Measured on this tree the hole was **open and unexercised**, which is why it is proved by fixtures: the
crashing claimant and the truncated claimant both leave the gate **green** on the old reader -- two
claims, status 0 -- and the census assertion in the healthy case fails there too. Three of the suite's
cases would have to be deleted rather than adjusted for the old reader to pass.

### Three · the ceiling the leftover asked for is a rule, not a number

v3.86 declined to refuse the nine declarations below the battery, on the argument that no measurement
here says 30 s is wrong for a test that waits on a socket. That is still true and it was not the whole
question: a truncated mutant run proves nothing, so a declaration below the battery **can cost the
claim it was meant to prove**. The rule is the answer to *which ceiling*: no declaration may be the
thing that ends a run whose whole product is a failure. The direction that costs a claim is refused;
the direction that costs only wall clock (a declaration above the battery) is still reported and still
not refused.

### Four · the margin, measured per test because that is what the ceiling applies to

Baseline runs now also write vitest's own JSON report, into the scratch directory, so nothing lands in
the tree; the 220 mutant runs do not pay for a file nothing reads, since their verdict is the exit code.
`longestTest` picks the longest `assertionResults[].duration`, keeps the test's name, and the sentence
becomes:

> `the longest single test of any claimant is 5227 ms of the 30000 ms it is given (17%), in
> packages/core/test/fetch-official.test.ts: scripts/fetch-official.mjs · the digest pin reports the
> digest of a small asset alongside a large one in the same run`

17% of the tightest declaration in the estate, in a different file from the one the old line named --
five times the headroom the 99% implied. A run that wrote no report says so instead of reporting a share
of a number nobody measured, and that branch is exercised by every fixture case, whose stand-in runner
writes no vitest report. The reader accepts only a **number** for `duration`; a string there is a report
from something else, and coercing it would be the same mistake one field down (a test caught it:
`'4000'` became a 4 000 ms measurement).

### Readings

> Ledger for `v3.87`.

| item | value |
| --- | --- |
| `core` test suite | **248 files, 6323 tests passed** (at v3.87) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.87) |
| repo test suite | **252 files, 6510 tests passed** (at v3.87) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100**; per-file thresholds, no exemption, unchanged -- this round changed no file under `src/` |
| new tests | **6316 -> 6323, net +7**: four for the report reader (the longest across suites, the name kept, a non-numeric duration skipped, an unparseable report), three for the battery (a claimant that crashes when armed, a claimant the budget stopped, and the margin split into its two readings -- the per-test sentence and the no-report one) |
| claimants read | **61**, 220 claims, 281 runs in **8.0 min**: **220 of 220 credited**, 0 truncated, 0 unrecorded, 0 survived, 0 unmeasured |
| the widest test | **5 227 ms of 30 000 (17%)** in `fetch-official.test.ts`, against the previous round's `29 590 of 30 000 (99%)` read off a file's clock |
| the tightest declaration | **30 000 ms** in nine of the 61 claimants, unchanged: the rule replaced the ceiling, so no number had to move |
| gate sites | **135 across 62 of 88 scripts**; the round's edits moved **5** sites, all in `verify-sites-are-sensitive.mjs`, re-derived rather than hand-edited |
| the 270-case dispatch | **triggered, not read**: `official-data.yml` run `43406267321` (`rcaeval-re2`) was still inside its round-trip step when this was written, two and a half hours into a 300-minute bound |
| list | **26 -> 26**: one entry closed by the rule, one opened for the measurement the margin still does not take |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P0 | Anchor 4 is closed for the three RCAEval anchors only | run `43406267321` dispatched at v3.86 against `rcaeval-re2` | read its `ROUNDTRIP` line, and the `cost` line beside it |
| P1 | The worker count decides the stall verdict | open since v3.80; the cap still follows the CPU quota and the memory measurement, not a stall reading | choose the cap from the stall measurement |
| P2 | The margin is the baseline's | new at v3.87: the 220 runs that must fail are not asked for a per-test report | whether a mutant that hangs should say *which* test hung, since the budget kill is now refused without that |
| P2 | A record's terms are a map of strings to numbers | open since v3.83 | nine shapes instead of one, decided as a record change |
| P2 | The live list grows whatever the bound is | unchanged | measure the distance to the ceiling first |
| P3 | The coverage figure has no reader that computes it | unchanged, and now demonstrated: finding 539 is a ledger row that quoted the second instrument for four rounds, because nothing divides 14 996 by 14 999 in a gate | teach `docs:check` to read a report, and to say which instrument printed the number |

**The lesson.** Both defects this round are the same mistake at different distances from the subject:
a number that describes one thing published as the number that describes another. An exit code
describes a process; the claim is about a mutation. A file's wall clock describes a file; the ceiling is
per test. Neither repair needed a new measurement -- the trace already said whether the mutant arrived,
and vitest already knew each test's duration -- only the decision to read the thing the sentence is
about.

## v3.88 · the round trip finished 270 of 270, and the step after it died of a four-gigabyte heap

The round opened by reading the dispatch that v3.86 left running, and closed by finding out why CI had
been red for four rounds. Two measurements, no new theory.

### One · the largest anchor, read end to end (finding 529)

`official-data.yml` run `43406267321` on `rcaeval-re2` spent 2 h 34 min in the round-trip step and
finished:

> `ROUNDTRIP PASSED (270 case(s) round-tripped through the official layout)`
> `ROUNDTRIP report …/rcaeval-scores.json: 270 scored, 0 skipped, 0 failed`
> `ROUNDTRIP cost 270 case(s) in 154.4 min; largest 8015 MB of the 12336 MB this run was given (65%)
> at RE2-TT/ts-travel-service_loss/3; slowest 118.2 s`

**270 of 270 at `oracle=1.00`**, with 43 911 094 log rows and 101 806 286 spans across 450 tables, 1620
of 4410 columns carried exactly, and 78 768 011 values in columns the IR does not carry. The P0 that has
been open since v3.86 is closed by that reading, and the record in `golden-master/roundtrip.json` now
names this run rather than the 2026-10-26 one.

The step after it did not finish. `check-aggregate-tables.mjs` reached the first SockShop case and died:

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed -- JavaScript heap out of memory
##[error]Process completed with exit code 134.
```

It held the same table **four times** -- the published text, a parse tree of it, the reduction's text, a
parse tree of that -- and then re-read and re-parsed the published file *twice more* to print a row and
column count. `compareGrids` now walks both texts a line at a time, and the counts come out of that same
pass. The fixture that proves it is a table of the corpus's shape (3000 buckets by 1500 keys, 4 500 000
cells, 9 MB as text, produced by the repository's own reducer), and the heap is the assertion:

| `--max-old-space-size=96` | the old shape | this shape |
| --- | --- | --- |
| 4 500 000 cells | `FATAL ERROR: Reached heap limit` | `4 500 000 cell(s), all equal`, exit 0 |

### Two · a guard that needs the history, run by jobs that had one commit (finding 530)

CI had not been green since **2026-11-10**. Two jobs, every push, the same sentence:

```
## Repository 'Commits': the revision `d179592` does not resolve to a commit
```

`check-repository-table` refuses a `Commits (at \`<rev>\`)` row it cannot resolve, and that is right.
The row cannot name the commit that writes it -- that one does not exist yet -- so it names its parent,
and the default checkout is `fetch-depth: 1`: the parent is not in the runner's clone while it is in
every developer's. Four rounds of red, every local run green, and `verify:local` structurally unable to
see it because it runs in the full clone.

`artefacts` and `cold-tree` -- the two jobs that run `pnpm docs:check` and `pnpm docs:check:cold`, both of
which contain that guard -- now check out with `fetch-depth: 0`, and
`docs-guards-need-history.test.ts` reads the workflow as text and refuses a job that runs a docs guard
with a shallow checkout. The rule is proved in both directions: on a fixture (a shallow job is named, a
`fetch-depth: 1` is named, a guard inside a multi-line `run:` block is read), on the real file, and on
the mechanism itself -- a real `git clone --depth 1` of a real two-commit repository, where
`rev-parse <parent>` exits non-zero and `rev-parse HEAD` succeeds.

### Readings

> Ledger for `v3.88`.

| item | value |
| --- | --- |
| `core` test suite | **249 files, 6329 tests passed** (at v3.88) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.88) |
| repo test suite | **253 files, 6516 tests passed** (at v3.88) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100**; per-file thresholds, no exemption, unchanged -- this round changed no file under `src/` |
| new tests | **6323 -> 6329, net +6**: five for the workflow rule (a shallow job named, a `fetch-depth: 1` named, a guard in a multi-line `run:`, the real file, and a real `--depth 1` clone where the parent does not resolve), one for the aggregate gate (4 500 000 cells inside a 96 MB heap) |
| the 270-case dispatch | **read**: run `43406267321`, `rcaeval-re2`, 270 of 270 at `oracle=1.00`, 0 skipped, 0 failed, 154.4 min, largest 8015 MB of 12336 (65%), slowest 118.2 s |
| the step after it | **failed, and now has a reproduction**: `check-aggregate-tables.mjs` at the first SockShop case, heap out of memory, exit 134 |
| CI (a finding, not a closing reading) | **red since 2026-11-10 on two jobs**, both from the same shallow checkout -- runs `43432301194` on `1b8661d03` and `43128040784` on `e22e2de61`, failing the same two steps; repaired in `ci.yml` and held by a test that reads it. This round has no green run to cite: the first one it can is the run of the push that carries the repair |
| gate sites | **135 across 62 of 88 scripts**; one site moved (`check-aggregate-tables.mjs` 259 -> 353) and was re-derived rather than hand-edited |
| list | **26 -> 27**: the P0 round trip is closed by its reading, and its entry is replaced by the step the same run could not finish |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P0 | The aggregate-table step has not been re-run since the repair | new at v3.88: the fix is proved on a fixture of the corpus's shape, not on the corpus | dispatch `official-data.yml` on `rcaeval-re2` and read step 13 |
| P1 | The worker count decides the stall verdict | open since v3.80; the cap still follows the CPU quota and the memory measurement, not a stall reading | measure the worst stall at 2 / 4 / 6 / 8 workers and choose from it |
| P2 | The margin is the baseline's | new at v3.87 | whether a refused mutant should name the test that hung |
| P2 | A record's terms are a map of strings to numbers | open since v3.83 | nine shapes instead of one, decided as a record change |
| P2 | The live list grows whatever the bound is | unchanged | measure the distance to the ceiling first |
| P3 | The coverage figure has no reader that computes it | unchanged, and now demonstrated: finding 539 is a ledger row that quoted the second instrument for four rounds, because nothing divides 14 996 by 14 999 in a gate | teach `docs:check` to read a report, and to say which instrument printed the number |

**The lesson.** Both of this round's defects were a **precondition that held where it was measured and
not where it mattered**: a heap that was large enough for Online Boutique and not for SockShop, a clone
that held the parent on a developer's machine and not on the runner. Neither could be fixed by looking
harder at the code the failure named -- the corpus and the workflow were the subjects -- and both are now
held by a measurement rather than by a comment: one asserts a cell count inside a 96 MB heap, the other
asserts a property of the workflow text that a runner would have discovered two rounds too late.

## v3.89 · the suite's two budgets, and the one that was inherited from the tool

This round measured what the worker count costs and found that the number which actually
decided the suite's verdict was not the worker count at all. Two budgets were in force, and
neither had been set against the readings it governs.

### One · the cap, measured at four widths (P1, closed)

The question the list has carried since v3.80: `workerCount()` returns
`max(2, min(8, usable - 1))`, where the 8 came from a memory measurement and `usable` from
the CPU quota. Nothing in it consulted the stall gauge, which is the instrument that turned
the suite red twice with every test passing. So the suite was run at 2, 4, 6 and 8 workers,
three times each, with `RCA_BENCH_STALL_REPORT` pointing into a scratch directory, the
cgroup's `memory.current` sampled every 200 ms, and vitest's own JSON report kept for the
per-test durations.

The box: 32 CPUs reported, `cpu.max` = `400000 100000` (**4** CPUs allowed), `memory.max`
8 GiB. The formula therefore produces **3** workers here, and every width above 3 is
oversubscription -- 8 is 2x. That is why the table is worth taking on this machine: the
counts the formula can produce are the two top rows' neighbours, and the counts it cannot
produce are the ones that show what a misread allowance would cost.

| workers | wall clock (s) | peak `memory.current` | worst stall | of the 45 000 ms budget | verdict |
| --- | --- | --- | --- | --- | --- |
| 2 | 176.4 / 174.0 / 171.2 | 6 487 / 6 634 / 6 711 MiB | 14 392 / 13 138 / 12 700 ms | 32 / 29 / 28 % | green x3 |
| 4 | 108.3 / 109.2 / 108.9 | 6 261 / 7 361 / 6 878 MiB | 14 781 / 14 655 / 14 750 ms | 33 / 33 / 33 % | green x3 |
| 6 | 106.8 / 111.3 | 7 326 / 6 860 MiB | 21 967 / 24 111 ms | 49 / 54 % | **red**, green |
| 8 | 110.8 / 114.9 | 7 594 / 7 625 MiB | 37 785 / 39 874 ms | 84 / 89 % | **red, red** |

Four facts, each of them a number rather than an argument:

- **The wall clock is bought at 4 and nowhere above it.** 174 s at 2 workers, 109 s at 4,
  108 s at 6, 113 s at 8. The suite is CPU-bound at 4 on this box, so every worker above the
  quota is a process waiting for a slot.
- **The worst file is the same file in nine runs of ten**: `ingest-report.test.ts`, at
  12.7-40.1 s depending on nothing but the width. The tenth is `typecheck-entrypoint.test.ts`
  at 14 750 ms, which is the same reading inside run-to-run noise.
- **At the count the formula actually produces (3), the worst file is at a third of the
  budget.** That is the answer the open entry asked for, and it is why the cap did not have
  to move: the count in force was never the risk.
- **At 8 workers both ceilings are nearly spent** -- 89% of the stall budget and 93% of the
  memory limit -- and the wall clock is *worse* than at 4. Nothing about 8 is affordable on
  4 CPUs. The formula already forbids it: eight workers implies nine usable CPUs, so the
  ceiling is only ever in force on a machine that can feed it. That implication was true
  only as long as the allowance could be read, which is finding 532.

Two of the twelve runs are not in the table: the third at 6 and the third at 8 overlapped the
edit this round makes, and one of them failed on a row this round adds. A reading taken on a
tree that is being edited is not a reading, and the failure it produced was evidence of the
new rule rather than of the old tree -- so the row is dropped rather than counted, and the
two widths that matter for the finding (6 and 8) are re-taken below, three times each, on the
finished tree.

### Two · a budget of 5 000 ms that nobody set, against a suite that needs 12 281 (finding 531)

The reds in the table above are not the stall gauge. They are vitest's **default per-test
timeout**, 5 000 ms, which this repository never chose -- and the same twelve runs say that
default is **two and a half times below the suite's own slowest legitimate test**: 12 281 ms,
`typecheck-entrypoint.test.ts`, at 4 workers.

The estate has known this class for a long time: `timeout-budget.test.ts` carries a table of
measured standalone costs and a rule that a file whose cost reaches the default must state a
budget larger than it. That table has nine rows and it is **reactive** -- its own docstring
says so: "it can check every row it has and cannot discover a row it does not." Three of the
four files this round found are in a family the table had never been pointed at.

What the measurement found, on files that state no budget at all:

| file | 2 workers | 4 | 6 | 8 | what its cost is |
| --- | --- | --- | --- | --- | --- |
| `derive-gate-sites-tally.test.ts` | 2 710 / 2 628 / 2 705 | 2 837 / 3 528 / 3 364 | 4 700 / **5 449** | 7 597 / 9 876 | parses 89 scripts twice, in process |
| `derive-gate-sites-throws.test.ts` | 2 834 / 2 561 / 2 542 | 3 327 / 3 722 / 3 406 | 4 301 / 4 718 | 9 493 / 10 521 | reads every script, twice over |
| `derive-gate-sites-annotations.test.ts` | 838 / 860 / 887 | 1 334 / 1 379 / 1 154 | 1 810 / 1 902 | 2 921 / 2 666 | runs the same gate over the same tree |
| `check-aggregate-tables.test.ts` | 1 509 / 1 223 / 1 229 | 1 274 / 1 460 / 1 260 | 2 300 / 2 617 | 2 709 / 3 135 | spawns the gate, one 4 500 000-cell corpus |

Bold is a red. The 6-worker row for `throws` is the one to keep: **4 718 ms of a 5 000 ms
budget is 94%**, green by 282 milliseconds, and the row below it is what the coin came up
twice.

The durations in the table for the two red rows are *larger* than the budget they blew --
9 876 and 10 521 ms against 5 000 -- and that is a fact about the instrument rather than
about the tests: a synchronous test cannot be interrupted by a timer, so the timeout is
checked when the event loop turns, which is after the work has finished. The verdict says
"timed out" and the report says ten seconds, and both are true. It is also why the number in
the report is the one a table can be built from.

The repair is four constants of 30 000 ms -- the estate's tightest existing declaration, in
nine other files -- each applied to a **suite** rather than to a test, and each row carrying
its readings so a reader can disagree with the decision instead of re-deriving it. That is
`SUITE_BUDGET_MS` in `timeout-budget.test.ts`, which grew from four rows to eight.

### Three · the allowance was read from one cgroup layout and used on both (finding 532)

`workerCount()`'s premise -- eight workers implies nine usable CPUs -- is only true if the
allowance is read correctly, and it was read from `/sys/fs/cgroup/cpu.max`, which is cgroup
**v2**. On a **v1** container the quota lives in `cpu/cpu.cfs_quota_us` and
`cpu/cpu.cfs_period_us`, `availableParallelism()` reads the CPU affinity mask (which a CPU
quota does not restrict on Linux), and the reader returned `null`. The count then followed the
host: **8 workers on 4 CPUs**, on any Docker installation still on the v1 layout.

The cost of that configuration is the 8-worker row above: 89% of the stall budget, 93% of the
memory limit, and a wall clock worse than at 4. So the repair is the reader rather than the
ceiling: `cpuAllowance()` asks v2 first, falls back to the v1 pair, and returns `null` only
when neither layout speaks -- which is the case the reported count is the best available
answer to. `quotaFromV1()` reads `-1` as "no limit", the same fact `max` states in v2.

Two things are asserted about it rather than argued. The parser is driven with a filesystem it
is given, so both layouts are tested without owning either (`reader({...})` in
`worker-count-follows-the-cpu-quota.test.ts`), including the case that produced the finding: a
`cpu.max` that says `max` and a v1 quota of `400000 100000` -- which used to be `null` and 8
workers, and is now 4 CPUs and 3. And the arithmetic premise is a test:
`workerCount(8, null)` is **7**, so the ceiling of 8 is unreachable on a machine with eight
CPUs.

A third thing was found by the first run and is worth recording because it is the same mistake
one level down: the constants were declared *after* the `defineConfig` call that reads them,
so `maxWorkers` evaluated `cpuAllowance()` while `CPU_MAX_PATH` was in its temporal dead zone
and the whole suite failed to collect with `Cannot access 'CPU_MAX_PATH' before initialization`.
The constants moved above the config object, and the comment there says why rather than
leaving the next reader to rediscover it.

### Four · the finished tree, at the two widths that were red

The same harness, on the tree this round leaves behind, at 6 and 8 workers, three times each:

| workers | wall clock (s) | peak MiB | worst stall | verdict |
| --- | --- | --- | --- | --- |
| 6 | 112.4 / 110.9 / 107.6 | 7 264 / 7 352 / 7 424 MiB | 26 363 / 22 099 / 23 978 ms (59 / 49 / 53%) | green x3 |
| 8 | 113.6 / 111.8 / 111.4 | 8 037 / 8 115 / 8 157 MiB (98 / 99 / 100% of the limit) | 38 689 / 38 868 / 37 049 ms (86 / 86 / 82%) | green x3 |

The stall readings are the same ones as before the fix, which is what a budget change should
do: the gauge measures the event loop, and a test's timeout does not move an event loop. What
changed is the verdict, and the only thing that changed it is the number each of those files
declares.

### Readings

> Ledger for `v3.89`.

| item | value |
| --- | --- |
| `core` test suite | **249 files, 6349 tests passed** (at v3.89) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.89) |
| repo test suite | **253 files, 6536 tests passed** (at v3.89) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100**; per-file thresholds, no exemption, unchanged -- this round changed no file under `src/` |
| new tests | **6329 -> 6338, net +9**: three for the cgroup v1 parser (a quota, `-1`, a reading it cannot use), four for the fallback chain (v2 wins, v1 when v2 says `max`, v1 when there is no v2 file, neither layout speaking), one for the ceiling premise (`workerCount(8, null)` is 7) and one that reads this machine -- all nine in `worker-count-follows-the-cpu-quota.test.ts`. The four budget declarations are data the existing rule reads, so they add no test |
| the cap | **12 full-suite runs** at 2 / 4 / 6 / 8 workers (10 counted): wall 174 / 109 / 108-111 / 111-115 s, peak 6.5 / 6.9 / 7.1 / 7.6 GiB, worst stall 14.4 / 14.8 / 24.1 / 39.9 s -- **32 / 33 / 54 / 89%** of the 45 000 ms budget. The count the formula produces here is 3 |
| the reds | **3 of the 10** were red: 6 workers once, 8 workers twice, all from a 5 000 ms per-test default that no file in this repository set |
| budgets declared | **4 files** gained a 30 000 ms suite budget; the table in `timeout-budget.test.ts` grew **4 -> 8 rows** |
| the allowance | **cgroup v2 was the only layout read**; a v1 pair now parses too, and `workerCount(8, null)` is 7 -- the ceiling is unreachable on eight CPUs |
| gate sites | **135 across 62 of 88 scripts**, unchanged -- this round touched no `scripts/*.mjs`, and the derivation is content-keyed rather than line-keyed so it says so |
| list | **27 -> 28**: the worker-count entry closed by the measurement, two entries opened for what the measurement could not reach |
| LLM calls | **0**. This round's instruments are the suite's own clocks, the cgroup's counters and vitest's JSON report; no provider was called, so the round's cost is wall clock on one box |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P0 | The aggregate-table step has not been re-run since the repair | unchanged since v3.88; the dispatch is in flight | read step 13 of run `43444874640` |
| P1 | The timeout table cannot discover a row it does not have | new at v3.89: eight rows, all of them found by a red run or by this round's sweep; a ninth tree-walking file would be found the same way | a reader that computes each test's share of its own budget from a run's JSON report, in a place that runs the whole suite |
| P2 | The ceiling of 8 has never been measured where it is not oversubscription | new at v3.89: every reading of it is on a 4-CPU quota, where it is 2x | one run on a machine with nine or more CPUs |
| P2 | The margin is the baseline's | open since v3.87 | whether a refused mutant should name the test that hung |
| P2 | A record's terms are a map of strings to numbers | open since v3.83 | nine shapes instead of one, decided as a record change |
| P2 | The live list grows whatever the bound is | unchanged | measure the distance to the ceiling first |
| P3 | The coverage figure has no reader that computes it | unchanged, and now demonstrated: finding 539 is a ledger row that quoted the second instrument for four rounds, because nothing divides 14 996 by 14 999 in a gate | teach `docs:check` to read a report, and to say which instrument printed the number |

**The lesson.** Both defects this round are budgets that were **inherited from a tool and never
compared with the readings they govern**: a 5 000 ms per-test timeout that sits two and a half
times below the suite's own slowest legitimate test, and a CPU allowance that was read from one
of the two cgroup layouts while being used on both. Neither was a wrong calculation. Each was a
number that arrived with the machinery, was true of some other project's suite, and had no
reader that compared it with this one's -- which is the same shape as finding 528 one round
earlier, where a percentage divided a file's clock by a test's budget. The repair in both cases
was to measure first and let the number follow: the four files got the numbers their own runs
produced, and the allowance got a second reader rather than a lower ceiling.

## v3.90 · the first reading from the corpus says the step died in its reader, and had never had a verdict

The leftovers table v3.88 left began with a line: the aggregate-table step had not been re-run since its
repair. This round's re-run answered with two facts, neither of them "pass". It **died of a four-gigabyte
heap after the thirtieth case**, and **it could not have passed even if it had not**: the gate counted
"cannot be read" as "failure", and 156 of the corpus's case directories cannot be read.

### One · step 13's reading: exit 134 after ninety-six seconds of silence

`official-data.yml` run `43444874640`, step 12: **270 of 270 round-tripped at `oracle=1.00`** in 2 h 40 m.
Step 13:

```
17:49:43  RE2-OB/recommendationservice_socket/1: 97 row(s) x 30 column(s) = 2910 cell(s), all equal
17:51:19  FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
17:51:53  Aborted (core dumped)  node scripts/check-aggregate-tables.mjs --official-dir "$OFFICIAL_DIR"
```

Both dispatches died in this step (13:11 was finding 529's four copies). After v3.88 the comparison itself
was streaming -- the per-case "all equal" lines are that repair working -- so **the memory was not in the
comparison**.

### Two · the repair is in the reader: two hundred megabytes parsed to answer a question 64 KiB answers

`readLogRows()` was:

```js
const rows = parseCsvObjects(readFileSync(at, 'utf8'));   // every record, as an object
const columns = new Set(Object.keys(rows[0]));
for (const needed of ['timestamp','container_name','log_template'])
  if (!columns.has(needed)) { problems.push(...); return undefined; }   // the cheap check
```

That cheap check is the point of the function: the reduction keys on `log_template`, the rendered template
the corpus's cluster table quotes, and a file without it cannot be reduced at all. The check is three
`Set.has` calls. The parse in front of it is proportional to the file.

From the archives' central directories (`read-remote-index.mjs`: 202 186 bytes fetched of 2 801 345 134)
and one case of each inflated by range request:

| case | `logs.csv` | records | columns |
| --- | --- | --- | --- |
| `RE2-OB/checkoutservice_cpu/1` | 23 515 107 B | 171 322 | 9, with `log_template` |
| `RE2-TT/ts-train-service_socket/2` | **202 258 338 B** | **274 621** | 7, **without** it |

8.6 times the file with two columns fewer, so the parse built 274 621 seven-field records -- each field a
separate string -- and threw every one of them away. Reproduced here, on that case, with the runner's heap:

```
node --max-old-space-size=4096 scripts/check-aggregate-tables.mjs --case /tmp/corpus/RE2-TT/...
Command terminated by signal 6     peak RSS 4 307 128 KB     wall 29.72 s
```

The same directory, after the repair, in a heap eight times smaller:

```
check-aggregate-tables: OK (1 case(s) reproduced, 2910 cell(s) ...)
peak RSS 92 300 KB     wall 0.53 s
```

**Ask first, fold second.** Three pieces, each one rule under two drivers rather than a second copy of a
rule:

- `firstRecord()` opens the file and reads **64 KiB**. The longest header in the corpus is 82 bytes.
- `iterateCsvRows()` is the CSV reader as a generator, and `parseCsvRows()` is now
  `[...iterateCsvRows(text)]` -- one parser under two drivers, because a second copy of the quoting rules
  is a second thing that can disagree about `""`.
- `reduceLogts()` is the reduction as a fold over any `Iterable<LogRow>`: one entry per (bucket, column)
  actually observed, and no record at all. `buildLogtsCsv()` is its materialising caller;
  `logtsCells(grid, bucket)` reads one row without building the table.

The fourth piece is the one that would have caught this. The comparison no longer holds a table either: it
walks the corpus's own `logts.csv` and computes the expected row for each bucket as that row arrives, so a
case costs its counts plus one record of each file. Four new tests hold the three shapes: 16 MB of
unusable log refused in a 64 MB heap, 200 000 records folded into a four-row table in a 64 MB heap, and the
fold's rendering equal to the materialising caller's text, bucket for bucket.

### Three · a gate that never had a verdict: 25 readable, 156 not

Step 13 is named "Every aggregate table the corpus ships is either **reproduced or refused**". Its
behaviour was: every case it could not read became an entry in `problems`, and any problem exited 1. On the
real corpus that is not a corner case, it is nearly all of them:

| suite | case directories holding `logts.csv` | holding a rendered `log_template` |
| --- | --- | --- |
| `RE2-OB` | 91 | **25** |
| `RE2-SS` | 90 | 0 |
| `RE2-TT` | 90 | 0 |

The corpus ships **two log formats**. The one the reduction was written against is
`time,timestamp,container_name,message,level,req_path,error,cluster_id,log_template`: nine columns, the last
one the rendered template text. The other is the same seven columns without the last two, and its
`cluster_info.json` holds **Drain's masked templates** (`catalogue ts=<:TIMESTAMP:> caller=logging.go:<:NUM:>
method=List ...`) while the log row carries only `message` -- the message with the template's leading
container word removed.

Three reductions of that second format were tried against `RE2-SS/carts_cpu/1` (86 592 records, 51
clusters), and all three fail in a way that says the table was produced by a parser rather than by a rule
this repository could state:

| rule | rows matching exactly one cluster | matching none | matching several |
| --- | --- | --- | --- |
| mask tokens as an open run (`.+?`), whole message | 45 623 / 86 592 | 40 969 | **0** |
| the same, allowing the template's leading container word to be absent | 24 632 | 16 337 | **45 623** |
| the same by prefix-stripping only | 45 623 | 40 969 | 0 |

The second row is the informative one: as soon as the prefix may be absent, a row matches up to **three**
clusters at once -- 4 413 rows match keys 14, 19 and 40 together. Choosing between them is not a detail of
the rule, it is the corpus's own clustering pass, and any rule written here would be a guess that lands in
the wrong column and looks like a number. Refusing is right.

What was wrong is that a refusal was indistinguishable from a defect. A gate that fails whenever the corpus
holds a shape it cannot read cannot pass on the corpus it was built for -- and this one never had: it went
red twice on 2026-11-13 (13:11 with finding 529's heap, 17:51 with finding 533's) and neither run reported a
verdict on the 25 cases it **can** read.

**The repair gives the step the three outcomes its title always claimed**, each printed as it happens:

- **reproduced** -- the reduction equals the corpus's table and the case's cells are added up;
- **refused** -- this rule cannot read this case, with the reason on the same line, tallied by reason in
  the summary;
- **disagreed** -- the rule applied and produced a different table, which fails the step.

A run that reproduced **nothing** still fails, with its own sentence: "0 of N case(s) could be reproduced,
which is not a pass". That is the half of the old behaviour worth keeping -- "nothing was wrong" and
"nothing was compared" print the same number of failures -- and it is why the three single-case refusal
tests still go red for the right reason. What changed is that a corpus with 156 unreadable cases and 25
readable ones now says so:

```
check-aggregate-tables: OK (25 case(s) reproduced, <cells> cell(s) reduced from logs.csv and equal to
the corpus's own logts.csv; 156 refused, 156 for no rendered template column)
```

The refusal sentence also names what the file does ship (`its columns are time, timestamp, container_name,
message, level, req_path, error`), because "no log_template column" leaves a reader wondering whether the
column is spelled differently elsewhere in the corpus. It is not.

### Four · the line on the failing path used to be false

`checkCase()` returned the comparison's cell count whether or not it had found differences, and `main()`
printed `... = N cell(s), all equal` for every case with a non-zero count. A case that disagreed printed:

```
RE2-OB/x/1: 2 row(s) x 2 column(s) = 4 cell(s), all equal
check-aggregate-tables: RE2-OB/x/1: time=0 column='currencyservice_1' published=3 reduced=2
check-aggregate-tables: FAILED (1 problem(s))
```

Two sentences about the same four cells, one of them false. Nobody wrote a lie: the line was added to report
a count, "all equal" was the shape every passing case printed, and **nobody read the pair together** because
the failing path is the one nobody reads. The repair counts the wrong cells and uses them -- `N differ` for
`all equal` -- with a test that asserts both the new sentence and the absence of the old one.

### Readings

> Ledger for `v3.90`.

| item | value |
| --- | --- |
| `core` test suite | **249 files, 6349 tests passed** (at v3.90) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.90) |
| repo test suite | **253 files, 6536 tests passed** (at v3.90) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97** (statements / branches / functions / lines); `cli` **100 / 100 / 100 / 100**; per-file thresholds, no exemption |
| new tests | **6338 -> 6349, net +11**: three for the generator (it agrees with the array driver on nine shapes including a quoted newline, it hands back the first record before reading the rest, and a field holding a newline is one record), four for the fold (its rendering equals the materialising caller's bucket for bucket, it consumes an iterable rather than collecting one, it tells "no rows" from "no matches", and a bucket nobody wrote reads as zeros), and four for the gate (a refusal counted beside a reproduction, 16 MB of unusable log refused in a 64 MB heap, 200 000 rows folded into a four-row table in a 64 MB heap, and `N differ` where the old line said `all equal`) |
| the corpus, measured | **181 case directories** hold a `logts.csv` (91 OB / 90 SS / 90 TT), of which **25** carry a rendered `log_template`; the largest `logs.csv` is **202 258 338 bytes** in **274 621** records; the longest header is **82 bytes** |
| before | `--max-old-space-size=4096` on `RE2-TT/ts-train-service_socket/2`: **signal 6**, peak RSS **4 307 128 KB**, wall **29.72 s** |
| after | `--max-old-space-size=512` on the same case: **OK**, peak RSS **92 300 KB**, wall **0.53 s** |
| the mask experiment | three reductions of the seven-column format against `RE2-SS/carts_cpu/1` (86 592 rows): 45 623 / 40 969 / 0, then 24 632 / 16 337 / **45 623** with an optional container prefix, then the first again by prefix-stripping |
| gate sites | **136 across 62 of 88 scripts** (was 135): the one new exit is "a run in which no case could be reproduced", which the old step had no way to say because every refusal was already a failure |
| the battery | **221 of 221** claim(s) across 61 file(s), after the two shards were re-run on the finished tree |
| list | **28 -> 29**: the "aggregate table has not been re-run" entry closed by this round's reading, and two entries opened for what the reading could not reach |
| LLM calls | **0**: this round's instruments are the archives' central directories, three range requests and the corpus's own files; no provider was called |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P0 | The repaired step has not been run on the corpus | new at v3.90: the repair is proved on three real case directories and four fixtures, not on 181 | dispatch `official-data.yml` on `rcaeval-re2`, read step 13's census, and record the run in `golden-master/roundtrip.json` |
| P1 | 156 case directories are refused, and the only exact statement available for them is an inequality | new at v3.90: per container and bucket the marginals of `logts.csv` cannot exceed the log rows of that container -- true in both formats, strictly weaker than a reproduction | decide whether a weaker claim gets its own name and its own gate rather than being bolted onto one whose sentence is "reproduced" |
| P1 | The timeout table cannot discover a row it does not have | unchanged since v3.89 | a reader that computes each test's share of its own budget from a run's report |
| P2 | The ceiling of 8 has never been measured where it is not oversubscription | unchanged | one full-suite run on nine or more usable CPUs |
| P2 | The margin is the baseline's | open since v3.87 | whether a refused mutant should name the test that hung |
| P2 | A record's terms are a map of strings to numbers | open since v3.83 | nine shapes instead of one |
| P2 | The live list grows whatever the bound is | unchanged | measure the distance to the ceiling first |
| P3 | The coverage figure has no reader that computes it | unchanged, and now demonstrated: finding 539 is a ledger row that quoted the second instrument for four rounds, because nothing divides 14 996 by 14 999 in a gate | teach `docs:check` to read a report, and to say which instrument printed the number |

**The lesson.** v3.88 repaired the copy of the table it could see, and this round's reading says the memory
was a layer out -- in a reader that parsed two hundred megabytes to answer a question sixty-four kilobytes
would answer. The same reading found the larger defect behind it: **a gate whose name states two outcomes,
which implemented one.** A step that fails whenever the corpus holds a shape it cannot read is not strict,
it is mute -- and this one had been mute for its whole life, twice dying before it could say a word about
the twenty-five cases it *can* read. The repair that matters is not the heap figure; it is that the step now
prints a verdict per case, in the three states its title always claimed.

## v3.91 · the step that finally had a verdict said the rule was reading the wrong column

v3.90 gave step 13 its three outcomes and dispatched it. The dispatch came back red, and it was right
to: four of the twenty-four case directories the rule can read disagreed with the corpus, and the
disagreement was in the rule rather than in the archive.

### One · step 13's reading: four cases of twenty-four, and all four `_loss`

`official-data.yml` run `43501279961`, step 12: **270 of 270 round-tripped at `oracle=1.00`** in
172.3 minutes, largest case 7890 MB of a 12 336 MB budget. Step 13, thirty-two lines into the census:

```
ROUNDTRIP CENSUS columns RE2-OB: logs lacks cluster_id on 66/90 case(s), log_template on 66/90 case(s)
RE2-OB/currencyservice_loss/1: 97 row(s) x 47 column(s) = 4559 cell(s), 37 differ
RE2-OB/emailservice_loss/1: 97 row(s) x 35 column(s) = 3395 cell(s), 6 differ
RE2-OB/productcatalogservice_loss/1: 96 row(s) x 73 column(s) = 7008 cell(s), 3 differ
RE2-OB/recommendationservice_loss/1: 97 row(s) x 65 column(s) = 6305 cell(s), 12 differ
check-aggregate-tables: FAILED (21 problem(s))
```

Twenty cases equal, four different, and every one of the four a `_loss` case. A rule that is right
about twenty and wrong about four is not a rule with an edge case; it is a rule reading something
that is *usually* what it wants. The reduced table was short every time, never long:

```
check-aggregate-tables: RE2-OB/currencyservice_loss/1: time=1705389075 column='frontend_33' published=5 reduced=2
```

### Two · the bucket, read out of the case's own log file

`RE2-OB/currencyservice_loss/1` is 18 152 000 bytes in 131 837 records, and its central-directory entry
inflates from 1 599 607 compressed -- 1.73 MiB fetched of a 1135.85 MiB archive to answer this. The
682 `frontend` rows in bucket 1705389075, grouped by `cluster_id` and then by `log_template`:

```
3  33 | frontend request error failed to do currency conversion for product <:*:> rpc error: code = Unavailable desc = ...
2  33 | frontend request error failed to do currency conversion for product LS4PSXUNUM: rpc error: code = Unavailable desc = ...
```

Both groups say `cluster_id` **33**. Only the second carries the rendered template that
`cluster_info.json` quotes for key 33; the first carries a Drain-masked rendering, `<:*:>` where the
product id was, which matches no key at all. The rule matched `log_template` exactly, so it dropped
three rows the corpus had counted -- and it dropped them silently, because a dropped row is what an
unclustered row looks like.

The column the corpus groups by is `cluster_id`. `log_template` is a *rendering* of it, and the
rendering is inconsistent in exactly the cases a fault injector re-clustered. Measured against the
archive's own bytes, one case each:

| case | masked-template rows | cells differing, template rule | cells differing, id rule |
| --- | --- | --- | --- |
| `RE2-OB/currencyservice_loss/1` | 162 of 131 811 | 37 of 4559 | **0** |
| `RE2-OB/emailservice_loss/1` | 6 of 169 891 | 6 of 3395 | **0** |
| `RE2-OB/productcatalogservice_loss/1` | 5 of 117 581 | 3 of 7008 | **0** |
| `RE2-OB/recommendationservice_loss/1` | 548 of 147 388 | 12 of 6305 | **0** |
| `RE2-OB/checkoutservice_cpu/1` (control) | 0 of 171 302 | 0 of 2910 | **0** |

The same four directories that made step 13 red pass `--case` with **0 differing cells of 21 267**.
That is the whole proof: same files, same bytes, one column read differently.

### Three · the repair: the id first, the template as fallback and as a second opinion

`reduceLogts` now reads `cluster_id` when the row has one, counts into `<container>_<key>`, and keeps
`log_template` in two roles: the fallback for files that have no id column, and a second opinion on
every row where both speak. The grid carries the tallies, so the run can say how a row was counted
rather than only that it was:

```js
if (fromId !== undefined) {
  into = [fromId];
  byClusterId += 1;
  if (fromTemplate === undefined) maskedTemplate += 1;
  else if (!fromTemplate.includes(fromId)) contradicted += 1;
} else if (fromTemplate !== undefined) { into = fromTemplate; byTemplate += 1; }
else { dropped += 1; continue; }
```

Two consequences are the point of the change rather than side effects of it. A row whose text names
one cluster and whose id names another is counted in `contradicted` and **fails the gate** -- the two
columns are two statements about one row, and preferring one of them without saying so is how a
corpus that contradicts itself would pass. And the refusal reason is no longer "no rendered template
column" but "no cluster id and no rendered template", because a file that carries a usable id and no
template was being refused as unreadable while the corpus's own table counted it.

The census line the next dispatch should print, with the cell total the four measured directories
contribute (cells that were differing cells in the run above):

```
check-aggregate-tables: OK (24 case(s) reproduced, 80832 cell(s) reduced from logs.csv and equal to the
corpus's own logts.csv; <n> row(s) counted by their own cluster id, <m> of them under a masked
template, <d> named no cluster, 0 named two different clusters; 246 refused, 246 for no cluster id and
no rendered template)
```

`80832` is the run's own arithmetic rather than this document's: it is the sum of the twenty-four
per-case cell counts the failed run printed, four of which were `37 differ` and are now `all equal`.

### Four · the failure line counted sentences, and every sentence is capped at five cells

The same run ended with `FAILED (21 problem(s))` while **58** cells differed. `comparePublished` names
at most five differing cells per case and then one `N further cell(s) differ`, so a case contributes
at most six sentences however many cells disagree: 6 + 6 + 3 + 6 = 21. The summary was a function of
the cap, and two cases differing by 37 cells and by 12 reported the same six.

The cap is right -- a 4559-cell comparison that printed every differing cell would bury the first --
so the repair is not to remove it but to stop the capped number from being the only one:

```
check-aggregate-tables: FAILED (58 cell(s) differ across 4 case(s); 21 problem(s) reported)
```

One clause above it follows from the same thought: a case whose cells all agree while its two columns
contradict each other now prints `all equal, but 1 problem(s) remain` rather than `all equal`. That is
finding 535's lesson -- the line about the cells may not be the line that decides the verdict --
stated where the verdict has stopped being about cells.

### Readings

> Ledger for `v3.91`.

| item | value |
| --- | --- |
| `core` test suite | **249 files, 6358 tests passed** (at v3.91) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.91) |
| repo test suite | **253 files, 6545 tests passed** (at v3.91) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97** (statements / branches / functions / lines, as vitest's own table prints them); `cli` **100 / 100 / 100 / 100**; per-file thresholds, no exemption; the three uncovered statements are the pre-existing ones in `src/score/official.ts`. This row read `99.98` until v3.92 measured the tree twice: `clover.xml` says 14 996 of 14 999, which is 99.98, and v8's counter says 99.97, and the row did not say which instrument it was quoting -- finding 539 |
| new tests | **6349 -> 6358, net +9**: five for the rule (a row counted by its id rather than its text, the masked count, a row that contradicts itself, the fallback when the id names no cluster, an empty id treated as no id) and four for the gate (a masked row reproduced because of its id, a case with no id column reproduced by its template, a contradiction failing with every cell equal, and a case with no `timestamp` refused by name) |
| the corpus, measured | **270** case directories hold a `logts.csv`; **24** of them carry `cluster_id` and `log_template` (`RE2-OB`); the four that failed step 13 differ by **58 cells of 21 267**; the masked rows are 162, 6, 5 and 548 of 131 811, 169 891, 117 581 and 147 388 |
| the archive, fetched | **1.73 MiB of 1135.85 MiB** (0.15%) per case directory: central directory plus three entries by range request |
| before | `--case` on the four: 37 / 6 / 3 / 12 differing cells, `FAILED (21 problem(s))` |
| after | `--case` on the same four: **0 differing cells** each, `OK (1 case(s) reproduced, ...)` |
| gate sites | **136 across 62 of 88 scripts**: unchanged in count, two lines moved and one fingerprint changed with its message, and the `provedBy` re-attached after the deriver dropped it |
| the battery | **221 of 221** claim(s) across 61 file(s), with `verify-sites-are-sensitive.mjs` re-run on the finished tree |
| list | **29 -> 29**: the "repaired step has not been run" entry closed by this reading, and the same question reopened for the repaired rule, which is proved on four directories and has not been run over 270 |
| LLM calls | **0**: the instruments are the archives' central directories, three range requests per case and the corpus's own files; no provider was called |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P0 | The repaired rule has not been run over the corpus | new at v3.91: proved on four real case directories and nine fixtures | dispatch `official-data.yml` on `rcaeval-re2`, read step 13's census for `24 case(s) reproduced` and `0 named two different clusters`, and record the run in `golden-master/roundtrip.json` |
| P1 | 246 case directories are refused, and the only exact statement available for them is an inequality | unchanged since v3.90, and the number is now exact: 270 - 24 | decide whether a weaker claim gets its own name and its own gate rather than being bolted onto one whose sentence is "reproduced" |
| P1 | The timeout table cannot discover a row it does not have | unchanged since v3.89 | a reader that computes each test's share of its own budget from a run's report |
| P2 | The ceiling of 8 has never been measured where it is not oversubscription | unchanged | one full-suite run on nine or more usable CPUs |
| P2 | The margin is the baseline's | open since v3.87 | whether a refused mutant should name the test that hung |
| P2 | A record's terms are a map of strings to numbers | open since v3.83 | nine shapes instead of one |
| P2 | The live list grows whatever the bound is | unchanged | measure the distance to the ceiling first |
| P3 | The coverage figure has no reader that computes it | unchanged, and now demonstrated: finding 539 is a ledger row that quoted the second instrument for four rounds, because nothing divides 14 996 by 14 999 in a gate | teach `docs:check` to read a report, and to say which instrument printed the number |

**The lesson.** v3.90 ended by saying the important repair was that the step could speak, and this
round is what the step said with its voice: *the rule is reading the wrong column.* The four failing
cases were not noise at the corpus's edge -- they were the four cases where the corpus's rendered
template stopped being a rendering, and no amount of reading the rule's source would have said so.
The reading that said it took one bucket of one log file and three range requests. The same run's
second defect is the quieter one and the more general: **a summary that counts the sentences a
comparison prints is a summary about the printing.** Both numbers are now in the line, and neither
is standing in for the other.

## v3.92 · the pipeline held both numbers, and nothing compared them

The leftovers table v3.90 and v3.91 both carried the same P1, unchanged since v3.89: the timeout
table cannot discover a row it does not have. This round is that reader.

### One · the table says it about itself, three times over

`test/timeout-budget.test.ts` keeps the files whose cost reaches vitest's 5 000 ms default, and it
says of how it grows:

> Found by a red run rather than by this table, which is the honest description of how the table is
> maintained: it can check every row it has and cannot discover a row it does not.

Three rows arrived that way -- `reader-against-backend.test.ts`, `publish.test.ts`, and
`check-official-roundtrip.test.ts` before them -- each as a red run on a commit that changed nothing
relevant.

The interesting part is not that the reader was missing. It is that **both quantities were already in
the pipeline**: `test:coverage` writes vitest's JSON report beside its coverage output, and that
report holds a `duration` for each of the 6 545 tests; each test file states the budget it expects,
in one of four spellings this repository documents at length. Nothing compared them, because the
comparison had no home -- the table is a list of files and the quantity is per test, the report is an
artefact of a run and the table is a document.

### Two · the reader, and the denominator that is not the largest number

`scripts/check-test-budgets.mjs` takes the reports and asks two questions:

| the file | the rule |
| --- | --- |
| states a budget | its slowest test takes at most **half** it |
| states none | its slowest test is under a fifth of the default (1 000 ms) |

Half, because a file at 94% of its budget was green by 282 milliseconds on the run before it went
red. The denominator is the budget a `describe` states rather than the largest number in the file,
and that is not pedantry: `typecheck-entrypoint.test.ts` states `RUN_TIMEOUT_MS = 180_000`, which
bounds a spawned `pnpm` and not the test, so the largest number would hand that test a 180-second
budget it does not have -- the wrong clock, in the flattering direction. With no suite budget the
largest stated number stands in, and with none at all the answer is `0`, which is "inherits the
default" and a question for the floor.

### Three · its first run named one file, and not one anybody was watching

```
check-test-budgets: gates-are-testable-is-enumerated.test.ts: its slowest test takes 1015 ms and the
file states no budget, so its verdict is decided by vitest's 5000 ms default; state one on the suite
-- 'scripts/verify-gates-are-testable.mjs · the audit of the audits leaves a group a' is the test
that will decide it
check-test-budgets: FAILED (1 problem(s) across 253 file(s); 33 state a budget and 12 have a test at
or above 1000 ms)
```

That file spawns the gate audit against temporary trees -- the shape of the three rows that arrived by
red run. It declares `SUITE_BUDGET_MS = 30_000` now, and the reading is:

```
check-test-budgets: OK (253 file(s), 6545 test(s); 34 state a budget, 12 have a test at or above
1000 ms, and the closest to its budget is typecheck-entrypoint.test.ts at 26% of 30000 ms)
```

That reading is the v3.91 tree with one declaration added, and 216 files state nothing there. Every
one of their 216 files' tests is under 100 ms, which is the other half of the evidence: without it the
rule would be "every file states a budget", and 216 numbers nobody will ever look at is how a gate
stops being read. With the new test file in the tree -- so one more declaration -- the same reader says:

```
check-test-budgets: OK (254 file(s), 6560 test(s); 35 state a budget, 12 have a test at or above
1000 ms, and the closest to its budget is ingest-report.test.ts at 21% of 30000 ms)
```

and after the first CI run named one more file, **36** state a budget. The last two numbers move with
the machine: across four runs here, 12 or 13 tests sat at or above 1 000 ms and the closest file was
anywhere from 16% to 26% of its 30 000 ms budget. The runner's own count was **19**, which is the
reading that matters and the one the section after this is about.

### Four · the step is last in its job, and that is the budget rule talking

The step runs after the mutation suite rather than beside the coverage step it depends on, because a
bound placed after a step **no recording has measured** would be argued from a sum with a hole in it
(the rule `check-ci-budget.mjs` states, and it is right). `golden-master/ci-declarations.json` holds
the promise -- 3 minutes, which is the floor -- and the round whose run measures the step deletes the
file. That file is expected to be absent most of the time, which is why the case about it asserts a
biconditional rather than a shape.

### Five · the step's first run measured it, and then found a file this machine cannot see

The step ran on `815e739` and finished **inside the second it started** -- its timestamps are
`13:29:52` and `13:29:52` -- so the 3-minute promise held by `golden-master/ci-declarations.json` is
not a close call: the file read costs a fraction of the floor `check-ci-budget.mjs` imposes. And it
failed, on a file no local run had named:

```
check-test-budgets: build-example-bundle.test.ts: its slowest test takes 1128 ms and the file states
no budget, so its verdict is decided by vitest's 5000 ms default; state one on the suite -- 'the
pack and the tree · the tool, not only the test lists a nested file the tree' is the test that will
decide it
check-test-budgets: FAILED (1 problem(s) across 254 file(s); 35 state a budget and 19 have a test at
or above 1000 ms)
```

**19** files have a test at or above 1 000 ms on the runner against **12** on a four-CPU container, and
the test it names measures 400-600 ms here. That is not a defect in the reader: it is the reader
reading the report the *runner* wrote, which is the machine whose verdicts are the ones that go red.
What it means for the rule is that the floor is a statement about a machine, and the only reading that
can act on it is CI's. `build-example-bundle.test.ts` declares `SUITE_BUDGET_MS = 30_000` now.

So the P1 entry below changes state rather than closing: the bound **has** a measurement, but the
recording `measure-ci-baseline.mjs` writes wants a run whose step passed, and this one did not.

### Six · the row nothing recomputes had a digit no run produces (finding 539)

Writing this round's ledger meant copying the one above it, and the copy did not survive being
checked. v3.91's coverage row reads **99.98**; the ten rounds before it read **99.97**; this round
measured the v3.91 tree twice -- once at `9364bea` with the working tree stashed, once with its own
changes in place -- and got **99.97** both times.

Both percentages turn out to be real, which is the finding rather than a puzzle:

```
coverage/clover.xml   14 996 covered of 14 999 statements   ->  99.980%  ->  99.98
vitest's own table    99.97 / 99.95 / 100 / 99.97                        ->  99.97
```

Two instruments, one tree. Clover reports 14 999 statements across 93 files; v8 counts different
ranges. Every other round quoted vitest, because vitest is what the step prints and what the per-file
thresholds are enforced against -- and v3.91 quoted the other one, without saying so. The document
held a percentage from one counter in a paragraph whose neighbours held the other, and **nothing here
recomputes it**, which is the open P3 entry this round did not create but did demonstrate: one digit,
in the one row with no reader, for four rounds.

The ledger's row now names its instrument, and finding 539 states the clover arithmetic beside it so
that the next reader who divides 14 996 by 14 999 finds out why the table disagrees rather than
"correcting" it back. That is the smaller of the two repairs available and the honest one: making the
guard compute the figure is a suite run inside `docs:check`, which is the entry below, not this round.

### Seven · the recording answered one promise and handed another step a slower day (finding 540)

The green run on `72e46b8` measured the new step at **1 s** against its 3-minute floor, and
`measure-ci-baseline.mjs` recorded it. What nobody had priced is that a recording is not only the answer
to the promise it settles: it is **a new day for every bound in the workflow**, and `R10` sizes every
bound from the worst day in the history. The same command came back refused:

```
check-ci-budget: `Gate-test battery (each gate's test provably fails when its guard is removed)` is
bounded at 7 min and measured 231 s: the bound is under 2 times the measurement, so a runner twice as
slow is refused for being slow rather than for hanging
```

7 minutes is 420 s and twice 231 is 462, so the bound this round inherited was, on the day this round
recorded, **too tight by 42 seconds**, and nothing about that step had changed. It is 8 minutes now.
Two things follow: a round that records a run cannot scope its diff to the step it was curious about,
because the recording is one file of seconds and every bound reads all of it; and the gate refused a
change that moved in the safe direction, which is `R6` doing what it says -- a bound under twice its
reading is refused whichever way it moved, because the rule is about the argument, not the direction.

**One correction, in the record rather than in the commit.** The commit that carried the row below
(`815e739`) says in its message that the tracked-file defect is finding 421. It is finding 520, "a
count derived before `git add` is a count of a tree that never existed" (v3.83); 421 is `R6` refusing
the safe direction of a budget change. The message cannot be edited and a force-push to a branch CI is
watching is a worse idea than one wrong number in a log, so it is corrected here, where a reader
looking up the finding will arrive.

### Eight · the repaired rule, over the whole corpus, at last

Run **`43706694417`** on `81f0fd6` -- dispatched at the start of v3.92 -- finished green in 2 h 51 min,
and its thirteenth step is the first time the repaired aggregate rule has been run over the corpus:

```
check-aggregate-tables: OK (25 case(s) reproduced, 83742 cell(s) reduced from logs.csv and equal to the
corpus's own logts.csv; 4073602 row(s) counted by their own cluster id, 721 of them under a masked
template, 575 named no cluster, 0 named two different clusters; 246 refused, 246 for no cluster id and
no rendered template)
```

**0 named two different clusters** is the number this round was waiting for: v3.91 made a row whose two
columns disagree a failure, and 4 073 602 rows later the corpus has none. **721** rows carried a masked
template and were counted by their id -- the repair doing the thing it was made for, at a scale no
fixture could reach.

The round trip above it is unchanged from v3.90's reading: **270 of 270 at `oracle=1.00`**, 0 skipped,
0 failed, **138.7 min**, largest 7 833 MB of the 12 336 MB the run was given (63%), slowest 131.4 s.

**25 reproduced + 246 refused is 271, and the corpus has 271 case directories** (finding 541), which
corrects a figure this corpus has carried since v3.90: the 271st is
`RE2-OB/checkoutservice_cpu/multi-source-data`, a directory whose last component is not a number, and
it reproduced 2 910 cells like any other. The round trip scores the **270** numbered ones; the
aggregate step walks one level deeper and finds the named one too. Nothing was wrong with either
count; they were counting different sets, and neither said so.

### Readings

> Ledger for `v3.92`.

| item | value |
| --- | --- |
| `core` test suite | **250 files, 6373 tests passed** (at v3.92) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.92) |
| repo test suite | **254 files, 6560 tests passed** (at v3.92) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97** (statements / branches / functions / lines, quoted from vitest's table, which is the instrument the step prints and the thresholds are enforced against); `cli` **100 / 100 / 100 / 100**; unchanged, because this round changed no file under `src/` -- measured twice, at `9364bea` with the tree stashed and with this round's changes in place, which is how the row above came to move |
| new tests | **6358 -> 6373, +15**, all in `check-test-budgets.test.ts`: the fraction rule both ways, the floor both ways, the suite budget preferred to a larger child-process timeout, all four spellings, two reports in one run, an unreadable report, a report naming no test, a missing `--report`, three unusable knob values, a result with no file name, a duration that is not a number, a report naming a file it cannot read, and the summary sentence that had no budget to be about |
| the file it found | `gates-are-testable-is-enumerated.test.ts`, slowest test **1 015 ms**, no budget; now `{ timeout: SUITE_BUDGET_MS }` at 30 000 ms |
| the corpus, at last | run `43706694417` on `81f0fd6`: **25 of 271** directories reproduced, **83 742** cells equal, **4 073 602** rows counted by their own cluster id, **721** of them under a masked template, **575** named no cluster, **0** named two different clusters; **246** refused, every one for having neither a cluster id nor a rendered template |
| the corpus's 271st directory | `RE2-OB/checkoutservice_cpu/multi-source-data` -- whose last component is not a number -- reproduced 2 910 cells; the round trip scores the 270 numbered ones, so the two counts were never of the same set |
| its reading on the finished tree | `repo` 254 files, 6 560 tests; **36** state a budget. The other two figures move with the machine and are given as ranges over four runs: **12-13** tests at or above 1 000 ms, and the closest at **16-26%** of a 30 000 ms budget. On the runner: **19** |
| gate sites | **136 -> 139** across **62 -> 63 of 89** scripts: the usage exit, the problems exit, and "the report named no test", all three proved by the new test file |
| the battery | **221 -> 224** claim(s) across **61 -> 62** file(s) |
| the CI step | `Every test's cost against the budget it declares`, **3 min**, last in the `verify` job, with `golden-master/ci-declarations.json` naming it as unmeasured |
| its first CI run | on `815e739`: started and completed at `13:29:52`, so **under a second** of a 3-minute bound, and **failed** on `build-example-bundle.test.ts` -- slowest test **1 128 ms**, no budget. The runner reports **19** files with a test at or above 1 000 ms where this container reports **12**, and that test measures 400-600 ms here, so no local run could have named it |
| its recording | run **`43720087959`** on `72e46b8`, the first green run to carry the step: **1 s** measured against the 3-minute floor, written by `measure-ci-baseline.mjs`, and `golden-master/ci-declarations.json` deleted in the same round that created it |
| the bound the recording moved | the gate-test battery: **231 s** measured, 7 min (420 s) bound, which is under twice the reading, so **8 min** now -- finding 540 |
| list | **29 -> 27**: the timeout table that could not discover a row it did not have, the repaired rule that had not been run over the corpus, and the new step's bound that was a promise -- three entries closed, and one opened and closed inside the round, so the count fell by two |
| LLM calls | **0** |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| ~~P0~~ | ~~The repaired aggregate rule has not been run over the corpus~~ | **closed by this round's reading**: run `43706694417` on `81f0fd6` reproduced **25 of 271** directories and **0** rows named two clusters, after 4 073 602 rows counted by id; the run is recorded in `golden-master/roundtrip.json` | -- |
| ~~P1~~ | ~~The new step's bound is a promise, not a measurement~~ | **closed by finding 540** in the round that opened it: `43720087959` measured it at 1 s and the declarations file is gone | -- |
| P1 | 246 case directories are refused, and the only exact statement available for them is an inequality | unchanged since v3.91, now counted against **271** rather than 270 (finding 541) | decide whether a weaker claim gets its own name and its own gate |
| P2 | The ceiling of 8 has never been measured where it is not oversubscription | unchanged | one full-suite run on nine or more usable CPUs |
| P2 | The margin is the baseline's | open since v3.87 | whether a refused mutant should name the test that hung |
| P2 | A record's terms are a map of strings to numbers | open since v3.83 | nine shapes instead of one |
| P2 | The live list grows whatever the bound is | unchanged | measure the distance to the ceiling first |
| P3 | The coverage figure has no reader that computes it | unchanged, and now demonstrated: finding 539 is a ledger row that quoted the second instrument for four rounds, because nothing divides 14 996 by 14 999 in a gate | teach `docs:check` to read a report, and to say which instrument printed the number |

**The lesson.** A table that grows only by failing is a table that has failed, and this one had said
so about itself three times -- in prose, in a file whose whole subject is that a published number with
no reader is a number nobody can trust. The repair was not a better table. It was noticing that the
run already measured the quantity and that the table already held the bound, and that the only thing
missing was a place where the two meet. **A gate that needs a new measurement is expensive; a gate
that needs two numbers the pipeline already produces is a file read**, and the reason it took five
rounds to write is that the two numbers lived in different kinds of artefact.

The round's other half is the same shape one level up, and it is the one to carry forward: the number
this round wrote into the table about its own coverage did not survive being measured twice, and the
reason it did not is that the corpus has two instruments for that figure and the row never said which.
A repository that has spent four thousand lines of guard on the counts a suite prints still publishes
one percentage it has never divided itself. Correcting the digit is the small repair; naming the
instrument is the one that stops the next reader from correcting it back.

And the third shape, which is the one that will keep arriving: **a recording is not a local act.** Every
bound in the workflow is sized from the worst day in one shared history, so the run that answered this
round's promise about a three-minute bound also made another step's seven-minute bound too tight by 42
seconds, without changing a line of it. That is the rule working, not failing -- and it means a round
that records a measurement should expect to pay for somebody else's bound.


## v3.93 · the weak claim got a name, and the coverage table got a reader

Two leftovers had been carried, unchanged, since v3.91 and v3.83 respectively. They look unrelated and
they are the same defect at two distances: a published number with nothing that computes it. The first
is `246 refused` -- a count of directories the gate could not read, printed where a reader expects a
statement about the corpus. The second is the four coverage figures, which had a sentence above them
naming a *command* and no sentence naming an *instrument*.

### One · what can be said about a file with no id and no rendered template

`RE2-SS` and `RE2-TT` ship Drain's **masked** templates in `cluster_info.json` and a `message`-only
`logs.csv`. There is no column that names the cluster a row belongs to, so the exact reduction has
nothing to key on; three attempts at a rule that infers the key are measured in finding 534, and the
second makes one row match three clusters at once. The honest conclusion, taken in v3.90, was to count
those directories as refusals and say why.

What that leaves is a line that cannot distinguish two corpora: one whose `logts.csv` is a faithful
summary of `logs.csv`, and one whose `logts.csv` is random numbers. Both print `246 refused`. A refusal
is a fact about this repository's reader, and the step's title had promised a fact about the corpus.

**The claim that is available is an inequality, and it is the only one the shape supports.** A table of
per-cluster counts is a partition of each container's lines, so its marginals cannot exceed them:

    for every container c and bucket b:   sum of logts.csv[c, *] at b  <=  rows of logs.csv with c in b

Derivable from what the file claims to be, and falsifiable: a different clock, a different log file, or
a double count fails it. What it cannot see is a misattribution *within* a container -- precisely the
thing these 246 directories have no column to check -- so it is a weaker claim than reproduction, and
the repair is to say so in the name.

### Two · `bounded`, and the sentence that keeps it apart

The gate now has four outcomes and the summary prints the exact count and the weak count in separate
clauses:

```
check-aggregate-tables: OK (1 case(s) reproduced, 4 cell(s) reduced from logs.csv and equal to the
corpus's own logts.csv; 4 row(s) counted by their own cluster id, 0 named two different clusters;
1 case(s) bounded, not reproduced: the marginals of logts.csv hold no more log cell(s) than logs.csv
has rows for that container, 3 (container, bucket) pair(s), 0 spare row(s) at the tightest over
4 published cell(s) against 4 log row(s))
```

`not reproduced` is in the sentence on purpose. A weak claim that reports itself as weak is worth
having; a weak claim counted in the same number as a strong one is findings 481, 520 and 537 wearing a
fourth outcome. A run in which nothing could be reproduced **or** bounded still fails, with its own
sentence, because "nothing was wrong" and "nothing was compared" print the same number of failures --
that is v3.90's exit, re-worded rather than re-argued.

Three refusals are all that is left of the shape, and each is decided from a 64 KiB header rather than
from a body: a table whose first column is not `time`, a column that is not `<container>_<cluster key>`,
and a table with no non-zero cell. The second is the interesting one. `containerOfColumn` requires the
suffix to be all digits, so `checkout_service_12` splits correctly and `frontend_notanumber` is refused
instead of being read as a container named `frontend_notanumber`; splitting at the last underscore would
have guessed at both.

### Three · two row counts, one field apart, in the round that introduced both

The first implementation printed `4 published log cell(s) against 2 row(s)` for a case whose `logs.csv`
held four rows. The `2` was the *published table's* row count, and the bound is against the log file's.
The two numbers were one property apart in a return object and were about different files. They are now
`publishedRows` and `logRows`, and `against N log row(s)` is the second.

This is the class of defect a new outcome is good at exposing. Nothing had ever asked this step "which
number is this, and which file is it a number about?", because it had never had two numbers of the same
shape. The test that caught it was the one asserting `1 spare row(s) at the tightest` and receiving
`0` -- a fixture of three rows and a table of one cell.

### Four · the coverage table had a sentence about a command, not about an instrument

`docs/progress.md` publishes four figures under "Measured by `vitest run --coverage`". The cost was
measured twice: finding 481 published **99.93** branches for eight rounds while every ledger read 99.80,
and finding 539 found that the retaken figures had two instruments behind them -- clover's XML said
99.980, v8's counters said 99.97 -- with the prose naming neither.

`test:coverage` now asks vitest for `json-summary` beside the reporters it already wrote, and
`scripts/check-coverage-readings.mjs` compares the four published figures with
`total.<dimension>.pct` at two decimals -- the precision the page writes -- and prints the number with
the instrument:

```
check-coverage-readings: OK (4 dimension(s) equal to the v8 counters in
packages/core/coverage/coverage-summary.json: statements 99.97%, branches 99.95%, functions 100%,
lines 99.97%)
```

`clover` stays in the reporter list rather than being replaced. It is the second instrument the 0.01
disagreement was measured with, and removing it would remove the ability to notice that the two differ.

### Five · `UNCHECKED` is an outcome, and the duplicate wiring was refused by a test

`docs:check` does not run the suite, so on a cold tree there is no report. Two dishonest answers are
available -- pass silently, or fail on a table that may be perfect -- and the script takes neither: it
parses the table, refuses every structural defect, and prints `UNCHECKED (no coverage report at …)`.
CI runs the same script with `--require` in the step that already reads that run's reports, so a missing
report there is a broken pipeline rather than a cold tree.

The first wiring put the script in `docs:check` **and** named it in the CI step, and
`ci-reaches-doc-guards.test.ts` rejected the pair: a guard inside the aggregate must reach the pipeline
through the aggregate, never by a hand-maintained list, because the duplicate list is what silently
stops tracking the aggregate. The resolution keeps the strict half where the report exists. It was the
right refusal -- a guard that runs in two places and compares nothing in one of them is the page's own
defect with a green tick.

What it deliberately does not compare is the `Gate` column. That column restates
`packages/core/vitest.config.ts`'s thresholds, and `coverage-thresholds.test.ts` already holds those two
numbers equal; a second reader of one claim is how this repository has twice ended up with two numbers
that were both green.

### Six · the tallies the round moved

| what | before | after | why |
| --- | --- | --- | --- |
| gate sites | 139 across 63 of 89 scripts | **140 across 64 of 90** | the new reader's `fail()` is a failure exit, so the deriver counts it and the proofs table gains one `provedBy` |
| gate calls | 157 | **158** | same site, `process.exit(1)` once |
| the battery | 224 claims across 62 files | **225 across 63** | `check-coverage-readings.test.ts` declares the script it drives |
| the suite | 250 files / 6 373 tests (core) | **251 / 6 384** | one file and eight tests, plus three in the aggregate gate's own file: the equal case, a stale figure named with both numbers, no table, a missing dimension, a duplicate row, a report without a total, `UNCHECKED`, and `--require` with no report |
| the corpus gate's exits | 2 | **2** | the bounded refusals are `return`s, not exits -- they are outcomes, and only a run with no outcome at all exits |

### Readings

> Ledger for `v3.93`.

| item | value |
| --- | --- |
| `core` test suite | **251 files, 6384 tests passed** (at v3.93) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.93) |
| repo test suite | **255 files, 6571 tests passed** (at v3.93) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97** (statements / branches / functions / lines, from `packages/core/coverage/coverage-summary.json`, which is v8's counters -- the instrument the new reader names); `cli` **100 / 100 / 100 / 100**; unchanged, because this round changed no file under `src/` |
| new tests | **6373 -> 6384, +11**: eight in `check-coverage-readings.test.ts`, three in `check-aggregate-tables.test.ts` (22 -> 25), and one test of that file rewritten in place rather than added -- the inequality's pass, its breach with both numbers named, a column that names no container, a file refused from its header alone, and the mixed run where a bounded case sits beside a reproduced one |
| the instrument | `v8` counters, `json-summary`; `clover` kept as the second instrument, because the 0.01 disagreement of finding 539 is only observable while both are written |
| gate sites | **139 -> 140** across **63 -> 64 of 90** scripts: one failure exit, the coverage reader's `fail()` |
| the battery | **224 -> 225** claim(s) across **62 -> 63** file(s) |
| list | **27 -> 25**: the 246 directories that had only an inequality, and the coverage figure that had no reader |
| LLM calls | **0** |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| ~~P1~~ | ~~246 case directories are refused, and the only exact statement available is an inequality~~ | **closed by finding 542**: the inequality has a name (`bounded`), its own clause in the summary, and a failure path that is a `disagreed` case. Proved on four fixtures; **not yet run over the corpus** | dispatch `official-data.yml` on `rcaeval-re2` and record what step 13 prints |
| P2 | The ceiling of 8 has never been measured where it is not oversubscription | unchanged: every reading here is on a 4-CPU cgroup quota, where 8 is 2x | one full-suite run on nine or more usable CPUs |
| P2 | The margin is the baseline's | open since v3.87 | whether a refused mutant should name the test that hung |
| P2 | A record's terms are a map of strings to numbers | open since v3.83 | nine shapes instead of one |
| P2 | The live list grows whatever the bound is | unchanged | measure the distance to the ceiling first |
| ~~P3~~ | ~~The coverage figure has no reader that computes it~~ | **closed by finding 543**: `check-coverage-readings.mjs` compares the four figures with the run's own v8 counters and names the instrument; CI runs it with `--require` | -- |

**The lesson.** Both leftovers were the same sentence with different nouns: *a number printed beside a
measurement, with nothing that recomputes it*. `246 refused` is the gate's own count standing where a
fact about the corpus belongs, and 99.93 is a figure typed from a run that no longer exists. The repair
in each case was not a better number. It was to name what the number is about -- `bounded, not
reproduced` for the first, `the v8 counters in this file` for the second -- because a claim that says
what it is can be checked, and a claim that does not will be read as the stronger one.

The second half of the lesson is about where a guard may live. The coverage reader was written to run
in two places, and a test refused it, correctly: an aggregate guard that is also named by hand in the
pipeline is a list that stops tracking the aggregate the moment someone edits one of them. The strict
mode went to the place that has a report; the aggregate kept the part that a cold tree can answer. That
is not a compromise -- it is the same division the suite counts already use, and the reason it looked
like one is that the page had been publishing a figure it never divided.


## v3.94 · the refusal named the budget, and the test was in the output all along

One leftover, carried since v3.87, and it was the smallest kind of wrong: a sentence that is true,
specific, and points at the wrong object. `verify-sites-are-sensitive` refuses a run that did not
finish, and it named the number that ended the run -- `did not finish inside the 2500 ms of test
budget` -- which is a ceiling the whole file shares. The line to change is the test that hangs.

### One · a sentence with a number and no subject

Two refusals fire when a run does not finish. The baseline that never passed says `so its claims are
unmeasured rather than unproven`; the mutant run that was cut says `so the run was stopped rather than
failed`. Both are careful about the distinction they were written for -- a red test and a stopped run
are different findings -- and both stop at the budget.

The second path had nothing else at all: its `detail` was two fixed sentences, so a stopped mutant run
contributed a number and no evidence. The first path quoted the run's summary, which includes `FAIL`
lines, capped at 160 characters -- a cap a deep suite name reaches before it reaches the test name --
but the head sentence, the one that goes into the annotation, named only the budget.

### Two · the name was under the sentence the gate already read

Vitest 3.2.4 prints, for a test that exceeds its budget, a block in which the budget sentence sits
directly under a `FAIL` line naming the file and the test. The bytes in `site-proofs.test.ts` are a real
run: a two-test suite with a 1 500 ms budget and one test that sleeps for 60 s, placed in
`packages/core/test/` for one command so the include pattern would take it.

`exhaustedTestBudget` matched `Test timed out in \d+ms` and returned the number; nothing looked at the
line above. So the repair is a second reader over a string the gate already held -- `outcome.output`,
captured for every run for the summary and the tail -- and it costs nothing per run. The leftover had
estimated the price as "one JSON file per mutant run" and the reading as "which test a mutation makes
wait". Both were wrong in the same direction: the fact was already there, and the file would have been
a second copy of it. The report's `duration` would have answered a different question -- how long the
test ran before the ceiling -- and the output answers that too, in the summary line above the block.

### Three · the case that must not be silent, and why it is blocks rather than the first `FAIL`

A run holds several failures, so "the first `FAIL` line" is a specific claim that can be false: an
assertion in one test beside a budget kill in another is one `FAIL` line each. `hungTests` scopes the
timeout sentence to the block that carries it, from a `FAIL` line to the next, and a run with two kills
answers with two names; the clause prints the count rather than the first name and the word "a test".

The third case is the one this repository keeps finding one level down. A run whose reporter printed the
budget and no `FAIL` line has no test to name, and a refusal that stayed silent there would be
indistinguishable from a reader that did not look -- "no test hung" and "no test was named" would print
the same number of names. The clause says `its own output names no test, only the budget`, and a new
`namelessTimeout` fixture makes that sentence failable: it emits the budget with no `FAIL` line beside
it, and the gate has to produce the honest sentence rather than the silent one.

### Four · what the `terms` type would cost, decided rather than deferred

The other leftover this round touched is the one that has been carried since v3.83 and is the last
position of the coverage residual: `OfficialCaseScore.terms` is `Readonly<Record<string, number>>`, so
`noUncheckedIndexedAccess` hands every read `number | undefined` even for a key the target's producer
writes every time. One of those reads keeps a `?? 0` for it (at `official.ts:1973`, where the term is
*added*, and absent would be `NaN`); the other lost its fallback at v3.83 when the measurement said
absent and `0` answer the same comparison.

Two cast-free designs were derived this round, and both fail for a reason worth writing down rather than
rediscovering.

- **A generic record plus a total dispatch table.** `OfficialCaseScore<K>` with
  `terms: TermsOf<K>`, and `{[K in ScoreTargetId]: (ctx) => Aggregation}`. The table is total by
  construction, which is the property the `never`-assignment buys today. But the dispatch indexes it with
  a `target` of the *union* type, so the value is `Aggregator<'openrca-1.0'> | … | Aggregator<'itbench'>`,
  and calling a union of function types requires the argument to satisfy every member -- a wider case
  array is not assignable to the narrower parameter. One `as` at the lookup is the only way through, and
  a cast is a promise where the leftover asks for a proof.
- **A discriminated report.** `OfficialScoreReport` as a union over `target`, each member carrying
  `cases: readonly OfficialCaseScore<K>[]`. Narrowing works -- `switch (report.target)` narrows the
  whole object, so the reads inside each arm are total -- but only if the *pair* is constructed inside
  the arm. A report assembled as `{ target, cases }` from a union-typed target and a
  `A[] | B[]`-typed array has lost the correlation, and narrowing one does not narrow the other. So the
  cast-free version does not annotate the existing shape: it collapses the case scorer, the aggregator
  and the report assembly into one per-target builder, nine times over.

That is a rewrite of the module that computes every published number, in exchange for one branch. The
risk it would guard is already guarded at run time: `official.test.ts:876` asserts
`report.breakdown.evidenceHits` on a real export, so a producer that stopped writing the key fails a
test today. What the type would buy is that it fails at build time instead -- a real gain, at a price
this round declines to pay, and the entry stays open with the price written into it. Two things would
reopen the decision: a second target reading a key another target writes, which is the shape where a
wrong key silently answers `0` and no report test pins it; or a `?? 0` appearing in a sum whose `0` is
a wrong answer rather than a no-op.

### Readings

> Ledger for `v3.94`.

| item | value |
| --- | --- |
| `core` test suite | **251 files, 6388 tests passed** (at v3.94) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.94) |
| repo test suite | **255 files, 6575 tests passed** (at v3.94) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** -- unchanged, because this round changed no file under `src/` |
| new tests | **6384 -> 6388, +4**: three in `site-proofs.test.ts` (the recorded run, the mixed run and the two-kill run, and the three shapes that must name nobody), one in `verify-sites-are-sensitive.test.ts` for the nameless case, plus the two existing refusal cases extended in place to require the name |
| gate sites | **140** across **64 of 90** scripts: unchanged, and five of them moved by the two import lines -- re-derived, not edited |
| the battery | **225** claim(s) across **63** file(s): unchanged |
| list | **25**, with one closed and one opened: the stopped run that named nobody (finding 544), and the failing run whose ceiling is still unmeasured |
| LLM calls | **0** |
| cost of the repair | one `FAIL`-block scan of a string already in memory, per stopped run: no new spawns and no new files |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P1 | The corpus reading the `bounded` outcome still owes | run `43735099650` dispatched at v3.93; step 13 pending while the round trip runs | read step 13's census, and record it in `golden-master/roundtrip.json` and the baseline page |
| P2 | The ceiling of 8 has never been measured where it is not oversubscription | unchanged: every reading here is on a 4-CPU cgroup quota, where 8 is 2x | one full-suite run on nine or more usable CPUs |
| P2 | How close a *failing* run comes to its ceiling | the surviving half of the entry finding 544 closed, now an entry of its own: a mutant's verdict is its exit code, and nobody asks it for per-test durations | a per-test reading from a run whose product is a failure |
| P2 | A record's terms are a map of strings to numbers | **decided this round (finding 544)**: both cast-free designs are a rewrite for one branch, and the runtime witness already exists; the entry stays open with the price in it | a second target reading another target's key |
| P2 | The live list grows whatever the bound is | unchanged | measure the distance to the ceiling first |

This volume is at 197,151 of its 200,000 bytes: the next round opens `progress/volume-15.md`.

**The lesson.** This was the cheapest kind of defect and it had survived seven rounds: the evidence was
inside the string the gate was already holding, and the sentence beside it named something else. The
leftover that recorded it had even costed the repair -- "one JSON file per mutant run" -- and the cost
was zero. A leftover is a hypothesis about what a repair costs, and it is written by the round that
declined to make it; that is exactly the situation in which an estimate is least likely to be checked.

The second thing is about what "deciding" looks like for a type. The `terms` entry had been carried for
eleven rounds with the sentence "it is here so that a later round decides it on purpose". A decision
that is only a sentence is not distinguishable from the deferral it replaces, so this round derived the
two designs that would actually work, measured what each costs, and wrote down what would reopen it. The
entry is still open. It is now open with the reason it has been open.

## v3.95 · the weak claim was reading two clocks, and 246 of 246 directories said so

The previous round closed with "This volume is at 197,151 of its 200,000 bytes: the next round opens
`progress/volume-15.md`". The first half was right and the second half was too small a plan: a new
volume has to be **born** larger than the index it is compared with, and the index is 114,097 bytes,
so opening one meant moving eleven rounds rather than one. That is this round's first job and its
least interesting paragraph; the interesting one is what step 13 of the `Official data` dispatch said
when the inequality reached the corpus for the first time.

### One · a table whose total is right and whose every bucket is wrong

Run `43735099650` (2026-11-15) round-tripped `rcaeval-re2` and then failed step 13. The step printed
**246 lines** and every one of them said `over the bound`:

```
RE2-OB/checkoutservice_cpu/2: container 'cartservice' in bucket 1708474635 publishes 131 log cell(s)
and logs.csv holds 0 row(s) for it; a table that summarizes a log file cannot count more lines than
the file holds
```

Zero rows in a bucket the container demonstrably logged in, for all six of that case's containers, over
ninety-seven consecutive buckets, in every one of the 246 directories. A gate that disagrees with every
case it is pointed at is not measuring the corpus, and the same case's totals said so out loud: 110 047
published cells against 110 067 log rows, a difference of exactly the 20 rows that name no cluster. A
table that double-counted would be wrong in its total too. This one was right in its total and wrong in
every bucket, which is a reader filing rows somewhere else.

### Two · the fixtures were all written on the boundary, which is why none of them could see it

`logts.csv`'s time column is the second a fifteen-second window **starts** at, and `reduceLogts` places
a row with `Math.floor(atSeconds / LOGTS_BUCKET_SECONDS) * LOGTS_BUCKET_SECONDS`. The marginal side --
`countRowsByContainer`, added by finding 542 -- keyed its map by `row.atSeconds`, the second the row
fell on. One of those is a window and the other is an instant, and they are the same number only when a
row lands exactly on a boundary.

Every fixture in `check-aggregate-tables.test.ts` landed exactly on one: `at(0)`, `at(15)`, `at(30)`.
Six rows inside a window produced one entry in the map, the published cell said six, and the gate
refused a table that was right. The corpus's timestamps are real instants -- `1708474643` is inside the
window that starts at `1708474635` -- so the corpus disagreed everywhere at once. This is finding 545,
and its lesson is not "the fix was one line"; it is that a fixture written at a boundary can only
exercise a rule that agrees with the boundary.

### Three · what the corpus says now, measured rather than dispatched

The three `rcaeval-re2` archives were fetched locally and their digests matched the registry pins
(`RE2-OB` `0605a36c…`, `RE2-SS` `7aff9a3a…`, `RE2-TT` `6706311d…`; 4.24 GB in, 271 case directories
out). Before the repair, `RE2-SS` alone printed **63 441** refusal lines across its 90 directories and
exited 1. After it, the whole corpus, in 2 m 13 s:

```
check-aggregate-tables: OK (25 case(s) reproduced, 83742 cell(s) reduced from logs.csv and equal to the
corpus's own logts.csv; 4073602 row(s) counted by their own cluster id, 721 of them under a masked
template, 575 named no cluster, 0 named two different clusters; 246 case(s) bounded, not reproduced:
the marginals of logts.csv hold no more log cell(s) than logs.csv has rows for that container, 270445
(container, bucket) pair(s), 0 spare row(s) at the tightest over 35462054 published cell(s) against
40008239 log row(s))
```

25 reproduced and 246 bounded is the same partition step 13 walked, with the third outcome -- `refused`,
246 of them -- gone. The step's own sentence is unchanged; what changed is that the number it prints
beside `bounded` is now a measurement of the archive.

**Two tests hold it**, and both were red before the repair: six rows at seconds `0…5` inside one window
against a published cell of six (a log side keyed by the second answers 1), and `14`, `15`, `15` across
a boundary against cells of 1 and 2 (a log side keyed by the second answers 0 and 0, and prints the
corpus's sentence in six lines). The second one is the one that matters for the class: it crosses a
boundary rather than sitting on it.

### Four · the split, and the sentence that predicted it

Volume 14 held 22 rounds at 197,523 bytes, which is 0.28 of a round of headroom, and the index was
already 114,097 bytes -- so a volume born with one round in it would have been refused by the relation
that keeps the index smaller than the file it is compared with. Eleven rounds moved: `v3.84` through
`v3.94`, 118,302 bytes, into `progress/volume-15.md`; volume 14 keeps `v3.73` through `v3.83` at 79,221
bytes. The two files tile the log byte for byte (79,221 + 118,302 = 197,523) and the guard's line says
so: `index 114,097 of open volume 118,302`.

Two citations had to move with it, and both were the kind that rots silently: `docs/audit/volume-13.md`
named `progress/volume-14.md` as the home of findings 542–544, which are `v3.93` and `v3.94`, and
finding 539's paragraph said "every other round in `docs/progress/volume-14.md`" about a set that now
spans two volumes. The first is a path, the second is a quantifier over a path, and both are now the
open volume rather than a filename.

### Readings

> Ledger for `v3.95`.

| item | value |
| --- | --- |
| `core` test suite | **251 files, 6390 tests passed** (at v3.95) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.95) |
| repo test suite | **255 files, 6577 tests passed** (at v3.95) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** -- unchanged, because the repair is in `scripts/` and no file under `src/` moved |
| new tests | **6388 -> 6390, +2**, both in `check-aggregate-tables.test.ts`: six rows in one window, and two rows straddling a boundary |
| the corpus | **271 directories** read end to end locally in **2 m 13 s**: 25 reproduced (83 742 cells), 246 bounded (270 445 pairs, 0 spare row at the tightest, 35 462 054 cells against 40 008 239 rows), 0 refused |
| the fetch | 3 archives, 4.24 GB, every digest equal to `golden-master/official-assets.json` |
| gate sites | **140** across **64 of 90** scripts: unchanged, two moved by the 17 lines of comment, re-derived rather than edited |
| the battery | **225** claim(s) across **63** file(s): unchanged |
| the volumes | **15**, 242 rounds; volume 14 at **79,221** and volume 15 born at **118,302** against an index of **114,097** |
| list | **25**, with one closed and one opened: the corpus reading the `bounded` outcome owed, and a grid the gate compares against without ever asking whether the table is on it |
| LLM calls | **0** |
| cost of the repair | one `Math.floor` per row of a log file the gate was already reading: no new pass, no new file, and 2 m 13 s for the whole corpus on four cores |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P1 | The workflow that found this has not run since the repair | the local read is the evidence and it is complete: 271 directories, same partition as step 13 | one dispatch of `official-data.yml` on this commit, and step 13's line recorded |
| P2 | The gate compares buckets without asking whether the time column is on the grid | measured this round: **0 of 26 116** published rows across the 271 directories are off the 15-second grid | a refusal for an off-grid time, and the sentence that names the grid |
| P2 | The ceiling of 8 has never been measured where it is not oversubscription | unchanged: every reading here is on a 4-CPU cgroup quota, where 8 is 2x | one full-suite run on nine or more usable CPUs |
| P2 | How close a *failing* run comes to its ceiling | unchanged: a mutant's verdict is its exit code, and nobody asks it for per-test durations | a per-test reading from a run whose product is a failure |
| P2 | A record's terms are a map of strings to numbers | unchanged: both cast-free designs are a rewrite for one branch | a second target reading another target's key |
| P3 | Three rounds in this log were written in Chinese | `v3.69`, `v3.83`, `v3.84` are prose in a language the rest of the log is not in, and no gate reads a document's language | translate them against the record, and make the next document's language checkable |

**The lesson.** The inequality was written in v3.93, tested by fourteen fixtures, and its first reading
of the corpus disagreed with all 271 directories -- because every one of those fourteen fixtures put its
rows on a boundary, and a boundary is the one place where two clocks read the same. The corpus was not
the thing that was wrong, and the sentence the gate printed said otherwise for one push.

The second thing is about what a fixture proves. `at(0)` and `at(15)` were not arbitrary: they are the
values a table writes, and they are exact. Reading them as "a row at 0.123 s" made the fixture agree
with a rule that only holds at 0.000 s. A fixture is a claim about the shape of the data, and the shape
this corpus has is that timestamps are instants -- which the fixture helper's own `+ 123 456 789` was
written to imitate, and which its callers then rounded away.
## v3.96 · three rounds were written in a language the rest of the log is not in

The Open list carried this since v3.95: `v3.69`, `v3.83` and `v3.84` are prose in a language the other
241 rounds are not written in, and no gate reads a document's language. This round translated the three
against the record and built the reader that would have said so.

### One · eighteen gates over these documents, and not one of them asks what language a sentence is in

`docs:check` runs eighteen steps before this round. They hold the suite counts to a run, the citations to
findings that exist, the volume boundaries to a tiling, the open list to its own arithmetic, the
repository table to the tree, the roundtrip record to a CI run, the vocabularies to a single source, the
CLI reference to a parser, and the site count to a derivation. Every one of them passed, on a log in which
three rounds cannot be read by a reader of the other 241.

The measurement is one command's worth of reading. A **run of eight or more Han characters** outside a
quotation was found on **96 lines across five documents** before the translation -- 34 in `volume-14.md`,
32 in `volume-13.md`, 28 in `volume-15.md`, and one each in `docs/audit/volume-02.md` and
`docs/audit/volume-03.md`. After it, **zero**.

### Two · what a quotation is, why the threshold is eight, and what this cannot see

The rule has to leave the citations alone, because this repository cites a Chinese document constantly
and the citation is a byte string, not prose. Three forms arrive here verbatim and all three are
excluded: a **fenced block** (a captured output, a quoted table), a **code span** (one path, one
identifier, one line -- with any number of backticks as its delimiter, since `` ``…`…`` `` is how a span
containing a backtick is written), and a **block quote** (a paragraph lifted from the external
documentation).

Eight characters, because every legitimate Chinese string in this tree is shorter: `金标` is two,
`§六` is one, `04-里程碑与路线图.md` is nine but sits inside a code span, and the longest unquoted Han
string in the tree before this round was eight characters of a quoted rule in `docs/audit/volume-02.md`
which is now a code span. A threshold is a decision, so both sides of it are asserted in the suite: seven
characters pass, eight refuse.

**What it cannot see, stated rather than discovered later.** A round could put its prose in block quotes
and this reader would call it a quotation. That is the same limit the ledger-name rule in
`progress-volumes.mjs` carries and states: the guard's subject is the accident, not the lie. The
alternative -- refuse every Han character -- would have made the citations unwritable, and an exemption
list of Chinese file names would have been a second document to maintain.

### Three · the rewriting, and the numbers that did not move

Four files changed, and the three ledgers did not: `v3.69` still reads *243 files, 6191 tests*, `v3.83`
*248 / 6299*, `v3.84` *248 / 6300*. What moved is the prose around them -- 14 322 → 15 175 bytes for
`v3.69`, 9 026 → 9 423 for `v3.83`, 6 120 → 6 299 for `v3.84`, 1 429 bytes more of English across the
three -- and one citation in `docs/audit/volume-02.md`, where 08's own rule was quoted inline with a
nested code span and is now a double-backtick span so that the quotation stays verbatim and stops
reading as prose.

The two shapes that a naive reader gets wrong are both fixtures rather than remarks. A span delimited by
two backticks around text containing one: a reader matching `` `[^`]*` `` ends that span at the inner
backtick and leaves sixteen characters of Han in "prose" -- it would have refused a citation. And an
**unterminated** backtick: the same regex swallows the rest of the line, so a line that was refused
becomes a line that passes, which is the direction a guard must never fail in.

### Four · the gate, and where it sits

`scripts/docs-language.mjs` holds the reading -- which files are documents, what a span is, where the
threshold sits -- and `scripts/check-docs-language.mjs` is the verdict and is only ever spawned, because
`verify-gates-are-testable.mjs` proves a gate by emptying it and an emptied file that a test imports kills
the worker before it can name a failing test. Thirteen tests: eight driving fixtures through the gate (a
clean tree, a paragraph, a fence, a single-backtick span, a nested span, a block quote, both sides of the
threshold, an unterminated backtick, and a tree with no document at all), five on the reading itself.

It is step sixteen of `docs:check`, which is now nineteen steps. `derive-gate-sites` re-derives to **141
failure sites across 65 of 92 scripts**: one more site, because the new gate has exactly one exit to give,
and two more scripts, because the reading behind it is a module with no exit of its own -- which is the
shape every gate in this tree has and the reason `verify-gates-are-testable` can empty one. The battery
follows the site rather than the mutation -- **225 -> 226 claims across 63 -> 64 files** -- because a claim
here is a site that a proving test file is credited with, and the new gate brought one; the mutation a
language rule offers is none, which is a different sentence from "nothing moved".

### Readings

> Ledger for `v3.96`.

| item | value |
| --- | --- |
| `core` test suite | **252 files, 6403 tests passed** (at v3.96) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.96) |
| repo test suite | **256 files, 6590 tests passed** (at v3.96) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** -- unchanged, because the new code is under `scripts/`, which the coverage gate does not instrument |
| the measurement | **96 lines** of Han prose across **5 documents** before, **0** after; **116 lines** of prose translated in three rounds (`v3.69` 43, `v3.83` 40, `v3.84` 33) |
| the rewriting | 1 429 bytes more of English across the three rounds; every number, finding reference, heading level and ledger row unchanged |
| new tests | **6390 -> 6403, +13**, all in `check-docs-language.test.ts`: eight fixtures through the gate and five on the reading |
| docs:check | **18 -> 19 steps** |
| gate sites | **141** across **65 of 92** scripts: one more site than v3.95, and two more scripts, one of which has no exit |
| the battery | **225 -> 226** claim(s) across **63 -> 64** file(s): one more, because the battery counts the sites a proving test file is credited with, and the new gate brought one |
| list | **28 -> 27**: the language entry is closed by the translation and the reader |
| LLM calls | **0** |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P1 | The workflow that found the bucketing defect has not run since the repair | run `43776772029` was dispatched on `56b9bbc`; step 13 is behind a 2.5-hour round trip | read step 13's line and close this entry |
| P2 | The gate compares buckets without asking whether the time column is on the grid | unchanged: 0 of 26 116 published rows are off it | a refusal for an off-grid time, and the sentence that names the grid |
| P2 | The ceiling of 8 has never been measured where it is not oversubscription | unchanged: every reading is on a 4-CPU cgroup quota | one full-suite run on nine or more usable CPUs |
| P2 | How close a *failing* run comes to its ceiling | unchanged | a per-test reading from a run whose product is a failure |
| P2 | A record's terms are a map of strings to numbers | unchanged | a second target reading another target's key |
| P3 | The tree's comments are English but nothing reads them | **new, and the honest edge of this round**: the gate reads markdown, and `src/`, `scripts/` and the workflows are held to English by nothing | a reader for comment bodies, which needs a lexer rather than a line scan |

**The lesson.** The defect was invisible to eighteen gates because every one of them asks a question with
a *shape* in it -- a count, a boundary, a resolvable citation -- and "which language" is not a shape. A
gate list grows by the shapes its authors hit, and the language of a document is the one property no
author thinks to check in their own writing.

The second thing is about the repair's cost. Translating three rounds is a rewrite of prose that must not
touch a number, and the temptation is to treat a record as immutable and leave the language wrong. The
record is what a round *measured*; the language it was measured in is not part of the measurement, and
saying so explicitly -- ledger unchanged, every finding reference still resolving, byte deltas printed --
is what makes the rewrite checkable rather than a claim.

## v3.97 · the grid was assumed rather than read, and the breach it printed was about the wrong subject

The Open list has carried this since v3.95: the inequality compares a table's buckets without ever asking
whether the time column is on the grid. This round asked, and the answer cost two lines of code and no
new pass over any file.

### One · a table on another origin answers with windows the log never fills

`logts.csv`'s time column is read as a bucket key. The log side floors every instant to a window --
`Math.floor(atSeconds / LOGTS_BUCKET_SECONDS) * LOGTS_BUCKET_SECONDS`, the same expression finding 545 put
there -- and the published side takes the file's own number. When the two grids differ, every published
row is compared against a window that holds no rows, and the gate prints:

```
container 'frontend' in bucket 7 publishes 1 log cell(s) and logs.csv holds 0 row(s) for it;
a table that summarizes a log file cannot count more lines than the file holds
```

Every clause of that is true and the subject is wrong: the corpus is not publishing cells it cannot have,
this rule is comparing two origins. It is finding 545's shape one step upstream -- a sentence about a file
in a place where the reader will read it as a sentence about the corpus -- and the corpus itself says the
refusal is safe to write: **0 of 26 116** published rows across the 271 directories are off the grid.

So a time that is not a multiple of fifteen is recorded once and refused rather than counted ninety-seven
times and reported as a breach:

```
logts.csv: its time column reads 7, which is not on the 15-second grid the reduction buckets on;
the inequality compares per-window totals, so a table written on another origin would be answered
with cells the log file never fills rather than with a fact about the corpus
```

### Two · the fixture that keeps the refusal from being over-broad

A refusal is a bigger claim than a breach, so it needs a case that stays a breach. A table one window away
-- `15` where the log row is at second `0` -- is **on the grid**, so it is compared, and the comparison
fails on its numbers:

```
container 'frontend' in bucket 15 publishes 1 log cell(s) and logs.csv holds 0 row(s) for it
```

That is the right verdict for a table that really does disagree, and the pair of fixtures is what says the
new rule reads the grid rather than the numbers. Both were red-then-green in the right order: with the
refusal removed, the off-grid fixture prints `FAILED (1 case(s) publish more log cell(s) than their own
logs.csv holds; 1 problem(s) reported)` -- the sentence this round exists to stop printing.

### Three · what did not move

The corpus read is the same line it was: **25 reproduced, 246 bounded, 0 refused**, 83 742 cells and
270 445 pairs, in 2 m 22 s, from the same three archives. A rule that refuses nothing on the real corpus is
a rule whose cost is zero until the day a corpus disagrees about where its windows start.

### Four · the push came back red, and the gate that went red measures the box

CI on the round's first push failed one step: `Every test's cost against the budget it
declares`. `scripts/check-test-budgets.mjs` named **`gen-examples.test.ts`** at 1 820 ms
with no declared budget, which is past the 1 000 ms floor its rule sets on a file that
inherits vitest's 5 000 ms default. Nothing in this round's diff touches that file's
cost -- the diff is two fixtures and a docs read -- so the reading had to be checked
before it was believed.

**The same test, twice.** Run alone, the slowest test of that file takes **214 ms**. Run
inside the full suite on four cores it takes **1 820 ms**: 8.5x for identical work, and
the work is one child process per test. Two more files were named by the next full run
-- `docs-guards-need-history.test.ts` at 1 487 ms against **55 ms** alone (**27x**),
`fault-extraction-scripts.test.ts` at 1 038 ms against **202 ms** (**5x**) -- and the
run after that named neither. Same tree, same floor, different verdicts: what moved was
what else was running.

| file | alone | under four workers | ratio | declares a budget |
| --- | --- | --- | --- | --- |
| `docs-guards-need-history.test.ts` | **55 ms** | **1 487 ms** | 27x | no -> **30 000 ms** |
| `fault-extraction-scripts.test.ts` | **202 ms** | **1 038 ms** | 5.1x | no -> **30 000 ms** |
| `gen-examples.test.ts` | **214 ms** | **1 820 ms** | 8.5x | no -> **30 000 ms** |

**The repair is a declaration, not a lower floor.** A file at 55 ms of real work cannot
approach the default the floor protects, and a floor low enough to stay quiet on a busy
box would miss the file the floor was built for. So each of the three states the estate's
tightest declaration -- `30 000 ms`, as `check-cli-reference.test.ts` and
`build-example-bundle.test.ts` do -- with both readings in the comment beside it, so the
next reader can tell a spent allowance from a real ceiling. The gate's own header now
carries the amplification it was measuring against (3.1x for in-process work) next to the
numbers for work that spawns, which is the population the floor kept naming.

**What this round learned about the instrument.** The floor is correct and its verdict is
a function of the machine, in the direction of a false red rather than a false green --
the safe direction, and the one that produces a declaration every time instead of an
excuse. `39 -> 41` files state a budget across the round.

### Five · the workflow's own step 13, and the number a local read cannot print

The dispatch the Open list has been asking for since v3.95 landed while this round was being written.
Run **`43776772029`**, dispatched on `56b9bbc` -- the commit that carries finding 545 -- reached step 13 at
`02:40:14` and finished it at `02:43:51`, so the step has **3 m 37 s** inside a job that had already spent
the fetch and a 2.5-hour round trip. Its own line:

```
check-aggregate-tables: OK (25 case(s) reproduced, 83742 cell(s) reduced from logs.csv and equal to the
corpus's own logts.csv; 4073602 row(s) counted by their own cluster id, 721 of them under a masked
template, 575 named no cluster, 0 named two different clusters; 246 case(s) bounded, not reproduced: the
marginals of logts.csv hold no more log cell(s) than logs.csv has rows for that container, 270445
(container, bucket) pair(s), 0 spare row(s) at the tightest over 35462054 published cell(s) against
40008239 log row(s))
```

**Every number in it is the local one** -- 25 / 246 / 0, 83 742 cells, 270 445 pairs, 35 462 054 against
40 008 239 -- and the sentence is worth a round of its own for the two things it settles. The 63 441
refusal lines finding 545 repaired printed as **zero** there, on the runner, which is what a local read
cannot say; and the step finished **2.5x** slower than the same script locally on a four-CPU quota, which
is the reading the plan needed to know that 3 m 37 s sits inside the job's own budget rather than beside
it. The off-grid refusal of finding 547 is not in this run -- the commit predates it -- and it does not
change the line, because it refuses nothing on this corpus.

### Readings

> Ledger for `v3.97`.

| item | value |
| --- | --- |
| `core` test suite | **252 files, 6405 tests passed** (at v3.97) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.97) |
| repo test suite | **256 files, 6592 tests passed** (at v3.97) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** -- unchanged: the change is in `scripts/` and the two new tests drive a script |
| new tests | **6403 -> 6405, +2**: the off-grid table refused, and the table one window away still compared |
| the off-grid measurement | **0 of 26 116** published rows across the 271 directories are off the 15-second grid, which is what makes the refusal safe rather than loud |
| the corpus | **unchanged**: 25 reproduced (83 742 cells), 246 bounded (270 445 pairs, 0 spare row at the tightest), 0 refused, 2 m 22 s |
| gate sites | **141** across **65 of 92** scripts: no new site, because a refusal is a `return` and the gate's one exit already carries the verdict |
| the battery | **226** claim(s) across **64** file(s): unchanged |
| budget declarations | **38 -> 41** files, from CI's own reading of a file the floor named and a second reading of the same test alone (1 820 against 214 ms, 8.5x) -- the declarations are what stop a busy box from deciding those files' verdicts |
| list | **28 -> 26**: two closed -- the grid entry by the refusal it asked for, and the workflow entry by the dispatch whose step 13 came back green with this round's census |
| LLM calls | **0** |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| ~~P1~~ | ~~The workflow that found the bucketing defect has not run since the repair~~ | **closed**: run `43776772029` finished step 13 green in 3 m 37 s with 25 / 246 / 0 and 0 spare row(s) at the tightest | next is P2 |
| P2 | The ceiling of 8 has never been measured where it is not oversubscription | unchanged: every reading is on a 4-CPU cgroup quota, where 8 is 2x | one full-suite run on nine or more usable CPUs |
| P2 | How close a *failing* run comes to its ceiling | unchanged | a per-test reading from a run whose product is a failure |
| P2 | A record's terms are a map of strings to numbers | unchanged | a second target reading another target's key |
| P3 | The tree's comments are English but nothing reads them | unchanged | a reader for comment bodies, with the three shapes that defeat a line scan as fixtures |

**The lesson.** The grid was in the code twice and checked once: the log side floors, the published side
does not, and the gate compared the results. What made it invisible is that a mismatch of *origins* looks
exactly like a mismatch of *numbers* -- both print "publishes N cells, holds 0 rows" -- so the only way to
tell them apart is to ask which question was asked. A rule that reads one side of a comparison in a unit
it never verifies on the other side is the general shape, and the fix is a check on the unit rather than a
better sentence about the numbers.

## v3.98 · the comments were English and nothing read them, and a line scan would have read text as prose

The Open list has carried this since v3.96, when the document reader was written and the note beside it said
what it did not cover: `src/`, `scripts/` and the 246 test files were held to English by the reviewer and by
nothing else. The ask was one line -- *a reader for comment bodies, with the three shapes above as fixtures*
-- and the parenthesis is the round: a comment is not a line that starts with `//`, it is a region, and the
four ways a reader gets the region wrong all print a sentence about a subject that is not there.

### One · what a line scan would have said, measured on this tree

The obvious reader is a line that begins with `//` or `/*`. It is right about 23 671 of this tree's 23 768
comments and wrong about the rest, and the wrong ones are not exotic: **331 comment openers sit inside a
string, a template literal or a regex**, across **90 of the 462 files**. The largest single file is
`scripts/site-proofs.mjs`, which builds a page by concatenating JavaScript source into string literals -- 44
of those openers. A line scan would read the generated script's comments as this file's comments, and they
*are* comments: the sentence would be true and about another file.

Two of the four shapes were turned into the gate with the scanner's state removed, and both print the defect
this round exists to prevent. With string state removed, a fixture holding `'https://<ten Han characters>…'`
is refused:

```
src/a.ts:1: `本段说明只记录实测值` -- 10 Han character(s) of prose: this repository's comments are
written in English, and the comments that are not are quotations, which a code span carries verbatim
```

That is a sentence about a URL. With regex state removed, a fixture holding `/x\/*/` and one real comment
after it reads the pattern's `/*` as an opener, walks to the end of the file, and reports:

```
check-comments-language: FAILED — 1 file(s), 0 comment(s) (0 line, 0 block), 0 run(s) of Han prose
outside a code span; 0 comment opener(s) skipped inside a string, a template or a regex; first:
src/a.ts:1: opens a block comment that never closes, …
```

**Zero comments read, zero runs found, and a refusal** -- which is the shape this log has recorded since
finding 528: the census is right about what it read and silent about what it could not. The exit code is the
same and the reason is not, and a file whose block *does* close would have passed with its comment unread.

### Two · the four shapes, and the fixture that fails without each

| shape | what a reader without state does | fixture | without it |
| --- | --- | --- | --- |
| a `//` inside a string | reads the URL's authority as prose | `'https://…'` with ten Han characters | refused as prose |
| a `/*` inside a regex | opens a block that never closes | `/x\/*/` then a real comment | 0 comments, refusal at a file that is fine |
| a template literal | loses the text *and* the code in `${}` | a query with `//`, and a comment inside the interpolation | refused as prose, or the interpolation missed |
| a shebang | offers the interpreter path's `/` to the regex branch | `#!/usr/bin/env node` then a comment | nothing observable -- see §Four |

The first three were verified the same way: the state was removed from the scanner, the fixture's test was
run, and it failed; the state was restored and it passed. The fourth is the honest one in the table, because
removing it changes no output on any fixture or file in this tree, and the reason is written down rather than
implied: `#!` is consumed before the loop so that the interpreter's path is never offered to the regex
branch, and whether that matters depends on a shebang nobody here has written yet.

### Three · the measurement, and the witness that the scanner distinguished

```
check-comments-language: OK — 462 file(s), 23768 comment(s) (19838 line, 3930 block), 0 run(s) of Han
prose outside a code span; 331 comment opener(s) skipped inside a string, a template or a regex
```

**That second clause is the instrument's witness**, and it is in the summary for the reason finding 547's 0
of 26 116 was written into a refusal: a reader that stopped telling a string from a comment would still
report zero violations -- on a tree that had fewer comments than it has -- and the number that moves when it
breaks is this one. It is also the number that says the round measured rather than assumed: 331 openers,
none of them read as prose.

**The agreement test.** A predicate that knows nothing about strings -- *every line whose first characters
are `//` must be recorded as a comment on that line* -- is a different instrument, so their agreement over
the whole tree is evidence rather than a tautology: **19 741** line openers and **3 930** block openers,
**0** lost. The predicate has exactly two shapes that would make it wrong rather than the scanner, a template
whose line begins `//` and a line inside a block that begins `//`, both stated in the test with the repair
each would need (a named exemption), because deleting the assertion is the one repair that would hide a
scanner that stopped recording what it read.

The six files in this tree that carry Han characters are all citations -- a Chinese file name in a code span,
a quoted query, a quoted table cell -- and the rule that says so is *imported* from the document reader
rather than restated: one threshold, one code-span rule, two subjects. A second copy would be the
third-source defect `validity.test.ts` names, and no test could catch it.

### Four · what this reader does not read

**The workflow files.** A `#` in YAML is three grammars (plain, single-quoted, double-quoted) plus block
scalars that hold shell, so reading one correctly needs the YAML scanner rather than this one. Measured
before deciding: five files hold **1 172** `#` marks, and **none** of them carries Han characters. The reader
for them is the next instrument, and the entry below is what it is for.

**A run broken by a line break.** Each line of a comment is judged on its own, which is what the document
reader does, so a comment wrapped mid-run in a narrow column evades both. One boundary shared by two readers
rather than two boundaries, stated here so the next person does not have to find it.

### Five · what the gate is worth

One more exit and two more scripts -- the verdict and the scanner behind it, the second of which has no exit
at all. `derive-gate-sites` re-derives to **142 failure sites across 66 of 94 scripts**, and the battery moves
to **227 claims across 65 files** because a claim is a site credited to the proving test file, and the new
site has one. `docs:check` is twenty steps.

Eighteen tests: fourteen drive the gate over a throwaway tree and four read the real one, and the four
falsifications in §Two are the reason the fixtures are not decoration. The census cannot collapse silently --
`files > 400`, `comments > 20 000`, `markers > 100` are floors taken below this round's readings, so a reader
that stopped walking half the tree fails a test rather than publishing a smaller number as a pass.

### Readings

> Ledger for `v3.98`.

| item | value |
| --- | --- |
| `core` test suite | **253 files, 6423 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **257 files, 6610 tests passed** (as of this commit) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** -- unchanged: the new code is two files under `scripts/`, which the four dimensions do not measure |
| new tests | **6405 -> 6423, +18**: fourteen fixtures through the gate, four over the reading and the real tree |
| the comments read | **462 file(s), 23 768 comment(s) (19 838 line, 3 930 block), 0 run(s) of Han prose**; **331** comment openers skipped inside a string, a template or a regex, in **90** files |
| the agreement reading | **19 741** line openers and **3 930** block openers, **0** lost against a predicate that knows nothing about strings |
| the exclusion readings | three of the four shapes falsified by removing the state and watching the fixture fail; the shebang recorded as unobservable |
| gate sites | **142 / 66 of 94 scripts** (was 141 / 65 of 92); the call tally **160** |
| the battery | **227 claims across 65 files** (was 226 / 64) |
| `docs:check` | **19 -> 20 steps** |
| list | **26 -> 26**: the comment entry closed, the workflow reader opened, unchanged in number and not in content |

### What is left, in the order it has to happen

| priority | item | state | next |
| --- | --- | --- | --- |
| P2 | the ceiling of 8 workers has never been measured where it is not oversubscription | unchanged: every reading is on a four-CPU quota, so 8 is 2x | one full run on a box with nine or more available CPUs |
| P2 | how close a **failing** run comes to its ceiling | unchanged | one run whose artefact is a failure, read per test |
| P2 | a record's `terms` is a map, so nothing can say which keys a rule writes | unchanged: priced at v3.94, waiting on its trigger -- a second target reading a key another writes, or a `?? 0` in a sum whose 0 is a wrong answer | the trigger, or nothing |
| P3 | the workflow files' `#` comments are read by nothing | **new**: five files, 1 172 `#` marks, 0 Han characters; reading one needs the YAML scanner | three fixtures -- a `#` in a quoted scalar, a `#` inside a `run: |` block, and a block scalar that contains a quote |
| P3 | a run broken by a line break evades both language readers | **new**: a boundary, not a defect, measured by neither reader | decide whether a paragraph is a unit, which changes the document reader too |

**Where this leaves the campaign.** The language axis is done for the files this tree writes in JavaScript and
TypeScript, with the two boundaries above stated rather than hidden. The three P2 items all wait on something
outside this sandbox — a machine with nine CPUs, a run that fails, a second score target — and the P3 items
are instruments whose subjects are strings inside another grammar. Nothing in the round changed a published
figure: the corpus read, the coverage, and the battery's per-claim witness are where v3.97 left them.
