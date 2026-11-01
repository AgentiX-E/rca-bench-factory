## v3.21 — the slice that exists for logs and traces, and the export that carried neither

### One: the number that was right for the wrong reason

The fourth anchor scored 735 cases at `oracle=1.00`. Every one of its 90 RE3 cases exported a `logs.csv`
and a `traces.csv` holding **a header and no rows**, and no job, guard or document noticed -- because the
official metric reads the case directory name and the metric table, and the shape check was satisfied by
the two files existing.

The first measurement of the round took a corpus case already on this machine and asked the exporter what
it wrote for it:

| file | corpus | export |
| --- | --- | --- |
| `logs.csv` | 11 106 711 B, 70 076 rows | 57 B, **0 rows** |
| `traces.csv` | 29 538 448 B, 164 920 spans | 116 B, **0 rows** |

`adaptCase` returned a file map with one entry -- the metric table. The two files were written and never
read. Finding 315.

### Two: the reader was wrong about three of the corpus's decisions

Feeding the tables in was not a one-line change, and the measuring was the reason:

| what the generic reader decides | what the file says | what it costs |
| --- | --- | --- |
| `time` is the timestamp (`time` is first in the aliases) | `time` is `HH:MM`; the instant is in `timestamp` (ns) / `startTime` (us) | 0 of 235 000 rows survive |
| `container_name` is not a service alias | it is the service | every log row refused |
| `duration` is in the `durationMs` aliases | the corpus writes **microseconds** | every span 1 000x too long |

So the layout is stated, and `FileLayout` gained the three things it could not say: a pod column, a node
column and the duration's unit (`ms` | `us`, exhaustive over a closed tuple). The aliases were not
reordered: `time` is the instant in plenty of files, and putting `timestamp` first only moves which corpus
is misread.

Two columns had no route into the IR at all. `pod_name` and `node_name` are RE3's alone and live as
resource attributes, while `RCAEVAL_UNFILLED_COLUMNS['logs/RE3']` was **empty** -- the export claimed six
of six while no file-fed case could fill two of them.

### Three: the status column was not OTel's

`traces.statusCode` was documented, coded and tested as OpenTelemetry's `0`/`1`/`2`. The corpus's values
over one case's 164 920 spans:

| value | spans | reading |
| --- | --- | --- |
| `0.0` | 157 156 | gRPC `OK` |
| *(empty)* | 7 626 | the frontend's root spans |
| `14.0` | **138** | gRPC `UNAVAILABLE` |

The 138 are the whole failure signal of `emailservice_f1/1`: all of them `checkoutservice` calling
`hipstershop.EmailService/SendOrderConfirmation`, all after the injection instant. Fourteen is not an OTel
status. And the mapping was wrong in the *commonest* case, not an edge: an OTel `OK` was written as `1`,
which in this column is gRPC `CANCELLED`.

The column is now empty and named in `RCAEVAL_UNFILLED_COLUMNS.traces`, and the test that used to assert
the mapping asserts the opposite with the corpus's numbers in its comment.

### Four: the comparison found a bug in the reader, then one in the corpus

On its first real run the comparison failed on two log rows of `adservice_f3/2`, and the cause was
`parseTimestamp`:

```ts
const n = Number(value);            // 1.7e18 needs 61 bits; a double carries 53
const multiplier = 1e-6;            // so the input is rounded to a step of 256 ns first
```

`1732275121315999877` ns -- 11:32:01.315987877 -- came back as `.316`. Two of that case's 69 275 rows, and
one more in `currencyservice_f1/1`. The conversion is `BigInt` now, which also settles the direction: BigInt
division truncates toward zero exactly as `TimeClip` does. Finding 316.

Then the third disagreement came from the other side: of `currencyservice_f1/1`'s 61 828 log rows, **one**
has `time` = `06:17` beside a `timestamp` of `1731910619999999863`. The corpus derived that minute through
a double at microsecond resolution and 0.14 us below the boundary rounded up. **The corpus's own two
columns disagree.** So `time` is compared against the *instant* rather than against the corpus's rendering
of it: the exported cell must be the minute of the corpus's instant, and the corpus's disagreements are
counted. A `time` an hour out still fails.

### Five: what the anchor can now say

```
ROUNDTRIP modalities 60 table(s) over 2 modality(ies): 2 095 206 of 2 095 206 log row(s),
4 755 090 of 4 755 090 span(s); 330 of 510 column(s) exact, 6 415 067 cell(s) truncated to
the millisecond, 9 043 794 value(s) in columns the IR does not carry

ROUNDTRIP PASSED (30 case(s) round-tripped through the official layout)
```

Every row of a 30-case local slice of RE3-OB, not a sample, and the columns are named by kind: 330 exact,
60 derived (`time`, checked against the instant), 60 truncated to the millisecond, 60 not carried
(`methodName`, `statusCode`) -- 510, the plan's whole width.

| gate | result |
| --- | --- |
| a row the corpus has and the export does not | the run fails and names the table, the counts and two example rows |
| an RE3 case with no `logs.csv` | fails on the missing file rather than scoring the case as metric-only |
| a suite with no plan (RE2) | prints nothing about modalities -- a zero would read as "read them, found nothing" |
| a declared-unfilled column that carries a value | counted as a disagreement between the export and its own statement |
| memory | one case needs more than 1 GiB and less than 1.5 GiB of heap; the largest archive case is 29 MB |

One anchor moved, and it moved for a reason that is in this chapter: `golden-master/expected.json` now
records `RE2-order-prod/order_cpu/1/traces.csv` at **274 bytes / `72650b11…`** rather than 276 /
`cec8cdf8…`, because the status column carries no value in either of its two rows. That is the whole
difference -- one byte per row -- and it is the only anchor this round re-signed. A re-signed anchor is
the one kind of change a reader cannot audit from the diff alone, so it is stated here rather than
left to `git show`.

### Six: the stopwatch fired, and it was this round's own tests

The first full run after the change failed with **no failing test**:

```
Error: this test file held the event loop for 63759 ms, past the 45000 ms budget.
```

`test/setup/stall-watch.ts` sums each file's *blocked* stretches against a 45 s budget, and
`check-official-roundtrip.test.ts` holds 58 `spawnSync` calls of a script that runs nine
published rules -- each one blocking the file's loop for the child's whole lifetime. It sat
within a second of the budget, and this round's four extra spawns tipped it. The same
revision then measured **44 s, 46 s, 63 s and 66 s** across four runs, which is the
difference between a green suite and a non-zero exit with nothing failed.

Two repairs, in the order the gauge's own message gives them. The new contract's tests moved
to `check-official-modalities.test.ts`, so a budget is spent by a file that spends it on one
subject. And every spawn in the round-trip file is `await`ed rather than blocked on: the same
wall time, and the loop free while the child runs. That file's blocking went to nothing
measurable and the next full run was green.

The instrument was right in both readings. It named the file, the number and the budget, and
what it was reporting was a real cost this round had added to a file already at its limit.

### Six and a half: the second cause, which the first repair did not reach

Splitting the file and awaiting its children brought the round-trip file's blocking to nothing, and the
next full run was still red -- on a *different* file, with the same message and again no failing test:
`ingest-report.test.ts held the event loop for 56 358 ms`. Six runs of one revision then measured **44,
46, 56 358, 65 578, 44** -- green, green, red, red, green -- on a file this round never touched.

The variable was not the code. `maxWorkers` is `min(8, availableParallelism() - 1)`, and finding 297
wrote that line so the cap would follow the machine. On this box it does not:

```
availableParallelism()            ->  32
/sys/fs/cgroup/cpu.max            ->  400000 100000     (4 CPUs)
```

Eight workers on a four-CPU allowance, so every file's wall time doubled and `ingest-report.test.ts` --
synchronous CPU work, whose whole duration *is* its blocked time -- crossed a budget written for real
time. `--maxWorkers=4` was green in 57 s.

So the cap now reads the quota as well as the reported count (`min(reported, quota)`, one CPU left to the
main process, the floor of 2 and the ceiling of 8 unchanged), which leaves the CI runner exactly where
finding 297 put it: it reports 4 and has no quota file to read, so it gets 3 workers before and after.
Finding 317.

Raising the budget was the other direction and the wrong one. The budget is a statement about how long
one file may block, and it was correct; what was wrong was how many processes competed for the allowance
it is spent against.

### Seven: the commit carried the change and not the file the change generates

The commit that made RE3's export carry its log and trace tables also moved two things that are
generated from it -- the `statusCode` note in the export spec, and the example `traces.csv` rows whose
status column used to hold a value -- and neither generated file was regenerated. The full gate says so
at step 24 of 31:

```
$ pnpm examples:check
site/assets/data.js is stale - run `pnpm examples:gen` and commit the result.
```

The round had re-signed its anchor and read that as "the derived things agree". It does not: the anchor
holds no entry under `site/` (`grep -c 'site/assets/data.js' golden-master/expected.json` -> 0), so it
could not have said anything about that file. What it did instead was move by two bytes -- one byte per
row of the status column that no longer carries a value -- while the site data stayed three lines out of
date.

The commit was made after running the five steps its author expected to move. Step 24 was not one of
them. That is the entire argument for running all 31, and the reason the receipt is keyed by tree: a tree
that cannot pass cannot be pushed, so the cost is one full run per published tree and the receipts are
the list: `b2b616b`, `264de30` (the repaired trees), `bc0ed03` (the commit that records it), `78f3294`
(the first correction of this paragraph) and one more for the paragraph you are reading. The two artefacts were regenerated at their own commit and folded into it
(`513d2c9` -> `bb87c24`), and the child was rebased onto it (`a15b0d4` -> `6454d96`). Finding 318.

The repair then ran into the mechanism built for finding 310 and was stopped by it for a moment:
`git commit --amend` refused because `golden-master/doc-counts.json` differed from a journal left by a
`verify:local` killed at step 19. The journal's holder was dead and its record described the *child's*
counts (207 / 5047) while the index held the parent's (206 / 5039) -- a difference the record cannot
distinguish from a mutation, which is the record working. The tree was checked against `HEAD` by hand,
the abandoned journal removed, and the amend made; restoring from it would have published the child's
test counts inside the parent.

### Eight: what this round did not do

It did not read RE2's tables. RE2's log table is nine columns, four of which the IR has no field for and
one of which -- `level` -- feeds a closed severity vocabulary that no RE2 archive in this tree has been
measured against. Reading it means answering what an unseen `level` should do, and inventing that answer
is the shape this repository spends its rounds undoing. The omission is stated in the script, and it is
the first item below.

It did not make the export byte-identical to the corpus, and no honest claim could: three of the corpus's
instants are finer than the IR's clock and two of its columns have no field. What it made is the claim
that every row is carried and every column that should agree does.

### Readings


> Ledger for `v3.21`.
| item | value |
| --- | --- |
| `core` suite | **207 files, 5047 tests passed** |
| `cli` suite | **4 files, 187 tests passed** |
| repo | **211 files, 5234 tests passed** |
| coverage | **99.97 / 99.76 / 100 / 99.97** -- branch up from 99.75, and the new module at 100 on all four |
| `modality-comparison.test.ts` | 35 tests, **100 / 100 / 100 / 100** |
| audits | 1–**318**, **315 findings** (absent: 118, 132, 133) |
| RE3-OB local round trip | 30 of 30 cases; 2 095 206 log rows and 4 755 090 spans carried |
| the truncation | 6 415 067 cells at the millisecond; 9 043 794 values in two columns |
| export failure sites | 95 across 50 scripts, annotations carried |

### Left open

- **RE2's log and trace tables are still not read.** Four of the nine columns have no IR field and `level`
  feeds a closed vocabulary; no RE2 archive has been measured in this tree. `[open: reading them needs a
  measured answer for an unseen level, and the archive to measure it on]`
- **`time` is checked against the instant, not against the corpus's cell.** A corpus whose `time` column
  were wrong on every row would be reported as a large disagreement rather than as a failure. That is
  deliberate -- the corpus disagrees with itself on one row in 62 000 -- and it is the one column whose
  verdict is a report rather than a gate. `[open: the instant columns carry the proof for it]`
- ~~**This project's own 30-case corpus still exports empty modality files.**~~ Closed by finding 321
  (v3.22) — and not by the repair this entry predicted. The empty file was the exporter's claim about
  the case rather than the case's missing annotation: it wrote both tables for every case on the
  strength of the *suite's* modality set, so 19 of 30 `logs.csv` and 25 of 30 `traces.csv` held a
  header and nothing else. The exporter now writes a table only when the case has one, and what the
  guard prints instead is the share — `logs in 11 of 30, traces in 5 of 30` — which is the
  corpus-authoring fact this entry was reaching for, stated per case instead of per file. Predicted
  repair still unstarted: the 19 cases with no log line and the 25 with no span.
- **The round trip's cost is now data-dependent in a way it was not.** Reading 29 MB of traces per case
  adds ~4.5 s and ~1.3 GB, so the 90-case RE3 slice takes minutes rather than seconds. `[open: nothing
  bounds it, and a corpus twice this size would need a heap flag the workflow does not set]`

### Unchanged

The corpus, the metric tables, the anchors, the backends. The 69 prose parameters, the two five-second
budgets, `signalRef`'s shape, the two ledger rules and the published success ratios are where v3.20 left
them and are **not re-signed here**.

## v3.22 — the tables that were written for every case, filled or not

Two of the eight items the convergence plan put in this round: **RE2's two tables** (closed in the same
commit stream as findings 319 and 320, reported in v3.21's readings) and **the synthetic corpus's empty
modalities**, which is this section.

### One: the gap was one line of the exporter, and the entry said it was a corpus round

v3.21 left this open:

> the synthetic corpus declares metric telemetry and no log or trace telemetry, so the exporter writes
> the files its layout requires and nothing in them ... `[open: the synthetic cases would each need log
> and trace declarations, which is a corpus-authoring round rather than a repair]`

Half of that was right and the sentence it produced was wrong. The corpus does not declare log or trace
telemetry for most cases -- 11 of 30 declare a log line, 5 a span -- and the exporter wrote both tables
for all 30 anyway:

```ts
if (suite === 'RE2' || suite === 'RE3') {
  files[`${dir}/logs.csv`] = buildLogsCsv(signals, suite);
  files[`${dir}/traces.csv`] = buildTracesCsv(signals);
}
```

So the repair was not a corpus-authoring round at all. It was the condition: a table is written iff the
case has a signal of its modality. 19 header-only `logs.csv` and 25 header-only `traces.csv` became 11
and 5, and the guard's count of them -- a number that could never reach zero while the exporter behaved
this way -- became a share worth reading:

```
export RE1 30 case(s) written · RE2 30 case(s) written, logs in 11 of 30, traces in 5 of 30 ·
RE3 5 case(s) written, logs in 2 of 5, traces in 1 of 5, 25 skipped
```

### Two: what the empty file was holding up

The count was a symptom. The reason it mattered is that the exporter's own output satisfied
`checkRcaEvalStructure`'s `modality-set` check, which exists to ask *which modalities a case carries* and
could only ask whether the file was there. So a missing modality was invisible to the score, and this
repository already had that written down as a measured fact:

> strip any single modality from a bundle and re-score, and **all nine targets scored identically** ...
> The other four leave a file behind -- an empty `logs.csv` is still a `logs.csv` with the right header --
> which is exactly how a structural check stays blind to whether a modality is *populated*.

That paragraph was in `target-requirements.test.ts`, as the reason the coverage report exists separately.
Half of it is a real property of six of the nine layouts; the other half was this defect wearing the
clothes of an invariant. With the tables written only when filled, the same strip now fails
`modality-set` and costs the export its score, and the test asserts both directions -- unmoved for a
modality a target does not declare (nine targets), dropped for one the three RCAEval suites do.

### Three: the second statement of the same modality set

`TARGET_REQUIREMENTS['rcaeval-re2']` said `['metric', 'log']` while `checkRcaEvalStructure` required
`logs.csv` **and** `traces.csv` for the same suite. Two places, one fact, and the coverage report was the
lenient one: a dataset with metrics and logs and no spans was reported `ready` for a target whose export
would then fail its own structure contract. v3.21's measurement settled which was right -- one case of
`RE2-OB` holds 171 322 log rows and 391 997 span rows -- so the row gained `trace`.

### Four: three fixtures that would have read as the writer losing a cell

Four existing tests built a bundle out of one log signal or one span and asserted on the exported CSV.
Those bundles have no metric, so the case is now skipped and the file is absent; the assertions would
have said "the writer lost the level cell" about a bundle that was never a case. Each gained one metric
reading and a comment saying why, which is also the first place a reader meets the rule: **a case is
found by its `data.csv`**, and a case that cannot fill one is skipped by name rather than exported as a
directory upstream never opens.

The empty-file counter and its `isEmptyDataFile` went with them. A count of something the exporter can no
longer produce is a constant zero in a branch no input reaches -- finding 285's shape, in the same
script. The invariant moved to `export.test.ts`, which builds four bundles (one modality, the other,
both, neither) and asserts which files exist for each; the corpus guard keeps only what it can move.

### Five: the anchor's RE2 case was RE2 in name

The first push turned `Anchor round trip` red at step 11, on the case the anchor exists for:

```
ROUNDTRIP FAIL   2/2 RE2-TT/ts-order-service_cpu/1  reason=RE2 declares a logs table
  and logs.csv is not readable under RE2-TT/ts-order-service_cpu/1
```

The synthetic corpus shipped `metrics.json` and `inject_time.txt` for its RE2 case -- two of the four
files a real RE2 case carries. It was written when RE2's plan was empty, so it was accurate then; the
day the plan grew two tables the fixture kept its old body, and nothing compared the two. The anchor's
assertions are about counts (`RE1=1 RE2=1 RE3=0`) and verdict lines, and a verdict line says `PASS 2/2`
whether the case carried one modality or three (finding 322).

The fixture now ships both tables in the corpora's own nine and eleven columns, with every cell a value
the comparison classifies rather than tolerates: `WARN` beside `warning` so the spelling table is
exercised (`normalised level normalised (1 of 2 cell(s) spelled differently)`), nanosecond and
microsecond instants that are exact multiples of the millisecond so the truncation count is `0 of 2`,
and the six columns with no IR field empty on both sides. Hand-written rather than exported -- a
fixture generated by the exporter agrees with it by construction.

```
ROUNDTRIP PASS  2/2 RE2-TT/ts-order-service_cpu/1  target=rcaeval-re2  oracle=1.00 signals=84
ROUNDTRIP MODALITY  2/2 ... logs: 2/2 row(s) ... traces: 2/2 row(s)
```

`signals=84` is 80 metric readings plus two log lines and two spans on one case: the number that says
the modalities arrived, which no count of cases could.

### Readings


> Ledger for `v3.22`.
| item | value |
| --- | --- |
| `core` test suite | **207 files, 5076 tests passed** (as of `3334f81`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `3334f81`) |
| repo test suite | **211 files, 5263 tests passed** (as of `3334f81`) |
| coverage | **99.97 / 99.76 / 100 / 99.97** (cli 100 / 100 / 100 / 100) — unchanged |
| `export.test.ts` | 71 → **77 tests**, 5 of them the empty-table rule and one the structure verdict |
| `target-requirements.test.ts` | 21 → **24 tests**, the blindness now asserted in both directions |
| RE2 export over the annotated corpus | 30 cases: **logs 11, traces 5** (was 30 / 30 with 19 and 25 empty) |
| RE3 export over the annotated corpus | 5 cases: **logs 2, traces 1** (was 5 with 3 and 4 empty) |
| `TARGET_REQUIREMENTS['rcaeval-re2']` | `metric, log` → **`metric, log, trace`** |
| audits | 1–**322**, **319 findings** (absent: 118, 132, 133) |
| export failure sites | 95 across 50 scripts, annotations carried (6 re-derived) |

### Left open

- **19 of 30 cases still have no log line and 25 no span.** That is now a stated share rather than a
  hidden empty file, and it is the corpus-authoring round v3.21 predicted -- still unstarted. `[open: the
  cases that were never given a log line are the ones whose incident text has no line to quote, and
  writing one would be authoring rather than annotating]`
- **The coverage report has no per-case share.** `computeCoverage` answers "can this dataset be evaluated
  at all" with a boolean over the bundle, so `rcaeval-re2 ready` is true while 19 of 30 cases have no log
  table. The two readings are not in conflict -- floor and amount -- but only the floor is available to
  the CLI. `[open: a share in the report would change the shape of a published structure the CLI, the
  site and the docs all read]`

### Unchanged

The corpus, the metric tables, the anchors, the backends, the 69 prose parameters, the two five-second
budgets, `signalRef`'s shape, the two ledger rules and the published success ratios. v3.22 touched the
export and the requirement row, and nothing that grades a full run.

## v3.23 — the entity in a reference was decoration, and the rule's first run found one

**What was at stake.** A checkpoint states two things: the entity an assertion is about, and the
signal that carries it. The guard resolved the signal. It built a map keyed on the metric name and
read the post value out of it, and the entity travelled through the schema, three exporters and the
four-layer assessment without ever being compared with the reading. The guard's text did not contain
the string `entityRef`:

```
$ grep -c entityRef scripts/check-fault-cases.mjs     # before this round
0
```

That is not a missing check in the ordinary sense. A series is a quantity taken *on* something --
`fault/background.ts` resolves a case's own declaration against the background on the pair, both
localisers key their statistics on `service|metric`, and `fault/log-attribution.ts` has compared a
log checkpoint's entity with the line's author since finding 286. Ten lines below the series branch,
in the same file, the log branch refused two entities as "a different component". One reference kind
was checked and the other was decoration.

### One: the rule is containment, and the corpus decided that rather than the author

Measured before writing anything, over the 73 series checkpoints the corpus carries: **12 of them name
an entity that does not carry the reading**, and all 12 are the same legitimate shape -- a container's
working set asserted about the container and filed under the service, because the ranking a solver
reads is per service. Equality would refuse twelve correct annotations; the loose rule the guard had
accepted anything. What is required is that the reading is on the entity the checkpoint names *or on a
component of it*, which is what `sameComponent` states, and the split is now printed:

```
63 on the entity the checkpoint names and 12 on one that contains it
```

The demonstration that the loose rule was loose is an experiment rather than an argument: with
`cp-p99`'s entity repointed at `service:payment-service`, the guard at HEAD exits `0` and the new one
exits `2` naming both entities. `reading-reference.ts` is the module, `describeReadingProblem` sits
beside the type so the four refusals cannot collapse into "does not resolve", and 15 unit tests plus 5
guard tests cover every arm -- including the sibling replica, which is the one the *strict* rule gets
right and the loose one gets wrong.

### Two: one metric on two entities was a name the file refused

The same defect's other face. The signals file refused two series with one metric name, and the
refusal was correct given that a reference resolved to whichever came first -- but it was not a defect
in a case, it was a limit on what a case could say. Finding 299 wrote the limit down in v3.16 and named
the repair: resolve `(entity, metric)`.

The evaluator held the same defect one level down, and was safe only because the file refused the
input: `byMetric` kept the first entry, and the test beside it said so -- *"resolves a metric declared
twice to the first, so the guard can report the ambiguity"*. A rule that holds because another rule
refuses the input is not a rule; the moment a duplicate is legal, the evaluator is the only place that
can answer. It now does: `reference := identifier ('@' entity)? '.' point`, a bare reference resolves
only when exactly one entity carries the metric, and two carriers is a refusal naming both. The
reference an evaluation reports is the pair, recorded where it resolved -- `collectReferences`, the
second walk of the tree, is deleted.

### Three: the corpus case that asked for it, and what it cost

`history-network-partition-search-cluster` is the case finding 299 said a round should start from, and
its own `why` described the limit: *"'the members each side sees' cannot be two series with one name,
and a partition's two viewpoints are therefore one series and one prose sentence."* It now carries two
readings of `cluster_members_visible` on the two halves, two of `stale_read_ratio` -- `0` on the side
that kept the deletes and `0.35` on the side that never saw them -- and the election counter still on
the cluster, because that reading genuinely is the cluster's. Two checkpoints carry the second half of
each pair.

The benchmark moved, and the movement is the argument for the migration rather than against it:

| reading | before | after |
| --- | --- | --- |
| rank 1 | 50 of 60 runs | 48 of 60 runs |
| strictly displaced | 4 cases | **5 cases** |
| series references resolving | 73 of 73, none compared | 75 of 75, 63 exact and 12 through containment |

The fifth displaced case is the partition itself: its loudest reading is now a node's member count, so
both baselines answer `search-node-1` where the answer is the rack switch that forked it. A
magnitude-based method answering "the node whose number moved most" for a partition is the failure the
corpus exists to record, and the case stays inside both baselines' top-K, so G4 holds. What changed is
that the case now discriminates.

### Four: a refusal at the file became a refusal at the checkpoint

The duplicate rule keyed on the metric name, so it could not tell two things apart: two series with one
identity (a defect) and one quantity on two entities (ordinary telemetry). It reads the pair now, and
its message names both halves. The ambiguity the change creates is refused where the entity is known --
at the checkpoint, by the resolver -- rather than at the file, where it would have made a partition
unwritable.

### Five: the rule's first run found one

With the resolution in place the corpus went red on one annotation:

```
checkpoint 'cp-lag' names 'kafka_consumergroup_lag' on 'mq:synthetic-storefront/order-events',
and the series carrying it are filed under order-events-consumer: a different component
```

Three statements in that case agree with the series and disagree with the checkpoint: the series is
filed under the consumer, the metric is a *consumer group's* lag, and the case's own root-cause reason
says "the lag was produced by consumer-side throughput rather than by broker capacity". The checkpoint
named the queue -- where the symptom is visible, not where the reading was taken. It names the consumer
now, and its description carries the distinction the reading is for. The reading did not move: where a
number is measured is a fact about the data.

That is the whole value of the rule, and both halves are needed: one refusal with no legitimate uses
would mean the rule is too strict to keep, twelve legitimate uses with no refusal would mean it is
decoration. `63 exact, 12 through containment, 0 refused` after the repair.

### Readings


> Ledger for `v3.23`.
| item | value |
| --- | --- |
| `core` test suite | **208 files, 5104 tests passed** (as of `2aed8ce`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `2aed8ce`) |
| repo test suite | **212 files, 5291 tests passed** (as of `2aed8ce`) |
| coverage | **99.97 / 99.76 / 100 / 99.97** (cli 100 / 100 / 100 / 100) -- unchanged |
| `reading-reference.test.ts` | **new, 15 tests**: exact, containment, sibling replica, other service, unknown metric, unknown entity, the two halves of a split, a duplicate pair, a carrier the graph does not hold, a missing field on each side, and the sentences |
| `expression.test.ts` | 43 → **47 tests**, the duplicate reading now refused instead of resolved to the first |
| `check-fault-cases.test.ts` | **+5 tests** in a block of their own, and the resolution split asserted as a partition |
| series references | **75 of 75** resolve: 63 on the entity named, 12 on a component of it |
| all references | **119 of 119** resolve (86 over a series, 24 configuration, 9 log) |
| comparable assertions | **0 of 110** fail against the data they name |
| localisation | 60 baseline runs over 30 cases; rank 1: **48**, rank 2: 8, rank 3: 4; strict **10**, tie 2, same-component 0, none 48; **five cases strictly displaced** |
| audits | 1–**325**, **322 findings** (absent: 118, 132–133) |
| export failure sites | 95 across 50 scripts, annotations carried (re-derived) |

### Left open

- **The exporters publish `signal_ref` as the metric name alone.** A checkpoint of a two-carrier
  metric reaches `rca100`, `openrca2` and `itbench` as a bare name, and the entity beside it in the
  export is the causal step's end rather than the reading's carrier. Nothing in the official scoring
  path joins on that field, so no number moves -- but the published field is now a half of what the
  annotation states, and `format-spec.mjs` is where that would be repaired. `[open: the export format
  is a published contract with three targets, and widening it is a decision rather than a fix]`
- **The two ledger rules read presence, not ownership** (finding 309). Two rounds whose ledgers were
  swapped would each hold exactly one and pass. `[open: unchanged this round, and it is the last of the
  two ledger items v3.19 left]`
- **69 of 98 parameters are prose** (finding 300), 30 percent read. `[open: the mechanism is still 30
  percent used, and the round that closes it has to decide what a descriptive key is]`
- **The stall budget is a margin, not a measurement** (finding 297), and the two five-second readings
  (5117 ms, 5056 ms) have never been reproduced alone. `[open: unchanged, and the gauge that would
  replace it is the item v3.21 left]`
- **19 of 30 cases still have no log line and 25 no span.** `[open: the shares moved not at all this
  round; the corpus-authoring round is still unstarted]`

### Unchanged

The corpus size, the metric tables, the anchors, the backends, the 69 prose parameters, the two
five-second budgets, the two ledger rules and the published success ratios. v3.23 touched how a
reference resolves and what a signals file may declare, so every case was re-read and no case's
answer changed; the partition case's readings moved from the cluster to its two halves, which is the
migration finding 299 asked for and the one number that moved.

## v3.24 — sixty-nine facts had to answer for themselves, and the answers found five numbers stated twice

**What was at stake.** `fault.parameters` holds the facts a case declares about itself, and a reading
may cite one so that the series and the injection spec cannot drift apart. Finding 300 measured the
corpus and found that a quarter of the keys were cited and the rest were written and never read, then
refused the two rules that could have been written about them. The result was a line printed on every
run:

```
parameters 29 of 98 (30 percent) ... are read by a series point or a configuration checkpoint;
  69 are prose, in 30 case(s)
```

Eight rounds of reading that line changed nothing. A count that nobody acts on is a complaint, and the
thing missing was not a stricter rule -- it was a place for the answer to go.

### One: the question moved into the file

There is exactly one party who can say whether `lagSeconds` is a fact a reader needs or a number a
reading should have cited, and it is the author. So `fault.parameterNotes` asks, one sentence per key
nothing cites: *what is this fact for, and why does no reading speak for it*. `fault/parameter-notes.ts`
refuses the six ways that answer can be absent or misplaced:

| refusal | what it catches |
| --- | --- |
| `missing` | a key nothing cites and nothing explains |
| `stray` | a note for a key the case does not declare -- what a rename leaves behind |
| `cited` | a note beside a citation, which is a second statement of one fact |
| `label` | `"the container"`: the key's own name, offered as an explanation |
| `notText` | a note that is a number |
| `unreadable` | `parameterNotes` as an array, a string or a number |

The shape rule is `MIN_NOTE_LENGTH` (40) and a closing full stop, which are the two properties a label
lacks. It is a proxy for "a sentence" and the module says so: presence, placement and shape are what a
guard can check, and the truth of a sentence is what a reader checks. The check runs where every other
reference rule runs -- inside the signals branch, where citations are resolved -- and a case that
declares no telemetry is not asked, because it has no citations to resolve.

The line changed from a complaint to a partition:

```
parameters 34 of 98 (35 percent) cited by a reading across 30 case(s);
  64 explained by a note, shortest 110 character(s)
```

### Two: writing the answers found five numbers written twice

Sixty-four notes were written case by case, and five of the sixty-nine keys turned out to be numbers a
reading already carried -- the drift the mechanism exists to prevent, in the shape the mechanism cannot
prevent by itself:

| case | the key nothing cited | the reading that already held it |
| --- | --- | --- |
| `middleware-replica-lag-analytics` | `lagSeconds: 2400 s` | `replica_relay_lag_seconds.post` |
| `queue-watermark-ledger-writer` | `watermarkPercent: 92` | `broker_disk_watermark_percent.post` |
| `runtime-container-crash-loop-media` | `restarts: 178` | `container_restarts_total.post` |
| `unhandled-exception-export` | `failureShare: 0.03` | `export_failure_ratio_percent.post` |
| `resource-memory-request-ingest-writer` | `requestedMemory: 1024 MiBy` | `requested_memory_mebibytes.post` |

Three of the five were **bare numbers**, and a bare number cannot be cited into a series that carries a
unit -- finding 247 refuses a citation whose unit the declaration does not state. The duplication was
therefore not carelessness at the point of the reading: it was the only way to state the number, given
a declaration with no unit. Each became a quantity first, and the reading cites it now. The unit table
carried both directions -- `8 %` to `0.08` in a unit-`1` series, `0.03` to `3` in a `%` one -- and the
range check runs after the conversion.

Nothing moved in the rankings: rank 1: 48, strict 10, five cases strictly displaced, the same five.

### Three: the stall budget was a ratio, and the suite can now be asked what it spends

Finding 297 left a budget described as "three quarters of the deadline" and nothing that could say
whether 45,000 ms was six times the worst file or one and a quarter. `RCA_BENCH_STALL_REPORT=<path>`
makes the hook write one JSONL line per file, before the verdict throws, so a red run still yields its
measurement:

```
211 files  --  median 4 ms, p95 1,583 ms, max 7,250 ms; 17 files over 1 s, 2 over 5 s
 7,250 ms  test/reader-against-backend.test.ts
 6,708 ms  test/typecheck-entrypoint.test.ts
 3,743 ms  test/ingest-report.test.ts
```

On this box the budget is 6.2 times the worst file; on the four-CPU runner that produced finding 297
the same files held the loop for 36.7 s and 33.6 s, where it is 1.2 times. That gap is why the number
cannot be derived from the distribution: a budget set from the fast machine fails the slow one. It is
derived from the deadline instead, and the distribution is what shows it is safe. `stall-budget.test.ts`
asserted `deadline * 0.75`, which any deadline satisfies; it now asserts both bounds -- at least 1.2
times the worst legitimate stall on a four-CPU runner (44,040 ms) and at most the deadline less fifteen
seconds (45,000 ms).

### Four: the five-second wait is calibrated now, and the sighting is still unexplained

`until(() => !stillRunning(pid, identity), 5_000)` is the wait that failed once at 5117 ms. Five
thousand was not a measurement of anything, so the file measures the same shape three times before the
test runs -- spawn, bound, signal the group, wait for the grandchild to leave the process table -- and
takes twenty times the worst sample with five seconds as a floor. On this machine the floor wins and
the number is what it was; on a loaded one the wait grows with the machine. The failure message names
both numbers, so the next sighting arrives with its own evidence.

**The 5117 ms is not explained by this**, and the round does not claim it is. Seventy-seven runs did not
reproduce it. What changed is that a sighting is measured against a calibrated budget rather than being
a bare duration in a log.

### Readings


> Ledger for `v3.24`.
| item | value |
| --- | --- |
| `core` test suite | **209 files, 5128 tests passed** (as of `7b5d792`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `7b5d792`) |
| repo test suite | **213 files, 5315 tests passed** (as of `7b5d792`) |
| coverage | **99.97 / 99.73 / 100 / 99.97** (cli 100 / 100 / 100 / 100) -- branches down 0.03, from the new module |
| parameters | **34 of 98 (35 percent)** cited; **64 explained by a note**, shortest 110 characters |
| keys with no explanation | **0**, refused by name -- it was 69 in 30 of 30 cases |
| stall distribution | 211 files, median 4 ms, p95 1,583 ms, max 7,250 ms |
| `parameter-notes.test.ts` | **new, 13 tests**: the six refusals, the absent map, the partition, the shortest note |
| `check-fault-cases.test.ts` | 118 → **124**: five wiring cases and the partition assertion |
| `stall-budget.test.ts` | 9 → **11**: the two bounds, the report line, the quiet path |
| export failure sites | 95 across 50 scripts, annotations carried (re-derived) |
| audits | 1–**328**, **325 findings** (absent: 118, 132–133) |

### Left open

- **The exporters publish `signal_ref` as the metric name alone.** Unchanged this round: a checkpoint
  of a two-carrier metric still reaches `rca100`, `openrca2` and `itbench` as a bare name.
  `[open: the export format is a published contract with three targets, and widening it is a decision
  rather than a repair, so it is not this round's to take]`
- **The two ledger rules read presence, not ownership** (finding 309). Two rounds whose ledgers were
  swapped would each hold exactly one and pass. `[open: the mechanism that would close it is a
  provenance marker per ledger -- an anchor commit plus a date, strictly increasing in file order --
  and it is a round of its own rather than a clause in this one]`
- **19 of 30 cases still have no log line and 25 no span.** `[open: the corpus-authoring round has not
  started, and this round changed a guard rather than a case, so the shares are exactly what they were]`
- **The upstream SLI table** and **the battery budget** (17 minutes of 30). `[open: both are v3.25, and
  the first needs a decision about which upstream table the corpus is allowed to trust]`

### Unchanged

The corpus size, the metric tables, the anchors, the backends, the localisation readings and the
published success ratios. The two gauges changed what is *measured* about the suite and nothing about
what it measures; the parameter notes changed what the corpus says about itself and no case's answer.

## v3.25 — a ledger that names its round, and a job whose twenty-two steps stop sharing one budget

Two of the three items the last round left were promises about **attribution**: a ledger that says
which round measured it, and a budget that names the battery that hung. Both were already written down
as the mechanism -- `[open: an anchor commit plus a date, strictly increasing in file order]` and
`[open: both are v3.25]` -- and neither survived contact with what the tree could actually check.

### One: the ledger names its round, because a position is not an owner

Finding 309 closed the half of its own defect that a count can see -- two `### Readings` in one round,
a round after the convention with none -- and stated the half it could not:

> Checking ownership would mean re-deriving each round's numbers from the tree as it stood in that
> round, which is a git checkout per round and a question this repository has no way to answer for a
> round that was never committed.

The cheaper question is the one the block can answer about itself. A ledger is a table of numbers one
round measured, and the round has a name, so the first line above the table is now:

```
> Ledger for `v3.24`.
```

and the guard compares that name with the title above it. A line that restates the heading adds nothing
where it sits; what it is worth is that it **travels with the block**, which is exactly what finding
309's accident did -- the insertion aimed at `### Readings`, the block stayed, the new round opened
above it. Twelfth-of-twelve ledgers now name their round; before this round, none did.

The anchor this campaign had planned for (a commit plus a date, strictly increasing) was **dropped on
the evidence**: eleven of the twelve rounds share a day with a neighbour, so a date cannot order them,
and a commit per round would have to be typed by hand into a document no rule can date-check. What
replaced it is arithmetic the file already holds -- see the second rule below -- and the plan is
corrected here rather than left in the log as a promise the tree cannot keep.

### Two: one ledger describes one tree

`schema` is not the only place a number can be restated. Two ledgers already carried
`(as of \`3334f81\`)` and `(as of \`2aed8ce\`)` on their suite rows, and that idiom is what makes a
copied half visible: one ledger describes one commit, so the `(as of …)` markers inside a ledger must
all name the same one. Ten of the twelve name none, because they state movement rather than an absolute
count -- the shape v3.13 chose for a reason -- and a rule **requiring** one would have been a rule
against the log's own history.

Proved on a copy of the live log, swapping two adjacent ledger lines and nothing else:

```
volume-08.md: `## v3.22 — …` holds a `### Readings` section that says it measured `v3.23`: the block
  was written for one round and filed under another (finding 309)
volume-08.md: `## v3.23 — …` holds a `### Readings` section that says it measured `v3.22`: …
```

Both directions, both rounds named. The two rules that existed before this round are silent on the same
tree, which is the measurement that says a new rule was needed rather than a stricter old one.

### Three: the batteries job had one budget and twenty-two steps

The job spends twenty of its thirty minutes, and every one of those minutes belonged to the **job**. A
mutation that hangs -- and a battery's whole subject is mutations -- spends the pool, the job is
cancelled, and the verdict names fourteen steps and none of them guilty. `gate-steps.mjs` has read
step-level `timeout-minutes` since the plan was written; no step in that job declared one.

The number could not be typed. `golden-master/ci-baseline.json` records one run's step timestamps
(`41180476384` at `85f7b1e80`, 22 steps, 1,230 s), written by `scripts/measure-ci-baseline.mjs` and by
nothing else, and the rule is a multiple rather than a table: **twice the measurement, three-minute
floor**. Twice, because a battery's cost is a deterministic function of its mutation count and the
suite and the variance is the machine; three minutes, because no measurement taken after the first run
can see a cold package index.

The rule that makes a bound mean something is arithmetic: **the bound plus everything measured before
it has to land inside the job's budget**, or the job dies first and the message still names nothing.
That is what sizes the two largest rather than a rounder guess -- `Backend-support` measured 383 s and
sits 13 min in, so 13 min is the largest bound that can still expire first. Nine steps take the floor;
the bounds total 90 minutes against a 30-minute job, which is the right shape: **the bounds attribute,
they do not partition.**

### Four: a line in the plan that stopped being true

`verify:local --list` said, on every run of every round since the plan existed:

> `` `timeout-minutes:` is a budget for the whole job, not for each step ``

True of five jobs, now true of four. The plan prints two clauses -- the pool for the jobs that still
share one, and `batteries bounds all 16 of its step(s) on its own (largest 13m of the job's 30m) — a
hang there names the step rather than the job`. Found by reading the output, not by a test, and the
test that covered the old sentence was corrected to cover both.

### Readings

> Ledger for `v3.25`.

| item | value |
| --- | --- |
| `core` test suite | **210 files, 5156 tests passed** (as of `45af109e2`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `45af109e2`) |
| repo test suite | **214 files, 5343 tests passed** (as of `45af109e2`) |
| coverage | **99.97 / 99.73 / 100 / 99.97** (cli 100 / 100 / 100 / 100) -- identical to the last round, because every line this round changed lives in `scripts/`, which the coverage surface does not include |
| ledgers naming their round | **12 of 12** (was 0 of 12) |
| a swapped pair, on a copy of the live log | **FAILED, exit 1**, both rounds named |
| steps of `batteries` with their own bound | **22 of 22** (was 0 of 22) |
| the recording behind them | 22 steps / 1,230 s at `41180476384` |
| tightest bound | `Backend-support` at **2.0x** its measurement, 13 min of the job's 30 |
| `battery-budget.test.ts` | **new, 21 tests**: six refusals, two arithmetic cases, three gate paths, the recording's usage, the shipped tree |
| `progress-volumes.test.ts` | 31 → **38**: the swap, the missing line, the blank line, the unnamed round, two trees, one tree, none |
| export failure sites | **99** across 52 of 70 scripts, all annotated |
| audits | 1–**330**, **327 findings** (absent: 118, 132–133) |

### Left open

- **The exporters publish `signal_ref` as the metric name alone.** Unchanged: a checkpoint of a
  two-carrier metric still reaches `rca100`, `openrca2` and `itbench` as a bare name.
  `[open: the export format is a published contract with three targets, and widening it is a decision
  rather than a fix]`
- **The upstream SLI table.** The last item of the eight, and the one that needs a decision rather than
  a repair: `main.py` matches the *path* against a fixed list of corpus tokens and raises
  `SLI not implemented` for anything else. `[open: v3.26, and the decision is whether a case declares
  its own SLI as a reading the guard can resolve, or the exporter copies the corpus's token list --
  which is the allow-list this campaign rejected in v3.24]`
- **19 of 30 cases still have no log line and 25 no span.** `[open: the corpus-authoring round is still
  unstarted, and the shares did not move this round]`
- **The bounds have never expired.** A bound that has not fired is a bound nobody has seen work, and
  the recording it is sized from is one run on one runner. `[open: the refresh is a deliberate act
  (`measure-ci-baseline.mjs`), and the next round that adds mutations to a battery re-takes it]`

### Unchanged

The corpus, the metric tables, the anchors, the backends, the localisation readings, the published
success ratios, and every budget number the plan already enforced. The two rules changed what the log
can be asked about itself and what the plan can attribute; no case's answer moved.

## v3.26 — the ranking reading stops being chosen by the path, and twenty-three cases have nothing to say in a one-word vocabulary

The last item of the eight, and the only one that needed a decision rather than a repair. It was
written down as such when it was found (finding 267) and again when the list was ordered:

> `[open: v3.26, and the decision is whether a case declares its own SLI as a reading the guard can
> resolve, or the exporter copies the corpus's token list -- which is the allow-list this campaign
> rejected in v3.24]`

### One: the refusal was about a path, not about the data

`main.py` recognises a dataset by a token in the **directory path** and then takes a column whose name
it also decides: `frontend_latency` for Online Boutique, `{service}_latency` when that column exists,
and `raise ValueError("SLI not implemented")` for a corpus it does not know. A case we export as
`RE2-order-prod/order_cpu/1/data.csv` is well formed, on the right clock, complete in its
modalities -- and refused before a single number is compared, with a message about our path.

### Two: the option that copies the token list, refused for the second time in two rounds

Pasting `online-boutique`/`RE2-OB`/`RE3-OB` into our layout would make upstream run tomorrow. It is
also the allow-list v3.24 refused in `fault.parameterNotes`, with one extra cost: the token being
copied is an *identity*. A synthetic storefront's dataset claiming `online-boutique` is the one thing
a benchmark's path must not do.

So the case answers the half that belongs to the data. `sli` is either the reading that ranks the
case or one sentence saying why none can:

```json
"sli": { "service": "checkout-api", "metric": "request_duration_p99_ms" }
"sli": { "none": "the two readings on this service are the share of summaries answering 5xx …" }
```

and the exporter publishes that series as `checkout-api_latency` -- **renamed**, not copied, because
a second column holding one series' numbers is the drift v3.24 removed (`time, then one column per
series` stays true).

### Three: one token, two spellings, and the function that keeps them one

The column name upstream builds and the directory segment we write are the same word. `casePath`'s
service segment `caseToken(rootCauseComponent)` and `main.py`'s `service` are the same expression, so
`export/sli.ts` uses the same function rather than a second sanitiser -- which would have produced
`checkout_api_latency` against upstream's `checkoutapi` and been invisible to both halves' tests. The
acceptance test takes `casePath`'s own output, applies `main.py`'s two lines to it, and requires the
result to be `sliColumn`'s for `checkout-api`, `order` and `ts-route-service`.

### Four: seven ways a declaration fails, and two of them need no telemetry

`absent`, `unreadable` (five shapes, each naming which half is missing), `foreign`, `vague`,
`unresolved`, `notDuration`, `collision`. `foreign` and `vague` are read from the file alone, so a
corpus is refused before its telemetry is built; the other three are read from the signals, where the
table exists. The exporter refuses a case by name rather than writing a `data.csv` whose ranking
column is missing for a reason nobody wrote down.

`notDuration` asks `util/unit.ts` rather than a list of its own: `_latency` asserts a dimension, so
the unit has to be in it, and a unit nobody can convert is refused rather than assumed.

### Five: the measurement, and the sentence it forces

Two instruments, counted over different evidence:

```
sli 7 of 30 case(s) name the duration that ranks them, published as `<service>_latency`; 23 say why no reading can
export RE1 30 case(s) written, a `latency` column in 7 of 30 · RE2 30 case(s) written, logs in 11 of 30, traces in 5 of 30, a `latency` column in 7 of 30 · RE3 5 case(s) written, logs in 2 of 5, traces in 1 of 5, a `latency` column in 1 of 5, 25 skipped
```

**Seven of thirty.** That is not a target missed; it is what a one-word vocabulary can rank. Upstream
has exactly one name for the ranking series, so a case whose symptom is a share, a count or a byte
size has nothing to publish under it, and the twenty-three reasons say which reading came closest.
Three of them are durations that are not latencies -- `process_uptime_seconds`,
`pod_ready_after_start_seconds`, the size of a lead-time error -- which is exactly the line a guard
cannot draw and an author must.

### Readings

> Ledger for `v3.26`.

| item | value |
| --- | --- |
| `core` test suite | **211 files, 5198 tests passed** (as of `35ba009ca`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `35ba009ca`) |
| repo test suite | **215 files, 5385 tests passed** (as of `35ba009ca`) |
| coverage | **99.97 / 99.75 / 100 / 99.97** (cli 100 / 100 / 100 / 100); `sli.ts` is 100 on all four |
| cases that say which reading ranks them | **30 of 30** answer: **7** declare, **23** give a reason |
| the column upstream looks for, in the exported tables | **7 of 30** (RE3: **1 of its 5** code cases) |
| `sli.ts` and its test | **20 tests**: seven refusals, two resolutions, the path-parity proof, the sentence table |
| `check-fault-cases.test.ts` | 124 → **130**: absent, foreign, vague, both-at-once, and the two-instrument partition |
| status assertions that carry the guard's output | 34 of 120 → **120 of 120** |
| export failure sites | **99** across 52 of 70 scripts, all annotated (line numbers moved, annotations did not) |
| audits | 1–**333**, **330 findings** (absent: 118, 132–133) |

### Left open

- **The exporters publish `signal_ref` as the metric name alone.** Unchanged and now the oldest open
  item on the list: a checkpoint of a two-carrier metric still reaches `rca100`, `openrca2` and
  `itbench` as a bare name. `[open: the export format is a published contract with three targets, and
  widening it is a decision rather than a repair, so it is not this round's to take]`
- **Upstream's token table still refuses our path.** The half that was ours is answered; the half that
  is theirs is not ours to answer, and `{system}` stays the case's own name.
  `[open: a corpus whose path upstream recognises is a corpus whose baselines were tuned on it, and
  ours are not]`
- **19 of 30 cases still have no log line and 25 no span.** `[open: the corpus-authoring round has not
  started, and this round changed a declaration rather than a case's telemetry]`
- **The bounds have never expired**, and the recording they are sized from is one run on one runner.
  `[open: the refresh is a deliberate act (`measure-ci-baseline.mjs`), and the next round that adds
  mutations to a battery re-takes it]`

### Unchanged

The corpus's telemetry, the metric tables, the anchors, the backends, the localisation readings, the
published success ratios, and every budget the plan enforces. The export gained one column name for
seven cases and lost the series' original name in those seven tables; no published number moved,
because every ratio this repository computes is computed from the bundle rather than from `data.csv`.

## v3.27 — a modality that is absent stops reading like one nobody looked at

The convergence list emptied last round, so this one starts from the product. The first item on the
list the last report left is the corpus's telemetry: 19 of 30 cases carry no log line and 25 carry no
span, and every gate was green about it. That number was not a defect. It was a sentence pretending
to be one.

### 一、an absence and an omission are the same bytes

`logs` and `traces` are lists. A case with no line and a case nobody had filled in both hold nothing,
so the readout printed `logs in 11 of 30, traces in 5 of 30` -- true, and about the wrong subject.
Nineteen incidents left no useful line and nineteen were unexamined are different corpora.

Each case now answers one way or the other: the list, or `noLogs` / `noTraces` with a sentence. Six
refusals in `fault/modality-evidence.ts`: `missing`, `both`, `empty`, `unreadable`, `notText`, and
`vague` -- the last measured by the same `looksLikeSentence` that `fault.parameterNotes` and `sli`
share. An empty list is refused rather than read as a synonym, because it is the one spelling that
can also mean "nobody filled this in".

### 二、the five cases that looked like they had a line

Five of the nineteen texts contain a word a keyword rule would have called log-shaped. Read one at a
time, **one** turned out to carry a line and **two** turned out to repeat a declared number:

| case | candidate | outcome |
| --- | --- | --- |
| `image-builder` | `no space left on device` | **a log and a log checkpoint**, because it names which filesystem refused the write while the node reads 40 percent |
| `redis-session-cache` | `SLOWLOG ... every 30 seconds` | **refused**: `keysIntervalSeconds == 30` and the thread at 100 percent are already declared |
| `feature-flag-checkout` | `flipped to false at 07:59` | **refused**: `scheduledJobsWritingFlag == 2` and `flagFlipMinutesBeforeOnset == 1` are already declared |
| `pod-kill-user-profile` | the text says nothing was logged | the absence is the finding, and it is what the reason says |
| `off-by-one-invoice-renderer` | the text says nothing is logged | the same shape |

The two refusals are finding 327's rule in a modality it had not been applied to: a number a
declaration already holds does not become evidence by being written again in prose.

### 三、six cases cross a call, and one of them quotes a duration

Where a span pair would come from is measurable: a chain step whose two ends belong to services the
graph connects with `calls`. Six of the twenty-five spanless cases do. Exactly one of their texts
quotes a duration for the exchange -- `time out at 3s` in the payment-gateway case -- so that one got
a span of 3000 ms, with the callee's span deliberately absent because the request never arrived. The
other five state when a split began, how long a cluster took to converge, or the size of a lead-time
error.

A rule that refused `noTraces` on those five would have been wrong five times, so the count is a
reading rather than a gate, and the five are named in the report instead.

### Readings

> Ledger for `v3.27`.

| item | value |
| --- | --- |
| `core` test suite | **212 files, 5236 tests passed** (as of `bf87e65`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `bf87e65`) |
| repo test suite | **216 files, 5423 tests passed** (as of `bf87e65`) |
| cases that answer for a log line | **30 of 30**: **12** show one, **18** say what one could not carry |
| cases that answer for a span | **30 of 30**: **6** show one, **24** say what one could not carry |
| cases with no span that still cross a service call | **5 of the 24**, named in the report |
| new evidence | **1 log** (with a log checkpoint) and **1 span**; the other 42 answers are reasons |
| coverage | **99.97 / 99.74 / 100 / 99.97** (cli 100 / 100 / 100 / 100); `modality-evidence.ts` is 100 on all four |
| `modality-evidence.test.ts` | **28 tests**: six refusals, the boundary, and ten walks over a graph |
| `check-fault-cases.test.ts` | 130 → **137**: five refusals, the partition, and the crossing reading |
| export failure sites | **99** across 52 of 70 scripts |
| audits | 1–**334**, **331 findings** (absent: 118, 132–133) |

### Left open

- **`signal_ref` still reaches three targets as a bare metric name.** Unchanged and now the oldest
  open item on the list. `[open: the export format is a published contract with three targets]`
- **Upstream's token table still refuses our path.** `[open: not ours to answer; `{system}` stays the
  case's own name]`
- **The corpus cannot show a line for an incident that left none.** 18 and 24 are now answers rather
  than gaps, and the difference between them and a filled corpus is the incidents, not the work.
  `[open: further annotation needs another incident, not another sentence]`

## v3.28 — a fact no step cites is a fact two targets never receive

### What the guard had never asked

`assessFourLayer` refused two kinds of broken reference since finding 238: an entity ref no graph
answers, and a step citing a checkpoint the case does not state. Both are references that were made
and cannot be answered. Neither is the defect this round measured, which is a reference that was
never made at all -- a checkpoint no causal step cites.

Every rule that existed asks whether a reference *resolves*, and a checkpoint nothing cites has no
reference to fail. So it passed the schema, the entity resolver, the unit check and the assertion
comparison, it was counted in its case's evidence layer, and it was evidence for nothing.

### The measurement, before the repair

| reading | value |
| --- | --- |
| checkpoints the corpus states | **120** |
| checkpoints at least one step cites | **111** |
| cases holding at least one uncited checkpoint | **9** |
| of those, checkpoints that state the control ruling out the alternative | **6** |

The three exports disagree about where evidence comes from, and the disagreement is what turned an
unused annotation into a lost one:

| exporter | source of its evidence list | published before | publishes now |
| --- | --- | --- | --- |
| `itbench` | `groundTruth.evidenceCheckpoints` | 120 | 120 |
| `openrca2` | `CausalStep.evidenceRefs` | **111** | 120 |
| `rca100` | `CausalStep.evidenceRefs` | **111** | 120 |

`itbench` was never wrong. The other two were, and no count in any report said so -- which is why
the number above is the finding and not the tidying. The nine, and what each one is:

| checkpoint | what it states | now cited by |
| --- | --- | --- |
| `cp-health-green` | the health check never failed, which is why an orchestrator saw nothing wrong | step 1 |
| `cp-client-pool` | the application-side pool never approached its ceiling: the sentence that rules the clients out | step 1 |
| `cp-handler-seconds` | what the handler needs, unchanged by the fault | step 1 |
| `cp-enospc-build` | the refusal itself, on the build's own filesystem | step 1 |
| `cp-no-deploy` | zero deployments across the window | step 1 |
| `cp-declared-share` | the share the injection declared, which is the number the telemetry reports | step 1 |
| `cp-pool-exhausted-errors` | the pool's own words for its state | step 1 |
| `cp-members-other-side` | the other half also sees three | step 1 |
| `cp-stale-reads-elsewhere` | the half that kept the deletes returns nothing stale | step 2 |

Two are halves of a pair. A partitioned cluster and a cluster that lost half its nodes report the
same three-members-visible from one side; the second side is the whole difference, and it was the
side that reached one target. Six of the nine are controls, which is to say the evidence that
narrowed the answer to one cause was the evidence two of the three targets never received.

### The rule

`assessFourLayer` returns `uncitedEvidence`, and `complete` requires it empty. A checkpoint is a fact
about a step; a fact about no step is not a checkpoint, it is a sentence in a field no per-step
reader reaches. No escape hatch: every one of the nine had a step it defended, and an exception for
"this one is really off the chain" is a rule no annotation could fail -- the shape finding 300 was
about.

`describeUncitedEvidence` names the case, the id and **the entity**, because an id alone sends the
reader to the file to find out whose fact is going unpublished:

```
history-checkout-cpu-saturation: 'cp-cpu-limit'
(container:synthetic-storefront/checkout-api-app) is cited by no causal step, so no per-step
evidence list carries it
```

The count is a clause inside the checkpoint line, not a line of its own:
`120 of 120 checkpoint(s) are cited by at least one causal step`. A separate "0 uncited" would be a
constant zero; a numerator over a denominator grows with the corpus and a new annotation can lower
it. Both exits print it, so a case that loses a citation shows `119 of 120` before the failure list.

### The rule biting its own fixtures, again

`withLogCheckpoint` adds a checkpoint to the checkout case and stopped there, so the first run of the
new rule refused the test that adds one -- naming the checkpoint the fixture had just written. It now
pushes that id onto the step it supports, for the same reason last round's `withLog` deletes
`noLogs`: a fixture that adds evidence has to say what the evidence is for.

Two older assertions turned on the same edge: a `describeKind` arm that had only ever been read back
for arrays, and a `'nothing'` fallback for a stray note the case declares no keys against. Both are
messages a reader can reach, and both are now pinned -- `parameter-notes.ts` went from 94.74 branches
to 100 on all four.

### Readings

> Ledger for `v3.28`.

| item | value |
| --- | --- |
| `core` test suite | **212 files, 5248 tests passed** (as of `2f2dae6`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `2f2dae6`) |
| repo test suite | **216 files, 5435 tests passed** (as of `2f2dae6`) |
| checkpoints stated / cited | **120 / 120** (`120 of 120 checkpoint(s) are cited by at least one causal step`) |
| references in the chain | **129** across 2 chains' worth of steps, 120 distinct |
| evidence each target publishes | `itbench` **120**, `openrca2` **120**, `rca100` **120** (was 120 / 111 / 111) |
| coverage | **99.98 / 99.79 / 100 / 99.98** (cli 100 / 100 / 100 / 100) |
| `fault/four-layer.ts` | **100 / 100 / 100 / 100** |
| `fault/parameter-notes.ts` | 94.74 branches → **100 / 100 / 100 / 100** |
| `four-layer.test.ts` | 15 → **21**: six tests over the new reading |
| `check-fault-cases.test.ts` | 137 → **141**: both refusals, the dangling precision, and the fraction |
| `parameter-notes.test.ts` | 13 → **15**: the kind of a non-map, and a stray note with nothing declared |
| cases that answer for a modality | **30 of 30 on both**, unchanged: 12 log / 18 reasons, 6 span / 24 reasons |
| export failure sites | **99** across 52 of 70 scripts |
| audits | 1–**335**, **332 findings** (absent: 118, 132–133) |

### Left open

- **`signal_ref` still reaches three targets as a bare metric name.** Now the oldest open item, and
  the only one left that is ours to decide: with the citations repaired, the three exports describe
  one corpus, and what they still describe it with is a metric name without the entity it was read
  on. `[open: unchanged this round; the fields are a contract three targets publish, and widening one
  is a decision rather than a fix]`
- **A citation is checked for presence, not for being the right step.** `cp-stale-reads-elsewhere`
  could cite step 1 and still pass; the gate establishes that a fact is present, unique, resolvable
  and used, and whether it is used well stays a judgement about the annotation.
  `[open: new this round, and the same division of labour `sli.none`, `fault.parameterNotes` and
  `noLogs` already use]`
- **Upstream's token table still refuses our path.** `[open: unchanged, and the half that is not ours;
  the `{system}` field stays the case's own name]`
- **The corpus cannot show a line for an incident that left none.** 18 and 24 are answers rather than
  gaps; closing the gap between them and a filled corpus needs another incident.
  `[open: unchanged this round, and not a matter of writing more sentences]`

## v3.29 — the reference three targets were promised, and the fixture that made the promise untestable

### What the exporter copied, and what the documents printed

A reading is taken on something, so its identity is the pair `(entity, metric)`. The IR keeps the
halves in two fields and `fault/reading-reference.ts` resolves them together — that is finding 323's
rule, and it is why the guard can check a corpus annotation at all.

The three graded exporters copied `signalRef` into `signal_ref` and stopped. All three contracts, and
all three documents describing them, print the pair:

```json
{ "entity": "service:default/order", "signal_ref": "order|cpu_usage", "comparator": ">", "value": 90, "unit": "%" }
```

and `rca100` is scored by the token `signal|comparator|value|unit`, whose published example is
`order|cpu_usage|>=|90|%`. The field was documented as the pair and emitted as the metric alone.

### Why nothing could have contradicted it

The golden-master fixture wrote the *output* form into the *input*: `"signalRef":
"order|cpu_usage"`, beside a case whose only series is `cpu_usage`. The exporter copied it out, the
example generator photographed the result, and the three documents printed the photograph. Every
artefact agreed with every other artefact, and the agreement was a field agreeing with itself.

Asked the other way — does the IR's `signalRef` resolve against the series this case declares? — the
fixture fails. `fault/reading-reference.ts` would have said `unknownMetric: order|cpu_usage`. Nothing
asked, because the fixture is not a corpus case and the corpus guard does not read it.

The 30-case corpus was written against that resolution rule rather than against the example, so it
held bare names. Measured on it before this round:

| reading | value |
| --- | --- |
| checkpoints that publish a reference | **109** of 120 (11 are `derived` and name none) |
| distinct strings those 109 published | **104** |
| metric names read on two entities each | **4** names, 9 checkpoints |

| metric | carriers | what the collision costs |
| --- | --- | --- |
| `cluster_members_visible` | `search-node-1`, `search-node-4` | `cp-members-halved` and `cp-members-other-side` arrive as two byte-identical evidence entries — and that pair is a partition case's whole argument |
| `stale_read_ratio` | `search-node-1`, `search-node-4` | the same pair again, for the deletes that did not replicate |
| `container_restarts_total` | three pods | three cases' evidence is one string |
| `process_uptime_seconds` | two containers | two cases' evidence is one string |

### The rule, its five refusals, and where they land

`export/signal-ref.ts` combines the halves: `<entity name>|<reading>`, joined by
`SIGNAL_REF_SEPARATOR`. The name, not the id, because the id is published beside it already and
`service:default/order|cpu_usage` would name the same thing twice.

| refusal | what is wrong | its sentence's verb |
| --- | --- | --- |
| `unresolved` | the entity is not in the graph | "which the topology does not hold, so there is no name to qualify its signal with" |
| `unnamed` | the entity's `name` is empty | "which carries no name, so there is nothing to qualify its signal with" |
| `ambiguous` | two entities answer to that name, or to an alias of it | "whose name 'twin' is also answered by …, so the qualified form would name both" |
| `emptyRef` | `signalRef` is `''` | "so the qualified form would read `<entity>|` and name no reading" |
| `preQualified` | the ref already carries an owner | "writes 'order|cpu_usage' in a field that holds the reading alone, so the owner it carries would be written twice" |

`preQualified` is the one that mattered: it is exactly what the fixture shipped, and it is invisible
until refused, because a qualified ref in an unqualified field exports to a string that looks right.

`ambiguous` needed a second map. `EntityIndex.byName` resolves a collision by writing last, which is
right for a resolver and wrong for a publisher; `buildEntityIndex` now also fills `idsByName` over
names and aliases alike, sorted, one entry per entity however many of its aliases coincide.

The refusal is per case, not per bundle: `screenSignalRefs` runs before a file of the case is written
and the case is skipped with the sentence, the same policy the exporters already apply to an
unresolved root cause. `assertSignalRef` raises `SignalRefRefusedError` for a caller that went
straight to a builder, because a builder has only one shape for "no reference" and it already means
`derived`.

`itbench` had no entity index at all before this — its evidence field was a copy, and a copy needs
nothing resolved. `buildItBenchScenarioSpec` now requires one, and the requirement is the point: an
optional second parameter would be a silently unqualified path.

The two exporters that wrote the same five-field mapping byte for byte now share
`evidenceFromCheckpoint`, so this field has one definition rather than two.

### The corpus guard asks first, and prints a fraction

`check-fault-cases.mjs` measures the same reading with the same function and fails on a refusal,
because a skipped case leaves no file and a score over what remains has no denominator that says a
case is missing. Both exits print:

```
signal refs 109 of 120 checkpoint(s) publish one as <entity>|<reading>,
11 name no single reading, and 0 would be refused at export; the 109 are 109 distinct string(s)
```

The distinct count is the clause that says the qualifier is doing work: 109 published strings, 109
distinct, against 104 before.

### The fixture, corrected, and the example that did not move

`golden-master/fixture.json`, `examples/order-prod/bundle.json` and `examples/order-prod/draft.json`
now write `"signalRef": "cpu_usage"`. The generated example output is **byte-identical** — the only
line that changed in `site/assets/data.js` is the echoed input — and `order|cpu_usage` is now a
rendering rather than a copy. `itbench.test.ts` asserts both halves of that: the fixture's field is
`cpu_usage` and the published condition is `order|cpu_usage`.

### The rule biting its own fixtures, for the third round running

The first two tests written for the corpus guard passed a mutated case **without telemetry**, and a
case that declares no telemetry never reaches the checkpoint section at all — so the run came back
`OK` with the mutation sitting in the file. The fixture now carries the checkout signals declaration,
and the reason is recorded where it bites: a fixture for a reading rule has to declare a reading.

### Readings

> Ledger for `v3.29`.

| item | value |
| --- | --- |
| `core` test suite | **213 files, 5287 tests passed** (as of `6518e1feb`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `6518e1feb`) |
| repo test suite | **217 files, 5474 tests passed** (as of `6518e1feb`) |
| `core` coverage, statements / branches / functions / lines | **99.97 / 99.75 / 100 / 99.97** |
| references published | **109 of 120**, **109 distinct** (was 109 across 104) |
| checkpoints that name no single reading | **11**, published as `null` / omitted, unchanged |
| cases the three exporters skip | **0** (`0 would be refused at export`) |
| `order|cpu_usage` in the example output | unchanged, and now derived from `cpu_usage` |
| `export/signal-ref.ts` | new: 24 tests, **100 / 100 / 100 / 100** |
| `export-surface-enumerated.test.ts` | 1 module, 7 exports, 4 type exemptions |
| `signal-ref.test.ts` | **24**: five refusals, four kinds, the separator, the error, the index |
| `openrca2.test.ts` / `rca100.test.ts` / `itbench.test.ts` | 14 → **17**, 38 → **41**, 17 → **19** |
| `check-fault-cases.test.ts` | 141 → **145**: the refusal, its name, and the fraction |
| export failure sites | **99** across 52 of 70 scripts |
| audits | 1–**336**, **333 findings** (absent: 118, 132–133) |

### Left open

- **A citation is checked for presence, not for being the right step.** Unchanged, and now the same
  shape one field over: the qualifier is checked for being unambiguous, not for being the entity the
  reading was really taken on. `[open: whether an annotation is used well stays a judgement]`
- **Upstream's token table still refuses our path.** `[open: unchanged, and the half that is not ours]`
- **The corpus cannot show a line for an incident that left none.** 18 and 24 are answers rather than
  gaps. `[open: unchanged, and not a matter of writing more sentences]`
- **`openrca-1.0` and the four non-graded targets were not touched.** They do not read checkpoints, so
  the pair never reached them and there was nothing to qualify.
  `[open: a new target that does read checkpoints must call the screen, which no enumeration checks]`

## v3.30 — the pair was complete, and the file it points into was never asked

### The question the last round made askable

Finding 336 completed the reference: `signal_ref` is `<entity>|<reading>`, 109 of 120 checkpoints
publish one, and all 109 are distinct. What nothing asked -- in any round, by any rule -- is the
question a reader asks with that string in hand: **does the export carry the reading it names?**

The answer key and the case directory are written by the same exporter into the same tree. A reader
who wants to check a checkpoint against the claim it makes has to join them, and the join had never
been run. Run against the corpus's own export, reading the files rather than the IR:

| how the reference landed | before |
| --- | --- |
| on the entity the checkpoint states | **63** |
| through the entity that contains it (a container's figure filed under its service) | **12** |
| on a log line, by the id the checkpoint cites | **0** |
| on a declared parameter, by the key the checkpoint cites | **0** |
| **named a key no table carried** | **34** |

Thirty-four of 109 pointed at nothing, and nothing in the repository could tell them from the 75 that
were checkable. Three causes, one symptom.

### The log line: the id was discarded twice

A log checkpoint cites its line by id: `signalRef: 'typeerror-line'`, `signalKind: 'log'`, and
`value` holding the phrase the line carries. The signals file declares that id, `checkLogAttribution`
joins on it, and `logs.json` had no column for it — because the id had no field anywhere in between:

- `LogDeclaration` declared `service`, `body`, `severity` and no `id`, so the reader dropped it;
- `expandLog` therefore never set `LogPayload.templateId`, a field the IR schema has carried since it
  was written and that nothing in the tree ever assigned.

Ten references named a line the export could not identify. The repair is three lines, and the
interesting part is that nothing was *wrong*: both ends of the wire existed and the wire had no pin.

### The parameter: the value travelled and the key did not

A `configuration` checkpoint states a parameter of the injection — `cpuLimit == 500 mcore` on
`container:…/checkout-api-app` — and publishes `checkout-api-app|cpuLimit`. The comparison was
checked against `fault.parameters` and the value was published in the entry's own `value`; the *key*
was in no file of the export, because no builder emitted `fault.parameters`.

The parameters now ship where the answer belongs: inside `raw_ground_truth` for `rca100`, at the top
of `causal_path.json` for OpenRCA 2.0, and beside `diagnosis` for ITBench. Not in `task.json`, which
is what a solver sees: an injection's parameters are part of the answer.

### The twelve are a resolution, and the count says so

Twelve series references name a container whose reading is filed under its service — the corpus's
deliberate choice, because the ranking a solver sees is per service. Folding them into a single
"109 of 109" would hide that 17 references (12 series, 5 log) need a containment rule before the join
succeeds, so the guard prints the landings apart:

```
published refs 109 of 109 resolve inside the export (68 by the entity they name,
17 through the entity that contains it, 24 by a declared parameter); 0 dangle
```

`export/reference-carrier.ts` is the join, `assessCaseReferences` is the tally, and
`describeDanglingReference` is the sentence for the case that names nothing. The module reads the
exported files rather than the IR on purpose: a second check of the annotations would pass while the
files disagreed, which is the shape v3.29 removed one field over.

`derived` checkpoints leave the denominator rather than counting as successes. A case that names no
reading must not be able to raise the share of references that resolve, and that is the same reason
the corpus guard prints `109 of 120` rather than `109 of 109`.

### The fields the contracts grew

Three, each one the row its references needed:

| target | field | why |
| --- | --- | --- |
| `rca100` | `cases/{caseId}/logs.json[].id` | the line id a log reference names; absent on a line declared without one |
| `openrca2` | `causal_path.json.parameters` | the declaration a configuration reference names |
| `itbench` | `scenario_groundtruth.parameters` | the same, beside `diagnosis` rather than inside it |

All three are emitted from one place each, listed in `scripts/format-spec.mjs`, and the tables in
`docs/targets/*.md` are generated from that file rather than typed beside it.

### The rule biting its own test, for the fourth round running

The first version of `reference-carrier.test.ts` put a container under a service and a pod beside
both, then asserted that a reference to the pod joins a row filed under the service. It does not:
`sameComponent` walks containment in both directions, and two children of one parent are siblings,
not ancestors. The fixture now models one chain — service → pod → container — and the comment says
why, because the next person to add a replica will make the same assumption.

### Readings

> Ledger for `v3.30`.

| item | value |
| --- | --- |
| `core` test suite | **214 files, 5325 tests passed** (as of `43baf3f29`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `43baf3f29`) |
| repo test suite | **218 files, 5512 tests passed** (as of `43baf3f29`) |
| published references that resolve inside the export | **109 of 109** (was 75 of 109) |
| — on the stated entity / through containment / by parameter | **68 / 17 / 24** |
| references that name nothing | **0** (was **34**) |
| log lines carrying their id | **10 of 10** (was 0) |
| `export/reference-carrier.ts` | new: 23 tests, four landings, five sentences |
| `core` coverage, statements / branches / functions / lines | **99.97 / 99.79 / 100 / 99.97** |
| contract fields added | **3** (`logs.json[].id`, two `parameters` blocks) |
| audits | 1–**337**, **334 findings** (absent: 118, 132–133) |
| progress volumes | **9** (this one; `volume-08.md` closed at v3.20) |

### Left open

- **A citation is still not checked for being the right one.** The join establishes that the file
  carries a row with that key; it does not say the row's numbers support the assertion. That is the
  corpus guard's comparison, and the judgement above it is the reader's.
  `[open: unchanged, and the same division of labour `sli.none` already uses]`
- **Upstream's token table still refuses our path.** `[open: unchanged, and the half that is not
  ours]`
- **That `exit 1`.** `[open: unchanged; the symptom will say so next time it appears]`

### Where this leaves the plan

The reference is now a closed loop: the guard resolves `(entity, reading)` against the case, the
exporter publishes the pair, the artefact carries the row the pair names, and the guard proves the
join over the produced files. What is left of the original three items is the one that is not ours
(upstream's path table) and one that is a judgement rather than a check.

## v3.31 — the loader's four lines, run on a file we wrote

The item left at the top of v3.30's list was the last one that is not a repair: `main.py` recognises
a corpus by a token in the path and raises `SLI not implemented` for one it does not know, so an
export of ours is refused before a single number is compared. That verdict is upstream's to give and
the corpus already answers the half that is its own (v3.26). What had never been done is the rest of
the loader's block — the three lines that are not decisions at all, only arithmetic over our files.

### One: three lines, and each can be wrong while everything above it passes

```
service, metric = basename(dirname(dirname(data_path))).split("_")
normal_df = data[data["time"] < inject_time].tail(...)
"service": len({c.split("_")[0].replace("-db", "") for c in _pre_cols if c != "time"})
```

The first raises before the table is opened if the second path component does not split into exactly
two names. The second decides what "before" means, and an empty window is not an error — it is a
ranking computed from nothing. The third turns every column head into a candidate *service* name, and
our topology is not made of services. All three leave the files well formed, so nothing in this
repository could see them disagree with the reader.

### Two: what they say, measured on 65 tables over 30 cases

| line | reading |
| --- | --- |
| the leaf directory unpacks into a service and a fault | **30 of 30** |
| `data["time"] < inject_time` selects rows | **30 of 30**, 8 at the thinnest |
| the column named after the path's service is present | **7 of 30** — exactly the seven that declare a reading |

The numbers are sound. The rules that keep them sound are the finding: a fault label carrying an
underscore (`ts-route-service_f3_1`, one case in ninety of a real corpus, read here by a parser that
is deliberately more capable than the loader) and a window that starts after the injection instant
are each one case away, and neither was refused by anything.

### Three: the third line is where two vocabularies meet

52 distinct heads, of which **35 name a service**, **15 name an entity of another kind** (a pod, a
container, a node, a broker, a database, an external dependency) and **2 name nothing at all** —
`orders` and `billing`, produced by the loader's own `.replace("-db", "")` on `orders-db` and
`billing-db`. So the pool it builds contains two names no graph holds and never contains those two
databases under their own names.

No case is harmed today: the answers are 28 services, one database (`analytics-replica`) and one
external dependency, and none of them is renamed. The rule is written anyway — a case answering
`orders-db` would ship a table whose ranking cannot contain its own answer, silently. The fifteen
non-services are reported and **not filtered**: `rankServicesByPeakZScore` ranks every metric-bearing
entity, which is where the published localisation readings come from, and trimming the artefact
would make it narrower than the readings taken from it.

### Four: the column, asked by name rather than by suffix

The guard counted the ranking column by asking whether any head ended in `_latency`. That agreed
with the declarations — 7 of 30 — by the naming convention rather than by construction, and a table
carrying `cart-service_p99_latency` would have passed it while the name the loader looks for was
absent. It now derives `{service}_latency` from each case's own leaf directory and asks the header
for that exact string.

### Five: the mapping only the writer has

Joining a case id to its directory means rebuilding `casePath(suite, fc, index + 1)` — the index
among the *written* cases — which is a second implementation of the exporter's loop. `exportRcaEval`
now returns `written`, and a skipped case is absent from it because it wrote nothing to name.

### Readings

> Ledger for `v3.31`.

| item | value |
| --- | --- |
| `core` test suite | **215 files, 5356 tests passed** (as of `2463304`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `2463304`) |
| repo test suite | **219 files, 5543 tests passed** (as of `2463304`) |
| `export/loader-read.ts` | new: 24 tests, four lines, four sentences, one partition |
| the loader's unpack, on our paths | **30 of 30** leaf directories hold exactly two names |
| the loader's baseline, on our tables | **30 of 30** non-empty; **8 rows** at the thinnest |
| the loader's ranking column, by the path's own name | **7 of 30** (was 7 by suffix — the same number, for a reason that is now checked) |
| the loader's candidate pool | **52 names: 35 services, 15 another kind of entity, 2 that name no entity** |
| names its `-db` removal rewrites | **2** (`billing-db`→`billing`, `orders-db`→`orders`); **0** answers among them |
| `core` coverage, statements / branches / functions / lines | **99.97 / 99.79 / 100 / 99.97** |
| export failure sites | **99** across 52 of 70 scripts, all annotated |
| audits | 1–**338**, **335 findings** (absent: 118, 132–133) |
| progress volumes | **9** (this one, now 11 rounds: v3.21–v3.31) |

### Left open

- ~~**The path token.** Unchanged and unchanging: a corpus cannot claim an identity it does not
  have, so upstream refuses the path. Everything the loader does *after* that line is answered and
  now measured.~~ Closed by finding 338, as a decision: the corpus answers the data half and does not
  write an identity it does not have.
- **The fifteen names of another kind in the pool.** Reported, not trimmed, because the readings are
  taken from the same pool. `[open: whether a pod should be a candidate at all is a question about
  the metric, not about the export]`
- **18 of 30 cases still have no log line and 24 no span.** The figure this entry carried until this
  round -- 19 and 25 -- was v3.26's, and v3.27 moved it by authoring one of each; the guard has
  printed `logs 12 / traces 6` since, and nothing joins an open entry's number to the line that
  prints it. Corrected here rather than carried again. `[open: the corpus-authoring round is still
  unstarted]`
- **The bounds have never expired.** `[open: `measure-ci-baseline.mjs` refreshes them, and the
  refresh is a deliberate act]`

The four items v3.32 left open stand unchanged, including the corpus-authoring one and the official
metric's own width; none of them was touched this round.

### Unchanged

The corpus, the answer keys, the checkpoints, the published localisation readings (rank 1: 48 of 60),
the round trip (375 / 270 / 90), the three graded target contracts, and every budget the plan
enforces. This round added a reader and a rule; it moved no answer.

## v3.32 — two decisions that carried a sentence where a number belonged

v3.31 ended with two things decided in prose. The candidate pool stayed wide because "both localisers
rank every metric-bearing entity, and the published readings come from that same pool", and the failure
sites were called proved because a test *names* each one. Neither sentence had a number beside it, and
this round is the bill for both: one decision got a price, the other got an instrument, and both now
read the same surviving verdict — the pool stays, and every proved site fires.

### One: the pool's price, printed every run

The sentence predicted the trim would cost readings. Ranked both ways over the corpus's 30 cases and two
baselines each:

| reading | as shipped | services only |
| --- | --- | --- |
| rank 1, of 60 runs | **48** | **52** |
| top-3, of 60 | **60** | **56** |
| answer absent | **0** | **4** |
| cases a services-only pool can score | **30** | **28** |
| pool width, per case | 35–37 names | 35 |

Rank 1 goes *up*, and that is the argument against the trim rather than for it. Six runs move up over
three cases — `ingest-queue` a message queue over `ingest-writer`, two `search-node-*` pods over
`search-cluster`, `order-node-5` over `payment-gateway` — and none of them was outside the top-3 before,
so the four new rank-1 placements are promotions inside a window that already held the answer. A
benchmark that deletes the louder competitor is a benchmark that stopped asking what those cases ask.

What it costs is two cases: `history-middleware-replica-lag-analytics` answers `analytics-replica`, a
database, and `history-dependency-upstream-5xx-pricing` answers `tax-calculation`, an external
dependency. One asks *which replica*, the other asks whether the fault is ours at all; a pool of
services cannot name either, so the trim does not score them worse, it removes them.

### Two: the price is a line, not a paragraph

`fault/pool-width.ts` holds the filter, the two tallies and the sentence; `check-fault-cases` prints it
after the pool line:

```
check-fault-cases: narrowing the pool to services: rank 1 48 of 60 -> 52 of 60, top-3 60 -> 56,
absent 0 -> 4; 'history-dependency-upstream-5xx-pricing' would stop being scorable (tax-calculation is
an external dependency), 'history-middleware-replica-lag-analytics' would stop being scorable
(analytics-replica is a db); 6 run(s) it moves up are promotions inside a top-3 that already held the
answer, and 4 run(s) lose it outright
```

The sentence refuses to read as a gain: it names both cases it removes, calls the movements promotions,
and prints `absent` beside rank 1 so `52` cannot be quoted without `4`. `absent` is not a service in the
filter either — the loader's own `-db` removal produces names no entity carries, and admitting one would
re-admit what the partition in finding 338 files as "names that no entity carries".

### Three: the branch half of the site ledger

The open list has carried "the meta-gate proves a gate is caught by at least one test, not that every
exit has one" since the ledger was built. The deriver attaches a naming test; a name is not an
execution. V8 writes block coverage per process, including every child the suite spawns, so each of the
41 naming tests was run alone under its own coverage directory and each site's line converted to a byte
offset:

| reading | value |
| --- | --- |
| proved sites | **93** |
| reached by their own naming test | **93** |
| naming test files | **41** |
| exempt sites that fire anywhere | **1 of 6** (`probe-denial-inventory.mjs:229`) |

So the caveat resolves in the direction nobody had checked: every proved site is reached by the test
that proves it. The five exempt sites that never fire are the injection harnesses and two probes, whose
verdict is a battery that CI runs as a step rather than as a unit test — which is what `exempt` means.

### Readings

> Ledger for `v3.32`.

| item | value |
| --- | --- |
| `core` test suite | **216 files, 5373 tests passed** (as of `a533032`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `a533032`) |
| repo test suite | **220 files, 5560 tests passed** (as of `a533032`) |
| `fault/pool-width.ts` | new: 13 tests, 3 runtime exports, 7 type-only |
| rank 1, as shipped → services only | **48 of 60 → 52**, and 30 → **28** scorable cases |
| top-3, as shipped → services only | **60 → 56** |
| failure sites | **99** across 52 of 70 scripts; **93 proved, 6 exempt** |
| proved sites reached by their own test | **93 of 93** |
| audits | 1–**340**, **337 findings** (absent: 118, 132–133) |
| progress volumes | **9** (this one, now 12 rounds: v3.21–v3.32) |

### Left open

- **The official metric's own width is upstream's to read.** The export keeps every name; what the
  scorer does with a ranking 35–37 wide is its decision, and the reading here only prices ours.
  `[open: whether the official metric trims, widens or keeps the pool is a property of the scorer, and nothing in this repository can measure it]`
- **Five exempt sites never fire.** They belong to the injection harnesses and two probes, whose verdict
  is a battery step. `[open: a battery step is a CI run rather than a test that names a site, so the ledger cannot hold them the way it holds the other 93]`
- **18 of 30 cases still have no log line and 24 no span.** Each of the 18 says why in a sentence that
  names the mechanism: a fault that degrades without failing, a process killed before it wrote, a
  counter rather than a line, a line that would restate a declaration. Authoring one would invent
  evidence. `[open: the corpus-authoring round is still unstarted, and the reasons say it should not be]`
- **The bounds have never expired.** `[open: `measure-ci-baseline.mjs` refreshes them, and the refresh is a deliberate act]`

The four items v3.32 left open stand unchanged, including the corpus-authoring one and the official
metric's own width; none of them was touched this round.

### Unchanged

The corpus, the answer keys, the checkpoints, the published localisation readings (rank 1: 48 of 60),
the round trip (375 / 270 / 90), the three graded target contracts, the export, and every budget the
plan enforces. This round added a measurement and a sentence; it moved no answer.

## v3.33 — the ledger's word was measured against the thing it claims

v3.32 ended by quoting "93 of 93 proved sites are reached by the test that proves them" and adding the
caveat it could not discharge: the instrument establishes that the line ran, not that the test asserted
what it prints. This round asks both halves properly, and the first answer is that the sentence was
sharper than its instrument.

### One: the range is the file for a third of the sites

The reading asked whether the innermost V8 range covering a site's byte offset had a non-zero count. V8
gives a block hierarchy per **function**; module-level code is one range for the whole body, so a
`process.exit(1)` inside `if (… ) { … }` at module scope reads "reached" the moment the script starts.

| reading | value |
| --- | --- |
| proved sites | **93** |
| innermost range is a branch block | **60** |
| innermost range is the module body | **33** |
| script never loaded | **0** |

Indentation was the first guess at a static shortcut, and it is wrong: `check-fault-cases.mjs:90` is
indented inside an `if` and still gets the module range, while `apply-pins.mjs:62` is indented the same
and gets an 83-byte block. The predicate is "inside a function", and it agrees with the prediction on
**60 of 93** — the guess is the reading's opposite number.

### Two: the falsifiable question needs no coverage

Change the exit and run the test the ledger names. Two mutants, because they answer different things:

| mutant | what a failure means | caught |
| --- | --- | --- |
| `process.exit(44)` — a different failure code | the test pins *which* exit ran | **88 of 93** |
| `process.exit(0)` — the failure becomes a success | the test notices the gate stopped failing | **89 of 93** |

Four sites survive both, and each turned out to be something different:

| site | what it was | outcome |
| --- | --- | --- |
| `check-citations.mjs:86` | no test drove a broken corpus | **one case added**, mutation now caught |
| `verify-example-pack.mjs:79` | no test passed a directory with no files | **one case added**, mutation now caught |
| `check-cli-reference.mjs:51` | `gates-are-testable.test.ts` drives it; the ledger names a different file | recorded, no test needed |
| `check-official.mjs:1378` | nothing drives it — see below | left open with a diagnosis |

The two new cases assert the exit code *and* the sentence, because the verdict is the pair; each was
re-mutated afterwards and now catches.

### Three: the fourth is two sentences in one file disagreeing

`check-official.mjs:1378` is the enumeration gate — "declared but round-tripped, and no finding names
the difference". Reaching it needs a case that is declared, not round-tripped, and records no failure.
Every skip path records one, except the contract skip two hundred lines above, whose paragraph says the
skip "is not a pass and not a failure". A case its target refuses by contract does exactly that: it is
declared, it does not increment `roundTripped`, and it pushes no failure. The gate would then report that
"a path was added that does not" about the case the file has just said is not a failure.

Unreachable on the shipped corpus (all 735 score), and not a dead branch — a contradiction. Which
sentence is right is a behaviour decision, and the fix needs a fixture corpus whose target refuses a
case, so this round writes the diagnosis and leaves the code alone.

### Readings

> Ledger for `v3.33`.

| item | value |
| --- | --- |
| `core` test suite | **216 files, 5375 tests passed** (as of `459d6a3`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `459d6a3`) |
| repo test suite | **220 files, 5562 tests passed** (as of `459d6a3`) |
| new cases | `audit-citations.test.ts` +1, `pack-verify-script.test.ts` +1 |
| proved sites caught by the test the ledger names | **88 of 93** at `exit(44)`, **89 of 93** at `exit(0)` |
| ... after this round's two cases | **90** at `exit(44)`, **91** at `exit(0)` |
| sites whose coverage range is the module body | **33 of 93** |
| failure sites | **99** across 52 of 70 scripts; **93 proved, 6 exempt** |
| audits | 1–**342**, **339 findings** (absent: 118, 132–133) |
| progress volumes | **9** (this one, now 13 rounds: v3.21–v3.33) |

### Left open

- **The enumeration gate and the skip paragraph disagree.** `[open: the enumeration gate and the skip paragraph disagree about whether a contract skip is a gap, and deciding that is a behaviour change that needs a fixture corpus whose target refuses a case]`
- **`provedBy` names a test that mentions the script, not the test that drives it.** One site is observed
  only by `gates-are-testable.test.ts`. `[open: the column records a mention, and the file that drives a gate through a fixture table is not the file the deriver can see]`
- **The per-site run is a measurement, not a CI step.** 93 sub-runs, 6 m 28 s, against a batteries job
  already at 25 of 30 minutes. `[open: a per-site mutation pass costs a third of the batteries budget and the ledger is checked by hand at each revision]`

The four items v3.32 left open stand unchanged, including the corpus-authoring one and the official
metric's own width; none of them was touched this round.

### Unchanged

The corpus, the answer keys, the checkpoints, the published localisation readings (rank 1: 48 of 60), the
round trip (375 / 270 / 90), the three graded target contracts, the export, the pool's price and every
budget the plan enforces. This round added two test cases and two measurements; it moved no answer.

## v3.34 — the slice that admits code faults only was scoring a resource fault at 1.00

v3.33 ended with a contradiction it deliberately did not fix: the enumeration gate compared
`roundTripped` against `declared`, so every case the target refuses by contract counted as an unnamed gap,
while the skip paragraph above it said such a case "is not a pass and not a failure". The finding left the
decision open and asked for "a fixture corpus whose target refuses a case".

Looking for that fixture found something upstream of it: the runner **could not produce a refusal at all**,
and the reason is a defect of its own.

### One: the fallback that became an override

```js
...(entry.suite === 'RE3' ? { faultCategory: 'code' } : {}),
```

The fallback exists for a real problem — RE3's directories label the fault by an index (`f1`…`f5`), and
`inferFaultCategory('f1')` is `unknown`, correctly, so without the suite's statement every RE3 case is
refused (finding 268). But it was applied to **every** RE3 case alike. Measured on a corpus holding one case:

```
ROUNDTRIP PASS   1/1 RE3-TT/ts-order-service_cpu/1  target=rcaeval-re3  oracle=1.00 signals=82
```

A CPU fault, scored 1.00, inside the one slice whose published rule admits code-level faults only. The
contract the target exists to enforce was waived by the script that invokes it, and the waiver printed
nothing. That is worse than the contradiction v3.33 found: a contradiction at least fails loudly once
something reaches it.

### Two: the name now wins, in both directions

```js
...(entry.suite === 'RE3' && inferFaultCategory(entry.faultType) === 'unknown'
  ? { faultCategory: 'code' }
  : {}),
```

| corpus | before | after |
| --- | --- | --- |
| `RE3-OB/emailservice_f1/1` (label is an index) | `PASS … oracle=1.00` | `PASS … oracle=1.00` — finding 268 holds |
| `RE3-OB/emailservice_cpu/1` (label is `cpu`) | `PASS … oracle=1.00` | `SKIP … reason=RE3 targets code-level faults only` |

The refusal is not a new mechanism: `exportRcaEval` already wrote it into `ExportOutcome.skipped`, the field
whose doc comment says a caller taking only `files` "scores a population it cannot name". The round trip took
only `files`.

### Three: which made v3.33's branch reachable, and it failed

```
ROUNDTRIP FAILED
ROUNDTRIP   - 1 case(s) declared but 0 round-tripped, and no finding names the difference
```

There was no gap. There was one case, named, with the exporter's sentence beside it. So the decision v3.33
left open is settled on the weaker branch: **a refusal the exporter names is accounted for**, and the gate
takes the reason from `exported.skipped` rather than inferring it from a report that came back empty.

The arithmetic moved out of the script into `score/roundtrip-account.ts` (7 tests), because the branch
cannot be taken on purpose — every path that drops a case records a failure first, so there is no input to
write for the path that does not. What the module can be tested on is the sum, the sentence and the gap. The
equality is also printed on the passing path now, which is new:

```
ROUNDTRIP ACCOUNTED 735 = 735 round-tripped + 0 refused by contract
```

### Four: three reversions, and two of them changed nothing

Each edit was reverted on its own, against the 61-test round-trip file:

| reverted edit | effect |
| --- | --- |
| the category fallback (unconditional again) | **2 tests fail** |
| the gate's equality (`roundTripped === declared`) | **2 tests fail** |
| `allowEmptyReason` restored on the per-case call | **61 pass** |
| `skipped = report.caseCount === 0` (refusal not read) | **61 pass** |

The last two are cleanups, not repairs, and this round counts them as cleanups. What they change is who may
testify: `'the round trip names the single target under test'` is a statement about the **other eight**
targets, and accepting it for this one let `status` read `skipped` for an exporter that had written nothing;
`refusal` replaces "the report looks empty" with "the exporter named this case". Neither moves a byte on any
corpus this repository ships — which is precisely why they were measured rather than argued.

### Five: which corpus the fix is for

The correction changes no verdict on the shipped slice, and that is a measurement rather than a hedge.
RE3's ninety case directories label their fault with an index — `f1`…`f5`, plus one
`ts-route-service_f3_1` — and `inferFaultCategory` is `unknown` for every spelling of that form, so the
fallback still fires for every case there. What changed is the handling of a corpus whose directories do
name a category, which is what `--official-dir` lets an operator point at.

That is also why the defect survived four rounds of reading this file: on every corpus it had been run
against, the unconditional fallback and the correct answer were the same value.

### Readings

> Ledger for `v3.34`.

| item | value |
| --- | --- |
| `core` test suite | **217 files, 5388 tests passed** (as of `22c7eb2`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `22c7eb2`) |
| repo test suite | **221 files, 5575 tests passed** (as of `22c7eb2`) |
| new module | `score/roundtrip-account.ts` — 7 tests, 1 runtime export, 2 types |
| new round-trip cases | **3** (`refuses a resource fault…`, `adds the two halves…`, `prints the accounting on a run that refuses nothing`) |
| RE3 resource fault, before → after | `PASS oracle=1.00` → `SKIP, reason=RE3 targets code-level faults only` |
| enumeration gate | `roundTripped === declared` → `roundTripped + refused === declared`, printed on every run |
| failure sites | **99** across 52 of 70 scripts; **92 proved, 7 exempt** (was 93 / 6) |
| audits | 1–**343**, **340 findings** (absent: 118, 132–133) |
| progress volumes | **9** (this one, now 14 rounds: v3.21–v3.34) |

### Left open

- **The shipped RCAEval corpus's RE3 categories are unmeasured.** All 735 cases round-trip and nothing here
  says what their categories are; the fix's evidence is a two-case fixture, and it establishes that the
  runner would have accepted a resource fault at 1.00, not that the corpus contains one.
  `[open: the corpus's own fault categories are not in any reading this repository takes]`
- **The two cleanups in this round have no test that distinguishes them.** Both revert green. They are
  justified by what they make impossible, not by a reading.
  `[open: a change whose justification is "who may testify" cannot be falsified by an output that is byte-identical either way]`

### Unchanged

The corpus, the answer keys, the checkpoints, the published localisation readings (rank 1: 48 of 60), the
round trip's three target contracts (375 / 270 / 90), the export, the pool's price and every budget the plan
enforces. This round moved one verdict on one synthetic corpus and one row of the site ledger.

## v3.35 — the corpus has eleven fault types and this repository could name six

v3.34 ended with the sentence that had been the gap for two rounds: *all 735 cases round-trip, and no reading
here says what their categories are.* This round took that reading, and the answer is not the one the
sentence assumed — the corpus does not merely have categories this repository had not counted, it has
**135 cases whose category this repository could not name at all**.

### One: the reading, and why it is cheap

Nine archives, 5 161 758 943 bytes, ~38 GB extracted. Every question about *labels* is answered by a zip's
central directory — a contiguous block at the end of the file, 24–139 KB per archive — so
`scripts/read-remote-index.mjs` reads all nine lists for **1 190 358 bytes, 0.023 % of the corpus, in 63
seconds**. The reader is a range request, a backwards scan for the end-of-central-directory signature, and a
fixed-count parse; anything that does not parse is an error rather than an empty list, because an empty list
would read as a corpus with no cases.

Two host facts are in the finding rather than in a comment: the host answers `403` to Node's default
`User-Agent` and `206` to an agent that names itself (measured over five strings), and none of the nine
archives needs zip64 — so that path is refused by name instead of shipped untested.

### Two: what it found

`GROUP BY category` over the 735 cases, before anything changed:

```
resource 360, network 240, unknown 135
```

The 135 are two families, and the corpus names both in its own paper §3.2, quoted in `corpus-fault-taxonomy.ts`:

| family | cases | the corpus calls it |
| --- | --- | --- |
| `socket` | 45 | the fourth **resource** fault (`stress-ng`, inside the container) |
| `f1`…`f5`, `f3_1` | 90 | the five **code-level** faults, each with its own name |

So the code-level slice was not one fault called "code": it is **five distinct faults**, and the pipeline
could not tell `f4` (incorrect *return values*) from `f1` (incorrect *parameter values*) — which is the axis
the next phase of this campaign is about.

### Three: a table that may only add

`fault/corpus-fault-taxonomy.ts` holds the eleven rows and reads a label in two steps, in this order and
never the other:

```
inferFaultCategory(type) !== 'unknown'  ->  it decides; the table only supplies the name
inferFaultCategory(type) === 'unknown'  ->  the table decides
```

The direction is a test, not a comment ("never contradicts the classifier where the classifier speaks"). The
census counts which reading ran per row, so `classifier 600 / taxonomy 135 / unknown 0` is printed rather than
asserted.

`fault/corpus-census.ts` groups a declared set by suite, category and fault type and prints it. It reports
three things a count cannot: which reading named each fault, the tokens **no** reading names, and the
directories that carry a case's marker file and are **not** cases.

### Four: the 736th directory

Walking for `inject_time.txt` gives 736 directories for a corpus the README calls 735 cases. The extra one is
`RE2-OB/checkoutservice_cpu/multi-source-data/` — a run component that is not a number, a `.DS_Store`, and a
sibling `multi-source-data.zip`. `parseRcaEvalPath` has always refused it because the instance must be digits,
so every round trip reports 735: **right by a rule nobody had written down**, and invisible, because 736
rounds to 736. The census prints it by path and `golden-master/corpus-census.json` records it.

### Five: the runner is narrower, and the difference is one case

```js
// before (v3.34)                              // after (v3.35)
entry.suite === 'RE3'                          inferFaultCategory(entry.faultType) === 'unknown'
  && inferFaultCategory(...) === 'unknown'       && corpusFault.category !== 'unknown'
  ? { faultCategory: 'code' }                    ? { faultCategory: corpusFault.category }
```

Identical on the shipped corpus — every RE3 label is a taxonomy token — and different on a corpus whose RE3
label is neither a category nor a token. Measured on a one-case corpus labelled `zzz`:

```
ROUNDTRIP SKIP   1/1 RE3-OB/emailservice_zzz/1  reason=RE3 targets code-level faults only
CENSUS unnameable 1 case(s): zzz (1)
ROUNDTRIP ACCOUNTED 1 = 0 round-tripped + 1 refused by contract
```

v3.34 stamped that case `code` and scored it. The new line stamps nothing, and the refusal travels as a skip
the ledger can see. One test (`refuses a case whose fault label nothing here can name`) is the difference.

### Six: a starvation budget, measured rather than assumed

`background-telemetry.test.ts` reported `Test timed out in 5000ms` on one of its four corpus checks during
this round's first full-suite run: 226 files, four workers on a four-CPU quota, every test passing. The check
costs **364 ms** standalone and **5 002 ms** in that run. That is not work; it is scheduling, and the file
already had the shape that makes it happen — four `spawnSync` calls to `check-fault-cases.mjs`.

The remedy is the one `timeout-budget.test.ts`'s second arm prescribes rather than a smaller fixture: a suite
budget of `30_000`, stated once for the file, with the measurement recorded in that gate's table. No assertion
changed.

### Readings

> Ledger for `v3.35`.

| item | value |
| --- | --- |
| `core` test suite | **222 files, 5456 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **226 files, 5643 tests passed** (as of this commit) |
| new modules | `fault/corpus-fault-taxonomy.ts` (3 runtime exports, 2 types), `fault/corpus-census.ts` (2 runtime exports, 4 types) |
| new scripts | `scripts/read-remote-index.mjs`, `scripts/census-corpus.mjs` |
| new tests | **62** across five files, plus 2 round-trip cases |
| corpus census, before → after | `resource 360, network 240, unknown 135` → `resource 405, network 240, code 90` |
| fault types named | 6 of 11 → **11 of 11** (12 tokens including `f3_1`) |
| the corpus, as bytes | **735 cases** from **1 190 358 of 5 161 758 943 bytes** (0.023 %) |
| directories that are not cases | **1**, named by path |
| failure sites | **103** across 54 of 72 scripts; **103 proved, 0 unannotated** (was 99 / 52 of 70) |
| audits | 1–**345**, **342 findings** (absent: 118, 132–133) |
| progress volumes | **9** (this one, now 15 rounds: v3.21–v3.35) |

### Left open

- **The taxonomy's names are transcribed from a paper, not measured from the archives.** The *tokens* are read
  off nine central directories; the *names* — "Incorrect Return Values" for `f4` — come from §3.2 and one
  worked example in the corpus's own notebook, which is the strongest source that exists for them.
  `[open: nothing in the corpus states f4's human name in a file; a reader has to trust the citation]`
- **`socket` is named by the taxonomy and still `unknown` to the classifier.** That is deliberate — they answer
  different questions — but it means a user-written slug containing "socket" is still `unknown`, and the
  census's 11-of-11 is a statement about the corpus.
  `[open: two vocabularies now exist and only one of them reads the corpus]`

### Unchanged

The corpus, the answer keys, the checkpoints, the localisation readings (rank 1: 48 of 60), the round trip's
three target contracts (375 / 270 / 90), the export, the pool's price, and every budget the plan enforces.
This round moved one refusal on one synthetic corpus, added a reading, and added four failure sites.
