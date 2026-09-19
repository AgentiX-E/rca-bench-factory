# P28 verdict — the retry now asks something different, and it still recovers nothing

**Status:** adjudicated. **P3 FAILED.**
**Run:** `35162802298`, sha `f39e7f9`, `runs=1`, `conclusion=success`
**n:** 500 questions. Artifacts: `analysis/ab_admission/run_35162802298/longmemeval-s-report/`
**Pre-registration:** `p28-retry-redesign-prereg.md` (predictions fixed before the run)

---

## 1. Headline

The retry's defect is fixed and its yield is still exactly zero.

`f39e7f9` removed the structural zero P26 proved: the second attempt no longer
re-asks the byte-identical prompt, so at temperature 0 it is no longer
*guaranteed* to reproduce the abstention. That guarantee was the whole of P26's
argument and it is now void. The mechanism fires 14 times, spends 14 extra
requests, and recovers **0** of them.

```
treatment fires: 14      control fires: 0
fires that are correct: 0 of 14
Δ accuracy: +0.00%       McNemar p = 1.000e+0      discordant pairs 0 / 0
```

**A differing instruction was necessary and is demonstrably not sufficient.**
Removing the absurdity did not make the mechanism work; it only made the failure
informative instead of tautological. That distinction is the finding.

---

## 2. Pre-registration scored

The predictions were fixed in `p28-retry-redesign-prereg.md` §5 before the run.

| # | prediction | outcome | evidence |
|---|---|---|---|
| **P1** | The second attempt's prompt differs from the first's in bytes | **PASS** | §3 below — instruction span rewritten, evidence span byte-identical |
| **P2** | `retryFired` stays ≈12 — the population does not move | **PASS** | 14 vs 12 in the pre-fix runs; every historical fire still fires (§4) |
| **P3** | At least one of the 12 recovers without an ABS regression | **FAIL** | 0 of 14 recovered; ABS unchanged at 29/30 |
| **P4** | Overall accuracy does not fall by more than 1 question | **PASS** | 85.60% vs 85.60% — the Δ-ablation arms are byte-identical |

**P3 was named the load-bearing prediction and P3 failed.** §5 of the
pre-registration says exactly what that means:

> "P1 is a precondition, not a result — a differing prompt that recovers nothing
> is a more expensive no-op."

That sentence was written to stop me from bankring P1 as a win. It applies.

---

## 3. P1 verified in production, not merely in the unit test

The diagnostics do not persist prompts, so P1 cannot be read off the run
artifact. It was verified by reconstructing the prompt through the built
package at the committed sha:

```
first === retry?                          false
retry mentions the previous attempt:      true
evidence spans identical?                 true  | len 265
```

The two instruction spans, side by side:

| first attempt | retry |
|---|---|
| two-step "Step 1 — Silently read each turn … Step 2 — Answer" | four lines naming the previous abstention, asserting the context was retrieved *for this question*, and widening what counts as evidence |
| "Respond with exactly UNANSWERABLE ONLY when the context offers no answer to the question at all." | "Respond with exactly UNANSWERABLE ONLY if the context genuinely bears on nothing in the question." |

The evidence span is copied verbatim from the first prompt
(`buildRetryFromFirstAttempt` splits on the `'\nContext'` marker rather than
re-rendering). That is what keeps a hypothetical recovery attributable to the
re-ask rather than to different retrieval. It also means the retry prompt is a
deterministic function of the first, so it is cache-safe — the property that
let `completeFresh` be deleted.

**What the instruction now says that it did not before:**

> a non-empty context is itself evidence that relevant information was found

That is the strongest, most direct statement of the over-abstention rebuttal
available in prompt space. It did not move a single question.

---

## 4. The population did not move, which is itself a result

All 14 fires, with the capability split the ablation reports:

| capability | fires | correct |
|---|---|---|
| IE | 4 | 0 |
| TR | 9 | 0 |
| KU | 1 | 0 |
| ABS | 0 | — |

Every historical fire is still present and still abstains:

```
5d3d2817         fired=true  abst=true  top1=0.567  "Answer: UNANSWERABLE"
3b6f954b         fired=true  abst=true  top1=0.575  "Answer: UNANSWERABLE"
0edc2aef         fired=true  abst=true  top1=0.661  "UNANSWERABLE"
71017277         fired=true  abst=true  top1=1.000  "Answer: UNANSWERABLE"
gpt4_fa19884d    fired=true  abst=true  top1=0.637  "Answer: UNANSWERABLE"
eac54add         fired=true  abst=true  top1=1.000  "Answer: UNANSWERABLE"
6e984302         fired=true  abst=true  top1=1.000  "Answer: UNANSWERABLE"
gpt4_8279ba03    fired=true  abst=true  top1=0.628  "Answer: UNANSWERABLE"
gpt4_93159ced    fired=true  abst=true  top1=1.000  "Answer: UNANSWERABLE"
c8090214         fired=true  abst=true  top1=1.000  "UNANSWERABLE"
c9f37c46         fired=true  abst=true  top1=4.000  "Answer: UNANSWERABLE"
gpt4_4cd9eba1    fired=true  abst=true  top1=3.000  "Answer: UNANSWERABLE"
0977f2af         fired=true  abst=true  top1=0.677  "UNANSWERABLE"
7a8d0b71         fired=true  abst=true  top1=0.778  "Answer: UNANSWERABLE"
```

The fire count went 12 → 14, and that is **not** noise to be waved away: the
scope fix in `cadedcb` is what makes it legible. Before that fix the ablation
counted 1 fire because it scoped to MR; it now covers the 500-question
population the mechanism actually serves. Two of the 14 (`3b6f954b`, `c9f37c46`)
were outside the previously-instrumented scope. **The instrument is now correct
and the number it produces is 14.**

### 4.1 The structural identity of the target population

| | count |
|---|---|
| questions the system got wrong | 57 |
| — wrong by **misanswer** | 43 |
| — wrong by **abstention** | 14 |
| retry fires | 14 |
| of those, correct | **0** |

The bottom three rows are the same 14 questions. The retry's population is
*exactly* the set of questions the system declined and lost. There is no
upside/downside mix: every fire is a loss, and every recovery would be pure
gain. **The opportunity is real; the mechanism does not reach it.**

---

## 5. Why the retry still yields nothing — what the evidence says

`p28` §2.1 established that at least 9 of the 12 fires have their evidence
verifiably present in the retrieved context. I re-ran that classification over
all 14 with evidence-side probes (not answer-side), and it reproduces:

| | count | ids |
|---|---|---|
| evidence present | **10 / 14** | `0edc2aef`, `71017277`, `gpt4_fa19884d`, `6e984302`, `gpt4_93159ced`, `c8090214`, `c9f37c46`, `gpt4_4cd9eba1`, `0977f2af`, `7a8d0b71` |
| evidence absent | 4 / 14 | `5d3d2817`, `3b6f954b`, `eac54add`, `gpt4_8279ba03` |

`3b6f954b` moved to ABSENT on re-check, and the reason matters: my first pass
scored it PRESENT on a sub-token hit, but the context contains a *different*
university ("University of Saskatchewan") in a distractor turn and never names
Melbourne. The answer is genuinely absent and abstention may be correct for it.
**The lexical probe errs in the direction that overstates the opportunity**,
which is why it is reported as an upper bound and why the manual read is what
the finding rests on.

So the redesign targeted the right population — **10 questions whose failing
answer is sitting in the prompt** — and converted **none** of them. The
failure is not "the retry asked the wrong question". The failure is that the
model, told in the most direct terms available that a non-empty context is
itself evidence, and handed the same context, still declines.

### 5.1 The sharpest case in the set

`gpt4_93159ced`, `top1Score = 1.000`, evidence present:

> **Question:** How long have I been working before I started my current job at NovaTech?
> **Context:** *"I'm a software engineer … I've been working at NovaTech for about **4 years and 3 months** now."*
> **Ground truth:** 4 years and 9 months
> **Both attempts:** `"Answer: UNANSWERABLE"`

The correct turn is retrieved at rank 1. The arithmetic the question asks for is
implied by the retrieved text. The first attempt declines, and the second —
which explicitly instructs the model to look for an answer "expressed in
different words, implied by an event, or spread across more than one turn" —
declines in identical bytes.

This is the case that ruled out "the retry does not try hard enough" as the
explanation.

### 5.2 What I now believe the failure actually is

The 14 fires are not one failure mode. Their `top1Score` — the max hit score,
which for the embedding channel is cosine similarity and for the lexical channel
is a raw match count, so the field is **unclamped** (max 6.000 over the 500 rows,
37 rows above 1.0) — splits them:

| `top1Score` | count | reading |
|---|---|---|
| 1.000 | 5 | the top hit is a near-exact match |
| 0.567 – 0.778 | 7 | mid-distribution; the population median is 0.685 |
| 3.000 – 4.000 | 2 | lexical-channel dominance, or an unusually strong match |

The five at 1.000 sit at the top of the score distribution. For those, the
retriever has already done its job and **neither retrieval nor the instruction
is the problem** — they abstain with an exact-match hit in hand. The remaining
nine are heterogeneous, and `p27` already documented that at least one of the
ABS-adjacent shapes is a window-coverage question (`6456829e_abs`'s window
omitted the second operand's session).

The honest reading is that the retry is a **single blunt instrument aimed at a
heterogeneous population**, and the population's dominant cause has not been
identified. Continuing to iterate on the retry's wording would be guessing.

---

## 6. No harm, and that is the only thing this run bought

| arm | ABS |
|---|---|
| control (`enableAbstentionRetry: false`) | 96.67% = 29/30 |
| treatment (`enableAbstentionRetry: true`) | 96.67% = 29/30 |

Zero discordant pairs on the entire 500-question dataset. The redesign did not
regress ABS, because ABS is structurally unreachable: `answerAbstention` passes
`retryEnabled = false` to `respondWith`, so no ABS question is ever armed. That
is correct design — ABS's expected answer *is* the token, and a retry there
could only destroy correct abstentions — and it means P3's "without an ABS
regression" clause was satisfied vacuously.

**The absence of harm is not evidence of mechanism.** It only means the change
is safe to keep or revert on grounds other than risk.

---

## 7. Honest limitations

- **The evidence-presence probe is lexical and was corrected once.** `3b6f954b`
  ("Where did I attend my study abroad program?" / "University of Melbourne")
  scored PRESENT on a sub-token in my first pass and is actually ABSENT — the
  context names Saskatchewan, not Melbourne. `eac54add` scores ABSENT because
  the context phrases the milestone without the word "contract". The probe's
  error direction is toward overstating, so 10/14 is an upper bound on
  "answerable" and a looser bound on "recoverable". §5.1, not the table, is what
  the §5 claim rests on.
- **n and noise.** Temperature 0 does not make the endpoint bit-reproducible —
  `p25` §4 documents four regressions with byte-identical `top1Score`. A single
  run cannot separate "the re-ask failed" from "the endpoint was in a state
  where nothing would have worked". The *paired* Δ of +0.00% with 0 discordant
  pairs is a real measurement, but it is one draw.
- **The retry prompt is not persisted.** P1 had to be verified by reconstruction
  against the built package, not read from the artifacts. That is a real gap in
  the instrument and should be closed before any further retry work.
- **I am recorditing a prior claim.** `p26` described the retry's inertness as
  purely structural. That was correct for the byte-identical version and is now
  superseded: the mechanism is not inert by construction any more, it is inert
  in effect, and those are different statements.

---

## 8. Disposition

**Do not iterate on the retry's wording again without new evidence.** Two
consecutive designs, one structurally incapable and one structurally capable,
have both yielded 0. The budget that produced this verdict was spent on a
hypothesis ("a differently-phrased second ask can convert over-abstention"), and
that hypothesis is now falsified on the population it was designed for.

Ranked options:

1. **Revert `f39e7f9`'s prompt change and keep the mechanism disabled by
   default.** The redesign costs 14 requests per run for 0 questions. Until a
   cause is identified, the honest configuration is off. *Recommended.*
2. **Characterise the dominant cause of the 14 before touching the retry
   again.** The five `top1Score = 1.000` cases are the highest-value starting
   point precisely because retrieval is ruled out for them. That is offline
   work at zero API cost.
3. **Keep the redesign and the mechanism on, accepting 14 wasted requests per
   run** as the price of having the instrument wired and measured. Defensible
   only if a future experiment needs the retry live.

What must **not** happen is a third prompt-wording guess. P1→P3 shows the
mechanism is reachable and the wording is not the lever.

---

## 9. Methodological note

`p25` §5 recorded the lesson that a component's contribution is measured by the
paired difference its removal produces, not by whether the remaining system
clears an absolute bar. This run supplies the dual: **an intervention's value is
measured by the paired difference its addition produces, not by whether the
intervention is correctly *shaped*.** The redesign is shaped exactly as the
pre-registration specified, demonstrates the property P1 demanded, fires on the
population P2 predicted — and moves nothing. Craftsmanship in the intervention
is not evidence of effect, and the pre-registration's own P3 clause is what
prevented this from being filed as a success.
