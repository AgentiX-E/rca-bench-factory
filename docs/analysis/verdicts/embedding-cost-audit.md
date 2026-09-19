# Embedding API Cost Audit

**Review status (2026-09-06)**

All three findings raised in this audit have had their implementation status verified:

| # | Finding | Status | Evidence |
|---|---|---|---|
| P0 | Dispatch switched to `diagnostics_limit=100` | ✅ implemented | all `dispatch_ab_*.sh` use `diagnostics_limit=100` |
| P1 | Diagnostics filter assistant turns | ✅ implemented | `2c47c92 perf(eval): stop embedding assistant turns in retrieval diagnostics`; two `role === 'assistant'` filters in `retrieval-diagnostics.ts` |
| P2 | Diagnostics go hybrid (aligned with production) | ⚠️ partial | query expansion is mirrored, but diagnostics still use `retrieveTopKByQueries` (no lexical fallback), while production uses `retrieveTopKByQueriesHybrid`; and `recommendedThreshold` is never consumed (`abstainThreshold` is still hardcoded to 0.5 via env) |

**Review conclusion**: embedding cost has been optimized as far as it can go; there is no new room for optimization. The cache persists across runs (module-level `Map` + GitHub Actions cache file), the 500-question user turn for the main QA is the **theoretical floor** required for correctness, and the ablations and diagnostics share the same module-level cache (each text is embedded only once). The remaining P2 gap is a correctness problem — "diagnostic recall measures weak retrieval" — not a cost problem, and its impact is negligible because `recommendedThreshold` is never consumed. **No code changes are needed this round.**

---

**Bottom line up front**

Embedding caching is already done well (cross-run persistence, text-level deduplication, float32 serialization), and **the cost of repeat runs is already close to zero**. But three real wastes were found, two of which can directly save roughly **40–50%** of embedding calls:

1. **`diagnostics_limit=0` is a cost multiplier** (dispatch layer, no code change needed): the recall diagnostics embed the full 500 questions against the whole haystack just to compute a **recall statistic that does not affect scoring**. Reverting to the default sample of 100 saves ~40%.
2. **Recall diagnostics do not filter assistant turns** (code layer): the main retrieval path filters out assistant turns, but diagnostics embed everything indiscriminately. Assistant turns are about **50%** of the haystack and are **never used by main retrieval** — pure waste.
3. **(Incidental correctness bug)** The retrieval path used by recall diagnostics is **inconsistent** with what the system actually uses: diagnostics go through `retrieveTopK` (no filtering, no expansion, no hybrid), while the system uses `retrieveTopKByQueriesHybrid` + `filter(isUserTurn)` + query expansion. Therefore `recall@k` and `recommendedThreshold` in `benchmark-diagnostics.json` reflect a retrieval the system **does not use at all**.

---

## 1. Cost model: what a full run actually embeds

| Stage | Call | Filters assistant? | Cache hit? |
|---|---|---|---|
| `checkEmbeddingDeterminism` | 4 short texts | — | negligible |
| `computeRetrievalDiagnostics` (turn-level recall) | **full haystack** (when `diagnostics_limit=0`) | **no** | cold (first round) |
| `computeSessionRetrievalDiagnostics` (session-level recall) | same texts | **no** | cache hit (0 new) |
| `runNaturalLanguageBenchmark` (main QA) | user turns (`filter(isUserTurn)` / MR `filter(!isAssistantTurn)`) | **yes** | cache hit (0 new) |
| MR / TR / KU three ablations | same haystack | yes | cache hit (0 new) |

**Key point**: the main retrieval path (`retrieveTurns` line 473, `answerSessions` line 505) filters out assistant turns **before** embedding, but the two recall diagnostics embed **all** of user + assistant via `turnText`.

## 2. Quantification

Measured turn composition for MR evidence sessions (121 questions × all evidence sessions):

| Turn type | Count | Share |
|---|---|---|
| user | 1832 | 50.0% |
| assistant | 1832 | **50.0%** |

That is, about half the haystack is assistant turns, and main retrieval **never uses** them. The cache log corroborates this: a full run cached **170,095** vectors, about half of which are assistant turns that are never used.

### How much this saves

| Approach | Embedding volume per full run | Savings |
|---|---|---|
| Current (`diagnostics_limit=0` + no filtering) | U + A ≈ 170k | — |
| ① `diagnostics_limit=100` (dispatch layer) | A(100) + U(500) ≈ 102k | **~40%** |
| ① + ② diagnostics also filter assistant (code layer) | U(500) ≈ 85k | **~50%** |

> Note: the main QA itself must embed the user turn of all 500 questions (required for correctness), so **~85k user turns is the theoretical floor** and cannot be reduced further. ①② approach that floor.

## 3. Incidental finding: diagnostics and real retrieval are inconsistent (correctness bug)

`computeRetrievalDiagnostics` uses `retrieveTopK` (no filtering, no query expansion, no hybrid lexical recall), but the system actually uses `retrieveTopKByQueriesHybrid` (filter user turns + query expansion + lexical fallback). Consequences:

- `recallAt1/recallAt5` in `benchmark-diagnostics.json` are too low (they measure weak retrieval);
- `recommendedThreshold` (the 25th percentile of hit score) is based on the wrong retrieval distribution.

This explains why `ABSTAIN_THRESHOLD` has stayed hardcoded to 0.5 via env rather than using the threshold recommended by diagnostics — the diagnostics themselves measured the wrong thing.

## 4. Recommendations (ordered by ROI)

| # | Change | Layer | Saves/fixes | Risk |
|---|---|---|---|---|
| **P0** | Subsequent A/B dispatch uses `diagnostics_limit=100` (the default) instead of `=0` | dispatch command | saves ~40% | none (per-question `llmRaw` goes through the main run's `limit=0` and is unaffected) |
| **P1** | `computeRetrievalDiagnostics` / `computeSessionRetrievalDiagnostics` filter assistant turns (align with the main path) | code | saves another ~10% + fixes consistency | low (needs a locking test) |
| **P2** | Make diagnostics use the same `retrieveTopKByQueriesHybrid` as the system (with expansion + hybrid), so recall/threshold reflect real retrieval | code | fixes correctness | medium (changes diagnostic semantics; report field semantics need updating) |

---

**On the current A/B**: after topping up, I re-dispatched a 4+4 same-moment A/B with `diagnostics_limit=0` (in progress). **For the next batch of dispatches I will switch to `diagnostics_limit=100`.**

P1/P2 are code changes and need TDD + local regression + commit (Lambertyan). Should P1 (diagnostics filtering assistant turns) be implemented now? It saves cost and fixes consistency, and the change is small and low-risk.
