# P11 verdict — the MR diagnostic instrument cannot see the retrieval input

**Status**: no code change yet. This iteration set out to locate the pipeline
stage that drops the needle for the 4–5 "reflexive abstention" questions. It did
that, and the answer refutes the planned fix: the needle is not dropped by any
truncation budget. **The evidence session was never retrieved.**

Worse, the diagnosis rests on an instrument defect that has been quietly
corrupting every MR verdict so far, including P10.

## 1. The instrument defect (this is the headline)

`bench/run.ts` builds `answer_sessions_content` from `inst.answer_session_ids` —
**the two gold sessions only**. But the engine is handed
`inst.haystack_sessions` — **all 47 sessions** (`loadLongMemEval` →
`sessions: sessionsToContext(inst.haystack_sessions, …)`, `benchmark.ts` →
`system.answerSessions(q.question, q.sessions)`).

So the diagnostic file records *gold evidence* next to a *prompt built from a
different and much larger corpus*. Any analysis that treats
`answer_sessions_content` as the retrieval input — mine included — is comparing
against material the retriever may never have had in the pool.

The concrete damage: `p10-mr-stability.md` §4 claims `37f165cf`'s gold "is
derivable from retained context (P9)". That claim was produced by checking the
needle in `answer_sessions_content`. Checked against the actual prompt, the
needle is **absent**.

## 2. The stage attribution, measured

`mr_budget_stage.py` replays both candidate budgets on the abstention set:

| question | needle | stage |
|---|---|---|
| `8e91e7d9` | `3 sisters`, `a brother` | **PRESENT_IN_PROMPT** |
| `37f165cf` | `3 sisters`, `a brother` | `MISSING_FROM_GOLD` |
| `10d9b85a` | `3 sisters`, `a brother` | `MISSING_FROM_GOLD` |

Both candidates are dead:

- **`maxAggregationChars` (Candidate B) is arithmetically impossible.** Joined
  per-session text is **3,890 / 3,923 / 3,920** chars against a **20,000** clip.
  It never fires.
- **`truncateSession` (Candidate A) is not implicated.** Simulating it retains
  both needles (`session[0]→"3 sisters"`, `session[1]→"a brother"`).

The simulation *cannot* reproduce the logged prompt, and that mismatch is the
tell: simulated joined length is **3,923** chars against a logged prompt of
**9,542**. Different input.

## 3. What actually happened to `8e91e7d9`

> Q: "What is the total number of siblings I have?" — gold `4`

- The engine retrieved **2 sessions, neither is the gold session.** Retrieved
  dates: `05/20, 05/21, 05/23, 05/26, 05/27, 05/28, 05/29, 05/30`.
- The gold sessions are dated **`2023/05/24`** and **`2023/05/25` — both absent.**
- The needle words `sibling`, `sister`, `brother` appear **zero times** in the
  9,542-char prompt. The prompt's 55 turns are entirely unrelated (Captain
  America's shield area, Victoria's muffins).

The model returned a bare `UNANSWERABLE` with no reasoning. Given a prompt that
contains nothing about siblings, **that is the correct behaviour.** The bug is
upstream in retrieval, not in the abstention gate — which is exactly the fix I
was about to write.

Fixing the instrument was worth more than any prompt change would have been.

## 4. Recall across the deterministic set

`mr_recall_trace.py`, 8 runs, gold-day present among retrieved days:

| question | runs recalling gold | mean day coverage |
|---|---|---|
| `37f165cf` | 8 / 8 | 100% |
| `10d9b85a` | 8 / 8 | 100% |
| `0a995998` | 8 / 8 | 100% |
| `b5ef892d` | 8 / 8 | 100% |
| `3fe836c9`, `27016adc`, `2318644b`, `c18a7dc8` | 8 / 8 | 100% |
| `8e91e7d9` | **2 / 8** | 12% |

**No question never recalls its gold session**, and only `8e91e7d9` misses even
sometimes. So retrieval failure in this strict sense explains **one** of the 13,
and it is flaky rather than deterministic — `8e91e7d9` recalls its gold in 2 of
8 runs and is wrong in all 8, which means run-to-run recall variance is *not*
what drives its failure.

## 5. Where the 13 actually fail

Cross-tabulating `correct` against "gold answer string appears verbatim in the
logged prompt", answered questions only, run `34024727400`:

| | gold in prompt | gold not in prompt |
|---|---|---|
| **correct** | 34 | 53 |
| **wrong** | 11 | 10 |

Read carefully, this says:

- **The prompt almost never contains the answer.** 63 of 108 answered questions
  have no verbatim gold string — expected, since MR answers are *derived*
  (counts, sums, maxima), not quoted.
- **Presence is not sufficient**: 11 questions have the gold string and still
  answer wrong. The failure is in the read/aggregate step.
- **Absence is not decisive**: 53 questions answer correctly without the string.

So the MR failure population splits into a **derivation/extraction** problem
(dominant) and a small **recall** problem (`8e91e7d9`), and the two need
different instruments.

## 6. Why the abstention bucket was mis-sized

P9 and P10 both put 4–5 questions in "reflexive abstention". Under this verdict
that bucket is partly an artifact:

- `8e91e7d9` — prompt genuinely lacks siblings → **retrieval**, not abstention.
- `37f165cf`, `10d9b85a` — needles absent from the *gold* by string match; the
  prompt may still carry them in another phrasing, which I cannot decide without
  the full dataset.

Only 13 of 121 MR questions abstain (all `reason: 'llm'`, none `'threshold'`),
so the gate itself is barely firing — consistent with the threshold never being
the mechanism.

## 7. Corrections to earlier verdicts

| verdict | claim | correction |
|---|---|---|
| P10 §4 | `37f165cf` gold derivable from retained context | unverified; needle not found in the actual prompt |
| P10 §4 | abstention bucket is 4–5 | at most 2–3 are true abstention-shaped; `8e91e7d9` is retrieval |
| session summary | "9,542-char prompt contains 55 unrelated turns → truncation ate the needles" | correct observation, **wrong cause**: the engine retrieved the wrong sessions; nothing was truncated |

## 8. Blockers

The full LongMemEval-S dataset is **not available locally** —
`/tmp/lme-data/longmemeval_s_cleaned.json` is a **0-byte placeholder**. I cannot:

- verify whether `37f165cf`/`10d9b85a` needles exist under other phrasing,
- recompute retrieval recall over all 47 sessions per question,
- confirm whether `8e91e7d9`'s 2-of-8 recall is an embedding endpoint defect or a
  genuine near-tie.

Re-downloading it is a prerequisite for any retrieval-side claim.

## 9. Method note

New scripts, all offline, no model calls: `mr_budget_stage.py` (stage
attribution), `mr_needle_forensics.py` (byte-level needle evidence),
`mr_instrument_audit.py` (gold coverage vs logged prompt),
`mr_recall_trace.py` (gold-day recall across runs).

**The next MR verdict must state, for every claim, whether the evidence was
measured against `answer_sessions_content` or against `decision.retrieved`.**
Conflating them is the defect this iteration uncovered, and it is
indistinguishable from a real finding unless the source is named.
