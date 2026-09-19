# Age-Operand Retrieval Failure — Deep Audit + Fix Plan

**Date:** 2026-09-05
**Arm:** treatment (`a104ea0`)
**Scope:** MR questions whose answer needs the user's age `"32"`

---

## 1. Corrected fact table (two earlier misreads fixed)

An earlier pass counted the string `"32"` and was fooled by **timestamp noise**
(`[2023/05/25 12:32]` contains `32`). Restricting to real age phrasings
(`turned 32`, `I'm 32`, `age 32`, `32 years old`, …) gives:

| Question | gold | real "32" in FULL sessions | real "32" in RETRIEVED | abst (4 runs) |
| --- | --- | --- | --- | --- |
| How old was I when Alex was born? | `11` | 2 | **0** | **4/4** — retrieval failure |
| How many years will I be when Rachel gets married? | `33` | 1 | **0** | **4/4** — retrieval failure |
| How many years older is my grandma than me? | `43` | 3 | 1 | 0/4 — recovered by routing fix |
| Average age of me/parents/grandparents | `59.6` | 2 | 1 (3/4 runs) | mostly answered |

Two questions — `Alex born` and `Rachel married` — have a **consistent**
retrieval failure for the `"32"` operand: the age is present in the full answer
sessions but absent from the retrieved window in every run.

---

## 2. Root cause

The age `"32"` is stated as a **by-the-way aside** inside a session whose main
topic is something else:

- `Alex born`: `"…options suitable for someone my age? By the way, I just turned 32 last month…"` (a career-change session)
- `Rachel married`: `"…do you think 32 is considered young…"` (a travel/fitness session)

The question is about `Alex's birth` / `Rachel's wedding`, so those sessions are
semantically distant from the operand `"my age"`.

The multi-session query-expansion prompt is **activity/event-oriented**:

```
Given a question about counting or aggregating past activities,
list the SPECIFIC ACTIVITIES whose descriptions would appear in the evidence sessions.
```

For derivation (operand) questions it therefore emits event phrases, never the
missing operand:

| Question | expansion queries produced | missing operand |
| --- | --- | --- |
| Alex born | `["Alex's birth", "my age at Alex's birth"]` | `my age` / `my birthday` |
| Rachel married | `["get married", "attend wedding", "celebrate wedding"]` | `my age` |

The decisive control: `average age` expands to `["calculate my age", …]` and
**does** retrieve the `"32"` (3/4 runs). When the expansion names `my age`, the
operand is found; when it names only the event, it is not.

This is the **same class of bug as the routing fix**: the query expansion is
specialized for one question kind (enumeration/counting → activities) and does
not handle derivation (→ operands).

---

## 3. Fix plan (P0)

Mirror the routing fix, one level deeper in the pipeline.

1. **`buildDerivationQueryExpansionPrompt(question)`** — a new expansion prompt
   for derivation questions that asks the LLM to list the **specific
   facts/operands** to retrieve (the numbers and dates the question compares or
   combines), explicitly including `my age`, `my birthday`, `my current age`,
   and the other operand (e.g. `Alex's age`, `Alex's birth year`).

2. **Route the expansion** — `retrieveSessionsForQuestion` currently hardcodes
   `buildMultiSessionQueryExpansionPrompt`. Route it by
   `classifyAggregationKind(question) === 'derivation'` (computed once in
   `answerSessions` and passed down, to avoid a second call), exactly as the
   answer prompt is already routed.

3. **Feed both channels** — the expansion queries are already used by both the
   session-level expansion and the turn-level recall, so the operand query
   (`my age`) will also reach the turn-recall channel without further change.

### Tests (TDD, before implementation)

1. `buildDerivationQueryExpansionPrompt` asks for operands/facts, not
   activities (and contains the operand-instruction marker).
2. `buildMultiSessionQueryExpansionPrompt` is unchanged (still activity-oriented).
3. Routing test: a derivation question produces the derivation expansion prompt;
   an enumeration question keeps the activity expansion prompt.
4. Completeness invariant: every `AggregationKind` has a matching expansion
   prompt (classifier ↔ expansion prompt), so a question can never route to a
   prompt whose output omits its operands.
5. Mutation test: removing the routing branch or the operand instruction must
   fail the relevant test.

### Acceptance criteria

| Criterion | Bar |
| --- | --- |
| Coverage | ≥ 95% Statements / Branch / Functions / Lines |
| `pnpm check` | exit 0, zero skips |
| Mechanism A/B | same-instant 4v4; `"32"` operand retrieved for `Alex born` + `Rachel married` (or their abstention drops); exact permutation p ≤ 0.05 |
| Attribution | residual 0 — only derivation-classified MR questions move; IE/KU/TR unchanged |
| Commit | `Lambertyan <lambertyan@agentix-e.dev>`, English message |

### Prize

Two questions, both 4/4 abstainers (`Alex born`, `Rachel married`) = 8
abstentions over 4 runs = up to +2 correct/run on MR — comparable to the routing
fix just accepted (+2.5/run).

### Out of scope

The deeper, general problem that the user's age is a scattered aside in
topically-distant sessions (a retrieval-granularity issue) is not solved by this
fix; this fix makes the derivation path name its operands so the existing
retrieval can find them. A full entity-centric retrieval layer is a larger
future iteration.
