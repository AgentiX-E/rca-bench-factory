# MR Audit Verdict: The JSON Hypothesis Is Refuted; the Real Bottleneck Is Over-Abstention

**Conclusion first**

1. **The hypothesis "MR context JSON structuring" is refuted.** The MR errors are not "ambiguous formatting causes item misidentification" but rather that **the LLM still abstains when it has the evidence**.
2. **The real bottleneck: over-abstention.** Of the 38 numeric MR error cases, **20 (53%) are the LLM actively abstaining (`reason=llm`)**, and in **15 of those the evidence sessions were fully recalled**—the model had the numbers in hand yet returned `UNANSWERABLE`.
3. **The direction is clear, fixable, and low-risk**: these abstentions cluster on "requires derivation" questions (percentage/average/subtraction/summation/time difference) and simple counting. The model is not incapable of computing—it **didn't compute** (the arithmetic itself was already shown to be correct). The fix = strengthen the MR aggregation prompt to explicitly exclude "cross-session combination / deriving an answer" from the reasons to abstain—precisely the clause that single-session `buildQaPrompt` already has and MR lacks.
4. Recoverable headroom: if the 15 full-evidence abstentions were converted to answers, at a 50–60% accuracy rate, that would be **MR +6–9pp, Overall +1.2–1.8pp**.

---

## 1. Audit process and evidence

Following the "look at direction before concluding" method, I attributed each of the 121 MR questions in `f096338` individually:

### 1.1 Decisive evidence: abstention comes from the LLM, not the threshold

| MR decision source | Count |
|---|---|
| `answered` | 99 |
| `llm` (model actively abstains) | 22 |
| `threshold` (retrieval confidence triggered) | **0** |

**The retrieval threshold never triggered an abstention**—every abstention was the model's own decision. Moreover, the median `top1Score` of abstained questions is 0.614, heavily overlapping with the 0.665 of answered questions; retrieval confidence cannot distinguish the two.

### 1.2 Error attribution (38 numeric cases)

| Attribution | Questions | Share |
|---|---|---|
| **LLM abstention** (evidence fully recalled 15 + evidence missing 5) | **20** | **53%** |
| Answered but wrong (enumeration/dedup/off-by-one) | 18 | 47% |

### 1.3 What the 15 "full evidence yet abstained" cases have in common

The model explicitly stated why it abstained, and reading them one by one they are all one pattern—**"the answer requires derivation/computation, but I didn't see a ready-made answer directly"**:

| Question type | Example | Model behavior |
|---|---|---|
| Percentage | `percentage of packed shoes` (gt=40%) | Found "2 of 5" yet abstained |
| Percentage | `percentage of renovation cost` (gt=10%) | Abstained |
| Average | `average GPA` (gt=3.83) | Abstained |
| Average | `average age of family` (gt=59.6) | Abstained |
| Subtraction | `years older than grandma` (gt=43) | Abstained |
| Subtraction | `minutes exceeded marathon` (gt=12) | Abstained |
| Summation | `page count of two novels` (gt=856) | Abstained |
| Cash back | `cashback at SaveMart` (gt=0.75, =1%×$75) | Found $75 yet abstained |
| Time | `what time did I go to bed day before…` (gt=2) | Abstained |
| Simple counting | `food delivery services` (gt=3) | Abstained |
| Simple counting | `health devices per day` (gt=4) | Abstained |

---

## 2. Why JSON does not help

The problem with these 15 questions is not "can't tell which sentence belongs to which session" (a structural problem JSON can solve) but rather that **the model refuses to derive** (a semantic behavior problem). JSON structuring changes the presentation form; it cannot change the model's behavior of "seeing the numbers yet not drawing a conclusion."

## 3. Revised plan: strengthen the MR abstention boundary (prompt-only)

The current `buildAggregationQaPrompt` has only one line:

```
Respond with exactly "UNANSWERABLE" ONLY if the context contains no relevant information at all.
```

The single-session `buildQaPrompt` has a more complete boundary:

```
If the context offers more than one possible answer, choose the one that best matches…
Choosing between candidates or combining several turns is NOT a reason to abstain.
```

**Change**: fill in the "derivation/combination ≠ abstention" boundary in the MR aggregation prompt, explicitly listing the model's most common erroneous abstention scenarios:

```
Abstain ONLY when the context contains NO relevant information whatsoever.
If the answer can be COMPUTED from numbers already in the context — a sum, a
difference, an average, a percentage, an elapsed time, or a date read — compute
it; derivation is NOT a reason to abstain. Combining facts across sessions is
NOT a reason to abstain.
```

This is a **pure prompt change**, touching no parsing/aggregation code, with a minimal risk surface, and it directly targets 53% of the error cases.

## 4. Acceptance criteria (pending approval)

| # | Item | Threshold |
|---|---|---|
| 1 | TDD | Prompt assertion tests go red first, then green |
| 2 | Unit tests | Add ≥8 cases: new boundary sentence present, old abstention sentence still present, all other prompts byte-for-byte unchanged (regression lock) |
| 3 | Coverage | Four dimensions ≥95% |
| 4 | Local regression | lint/format/typecheck/test/build all green |
| 5 | Primary endpoint | MR abstention rate **drops significantly** (per-question exact McNemar p<0.05; current baseline 22/121 = 18.2%) |
| 6 | MR accuracy | **Rises** relative to the same-time control (descriptive + per-question paired deterministic accuracy, avoiding the run-level noise floor) |
| 7 | No regression | IE/TR/KU/ABS no worse than control −1.0pp |
| 8 | Guardrails | The abstention drop **must not** come at the cost of "forcing an answer on genuinely unanswerable questions": the ABS category is unaffected (it takes an independent path), and evidence recall for the newly answered questions must be spot-checked |
| 9 | Three-in-a-row hit | Same-time A/B (4+4 runs), with 3 consecutive treatment runs each satisfying 5–7 |

---

**Please advise**: should we proceed with "strengthen the MR abstention boundary"? Once approved, I will first write failing tests (red) → implement (green) → local regression → commit as Lambertyan → same-time A/B.
