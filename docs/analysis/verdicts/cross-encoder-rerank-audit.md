# Cross-Encoder Rerank — Deep Audit (P1)

**Date:** 2026-09-06
**Goal:** assess the feasibility and ROI of a cross-encoder rerank stage on top
of the RRF fusion just landed, under cortex's constraints (TS monorepo, DeepSeek
LLM + Zhipu embedding, no default local model runtime).

---

## 1. Why rerank exists (frontier evidence)

A bi-encoder retrieves for *recall* (right answer somewhere in top-K); a
cross-encoder reranks for *precision* (right answer at rank 1). NeuroLink's
benchmark (500 queries, RRF top-20 → top-5) is the cleanest public number:

| Strategy | Precision@5 | Latency | Cost/query |
| --- | --- | --- | --- |
| No rerank (RRF only) | 0.71 | 0 | $0 |
| Batch LLM (listwise) | 0.85 | 180ms | $0.0005 |
| LLM rerank (per-candidate) | 0.88 | 420ms | $0.002 |
| Cohere Rerank | 0.90 | 130ms | $0.001 |
| **Local cross-encoder** | **0.91** | 95ms | $0 (host) |

AgentOS (85.6% LongMemEval-S) ships a three-stage chain — local cross-encoder
(120→30) → Cohere (30→15) → LLM judge (15→5) — with graceful degradation.

## 2. cortex's current state

- **No rerank stage.** `retrieveSessionsForQuestion` (MR) and
  `retrieveTopKByQueries` (single-session) stop at RRF fusion + turn-recall
  append; `answerSessions` truncates the ordered hits directly into the prompt.
- **Already has a transformers.js seam.** `cortex-llm` ships
  `TransformersEmbedding` with a lazy `@xenova/transformers` import and an
  injectable pipeline factory — but it is a *feature-extraction* pipeline only;
  there is **no cross-encoder pipeline** and no reranker.
- **LLM interface is sufficient.** `complete` / `completeStructured` can run a
  listwise LLM-as-reranker with no new dependency.

## 3. Option trade-off

| Option | Precision | Cost | New dependency | Fit |
| --- | --- | --- | --- | --- |
| **Batch LLM listwise rerank** (DeepSeek scores the ordered candidate list in one call) | 0.85 | +1 LLM call / question (~3-4K tok) | none | ✅ reuses DeepSeek |
| LLM per-candidate rerank | 0.88 | +N LLM calls | none | ⚠️ costly |
| Local ONNX cross-encoder (Transformers.js) | 0.91 | model download 80-560MB + CPU inference | extend existing seam | ⚠️ heavy, new pipeline |
| Cohere Rerank API | 0.90 | per-call | new key | ❌ new vendor |

## 4. Honest ROI — this may be the wrong next target

Three facts argue for caution:

1. **RRF already captured most of the precision gain.** RRF lifted MR
   75.21% → 79.55% (+5.25/run) by fixing cross-channel fusion. Rerank is a
   *second* precision pass on top of an already-fused ordering — its marginal
   gain is smaller than the first pass.
2. **LongMemEval-S MR is mostly single-fact.** The NeuroLink +0.14-0.20 lift is
   measured on a hard technical corpus with negation/collision problems; the
   benchmark's MR counting/aggregation questions have less of that pathology
   (the DCG negative result already showed multi-evidence tricks don't transfer).
3. **TR is the bigger open gap.** TR sits at 73-75% vs HydraDB's 90.97% — a
   ~15pp hole that rerank does not address (it is a temporal-graph / time-aware
   retrieval gap, not a precision gap).

**Verdict:** cross-encoder rerank is a *real but second-order* lever here. Its
highest-confidence form (local ONNX) conflicts with cortex's zero-local-model
philosophy and adds a 80-560MB download + CPU inference to the benchmark; its
cheapest form (batch LLM listwise) is a ~0.85-precision heuristic that likely
buys ≤+1-2pp MR and costs +1 LLM call per question.

## 5. Recommendation (P0 → P2)

| # | Move | Rationale |
| --- | --- | --- |
| **P0 (recommended instead)** | **Time-aware / temporal-graph retrieval for TR** — wire cortex-core's existing bitemporal facts + associative graph into the TR retrieval path | attacks the ~15pp TR gap (the largest single hole), uses primitives cortex already owns |
| P1 | **Batch LLM listwise rerank** (MR only), gated behind a small A/B first | cheap, no new dependency; only if a probe shows MR precision@k is the binding constraint |
| P2 | Local ONNX cross-encoder via the existing transformers seam | highest precision, but a heavier dependency + model download; defer until P0/P1 are exhausted |

If the user still wants rerank before temporal retrieval, the concrete P1 spec
is: add `rerankSessions(query, hits, llm)` returning the hits re-ordered by a
single listwise DeepSeek call; insert it between `retrieveSessionsForQuestion`
and `answerSessions`; TDD with a listwise-ranking unit test + a mutation test
(deleting the rerank must fail); A/B on the MR mechanism endpoint.

---

**No code changed this iteration.** This is an audit only — the recommendation
is to redirect the next iteration to TR temporal retrieval, where the measurable
gap is largest.
