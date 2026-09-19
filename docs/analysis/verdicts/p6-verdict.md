# P6 — what the first post-fix run actually showed

## Summary

Run `34586809021` (at `f470f5b`, the first run after the answer-cache fix) was
**partially** successful, and reading it honestly changed three conclusions:

1. **The answer-cache fix worked where it could.** IE (150 q) and MR (121 q) went
   to **0 broken / 0 repaired** — 271 questions exactly paired. Before the fix,
   those blocks carried re-query noise.
2. **It did not cover everything.** KU still showed **0 broken / 1 repaired**, and
   that residual had a real cause: `completeStructured` is a separate LLM entry
   point and was never cached. Fixed in `624e241`.
3. **The remaining TR discordance was not a defect at all**, and my invariant
   check was wrong to flag it. Corrected in `validate_fix.py`.

## 1. Two of three findings were mine, not the code's

Before describing what the run showed, the record of what I got wrong:

| claim I made | what the run showed | correction |
|---|---|---|
| The fix clears the pairing invariant. | IE/MR cleared; KU did not. | Verified, then fixed properly (`624e241`). |
| TR `1 broken / 0 repaired` is a violation. | All 16 TR abstentions grade `false` and the baseline never abstains. | **Not a defect** — the intended abstention contrast. Tool corrected. |
| A structured-cache test on the *ablation* arms proves the fix. | Only one KU/TR ablation arm enables the path, so nothing is deduplicated. | Test was vacuous; rewritten against the main benchmark, where both arms run it. |

The third one is the one worth dwelling on. I wrote a test, it passed, and it was
**incapable of failing** — the KU ablation enables the bitemporal path in one arm
only, so a "sent once" assertion over one call is trivially true. I only caught it
because I mutation-tested instead of trusting a green suite. That is the same
failure mode as the original defect: a test that certifies a guarantee it does not
check.

## 2. The measured mechanism

The violations live in the **main** report, whose two arms differ only in
abstention. That matters, because it determines what a discordant pair can mean:

| direction | mechanism | is it a defect? |
|---|---|---|
| `baselineCorrectFeatureIncorrect` | The feature abstained (graded `false`); the baseline never abstains and answered correctly. | **No** — intended abstention contrast. |
| `baselineIncorrectFeatureCorrect` | The feature was right where the baseline was wrong, with no abstention involved. | Depends — needs an explanation. |

Per-capability counts in `34586809021`:

| capability | total | broken | repaired | feature abstentions |
|---|---|---|---|---|
| IE | 150 | 0 | 0 | 4 |
| MR | 121 | 0 | 0 | 0 |
| KU | 72 | 0 | **1** | **0** |
| TR | 127 | **1** | 0 | 16 |
| ABS | 30 | 0 | 28 | 28 |

TR's single broken pair sits inside 16 abstentions, all graded `false` — fully
explained. KU's single **repaired** pair has **zero** abstentions in the
capability, so nothing in the abstention mechanism can account for it. That is a
genuine residual, and it is the one the run was actually reporting.

## 3. Root cause of the KU residual

`tryBitemporalKnowledgeUpdate` returns **without passing through `respondWith`**,
so it consults neither the abstention gate nor the answer cache. It is the only
path that both (a) bypasses `respondWith` and (b) calls `completeStructured`.

Measured directly: with the answer cache shared and no structured cache, a single
KU extraction prompt was sent **6 times** across the run's arms. With the
structured cache wired in, **1 time**. Mutation-verified in both directions.

This is why IE and MR were clean and KU was not — IE/MR answer exclusively
through `complete`, which the answer cache already covered. The partition was
clean enough to name the missing entry point from the data alone.

## 4. The fix (`624e241`)

- `structuredCache`, keyed by **full prompt + serialized schema** (the provider
  receives the schema inline, so the same prompt under a different schema is a
  different request).
- Failures are **not** cached, so a fallback never depends on which arm ran first.
- All structured calls route through one helper; wired into every ablation pair
  (6 declarations, 12 sites), mirroring the answer cache exactly.

Tests (663 → 666), all mutation-verified:

| test | fails when |
|---|---|
| main benchmark re-sends no structured prompt | the runner stops passing `structuredCache` |
| two systems sharing only the structured cache issue one call | the cache is not consulted |
| same, with a non-vacuity assertion | either of the above |
| helper records structured prompts | — (this is the harness gap that hid the original bug) |

## 5. A tool bug, corrected

`check_pairing_invariant` treated **any** non-zero discordant count as a
violation, which flagged TR's abstention contrast as a defect and overstated the
problem. It now credits each capability's abstention count against the `broken`
direction, and treats the `repaired` direction as requiring explanation. Under the
corrected logic `34586809021` reports **exactly one** genuine residual (KU), which
matches the independent root-cause analysis.

## 6. Verification — confirmed

Run `34594513996` (at `624e241`) came back **success** and the fix is confirmed
end-to-end.

**The pairing invariant now holds.** Every non-ABS capability is 0 broken /
0 repaired over 470 diagnosed questions:

| capability | total | broken | repaired |
|---|---|---|---|
| IE | 150 | 0 | 0 |
| MR | 121 | 0 | 0 |
| KU | **72** | **0** | **0** |
| TR | 127 | 0 | 0 |
| ABS | 30 | 0 | 26 |

The KU block is the one that matters: it went from **0/1** to **0/0**, which is
the specific residual `624e241` targeted. ABS's 26 repaired is the intended
abstention contrast by construction (`expected` is null, the baseline never
returns null so scores 0).

Before the fix, this invariant was violated in 3 of 4 runs.

**Guards are stable across the fix.** Comparing the two post-fix runs:

| guard | `34586809021` | `34594513996` | floor | clears? |
|---|---|---|---|---|
| `mr-cot-aggregation` | +50 | +43 | 13 | ✅ |
| `tr-deterministic-temporal` | +11 | +10 | 4 | ✅ |
| `ku-bitemporal-knowledge-update` | +2 | +3 | 3 | ❌ |
| `tr-extended-engine` | +0 | +0 | 4 | ❌ |
| `tr-time-window` | −3 | −1 | 4 | ❌ |

The two real effects reproduce at a consistent magnitude and the three nulls stay
null, which is what a cache fix that only removes re-queries should produce — it
should not move any delta, and it does not.

### On the KU guard: +2 and +3 bracket its floor of 3

Across three same-batch runs the KU guard now reads +2, +3, +2 against a floor of
3. It sits **at** the boundary and straddles it. The honest reading is unchanged
from `p5-requantification-verdict.md`: with n = 25 the interval spans ~30 pp, and
a movement of 2–3 questions is not separable from re-running. It is neither
confirmed nor refuted, and must not be counted as a win.

## 7. What this closes, and what it does not

**Closed:** the measurement-integrity work that P5 opened. Every ablation pair now
shares all three caches (`queryExpansionCache`, `answerCache`, `structuredCache`),
so a paired comparison over this benchmark no longer carries an
LLM-non-reproducibility term. That was the prerequisite for trusting any
McNemar result, and it is now verified rather than assumed.

**Not closed:** the effect inventory is still two features (MR aggregation, TR
engine) plus three nulls and one unresolved. The next substantive question is the
one `p5-mr-guard-verdict.md` names — **why MR stops at ~79–84%** under a prompt
that already forces enumeration. That is a capability ceiling, not a measurement
problem, and it is now the right thing to work on.

**One instrument worth reviewing before more ablations:** the judge cache is a
module-level global keyed by `(question, predicted, expected)`, shared across
every system in the process, with no eviction and no per-arm scoping. It is
correct for this benchmark — the key is complete, so two calls with the same key
must agree — but it is process-global state that outlives any single run, which is
a sharp edge for a test harness.
