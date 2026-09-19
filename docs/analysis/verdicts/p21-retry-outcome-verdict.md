# P21 verdict — the retry is refuted, and the real bottleneck is answer-session turn coverage

**One-line read**: the abstention retry deployed exactly as designed — armed on 413
of 500, fired on 22, converted **0** — because the premise it was built on does not
transfer outside MR. The questions it intercepted were declining because the
**answering turn was never retrieved**, not because the model skipped. The −1.40 pp
headline is **statistically indistinguishable from run-to-run variance** and is not
attributable to this change. The investigation redirected to the real bottleneck,
which is now measured: **answer-session turn coverage**.

| | |
|---|---|
| Iteration commit | `a3a354e` (pushed, in sync with `origin/master`) |
| Measurement run | `34915402976` (success, 1 h 21 m 39 s) |
| Baseline run | `34791592602` |
| Config (both) | `limit=all`, `runs=1`, `ablationRuns=1`, temperature 0 |

---

## 1. What was changed, and what it was built on

`enableAbstentionRetry` was **inert by construction**, from two independent and
multiplicative faults:

1. **Scope** — only `answerSessions` computed the flag; every other caller left it
   at its default `false`.
2. **Detector** — `detectBareAbstention` tested the raw string, while `parseQaAnswer`
   strips the `Answer:` label first. So `Answer: UNANSWERABLE`, the exact spelling
   the prompt requests, was invisible to the retry.

Both are real defects, both are fixed and verified in `a3a354e` (three independent
neuters: detector → 3 failures, scope → 4, ABS opt-out → 1). The **fix** is
correct; the **hypothesis** it served is not, and this run measured that.

The hypothesis came from MR: of 11 MR questions that abstained, **10 recovered**
under a re-ask. That was read as "a bare abstention is a skip — the model had the
evidence and declined to spend the tokens." §3 shows it was an MR-specific artefact.

---

## 2. The instrumentation deployed exactly as designed

| telemetry | baseline | fix | interpretation |
|---|---|---|---|
| `retryArmed` | 121 | **413** | scope fix effective; ABS correctly excluded |
| `retryFired` | 1 | **22** | the 19 intended questions + 3 already-failing |
| fires by capability | — | MR 1 / IE 4 / TR 17 | matches the intended population |
| abstentions | 47 | 50 | rose |
| wrongful abstentions | 21 | 24 | rose |

Of the 22 fires, **21 were on questions already failing in the baseline**, and all
21 **still declined**; the 22nd (`cc6d1ec1`) answered and was still wrong. Net:
**0 gains, 1 loss**. A mechanism that intercepts 21 known-losing questions and
converts none is falsified, not under-powered.

---

## 3. Why it converted nothing — the premise does not transfer

The retry's premise predicts the first pass *had* the evidence and withheld it. I
tested whether the gold value was even present in the prompt payload
(`decision.retrieved`; the test is conservative — exact substring, then numeric
equality, then ≥12-char verbatim run).

| population | n | gold value in payload |
|---|---|---|
| the 22 re-ask questions | 22 | **5** |
| of those, still declining after re-ask | 21 | **5** |
| TR/IE answered correctly with **no** retry (contrast class) | 231 | 123 (53.2 %) |
| abstained, retry did **not** fire | 29 | 6 (20.7 %) |

The contrast class decides it. When TR/IE questions are answered **correctly**, the
gold value is present **53.2 %** of the time. When the retry fires it is present
**22.7 %** of the time — statistically indistinguishable from the abstentions the
retry correctly left alone (20.7 %).

So the re-ask was not refusing to answer; it was reading a prompt that **did not
contain the answer**. `Answer: UNANSWERABLE` was the **correct** output of the
retrieval stage. Re-asking the *same prompt* cannot repair that by construction.
The one MR fire, `8e91e7d9`, **does** have the value present — which is exactly why
the MR evidence looked so strong.

**Conclusion: "a bare abstention is a skip" is an MR-specific artefact.** On TR 0 of
17 and on IE 0 of 4 fires had the gold value. The retry generalised a repair
mechanism across capabilities that do not share the failure mode.

---

## 4. The −1.40 pp is not attributable to this change

Headline: 426/500 = 85.20 % → 419/500 = 83.80 %, **−7 questions = −1.40 pp**.

| cap | n | base | fix | Δq |
|---|---|---|---|---|
| IE | 150 | 96.00 % | 96.00 % | +0 |
| MR | 121 | 90.08 % | 85.95 % | **−5** |
| KU | 72 | 79.17 % | 80.56 % | +1 |
| TR | 127 | 70.87 % | 68.50 % | **−3** |
| ABS | 30 | 86.67 % | 86.67 % | +0 |
| | | | | **−7** |

The retry's causal footprint accounts for **1** of the 7. The other 6 are flips on
questions where neither run abstained and the retry never fired.

**Sign test on the 8 out-of-footprint flips** (2 gained, 6 lost): exact two-sided
p = **0.2891** — not significant. (At n=8 only a ≥7–1 split reaches p<0.05, so this
excludes a *large* asymmetry and nothing smaller. Stated as a limit, not a defence.)

**MR's −4.13 pp against its own variance.** The 8-run identical-config MR panel is
mean 79.13 %, sd **3.12 pp**; the sd of a difference of two independent draws is
4.41 pp, so z = **−0.94** — inside one sd. And the 90.08 % "baseline" is the panel
**maximum**: regression to the panel mean alone predicts −10.95 pp with no code
change. The observed −4.13 pp is *smaller* than pure regression, so there is no MR
signal here to explain.

**This run is a negative-variance draw.** Reporting −1.40 pp as the retry's effect
would be reading noise as a result.

---

## 5. Disposition

**Keep the fix, discard the expectation.** Both repaired defects are genuine;
reverting would reintroduce a real bug to remove an inert feature. But the retry
earns its keep only where the premise holds, and that is MR alone.

| option | evidence | cost |
|---|---|---|
| **Restrict the retry to MR** | The only evidence-supported scope; the sole MR fire had the value present. Removes 21 no-op re-asks per run. | small; drops 3 TR/IE fires that also did nothing |
| Leave scope global, expect nothing | 22 fires, 0 gains — a measured no-op | retains an unmeasured wall-clock/token cost |
| Revert entirely | Contradicted — the defects are real | reintroduces a detector blind to `Answer: UNANSWERABLE` |

Recommendation: **restrict to MR** as a behaviour-preserving cleanup of an
unmeasured cost. It is not a performance claim and must not be described as one.

**Do not iterate on the retry further.** A second re-ask faces the same wall — the
prompt is unchanged, so an evidence-absent decline reproduces deterministically.
All 21 still-declines returned a byte-identical 12–20 char `UNANSWERABLE`, which is
what a stable judgement looks like, not a skip.

---

## 6. The real bottleneck, now measured: answer-session turn coverage

I separated two reachability tests that had been conflated, because they answer
different questions and the gap between them is the finding:

- **Test A (session reach)** — does the *text* of a labelled answer session survive
  into `decision.retrieved`? (30-char shingles, sampled across each turn.)
- **Test B (value availability)** — is the *gold value* literally present?

Both are correct. When A=true and B=false, retrieval reached the right **cluster**
but missed the **turn carrying the value**. Decomposing all 74 failures:

| verdict | n | share |
|---|---|---|
| session reached, answer turn missing (**TURN COVERAGE**) | **45** | **60.8 %** |
| evidence complete, answer wrong (**DECISION**) | 28 | 37.8 % |
| evidence absent entirely (**SESSION RECALL**) | 5 | 6.8 % |

Per capability, TR is where the mass is (40 failures): **24 turn-coverage**,
12 decision, 3 session-recall.

### Coverage predicts correctness almost monotonically

| coverage of the answer session | n | correct | accuracy |
|---|---|---|---|
| 0 % (nothing survived) | 3 | 1 | 33.3 % |
| 1–49 % | 90 | 59 | 65.6 % |
| 50–99 % | 350 | 303 | 86.6 % |
| 100 % (all turns present) | 57 | 56 | **98.2 %** |

And it predicts **abstention** the same way: abstention rate is 66.7 % at 0 %
coverage, 16.7 % at 1–49 %, 8.3 % at 50–99 %, 7.0 % at 100 %. The bare abstentions
the retry was built to repair are an **output of turn coverage**, not of
unwillingness — which is the same conclusion as §3 from a second direction.

### It is a ranking problem, not a capacity problem

| retrieved blob | n | mean answer-session coverage |
|---|---|---|
| <6k | 22 | 51.3 % |
| 6–9k | 152 | 52.7 % |
| 9–12k | 81 | 51.1 % |
| 12–18k | 89 | 58.9 % |
| >18k | 156 | 74.0 % |

Coverage is **flat or rising** as the prompt grows, and corr(blob, coverage) is
−0.14 (TR), −0.02 (MR), −0.06 (KU) — i.e. essentially zero, and *positive* for IE
(+0.53). A bigger budget does not buy coverage, so this is **not** truncation.
The answering turn loses to turns that merely share vocabulary. `[truncated]`
appears in 268 of 500 blobs, so truncation is active but is not the binding
constraint here.

The single most actionable number: **when the answer session is fully present,
accuracy is 98.2 % (56 of 57).** The one exception is `7a8d0b71` (IE), and it is
instructive rather than a counterexample: its answer session is 100 % present, its
blob is the largest in the corpus at **22,256 chars**, and it **abstained anyway**.
That is the only fire in the whole run where the evidence was available and the
model still declined — the lone case the retry was correctly aimed at, and it
missed because the prompt was too long, not too empty.

### Robustness: the ordering survives an independent, stricter test

The 98.2 % figure uses sampled 30-char shingles, so it could in principle be an
artefact of a lenient membership rule. Re-running with a **stricter and
independently-constructed** rule — every answer turn must contain **3 disjoint
40-char windows**, all present, no sampling — the ordering holds and is if
anything sharper:

| strict coverage | n | accuracy |
|---|---|---|
| full (all turns, 3 windows each) | 14 | **100.0 %** |
| partial | 479 | 84.1 % |
| none | 7 | 28.6 % |

The cell sizes move because the stricter rule is harder to satisfy, not because
the phenomenon is fragile. Both rules rank full > partial > none, so the
conclusion does not depend on the membership threshold.

---

## 7. Two instrumentation defects found in this pass

Both were caught by cross-checking against a source of truth, and both would have
silently corrupted conclusions:

1. **`p20_compare.mjs` `cap()`** — `MR_diagnostics.json` rows carry **no**
   `capability` field (only the 379 single-session rows do), so the 121 MR rows fell
   through to a `'multi-session'` placeholder and never matched `'MR'`, printing
   `NaN%`. Fixed by taking the capability from *the file the row came from*, plus an
   assertion that per-capability rows reconcile to the headline (now 426/426 and
   419/419).
2. **`answer_sessions_content` is unusable** — `''` on all 379 single-session rows,
   and a bare session-ID list (max length **5**) on the 121 MR rows. Any
   evidence-membership test built on it is vacuous. My own first pass at §3 read
   this field and produced a spuriously clean "21/22 absent" before the cross-check
   caught it. The real payload is **`decision.retrieved`**. The earlier "only 2 of 74
   failures are recall failures" reading is likewise field-limited and is superseded
   by §6.

---

## 8. Verification of the iteration itself (unchanged by the benchmark result)

- 21 new tests; 908 repo-wide; `pnpm check` green (lint + typecheck + test + format).
- Three independent neuters fail the suite when reverted: detector → 3, scope → 4,
  ABS opt-out → 1.
- Round-trip against the run's own three distinct abstention strings: 2 bare
  flagged, the single 994-char reasoned one cleared (over-match guard holds).
- Changed-file coverage: statements 100 / branch 98.85 / functions 100 / lines 100.

The engineering is sound and the hypothesis it served is refuted. Both are in the
record, and the refutation is what produced §6.
