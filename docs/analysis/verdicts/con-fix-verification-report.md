# P0 Iteration Verification Report: Chain-of-Note Output Contract Fix (`8d87341`)

- Dataset: LongMemEval-S, full 500 questions
- Treatment: `8d87341` (CoN output contract fix), 3 runs, 2026-09-03 06:17Z
- Control A: `7a349da` (P-json), 3 runs, 2026-09-03 03:22Z
- Control B: `da4fe96` (CP4 baseline), 3 runs, 2026-09-03 01:38Z
- Evaluation system: `nl-abstain-feature`

---

## 1. Bottom line up front

**The direct P0 objective was 100% achieved, far exceeding the bar.** CoN format breakdown was completely eliminated: leak rate **7.52% → 0.00%** (zero across all three runs), longest answer **33,504 → 453 characters**. Question-level paired tests show **a significant IE improvement (+8.3 net wins, McNemar p = 0.0078)**, with TR trending positive.

**But the reported Overall is 78.27% → 77.33% (−0.93pp, Welch p = 0.22, not significant), missing the ≥78.27% acceptance bar. This round therefore did not pass acceptance.**

The decline was **not** caused by a code regression: it comes entirely from KU and MR — two capability dimensions proven to have zero intersection with this change. Using them as an internal control and removing same-day drift, the estimated true effect of the fix is **+2.22pp**.

---

## 2. Primary metrics (3-run average)

| Metric | n | `da4fe96` | `7a349da` | `8d87341` | Δ (fix−pjson) | p-value | Verdict |
|---|---|---|---|---|---|---|---|
| **Overall** | 500 | 77.20% | 78.27% | **77.33%** | −0.93 | 0.224 | not significant |
| IE | 150 | 86.22% | 88.89% | **89.56%** | +0.67 | 0.535 | treated |
| TR | 127 | 71.13% | 70.60% | **71.39%** | +0.79 | 0.497 | treated |
| KU | 72 | 76.39% | 78.70% | 75.93% | −2.78 | 0.184 | **control** |
| MR | 121 | 67.49% | 67.77% | 64.19% | −3.58 | 0.199 | **control** |
| ABS | 30 | 98.89% | 98.89% | 97.78% | −1.11 | 0.519 | independent |
| abstention | 500 | 17.67% | 17.00% | 15.47% | −1.53 | 0.084 | marginal |

Per-run Overall: `7a349da` = 78.40 / 77.80 / 78.60 (std 0.34) → `8d87341` = 77.00 / 78.40 / 76.60 (**std 0.77**). The increase in variance is itself a noise signal.

---

## 3. P0 objective attainment

| Acceptance item | Threshold | Observed | Status |
|---|---|---|---|
| CoN leak rate | < 1% | **0.00%** (0 / 470 in all three runs) | ✅ far exceeds |
| Longest answer | < 1000 characters | **453 characters** (was 33,504) | ✅ |
| Runaway generation >1000 characters | < 10 per 3 runs | 0 | ✅ |
| IE | ≥ 88.89% | **89.56%** | ✅ |
| TR | ≥ 71.13% | **71.39%** | ✅ |
| Overall | ≥ 78.27% | 77.33% | ❌ |
| Overall significance | p < 0.05 | p = 0.224 | ❌ |
| 3 consecutive runs meeting target | all met | not met | ❌ |

The mechanism by which the failure mode was eliminated is clean: the model must now keep its notes to itself (`do NOT write them out`), and the response is pinned to a single line `Answer: <phrase>`. Across three runs and 1,410 diagnostic answers, zero leaks.

---

## 4. Question-level paired tests: the IE improvement is real

470 questions (those with diagnostic data for IE/TR/KU/MR), deterministic decision layer (exact-match + numeric; the judge cannot be replayed offline), 9 full p-json × con-fix pairings:

| Capability | p-json-only correct | con-fix-only correct | Net wins | McNemar p (median) | Verdict |
|---|---|---|---|---|---|
| **IE** | 0.0 | **8.3** | **+8.3** | **0.0078** | **significant improvement** |
| TR | 0.0 | 5.3 | +5.3 | 0.227 | trending positive |
| KU | 1.3 | 0.0 | −1.3 | 1.000 | noise |
| MR | 3.7 | 0.0 | −3.7 | 0.508 | noise |

On IE, **p-json-only correct count is 0 and con-fix-only correct is 8.3** — a one-sided, zero-overlap improvement, exactly the shape "fixed the format breakdown" should have.

---

## 5. Why Overall went down instead: KU/MR are a provable control

The decline falls entirely on two dimensions that are **out of reach at the code level**:

| Boundary | Evidence |
|---|---|
| MR prompt | `buildAggregationQaPrompt`, does not call `conInstruction()` |
| MR parser | `parseAggregationAnswer`, a different function from this change's `parseQaAnswer` |
| KU prompt | `buildKnowledgeUpdatePrompt`, CoN wording inline and **unmodified** |
| KU answer shape | **0 of 72 questions contain bullet enumerations**, longest 48 characters — neither the stripper nor the 200-character circuit breaker would trigger |
| Answer length distribution | KU max 48, MR max 28, **identical** between the two versions (zero truncation) |
| Run logs | no 429 / timeout / retry; all 16 job steps success |

`conInstruction()` has only 4 call sites (`buildQaPrompt`, `buildPreferencePrompt`, `buildTemporalQaPrompt`, `buildTemporalEventLookupPrompt`), all of which serve only IE and TR.

**Corroborating evidence**: MR in the third run dropped to 60.33 (5.8pp below the other two runs in the same arm); 5 of its 8 losses are arithmetic deviations on counting questions (`3→2`, `2→4`, `4→5`) and 3 became abstain — typical LLM service fluctuation, not a logic error. IE in the same run was in fact the highest of the three runs (91.33%), ruling out global degradation.

---

## 6. Drift-corrected effect estimate

Using KU + MR (n = 193, provably unaffected) as an internal control, measured same-day drift is **−3.28pp** (−6.33 questions). Applying the same drift to the treated IE + TR (n = 277):

```
observed change      : +2.00 questions
expected drift alone : -9.09 questions
corrected effect     : +11.09 questions  (+4.00 pp on those 277)
scaled to 500        : +2.22 pp overall-equivalent
```

**Estimated true effect ≈ +2.22pp**, consistent in direction with the question-level paired net wins of +8.3/+5.3.

> **Caveat**: this correction assumes drift acts uniformly across capabilities. KU/MR are the best control currently available (the change cannot reach them), but they are not a randomized split. **This remains an estimate, not a conclusion.**

---

## 7. A valuable byproduct: TR's abstention halved

| Capability | p-json abstention | con-fix abstention | Δ |
|---|---|---|---|
| TR | 14.96% | **6.82%** | **−8.14pp** |
| IE | 7.56% | 7.11% | −0.44pp |
| KU | 7.41% | 9.72% | +2.31pp |
| MR | 16.25% | 17.91% | +1.65pp |

On TR, abstention fell from 14.96% to 6.82%: once the model stopped externalizing its reasoning, it also stopped mistaking "found no notes" for "no answer." The 8pp of questions (about 10) moved from abstain to actual answers, and about 1 of them is correct — matching the TR accuracy change of +0.79pp precisely.

---

## 8. Recommended next step: settle it with a same-moment A/B

The three datasets were collected at 01:38Z / 03:22Z / 06:17Z, a maximum gap of 4.6 hours. Abstention declines monotonically (17.67 → 17.00 → 15.47) and is highly correlated with collection window, so **time drift is a real confounding variable**, and stagger-time data alone cannot settle it.

**Proposal**: use `gh workflow run --ref <sha>` to dispatch `7a349da` and `8d87341` at the same time, 3 runs each (6 runs total, launched simultaneously), placing both commits at the same moment and eliminating time drift entirely.

- **Criterion**: if con-fix Overall is significantly higher than p-json (Welch p < 0.05) → keep the fix and proceed to the MR project
- **If still not significant** → the fix is neutral for Overall (though the 0% leak rate and lower variance still stand as gains), so keep it and pivot to higher-value directions
- **Cost**: 6 concurrent runs, roughly 1 hour plus the corresponding API quota

Regardless of the outcome, **the P0 fix itself should be kept**: it drove a 7.5% format breakdown (including 33KB of runaway generation) to zero, which is a certain engineering gain independent of Overall statistical noise.
