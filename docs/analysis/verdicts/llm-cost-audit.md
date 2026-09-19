# LLM API Call & Cost Audit

**Conclusion first**: one full benchmark (`runs=1`, all 500 questions) issues
~2,460 LLM calls. Two changes — (1) share the baseline/feature answer for
high-confidence questions, (2) make the three diagnostic ablations skippable —
cut the bill by ~57% with zero accuracy impact. The reader should stay
**V4-Flash**, which is 3.1× cheaper than V4-Pro AND currently scores higher
(83.95% vs 78.40%).

## 1. Where the calls go (per full run, runs=1)

| Stage | Expansion calls | Answer calls | Notes |
|---|---|---|---|
| Main QA (baseline + feature) | 500 (shared cache) | ~999 | baseline & feature each answer all 500 |
| MR aggregation ablation | 121 | 242 | legacy vs CoT, paired |
| TR temporal-engine ablation | 127 | 254 | LLM vs deterministic, paired |
| KU bitemporal ablation | 72 | 144 | CoT vs LLM-extract, paired |
| **Subtotal** | **820** | **~1,639** | |
| **Total** | | **~2,460** | judge excluded (see §4) |

A 4v4 A/B runs this 8× ⇒ ~19,700 calls.

## 2. Cost estimate (V4-Flash, per run)

DeepSeek V4 pricing (per 1M tokens): Flash `$0.14` input / `$0.28` output
(cache-hit input `$0.0028`); Pro `$0.435` / `$0.87` — **Pro is 3.1× Flash**.

| Component | Tokens | Cost |
|---|---|---|
| Answer input (~1,639 × ~1.5K) | ~2.5M | ~$0.35 |
| Expansion input (~820 × ~0.12K) | ~0.1M | ~$0.01 |
| Output | ~0.04M | ~$0.01 |
| **Total** | | **~$0.37/run** (~$3 for a 4v4 A/B) |

Pro would be ~$1.15/run (~$9 for a 4v4 A/B) **and scores worse** — see §5.

## 3. Optimization plan (ROI order)

### P0 — share the baseline/feature answer (≈ −18% total)

`enableAbstention` does NOT change the prompt: both `nl-naive-baseline` and
`nl-abstain-feature` call the same `buildQaPrompt` with the same
`DEFAULT_ABSTAIN_TOKEN`, over the same retrieved context, at the same
temperature. So for every question where the feature system actually answers
(`top1Score ≥ threshold`), baseline and feature produce **byte-identical** LLM
calls — that is ~447 of the ~500 feature calls duplicated.

Add a prompt-keyed answer cache shared between the two systems; the feature run
then reuses the baseline answer instead of re-billing it.

### P1 — make the three ablations skippable (≈ −39% total)

MR/TR/KU ablations are diagnostic (they isolate each mechanism's contribution),
not part of the headline SOTA number. A `--skip-ablation` flag (or
`SKIP_ABLATION=1` env) drops 960 calls when only the score matters.

### P2 — exploit DeepSeek automatic prefix caching

DeepSeek caches the prompt prefix automatically (cache-hit input is 50×
cheaper). Keep the stable instruction preamble at the front and the variable
retrieved context at the end. Query-expansion prompts already have a stable
preamble and are the easiest win here.

### P3 — keep V4-Flash as the reader

Pro is 3.1× Flash and currently scores lower. Only revisit if a thinking-mode
experiment proves otherwise (§5).

## 4. The judge is already cheap

`judgeScorer` short-circuits on normalized exact match and numeric verdicts, so
the LLM judge only fires on the residual, and `createLlmJudge` caches verdicts by
prompt across systems and runs. No further work needed there.

## 5. Reader matrix (measured vs untested)

| Reader | non-thinking | thinking |
|---|---|---|
| V4-Flash | **83.95%** ✅ measured | **UNTESTED** — cheapest candidate |
| V4-Pro | 78.40% ❌ measured (worse) | UNTESTED — needs longer deadline + 3.1× cost |

**V4-Flash + thinking is the highest-ROI untested cell**: it keeps Flash's good
instruction following (which Pro non-thinking lost) while adding reasoning for
the TR/MR arithmetic questions. It is 3.1× cheaper than Pro thinking.
