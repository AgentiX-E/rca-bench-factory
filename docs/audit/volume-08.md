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
