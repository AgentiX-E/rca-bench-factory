# Audit · volume 13

Findings 542–544, from the rounds recorded in `progress/volume-14.md`.

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
