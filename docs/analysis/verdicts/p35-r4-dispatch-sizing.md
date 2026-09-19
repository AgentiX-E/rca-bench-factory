# P35 — R4 dispatch sizing, and what the cohort guard makes non-negotiable

**Status:** decided, guard shipped, run pending
**Trigger:** user approval of the recommended path (limit=200, no threshold probe)
**Evidence:**
- `analysis/r4-cohort-guard-check.mjs` — cohort availability vs `LIMIT`, real dataset
- `analysis/r4-power.mjs` — the 0-of-n bound for P3
- `analysis/abstain-threshold-audit.mjs` — the threshold identifiability check
- `p27-r4-prereg.md` §3.2/§3.3 — the power ceiling, now recorded in the pre-registration

---

## 1. The finding that changes the plan

`p27-r4-prereg.md` fixed P3 — six conjunctive controls all still abstain — as the
**load-bearing** prediction, the one that separates "R4 fixed a bug" from "R4
traded one failure for another". P3 names six specific questions.

Those six questions are not guaranteed to be in the sample. The R4 arm scopes to
`['ABS','IE']` and draws from the caller's stratified sample, and the round-robin
sampler is proportional rather than coverage-preserving. Measured against the real
data:

| `LIMIT` | scoped instances | cohort covered | P2 target present |
|---|---|---|---|
| 60 (previously planned) | 35 | **1/7** | **no** |
| 200 (now planned) | 115 | 7/7 | yes |

At `LIMIT=60`, **P2 had no target and P3 had one control.** A one-control P3 is a
0-of-1 claim whose one-sided 95% upper bound on the per-question collateral-damage
rate is **95%** — it cannot fail for any reason the experiment could detect. It
would have reported `1/1` and read as a pass.

This is the same failure class as a single lucky hit being called a success: the
experiment would have produced a number, the number would have been true, and the
conclusion drawn from it would have been wrong.

## 2. What P3 can and cannot ever claim

The dataset holds exactly **7** conjunctive ABS questions (6 controls + 1 target).
So `n <= 6` at any limit, and the bound is:

| `n` controls | one-sided 95% upper bound on per-question damage rate |
|---|---|
| 1 | 95.0% |
| 6 | **39.3%** |
| 9 | 25.9% (unreachable) |
| 29 | 9.8% (unreachable) |

**The honest statement of a P3 pass is "per-question collateral damage is below
39%", not "R4 is safe."** `p < 30%` needs `n >= 9` and is unreachable at any
limit. This is now recorded in the pre-registration (§3.2) so a future reader
cannot mistake the bound for the claim.

## 3. P5 is unevaluable, and the run must say so

P5 exists to break the confound in `p27` §4.1.1: every failing conjunctive case is
a quantity question and every ordering control is not. Splitting the cohort:

- quantity/aggregation: `80ec1f4f`, `edced276`, `6456829e`, `e5ba910e` — **4**
- ordering/other: `gpt4_70e84552`, `gpt4_c27434e8`, `gpt4_fe651585` — **3**

One question moving is 25% of the quantity subgroup. No subgroup comparison is
supportable. **The confound therefore survives any run of this cohort**, and the
verdict must state that rather than reading a 4/4 as resolution. A larger limit
does not help — this is a property of the dataset, not of the sample.

## 4. The guard: coverage asserted instead of assumed

`runQueryExpansionDecompositionAblation` now measures `cohortCoverage` against
`CONJUNCTION_ABS_COHORT` and **throws** when a member is missing, unless the
caller passes `requireCohortCoverage: false`. Coverage is returned in both cases
and written into `benchmark-conjunction-ablation-report.json`.

Two design points, each load-bearing:

1. **The guard counts only cohort members the arm will score.** Coverage is
   measured against `instances` filtered to the scoped capabilities, not against
   the raw sample. Otherwise a mis-scoped arm (`capabilities: ['IE']`) would see
   every ABS question "present" and satisfy its own guard while running none of
   them. A test pins this: a full cohort scoped to IE must throw `0/7 present`.
2. **The shortfall is reported even when the guard is off.** The opt-out exists
   for smoke runs and partial re-measurements; it must not become a way to run
   an under-covered cohort silently.

**Teeth, verified twice by mutation:**

| mutation | result |
|---|---|
| guard condition neutered (`false && …`) | 3 failed, 2 passed — exactly the three "must throw" tests |
| `cohortCoverage` neutered (`true \|\| presentIds.has(id)`) | 5 failed across both test files |

Neither mutation was committed; both were reverted immediately and the suite
re-run green.

## 5. Cost, stated plainly

Turns drive the embedding and retrieval work:

| `LIMIT` | turns | relative |
|---|---|---|
| 60 | 30,008 | 1.0x |
| **200** | **99,291** | **3.3x** |

The 3.3x buys a P3 that can fail, a P2 with a target, and a TR(28)/KU(28) sample
large enough to score the P32 and P33 fixes **in the same run** rather than
spending a second one. Paying 1x for a prediction that cannot fail is the more
expensive choice.

## 6. ABSTAIN_THRESHOLD: checked, not probed

The question was whether the abstention threshold is a free parameter worth
exploring. It was investigated offline and dropped, for a reason that is
structural rather than empirical:

`judgeScorer` grades `question.expected === null` questions by `answer === null`
alone (`metrics.ts:218`), and `NaturalLanguageMemorySystem.answer()` never
receives `expected` — no QA path does. So the threshold is compared against a
retrieval score and never against the gold, which means **there is no
test-set-fitting risk in tuning it**; it is a genuine experimental knob.

That makes it legitimate, not profitable. From the archived diagnostics
(349 scored rows, the only threshold-bearing artifact on hand):

- only **2** rows have `reason: 'threshold'`; the other abstentions come from
  `retrieved === ''` and from the model declining, neither of which the threshold
  touches;
- raising the threshold's cost is not symmetric: a non-ABS row that currently
  answers correctly but scores below the new threshold is abstained into
  **wrong**, because a null answer on a string-gold question is graded false;
- the archived file predates the `correct` field and the ABS records, so its
  join cannot produce a real ceiling — the estimate would be a guess dressed as a
  measurement.

A guess dressed as a measurement is the thing this whole method exists to avoid.
The knob stays at 0.5; the audit script (`analysis/abstain-threshold-audit.mjs`)
is committed so the check can be re-run against a diagnostics file that does
carry `correct`, without spending a dedicated run to regenerate one.

## 7. Dispatch configuration

| input | value | why |
|---|---|---|
| `limit` | **200** | the minimum that covers the cohort (guard-verified) |
| `runs` | 1 | deterministic at temperature 0 |
| `ablation_runs` | 1 | ablations share an answer cache; extra runs replay it |
| `temperature` | 0 | no sampling variance wanted |
| `model` | `deepseek-chat` | unchanged |
| `entity_identity_clause` | 1 | shipped configuration |

Carries, each with its own independent arm:

1. **P32** — `formatOrdering` sequence fix, scored on the graded path (TR, +4 ceiling)
2. **P33** — `before`-qualifier fix, scored on the graded path (KU, +2 ceiling)
3. **R4** — `benchmark-conjunction-ablation`, now guard-protected
4. **P30** — the reopened abstention channels in five ablation arms

## 8. What the run will and will not settle

**Will settle:** whether P2's target abstains under decomposition (P1/P2), whether
the six controls hold (P3), whether single-operand retrieval is perturbed (P4),
and whether the P32/P33 fixes move TR/KU on a larger sample.

**Will not settle:** P5, and therefore the quantity-vs-ordering confound in
`p27` §4.1.1. R4 remains a well-founded hypothesis with a falsifier, not a
result, and the verdict must present it that way.
