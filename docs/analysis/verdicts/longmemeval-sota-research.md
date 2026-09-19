# LongMemEval-S SOTA Landscape — Research Note

**Date:** 2026-09-06
**Our current:** **83.50%** overall (master `a45b32a`, DeepSeek LLM + Zhipu GLM embedding-3)

---

## 1. Where we stand

LongMemEval-S overall accuracy (full N=500), published systems:

| System | Overall | Reader |
| --- | --- | --- |
| Claude Opus 4.6 | 95.6% | Claude Opus |
| GPT-5-mini / Sonnet 4.5 / Haiku 4.5 | 94.0–94.2% | GPT/Claude |
| GPT-4o (raw reader) | 92.6% | GPT-4o |
| Hindsight | 91.4% | Gemini 3 Pro |
| HydraDB | 90.79% | Gemini 3.0 Pro |
| Emergence | 86.0% | GPT-4o |
| AgentOS | 85.6% | GPT-4o |
| Supermemory | 85.2% | Gemini 3 Pro |
| Mastra OM | 84.23% | GPT-4o |
| **cortex (ours)** | **83.50%** | **DeepSeek** |
| EmergenceMem Simple | 80.6% | GPT-4o |
| Original paper GPT-4o Oracle | 82.4% | GPT-4o (gold sessions only) |
| Original paper full-context | 63.8% | GPT-4o |

**Position:** above the original paper's *Oracle* baseline (82.4%, which is given the
gold answer sessions), and within ~0.7–1.7pp of Mastra/Supermemory — **while using a
weaker reader (DeepSeek) than every system above us.** That is a strong result.

## 2. The gap is reader + retrieval, not prompt tweaks

The systems above us split into two levers:

1. **Reader model.** Claude/GPT-5/Gemini readers add ~6–12pp over a GPT-4o-class
   reader on the same architecture. We are constrained to DeepSeek, so this lever is
   mostly closed to us.
2. **Retrieval architecture.** The open-source frontier methods are explicit about it:
   - **EmergenceMem (86%)**: turn-level retrieval, then **NDCG session scoring** +
     **cross-encoder reranking** — the whole *session* is retrieved from turn ranks,
     not a centroid embedding.
   - **AgentOS (85.6%)**: "canonical-hybrid retrieval" + a **per-category reader
     router** (different reader config per capability).
   - **HydraDB (90.79%)**: time-aware versioned graph + dual-key indexing +
     hybrid BM25/dense + query expansion.

The common thread: **turn-granularity retrieval with reranking and category-aware
routing**, not single-shot centroid similarity.

## 3. Our per-capability gap (vs the paper's best per-category figures)

| Capability | ours | paper best | gap |
| --- | --- | --- | --- |
| IE (single-session) | 94.83% | ~95–100% | small |
| KU (knowledge update) | 78.47% | 96.2% | large |
| MR (multi-session) | 76.65% | 84.2% | large |
| TR (temporal) | 75.79% | 87.2% | large |
| ABS | 99.17% | ~100% | none |

(Category boundaries differ across published tables, so treat per-category deltas as
indicative, not exact.)

## 4. What this means for the next iteration

We already have some frontier components (turn-level recall channel, hybrid retrieval,
query expansion). The remaining, highest-leverage gap is **turn-granularity retrieval
quality with reranking/session-scoring** — exactly the axis that drives MR and TR,
which are our two largest category gaps and where the remaining errors are
retrieval/extraction-quality rather than deterministic arithmetic (as the previous
audit showed).

**Recommendation (next iteration):** deep-audit our MR/TR retrieval stack against the
two concrete frontier techniques —
1. **NDCG-style session scoring** (score a session by its turns' ranks, not its
   centroid embedding), and
2. **reranking / turn-dedup** before context assembly —

then A/B the highest-leverage one on the MR/TR mechanism endpoints. This is a
retrieval-architecture iteration, not another single-question prompt fix.
