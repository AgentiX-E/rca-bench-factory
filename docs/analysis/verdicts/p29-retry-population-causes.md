# P29 — what the 14 retry fires actually are

**Status:** in progress. Findings below are established from run `35162802298`;
the pre-registered predictions at §6 have not been tested by a new run yet.
**Type:** offline characterisation, zero API cost.
**Why this exists:** `p28-retry-redesign-verdict.md` §8 ranks this above any
further retry work. Two retry designs, 26 fires, 0 recoveries — the wording is
not the lever, and the population's dominant cause is unidentified. Guessing at
a third wording would repeat P28's error.

---

## 1. Headline

**The 14 retry fires are a coverage failure of the deterministic temporal
engine.** The engine refuses two question kinds outright, and questions in those
kinds abstain at **19.4%** against **2.2%** for the kinds it serves — Fisher
p = 2.09e-3, odds ratio **10.74**. Seven of the nine TR fires fall in the
unserved kinds.

Two supporting associations, one of which I pre-registered and neither of which
is the main finding:

| property | fires | comparison | association |
|---|---|---|---|
| temporal kind the engine **does not serve** (TR only) | 7 of 9 | **7 of 36** TR questions abstain vs **2 of 91** served ones | **Fisher p = 2.09e-3, OR = 10.74** |
| question carries a **date/time qualifier** | 12 of 14 (85.7%) | 127 of 365 (34.8%) | Fisher p = 1.83e-4, OR = 11.24 |
| question asks for a **quantity** | 5 of 14 (35.7%) | 145 of 365 (39.7%) | none (OR 0.84) |
| window **saturated** at the 45-turn cap | 12 of 14 (85.7%) | 218 of 365 (59.7%) | weak (OR 4.0, not tested) |
| window **collapsed to one day** | 4 of 14 (28.6%) | 66 of 365 (18.1%) | weak |
| window **ends before the question date** | 7 of 14 (50.0%) | 233 of 365 (63.8%) | **none — reversed** |

The coverage finding is stronger than the date-qualifier finding not because its
p-value is smaller — the date association is actually more significant — but
because it names a **mechanism** that a fix can act on: §3.4. The date-qualifier
association is a property of the questions; the coverage boundary is a property
of the code.

Four hypotheses came back negative and are recorded because a refutation is a
result:

- **The quantity confound is dead.** `p27` §4.1.1 recorded "the failure is a
  *quantity* question, the control is an *ordering* question" as a still-live
  confound. Quantity questions are 35.7% of fires and 39.7% of the rest — no
  enrichment. That confound can be struck from the record.
- **"The window ends before the question date" is dead.** I expected temporal
  recall to be missing the *recent* region; fires are *less* likely than other
  questions to have a truncated window (50.0% vs 63.8%). Refuted, not merely
  unsupported.
- **Saturation is not the cause.** 85.7% vs 59.7% is a real association, but it
  does not discriminate abstention *within* TR (10.5% vs 7.1%).
- **"Evidence present" was the wrong reading, and P28 relied on it.** See §3.3.

## 2. The date-qualifier finding, in detail

12 of 14 fires ask about a specific *time-anchored* event:

| id | question | qualifier | ground truth |
|---|---|---|---|
| `71017277` | I received a piece of jewelry **last Saturday** from whom? | last Saturday | my aunt |
| `gpt4_fa19884d` | What is the artist that I started to listen to **last Friday**? | last Friday | a bluegrass band… |
| `eac54add` | What was the significant business milestone I mentioned **four weeks ago**? | four weeks ago | I signed a contract… |
| `6e984302` | I mentioned an investment for a competition **four weeks ago**? What did I buy? | four weeks ago | sculpting tools |
| `gpt4_8279ba03` | What kitchen appliance did I buy **10 days ago**? | 10 days ago | a smoker |
| `gpt4_93159ced` | How long have I been working **before** I started my current job? | before | 4 years and 9 months |
| `c8090214` | How many days **before** I bought the iPhone 13 Pro did I attend…? | before | 7 days |
| `c9f37c46` | How long had I been watching…**when** I attended the open mic? | when | 2 months |
| `gpt4_4cd9eba1` | How many weeks have I been accepted…**when** I started attending…? | when | one week |
| `0977f2af` | What new kitchen gadget did I invest in **before** getting the Air Fryer? | before | Instant Pot |
| `5d3d2817` | What was my **previous** occupation? | previous | Marketing specialist |
| `3b6f954b` | Where did I attend for my **study abroad** program? | (implicit) | Univ. of Melbourne |

The two IE questions without an explicit qualifier are still **displacement**
questions — they ask for a value that has since been superseded or for a
location never restated. That makes the underlying shape:

> **the answer is a value attached to a point in time, and the retriever must
> find the *dated event*, not the topic.**

## 3. Why that shape defeats the current pipeline

This is a *retrieval* failure, not an abstention failure, and the P28 verdict's
"over-abstention" reading was wrong for most of the population. The evidence:

### 3.1 The answer phrase is usually absent from the window

| probe | result |
|---|---|
| answer phrase present in the window | **4 of 14** |
| topic term present in the window | 10 of 14 |

The gap between those two numbers is the whole story. `71017277` illustrates it:
the window contains "aunt" **and** "jewelry", but the answer-bearing turn is
*"I also got a stunning crystal chandelier from my aunt today"* while the
question asks about a *piece of jewelry received last Saturday*. The topic is in
the window; the dated event is not. A reader that sees a topic match and no
dated match has no basis to answer, so it abstains — correctly, given what it
was handed.

### 3.2 The 45-turn budget is spent on the wrong region

`DEFAULT_ADMISSION_BUDGET = 45` (= `topK 15 × (1 + 2 × radius 1)`). Twelve of
the 14 fires sit at exactly 45 turns, i.e. the window is **saturated**. And for
the four date-comparison questions the entire budget landed on a single day:

| id | window span |
|---|---|
| `gpt4_93159ced` | `2023/05/25 .. 2023/05/25` |
| `c8090214` | `2023/12/10 .. 2023/12/10` |
| `c9f37c46` | `2023/05/20 .. 2023/05/20` |
| `gpt4_4cd9eba1` | `2023/04/19 .. 2023/04/19` |

These questions ask about a **relationship between two events on different
dates** ("how many days before X did Y happen"). A window containing one date
cannot express the answer even in principle, and the model abstains instead of
computing from a single operand — which is the right behaviour under an
abstention contract and the wrong *input*.

**This is the same failure `p27` documented for `6456829e_abs`** ("the window
missing the second operand's session"), now confirmed as a recurring shape
rather than a single instance.

### 3.3 Where the earlier reading went wrong

`p28` §5 asserted that 5 of the 14 fires have `top1Score = 1.000` so "retrieval
is not the problem for those five". That inference does not hold. `top1Score` is
the max hit score, and a *topically* near-exact hit scores 1.000 while being the
wrong turn: `eac54add` retrieves business-project turns at 1.000 and the answer
is a contract-signing mentioned elsewhere. A high score proves the retriever
found something on-topic; it does not prove it found the dated event.

The verdict already flagged the probe as lexical and overstating. This is the
stronger form of that caveat: **`top1Score` cannot separate "evidence present"
from "topic present"**, so it must not be used to rule retrieval out.

### 3.4 The mechanism: the deterministic temporal engine is not reached

§7 step 3 asked why the date-aware path fails on the 9 TR fires once routing and
budget were eliminated. The answer is inside `answerTemporal`:

```ts
const supportsDeterministic = kind !== 'other' && kind !== 'eventLookup';
```

**Seven of the nine TR fires are kinds the engine refuses to serve.** Running
`classifyTemporalQuestion` on all nine:

| kind | n | engine serves it? |
|---|---|---|
| `eventLookup` | 5 | **no** — explicitly excluded |
| `interval` | 2 | yes |
| `other` | 2 | **no** — explicitly excluded |

Both exclusions are individually defensible — an `eventLookup` asks for an
entity at a time anchor rather than a date computation, and `other` is a
catch-all — but the aggregate cost is measurable, and it is large:

| TR questions | n | abstained | rate |
|---|---|---|---|
| engine-served (`interval`/`relative`/`ordering`) | 91 | 2 | **2.2%** |
| not served (`eventLookup`/`other`) | 36 | 7 | **19.4%** |

**Fisher p = 2.09e-3, odds ratio = 10.74.** The engine's coverage boundary
predicts abstention an order of magnitude better than the date-qualifier
classifier does, and unlike that classifier it names a **mechanism**:
`eventLookup` and `other` questions have no deterministic path, so they depend
entirely on the model reading dates out of the prompt itself — which is the
failure mode the engine was built to remove.

By kind, the abstention rates are stark:

| kind | n | abstained | fires |
|---|---|---|---|
| `eventLookup` | 20 | 5 (**25.0%**) | 5 |
| `other` | 16 | 2 (12.5%) | 2 |
| `interval` | 26 | 2 (7.7%) | 2 |
| `relative` | 25 | **0 (0.0%)** | 0 |
| `ordering` | 40 | **0 (0.0%)** | 0 |

`relative` and `ordering` — the two kinds with the most complete engine support
— abstain **zero** times across 65 questions. `eventLookup`, which the engine
refuses outright, abstains 5 times in 20. The boundary is doing the work.

**This supersedes §3's framing.** The fires are not primarily a retrieval-window
failure; they are a **coverage** failure of the deterministic engine.
`71017277` is the type case: "I received a piece of jewelry last Saturday from
whom?" is classified `eventLookup`, gets no date resolution, and the model must
find "last Saturday" in a 45-turn window unaided. It abstains.

`benchmark.ts` routes by capability, not by whether the question is temporal:

| capability | path | date reasoning? |
|---|---|---|
| TR | `answerTemporal` | yes — `resolveTimeRange`, session-first retrieval, lexical recall |
| IE | `answer` | **no** |
| KU | `answerKnowledgeUpdate` | no — two-step value enumeration |

Of the 12 date-qualified fires, **9 are TR and already route to the date-aware
path** — so routing cannot explain the majority, and the temporal path fails on
them on its own merits. The remaining 3 are IE/KU questions carrying a time
qualifier that their path has no mechanism to use. That is a genuine gap, but it
is worth at most 3 questions and must not be presented as the headline.

## 4. Three sub-populations, not one

The 14 fires are not homogeneous, and conflating them was part of P28's error.
With §3.4 established, the split is:

| sub-population | n | shape | failure | remedy class |
|---|---|---|---|---|
| **unserved temporal kind** | 7 | `eventLookup` / `other` | no deterministic date resolution is attempted | **extend engine coverage** |
| **served but multi-operand** | 2 | `interval` with two anchors | one operand's session not admitted | multi-anchor retention |
| **non-temporal path with a time qualifier** | 3 | IE/KU carrying "last"/"before" | the routed path has no date mechanism | routing or per-path support |
| genuine absence | 2 | `gpt4_8279ba03`, `3b6f954b`-class | uncertain | abstention may be correct |

The first row is the actionable one and it is the majority. The important
consequence: **these three classes need three different fixes**, which is the
precise reason a single prompt rewrite could never have worked — and the reason
P28's falsification was informative rather than merely negative.

## 5. What this does NOT establish

- **The date-qualifier association is strong but the classifier is crude.** The
  regex matches 11 common words (`last`, `ago`, `before`, `after`, `previous`,
  `when`, `yesterday`, …) over 379 questions; it is not a validated
  temporal-intent detector. Fisher p = 1.83e-4 and OR = 11.24 are computed on
  that classifier's output and inherit its error. The association is real for
  *this* classifier; a better one could be stronger or weaker.
- **An association is not a mechanism.** 85.7% of the fires being date-qualified
  does not say *why* date-qualified questions fail. §3 proposes a mechanism from
  the window inspection, and that mechanism is not proven.
- **Four of the 14 are still ordinary absences** (`5d3d2817`, `3b6f954b`,
  `eac54add`, `gpt4_8279ba03` by answer-phrase probe). Abstention may be correct
  for them and the judge may be lenient.
- **The "10 topic-present" count comes from a lexical probe** that overstates,
  as `3b6f954b` demonstrated in the P28 verdict (it matched a distractor
  university).
- **n=14 is small** and one run cannot separate structure from draw. The Fisher
  test controls for that as far as it can, but the fire set is a single draw
  from a single stochastic endpoint.
- **Three of the 12 date-qualified fires bypass the temporal path entirely**
  (`5d3d2817` IE, `0977f2af` KU, `7a8d0b71` IE). Routing is therefore a real but
  minority contributor; §5 records it rather than folding it into the
  date story.

## 6. Pre-registered predictions (not yet run)

**A constraint I had to discover before proposing anything.** `runner.ts` §320
records that three TR recall-widening arms — *date-range*, *occurrence-date*,
*entity-graph* — **all widened recall and all lost**, which established that
"TR's bottleneck is discrimination rather than recall depth; an arm that widens
context again would re-test a settled question."

That directly constrains the remedy for §3.4. The obstacle for `eventLookup` is
not that the anchor is unknown — `resolveTimeRange` computes it and
`buildTemporalEventLookupPrompt` renders it — but that the anchor is used only to
**annotate** turns, never to **select** them. Retrieval stays semantic+lexical,
and the reader must then discriminate in-window from near-miss across 45 turns.

Since widening recall is a settled loss, the open question is the **opposite**
one, and it is a code question, not a run:

> does the existing `timeWindow` annotation actually let the reader discriminate,
> or is the annotation computed but unreachable in the cases that fire?

The intervention candidate is therefore **discrimination-supporting, not
recall-widening**: make the resolved anchor constrain or re-rank the turn list
for `eventLookup`, dropping near-miss turns rather than adding more.

| # | prediction | falsifier |
|---|---|---|
| **P1** | `eventLookup` abstentions fall from 5/20 to ≤2/20 | unchanged ⇒ the anchor was not the lever |
| **P2** | The 5 `eventLookup` fires convert; the 2 `other` fires do not | `other` also converts ⇒ the mechanism is broader than anchor use |
| **P3** | ABS stays at 29/30 | any ABS regression ⇒ net harm |
| **P4** | Overall accuracy rises by ≥2 questions | <2 or negative ⇒ the intervention is noise or regression |
| **P5** | No `relative`/`ordering` regression (currently 0 abstentions in 65) | any new abstention there ⇒ the change destabilises the served kinds |
| **P6** | The turn COUNT does not rise | the count rises ⇒ this became recall-widening, which §320 says loses |

**A new run is NOT authorised yet.** Settling whether the annotation reaches the
reader in the firing cases is offline work at zero cost, and P28's failure is
the argument for doing it first.

## 7. Sequencing

1. **DONE (offline)** — how the temporal path selects turns, and why these fires
   bypass it. See §5.1: routing explains 3 of 12; the rest fail on the date-aware
   path itself.
2. **DONE (offline)** — whether the 45-turn admission budget is binding. See §8:
   it is not. Weak association, and no discrimination within TR.
3. **DONE (offline)** — why the date-aware path fails on the 9 TR fires. See
   §3.4: the deterministic engine refuses `eventLookup` and `other`, which
   together carry 7 of the 9, and unserved kinds abstain at 19.4% vs 2.2%.
4. **DONE (offline, measured on the real dataset)** — whether the `timeWindow`
   annotation reaches the reader in the firing `eventLookup` cases. It does, and
   it is arithmetically correct. It also does not discriminate, which is the
   finding. See §9.
5. **Only then** design a discrimination-supporting intervention, pre-register,
   and spend a run.

The one action explicitly **not** taken: another prompt-wording change.

## 8. Hypotheses tested and refuted

Recorded because a refutation is a result, and because leaving them un-stated is
how they get re-tried by a future session.

| hypothesis | test | outcome |
|---|---|---|
| The failure is **comparison-shaped** (both operands must fit) | hand-classify all 14 | **refuted as the dominant cause** — 9 of 14 are single-hop lookups, only 5 are comparisons |
| The answer's **evidence is absent** (a recall miss) | answer-phrase probe | true for 10 of 14 — and this contradicts P28's "evidence present" reading; the discrepancy *is* the finding (§3.3) |
| The population is **quantity** questions | share of fires vs rest | **refuted** — 35.7% vs 39.7%, no enrichment |
| The window **ends before the question date** | share of fires vs rest | **refuted, and reversed** — 50.0% vs 63.8% |
| The **45-turn budget** is the binding constraint | share of fires vs rest | weak (85.7% vs 59.7%) and it does **not** discriminate abstention within TR (10.5% vs 7.1%); not established |
| **Routing** sends these to a path without date reasoning | cross-tab capability × qualifier | true for 3 of 12; **minority contributor only** |
| The questions are **date-qualified** | Fisher exact | **survives**: p = 1.83e-4, OR = 11.24 |

Six hypotheses were killed by six cheap offline tests. That ratio is the argument
for doing this before spending a run — P28 spent one on the seventh.

## 9. Step 4 answered: the annotation reaches the reader and does not narrow the choice

Measured on `/tmp/lme-data/lme.json` through the real path
(`runTimeWindowAnnotationAblation`, so the loader renders dated turns), for the
two weekday-anchored `eventLookup` fires — the only two questions for which
`extendedTimeRange` provably changes anything. `enableTimeWindowAnnotation: true`
in the treated arm, `EXTENDED_ENGINE_OPTIONS` in both.

| question | resolved window | turns | in-window | 1–3 days out | unlabelled |
|---|---|---|---|---|---|
| `71017277` "…jewelry last Saturday…" | `2023/03/04..2023/03/04` | 45 | **21** (all `03/04`) | 0 | 24 (`02/03`, `02/08`, `02/11`, `02/14`) |
| `gpt4_fa19884d` "…artist I started to listen to last Friday?" | `2023/03/31..2023/03/31` | 45 | **19** (all `03/31`) | 10 (`03/28`×6, `03/30`×4) | 16 (`02/27`, `03/10`, `03/16`, `03/18`) |

Three conclusions, in order of how much they matter:

1. **The annotation is not unreachable.** Both the `"timeWindow"` field and the
   instruction that explains it ("Prefer an in-window turn…") are present in the
   annotated arm's prompt and absent from the control's. Step 4's first
   alternative — "computed but unreachable" — is refuted. `annotateTimeWindow` is
   also arithmetically correct: every label matches the turn's true distance to
   the window, and the horizon behaves as documented.
2. **It does not narrow the candidate set.** A one-day window still contains
   19–21 of 45 turns, because LongMemEval clusters 45 turns onto only 4–5 session
   dates. The instruction tells the reader to *prefer* an in-window turn, but
   with ~20 of them the preference is nearly vacuous: the reader must still
   discriminate among ~20 to find the one that answers.
3. **Δ = +0.00% is therefore consistent with a working feature, not a dead one.**
   The label is correct and insufficient. Both arms abstained in this
   measurement; nothing here licenses enabling the annotation on the graded path.

**This is the argument for §6's intervention.** The lever is not "annotate
better" — the annotation is already correct — it is to let the resolved anchor
*select* or *rank*, so the in-window set shrinks from ~20 to the handful that
actually mention the event. That is P1's target (`eventLookup` abstentions 5/20 →
≤2/20), and it is still un-run.

**A false positive I nearly reported.** My first probe paired a turn's date with
a label using a lazy `[\s\S]*?` regex, which skipped across unlabelled turns and
stitched their dates onto the next labelled turn's label. That produced two
impossible rows — `2023/02/03 :: "in window"` for a `2023/03/04` window — and I
was one step from filing `annotateTimeWindow` as buggy. Re-matching one JSON
turn object at a time (content is escaped, so its own quotes are `\"`) removed
both rows and showed every label to be correct. Recorded because the error
direction here is "invents a bug", and inventing a bug is worse than missing one.
