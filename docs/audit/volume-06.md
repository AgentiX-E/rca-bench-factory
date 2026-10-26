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
