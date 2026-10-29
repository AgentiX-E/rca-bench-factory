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

### The same shape, once more, in a file written minutes earlier

The round's new case arrived with a sentence of the same kind: its slot checkpoint was described as
"the only reading in the window that moved" while the case's own signals file carries two moving series,
the second being the first expressed as a share. Nothing checked the claim, and nothing would have: it
is prose about a set, written while the set had one member and kept after it had two. Three descriptions
now say "one of the two readings that moved" and name the other.

That is the point of recording it here rather than in a commit message. Finding 282 is not about a typo
in an old file; it is about a class of sentence — *a count, a total or an exclusivity claim about the
corpus, written when the corpus was smaller* — and the class recurs within hours, in the same round, by
the same hand. The only structural defence the log has found is the one applied twice above: move the
number to where it is derived and refuse the prose form that carries it.

## Finding 283 — the budget was claimed for the test where the stall was noticed

CI run `40796343743`, commit `700f1cdd4`, one job red: three tests of
`gate-sites-are-proven.test.ts`, each with `Test timed out in 5000ms`.

| test | measured, under v8 coverage |
| --- | --- |
| `rule 6 · rejects a site that is both proved and exempt` | 4 ms |
| `rule 6 · reports the shipped tree as clean when run through the same function` | 50 ms |
| `rule 7 · accepts the shipped tree, so the rule is not merely strict` | 44 ms |

The file is 476 ms of test time and 667 ms standalone. The next run of the same bytes — `29b4987d9`,
which changed documentation and nothing else — was green. A test that costs 50 ms and is reported at
5000 ms was not working for five seconds; the process it ran in was not being scheduled. That is the
whole finding: **the verdict was a property of the machine, not of the code**, and the three tests
named are exactly the three that call `pointerRoot()` and validate all 89 sites against it, which is
the most expensive thing the file does — but at 50 ms, not at 5000.

Nothing in the file's own budget could have prevented it, because of *where* the budget was written
down. The file had already decided the default was too small: it declares `RULE_TIMEOUT_MS = 30_000`.
It applied it to **one test of thirty-three** — the one that spawns the deriver — and left the other
thirty-two on vitest's five-second default. A stall does not respect test boundaries, so a budget
claimed per test is a budget claimed for the test where the stall happened to be noticed.

The reader that owns this question could not see it, and its own header already says why in a
different context: `timeout-budget.test.ts` holds a table of **per-file standalone costs**, and this
file's cost is 667 ms, so the table is right to say nothing about it. The quantity that blew the
budget was not the file's cost. The gap is not a missing row; it is a missing *unit* — the table
measures files, the timeout applies to tests, and no row of per-file costs can express "this file
decided 5000 was too small and then did not tell two thirds of itself".

Two candidate mechanisms were measured rather than argued:

| mechanism | verdict |
| --- | --- |
| `describe(name, { timeout }, fn)` | **chosen**. Verified that suite options cover nested suites: a 6 s sleep passes at 6007 ms and, inside a nested `describe`, at 6003 ms, while the same sleep outside any budgeted suite fails at 5005 ms |
| `vi.setConfig({ testTimeout })` | **rejected, and the reader refuses to read it**. It mutates config that outlives the file inside a worker, so a file using it could raise the budget of files that never asked — a leak, and one that would silence a real timeout somewhere else |

The fix is one suite option, and the decision is now held by a second arm in `timeout-budget.test.ts`
(`SUITE_BUDGET_MS`) whose rows carry the measurement that justifies them. The arm's predicate is
falsifiable in both directions: a suite budget stated as a named constant and as a literal are both
read; a file that budgets only individual tests — the shape that failed — reads as 0 and fails the row;
a budget inside a comment reads as 0. Without the last three, the row would pass for any file that
mentioned a large number anywhere.

One layout decision is recorded because it is a decision. The options object is spelled on its own
lines rather than as `describe(name, { timeout }, fn)`, because the one-liner moves the closing paren
and all 480 lines of the suite's body one level right. A diff that reindents a file in order to add a
number is a diff nobody reads, and the decision being recorded is the number.

### Acceptance

| what | before | after |
| --- | --- | --- |
| `gate-sites-are-proven.test.ts` | `30_000` applied to 1 test of 33 | **applied to the suite**, covering all 33 and any test added later |
| the reader | three spellings of a budget, all per-test | **a fourth reading — the suite option — plus a table of files that must use it** |
| the arm's falsifiability | — | per-test-only spelling returns 0, a commented budget returns 0, an undeclared name returns 0 |
| `timeout-budget.test.ts` | 16 tests | **20**, four of them the new arm |
| the suite | core 192 files / 4783 tests | core 192 / **4787**, cli 4 / 187, repo 196 / **4974** |
| the stale figure in the reader's header | "given `RULE_TIMEOUT_MS = 60_000`" — the constant has been 30 000 | **corrected, and it now says the budget is applied to the suite** |

**What this does not fix.** The other half of the same gap is still open and is now stated in the
file's own comment: a budget that is *missing* is invisible to a reader that reads declarations. The
`ReferenceError` this constant once caused was found by `measure-doc-counts.mjs` spawning `pnpm test`,
not by any static arm. A gate that reads source can refuse a wrong budget and cannot see an absent one;
only a second input — a run of the suite — can.

### The same class, an hour later, in a different instrument

Measuring this round's document counts spawned the suite twice and both runs died with
`[vitest-worker]: Timeout calling "onTaskUpdate"` — every test green, no `FAIL` line, exit 1. The
measurement script refused both, in the words it has for exactly this: *"a failed run has no number to
publish"*. It is the third appearance of one mechanism in this log — a second full suite inside one job
overruns the runner, not the tests — and it is why the script grew `--from`, which reads the JSON
report the coverage step already wrote. The counts above were taken that way: `--from` on the report
from the coverage run that had just passed, not from a third spawn.

Two things follow, and only one of them is about vitest. The first is that a budget attached to a test
cannot protect a *measurement*; what protects it is having a second reader of an artefact that already
exists. The second is that both failures in this round were reported as "the suite is red" and neither
was a test failing, so the sentence "the suite is red" is not a diagnosis — the exit code, the `FAIL`
line, and the report's `status` field are three different pieces of evidence, and this round needed all
three to say what had happened.

## Finding 284 — a reading sits on its unit's grid, not only inside its range

The corpus's count readings were fractional, and nothing had ever looked.

The round began with a different question: the next case to annotate is a pagination off-by-one, whose
only moving reading is *how many lines a page carries* -- six before the defect, five after. That is a
count of things, so the annotation would declare it exact. Writing the guard for it raised a question
the corpus had never been asked: does anything check that a declared count expands to whole numbers?

Nothing did. The rule was written (one integer test per sample, for every series whose unit is `count`),
and the shipped corpus failed it in **31 places across 6 series**:

| case | series | declared | what the expansion produced |
| --- | --- | --- | --- |
| `config-ingress-timeout-partner-portal` | `ingress_504_responses_total` | 0 → 1 | `1.02`, `0.984`, `1.016`, `0.99` … |
| `queue-watermark-ledger-writer` | `producer_buffer_records` | 200 → 40000 | `203.2`, `196.8`, `201.2` |
| `resource-memory-request-ingest-writer` | `backlog_messages` | 200 → 50000 | `203.2`, `196.8`, `201.2` |
| `container-crash-loop-media` | `container_restarts_total` | 0 → 178 | `22.25`, `44.5`, `66.75` … |
| `pod-shutdown-webhook-dispatcher` | `webhook_deliveries_dropped_total` | 0 → 300 | `37.5`, `112.5` … |
| `database-pool-deadlock-billing` | `client_pool_connections_in_use` | 3 → 20 | *see finding 285 — this one was the rule's own defect* |

Two mechanisms, and only one of them is the one the rule was written for:

| mechanism | where | example |
| --- | --- | --- |
| sampling noise, applied as a fraction of the reading | `withNoise`, the `sampled` default | 200 records ± 2 % is 203.2 records |
| accumulation divided into `SERIES_POINTS` | the `counter` branch, `(post - baseline) / 8` | 178 restarts in eight samples is 22.25 restarts per sample |

The second is the one worth stating: **a counter was assumed to be exact, and exact is not the same as
whole.** The module's own docstring says a counter's samples are "exact because it is a total", and the
round that added `noise: 'none'` (finding 254) was about a reading that wobbled when it should not. Both
true, and both beside the point here: the accumulation is exact *and* it is `22.25` of a restart.

Why every door was open:

- **the range cannot see it.** `measurementBounds('count')` is `[0, ∞)` — a count of restarts has no
  ceiling, and `clampToUnit` is silent by construction. Finding 252's rule asks whether the number an
  author wrote is one its unit admits; `178` is, and `22.25` is not the author's number.
- **the vocabulary check cannot see it.** Finding 254 refused `noise` on a counter and refused a typo
  in `noise`; it never asked what the samples were. A field can be spelled correctly and still be
  describing a reading nobody can measure.
- **the anomaly gate cannot see it.** G3 asks whether a metric sustains `|Z| >= 2`; `Math.abs(NaN) >= 2`
  is `false` and `Math.abs(203.2) >= 2` is `true`, so a fractional reading is not *wrong* to G3 — it is
  merely a number, and G3 has no opinion about which numbers exist.

The fix is the unit table's second obligation, stated beside the first:

```ts
export function admitsFraction(unit: string): boolean { … }   // count: false, everything else: true
export function quantizeToUnit(unit: string | undefined, value: number): number {
  if (unit === undefined) return value;
  return admitsFraction(unit) ? value : Math.round(value);
}
```

`withNoise` applies both — `quantizeToUnit(unit, clampToUnit(unit, level))` — and the counter branch
applies the grid alone, which is why the call sits outside the `derivation` test rather than as a fourth
branch. Nothing in `golden-master` changed: not one declaration was edited, and the corpus went from 31
problems to zero. That is the shape a correct fix has here — the data was always right, the arithmetic
that read it was not.

**What the grid does not decide.** Rounding is a decision about direction, and `Math.round` makes it at
the half: a counter accumulating `0.125, 0.25, 0.375, 0.5 …` of a response reports its first event at
the fourth sample, not the fifth. The alternative — refusing any declaration whose `(post - baseline)`
is not divisible by `SERIES_POINTS` — was rejected because it would make `178 restarts` inexpressible
in a corpus whose incident text says 178. The one reading the file states is protected separately: a
declaration of `201.5` things is refused, because a counter's last sample is required to *be* the
declared post and rounding it would move the number the annotation asserts.

### Acceptance

| what | before | after |
| --- | --- | --- |
| `admitsFraction` / `quantizeToUnit` | absent | **stated, and the reason `cores` is not `count` is written down** |
| `expandSeries` on a `count` | `203.2`, `1.02`, `22.25` | **whole things**, by both mechanisms |
| `derived-telemetry.test.ts` | 30 tests | **31**, one pinning sixteen written-out numbers across both mechanisms |
| the corpus as it stood | 31 fractional samples, 6 series | **0** — no declaration was edited |
| the guard | read `noise` for its vocabulary only | **also refuses a count declared as a fraction**, which the grid cannot repair |
| `unit.test.ts` | 16 tests | **19** (`admitsFraction` ×2, `quantizeToUnit` ×1) |

**What this does not fix.** The corpus's `count` readings are now whole, and the `noise: 'sampled'`
declarations on them still say the reading was jittered — which it was, by whole things. Whether a count
should carry sampling noise at all is a modelling question this rule answers "yes, on its grid" to, and
a different corpus could answer differently without either being wrong.

## Finding 285 — a gate no input can fail, and the NaN it was written to catch

The rule in finding 284 was written three times before it was right, and the first two versions are the
finding.

**First version.** It read the samples and reported seven problems against
`database-pool-deadlock-billing`, including `derives NaN for 'client_pool_connections_in_use'`. That
case's `post` is `{ "parameter": "poolSize" }` — a reference to a quantity the case declares about
itself, which `readDeclaredReading` resolves for every rule above and which the expansion does not
understand. The rule had called `expandSeries(one, …)` with the raw declaration, so
`object - number` was `NaN` for all sixteen samples, and the guard reported it as a defect in the
corpus. **It was a defect in the rule, filed against the data.**

Two things came out of it. The resolution is now one function, `resolvedDeclaration(one, readings)`,
used by both call sites — the expansion that produces the telemetry and any rule that wants a sample —
so "expand the declaration" has one spelling rather than two. And the NaN itself is worth naming: a
`{ parameter }` reference passed through unresolved produces sixteen `NaN` samples and **nothing
downstream complains**, because `Math.abs(NaN) >= 2` is false, so such a series is invisible to G3 and
to both baselines at once. The case would still have read as solvable, on the strength of its other
series.

**Second version.** With the quantize fix in place the sample-level rule could no longer fail: the
expansion rounds before any caller sees a fraction, so the rule's loop was unreachable. It was kept for
about ten minutes on the argument that checking the *output* is more fundamental than checking the
declaration — and that argument is true, and beside the point. **A gate no input can fail is not a
strict gate; it is a line a reader learns to skip**, and it would have been the first unreachable branch
in a tree that has spent six rounds deleting exactly this shape.

| version | what it checked | could it fail? | what happened |
| --- | --- | --- | --- |
| 1 | samples, from the raw declaration | yes — **falsely** | reported the corpus as `NaN`; the `NaN` was the rule's |
| 2 | samples, from the resolved declaration | **no** — the expansion quantizes first | removed, with the reason in the code where it stood |
| 3 | the **declared** reading, per point | yes: `post: 201.5` in `count` | kept, and pinned by a test |

The surviving rule asks a different question from finding 284's: not "did the samples come out whole"
(which the arithmetic now guarantees) but "is the number the file states one the expansion can keep" —
because a counter's last sample is required to equal it, and a grid applied to `201.5` would move the
reading the annotation asserts. The two rules are one arithmetic and one annotation, which is the split
this log keeps arriving at.

### Acceptance

| what | before | after |
| --- | --- | --- |
| the expansion call sites | one resolved, one raw | **one function**, `resolvedDeclaration` |
| the NaN | reachable, silent, and invisible to G3 and both baselines | **not produced**, and the reason is in the function's own comment |
| the sample-level rule | written, then unreachable | **removed**, with three lines saying why it must not come back |
| the declaration-level rule | absent | **stated and falsifiable**: `post: 201.5` in `count` is refused, `201` passes |
| `check-fault-cases.test.ts` | 109 tests | **110** (one added, one that had lost its premise removed) |

**What this does not fix.** `resolvedReadings` is built by the script, and `expandSeries`'s signature
still takes `Number`s — so the obligation to resolve lives in a comment and a helper rather than in the
type. A `.ts` caller would get the same `NaN` from the same mistake, and the compiler would have caught
it in the script if the script had been TypeScript.

## Finding 286 — a log checkpoint stated a containment, and the body it named was read by nothing

Four checkpoints in the shipped corpus carry `signalKind: 'log'`, and each states a `comparator` and a
`value` beside the log id it cites — `contains "upload handled"`, `contains "connection pool
exhausted"`, `contains "segmentation fault"`, `contains "unhandled TypeError"`. The guard resolved the
id and stopped. `checkpointRefs.resolvedAny` was incremented, the reference counted, and the phrase was
never compared with anything.

Three of the four were true. The fourth was not:

| case | the checkpoint cites | the line it names reads |
| --- | --- | --- |
| `history-runtime-container-crash-loop-media` | `contains "segmentation fault"` | `SIGSEGV in native ffmpeg binding 1.8s after accepting job 0x41f2, ...` |

Both halves are right in their own terms. The incident text says the container "logs a segmentation
fault in the native ffmpeg binding", so the checkpoint quotes the text's words; the log body is a
reconstruction and its author wrote the signal's name. They are two statements about one line, written
by two hands, and **nothing in the repository put them beside each other** — so the case has been
green since the log line existed, and its evidence layer has carried a claim its own data contradicts.

**Why every other door was open.** `compareExactly` orders numbers and the phrase is a string. `contains`
is not a member of `NUMERIC_COMPARATORS`, so the comparable branch did not see it and the assertion
count did not include it. `assessFourLayer` is handed a case and a graph, never the signals, so it
reports the checkpoint as filled and every reference as resolved. And the log-line rules that do exist
check the *quote* (`the quote is in the incident text`), the *body's length*, and the *why* — three
properties of a line that say nothing about what the line will be asked to prove.

**The repair, and the vocabulary that came with it.** A log line has no magnitude, no unit and no
order, so the one relation it can be asked about is containment; the comparator is closed to
`contains`, the phrase must be a non-empty string, and the phrase must appear in the body the case
declares. Anything else is refused by name rather than skipped:

| input | before | after |
| --- | --- | --- |
| `contains` + a phrase in the body | counted as resolved | **counted as holding**, `1 of 1` |
| `contains` + a phrase the body does not carry | **accepted** | refused, naming the phrase and quoting the body |
| `>=` beside a log id | **accepted** | refused: `a log has one relation` |
| `value: 3` beside a log id | **accepted** | refused: not a non-empty string |

The counter is separate from `comparable assertion(s)`, deliberately: a log assertion is compared with
text, so it fails for a reason the arithmetic beside it cannot express, and folding it into that pair
would have made both numbers mean two things. The printed line grew a fourth kind inside its
parenthetical — `4 over a log line` — and with it the three kinds finally **sum to the total**, which a
previous round had tried to assert and could not: the test that once withdrew that arithmetic now
states it, so a fifth kind added without a counter fails there rather than quietly making the report a
list that no longer adds up.

### Acceptance

| what | before | after |
| --- | --- | --- |
| the shipped corpus | 4 log checkpoints, 1 of them false | **4 of 4 hold**, and the false one was repaired in the body it names |
| the rule | resolved the id | **compares the phrase with the body**, and refuses the two other comparators |
| `check-fault-cases.test.ts` | 110 tests | **114** (three refusals and one count) |
| the report | three kinds that did not add up to the total | **four kinds that do**, asserted |

**What this does not fix.** The body is a reconstruction, so the rule can only say the two statements
agree — a case whose body and phrase are wrong together is as green as one where both are right, and
no check here can tell them apart. `expandLog` emits three lines at fixed offsets, so "the phrase is in
the body" is not "the phrase is in the log": the same text is asserted three times at 30, 150 and 270
seconds after onset. And nothing compares a checkpoint's `entityRef` with the `service` its log line is
attributed to, so a case can cite a container and quote a line the graph says belongs to another
service.

## Finding 287 — thirty-five files with no rows, and the run printed the number and not the files

RE2 writes `logs.csv` and `traces.csv` for every case it exports. Of the corpus's twenty-one cases,
six declared a log and one declared a span, so the export wrote **35 files that hold a header and
nothing else** — and the only place that appeared was a count in the middle of a status line. The
corpus was described as having telemetry, G1/G3/G4 were all green, and the modality that the counts
were about was empty in twenty of twenty-one cases.

The number was also not decomposable: `35` is `15` (logs) plus `20` (traces), and a reader had no way
to know whether the two modalities accounted for it or whether a third file was in there. That is the
same defect as finding 267's directory count, one layer down — a count of things that does not say
which things.

**What the round did about it, and what it decided not to do.** The count stays a count: refusing to
write a header-only file would change a layout the official round trip depends on, and the round trip's
own RE2 case carries metrics only. So the repair is that the count now names its parts, read off the
exporter's own paths rather than from a list kept by hand:

```
RE2 22 case(s) written, 32 file(s) with no rows (logs.csv in 15 case(s), traces.csv in 17 case(s))
```

and, in the same round, the corpus was given the spans its incident texts already stated. A span needs
a duration, and a duration can only be quoted; five of the thirty texts state one as a *request
latency*, and one of the five was annotated. The other four had the number in their own words and no
span in their declaration:

| case | the text's number | the span |
| --- | --- | --- |
| `history-checkout-cpu-saturation` | `p99 latency went from 180ms to 4.3s` | `checkout` at **4300 ms** |
| `history-middleware-redis-latency-session-cache` | `Cache GETs ... went from 0.4ms to 55ms` | `GET` at **55 ms** |
| `history-code-slow-regex-api-gateway` | `request latency spiked to 8s` | `HTTP request` at **8000 ms** |
| `history-config-ingress-timeout-partner-portal` | `the upload handler needs about eight seconds` | `POST /upload` at **8000 ms** |

| reading | before | after |
| --- | --- | --- |
| cases with a log line | 6 of 21 | **7 of 22** |
| cases with a span | 1 of 21 | **5 of 22** |
| RE2 files with no rows | 35 (15 + 20) | **32 (15 + 17)** |
| RE2's trace modality | empty in 20 of 21 cases | empty in **17 of 22** |
| `rcaeval-re3` cases written | 4 | **5** |

The remaining seventeen are not a backlog of missing authorship: nineteen of the thirty incident texts
state a duration for a *window* (`12 hours`, `40 minutes`, `24h`) rather than for a request, and a span
whose duration was invented to fill a column would be the one modality in this corpus that is fiction
rather than reconstruction. The honest reading is that the trace modality is bounded by the extraction
key, and the census now says so on every run instead of leaving it to be inferred from a count.

### Acceptance

| what | before | after |
| --- | --- | --- |
| the empty-file count | a number with no parts | **the number, then each file name and how many cases it is empty in** |
| a case whose text states a latency | no span unless it had been remembered | **every annotated one carries its span**, quoted |
| `check-fault-cases.test.ts` | 114 tests | **115** (the fixture's empty count moved, and the breakdown is asserted) |

**What this does not fix.** The breakdown is a reading and not a gate: nothing refuses a new case that
declares a log and exports none, because the export is downstream of the declaration and the only
instrument that could compare them lives in this script rather than in the exporter. A corpus that
declares a modality and loses it in the port would still be green, as long as the count moved.

## Finding 288 — the statistic was a change times a million, and seven cases were located by the constant

Both baselines divide a change by a spread: `zScore` by `max(sigma, 1e-6)`, the robust one by
`max(1.4826 * MAD, 1e-6)`. The constant is there so that a baseline with no variance cannot divide. It
also, quietly, became the *scale of the statistic* — because the corpus's noise is a **fraction of the
reading**, two things make a baseline's spread exactly zero:

- a **share that is zero** in healthy operation — an error ratio, a loss ratio, a mismatch share —
  because `0 × (1 ± 2%)` is zero;
- a **count on its own grid** — six lines per page, always six — because `6 × (1 ± 2%)` rounds back to
  six, which is finding 284's quantisation doing exactly what it was asked to.

A zero-spread baseline then divided by `1e-6`, so the statistic was *the change times a million* and
nothing else. Seven of the corpus's twenty-two cases were located by a number of that shape:

| case | the answer's statistic before | after |
| --- | --- | --- |
| `history-kafka-consumer-lag` | 4 200 000 000 000 | **4 200 000** |
| `history-middleware-cache-shard-product-index` | 12 500 000 | **12.5** |
| `history-unhandled-exception-export` | 3 060 000 | **3.06** |
| `history-config-ingress-timeout-partner-portal` | 1 000 000 | **1.49** |
| `history-config-datasource-url-orders` | 1 000 000 | **126.85** |
| `history-network-mtu-blackhole-catalog` | 1 000 000 | **100** |
| `history-code-off-by-one-invoice-renderer` | 1 000 000 | **1** |

Three consequences, in order of how much they cost:

1. **A magnitude method was being scored against a constant rather than against the data.** "The
   loudest component" meant "the component whose metric happened to start at zero or on a grid".
2. **Cross-case comparisons were meaningless.** `4.2 × 10¹²` against `3.06 × 10⁶` is a comparison of two
   other recordings of the same epsilon, and the corpus's difficulty argument reads those numbers.
3. **Within a case, a metric that never moved beat one that moved fivefold with two per cent noise**,
   because it did not need to move to win — it only had to be flat.

**What the fix is, and what it deliberately is not.** The divisor for a baseline that **never moved** is
now one step of the declaration's own unit (`resolutionOf` in `util/unit.ts`): one whole thing for a
`count`, one percentage point for `%`, a hundredth of a whole for `1`, one of the unit as written for a
duration, a byte count, a rate or a core — and the old constant only where nobody declared a unit at
all. A baseline that **did** move is measured, and its own spread divides, because the floor is a floor
and not a cap. The difference between "moved" and "did not" is `max(before) !== min(before)` rather
than `spread > 0`, because eight identical shares computed through a mean can produce a spread of
`1e-17` and would then divide by it.

**Why every other instrument was silent.** Nothing in the corpus reads a statistic's *magnitude*: the
gate reads ranks against a top-K, `checkDiscrimination` reads a kind, and the report prints the count of
each kind. Coverage cannot see it either — the line executed on every case, and it returned a number
every time. And `probe-z-floor.mjs` had been asking the neighbouring question — *does the corpus's
classification depend on the floor* — with an arm that restated the same constant, so it compared the
constant with itself on the cases the constant decided.

**The probe was rewired rather than retired.** Its shipped arm is now `baseline-localiser.ts`'s rule,
which makes it a regression detector for this change: the cases whose description moves between the
shipped arm and the old behaviour are the cases the epsilon was deciding. The reading it takes is:

```
probe-z-floor: 1 of 23 case(s) put the answer at a different rank (one resolution of the declared
unit versus 1% of |baseline|); 1 change kind, 0 of them into or out of strict
```

`0 of them into or out of strict` is the claim the corpus's evidence rests on, and it holds: the three
strictly-displaced cases are strictly displaced under both arms. The one case that moves is
`history-resource-ephemeral-capacity-image-builder`, whose description moves between `none` and
`same-component` — a pod outranking its own service, which is not a miss.

### Acceptance

| what | before | after |
| --- | --- | --- |
| a deterministic count's step | a statistic of 1 000 000 | **1** |
| a share that moves from 0 to 0.38 | 38 000 000 | **38** |
| a baseline that moved | measured spread | **measured spread, unchanged** |
| `unit.test.ts` | 19 tests | **24** |
| `baseline-localiser.test.ts` / `robust-localiser.test.ts` | 13 / 12 | **16 / 14** |
| the probe's two arms | the constant against itself | **the shipped rule against the constant** |
| the corpus | 22 of 22 in top-K | **23 of 23**, and the numbers are readable |

**What this does not fix.** The resolution of a *continuous* unit is a convention and the file says so:
a duration declared in `ms` resolves in milliseconds even though the declaration can express `12.4`. A
baseline that moved still divides by its own spread however small that spread is, so a metric whose
noise happens to be tiny still outsizes one of a coarser unit — the fix bounds the degenerate case, it
does not make the statistic unit-free. And the two baselines have to agree about the floor by
construction rather than by type: `resolutionOf` is called in two modules and nothing refuses a third
one from dividing by something else.

## Finding 289 — the fourth L4 was not behind the extraction key, and the deadline it was waiting for dissolved

Three items on the plan were blocked, and all three were blocked on the same assumption: that a case's
chain cannot be three hops unless the extraction key supplies a deeper gold standard, and that a
strictly displaced case needs a sample with **two faults** in it. Neither is true, and the
twenty-third case shows why.

`dependency-schema-change-currency-feed` is one fault with a chain that leaves the service it starts
in: container `currency-feed-app` → pod → service `currency-feed` → service `settlement`. The feed
changed what one existing field *means* — `rate` was exact and is now rounded to two places, with
`inverse` added beside it — and settlement reads `rate` as its contract says. Three hops, four entities,
so `difficultyFloor` reads `L4` **without any change to the extraction key**: the depth came from a
cross-service chain, which the corpus already had the edges to express (`calls`, `settlement →
currency-feed`).

The displacement is the corpus's third, and its first where the louder component is the **victim**:

| | settlement | currency-feed |
| --- | --- | --- |
| the moving reading | `settlement_total_mismatch_ratio` 0 → 0.38 | `currency_feed_response_field_count` 1 → 2 |
| the statistic, both baselines | **38** | **1** |

A method that returns the largest excursion returns settlement, deterministically, and it is wrong. No
second fault was needed: the decoy is the *reader*, and what makes it louder is that a symptom is
naturally bigger than the change that caused it — a rounding of less than a cent per rate becomes a
whole share of orders whose totals disagree. That is a stronger statement than a corpus with two faults
in it, because two faults is a corpus that can be answered by finding the louder of two incidents,
while this is a corpus that punishes ranking by magnitude *on a single incident*.

**The ladder.** The previous round closed with a deadline: three L4 among thirty cases is exactly the
floor and among thirty-one it is not, so the next annotation could not be L1, L2 or L3. The fourth L4
removes the deadline rather than meeting it — four of thirty is 0.133, and four fall below a tenth only
at forty-one cases, which is beyond the thirty the extraction key can supply:

| what | before | after |
| --- | --- | --- |
| L4 cases | 3 of 22 | **4 of 23** |
| the share at the committed size | 0.100, exactly | **0.133** |
| the corpus size at which the floor binds | 31 | **41** |
| L4 cases the corpus can lose | 0 | **1** (two would take it to 0.095) |

### Acceptance

| what | before | after |
| --- | --- | --- |
| the corpus | 22 of 30, `L1 2 / L2 9 / L3 8 / L4 3` | **23 of 30, `L1 2 / L2 9 / L3 8 / L4 4`** |
| strictly displaced cases | 2 | **3** |
| the chain shapes at three hops | 3 chains, 1 staying inside | **4 chains, 2 each** |
| entities and edges | 59 / 41 | **65 / 46** |
| background series | 25 | **27** |
| `checkpoints` | 74 of 74, 5 log assertions | **78 of 78, 6 log assertions** |
| `difficulty-floor.test.ts` | 18 tests | **18**, four of them rewritten for the new arithmetic |

**What this does not fix.** The case's two series are both deterministic, so it is the case that most
depends on finding 288's floor: its numbers are `38` and `1` because a share resolves in hundredths and
a count in wholes, and a reader who disagrees with that table disagrees with the case. `settlement` has
no third series: a control showing its other dependencies healthy would have been a reading the incident
text does not state, and the gate refused the first draft that carried one. And the chain's second hop
is the weakest in the corpus — "every replica runs the release" is a fact about a deploy rather than a
measurement, and nothing in the corpus checks it.
