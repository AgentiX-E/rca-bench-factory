# P31 — TR error characterisation: the settled "discrimination" framing is incomplete

**Status:** offline, zero API cost. **Changes the roadmap** — see §6.
**Evidence:** `run_35162802298` `benchmark-single-session-diagnostics.json` (127 TR rows)
and `benchmark-report.md`.

## 1. Why this exists

R4 (`p27-r4-prereg.md`) was next in the queue. Before spending a run on it I
checked its ceiling against the error mass: ABS is 29/30, so R4's P2 is worth
**+1 question = +0.2pp** overall. TR is 90/127 with **37 of the system's 72
errors (51%)**. The two are not comparable spends, so TR's errors got
characterised first. That characterisation is this document.

| capability | acc | n | wrong | share of all 72 errors |
|---|---|---|---|---|
| IE | 96.67% | 150 | 5 | 7% |
| MR | 87.60% | 121 | 15 | 21% |
| KU | 80.56% | 72 | 14 | 19% |
| **TR** | **70.87%** | **127** | **37** | **51%** |
| ABS | 96.67% | 30 | 1 | 1% |

## 2. TR by temporal kind

`classifyTemporalQuestion` over all 127 TR questions, joined to per-question
correctness:

| kind | n | correct | acc | abstained | wrong answer |
|---|---|---|---|---|---|
| `ordering` | 40 | 28 | 70.0% | **0** | **12** |
| `interval` | 26 | 23 | 88.5% | 2 | 1 |
| `relative` | 25 | 18 | 72.0% | **0** | **7** |
| `eventLookup` | 20 | 10 | **50.0%** | 5 | 5 |
| `other` | 16 | 11 | 68.8% | 2 | 3 |
| **total** | **127** | **90** | **70.9%** | **9** | **28** |

**The single most important number here is the split of the 37 errors: 9
abstentions, 28 confident wrong answers.** Abstention is 24% of TR's error mass.
Every TR intervention proposed so far — the P29 anchor work, and the abstention
retry before it — targets that 24%.

This is what the settled conclusion gets wrong. `runner.ts` §320 and P29 §6 both
record that "TR's bottleneck is discrimination rather than recall depth", on the
evidence that three recall-widening arms lost. That conclusion is true about the
three arms and false as a description of where TR's errors are: the dominant
failure is **answering confidently and wrongly on `ordering` and `relative`**,
which are exactly the two kinds where nothing abstains.

## 3. `ordering`: 12 wrong, 0 abstained

Two distinct sub-failures.

### 3.1 Binary "which came first, A or B?" — 5 questions, 0 correct

| id | question (trimmed) | gold | got |
|---|---|---|---|
| `gpt4_76048e76` | vehicle first in February, bike or car? | bike | car |
| `gpt4_385a5000` | seeds started first, tomatoes or marigolds? | Tomatoes | marigolds |
| `gpt4_d31cdae3` | trip first, solo Europe or family road trip? | family road trip | solo trip to Europe |
| `gpt4_0a05b494` | met first, jam seller or Australian tourist? | jam seller | tourist from Australia |
| `gpt4_5438fa52` | event first, cultural festival or Spanish classes? | Spanish classes | cultural festival |

All five were answered by the **LLM** (`llmRaw` non-empty ⇒ the deterministic
engine returned `null` and fell through). **Accuracy 0 of 5.**

**A claim I checked and had to soften.** The first read is a positional bias —
pick the second-listed option. It is not: 3 of 5 picked the second-listed and 2
picked the first-listed. The direction is mixed, so this is not a positional
artefact to be prompt-corrected away; it is a model that **cannot determine the
order and guesses**, wrong every time. Misreading this as a bias would have
produced a prompt tweak targeting the wrong mechanism — the same class of error
P28 made.

The consequence is better than a bias would have been: any mechanism that
actually establishes the order beats 0/5, and the order is arithmetic we already
own. `supportsDeterministic` includes `ordering`, so the engine is *supposed* to
answer these; `tryDeterministicTemporal` returned `null` for all five, which
means `computeTemporalAnswer` did not get two dated events to compare.

### 3.2 Multi-item sequences — 7 questions

Gold is an ordered list; the engine (which answered — `llmRaw` empty) returned a
single item or a partial list. E.g. `gpt4_f420262c` gold `JetBlue, Delta, United,
American Airlines`, got `American Airlines flight from LAX to JFK`. Different
failure from 3.1: extraction found events but the ordering/render is incomplete.

## 4. `relative`: 7 wrong, 0 abstained

All are "how many days/months/weeks ago / since" — pure arithmetic against the
question date. The errors are **systematic off-by-N, not random**:

| id | gold | got | error |
|---|---|---|---|
| `gpt4_af6db32f` | 17 days | 21 days | +4 |
| `gpt4_7bc6cf22` | 12 days | 17 days | +5 |
| `982b5123` | five months | 3 months | −2 |
| `cc6d1ec1` | two months | `59` | **unit**: days returned where months expected |
| `0db4c65d` | 18 days | 0 | anchor unresolved |
| `370a8ff4` | 15 (weeks) | 12 | −3 |
| `0bc8ad92` | 5 (months) | 4 months | −1 |

`cc6d1ec1` is the diagnostic one: `59` is the right quantity in the wrong unit,
which is a formatting/unit bug in a deterministic path, not a reasoning failure.

## 5. What this does to the earlier findings

- **P29 §3.4 stands and is now scoped.** `eventLookup` really is the worst kind
  (50%) and the abstention mechanism really is concentrated there — but it is 10
  of 37 TR errors, not the majority. P29's proposed intervention keeps its full
  value; it is just not the biggest one.
- **P29 §6's "discrimination not recall" needs restating.** The three
  recall-widening arms lost, and that is settled. But the errors are dominated by
  *wrong arithmetic on questions the engine already serves*, which is neither
  recall nor discrimination — it is a computation the engine declines to make
  (§3.1) or makes wrongly (§4).
- **P30's abstention-channel fix is more relevant than it looked.** With 28 of 37
  TR errors being confident wrong answers, an abstention-only instrument would
  have been blind to three quarters of the problem regardless.

## 6. Roadmap impact

> **Superseded for candidates R5–R7 by `p32-ordering-sequence-bug.md`.** That
> document shipped the `ordering` fix (R5's population, via a different and
> provable mechanism) and **refuted** R7 outright: window narrowing drops gold
> evidence in 5 of 20 `eventLookup` questions, empties the context in 3, and
> would break 2 currently-correct answers. Read §5 there before acting on the
> table below.

| candidate | population | ceiling | determinism | offline testable |
|---|---|---|---|---|
| **R5: make `ordering` fire the deterministic path on binary A-or-B** | 5 (§3.1) | **+1.0pp** | yes — date comparison | yes, fully |
| **R6: fix `relative` arithmetic and unit rendering** | 7 (§4) | **+1.4pp** | yes — date difference | yes, fully |
| R7: P29 §6 anchor selection for `eventLookup` | 10 | +2.0pp | partial | partial |
| R4: conjunction decomposition (pre-registered) | 1 (ABS) | **+0.2pp** | no — LLM expansion | no |

R5 and R6 are the best available spends and they are unlike anything attempted so
far on TR: **they are deterministic code paths, so they can be unit-tested to
95%+ offline and shipped without spending a run to find out whether they work.**
Every prior TR arm was an LLM-behaviour experiment that cost a run to refute.

Combined with R7, TR has ~22 addressable errors (+4.4pp), taking the system from
85.60% toward ~90%.

## 7. A probe error worth recording

My first pass at "is the gold answer in the context?" reported 26 of 37 TR errors
as recall failures. That number is wrong and inflate the recall story: many
LongMemEval gold answers are **full sentences** (`'I went on a day hike to Muir
Woods National Monument…'`) or **derived quantities** (`'18 days. 19 days
(including the last day) is also acceptable.'`), neither of which can appear
verbatim in a context. String presence on that population measures answer
*format*, not retrieval. Splitting by answer type — which §2's kind table does
instead — removed the artefact. Same failure mode as the lazy-regex false
positive in P29 §9: a probe that can only produce one verdict will produce it.
