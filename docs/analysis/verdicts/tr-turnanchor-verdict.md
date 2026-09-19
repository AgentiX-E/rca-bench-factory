# TR turnDate Anchor A/B Verdict — ACCEPT (weak, direction-correct)

**Iteration:** P1 fact-level occurrence date (Hindsight Tempr step 1)
**Commit:** `02bdd2d` (`c4bef6c` P1 + malformed-event tolerance)
**Reader:** deepseek-v4-flash, non-thinking (stable baseline)
**Design:** 4v4 interleaved, same-instant, exact permutation test

## Result (8/8 runs `success`, `questionCount=500`)

| Endpoint | control (aebd65a) | treatment (02bdd2d) | verdict |
|---|---|---|---|
| **TR accuracy** | `[94,96,95,95]` = 95.00/run (74.80%) | `[93,95,95,96]` = 94.75/run (74.61%) | **−0.25/run, p=0.74 (n.s.)** |
| Overall | 422.00/run (84.40%) | 423.00/run (84.60%) | +0.20pp, n.s. |

TR total did not move — as pre-registered, a single deterministic patch lands below the ~3-question/run within-arm noise floor.

## Sub-kind attribution (the signal that matters)

`turnDate` only touches the deterministic path (`computeTemporalAnswer`), i.e. relative/interval/ordering. eventLookup/other are unchanged, which is exactly what the analysis shows:

| TR sub-kind | questions | control | treatment | Δ | affected? |
|---|---|---|---|---|---|
| **relative** | 25 | 83/100 | **88/100** | **+5** | ✅ YES |
| interval | 26 | 95/104 | 92/104 | −3 | ✅ YES |
| ordering | 40 | 118/160 | 115/160 | −3 | ✅ YES |
| eventLookup | 20 | 48/80 | 48/80 | 0 | no (correct) |
| other | 16 | 36/64 | 36/64 | 0 | no (correct) |

## Per-question attribution (the decisive evidence)

The **relative +5** is two clean, real recoveries with zero side effect:

| question | control | treatment | root cause |
|---|---|---|---|
| "…friends and family sale at Nordstrom?" | 0/4 | **4/4** ✅ | relative anchor fixed |
| "…attend a baking class…?" | 0/4 | **1/4** ✅ | relative anchor fixed (partial) |

The **interval −3** is **judge noise, not a real regression**:

| question | control | treatment | what actually happened |
|---|---|---|---|
| "…bird watching when I attended the workshop?" | 4/4 | 0/4 | control's `answer='30'` was **judged correct against gold `'Two months'`** — a judge false-positive (30 days ≠ 2 months). The context only states "attended workshop a month ago" and never states when bird watching *started*, so the question is retrieval-deficient. treatment's same `'30'` was correctly judged false. |
| "…stand-up comedy specials…?" | 3/4 | 4/4 | real +1 improvement |

The **ordering −3** is **sampling/judge drift, not a deterministic regression**:

| question | Δ | evidence |
|---|---|---|
| "…order of concerts…?" | c1/4→t0/4 | engine answer near-identical both arms; judge flipped 1/4→0/4 |
| "…coffee maker or malfunction first?" | c2/4→t1/4 | LLM-fallback path (llmRaw present), turnDate not involved |
| "…fixing fence or trimming hooves first?" | c4/4→t3/4 | 3/4 identical; one run's LLM extraction differed (temperature-0 float jitter) |

## Why ACCEPT despite n.s. overall

1. **Direction correct** — anchoring `"yesterday"`/`"a month ago"` to the *turn* that states it (not the question date) is the exact Hindsight occurrence-date concept; the two recovered questions were the ones pre-audited as this failure mode.
2. **Zero real regression** — interval/ordering −3 decompose to judge false-positives and sampling drift, not deterministic computation changes.
3. **The malformed-event crash fix is mandatory** — the first P1 cut aborted all 4 treatment runs with `undefined.trim()`; the tolerance filter (with regression test) is the correct root-cause fix for a latent crash the prompt change first exposed.

## Honest conclusion

This is the **same pattern as the timeRange iteration**: a single deterministic patch recovers a few mechanism-level questions but lands below the noise floor, so overall accuracy cannot resolve it. `relative +5` is real and clean; the remaining Hindsight gap needs the **fact-level occurrence interval + date-range retrieval channel** (P2/P3), not another isolated prompt patch.

## Guard rails

IE 563→566, MR 392→389, KU 234→239, ABS 119→119 — all within sampling noise; `turnDate` only enters the TR path, so these are not caused by the change.
