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
| `core` test suite | **253 files, 6423 tests passed** (at v3.98) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.98) |
| repo test suite | **257 files, 6610 tests passed** (at v3.98) |
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

## v3.99 · a `#` in YAML is four grammars, and twelve of the tree's own comments were read as content

The Open list got this entry one round ago, written by the reader that could not read it: *the workflow files'
`#` comments are read by nothing*, with three fixtures named and a measurement beside them -- five files, 1 172
`#` marks, none of them carrying a Han character. The entry was right about the count and wrong about the
grammar: there are four, and the fourth is where most of the marks live.

### One · what the parenthesis got right, and the number it counted

The count was a line count and the rule needed a character count. Measured this round: **1 215** `#`
characters across **1 172** rows, of which **1 167** rows begin with one. The five that do not are the whole of
the tree's in-row marks, and each is worth naming because each is a shape a reader gets wrong:

```
fault-extraction-accuracy.yml:202   echo "provider=${PROVIDER} has a key present (${#selected} characters…"
fault-extraction-accuracy.yml:231   echo "### Fault extraction accuracy"
official-data.yml:270               echo "### Fetch outcome"
official-data.yml:454               echo "### No pin report" >> "$GITHUB_STEP_SUMMARY"
official-data.yml:460               echo "### Measured pins"
```

All five are inside a `run: |` block, all five are inside a double-quoted shell string, and none of them is a
comment. Three quoted scalars reach the top level at all: `default: ''` and two `cron:` schedules. That is the
measurement that made the rule safe to write -- a tree where the only in-row `#` is shell text is a tree where
a reader that confuses the two prints a sentence nobody can act on.

### Two · six falsifications, and the fixture that had to be thrown away

The scanner's state was removed one piece at a time and the fixture that holds that piece was watched. Every
run restored the file afterwards, and `cmp` against the saved copy is what says so.

| removed | what it is for | tests that went red |
| --- | --- | --- |
| quote state | a `#` inside a quoted scalar is text | **4** -- the quoted-scalar fixture, the `''` escape, the unterminated-scalar refusal, the four-bucket census |
| block state | a `run: |` row is content, not YAML | **5** -- the English fixture's own count, the quote inside a block, the census, the real tree, the row predicate |
| the row's own indentation | `body.slice(lead)` became `body.slice(block.indent)` | **3** -- the deeper-comment fixture, the real tree, the row predicate |
| the block's end | a block never ends at a less-indented row | **2** -- the end fixture, the census |
| the doubled quote | `''` no longer closes and reopens | **1** -- the single-quote fixture |
| the token boundary | every quote opens a scalar | **3** -- see below |

**The sixth one is the round's honest failure.** It was written as a fixture holding `'"'"'` -- the real shape
`anchor-roundtrip.yml` uses to carry an apostrophe through a single-quoted shell string -- and the claim beside
it was that a reader which opened a scalar at every quote would never close it and would lose the comment on
the next row. With `opensScalar` made unconditional, that fixture **passed**. The fixture sat inside a
`run: |` block, so the block branch had already taken the row and the quote logic never ran: the test was
asserting something about a path it could not reach, which is the shape this log keeps finding in gates.

It was replaced rather than patched. The new fixture is a plain scalar with an apostrophe glued to a word --
`- name: the runner's cache  # …`, taken from `anchor-roundtrip.yml`'s `Build (the round trip reads core's
dist)` -- and it is the row a reader without the token boundary swallows. It goes red under the mutation, and
it is the row that makes the real tree go red too, because `core's` appears in prose the scanner would
otherwise read as the start of a string.

### Three · the census found a bug in the reader that wrote it

Two readings are taken over every file. The first is per character: every `#` is classified into exactly one
of four buckets -- it opened a comment, it sat inside a quoted scalar, it sat in a block scalar's row, or it was
glued to a word -- and the four counts must sum to the number of `#` characters in the file. The second is per
row: **every row whose first non-blank character is a `#` must be recorded as a comment on that row**, so the
number of such rows and the number of comments have to agree.

The first run of the finished scanner reported `1 155 comment(s) (979 line, 176 block)` and **25** marks in
block rows. There are 13 such marks in the tree. The difference was twelve comments -- seven in
`official-data.yml` at rows 308 to 314, five at rows 467 to 471 -- sitting inside a `run: |` block, indented
**deeper** than the block's first row, and counted as content because the reader measured the `#` from the
block's column rather than the row's:

```
      # No cause is named here on purpose. Every status the script documents
```

That is a comment. It is one of the twelve the first run reported as `25 inside a block scalar's own row`, and
the gate was green over it -- the file is English, so nothing was violated, and the reading that would have
noticed a Chinese comment in that position was the reading that was broken. The repair is one column, and the
row predicate above is what found it: with the fix the two readings agree at **1 167** comments and **13**
marks, and the numbers add up for the first time.

The summary after the repair:

```
check-workflow-language: OK — 6 file(s), 1215 '#' mark(s): 1167 comment(s) (979 line, 188 block scalar),
0 inside a quoted scalar, 13 inside a block scalar's own row, 0 glued to a word; 0 run(s) of Han prose
```

### Four · what this reader does not read

**A `#` in the middle of a block scalar's row.** It could be a shell comment (`echo hi  # why`) or a `#` inside
a shell string (`echo "a # b"`), and telling those apart needs to know which language the block holds, which
YAML does not record. The row-leading `#` is the one shape that is a comment in shell, in Python, in Ruby and
in make alike, so that is the shape this reader takes -- and the 13 marks it declines are exactly the five rows
above plus their duplicates.

**A `"` inside a plain scalar opens a flow scalar.** `say "hi"` is legal YAML and the approximation enters the
quote rather than ignoring it. The cost is a `#` between two such quotes counted as text; the direction is
chosen because the other one -- reading a quotation as prose -- makes a gate red on a file that is fine.

**An explicit indentation indicator is measured from the header row.** `|2` means two columns past the parent
node, and the parent is taken to be the row the header sits on. Exact for a mapping key and for a sequence
item, which is what these six files contain.

**A header whose `|` is followed by a comment.** `run: |  # why` is read, and the comment is YAML's; a `|` in
the middle of a scalar is a character, which is why the header pattern requires the indicator to end the row.

### Five · what the gate is worth

One more exit and two more scripts, and `derive-gate-sites` re-derives to **143 failure sites across 67 of 96
scripts**. The battery moves to **228 claims across 66 files** because a claim is a site credited to the
proving test file, and `docs:check` is **twenty-one steps**.

Twenty-three tests: nineteen drive the gate over a throwaway tree and four read the real one. The floors are
taken below this round's readings -- `files` is exactly six (the tree has six YAML files and the lock file is
excluded by name), `comments > 1 000`, `marks > 1 200` -- so a reader that stopped walking fails a test rather
than publishing a smaller number as a pass. The row predicate is the second instrument, and §Three is what it
bought.

### Six · the step before the push, where the machine measured again

`verify-local` went red at step 8. `check-test-budgets` named
`gate-test-battery-attribution.test.ts`: its slowest test takes **1 040 ms** and the file states no budget,
so vitest's 5 000 ms default decides its verdict. Run alone, that test takes **149 ms** -- seven times
less, inside the 5x-to-27x population finding 538 recorded when this gate first ran, and the same lesson
that round paid for: **the gate measures the box**.

The repair has one shape and this round did not invent a second. A budget is declared on the suite, both
readings go into the comment beside it (**149 ms** alone, **1 040 ms** under four workers), and the floor
stays at 1 000 ms -- a floor set under the box's worst day is a threshold nobody can fail, which is the
defect the floor exists to avoid rather than to create. Declared files move **43 -> 44**, and the file
closest to its own budget is `typecheck-entrypoint.test.ts` at 32% of 30 000 ms.

What makes this worth a section rather than a line: the round had already run the suite green twice, and
the reading that failed is not about this round's code at all. It is finding 538's shape one round on --
a threshold whose subject is a machine, reported against a file that has nothing wrong with it.

### Readings

> Ledger for `v3.99`.

| item | value |
| --- | --- |
| `core` test suite | **254 files, 6446 tests passed** (at v3.99) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.99) |
| repo test suite | **258 files, 6633 tests passed** (at v3.99) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** -- unchanged: the new code is two files under `scripts/`, which the four dimensions do not measure |
| new tests | **6423 -> 6446, +23**: nineteen fixtures through the gate, four over the reading and the real tree |
| the workflow comments | **6 file(s), 1 215 `#` mark(s), 1 167 comment(s) (979 line, 188 block scalar), 0 run(s) of Han prose**; **13** marks inside a block scalar's row, **0** inside a quoted scalar, **0** glued to a word |
| the census, before the repair | **1 155** comments and **25** block-row marks, i.e. twelve comments counted as content -- rows 308-314 and 467-471 of `official-data.yml` |
| the row predicate | **1 167** rows begin with a `#`, **1 167** comments read, **0** lost |
| the falsifications | six removals, six red fixtures; the first attempt at the sixth proved nothing and was replaced |
| the push | **run 43822783339, 8 of 8 job(s) green in 12 m 30 s**, first attempt |
| budget declarations | **43 -> 44**: one file named at 1 040 ms under four workers and 149 ms alone; the floor stays at 1 000 ms |
| the YAML measurement | **1 172** rows carry a `#`; **1 215** `#` characters; five in-row marks, all shell strings inside `run: |` |
| gate sites | **143 / 67 of 96 scripts** (was 142 / 66 of 94); the call tally **161** |
| the battery | **228 claims across 66 files** (was 227 / 65) |
| `docs:check` | **20 -> 21 steps** |
| list | **26 -> 26**: the workflow entry closed, the paragraph-boundary entry left open |

### What is left, in the order it has to happen

| priority | item | state | next |
| --- | --- | --- | --- |
| P2 | the ceiling of 8 workers has never been measured where it is not oversubscription | unchanged: every reading is on a four-CPU quota, so 8 is 2x | one full run on a box with nine or more available CPUs |
| P2 | how close a **failing** run comes to its ceiling | unchanged | one run whose artefact is a failure, read per test |
| P2 | a record's `terms` is a map, so nothing can say which keys a rule writes | unchanged: priced at v3.94, waiting on its trigger | the trigger, or nothing |
| P3 | a run broken by a line break evades all three language readers | **unchanged and now wider**: the third reader has the same boundary, and a YAML comment wrapped in a narrow column is the same case | decide whether a paragraph is a unit, which changes three readers at once |
| P3 | an in-row `#` inside a block scalar is read by nothing | **new**: 13 marks, all shell strings, and telling one from a shell comment needs the block's language | nothing until a block holds a language whose comments are not row-leading |

**Where this leaves the campaign.** The language axis now covers every surface in this repository that carries
prose: the documents, the code, and the five workflow files whose comments are the record of why each step
exists. The three P2 items still wait on something outside this sandbox, and the two P3 items are boundaries
rather than defects -- both stated in the readers' headers, both with the repair each would need. The corpus
figure, the coverage table and the battery's per-claim witness are where v3.98 left them.

## v3.100 · the unit is the paragraph, and two of the walls turn out to be one wall

The Open list has carried this one since v3.98 in the words of the reader that could not cross it: *a run broken
by a line break still evades all three language readers*. Three readers judged a row at a time, so a comment
wrapped in a narrow column, a Chinese paragraph hard-wrapped at eighty characters, and a `#` comment continued on
the next row were all one sentence to their author and two citations to the rule. The entry said the cost was a
decision rather than a line of code -- what a *paragraph* is -- so the decision comes first and the code is what
is left of it.

### One · measured before the rule was written

The first question is not what a paragraph is but whether this tree has any: a widening that changes the verdict
on the real tree would need a decision about each instance. Measured twice.

The first pass walked all three surfaces and stripped each row the way the readers strip it -- code spans
removed, block quotes and fences skipped -- and counted row breaks whose left character and right character are
both Han. **Zero.** The second pass asked the same question of the raw bytes, with no stripping at all, in case
the material was hiding inside a citation: **zero again**, and the longest run that could have been built across
any break in the tree is zero characters. Every Han character in this repository is a short citation inside
backticks, and not one of them is wrapped.

So the rule costs nothing today, and that is worth writing down rather than around: **the whole proof of this
round is in the fixtures**, because the tree cannot carry it. What the tree carries is the other number -- the
breaks the rule was *allowed* to cross and did not need to:

```
check-docs-language: OK — 48 document(s), 0 run(s) of Han prose outside a quotation,
37537 row break(s) held inside a paragraph

check-comments-language: OK — 465 file(s), 23924 comment(s) (19957 line, 3967 block),
0 run(s) of Han prose outside a code span; 30389 row break(s) held inside a paragraph,
350 comment opener(s) skipped inside a string, a template or a regex

check-workflow-language: OK — 6 file(s), 1215 '#' mark(s): 1167 comment(s) (979 line, 188 block scalar),
0 inside a quoted scalar, 13 inside a block scalar's own row, 0 glued to a word;
0 run(s) of Han prose, 808 row break(s) held inside a paragraph
```

68 891 breaks held, **0** of them between two Han characters. The count is reported because a grouper that
flushed at every row would find the same runs and cross nothing, which reads exactly like a tree with nothing to
cross -- so each of the three readers carries a floor under it, and three mutations below take it to zero.

### Two · the decision, and why the join inserts nothing

A paragraph is what the surface says it is, because the surface is the only thing that knows:

| surface | a paragraph is | what ends it |
| --- | --- | --- |
| documents | consecutive prose rows | a blank row, a heading, a fence and its contents, a block quote |
| one comment | its own rows | a blank row -- which in a doc block is a row carrying nothing but its ` *` |
| a file's comments | `//` rows on consecutive rows, in the same column | a gap, a different delimiter, a different column |
| workflow comments | `#` rows on consecutive rows, in the same column | the same three |

And the join between two rows of a paragraph inserts **nothing**. That is not an approximation of "a break
between two Han characters is not a break" -- it *is* it: a run of eight Han characters needs Han on both sides
of every break it crosses, so a break with anything else on either side cannot be crossed by either formulation.
The header states the argument and `check-comments-language.test.ts` states it as an experiment: 400 sequences of
one to six rows drawn from Han runs and Latin fragments by a seeded LCG, the runs this reader finds compared
against a reference that decides each break on its own and inserts a separator everywhere it is not between two
Han characters. Same runs, all 400, and the test asserts that **at least 50** of the runs it compared actually
crossed a break -- a property that never met the case it is about would pass while saying nothing.

### Three · three defects, and each was found by the fixture for the rule beside it

**The space after `//`.** The first version of the join put the doc block's case and the line comment's case in
one function and they are not the same: a doc block's decoration (` * `) is stripped whole, so its rows join
cleanly, and a `//` comment's text keeps the space after the delimiter, so `// 文档说明` and `// 第二行` join as
`说明 第二行` -- one space in the middle of the break, and the rule never fires in a line comment at all. The
fixture went red and named it, and the repair is the general one: both ends of every row are trimmed, because
layout is not text. The same trim is what a hard break written as two trailing spaces and a CRLF file's carriage
return needed, and both now have a fixture.

**`kind` means two different things in the two scanners.** The shared grouper first asked "are these two the same
kind of comment", which is a wall for the source scanner (a `//` row does not continue a doc block: the
terminator that ended the block is between them) and nonsense for the workflow scanner, where `kind` records
*where the `#` was found* rather than what it is. The block-scalar fixture went red and said so: two `#` rows in
a `run: |`, adjacent, one paragraph to their author, refused. The repair is a field with one meaning -- the
comment's **family**: its delimiter and the column it opens at, stated by the scanner that can see both. A `//`
row continues the `//` row above it, does not continue a doc block, and does not continue a row at another
indentation; the workflow scanner says `#` and the column, so a `#` row inside a block scalar continues the `#`
row under it and cannot continue a `#` row at column zero that happened to end the block.

**The spread the guard refused.** `hits.push(...scanParagraph(part))` passed through the whole suite until
`spread-append-guard` named it: the argument count is a function of the paragraph's length, and a paragraph is a
function of the input. Four sites, all now `for` loops. The guard is a previous round's instrument doing its job
on this round's code, which is the cheapest kind of review there is.

### Four · twelve falsifications, one of which proved nothing

Each piece of the new state was removed and the fixtures that hold it were watched. Every run restored the files
afterwards; `cmp` against the saved copies is what says so.

| removed | what it is for | tests that went red |
| --- | --- | --- |
| the join (`''` became `'\n'`) | a run crosses a row break | **9** -- four document fixtures, four comment fixtures, the property |
| the left-hand trim | `// ` leaves a space in the middle of a break | **4** |
| the whole trim | CRLF and the `//` space together | **4** |
| the blank row's flush | a blank row ends a markdown paragraph | **2** |
| a heading being its own paragraph | nothing continues a heading | **1** |
| the block quote's flush | prose does not continue across a quote | **1** |
| the fence's flush | nor across a fence | **1** |
| joining two comments at all | two line comments are one paragraph | **6** |
| the family test | a terminator, a gap and a column are walls | **6** |
| the blank row inside a block comment | its ` *` row ends the paragraph | **1** |
| the source family's column | a wrap does not move | **3** |
| the workflow family's column | nor inside a block scalar | **1** |

**The block quote's flush came back green at first, and the fixture was wrong, not the code.** It read

```
${HAN(4)}
> quoted

Back to English.
```

and the blank row between the quote and the row after it ended the paragraph by another rule, so the flush under
test was unreachable -- the same shape as v3.99's sixth falsification: an assertion about a path it cannot take.
The fixture is now two prose rows with the quote between them and no blank row anywhere, and the mutation goes
red. While rebuilding it, one more thing surfaced: a heading was being *pushed into* the paragraph and flushed
afterwards, which let it join backwards -- not a run this tree can produce, because `## ` is not Han, so the
markers are their own wall, but the `pairs` count was carrying a break no run could ever cross. A heading is now
judged as a paragraph of one, and the witness counts only breaks that can be crossed.

### Five · what this still does not read

**A hard break written as a trailing backslash.** `行末的\` and the row after it are one paragraph to CommonMark
and two to this reader, because the backslash sits between the two characters. Trimming it would be a markdown
rule applied to comments as well, and the two-space form -- the one an editor inserts -- is handled. The cost is
stated rather than paid.

**A code span or a fence broken across rows.** Both are stripped per row, so a span that opens on one row and
closes on the next leaves its contents in "prose". The direction is a false positive rather than a silence, and a
broken span is itself a defect worth a red gate.

**The two P3 and three P2 items are where v3.99 left them**, with one change: the language axis no longer has a
shared boundary to argue about, so the remaining paragraph question is per-surface rather than one decision in
three readers. The list stays at 27 -- the paragraph entry closes and the backslash entry opens, which is the
arithmetic a list of boundaries has.

### Readings

> Ledger for `v3.100`.

| item | value |
| --- | --- |
| `core` test suite | **254 files, 6468 tests passed** (at v3.100) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.100) |
| repo test suite | **258 files, 6655 tests passed** (at v3.100) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** -- unchanged: the new code is in `scripts/`, which the four dimensions do not measure |
| new tests | **6446 -> 6468, +22**: five document fixtures, ten comment fixtures and the property, seven workflow fixtures |
| the measurement before the rule | **0** row breaks between two Han characters, stripped and raw, across all three surfaces; longest crossing run **0** |
| the breaks held | **37 694** documents, **30 389** comments, **808** workflow, **68 891** total, of which **0** fall between two Han characters |
| the comment census | 465 files, **23 924** comments (19 957 line, 3 967 block), **350** openers skipped |
| the property | 400 seeded sequences, one to six rows, **>= 50** crossing runs compared, same runs as the pairwise reader |
| the falsifications | twelve removals, twelve red; the block quote's fixture had to be rebuilt before its mutation could be observed |
| gate sites | **143 / 67 of 96 scripts**, call tally **161** -- unchanged: no new gate |
| the battery | **228 claims across 66 files** -- unchanged |
| `docs:check` | **21 steps** -- unchanged |
| list | **27 -> 27**: the paragraph entry closed, the trailing-backslash entry opened |

### What is left, in the order it has to happen

| priority | item | state | next |
| --- | --- | --- | --- |
| P2 | the ceiling of 8 workers has never been measured where it is not oversubscription | unchanged: every reading is on a four-CPU quota, so 8 is 2x | one full run on a box with nine or more available CPUs |
| P2 | how close a **failing** run comes to its ceiling | unchanged | one run whose artefact is a failure, read per test |
| P2 | a record's `terms` is a map, so nothing can say which keys a rule writes | unchanged: priced at v3.94, waiting on its trigger | the trigger, or nothing |
| P3 | an in-row `#` inside a block scalar is read by nothing | unchanged: 13 marks, all shell strings | nothing until a block holds a language whose comments are not row-leading |
| P3 | a hard break written as a trailing backslash | **new**: one paragraph to CommonMark, two to this reader | decide whether the backslash is punctuation or text, in one place |

**Where this leaves the campaign.** The language axis now reads the same unit on three surfaces: what a paragraph
is, decided where the surface is legible, and one rule about what a break does to a run. The three P2 items still
wait on something outside this sandbox. The two P3 items are boundaries with a stated cost each -- one about a
language YAML does not name, one about a markdown rule that would have to be applied to comments as well. The
corpus figure, the coverage table and the battery's per-claim witness are where v3.99 left them.

## v3.101 · a deletion is either a hole or a marker, and the two surfaces disagree about which

The Open list carried one decision and three readers: *decide whether a trailing backslash is punctuation or text --
one decision, three readers, and a fixture on each side*. The answer is that it is both, and which one depends on
whether a renderer stands between the bytes and the reader. That is one decision more than the entry priced, and
the extra one is the finding.

The same round carried a second question with the same shape, found while measuring the first: a code span is
deleted outright, and deleting text that is not text lets the two words on its sides touch. Both defects are about
what a removal leaves behind -- nothing, because a marker occupies no position, or a hole, because a quotation is
not a word.

### One · the marker, measured before the rule

Markdown has two spellings for a break that does not end a paragraph. The two-space form was already handled, and by
accident: every row is trimmed at both ends, so the spaces were gone before anything was joined. The backslash form
was joined as `…\…`, and a backslash between two rows is a character no run crosses.

Measured on the tree before the rule: **one** row ends in a backslash, at `docs/progress/volume-10.md:1098`, and it
is not a marker -- it is a fragment left behind by removing a code span from the middle of the row, which is the
second defect below. **Zero** rows are a hard break. So the rule costs nothing today and its whole proof is in the
fixtures, the same conclusion v3.100 reached for the paragraph and for the same reason: a tree written in English
cannot carry a rule about breaks inside Chinese prose.

That fragment is also where the two repairs of this round meet, and it is why the order of two operations is part of
the rule rather than an implementation detail. With the gap the second repair leaves, the byte after the fragment is
a space, so the marker pattern -- looked for before the trim -- does not match and the row keeps a backslash that is
text. Without the gap the fragment is the row's last byte, the byte before it is `)`, and the same pattern would
consume it as punctuation. Both halves are asserted, in a fixture each.

### Two · one decision per surface, which is one more than the entry asked for

The entry assumed one answer for three readers. There are two answers, and the split is at the renderer.

- **The document surface.** A trailing backslash is punctuation. The renderer consumes it and breaks the line, so
  the two rows join with nothing between them and a run crosses -- which is what the two-space spelling already did.
  The rule lives in a `markdownRowOf` that only `proseReport` calls.
- **The comment surfaces.** A trailing backslash is text. JavaScript, shell and YAML have no renderer between the
  bytes and the reader, so `// …\` ends in a backslash and that backslash stands between the two rows exactly as
  any other character does. `textRowOf` is what both comment readers call and it does not know the marker exists.

The two readers therefore disagree about identical bytes, on purpose, and each has a fixture in the direction that
costs something: the markdown one must go red without the rule, and the two comment ones must go red *with* it.

### Three · how narrow the marker is, and why trimming first would invent one

Exactly one backslash, and not itself escaped. The three conditions are asserted as a table rather than described,
because a rule about a run length is a rule with four cases and a prose paragraph about it is a rule with one:

| trailing run | what it renders as | the two rows |
| --- | --- | --- |
| `\` | a break, marker consumed | joined |
| `\\` | one literal backslash | held apart |
| `\\\` | a break and one literal backslash | held apart |
| `\\\\` | two literal backslashes | held apart |
| `\` + one space | a backslash and a space | held apart |

The last row is the one that fixes the order of operations: the marker is looked for **before** the row is trimmed,
because trimming first turns `\ ` into `\` and reads a break nobody wrote. Every approximation in these readers is
chosen towards a break rather than across one, and this is that principle applied to a question about order rather
than about membership.

A backslash anywhere else in a row needs no rule, and that is an argument rather than an omission. An escape removes
one backslash and leaves the character it escaped: `\*` renders as `*`, and `*` stands between two Han runs exactly
as `\*` did. Only a row's last backslash has nothing after it, so only that one is a question about punctuation.

### Four · the defect the marker's only instance pointed at

The one row that ends in a backslash is a fragment: `withoutCodeSpans` deletes a code span, and in
`docs/progress/volume-10.md:1098` the span ended mid-row leaving a stray backslash at the end. Chasing why it was
there turned up the reader's second fabricated join.

`withoutCodeSpans` deleted a span and returned what was left. That is what its name says, and it was right until
the span stopped being at the edge of a row: four Han characters, a citation, four more is two citations, and
deleting the citation outright left eight characters in succession, which the search read as one run of prose.
Nothing in that row is written in Chinese; the join was invented by the reader.

The repair is that a removal leaves a gap -- a quotation is not a word, so it does not let the words on its two
sides meet, which is the paragraph rule stated from the other end. The gap is inserted only where the byte before
the span is not already whitespace, so `a `b` c` returns the two spaces it returned before this rule existed, and a
row holding nothing but a span still comes back blank, because a blank row is how all three surfaces say "new
paragraph" and a citation must not turn a boundary into a line.

**965** spans in **873** rows of this tree have a non-whitespace byte on both sides and **0** of them have Han on
both sides. The number says the shape is ordinary -- the neighbours are `(`, `)`, `[`, `]`, `/`, `,` -- which is why
the condition is stated on whitespace rather than on Han: a rule keyed to the character the reader is looking for
would only work on the language it was written for.

### Five · six falsifications, and one of the seven attempts that proved nothing

| mutation | red |
| --- | --- |
| the strip removed | 5 |
| a strip that ignores the preceding byte (`/\\+$/`) | 4 |
| the strip placed after the trim | 5 |
| the markdown rule moved into `textRowOf` | 2 |
| no gap where a span was removed | 4 |
| a gap after every span | 2 |

Twenty-two red fixtures across six removals. The first attempt at the second mutation replaced with `'$1'` a
pattern that has no capture group, so the row became `…$1` and the tests went red for a reason that had nothing to
do with the rule -- the seventh attempt, and it proved nothing. Replaced with `/\\+$`, which is the wrong reader a
person would actually write, and the four that should fail do.

### Readings

> Ledger for `v3.101`.

| item | value |
| --- | --- |
| `core` test suite | **254 files, 6484 tests passed** (at v3.101) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.101) |
| repo test suite | **258 files, 6671 tests passed** (at v3.101) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** -- unchanged: both rules are in `scripts/`, which the four dimensions do not measure |
| new tests | **6468 -> 6484, +16**: thirteen document fixtures, two comment fixtures, one workflow fixture |
| the measurement before the rule | **1** row ends in a backslash and **0** are markers; **965** spans in **873** rows sit between two non-whitespace bytes and **0** sit between two Han characters |
| the breaks held | **37 839** documents, **30 453** comments, **808** workflow, **69 090** total, of which **0** fall between two Han characters |
| the falsifications | six removals, twenty-two red; a seventh attempt replaced with a literal `$1` and proved nothing |
| gate sites | **143 / 67 of 96 scripts**, call tally **161** -- unchanged: no new gate |
| the battery | **228 claims across 66 files** -- unchanged |
| `docs:check` | **21 steps** -- unchanged |
| list | **27 -> 26**: the trailing-backslash entry closed, nothing opened in its place |

### What is left, in the order it has to happen

| priority | item | state | next |
| --- | --- | --- | --- |
| P2 | the ceiling of 8 workers has never been measured where it is not oversubscription | unchanged: every reading is on a four-CPU quota | one full run on a box with nine or more available CPUs |
| P2 | how close a **failing** run comes to its ceiling | unchanged | one run whose artefact is a failure, read per test |
| P2 | a record's `terms` is a map, so nothing can say which keys a rule writes | unchanged: priced at v3.94 | the trigger, or nothing |
| P3 | an in-row `#` inside a block scalar is read by nothing | unchanged: 13 marks, all shell strings | nothing until a block holds a language whose comments are not row-leading |

**Where this leaves the campaign.** The language axis has no open question left about what a break does: the unit is
the paragraph, the marker is punctuation on the one surface that has a renderer, and a removal leaves a hole. The
three P2 items wait on something outside this sandbox. The one P3 item is about a language YAML does not name. What
the last two rounds bought is not a change in the verdict -- the tree was green before and after -- but the
disappearance of three ways the rule could have been wrong without anything saying so.

## v3.102 · the artifact published a judgement in a field every reader takes as a measurement

Two contracts publish an easy/medium/hard word for a case's level, and both published the level the
*author* wrote. The floor under it stayed in the repository, so six of thirty-four cases shipped an
opinion beside twenty-eight measurements and nothing in the file said which was which.

### One · measured before the rule was written

`cloud-opsbench` calls the field `difficulty`, `itbench` calls it `scenario_complexity`, and both were
`difficultyFor(FaultCase.difficulty)`. `docs/data-model.md` has said what that field is since the round
that gave it a definition: a **claim**, allowed above the structural floor because a case can be hard to
*detect* while easy to trace, and refused above it unless the case says what the floor cannot see.

Thirty-four shipped cases, the level each states against the floor its own chain supports:

| declared | floor | cases |
| --- | --- | --- |
| `L1` | `L1` | 2 |
| `L2` | `L1` | 2 |
| `L2` | `L2` | 8 |
| `L3` | `L2` | 3 |
| `L3` | `L3` | 13 |
| `L4` | `L2` | 1 |
| `L4` | `L4` | 5 |

**Six** pairs differ, **zero** cases claim below their floor, **zero** state no level. The one `L4` over an
`L2` floor is `history-config-rate-cache-ttl-pricing`: the artifact says `hard` for a case whose structure
supports `medium`, over a chain of a single step. Both exporters were self-consistent, which is why reading
either file could not find this -- every field in each file agreed with every other field in it.

### Two · the floor can travel where the note cannot, for a reason that is checkable

`assembleBundle` drops `difficultyNote` deliberately: it names what the chain cannot see -- a setting
changed days earlier, an exception that closed a connection instead of nacking the message -- and that is a
paragraph of the answer. The floor is not that. It is a lower bound derived from the causal chain, and the
file it lands in already carries the answer: `metadata.json` holds the `result` triple, `scenario.json`
holds `scenario_groundtruth.diagnosis`. In a valid corpus the floor can only *lower* what the claim
suggests, because a level below its floor is refused as a shortfall before anything is exported.

### Three · one projection, and a graph that is not optional

`projectDifficulty({ case, graph })` returns both words and each exporter reads the pair off one object.
Pairing a claim with a floor by hand in `cloudopsbench.ts` and `itbench.ts` would be the third-source
defect `export/difficulty.ts` was created to remove, one level up: two files that have to agree and no
reader that compares them.

The graph is required rather than optional, which is the smaller half of the design: `difficultyFloor` resolves
entity kinds through the graph's index, so a floor computed over an empty graph is `L1` for every case -- a
wrong answer wearing the shape of a conservative one. The module's header called it a leaf for as long as it
read only the type of the level it was given; it is not one any more, and the header says so.

### Four · eight falsifications, one hundred and twenty-five red

| mutation | red |
| --- | --- |
| the floor taken from the claim instead of the chain | 13 |
| the floor read through an empty graph rather than the one passed in | 5 |
| the two words swapped | 28 |
| `cloud-opsbench` drops the key | 7 |
| `itbench` drops the key | 5 |
| the IR level published instead of a projected word | 40 |
| the claim replaced by the floor in both exporters | 25 |
| the structure checks accept any present floor word | 2 |

No mutation survived. The last one is why the field is not merely emitted: a word outside the three is
refused wherever it appears, and neither direction of that check is decoration -- the words the emitter can
produce pass, and a word it cannot produce does not.

### Five · the asymmetry the checks carry, and what this does not fix

`difficulty_floor` and `scenario_complexity_floor` are extensions to two upstream contracts, so the structure
checks hold a present word to the vocabulary and **do not demand the key**. That is not leniency about this
repository's own exports: it is the difference between a statement about validity and a statement about
provenance, since a `metadata.json` the benchmark itself produced carries no such key and a check that
demanded one would score the reference corpus as malformed. What it costs is stated: the shape check cannot
notice an exporter that stopped emitting the pair, so the emission is pinned by the exporters' own tests and
by the generated contract page instead.

**A second finding.** The export count this round moved was also stated in the one paragraph that argues against
restating a count, and it stayed stale while every gate went green (finding 554); the sentence now points at the list.

**What it does not fix.** A case that states no level publishes the documented `unset -> medium` row beside a
floor that may outrank it -- a three-step chain with no label prints `medium` beside `hard` -- and nothing
refuses that pair. The corpus offers no witness (0 of 34), so the repair would be a rule whose only failure
is synthetic; it is an open entry rather than a rule.

### Readings

> Ledger for `v3.102`.

| item | value |
| --- | --- |
| `core` test suite | **254 files, 6509 tests passed** (at `v3.102`) |
| `cli` test suite | **4 files, 187 tests passed** (at `v3.102`) |
| repo test suite | **258 files, 6696 tests passed** (at `v3.102`) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98** (+0.01 on statements and lines: the one new function is covered), `cli` **100 / 100 / 100 / 100** |
| new tests | **6484 -> 6509, +25**: six in `cloudopsbench`, five in `itbench`, four on the projection, one on the shipped corpus, nine in the two structure checks |
| the measurement before the rule | **34** cases: six pairs differ, zero shortfalls, zero unlabelled; the example bundle carries the same shape |
| the falsifications | eight removals, **125** red, no survivor |
| gate sites | **143 / 67 of 96 scripts**, call tally **161** -- unchanged: no new gate; one `throw` in `format-spec.mjs` moved from line 758 to 760 |
| the battery | **228 claims across 66 files** -- unchanged |
| `docs:check` | **21 steps** -- unchanged |
| list | **26 -> 26**: the projection entry closed by finding 553, and the unset-claim pair opened in its place |

### What is left, in the order it has to happen

| priority | item | state | next |
| --- | --- | --- | --- |
| P2 | the ceiling of 8 workers has never been measured where it is not oversubscription | unchanged: every reading is on a four-CPU quota | one full run on a box with nine or more available CPUs |
| P2 | how close a **failing** run comes to its ceiling | unchanged | one run whose artefact is a failure, read per test |
| P2 | a record's `terms` is a map, so nothing can say which keys a rule writes | unchanged: priced at v3.94 | the trigger, or nothing |
| P3 | an in-row `#` inside a block scalar is read by nothing | unchanged: 13 marks, all shell strings | nothing until a block holds a language whose comments are not row-leading |
| P3 | a case that states no level prints a default beside a floor that may outrank it | new: 0 of 34 have the shape | a corpus with one, or one of the three spellings chosen |

**Where this leaves the campaign.** This round left the language axis, and the defect it found points the other
way: what the artifact says about a corpus rather than what the repository says about its own prose. Six of
thirty-four is a number any later round can recompute from the corpus without trusting a sentence here. The
three P2 items wait on something outside this sandbox; both P3 items wait on a witness this corpus does not
carry.

## v3.103 · the length said which it was, and the count defending the rule was counting cases

`fault.parameters` writes seventeen of the corpus's numbers in a unit of time, and exactly one of them is
how long the fault lasted. Which one was answered by a field naming a single parameter -- optional, so a
case could answer the length rule by deleting it, and the run printed the five that had answered and never
the twelve that had said nothing. The field is gone; the word is written on the parameter.

### One · the count was of cases, and it was three short (finding 555)

The rule's defence in `docs/data-model.md` was a count: *the corpus carries **fourteen** time-valued
parameters and **five** of them are the episode -- the other nine are knobs*. Read with the reader this
round writes, the corpus holds **seventeen** parameters in a unit of time, across **fifteen** cases, of
which **five** state the episode and **twelve** name a knob:

| reading | value |
| --- | --- |
| parameters the case declares | **112** across 34 cases |
| lengths among them (`isConvertible(unit, 's')`) | **17** across 15 cases |
| lengths that state the episode | **5** |
| lengths that name a knob | **12** |

Fourteen is the number of **cases**, and nine was fourteen minus five -- the sentence's own arithmetic only
works if its subject is parameters. The three it lost are one case's two time-valued parameters and another
case's one: `history-config-ingress-timeout-partner-portal` declares `upstreamReadTimeout` and
`previousUpstreamReadTimeout`, and `history-runtime-pod-shutdown-webhook-dispatcher` declares the grace
period and the drain. Nothing read the sentence, and the number the guard printed on every run counted
cases, so the two numbers could never meet.

### Two · the answer moved onto the number it describes (finding 556)

A quantity written in a unit of time now carries one of two words:

| `role` | what the parameter is |
| --- | --- |
| `knob` | a setting the case ran under -- a grace period, a retention gap, a timeout |
| `episode` | how long the fault itself lasted, which the samples are then held to |

The field that used to name one of them is gone rather than kept beside it, for the reason
`readDeclaredReading` removed a reading that carried both a value and a parameter: two statements of one
fact are two that can drift. And the word is mandatory exactly where it applies -- a count, a share and a
byte count have no role to give, and a role written on one is refused rather than ignored, because neither
word could describe it. A case whose parameters hold no length at all is still not refused: it makes no
claim, and the run prints `lengths 0 time-valued parameter(s)` so a case that lost its lengths entirely is
visible rather than silent.

Fifteen case files moved, seventeen words were written and five fields were deleted. The corpus is the
migration's own proof: every one of the seventeen answers, and the five episodes still draw exactly the
minutes their parameters state (4, 6, 17, 18, 120).

### Three · four refusals became three plus one

The refusals that belonged to a *name* -- not a name at all, a name the case does not declare, a name whose
value is not a time -- are gone with the name: there is nothing left to spell wrongly. `readDurationClaim`
now takes the one declaration `readParameterRoles` produces, so its input cannot be a count or a typo, and
three refusals remain: no excursion, two lengths, a number the samples contradict. The one that arrived is
`role-without-time`, which no name field could make.

`check-fault-cases` reads the roles once, refuses every fault they report, refuses a residual
`durationParameter` by name where a file still writes one, and prints the two answers beside the number of
lengths they must partition -- `17 time-valued parameter(s): 5 state the episode, 12 name a knob, 0 say
neither` -- so the third number is counted rather than assumed to be zero.

### Readings

> Ledger for `v3.103`.

| item | value |
| --- | --- |
| `core` test suite | **255 files, 6523 tests passed** (at `v3.103`) |
| `cli` test suite | **4 files, 187 tests passed** (at `v3.103`) |
| repo test suite | **259 files, 6710 tests passed** (at `v3.103`) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** |
| new tests | **6509 -> 6523, +14**: twelve on the vocabulary and its four faults, one on the guard's refusal of a length that answers neither, one on the partition the run prints, and three the enumeration suite writes for the new module -- it is in three lists there, and `it.each` writes one test per entry |
| the corpus the rule is measured on | **17** lengths across **15** cases: **5** episodes, **12** knobs, **0** silent |
| the migration | **15** case files, **17** words, **5** `durationParameter` fields deleted |
| the falsifications | seven removals, **13** red, no survivor |
| gate sites | **143 / 67 of 96 scripts**, call tally **161** -- unchanged: no new gate; four `throw` sites in `check-fault-cases.mjs` moved with the insert |

## v3.104 · the budget the gate compared against was one the test had already replaced

The round before this one ended with a single red step in CI, and the step was right about the cost and wrong
about the clock it held that cost to. The reader knew the spelling -- it counted it for the discovery rule --
and read a different number for the fraction.

### One · the denominator was a number the test had replaced (finding 557)

`check-test-budgets` asks every file one question: how long did your slowest test take, against what did you
declare? The declaration it read was the one a `describe` states. `ingest-report.test.ts` states 30 000 on its
four suites and writes `}, ROWS_TIMEOUT_MS);` on the two tests that ingest 130 000 rows, with
`ROWS_TIMEOUT_MS = 120_000` above them. In vitest a test-level timeout replaces the suite's, so those two
tests never ran under 30 000 at all -- and the run said otherwise:

    ingest-report.test.ts: its slowest test takes 15199 ms against a stated budget of 30000 ms, which is
    0.51 of it; the rule asks for 2x

8x of headroom, printed as a 2x shortfall, on a commit that changed documentation. Nothing about the
measurement was wrong; the denominator was a number the test had already replaced. This file's four spellings
exist because "a reader that knows fewer spellings than the language fails in the direction of a false red",
and the reader knew this spelling for *discovery* and not for *fraction*: the same defect one level up.

Reproduced without CI by writing 15 199 into that assertion's duration in the report of the local coverage
run -- one problem before, `OK` after -- and the repair is not a relaxation in the other direction either. A
test that states 10 000 inside a suite that states 60 000 used to be measured against 60 000: 6 000 ms read
as 0.10 of the wrong clock, invisible. It is 0.60 of the one it runs under, and that is now the first thing
the rule sees. Six tests were added for the pair, and either half of the pair going away turns the other red.

### Two · to read a position, the reader had to stop deleting

The scanner blanked rather than removed: comments and the bodies of string and regex literals become spaces
at the same length, with the quote characters kept. It had to, because a title is read out of the *file* --
`it('…', fn, 120_000)` is associated with the name the report prints, which is the test's ancestors and its
title joined by spaces -- and an offset in a text whose comments are gone is not an offset in the source.
Keeping the quotes keeps the last-significant-character rule exactly as it was: a `/` after a string is still
a division, and that rule is why the old scanner emitted `""` and `/re/` instead of nothing.

Two measurements say this moved offsets and nothing else. The two readers that existed before were compared
against the pre-round scanner over **250** test files: **0** differences in suite budgets, **0** in stated
budgets. And the one mutation that blanks the quotes too -- the fidelity this paragraph spends words on --
changed **nothing** on **440** files (every test, every script, every source file), for all three readings.
That survivor is below, unimproved.

### Three · six falsifications, eleven red, one that proved nothing

| removal | red |
| --- | --- |
| the suite's number first, as before v3.104 | **4** |
| a repeated title keeps the larger of its two numbers | **1** |
| an options object is read anywhere in the argument list | **1** |
| the title must match exactly, with no suffix | **4** |
| the argument list is split on every comma | **1** |
| the quotes are blanked with the literals | **0** |

The fourth is the largest: with no suffix match, `a suite the slow one` finds no title and every fixture falls
back to the suite's number, which is the defect itself. The third is the flattering direction --
`typecheck-entrypoint.test.ts` calls `spawnSync(cmd, args, { timeout: RUN_TIMEOUT_MS })` inside a test body,
and a reader that took the first `timeout:` it found would hand that test 180 seconds it never asked for --
so the anchor `^\{` is load-bearing and its fixture is that exact shape. The sixth proves nothing on this
tree, and says so in the finding rather than in a comment: whether the quote characters survive changes no
reading, because no file in it divides by a string.

### Readings

> Ledger for `v3.104`.

| item | value |
| --- | --- |
| `core` test suite | **255 files, 6529 tests passed** (at `v3.104`) |
| `cli` test suite | **4 files, 187 tests passed** (at `v3.104`) |
| repo test suite | **259 files, 6716 tests passed** (at `v3.104`) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6523 -> 6529, +6**: the test's own number preferred to its suite's, a tighter test number that was invisible before, the options form past comments, a `timeout:` in the test's body refused, the file's largest number when neither states one, and a title that appears twice |
| the CI reading this round repairs | `15199 ms against a stated budget of 30000 ms, which is 0.51 of it` -- the test states **120 000**, so **0.13**, and the step is green |
| budgets on a test, in the tree | **13 of 250** test files state one, **52** tests in all; the run names how many budgeted files were judged by one -- **11 of 44** this run, **12** the run before it, because which test is slowest moves with the load |
| the reader's own equivalence | **0** differences over **250** files for the two older readers, **0** over **440** for the quote-keeping |
| the falsifications | six removals, **11** red, **1** survivor |
| gate sites | **143 / 67 of 96 scripts**, call tally **161** -- unchanged: no new gate, no new exit; three lines moved in `check-test-budgets.mjs` (85 -> 104, 361 -> 592, 372 -> 603) and the inventory was re-derived |

## v3.105 · the gate read the shape of a budget, and the copy that knew the rule was the one nobody ran

The last round closed with one survivor and one open item: a mutation that changed nothing, explained as "no
file in this tree divides by a string". Both were wrong in the same direction -- the mutation changed nothing
because *nothing read what it changed* -- and looking for the reason turned up two readers of one rule that
disagreed about what the rule was.

### One · a pattern does not end at a slash inside a class (finding 558)

The header of `check-test-budgets.mjs` says the scanner is the one `test/timeout-budget.test.ts` documents. The
document's scanner has tracked **character classes** since the repair that added its fourth mode -- `/['"]/`
holds a quotation, and reading that quotation as the start of a string swallowed the rest of the file. The
gate's `literalEnd` took the first unescaped `/` whatever came before it, so `/[/"]/` ended inside the brackets
and the `"]/` after it was read as code; the quotation there opened a string that ran to the next quotation in
the file, and every budget below it disappeared. A source in the shape the document names:

    const EITHER = /[/'"]/;
    const SUITE_BUDGET_MS = 30_000;
    describe('a suite', { timeout: SUITE_BUDGET_MS }, () => { it('a test', () => {}); });

was reported as `its slowest test takes 16500 ms and the file states no budget, so its verdict is decided by
vitest's 5000 ms default; state one on the suite` -- a false red, in the sentence, telling a file that declared
30 000 ms to declare a budget.

**Why nobody saw it.** A census over the **467** tracked code files finds **eight** patterns holding a slash
inside a class -- `[^/]` in `test/run.test.ts`, `[-_./]` in `src/gates/gates.ts`, a star-and-slash class in
`check-no-absolute-paths.mjs`, and five more -- and **not one of them sits above a stated budget**, so both
scanners returned the same three readings for every file. The tree never combines the shape with the thing the
reading is for; the repair changes **0 of 467** readings, which is what a repair to a latent defect should do.

### Two · a number in an argument list is not a budget (finding 559)

The fourth spelling is positional -- `it('a test', () => {}, 120_000)` -- and it was read with `/, <number>)/`,
a shape that also matches an ordinary call. `buildAnthropicRequest('p', 'claude-3-opus-latest', 8192)`,
`Math.imul(state, 1664525)` and a timestamp written `1700000000` all matched, and only numbers under a thousand
were dropped, so the four-digit arguments were the ones it invented budgets from.

| file | what the reader said it declared | what it writes |
| --- | --- | --- |
| `gen-rcaeval-cases.test.ts` | **1 700 000 000 ms** (19 days) | nothing |
| `modality-comparison-shape.test.ts` | 1 664 525 ms | nothing |
| `battery-journal-node.test.ts` | 20 000 ms | nothing |
| eight more | 1 024 – 15 000 ms | nothing |

Ten of the 259 test files declared a budget they never wrote, and the **floor rule did not fire for any of
them** -- a file that "declares" a budget is not asked to declare one. Nothing was green or red wrongly on the
day: every invented number is larger than the slowest test beside it and all ten are under 1 000 ms. One
three-second test in any of them would have been read as hours of headroom.

The stronger half is that this file's own test named the right rule and pinned the wrong fixture: *does not
mistake an ordinary numeric argument for a budget* asserted `f(x, 2)` and `slice(a, 3)`, both already excluded
by the `>= 1000` filter, so it passed for a reason it did not state. `8192` and `1664525` turned it red.

**The repair.** The positional form is read by `testBudgets`, which finds it **inside a test call** and can
therefore tell a timeout from an argument; `statedBudgets` composes that instead of matching the shape. Files
that state a budget fell **44 → 34**, and the verdict changed for **10 of 259** files, every one from a number
the file never wrote to none. Nine more keep their real declaration and lose only the invented extras.

### Three · the kept quotes had no reader, so last round's survivor proved nothing anywhere (finding 560)

v3.104 blanked the bodies of literals and kept the two characters that delimit them, with a paragraph
explaining why: the last-significant-character rule reads them. The same round replaced that rule's
implementation -- it now carries `last` and `word` while scanning instead of rescanning its output -- and the
new form reads the **source**, not the emitted text. From that commit on, nothing read the quotes. The
paragraph described the previous scanner.

The mutation that blanked them too returned identical readings for **467** files and identical verdicts on the
**259** files of the real run, because the emitted quotes feed no reader at all. v3.104 read that as "this tree
has no such shape" and opened an item about a fidelity no test could prove; the census agrees there are **0**
files with a `/` after a closed literal, but that is the second reason, not the first. The literal is now
blanked whole, the paragraph is replaced by the rule as implemented, and the rule has the test it lacked: the
file is never compiled -- it is input to a lexer, and at the token level `"a" / 2` is a division -- so the
fixture is `const ratio = "a" / 2;` with a budget below it.

### Four · one rule, two copies, and a meta-gate that says the copy cannot be the gate (finding 561)

Three findings, one defect: the rule for "what a file states about its own clock" lived in `scripts/` and in
`test/`, agreed on every file in the tree, and disagreed on what the rule *was*. The copy existed because a
gate may not be imported: `verify-gates-are-testable.mjs` proves a gate by emptying it and requiring the suite
to go red **and to name a failing test**, which an imported gate makes impossible. The first attempt at this
repair was the obvious one -- import the gate -- and `scripts-are-classified.test.ts` refused it in under a
second with the remedy in the message: *move the reading into a data module and leave the verdict in the gate*.

`scripts/budget-readings.mjs` is that module: the scanner, the four spellings, `budgetInForce`, and the
sentences that name a declaration. The gate imports it and keeps the verdict; `timeout-budget.test.ts` imports
it and keeps the rule; **179 lines** left the test file and **none** were restated. The gate's `main()` also
gained the `invokedDirectly` guard the deriver and the doc-counter already carry, without which an import runs
a gate over the test runner's own arguments. The register gained a row for the module, the site inventory moved
from **96 to 97** scripts, and sites (**143**) and throw statements (**99**) did not move.

### Six · a hollow gate rode into a commit, and the receipt blessed the tree the run began on (finding 562)

This round's own documentation commit published `scripts/check-official.mjs` with `process.exit(0);` on its
second line. The marker is the meta-gate's hollow form, a battery had left it behind, and `git add -A` took it
along while a long run was still rewriting the tree. Three readers disagreed:

| reader | verdict |
| --- | --- |
| `verify:local` | `OK (35 command(s) covering 48 of the 58 run steps)`, with a receipt |
| `derive-gate-sites` | **FAILED** -- six of that file's exit sites had moved by one line |
| the suite | **68 tests fail** against the hollow form, measured by re-hollowing it |

The inventory caught it by arithmetic: the marker is a line, and the inventory fingerprints exits by line. A
marker that did not shift a line would have passed every local reader. The receipt was no help at all, and
that is finding 562: `HEAD^{tree}` is resolved **before** the first step, deliberately, so a step that
rewrites the tree cannot move the name the receipt is filed under -- which makes the name right and the
question half-asked. A run that starts on one tree and ends on another has measured neither, and its verdict
names the first.

`receiptDecision` now takes the tree read **after** the steps and withholds the receipt when it moved, name or
dirtiness; the run's last line becomes `receipt: none — the tree moved while the gate ran`. It does **not**
turn the run red, and the finding says why: a new exit is a new site, and a site is proved by a test that
reaches it -- the only way to reach this one is to rewrite the tree underneath a running gate, which is the
thing being refused. Two falsifications hold the branch: dropping the comparison turns both withhold tests
red, and keeping the dirtiness check while dropping the name turns one red.

### Five · six falsifications, all red

| removal | red |
| --- | --- |
| classes tracked for strings too | **1** |
| a class never closes | **1** |
| a pattern ends at the first slash, as before v3.105 | **1** |
| a literal's delimiter is not noted | **1** |
| the positional spelling read by shape, as before v3.105 | **1** |
| the positional spelling read in a call of any name | **1** |

The first is the guard that keeps a bracket inside a string from opening a class it never closes; the second
is the closing bracket; the third is finding 558 itself; the fourth is the rule that a value cannot be followed
by a pattern. The last two are the two ways to be wrong about the positional form: by shape (finding 559) and
by callee (any call, which is the same defect with a narrower net).

### Readings

> Ledger for `v3.105`.

| item | value |
| --- | --- |
| `core` test suite | **255 files, 6536 tests passed** (at `v3.105`) |
| `cli` test suite | **4 files, 187 tests passed** (at `v3.105`) |
| repo test suite | **259 files, 6723 tests passed** (at `v3.105`) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6529 -> 6536, +7**: a pattern holding a slash inside a class with a budget below it, a division that follows a literal, a string holding a bracket, an argument that is not a budget, and the three outcomes of a tree that moved while the gate ran |
| tests strengthened | **1**: `does not mistake an ordinary numeric argument for a budget` pinned two numbers the `>= 1000` filter had already excluded |
| the census | **467** code files scanned; **8** patterns hold a slash inside a class; **0** files hold a `/` after a closed literal |
| what the repair changed | **0 of 467** readings for the class fix; **10 of 259** verdicts for the positional one, all from a number never written to none; files that state a budget **44 -> 34** |
| the copy, deleted | `timeout-budget.test.ts` **888 -> 709** lines; `scripts/budget-readings.mjs` **458** lines new; the gate **622 -> 272** |
| gate sites / scripts / throws | **143** sites, **97** scripts (was 96), **99** throw statements -- all three re-derived and proved |
| the falsifications | eight removals, **8** red, **0** survivors (six across the three repairs, two on the receipt's new branch) |
| gate sites, proved | **143** failure sites across **67 of 97** scripts, and `verify-site-proofs` **PASSED (228 claim(s) across 66 file(s))** -- both re-derived after the move |

## v3.106 · the receipt was refused and the verdict still said OK

The round before this one ended with a finding whose "what it does not fix" was a sentence about the sentence: the
receipt withheld on a moved tree, the verdict still printed `OK`, and the run still exited 0. That sentence is this
round's subject, and the argument it made -- a red run needs a new exit, a new exit is a new site, a site is proved
by a test that reaches it -- was sound about new exits and silent about the one already there.

### One · the word, the code and the file said three things (finding 563)

`receiptDecision` decides whether a run may name a tree. After finding 562 it also knew when the tree had moved.
`verify-local.mjs` read that decision, wrote the receipt when it said `issue`, and then printed a **literal**:

    `verify:local: OK (${coverage})${notes}`

so a run that began on one tree and ended on another printed `OK`, exited **0**, and put the refusal on the second
line -- `receipt: none — the tree moved while the gate ran …` -- where a pusher who has just read `OK` does not look.
Two of the three facts about that run were wrong, and both of them were the ones a script reads.

The measurement is the previous round's own incident, which is why this is not a hypothetical: v3.105's
documentation commit carried `process.exit(0);` on the second line of `check-official.mjs`, `verify:local` printed
`OK` with a receipt, the inventory caught it only because a line moved six exits by one, and **68** tests fail
against the hollow form.

### Two · one predicate, one decision, two readers

Three pieces, each in `scripts/gate-receipt.mjs` because that is the module a test may import:

| piece | shape | the defect it removes |
| --- | --- | --- |
| `treeMoved({ started, ended })` | `null` or the sentence | the comparison had two readers the moment the verdict needed it, and a second copy of a rule is finding 561 |
| `because` on the decision | `'starting-tree'` / `'subset'` / `'moved'` | `runVerdict` cannot parse the sentence: a wording change would become a behaviour change |
| `runVerdict({ result, decision })` | `{ word, exit }` | the word and the code are one claim, and deciding them apart is how they came to disagree |

The gate now reads one value twice -- the word on the green path, the branch on the rest -- so the printed word and
the exit code cannot disagree without contradicting the same variable. `voidReport` prints the block, from the exit a
failed step already uses, which is why the inventory did not gain a site.

### Three · four boundaries, each a wrong answer that looks right

| shape | verdict | why |
| --- | --- | --- |
| starts clean, ends clean on another tree | **VOID**, exit 1 | a commit landed mid-run |
| starts clean, ends dirty | **VOID**, exit 1 | a step wrote to the tree while the gate ran |
| starts dirty, ends dirty | **OK**, exit 0, no receipt | that is a developer at work; comparing `state` alone fails every local run |
| a subset run | **OK**, exit 0, no receipt | it proves the steps it ran, and the verdict line already says which |
| a step failed **and** the tree moved | **FAILED**, exit 1 | the failing step is the actionable fact; the move is its consequence |

The block a reader now gets instead of `OK`:

    verify:local: VOID — the tree moved while the gate ran
      started: 6592c7b (clean)
      ended:   c29138f (clean)
      measured: 35 command(s) covering 48 of the 58 run steps in ci.yml; the other 10 need a runner
      reason:  the tree moved while the gate ran -- it started on 6592c7b and ended on c29138f, so the verdict
               names a tree that no longer exists
      receipt: none — the steps passed over content this tree no longer is, so no revision here may be published
      next:    run it again on the tree you mean to publish

### Four · nine removals red, one survivor measured rather than argued

| removal | red |
| --- | --- |
| the `VOID` branch in `runVerdict` | **1** |
| a dirty start is not a move | **2** |
| the run wrote to the tree | **2** |
| the tree could not be read afterwards | **1** |
| the receipt quotes `treeMoved` rather than restating it | **3** |
| the kind of withholding the verdict reads | **3** |
| the verdict word | **1** |
| what the run covered | **1** |
| the sentence the void report quotes | **1** -- the first attempt was **green**, and the assertion added for it is this row |
| the gate's exit code (`process.exit(verdict.exit)` to `process.exit(0)`) | `derive-gate-sites --check` **FAILED** -- the exit becomes a zero and leaves the inventory |

The survivor is the one that matters and it is stated, not concealed: replacing the gate's
`runVerdict({ result, decision })` with `runVerdict({ result, decision: { state: 'issue' } })` is **green
everywhere** -- **207** tests in the three files that touch this gate, and `derive-gate-sites --check` unchanged,
because the exit is still reached by the failing-step spawn. The cause is structural: the gate may not be imported,
so nothing it *does with* a pure result is observable except through a spawn, and the spawn that would reach this
branch has to rewrite the tree underneath a running gate. What the round buys is that the rule now has one home with
nine removals behind it and the exit has a proof (`scripts/verify-local.mjs:177`, re-signed after the move and
re-measured: **228** claims across **66** files).

### Five · the inventory moved and the proof was re-taken

The exit moved from line 134 to 177 as the block above it grew. `derive-gate-sites` keys the hand-written columns on
the guard text, so the site's `provedBy` was **dropped** on the first re-derivation and restored by hand, then measured:
`verify-site-proofs` re-runs the named file with a hook on `process.exit` and reports the exit arrived. Sites **143**,
scripts **97**, throw statements **99** -- all three unchanged, and the other four `verify-local.mjs` sites moved by
one line each (87, 104, 114, 235) with their annotations carried.

### Readings

> Ledger for `v3.106`.

| item | value |
| --- | --- |
| `core` test suite | **255 files, 6549 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **259 files, 6736 tests passed** (as of this commit) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6536 -> 6549, +13**: seven shapes of `treeMoved`, four of `runVerdict`, two of `voidReport` |
| the falsifications | nine removals in the module, **15** red; one in the gate, the inventory; **one survivor**, measured |
| the survivor's measurement | **207** tests green and `derive-gate-sites --check` OK against a gate told to ignore the decision it computed |
| gate sites / scripts / throws | **143** / **97** / **99** -- unchanged; the exit moved 134 -> 177 and its proof was re-signed and re-measured |
| `verify-site-proofs` | **PASSED (228 claim(s) across 66 file(s))** |
| what the gate prints now | `OK` on the green path, `VOID` + exit 1 when the tree moved, `FAILED` + exit 1 when a step did |
| a real subset run | `verify:local --only scripts` -> `OK (1 command(s), 1 of the 48 local steps)` and `receipt: none — the working tree differs from 6592c7b` -- the dirty start is OK by design |
