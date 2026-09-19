# Fact-Level Temporal Retrieval — Deep Audit + Phased Plan

**Goal:** close the 6.3pp TR gap (cortex 73.43% vs Hindsight 20B 79.7%) by
replicating Hindsight's Tempr: fact-level occurrence intervals + a date-range
retrieval channel + graph retrieval.

## 1. The precise gap is wiring + a missing "occurrence" concept, not invention

cortex-core ALREADY owns Hindsight's core primitives, unused by the benchmark:

| Hindsight Tempr | cortex-core (has it?) | benchmark TR path (uses it?) |
|---|---|---|
| fact-level occurrence interval [τ_s, τ_e] | **Fact.validFrom/validUntil** ✅ | ❌ raw turns only |
| graph retrieval (spreading activation) | **MemoryGraph.spreadingActivation** ✅ | ❌ |
| temporal edges | **EdgeKind.temporal** ✅ | ❌ |
| cross-encoder rerank | ❌ | ❌ |

So this is a *wiring* gap. Two concepts are missing from the benchmark:

1. **Occurrence date vs mention date.** `ExtractedFact.date` (KU) and
   `TemporalEvent.date` (TR) both copy the **turn date** — the date the fact was
   *written*. Hindsight extracts the **occurrence interval** — the date the event
   *happened* ("yesterday" → turn date − 1). This is the exact failure we
   measured: "baking class I took … yesterday" gets the mention date, not the
   event date.
2. **A date-range retrieval channel.** We added `resolveTimeRange` (question
   time qualifier → [start, end]) but only feed it to the event-lookup *prompt*,
   not to a *recall channel* that filters/boosts turns by date.

## 2. Constraint: online per-question architecture, no Retain stage

Hindsight's Retain step pre-extracts narrative facts with occurrence intervals
*offline*, then Recall just matches intervals. cortex answers each question
online from raw sessions, so any fact-level interval must be extracted either
per-question (LLM cost) or via a new index step (architecture change).

## 3. Phased plan (incremental → systematic), each phase with a go/no-go

### P1 — Extract the occurrence date, not the mention date (TR deterministic path)

`buildTemporalEventExtractionPrompt` currently says "copy that turn's date". Change
it to report the **event's date**, resolving relative time ("yesterday", "last
week") against the turn date — deterministically, not by LLM arithmetic.

- **Why first:** it fixes the root signal, and is the smallest change.
- **Cost:** zero extra LLM calls (same extraction, different instruction).
- **TDD:** prompt contract asserts the instruction asks for the event date and
  resolves relative references; unit test `computeTemporalAnswer` with an
  event whose date is "yesterday" → deterministic offset.
- **Mechanism A/B:** TR relative/interval/ordering endpoints.
- **Go/no-go:** proceed to P2 regardless (this is a pure correction); measure the
  event-date delta directly.

### P2 — Date-range recall channel (filter, not re-rank)

Add a temporal arm to TR recall: widen candidate turns, then **filter** to turns
whose header date falls inside `resolveTimeRange`'s window (with a margin for the
mention-vs-occurrence skew). Fuse by RRF — never by re-ranking, which was the
prior negative result.

- **Why after P1:** P1 makes the *extracted* date correct; P2 makes the *recalled*
  set date-correct.
- **Cost:** zero extra LLM calls (header-date parsing is deterministic).
- **TDD:** date-range filter unit tests + negative controls (non-TR paths unchanged)
  + a mutation test (remove the filter → test fails).
- **Mechanism A/B:** TR eventLookup + relative endpoints; IE/MR/KU/ABS guards.
- **Go/no-go:** if TR accuracy does not move, stop — the gap is then reader-side,
  not recall-side.

### P3 — Wire cortex-core Fact + MemoryGraph into TR (systematic)

Add a lightweight per-benchmark **index step** (Retain equivalent): extract
`ExtractedFact`-style facts with occurrence intervals, build a `MemoryGraph`
(entity links + temporal edges), and recall TR questions via
`spreadingActivation` + date-range match + semantic + BM25, RRF-fused.

- **Why last:** it is the largest change and only pays off if P1/P2 show the
  temporal axis is load-bearing.
- **Cost:** one indexing pass over sessions (bounded by a sample).
- **TDD:** indexer + graph construction + spreading-activation recall unit tests;
  ≥95% coverage.
- **Mechanism A/B:** TR overall + MR (graph may help multi-hop); guards.

## 4. Honest ROI read

P1/P2 are cheap and target the measured root signal, but single deterministic
patches have repeatedly landed below the noise floor. P3 is the only change that
can plausibly recover most of Hindsight's 6.3pp, because it supplies the
fact-level intervals and graph traversal the online path cannot cheaply derive.
