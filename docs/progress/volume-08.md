## v3.07 — the third rung had to end inside the system, and only one sample could carry it

**What was at stake.** The ladder's top rung was met at two of nineteen the round before: 0.105 against
a floor of 0.1, which is one annotation of margin. The corpus is committed to annotating every sample
in the extraction key, so the size the share has to survive is thirty — two of twenty is exactly 0.100
and two of twenty-one is 0.095. A third three-step chain was therefore not an improvement to the corpus
but the **gate on every remaining annotation in it**, and it had a second requirement the first two do
not meet: both of them end at an `external:` entity, so the corpus had no three-step chain whose
propagation stays inside the system being measured.

**The eleven samples that could not carry one.** Read against the rule the chain gate applies — every
hop is an edge in the topology, and every entity a chain names is either named by the ticket or a
deployment fact of one that is — the unannotated samples top out where their text stops:

| sample | furthest chain | what stops it |
| --- | --- | --- |
| `resource-memory-leak-recommendation` | container → pod → service | the leak, the OOM kill and the restart are all inside one service; no caller is named |
| `resource-disk-full-log-collector` | node → pod → service | the volume is a node fact and the agent is the collector itself |
| `network-loss-payment-gateway` | gateway → caller | one hop, and **backwards**: the drop counter is on the client's node, so a chain from the ticket's component would run from the victim |
| `network-partition-search-cluster` | node → pod → service | the querying side is "queries on one side", not a component |
| `code-null-dereference-reporting` | service | one workload, one line, no second entity |
| `config-feature-flag-checkout` | storefront → callers | the key's component is `storefront`, which is the top of the call graph, so nothing is above it to reach |
| `dependency-version-incompatibility-shipping` | container → pod → service | it never starts, so nothing downstream of it moves |
| `runtime-container-start-notification-worker` | container → pod → service | same shape: a workload that never serves has no consequence to follow |
| `code-off-by-one-invoice-renderer` | service | the totals still match and nothing is logged |
| `dependency-schema-change-currency-feed` | feed → settlement | the fields that were wrong are read by a party the ticket does not name |
| `middleware-cache-shard-product-index` | **node → pod → service → reader** | the third hop is there: "reads against the surviving shards kept answering" is a sentence about the readers |

That table is a **reading of eleven texts against one rule**, not a measurement, and it is written down
so the next round can disagree with it by name rather than rediscover it.

**The one that could, and the last hop it needed.** `history-middleware-cache-shard-product-index` is
the corpus's first three-step chain that ends inside the storefront. The chain is a replacement cache
node whose zone label is missing → the replica that joined with no slot → the cluster with two of
sixteen slots unowned → the catalogue, which keeps answering. The ticket names the label, the count and
the duration; it names its readers only as "reads" and "dashboards", so `catalog-service` — the graph's
reader of a product index — is the one entity in this case that is **implied rather than quoted**. That
is stated in the case's index entry rather than glossed there, and the entity layer of the case does
not rest on it.

**The signals are two forms of one fact and a zero.** A slot gauge at 0 that reads 2, the keyspace
coverage that follows arithmetically from it (fourteen of sixteen is 87.5), and the reader's error
share at zero for the whole window. There is deliberately **no latency series**: the ticket says the
reads kept being answered and says nothing about how long they took, and a plausible-looking latency
curve would be the corpus answering a question the ticket did not ask.

**A gate nobody had, found while trying to justify a comment.** `difficulty.ts` declined a `breadth >=
3` row by asserting that "a root cause off its own chain is a defect the four-layer assessment already
refuses". Nothing refused it — the entity layer asks only that the root resolve, the process layer only
that each step's ends resolve — so an annotation could answer in a component its chain never reaches
and pass G1, G2 and G5 together. The rule now exists as `ROOT_OFF_ITS_CHAIN`, and its first draft
passed everything *including the case written to fail it*, because `resolveEntityRef` returns an id and
the draft read `.entityId` off it (finding 281). The test beside it is the only reason the round says
this rather than shipping a gate that agrees with everything.

**And a count nobody re-derived.** `background-telemetry.json` justified itself with "seventeen quiet
neighbours" while holding twenty-two series, in the one file whose purpose is to make a ranking
falsifiable (finding 282). The phrase now names no count, and a test refuses the shape.

### Acceptance

| gate | before | after |
| --- | --- | --- |
| the corpus | 19 of 30, `L1 2 / L2 9 / L3 6 / L4 2` | **20 of 30, `L1 2 / L2 9 / L3 6 / L4 3`** — 0.150 today, **0.100 at the committed thirty** |
| three-step chains | 2, both ending at `external:` | **3, and the third ends at `catalog-service`** — held by a test, not by the readout |
| the graph | 50 entities, 34 edges | **53 / 37** (a cache service, its second replica, the replaced node, and the reader's call) |
| background | 22 services | **23**, and the omission direction is refused by `backgroundProblems` as before |
| G2's chain rules | numbering, contiguity, no revisit | **plus `ROOT_OFF_ITS_CHAIN`** (finding 281), case-level at the export boundary |
| `core` | 192 / 4778 | **192 / 4783** |
| repo | 196 / 4965 | **196 / 4970** |
| coverage | 99.97 / 99.75 / 100 / 99.97 | 99.97 / 99.75 / 100 / 99.97 (the new branch in `gates.ts` is covered in both directions) |
| audit | 8 volumes, findings 1–280 | **1–282** |
| the guard's readout | `22-24 candidate(s) wide`, `strictly displaced in 2` | `23-25 wide`, unchanged at **2** — the new case's answer is at rank 1 under both baselines |

### What the margin is now, stated once

Three of thirty is 0.100 and the floor is 0.1, so the corpus can annotate **all ten remaining samples
as L1 to L3** and still meet its own target — and not one case more. The suite asserts that share
against the committed denominator as well as against today's count, because the number that decides
the plan is the one at full size, not the one on the day it was written.

### Left open

- **Ten samples remain, and every one of them tops out at two hops.** `[open: the next three-step
  chain cannot be annotated from the key as it stands, so a fourth L4 case is a decision about the
  extraction key rather than about effort]`
- **The third hop's reader is implied rather than quoted.** `[open: the ticket says "reads" and
  "dashboards"; `catalog-service` is the graph's reader, so a reviewer who disagreed with that
  modelling choice would find no sentence in the ticket to overrule it]`
- **The new case's answer is at rank 1 because its diagnostic series has a zero baseline.** `[open:
  the slot gauge is 0 before and 2 after, so its z is `2 / 1e-6`; the case is a structural L4 and a
  trivial localisation at the same time, which is the counter-at-rank-1 limit this log already carries]`
- **`ROOT_OFF_ITS_CHAIN` is exercised by fixtures and by the corpus, not by a case that failed it in the
  wild.** `[open: the rule was written after the corpus had already agreed with it twenty times, so its
  evidence is a test rather than a repaired annotation]`

Unchanged from the rounds before, and each still a limit rather than a task: both earlier three-step
chains end outside the system; a counter at rank 1 is the floor rather than a localisation; RE3 emits
no rows for the cache case; the reversal between two entities of one kind is still not detectable
statically; and upstream's loader still refuses a system it does not know.

## v3.08 — the budget was claimed for the test where the stall was noticed

**What was at stake.** The round before ended with three commits pushed and CI green on the first and
third of them. The second — `700f1cdd4`, a one-sentence correction to a case's description — was
**red**: `build / typecheck / lint / coverage / mutation` failed three tests of
`gate-sites-are-proven.test.ts`, each reported `Test timed out in 5000ms`. The commit after it changed
documentation only and passed. A commit cannot fix a test by editing prose, so the red and the green
describe one state of the code and two states of the machine, and the round cannot honestly call its
work finished until it says which.

**What the three tests cost.** Measured per test under v8 coverage, on the same tree:

| test | measured | reported on CI |
| --- | --- | --- |
| `rule 6 · rejects a site that is both proved and exempt` | 4 ms | > 5000 ms |
| `rule 6 · reports the shipped tree as clean when run through the same function` | 50 ms | > 5000 ms |
| `rule 7 · accepts the shipped tree, so the rule is not merely strict` | 44 ms | > 5000 ms |

The file is 476 ms of test time, 667 ms standalone. A 50 ms test reported at 5 s was not working; the
process was not being scheduled. The three named tests are exactly the three that call `pointerRoot()`
and validate all 89 sites — the most expensive thing the file does, and still 40× under the budget it
was judged against.

**Why the file's own budget did not cover them.** `RULE_TIMEOUT_MS = 30_000` already existed, declared
with the sentence "vitest's five-second default is not a measurement of anything", and applied to
**one test of thirty-three**. A stall belongs to the process; the budget had been claimed per test, so
it protected the test where the stall had once been noticed and left thirty-two on the default.

**Why the reader that owns the question could not see it.** `timeout-budget.test.ts` holds standalone
cost per *file*. This file's cost is 667 ms, so the table correctly says nothing about it. The quantity
that exceeded 5 s was neither the file's cost nor a plausible multiple of it — the gap is a missing
**unit**, not a missing row: files are measured, tests time out.

**The mechanism, measured rather than assumed.** A probe with a six-second sleep:

| spelling | 6 s sleep | result |
| --- | --- | --- |
| `describe(name, { timeout: 9_000 }, fn)` | top level | **passes at 6007 ms** |
| the same, nested inside another `describe` | nested | **passes at 6003 ms** |
| no suite budget, per-test budget absent | control | **fails at 5005 ms** |

`vi.setConfig({ testTimeout })` was rejected and the reader refuses to read it: it mutates config that
outlives the file inside a worker, so one file could raise another's budget and silence a real timeout.

**What now holds the decision.** A fourth reading in `timeout-budget.test.ts` — the suite option — plus
a table (`SUITE_BUDGET_MS`) of files that must state their budget there, each row carrying the
measurement that justifies it. The predicate is falsifiable in three ways it is tested on: the
per-test-only spelling reads as 0, a budget inside a comment reads as 0, an undeclared name reads as 0.

| gate | before | after |
| --- | --- | --- |
| `gate-sites-are-proven.test.ts` | `30_000` at 1 test of 33 | **at the suite**, covering all 33 and anything added later |
| `timeout-budget.test.ts` | 3 readings, all per-test | **4 readings**, plus a table of files that must use the fourth |
| the reader's header | "given `RULE_TIMEOUT_MS = 60_000`" — stale by half | **corrected**, and it now records why the budget moved to the suite |
| `core` | 192 / 4783 | **192 / 4787** |
| repo | 196 / 4970 | **196 / 4974** |
| coverage | 99.97 / 99.75 / 100 / 99.97 | **unchanged** — the new readings are exercised in both directions |
| audit | 8 volumes, findings 1–282 | **1–283** |

### Left open

- **A missing budget is still invisible to every static arm.** `[open: the ReferenceError this
  constant once caused was found by measure-doc-counts.mjs spawning pnpm test, not by a reader; the
  static arm can refuse a wrong number and cannot see an absent one]`
- **Six other files apply their budget to some of their tests and not others.** `[open:
  check-no-unsafe-shell 1 of 47, check-official-roundtrip 1 of 57, check-user-guide 0 of 14,
  ingest-report 0 of 16, publish-battery-report 0 of 6, typecheck-entrypoint 0 of 4 — each justified
  in place by what its heavy test does, and none of them walked, so none is in the table]`
- **The trigger is not measurable from the repository.** `[open: the stall is a property of the
  runner, so the evidence for this finding is one red run and one green run of the same bytes rather
  than a profile the tree can reproduce]`

Unchanged from the round before, and each still a limit rather than a task: ten samples remain and top
out at two hops; the third hop's reader is implied rather than quoted; the new case's answer sits at
rank 1 on a zero baseline; `ROOT_OFF_ITS_CHAIN`'s evidence is a test rather than a repaired annotation.

## v3.09 — a reading sits on its unit's grid, and the twenty-first case

**What the round set out to do.** The plan's first item was the next annotation: one of the ten
samples without a four-layer case, one round at a time. The sample chosen was
`code-off-by-one-invoice-renderer`, because its only moving reading is *how many lines a page carries*
— a count of things — and writing the guard for it raised a question the corpus had never been asked.

**What the question found.** Nothing checked that a declared count expands to whole numbers. The rule
was written, and the shipped corpus failed it in **31 places across 6 series**:

| case | series | declared | the expansion produced |
| --- | --- | --- | --- |
| `config-ingress-timeout-partner-portal` | `ingress_504_responses_total` | 0 → 1 | `1.02`, `0.984`, `1.016` |
| `queue-watermark-ledger-writer` | `producer_buffer_records` | 200 → 40000 | `203.2`, `196.8`, `201.2` |
| `resource-memory-request-ingest-writer` | `backlog_messages` | 200 → 50000 | `203.2`, `196.8`, `201.2` |
| `container-crash-loop-media` | `container_restarts_total` | 0 → 178 | `22.25`, `44.5`, `66.75` |
| `pod-shutdown-webhook-dispatcher` | `webhook_deliveries_dropped_total` | 0 → 300 | `37.5`, `112.5` |

Two mechanisms, and the second is the one worth stating: sampling noise is a fraction of the reading
(`200 ± 2 % = 203.2` records), **and** a counter's accumulation is divided into eight equal steps
(`178 / 8 = 22.25` restarts). The module's docstring says a counter is "exact because it is a total",
and exact is not the same as whole — that is the sentence the round had been missing.

**Why every door was open.** The range cannot see it (`count` has no ceiling, so `clampToUnit` is silent
by construction, finding 252). The vocabulary check cannot see it (finding 254 refused the `noise` field
on a counter; it never asked what the samples were). And the anomaly gate cannot see it: G3 asks whether
a metric sustains `|Z| >= 2`, and `Math.abs(203.2) >= 2` is true — a fractional reading is not *wrong*
to G3, it is merely a number.

**The fix, and the fact that no data changed.** The unit table states a second obligation beside the
range: the grid a reading may land on.

| function | answer | why it is not the other thing |
| --- | --- | --- |
| `admitsFraction('count')` | **false** | a count is a number of things |
| `admitsFraction('cores')` | true | `500m` is a quantity in thousandths, not half a processor |
| `admitsFraction('MiB/s')` | true | a unit the table does not know: same decision `measurementBounds` makes |
| `quantizeToUnit(unit, value)` | `Math.round` for a count, unchanged otherwise | rounding rather than refusing, because 178 restarts must stay expressible |

`withNoise` applies both — `quantizeToUnit(unit, clampToUnit(unit, level))` — and the counter branch
applies the grid alone. **Not one declaration in `golden-master` was edited**, and the corpus went from
31 problems to zero: the data was always right, the arithmetic that read it was not.

**The rule that was written three times.** The first version called the expansion with the raw
declaration and reported `NaN` for `client_pool_connections_in_use` — a defect in the rule, filed
against the corpus, because that case's `post` is a `{ parameter }` reference and `object - number` is
`NaN`. The resolution is now one function used by both call sites. The second version checked the
samples and could not fail once the expansion quantized; it was removed, because **a gate no input can
fail is a line a reader learns to skip**. The third asks a different question — is the *declared*
reading one the expansion can keep — and `post: 201.5` in `count` now fails it.

| gate | before | after |
| --- | --- | --- |
| `unit.test.ts` | 16 tests | **19** (`admitsFraction` ×2, `quantizeToUnit` ×1) |
| `derived-telemetry.test.ts` | 30 tests | **31**, one pinning sixteen numbers across both mechanisms |
| `check-fault-cases.test.ts` | 109 tests | **110** (one added, one whose premise the fix removed) |
| the corpus | 31 fractional samples | **0** |
| the guard | `noise` vocabulary only | **also refuses a count declared as a fraction** |
| core / cli / repo | 192 / 4787 · 4 / 187 · 196 / 4974 | 192 / **4792** · 4 / 187 · 196 / **4979** |
| coverage | 99.97 / 99.75 / 100 / 99.97 | **unchanged** |
| audit | 8 volumes, findings 1–283 | **1–285** |

**The twenty-first case.** `history-code-off-by-one-invoice-renderer` — L3, two hops, and the first
case in the corpus whose *correct* readings outnumber its moving one. The total reconciles, no log line
was written, and the only series that moves is `rendered_lines_per_page`, from six to five. Both
numbers are the case's own parameters (`pageSize`, `renderedLinesPerPage`), so the gap of one is
arithmetic the text states rather than two values edited into agreement.

| reading | before | after | what it is |
| --- | --- | --- | --- |
| `rendered_lines_per_page` | 6 | 5 | the only reading that can locate the defect, and it moves by one |
| `invoice_totals_matched_ratio` | 1 | 1 | a **correct** reading: the total is summed from the source list, off the loop's path |
| `invoice_render_log_lines` | 0 | 0 | an absent log, not a quiet one: the item was dropped without a condition that could fail |

The corpus reading: **21 of 30**, `L1 2 / L2 9 / L3 7 / L4 3`, 71 of 71 checkpoint references resolve,
0 of 67 comparable assertions fail, 56 entities and 39 edges, 24 services each with a background
series. Strict displacement stays at **2** — the new case's answer is at rank 1 on both baselines, which
is the honest reading and not the one this round wanted.

### Left open

- **The third strict displacement is still not built.** Both existing ones are "one fault plus one loud
  bystander"; what is wanted is a case where the loudest reading belongs to a *different fault*. None of
  the ten remaining samples carries two faults, so this needs either a new sample or a decision.
  `[open: a case where the loudest reading belongs to a different fault, not to a bystander]`
- **The stalest volume has 107 bytes left.** `docs/audit/volume-03.md` is 279,893 of a 280,000-byte
  budget. Any edit to it fails the gate, and the failure will look like a broken guard rather than a
  full volume. `[open: volume-03 is 107 bytes under its budget; nothing warns before the edit]`
- **`resolvedReadings` is a convention, not a type.** `expandSeries` takes `Number`s, the script builds
  the resolution, and the obligation to apply it lives in a helper's comment. A `.ts` caller makes the
  same mistake and gets the same silent `NaN`.
  `[open: the resolution is enforced by a helper and a comment, not by the signature]`
- **Ten samples remain unannotated**, and the structural ceiling is still two hops for all of them.
  `[open: ten of thirty samples carry no four-layer case]`

Unchanged from the round before: the trigger for a suite budget is a property of the runner; the
`same-component` rename is uncounted; rule 7 is a file-level claim; `ROOT_OFF_ITS_CHAIN`'s evidence is a
test rather than a repaired annotation; and a budget that is *missing* is invisible to every static arm.

## v3.10 — a log checkpoint stated a containment, and the body it named was read by nothing

**Where the round started.** The plan's first item was the twenty-second annotation, and the sample
chosen was `code-null-dereference-reporting` — a case whose evidence is a stack trace, which meant the
annotation would need its first `signalKind: 'log'` checkpoint in three rounds. The question that
stopped the round before the case existed was the obvious one: **what checks a log checkpoint?**

The answer was nothing. The guard resolved the log id it cited, counted the reference, and moved on.
Four checkpoints of the shipped corpus state a phrase beside that id, and the phrase was never compared
with the line.

**What that found in data that had been green for rounds.** Three of the four hold. The fourth is
`history-runtime-container-crash-loop-media`, which asserts `contains "segmentation fault"` about a body
that reads `SIGSEGV in native ffmpeg binding …`. The incident text says the container "logs a
segmentation fault", so the phrase is right; the body is a reconstruction, so the signal's name is right
too. They were written by two hands and nothing put them beside each other (finding 286).

**The repair.** A log has no magnitude, no unit and no order, so the one relation it can be asked about
is containment. The comparator is closed to `contains`, the phrase has to be a non-empty string, and it
has to appear in the body the case declares. The count is separate from the comparable pair, because a
log assertion fails for a reason arithmetic cannot express, and the report's parenthetical gained its
fourth kind — which is what finally makes the printed kinds **sum to the total**, an arithmetic a
previous round tried to assert, found broken, and withdrew.

**The other half of the round is a count that could not be decomposed.** RE2 writes `logs.csv` and
`traces.csv` for every case, and the corpus supplied neither for most of them: **35 files with a header
and no rows**, printed as a number and nothing else. `35` is `15 + 20`, and no reader could tell whether
two modalities accounted for it or three. The count now names its parts, read off the exporter's own
paths (finding 287), and the corpus was given the spans its own texts already state — four cases whose
incident text states a request latency and whose declaration carried no span:

| case | the text's number | the span |
| --- | --- | --- |
| `history-checkout-cpu-saturation` | `180ms to 4.3s` | `checkout` at 4300 ms |
| `history-middleware-redis-latency-session-cache` | `0.4ms to 55ms` | `GET` at 55 ms |
| `history-code-slow-regex-api-gateway` | `spiked to 8s` | `HTTP request` at 8000 ms |
| `history-config-ingress-timeout-partner-portal` | `needs about eight seconds` | `POST /upload` at 8000 ms |

**The twenty-second case.** `history-code-null-dereference-reporting` — L3, two hops, the corpus's
seventh case with a log line and its first whose evidence layer *is* a log checkpoint. The mechanism is
the distinction the corpus exists to keep: the migration is the trigger, the guard that admits a null is
the defect, and a case that named the migration would be answerable from the deploy log instead of from
the code.

| gate | before | after |
| --- | --- | --- |
| `check-fault-cases.test.ts` | 110 tests | **115** |
| the corpus | 21 of 30, L1 2 / L2 9 / L3 7 / L4 3 | **22 of 30, L1 2 / L2 9 / L3 8 / L4 3** |
| log checkpoints | 4, one of them false, none asserted | **5, all asserted**, `5 of 5` hold |
| cases with a span | 1 of 21 | **5 of 22** |
| RE2 files with no rows | 35 | **32**, and named |
| RE2 / RE3 cases written | 21 / 4 | **22 / 5** |
| entities and edges | 56 / 39 | **59 / 41** |
| core / cli / repo | 192 / 4792 · 4 / 187 · 196 / 4979 | 192 / **4797** · 4 / 187 · 196 / **4984** |
| coverage | 99.97 / 99.75 / 100 / 99.97 | **unchanged** |
| audit | 8 volumes, findings 1–285 | **1–287** |

**The ladder lost its slack, and the round says so with an assertion.** The difficulty test used to
prove the L4 share survived the loss of one case — two of nineteen is 0.105. The corpus has since grown
at L3 without growing at L4, so removing one now lands at two of twenty-one, 0.095, and the property is
gone. What replaced the old assertion is derived rather than described: three L4 among **thirty** cases
is exactly the floor and among **thirty-one** it is not, so the ninth remaining annotation is the first
that cannot be L1, L2 or L3. That is P3's deadline expressed as arithmetic.

### Left open

- **The trace modality is bounded by the extraction key, not by the corpus.** Nineteen of the thirty
  incident texts state a duration for a window rather than for a request, so a span for them would be
  the only fabricated number in the corpus. `[open: a span needs a duration and nineteen of thirty
  texts state none, so the trace modality cannot be completed by annotation]`
- **A modality declared and lost in the export is still green.** The breakdown names the files; nothing
  refuses a case that declares a log and exports none, because the comparison lives in the gate script
  rather than in the exporter. `[open: the export is downstream of the declaration and no instrument
  compares them]`
- **A log checkpoint cites an entity and quotes a line attributed to a service, and nothing compares
  them.** `[open: checkpoint entityRef and log service are two statements about one owner]`
- **The fourth L4 case is now on a deadline, not on a wish.** At thirty-one cases the ladder is red
  without one. `[open: three L4 of thirty is the floor exactly; the ninth further annotation must be L4
  or the corpus is outside its target]`

Unchanged from the round before: eight samples remain unannotated; the third strict displacement needs a
case with two faults; `volume-03` is 107 bytes under its budget; the resolution obligation lives in a
helper rather than in a type; the probe reads some build without naming it; `same-component`'s rename is
uncounted; rule 7 is a file-level claim; `ROOT_OFF_ITS_CHAIN`'s evidence is a test rather than a repaired
annotation; and a budget that is *missing* is invisible to every static arm.

## v3.11 — the statistic was a change times a million

**Where the round started.** The plan's first item was the twenty-third annotation, and the case chosen,
`dependency-schema-change-currency-feed`, was meant to test a hypothesis the plan had carried for four
rounds: that a corpus can only get a *third* strictly displaced case from a sample with two faults in it,
and that a fourth L4 needs a deeper extraction gold standard. Building the case was how both claims got
disproved. Understanding *why* they were wrong is what found the bug.

**The bug.** A case is located by a statistic, and both baselines compute one by dividing a change by a
baseline's spread. `zScore` floors that divisor at `1e-6`, and the corpus's noise is a *fraction* of the
reading — so a baseline of zero (an error ratio in healthy operation) and a count on its own grid (six
lines per page, always six) both have a spread of exactly zero. The floor then became the scale:

| case | the answer's statistic before | after |
| --- | --- | --- |
| `history-kafka-consumer-lag` | 4 200 000 000 000 | 4 200 000 |
| `history-middleware-cache-shard-product-index` | 12 500 000 | 12.5 |
| `history-unhandled-exception-export` | 3 060 000 | 3.06 |
| `history-config-ingress-timeout-partner-portal` | 1 000 000 | 1.49 |
| `history-config-datasource-url-orders` | 1 000 000 | 126.85 |
| `history-network-mtu-blackhole-catalog` | 1 000 000 | 100 |
| `history-code-off-by-one-invoice-renderer` | 1 000 000 | 1 |

Seven of twenty-two cases were located by their change times a million, which means "the loudest
component" was, for those cases, "the component whose metric started on zero or on a grid". Within a
case it was worse than that: a metric that never moved beat one that moved fivefold with two per cent
noise, because it did not have to move to win — only to be flat.

**The fix is a third statement the unit table owed.** A unit already said how large a reading may be
(`measurementBounds`) and what it may land on (`admitsFraction`, finding 284). It now says how small a
change it can express: `resolutionOf` answers `1` for a `count`, `1` for `%`, `0.01` for `1`, one of the
unit as written for a duration, a byte count, a rate or a core, and the old constant only where nobody
declared a unit at all. It is the divisor **only** when the baseline never moved; a baseline that moved
is measured and its own spread divides, because this is a floor and not a cap.

**The probe was the instrument that was already asking.** `probe-z-floor.mjs` exists to answer "does the
corpus's classification depend on the floor", and it was comparing `1e-6` against one per cent of the
baseline — two constants, one of which was the shipped rule. Its shipped arm now *is* the shipped rule,
which turns the probe into a regression detector for this change:

```
1 of 23 case(s) put the answer at a different rank (one resolution of the declared unit versus
1% of |baseline|); 1 change kind, 0 of them into or out of strict
```

`0 of them into or out of strict` is the claim the corpus's evidence rests on, and it survives: all three
strictly displaced cases are strictly displaced under both arms.

**The twenty-third case, and the two claims it refuted.** `dependency-schema-change-currency-feed` — the
feed changed what one existing field *means* (`rate` was exact, now rounded to two places, with `inverse`
added beside it) and settlement reads `rate` as its contract says. Three hops that leave the service they
start in: container → pod → service `currency-feed` → service `settlement`. That is `L4` by depth, **with
no change to the extraction key** — the depth came from a cross-service chain, and the graph already had
the `calls` edge to express it.

And the displacement needed no second fault: settlement's mismatch share reads **38** while the answer's
field count reads **1**, so a method that returns the largest excursion returns the victim. The plan had
assumed the decoy had to be another incident; it does not have to be, because a symptom is naturally
larger than the change that caused it. That is the stronger statement of the two — a corpus with two
faults can be answered by finding the louder incident, while this one punishes ranking by magnitude on a
single incident.

| gate | before | after |
| --- | --- | --- |
| the corpus | 22 of 30, `L1 2 / L2 9 / L3 8 / L4 3` | **23 of 30, `L1 2 / L2 9 / L3 8 / L4 4`** |
| strictly displaced cases | 2 | **3**, the first where the louder component is the victim |
| the L4 share at the committed size | 0.100, exactly | **0.133**, and the floor binds only at 41 cases |
| L4 cases the corpus can lose | 0 | **1** |
| checkpoints | 74 of 74 | **78 of 78**, and 6 log assertions instead of 5 |
| entities / edges / background | 59 / 41 / 25 | **65 / 46 / 27** |
| core / cli / repo | 192 / 4797 · 4 / 187 · 196 / 4984 | 192 / **4807** · 4 / 187 · 196 / **4994** |
| coverage | 99.97 / 99.75 / 100 / 99.97 | **unchanged** |
| audit | 8 volumes, findings 1–287 | **1–289** |

**Two readings moved that the round did not set out to move.** `same-component 2` became `same-component
0`, and `rank 1: 36` became `rank 1: 38`: the two cases whose pod used to outrank its own service were
being ranked that way *by the constant*, and the test that recorded one of them said so in a comment --
"the `epsilon` floor turns its rise into an enormous z, and the pod that carries it outranks the
service". A pod is not a miss (`classifyDisplacement` is right to call it `same-component`), so nothing
was broken; but the corpus was reporting that its answer had been displaced in two cases where the
service was in fact first, and a reader who counts displacements was counting the epsilon.

**Two deadlines dissolved, and one is recorded as arithmetic.** Last round closed with "three L4 among
thirty is exactly the floor and among thirty-one it is not", which made the next annotation mandatory at
L4. Four of thirty is 0.133 and four fall below a tenth only at forty-one cases — beyond the thirty the
extraction key holds — so the ladder is safe for every corpus the key can supply. The test now derives
that size instead of quoting it, and it asserts the other side too: the corpus survives losing one L4
case and fails at two.

### Left open

- **The resolution of a continuous unit is a convention.** A duration declared in `ms` resolves in
  milliseconds although the declaration can express `12.4`; the table says so rather than deriving it.
  `[open: a resolution is stated per dimension, not derived from what a declaration has actually written]`
- **A measurable spread still divides however small it is.** The fix bounds the degenerate case and does
  not make the statistic unit-free: a metric with vanishing noise still outsizes one of a coarser unit.
  `[open: the divisor is max(spread, step) only when the baseline is flat; two noisy metrics of different
  units are still compared through their own spreads]`
- **The floor is called in two modules and nothing ties them.** `resolutionOf` is invoked by
  `baseline-localiser.ts` and `robust-localiser.ts`, and a third localiser could divide by something else.
  `[open: the agreement between the baselines is a convention rather than a type]`
- **The new case's second hop is a claim about a deploy.** "Every replica runs the release" is not a
  reading; nothing in the corpus checks it, and the same sentence appears in two other chains.
  `[open: a hop whose mechanism is a rollout has no reading behind it]`
- **`settlement` carries one series.** A control showing its other dependencies healthy would have been
  the honest third reading, and the incident text does not state one — the gate refused the draft that
  invented it. `[open: the case's evidence rests on two readings and a log line]`

Unchanged from the round before: seven samples remain unannotated; the third strict displacement now
exists but the *fourth* would need a shape the corpus has not got; **`volume-08` is 107 bytes under the
280,000-byte budget**, so the next finding has to start a ninth volume rather than append (the same
number `volume-03` has been sitting on for two rounds); the resolution obligation lives in a helper rather than in a type; the probe reads some build
without naming it; `same-component`'s rename is uncounted; rule 7 is a file-level claim; `ROOT_OFF_ITS_CHAIN`
evidence is a test rather than a repaired annotation; a modality declared and lost in the export is still
green; and a log checkpoint's `entityRef` is never compared with the service its line is attributed to.

## v3.12 — every test passed and the run was not green

**Where the round started.** Not with the plan. v3.11 was pushed as `92a1f9319` / `76b8a02f4` and CI
came back failed with `Test Files 192 passed (192)`, `Tests 4807 passed (4807)`, `Errors 1 error` and
coverage complete on all four dimensions. A round that cannot tell whether its own predecessor was
green cannot claim the next step, so the first item became the red instead of the twenty-fourth
annotation. `docs/audit/volume-09.md` carries the two findings; this is the round's account of them.

**What the error was, and what it was not.** `[vitest-worker]: Timeout calling "onTaskUpdate"` names
the worker's call to the main process and no test at all. Three explanations were available and each
predicted something the log does not show: a starved runner predicts a timeline gap (the largest in
157 KB of log is 7.7 s, and it is the gap before a slow file's own completion line); a per-test timeout
predicts a `Test timed out` line (there is none); a slower machine predicts a local pass with a shorter
wall time (the local run takes the same 108 s). What survived was a controlled pair.

**The pair is the finding.** Two files, nine tests each, seven seconds of `sleep` in each test, one
token different:

| the file | total | result | exit |
| --- | --- | --- | --- |
| nine synchronous children | 63.97 s | `[vitest-worker]: Timeout calling "onTaskUpdate"` | 1 |
| nine awaited children | 63.91 s | clean | 0 |

Both pass every test, both spend 63 seconds, and the wall times agree to 60 ms — so anything that
explains the red as *slowness* predicts the wrong row. The bridge's deadline is 60 s (`birpc`'s
`DEFAULT_TIMEOUT = 6e4`, not configurable through any vitest option), the timer that measures it runs
in the worker, and Node's timers phase runs before pending IPC: a loop blocked for 60 s reads its own
expired timer first and throws, having never read the answer that arrived long before.

**Which file, measured from the report rather than guessed.** `check-cli-reference.test.ts` ran
61,201 ms on the runner across nine cases, each spawning the gate and one `--help` per topic — nine
synchronous children of about seven seconds, awaiting only microtasks between them. Its sibling
`cli-reference-backend-table.test.ts` was at 28,237 ms.

**The fix removes the blocking rather than spending less of it.** Both files wait for their children
now (`execFile` in a promise), and the suite's wall time is unchanged because the children take the
same time either way. Then, because "no file blocks the loop past the bridge's deadline" is a property
of the suite rather than of a file, it is measured:

| what | where | reading |
| --- | --- | --- |
| the gauge | `test/support/event-loop-stall.ts` | longest stretch the loop did not turn, sampled every 50 ms, plus the stretch in progress when the file ends |
| the hook | `test/setup/stall-watch.ts` | `setupFiles`, so every file's worker runs it; fails the file, naming the budget and the deadline |
| the budget | 45,000 ms | three quarters of the deadline; the two largest legitimate stalls (36.7 s `typecheck-entrypoint`, 33.6 s `ingest-report`) sit inside it with 15 s of headroom |
| the calibration | `stall-budget.test.ts` | reads `DEFAULT_TIMEOUT` out of the installed chunk and holds the constant equal to it |
| the proof it can fail | `stall-budget.test.ts` | a real vitest over a two-case project at a 300 ms budget: the blocking case fails with the verdict, the awaited case passes |

**The second finding is about the rule that proves gates can be tested.** Rule 7 of
`gate-sites-are-proven.test.ts` accepted three spellings of "this file runs that script", and all three
were synchronous. Converting the CLI-reference file to `execFile` therefore made the rule report the
site as `declares it but never spawns it`: a rule about *evidence* had become a requirement that a
proved gate's test block its own event loop. The evidence classes are now one constant (`SPAWN_CALL`)
covering `spawn`, `execFile` and `exec` as well, with a negative lookbehind so a regex's `.exec(` is not
read as a child. Both readers use it; the alternation had been typed twice, which is how the two could
drift.

**And the previous round's "fix" for this symptom is corrected where it was written.** The header that
introduced `cli-reference-backend-table.test.ts` said the timeout came "under the accumulated update
traffic" and that "splitting the file is the fix rather than widening a timeout". The split halved the
blocking window instead of removing it; the file it left behind grew back past 60 s two rounds later,
and `40886479390` is the recurrence. The paragraph is replaced with the pair and the mechanism.

### Left open

- **The `cli` package is not instrumented.** Its four files are small and the gauge lives in core's test
  tree, so wiring it there needs a shared module this round did not pay for.
  `[open: the property is measured in one package of two, and the cli package has no gauge at all]`
- **Sixty-nine other test files still spawn synchronously.** The gauge makes a file's total visible
  only when it crosses the budget; that is a threshold, not a prohibition.
  `[open: the budget is a bound on the symptom rather than a prohibition, and the suite's largest legitimate stall is 82% of it]`
- **The budget is chosen from two points and a constant.** 36.7 s legitimate, 61.2 s fatal, 60 s the
  deadline, 45 s the line between them; a slower runner moves the legitimate side without moving the
  fatal one. `[open: a number with three anchors and no measurement of the runner it protects, which is where this could break next]`
- **A starved main process would say the same thing.** The pair proves the worker-side mechanism, not
  that it is the only one; `maxWorkers: 8` on a two-vCPU runner is still an over-subscription.
  `[open: only the worker side of the bridge is measured, and the main process can be starved by maxWorkers alone]`
- **Rule 7 now accepts `spawn` of anything.** A helper that spawns a non-script child and is also called
  with a script path would have that path counted as driven; a false inference shows up as a
  disagreement with `DRIVES` rather than as silence, which bounds it but does not remove it.
  `[open: the widened evidence class is bounded by the declaration rather than by the call, so a false inference is loud, not silent]`

Unchanged from the round before: seven samples remain unannotated and the twenty-fourth was **not**
built this round; the fourth strict displacement would still need a shape the corpus has not got; the
resolution of a continuous unit is a convention; a measurable spread still divides by itself; the floor
is called in two modules with nothing tying them; `settlement`'s second hop is a claim about a deploy;
`volume-08` is at its budget (the ninth volume now exists, opening with this round's findings);
`same-component`'s rename is uncounted; `ROOT_OFF_ITS_CHAIN`'s evidence is a test rather than a repaired
annotation; a modality declared and lost in the export is still green; and a log checkpoint's
`entityRef` is never compared with the service its line is attributed to.

---

## v3.13 — the stopwatch was proved to work, and never proved to be installed

**Starting point.** v3.12 ended with an instrument and a CI reading. The instrument is the suite's
stopwatch: `test/support/event-loop-stall.ts` measures the longest stretch a file held the worker's
event loop, and `test/setup/stall-watch.ts` fails that file when the stretch is over budget. The CI
reading, on `c83a2521a`, is `Test Files 193 passed`, `Tests 4816 passed`, and **no `Errors` line** —
which is the one line whose absence is the difference between finding 290 and a green run.

**What this round found.** The instrument is installed by a single line of
`packages/core/vitest.config.ts`, and nothing in the repository would have noticed its deletion. This
was measured rather than argued: with the line removed, `stall-budget.test.ts` still passed all nine
cases and the suite was green with 4 816 tests, because the battery that proves the hook can fail
resolved the hook's path itself. A proof about a file it happens to name, and not about this suite.

| state of the install line | the battery | the new check | the suite |
| --- | --- | --- | --- |
| present | 9 passed | — | green, gauge installed |
| deleted, before this round | 9 passed | did not exist | **green, gauge gone** |
| deleted, after this round | **2 failed** | **1 failed** | red, 3 failures in 2 files |

**The fix has three parts, and the third is the one that matters.**

| part | where | what it holds |
| --- | --- | --- |
| a reader for configs | `test/support/installed-setup-files.ts` | parses `setupFiles` as text, resolves each entry against the config's own directory, and refuses six ways of being absent while looking present |
| the join | `test/stall-watch-is-installed.test.ts` | one entry, it is `stall-watch.ts`, it exists, it registers `afterAll`, its budget comes from the support module, and it throws on a verdict |
| the load-bearing proof | `test/stall-budget.test.ts` | the battery now installs the hook the config installs, read from that config, so a deleted entry makes the blocking case *pass* and fails the battery |

Text rather than an import, for the reason `coverage-thresholds.test.ts` already gives about the same two
configs: importing a config executes it and answers "what would vitest receive", not "what does the file
say". The two agree today; they would stop agreeing the day someone computed the entry, and that is the
case the reader refuses instead of guessing at.

**Why this is the right next step rather than the twenty-fourth case.** The corpus is at 23 of 30 and has
waited a round already. But v3.12's repair ends in a sentence that is only true if a config line survives
review, and the round that bought it also produced a CI reading whose new property — "the longest single
stall is under 45 s" — is *only* observable through that instrument. Shipping the next case on top of an
unverified instrument is how a measurement quietly becomes a claim. The case is next, and nothing about
it has changed.

### Readings

| what | reading |
| --- | --- |
| delete the install line | **3 tests red in 2 files** (was: suite green, no gauge) |
| `stall-watch-is-installed.test.ts` | **13 tests** (did not exist before) |
| the reader's refusals | **6**, each with a case that produces it |
| suite counts | **moved by exactly what this round added: one file and thirteen tests, in `core`** |
| coverage (statements / branches / functions / lines) | **99.97 / 99.75 / 100 / 99.97**, unchanged |
| `cli` suite | **4 files, 187 tests passed**, 100 on all four dimensions |
| `docs:check` | OK — audit 1–292, 289 findings, largest volume 279,893 of 280,000 bytes |

The absolute numbers for the pass above are in `volume-05.md`'s status table, which is the one place a
count lives. This section states the movement instead of a second copy, and the reason is a measurement
rather than a style: the second copy was caught going stale **within one round**. The row said
`194 files, 4829 tests passed` when this section was written, and the next round's status table said
`195 files, 4842 tests passed` at a *higher* line of a *lower* volume -- so the guard read the pair as a
suite that lost thirteen tests. A per-round narrative that retypes a count is a row that is born correct
and becomes a falsehood when someone else adds a test.

The runner numbers for the two files v3.12 converted are worth stating because they are not the numbers
this round's summariser first wrote down: `check-cli-reference.test.ts` is **52,862 ms** on the runner
(not the 18,731 ms measured locally) and `cli-reference-backend-table.test.ts` is **26,468 ms**. Awaiting
a child does not shorten it; it only lets the loop turn. The property that was bought is `longest single
stall < 45,000`, and the CI log has no `held the event loop` in it.

### Left open

- **The `cli` package has no gauge.** Its config declares no `setupFiles`, so 187 tests over the CLI are
  measured for nothing, and this round's check names `packages/core/vitest.config.ts` rather than every
  package that runs tests. `[open: the property is measured in one package of two, and a third package would inherit the silence]`
- **The hook's throw is read, not executed, by the installation check.** Execution is the battery's half
  and the two halves are joined only by the path; a hook that called `stallVerdict` and discarded the
  result would pass the reading. `[open: the installation check reads a throw rather than producing one, so the battery is the only execution of it]`
- **An installed hook could throw only sometimes.** Nothing asserts the budget the hook runs with beyond
  "it comes from the support module"; an environment override is a legitimate way to raise it in CI.
  `[open: the effective budget is whatever the environment says, and nothing compares it with the deadline at run time]`
- ~~**`volume-09` is at its budget** (279,893 of 280,000 bytes), so the next finding opens `volume-10`.~~
  Closed by finding 294. It was false when written: `volume-09.md` held **18,803** bytes and 279,893 is
  `volume-03.md`. The number came from the guard's `largest 279,893 of 280,000 bytes`, which names no file,
  and the round that needed it supplied the name it had just been writing in. Both summaries now print the
  file, and the next finding appends to `volume-09` rather than opening a tenth.
- **Two hundred and eighty-nine findings across nine volumes**, three numbers absent (118, 132–133); the
  count of *entries* is what the table carries, and it is now one row behind the corpus.
  `[open: the volume table states counts, and a count that is retyped per append is the defect it documents]`

Unchanged: seven samples remain unannotated and the twenty-fourth case was **not** built this round
either; the fourth strict displacement needs a shape the corpus has not got; the resolution of a
continuous unit is a convention; a measurable spread still divides by itself; the floor is called in two
modules with nothing tying them; `settlement`'s second hop is a claim about a deploy; `same-component`'s
rename is uncounted; `ROOT_OFF_ITS_CHAIN`'s evidence is a test rather than a repaired annotation; a
modality declared and lost in the export is still green; a log checkpoint's `entityRef` is never compared
with the service its line is attributed to; and the sixty-nine files that spawn synchronously are bounded
by the budget rather than prohibited.

---

## v3.14 — the twenty-fourth case, and the five defects the round produced

**Starting point.** The corpus was at 23 of 30, with seven samples unannotated and P1 untouched for two
rounds. v3.13 closed with an instrument whose installation is now checked; v3.12 closed with the
instrument itself. Nothing was waiting on either of them.

**What this round did.** It built the twenty-fourth case — `resource-disk-full-log-collector`, the corpus's
first `disk-full` — and the case produced two defects that had nothing to do with the case.

| layer | the case's answer |
| --- | --- |
| entity | `container:…/log-collector-pruner` — the scheduled job that stopped running after the pod moved |
| fault | `resource` / `disk-full`, from `/var/lib/collector is at 100% usage` |
| process | pruner → pod → service: nothing trims, the volume fills, every write returns `ENOSPC` |
| evidence | six checkpoints: the ceiling, the pruner's stalled counter as arithmetic (`post - baseline == 0`), the 31-hour gap against a 24-hour window, the 20 GiB volume, the agent's `no space left on device`, and the write-failure ratio at 1 |

**It is the corpus's first case whose decisive reading is an absence.** Every other case argues from
something that happened — a spike, a step, a ratio going to one, a queue past a watermark. A scheduled job
that stopped produces nothing to point at except the flatness: `retention_runs_total` is a counter at 744
that does not move across the window, and the checkpoint states `post - baseline == 0` as arithmetic rather
than as a level, because no level can say "nothing ran". The full volume is the symptom every dashboard
already alerts on; the 31-hour gap against a 24-hour window is the policy violation, and the node's 20 GiB
is a checkpoint rather than a suspect — twenty gigabytes is a reasonable volume for a day of segments, and
it is the reason the fullness arrived this week rather than next.

### Defect one: nothing asked whose line a log checkpoint cites (finding 293)

The evidence layer's log checkpoint cites the agent's `ENOSPC` line. The guard resolved the checkpoint's
entity and compared its phrase with the body — and never compared the two. One edit to a copy of the
corpus, pointing the checkpoint at `service:…/settlement`, produced the controlled pair:

| rule | verdict on the corpus with the checkpoint pointed at another component |
| --- | --- |
| absent | **`OK`, 24 of 30, every gate green** |
| present | **`FAILED — 1 problem(s)`**, naming both the entity and the line's author |

The rule is containment rather than equality because equality would refuse **three of the corpus's seven**
log checkpoints -- two name a container over a service-attributed line and one names a pod over a
container-attributed line -- and all three are right. Four of the seven agree on the name, which is why
equality is plausible and wrong. `sameComponent` moved from `fault/displacement.ts` to
`entity/graph.ts` rather than being copied, and the rule is a module with **16 tests**; emptying it turns
**6** of them red.

### Defect two: the fullest volume was reported without its name (finding 294)

v3.13's last "left open" item said `volume-09` was at its budget, 279,893 of 280,000 bytes. It was not:
`volume-09.md` held 18,803 bytes, and 279,893 is `volume-03.md`. The number came from the guard's own
summary, `largest 279,893 of 280,000 bytes`, which names no file — so the round attached the name of the
volume it had just been writing in. Both summaries now print the file, and both have a test whose
fixture's fullest volume is the **first**, so a rule that names a position rather than a file fails.

That is finding 290's shape again — a reading the reader must complete, completed wrongly and plausibly —
and it is why this round's own readings below state movement and point at the status table rather than
retyping a count that the next round will make false.

### Defect three: the probe answered about a number, not about a child (finding 295)

A coverage run of the suite failed once: `the grandchild 547275 outlived the runner`. Nineteen replays of
the same scenario — idle, under sixteen busy loops, under three pid-churn loops — found the grandchild
gone inside a millisecond every time. Two explanations were killed by measurement rather than by
argument: `kernel.pid_max` is 4,194,304 and the namespace was at ~547,000, so a recycled number in five
seconds is arithmetically impossible; and `/proc/<pid>` disappeared in ≤ 1 ms in all nineteen replays, so
no corpse sat in front of the probe.

What is left is the probe itself. `kill(pid, 0)` answers *"is there a process with this number"*, and the
question the group-kill tests ask is *"is the process I started still there"* — two questions that differ
for an exited-but-unreaped process and for a recycled number, both of which answer yes. The probe now
captures the process's **start time** while the number is known to name it and asks later about that
process, treating `Z`/`X` as over; where the platform reports no start time it falls back to the signal
question rather than claiming an identity it never saw. The failure message now carries what the pid is —
`state 'S' under parent 1, running 'sleep 30'` — which distinguishes the two remaining hypotheses a
survivor could have meant. The one failure itself remains unexplained, and the entry says so.

### Defect four: the coverage bound was a mean, and this round's own reading was a copy (finding 296)

The round closed by reporting `99.97 / 99.75 / 100 / 99.97` as unchanged. Measured after
`fault/log-attribution.ts` landed, the package read **99.68** branches — and the file read **77.77**, four
branches at `62`, `68`, `75-76`, all of them the rule's tolerance for the raw-JSON shapes the guard
actually passes in. Two separate faults:

| fault | what it looked like |
| --- | --- |
| the reading | 99.75 was the previous round's number, quoted rather than taken — the same shape as finding 294, one chapter above |
| the gate | thresholds were package totals, and a mean over 195 files is satisfied by any one file being terrible, especially the newest one |

Three tests cover the shapes, and one assertion makes the empty-`id` guard observable: a checkpoint with no
`signalRef` resolves to `''`, so an entry registered under `''` would be found by it. Removing
`|| one.id === ''` turns one test red. The bound is now `perFile: true` with the thresholds unchanged —
the cost was measured first, and the lowest per-file figures in the package are `official.ts` at 99.73
statements and 98.23 branches, whose uncovered statements are its documented `never` backstop. With the
three tests removed the file alone reports 77.77 and the run dies:
`ERROR: Coverage for branches (77.77%) does not meet global threshold (95%)`. The `cli` package does not
get `perFile`: one file at 100 in every dimension is a knob that cannot fail.

### Defect five: the worker cap was a number about this machine (finding 297)

The first push of this round came back red with **every one of the 4854 tests passing**. The stall
gauge named two files at 55,182 ms and 54,136 ms against a 45,000 ms budget whose whole purpose is to
stay under the worker bridge's 60,000 ms deadline. Neither file had anything to do with this round.

| reading | the previous run (green) | the run that failed | after the repair |
| --- | --- | --- | --- |
| total test time | 316 s | 540 s | **243 s** |
| `check-fault-cases.test.ts` | 23.0 s | 55.2 s | **22.1 s**, no longer one block |
| `ingest-report.test.ts` | 23.5 s | 54.2 s | **19.1 s** |

Two causes. A synchronous file's duration **is** a block: `check-fault-cases.test.ts` ran the guard 116
times through `spawnSync`, so the file's whole life was one block -- it now awaits the child and reads
`close` rather than `exit`. And `maxWorkers: 8` was chosen against memory on a 32-CPU box; a GitHub
runner reports 4, so eight workers was 2x oversubscription and CPU-bound files paid for it. The cap is
now `max(2, min(8, availableParallelism() - 1))`, which resolves to 8 here (local reading unchanged)
and to 3 there. The cap's effect alone is the row that was not touched: `ingest-report.test.ts`
54.2 s → 19.1 s.

### Readings

| what | reading |
| --- | --- |
| the corpus | **24 of 30 samples**, floor raised 23 → 24 |
| the graph | **70 entities, 50 edges** (five entities and four edges for the collector) |
| `disk-full` | the corpus's **first**, and the twenty-third distinct fault type |
| difficulty spread | **L1 2 / L2 9 / L3 9 / L4 4**, all 24 graded, within the target |
| localisation | 48 baseline runs over 24 cases, rankings 28–30 candidates wide; **rank 1: 40, rank 2: 8**; strict 6, tie 2, same-component 0, none 40; **three cases strictly displaced** |
| checkpoints | **84 of 84 resolve** (61 series, **3 derived** computed from 6 readings, 16 configuration, 7 log); **0 of 77** comparable assertions false; **7 of 7** log assertions hold |
| suite counts | **+9 tests in `core`** (2 from the case's telemetry, 2 the probe, 3 the attribution rule, 2 the bound); no new file, since all four new tests live in files that existed. The status table in `volume-05.md` holds the absolutes |
| coverage | **99.97 / 99.75 / 100 / 99.97** (statements / branches / functions / lines), now enforced **per file** -- the first measurement of the round read 99.68, because the new module was at 77.77 branches (finding 296) |
| `docs:check` | audit 1–297, **294 findings**, largest `volume-03.md` at 279,893 of 280,000 |
| CI | **five jobs green** on the fourth push; the first three carried the corpus, the instruments and the cap, and the third is where the stall gauge was red with every test passing |

### Left open

- **Six samples remain unannotated**, and each needs a shape the graph has not got or a decision this
  corpus has not made. `[open: the next case is a graph edit and an annotation, and the sample list is the plan]`
- **The node is coarser than the evidence.** A checkpoint on a node and a line from any pod it hosts are
  "the same component" under finding 293's rule, so a checkpoint could cite a neighbouring workload's line
  and pass. `[open: containment is a name relation with no argument about which workload on the node spoke]`
- **An ambiguous line author is reported as unattributed.** `resolveEntityRef` refuses a name two entities
  claim, so the message says the line has no author rather than that its author is ambiguous.
  `[open: one message covers two repairs, and the second is a graph defect the message does not name]`
- **`cli` still has no stall gauge**, the installation check names one package by hand, and 69 test files
  still spawn synchronously. Unchanged from v3.13. `[open: the property is measured in one package of two, and a third would inherit the silence]`
- **A synchronous test file's duration is a single block, and 68 of them still are.** The stall budget
  is a machine's reading either way: 45,000 ms comes from the bridge's 60,000 ms, not from measuring the
  slowest file. `ingest-report.test.ts` still blocks for its whole duration and fits only because the
  cap leaves it a CPU. `[open: one file converted, sixty-eight to go, and the budget is a margin rather than a measurement]`
- **A group kill that fails says nothing.** `signalGroup` swallows `ESRCH`: if `kill(-pid)` runs before
  the child's `setsid` has taken effect, the forwarder re-raises into its own death and the step's children
  survive, and nothing records that the signal went nowhere. It is the one hypothesis finding 295 could not
  rule out, and fixing it means deciding what the runner should do when it cannot signal a group it owns.
  `[open: the hole is real, the failure is unexplained, and the diagnosis is now what the message reports]`
- **A per-round count is a row that goes stale.** The guard caught the second copy within one round; the
  repair was to stop writing a second copy, which is a convention rather than a rule. `[open: nothing refuses a new round narrative that retypes the status table's numbers]`

Unchanged: the fourth strict displacement still needs a shape the corpus has not got; the resolution of a
continuous unit is a convention; a measurable spread still divides by itself; the floor is called in two
modules with nothing tying them; `settlement`'s second hop is a claim about a deploy; `same-component`'s
rename is uncounted; `ROOT_OFF_ITS_CHAIN`'s evidence is a test rather than a repaired annotation; a
modality declared and lost in the export is still green; and the upstream SLI table, RE3 traces and logs
and the aggregation table (P4) are untouched.

## v3.15 — three cases, three fault types the corpus did not have, and the join nobody made

This round annotated the twenty-fifth, twenty-sixth and twenty-seventh samples: `memory-leak`,
`network-loss` and `network-partition`. Each is a fault type the corpus did not have, so the count of
distinct types goes from 24 to 27 with no duplicates, and the corpus is at 27 of 30.

### What the three cases are about

| case | type | the reading that decides it | what it refuses |
| --- | --- | --- | --- |
| `resource-memory-leak-recommendation` | `memory-leak` | a **pair** of counters: 7,200 writes, 0 evictions | a cache that is large, and a limit that is small |
| `network-loss-payment-gateway` | `network-loss` | one wire counted from both ends: 8,600 retransmits, request rate 180 → 165 | a callee that answered and failed -- `gateway_error_ratio = 0` |
| `network-partition-search-cluster` | `network-partition` | a member count of 3 of 6 and **two** leader elections | a cluster that lost nodes, which looks the same from one side |

The leak case is the first whose evidence is two counters that only mean anything together: an absent
eviction is innocent on its own, and so is an absent write, and the pair says entries go in and
nothing comes out. The loss case is the first whose evidence is one quantity counted at both ends.
The partition case is the first whose answer is a *relationship* between two healthy halves rather
than a component that got worse -- and the first that records a limit of the annotation format rather
than working around it silently (finding 299).

### Defect one: the answer is a name, and nothing joined it to the telemetry (finding 298)

The first draft of the leak case filed every reading against the pod, because that is where a heap
lives, and left the service with one flat series. The guard said:

```
is not solvable by both baselines (peak-z-by-service=absent, median-shift-by-service=absent):
only 0 baseline(s) locate the root cause within top-K
```

That is a sentence about solvers, and the defect was three lines of JSON: the ranking finds the root
cause by exact match on a series' `service`, and the answer was `recommendation-service` while the
readings were filed under `recommendation-service-0`. The two files are siblings, so no schema sees
both, and nothing else did either.

`fault/answer-presence.ts` is the join, six tests, exact equality because the consumer uses exact
equality -- a check that resolved an alias would pass cases the pipeline cannot read. With the
readings put back under the pod the corpus now reports two problems, and the first one names the
component and the names the file actually has, instead of the search for a misspelled word.

### Defect two: one name per reading, so a partition has one viewpoint (finding 299)

A partition's evidence is two observations of one quantity that disagree. The signals file refuses to
say that -- `declares two series named 'cluster_members_visible', so a reference to it names neither`
-- and the refusal is correct, because `signalRef` is one string resolved against a map keyed on the
metric name. So the case says what it can (one member count, one election delta, one stale-read
ratio) and writes the cost down: *"the same metric on two entities" is the most ordinary shape in
production telemetry and this corpus cannot express it.* The fix -- `(entity, metric)` resolution --
touches the evaluator, both baselines and every case's names, and the round that does it should start
from a case that needs it. This one does.

### Defect three: three quarters of what a case declares about itself is prose (finding 300)

`fault.parameters` holds a case's own facts and a reading may cite one with `{ parameter: 'name' }`
(finding 258). Measured this round:

```
parameters 23 of 88 (26 percent) declared across 27 case(s) are read by a series point or a
configuration checkpoint; 65 are prose, in 27 case(s)
```

**Every one of the twenty-seven cases has a key nothing reads.** Some are legitimately descriptive
(`service`, `from`, `trigger`); others restate a number a reading already carries, which is the drift
the mechanism exists to prevent. `lossPercent: 8` now feeds `client_timeout_ratio.post` through the
unit table, so the injection spec and the reading are one number; five keys that were prose in a
parameter were deleted rather than kept. The count is printed on both exits because a rule would have
to decide which keys are descriptive and nothing in the file says.

### Readings

| what | this round |
| --- | --- |
| corpus | **27 of 30** samples carry a four-layer case; `floor 27` |
| distinct fault types | **27**, because each of the three is new |
| the graph | **86 entities, 68 edges** (eleven entities and sixteen edges for the three services) |
| background telemetry | **31 series**, one per service the graph holds |
| difficulty spread | **L1 2 / L2 9 / L3 12 / L4 4**, all 27 graded, within the target |
| localisation | 54 baseline runs over 27 cases, rankings 31–33 candidates wide; **rank 1: 44, rank 2: 8, rank 3: 2**; strict 8, tie 2, same-component 0, none 44; **four cases strictly displaced**, the fourth being this round's loss case |
| checkpoints | **100 of 100 resolve** (74 series, **9 derived** computed from 18 readings, 19 configuration, 7 log); **0 of 93** comparable assertions false; **7 of 7** log assertions hold |
| parameters | **23 of 88 read**, 65 prose -- the first measurement of a mechanism that had none |
| suite counts | **+1 file and +9 tests in `core`** (6 for the answer join, 3 the enumerated-surface rules that follow from a new module); the status table in `volume-05.md` holds the absolutes |
| coverage | **99.97 / 99.75 / 100 / 99.97**, per file, unchanged |
| `docs:check` | audit 1–300, **297 findings**, largest `volume-03.md` at 279,893 of 280,000 |

The fourth strictly displaced case is worth a sentence. Both baselines rank the loss case
`order-service` (8,600 retransmits) first and `order-node-5` (2,400 drops) second, with the answer
`payment-gateway` third on a 15 rps shortfall -- a count and a rate on one leaderboard, and the
symptoms are three orders of magnitude louder than the cause. That is not a defect to repair; it is
the corpus doing what a benchmark is for.

### Left open

- **Three samples remain unannotated** -- `config-feature-flag-checkout`,
  `dependency-version-incompatibility-shipping` and `runtime-container-start-notification-worker`.
  `[open: three cases to the sample count of 30, and each needs a service the graph has not got]`
- **`signalRef` is one name, so a partition has one viewpoint** (finding 299). Resolving it as
  `(entity, metric)` is the right change and it migrates every case at once.
  `[open: the corpus can say 'this metric moved' and cannot say 'it moved differently over there']`
- **65 of 88 parameters are prose** (finding 300), including numbers a reading restates by hand.
  `[open: the mechanism is 26 percent used, and nothing can tell a descriptive key from a forgotten one]`
- **The stall budget is a margin, not a measurement** (finding 297), and 68 files still spawn
  synchronously. `[open: one file converted, and one bad runner away from the same verdict]`
- **`signalGroup` swallows `ESRCH`** (finding 295), so a group kill that reaches nothing is silent.
  `[open: the hole is real and the failure it was found by is still unexplained]`

### Unchanged

The anchors, the exporters, the backends and the coverage bound. All three still read
`oracle = 1.00` on their pinned runs; `docs:check` is green in every guard; `perFile: true` still
holds every file at 95/95/100/95 without an exemption.

## v3.16 — the gate was green in a terminal, and the push never asked

This round added no case and no reading. It began with the previous round's own delivery, where three
revisions went up and the first of them was red:

| revision | what it was | six jobs |
| --- | --- | --- |
| `05cd7a609` | `feat(corpus)` -- three cases | **three failures** |
| `828543f52` | `fix(guard)` -- the join, the inventory, the lint | six successes |
| `7514fa3d4` | `docs` -- three findings | six successes |

The failures were `lint` exiting 1 and `gate-sites.json` stale against `derive-gate-sites.mjs --check`.
`verify:local` runs both, and the same tree fails them locally in under a minute. **The gate was not
weak; it was not asked** (finding 301).

### Why a hook could not have asked it

Because a hook is a property of `git push`, and this repository does not publish with `git push`. Every
push in its history -- all thirty-one of them -- went through `push_incremental.py`, which creates
blobs and moves `refs/heads/main` over the Git Data API. Nothing under `.git/hooks` is consulted for
any of that. The pre-push gate was not forgotten; **it was never in the path**, and the belief that it
was is what made the omission invisible.

### What was built

| piece | where | what it does |
| --- | --- | --- |
| the receipt | `scripts/gate-receipt.mjs` | one JSON file per verified tree under `.git/rca-bench-verified/`, keyed on `HEAD^{tree}` |
| the decision | `receiptDecision` | pure: issue only for a clean tree on a full run; withhold, in three different sentences, otherwise |
| the writer | `verify-local.mjs` | files the receipt on a green run, withdraws it on a red one over the same tree |
| the reader | `require_receipt` in the pusher | refuses a revision whose tree has none, before the first blob is uploaded |

The key is the design. `HEAD` moves when a commit message is amended, so a receipt keyed on it would
expire over no change of bytes; a tree SHA moves exactly when the content moves, which is the question
being asked. A dirty working tree gets nothing at all, because what ran is then content that exists
nowhere and cannot be pushed.

The withdrawal rule is the part that was not obvious. A red run over content an earlier green run
blessed takes the blessing back: two verdicts about identical bytes cannot both stand, and leaving the
older one in place would let a nondeterministic step pass a tree that had just failed.

### The price, stated rather than hidden

A receipt is per tree, and a tree is per revision, so a round that pushes three revisions must gate
three times. That is the mechanism working, not a cost to route around: a revision nobody verified is
a revision nobody should publish. This pass adopts **one revision per round**, which is what a round
is, and a second only when it has earned its own run.

### Proving it can fail

| mutation | what went red |
| --- | --- |
| `receiptDecision` issues on a subset run | `withholds on a subset run, because a receipt says the gate ran` |
| `readReceipt` accepts a receipt filed under another tree | `refuses a receipt copied from another tree, because the name is the whole claim` |
| `verifiedTree` reports a dirty tree as clean | `refuses a dirty tree, because what ran is content that cannot be pushed` |

Each mutation killed exactly one of the eighteen tests, and the pusher itself was driven with a real
revision that has no receipt:

```
refusing to push eb311d4: tree b7442537b carries no verify:local receipt
  (.git/rca-bench-verified/b7442537bbdc3b82f865c23475731ac77e7cf212.json).
```

### Readings

| what | this round |
| --- | --- |
| suite counts | **+1 file and +18 tests in `core`**; the absolutes are in the status table in `volume-05.md` |
| coverage | unchanged, per file, no exemption |
| the corpus | **27 of 30**, untouched -- this round bought the delivery path, not a case |
| the anchors | all three still `oracle = 1.00` on their pinned runs |
| `docs:check` | audit 1–301, **298 findings** |

### Left open

- **The receipt's consumer is outside this repository.** `verify:local` and this suite prove the file;
  the three lines that read it live in a pusher this repository does not own.
  `[open: a push path that ignores the file is indistinguishable, from inside the tree, from one that reads it]`
- **The gate inventory fingerprints a site by the line above it**, so a diagnostic inserted between a
  guard and its exit renames the site, and a braced `if` inserted there also drops the enclosing
  `condition`. Both shapes were produced here while writing this round's fix: `${failureReport(...)}`
  lost its `provedBy` once and its `!result.ok` once. `[open: the deriver would need to read brace
  depth for the condition, and nothing reads it today]`

The five items v3.15 left open are unchanged, and they are **not** re-signed here. Re-typing them
would be five placeholders wearing the same sentence, and `check-open-list` refuses exactly that --
which is the guard working: an item that did not move in a round has nothing to say in it.

### Unchanged

The corpus, the anchors, the exporters, the backends and the coverage bound. No case file was touched,
so every count in v3.15's readings table still holds; `perFile: true` still holds every file at
95/95/100/95 without an exemption.

## v3.17 — thirty of thirty, and the count that stopped being able to fail

This round finished the annotation: **30 of 30 samples carry a four-layer case**, which closes P1.
Three cases and, in the act of finishing, three defects that only the finish could expose.

| case | fault | what it is the first in this corpus to say |
| --- | --- | --- |
| `history-config-feature-flag-checkout` | `feature-flag-misconfiguration` | the deployment counter **is the evidence**: a scheduled job flipped a flag one minute before the button vanished, and the reading that rules out the obvious explanation is a counter that did not move |
| `history-dependency-version-incompatibility-shipping` | `library-version-incompatibility` | **all** rather than **some**: a start share of exactly zero over twenty-four attempts, where every earlier case is a share between one and zero |
| `history-runtime-container-start-notification-worker` | `container-start-failure` | **no probe is ever sent**, which is a different zero from the crash loop's probe that always fails -- and the reason nobody was paged |

### One: what the three cases actually cost

The graph grew to **96 entities and 78 edges** for four services it did not hold — `storefront`,
`flag-service`, `shipping-service`, `notification-worker` — and the background telemetry to **35
series**, because a service the ranking can be wrong about has to appear in the ranking.

Each case turns on a distinction the corpus could not make before:

| distinction | before | here |
| --- | --- | --- |
| a change with no deploy | every config case was a rollout | `deploys_total` flat at three, and the flat line is a checkpoint |
| failure of *all* attempts vs a bad environment | shares between 0 and 1 | `start_success_ratio == 0` over 24 attempts |
| a probe that fails vs a probe never sent | one zero, one meaning | `probe_runs_total` stops growing rather than reading zero |
| construction-time death vs running-time death | one uptime, two mechanisms | 0.4 s here, two seconds after the first job there |

The flag case declares its own limit rather than arguing it away: **the chain has one step** because
the intermediate quantity — a flag's value — is not an entity kind this graph can hold. The level is
L2 while the structure supports L1, and the reason is written in the case: a reader has to walk a
`calls` edge backwards and has to read a zero as evidence, and neither is a property of the chain's
length.

### Two: `30 of 30` is two independent totals (finding 302)

The guard's coverage sentence takes its numerator from `index.cases.length` and its denominator from
the extraction key, and nothing compared the sets those numbers count. A duplicated `sampleId`
therefore reads differently depending on how far the annotation has got:

| entries | what a duplicate does | what a reader sees |
| --- | --- | --- |
| 27 of 30 | one sample twice, one skipped | a numerator visibly short of the denominator |
| 30 of 30 | one sample twice, **one never annotated** | `30 of 30` |

**The counter lost its ability to fail at the moment it was asked whether the work was done.** The
repair is `fault/sample-coverage.ts`, which compares sets: a duplicate is always a defect, and a gap
is a defect **only once the index has caught up**, because before that a gap is the schedule.

Its first run failed three tests, and the failure was correct: `corpusOf` — the fixture that makes
ten copies of one annotation — gave all ten the same `sampleId`. The fixture now brings its own key,
beside its directory rather than inside it, because the guard rightly refuses an unindexed `.json` in
a corpus directory. Measured, with one id overwritten:

```
'...dependency-version-incompatibility-shipping' and
'...runtime-container-start-notification-worker' annotate sample
'dependency-version-incompatibility-shipping', which is one sample covered twice: ...

no case annotates sample 'runtime-container-start-notification-worker', and the index is as long as
the sample set, so the count that says every sample is covered is counting entries rather than samples
```

### Three: a 5117-millisecond failure (finding 303)

The full suite failed once, on `forwards a signal to the step`, in 5117 ms — five seconds and a
scheduling margin, which is the second wait's budget. Seventy-seven runs afterwards (five alone,
twelve under eight busy cores, sixty driven directly) did not reproduce it, so this round **records
it rather than claiming a cause**.

Two facts about that path are certain, and one was a defect:

| fact | status |
| --- | --- |
| both handlers called `signalGroup('SIGTERM')`, so a step was told TERM even when the runner received INT | **fixed**: the group gets the signal the runner got |
| `process.on('exit', sweep)` does not run when a process is killed by a signal, so the "last resort" is absent on the only path that leaves orphans | **recorded, not changed**: a sweep before the re-raise would replace the timeout path's grace period with an immediate `SIGKILL` |

The test came first and was red: the step installs traps for both signals, writes which one fired,
and exits. One line changed, and the fix is **not** an explanation of the 5117 ms — `sleep` dies of
either signal, which is why the sixty-iteration reproduction survived with the old code.

### Four: an unreachable fallback is not a missing test (finding 304)

`sample-coverage.ts` measured **81.25 % of branches** on its first full run, under the per-file floor.
Three arms were unreported:

| arm | reachable | repair |
| --- | --- | --- |
| `quoted[quoted.length - 1] ?? ''` | no — a non-empty list has a last element | spell it `quoted.slice(-1).join('')` |
| `coveredBy.get(sampleId) ?? []` | no — the key came from that map | read `entries()` once |
| `'sample' : 'samples'` | **yes**, and untested | a test with two gaps |

`noUncheckedIndexedAccess` is why the first two exist: an index is `T | undefined`, so the compiler
demands a fallback that no input can reach. **81.25 % → 92.3 %** from two spellings, then **100 %**
with the test. The metric could not tell the two kinds of gap apart, and choosing wrong is silent: a
test for the `?? ''` arm would assert a string for a line that never runs.

### Five: proving the cases can fail

Four mutations, one at a time, each restored:

| mutation | what went red |
| --- | --- |
| `deploys_total` 3 → 4 | `cp-no-deploy asserts 'deploys_total.post - deploys_total.baseline' == 0, and it computes to 1` |
| `process_uptime_seconds` 0.4 → 5 | `cp-dies-before-serving asserts process_uptime_seconds <= 1, and the series' post value is 5` |
| `probe_runs_total` 180 → 190 | `cp-probe-never-ran ... computes to 10` |
| every series filed under the pod | `names root cause component 'notification-worker', and no series carries that name` |

### Six: the count that was typed

The last gate run of the round failed at step 6 of 31, and the failure was one this round had
already written a finding about, one level up:

```
core   published 199 files / 4894 tests
       measured  198 files / 4894 tests
```

The 199 had been **typed, not measured** -- counted by hand out of `packages/core/test/**/*.test.ts`
and one file high. It survived a green `docs:check` because every rule in `check-doc-counts` holds a
*document* to the declaration; the only step that holds the declaration to a **run** needs two
vitest reports and therefore runs inside `verify:local`, which is the step a long round stops
running. So the table printed

```
core 199 files + cli 4 files = 203          repo says 202
```

**Three numbers in one table that disagree by one file, arithmetically visible to any reader who
added them, and no gate added them** (finding 305). It is finding 302's shape: two counts, each true
of its own scope, and nothing comparing them -- there between two totals over one set, here between
two parts of one total.

The repair is `scripts/doc-count-additivity.mjs`, a pure function over the measurement with
`ADDITIVE_SCOPES = { parts: ['core', 'cli'], whole: 'repo' }`, called from the guard as rule 3a.
**12 tests**: 10 on the rule, 2 on the wiring -- the second asserts that the measurement which ships
*does* add up, because a rule that fires on its own file is a rule everyone learns to exempt.

Three things about writing it are worth keeping:

| what happened | what it says |
| --- | --- |
| `problems.push(...checkCountAdditivity(measured))` was refused by the spread guard | an exemption for an array bounded at two would weaken a guard to save one line, so it is a `for` loop |
| the number could not be corrected by the tool that checks it: the measurement refuses to run while the suite is red, and the suite was red *because* a test asserts the published file count | a self-referential count has to be corrected by a run and then **confirmed** by the tool -- `--write-doc` re-measured and reported `no row needed changing` |
| the same `--write-doc` run failed a second five-second budget at **5056 ms**, green three times alone afterwards | the second sighting of a machine-sized budget this round; a pattern is not yet a cause |


### Readings

| what | this round |
| --- | --- |
| the corpus | **30 of 30** samples, the floor at 30, **P1 closed** |
| cases | 30, one per fault type; 117 checkpoints, 108 comparable, 0 false |
| levels | L1 2 / L2 10 / L3 14 / L4 4 |
| parameters | **29 of 98 (30 %)** read by a reading, 69 prose |
| graph | 96 entities, 78 edges, 35 background series |
| localisation | 60 baseline runs over 35–37 candidates, rank 1 in 50; **4 cases strictly displaced** |
| the anchors | all three still `oracle = 1.00` on their pinned runs |
| suite | **+2 files, +25 tests in `core`** (199 / 4906); the absolutes are in `volume-05.md` |
| dead branches | 2 removed, 1 tested — `sample-coverage.ts` at **100 %** |
| `docs:check` | audit 1–305, **302 findings**; the three counts add up |

### Left open

- **The 5117 ms failure is unexplained.** Seventy-seven runs, no reproduction. What is written down
  is the two facts, not a cause. `[open: an intermittent orphan is indistinguishable, from the test,
  from a scheduling delay in a five-second budget]`
- **The sweep on `exit` does not run on the signal path** (finding 303). Its comment says "last
  resort" and the signal path is the one that needs one.
  `[open: replacing it with an immediate SIGKILL trades a grace period for a case nobody has seen]`
- **Two five-second budgets have now been exceeded by the machine rather than by the code** --
  5117 ms on the signal test and 5056 ms on the event-loop hook, both under a second concurrent
  suite, both green when run alone. `[open: two sightings is a pattern, and a pattern is not a cause]`
- **Two cases declare a level above their structural floor** — `history-cart-network-delay` and this
  round's flag case, both by one step, both argued in their own reason and neither checked by
  anything. `[open: the floor is a lower bound by design, and there is no upper bound at all]`
The items v3.16 left open about the corpus -- 69 prose parameters (finding 300), `signalRef` as one
name so a partition has one viewpoint (finding 299), and P4's three items -- are unchanged and are
**not re-signed here**. Re-typing them would be four placeholders wearing the same sentence, and
`check-open-list` refuses exactly that: an item that did not move in a round has nothing to say in it.

### Unchanged

The anchors, the exporters, the backends and the coverage bound. `perFile: true` holds every file at
95/95/100/95 with no exemption, and `sample-coverage.ts` reaches 100/100/100/100.

## v3.18 — a unit that was true of one file and false of the other

**Where this started.** P4 was the last plan item with nothing in it, and its third clause —
"the aggregate tables" — had been described in `docs/targets/rcaeval.md` for four rounds by a
document nobody had ever checked against a file. So this round opened three of them, out of
`RE2-OB.zip` by range request rather than by downloading 1.19 GB again: the central directory is
139 156 bytes at offset 1 190 886 391, and the three entries inflate from 1 229, 2 844 and 525
compressed bytes.

Opening them found a bug in this repository before it found anything about the corpus.

### One: `logs.csv`'s `timestamp` was written 1000x too small

`export/rcaeval.ts` carried this:

```ts
/**
 * An instant as Unix **microseconds**, which is the unit both corpora's
 * `timestamp` and `startTime` columns use.
 */
```

One sentence, two columns, two different files. Measured:

| column | RE2-OB | RE3-OB | digits | unit |
| --- | --- | --- | --- | --- |
| `traces.startTimeMillis` | `1705353846065` | `1731910960029` | 13 | ms |
| `traces.startTime` | `1705353846065999` | `1731910960029548` | 16 | us |
| `logs.timestamp` | `1705353846067349596` | `1731910960181130857` | 19 | **ns** |

So every instant in every `logs.csv` this repository exported was three orders of magnitude early,
in both suites that ship a log file. Nothing caught it, and the reason is worth more than the fix:
the test **did** check the value, and asserted exactly what the code produced, because it was written
in the same pass from the same sentence. A test and an implementation that share a belief are one
statement. Finding 306.

### Two: three sentences about three files, and none of them checkable

| the claim | the measurement |
| --- | --- |
| "one row a minute" | **15 seconds**: 97 rows, 1705353840..1705355280, no gaps, in all three files |
| `logts.csv` is "log counts per pod" | per **cluster key** of `cluster_info.json`, `<container>_<key>`, integer order |
| `tracets_lat.csv` is "per-endpoint request counts" | per **callee**, `<class lowercased>_<method>`, in first-appearance order |

The third of those is exact and it was a guess that turned out right: the column rule reproduces all
17 names and their order. The values were not so lucky. Finding 307.

### Three: one of the three is a reduction, and the reduction is exact

`logts.csv` is a pure function of `logs.csv` and `cluster_info.json`:

```
RE2-OB/checkoutservice_cpu/1: 97 row(s) x 30 column(s) = 2910 cell(s), all equal
20 log row(s) match no cluster and appear in no column
check-aggregate-tables: OK (1 case(s), 2910 cell(s) reduced from logs.csv and equal to its logts.csv)
```

**2910 of 2910 cells**, from a 23 MB log file and a 30-entry cluster table, against the file the
corpus wrote. The twenty dropped rows are `redis` lines with an empty `log_template`, and the grid
still spans their instants.

### Four: the other two are not, and the refutation is the deliverable

Eight candidate reductions of `traces.csv` were tried against `tracets_lat.csv` — span count,
distinct trace ids, server-side span count, client-side span count, server-side distinct traces, the
p50/p90/p95/p99 of the duration, the maximum duration, and error-status counts and ratios for the
other table. **Every one matched 0 of 1649 cells**, and no single scale factor rescues them: the
ratio between the published value and the count it could plausibly be ranges over **61x within one
column**.

So they are refused rather than written. A writer whose output no corpus can be compared against
produces a plausible file, which is the failure this campaign exists to prevent. P4's third item
closes as a *measurement*: one table produced and checked, two refused with the work that refused
them.

### Five: what the guard does, and what it refuses

`scripts/check-aggregate-tables.mjs`, wired into `official-data.yml` where the corpus is:

| input | verdict |
| --- | --- |
| a case whose reduction agrees | the cell count, then `OK` |
| a case where one cell disagrees | `time=0 column='currencyservice_1' published=3 reduced=2` |
| a header in another order | names the rule: `<container>_<cluster key>` ordered by the key as an integer |
| a table shorter than the grid | names the rule: every 15 seconds, no gaps |
| `logts.csv` with no `cluster_info.json` | refuses: the column names come from nowhere else |
| an anchor directory with no `logts.csv` at all | refuses: `nothing was checked and this is not a pass` |

`golden-master/rcaeval-aggregates.json` holds the measurement, and `rcaeval-aggregates.test.ts` does
the arithmetic between its three rows — each row count from its own interval, each cell count from
its own shape, all three on one grid, and each unit held to `RCAEVAL_INSTANT_COLUMNS`. A spec that is
an independent copy of a fact in source is two facts, one of which is stale.

### Six: the proof that each piece can fail

Four mutations, one at a time, each reverted:

| mutation | what went red |
| --- | --- |
| `logs.timestamp` back to `perSecond: 1_000` | `converts the units…` and `writes the log instant at the width…` |
| `LOGTS_BUCKET_SECONDS` 15 → 60 | three tests: the dense grid, the boundary, the span over unmatched rows |
| key order `localeCompare` instead of numeric | `orders them numerically` — keys `10` and `2` swap |
| unmatched rows filed into the first column | `drops a row no cluster describes, and says how many` |

The first of those is the round: reverting the fix is exactly what the old code did, and the test
that now fails is the test that used to pass.

### Seven: the anchor moved a byte, and said so

`golden-master/expected.json` pins the committed fixture's `logs.csv` at 148 bytes and one digest.
The fix made it 151 — three digits — and the anchor failed locally naming the file, the old digest
and the new one. That is the anchor doing the job it exists for, and it is also the signature of the
defect: 148 → 151 is `0` → `000`.

### Eight: the third five-second budget, and the first with a cause

The coverage run failed one test, and not on an assertion:

```
× replaces content and removes its temporary file 12178ms
→ Test timed out in 5000ms.
```

Findings 303 and 305 recorded the same signature and were left unexplained, because no mechanism had
been shown. This one has one, in the source, and it is the mechanism finding 195 already named for a
different file: the test ran a Python helper with `spawnSync`, so **the whole test was one blocking
call** and its duration belonged to the machine rather than to the test.

The repair is both halves and neither of the two shortcuts. Retrying was refused -- it turns a budget
into a coin, and the property under test was never what failed. Raising the timeout alone was refused
too -- it hides the blocking, and the stall gauge exists because blocking is the thing this repository
measures. So the spawn is awaited, the three tests that run an interpreter carry
`SUBPROCESS_TIMEOUT_MS = 60_000` with the reason stated beside it, and **no assertion moved**.
Finding 308.

That does not close 303 or 305 on its own. What it does is move "a five-second budget was missed"
from "unexplained" to "at least one member of this family has an ordinary cause" -- and within the
hour, the same test found the second member for itself.

`stall-budget.test.ts` has two cases that verify the stall gauge by **launching a nested `vitest`**
and reading its exit code and output. Their duration belongs to that child, and vitest's five-second
default is smaller than a runner launch under load -- which is why finding 305's `5056 ms` sighting
was recorded as unexplained from the wrong end. Under `measure-doc-counts`, which runs the whole
suite from inside a suite, it came back at **5 005 ms**: the first reproduction, and the answer to
"why does this one only happen in that command". The repair is the same judgement: the two cases
carry `NESTED_RUNNER_TIMEOUT_MS = 150_000`, above the 120 000 ms bound the child already has, so the
child's timeout speaks first. Their assertions moved no more than the Python helper's did.

### Nine: this chapter ended after the chapter that followed it

The chapter above was written by inserting it at the first `### Readings` heading below `v3.17`'s
title. That heading was **v3.17's**, and inserting *at* it leaves it below the insertion: for the
length of one pass, `v3.17` had a title, five sections and no ledger, and `v3.18` had two of each
closing section. `pnpm docs:check` was green throughout -- fourteen guards, `166 round(s)`,
`check-open-list` reading both lists, because it reads every `### Left open` it finds.

What slid was not prose. It was v3.17's ledger publishing v3.18's numbers: `+5 files, +60 tests
(202 / 4941)` and `audit 1–307, 304 findings` under the title of the round that closed P1. A reader
would have taken the round's own result from a table that was written two rounds later.

`scripts/progress-volumes.mjs` now holds two rules, because the defect has two halves:

| rule | refuses | catches |
| --- | --- | --- |
| a round holds **at most one** of `### Readings`, `### Left open`, `### Unchanged` | a second ledger inside one title | v3.18 holding two |
| once a round carries `### Readings`, the round after it does too | a round with no ledger after the convention began | v3.17 holding none |

The second is a chain, not a list of versions: which round the convention began at is a fact the
volume holds, and `v3.13` in the source would be a literal that rots. Counted outside fences, so the
round that quotes the grammar is not refused for quoting it. Replayed on a copy of the live volume in
the old shape, the gate exits 1 and names this finding; on the repaired file it prints `OK`. Finding
309.

### Ten: the commit that published a mutation, and the mechanism that was missing

The five sections above were committed while `pnpm verify:local` was still running in another
process. That is the point of running it in the background, and it is also how a mutation reached a
commit: at the moment of `git add -A`, the gate-test battery held `serviceName`'s process-table
fallback in `ingest/jaeger.ts` rewritten to `return undefined;`. The commit published it; the session
put the bytes back minutes later.

| mechanism | why it did not fire |
| --- | --- |
| the battery's `finally` | it had not finished |
| `tree-repair.mjs` | it repairs at the **start** of a session; the staging happened during one |
| the gate receipt | the run was already red for an unrelated reason, so no receipt existed to bind |
| the suite | it was run against the mutated tree by the battery, never against the staged one |

`git status` was clean throughout, because the index had taken the mutation too -- it compares the
tree to the index, not the tree to what it was meant to be. Restored in the next commit, and
`examples:check` regenerated. The repair -- a pre-commit refusal while a witness journal exists -- is
**named and not built**, and it is first in `Left open`. Finding 310.

### Readings

| what | this round |
| --- | --- |
| the export | `logs.csv`'s `timestamp` is nanoseconds; the claim is a table row per column |
| the tables | `logts.csv` reproduced 2910/2910; `tracets_lat` and `tracets_err` refused, 0/1649 over eight candidates |
| the grid | 15 seconds, dense, absolute boundaries, 97 rows for the measured case |
| the corpus | unchanged at **30 of 30**; no case touched |
| the suite | **+3 files, +39 tests** in `core` (202 / 4945); the absolutes are in `volume-05.md` |
| `docs:check` | audit 1–310, **307 findings**; the three suite counts still add up |
| RE3 | ships `logs.csv` and `traces.csv` and **none** of the three aggregates |
| the five-second family | 3 sightings; **two now have the same cause** (a test whose duration belongs to a child process), the 5117 ms one still has none |
| the ledger | every round from v3.13 on holds exactly one, after a pass in which v3.17 held none |
| the split | `volume-08` begins at v3.07 and holds 12 rounds; `volume-07` closes at v3.06 |

### Left open

- **A commit can still be staged inside a session that mutates the tree** (finding 310). The journal is
  on disk and `_witnesses.py` can see it; what is missing is a reader at the commit boundary.
  `[open: a pre-commit refusal while a witness journal exists, which is the one thing this round named and did not build]`
- **The other two aggregate tables cannot be produced, and the reason is not a missing decision.**
  Their input is not in the archive: eight reductions, no match, a 61x spread that rules out a unit.
  `[open: a produced table nobody can check is worse than an absent one]`
- **P4's first two items are untouched** — the upstream SLI table and reading RE3's traces and logs.
  `[open: both need a decision about what an exporter may claim, and neither is a repair]`
- **The two ledger rules read presence, not ownership** (finding 309). Two rounds whose ledgers were
  swapped would each hold exactly one and pass; checking ownership means re-deriving each round's
  numbers from the tree as it stood then, one checkout per round.
  `[open: the numbers in a ledger are verified for the newest round only, because it is the only one whose measurement can be taken]`

The two five-second budgets (5117 ms and 5056 ms, neither reproduced alone) and the corpus-side items
v3.16 and v3.17 left open are unchanged and are **not re-signed here**: an item that did not move in
a round has nothing to say in it, and `check-open-list` refuses a list padded with restatements.

### Unchanged

The corpus, the anchors, the backends, the gates and the coverage bound. `perFile: true` holds every
file at 95/95/100/95 with no exemption, and `fault/sample-coverage.ts` is still 100/100/100/100.
