# P13 verdict — MR recall failure mechanism, pinned

**Status**: analysis complete, mechanism identified, fix designed. Code change
follows in this iteration with tests written first.

## 1. The retrieved set decomposes exactly

For `8e91e7d9`, the logged prompt holds **13 sessions** (15 blocks minus 2
`[truncated]` markers), matching the budget
`sessionTopK=10` (RRF) + `turnRecallSessions=3` (appended). The channel split is
recoverable from block order because `hits.push(...turnHits)` appends:

| slot | channel | session date |
|---|---|---|
| 0–9 | RRF (centroid + expansion) | 05/27, 05/29, 05/27, 05/29, 05/26, 05/21, 05/20, 05/23, 05/20, 05/30 |
| 10–12 | turn recall (appended) | 05/20, 05/28, 05/26 |

**Gold is absent from BOTH channels.** Index 18 (`05/24`, holds `sister`) and
index 22 (`05/25`, holds `brother`) appear nowhere.

## 2. Why gold 22 is flaky — a boundary tie at the last appended slot

Across the 8 runs the retrieved set is usually identical but flips in 2 runs.
The flip is exactly one session:

| run | slot 11 | slot 12 |
|---|---|---|
| `34024727400` (miss) | `05/28` | `05/26 00:56` |
| `34024732117` (**hit**) | `05/26 00:56` | **`05/25` ← gold 22** |

Gold 22 competes for the **3rd and last** turn-recall slot against `05/28`. When
gold 22 wins, it is retrieved — and the question still fails, because gold **18**
is missing. So the flakiness is a near-tie at a hard `slice(0, 3)` boundary, not
nondeterminism in the model.

This also explains P10's "2 of 8 runs recalled gold": it counted gold-day
presence, which is satisfied by gold 22 alone.

## 3. Root cause: the expansion inherits the question's vocabulary

The decisive fact:

| | question wording | evidence wording |
|---|---|---|
| `8e91e7d9` | "total number of **siblings**" | gold 18: "3 **sisters**"; gold 22: "a **brother**" |

- gold 18 contains `sibling` **0 times**, `sister` **1 time**
- gold 22 contains `sibling` **0 times**, `brother` **2 times**

And the expansion queries the LLM produced were:

```
['sibling count', 'count siblings', 'list siblings']
```

Every one repeats the word `sibling`. So **all three channels** — bare question,
3 expansion phrases, and turn recall over `[question, ...expansionQueries]` — are
searching for a word that appears in **neither** evidence session.

This is a genuine, generalisable defect: **the expansion prompt asks for
"SPECIFIC ACTIVITIES" and emits bare object nouns instead.** For a relational
question the retrieval vocabulary must be the *lexical variants of the relation*
(`sister`, `brother`), not a restatement of the question's own noun.

## 4. Why the existing channels cannot cover it

- **Centroid**: mean-pools ~11 turns; one evidence turn alleging `sisters` is
  diluted by ~`sqrt(11)` — the documented reason `retrieveSessionsByTurns`
  exists at all.
- **Expansion**: vocabulary-locked to the question (§3).
- **Turn recall**: queries are `[question, ...expansionQueries]` — same locked
  vocabulary, and only 3 slots.

The gap is **vocabulary**, so no amount of re-ranking fixes it. The fix must add
lexical variants of the question's key relation/noun to the expansion set.

## 5. Fix — implemented and committed

**Commit**: `c4ab77b` (Lambertyan), pushed as `fada750..c4ab77b`.

**Change**: `expandLexicalVariants` — a deterministic table mapping a relation to
the terms the evidence uses for its members — appended to the query set feeding
**both** the expansion channel and turn recall (turn recall queries with
`[question, ...expansionQueries]`, so leaving it out would have preserved the
exact blind spot).

Why deterministic and offline rather than a second LLM call:

1. **Reproducible.** The endpoint is documented non-reproducible; a second
   sampling call would add variance to retrieval, which is the one stage that
   should be stable. §2 shows the failure is already a boundary tie — adding
   sampling noise there is exactly wrong.
2. **Free and testable.** A pure function over strings is unit-testable with no
   API, and costs zero tokens per question.
3. **Bounded.** It extends the query list, already capped by
   `queryExpansionTopKPerQuery`, so context size cannot grow unboundedly.

### Acceptance results

| # | criterion | result |
|---|---|---|
| 1 | `sibling` → `sister`,`brother`; both gold sessions reachable | **PASS** — 9 unit tests |
| 2 | Deterministic across calls | **PASS** |
| 3 | Query set unchanged when no variant applies | **PASS** — returns `[]`, byte-identical path |
| 4 | Offline replay on the real case | **PASS** — both gold sessions `NO → YES` reachability |
| 5 | Coverage ≥95% all dimensions | **PASS** — file 100/98.76/100/100; new function 100% branches |

Full gate: **859 tests** (was 848, +11), lint/typecheck/format/build all green.

### The test that almost lied

The first integration test **passed with the fix removed**. Two independent
causes, both worth recording:

1. `HashEmbedding` has no lexical meaning, and with only 2 candidate sessions a
   `topK` of 10 retrieves *everything* — no cap binds, so the assertion was
   vacuous. Fixed by supplying 14 distractors (more than `topK`) aligned with the
   question's vocabulary, so every channel cap saturates and the evidence can
   only appear via a variant query.
2. My own `alreadyPresent` guard was `\b${term}s?\b`, which suppressed incorrectly;
   the neutering edit was also still present in the file when I first re-ran.

The test is now **verified to fail without the fix** — the check that
distinguishes a real regression test from a self-satisfying one.

**Honest bound** (unchanged from P12): this targets 1 of the 12 genuine failures
(≈ +0.8 pp). It is the highest-*certainty* lever, not the largest. The other 11
are heterogeneous and each needs its own evidence.

## 6. Second case: `10d9b85a` — dilution, not vocabulary

`10d9b85a` ("How many days did I spend attending workshops, lectures, and
conferences in April?") fails **deterministically**: in all 8 runs the prompt
holds 16 sessions over 14 distinct timestamps, the model answers `1` or
abstains, and **never** answers `3`. Unlike `8e91e7d9` this case has **zero
variance**, so the failure is not a boundary tie and no sampling explanation
applies.

### 6.1 The gold answer decomposes cleanly and needs no date metadata

| gold session | index | stamped date | answer-bearing turn | contributes |
|---|---|---|---|---|
| `answer_e0585cb5_2` | 29 | `2023/05/01 16:19` | "a lecture ... on the **10th of April**" | **1 day** |
| `answer_e0585cb5_1` | 39 | `2023/05/01 20:24` | "a **2-day workshop** ... on the **17th and 18th of April**" | **2 days** |

Total **3 days**. Every operand is stated in the session **text**; the question is
answerable from content alone.

### 6.2 Session 39 is never retrieved; session 29 always is

Needle presence in the logged prompt, all 8 runs:

| needle | runs present |
|---|---|
| session 29 — `public library on the 10th of April` | **8 / 8** |
| session 39 — `2-day workshop` | **0 / 8** |
| session 39 — `attended on the 17th and 18th of April` | **0 / 8** |

The retrieved timestamps are `08:07 06:44 18:05 06:45 16:19 21:43 06:24 06:50
06:21 05:43 10:02 19:39 18:45 11:14`. Gold 29 is `16:19` — present. Gold 39 is
`20:24` — **absent from the list entirely**. The 16 sessions retrieved are
byte-identical across all 8 runs.

### 6.3 Why the lexical-variant fix cannot reach it

`expandLexicalVariants` bridges a **relational** vocabulary gap. This case has no
relational gap: the expansion queries were

```
['attend workshops', 'attend lectures', 'attend conferences']
```

and session 39 contains **both** `attend` and `workshop` (session 29 contains
`lecture` but **not** `workshop`). So the query phrase `attend workshops` already
names session 39's evidence, and the variant table — which maps `siblings →
sister/brother` and four other kin relations — does not and should not cover it.

### 6.4 Root cause: the evidence turn is diluted to 2.6% of its session

| gold session | turns | chars | needle turn | needle fraction |
|---|---|---|---|---|
| 29 | 12 | 19,682 | turn 0 | **1.5%** |
| 39 | 10 | 15,694 | turn 2 | **2.6%** |

Session 39 opens on an unrelated topic ("machine learning ... feature scaling")
that dominates its centroid; its single evidence turn sits at position 2. Under
`retrieveSessionsByTurns` the merged best-per-session score for session 39 must
beat ~43 competitors for one of `turnRecallSessions = 3` slots — and it does not.
Session 29 survives for a mundane reason: its needle is **turn 0**, so it leads
its own session and is also phrased in the question's exact lexicon
("sustainable development").

So the three channels fail for one shared reason, and it is **not** vocabulary:
centroid dilution, an expansion channel that ranks by whole-session centroid, and
a turn-recall channel whose 3 slots are out-competed by sessions with more
question-aligned turns.

### 6.5 The date stamp is independently misleading

Every one of the 44 haystack sessions carries a `2023/05/01` stamp at a distinct
**time of day** — the dataset collapsed all session dates onto one calendar day
while the evidence names April dates. This is present **in the source data**; the
loader passes `haystack_dates` through verbatim (`longmemeval-loader.ts`, no
rewriting), so it is not introduced by this codebase.

Systemic scope, measured over the 133 `multi-session` instances:

| haystack dates span | instances | share |
|---|---|---|
| a single calendar day | **31** | 23.3% |
| more than one calendar day | 102 | 76.7% |

For any question whose answer depends on the *session* date rather than a date
named in text, the prompt therefore presents a contradiction — a `2023/05/01`
prefix beside April content — and date arithmetic on the prefix is unsound. This
is a **benchmark-side defect**; the correct response is to make the engine rely
on text-stated dates, not to "fix" the stamp.

### 6.6 Disposition

| item | verdict |
|---|---|
| `10d9b85a` session-39 recall miss | **genuine engine defect** — dilution; a fix is warranted |
| single-day haystack stamp | **benchmark defect** — 31/133 MR instances; out of scope for an engine fix |
| `8e91e7d9` vocabulary gap | already fixed (`c4ab77b`) |

The dilution defect is the one actionable item, and it is deterministic, so it
admits a regression test that cannot pass by luck.

## 7. Method note

New script: `mr_channel_split.py` (recovers channel decomposition from block
order). Data: `/tmp/lme-data/lme.json`; runs: 8 frozen `ab_rrf/run_*`.

**Caveat recorded**: no `ZHIPU_API_KEY` / `DEEPSEEK_API_KEY` is present in this
session, so I cannot re-embed to reproduce rankings. Every claim above is derived
from the frozen diagnostics and the dataset, both of which are independent of the
embedding endpoint. The fix's acceptance test is therefore expressed as a
**recall-set assertion** (which sessions are retrievable), computable offline,
rather than an answer-accuracy assertion that would need a live model call.

### 7.1 A diagnosability gap found while writing this

`benchmark-mr-diagnostics.json` records `decision.retrieved` — the **fused**
prompt — but not the per-channel rankings that produced it. Recovering the
channel split (§1) was possible only because `hits.push` preserves order. That is
enough to attribute a *retrieved* session, but it cannot answer the question this
section needed: **where a never-retrieved session ranked in each channel**. The
per-channel decomposition should be recorded so the next recall defect is
diagnosable from the artifact instead of by inference.
