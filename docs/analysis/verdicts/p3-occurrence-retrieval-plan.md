# P3 — Fact-Level Occurrence Retrieval (Hindsight Tempr full replication)

Status: **root-caused from the P2 negative result; phased plan below**

## 1. The P2 negative result, read precisely

P2 appended in-window turns by **header date** (the turn's `[YYYY/MM/DD]` prefix =
the date the user MENTIONED the event). That signal is wrong for temporal
questions, which ask when the event OCCURRED. Two damaged questions make this
exact:

**sports event** (question "two weeks ago", question date 07/01 → target 06/17):
- correct `charity soccer tournament`: turn says "participate … **today**" (06/17) → occurrence 06/17
- distractor `Midsummer 5K Run`: turn says "**just finished** … at the Midsummer 5K Run" (06/10) → occurrence 06/10

Both header dates (06/17 and 06/10) fall inside the ±7-day window, so P2 appended
both and the LLM picked the wrong one. The discriminating signal is the
**occurrence date**, not the mention date — exactly Hindsight's
fact-level occurrence interval `[τ_s, τ_e]`.

## 2. What P3 adds over P1/P2

| layer | P1 (done) | P2 (reverted) | **P3** |
|---|---|---|---|
| signal | relative-time anchor | header date window | **occurrence date** |
| where | deterministic answer only | recall | **recall** |
| granularity | one event per question | whole turn | **fact-level (event + date)** |

P3 extracts, for each candidate turn, the **event it states and its occurrence
date** (normalizing "today"/"yesterday"/"just finished"/"last week" against the
turn date — the P1 anchor mechanism, now applied to recall). It then matches the
question's `resolveTimeRange` window against the **occurrence date**, not the
header date, so an in-window MENTION of an out-of-window event no longer pollutes
the context.

## 3. Phased plan

### P3a — occurrence-date recall arm (this iteration)

1. `buildOccurrenceExtractionPrompt` + schema: from a turn's evidence window,
   extract `{ name, date }` where `date` is the event's OCCURRENCE date
   (relative times normalized to the turn date; a turn stating no event is
   omitted).
2. `extractOccurrenceDates`: call the extractor over the recalled candidate pool
   (widen to 2×topK), return a turn-index → occurrence-date map.
3. In `retrieveTurns` (timeRange path), append a turn only when its **occurrence
   date** falls inside the window (fall back to header date when no occurrence is
   extracted). Keep the append-only, no-re-rank contract; the abstention signal
   stays `hits[0]`.
- **Cost:** one structured LLM call per time-anchored TR question (~14 anchored
  eventLookup questions × 4 runs; bounded, not a full Retain pass).
- **A/B:** TR eventLookup endpoint + guards. Expect to recover the 2 damaged
  questions WITHOUT re-introducing the distractor, and to keep the 3 P2 recoveries.

### P3b — MemoryGraph spreading-activation arm

Build a per-question entity graph from the extracted facts (co-occurring
subjects/objects strengthen edges), add `spreadingActivation` as a recall arm
RRF-fused with semantic + lexical + occurrence. Targets multi-hop MR and TR
questions where the answer entity is one hop from the question entity.

### P3c — cross-encoder rerank (last, only if P3a/P3b under-deliver)

Local ONNX cross-encoder or LLM-as-reranker over the fused top-k. The prior
cross-encoder audit rated this the heaviest signal but the heaviest dependency;
do it only after the cheaper arms are measured.

## 4. Go/no-go per phase

Each phase is a same-instant 4v4 A/B on the TR mechanism endpoint. A phase is
accepted only if the TR endpoint moves by a real effect with exact-permutation
p ≤ 0.05 and guards stay flat; otherwise it is reverted and the next phase is
re-evaluated on its own evidence. The honest prior: single arms have repeatedly
landed below the noise floor, so a phase that only recovers 2–3 questions may be
mechanism-real but statistically invisible — in that case the SCIENTIFIC answer
is "the signal is real but sub-noise", recorded, and the combination (P3a+P3b)
is tested as a whole before any SOTA claim.
