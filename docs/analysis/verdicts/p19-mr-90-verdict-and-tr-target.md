# P19 — Is the MR 90.08% real? And where the next iteration should go

Run under analysis: `34791592602` (2026-09-14, `limit=all, runs=1, ablationRuns=1`,
temperature 0). Panel: 8 runs of 2026-09-06 in `/workspace/analysis/ab_rrf`.
Scripts: `analysis/scripts/p0_attribution.mjs`, `p0_recall_vs_decision.mjs`,
`p0_abstention_by_capability.mjs`, `p0_tr_mechanisms.mjs`, `p0_tr_elapsed.mjs`.

---

## 0. Correction to my own previous document

`p0-mr-90-attribution.md` states a delta of **+9 questions = +7.44 pp**. That
number is wrong. Recomputed from the same files:

| quantity | value |
|---|---|
| panel expected accuracy (121 MR questions, 8 runs) | 79.13 % |
| run 34791592602 | 90.08 % (109/121) |
| **delta** | **+10.95 pp = +13.25 question-units** |

The earlier figure used a majority-vote panel classification and dropped two of
the four cells of the flip table, so it reconciled to neither the aggregate nor
itself. The four-cell decomposition that does reconcile:

| cell | n | question-units |
|---|---|---|
| gained (panel ≤4/8 → correct) | 18 | +12.75 |
| held (panel ≥5/8 → correct) | 91 | +3.25 |
| lost (panel ≥5/8 → wrong) | 2 | −2.00 |
| never (panel ≤4/8 → wrong) | 10 | −0.75 |
| **total** | **121** | **+13.25** ✓ |

---

## 1. The confound, and why it does not explain the jump

Three engine commits (`c4ab77b`, `f35c4a4`, `236ab1b`, 2026-09-13) and one grader
commit (`cce134e`, 2026-09-12) all landed after the panel. A grader change and an
engine change produce the **same observable** — a question flipping wrong → right
— so the aggregate cannot separate them.

`cce134e` changed two things, and only two are reachable from the MR path:

1. **Judge template dispatch.** All 121 MR questions are `multi-session`, which
   routes to `defaultTemplate`. The `temporal-reasoning` off-by-one tolerance and
   the `knowledge-update` clause therefore **never reach MR**. The only relevant
   change is "contains the gold answer **or** carries all the intermediate steps"
   replacing plain "semantically equivalent".
2. **Numeric pre-gate deferral.** Before, `numericAnswerVerdict` compared the
   prediction with the *leading* number of the gold and returned `p === e`
   outright. A gold stating two acceptable values was rejected without ever
   reaching a judge. Now such a gold defers to the judge.

Separating them per question rather than in aggregate, by replaying the
**pre-`cce134e`** grader against the new run's answer strings:

| class | criterion | questions | question-units |
|---|---|---|---|
| `GATE` | the old numeric gate would itself have returned `true` — fully decidable | 12 | 8.13 |
| `IDENT` | `normalizeAnswer(answer) === normalizeAnswer(gold)` — any equivalence or containment judge agrees on an identical string | 5 | 4.13 |
| `JUDGE` | neither holds; old verdict is a judge call, **not resolvable locally** | 1 | 0.50 |

**Grader contribution from the multi-value numeric deferral: exactly 0.** No
gained question has a multi-value gold whose answer matches a non-leading value.
In particular `3fdac837` — the very case cited in `cce134e`'s commit message with
gold `"11 days (or 12 days, if April 15th to 22nd is considered as 8 days)"` —
now answers `"11 days"`, which matches the *leading* value, so the **old** gate
would have passed it too. It is an engine gain, not a grader gain.

Extending the same test to the 91 `held` questions (which were already mostly
right, so a looser grader could in principle own their residual) adds 10 more
`JUDGE`-classified questions worth 0.88 units.

> **Bound.** Of the 16.00 question-units of gross gain, at most **1.38 units
> (8.6 %, ≤ 1.14 pp)** can be attributed to the grader. At least **14.62 units
> (+12.08 pp)** are engine-attributable. **The 90.08 % is real.**

The single `JUDGE`-classified gain is `gpt4_ab202e7f` (gold `"I replaced or fixed
five items: the kitchen faucet, the kitchen mat, the toaster…"`, answer `"5"`).
Its old verdict cannot be determined without running the judge, and no API key
exists in this sandbox, so it is left as a bound rather than a claim.

---

## 2. The two regressions are unambiguously engine-caused

A regression under a *looser* grader cannot be a grading artifact, so `6d550036`
and `d851d5ba` (both 8/8 correct across the whole panel, both now wrong) are
engine regressions with no confound.

**`d851d5ba`** — *"How much money did I raise for charity in total?"*
gold `$3,750`, answer `$8,750`. The difference is exactly `$5,000`, which comes
from a session **not** in `answer_session_ids`:

> "I actually helped organize a music benefit concert at the Independent back in
> April … and raised **over $5,000** for the local music education program."

Two things are wrong. The evidence is a distractor the dataset excludes, **and**
it is hedged: "**over** $5,000" is a lower bound, so `$3,750 + over $5,000 =
$8,750` asserts a precision the evidence does not support. The hedge is a
dataset-agnostic, mathematically defensible signal; the scoping decision ("is a
music-education benefit a charity?") is not.

**`6d550036`** — *"How many projects have I led or am currently leading?"*
gold `2`, answer `3`. The retrieved context carries 18 "project" mentions across
distractor sessions, including

> "…from my Marketing Research class project, where I **led** the data analysis
> team…"

which matches the question's action verb literally. No clean signal separates it
from the two gold items. This one is a semantic-boundary failure, not a bug.

Retrieved length grew 16,587 → 17,727 chars on `6d550036` and 16,749 → 16,982 on
`d851d5ba`, consistent with the vocabulary bridge (`c4ab77b`) pulling in more
context and therefore more distractors. The 16.00-unit gross gain against 2.00
units of gross loss says the trade is strongly positive — but the loss mechanism
is real and worth a guard.

---

## 3. Where the remaining 74 failures actually are

Headline: IE 96.00 % (150), MR 90.08 % (121), KU 79.17 % (72),
TR 70.87 % (127), ABS 86.67 % (30); overall **85.20 %**, 74 questions wrong.

### 3.1 Retrieval is not the bottleneck

Strict membership test (does the text of a labelled answer turn appear in the
`retrieved` string; 30-char shingles sampled across each turn so a mid-turn
truncation does not cause a false negative):

| | NONE | SOME | ALL |
|---|---|---|---|
| failures | **2** | 6 | **66** |

Only **2 of 74** failures are genuine recall failures (both IE). **66 have every
labelled answer session's text in the prompt and are still wrong.** TR has
**zero** recall failures: 33 of its 37 failures have full evidence.

Any iteration that adds retrieval breadth is attacking 2 questions.

### 3.2 Declining is the bottleneck, and the fix was scoped too narrowly

| capability | n | abstained | abstention rate | wrongful abstentions | share of that capability's failures |
|---|---|---|---|---|---|
| IE | 150 | 4 | 2.67 % | 4 | 67 % |
| **MR** | 121 | 2 | **1.65 %** | 2 | 17 % |
| KU | 72 | 0 | 0.00 % | 0 | 0 % |
| **TR** | 127 | 15 | **11.81 %** | 15 | **41 %** |
| ABS | 30 | 26 | 86.67 % | 0 | 0 % |

`236ab1b` — "enforce the MR abstention contract instead of trusting the prompt" —
took MR to **1.65 %**. TR sits at **11.81 %**, 7.2× higher, and is the only
non-abstention capability that still declines at scale.

Of the 21 wrongful abstentions, **20 had the labelled evidence in the prompt.**
That is 27 % of all 74 failures reachable through one mechanism, and 15 of the 20
are TR.

### 3.3 What the TR abstentions are asking for

| mechanism | n | accuracy | failures | abstained |
|---|---|---|---|---|
| (A) relative-time anchor ("last Saturday", "10 days ago") | 18 | **38.89 %** | 11 | 7 |
| (B) ordering / sequence ("order of the N … earliest to latest") | 7 | **14.29 %** | 6 | 2 |
| (C) elapsed-time arithmetic ("how many days between X and Y") | 36 | 72.22 % | 10 | 4 |
| residual | 103 | 79.61 % | 21 | 7 |

(A) is 41 pp below the residual rate. (B) is the worst absolute rate but n=7.
(C) is **not** a distinct weakness — 72.22 % against a 70.33 % residual — so it is
not worth a dedicated mechanism.

The TR abstentions are dominated by relative-time anchors: *"I received a piece
of jewelry last Saturday from whom?"*, *"What kitchen appliance did I buy 10 days
ago?"*, *"What was the significant business milestone I mentioned four weeks
ago?"*. Nothing in the retrieved text contains the phrase "last Saturday"; the
absolute date must be derived from `question_date` first. This is the same
problem `2c2c635` ("add time-window annotation and deterministic-coverage arms for
TR") and `p4-timewindow-plan.md` were aimed at, and it is still open.

---

## 4. Recommended next iteration

**Port the abstention contract from MR to TR, and give TR the same
enumerate-then-audit shape MR already has.**

Two concrete changes, in this order:

1. **Deterministic relative-time anchor.** Resolve "last Saturday" / "N days ago"
   / "N weeks ago" against `question_date` into an absolute date *before*
   retrieval, and require the TR path to consider sessions carrying that date.
   This is pure date arithmetic — it needs no LLM and is fully unit-testable.
   Targets mechanism (A): 18 questions at 38.89 %.
2. **Extend the abstention contract to TR.** `236ab1b` made a bare `UNANSWERABLE`
   without a derivation attempt invalid on MR. Apply the same contract to TR: a
   TR decline must show the anchor it resolved and the dates it considered.
   Targets 15 wrongful abstentions, all with evidence present.

Explicitly **not** in this iteration: retrieval breadth (attacks 2 questions),
and mechanism (C) (no measurable weakness).

### Acceptance criteria

| # | criterion | measurement |
|---|---|---|
| 1 | TR abstention rate falls from 11.81 % to within 2× of MR's 1.65 % | ≤ 3.3 % on the same 127 questions |
| 2 | TR accuracy rises | primary endpoint; report with Wilson CI |
| 3 | No MR regression | MR must not fall below 90.08 % − 1 σ; the two known regressions (`6d550036`, `d851d5ba`) tracked individually |
| 4 | Overall accuracy rises | ≥ 85.20 % |
| 5 | The gain is not a grading artifact | re-run the §1 classification: `GATE` + `IDENT` shares reported, `JUDGE` share ≤ 1.14 pp |
| 6 | Coverage ≥ 95 % on every dimension | statements / branch / functions / lines, `pnpm check` |
| 7 | The anchor resolver is deterministic | table-driven tests over weekday names, "N days/weeks/months ago", month boundaries, and year boundaries — no LLM, no network |
| 8 | Negative control | a neuter that disables the resolver must fail criteria 1–2 |

### Test plan (TDD, written before the implementation)

- `describe('relative time anchor')` — ~14 table-driven cases: each weekday name,
  "last/this/past" prefixes, `N days|weeks|months|years ago`, `yesterday`,
  `a couple of days ago`, month and year rollover, and the ambiguous
  "last weekend". Each asserts an absolute `YYYY/MM/DD`.
- Property test: for every TR question in the dataset carrying a relative phrase,
  the resolver must produce a date that exists in that question's
  `haystack_dates`. This is the real-effectiveness gate — it fails if the
  resolver is correct in the abstract and useless on this dataset.
- `describe('TR abstention contract')` — the existing MR contract tests, mirrored:
  bare token rejected, token with a resolved anchor and considered dates accepted.
- Regression fixture for `d851d5ba`: a hedged quantity ("over $5,000") must not be
  summed into an exact total. Scope this as a **separate** follow-up; it is 1
  question and must not be bundled into the TR iteration, or the two effects
  become unattributable.

---

## 5. Known-but-not-actioned

- `gpt4_4fc4f797`: gold `"38 days. 39 days (including the last day)"`, answer
  `"37 days"`. The gold has two values so the gate defers to the judge, and the
  `temporal-reasoning` template explicitly says not to penalise off-by-one —
  37 vs 38 is off by one. The judge said no. 1 question; the wiring
  (`toJudgeQuestionType`) was checked and is correct, so this is judge behaviour,
  not a dispatch bug.
- `gpt4_ab202e7f` is the only gain whose attribution is genuinely unresolved.
- `6d550036` remains unsolved: a distractor that matches the question's action
  verb literally. No principled signal found.
