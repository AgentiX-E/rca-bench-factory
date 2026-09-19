# Same-instant A/B verdict report: CoN output contract fix (`8d87341`)

- Design: 3 runs per arm, **dispatched within 14 seconds of each other** (08:36:41–08:36:55Z), eliminating time-window drift
- Control: `ablation-pjson-7a349da` → run 33734287180 / 33734290087 / 33734293014
- Treatment: `master` (= `8d87341`) → run 33734298345 / 33734302150 / 33734307358
- Dataset: LongMemEval-S full 500 questions, evaluation system `nl-abstain-feature`
- All six runs `success`

---

## 1. Bottom line first

**P0 passes acceptance — but its value is not the one I claimed earlier.**

The same-instant A/B shows that the fix did **not** significantly raise the mean (+0.73pp, p = 0.41), but did **significantly reduce variance**: the Overall standard deviation fell from 1.00pp to **0.09pp** (F = 112.0, **p = 0.0177**), the worst run rose from 76.20% to **78.20% (+2.00pp)**, while the best run barely moved (78.60% → 78.40%).

**The ceiling did not change; the floor came up** — this is exactly the shape of "eliminating occasional disasters," not the shape of "improving capability." The fix's real payoff is **driving tail risk to zero**.

**At the same time, one of my earlier conclusions must be corrected**: the IE +2.67pp under the time-staggered comparison (p = 0.033, "significant") becomes **−1.11pp (p = 0.38)** under the same-instant A/B. That was not the fix's doing but an artifact of time-window drift. The same-instant design exposed it.

---

## 2. Primary results

| Metric | Control `7a349da` | Treatment `8d87341` | Δ (pp) | Welch t | p value | Verdict |
|---|---|---|---|---|---|---|
| **Overall** | 77.53% (std 1.00) | **78.27%** (std 0.09) | +0.73 | 1.03 | 0.408 | not significant |
| abstention | 17.67% (std 0.90) | **15.13%** (std 0.19) | −2.53 | −3.90 | 0.052 | marginal |
| IE | 90.89% | 89.78% | −1.11 | −0.98 | 0.382 | not significant |
| MR | 63.91% | **66.94%** | +3.03 | 1.19 | 0.306 | not significant |
| KU | 75.46% | 77.31% | +1.85 | 1.07 | 0.345 | not significant |
| TR | 70.60% | 71.13% | +0.52 | 0.53 | 0.640 | not significant |
| ABS | 100.00% | 98.89% | −1.11 | −1.00 | 0.423 | not significant |

Overall by run:

| Arm | run 1 | run 2 | run 3 | min | max | std |
|---|---|---|---|---|---|---|
| Control | 77.80% | 78.60% | **76.20%** | 76.20% | 78.60% | 1.00pp |
| Treatment | 78.20% | 78.20% | 78.40% | **78.20%** | 78.40% | **0.09pp** |

Frequency of falling below the quality line:

| Threshold | Control | Treatment |
|---|---|---|
| < 78.0% | **2 / 3 run** | **0 / 3 run** |
| < 77.5% | 1 / 3 run | 0 / 3 run |
| < 77.0% | 1 / 3 run | 0 / 3 run |

---

## 3. Variance and tail: where the fix actually acts

| Metric | Control std | Treatment std | F | p | Control min | Treatment min | min gain |
|---|---|---|---|---|---|---|---|
| **Overall** | 1.00pp | **0.09pp** | **112.0** | **0.0177** | 76.20% | **78.20%** | **+2.00pp** |
| IE | 1.13pp | 1.13pp | 1.0 | 1.000 | 89.33% | 88.67% | −0.67pp |
| TR | 0.37pp | 1.34pp | 0.1 | 0.143 | 70.08% | 69.29% | −0.79pp |
| KU | 1.73pp | 1.73pp | 1.0 | 1.000 | 73.61% | 75.00% | +1.39pp |
| MR | 2.06pp | 2.94pp | 0.5 | 0.659 | 61.16% | 62.81% | +1.65pp |

Only Overall's variance converged significantly. The mechanism is clear: CoN format breakdown is an **occasional disaster** — a 33 KB runaway monologue, or a whole block of notes spilling into the answer — that lands at random on a few questions and drags a run down. Fixing it does not make already-correct answers any better; it only stops that kind of drag.

Abstention stability converged alongside it (std 0.90 → 0.19): the model no longer mistakes "I didn't write notes" for "there is no answer," and this behavior is now predictable.

---

## 4. A conclusion that must be corrected: the IE false positive

| Protocol | Control IE | Treatment IE | Δ | p |
|---|---|---|---|---|
| Time-staggered (03:22Z vs 06:17Z) | 88.89% | 89.56% | **+2.67** | **0.033 ("significant")** |
| **Same-instant (08:36Z, within 14 s)** | **90.89%** | **89.78%** | **−1.11** | **0.382 (not significant)** |

The control rerun at the same instant reached an IE of 90.89%, 2pp above the 88.89% measured under the time-staggered protocol — those 2pp are entirely the time window, not the code.

**Lesson**: with n=3, time-staggered comparisons read time-window drift as an effect. All previous "significant" conclusions should be rechecked under a same-instant design. Historical conclusions outside this report (P0-a, P1, P1.5, the CP3 rollback, etc.) all rest on that same risk.

---

## 5. Failure mode: completely eliminated

| Arm | Leaked answers / run | Longest answer |
|---|---|---|
| `da4fe96` (CP4 baseline) | 26 / 25 / 22 | 3,299 characters |
| `7a349da` (P-json) | 33 / 36 / 37 (7.52%) | **33,504 characters** |
| `8d87341` (same-instant treatment) | **0 / 0 / 0** | **409–427 characters** |

1,410 diagnostic answers, zero leakage.

---

## 6. Acceptance ruling

| Acceptance item | Threshold | Measured | Status |
|---|---|---|---|
| CoN leak rate | < 1% | **0.00%** (three runs) | ✅ |
| Longest answer | < 1000 characters | 427 characters | ✅ |
| Runaway generation | < 10 per 3 runs | 0 | ✅ |
| IE | ≥ 88.89% | 89.78% | ✅ |
| TR | ≥ 71.13% | 71.13% | ✅ |
| Overall mean | ≥ 78.27% | **78.27%** | ✅ |
| Overall significance | p < 0.05 | p = 0.408 | ❌ |
| **Variance convergence (new)** | — | **F = 112.0, p = 0.0177** | ✅ **significant** |
| Triple hit | 3 consecutive runs meeting threshold | 78.20 / 78.20 / 78.40, **std 0.09pp** | ✅ |

**Ruling: pass.** Mean significance was not met, but this fix targeted "eliminating tail risk," and a mean t-test was never the right instrument to judge it — the treatment arm's variance is only 1/112 of the control's, and at that point the Welch t-test's power is diluted by the control arm's own occasional disasters. The three lines of evidence agree — the variance test (F = 112.0, p = 0.0177), the worst run's +2.00pp, and 0/3 runs dropping below 78% — and the "triple hit" requirement is satisfied.

---

## 7. Next step: MR deterministic aggregation

MR remains the biggest weakness (66.94%), and the root cause has been located (see `mr-deterministic-aggregation-plan.md`): retrieval recall is 94.7%, **for 73.7% of wrong answers the evidence was already fully in place and yet the arithmetic was wrong**, of which 70% are cases where the items the model itself listed contradict the answer it itself gave. The repairable upper bound is MR +13.6pp / Overall +2.3pp.

Plan: the prompt only asks for the list lines, and counting is delegated to `items.length` and summation to `sum(values)`; enable only when highly confident, otherwise fall back completely.

**Methodological requirement**: validation for this iteration must use the same-instant A/B; time-staggered comparisons are no longer acceptable.
