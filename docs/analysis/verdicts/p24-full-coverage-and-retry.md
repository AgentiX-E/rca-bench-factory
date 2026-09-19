# P24 §B — the full-coverage-but-wrong cell, and a correction to the retry verdict

Data: run `35004814319` (`4955d8e`), all 500 questions. Coverage uses the **P21
definition** deliberately, so the bands match that run's report:

> coverage = turns of the answer session present in the prompt / total turns of
> the answer session

It is a **turn-count ratio**, not a character or shingle ratio. Measured both
ways: the shingle ratio of a session into a 45-turn prompt tops out at **0.477**
across all 121 MR questions (median 0.302), so using it would report "no question
ever reaches full coverage" and contradict the bands. Two different questions.

Instrument: `analysis/scripts/p24_full_coverage_wrong.mjs`.

## 1. The bands reproduce

| coverage | n | correct | accuracy |
|---|---|---|---|
| 0% | 9 | 4 | 44.4% |
| 1–49% | 38 | 18 | 47.4% |
| 50–99% | 350 | 304 | 86.9% |
| 100% | **103** | 97 | **94.2%** |

103 at full coverage and 94.2% is the P23 §5 figure (102 / 94.1%) to within one
question. So §5's "the newly-completed sessions are harder" is confirmed, and the
ceiling is real.

## 2. Four of the six full-coverage-but-wrong questions are the ABS ones

`e5ba910e_abs`, `a96c20ee_abs`, `2698e78f_abs`, `0ddfec37_abs` — with prompt sizes
45,276 / 42,411 / 40,783 / 44,451 characters, the largest in the dataset, and all
four abstain-attempts that answered a near-miss instead.

**This is the same defect the abstention cap in `c984a0a` targets**, so the
"full-coverage-but-wrong" cell is largely not a new phenomenon: it is ABS dilution
surfacing through a different lens. Do not open a second investigation for it.

The other two are a different mode:

| question | prompt | ground truth | answer |
|---|---|---|---|
| `0edc2aef` | 30,620 | 278 chars | **empty** |
| `7a8d0b71` | 25,936 | `$2,000` | **empty** |

Both produced no answer at all — a refusal, not a reasoning error.

## 3. Correction: the abstention retry is NOT inert

P21 and P23 both reported the retry as `0 fires in both arms` and concluded it was
inert. **That is true only of the MR retry ablation, whose scope is the 121 MR
questions, and it was wrongly generalised to the whole mechanism.**

| path | n | armed | fired | recovered |
|---|---|---|---|---|
| MR | 121 | 121 | **0** | — |
| single-session | 379 | 276 | **11** | **0** |
| — IE | 150 | — | 4 | 0 |
| — TR | 127 | — | 7 | 0 |
| — KU | 72 | — | 0 | — |
| — ABS | 30 | — | 0 | — (excluded by design) |

The retry fires 11 times, always on a bare `Answer: UNANSWERABLE`, and **the
re-ask abstains again every time**. All 11 are `retryArmed: true`,
`retryFired: true`, `abstained: true`, `answer: null`, `reason: "llm"`.

Examples, all answerable questions:

| question | ground truth |
|---|---|
| `5d3d2817` (IE) | Marketing specialist at a small startup |
| `3b6f954b` (IE) | University of Melbourne in Australia |
| `71017277` (TR) | my aunt |
| `eac54add` (TR) | I signed a contract with my first client. |

So the correct statement is: **the MR retry is inert; the single-session retry
fires and has 0% yield.** Those are different defects. The second is a live bug
with a named population of 11 questions (IE 4, TR 7), and since re-asking the
identical prompt reproduced the identical refusal, the retry as built cannot fix
it — it needs a different second attempt, not the same one repeated.

## 4. A separate failure class: empty answers

38 of 500 questions produce an empty answer; **14 are wrong** (IE 4, TR 7, MR 3).
All 11 single-session cases are retry-fired bare abstentions from §3. TR is
over-represented at 7 of 14, consistent with TR being the weakest capability
(71.65%). This class is not addressed by any shipped change.

## Status

Hypotheses with a named population, not fixes. §2 says a second full-coverage
investigation is unnecessary — fold it into the ABS verdict. §3 says the retry
needs a redesign before it can earn its place, and that the `0 fires` reading in
P21/P23 must be corrected wherever it is cited.
