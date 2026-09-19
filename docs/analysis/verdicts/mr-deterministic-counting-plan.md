# MR aggregation: kill the Step-2 re-derivation

Iteration #144. Supersedes the retrieval work in #143 — the A/B there showed
retrieval is no longer the MR bottleneck.

## 1. Where MR accuracy leaks now

From the same-instant 4+4 A/B in #143 (full 500-question dataset, temperature 0):

| | control | treatment |
|---|---|---|
| evidence recall | 94.0% | **97.2%** |
| MR accuracy | 72.11% | **74.59%** |
| wrong answers whose evidence is already COMPLETE | 18/29 (62.1%) | **22/27 (81.5%)** |

The turn-recall channel converted 6 questions from retrieval-limited to
aggregation-limited. **81.5% of what remains is an aggregation/extraction failure,
not a retrieval failure**, so more retrieval work has low ROI.

Breakdown of the 22 wrong-but-complete-evidence questions:

| bucket | n |
|---|---|
| counting questions | 18 |
| derivation questions | 2 |
| lookup questions | 2 |
| of which abstained | 7 |

## 2. The failure mechanism

The aggregation prompt is a two-step CoT: Step 1 enumerates items, Step 2 produces
the answer. But Step 1's output is **scaffolding only** — `parseAggregationAnswer`
reads the `Answer:` line and discards the enumeration. Step 2 does not count
Step 1's list; it **re-derives the list from scratch**, and items vanish:

| question | gold | Step 1 listed | answered |
|---|---|---|---|
| How many plants did I acquire in the last month? | 3 | 3 | 2 |
| How many items of clothing do I need to pick up or return? | 3 | 3 | 2 |
| How many tanks do I currently have? | 3 | 3 | 2 |
| How many music albums or EPs have I purchased? | 3 | 3 | 2 |

8 of 16 wrong counting questions show this signature (Step 1 listed >= gold, final
answer lower). Of those 8, four are stably wrong in all 4 runs and three are flaky
(1-2/4), so the addressable prize is ~4-5 questions.

**The prompt already says "do NOT re-filter or exclude any of them" and is
ignored.** More prompt wording on the same two-step shape is therefore not the
fix; the fix has to be structural.

## 3. Fixes, chosen so their affected question sets are disjoint

### P0 — aggregation-kind misrouting (deterministic bug)

`classifyAggregationKind` matches `how much (?:more|less|faster|earlier|older)` but
not a quantity expressed in units, so **"How many years older is my grandma than
me?"** is routed to the *enumeration* prompt. A difference question has no items to
enumerate, so the model emits a bare `UNANSWERABLE` — an automatic zero.

Two MR questions hit this. Both have complete evidence in context (2/2 sessions)
and gold answers (43, 7); both scored 0/4 in every run.

### P1 — deterministic item counting (kills the re-derivation)

Emit one structured record per item, each carrying an explicit inclusion verdict,
and compute the count **in code**. Dedup and the qualifier decision become explicit
per-item decisions instead of a second free-form pass, so an item can no longer
disappear silently.

P0 touches only questions whose classification changes (2). P1 touches only
enumeration questions where structured extraction succeeds. **The two populations
are disjoint and identifiable in advance, so one A/B attributes both.**

## 4. Acceptance criteria

- **TDD**: tests written first, failing before the implementation.
- **Coverage** >= 95% on every dimension (statements / branch / functions / lines).
- `pnpm check` green (lint, typecheck, test, format); `pnpm build` clean.
- **Same-instant A/B**, 4 runs per arm, full 500 questions, temperature 0.
  Staggered comparison is invalid — abstention drifts with collection time.
- **Endpoints**, reported per bucket and never pooled:
  - P0 bucket (2 questions): abstention -> answered, correctness.
  - P1 bucket (enumeration questions): accuracy, plus the
    "Step 1 listed >= gold but answered < gold" count must shrink.
- **Guards**: non-MR null effect; no accuracy regression on MR questions neither
  path touches; abstention must not rise; no new malformed answers.
- Commit as `Lambertyan`, English comments / docs / commit message.

## 5. Out of scope

- Summing questions ("how much money in total") fail by *missing* items in
  enumeration, which neither fix addresses; they stay on the existing path.
- Derivation questions beyond the P0 routing gap.
