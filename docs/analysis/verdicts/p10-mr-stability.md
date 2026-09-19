# P10 verdict — MR error population is 70% noise, and the real set is 13 questions

**Status**: no code change. This iteration measured the *stability* of the MR error
population across all 8 recorded runs, and the result reorganises everything: the
target is not "23 errors", it is **13 deterministic ones**, and four of the nine
`ledger_wrong` cases I set out to fix are flaky rather than broken.

## 1. The finding that changes the plan

The previous verdict treated the 23 errors in run `34024745627` as the MR error
budget. Replaying all eight `benchmark-mr-diagnostics.json` files gives a
different and more useful structure:

| category | n | meaning |
|---|---|---|
| **always wrong (8/8 runs)** | **13** | deterministic engine failures |
| sometimes wrong (1–7 of 8) | 30 | run-to-run flips |
| never wrong | 78 | stable correct |

Per-run MR accuracy across the eight runs is **71.90 / 78.51 / 79.34 / 79.34 /
80.17 / 80.99 / 80.99 / 81.82 %** — a 9.9 pp spread on an identical configuration.
So of the ~23 errors a single run reports, **only 13 are real**. Roughly 70% of
any one run's error list is noise, and a fix aimed at a flaky question is
unverifiable at the single-run level.

The 13 deterministic failures:

```
0a995998  10d9b85a  129d1232  1a8a66a6  37f165cf  3fdac837  73d42213
8cf4d046  8e91e7d9  9ee3ecd6  bf659f65  gpt4_372c3eed  gpt4_731e37d7
```

Ceiling: fixing all 13 lifts the floor to **89.26%**, against a per-run best of
81.82%.

## 2. Four of the nine `ledger_wrong` cases are flaky

I set out to characterise and fix the nine `ledger_wrong` errors. Their verdicts
across the eight runs:

| id | 8-run pattern | status |
|---|---|---|
| `2788b940` | x C x C x x x x | **flaky** — 2 of 8 correct |
| `60472f9c` | x C C C C C C x | **flaky** — 6 of 8 correct |
| `a9f6b44c` | x C x C x C C x | **flaky** — 4 of 8 correct |
| `gpt4_ab202e7f` | x x C C C x C x | **flaky** — 4 of 8 correct |
| `129d1232` | x x x x x x x x | deterministic |
| `gpt4_731e37d7` | x x x x x x x x | deterministic |
| `bf659f65` | x x x x x x x x | deterministic |
| `gpt4_372c3eed` | x x x x x x x x | deterministic |
| `9ee3ecd6` | x x x x x x x x | deterministic |

Only **5** are stable enough to be worth a targeted fix. `60472f9c` is wrong in
just 2 of 8 runs — it was the case I used in P9 to argue "the model over-counts
project names", and that argument was drawn from one of its minority runs.

## 3. Two refuted mechanisms, recorded

### A unit-of-count rule does not exist

P9's leading hypothesis was that the model counts *events* where the question
wants *entities* (`a9f6b44c`: three road-bike services should be one bike). I
tested it as a general rule — read every ledger at the question's own unit and
compare to the gold (`mr_ledger_unit.py`):

**It recovers the gold in 1 of 9 cases.** It explains `a9f6b44c` and nothing
else. Direction does not save it either: the bucket contains 5 under-counts and
3 over-counts, so neither "dedupe more" nor "dedupe less" is a rule.

### `bf659f65` is not a retrieval failure

The 8-run-stable `bf659f65` (gold 3 albums, model lists 2) initially looked like
missing evidence. All 3 of its answer sessions **were** retrieved, and the
retained context contains both purchases the model listed. The context is also
full of *recommendations* ("Lorde - Melodrama", "Halsey - Manic", …) which are
not purchases — so the reader must separate bought from suggested. The third
purchase is not recoverable by purchase-verb search, and I cannot settle whether
it is present under a different phrasing or the gold is loose, because **the full
LongMemEval-S dataset is not available locally** (the file at
`/tmp/lme-data/longmemeval_s_cleaned.json` is a 0-byte placeholder). I am not
going to guess.

## 4. What this means for the next iteration

Two changes to the plan, both forced by measurement:

1. **Any MR fix must be validated on the 13-question deterministic set, not on
   single-run accuracy.** A single run cannot distinguish a 5-question
   improvement from the 9.9 pp run-to-run spread. The evaluation must report
   per-question stability across runs, the way this verdict does.
2. **The flaky 30 are a separate problem and may not be a capability problem.**
   The endpoint is documented as non-reproducible at `temperature=0`, so flips on
   identical prompts are expected. Driving those to zero is not a capability
   gain; it is a variance question, and it inflates the apparent error count
   by **1.94×** (mean 25.2 reported errors per run against 13 deterministic ones).

The honest target set is the 13, and its internal structure is now sharp:

| mechanism | n | ids | evidence |
|---|---|---|---|
| reflexive abstention | 4–5 | `37f165cf`, `73d42213`, `8cf4d046`, `8e91e7d9` (8/8) + `10d9b85a` (5/8) | bare `UNANSWERABLE`; gold derivable from retained context (P9) |
| wrong answer, identical every run | 4 | `129d1232`, `1a8a66a6`, `3fdac837`, `9ee3ecd6` | same value in 8/8 runs |
| wrong answer, near-miss | 3 | `gpt4_372c3eed` (8 vs 10), `gpt4_731e37d7` ($700 vs $720), `bf659f65` (2 vs 3) | small, systematic offsets |
| ledger right, answer wrong | 1 | `0a995998` | ledger lists 3, Step 2 says 2 (`2 2 2 1 2 2 1 2`) |

The abstention bucket is the single largest identified mechanism in the valid
target set (4–5 of 13), which is consistent with P9's independent finding on the
larger single run. The two analyses were derived from different angles — P9
classified one run by pipeline stage, this classified eight runs by stability —
and they agree.

`129d1232` is worth calling out: the model returns `$5,250` in all eight runs
where the gold is `$5,850`. A perfectly repeatable wrong answer is the signature
of a systematic reading error, not sampling noise, and it is the kind of case a
targeted fix can actually be verified on.

## 5. Method note

Scripts `mr_stability.py` (the stability matrix — the reusable output) and
`mr_ledger_unit.py` (the unit-rule refutation) back this verdict. Both read
frozen artifacts and call no model.

The stability matrix is the gate every future MR claim should pass: a fix that
does not move questions in the 13-question deterministic set has not been shown
to do anything, regardless of what a single run's accuracy says.
