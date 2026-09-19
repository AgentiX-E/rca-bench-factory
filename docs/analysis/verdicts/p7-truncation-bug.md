# P7 — `truncateSession` bug: real, fixed, and nearly inert on this dataset

**Status**: fixed and verified (`pnpm check` green, 671 tests, coverage
99.89 / 98.66 / 100 / 99.89). **The claim that this explains the MR plateau was
wrong and is retracted in §3.** The superseded document is kept as
`p7-truncation-bug-superseded.md` so the error stays on the record.

## 1. The bug (real)

`truncateSession` stopped at the first user turn too large to fit:

```ts
if (used + turn.length > maxChars) { truncated = true; break; }
```

`break` abandoned every remaining turn, including assistant heads costing 200
chars each that would still have fit. The function's own docstring says it
"keeps every user turn complete and caps assistant turns" — the `break` did the
opposite, and `ASSISTANT_HEAD_CHARS` is meaningless if the loop cannot continue
past an oversized turn. Implementation contradicted contract. No test caught it.

## 2. The fix

Two-pass, in `natural-language-memory.ts`:

- **Pass 1** selects which user turns survive, skipping oversized turns instead
  of stopping.
- **Pass 2** emits in order and admits a capped assistant head only when
  `used + head + suffix[i+1] <= maxChars`, where `suffix[i+1]` is the total size
  of the kept user turns still to come. A verbose reply can therefore never
  crowd out the facts it exists only to contextualise.
- A session whose smallest user turn still exceeds the budget would keep no
  facts, so it falls back to `truncateText`.

TDD: 5 tests written first, all 5 failed against the old implementation, all
pass after. They cover: multiple user turns kept, budget actually spent, a short
turn surviving an oversized earlier one, assistant heads not crowding out a
later user turn, and the no-user-turn-fits fallback.

## 3. Retracted: "the frame discards 84% of its budget"

The superseded document reported that **0 of 316 gold sessions** arrived
complete and that a median of **325 of 2000 characters** (2.2%) survived, and
blamed the `break`. **That measurement was wrong.**

Cause: `answerSessions` strips assistant turns *before* retrieval:

```ts
const factSessions = sessions.map((session) => session.filter((t) => !isAssistantTurn(t)));
```

But `answer_sessions_content` in the diagnostics stores the **unfiltered** body.
Matching the full body against the rendered frame broke at the first assistant
turn — which is why the "surviving prefix" was always ~283 chars, exactly one
turn long. The pipeline was fine; the comparison was not.

Corrected (`mr_attribution_v2.py`, which filters assistant turns first):

| evidence state | n | correct | accuracy |
|---|---|---|---|
| PRESENT | 115 | 101 | **87.8%** |
| MISSING | 6 | 1 | **16.7%** |

Not 22 MISSING but **6**. Retrieval accounts for **5 of 19 errors (26%)**, not
the 42% first reported. **Extraction is the dominant term: 14 of 19.**

## 4. Corrected: the fix barely moves MR

Replaying both implementations over the 316 gold sessions in the form the
pipeline actually truncates (assistant turns stripped, budget 2000):

| metric | before | after |
|---|---|---|
| gold sessions exceeding the budget | 60 / 316 (19%) | — |
| user turns retained | 1752 / 1832 | 1757 / 1832 |
| user turns lost | 80 | **75** |

Five turns recovered out of 1832 — 0.3%. The reason is structural:
LongMemEval-S user turns are homogeneous (~270 chars), so greedy first-fit
already lands close to optimal. `break` only hurts when a large turn is followed
by small ones, which this dataset rarely produces.

**Conclusion: correct to fix, but it is not the MR plateau.** The plateau is an
extraction problem.

## 5. Where the remaining error actually is

Of the 14 errors with complete evidence present:

| failure mode | n | examples |
|---|---|---|
| under-count (enumerated too few) | 4 | `3→2`, `3→2`, `3→2`, `2→1` |
| over-count (enumerated too many) | 3 | `3→4`, `4→5`, `4→6` |
| wrong sum | 2 | `$3,750→$8,750`, `$720→$200` |
| abstained despite evidence present | 3 | `UNANSWERABLE`, GPA, page count |
| grading artifact | 1 | see §6 |
| ambiguous | 1 | `100→300 points` |

Over-counting is as common as under-counting, which rules out a "retrieval
missed an item" story. The model enumerates the wrong set.

## 6. New lead: the judge does not follow the official protocol

Case: gold is `'11 days (or 12 days, if April 15th to 22nd is considered as 8
days)'`, prediction is `'12 days'` — graded **wrong**. The gold explicitly
sanctions 12.

`judge.ts` asks:

> "Decide whether the predicted answer is semantically equivalent to the
> ground-truth answer."

The official LongMemEval judge asks something materially looser:

> "Please answer yes if the response **contains** the correct answer. […] If the
> response is equivalent to the correct answer **or contains all the
> intermediate steps** to get the correct answer, you should also answer yes."

Ours requires **equivalence**; the official one requires **containment** and
explicitly credits intermediate steps. Ours also omits the temporal off-by-one
tolerance and the knowledge-update "updated answer supersedes previous" clause
the official protocol adds per question type.

Consequence: our accuracy is measured on a **stricter** ruler than the published
benchmark uses, so it is not directly comparable to published LongMemEval
numbers. That is a validity issue independent of any model change.

**Not yet acted on.** Changing a judge changes the number, so it must be
measured as an ablation against the current judge on identical predictions
before anything is adopted.

## 7. What this iteration delivered

- A real contract-violating bug found, fixed, and locked down with 5 tests that
  fail without the fix.
- My own incorrect attribution corrected, with the cause identified.
- The error budget re-derived: extraction (14/19), not retrieval (5/19).
- A new, specific lead on judge-protocol validity.

## 8. Next step

The dominant term is the enumeration itself — the model produces the wrong item
set, in both directions. The right experiment is P1 from the P7 plan: force a
numbered ledger in `buildAggregationQaPrompt` and make the final answer
derivable from it, verified by replaying the new parser over the 121 frozen
`llmRaw` outputs (no API cost). In parallel, measure the judge-protocol question
with an offline re-grade of the existing predictions.
