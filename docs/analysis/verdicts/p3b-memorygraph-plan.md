# P3b — MemoryGraph Spreading-Activation Recall Arm: Gap Analysis + Plan

**Status:** research complete; awaiting approval to implement
**Predecessor:** P3a occurrence-date recall — REJECTED (deterministic net-negative)

## 1. Verdict first — the honest ROI read

P3b is a **wiring gap, not an invention**: `cortex-core` already ships
`MemoryGraph.spreadingActivation` (Hebbian weights + logistic significance +
multi-hop diffusion + `EdgeKind.temporal/causal/cooccurrence/semantic`), and
`cortex-eval` already depends on `@agentix-e/cortex-core` — but the benchmark
recall path uses none of it. So the mechanical cost is low.

**However**, a data-driven attribution of the current TR/MR misses shows the
upside is bounded and mostly lies elsewhere:

| capability | wrong | recall-miss (answer turn absent) | reader-error (answer present, LLM wrong) |
|---|---|---|---|
| TR (127) | 31 | **6–10** | **18** |
| MR (121) | 23 | not graph-shaped (aggregation/enumeration) | — |

- TR's dominant failure is **reader-side** (18/31: the answer is already in the
  retrieved window but the LLM computes the wrong elapsed time / order). A recall
  arm cannot touch those.
- The recall-miss TR questions split into **event-lookup** (time-anchor
  localization — the exact territory P3a already reverted) and **category→instance
  gaps** ("kitchen appliance" → "a smoker"), which a *co-occurrence* graph does
  not bridge (it needs literal co-occurrence, not semantic hyponymy).
- MR's misses are numeric aggregation/enumeration questions, not "answer entity is
  one hop from question entity".

So the pre-registered expectation must be modest: P3b can plausibly recover **a
few** event-lookup questions where the answer entity literally co-occurs with the
question entity ("jewelry" ↔ "aunt", "music event" ↔ "parents"), and it may again
land below the exact-permutation p≤0.05 bar. The go/no-go below treats "signal is
real but sub-noise" as a recorded negative, exactly as P3/P3a did.

## 2. Wiring gap (what already exists, unused)

`packages/cortex-core/src/graph/memory-graph.ts`:

- `MemoryGraph.strengthen(a, b, kind)` — Hebbian co-activation, `significanceOf`
  logistic gate, weight in (0,1].
- `MemoryGraph.spreadingActivation(seeds, maxDepth=3, threshold=0.01)` — returns
  `Map<entity, activation>`, `act * weight` per hop, 0.5 decay per layer.
- `EdgeKind.cooccurrence | temporal | causal | semantic`.

`packages/cortex-eval` already imports `@agentix-e/cortex-core` (binomialCdf,
welchTTest, wilsonScoreInterval, types). Wiring `MemoryGraph` is zero-dependency.

## 3. Leading implementations (web research)

| system | mechanism | takeaway for P3b |
|---|---|---|
| SPRIG (arXiv 2602.23372) | NER + co-occurrence graph + Personalized PageRank | **zero-token** NER+co-occurrence+PPR matches or beats LLM-based graph construction, 28% faster |
| MemGraph | spaCy NER + co-occurrence + PPR, `α·vector + (1−α)·ppr` fusion, 2-hop | hybrid fusion formula; alias resolution |
| A-MEM | dynamic note graph (Zettelkasten) | +27.44pp multi-hop |
| HippoRAG | PPR over KG for RAG | PPR as the graph-retrieval primitive |
| Zep Graphiti | bi-temporal knowledge graph | temporal edges are the TR-relevant axis |

The decisive insight: **NER + co-occurrence + spreading-activation can match
LLM-based graph construction at zero token cost** — which directly answers the
P3a failure mode (LLM extraction added cost *and* distractors). P3b must be
zero-LLM on the extraction side.

## 4. Proposed design (zero-LLM extraction, append-only, RRF)

### 4.1 Entity extraction (deterministic, no LLM)

Reuse the existing `extractLexicalKeywords` rare-keyword channel plus a
capitalized-token / `[A-Z][a-z]+` proper-noun scan over the *question* and each
recalled *turn*. This yields candidate seed entities and per-turn entity sets
without a structured LLM call. (The category→instance questions are explicitly
out of scope — they need hyponymy, not co-occurrence.)

### 4.2 Graph construction (per-question, deterministic)

For the current question's context, build a `MemoryGraph`:

- `ensureNode` for every extracted entity id (hash of normalized surface form).
- `strengthen(e1, e2, 'cooccurrence')` for every entity pair in the same turn
  (bounded to the top-k recalled turns, so the graph is small and deterministic).

### 4.3 Spreading-activation recall arm

- Seeds = entities extracted from the question.
- `spreadingActivation(seeds, maxDepth=2, threshold=0.01)` → neighbor entities.
- Map activated entities back to the turns that mention them (entity→turn index),
  producing a graph-ranked turn list (activation score, best-first).
- **Append-only + RRF**: fuse `[semanticHits, lexicalHits, graphHits]` via the
  existing `reciprocalRankFusion`. Never re-rank the semantic channel, so the
  abstention signal (`hits[0]` semantic match) stays stable — the same contract
  that kept P3a measurable.

### 4.4 Scope guard

The arm only widens the *turn* pool for TR `eventLookup` and MR questions whose
question entities literally co-occur with an answer entity. IE/KU/ABS paths are
untouched. A `guard` test asserts non-graph paths are byte-identical.

## 5. Acceptance criteria (scientific)

1. **TDD first**: unit tests for entity extraction, graph construction
   (strengthen/significance), activation→turn mapping, and a **discriminating
   integration test** that a graph-recoverable question ("jewelry … from whom"
   with `aunt` co-occurring) is appended only when the graph arm is on (mutation
   removing the arm fails the test).
2. **Coverage ≥95%** on all four dimensions (Statements/Branch/Functions/Lines).
3. **Same-instant 4v4 A/B** on the TR `eventLookup` + MR mechanism endpoints,
   exact permutation + Welch + McNemar.
   - **Accept** only if the target endpoint moves with exact-permutation
     **p ≤ 0.05** AND all IE/MR/KU/ABS guards stay flat (no regression).
   - Otherwise **REVERT** and record "real but sub-noise" as a negative, matching
     P2/P3a discipline.
4. Commit as `Lambertyan`, English comments/docs/commit message.

## 6. Decision points for you

| # | decision | options |
|---|---|---|
| D1 | proceed with P3b despite the bounded upside? | **A** proceed (accept sub-noise risk) / **B** redirect to reader-side first |
| D2 | entity source | zero-LLM (rare-keyword + proper-noun) — recommended, vs LLM fact extraction |

My recommendation: **proceed with P3b on the zero-LLM path (D1=A, D2=zero-LLM)**,
because it is the cheapest complete Tempr-wiring step and the only one that can
supply graph traversal to the recall path; the reader-side 18-question TR gap is
a *separate, larger* target that a recall arm structurally cannot address and
deserves its own iteration afterward.
