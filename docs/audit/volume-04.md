# Audit · volume 04

Findings 160–194. The index, the scope and the retractions are in [`../audit.md`](../audit.md).

## Finding 160 — the second backend was declared unimplementable, and the declaration was half right

### What the registry said, and what was true

Since finding 154 the T2 registry has carried this row:

> `jaeger` **unsupported** -- Jaeger answers `/api/traces` in its own trace JSON --
> span ids as hex strings, a process table separate from the spans, and no OTLP
> resource attributes -- so a reader for it is a second trace decoder beside
> `ingest/otlp.ts` rather than a URL for the existing one; Jaeger emits OTLP
> natively, which is the path this repository supports today

Every clause of that is true. What it got wrong was the conclusion: **the cost of a
second decoder is a reason to write one, not a reason to declare the backend out of
reach.** The row read as a measurement and was, in the end, a decision that nobody
had been asked to revisit -- the shape findings 158 and 159 kept finding in the
residual lists, one level down.

### What was built

`packages/core/src/ingest/jaeger.ts`: a reader for Jaeger's query API
(`GET /api/traces?service=&start=&end=&limit=`) that maps each span to an IR trace
signal. It is the second `implemented` row and the first reader for a wire format
that is not JSON-with-different-names:

| wire fact | what the reader does with it, and why |
| --- | --- |
| hex `spanID` / `traceID` | carried through verbatim; the IR's ids are opaque strings, so decoding them would be an interpretation nobody asked for |
| `startTime`, `duration` in **microseconds** | converted once, at the boundary: `durationMs = duration / 1000`. A reader that kept microseconds is wrong by 1000x in every duration, and the battery now injects exactly that |
| a `processes` table **beside** the spans | the service is read from `span.process.serviceName`, and from `processes[span.processID]` when the span does not carry one; when neither has it the span is **quarantined**, because guessing would attach the span to the wrong service |
| tags as `{key, type, value}` triples | flattened to string attributes; `error` and `otel.status_code` become the payload's `status` and are **not** repeated as attributes, so one wire fact has one representation |
| references **typed** by `refType` | only `CHILD_OF` is a parent; `references[0]` would build a tree the trace did not record |
| `data: null` with `errors` | a **failed query**, not an empty window; `data` *and* `errors` is a partial answer and passes the messages through as warnings |

Two decisions are worth naming because they are the difference between a reader and
a guess: **an unstated status stays absent** rather than defaulting to `OK` ("the
backend did not say" and "the backend said it succeeded" are different facts, and
only one is a measurement), and **`limit` is required** rather than defaulted, for
the reason `step` is required in the Prometheus puller -- it decides how much
telemetry the caller gets, and a wrong default is invisible in the output.

### The claim, and its honest limit

The registry row is `implemented` with a summary that names the wire format. What
that word does **not** mean here is that a Jaeger answered this reader: nothing in
this repository has contacted a Jaeger deployment, and `docs/architecture.md` now
says so beside the matrix, in the sentence that contrasts it with Prometheus --
which *was* pointed at a real server in finding 154. "Reads the documented wire
format" and "was answered by a deployment" are different measurements, and the
second one has not been taken.

The capability is nevertheless exhibited rather than asserted, by the general rule
finding 154 put in place: `backend-support.test.ts` drives **every** `implemented`
backend over a real socket, with the driver table keyed by id so a missing driver
fails rather than passing.

### Verification

| gate | result |
| --- | --- |
| `jaeger.test.ts` | **26 tests**: the mapping and every quarantine and network branch, including a refused connection and a socket that accepts and never answers |
| `backend-support.test.ts` | **11 tests**, now driving two `implemented` backends through a routed fixture |
| the battery | **19 caught / 0 survived / 0 inert / 0 misattributed** -- four new injections against the second reader, one of them the microseconds conversion |
| `check-backend-support.mjs` | **OK (6 backends: 2 implemented, 4 unsupported with a reason)** |
| the guards the change tripped | the snapshot test refused the stale `backend-support.json`; `export-surface-enumerated` refused the unregistered module; the architecture matrix had to be re-derived rather than edited by hand |
| `typecheck` / `lint` / `docs:check` | green |
| core test suite | **135 files, 3504 tests passed**; `cli` 3 files, 173 tests |
| coverage | **99.96 / 99.91 / 100 / 99.96**; `jaeger.ts` **100 / 100 / 100 / 100** |

### What is not covered

- **No real Jaeger endpoint was contacted.** The reader is measured against a
  fixture server in this repository. A deployment could still answer something the
  fixture does not, and the way to find that out is to point the reader at one.
- **No CLI command.** The reader is reachable through the package's entry point and
  the registry, not through `rca-bench` -- the same gap finding 154 recorded.
- **Three of six backends remain.** Loki, Elasticsearch and ClickHouse, plus
  Kubernetes: each still carries a written reason and no reader.

### A record defect this round made twice

The commit that carried this finding quoted a JSON fragment in backticks inside its
message, and the shell ran it: the stored sentence reads *"and with errors treated
as a failed query"*. The follow-up commit written to correct it **quoted the same
fragment the same way** and lost it again. Both messages are in the log, mangled, and
neither was rewritten -- the finding itself is stated in full above, so no claim is
lost, but a commit message is a record and these two have holes in them.

Two lessons, both cheap and both worth keeping because the mistake repeated itself
between the two commits, which is the interval in which a guard should have
appeared: a shell-quoted commit message must not contain backticks, and when a
correction is written the first thing to change is the thing that broke, not the
sentence around it.

### What this says about the method

The row was not wrong about the wire format; it was wrong to treat "this needs a
decoder" as a stopping condition. **A declaration of impossibility is a claim like
any other, and this one had no reader either** -- nothing re-examined it, because
the table it lived in is only checked for internal consistency. That is the
campaign's recurring shape at its outermost: not a number without a reader, or a
claim without a reader, but a *decision* without one.

## Finding 161 — the third backend's reason was itself the interface, and one timestamp carried two unit traps

### What the registry said, and which half of it was the finding

The `loki` row in `backends.ts` carried this reason:

> Loki answers `/loki/api/v1/query_range` with LogQL results whose values are
> `[ns-timestamp, line]` pairs and whose streams carry label sets Loki chose, so the
> service a log belongs to is a label the caller must name, and a reader that
> guessed it would attach every line to the wrong service

Every clause of that is true, and it is true in the way finding 160's Jaeger reason
was true: about the wire format. The conclusion drawn from it was not. **"The caller
must name it" is a statement about the interface, not about feasibility** -- a reader
whose service label is a *required argument with no default* has nothing to guess
with. So `serviceLabel` is required, and it is required for a reason the Prometheus
puller's `serviceLabel` is not:

| puller | default | why |
| --- | --- | --- |
| Prometheus | `service` | OpenTelemetry's semantic conventions define this for metrics, so the default is a convention rather than a guess |
| Loki | **none** | no convention is universal for logs: the OTel Collector's Loki exporter writes `service_name`, a Promtail pipeline writes whatever its author wrote (`job`, `app`), and neither is a promise from the backend |

A default here would be one writer's habit presented as the backend's promise. The
registry's own sentence is what says so, and it is now the interface instead of the
excuse.

### The wire facts, and what each one forced

| wire fact | what the reader does with it, and why |
| --- | --- |
| entry timestamps are **decimal strings of nanoseconds** | parsed with `BigInt` and integer-divided to milliseconds; both ways of getting it wrong are measured below |
| `direction` defaults to `backward`, and **with `limit` it decides which end of the window survives** | required, like `step` is in the Prometheus puller: a default would silently decide how much telemetry the caller gets |
| `limit` defaults to **100 entries** | required, for the same reason -- a truncated window that looks complete is the failure mode of the round that produced finding 147 |
| a stream's label set is its identity (Loki requires labels to be low-cardinality) | the labels other than the named one go into the signal's `resource`; a label value that is not a string is dropped rather than coerced, because `resource` holds strings |
| the same endpoint answers a **LogQL metric query** with `resultType: "matrix"` | refused by name (`got 'matrix'`), not read as log bodies: a metric query is telemetry, but its sample values are not lines |
| Loki 3 puts a **third element** in an entry when structured metadata is present | the entry is **quarantined**, with the reason naming what the third element would be; attaching a metadata object as the line is the loudest available version of guessing |
| level labels are `level`, `severity`, `lvl` or Loki's own `detected_level`, and their values are not the IR's vocabulary (`warning` is not `WARN`, `critical` is not `FATAL`) | `severityText` is **never** set: absent means "the backend did not state one in a vocabulary this repository reads", which is a different claim from "this line was informational" |
| results arrive in the order `direction` implies | the order is **preserved**, not re-sorted: `signals[0]` staying the backend's first entry is the only thing a reader can compare the two by |

### Two unit traps in one number, both measured

1.7e18 nanoseconds is past the range in which a `float64` holds every integer, and
both wrong readings are exhibited in `loki.test.ts` rather than described:

| reading of `1700000000123456789` | result |
| --- | --- |
| as **milliseconds** | `new Date(Number(ns))` is **not a date at all** -- beyond the `Date` range, so a reader that skipped the unit reports `Invalid Date`, not a wrong date |
| through **`Number` and then `/ 1e6`** | `Number('1700000000123999999')` rounds up to `1700000000124000000`, so `Math.floor(Number(ts) / 1e6)` says `...124` where the digits say `...123` -- a **one-millisecond error on a real timestamp**, and the two sides are asserted side by side |
| through **`BigInt` integer division** | `...123`, by truncation, so the IR's timestamp is never later than the line the backend wrote |

The same fact bites in the other direction: the request's window is sent as
nanosecond decimal strings built from whole milliseconds, because `value * 1e9` on a
number of seconds arrives with the last digits already rounded. The battery injects
both the float division and the seconds-instead-of-nanoseconds request.

### The claim, and its honest limit

The registry row is `implemented`, and what that does **not** mean is that a Loki
answered this reader. This round spent sixteen minutes trying to earn the stronger
claim and failed, measurably:

| attempt | outcome |
| --- | --- |
| `apt-cache show loki` | the Ubuntu package of that name is *unrelated* (`2.4.7.4-10`, "MCMC linkage analysis on general pedigrees") |
| `curl -L .../loki-linux-amd64.zip` | **HTTP 302** to `release-assets.githubusercontent.com`, and the transfer *started* |
| six resumptions with `-C -` | **3,112,960 bytes**, then **6,467,584 bytes**, then six consecutive `Failed to connect to github.com port 443 after ~134 s`; the archive never had an end-of-central-directory record and could not be unzipped |

That is the same wall finding 154 hit and it is now measured for a second product, so
it is recorded as a property of this sandbox rather than as a one-off. The reader is
therefore fixture-driven, exactly as the Jaeger reader is, and `docs/architecture.md`
says so in the sentence that separates "reads the documented wire format" from "was
answered by a deployment".

### Verification

| gate | result |
| --- | --- |
| `loki.test.ts` | **33 tests**: the mapping, both unit traps with their controls, every quarantine branch (missing label, off-format label, unreadable timestamp, non-string line, structured metadata, wrong shape) and every network branch (refused connection, silent socket, non-2xx, non-JSON, no `status`, unknown `resultType`) |
| coverage, `src/ingest/loki.ts` | **100 / 100 / 100 / 100** |
| `backend-support.test.ts` | **12 tests**, now driving **three** `implemented` backends over one routed fixture |
| the battery | **32 caught / 0 survived / 0 inert / 0 misattributed** -- 13 new injections against the third reader and the registry row |
| `--verify-expectations --probe` | caught two stale witnesses **before** the run: the test's name in the file was written `caller\'s`, so the plain-substring witness could not match. The test was renamed rather than the witness escaped |
| `check-backend-support.mjs` | **OK (6 backends in the matrix: 3 implemented, 3 unsupported with a reason)** |
| the guards the change tripped | the snapshot test refused the stale `backend-support.json`; `export-surface-enumerated` refused the unregistered module; `docs:check` refused the matrix until it was re-derived |
| `typecheck` / `lint` / `docs:check` / `docs:check:cold` | green |
| core test suite | **136 files, 3539 tests passed**; `cli` 3 files, 173 tests |

### What is not covered

- **No real Loki endpoint was contacted**, and the table above is what it would take.
- **No CLI command.** The reader is reachable through the package entry point and the
  registry, not through `rca-bench` -- the same gap findings 154 and 160 recorded, now
  three readers wide.
- **Three backends remain** (Elasticsearch, ClickHouse, Kubernetes), and each still
  carries a written reason. This finding is evidence that a reason of that shape is
  worth re-reading rather than trusting: the reason's *conclusion* is what turned out
  to be wrong, and nothing in the repository could tell the two halves apart.

### What this says about the method

The registry's reason had no reader, which finding 160 already recorded. This round
went one step further into it: **the half of the reason that was wrong was exactly the
half that named the interface to build.** A reason written from the wire format
documents what the decoder must handle -- which is the specification, not the
objection. The two are indistinguishable while the reason is only ever read for
internal consistency, and telling them apart took writing the decoder.

## Finding 162 — the Open-list guard read the first list, so the second one had no reader

### What happened

Finding 161 appended a second `### Open` section to `docs/progress.md`, and
`scripts/check-open-list.mjs` -- the guard that exists because three entries in that
list had stopped meaning anything -- went on judging **the first one**. Its subject was
located with `lines.findIndex((line) => line.trim() === heading)`, which finds the first
match and stops.

The symptom is the campaign's shape one level out. The guard printed:

```
check-open-list: OK (5 entry(ies) in docs/progress.md: 3 open with a reason, 2 closed by a finding)
```

The same five entries it had printed the round before. Nothing in the output said a
second list existed, and the new section -- written by the same pass that was fixing a
claim-with-no-reader -- was itself read by nothing. The first residual list has a reader
and the second had none, and the number that would have shown it was an entry count
that had not moved.

### The fixture that makes the two halves different

| document | old guard | new guard |
| --- | --- | --- |
| one section, clean | rc=0 | rc=0 |
| one section, an entry that says neither | rc=1 | rc=1 |
| **first section clean, second section has an entry that says neither** | **rc=0** | **rc=1** |
| **first section clean, second section has a placeholder reason** | **rc=0** | **rc=1** |
| **a section that exists and says nothing** | **rc=0** | **rc=1** |

### The fix, and the two decisions in it

1. **Every section with that heading is read**, and the print now carries the section
   count beside the entry count -- `6 entry(ies) across 2 section(s)`. A document that
   gains a list cannot do it silently, because the number of lists is part of the
   evidence rather than an assumption the guard makes about the document.
2. **Reason uniqueness is document-wide.** The second list is usually written by
   copying the first one's shape, so a sentence shared between two sections is the
   cheapest thing to leave behind, and a per-section map cannot see it.

`--doc <path>` was added for the fixtures. The file previously argued against an
injection point -- *"adding one to make it testable would change the thing under test"*
-- and that argument was right for the *judges* (which the test file drives by
re-implementing two regexes) and wrong for the *subject*: **which sections are read is
not a predicate**. No copy of the regexes can answer it, which is why the defect
survived a test file that already had seven tests.

### Verification

| gate | result |
| --- | --- |
| `check-open-list.test.ts` | **13 tests** (7 before): six new fixtures, all red against the old guard and green against the new one |
| the shipped document | `check-open-list: OK (6 entry(ies) across 2 section(s) of docs/progress.md: 4 open with a reason, 2 closed by a finding)` |
| `derive-gate-sites` | the site moved 158 -> 211 and lost its `status`/`provedBy`, as a line shift always does; re-signed by hand to `proved` by this test file, and the table is back to **50 of 50 proved** |
| the guard against itself | while the section list is read with `sections()`, a document with no heading at all still fails with "the list this guard reads is gone" -- the new scan returns an empty array rather than `null`, and the branch that catches it is pinned |

### What this says about the method

A guard whose subject is "the document" rather than "the part of it I found first" is
the same distinction as finding 153's, one level up. The three stale entries that
motivated this guard were claims with no reader; the guard itself then read one list out
of two. **The failure mode is not that a reader stops working -- it is that it keeps
working on something that is no longer the subject.**

## Finding 163 — two batteries ignored the reconciliation mode, so asking them to check ran them

### How it was found, and what it looked like from outside

Finding 161's pass ended with a `--verify-expectations` sweep over every battery --
the cheap local check that a renamed test has not turned a `CAUGHT` into a
`MISATTRIBUTED`. The sweep was run beside a full `test:coverage` run, and that run
came back with two red tests, neither of which it should have touched:

```
FAIL  test/check-doc-counts.test.ts > passes against the shipped document ...
FAIL  test/check-doc-counts.test.ts > leaves a bare test count alone when the row names no scope
```

Both tests spawn `scripts/check-doc-counts.mjs`. Both passed in isolation. Neither
reproduced. The second full run was green, and so was a third.

### The cause

Two of the six batteries in `scripts/injection/` did not implement
`--verify-expectations`:

| battery | what `--verify-expectations` did |
| --- | --- |
| `gate-tests-battery.py`, `fault-extraction-scoring.py`, `fetch-official-retry.py`, `fault-extraction-workflow.py` | reconciled the witness table and exited -- **54 to 120 ms** |
| `doc-counts-shapes.py` | **ignored the flag** and ran all twelve injections -- **16.7 s** |
| `roundtrip-record.py` | **ignored the flag** and ran all twenty-five injections -- **34.6 s** |

Their `__main__` blocks called `main()` unconditionally, so the mode that exists to be
cheap was, for those two, the most expensive thing they can do -- and every one of
those injections rewrites a tracked gate script (`check-doc-counts.mjs`,
`check-roundtrip-record.mjs`) while a suite that spawns the same scripts is running.
That is the interference the two red tests were seeing: a test that spawns a guard
observed a mutated guard, and the failure read as a defect in the guard.

The evidence that pins it is in the tree rather than in a log: the mtimes of
`scripts/check-doc-counts.mjs` and `scripts/check-roundtrip-record.mjs` moved during
the sweep even though neither file is modified in `git status`, which is what a
mutation-and-restore leaves behind.

### Why the existing guards did not catch it

`battery-witnesses.test.ts` drove the **four** batteries that implement the mode, and
its list of batteries was hand-written -- so the two that did not implement it were
absent from the list *and* from the subject. The list was the exemption, and the
exemption was invisible because a missing entry reads exactly like a battery that has
nothing to check.

### The fix

1. `--verify-expectations [--probe]` implemented in both batteries, delegating to
   `_witnesses.verify_witness_table` -- the same reconciliation the other four run.
   Their witness is the one each mutation row already declares as its fourth field,
   so the table is derived rather than copied: what the reconciliation adds is the
   check that the *test file* still contains that title, which is the rename trap.
2. `battery-witnesses.test.ts` now walks `scripts/injection/` instead of reading a
   hand list, and requires every battery to either implement the mode or be recorded
   in `NO_WITNESS_TABLE` with its own reason. The exemption's scope is measured in
   both directions: an excused battery must **not** mention the runner (a witness is
   a substring of the runner's failing-test lines, so there is nothing to reconcile),
   and a battery that is not excused must mention it. The three standalone probes
   (`m1-ceiling-probe`, `scorer-stability-probe`, `type-miss-probe`) are excused on
   that measured ground, each with its own sentence, and an exemption left behind
   after a battery gains the mode fails as stale.

### Verification

| gate | result |
| --- | --- |
| the reconciliation, before | `doc-counts-shapes` **16.7 s**, `roundtrip-record` **34.6 s**, and both reported the wrong thing |
| the reconciliation, after | `doc-counts-shapes: OK (12 witness(es) across 12 injection(s), with the comparator probed)` in **63 ms**; `roundtrip-record: OK (25 witness(es) across 25 injection(s), with the comparator probed)` in **132 ms** |
| `battery-witnesses.test.ts` | **16 tests** (14 before): the six reconciliations, the directory walk, both directions of the exemption, and the reason rules |
| the red it produced first | the new assertion failed with both file names before the two modes existed, and the two `it.each` rows failed with durations that are the defect in numbers |
| `git status` after the fix | neither gate script is modified, and a full suite run beside a sweep is green |

### What this says about the method

The mode was added in finding 157 for a reason that had nothing to do with cost: a
witness that has been renamed away fails *silently* at run time, and the fix was to
make the check a mode a test can drive. Four batteries adopted it. The two that did
not kept passing every guard in the repository, because the only thing that could
have noticed was a list of batteries -- and the list was written by hand, once, by
the pass that added the fourth.

**A mode that silently does something else is worse than a mode that is missing.**
The missing one errors; the one that runs twenty-five mutations looks, from outside,
exactly like the one that ran for a tenth of a second. The only difference is a
duration nobody reads -- and, on this occasion, a red test in an unrelated file.

## Finding 164 — the second reason whose last clause was the interface, and a declaration the reason did not know it needed

### What the registry said

The `elasticsearch` row carried this reason:

> Elasticsearch returns hits under dynamic mappings, so the timestamp field, the
> message field and the service field are per-index decisions: the same query against
> two clusters yields two shapes, and a reader would need a field mapping supplied by
> the caller before it could read anything at all

Every clause is true, and the last one is the finding 161 shape exactly: "a mapping
supplied by the caller" is a statement about the interface, so the mapping is a
required argument with no defaults and there is nothing to guess.

**But the reason was also incomplete**, and that is the new part. Three field *names*
are not enough to read a document: Elasticsearch writes a `date` field as an ISO-8601
string or as epoch milliseconds depending on that field's own `format`, so the same
three names arrive in two shapes and a reader that sniffed the JSON type would be
reading two index configurations as one. The declaration therefore carries a fourth
decision -- the encoding -- which the reason did not mention at all.

### What the caller has to decide, and why none of it can be defaulted

| the caller's decision | why it cannot be defaulted |
| --- | --- |
| which field holds the timestamp, the message and the service | a per-index decision, which is what the reason said |
| **which serialisation the timestamp field uses** | it is a second per-index decision the reason did not name; two configurations that write the same field names stay two configurations |
| the index | it is the first path segment, and an empty one means every index in the cluster |
| the size | Elasticsearch's own default is 10 hits, so a reader that left it out would receive a silently truncated page |
| the sort direction | with a size limit it decides which end of the window survives |

The window is built from the declaration: a `range` filter on the field the caller
named as the timestamp, **with the format sent alongside the bounds**, ANDed with the
caller's own query (`bool.filter` for the window, `bool.must` for the query). The
format string travels with the request because a `date` field is parsed with the format
its mapping declares, and the caller is the one who knows it.

### What it refuses to do, and the one place it differs from Loki

| decision | why |
| --- | --- |
| the document is **not** copied into `resource` | a Loki stream's label set is required to be low-cardinality identity, which is what `resource` records; a `_source` is a document, and its fields are as likely to be payload as identity. Copying them in would invent a convention per index, which is the defect the reason was about |
| no severity | there is no convention for the field's name (`level`, `severity`, `log.level`) and the values are not the vocabulary the IR carries |
| no pagination | it reads one page and reports the count **with its relation**: `gte` is Elasticsearch saying "at least this many", and a value without its relation presents an approximation as a measurement |
| `size` is not bounded | the real upper bound is a per-index setting (`index.max_result_window`) this module cannot read, so a value above it is refused by the cluster and reported with its status |
| a partial answer is reported as partial | `timed_out` and a failed shard are the two ways a search answers without finishing; the hits that arrived are still signals |

### The claim, and its honest limit

Nothing in this repository has contacted an Elasticsearch cluster, and this round
measured what it would take:

| attempt | outcome |
| --- | --- |
| `apt-cache policy elasticsearch` | **not in the archive**; only `elasticsearch-curator` and Go clients are |
| `github.com/elastic/elasticsearch/releases` | the releases carry no binaries |
| `artifacts.elastic.co` | **HTTP 200** -- the endpoint the tarball lives on *is* reachable |
| the tarball itself | **1,549,450 of 327,031,293 bytes** in 35 s at **44,269 B/s**, which is **two hours** for the file |

So the difference from the Loki round is recorded rather than rounded off: Loki's
artifact could not be transferred at all, and this one can be but not in a session.
The reader is fixture-driven, `docs/architecture.md` says which of the four readers has
been answered by a deployment (Prometheus, finding 154), and neither the registry's
summary nor the matrix claims more.

### Verification

| gate | result |
| --- | --- |
| `elasticsearch.test.ts` | **39 tests**: the mapping, the declaration's four decisions, the request the reader sends, both timestamp encodings *and the refusal of the undeclared one*, every quarantine branch (no `_source`, missing/empty service, unreadable timestamp, non-string message, truncated record) and every network and envelope branch (refused connection, silent socket, non-2xx, non-JSON, non-object body, error object, no `hits`, `hits` not a list, both `total` serialisations, an unreadable total) |
| coverage, `src/ingest/elasticsearch.ts` | **100 / 100 / 100 / 100** |
| `backend-support.test.ts` | **13 tests**, driving **four** `implemented` backends through one routed fixture |
| the battery | **44 caught / 0 survived / 0 inert / 0 misattributed** -- 12 new injections, including "sniff the timestamp's JSON type", "send the window in seconds" and "read an approximate total as an exact one" |
| `check-backend-support.mjs` | **OK (6 backends in the matrix: 4 implemented, 2 unsupported with a reason)** |
| the guards the change tripped | the snapshot test refused the stale `backend-support.json`; `export-surface-enumerated` refused the unregistered module; `check-backend-support` refused the matrix until it was re-derived |
| core test suite | **136 files, 3589 tests passed**; `cli` 3 files, 173 tests |

### What is not covered

- **No real cluster was contacted**, and the table above is the measurement.
- **No CLI command.** The reader is reachable through the package entry point and the
  registry, not through `rca-bench` -- the same gap findings 154, 160 and 161 recorded,
  now four readers wide.
- **Two backends remain** (ClickHouse, the Kubernetes API), each with a written reason.

### What this says about the method

Two of the four implemented readers were declared impossible for a reason whose last
clause was **the interface**: "the caller must name the label" (Loki) and "a mapping
supplied by the caller" (Elasticsearch). Both were written as objections and both read
as specifications. That is now a pattern rather than an anecdote, and it gives the next
two rows a reading rule:

> **when a reason ends in "the caller would have to supply X", X is the interface, not
> the obstacle.**

This round also produced the case the rule does not cover: Elasticsearch's reason was
not only misread, it was **incomplete**. It named the three fields and not the encoding,
and writing the decoder is what surfaced the fourth decision. A rule for reading reasons
can only find what the reason mentions; what it omits is found by writing the thing.

### A record defect this round made, and how it was found

The first push of the Chinese documents carried **the previous round's commit** on the
command line while the local `HEAD` was the new one. The push tool printed
`10 file(s), 0 changed` -- and moved the remote ref anyway, so a tree that had not
changed acquired a new commit and this round's documents were still not on the remote.

The tool was not at fault: it said `0 changed` on the same line. **The mistake was reading
that the ref moved and not reading whether anything changed.** What found it was reading
the *remote content* -- fetching `09-推进进度追踪.md` through the API and looking for this
round's heading, which was absent -- rather than reading the push's own summary.

Two lessons, both recorded in the Chinese tracking document as well:

1. **The changed count is the conclusion; the ref move is only the action.** A push
   cannot be reported as delivered on the strength of the second one.
2. The tool rebuilds onto the remote tip when the local parent does not match, and prints
   that as a *note* rather than an error. That tolerance is what turned a stale SHA into a
   successful push of an unchanged tree: where a tool is forgiving about the parent, the
   SHA has to come from the round's own variable rather than from memory.

## Finding 165 — the third reason whose clauses were the interface, and the clause that was not needed at all

### What the registry said

The `kubernetes` row carried this reason:

> the Kubernetes API needs credentials that are not available to the ingest path -- an
> in-cluster service-account token or a kubeconfig -- and its events use the
> involvedObject vocabulary rather than the OTel resource attributes the IR is built on,
> so the reader would also need a translation table

Two things the caller would supply, and by the reading rule finding 164 wrote down, two
candidates for being the interface rather than the obstacle. They turned out to be
different in kind.

**The credentials are an interface.** `token` is a required argument with no default: the
reader takes a bearer token from its caller rather than reading one from the environment,
a mounted service-account directory or a kubeconfig. That is what the other four pullers
do about credentials, which is to have none of their own.

**The translation table is not needed at all.** The IR's `EventPayload` carries `reason`,
`message`, `type`, `count` and **`involvedObject: { kind, name }`** -- the interface was
built with Kubernetes events in mind, down to the shape of the field the reason named. So
the reader has no translation to perform: it reads the fields the API wrote into the
fields the IR defines, one for one.

### The clause that survives, and what it actually says

An event about a Pod does not name a service, and the IR requires one
(`service.name` is `min(1)`). Turning `involvedObject.name` into a service name is a
per-cluster convention -- a ReplicaSet hash suffix, a label, a naming scheme, or none of
those -- so `service` is a required argument: the caller says **which service they are
asking about**. The object itself is recorded where the IR records objects, in the
payload's `involvedObject`, so one wire fact has one representation and the resource stays
what the schema says it is.

### The decisions the wire format forced

| wire fact | what the reader does with it |
| --- | --- |
| `core/v1` defines **three** fields for an event's own time (`eventTime`, `firstTimestamp`, `lastTimestamp`) | `timestampField` is required, because `lastTimestamp` answers "when did this last happen" and `firstTimestamp` "when did it start" -- different answers on an event whose `count` is above one. `metadata.creationTimestamp` is deliberately not offered: it is when the Event object was written |
| an unset timestamp is written as **`null`** | quarantined, with the declaration named: reading a null as the epoch would place the event in 1970 |
| `type` is a closed pair (`Normal`, `Warning`) | carried into the payload; a third value is quarantined rather than defaulted, because the IR cannot hold it |
| `count` is absent on a single occurrence | absent stays absent -- one would be filling in a field the backend did not write |
| the list has **no time filter** | the reader does not pretend to have one: a window is applied to the entries it read, the excluded entries are **counted** in `page.outsideWindow`, and `page.resourceVersion`/`hasMore` describe the page rather than the window |
| `limit` has **no default** | required, and for the opposite reason to the other four backends: an absent `limit` asks for every matching event in the cluster, so the hazard is an unbounded response rather than a truncated one |
| a refusal is answered with a **`Status` object** | `kind` is checked before `items` is read, so a refused request is not reported as an empty window |
| `reason` is free text (`ScalingReplicaSet`, `Pulled`, `Killing`) | `changeType` is never set: mapping those strings onto deploy/config/scale/rollback is a per-cluster vocabulary |

### The claim, and its honest limit

Nothing in this repository has contacted a Kubernetes API server, and this round measured
what it would take:

| attempt | outcome |
| --- | --- |
| the API server binary | it is not distributed: `kube-apiserver` comes with a control plane, which is a container image and an etcd |
| a local cluster | `kind` and `minikube` are both container-based, and this sandbox has no container runtime |
| a single static binary | `kubectl` is one, but it is a *client*: it needs a cluster to talk to, which is the thing being measured |

So the reader is fixture-driven, and unlike the Elasticsearch round there is no artifact
that *would* have served: the thing that answers this protocol is a control plane, not a
download. That difference is stated rather than rounded into "no cluster was available".

### Verification

| gate | result |
| --- | --- |
| `kubernetes.test.ts` | **37 tests**: the mapping onto the IR's own event vocabulary, the request (path, limit, field selector, token), all three timestamp fields and the null, every quarantine branch (no involved object, no reason, non-string message, off-vocabulary type, bad count, unreadable timestamp, non-object item) and every envelope and network branch (Status, no items, no resource version, non-JSON, non-object, non-2xx, refused connection, silent socket) |
| coverage, `src/ingest/kubernetes.ts` | **100 / 100 / 100 / 100** |
| `backend-support.test.ts` | **14 tests**, driving **five** `implemented` backends through one routed fixture |
| the battery | **59 caught / 0 survived / 0 inert / 0 misattributed** -- 15 new injections, including "reach the API with no credentials", "read a Status as an empty window" and "classify the change type from the reason string" |
| `check-backend-support.mjs` | **OK (6 backends in the matrix: 5 implemented, 1 unsupported with a reason)** |
| the guards the change tripped | the snapshot test refused the stale `backend-support.json`; `export-surface-enumerated` refused the unregistered module; `check-backend-support` refused the matrix until it was re-derived |
| core test suite | **138 files, 3637 tests passed**; `cli` 3 files, 173 tests |

### What is not covered

- **No cluster was contacted**, and the table above is the measurement.
- **No CLI command.** The reader is reachable through the package entry point and the
  registry, not through `rca-bench` -- the same gap findings 154, 160, 161, 164 and this one
  record, now five readers wide.
- **One backend remains** (ClickHouse), and it is the first reason in the set that may
  survive being read: it names a schema this project does not own rather than something a
  caller would supply.

### What this says about the method

Three of the five implemented readers were declared impossible for reasons whose clauses
were the interface. That rule is now doing work -- it is what predicted that this row's
credentials would be an argument -- and this round is the first place it was **not
enough**. Applying it to "a translation table" would have produced a required
`translation` argument: a caller-supplied mapping from `involvedObject` to OTel resource
attributes. That would have been worse than useless, because the IR already had the
vocabulary, and the only way to see it was to open `ir/types.ts` and read the payload the
reason was about.

> **A reason's clause can be an interface, and can also be answered by the schema already
> in the tree.** The rule says where to look for the interface; reading the IR says
> whether one is needed.

## Finding 166 — the job's wall-clock budget was spent, and the run said "cancelled"

### What happened

The push of finding 165's work was reported by CI as:

```
38598558037  CI  cancelled
38598558089  Anchor round trip  success
```

`cancelled` is what GitHub reports when a job is stopped by its own
`timeout-minutes`, and the steps after the one that ran when the budget expired are
`skipped`. The run's last live step was the round-trip record battery; eight steps never
started. Nothing failed: **the budget was spent.**

The numbers, read from the API rather than estimated:

| run | commit | job | wall clock | steps summed |
| --- | --- | --- | --- | --- |
| 38583708998 | 5dcabae61 | verify | **845 s** (14.1 min) | 845 s |
| 38598558037 | 637d11494 | verify | **1213 s** (20.2 min, killed) | 1092 s before the kill |

And inside it, the growth this round caused:

| step | 5dcabae61 | 637d11494 |
| --- | --- | --- |
| type-miss probe battery | 249 s | **413 s** |
| backend-support battery | 178 s | **276 s** |
| gate-test battery | 86 s | 119 s |
| every gate can be shown to fail | 37 s | 61 s |
| test with coverage | 50 s | 77 s |
| the batteries, all told | 746 s | 1092 s |

Two readers' worth of tests (Elasticsearch, Kubernetes) are paid for by *every* injection
in *every* battery, because each injection re-runs a test file. The job had been inside
its budget by **three minutes** before this round and outside it by twenty seconds
during it.

### Why this is a defect and not a slow runner

Three reasons, and the third is the one worth keeping:

1. **A budget that is not measured is a guess that expires.** `timeout-minutes: 20` was
   presumably true when it was written; nothing reads the run's own step timings, so
   nothing says when it stops being true. The failure arrived as a red run rather than as
   a number approaching a limit.
2. **The margin was three minutes on a shared runner whose slow step varies by 66%**
   (type-miss probe: 249 s to 413 s for the same workflow). A budget inside one standard
   deviation of the work is not a budget.
3. **`cancelled` reads like a person, not like a limit.** The run name says CI was
   cancelled, and the conclusion carries no hint that eight steps were never attempted.
   This is finding 116's family -- a report that does not say what actually happened --
   arriving through the runner's own vocabulary this time.

### The fix, sized by the measurements

The job was split into three whose clocks run **beside** each other, so the workflow's wall
clock is bounded by its slowest job rather than by the sum of its steps:

| job | what it carries | steps measured | budget |
| --- | --- | --- | --- |
| `verify` | build, typecheck, lint, coverage, mutation suite | ~60 s | 15 min |
| `batteries` | the fourteen injection batteries and the report | 746-1092 s | 30 min |
| `artefacts` | golden master, official metric, examples, documents | 16 s | 15 min |
| `cold-tree` | unchanged | 30 s | 20 min |

The budgets are not performance assertions: they exist so that a hang is reported as a
budget rather than six hours later. And they are *readable* -- the workflow carries the
measurements that produced them, so the next round has a number to compare against
instead of a number to guess at.

### The guards, and the one they replaced

`cold-tree-job.test.ts` already had a register of "jobs that run the suite", checked in
both directions against a scan for the word `vitest` in a job's body. The new `batteries`
job breaks that scan -- its steps name battery scripts, and the word lives inside them --
so the scan now reads the job's body **and the scripts its steps name**, one level deep.
The register can stay an equality instead of growing a hand-written exception, which is
the same choice finding 165's rule would have got wrong one level up.

Three assertions were added:

| assertion | what it refuses |
| --- | --- |
| every job declares a `timeout-minutes` | a job that inherits GitHub's six-hour default, which is this failure with a longer fuse |
| the batteries job has the largest budget | a future edit that moves a battery into `verify` without moving the budget with it |
| every non-setup command in the batteries job names a script under `scripts/` | the job becoming a second copy of `verify` with its own budget |

Negative control, run in the tree: with the pre-split workflow restored, **four** of these
assertions fail (the register in both directions, the largest-budget ordering, the
batteries job's character, and the shell rule for a registered job that does not exist);
with the split, fifteen of fifteen pass. The check is discriminating rather than merely
quiet.

### Verification

| gate | result |
| --- | --- |
| `cold-tree-job.test.ts` | **15 tests** (12 before); the register now covers three jobs and the scan reads one level into the scripts |
| core test suite | **138 files, 3637 tests passed**; `cli` 3 files, 173 tests |
| `typecheck` / `lint` / `docs:check` / `docs:check:cold` / `docs:counts:check` | green |
| the workflow itself | three jobs in parallel, every step preserved, every command and comment unchanged except for the two that moved |
| the CI run for this commit | the two `verify`-class jobs and `batteries` run at once; the wall clock is bounded by `batteries` |

### What this says about the method

Every guard in this repository reads something in the tree, and the CI budget was the one
number that described the *run* rather than the *tree*. So it decayed the way the
campaign's first finding described -- a number nobody re-takes -- with the twist that the
report of its decay was the word `cancelled`.

> **A budget is a measurement too.** It needs a number from the thing it describes, a
> margin wider than the thing's own variance, and a failure mode that says "the budget was
> spent" rather than "somebody stopped this".

## Finding 167 — the last reason was an argument, and the wire was able to witness for the caller

### The shape of this one, which was not the shape of the other five

The `clickhouse` row carried the only reason in the registry that argues rather than
describes:

> the ClickHouse HTTP interface executes a SQL statement the caller writes and returns it in
> whichever format was asked for, so supporting it means either fixing a schema this project
> does not own or accepting arbitrary SQL -- the second of which would make the ingest path
> untyped

Both horns are real. Fixing a schema this project does not own is out of the question, and an
ingest path that emits whatever a statement returns is not typed. Findings 161, 164 and 165
had each found a clause that was *the interface*; the reading rule they produced -- "when a
reason ends in 'the caller would have to supply X', X is the interface" -- has no purchase
here, because this reason does not name anything a caller would supply. It names a
contradiction. And it was the last row.

The third option is that **this backend types the result it returns**. The `JSON` format
answers with a `meta` block carrying every column's own type:

```json
{"meta":[{"name":"ts","type":"DateTime64(3)"},
         {"name":"service_name","type":"LowCardinality(String)"},
         {"name":"body","type":"String"}],
 "data":[{"ts":"2023-11-14T14:13:20.123Z","service_name":"checkout","body":"..."}],
 "rows":1,
 "statistics":{"elapsed":0.0012,"rows_read":2,"bytes_read":136}}
```

So an arbitrary statement does not produce an arbitrary shape. The caller declares which
columns hold the timestamp, the message and the service; the reader **checks that declaration
against the backend's typing** before a row is read. That is what the six readers before this
one could not do: `serviceLabel`, `timestampFormat` and `timestampField` were the caller's
word alone, and nothing in the repository could contradict them.

### A real ClickHouse, for the second time in this series

Unlike the four rounds before it, this one did not have to write "no deployment answered
this". The measurement is short because the binary was reachable:

| step | outcome |
| --- | --- |
| `apt-cache policy clickhouse-server` | a real package, `18.16.1+ds-7.4build2`, from the distribution archive |
| `packages.clickhouse.com/tgz/stable/...24.3.4.147-amd64.tgz` | **HTTP 200**, and the whole 253,570,044 bytes in **18.7 s at 13.5 MB/s** |
| the extracted static binary | `ClickHouse local version 24.3.4.147 (official build)` |
| a hand-written two-file config | the server answered on `127.0.0.1:8123` within a second |

This is the *opposite* of the Loki and Elasticsearch rounds, where the artifact could not be
transferred at all or arrived at 44 KB/s, and it is worth being precise about why: those two
sat behind `release-assets.githubusercontent.com` and a 327 MB tarball, and this one sits
behind a CDN that answered at 13.5 MB/s. The wall is per-artifact, not per-sandbox -- a
correction to finding 161's conclusion, which generalised from two failures to "this
sandbox".

Every fixture in `test/clickhouse.test.ts` is a copy of what that server sent, and the
reader was then driven against it directly. The check that matters:

| the reader says | the server says | agree |
| --- | --- | --- |
| `ts = DateTime64(3)` → `2023-11-14T14:13:20.123Z` | `toUnixTimestamp64Milli(ts)` → `1699971200123` → `2023-11-14T14:13:20.123Z` | **yes** |

### Four wire facts that changed the design, and one that only changed a comment

| measured | consequence |
| --- | --- |
| a rejected statement answers **HTTP 404** with `{"meta":[],"data":[],"rows":0,"exception":"Code: 47. DB::Exception: …"}` | **a failure is shaped exactly like an empty window.** `exception` is read before `data`, and a non-2xx is only the second opinion |
| `DateTime64(3)` renders as `2023-11-14 22:13:20.123` -- no `T`, no offset, no zone | the reader sends `date_time_output_format=iso`, which renders `2023-11-14T14:13:20.123Z`, and **quarantines anything it cannot place** rather than assuming a zone |
| `session_timezone=UTC` changes `timezone()` **and the `X-ClickHouse-Timezone` response header**, and does **not** change that rendering | **the header is not the authority.** Trusting it would place a row **eight hours** from where it belongs, on this very server |
| an explicit `FORMAT` in the statement wins over `default_format` | a body that is not the JSON object is a **named diagnosis** ("a FORMAT clause inside the statement overrides the default_format=JSON this reader sends") rather than a parse error |
| 64-bit integers arrive **quoted**: `"1699971200123"`, `"9007199254740993"` | the value may be a string, and reading it through `Number` **undoes the backend's own protection** -- which is why the backend quotes it |
| `max_result_rows=1&result_overflow_mode=break` against `numbers(5)` returned **all five rows** | the reader cannot bound the query, so it bounds what it **emits** and reports `page.truncated` -- and the code says the measurement rather than the intent |
| `CAST(1700000000.5 AS Float32)` arrives as **`1700000000`** | a `Float32` timestamp is **refused**: the spacing of a Float32 at epoch-second magnitude is **128 seconds** |
| under `iso`, `Date` renders as `2023-11-14` | a `Date` column is **refused**: a calendar day has no time of day to place a row at |
| `rows_before_limit_at_least: 2` appears when the statement carries `LIMIT 1` | the count is reported **with its relation**, as `page.atLeast` |

The last two refusals are not pedantry and the numbers are the reason: an RCA engine reads a
timestamp as ground truth, and both of these would put rows minutes or hours away while
looking perfectly well-formed.

### Two traps the measurement caught in my own work

1. **I reproduced the empty-window trap by accident.** While probing for the instant of a
   row, a script of mine ran `toUnixTimestamp64Milli(ts)` in a statement that also used a
   function this server does not have. The response was a well-formed envelope with
   `data: []`, and my `for row in response['data']` printed **nothing at all** -- a failure
   rendered as a quiet, empty answer. That is the defect the reader now refuses, and it took
   about ninety seconds to happen to me while writing the reader that refuses it.
2. **The mutation battery found a guess inside the reader.** Four arms were unreachable --
   `unit ?? 'milliseconds'` in each numeric path -- because `classifyTimestamp` had already
   refused every type that could leave the unit undefined. A default that can never be taken
   is not a default; it is a claim about a case that cannot arise, and this one claimed
   `milliseconds`, which is exactly the guess the reader exists to refuse. The unit now
   lives **inside** the reading (`{kind:'integer', unit}`), so the invariant is the
   compiler's rather than a fallback's, and the module reached 100% on all four dimensions
   with no `v8 ignore`.

The battery on this round is **83 injections, 0 survived, 0 inert, 0 misattributed** -- 24 of
them new, each anchored on a decision that only exists because a real server was measured.

### The registry now has no unsupported rows, and says so

| gate | result |
| --- | --- |
| `check-backend-support.mjs` | **OK (6 backends: 6 implemented, 0 unsupported)** |
| `backend-support.test.ts` | **15 tests**, now driving **six** `implemented` backends through one routed fixture (the ClickHouse route is chosen by the *statement*, because its endpoint is the root) |
| the two unsupported rules | replaced by a **pairing** rule -- `implemented` must carry no `reason`, `unsupported` must carry a reason of substance and no `entry` -- plus a line that **pins the unsupported set to empty**. An empty set read off a list is indistinguishable from a list nobody filled in, so the state is asserted rather than inferred: flipping a row back costs a deliberate edit and a reason |

### Verification

| gate | result |
| --- | --- |
| `clickhouse.test.ts` | **42 tests**: the request, both settings pinned, the credentials-in-headers rule, the timezone guard with its control, the unit arithmetic with the double's reading beside it, every quarantine branch, every envelope branch, every refused type, and the truncation |
| coverage, `src/ingest/clickhouse.ts` | **100 / 100 / 100 / 100** |
| the battery | **83 caught / 0 survived / 0 inert / 0 misattributed** (24 new injections) |
| `check-backend-support.mjs` | **OK (6 backends in the matrix: 6 implemented, 0 unsupported with a reason)** |
| driven against a real server | a `ClickHouse 24.3.4.147` on `127.0.0.1:8123`: the mapping, the epoch path, the failure-as-empty-window case, the FORMAT diagnosis, the `Date`/`String`/`Float32` refusals and `atLeast` all exercised, and the instants checked against `toUnixTimestamp64Milli` |
| the guards the change tripped | the snapshot test refused the stale `backend-support.json`; `export-surface-enumerated` refused the unregistered module; `check-backend-support` refused the matrix -- twice, first for a stale row and then for a duplicate one |
| core test suite | **139 files, 3683 tests passed**; `cli` 3 files, 173 tests; repo 142 files, 3856 tests |
| coverage, whole tree | core **99.97 / 99.93 / 100 / 99.97**; `cli` **100 / 100 / 100 / 100** |
| `docs:check` / `docs:check:cold` / `typecheck` / `lint` | green |

### What is not covered

- **No CLI command.** The reader is reachable through the package entry point and the
  registry, not through `rca-bench` -- the same gap findings 154, 160, 161, 164, 165 and this
  one record, now six readers wide. It is the largest remaining asymmetry in P1-5.
- **The statement is not validated.** The reader does not parse SQL: it cannot tell a
  `SELECT` from a `DROP`, and it relies on the account it is given being read-only. That is
  stated in the module rather than implied, and it is the one place where "the caller writes
  the statement" still costs something.

### The interference finding 163 described, reproduced this round by accident

The core suite was run **beside** this battery, and it came back with two red `loki.test.ts`
tests -- both exact-string assertions on an error message, in a file this round never touched,
neither of them reproducing in isolation. The cause is not in the reader: the battery carries
**12 injections whose subject is `loki.ts`**, so a suite running beside it imports a
**mutated** module, and `git status` looks clean by the time anybody asks because the battery
has already restored the file. The evidence left on disk mid-run was
`packages/core/src/ingest/kubernetes.ts` showing as modified while the run was in flight --
the same mtime-and-content trace finding 163 used.

Finding 163 recorded this shape for a battery that rewrote a *gate script another test
spawns*. This is the same shape one step further in: a battery rewriting **any source file
another test imports** is the same interference, and the misleading symptom is the same -- a
failure in a file nobody touched, which does not reproduce. The remedy is a process one rather
than a code one, and it belongs here rather than in a comment:

> **Do not run a mutation battery and a test suite at the same time.** When a red test appears
> in a file the round did not touch, the first hypothesis is the battery rather than the file.

**And the same round repeated finding 158.** A patch that rebuilt the battery's injection table
sliced from the first new entry to the closing bracket and wrote `head + new_body` -- which
dropped everything after the bracket, including `def main()` and the `__main__` block. Running
the script then did **nothing at all and exited 0**, and `--verify-expectations` printed
nothing and exited 0 too, so the check that exists to catch a stale table reported success by
not running. The signature was the duration: **174 ms**, against the 325 s the battery takes
when it actually runs.

Finding 158 recorded this exact defect for `gate-tests-battery.py` -- a patch that inserted a
function after `def main()`, making the body dead code. It was found then because nine
injections finished instantly; it was found now because twelve seconds of expected work
finished in a sixth of a second. **The lesson is not "be careful with patches" but that the
only thing which caught it, twice, was the runtime of the thing being run** -- and neither
time by any of the repository's fifty gate sites, because a script that does nothing passes
every gate that reads it as text.

### What this says about the method

Six reasons, six rows, and the last one was not a mistake at all -- it was a genuine dilemma
whose second horn was answered by a fact about the wire that the reason had not been written
to include. The reading rule the earlier rounds produced found the interface in three of them
and was wrong about the fourth (Kubernetes' translation table was already in the IR) and has
nothing to say about this one.

> **A reason can be true, its dilemma can be real, and the wire can still offer a third
> option.** Two of the six reasons here were misread, one named a decision that was not
> needed, and one was a real argument against a design nobody had proposed. The only thing
> that told them apart was building the reader, and the only thing that made this one
> checkable was pointing it at a server.

The other correction worth carrying forward is about evidence rather than reasoning: finding
161 concluded from two failed downloads that the sandbox walls off release artifacts. This
round pulled 253 MB in nineteen seconds from a different host. **A wall measured on two
artifacts is a wall on those two artifacts.**
\n

## Finding 168 — the guard that read the document where it said "section", and the three drifts that had been living there

### What the guard claimed, and what it read

`scripts/check-cli-reference.mjs` opens with:

> Two independent drifts are possible, and this catches both: ... 2. A command whose
> `--help` output and whose reference **section** disagree about the flag set.

The second half of that was false, in two ways at once, and both were measured before
anything was changed:

| what was written | what the gate said |
| --- | --- |
| a flag **no command accepts** (`--not-a-real-flag`), added to the `pack` section | **PASSED** |
| `--lead-ms` deleted from the `ingest` section and written under `pack` instead | **PASSED** |

The cause is one line: `mentionsFlag(markdown, flag)` searched the **whole document**. So a
flag satisfied the command that advertises it as long as the name appeared *somewhere*, and
nothing at all checked the other direction -- every test ran from the help text towards the
document, so a document that invented a flag, or kept one after it was removed from the
binary, was never contradicted.

That is finding 162's defect one level down (a guard reading the first of two lists), and
finding 153's (a shape face that is not closed), in the place where it costs a reader
most: **the flag list is the part of a reference a reader actually types.**

### The fix, and the three drifts it immediately found

Flags are now compared **within each command's own section**, in both directions: every flag
the help advertises must be written in that command's section, and every flag written there
must be one the command accepts. Sections are bounded the way finding 162 established -- from
their `### rca-bench X` heading to the next heading at the same or a higher level.

The stricter rule did not pass the shipped document. It found **eight** disagreements, and
they are three different things:

| finding | what was wrong |
| --- | --- |
| `--output` written in the `export` section | **`rca-bench export` does not accept it.** Measured: `rca-bench export --output z` answers `error: Unknown option '--output'`. The reference told a reader to type a flag the command rejects, in the sentence explaining where the skip warning is printed. It is `--out-dir`. |
| `ingest`'s section named `--layout` and `--anchors` as if they were its own | they belong to `source` and `score`; the sentence was making a point about a **convention**, and named two other commands' flags to do it. Now it names the commands. |
| `---` reported as a flag under `official` | the rule, not the document: a Markdown table's separator row is `\| --- \|`. Narrowed to `--` followed by a lowercase letter, so a flag still has to start with a word. |

Six of the eight are one defect wearing a single face: the `ingest` section
carried a three-command round-trip example (`ingest` → `export` → `official`) inside a
`bash` fence, so `--suite`, `--input`, `--out-dir` and `--dir` appeared under a command that
does not take them.

The tempting fix was an exemption -- "flags in a fenced block do not count" -- and it is the
wrong one. The example is about three commands; documenting it under one of them is what put
another command's flags in that section. It moved to a `## Worked example: the L4 round trip`
section of its own, where the prose can say that each flag belongs to the command it follows.
**The document got better, not merely quieter.**

### What is deliberately not compared, and why that is stated rather than left out

The text before the first per-command heading documents global behaviour: `--help`, `-h`,
`help <command>`. No command advertises `--help` as its own flag (measured: the flag list
`--help` produces does not contain it) and every command accepts it. Holding the preamble to
one command's flag set would report a disagreement where there is none, so the per-command
sections are the contract and the preamble is prose. That boundary is written into the
script rather than left as a silent gap -- a gap nobody states is the shape this campaign
keeps finding.

### A defect I looked for and did not find, with the measurement

The same hunt turned up a candidate next door: a command added to the CLI's spec table
without a handler in `run.ts` would be advertised by `--help`, documented, and reachable --
and `run`'s switch has no `default`, so the fall-through would return `undefined` to
`process.exitCode`, which is a command that **does nothing and exits 0**.

It is not reachable. Measured: adding a variant to the `CliCommand` union and stopping there
fails `pnpm typecheck` with

```
src/run.ts(673,70): error TS2366: Function lacks ending return statement and return type
does not include 'undefined'.
```

`noImplicitReturns` is on and CI runs the typecheck, so the enumeration can only be extended
by implementing it. Recorded here because a hunt that finds nothing is a result, and because
the next person to wonder will otherwise re-run the same experiment.

### Verification

| gate | result |
| --- | --- |
| `check-cli-reference.test.ts` | **9 tests** (6 before), across three describes: the drift report, the two directions the section-scoped check added, and the new "no section of its own" state |
| the two new tests, before the fix | **red** -- both fixtures passed the old gate, which is what made them worth writing |
| the shipped document, before the fix | **8 disagreements reported**, 3 real and 5 from one editorial mistake |
| the shipped document, after | `CLI reference check PASSED (11 commands, 13 documented)` |
| the fixture that had to change | `referenceFor(..., { flags: false })` wrote **no sections**, so once sections became the subject it exercised the "no section" branch instead of the one it names. It now writes a section per command with no flags in it, and the test's comment says why |

### What this says about the method

The gate's header was a claim about its own subject, and the claim was wrong in the way
finding 162's was: **a document-wide search is not a section-scoped search wearing the same
word.** The difference is invisible until a flag is moved, which no amount of reading the
script reveals -- moving one was the measurement.

The second-order result is the one worth carrying: **tightening a guard whose subject was
wrong does not just catch future drift, it finds the drift already committed.** Eight
disagreements in a document that eleven gate sites had been passing over, one of which
instructed a reader to type a flag the binary rejects.

## Finding 169 — the cheap check verified the witness and not the anchor, so a stale anchor was a runner-only failure

### What failed, and where the local run had been green

The commit for finding 168 was pushed with every local gate green -- typecheck, lint,
`docs:check`, `docs:check:cold`, `docs:counts:check`, the full suite at 139 files and 3686
tests, coverage 99.97/99.93/100/99.97. CI failed:

```
38727106150  CI  failure
  job injection batteries, one step each ...  failure
      !! step 17: Gate-test battery (each gate's test provably fails when its ...)  failure
```

Run locally, the same battery says why:

```
INERT    CLIREF 1. the flag lookup loses its word boundary
INERT    CLIREF 4. a flag the reference never mentions stops being reported
```

Both are injections in `scripts/injection/gate-tests-battery.py` whose **anchors** are lines
that finding 168 deleted when it rewrote `check-cli-reference.mjs` -- the old
`mentionsFlag` body and the old per-topic `failures.push`. An injection whose anchor is gone
does not fail: `rename` raises, the battery records `INERT`, keeps going, and prints a number
one lower than the reader expects.

### The gap, which is the finding rather than the incident

The batteries have a cheap mode, `--verify-expectations`, and `battery-witnesses.test.ts`
drives it for every battery **from the suite**. That mode verified the **witness** -- that the
test each injection names still exists in the file it runs -- and it did not verify the
**anchor** -- that the code text the injection edits is still in the subject.

Those are the two ways an injection goes quiet, and they are different defects with different
verdicts:

| what is stale | what the battery reports | was it caught locally |
| --- | --- | --- |
| the witness (a renamed test) | `MISATTRIBUTED` | **yes** -- finding 157 made it a mode |
| the anchor (deleted code) | `INERT` | **no** -- only by running the battery, 111 s, on the runner |

So the repository had a local check for one half and not the other, and the half it lacked is
the one a rewrite of a gate script produces. There is also no aggregate local command for the
batteries: thirteen `pnpm inject:*` scripts, all of which run together only in the CI
`batteries` job. "Verify before pushing" therefore meant knowing which of thirteen to run, and
nothing told me this change needed one.

### The fix

`_witnesses.anchor_problems` applies **each injection's own edit to the subject as it is**:

- a table that keeps its edits as data (`(anchor, replacement)`) is checked for the anchor's
  presence, and for a replacement that differs;
- a table that keeps its edits as a callable is **called**. `rename` asserts the anchor is
  present, so a stale anchor raises `AssertionError`, and that exception *is* the report --
  no anchor list is extracted or duplicated.

It is wired into all seven batteries that own injections, from their own row shapes, and
`--probe` gained a control for it: an anchor that cannot appear in any file must come back
**named**. That control found a defect in its own message on the first run -- the pair branch
did not include the anchor text, so the control could not see what it was looking for.

The two injections were **retargeted rather than deleted**, keeping what each proves:

| injection | was anchored on | now anchored on | what it still proves |
| --- | --- | --- | --- |
| CLIREF 1 | `mentionsFlag`'s trailing word boundary | `written.has(flag)` becoming a `startsWith` scan | a renamed flag is not documentation of the shorter one |
| CLIREF 4 | the old `failures.push` for direction one | the same push in the section-scoped check | a flag the reference never mentions is still reported |

### Verification

| gate | result |
| --- | --- |
| the battery that failed | `pnpm inject:gate-tests` -> **24 caught, 0 survived, 0 inert, 0 unparseable, 0 unattributed, 1 redundant (expected)**, rc=0 |
| every battery's reconciliation, with anchors | `gate-tests-battery` 28 witnesses, `doc-counts-shapes` 12, `backend-support` 83, `roundtrip-record` 25, `fault-extraction-scoring` 12, `fault-extraction-workflow` 9, `fetch-official-retry` 5 -- **all OK with the comparator probed** |
| the anchor control | an anchor that cannot exist is reported missing **and named**; without the name in the message the control fails, which is how the pair branch's message was fixed |
| the row shapes it had to fit | four different ones across seven batteries: `(name, subject, test, callable, witness)`, `(name, target, anchor, replacement, test, witness)`, `(name, anchor, replacement, witness)` with a module-level subject, and a battery that keeps its own inline loop and did not import the shared module at all |

### One run that failed and could not be reproduced, recorded rather than dismissed

While the thirteen batteries were being run end to end, one invocation of
`pnpm docs:counts:check` failed -- `ELIFECYCLE Command failed with exit code 1`, with the
suite otherwise green immediately before and after. Two subsequent runs of the same command
passed, and the coverage run in the same sequence reported 139 files and 3686 tests passing.

**Its diagnostic is not in this record, and that is a measurement error of mine rather than of
the check**: the command that captured it piped through `tail -2`, which kept pnpm's wrapper
line and discarded whatever the check had actually printed. The failure is written down here
instead of being called flake, because "it passed the second time" is not evidence about a
check whose output nobody kept -- which is the same defect this finding is about, one level up.

### What this says about the method

Finding 157 made a renamed **witness** fail locally by turning the reconciliation into a mode,
and that worked: the class it covers has not recurred. The same reasoning was never applied to
the **anchor**, which is the other input an injection has -- and the two are checked against
different things: a witness against a test *file*, an anchor against the code *text*. One is
reachable without executing anything; the other needs the edit applied, which is exactly what a
cheap mode can now do.

> **An injection has two inputs, and a reconciliation that checks one of them reports half a
> table as whole.** The half it did not check is the half a gate rewrite breaks.

The second-order point is about where verification happens. The batteries run in CI and not in
`pnpm test`, so a change to a gate script is verified by the *suite* only to the extent the
suite reads that script. Moving the anchor check into the mode the suite already drives is what
turned a **111-second runner-only failure** into a **tenth-of-a-second local one**.

## Finding 170 — six readers behind one command, and the premise the compiler disproved

### Three kinds of "reachable", and only the last one is a user

The registry's six `implemented` rows were reachable **from a test** and **from the package
entry point**, and from nothing a user could type. Those are not the same claim, and the
difference is the defect this finding is about: a table of implemented readers that no operator
can drive describes a **capability**, not an available operation.

The two enumerations had never been tied together. Nothing failed when a backend was added to
`T2_BACKENDS` without a way to invoke it, because nothing read both lists. `rca-bench pull
--backend <id>` closes that, and the tie it makes is a **derivation**: `PULL_BACKEND_IDS` *is*
`T2_IMPLEMENTED_BACKEND_IDS`, which *is* `T2_BACKENDS` filtered to `implemented`. A row that
changes status leaves the command without anybody editing the command.

### The premise that was false, and who said so

The implementation began from a premise held without being read: that the six readers' results
are the same shape, so one renderer could serve all six. Measured, they agree on three fields --
`ok`, `signals`, `quarantine` -- and split three ways on the fourth:

| field | readers |
| --- | --- |
| `warnings` | Prometheus, Jaeger, Loki |
| `partial` + `total` | Elasticsearch |
| `page` | ClickHouse, Kubernetes |

**What caught it was `pnpm typecheck`, not a test.** The first `reportPull` took a common
supertype whose `ok: true` arm required `warnings`; the compiler refused three of the six
results, and the refusal named the missing field on each. The alternative -- satisfying the
shared type by defaulting `warnings` to `[]` -- would have written a field into ClickHouse's and
Kubernetes's documents that their readers never produced, which is the failure mode this
campaign has recorded repeatedly: a value asserted into existence to make two things look alike.

> **A premise about six modules is one `grep` away from being measured.** This one cost a
> rewrite of the renderer that a single read of the three result types would have prevented, and
> the compiler was the thing that measured it.

### An exemption whose reason had stopped being true

`acceptance.md` excused `parseInteger`'s `Number.isSafeInteger` test as redundant "within every
range the CLI currently declares", on the ground that an unsafe integer is nine orders of
magnitude outside `0..86400000`. Three new flags declare `1..Number.MAX_SAFE_INTEGER`, where the
redundancy still holds -- `n > 2^53 - 1` is the same bound the range test applies -- but that is
**not the reason given**, and a written reason that is no longer the reason for its conclusion
is exactly the class of stale record this campaign keeps finding. The entry now states both
cases.

The same pass produced the counter-example that shows the distinction is real: `pullInstant` has
no range beside it, so `Number.isSafeInteger` there is the entire bound and is load-bearing --
the first check in the CLI for which the test is not redundant.

### One run that failed and could not be reproduced, with its diagnostic

While three guard tests were being repaired, one invocation of `vitest run` over two test files
reported **four failures** in `vocabulary-single-source.test.ts`, every one of them inside
`aiopsFilesWith` -- a pure function of `exportAioPs2025(validBundle())` with no IO, called from
a test that had passed immediately before. Six later runs of the same two files (serial, and
deliberately in parallel with the gate that had been running at the time) passed, and the full
139-file suite passed on its next attempt.

Recorded rather than dismissed, and this time with the diagnostic rather than without it --
finding 169's unreproduced failure is in the record precisely because its output was thrown away.
Four red tests are evidence; the honest statement about them is what they said and that they did
not recur.

### What this says about the method

The batteries are the mechanism this repository uses to make a mechanism's *failure* observable,
and this pass added no new one: `pull`'s correctness is held by ordinary tests that drive six
real sockets, plus a derivation that makes an eighth backend a compile error. What the pass
tests is a different question -- whether a **premise** was measured before it was built on. Two
of the three measurements it needed (`Date.parse('1700000000')` is `Invalid Date`; only two of
the six readers had a named re-export) were findings about the code being called, and neither
would have surfaced from reading the command's own requirements.

> **The reader a command is built on is as much a subject of measurement as the command.** A
> CLI is mostly a description of somebody else's interface, and every assumption about that
> interface is a candidate for the kind of check this repository already applies to its own.

## Finding 171 — a table nothing read, and the 96 disagreements that were one

### What was open, and the shape of closing it

Pass 47 wrote its own Open list, and the first entry described `docs/cli-reference.md`'s
per-backend table: it is a hand-written copy of `PULL_BACKEND_FLAGS` saying **which backend
needs which flag**, and **nothing read it**. The flag *set* of every command is compared in both
directions against `--help`, so a flag cannot drift out of the document -- and the table could
have said `--token` under Prometheus, or that every backend requires every flag, or named a
seventh backend, and every gate would have stayed green.

The fix is the shape this campaign keeps arriving at, applied to prose for the first time:

| what is compared | how |
| --- | --- |
| the backend rows | located by the table's **header** -- a row naming both `Required` and `Optional` -- not by position, because the section has a fenced `text` block above it that a positional reader would find first |
| **both directions** | a backend `PULL_BACKEND_FLAGS` declares and the table omits, and a backend the table invents |
| **both columns, separately** | a flag moved from `Required` to `Optional` still *names* the flag, so a comparison of the two unions accepts it -- and a reader who followed that table would omit a flag Loki refuses to start without |
| the truth | `packages/core/dist/index.js`'s own `PULL_BACKEND_FLAGS`, **imported rather than restated**, with `docs:check` building first |

The last row is the one worth naming. A gate that restated the table in order to check the table
would be checking itself, which is the defect (findings 107-109) that made `T2_BACKENDS` the
source for the backend-support matrix in the first place.

### The first run: 96 disagreements, and they were one

The check had never been run against the shipped document before it was committed. Its first run
reported **96** failures. Reading the list rather than counting it is what makes them
informative:

```
'base-url' is required for 'prometheus' but pull's table does not say so
pull's table calls '--base-url' required for 'prometheus', which does not declare it
```

`PULL_BACKEND_FLAGS` names flags **without their dashes**, because it is read beside
`COMMAND_SPECS`' option map, which is keyed that way. The document writes what a reader *types*.
So one representation difference was reported **once per flag, on both sides of the comparison,
for six backends** -- and the largest number this gate has ever printed was the least
interesting result it produced.

> **A diagnostic count is not a severity, and the first thing to do with a large one is read the
> list.** Ninety-six failures that share a cause are one defect wearing ninety-six hats, and a
> threshold widened to accommodate them would have hidden the cause rather than the symptom.

The prefix is now added on the gate's side, and the reason is written where the normalisation
is, because the *next* reader of that line is the person deciding whether the gate is too
strict.

### The same asymmetry, one repository over, with no reader at all

While this pass was being planned, the same question was asked of the tracking documents -- and
the answer was that one of them had been wrong for several passes.

`09-推进进度追踪.md` records P1-5, *"measure the six T2 backends one by one, and declare the
unsupported ones explicitly"*. Its status line said:

> **当前状态：六分之一（v1.75）** … **v1.81 更新为六分之二（finding 160）** …
> **剩余六分之四**：Loki / ES / ClickHouse / K8s API

Four readers and a command were delivered in the passes after that sentence was written, and the
row stood as the *current state* through all of them. `04-里程碑与路线图.md` carried the same
drift as an unchecked box -- M3's exit condition "T2 backend pulling for Prometheus / Jaeger /
Loki / ES / ClickHouse / K8s API" still `[ ]` -- and `08-实测现状基线.md` §7 still read ⬜
**未测量**.

Nothing failed. **The status line has no reader.** It is prose in a document this repository's
gates do not open, and the one gate that does read a progress list states its own boundary in
its header: `check-open-list.mjs` can refuse an entry that *says* nothing and cannot refuse one
that says the wrong thing (finding 169's limit, restated).

> **A "current state" column is a claim, and a claim without a reader decays at the rate of the
> passes that follow it.** This campaign has written that sentence about published counts, gate
> summaries and release reasons. A progress table is not exempt from it.

The three documents are corrected here, and the correction is itself the measurement: **six
readers, six `implemented` rows in the registry, one command that can drive them, and a gate
holding the reference's table to the code.** What is *not* fixed is the class -- those columns
live in a second repository no gate here opens, so the next staleness will again be found by
reading. That is recorded in the Open list rather than implied to be solved.

### What this says about the method

Every durable claim in this repository now has a machine reader: the backend matrix has
`check-backend-support`, the round trip has `check-roundtrip-record`, the gate inventory has
`derive-gate-sites`, the Open list has `check-open-list`. This pass added the reference's
per-backend table to that set -- and found, in the same hour, a claim **outside** the set that
had been quietly wrong for several passes.

> **The useful question about a document is not "is it accurate today" but "what would fail if
> it stopped being accurate".** Applying it to the tracking documents produced a defect rather
> than a reassurance, which is the outcome the question is for.

## Finding 172 — "a gate" was a filename prefix and a spelling of `1`

### What was measured, and who was left out

The tree has two mechanisms that ask whether a gate can be shown to fail, and they answer
different questions: `verify-gates-are-testable.mjs` hollows a gate and checks that some test
notices, while `golden-master/gate-sites.json` enumerates each failure exit and requires a
pointer to the test that proves it. Reading them side by side is what produced this finding:

| mechanism | subject set | how it is decided |
| --- | --- | --- |
| `verify-gates-are-testable` | **16** scripts | `readdirSync('scripts').filter(n => n.startsWith('check-') && n.endsWith('.mjs'))` |
| `gate-sites.json` | **32**, then 37 scripts | a statement-position `process.exit(1)` |

Neither set is the property either one is reaching for. A gate here is a script that **exits
non-zero when it is unhappy**, and the first mechanism was reading a **filename prefix** while
the second was reading a **spelling**.

Measured, eight scripts failed outside both: five `inject-*` batteries and `probe-*` scripts, plus
`serve-site.mjs` and `format-spec.mjs`. Three of the five are batteries the pipeline runs on every
push, and `process.exit(main())` -- how every one of them reports -- was in the deriver's
`excluded` tally under the name `computed`.

> **A gate is a property, and both enumerations were reading a way of spelling it.** Finding 168's
> defect was a guard whose subject was the *document* where it said "section"; this one is a level
> up again, where the subject was the *file* the rule was about.

### The fix, and the seven sites it exposed

The deriver now treats any statement-position exit whose argument is not the literal `0` as a
failure site, and reports its exclusions as what they actually are -- `{zero, indirect, multiline}`,
where `computed` and `numeric_other` used to be. The inventory went from **50 sites across 32
scripts to 57 across 37**, and the seven new sites arrived **unannotated**, which is the mechanism
working: a site that has never been asked for a proof cannot be quietly added to the proved set.

Six of the seven are exempt, each with **its own** reason -- this file refuses a shared one, on
the ground that a sentence covering two sites is a sentence saying they are the same check. The
seventh is **proved**: `fetch-official.test.ts` already asserted `status === 2` in three places, so
the exit for a pin mismatch had a proof all along and only needed the enumeration to see it.

### Two second accounts of the predicate being corrected

Both of the failures this change caused were **restatements** of the rule it had just widened, and
both were caught by a guard that exists for that:

- The new `isFailureExitStatement` dropped the path for an exit **not at the start of a line**
  (`if (!ok) process.exit(1);`), because `exitArgument` anchors at the line's beginning and returns
  `undefined` there. `build-example-bundle.mjs` lost its only site. `scripts-are-classified.test.ts`
  reported it on the same run -- a self-inflicted regression caught by the register whose subject
  it was, and recorded in the code rather than only in this file.
- `scripts-are-classified.test.ts` carried **its own regex** for "has a failure exit". When the
  inventory grew by seven, the two accounts disagreed and five scripts were reported as "declared
  a gate or probe without a failure exit" when each of them has one. It reads the inventory now.

> **A predicate written twice will be corrected once.** The deriver's rule was widened, and every
> copy of it elsewhere went stale in the same commit -- which is what the copies were for, and
> what makes them worth removing rather than updating.

### A class whose reason expired, and nothing to remove it

`scripts-are-classified.test.ts` filed six of the eight scripts under two headings introduced
**because the deriver could not read a computed exit**. The `computed-probe` heading said so
itself, in a doc comment four lines long: its members were "absent from `gate-sites.json` and
counted under `excluded.computed`". The three batteries were `harness` on the ground that each
"has no verdict of its own" -- measured, each ends in `process.exit(main())` and `main()` returns
non-zero when its own checks fail.

Both headings are gone; the six are `probe` and `gate`; and `probe-category-inference.mjs`, the
one member with genuinely no exit, became a `tool` -- because the register holds that the classes
with a failure exit are *exactly* the scripts the inventory names, and a probe with no exit would
break a correspondence rather than describe a gap in it.

**Nothing removed the class.** It carried its own justification, and no mechanism tied that
justification to the thing it justified: it stood until somebody read it, which is the same
sentence this campaign has written about published counts, release reasons, status columns and
Open lists. This is the first time it has been written about a **type**.

> **A class is a recorded decision, and a decision can expire while the class does not.** The
> comment was the only thing holding it; the compiler could not, a test could not, and no gate
> was pointed at it.

### What this says about the method

The two mechanisms this finding is about are the ones built to answer "can this gate be shown to
fail". They disagreed with each other about what a gate is, and **neither could see the
disagreement**, because each was complete with respect to its own subject set.

> **Reading two enumerations side by side is itself a measurement**, and it is not one either
> mechanism can take about itself. What it found here was eight scripts that fail outside every
> question the repository knows how to ask.

The remaining half is recorded in the Open list rather than quietly fixed: the hollowing check
still reads `check-*.mjs`, so pointing it at the inventory's 37 scripts is a change whose cost has
to be measured before it is paid.

## Finding 173 — the cost, measured before it was paid; and two preconditions the audit was missing

Finding 172 left one thing undone on purpose. It closed the enumeration side -- `gate-sites.json`
learned that a gate is "exits non-zero when unhappy" and grew from 50 sites to 57 across 37
scripts -- and left the hollowing side reading `check-*.mjs`, with the entry stating its own
condition: *the cost has to be measured before it is paid rather than assumed to be affordable.*

### The measurement

| | prefix rule | inventory |
| --- | --- | --- |
| subjects | 16 | **37** |
| in the inventory but not the prefix | 0 | **21** |
| named by at least one test file | 16 | **37** |
| `(subject, test file)` links | 63 | **146** |
| one full run | **51.26 s** | **103.96 s** |
| peak RSS | 171 MB | 561 MB |

The prefix set is a **strict subset**, so the change could only widen; zero NO-TEST was established
before the run rather than discovered by it; and the floor for one nested `npx vitest` invocation
was measured at **1.4-1.5 s whether it is handed one file or five**, so cost scales with subjects
rather than with links. Twenty-one more subjects for **+52.7 s** in a 30-minute job is affordable
on evidence.

**The verdict was not the expected one.** 37 caught, 0 survived, 0 no-test, 0 unattributed, 0
unparsable, and 37 of 37 restored byte-for-byte. The 21 newly visible scripts were covered the
whole time -- including the three batteries the pipeline runs on every push. Nothing was broken.
**The mechanism could not see them**, and a mechanism that cannot see a covered script is
indistinguishable, from its own output, from a mechanism whose scripts are all covered.

> **An enumeration that reports only what it kept cannot be checked against what it dropped.** That
> sentence is in `derive-gate-sites.mjs` about its own tally, and this finding is the price of
> having applied it to the exceptions and not to the subjects: 21 scripts were outside a check that
> would have said `OK` either way.

### What the widening broke, and what that says about killing a process

Making the audit's subject list the inventory's made `verify-gates-are-testable.mjs` a subject **of
itself**, because it is a script with a failure exit and its own test file is named by it. Between
the first draft of the new tests and the fix, that was a live recursion: the audit ran on the real
tree, its nested suite reached the file that drives it, and several runs overlapped on one tree and
one journal. The working tree was found with **twelve scripts left hollowed, eight carrying two or
three `process.exit(0);` markers**, and the journal held a hollowed file as the "original" it would
restore.

Three links, and only the last is about the audit's code:

1. **A test ran the audit for real.** There was no way to ask the script what it measures except to
   run it. There is now -- `--list` prints the list and stops before touching anything -- and no
   test runs the audit against the real tree.
2. **Killing a run does not kill its children.** `spawnSync`'s `timeout` kills its direct child and
   nothing below it. The killed audit's `npx vitest` survived and kept driving the audit: **five
   orphan `node (vitest N)` processes were observed still rewriting the tree minutes after the run
   they belonged to had died.** This is finding 172's "the rule was about a spelling" a process down
   the tree -- the thing being measured was the child, and the thing doing the damage was the
   grandchild.
3. **The audit had neither precondition nor owner.** It would hollow a file it could already see was
   hollowed, and it read whatever was on disk as the bytes to restore.

### The two statements that were missing

- **An audit cannot measure a tree that is already mutated.** The marker the mutation writes and the
  marker the precondition reads come from one constant, so the two cannot drift; and because a
  hollowed "original" can no longer be journalled, **a repair can no longer be a no-op reported as a
  repair.** That was the sharpest edge here: the old `repairFromJournal` compared the file against
  the bytes it had just written, which is true by construction. A repair verified against its own
  input is not verified.
- **Two runs cannot measure one tree at the same time.** The journal records a pid: a holder that is
  alive makes the next run refuse, because repairing under a live run makes *it* read a pristine
  gate and record SURVIVED -- a verdict about nothing. A holder that was killed is taken over, since
  otherwise one kill would make the tree unmeasurable forever. The journal also became a list,
  because two kills in a session overwrote each other, and a lock taken with `openSync(..., 'wx')`
  covers the window the journal cannot: it is empty between two subjects.

Both branches are mutation-checked rather than asserted: disabling the first fails exactly
`refuses a tree that is already hollowed, rather than measuring one`, and disabling the second fails
exactly `refuses while a live run holds the tree, and takes over from a dead one`.

> **The precondition is what makes a surviving orphan harmless.** The audit cannot stop a killed
> run's grandchildren from running -- but it can refuse to act on the tree they are reading, which
> turns the worst case from twelve corrupted files into a failed run. The rest is in the Open list,
> named rather than implied.

### Two more second accounts, one of them about prose

- **`derive-gate-sites.mjs`'s header documented the rule its own function had stopped
  implementing** -- three paragraphs still describing `argument === '1'`, and listing
  `process.exit(2)` and `process.exit(cond ? 0 : 1)` among the things deliberately not counted. It
  had been stale for a full pass. A script's prose about its own rule sits outside every gate for
  the same reason a tracking document's status column does, and finding 172 is what made that prose
  wrong.
- **A negative assertion is a mention.** The new test wrote three scripts' names inside
  `expect(listed).not.toContain(...)`, and that put them into the corpus
  `scripts-are-classified.test.ts` searches to answer *which scripts does no test name*. One of them
  disappeared from that guard's list, so **an assertion that a script must not be a subject deleted
  it from another guard's evidence.** The assertion is now over the property and names nothing; and
  the affected guard's claim was restated as what its instrument can support -- mentions, not
  drives -- because pinning the exact set would report a coverage change where only prose had
  changed.

### What this says about the method

The audit had a mechanism for the case it had seen -- a killed run -- and none for the case that
actually happened: two runs, one tree, and a journal that could not tell them apart. Every fix here
is a **statement about what is being measured** rather than a stronger detector: subjects come from
the property, the tree must be the shipped one, the holder must be dead. The measurement that found
this was not the audit's verdict; it was `git status`.

> **Why do you believe the thing you just measured is the thing you meant to measure?** The audit
> had asked that question about *every other* gate for seven passes. It had not asked it about
> itself, and the answer was no.

## Finding 174 — a fact about blocking, read as a fact about signals

### What the previous pass left, and why it was one entry rather than a fix

Finding 173 recorded five `node (vitest N)` processes still rewriting the tree minutes after the run
that started them had died. It recorded the cause as a property of killing rather than of the audit:
**`spawnSync`'s `timeout` kills its direct child and nothing below it.** The fix was left in the Open
list, because it is a change to how the audit spawns -- and three measurements decided the shape.

| measured | result |
| --- | --- |
| `spawnSync(…, { detached: true })` | the child's pid **is** its own group id, so a group exists to be signalled later |
| what a group contains | the leader **and its children** -- the experiment's group held a `sleep` that a pid-only kill would have missed |
| `spawnSync` and the child's pid | handed back only **after the child has exited** |

The third is the one that mattered. A pid is worth writing down at exactly one moment -- while the
process is running and its owner may not survive to clean it up -- and `spawnSync` cannot supply it
then. So `runTests` is `spawn` + `await`, the child is `detached`, and the journal entry for the file
being mutated is completed with the group a few milliseconds after the mutation begins.

### The paragraph that had been wrong for two passes

`JOURNAL`'s header has said, since finding 148, that a signal handler was tried and **does not work**,
and it gave the reason: during a `spawnSync` the event loop is blocked, so a handler cannot run until
the child it is waiting for has exited, and the kill that caused the leak arrived exactly there.

Every word of that is true, and the conclusion drawn from it was false. **It is a fact about
blocking, not about signals.** Awaiting the child frees the loop, and the handler that was abandoned
two passes ago now performs the whole sweep: stop the suite, put the file back, exit non-zero. What
the header should have said is that the *mechanism it was describing* could not run then -- and the
difference between those two sentences is the one this audit has spent twenty findings on.

> **A measurement of a mechanism is not a measurement of the property**, and the file had written the
> first while reading it as the second. It is finding 172's shape -- "a gate" read as a filename
> prefix -- and finding 173's, one layer in.

### Three deaths, three mechanisms, and each says which it covers

- **A signal** is handled on the spot by `interrupted`.
- **A SIGKILL** cannot be handled by any process, so the journal carries the group and the next run
  stops it **before** repairing the file. That order is not cosmetic: the suite is a process reading
  the file the repair is about to write.
- **A survivor of either** -- the orphan nobody stopped -- is made harmless by `HOLLOW_LINE`'s
  precondition: an audit refuses to measure a tree that is already mutated, so the worst a survivor
  can do is fail.

### Killing only what it made

`process.kill(-group, …)` reaches the whole group, and a group **id** is not an identity: ids are
reused, so a record from an hour ago can name somebody else's group. `stopSuite` therefore asks what
the group is *running* before it signals anything, and it refuses more often than it kills. Three
refusals are proved rather than asserted:

| refusal | why it is the interesting one |
| --- | --- |
| a group whose members are not a `vitest` run | the decoy case, and the one a stale id produces |
| the group this process is in | catastrophic -- a signal there takes down the shell and the runner with it, and the identity check cannot see it, because under vitest this process's own group is full of things whose command line says `vitest` |
| a recorded value that is not a group id at all | see below |

The third one was **not in the code**. The first version returned in silence for a value that is
neither a usable group nor the documented `null`, while the comment directly above it said *every
refusal is reported, because a sweep that declines in silence cannot be told apart from one that
found nothing.* What exposed the contradiction was a **test passing for the wrong reason**: the
sandbox interpolated a group id through `sed`, the placeholder sat inside quotes, so the audit
received the string `"96828"` instead of the number `96828`; the guard declined silently, the branch
the test was aimed at was never reached, and the test timed out rather than failed. Two defects, one
behind the other, and the second was only visible after the first was fixed.

### The leak, found the way finding 173's was

One test run left `packages/core/bystander.pid` in the repository: the wrapper wrote a pid by
**relative path** into whatever directory the runner had, which is the package and not the sandbox.
No gate noticed. `git status` did.

> **The measurement that finds a leak is not the verdict; it is the working tree.** Two passes in a
> row have paid for that sentence -- twelve corrupted files in finding 173 and one stray file here --
> and neither was visible in any output any gate produces.

### What this says about the method

The audit now has a mechanism for each of the three ways its own run can end, and all three are
written down with the case they cover rather than as a single claim of safety. The one window left is
written into the Open list: the journal names the file before it is mutated and the suite a few
milliseconds after it starts, and a kill between those two moments leaves a repair with nothing to
reap. Closing it would mean recording a name before the thing it names exists.

> **A cleanup that is total is three statements, not one.** The pass that says "this cannot leak"
> is the pass that has not looked for the third death.

## Finding 175 — six readers certified by one author, and the three questions that are not the same question

### The entry that would not close

`docs/progress.md` carried it from pass 48: **no reader is driven against a real deployment by
CI.** Six readers are certified by `pull.test.ts` against a fixture server, and the fixture was
written by the same author as the readers -- so what it certifies is one reading of six APIs. Two
of the six had been pointed at real deployments **by hand** in passes 44 and 45, and the entry's
own note said why the third pass did not close it: it "needs either a service to point at or a way
to stand one up inside the job".

Both halves of that were assumed rather than measured. The measurement is one command:

```
$ apt-cache policy prometheus
  Installed: 2.45.3+ds-2ubuntu0.3
  Candidate: 2.45.3+ds-2ubuntu0.3
```

The distribution carries it, the sandbox is Ubuntu 24.04.3 -- the same distribution as
`ubuntu-latest` -- and **2.45.3 is the version finding 154 measured by hand**. The service this
entry kept asking for was one `apt-get` away, and nobody had looked.

> **"Needs a service" is a claim about cost, and a cost is a measurement.** The entry stated the
> requirement correctly and the price wrongly, and the price is what kept it open for three passes.

### Then the gate failed, and the failure is the finding

The first version waited for `/-/ready` and then asked the reader. It failed in **0.20 seconds**,
reporting `the reader produced no signal from prometheus_build_info on a real prometheus` about a
server that was answering correctly. Measured, the three candidate questions become true at very
different moments:

| asked | first true |
| --- | --- |
| `/-/ready` | **0.0 s** |
| an instant query for the same metric, same address | **4.9 s** |
| the range query the reader actually makes | **5.5 s** |

Two gaps, and each of them is the shape this campaign has now recorded eleven times: **a check on
the mechanism read as a check on the property.** `/-/ready` is a statement about a process having
started; having a sample is a statement about an answer existing. The 0.6-second gap between the
instant and range forms is a race, and the gate landed inside it.

Fixing it meant waiting for **the question the gate is about to ask** -- same endpoint, same query,
same window, same step, from one set of constants -- which leaves nothing between the wait and the
reading for a race to hide in. And it left a second decision that the same run made visible: a
server that answers `200` with **HTML** is not warming up, it is the wrong address. An empty window
is worth waiting for; a body that is not JSON is a refusal to report at once, with the parse error
as the reason.

### What the gate is, and what makes its verdicts worth reading

- **It starts what it measures** and stops it as a **group**, waited for until the port stops
  answering before any verdict is printed -- finding 174's lesson, reused rather than re-learned.
- **The version comes from the server.** It is read out of `prometheus_build_info`'s own `version`
  label *through the reader*, so a distribution bump is reported rather than hidden, and a constant
  typed into the script fails a test rather than passing one.
- **The negative control is the half a fixture cannot supply.** The same series is read twice: once
  with the `service` label the config sets, and once with `not_a_label_this_server_sets`, where the
  reader must produce **zero signals and a quarantine**. A fixture contains the labels its author
  chose, so it cannot fail this honestly. The very first run of this check against the real server
  -- before the config labelled anything -- quarantined `prometheus_build_info` for exactly this
  reason, which is what made the control possible rather than an obstacle to it.
- **A missing binary is not a broken reader.** The failure names the package to install, because on
  a machine without it the honest reading is "this environment cannot run the check" and not
  "the reader is wrong".

### What it does not establish, said out loud

**One reader is not six.** `docs/architecture.md` now records three degrees of evidence where it
recorded two: one reader driven against a real server by CI on every push, one measured by hand
once, four driven only against fixtures written by the same author as the readers.

That framing is the point of the change. The repository's habit is to write the strongest true
sentence about its own evidence, and the strongest true sentence about the other five readers did
not change at all today.

> **A measurement is evidence about the thing measured, and about nothing beside it.** The gate
> that proves Prometheus works is also the reason the sentence about Jaeger has to stay exactly as
> weak as it was.

### What this says about the method

Three passes of carrying an entry, and the thing that closed it was not a decision but a
`apt-cache policy`. Then one failed run, in a fifth of a second, produced the finding that made the
gate correct -- and it was produced by *running the thing*, not by reading it. The gate's own
subject, and the reason it exists, is the difference between a claim that has been answered and a
claim that has been read.

> **The fixture is not the enemy and it is not the evidence.** It answers a different question
> thousands of times a day, and the difference between the two questions is what this pass finally
> put in the pipeline.

## Finding 176 — a rule transcribed by the author of the scorer is not an oracle

### The claim that was never checked

`docs/acceptance.md` has said, since the official regression was built:

> **The oracle is upstream's rule, not ours.**

It was not. `officialMetric('rcaeval-re2')` carries a prose `quote`, a `source` string, and below
them an implementation written by the same author from the same reading of the same document. The
`AC@k`/`Avg@5` arithmetic agreed with upstream by construction -- there was one reading, and both
the prose and the code were it -- and nothing in the tree could have disagreed.

> **A transcription is not an oracle. It is a second copy of the same reading, and two copies agree
> by definition until one of them is compared to something that was not copied.**

### The number that led here, and the two ways it is unproducible

`04-里程碑与路线图.md` carried one unchecked M2 exit condition:

> **Golden Master 复现 RCAEval `BARO@re2-tt = [0.72, 0.99, 1, 0.83, 0.64, 0.8]`**

Upstream's README introduces those numbers as `Avg@5`, and then lists **six numbers against seven
labels** -- "0.72, 0.99, 1, 0.83, 0.64, and 0.8 for CPU, MEM, DISK, SOCKET, DELAY, LOSS, and
AVERAGE". The expected-output block below it is the artefact, and it says CPU 0.72, MEM 0.99, DISK
1.0, SOCKET 0.83, **DELAY 0.63**, LOSS 0.64, with no AVERAGE row at all.

So the vector in the roadmap is a copy of the **prose**: it drops DELAY and reads the aggregate
(0.8) as LOSS. It is unproducible for that reason, and for a larger one -- `Avg@5` is a *solver's*
accuracy, produced by running BARO. This product builds corpora, exports them, and scores
submissions. The exit condition asked the benchmark factory to enter the competition.

**A checklist item can be wrong in a way that never shows up as "not done".** This one had no
reader that could distinguish "blocked" from "mis-specified", so it read as backlog for as long as
it existed.

### The experiment

Upstream's `Evaluator` was run, not read. Its two files were read at
`259ea4167160256a74ad30004aa3d96a998c846e` and pinned by sha256 in
`golden-master/rcaeval-evaluator.json`; the harness supplies one file, `RCAEval/utility.py`,
because `evaluation.py` imports `dump_json`/`load_json` from it and never calls either, while the
real module pulls pandas, sklearn, requests and tqdm.

**317 generated case sets, 6162 cases.** The five `AC@k` figures agreed in every one of them. `avg5`
disagreed in **29**, always by exactly **0.01**, in both directions:

| set | ours | upstream |
| --- | --- | --- |
| `random-40-n29` | 0.49 | **0.48** |
| `random-54-n7` | 0.48 | **0.49** |
| `random-105-n3` | 0.26 | **0.27** |
| `random-137-n16` | 0.42 | **0.41** |

The cause is one expression. Ours was

```ts
const avg5 = round2(mean([1, 2, 3, 4, 5].map((k) => ac[`ac${k}`]!)));
```

where `ac[k]` had already been rounded to two decimals, and upstream is

```python
return sum(self.accuracy(i) for i in range(1, k + 1)) / k
```

with every term exact and the rounding left to the printer. So the published mean was computed from
the published per-k numbers rather than from the rates they describe.

> **This repository had already written the rule down.** Finding 156: *"a mean written beside a
> distribution rather than computed from it is a second number that can drift"* -- and
> `check-roundtrip-record.mjs` asserts it of the score block. The rule was known, tested in one
> place, and broken in another, and the two places never met.

### Why seven passes of self-consistency could not see it

The only RCAEval corpus this project has ever scored is an **oracle** export: 375 cases, each one
the ground truth, so `AC@1 = … = AC@5 = 1` and any averaging order gives 1.00. Every regression,
every battery, every round trip agreed with a number that was correct by accident.

The defect could only appear on a submission with a **partial** ranking, which is to say on a
user's first real result. That is the general shape: **a metric exercised only at its ceiling is
not exercised.**

### The record, and the witness inside each entry

`golden-master/rcaeval-evaluator.json` pins **86 sets**: 17 designed, the 29 that disagreed, and 40
controls. Each entry carries `kind`, and the test asserts that every `disagreed` entry **still**
separates "average the rounded rates" from "round the average". Deleting a set that no longer
disagrees is therefore a test failure rather than a quiet edit -- the anti-vacuity check that a
record of this kind needs, because the same record could otherwise be satisfied entirely by
perfect cases, which is the exact condition under which the bug lived.

The record also names the two divergences it does not reproduce: an empty corpus is 0 here and
prints nothing upstream (a deliberate, separately tested convention), and a case whose service
failed to parse is a miss here and can be a hit upstream (unreachable through an export the
structural gate accepts).

### The citation, measured

The `source` string said `cruiseresearchgroup/RCAEval`. Measured: default branch `v2`, last push
2026-02-17, 0 stars, `evaluation.py` 2,077 bytes. The repository the corpus registry points at, the
one whose README publishes the numbers this metric claims to reproduce, and the one still moving:
`phamquiluan/RCAEval`, `main`, last push 2026-09-29, 242 stars, `evaluation.py` 8,463 bytes.

Both compute the same `accuracy(k)` and `average(k)` -- read side by side, because a citation change
that silently changed the quantity would be worse than the stale citation. So no number was ever
wrong; the pointer was. It now names the repository the record was taken from, and a test holds the
`source` string and the record's `provenance.repo` to each other, so the next drift is a failure
rather than a discovery.

### What this says about the method

The strongest thing in this repository's habit is that it asks *"what would fail if this were
wrong"* about its own artefacts. The official metric had never been asked. Its answer turned out to
be: nothing would fail, because the only input it ever saw was a perfect one, and its "oracle" was
another copy of itself.

> **An outside implementation is worth more than a second reading of the same document** -- and the
> price of one here was two HTTP requests and a `sys.path` entry.

## Finding 177 — a check that re-runs the measurement is a second measurement, and this suite cannot pay for two

### The hole

Every pass in this document ends with a table of suite counts, and every one of those numbers comes
from `golden-master/doc-counts.json`, which is updated **by hand**. Pass 53's closing bookkeeping
raised the obvious question for the first time: *what fails if the update is forgotten?*

Nothing. Two checks exist and only one was wired in:

| question | who answers it | runs in CI |
| --- | --- | --- |
| do the documents agree with the snapshot? | `check-doc-counts.mjs`, inside `docs:check` | **yes** |
| does the snapshot agree with the suite? | `measure-doc-counts.mjs --check`, as `docs:counts:check` | **no** |

`grep -n 'counts:check' .github/workflows/ci.yml` returned nothing at all.

> **A snapshot compared only to the documents is a closed system.** Both sides can be edited
> together, consistently, and wrong, and every gate reports agreement -- because agreement is
> exactly what they measure.

This had already happened once: pass 52 found the snapshot at **139 files / 3686 tests** against a
suite of **140 / 3747**, with every gate green, and recorded the discovery as *"found by reading two
numbers side by side"*. A defect whose detection method is *somebody notices* is not fixed by writing
it down; it is fixed when a check takes over the noticing.

### The attempt

One step in the `verify` job (80.09 s locally, against a job at 153 s of 900), plus two tests in
`ci-reaches-doc-guards.test.ts`: the workflow must `run:` the command (anchored to a `run:` line --
that file records the break where a *comment* satisfied a bare `includes`), and the package script
must point at `--check` rather than at the writing mode, since a check that rewrote the snapshot
would green-light the drift it was added to report. Deleting the step failed exactly one test.

### What the runner said

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
Error: Command failed: pnpm --filter @rca-bench-factory/core test
    at measure (scripts/measure-doc-counts.mjs:103:17)
```

**Every test passed.** The step re-runs the whole suite; the coverage step in the same job has
already run it once, and on a two-core runner the worker's RPC to the main process timed out under
the accumulated update traffic. Vitest exits non-zero for an unhandled error even when the suite is
green.

This is finding 149's error message with a different cause. There, one test file spawned the CLI per
case and the fix was to split it; here the cause is **repetition of a suite already at that edge**.
The wrong lesson is available and cheap: it presents as a flake, and the fix for a flake is a retry.

> **A retry would have hidden the reading.** The step did not fail because the numbers disagreed. It
> failed because the pipeline asked the same question twice in one job, and the second asking cost
> more than the machine had.

### The decision

The wiring was reverted. `ci.yml` is back to its previous shape and the routing file is back to
seven tests. What survives is the measurement and the constraint:

| reading | value |
| --- | --- |
| `docs:counts:check` alone, locally | **80.09 s**, OK |
| the `verify` job before the step | **153 s** of 900 |
| the suite run a second time in that job, on the runner | `onTaskUpdate` timeout, **suite green** |

The shape that would work is neither a retry nor a fifth job: it is **reading the run the job
already took**. `measure-doc-counts.mjs` runs each package separately so it can attribute counts;
the coverage step emits one combined transcript, so reuse needs per-package attribution from a
single log. That change is verifiable locally, which this one was not -- and that is the reason it
is the next step rather than this one.

### What this says about the method

Two findings in a row have been about a check nobody ran. The first could be fixed by wiring it in.
This one could not, and the difference is worth stating: **the fix for a missing check is not always
another invocation of it.** Here the measurement already existed and already worked; what the
pipeline lacked was a way to *reuse* it. Adding an invocation was the obvious move, and the runner
rejected it for a reason that has nothing to do with the question the check asks.

> **A gate is a measurement plus a budget.** This campaign has spent four passes learning the first
> half. The second half says a correct check can still be unaffordable in the place it is needed.

### A leak in the tooling, measured on the way

The thirteen batteries were running when the session ended; the process died inside
`inject:fault-extraction-scoring`, and `packages/core/src/fault/extraction-scoring.ts` was left with
a seven-line guard deleted. It was found by `git status`, restored, and the battery re-run (12 of 12
caught).

No battery writes a journal, and each takes its backup with `shutil.copy(SRC, PRISTINE)` **at
start** -- so a run that begins before somebody reverts copies the mutated file into the pristine
slot and then certifies `source restored: identical to the pristine capture`, which is true and
worthless. Finding 173's defect, one layer out: the audit got a journal and a precondition; the
twelve batteries that mutate source files did not.

### Acceptance

| gate | result |
| --- | --- |
| the attempt | step + 2 tests, mutation-checked locally |
| CI on the attempt | **failed** on `onTaskUpdate`, every test green |
| the revert | `ci.yml` unchanged; routing file back to **7 tests** |
| `core` / `cli` / repo suite | **143 / 3784** · **4 / 186** · **147 / 3970** |
| batteries | **13 of 13, rc=0**, after restoring what the interrupted run left |
| `typecheck` / `lint` / `docs:check` / `docs:check:cold` | green |

## Finding 178 — an assertion is only in force while the process that makes it is alive

### The leak, twice

Finding 173 found the working tree with **twelve** scripts hollowed. Pass 54 walked into the second
instance: the thirteen batteries were running when the session ended, the process died inside
`inject:fault-extraction-scoring`, and `packages/core/src/fault/extraction-scoring.ts` was left with
a seven-line guard deleted. Both times `git status` was the only instrument that noticed.

The half that makes it permanent is the backup, and every battery has it:

```python
shutil.copy(SRC, PRISTINE)      # at start
...
shutil.copy(PRISTINE, SRC)      # after every injection
assert_source_restored()        # SRC == PRISTINE?
```

A run that begins before somebody reverts **copies the mutated file into the pristine slot**, and
then `assert_source_restored()` passes and prints `source restored: identical to the pristine
capture`. The check is true and worthless. That is finding 173's `repairFromJournal` defect -- a
repair verified against its own input -- in a second place, and finding 174's journal was built for
the audit without anybody asking whether the batteries needed the same thing.

> **An assertion is only in force while the process that makes it is alive.** The reasoning that
> left the gap was *"each battery asserts its own restore, so nothing else needs to"* -- which is
> true, and which stops being true at the moment the battery is killed, when the backup slot is
> also refilled by the next run's confidence.

### The experiment, run twice

| step | measured |
| --- | --- |
| `inject:doc-counts`, **SIGKILL** its python process mid-loop | journal `battery-journal-87159.json` present; `scripts/check-doc-counts.mjs` one line mutated; process gone |
| the same battery again | stderr `_witnesses: repaired doc-counts-shapes (pid 87159 is gone), 1 file(s) put back`; then `12 caught, 0 survived, 0 inert`; journal gone; tree clean |

The first row is the defect, reproduced deliberately rather than by accident, and the second is the
repair doing the thing no assertion could do after a kill.

### Four decisions in `guard(label)`

- **Repair at entry, and identify the holder before believing it.** A leftover journal is not
  evidence that a run is still alive: pids are reused. The holder is checked by reading
  `/proc/<pid>/cmdline` for this directory, so a recycled number cannot block the tree forever and a
  live stranger cannot be mistaken for a run. Dead -> write the recorded bytes back and **verify the
  write against the record**; live -> refuse, because repairing under a live run would make *it*
  read a file it never mutated. This is finding 174's group-id lesson one identifier down.
- **Record subtrees, not names.** `scripts`, `packages/core/{src,test}`, `packages/cli/{src,test}`,
  `golden-master` -- **270 files, 4.3 MB, 4 ms**. A hand-written subject list that forgets one file
  is precisely the defect being fixed, so the record is deliberately larger than any battery needs.
- **Restore on the exception path**, Ctrl-C included, and clear the record.
- **Do not restore on a normal exit, and do not outlive one.** If the guard repaired on the way
  out, `assert_source_restored` would pass no matter what a battery did, and the check this
  repository spent a finding on would become vacuous -- **a safety net that catches everything also
  certifies everything.**

  The second clause was learned in this pass by being bitten. The first version kept the journal
  when a file still differed, so the next run could repair a battery that forgot; that also meant a
  journal outlived a run whose subject had been edited by a **person**. Measured:
  `golden-master/doc-counts.json` was edited during a battery run, the run exited normally, and the
  next battery's repair wrote the old bytes back over the edit. A record taken at start cannot tell
  a battery's mutation from a person's edit, so it is dropped at a normal exit. Nothing is lost: a
  battery whose restore failed exits non-zero from its own assertion and names the files.

### The second thing a kill leaves: a lock, and a job that cannot be retried

`gate-tests-battery.py` keeps a lock in `tmpdir`, and its docstring already says that a SIGKILL
leaves the file behind and the next run refuses until somebody removes it. The reasoning is sound
-- two copies sharing the tree manufacture `SURVIVED`, which is the one verdict this repository must
never invent -- and the failure is still one a retry cannot get past: **the job that was killed is
the job that will be retried**, and it fails on a lock left by itself.

Measured: the run killed in this session left `/tmp/rca-bench-factory-gate-tests-battery.lock`
holding pid 226480, and three cases in `gate-test-battery-attribution.test.ts` failed with exit 3
and a message telling a CI reader to `rm` a file.

The lock writes the owner's pid into the file, so the question is answerable with the identity check
the journal already had: a lock whose owner is gone is taken over (and the takeover is printed), a
live owner still refuses.

> **A lock is a claim about a process, exactly like a journal.** Both of them were written by
> somebody who assumed the process would still be there; both needed the same correction.

### The leak this pass found in its own test

The first version of `battery-journal.test.ts` wrote journals into the real
`node_modules/.cache`, so its cases repaired each other's subjects: the failure was a repair of a
file belonging to a test that had already finished.

> **A test's scratch escaping into the tree it measures** is the same defect one level up, and it
> took the same fix the batteries needed: give the record a directory of its own
> (`RCA_BENCH_BATTERY_CACHE`) instead of trusting everybody to take turns.

`coverage-writes-are-drained.test.ts` then caught the file for starting asynchronous children
without joining them -- correctly, and for its own reason: a child that outlives the file can push a
coverage write after the reporter's queue has been drained. The two holders are now killed **and
awaited**.

### What this says about the method

Three findings have now been about the same sentence in different clothes: *the thing that was
supposed to notice was not running*. A gate nobody invoked (177). A scorer nobody compared (176). An
assertion whose author was dead (178). The first two were about **reaching** the check; this one is
about the check **outliving its process**, which is a different failure and needs a different
mechanism: not another invocation, and not a stronger assertion, but a record on disk that the next
run is obliged to read.

> **A mutation guard is a claim about a process, and a process can die.** The only durable half of
> the claim is the one written down before the mutation.

### Acceptance

| gate | result |
| --- | --- |
| `battery-journal.test.ts` | **7 tests**: dead holder repaired, live battery refused, recycled pid is not a holder, unverifiable repair fails, exception restores, **normal exit neither repairs nor leaves a record**, and a lock whose owner is gone is taken over |
| mutation checks | **5 of 5 CAUGHT**, one per branch, each by its own test |
| wiring | the **ten Python** batteries call `W.guard("<its own name>")`, and the register fails if one stops; the **three Node** batteries do not, and the register cannot see them (below) |
| end to end | SIGKILL -> repair -> 12 caught, tree clean |
| `core` / `cli` / repo suite | **144 / 3792** · **4 / 186** · **148 / 3978** |
| batteries | **13 of 13, rc=0** |
| `typecheck` / `lint` / `docs:check` | green |

## Finding 179 — a census that admits by spelling sees only the spellings it was written for

### The gap, as pass 55 had to write it

Pass 55 wired ten batteries into the journal and then wrote this, because there was no other way to
say it:

> The three Node batteries do not, and the census cannot see them. [...] They carry no `INJECTIONS`
> table, and the register admits a file to its census by `table && writes`. So they are outside both
> the guard and the census, and a kill during one of them leaves the same mutation with **no record
> to repair from**.

The sentence is accurate and it is the wrong instrument. *"The census cannot see them"* is a fact
about the census, and writing it down does not make the census able to see them; it makes the gap
survive review, because a paragraph that names a hole reads like work that has been done.

### What the census said once it could see

The admission rule was `/\b(INJECTIONS|MUTATIONS|mutations)\s*[:=]/`. Three spellings, and the third
is the lowercase form of one of the first two -- so the rule was never about case, it was about which
words somebody had typed. All three JavaScript batteries write `const injections = [`.

Adding `/i` admitted them, and the census immediately reported **four** defects in three files:

| rule | verdict on the three files | what the rule had been reading |
| --- | --- | --- |
| the restore verdict gates the exit status | all three unverified | `derived` only matched a *bare* assignment, so every `const restored = ...` was invisible |
| the battery runs inside the journal | all three unguarded | the guard name was `W.guard(...)`; JavaScript calls `withJournal(...)` |
| the backup is outside the tree | `inject-stability` violated it | a `.bak` under `node_modules/.cache` counted as in-tree, which is the reverse of the rule's own recommendation |
| the label in the record is the battery's name | all three | `.slice(0, -3)` strips `.py`; `.mjs` is four characters, so the label came back as `inject-stability.` |

Four defects, one cause: each rule was written against the file that was in front of the author.
The label bug is the sharpest illustration, because it was introduced *while fixing* the third
instance of the same mistake, one line lower in the same object literal.

And a fifth, which the census could not have been asked for: two of the three batteries read their
subjects **while the module loaded** --

```js
const suiteOriginal = readFileSync(SUITE, 'utf8');   // before withJournal is even called
```

-- which is before the journal can repair what a killed run left. Such a battery captures the
mutation, mutates from it, writes it back, and prints `source restored: identical to backup`. That is
finding 173's defect wearing the repair, and it would have been introduced by *this* pass had the
wiring been the whole of the change.

### The claim this pass refused to make

The first version of `scripts/injection/journal.mjs` installed `SIGINT`, `SIGTERM` and `SIGHUP`
handlers that restored the record and re-raised the signal. It looked strictly better than the
Python side, which relies on the default `KeyboardInterrupt`. Then it was measured:

```
process.on('SIGTERM', restore);  execFileSync('sleep', ['5']);
---------------- SIGTERM sent here ----------------
stderr: (nothing)     exit 0     handler never ran
```

A Node signal callback is dispatched from the event loop, and a battery's mutation window is spent
**inside `execFileSync` waiting for the suite** -- the loop is blocked, so the callback is not
deferred, it does not arrive at all. The interval where such a handler would run is the interval
between injections, which is the one that needs it least.

> A guard that fires everywhere except the window it was written for is worse than no guard,
> because it invites the reader to stop relying on the one that works.

So there is no signal handler, and the guarantee is stated where it can be kept: the record on disk
and the next run. `battery-journal-node.test.ts` asserts it by killing a child that is **blocked** --
`Atomics.wait`, the same state `execFileSync` puts a battery in -- and requiring the next run to
repair what it left. Python gets a real benefit from its default handler; Node does not, and the
difference is now written down instead of assumed.

### The end-to-end experiment

| step | measured |
| --- | --- |
| `node scripts/inject-component-rule.mjs`, **SIGKILL** at 4 s | `battery-journal-614736.json`: label `inject-component-rule`, script `inject-component-rule.mjs`, 272 entries; `packages/core/test/fault-prompt-grammar.test.ts` mutated |
| `node scripts/inject-stability.mjs` -- **a different battery** | stderr `journal: repaired inject-component-rule (pid 614736 is gone), 1 file(s) put back`; then `4 caught, 0 survived, 0 inert`; tree back to the pre-kill state; no journal |
| both directions of the shared format | a Node record repaired by `_witnesses.py`, and a Python record repaired by `journal.mjs`, each asserted separately |

The second row is the point of one shared format rather than two similar ones: the battery that
repairs a kill is whatever runs next, and which language wrote the record is not something the
schedule promises.

### Three things the widened census forced out of the exemption table

Re-deriving `gate-sites.json` moved three lines and dropped their annotations, and the reasons they
had carried were **false**:

> Until `verify-gates-are-testable` takes its subjects from this inventory instead of from a filename
> prefix, a computed exit here has no mechanism that would notice the line being emptied.

That sentence was written before finding 172 and never revisited. The subject list *does* come from
the inventory now, and the emptying *is* noticed -- as inventory drift, by the deriver check, which
is a different claim from a test driving the status. The three sites are still `exempt` (no test
*executes* a battery that spends a suite run mutating tracked files, so `provedBy` has nothing to
point at), but each now says what is actually true. An exemption whose reason expired is the same
defect as a proof whose test was deleted.

### Acceptance

| gate | result |
| --- | --- |
| mechanism tests | **9**: dead holder repaired before measuring; live holder refused; recycled pid not a holder; unverifiable repair refused; exception restores; normal exit neither repairs nor records; `process.exit` inside the body still drops the record; a **blocked** run killed by SIGTERM leaves the record and the next run repairs it; and both directions of the shared format |
| mutation checks | **13 of 13 CAUGHT**, each by exactly the case named in the row (6 against `journal.mjs`, 6 against the census rules, 1 against a battery that captures at module scope) |
| the wiring, asserted | the census gained `readsBeforeTheRepair`; **`const suiteOriginal = readFileSync(...)` at module scope turns it red** |
| end-to-end | SIGKILL -> 272-entry record -> a different battery repairs -> `4 caught`, tree clean |
| `core` test suite | **145 files, 3803 tests passed** |
| `cli` test suite | **4 files, 186 tests passed** |
| repo test suite | **149 files, 3989 tests passed** |
| coverage | core **99.97 / 99.93 / 100 / 99.97**, cli **100 × 4** |
| gate sites | **63 across 38 scripts**, `derive-gate-sites --check` OK |
| the three JavaScript batteries | `4`, `8`, `8` caught; 0 survived, 0 inert, restores identical |
| CI | attempt 1 red in step 10: 21 files, 361 tests, all a module namespace missing its own exports; **rerun of the same commit green in 154 s**. Recorded under Pass 56's `### Open` rather than called a flake, because the shape is not noise and no cycle explains it |
| `typecheck` / `lint` / `docs:check` | green |

## Finding 180 — a fact stored by coordinate goes stale, and nothing is watching it

### Two copies of one number, and the gate between them

`docs/progress.md` publishes how many test files and tests the suite has.
`golden-master/doc-counts.json` is the measurement those rows are checked
against. `docs:check` holds the **document to the snapshot**.

Nothing held the **snapshot to the suite**. The pair could be wrong together,
agree with each other, and every gate would report agreement -- finding 159's
shape, in the one place where the number is about the repository rather than
about a claim in it.

Pass 54 tried the obvious wiring and the runner refused it:

> a second full suite run in the same job trips `onTaskUpdate` with every test
> green

That sentence explains the cost and hides the obstacle. **The reading already
existed**: the coverage step runs the whole suite on every push, and
`--reporter=json` writes a file with one entry per test file and one per
assertion. Nobody had asked vitest for it.

### 180a -- reading the run instead of taking another one

`test:coverage` now writes `node_modules/.cache/vitest-report.json` beside its
coverage output, and `measure-doc-counts.mjs --from` derives the same three
scopes from those reports.

| path | cost | result |
| --- | --- | --- |
| `pnpm docs:counts` -- spawns three suites | **77.35 s** | 147 / 3818 · 4 / 186 · 151 / 4004 |
| `--check --from <the two reports>` | **0.056 s** | identical |

The comparison that could not be afforded now costs nothing, and CI gained a
step rather than a job.

**The new reading had to be shown to be the same reading.** Counting files and
assertions out of a report is a second definition of "a passing test", and this
repository has twice shipped two green numbers that disagreed. So:

- `vitest-report-{core,cli}-sample.json` are **real captures**, not hand-written
  JSON; the summary lines their runs printed are recorded in the test beside
  them, and both readers are asserted to produce the same numbers from the same
  run;
- the rules are driven by *editing the capture* -- mark one assertion `skipped`,
  mark the file `failed` -- so the tests are about the rule rather than about a
  shape invented for them;
- the mutation check counts every assertion instead of the passing ones, counts a
  failed file as a pass, and each mutation is caught by the case that names it.

### What `--from` asserts that the spawn could not

`pnpm test` runs whatever the root script filters to, and that filter is a
hand-written second copy of the workspace list:

```json
"test": "pnpm --filter @rca-bench-factory/core test && pnpm --filter @rca-bench-factory/cli test"
```

A third package added to `packages/` would be run by neither line, and the `repo`
count would be quietly short -- with every gate green, because every gate
compares documents. `--from` reads `pnpm-workspace.yaml` and requires **every
package that declares a `test` script to contribute a test file**, and **every
test file in a report to belong to one**. Both failures are named:

```
these workspace packages declare a `test` script and contributed no test file:
  @rca-bench-factory/cli (packages/cli)
```

### 180b -- an annotation carried by coordinate

The first full run of these tests failed, and the failure was not in the new
code: adding a docstring to `measure-doc-counts.mjs` moved its failure site from
line 66 to 97, and re-deriving `golden-master/gate-sites.json` dropped that
site's `proved` status.

`derive-gate-sites.mjs` carried the three hand-authored columns across a rewrite
**by `script:line`**, with a sentence that reads as a considered trade:

> Annotations are matched by `script:line` and dropped for a site that no longer
> exists, so a moved guard loses a stale proof rather than inheriting a wrong one.

The second half is right and the first half is not what happens. **Every edit
above a site moves its line.** The proof is dropped for a guard that did not
change at all, and the guard then fails on `main` with

```
scripts/measure-doc-counts.mjs:97 has status 'undefined'
```

-- a red that names a coordinate instead of a defect, and reads like a missing
proof where there is a moved one. Measured twice: three sites in pass 56 and one
here, each time costing a hand-written annotation.

The file already computed the identifier that is stable under exactly that edit.
Its header calls the fingerprint *"stable under reindentation and reformatting"*,
and `--check` compares fingerprints. **Carrying by line while checking by
fingerprint was two answers to one question, and the coordinate answer was
wrong.**

### The carry, and the two rules it needed

```js
const fingerprint = (site) => [site.script, site.condition ?? '', site.diagnostic ?? ''].join('\u0000');
```

- **A proof is consumed when it is used.** Two `process.exit(1)` calls with no
  diagnostic above them have the same fingerprint. Without consuming the
  candidate, one proof would be attached to both, and one of them would be a
  proof about a line it is not.
- **An ambiguous fingerprint is refused, not guessed.** When several candidates
  match, the line is the only evidence left, so an unmoved one is preferred; if
  none is at that line the annotation is dropped and the site is printed
  (`ambiguous: ...`). A wrong proof is worse than a missing one, which is what the
  old sentence was trying to say one implementation too early.

Re-deriving the real tree now reports **`annotations: 63 of 63 carried`**, and
the site that moved keeps its `proved`.

The end-to-end case runs the deriver over a **copy** of the table whose prior
lines have all been shifted by 1000 -- an edit above every site at once -- and
requires all 63 proofs to survive. Without that shift the copy and the tree agree
on every coordinate and the case would pass against the line-keyed carry it
exists to reject.

### Acceptance

| gate | result |
| --- | --- |
| mechanism tests | **15**: 8 on the two readings, 7 on the carry |
| mutation checks | **7 of 7 CAUGHT**, each by the case named in its row |
| the carry, end to end | 63 of 63 survive a whole-table shift; the line-keyed version carries **0** |
| the two readings | identical on the real tree and on the captured pair |
| `core` test suite | **147 files, 3818 tests passed** |
| `cli` test suite | **4 files, 186 tests passed** |
| repo test suite | **151 files, 4004 tests passed** |
| coverage | core **99.97 / 99.93 / 100 / 99.97**, cli **100 × 4** |
| gate sites | **63 across 38 scripts**; 63 of 63 annotations carried |
| CI | the new step runs in **0.056 s**; no second suite |
| `typecheck` / `lint` / `docs:check` | green |

## Finding 181 — the rule was written for a list, and this repository implemented it for one

### A citation that had never been opened

`openrca-1.0`'s metric carries `source: 'microsoft/OpenRCA main/evaluate.py'` and
`provenance: 'official'`. Finding 176 set the standard for that claim on RCAEval:
*a rule transcribed by the author of the scorer is not an oracle*. The file was
read this pass -- `c121a483a5a91dbae50708e5942c42a6609098b2`, 10,536 bytes, sha256
`9a1c2351…d53f1` -- and the transcription differs in three ways that each move the
number:

| upstream | here, before |
| --- | --- |
| `scores_num = len(components) + len(reasons) + len(times)` over **every** root | three criteria, from the first root |
| `if scoringpoints_length == prediction_length:` else `scores_get` stays 0 | scored whatever was answered |
| best over `itertools.permutations(predict_results)` | compared by position |

So the rule was a **projection** of the published metric onto a single-fault
answer. The product's data model is single-fault --
`GroundTruth.rootCauseComponent` is one string -- and every fixture in the tree
was single-root, so nothing could have noticed.

### The measurement, taken before the change

28 `(prediction, scoring_points)` pairs recorded in
`golden-master/openrca-evaluator.json`, each with the `(passing, failing, score)`
triple upstream's own `evaluate()` returns. On the first 25:

```
disagreements 10 of 25
two-second-component-wrong   here 1.0    upstream 0.83
three-one-criterion-wrong    here 1.0    upstream 0.89
two-but-one-prediction       here 1.0    upstream 0
two-out-of-order             here 0      upstream 1.0
```

**Not one direction.** The projection inflated a two-root key to a perfect 1.0
where the evaluator says 0.83, and it scored a correct two-root answer submitted
in the other order **0** where the evaluator says 1.0. A benchmark number that is
wrong in both directions cannot be repaired by a caveat, and "accuracy" that is
sometimes generous and sometimes punitive is worse than one that is consistently
low.

### After

```
disagreements 2 of 28
reason-with-quotes   here 1.0   upstream 0.67
embedded-in-prose    here 0     upstream 1.0
```

Both are **parsers, not rules**, both are declared in the corpus with their
direction, and neither is reproduced:

- upstream recovers a prediction block with a non-greedy regex, so a reason
  containing a double quote is truncated and its criterion is lost. This
  repository parses the cell as JSON. **Reproducing the truncation would score a
  correct answer lower for being correct.**
- upstream finds a block anywhere in the cell, including inside prose; this
  repository requires the cell to parse. Our exporter writes JSON, so an export is
  unaffected -- a model's prose answer is not, and that direction is the one that
  costs us.

Each difference is asserted **in its direction**, so a change that starts
agreeing -- or stops -- fails the test rather than passing as noise.

### What the scorer now does

- `readOpenRcaRoots` reads every block a cell declares, in numeric order, instead
  of `parsed['1']`.
- `scoreOpenRcaRoots` implements the published rule: denominator = the three
  lists' lengths; a length mismatch returns 0; the numerator is the maximum weight
  of a perfect matching between predictions and scoring points, computed as a
  bitmask DP over the same maximisation upstream enumerates as permutations.
- One upstream **quirk is reproduced deliberately**: a criterion list shorter than
  the root count is not scored, while its length still divides. A key with two
  components and one reason can never be fully earned, and two corpus cases pin it.
- A one-root key carries no block. The scorer rebuilds the same three lists from
  the flattened triple; carrying a second copy would be a second place to keep in
  step. The block travels only when the triple cannot stand for the key.

### Two branches that were removed before they shipped

The first draft guarded `best[mask] < 0` and `denominator === 0`. Neither can be
taken: the weight matrix is complete, so every DP state is reachable, and a zero
denominator is exactly "no roots", which returns one line earlier. **A branch that
cannot be taken is a claim nobody can check**, and this repository has spent
findings on exactly that shape.

### Acceptance

| gate | result |
| --- | --- |
| corpus | **28 cases**, pinned by repo, commit, bytes and sha256, with the six-step method written into the file |
| agreement | **26 of 28**; the 2 differences carry a direction and an argument |
| mechanism tests | **8** |
| mutation checks | **7 of 7 CAUGHT**, each by the case named in its row |
| `official:check` | 8 targets scored, 1 skipped by contract, all PASS |
| `core` test suite | **148 files, 3826 tests passed** |
| `cli` test suite | **4 files, 186 tests passed** |
| repo test suite | **152 files, 4012 tests passed** |
| coverage | core **99.97 / 99.93 / 100 / 99.97**, cli **100 × 4** |
| `typecheck` / `lint` / `docs:check` | green |

## Finding 182 — nine labels called "official", and the count

### A word that had never been tested against the thing it names

Every score target carries a `provenance` label (`official` or `derived`) and a
`source` string. Two of those strings had already been wrong when opened: RCAEval's
(finding 176) and OpenRCA 1.0's (finding 181). What had never been asked was the
question behind the label: **is there anything runnable upstream, and does this
repository replay it or transcribe it?**

`golden-master/oracle-census.json` is the answer, one row per target, each with the
probe that produced it and the date it was taken.

| class | meaning | targets |
| --- | --- | --- |
| `code` | released evaluator, replayed case by case | OpenRCA 1.0, RCAEval ×3, Cloud-OpsBench |
| `rubric` | machine-readable scoring data, no evaluator code | RCA100 |
| `prose` | only a paper or a dataset README describes it | AIOps2025 |
| `absent` | the citation itself says no scorer is published | OpenRCA 2.0, ITBench |

### 182a -- Cloud-OpsBench: an evaluator that normalises both sides

`LLM4Ops/Cloud-OpsBench` ships `agents/cloudops_agent/evaluation.py`. Its
`prediction_scores` computes CA, FA and JRA, and the comparison is not equality:

```python
def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())
```

This repository compared the two strings with `===`. Measured over 22 pairs recorded
in `golden-master/cloud-opsbench-evaluator.json`, **9 disagreed, every one in the
same direction**:

| input | upstream | here, before |
| --- | --- | --- |
| `CheckoutService` vs `checkoutservice` | 1 | 0 |
| `" checkoutservice"` vs `"checkoutservice"` | 1 | 0 |
| `"cpu\nsaturation"` vs `"cpu saturation"` | 1 | 0 |
| `"checkout\u00a0service"` vs `"checkout service"` | 1 | 0 |

A one-directional error is the worse kind. A metric that is generous in some cases
and punitive in others is at least visible as noise; a metric that is only ever
punitive reports a model weaker than it is, consistently, in a way that reads as a
result. Finding 181 could be argued about because the error went both ways; this one
cannot be argued about at all.

**After:** 22 of 24 agree. The two that do not are declared, with direction and
argument, and neither is reproduced:

- a key that declares nothing scores 1.0 upstream, because `"" == ""`. Here a facet
  the key does not declare is not scored, and a case with nothing scored is 0.
  Reproducing the free point would let an export of empty keys report perfect JRA.
- `str(value)` stringifies a number, so `8080` matches `"8080"` upstream. This
  repository's export contract types both fields as strings, so a number reads as
  absent. Reader, not rule.

The breakdown changed with the rule. CA and FA are the same two comparisons reported
apart, so they go through the same comparison -- a `jra: 1` beside `ca: 0.96` is not
a rounding difference, it is two rules in one report.

### 182b -- RCA100: the rubric was published, as data

The AIOps2025 and RCA100 datasets are not on GitHub. The paper points at a JiHu
GitLab project, `aiops-live-benchmark/agenticopseval`, whose raw files are reachable
anonymously. `RCA100/answer_key/taxonomy.json` (25,823 bytes, sha256 `840f3cfa…`)
carries the scoring rubric as data:

```json
"scoring_rubric": { "T3_exact_L3": 1.0, "T2_same_L2": 0.5, "T1_same_L1": 0.2, "T0_different": 0.0 }
```

with `hierarchy.{L1_categories, L2_to_L1, L3_to_L2}` beneath it. This repository's
`rca100` rule pays `1` for an exact fault-type match and `0` otherwise: a prediction
in the right L2 family earns nothing where the published rubric pays half, and one in
the right L1 family earns nothing where it pays a fifth.

**Recorded, not fixed.** The difference from 182a is what each one needs. 182a was a
comparison, verifiable in one session against a corpus. 182b needs the hierarchy
carried into the export and a tier function replayed against 28 fault types -- a
change to the contract. Shipping both in one pass would have verified neither
properly, and a `gap` field on the census row is the honest form for a known-wrong
number whose fix is a separate design.

### Two answers that closed other questions

- `aiops2025`'s dataset README documents the data and **not** the score -- `grep` for
  a formula finds none. Its rule is therefore `prose`, and the only upstream
  corroboration of its weights is the project README's table
  (`0.40 / 0.40 / 0.10 / 0.10`), which agrees with this repository.
- **ITBench publishes no evaluator.** `src/itbench` at `b510385` is a CLI to create,
  deploy and show scenarios; the only name matches for `eval` are
  `LEADERBOARD_{SRE,CISO}.md`, and those report **NTAM fault localization, NTAM fault
  propagation and % resolved**. Our metric is `itbench-pass-at-1` -- named after a
  quantity upstream does not tabulate.

### What the census can prove about itself

Nine tests assert internal consistency: one row per target and no orphan row; only
the four documented classes; every `code` row backed by a corpus that carries the
digests the row cites; every row dated, with its probe; and a `gap` only where there
is no replay -- because a `code` row with a gap would be a corpus that passes while
the rule inside it is known to differ, which turns a replay into a ritual.

They cannot assert that the table is **true about the world**. A static inventory of
external facts ages, and no test re-probes GitHub from inside a suite. The only
honest claim it makes about itself is `takenAt`, which is why the date and a per-row
probe record are required fields.

One direction **is** falsifiable and is asserted: `code` requires a corpus. A future
pass that quietly downgrades a target to "transcription" has to delete a file that
another test replays.

### Acceptance

| gate | result |
| --- | --- |
| census | 9 rows: 5 `code`, 1 `rubric`, 1 `prose`, 2 `absent`, every row probed and dated |
| Cloud-OpsBench corpus | 24 pairs from seven pinned files; 22 agree, 2 declared |
| mechanism tests | 17 (8 corpus, 9 census) |
| mutation checks | **14 of 14 CAUGHT** |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **150 files, 3843 tests passed** |
| `cli` test suite | **4 files, 186 tests passed** |
| repo test suite | **154 files, 4029 tests passed** |
| coverage | core **99.97 / 99.91 / 100 / 99.97**, cli **100 × 4** |
| `typecheck` / `lint` / `docs:check` | green |

## Finding 183 — one section of one paper, and three clauses that had been dropped

### The only target whose source is a paper

`rca100`'s metric cited `arXiv 2606.29193 section 5.4`. Findings 176 and 181 taught
this repository to open the artefact behind a citation; both times the artefact was
code. This pass opened the section, and found that **three of its clauses were not
in the rule**, one of them replaced by a number that appears nowhere:

| §5.4 | The rule before |
| --- | --- |
| "A UModel entity-ID match with partial credit on topologically adjacent entities (**0.40**)." | **0.5**, with no source in the paper, the dataset, or the project README |
| "99.5% carry a `⟨comparator, value, unit⟩` numeric constraint, so the agent must match the numeric condition, **not merely mention the metric**." | compared `signal_ref` alone |
| "`Final_B = (0.4 Entity + 0.3 Fault + 0.3 Process) × 100`." | implemented twice, once per case and once for the report |

### A number with no source

The paper weighs the three pillars 0.40 / 0.30 / 0.30 and quantifies the adjacent
match once. This repository paid 0.5. The only alternative reading — that the
parenthetical repeats the dimension's weight two sentences after stating it —
leaves the adjacent credit **undefined**, which is exactly what 0.5 was: a value
somebody chose. Either way the fix is to write down the number that is written down.

### The comparison the clause is about

`signal_ref` names a metric. The clause is about the *condition* on it. Dropping
comparator, value and unit means an answer that names `error_count` and asserts a
threshold two orders of magnitude wrong scores the checkpoint — the answer is
rewarded for the vocabulary it used, which is the metric gaming the clause exists to
prevent.

A checkpoint is now one token:

```text
order|cpu_usage|>|90|%      the checkpoint the answer key declares
order|cpu_usage|>|9|%       a different threshold: not a hit
order|cpu_usage|>|90|ms     a different unit: not a hit
order|cpu_usage             the metric, named, with no condition: not a hit
```

Exact equality on the value is the literal reading, and it is unforgiving: the
dataset's own answer keys carry `0.4964574898785425`. A tolerance is a rule the
paper does not state, so inventing one would be this defect pointing the other way.
The consequence is recorded as an open item.

### The duplication that the first fix exposed

Changing 0.5 to 0.40 moved the per-case score and left the report's breakdown at
0.5. `aggregateFor` recomputed the three terms from the predictions and answer key
rather than reading them off the case records, so the report printed
`accuracy: 0.94` beside `final: 95` — **one quantity, twice, disagreeing, inside a
single report, with 148 files green.**

That is finding 181's shape one level down: two implementations of one rule, and
nothing comparing them. The aggregate now averages the terms the case record
carries, and the suite asserts `final === 100 × accuracy` on a three-case export
whose cases carry different term sets. A single-case export cannot distinguish a
mean of case scores from a re-composition of term means — which is why nothing had.

The same duplication existed in `aiops2025`, where it was worse than a duplicate:
finding 159 had fixed the aggregate's `Exp.` to answer 0 for an empty denominator,
and the per-case rule still answered **1**. Nothing noticed because
`evidenceComplete` fails such an export first, for a different reason. **A guard
somewhere else is not a guard here.**

### What the mutation grid cannot see, stated rather than patched

`mutatePrediction` replaces a facet whole. The `evidence` mutation swaps the list
for a sentinel, so a rule that keeps the signal name and drops the value passes the
grid: **the grid never keeps the part the rule should be sensitive to.** A mutation
that changes a facet cannot test a rule that reads part of one.

The grid was left alone. Widening it for one target would put a target-specific
concept (`comparator|value|unit`) into a shared mutation table, and the next rule
that reads part of some other facet would need its own widening. The case-level
assertions in `rca100-evaluator.test.ts` are where this belongs.

### The corpus is a set of sentences, and the rubric stays out

`golden-master/rca100-evaluator.json` pins `2606.29193v1` by digest (2,958,887
bytes, sha256 `b8b8de83…`) and each clause by verbatim quote. It records the
extraction method, including the one that failed: `pdftotext -layout` reproduces the
two-column grid, so a sentence spanning the column break comes out interleaved with
the other column and the quote does not appear verbatim. Reading order does, which is
why the quotes come from the plain extraction.

It also records the dataset's own rubric — `{T3_exact_L3: 1.0, T2_same_L2: 0.5,
T1_same_L1: 0.2, T0_different: 0}` — with its digest and **the reason it is not
shipped**: 25 KB of CC BY-NC 4.0 data, and this project states in its own acceptance
document that it does not redistribute the official datasets. Adding the file to the
repository, or to every export, would contradict that boundary; leaving it out means
the tier cannot be applied in a test either. So the number stays a pinned gap, and
the census row now says what closing it would cost: a licence decision, or an
offline fixture regenerated on demand.

A second measurement from the same pass: the fault type this exporter writes is a
free-form IR string, so even with the rubric in hand a tier would resolve only when
the data already speaks RCA100's own labels. **The gap is not waiting on code.**

### Acceptance

| gate | result |
| --- | --- |
| corpus | paper pinned by digest; 4 clauses, each quoted and argued |
| mechanism tests | 15 + 1 |
| mutation checks | **12 of 12 CAUGHT** |
| the credit | 0.40 in the constant, in the corpus and in the report |
| the token | four fields, and a hit requires all four |
| the two numbers | `final === 100 × accuracy`; recomposition reports 93 where the cases average 85 |
| `official:check` | 8 PASS, 1 skipped by contract |
| `core` / `cli` / repo | **151 / 3859** · **4 / 186** · **155 / 4045** |
| coverage | core **99.97 / 99.8 / 100 / 99.97**, cli **100 × 4** |
| `typecheck` / `lint` / `docs:check` | green |

## Finding 184 — the second section of the same paper, and the relaxation it grants

### The target next to the one just read

Pass 60 read §5.4 for RCA100. §4.4, three pages earlier, defines AIOps2025's
Final_A — and `aiops2025` had exactly the provenance `rca100` had: a paper citation
and a rule written from memory. Reading it produced one missing clause that changes
a score, and one that cannot be implemented without a decision.

### The clause: either endpoint

> Two fault families need targeted relaxations: for network attacks, LA accepts a
> hit on either source or destination since evidence is prominent at both endpoints.

The answer key names both endpoints; the README documents the fields; the reader
read neither. So an answer that named the **far** end of an injected network fault
scored zero on localisation where the published rule pays full credit — the
Cloud-OpsBench defect again, one target over: an answer the benchmark counts as
correct, scored wrong, in one direction only.

The fix is one field, not a new rule:

```ts
readonly alternatives: readonly string[];   // strings the protocol accepts as the same answer
```

and `component === predicted || alternatives.includes(predicted)`. It is
deliberately **not** `adjacent`: `adjacent` earns *partial* credit for a topology
neighbour (RCA100's 0.40), an alternative earns a **full** hit, and one field
carrying both meanings is the defect finding 162 was written about.

Scope is the data's, not a fault-type list: a key that declares no endpoints has an
empty list. The suite asserts the negative case explicitly, because a relaxation
that silently widened to "anything the topology mentions" would be a different rule
that happens to agree on today's fixtures.

### The clause that is not a transcription problem

> TA scores whether the agent's reason field faithfully reflects the true fault
> type via two-step matching: keyword detection ... **with embedding-similarity
> fallback for unhit cases**.

Step one is implemented. Step two names neither a model nor a threshold. Choosing
one changes the number, and choosing one to reproduce the paper's reported TA is
fitting the metric to its own result — the mistake the whole census exists to catch,
committed by the person writing the check. So the first step stands, the direction
of the cost is written down (a paraphrase using none of the description's words
scores 0 here and may be credited there), and the `gaps` block says what closing it
would need.

This is the second consecutive target where "implement the published rule" is partly
a decision. Of the four targets with no replay, **two cannot be closed by code**:
this one needs a model and a threshold, and RCA100's rubric needs a licence
decision.

### The third copy, found by the mutation check rather than by reading

Removing the 20-character cut from the case rule left every test green. The
aggregate had its own copy of the same expression:

```ts
// aggregate, before
const em = groundTruth.reduce((sum, gt, i) =>
  sum + intersectCount((predictions[i]?.evidence ?? []).map((e) => e.slice(0, 20)), gt.evidence), 0);
```

Two implementations of "which cited observation hit", one of them edited. The case
record now carries `evidenceHits` — a **count**, not a rate — and the pooled
`Exp.` is `Σ hits / Σ denominator`. Pooling rates needs the numerators back;
recomputing them was the second copy.

Three passes, three instances of one shape:

| pass | the two copies |
| --- | --- |
| 181 | two ways to average a rate that was rounded before averaging |
| 183 | the case rule and the aggregate, for all three terms of Final_B |
| 184 | the case rule and the aggregate, for one term of Final_A |

The pattern is not "somebody wrote it twice". It is **"a term reported at two levels
gets computed at the level where it is reported"** — and the level that is never
tested is the one that is only reported. The cure is not a rule about not
duplicating; it is that the reported level must read the computed one, which is why
`OfficialCaseScore.terms` exists.

### The second reader of a directory, found the hard way

Two more whole-suite reds while finishing, in `scripts-are-classified`, with
`scripts/` one file longer than its register. The extra file is
`scripts/.probe-figures-harness-type-miss.mjs`: a harness one probe writes for a
single test and removes in `finally`. `derive-gate-sites.mjs` had already been
taught to skip dotfiles for exactly this reason, and its comment says the write
window "is still a hazard for any *future* reader of `scripts/`".

This pass added that reader — a scan filtered on `.endsWith('.mjs')` and nothing
else. So the rule was written down once, read by one consumer, and the second
consumer had to be corrected.

Two fixes: the scan skips dotfiles with the deriver's own argument (not committed,
not named by `pnpm lint`, never resolved by an operator), and the probe gains an
`afterAll`, because `finally` runs on a throw and not on a kill — and a worker
killed under the resource pressure that produced pass 60's reds leaves the file
behind, which is why the *next* run of an already-broken tree failed too.

### Acceptance

| gate | result |
| --- | --- |
| corpus | paper pinned by digest and cross-checked against the RCA100 corpus's pin; dataset README pinned; 9 clauses quoted; 4 README fields |
| mechanism tests | 16 |
| mutation checks | **9 of 9 CAUGHT** |
| the relaxation | either endpoint accepted, a third entity refused, a key without endpoints unchanged |
| the truncations | keyword at word 21 does not count; twenty characters decide an evidence point |
| the APL restriction | a long wrong answer no longer enters the efficiency average |
| `official:check` | 8 PASS, 1 skipped by contract |
| `core` / `cli` / repo | **152 / 3875** · **4 / 186** · **156 / 4061** |
| coverage | core **99.97 / 99.75 / 100 / 99.97**, cli **100 × 4** |
| `typecheck` / `lint` / `docs:check` | green |

## Finding 185 — a metric named after a rule it did not compute, and a label with two values for three states

### The last two rows of the census, and what opening one of them produced

Pass 59 counted nine targets and found five `code`, one `rubric`, one `prose` and
two `absent`. The two `absent` rows — `openrca-2.0` and `itbench` — were both
labelled `derived`, and the question this pass set out to answer was whether either
could be given something runnable. For `itbench` the answer is *partly*, and getting
there exposed a second defect that had nothing to do with ITBench.

### 185a — the quote was edited, and the rule was renamed instead

`itbench-pass-at-1` carried a `quote`, and the quote was not verbatim:

| The paper, §4.2 | The field |
| --- | --- |
| `pass@1(Chen et al., 2021) (i.e., identifying the cause as mentioned in ground truth), NTAM ... for root cause and fault propagation chain, and time to diagnosis` | `pass@1 (i.e., identifying the cause as mentioned in ground truth), NTAM ... for root cause and fault propagation chain` |

Two deletions, and both of them removed the part that made the rule look wrong. The
citation says the definition is standard; more importantly the final clause — "and
time to diagnosis" — is what makes the sentence a list of **three** metrics rather
than a description of one. Read with the clause, Table 3 of the same paper settles
it: `SRE Diagnosis pass@1, Fault Localization, Fault Propagation Chain, Mean Time to
Diagnosis`.

So pass@1 is the **cause alone**, and the rule required the cause *and* the
propagation chain *and* the fault conditions. Measured over nine cases in
`golden-master/itbench-evaluator.json` (paper pinned by digest: `v1`, 4,068,098
bytes, sha256 `da47aa02…`):

```
published=1 strict=0.33 old=0   cause-only                 <- disagreed
published=1 strict=0.67 old=0   cause-and-chain            <- disagreed
published=1 strict=0.67 old=0   cause-right-chain-wrong    <- disagreed
```

**Three of nine, all in one direction.** `published >= old` holds for every case,
and the suite asserts the reverse set is empty, because an error that only ever
subtracts is the kind that reads as a result: a low score looks like a weak model
rather than a wrong ruler. This is the third instance — Cloud-OpsBench's
normalisation (9 of 22, finding 182), AIOps2025's endpoints (finding 184), now this
— and the third is where the pattern stops being a coincidence and becomes a habit
of writing the rule from the first plausible sentence.

The fix keeps both numbers and names each one:

- `passAt1` — the published quantity, a case either identified the cause or it did
  not. It is **not** derived from the case's score, which is what the old rule did.
- `strict` — this repository's own conjunction, which is what the export's facets
  can support and which is none of the four published metrics. The metric id is
  `itbench-diagnosis-strict`, and a test asserts it is not one of the four.

### The two metrics this pass declined to implement

NTAM is described in §4.2 — a topology-aware distance, normalised to 0..1 — and it
is still not implementable, for a reason the paper states plainly:

> All the components have corresponding hyper-parameters that can be tuned to adjust
> their contributions to the overall score.

Publishable weights, absent. Any implementation chooses them, and a set of weights
chosen to reproduce the paper's Table 4 would be the metric fitted to its own
result — the exact error the whole census exists to catch, committed by the person
writing the check. So `pass@1` is implemented, `FL (NTAM)` and `FPC (NTAM)` are
declared unimplemented on the census row with that sentence as the evidence, and the
cost is written down.

Four targets now wait on something that is not code: RCA100 on a licence decision,
AIOps2025 on a model and a threshold, ITBench on weights, OpenRCA 2.0 on a scorer its
authors have said is not published. **A backlog that says "implement this" when the
blocker is a decision is a backlog that will not move.**

### 185b — two values for three states, and nothing read them

The larger finding came from a smaller observation: `provenance` was asserted
nowhere. One test read it, and it read the string.

It had two values:

```ts
export type OfficialProvenance = 'official' | 'derived';
```

where `official` meant "transcribed from the upstream scorer **or** the paper's
protocol". Now list what has been caught in this repository under that label:
OpenRCA's single-root projection (10 of 25 cases), Cloud-OpsBench's `===` (9 of 22),
RCA100's three dropped clauses, AIOps2025's missing endpoint relaxation, and
ITBench's borrowed name. **Every one of them was `official`.** The label was never a
lie; it was unable to say the thing a reader needed, which is whether anybody else's
code had ever computed this number.

Three states, so three values:

| Label | Meaning | Targets |
| --- | --- | --- |
| `replayed` | a corpus in `golden-master/` runs the released artefact's rule case by case | OpenRCA 1.0, RCAEval ×3, Cloud-OpsBench |
| `transcribed` | a published prose rule, no released code; nothing else has ever computed it | RCA100, AIOps2025 |
| `derived` | upstream publishes neither the rule nor its constants | OpenRCA 2.0, ITBench |

### The label is derived, not authored

`provenance-matches-the-census.test.ts` maps each census class to exactly one label
and asserts the registry agrees:

```ts
const LABEL_FOR = { code: 'replayed', rubric: 'transcribed', prose: 'transcribed', absent: 'derived' };
```

This is the link that was missing. Pass 59 compared the `source` **strings** between
the two files and left `provenance` and `class` unconnected — two descriptions of one
fact with nothing between them, which is the shape of findings 180, 183 and 184,
one level up: not two implementations of a rule, but two vocabularies for a fact.

Two directions are asserted rather than one. The mapping catches a label that claims
too much; a second test catches the opposite — every `replayed` label has to sit on
a `code` row, so a target cannot be *labelled* replayed while its census row says
the upstream artifact is prose.

### And the label is read

`rca-bench official` now sums it:

```json
"counts":     { "passed": 9, "skipped": 0, "failed": 0 },
"provenance": { "replayed": 5, "transcribed": 2, "derived": 2 }
```

**Five of nine.** That sentence is the honest headline of this project's
official-metric story, and it was previously available only by reading nine metric
specs. A label nobody sums is a label nobody needs, and a claim that is never
counted is the same kind of artefact as a test that is never run.

### Acceptance

| gate | result |
| --- | --- |
| corpus | paper pinned by digest; 6 clauses quoted verbatim, each argued; 9 cases with published and previous values |
| mechanism tests | 13 (10 corpus, 4 mapping, 1 CLI) |
| mutation checks | **11 of 11 CAUGHT** |
| the naming | id is not one of the paper's four; the quote is the whole sentence |
| the direction | disagreement is one-way, asserted from both sides |
| the label | 5 / 2 / 2, derived from the census, asserted in both directions |
| `official:check` | 8 PASS, 1 skipped by contract |
| `core` / `cli` / repo | **154 / 3889** · **4 / 187** · **158 / 4076** |
| coverage | core **99.97 / 99.75 / 100 / 99.97**, cli **100 × 4** |
| `typecheck` / `lint` / `docs:check` | green |

## Finding 186 — a citation that pointed at this repository

### The one row whose source was not external

Pass 62 counted the labels and left four targets with no replay. Three of them wait
on a decision. The fourth, `openrca-2.0`, looked like the same shape and was not:

```ts
source: 'docs/targets/openrca-2.0.md — the official OpenRCA 2.0 scorer is not open-sourced',
quote:  'The official OpenRCA 2.0 evaluation framework and scorer are not open-sourced.',
```

That sentence is `docs/targets/openrca-2.0.md:157`, written in this repository. It
is not in the paper:

```
arXiv:2606.27154v2, flattened text   'open-sourced'  -> 0 occurrences
microsoft/OpenRCA README @ c121a483  '2.0'           -> 0 occurrences
microsoft/OpenRCA README @ c121a483  'PAVE'          -> 0 occurrences
```

**A `quote` field whose entire value is that it was not written here, holding a
sentence written here.** Every other finding in this document has the same shape --
a rule that disagreed with an artefact -- and each was findable by replaying
something. This one had nothing to replay: the claim's evidence was the document
making the claim, so the loop closed and stayed closed for as long as nobody opened
the paper.

### What was there to find

`arXiv 2606.27154v2` §3.2 defines nine quantities across two layers (formal
definitions in Appendix G):

> Exact Match (EM) requires the predicted set to match ground truth exactly; F1,
> Precision, and Recall are mean fractional scores over the (service, fault_kind)
> pair set; ... AnySvc is the case-level rate of naming at least one correct
> root-cause service ignoring fault kind ... The process layer scores the agent's
> reasoning: Path Reachability (PR) is satisfied when the agent both names at least
> one correct root-cause service and draws a valid path through its predicted causal
> graph from that service to a ground-truth alarm node ... Node F1 and Edge F1 score
> the predicted causal graph against G* under exact matching.

The rule here was `matched facets / scored facets` over four facets. That is none of
the nine:

| The rule paid for | The paper pays for |
| --- | --- |
| root cause | EM, AnySvc, and every F1 over the pair set |
| fault type | EM only |
| causal chain | Node F1 and Edge F1, as a *separate layer* |
| checkpoint references | **nothing** — no published metric reads them |

Two consequences, and the second is the one that matters:

- a quarter of every case was paid for a facet nobody scores;
- a correct service with **no verified path** scored 0.75. The paper exists to argue
  that this case is the failure:

  > We reserve the term ungrounded diagnosis for cases that satisfy AnySvc but not
  > PR: a correct root-cause identification not grounded in a verified causal
  > propagation path to the observed symptom.

  The rule reported it as three quarters of a success, and then averaged it into one
  number with the cases that were grounded.

### What replaced it

| Number | Rule | Layer |
| --- | --- | --- |
| `em` (headline) | service **and** fault kind — exact equality over a one-pair set | outcome |
| `anySvc` | service, ignoring the fault kind | outcome, lenient |
| `nodeF1` / `edgeF1` | the predicted graph against the annotated one | process |

On the recorded corpus: `em 0.57`, `anySvc 0.71`, `nodeF1 0.78`, `edgeF1 0.74`. The
gap between the first two is the paper's headline finding, and it is now a pair of
numbers rather than a caveat.

Five published quantities are **not** implemented, each with its reason in
`golden-master/openrca2-evaluator.json`:

- **PR** needs the ground-truth alarm nodes. PAVE annotates them; this export does
  not carry them. Deriving them from the chain would be a different metric wearing
  the name.
- **F1 / Precision / Recall** are defined over a predicted *pair set*, and this data
  model carries exactly one root cause. For a one-pair submission all three equal
  EM, so reporting them would be three more columns for one number.
- **SQL Exec** needs queries; the contract references checkpoints.

### One facet the mutation grid removed before this pass did

The first version kept `chain` in `facets`, and the regression failed:

```
case case-001: mutating 'chain' did not lower the score (1)
```

That is the grid doing its job. `score` is EM; the causal graph is a different
published layer, and folding it into `score` would reproduce exactly the averaging
the paper argues against. So `facets` declares what `score` reads --
`['component', 'faultType']` -- and the graph comparison is asserted case by case in
`openrca2-evaluator.test.ts`, which is a stronger instrument for it than a grid that
can only ask whether *the* score moved.

`evidence` left the list entirely. It is validated by the structural, temporal and
statistical gates, which is where a checkpoint belongs.

### The label moved with the census, without anyone editing both

`openrca-2.0` was `derived`; it is `transcribed`. The census row moved from `absent`
to `prose`. Only the census was edited by hand -- the registry's label is derived
from the class by `provenance-matches-the-census.test.ts`, which is what pass 62's
mapping was for. The split is now **5 replayed / 3 transcribed / 1 derived**.

### The residual risk, stated

A quote cannot be checked mechanically without the artefact in the repository or a
network test, and this project does neither. What is asserted is that the `source` is
external (`not.toContain('docs/')`), that the old sentence is gone from every clause,
and that the metric's quote equals a recorded clause. **The clause itself was pasted
by hand**, so the guarantee is "nobody can quietly cite themselves again", not "this
sentence is in that PDF". That is a real limit and it is written into the Open list
rather than left implicit.

### Acceptance

| gate | result |
| --- | --- |
| corpus | v2 pinned by digest (962,086 bytes, sha256 `2c8388aa…`); 5 clauses verbatim; 7 cases |
| mechanism tests | 10 corpus + 2 census + 1 aggregate |
| mutation checks | **14 of 14 CAUGHT** |
| the citation | source is not a `docs/` path; the invented sentence is not the quote |
| the layers | em 0.57 / anySvc 0.71 / nodeF1 0.78 / edgeF1 0.74 |
| `official:check` | 8 PASS, 1 skipped by contract |
| `core` / `cli` / repo | **155 / 3901** · **4 / 187** · **159 / 4088** |
| coverage | core **99.97 / 99.75 / 100 / 99.97**, cli **100 × 4** |
| `typecheck` / `lint` / `docs:check` | green |

## Finding 187 — the field PR needed was already in the export

### A self-correction one pass old

Pass 63 closed by recording PR as blocked on a field:

> **PR needs a field the contract does not carry.** `[open: closing it means adding the
> alarm-node set to the annotation and to the export, which is a contract change…]`

Both halves of that sentence are wrong. PR's second conjunct is "a valid path … from that
service to a ground-truth alarm node, a component observed to behave abnormally during the
injection window" — which reads like a *separate* annotation. It is not, and §2.3 says so
three pages earlier:

> A candidate path π is verified only if all of **(i) every node along π exhibits a
> deviation beyond its baseline screen**, (ii) every consecutive edge conforms to R …,
> and (iii) each downstream anomaly onsets no earlier than its upstream cause.

An alarm node is a component observed to deviate. PAVE admits a path only if **every node
on it** deviated. Therefore **every node of the annotated path is an alarm node by
construction**, and the field was the chain all along. Adding `alarm_nodes` would have put a
second copy of a fact the annotation already asserts into the export — finding 183's shape,
in the contract rather than in the scorer.

The lesson is narrow and worth writing down: **reading the definition of the metric was not
enough; the answer was in the definition of its input.** The previous pass had the clause in
the same PDF and quoted it for a different purpose.

### What PR is here

```
pr = (named root cause == key's root cause)
     AND (the submitted graph has a path of length >= 1 from it to a node of G*)
```

Length at least one is the distinction between PR and AnySvc: a submission that names the
service and propagates nowhere has not grounded the diagnosis. A zero-length "path" would
make the two metrics identical, and the paper reports 61.5% against 76.0%, so they are not.

| Number | Corpus | Rule |
| --- | --- | --- |
| `em` | 0.70 | service **and** fault kind |
| `anySvc` | 0.80 | the service alone |
| `pr` | 0.56 | a correct cause and a path to an alarm node |
| `nodeF1` | 0.67 | nodes, exact matching |
| `edgeF1` | 0.50 | edges, exact matching |

### The lower bound, stated as a direction

G*'s nodes are a **subset** of the paper's alarm set: a component that deviated and sat on
no surviving path is not in the annotation. So this `pr` is a lower bound, and the corpus
carries `alarmNodeBasis` — the set, the clause that licenses it, and the direction of the
error. Claiming parity would be the exact defect this document is about; claiming a lower
bound and naming its cause is the only honest form available without the observation graph,
which the paper describes and does not release.

### Three cases that exist to stop one number from standing for another

- `detour-that-arrives` — `pr: 1` with `edgeF1: 0`. PR asks for *one* valid path, and this
  graph is wrong everywhere except the detour. A test that only compared the aggregates
  would never see the two layers separate.
- `wrong-first-hop` — `em: 1`, `anySvc: 1`, `pr: 0`. The paper's `ungrounded diagnosis` as
  a fixture; before this pass the report could not express it.
- `cycle-that-arrives-nowhere` — a predicted graph that closes a loop away from the
  annotation. PR is 0, and the walk must terminate. Termination is a property of the
  algorithm, not of the corpus, which is why there is a case that exercises it.

### The gate that caught the first draft

```ts
queue.push(...(adjacency.get(node) ?? []));
```

The repository has a test that forbids spreading a size-dependent array into a call. The
successor list is the *submission's*, so its length is bounded by nothing this file
controls — a graph with 200k edges would put 200k arguments on the stack. Replaced with a
per-successor `push`.

This is the second time in this campaign that a gate written for a different reason
corrected a change before it shipped, and both times the correction was to a claim about
size rather than about arithmetic.

### Acceptance

| gate | result |
| --- | --- |
| corpus | 8 clauses (3 new, verbatim), 10 cases, `alarmNodeBasis` recorded |
| mechanism tests | **13**, one of them the termination property |
| mutation checks | **9 of 9 CAUGHT** |
| the layers | em 0.70 / anySvc 0.80 / pr 0.56 / nodeF1 0.67 / edgeF1 0.50 |
| `official:check` | 8 PASS, 1 skipped by contract |
| `core` / `cli` / repo | **155 / 3904** · **4 / 187** · **159 / 4091** |
| coverage | core **99.97 / 99.73 / 100 / 99.97**, cli **100 × 4** |
| `typecheck` / `lint` / `docs:check` | green |

---

## Finding 188 — the runner had a default of its own, and the reader stopped at the command

### The claim, and the two ways it was not true

`scripts/verify-local.mjs` says one sentence about itself: *run every CI step that can run
here, from the workflow itself.* The plan behind it says a stronger one, of each step it
lists: **"verify:local ran this step"**. Two facts made that sentence false, and neither was
visible in the plan's output.

**The interpreter.** The runner executed every step with `execFileSync('sh', ['-c', cmd])`,
from a comment that justified it: *"sh -c rather than a split argument list because a step may
be a small script"*. That sentence is about `-c` versus argv, and it is correct. What it
silently decided was `sh`, and GitHub does not use `sh`: a `run:` body is written to a file
and handed to `bash --noprofile --norc -eo pipefail {0}`. On every distribution whose
`/bin/sh` is dash — Debian, Ubuntu, and therefore every GitHub runner and every container this
repository is built in — those are different programs. No `pipefail`, no `[[ ]]`, no
`set -o`, no `$BASH_VERSION`. A step could pass here and fail there with the same bytes and no
key in the workflow able to explain it, and `--list` would have printed a plan that said
nothing, because a hard-coded default is not a thing the plan had an opinion about.

**The reader.** `readWorkflow` scanned a step's keys and `break`-ed at the first `run:` (and
at the first `uses:`). Every key written *below* the command was invisible. GitHub's own
documentation writes `working-directory:` after `run:`, and so does most of the world:

```yaml
      - name: Type-check
        run: pnpm typecheck
        working-directory: packages/core
```

This reader saw `run` and stopped, so the value never reached `classify` — which means
v2.17's whole argument about which keys are tolerated, and v2.18's argument about `if:`
values, were both being made about the subset of keys that happened to be written above the
command. The shipped workflow writes `if:` and `env:` above `run:` and `with:` above `uses:`
in the two places it uses it, so nothing in this repository ever used the other order. That
is the reason the defect survived three passes: **the shape was not exercised, not
undetected.**

### What a `run:` body actually is

A script, written to a file, plus an argv. `{0}` is that file's path — not an argument to
`-c`, and not interchangeable with one: with a file, `$0` is a path; with `-c`, `$0` is the
interpreter's name. So the runner materialises the body:

```js
export function materialiseStep(step, dir = tmpdir()) {
  const { argv } = shellOf(step.shell ?? '');
  const file = join(dir, `verify-local-${String(process.pid)}-${String(materialised)}.sh`);
  writeFileSync(file, `${step.run}\n`, { mode: 0o700 });
  return { file, argv: argv.map((token) => (token === '{0}' ? file : token)) };
}
```

and removes it in a `finally`, because a failing step still wrote one.

`shell:` is now read rather than refused. The grammar is GitHub's, and it is closed on
purpose:

| `shell:` | meaning |
| --- | --- |
| absent | `bash --noprofile --norc -eo pipefail {0}` |
| `bash` | the default, spelled out |
| `sh` | `sh -e {0}` |
| a template of `bash`/`sh` with exactly one `{0}` | that argv |
| `python {0}`, `pwsh -command {0}`, … | **refused**: a different language is not a shell this plan can read |

The refusal is the point. Running `python {0}` through bash would be this file inventing a
meaning for a step and then reporting the invented program's exit code as the step's
verdict. A `{0}` count other than one is refused for the same kind of reason: with none the
script goes nowhere, with two it goes to two places.

`working-directory:` is read as a path **inside this repository**: normalised first, then
checked, because `packages/../../outside` and `../outside` are the same directory and only
one of the two spellings looks like an escape. An absolute path is refused — a directory this
repository does not contain is a directory the plan cannot describe.

### The three that are left, and why they are the argument

`LOCAL_INCOMPATIBLE` was five keys. It is now three, and the three are a claim rather than a
shortage:

- `if:` decides *whether* the step runs. `runSteps` stops at the first failure, so a step
  that runs regardless is a step this runner would not run at all.
- `env:` supplies values, and the one the shipped workflow uses is a secret the runner does
  not have.
- `continue-on-error:` means a failure is not a failure — precisely the distinction a runner
  exists to report.

`shell:` and `working-directory:` never belonged in that list. They did not make "a local run
reproduces this step" **false**; they made it **incomplete**, and a runner can complete it.
The list's docstring now says so, and a test asserts the two keys are absent from it — so
re-adding one has to be an argument rather than a reflex.

### The identity the dedup was using

`localCommands` collapsed steps by command **text**: two jobs that both run `pnpm build` are
one run on one machine. That was true while every step ran from the root under one shell, and
it became false the moment either could differ. `pnpm lint` in `packages/core` and
`pnpm lint` in `packages/cli` would have collapsed into one entry, and the second step would
have been reported as done by the first — a green run that never happened, which is the exact
failure mode this whole file exists to remove, reintroduced by the fix.

The identity is now `(cwd, shell, text)`. Three tests: different directories do not collapse,
different interpreters do not collapse, and the same command in the same place still does.

### How each new branch is reached

Two of them cannot be reached by argument at all, because both claims are about a process:
its working directory and its interpreter. So the end-to-end tests ask the process.

| claim | how it is proven |
| --- | --- |
| the step ran in `packages/core` | the step is `pwd > <marker>`; the marker's contents are compared |
| the interpreter is bash | `printf '%s' "${BASH_VERSION:+bash}"` — empty under dash |
| the body was a file, not `-c` | `$0`, which ends in `.sh` only when it is a path |
| `shell: bash -x {0}` was honoured | `--list`/run output prints `(bash -x {0})` |

The fixtures are the shipped `ci.yml` with one step's command replaced and one key inserted —
never a hand-written workflow, so a fixture cannot drift out of the parser's shapes. The
insertion point is *below* `run:`, which is how the second defect announced itself: the first
run of the new test failed with no shell in the plan at all, because the key was in a place
the reader had stopped reading.

### The failure the acceptance run found, which is the same rule one level down

The first full-suite run of this pass went red in `gate-test-battery-attribution.test.ts` with a
Python traceback, not an assertion:

```
FileNotFoundError: [Errno 2] No such file or directory: 'scripts/.probe-figures-harness-type-miss.mjs'
  ... in guard -> left = [e["path"] for e in record["entries"] if _digest(pathlib.Path(e["path"])) != e["sha256"]]
```

`_witnesses.guard()` records whole subtrees so a killed battery can be repaired, and at a normal
exit it digests every recorded path. `type-miss-probe.test.ts` writes
`scripts/.probe-figures-harness-type-miss.mjs` for the length of one probe and removes it in a
`finally` — so a battery that started while that file existed recorded it, and the file was gone by
the time the check ran. Two things are wrong there and they are not the same wrong:

1. **A vanished file is a difference, not an error.** `journal.mjs`, the Node half of the same
   mechanism, has always asked `existsSync` first. One rule, two implementations, and the one that
   *reports* was the one without the check. The Python guard now answers `gone` or `changed`, and
   the message carries the first five names **with their reason** -- because a count cannot be
   looked at, and because the two reasons have opposite repairs: `gone` is somebody else's scratch,
   `changed` is this battery's own leftovers. The Node half was taught the same distinction, so the
   two implementations now agree in their output as well as in their rule.
2. **A dotfile is not part of the tree.** Recording one means a kill-repair *resurrects* it, and a
   normal exit calls its deletion a difference — both statements about scratch rather than about
   this repository. `derive-gate-sites.mjs` adopted this rule first, in finding 202's neighbourhood,
   for exactly this reason; the journal now says the same thing, on both sides.

Two tests, and both fail before the fix: a recorded file that is deleted is reported by name with
no traceback, and `_guarded_files` on a tree with `.hidden.mjs` and `.hidden-dir/inside.mjs`
returns only the visible file.

This is the second pass in a row where the *acceptance run* was the thing that found the defect —
and the first where the defect was in the harness that is supposed to explain a red run. It is the
same lesson as the file it lives in: a check that assumes its own premise is a check that stops
speaking the moment the premise is false.

### Acceptance

| gate | result |
| --- | --- |
| default interpreter | CI's own, `bash --noprofile --norc -eo pipefail {0}`, asserted by value |
| `shell:` | named, templated, quoted scalar; foreign interpreters and wrong `{0}` counts refused |
| `working-directory:` | relative inside the tree; absolute and escaping paths refused |
| keys below the command | read; body lines of a block scalar are not |
| `LOCAL_INCOMPATIBLE` | 5 → **3**, and a test says which three and why |
| dedup identity | `(cwd, shell, text)`; three tests |
| end-to-end | cwd, bash, and file-instead-of-`-c` proven by asking the process |
| `gate-steps.test.ts` | **69 tests** (51 before) |
| journal guard | a vanished file is a named difference; dotfiles are not recorded (2 tests) |
| `core` / `cli` / repo | **163 / 4056** · **4 / 187** · **167 / 4243** |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 68 across 40 scripts, `--check` OK (only three line numbers moved) |
| `typecheck` / `lint` / `docs:check` | green |

---

## Finding 189 — `env:` was refused as a key, and the refusal could not tell a literal from a secret

### The open item, and the question it was answering

v2.19 left this:

> **`env:` is still tolerated by presence, and its value is a secret.** `[open: the publisher carries
> `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` and the plan records only that `env:` exists; the
> argument that no env value can make "needs the run token" incomplete is written in the code and
> not tested]`

The argument is sound and it is an answer to a different question. It asks *"can an environment
value make a step's stated reason for not running here incomplete?"* and answers *"no"* — which is
true for a step that does not run. It says nothing about the steps that **do**, and that is where
`env:` was doing damage: the key sat in `LOCAL_INCOMPATIBLE`, so a step carrying it could not be
local at all. A key-level refusal cannot distinguish

```yaml
        env:
          NODE_OPTIONS: --max-old-space-size=4096
```

from

```yaml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

and it refused both. The first is data the runner can hand to a child process exactly as written.
The second is a computation whose inputs — a secret, a run id, a matrix — exist only on the runner.
**The difference is in the value, and the list was about keys.**

### What the reader had to learn first

`env:` is the one key whose value is a **map**, so it is the one key whose value is not on its own
line. The reader had to learn to collect it:

```js
        if (key === 'env' && inline === '') {
          step.env = {};
          let k = j + 1;
          for (; k < lines.length; k += 1) {
            const named = /^ {10}([A-Za-z_][A-Za-z0-9_]*):(.*)$/.exec(lines[k]);
            ...
```

Ten spaces is also how deep a `run:` block body is. What separates the two is **which key opened
the block**, not the indentation — and a reader that keyed on indentation alone would fold a script
into the environment and lose the command. There is a test that puts `env:` immediately above a
`run: |` and checks both survive.

A line at the block's depth that is *not* `NAME: value` is either the end of the block or an entry
this reader cannot name. Only the second is an error, and it is an error rather than a skip: a
silently dropped variable is a command that runs with a different environment than the workflow says.

### The flow spelling is refused, not guessed

`env: {A: b, C: "${{ join(x, ', ') }}"}` is legal YAML and legal GitHub. Splitting it on commas
would cut that expression in half and hand the command a value nobody wrote, so the reader records
the shape and refuses it downstream, naming the spelling that works:

```
verify / Gate: `env: {A: b}` is the flow spelling, which this reader does not parse: splitting it
on commas would cut an expression that contains one. Write it as a block, one `NAME: value` per line
```

This is the same trade the whole file makes: a shape it does not read is an error with a repair,
never a guess.

### The list is now about control flow, and that is the point

`LOCAL_INCOMPATIBLE` was five keys in v2.18, three in v2.19, and is **two** now:

| key | why it cannot be carried |
| --- | --- |
| `if:` | decides *whether* the step runs; `runSteps` stops at the first failure |
| `continue-on-error:` | means a failure is not a failure — the distinction a runner exists to report |

Both are about **control flow**. Everything else turned out to be about a *value* the runner either
has or does not: the interpreter, the directory, and now the environment. Three keys fell out of
that list across two passes by being read instead of refused, and each time the list got shorter by
the same argument — *the claim was incomplete, not false*.

### The identity gains a third fact

`localCommands` deduplicated on `(cwd, shell, text)`. `pnpm test` under `NODE_ENV=test` and under
`NODE_ENV=production` are the same bytes and different runs, so the environment joined the tuple:

```js
    const environment = Object.keys(env).sort().map((name) => `${name}=${env[name]}`).join('\u0000');
    const identity = [entry.cwd, entry.shell, environment, entry.run].join('\u0000');
```

Sorted, because two steps that declare the same pair in two orders are one run — `JSON.stringify` of
two objects with different key orders is two strings, which is the cheaper of the two failures but
still a plan that does not describe itself. Two tests: different environments do not collapse, equal
environments in different orders do.

### Proven by asking the child

The claim is about a child process's environment, so the child is asked. A fixture step declares

```yaml
        env:
          RCA_PROBE_GREETING: hello from the workflow
```

and runs `printf '%s' "$RCA_PROBE_GREETING" > <marker>`; the marker's contents are compared against
the declared value. If the runner passed nothing, the shell expands to the empty string and the test
fails with the value, not with a map comparison.

### Acceptance

| gate | result |
| --- | --- |
| block `env:` | read, quoted scalars unwrapped |
| flow `env:` | recorded and refused, with the spelling that works |
| literal value | carried onto the step and passed to the child |
| `${{ … }}` value | refused on a local step, quoting the entry |
| outside the plan | tolerated, and mentioned only when it is not reproducible |
| `LOCAL_INCOMPATIBLE` | **3 → 2**, both about control flow, asserted |
| dedup identity | `(cwd, shell, env-sorted, text)`; two tests |
| `--list` | `0 of 36 override the shell, the directory or the environment` |
| `gate-steps.test.ts` | **80 tests** (69 before) |
| `core` / `cli` / repo | **163 / 4067** · **4 / 187** · **167 / 4254** |
| gate sites | 68 across 40 scripts (three line numbers moved again) |

---

## Finding 190 — the budget was in the workflow all along, and the runner could not be stopped

### The key that was "tolerated"

`timeout-minutes:` has been in `STEP_KEYS` since v2.16, with this entry:

> `timeout-minutes`: tolerated: a resource bound, not a condition -- a step that is slower here
> still fails the same way

The sentence is true of a step that **ends**. It says nothing about a step that does not, and
that is the case the key exists for. Meanwhile `.github/workflows/ci.yml` had been declaring the
bound on all four jobs — 15, 30, 15, 20 — with its own reason written above one of them:

```yaml
    # Not a performance assertion: a job that hangs has to be reported as a budget
    # being spent rather than six hours later.
    timeout-minutes: 15
```

The local runner could not report that, because it had never read the line. `readWorkflow`
looked at `  job:` to learn which job it was in and then at `- name:` to find steps; a key at
four spaces was passed over in silence. So the plan printed 36 local steps, none of them
bounded, and a hung step hung for as long as the operator was patient.

This is the third field in three passes that was **in the file and not in the reader** —
`working-directory:` below `run:`, `env:`'s map, and now every job-level key. The shape is the
same each time: absence from the plan reads exactly like absence from the workflow.

### Job keys are classified, not scanned

Silence is what allowed this, so the other job keys are classified the way step keys are:

| class | keys |
| --- | --- |
| read | `timeout-minutes` |
| tolerated | `name`, `runs-on`, `needs`, `permissions`, `steps` |
| refused | `strategy`, `defaults`, `env`, `container`, `services` |
| tolerated only as `always()` | `if` |

The five refusals are one argument: each changes *what* runs rather than *where* it runs. A
matrix multiplies the job; `defaults.run` changes the shell and directory of every step in it; a
job-level environment would apply to every step and is not collected; a container and a service
are another machine. Any of them makes the plan's sentence about its steps false, and a plan may
not be false quietly. A key the reader has never heard of is an error too, with the same message
it gets at step level.

### What "enforce" costs

A `run:` body is not one process. `pnpm test` starts vitest, which starts workers. Killing the
process that was spawned leaves the workers running and the terminal busy — the exact failure the
bound exists to prevent. So the child is spawned `detached` (its own group, `setsid()`), and the
bound expires into `kill(-pid, 'SIGTERM')`, then `SIGKILL` two seconds later:

```js
    timer = setTimeout(() => {
      timedOut = true;
      signalGroup('SIGTERM');
      grace = setTimeout(() => signalGroup('SIGKILL'), GRACE_MS);
    }, bound);
```

`detached` has a cost, and it is not small: the terminal's Ctrl-C no longer reaches the child.
A runner that swallowed the operator's interrupt would be worse than one with no bound, so
`SIGINT` and `SIGTERM` are forwarded to the group, and a last-resort `exit` handler sweeps it.

The handler **re-raises the signal**, and that half is not a detail. Installing a listener replaces
the signal's default action, so a runner that only forwarded would ignore the SIGTERM a supervisor
sends and be killed with SIGKILL later — taking every file that supervisor had queued behind it.
Removing itself and re-raising lets the default action happen, so the process dies *of* the signal
rather than exiting with `143` standing in for one; and it keeps this module free of a
`process.exit`, which is what the register says of it. The test spawns a real runner, waits for its
step to start, sends SIGTERM, and asserts both halves: the process died of `SIGTERM`, and the
step's grandchild is gone.

The loop had to become **async** to make that possible. A synchronous `spawnSync` cannot forward
a signal while it blocks, and Node's own `timeout` option kills only the process it started.

### A third verdict, and a branch that can be reached

A step that ran past its bound is not a step that failed: the repair differs, because a step that
exited 1 has something wrong with it and a step that ran for fifteen minutes has something wrong
with it *or* with the budget. So the difference travels:

```js
      return { ok: false, timedOut: error?.timedOut === true, index, step, commands: commands.length, error };
```

and `failureReport` — pure, in `gate-steps.mjs`, tested with both shapes — prints `TIMED OUT` with
the bound and **the step that set it**, or `FAILED` without either.

That function exists because of the other half of this pass: **the timeout branch cannot be
reached from the CLI without waiting fifteen minutes**, and a branch reachable only by waiting is
a branch nobody exercises. So the CLI calls one pure function, and the test hands it the shape a
timeout produces.

### The seam had to move

`runCommand` used to live in `verify-local.mjs`, which is a gate: `verify-gates-are-testable.mjs`
hollows it out with `process.exit(0)`, so no test may import it — a suite that dies at import
reports an unattributed crash instead of a failing test. That rule kept the one piece of logic
worth testing inside an untestable file.

The runner is now `scripts/step-process.mjs`: importable, driven by `step-process.test.ts` against
real processes, and called by the CLI. It is registered in `scripts-are-classified.test.ts` as a
`data` module — a thing imported rather than run — which is the same class `gate-steps.mjs` holds.

The tests use a **400-millisecond** bound, because the conversion from minutes happens where the
plan is built: `localCommands` carries `timeoutMs`, so the runner has one unit and a test does not
wait a minute for the privilege of checking a kill.

### The bound does not join the identity, and that asymmetry is the decision

`localCommands` deduplicates on `(cwd, shell, env, text)`. Putting the budget in that tuple would
run `pnpm build` four times on this repository — once per job — to save nothing. So the tuple stays
and the merged entry takes the **tighter** bound, recording which step supplied it:

```js
      if (bound !== null && (seen.timeoutMs === null || bound < seen.timeoutMs)) {
        seen.timeoutMs = bound;
        seen.timeoutFrom = step.key;
      }
```

The tighter bound is also the right one: CI runs both steps, and the one that fails first is the
one the local run is standing in for. A timeout therefore names `b / two` rather than whichever
step appeared first, which is why `failureReport` prints `set on`.

### Acceptance

| gate | result |
| --- | --- |
| job-level keys | read, and the four that change what runs are refused |
| `timeout-minutes` | inherited from the job, narrowed by the step, whole minutes only |
| a bound it cannot compute | refused on a local step, tolerated outside the plan |
| enforcement | process **group** killed: SIGTERM, then SIGKILL after 2s |
| the operator's interrupt | forwarded to the group, because `detached` hides it from the terminal |
| the verdict | `TIMED OUT` with the bound and the step that set it; `FAILED` without either |
| a branch nobody can reach in time | `failureReport` is pure and tested with both shapes |
| dedup | tighter bound wins, with the step that supplied it; three tests |
| the shipped plan | 36 of 36 local steps bounded, 15m to 30m — the jobs' own numbers |
| `gate-steps.test.ts` | **101 tests** (80 before) |
| `step-process.test.ts` | **8 tests**, against real processes, one of them a signal |
| `core` / `cli` / repo | **164 / 4096** · **4 / 187** · **168 / 4283** |
| gate sites | **69** across 40 scripts — one more, the CLI's rejection path, and proved |

---

## Finding 191 — `continue-on-error` was refused as impossible, and it is only a fact about the loop

### The list is down to one, and the pattern is now the finding

`LOCAL_INCOMPATIBLE` has lost four entries in four passes:

| left | pass | why it could be carried |
| --- | --- | --- |
| `shell:`, `working-directory:` | v2.19 | they name an interpreter and a directory, and the runner has both |
| `env:` | v2.20 | the key is not the problem — certain *values* are |
| `timeout-minutes:` | v2.21 | a budget is a number this machine can spend |
| `continue-on-error:` | v2.22 | "a failure here is a note" is a fact about the **loop**, and the loop can say it |

Each departure had the same shape: the entry was not *false*, it was **incomplete** — and an
incomplete claim is completed by carrying the fact onto the step rather than by refusing the key.
What remains is `if:`, and it is the one that cannot be carried: the runner walks the plan in CI
order and stops at the first failure that is not a note, so "run regardless" would have to run
after a stop, which is a different program from the one that reports the stop.

### What CI means by the key

A step with `continue-on-error: true` **runs**, **fails**, is shown as failed, and the job still
concludes `success`. Two facts follow, and both are easy to get half-right:

- the run does not stop, so `runSteps` must record the failure and continue;
- the run's verdict is still a pass, so the exit code is **zero** — and then "OK" would be a lie,
  so the verdict line says how many failures it contains and each one is listed:

```
verify:local: OK (1 command(s), 1 of the 36 local steps), with 1 tolerated failure(s)
  tolerated: verify / Type-check — the step exited 3; the workflow says that is a note
```

### Two decisions the key forced, and why each went the way it did

**A step that spent the job's budget is never a note.** In CI the bound belongs to the *job*: a
step that runs for fifteen minutes has spent what every later step needed, and the job is killed.
`continue-on-error` then has nothing left to continue to. Reproducing the note without reproducing
the death would be the worse half of both, so a timeout stops the run whatever the flag says.

**A merged command is a note only if every step merging into it is.** `localCommands` collapses two
identical commands into one run. With `continue-on-error` in play, the merge must be an `and`: one
fatal step is enough to make the merged run fatal, because the other direction reports a green run
that CI would have made red — the one error a reproducing tool may not make.

**A run that stops still says what it noted first.** The failure block lists the tolerated failures
that came before the stop, because a reader will fix the step that stopped the run and would
otherwise learn the other two by running again.

### The boolean is refused rather than guessed

`continue-on-error: yes` is `true` under YAML 1.1 and the string `"yes"` under 1.2. GitHub's parser
picks one; a reader that picked the other would disagree with the runner about whether a failure
stops the job — which is the only thing the key says. So `booleanOf` accepts `true` and `false`
(any case, quoted or not), refuses everything else with the value quoted, and refuses `${{ … }}`
because a flag this machine cannot evaluate is one it cannot honour.

### The measurement that closed the previous pass's open item

v2.21 ended with a full-suite run that died with seven files failing at *collection*, and two
candidate causes. Both are now eliminated by measurement rather than by argument:

| candidate | measurement | verdict |
| --- | --- | --- |
| the cgroup ceiling | five runs of the exact CI command, `memory.events max` delta `0` every time; `memory.peak` 8.394 GB against a 8.590 GB limit | the limit was never touched |
| a signal reaching a recycled pid | `/proc/sys/kernel/pid_max` = 4 194 304, 43 processes alive: a recycled pid would need four million allocations | the group kill cannot reach a foreign group |
| my own overlapping runners | killed a runner mid-suite and looked for survivors: none | the harness kills the group |

What is left is an event with no reproduction in thirteen subsequent runs, and one structural change
that removes the only mechanism this pass could have contributed: the signal handler now **re-raises**
instead of swallowing, so a worker can no longer be left deaf to a supervisor's SIGTERM. The item
stays open, with what was eliminated written next to it.

### Acceptance

| gate | result |
| --- | --- |
| `continue-on-error: true` | carried; a failure is recorded and the run continues |
| `continue-on-error: false` | carried as false, not as absent |
| `yes`, `1`, `${{ … }}` | refused, quoting the value |
| the verdict | exit 0, `with N tolerated failure(s)`, each one listed |
| a timeout | stops the run whatever the flag says |
| a merged entry | a note only when every step that merges into it is |
| `LOCAL_INCOMPATIBLE` | **2 → 1**, and the survivor is argued |
| `gate-steps.test.ts` | **111 tests** (101 before) |
| `core` / `cli` / repo | **164 / 4106** · **4 / 187** · **168 / 4293** |
| gate sites | **69** across 40 scripts |

---

## Finding 192 — the last key was the shape of the loop, and the table had been lying about two of them

### The list that turned out to be a to-do list

`LOCAL_INCOMPATIBLE` held five keys in v2.18. It held one at the end of v2.22, and this pass
deleted it. Every departure was argued the same way — *the claim was incomplete, not false* — and
after five passes the argument had consumed the whole category:

| left | pass | what was actually missing |
| --- | --- | --- |
| `shell:`, `working-directory:` | v2.19 | the interpreter and the directory, as values |
| `env:` | v2.20 | the distinction between a literal and a secret |
| `timeout-minutes:` | v2.21 | a budget, and a way to spend it |
| `continue-on-error:` | v2.22 | a second verdict for the loop |
| `if:` | **v2.23** | the loop's **shape** |

A list that shrinks by exactly one entry per pass is not a list of impossibilities. It is a list of
work not done, written in the grammar of a limitation — and the grammar is what made it survive:
"a runner cannot honour `if:`" sounds like a fact about runners, and the fact was about *this*
runner's loop, which returned at the first failure.

### What `if:` forced

Two things, and neither is a parameter:

- a step may run **because** something failed (`always()`, `failure()`);
- a step may be **skipped in a green run** (`failure()` with nothing failed yet).

The old loop could do neither. It returned `{ ok: false, ... }` at the first failure, so "the steps
after it" did not exist, and a step that did not run was simply not mentioned. So the loop now
collects:

```js
      outcomes.push({ step, status: 'failed', error });
      failed = true;
      // And on it goes, because a later step may declare `always()` or `failure()`
      // and CI would have run it.
```

and the verdict becomes a view of what it collected rather than a thing returned early. The one
place it still returns is a timeout, because a spent budget ends the *job* in CI: nothing after it
runs, not even a step that asked to run regardless. That asymmetry is the reason `failureReport`
prints how many steps a timeout cost.

### Exactly three conditions, and the reason for the boundary

`if:` is a general expression language over `github`, `env`, `matrix`, `inputs`, `needs`, `steps`.
Three functions take no input this machine does not have, and they are exactly the three the loop
already knows:

| written | runs when |
| --- | --- |
| absent | no earlier step has failed |
| `success()` | the same thing, said out loud |
| `failure()` | an earlier step has failed |
| `always()` | either way |

`cancelled()` is refused rather than mapped to "never runs", and the distinction matters: "never
runs" is a claim about the step, while the truth is a claim about this runner — nothing here can be
cancelled. Everything else is refused with the value quoted, which is the same trade `envOf` and
`timeoutOf` make: a value this machine cannot compute is an error with a repair, never a guess.

### The default had to be stated, third time running

`--list` now says, of the shipped plan:

```
  a step runs only after the ones before it have passed, which is GitHub's default; none of the 36 declares a condition
```

Three passes, three defaults: the interpreter (`bash --noprofile --norc -eo pipefail {0}`), the
budget (`15m to 30m here`), and now the condition. Each was invisible because it was implicit, and
each was wrong to leave implicit for the same reason — **a default nobody states is a default
nobody can review**. This one is what makes a failure mean anything: it is the rule that turns a
non-zero exit into a stopped job.

### The table had two rows that lied, and the later one won

Rewriting `STEP_KEYS` to give `if:` its new description turned up this:

```js
  'continue-on-error': 'read: `true` means a failure here is a note, and the run carries on',
  ...
  'continue-on-error': 'a failure that does not fail the job, which this runner reads as a failure',
```

The second line was a leftover from the section it used to live in, and an object literal keeps the
**last** one. So for two passes the table described `continue-on-error` as a key the runner does not
read — after v2.22 had taught it to read the key — and for two passes nothing could see it, because
by the time anything parses the object the duplicate is gone. `env:` had the same pair of rows.

The fix is not "be careful": it is a test that reads the literal as **text** and counts:

```ts
    const keys = [...(block?.[1] ?? '').matchAll(/^ {2}'?([a-z][\w-]*)'?:/gm)].map((match) => match[1]);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
```

A second test holds the two classes the table claims, so a key cannot be added with a description
that says nothing about what happens to it.

### The open item about ownership, closed by the shape change

v2.22 left: *"a tolerated failure has no owner in the plan's own output"*. With a run recorded as
`outcomes`, that is a filter rather than a second field:

```js
export function notedFailures(outcomes) {
  return outcomes.filter((one) => one.status === 'noted');
}
```

One function, two readers — `failureReport` and the CLI. Two filters over the same status string
would have been this repository's oldest shape again: one rule, two implementations, and the one
that reports is the one that goes stale.

### Acceptance

| gate | result |
| --- | --- |
| `if:` on a local step | carried as `success` / `failure` / `always`; anything else refused by value |
| `cancelled()` | refused, and the message says why it is not "never runs" |
| the loop | collects outcomes; the verdict is derived |
| a step after a failure | runs when its condition widens, skipped otherwise — both recorded |
| a `failure()` step in a green run | skipped, counted, and named in the verdict line |
| a timeout | stops everything, including `always()`, and says how many steps it cost |
| `--list` | states the default condition and the number of steps that override it |
| `LOCAL_INCOMPATIBLE` | **deleted**; a test asserts every known key is carried by a local step |
| the table | no duplicate rows (parsed as text), and every description classified |
| `gate-steps.test.ts` | **131 tests** (111 before) |
| `core` / `cli` / repo | **164 / 4126** · **4 / 187** · **168 / 4313** |
| gate sites | 69 across 40 scripts, one line number moved |

---

## Finding 193 — the budget was a pool, and every step was told it was a limit

### What v2.21 and v2.22 read, and what they did with it

v2.21 taught the reader to see `timeout-minutes:` on a job, and v2.22 handed that number to the
runner as each step's bound. Both were right about the number and wrong about the noun. GitHub's
`timeout-minutes` on a job is a budget for **the job**: `verify` has fifteen minutes for build,
types, lint, coverage and mutation *together*. Giving every step fifteen made this runner more
generous than CI in the one direction that matters — a local run could pass a plan CI would have
killed at the fourth step.

That was the last known way the sentence *"`verify:local` ran this step"* was true locally and false
on the runner. It is not a key that was unread; it is a key whose arithmetic was never done.

### Pools, and who pays for a merged command

`localCommands` merges identical commands across jobs, so one local run can stand in for work in
four jobs. CI would have run it four times, each job paying the full duration, so the charge is
full duration to **each** pool:

```js
    // Charged whatever the outcome: the time was spent, and a job that died in a
    // step has still spent what it spent.
    const elapsed = Math.max(0, now() - started);
    for (const pool of pools) spent.set(pool.job, (spent.get(pool.job) ?? 0) + elapsed);
```

Charging once would overstate what every job has left — the direction that lets the gate pass a plan
CI would kill. The bound a command gets is the tighter of its own `timeout-minutes` and what its
jobs have left, and the owner travels with the number:

| the tighter one | what a reader is told |
| --- | --- |
| the step declared it | `bound: 5m, set on verify / Type-check` |
| the job has that much left | `bound: the last 2m of job "verify"'s 15m budget (13m already spent)` |
| the job had nothing left | `bound: job "verify" spent its whole 15m budget before this step` |

The third is a new outcome, `exhausted`, and it is not a skip. A step that starts with nothing left
is a step CI would have killed at its first instruction, so reporting it as skipped would say the
run was fine. It fails the run, and the steps after it are skipped — the run has already failed.

### The clock had to be a parameter

Pool arithmetic asks "how long did that take", and the honest answer comes from a clock. A test that
verified a fifteen-minute budget by waiting fifteen minutes is a test nobody runs, and one that
asserted on `Date.now()` differences would be the flakiest thing in the suite.

So `runSteps(commands, run, now = Date.now)`. The arithmetic is driven by a clock the **test**
advances from inside its own `run` callback, which makes every assertion exact:

```js
    const result = await runSteps(localCommands(shared('verify', 1, ['one', 'two', 'three'])), (step) => {
      seen.push(step.timeoutMs);
      t += 20_000;
    }, () => t);
    expect(seen).toEqual([60_000, 40_000, 20_000]);
```

Enforcement stays real, and is proven where it already was: `step-process.test.ts` kills a process
group at whatever `timeoutMs` says. The chain is two tested halves, not one untested whole.

### Enforcing a budget silently is the same mistake one level down

The first full gate run with pools passed, and said only `OK`. A run that passed with one minute to
spare and a run that passed with fourteen produce the same verdict and different facts, and only one
of them is about to break. So the verdict carries a measurement:

```
  budget:  verify 58s of 15m, batteries 17m of 30m, artefacts 19s of 15m, cold-tree 2s of 20m
```

This is also the only evidence that the pool code ran at all on the real gate rather than being
skipped by an empty list.

### What the plan now says

```
  `timeout-minutes:` is a budget for the whole job, not for each step: verify 15m across 7 step(s),
  batteries 30m across 16 step(s), artefacts 15m across 9 step(s), cold-tree 20m across 4 step(s)
  — a run that spends one is killed at whatever step is running
```

Per job, because per step was the false statement: a line that printed `15m` beside every step of
`verify` was read — by anyone who read it — as fifteen minutes each.

### Acceptance

| gate | result |
| --- | --- |
| job budget | modelled as a pool; each command charged in full to every job that needs it |
| the bound | tighter of the step's own and what its jobs have left |
| a spent pool | `exhausted`: the run fails, the step does not start, the steps after it are skipped |
| the owner | named: step, remaining pool, or a pool that was already gone |
| the clock | injected, so pool arithmetic is exact in tests and real in production |
| enforcement | unchanged and still tested against a real process |
| the verdict | `budget: verify 9m of 15m, …` — spent, not only allowed |
| `--list` | one line per job, because per step was the false statement |
| `gate-steps.test.ts` | **144 tests** (131 before) |
| `core` / `cli` / repo | **164 / 4139** · **4 / 187** · **168 / 4326** |
| the shipped gate | passes with the pools enforced: `batteries 17m of 30m` is the closest any job comes |

---

## Finding 194 — four jobs were walked as one sequence, and two endings shared one word

### The sequence that was not there

CI's jobs run independently. `needs:` is the only thing that orders them, and the shipped workflow
uses it nowhere. So a red `verify` does not stop `batteries`, and the runner — which walks one list
and stops at the first failure — was leaving work undone that CI would have done.

The direction was safe: fewer steps ran than CI would have run, never more, and each one was
recorded as `skipped` with a reason. **But "skipped" reads like a decision, and this was a
shortfall.** The plan's sentence is about what ran here; the moment a job-2 step is skipped because
a job-1 step failed, that sentence is about the wrong job.

### What per-job state costs, and what it buys

`runSteps` now keeps a failure latch *and* a cancellation per job, and evaluates each command
against the **members** it stands in for — the steps the dedupe merged, each with its own job, its
own condition and its own `continue-on-error`:

```js
    const wanted = members.filter((member) => {
      const job = jobOf(member);
      if (cancelledJobs.has(job)) return false;
      return runsGiven(member.condition ?? 'success', failedJobs.has(job));
    });
```

A command runs when **any** member wants it, which is the only rule that cannot skip work CI would
have done. Its bound is the tightest across the members that want it, and its `continue-on-error`
is no longer merged to a single `and`: a failure is fatal only for the members that did not ask for
a note, so a command that is a note in `batteries` and fatal in `verify` fails `verify` and leaves
`batteries` running. That is what CI would have done with the same command twice.

The dedupe still forces one execution point: a command serving two jobs runs once, at the position
the first of them gives it. So the **ordering** between jobs is not CI's — the outcomes, the
latches and the budgets are. That is a stated approximation rather than a silent one.

### The word that covered two endings

Implementing the above turned up something older. Since v2.21 the runner said *a timeout stops
everything*, and v2.24 kept that when it made budgets into pools. Both are wrong, and differently:

| the bound that ran out | what CI does |
| --- | --- |
| the **step's** `timeout-minutes` | kills the process, fails the step, and the job carries on — its `always()` steps still run |
| the **job's** `timeout-minutes` | cancels the job; nothing more runs in it, not even `always()` |

One word, two endings, and the runner had been reporting the second for both. `boundScope` already
existed — it is what `failureReport` uses to say whose bound it was — so the distinction was one
branch away:

```js
      for (const member of wanted) failedJobs.add(jobOf(member));
      if (scope === 'pool') cancelledJobs.set(jobOf(owner), 'budget');
```

A step bound fails the job it belongs to; a pool bound fails it *and* cancels it. Other jobs are
untouched either way.

### What the report gained, and lost

`also failed: batteries` — a run has four jobs and one verdict line, and naming only the first
failure sends a reader off to fix one thing while another is red. The `stopped: N step(s)` line is
gone: it counted steps the loop never reached, and the loop no longer returns.

Skip reasons now name the subject where there is one: `job "verify" has failed, and this step
declares no condition that widens past a failure`; for the unnamed job every fixture uses, the older
sentence — `an earlier step failed` — because `job ""` is not a name.

### Acceptance

| gate | result |
| --- | --- |
| job independence | a failing step in one job leaves the other jobs running |
| per-job latches | the rest of the failed job is skipped, naming the job |
| per-member conditions | a merged command runs for every job that still wants it |
| per-member `continue-on-error` | a note in one job, fatal in another, and the jobs diverge |
| a step bound | fails the step; the job continues and its `always()` steps run |
| a job budget | cancels the job; nothing more runs in it, and other jobs are untouched |
| the report | `also failed: batteries`; no more `stopped:` |
| `gate-steps.test.ts` | **149 tests** (144 before) |
| `core` / `cli` / repo | **164 / 4144** · **4 / 187** · **168 / 4331** |

---

## Finding 195 — one document, four heading forms, and a size that stopped it being a document

### The push that would not go

`docs/audit.md` reached 1,100,900 bytes, and the push failed twice with HTTP 400 on
`POST /git/blobs` — not a transient error but a body the endpoint would not take. The base64
encoding of that file is 1.47 MB; the same bytes as plain `utf-8` are 1.1 MB and went through.
A document that cannot be delivered is not a document, and the size had stopped being a matter of
taste some passes earlier.

### What splitting it exposed

Reading the file to split it at finding boundaries turned up something larger than the size:

```
## 49 — Signal validity: …          the first sixty-four findings
## Finding 65: the miss diagnosis…  a colon
## Finding 75 -- The `component`…   two hyphens
## Finding 140. A worktree …        a full stop
```

**Four forms for the same thing, in one document.** A census that matched `## Finding <n> — `
reported **127** entries where the log had **191** — and said nothing about the difference. That is
this repository's oldest shape, met in a markdown file: a count that answers a narrower question
than the one it was asked, and reports its answer as the whole.

It also explains a smaller mystery: findings 1–64 had always looked absent from
`grep '^## Finding'`, and nothing anywhere noticed.

### The split, and the rule that keeps it

`docs/audit.md` is now an index — scope, summary, the volume table, method, retractions — and the
findings live in four volumes of at most 280,000 bytes:

| volume | findings | bytes |
| --- | --- | --- |
| `volume-01.md` | 1–82 | 272,076 |
| `volume-02.md` | 83–112 | 274,190 |
| `volume-03.md` | 113–159 | 279,893 |
| `volume-04.md` | 160–194 | 230,023 |

The split is by size rather than by subject, because a finding that belonged to a theme keeps its
number and numbers are what the rest of the repository cites. The migration was checked by
re-parsing both sides: 191 findings before, 191 after, no duplicates, no title changes, and exactly
one body changed — finding 44's, because `## Method` and `## Retractions` sat inside it and were
lifted to the index where a reader looks for them.

### The guard, and what it refuses

`scripts/check-audit-volumes.mjs` fails when: a volume is over budget; the volume names skip a
number; a heading is one of the old four forms; a number appears twice or goes backwards; a volume
holds no finding; or a volume exists that the index does not name.

**Absent numbers are reported, not refused.** The log has three (118, 132, 133) and no record of
why. Printing them in the OK line is the honest answer; refusing them would force an invention.

### The check whose scope shrank

`blocker-claims.test.ts` scans the audit for unsupported blockers, and it read `docs/audit.md`.
After the split that file is 47 KB of an 1.08 MB corpus, so the rule would have kept returning "no
unsupported blocker" over a fifteenth of the evidence — **a check whose scope shrank while its
verdict stayed green**, which is worse than no check because it looks like one.

It now reads the index plus every volume, and asserts the corpus is more than three times the
index, so a mistyped path fails rather than passes.

### Two failures the existing guards caught while this was being written

| guard | what it said |
| --- | --- |
| `bounded-spread.test.ts` | `numbers.push(...found)` and `errors.push(...indexCovers(…))` — twice, in the guard itself: a spread whose length is a function of the input |
| `cold-tree-job.test.ts` | `docs:check:cold` gained a member the measured set did not name; the member was then measured with `packages/core/dist` moved aside, and it exits 0 |

Both were fixed rather than declared. The second is worth stating: the table is appended to **after**
the measurement, and the comment records the command and its output.

### The guard's own two defects, both found by running it

The second was found by the first run against the real log; the third by the first
append after the split.

1. **A quoted heading is not a heading.** This finding quotes all four old forms in a
   fenced block, and the guard counted them — four errors against its own example.
   The fix is a fence flag, and the distinction is worth keeping: the guard was right
   about the text and wrong about the document.
2. **A table of contents that has drifted is worse than none.** The index row says
   how many findings a volume holds, and an append changes that number. The guard now
   reads the row and compares it with the file, so the number cannot rot:
   `docs/audit.md says volume-04.md holds 160–194 (35 entries); the file holds
   160–195 (36)`.

The first version of the index also printed each volume's byte count. That column is
gone: it changes on every append, and a number that must be retyped on every append is
a number that will be wrong. The guard prints the largest volume against the budget
instead, which is a measurement rather than a copy.

### Acceptance

| gate | result |
| --- | --- |
| the index | 47 KB; names all four volumes once, with ranges and counts the guard checks |
| the volumes | 4 files, each ≤ 280,000 bytes, findings 1–195 |
| the migration | 191 findings before and after; no duplicates; no title changes; one body changed on purpose |
| the guard's own defects | two, both found by running it: a fenced quotation counted as a heading, and a table row that can drift |
| heading forms | one; the guard refuses the other four by name |
| absent numbers | 118, 132–133, printed in the OK line |
| the blocker scan | reads index **and** volumes, and asserts the corpus is >3× the index |
| `audit-volumes.test.ts` | **16 tests**, including two that spawn the command, one for the fence, one for a stale row |
| `bounded-spread` / `cold-tree` | both caught this pass's own work; both fixed at the cause |
| `core` / `cli` / repo | **165 / 4160** · **4 / 187** · **169 / 4347** |
| gate sites | **70** across 41 scripts |
