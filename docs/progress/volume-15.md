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
| `core` test suite | **249 files, 6338 tests passed** (at v3.89) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.89) |
| repo test suite | **253 files, 6525 tests passed** (at v3.89) |
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

