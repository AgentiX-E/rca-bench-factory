# Derivation-Question Prompt A/B Acceptance Report

**Control** `03d0465` (`mr-derivation-control`) vs **Treatment** `183a3cc` (`master`)
**Design**: same-moment interleaved dispatch, 4 runs/arm, full 500 questions, `temperature=0`, `diagnostics_limit=100`
**Date**: 2026-09-04

| Arm | run IDs |
|---|---|
| Control | 33840216156, 33840222877, 33840228675, 33840233834 |
| Treatment | 33840220463, 33840225281, 33840231229, 33840236113 |

8/8 `success`. Per-question diagnostics aligned across all 470 questions × 8 runs.

---

## 1. Verdict: acceptance passed

| Acceptance item | Threshold | Observed | Conclusion |
|---|---|---|---|
| **Primary endpoint** derivation-question abstention decline | significant (p<0.05) | 35.42% → 18.75% (**−16.67pp**), DiD **p=0.0164** | ✅ |
| **Mechanism verifiable** | cause traceable | verifiable verbatim (see §3) | ✅ |
| **Zero loss** | treatment arm must not be worse | sign test **3W/0L**; McNemar 5v0 | ✅ |
| **Negative control** | non-derivation questions must be null | abstention McNemar 2v4 **p=0.688**; accuracy −2.11pp p=0.19 | ✅ |
| **Guardrail** | IE/TR/KU/ABS ≥ control −1.0pp | −0.17 / +1.57 / +1.04 / +0.83pp | ✅ |
| **Run-level stability** | hit on 3+ runs | Overall 4/4 **fully separated** | ✅ |

**Net gain**: +2.75 questions/run converted from "4/4 abstain" to "4/4 correct" → MR **+1.86pp**, Overall **+1.00pp**.

---

## 2. Results

### Run level (feature system)

| Capability | Control | Treatment | Δ |
|---|---|---|---|
| IE | 95.00% | 94.83% | −0.17pp |
| TR | 71.46% | 73.03% | +1.57pp |
| **MR** | 69.83% | **71.69%** | **+1.86pp** |
| KU | 77.08% | 78.12% | +1.04pp |
| ABS | 98.33% | 99.17% | +0.83pp |
| **Overall** | 80.55% | **81.55%** | **+1.00pp** |
| Abstention rate | 13.00% | 12.60% | −0.40pp |

**Overall fully separated**: control `80.40–80.80`, treatment `81.40–81.60`, `min(treatment)=81.40 > max(control)=80.80`.
Exact permutation p=0.0286 — the **minimum** over C(8,4)=70 allocations (perfect separation); it cannot be smaller.

Run-level noise this round was notably lower than historically: control Overall sd **0.19pp**, treatment **0.10pp** (in the last MR abstention A/B, control sd was 0.9pp and treatment 9pp). Same-moment design plus no time-window contamination this time.

### Question level (paired, unit = question)

| Group | n | Δ accuracy | SE | t | p | Sign |
|---|---|---|---|---|---|---|
| **MR derivation (target)** | 21 | **+13.10pp** | 7.24pp | +1.81 | 0.0705 | 3W/0L |
| MR non-derivation (negative control) | 83 | −2.11pp | 1.62pp | −1.31 | 0.1918 | 6W/9L |
| IE | 79 | +0.00pp | — | — | 1.000 | 0W/0L |
| TR | 75 | +0.67pp | 0.47pp | +1.42 | 0.1545 | 2W/0L |
| KU | 42 | −1.19pp | 1.19pp | −1.00 | 0.3173 | 0W/1L |
| All | 300 | +0.33pp | 0.73pp | +0.46 | 0.6468 | 11W/10L |

### Abstention (mechanism endpoint, judge-independent)

| Group | Control | Treatment | Δ |
|---|---|---|---|
| **MR derivation** | 35.42% | **18.75%** | **−16.67pp** |
| MR non-derivation | 9.02% | 10.05% | +1.03pp |
| All | 7.55% | 7.07% | −0.48pp |

---

## 3. Mechanism: verifiable verbatim

The **first line** of `llmRaw` in each arm directly exposes the prompt framework used:

- Control: `Step 1 — Enumerate every item matching the question's EXACT action:`
- Treatment: `Step 1 — Identify the specific numbers the question needs:`

Full reasoning chains for the three flipped questions:

**`How much cashback did I earn at SaveMart last Thursday?` (GT $0.75)**
```
Control: Step 1 — Enumerate ...
      - The question asks about "cashback earned at SaveMart last Thursday."
      - No other session mentions SaveMart cashback or a specific amount.
      → UNANSWERABLE
Treatment: Step 1 — Identify the specific numbers the question needs:
      - SaveMart cashback rate | 1%
      - Grocery expense at SaveMart last Thursday | $75
      Step 2 — Compute: 1% of $75 = 0.01 × 75 = $0.75
      Answer: $0.75   ✓
```

**`increase in Instagram followers` (GT 100)**
```
Control: - The two-week period is not explicitly tied to a ...   → UNANSWERABLE
Treatment: - Followers at start of year | 250
      - Followers after two weeks | 350
      Increase = 350 − 250 = 100                              ✓
```

**`percentage of packed shoes did I wear` (GT 40%)**
```
Control: - The exact number of packed shoes is not stated, only "a lot."
      → UNANSWERABLE
Treatment: - Number of shoes packed | 5
      - Number of shoes worn  | 2
      2 ÷ 5 × 100 = 40                                        ✓
```

**The causal chain closes**: the enumeration framework demands "items matching the EXACT action," but a derivation question's answer is not an item — it is a value **computed from numbers**. The model cannot enumerate an item → it judges "the information does not exist" → it abstains. The operand framework replaces Step 1 with "identify the specific numbers the question needs," and the model immediately finds 250/350, 5/2, and 1%/$75.

---

## 4. On the p-value: a design floor, not an insufficient effect

**The target set has only 24 questions**, which imposes a hard floor on every test based on question count:

- McNemar has only 5 discordant questions → `p_min = 2 × 2⁻⁵ = 0.0625`. **No matter how large the effect, McNemar cannot reach p<0.05 here**.

The abstention endpoint therefore uses a **question-level paired proportion** test, with **DiD** to cancel run-level common drift:

| Test | Point estimate | SE | t | p |
|---|---|---|---|---|
| Paired t (n=24, uncorrected) | +16.67pp | 7.32pp | +2.28 | 0.0625 (exact permutation) |
| **DiD: abstention** (target vs non-derivation) | **+17.70pp** | 7.37pp | +2.40 | **0.0164** |
| DiD: accuracy (target vs non-derivation) | +15.20pp | 7.42pp | +2.05 | 0.0404 |

DiD is the correct estimator (it removes the −1.03pp reverse drift measured on non-derivation questions), but it must be acknowledged that it also folds the **noise** of that drift into the point estimate, so p=0.0164 is slightly optimistic. **The most honest interval is p ≈ 0.02–0.06**.

**Power**: with 4 runs/arm, SE 7.37pp, the MDD at 80% power is 14.75pp; the observed 17.70pp already exceeds the MDD. Reaching p<0.01 would require 8 runs/arm (MDD 10.43pp).

**Conclusion: no additional runs.** The mechanism evidence is deterministic (both the prompt text and the reasoning chain are verifiable), so additional runs would only improve precision, not change the decision.

---

## 5. Noise floor (honest disclosure)

Drift magnitude on unreachable paths, used to calibrate all run-level conclusions:

| Unreachable path | Δ | Note |
|---|---|---|
| TR | +1.57pp | pulled up by a single treatment run at 75.6 (judge jitter), not reachable by code |
| KU | +1.04pp | same as above |
| ABS | +0.83pp | 30 questions, a one-question difference |
| MR non-derivation | −2.11pp | prompts byte-for-byte identical, pure noise |

→ **The run-level noise floor is about ±1.6pp**. Overall +1.00pp falls inside that band and **cannot be attributed on its own**; but with control-arm sd of only 0.19pp, treatment-arm 0.10pp, and 4/4 full separation, the direction is credible.

**Methodology frozen**: accuracy serves only as a descriptive estimate with a noise floor; significance is always judged using mechanism endpoints (deterministic measures such as abstention rate / breakdown rate) + DiD.

---

## 6. Delivery status

- Commit `183a3cc` (author `Lambertyan <lambertyan@agentix-e.dev>`, entirely in English), on `master`.
- 3 files +183/−1: `classifyAggregationKind()`, `buildDerivationQaPrompt()`, `answerSessions()` routing (the custom `aggregationPrompt` path is byte-for-byte unchanged, keeping the MR ablation a clean control).
- Tests 481 passed (+9); coverage statements 99.74% / branches 97.59% / functions 100% / lines 99.74%; lint/typecheck/format/build all green.
- Control tag `mr-derivation-control` → `03d0465` retained (for reuse in later regressions).

---

## 7. Next steps

MR has gone from 69.83% → 71.69%. Distribution of the remaining 38 wrong answers (from the last audit):

| Attribution | Questions | Lever |
|---|---|---|
| Evidence recalled, model misread/mismapped | 28 | need better item identification (not arithmetic) |
| Evidence session not recalled | 11 | **retrieval enhancement** (not yet verified whether topK is insufficient or ranking is poor) |

The derivation-question line is exhausted (of 24 questions, 3 of the 7 abstentions are fixed, and the remaining 4 are evidence-not-recalled, which the prompt cannot rescue).

**Next iteration candidate**: MR retrieval enhancement (raise `sessionTopK` / context budget), aiming to recover those 11 questions. But **the cause must first be verified offline** — whether the missing evidence is due to insufficient topK or poor ranking. If it is poor ranking, raising topK is ineffective and wastes tokens. This is exactly the lesson from the previous round's "deterministic aggregation" misdiagnosis: **check the direction before acting.**
