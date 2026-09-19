# RRF Retrieval Fusion — A/B Verdict (v2, after abstention decoupling)

**Date:** 2026-09-06
**Result:** **ACCEPT**

---

## 1. Two rounds, one fix

| Round | Treatment | Outcome |
| --- | --- | --- |
| v1 (`e50c554`) | RRF fusion only | **REJECT** — IE abstentions 3-4 → 14-15/run, accuracy 95.0% → 87.5% (44 spurious `threshold` abstentions, cosine 0.41–0.50) |
| v2 (`afd5dd5`) | RRF fusion + abstention decoupling | **ACCEPT** (below) |

The v1 regression was root-caused, not papered over: RRF re-orders hits by
multi-query agreement, so `hits[0]` stopped being the strongest-cosine turn,
and the single-session paths read `hits[0].score` as abstention confidence. The
fix decouples the two — RRF decides order, `maxHitScore(hits)` decides
confidence — and `retrieveTopKByQueries` re-writes each hit's score to its max
cosine across queries.

## 2. v2 mechanism endpoints (same-instant 4v4, exact permutation)

| Endpoint | control | treatment | delta | verdict |
| --- | --- | --- | --- | --- |
| **IE abstention/run** | 3–4 | **4–5** | regression fixed ✅ | — |
| **IE accuracy** | 95.00% | 94.50% | −0.50pp | n.s. (noise floor) |
| **MR accuracy** | 75.21% `[91,91,90,92]` | **79.55%** `[97,95,96,97]` | **+5.25/run** | **complete separation, p = 0.0143** |
| MR abstention/run | 9–12 | 8–9 | −1 to −3 | modest improvement |
| KU | 80.21% | 81.25% | +1.04pp | n.s. |
| TR | 74.21% | 73.43% | −1.00/run | n.s. (p = 0.90, within-run spread 2–4) |
| ABS | 100.00% | 100.00% | 0 | unchanged |
| **Overall** | 83.10% | **83.95%** | +0.85pp | descriptive |

## 3. Attribution

- **MR +5.25/run is fully attributable to RRF fusion** (`retrieveSessionsForQuestion` + `retrieveByQueries`): the MR path's abstention signal was never changed (still `hits[0].score` on centroid cosine), so the gain is pure recall-order improvement.
- **IE regression is fixed by the decoupling** (`maxHitScore` + score=max-cosine): abstention returned to 3-4 → 4-5, accuracy back within noise.
- **TR −1.00/run is noise**, not a regression: exact permutation p = 0.90 in the decrease direction, magnitude below the within-run spread (2–4 questions).
- **KU/ABS guards hold** (n.s.).

## 4. Why this is the right architecture (vs the DCG negative result)

The earlier DCG experiment REJECTED *rank-discounted accumulation within a single
turn-recall channel* — it let noisy mid-relevance turns outrank the single strong
evidence turn on single-fact MR questions. RRF is different: it fuses *channels*
(centroid vs expansion vs lexical) by rank, making cross-channel agreement count
without discarding the strongest single-channel evidence. The +5.25/run MR gain
confirms the distinction empirically.

## 5. Acceptance record

- `e50c554` — RRF fusion (recalled for the v1 regression).
- `afd5dd5` — abstention decoupling fix.
- 564 tests green; coverage 99.75 / 97.98 / 100 / 99.75 (all ≥95%).
- `pnpm check` + `pnpm build` green, no skips.
- Same-instant 4v4, exact permutation p ≤ 0.05 on the MR mechanism endpoint,
  guards (IE/KU/TR/ABS) n.s. or unchanged.
