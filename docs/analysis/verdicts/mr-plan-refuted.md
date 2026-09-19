# MR Deterministic Aggregation Plan Refuted: Root-Cause Re-Diagnosis

**Conclusion first**

1. **The already-approved "MR deterministic aggregation" plan is based on a misdiagnosis and cannot be implemented.** In a per-question simulation on real MR raw output, naive deterministic aggregation (counting bullets / summing bullet values) would **net-regress MR**: COUNT −14 questions, SUM −28 questions (about −42 questions/run in total)—the direction is opposite and the magnitude is catastrophic.
2. **MR's bottleneck is not arithmetic but semantic enumeration.** The final attribution for the 109 numeric MR questions: **74% (28 questions) had their evidence fully present in the context, yet the model read it and aggregated incorrectly**; retrieval/truncation loss accounts for only **5% (2 questions)**; genuine derived computation (3+5, 440−250, and the like) accounts for **21% (8 questions)**—and the model **got nearly all of that arithmetic right**.
3. **The model's own Step 2 arithmetic and deduplication are correct; Step 1 enumeration is the step that is wrong.** Handing the arithmetic off to code = performing correct operations on an incorrect enumeration, which only amplifies the errors.
4. Real fixable headroom: truncation/retrieval is only 2 questions, not worth doing; arithmetic is only 0–2 questions against a risk of 42 questions. **The ROI of this direction is negative and it should be abandoned.**

---

## 1. Evidence: per-question simulation of deterministic aggregation

On the MR diagnosis for `f096338` (121 questions), I simulated the new approach with "parse bullets → deterministic counting/summation":

| Question type | Model accuracy | Deterministic accuracy | Fixed correct | Fixed wrong | Net change |
|---|---|---|---|---|---|
| COUNT (how many) | 54.9% (28/51) | 27.5% (14/51) | **2** | **16** | **−14** |
| SUM (money/duration) | 70.2% (33/47) | 10.6% (5/47) | **0** | **28** | **−28** |

**Why are so many "fixed wrong"?** Examining them one by one:

- `How many items of clothing do I need to pick up or return` (gt=3): the model's Step 1 listed **6 lines** (each of the 3 items written twice), yet Step 2 **correctly deduplicated to 3**. Deterministic counting = 6 → wrong.
- `How many fish in both aquariums` (gt=17): the bullets are 3 lines of prose, the answer 17 = 10+7, and the model **computed it right**. Deterministic "count bullets" = 3 → wrong.
- `How many pages left in Nightingale` (gt=190): this is **subtraction** (440−250), and the model computed it right. Deterministic "count bullets" = 7 → wrong.
- `How many rollercoasters` (gt=10): a bullet says "Space Mountain (3 times)", the answer 10 = 3+1+1+1+1+3, and the model **got the multiplication and summation all right**. Deterministic "count bullets" = 6 → wrong.

**Conclusion**: the model's Step 2 (dedup + arithmetic + question-type judgment) is precisely **the correct half**; the error lies in the completeness and deduplication of the Step 1 enumeration. And "dedup + question-type judgment" is a semantic task that code cannot do better than the LLM.

## 2. Where the earlier "73.7% arithmetic errors" came from

`mr_error_taxonomy2.py` directly labeled "the model's enumeration contradicts its answer" as an "arithmetic error." But contradiction has a direction:

- Enumeration right, answer wrong (true arithmetic error) → deterministic can fix it — **measured at only 0–2 questions/run**
- Enumeration wrong, answer right (true enumeration error) → deterministic would fix it wrong — **measured at 16–28 questions/run**

Earlier, this direction was not checked, so 70% of the "contradictions" were mistakenly treated as "arithmetically fixable." This is the same class of lesson as the earlier "96% Top-1 was really Top-5" and "IE +2.67pp was really drift": **look at the direction first, then draw the conclusion.**

## 3. MR's real bottleneck: semantic enumeration

Of the 109 numeric MR questions, 38 were answered incorrectly, attributed as follows:

| Attribution | Questions | Share | Fixability |
|---|---|---|---|
| Evidence in context, model aggregates wrong (**semantic enumeration**) | 28 | **74%** | Requires improving the model's ability to read multiple sessions and identify items |
| Retrieval/truncation lost the evidence | 2 | 5% | Retrieval is already 94.7%; ceiling extremely low |
| Derived computation (arithmetic) | 8 | 21% | Model arithmetic is already correct; not the bottleneck |

Truncation-side supplement: 78.5% of MR contexts carry a `[truncated]` marker, but only 2 questions were actually answered wrong because truncation lost evidence—**truncation is not the bottleneck**.

## 4. Candidates after abandoning this direction (require another audit; no guessing)

| Candidate | Basis | Status |
|---|---|---|
| **MR context JSON structuring** | Single-session already uses `formatStructuredContext` (P-json `7a349da`), while MR still uses **plain text**; the LongMemEval CP4 report says JSON structure helps item identification | Hypothesis, pending verification (the asymmetry is the most suspicious part) |
| Enumeration prompt strengthening (dedup/completeness) | The current prompt is already fairly detailed; marginal benefit is doubtful | Low priority |
| Retrieval/truncation tuning | Only 2 questions; ceiling extremely low | Abandon |
| Deterministic aggregation | Already refuted; net −42 questions | **Abandon** |

**My recommendation**: for the next MR iteration, first audit the "MR context JSON structuring" line—it is the only structural difference from single-session that has a validated benefit and that MR currently lacks. But this is a **new hypothesis** and requires offline attribution equal to this document (verifying on real MR raw the effect of JSON vs plain text on enumeration quality) before deciding whether to run an A/B.

---

**Please advise**: should we proceed with "audit the MR JSON structuring hypothesis"? Or would you prefer that I first do another, finer round of classification of MR's semantic enumeration errors (examining per question exactly what the model missed and which type of item it got wrong), and then decide the direction?
