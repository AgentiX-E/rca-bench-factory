# Audit · volume 13

Findings 542–547, from the rounds recorded in `progress/volume-15.md`.

## Finding 542 — the 246 directories that could not be reproduced were counted as refusals, and a refusal is not a statement about the corpus

`check-aggregate-tables.mjs` walked 271 case directories and printed three outcomes: `reproduced`
(25), `refused` (246) and `disagreed` (0). The middle number was honest and it was useless. A reader
of `246 refused, 246 for no cluster id and no rendered template` learns that this repository's rule
cannot read those files; they do not learn whether the corpus's own table has anything to do with the
logs beside it. Two very different corpora -- one whose `logts.csv` is a faithful summary and one whose
`logts.csv` is a table of random numbers -- produce that identical line.

The 246 are not a defect. `RE2-SS` and `RE2-TT` ship Drain's **masked** templates in
`cluster_info.json` and a `message`-only `logs.csv`, so there is no column that names the cluster a row
belongs to, and the exact reduction has nothing to key on. Three attempts at a rule that would infer
the key are measured in finding 534, and the second of them makes one row match three clusters at once.
So the exact claim is genuinely unavailable, and the round that discovered that made the honest choice:
count them and say why.

**What was available is an inequality.** A table of per-cluster counts is a *partition* of each
container's lines, so its marginals cannot exceed the lines:

    for every container c and every 15-second bucket b:
        sum of logts.csv[c, *] at b   <=   number of logs.csv rows with container c in b

That is derivable from what the file claims to be, and -- the part that makes it a check rather than a
restatement -- it is falsifiable. A table bucketed on a different clock, generated from a different log
file, or counted twice fails it. What it cannot see is a misattribution *within* a container, which is
exactly the thing the 246 directories have no column to check. So it is a weaker claim than
reproduction, and the repair is to give it its own name rather than to bolt it onto a step whose
sentence is "reproduced".

**`bounded` is that name.** The gate now has four outcomes, and the summary prints the exact count and
the weak count in separate clauses:

```
check-aggregate-tables: OK (1 case(s) reproduced, 4 cell(s) reduced from logs.csv and equal to the
corpus's own logts.csv; 4 row(s) counted by their own cluster id, 0 named two different clusters;
1 case(s) bounded, not reproduced: the marginals of logts.csv hold no more log cell(s) than logs.csv
has rows for that container, 3 (container, bucket) pair(s), 0 spare row(s) at the tightest over
4 published cell(s) against 4 log row(s))
```

`not reproduced` is in the sentence on purpose. A weak claim that reports itself as a weak claim is
worth having; a weak claim counted in the same number as a strong one is the defect this repository
keeps finding (findings 481, 520, 537) wearing a fourth outcome.

**Three refusals are all that is left of the shape.** The inequality needs one thing the corpus never
states anywhere else: which container a published column belongs to. The spelling is
`<container>_<cluster key>` with the key a decimal integer, and `containerOfColumn` refuses anything
else -- `frontend_notanumber` is a header this rule cannot attribute, and splitting at the last
underscore would guess at `checkout_service_12`. A table whose first column is not `time` is refused
for the same reason from the other end. A table with no non-zero cell is refused rather than passed,
because "the claim held" and "there was no claim" print the same number of failures; that is finding
537's lesson one level down.

**Two row counts that were confused, in the round that introduced both.** The first implementation
printed `4 published log cell(s) against 2 row(s)` for a case whose `logs.csv` held four rows: the
`2` was the *published table's* row count, and the bound is against the log file's. The two numbers
were one field apart in a return object and meant different subjects. The reader now carries
`logRows` beside `publishedRows`, and the summary's `against N log row(s)` is the second one. This is
the class of defect a new outcome is good at exposing: the recursion from "which number is this?" to
"which file is it a number about?" had never been asked of this step, because it had never had two
numbers of the same shape.

**The gate's own count moved with it.** The run in which nothing could be reproduced or bounded is a
different sentence from the run in which nothing could be reproduced, so the exit's condition and its
message both changed -- `0 of N case(s) could be reproduced or bounded, which is not a pass` -- and the
tally moved from 157/139 to 158/140 with the new reader in finding 543.

What this round did **not** do is run the inequality over the corpus. The fixture is four rows and the
corpus is 271 directories and 5.2 GB; the number that will be quoted next is the one the next
`official-data.yml` run prints, and the entry that asked for the name stays open until it does.

## Finding 543 — the coverage table had no reader, and the sentence above it did not name its instrument

`docs/progress.md` publishes four figures under a sentence beginning "Measured by
`vitest run --coverage`". `check-doc-counts` holds the *suite* counts to a run and
`derive-gate-sites --check` holds the gate-site count to a derivation. Nothing held these four.

The cost was already measured twice and both times the mechanism was the same. In finding 481 the page
published **99.93** branches for at least eight rounds while every `### Readings` ledger read 99.80:
the table was retyped rather than retaken, and no reader could tell. In finding 539 the figures were
finally retaken and **two instruments answered differently** -- clover's XML said 99.980, v8's counters
said 99.97 -- and the prose did not say which one it meant. The second finding is the sharper one: even
a reader that compared the table with a file would have had to know *which* file, and the page did not
say.

**The repair is a reader that computes the number and names the instrument.** `test:coverage` now asks
vitest for `json-summary` beside the reporters it already wrote, and
`scripts/check-coverage-readings.mjs` compares the four published figures with that report's
`total.<dimension>.pct` at two decimal places -- the same precision the page writes -- and prints:

```
check-coverage-readings: OK (4 dimension(s) equal to the v8 counters in
packages/core/coverage/coverage-summary.json: statements 99.97%, branches 99.95%, functions 100%,
lines 99.97%)
```

The instrument is in the sentence because the sentence above the table is what was ambiguous. `clover`
is kept in the reporter list rather than replaced: it is the second instrument the 0.01 disagreement was
measured with, and removing it would remove the ability to notice that the two differ.

**`UNCHECKED` is an outcome, not a pass.** `docs:check` does not run the suite -- running vitest inside
it would recurse, which `check-doc-counts.mjs` documents at length -- so on a cold tree there is no
report. The two dishonest answers are available and both are refused: passing silently (the table is
unchecked and nothing says so) and failing (the table may be perfect). The script parses the table,
refuses every structural defect in it, and then says `UNCHECKED (no coverage report at …; the table's
four figures are unchecked in this run)`. CI runs the same script with `--require`, in the step that
already reads that run's own reports, so a missing report there is a broken pipeline rather than a cold
tree.

**What it refuses, and what it deliberately does not.** A missing `## Coverage` heading, a missing
`| Dimension | Result | Gate |` table, a dimension that is not one of the four, a dimension published
twice, a result that is not `NN.NN%`, and a report without `total.<dimension>.pct` all fail. The `Gate`
column is *not* compared: it restates the thresholds in `packages/core/vitest.config.ts`, and
`coverage-thresholds.test.ts` already holds those two numbers equal. A second reader of one claim is
how this repository has twice ended up with two numbers that were both green.

**The first wiring was refused by a test, and the test was right.** The script was put into
`docs:check` *and* named by the CI step, and `ci-reaches-doc-guards.test.ts` rejected the pair: a guard
inside the aggregate must reach the pipeline through the aggregate and not by a hand-maintained list,
because the duplicate list is what silently stops tracking the aggregate. The resolution keeps the
strict half where the report exists -- the CI step names it with `--require` -- and leaves `docs:check`
without it, which is why the table now says in one sentence where its reader is. A guard that runs in
both places and compares nothing in one of them would have been the same defect as the page: a number
with a reader that does not compute it.

## Finding 544 — a stopped run was refused with the budget that ended it, and not with the test it was inside

Two refusals in `verify-sites-are-sensitive.mjs` fire when a run did not finish: the baseline that never
passed (`did not finish inside the 30000 ms of test budget …, so its claims are unmeasured rather than
unproven`) and the mutant run that was cut (`… so the run was stopped rather than failed`). Both named a
number and neither named a test. The number is a ceiling the whole file shares; the test is the one line
of that file that hangs, and it is the thing to change. A reader given only the first raises a budget
that was never the problem.

The second path is the worse of the two: its `detail` was two fixed sentences and no output at all, so
the run that was stopped contributed nothing but the number. On the first path the name could appear in
the quoted `FAIL` line of the summary -- to a 160-character cap, which a deep suite name can reach
before it reaches the test name -- but never in the head sentence, which is the line that goes into the
annotation.

**The reading was already in the string the gate held.** Vitest 3.2.4 prints, for a test that exceeds
its budget:

```
 ❯ test/hang.test.ts (2 tests | 1 failed) 1505ms
   ✓ a suite that never finishes > answers immediately 1ms
   × a suite that never finishes > waits for something that never arrives 1503ms
     → Test timed out in 1500ms.

 FAIL  test/hang.test.ts > a suite that never finishes > waits for something that never arrives
Error: Test timed out in 1500ms.
```

That block is a real run, recorded verbatim in the test that reads it. `exhaustedTestBudget` looked for
`Test timed out in \d+ms` and stopped there; the `FAIL` line under it names the file and the test, and
`outcome.output` -- captured for every run already, for the summary and the tail -- carries both.

**The entry's own repair estimate was for a fact the gate already had.** The leftover proposed buying a
JSON report on the 220 runs that currently save none: "the cost is one JSON file per mutant run and the
reading it buys is which test a mutation makes wait". The reading needed no file. It also needed no
parse of the report's `duration`, which would have answered a different question (how long the test ran
before the ceiling, not which test it was).

**Blocks, not the first `FAIL`.** A run holds several failures, and an assertion in one test beside a
budget kill in another is one `FAIL` line each. `hungTests` therefore scopes the timeout sentence to
the block that carries it -- from a `FAIL` line to the next -- so a mixed run answers with the second
test only, and a run with two kills answers with two names. `hungTestClause` renders the three cases as
one sentence each: one name, N names with the count, and -- the case that must not be silent -- a run
that printed the budget and no `FAIL` line at all, which reads `its own output names no test, only the
budget`. Silence there would be this finding one level down: "no test hung" and "no test was named"
would print the same number of names.

**What is not closed.** The entry was also about the margin: how close a *failing* run comes to its
ceiling is still unmeasured, because a run's verdict is its exit code and nobody asks it for per-test
durations. That half stays open, narrowed to the question it never answered.

**The numbers.** `hungTests` and `hungTestClause` are in `scripts/site-proofs.mjs`, which shifts the
line of five sites in `golden-master/gate-sites.json` and adds none: 140 sites across 64 of 90 scripts
before and after. Two tests were added to `verify-sites-are-sensitive.test.ts` (one of them driving a
new `namelessTimeout` fixture) and three to `site-proofs.test.ts`. The suite is 251 files and 6 388
tests in `core`.

## Finding 545 — the weak claim was reading two clocks, and a fixture cannot see a bucketing rule it never crosses

The `Official data` dispatch on 2026-11-15 (`43735099650`) took the inequality that finding 542 named
to the corpus for the first time. Step 13 printed **246 of 246** directories `over the bound` and
exited 1. The first line is enough to see that the gate, not the corpus, is the subject:

```
RE2-OB/checkoutservice_cpu/2: container 'cartservice' in bucket 1708474635 publishes 131 log cell(s)
and logs.csv holds 0 row(s) for it; a table that summarizes a log file cannot count more lines than
the file holds
```

Zero rows in a bucket the container demonstrably logged in, on all six containers of that case, on
ninety-seven consecutive buckets, and in every one of the 246 directories. The same case's totals
disagreed by **20**: 110 047 published cells against 110 067 log rows, which is exactly the number of
rows that name no cluster. A table whose total is right and whose every bucket is wrong is not a table
that double-counted; it is a reader that filed the rows somewhere else.

**The clock.** `logts.csv`'s time column is the second a fifteen-second window **starts** at, and
`reduceLogts` places a row with `Math.floor(atSeconds / LOGTS_BUCKET_SECONDS) * LOGTS_BUCKET_SECONDS`.
The marginal side -- `countRowsByContainer`, added by finding 542 -- keyed its map by `row.atSeconds`,
the second the row fell on. Those are the same number only when a row lands exactly on a window
boundary, which is what every fixture in `check-aggregate-tables.test.ts` did: `at(0)`, `at(15)`,
`at(30)`. Six rows in a window produced one row in the map, the published cell said six, and the gate
refused. The rows that made it to `0` spare row(s) are the ones whose timestamp happened to be the
window's first second.

**The measurement, on the corpus rather than on a fixture.** `RE2-SS` was fetched locally
(`245 629 018` bytes, digest `7aff9a3a…`, both matching the registry pin) and expanded to 90 case
directories. Before the fix:

```
$ node scripts/check-aggregate-tables.mjs --official-dir /tmp/official/RE2-SS ; echo $?
check-aggregate-tables: FAILED (90 case(s) publish more log cell(s) than their own logs.csv holds; ...)
1
```

63 441 refusal lines across the 90 directories; `carts_cpu/1` alone reported 715 problems over 720
pairs. After the one-line repair:

```
check-aggregate-tables: OK (0 case(s) reproduced; 90 case(s) bounded, not reproduced: the marginals of
logts.csv hold no more log cell(s) than logs.csv has rows for that container, 63 663 (container,
bucket) pair(s), 0 spare row(s) at the tightest over 7 308 948 published cell(s) against 7 566 220 log
row(s))
```

**The guards.** Two tests, both red before the repair and green after: one writes six rows at seconds
`0…5` inside a single window against a published cell of 6 (a log side keyed by the second answers 1),
and one writes `14`, `15`, `15` across a boundary against cells of 1 and 2 (a log side keyed by the
second answers 0 and 0, and the refusal it printed named `bucket 0` with `0 row(s)` -- the corpus's
sentence, in six lines). The second test is the one that matters for the *class*: it crosses a
boundary rather than sitting on one, and the previous fourteen fixtures did not.

**What this changes about the claim.** Nothing about the inequality; everything about what its first
run proved. Finding 542's entry in the Open list said "the inequality has run on fixtures only", and
that sentence was doing more work than it looked: a fixture can agree with a bug for as long as the
fixture is written at the numbers the bug assumes. The corpus read is now the evidence, and it is a
local one -- the 246 directories are `RE2-SS` (90) and `RE2-TT` (156), which the pin makes
reproducible on any machine with 20 GB of disk.

**What is not closed.** The failure this finding repairs was *found by* the run that was supposed to
confirm the claim, and the run's verdict was reported as a corpus failure for one push. A gate whose
first real reading is a failure of the gate is the shape finding 543's coverage row had one instrument
earlier, and the repair is the same in both: run the reading before the release that cites it.

## Finding 546 — eighteen document gates, and not one of them asked what language a sentence is in

Three rounds of a 244-round log were written in Chinese. `v3.69` is 43 lines, `v3.83` 40 and `v3.84` 33,
headings included; the other 241 rounds are English, every commit message is English, every comment is
English and every gate's output is English. The three were found by reading the log rather than by
running anything, and they had been there for 27 rounds.

**Why nothing noticed.** `docs:check` ran eighteen steps over exactly these documents. They hold the
suite counts to a run, the findings cited to findings that exist, each volume's edges to a tiling of the
log, the open list to its own arithmetic, the repository table to the tree, the roundtrip record to a CI
run, the vocabularies to one source, the CLI reference to a parser, the site count to a derivation, and
the coverage figures to the instrument that produced them. Every one of those is a question with a
**shape** in it -- a number, a boundary, a resolvable name. "Which language is this sentence" has no
shape, so no step asked it, and a document written in a language the reader does not have passes all
eighteen.

**The measurement.** The reading was written ad hoc, an hour before the gate existed, and the shape it
counted is the shape the gate now refuses: a run of eight or more Han characters outside a quotation. The
output it printed, over the tree as it stood:

```
files 46, lines 96: volume-14.md 34, volume-13.md 32, volume-15.md 28,
docs/audit/volume-02.md 1, docs/audit/volume-03.md 1
```

96 lines across five documents, of which 116 were prose inside the three rounds (a line can hold two runs,
and a line inside a fence is not one). The same reading now names zero, by
`node scripts/check-docs-language.mjs`, and the fixture that reproduces the *before* state in miniature is
the paragraph test beside this gate. Nothing of the ad-hoc script survives, which is the right end for a
reading that turned out to be a rule.

**The repair, in two halves.** The three rounds were rewritten in English against the record -- every
number kept, every finding number still resolving, every heading level and ledger row unchanged, and the
byte deltas printed rather than hidden: `v3.69` 14 322 → 15 175, `v3.83` 9 026 → 9 423, `v3.84` 6 120 →
6 299. And `scripts/docs-language.mjs` holds a reading that refuses a fourth: a run of **eight** Han
characters outside a quotation, where a quotation is any of the three forms this repository carries
another document's bytes in -- a fenced block, a code span of any delimiter length, or a block quote.

**Why eight, and why three exclusions.** Every legitimate Chinese string in this tree is shorter than
eight: `金标` is two, `§六` is one, and the longest -- `04-里程碑与路线图.md` -- is inside a code span. The
threshold is a decision, so both sides of it are asserted: seven characters pass, eight refuse. The three
exclusions are decisions with a cost, and the cost is written into the module rather than left to be
discovered: a round could hide its prose in block quotes and this reader would call it a quotation. That
is the same limit the ledger-name rule states -- the guard's subject is the accident, not the lie -- and
the alternative, refusing every Han character, would have made every citation of the external
documentation unwritable.

**Two shapes a naive reader gets wrong, both now fixtures.** A span delimited by two backticks around
text containing one: a reader matching `` `[^`]*` `` closes that span at the inner backtick and leaves
sixteen characters of Han in "prose", so it refuses a citation. And an **unterminated** backtick: the
same expression swallows the rest of the line, so a line that should be refused passes -- the one
direction a guard must never fail in. `withoutCodeSpans` walks backtick runs and matches delimiters by
length instead, which is CommonMark's rule and the reason `` ``…`…`` `` exists.

**One citation moved rather than translated.** `docs/audit/volume-02.md` quoted 08's own rule inline,
with a nested code span inside the quotation:

> `08` declares "本文档只记录实测值 … 未实测的数字一律写 `未测量`"

A nested span inside a quotation defeats a single-delimiter reader from the other side, so the quotation
is now a double-backtick span: the bytes stay verbatim and stop reading as prose. Translating a quotation
would have been the wrong repair -- it is another document's sentence, and the other document is Chinese
by design.

**What the gate is worth.** One more exit and two more scripts -- the gate and the reading behind it, the
second of which has no exit at all: `derive-gate-sites` moves to **141 failure sites across 65 of 92
scripts**, and the battery moves by one claim (226 across 64 files) because it credits a site's script
rather than the site's subject. A language rule has nothing to mutate. The thirteen tests are eight
fixtures driven through the gate and five over the reading; the three exclusion fixtures are written so
that removing their exclusion makes them fail, which is the only thing that distinguishes an exclusion
from a rule that never runs.

## Finding 547 — the grid was assumed and never read, so a table on another origin would have been answered with a breach

The inequality finding 542 named compares per-window totals: `logts.csv`'s cell for container `c` in
bucket `b` against the number of `logs.csv` rows for `c` in that window. Finding 545 repaired the side
that decides which window a row falls in. The other side -- the table's own time column -- was read as
a bucket key and never as a claim: `Number(line[0])`, used to key the published map directly, so the
two sides agreed about the grid only because the corpus happens to write its window starts on it.

A table written on another origin -- times of `7`, `22`, `37` -- was compared against the window that
number names, which is a window the log side never fills, because the log side floors. The verdict
would have been:

```
container 'frontend' in bucket 7 publishes 1 log cell(s) and logs.csv holds 0 row(s) for it;
a table that summarizes a log file cannot count more lines than the file holds
```

Every clause of that is true and the subject is wrong: the corpus is not publishing cells it cannot
have, this rule is comparing two origins and reporting the difference as a defect in the file. It is
finding 545 one step upstream -- the same disagreement between a floored side and a raw one, in the
place where a reader of the gate's output takes a sentence about the corpus at face value. 545 printed
246 refusals in total; this would have printed one per published row, and it would have been believed.

**The measurement that makes the refusal safe.** Before writing one, the corpus was read for the
property: **0 of 26 116** published rows across the 271 directories carry a time that is not a multiple
of fifteen. Every table in `RE2-OB`, `RE2-SS` and `RE2-TT` starts its windows at `0` and steps by 15, so
a rule that refuses an off-grid time refuses nothing the corpus ships, and puts the sentence where the
next corpus will read it rather than where this one would have been misdescribed.

**The repair, and why it is once per case.** `compareMarginals` records the first off-grid time it sees
and skips the row; `checkCase` turns a recorded time into `refused` / `off-grid-table`, with the number
in the sentence rather than a count beside it:

```
logts.csv: its time column reads 7, which is not on the 15-second grid the reduction buckets on;
the inequality compares per-window totals, so a table written on another origin would be answered
with cells the log file never fills rather than with a fact about the corpus
```

One refusal per case rather than ninety-seven: an origin is a property of the file, and a line per row
would be 26 116 copies of one fact -- the count-capping shape finding 528 found in a failure line, one
instrument over.

**The guard that keeps the refusal from being over-broad.** A refusal is a larger claim than a breach,
so the second fixture is the one that stays a breach: a table one window away -- `15` where the log has
a row at `0` -- is on the grid, so it is compared, and it fails on its numbers. Without that case a
rule that refused whenever the two sides disagreed would satisfy the first fixture and destroy the
claim it was added to protect. Both fixtures are red before the repair and green after, and the red is
the sentence this finding exists to stop printing: `FAILED (1 case(s) publish more log cell(s) than
their own logs.csv holds; 1 problem(s) reported)`.

**What the corpus read said afterwards.** Nothing moved, which is what a refusal that fires nowhere is
for: **25 reproduced, 246 bounded, 0 refused**, 83 742 cells and 270 445 pairs in 2 m 22 s. The gate
gained no failure site -- a refusal is a `return`, and the one exit already carries the verdict -- so
`derive-gate-sites` holds at 141 sites across 65 of 92 scripts and the battery at 226 claims.

**What is not closed.** The module can now say that a time is off the grid; it cannot tell another
origin from a typo, and it names the number it saw rather than the arithmetic that would have to hold
for the comparison to mean anything. A corpus bucketing on two-second windows is refused as readily as
one that wrote `7` by mistake. That is the right verdict for a claim about fifteen-second windows and
it is a statement about this rule's reach, so it is written here rather than discovered by the next
corpus that disagrees.
