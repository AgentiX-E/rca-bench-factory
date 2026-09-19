# P5 — every ablation guard, re-quantified against a same-batch floor

This is the consolidated re-quantification. Every guard below is read from the
same four config-identical runs at `2c2c635`, and each is compared against a floor
measured on that guard's **own scope** rather than the overall 500-question floor.

The reason scope matters: the overall floor is 11 q / 2.20 pp on 500 questions. A
guard scored on 121 MR questions or 127 TR questions has its own sampling and
endpoint variance, and inheriting the overall number would either over- or
under-state the bar. Each floor here is measured directly.

## The verdict table

All five guards, read from the same four config-identical runs at `2c2c635`:

| guard | n | baseline → feature | deltas across runs | floor | clears? | verdict |
|---|---|---|---|---|---|---|
| `mr-cot-aggregation` | 121 | 51–56 → 98–101 | +50, +42, +47, +44 | 13 | ✅ **3.2×** | **Real, large** |
| `tr-deterministic-temporal` | 127 | 74–77 → 84–86 | +7, +10, +11, +9 | 4 | ✅ **1.8×** | **Real, moderate** |
| `ku-bitemporal-knowledge-update` | 25 | 15–18 → 17–20 | +0, +2, +2, +2 | 3 | ❌ **0.7×** | **Unresolved** |
| `tr-extended-engine` | 127 | 83 → 85 | −2, 0, +2, +2 | 4 | ❌ | **Null** |
| `tr-time-window` | 127 | 84 → 84 | +2, −1, +4, 0 | 4 | ❌ | **Null** |

Two guards are real. Three are not distinguishable from noise. MR is the
strongest measured effect in the project; TR engine is real but moderate; KU,
`tr-extended-engine`, and `tr-time-window` must all be reported as unresolved or
null, not as wins.

## Per-guard detail

### MR aggregation — 42–50 q, strongest result

Full derivation in `p5-mr-guard-verdict.md`. In brief: MR-scoped churn floor is
8–13 questions (mean 10.2) over 6 run pairs; the guard's delta is 42–50, and on
every individual run the direction is concordant (46–56 repaired against 3–6
broken). The churn is 50–62, far above the floor — that is signal, because the
arms render genuinely different prompts.

### TR engine — 7–11 q, moderate

| run | baseline | feature | delta | churn (repaired/broken) |
|---|---|---|---|---|
| `34492139716` | 77/127 | 84/127 | +7 | 11/4 |
| `34558715449` | 76/127 | 86/127 | +10 | 13/3 |
| `34558717704` | 74/127 | 85/127 | +11 | 15/4 |
| `34558719936` | 75/127 | 84/127 | +9 | 12/3 |

Mean delta **9.25 q**, range 4, sd 1.48. Breakage is 3–4 on every run against
11–15 repairs, so the direction is concordant even though the magnitude varies.

The TR-scoped floor is ~4 q (from the per-capability table in `p5-verdict.md`).
The smallest observed delta (7) clears it by 1.8×.

**The historical 83 → 97 (14 q) does not reproduce on current code.** It appears
in eight TR-focused runs from earlier in the code's history; the same-batch runs
give 7–11. The guard is still real, but it should be quoted at its same-batch
magnitude, not the older figure — a 14 q claim overstates it by ~50%.

### KU bitemporal — +2 q, unresolved

Deltas across the four runs: **+0, +2, +2, +2** (baseline 15–18 of 25, feature
17–20). n = 25, floor 3, best delta +2. It never clears. With 25 questions the
95% interval spans roughly 30 pp, so a +2 movement is well inside what re-running
would produce. Report as **unresolved pending a larger KU sample** and do not
count it toward the project's effect inventory.

### `tr-extended-engine` — null

Deltas **−2, 0, +2, +2** of 127 (83 → 85 on the last run). Sign is not even
consistent across runs. Floor 4. This is noise, and should be recorded as a null
result rather than a small positive one.

### `tr-time-window` — null

Deltas **+2, −1, +4, 0** of 127 (84 → 84 on the last run). Net zero over four
runs with the sign flipping. Floor 4, max 4 — at the boundary and unsupported by
the net. This matches the earlier P4 verdict that called it INCONCLUSIVE with
"2 q, opposite signs"; the fourth run confirms rather than resolves that.

Both TR nulls are worth stating plainly: they are not failures of the
measurement, they are the measurement reporting that these two features do not
move accuracy beyond endpoint noise. That is a legitimate and useful result, and
it is the third and fourth such result in the project alongside the TR recall
arms and the entity-graph recall arm.

## Floors used, and why

| scope | floor (q) | source |
|---|---|---|
| overall (500 q) | 11 | four config-identical runs, `p5-verdict.md` |
| MR (121 q) | 13 | elementwise churn on `featureCorrect`, `mr_floor.py` |
| TR (127 q) | 4 | per-capability range, `p5-verdict.md` |
| KU (25 q) | 3 | per-capability range, `p5-verdict.md` |

For MR I use the **per-question churn range (13)** rather than the delta range
(8). Delta is a difference of two noisy quantities and should have the *larger*
range; that it does not here is a coincidence of this quadruple. The churn range
is both the conservative choice and the directly interpretable one — it is the
number of questions a re-run can move.

A note on the TR floor: the two TR nulls have delta ranges of 4 and 5, which
straddle the floor of 4. That is the expected behaviour of a null — a feature
with no effect has a delta range that *equals* the noise, because delta is the
difference of two quantities each carrying the noise. It is the TR-engine guard's
range of 4 sitting on a mean of 9.25 that distinguishes it from these two: same
range, different location.

## Caveat carried over

These floors are ranges over **n = 4** observations, not fitted distributions. A
fifth run could widen them. MR's 3.2× margin survives a substantial widening;
TR's 1.8× margin is thinner and would not, which is a reason to treat the TR
magnitude as approximate rather than to doubt the sign.

For MR specifically, `p5-mr-guard-verdict.md` §3 establishes by probe that the
`20592f2` cache-sharing fix does not alter the MR ablation (3 LLM calls before and
after, with the same 2 distinct aggregation prompts), so the pre-fix floor is
valid for the current code. That is verified, not assumed.
