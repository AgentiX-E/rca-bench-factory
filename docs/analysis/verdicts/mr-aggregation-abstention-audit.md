# MR Numeric/Count/Date Aggregation Abstention — Deep Audit

**Date:** 2026-09-05
**Arm under audit:** treatment (`master` = `4640c86`, post-#146)
**Scope:** the 18 distinct MR questions that abstained (49 abstentions across 4 runs)

---

## 1. Conclusion (before the evidence)

The MR abstention defect is **not one bug** — it is a cluster of distinct failure
modes with very different fixes and very different prizes. One mode is a
deterministic, root-cause-able **classification bug**: several derivation
questions are routed to the enumeration prompt, which is structurally incapable
of producing a computed answer, so the model abstains even though every operand
is verbatim in the context. That mode is the clean, high-confidence fix this
iteration targets. The other modes (retrieval misses, LLM operand-identification
lapses, enumeration under-counting, and question/data mismatches) are larger or
lower-confidence and are catalogued for later iterations, not bundled in.

---

## 2. The prompt architecture (why classification matters)

`answerSessions` routes every MR question through exactly one of two prompts:

| Prompt | Step 1 asks the model to | Produces |
| --- | --- | --- |
| `buildAggregationQaPrompt` (enumeration) | enumerate every matching item + action | a count / sum / list |
| `buildDerivationQaPrompt` (derivation) | identify the specific operand numbers | a computed value |

The router is `classifyAggregationKind`:

```ts
/\b(percentage|percent|average|mean|difference (?:in|between)|
   how much (?:more|less|faster|earlier|older)|increase in|decrease in|
   discount|cashback|minimum|maximum|how old was)\b/i  → 'derivation'
// otherwise                                                            → 'enumeration'
```

The enumeration prompt's Step 2 tells the model to *sum durations / count
distinct items / sum amounts*. A question whose answer is a **difference of two
durations or two ages** cannot be answered by that prompt: the model enumerates
items, finds no item equal to the answer, and abstains. The derivation prompt is
the only one that can subtract. So a question that *should* be derivation but is
classified enumeration is deterministically lost.

---

## 3. The confirmed classification bug (Category A)

### 3.1 "How long have I been working in my current role?" — GOLD `1 year and 5 months`

`classifyAggregationKind` returns **`enumeration`** (verified against the shipped
`dist` build). The enumeration prompt was actually used — the model's own
reasoning quotes both operands and then abstains:

> "started as a Marketing Coordinator and worked my way up to Senior Marketing
> Specialist after **2 years and 4 months**" ... "my **3 years and 9 months**
> experience in the company" ... "no session states how long they have been *in*
> the Senior Marketing Specialist role itself. Answer: UNANSWERABLE"

The arithmetic is exact: `3 years 9 months − 2 years 4 months = 1 year 5 months`
= GOLD. Both operands are verbatim in the retrieved context (the model quoted
them). This is a **4/4 abstainer** — lost on every run — and the failure is fully
deterministic: the prompt cannot express subtraction.

### 3.2 "How many years older is my grandma than me?" — GOLD `43`

`classifyAggregationKind` → **`enumeration`** (the regex has `how much older`,
not `how many years older`). Grandma is 75 (verbatim: "turned 75 recently"), the
user is 32 (`"do you think 32 is considered young"` is in the retrieved context).
`75 − 32 = 43` = GOLD. **4/4 abstainer.** Same deterministic root cause.

### 3.3 "How many years will I be when my friend Rachel gets married?" — GOLD `33`

`classifyAggregationKind` → **`enumeration`**. The retrieved context holds both
operands: `"32"` (4 occurrences) and `"next year"` (1) with `"married"` (1).
`32 + 1 = 33` = GOLD. **4/4 abstainer.**

### 3.4 "How many minutes did I exceed my target time by in the marathon?" — GOLD `12`

`classifyAggregationKind` → **`enumeration`** (`exceed ... by` is a difference).
**1/4 abstainer** — the other 3 runs answered, so the classification bug bites
only intermittently here.

### Category A prize

| Question | abst/4 | operands in context | confidence |
| --- | --- | --- | --- |
| current role (`1y5m`) | 4/4 | both verbatim (model quoted them) | certain |
| grandma older (`43`) | 4/4 | 75 verbatim, 32 present | high |
| Rachel married (`33`) | 4/4 | 32 + "next year" | high |
| marathon exceed (`12`) | 1/4 | not yet verified | medium |

**Fix:** (1) expand `classifyAggregationKind`'s derivation set to cover
duration/elapsed (`how long have I been …`), age difference (`how many years
older`), future age (`how many years old will I be when …`), and
difference-by-margin (`how many minutes … exceed … by`); (2) add the matching
arithmetic rules to `buildDerivationQaPrompt`'s Step 2 (duration difference,
age-at-event).

---

## 4. The other failure modes (catalogued, NOT bundled into this fix)

### Category B — correctly routed to derivation, but the LLM misses an operand that IS present

- **"average age of me, my parents, and my grandparents"** (GOLD `59.6`, 2/4):
  retrieved context contains `"I just turned 32 on February 12th"` verbatim, yet
  the model's Step 1 lists "my own age | not explicitly stated (only 'early
  thirties')". The operand is there; the model did not connect "turned 32" to
  "my age". `(55+58+75+78+32)/5 = 59.6` = GOLD. This is an LLM
  operand-identification lapse, adjacent to temperature variance, not a routing
  bug.

### Category C — retrieval failure: operand is in the full session, absent from the retrieved window

- **"How old was I when Alex was born?"** (GOLD `11`, 4/4): the full answer
  sessions contain `"I just turned 32 last month"` (a career-change session), and
  Alex is 21 (`"he's just 21"`). `32 − 21 = 11` = GOLD. But the retrieved window
  has Alex/21 and **no "32"** — the age session was not recalled. Retrieval
  ranking/coverage problem, not a prompt problem.
- **"What time did I reach the clinic on Monday?"** (GOLD `9:00 AM`, 4/4): the
  full session contains `"9:00"`; the retrieved window has "clinic" (3×) but no
  "9:00". Retrieval problem (or the 9:00 detail lives in a turn the window
  dropped).

### Category D — enumeration under-counting (items scattered, model stops early)

- "days attending workshops/lectures/conferences in April" (`3 days`, 4/4),
  "health devices" (`4`, 2/4), "siblings" (`4`, 2/4), "furniture" (`4`, 2/4),
  "museums in February" (`2`, 1/4), "social media breaks" (`17 days`, 1/4),
  "people reached by FB + IG" (`12,000`, 1/4). These need stronger enumeration
  or better recall, and are individually small.

### Category E — question/data mismatch or non-numeric operand (low confidence)

- "page count of novels finished in January and March" (GOLD `856` = 416+440, but
  "January"/"March" appear **0** times in the answer sessions — the novels were
  finished in other months). Likely an imperfect question/gold pairing.
- "average GPA" (GOLD `3.83`; undergraduate is only "First-Class distinction",
  no numeric GPA found). The numeric operand appears absent.
- "When did I submit my research paper…" (GOLD `February 1st`; that date is the
  *ACL conference* submission date, not the user's own submission). Ambiguous.

---

## 5. Why overall accuracy cannot validate this (methodology)

The clean fix targets ~3–4 MR questions. That is ~0.6–0.8% of the 500-question
benchmark — below the measured within-arm spread (6–7 questions/run). As with
#146, the **mechanism endpoint** is the only valid test: the MR abstention rate
on *derivation-classified* questions, before vs after, under the same-instant
4v4 protocol with an exact permutation test. Overall accuracy is reported only as
a noise-floored descriptive estimate.

---

## 6. Fix plan (P0 — this iteration)

### 6.1 Production changes (both in `natural-language-memory.ts`)

1. **`classifyAggregationKind`**: extend the derivation regex to cover
   - elapsed/duration: `how long (?:have I|has it) been …`
   - age difference: `how many years (?:older|younger)`
   - future age: `how many years (?:old )?will I be when …`
   - difference-by-margin: `how many (?:minutes|hours|days|… ) … exceed … by`
   Each addition is a *specific* lexical pattern, not a broad "is it a question
   about numbers" heuristic, so it cannot silently re-route counting questions.

2. **`buildDerivationQaPrompt`** Step 2: add explicit arithmetic rules for the
   new cases:
   - `"how long have I been [in/at/working] X"` → identify the total tenure and
     the time-to-X, then subtract: `total − time-to-X`.
   - `"how many years older is A than B"` → `age(A) − age(B)`.
   - `"how many years will I be when X happens"` → `current age + years until X`.
   - `"how many … exceed … by"` → `actual − target`.

### 6.2 Tests (TDD, before implementation)

1. Unit tests for `classifyAggregationKind` on all four new phrasings (and
   negative controls: a plain counting question must still classify
   `enumeration`).
2. Unit tests asserting `buildDerivationQaPrompt` emits each new arithmetic rule
   and that `answerSessions` routes the new phrasings to the derivation prompt.
3. A **completeness invariant** mirroring the #146 test: every `AggregationKind`
   value has a Step-2 rule, so a newly classified derivation question cannot fall
   through to a prompt with no matching instruction.
4. A **mutation test**: if the new classifier branch or the new Step-2 rule is
   removed, the relevant test must fail (proves the test is discriminating).

### 6.3 Acceptance criteria

| Criterion | Bar |
| --- | --- |
| Coverage | ≥ 95% on Statements / Branch / Functions / Lines for the touched package |
| Lint / format / typecheck / tests | `pnpm check` exit 0, zero skips |
| Mechanism A/B | 4v4 same-instant; MR derivation abstention rate ↓ with exact permutation p ≤ 0.05; guards IE/KU/TR unchanged |
| Attribution | residual 0 — the change moves only derivation-classified MR questions |
| Commit | `Lambertyan <lambertyan@agentix-e.dev>`, English comment/message |

### 6.4 Not in scope this iteration

Category B (operand-identification lapses), C (retrieval misses for the user's
age "32"), D (enumeration under-counting), and E (question/data mismatches) are
catalogued but deferred — they are larger or lower-confidence and would pollute
the attribution of a surgical prompt-routing fix.

---

## 7. The bigger prize behind Category C (next iteration candidate)

The user's age `"32"` is a **cross-question operand** that three MR questions
need ("Alex born" 11, "grandma older" 43, "average age" 59.6), and it is
retrieved inconsistently — present for "average age", absent for "Alex born".
This points to retrieval ranking/coverage, and it likely also corrupts *wrong*
answers (not just abstentions) wherever the model guesses instead of abstaining.
That is the larger, separate investigation to schedule after this fix.
