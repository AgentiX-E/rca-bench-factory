# P28 — Redesigning the retry: the target population is real and is not who I thought

**Status:** pre-registered, NOT implemented
**Depends on:** the ablation-scope fix in `cadedcb` (instrument now covers the
population the retry serves)
**Evidence:** runs `35019792901` and `35097952715`, both sha-adjacent, n=500
**Supersedes the disposition options in:** `p26-retry-structural-zero.md`

---

## 1. What changed since P26

P26 proved the retry's yield is **exactly zero by construction**: `respondWith`
passes the same `prompt` to `completeFresh`, so at temperature 0 the abstention
recurs with probability 1. That proof stands.

What P26 did not establish is whether the population the retry targets is worth
targeting — and I had assumed it was small and entangled with abstention-correct
cases. Both assumptions are now false.

## 2. The population is 12 questions, and every one of them is a loss

Per run (both `35019792901` and `35097952715`, identically):

| | count |
|---|---|
| `retryArmed` | 276 / 278 |
| `retryFired` | **12** |
| of those, correct | **0 of 12** |

```
IE: fired=4   correct=0
TR: fired=7   correct=0
KU: fired=1   correct=0
ABS: fired=0
```

**Every single fire is a question the system lost.** The retry is armed only
after the model has produced a bare abstention, so its population is precisely
"questions the model declined and got wrong". There is no upside/downside mix to
weigh: the population is 12 losses, and any recovery is pure gain.

### 2.1 The finding that changed my mind

Evidence PRESENCE was verified per question by probing the retrieved context for
the wording the *evidence turn* would carry — not the wording of the answer, which
is a different string and produced false negatives on the first pass (see §7).

| evidence present | count | ids |
|---|---|---|
| **yes** | **9 / 12** | `71017277`, `eac54add`, `6e984302`, `gpt4_93159ced`, `c8090214`, `3b6f954b`, `gpt4_fa19884d`, `0977f2af`, `7a8d0b71` |
| no | 3 / 12 | `5d3d2817`, `0edc2aef`, `gpt4_8279ba03` |

The five with `top1Score = 1.000` are all in the present group:

| id | top1 | evidence in context | ground truth |
|---|---|---|---|
| `71017277` | 1.000 | `aunt` | my aunt |
| `eac54add` | 1.000 | `business` | I signed a contract with my first client. |
| `6e984302` | 1.000 | `sculpt` | I got my own set of sculpting tools. |
| `gpt4_93159ced` | 1.000 | `NovaTech`, `4 years and 3 months` | 4 years and 9 months |
| `c8090214` | 1.000 | `holiday market` | 7 days (8 also acceptable) |

`gpt4_93159ced` is the clearest instance in the whole set: the context contains
*"I've been working at NovaTech for about **4 years and 3 months** now"* — the
question asks how long the user worked *before* NovaTech, so the turn is the
right turn and the arithmetic is even implied. **The model abstained anyway.**

**So the retry's target is up to 9 questions, and at least some are pure
over-abstention with the evidence sitting in the prompt.** This is not a recall
failure, and it is the failure mode a second, differently-phrased ask can
plausibly fix. Under the current byte-identical re-ask it cannot, which is
exactly P26's point.

### 2.2 The risk I had worried about does not exist

I had expected that making the retry work would convert *correct* abstentions
into wrong answers — catastrophic on ABS, where abstention *is* the right answer
and where 26 of 30 are scored correct by abstaining.

**ABS never fires the retry.** Its diagnostics carry no `retryArmed` field at
all, and `fired` counts 0 across both runs. The mechanism's population and the
abstention-correct population are **disjoint**.

So P26's option B carries no downside risk on the current data. That removes the
main argument for option A.

## 3. Why A (delete) is now the weaker choice

| | A: delete | B: redesign |
|---|---|---|
| current yield | 0 (structural) | 0 (structural) |
| target population | — | 12 losses; 9 with the evidence verifiably in the context |
| downside risk | none | none found (ABS disjoint) |
| upside | 0 | up to +9 questions (1.8pp) |
| cost | one cleanup commit | a prompt change + one run |

P26 called A "the honest default". With the population characterised, A is the
**pessimistic** default: it discards a 9-question opportunity whose downside I
have now failed to find. I no longer recommend it.

## 4. The intervention

Change **only** what the second attempt asks. The first pass is untouched.

The re-ask must not be byte-identical — that is the whole defect. Candidate
form, to be finalised in implementation:

- Keep the identical context (retrieval is not being changed; on 5 of 12 it is
  already at 1.000).
- Change the instruction, not the evidence: state explicitly that the context
  was retrieved to answer this question and that a decline is only warranted
  when the context is genuinely empty of the answer.

This is a **prompt-level** change only. It requires no retrieval, indexing, or
threshold work.

## 5. Predictions

Fixed before implementation.

| # | prediction | falsifier |
|---|---|---|
| **P1** | The second attempt's prompt differs from the first's in bytes | byte-identical ⇒ the defect was not fixed (and the existing unit test keeps failing) |
| **P2** | `retryFired` stays ≈12 — the population does not move | population changes ⇒ the change altered first-pass behaviour, which it must not |
| **P3** | At least one of the 12 recovers without any of the 26 ABS abstentions converting to an answer | a recovered question is offset by an ABS regression ⇒ net harm, revert |
| **P4** | Overall accuracy does not fall by more than 1 question | fall ≥2 ⇒ the re-ask is destabilising correct answers |

**P3 is the load-bearing prediction.** P1 is a precondition, not a result — a
differing prompt that recovers nothing is a more expensive no-op.

## 6. Instrument requirements (already met by `cadedcb`)

The retry ablation now covers the whole dataset by default, so `retryFires` will
count all ~12 fires instead of 1. Without that fix this experiment could not be
read at all: `Δ = 0.00pp with 1 fire` and `Δ = 0.00pp with 12 fires` render
identically in the ablation table and mean opposite things.

## 7. Honest limitations

- **The evidence-presence check is lexical, not semantic.** It probes for terms
  the evidence turn would contain (`aunt`, `sculpt`, `holiday market`, …). A hit
  proves the *topic* is present; it does not prove the answer string is
  extractable. 9/12 is an upper bound on "answerable", not a count of questions
  the retry is guaranteed to recover.
- **The first pass of this check was wrong and I am recording why.** I initially
  probed for the ANSWER wording (`4 years and 9 months`, `$2,000`) rather than the
  EVIDENCE wording (`4 years and 3 months`, `budget`). That produced false
  negatives on `gpt4_93159ced` and `7a8d0b71`, both of which do contain their
  evidence. Probing with the answer string tests whether the answer is already
  written down, which is not the question.
- **3 of 12 are genuine absences** and abstention may be correct for them; the
  judge's ground truth may also be lenient. They are not evidence for the retry.
- **Temperature 0 does not guarantee model determinism.** `p25` §4 documents four
  regressions with identical `top1Score` across runs, i.e. the endpoint is not
  bit-reproducible. A single run cannot separate "the re-ask worked" from "the
  endpoint differed". P3 must be judged on the *paired* delta, not on raw counts.
- **n=12 is small.** A 1.8pp ceiling is worth pursuing, but no single run at this
  n can establish the effect size; the verdict must report the count, not a
  confidence interval that n=12 cannot support.

## 8. Sequencing

This must land **as its own commit with its own run**. `p24-cap-verdict.md` §4
records what bundling two edits costs, and `p25` had to spend a full run to undo
it. The retry redesign is behaviourally independent of every other open item and
will be shipped that way.
