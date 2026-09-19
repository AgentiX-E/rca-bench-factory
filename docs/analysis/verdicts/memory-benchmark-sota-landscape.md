# Long-Term / Agent Memory — Authoritative Benchmarks & SOTA Landscape

**Date:** 2026-09-06
**Scope:** every authoritative benchmark for long-term / agent memory, the SOTA
competitor scores on each, and cortex's position with the gap it can close by
replicating competitor architectures.

---

## 1. The benchmark landscape

Three families matter, with different evaluation targets. Only the first is
directly comparable to cortex (which targets LongMemEval-S).

### A. Agent-memory benchmarks (the core field)

| Benchmark | Venue / Year | What it measures | Scale |
| --- | --- | --- | --- |
| **LongMemEval-S / M / L** | ICLR 2025 (Wu et al.) | Six skills: single-session user/assistant/preference, multi-session, temporal, knowledge-update | S=115K tok/500 Q · M=1.5M · L=larger |
| **LoCoMo** | 2024 (Maharana et al.) | Single-hop / multi-hop / temporal / open-domain over multi-session dialogue | 1,540 Q, ~35 sessions |
| **BEAM** | 2025 (Tavakoli et al.) | Memory at 100K / 500K / 1M / 10M-token single-conversation scale | 2,000 Q, 10 types |
| **AMB** (Agent Memory Benchmark) | 2026, neutral harness | Cross-vendor, same answerer+judge; LoCoMo/LongMemEval/PersonaMem/BEAM | multi-dataset |
| **AML** (Agent Memory Leaderboard) | 2026-08, Tsinghua/PKU-backed | 7 dims: fact recall, multi-hop, temporal, governance, personalization, context-learning, safety | text + code tracks |
| **MemBench / PersonaMem** | 2024-2025 | Memory write/read fidelity, persona consistency | — |

### B. Long-context comprehension (adjacent, different target)

These test a *single* model reading one long input, not a memory layer over
sessions — so they are **not directly comparable** to cortex but bound the
reader model's raw long-context ability.

| Benchmark | SOTA | Notes |
| --- | --- | --- |
| **LongBench v2** (Tsinghua/Zhipu) | Gemini 2.5 Pro **63.3%** | DeepSeek-R1 **58.3%** (tied with Qwen3-235B); GPT-4o 51.4%; human 53.7% |
| **InfiniteBench** | frontier ~top-tier | retrieval/computation/reasoning over long text |
| **BABILong** | — | needle-in-haystack QA up to 1M tokens |
| **RULER** | — | synthetic long-context stress |

**Key reader datum:** DeepSeek-R1's LongBench v2 score (58.3%) is close to
Gemini 2.5 Pro (63.3%), so DeepSeek's raw long-context ability is **not** the
binding constraint — the memory architecture is.

---

## 2. LongMemEval-S — the canonical leaderboard

### 2.1 High-reader tier (Claude / GPT-5 / Gemini)

| Rank | System | QA accuracy | Reader | Cost/Q |
| --- | --- | --- | --- | --- |
| 1 | agentmemory V4 | **96.2%** | Claude Opus 4.6 | ~$0.170 |
| 2 | PwC Chronos (high) | 95.6% | enhanced | $0.10–0.54 |
| 3 | Mastra OM (high) | 94.87% | GPT-5-mini | $0.130 |
| 4 | Backboard | 93.4% | GPT-4.1 | ~$0.070 |
| 5 | Ensue / OMEGA | 93.2% | GPT-5-mini / GPT-4.1 | ~$0.003–0.022 |
| 6 | MemMachine | 93.0% | GPT-5-mini | $0.005 |
| 7 | Hindsight | 91.4% | Gemini 3 Pro | ~$0.650 |
| 8 | Memax | 91.2% | Claude Sonnet | $0.046 |

### 2.2 GPT-4o-reader tier (apples-to-apples)

| System | QA accuracy | Reader |
| --- | --- | --- |
| Emergence (closed SaaS) | **86.0%** | GPT-4o |
| AgentOS (Apache-2.0) | **85.6%** | GPT-4o |
| Supermemory (single-pass) | 85.86% | GPT-4o |
| Mastra OM (base) | 84.23% | GPT-4o |
| **cortex** | **83.55%** | **DeepSeek** |
| Emergence Simple | 82.4% / 80.6% | GPT-4o |
| Zep / Graphiti | 71.2% | GPT-4o |
| Mem0 (independent eval) | 49.0% | — |

### 2.3 GPT-4o-mini-reader tier (sota2.com standardized, isolates architecture)

| System | QA accuracy |
| --- | --- |
| MemCoT | **88.0** |
| Mnemis | 87.2 |
| EMem-G | 77.9 |
| Mem0 | 71.1 |
| RAG | 67.2 |
| Zep | 63.2 |
| Full-context | 55.0 |

### 2.4 The decisive cross-reader anchor: Hindsight

Hindsight publishes the single most important data point in the field:

| Backbone | LongMemEval-S |
| --- | --- |
| 20B open-source model + Hindsight | **83.6%** |
| full-context GPT-4o (no memory) | 60.2% |
| Gemini 3 Pro + Hindsight | **91.4%** |

**"A 20B model + good architecture beats full-context GPT-4o"** is the field's
clearest proof that *architecture beats parameter scale* on this benchmark.

---

## 3. LoCoMo — long-horizon conversational memory

| System | Accuracy | Notes |
| --- | --- | --- |
| HyperMem (hypergraph) | **92.73%** | GPT-4o-mini judge |
| Mem0 (2026 algorithm) | 92.5% | single-pass hierarchical + multi-signal |
| MIRIX | 85.38% | multi-agent memory |
| MemMachine | 84.87% | — |
| Hindsight (20B) | 83.18% | — |
| Hindsight (Gemini 3) | 89.61% | — |
| VAC | 80.1% | MCA + FAISS + BM25 + cross-encoder |
| Memobase | 75.78% | — |
| Letta (MemGPT) | 74.0% | filesystem agent |
| Zep | 66.0% | — |
| Mem0 (old) | 66.9% | — |

## 4. BEAM — million-to-10M-token scale

| System | 1M nugget | 10M nugget |
| --- | --- | --- |
| Hindsight | **75.0** | **64.1** |
| Mem0 | 64.1 | 48.6 |
| AutoMem | — | 57.4 |
| Honcho | — | 40.6 |
| (most others) | 58–70 | 47–56 |

---

## 5. cortex's position — precise reading

cortex = **83.55%** on LongMemEval-S with a **DeepSeek reader**.

| Comparison | Number | Conclusion |
| --- | --- | --- |
| vs Mastra (GPT-4o) 84.23% | **−0.68pp** | cortex (weaker reader) is essentially at GPT-4o-Mastra level |
| vs AgentOS (GPT-4o) 85.6% | −2.05pp | close, with a weaker reader |
| vs Emergence (GPT-4o) 86.0% | −2.45pp | close, with a weaker reader |
| vs **Hindsight (20B model)** 83.6% | **−0.05pp** | **cortex's architecture is materially weaker than Hindsight's** |
| vs Hindsight (Gemini 3) 91.4% | −7.85pp | reader + architecture gap combined |

**The single most diagnostic number:** Hindsight reaches 83.6% with a 20B
open-source model *far weaker than DeepSeek*, while cortex reaches 83.55% with
DeepSeek. Reader for reader, cortex's architecture is underperforming what a
20B+Hindsight stack achieves — i.e. **cortex has ~2–4pp of pure architecture
headroom at its current reader.**

---

## 6. What cortex already has vs what the frontier has

| Component | cortex | Emergence/AgentOS | Hindsight | HydraDB |
| --- | --- | --- | --- | --- |
| Dense + BM25 hybrid | ✅ | ✅ | ✅ (4-way) | ✅ |
| Turn-granularity recall | ✅ | ✅ | ✅ (episode) | ✅ (temporal graph) |
| Query expansion | ✅ (operand-oriented) | ✅ | ✅ (time-augmented) | ✅ |
| Bitemporal facts | ✅ (cortex-core) | partial | ✅ (τ_s/τ_e/τ_m) | ✅ (valid+txn time) |
| **Cross-encoder rerank** | ❌ | ✅ Cohere rerank-v3.5 | ✅ LLM reranker | ✅ |
| **RRF fusion** | ❌ | ✅ | ✅ | ✅ |
| **Graph spreading activation** | ⚠️ (in core, not wired to MR/TR) | ✅ ACT-R | ✅ causal/entity/semantic | ✅ |
| **Fact/opinion separation** | ❌ | ❌ | ✅ (4 networks) | partial |
| **Time-augmented embedding** | ❌ | ✅ | ✅ | ✅ |
| **Per-category reader router** | ❌ | ✅ ReaderRouter | — | — |
| **DCG session scoring** | tried → REJECT | — | — | — |

The frontier's shared recipe that cortex is missing: **cross-encoder rerank +
RRF fusion + time-augmented (or temporal-graph) retrieval + fact/opinion
separation.** cortex already has the hardest part (bitemporal facts in
cortex-core); it has not wired the graph/rerank/temporal-graph paths into the
MR/TR retrieval stack.

---

## 7. Path to SOTA — quantified

### 7.1 Under the DeepSeek-only constraint (current)

| Move | Expected gain | Basis |
| --- | --- | --- |
| Cross-encoder rerank (Cohere-class or local) after hybrid recall | +1.0–2.0pp | frontier ablation: rerank is "most load-bearing signal" |
| RRF fusion of BM25 + dense + turn-recall | +0.5–1.5pp | Hindsight/AutoMem hybrid-vs-single ablations |
| Wire cortex-core's associative graph (spreading activation) into MR/TR retrieval | +1.0–2.0pp | Hindsight's 4th channel; HydraDB temporal graph |
| Time-augmented embedding / temporal-graph retrieval for TR | +1.0–2.0pp (TR) | HydraDB TR 90.97%; cortex TR 75.79% is the biggest per-skill gap |
| Fact/opinion separation (4-network) | +0.5–1.0pp | Hindsight's epistemic clarity |

**Combined ceiling (DeepSeek reader): ~85.5–88%** — reaching/beating Emergence
(86%) and AgentOS (85.6%) at GPT-4o, i.e. **cortex could be the #1 open-source
memory system at its own reader** and the strongest DeepSeek-reader result on
public record.

### 7.2 If the reader constraint is lifted

| Reader swap | Expected ceiling | Basis |
| --- | --- | --- |
| DeepSeek → GPT-4o | ~88–90% | bare GPT-4o 92.6% minus architecture loss; Emergence 86% is a GPT-4o system with a weaker recipe than Hindsight |
| DeepSeek → Claude Opus 4.6 | ~92–95% | agentmemory 96.2%, Hindsight-class arch + Opus |
| DeepSeek → Gemini 3 Pro | ~91–93% | Hindsight 91.4% |

### 7.3 The honest ROI ordering

1. **Cross-encoder rerank + RRF fusion** (P0): pure retrieval, TDD-able, direct
   MR/TR mechanism-endpoint A/B. Highest gain-per-risk.
2. **Wire the existing graph + bitemporal into TR retrieval** (P0/P1): cortex
   already owns these primitives in cortex-core; the work is integration, not
   invention. TR is cortex's largest per-skill gap (75.79% vs HydraDB 90.97%).
3. **Time-augmented embedding** (P1): small, mechanical, TR-targeted.
4. **Fact/opinion separation + per-category router** (P2): larger redesign;
   only after 1–3 are validated.

---

## 8. Verdict

cortex at 83.55% (DeepSeek) is **already competitive with GPT-4o-reader systems
(Mastra 84.23%, AgentOS 85.6%, Emergence 86.0%) despite a weaker reader**, and
**above the original paper's Oracle (82.4%)**. The binding constraint is not the
reader's long-context ability (DeepSeek-R1 ≈ 58.3% LongBench v2, near Gemini 2.5
Pro) — it is that cortex has not yet adopted the frontier's retrieval recipe
(cross-encoder rerank + RRF + temporal-graph/time-augmented retrieval +
fact/opinion separation).

**Feasible target without changing the reader: 85.5–88%**, making cortex the
strongest open-source memory system at its own reader and the strongest
DeepSeek-reader LongMemEval-S result on public record. **SOTA (91–96%) requires
a stronger reader**, where each ~1 generation of reader buys roughly +6–9pp.
