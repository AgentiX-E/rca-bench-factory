# P5 verdict — the measurement floor, and the code-revision confound that produced the 25-question figure

**Commit under test:** `2c2c635` on `master` for all four reference runs.
**Analyzer:** `packages/cortex-eval/src/variance.ts` (`ee99c61`) and
`analysis/scripts/analyze_variance.py`.
**Design:** config-identical repetition — no P4 feature enabled (both default
off), `limit=0`, `deepseek-v4-flash`, `thinking=disabled`, `temperature=0`,
`runs=1`, same 170095-vector embedding cache.

## Verdict first

**The between-run floor is ~23 questions of churn per run-pair, not 2, and the
net drift over four config-identical runs is 11 questions / 2.20 pp overall.**

Two corrections to what I reported one iteration ago, one of which is mine:

1. **The 25-question / 5.00 pp figure was a code-revision confound, not endpoint
   drift.** It came from comparing `34389565513` against `34492139716`. Those runs
   did *not* share a configuration: `34389565513` executed at **`1ce76aa`**, the
   entity-graph commit, which was reverted six commits later in `7780071`. I
   described that comparison as "byte-identical configuration" in the P4 verdict
   and in the plan for this iteration. It was not, and I did not check the SHA
   before drawing the conclusion. The four runs that are genuinely identical — all
   at `2c2c635` — spread 11 questions, not 25.
2. **The churn figure is larger than the net drift by a wide margin.** The
   pairwise flip count is stable at **23.2 ± 2 questions (4.9%)** across all six
   pairs, including pairs whose net overall deltas agree within one question. The
   net drift is a small residual of how ~23 questions of two-directional churn
   happen to balance. Both numbers matter, and only the second one was previously
   visible.

The conclusion that motivated this iteration stands, and is now quantified
properly: **a two-question floor measured within a single run does not bound
anything.** But the operative floor is ~23 questions of churn, not 25 of drift.

## Data — four config-identical runs at `2c2c635`

| # | run | commit | IE | MR | KU | TR | ABS | overall |
|---|---|---|---|---|---|---|---|---|
| 1 | `34492139716` | `2c2c635` | 133/150 | 103/121 | 57/72 | 86/127 | 26/30 | 405/500 |
| 2 | `34558715449` | `2c2c635` | 134/150 | 102/121 | 57/72 | 82/127 | 27/30 | 402/500 |
| 3 | `34558717704` | `2c2c635` | 134/150 | 101/121 | 56/72 | 85/127 | 27/30 | 403/500 |
| 4 | `34558719936` | `2c2c635` | 133/150 | 97/121 | 54/72 | 83/127 | 27/30 | 394/500 |

### Spread

| capability | series (correct) | range (q) | sd (q) | spread (pp) | mean acc |
|---|---|---|---|---|---|
| IE | [133, 134, 134, 133] | **1** | 0.50 | 0.67 | 89.00% |
| MR | [103, 102, 101, 97] | **6** | 2.28 | 4.96 | 83.26% |
| KU | [57, 57, 56, 54] | **3** | 1.22 | 4.17 | 77.78% |
| TR | [86, 82, 85, 83] | **4** | 1.58 | 3.15 | 66.14% |
| ABS | [26, 27, 27, 27] | **1** | 0.43 | 3.33 | 89.17% |
| **overall** | [405, 402, 403, 394] | **11** | 4.18 | **2.20** | 80.20% |

Overall mean 401.0, population sd 4.18, sample sd 4.83, coefficient of variation
1.20%.

### The churn, which the spread understates

Per-question flips between every pair, joined on `question_id` over the 470
questions that carry a per-question record:

| pair | overall Δ | changed | changed % |
|---|---|---|---|
| 1→2 | 3 | 22 | 4.68% |
| 1→3 | 2 | 25 | 5.32% |
| 1→4 | 11 | 24 | 5.11% |
| 2→3 | 1 | 23 | 4.89% |
| 2→4 | 8 | 24 | 5.11% |
| 3→4 | 9 | 21 | 4.47% |

**The flip count is flat (21–25) while the net delta ranges over 1–11.** The pair
whose overall figures agree within one question still churned 23 questions. This
is the single most important number in this report: net-delta comparisons are
measuring the residual of a much larger two-directional process, and a net of
near-zero is not evidence that nothing happened.

Across all four runs: **353 questions correct every time, 75 wrong every time, 42
(8.9%) flipped at least once.**

Per-capability flip rates, averaged over the six pairs:

| capability | questions | mean flips | flip rate |
|---|---|---|---|
| IE | 150 | 3.0 | 2.00% |
| MR | 121 | 9.2 | 7.58% |
| KU | 72 | 5.7 | 7.87% |
| TR | 127 | 5.3 | 4.20% |

MR and KU are the least reproducible capabilities, at roughly 4× IE's rate. This
matches their mechanism: both need the model to count or reconcile across
sessions, and neither is anchored by a single retrievable span.

### Is run 4 an outlier?

Run 4 (`34558719936`, 394) is lower than the other three (405/402/403) by 8, 9 and
11 questions, while those three agree within 3. Leave-one-out:

| dropped | remaining series | range | sd |
|---|---|---|---|
| run 1 | [402, 403, 394] | 11 | 4.93 |
| run 2 | [405, 403, 394] | 11 | 5.86 |
| run 3 | [405, 402, 394] | 11 | 5.69 |
| **run 4** | **[405, 402, 403]** | **3** | **1.53** |

Run 4 is the outlier and the only one whose removal collapses the spread. With
four observations this cannot be distinguished from a tail draw versus a genuine
low-side excursion, and **no claim here depends on it**: the churn figure is
computed over all six pairs and is stable, and the floor is taken from the full
four-run range, which is the conservative choice.

## A second anomaly: two identical arms, 97 vs 99

Unrelated to variance, and worth flagging because the paired-test design depends on
it. In run `34389565513`, the TR arms scored:

| arm | TR correct | configuration |
|---|---|---|
| `tr-llm-temporal` | 83/127 | deterministic off, abstention off |
| `tr-deterministic-temporal` | **97**/127 | deterministic **on**, abstention off |
| graph-recall baseline (`tr-no-graph-recall`) | **99**/127 | deterministic **on** (default), graph off, abstention off |
| graph-recall feature (`tr-graph-recall`) | 90/127 | deterministic on, graph **on**, abstention off |

The third and fourth rows are constructed in `runGraphRecallAblation`, the second
in `runTemporalEngineAblation`. I checked whether `tr-deterministic-temporal` and
the graph baseline are genuinely the same configuration, having initially assumed
they were not:

- `tr-deterministic-temporal` sets `enableDeterministicTemporal: true` explicitly
  and leaves `enableGraphRecall` unset.
- the graph baseline sets `enableGraphRecall: false` explicitly and leaves
  `enableDeterministicTemporal` unset.
- `enableDeterministicTemporal` is **on unless explicitly `false`**
  (`natural-language-memory.ts:277`: `this.options.enableDeterministicTemporal !== false`),
  and `enableGraphRecall` defaults to `false`.

So both resolve to deterministic-on, graph-off, abstention-off. They **are** the
same configuration, measured in the same run against the same 127 questions, and
they scored **97 and 99**.

I am stating the observation, not a mechanism: I have not found the cause. The
candidate space is the shared-cache discipline (each ablation builds its own
`new Map()`, so cross-arm cache warming differs), any residual per-call state in
the memory system, or non-determinism in the judge. Any of those would also
affect the main ablation, where the two arms are constructed the same way.

Why it matters even though it changes no verdict: the entire experimental design
rests on arms being *exactly paired*, which is what licenses McNemar's use of
discordant pairs. A 2-question disagreement between identical arms means the
pairing is not exact. Under the ~23-question churn floor measured above, a
2-question error is immaterial to every conclusion in this report — but it is not
immaterial to the design, and it should be diagnosed and either fixed or bounded
before any arm is promoted on a paired test again. It does not affect the
four-run variance result, which uses no pairing.

## The decision rule, restated

> **An arm is promotable only if it changes materially more questions than a
> config-identical reference pair does, measured on runs of the *same commit*, the
> same dataset, the same model and the same temperature — and reported as flips,
> not as a net delta.**

Concretely:

- **Check the SHA before calling anything config-identical.** The error corrected
  above was mine and would have been caught by one `gh run view --json headSha`.
- **Reference runs are mandatory**, on the commit being compared. A floor is a
  property of a configuration, not a constant.
- **Report flips first, net second.** 23 questions churned where the net said 1.
- **n=4 bounds a range, not an sd.** The range (11 overall, 4 for TR) is the
  figure to use; the sd is reported but nothing is gated on it.
- **`runs=1` cannot promote.** It can still reject — P3b's one-sided sign test was
  a real signal — but acceptance needs repetitions.
- **Every arm must be run against a reference measured in the same batch.** Given
  run 4's excursion, a floor inherited from an earlier batch is not safe.

## What this invalidates

| verdict | basis | status |
|---|---|---|
| P4 verdict's "25 questions / 5.0 pp drift" | `1ce76aa` vs `2c2c635` | **Withdrawn — code-revision confound.** Correct figure for identical runs is 11 q / 2.20 pp. |
| P3b entity-graph REJECT | 9 q, "4.5× floor" | Rejection stands (repeated, same-mechanism, net-negative). The "4.5×" is unsupported: 9 q is under half the 23-q churn. |
| P4 time-window annotation (INCONCLUSIVE) | 2 q, opposite signs | Unchanged, and now explained: 2 q is 9% of the churn floor, so the sign is a coin flip by construction. |
| P4 deterministic coverage (INCONCLUSIVE) | 2 q | Unchanged. |
| P2 / P3a TR recall arms (REJECT) | net-negative | Stand. |
| Guarantee guards (MR aggregation, TR engine) | 14 q / 11 pp | **Resolved — see `p5-requantification-verdict.md`.** The "14 q / 11 pp" was the *TR-engine* number, mislabelled as MR. Same-batch: MR **+42…+50 q** (floor 13, clears 3.2×); TR **+7…+11 q** (floor ~4, clears 1.8×); KU **+2 q** (floor 3, does **not** clear). |
| Any paired McNemar result | assumes exactly paired arms | **Provisional** pending the two-identical-arms anomaly above. |

## Next step

Two things, in this order, both prerequisites rather than features:

1. **Diagnose the two-identical-arms anomaly.** Two arms resolving to the same
   configuration scored 97 and 99 in the same run. The pairing premise underlies
   every McNemar result in the project. Reproduce it with a targeted run, find the
   mechanism, and either fix it or bound it. This is cheap and it gates everything
   else.
2. **Then re-quantify the guards** (MR aggregation, TR engine, KU bitemporal)
   against same-batch references, to confirm each survives the corrected floor.
   Done — see `p5-requantification-verdict.md`. MR and TR clear; KU does not.

Only after both is a sixth TR feature measurable.
