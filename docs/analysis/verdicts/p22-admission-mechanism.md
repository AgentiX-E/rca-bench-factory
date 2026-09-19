# P22 investigation — what actually causes "answering turn missing"

**Status: four mechanisms tested, three falsified, one confirmed and quantified.**
No code written yet. This is the due-diligence record that has to exist before a
fix is proposed, because the obvious diagnosis ("ranking is imperfect") is not
actionable and two of the three falsified candidates were plausible enough to
have wasted an iteration.

Baseline for every number: run `34915402976`.

---

## 1. The population, restated precisely

The P21 measurement said 45 of 74 failures are "the session was reached but the
turn carrying the value was not". Re-deriving it with the session→turn structure
made explicit changes the shape of the problem, so the first task was to pin down
what "reached" means. Two different tests give two different answers, and the
difference is not a bug in either:

| test | question it answers |
|---|---|
| `answer_session_content` membership (P21 §6) | is *any* text of an answer session in the prompt? |
| per-turn membership, this pass | is *the* turn stating the value in the prompt? |

---

## 2. Candidate A — turn truncation: **falsified**

`retrieveTurns` searches a copy of each turn cut to `DEFAULT_MAX_TURN_CHARS` =
2000, and `truncateText` appends `[truncated]`. With `[truncated]` present in 268
of 500 retrieved blobs, truncation is unquestionably active, so this was the
first suspect.

It is not the cause. Taking the 10 clearest cases and locating the gold value's
byte offset inside its answering turn:

| id | answering turn length | gold offset | offset % | turn > 2000 chars? |
|---|---|---|---|---|
| `71017277` | 464 | 252 | 54 % | no |
| `d52b4f67` | 242 | 104 | 43 % | no |
| `5d3d2817` | 285 | 42 | 15 % | no |
| `gpt4_8279ba03` | 259 | 169 | 65 % | no |
| `9a707b82` | 459 | 201 | 44 % | no |
| `73d42213` | 1382 | 921 | 67 % | no |
| `d23cf73b` | 1949 | 1061 | 54 % | no |
| `9ee3ecd6` | 2004 | 341 | 17 % | **yes** |
| `8e91e7d9` | 3111 | 1002 | 32 % | **yes** |
| `eac54add` | — (gold not verbatim) | — | — | — |

**8 of 9 locatable answering turns are well under the 2000-char limit and the gold
sits mid-turn.** Truncation can affect at most 2 of them. The premise is refuted
as a primary cause.

---

## 3. Candidate B — lexical anchor mismatch: **real, but not the whole story**

`71017277` is the canonical case and it is genuinely unanswerable by a text
scorer:

- Question: *"I received a piece of **jewelry** last Saturday from whom?"*
- Answering turn: *"…I also got a stunning crystal **chandelier** from **my aunt**…"*
- Gold: `my aunt`

The question names the **category** (jewelry), the memory names the **instance**
(chandelier). Zero lexical overlap, and "chandelier" is not close to "jewelry" in
embedding space either. The admitted expansion queries confirm the blindness:
`["received jewelry","received piece of jewelry","received jewelry last Saturday"]`
— every phrase repeats the word the evidence does not use.

Measuring question-to-turn content-word overlap separates the populations cleanly:

| population | n | mean overlap with answering turn | mean max overlap with admitted turns |
|---|---|---|---|
| FAIL, answering turn absent | 10 | **1.70** | 1.80 |
| CORRECT, answering turn present | 246 | **4.30** | 4.06 |

**7 of 10 (70 %) have admitted turns that match the question at least as well as
the answering turn does.** For a text-similarity scorer the miss is therefore not
a ranking error — the answering turn genuinely is not the best match.

This is a real defect but it is **not the main one**: it accounts for ~10 of 74
failures, and it is arguably a benchmark-construction property (the dataset writes
questions against a category the memory never states) rather than an engine bug.
It is worth recording; it is not worth an iteration on its own.

---

## 4. Candidate C — answering turn is late in its session: **falsified**

Plausible because LongMemEval-S pads sessions so the fact arrives as an aside
("By the way, I just baked a chocolate cake for my friend"). If answering turns
were systematically last, a position prior would be real information a bag-of-
turns scorer cannot use.

Measured relative position (0 = first turn, 1 = last):

| population | n | mean rel-pos | median | share in last third |
|---|---|---|---|---|
| CORRECT | 264 | **0.275** | 0.182 | 12.1 % |
| FAIL | 52 | **0.165** | 0.091 | 5.8 % |

The effect runs the **opposite way and is significant in the wrong direction** —
answering turns in failures are *earlier*, and turns in the last third are answered
at **91.4 %** versus 82.6 % for the rest. Refuted. (The mechanism is transparent in
hindsight: the aside convention puts the fact in a *short* turn, and short turns
score well.)

---

## 5. Candidate D — the answer session is under-admitted: **confirmed**

This is the one that survives, and it is a real engine defect.

Split the failures whose answering turn is absent by whether its session
contributes anything at all:

| | n |
|---|---|
| REACHED-BUT-PARTIAL (session contributed ≥1 turn) | 52 |
| SESSION-NOT-REACHED (session contributed nothing) | 4 |

So in 52 of 56 cases the session *did* win a slot and the turn selection inside it
still lost the answering turn.

### The signal, with the size confound controlled

Naively, correct questions admit a larger fraction of the answer session than
failures (55.2 % vs 39.3 %) — but failures also have *larger* answer sessions
(27.9 vs 20.8 turns), so size could explain it. Held to fixed size bands:

| answer-session size | n correct | n fail | admitted fraction (correct) | admitted fraction (fail) |
|---|---|---|---|---|
| 10–30 turns | 333 | 59 | **52.4 %** | **40.0 %** |
| 30–60 turns | 50 | 19 | **46.4 %** | **33.9 %** |

**The gap survives inside both bands** (12.4 pp and 12.5 pp), so it is not a size
artefact. Correct answers admit roughly a fifth again as much of the evidence
session as failures do.

### Why the budget makes this unavoidable

The single-session path is `retrieveTurns` → `expandContextWindow(searchable,
hits.map(h => h.index), radius)` with `DEFAULT_TOP_K = 15` and
`DEFAULT_CONTEXT_RADIUS = 1`. Each hit admits its `±1` neighbours, so admission is
capped at roughly `3 × 15` positions out of the searchable pool.

The pool is large:

| | mean |
|---|---|
| turns per single-session context | 10.4 (per *the dataset's* first session) |
| sessions in a TR haystack | **43–53** |
| user turns per session | **6 (fixed by construction)** |
| answer session ordinal | **36 of 51, 33 of 43, 47 of 52** |

The answer session sits deep in a ~50-session haystack and every session presents
exactly 6 searchable user turns. Admission is decided by `topK` over ~250–300
competing user turns, and the answering turn is one turn inside one of those
sessions.

**This is the actionable finding: admission budget is allocated at turn
granularity across the whole corpus, with no guarantee that a session which
already proved relevant is admitted in full.** A session that reached the top-15
already carries the strongest available evidence that it is relevant; spending
slots on `radius` neighbours of 15 scattered hits, while leaving 5 of the 6 turns
of a recalled session unread, is the defect.

---

## 6. What this implies for the fix (not yet designed)

Direction, to be validated before implementation:

- **Coherence-by-session admission.** When a hit's session is admitted, prefer
  completing that session's turns over admitting `radius` neighbours of an
  unrelated hit. This is dataset-agnostic — it uses the session boundary the
  corpus provides, not any benchmark-specific signal.
- The risk is context dilution: more turns per session means fewer sessions. The
  eviction rule therefore has to be explicit and testable, not incidental.
- Falsifiable prediction to state up front: if session-coherent admission is the
  right fix, the admitted-fraction gap (§5) should **close** and accuracy should
  rise with it. A change that raises accuracy without moving the gap is a
  different change and should be reported as such.

---

## 7. Reproduce

```
node analysis/scripts/p22_turn_defect.mjs          # candidate A
node analysis/scripts/p22_anchor_mismatch.mjs      # candidate B
node analysis/scripts/p22_turn_position.mjs        # candidate C
node analysis/scripts/p22_session_split.mjs        # candidate D
```

All read the checked-in diagnostics under `ab_retry/`; no API calls.
