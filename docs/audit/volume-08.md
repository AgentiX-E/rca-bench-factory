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

`pnpm probe:z-floor` recomputes every case's ranking twice — with the shipped `1e-6` floor and with a
relative floor of one percent of the baseline — and **two of nineteen cases changed order**, neither of
them a case whose `strict` classification moved:

| case | rank under `1e-6` | rank under 1 % | what moved |
| --- | --- | --- | --- |
| `history-checkout-cpu-saturation` | 2 | 1 | the answer's pod, which is the same component and therefore not a miss |
| `history-resource-ephemeral-capacity-image-builder` | 1 | 2 | the pod under the answer, again the same component |

The pair is a mirror image, and that is the whole shape of the result: in one case the pod sits above the
answer and in the other below it, and the relative floor swaps which. So `same-component` — the label for
"the runner-up is the answer's own pod" — is floor-dependent for exactly these two cases, and the probe
says so on stderr rather than burying it. That is a change in how a **non**-displacement is described:
`checkDiscrimination` accepts a case only when a separate component is strictly louder, so the claim the
corpus's evidence rests on moves only if a case moves into or out of `strict`, and none does.

So the finding is a **negative result** rather than a defect: the suspicion was reasonable, it was
measured, and it did not hold. Two of the numbers in the first run of that probe were `NaN`, and they were
the probe's rather than the corpus's — it expanded `post: { parameter: … }` without resolving the
reference, which the guard does. That is worth recording because a probe is a second reader of the same
files, and a second reader that skips a step measures its own bug with the same confidence it measures the
corpus. The repair was to have the probe report `0 unresolved reading(s)` and `0 non-finite statistic(s)`
as part of its own summary, so the failure it committed is a number it now prints.

`probe-z-floor.test.ts` holds both halves: the reading is taken on every case in the corpus with no
unresolved reference and no non-finite statistic, and `0 of them into or out of strict` is a **ratchet**.
A probe that failed on the number it exists to report would be a gate wearing a probe's name — both
floors answer different questions, so a case that ranks differently between them is a fact about the case
— but "the corpus's evidence does not depend on the floor" is not that kind of fact, and it is exactly
the kind that can stop being true silently when the next case is annotated.

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

## Finding 280 — the probe that cleared the suspicion had no way to fail

Finding 279 records a probe that answered a good question and published two `NaN`s as measurements. The
`NaN` was found by reading the output, which is the weakest detector available and precisely the one this
campaign exists to replace. So the probe was read the way every other script here is read, and what the
readers said was worse than the bug: **it was the only script in `scripts/` whose only exit was success**,
and it had no test at all.

That is not a stylistic point. `scripts-are-classified.test.ts` files each script by class, and a class
that prints a verdict has to own a failure site — otherwise its "verdict" is a line of text nothing can
contradict. The file that answered *is the corpus's ranking a measurement or a constant?* could not itself
be contradicted. The guard reported `[ "probe-z-floor.mjs" ]` in its `missing` list, which means the
previous round was caught by the round after it, and that is the correct order for a campaign that keeps
finding claims nothing reads.

### The repair is one exit, not one per input

The probe now has `fail(message)`, and an unreadable input is a refusal rather than a stack trace:

```
function fail(message) {
  console.error(`probe-z-floor: ${message}`);
  process.exit(1);
}
```

Everything that reads a file goes through `readJson(path, what)`, which names the path and the OS message
and then refuses. The point of routing them all through one function is that the inventory has **one** site
to prove instead of one per input, and a site is only worth having if something aims at it.

### What a probe is exempt from, stated as a distinction rather than a habit

The inventory now carries **89 sites across 47 scripts**, 88 of them carried across the re-derivation by
fingerprint rather than by line, and the new one is `proved` by `probe-z-floor.test.ts`. That is the honest
status, and the three older probes are `exempt` for the opposite reason:

| script | status | why that status |
| --- | --- | --- |
| `probe-z-floor.mjs` | `proved` | the test drives **that path**: `--cases <empty dir>` exits 1 with `could not read the case index` |
| `probe-m1-ceiling.mjs` | `exempt` | its exit is `process.exit(main())`, where `main()` decides from the ceiling it measured; a test on the line would restate the measurement |
| `probe-type-misses.mjs` | `exempt` | the exit aggregates several per-type counts a test already reads directly |
| `probe-denial-inventory.mjs` | `exempt` | same shape: the exit is computed from the inventory the test asserts on |

The distinction is whether the site's condition is **the thing the test proves** or a **summary of it**. An
input guard is a fact of its own and can be aimed at; an aggregate exit cannot, because the test already
holds every number the aggregate is computed from.

### The probe's own ratchet, and what it does not claim

`probe-z-floor.test.ts` holds six tests: the reading is taken on every case in the corpus, every declared
`{ parameter }` reference resolves, no statistic is non-finite, and **`0 of them into or out of strict`**.
The last is a ratchet rather than a snapshot, because it is the only half of the probe's answer the
corpus's evidence depends on: `same-component` moving between floors renames a *non*-displacement, while a
move into or out of `strict` would mean the corpus's headline reading is the constant. The probe fails on
neither — both floors answer different questions, so a case that ranks differently between them is a fact
about the case — which is why the assertion lives in a test rather than in the probe's exit status.

`gate-sites-are-proven.test.ts` rule 7 requires the pointer to be earned by two signals that must agree: a
`DRIVES` declaration in the test file and a `spawnSync` argument list that reaches the script. The
declaration is in `probe-z-floor.test.ts` beside the test, and the reconciliation is what keeps a
`provedBy` from being a string that names a file which merely mentions the name in a comment — the exact
defect rule 7 was written for.

### Acceptance

| gate | before | after |
| --- | --- | --- |
| gate sites | 88 across 46 scripts | **89 across 47 scripts**, 88 annotations carried, 0 unannotated |
| `verify:gates-are-testable` | 46 gates, 46 caught | **47 gates, 47 caught** — `probe-z-floor.mjs` caught by 10 red tests, 1 of the 2 files that name it going red |
| the probe's reading | `2 of 19 differ, 2 change kind` with `NaN` count unstated | **same reading, plus `0 of them into or out of strict`, `0 unresolved reading(s)`, `0 non-finite statistic(s)`** |
| `core` | 191 / 4772 | **192 / 4778** (six new tests, one new file) |
| repo | 195 / 4959 | **196 / 4965** |
| coverage | 99.97 / 99.75 / 100 / 99.97 | unchanged — no `src/` file was touched |

## Finding 281 — a rule was declined on the authority of a check that did not exist

`fault/difficulty.ts` explains why the ladder carries no `breadth >= 3` row. A one-step chain runs from
the root cause to its consequence, so its ends contribute at most two entity kinds "unless the root
cause is off the chain — and a root cause off its own chain is a defect the four-layer assessment
already refuses". The first half is right. The second half was false when it was written and false
every round since: `assessFourLayer` asks two separate questions — does the root resolve, and do both
ends of every step resolve — and nothing joins them, so a case could name its answer in a component its
chain never visits and pass G1, G2 and G5 together. Twenty annotations passed it without exercising it,
because twenty annotators happened to agree with the rule the comment described.

The rule now exists, in `checkCaseSemantics`, as `ROOT_OFF_ITS_CHAIN`. Two decisions in it are stated
rather than inherited:

| decision | why |
| --- | --- |
| "visits", not "starts at" | both of the corpus's node-first chains begin at the actor that acts on the answer (`worker-3 -> user-profile-0`, `cache-node-3 -> product-index-2`), so demanding the root be the chain's *first* entity would refuse the two cases that show the shape is deliberate |
| compared by resolved id | `resolveEntityRef` answers with an id and accepts an alias, so a rule comparing the strings would refuse a case for how it spelled its own answer |

**The first draft of the check passed everything, including the case built to make it fail.**
`resolveEntityRef` returns `string | null`; the draft wrote `chainIds.add(from.entityId)` and
`chainIds.has(root.entityId)` on the assumption that it returned the entity. Every id in the set was
therefore `undefined`, the root's id was `undefined`, and `has(undefined)` was true. The test written
beside it caught the draft immediately — which is the only reason this paragraph exists rather than a
silent gate that agrees with everything — and the shape of the mistake is the one this volume keeps
recording: a check written against an imagined signature answers a different question, and its answer
looks exactly like a pass.

`guard.ts` then forced a third decision. Every G2 code has to be classified as structural or case-level,
and `ROOT_OFF_ITS_CHAIN` is a contradiction inside one annotation rather than inside the shared graph,
so it is **case-level**: an exporter skips the case the way it already skips a broken chain, and
`guard.test.ts` failed until that decision was written down. The same file's rationale had also said
`STRUCTURAL_CODES` "is deliberately two entries wide" while it held four, which is corrected here for
the reason finding 282 gives.

### Acceptance

| what | before | after |
| --- | --- | --- |
| G2's chain rules | numbering, contiguity, no revisit | **plus `ROOT_OFF_ITS_CHAIN`**, held by two tests: an off-chain root refused, a far-end root and an alias accepted |
| `gates.test.ts` | 72 tests | **74**, both new tests green and the existing `passes a valid bundle` unchanged |
| the shipped corpus | 19 cases | **20 cases, all passing the new rule** — the check is exercised by the corpus rather than only by fixtures |
| `guard.ts` | `ROOT_OFF_ITS_CHAIN` unclassified, `guard.test.ts` red | **classified case-level**, and the stale width corrected |
| `datamodel` | three chain rules in the table | **four**, with the "visits not starts-at" decision stated |

## Finding 282 — the file that makes a ranking falsifiable stated a count of its own neighbours, and the count was wrong

`background-telemetry.json`'s `why` said a case's own anomaly "has seventeen quiet neighbours to be
chosen from". The file holds one series per service in the graph and the graph has grown twice since
that sentence was written; at the round this was found it held twenty-two and the same round adds a
twenty-third. The count is not decoration — it is the argument for why the file exists — and a reader
who checks it gets a number that disagrees with the file it is in.

Nothing re-derived it, and nothing could: the guard prints the width on every run
(`rankings 23-25 candidate(s) wide`), which is where a count belongs. The phrase now reads "every
quiet neighbour the graph holds", and a test refuses the *shape* rather than the value: any number word
or digit in front of "quiet neighbour" fails, so a future author cannot restate the count under a new
spelling. The claim the sentence does make — one series per service, both directions — was already
enforced by `backgroundProblems`; what was missing was any reason for prose to carry a second copy of a
number the guard prints.

### Acceptance

| what | before | after |
| --- | --- | --- |
| the sentence | `seventeen quiet neighbours` against 22 series | **`every quiet neighbour the graph holds`** against 23 |
| the guard | no test on the prose | **a test refusing a cardinality in front of the phrase**, by shape, so a new spelling is caught |
