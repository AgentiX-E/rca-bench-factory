# P14 verdict — the MR bottleneck is aggregation, not retrieval

**Status**: analysis complete. This verdict **supersedes the working assumption**
that retrieval recall is the dominant MR defect, and reassigns the priority order
for the remaining iterations. No code change is proposed here; the fix design for
the two live defects follows in P15.

## 1. The failure budget, measured over 8 frozen runs

121 MR questions, 8 runs:

| class | count | share |
|---|---|---|
| stable correct (8/8) | **78** | 64.5% |
| stable wrong (0/8) | **13** | 10.7% |
| flaky (1–7/8) | **30** | 24.8% |
| **mean accuracy** | — | **79.13%** |

The 30 flaky questions sit on a knife edge for reasons P10 already characterised
as a between-run noise floor; they are not the target of a recall fix. The **13
stable-wrong** questions are the deterministic defect set, and they are the only
place where a fix can be proven rather than inferred.

## 2. Only 3 of the 13 stable failures are recall failures

For each stable failure I checked whether the gold session content is actually
present in the logged prompt, using user-turn shingles as the needle:

| question | gold sessions in prompt | diagnosis |
|---|---|---|
| `8e91e7d9` | **0 / 2** | recall — vocabulary gap (fixed, `c4ab77b`) |
| `10d9b85a` | **1 / 2** | recall — dilution (session 39 lost) |
| `1a8a66a6` | **2 / 4** | recall — two sessions lost |
| `gpt4_372c3eed` | **2 / 3** | recall — one session lost |
| `0a995998` | 3 / 3 | **aggregation** — answered `2`, gold `3` |
| `129d1232` | 3 / 3 | **aggregation** — `$5,250` vs `$5,850` |
| `gpt4_731e37d7` | 4 / 4 | **aggregation** — `$700` vs `$720` |
| `bf659f65` | 3 / 3 | **aggregation** — answered `2`, gold `3` |
| `9ee3ecd6` | 3 / 3 | **aggregation** — `300 points` vs `100` |
| `3fdac837` | 3 / 3 | **judge-template boundary** — gold `11 days (or 12 days, …)`; model said `12` under the `default` template |
| `73d42213` | 2 / 2 | **abstention** — answered `UNANSWERABLE`, gold `9:00 AM` |
| `8cf4d046` | 2 / 2 | **abstention** — answered `UNANSWERABLE`, gold `3.83` |
| `37f165cf` | 2 / 2 | **benchmark defect** — unsatisfiable premise (P12) |

**10 of 13 retrieve all the evidence and then fail anyway.** Retrieval recall is
the minority cause.

## 3. The aggregation failures are systematic, not scattered

The five aggregation failures share a recognisable shape:

| question | gold | model | error class |
|---|---|---|---|
| `0a995998` | `3` | `2` | undercount by 1 |
| `bf659f65` | `3` | `2` | undercount by 1 |
| `129d1232` | `$5,850` | `$5,250` | operand selection |
| `gpt4_731e37d7` | `$720` | `$700` | operand selection |
| `9ee3ecd6` | `100` | `300 points` | scope error |

Two of these are **off-by-one undercounts on a small integer** — the signature of
missing one evidence session that *is* in the prompt but is not salient, which is
a *prompt-assembly* defect rather than a retrieval defect. Two more are wrong
operands from a set of retrieved numbers, and one is an exact-value question
answered with a plausible near-miss.

`3fdac837` needs a separate note, because my first reading of it was wrong. Its
question type is `multi-session`, so `toJudgeQuestionType` routes it to the
**`default`** template — the one template that deliberately omits the off-by-one
tolerance the `temporal-reasoning` template grants. Yet its gold answer is
`11 days (or 12 days, if April 15th to 22nd is considered as 8 days)`, which
sanctions `12` in its own text. So the model's `12` is likely *correct* and the
verdict is a **grading boundary**, not an engine failure.

Scope of that boundary, measured over all 500 instances: **3** have a gold answer
that names an alternative with `or` plus a digit, and **2** of those are
`multi-session`. It is therefore a real but narrow artefact — worth recording in
the error budget, not worth an iteration of its own, and it must be excluded from
the count of engine defects or it inflates the apparent aggregation problem.

## 4. Abstention is over-firing on answerable questions

Across 8 runs, abstention counts per question:

| runs abstained (of 8) | questions |
|---|---|
| 0 | **104** |
| 1 | 6 |
| 2 | 3 |
| 3 | 1 |
| 4 | 2 |
| 7 | 1 |
| 8 | **4** |

The four always-abstaining questions are `73d42213`, `8cf4d046`, `37f165cf`,
`8e91e7d9` — and **not one of them is an `_abs` question**. Every one is an
over-abstention on an answerable question.

But abstention is a **symptom, not the cause**, and my first reading of these four
was wrong on two of them. Each abstention has a distinct upstream cause, and
"the abstention threshold is too aggressive" is true for none:

| question | model behaviour | actual cause (§9) |
|---|---|---|
| `8e91e7d9` | `UNANSWERABLE` | recall — evidence never retrieved (fixed, `c4ab77b`) |
| `8cf4d046` | `UNANSWERABLE` | **truncation** — the `3.86` turn was cut from a retrieved session |
| `73d42213` | `UNANSWERABLE` | **reasoning** — both operands retrieved, never combined |
| `37f165cf` | `UNANSWERABLE` | benchmark defect — unsatisfiable premise (P12) |

`73d42213` is the instructive one. Its prompt contains *both* required facts —
"left home at 7 AM on Monday" and "it took me two hours to get to the clinic" —
and the model's own trace recites them, then declares arrival time unstated:

> "I left home at 7 AM on Monday for my doctor's appointment" — but that is
> departure time, not arrival time. … no exact arrival time is given
> ... Answer: UNANSWERABLE

So it **retrieved both operands and failed the addition**. That is a
multi-hop-reasoning defect, and no retrieval, truncation, or threshold change
touches it. Relabelling it an "over-abstention" would have sent the next
iteration at the wrong component.

## 5. The root mechanism behind the dilution cases

The evidence lives overwhelmingly in **user** turns, and the index is dominated by
**assistant** turns. For `10d9b85a` (44 sessions, 466 turns):

| | turns | chars | avg chars |
|---|---|---|---|
| user | 232 | 56,838 | **244** |
| assistant | 234 | 434,347 | **1,856** |

Assistant turns are **50.2% of turns but 88.4% of characters** — **7.58× longer**
on average. A topical query therefore matches long, diffuse assistant boilerplate
more readily than the short, specific user statement that carries the answer.

The purest evidence is the `workshop` cohort of `10d9b85a`:

| session | contains `workshop` | retrieved |
|---|---|---|
| 11 | assistant turns only | yes |
| 14 | assistant turns only | yes |
| 31 | assistant turns only | yes |
| **39** | **the only user-attendance turn**, with the April dates | **no** |

The channel retrieved every session that merely *mentions* workshops in assistant
prose and dropped the single session where the user reports *attending* one. That
is the dilution defect stated as a single sentence.

## 6. A benchmark-side defect, scoped

31 of 133 `multi-session` instances (23.3%) have all haystack sessions stamped on
one calendar day while their content names other dates — verified in the source
JSON, with the loader passing `haystack_dates` through unchanged. For questions
whose answer depends on a *session* date, the prompt is internally contradictory.
This is a dataset defect and must be excluded from the engine's error budget, not
"fixed" in the engine.

## 7. The truncation defect, measured and sized

`truncateSession` keeps user turns **in arrival order, greedily, until the
`maxSessionChars = 2000` budget is spent** (Pass 1 of `truncateSession`,
`natural-language-memory.ts`). Its stated invariant is "keep as many *complete*
user turns as fit", which is a reasonable objective — but it is blind to *which*
user turn carries the evidence, so an early social turn can spend the budget that
a later factual turn needed.

Measured over the frozen run and the dataset:

| quantity | count |
|---|---|
| MR gold sessions longer than 2000 chars | 344 |
| … that lose ≥1 user turn to truncation | **64 (18.6%)** |
| gold sessions present in the prompt AND truncated | 309 |
| … that lose a whole user turn | **59 (19.1%)** |
| … that lose a user turn **containing a digit** | **13** |

A digit-bearing user turn is where quantitative evidence lives, so the 13 are the
candidate damage set. Their realised accuracy, however, is the check that matters:

| question | accuracy | verdict |
|---|---|---|
| `gpt4_731e37d7` | 0/8 | **real** — but the cause is salience, see below |
| `73d42213` | 0/8 | **not truncation** — operands were present (§4) |
| `8cf4d046` | 0/8 | **real** — the `3.86` turn was dropped |
| the other 9 | mostly 8/8 | dropped turn was not decisive |

**Honest sizing: the truncation defect accounts for 1 of the 13 stable failures
with certainty (`8cf4d046`), not 59.** The 59 figure measures how often the
function discards a user turn, which is a *mechanism* count; the accuracy impact
is filtered through whether the discarded turn was the decisive one, and for 9 of
the 13 digit-bearing cases it was not. Reporting the 18.6% as an accuracy loss
would be exactly the kind of overclaim this project's method notes exist to
prevent.

`gpt4_731e37d7` deserves its own line because it looks like truncation and is not.
Its gold `$720` decomposes as `$500` (digital marketing, idx 23) + `$200` (writing,
idx 21) + **`$20` (a yoga workshop, idx 17)**. The model produced `$700`, dropping
the `$20`. The `$20` turn is present in the prompt — it opens on photography and
mentions the yoga workshop and its price mid-turn, so it is an
**evidence-salience** failure inside a long turn, not a truncated turn. This is
the same family as `10d9b85a` §5 and is a prompt-assembly problem.


## 8. Revised priority order

| # | target | questions | evidence | tractability |
|---|---|---|---|---|
| 1 | `truncateSession` evidence-blind selection | 1 certain (`8cf4d046`); 59 mechanism-wide | §7 | high — a pure function, unit-testable offline, no API |
| 2 | multi-hop reasoning (retrieve-and-add) | 1 (`73d42213`) | §4 | low — needs a live model; endpoint non-reproducible |
| 3 | evidence salience inside long turns | 3 (`10d9b85a`, `gpt4_731e37d7`, `1a8a66a6`) | §5, §7 | medium — prompt-assembly, measurable offline |
| 4 | residual recall dilution | 2 (`10d9b85a`, `gpt4_372c3eed`) | §2 | medium |
| — | judge-template boundary | 1 (`3fdac837`) | §3 note | excluded — grading artefact |
| — | benchmark defect | 1 (`37f165cf`) | §6 | excluded from budget |

**Why truncation goes first despite the smallest proven accuracy impact.** It is
the only item on the list that is a **pure function over strings**, so it can be
specified, tested, and regression-checked entirely offline — which matters
because the embedding endpoint is not reproducible, so every retrieval-side claim
inherits sampling variance. A defect with a certain one-question impact and a
deterministic test is a better next iteration than a defect with a larger paper
impact that cannot be measured reliably.

**Honest bound.** The 13 stable failures are 10.7 pp of the 121-question MR set;
resolving every one except the benchmark defect caps at **89.26%** MR accuracy on
this frozen set, matching the ceiling computed in P10. The 30 flaky questions are
the larger prize and remain gated on reducing between-run variance, a separate
problem from every item above.

## 9. Why this reassignment matters

The previous iteration (`c4ab77b`) was justified by the assumption that recall was
the bottleneck. On the measured evidence that assumption held for only 3 of the 13
stable failures. Continuing to mine recall would have spent the next several
iterations on a channel already retrieving 10 of the 13 answers.

My own first pass at this section also drew the wrong conclusion, and the
correction is worth recording: I initially labelled the four always-abstaining
questions as "over-abstention defects", which would have pointed the next
iteration at the abstention threshold. Reading each model trace showed the
threshold is innocent in all four — the causes are recall, truncation, reasoning,
and a benchmark defect respectively. **The abstention flag is a symptom that
indexes a heterogeneous set of causes, and treating it as a cause would have been
a measurement error of exactly the kind P11 was written about.**

## 10. Method note

All figures derive from the 8 frozen `ab_rrf/run_*` diagnostics plus
`/tmp/lme-data/lme.json`; no live embedding calls were made, so every number is
reproducible from the committed artifacts. The needle test in §2 uses 8-word user
shingles, which is a *lower* bound on presence — a session could be in the prompt
with different truncation and still be scored absent. That direction of error is
conservative for the "10 of 13 are not recall failures" claim: a stricter needle
would only move questions *out* of the recall bucket.

The §7 mechanism counts (59 sessions losing a user turn, 13 losing a digit) were
produced by reimplementing `truncateSession`'s two-pass algorithm in Python and
running it over the dataset, then cross-checking the specific cases against the
logged prompt. The reimplementation is a *model* of the TypeScript function, not
the function itself; the three cases it predicts as decisive (`8cf4d046`,
`73d42213`, `gpt4_731e37d7`) were each verified individually against the prompt
text, and that per-case verification is what reduced the count from 13 to 1.
