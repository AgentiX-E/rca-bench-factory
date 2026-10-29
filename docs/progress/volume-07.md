## v2.86 — a fault whose scope is a size

**What this round is.** The thirteenth case, `network-mtu-catalog-service`: after the overlay was
rebuilt onto a path whose MTU is 1,400 bytes, catalog responses larger than one segment hang; the
interface still advertises 1,500 and the health checks stay green.

**Two of its four checkpoints assert that nothing happened**, which is what makes it the corpus's first
case of its kind:

| checkpoint | reading | role |
| --- | --- | --- |
| large requests hang `== 1` | a share of one | the symptom |
| small payloads unaffected `== 0` | a counted zero | the control that makes this a size threshold |
| health check green `== 1` | never moved | the control that explains the alerting gap |
| path MTU `== 1400 By` | from the parameters | the fact the interface has to fit inside |

Without the zero the case reads as "the network broke"; with it, the case is a threshold a solver has
to reason about.

**A device the graph has no word for.** The text's router reports dropping fragments, and the graph has
no kind-plus-relation for a device on the path — `node` exists, but an edge from a service to a router
would have to be `calls`, which is a lie about the direction. The router stays in
`rootCauseReason` and out of the graph, the chain is `pod -> service`, and the annotation says so.

**The first readings in bytes.** `By` has been in the conversion table since it was written and no case
had used it; this one has two, both exact.

**Acceptance.** `check-fault-cases` prints **13 of 30**, `41 of 41` references resolved by kind (31
series, 2 computed from 4 readings, 6 configuration), `0 of 37` comparable assertions failing; RE1 13 /
0 empty, RE2 13 / 19, RE3 2 / 3 empty / 11 skipped; 30 entities / 18 edges; both baselines place
`catalog-service` in top-K. Pinned counts moved by hand (`13 of 30`, `filled 30`, `RE2 … 19`,
`RE3 … 11 skipped`, `41 of 41`, `0 of 37`, `6 citing a declared configuration fact`); typecheck, lint,
`docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46
gates, 46 caught, 0 survived**; core **186 / 4613**, cli 4 / 187, repo **190 / 4800**; coverage
99.97 / 99.76 / 100 / 99.97; audit 6 volumes, findings 1–259.

### Left open

- **17 samples still carry no case.** `[open: 13 of 30 carry one, and this round spent itself on the
  graph's vocabulary rather than on an annotation -- the corpus is still the long pole]`
- **A device on the network path has no entity.** `[open: the graph's relations are `contains`, `hosts`,
  `calls` and `same_as`, and none of them describes "traffic passes through"; a router, a switch or a
  load balancer therefore cannot be an entity without an edge that lies]`
- **An absence of logs cannot be a checkpoint.** `[open: unchanged; every log checkpoint asserts that a
  line exists, and this case declares none]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause.

## v2.87 — a vocabulary in four places, and the member that found them

**What was open.** v2.86's second item: "a device on the network path has no entity — the graph's
relations are `contains`, `hosts`, `calls` and `same_as`, and none of them describes 'traffic passes
through'".

**What changed.** One member, `routes`, and the admission that adding it was an experiment in how many
places a vocabulary can live. It found four: the schema's inline `z.enum`, the `EntityRelation` union,
`VALID_RELATIONS` in `entity/graph.ts`, and the union inside the document's `EntityEdge` snippet. Adding
the member to two of them produced a graph the schema admitted and the validity guard refused —
`unknown relation 'routes'` — which is exactly the split the published-vocabulary gate exists to
prevent, for the six vocabularies that *had* a table. The relation set had none, so nothing read it.

Now `EDGE_RELATIONS` is a tuple, `EntityRelation` derives from it, the schema is
`z.enum(EDGE_RELATIONS)`, `VALID_RELATIONS` *is* the tuple, and the document has a row. The gate reports
**seven** published vocabularies and **eight** inline enums, down from six and nine.

`EdgeRelation` — a second type name I introduced beside `EntityRelation` in the same edit — is deleted.
Two names for one type is the same defect as two lists for one vocabulary, one level up.

**What the member buys.** `node:edge-router-2 --routes--> pod:catalog-service-0`: the MTU case's
path-MTU checkpoint now has an owner, the device that reports dropping fragments, and the graph says
why. The case's `why` no longer explains what the graph cannot say.

**Acceptance.** Typecheck, lint, `docs:check` green; `check-data-model-vocabularies` at 7 vocabularies;
`derive-gate-sites --check` green (86 sites, 46 scripts, four line numbers moved); the meta-gate at
**46 gates, 46 caught, 0 survived**; core **186 / 4613**, cli 4 / 187, repo **190 / 4800**; coverage
99.97 / 99.76 / 100 / 99.97; audit 6 volumes, findings 1–260; the corpus is unchanged at **13 of 30**
with 31 entities / 19 edges.

### Left open

- **17 samples still carry no case.** `[open: 13 of 30 carry one; the corpus is the long pole]`
- **An absence of logs cannot be a checkpoint.** `[open: every log checkpoint asserts that a line
  exists, and the pod-kill case's "nothing was logged" still cannot be said]`
- **No relation is checked for direction.** `[open: `routes` says traffic for the target passes through
  the source, and nothing refuses an edge written the other way round -- the graph has no notion of
  which end is upstream]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause.

## v2.88 — the anchor that died of a filesystem nobody measured

**What was open.** Nothing on the list said "the fourth anchor is broken". The trigger was a CI
reading: `gh run list` showed the 2026-10-26 scheduled `official-data` run as `failure`, and the two
before it too, except one dispatch on 2026-10-12. Twelve failures had been recorded as "the upstream
is flaky" because the run's own summary said so.

**What changed.** The summary was wrong. The fetch had downloaded and verified `RE2-OB`
(1 191 025 569 bytes, digest matching the registry) and then `unzip` wrote 6.3 GB into `/tmp` and hit
`write error (disk full?)`. `/tmp` is a 7.9 GiB tmpfs on the ubuntu-26.04 runner image; it was part of
the ~74 GiB root disk on 24.04, and `ubuntu-latest` moved on 2026-10-19. The corpus never changed.

Three layers, three fixes:

- **destination** — `OFFICIAL_DIR=$RUNNER_TEMP/official`, assigned in the first step and exported
  through `$GITHUB_ENV`, read by every later step. The workflow no longer contains `/tmp` in
  executable text, and a test says so. The first version named it in `jobs.<id>.env` and GitHub
  refused the file (`Unrecognized named-value: 'runner'` — the context does not exist there); no test
  could see that, so the rule set gained one that refuses a `runner` expression above `steps:`. The
  second dispatch then ran and failed nine seconds in, at the same step, because it used
  `$OFFICIAL_DIR` two lines after exporting it — a name exported for later steps does not exist in
  the exporting one, and `set -u` makes that fatal. That one cannot be read out of the document at
  all, so the naming step's `run:` block is now **executed** by the suite under `bash` with a
  temporary `RUNNER_TEMP`/`GITHUB_ENV`, with the shipped defect as its negative control.
- **check** — two exact preflights in `fetch-official.mjs`: the registry's pinned byte count before the
  transfer, and the archive's own central-directory total before extraction (zip64 included, four
  syscalls, no `unzip -l`). A shortfall prints both numbers and exits **3**.
- **vocabulary** — five exit codes (0 fetched, 1 unreachable, 2 pin mismatch, 3 does not fit, 4 could
  not unpack), five branches in the workflow's `case`, and a `*` fallback that names no cause. The old
  `*` called every unrecognised status "an asset could not be downloaded", which is how a full disk
  came to be described as unreachable.

`extract()` no longer calls `fail()` mid-loop, so a failed unpack leaves the pin report intact — the
report's own comment promised that and an `unzip` failure broke it.

**The measurement that had no reader.** The workflow had run `df -h /tmp` before and after the fetch
since it was written. It printed `7.8G` available and nothing compared it to anything. The check now
lives where the requirement is known, and the `df` steps name the same variable the fetch writes to.

**Acceptance.** 4 new tests in the fetch suite (all four red against the pre-fix script, measured by
stashing it), 18 in the new `official-data-destination.test.ts` (7 rules over the text, each re-run
against a mutation that must trip it, plus 2 that execute the naming step); typecheck, lint,
`docs:check` green; `derive-gate-sites --check` green (**88 sites, 46 scripts**, both new sites
annotated `proved`); core **187 / 4635**, cli 4 / 187, repo **191 / 4822**; coverage 99.97 / 99.76 / 100 / 99.97; audit 6 volumes, findings 1–261; the corpus is
unchanged at **13 of 30** with 31 entities / 19 edges.

### Left open

- **The anchor is not yet green.** `[open: the next scheduled run is the proof, and nothing in this
  tree can stand in for it -- the fix makes the run able to pass and makes a failure legible if it
  does not]`
- **17 samples still carry no case.** `[open: 13 of 30 carry one, unchanged for two rounds -- this
  round's gap was below the corpus, in the workflow that would prove the corpus scores]`
- **No relation is checked for direction.** `[open: nothing refuses a `routes` edge written backwards,
  so the graph can state the opposite of the truth and every guard still passes]`
- **An absence of logs cannot be a checkpoint.** `[open: a log checkpoint can only assert that a line
  exists; the pod-kill case still cannot say "nothing was logged"]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause.

## v2.89 — a retry that starts from zero is not a retry

**What was open.** v2.88's first item: "the anchor is not yet green — the next scheduled run is the
proof". The dispatch answered it in two halves. The space check works: `RE2-OB` (1 191 025 569 bytes)
and `RE2-SS` (245 629 018) both verified **and unpacked**, which no run had ever done. The third
asset then failed differently.

**What changed.** `RE2-TT` is 2 801 345 134 bytes. Attempt one moved 2 733 226 372 of them (97.56%) in
its 900-second bound; attempt two moved 2 605 066 672; the workflow's 50-minute wrapper killed attempt
three at two minutes. At the 3.04 MB/s Zenodo delivered, the whole file needs 15.4 minutes and one
attempt allows 15 — **the bound is below the work**, and a restart from zero can never close a gap
that size. Attempt two proved it by moving less than attempt one.

The retry now resumes: `--continue-at -`, so an attempt starts at whatever is on disk. Three
consequences, each with a test: a partial longer than the pin is discarded before the first attempt
(it cannot be a prefix); a server that answers a ranged request with the whole body makes curl exit
33, and the partial is discarded so the next attempt starts clean; and the `RETRYING` line now names
the bytes the next attempt will resume from, measured *after* the attempt rather than at its start.

The wrapper became `timeout 4200`, with the arithmetic in the comment: 15.6 minutes per transfer at
the measured rate, a second attempt is therefore normal, and 70 minutes leaves the build and the
round trip inside the job's 90.

**Acceptance.** 3 new tests in the fetch suite, **all three red against the pre-fix script**; the
existing short-transfer test gained a `Range` response (a fixture that ignored it would have reported
the fix as a failure); typecheck, lint, `docs:check` green; `derive-gate-sites --check` green
(88 sites, 46 scripts, annotations carried); core **187 / 4638**, cli 4 / 187, repo **191 / 4825**;
coverage 99.97 / 99.76 / 100 / 99.97; the fetch battery at **6 injections, 6 caught, 0 survived**
(the new row removes `--continue-at` and takes 26 tests red with it); audit 6 volumes, findings 1–262;
the corpus is unchanged at **13 of 30** with 31 entities / 19 edges.

### Left open

- **The anchor is still not green.** `[open: two of three assets now reach the disk; the third needs
  a resumed attempt, and whether it gets one is the next dispatch's answer]`
- **Nothing bounds the total transfer per asset.** `[open: three attempts of 900s is 45 minutes each,
  which for three assets exceeds the wrapper -- the wrapper is the global bound and reports only that
  it fired]`
- **17 samples still carry no case.** `[open: 13 of 30 carry one, and two rounds have now gone to the
  anchor rather than to the corpus]`
- **No relation is checked for direction.** `[open: nothing refuses a `routes` edge written backwards]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause; an absence of logs
cannot be a checkpoint.

## v2.90 — 270 cases, one reason

**What was open.** v2.89's first item: whether `RE2-TT` gets a resumed attempt. It did. The dispatch
after that change is the first run in this repository's history to fetch a whole anchor — three
assets, 4.2 GB, both large ones resumed, three pins measured, and `registry pins agree with this
download`. Then the corpus reached the round trip and failed all 270 cases for **one** reason.

**What changed.** Nothing in the tree; this round is a measurement, and it is the kind the anchor
exists for. `ROUNDTRIP declared 270 case(s), found 2978 file(s), 364 directory(ies)`, then
`270/270` failures with `no metric payload under any known name (metrics.json, data.csv); the case
directory holds cluster_info.json, …`.

The reason is a second corpus shape. Measured from the archive's own central directory — range reads
against Zenodo, EOCD → directory → local slice → inflate, so 740 KB rather than 4.2 GB —
`RE2-OB/checkoutservice_cpu/1/` holds `metrics.csv` (per-pod, wide), `simple_metrics.csv`
(per-service, wide), `tracets_lat.csv` (per-endpoint counts, one row a minute), `logts.csv`,
`cluster_info.json`, `inject_time.txt` (a unix timestamp), `pod-node-{1,2}.csv` and a
`metrics_postprocess.log`. RE1, the only corpus that has ever round-tripped here, holds
`metrics.json` and `data.csv`. Same authors, different encoding, and the reader knows one of them.

**The sample.** 1 443 rows at one row a second; series start 1 705 353 846, injection 1 705 354 566 —
720 seconds of baseline and 722 after. And a naming trap recorded before the reader is written:
`checkoutservice_container-cpu-system-seconds-total` is a **counter**, not a gauge.

**Acceptance.** No code change: `pnpm test` green at core **187 / 4638**, cli 4 / 187, repo
**191 / 4825**; `docs:check` green; audit 6 volumes, findings 1–263. The round's product is the
measurement and the specification the next round implements.

**One more red, and where it came from.** The commit that carried the resume fix took CI red on
master: `battery-witnesses.test.ts` asserts `OK (5 witness(es) across 5 injection(s))`, and the sixth
injection made it six. Locally I had run the battery itself (6 of 6 caught, pristine green) and the
document gates, but not the test that reads the battery's row count — adding a row felt like a change
to the battery rather than to the suite. **The reader was one file away.** Fixed in `d582bef5b`; the
count is part of the battery's published shape, which is exactly why the suite holds it.

### Left open

- **The reader knows one corpus shape.** `[open: RE2's per-case layout is measured and quoted in
  finding 263; nothing reads it yet, so 270 cases fail to load before they can be scored]`
- **A real counter has no reader.** `[open: `SERIES_DERIVATIONS` has a `counter` derivation for
  series the corpus generates; reading `…-system-seconds-total` out of a real corpus is the mirror
  case and is unimplemented]`
- **The anchor is fetched but not scored.** `[open: every stage before the round trip now works end
  to end; the round trip is the last one, and it is blocked on the two items above]`
- **17 samples still carry no case.** `[open: 13 of 30 carry one, and three rounds have now gone to
  the anchor]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause; an absence of logs
cannot be a checkpoint; no relation is checked for direction.

## v2.91 — the corpus that names its entities in the columns

**What was open.** v2.90's first item: "the reader knows one corpus shape; RE2's layout is measured
and quoted, nothing reads it yet". This round reads it.

**What changed.** `check-official.mjs` learns the second shape, in three parts.

*The names.* `CASE_PAYLOAD_NAMES` goes from two to four — `metrics.json`, `data.csv`,
`simple_metrics.csv`, `metrics.csv` — ordered by how much each says about its own schema, and the two
RE2 names after the two older ones so no existing corpus or fixture changes path. `simple_metrics.csv`
comes before `metrics.csv` because the two describe the same instants over 72 and 417 columns, per
service and per pod, and the official rule is defined on the reduction.

*The attribution.* A table is entity-prefixed when **every** non-time column carries a prefix and there
is more than one distinct one. The component's columns are read (prefix stripped, because it is the
entity, not part of the metric's name); the other entities' columns are not attributed to it and are
counted once for the run — `ROUNDTRIP context … 210 column(s) across 30 entity reference(s)`.

*The refusal.* A snapshot that names entities but not the component fails by name and lists the
entities it found. **The first version of the rule made this branch unreachable**, because it also
required the component to be among the prefixes: a table naming `adservice, frontend` for a cart case
then took the old path and filed both under cartservice. A probe caught it — `signals=20` on a table
that did not contain the case's component — before any test was written.

**Cost, measured before the dispatch.** A synthetic case at the real shape (1 443 rows, 77 columns, 7
the component's) costs 0.19 s; three cases in 0.56 s wall. 270 cases ≈ 50 s. The one-second cadence is
not a throughput problem.

**Acceptance.** 5 new tests, **4 red against the pre-fix reader**; the fifth is the RE1 regression
guard and passes both before and after by design. `pnpm test` green at core **187 / 4643**, cli 4 / 187,
repo **191 / 4830**; `docs:check` green; `derive-gate-sites --check` green (88 sites, 46 scripts);
audit 6 volumes, findings 1–264; the corpus is unchanged at **13 of 30**.

### Left open

- **The anchor is readable but unscored.** `[open: 270 cases can now be loaded; the dispatch is what
  says whether they score 1.0, and the round only made them readable]`
- **RE2's traces and logs are not read.** `[open: `tracets_lat.csv` and `logts.csv` are in every case
  directory and nothing opens them, so those cases carry one of the IR's four layers]`
- **A counter is read as a value.** `[open: `…-system-seconds-total` is cumulative; nothing in the
  round trip would notice]`
- **17 samples still carry no case.** `[open: 13 of 30 carry one, and four rounds have gone to the
  anchor]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause; an absence of logs
cannot be a checkpoint; no relation is checked for direction.

## v2.92 — 270 of 270

**What was open.** v2.91's first item: "the anchor is readable but unscored". The dispatch answered it:
run `40400190945` at `fe871088b` fetched all three RE2 assets, agreed with the registry on all three
pins, declared 270 cases, and **round-tripped 270 of 270 at `oracle=1.00`** — 0 skipped, 0 failed.

31 minutes: 26 to transfer 4.2 GB (two cut transfers resumed), 1 to round-trip 270 cases. The
0.19 s-per-case estimate held, and the context line reported 44 154 columns across 8 289 entity
references that were not the case's component and were not attributed to it.

**What changed after it.** The number needed a reader, not a log line, so
`golden-master/roundtrip.json` became `{ records: [...] }` — one entry per measured anchor — and
`check-roundtrip-record.mjs` checks each entry against the registry and against the block
`docs/progress.md` publishes. The document's section became one `### <anchor>` block per record,
because one table cannot hold two numbers for "cases round-tripped" without summing things that are
not the same thing.

**Two things went wrong inside this round, and both were caught.**

The section rewrite used `indexOf('## The last measured round trip')`, which matched a
*cross-reference* to the section in the L4 table at line 16 and replaced 170 lines of history.
`git checkout` restored it; the second attempt anchored on the heading with its newline. The guard's
own header warns about exactly this — "a pointer to a section is not the section".

The injection battery then found three defects in the rewrite: two injections whose anchors the
rewrite moved (`ANCHOR MISSING`, which the battery refuses to run rather than skipping), and one
`SURVIVED` — a test that had gone green for the **wrong reason**, because it still called `doc()` with
the old flat signature and the run failed on the anonymous block instead of on the mean. That test now
asserts the reason and that it is not the other one. 25 of 25 caught, 0 survived, 0 inert.

**Acceptance.** 5 new tests (34 in `check-roundtrip-record.test.ts`); `pnpm test` green at core
**187 / 4648**, cli 4 / 187, repo **191 / 4835**; `docs:check` green; audit 6 volumes, findings 1–265;
the corpus is unchanged at **13 of 30**.

### Left open

- **`oracle` is a ceiling, not an accuracy.** `[open: the official rule applied to the ground-truth
  root cause; upstream publishes solver accuracies, and comparing the two is P0-2]`
- **RE2's traces and logs are not read.** `[open: `tracets_lat.csv` and `logts.csv` sit in every case
  directory unopened, so those cases carry one of the IR's four layers]`
- **`rcaeval-re3` is still pending.** `[open: five fetchable assets, none pinned, no round trip]`
- **17 samples still carry no case.** `[open: 13 of 30 carry one, and five rounds have gone to the
  anchor]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause; an absence of logs
cannot be a checkpoint; no relation is checked for direction.

## v2.93 — the two files whose names the corpus shares

**What was open.** Nothing on the list said "the export's log and trace files are not the corpus's".
The trigger was the RE3 download: `RE3-OB/emailservice_f1/1/` holds `logs.csv` and `traces.csv`, the same
two names this project writes, so the two headers were finally compared — and they share nothing but
their names.

**What changed.** Three things, one subject.

*The measurement.* `traces.csv` is eleven columns and identical in RE2-OB and RE3-OB:
`time,traceID,spanID,serviceName,methodName,operationName,startTimeMillis,startTime,duration,statusCode,parentSpanID`.
`logs.csv` is nine in RE2-OB and six in RE3-OB, sharing four. We wrote eight and four, with different
spellings, in the corpus's units' opposites — ISO instants where the corpus has microseconds, and
`duration_ms` where the corpus has `duration` in µs.

*The single-sourcing.* The exporter now declares `RCAEVAL_TRACES_COLUMNS` (one list) and
`RCAEVAL_LOGS_COLUMNS` (a map, because the corpora disagree), and `checkRcaEvalStructure` imports them
instead of restating two literals. Four literals for two facts became one source per fact — which is
what makes `checkRcaEvalStructure` stop certifying the export against a copy of itself.

*The missing reader on real data.* `check-official.mjs` ran `runAllOfficialRegressions`, which applies
the published *metric*; the metric reads the case directory name, not the files. So the shape contract
had never been applied to a corpus, and 270 of 270 at `oracle=1.00` is exactly what a wrong
`traces.csv` looks like from in front of that metric. The round trip now calls `scoreExport` per case
and fails the case on a contract mismatch, naming each failing check; skips are exempt.

Columns the IR does not carry are emitted empty and **named** in `RCAEVAL_UNFILLED_COLUMNS`, with the
reason per column: `methodName` (the two corpora disagree about what it means), RE2's `req_path` and
`error` (HTTP fields a gRPC stack does not fill), `cluster_id` (a corpus-side handle) and
`log_template` (a rendered template where the IR carries an id).

**One test had to be rewritten because the corpora deny it.** `structure-dispatch.test.ts` asserted
"RE2 and RE3 accept the same shaped files, because the shapes are identical". The shapes are not; the
*file sets* are. It now asserts both halves separately, with the trace header as the control.

**Acceptance.** 8 new tests, **4 of them red against a one-character-per-table column mutation**
(measured by mutating `traceID`→`trace_id`, `log_template`→`logtemplate`, and dropping one entry from
`RCAEVAL_UNFILLED_COLUMNS`); the golden anchor's `rcaevalRe2Files` re-anchored (4 files, and the diff
is exactly `logs.csv` and `traces.csv`); `pnpm test` green at core **187 / 4656**, cli 4 / 187, repo
**191 / 4843**; coverage 99.97 / 99.76 / 100 / 99.97 with `rcaeval.ts` at 100 across all four;
`docs:check` green; `derive-gate-sites --check` green (88 sites, 46 scripts, six line numbers moved);
audit 6 volumes, findings 1–266; the corpus is unchanged at **13 of 30**.

Two unreachable branches went with it: the `?? ''` fallbacks in both builders are gone, replaced by
cell maps keyed on the column union, so a missing column is a compile error rather than an empty cell.
The round's first coverage run showed branch 99.74 and named the file; that is what caught them.

### Left open

- **Our export is not loadable by upstream's harness.** `[open: `main.py` globs `**/data.csv` then
  `**/simple_metrics.csv` and takes the answer key from the *path* -- `service, metric =
  basename(dirname(dirname(data_path))).split("_")` -- so it needs `{system}/{service}_{fault}/{run}/`
  and a `time` column it can compare against `inject_time`. We emit `metrics.json` in a flat
  `RE2-{service}-{fault}_{n}/` directory, which that glob never matches and that unpack would crash on.
  Both halves are measurable and neither is done]`
- **RE1's archive is unmeasured.** `[open: RE2-OB and RE3-OB were measured this round; whether
  RE1-{OB,SS,TT} ship log and trace tables at all is not known, and "RE1 is metrics-only" is a
  statement about our export contract]`
- **The corpora's log and trace tables are not read.** `[open: the exporter now writes the right
  columns; nothing reads `logs.csv`/`traces.csv` out of a corpus, so a round-tripped case still carries
  metric signals only]`
- **`rcaeval-re3` is still pending.** `[open: five fetchable assets, none pinned; the three archives are
  533 MB, so a dispatch is cheap and is the next measurement]`
- **17 samples still carry no case.** `[open: 13 of 30 carry one, and six rounds have gone to the
  anchor]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause; an absence of logs
cannot be a checkpoint; no relation is checked for direction.

## v2.94 — the layout we wrote is not the layout the loader reads

**What was open.** v2.93's first item, recorded with the code that says it: `main.py` globs for
`data.csv` and takes the answer key from the path. This round reads the rest of that file, and the
glob was the smaller half.

**What the loader requires**, measured: a recursive glob for `data.csv` (fallback
`simple_metrics.csv`); `service, metric = basename(dirname(dirname(data_path))).split("_")`, which
needs three levels with `{service}_{fault}` in the middle; a `data["time"]` column compared against
`inject_time.txt`; and candidate services from the column names (`c.split("_")[0]`). We wrote
`metrics.json` in one flat `RE2-order-cpu_1/` — the glob never matched it, and for a flat directory
`dirname(dirname(...))` is the dataset root, whose `split("_")` has one element and cannot unpack.

**What changed.** `casePath` produces `{suite}-{system}/{service}_{fault}/{instance}`;
`buildDataCsv` produces the wide table (`time` in Unix seconds, then `<service>_<metric>` per series,
empty where a series has no sample); `metrics.json` and `buildMetricsJson` are gone, because they
carried the same numbers in a shape nothing reads. `parseRcaEvalPath`'s head pattern widened from
`[A-Za-z0-9]+` to `[A-Za-z0-9-]+`: "free-form system token" and "no hyphens" cannot both be true.

The structure check's `metrics-json` became three rules — `data-csv`, `data-csv-header`,
`data-csv-time` — and the third asserts that the table's first instant is on the **injection time's
clock** (within a year) rather than that it has ten digits. `main.py` compares the two numbers; a table
counting from zero puts every sample on one side of the boundary and the window comes out empty rather
than wrong.

**Why nothing caught it.** The metric never opens the metric file — it reads the case's directory name
and scores the submission — so an export shaped unlike the loader's can score 1.00, and did for four
rounds. And our own scorer had a second parser for our own shape, so both halves of *our* loop agreed.
Two parsers, one author.

**What the change broke, and what that says.** Twenty-four tests: three mechanical (a path gained a
segment), one a fixture whose `data.csv` counted from zero beside a 2023 injection time (refused
correctly, and it had been fine only because nothing compared the two), one a counter
(`check-fault-cases.mjs` reported 13 cases as 1 because it counted the export root's directories, which
they now share), and one a claim the score was modality-blind — true while the metric file was `{}`,
false now that it must have a `time` column and a row. The last kept its point and lost its overreach.

**Acceptance.** 5 new refusal tests, **all 5 red against a mutation that disables the three rules**
(measured, then reverted); 24 updated; the golden anchor re-anchored to four files under
`RE2-order-prod/order_cpu/1/`; `pnpm test` green at core **187 / 4664**, cli 4 / 187, repo
**191 / 4851**; coverage 99.97 / 99.76 / 100 / 99.97; `docs:check` green with `docs/targets/rcaeval.md`
regenerated from the spec; audit **7 volumes**, findings 1–267 (volume-06 is at 279,893 of 280,000
bytes, so this finding opens volume-07).

### Left open

- **Upstream's baselines still refuse our data, and the blocker is an SLI lookup.** `[open:
  `process()` picks the SLI by matching the path against `"RE2-OB"`, `"RE3-TT"`, `"online-boutique"`
  and six other names, and raises `ValueError: SLI not implemented` for anything else -- so a case
  exported as `RE2-order-prod/...` is loadable but not rankable without either the corpus's own system
  tokens or a mapping plus a `_latency` series]`
- **RE1's `data.csv` is unmeasured here.** `[open: the shape emitted is the one finding 120 measured
  out of RE1-TT; this round compared column conventions, not a file]`
- **No aggregate tables.** `[open: `logts.csv`, `tracets_err.csv` and `tracets_lat.csv` are read by the
  multi-source methods and by `torai`; nothing here produces them]`
- **The corpora's log and trace tables are still not read.** `[open: the exporter writes the corpus's
  columns; nothing reads `logs.csv`/`traces.csv` out of a corpus into the IR]`
- **`rcaeval-re3` is still pending.** `[open: five fetchable assets, none pinned; the three archives
  are 533 MB, so a dispatch is cheap]`
- **17 samples still carry no case.** `[open: 13 of 30 carry one, and seven rounds have gone to the
  anchor]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause; an absence of logs
cannot be a checkpoint; no relation is checked for direction.

## v2.95 — the code-level slice, and the label that carries the separator

**What was open.** v2.94's fourth item: `rcaeval-re3` had five fetchable assets and none pinned. It
took two dispatches to get a score out of them, and the first failure was the interesting one.

**The gate that could not be satisfied.** `exportRcaEval` admits an RE3 case only when
`fault.category === 'code'` — the target's own rule, and correct. The corpus labels its faults `f1` …
`f5`, which are **indices**, so `inferFaultCategory('f1')` is `unknown`, correctly; nothing supplied
the category. Had the parse been right, the run would have printed `90 skipped` and `ROUNDTRIP PASSED`
over a slice in which no case was examined. **A target declining a fault class and a reader that never
told it the class look identical from outside.** The fix is one field — `PrimeCaseSource.faultCategory`
— and the runner states it, because an `RE3-*` directory *is* the code-level slice.

**The split, on the wrong side.** The first run scored 87 of 90 and failed three times on
`RE3-TT/ts-route-service_f3_1/{1,2,3}`, with the adapter's "the table does not name the component"
message. The table was right: `parseRcaEvalPath` split at the **last** underscore, reading the service
as `ts-route-service_f3`, which exists nowhere. Measured before choosing the other side: of 90 case
directories every service token is hyphenated and **none has an underscore**, while exactly one fault
label does. The test that pinned the old rule argued from an assumption — "service names routinely
contain underscores of their own" — and from RE2's six single-token faults, neither of which holds for
RE3. **A rule derived from one corpus, asserted about the format.**

On the write side the same fact had two consequences: `casePath` now keeps `_` in the **fault** token
(the sanitiser wrote `f31` for `f3_1`, a third label, silently, and the label is the answer key), and
`parseRcaEvalDirectory`'s docstring stopped claiming to be "the one our exporter writes" — false since
v2.94.

One case upstream cannot read at all: `split("_")` into two names raises on three, so
`ts-route-service_f3_1` is unreadable to the published loader. This parser is now deliberately one case
more capable than the loader it reproduces, and says so at the parser.

**The readout.** Run `40430588523` at `ecec7f581`: `declared 90`, `90 scored, 0 skipped, 0 failed`,
`ROUNDTRIP PASSED`, five pins measured. With RE1's 375 and RE2's 270 that is **735 cases across three
corpora, every one at `oracle=1.00`**, and every asset in the registry pinned by a measurement the
workflow took itself.

**Acceptance.** 8 new tests (3 in `prime.test.ts`, 2 in `official.test.ts`, 2 in `export.test.ts`, 1
that drives `check-official.mjs` over a synthetic `RE3-OB/emailservice_f1/1` corpus and asserts PASS
rather than SKIP — removing the one line from the runner turns it red); `pnpm test` green at core
**187 / 4671**, cli 4 / 187, repo **191 / 4858**; `docs:check` green with
`check-roundtrip-record` publishing all three anchors and `check-l4-status` reading 3 pinned;
`derive-gate-sites --check` green; meta-gate 46 of 46 caught; audit 7 volumes, findings 1–268.

### Left open

- **Upstream's baselines still refuse our data, and the blocker is an SLI lookup.** `[open: `process()`
  matches the path against `RE2-OB` / `RE3-TT` / `online-boutique` and raises `SLI not implemented`
  otherwise, so our export is loadable and scorable by this repository's reproduction of the metric and
  not rankable by the published baselines]`
- **RE3's traces and logs are not read.** `[open: 29 MB and 11 MB per case, unopened; the export writes
  the corpus's columns and nothing fills them from a corpus]`
- **No aggregate tables.** `[open: `logts.csv`, `tracets_err.csv`, `tracets_lat.csv` are read by the
  multi-source methods and by `torai`; nothing here produces them]`
- **RE1's `data.csv` is unmeasured here.** `[open: the shape emitted is the one finding 120 measured out
  of RE1-TT; no file was compared this round or the last]`
- **17 samples still carry no case.** `[open: 13 of 30 carry one, and eight rounds have gone to the
  anchor]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause; an absence of logs
cannot be a checkpoint; no relation is checked for direction.

## v2.96 — the suite that could not start once the last asset was pinned

**What was open.** Nothing on the list. This round was a CI failure on the commit that recorded RE3's
five pins, and the failure is the finding.

**What it said.** `test/check-l4-status.test.ts` did not load — `this file needs at least one pending
target to test the guard's rules, and the registry currently has none` — and
`test/official-assets.test.ts` failed one assertion, `expected 0 to be greater than 0`. Both are the
same fact: **every fetchable asset in the registry now has a measured digest**, and two pieces of the
suite had been written to need one that does not.

**Why it happened, in one sentence each.** The L4 test derived its fixtures from the live registry and
threw at module load when any of the three states was empty — sound anti-vacuity reasoning, bound to
the data, and four rounds of pinning ran it to zero. The assets test asserted `pending.length > 0` for
the same reason, which turned "a pending asset is named" into a claim about which assets exist. **A
guard whose fixture is the production data expires when the production data succeeds.**

**What changed.** `check-l4-status.mjs` takes `--registry`, mirroring `--table`, and the suite builds
the state it needs: a copy of the registry with one anchor's digests nulled, which is the registry's own
definition of `pending`. `official-assets.test.ts` states the emptiness (`toEqual([])`) and keeps the
naming loop, so a future unpinned asset fails on the round that adds it.

**How it was found matters more than what it cost.** CI found it because the last local run of the whole
suite happened *before* the registry was pinned, and only `docs:check` was re-run afterwards. Third time
in this volume that a check existed and was not run against the thing it governs (265's battery row,
266's structure check on real data, this). The habit it argues for: **a change to a data file the suite
reads is a change to the suite's inputs, and the suite is what has to be re-run.**

**Acceptance.** `pnpm test` green at core **187 / 4671**, cli 4 / 187, repo **191 / 4858** — run with
the registry pinned this time; `docs:check` green (`check-l4-status` 3 pinned / 0 pending,
`check-roundtrip-record` publishing all three anchors); `derive-gate-sites --check` green; audit 7
volumes, findings 1–269.

### Left open

- **Upstream's baselines still refuse our data.** `[open: `process()` matches the path against
  `RE2-OB` / `RE3-TT` / `online-boutique` and raises `SLI not implemented` otherwise]`
- **Other test files may read live data the same way.** `[open: this round fixed the one file that
  could not load and the one assertion that required fullness; a sweep for the shape is not done]`
- **RE3's traces and logs are not read.** `[open: every RE3 case ships a 29 MB `traces.csv` and an
  11 MB `logs.csv`, and the corpus adapter never opens either, so a round-tripped RE3 case reaches the
  export with metric signals only -- one of the IR's four layers]`
- **No aggregate tables.** `[open: `logts.csv`, `tracets_err.csv`, `tracets_lat.csv` are read by the
  multi-source methods and by `torai`]`
- **17 samples still carry no case.** `[open: 13 of 30 carry one, and nine rounds have gone to the
  anchor]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause; an absence of logs
cannot be a checkpoint; no relation is checked for direction.

## v2.97 — the relation that names a direction, and the graph that took either

**What was open.** The last line of v2.96's open list: *no relation is checked for direction*. This
round is that line, and it is the one item on that list that is a code defect rather than a corpus
gap.

**What it said.** `ir/types.ts` describes four of the five relations as a movement — a service has a
pod, a node runs a pod, one service invokes another, traffic for a target passes through a router —
and three checks looked at every edge without ever reading `from` and `to` as an order.
`findDanglingEdgeRefs` asks whether the ends exist, `findInvalidRelations` asks whether the word is
published, `assessFourLayer` asks whether the ground truth's references resolve. A `calls` edge
written backwards passed all three, and it moves the root cause from the caller to the callee, which
is the answer an evaluator compares against.

**Measured first.** A copy of the corpus, one flipped `contains` edge, the guard re-run: green —
four-layer annotation, references, G1, G2, G5, the RCAEval export for three suites, the checkpoint
assertions. A flipped `calls` edge: green too.

**Two were already in the tree.** With the rule written, the suite went red on `entity.test.ts`
(`pod --contains--> service`) and `rca100.test.ts` (`pod --hosts--> service`). Both had been there as
long as their files, both had a passing test attached, and both were wrong in a way that test could
not see. This is the shape the volume keeps recording: the fixture and the assertion ask different
questions.

**What changed.** `RELATION_SIDES` in `entity/graph.ts` states the kinds each relation admits per
side, hand-written, for the reason `export-surface-enumerated.test.ts` gives about its own list.
`findImplausibleEdgeDirections` reads it, and also refuses an edge from an entity to itself — a
kind-pair table cannot catch `pod --contains--> pod`, because both ends are admissible and the
statement is empty. G2 gains `IMPLAUSIBLE_EDGE_DIRECTION` and `SELF_EDGE`, both *structural* in
`export/guard.ts`, so `assertExportableBundle` refuses the bundle rather than letting one case be
skipped out of a contradiction that is the whole graph's.

**What it cannot do, said where the rule lives.** A kind pair cannot catch a reversal between two
entities of one kind — `service A --calls--> service B` and its reverse are both admitted. That needs
an independent witness (a trace's parent/child spans), and the corpus has one case carrying traces.
The flipped-`calls` experiment is still green after the rule and is recorded as green rather than
described as fixed.

**The half that is not a rule.** Turning the rule on produced 26 problem lines for one reversed edge:
`checkG2Semantic` was one function over a bundle and the script asks it of a one-case bundle twice,
thirteen cases either way. Two separate errors. The graph's obligations do not depend on which case
is being read, so they are now `checkGraphContract(graph)`; the case's are `checkCaseSemantics(bundle)`;
G2 composes them. And the second pass could not have differed — G2 never reads telemetry — so it is
gone. One defect is one line now.

**The guard's own guard.** `guard.test.ts` reads G2's `code:` literals by slicing a function body it
finds by name; after the split that body has no codes and the positive control (`finds codes to
classify at all`) went red. `G2_PARTS` now names the halves, and a second assertion requires the
composer to call each — a third half added later fails there instead of emitting codes nothing
classifies.

**Mutation battery.** `contains.to` admitting `service` → 1 red; the self-edge branch deleted → 2
red; the composer dropping the graph half → 2 red. All restored before the acceptance run.

**Acceptance.** `pnpm test:coverage` green at core **188 / 4690**, cli **4 / 187**, repo **192 /
4877**, every coverage dimension 100 % on the files the run loaded; `check-fault-cases` OK (13 of 30,
19 directed edges, 0 refusals) and `FAILED — 1 problem(s)` on the flipped copy; `docs:check` green
(`check-doc-counts` 179 published counts, `check-audit-volumes` 267 findings 1–270, `check-progress-
volumes` 6 volumes); `derive-gate-sites --check` green after a re-derivation that moved four line
numbers in `check-fault-cases.mjs`.

### Left open

- **A reversal between two entities of one kind is not detectable statically.** `[open: `calls` and
  `routes` are checked for the kind pair, not for the direction of the actual invocation; the witness
  would be trace parent/child spans, and one case in the corpus carries traces]`
- **17 samples still carry no case.** `[open: 13 of 30 carry one; nine rounds went to the anchor, this
  one to the relation, and the corpus is the product]`
- **Upstream's baselines still refuse our data.** `[open: `process()` matches `RE2-OB` / `RE3-TT` /
  `online-boutique` and raises `SLI not implemented` otherwise]`
- **RE3's traces and logs are not read.** `[open: 29 MB `traces.csv` and 11 MB `logs.csv` per case,
  never opened]`
- **No aggregate tables.** `[open: `logts.csv`, `tracets_err.csv`, `tracets_lat.csv` are not
  produced]`
- ~~**A whole-suite run is not isolated from its own mutation batteries.**~~ Retracted by finding 272
  (v2.98): the diagnosis this item named was wrong. The batteries mutate the temporary roots their
  tests hand them and never the repository -- measured by tracing every `_restore` write (60 of them,
  all under `/tmp`), by making a subject read-only and running the suite (green, no `EACCES`), and by
  running two suites at once (green). The single red run that produced this item has not recurred in
  eight further runs, and it is recorded as unreproduced rather than as fixed.

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote;
compound units are compared structurally; a chain's first step need not be the root cause; an absence
of logs cannot be a checkpoint.

## v2.98 — the fourteenth case, and a diagnosis that was withdrawn

**What was open.** Two things: seventeen samples with no case, and — from v2.97's last line — a claim
that the mutation batteries rewrite tracked scripts while the suite reads them. The second turned out
to be false, which is the first half of this round.

**The fourteenth case.** `resource-ephemeral-capacity-image-builder`, annotated from its own incident
text. It is the corpus's first whose answer is a *filesystem boundary*: the pod's writable overlay is
at its 10Gi ephemeral limit and `df` reports the node's root filesystem at 40 percent, and **both
readings are true** — they measure different filesystems. A corpus with only the full series would be
satisfied by *the node is out of disk*, which is false; one with only the healthy series would report
nothing wrong. Three entities and two edges were added (`image-builder`, its pod, the node), taking
the corpus to **14 of 30**, 34 entities, 21 edges, floor 14. Four checkpoints, one of them a declared
configuration fact (`ephemeralLimitBytes == 10737418240 By`), so the 100 percent is relative to a
number the case states rather than to an unstated one.

**Two quantities were deleted before anyone could check them.** The first draft declared
`janitorInterval: 24 h` and `queueDepthAtFailure: 31`. The text states neither. They were removed, and
what remains is what a sentence supports. A parameter no checkpoint reads is a parameter no test
compares, so nothing would have caught the invention.

**Seven assertions went red, and they were one mistake.** `13 of 30`, `RE2 13 case(s)`,
`RE3 2 case(s)`, `41 of 41 ... 6 citing`, `['entity', true, 31]`, `filled 31 item(s)`, `0 of 37` — the
guard's own tests had written down what the corpus held instead of reading it. Each now derives:
`CORPUS_SIZE` from the index, `SAMPLE_COUNT` from the extraction key, `CODE_LEVEL_CASES` from the
cases' own `fault.category`, `graph.entities.length` from the graph; the reference summary became an
equality (`resolved === total`, `failed === 0`, both totals asserted non-zero so neither can be
vacuous). **A guard whose assertions restate the data reports a change in the data as a defect in the
guard** — the third form of this volume's recurring shape, after finding 269's borrowed fixture and
finding 255's unread join.

**One of those repairs was wrong and is recorded.** Having captured the per-kind breakdown
(`34 over a series, 2 of them computed from 4 reading(s), 7 citing a configuration fact`) I asserted
that the kinds partition the total. They do not: 34 + 7 is 41, the total is 45, and the difference is
a kind the regex does not capture. The assertion was arithmetic I had invented about a line I had not
read; it was deleted rather than tuned, and what is asserted is only what holds.

**The withdrawal.** v2.97 ended by naming a cause for one red run: the batteries rewrite `scripts/` in
place and a reader sees the mutation. Three tests of that claim, and none survived:

| hypothesis | how it was tested | result |
| --- | --- | --- |
| something writes `scripts/` | every `_restore` write logged with target and stack | **60 writes, all under `/tmp`** |
| a writer would at least leave a window | `chmod 444 scripts/check-doc-counts.mjs`, full suite | green, zero `EACCES` |
| two runs at once | two concurrent `vitest run`, then three `test:coverage` | all green |

The mtime the first monitor caught was `same_bytes: true` — a copy-up caused by the monitor's own
read, not a write. **The instrument was reporting itself.** The item is retracted in v2.97, and the
one red run is recorded as unreproduced in eight attempts rather than as fixed.

**What was real.** In the same file that had been complaining:
`[typecheck-entrypoint] worktree teardown leaked 8 registration(s)`. `cold` is the one worktree that
file creates, the teardown removed it (verified by hand, repeatedly), and the report subtracted only
`ROOT` — so eight registrations left by earlier runs produced eight complaints after a teardown that
had succeeded, on every run, until they were cleaned. Now `own` is separated from `others`, `others`
are named as predating the run, and **`own` is asserted** rather than printed. Measured limit of that
assertion: a failure in `afterAll` sets the exit code to 1 and does **not** turn `Tests 4 passed (4)`
red, so a reader who checks only the count will believe the teardown works.

**Mutation battery.** The report claiming one more case than the index holds → 2 failed / 97. The
teardown attempting nothing → `survived teardown: expected { present: true, registered: true }`,
`EXIT=1`.

**Acceptance.** `pnpm test` green at core **188 / 4690**, cli 4 / 187, repo **192 / 4877**;
`check-fault-cases` OK (14 of 30, 34 entities, 21 edges, 45 references all resolved, 0 of 41
comparable assertions failing); `docs:check` green; audit 7 volumes, findings 1–272.

### Left open

- **16 samples still carry no case.** `[open: 14 of 30 carry one; the remaining sixteen are listed in
  the extraction key and annotation is one case per round, which is the pace this corpus's quote rule
  imposes -- every layer has to quote a sentence, so a case cannot be written from memory]`
- **A reversal between two entities of one kind is not detectable statically.** `[open: the kind table
  refuses `db --calls--> service` and cannot refuse `service B --calls--> service A`. Closing it needs
  a witness that states who invoked whom, which means traces, and the corpus has one case carrying
  them -- so the second half of this item is a corpus item before it is a code item]`
- **One red run is unreproduced.** `[open: `gates-are-testable-is-enumerated.test.ts` read a listed
  gate as exit-free once; three hypotheses about the mechanism were refuted in v2.98 and eight further
  runs were green, so the failure is recorded rather than explained]`
- **Upstream's baselines still refuse our data.** `[open: this is a product decision rather than a
  defect to patch: the loader selects a service-level indicator by path, so a system it does not know
  is refused. Declaring ourselves to be `online-boutique` would make the number comparable and
  meaningless, and the alternative -- an upstream change -- is not ours to make]`
- **RE3's traces and logs are not read.** `[open: the adapter opens neither file, so an RE3 case
  reaches the export with metric signals only -- one of the IR's four layers. The cost is 40 MB per
  case, which is why it has been deferred three rounds running rather than decided against]`
- **No aggregate tables.** `[open: the multi-source methods and `torai` read `logts.csv`,
  `tracets_err.csv` and `tracets_lat.csv`; this exporter writes none of the three, so those readers
  see an empty modality rather than a missing file]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote;
compound units are compared structurally; a chain's first step need not be the root cause; an absence
of logs cannot be a checkpoint.

## v2.99 — the fifteenth case, and the gate half that no caller could reach

**What was open.** Sixteen samples with no case. This round annotated one of them, and the round's
finding came from noticing that annotating it changed nothing.

**The fifteenth case.** `config-datasource-url-orders`, annotated from its own incident text. It is
the corpus's first whose evidence is a **destination** rather than a magnitude: every order write
succeeds and every write lands in the staging database. Three series, and the pair that decides it is
`order_write_rows_ratio_to_staging == 1` beside `order_write_rows_ratio_to_production == 0`, with
`order_write_error_ratio == 0` as the control that excludes the pool, the credentials and the network
— every explanation that would have produced an error. Three entities and two edges were added
(`order-service`, `orders-db`, `orders-db-staging`), taking the corpus to **15 of 30**, 37 entities,
23 edges, floor 15.

**The result worth recording is that nothing went red.** Last round's repair — seven assertions that
restated the corpus turned into derivations — was for exactly this moment, and this is the first
round it was tested. A new case is now a new case.

**Where the defect was instead.** The gate that checks whether the corpus's levels are spread,
`checkG4Solvability`, answers two questions: can a baseline locate each case's root cause, and are
the graded cases spread across L1..L4. `check-fault-cases.mjs` asked it **once per case**, with a
one-case bundle, so `graded.length` was 0 or 1 against a `distributionMinCases` of 10 and the two
`DIFFICULTY_SKEWED_*` branches **could not be taken by any input from the only caller that owns the
corpus**. Fifteen cases, five of them graded, and the rule that exists to notice a corpus of easy
cases had never once looked.

`guard.test.ts` had been passing throughout: it builds ten `L1` cases and watches the gate refuse
them. The gate is fine. The wiring is not, and a unit test of a function cannot see what its only
caller passes it. This is the least visible form of the shape this volume keeps recording — not a
check that passes vacuously on this data, but one that no caller can reach on any data.

**The split.** `checkSolvability` (one case) and `checkDifficultyDistribution` (the set) are now
separate, and `checkG4Solvability` composes them — the arrangement finding 270 gave G2, for the same
reason. The difference is the cost of not having it: G2's version said one defect twenty-six times,
this one said nothing at all.

**Three wiring defects the split exposed, all three written wrong by me first.** Graded cases were
collected where telemetry was collected, so a case with no derived signals did not count as
annotated. `firstGraph` was recorded inside the telemetry block, so "the corpus has a graph" was
false for a corpus with no telemetry and the distribution check skipped. The `difficulty N of M` line
lived inside the export block, so it vanished from exactly the runs that have no telemetry — the
third was caught only after the first two were fixed and the tests still passed without it.

**Why the line exists.** `difficulty` is optional and `difficultyFor(undefined)` returns `medium`, by
design. So an unannotated case and a case measured as medium are **the same word in every output**,
and ten of fifteen cases are in that state. `difficulty 5 of 15 case(s) state a level; the
distribution rule applies at 10` is the smallest thing that separates *not measured* from *measured
and fine*.

**Mutation battery.** The whole-corpus check deleted → 2 failed / 102. The check asked over cases
with telemetry instead of all cases → 2 failed / 102. The second is the defect the first draft
actually had.

**Acceptance.** `pnpm test:coverage` green at core **188 / 4695**, cli 4 / 187, repo **192 / 4882**;
`check-fault-cases` OK (15 of 30, 37 entities, 23 edges, 48 references resolved, 0 of 44 comparable
assertions failing, `difficulty 5 of 15`); `docs:check` green; audit 7 volumes, findings 1–273.

### Left open

- **Sixteen samples carry no case, and ten of the fifteen carry no level.** `[open: the corpus is the
  product and the annotation rate is one per round; the level is a second annotation on every case
  already written, and the distribution rule cannot say anything until ten cases state one]`
- **A reversal between two entities of one kind is not detectable statically.** `[open: caught by no
  rule, because directions between two services are a fact about a deployment; the witness would be
  trace parent/child spans and the corpus has one case with traces]`
- **One red run is unreproduced.** `[open: a listed gate was read as exit-free once; three hypotheses
  were refuted in v2.98 and eleven further runs have been green, so it stays recorded rather than
  explained]`
- **Upstream's baselines still refuse our data.** `[open: the loader picks a service-level indicator
  by path and raises `SLI not implemented` for a system it does not know; claiming to be
  `online-boutique` would produce a comparable and meaningless number]`
- **RE3's traces and logs are not read.** `[open: 29 MB of `traces.csv` and 11 MB of `logs.csv` per
  case are never opened, so an RE3 case reaches the export with one of the IR's four layers]`
- **No aggregate tables.** `[open: `logts.csv`, `tracets_err.csv` and `tracets_lat.csv` are read by
  the multi-source methods; this exporter writes none of them]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote;
compound units are compared structurally; a chain's first step need not be the root cause; an absence
of logs cannot be a checkpoint.

## v3.00 — difficulty had no definition, so the floor was defined instead

**What was open.** Ten of fifteen cases carried no difficulty level, and the distribution rule — made
reachable in v2.99 — needed ten before it could say anything. The round was going to annotate them.

**The question that stopped it.** What does a level mean? A sweep of the repository found the field
declared (`'L1'|'L2'|'L3'|'L4'`), its projection published (`L1->easy`, `L2->medium`, `L3/L4->hard`),
and nothing at all about what makes a case L3 rather than L2.

**What an undefined field collects, measured.** Five labels, and they do not agree with each other:

- `history-kafka-consumer-lag` and `history-queue-watermark-ledger-writer` have **identical**
  structure — one step, two entity kinds — and are labelled L2 and L3;
- `history-checkout-cpu-saturation` has the **most** structure in the corpus — two steps, three kinds
  — and is labelled L2.

Three judgements, made once each, none comparable.

**What this round refused to do.** It refused to invent the definition: any real one has to say what
difficulty is *for*, and every candidate — model accuracy, distance from the easiest hypothesis,
number of plausible wrong answers — needs evidence this repository does not have. It also refused to
annotate ten cases by feel, which would have given the distribution rule a population with no more
standing than the five that contradict each other.

**What it did.** It stated the one property any definition must have and made it checkable.
**Monotonicity**: a case cannot claim less structure than its own chain carries. `difficultyFloor`
derives it from `depth` (causal steps) and `breadth` (distinct entity kinds), and
`findDifficultyShortfalls` reports any label below its floor.

| steps | kinds | floor |
| --- | --- | --- |
| ≥ 3 | any | L4 |
| 2 | any | L3 |
| 1 | ≥ 2 | L2 |
| 1 | 1 | L1 |

**A dead branch, written and removed in the same round.** The first draft added `breadth >= 3` at one
step → L3. It cannot happen: a one-step chain's two ends are at most two kinds unless the root cause
sits off its own chain, which the four-layer assessment refuses. The test for that row failed against
the implementation, and the row was deleted rather than the test.

**Eleven labels changed.** One was raised (`history-checkout-cpu-saturation`, L2 → L3 — the shortfall
the guard found on its first run), and ten unlabelled cases took their floor. The four labels already
above their floor were left alone. Every level in the corpus now claims *at least* the structure it
carries, which is a weaker claim than a rating and is stated as such.

**The distribution now runs, on real labels.**

```
difficulty 15 of 15 case(s) state a level; the distribution rule applies at 10
difficulty spread L1 2 / L2 8 / L3 5 / L4 0; outside the target -- L4 share 0.000 is below the 0.1 floor
```

Two verdicts, deliberately different. A **label below its floor** fails the run: it is an annotation
defect and a one-line repair. A **missing hardest case** is printed and passes: no correction to any
label can produce an L4, because the deepest chain in the corpus is two steps. Failing every run on a
property only a new case can change is how a line becomes invisible.

**Acceptance.** `pnpm test:coverage` green at core **189 / 4710**, cli 4 / 187, repo **193** files /
**4897** tests; `check-fault-cases` OK (15 of 30, 48 references resolved, 0 shortfalls, spread
2/8/5/0); `docs:check` green; audit 7 volumes, findings 1–274.

### Left open

- **The difficulty definition is still missing, and the floor is not it.** `[open: monotonicity is
  necessary and not sufficient; a real level needs per-case accuracy, which needs more than the two
  local baselines the corpus is checked against, and the ONE provider this repository has configured
  is not a measurement of difficulty either]`
- **No case in the corpus is L4.** `[open: every chain is one or two steps, so `minL4Share` of 0.1
  cannot be met by any labelling; either a three-step case enters or the floor becomes a product
  decision -- and the report names the gap on every run until then]`
- **Fifteen samples carry no case.** `[open: the remaining samples in the extraction key are one
  annotation per round, and the round just spent itself on the definition the annotation needs]`
- **A reversal between two entities of one kind is not detectable statically.** `[open: a direction
  between two services is a fact about a deployment; the witness would be trace parent/child spans
  and one case in the corpus has traces]`
- **One red run is unreproduced.** `[open: a listed gate was read as exit-free once; three hypotheses
  were refuted in v2.98 and a dozen runs since have been green]`
- **Upstream's baselines still refuse our data.** `[open: the loader picks a service-level indicator
  by path; claiming to be `online-boutique` would produce a comparable and meaningless number]`
- **RE3's traces and logs are not read.** `[open: 29 MB and 11 MB per case, never opened, so an RE3
  case reaches the export with one of the IR's four layers]`
- **No aggregate tables.** `[open: `logts.csv`, `tracets_err.csv` and `tracets_lat.csv` are read by
  the multi-source methods and this exporter writes none of them]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote;
compound units are compared structurally; a chain's first step need not be the root cause; an absence
of logs cannot be a checkpoint.

## v3.01 — top-K was the size of the ranking

**What was open.** Fifteen samples with no case, and no L4 case in the corpus. This round did neither:
annotating another case changed nothing last round, so the round went looking for what the guards
actually measure. It found one that measures nothing, and it had been reporting a pass on every run.

**The claim and the code.** `rankServicesByPeakZScore` and `rankServicesByMedianShift` ended with

```ts
const topK = Math.min(options.topK ?? DEFAULT_TOP_K, Math.max(ranking.length, 1));
```

so on a corpus whose rankings hold one to three services -- measured: fifteen cases, mean 1.67,
`topK === ranking.length` in fifteen of fifteen -- `rankOfTruth <= topK` is true for **every answer
that appears in the ranking at all**. G4's `minSolvers: 2` was therefore counting one existence check
twice, and the guard's closing line ("both the peak-z and the median-shift baselines place in their
top-K") was an existence claim in a precision claim's clothes.

**The tests agreed with it.** `baseline-localiser.test.ts` asserted `reading.topK).toBe(2)` for a
two-candidate ranking, `{ranking: [], topK: 1}` for no signals, and carried a test named *honours a
topK the caller asks for, and never exceeds the ranking*. A correct expectation about a function
whose contract was wrong: the name is how the contract got written down instead of questioned.

**The fix, in two halves.** `topK` is the K the caller asked for; `candidateCount` is the ranking's
length; both are on `BaselineOutcome`. And `checkSolvability` gains `LOCALISATION_UNCONTESTED`, which
refuses a case whose ranking is no wider than the K it is scored at — because no method can miss a
candidate inside its own output's length.

**The corpus then failed it, 15 for 15.** Which was the point: the narrowness is not an accident of
the guard. A case's signals file carries the series its incident is about, every number there quotes a
sentence, and a ticket names the two components it is about. **The rule that keeps the annotation
honest is the rule that capped the ranking.**

**So the data gained its missing half.** `background-telemetry.json`: eighteen flat request-rate
series, one per service in the graph, added to every case. Four rules, all in `fault/background.ts`,
all unit-tested: flat (`noise: 'none'`, so a quiet statistic is exactly zero); the whole system (an
entry the graph lacks is attributed to nothing, a service it omits is a candidate that never
competed); the case wins on `(service, metric)`; and never evidence (no quote, and a checkpoint citing
`request_rate` fails as undeclared even though the series is in the data).

**The first honest localisation readout.**

```
localisation over 15 case(s) at top-3, rankings 18-20 candidate(s) wide
  -- rank 1: 26, rank 2: 4 of 30 baseline run(s)
```

Not flattering, and now measurable: a peak-z baseline is right at rank 1 in thirteen of fifteen
cases. The next round's problem is a distractor that moves more than the answer, which is the only
thing that will move those numbers.

**A second defect the widening exposed.** `rankOfTruth: null` used to mean "absent from the ranking",
which was reachable only because the ranking held the case's own two services. With eighteen quiet
candidates the answer is always present, so a case whose answer never moved would have been reported
**solved at rank 2** — one other service moved, the tail was sorted alphabetically. `locatedRank`
returns `null` when the statistic is zero: a candidate that showed nothing is a line in an output, not
a finding. Both baselines call it.

**Mutation battery.** `topK` back to `min(K, n)` → 10 failed / 101. A zero statistic counted as
located → 3 failed / 101. The background not yielding to the case → 1 failed / 19. The background
jittering → 1 failed / 19. The corpus without its background → 15 refusals, asserted. The background
omitting one service → `omits the service 'cart-service'`. A checkpoint citing `request_rate` →
`which the signals file does not declare`.

**Acceptance.** `pnpm test` green at core **190 / 4746**, cli 4 / 187, repo **194 / 4933**; coverage
99.97 / 99.75 / 100 / 99.97 with `fault/background.ts` at 100 % on all four dimensions;
`check-fault-cases` OK (15 of 30, 18–20 candidates wide, 48 references resolved, 0 of 44 comparable
assertions failing); `docs:check` green; audit 7 volumes, findings 1–275.

### Left open

- **Every case is one moving series among seventeen flat ones.** `[open: peak-z is at rank 1 in 13 of
  15 cases, which says the corpus tests detection rather than localisation. A case whose loudest
  service is the victim needs a distractor that moves more than the cause, and a distractor has to
  quote a sentence, so it is a corpus decision rather than a guard one]`
- **No case in the corpus is L4.** `[open: every chain is one or two steps, so `minL4Share` of 0.1
  cannot be met by any labelling; the report names the gap on every run]`
- **Fifteen samples carry no case.** `[open: the remaining samples in the extraction key are one
  annotation per round, and this round spent itself on the measurement the annotation depends on]`
- **A reversal between two entities of one kind is not detectable statically.** `[open: a direction
  between two services is a fact about a deployment; the witness would be trace parent/child spans and
  one case in the corpus has traces]`
- **One red run is unreproduced.** `[open: a listed gate was read as exit-free once; three hypotheses
  were refuted in v2.98 and every run since has been green]`
- **Upstream's baselines still refuse our data.** `[open: this round made our records rankable by our
  own baselines over eighteen candidates; it did not make them rankable by the upstream loader, which
  selects a service-level indicator from the path and refuses a system it does not know]`
- **RE3's traces and logs are not read.** `[open: the widening this round gave the metric modality --
  eighteen candidates where there were two -- has no counterpart for logs or spans, and an RE3 case
  still reaches the export with one of the IR's four layers populated]`
- **No aggregate tables.** `[open: the localisation readout this round added is the first per-corpus
  number the guard prints, and it is computed from the signals in memory rather than from a file a
  downstream method could read; the three aggregate tables remain unwritten]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote;
compound units are compared structurally; a chain's first step need not be the root cause; an absence
of logs cannot be a checkpoint.

## v3.02 — the loudest series is not the answer

**What was open.** Last round's readout: peak-z right at rank 1 in thirteen of fifteen cases, which
it called "the corpus tests detection rather than localisation". A measurement is not a repair, so
this round built the case that number was asking for and the rule that keeps it from sliding back.

**The case.** `history-middleware-replica-lag-analytics`, from its own text. The ratios are inverted
against the answer on purpose:

| series | baseline | post | ratio | what it is |
| --- | --- | --- | --- | --- |
| `orders-db.write_rate` | 40 rps | 3200 rps | 80× | the load, on the healthy primary |
| `analytics-replica.replica_relay_lag_seconds` | 60 s | 2400 s | 40× | **the answer** |
| `analytics-dashboard.dashboard_total_age` | 10 min | 240 min | 24× | the symptom a reader saw |
| `orders-db.commit_latency` | 3 ms | 3 ms | — | the control that rules the primary out |

Both baselines return the primary first. That is the point: **a method that returns the largest
excursion returns a component the text says is healthy**. The text says it twice — "The primary is
healthy" and "Reads on the primary are current" — so the case carries the disproof of its own loudest
series, which is what makes it a corpus in the sense this repository means.

**The reading, before and after.**

```
before   rank 1: 26, rank 2: 4 of 30 baseline run(s); displaced in 2 case(s)
after    rank 1: 26, rank 2: 6 of 32 baseline run(s); displaced in 3 case(s)
```

The third displacement is the one built on purpose. The other two are accidents — `checkout` because
a pod's series outranks its service's, `upstream-5xx` because two services move by the same 60% and
the tie breaks by name — which is why the next paragraph is a rule rather than a promise.

**The rule.** `checkDiscrimination(outcomes)` refuses a corpus in which every run places the answer
at rank 1 (`NO_DISPLACEMENT`): no case in it can penalise a threshold-based localiser, so its 100% is
a measurement of detection. Corpus-level, because the property is — no single case is wrong for
having a loud answer. **Its weakness is in the function's own comment**: a tie broken by name
satisfies it, so it guarantees that *something* can go wrong, not that the something was designed to.

**The fixture it refused on the first run.** `withPost` in `check-fault-cases.test.ts` builds the
checkout signals plus a scratch series whose `post` the caller chooses, and it attributed that series
to `checkout-api` — the case's own answer. Starting at zero and jumping to 500 mcore, the scratch
series was the largest excursion in the window, so the fixture had become a corpus whose answer is
the loudest thing; the rule refused it, correctly, in a test about parameter references. The repair is
one field: the scratch series is attributed to `cart-service`. **A fixture is a corpus**, and a
corpus-level rule applies to it.

**Mutation battery.** The rule removed from the guard → 1 failed / 130. `checkDiscrimination` asking
nothing → 1 failed / 178. The distractor dropped to 600 rps → 28 rank-1 / 4 rank-2, `displaced in 2`,
and the case's own test fails (`expected 2 to be 0`). The third is the interesting one: the corpus
still passes, because two accidental displacements remain, so only the case-specific test catches a
regression in this case.

**Acceptance.** `pnpm test` green at core **190 / 4751**, cli 4 / 187, repo **194 / 4938**; coverage
99.97 / 99.75 / 100 / 99.97 with `gates.ts` and `background.ts` at 100% on all four dimensions;
`check-fault-cases` OK (16 of 30, 39 entities, 24 edges, rankings 19–21 wide, 52 references resolved,
0 of 48 comparable assertions failing); `docs:check` green; audit 8 volumes, findings 1–276.

### Left open

- **Displacement is required somewhere, not designed everywhere.** `[open: the rule is satisfied by
  one case, and it does not distinguish a case built to displace the answer from a tie broken by
  name; three of sixteen cases displace today and two of them do so by accident]`
- **No case in the corpus is L4.** `[open: this round's case is one step deep like the other
  fifteen, and the distribution report keeps printing `L4 0` -- a level no labelling can reach while
  every chain the sample set describes is one or two hops]`
- **Fourteen samples carry no case.** `[open: 16 of 30 annotated, one per round, and the two rounds
  since the corpus's last easy addition have gone to the measurement the annotations depend on]`
- **A reversal between two entities of one kind is not detectable statically.** `[open: the kind table
  refuses `db --calls--> service` and cannot refuse `service B --calls--> service A`; the witness
  would be trace parent/child spans and one case in the corpus has traces]`
- **One red run is unreproduced.** `[open: this round ran the full suite five times and the only red
  it produced named a failing test; the single unattributed red of v2.97 has not appeared again]`
- **Upstream's baselines still refuse our data.** `[open: our own two baselines now rank a sixteen-case
  corpus over nineteen to twenty-one candidates; the upstream loader still selects a service-level
  indicator from the path and refuses a system it does not know]`
- **RE3's traces and logs are not read.** `[open: the metric modality is now wide enough to rank, and
  the log and span modalities are still one case deep at best, so an RE3 case reaches the export with
  one of the IR's four layers]`
- **No aggregate tables.** `[open: the localisation readout is computed from the signals in memory
  rather than written to a file a downstream method could read; `logts.csv`, `tracets_err.csv` and
  `tracets_lat.csv` remain unwritten]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote;
compound units are compared structurally; a chain's first step need not be the root cause; an absence
of logs cannot be a checkpoint.

## v3.03 — three cases were displaced, one of them was evidence

**What was open.** v3.02 shipped `checkDiscrimination` with a weakness it stated about itself: a tie
broken by name satisfies it. The corpus reported three displaced cases; this round replaced "is the
answer at rank 1" with a classification, and the number fell to one.

**What the three were.**

| case | rank 1 | what a method returning it has done |
| --- | --- | --- |
| `history-checkout-cpu-saturation` | `checkout-api-0` (pod) | named the replica that was throttled |
| `history-dependency-upstream-5xx-pricing` | `pricing-service` | separated nothing — both move 60 %, the order is a sort |
| `history-middleware-replica-lag-analytics` | `orders-db` | returned the healthy primary |

Only the third penalises a magnitude-based method deterministically. The first is not a miss at all
(the pod under the answer is the answer at another resolution); the second flips on a rename.

**The classification.** `classifyDisplacement({graph, case, ranking})` returns `strict`, `tie`,
`same-component` or `none`, and the gate now requires at least one `strict`. Two details carry the
judgement: **containment is walked one way** (a pod under its service is the same component; two
replicas are siblings and the wrong replica is a miss — the first draft walked it both ways and merged
them), and **equality is not strictness** (a tie means the method's own number could not separate the
two).

**The honesty cost, immediately visible.**

```
before   the answer is displaced in 3 case(s)
after    strict 2, tie 2, same-component 2, none 26 of 32 baseline run(s)
         -- strictly displaced in 1 case(s) (history-middleware-replica-lag-analytics)
```

**What it broke, and why the breakage was correct.** Every single-case fixture corpus in
`check-fault-cases.test.ts` became a non-corpus: the checkout fixture is `same-component`, so a corpus
of one has no strict displacement, and the guard refused it inside tests about series declarations,
parameter references and G3. The repair is in the fixture, not the rule: `corpus()` appends one series
on `cart-service` (a component the case does not answer with and that does not contain it) jumping
from zero to 500, quoting a sentence the case's text carries. Three tests turn it off, each with a
line saying its subject is a different refusal.

**A dead branch, written and deleted in the same round.** The first version ended with three arms and
the third (`top < answer → none`) was unreachable from every caller, because the ranking is the
method's own output and its first entry is its largest. Coverage named it (`135-136`); the contract
moved into the docstring and the arm went:

```ts
return top.statistic === answer.statistic ? { caseId, kind: 'tie' } : { caseId, kind: 'strict' };
```

**Mutation battery.** Containment not walked → 2 failed / 115. A tie counted as strict → 1 failed /
81. The gate accepting any kind but `none` → 1 failed / 72. The guard classifying an empty ranking →
`FAILED — 1 problem(s)`.

**Acceptance.** `pnpm test` green at core **191 / 4766**, cli 4 / 187, repo **195 / 4953**; coverage
99.97 / 99.75 / 100 / 99.97 with `displacement.ts` at 100 % on all four dimensions; `check-fault-cases`
OK (16 of 30, 19–21 candidates wide, 0 of 48 comparable assertions failing); `docs:check` green; audit
8 volumes, findings 1–277.

### Left open

- **Exactly one case displaces the answer by magnitude.** `[open: `strict 2` is one case seen by two
  baselines; the rule needs one and the corpus has one, so a single edit could take the property away
  and only a case-specific test would notice]`
- **No case in the corpus is L4.** `[open: every chain is one or two steps, so `minL4Share` of 0.1
  cannot be met by labelling; the report prints `L4 0` on every run]`
- **Fourteen samples carry no case.** `[open: 16 of 30 annotated, one per round, and three consecutive
  rounds have been spent on the measurement apparatus the annotations are judged by]`
- **A reversal between two entities of one kind is not detectable statically.** `[open: this round
  made direction matter more -- a `calls` edge pointing the wrong way changes which end a reader
  blames -- and the kind table still cannot see it; the corpus would need a case with parent/child
  spans before the check could be written]`
- **One red run is unreproduced.** `[open: v2.98 refuted three hypotheses and every run since has been
  green; this round's only reds named their failing test]`
- **Upstream's baselines still refuse our data.** `[open: our own two baselines rank a sixteen-case
  corpus over nineteen to twenty-one candidates; the upstream loader still selects a service-level
  indicator from the path]`
- **RE3's traces and logs are not read.** `[open: the ranking this round classifies is built from
  metrics only, so a case whose answer emits no metric is unsolvable by construction and the corpus
  has two such rows to think about before adding a third]`
- **No aggregate tables.** `[open: the four kinds are printed rather than written to a file a
  downstream method could read; `logts.csv`, `tracets_err.csv` and `tracets_lat.csv` remain unwritten]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote;
compound units are compared structurally; a chain's first step need not be the root cause; an absence
of logs cannot be a checkpoint.

## v3.04 — the loudest thing can be fine, or it can be the symptom

**What was open.** v3.03 left exactly one case displacing its answer by magnitude, against a rule
that needs one: a single edit to that case's signals would take the property away and leave every
guard green. This round adds the second, and picks a *different* reason for the displacement.

**Two ways for a magnitude method to be wrong.**

| case | what outranks the answer | why that is wrong |
| --- | --- | --- |
| `history-middleware-replica-lag-analytics` | `orders-db`, the primary | it is **fine** — scheduled backfill, flat commit latency, its own reads current |
| `history-resource-memory-request-ingest-writer` | `ingest-queue`, the backlog | it is **downstream** — the writer stopped draining it |

The first is a method that cannot tell load from fault; the second returns the loudest consequence.
They need different evidence to be decidable (a healthy control versus a counterfactual), which is why
the corpus wants both rather than two of either.

**The case, in three numbers.**

| series | baseline | post | ratio | what it is |
| --- | --- | --- | --- | --- |
| `ingest-queue.backlog_messages` | 200 | 50 000 | 250× | the queue the writer stopped draining |
| `ingest-writer.container_memory_working_set_mebibytes` | 1024 MiB | 3072 MiB | 3× | the answer's evidence |
| `ingest-writer.requested_memory_mebibytes` | 1024 MiB | 1024 MiB | — | **the fault, flat** |

The third row is the one worth reading twice. Almost every control in this corpus rules something out;
this one **is the fault** — the request never moved, and the gap between a flat gibibyte requested and
three used is the whole of the overcommit the scheduler sized the node by. It is also the corpus's
first case whose decisive fact is an **absence**: `heapCapMebibytes == 0`, no `-Xmx` at all, with the
checkpoint's description saying what the zero means so a reader cannot take it for a zero-byte heap.

Depth 2 (container reclaimed → restart stops the drain) puts it at L3, and the distribution moves
`L3 5 → 6`. Still not L4: no chain here is three steps.

**What adding a case cost: nothing.** Third case in a row with no count edited by hand — the guard's
sizes are derived (finding 271). The reading moved by itself:

```
before   rank 1: 26, rank 2: 6 of 32 -- strict 2, tie 2, same-component 2, none 26; strictly displaced in 1
after    rank 1: 26, rank 2: 8 of 34 -- strict 4, tie 2, same-component 2, none 26; strictly displaced in 2
```

**The gap the mutation battery found.** Two negative controls disagree about what protects the
property:

| mutation | the corpus | the case's own test |
| --- | --- | --- |
| the backlog drops to 400, so the answer is loudest again | **green** — the other strict case still satisfies the rule | red (`expected 2 to be 0`) |
| the working set is flattened | **red** — `not solvable by both baselines` | red |

So each displacement case is now pinned by name in its own end-to-end test: **a corpus-level rule that
needs one case is protected by exactly that one case**, and with two it is protected by either —
removing the competitor from one of them is invisible to the rule.

**Acceptance.** `pnpm test` green at core **191 / 4767**, cli 4 / 187, repo **195 / 4954**;
coverage 99.97 / 99.75 / 100 / 99.97; `check-fault-cases` OK (17 of 30, 43 entities, 27 edges, 20–22
candidates wide, 56 references resolved, 0 of 52 comparable assertions failing); `docs:check` green;
audit 8 volumes, findings 1–278; progress **7 volumes** (this one is the first round in the split).

### Left open

- **Two cases displace by magnitude, and both were written by the same hand for the same rule.**
  `[open: both are constructed around a healthy or downstream loud series; a case where the loudest
  thing is a *second* fault would be harder and the corpus has none]`
- **No case in the corpus is L4.** `[open: every chain is one or two steps; this round's is two, so
  the distribution prints `L3 6 / L4 0` and the target stays unreachable by labelling]`
- **Thirteen samples carry no case.** `[open: 17 of 30 annotated; four consecutive rounds have been
  spent on the apparatus the annotations are judged by, and the corpus is the product]`
- **A reversal between two entities of one kind is not detectable statically.** `[open: this round's
  chain crosses `calls` once (writer to queue) and the table cannot tell a reversed call from a
  correct one; the witness would be trace parent/child spans]`
- **One red run is unreproduced.** `[open: the single unattributed red of v2.97 has not recurred
  across a dozen runs]`
- **Upstream's baselines still refuse our data.** `[open: our own baselines rank seventeen cases over
  twenty to twenty-two candidates; the upstream loader still refuses a system it does not know]`
- **RE3's traces and logs are not read.** `[open: this round's answer is a container, which is only
  visible because a metric carried its name; without metrics a container is invisible to every
  baseline the corpus has]`
- **No aggregate tables.** `[open: the four displacement kinds and the rank tally are printed rather
  than written to a file a downstream method could read]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote;
compound units are compared structurally; a chain's first step need not be the root cause; an absence
of logs cannot be a checkpoint.

## v3.05 — the ladder got its top rung, and the rung had to be built out of content

**What was open.** `L4`. The grade had been empty for every round since the distribution rule was
written, and the entry that recorded it said the same thing each time: every chain in the corpus was
one or two steps, so `minL4Share` of 0.1 could not be met by any correction to any label. That was
true, and it was also a description of a product gap: the projection onto `easy`/`medium`/`hard` in
`docs/targets/cloud-opsbench.md` could never emit `hard`, because nothing in the corpus was hard by
structure.

**Two chains of three steps.** Both come from samples that had carried no case, and both take the
propagation out of the family that caused it — which is the property that separates a three-step chain
from one event described at three resolutions:

| case | steps | the third hop |
| --- | --- | --- |
| `history-runtime-pod-shutdown-webhook-dispatcher` | process → pod → service → merchant endpoints | three hundred deliveries per deploy that are never retried |
| `history-code-slow-regex-api-gateway` | process → pod → service → public ingress | eight seconds paid on paths that call nothing behind the gateway |

**The dispatcher case carries one series, on purpose.** Its evidence is a pair of declared numbers —
the drain the process needs (120 s) and the deadline the platform enforces (30 s) — plus a counter that
steps once per deploy. Nothing in the ticket says a latency or an error rate moved, so a plausible
curve in the signals file would have been an invention dressed as telemetry. This is the corpus's
second case whose decisive fact is an absence and the first where the absence is a *pair*: thirty is a
normal grace period, two minutes is a normal drain, and the fault exists only in the comparison nobody
made.

**The gateway case is the corpus's first with a control that is a series rather than a sentence.** The
service behind the gateway answers in eleven milliseconds throughout, and the ticket's clause about
paths with no downstream call is what makes that decisive: a method that walks the call graph lands on
the dependency, which never moved, and a method that ranks by magnitude lands on the right component
for the wrong reason.

**A suspicion, measured and cleared.** Two cases with zero-baseline counters raised the question
whether `zScore`'s `1e-6` floor was deciding rankings — a statistic that is `value / 1e-6` is an
implementation constant wearing a measurement's name. A probe recomputed all nineteen rankings with a
relative floor of one percent and **two changed order**, both between a component and its own pod, and
neither case's `strict` classification moved. The negative result is in the audit (finding 279) with
the probe's own first-run `NaN`s, which were the probe's rather than the corpus's.

**The ratchet.** The guard still prints the distribution rather than gating on it. What changed is
that `difficulty-floor.test.ts` now holds the real corpus to the target: no shortfall, both `L4` cases
named, three steps each, `checkDifficultyDistribution` clean on the real bundle, and
`DIFFICULTY_SKEWED_HARD` when one of the two is removed. At this size the rule needs both cases —
unlike the displacement rule, which needs one and is therefore protected by exactly that one.

**Acceptance.** `pnpm test` green at core **191 / 4772**, cli 4 / 187, repo **195 / 4959**; coverage
unchanged at **99.97 / 99.75 / 100 / 99.97** (no `src/` file was touched); `check-fault-cases` OK —
19 of 30, 50 entities, 34 edges, 22–24 candidates wide, 63 references resolved, 0 of 59 comparable
assertions failing, `difficulty spread L1 2 / L2 9 / L3 6 / L4 2; within the target`; `docs:check`
green; audit 8 volumes, findings 1–279.

### Left open

- **The share is now 2 of 19, and the next two cases spend it.** `[open: 2 of 19 is 0.105 against a
  floor of 0.1; one more non-L4 case brings it to exactly 0.100 and the one after that to 0.095, so a
  third three-step chain is a precondition for the corpus growing twice more rather than a
  nice-to-have]`
- **Both L4 chains end at a consumer, and both consumers are outside the system being measured.**
  `[open: the third hop in each new case is an external party; a three-step chain whose last hop stays
  inside the storefront would exercise a different question, and the corpus has none]`
- **A counter at rank 1 is not a localisation.** `[open: the dispatcher case is solved at rank 1 by
  both baselines because a zero-variance baseline makes its z-score the excursion over 1e-6, so a
  solver quoting this case as evidence for magnitude-based localisation would be quoting the floor]`
- **RE3 emits no rows for the dispatcher case.** `[open: sixteen of the corpus's cases are skipped for
  RE3 because they carry no trace, and the shutdown case is one of them -- its loss is visible only in
  a counter, which is a fair reason and still a gap]`

Unchanged, and each still a limit rather than a task: two cases displace by magnitude and both were
written by the same hand around a healthy or downstream loud series, so a case whose loudest thing is a
*second* fault would be harder and the corpus has none; a reversal between two entities of one kind is
still not detectable statically, and the witness would be trace parent/child spans; eleven samples
carry no case, because this round spent both of its cases on the ladder; the single unattributed red of
v2.97 has not recurred; and upstream's loader still refuses a system it does not know, while our own
two baselines now rank nineteen cases over twenty-two to twenty-four candidates.

## v3.06 — the probe that cleared the suspicion was the one script that could not fail

**What the readers said.** `probe-z-floor.mjs` shipped last round with an answer and no way to disagree
with it: it was the only script under `scripts/` whose only exit was success, and it had no test at all.
`scripts-are-classified.test.ts` files a script by class and refuses a verdict from a file that owns no
failure site, so the round before was caught by the round after — `[ "probe-z-floor.mjs" ]` in its
`missing` list. The probe's own bug from last round makes the point rather than the exception: two
`NaN`s were published as measurements and were found by reading the output, which is the weakest
detector available and precisely the one this campaign exists to retire.

**One exit, not one per input.** `fail(message)` prints the reason and exits; `readJson(path, what)`
names the path and the OS message and then refuses. Every file the probe reads goes through that one
function, so the inventory has one site to prove and a test can aim at it: `--cases <empty dir>` exits
1 with `could not read the case index`.

**The inventory, and a distinction stated rather than assumed.** `derive-gate-sites.mjs` re-derived to
**89 sites across 47 scripts** (13 zero, 3 indirect) and carried 88 annotations across by fingerprint
rather than by line. The new site is `proved`; the three older probes stay `exempt` because their exit
is `process.exit(main())` over a number a test already reads. The line between the two is whether the
site's condition *is* what the test proves or a *summary* of it — an input guard is a fact of its own,
an aggregate exit is not. Rule 7 then made the pointer earn itself twice: a `DRIVES` declaration beside
the test and a `spawnSync` whose argument list reaches the script.

**The probe got a ratchet of its own.** Six tests: a reading on every case in the corpus, every declared
`{ parameter }` reference resolved, no non-finite statistic, and `0 of them into or out of strict`. The
last is a ratchet because it is the only half of the probe's answer the corpus's evidence depends on —
`same-component` moving between floors renames a *non*-displacement, while a move into or out of
`strict` would mean the headline reading is the constant. The probe still exits 0 on either: both
floors answer different questions, so a case whose rank depends on one is a fact about the case, and the
assertion belongs in a test rather than in an exit status.

**Acceptance.** `pnpm test` green at core **192 / 4778**, cli 4 / 187, repo **196 / 4965**; coverage
unchanged at **99.97 / 99.75 / 100 / 99.97** (no `src/` file was touched); `verify:gates-are-testable`
**47 of 47 caught**, the new gate by 10 red tests (1 of the 2 files that name it going red), all 47 files restored
byte-for-byte; `check-doc-counts` OK at 179 published counts over three scopes; audit 8 volumes,
findings 1–280; `pnpm lint` green.

### Left open

- **The probe measures a build, and nothing says which one.** `[open: it imports packages/core/dist/index.js,
  so a probe run by hand reports on whatever was last built; CI builds before it tests and a reader does
  not, so the two can disagree about code that is not in the tree]`
- **Two cases carry a floor-dependent `same-component` label and the test does not count them.** `[open:
  the assertion pins 0 into or out of strict; a third case whose non-displacement label moves between
  floors would be printed on stderr and would leave the suite green]`
- **Rule 7 is a file-level claim, measured as such.** `[open: it establishes that a test file has a path
  to executing the script, not that any line inside it is reached; deleting the one test that drives the
  refusal would leave the site `proved` on the strength of the other spawns in the same file]`

Unchanged from the rounds before, and each still a limit rather than a task: the L4 share is 2 of 19 and
the next two cases would spend it; both three-step chains end outside the system being measured; a
counter at rank 1 is the floor rather than a localisation; RE3 emits no rows for the dispatcher case;
eleven samples carry no case; the reversal between two entities of one kind is still not detectable
statically; and upstream's loader still refuses a system it does not know.

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

## v3.14 — the twenty-fourth case, and the four defects the round produced

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
| `docs:check` | see the commit's CI reading; audit 1–296, **293 findings**, largest `volume-03.md` at 279,893 of 280,000 |

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
