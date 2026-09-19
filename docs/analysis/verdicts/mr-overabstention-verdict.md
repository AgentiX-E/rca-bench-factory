# MR Abstention Fix A/B Verdict: Partial Success, but Primary Endpoint Not Met

**Conclusion first**

1. **The primary endpoint (significant drop in MR abstention rate) was not achieved.** The abstention rate went only from 16.74% → 15.08% (**−1.65pp**), per-question exact McNemar **p = 0.48**, not significant. The fix did not pull back at scale the questions where "the numbers were in hand yet it abstained."
2. **But MR accuracy rose significantly at the per-question level**: on deterministically gradeable questions (n=104) **+5.29pp** (67.07% → 72.36%), paired t-test **p = 0.0033**, exact sign test **17 wins 4 losses, p = 0.0072**.
3. **At the run level it is not significant, and it introduced high variance**: MR exact permutation p = 0.43; the treatment arm's 4 runs were [66.1, 73.6, 72.7, **64.5**], with **1 run actually below all 4 controls** (the "three-in-a-row hit" is not met).
4. The gains come almost entirely from **11 questions that "stopped abstaining"** (net +5.00 questions/run), which is exactly the design goal—but on a scale far smaller than the audit's estimate of 15, and partly offset by 7 questions that "started abstaining in reverse."

---

## 1. Primary endpoint: abstention rate (not met)

| Metric | Control `f096338` | Treatment `03d0465` | Test |
|---|---|---|---|
| MR abstention rate | 81/484 = **16.74%** | 73/484 = **15.08%** | Δ −1.65pp |
| Per-question McNemar | control-worse 11 | treatment-worse 7 | **p = 0.48** |
| Per-run abstention rate | [19.8, 14.0, 15.7, 17.4]% | [16.5, 12.4, 14.9, 16.5]% | heavily overlapping |

The fix only pushed abstentions from ~20 questions/run down to ~18 questions/run, **not the 7–8 questions the audit predicted**.

## 2. MR accuracy: significant per-question, not significant at the run level

| Measure | Control | Treatment | Δ | Test |
|---|---|---|---|---|
| Run-level MR (n=4 vs 4) | 66.74% | 69.21% | +2.48pp | exact permutation **p=0.43** |
| **Per-question deterministic (n=104 paired)** | 67.07% | 72.36% | **+5.29pp** | paired t **p=0.0033** |
| Sign test | — | — | 17 wins 4 losses 83 ties | **p=0.0072** |

**Why it is not significant at the run level**: the treatment arm has huge variance (MR 64.5%–73.6%, 9pp), while the control arm is extremely stable (66.1%–67.8%, 1.7pp). Per-question pairing controls for question difficulty, so it can detect the real effect; the run level is drowned by the variance of "the fix sometimes works, sometimes doesn't."

## 3. Source of variance: the fix "sometimes doesn't work"

| Treatment run | Abstention rate | MR accuracy |
|---|---|---|
| 33820715330 | 12.4% | **73.55%** (best) |
| 33820720519 | 14.9% | 72.73% |
| 33817209500 (canary) | 16.5% | 66.12% |
| 33820726847 | 16.5% | **64.46%** (worst, below all controls) |

**Abstention rate and accuracy are strongly correlated**: lowest abstention → highest accuracy. The fix "took effect" in 2/4 runs (abstention fell to 12–15%, MR jumped to 72–73%) and "did not take effect" in 1/4 run (abstention still 16.5%, MR dropped to 64.5%). DeepSeek is not bit-deterministic even at temperature=0, and the prompt boundary does not "hold the model down" every time.

## 4. Where the gains actually come from

| Change | Questions | Net correctness change |
|---|---|---|
| Stopped abstaining (fix hits) | 11 | **+5.00 questions/run** |
| Started abstaining in reverse | 7 | −0.50 questions/run |
| All other questions | ~103 | +0.5 questions/run (noise level) |

All 11 recovered questions had evidence recall (11/11); examples: `food delivery services` (0.00→1.00), `Marvel movies re-watched` (0.50→1.00), `percentage of property price` (0.75→1.00)—**the mechanism is real and the direction is correct, but it is only 11 questions**.

## 5. Guardrails

| Capability | Δ | Verdict |
|---|---|---|
| IE | +1.00pp | ✅ No regression |
| TR | −0.59pp | ✅ |
| ABS | +0.00pp | ✅ |
| KU | −1.04pp | ⚠️ Right at the −1.0pp boundary (KU is an untouched path; this is noise/drift) |

---

## 6. Verdict and recommendations

**Verdict: primary endpoint not met, but the mechanism is real and there is a small per-question gain.**

- ✅ The direction of the fix is right (11 questions recovered, per-question +5.29pp significant).
- ❌ The primary endpoint (significant drop in abstention) was not achieved; the run-level +2.48pp is not significant, has high variance, and does not satisfy "three-in-a-row hit."
- The audit's "15 fixable questions" was an overestimate: abstention is **unstable run by run** (different questions abstain each run), and some "abstained despite evidence" questions involve multi-hop derivation that the prompt boundary cannot rescue.

**Recommendation (choose one)**:

| Option | Description | My leaning |
|---|---|---|
| **A. Keep + switch to a stronger lever** | The abstention boundary is necessary but insufficient. The real lever is to give derivable questions (percentage/average/subtraction/summation) a **deterministic derivation engine** (like TR's temporal engine and KU's bitemporal engine), letting code compute rather than relying on prompt persuasion | **Recommended** |
| B. Revert 10de393 | If you insist on "only a three-in-a-row hit may stay," then this commit does not qualify and should be reverted | Not recommended (it would throw away the confirmed +5.29pp per-question gain) |
| C. Keep the status quo | Accept this "small, noisy" gain and move on to other iterations | Conservative |

My recommendation is **A**: **keep** this fix (it is harmless and carries a confirmed small gain), but make it explicit that MR's next real lever is a "deterministic derivation engine," handing the 11+ derivable questions that this round could not suppress via prompting over to code—continuing the already-validated TR/KU philosophy of "the LLM manages semantics, code manages computation."
