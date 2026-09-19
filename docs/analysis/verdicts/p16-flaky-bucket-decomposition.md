# P16 verdict — the flaky bucket decomposes into three mechanisms

**Status**: analysis complete. One actionable defect identified (abstention contract
violation); a fix is designed in P17. Two of the three mechanisms are **not**
engine defects and must be excluded from the engine's error budget.

## 1. Context

P14 §1 measured 30 flaky MR questions (1–7 correct of 8 runs) out of 121, and
P14 §8 ranked "reduce between-run variance" as the largest remaining prize. That
ranking was based on the bucket's *size*. This verdict tests whether the bucket is
*actionable* by decomposing it by mechanism, because a bucket driven by sampling
noise and a bucket driven by a fixable defect require opposite responses.

## 2. First cut: does the engine vary, or only the model?

For each flaky question I hashed the constructed prompt (`decision.retrieved`)
across all 8 runs.

| prompt across 8 runs | questions |
|---|---|
| byte-identical | **5** |
| varies | **25** |

Five questions flip correct/incorrect on a **byte-identical prompt**. For those,
retrieval, truncation, and the threshold are all constant, so the flip can only be
the LLM's own output. Example — `2788b940` ("How many fitness classes do I attend
in a typical week?", gold `5`):

| run | answer |
|---|---|
| 0,2,4,5,6,7 | `4` |
| 1,3 | `5` |

The gold decomposes as Zumba (Tue, Thu) = 2 + BodyPump (Mon) = 1 + Yoga (Sun) = 1
+ Hip Hop Abs (Sat) = 1 = **5**, with all four evidence sessions in the prompt. The
model answers `4` in six of eight runs. **No engine change addresses this**; it is
counting instability in the reader.

## 3. Second cut: what varies — the answer, or the abstention?

Refining the 25 varying-prompt questions by *what* differs:

| what varies | questions |
|---|---|
| the answer text itself | 23 |
| **abstain ↔ answer, with the answer itself always correct** | **7** |

The seven are the interesting set, because the model is *never wrong* when it
answers:

| question | answer it gives when it answers | gold | identical to gold |
|---|---|---|---|
| `51c32626` | `February 1st` | `February 1st` | yes |
| `80ec1f4f` | `2` | `2` | yes |
| `a96c20ee` | `Harvard University` | `Harvard University` | yes |
| `ba358f49` | `33` | `33` | yes |
| `c18a7dc8` | `7` | `7` | yes |
| `d3ab962e` | `8 miles` | `8 miles` | yes |
| `gpt4_31ff4165` | `4` | `4` | yes |

Same shape as P14 §4's four always-abstaining questions, but *partial*: the model
abstains on some runs and answers correctly on others. The loss is entirely the
abstention, never a wrong answer.

## 4. Third cut: the abstention is a contract violation, not a judgment

I classified every abstention across all 968 MR decisions by the shape of
`llmRaw`:

| `llmRaw` when abstaining | count |
|---|---|
| **bare `UNANSWERABLE`, under 40 chars, no reasoning** | **35** |
| reasoned abstention (enumerates, then concludes insufficient) | 27 |
| — answered | 906 |

The bare form is a 12-character string with no Step 1 and no Step 2. But
`buildAggregationQaPrompt` instructs:

> Work in two steps.
> Step 1 — Enumerate every item matching the question's EXACT action, one per line
> Step 2 — Compute the final answer exactly as the question asks
> End your response with a single line in the exact form: `Answer: <final answer>`

**The model is skipping the protocol it was given.** The abstention clause offers
an escape hatch — *"Respond with exactly UNANSWERABLE ONLY if the context contains
no relevant information at all"* — and the model takes it without doing the
enumeration that would have revealed the information is in fact present.

The cleanest single case is `d3ab962e` ("total distance of the hikes I did on two
consecutive weekends", gold `8 miles`):

| | run0 (FAIL) | run1 (PASS) |
|---|---|---|
| prompt hash | `dd2b1c7df5` | `dd2b1c7df5` (**identical**) |
| expansion queries | `['hike on first weekend','hike on second weekend']` | same |
| threshold value | `0.636338` | `0.605569` |
| `llmRaw` | `UNANSWERABLE` (12 chars) | `Step 1 … 5-mile hike … 3-mile loop … Step 2 … 5 + 3 = 8 miles` |

Note the failing run has the **higher** threshold score, so the numeric guard is
not the cause. The engine handed the model an identical, complete prompt and the
model declined to read it. Seven of eight runs produced the derivation.

Aggregate of the 35 bare abstentions by question:

| question | bare abstentions | note |
|---|---|---|
| `8e91e7d9` | 8 | recall — evidence absent (fixed, `c4ab77b`) |
| `10d9b85a` | 4 | recall — dilution (P13 §6) |
| `37f165cf` | 4 | benchmark defect — unsatisfiable premise (P12) |
| `gpt4_31ff4165` | 3 | contract violation |
| `51c32626` | 3 | contract violation |
| `80ec1f4f`, `ba358f49`, `5a7937c8`, `1192316e` | 2 each | contract violation |
| `6cb6f249`, `bf659f65`, `d3ab962e`, `c18a7dc8`, `gpt4_15e38248` | 1 each | contract violation |

Subtracting the three questions whose abstention has an upstream cause already
identified (`8e91e7d9`, `10d9b85a`, `37f165cf`), **11 questions lose runs to the
contract violation**.

## 5. The three mechanisms and their disposition

| mechanism | questions | actionable? |
|---|---|---|
| reasoning/counting instability on an identical prompt | 5 | **no** — reader capability, not engine |
| answer instability (the model computes a different value) | 23 | **mostly no** — blend of reader capability and residual evidence issues |
| **bare-`UNANSWERABLE` contract violation** | **14 (11 net)** | **yes** — a prompt-contract defect, deterministic to test |

## 6. Honest bounds

- The 5 identical-prompt flips establish a **floor** on this benchmark with this
  reader: ~5/121 = 4.1% of MR accuracy is unreachable by any engine change.
- The 23 answer-instability questions are not claimed as fixable here. Some may
  still be evidence defects, but the flakiness itself is not evidence of that, and
  I have no measurement separating the two.
- The contract-violation count (11 net questions) is an **upper** bound on impact.
  Removing the escape hatch cannot guarantee the model then enumerates correctly;
  it can only remove the option of declining without reading. The acceptance test
  must therefore assert the *mechanism* (a bare abstention no longer occurs on the
  frozen cases), not the accuracy.
- `37f165cf` remains a benchmark defect and stays out of the budget. `8e91e7d9`
  and `10d9b85a` have upstream causes already fixed or diagnosed, so their
  abstentions should disappear for independent reasons.

## 7. Method note

All figures come from the 8 frozen `ab_rrf/run_*` diagnostics plus
`/tmp/lme-data/lme.json`; no live model or embedding call was made, so the
abstention census is reproducible from the committed artifacts. The bare-abstention
classifier is deliberately mechanical — `llmRaw` starting with `UNANSWERABLE` and
under 40 characters — so it cannot be tuned to a desired count.
