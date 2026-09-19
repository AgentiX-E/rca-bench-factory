# P9 verdict — the aggregation critique is the wrong instrument, and I can show why

**Status**: no code change. The pass built in `4a7fddb` stays default-off, and the
ablation I planned for it is **not worth running**. This verdict records the
measurement that changed the plan.

## 1. What I set out to do, and why I stopped

P8 §6 named the next step as an ablation for `enableAggregationCritique`:

> Two-pass critique … needs a benchmark run to evaluate against the noise floor
> (MR-scoped 13 questions).

I could not run it — no API keys and the local dataset is a 0-byte placeholder —
so I did the offline work first instead, intending to justify the spend. That
work falsified the premise, so there is now nothing to spend on.

## 2. The gate bounds the critique before any measurement

Replaying the frozen `benchmark-mr-diagnostics.json` from run `34024745627`
through the engine's own exported `classifyAggregationKind` (imported, not
re-implemented):

| quantity | value |
|---|---|
| MR questions | 121 |
| enumeration (critique-eligible) | 94 |
| derivation (gate excludes) | 27 |
| total errors | 23 |
| enumeration errors | 21 |
| ↳ already abstained (critique never runs) | 7 |
| ↳ answered wrongly (true addressable set) | 14 |
| derivation errors (gate excludes) | 2 |
| **upper bound if the critique fixed every addressable error** | **+11.57 pp** |

`+11.57 pp` is a ceiling, and the MR noise floor is 13 questions ≈ 10.7 pp. The
*ceiling* is barely above the floor, so even a perfect critique would be only
marginally demonstrable. That alone would argue against the spend. The next
section shows the real number is far below the ceiling.

## 3. The errors are not membership errors

Classifying all 23 errors by the stage that actually failed
(`mr_error_stage.py`, reading each first pass's own text):

| stage | n | what went wrong | can a membership audit fix it? |
|---|---|---|---|
| abstained | 8 | model refused; evidence present | no — short-circuits before the pass |
| ledger_wrong | 9 | the enumerated set is wrong | **yes, in principle** |
| aggregation | 4 | set is right, answer derived from it is wrong | no |
| over_count | 1 | duplicate events counted as distinct | partly |
| judge_sanctioned | 1 | gold names both 11 and 12 days; we answered 12 | no — grading artifact |

**14 of 23 errors cannot be touched by a membership audit**, including the two
largest single mechanisms.

## 4. The decisive case

`0a995998`, "How many items of clothing do I need to pick up or return from a
store?", gold **3**. The first pass wrote:

```
- Navy blue blazer (dry cleaning pickup) | pick up | 2023/02/15
- Boots from Zara (exchanged for larger size, need to pick up new pair) | pick up | ...
- Boots from Zara (exchanged, old pair returned) | return | ...

Note: The exchange counts as two items: return old boots and pick up replacement boots.

Step 2 — Compute the final answer:
Distinct clothing items to pick up or return from a store: 2
Answer: 2
```

The ledger is **correct** — three entries, matching the gold. The model stated
the exchange rule itself, unprompted. Then Step 2 collapsed the two boot entries
into one. A membership audit shown this ledger reports **"No issue found"**, the
guard correctly suppresses the second call, and the error survives untouched.

Measured across the addressable set, the ledger count already equals the gold
count for `0a995998`, `3a704032`, `1a8a66a6`, `92a0aa75` — 4 of 14. For
`gpt4_ab202e7f` the ledger lists all five items and Step 2 then prints
`Distinct items: faucet, toaster, shelves, mat → 4`, dropping the coffee maker
between listing and counting.

This is a **deduplication and answer-derivation** failure, not a membership
failure. The critique attacks the wrong stage.

## 5. What the abstentions actually are

All 8 abstentions carry `reason=llm` — the model chose to refuse — on questions
whose evidence is present. Examples: "How many days did I spend attending
workshops, lectures, and conferences in April?" (gold `3 days`), "At which
university did I present a poster on my thesis research?" (gold `Harvard
University`). This is the largest bucket and is worth more than the critique's
entire addressable set, but it is a different mechanism and a different fix.

## 6. Conclusion and the corrected next step

`enableAggregationCritique` stays **default off**. It is not harmful, it is
simply aimed at a stage that is not where the errors are, and I decline to spend
a benchmark run proving a ceiling of +11.6 pp against a 10.7 pp floor.

The evidence points at a different target: **Step 2 re-derives, and gets wrong,
an answer the ledger already contains.** Two candidate mechanisms, both
falsifiable offline before any spend:

1. **Deterministic Step 2.** `extractAggregationLedger` already machine-parses
   the list, so the count could be computed in code instead of re-decided by the
   model. Directly addresses the `aggregation` bucket (4/23).
2. **Abstention recovery.** 8/23, `reason=llm`, evidence present — the largest
   single lever, orthogonal to everything above.

### A trap in mechanism 1, found before proposing it

For the four `aggregation` cases, the raw number of ledger entries already
**equals** the gold:

| id | ledger entries | gold |
|---|---|---|
| `0a995998` | 3 | 3 |
| `3a704032` | 3 | 3 |
| `1a8a66a6` | 2 | 2 |
| `92a0aa75` | 1 | 1 |

That looks like a clean win, and the obvious implementation is wrong. For
`0a995998` the two boot entries both name *Zara boots*; a naive
**distinct-item** rule returns 2, which is the model's existing wrong answer, and
the gold is 3 because an exchange is two items. The entries are distinguished by
their **action verb** (`pick up` vs `return`), not their noun. So the rule is
"count the entries the model wrote without re-deduplicating them" — the opposite
of the dedup instinct, and it would have been a regression if I had shipped the
version I first sketched.

### Mechanism 1 is also refuted, and the refutation is sharp

I modelled a deterministic Step 2 — count the parsed ledger instead of asking the
model to count again — against every frozen count question
(`mr_deterministic_step2.py`). Counting the entries **as written** fixes 3 errors
and **breaks 21 currently-correct answers**. Collapsing same-named entries does
not help: 3 fixes, 21 breaks, identical.

The cause is visible in the ledgers themselves. They are **not unit lists**:

```
- 12 rare figurines | have | 2023/05/22
- 57 rare records   | have | 2023/05/22
```

One entry is a batch of twelve; another is a batch of fifty-seven. A ledger whose
entries are aggregate quantities cannot be counted, so `raw entry count == gold`
is a coincidence that holds only for the four errors I happened to look at first.
The same structural point explains `3a704032` (the model listed 3 candidates and
*argued in Step 2* about whether the third was in-window — a judgement, not a
counting error) and `eeda8a6d` (gold 17, ledger 4 entries, both correct).

So both mechanisms I proposed in §6 are refuted by measurement:

| mechanism | modelled outcome | verdict |
|---|---|---|
| aggregation critique (`4a7fddb`) | ceiling +11.6 pp vs a 10.7 pp floor; blind to 14/23 errors | not worth a run |
| deterministic Step 2 | fixes 3, breaks 21 | rejected |

## 7. What is left, and it is one bucket

Of the 23 MR errors, every bucket now has a refuted or inapplicable fix except the
**8 abstentions** (`reason=llm`). Characterising them — the same way this verdict
characterised the critique — splits them cleanly:

| kind | n | ids | shape |
|---|---|---|---|
| bare `UNANSWERABLE` | 5 | `10d9b85a`, `51c32626`, `1192316e`, `37f165cf`, `8e91e7d9` | the entire response is the token, no reasoning |
| reasoned refusal | 3 | `a96c20ee`, `73d42213`, `8cf4d046` | the model searched and argued the evidence is absent |

The split matters because the two groups need opposite treatment, and only the
first looks recoverable. The five bare cases received **27–36 KB of retained
context each** and produced no reasoning at all.

I checked all five against the context they were actually given, and in every case
the gold is derivable from a sentence that survived into the prompt:

| id | gold | the sentence the model already had |
|---|---|---|
| `8e91e7d9` | `4` | "a family with **3 sisters**" + "I have a **brother**" |
| `51c32626` | `February 1st` | "their submission date was **February 1st**" |
| `1192316e` | `an hour and a half` | "about **an hour to get ready**" + "commute… about **30 minutes**" |
| `37f165cf` | `856` | "a novel… which had **440 pages**" (856 = 440 + 416) |
| `10d9b85a` | `3 days` | "attended a **lecture** on sustainable development… on the **10th of April**" |

So the five are not evidence-absence failures. The model was handed the answer and
returned a bare `UNANSWERABLE` without reading. The mechanism is the prompt's
abstention escape hatch being treated as the cheap exit — not retrieval, not
membership, not counting.

The three reasoned refusals may not be engine errors at all. `8cf4d046` refused
because the undergraduate GPA is recorded as "First-Class distinction" with no
numeric value, so the average genuinely cannot be computed from the context;
`73d42213` refused because the arrival time is not stated (only a departure
time). Both may be gold artifacts, which would put the real fixable count below 8.

This is a ceiling of 5 questions ≈ **+4.1 pp**, which does **not** clear the
13-question floor on its own. It has to be paired with real progress on the
`ledger_wrong` bucket (9 errors) before it justifies a benchmark run: even 8 of
23 errors fixed is ≈ +6.6 pp, still under the floor. The honest framing is that
MR needs several real fixes together, not one.

## 8. Method note

Three scripts back this verdict, all reading frozen artifacts only:

- `mr_critique_eligibility.py` — bounds the eligible population. It re-derives
  `kind` from the engine's own rule in Python, and the counts were cross-checked
  against the engine's exported `classifyAggregationKind` run through vitest on
  the same file: both produce 94 enumeration / 27 derivation, 14 addressable
  errors, ceiling +11.57 pp. The two implementations agree on this dataset.
- `mr_error_stage.py` — attributes each error to a pipeline stage from the first
  pass's text. It was corrected twice while being written: the first version
  classified by `bullets == gold` alone and mislabelled abstentions as membership
  errors; the second tripped on an empty leading-number parse. Both corrections
  are in the committed script.
- `mr_deterministic_step2.py` — models a rule-based Step 2 against every frozen
  count question, reporting fixes and breakages together. Its result (3 fixed,
  21 broken) is what refuted mechanism 1.

None of them calls a model, so this analysis is reproducible at zero cost.
