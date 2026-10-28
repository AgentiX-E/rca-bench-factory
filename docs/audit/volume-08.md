## Finding 276 — the loudest series is not the answer, and the corpus could not say so

Finding 275 ended with a number that was not flattering: a peak-z baseline was right at rank 1 in
thirteen of fifteen cases. That number could not be produced before the rankings were widened, and
producing it was the point — but a measurement is not a repair. This round builds the case the number
was asking for, and then the rule that keeps the corpus from sliding back.

### The case

`history-middleware-replica-lag-analytics`, annotated from its own incident text. The text states the
mechanism and, twice, that the component with the most traffic is fine:

> Reads go to a replica whose relay log position fell 40 minutes behind the primary. The primary is
> healthy; a bulk backfill on the primary is generating write volume the replica's single applier
> thread cannot match. Reads on the primary are current.

So the case is built with the two ratios deliberately inverted against the answer:

| series | baseline | post | ratio | what it is |
| --- | --- | --- | --- | --- |
| `orders-db.write_rate` | 40 rps | 3200 rps | 80× | the load, on the healthy primary |
| `analytics-replica.replica_relay_lag_seconds` | 60 s | 2400 s | 40× | **the answer** |
| `analytics-dashboard.dashboard_total_age` | 10 min | 240 min | 24× | the symptom a reader saw |
| `orders-db.commit_latency` | 3 ms | 3 ms | — | the control that rules the primary out |

Both baselines return the primary first and the replica second. That is the case: **a method that
returns the largest excursion returns a component the text says is healthy**, and a method that
follows the causal direction returns the replica the backfill outran.

The corpus's reading, before and after:

```
before   rank 1: 26, rank 2: 4 of 30 baseline run(s); displaced in 2 case(s)
after    rank 1: 26, rank 2: 6 of 32 baseline run(s); displaced in 3 case(s)
         (history-checkout-cpu-saturation, history-dependency-upstream-5xx-pricing,
          history-middleware-replica-lag-analytics)
```

The third displacement is the one built on purpose. The other two were accidents — `checkout` because
a pod's series outranks its service's, `upstream-5xx` because two services move by the same 60% and
the tie breaks by name — which is exactly why a corpus-level rule was needed rather than a promise.

### The rule, and the weakness it states about itself

`checkDiscrimination(outcomes)` asks one thing: does any baseline run place the answer anywhere but
first? If none does, no case in the corpus can penalise a threshold-based localiser, and the report's
100% is a measurement of detection rather than of localisation. It fails the run with
`NO_DISPLACEMENT`.

It is corpus-level because the property is. No single case is wrong for having a loud answer, and
"there is at least one case that displaces the answer" is not a statement about any case in
particular.

**What it does not catch, said where the rule lives.** A tie broken by name satisfies it, so the rule
guarantees that *something* can go wrong, not that the something was designed to. That is a real
weakness and it is written into the function's own comment rather than left for a reader to discover:
the corpus's index says which case was built for it, and this rule only keeps the property from
disappearing.

### The fixture it refused on the first run

Landing the rule turned `check-fault-cases.test.ts` red in one place, and the failure was correct:

```
it('accepts a reference to a quantity the case declares, and expands the resolved number')
  -> the corpus fails G4: every one of 2 baseline run(s) places the answer at rank 1
```

`withPost` builds the checkout signals plus a scratch series whose `post` the caller chooses, and it
attributed that series to `checkout-api` — the case's own answer. Starting at zero and jumping to 500
mcore, the scratch series was the largest excursion in the window, so the fixture had become a corpus
whose answer is the loudest thing. That is what the rule refuses, and none of those five tests is
about it.

The repair is one field: the scratch series is attributed to `cart-service`, which the case does not
answer with. The question those tests ask — does a reading and a declared parameter resolve to one
number — is untouched.

Worth recording because it is the shape of every rule in this volume: **a fixture is a corpus**, and a
corpus-level rule applies to it. Writing fixtures that a rule cannot find anything wrong with is the
work; writing rules that find nothing is the failure.

### Mutation battery

| mutation | expected | observed |
| --- | --- | --- |
| the displacement rule is removed from the guard | the end-to-end refusal test fails | 1 failed / 130 |
| `checkDiscrimination` asks nothing (`if (false)`) | the unit test fails | 1 failed / 178 |
| the distractor drops to 600 rps, so the replica outranks it | the case stops displacing the answer | 28 rank-1 / 4 rank-2, `displaced in 2`, and the case's own test fails (`expected 2 to be 0`) |

The third is the interesting one: the *corpus* still passes, because two accidental displacements
remain. Only the case-specific test catches the regression — which is the argument for pinning a case
by name in a test as well as in a comment.

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **16 of 30**, 39 entities, 24 edges, floor 16 |
| the new case | four layers, 4 checkpoints (2 controls), 52 references resolved corpus-wide, 0 of 48 comparable assertions failing |
| the rule | `checkDiscrimination` / `NO_DISPLACEMENT`, exported and enumerated, 3 unit tests + 2 end-to-end |
| the reading | `rank 1: 26, rank 2: 6 of 32; the answer is displaced in 3 case(s)` and the three named |
| `core` | **190 / 4751**, coverage 99.97 / 99.75 / 100 / 99.97, `gates.ts` at 100% on all four |

## Finding 277 — three cases were displaced, one of them was evidence

Finding 276 shipped `checkDiscrimination` with a weakness it stated about itself: *a tie broken by
name satisfies it, so it guarantees that something can go wrong, not that the something was designed
to*. The corpus reported three displaced cases. This round replaced "is the answer at rank 1" with a
classification, and the number fell to one.

### What the three were

| case | rank 1 | why | what a method returning it has done |
| --- | --- | --- | --- |
| `history-checkout-cpu-saturation` | `checkout-api-0` (pod) | the pod's counter outranks its service's p99 | named the replica that was throttled |
| `history-dependency-upstream-5xx-pricing` | `pricing-service` | both move 60 %, the tie breaks by name | separated nothing; the order is a sort |
| `history-middleware-replica-lag-analytics` | `orders-db` | 80× against 40× | returned the healthy primary |

Only the third penalises a magnitude-based method *deterministically*. The first is not a miss at all
— the pod under the answer is the answer at another resolution, and the case is one a reader would
call solved. The second is a miss that depends on the alphabet: rename `pricing-service` to
`z-pricing` and the case stops displacing anything.

### The classification

`classifyDisplacement({ graph, case, ranking })` returns one of four kinds:

| kind | condition | evidence? |
| --- | --- | --- |
| `strict` | a different component, strictly louder than the answer | **yes** |
| `tie` | a different component with the same statistic, winning the name | no |
| `same-component` | the louder candidate is an ancestor or descendant of the answer under `contains` / `hosts` | no |
| `none` | the answer is at rank 1, or absent from the ranking | no |

`checkDiscrimination` now takes the classifications and requires at least one `strict`.

Two details are the whole of the judgement. **Containment is walked in one direction**: a pod under
its service is the same component, but two replicas of one service are siblings and the wrong replica
is a miss — an undirected walk would have merged them, and the first draft did exactly that until the
test said so. And **equality is not strictness**: a tie means the method's own number could not tell
the two apart.

The honesty cost is immediate:

```
before   the answer is displaced in 3 case(s)
after    strict 2, tie 2, same-component 2, none 26 of 32 baseline run(s)
         -- strictly displaced in 1 case(s) (history-middleware-replica-lag-analytics)
```

### What it broke, and why the breakage was correct

Every single-case fixture corpus in `check-fault-cases.test.ts` became a non-corpus: the checkout
fixture is `same-component`, a corpus of one such case has no `strict` displacement, and the guard
refused it — inside tests about series declarations, parameter references, and G3. **A fixture is a
corpus**, which finding 276 recorded when the rule first refused one; this round it refused a dozen.

The repair is in the fixture, not in the rule: `corpus()` appends one series on `cart-service` — a
component the case does not answer with and that does not contain it — jumping from zero to 500, with
a quote the case's own text carries. Three tests turn it off, and each says why in a line: their
subject is a *different* refusal (an empty series stops being empty when a competitor is added to it;
a flat corpus stops being flat).

### A dead branch, written and deleted in the same round

The first version ended with three arms — `> → strict`, `=== → tie`, else `none` — and the third was
unreachable from every caller, because `ranking` is the method's own output and its first entry is its
largest. Coverage said so (`135-136`). Rather than manufacture input for it, the contract moved into
the docstring and the arm was deleted:

```ts
return top.statistic === answer.statistic ? { caseId, kind: 'tie' } : { caseId, kind: 'strict' };
```

The alternative — a `throw` for a violated precondition — would have been a second branch to test for
a state no caller reaches, which is the same defect wearing an assertion.

### Mutation battery

| mutation | expected | observed |
| --- | --- | --- |
| containment is not walked | the two `same-component` tests fail | 2 failed / 115 |
| a tie counts as strictly louder | the tie test fails | 1 failed / 81 |
| the gate accepts any kind but `none` | the tie/part refusal fails | 1 failed / 72 |
| the guard classifies an empty ranking | the corpus is refused | `FAILED — 1 problem(s)` |

All restored before the acceptance run.

### Acceptance

| gate | result |
| --- | --- |
| the classification | 12 tests: four kinds, containment both ways at two depths, siblings, ambiguity, a cycle, an absent answer, an empty ranking |
| the gate | `NO_DISPLACEMENT` names the tally; 3 tests |
| the corpus | 16 of 30; `strict 2, tie 2, same-component 2, none 26` of 32 runs; strictly displaced in 1 |
| `core` | **191 / 4766**, coverage 99.97 / 99.75 / 100 / 99.97, `displacement.ts` at 100 % on all four |

## Finding 278 — the loudest thing can be fine, or it can be the symptom

Finding 277 left the corpus with exactly one case that displaces its answer by magnitude, against a
rule that needs one. A single edit — to that case's signals — would take the property away and leave
every guard green. This round adds the second, and chooses a different reason for the displacement so
that the corpus holds both.

### Two ways for a magnitude method to be wrong

| case | what outranks the answer | why that is wrong |
| --- | --- | --- |
| `history-middleware-replica-lag-analytics` | `orders-db`, the primary | it is **fine**: a scheduled backfill, commit latency flat, its own reads current |
| `history-resource-memory-request-ingest-writer` | `ingest-queue`, the backlog | it is **downstream**: the writer stopped draining it, so it grew |

The first is a method that cannot tell load from fault. The second is a method that returns the
loudest consequence. They need different evidence to be decidable — the first needs a control showing
the loud component is healthy, the second needs a counterfactual showing one change removes both
consequences (`Setting the heap to 700m removed both the kills and the double packing`) — which is why
the corpus wants both rather than two of either.

### The case

| series | baseline | post | ratio | what it is |
| --- | --- | --- | --- | --- |
| `ingest-queue.backlog_messages` | 200 | 50 000 | 250× | the queue the writer stopped draining |
| `ingest-writer.container_memory_working_set_mebibytes` | 1024 MiB | 3072 MiB | 3× | **the answer's evidence** |
| `ingest-writer.requested_memory_mebibytes` | 1024 MiB | 1024 MiB | — | **the fault, flat** |

That last row is the interesting one. Almost every control in this corpus exists to rule something
out: `node_filesystem_used_percent` at 40 rules out a full disk, `commit_latency` at 3 ms rules out
the primary. This one rules nothing out — **it is the fault**. The request never moved, and the gap
between a flat gibibyte requested and three used is the whole of the overcommit; the scheduler sized
the node by that flat number, which is why two copies ended up on one node.

It is also the corpus's first case whose decisive fact is an **absence**: `heapCapMebibytes == 0`,
meaning the JVM was started with no `-Xmx` at all. The schema can carry that as a configuration fact,
and the checkpoint's description says what the zero means, because a reader who takes it for "a heap
of zero bytes" would have read the opposite of the case.

Depth 2 — the container is reclaimed, then the restart stops the drain — so it lands at L3 and the
corpus's distribution moves `L3 5 → 6`. It is still not L4: no chain in this corpus is three steps.

### What adding a case cost this round

Nothing in the guard's tests. `CORPUS_SIZE`, `SAMPLE_COUNT`, `CODE_LEVEL_CASES` and the entity count
are all derived (finding 271), and this is the third case since that repair with no count edited by
hand. The corpus reading moved by itself:

```
before   rank 1: 26, rank 2: 6 of 32 -- strict 2, tie 2, same-component 2, none 26; strictly displaced in 1
after    rank 1: 26, rank 2: 8 of 34 -- strict 4, tie 2, same-component 2, none 26; strictly displaced in 2
```

### The gap the mutation battery found

Two negative controls, and they disagree about what protects the property:

| mutation | the corpus | the case's own test |
| --- | --- | --- |
| the backlog drops to 400, so the answer is loudest again | **green** — the other strict case still satisfies the rule | red (`expected 2 to be 0`) |
| the working set is flattened | **red** — `not solvable by both baselines` | red |

The first row is the finding: **a corpus-level rule that needs one case is protected by exactly that
one case**, and with two cases it is protected by either. Removing the competitor from one of them is
invisible to the rule. So each displacement case is now pinned by name in its own end-to-end test, and
the test says why in a line — a case-specific test is the only thing that notices a case-level
regression when the corpus-level rule is satisfied elsewhere.

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **17 of 30**, 43 entities, 27 edges, floor 17 |
| the new case | four layers, 4 checkpoints (one a declared absence), 56 references resolved corpus-wide, 0 of 52 comparable assertions failing |
| the reading | `strict 4 … strictly displaced in 2 case(s)`, both named |
| the difficulty | `L1 2 / L2 9 / L3 6 / L4 0` |
| `core` | **191 / 4767**, coverage unchanged at 99.97 / 99.75 / 100 / 99.97 |

## Finding 279 — the hardest level was a level no case could reach

`checkDifficultyDistribution` has required a tenth of a graded corpus at `L4` since it was written.
The corpus has printed `L4 0` on every run since, and the reason was recorded and re-recorded across
four rounds: **no chain in it was three steps deep**, so no correction to any label could satisfy the
rule. Both halves of that were true, and together they made the level a decoration. A ladder whose
top rung is empty is not a ladder; it is a ladder-shaped diagram, and the projection into
`easy`/`medium`/`hard` that `docs/targets/cloud-opsbench.md` publishes could never emit `hard`.

The repair is content, not code. Two cases — `history-runtime-pod-shutdown-webhook-dispatcher` and
`history-code-slow-regex-api-gateway` — each carry a three-step chain, and the distribution moves
`L1 2 / L2 9 / L3 6 / L4 0` → `L1 2 / L2 9 / L3 6 / L4 2`, which is `0.105` against a floor of `0.1`
and the first `within the target` this corpus has printed.

### Why the third hop was the whole difficulty

Every chain in this corpus stopped at the service, and that is not an accident of the annotations: an
incident ticket describes what the reporter saw, and a reporter sees the component that is broken
rather than the party that is missing something. A `L4` needs the propagation to *leave* the family
that caused it, and there are two shapes in which the samples actually support that:

| case | the three steps | what the third step is |
| --- | --- | --- |
| `…webhook-dispatcher` | process → pod → service → merchant endpoints | a data loss: three hundred deliveries per deploy that are never retried |
| `…api-gateway` | process → pod → service → public ingress | a uniform delay: eight seconds paid before any downstream call is made |

Both are three steps of *distinct events* rather than one event at three resolutions, which is the
distinction that decides whether a chain is worth its depth. The dispatcher's pod really is killed
while its process really is still draining — two statements, two clocks — and the service really does
repeat that per replica per deploy, because the grace period belongs to the release. The gateway's pod
really does reach a CPU ceiling that the service then presents as one latency for every replica.

### The dispatcher case, and what a thin signals file is for

`history-runtime-pod-shutdown-webhook-dispatcher` ships **one series**, and that is the annotation's
argument rather than an omission:

| evidence | value | kind |
| --- | --- | --- |
| `terminationGracePeriodSeconds` | 30 s | declared configuration fact |
| `drainSeconds` | 120 s | declared configuration fact |
| `webhook_deliveries_dropped_total` | 0 → 300 | counter, steps once per deploy |

Neither number is wrong alone. Thirty seconds is a normal grace period and two minutes is a normal
drain; the fault exists only in their comparison, and nothing in the ticket says a latency or an error
rate moved, so a signals file with a plausible curve in it would have been an invention. This is the
corpus's second case whose decisive fact is an **absence** — the corpus's overcommit case counted a
missing heap cap as `heapCapMebibytes == 0` — and the first where the absence is a *pair* that nothing
compared.

The single series is also what makes the case a negative result for magnitude methods: a counter that
steps from zero has a zero-variance baseline, its z-score is `value / 1e-6`, and it dominates the
ranking by five orders of magnitude. That is the corpus's standing behaviour for every counter it
ships, and it is why this case cannot be evidence for or against a displacement claim — it is at rank
1 for a reason a reader should not trust, and the `strict` reading is unaffected because the corpus's
two displacement cases both measure levels with real variance.

### The probe that measured itself, and the suspicion it cleared

The two new cases forced a question the corpus had never asked: **is a z-score against a zero-variance
baseline a measurement at all?** `zScore` divides by `max(sigma, 1e-6)`, so a series that is flat
before the onset and moves after it gets a statistic that is the excursion scaled by one over an
implementation constant. If the ranking of a case turned on that constant rather than on the data, then
`strict` and `rankOfTruth` would be artefacts and the corpus's headline reading would be measuring its
own floor.

A probe recomputed every case's ranking twice — with the shipped `1e-6` floor and with a relative floor
of one percent of the baseline — and **two of seventeen cases changed order**, neither of them a case
whose `strict` classification moved:

| case | rank under `1e-6` | rank under 1 % | what moved |
| --- | --- | --- | --- |
| `history-checkout-cpu-saturation` | 2 | 1 | the answer's pod, which is the same component and therefore not a miss |
| `history-resource-ephemeral-capacity-image-builder` | 1 | 2 | the pod under the answer, again the same component |

So the corpus's claims do not rest on the floor, and the finding is a **negative result** rather than a
defect: the suspicion was reasonable, it was measured, and it did not hold. Two of the numbers in the
first run of that probe were `NaN`, and they were the probe's rather than the corpus's — it expanded
`post: { parameter: … }` without resolving the reference, which the guard does. That is worth recording
because a probe is a second reader of the same files, and a second reader that skips a step measures
its own bug with the same confidence it measures the corpus.

### The ratchet, because the printed line is not one

`logDifficultyCoverage` prints the spread and says `outside the target` without failing, and that
choice is still right: a share is a property of the set, and a rule that fails every run on something no
label can repair teaches people to skip the line. But it stopped being sufficient the moment the target
was met, because *meeting* it is now a property the suite can lose silently — removing one of the two
cases takes the share to `0.056` and changes nothing but a sentence in the log.

So the claim moved into `difficulty-floor.test.ts`: the shipped corpus has no shortfall, both `L4` cases
are named rather than counted, each carries exactly three steps, `checkDifficultyDistribution` on the
real bundle yields no violations, and dropping one of the two produces `DIFFICULTY_SKEWED_HARD`. The
last of those is the part that makes it a ratchet: at this size the rule needs **both** cases, which is
the opposite of the displacement rule and the reason the two properties need different protection.

### Acceptance

| gate | before | after |
| --- | --- | --- |
| the corpus | 17 of 30, 43 entities, 27 edges | **19 of 30, 50 entities, 34 edges** |
| checkpoints | 56 resolved, 0 of 52 failing | **63 resolved (48 series, 11 configuration, 2 derived), 0 of 59 failing** |
| ranking width | 20–22 candidates at top-3 | **22–24 candidates at top-3** |
| displacement | `strict 4, tie 2, same-component 2, none 26` | `strict 4, tie 2, same-component 2, none 30` |
| difficulty | `L1 2 / L2 9 / L3 6 / L4 0`, outside the target | **`L1 2 / L2 9 / L3 6 / L4 2`, within the target** |
| `core` | 191 / 4767 | **191 / 4772** |
| coverage | 99.97 / 99.75 / 100 / 99.97 | unchanged — no `src/` file was touched |
