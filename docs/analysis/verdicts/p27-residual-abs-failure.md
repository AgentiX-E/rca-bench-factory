# P27 — The residual ABS failure: `6456829e_abs`

**Status:** analysis complete, no run required (zero API cost)
**Evidence:** `run_35019792901` (sha `0b0069a`, conclusion `success`) — the run that produced ABS 29/30
**Companion:** `p24-cap-verdict.md` §6 item 5, which left this question ticketed and uncharacterised
**Dataset cross-check:** `/tmp/lme-data/lme.json`, instance `6456829e_abs`

---

## 1. Headline

`6456829e_abs` is **not a retrieval failure and not a scoring failure**. It is the
**only ABS question in the entire treatment run that did not abstain**, and it
answered with a number that is *correct for the wrong question*.

The retrieval window contains the tomato fact and **omits the second answer
session entirely**. The model, holding one of the two required operands, answered
`5` — the tomato-only count — instead of abstaining. The prompt's entity-identity
sentence was designed to catch exactly this case and did not.

**This is a genuine prompt-level defect, not a dataset artifact**: the ground
truth answer itself names the failure mode ("you mentioned planting 5 plants for
tomatoes but you did not mention chili peppers").

---

## 2. What the dataset says

The `_abs` variant is derived from a parent question by swapping one operand:

| id | question | ground truth |
|---|---|---|
| `6456829e` (parent) | How many plants did I initially plant for tomatoes and **cucumbers**? | `8` |
| `6456829e_abs` | How many plants did I initially plant for tomatoes and **chili peppers**? | *"not enough information… you did not mention chili peppers"* |

Both `answer_session_ids` are the same two sessions in each variant
(`answer_743f03a1_abs_1` / `_2`), located at haystack indices **14** and **45**:

| haystack idx | session id | content | turns |
|---|---|---|---|
| 14 | `answer_743f03a1_abs_1` | *"I planted 5 tomato plants initially"* | 12 |
| 45 | `answer_743f03a1_abs_2` | *"I've got 3 plants that are producing a lot of them"* (cucumbers) | 12 |

Parent arithmetic: **5 + 3 = 8**. In the `_abs` variant the second operand is
deliberately removed from the question, which is what makes the question
unanswerable.

---

## 3. What the run did

From `run_35019792901_run/Single-session_diagnostics.json`:

```
question:        How many plants did I initially plant for tomatoes and chili peppers?
ground_truth:    The information provided is not enough. You mentioned planting 5 plants
                 for tomatoes but you did not mention chili peppers.
top1Score:       0.6642373597941456
abstained:       false
reason:          answered
llmRaw:          "5"
answer:          "5"
expansionQueries: [ 'tomatoes and chili peppers', 'initially plant', 'how many plants' ]
retrieved:       24094 chars, 256 lines, 26 header lines, 7 distinct session timestamps
```

### 3.1 The window is missing the second operand's session

Measured directly against the rendered evidence:

| probe | result |
|---|---|
| contains the 5-tomato fact | **true** |
| contains the 3-cucumber fact | **false** |
| contains any cucumber-growing mention | **false** |
| distinct session timestamps in window | 7 |

The seven sessions present are `2023/05/20 03:58`, `2023/05/22 18:16`,
`2023/05/22 21:43`, `2023/05/22 23:14`, `2023/05/22 23:28`, `2023/05/25 17:58`,
`2023/05/29 18:56`. Session 45 is not among them.

**The retrieved context is a monoculture of tomato gardening.** 24094 characters,
of which the overwhelming majority is tomato-cultivation advice across six
sessions on 2023/05/22. The evidence is *topically saturated* and *factually
half-complete*.

### 3.2 The failure is not a score-boundary artefact

Ranking all 30 ABS questions by `top1Score` and outcome:

| outcome | n | top1Score range |
|---|---|---|
| abstained correctly | 29 | 0.530 – 0.776 |
| **answered (fail)** | **1** | **0.664** |

The failing question sits **mid-distribution**. `f685340e_abs` abstained at
`0.776`; `09ba9854_abs` abstained at `0.770`. `60bf93ed_abs` abstained at
`0.530`. There is no threshold on this quantity that separates the failure from
the successes — so the failure cannot be explained as "the score was too high"
or "too low". The abstention path here is a **prompt-level judgement**, not a
score comparison, and the judgement was wrong.

### 3.3 Character count is not the discriminator either

24,094 characters is *inside* the safe region established by the P24 cap
(post-cap mean 25,410, max 31,129, all 30/30 under 32k). This question is not
oversize. It fails **for a different reason** than the five the cap recovered.

---

## 4. Why the entity-identity sentence did not fire

### 4.0 The decisive control: six structurally identical questions that abstained

The 30 ABS questions contain a **conjunctive-operand cohort** — questions whose
ground truth is the *same shape* as the failure: one operand evidenced, one
missing. All six controls abstained, and their ground truths read almost
verbatim alike:

| id | question | ground truth | outcome |
|---|---|---|---|
| `edced276_abs` | days traveling in **Hawaii and in Seattle** | *"You mentioned traveling for 10 days in Hawaii but did not mention anything about the trip to Seattle."* | **OK** |
| `e5ba910e_abs` | total cost of **headphones and the iPad** | *"You mentioned purchasing a headphone, but you did not mention the iPad."* | **OK** |
| `gpt4_70e84552_abs` | completed first, **fixing the fence or purchasing three cows from Peter** | *"You mentioned fixing the fence but did not mention purchasing cows from Peter."* | **OK** |
| `gpt4_c27434e8_abs` | started first, **Ferrari model or Porsche 991 Turbo S model** | *"You did not mention starting the Porsche 991 Turbo S model."* | **OK** |
| `gpt4_fe651585_abs` | became a parent first, **Tom or Alex** | *"You mentioned Alex becoming a parent in January, but you didn't mention anything about Tom."* | **OK** |
| `80ec1f4f_abs` | museums **or** galleries in December | *"You did not mention visitng any museum in December"* | **OK** |
| **`6456829e_abs`** | plants for **tomatoes and chili peppers** | *"You mentioned planting 5 plants for tomatoes but you did not mention chili peppers."* | **FAIL** |

The abstention machinery **is** capable of this reasoning. Serial partial-operand
collapse is therefore *not* a general model limitation — the model does it
correctly 6 times out of 7. The failure is **specific to this instance's retrieval
input**, not to its question shape.

### 4.1 What actually differs: the expansion queries

#### 4.1.0 The matched pair

`gpt4_c27434e8_abs` is a **structurally isomorphic control** for the failure —
same unknown-operand shape, second operand equally absent from the corpus — and
it succeeded. Placing them side by side isolates one variable:

| | `6456829e_abs` (**FAIL**) | `gpt4_c27434e8_abs` (**OK**) |
|---|---|---|
| question | plants for *tomatoes and chili peppers* | started first, *Ferrari or Porsche 991 Turbo S* |
| operand 1 in context | yes (`tomato`) | yes (`ferrari`) |
| operand 2 in context | **no** (`chili`) | **no** (`porsche`) |
| lines with only operand 1 | 64 | 20 |
| lines with only operand 2 | 0 | 0 |
| **expansion queries** | `["tomatoes and chili peppers", "initially plant", "how many plants"]` | `["Ferrari model", "Porsche 991 Turbo S model"]` |
| expansion shape | **fused + generic** | **decomposed, one per operand** |
| chars | 24,094 | 26,369 |
| top1Score | 0.6642 | 0.6160 |
| model output | `"5"` | `"UNANSWERABLE"` |

The two runs differ in **character count by 9%** and in **top1Score by 0.048** —
neither is a plausible cause. They differ in **expansion shape explicitly**: the
success decomposed the conjunction into one phrase per operand; the failure kept
it fused and spent its remaining budget on generic phrasings (`"initially
plant"`, `"how many plants"`) that retrieve by topic rather than by operand.

**This eliminates the strongest competing explanation.** "The second operand is
absent from the corpus, so the model could not know to abstain" is refuted by the
control, where the second operand is equally absent and the model abstained
cleanly.

### 4.1.1 The still-live competing explanation

One alternative remains that this pair does **not** rule out: `6456829e_abs` is a
**quantity** question (`"how many plants"`) and `gpt4_c27434e8_abs` is an
**ordering** question (`"which … first"`). A model may be more willing to return a
number than an ordering verdict when evidence is partial, because a number
"looks" like an answer. Under this reading the failure is question-*type* driven,
not expansion driven.

I cannot separate these on the present data. Distinguishing them requires a case
with a **quantity** question that decomposed its expansion, or an **ordering**
question that fused — neither exists in the 7-question cohort. **This is an
unresolved confound and must be recorded as one.**

It does not change R4's warrant — the fused/decomposed split is the only measured
difference and R4 targets it — but it does mean R4's prediction set must include a
quantity-control, and that a null result on R4 would not by itself vindicate the
question-type explanation.

### 4.1.2 The expansion-shape detail

| id | outcome | expansion queries |
|---|---|---|
| `6456829e_abs` | **FAIL** | `["tomatoes and chili peppers", "initially plant", "how many plants"]` |
| `edced276_abs` | OK | `["total traveling in Hawaii", "days in Hawaii", "days in Seattle", "total days traveling"]` |

The control **decomposes the conjunction**: each operand gets its own query
(`Hawaii`, `Seattle`). The failure **keeps the conjunction fused**
(`"tomatoes and chili peppers"`) and spends its remaining budget on generic
phrasings (`"initially plant"`, `"how many plants"`) that retrieve tomato content
by topic rather than by operand.

Consequence: because *chili peppers* occurs nowhere in the haystack, a fused
query can only be satisfied by the *tomato* half. The window fills with six
sessions of dense, on-topic, recent tomato-gardening material containing a
concrete number (`5`). Retrieval returns evidence that is **maximally plausible
and exactly half-complete**.

This also explains why §3.4's lexical coverage ratio did not discriminate — the
context covers five of six question tokens precisely *because* the fused query
pulled in so much on-topic tomato text. The saturation is the symptom.

### 4.2 The chain, stated once

1. Question conjoins two operands, one absent from the corpus.
2. Expansion fuses the operands into one query instead of splitting them.
3. Fused query cannot fail loudly — it silently resolves to the present operand.
4. Window saturates with single-operand evidence that contains a number.
5. The entity-identity clause asks for abstention when the question names an
   unidentified entity — singular, and readable as a property of the question as
   a whole rather than of *each operand*.
6. Model answers the answerable half: `5`.

Steps 2–3 are the **retrieval** defect; steps 5–6 are the **prompt** defect. They
compound.

---

## 4.5 The earlier mechanism sketch (superseded by 4.0–4.2, retained for the record)

The original reading of this failure — before the conjunctive cohort was
extracted — was that the prompt clause is singular and therefore gets read as a
property of the question as a whole rather than of each operand:

1. The question names **two** entities: tomatoes, chili peppers.
2. The context names **one** abundantly: tomatoes. It supplies a number, `5`.
3. The context names the other **zero times**.
4. The sentence asks for abstention when *"the question names a specific entity"*
   that is unidentified — singular, and easily read as a property of the question
   as a whole rather than of *each operand*.
5. The model resolved the tension by answering the **answerable half** of a
   two-part question, and returned `5`.

The failure mode is **partial-operand collapse**: a multi-operand question where
one operand has clean evidence and the other has none is silently reduced to the
solvable operand. This is the highest-yield abstention failure shape in the
dataset, because the retrieved context is maximally *plausible* — it is dense,
on-topic, recent, and contains a number. Nothing about it looks like missing
evidence.

### 3.4 A cheap feature does not separate it — reported because it is a negative result

Before settling on the mechanism above I tried a lexical proxy for "does the
context address every named thing in the question": take each question's content
words (>4 chars, stopwords removed), and measure the fraction that appear
anywhere in the rendered context.

| cohort | coverage ratio |
|---|---|
| the 29 correct abstentions | min **0.00**, median **0.75**, max 1.00 |
| `6456829e_abs` (the failure) | **0.83** |

**This feature does not discriminate.** The failure is above the median and well
inside the range; `60bf93ed_abs` abstained correctly at a ratio of 0.33.

One detail is nevertheless worth recording: the **single uncovered token in the
failing question is exactly `chili`** — the operand with no evidence. The
question's other five content tokens all appear, because the context is saturated
with tomato/gardening vocabulary. That is consistent with the mechanism in §4
(the context is topically plausible and factually half-complete), but the ratio
itself is not a usable detector and I am not proposing it as one.

Recorded as a negative result so it is not re-tried.

---

## 5. Why this is worth fixing rather than dismissing

> **CORROBORATION ADDED** (after `p25-clause-isolation-verdict.md`): run
> `35097952715` re-ran this question with the entity-identity sentence **off**,
> and it failed again — `answered`, `top1Score` 0.664, output `"5 tomato plants"`
> instead of `"5"`. **This question fails with the sentence both on and off.**
>
> That rules out the sentence as the mechanism, independent of the reasoning in
> §4, and confirms the defect sits on the retrieval/expansion axis that R4
> targets. It also means the ABS ceiling of 29/30 cannot be raised by any
> prompt-side tuning along this axis — the fix, if there is one, is in expansion.

- It is the **only** remaining ABS error, so it is 1/30 = 3.3pp of the ABS
  capability score, and ABS is the smallest capability bucket (n=30) where each
  question is worth 3.33pp.
- It is a **reproducible, single-instance, fully-characterised** defect with the
  dataset ground truth explicitly naming the mechanism. That makes it a clean
  test case rather than a search problem.
- It is **not** the mechanism the cap addressed, so the fix is independent of
  the P24 result and cannot regress it.

## 6. Candidate remedies

§4.0–4.2 moves the diagnosis from the prompt to the **retrieval side**. The
original remedies (R1/R2, prompt-side) are retained but demoted; the new
first-line remedy is R4.

| # | target | remedy | expected effect | risk |
|---|---|---|---|---|
| **R4** | **retrieval** | **Decompose conjunctions during query expansion**: when the question conjoins operands (`X and Y`, `X or Y`, `X vs Y`), emit one query per operand rather than a fused one | Directly removes steps 2–3 of the chain. The six controls already do this *by accident*; R4 makes it deliberate and, being an expansion-policy change, is **verifiable offline** against all 30 already-downloaded questions without an LLM rewrite | Expansion quality is model-generated, so enforcing a shape means constraining the expansion prompt; needs a check that non-conjunctive questions are unaffected |
| R1 | prompt | Tighten the clause from "names a specific entity" to an explicit **per-operand** rule: if the question conjoins N entities and the context evidences fewer than N, abstain | Addresses steps 5–6 | The six controls succeeded *without* this, so the prompt is not the binding constraint; lower expected yield |
| R2 | prompt | Add a worked example showing a two-operand question with one operand missing → abstain | Same as R1 | Prompt length; over-fitting to the example |
| R3 | — | Leave it; accept 29/30 and spend budget on MR (n=121) | ABS stays 96.7% | Forecloses a cheap win, but MR is 4× the population |

### 6.1 Why R4 is the recommendation

The conjunctive cohort of §4.0 is a **natural experiment**: six questions of
identical logical form, differing only in how retrieval happened to be phrased,
and the one that fused its conjunction is the one that failed. That is a
single-variable comparison and it points at expansion, not at the prompt.

R4 is also the only remedy whose **counter-example sweep is free**: the 29
non-target questions and their contexts are in hand, so a decomposition policy can
be evaluated for collateral damage before any benchmark run. The prompt-side
remedies (R1/R2) require a paid run to evaluate at all, and §4.0 already shows the
prompt is not where the failure originates.

## 7. The honest limitation

This is **n=1**. A single failing instance can be characterised exactly — as
done above — but it cannot establish a rate. I do not claim partial-operand
collapse accounts for other errors; it accounts for *this* error, verifiably.

The conjunctive cohort (6 OK / 1 FAIL) is a real control, and it is what makes
the expansion-shape explanation credible rather than merely plausible. But n=7
in the cohort means the association between fused expansion and failure rests on
one positive. **That is a hypothesis with a good warrant, not a measured effect
size.** Any remedy must be validated on a run, and the pre-registration for that
run must state predictions for both the target question and the 29 controls.

## 8. Recommended next step

Hold. This is a **cheap** win (offline counter-example sweep is free; one
confirmation run is not) but it is **not** the highest-value item on the board.

The board currently reads:

1. **P25 clause-isolation run** — blocked on DeepSeek balance, resolves the
   two-edit confound in `p24-cap-verdict.md`. Without it, the claim "the cap is
   load-bearing" is supported by the bound/no-op split but not by isolation.
2. **P26 retry disposition** — blocked on a decision (delete vs redesign). The
   current retry is a proven structural no-op that spends budget.
3. **This item** — a fully-orchestrated 1-instance fix, ready to implement.

Item 3 is the only one that can be *implemented* without either a funded account
or a decision. If the user wants forward motion while the account is unfunded,
the offline counter-example sweep is the concrete next artefact.
