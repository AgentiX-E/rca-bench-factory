# P3b Entity-Graph Recall Verdict — REJECT (net-negative, same mechanism as P2/P3a)

**Iteration:** P3b zero-LLM entity-graph recall (`enableGraphRecall`, default off)
**Commit under test:** `1ce76aa` on `master` (parent `bae83d0` = P3a revert)
**Benchmark run:** `34389565513` (job `102594252979`, 55m47s, `success`)
**Design:** paired within-workflow ablation `runGraphRecallAblation` — `tr-no-graph-recall`
vs `tr-graph-recall`, both with abstention disabled, 127 TR questions, `temperature=0`.

## Verdict first

**REJECT P3b.** Entity-graph spreading-activation recall is a **net-negative**: it
drops TR accuracy from **77.95% → 70.87% (Δ = −7.09 pp)**, breaking **15** questions
while repairing only **6**. The sign of the effect is statistically significant
(exact binomial one-sided p = **0.039** on 21 discordant pairs; the two-sided
McNemar p = 0.078 is not significant, so only the *direction* is established — and
the direction is harmful). Both acceptance criteria fail: Δ is negative and no
one-sided-positive p ≤ 0.05 exists.

This is the **third consecutive rejection** of a TR recall-*expansion* arm (P2
date-range, P3a occurrence-date, P3b entity-graph), all with the same mechanism.
The line of work is now closed.

## Data

### Ablation result (127 TR questions, 1 deterministic run per arm)

| System | correct | accuracy |
|---|---|---|
| `tr-no-graph-recall` (baseline) | 99/127 | **77.95%** |
| `tr-graph-recall` (feature) | 90/127 | **70.87%** |

| statistic | value |
|---|---|
| Δ accuracy (feature − baseline) | **−7.09 pp** (9 questions) |
| Discordant pairs b✓f✗ / b✗f✓ | **15 / 6** |
| McNemar exact (two-sided) | **7.835e-2** — not significant |
| McNemar exact (one-sided, feature worse) | **3.918e-2** — significant |
| Baseline 95% Wilson CI | [69.98%, 84.28%] |
| Feature 95% Wilson CI | [62.44%, 78.06%] |
| Internal consistency | 99 − 15 + 6 = 90 ✓ (concordant correct 84, concordant wrong 22) |

### Empirical noise floor, measured inside the same run

`tr-deterministic-temporal` (deterministic engine on, graph off, abstention off) and
`tr-no-graph-recall` (graph off, abstention off, deterministic engine default on) are
**configurationally identical systems**. They scored 76.38% (97/127) and 77.95%
(99/127) respectively, i.e. **2 questions / 1.57 pp of same-config run-to-run drift**.

The observed P3b effect (9 questions, 7.09 pp) is therefore **≈4.5× the measured
noise floor**, which is why the verdict does not need a confirmation re-run — the
effect is far outside the drift band, unlike the P3a case where n=4 run-level noise
(±4) exceeded the −1.55 effect.

### Guards — not degraded

| guard | result |
|---|---|
| TR temporal-engine ablation | **+11.02 pp** (65.35% → 76.38%), 14 fixed / 0 broken, p = 1.221e-4 ✅ unchanged |
| Main ablation TR (feature system) | 78.74% (100/127) — unchanged, as expected: `enableGraphRecall` defaults to `false` and only the ablation passes `true` |
| MR / KU / IE | unchanged (no code path touches them) |
| Test suite | 604 tests, coverage 99.76 / 98.06 / 100 / 99.76, `entity-graph.ts` 100% on all four dimensions |

## Root cause

`retrieveTurns` merges graph hits **append-only and uncapped**
(`natural-language-memory.ts:537-556`): every turn whose *non-seed* entity receives
activation from a question seed is appended, and each appended hit then drags in its
own `contextRadius` window via `expandContextWindow`. The arm therefore does not
"add the one missing turn" — it floods an already-8–12 KB prompt with
entity-linked-but-irrelevant turns.

That is precisely the P2/P3a failure mode, reached by a different route:

| arm | widening mechanism | outcome |
|---|---|---|
| P2 date-range | append every turn inside the resolved date window | REJECT |
| P3a occurrence-date | append `topK+5` in-window occurrence turns | REJECT |
| P3b entity-graph | append every activation-reachable turn (uncapped) | REJECT |

Recall is **not** the bottleneck. On this run's diagnostics only **3 of 27** wrong TR
questions show a question-keyword coverage below 0.6 in the retrieved context
(crude proxy, but consistent with the earlier 6–10 estimate); the remaining ~24 are
reader-side — the evidence is in the prompt and the reader picks or computes the
wrong thing (`Museum of Modern Art` instead of `The Metropolitan Museum of Art`;
`5` instead of `7 days`; `4 years and 3 months` instead of `4 years and 9 months`).
The graph arm can only address the ≤10-question recall-miss bucket, and it paid
−15 to rescue +6 there.

## Where the real headroom is (evidence for the next iteration)

Splitting the 127 TR questions by `classifyTemporalQuestion` and cross-tabulating
against `computeTemporalAnswer`'s coverage (`natural-language-memory.ts:272`:
`supportsDeterministic = kind !== 'other' && kind !== 'eventLookup'`):

| TemporalKind | n | correct | accuracy | deterministic path? |
|---|---|---|---|---|
| `relative` | 25 | 23 | **92.0%** | yes |
| `interval` | 26 | 23 | **88.5%** | yes |
| `ordering` | 40 | 31 | **77.5%** | yes |
| `eventLookup` | 20 | 13 | **65.0%** | **no — LLM fallback** |
| `other` | 16 | 10 | **62.5%** | **no — LLM fallback** |

The two kinds the deterministic engine abstains on are also the two worst, and they
account for **13 of 27 TR errors (48%)** while covering only 28% of questions.
Closing even half of the ~21 pp gap to the deterministic kinds is worth
**≈+6 pp TR** — larger and far better founded than anything the recall line ever
promised (ceiling ≤ 10 questions, realised −9).

## Decision

| Step | Action |
|---|---|
| 1 | **REJECT** P3b — revert `1ce76aa` (delete `entity-graph.ts`, its tests, `enableGraphRecall`, `runGraphRecallAblation`, and the `bench/run.ts` wiring); negative result archived here, outside the repo |
| 2 | Fix the latent workflow bug: `benchmark-tr-graph-ablation-report.{md,json}` was generated but **never uploaded**, because `.github/workflows/benchmark.yml` enumerates report files by name. Replace the enumeration with `packages/cortex-eval/benchmark-*.{md,json}` so no future ablation can silently lose its report |
| 3 | **Close the TR recall-expansion line.** Three arms, three rejections, one mechanism |
| 4 | Next iteration (P4): extend deterministic coverage to `eventLookup` — `resolveTimeRange` already produces the concrete date window and already reaches the prompt, but the LLM still makes the final selection. Make the selection deterministic (extract candidate events with dates → filter to the window → return the surviving event) and measure with the same paired McNemar design |

Acceptance criteria for P4 (unchanged in spirit): paired exact test with one-sided
p ≤ 0.05 and positive Δ; TR temporal-engine guard (currently +11.02 pp) not
degraded; ≥95% coverage on all four dimensions.
