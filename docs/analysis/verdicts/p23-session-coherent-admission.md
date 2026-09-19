# P23 verdict — session-coherent admission

**Status: mechanism confirmed, accuracy improvement not significant.**
Baseline run `34915402976`, treatment run `35004814319` (both full 500-question
LongMemEval-S, `deepseek-chat`, temperature 0, thinking disabled, `ablation_runs=1`).
Both runs measured with the same script, same shingles, same dataset.

The change under test is `4955d8e`: admit a retrieved hit's own session before
spending budget on `radius` neighbours of unrelated hits.

---

## 1. The prediction, and its verdict

P22 §6 stated the falsifiable prediction in advance:

> if session-coherent admission is the right fix, the admitted-fraction gap
> (§5) should **close** and accuracy should rise with it.

Taking the two halves separately, because they came out differently:

| claim | verdict | evidence |
|---|---|---|
| admission moves, one-directionally | **confirmed** | 192 up / 7 down / 301 flat, sign test **p = 5.7e-48** |
| the §5 gap closes | **confirmed, partially** | 15.9 pp → 14.1 pp (14.2 pp within a fixed partition) |
| accuracy rises | **directionally yes, not significant** | +4 questions = +0.80 pp, McNemar **p = 0.6177** |

The mechanism claim is not a marginal call: 192 of 500 questions changed admission
in the predicted direction against 7 against, with a binomial p-value at 1e-48.
The treatment is doing exactly what it was designed to do.

---

## 2. Admission moved, and moved where it was supposed to

| group | n | before | after | delta |
|---|---|---|---|---|
| all | 500 | 52.6% | **58.6%** | +6.1 pp |
| correct (before) | 419 | 55.2% | 60.9% | +5.8 pp |
| fail (before) | 81 | 39.3% | **46.7%** | **+7.4 pp** |
| answering turn absent (before) | 241 | 50.7% | 58.5% | +7.8 pp |

The largest movement is on the failures and on the population the change was
aimed at — the questions whose answering turn was not reaching the prompt at all.
That is the signature of a fix that lands on its target rather than raising the
average indiscriminately.

Inside fixed session-size bands (the P22 confound control), the gap narrows
without closing:

| band | before CORRECT | after CORRECT | before FAIL | after FAIL |
|---|---|---|---|---|
| 10–30 turns | 52.4% | 59.0% | 40.0% | 48.3% |
| 30–60 turns | 46.4% | 49.8% | 33.9% | 38.8% |

Both failure cells gained more than both correctness cells. The gap did not close
because the fix lifts both sides; it is a rising tide on admission, not a
targeted repair of the failures.

---

## 3. Accuracy: directionally positive, statistically indistinguishable from noise

| | before | after | delta |
|---|---|---|---|
| overall | 419/500 = 83.80% | 423/500 = 84.60% | +4 q = +0.80 pp |
| McNemar | — | — | discordant 20 gained / 16 lost, **p = 0.6177** |

Per capability, none significant, and the signs disagree:

| cap | n | before | after | delta | gained | lost | McNemar p |
|---|---|---|---|---|---|---|---|
| IE | 150 | 96.00% | 96.67% | +0.67 | 2 | 1 | 1.0000 |
| MR | 121 | 85.95% | 87.60% | +1.65 | 4 | 2 | 0.6875 |
| KU | 72 | 80.56% | 79.17% | −1.39 | 3 | 4 | 1.0000 |
| TR | 127 | 68.50% | 71.65% | +3.15 | 9 | 5 | 0.4240 |
| ABS | 30 | 86.67% | 80.00% | −6.67 | 2 | 4 | 0.6875 |

None of the five cells reaches 0.05, so there is no multiplicity problem to
correct for. Note that ABS moved **down** by 2 questions, which §3a resolves
below.

---

## 3a. Correction: the ABS loss is a turn-count effect, not evidence dilution

**The §3 account of ABS was wrong and is retracted.** §3 originally said the four
losing flips "had their evidence session entirely admitted (16/24→24/24,
13/24→24/24, 15/22→22/22, 19/24→24/24)", so the answers changed "because the
prompt changed, not because the evidence was missing".

That statement is not derivable from the artifacts, and I should have checked
before writing it. **The ABS rows carry no evidence field at all**: on
`Single-session_diagnostics.json` they have only `question_id`, `capability`,
`question`, `question_date`, `ground_truth`, `correct`, `decision`. No
`answer_sessions_content`, no `answer_session_ids`, no `haystack_dates` — those
exist only on the MR rows. `answer_sessions_content` was `undefined` for all 30
ABS rows, so a "16/24 → 24/24" coverage figure could not have been computed from
either run. Reproduce the emptiness with:

```
node analysis/scripts/p23_abs_shape.mjs analysis/ab_admission/run_35004814319_fix
```

What the artifacts do support, and what the loss actually is:

**The retrieval ranking never moved.** All 6 flips have a `top1Score` delta of
exactly `0.00e+0`:

| question | before | after | top1 delta |
|---|---|---|---|
| `031748ae_abs` | answer | abstain | 0 |
| `0ddfec37_abs` | abstain | answer | 0 |
| `2698e78f_abs` | abstain | answer | 0 |
| `e5ba910e_abs` | abstain | answer | 0 |
| `f685340e_abs` | answer | abstain | 0 |
| `gpt4_fe651585_abs` | abstain | answer | 0 |

So the flips are a pure prompt-body effect. The threshold gate is also not
involved: the run's `ABSTAIN_THRESHOLD` is `0.5` and the ABS `top1Score` range is
0.5305–0.7701, so the gate never fires and the LLM decides all 30.

**The controlling variable is the admitted turn count.** Session completion added
turns to all 30 questions (985 → 1,277 total, mean +9.7), and the abstention rate
is sharply banded:

| turns admitted (after) | n | abstain rate | accuracy |
|---|---|---|---|
| 0–30 | 2 | 100.0% | 100.0% |
| 30–45 | 4 | 100.0% | 100.0% |
| 45–60 | 24 | **75.0%** | 75.0% |

Every question under 45 turns abstains; the entire loss sits in the 45–60 band,
which is exactly where `DEFAULT_ADMISSION_BUDGET` (45) stops bounding anything.
The abstention flag equals correctness on **30/30**, so the block is mechanical.

Two readings I checked and rejected: a prompt-*character* threshold (13 of 30
questions crossed 40,000 chars, a band the previous run never entered, and its
abstention rate was 61.5% — real but derivative of the turn count), and "adding
neighbours is what dilutes" (replaying the real dataset with `hits` at
`contextRadius = 1` but no ceiling gives 15/30 in the ≥40k band, *worse* than
session mode — so the fix is the ceiling, not the primitive).

**23 of 30 questions name a distinctive word absent from the prompt** (e.g.
`2698e78f_abs`: "johnson"; `60bf93ed_abs`: "ipad") while a near-relative is
present. That is the near-miss structure the abstention prompt has to reason
about, and it is what makes the block sensitive to added material.

Reproduce: `node analysis/scripts/p23_abs_dilution.mjs <after> <before>`,
`p23_abs_volume.mjs`, `p23_abs_regime.mjs`, `ABSTAIN_THRESHOLD=0.5
p23_abs_mechanism.mjs`, and the no-API replay `p23_abs_replay.mjs`.

---

## 4. The guard: no loss on already-working questions

P22 §6 named the eviction risk — session completion evicting the turn the ranking
liked — as the one way this change can be actively harmful. Measured on the 259
questions that already admitted their answering turn:

**228 → 230 correct (+2), 8 gained / 6 lost.** The guard holds: on the population
that was already working, the change is a wash rather than a regression.

---

## 5. Why the accuracy signal is this weak despite a large mechanism effect

The coverage→accuracy curve explains it, and it got *worse*, which is the
important part:

| coverage of answer session | before run | after run |
|---|---|---|
| 0% | 3 q, 33.3% | 5 q, 60.0% |
| 1–49% | 90 q, 65.6% | 23 q, **30.4%** |
| 50–99% | 350 q, 86.6% | 370 q, 85.7% |
| 100% | 57 q, **98.2%** | 102 q, **94.1%** |

The fix moved 45 questions into full coverage (57 → 102) and away from the
partial band (90 → 23). But the *conditional* accuracy of full coverage fell from
98.2% to 94.1% — the newly-completed sessions are answered correctly 85% of the
time, not 98%, so each question that moves up contributes about +25 pp instead of
the +33 pp the old curve implied.

**This falsifies the linear reading of the P22 coverage correlation.** The
correlation is real but it is not a causal lever that converts to accuracy at a
fixed rate: the questions that reach full coverage *because of a fix* are
systematically harder than the ones that already had it. "Full coverage → 98%"
was a statement about an advantaged subpopulation, not a promise about what
coverage buys.

A second, independent ceiling is now visible: **6 questions have 100% of the
answer session in the prompt and are still wrong**, at a mean prompt of 38,246
characters against 22,256 for the single such question in the previous run.
Admission is no longer their binding constraint; prompt volume is.

---

## 6. What else this run establishes

| ablation | Δ | p | reading |
|---|---|---|---|
| MR aggregation (CoT vs legacy) | +47.11% | 1.6e-15 | unchanged, still the largest single lever |
| TR deterministic temporal engine | +9.45% | 4.2e-3 | unchanged |
| Abstention (the main feature) | +4.80% | 1.2e-7 | the feature arm vs never-abstaining baseline |
| MR abstention retry | +0.00% | 1.0 | **0 fires in both arms** — still inert |

The retry ablation reproducing `0 control / 0 treatment` fires independently
confirms the P21 outcome verdict on a second full run: the retry is inert on this
dataset, and the instrumentation is honest about it rather than reporting a
misleading `0.00 pp`.

---

## 7. Decision

**Keep the change.** It is a genuine mechanism improvement (+6.1 pp admission,
p = 5.7e-48), carries no measurable accuracy cost on the guarded population
(228→230), and the null on the headline is a null on *this* dataset's question
mix rather than evidence against the mechanism.

**Do not claim an accuracy win.** +0.80 pp at p = 0.62 is not a result. The commit
that ships it must not say otherwise, and any later report that cites this run
must cite the admission delta and the accuracy null together.

---

## 8. What is actually left, in priority order

0. **ABS dilution — DONE, but not the way §8 originally proposed it.** The
   original item said to "keep neighbour admission for ABS", which §3a shows
   would not have worked: hits-plus-neighbours at `contextRadius = 1` puts 15/30
   questions in the ≥40k band, worse than session mode. The operative lever is
   the turn ceiling. Shipped in `c984a0a`: `expandContextWindowBounded` plus
   `admissionMode: 'hits'` with `abstentionAdmissionBudget = 30`, and an explicit
   identity requirement in `buildConservativeQaPrompt`. Replaying the real
   dataset confirms the mean prompt falls 37,067 → 24,570 chars and the ≥40k
   count falls 13/30 → 0/30, while staying above the pre-`4955d8e` volume
   (28,992) this path was calibrated in. **Not yet measured on a full run** — the
   next benchmark must confirm the ABS block recovers, and the prediction is
   falsifiable: ABS should return to ≥86.67%, and if instead it is unchanged the
   turn-count account in §3a is wrong.
1. **The 50–99% band, now 370 questions.** This is 74% of the dataset and its
   accuracy is flat at 85.7%. Moving questions out of it is no longer obviously
   the right objective (§5); what is needed is a measurement of *which turns* in
   a partially-admitted session matter, not how many. Note that §3a makes this
   sharper: for abstention the answer was "fewer", but that is a capability with
   an absence contract, and generalising it would be exactly the mistake §5
   warns against.
2. **The 6 full-coverage-but-wrong questions.** Prompt volume, not admission.
   A distinct investigation.
3. **TR at 71.65%**, the weakest real capability, with 9 gained / 5 lost on this
   change — it is still the largest single capability headroom.

---

## 9. Reproduce

```
node analysis/scripts/p23_admission_outcome.mjs <afterDir> <beforeDir>
node analysis/scripts/p23_significance.mjs     <afterDir> <beforeDir>
RUN_DIR=<dir> node analysis/scripts/p21_turn_coverage.mjs
node analysis/scripts/p23_abs_regime.mjs       <afterDir> <beforeDir>
node analysis/scripts/p23_abs_replay.mjs                 # no API, needs dist
```

`<dir>` must contain `MR_diagnostics.json` and `Single-session_diagnostics.json`.
The artifact names differ between the checked-in run layout and the CI artifact
(`benchmark-mr-diagnostics.json`), so symlink them as
`analysis/ab_admission/run_35004814319_fix/` does. The first two and `p23_abs_*`
make no API calls; `p23_abs_replay.mjs` needs `pnpm --filter cortex-eval build`
first because it imports the compiled package.
