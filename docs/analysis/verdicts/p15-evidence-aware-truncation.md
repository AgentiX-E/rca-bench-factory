# P15 verdict — evidence-aware truncation, shipped

**Status**: accepted and committed. Supersedes nothing; extends P14 §7.

## 1. What was wrong

`truncateSession` allocated the per-session budget by a single rule: keep complete
user turns **in arrival order** until the allowance runs out. When the next user
turn was larger than the *remaining* budget it was discarded outright, and the
function returned with real budget unspent.

Measured over 344 LongMemEval-S multi-session gold sessions rendered exactly as
the loader renders them:

| quantity | count |
|---|---|
| sessions longer than 2000 chars | 344 |
| … with ≥1 user turn too large for the remaining budget | **64 (18.6%)** |
| median total user-turn characters in a session | 1,444 |

The mechanism never fires for the median session, so the fix is deliberately
narrow — but in the tail it discarded the evidence turn while leaving hundreds of
characters unused.

## 2. The decisive case

`8cf4d046` — "What is the average GPA of my undergraduate and graduate studies?"
(gold `3.83`). The gold needs `3.86` (undergraduate, stated as "83%, equivalent to
a GPA of 3.86 out of 4.0") and `3.8` (graduate).

Session `answer_e2278b24_2` has user turns of `[549, 259, 221, 177, 256, 987]`
chars — **2,449 total against a 2,000 budget**. The old pass kept the first five
(1,462 chars) and dropped the 987-char sixth, which is the only turn stating
`3.86`, **leaving 538 characters unused**.

The logged model trace shows the consequence precisely — the model saw the
"First-Class distinction" phrase but no number, and abstained for that reason:

> Undergraduate GPA (First-Class distinction at University of Mumbai) | not given
> as a numeric GPA … Therefore, the average cannot be computed. Answer:
> UNANSWERABLE

That is not a retrieval failure, not a threshold failure, and not a model
limitation. The engine removed the number from the prompt.

## 3. What was rejected, and why

Two policies were designed and **discarded on measurement**, and the record
matters because both were plausible:

| policy | complete turns gained | complete turns lost | verdict |
|---|---|---|---|
| rank user turns by length, keep the longest | 7 | **12** | **rejected — net negative** |
| arrival order + one partial turn at the first miss | 1 | 5 | rejected |
| arrival order + partial turn at the *last* miss | 1 | 5 | rejected |

The first is worth stating plainly: **"keep the longest user turns" looked
principled and regressed 12 cases.** Long user turns are frequently verbose
*questions*, while evidence sits in medium-length *statements*, so length is not a
proxy for content. The selection experiment is the reason a plausible bad fix was
not shipped.

A second rejected idea was a "prefer digit-bearing turns" tie-break. Measured over
the 59 dropped-turn cases, it changed the chosen turn in **0 of 59** — every
dropped narration already contains a date or time. Adding it would have introduced
an unexercised branch, so it was left out.

## 4. What shipped

**Commit**: this iteration, authored by Lambertyan (see §7). Change is a new Pass 1.5 in
`truncateSession`:

1. Pass 1 (unchanged) keeps complete user turns in arrival order.
2. **Pass 1.5 (new)** spends `maxChars - reserved` — budget no complete turn could
   use — on the **largest** dropped user turn, admitted as a head.
3. Pass 2 (unchanged) emits in order; `suffix` now includes the partial so an
   assistant head still cannot displace a fact.

The rule is **strictly additive**: complete turns are allocated first and are
never displaced, so the output can only ever contain *more* evidence than before.
Ties resolve to the earliest turn for run-to-run stability.

## 5. Acceptance

| # | criterion | result |
|---|---|---|
| 1 | A user turn too large for the remaining budget still contributes | **PASS** — 4 new unit tests |
| 2 | No complete user turn is ever displaced | **PASS** — 309/309 sessions, 0 losses |
| 3 | Fix improves the target | **PASS** — `8cf4d046` now carries `3.86` |
| 4 | No pre-existing test weakened | **PASS** — 118 insertions, 3 deletions, all deletions are doc text |
| 5 | Coverage ≥95% on every dimension | **PASS** — 100/100/98.81/100 |
| 6 | Full gate green | **PASS** — 863 tests (was 859) |

Coverage on `natural-language-memory.ts`:

| dimension | value |
|---|---|
| statements | **100.00%** (1293/1293) |
| functions | **100.00%** (60/60) |
| branches | **98.81%** (331/335) |
| lines | **100.00%** (1293/1293) |

Every branch introduced by Pass 1.5 is exercised in both directions
(`1863:[1]`, `1885:[7]`, `1892:[14]`, `1893:[1]`, `1913/1915/1916`). The four
uncovered branches are pre-existing (lines 703, 1655, 1657) plus the ternary false
edge at 1941, which is unreachable by construction: the turn split is lossless, so
a session longer than the budget that loses nothing cannot exist. Verified
empirically — **117,353** over-budget (session, budget) pairs across all 500
instances produced **0** missing `[truncated]` markers.

## 6. The test that could have lied

Both new assertions were **verified to fail with the fix neutered** and pass with
it enabled. This is the check that separates a regression test from a
self-satisfying one; without it, a test that passes either way would have shipped
as evidence.

One test initially failed for a **wrong reason**: it asserted `not.toContain
('[truncated]')` on a case whose 3,000-char assistant head correctly triggers
capping. The assertion was wrong, not the code, and it was rewritten to assert the
actual invariant — that no *user* turn carries a cut.

## 7. Method note and honest bound

The design used a Python reimplementation of `truncateSession` to explore policy
space over the dataset, then a Node probe importing the **built TypeScript** to
confirm the shipped function behaves identically. The reimplementation is a model,
not the artefact; the final acceptance runs the real function over
`/tmp/lme-data/lme.json`.

**Honest bound, unchanged in spirit from P14:** this fix is proven to recover the
evidence for **1** of the 13 stable MR failures (`8cf4d046`). The 18.6% mechanism
count is not an accuracy count — for 9 of the 13 digit-bearing cases the discarded
turn was not decisive. The remaining stable failures are reasoning (`73d42213`),
salience (`gpt4_731e37d7`, `10d9b85a`), residual recall (`1a8a66a6`,
`gpt4_372c3eed`), a grading artefact (`3fdac837`), and a benchmark defect
(`37f165cf`). Truncation was chosen first because it is a pure function with an
offline, deterministic test — not because it is the largest prize.
