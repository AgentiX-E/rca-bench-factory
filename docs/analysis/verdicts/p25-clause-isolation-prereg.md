# P25 pre-registration — isolating the abstention entity-identity sentence

**Written before run `35088866831` completes. Commit under test: `fe8a644`.**

The run that recovered the abstention block (`35019792901`, `0b0069a`) contained
**two** behaviour changes, and I labelled only one:

1. the admission cap (`admissionMode: 'hits'`, budget 30) — documented, under test;
2. an added entity-identity sentence in `buildConservativeQaPrompt` — whose own code
   comment claimed the change was a one-edit A/B, while the commit changed both.

Attribution so far, from `p24-cap-verdict.md`:

| | n |
|---|---|
| cap bound **and** verdict changed | 5 |
| cap bound, verdict unchanged | 24 |
| **cap no-op** and verdict changed | **0** |
| cap no-op, verdict unchanged | 1 |

The zero row points at the cap. But the sentence is present for all 30 questions, so
that run cannot separate the two, and the honest statement is "cap demonstrated, sentence
untested". This run tests it.

## The change under test

`ENTITY_IDENTITY_CLAUSE=0`: the sentence is omitted, the cap is retained, everything
else is byte-identical to `0b0069a`. Verified before dispatch by unit test on the
frozen prompt shape.

## Predictions

| # | prediction | prior evidence | what it would mean |
|---|---|---|---|
| P1 | ABS ≥ 26/30 **without** the sentence | the cap alone moved 5 questions, all in the bound population | the cap is sufficient; the sentence should be deleted |
| P2 | worse: the 5 recovered questions regress | the sentence is the near-miss instruction, and all 5 were answering a near-miss before | both edits are load-bearing; both stay |
| P3 | the non-ABS prompts are untouched | the sentence lives only in `buildConservativeQaPrompt`, which only `answerAbstention` uses | scoping is correct |

## What would falsify each claim

| if the result is | then |
|---|---|
| **ABS ≥ 26/30** | the sentence is not load-bearing. Delete it rather than keep an unvalidated prompt clause, and credit the cap alone. |
| **ABS < 26/30, with the 5 bound questions regressing** | both edits are load-bearing and the earlier "cap accounts for everything" line was over-confident. Report both as validated, jointly. |
| **ABS < 26/30, with the 5 bound questions still correct but others failing** | the sentence interacts with the cap rather than simply adding to it. Neither is validated in isolation; the next design change must treat them as one unit. |
| **any of IE/MR/KU/TR moving** | the sentence is reached by more than the abstention path and the scoping claim is wrong. |

## Reported alongside, not as a win

`0b0069a`'s 29/30 is `p = 0.0625` two-sided at n = 30, so the cell is directional
evidence at best. This run is a **mechanism isolation**, not an accuracy claim, and it
will be reported as a comparison of two configs on the same 30 questions — not as a
new headline.

## Note on the cap constant

The cap's stated rationale (a turn-count banding) is retracted — two instruments
measured session timestamps and called them turns. The constant is kept because it
demonstrably binds and demonstrably works, and `21007c4` records exactly that: keep
the value, distrust the reason. This run does not test the constant, so nothing here
should be read as validating the retracted rationale.

---

## Run outcome: EXECUTED — see `p25-clause-isolation-verdict.md`

**Run `35097952715`** (sha `5db414c`, conclusion `success`) completed the
isolation. Result: turning the sentence off drops ABS **29/30 → 26/30** and
overall **426/500 → 420/500**. Paired ABS: **3 regressed, 0 gained**.

**P2 failed and P1 is void as stated; both failures are informative.** The
sentence and the cap act on **disjoint** question sets, so "which one did it?"
was the wrong question. Both are load-bearing; both stay.

The full adjudication, the per-question evidence (two of the three regressions
have byte-identical `top1Score`), and the argument for why TR's −3 is variance
rather than an effect are in `p25-clause-isolation-verdict.md`.

---

## Earlier outcome: not executed (DeepSeek 402), retained for the record

An earlier dispatch of this same experiment, run `35088866831` on sha `fe8a644`,
failed 20 seconds in with:

```
##[error]LLM request failed: 402 Payment Required —
{"error":{"message":"Insufficient Balance",...}}
    at OpenAICompatibleLLM.post (openai-compatible.ts:78:13)
    at async expandDiagnosticQueries (retrieval-diagnostics.ts:107:15)
    at async computeRetrievalDiagnostics (retrieval-diagnostics.ts:152:11)
    at async main (bench/run.ts:140:27)
```

The failure was in `expandDiagnosticQueries` — the **first** LLM call on the
diagnostics path — after embedding had been fully served from cache
(`Restored 170095 embedding vectors`). No benchmark budget was consumed.

**The workflow was correct.** `ENTITY_IDENTITY_CLAUSE: 0` is visible in the job's
env block, so the dispatch input reached the job. The failure is account state,
not configuration or code.

A second dispatch (`35097631133`, same inputs) then failed at 52 seconds with
`TypeError: terminated` in undici's TLS layer — a transient network fault, **not**
a 402. `retryableFetch`'s 5 retries with exponential backoff (1+2+4+8+16 = 31 s)
were exhausted, which is consistent with a persistent rather than momentary
outage. The winning run was the third dispatch.
 — provider balance exhausted

Run `35088866831` (`fe8a644`, `ENTITY_IDENTITY_CLAUSE=0`) **failed before
producing any measurement**:

```
##[error]LLM request failed: 402 Payment Required —
  {"error":{"message":"Insufficient Balance", ...}}
  at async expandDiagnosticQueries (retrieval-diagnostics.ts:107)
```

This is a billing state, not a defect in the change. Verified in the job log
before drawing any conclusion:

| check | result |
|---|---|
| `ENTITY_IDENTITY_CLAUSE: 0` reached the job env | **yes** — visible in the step's env block |
| the failure is inside the workflow's own logic | **no** — the first LLM call after embedding determinism returned HTTP 402 |
| any measurement produced | **no** — it died during diagnostics, before the QA phase |

So the confound between the admission cap and the entity-identity sentence is
**still unresolved**, and no claim in §3 of `p24-cap-verdict.md` is strengthened or
weakened by this run. The isolating run must be re-dispatched once the DeepSeek
account is funded; the dispatch is a single command and the flag is already wired:

```
gh workflow run benchmark.yml --repo AgentiX-E/cortex --ref master \
  -f limit=0 -f runs=2 -f ablation_runs=1 -f diagnostics_limit=0 \
  -f model=deepseek-chat -f thinking=disabled -f entity_identity_clause=0
```

The predictions and falsification criteria above stand as written; they were
registered before this attempt and remain untested.

**Process note.** The failure surfaced at 11:11:02Z, roughly 20 seconds into a run
that normally takes ~78 minutes, because the harness fails fast on the first
provider error instead of retrying. That is the right behaviour — it meant a
billing problem cost one API call rather than a full run.
