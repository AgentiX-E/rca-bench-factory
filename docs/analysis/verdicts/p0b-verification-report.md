# P0-b Same-Time A/B Verdict: Regression Eliminated, IE Rebounds Sharply, Acceptance Passed

**Conclusion first**

1. **P0-b passes acceptance.** The primary endpoint (abstention rate on preference questions) went **22.41% → 0.00%**, pooled proportion test z=4.73, **p = 2.26e-06**; the treatment arm's Wilson 95% CI is `[0.00%, 4.23%]`, well below the ≤8% threshold.
2. **IE precision +4.78pp** (90.33% → 95.11%), and **all 3 treatment runs are above all 4 control runs** (perfect separation, exact permutation p=0.0286). The fix not only eliminated the regression but turned preference questions into a net gain.
3. **Overall +1.87pp** (78.00% → 79.87%, permutation p=0.057, marginally significant).
4. **All guardrails pass**: format collapse 0.00%, no narrative leakage, no regression on extractive IE (2.89% → 3.03%).
5. **One honest negative-control caveat**: the unreachable paths MR/KU/TR also drifted (−1.79 / +3.59 / +1.44pp, mean +1.08pp). This gives the run-level noise floor of ±2–3.5pp for this experiment, so **the exact attribution of accuracy is limited, but the mechanistic endpoint (abstention rate) is unaffected by this noise**.

---

## 1. Primary endpoint: preference abstention rate (deterministic, no judge noise)

| Metric | Control `8d87341` | Treatment `f096338` | Test |
|---|---|---|---|
| Preference abstention rate | 26/116 = **22.41%** | 0/87 = **0.00%** | z=4.73, **p=2.26e-06** |
| Treatment arm Wilson 95% CI | — | **[0.00%, 4.23%]** | ≤8% threshold ✅ |
| Questions abstained in all 4 control runs | **5 questions** | **0 questions** | |
| Abstained in ≥1 control run and in no treatment run | **7 questions** | 0 questions | Exact McNemar p=0.0156 |

The control arm abstained 4/4 on 5 questions, while the treatment arm answered 3/3 on all of them. This is a **deterministic behavioral reversal**, mechanically locked to this contract change; no time-of-day drift could fabricate a "22% → 0%" collapse.

## 2. Per-capability precision (run level)

| Capability | Control (4 runs) | Treatment (3 runs) | Δ | Permutation p |
|---|---|---|---|---|
| **IE** | 90.33% (89.33/90.67/89.33/92.00) | **95.11%** (96.00/95.33/94.00) | **+4.78pp** | **0.0286** |
| TR | 71.26% | 72.70% | +1.44pp | 0.200 |
| KU | 74.65% | 78.24% | +3.59pp | 0.0286 |
| MR | 66.53% | 64.74% | −1.79pp | 0.286 |
| ABS | 99.17% | 98.89% | −0.28pp | — |
| **Overall** | 78.00% (77.60/79.00/77.20/78.20) | **79.87%** (80.20/79.80/79.60) | **+1.87pp** | 0.057 |

**IE breakdown**: preference (29 questions) abstention 22.41%→0.00%; extractive (121 questions) abstention 2.89%→3.03% (+0.14pp, stable)—**all** of the gain comes from the 29 preference questions, consistent with the design expectation.

## 3. Guardrails

| Guardrail | Result | Verdict |
|---|---|---|
| Format collapse rate (470 questions × all runs) | Control 0.05% (1/1880) → treatment **0.00%** | ✅ |
| Narrative leakage (unlabeled runaway answers >400 characters) | Treatment **0** (guaranteed by construction) | ✅ |
| Longest treatment-arm answer | 719 characters, all **legitimate recommendations carrying an `Answer:` label** ("Based on your interest in…"), not leakage | ✅ |
| IE / Overall no worse than control −1.0pp | IE +4.78, Overall +1.87 | ✅ |

## 4. Negative-control drift (must be disclosed transparently)

MR/KU/TR are paths **byte-for-byte unreachable** by this patch (each has its own independent prompt and parser), yet their run-level deltas are −1.79 / +3.59 / +1.44pp (mean +1.08pp).

This demonstrates that: **at the same-time run level with n=4 vs 3, per-capability precision carries ±2–3.5pp of noise/drift**. Implications:

- KU's +3.59pp (permutation p=0.0286) is a **false positive**—identical code yet "significant," showing that at n=4 vs 3 the exact permutation test at the run level lacks resolution and cannot serve as a basis for attribution.
- IE's +4.78pp must be discounted: after drift correction it is ≈ **+3.7pp** (+4.78 − 1.08), still a clear gain, and IE has the double support of "perfect separation + mechanism lock."
- Overall's +1.87pp should likewise be treated as "direction correct, magnitude uncertain" (p=0.057).

**Methodological correction** (to be written into subsequent iterations): at the scale of this experiment, the run-level per-capability precision delta cannot serve as evidence of significance; **the primary endpoint must adopt a mechanistic endpoint** (deterministic measures such as abstention rate and collapse rate), with accuracy serving only as a descriptive estimate carrying a noise floor.

## 5. Failed item and replacement run

- Treatment-arm run `33746105344` failed: a DeepSeek LLM call hit `TypeError: terminated` mid-flight (undici connection interruption); this is a **transient infrastructure failure** (retrieval diagnostics had already completed and `recommendedThreshold=0.57` had already been computed before the break), not a code issue.
- A replacement run `33754914590` (master) has been re-dispatched and is **still running** (expected to finish around 13:40Z). It is a **late-dispatched sample** and is not included in the 4C+3T same-time primary analysis above; once complete it will be checked separately as robustness corroboration.

## 6. Acceptance verdict

| Acceptance item | Result |
|---|---|
| Primary endpoint: preference abstention ≤8% and p<0.05 | ✅ 0.00%, p=2.26e-06 |
| Guardrails: collapse 0.00% / no leakage / IE & Overall ≥ control −1.0pp | ✅ All pass |
| Satisfied independently per run (3 treatment runs) | ✅ Abstention rate 0.00% in all three runs, collapse rate 0.00% in all three runs |
| Local regression (lint/format/typecheck/test/build, four-dimension coverage ≥95%) | ✅ Passed |
| Commit author Lambertyan, all English | ✅ `f096338` |

**P0-b passes acceptance.** Regression eliminated, IE rebounded, no new regression, no leakage.
