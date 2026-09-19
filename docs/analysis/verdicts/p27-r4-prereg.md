# P27-R4 pre-registration — conjunction decomposition in query expansion

**Status:** pre-registered, NOT dispatched
**Trigger condition:** only after `p25-clause-isolation-prereg.md` (run
`35097631133`) is adjudicated, so that the two changes are never again
confounded in a single commit — the mistake documented in `p24-cap-verdict.md` §4.
**Evidence base:** `/workspace/analysis/verdicts/p27-residual-abs-failure.md`
**Artifact:** `/workspace/analysis/ab_admission/run_35019792901_run/Single-session_diagnostics.json`

---

## 1. The claim under test

> When a question conjoins operands (`X and Y`, `X or Y`, `X vs Y`) and the
> query expansion fuses them into a single phrase, retrieval is silently
> resolved toward the operand that *is* present in the corpus. The resulting
> context is topically saturated but factually half-complete, and the model
> answers the answerable half instead of abstaining.

Mechanism: `p27` §4.1–4.2.

## 2. The intervention

`buildQueryExpansionPrompt` (`natural-language-memory.ts:2349`) currently
instructs entity-property binding and prohibition of bare category nouns. It
says **nothing** about conjunctions. R4 adds an instruction to decompose:

- If the question conjoins two or more operands, emit **one phrase per operand**,
  each binding that operand to the question's property.
- Additionally emit the fused phrase, so a corpus where both operands co-occur
  is not penalised.
- Do not merge distinct operands into one phrase.

Proposed shape (exact wording to be finalised during implementation):

```
If the question asks about TWO OR MORE things joined by "and", "or", or "vs",
list a SEPARATE phrase for EACH one, plus the combined phrase.
Do NOT merge distinct operands into a single phrase.
```

## 3. Predictions

Fixed before implementation, scored after the run.

| # | prediction | falsifier |
|---|---|---|
| **P1** | `6456829e_abs` expansion becomes decomposed — a phrase containing `chili` distinct from the tomato phrase appears | expansion stays fused ⇒ mechanism in §4.1 is wrong |
| **P2** | `6456829e_abs` abstains, ABS → **30/30** | abstains without P1 holding ⇒ right answer, wrong reason |
| **P3** | The 6 conjunctive controls (`edced276_abs`, `e5ba910e_abs`, `gpt4_70e84552_abs`, `gpt4_c27434e8_abs`, `gpt4_fe651585_abs`, `80ec1f4f_abs`) all still abstain — **6/6** | any control flips to answered ⇒ decomposition causes collateral damage |
| **P4** | Non-ABS capabilities move by at most ±1 question each — decomposition does not perturb single-operand retrieval | any capability moves by ≥2 ⇒ the expansion change leaks outside its target |
| **P5** | **Quantity controls also decompose and remain stable.** The confound in `p27` §4.1.1 is that every *failing* conjunctive case is a quantity question and every *ordering* control is not. P5 requires the run's diagnostics be split by question type: quantity-type conjunctive questions must not degrade relative to their current outcome | quantity-type conjunctive questions degrade ⇒ R4's effect is confounded with question type and the hypothesis in §4.1 remains unproven |

P3 is the load-bearing prediction. P2 alone is worth 3.3pp; P3 is what
distinguishes "R4 fixed a bug" from "R4 traded one failure for another".
P5 exists because the cohort cannot separate expansion shape from question type —
see `p27` §4.1.1. If P5 cannot be evaluated (too few quantity controls), the run
**does not resolve the confound** and this must be stated in the verdict rather
than glossed.

## 3.2 Power ceiling and cohort availability (ADDED, measured 2026-09-19)

This section was absent when P1–P5 were fixed and its absence was a defect in
the pre-registration, not in the run. P3 is a 0-of-n claim, so its strength is
set by `n` and `n` is set by the sampler, not by the experiment.

**Cohort availability is a function of `LIMIT`.** The arm scopes to `['ABS','IE']`
and takes its instances from the caller's stratified sample, so the round-robin
sampler decides how much of the seven-question conjunctive cohort survives.
Measured against the real dataset (reproducible via
`analysis/r4-cohort-guard-check.mjs`):

| `LIMIT` | scoped instances | cohort covered | guard verdict |
|---|---|---|---|
| 60 | 35 | **1/7** | THROW (missing 6, incl. the P2 target) |
| 100 | 58 | 4/7 | THROW (missing 3) |
| 150 | 86 | 5/7 | THROW (missing 2) |
| **200** | 115 | **7/7** | **PASS** |
| 300 | 156 | 7/7 | PASS |
| all | 180 | 7/7 | PASS |

**Therefore: at the previously planned `LIMIT=60` neither P2 nor P3 was
evaluable.** P2 had no target to score, and P3 reduced to a single control.

**What P3 buys at each `n`.** With 0 events in `n` trials, the exact one-sided
95% Clopper-Pearson upper bound on the per-question collateral-damage rate is
`1 - 0.05^(1/n)`:

| `n` controls | upper bound on per-question damage rate |
|---|---|
| 1 | 95.0% (vacuous — cannot fail for any reason the experiment could detect) |
| 3 | 63.2% |
| **6** | **39.3%** |
| 9 | 25.9% |
| 29 | 9.8% |

**This cohort can never support a tight bound.** The whole of LongMemEval-S
contains exactly 7 conjunctive ABS questions (6 controls + 1 target), so
`p < 30%` — which needs `n >= 9` — is **unreachable at any limit**. The honest
statement of a P3 pass is "per-question collateral damage is below 39%", not
"R4 is safe".

**P5 is unevaluable at this cohort size** and must be declared so. The cohort
splits 4 quantity-type (`80ec1f4f`, `edced276`, `6456829e`, `e5ba910e`) against
3 ordering-type (`gpt4_70e84552`, `gpt4_c27434e8`, `gpt4_fe651585`, all TR). One
question moving is 25% of the quantity subgroup, so no subgroup comparison is
supportable. P5's confound (§4.1.1) therefore **remains unresolved by any run of
this cohort**, and the verdict must say that rather than reading a 4/4 as
evidence.

## 3.3 Cohort coverage is now asserted by the runner

Because the shortfall above is silent — a 1-of-6 cohort yields a 1/1 that reads
as a pass — `runQueryExpansionDecompositionAblation` now measures
`cohortCoverage` against `CONJUNCTION_ABS_COHORT` and **throws** when any member
is missing, unless the caller passes `requireCohortCoverage: false`. Coverage is
returned in both cases and written to the run artifact
(`benchmark-conjunction-ablation-report.json`), so an under-covered run is
visible in its own output. The guard counts only cohort members the arm will
actually score, so a mis-scoped arm cannot satisfy its own guard.

Dispatch sizing consequence: **the R4 run must use `LIMIT=200`.** At 200 the arm
also receives a larger TR (28) and KU (28) sample, which is what lets the P32 and
P33 fixes be scored alongside it without spending a second run.

Cost consequence, stated because it is real: turns drive the embedding and
retrieval work, and `LIMIT=200` is 99,291 turns against `LIMIT=60`'s 30,008 —
a **3.3x** increase. The increase is the price of a P3 that can fail; the
alternative is paying 1x for a prediction that cannot.

## 3.5 Counter-example sweep result (COMPLETED offline)

The gating sweep required by §4 has been run against the 7-question conjunctive
cohort. Result:

| id | operand 1 in ctx | operand 2 in ctx | lines w/ both | verdict |
|---|---|---|---|---|
| `80ec1f4f_abs` | yes | yes | 13 | splitting safe (fused phrase retained anyway) |
| `edced276_abs` | yes | **no** | 0 | splitting safe |
| `6456829e_abs` | yes | **no** | 0 | **the target** |
| `e5ba910e_abs` | yes | yes | 0 | safe |
| `gpt4_70e84552_abs` | yes | yes | 0 | safe |
| `gpt4_c27434e8_abs` | yes | **no** | 0 | safe — and this is the matched control |
| `gpt4_fe651585_abs` | yes | yes | 0 | safe |

**No question in the cohort depends on a single turn carrying both operands.**
Only `80ec1f4f_abs` has co-occurring lines (13), and R4 retains the fused phrase,
so its retrieval is unchanged by construction.

**Gate: PASSED.** R4 is safe to implement with respect to collateral damage on
the cohort it targets.


## 4. Counter-example sweep (free, runs before implementation)

The 29 non-target ABS questions and their contexts are in hand. Before spending
a run, sweep the conjunctive cohort for questions where decomposition would
*worsen* retrieval — e.g. a fused phrase that matches a single turn containing
both operands, which splitting would break. If such a question exists in the
cohort, R4 must preserve the fused phrase (it does, per §2) and the sweep must
show no regression on it.

**This sweep is the gating step.** If it cannot be completed offline, R4 is not
ready to implement.

## 5. Why this is not dispatched yet

`p24-cap-verdict.md` §4 records the cost of shipping two changes in one commit:
the cap's effect could not be isolated from the entity-identity sentence's, and
recovery required a dedicated run. The isolation run `35097631133` exists
precisely to pay that debt.

R4 must therefore land **after** `35097631133` is adjudicated, as its own commit
with its own run. Sequencing them is not bureaucracy — it is the repair of a
methodological error that has already cost one benchmark cycle.

## 6. Honest limitation, restated

The warrant for R4 is a 6-OK/1-FAIL natural experiment with a single positive
case. `p27` §7 states this. A confirmation run with P1–P4 fixed in advance is
what would convert the hypothesis into a measured effect; until then R4 is a
well-founded hypothesis, not a result.
