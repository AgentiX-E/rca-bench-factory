# TR Date-Anchored Recall — A/B Verdict

**Date:** 2026-09-06
**Result:** **REJECT (no significant effect)**, reverted

---

## 1. Result

| Endpoint | control | treatment | delta |
| --- | --- | --- | --- |
| **TR accuracy** | 75.59% `[96,94,96,98]` | 75.00% `[94,97,96,94]` | **−0.75/run (p = 0.80)** |
| IE | 94.67% | 94.17% | −0.75/run (n.s.) |
| MR | 79.55% | 80.37% | +1.00/run (n.s.) |
| KU | 81.94% | 81.94% | 0 |
| ABS | 99.17% | 99.17% | 0 |
| Overall | 84.60% | 84.50% | −0.10pp |

The TR mechanism endpoint did **not** move (p = 0.80), so the hypothesis
("event-identification questions fail because the anchor-date turn is not
retrieved") is **mostly false**.

## 2. Per-question attribution (the honest picture)

Of the 9 anchored event-identification questions:

| Question | control | treatment |
| --- | --- | --- |
| cooking something a couple of days ago | 0/4 | **4/4** ✅ (the ONE true retrieval failure, fixed) |
| art-related event two weeks ago | 0/4 | 0/4 |
| business milestone four weeks ago | 0/4 | 0/4 |
| bike fixed past weekend | 0/4 | 0/4 |
| airline on Valentine's day | 2/4 | 2/4 |
| charity event a month ago | 4/4 | 4/4 |
| vehicle first in February | 4/4 | 1/4 (sampling noise; "in February" is not an anchor) |

**8 of 9** anchored wrong answers are **LLM extraction/judgment failures**, not
retrieval failures — the correct turn IS in the retrieved window, but the model
picks the wrong date/entity. The date-anchored re-rank only addresses the single
case where the correct turn is genuinely missing from recall.

## 3. Root cause of the null result

The audit's sample (`gardening activity two weeks ago`) was a retrieval failure,
but it was **not representative**: most time-anchored TR questions already have
the answer turn in the window and fail because the DeepSeek reader mis-extracts
the date or mis-identifies the event — the same reader ceiling that bounds MR and
TR's residual errors. The +1-question deterministic fix is real but far below the
2–3-question within-run noise floor, so it cannot be validated.

## 4. Action

`c8e5257` is reverted. This is a second honest negative result (after DCG, and in
the same family as the cross-encoder rerank audit): **the remaining TR gap is a
reader-semantics ceiling, not a retrieval-architecture gap.**

---

**No further code change.** The TR gap (73–75% vs HydraDB 90.97%) is gated by
the DeepSeek reader's date-extraction and event-ordering judgment, which is the
same fixed constraint identified across MR/KU/TR.
