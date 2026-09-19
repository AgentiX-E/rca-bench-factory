# TR Time-Aware Retrieval — Deep Audit (P0)

**Date:** 2026-09-06
**Goal:** decide whether wiring time-aware/graph retrieval into the TR path can
close the 73-75% vs HydraDB-90.97% gap, and if so, how.

---

## 1. The architecture gap (measured)

cortex-core ships the primitives — `temporal/bitemporal.ts` (`currentFacts`,
`currentValue`, `findContradictions`), `graph/memory-graph.ts` (`MemoryGraph`,
`spreadingActivation`, `EdgeKind` temporal/causal/semantic), `domain/fact.ts`
(bitemporal `Fact`) — but **the benchmark system does not use them**.
`NaturalLanguageMemorySystem` imports only `EmbeddingModel, JsonSchema, LLM` from
cortex-core and runs its own `temporal-engine.ts` (deterministic date arithmetic)
+ embedding/lexical retrieval. The two layers are disconnected.

## 2. TR failure census (RRF-landed treatment, 34 distinct wrong questions)

Three modes, with very different susceptibility to time-aware retrieval:

| Mode | ~count | Examples | Time-aware retrieval helps? |
| --- | --- | --- | --- |
| **Event ordering** (order/earliest/latest/first) | ~13 | "order of the three trips", "order of six museums", "who did I meet first", "Rachel or Alex first" | ✅ **yes** — needs time-window recall + date-ordered context, not semantic recall |
| **Event identification** (time anchor → which event) | ~9 | "gardening activity two weeks ago", "Met museum two weeks ago", "road bike vs mountain bike last weekend" | ✅ **yes** — needs to recall the turn at the *anchor date*, not the semantically-nearest turn |
| **Duration arithmetic** (days/weeks/months) | ~12 | "38 days", "21 days", "15 weeks", "7 days" | ⚠️ **partial** — already served by the deterministic engine; residual is date-extraction ambiguity ("received feedback" 03/17 vs 03/18), not retrieval |

So ~22 of 34 wrong questions (order + identification) are genuinely
retrieval-shaped, not LLM-semantics-shaped. This is the opposite of the MR and
cross-encoder findings — **here time-aware retrieval IS the right lever.**

## 3. Root cause

The TR path retrieves by **semantic + lexical similarity**, then hands the LLM a
**score-ordered** window of turns. But event-order and event-identification
questions need a **time-ordered** window over the anchor interval:

- "order of three trips in the past three months" → must recall *all three* trips
  and present them **chronologically**; semantic recall may miss one or present
  them out of order.
- "gardening activity two weeks ago" → must recall the turn at **question_date −
  14d**, not the semantically-closest turn about gardening (which may be a
  different date).

cortex already prefixes each turn with `[YYYY/MM/DD]`, so the dates ARE in the
context — the problem is the *ordering and the windowing*, which are currently
embedding-score-driven, not time-driven.

## 4. Concrete fix (deterministic, TDD-able)

For temporal questions, after recall, re-rank the retrieved turns by **date
proximity to the question's time anchor** instead of (or in addition to) embedding
score, and for event-order questions, order the injected context **by date**.

Three deterministic pieces (no new model, no graph runtime):

1. **Time-anchor parser** — extract the anchor from the question ("two weeks ago",
   "last Saturday", "past three months", "in February") into a date window
   `[from, to]` relative to `question_date`. Reuse/extend the existing
   `parseRelativeOffset` in `temporal-engine.ts`.
2. **Time-window recall** — when a TR question has an anchor, recall turns whose
   date falls in the window first (or boost them), so the anchor-date turn beats
   the semantically-nearest-but-wrong-date turn.
3. **Chronological context** — for `order/earliest/latest/first` questions, sort
   the injected evidence turns by date before truncation.

These are all pure functions over `(question, question_date, turns-with-dates)`
→ ordered turns — the same deterministic philosophy as `computeTemporalAnswer`,
and they operate on the dates cortex already extracts.

## 5. Plan (P0 → P2)

| # | Move | Scope |
| --- | --- | --- |
| **P0** | Add a deterministic **date-anchored re-rank** to the TR retrieval path: parse the time anchor, sort/boost the retrieved turns by date proximity, and present event-order evidence chronologically | the ~22 order/identification questions |
| P1 | Wire cortex-core's `MemoryGraph` temporal edges as an *optional* recall channel for TR (only after P0 is A/B-validated) | graph spreading-activation over temporal edges |
| P2 | Revisit duration-arithmetic extraction (the "yesterday"/"next year" relative-offset inside turns) | the ~12 duration questions, lower ROI |

## 6. TDD spec (P0)

- Time-anchor parser: unit tests for "N weeks ago", "last <weekday>", "past N
  months", "in <month>", "a couple of days ago" → `[from, to]`.
- Date-anchored re-rank: a turn at the anchor date outranks a semantically-close
  turn at a different date; event-order questions return turns date-ascending.
- Negative control: non-temporal questions are unchanged (no date re-rank).
- Mutation test: deleting the date re-rank must fail a discriminating test.
- Coverage ≥95% four dimensions; `pnpm check` green; same-instant 4v4 A/B on the
  TR mechanism endpoint (order/identification accuracy + abstention), exact
  permutation p≤0.05, IE/MR/KU/ABS guards n.s.
