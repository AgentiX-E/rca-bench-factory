# Weak-Reader Competitor Gap Analysis — Hindsight 20B

**Question:** which competitors beat cortex with a *weaker* reader, and what is the
root cause of the gap — can we replicate it?

## 1. The only clear case: Hindsight 20B (and cortex already edges it)

| System | Reader | LongMemEval-S |
|---|---|---|
| Hindsight (OSS-120B) | 120B open | 89.0% |
| **Hindsight (OSS-20B)** | **20B open** | **83.6%** |
| **cortex (ours)** | **DeepSeek V4-Flash (13B active)** | **83.95%** |

So strictly, **no weak-reader competitor beats cortex overall** — Hindsight 20B is
the closest, and cortex is now ~0.35pp *above* it. But the per-category breakdown
reveals where Hindsight's architecture earns a lead that cortex does not.

## 2. The real gap is TR (temporal reasoning), not overall

Hindsight 20B per-category (paper Table 2) vs cortex (RRF baseline):

| Capability | Hindsight 20B | cortex | Δ |
|---|---|---|---|
| Multi-session (MR) | 79.7% | 79.55% | ~0 (tied) |
| Temporal (TR) | **79.7%** | **73.43%** | **−6.3pp** |
| Knowledge update (KU) | 84.6% | 81.25% | −3.4pp |

MR is a dead heat. The single largest replicable gap is **TR: Hindsight extracts
79.7% temporal accuracy from a 20B model, cortex only 73.43%** — a 6.3pp hole that
reader strength alone does not explain (both use modest readers).

## 3. Root cause: fact-level temporal intervals + a date-range retrieval channel

Hindsight's Tempr does NOT re-rank turns by date (which we tested and rejected).
It does two things cortex does not:

**Retain time (write path).** An LLM extracts *narrative facts* and normalizes each
fact's relative time ("last week", "in March") into an **absolute occurrence
interval [τ_s, τ_e]** — the date the *event happened*, not the date the *turn was
written*. This kills the exact failure we measured: "baking class I took …
yesterday" is assigned the event date (yesterday) rather than the turn's mention
date, so the `12:32`-timestamp and mention-vs-event ambiguity never arises.

**Recall time (read path).** A hybrid parser (fast dateparser + Flan-T5-small
fallback) turns the query's time expression ("two weeks ago", "last Saturday")
into a **date range [τ_start, τ_end]**, then matches `[τ_s, τ_e] ∩ [τ_start, τ_end] ≠ ∅`
as a **fourth, independent retrieval channel** (semantic + BM25 + graph + temporal),
fused by RRF and reranked by a cross-encoder.

This is a *filtering* channel over fact intervals, not a *re-ranking* of raw turns.

## 4. Why our earlier TR attempt was a negative result (and what was missing)

We implemented `reorderByDateProximity` — parse a single anchor date from the
question and re-rank *raw turns* by date proximity. It was REJECTED (TR n.s.,
−0.75/run) because:

1. It re-ranked by the turn's **mention date**, which is the wrong signal — the
   event date lives *inside* the turn text ("yesterday"), not in the turn header.
2. It had no **occurrence-interval** extraction: no fact-level [τ_s, τ_e] to match
   against the query range.

Hindsight's design fixes both, and it is exactly the part we did not build.

## 5. What cortex already has (so the fix is additive, not a rewrite)

cortex's `temporal-engine.ts` already contains the building blocks:
- `buildTemporalEventExtractionPrompt` (LLM extracts event dates from turns),
- `resolveTemporalDate` / `parseRelativeOffset` (relative → absolute date).

What is missing is the *retrieval* wiring Hindsight has:

| Piece | cortex | Hindsight |
|---|---|---|
| Fact-level event-date extraction | partial (TemporalEvent) | full narrative + interval |
| Relative-time → occurrence interval [τ_s, τ_e] | partial (`parseRelativeOffset` lacks "yesterday"/"last week"/"next month") | full |
| Date-range **filter channel** on TR recall | **absent** | **present (4th channel)** |
| RRF fusion of that channel | absent for time | present |

## 6. Replicable plan (P0, deterministic, TDD-able)

Mirror Hindsight's temporal channel, adapted to cortex's online per-question flow:

1. **Extend `parseRelativeOffset`** to cover `yesterday`, `last week/weekend`,
   `next month/year`, `N weeks/months ago`, `in February` — anchored to the
   *question date* (already available as `question_date`).
2. **`resolveTimeRange`**: question time expression → `[τ_start, τ_end]` date range
   (not a single anchor).
3. **TR recall filter**: for questions with a resolvable range, widen recall and
   boost/filter turns whose **extracted event date** falls inside the range —
   using the LLM event-date extraction already in `answerTemporal`, not the turn
   header date.

The prior negative result was the *re-rank by mention date* design. This is the
*filter by extracted event interval* design — the one that gives Hindsight its
+6.3pp TR lead. It deserves a fresh, mechanism-scoped A/B on the TR endpoint.
