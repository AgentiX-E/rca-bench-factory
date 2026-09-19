# P20 — The abstention retry was inert by construction: two faults, neither visible alone

Iteration: commit `a3a354e`. Measurement run: `34915402976`.
Baseline for every number here: run `34791592602` (2026-09-14, `limit=all`,
`runs=1`, `ablationRuns=1`, temperature 0).

---

## 0. What I set out to do, and why I did something else

`p19-mr-90-verdict-and-tr-target.md` §4 recommended an iteration with two parts:
build a deterministic relative-time anchor resolver, and port the MR abstention
contract to TR. Ten minutes into reading the code I found that **the anchor
resolver already exists** — `resolveTimeRange` in `temporal-engine.ts`, with a
dedicated `eventLookup` classification for exactly the "what did I do two weeks
ago" shape, plus `extendedTimeRange` / `extendedSecondEventReference` refinements
that have already been ablated.

So the premise of clause 1 was wrong. I re-derived the target from the data
before writing code, and the recommendation changed. The measurement that
falsified it is in §1; it is cheap and worth repeating for any future claim about
this path.

What survived from P19 is clause 2, and it turned out to be larger than described.

---

## 1. Two zero-cost measurements that redirected the iteration

**Measurement A — does the anchor resolver reach the failing questions?**
For each of the 18 relative-time-anchored TR questions, resolve the time window
under `DEFAULT_ENGINE_OPTIONS` and under `EXTENDED_ENGINE_OPTIONS`, then ask
whether the window contains the date of a session the dataset labels as carrying
the answer (`analysis/scripts/p0_anchor_reach.mjs`):

| | window contains the evidence |
|---|---|
| DEFAULT (`extendedTimeRange: false`) | 10 of 18 |
| EXTENDED (`extendedTimeRange: true`) | 14 of 18 |
| of the 11 FAILING questions, DEFAULT | **6** |
| of the 11 FAILING questions, EXTENDED | **9** |

EXTENDED reaches 4 questions DEFAULT cannot (3 of them currently failing), so the
refinement is real. But **9 of the 11 failures already had the evidence inside the
window**, so the window is not what is failing them. Enabling the flag is a
2-question change at best, and it also affects retrieval rather than just the
prompt, so it is not a safe first move.

*(The ablation agrees, and this is the same conclusion from the other direction:
`tr-extended-engine` 70.87 % vs `tr-base-engine` 70.08 % — one question. That
ablation was already in the run and I had not read it.)*

**Measurement B — is the evidence in the prompt at all?**
This is the one that decided the iteration. For every failure, test whether the
text of a labelled answer turn survived into `retrieved`, using 30-character
shingles sampled across each turn so a mid-turn truncation cannot create a false
negative (`analysis/scripts/p0_recall_vs_decision.mjs`):

| | NONE | SOME | ALL |
|---|---|---|---|
| failures (n=74) | **2** | 6 | **66** |

Only 2 of 74 failures are retrieval failures, both IE. So the problem is not
reaching the evidence.

The concentration is in *declining*:

| capability | n | abstained | rate | **wrongful** | share of that capability's failures |
|---|---|---|---|---|---|
| IE | 150 | 4 | 2.67 % | 4 | 67 % |
| MR | 121 | 2 | 1.65 % | 2 | 17 % |
| KU | 72 | 0 | 0.00 % | 0 | 0 % |
| **TR** | 127 | 15 | **11.81 %** | **15** | **41 %** |
| ABS | 30 | 26 | 86.67 % | 0 | 0 % |

`236ab1b` ("enforce the MR abstention contract") took MR to 1.65 %. TR sat at
11.81 %, **7.2× higher**, and TR was not the only one: IE declined 4 times and got
all 4 wrong. 21 abstentions outside the abstention capability, **all 21 wrong**.

And of those 21, **20 had the labelled evidence in the prompt** — every one of the
15 TR, both MR, 3 of the 4 IE.

Those are not verdicts and not retrieval failures. They are skips, and the engine
already had a bounded re-ask written for exactly that. It reached none of them.

---

## 2. Why the retry reached none of them: two independent faults

**Fault 1 — the scope.** `answerSessions` (the multi-session path) computed
`abstentionRetryEnabled` and passed it down. Every other caller — `answer`,
`answerTemporal`, `answerAssistant`, `answerKnowledgeUpdate`, `answerPreference` —
called `respondWith` without the argument, and the parameter defaulted to `false`.

**Fault 2 — the detector, and this is the one that would have hidden fault 1's
fix.** `detectBareAbstention` tested the raw response against the token:

```ts
return isAbstentionValue(raw.trim(), abstainToken);   // before
```

`isAbstentionValue` is an exact, case-insensitive comparison after stripping
wrapping quotes. But `parseQaAnswer` does not test the raw string — it extracts
the value behind the `Answer:` label first, then tests *that*:

```ts
const labelled = trimmed.match(/(?:^|\n)\s*(?:answer|final answer)\s*:\s*(.+?)\s*$/im);
const candidate = labelled ? labelled[1]!.trim() : trimNarration(...);
if (candidate === '' || isAbstentionValue(candidate, abstainToken)) return null;
```

The prompt contract ends with `Answer: <final answer>`. So the labelled form is
the shape a **compliant** model writes, and the two predicates disagreed on it:

| string | `detectBareAbstention` (old) | `parseQaAnswer` |
|---|---|---|
| `UNANSWERABLE` | bare | abstention |
| `Answer: UNANSWERABLE` | **not bare** | abstention |

Measured: on run 34791592602 there were exactly **3 distinct abstention strings**,
and all 19 of the recoverable ones were `Answer: UNANSWERABLE`, 20 characters.
The detector was blind to precisely the spelling the prompt asks for, so it
classified 2 of 3 distinct strings as bare while the pipeline treated all three as
abstentions.

**The two faults are not sequential — they are multiplicative.** Fixing the scope
alone would have changed nothing, because under scope the labelled form still
would not have matched. That is why neither shows up in Δaccuracy on its own, and
why each had to be neutered separately to prove it does anything at all.

---

## 3. The fix

**Detector** — test the value the parser would extract, not the raw string:

```ts
export function detectBareAbstention(raw: string, abstainToken: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return false;
  return isAbstentionValue(soleLabelledValue(trimmed) ?? trimmed, abstainToken);
}
```

`soleLabelledValue` is anchored to the whole response (`^…$`) and deliberately
**not** multiline. A `Step 1` ledger followed by `Answer: UNANSWERABLE` is a
reasoned verdict; a multiline match would reach past the reasoning, strip the
label off the last line, and re-ask it — the exact noise the bare/reasoned
distinction exists to prevent. This is pinned by test.

**Scope** — the default is now "this path serves the pass", inverted so that a new
answering path inherits it instead of silently escaping it:

```ts
abstentionRetry = true,   // was false
...
const retryEnabled = abstentionRetry && this.options.enableAbstentionRetry !== false;
```

Three consequences, each deliberate:

- The caller keeps the final veto through the existing `enableAbstentionRetry`
  option, and that veto is now applied **inside** `respondWith` for every path
  rather than at one call site. This is load-bearing for
  `runAbstentionRetryAblation`, whose control arm must be inert on every path it
  intends to compare.
- `answerSessions` no longer repeats the option; it passes only its own
  path-level reason (a custom `aggregationPrompt`, i.e. the MR ablation, carries
  its own abstention contract).
- **The abstention path opts out explicitly** (`false`). There the abstention IS
  the answer: 26 of the 30 ABS questions are correctly declined, all in the bare
  form, so re-asking would spend a model call converting right answers into wrong
  ones. This exception is the reason the switch still exists at all.

---

## 4. Verification

**21 new tests, 908 in the repo**, `pnpm check` green (lint, typecheck, tests,
prettier).

**Three neuters, each failing alone** — this is the part that matters, because
fault 1 and fault 2 are invisible individually:

| neuter | what it restores | tests that fail |
|---|---|---|
| A | detector tests the raw string again | **3** |
| B | default scope back to multi-session-only | **4** |
| C | abstention path no longer opts out | **1** |

**Round-trip against the run's own output**
(`analysis/scripts/p19_roundtrip_abstentions.py`), not against fixtures I
authored — this is the gate that would have caught the original defect:

```
distinct raw abstention strings: 3
    20 chars  'Answer: UNANSWERABLE'
   994 chars  'Step 1 — Enumerate every item … Answer: UNANSWERABLE'
    12 chars  'UNANSWERABLE'
2/3 classified as bare
NOT BARE: "Step 1 — Enumerate every item matching the question's EXACT action…"
```

Both distinct bare forms are flagged; the single 994-character reasoned abstention
is still cleared. The discrimination holds on real strings.

**A defect I found in my own first draft of that round-trip**: the harness's
`isExpansionPrompt` matched only `Specific events:`, so on the plain QA path the
query-expansion call consumed a queued answer and the control returned `'2'` when
it should have declined — a harness bug that would have read as an unexplained
extra call, not as a test failure. Every expansion prompt ends with a
`Specific …:` marker but the wording differs per path (`items` / `activities` /
`events` / `facts to retrieve`), so the helper now matches the family.

**Coverage on the changed file: Statements 100 / Branch 98.85 / Functions 100 /
Lines 100.**

---

## 5. What this should buy, and the honest ceiling

19 recoverable abstentions, distributed TR 15 / IE 4 / MR 2.

| if the retry converts | overall | TR | IE |
|---|---|---|---|
| 0 | 85.20 % | 70.87 % | 96.00 % |
| half (≈10) | 87.20 % | 74.80 % | 98.00 % |
| all 19 | 89.00 % | 82.68 % | 98.67 % |

**Do not bank the upper row.** Two reasons, both from `236ab1b`'s own measurement:
the retry is bounded at one and a model that declines twice keeps the abstention,
so conversion is not guaranteed per question; and the historical recovery rate
was 10 of 11 affected questions, not 11 of 11. The middle row is the honest
expectation and even it is a forecast.

Two further bounds to carry forward:

- **A single run cannot separate a real gain from run-to-run variance.** MR's
  panel stdev is 3.77 questions (3.12 pp) over 8 runs. The retry's effect on TR is
  unmeasured, so the first reading is a point estimate with no interval.
- **The two known MR regressions are untouched by this change** (`6d550036`,
  `d851d5ba`), and `d851d5ba`'s mechanism is now understood well enough to name:
  `$8,750 = $3,750 + $5,000`, where the `$5,000` comes from an unlabelled
  distractor session worded as a **hedge** ("raised **over** $5,000"). Summing a
  lower bound into an exact total asserts precision the evidence does not carry.
  That is a dataset-agnostic signal and a candidate for its own iteration — as a
  guard, not as a rule about which charities count.

---

## 6. Explicitly not in this iteration

- **`extendedTimeRange` promotion** (§1). Reaches 4 questions, 3 of them failing,
  but the window already contained the evidence in 9 of 11 failures and the flag
  also alters retrieval. Worth doing *after* the retry, so the two are separately
  attributable. The ablation's +0.79 pp and measurement A's "4 newly reachable"
  disagree on magnitude and should be reconciled before promoting.
- **TR ordering questions** (7 questions, 14.29 % accuracy) — mechanism (B) in
  P19, still real, still unexplained, and now clearly a *decision* failure rather
  than a retrieval one.
- **`6d550036`** — distractor "…Marketing Research class project, where I **led**
  the data analysis team…" matches the question's action verb literally. No clean
  signal found; not a bug.
- **`gpt4_4fc4f797`** — gold states 38/39 days, prediction 37, the
  `temporal-reasoning` template forbids penalising off-by-one, judge said no. The
  `toJudgeQuestionType` wiring was checked and is correct, so this is judge
  behaviour on 1 question.
