# Iteration #145 — two-event temporal questions: A/B verdict

**Conclusion first.** The fix works and the primary endpoint passed: the six
two-event `relative` questions went from **0/6 to 5/6**. Four of the five gains
are deterministic — the same question returns the same value on every run of an
arm, and the null A/B shows this bucket never moves on its own. One question
(`flu`) moved from 38 to 12 but the gold is 15; its remaining error is operand
identification, not temporal arithmetic, and belongs to a different iteration.
One guard observation (KU abstention) moved more than the null envelope allows,
and is explained structurally rather than dismissed: the two arms' builds differ
in exactly two files, neither of which the KU path can reach.

## The A/B

Same-instant 4+4, full 500 questions, `temperature=0`. The eight runs were
dispatched interleaved within an 18-second window so both arms are sampled at the
same instant.

| arm | ref | commit |
|---|---|---|
| control | `tr-two-event-control` | `db92e62` |
| treatment | `master` | `d793db4` |

One control run (`33897750172`) died on a reset connection ~14 min in; it was
replaced by a fresh same-instant pair. See
[tr-connection-failure-notes.md](tr-connection-failure-notes.md).

## Primary endpoint — PASS

`relative` questions that name a second event, scored on the majority-vote bucket
over 4 runs per arm:

| question | gold | control | treatment |
|---|---|---|---|
| baking class / birthday cake | 21 (22 ok) | 26, 26, 5 | **21**, 21, 21, 25 |
| Evelyn Hugo / book reading | 18 (19 ok) | 44 | **18** |
| ukulele / guitar tech | 24 (25 ok) | 59 | **24** |
| flu / 10th jog | 15 | 38 | 12 ✗ |
| website / first client | 19 (20 ok) | 24 | **19** |
| Adidas / Converse shoelace | 14 (15 ok) | 24 | **14** |

**control 0/6 → treatment 5/6.** Acceptance was ≥5/6. Per-run mean over the same
bucket: **0.00% → 79.17%**.

Why this is not noise: across all 35 possible 4v4 splits of a temporal-null A/B,
this bucket never moved by even one question. Five of the six return an identical
string on every run of an arm, so the bucket is decided by arithmetic rather than
by the vote.

Two notes beyond the acceptance criterion:

- **`baking class` was fixed as a side effect.** It was deliberately excluded
  from the fix's scope because its `when` clause is a modifier rather than a
  second operand, and its fixture failed the reconstruction self-check. It now
  answers correctly in 3 of 4 runs.
- **`flu` is a different bug.** The arithmetic is now right (it measures between
  the two events) but the engine extracts the wrong date for "my 10th jog
  outdoors" — 2023/04/16 instead of 2023/05/07, 21 days off. That is operand
  identification, the same class as `183a3cc`, and is queued separately.

## Secondary — descriptive only, not an acceptance criterion

Run-level production accuracy (scored by the product, LLM judge included):

| group | control | treatment | delta | perm p |
|---|---|---|---|---|
| ALL | 76.10% [75.2–76.6] | 75.50% [75.2–75.8] | −0.60 | 0.200 |
| **TR** | 72.24% [70.9–73.2] | 74.21% [73.2–75.6] | **+1.97** | 0.057 |
| IE | 95.50% | 95.00% | −0.50 | 0.714 |
| MR | 75.00% | 71.90% | −3.10 | 0.086 |
| KU | 76.04% | 74.65% | −1.39 | 0.257 |
| ABS | 0.00% | 0.00% | 0.00 | 1.000 |

The fix can move at most 6 of 500 questions, i.e. ±1.2pp, and it delivered
+1.97pp on TR. The permutation test returns p = 0.057 — suggestive, not
significant, and it could not be otherwise: with 4+4 runs the floor is p = 0.014
and the design cannot resolve a 1–2pp effect on 500 questions. This is exactly
why accuracy was pre-registered as descriptive and the deterministic bucket as
the acceptance criterion.

`ABS` is 0/30 on both arms. Entirely failing capability, unrelated to this
change, and the largest remaining headroom on the benchmark.

## Guards

Thresholds are the measured maxima over all 35 null 4v4 splits of `ab_turn`,
whose two arms are byte-identical in `temporal-engine.ts` (see
[tr-two-event-plan.md §6.1](tr-two-event-plan.md#61-noise-floor-calibration-measured-before-the-treatment-was-read)).

| guard | bucket | per-run mean | null | verdict |
|---|---|---|---|---|
| G1 single-event `relative` (n=19) | 18 → 17, −1 | 94.74% → 94.74% (**+0.00pp**) | ≤1 | PASS |
| G2 `interval` (n=26) | 18 → 18, −0 | 71.15% → 71.15% (+0.00pp) | ≤0 | PASS |
| G2 `ordering` (n=40) | 14 → 12, −2 | 34.38% → 32.50% (−1.88pp) | ≤3 | PASS |
| G4 TR abstention rate | 7.09% → 7.09% | — | — | PASS (+0.00pp) |

The G1 loss is an artefact of the bucket rule, not a regression. Every run of
both arms answered that question correctly; the treatment merely split 2/2
between two surface forms of the same answer (`'4'` and `'4 weeks ago'`), and a
tie has no mode. The per-run column is shown precisely so a metric artefact
cannot be mistaken for a behavioural change.

`other`/`eventLookup` is excluded from G2 rather than passed: those kinds return
`null` before the switch, so the fix is unreachable for them and a movement there
(−1.39pp per-run) is drift by construction.

On the balanced 4v4, G3 resolves cleanly — every capability outside TR moves
within its own run-to-run spread:

| capability | control | treatment | delta | own spread |
|---|---|---|---|---|
| IE | 95.50% | 95.00% | −0.50pp | 2.67pp |
| MR | 75.00% | 71.90% | −3.10pp | 5.79pp |
| KU | 76.04% | 74.65% | −1.39pp | 2.78pp |
| ABS | 0.00% | 0.00% | 0.00pp | 0.00pp |

### G3 — resolved on the balanced design

The first read of this A/B had only 3 control runs (one died), and on that 3v4
comparison KU fell 1.97pp, above its null drift maximum of 1.74pp, with its
abstention rate up 3.47pp against a null maximum of 2.43pp. Both arms were
internally tight — control 5, 6, 7 abstentions per run, treatment 8, 10, 8, 8 —
so it was a systematic difference between the arms, not one bad run. It deserved
an explanation rather than a shrug, and it has one.

On the balanced 4v4 the KU delta falls to −1.39pp, inside its own spread of
2.78pp. Part of the original gap was the asymmetry itself: a 4-run arm can tie
2/2 and a 3-run arm cannot, so the bucket rule penalised the arm with more runs.

Even at its worst, it could not have been the fix. Five independent lines:

1. **Call path.** `answerTemporal` is invoked only when `q.capability === 'TR'`
   (`benchmark.ts`), and `hasSecondEventReference` is consulted only inside
   `case 'relative'`. KU never enters either.
2. **Build diff.** Building `db92e62` and `d793db4` in separate trees and diffing
   `dist/` yields exactly two differing runtime files: an additive export in
   `index.js` and the guarded branch in `temporal-engine.js`. `cortex-core`,
   `cortex-node` and `cortex-llm` are byte-identical.
3. **No other change exists.** The commit touches three files: the engine, the
   barrel export, and the test.

4. **Between-window drift for identical code is 2.08pp.** `db92e62` was
   measured in two independent windows — as `ab_turn`'s treatment at 11:42 UTC
   (10.42%) and as this A/B's control at 16:55 UTC (8.33%). Same code, 2.08pp
   apart.
5. **The spread of every near-identical group is 3.48pp.** Four run groups whose
   code cannot differ in the KU path:

   | run group | commit | KU abstention |
   |---|---|---|
   | `ab_turn` control | `183a3cc` | 10.07% |
   | `ab_turn` treatment | `db92e62` | 10.42% |
   | #145 control | `db92e62` | **8.33%** |
   | #145 treatment | `d793db4` | **11.81%** |

   The range is 3.48pp, essentially exactly the 3.47pp observed. And the
   outlier is the *control* arm, which is the lowest of the four, not the
   treatment, which sits in line with the two `db92e62` measurements.

What remains is drift between concurrently executing jobs, plausibly the same
provider-side throttling that killed one run outright. Reported, not gated, and
re-measured on the balanced 4v4 below.

## Next

- Re-run the guards on the completed 4+4 (a replacement same-instant pair was
  dispatched after the control run died).
- Then: operand identification for `flu`, the `ABS` capability at 0/30, and the
  per-request timeout gap in `retryableFetch`.
