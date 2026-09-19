# P18 — the abstention retry has no measurable opportunity

Run: [34791592602](https://github.com/AgentiX-E/cortex/actions/runs/34791592602), commit `812a01a`,
`limit=0` (all 500), `runs=1`, `ablation_runs=1`, `temperature=0`. Conclusion: **success**, 1h32m.

## 1. Headline

The retry ablation reports **0 treatment fires** and **+0.00 pp**. Read naively that is "the feature
does nothing". The truth is narrower and more useful:

> In 121 MR questions the retry ablation found **zero** bare abstentions to act on. A second,
> independent evaluation of the same 121 questions in the same run found **one** — and on that one
> the retry fired, re-asked, and the re-ask abstained again.

Both numbers are correct and they measure different draws. This is not a wiring failure and not a
null result: it is a **population** finding, and it invalidates the premise the retry was designed
around.

## 2. The wiring is proven correct

| Check | Observed | Required | Verdict |
|---|---|---|---|
| Control arm disarmament | `controlFires = 0` | 0 | ✅ the flag reaches the code path |
| Treatment arm armed | both arms `enableAbstention: true`, default prompt | identical but for the flag | ✅ |
| Treatment actually fires when given an opportunity | fired on `8e91e7d9` in the main arm | > 0 | ✅ |
| Retry preserves the abstention when the re-ask also abstains | `8e91e7d9` stayed `null` | `null` | ✅ |

The `retryFires` diagnostic earned its place here. Without it, `+0.00 pp` would have been
indistinguishable from the cache-masked no-op defect it was built to catch. The report's own
`INERT ON THIS DATASET` warning fired as designed and was correct.

**Note where the fire count came from.** The ablation reports 0 because *its own* evaluation drew
zero bare abstentions. The main benchmark's arm drew one and fired. That the two evaluations of the
same 121 questions differ is the population finding in miniature — see §5.

## 2.1 What "0 fires" does and does not mean

`treatmentFires = 0` is **not** evidence the flag is dead, because the same run proves the retry fires
given an opportunity. It **is** evidence that the opportunity rate is low enough that two independent
evaluations of 121 questions can straddle zero.

## 3. Root cause: the 35 bare abstentions are not one population

The P17 analysis pooled 35 bare abstentions across 8 runs and treated them as recoverable. The
diagnostics say otherwise. Splitting by question id:

| Question | bare events (of 8 runs) | ever correct (of 8 runs) |
|---|---|---|
| `8e91e7d9` | bare in **8/8** | **0/8** |
| `10d9b85a` | bare in 5/8 | **0/8** |
| `bf659f65` | bare in 4/8 | **0/8** |
| `37f165cf` | bare in 3/8 | **0/8** |

These four **never once produced a correct answer in eight independent runs**. A retry is a
second draw from the same distribution; if eight draws never landed, a ninth is not the fix. They
are the ones that carry most of the bare events, which is exactly why the P17 pooled estimate
(+1.22 pp) was too high — it implicitly assumed a recurrence rate that does not exist for them.

## 4. What the one bare event actually was

Question `8e91e7d9` ("What is the total number of siblings I have?"), `top1Score = 0.577`:

```
llmRaw: 'UNANSWERABLE'          # 12 characters — the bare form
retrieved: 17,993 characters    # evidence WAS retrieved
expansionQueries: [
  "I don't have access to your past conversations or evidence sessions",
  "so I can't identify the specific activities. If you share the session descriptions or context",
  "I can help extract the relevant activity phrases."]
```

The expansion call returned a **refusal** — the model declining to generate search phrases — and those
three sentences were then carried in as if they were phrases. Retrieval ran on text unrelated to the
question and the model declined.

**This refusal is this-run-specific, not the recurring cause.** I tested it against the 8-run panel:

| Anchor | `8e91e7d9` expansion across the 8-run panel |
|---|---|
| First phrase | `"sibling count"` in **8 of 8** runs |
| Refusal signature | **0 of 8** runs |

A regex for refusal phrasing (`don't have access`, `can't`, `I can help`, `please share`, …) over all
**968** panel decisions returns **zero** hits. So the refusal is a transient sampling artefact of this
run, not a structural defect that eight prior runs shared.

**Retracted:** an earlier draft of this section claimed `parseQueryExpansion` "does not reject a
refusal" was the root cause of the four type-C questions, and that `10d9b85a` and `bf659f65` shared
the signature. The panel scan disproves the second half and leaves the first unproven — the code may
still be worth hardening, but it is not what is causing these failures and must not be scheduled as
if it were.

## 5. Why 0 and 1 fires, and why the ablation cannot see its own feature

The 8-run panel averaged **4.38 bare abstentions per run**, ranging **2–9**. Two evaluations in this
single run produced **0** (the ablation's arm) and **1** (the main benchmark's arm). Both are ordinary
draws from that distribution.

Two consequences follow, and the first is a design defect worth naming:

1. **The ablation is under-powered by construction at R=1.** With ~4 opportunities per evaluation and
   a per-opportunity recovery rate that P17 bounded low, the expected number of fires in a single
   paired run is a small single digit — and this run drew 0 in the very evaluation meant to measure it.
   The feature *was* exercised (the main arm fired), just not inside the experiment. A zero-fire
   ablation run is uninformative rather than negative, which is exactly why the report says so.
2. **The opportunity rate is a handful, not dozens.** At ~4 per 121 questions the retry's ceiling is
   ~3.3 pp of MR accuracy, reached only if *every* fired retry recovers a correct answer the control
   missed. Against an MR noise floor of ~10.7 pp, that ceiling is a third of the noise. **The retry is
   unmeasurable on this dataset at any run count short of many**, and §3 shows the recoverable subset
   is close to empty anyway.

## 6. The delta, stated honestly

**The +0.00 pp is not interpretable as an effect size.** Both arms scored 87.60 %, with **0
discordant pairs** — the two arms agreed on all 121 questions. That agreement is expected rather
than informative: the arms share all three caches, and the one bare question fired a retry whose
re-ask also abstained, so both arms landed on `null`.

Absence of discordance is *consistent with* the retry being harmless. It is not evidence of anything,
because 0 of 121 is exactly what a zero-opportunity feature produces.

## 7. The accuracy movement, separated into two different claims

Two numbers moved, and they must not be lumped together — one is ordinary, the other is not.

| Metric | 8-run panel | This run | Movement |
|---|---|---|---|
| Feature overall accuracy | 82.20–84.60 % (mean **83.28 %**) | **85.20 %** | **within normal range** |
| MR-scoped accuracy | 71.90–81.82 % (mean **79.13 %**) | **90.08 %** | **+8.3 pp above the panel max** |

Overall accuracy is unremarkable: 85.20 % sits just 0.6 pp above the panel's 84.60 % maximum, and
the panel spread there is only 2.4 pp. Nothing needs explaining.

**MR is the anomaly.** 90.08 % is 8.26 pp above the panel's best run and requires attribution before
it can be used as a baseline. Two candidate explanations:

1. **The uncommitted fixes now merged** (`f35c4a4` dropped-evidence budget, `c4ab77b` vocabulary
   bridge, `236ab1b` abstention contract). Plausible — MR is exactly where those three land.
2. **A favourable draw.** The panel spread is 9.92 pp on MR, so an 8.26 pp rise is within the
   observed range of a single draw.

**This run cannot separate them, and one run at R=1 cannot in principle.** The discriminating
measurement is MR accuracy on the *current* commit across several runs versus the panel's
79.13 % mean — an attribution question, not a debugging question.

> Note the asymmetry: if (1) is true the project has a real MR gain to bank. If (2) is true the
> "gain" evaporates on the next run. Treating the 90.08 % as settled would repeat the exact error
> that produced the historical "96 %" figure.

## 7.1 What the retry contributed to it

**Nothing that is visible in this run.** Both retry arms scored 87.60 % MR, below both the main
benchmark's 90.08 % and the 8-run panel's 79.13 % mean+range. The retry ablation's own baseline
(87.60 %) differs from the main benchmark's MR figure (90.08 %) because they are different
configurations — the ablation disables nothing but runs both arms with `enableAbstention: true` on
the default prompt over a 121-question MR-only set, whereas the main benchmark's feature arm carries
the full pipeline. The 2.48 pp gap between them is not attributable to the retry.

Total retry-attributable movement: **1 fire, 0 recoveries, 0 discordant pairs**.

## 8. What the retry is actually worth

Not "does the retry work" — that question is answered and the answer is "it fires, and there is
almost nothing to fire on". The real finding is that **the retry is aimed at the wrong stage**.

- It repairs the *answer* stage. The failures are at the *expansion* stage.
- A ninth draw helps only if the first eight failed transiently. For these four questions the first
  eight never landed once, which is a structural failure, not sampling noise.

## 9. Next actions, in priority order

| # | Action | Why | Priority |
|---|---|---|---|
| 1 | Attribute the 85.20 % / 90.08 % MR figure against the 71.90–81.82 % panel | A >8 pp jump attributed to nothing is not usable as a baseline | **P0** |
| 2 | Diagnose the four type-C questions on the *evidence*, not on expansion | §4 shows the expansion-refusal theory is disproven; `9f` has the evidence and still fails | **P0** |
| 3 | Decide the retry's fate on the evidence from #1–#2 | Its opportunity set is those four questions, 0/8 correct in all 8 runs | **P1** |
| 4 | Stop treating `+0.00 pp` as the retry's result | Its 1 fire produced no discordant pair, so the delta carries no information | **P1** |
| 5 | Keep `retryFires` in the report permanently | It is what made this diagnosis possible | P2 |

Explicitly **not** on this list: hardening `parseQueryExpansion` against refusals. It is a defensible
robustness change, but §4 shows it is not the cause here and scheduling it on this evidence would be
exactly the kind of unfounded precision this iteration was meant to eliminate.

## 10. What this run does not establish

- The true bare-abstention rate (one run, a 2–9 spread across the panel).
- The cause of the four type-C failures. `8e91e7d9` retrieved 9.5–18.0 k chars of evidence across
  runs, always abstained or answered wrong, and **never once scored correct in 8 runs** — so the
  evidence is present and the reader is not using it. `top1Score = 0.577` is well above the 0.5
  threshold, so this is not a retrieval miss.
- Whether the retry ever helps on a different dataset or a larger MR slice.
- That the 85.20 % figure is real rather than a favourable draw.

## 11. Method note

Numbers in §3 and §5 recompute from the checked-in 8-run panel at `analysis/ab_rrf`. The run's own
figures come from `run_34791592602/run.log`, parsed after stripping the `<job>\t<step>\t<timestamp>`
line prefix — the log is UTF-8 **with BOM**, so `utf-8-sig` is required or the JSON diagnostics fail
to parse at a byte offset that looks like corruption but is not.

The artifact itself could not be downloaded: GitHub redirects artifact downloads to
`productionresultssa1.blob.core.windows.net` and job logs to
`results-receiver.actions.githubusercontent.com`, and this sandbox resolves the former into the
`198.18.0.0/15` sinkhole range. Pinning `results-receiver` to `140.82.112.22` makes `gh run view
--log` work, which is how every number here was obtained — the benchmark prints its full Markdown
reports to stdout, so the log is a complete substitute for the artifact. **The artifact download path
remains broken in this environment and should not be relied on.**

## 12. All six ablations from this run, for the record

| Ablation | Baseline | Feature | Δ |
|---|---|---|---|
| MR aggregation prompt | 44.63 % | **85.95 %** | **+41.32 pp** |
| KU bitemporal | 64.00 % | **80.00 %** | **+16.00 pp** |
| TR temporal engine | 61.42 % | **69.29 %** | **+7.87 pp** |
| TR deterministic coverage | 70.08 % | **70.87 %** | **+0.79 pp** |
| TR time-window annotation | 71.65 % | 71.65 % | **+0.00 pp** |
| MR abstention retry | 87.60 % | 87.60 % | **+0.00 pp** |

Four of six show a positive delta. The MR aggregation result (+41.32 pp) is the largest single
effect measured in this project and is consistent with the panel's finding that the CoT
enumerate-then-count prompt is the dominant MR mechanism.

**Caveat, stated plainly:** these are single-run point estimates at `ablationRuns=1`. Every one of
them carries the same ~10.7 pp MR / ~2.4 pp overall noise exposure, so the +0.79 pp and +0.00 pp rows
are indistinguishable from zero and the +41.32 pp row is the only one whose magnitude swamps the
noise. The table is a smoke reading, not a measurement campaign.

**The two +0.00 pp rows are already explained and are not the same kind of zero:**

- *MR abstention retry* — zero opportunities in the ablation's own draw (§2.1, §5). Uninformative.
- *TR time-window annotation* — the ablation ran and found no difference. This is consistent with the
  standing finding that TR's bottleneck is discrimination rather than recall depth, and the arm was
  designed as a within-context experiment for exactly that reason. Also a single-run estimate.
