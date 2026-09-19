# V4-Pro Non-Thinking Diagnostic Run — Verdict: NEGATIVE (worse than V4-Flash)

## Summary

| Reader | Config | Overall | Verdict |
|---|---|---|---|
| V4-Flash | non-thinking (`deepseek-chat`) | **83.95%** (RRF baseline, 4 runs) | reference |
| **V4-Pro** | **non-thinking** (`deepseek-v4-pro`, `thinking:disabled`) | **78.40%** (1 run) | **−5.55pp, worse on EVERY capability** |

V4-Pro in **non-thinking mode is systematically worse** than V4-Flash in
non-thinking mode. The assumption that "a bigger reader is strictly better"
does not hold: V4-Pro is a reasoning-optimized flagship whose value lives in
thinking mode, and forcing it into non-thinking degrades instruction following.

## Per-capability (same RRF architecture, single-run vs 4-run baseline)

| Capability | V4-Flash non-thinking | V4-Pro non-thinking | Δ |
|---|---|---|---|
| IE | 94.50% | 88.67% | **−5.83pp** |
| MR | 79.55% | 77.69% | −1.86pp |
| KU | 81.25% | 75.00% | **−6.25pp** |
| TR | 73.43% | 69.29% | **−4.14pp** |
| ABS | 100.00% | 76.67% | **−23.33pp** |
| **Overall** | **83.95%** | **78.40%** | **−5.55pp** |

## Root cause (evidence-grounded, not speculation)

The single failure mode is **instruction-following degradation in non-thinking
mode**, visible in three concrete ways:

1. **Over-generation / verbosity (IE, 14/14 wrong answers are LLM over-answers).**
   - "What did I buy for my sister's birthday gift?" GOLD `'a yellow dress'` →
     V4-Pro answers `'A yellow dress and a pair of earrings to match'` — the
     correct fact is present but an extra wrong fact is appended, so the judge
     scores it wrong.
   - Preference questions ("Can you recommend…", "Any tips…") GOLD is the short
     `"The user would prefer…"` sentence; V4-Pro emits a long essay that deviates
     from the gold phrasing.

2. **Failure to abstain when it should (ABS, the most catastrophic regression).**
   - V4-Flash abstains 30/30 on ABS. V4-Pro abstains only 23/30: on 7 unanswerable
     questions it forces an answer instead of abstaining, and all 7 are wrong.

3. **More LLM-level mistakes on TR/KU** (20 TR + 10 KU wrong answers are
   LLM-generated, on top of the 20 deterministic-engine errors that are identical
   regardless of reader).

Decision reasons confirm the abstention shift: `answered 459 / llm-abstain 40 /
threshold 1` — V4-Pro answers 459 of 500 questions, far more aggressively than
V4-Flash, and that extra answering is where it loses points.

## Why this is a valuable negative result

This corrects a wrong premise I introduced earlier: I had concluded "the
residual gap is a DeepSeek reader ceiling, and a stronger reader is the only
lever". That was wrong in two ways:

1. The old runs used `deepseek-chat` = **V4-Flash non-thinking**, the *bottom*
   tier, not "DeepSeek's full capability".
2. But the *fix* is **not** simply switching to V4-Pro — V4-Pro **non-thinking**
   is actually worse. V4-Pro's strength is **thinking mode** (its 49B-active MoE
   is optimized for chain-of-thought reasoning), which we have NOT yet measured.

## Next step (recommended, not yet executed)

The only remaining path to unlock V4-Pro's real capability is **V4-Pro +
thinking mode** (`DEEPSEEK_THINKING=enabled`, already wired as an env toggle in
`dcb970d`). That requires two things the current harness lacks:

1. **A longer per-attempt deadline.** `DEFAULT_RETRY_TIMEOUT_MS = 60_000` is far
   too short for thinking-mode reasoning (measured 20–200s per call on large
   retrieved contexts). It must be raised to ~300s for thinking experiments.
2. **Cost tolerance.** Reasoning tokens bill as output tokens ($0.87/M); the
   benchmark's ~500 questions × several LLM calls each will cost materially more
   than non-thinking.

If thinking mode is measured and also underperforms V4-Flash, then the correct
final answer is: **V4-Flash non-thinking at 83.95% is the right reader for this
benchmark**, and the SOTA gap is a prompt/architecture ceiling, not a reader-tier
ceiling.
