# P8 verdict — MR residual error, and the judge-protocol correction

**Commits**: `c3a52ee` (session budget), `cce134e` (judge protocol),
`4a7fddb` (aggregation critique, default off), `fada750` (coverage audit).
All four are on `origin/master`; `master` is in sync with the remote.
`pnpm check` green: **848 tests** across 31 files (core 87, node 16, llm 43,
eval 702). Coverage per package, statements / branch / functions / lines:

| package | stmts | branch | funcs | lines |
|---|---|---|---|---|
| cortex-core | 98.58 | 97.32 | 100 | 98.58 |
| cortex-node | 100 | 98.61 | 100 | 100 |
| cortex-llm | 100 | 97.26 | 100 | 100 |
| cortex-eval | 100 | 98.89 | 100 | 100 |

Within cortex-eval, `judge.ts` and `embedding-memory.ts` are at 100% on all four
dimensions, `metrics.ts` at **100 / 99.05 / 100 / 100**, and
`retrieval-diagnostics.ts` at **100 / 91.52 / 100 / 100**.

## 1. A plan was falsified before it was implemented

P7's next step was:

> Force a numbered ledger in `buildAggregationQaPrompt` and make the final answer
> derivable from it.

Reading the frozen `llmRaw` for all 121 MR questions shows the model already does
this, correctly, including deduplication:

```
Step 1 — Enumerate every item matching the question's EXACT action ("visit"):
- Dr. Smith (primary care physician) | visit | 2023/05/21
- ENT specialist (chronic sinusitis diagnosis) | visit | 2023/05/21
- Dr. Patel (nasal spray prescription) | visit | 2023/05/20
- Dr. Lee (dermatologist, biopsy follow-up) | visit | 2023/05/20
- Dr. Patel (ENT specialist, chronic sinusitis diagnosis) | visit | 2023/05/22

Step 2 — Count distinct doctors:
- ENT specialist (2023/05/21) — this is the same person as Dr. Patel on 2023/05/22
Distinct doctors: Dr. Smith, Dr. Patel (ENT specialist), Dr. Lee = 3
```

The ledger is numbered; Step 2 folds duplicates explicitly; the answer is right.
**The ledger is intentionally longer than the answer** — 5 bullets, answer 3.

Measured across the 115 evidence-complete instances (`mr_error_shape.py`):

| class | ledger == answer | ledger != answer |
|---|---|---|
| correct | 15 | **86** |
| wrong | 3 | 9 |

Mismatch is the *normal* case in correct answers. A parser that preferred the
list length over the stated answer would have replaced correct answers with wrong
ones at scale. **P1 would have regressed MR while looking principled.**

The offline-first protocol produced exactly the result it exists for: a plausible
plan, falsified by measurement, before a single line was written.

## 2. What the real error is — set membership

The discriminator is **which items enter the ledger**, not how they are counted.

Instance `0a995998`: question "How many items of clothing do I need to pick up or
return from a store?", gold **3** (blazer, new boots, old boots). The prompt
already says *'Treat an "exchange" as TWO items'*. The model emitted:

```
- navy blue blazer | pick up | 2023/02/15
- boots from Zara (exchanged for larger size) | pick up | 2023/02/15
Answer: 2
```

Every supporting sentence was verified present in the frame. The rule was stated.
The model merged anyway. **No arithmetic guard recovers an item that never
entered the list.**

Direction of numeric error (evidence-complete): under **5**, over **7**, equal
89. Over-counting is *more* common than under-counting, which rules out
"retrieval dropped an item" as the driver.

## 3. Judge protocol — fixed, and honestly small

The protocol difference is real and is now implemented (`cce134e`): templates
dispatched by question type, matching the published LongMemEval prompts.

Measured effect on the frozen predictions. Seven MR golds state more than one
value, so the numeric gate touched them:

| gold | prediction | old gate | new behaviour |
|---|---|---|---|
| `5 days. 6 days … also acceptable.` | `5 days` | **true** (leading number 5 == 5) | deferred to judge |
| `15 hours … (or 30 hours for the round trip)` | `15 hours` | **true** (15 == 15) | deferred to judge |
| `11 days (or 12 days, …)` | `12 days` | **false** (12 ≠ 11) | deferred to judge |

Six of the seven were already correct, and **were passing for a reason I did not
predict**: the gate compared only the leading number, and the leading number
happened to match. **Exactly one question was an actual false negative** — the
`12 days` case.

Stated plainly: this change is a **validity** correction, not a performance win.
It makes our accuracy commensurable with published LongMemEval numbers instead of
grading everything for equivalence. It is worth a handful of questions at most.

The abstention axis, which I had flagged as the likely problem, was already
correct: 26/26 ABS questions where the gold sanctions abstention were graded
correct, because a null answer never reaches the equivalence comparison.

## 4. Honest MR error budget

19 errors of 121:

| component | n | status |
|---|---|---|
| evidence incomplete (retrieval) | 5 | real; was 5, not the 22 first reported |
| set-membership (merge / admit) | 11 | dominant; no arithmetic fix |
| abstained despite complete evidence | 3 | partially addressed by derivation routing |
| judge-protocol artifacts | 1 | **fixed in `cce134e`** |

## 5. Correction to my own earlier reporting

Three claims I made this session that the data did not support, recorded so the
record is accurate:

1. **"The frame discards 84% of its budget; 0/316 gold sessions complete."**
   Wrong. The diagnostics store unfiltered bodies while the pipeline strips
   assistant turns before truncation, so my comparison broke at the first
   assistant turn. True figure: 81% of sessions pass through untruncated.
2. **"Retrieval is 42% of MR error (22 of 121 instances MISSING)."** Wrong.
   Corrected: **5 of 19 errors (26%)**.
3. **"The 6 other multi-value golds passed via exact string equality."** Wrong.
   They passed through the numeric gate's leading-number comparison.

## 6. What is left that is genuinely promising

The dominant term is set membership, and the evidence says "ask the model to be
more careful" will not work — the exchange rule is already explicit and was
ignored. Two mechanisms attack membership rather than care:

1. **Two-pass critique.** A second call sees the same context and the first
   pass's ledger, and is asked only to critique membership (missed items,
   wrongly merged exchanges, items that should be excluded). Attacks both the
   merge and the admit direction directly. Cost: one extra call per question.
2. **Deterministic candidate enumeration.** Extract candidate items with a
   rule-based reader over the frame (exchange detection, date-anchored verbs) and
   hand the model a set to accept or reject, instead of asking it to find and
   count simultaneously.

Both are real model changes and need a benchmark run to evaluate against the
noise floor (MR-scoped 13 questions). Neither should be adopted on the strength
of the offline replay alone.

## 7. Coverage audit — two real gaps, one fake test caught

An audit of the coverage report, run because two files sat under the 95% branch
bar, produced a result worth recording: one of my own new tests was vacuous.

`embedding-memory.ts`, line 44 (`return this.options.fallback ?? null`). My first
reading was that this branch is dead, on the reasoning that an empty context
ingests nothing and so yields nothing to search. **That reading was wrong.**
`BruteForceVectorIndex.search` ends with `hits.slice(0, k)`, and `answer` passes
`this.options.topK ?? 1`, so a configured `topK` of 0 returns no hits *even when
facts were ingested*. The fallback there is reachable and load-bearing. Three
tests now pin it, and the file reaches 100% on all four dimensions.

`embedding-memory.ts`, line 50. The original code was
`this.facts.get(best.id)?.value ?? this.options.fallback ?? null`. Tracing the
invariant shows the `?.` and the second `??` cannot be reached: `ingest` writes
the index and the fact map in the same loop iteration (lines 64–65) and both
structures are private, so any id returned by `search` has a payload. I wrote a
test that removed the payload first, and **it failed honestly** — `answer`
re-ingests the context, which re-added the entry, and the assertion only passed
when the desync was self-healing. The test was asserting a false premise. It was
deleted rather than kept for the coverage number, and the unreachable chain was
deleted with it.

`retrieval-diagnostics.ts`. The turn-level diagnostic never measured a miss,
though its session-level sibling had a dedicated test for exactly that.
`missScores` was only appended to when an answerable question had no top-1 at
all, which the file's own comment says cannot happen — so the miss distribution
was empty and `recommendedThreshold`, which is derived from it, was reading
one-sided data. A deterministic two-vector embedding now forces a distractor to
outrank the answer turn, and the miss is asserted to land in `missScores`.

The lesson generalises to the next iteration: a passing test is not evidence that
a branch is exercised, and a coverage number is not evidence that the assertion
means anything. Both of those failures were caught by writing a probe that could
fail, not by reading the code.
