# P24 §A — which turns matter inside an admitted session

Instrument: `analysis/scripts/p24_turn_class.mjs`. Data: run `35004814319`
(`4955d8e`), MR rows, the only rows that carry evidence-session content.
n = 121 questions, 9,028 admitted turns, 0.1% without a parseable role line
(truncation artefacts).

## Why this was measured

P23 §5 falsified the linear reading of the coverage correlation: moving questions
into 100% coverage did not buy accuracy at a fixed rate, because the questions
that arrive there *because of a fix* are harder. That changes the objective from
*how many* turns are admitted to *which* turns. This is the first measurement of
the second question.

## Two instrument bugs found and fixed before reading anything

Both produced plausible-looking zeros, which is why they are recorded rather than
quietly patched:

1. **Turn parser matched only one of two renderings.** The single-session path
   emits `[YYYY/MM/DD] user: ...`; the multi-session path emits
   `[YYYY/MM/DD (Ddd) HH:MM] user: ...`. A pattern anchored on `[\d/]+\]` parsed
   every MR turn as `role: 'unknown'`, so `userTurns` and `assistantTurns` both
   read 0 and looked like a finding about the data. The parser now handles both
   and the script **exits non-zero** if more than 2% of turns are unparsed.
2. **Overlap direction was inverted.** Asking "what fraction of the session is in
   this turn" is structurally ~0 (a session is ~12,000 shingles, a turn a small
   slice), so evidence coverage read 0 for all 9,028 turns. The useful direction
   is "of this turn, how much is in the reference".

Thresholds are calibrated against the measured distribution, not chosen:
evidence coverage p50 0.560 / p75 0.710 / p90 1.000, so the cut is 0.5. Answer
coverage is p50 0.000 / p95 0.013 / max 0.323 — a shingle ratio is unusable for a
short ground-truth phrase, so "states the answer" is a substring test.

## Finding 1: admitting the answer-bearing turn is associated with LOWER accuracy

| group | n | accuracy | 95% CI |
|---|---|---|---|
| has an answer-bearing turn | 44 | 84.1% | [70.6, 92.1] |
| has none | 77 | 89.6% | [80.8, 94.6] |
| has ≥2 answer-bearing | 29 | 79.3% | [61.6, 90.2] |

Monotone across the three groups (89.6 → 84.1 → 79.3) and **not a size confound**:
mean prompt size is flat (17,343 / 17,373 / 17,262 chars) and mean admitted turns
is flat (74.9 / 74.1 / 73.3). So the effect tracks *which* turns, which is the
question P23 §5 asked.

**Caveat that stops this being a result:** the CIs overlap heavily, the
comparison is observational rather than paired, and MR is a capability where
adding turns is known to dilute aggregation. This is a hypothesis for a paired
test, not a lever.

## Finding 2: the "coverage optimum" I first read here was an artifact

Cutting `evidenceBearing` into three buckets gave 83.9% (≤40 turns) → **95.1%**
(41–60) → 75.9% (>60), which reads as a clean inverted-U with an interior
optimum. **The decile grid refutes it:**

| decile | evBear | n | acc |
|---|---|---|---|
| d1 | 13–30 | 13 | 92.3% |
| d2 | 31–37 | 13 | 76.9% |
| d3 | 38–43 | 13 | 84.6% |
| d4 | 43–47 | 13 | 100.0% |
| d5 | 48–51 | 13 | 92.3% |
| d6 | 51–56 | 13 | 92.3% |
| d7 | 56–60 | 13 | 100.0% |
| d8 | 60–66 | 13 | 76.9% |
| d9 | 67–74 | 13 | 84.6% |
| d10 | 75–87 | 4 | 50.0% |

Adjacent deciles swing 76.9 → 100.0 → 84.6 → 100.0 → 76.9. The quadratic fit is
**convex** (no interior peak), Pearson is only −0.108, and the "optimum" sat at
the boundary of the arbitrary 40/60 cuts. The three-bucket shape was manufactured
by bucket placement on 121 points.

The only consistent signal is the thinnest decile: **evBear 75–87 → 50% (n=4)**,
and its mean admitted turns is the highest of any decile (87.0). That is
consistent with the P23 turn-count banding — too many turns — rather than with a
coverage optimum. n=4 cannot carry it.

## Status

Hypothesis only. `evidenceBearing` has **no** monotone relation to correctness at
n=121; `answerBearing` has a consistent negative one that survives the size
control and needs a paired test. Neither should be used to change a default yet.
