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
