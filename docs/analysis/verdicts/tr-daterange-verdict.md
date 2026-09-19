# TR Date-Range Recall Arm A/B Verdict — REJECT (negative result)

**Iteration:** P2 date-range recall channel (Hindsight Tempr step 2)
**Commit:** `4a7c7ce`
**Reader:** deepseek-v4-flash, non-thinking
**Design:** 4v4 interleaved, same-instant, exact permutation test

## Result (8/8 runs `success`, `questionCount=500`)

| Endpoint | control (eb610a0) | treatment (4a7c7ce) | verdict |
|---|---|---|---|
| **TR accuracy** | `[94,96,96,100]` = 96.50/run (75.98%) | `[94,96,95,94]` = 94.75/run (74.61%) | **−1.75/run, n.s. (p=0.94 increase)** |
| Overall | 426.50/run (85.30%) | 422.75/run (84.55%) | −0.75pp, n.s. |

TR total did not move — the pre-registered go/no-go ("if TR does not move, stop") is met.

## The date arm works, but it is net-negative

The offline audit had found 6 eventLookup questions whose answer turn was
entirely absent from retrieval while its header date sat inside the window.
The date arm **did recover three of them**:

| question | control | treatment |
|---|---|---|
| "cooking something for my friend a couple of days ago" | 0/4 | **4/4** ✅ |
| "investment for a competition four weeks ago" | 3/4 | **4/4** ✅ |
| "airline on Valentine's day" | 1/4 | 2/4 ✅ |

But it **damaged two questions that semantic recall already answered**:

| question | control | treatment |
|---|---|---|
| "sports event two weeks ago" (gold `charity soccer tournament`) | 4/4 | **0/4** ❌ — answered `Midsummer 5K Run` |
| "life event of a relative a week ago" (gold `wedding`) | 4/4 | **0/4** ❌ — answered `kindergarten graduation ceremony` |

Net eventLookup: 48/80 → 46/80 (**−2**).

## Root cause: a time window does not uniquely identify the fact

Appending every in-window turn raises recall but lowers precision. Both
damaged questions had their correct turn AND a second, same-window event
(the 5K run; the kindergarten graduation). Widening recall pulled the
distractor into the context, and the LLM — which must then choose between
two in-window events — picked the wrong one. That choice is exactly the
semantic judgment DeepSeek performs weakly, which is why the time window
alone cannot substitute for it.

This is the **precise refutation of the single-arm version of Hindsight's
Tempr**: Hindsight narrows to a unique fact via fact-level occurrence
intervals + cross-encoder rerank + graph traversal, not via a bare header
date window. A date range alone is a precision loss in this benchmark.

## Go/no-go outcome (pre-registered)

"if TR accuracy does not move, stop — the gap is then reader-side, not
recall-side." TR accuracy did not move (n.s., slight negative). **Stop the
temporal-axis optimization path.**

## Decision: revert

The change is net-negative (recovered 3, damaged 2, −1.75/run TR) and
carries a real precision cost. Per the "revert on regression / no dead
code" standard, revert `4a7c7ce`.

## Guards

IE 95.17→94.50%, MR 81.20→80.37%, KU unchanged, ABS 100→100 — all within
sampling noise; the date arm only enters the TR path.
