# P33 — `before` read as a value qualifier sent interval questions into the bitemporal path (fixed)

**Status:** one bug fixed and shipped (4 tests, 3 verified red before the fix).
Found offline at zero API cost by continuing the P32 method: read the branch
predicates, then measure the population they select against the real run.

---

## 1. The bug

`classifyKnowledgeUpdateQualifier` (`fact-store.ts`) treated **any** occurrence
of the word `before` as a previous-value qualifier:

```ts
if (/\b(previous|before|previously|originally|used to|earlier)\b/i.test(question)) {
  return 'previous';
}
```

But `before` is also an ordinary preposition that introduces a second event. In
*"What new kitchen gadget did I invest in **before getting the Air Fryer**?"* it
names a temporal anchor, not a stale value of a subject.

The consequence is not a classification nit. When `answer` sees a non-`other`
qualifier it enters the **bitemporal path first** (`natural-language-memory.ts`
§726-740), which extracts `(subject, predicate, object, date)` triples, takes the
**first** fact's subject (`facts[0].subject`), and returns
`previousObject`/`currentObject` over that subject's timeline. For a question
whose real subject is a gadget, that path is structurally the wrong tool: it
answers from an unrelated "subject" whose two dated facts happen to be present,
returning a confident value instead of falling through to the interval engine.

## 2. The population, measured on the real run

Of the 14 wrong KU questions in run `35162802298`, only **4** carry a
`previous`/`current` qualifier at all; the other 10 are `other` and never touch
the bitemporal path. All 4 of the qualified ones have an **empty `llmRaw`** —
i.e. they were answered by the deterministic path, not by the model:

| id | question | qualifier (before) | gold | got |
|---|---|---|---|---|
| `031748ae` | "How many engineers do I lead when I just started my new role…" | `current` ("new role" — not matched; see §5) | prose | 5 |
| `c4ea545c` | "Do I go to the gym more frequently than I did **previously**?" | `previous` | Yes | three times a week |
| `f685340e` | "How often do I play tennis … **previously**? How often do I play now?" | `previous` | prose | weekly |
| `89941a94` | "**Before** I purchased the gravel bike, do I have other bikes …?" | `previous` (bug) | Yes | commuter bike |
| `0977f2af` | "What new kitchen gadget did I invest in **before** getting the Air Fryer?" | `previous` (bug) | Instant Pot | `null` (abstained) |

Two of the five are the pure `before`-as-preposition case; `f685340e` is a
preposition-free variant of the same error class (see §4). `031748ae` and
`c4ea455c`/`f685340e` are analysed in §5 and §4 and are **not** fixed here.

## 3. The fix

`before` now reads as a value qualifier only where it qualifies the subject:

| shape | example | verdict |
|---|---|---|
| ends the clause | "What was my occupation **before**?" | `previous` |
| followed by possessive/determiner | "Where did I work **before my current role**?" | `previous` |
| followed by subject + verb | "**Before I purchased** the gravel bike, …" | `other` |
| followed by a gerund | "…invest in **before getting** the Air Fryer?" | `other` |

`previous`/`previously`/`originally`/`used to`/`earlier` are left alone — they
are unambiguous and none of them collided.

**Ceiling: +2 questions (+0.4pp)** (`0977f2af`, `89941a94`). Honest caveat:
neither is a guaranteed conversion. `0977f2af` currently abstains and falls
through to a reader that has to *find* `Instant Pot` (P31 measured 10 of 14 such
contexts as evidence-absent); `89941a94`'s gold is a prose "Yes. (You have a road
bike too.)" against a question asking for bike types, so the CoT prompt may or
may not land it. +2 is the ceiling, not a prediction. The stronger claim the fix
rests on is **structural**: five questions whose correct subject-entity is
irrelevant to the bitemporal timeline are no longer answered from that timeline.
That is right regardless of whether the substitute answer is correct.

## 4. A second, closely related defect found but not fixed

`f685340e` — *"How often do I play tennis with my friends at the local park
**previously**? How often do I play **now**?"* — is a **pace comparison**, not a
value selection. `previous`/`current` chose which of two *objects* to return,
and returned `weekly` against a gold that names both the old and the new
frequency.

This is the same shape as §3 but the guard is different: it is not "is `before`
a preposition" but "does the question ask about a **frequency/pace** rather than
a value". I have left it **unfixed** because the fix needs a rule I cannot
justify from 1–2 examples, and fitting a rule to two examples is overfitting
(the same reason R6(a) is parked in P32 §5.3). Recording it here so the
population is measured rather than merely noticed.

## 5. A near-miss worth recording

`031748ae` — *"How many engineers do I lead when I just started my new role as
Senior Software Engineer? How many engineers do I lead … now?"* — is classified
`current`, and my first instinct was that `new role` should have made it
`previous`. That reading is **wrong**: the question asks two things, and the word
`now` genuinely asks for the current value, so `current` is the correct
qualifier. The failure here is that the gold is a prose answer describing both
counts while the engine returns the bare integer `5`. That is a **stitching**
problem — the bitemporal path returns a single value for a two-part question —
and it is a separate defect from §3. It is not fixed here, and it is **not**
evidence for the `before` guard.

## 6. Tests

Four added to `fact-store.test.ts`:

- **3 red before the fix**, one per measured question in the run, each asserting
  `other`:
  - "What new kitchen gadget did I invest in before getting the Air Fryer?"
  - "Before I purchased the gravel bike, do I have other bikes …?"
  - "How often do I play tennis … previously? How often do I play now?"
    (pinned via the frequency guard, §4)
- **1 no-regression**, green before and after: sentence-final `before`
  ("What was my occupation before?") and possessive-followed `before`
  ("Where did I work before my current role?") must still classify as
  `previous`. This exists so the fix cannot be widened into "never treat
  `before` as a qualifier".

Gate: **962 tests green** (cortex-eval 816). Coverage 99.84 stmts / 98.65 branch
/ 100 funcs / 99.84 lines in cortex-eval; lowest branch figure anywhere 97.26%.

## 7. Where this leaves the audit

Three bugs have now come from the same method — read the branch predicate, then
measure the population it selects against a real run's diagnostics:

| # | defect | ceiling | status |
|---|---|---|---|
| P32 | `formatOrdering` recency branch shadowed the sequence branch | +4 (+0.8pp) | **shipped** |
| P33 | `before`-as-preposition read as a value qualifier | +2 (+0.4pp) | **shipped** |
| P33 §4 | pace comparison answered by value selection | ~1 | measured, **parked** |

The method works because a mis-ordered or over-broad predicate is a **structural**
defect: it is visible by reading the code, its population is countable from a
run's diagnostics, and its fix is unit-testable. That is the only class of
change that can be validated without spending a benchmark cycle, and it is now
exhausted for TR and KU — P31/P32 §6 found the remaining TR mass is LLM reading
quality, and this document finds the same for KU's other 10 errors (wrong
value/time/number chosen from a context that contains both, with the model
answering directly).

**Next spend is therefore a run**, carrying P32 + P33 + R4 + the reopened
abstention channels from P30, each with its own ablation arm.
