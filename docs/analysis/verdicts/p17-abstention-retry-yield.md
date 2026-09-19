# P17 — The abstention retry: what it is actually worth, and how to certify it

**Question.** The previous iteration shipped a bare-abstention retry (commit `236ab1b`).
This one answers: how much MR accuracy does it buy, and what experiment would prove it?

**Answer.** About **+1.2 pp** (90% interval `[0.83, 1.65] pp`). A single paired
run **cannot** certify it — power is 0.4%. **8 paired runs** reach ~98 % power (97.7 % measured). The fix is
structurally lossless, so it is safe to ship and measure; it is not safe to *declare* on
one run.

---

## 1. Why the earlier "+1.86 pp" number was wrong

The previous iteration reported an upper bound of +1.86 pp, derived by counting runs in
which a bare abstention coexisted with a correct answer for the same question. That
calculation had no model of *why* the two co-occur. It answered "in how many runs is
recovery conceivable", not "in how many runs will the retry actually recover".

Two distinct errors:

- It had no notion of a **reroll**. The retry draws ONE more sample from the same prompt.
  That sample can land bare again. A bound that ignores this is not a bound on the retry.
- It was computed on the **same draws** it was meant to predict from. Fitting and scoring
  on one sample set is how you manufacture an optimistic estimate.

## 2. The panel, and its audit trail

8 runs, `ab_rrf/run_34024{727400,729633,732117,734868,737250,740818,743185,745627}`.
Each carries `benchmark-mr-diagnostics.json` with 121 MR instances.

Verified before any inference:

| Property | Value |
|---|---|
| Runs | 8 |
| Questions per run | 121 (all runs) |
| Question-id sets identical across runs | **yes** |
| Decisions | 968 |
| Per-run MR accuracy | 71.90 – 81.82 %, mean **79.13 %**, spread **9.92 pp** |
| stable-correct / stable-wrong / flaky | **78 / 13 / 30** |

The 78/13/30 split reproduces the earlier P14 analysis exactly, which is a useful
cross-check that the panel is the same one.

## 3. The flips are model-side, not input-side

For every (question, run) the diagnostics store the exact `retrieved` context. Hashing
`question + "\0" + retrieved` gives a prompt fingerprint, so a flip between an abstention
and a correct answer can be classified as *same input, different output* or *different
input*.

**8 of the 14** bare-abstention questions flip on a **byte-identical prompt**. Example:
`d3ab962e`, fingerprint `a10d18c64f77`, 8 observations: **1 bare, 7 correct**.

This is the load-bearing fact. Because the prompt is identical, the difference is
sampling. Because the difference is sampling, a reroll carries information — which is the
entire premise of the retry, measured rather than assumed.

The other 5 (`5a7937c8`, `10d9b85a`, `bf659f65`, `ba358f49`, `37f165cf`, `8e91e7d9`)
vary by fingerprint, so their flips are partly input-driven and are not clean evidence.

## 4. Six estimators, and which ones are valid

The retry's expected gain is `E = Σ_g bare_g · θ_g · p(correct | answered, g)`, where `g`
ranges over prompt groups that ever produced a bare abstention. The dispute is entirely
about `θ_g`: the probability a reroll *answers* instead of abstaining again.

| # | Estimator | Gain | Valid? |
|---|---|---|---|
| M0 | naive pooled (fit == eval draws) | 7.71 pp | **no** — same draws fit and scored |
| M1 | per-group MLE `ans/(ans+bare)` | 4.37 pp | **no** — in-sample; θ=0 silently for all-bare groups |
| M2 | per-group Laplace `(ans+1)/(n+2)` | 4.26 pp | softened, still in-sample |
| CV-a | leave-one-run-out, **observed** | 1.03 pp | **yes**, but conservative |
| CV-b | leave-one-run-out, **predicted** | 2.11 pp | **yes** |
| SIM | mechanism sim, 4 fit + 4 held-out runs | **1.22 pp** | **yes** — the point estimate |

### 4.1 Why CV-a is a lower bound

CV scores a held-out bare event as recoverable only if the *training* runs show a correct
draw for that group. A group that is bare in both the held-out and the training runs is
scored 0 — even though a reroll might well fix it. **16 of the 35** bare events sit in
exactly that position. CV-a cannot see them, so it undershoots.

### 4.2 Why the simulation is the point estimate

SIM fits the outcome distribution (bare / correct / wrong) per group on 4 runs, then
resamples each held-out bare event from that distribution — which is what one reroll
actually does. It handles the all-bare groups honestly: their fitted distribution is
`bare: 1.0`, so they yield 0, and that is a *statement about the evidence* rather than an
assumption.

```
per held-out run: 1.48 recovered  (90% PI [1, 2])
                = 1.22 pp MR accuracy (90% PI [0.83, 1.65] pp)
```

(Reproduce with `node analysis/scripts/p17_reproduce.mjs analysis`; the RNG is seeded so
the point estimate is stable at 1.48.)

`|A| = 10, |B| = 0, |C| = 4` — ten questions are certifiable (bare in some runs, correct
in others), zero are never-lost, and four are impossible (correct in no run). The four
impossible ones carry **17 of the 35** bare events, which is why the naive estimate was
roughly double the honest one.

## 5. The result that changes the plan: symmetric noise destroys power

I first simulated power with `p_loss = 0` and got 98% at 8 runs. That was an assumption,
not a measurement, and it is worth being explicit about the failure mode it hides.

The model is `b ~ Bin(R·n, p_gain)`, `c ~ Bin(R·n, p_loss)` with `p_gain = 1.22 pp`,
then exact McNemar on `b | b+c`.
McNemar is powered by the **asymmetry** `b − c`. If `p_gain = p_loss`, `E[b−c] = 0` and:

| R runs | p_gain = 1.22%, p_loss = 0 | p_gain = p_loss = 1.22% |
|---|---|---|
| 1 | 0.4 % | 0.2 % |
| 3 | 28.5 % | 2.0 % |
| 5 | 74.7 % | 2.6 % |
| **8** | **97.7 %** | 3.0 % |
| 10 | 99.7 % | 3.0 % |
| 20 | 100.0 % | 3.7 % |
| 30 | 100.0 % | 3.7 % |

The symmetric column **plateaus at ~α**. No number of runs helps, because more runs buy
precision on a quantity whose expectation is zero. This is the trap: a flaky model
measured against itself produces a fix that cannot be certified, however clean it looks.

### 5.1 Why the engine is nevertheless in the gain-only regime

The symmetric row would apply if the retry could **lose** a question the control got
right. It cannot, structurally:

- the retry fires **only** when the first pass is a bare abstention;
- the retry is accepted **only** if it parses to a non-abstention answer;
- a normal first-pass answer is **never** re-asked.

So `p_loss = 0` by construction, not by assumption, and the gain-only column governs.
This is worth stating as a design property: **the retry is one-directional, which is what
makes it measurable.** A retry that re-asked unconditionally would be a variance
redistribution with no certifiable mean effect.

## 6. The certification protocol

| Protocol | Runs | Power | Verdict |
|---|---|---|---|
| Single paired run | 1 | 0.4 % | worthless — do not report a p-value |
| 3 paired runs | 3 | 28.5 % | underpowered |
| **8 paired runs** | **8** | **97.7 %** | **recommended** |
| 10 paired runs | 10 | 99.7 % | comfortable |

Two arms, MR subset, differing **only** by `enableAbstentionRetry`. Two hard constraints:

1. **Separate answer caches.** `runner.ts` shares one `answerCache` between the baseline
   and feature systems and notes that ≈447/500 calls are reused. If the arms share it,
   the treatment arm reuses the control's cached bare abstention, the retry never fires,
   and the experiment reports a clean, entirely false 0.00 pp.
2. **Both arms kept.** The comparison is paired per question; an aggregate-vs-aggregate
   diff would be swamped by the 9.92 pp between-run spread.

Because the retry fires on roughly 4 of 121 MR questions per run, the *fire count itself*
is a more informative diagnostic than the accuracy delta at small R: an arm that shows
zero retry fires is broken, not neutral.

## 7. What this does not settle

- Whether a **second** retry is worth it. Diminishing returns are likely — the all-bare
  groups show at least four questions where the model declines repeatedly — but this
  panel cannot distinguish "declines twice" from "declines once, unluckily".- The four type-C questions (`8e91e7d9`, `10d9b85a`, `37f165cf`, `bf659f65`, 17 bare
  events). They are correct in **no** run, so they are not retry targets at all; they are
  recall or derivation failures. They belong to the residual-recall workstream, not here.
- Whether the effect holds on TrainTicket / SockShop. This panel is OnlineBoutique-flavoured
  LongMemEval only.

## 8. Method note

Every number above is reproducible from `ab_rrf/*/longmemeval-s-report/benchmark-mr-diagnostics.json`
with no API calls. The estimator that was wrong (M0, 7.71 pp) was wrong because it used
one sample set for both fitting and scoring; it is retained in the table deliberately, as
the upper bound that the valid estimators must fall below — and they do.
