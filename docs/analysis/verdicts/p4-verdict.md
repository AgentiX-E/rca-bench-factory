# P4 verdict — both arms INCONCLUSIVE, and a much larger between-run variance than assumed

Primary run: **`34492139716`**, full 500 instances, `deepseek-v4-flash`,
`thinking=disabled`, `temperature=0`, `runs=1`. Both P4 arms ran on all **127**
TR questions, matching the P3b population.

## Correctly parameterised results

| Arm | n | Baseline | Feature | Δ | b✓f✗ | b✗f✓ | McNemar 2-sided | One-sided |
|---|---|---|---|---|---|---|---|---|
| Time-window annotation | 127 | 68.50% | 70.08% | **+1.57 pp** | 0 | 2 | 0.500 | 0.250 |
| Engine refinements | 127 | 68.50% | 66.93% | **−1.57 pp** | 2 | 0 | 0.500 | 0.750 |

Reference, same run: main TR ablation
(`tr-llm-temporal` → `tr-deterministic-temporal`) = **+5.51 pp**, 4 broken /
11 repaired, p = 1.185e-1 — no longer significant (was +8.66 pp, p = 1.273e-2 in
P3b). Overall main ablation: 81.00%, Δ +5.20%, 0 broken / 26 repaired,
p = 2.980e-8.

## Verdict: INCONCLUSIVE (both arms)

The pre-registered rule was that an effect at or below the measured
same-configuration noise floor (2 questions / 1.57 pp) cannot be read as a
result. Both arms sit exactly on it, with only **2 discordant questions each**
and 0.500 two-sided p. Neither promotes.

Notably the two effects are **exact mirror images**: the annotation repaired 2
questions and broke none; the engine refinements broke 2 and repaired none. On
this run the annotation is marginally better, which is the opposite of the
model-mismatched run (`34481475313`, `deepseek-chat`) where the annotation lost
3 and repaired 1 while the engine tied 1–1. Two runs, opposite signs, both at
the floor. That is what a null effect looks like, and it is the strongest reason
not to promote either.

## The dominant finding: between-run variance is far larger than the noise floor

Both P4 runs, and the P3b reference, are supposed to be comparable. Comparing
P3b `34389565513` against this run — **identical code, identical dataset,
identical model `deepseek-v4-flash`, identical `temperature=0`, identical
restored embedding cache (170095 vectors), embedding determinism max abs diff
0** — the graded system moved substantially:

| Capability | n | P3b | This run | Δ pp | Δ questions |
|---|---|---|---|---|---|
| IE | 150 | 95.33% | 88.67% | −6.66 | −10 |
| MR | 121 | 80.99% | 85.12% | +4.13 | +5 |
| KU | 72 | 81.94% | 79.17% | −2.77 | −2 |
| TR | 127 | 78.74% | 67.72% | −11.02 | −14 |
| ABS | 30 | 100.00% | 86.67% | −13.33 | −4 |
| **ALL** | **500** | **86.00%** | **81.00%** | **−5.00** | **−25** |

**25 questions / 5.0 pp of drift on a byte-identical configuration.** Every
retrieval-side input is provably fixed: the embedding cache is the same object
and embedding is deterministic to 0. The only remaining free variable is the
hosted `deepseek-v4-flash` endpoint itself, which is evidently not reproducible
across runs even at `temperature=0`.

This is roughly **16× the 2-question noise floor** that every recent verdict has
been reasoning against. The consequence is severe: the floor was derived from two
arms measured *inside one run*, and it badly understates the between-run variance
that actually governs whether two verdicts can be compared at all.

## What this invalidates

- Any P3b-vs-P4 comparison. The +8.66 → +5.51 pp change in the main TR ablation
  is **not** attributable to this iteration; it is within the observed ±11 pp TR
  drift on unchanged code.
- The precision guard's apparent behaviour in the model-mismatched run — that
  number is not stable across runs.
- The practice of gating promotion on a single-run paired comparison at
  `runs=1`. With 25 questions of config-identical drift, a 2-question arm
  effect is not distinguishable from endpoint variance.

## What still stands

- Both refinements are **default OFF**, so the graded path and the published
  numbers are unaffected by this iteration. The safe decision is unchanged.
- The embedding/retrieval pipeline is **deterministic**: max abs diff 0, and the
  retrieval-only diagnostics are reproducible. The nondeterminism is confined to
  the LLM calls.
- No regression was introduced. `pnpm check` is green with 771 tests; the arms
  are additive and gated.

## Recommended next step

The highest-value work is now **not** another TR arm. It is to pin down the
endpoint's variance:

1. Re-run the *same* configuration (no P4 features, `limit=0`,
   `deepseek-v4-flash`, `temperature=0`) 3 times and measure the spread of the
   overall and per-capability numbers directly. Without this, no arm of size
   ≤25 questions can be interpreted.
2. If the spread is confirmed at ~5 pp, re-derive the decision rule at the
   *between-run* scale — i.e. an arm must exceed the config-identical
   between-run spread, not the within-run paired floor — or move the graded
   comparison to `runs>1` with a real stochastic-ensemble estimate and use the
   Welch t-test that `report.ts` already computes.
3. Only then re-measure the two P4 arms with enough power to resolve a
   ~1.5 pp effect, or abandon them as below the resolvable threshold.

Designing a sixth TR feature before fixing the measurement floor would repeat
the error this iteration uncovered: producing green runs whose numbers cannot
support the conclusions drawn from them.

## Appendix — the model-mismatched run `34481475313`

Recorded for completeness. Dispatched with `deepseek-chat` (the workflow's own
`model` default), which is **not** the model the baseline was measured on. It
gave the opposite arm ordering and a 13-point-lower TR:

| Arm | n | Baseline | Feature | Δ | b✓f✗ | b✗f✓ |
|---|---|---|---|---|---|---|
| Time-window annotation | 127 | 68.50% | 66.93% | −1.57 pp | 3 | 1 |
| Engine refinements | 127 | 66.14% | 66.14% | +0.00 pp | 1 | 1 |

The lesson is the same one the sampling defect taught: a dispatch that omits an
explicit parameter silently measures a different system. The workflow's `model`
input should default to the reference model so an un-parameterised dispatch is
comparable by construction.
