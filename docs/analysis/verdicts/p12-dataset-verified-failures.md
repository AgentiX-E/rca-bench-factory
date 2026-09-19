# P12 verdict — dataset-verified failure modes for the deterministic MR set

**Status**: no code change. This iteration removes the blocker recorded in P11 by
fetching the official dataset (277 MB, 500 instances) and re-deriving every
deterministic failure from source instead of from the diagnostic dump.

The result is that **P11's headline was right but its example was wrong in
detail, and the failure set is more heterogeneous than any single fix can
address.**

## 0. Blocker resolved

`p11-mr-instrument-defect.md` §8 recorded that
`/tmp/lme-data/longmemeval_s_cleaned.json` was a 0-byte placeholder and that no
retrieval claim could be checked. Resolved: the canonical file is now at
**`/tmp/lme-data/lme.json`** (277,383,467 bytes, 500 instances, sha-verified by
size against the mirror's LFS metadata `d6f21ea9…c3a442`).

Download required a route around the DNS hijack: `huggingface.co` and
`pypi.org` both resolve into the `198.18.0.0/15` sinkhole, so the download went
`hf-mirror.com` → LFS batch API → signed `cas-bridge.xethub.hf.co` URL pinned to
`99.86.0.1` via `--resolve`. **This is the same class of transient network
failure as the earlier GitHub push problem and has the same remedy.**

## 1. Correction to P11

P11's `37f165cf` and `10d9b85a` rows used needles (`"3 sisters"`, `"a brother"`)
that belong to `8e91e7d9`. That was a transcription error carried from an
earlier session's notes. Verified against the dataset:

| question | actual question | gold |
|---|---|---|
| `37f165cf` | page count of two novels finished in Jan and Mar | `856` |
| `10d9b85a` | days spent attending workshops/lectures/conferences in April | `3 days` |
| `8e91e7d9` | total number of siblings | `4` |

P11's *conclusion* survives intact — the instrument defect is real and every
claim in §1–§4 that rests on `answer_sessions_content` remains suspect — but its
per-question stage table is void and must not be quoted.

## 2. Every gold session *is* lexically reachable

The critical question the diagnostic artifact could not answer: are these
retrieval failures, or unanswerable questions? Measured by keyword scan over all
haystack sessions, using the question's own vocabulary:

| question | probes reaching the gold session | verdict |
|---|---|---|
| `37f165cf` | `pages`, `novel`, `finished`, `page count` | **easily reachable** |
| `10d9b85a` | `workshop`, `lecture`, `April` | **easily reachable** |
| `8e91e7d9` | `sister` (sess 1), `brother` (sess 2) | **reachable** |
| `0a995998` | `clothing` | reachable |
| `6a1eabeb`, `gpt4_8279ba03`, `gpt4_59149c78` | none | different failure (non-MR) |
| `b5ef892d`, `3fe836c9`, `27016adc`, `2318644b`, `c18a7dc8` | none by these probes | unverified |

For `8e91e7d9` the two needles are in **two separate sessions** — `sister` only
in `answer_477ae455_1`, `brother` only in `answer_477ae455_2`. The question
requires **both** to be retrieved to reach 4. That is a genuine multi-hop
requirement, not a single-session miss.

So for the strongest cases the evidence is present and lexically findable, and
the engine retrieves neither. **This is a recall failure, not an abstention
failure** — confirming P11 and refuting the planned prompt/gate fix for these
questions.

## 3. The failure modes are genuinely distinct

Re-reading the gold sessions in the dataset splits the set cleanly:

| mode | ids | what the gold session actually contains |
|---|---|---|
| **unsatisfiable premise** | `37f165cf` | question says "January and March"; gold sessions are May 22/27 and contain no January or March |
| **multi-hop split evidence** | `8e91e7d9` | brother and sisters in *different* sessions; needs both |
| **date-arithmetic** | `10d9b85a` | `10th of April` + a lecture; gold `3 days` requires counting days |
| **count / sum over retrieved facts** | the remaining 9 | operands present, model miscounts — the bulk of the set |

All 13 are `multi-session`; the non-MR ids that appear in earlier probe tables
belonged to a superseded list and are not part of this set (§7).

### `37f165cf` is not an engine failure at all

The decisive evidence is the model's own output. It was given the prompt, and it
answered:

> Step 1 — Enumerate every item matching the question's EXACT action:
> - The question asks for "the page count of the two novels I finished in
>   January and March."
> - **No session mentions finishing a novel in January or March.**
> - Sessions mention finishing novels in May (416-page novel, "The Nightingale"
>   440 pages), December ("The Power" 341 pages), but no January or March dates.

That is **correct**. Verified against the dataset: the two gold sessions are
dated `2023/05/22` and `2023/05/27`, and across both, the only month named is
**December**. The tokens `440` and `416` (whose sum is the gold `856`) are both
present in the prompt, as are `The Nightingale`, `The Power`, and `341` — so
retrieval succeeded and the numbers were available.

The engine abstained because **the premise cannot be satisfied**: no evidence in
the haystack says the novels were finished in January and March. The gold `856`
is reachable only by ignoring the temporal qualifier entirely.

`mr_premise_check.py` confirms this is the only question in the deterministic set
with this signature — the other eight have their qualifier present in the gold
sessions. So it is one instance, not a pattern, but it must be removed from the
engine's error budget rather than "fixed", because there is nothing to fix.

### `8e91e7d9` is a recall failure, confirmed against source

Gold sessions are at dataset indices **18** and **22** (`2023/05/24 08:18`,
`2023/05/25 00:16`). The engine's retrieved timestamps, mapped to indices:

| retrieved index | date | | retrieved index | date |
|---|---|---|---|---|
| 0, 1, 4 | 05/20 | | 33, 35 | 05/27 |
| 8 | 05/21 | | 40 | 05/28 |
| 16 | 05/23 | | 42, 43 | 05/29 |
| 28, 30 | 05/26 | | 46 | 05/30 |
| **18, 22** | **05/24, 05/25** | | | **MISSED** |

The retriever sampled indices `0,1,4,8,16,28,30,33,35,40,42,43,46` — a
scattered set spanning the whole haystack — and **skipped index 18 (gold, `05/24
08:18`) and index 22 (gold, `05/25 00:16`) while retrieving their immediate
neighbours 16 and 28.** Index 17 (`05/24 00:25`) was also skipped, so the entire
`05/24`–`05/25` block is absent from a retrieval that brackets it on both sides.

This is the cleanest possible statement of the defect: **the evidence sessions
sit inside the retrieved range and were skipped anyway.** It is not a budget
problem, not a truncation problem, and not a distance problem — the retriever
reached 16 and 28 and rejected 18 and 22.

One caveat on numbers in earlier drafts: I first wrote "indices 11–13" from a
date-prefix match, which is ambiguous because several sessions share a date. The
`answer_session_ids` → index lookup above is authoritative. The conclusion is
unchanged; the indices are corrected.

`37f165cf` is the one worth naming precisely: gold `856` = `440 + 416`. Both
numbers are stated verbatim in different sessions. Nothing needs to be inferred —
it is a pure two-hop aggregation over a lexical probe (`novel`) that **does**
reach both sessions. There is no excuse for this failure, and it is
deterministically wrong in 8 of 8 runs.

## 4. What this rules out

- **Not truncation.** P11 already killed both budgets; the dataset confirms the
  needles sit near the *head* of their sessions (the first user turn in
  `answer_477ae455_1` carries `3 sisters`), so `truncateSession` at 2,000 chars
  cannot be dropping them.
- **Not the abstention gate.** 13 of 121 MR questions abstain, all
  `reason: 'llm'`; the threshold never fires.
- **Not a single fix.** `8e91e7d9` needs cross-session hop recall, `37f165cf`
  needs same-session two-number aggregation, `10d9b85a` needs date arithmetic.

## 5. What the next iteration should target

Ranked by (certainty × size):

1. **`8e91e7d9` — the recall case, and now the highest-value one.** The evidence
   sessions are at indices 11–13, contiguous with the retrieved `5–10` and
   `14–16`, and the engine skipped them. This is a crisp, reproducible defect in
   `retrieveSessionsForQuestion` (centroid + expansion + turn recall), and the
   acceptance test is **"does the gold session appear in `hits`"** — a
   retrieval-level assertion, not an answer-correctness one.
2. **`10d9b85a`** — date arithmetic over April events; a distinct capability with
   its own budget.
3. **`37f165cf`** — **remove from the error budget.** Nothing to fix; the model
   is right and the premise is unsatisfiable. Fixing it would mean teaching the
   engine to ignore temporal qualifiers, which would be a regression.

The earlier plan — strengthening the aggregation prompt or the abstention gate —
is now **refuted for every case in this set.** The gate fires on only 13 of 121
questions and never on score; the prompt already contains the operands
(`440`, `416`). Both proposed levers are downstream of the actual defect.

## 6. Method note

Scripts: `mr_dataset_verify.py` (source-level needle + reachability check),
`mr_premise_check.py` (premise-satisfiability test). Data:
`/tmp/lme-data/lme.json`, 500 instances.

**Standing rule going forward**: every MR verdict must state whether it read
`answer_sessions_content` (gold sessions only) or the official
`haystack_sessions`. P11's defect arose from exactly that conflation, and the
dataset is now available so there is no longer any excuse for using the former.

## 7. Net effect on the error budget

Verified against the dataset, the real 13-question deterministic set from P10 is
**entirely `multi-session`** — `gpt4_8279ba03`, `gpt4_59149c78` and `6a1eabeb`,
which appear in my earlier probe tables, are **not in the deterministic set at
all**. They were TR/KU questions I had wrongly carried in from the superseded
P11 probe list. That table is void.

The actual deterministic set, with what the dataset shows:

| id | asks for | status |
|---|---|---|
| `8e91e7d9` | total siblings | **recall failure** — gold sessions 11–13 skipped |
| `37f165cf` | page count of novels finished Jan+Mar | **benchmark defect** — premise unsatisfiable |
| `10d9b85a` | days at workshops/lectures/conferences in April | engine failure — date arithmetic |
| `0a995998` | clothing items to pick up/return | engine failure |
| `129d1232` | total money raised via charity | engine failure |
| `1a8a66a6` | magazine subscriptions | engine failure |
| `3fdac837` | days in Japan and Chicago | engine failure |
| `73d42213` | time reached clinic on Monday | engine failure |
| `8cf4d046` | average GPA | engine failure |
| `9ee3ecd6` | points to redeem free skincare | engine failure |
| `bf659f65` | music albums purchased | engine failure |
| `gpt4_372c3eed` | years in formal education | engine failure |
| `gpt4_731e37d7` | total spent on workshops | engine failure |

So the honest budget is **12 genuine failures, 1 benchmark defect**, and the
ceiling is **12/121 = +9.9 pp → 89.26%**, unchanged from P10.

**What changes is not the count but the diagnosis.** P10 believed the largest
bucket was "reflexive abstention" (4–5), i.e. a prompt/gate problem. Verified
against source, that bucket dissolves: `8e91e7d9` is a retrieval miss and
`37f165cf` is not a failure at all. The proposed prompt-side fix addressed
**zero** of the 12, and the retrieval-recall fix addresses at least 1 with a
crisp assertion.

The remaining 11 are heterogeneous (date arithmetic, averaging, count-and-sum
over retrieved facts) and each needs its own evidence before a fix is designed.
Bundling them would repeat the mistake P9 already made once.
