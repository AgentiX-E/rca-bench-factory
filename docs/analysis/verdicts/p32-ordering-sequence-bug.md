# P32 — `formatOrdering` returned one item for "from earliest to latest" (fixed), and three candidate interventions refuted offline

**Status:** one bug fixed and shipped (6 tests, 4 verified red before the fix);
three further candidates refuted at zero API cost.

---

## 1. The bug

`formatOrdering` (`temporal-engine.ts`) tested the recency branch **before** the
sequence branch:

```ts
if (/\bmost recently\b|\blatest\b|\bnewest\b/i.test(question)) { … }   // fires first
if (/\border from first to last\b|\bwhat is the order\b|\bfirst, second\b/i.test(question)) { … }
```

The recency branch matches the **bare word** `latest`. A question asking for a
full ranked listing — *"from earliest to latest"* — contains that word, so the
engine returned `ordered[ordered.length - 1].name`, the single last event,
instead of the sequence.

Reproduced deterministically, no LLM involved:

```
Q: What is the order of airlines I flew with from earliest to latest before today?
   events JetBlue 2023/01/05, Delta 2023/02/10, American Airlines 2023/03/20
   before: "American Airlines flight"
   after : "First, JetBlue flight, then Delta flight, and lastly American Airlines flight."
```

## 2. The population, measured on the real run

Of the 127 TR questions, 7 match the recency regex. Of those 7:

| question | also asks for a sequence? | currently |
|---|---|---|
| `gpt4_7f6b06db` "…three trips… from earliest to latest?" | yes | **wrong** |
| `gpt4_7abb270c` "…six museums I visited from earliest to latest?" | yes | **wrong** |
| `gpt4_e061b84f` "…three sports events… from earliest to latest?" | yes | **wrong** |
| `gpt4_f420262c` "…order of airlines I flew with from earliest to latest…" | yes | **wrong** |
| `gpt4_ec93e27f` "Which mode of transport did I use most recently, a bus or a train?" | no | correct |
| `gpt4_2f56ae70` "Which streaming service did I start using most recently?" | no | correct |
| `0db4c65d` (elapsed-time question, not routed to `formatOrdering`) | no | wrong |

**4 of 4 affected questions are wrong, and the 2 genuine recency questions are
correct** — an unusually clean separation, which is what makes this safe to fix
rather than a coin flip.

The failure signature in the run matches the mechanism exactly:
`gpt4_f420262c` gold `JetBlue, Delta, United, American Airlines`, got
`American Airlines flight from LAX to JFK` — the last item.

## 3. The fix

A question that asks for a sequence is never a "which was most recent" question,
even when it contains the word *latest*: in "from earliest to latest" the word
names the **endpoint of the listing**, not the item to return.

- `asksForSequence(question)` — the two existing sequence patterns plus
  `earliest to latest` and `from first to last`.
- The sequence branch is checked **before** the recency branch.
- The listing renderer moved into `formatSequence`, so both callers share one
  representation of a ranked list.

**Ceiling: +4 questions (+0.8pp).** Honest caveat: the golds for three of the
four are full sentences rather than lists, so conversion depends on the judge
accepting `First, X, then Y, and lastly Z.` as equivalent. That is what the next
run measures; +4 is the ceiling, not a prediction.

## 4. Tests

Six added to `temporal-engine.test.ts`:

- **4 red before the fix**, one per affected question in the run, asserting the
  full sequence is returned. Verified failing with
  `expected 'American Airlines flight' to be 'First, JetBlue flight, …'`.
- **2 no-regression**: `most recently` and `most recently, a bus or a train`
  must still return the single latest event. These were green before and after —
  they exist to stop the fix from being widened into "never return the latest
  item".

Gate: 958 tests green (cortex-eval 812). Coverage 99.88 stmts / 98.71 branch /
100 funcs / 99.88 lines; lowest branch figure anywhere 97.26%.

---

## 5. Three candidates refuted offline (no run spent)

Recorded because a refutation is a result, and each of these would have cost a
full benchmark cycle to discover.

### 5.1 R5 — binary ordering by lexical operand dating: **refuted**

Idea: for "Which X happened first, A or B?" the two candidates are named in the
question, so date each by lexical match against the retrieved context and compare
dates.

Measured on the 5 binary ordering questions (currently 0/5):

- every case came back as a **tie** — both operands resolve to the same turn
  date. LongMemEval packs 45 turns onto 4–5 session dates, and the two operands
  frequently co-occur in one turn.
- the real evidence is **relative prose inside the turn text**, not the turn
  prefix: `gpt4_76048e76` is answered by *"in mid-February, I had to take it in
  for repairs"* in a turn stamped `2023/03/10`. Date arithmetic on turn prefixes
  cannot see that.
- for `gpt4_385a5000` and `gpt4_5438fa52` no single turn even contains both
  operands.

So binary ordering is an **extraction-quality** problem, not something a
deterministic lexical rule can solve.

### 5.2 R7 — eventLookup window narrowing: **refuted, and would have been harmful**

P29 §6 proposed dropping out-of-window turns so the reader discriminates over
fewer candidates. Measured on all 20 `eventLookup` questions with
`EXTENDED_ENGINE_OPTIONS`:

| outcome | count |
|---|---|
| narrowing keeps every findable gold token | 13 |
| **narrowing DROPS gold tokens** | **5** |
| — of which narrow to **0 turns** (empty context ⇒ forced abstention) | **3** |
| — of which are **currently correct** and would break | **2** |

Mean context after narrowing: 14.1 of 45 turns. Three questions
(`gpt4_d6585ce9`, `6e984302`, `gpt4_5dcc0aab`) resolve to windows containing no
turn at all, so the intervention would have deleted the entire context. Two
currently-correct answers (`gpt4_b5700ca0`, `gpt4_5dcc0aab`) lose their evidence.

Window resolution is not reliable enough to be allowed to delete evidence. If
the anchor is ever used to constrain retrieval, it must **re-rank**, never drop,
and it must fall back to the full context when the window matches nothing.

### 5.3 R6(a) — missing-unit default: **not worth a run alone**

`relativeUnit` defaults to `day` when the question names no unit, so
`cc6d1ec1` ("How long had I been bird watching…?") returned `59` against a gold
of `Two months`. Population: 8 TR questions, 3 wrong. But **3 of the 5 correct
ones are bare day counts** (`9`, `14`, `28`) the judge currently accepts, so any
change to a natural unit risks as much as it gains. With 8 examples, fitting a
rule to them is overfitting, not engineering. Parked.

---

## 6. What the pattern says

Across P31 and this document, five candidate TR interventions have now been
examined. One shipped (§3). Three are refuted (§5). One is parked as
unfittable (§5.3). **The remaining TR error mass is dominated by LLM reading and
extraction quality over ~45-turn contexts, not by defects in the deterministic
code.** That is the honest read, and it changes the strategy: there is no
unit-testable path left to a large TR gain, so further TR work has to be
retrieval/context interventions validated by runs, with the turn-count and
evidence-retention guards §5.2 showed are necessary.

| capability | wrong | best remaining lever |
|---|---|---|
| TR | 37 | mostly LLM quality; §3 shipped (+4 ceiling) |
| MR | 15 | uncharacterised this session |
| KU | 14 | ~7 selection failures (both values in context, wrong one picked); the rest are derived counts where "gold absent" is an artefact of answer format |
| IE | 5 | — |
| ABS | 1 | R4, ceiling +1 |

**Next recommended spend:** one run carrying (a) the §3 fix, (b) R4's
conjunction decomposition, and (c) the reopened abstention channels from P30 —
each with its own ablation arm, so a single run still attributes each effect
separately.
