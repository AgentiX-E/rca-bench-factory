# Iteration #146 — KU no-qualifier abstention defect

Status: **ACCEPTED — see `/workspace/analysis/ku-no-qualifier-verdict.md`**

Measured result (4v4 same-instant A/B): KU `other` abstention 14.36% → 4.26%
(−10.11pp, exact permutation p = 0.0143); KU accuracy 75.35% → 79.51% (+4.17pp,
exact permutation p = 0.0143); attribution residual 0; guards IE/MR/TR unchanged.

This iteration REPLACES the previously proposed #146 (`flu` operand identification)
and #147 (`ABS` abstention). Both were voided by measurement — see §1.

---

## 1. Why the previous plan was voided (measured, not assumed)

### 1.1 `flu` operand identification — DEAD

`370a8ff4` "How many weeks had passed since I recovered from the flu when I went
on my 10th jog outdoors?"

| Item | Value |
| --- | --- |
| flu-recovery turn | `2023/01/19` ("finally recovered from the flu **today**") |
| 10th-jog turn | `2023/04/10` ("I went on my 10th jog outdoors **today**") |
| Correct interval | 81 days = 11.57 weeks → `12` |
| Engine output | `"12"` — **operands and arithmetic both correct** |
| Gold | `15` (= 105 days) |
| Widest span in the whole retrieved context | `2023/01/05 → 2023/04/10` = 95 days = 13.57 → `14` weeks |

`15` is unreachable from every pair of dates in the context. The engine is not
picking the wrong operands; the earlier flu session the gold needs was never
retrieved. **This is a retrieval problem, and no engine change can produce `15`.**

Supporting census (`tr_gold_reachability.mjs`, calls the SHIPPED engine so
nothing is reimplemented): of the 24 machine-comparable `relative` TR questions,
**21 are reachable exactly and 23 within ±1**. The `relative` subclass is not
where the headroom is.

### 1.2 `ABS` abstention — NEVER EXISTED

I previously reported "ABS 0/30, zero abstentions, the engine fabricates every
answer". That was wrong: I read the `nl-naive-baseline` arm, which is a
deliberately non-abstaining comparison baseline, not the cortex system.

The cortex arm (`nl-abstain-feature`) scores **ABS 30/30 with 30/30 correct
abstentions — 100%, on all four runs.**

---

## 2. True state of the benchmark (treatment arm, 4 runs)

| Capability | Correct / total | Accuracy |
| --- | --- | --- |
| IE | 142.25 / 150 (avg) | 94.8% |
| MR | 87.0 / 121 | 71.9% |
| KU | 53.0 / 72 | 73.6% |
| TR | 93.75 / 127 | 73.8% |
| ABS | 30 / 30 | **100%** |
| **Overall** | **406.0 / 500** | **81.20%** (80.40 / 81.80 / 81.20 / 81.40) |

Excluding ABS, the cortex arm scores 80.2% on the other 470 questions versus
**80.6%** for the naive baseline. **The abstention channel is net-negative
outside ABS**; the entire +5.6pp comes from ABS 0 → 30.

`abstentionCorrectRate = 46.2%`: of 65 abstentions, 30 are correct (all ABS) and
**35 are wrong — the system says "I don't know" on answerable questions. That is
7.0% of the benchmark.**

---

## 3. Root cause of the 35 wrong abstentions

`buildKnowledgeUpdatePrompt` commits the model to a two-step contract. Step 2
offers three mutually exclusive branches:

```
Step 2 — Pick the value matching the time qualifier:
  - "previous", "before", "originally", "used to"     -> the EARLIER (older) value
  - "currently", "now", "most recent", "latest", ...  -> the LATER (newer) value
  - "still", "same", or a Yes/No question             -> compare the turns, answer Yes or No
```

**There is no branch for a question that carries no time qualifier at all.**

`classifyKnowledgeUpdateQualifier` returns `'other'` for exactly those questions,
and the routing guard in `answerKnowledgeUpdate` is
`qualifier !== 'other' && ...` — so `'other'` questions BOTH skip the bitemporal
path AND land in the incomplete Step 2. The prompt defines no terminal for an
unsatisfiable Step 2 except the abstain token.

### 3.1 Measured consequence (`ku_qualifier_census.mjs`, 4 runs pooled)

| Qualifier | N / run | Abstained / run | Abstention rate | Gold verbatim in context |
| --- | --- | --- | --- | --- |
| `previous` | 10.0 | 1.00 | 10.00% | 1.0 / 1.0 |
| `current` | 15.0 | **0.00** | **0.00%** | — |
| **`other`** | **47.0** | **7.00** | **14.89%** | **6.8 / 7.0** |

`'other'` vs `'previous'+'current'`: 14.89% vs 4.00%, **z = 2.801**.
`'current'` abstains **0 / 60** across four runs — abstention is not intrinsic to
KU, it is specific to the `'other'` path. `'other'` is **65% of KU** (47/72).

Per-run counts are byte-identical across all four runs
(`current: 0/15, other: 7/47, previous: 1/10`), so this is structural, not noise.

### 3.2 The failures are unambiguous

| Question | Gold | Verbatim evidence in the retrieved context | top1 |
| --- | --- | --- | --- |
| Where am I planning to stay for my birthday trip to Hawaii? | `Oahu` | "I'm actually planning to stay **on Oahu**" | 0.670 |
| How long have I had my cat, Luna? | `9 months` | "I've had my cat, Luna, for about **9 months** now" | 0.687 |
| How long have my parents been staying with me in the US? | `nine months` | "they've been staying with me for **nine months** now" | 0.709 |
| How much time do I dedicate to coding exercises each day? | `about two hours` | "dedicating **about two hours** each day" | 0.752 |
| How often do I see my therapist, Dr. Smith? | `every week` | "I see Dr. Smith **every week**" | 0.669 |
| How many free night's stays can I redeem at Hilton? | `Two` | "enough points for **two** free night's stays" | **0.911** |
| What new kitchen gadget did I get before the Air Fryer? | `Instant Pot` | "using my new **Instant Pot**" | 0.677 |

### 3.3 The codebase already contains the fix pattern

`buildAggregationQaPrompt` (MR) carries explicit anti-abstention guardrails:

```
'Combining facts across several sessions is NOT a reason to abstain.',
'If the answer can be computed from facts already in the context ... compute it.
 Needing to derive the answer is NOT a reason to abstain.',
```

`buildKnowledgeUpdatePrompt` has **none**. The KU prompt is simply missing the
treatment the MR prompt already received.

---

## 4. Fix

Two edits to `buildKnowledgeUpdatePrompt`, in `src/natural-language-memory.ts`:

1. Add a **fourth Step-2 branch** covering the no-qualifier case: report the
   value as stated; when the subject had several values, report the one from the
   LATEST turn.
2. Add **anti-abstention guardrails** mirroring the proven MR pattern: an absent
   time qualifier is not a reason to abstain, and finding only one value is not a
   reason to abstain.

Deliberately NOT done:

- **Widening `classifyKnowledgeUpdateQualifier`.** It would reclassify only 1 of
  the 7 failing questions (e.g. "after her recent relocation") while carrying
  the risk of flipping a genuinely `previous` question to `current`, which the
  deterministic bitemporal path would then answer with the wrong value. Bad
  risk/reward — deferred.
- **Routing `'other'` into the bitemporal path.** For a multi-value `'other'`
  question the correct qualifier is genuinely undetermined, so a deterministic
  earliest/latest pick would be a guess. The prompt fix handles it better.

---

## 5. Test plan (TDD — tests written and observed failing BEFORE the fix)

1. **Completeness invariant** — *the test whose absence let this ship.* For every
   value in `classifyKnowledgeUpdateQualifier`'s codomain, the prompt MUST
   contain a matching Step-2 selection rule. Each row first asserts the fixture
   really classifies to that qualifier, so the table cannot silently rot. Adding
   a fourth qualifier to the classifier will now break this test until a rule is
   added.
2. The no-qualifier branch is present and names the LATEST-turn tie-break.
3. Guardrail: an absent time qualifier is explicitly not a reason to abstain.
4. Guardrail: a single value is explicitly not a reason to abstain.
5. Wiring test: the prompt actually handed to the LLM by
   `answerKnowledgeUpdate` for a no-qualifier KU question carries the new branch
   (guards against the prompt being replaced or bypassed in the KU path).

## 6. Acceptance criteria

| # | Criterion | Threshold |
| --- | --- | --- |
| A1 | `pnpm check` green | lint + typecheck + test + format |
| A2 | Coverage, **every** dimension (statements / branches / functions / lines) | **>= 95%** |
| A3 | New tests fail against the pre-fix prompt, pass after | RED -> GREEN |
| A4 | **Primary (mechanism): KU `'other'` abstention rate** | 14.89% baseline, must fall materially |
| A5 | **Co-primary: KU accuracy** | 73.6% baseline |
| A6 | Guard: overall accuracy | no regression beyond the measured null noise floor |
| A7 | Guard: IE / MR / TR / ABS unchanged | structural — the prompt is reachable only from `q.questionType === 'knowledge-update'` |

### 6.1 Why the primary endpoint is a mechanism, not overall accuracy

Expected effect: ~7 recovered abstentions per run, 6.8 of which hold the gold
verbatim. Even at a 50% recovery that is +3.4 questions = **+0.68pp overall**,
which is comfortably **below** the ~1.7–2.1pp between-window drift measured for
byte-identical code. Overall accuracy therefore cannot resolve this change; the
abstention-rate mechanism endpoint can, because it is denoised by construction.

Note that on a non-ABS question an abstention scores 0, so switching
abstain -> answer is never negative in expectation.

## 7. Validation protocol

Same-instant 4 + 4 A/B (never staggered — time-of-day drift invalidates
staggered designs). Mechanism endpoints primary; accuracy reported as a
noise-floored descriptive estimate with Wilson 95% CI and paired McNemar.

---

# Iteration #148 — per-attempt request deadline in `retryableFetch`

Status: **fixed, verified end-to-end against a real socket**

## Root cause

`retryableFetch` had no deadline of any kind. Retrying only helps when an
attempt actually SETTLES: a request that is accepted and then stalls (a reset or
half-open connection) leaves the loop awaiting a promise that never settles, so
`maxRetries` never runs and the caller hangs indefinitely. A full benchmark run
was lost this way to `TypeError: terminated`.

## Fix

`src/retry.ts`:

1. A **fresh `AbortSignal.timeout` per attempt**. An `AbortSignal` is
   single-use, so a signal created once before the loop would already be
   aborted by the time the retry ran — every retry would fail instantly and the
   retry budget would be spent without a single request reaching the server.
2. A caller-supplied `init.signal` is preserved and combined via
   `AbortSignal.any`, so an outer cancellation still wins.
3. `timeoutMs: 0` opts out.
4. The three tuning knobs moved into a `RetryOptions` object. Positionally they
   read `retryableFetch(fn, url, init, 5, 1000, 60000)`.

`timeoutMs` is threaded through both adapters (`OpenAICompatibleLLMOptions`,
`OpenAIEmbeddingOptions`) so it is configurable end-to-end.

## Verification

### Unit tests (16 in `retry.test.ts`, TDD: 9 observed failing before the fix)

| Mutation injected | Result |
| --- | --- |
| Signal hoisted out of the loop (reused across retries) | **caught** — `[false,true,true] ≠ [false,false,false]` |
| No deadline installed | caught by 4 tests |
| Caller-supplied signal ignored (`AbortSignal.any` -> deadline) | caught by 2 tests |

The first row matters: an earlier version of the "fresh deadline" test hung only
on the first call and answered on the second, so the retry path never consulted
the signal and **the mutant survived a fully green run**. The test was rewritten
to assert the signal state each attempt receives, which is deterministic and
kills it.

### End-to-end against a real socket (`verify_retry_timeout_e2e.mjs`)

Needed because `AbortSignal.timeout()` uses an **unref'd timer** in Node: it
does not keep the event loop alive, so every fake-based unit test exercises the
deadline only while the test runner holds the loop open. None proves the
deadline fires on a genuinely stalled socket.

```
PASS  stalled socket is aborted by the deadline — TimeoutError
PASS  abort happens at the deadline, not before — 302ms >= 300ms
PASS  abort happens promptly after the deadline — 302ms < 1800ms
PASS  every retry was attempted (3 attempts)
PASS  three independent deadlines elapsed — 906ms >= 900ms
PASS  default deadline is 60s
```

## Acceptance

`pnpm check` green: 693 tests across 4 packages
(core 87, node 16, llm 41, eval 549). Lowest coverage on any dimension in any
package: **97.22%** (threshold 95%).
