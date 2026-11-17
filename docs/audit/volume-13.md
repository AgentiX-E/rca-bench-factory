# Audit · volume 13

Findings 542–567, from the rounds recorded in `progress/volume-15.md` and `progress/volume-16.md`.

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

## Finding 548 — the comments were English and nothing read them, and a reader for them is a scanner before it is a rule

`docs-language.mjs` reads markdown. The code was held to English by the reviewer, which is a different
instrument with a different failure mode: a reviewer reading a diff sees the lines that changed, and a
comment in another language is invisible to every gate in this tree. The Open list carried that sentence for
five rounds with the same parenthesis -- a reader for the comment body needs a lexer -- and the parenthesis
is the finding.

**A comment is a region, not a line.** The obvious reader is a line whose first characters are `//` or `/*`,
and on this tree it is right about 23 671 of 23 768 comments. The rest are not exotic: **331 comment openers
sit inside a string, a template literal or a regex**, across **90 of 462 files**. The largest single file is
`scripts/site-proofs.mjs`, which builds a page by concatenating JavaScript source into string literals -- 44
of those openers. A line scan would read the generated script's comments as that file's comments, and they
*are* comments: the sentence would be true and about another file.

Two of the shapes were turned into the gate by removing the scanner's state, and each prints a sentence about
a subject that is not there -- finding 545's shape and finding 547's, one instrument over:

```
src/a.ts:1: `本段说明只记录实测值` -- 10 Han character(s) of prose: this repository's comments are written
in English, and the comments that are not are quotations, which a code span carries verbatim
```

That is a sentence about a URL, produced by a reader that did not know a string had begun. The other
direction is worse than a wrong sentence, because it is a wrong *census*:

```
check-comments-language: FAILED — 1 file(s), 0 comment(s) (0 line, 0 block), 0 run(s) of Han prose
outside a code span; 0 comment opener(s) skipped inside a string, a template or a regex; first:
src/a.ts:1: opens a block comment that never closes, so every comment after it cannot be told from text
```

A regex holding the two characters that open a block comment was read as an opener, the walk ran to the end
of the file, and the file reported **zero comments and zero runs**. The exit code happens to be the same and
the reason is not: a file whose block did close would have passed, with its comment unread, and the census
would have said so in a number nobody could question. That is finding 528's shape -- a count that is right
about what it read and silent about what it could not -- reached through a lexer instead of a failure line.

**The repair is a scanner, and the rule is imported.** `scripts/comment-language.mjs` walks code with a mode
stack: strings, template literals with their interpolations, regexes, and a shebang consumed before the loop
so the interpreter path's `/` is never offered to the regex branch. Regex-versus-division is the only
heuristic, and it is exact in the direction that matters -- after an identifier, a number, a string, a
template, a regex, `)` or `]` a `/` divides -- because a regex read as a division costs one character and the
comment after it survives, while a division read as a regex swallows everything to the next `/`. The
threshold and the code-span rule are **imported** from the document reader rather than restated: one run of
eight, one definition of a citation, two subjects. A second copy would be the third-source-of-truth defect
`validity.test.ts` names, and no test could catch it.

**The measurement, and the witness.** 462 files, **23 768** comments (19 838 line, 3 930 block), **0** runs
of Han prose outside a code span. The six files in this tree that carry Han characters are all citations --
a Chinese file name in a code span, a quoted query, a quoted table cell -- which is the real-corpus half of
the evidence and the part a fixture cannot supply. The census carries the instrument's own witness beside the
verdict: **331** comment openers skipped inside a string, a template or a regex. A reader that stopped
telling a string from a comment would still report zero violations, on a tree with fewer comments than it
has; the number that moves when it breaks is this one, and a test holds it above a floor.

**The agreement that is not a tautology.** A predicate that knows nothing about strings -- every line whose
first characters are `//` must be recorded as a comment on that line -- is a different instrument, so its
agreement with the scanner over the whole tree is evidence: **19 741** line openers and **3 930** block
openers, **0** lost. The predicate has exactly two shapes that would make it wrong rather than the scanner, a
template whose line begins `//` and a line inside a block that begins `//`; both are written into the test
with the repair each would need, because the one repair that would hide a scanner that stopped recording what
it read is deleting the assertion.

**What the gate is worth.** One exit and two scripts -- the verdict and the scanner behind it, the second of
which has no exit at all -- so `derive-gate-sites` moves to **142 failure sites across 66 of 94 scripts**, the
call tally to **160**, and the battery to **227 claims across 65 files**, because a claim is a site credited
to the proving test file. `docs:check` is twenty steps. Eighteen tests: fourteen drive the gate over a
throwaway tree, four read the real one, and the census cannot collapse silently -- the floors are on files,
comments and skipped openers, so a reader that stopped walking half the tree fails a test rather than
publishing a smaller number as a pass.

**What is not closed.** Two boundaries, both stated rather than hidden. The **workflow files** are not read: a
`#` in YAML is three grammars plus the block scalars that hold shell, so it needs the YAML scanner rather than
this one, and the five files hold **1 172** `#` marks with **no** Han character between them -- measured
before deciding, and the reader is the entry that replaces this one. And a **run broken by a line break** is
not a run: each line of a comment is judged on its own, which is what the document reader does, so a comment
wrapped mid-run in a narrow column evades both. That is one boundary shared by two readers rather than two
boundaries, and fixing it means deciding whether a paragraph is a unit -- which changes the document reader
too, and is why it is a round rather than a paragraph. Also stated: the shebang branch is the one piece of
state whose removal no fixture catches, because no shebang in this tree puts anything after the interpreter
path that a scanner would misread. It is kept and named rather than tested, and that asymmetry is the honest
part of the table.

## Finding 549 — the last prose surface had no reader, and the scanner's own census found twelve comments it was counting as content

`comment-language.mjs` reads every `.ts`, `.mts`, `.cts`, `.mjs`, `.cjs` and `.js` file in the tree, and its
header ends with the boundary it could not cross: a `#` in YAML is not one grammar but several, so the five
workflow files were left to reviewers. Those five files are where this repository writes down *why*: why a step
exists, which run a budget number came from, which failure earned a job split. **1 172 rows carry a `#` and not
one of them carried a Han character** -- so the rule cost nothing, and the reader is the only thing that would
keep it that way.

**The digit was a line count.** The entry on the Open list said 1 172 marks; measured by character, the files
hold **1 215**. The five in-row marks are the whole population, and all five are the same shape: a double-quoted
shell string inside a `run: |` -- `${#selected}` and four `echo "### …"` lines. Three quoted scalars reach the
top level at all (`default: ''` and two `cron:` schedules). A reader that confused the two shapes would have
printed a sentence about a shell string, which is finding 545 and 547's shape with a different delimiter.

**Four grammars, not three.** The plain scalar (a `#` opens a comment only after whitespace or a row start, so
`foo#bar` is a value), the single-quoted scalar (`''` is the escape), the double-quoted scalar (`\` is the
escape, and the scalar may continue on the next row), and the block scalar, whose rows are content in a language
YAML does not name. The fourth is where 1 167 of the comments live, and a reader that treated a block as opaque
would have missed nearly all the prose the round was written for.

**The census found a bug in the reader that wrote it.** Two readings are taken over every file: every `#` is
classified into exactly one of four buckets whose counts must sum to the file's `#` characters, and every row
whose first non-blank character is a `#` must be recorded as a comment. The first finished run reported **1 155**
comments and **25** block-row marks; the tree has 13 of the latter. The twelve that were missing are comments in
`official-data.yml` (rows 308-314 and 467-471) indented **deeper** than their block's first row, and the reader
measured the `#` from the block's column instead of the row's:

```
      # No cause is named here on purpose. Every status the script documents
```

That is a comment, and it was counted as content -- on a green run, because the file is English. Had it been
Chinese, the reader that exists to catch it was the reader that had already stopped reading there. The repair is
one column (`body.slice(lead)` rather than `body.slice(block.indent)`), and after it the two readings agree at
**1 167** comments and **13** marks.

**Six falsifications, and one of them proved nothing.** Each piece of scanner state was removed and the fixture
holding it was watched: quote state (4 tests red), block state (5), the row's own indentation (3), the block's
end (2), the doubled quote (1). The sixth -- "every quote opens a scalar" -- left its fixture **passing**, because
that fixture sat inside a `run: |` block: the block branch had already taken the row, so the quote logic never
ran. The test asserted something about a path it could not reach, which is the shape this log keeps finding in
gates. It was replaced with a plain scalar carrying an apostrophe glued to a word (`the runner's cache`, taken
from `anchor-roundtrip.yml`), which does go red under the mutation and takes the real tree red with it.

**The measurement.** Six files, 1 215 `#` characters, **1 167** comments (979 line, 188 block scalar), **0** runs
of Han prose outside a code span, 13 marks inside a block scalar's row, 0 inside a quoted scalar, 0 glued to a
word. The row predicate is the second instrument and it agrees: 1 167 rows begin with a `#`, 1 167 comments were
read, **0** lost.

**What the gate is worth.** One exit and two scripts, so `derive-gate-sites` moves to **143 failure sites across
67 of 96 scripts**, the call tally to **161**, the battery to **228 claims across 66 files**, and `docs:check` to
twenty-one steps. Twenty-three tests: nineteen drive the gate over a throwaway tree and four read the real one,
with floors (`comments > 1 000`, `marks > 1 200`) taken below this round's readings so a reader that stopped
walking fails rather than publishing a smaller number as a pass.

**What is not closed.** The 13 in-row marks are declined rather than read: `echo hi  # why` and `echo "a # b"`
are the same bytes to YAML, and telling them apart needs the language the block holds. And a run broken by a
line break still evades all three readers -- the document reader, the comment reader and this one -- which is one
boundary in three places rather than three boundaries, and closing it costs a decision about what a paragraph is
before it costs a line of code.

## Finding 550 — three language readers judged a row, so a wrapped sentence was two citations, and the first fixture for the rule proved nothing

The Open list carried it in the words of the reader that could not cross it: *a run broken by a line break
evades all three language readers*. `docs-language.mjs` judged a row, `comment-language.mjs` judged a comment's
row, `yaml-language.mjs` judged a comment row -- so a sentence wrapped in a narrow column, a Chinese paragraph
hard-wrapped at eighty characters, and a `#` comment continued on the next row were one sentence to their author
and two citations to the rule. The entry said the cost was a decision before it was a line of code, and it was
right.

**Measured before the rule was written, twice.** First with each row stripped the way the readers strip it, then
on the raw bytes in case the material was hiding inside a citation: **0** row breaks in this repository fall
between two Han characters, and the longest run that could have been built across any break is zero characters.
Every Han character in the tree is a short citation inside backticks and not one of them is wrapped. The
consequence is stated rather than worked around -- **the widening costs nothing today and its entire proof is in
the fixtures**, because the tree cannot carry it. What the tree carries is 68 891 row breaks that were held
inside a paragraph (**37 694** documents, **30 389** comments, **808** workflow) and **0** of them a crossing.
That number is reported because a grouper that flushed at every row would find the same runs and cross nothing,
which reads exactly like a tree with nothing to cross; each reader now carries a floor under it.

**The decision.** A paragraph is what the surface says it is: a markdown paragraph ends at a blank row, a
heading, a fence and a block quote; a comment's paragraph ends at a blank row -- which in a doc block is a row
carrying nothing but its ` *` -- and at the terminator that ends it; and two comments continue each other when
they sit on consecutive rows in the same column of the same delimiter. Two rows of one paragraph are joined with
**nothing** between them, and that is the rule rather than an approximation of it: a run of eight Han characters
needs Han on both sides of every break it crosses, so a break with anything else on either side cannot be crossed
under either formulation. `check-comments-language.test.ts` states that as an experiment -- 400 seeded sequences
compared against a reference that decides each break on its own -- and asserts that at least 50 of the runs it
compared actually crossed a break.

**Three defects came out of the fixtures for the rule beside them.**

1. **The space after `//`.** The doc block's decoration is stripped whole, so its rows join cleanly; a line
   comment keeps the space after its delimiter, so `// 文档说明` and `// 第二行` joined as `说明 第二行` -- one
   space in the middle of the break, and the rule never fired in a line comment at all. Both ends of every row
   are now trimmed, because layout is not text.
2. **`kind` meant two different things in the two scanners.** The shared grouper asked whether two comments were
   the same `kind`, which is a wall for the source scanner (a `//` row does not continue a doc block) and
   nonsense for the workflow scanner, where `kind` records *where a `#` was found* rather than what it is. Two
   adjacent `#` rows inside a `run: |` -- one paragraph to their author -- were refused. The repair is a field
   with one meaning: a comment's **family**, its delimiter and the column it opens at, stated by the scanner that
   can see both.
3. **A spread append whose length is a function of the input.** `hits.push(...scanParagraph(part))` survived the
   suite and was named by `spread-append-guard`, a previous round's instrument. Four sites, now `for` loops.

**Twelve falsifications, one of which proved nothing.** Each piece of the new state was removed and its fixtures
watched: the join (9 red), the left-hand trim (4), the whole trim (4), the blank row's flush (2), a heading being
its own paragraph (1), the block quote's flush (1), the fence's flush (1), joining at all (6), the family test
(6), the blank row inside a block comment (1), the source family's column (3), the workflow family's column (1).
**The block quote's flush came back green at first and the fixture was wrong, not the code**: it put the quote
after a blank row, so the paragraph had already ended by another rule and the flush under test was unreachable --
the same shape as finding 549's sixth falsification, an assertion about a path it cannot take. Rebuilt with prose
on both sides and no blank row, it goes red. While rebuilding it, one more thing surfaced: a heading was pushed
*into* the paragraph and flushed afterwards, which cannot produce a run (its own `## ` is not Han) but did put a
break in the witness that no run can cross. A heading is now judged as a paragraph of one.

**What is still not read.** A hard break written as a trailing backslash: the backslash sits between the two
characters of the run, so the join does not cross it, and closing it would apply a markdown rule to comments as
well -- it is on the Open list with that cost. A code span or a fence broken across rows leaves its contents in
"prose", which is a false positive rather than a silence. And the in-row `#` inside a block scalar is unchanged
from finding 549: 13 marks, all shell strings, and telling one from a shell comment needs the language the block
holds.

**The measurement.** 22 new tests (5 documents, 10 comments, 7 workflow, one of which is the 400-case property);
suite **6 446 -> 6 468** in `core` and **187** in `cli`; coverage unchanged at **99.97 / 99.95 / 100 / 99.97**
and **100 / 100 / 100 / 100**, because the new code is in `scripts/`; gate sites **143 / 67 of 96** and the
battery **228 claims across 66 files** unchanged, since this round added no gate and no exit.

## Finding 551 — a hard break written with a backslash was one paragraph to CommonMark and two to this reader

The Open list had carried this as a decision rather than a defect -- *decide whether a trailing backslash is
punctuation or text* -- because the same byte does two different jobs on two different surfaces. The measurement
says the answer is both, in different places, and the rule is what separates them.

**The defect.** Markdown has two spellings for a break that does not end the paragraph: two or more trailing
spaces, and a trailing backslash. The first was already handled, and by accident rather than by rule: every row is
trimmed at both ends, so the spaces were gone before anything was joined. The second was joined as `…\…` -- a
backslash between the two rows, which no run of Han characters crosses. On a document of two rows of four
characters, `hanProseIn` returned two runs of four and the gate reported two citations; the same two rows written
with two trailing spaces returned one run of eight spanning two rows. One rule, two spellings, two answers.

**The decision, per surface.** A backslash at the end of a row is punctuation on the markdown surface -- the
renderer consumes it and breaks the line -- and text everywhere else: a JavaScript, shell or YAML comment has no
renderer between the bytes and the reader, so `// …\` ends in a backslash and that backslash stands between the
two rows exactly as any other character does. The rule therefore lives in a `markdownRowOf` that only the document
reader calls; `textRowOf` is what the two comment readers call and it does not know the marker exists. The entry
asked for one decision and three readers; it is two decisions, because the surfaces disagree, and the disagreement
is the finding.

**How narrow the marker is.** Exactly one backslash, and not itself escaped. `\\` at the end of a row is one
literal backslash after parsing and it does stay between the rows; three or more leaves an escaped pair behind, so
a literal backslash is still in the text; and `\ ` is a backslash followed by a space, which CommonMark does not
read as a break at all. The last one forces the order of operations: the marker is looked for **before** the row is
trimmed, because trimming first turns `\ ` into `\` and reads a break nobody wrote -- the direction every
approximation in these readers is chosen against.

**What is not a question.** A backslash anywhere else in a row needs no rule, and that is an argument rather than
an omission: an escape removes one backslash and leaves the character it escaped, which is a character. `\*`
renders as `*`, and `*` stands between two Han runs exactly as `\*` did. Only a row's last backslash has nothing
after it, which is why only that one is a question about punctuation.

**The measurement.** One row in this tree ends in a backslash after its spans are removed --
`docs/progress/volume-10.md:1098` -- and it is not a marker: it is a fragment left behind by removing a code span,
which is finding 552's subject. **Zero** rows are a hard break, so the rule costs nothing today and its whole proof
is in the fixtures. They are a table rather than a sample: the backslash run is 1, 2, 3 or 4 long and the row
either ends there or holds one more space, all eight shapes asserted, each in the direction that costs something --
one fixture that must go red, one that must stay green -- plus the two-space form as an equality rather than a
second claim.

**Where the two repairs meet.** That fragment is the one place the two rules touch, and it shows why the order of
the two operations is part of the rule. With the gap finding 552 leaves, the byte after the fragment is a space, so
the marker pattern -- looked for before the trim -- does not match and the row keeps a backslash that is text.
Without the gap the fragment is the row's last byte and the byte before it is `)`, which is not a backslash, so the
same pattern would consume it as punctuation. Both halves are asserted: `withoutCodeSpans` returns the gap, and
`markdownRowOf` looks for the marker before it trims.

**Six falsifications, twenty-two red.** The strip removed: 5. A strip that ignores the preceding byte (`/\\+$/`):
4, and those four are the escaped pair, the three-backslash form, the four-backslash form and the table. The strip
placed after the trim: 5, because `/\\+$/` applied there also eats the escaped pairs. The markdown rule moved into
`textRowOf`: 2, one in each comment reader -- the mirror image of the markdown fixture, on the surface where the
same bytes mean text. A gap after every span: 2. No gap at all: 4. **One of the seven attempts proved nothing**:
the first version of the second mutation replaced with `'$1'` a pattern that has no capture group, so the row
became `…$1` and the tests went red for a reason that had nothing to do with the rule; replaced with `/\\+$/`,
which is the wrong reader a person would actually write, and the four that should fail do.

## Finding 552 — a quotation removed outright joined the two halves of the word around it

**The shape.** `withoutCodeSpans` deletes a code span and returns what is left. That is what its name says, and it
was what its three callers wanted until the span stopped being at the edge of a row: four Han characters, a
citation, four more is a row of two citations, and deleting the citation outright left eight characters in
succession, which the search read as one run of prose.

Nothing in that row is written in Chinese. The join was fabricated by the reader, and this file's header says
every join it makes is one a reader could defend -- a removal that lets two words touch is not.

**The repair.** A removal leaves a gap. A quotation is not a word, so it does not let the words on its two sides
meet -- the same sentence the paragraph rule states from the other end: what is not text cannot be crossed by a
run. The gap is inserted only where the byte before the span is not already whitespace, so `a `b` c` returns the
two spaces it returned before this rule existed and the fixture that pins that shape still pins it. A row holding
nothing but a span still comes back blank, because a blank row is how all three surfaces say "new paragraph" and
a citation must not turn a boundary into a line.

**The measurement.** **965** spans in **873** rows of this tree have a non-whitespace byte on both sides, and
**0** of them have Han on both sides, so this rule costs nothing today either. What the number does say is that
the shape is ordinary rather than exotic -- the neighbours are `(` and `)`, `[` and `]`, `/` and `,` -- which is
why the condition is stated on whitespace rather than on Han: a rule keyed to the character the reader is looking
for would be a rule that only works on the language it was written for.

**Two falsifications.** No gap: 4 red, one in each reader that shares the function plus the two fixtures that pin
the glued shape. A gap after every span, whitespace or not: 2 red, one of which is the span-delimiter fixture that
predates this round.

**What it does not fix.** A code span or a fence broken across rows still leaves its contents in "prose", which is
the false positive finding 550 recorded and left open. This finding is about the two bytes beside a span, not
about a span that fails to close on its row.

**The measurement for both.** 16 new tests (13 documents, 2 comments, 1 workflow); suite **6 468 -> 6 484** in
`core`, **187** in `cli`, **6 655 -> 6 671** across the repository; coverage unchanged at **99.97 / 99.95 / 100 /
99.97** and **100 / 100 / 100 / 100**, because both rules are in `scripts/`, which the four dimensions do not
measure; gate sites **143 / 67 of 96** and the battery **228 claims across 66 files** unchanged, since this round
added no gate and no exit; `docs:check` still 21 steps.

## Finding 553 — the artifact published a level the corpus calls a judgement, and the floor under it never left the repository

**The shape.** Two contracts publish an easy/medium/hard word for a case's IR level: `cloud-opsbench` calls it
`difficulty` and `itbench` calls it `scenario_complexity`. Both were `difficultyFor(FaultCase.difficulty)` -- the
level the case's author wrote. `docs/data-model.md` says what that field is: a **claim**, permitted above the
structural floor because a case can be hard to *detect* while easy to trace, and refused above it unless the case
says what the floor cannot see. Six of the corpus's thirty-four cases carry that sentence, and one of them,
`history-config-rate-cache-ttl-pricing`, claims `L4` -- the level every other holder reaches with three causal
steps -- over a chain of **one**.

So the artifact said `hard` for a case whose own structure supports `medium`. Both exporters were
self-consistent, which is why nothing noticed: every field a reader could compare agreed with every other field
in the same file, and the fact that the level was an opinion lived in a different module. A consumer comparing
corpora by difficulty was reading six judgements among twenty-eight measurements with no way to tell one from
the other.

**Why the note did not travel, and why the floor can.** `assembleBundle` deliberately drops `difficultyNote`: it
names what the chain cannot see -- a setting changed days before the window, an exception that closed a
connection rather than nacking the message -- which is a paragraph of the answer. The floor is not that. It is a
lower bound derived from the causal chain, and the file it lands in already carries the answer: `metadata.json`
holds the `result` triple and `scenario.json` holds `scenario_groundtruth.diagnosis`. A coarse bound on how deep
the chain is tells a reader of those two files nothing they cannot read two keys away, and in a valid corpus it
can only *lower* what the claim suggests, because a level below its floor is refused as a shortfall before
anything is exported.

**The repair.** A second key beside the claim, in the same three words, produced by one function.
`projectDifficulty` takes the case and the graph and returns both words; each exporter reads the pair off one
object. Pairing a claim with a floor by hand in `cloudopsbench.ts` and `itbench.ts` would be the third-source
defect `export/difficulty.ts` was created to remove -- that module's header argues the point about the word, and
the argument is the same one level up.

The graph is a required parameter and not an optional one, which is the smaller half of the design: a floor
computed over an empty graph is `L1` for every case, because breadth is a count of entity kinds resolved through
the index. A wrong answer wearing the shape of a conservative one is the failure this repository has the least
defence against, so the signature refuses to make it convenient.

**The measurement.** Thirty-four shipped cases, level read against floor:

| declared | floor | cases |
| --- | --- | --- |
| `L1` | `L1` | 2 |
| `L2` | `L1` | 2 |
| `L2` | `L2` | 8 |
| `L3` | `L2` | 3 |
| `L3` | `L3` | 13 |
| `L4` | `L2` | 1 |
| `L4` | `L4` | 5 |

**Six** pairs differ, **zero** cases state no level, and **zero** claim below their floor -- the last of those is
the property that makes the second word readable rather than a contradiction. The example bundle is itself a
witness: its one case states `L2` over a one-step chain, so the verified block in
`docs/targets/cloud-opsbench.md` now prints `"difficulty": "medium"` beside `"difficulty_floor": "easy"`, which is
the defect visible in the contract page rather than only in a corpus file.

**Eight falsifications, 125 red.** The floor taken from the claim instead of the chain (13); the floor read
through an empty graph rather than the one passed in (5); the two words swapped (28); `cloud-opsbench` dropping
the key (7); `itbench` dropping it (5); the IR level published instead of a projected word (40); the claim
replaced by the floor in both exporters (25); and the structure checks accepting any present floor word (2). No
mutation survived, and the last one is why the field is not merely emitted: a word outside the three is refused
wherever it appears.

**The asymmetry the checks carry.** `difficulty_floor` and `scenario_complexity_floor` are extensions to two
upstream contracts, so the structure checks hold a present word to the vocabulary and **do not demand the key**.
That is not leniency about this repository's own exports -- it is the difference between a statement about
validity and a statement about provenance: a `metadata.json` the benchmark itself produced carries no such key,
and a check that demanded one would score the reference corpus as malformed. The cost is stated rather than
hidden: the shape check cannot notice an exporter that stopped emitting the pair, so the emission is pinned by
the exporter's own tests and by the generated contract page instead.

**What it does not fix.** A case that states no level publishes the documented `unset -> medium` row beside a
floor that may outrank it -- a three-step chain with no label prints `medium` beside `hard` -- and nothing
refuses that pair. The corpus offers no witness (0 of 34), so the repair would be a rule whose only failure is
synthetic, which is the shape this list has learned to distrust. Recorded as an open entry rather than written.

## Finding 554 — the paragraph that argues against restating a count restated it, and this round moved the number

**The shape.** `docs/progress.md`'s L3 entry explains, at length, why the export-surface figures stopped being written
in prose: pass 13 found the same three literals drifted three different ways across the test file's comment, the entry
itself and the L3 row, so the test now points at the list instead of quoting it. The next sentence then did the thing
the paragraph had just finished forbidding -- "at this revision the list holds **47 modules** and **538 runtime
exports**" -- and nothing read it.

**How it was found.** Not by a gate. v3.102 added one export (`projectDifficulty`) and the enumeration suite went red
because the name was not in `TESTED`; adding it moved the surface from 538 to 539, and the prose that states 538 kept
saying 538 while every gate stayed green. The number was stale within the round that changed it, which is the whole
cost of a count with no reader: it does not fail, it ages.

**The repair.** The sentence no longer states either count. It says the counts are the list's own and names the round
that made the restatement visible, which is the same repair the test file took in pass 13 and for the same reason -- a
pointer cannot disagree with the thing it points at.

**What it does not fix.** The exemption count in the following clause (**37**, two of them runtime) is a number of the
same kind with the same absence of a reader. It is left because it has not moved since the pass that took it, and a
repair that anticipates drift is not a repair this list has a witness for.

## Finding 555 — the count that defended the length rule was a count of cases, and it was three short

**The shape.** `fault.parameters` states a case's own facts, and the corpus writes seventeen of them in a
unit of time. One of those is the fault's own length -- `burstMinutes: 6`, `splitDurationMinutes: 17`,
`durationMinutes: 120` -- and the rest are settings the case ran under: `terminationGracePeriodSeconds`,
`retentionGapHours`, `readyAfterSeconds`, `keysIntervalSeconds`. Every reader in the tree sees one shape:
a number and a unit of time, and `util/unit.ts` answers `isConvertible(unit, 's')` the same way for all
seventeen.

**The number.** `docs/data-model.md` defended the rule that separated them with a count: *the corpus
carries **fourteen** time-valued parameters and **five** of them are the episode -- the other nine are
knobs*. Measured at v3.103 with the reader this round writes: **seventeen** parameters, across **fifteen**
cases, of which **five** state the episode and **twelve** name a knob. Fourteen was the number of
**cases** -- the one unit a reader would not have chosen, since the sentence's own arithmetic, fourteen
minus five is nine, only works if the fourteen are parameters. The three that were missing are one case's
two time-valued parameters and one case's single one (`history-config-ingress-timeout-partner-portal`
declares `upstreamReadTimeout` and `previousUpstreamReadTimeout`; `history-runtime-pod-shutdown-webhook-dispatcher`
declares the grace period and the drain). A sentence whose subject is a record of a dozen keys was counting
the records.

**Why it survived.** Nothing read it. The count was prose in the one document that publishes the
vocabulary, and the guard printed a different number in a different unit (`5 named as the length of their
episode`, cases) on every run -- so the two numbers never met. This is the campaign's recurring shape: a
number that defends a rule, measured over a unit nobody stated, and read by nothing.

**The repair is not the number.** Correcting fourteen to seventeen would leave the same sentence in the
same place with one more digit. The repair is that the parameters now answer, so the count is taken by the
gate: `check-fault-cases` prints `lengths 17 time-valued parameter(s): 5 state the episode, 12 name a
knob, 0 say neither`, and the three add up by construction -- the episode count is the number of parameters
that carry the word, the knob count is the number that carry the other, and the third number is what is
left. The document's own sentence carries the same three numbers and says where fourteen came from.

## Finding 556 — the answer to "which length is this" was a field a case could delete, and the deletion was printed as a reading

**The shape.** The question "which of these seventeen numbers is how long the fault lasted" was answered by
`fault.durationParameter`: one string naming one key. It was optional on purpose -- a case may hold only
knobs, and demanding a length from a case that has none would be a rule about the annotation's vocabulary
-- and the guard's response to its absence was to print how many cases had answered. `5 named as the
length of their episode`. Nothing printed the twelve that had said nothing, and nothing could: a case that
deleted the field was indistinguishable from a case that had never had a length.

**The falsification, read off the code and the corpus rather than run.** With the field absent,
`readDurationClaim` returned `{ parameter: null, episode: null, fault: null }` -- the shape of the field it was handed, before this round renamed the measurement -- and the guard pushed nothing;
the only other reader of that key is the notes rule, which treats it as spoken for exactly while it is named
as the length. Four of the five cases also cite the key from a configuration checkpoint, so deleting the
field leaves them **green** and the run printing four. The fifth, `history-dependency-upstream-5xx-pricing`,
cites `durationMinutes` nowhere else, so it would turn red -- for a missing note, which is the neighbouring
rule catching an accident on its way past, and not the length rule being answered. The defect is not that the
field was optional: it is that its absence was reported as a **reading**, which is the shape
`fault/parameter-notes.ts` was written against one field over, where the silence of an undocumented key is
refused rather than counted.

**The repair.** The answer moves onto the parameter it describes. A quantity in a unit of time carries
`role: "episode"` or `role: "knob"`, the vocabulary is a two-member tuple (`PARAMETER_ROLES`) that the
reader admits a value against, and a length that says neither is refused by name -- so the way to silence
the rule is closed rather than counted. The field itself is gone rather than kept beside the word, because
two statements of one fact are two that drift: the same reasoning that removed a reading which carried both
a value and a parameter (`readDeclaredReading`). A file that still writes `durationParameter` is refused
where it is written, by name.

**What the vocabulary costs.** The three refusals that belonged to a name -- not a name at all, a name the
case does not declare, a name whose value is not a time -- are gone with the name: there is nothing left to
spell wrongly. In their place is one refusal no name field could make, `role-without-time`, which is what a
role on a `count` or a `%` is. Four refusals became three plus one, and the one that arrived is the one
that closes the silence.

**What it does not fix.** A case whose parameters hold no length at all is still not refused, and that is
the deliberate half: it makes no claim. The asymmetry is now visible in the run's own line rather than in a
sentence about the rule -- `0 time-valued parameter(s)` is printed, so a case that lost its lengths
entirely is a corpus fact a reader can see, and `fault/parameter-role.ts` refuses only the case that holds
a length and declines to say what it is.

## Finding 557 — the gate that compared a test's cost with its budget read the wrong budget, in both directions

**The shape.** `check-test-budgets.mjs` asked every file one question: how long did your slowest test take,
against what did you declare? The declaration it read was the one a `describe` states, and only when a file
stated none did the file's largest number stand in. The four spellings it knew for the *discovery* rule --
`const … _MS`, an options literal, an options name, a positional number -- were not applied to the *fraction*
rule: `it('…', () => { … }, 120_000)` states a budget for one test, and `ingest-report.test.ts` writes exactly
that for the two tests that ingest 130 000 rows, while its suite states 30 000 for the ten beside them that
take 31 ms. In vitest a test-level timeout replaces the suite's, so those two tests never ran under 30 000 at
all. The reader knew a spelling existed and did not read it -- the failure mode this file's four spellings
were built to prevent, one level up.

**The falsification, from a run rather than from reading.** CI run 43944379177:

    check-test-budgets: ingest-report.test.ts: its slowest test takes 15199 ms against a stated budget of
    30000 ms, which is 0.51 of it; the rule asks for 2x

The number the test states for itself is 120 000, so the truth was 0.13 -- 7.9x of headroom -- and the build
went red on a file that could not go red for the reason printed. Nothing about the measurement was wrong; the
denominator was a number the test had already replaced. Reproduced here without CI by setting that
assertion's duration to 15 199 in the report read from the local coverage run: one problem before the repair,
`OK` after it.

**The repair.** The denominator is the budget in force where the test is written: the timeout the test states
itself, then the one its suite states, then the file's largest stated number, then nothing. `testBudgets`
reads the two spellings that attach to a test (positional, and an options object that *starts* the argument)
and associates each with the title the report prints -- which is the test's ancestors and its title joined by
spaces, so the match is a suffix, longest title first, and a title written twice answers with the smaller of
its two numbers. `budgetInForce` returns `{ ms, statedBy }` rather than a number, and the failure sentence
names the declaration it read -- *the one that test states*, *the one its suite states*, *the largest number
the file states* -- because a reader who disagrees with a verdict needs to know which line to argue with. The
summary line counts the files judged by their slowest test's own number -- **11 of 44** in the run this round
published and **12** in the run before it, because which test is slowest moves with the load. The stable number
is structural: **13 of 250** test files state a budget on a test, **52** tests in all.

**It is a repair and not a relaxation, in one measurement.** A test that states 10 000 inside a suite that
states 60 000 was invisible before: 6 000 ms read as 0.10 of the wrong clock. It is 0.60 of the clock it runs
under, and that is now the first thing the rule sees. The new direction has a test of its own, and the CI case
has one too, so neither half of the pair can be reverted without the other going red.

**What the reader had to give up to read a position.** The scanner now blanks rather than removes: comments
and the bodies of string and regex literals become spaces at the same length, with the quote characters kept.
It had to become positional because a title is read out of the *file*, not out of the stripped copy, and an
offset in a text whose comments are gone is not an offset in the source. Keeping the quotes keeps the
last-significant-character rule exactly as it was -- a `/` after a string is still a division -- and the two
readers that existed before were compared against the old scanner over **250** test files: **0** differences
in suite budgets, **0** in stated budgets, so the change moved offsets and nothing else.

**What it refuses to guess.** An options object is read only when the argument begins with `{`:
`typecheck-entrypoint.test.ts` calls `spawnSync(cmd, args, { timeout: RUN_TIMEOUT_MS })` inside a test body,
and a reader that took the first `timeout:` in the argument list would hand that test a 180-second budget it
never asked for -- the flattering direction. A title `it.each` formats is not matched against the printed
title, so such a test falls back to its suite's number: the strict direction, which is loud, rather than the
quiet one.

**What it does not fix.** The rule still cannot tell a budget raised because CI failed from one raised because
the test earns it; the number and the prose that justifies it live in the same file, and only one of them is
prose. What it can do is name the declaration it read, which is the difference between a verdict a reader can
check and one they can only trust.

## Finding 558 — the gate's scanner ended a pattern at the first slash, and only the copy knew better

**The shape.** `check-test-budgets.mjs` says of itself that "the scanner is the one `test/timeout-budget.test.ts`
documents". That was true of its intentions and false of its code. The document's scanner had tracked
**character classes** since the repair that added its fourth mode (`/['"]/` holds a quotation, and reading it as
the start of a string swallowed the rest of the file). The gate's `literalEnd` took the first unescaped `/` no
matter what came before it, so in `/[/"]/` the pattern ended inside the brackets and the `"]/` that followed was
read as code -- and the quotation there opened a string that ran to the next quotation in the file, swallowing
every budget below it.

**The falsification, from the tree and then from a fixture.** Eight patterns in the 467 tracked code files hold
a slash inside a class -- `[^/]` in `test/run.test.ts`, `[-_./]` in `src/gates/gates.ts`, a star-and-slash class
in `check-no-absolute-paths.mjs`, and five more -- and **not one of them sits above a stated budget**, so both
scanners returned the same three readings for all 467 files. The drift was invisible because the tree never
combines the shape with the thing the reading is for. A synthetic source in the shape the document names:

    const EITHER = /[/'"]/;
    const SUITE_BUDGET_MS = 30_000;
    describe('a suite', { timeout: SUITE_BUDGET_MS }, () => { it('a test', () => {}); });

printed `its slowest test takes 16500 ms and the file states no budget, so its verdict is decided by vitest's
5000 ms default; state one on the suite` -- a false red, in the failing sentence, telling a file that declared
30 000 ms to declare a budget. It is the exact false red the other copy had already been repaired for, and the
copy that CI runs was the one that had not.

**The repair.** `literalEnd` tracks the class for a pattern only -- a bracket inside a string is text, and a `/`
inside a string is text too, which is why the terminator test keeps its guard. Classes are entered on `[` and
left on `]` with the escape skip inside the loop, which is the same three lines the document's scanner has. The
fix changes **no reading on this tree** (0 of 467 files, measured before and after), which is what a repair to a
latent defect should do, and the fixture above is now a test that fails without it.

## Finding 559 — a number in an argument list was read as a budget, and ten files "declared" one

**The shape.** The fourth spelling a budget can be written in is positional: `it('a test', () => {}, 120_000)`.
It was read with `/, <number>)/`, a *shape* that also matches an ordinary call. `buildAnthropicRequest('p',
'claude-3-opus-latest', 8192)`, `Math.imul(state, 1664525)` and a timestamp written as `1700000000` all match
it, and the reader dropped only numbers under a thousand -- so the four-digit arguments were the ones it
invented budgets from.

**The falsification, in two directions.** Eleven of the 259 test files were read as stating a budget. Ten of
them stated nothing else, so `budgetInForce` answered `{ ms: 1700000000, statedBy: 'largest' }` for
`gen-rcaeval-cases.test.ts` -- nineteen days of headroom -- and the **floor rule did not fire for any of the
ten**, because a file that "declares" a budget is not asked to declare one. Nothing was green or red wrongly on
the day: every invented number is larger than the slowest test beside it, and all ten slowest tests are under
1 000 ms. One three-second test in any of them would have been enough. The stronger falsification is that the
file's own test named the right rule and pinned the wrong fixture: `does not mistake an ordinary numeric
argument for a budget` asserted `f(x, 2)` and `slice(a, 3)`, both of which the `>= 1000` filter had already
excluded, so the test passed for a reason it did not state. Adding `8192` and `1664525` to it turned it red.

**The repair.** The positional spelling is read by `testBudgets`, which finds it **inside a test call** and can
therefore tell a timeout from an argument; `statedBudgets` composes that instead of matching the shape. The
count of files that state a budget fell **44 → 34**, and the reading that decides a verdict changed for **10 of
259** files, every one from a number the file never wrote to none. Nine more keep a real declaration and lose
only the invented ones.

## Finding 560 — the kept quotes had no reader, so v3.104's survivor proved nothing anywhere

**The shape.** v3.104's scanner blanked the bodies of literals and kept the two characters that delimit them,
with a paragraph explaining why: "the last-significant-character rule reads them: a `/` after a string is a
division". The same round replaced that rule's implementation -- it now carries `last` and `word` as it scans
instead of rescanning its own output -- and the new form reads the **source**, not the emitted text. From that
commit on, nothing read the quotes. The paragraph described the previous scanner.

**The falsification.** v3.104 ran six mutations and reported one survivor: *the quotes are blanked with the
literals*, 0 red, explained as "no file in this tree divides by a string". The explanation was too kind. The
mutation returned identical readings for every one of 467 code files **and identical verdicts on the 259 files
of the real run**, because the emitted quotes feed no reader at all. A census of the separating shape puts the
tree at **0** files with a `/` after a closed literal, which is why the fixture that would have caught it did
not exist; but the census is a second reason, not the first.

**The repair.** The literal is blanked whole, quotes included, and the paragraph is replaced by the rule as it
is implemented. The rule itself survives and now has the test it lacked: the file is never compiled -- it is
input to a lexer, and at the token level `"a" / 2` is a division -- so the fixture is `const ratio = "a" / 2;`
with a budget below it, and the mutation that stops noting the delimiter turns it red.

**What it costs.** v3.104's open item ("the scanner's fidelity to the quote characters is a claim no test can
prove") closes by deletion rather than by proof: there was no fidelity to prove.

## Finding 561 — one rule, two copies, and a meta-gate that says the copy cannot be the gate

**The shape.** Findings 558, 559 and 560 are one defect seen three times. The rule for "what a test file states
about its own clock" lived in two files: `scripts/check-test-budgets.mjs`, which CI runs, and
`test/timeout-budget.test.ts`, which documents it. They agreed on every file in the tree and disagreed on what
the rule was -- one tracked character classes, the other did not; both invented budgets from argument lists,
and the repair for that landed in one before the other. The document's header said the two were the same
scanner, which is a claim no reader can check without doing the comparison, and the comparison is what found
558.

**Why the copy existed.** Because a gate may not be imported by a test: `verify-gates-are-testable.mjs` proves
a gate by **emptying** it and requiring the suite to go red *and to name a failing test*, which an imported gate
makes impossible (`UNATTRIBUTED`). `scripts-are-classified.test.ts` states that rule with a reader, and it is
what refused the first attempt at this repair -- a plain `import … from 'scripts/check-test-budgets.mjs'` in the
test file, reported in under a second with the remedy in the message: *move the reading into a data module and
leave the verdict in the gate*.

**The repair.** `scripts/budget-readings.mjs` is that module: the scanner, the four spellings, `budgetInForce`
and the sentences that name a declaration. The gate imports it and keeps the verdict; `timeout-budget.test.ts`
imports it and keeps the rule; **179 lines** left the test file and **none of them were restated**. The gate's
`main()` also gained the `invokedDirectly` guard the deriver and the doc-counter already carry, without which an
import runs a gate over the test runner's own arguments. The register in `scripts-are-classified.test.ts` has a
row for the module and the reason it exists, and the site inventory moved from **96 to 97** scripts with the
sites unchanged at **143** and the throw statements at **99**.

## Finding 562 — the receipt named the tree the run began on, and nothing asked where it ended

**The shape.** `verify:local` resolves `HEAD^{tree}` **before** the first step, on purpose: "a step that
rewrites the tree cannot change the name it is filed under". The receipt is then filed under that name and the
run prints `a revision of this tree may be published`. Both halves are true about the tree the run *started*
on, and neither is a statement about the one it ended on. A battery that hollows a gate while it measures it
writes into the working tree, a commit made during the run sweeps that file in, and the receipt goes on naming
the earlier tree.

**Measured, on this round.** `scripts/check-official.mjs` came out of a long run with `process.exit(0);` on its
second line -- the meta-gate's hollow form -- and `git add -A` for the round's documentation commit took it
along. The tree that this round would have published had that gate disabled. Three readers disagreed about
whether anything was wrong:

| reader | verdict |
| --- | --- |
| `verify:local` | `OK (35 command(s) covering 48 of the 58 run steps)`, with a receipt for the tree it started on |
| `derive-gate-sites` | **FAILED** -- six exit sites in `check-official.mjs` had moved by one line |
| the suite | **68 tests fail** against the hollow form (measured by re-hollowing it: 2 files, 68 of 94) |

The site inventory is what caught it, and it caught it by accident of arithmetic: the marker is a *line*, and
the inventory fingerprints exits by line. A marker that did not shift a line would have passed every reader
here, and the suite would have caught it only in CI, where the `build` job runs it.

**The repair.** `receiptDecision` takes the tree read *after* the steps and withholds the receipt when it
moved -- the name and the dirtiness both, because a run that ends dirty has measured content that cannot be
pushed either. `verify:local` passes it. The sentence the run prints becomes `receipt: none — the tree moved
while the gate ran -- it started on c29138f and ended with uncommitted changes`, so the claim that would have blessed the
marker is withdrawn at the moment it is made.

**What the repair deliberately does not do.** It does not turn the run red. A new `process.exit(1)` is a new
site in the inventory, and a site is proved by a test that reaches it -- the only way to reach this one from a
test is to rewrite the tree underneath a running gate, which is the thing being refused. A gate that exempts
itself from the rule it enforces is worse than one that prints a sentence a reader can check, and the sentence
is where a pusher looks: the receipt line is the last line of the verdict.

**What it does not fix.** The suite is the reader that names the *file*: 68 red tests say `check-official`
does nothing. Nothing in the local chain runs the suite over a tree it is about to bless -- `verify:local`
runs the coverage step fifth, and the battery that hollows the gate runs eleventh. Two falsifications hold the
new branch: dropping the `ended` comparison turns both withhold tests red, and keeping the dirtiness check
while dropping the name turns one red.

## Finding 563 — the receipt was refused and the verdict still said `OK`, on exit 0

**The shape.** Finding 562 gave `receiptDecision` the tree read *after* the steps, so a run whose tree moved
withholds the receipt. The sentence a reader trusts was not touched: `verify-local.mjs` printed
`verify:local: OK (35 command(s) covering 48 of the 58 run steps in ci.yml; the other 10 need a runner)` and
exited **0**, and the refusal appeared only on the second line, under the word OK. A run that began on one tree,
ended on another, and measured neither reported success twice -- once in the word and once in the code -- and the
one place the refusal was written is the line a pusher skims after seeing `OK`.

**Measured, on the round before this one.** v3.105's documentation commit carried `process.exit(0);` on the
second line of `scripts/check-official.mjs`; `verify:local` printed `OK` with a receipt for the tree it started
on; the exit-site inventory caught the marker only because a line moved six of that file's exits by one; and
**68** tests fail against the hollow form, measured by re-hollowing it. After finding 562 the receipt line read
`receipt: none — the tree moved while the gate ran …` and the verdict above it still read `OK`.

**Why the decision was not enough.** The receipt is a file under `.git`, read by a pusher that is not in this
repository. The verdict is a word and an exit code, read by a human and by `$?`. Finding 562 fixed the third and
left the first two, on the argument that a red run needs a new `process.exit(1)`, a new exit is a new site, and a
site is proved by a test that reaches it. That argument is sound about *new exits* and says nothing about the
one that already exists four lines above: the run's failure exit is reached by any failing step, is proved by
`gate-steps.test.ts`, and can carry a second reason without a second site.

**The repair, in three parts.**

| part | what it is | why there |
| --- | --- | --- |
| `treeMoved({ started, ended })` | the comparison, returning `null` or the sentence | it had two readers from the moment the verdict needed it; a second copy is finding 561 |
| `because: 'starting-tree' \| 'subset' \| 'moved'` | the kind of withholding, machine-readable | `runVerdict` must not parse the sentence -- a wording change would become a behaviour change |
| `runVerdict({ result, decision })` | `{ word: 'OK' \| 'VOID' \| 'FAILED', exit: 0 \| 1 }` | the word and the code are one claim; deciding them apart is how they came to disagree |

`voidReport` prints the block, from the same exit as a failed step. The gate now reads one value twice: the word
it prints on the green path, and the branch it exits through on the void one, so the two cannot disagree without
contradicting the same variable.

**Four boundaries the repair had to state, because each is a wrong answer that looks right.**

| shape | verdict | why |
| --- | --- | --- |
| starts clean, ends clean on another tree | **VOID**, exit 1 | a commit landed mid-run; nothing here is evidence about what would be pushed |
| starts clean, ends dirty | **VOID**, exit 1 | a step wrote to the tree while the gate ran |
| starts dirty, ends dirty | **`OK`**, exit 0, no receipt | that is a developer at work: edit, run, edit. Comparing `state` alone fails every local run |
| a subset run (`--only`) | **`OK`**, exit 0, no receipt | it proves the steps it ran and says nothing about the rest; the verdict line already says so |
| a step failed **and** the tree moved | **FAILED**, exit 1 | the failing step is the actionable fact; the move is a consequence and the withheld receipt is already on stderr |

**What it does not fix, measured rather than argued.** The gate cannot be imported -- `verify-gates-are-testable`
hollows it -- so the wiring from the decision to the verdict is reachable only by a spawn. Replacing the gate's
`runVerdict({ result, decision })` with `runVerdict({ result, decision: { state: 'issue' } })` is **green
everywhere**: 207 tests in the three files that touch this gate, and `derive-gate-sites --check` unchanged, because
the exit is still reached by the failing-step spawn. The only test that could catch it would have to rewrite the
tree underneath a running gate, which is the thing the branch refuses. What *is* proved is the exit (site
`scripts/verify-local.mjs:177`, re-signed and re-measured by `verify-site-proofs`, 228 claims) and every shape of
the rule (nine removals, fifteen reds, below).

**The falsifications.** Nine removals in the module and one in the gate:

| removal | red |
| --- | --- |
| the `VOID` branch in `runVerdict` | **1** |
| a dirty start is not a move | **2** |
| the run wrote to the tree | **2** |
| the tree could not be read afterwards | **1** |
| the receipt quotes `treeMoved` rather than restating it | **3** |
| the kind of withholding the verdict reads (`because: 'moved'`) | **3** |
| the verdict word (`VOID` printed as `OK`) | **1** |
| what the run covered | **1** |
| the sentence the void report quotes | **1** -- after it came back green once |
| the gate's exit code (`process.exit(verdict.exit)` to `process.exit(0)`) | `derive-gate-sites --check` **FAILED**: the site is a zero and leaves the inventory |

The ninth is the round's own instance of the defect it repairs: the void report is assembled from six strings,
five of which had a reader, and deleting the sixth was green. The reporter's whole purpose is that sentence.

## Finding 564 — the gate computed a verdict, and nothing could ask whether it obeyed it

**The shape, in the words v3.106 closed with.** Finding 563 repaired the verdict and ended on a
measurement rather than a claim: replacing the gate's `runVerdict({ result, decision })` with
`runVerdict({ result, decision: { state: 'issue' } })` was **green everywhere** -- 207 tests in the three files
that touch `verify-local.mjs`, and `derive-gate-sites --check` unchanged. That sentence was written down as an
open item, because a survivor that is reported is a debt and a survivor that is explained away is a defect.

**Why neither instrument could ask.** The tree holds two proofs about gates and they cover two different facts.
`golden-master/gate-sites.json` proves that a `process.exit(...)` **exists** and that a named file **reaches**
it. `verify-gates-are-testable.mjs` proves that a gate is **executed** at all, by hollowing it and requiring a
failing test to be named -- and that is also why a gate may not be imported: a module hollowed at import time
crashes the worker, names no test, and the harness reports `UNATTRIBUTED`. Between "an exit exists" and "the
gate runs" sits a third fact that neither asks:

> the value the gate computed is the value it obeyed.

**Why no spawn could reach the branch that consumes it.** The only real run that prints `VOID` is one whose
tree moved while the gate ran. Producing that from a test means rewriting the working tree underneath a running
gate, which is precisely what the branch exists to refuse. So the observation could not be bought with a better
spawn. It had to stop needing a tree.

**The repair: a second source of inputs, and no second close-out.**

`verify-local.mjs` gained `--rehearse <shape>`. A shape names a `result`, a pair of trees, and whether the run
was full; the gate reads those from a table and then executes **the same close-out** it executes for real. The
load-bearing choice is where the decision is computed:

| part | before | after | why it matters |
| --- | --- | --- | --- |
| the close-out | 90 lines inside `main()` | one `settle()` function | a test can drive it, and `main()` has no copy to drift from it |
| `decision` | computed in `main()`, passed down | computed **inside** `settle()` | a caller that computed it would leave the wiring outside the rehearsal's reach -- and the wiring is the thing measured to be unobservable |
| `root` | `ROOT` everywhere | a parameter | a rehearsal must not file a receipt for a tree that does not exist in this repository's `.git` |
| the shapes | -- | `REHEARSALS` in `gate-receipt.mjs` | it is the enumeration of that module's own branches, so it sits beside the rule and moves with it |

The shapes are `passed`, `subset`, `moved`, `dirty-end` and `failed`. `failed` carries **both** a failed step
and a moved tree, because `FAILED` has to outrank `VOID` and this is the only place where one run is both. A
dirty *start* is deliberately absent: it is a state a developer is in all day, its verdict is `OK` with no
receipt, and its shape is already driven through the real path by `--only`.

**The expectation cannot come from the implementation.** A rehearsal that computed its own expected word would
agree with the gate by construction. The table of `(shape, word, exit, stream)` lives in
`gate-steps.test.ts`; the gate supplies the behaviour. And the other direction is closed too: the refusal for an
unknown name publishes the list of shapes it has, and a test compares that list to its own table sorted -- so a
shape added to the gate and not to the test is red rather than silent.

**Ten removals, twenty-four reds, no survivor.**

| removal | red |
| --- | --- |
| the gate ignores the decision it computed (the v3.106 survivor) | **4** |
| the gate decides for itself whether the run was a subset | **1** |
| the void branch is never chosen (`VOID` compared against `FAILED`) | **6** |
| the exit code ignores the verdict | **3** |
| the receipt is filed for every run (`issue` inverted) | **3** |
| the moved shape is the same tree twice | **2** |
| an unknown shape falls through to a green rehearsal | **1** |
| the refusal exits zero | **1** |
| a shape is published that has no sample | **1** |
| the failing shape stops outranking the move | **2** |

The first row is the round's whole subject: the edit that was green in every instrument this tree had, four
rounds ago, now costs four tests.

**One site, and it is a site that can be reached.** The refusal is a new `process.exit(1)`, so the inventory
moves **143 -> 144** and the battery **228 -> 229 claims across 66 files**. It is proved the ordinary way -- by
the spawn that reaches it -- rather than by the argument that a site cannot be proved, which is what finding 563
said about a *different* exit and was right about. The two sentences are not in tension: a new exit is a cost,
and the question is whether a test can reach it. Here one can, in a second, without a tree.

**What this does and does not establish.** It establishes that **this** gate obeys the value it computes, for
every branch of the decision, in eleven tests that take under a second together. It does not establish a general
instrument: the pattern is `settle()` plus a table of inputs plus a `--rehearse` entry, and a gate that grew a
second consumer of a pure result would have to grow the same three. What is now general is the *statement* of
the requirement -- a gate that consumes a pure result needs an entry point that supplies the result, or the
consumption is unobservable -- and the fact that the first gate to need it has one.

## Finding 565 — the classifier that decides which numbers are true was filed as a table, and one of its branches had no reader

**The shape, in two sentences that were about the object beside the function.** `scripts-are-classified.test.ts`
filed `doc-counts-vocabulary.mjs` as `data`, whose definition in that register is "a module under `scripts/` that
exports a table and has no `main`. It is imported rather than run, so it has no exit and no verdict", and the
module's own header agreed in the first person: "it is a plain data module: no `main`, no exit, nothing to
prove". Both sentences are true of `CURRENT_MARKERS`. Neither is about `scopeOf`.

`scopeOf` decides **which published count belongs to which suite**. From that decision the checker builds which
numbers it holds to a measurement, and the writer builds which row it may rewrite. It had four branches, no test
in the tree imported the module to call it, and its only proof was two spawned gates over fixtures -- the route
this same register describes elsewhere as "a spawn, which cannot name the branch you broke".

**The survivor, and how it was found.** The branch `|\bevery workspace\b` was deleted from the classifier, and
the suite stayed green: **255 files / 6,560 tests**, with `check-doc-counts` green over **433** published counts.
The branch had no reader anywhere -- not a test, not a fixture, not a document. Worse than a dead branch, it was
a *guess*: the function's contract is that the scope word appears in the row's label, and `every workspace` does
not contain the word `repo`.

**Where the guess came from.** The checker kept a second copy of the three names:

    const SCOPES = { core: 'packages/core', cli: 'packages/cli', repo: 'every workspace, i.e. `pnpm test`' };

and printed `Object.keys(SCOPES).join(', ')` -- twice, and never a value. So the `repo` value was a string no
operator had ever seen, and it had already been copied into the classifier as a matching alternative. **A dead
string is not inert: it reads as a specification**, and the next reader encodes it.

**Three shapes the corpus writes that the chain answered wrongly or unasked.** A regex built from `\b` splits at
`-` and `/`, so any label that *contains* a scope word answered as if the row *claimed* it:

| label, as a document writes it | `scopeOf` answered | what the label is |
| --- | --- | --- |
| `core / cli / repo` (three rows, `progress/volume-08.md`) | `core` | one row publishing three suites' counts; the first word won |
| `` `scripts/publish-cli.mjs` `` | `cli` | a file's name, not a claim about a suite |
| `packages/core` | `core` | a path |
| `every workspace` | `repo` | an alias no document uses |

The first row is the sharpest: a label naming three suites is *more* ambiguous than the bare `test suite` the
module was created to refuse, and it was answered instead of refused. None of the four is reachable in the
corpus by a count shape today -- which is luck, not a rule. Each is one `N files, M tests` away from being
checked against the wrong suite, and the row that would be checked is a *dated record* whose numbers are
supposed to differ from today's.

**The repair: the list is the source, and the classifier is a function of it.**

| part | before | after |
| --- | --- | --- |
| the words | the union of what a chain of `if`s happened to test | `SCOPES = ['core', 'cli', 'repo']`, exported |
| `scopeOf` | first branch that matched, anywhere in the label | every name standing alone; one name, or `null` |
| `null` | a bare `test suite` | a bare label, a compound label, a path and an unknown word alike |
| the notes | private to the checker, never printed | beside the words, and printed in the rule-1 refusal |
| the writer's table | three literals beside the vocabulary | `VOCABULARY.map((name) => ({ name, ...MEASUREMENTS[name] }))` |
| the vocabulary's proof | none | `doc-counts-vocabulary.test.ts`: twelve tests, and the only importer |

`null` is not a soft answer, and that is what makes the deletion of the alias safe. Rule 1 of
`check-doc-counts.mjs` refuses a published count whose scope is `null`, so `every workspace` -- had a document
ever used it -- becomes a sentence an author can act on ("say which one it measured") instead of a guess made on
their behalf. The alias was not a safety net; it was the failure the module exists to prevent, one spelling over.

The values are the only place the vocabulary reaches a reader, so the refusal now prints all three and a test
asserts each one. A note no message prints is a note that gets believed and not read, which is exactly how
`every workspace` became a branch.

**Seven edits, thirteen reds, one equivalent.**

| edit | red |
| --- | --- |
| the classifier answers with the first word again | **1** |
| the delimiters are `\b` again | **1** |
| a fourth scope is added to the vocabulary | **7** |
| the refusal stops printing the notes | **1** |
| a scope arrives with no argv to run | **2** |
| the writer's list is written by hand again | **0** -- equivalent |
| the vocabulary's test is deleted | **1**, naming `doc-counts-vocabulary.mjs exports scopeOf and no test imports it` |

The sixth row is stated as equivalent rather than hidden. A hand-written list that *agrees* with the vocabulary
is the same behaviour today, and a value test cannot tell derivation from a copy; what the new test buys is that
the day the two disagree -- the only day that matters -- it is red. The seventh is the class rule proving itself
on the module it was written for.

**The class rule, and why it is only about `data`.** `data` is the class that excuses a script from every other
instrument in the tree: there is no exit for the inventory to enumerate, and hollowing cannot reach a module
nothing spawns. So "exports a table and has no `main`" was the whole of its proof, and the word *table* was
doing the work. `scripts-are-classified.test.ts` now carries the rule with a reader: **a module the register
files as `data` may export functions only if some test file imports it** -- read from the specifiers in the test
corpus, not from a mention of the file's name. Of **27** data modules that export functions, this one was the
only one nobody imported.

A gate is the other side of the same line and gets a different rule: it may not be imported (the proof is
emptying it), so its functions are reached through a spawn, which proves the process and never the branch.
That is why the rule is scoped to `data` rather than to every module that exports a function -- the two classes
have different instruments, and a rule that ignored the difference would demand something a gate cannot have.

**What this does and does not establish.** It establishes that the vocabulary has one home, that its classifier
answers one word or `null`, and that its branches are proved by a test that names them. It does not establish the
analogue for the edges that *consume* decisions. Measured at this round: **20 of 59** gates import a module that
exports functions, over **31** edges, and **one** of those -- `verify-local.mjs`, through `--rehearse` (finding
564) -- can be supplied with inputs a run did not produce. The other nineteen compute a verdict from a module and
can only be run over the tree they are looking at. The requirement is stated with a count rather than a
paragraph, because a paragraph is what the previous round left and it took a round to narrow.

## Finding 566 — the rule was keyed by module, and one helper was written twice

**The shape.** v3.108 closed finding 565 by giving the `data` class its first reader: *a `data` module may export
functions only if some test file imports the module*. Three hundred lines away in the same suite,
`export-surface-enumerated.test.ts` -- the instrument that enumerates the exports of `src/` -- carries a design
note saying why that key is the defect it exists to catch:

> `UNENHANCED` was keyed by *module* ... a symbol added to `cli/args.ts` next month would be exempted by a reason
> written about a different symbol. An exemption whose scope is wider than its argument is finding 47 again.

A module ten tests import satisfies a module-wide rule for every symbol it will ever grow, so a new export
arrives unread and green. Measured at v3.109 over the 27 `data` modules and the **162** functions they export:
**145** are taken by a test, **7** are taken by nothing outside their own module, and **10** are taken only by a
script the suite spawns. The module-wide rule could not see the difference between those three populations, and
the register's own words are why -- "it is imported rather than run" is a sentence about a file.

**The two halves of `gitIn`.** Two of the seven were the same helper written twice: `gate-receipt.mjs` ran
`spawnSync('git', args, { cwd: root })` and `git-hooks.mjs` ran `spawnSync('git', ['-C', root, ...args])`, each
exported, each used only by the module that defined it. One of the two copies had been taken by a test since it
was written, and that is the whole reason the duplication survived: **the module that had a test looked proved.**
The register's module-wide rule reported "imported" for `gate-receipt.mjs` and moved on.

The two spellings are equivalent on every shape either has been given -- a command that works, a revision that
does not resolve, a root that is not a directory, a root that does not exist. That equivalence is why nothing
caught it, and it is also why the duplication was harmless and still wrong: the next caller copies whichever copy
it reads first, and "what a git failure looks like here" acquires a second author. The repair is
`scripts/git-in.mjs`, imported by both, with `git-in.test.ts` holding the contract and the equivalence --
`git -C` and `cwd`, side by side, on the same five argument lists.

**A dead condition, found by the test that was written to protect the code.** The first draft of the shared runner
carried both copies' guard:

    if (result.error !== undefined || result.status !== 0) return null;

Deleting the `error` arm left **all six tests green**. `spawnSync` pairs every way of not starting a child with
`status: null`, and a child killed by a signal also reports `status: null`, so `null !== 0` already answers `null`
for both -- the first arm could not change an answer, in either of the two modules it had been copied into. The
shipped form is one comparison, `result.status === 0 ? result.stdout : null`, and the case that reaches it (git
taken off `PATH` for one call) is in the test file. This is the round's only equivalent mutant, and it changed the
code rather than being excused.

**The rule, and the four directions of its table.** A `SPAWN_ONLY` entry is a statement that the import route does
not exist, so it is refused when the symbol is not exported, when a test takes it (**stale** -- the table can only
shrink by work), when no script takes it (it must be made private instead), and when the reason is under 120
characters or shares its text with another entry. The stale direction is the load-bearing one: widening the reader
back to a module-wide key leaves the first rule green, because every symbol of an imported module becomes "taken"
-- and the stale rule goes red, because `gate-receipt.mjs#rehearsal` is a name no test takes.

**The fourth import form, which is why the census was wrong before it was right.** `measure-doc-counts-readings.test.ts`
takes `parseSummary` and `countsFromReports` with

    const { … } = (await import(pathToFileURL(resolve(ROOT, 'scripts', 'doc-counts-rows.mjs')).href)) as { … };

The specifier is not a literal. A reader keyed on `from '…/x.mjs'` reports both as unread, and a census built on
it asks for two exemptions for functions a test already pins branch by branch -- an instrument demanding
bookkeeping for work that is done, which is how an instrument gets deleted rather than fixed. Both names are now
a control test: a reader that loses the form goes red instead of quiet.

**Eleven falsifications, sixteen reds.** The reader losing the dynamic form, an exemption dropped, an exemption
added for a symbol a test takes, a three-character reason, two entries sharing a reason, an export nobody
consumes coming back, the export detector matching nothing (the floors, not the rule), the reader keyed by module
again, the runner judging by `error` instead of `status`, the runner stripping git's newline, and the plural arm
of the hung-test sentence folded into the singular. The twelfth edit -- removing the runner's `error` arm -- was
green, and is stated as equivalent above.

**What this does not establish.** The reasons are prose, and no reader can check that a spawn is really the only
route: the three following tests check that the symbol is spawned, that no test takes it, and that the sentence is
a sentence. A gate that became driveable tomorrow would still be excused by today's paragraph; the table's only
defence is the stale direction, which fires when a test takes the name and never when a flag makes the gate
drivable. That is stated in the live list as an item rather than implied by a rule that looks complete.

## Finding 567 — nine written exemptions, eight of them for functions a test could call: the sentence was about a route and the row was about a name

v3.109 closed with an item it could not check and stated rather than hid: the reasons in `SPAWN_ONLY` are prose,
and no reader can confirm that a spawn is *really* the only route. Four checks stood behind the table -- the symbol
is exported, no test takes it, some script takes it, the reason is at least 120 characters and not shared -- and
every one of them is about a **route that exists**, not about a route that is **the only one**. So the table could
be satisfied by a paragraph, and the paragraph could be satisfied by being a paragraph.

This round read the nine bodies instead of the nine sentences.

**The census, and the marker it looked for.** Each entry was resolved to the source of its function: the `export
function` declaration, then braces matched in the comment-and-string-blanked form of the file so that a `}` inside
a literal cannot end it early. The question asked of each body was whether it can only run in a process of its own
-- whether it reads `process.argv`, `process.env`, one of the three standard streams, `process.exit`, or calls
`spawn`/`exec` directly. Eight of the nine never do:

| symbol | body | boundary |
| --- | --- | --- |
| `budget-readings.mjs#budgetInForce` | `(source, testName)` -> one of four answers | none |
| `format-spec.mjs#modalitiesProse` | `(modalities)` -> a joined string | none |
| `gate-receipt.mjs#rehearsal` | `(name, plan)` -> one of six shapes | none |
| `gate-steps.mjs#workflowPath` | reads `process.env['RCA_CI_WORKFLOW']` | **environment** |
| `publish-plan.mjs#readBlob` | `({ root, sha })` -> `runGit(root, ['cat-file', ...])` | helper call |
| `publish-plan.mjs#readRev` | `({ root, rev })` -> `runGit(root, ['rev-parse', ...])` | helper call |
| `publish-plan.mjs#pointerPlan` | `({ tree })` -> `{ commits: [], tipTree }` | none |
| `publish-readings.mjs#parseArgs` | `(argv)` -> options or an error | none |
| `publish-readings.mjs#inspect` | `(file)` -> `readFileSync` plus a judgement | file read |

**Why the four checks could not catch it.** They ask whether the name is consumed, and every one of the nine was.
`readBlob`'s reason said the end-to-end push "is the only place its output is judged" -- and that is true, and it
is a fact about `publish.mjs`, which is the caller. The row was keyed by a **symbol** and argued about a **gate**.
Finding 566 made the key finer (module -> symbol) and that repaired the stale direction; it could not repair the
argument, because the argument was never a claim the tree could read. A function that takes a string and returns a
number has an answer for every string a test can write, and the fact that some other file also calls it is not a
reason to leave those answers unmeasured.

**What the eight bodies were hiding.** Each of them decides something, and the decisions had no branch-level
proof: which of four budgets is in force and in what order (`budgetInForce`), whether an expansion keeps the order
the list gives or the order the vocabulary declares (`modalitiesProse` -- the two differ on every page that lists
two modalities), what a rehearsal ends on when the tree moved and when the working directory is dirty
(`rehearsal`, whose `moved` and `dirty-end` shapes differ in one field), whether an empty `RCA_CI_WORKFLOW`
means "the shipped workflow" or "the repository root" (`workflowPath`, and the branch is `||` rather than `??`),
whether a blob is bytes or a decoded string (`readBlob` -- a `utf8` default silently rewrites every byte above
0x7f), which layer refuses a revision git cannot resolve (`readRev`: git's sentence or a shape `TypeError`),
whether a pointer plan carries a commit (`pointerPlan`: the empty list is its entire claim), which of six argv
shapes is accepted and which is refused (`parseArgs`, including the `index += 1` that makes `--file x --check`
read the flag), and whether a file that parses into the wrong shape is a read failure or a shape failure
(`inspect`). Thirty-seven tests now pin those, in the six files that already import the module.

**The table, and why zero is the honest size.** `SPAWN_ONLY` holds no rows. The nine names are kept as
`FORMERLY_EXCUSED`, and a test asserts that every one of them is taken by a test now -- so the emptiness is a
change with a record rather than an absence, and a symbol that leaves the table without a test fails the record
instead of quietly disappearing. The four checks survive because a future row must pass them, and they are no
longer an empty loop: one **fifth** rule was added, and the whole set is exercised against six synthetic rows, one
per fault. The fifth is the one this finding is about: **the body must cross the process boundary**. `console` is
deliberately not a marker -- vitest can spy on it, so printing is the one thing a test can capture -- and the
body is blanked before it is searched, because the comments in this tree quote `process.env` constantly and a
mention is not a read.

**The predicate is calibrated, not asserted.** Three calibrations make the rule falsifiable while the table is
empty: `workflowPath`'s real body reads the environment and crosses; `readBlob`'s real body reaches a spawn
through `runGit` and does not -- which is the exemption that stood here, judged by the rule that replaced it; and a
primer is not a boundary. The mutation that deletes one alternative from the predicate turns two tests red.

**Two findings fell out of the repair.** The first is `STATED_BY`, the table that turns an arm into the sentence a
report prints: `budgetInForce` can answer four ways and the table has three keys. The fourth (`none`) is safe only
because `check-test-budgets.mjs` answers it before indexing, with a branch of its own and a `continue`. That is a
pairing nobody had written down, so the test now asserts both halves -- the three keys, and the branch in the gate
that makes the fourth one safe. The second is the heavy-fixture detector: it searched the whole file for `'install'`
and required only that the file also spawned something, so a rehearsal plan whose first step is a *label* named
`install` made `gate-receipt.test.ts` look like a file that runs a package manager, and an assertion about memory
went red naming a file that runs none. The verb is now looked for inside a spawn's **argument list**, sliced by
matching the parenthesis in the blanked source; four calibrations hold the distinction (a label is not a command, a
comment is not a call, a real argument list is, and the one heavy file in the tree still is).

**Four falsifications, five reds.** A row for `pointerPlan` put back into the empty table (one red, carrying both
the stale fault and the body fault), the predicate with `process.env` removed (two reds: the row calibration and
the body calibration), and the heavy detector returned to the whole-file reading (two reds: its own calibration and
the set assertion naming `gate-receipt.test.ts`).

**What this does not establish.** `crossesProcessBoundary` is a proxy, not a proof that a function cannot be
called: a body that reads `process.env` can still be called from a test that sets the variable, and `workflowPath`
is now tested exactly that way. What the predicate answers is narrower and checkable -- "this function takes an
input the test does not hold" -- and that is weaker than the sentence the table used to write. The honest
consequence is that a symbol which genuinely cannot be called from this process may not exist in this tree at all:
every one of the nine could be, and the table is empty because of it rather than because the question was dropped.
