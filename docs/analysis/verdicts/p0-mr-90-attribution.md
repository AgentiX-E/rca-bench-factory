# P0 — Attribution of the 90.08 % MR reading

> **Superseded on the delta figure.** This document reports a delta of
> **+9 questions = +7.44 pp**. That number is wrong: it used a majority-vote
> panel classification and dropped two of the four flip-table cells. The correct
> figure is **+13.25 question-units = +10.95 pp**, and the grader confound this
> document left open is resolved. See
> [`p19-mr-90-verdict-and-tr-target.md`](./p19-mr-90-verdict-and-tr-target.md)
> §0 and §1. Everything below about the *mechanisms* still stands; the
> arithmetic does not.

Source: run [34791592602](https://github.com/AgentiX-E/cortex/actions/runs/34791592602), commit `812a01a`,
`limit=0`, `runs=1`, `temperature=0`. Compared against the 8-run reference panel at `analysis/ab_rrf`
(commits `624e241` and earlier, before `f35c4a4` / `c4ab77b` / `236ab1b`).

## 1. The number is real, and it is not noise

| Statistic | Value |
|---|---|
| Panel per-run MR correct (of 121) | 87, 99, 95, 96, 97, 98, 96, 98 |
| Panel mean | 95.75 (**79.13 %**) |
| Panel stdev | 3.77 (**3.12 pp**) |
| This run | 109 (**90.08 %**) |
| **z-score** | **+3.51** |

A z of 3.51 is p ≈ 0.0002 one-sided. **The 90.08 % is a genuine outlier, not a favourable draw**, and
the P18 hypothesis (2) is rejected. Something in the merged changes moved MR.

P18 quoted the panel *mean* against a single run's score and called the gap "within the observed
range". That framing was wrong: the mean is not a run, and the correct comparison is run-to-run
against the panel's stdev, which puts this run three and a half standard deviations out.

## 2. What moved, per question

20 of 121 questions changed side against the panel majority:

| Direction | Count | Meaning |
|---|---|---|
| Panel ≤3/8 → new correct | **11** | genuinely new capability |
| Panel 4/8 → new correct | 7 | flaky-side, expected drift |
| Panel 8/8 → new **wrong** | **2** | genuine regression |

Net: **+9 questions = +7.44 pp**, which is the honest decomposition of the +10.95 pp headline.

## 3. The regression is the same mechanism as part of the gain

Both losses are **aggregation** questions where the model now produces a *larger* total:

| Question | Ground truth | Panel (8/8) | This run |
|---|---|---|---|
| `6d550036` "How many projects have I led?" | `2` | `2` ✅ | **`3`** ❌ |
| `d851d5ba` "How much did I raise for charity in total?" | `$3,750` | `$3,750` ✅ | **`$8,750`** ❌ |

And two of the gains move the *same* direction:

| Question | Ground truth | Panel | This run |
|---|---|---|---|
| `129d1232` total raised across charity events | `$5,850` | `$5,250` ❌ | **`$5,850`** ✅ |
| `bf659f65` albums purchased | `3` | `2`/abstain ❌ | **`3`** ✅ |

**One mechanism, two signs.** The aggregation path is now summing more items:

| Question | Ground truth | Panel | This run | Signed error |
|---|---|---|---|---|
| `129d1232` | `$5,850` | `$5,250` (−`$600`) | `$5,850` ✅ | 0 |
| `bf659f65` | `3` | `2` (−1) / abstain | `3` ✅ | 0 |
| `6d550036` | `2` | `2` ✅ | `3` (+1) ❌ | +1 |
| `d851d5ba` | `$3,750` | `$3,750` ✅ | `$8,750` (+`$5,000`) ❌ | +`$5,000` |

The panel was **under**-summing on the first two and exactly right on the last two. The new
behaviour sums more, which repairs the first two and breaks the last two. It is a **redistribution
of errors, not a uniform improvement** — and `d851d5ba` shows the magnitude is unbounded: it
over-counted by `$5,000`, 8× the `$600` deficit it repaired on `129d1232`.

## 4. Two distinct gain mechanisms

| Mechanism | Questions | Evidence |
|---|---|---|
| **Abstention converted to an answer** | 3 — `51c32626`, `73d42213`, `8cf4d046` | Panel abstained 7/8, 8/8, 8/8 respectively |
| **Aggregation sum corrected** | 8 — incl. `129d1232`, `3fdac837`, `bf659f65` | Panel answered but wrong (0–3/8 correct) |

The first group is the `236ab1b` abstention-contract change working exactly as designed: three
questions that the old prompt caused the model to *decline* are now answered correctly. That is a
clean, attributable win with no matching loss anywhere in the run.

The second group is the over-count mechanism of §3, with one loss.

## 5. Attribution, with confidence levels

| Change | Attribution | Confidence |
|---|---|---|
| `236ab1b` abstention contract | The 3 abstain→answer conversions | **High** — signature matches exactly |
| `f35c4a4` dropped-evidence budget | Over-counting more items (more evidence reaches the reader) | **Medium** — mechanistically consistent, not isolated |
| `c4ab77b` vocabulary bridge | Recall widening feeding the same over-count | **Medium** — not separable from `f35c4a4` here |
| Model-side noise | The 7 flaky-side flips | **High** |

**The three changes were merged together and this run cannot separate them.** One run at R=1 is a
single draw; attributing +7.44 pp across three commits from it would be exactly the unfounded
precision this iteration exists to avoid.

## 6. What must happen before 90.08 % is used as a baseline

The 90.08 % is real but **not yet a stable baseline** — it is one draw from a distribution whose
new mean is unknown. The next measurement must be a **paired multi-run campaign on commit `812a01a`
or later**:

1. **R ≥ 8 runs**, `limit=0`, `ablation_runs=1`, `temperature=0`.
2. Report **mean ± stdev** of MR correct, not a single number.
3. Run the same 8-run panel on the pre-change commit (`236ab1b^`) to get a *paired* per-question
   comparison rather than a cross-commit aggregate one. The panel at `analysis/ab_rrf` is a
   historical baseline, not a controlled one.
4. Accept the new baseline only if the paired McNemar across the two 8-run panels is significant.

**Do not bank the +7.44 pp on this evidence.** Bank the *finding*: the abstention contract converts
declines into correct answers (§4), and that is the one piece with a clean signature.

## 7. The over-count mechanism is the new P0 defect

§3 shows a mechanism that can turn a correct answer into a wrong one by including one extra item.
It has no guard:

- `d851d5ba` is off by `+$5,000` — a gross over-inclusion, not a rounding artefact.
- `6d550036` is off by exactly `+1` item.
- Both went from 8/8 correct to wrong.

A system that is right 8 times out of 8 and then wrong is a **regression**, and it is the same
mechanism producing part of the headline gain. That makes the mechanism worth fixing on its own
merits — not because it costs net accuracy today (it is net +7.44 pp), but because an unbounded
aggregation is a liability that will keep trading correct answers for incorrect ones as the recall
widens.

## 8. Method note

Recomputes from `analysis/ab_retry/run_34791592602/mr_diagnostics.json` (121 records extracted from
the run log) against `analysis/ab_rrf/run_*/…/benchmark-mr-diagnostics.json`. The per-run correct
counts were 87–99, so the comparison uses the panel **stdev**, not the mean alone — quoting a mean
against a single observation was the error in P18 §7 that this document corrects.

`3fdac837` appears as a gain (`12` → `11 days`) but its ground truth is
`11 days (or 12 days, if April 15th to 22nd is considered as 8 days)` — a benchmark defect noted
since P12. It is counted as a gain here for consistency with the scorer, and it is the one entry in
this analysis that misrepresents no engine behaviour; the true change is answer-format, not accuracy.
