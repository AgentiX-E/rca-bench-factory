# Retrieval Fusion & Rerank — Deep Audit (P0)

**Date:** 2026-09-06
**Goal:** close the fusion gap vs the frontier (Hindsight / AgentOS / HydraDB /
AutoMem) that the SOTA landscape report identified as cortex's highest-leverage
missing ingredient.

---

## 1. What cortex does today (measured, not assumed)

cortex fuses retrieval signals in **four places**, and none of them is reciprocal
rank fusion (RRF):

| Site | Function | Current fusion | Problem |
| --- | --- | --- | --- |
| Session multi-query | `retrieveByQueries` | keep **max** score per session | discards the "hit by several queries" signal |
| Turn multi-query | `retrieveTopKByQueries` | keep **max** score per turn | same |
| Turn recall | `retrieveSessionsByTurns` | keep **max** turn cosine per session | single-channel; max reduction already known to underperform for multi-evidence (DCG negative result) |
| **MR entry point** | `retrieveSessionsForQuestion` | base + expanded merge by **max**; turn recall **APPENDED** | cross-channel scores are not comparable, so the strongest turn-recall session is forced to the tail |
| Single-session hybrid | `retrieveTopKByQueriesHybrid` | **lexical-first cascade**: keyword turns take the first `MAX_LEXICAL_HITS` slots, semantic fills the rest | not a rank fusion; lexical "score" (match count) and semantic cosine live in different units |

The code itself documents the core defect (`retrieveSessionsByTurns`, ~line 481):

> "the returned scores are turn cosines and are NOT comparable to the centroid
> cosines … Callers must therefore merge by rank … rather than sorting on the raw
> number."

Yet the MR entry point does **not** merge by rank — it appends, so a turn-recall
session that is the true evidence (rank 1 in its channel) is placed after every
centroid session, including distractors.

## 2. What the frontier does

RRF fuses N independent ranked lists into one:

```
RRF(d) = Σ_{channel c} 1 / (k + rank_c(d)),  k = 60 (standard)
```

Every channel votes with its *rank*, not its raw score, so channels with
different score scales (centroid cosine vs turn cosine vs lexical match count)
become comparable. Hindsight runs four channels (vector/BM25/graph/temporal) and
RRF-fuses them; AutoMem/AgentOS/HydraDB all RRF-fuse BM25 + dense before rerank.

## 3. Root cause — one sentence

**cortex's retrieval channels are rank-fused nowhere; they are either max-reduced
(which throws away multi-channel agreement) or appended (which demotes the
turn-recall channel that the strongest evidence relies on).**

This is a pure-function, zero-dependency, TDD-able fix — the cleanest kind of P0.

## 4. Cross-encoder rerank — feasibility in this codebase

cortex is a TypeScript monorepo with **no local model runtime** (embeddings and
LLM are remote APIs). A cross-encoder therefore has three options:

| Option | Cost | Risk | Verdict |
| --- | --- | --- | --- |
| Local ONNX cross-encoder | model download + runtime | high (new dependency, build size) | ❌ not this iteration |
| LLM-as-reranker (DeepSeek scores each candidate) | +1 LLM call/query × top-k | medium (cost + latency, but Hindsight ships exactly this) | ⏸ defer, evaluate after RRF lands |
| Embedding-pair rerank (`[q, d]` concat → embed → score) | +1 embed/candidate | low but weak signal (Zhipu is a bi-encoder, not a cross-encoder) | ⏸ not a true cross-encoder |

**Decision:** this iteration implements **RRF fusion only** (pure, low-risk, high
signal). Cross-encoder rerank is the follow-up P1 — it is a larger change with a
real dependency/cost decision, and it should ride on top of RRF, not instead of
it.

## 5. P0 plan (this iteration)

1. Add `reciprocalRankFusion<T>(rankedLists: T[][], k = 60): T[]` — a pure
   function that takes per-channel *ranked* lists (best-first) and returns items
   ordered by descending RRF score, de-duplicated by identity.
2. Rewire the **MR entry point** (`retrieveSessionsForQuestion`) to RRF-fuse the
   three channels (centroid base, expanded queries, turn recall) by rank instead
   of max-merge + append.
3. Rewire the **single-session hybrid** (`retrieveTopKByQueriesHybrid`) to
   RRF-fuse the lexical and semantic ranked lists instead of the lexical-first
   cascade.

## 6. Test plan (TDD, red → green)

- `reciprocalRankFusion`: unit tests for empty lists, single list, de-duplication,
  rank-weighting (a doc ranked 1 in one channel beats a doc ranked 2 in two
  channels for chosen k), determinism.
- MR entry point: a session ranked 1 in the turn-recall channel must NOT be
  demoted below centroid-only distractors; multi-channel agreement must raise a
  session above a single-channel peer.
- Hybrid: lexical and semantic votes fuse; a turn with both a rare keyword and a
  high cosine outranks a turn with only one.
- **Mutation test**: deleting the RRF weighting (reverting to max) must fail a
  discriminating test.
- Negative control: counting questions still route to enumeration (unchanged).

## 7. Acceptance

- Coverage ≥95% on all four dimensions (statements/branch/functions/lines).
- `pnpm check` + `pnpm build` green (zero skips).
- Same-instant 4v4 A/B on MR/TR mechanism endpoints (abstention rate, per-question
  correct), exact permutation p≤0.05, IE/KU/ABS guards n.s., attribution residual 0.
- Commit as `Lambertyan` with English comments/docs/message.
