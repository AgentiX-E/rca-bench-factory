# MR Operand-Expansion Fix — A/B Verdict

**Date:** 2026-09-05
**Fix under test:** `a45b32a` — `fix(eval): expand derivation questions into operands, not activities`
**Treatment:** `master` (`a45b32a`)
**Control:** `mr-operand-expansion-control` (`a104ea0`, the immediate parent — the only difference is the fix)
**Protocol:** same-instant interleaved 4v4; all 8 runs `completed` / `success`, `questionCount = 500`

---

## 1. Verdict

**ACCEPT.** The fix does exactly what it was designed to do at the mechanism
level: the missing `"32"` operand now reaches the retrieved window in **every**
run (complete separation, exact permutation p = 0.0143), and one of the two
target questions (`Alex born`) is fully recovered from 4/4 abstain to 4/4
correct with the answer verified against gold. The second (`Rachel married`)
remains blocked by a different, now-precisely-diagnosed limitation (relative-time
reasoning), not by retrieval.

---

## 2. Primary endpoint — real `"32"` reached the retrieved window

The raw substring `"32"` is rejected because it matches the `12:32` timestamp
noise present in every context; only age phrasings (`turned 32`, `I'm 32`,
`age 32`, …) count.

| arm | runs (of 2 target questions) | mean |
| --- | --- | --- |
| control | `[0, 0, 0, 0]` | 0.00 / 2 |
| treatment | `[2, 2, 2, 2]` | 2.00 / 2 |

**Complete separation** — `max(control) = 0 < min(treatment) = 2`. Exact
permutation test: **1/70 = 0.0143 one-sided**. The operand is retrieved on every
treatment run and on zero control runs.

## 3. Per-question outcome

| Question | gold | control | treatment | outcome |
| --- | --- | --- | --- | --- |
| How old was I when Alex was born? | `11` | 0/4 correct, 4/4 abstain | **4/4 correct** | **recovered** |
| How many years will I be when Rachel gets married? | `33` | 0/4 correct, 4/4 abstain | 0/4 correct, 4/4 abstain | retrieval fixed, reasoning still blocks |

### `Alex born` — fully recovered

The expansion now emits `["my age", "Alex's birth date"]`. The derivation prompt
reads `"I just turned 32 last month" → 32` and `"he's just 21" → 21`, computes
`32 − 21 = 11`, and answers `11` (gold) on all 4 runs.

### `Rachel married` — retrieval fixed, reasoning still blocks

The expansion emits `["my age", "Rachel's wedding date"]`. The retrieved window
now contains **both** operands — `"I'm 32"` **and** `"getting married next
year"`. The model still abstains: it reads "no wedding date" and does not
interpret `"next year"` as `+1`, so it cannot compute `32 + 1 = 33`.

This is a **relative-time reasoning** gap (interpreting a relative offset as a
duration), not a retrieval gap, and it is out of scope for a query-expansion
fix. It is now precisely characterized for a future iteration.

## 4. Co-primary — MR accuracy (descriptive)

```
control   [91, 93, 93, 90]  mean 91.75/121 = 75.83%
treatment [95, 92, 94, 90]  mean 92.75/121 = 76.65%
delta     +1.00/run = +0.83pp
```

The +1 question/run is exactly the recovered `Alex born` question — the MR
accuracy delta matches the mechanism outcome with no unexplained residual.

## 5. Guards

| Capability | control | treatment | delta |
| --- | --- | --- | --- |
| IE | 566/600 = 94.33% | 569/600 = 94.83% | +0.50pp n.s. |
| KU | 228/288 = 79.17% | 226/288 = 78.47% | −0.69pp n.s. |
| TR | 381/508 = 75.00% | 385/508 = 75.79% | +0.79pp n.s. |
| ABS | 118/120 = 98.33% | 119/120 = 99.17% | +0.83pp (same pre-existing ABS anomaly, out of scope) |

All non-MR movements are within run-to-run sampling noise; the change is only
reachable through `answerSessions` (the MR path).

---

## 6. Conclusion

**ACCEPT** on the mechanism endpoint:

1. **Operand retrieval** 0/2 → 2/2, complete separation, exact p = 0.0143.
2. **`Alex born`** recovered 0/4 → 4/4 correct with a gold-verified answer.
3. **MR accuracy** +0.83pp, exactly matching the recovered question.

**Next target (now precisely diagnosed):** the `Rachel married` class — future-age
questions whose `years until X` is expressed as a relative offset (`"next year"`)
rather than a number. The derivation prompt needs to teach the model to convert
relative offsets to durations before adding them to the current age.
