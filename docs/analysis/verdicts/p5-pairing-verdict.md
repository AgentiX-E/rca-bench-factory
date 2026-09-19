# P5 pairing verdict — why two identically-configured arms disagreed, and the fix

**Commit under test:** `1ce76aa` for the defect; `20592f2` for the fix.
**Evidence:** run `34389565513` (P3b). The 97/127 and 99/127 figures are recorded in
`p3b-graph-verdict.md` (lines 44–47), not read from an artifact — see
"Provenance" below, which is a limitation of this verdict.
**Follows:** `p5-verdict.md`, which flagged this as an open anomaly and made it
the first prerequisite before any further feature work.

## Verdict first

**The anomaly was real, its mechanism is LLM call non-reproducibility meeting
per-arm cache instances, and it is fixed.** Two arms of the TR-engine ablation
resolve to the *same* configuration and scored 97/127 and 99/127 in the same run.
They disagreed because each ablation allocated its own query-expansion cache, so
each arm issued 127 independent LLM calls, and the hosted endpoint does not return
the same text for the same prompt across calls even at `temperature=0`.

Fix: every ablation pair now shares one answer cache (`20592f2`). Sharing is safe
by construction — the cache is keyed by the fully rendered prompt, so arms whose
prompts differ cannot collide.

**This is the pair that produced the within-run floor used by every verdict up to
P3b.** The P3b verdict cites exactly these two arms — `tr-deterministic-temporal`
at 97/127 and `tr-no-graph-recall` at 99/127 — as "configurationally identical
systems" and calls the 2-question gap "same-config run-to-run drift", from which
it derives the **2 questions / 1.57 pp within-run noise floor**
(`p3b-graph-verdict.md` lines 44–47). That floor is the one `p5-verdict.md`
overturned. So the floor does not merely *resemble* a cache artifact — it is one.

## Provenance (limitation of this verdict)

The graph-recall ablation report is **not present** in the
`p3b-graph-34389565513` artifact: the artifact contains the main report, the MR
ablation, the TR-engine ablation and the KU-bitemporal ablation, but no
`benchmark-tr-graph-*` file. The graph arm was not yet wired into `bench/run.ts` at
`1ce76aa`, so it was never uploaded.

Consequently the 97 and 99 figures are taken from the P3b verdict's prose rather
than re-derived from an artifact, and the 97 is corroborated by
`benchmark-tr-ablation-report.json` (TR-engine `featureAggregate` = 97/127) while
the 99 is not independently verifiable here. What *is* independently verifiable,
and what carries the argument, is the cache-sharing control below — which needs no
graph arm to be meaningful.

The lesson is the one this iteration keeps relearning: an artifact glob that drops
a report silently makes a result unrecoverable. The workflow's upload step already
globs `benchmark-*.json` for exactly this reason; the gap is that the arm produced
no file at all.


**I also made two errors while establishing this, both corrected here:**

1. I claimed there was a "three arms, one configuration, three answers" defect
   (100 vs 99 vs 97 for TR). Wrong. The 100 came from the **main** report, whose
   feature system runs on the full 500-question sample; the 97/99 came from
   ablations that run on the 127 TR questions only. Different samples, and the
   main report is not a comparable measurement of the same quantity.
2. I claimed the main report's graph ablation showed an arithmetically impossible
   `30 repaired / 0 broken` with an unchanged total, and called it a scoring
   degeneracy. Wrong. That row is the **ABS** capability, and the contrast is
   intentional: the baseline arm has `enableAbstention: false` and therefore never
   returns `null`, while the feature arm abstains on all 30. `judgeScorer` grades
   an ABS question as `answer === null`, so `0 → 30` is the abstention contrast
   working exactly as designed, not a defect.

Both errors came from reading aggregate numbers without checking which sample and
which capability they were computed over — the same failure mode as the P4
code-revision confound. The check is cheap; I skipped it twice.

## The evidence chain

### 0. The control that carries the argument (independently verifiable)

Everything else below is supporting detail. This is the load-bearing evidence, and
it needs no graph arm and no external figure:

| arm pair, same run `34389565513` | caches | discordant |
|---|---|---|
| main report: `nl-naive-baseline` vs `nl-abstain-feature` | **shared** expansion + answer cache | **0 / 0** on IE, MR, KU, TR (470 q) |
| `tr-deterministic-temporal` vs `tr-no-graph-recall` | **separate**, identical config | **2 / 127** |

Both rows come from files in the artifact. Arms that share a cache agree on
**every one of 470 questions**. Arms with no configuration difference but separate
caches disagree. The only variable is whether the model was asked the same
question twice — which is a property of the harness, not of any model or arm.

### 0b. The defect was still live in the current code, not only at `1ce76aa`

Checking the pairing invariant across the four `2c2c635` runs — the ones that
predate the fix — the main report's two arms violate it in **three of four runs**:

| run | violations (non-ABS discordant pairs) |
|---|---|
| `34492139716` | none |
| `34558715449` | TR 0 broken / 1 repaired |
| `34558717704` | KU 0/1, TR 0/1 |
| `34558719936` | TR 1/1 |

The main report's arms already shared both caches at `2c2c635`, so this is a
different and more interesting failure than the `1ce76aa` one: sharing the cache
is necessary but was **not sufficient**. A probe of the call sequence shows why —
with only the answer cache shared and no query-expansion cache, one question
produces **three** LLM calls:

```
CALL0 = expansion prompt   (not cached)
CALL1 = QA prompt          (cached)
CALL2 = expansion prompt   (identical to CALL0, not cached)
```

so the arms still re-query the expansion prompt. With the query-expansion cache
shared as well the count drops to two calls, one per distinct prompt. The
`answerCache` fix in `20592f2` covers the ablation arms, which had **no** cache
sharing at all; the four `2c2c635` runs predate it and are unaffected by it.

This is why the fix's end-to-end validation is run `34582260187` — the first run at
`20592f2` — and why the invariant check is now part of the analyzer rather than a
one-off: violations were present in the majority of runs and had gone unnoticed.

### 1. The two arms are configurationally identical

| arm | `enableDeterministicTemporal` | `enableGraphRecall` |
|---|---|---|
| `tr-deterministic-temporal` | `true` (explicit) | unset → `false` |
| `tr-no-graph-recall` | unset → **on** | `false` (explicit) |

`enableDeterministicTemporal` is on unless explicitly `false`
(`natural-language-memory.ts:277`: `this.options.enableDeterministicTemporal !== false`),
and `enableGraphRecall` defaults to `false`. Both resolve identically.

I checked this rather than assuming it, and only after first assuming the opposite;
the default-on semantics of `enableDeterministicTemporal` are what make the two arms
collapse to one configuration, and nothing in the arm names or the call sites says
so.

### 2. They did not share a cache

In `1ce76aa`, `runTemporalEngineAblation` and `runGraphRecallAblation` each built
their own `new Map<string, string[]>()`. The cache key is
`` `${promptBuilder.name}:${question}` `` — both TR arms use
`buildTemporalQueryExpansionPrompt`, so keys would have collided *within* a cache,
but each arm started cold. Neither warmed the other.

### 3. Why the judge is not the cause

`createLlmJudge` uses a module-level `judgeCache` keyed by the full judge prompt,
which embeds question, predicted and expected. The same triple always returns the
same verdict within a process, so grading is reproducible and cannot produce this
disagreement. Checked, not assumed.

## The fix

`answerCache` is now declared once per ablation and passed to both arms, in all
five ablations plus the main benchmark (12 wiring sites, 6 pairs).

Safe by construction rather than by convention: `respondWith` looks up
`` cache?.get(prompt) `` on the **fully rendered prompt** (`natural-language-memory.ts:765-766`),
so:

- arms with different prompts produce different keys and cannot collide — the
  treatment is never masked;
- arms with byte-identical prompts are answered once, which is what removes the
  non-reproducibility term.

## Tests

Six tests in `report-runner.test.ts`, driven by an LLM that deliberately answers a
repeated prompt **differently every time**. A deterministic stub would make the
entire defect invisible, so the test model must not be deterministic — that is the
central design decision here.

**Mutation-verified.** Removing the cache wiring fails exactly:

| ablation | arms share a prompt? | fails without the fix |
|---|---|---|
| TR engine | yes → fail | ✅ |
| TR window | yes → fail | ✅ |
| TR coverage | yes → fail | ✅ |
| KU bitemporal | yes → fail | ✅ |
| MR aggregation | **no** | ❌ passes |

The MR ablation's arms differ in `aggregationPrompt`, so every prompt is distinct
and no cache entry is shared. Its test therefore asserts the weaker property it can
actually establish — that both prompt templates are exercised, so the contrast is
real — instead of the cache-hit claim I first wrote, which was false. Sharing the
cache still benefits MR on any prompt both arms happen to issue; it just is not a
correctness guarantee there, and the test says so.

## Scope and impact

**Measurement integrity, not accuracy.** No arm's configuration changes, so every
graded number in every prior artifact is unchanged. What changes is that a
within-run arm comparison no longer silently includes an LLM-non-reproducibility
term for the four ablations whose arms share prompts.

The 2-question error was inside the ~23-question churn floor measured in
`p5-verdict.md` and changed no verdict. It mattered because the McNemar design
assumes *exactly* paired arms, and this was the first case where that assumption
was demonstrably violated — with a fix available that costs nothing and saves LLM
spend.

## What remains open

> **Corrected after re-quantification.** Both bullets below carried figures I had
> not verified against artifacts. The TR figure (83 → 97, 14 q) is a historical
> TR-focused run, not a same-batch one — same-batch runs give 7–11 q. The MR
> figure (14 q / 11 pp) was a mislabel: that number is the *TR-engine* delta, and
> no MR report in this repository has a delta of 14. MR is +42 to +50 q. See
> `p5-requantification-verdict.md` and `p5-mr-guard-verdict.md` §6.

- **The `tr-llm-temporal` baseline is 83/127 while the deterministic arm is
  97/127** in the historical TR-focused runs (14 repaired, 0 broken). That is a
  real effect, and per `p5-verdict.md` it had to be re-quantified against a
  same-batch config-identical reference before being relied on. Done: the
  same-batch delta is **+7 to +11 q (mean 9.25)** against a TR floor of ~4, so
  the guard is real but ~50% smaller than the historical figure claimed.
- **Re-quantify the MR aggregation guard** next, now that its arms share a cache
  and the comparison is clean. Done: **+42 to +50 q of 121**, clearing an MR
  floor of 13 q by 3.2×. It is the strongest measured effect in the project.
  (The "14 q / 11 pp" previously written here was the TR-engine number.)
