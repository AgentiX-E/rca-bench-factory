# MR DCG Session-Scoring A/B — Verdict: REJECT (regression)

**Date:** 2026-09-06
**Fix under test:** `51b573f` — `feat(eval): score turn-recall sessions by rank-discounted gain (DCG)`
**Control:** `mr-dcg-control` (`bc687b9`, max-turn session scoring)
**Treatment:** `master` (`51b573f`, DCG session scoring)
**Protocol:** same-instant interleaved 4v4; all 8 runs `success`, `questionCount = 500`

---

## 1. Verdict

**REJECT — the DCG change regresses MR by a significant margin.** `51b573f` was
reverted (`a52628f`), which restores the max-turn scoring. The negative result is
kept as evidence: for LongMemEval-S multi-session questions (which are
predominantly single-fact counting/aggregation), the single-best-turn score
beats rank-discounted aggregation.

## 2. Mechanism endpoint — MR accuracy

| arm | per-run correct / 121 | mean |
| --- | --- | --- |
| control (max) | `[97, 94, 94, 88]` | 93.25 = 77.07% |
| treatment (DCG) | `[93, 87, 85, 89]` | 88.50 = 73.14% |

Delta **−4.75 questions/run = −3.9pp**. Exact permutation test on the decrease
direction: ~2/70 = **p ≈ 0.029** (significant regression).

MR abstention rose slightly (9.75 → 10.75/run), consistent with DCG admitting
noisier sessions into the recall window and pushing the evidence turn out.

## 3. Guards

| Capability | control | treatment | delta |
| --- | --- | --- | --- |
| IE | 94.50% | 95.67% | +1.17pp n.s. |
| KU | 78.47% | 79.51% | +1.04pp n.s. |
| TR | 75.79% | 74.61% | −1.18pp n.s. |
| ABS | 100.00% | 100.00% | 0.00 |

All non-MR movements are within run-to-run noise; the MR regression is the
attributable effect (the change touches only the MR turn-recall channel).

## 4. Why it regressed

The pre-registered trade-off resolved against DCG. LongMemEval-S MR questions are
mostly single-fact counts and aggregations, where the correct evidence is ONE
strong turn and the rest of a session is noise. DCG lets a session with several
moderately-relevant (noise) turns outrank a session with one strongly-relevant
(evidence) turn, which dilutes the injected context. `max` was the right
reduction for this benchmark's MR profile.

This is a **valuable negative result**: it empirically confirms the
`max`-turn scoring is locally optimal for MR on this benchmark, and it rules out
the EmergenceMem/AgentOS DCG heuristic as a transferable win here.

## 5. Action taken

- `51b573f` reverted in `a52628f` (author Lambertyan), pushed to `origin/master`.
- `git diff bc687b9 -- retrieval.ts` is empty: master's retrieval is byte-identical
  to the pre-DCG state.
- `pnpm check` and `pnpm build` green (556 tests), coverage ≥95% on all four
  dimensions.

**Current master is back to `a52628f` = `bc687b9` (the observability-fix state),
MR 77.07% baseline, overall 83.55%.**
