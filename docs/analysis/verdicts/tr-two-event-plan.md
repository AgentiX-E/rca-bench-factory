# Iteration #145 — two-event temporal questions measure to the wrong reference

## 0. Conclusion first

The deterministic temporal engine answers **0 of 6** `relative` questions that name a
second event, while answering **18 of 19** that name only one. The cause is a single
hard-coded line: for `kind === 'relative'` the engine always measures
`elapsed(events[0].date → questionDate)`. A question of the form *"How many days had
passed since I started ukulele lessons **when** I took my guitar to the tech?"* asks for
`elapsed(A → B)`, so the engine returns `elapsed(A → questionDate)` — 59 against a gold
of 24, **identical in all 4 runs** because the computation is deterministic.

The fix routes those questions to the interval computation the engine already has. The
affected population is exactly the 6 questions that currently score 0/4, so **no
regression is possible inside it**. Expected: **+5/127 TR (+3.9pp), +5/500 overall
(+1.0pp)**.

This replaces iteration #144, whose premise was refuted — see §1.

---

## 1. Why #144 (deterministic MR item counting) is cancelled

Measured, not argued. All numbers from the 4+4 same-instant A/B in `ab_turn/`, treatment
arm (121 MR questions × 4 runs).

| #144 claim | Evidence | Verdict |
|---|---|---|
| "8 of 16 wrong counting questions list ≥ gold items in Step 1 then answer lower" | The script searched for the first `Answer: <n>` **anywhere** in the completion. `parseAggregationAnswer` only accepts a **line-anchored** label, so the two disagree on **213/484 records (44%)**. Corrected with the production parser: **6 of 15**, i.e. **5 real questions**. | **Artifact** |
| "Step 2 re-derives the list and drops items → count in code" | In all 5 the exclusion verdict is written **into the Step 1 bullets**: `Forbes \| canceled \| (not current)`, `(same event as above, counted once)`, an explicit "dry cleaning is not a store" argument. A per-item `included` verdict would carry the same verdict and return the same wrong number. | **Wrong mechanism** |
| P0: route `how many years older` to the derivation prompt (2 questions) | "grandma" gold=43 needs grandma 75 **and the user's age**; the context says only *"still getting used to being in my 30s"*. "graduated from college" gold=7 needs the current age; that session is **not retrieved**. Both are **operand-missing**, not prompt-mismatch. | **Worth 0** |
| "abstention is driven by a large noisy context" | Bare `UNANSWERABLE` rate: 6.2% in the short half vs 10.0% in the long half; median context 17,029 chars (bare) vs 16,451 (answered). | **Refuted** |
| "distractor load limits accuracy" | Correct vs wrong questions: 13 vs 13 sessions, 11 vs 11 distractors, 15,902 vs 15,797 chars. Indistinguishable. | **Refuted** |

**Actions taken:** the P0 and P1 code written for #144 has been **reverted** (`git checkout`)
so no zero-gain change reaches `master`. The analysis scripts are kept.

---

## 2. Where the remaining errors actually are

`treatment` arm, 4 runs, 500 questions:

| capability | n | accuracy | wrong answers |
|---|---|---|---|
| ABS | 30 | 100.0% | 0 |
| IE | 150 | 95.2% | 7 |
| KU | 72 | 75.7% | 17 |
| **MR** | 121 | 74.6% | 31 |
| **TR** | 127 | **71.1%** | **37** |
| overall | 500 | 81.6% | 92 |

TR is the weakest capability **and** the largest error pool. It also never abstains, so
every one of its 37 errors is a confidently wrong answer — precisely the regime where a
deterministic engine should win.

TR split by the engine's own taxonomy (`tr_error_analysis.py`, classified with the
**shipped** `classifyTemporalQuestion`, not a reimplementation):

| kind | n | accuracy | stable wrong |
|---|---|---|---|
| relative | 25 | 72.0% | 6 |
| interval | 26 | 84.6% | 3 |
| ordering | 40 | 97.5% | 1 |
| eventLookup | 20 | 75.0% | 2 |
| other | 16 | 68.8% | 5 |

## 3. The mechanism

`temporal-engine.ts`, `computeTemporalAnswer`:

```ts
case 'relative': {
  const reference = normalizeDate(questionDate);          // <-- always the question date
  const value = elapsedValue(normalized[0]!.date, reference, relativeUnit(question));
  return String(value);
}
case 'interval': {
  if (normalized.length < 2) return null;
  return String(intervalValue(normalized[0]!.date, normalized[1]!.date, relativeUnit(question)));
}
```

`interval` **already** computes exactly what a two-event question needs. `relative` never
considers a second event, and always takes `normalized[0]` — so the answer depends on the
order the LLM happened to list the events in.

The split that proves it (`tr_two_event.py`):

| subset | n | accuracy | stable wrong (4/4) |
|---|---|---|---|
| `relative`, no second event | 19 | **94.7%** | 0 |
| `relative`, names a second event (`when`) | 6 | **0.0%** | **6** |
| `interval` + `ordering` (engine control) | 66 | 92.4% | 4 |

Corroboration that the interval reading is the intended one: the `interval` bucket
correctly answers the same *"How long had I been X when Y?"* construction
(4 of 5 correct), because it uses both events.

## 4. The fix (P0)

In `computeTemporalAnswer`, when a `relative` question names a second event **and** at
least two events were extracted, compute the elapsed time **between the two events**
instead of from the first event to the question date:

- new exported predicate, e.g. `hasSecondEventReference(question)` — a `when`-clause that
  introduces an event (`when I …`, `when the …`), tested against all 25 `relative`
  questions so the 19 single-event ones are provably untouched;
- `relative` + second event + ≥2 events → `intervalValue(events[0], events[1], unit)`;
- `relative` + second event + <2 events → return `null`, which falls back to the LLM
  temporal prompt rather than emitting a number that is wrong by construction;
- unit selection is unchanged (`relativeUnit`, already unit-tested).

**Out of scope (deliberately):** the two `other`-bucket questions
(*"How many weeks have I been taking sculpting classes when I invested in …"*, gold 3 vs 6;
*"How old was I when I moved to the United States"*, gold 27 vs abstain). They are a
classifier-coverage leak, a different mechanism, and one of the questions that construction
touches is currently **correct** — so folding them in would cost the A/B its clean
attribution. They get their own iteration.

## 5. Test plan (TDD, offline, no LLM, no network)

`computeTemporalAnswer` is pure, so every production failure can be replayed as a unit
test. The two event dates are **reconstructed exactly** from the observed wrong answer and
the gold (`tr_reconstruct_fixtures.py`):

> `answer = elapsed(A → questionDate)` ⇒ `A = questionDate − answer`
> `gold = elapsed(A → B)` ⇒ `B = A + gold`

| question (fragment) | qdate | A | B | observed | gold | B ≤ qdate |
|---|---|---|---|---|---|---|
| finished reading 'Evelyn Hugo' | 2023/02/10 | 2022/12/28 | 2023/01/15 | 44 | 18 | yes |
| started ukulele lessons | 2023/04/01 | 2023/02/01 | 2023/02/25 | 59 | 24 | yes |
| recovered from the flu (weeks) | 2023/10/15 | 2023/01/22 | 2023/05/07 | 38 | 15 | yes |
| launched my website | 2023/03/25 | 2023/03/01 | 2023/03/20 | 24 | 19 | yes |
| bought Adidas running shoes | 2023/02/03 | 2023/01/10 | 2023/01/24 | 24 | 14 | yes |
| attended a baking class | 2022/04/15 | 2022/04/10 | 2022/05/01 | 5 | 21 | **no** |

The fifth column is the self-check: `B` must fall on or before the question date. It holds
for 5 of 6. The one failure is a **different sub-bug** — there the `when`-clause identifies
the head event and the engine picked the modifier event instead, so the gold is
`elapsed(baking class → questionDate) = 21` while the engine used the cake date (5).
Interval routing leaves it wrong by a different amount; it cannot regress it (0/4 today).

Test obligations:

1. **Red first** — 5 tests reproducing the 5 production failures verbatim (question text,
   question date, two events), asserting the **gold** number, written before the fix and
   confirmed failing.
2. **Regression guard** — for every one of the 19 single-event `relative` questions the
   behaviour is bit-identical: a table test asserting `elapsed(A → questionDate)` is still
   returned. Also assert the two-event path is **not** taken when only one event is
   extracted (`computeTemporalAnswer` returns `null`).
3. **Unit coverage** — day / week / month, and both event orderings (the fix must be
   order-independent, since the LLM's listing order is not guaranteed).
4. Coverage ≥ 95% on **every** dimension (statements / branch / functions / lines), and
   `pnpm check` (lint, typecheck, test, format) plus `pnpm build` fully green.

## 6. Acceptance criteria for the benchmark

Same-instant 4+4 A/B, full 500 questions, `temperature=0`:

- **Primary (deterministic)**: the 6 two-event `relative` questions go from **0/6** to
  **≥5/6**. This endpoint has **no sampling variance** — the computation is deterministic
  and all 6 are stably wrong today, so a single run per arm measures it exactly.
- **Secondary**: TR accuracy and overall accuracy, reported as noise-floored descriptive
  estimates with the 4-run permutation test.
- **Guards (all must pass)**. The thresholds are **calibrated**, not zero — see
  §6.1. "0 regressions" sits below the benchmark's own noise floor and would
  reject a fix that changed nothing.
  1. ≤1 regression on the 19 single-event `relative` questions (currently 18/19);
  2. ≤0 regressions on `interval` and ≤3 on `ordering` (currently 61/66);
  3. no capability outside TR moves beyond its own run-to-run spread —
     IE / MR / KU / ABS;
  4. no rise in TR abstention.

### 6.1 Noise-floor calibration, measured before the treatment was read

`ab_turn` is a **temporal null**: its control (`183a3cc`) and treatment
(`db92e62`) differ only in the MR turn-recall channel, and both
`temporal-engine.ts` and `temporal.ts` are byte-identical between the two refs
(`git diff 183a3cc db92e62 -- packages/cortex-eval/src/temporal-engine.ts`
prints nothing). All 8 of its runs therefore share one temporal code path, so
**every** split of them into 4 vs 4 is a valid null comparison — 35 distinct
splits in all.

`tr_guard_noise_floor.py` enumerates all 35 and reports the worst regression
count each guard produced when nothing actually changed:

| group                  |   n | null max losses | null p95 | null max abs-delta |
|------------------------|-----|-----------------|----------|--------------------|
| **two-event relative** | **6** | **0**        | **0**    | **0**              |
| single-event relative  |  19 | 1               | 1        | 1                  |
| interval               |  26 | 0               | 0        | 1                  |
| ordering               |  40 | **3**           | 3        | 3                  |
| other/eventLookup      |  36 | 1               | 1        | 2                  |

Two conclusions, both of which change the criteria above:

- **The primary endpoint is noise-free.** Across all 35 null splits the
  two-event bucket never moved, by even one question. Each of the 6 questions
  returns the identical string on all 4 runs of an arm, so the majority-vote
  bucket is decided by arithmetic rather than by the vote. A movement of
  0/6 → 5/6 is therefore categorically **not** sampling noise.
- **"0 regressions" on `ordering` is unattainable.** A null comparison produced
  as many as 3. The original criterion was stricter than the benchmark is
  stable, and would have failed a fix that changed nothing. It is relaxed to
  the measured null maximum.

This calibration was computed on `ab_turn` **before** the #145 A/B was
downloaded, so it cannot be tuned to the result it is used to judge.

## 7. Scripts produced by this analysis

| script | purpose |
|---|---|
| `mr_filter_recheck.py` | re-runs the #144 diagnosis with the **production** answer parser |
| `mr_error_census.py` | MR error census: abstention / retrieval / enumeration / filtering |
| `mr_abstention_mechanism.py` | tests bare-abstention against context size and evidence density |
| `mr_distractor_load.py` | tests accuracy against distractor load and evidence share |
| `mr_counting_scope.py` | scoping check for deterministic item counting |
| `tr_census.mjs` | per-question TR census, classified with the **shipped** engine |
| `tr_error_analysis.py` | TR errors by temporal kind and error shape |
| `tr_two_event.py` | the two-event split that isolates the bug |
| `tr_other_bucket.py` | lists the questions the engine hands back to a prompt |
| `tr_reconstruct_fixtures.py` | reconstructs offline unit-test fixtures from production data |
