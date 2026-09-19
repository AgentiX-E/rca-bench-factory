# TR Occurrence-Date Recall A/B Verdict — REJECT (negative, deterministic mechanism)

**Iteration:** P3a occurrence-date recall (Hindsight Tempr step 3, fact-level occurrence interval)
**Control:** `13d6b15` (`tr-occurrence-control`) — no occurrence recall
**Treatment:** `0e8aaae` (`master`) — `0f2f1cc` occurrence-date recall + `0e8aaae` pool shrink
**Reader:** deepseek-v4-flash, non-thinking, `temperature=0`
**Design:** two interleaved batches (v1: 4v4 all 402-truncated; v2: 4v4, 7/8 success)

## Verdict first

**REJECT P3a.** Occurrence-date recall is a **deterministic net-negative**: it
repairs exactly one TR question and breaks three, and every one of those four
questions separates perfectly across all 15 runs (7 control + 8 treatment). The
aggregate effect is −1.55 TR questions/run (one-sided p ≈ 0.06–0.08, marginally
significant), and the root cause is the *same* failure mode already documented
for P2: a time window widens recall but admits semantically-near, temporally-wrong
distractors. This is the second consecutive rejection of time-window recall, so
the evidence chain is now conclusive.

## Data

### Batch disposition

| batch | runs | result |
|---|---|---|
| v1 | 8 | all `failure` — `402 Insufficient Balance` in the TR ablation stage; main ablation completed |
| v2 | 8 | 7 `success`, 1 `failure` (control `34331244351`, `undici TypeError: terminated` — transient network, not 402) |

### Run-level TR correct counts (main-ablation feature system)

| arm | per-run TR correct | mean |
|---|---|---|
| control (7 runs) | `[100,96,99,96,97,96,98]` | **97.43** |
| treatment (8 runs) | `[92,98,97,96,96,95,98,95]` | **95.88** |

Δ = −1.55 TR questions/run.

| test | statistic | p (one-sided trt worse) |
|---|---|---|
| Welch t | t = −1.681, df = 13.0 | 0.058 |
| Mann-Whitney U | — | 0.078 |
| Exact permutation (7 vs 8) | — | 0.079 |

### Question-level (127 TR questions, correct-rate paired, 7v8 runs)

Only 17 questions differ at all; the signal is concentrated in four questions
that separate **perfectly** across all 15 runs:

| question | control | treatment | Δ |
|---|---|---|---|
| "cooking something for my friend a couple of days ago" (gold `a chocolate cake`) | 0/7 | **8/8** | +1.000 ✅ |
| "charity event I participated in a month ago" (gold `Walk for Hunger`) | **7/7** | 0/8 | −1.000 ❌ |
| "sports event two weeks ago" (gold `annual charity soccer tournament`) | **7/7** | 0/8 | −1.000 ❌ |
| `bcbe585f` | 4/7 | 1/8 | −0.446 ❌ |

Net = **+1 repaired − 3 broken ≈ −2 questions**, matching the run-level −1.55.

## Root cause (identical to P2)

Occurrence recall widens the retrieval pool to `topK+5` and appends in-window
turns. This recovers the genuinely missing fact (the cake) but lowers precision
by admitting a near-synonym event whose occurrence date also falls inside the
window:

- `Walk for Hunger` question → distracted by `Cancer Research Foundation` charity gala.
- `annual charity soccer tournament` → the same `sports event` distractor class
  already flagged in `tr-daterange-verdict.md`.

The mechanism is **deterministic** (the four questions separate 0↔8 across
batches), not noise — `temperature=0` makes the code-path difference fully
reproducible.

## Decision

| Step | Action |
|---|---|
| 1 | REVERT `0f2f1cc` + `0e8aaae` (restore `13d6b15` state) |
| 2 | Keep the temporal `resolveTimeRange` + MAD onset infrastructure (still used by the deterministic engine) |
| 3 | Proceed to P3b (MemoryGraph spreading-activation) |

Time-window recall is now rejected twice (P2 date-range, P3a occurrence-date)
with the same root cause. The next temporal-retrieval attempt must use a
**precision-preserving** mechanism (e.g. re-ranking or graph-constrained
spreading-activation), not recall-pool widening.
