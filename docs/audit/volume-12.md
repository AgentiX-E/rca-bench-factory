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

