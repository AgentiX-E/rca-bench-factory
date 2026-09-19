# P5 — the MR aggregation guard, re-quantified

**Verdict:** the MR aggregation guard (`mr-cot-aggregation` vs `mr-legacy-aggregation`)
is **real and large**, and it is the one guard in this project that survives every
correction applied to the noise floor. Its delta is **+42 to +50 questions of 121
(+34.7 to +41.3 pp, mean +45.8 q / +37.8 pp)**, against an MR-scoped between-run
floor of **13 questions**. It clears its floor by a factor of **3.2×** at the
smallest observed delta.

The "14 q / 11 pp" figure that `p5-verdict.md` and `p5-pairing-verdict.md` attach
to MR is **not an MR number at all**. Tracing it through the artifacts, it is the
**TR-engine** guard (`tr-llm-temporal` → `tr-deterministic-temporal`, 83 → 97 of
127, 14/127 = 11.0 pp), which appears with exactly that delta in eight separate
TR-focused runs. I carried the label across from those verdicts without verifying
it; both are wrong and §6 records the correction.

The MR guard is a far larger effect than 14 questions. Quoted correctly it is
**+42 to +50 q of 121 (+34.7 to +41.3 pp)**.

---

## 1. The MR-scoped floor, measured rather than inherited

The overall floor (11 q / 2.20 pp) is measured on the 500-question graded sample.
An MR guard is scored on 121 questions, so the overall floor does not govern it.
I measured the MR-scoped floor directly, from the same four config-identical runs
at `2c2c635` that the overall floor came from, using the `featureCorrect` vectors
the MR ablation report already carries.

`featureCorrect` is emitted in `sampleInstances` order, so the vectors are
positionally aligned across config-identical runs. The script refuses the
comparison unless every vector is exactly 121 long, so a mis-alignment fails
loudly instead of silently joining the wrong questions.

| # | run | baseline | feature | delta (q) | delta (pp) | churn in/out |
|---|---|---|---|---|---|---|
| 1 | `34492139716` | 51/121 | 101/121 | +50 | +41.32 | 56/6 |
| 2 | `34558715449` | 56/121 | 98/121 | +42 | +34.71 | 46/4 |
| 3 | `34558717704` | 51/121 | 98/121 | +47 | +38.84 | 52/5 |
| 4 | `34558719936` | 54/121 | 98/121 | +44 | +36.36 | 47/3 |

| quantity | series | range (q) | sd (q) | spread (pp) |
|---|---|---|---|---|
| baseline correct | [51, 56, 51, 54] | **5** | 2.12 | 4.13 |
| feature correct | [101, 98, 98, 98] | **3** | 1.30 | 2.48 |
| delta | [50, 42, 47, 44] | **8** | 3.03 | 6.61 |
| churn (discordant pairs) | [62, 50, 57, 50] | **12** | 5.07 | 9.92 |

Per-question churn between run pairs, elementwise on `featureCorrect`:

| pair | differing | rate |
|---|---|---|
| `34492139716` vs `34558715449` | 11 | 9.1% |
| `34492139716` vs `34558717704` | 9 | 7.4% |
| `34492139716` vs `34558719936` | 13 | 10.7% |
| `34558715449` vs `34558717704` | 10 | 8.3% |
| `34558715449` vs `34558719936` | 10 | 8.3% |
| `34558717704` vs `34558719936` | 8 | 6.6% |

**MR-scoped churn: 8–13 questions (mean 10.2, sd 1.57) over 6 run pairs.** The
floor that governs an MR guard is therefore **13 questions**, taken as the
observed maximum, not the mean — a guard must beat the worst case, because the
guard is evaluated on a single run and cannot know which point of the range it
landed on.

### Why the delta floor (8) is not the one I use

The delta series has range 8 and the per-question churn has range 13. Delta is a
difference of two noisy quantities, so its range should be *larger* than either
component's, not smaller. That it is not means the four runs happened to produce
deltas that were closer together than their underlying question-level churn
suggests — a coincidence of this particular quadruple, not a structural fact.

I use the per-question churn (13) because it is the conservative choice and it is
the quantity with a directly interpretable meaning: it is the number of questions
a re-run can move. Using the smaller delta range would make the floor
optimistic on the strength of a favourable draw.

## 2. The churn here is signal, not noise

The MR churn (50–62) sits far above the MR floor band (8–13). That is not a
contradiction — it is the expected shape of an ablation whose arms differ in
prompt.

The two MR arms render different prompts by construction (`buildLegacyAggregationQaPrompt`
vs `buildAggregationQaPrompt`). Roughly 45% of MR questions receive an answer that
differs between the arms, because the prompts genuinely instruct different
behaviour — the CoT prompt forces enumerate-then-count with the exchange rule and
explicit counting-unit rules, the legacy prompt asks for inline counting. A large
discordant count with a large, concordant net delta (46–56 repaired against only
3–6 broken on every single run) is exactly what a real treatment effect looks
like. Contrast the KU guard, where a net +2 sits on churn of 6 and does not clear
its floor of 3.

## 3. Does `20592f2` change the MR comparison? No — and I verified it, not assumed it

This mattered enough to test, because if the answer-cache fix had altered the MR
ablation, the historical MR floor above would be measuring a different
configuration from the current one and could not be compared.

It did not. A probe against `runMrAggregationAblation` with a call-counting LLM
shows the ablation issues exactly **3 LLM calls: 1 query-expansion + 2 aggregation**,
with the two aggregation prompts distinct. Running the identical probe against a
build with the MR arms given separate answer caches — emulating pre-`20592f2`
behaviour — yields **the same 3 calls and the same 2 distinct aggregation prompts**.

The reason is structural:

- The MR arms **already shared** the query-expansion cache. Its key is
  `` `${promptBuilder.name}:${question}` ``, and both arms use the same default
  `buildQueryExpansionPrompt`, so it was never re-queried.
- The two aggregation prompts are **byte-different** on every question, so the
  newly shared answer cache never hits for MR. The sharing is a no-op here.

So the MR floor in §1 is valid for the current code as well as the code it was
measured on, and the fix's real effect is confined to the arms whose prompts are
byte-identical (TR engine, TR window, TR coverage, KU bitemporal) — which is
exactly the set the mutation test in `report-runner.test.ts` fails on.

The weaker property the MR test now asserts is the honest one: the MR arms share
no prompt, so sharing the cache cannot collapse them into a single call and make
the ablation measure nothing.

## 4. Scope and limits

- **n = 4 runs.** The floor is a range over four observations, not a fitted
  distribution. A fifth run could widen it; the delta's 3.2× margin is large
  enough that a modest widening would not overturn the verdict.
- **The floor is measured on pre-fix runs.** §3 establishes that the fix does not
  alter the MR ablation, so this is sound — but it is sound *because of §3*, not
  because the runs are contemporaneous.
- **`featureCorrect` is a positional join.** It is the one place in this analysis
  where position is the right key, and it is guarded: the script refuses to
  compare vectors that are not all 121 long.
- **Run 4 is not an outlier here.** Unlike the overall series (where dropping run
  4 collapses the range 11 → 3), the MR series is flat: feature correct is 98 on
  three of four runs, and the delta range does not depend on any single run.

## 5. What this changes

The MR guard is the strongest measured result in the project and needs no
further validation to be reported. The next question is not whether MR works but
**why it stops at ~81%** (98/121): 23 questions remain wrong on the feature arm
under a prompt that already forces enumeration. That is a capability ceiling
question, not a measurement-integrity one, and it is the right next target.

The TR-engine guard (83 → 97 historically) is re-quantified in
`requantify_guards.py` against its own floor, and the KU guard (+2, floor 3) is
the one guard that does **not** clear its floor — it should be reported as
unresolved, not as a positive result.

## 6. Correction to my own earlier verdicts

`p5-verdict.md` and `p5-pairing-verdict.md` both describe the MR aggregation
guard as "the larger effect at 14 q / 11 pp" and cite that figure when proposing
the re-quantification. That label is wrong twice over.

**Error 1 — wrong guard.** 14 q / 11 pp is the **TR-engine** delta. It appears as
`tr-llm-temporal → tr-deterministic-temporal` at 83 → 97 in eight TR runs
(`34028574903`, `34035358249`, `34035372339`, `34226960621`, `34226975988`,
`34140072057`, `34140111361`, `34171370206`). No MR report in this repository has
a delta of 14. I inherited the label from an earlier summary and repeated it
without opening the artifacts, which is precisely the mistake the P5 pairing
verdict was written to stop.

**Error 2 — understated by 3.2×.** The true MR delta is +42 to +50 q, not 14.
Because of error 1 the figure was never an MR figure, so it was never going to
match; but the practical consequence is that a guard I had ranked second is in
fact the strongest measured effect in the project.

**Also corrected by this analysis:** the TR-engine guard is *smaller* on the
current code than the 14 q historical figure suggests — the four config-identical
runs give deltas of 7, 10, 11, 9 of 127 (mean 9.25), not 14. The historical 14
came from TR-focused runs at a different point in the code's history. Against the
TR-scoped floor this guard is still real (mean 9.25 q against a TR floor of ~4),
but it should be quoted from the same-batch runs, not from the older TR-only ones.
See `p5-verdict.md` for the TR-scoped floor.
