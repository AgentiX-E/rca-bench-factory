## Finding 255 — the corpus is two documents joined by one string, and nothing read both

Every case in `golden-master/fault-cases/index.json` names the extraction sample it was annotated
from. `sampleId` is checked: it has to exist in the key, twice, and it has to be the sample whose
`incidentText` every quote is verified against. What was never checked is what the two sides *say*.

The key states three things about an incident:

```json
{ "id": "resource-cpu-saturation-checkout",
  "expected": { "type": "cpu-saturation", "category": "resource", "component": "checkout-api" } }
```

and the annotation states them again, from the text:

```json
{ "fault": { "type": "cpu-saturation", "category": "resource" },
  "groundTruth": { "rootCauseComponent": "checkout-api" } }
```

Ten cases agreed on all three — **by habit, not by rule**. A disagreement would not have been a
cosmetic inconsistency: `rootCauseComponent` is the answer a solver is scored on, and `category`
decides which export a case lands in, so a case could have been scored against one answer while the
key that produced it asked for another.

### The rule

The guard now compares the three, and names both sides when they differ:

```
'history-checkout-cpu-saturation' declares root cause component 'payment-service', and the
sample it is annotated from expects 'checkout-api'
```

All three rather than the component alone, because they are one claim about one incident: a rule
covering only the answer would still let a case be filed under a category its own key does not use.

### What the rule immediately did to the next case I wanted to write

`middleware-redis-latency-cache` was the sample for the eleventh case. Its text says the cache's GETs
went from 0.4ms to 55ms, that the Redis instance's single command thread is saturated, and that a
`KEYS` command issued every thirty seconds by an unrelated debugging script is in the SLOWLOG. The
cause is the Redis instance; the key says the component is **`session-cache`**, which is the victim.

So the rule refuses the honest annotation:

```
declares root cause component 'session-redis', and the sample it is annotated from expects 'session-cache'
```

which is the right outcome and an unresolved question rather than a bug. Three readings are possible
and none of them is mine to pick inside a corpus round: the key is wrong about the component; the key
means the *service that owns the datastore*, which the corpus's graph would have to say; or the corpus's
`rootCauseComponent` names the workload an operator pages rather than the component that failed, which
is how `tax-calculation` and `partner-portal` were already treated. The case waits, and the item is
recorded.

### What this does not prove

That the key is right. The rule makes the two documents agree; it cannot make either of them correct.
What it removes is the failure mode where they disagree *silently* — the benchmark scoring an answer
that the data it was built from does not ask for.

### Acceptance

| gate | result |
| --- | --- |
| the three fields | `fault.type`, `fault.category`, `groundTruth.rootCauseComponent` compared with `expected.type`, `expected.category`, `expected.component` |
| the message | both sides named, so a reader does not have to open the key to know what changed |
| the corpus | all ten cases agree; the guard prints `10 of 30` as before |
| the refusal | a scratch corpus with a changed component is refused, and so is one with a changed type or category |
| the sample that waits | `middleware-redis-latency-cache` cannot be annotated honestly until the question above is answered |
| `core` / repo | **186 / 4604** · **190 / 4791**; coverage 99.97 / 99.76 / 100 / 99.97 |
| the meta-gate | **46 gates, 46 caught, 0 survived** |

## Finding 256 — the answer and the broken thing are on two sides of a call edge

Finding 255 refused this case and left a question: the key says the component is `session-cache`,
while the thing that failed is the Redis instance, and I would not pick a reading inside a corpus
round. The answer was already in the corpus, twice:

| case | `rootCauseComponent` | `rootCauseEntityId` |
| --- | --- | --- |
| `history-runtime-container-crash-loop-media` | `media-transcoder` | `container:.../media-transcoder-app` |
| `history-runtime-pod-kill-user-profile` | `user-profile` | `pod:.../user-profile-0` |
| `history-middleware-redis-latency-session-cache` | `session-cache` | `db:.../session-redis` |

**The component is the service an operator names; the entity is the thing that failed.** A container
and a pod are parts of a service; a datastore it calls is not part of it, and that is the only thing
new here — the first case where the two sit on different sides of a `calls` edge. So the annotation is
not a compromise between the key and the text: it is the same split the corpus has been making since
the crash-loop case, applied where it is finally visible.

### What the case is, and the three things it adds

`history-middleware-redis-latency-session-cache`: cache GETs at 0.4ms become 55ms at 21:30 and stay
there, because the instance's single command thread is held by a `KEYS` command an unrelated
debugging script issues every thirty seconds.

- the first `db` entity in the graph, and the first causal chain that starts at one while the answer
  is the service that calls it;
- the first **configuration** checkpoint whose parameter is a *cadence* (`keysIntervalSeconds: 30 s`)
  rather than a limit, cited by the case's own parameters and compared exactly;
- a control that says `normal` rather than `zero`.

That last one is the small discipline worth recording. "Application-side connection pool utilisation
is normal, so clients are not the bottleneck" invites `== 0`, and `== 0` would be false: the pool was
being used, it was simply not near its ceiling. The checkpoint asserts `< 100 %`, the level is the
annotation's and the assertion is the text's — which is the same division the corpus uses everywhere
else, applied to a sentence that reads like a zero.

### The chain, and what it now demonstrates

One hop, `db:session-redis -> service:session-cache`, with the thread figure, the interval and the
latency behind it. It also settles a question finding 255 left open in prose: a chain's first entity
need not be named by `rootCauseComponent`, and nothing should require it. Two cases already started
above their root cause (`public-ingress`, `worker-3`); this one starts *below* it, at a dependency,
because that is where the propagation began.

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **11 of 30** samples carry a four-layer case; floor 11 |
| the references | **33 of 33** resolve by kind -- 26 series, 2 computed from 4 readings, **4** configuration facts; **0 of 30** comparable assertions fail |
| the graph | 26 entities / 16 edges; the first `db` |
| the exports | RE1 11 / 0 empty, RE2 11 / 16, RE3 2 / 3 empty / 9 skipped |
| the baselines | both place `session-cache` in top-K |
| `core` / repo | **186 / 4604** · **190 / 4791**; coverage 99.97 / 99.76 / 100 / 99.97 |
| the meta-gate | **46 gates, 46 caught, 0 survived** |

## Finding 257 — the first chain with one entity, and a paraphrase the quote check caught

`middleware-database-connection-pool` is the corpus's twelfth case, and the first whose causal chain is
a **self-hop**:

```json
{ "step": 1, "from": "service:.../billing-service",
  "to":   "service:.../billing-service",
  "mechanism": "twenty threads hold twenty connections while waiting on a lock held by a transaction
                that is itself waiting for a connection" }
```

That shape is why finding 253's rule collapses self-hops instead of refusing them, and this is the
first annotation that needed it: the deadlock is a cycle among the service's own threads, so there is
no second entity to reach. The rule was written against a unit-test fixture; a corpus case is the first
time it paid.

### The case, and the three things it exercises

The billing service throws `connection pool exhausted` after a replica promotion; the pool's twenty
connections are all held; the primary reports no long-running query.

- **a log line as evidence rather than decoration.** The checkpoint asserts `contains` the error string
  the service itself logs, which is the symptom a human reported. The corpus's other log checkpoints
  quote a fault's own line; this one quotes the *victim's*.
- **two numbers that are one fact.** `cp-connections-held == 20 count` and `cp-pool-size == 20 count`
  (a configuration fact) state the ceiling twice — once as a reading, once as the pool's declared size —
  so a change to one makes the other fail rather than drifting quietly.
- **a database that is in the graph, in the evidence, and still not the cause.** `cp-no-long-query
  == 0 count` is the control, and it is a counted zero: the transactions the threads wait on are queued
  in the client, so the server has nothing running to report.

### The paraphrase

The first run refused the annotation:

```
cites a process quote the incident text does not contain:
'The deadlock is entirely inside the service's client pool'.
Paraphrasing the source from memory produces this, and the case would then rest on a sentence nobody
wrote.
```

The text says *"the deadlock is entirely inside the service's client pool"* — lowercase, because it
continues the sentence before it. One character of case, and the check caught it because it compares a
folded substring rather than my memory of the paragraph.

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **12 of 30**; floor 12 |
| the references | **37 of 37** resolve by kind -- 28 series, 2 computed from 4 readings, **5** configuration facts, 2 log lines; **0 of 33** comparable assertions fail |
| the chain | the corpus's first self-hop, and the first case that justifies the collapse rule |
| the graph | 28 entities / 17 edges |
| the exports | RE1 12 / 0 empty, RE2 12 / 17, RE3 2 / 3 empty / 10 skipped |
| `core` / repo | **186 / 4604** · **190 / 4791**; coverage 99.97 / 99.76 / 100 / 99.97 |
| the meta-gate | **46 gates, 46 caught, 0 survived** |

## Finding 258 — two numbers that stayed in step by being edited together

Finding 257's case states one fact twice:

```json
{ "checkpointId": "cp-connections-held", "signalRef": "client_pool_connections_in_use",
  "comparator": "==", "value": 20, "unit": "count" }        // a reading
{ "checkpointId": "cp-pool-size", "signalRef": "poolSize",
  "comparator": "==", "value": 20, "unit": "count" }        // a parameter
```

Both are twenty, and the corpus asserted both, so a change to the pool's size would have made one of
them fail. That is a real check and it was the best available: a series' `baseline` and `post` were
numbers, and a number cannot read a parameter. The item had been open since finding 250 — "a parameter
is tied to the text only through the fault layer's quote" — and restated in v2.84 as "the two numbers
that are one fact are not linked".

### The reading may now be a reference

```json
{ "metric": "client_pool_connections_in_use", "unit": "count",
  "baseline": 3, "post": { "parameter": "poolSize" } }
```

`readDeclaredReading` (`ir/parameters.ts`) is the shape reader, and the guard is the resolver: it owns
the case's parameters, and the split matters because a malformed reference and a reference to something
absent are two different repairs. Its refusals:

| the file says | the guard says |
| --- | --- |
| `post: { parameter: 'poolSize' }` in a case that declares no such key | which keys it does declare |
| `post: { parameter: 'container' }`, and `container` is a name | the value is not a number or a `{ value, unit }` quantity |
| `post: { parameter: 'cpuLimit' }` in a series in `count`, `cpuLimit` in `mcore` | not convertible |
| `post: "five"` | neither a number nor a `{ parameter }` reference |

**Resolution happens once**, into a hash that four consumers read: the unit-range check, the expansion,
the expression evaluator, and the checkpoint comparison. Before this, each of them read `declared.post`
directly, which is also how the *third* copy of the six comparison operators survived finding 247: this
round found it still in the series branch, and it is now `compareExactly` like the others.

### The corpus

Two series now cite instead of copying: the billing case's `client_pool_connections_in_use.post` is
`{ parameter: 'poolSize' }`, and the pod-kill case's `pod_ready_after_start_seconds.post` is
`{ parameter: 'readyAfterSeconds' }`. Editing a parameter now moves the reading, which is what "the
reading reaches the ceiling because it *is* the ceiling" should have meant all along.

### What this does not do

It does not derive a reading from arithmetic over several parameters: the expression language reads
series, and a parameter is not a series. It also does not check that the parameter is *true* — the
value is still tied to the text only through the fault layer's quote, and that item stays open.

### Acceptance

| gate | result |
| --- | --- |
| the shape | `readDeclaredReading`: finite number → literal; `{ parameter: <non-blank> }` with no other key → reference; everything else → `undefined` |
| the refusals | four, each with its own message, each tested through a real guard run |
| the resolution | one hash read by the range check, the expansion, the evaluator and the checkpoint comparison |
| the comparison | the series branch now calls `compareExactly`; the package has one implementation of the six operators again |
| the corpus | two series cite a parameter; **12 of 30**, `37 of 37` references, `0 of 33` comparable assertions |
| `core` / repo | **186 / 4613** · **190 / 4800**; coverage 99.97 / 99.76 / 100 / 99.97 |
| the meta-gate | **46 gates, 46 caught, 0 survived** |

## Finding 259 — a fault whose scope is a size, and a device the graph has no word for

`network-mtu-catalog-service` is the thirteenth case: after the overlay was rebuilt onto a path whose
MTU is 1,400 bytes, catalog responses larger than one segment hang, while the pod's interface still
advertises 1,500 and its health checks stay green.

### Two of the four checkpoints are the absence of a symptom

| checkpoint | reading | role |
| --- | --- | --- |
| `cp-large-hang == 1` | every large request hangs | the symptom |
| `cp-small-unaffected == 0` | small payloads are untouched | the control that makes this a *size threshold* |
| `cp-health-green == 1` | the probe never failed | the control that explains the alerting gap |
| `cp-path-mtu == 1400 By` | the path's MTU, from the case's parameters | the fact the interface has to fit inside |

Without the first zero the case reads as "the network broke"; with it, the case says something a solver
has to reason about — a threshold, not an outage. Without the green health check there is no reason the
orchestrator saw nothing. **This is the corpus's first case where two of four checkpoints assert that
nothing happened**, and it is the reason the case is worth having.

### The device the graph has no word for

The text says "a router on the new path reports dropping fragments". The graph's kinds are `service`,
`pod`, `node`, `container`, `db`, `mq`, `host`, `cluster`, `external` — a router is a `node`, but an
edge from a service to a router has no relation in the vocabulary (`contains`, `hosts`, `calls`,
`same_as`), and `calls` would be a lie about the direction of the relationship. So the router is named
in `rootCauseReason` and is **not** an entity, the chain is `pod -> service`, and the annotation's
`why` says so in as many words. The alternative — an edge whose relation is wrong — would have put a
false statement in the graph to make a chain pass, which is the trade this repository refuses
everywhere else.

### The unit that had never been used

`By` and its 1,024-family have been in `util/unit.ts` since the conversion table was written and no
corpus case had a reading in bytes. This one has two: the path's MTU and the interface's, both exact,
both in `By`. The configuration checkpoint cites the path's and the series with the size threshold stay
in `1`.

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **13 of 30**; floor 13 |
| the references | **41 of 41** resolve by kind -- 31 series, 2 computed from 4 readings, **6** configuration facts; **0 of 37** comparable assertions fail |
| the graph | 30 entities / 18 edges |
| the exports | RE1 13 / 0 empty, RE2 13 / 19, RE3 2 / 3 empty / 11 skipped |
| the baselines | both place `catalog-service` in top-K |
| `core` / repo | **186 / 4613** · **190 / 4800**; coverage 99.97 / 99.76 / 100 / 99.97 |
| the meta-gate | **46 gates, 46 caught, 0 survived** |

## Finding 260 — a vocabulary in four places, and the member that found them

Finding 259's case needed an entity the graph had no word for: a router on the network path. The
relation set was `contains`, `hosts`, `calls`, `same_as`, and none of them describes "traffic for this
target passes through this source" — `calls` lies about the direction, `hosts` lies about containment.
So the router stayed out of the graph and the annotation said so in prose.

The repair is one member, `routes`, and adding it was an experiment in how many places a vocabulary
can live. It found four:

| place | what it was |
| --- | --- |
| `ir/schema.ts` | an inline `z.enum(['contains', 'hosts', 'calls', 'same_as'])` — the admission list |
| `ir/types.ts` | `type EntityRelation = 'contains' | 'hosts' | 'calls' | 'same_as'` — the union |
| `entity/graph.ts` | `VALID_RELATIONS = ['contains', 'hosts', 'calls', 'same_as']` — the runtime guard |
| `docs/data-model.md` | an inline union inside the `EntityEdge` interface snippet — the document |

Adding `routes` to the first and the third, and to neither of the others, produced a graph the schema
admitted and the validity check refused (`unknown relation 'routes'`), which is exactly the split the
campaign's published-vocabulary gate exists to prevent — for the six vocabularies that had a table. The
relation set had no table, so nothing read it.

### What it is now

`EDGE_RELATIONS` is a tuple in `ir/types.ts`, `EntityRelation` is derived from it, the schema is
`z.enum(EDGE_RELATIONS)`, `VALID_RELATIONS` *is* the tuple, and `docs/data-model.md` has a row in the
published-vocabulary table. The gate went from six vocabularies to seven and from nine inline enums to
eight.

`EdgeRelation` — a second type name I introduced beside `EntityRelation` in the same edit — is gone.
Two names for one type is the same defect as two lists for one vocabulary, one level up.

### What the member buys

```json
{ "from": "node:synthetic-storefront/edge-router-2",
  "to":   "pod:synthetic-storefront/catalog-service-0",
  "relation": "routes" }
```

The MTU case's path-MTU checkpoint now has an owner — the device that reports dropping fragments —
and the graph says why: traffic for that pod passes through that router. The case's `why` no longer
explains what the graph cannot say, because the graph can say it.

### What this does not do

It does not add `depends_on`, `replicates_to`, `reads_from` or the other relations a real topology
would want. Each one needs a *reader* that would use it, and a vocabulary member nobody writes is a
member nobody can check.

### Acceptance

| gate | result |
| --- | --- |
| the vocabulary | seven published, each declared once; `EDGE_RELATIONS` read by the schema, the union, the validity guard and the document |
| the types | one name: `EntityRelation`, derived from the tuple |
| the corpus | the router is an entity; 31 entities / 19 edges; the path-MTU checkpoint cites it |
| the gate | `check-data-model-vocabularies` reports 7 vocabularies and 8 inline enums |
| `core` / repo | **186 / 4613** · **190 / 4800**; coverage 99.97 / 99.76 / 100 / 99.97 |
| the meta-gate | **46 gates, 46 caught, 0 survived** |

## Finding 261 — the fourth anchor died of a filesystem nobody measured

The scheduled run of `official-data.yml` on 2026-10-26 downloaded `RE2-OB`, verified it, and then
stopped:

```
VERIFIED  rcaeval-re2-ob: bytes=1191025569 sha256=0605a36cdcad8a6ae0107f2357c9c91ecee2c4ab5d72579bffea0372d9747513
error: rcaeval-re2-ob: unzip failed - /tmp/official/RE2-OB/recommendationservice_mem/2/traces.csv:
       write error (disk full?).  Continue? (y/n/^C)
```

and wrote this in its own summary:

> **Unreachable** (exit status 1). An asset could not be downloaded. The per-asset reason is in the log
> above, one `SKIPPED` line per asset, and re-running is a reasonable next step.

Three claims, all false. The asset *was* downloaded — that is what `VERIFIED` means, and the digest
matched the registry to the byte. The status was not a download failure. And re-running was the one
thing that could not help: the run had spent six minutes and 1.2 GB establishing that the destination
is too small.

### The filesystem was the thing that changed

`/tmp` on the ubuntu-24.04 runner image is part of the ~74 GiB root disk. On ubuntu-26.04 it is a
tmpfs. The same workflow, unchanged, succeeded on 2026-10-12 — the log's own first lines say
`Image: ubuntu-24.04` — and `ubuntu-latest` moved to 26.04 on 2026-10-19, which the run's annotations
also said out loud:

```
! The ubuntu-latest label will migrate to Ubuntu 26 beginning October 19, 2026.
```

The failure measured itself and nothing read it. Before the fetch: `tmpfs 7.9G 52M 7.8G 1% /tmp`. After
the failure: `tmpfs 7.9G 6.3G 1.6G 80% /tmp`. The extraction had written 6.3 GB of a tree that needed
more and had 1.6 GB left — in the one directory the workflow had built its design around.

**A measurement with no reader.** The workflow ran `df -h /tmp` twice, before and after, on purpose:
the step's name is "Report free disk before the fetch". It reported. Nothing compared. That is this
project's oldest shape — a claim nobody reads — arriving at the layer below the code, where the
"claim" is a filesystem assumption and the "reader" is a number printed into a log.

The second half is the vocabulary. `fetch-official.mjs` documented three exit statuses (0, 1, 2) and
`unzip`'s failure was not one of them, so it fell to `fail()` → 1 → "could not be downloaded" → "try
again". The advice was not merely unhelpful; it was the opposite of the truth, delivered with the
confidence of a check.

### What it is now

Three changes, one per layer, because the defect has three layers and fixing two of them would leave
the anchor broken in a way that reads as working.

**The destination.** `OFFICIAL_DIR=$RUNNER_TEMP/official`, assigned in the job's first step and
exported through `$GITHUB_ENV`, read by every later step that writes or measures. `$RUNNER_TEMP` is on
the root filesystem; the workflow header says why, with the dates. One variable because the previous
arrangement had the destination in the fetch step and the destination *measurement* in a step that
named a different path — two copies of one fact, which drifted the moment the first one changed.

**The check.** `scripts/fetch-official.mjs` now measures twice per asset, exactly:

| when | requirement | where it comes from |
| --- | --- | --- |
| before the transfer | the archive | `asset.bytes`, the registry's pin |
| after it, before extraction | the tree it expands to | the archive's own central directory |

The first exists because a 1.2 GB transfer into 900 MB is a minute of network spent learning what
`statfs` already knew. The second is the one that would have caught this run, and it is exact rather
than estimated: the central directory is the archive's own statement of what extraction writes. No
ratio, no margin, no rule of thumb — the two numbers are compared to the byte, and the refusal prints
both.

**The vocabulary.** Five codes, each naming a different thing to change:

| code | meaning | what to do |
| --- | --- | --- |
| 0 | fetched, verified, unpacked | nothing |
| 1 | an asset could not be obtained | wait, then retry |
| 2 | the bytes do not match the pin | read the digest |
| 3 | the destination cannot hold the corpus | move the destination |
| 4 | matched its pin, would not unpack | look at what upstream serves |

The workflow's `case` now has a branch for every one of them, and its `*` fallback names no cause at
all. That last part matters more than it looks: the fallback used to say "an asset could not be
downloaded" and so described an unrecognised status — a signal, an OOM kill — as a network problem.
**A fallback that asserts a cause it cannot know is how a full disk came to be called unreachable.**

### The fix's first version did not parse

It named the four paths in `jobs.<id>.env` as `${{ runner.temp }}/...`, which is the obvious place and
is invalid: the `runner` context does not exist at job level. GitHub rejected the file outright —

```
HTTP 422: Invalid Argument - failed to parse workflow: (Line: 136, Col: 21):
  Unrecognized named-value: 'runner'
```

— and the push-triggered run failed in zero seconds. **Nothing in this repository caught it**, and the
reason is worth stating exactly: every rule in the new test file reads the workflow as *text*, and the
text was fine. What was wrong was which contexts exist where, a fact about GitHub's expression
evaluator rather than about the document.

So the repair is two things: `$GITHUB_ENV` for the values, which is the mechanism that exists for
"name this once and use it below"; and a seventh rule that reads the same text for the same class —
no `runner` or `steps` expression may appear above `steps:`. That is narrow, and it is decidable, and
it would have refused the file that GitHub refused.

### The second version ran, and failed nine seconds in

`##[error]Process completed with exit code 1`, at the naming step, with nothing else. The step
exported `OFFICIAL_DIR` to `$GITHUB_ENV` and then used `$OFFICIAL_DIR` two lines later. **A name
exported for later steps does not exist in the step that exports it**, and under `set -u` that is an
unbound variable.

Two failures, two dispatches, and the second one is the more interesting: the first was a fact about
GitHub's expression evaluator that the document could in principle encode, and the second is a fact
about shell scope that no reading of the document can decide. **The text rules were the wrong
instrument for this step** — they can say "the destination is named once" and cannot say "the block
runs".

So the step now has a third check, and it is not a reading: `official-data-destination.test.ts` runs
the naming step's `run:` block under `bash` with a temporary `RUNNER_TEMP` and a temporary
`GITHUB_ENV`, and asserts the exit status, the five exported names, and that both directories exist.
Alongside it sits the negative control — the assignment deleted, the export kept — which must exit
non-zero and name the variable. That control is the shipped defect, and it is the reason the positive
test means something.

Shell locals now come first and the export second, so the block is written in the only order that can
work: values, then the environment that carries them forward.

### Reading the archive's own statement

The expansion is read from the central directory with four syscalls, not from `unzip -l`. The reason is
ordering rather than taste: the number decides whether to run `unzip`, and taking it from the output of
the program being decided about cannot happen before the damage. It is also one less format to keep
agreeing with another program's version.

The reader follows zip64 (all three sentinels — count, directory size, directory offset — and the
`0x0001` extra field for a 4 GiB entry), and it refuses to guess. An archive it cannot parse yields
`UNMEASURED <asset>: <reason>` and extraction proceeds, because **a parser limitation is not a
statement about the destination** — collapsing the two would refuse a corpus over a bug in my own
reader. The distinction is asserted directly: the test that serves a file which is not a zip expects
`UNMEASURED` and exit 4, while the tests that serve a lying central directory expect `NOROOM` and exit 3.

### Two smaller things in the same class

The script's header said "Three properties are enforced rather than assumed" and then listed four. A
hand-counted number nothing reads, one paragraph above the code that this finding is about; it now says
five and lists five.

`const skipped = results.filter((r) => r.status === 'skipped');` was declared and never read — the
unreachable calculation below it had its own filter. The binding produced the reassuring impression that
skips were accounted for somewhere. Deleted.

### What this does not do

It does not make the anchor pass. It makes the next scheduled run *able* to pass, and makes a failure
of this kind legible if it does not; the proof is the run, and no test in this tree can stand in for it.

It does not validate the rest of the workflow's steps the way it validates the naming step. Two
dispatches found two defects that no test could see, and only one of them now has a check that
executes rather than reads; the other steps are still read as text.

It does not check an anchor's peak usage in one number. Each asset is measured when it is fetched, which
is exact because the archives are deleted as they are unpacked — but the check is per-asset by
construction, not per-run.

It does not catch a destination that shrinks *during* a long extraction. The preflight reads free space
at one instant; a concurrent writer between that instant and `unzip` could still exhaust it, and the
result would be exit 4 with `unzip`'s own words rather than exit 3.

It does not verify that `runner.temp` is large enough on a future runner image. It is on the root
filesystem today; the check is what will say so if that changes, in six seconds instead of six minutes.

### Acceptance

| gate | result |
| --- | --- |
| the destination | one variable, `$RUNNER_TEMP/official`, assigned once; no executable line in the workflow names `/tmp` |
| the preflights | two per asset, exact; 4 tests, all four red against the pre-fix script |
| the vocabulary | five codes documented in the script, five branches in the workflow, a `*` that names no cause |
| the workflow rules | 7 rules over the text, each re-run against a mutation that must trip it, plus 2 that execute the naming step |
| `core` / repo | **187 / 4635** · **191 / 4822**; coverage 99.97 / 99.76 / 100 / 99.97 |
| the site inventory | **88 failure sites across 46 scripts**; the two new sites annotated `proved` |
| the documents | typecheck, lint, `docs:check` green; audit 6 volumes, findings 1–261 |

## Finding 262 — a retry that starts from zero is not a retry

The dispatch that followed finding 261 got further than any run before it. `RE2-OB` and `RE2-SS`
verified **and unpacked** — the extraction that killed every previous attempt now works — and the
fetch moved on to the third asset:

```
15:51:10  VERIFIED  rcaeval-re2-ob: bytes=1191025569 sha256=0605a36c…
15:51:45  EXTRACTED rcaeval-re2-ob
15:53:26  VERIFIED  rcaeval-re2-ss: bytes=245629018 sha256=7aff9a3a…
15:53:33  EXTRACTED rcaeval-re2-ss
16:08:33  RETRYING  rcaeval-re2-tt: attempt 1/3 after 15m 0s: curl: (28) Operation timed out after
          900000 milliseconds with 2733226372 out of 2801345134 bytes
16:23:36  RETRYING  rcaeval-re2-tt: attempt 2/3 after 15m 0s: curl: (28) Operation timed out after
          900000 milliseconds with 2605066672 out of 2801345134 bytes
16:34:06  ##[error]Process completed with exit code 124
```

The third asset is 2 801 345 134 bytes. Attempt one moved 2 733 226 372 of them — **97.56%** — in
900 seconds, which is 3.04 MB/s. The whole file therefore needs 15.4 minutes and the attempt allows
15. **The ceiling is below the work**, so no number of attempts can finish it while each attempt
starts from zero. Attempt two proved the point by moving *less* (2 605 066 672, 2.89 MB/s), and the
workflow's 50-minute wrapper killed attempt three two minutes in.

What the run cost: 50 minutes, 6.3 GB of transfer, two verified assets on a disk that was thrown
away, and a summary that said "timed out … no measurement".

### The defect is the restart, not the ceiling

Raising the ceiling would have worked for this file at this rate, and would fail again the moment
either changed — the rate is the host's, and 3 MB/s is not a bound anybody chose. The defect is that
**an attempt's failure discards the bytes it did transfer**: `curl -o` truncates, so attempt two did
not continue attempt one, it overwrote it. A retry whose second attempt re-does the first is not a
retry; it is the same attempt, run again, with the same outcome.

So the retry now resumes. `--continue-at -` makes each attempt start at whatever is on disk, which
is zero for a first attempt and 2 733 226 372 for the attempt that follows this one. The per-attempt
bound stays at 900 seconds: it is a bound on *stalling*, and with a resume it bounds the right thing.

Three consequences had to be handled, and each has a test:

| case | what happens | why it matters |
| --- | --- | --- |
| the partial is longer than the pin | it is discarded before the first attempt | no prefix of the right file can be that long; resuming past the end asks for a range that does not exist |
| the server ignores `Range` | curl exits 33, the partial is discarded, the next attempt starts clean | an attempt that asks to resume is the only shape such a server *cannot* satisfy |
| the attempt was cut at 97% | the retry prints what it will resume from | the production log could not say whether attempt two started at 0 or at 2.7 GB, and that is the fact that decides whether retrying is worth anything |

The last one is the reporting half of the same defect. `RETRYING … [2733226372 bytes (2.5 GiB) kept
for the next attempt]` is now printed, measured on disk *after* the attempt rather than at its start,
because those two numbers differ exactly when the attempt made progress.

### What the wrapper is allowed to be

`timeout 3000` became `timeout 4200`. The old number was justified by an arithmetic that assumed
every asset finishes inside one attempt — 50 minutes for three assets — and the largest asset cannot.
The new one is stated with its reasoning in the workflow: the transfer takes 15.6 minutes at the rate
the host delivers, a second attempt is therefore normal, and 70 minutes leaves the build and the
round trip inside the job's 90.

### What this does not do

It does not make the anchor pass. Two of three assets now reach the disk and are unpacked; the third
needs a resumed attempt, and whether it gets one is the next dispatch's answer.

It does not bound the *total* transfer per asset: three attempts of 900 seconds each is 45 minutes
per asset, which for three assets exceeds the wrapper. The wrapper is the global bound and the
script's is the local one, and a run that hits the global bound still reports only that it hit it.

It does not resume across runs. A runner is discarded, so a partial file never survives one; the
resume is within a run, which is the only place it could matter here.

### Acceptance

| gate | result |
| --- | --- |
| the resume | `--continue-at -`; 3 tests, all three red against the pre-fix script |
| the discarded partials | too-long and range-refusing, each with its own route and its own assertion |
| the report | the retry line names the bytes kept, measured after the attempt |
| the wrapper | 4200 s, with the arithmetic and the measured rate in the comment |
| `core` / repo | **187 / 4638** · **191 / 4825**; coverage unchanged |
| the site inventory | 88 sites across 46 scripts; annotations carried by fingerprint |
| the battery | **6 injections, 6 caught, 0 survived**; the new row removes `--continue-at` and 26 tests go red |

## Finding 263 — 270 cases, one reason, and a corpus with a second shape

The dispatch that followed finding 262 is the first run in this repository's history to fetch an
entire anchor:

```
18:34:19  VERIFIED  rcaeval-re2-ob: bytes=1191025569 sha256=0605a36c…
18:34:54  EXTRACTED rcaeval-re2-ob
18:36:28  VERIFIED  rcaeval-re2-ss: bytes=245629018 sha256=7aff9a3a…
18:36:37  EXTRACTED rcaeval-re2-ss
18:49:47  VERIFIED  rcaeval-re2-tt: bytes=2801345134 sha256=6706311d…
18:51:33  EXTRACTED rcaeval-re2-tt
18:51:33  REPORT    …/pins.json: 3 pin(s) measured
18:51:34  registry pins agree with this download
```

Three assets, 4.2 GB, both large ones resumed after their first attempt was cut — **the resume works,
and so does the space check, and the registry's pins are correct against a fresh measurement**. The
corpus then reached the round trip, which declared 270 cases and failed all 270:

```
ROUNDTRIP declared 270 case(s), found 2978 file(s), 364 directory(ies)
ROUNDTRIP FAIL   1/270 RE2-OB/checkoutservice_cpu/1   reason=no metric payload under any known name
                 (metrics.json, data.csv); the case directory holds cluster_info.json, …
ROUNDTRIP FAIL 270/270 RE2-TT/ts-travel-service_socket/3  reason=… (the same)
```

**One reason, 270 times.** That is not 270 defects; it is one statement about the corpus that the
reader does not know, and it is the first thing this anchor has ever been in a position to say.

### What the corpus actually holds

Measured without downloading 4.2 GB again, by range-reading the archive's own index: the
end-of-central-directory record is in the last few kilobytes, the central directory is 139 156 bytes
at offset 1 190 886 391, and one entry's local slice inflates to the file. `RE2-OB/checkoutservice_cpu/1/`
contains:

| file | bytes | what it is |
| --- | --- | --- |
| `metrics.csv` | 6 782 127 | per-pod resource metrics, wide: `time`, then `<pod>_<metric>` |
| `simple_metrics.csv` | 1 188 347 | the reduced set the official rule scores: `time`, then `<service>_cpu`, `<service>_mem` |
| `tracets_lat.csv` | 4 876 | per-endpoint request counts, one row a minute |
| `logts.csv` | 9 951 | log counts per pod |
| `cluster_info.json` | 4 536 | log templates per node |
| `inject_time.txt` | 10 | a unix timestamp: `1705354566` |
| `pod-node-1.csv`, `pod-node-2.csv` | — | placement |
| `metrics_postprocess.log` | — | a processing log |

RE1 — the only corpus that has ever round-tripped here, 375 of 375 at `oracle=1` — holds
`metrics.json` and `data.csv`. **The two corpora have the same authors and different encodings**, and
the reader knows exactly one of them. The round trip's error message names the two files it looked
for, which is why the failure took one line to understand and 270 lines to confirm.

### What the sample says about the numbers

`simple_metrics.csv` has 1 443 rows for a case whose series start at 1 705 353 846 and whose
injection is at 1 705 354 566: **720 seconds of baseline, 722 seconds after**, at one row a second.
`metrics.csv` has the same 1 443 rows over per-pod columns such as
`checkoutservice_container-cpu-system-seconds-total`.

That last name is a trap worth writing down before the reader is written: `…-total` is a **counter**,
not a gauge, and the difference between "the value is high" and "the value is *still rising*" is the
difference between two different diagnoses. `SERIES_DERIVATIONS` already has a `counter`
derivation — for series the corpus *generates*. Reading a real counter is the mirror case.

### What this round does not do

It does not teach the reader the second layout. That is the next round, and it is now a specification
rather than an investigation: four files to read (`simple_metrics.csv` for the official rule,
`inject_time.txt` for the instant, `tracets_lat.csv` and `logts.csv` for the other two kinds),
two column conventions (per-pod in `metrics.csv`, per-service in `simple_metrics.csv`), one unit
question (counter versus gauge), and one skip that the deriver already handles
(`RE2-OB/checkoutservice_multi-source-data` carries no case layout).

It does not establish that RE2 will score. A case that cannot be read is not a wrong answer, and
`oracle=0` on 270 cases would have been a worse outcome than this: a failure that names one cause.

### Acceptance

| gate | result |
| --- | --- |
| the fetch | 3 of 3 assets verified, extracted, 3 pins measured, registry agrees |
| the resume | `RE2-TT` completed across attempts; 13 minutes for 2.8 GB |
| the round trip | 270 declared, 270 failed, **one** reason, named per case |
| the layout | measured from the archive's central directory, quoted above |
| the tree | unchanged this round: core **187 / 4638**, repo **191 / 4825**, coverage unchanged |
