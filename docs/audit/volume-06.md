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
