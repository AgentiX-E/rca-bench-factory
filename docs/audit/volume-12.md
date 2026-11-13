# Audit · volume 12

Findings 490–493, from the rounds recorded in `progress/volume-12.md`.

## Finding 490 — a case stated a duration its own telemetry contradicted, twice over

`history-resource-merge-burst-search-cluster` was written in v3.71 to say one thing: a saturation that
**ends**. Its incident text says the merge "stayed there for four minutes", its parameters declare
`burstMinutes: 4`, and its checkpoint asserts that parameter. Its telemetry declared `hold: 4`, and a
hold is a **count of samples**.

The two numbers were the same number, and that is what made the defect invisible. `expandSeries`
divides the post-window into eight intervals, so a sample in that case was **3.5 minutes** long and the
plateau the case shipped ran from 14:12 to 14:26 — **fourteen minutes of telemetry for a sentence that
says four**. Nothing in the repository compared the two, because the only machine-readable statement of
the duration was the parameter, and the parameter was compared with itself.

The class is older than the case. `history-network-partition-search-cluster` has said "the seventeen
minutes are the gap between 03:02 and 03:19" since it was annotated, in a window that ended at 03:40:
its `cluster_members_visible` series therefore stayed halved for **thirty-eight** minutes. Before
`hold` existed the corpus could not express an end at all, which is why nobody noticed — every series
held its post value to the window's edge, so a window was the only duration a case could have.

**The repair moves the geometry, not the sentence.** The merge-burst case's window now ends at 14:20,
so one sample is one minute and `burstMinutes: 4` is four samples rather than a coincidence of two
fours. The partition case's window now ends at 03:19, which is the time its text already names. Both
prose and data now state one fact, and the fact is the same one.

**The guard is `readDurationRestatement`.** It answers the only question the file can be held to: a
parameter whose value **is** the hold is asserting that one sample is one unit of that parameter, and
the window either makes that true or it does not. `readPostSampleSpacing` computes the third number
nobody wrote down — `(windowEnd − onset) / SERIES_POINTS` — and the refusal prints all three:

```
'burstMinutes' states 4 min beside a hold of 4 sample(s), and one sample is 3.5 min: the same number
is a count of samples in one field and a length of time in the other, and the two are one fact only
when a sample is one min
```

Run over the shipped corpus before the repair, it refused exactly one case — the one this round
introduced — and left the other seven time-unit parameters alone, because `splitDurationMinutes: 17`
beside a hold of eight is a **different quantity**, not a restatement. That is the precision the rule
needs: `retentionGapHours: 31`, `terminationGracePeriodSeconds: 30` and `keysIntervalSeconds: 30` are
facts about the system, and a rule that refused them would be a rule about vocabulary.

### What the repair cost, measured

| quantity | before | after | why |
| --- | --- | --- | --- |
| merge-burst post-window | 38.0 min | **8.0 min** | one sample becomes one minute |
| partition post-window | 38.0 min | **17.0 min** | the window ends where the text says the links came back |
| pair windows overlapping | 0 | **0** | shrinking a window cannot create an overlap |
| L4 cases the corpus can lose | 2 | **1** | an L3 case was added; five of thirty-three is 0.152, four of thirty-two 0.125, three of thirty-one 0.097 — below the 0.1 floor |

## Finding 491 — a list of types that named one type twice

`assessDiscriminatingPower` reports two alternative readings of the labelled category, each with the
expected **types** it disagrees with, and a union of them. The union was a `Set` and the two per-reading
lists were arrays, so the fields disagreed about what they were counting. Nothing could see it while
every type had one sample.

The corpus now has two `queue-disk-watermark` samples, and both disagree with the row-shadowing
reading. The list came back as `redis-latency, feature-flag-misconfiguration, queue-disk-watermark,
ingress-timeout-misconfiguration, queue-disk-watermark`: five entries, four types, in a field documented
as "the expected types this reading classifies differently". A count of rows wearing a type's name is
the same defect the corpus keeps finding in prose, in a field that a report prints.

Both lists are sets now. The count of disagreeing types is four of thirty-three everywhere it is
printed — `differ` was already four, which is how the duplicate survived: the union was right and the
parts were wrong, so any test that read the union agreed with the report.

## Finding 492 — a case said its fault lasted eighteen minutes and its own file said thirty

`history-dependency-upstream-5xx-pricing` carries `durationMinutes: 18`, and its incident text says the
dependency "returned 502 on 60% of requests for 18 minutes". Its window ran from 09:00 to **09:42**, its
onset was 09:12, and its series declare no `hold` -- which is the declaration "the value is at `post`
for every one of the eight samples". So the post side was thirty minutes wide, one sample was 3.75
minutes, and the two ratios the case ships sat at 60 % for **thirty** minutes while the file said
eighteen.

The case also contains the correct number, in a place nothing compares: its own log line reads
`degradation window 09:12-09:30 UTC, 503 on tax calculation requests`. Three statements of one span in
one file, and the two that a reader would trust most disagreed with each other.

**Why the v3.72 rule could not see it.** `readDurationRestatement` fires when a parameter's value *is*
the excursion's `hold`, which is the coincidence `hold: 4` beside `burstMinutes: 4` written into the
corpus by accident. Eighteen is not eight, so the parameter was read as "a different quantity" and the
rule was silent -- correctly, by its own definition, and that definition was the problem.

**The repair moves the window.** It now ends at 09:30, which is the time the case's own log line names
and the time the ticket names. Eight samples of 2.25 minutes are eighteen minutes, `durationMinutes: 18`
is the episode's length rather than a comment on it, and the file states one fact three times instead of
two facts and a contradiction.

## Finding 493 — the same shape, and a note that said the reading carried no duration

`history-dependency-schema-change-currency-feed` declares `durationMinutes: 120` and its window ended at
**11:30** from an onset of 09:00 -- a hundred and fifty minutes of post side at 18.75 minutes a sample.
Its own checkpoint description already carried the repair: *"the two hours between the deploy at 09:00
and the revert at 11:00 -- the same interval the incident text states twice"*.

Both cases carried a parameter note saying *"the readings are shares and carry no duration of their
own"*. That sentence was false in the direction the author did not consider: a share that is elevated
from the onset to the window's edge is an episode with a length, and the length is the post side. The
note was written to explain why no reading *cited* the parameter, and it answered a different question.

**The repair moves the window to 11:00**, so a sample is fifteen minutes and eight of them are the two
hours the description names.

| quantity | before | after | why |
| --- | --- | --- | --- |
| 5xx-pricing post-window | 30.0 min | **18.0 min** | the window ends where the log line says the degradation ended |
| 5xx-pricing one sample | 3.75 min | **2.25 min** | thirty minutes divided into eight |
| schema-change post-window | 150.0 min | **120.0 min** | the window ends at the revert the description names |
| schema-change one sample | 18.75 min | **15.0 min** | a hundred and fifty divided into eight |
| cases naming their own length | 0 | **5** | the field did not exist before this round |
| parameters spoken for | 36 of 109 | **37 of 109** | one note became a checked number |
| G3 grid, localisation, similarity | unchanged | **unchanged** | a narrower window moves no value, and the grid reads values |

## The field the corpus was missing, and the four things it refuses

The corpus carries **fourteen** time-valued parameters. Five of them state how long the fault lasted --
`burstMinutes` twice, `splitDurationMinutes`, `durationMinutes` twice -- and nine are knobs the fault
ran under: `terminationGracePeriodSeconds: 30` is a kubelet setting, `retentionGapHours: 31` is a gap
the ticket measured, `readyAfterSeconds: 40` is how long a replacement took to serve. No rule over the
names can separate the five from the nine; a rule that guessed would be right five times and wrong nine,
which is the shape finding 489 recorded when `spike` carried a duration in its name.

`fault.durationParameter` is the case answering the question. Once named, the number is read against
`hold x spacing` in the parameter's own unit and to the millisecond, and `readDurationClaim` refuses
four ways:

| refusal | what is wrong |
| --- | --- |
| `unknown-parameter` | the name is not a key of `fault.parameters` -- a rename left it behind |
| `not-a-duration` | the parameter is not a `{ value, unit }` quantity in a unit of time |
| `no-episode` | the case's series draw no excursion, so nothing of its own is that long |
| `ambiguous` | its series hold for different lengths, so one number cannot be all of them |
| `disagrees` | the stated span and the drawn one are different numbers |

A case that names nothing is not refused. That is the boundary `fault/parameterNotes` draws from the
other side: there the file had to answer for a fact nothing read, here it may stay silent about a claim
it never makes -- so the guard prints how many cases answer (`5 named as the length of their episode`)
rather than turning a silence into a pass.

**The consequence a reader should know**: this rule can be satisfied by deleting
`fault.durationParameter`, and that is deliberate. The alternative -- refusing a case for not stating a
length -- would be a rule about the annotation's vocabulary, and nine of the fourteen time-valued
parameters are legitimately not lengths. What the field buys is that a case *which states its length*
can be wrong in exactly one way, and that way is caught.

## Finding 494 — the hardest level was claimed once without the chain that earns it

`difficultyFloor` refuses a level below the structure and is silent about a level above it, so six of the
corpus's thirty-three cases claim more than their chains carry. Five of the six are one rank above their
floor and defensible as judgements. The sixth is `history-config-rate-cache-ttl-pricing`: **`L4`, over a
chain of one step** (`service:pricing-service -> external:tax-calculation`), where the other four
holders of the level reach it with three hops.

Measured, that is the whole difficulty report in one line:

| reading | value | what it is a property of |
| --- | --- | --- |
| cases that state `L4` | 5 of 33 | the annotations |
| cases whose chains earn `L4` | **4 of 33** | the corpus |

`s3 = 5/33 = 0.152`, `4/33 = 0.121`, and only the second number survives a relabelling. Both exports
(`cloudopsbench` as `difficulty`, `itbench` as `scenario_complexity`) project the first: the one-hop case
is published as `hard` beside three-hop chains, and a consumer reading the ladder has no way to know.

**The excess is not the defect; the silence is.** A case can genuinely be hard to detect while being easy
to trace, and this one is the corpus's cleanest example of that axis: it moves about three baseline
standard deviations inside the band its alert treats as noise, so nothing fired, nothing failed, and the
question is whether there was an incident at all. `docs/data-model.md` permits the excess for exactly
this reason. What it did not require was an account of it, and a permission with no condition is how a
label stops meaning anything.

**The repair is a condition, in the same shape as `fault.parameterNotes`.** `fault.difficultyNote` says
what the floor cannot see; `readDifficultyClaim` refuses a level above the floor that does not answer,
and refuses a note at or below the floor — where the label already makes the weakest claim the structure
supports, so there is no gap for a sentence to explain. Six cases claim above and six answer, and the six
sentences name six different reasons: a delay that exists only as the difference between two normal
readings; an absence where every rate stayed flat; a move inside the noise band; a mechanism that is a
nightly job's schedule and not an entity in the graph at all; a retention raised days before the window;
an exception that closed a connection rather than nacking the message.

The note does not travel into a bundle, and that is the one deliberate omission in `assembleBundle`'s
whitelist: the defence for a level is a paragraph of the answer.

## Finding 495 — the ratchet's one unit of slack was the case that never earned the level

`difficulty-floor.test.ts` held a ratchet: drop one `L4` case and the corpus still meets its tenth, drop
two and it does not. The arithmetic was right and the reading was wrong, because it dropped cases rather
than levels, and one of the five it could drop was the case from finding 494.

| reading | dropping the claimed case | dropping one earned case |
| --- | --- | --- |
| by claim, as it was | 4 of 32 = 0.125, passes | 4 of 32 = 0.125, passes |
| by earned level, as it is | 4 of 32 = 0.125, passes | **3 of 32 = 0.094, fails** |

So the corpus can afford to lose **none** of the cases that earn the level, and the case whose deletion
costs nothing is the one the gate never counted. That is a worse number than the test claimed and it is
the one the arithmetic supports; the round that established it also made it unable to move by relabelling,
so the number no longer depends on which way the corpus is annotated.

`checkDifficultyDistribution` reads the earned level at its hard end for that reason, and keeps reading
the claims at its easy end, where a claim can only make the corpus look easier than it is and the
shortfall rule refuses a claim that is not backed. Each end reads the count that cannot be inflated.

## Finding 496 — the one sentence about which field a case got wrong had never been run

The weekly `Official data` job has been red since 2026-11-02. Its log ends like this:

```
ROUNDTRIP PASS   2/270 RE2-OB/checkoutservice_cpu/2   target=rcaeval-re2   oracle=1.00 signals=317010
TypeError: Cannot read properties of undefined (reading 'filter')
    at scripts/check-official.mjs:1282
```

A crash, at the line whose whole job is to name the field a case does not satisfy.

`scoreExport` answers with a `ScoreReport`: `{ target, passed, score, structure, terms }`, and the checks
live under `structure`. The reporter read `shape.checks` — the field name from before the report grew
its terms — while `shape.passed` at the top of the same `if` still existed, so the guard fired and the
body threw. One line of the block was updated when the report was restructured and the other was not.

**Why nothing caught it: the branch is unreachable from every fixture the suite has.** Reaching it needs
both halves at once — an export that scores 1.00, *and* a layout the target's contract refuses. Every
case in `check-official-roundtrip.test.ts` either round-trips cleanly or fails before this point (empty
descriptor, absent case, empty read, a refusal the exporter named). So the only code in the round trip
that can say *which* field is wrong had never executed on any corpus, in any run, since it was written.
Dead code cannot be wrong loudly; it can only be wrong on the first input that reaches it, and that
input was a 4.24 GB weekly download.

**It reproduces in one file.** A corpus case whose `logs.csv` header drops `container_name` and `time`:
the adapter carries the columns through, RE2's reader still finds and scores the case, the metric table
is intact, and the contract refuses the modality table. Against the unfixed script that fixture produced
the same `TypeError` locally, in thirty seconds, on the first try.

**The repair is two field names and one test.** `shape.structure.checks` in both reads; and a fixture
that drives the branch, asserting that stderr carries no `TypeError`, that the verdict line counts two
failing checks, and that both ids arrive with their own details — because `modality-set` and
`logs-header` are two different repairs, and a count would leave the reader to find out which.

What the sentence says about the real case is the next scheduled run's business. The round trip's
*verdict* was never in doubt — that case does fail the contract — only its ability to say why.

## Finding 497 — the count of failing checks went to the log and the sentence went somewhere else

The v3.75 repair made the round trip name the field a case gets wrong instead of crashing. The next
dispatch ran it, and two cases reached the branch:

```
ROUNDTRIP PASS   2/270 RE2-OB/checkoutservice_cpu/2   target=rcaeval-re2   oracle=1.00 signals=317010
ROUNDTRIP FAIL   2/270 RE2-OB/checkoutservice_cpu/2   shape=1
...
ROUNDTRIP PASS  14/270 RE2-OB/checkoutservice_mem/2   target=rcaeval-re2   oracle=1.00 signals=457551
ROUNDTRIP FAIL  14/270 RE2-OB/checkoutservice_mem/2   shape=1
```

`shape=1` is a **count**. The sentence that says *which* check failed was built on the next line and
pushed onto `roundTripFailures`, a list printed once, in the epilogue, before the run exits. That run
never reached the epilogue: it died of the heap at case 181. So the two refusals it found — the first
two the branch had ever produced on a real corpus — are gone, and all that is left of them in 84 minutes
of log is `shape=1` twice.

**The defect is not that the branch was reached; it is where the sentence was sent.** A per-case verdict
belongs on the per-case line, because a per-case line is what a 270-case run prints 270 times and what
survives a death. The `scored !== 1` branch one screen below had the same shape and one worse property:
it printed *nothing at all*, so a case whose score was 0.80 produced a `FAIL` mark with no reason beside
it anywhere in the log.

**The repair is that both branches print their sentence on their own line.** The epilogue still collects
them, because it is the list a reader diffs; the line is what a run that dies leaves behind.

## Finding 498 — "written before every exit" is not written when the process is aborted

The score report was documented as written before every exit, and it was: `emitScoreReport()` stood
before each `process.exit`, in the failure paths and in the success path. The 2026-11-09 run died with

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
/home/runner/work/_temp/....sh: line 9:  3113 Aborted (core dumped)
```

`process.exit` was never called. The uploaded artifact for that run holds two files — `pins.json` and
`rcaeval-cases.json` — and **no score report**, so 180 case records, the oracle score of every one of
them, and the sentence for every case that had failed were lost with the process. The one run that most
needs a report is the one that cannot reach the end of the function that writes it.

**This is the third round in a row whose defect is a sentence that exists only on a path the run did not
take** (findings 496, 497). The pattern is worth naming: an epilogue is a bet that the run reaches the
epilogue.

**The repair writes the report after every case.** `emitScoreReport` is now called from a `finally` that
wraps the loop body, so one call site covers all nine ways out of a case; `continue` runs it, which is
what makes the guarantee structural rather than remembered. The write is already atomic (temp then
rename), so a reader polling the artifact sees either the previous complete report or this one, never a
half file. Two hundred and seventy rewrites of a small JSON document cost nothing against twenty-five
seconds a case, and the test kills a run with `SIGKILL` after the first record lands and asserts the file
holds what the run had measured.

The report also now carries what the corpus ships per slice and what the run cost, because those are the
two things an artifact written at case 40 of 270 can still tell you.

## Finding 499 — a heap limit nobody declared, measured, or reported

Node's default cap on a 64-bit runner is 4 GB. Nothing in this repository said so, and the run that
found out said only what V8 says:

```
[3113:0x3c024000]  3158378 ms: Mark-Compact 4016.6 (4137.1) -> 4015.9 (4137.1) MB, ... allocation failure
```

No case name, no stage, no number from this project. Eighty-four minutes of log contained one heap
reading per case — `signals=` — and `signals` is a count of telemetry rows, not of memory.

**The corpus is not ours, so its largest case is not a quantity to bound by wishing.** Measured locally
on a synthetic case in the corpus's own shape: a 122 MB case (480 000 log rows, 960 000 spans) costs
2 105 MB of heap at the ingest boundary, which is 17 MB of heap per MB of CSV. `RE2-TT`'s cases are
about 2.4× the bytes of `RE2-OB`'s, so the first TrainTicket case needed more than the 4 GB the run had.
That is arithmetic, not bad luck, and it was never written down.

**Three things follow, and they are the repair.** The run prints the heap it was given and the budget it
is expected to stay under, before the first case; it samples the heap at five stage boundaries per case,
records the number on the case's record, and prints a `ROUNDTRIP COST` line whenever a case is heavier or
slower than every case before it, so the log carries the growth curve rather than 270 repeated readings;
and it refuses at 90% of the budget with the case named.

The shape of that last line was published here as a **projection**, and this block used to print it as if
it were an output:

```
ROUNDTRIP cost 270 case(s) in 201.4 min; largest 3712 MB of the 7168 MB this run was given (52%) at
RE2-TT/ts-auth-service_cpu/1; slowest 51.3 s at RE2-TT/ts-order-service_cpu/2
```

It was 270 cases at the rate Online Boutique set and 3.7 GB from the local 17 MB per MB, and it was never
observed. The first run that reached that case died there at **96% of the same budget** (finding 504), so
the projection was wrong by a factor of two in the optimistic direction -- and, worse, it was
indistinguishable from a reading (finding 506). What replaced it is measured: **4,100 MB at case 54**,
unchanged for the next 128 cases, and then a step past 6,960 MB at case 182.

A run at 90% or more of its budget **stops itself**, with the case named, because a run at 95% has not
passed — it has one case left before it dies, and the death has no sentence in it. The check used to run
once, after the loop, which is the one place it cannot help (finding 504); it runs per case now. The
budget defaults to the heap limit and is set by `--heap-budget`, which is how the refusal is tested: the
branch exists for a corpus that nearly exhausts a runner, and a test cannot build one.

The workflow declares the number instead of inheriting it -- `--max-old-space-size=12288` since the
dispatches measured what 7168 could not hold, with the arithmetic in the comment above it.

**And the bound that had gone stale beside it.** `timeout-minutes: 90` was written when the round trip
was believed to take ten minutes. The run measured 35 s a case on Online Boutique; 270 cases plus a
40-minute fetch does not fit in 90 minutes, and a job killed by its own timeout reports no reason at all.
The job now declares 300, the step 240, and both carry the arithmetic that produced them.

## Finding 500 — the plan spoke for a suite, the corpus ships per slice

90 of the 270 cases in `RE2` failed, all with one sentence:

```
ROUNDTRIP FAIL 91/270 RE2-SS/carts_cpu/1
  reason=RE2 declares a traces table and traces.csv is not readable under RE2-SS/carts_cpu/1
```

Cases 91 to 180 inclusive: the whole SockShop slice. `MODALITY_PLANS` keyed on `entry.suite`, and `RE2`
is four characters covering three corpora. SockShop ships `logs.csv` and no `traces.csv` — every case,
which is what makes it a property of the slice rather than a partial download — and the plan for the
suite was applied to a slice that is not it. The failure is not the corpus disagreeing with itself; it
is a claim written about the wrong subject.

Three separate places had to agree for those 90 cases to pass, and each of them was stating the
suite-level rule:

1. **The plan.** `SLICE_MODALITY_PLANS` now maps `RE2-SS` to the logs entry, by `filter` on `table`
   rather than by position, and `planForCase` looks a case up by the first path component of its id and
   falls back to the suite. The logs plan is inherited rather than restated: it is the same nine-column
   table, and a second copy is a second thing to drift.
2. **The absence rule.** A table the plan names and the directory does not carry used to fail the *case*.
   It is now counted, and refused once per slice and table, because "this slice has no spans" and "this
   download lost half the spans" are different facts and a per-case verdict cannot tell them apart. The
   first says the plan needs a slice entry; the second says the extraction is broken. The census line
   says which:

   ```
   ROUNDTRIP CENSUS modalities RE2-SS: logs 90/90, traces 0/90
   ```

3. **The layout contract.** `scoreExport` derives the expected modality set from the target's suite, so
   a SockShop case that ships logs alone failed `modality-set` even after the plan stopped demanding
   traces — the plan handing the case to a check that demanded them anyway. `checkRcaEvalStructure` now
   takes an `ExpectedModalities` with the suite rule as its default, and the round trip states the
   case's own answer because it has read the directory.

**The parameter is an equality, and that is what makes it safe.** A caller that says `traces: false`
about a case whose export *does* carry spans fails the check: `hasLogs === expectsLogs`. It can move the
expectation onto what the case is; it cannot be used to stop looking at a table the export wrote. A test
holds both halves, and a third holds that a target with no log/trace pair refuses the argument rather
than ignoring it.

**What this does not claim.** Whether `RE2-TT` ships spans is unmeasured — the run died at its first
case — so `RE2-TT` inherits `RE2`'s plan and the next dispatch will say so in one sentence with a count
rather than in 90 lines without one.

## Finding 501 — the index is measured against volumes that can no longer grow

`progress-volumes.mjs` requires `docs/progress.md` to be smaller than **the smallest volume**, on the
argument that "the file a reader opens first must not be bigger than the things it indexes". The
argument is right and the set is wrong: the smallest volume is `volume-02.md` at 92,355 bytes, it was
closed eleven volumes ago, and nothing may append to it. So the headroom on the live list is not a
budget a round can plan against — it was 955 bytes at the start of this round and 15 bytes at the end —
and the failure it produces names two repairs, neither of which exists:

> either the section that grew is a record and belongs in a volume, or the index is no longer an index

The section that grew was the `## Open` list, which is the index's own content by design, and no record
belongs in a volume that has been frozen since v3.55. What this round actually did to get green was
**shave three paragraphs of its own new entries** until the arithmetic fitted, which is the shape this
audit keeps finding: a number that is checked, and a repair that is not available.

**What would close it** is a rule that compares the index against something that can still grow — the
smallest *open* volume, or the median — and a stated way to rebalance closed volumes when the relation
breaks. Until then the next round starts with fifteen bytes and will spend its first edit making room.

## Finding 502 — a record dated "this commit" is a claim about now

`check-doc-counts` reads `(as of this commit)` as the present (`CURRENT_MARKERS`) and refuses a row that
carries it when the number no longer matches the suite. It was right, and the row was wrong: v3.76's ledger
published `core 244 / 6234` with that phrase, v3.77 added one test, and the guard refused two rows in a
record that had been frozen a round earlier.

The phrase is the defect. A ledger is measured against **one tree**, and "this commit" names that tree only
while it is the commit being written. The corpus already had the anchored form -- `(as of `78cf92046`)` in
`volume-02.md`, and `progress-volumes.mjs` rule 8 holds every such marker in one ledger to a single commit
-- so the ledger that said "this commit" was using a current-claim where a date belonged.

**Both spellings are wrong for a record, and for one reason.** The anchored form names a commit that the
publishing pipeline rewrote: every push here goes through the Git Data API, which creates the commit
server-side, so a local sha names something no reader can resolve. What survives a push is the **round
label**. v3.76's three rows say `(at v3.76)` now, the newest ledger keeps `(as of this commit)` because it
is the one claim about the present, and the round that follows dates it.

**What would have caught it earlier** is nothing: the guard fired the moment the claim stopped being true,
which is the first moment it could. The cost is three row edits in the next round's write-up, and the
benefit is that the previous round's counts are read rather than inherited.

## Finding 503 — two lists of the same thirty-one names, and nothing that compared them

`samples.json` carries two statements about fault types. `types` is the **closed vocabulary the prompt
offers**: a model reading the extraction prompt may answer with one of those strings and no other. Each
sample's `expected.type` is the **label the corpus gives that sample**. The pair has to agree in both
directions -- a type nobody labels is an option that cannot be right, and a label the prompt does not offer
is a right answer the prompt forbids -- and no rule in this repository read the two against each other.

`fault-prompt-grammar` read `types` and checked it for shape: no duplicates, no empty strings, a count
`check-fault-cases` could re-derive. `checkSampleCoverage` read the labels and asked whether every label had
a sample. The sentence that would have joined them was never written, so the vocabulary's *content* was
unchecked: it could name a type no sample carried, and it could be missing a type a sample carried.

**The hole was proved before it was closed**, which is the only way to know a guard was missing rather than
merely quiet: dropping `queue-duplicate-amplification` from `types` -- the type the new case in v3.78
labels -- left `fault-prompt-grammar` and `check-fault-cases` both **green**. The corpus would have shipped
a case whose answer the prompt declared illegal, and the corpus's own gate would have called that a pass.

`checkSampleVocabulary` now takes the two lists and returns one refusal per direction, because a reader
repairing a mismatch needs to know which side moved: `asks for a type the prompt does not offer` and `no
sample labels it`. It is wired into `check-fault-cases`, which is where the file is already open, and it is
enumerated in the export test so the next rule cannot be added without a name.

**What it still does not do** is decide which side wins when the two disagree. Adding a fault type to the
corpus means editing both lists, and the guard says so, but it cannot say whether a type that no case
labels should be deleted or whether a case is missing. That choice stays a decision with a reason in a
round, which is what the `provenance.categoryRule` count is for.

## Finding 504 — a refusal computed after the loop is a sentence a dying run never says

The heap guard existed, was tested, and was in the wrong place. It was computed once, over the whole
run, from the largest heap any case had been observed at:

```
ROUNDTRIP cost 270 case(s) in … min; largest 3712 MB of the 7168 MB this run was given (52%) at …
```

and then `if (share >= 0.9)` pushed a refusal. A test drove it with `--heap-budget 1` and it passed. The
guard's whole purpose is to say *"the next case of that size will not fit"* **before** the process is
killed, and it ran at the one moment when the process has already survived everything it was going to
survive.

Run `42674673341` is the measurement that makes this a defect rather than a style complaint. It reached
**6,960 MB of a 7,216 MB budget -- 96% -- at case 182 of 270**, the first TrainTicket case, and V8 ended
it with `FATAL ERROR: Reached heap limit`. The refusal fired zero times. The sentence in the log names no
case, no stage and no percentage, because the only sentence that would have was on the far side of the
loop.

**The refusal moved into the per-case `finally`**, which is where the number it reads is computed. At 90%
of the declared heap the run now pushes the sentence, names the case and the share, records what it
scored, and **stops deliberately** -- an exit with a reason instead of an abort without one. The cases
after it are not scored, and the report says how many were: `declared 3, scored 1` is a subset that is
stated, which is the difference between a partial run and a partial run standing in for the whole.

**And the number itself was wrong.** 7168 MB was 3.4x the largest case measured locally, on a synthetic
case of 122 MB. The corpus's own largest case is not a case of that shape: TrainTicket's first ships
**1,433,140 spans against SockShop's 95,000**, and the curve before it was flat -- the peak was 4,100 MB
at case 54 and did not move for 128 cases. A flat curve followed by a step is the one shape a
"largest observed so far" statistic cannot warn about, which is why the refusal is now checked per case
rather than over a summary. The workflow declares **12288**, and the number is not a guess about the
corpus: the refusal will name the case and the percentage the next time the corpus outgrows its job.

Two mutations carry it. `HEAP 1` removes the guard; the fixture it is caught by is the three-case run
under a 1 MB budget, which must report one case of three. The first draft of that mutation raised the
threshold to `1.5`, which under a 1 MB budget is a share of 1,184% -- the mutation was inert, the battery
said SURVIVED, and the repair was to delete the guard rather than to narrow it. A mutation that cannot
change an outcome is not evidence about a test.

## Finding 505 — the census was written after a loop that the only interesting run did not finish

`ROUNDTRIP CENSUS modalities <slice>: logs n/m, traces n/m` is the line that says what a corpus slice
actually ships. It was printed in the epilogue, from a map filled inside the loop. The dispatch that
reached TrainTicket is therefore the dispatch that printed **nothing about TrainTicket**: it died at that
slice's first case, one line after `ROUNDTRIP PASS 181/270` and before the `ROUNDTRIP MODALITY` line that
would have described its tables.

That is the third instance of one shape, and the corpus has now named it three times: v3.75's sentence
(built, queued, never printed), v3.76's report (written before every `exit`, and the abort was not an
exit), and this. Each repair moved one reading *closer to the case it describes*; this round moves the
last of them **before the first case**.

Every number in the census is a fact about the corpus that is already known when the walk finishes --
each declared case either has `logs.csv` in the file set or does not -- so there was never anything for it
to wait for. `takeCensus` now runs over the descriptors before the loop and `printCensus` is called once,
above the first case. A run that dies at case 182 still says what TrainTicket ships, and a run that is
stopped by its own heap refusal says what the *whole* slice ships, because the count is a property of the
corpus rather than of the cases that got as far as a comparison.

The same round read the reading that v3.75 and v3.76 were both written for: the check id on the failing
case line. It is **`data-csv-time`**, for two cases of 270 (`checkoutservice_cpu/2`, `checkoutservice_mem/2`):
*"the table's first instant is '0' and the injection time is '1708475361', which have to be on the same
clock"*. Two cases, one corpus shape, no action. The other 168 failures carry the id `modalities` and no
sentence -- their reason is the `ROUNDTRIP MODALITY` line above, so the case line says which check failed
and nothing about why. That is the same complaint one order smaller, and it is left stated rather than
fixed: a line that names the check is what the entry asked for.

## Finding 506 — an example in a document is a measurement nobody took

Finding 499 published the shape of the line the repair would print:

```
ROUNDTRIP cost 270 case(s) in 201.4 min; largest 3712 MB of the 7168 MB this run was given (52%) at
RE2-TT/ts-auth-service_cpu/1; slowest 51.3 s at RE2-TT/ts-order-service_cpu/2
```

No run produced that. It is a projection -- 270 cases at the observed rate, 3.7 GB from the local 17 MB
per MB -- written in a fenced block, in the position where a reading goes, with three decimal-exact
numbers that no artefact anywhere in this repository contains. The first run that reached the case named
in it died there, at **96% of that same budget**: the projection was off by a factor of two and in the
direction that matters, since a case costing 3.7 GB would have left 3.4 GB of headroom.

The failure is not the arithmetic. It is that a document printed an output, which a reader has no way to
distinguish from an output that was observed -- and this repository's whole method is that a number is
either measured or labelled as not. The block now says what it is: a projection from the local
measurement, with the two readings that replaced it beside it (4,100 MB at case 54; death above 6,960 MB
at case 182), and a pointer to the fact that the line is printed by every run so the next one can be
compared rather than consulted.

## Finding 507 — the gauge that exists to prevent a red with no failing test produced one

`test/support/event-loop-stall.ts` records "the longest stretch during which the loop did
not turn" and fails a file that exceeds 45,000 ms. Its purpose is singular and stated in
its own header: vitest's worker→main RPC has a 60-second deadline, a file that blocks
longer makes the run exit non-zero **with every test passing**, and nothing in the report
says which file did it.

This round's first run on a five-CPU, 8 GiB box was exactly that failure, produced by the
instrument:

```
Test Files  1 failed | 243 passed (244)
     Tests  6246 passed (6246)
...
Error: this test file held the event loop for 47727 ms, past the 45000 ms budget.
```

`gate-sites-are-proven.test.ts`, one file, one revision, one command — and the same command
on the same tree gave four different answers:

| reading | configuration | wall | CPU |
| --- | --- | --- | --- |
| 11,905 ms | that file alone, no coverage | 11,905 | 253 |
| 11,547 ms | that file alone, with coverage | 11,547 | — |
| 14,448 ms | full suite, `--maxWorkers=2` | 14,448 | — |
| 23,897 / 43,895 / 47,727 ms | full suite, four workers, three runs | 4.1× the first | — |

The only variable is what else was running. So the gauge's verdict is a function of the
machine's load, and its message -- "this test file held the event loop" -- is a claim about
the *file* that three of those four readings do not support. This is the round's subject in
one sentence: **the instrument reported one quantity and named another.**

Two repairs, one per cause, and neither replaces the budget:

1. **The reading now carries both quantities.** `stop()` returns `{ longestMs, cpuMs }`, the
   CPU figure is the processor time consumed inside the same window (sampled per tick, so it
   belongs to the longest stall rather than to the run), and the verdict prints both. A stall
   whose CPU time is close to its wall time is the file running its own code; one whose CPU
   time is a fraction of it is a child it waited for synchronously, or a process that was not
   being scheduled. The message says both readings and does **not** classify the case: a low
   CPU figure is also what a descheduled process looks like, and this instrument cannot tell
   those apart. The budget stays on wall clock, because the deadline it guards is a wall clock.
2. **The file's cost was the part that could be repaired.** Measured alone, 9,630 ms of wall
   against 820 ms of CPU: the work was I/O, not arithmetic. Twenty-nine calls to
   `pointerRoot()` each copied a 107-file fixture into `tmpdir()`, and every rule re-read and
   re-scanned the same ~60 test files. The fixture is now copied once (`fixtureCopyCount()`
   holds it), reads are cached by `(path, size, mtime-ns)` -- `make`'s invariant, so a rewritten
   file is seen -- and the two scans are memoised by the body itself, which cannot be stale by
   construction. Alone: **11,905 → 2,503 ms**, CPU 253 ms. Under the four-worker load that
   produced 47,727 ms, the same multiplier lands at roughly a tenth of the budget.

The next-nearest file is named rather than left to be discovered: `publish.test.ts` measured
28,183 ms without coverage and 31,855 ms with it in the same four-worker runs, which is 71% of
the budget. Its cost is `git` process starts and its shape is the one the config's comment
calls the honest division of labour -- the scheduler is what keeps it under. That is a
measurement, not a repair, and it is on the open list.

## Finding 508 — eight numbers, eight wrong, and nothing reading any of them

`docs/progress.md` has a `## Repository` section that answers one question -- how big is this
repository -- with eight rows. Its own prose says the numbers are "re-taken from `git ls-files`
and `git rev-list --count HEAD` at this revision", and that had been true at pass 13 and at no
revision since. Measured against the tree this round ran on:

| row | published | the tree | error |
| --- | --- | --- | --- |
| `Commits` | 95 | 530 | 5.6× |
| `Source files` | 45 | 97 | 2.2× |
| `Source lines` | 13,483 | 33,706 | 2.5× |
| `Test files` | 78 core + 3 cli | 245 core + 4 cli | 3.1× |
| `Test lines` | 25,174 + 2,740 | 104,552 + 3,242 | 3.9× |
| `Tests` | 2341 + 173 | 6,267 + 187 | 2.7× |
| `Tracked files` | 208 | 633 | 3.0× |

`grep -rn 'Tracked files\|Source lines\|Source files' scripts/` returns nothing. Neither does
the word `Repository`. The document's other count guard, `check-doc-counts.mjs`, reads **349**
published counts out of this same file and refuses a label that names the wrong scope -- and it
does not read this table, because its subject is rows carrying a count in one of the shapes it
knows. So the one table that publishes the repository's own size was the one table with no
reader, and it decayed by a factor of two to six while every gate stayed green. That is the
campaign's signature defect, in the document that keeps the campaign's records.

The repair is a derivation rather than a retyping: `scripts/check-repository-table.mjs` performs
all eight derivations and refuses a value that has drifted, a label it cannot derive, a table
that has lost a row, a `Commits` cell whose dated revision does not resolve, and a test-file
count on which its own glob and the suite's own measurement disagree. `--write` re-derives the
cells and nothing else. `Commits` is *dated* -- `Commits (at `d179592`)` -- because it is the one
row that cannot be current: the commit that writes it would be the commit it has to count, which
is exactly why it had been copied forward by hand for a hundred rounds.

The battery of twelve tests builds a **five-file repository** in `tmpdir()` and drives every
refusal against it. That is the point of the guard's `--root` and `--doc` flags: a gate that can
only be pointed at the repository it lives in can only be tested by editing that repository,
which is how a corpus ends up with gates no test can make red.

## Finding 509 — the inventory records the success line as the diagnostic of a failure

The gate above went into the inventory like every other gate, and the deriver wrote this:

```
scripts/check-repository-table.mjs:408  condition: check() !== 0
  diagnostic: 'check-repository-table: OK (${String(table.rows.length)} row(s) under ${HEADING}, ...'
```

That is the sentence the script prints when the table is **correct**, recorded as what the site
says when the table is **wrong**. The mechanism is lexical: `derive-gate-sites.mjs` walks
backwards from the site to the nearest printed string, and the first draft printed its verdict
before branching on its problems:

```js
if (problems.length > 0) { ...; console.error('... FAILED'); return 1; }
console.log(`... OK (...)`);
return 0;
```

Nothing could see it. The annotation was carried (it is keyed by line and message), the proof
resolved, the site was counted, and `violationsOf` asked only whether a row was proved or
exempt. A gate whose job is to say *where this repository can fail and what each place says* had
published, for its own newest site, the line it says when it does not fail.

The repair is one reordering -- the success path returns early, so the failure diagnostic is the
last string above the exit -- and the rule that would have caught it: `violationsOf` rule 11
refuses a diagnostic matching `:\s*OK\b` on either a site or a throw row. It costs nothing today
(zero of 133 sites and zero of 99 throw rows carry one) and it fails on the corrupted inventory
the battery builds, which is the only way to know a rule can fail.

What it cannot do is stated rather than implied: it reads a token, not control flow, so it
catches the shape this repository writes (`<script>: OK (` for success, `<script>: FAILED` for
failure) and would miss the word "OK" inside a sentence. The general repair -- a deriver that
knows which branch a string is printed in -- is a control-flow question, and this inventory is
built from tokens.

## Finding 510 — the proof of a `throw` row proved the gate exits, not that it stops before writing

The full gate run after the two findings above failed at step 8 of 34, in the battery that asks
the other half of a proof: `verify-sites-are-sensitive.mjs` hollows each exit and each `throw`,
one at a time, and asks whether some test goes red. It named one row.

```
verify-sites-are-sensitive: these exits can stop failing and no test minds:
  scripts/check-repository-table.mjs:380 is claimed by packages/core/test/check-repository-table.test.ts
    the file passes with that exit replaced by success
```

The row is this one, inside `rewrite()` -- the repair path behind `--write`:

```js
const expected = spec.derive(match);
if (typeof expected === 'object' && expected !== null && expected.error !== undefined) {
  throw new Error(`${spec.name}: ${expected.error}`);
}
lines[row.index] = `| ${row.label} | ${expected} |`;
```

Deleting the `throw` and running the file is the discriminating experiment the battery
recommends, and it agreed: **twelve of twelve green**. The test that was supposed to prove this
row read:

```ts
expect(rejected.status).toBe(1);
expect(rejected.err).toContain('the revision `deadbeef` does not resolve to a commit');
expect(readFileSync(fixture.doc, 'utf8')).toContain('Commits (at `deadbeef`)');
```

With the `throw` gone, all three still hold. The cell is written as `[object Object]`, the
`--write` run re-reads its own output, finds the same unresolvable revision there, prints the
same sentence, and exits 1. The label survives, because the label is what a rewrite does not
touch. **A rewrite that damages the document and then reports the damage passes every one of
those three assertions.**

The comment above the test stated the right property and the assertion stated a weaker one that
happened to hold:

> it has to stop rather than write the other seven and leave the eighth as it was, which is a
> half-repaired table that reads as a repaired one

"Stop rather than write" is byte equality with what was there before. That is what the test
asserts now, and the same experiment turns it red:

```
❯ packages/core/test/check-repository-table.test.ts:308:47
    308|     expect(readFileSync(fixture.doc, 'utf8')).toBe(before);
  Tests  1 failed | 11 passed (12)
```

The reachability half had been checked, and it passed, because the witness does reach the row.
That is exactly the gap `verify-sites-are-sensitive.mjs` was written to close one layer up, and
this pass walked into it while writing the guard that the battery was about to audit. The lesson
is the one a comment cannot carry: **a property written in prose is not a judge of anything** --
the same sentence, expressed as an assertion, fails when the behaviour is removed, and the
prose version agreed with the code the whole time.

## Finding 511 — the comparison that decides 168 of 270 cases had never been measured, and it cost 1.9 KB per row

Run `42707814166` (`d179592`, `workflow_dispatch`, anchor `rcaeval-re2`) reached case 181 of 270 --
`RE2-TT/ts-auth-service_cpu/1`, `signals=1433140`, the first TrainTicket case -- and then died:

```
[2695:0x13b5e000]  3094531 ms: Mark-Compact 11992.8 (12322.8) -> 11990.2 (12320.6) MB, ... allocation failure
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

`NODE_OPTIONS="--max-old-space-size=12288"` was in the command line, so the 12,288 MB that v3.79
declared was the budget being spent: the run reached 12,005 MB of live heap and V8 killed it 59
seconds after case 181 passed. What was known about that budget was that the **ingest** peak was
4,100 MB, flat for 180 cases, and that no run had ever carried a TrainTicket case to the end of the
**modality comparison**. So the remaining ~8 GB had no reading, and the open entry that said so was
one round old.

It has a reading now. `scripts/probe-modality-memory.mjs` builds a table in the corpus's shape and
measures the comparison's peak heap, and the same probe was run against the old shape and the new
one on the same 400,000 rows:

| rows | shape | peak heap | bytes/row | elapsed |
| --- | --- | --- | --- | --- |
| 400,000 | both tables materialised, one `Map<string, number>` of signatures per side | **734.4 MB** | 1,925 | 3,845 ms |
| 400,000 | both tables walked, one sorted signature array per side | **37.2 MB** | 98 | 2,104 ms |
| 1,433,140 | walked (an export that matches) | **313.8 MB** | 230 | 6,245 ms |

The 1,433,140-row reading is the corpus's first TrainTicket case. The old shape was not run at that
size: it is 19.7x the new one per row on the same probe, so 1,433,140 rows would have been about
2.76 GB -- and the machine it was measured on is the one that has to stay usable while the suite
runs. The extrapolation is stated as an extrapolation.

**The mechanism was two maps of long strings.** `compareModalityTables` materialised both tables
(`parseDelimited` into arrays of arrays of cells), then built `Map<string, number>` per side keyed by
the joined cells of every compared column. For a TrainTicket case that is two row arrays of 1.4
million rows and two maps of 1.4 million ~90-character keys, on top of the ~170 MB of CSV text each
side already holds. A map entry costs roughly three times a slot in a sorted array, and the key
costs a string either way -- so the map was the part that could go.

**The repair is a shape, in two pieces.** `parseDelimited` became a thin wrapper over a new
`delimitedRows` generator: one state machine, two entry points, because a second parser would be a
second answer to what a quoted field is and this repository has paid for that twice (findings 204,
316). The comparison now walks both tables, keeps only each row's signature, and drops the row --
and it compares the two signature **arrays after sorting** rather than two maps. A generator rather
than a callback because a `derived` column is checked against the same row of the *other* side, so
the caller has to advance two walks independently.

**The second piece is a branch that is a theorem.** A per-column multiset difference is a projection
of the row-level one: if the two multisets of signatures over all compared columns are equal, then
the multiset of any single column is equal too. So on a passing case the per-column `differ` is zero
by construction and the arrays behind it are not built at all; on a failing case they are built one
column at a time and released before the next. That is why the passing path is 40% faster than the
failing one on the same input, and it is stated in the code because a reader who did not know the
theorem would read the missing measurement as an oversight.

**What holds the shape.** A second implementation of the same specification, in the opposite shape
-- materialise everything, count with maps, index both sides by row number -- drives 60 generated
tables through both and compares every field of the verdict (`modality-comparison-shape.test.ts`).
The two share the specification and no line of code. Injected `needsDiffer: false` -- a value that
looks like an optimisation -- makes it fail, which is the only way to know the oracle is watching.
Six more tests hold the walker against the collecting entry point on the fixtures the parser already
had (quoted commas, escaped quotes, a multi-line cell, blank lines, CRLF, an unterminated quote,
empty text, and two independent walks of one string), and four hold the probe: that it reaches the
comparison on both paths, that it names the module it measured, and that both of its refusals fire.

The number is not in a test. A heap budget asserted on a synthetic table would be a test of the
allocator; the command that produces the reading is in `package.json` as `probe:modality-memory`,
and the readings are in the round's ledger with the sizes they were taken at.


## Finding 512 — a table that could not be parsed was reported as a table with nothing in it

`delimitedRows` is a generator: it yields rows and **returns** its errors, and the value a generator
hands back at the end is not a row. `openTable` takes the first `next()` for the header and keeps the
walk for the rows under it -- but for a text whose very first character opens a quote
(`"unterminated,header`) that first `next()` is not a row at all. The state machine runs to the end
of the text without completing one, records `unterminated quoted field` at line 1, and returns the
error list, so `first.done` is true and `first.value` **is the errors**. `openTable` read that as "no
header, therefore no rows", and the comparison reported `the corpus's logs table is empty` -- a
sentence about the corpus's content where the truth was a sentence about its syntax.

The test that should have caught it asserted `problems.length > 0`, which the wrong sentence
satisfies. That is the shape this repository keeps paying for: an assertion on the presence of *a*
diagnostic where the question is *which* one (findings 496, 504, 509).

The repair is in `openTable`, which now hands the first step's error list to the caller as
`headErrors` and derives `empty` from `errors.length === 0` rather than from "there was no first
row"; `drain` returns that list when the walk is already finished. The assertion is two-sided now --
the syntax sentence must appear and the empty one must not -- and it is red on the previous
revision. The arm of `unreadable` that says a table is empty is a different sentence and got its
first test in the same round (finding 514).

## Finding 513 — a check that could not run was reported as a column that agreed

`compareModalityTables` holds a `derived` column (`time` as `HH:MM`) to the minute of the corpus's
own instant, and the instant lives in another column (`timestamp`). Four things have to be present
for that check to run: the derived column on both sides, the instant column in the corpus, and a
`truncated` plan entry that states the resolution. The walk tested three of them.

`from` is looked up in the corpus's header, and `cellOrEmpty(row, undefined)` answers `''` -- a
deliberate spelling, because a row short of its header does have an absent cell and `''` is what the
row says. So a plan whose `from` names a column the corpus does not have read like this:
`minuteOfInstant('')` returns `undefined`, the row is skipped, `differ` stays at zero, and the column
was returned with `differ: 0` -- **the reading a column that was compared and agreed gets**. When
the source was in the plan but not in the corpus, a problem arrived from elsewhere and the case still
failed. When the source was in neither the plan nor the corpus, nothing raised anything, the column
reported agreement on every row, and the case could pass with a column in it that no reader had
checked.

Two changes. The source became one value -- `DerivedSource { from, unit }` -- present exactly when
the check can run, so the walk is never in the position of asking whether a unit it holds is there;
and every way the check can fail to run now reports `differ: rowCount`, in three sentences, because a
plan that does not truncate the column, a corpus that does not have it, and an export that came up
short send a reader to three different files. The 60-table differential oracle states the same rule,
so the fix is held by an implementation that shares no line with it (finding 511).

## Finding 514 — three parts of the coverage residual, and not one of them had ever run

After the walker's rewrite `modalities.ts` reported **100 / 98.29 / 100 / 100**. Three positions,
and reading them was the work:

- `drain`'s `headErrors === undefined ? [] : [...headErrors]` is **dead**. `delimitedRows` always
  `return`s its error array, so `headErrors` was `undefined` exactly when a header had been read --
  and a walk with a header has a row or its errors at the next step by construction. `headErrors` is
  required now, and the fallback is `step.value === undefined ? headErrors : step.value`, whose two
  arms are the two ways a walk can end.
- `if (unit === undefined) continue;` inside the paired walk is dead for the reason `skip` existed:
  the branch was only reached by a column that could be read. It is the `DerivedSource` of finding
  513 now, and the guard is a type.
- `if (empty) out.push(...)` is **not** dead and was not covered: a file of zero bytes had never been
  through `compareModalityTables`. Two tests now do -- one empty table against a table with a row,
  then both empty -- and they pin the ordering as well, the two table sentences before the twelve
  missing columns that an empty header cannot have.

The same read found `rca100Score`, whose `?? 0` fallbacks had never been executed: no test had ever
composed a record that omits a term. `rca100Score({})`, `{ entity: 1 }`, `{ fault: 1 }`,
`{ chain: 1 }`, `{ checkpoints: 1 }` are one test and two branch positions -- an absent term
contributes nothing, and half a process pillar is the mean of the term it carries rather than half
credit for the one it does not.

Coverage retaken over the tree this round ends on: **99.97 / 99.86 / 100 / 99.97** (3 statements, and
9 branch positions out of 6,438). The tree this round started from printed **99.78**% branches on 14
positions, so the five that closed are the three above and the composer's two, and the denominator
moved by the code the round added. `docs/progress.md` claimed two statements and four branch
positions for the same file set; the tool has never printed four on any revision. What is left,
measured: the `never` guard at the end of `aggregateFor` (`official.ts:2007-2009`, one branch
position of its own), seven fallbacks on a case record whose `terms` the type calls optional and
every producer writes (`official.ts:632` twice, `1278`, `1399`, `1536`, `1924`, `1929`), and the
`Number.isSafeInteger` test in the CLI's `parseInteger` (`src/cli/args.ts:240`). The seven are a
single leftover with a single correct fix -- make `terms` required in the record type and delete the
fallbacks -- and it is queued rather than claimed.
## Finding 515 — a claimant that ran out of time was filed as a claimant that was red

The sites battery runs each `provedBy` file on its own before it trusts a claim, because a
file that is already red catches every mutant applied to it and would make the whole table
green on a broken tree. That baseline run is `vitest run <file> --reporter=dot
--maxWorkers=1`. It inherited vitest's default ceiling of **30,000 ms per test**.

A full `verify:local` failed at step 10 with:

```
packages/core/test/gate-sites-are-proven.test.ts does not pass on its own (exit 1), so its
claims are unmeasured
  FAIL  test/gate-sites-are-proven.test.ts > … > rejects a sit…
  Error: Test timed out in 30000ms.
  Tests  1 failed | 68 passed (69)
```

The file was green. Run alone it takes **4,900 ms** for 69 tests, and its slowest test --
`rejects a site that is both proved and exempt`, which copies the pointer fixture -- takes
**2,370 ms**; the same shard passed on its own twenty minutes earlier in 13.2 minutes for 136
runs. What differed was that four claimants run at a time, each a vitest of its own, so the
ceiling vitest assumes (*a test on an idle box*) was measuring a different question
(*a test on a machine running three other claimants and their `git` children*). The verdict
was about the machine and was filed as a verdict about the claims.

Two changes, and neither touches the question the battery asks. The claimant run is given
`--testTimeout=120000`: 24x the whole file, so a test that hangs still fails, twenty-four
times later. And the baseline's sentence now separates the two findings it had been merging:
a file that did not finish says `did not finish inside its own 30000 ms of test budget …
unmeasured rather than unproven`, because "does not pass" sends a reader to the test and the
truth is the number. The per-test budget is read from the run's own output
(`Test timed out in (\d+)ms`) and not from the word `Timeout`, because this repository's
other timeout -- `[vitest-worker]: Timeout calling "onTaskUpdate"` -- is a run in which
**every test passed** and the worker died on an RPC deadline (findings 199, 507); reading it
as a test that ran out of time would send a reader to a number that run never mentioned.

The margin is now printed on every run instead of implied: `slowest claimant <file> <n> ms,
of N run 4 at a time (budget 120000 ms per test)`. A budget nobody prints is a budget that
is discovered by the next timeout, which is how this one arrived.

## Finding 516 — the file that was at 71% of the stall budget started blocking for 62 seconds

v3.80 wrote this down as a measurement and not a repair: `publish.test.ts` cost 28,183 /
31,855 ms against a 45,000 ms budget, its cost was process starts, and the open list said so.
The first coverage run of this round turned it from a margin into a red:

```
Error: this test file held the event loop for 61987 ms, past the 45000 ms budget.
Of that, 1740 ms were this process's own CPU time
```

1,740 ms of CPU against 62 s of blocked loop is the signature the gauge was rebuilt to print
in v3.80: this file is not computing, it is waiting -- **synchronously**, on
`spawnSync('git', …)`, which stops the event loop for as long as the child runs. The file
starts about **300** of them. Alone the whole file is **12,182 ms** of test time; under a
coverage run with eight files in parallel the same children take five times as long, and the
worker's RPC deadline is 60,000 ms -- the run the gate exists to prevent, one second away.

The repair is the first of the two the gate names (`Await the child, or split the file`):
every child is awaited now. One helper spawns and collects (`runChild`, shaped like
`spawnSync` -- `{ status, stdout, stderr }` -- because a hundred call sites read it and a
hundred rewritten assertions would be a larger diff than the defect deserves), the seven
fixture builders that call it became `async`, and every `it` in the file became `async`.
Measured after: the file alone is **13,690 ms** of test time (was 12,182: 1.5 s of promise
plumbing) and its blocked-loop time is **0 ms**, which is the number the budget is about. The
80 tests are unchanged in what they assert.

Three mechanical slips in that conversion are worth naming, because each was caught by a
different instrument and none by the compiler (the package's `tsc` project does not include
`test/`):

- A regex that prefixed `await` to helper calls also prefixed it inside two expected strings
  (`'every one of the 3 commit(s) this push carried'`), and the test that owned one of them
  failed. A string is not a call site, and a textual transformation does not know that.
- `await git(...).split('\n')` is `await (git(...).split)`: the assertion then compares two
  **promises** and `toBe` says `expected Promise{…} to be Promise{…}`. One site, one red.
- The fake GitHub server's tree handler stored `raw.stdout` (a string) where it had stored a
  `Buffer`, and `createTree` answered `POST /git/trees -> 500`. Nine tests whose *subject* is
  something else failed on it -- which is what a shared fixture is for.

And one more that no assertion caught: the async helper's return type was written inline as
`Promise<{ status: … }>`, and rule 7's scanner finds a function's body by taking the first
`{` after its parameters -- which landed on that type literal, so `runChild` was read as a
function whose body contains no spawn, and `publish.test.ts` was reported as declaring
`publish-cli.mjs` and never spawning it. The repair is a named `ChildResult` interface: a
return type written as a literal is a brace where a scanner expects a body.

## Finding 517 — "written by every producer" was false, and the repair it named was the wrong one

`## Coverage` carried, from v3.81, this sentence and the plan it implied:

> a case record's `terms` is optional in the type and written by every producer, so … all
> guard a shape the data cannot have. The repair is to make `terms` required in the record
> type and delete them.

Measured against the file rather than against the sentence: **four** functions construct an
`OfficialCaseScore`, and **two of them do not write the map**. `scoreFacetSubset` (the rule the
three RCAEval anchors use) and `scoreCloudOpsBench` are set comparisons over facets, so they
have no named terms to carry -- and the field's own doc says "when the target's rule has them".
The second clause of that sentence is false, and the first clause's error is a consequence of
it: the optionality is not a leftover, it is **used**, by two producers that are correct.

The decision does not reverse, because the *distinction* the type draws is one no reader can
observe. `meanOfPresent` drops a term with no denominator whether the term is missing or the
map is empty, and `rca100Process`'s `terms === undefined` arm returned exactly what an empty map
returns one line later. A type that says "maybe absent" where the only thing that can happen is
"maybe empty" buys a fallback at every read and guarantees nothing at any of them -- seventeen
`?.` reads in the aggregate, plus the arm. So `terms` became required, the two facet rules write
`{}`, and the empty map is documented as the shape a rule with no named terms carries.

Then the seven positions, one at a time, because they turned out not to be one leftover:

| position | can an input reach it? | what was done |
| --- | --- | --- |
| `checkpointToken`'s `typeof value === 'string'` and its `: ''` (two) | **yes**: `value` is `unknown`, read out of the case file, where a JSON array or object is a thing an annotation can contain. Open because every fixture passed `42` | two tests: a string value is carried verbatim (`order\|cpu\|>=\|high\|count/min`), an object contributes nothing (`order\|cpu\|>=\|\|count/min`, not `[object Object]`) |
| `reachesAny`'s `targets.size === 0` | **no**: one caller, which is guarded by `gt.chain.length === 0` on the outside and by `componentMatches` on the inside, so `from` is non-empty and `targets` is `chainNodes` of a chain whose every token was built from two non-empty names | deleted, with the argument in the doc comment: an empty target set answers `false` from the loop, and so does an empty `from` |
| `scoreFacetSubset`'s `scored.length === 0` | **yes**, through the reader: `parseRcaEvalDirectory`'s service group is `(.*)`, so a directory named `RE2--adservice_1` parses to an empty service, and the case is then real, counted, and worth zero | a test, not a deletion: the alternative to the guard is `0 / 0`, and `NaN` poisons every mean it enters |
| `rca100Process`'s `terms === undefined` | **no**, once the map is required | deleted by the type |
| the two `?? 0` reads in the pooled aggregate | one of each | finding 518 |

Measured, the package went from **9 branch positions to 3**: 99.86 → **99.95** branches, with
statements, functions and lines unmoved (99.97 / 100 / 99.97). The three that remain are the
`never` backstop's three statements and the position that reaches it, the CLI's
`Number.isSafeInteger` (exempt and argued in `acceptance.md` §2.39), and one fallback below.

The lesson is not "read the code before planning" -- the plan was written by a round that had
just read three positions. It is narrower and worse: **a summary sentence about seven positions
is a claim about all seven, and it is written at the height where the differences disappear.**
"Written by every producer" was true of five of the seven and false of two, and the two were
the two whose repair was different. The positions had to be read one at a time, and the only
thing that said so was that the sentence had a range.

## Finding 518 — two fallbacks five lines apart, and only one of them changes an answer

The pooled AIOps2025 branch reads two terms the case producer always writes:

```ts
const em = cases.reduce((sum, c) => sum + (c.terms['evidenceHits'] ?? 0), 0);
…
.map((c, i) => ({ la: c.terms['la'] ?? 0, pred: predictions[i] }))
```

Both were uncovered, and both looked like the same leftover -- a fallback for a term that is
never missing. They are not the same, and the operator downstream is the whole difference:
`em` is **added**, so an absent count has to contribute nothing, because `undefined` in a sum is
`NaN` and `NaN` is the one number an Explainability of one tenth cannot survive -- it would
print as `NaN` in a report whose every other figure is 0..100. `la` is **compared** to `1`, where
absent and `0` already answer the same `false`.

So one was a guard and one was a habit. The habit lost its fallback; the guard kept it, and the
reason is now written between the two rather than left to be inferred by the next reader who
notices that two adjacent lines do not match. That asymmetry is deliberate and it is the kind a
tidy-up removes: a reader who makes the pair consistent in either direction either reintroduces
a `NaN` or adds a branch no input can reach.

What is left is honest and it is one position: `Record<string, number>` cannot say "this rule
always writes these two keys". Closing it means a per-target typed record -- a discriminated
`terms` union over the nine targets -- which is a structural change, not a fallback's worth of
work, and it is recorded as a leftover rather than smuggled in under a coverage number.

## Finding 519 — a flag that sets a *default* does not reach a test that declares its own

v3.82 gave every claimant in the sites battery its own budget:

```js
spawn('pnpm', ['exec', 'vitest', 'run', '--root', …, `--testTimeout=${CLAIMANT_TIMEOUT_MS}`])
```

and the sentence beside it said the battery now gives each claimant 120,000 ms. The next full
run reported:

> `packages/core/test/gate-sites-are-proven.test.ts did not finish inside its own 30000 ms of
> test budget (exit 1), so its claims are unmeasured rather than unproven`

**30,000, not 120,000.** `--testTimeout` sets the default a test inherits; a file that states
its own -- and this one does, `describe(…, { timeout: RULE_TIMEOUT_MS })` -- keeps it. So the
flag reached every claimant except the slowest one, which is the only one it was written for.

Whether 30,000 was ever a statement about the work is a measurement, and it says no:

| reading | value |
| --- | --- |
| the three tests that time out, under v8 coverage | 4 / 50 / 44 ms |
| the whole file, standalone | 476 ms |
| four copies run **concurrently**, at v3.83 | 8.22 / 8.32 / 8.33 / 8.22 s, 69 of 69 passing in every copy |
| the largest event-loop stall this repository has measured for a cheap test | **47,727 ms** (finding 507) |

The budget was below a disturbance the repository had already recorded. So the number moved to
**120,000**, chosen to equal the battery's own ceiling -- not because the file needs two
minutes, but because two numbers that are meant to be one number should be one number, and
because a budget under a measured stall is a budget that measures the machine.

The verdict line is what made this findable: it printed the budget it used (`30000`), not the
budget the battery passed on the command line. Had it printed 120,000 -- the number in the
flag -- the file's own declaration would have stayed invisible for another round.

## Finding 520 — a count derived before `git add` is a count of a tree that never existed

v3.83 published `Tracked files 638`. The commit that carried it contained 639, and the next
`docs:check` refused:

> `## Repository` says '638' for Tracked files; the tree says '639'

Every file row is cut from `git ls-files`, which reads the **index**. The new test file existed
on disk and was not staged when `--write` ran, so the derivation counted a tree that the commit
was about to make untrue -- and the guard's own success line says "every one derived from the
tree it was just rewritten from", which was true and useless: the tree it was rewritten from was
not the tree the commit would contain.

A number that is wrong the moment it is written, and that nothing can catch until one mode
later, is the class this repository calls a claim with no reader. The repair is a refusal rather
than a warning, because the workflow stages with `git add -A`: while the index disagrees with the
worktree, `--write` refuses, names the first untracked file, and names the way out.

The interesting part is the fixture. `check-repository-table.test.ts` builds a five-file-repository
and asserts `| Tracked files | 7 |` -- and its document was written **after** the commit, so it was
untracked in every fixture, and 7 was the count of a tree that omitted the very document the table
lives in. The fixture had encoded the defect for as long as the guard existed, which is why no test
disagreed: a fixture reproduces the measurement its author made, and this author made it the same
way the round did. The number became 8 the moment the guard learned to refuse.



## Finding 521 — RE2's log table is not one table, and the plan said it was

The 2026-11-11 dispatch (`5c1a8a9`, run `43085008634`) carried 270 cases through the round trip
for the first time and scored **24**. Two hundred and forty-four failed, and every one of them
with the same sentence:

> `RE2-OB/checkoutservice_cpu/3: the exported logs table is not the corpus's - 178461 row(s)
> against the corpus's 178461; the corpus's logs table has no 'cluster_id' column; the corpus's
> logs table has no 'log_template' column`

Same row count, and two columns the plan names that the corpus does not have. The count is the
evidence and it is exact: **24 cases have `cluster_id` values in their corpus and 244 have zero,
and 24 is the number that scored.**

The archives say the same thing, read directly (`RE2-SS.zip`, `RE2-OB.zip`, 2026-11-12, sha256
matched against `golden-master/official-assets.json`):

| Case | `logs.csv` header |
| --- | --- |
| `RE2-OB/checkoutservice_cpu/1` | `time,timestamp,container_name,message,level,req_path,error,cluster_id,log_template` |
| `RE2-OB/checkoutservice_cpu/3` | `time,timestamp,container_name,message,level,req_path,error` |
| `RE2-SS/carts_cpu/1` | `time,timestamp,container_name,message,level,req_path,error` |

Two case directories of the **same service and fault type**, eleven apart in the case list, and
different log schemas. The split does not follow the suite (`RE2` is four characters over three
corpora) and it does not follow the slice (64 of Online Boutique's 90 are seven-column). So no
plan keyed on suite or slice can state the header, and the design that said "the plan is the
claim" had a claim the corpus does not have.

The sentence that had to go is the one this module's own comparison raised: *a planned column the
corpus does not have is a defect*. That is right for a column the comparison reads values from
-- a corpus without `message` is a corpus that was re-cut -- and wrong for a `not-carried` column,
which is a statement about what the **exporter** writes. The export's header is the format's
(nine columns for RE2, from `RCAEVAL_LOGS_COLUMNS`), the IR has no field for those four, and a
corpus that does not carry one of them loses nothing by it. The absence is now a field on the
reading (`absent: 'corpus' | 'export' | 'both' | undefined`) and a census line, not a failure:

> `ROUNDTRIP CENSUS columns RE2-SS: logs lacks cluster_id on 90/90 case(s), log_template on 90/90 case(s)`

Verified on the archive rather than on a fixture: `RE2-SS/carts_cpu/1` through the local round
trip, **86,592 of 86,592 log rows, 0 signatures only in the corpus**, and the two absent columns
named once in the census.

## Finding 522 — 1,572 rows of one SockShop case were refused as "missing column" when the column was there

The same run reported, for every SockShop and TrainTicket case, an export shorter than the corpus
(`85020/86592`, `279624/279630`) and signatures only in the corpus of the shape

> `corpus only: 1705595459383000000 | front-end |  | `

Counting the archive: `RE2-SS/carts_cpu/1`'s `logs.csv` has **1,572 rows whose `message` cell is
empty** out of 86,592, and 1,572 is the gap. The reader's log branch was

```ts
const body = asText(get(layout.logBody));
if (body === undefined) {
  return { ok: false, kind: 'reject', reason: `missing required column '${layout.logBody}' (log body)` };
}
```

and `asText` folds `''` into `undefined`, so an empty **cell** was reported as a missing **column**.
Three things were one branch: a layout that names no body column, a record that has none, and a
cell that is empty. The sentence named the column in all three cases, which is how a corpus with
1,572 blank log lines reads as a file whose header is wrong.

The refusal was also inconsistent with the rest of the package: `loki`, `elasticsearch` and
`clickhouse` all emit `{ kind: 'log', body: '' }` for an empty line, and each has a test that
says so. `LogPayload.body: string` is what an empty line is for -- a line with no text is still
a line, at an instant, on a service. The branch now tests the *presence* of the value and keeps
its text, so `''` is a body and a null or absent one is still a refusal.

The test that had to change said the opposite ("An empty `message` is a record this reader
refuses"), and it was right about the code and wrong about the corpus. It survives with a cause
that is still a refusal -- an instant that cannot be parsed -- so the invariant it exists for (a
row that does not reach the export fails the case) is still held by a test.

## Finding 523 — an empty cell is not the epoch, in the second place it was true

Two of the 270 failed with a different sentence:

> `RE2-OB/checkoutservice_cpu/2: the export does not match rcaeval-re2's field contract -
> data-csv-time (the table's first instant is '0' and the injection time is '1708475361', which
> have to be on the same clock)`

The corpus explains it. That case's `simple_metrics.csv` ends in rows of the shape
`,,,,,,,,,,,,11028480,43077632,…`: the collection stopped writing the clock before it stopped
writing the readings -- 256 such rows. In the adapter,

```js
const cell = row[timeIndex];
if (cell === undefined) continue;
const seconds = Number(cell.trim());
```

`Number('')` is `0` and `Number.isFinite(0)` is true, so 256 rows were filed at **1970-01-01**,
and the exported `data.csv` led with an instant of `0`. The guard that was there (`cell ===
undefined`) catches a row *shorter* than the header and not a row whose cell is blank.

`modalities.ts` already carries the sentence for this class -- "An empty cell is not the epoch, and
`BigInt('')` is `0n`" -- and it is the second module in this tree to need it. The row is now
dropped and **counted**, because "the corpus has rows with no clock" is a fact about the corpus
that the run should say rather than one a diff should reveal:

> `ROUNDTRIP context 1 case(s) carried 256 row(s) with no instant; a row with no clock is not a
> sample, and filing it at 1970 would put it on no clock at all`

Verified on the archive: `RE2-OB/checkoutservice_cpu/2` passes locally, 110,067 log rows and
199,960 spans, 10.5 s, 1,499 MB.

## Finding 524 — the round trip could not testify to the one thing it is the witness for

`compareModalityTables` reads a `not-carried` column's `differ` as the number of cells the export
**wrote** into a column it declares empty, and `rowsMatch` did not read that number. So an export
that filled `methodName` or `cluster_id` -- contradicting `RCAEVAL_UNFILLED_COLUMNS`, the
exporter's own statement about itself -- passed the fourth anchor, and the contradiction appeared
only as `1 written` inside a line a reader sees 270 of.

It was found by the *oracle*, not by a test of the module: `modality-comparison-shape.test.ts`
carries a second implementation of the same specification, that one counts `columns.every(reading
=> reading.differ === 0)` toward `rowsMatch`, and its own comment claims the generator produces "a
value in a column declared not carried". The generator did not. Adding the case it claimed to have
(seed 5, `damage === 5`) made the two implementations disagree, and the oracle was right.

The repair is the sentence the failure list needed anyway: a value in a declared-unfilled column
is now a `problem`, so the case fails and the reason names the column, the count, and the statement
it contradicts. Two hundred and seventy real cases write 0 values in all four columns, so nothing
in the estate changes; what changes is that a future exporter cannot pass by writing one.

## Finding 525 — the battery published one budget for 61 claimants, and nine of them are held to another

`verify-sites-are-sensitive.mjs` starts each claimant with `--testTimeout=120000` and closes its run
with a sentence about that number:

> `verify-sites-are-sensitive: slowest claimant … (budget 120000 ms per test)`

`--testTimeout` sets the **inherited** default. A file that writes `describe(…, { timeout: 30_000 }, …)`
keeps 30 000, because replacing a default is what a declaration is for. Finding 519 met this one file
deep: a claimant kept its own 30 000 for a whole round while the flag had been raised to 120 000, and
the repair raised both numbers -- that file's constant and the flag -- on the principle that two
numbers which should be one should be one. What the repair did not do was ask how many *other* files
state a number.

Measured over the 61 files `golden-master/gate-sites.json` names as claimants:

| claimant | its own declaration | line |
| --- | --- | --- |
| `check-cli-reference.test.ts` | **30 000** | 153 |
| `check-fault-cases.test.ts` | **30 000** | 384 |
| `check-no-unsafe-shell.test.ts` | **30 000** | 465 |
| `check-official-roundtrip.test.ts` | **30 000** | 330 |
| `check-user-guide.test.ts` | **30 000** | 278 |
| `fetch-official.test.ts` | **30 000** | 613 |
| `probe-built-module-guards.test.ts` | **30 000** | 367 |
| `publish.test.ts` | **30 000** | 221 |
| `reader-against-backend.test.ts` | **30 000** | 199 |
| `gate-sites-are-proven.test.ts` | 120 000 | 1115 |

**Ten declare a budget of their own, and nine of them are below the battery's** -- the tightest by a
factor of four. So the number in the log was a statement about the flag, read as a statement about
every claimant.

The direction is what makes it a defect rather than a curiosity. A claimant that runs out of *its own*
budget is reported as **unmeasured**:

> `… did not finish inside its own 30000 ms of test budget (exit 1), so its claims are unmeasured rather
> than unproven`

Unmeasured is the expensive verdict: the claims that file proves stop being proved, the battery goes
red, and the round that meets it starts from a sentence about the machine. A budget that is merely
tighter than the flag has to be discovered by a timeout, and until this round no instrument in the tree
had read one.

**The repair reads every claimant and prints what it found.** `testBudgetDeclarations` (in
`site-proofs.mjs`) resolves the three spellings vitest accepts -- the options object, the positional
third argument, and `vi.setConfig({ testTimeout })` -- against a `const NAME = N;` in the same file,
and `governingTestBudget` answers which of the two numbers a claimant will be held to. The battery now
prints, on every run:

> `verify-sites-are-sensitive: 10 of 61 claimant(s) declare a test budget of their own against the
> battery's 120000 ms, and 9 of those are below it: …:153=30000, …:384=30000, …`

and reports the slowest claimant against the budget it is actually held to, as a share of it
(`slowest claimant … 8 000 ms of the 120000 ms it is given (7%)`), where it used to print the flag.

**And a timed-out claimant's sentence now says whose number it was given.** The run already read the
number out of the output; it could not say where that number came from, and the two repairs -- raise a
declaration, raise the flag -- are different files. Three provenances, each said:

| what the number is | what the sentence says |
| --- | --- |
| the file's own declaration | `its own declaration furnishes (line 153; the battery furnishes 120000 ms)` |
| the battery's flag | `the battery furnishes, and this file declares none of its own` |
| neither | `neither the battery nor any declaration in this file furnishes` |

The third row is reachable and was reached by this battery's own fixtures before it was a state the
gate could name: a run that prints `Test timed out in 30000ms` while the flag furnishes 120 000 and the
file declares nothing was given its ceiling by something the gate cannot see -- an environment variable,
or a `vi.setConfig` executed at runtime.

**What the repair declines, and why.** The nine are reported, not refused. A claimant's declaration is
that file's statement about its own work -- `fetch-official.test.ts` gives one test 60 s and another
30 s because it knows which of them waits on a socket -- and there is no measurement in this tree
saying 30 s is wrong for those tests. The one state the gate *does* refuse is the one where the census
itself would be a guess: a budget written as a name with no `const` in the file, which would otherwise
be read as "no declaration" and published as the battery's number. Measured: 0 of 61 today, which is
why the refusal had to be built as a fixture rather than found in the estate.

## Finding 526 — the reader's first reading was its own fixture

The first run of `testBudgetDeclarations` over the claimant set reported **eleven** files, the tightest
at **15 000 ms**, and the tightest was `site-proofs.test.ts` -- the file whose tests are *about* this
reader. It holds a dozen fixture sources as string literals, and one of them is

```ts
"vi.setConfig({ testTimeout: 15_000 });"
```

a sentence about a budget that the reader read as a budget. Its own 120 000 ms declaration, three
hundred lines away, was the number it should have reported.

A text reader has to say what text is not code before it counts anything, so the scan now runs over a
copy in which comments and string bodies are replaced by spaces -- offsets preserved, so every line
number it prints still points at the character a reader will find. Template literals are blanked whole,
interpolations included: a budget inside `${…}` is an expression's value, not a declaration's.

Re-measured on the same tree: **ten** files, the tightest 30 000 in `check-cli-reference.test.ts:153`,
and the phantom gone. The blanking also makes the *declined* count mean something: 8 `timeout:` keys in
the claimant set belong to `spawnSync` and to a top-level object, and they are counted rather than
silently skipped, because "no budget declared" and "a budget declared somewhere this reader does not
look" are two different sentences and only one of them is true.
