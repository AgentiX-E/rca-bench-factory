# MR Duration/Age Derivation-Routing Fix — A/B Verdict

**Date:** 2026-09-05
**Fix under test:** `a104ea0` — `fix(eval): route duration and age-difference questions to derivation`
**Treatment:** `master` (`a104ea0`)
**Control:** `mr-derivation-control` (`4640c86`, the immediate parent — the only difference is the fix)
**Protocol:** same-instant interleaved 4v4; all 8 runs `completed` / `success`, `questionCount = 500`

> Note: this is distinct from the 2026-09-04 `mr-derivation-verdict.md`, which
> evaluated the earlier `183a3cc` derivation-prompt routing. This iteration
> extends that classifier with four duration/age phrasings.

---

## 1. Verdict

**ACCEPT.** The fix does exactly what it was designed to do, and the per-question
evidence is airtight. The accuracy-level permutation test is underpowered at
n=4 — demonstrated by the control arm showing a coincidental, unreachable KU
drift with the *same* p-value — so the decision rests on the mechanism endpoint
and the per-question attribution, not on accuracy.

---

## 2. Primary endpoint — moved-set abstention (mechanism)

The fix re-routes five MR questions from enumeration → derivation (the moved set):

| # | Question | gold |
| --- | --- | --- |
| 1 | How long have I been working in my current role? | `1 year and 5 months` |
| 2 | How many years older is my grandma than me? | `43` |
| 3 | How many years older am I than when I graduated from college? | `7` |
| 4 | How many minutes did I exceed my target time by in the marathon? | `12` |
| 5 | How many years will I be when my friend Rachel gets married? | `33` |

Abstentions per run (out of 5 moved questions):

```
control    [3, 3, 3, 4]   mean 3.25
treatment  [1, 1, 1, 1]   mean 1.00
```

**Complete separation** — `min(control) = 3 > max(treatment) = 1`. Exact
permutation test: **1/70 = 0.0143 one-sided**. This is the single most extreme
relabelling by construction, with no distributional assumption.

## 3. Per-question attribution (the binding evidence)

| Question | control | treatment | outcome |
| --- | --- | --- | --- |
| current role (`1y5m`) | 0/4 correct, 4/4 abstain | **4/4 correct**, 0 abstain | recovered |
| grandma older (`43`) | 0/4 correct, 4/4 abstain | **4/4 correct**, 0 abstain | recovered |
| college graduate (`7`) | 3/4 correct, 1/4 abstain | **4/4 correct**, 0 abstain | recovered |
| marathon exceed (`12`) | 4/4 correct | 4/4 correct | unchanged |
| Rachel married (`33`) | 0/4 correct, 4/4 abstain | 0/4 correct, 4/4 abstain | unchanged (retrieval) |

The two fully-recovered questions (`current role`, `grandma older`) were **4/4
abstainers under control and became 4/4 correct under treatment**, and their
answers were verified against gold (`3 years 9 months − 2 years 4 months =
1 year 5 months`; `75 − 32 = 43`). This is deterministic — the exact questions
the fix targeted now compute the right answer — not a statistical fluctuation.

`Rachel married` did not recover because its `32` age operand is not in the
retrieved window (the Category-C retrieval failure catalogued in the audit),
which is out of scope for a prompt-routing fix.

## 4. Recovery efficiency

```
MR abstentions removed : 53 -> 42  = -11 over 4 runs = 2.75/run
MR correct gained      : 354 -> 364 = +10 over 4 runs = 2.50/run
recovery efficiency    : 10/11 = 90.9%
```

## 5. Co-primary — MR accuracy (weak, noise-floored)

```
control   [87, 89, 90, 88]  mean 88.50/121 = 73.14%
treatment [90, 93, 91, 90]  mean 91.00/121 = 75.21%
delta     +2.50/run = +2.07pp
```

Exact permutation p = 3/70 = **0.0429**. Separation is at the boundary
(`min(treatment) = 90 = max(control)`), so this is weak on its own. It is
reported for completeness; the decision rests on §2 and §3.

## 6. Guard honesty — KU drifted, and that is the point

Per-capability accuracy (pooled 4 runs):

| Capability | control | treatment | delta | note |
| --- | --- | --- | --- | --- |
| IE | 571/600 = 95.17% | 570/600 = 95.00% | −0.17pp | n.s. |
| **MR** | 354/484 = 73.14% | **364/484 = 75.21%** | **+2.07pp** | the fix |
| KU | 226/288 = 78.47% | 235/288 = 81.60% | +3.13pp | **noise, see below** |
| TR | 382/508 = 75.20% | 386/508 = 75.98% | +0.79pp | n.s. (p = 0.186) |
| ABS | 119/120 = 99.17% | 119/120 = 99.17% | 0.00 | unchanged |

The KU shift of +3.13pp (per-run `[58,57,56,55]` → `[59,59,57,60]`, delta
+2.25/run) yields the **same** exact permutation p = 3/70 = 0.0429 as the MR
target. That is not evidence the fix affected KU — it is provably unreachable:
`classifyAggregationKind` and `buildDerivationQaPrompt` are called **only** from
`answerSessions` (the MR path, `natural-language-memory.ts` line 546–547); the
KU path (`answerKnowledgeUpdate` → `buildKnowledgeUpdatePrompt`) never
references either.

The KU drift is therefore pure LLM sampling noise across runs, and it is a
cautionary demonstration: **at n=4, an accuracy shift of ~2 questions/run cannot
be resolved from noise by the permutation test.** That is exactly why this
project's methodology treats the mechanism endpoint as the decision criterion
and accuracy as a noise-floored descriptive estimate. The overall 82.60% →
83.70% (+1.10pp) is likewise inflated by this non-MR noise (+13 across
IE/KU/TR); the fix's own, attributable contribution is the MR +2.07pp.

---

## 7. Conclusion

The fix is **accepted** on:

1. **Moved-set abstention** 3.25 → 1.00/run, complete separation, exact
   p = 0.0143.
2. **Per-question attribution**: two 4/4 abstainers recovered to 4/4 correct with
   gold-verified answers, one marginal recovery, one unchanged, one still blocked
   by the known retrieval gap.

**Recovery efficiency 90.9%.** Guards IE/TR/ABS unchanged; the KU movement is
proven noise (unreachable code path + same-p coincidence).

**Next target (unchanged):** the Category-C retrieval failure behind the
`Rachel married` question and the three age questions — the user's age `"32"` is
retrieved inconsistently (present for "average age", absent for "Alex born" and
"Rachel married"). That is a retrieval-ranking/coverage problem and a larger,
separate iteration.
