# Retrieval Stack Audit — vs LongMemEval-S Frontier Methods

**Date:** 2026-09-06

## 1. Our current stack (already sophisticated)

| Component | Function | What it does |
| --- | --- | --- |
| Session-centroid | `retrieveTopKSessions` | session = mean-pool of turn vectors |
| Multi-query | `retrieveByQueries` | query-expansion session recall |
| **Turn-granularity recall** | `retrieveSessionsByTurns` | score a session by its **best-matching turn** |
| Hybrid turn recall | `retrieveTopKByQueriesHybrid` | semantic + rare-keyword lexical recall |
| Lexical | `extractLexicalKeywords` / `countLexicalMatches` | rare-keyword doc-frequency filter |

## 2. The one concrete gap vs the frontier

EmergenceMem (86%) and AgentOS (85.6%) both score a session from its turns'
**ranks via NDCG** ("1/log2(1) + 1/log2(3) + 1/log2(4)"), so a session with
*several* turns in the top-K outranks a session with one slightly-stronger turn.
Our `retrieveSessionsByTurns` scores a session by its **single best turn only**
(`bestBySession.set(i, max(score))`), discarding the rest of its evidence.

- Cross-encoder reranking (also used by Emergence) requires an external model and
  is out of scope for this pure-TS stack.
- Per-category reader routing is already approximated by our per-capability
  prompts (IE/MR/KU/TR each has its own builder).

**Recommendation:** replace the max-turn session score with a rank-discounted
DCG aggregation over each session's turns in the top-K. This is a pure,
unit-testable function, and it is the single frontier technique we are missing
that maps directly to the MR/TR gaps.

## 3. Trade-off (why this needs an A/B)

`max` favors a session with one strong evidence turn (single-fact questions);
DCG favors a session with several evidence turns (multi-evidence questions).
LongMemEval-S MR mixes both, so the change must be measured on the mechanism
endpoint (MR/TR abstention + retrieval of the evidence sessions), not assumed.
