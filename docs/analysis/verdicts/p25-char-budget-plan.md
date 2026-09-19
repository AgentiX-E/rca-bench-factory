# P25 plan — bound the abstention prompt by characters

**Status: awaiting the operator's approval signal. No code will be written until then.**

Supersedes the refuted turn cap (`c984a0a`, `0b0069a`). Evidence and retraction:
`p24-cap-refuted.md`.

## 1. Conclusion first

The abstention path needs a **character** budget, not a turn budget. The
30-question ABS block splits cleanly on prompt size and on nothing else:

| run | ≤ 32k correct | > 32k correct | Fisher |
|---|---|---|---|
| `35004814319` (`4955d8e`) | **7/7** | **0/23** | 4.9e-7 |
| `34915402976` (pre-`4955d8e`) | 18/21 | 9/9 | 0.535 |

The cut that splits the broken run perfectly does nothing on the healthy one,
because the healthy run never produces an oversize prompt. `4955d8e` grew every
ABS prompt (mean 28,992 → 37,224 chars) and the growth pushed 23 of 30 past the
point where the model still abstains.

## 2. Why the previous attempt failed, in one line each

| attempt | what it did | why it failed |
|---|---|---|
| `4955d8e` session completion | admit a hit's whole session | capped at 45 **turns** ≈ 90k chars, so it grew prompts without bounding them |
| `c984a0a` turn cap at 30 | bound by **turns** | the binding quantity is characters; mean stayed 42.6 turns / 37,224 chars |
| `0b0069a` scope reduction | revert the prompt-format change | correct, but left the axis wrong |

Both spent the budget on the wrong unit. A turn ceiling can be satisfied while the
prompt balloons, because `DEFAULT_MAX_TURN_CHARS` is 2000.

## 3. Design decision — where the bound goes

Three options, evaluated on the code as it stands:

| option | mechanism | verdict |
|---|---|---|
| A. bound at `answerAbstention` only | clamp `retrieved` after `retrieveTurns` returns | **smallest change, but post-hoc** — it truncates a string rather than choosing turns, so a turn can be cut mid-sentence |
| B. bound inside `retrieveTurns` | replace the turn budget with a character budget, admitting in rank order until the ceiling | **preferred** — it decides *which* turns fit, keeps the hit-priority property, and reuses `expandContextWindowBounded`'s admission loop with a different cost function |
| C. bound in `buildConservativeQaPrompt` | truncate the rendered prompt | rejected — the renderer would need to know the model's limit, and it would cut the retrieval evidence rather than the marginal turns |

**Choose B**, with the admission cost changed from `+1 per turn` to
`+turn.length + 1`. The hit-priority ordering (`expandContextWindowBounded` pass 1
before pass 2) carries over unchanged, so the property that made the primitive
worth writing is preserved.

## 4. The one thing I will not do

**I will not tune the cut on the ABS questions.** The 32k knee was found on the
same 30 questions it would be scored against. That is the error §2 and §3 of
`p24-cap-refuted.md` are about, and doing it again while writing a document that
criticises it would be worse than the original mistake.

Instead the budget is set from the model's context limit, and the ABS cell is
reported afterwards as a directional result at n = 30. Concretely:

- `deepseek-chat` accepts 64k tokens; the prompt's own budget is already
  `DEFAULT_MAX_AGGREGATION_CHARS = 20,000` on the multi-session path, which is the
  one precedent in the codebase for "how much text do we hand this model".
- Propose `DEFAULT_ABSTENTION_MAX_CHARS = 20,000`, matching that precedent, and
  **state in the commit that 32k is the measured knee but 20k is chosen for
  consistency and because it is a round, pre-existing number rather than a fitted
  one.**
- If 20k regresses ABS, the honest response is to report that the knee is not
  transferable as a constant, not to lower it to whatever wins.

## 5. Acceptance criteria

| # | criterion | how it is measured |
|---|---|---|
| A1 | character ceiling is enforced | new unit tests on the admission primitive at a character cost, including the "budget smaller than the first hit" edge |
| A2 | hit priority survives the change | the turn admitted first is still a hit, at every budget |
| A3 | the non-abstention paths are untouched | existing `answer` / `answerTemporal` / `answerSessions` tests unchanged and green |
| A4 | the refuted constants are gone | `admissionMode`, `abstentionAdmissionBudget`, `DEFAULT_ABSTENTION_ADMISSION_BUDGET` deleted with their tests; `grep` returns nothing |
| A5 | coverage ≥ 95% on all four dimensions | `pnpm check`, per-file table inspected, not just the total |
| A6 | full local gate green before any push | `pnpm check` exit 0, 940+ tests |
| A7 | the ABS effect is reported as an n=30 cell | a full benchmark run, plus an explicit statement that 30 questions cannot move the 500 total |

## 6. Falsifiable prediction

**P1: the mean ABS prompt falls below 25k chars and the oversize population
(> 32k) drops to 0.**

**P2: ABS accuracy does not regress** — i.e. ≥ 24/30, and ideally ≥ 26/30.

**What would falsify the mechanism:** ABS unchanged at 24/30 *with* the oversize
population emptied. That would mean oversize is a correlate, not the cause, and the
mechanism must be re-derived — the same standard that retired the turn account.

**Known risk, stated in advance:** the smallest ABS prompt in the regression run is
15,754 chars and the largest is 49,585. A 20k ceiling will bind on roughly half the
block. If the evidence turn is genuinely absent from the ranked list for those
questions, a smaller prompt cannot help, and the result will be flat. That outcome
is informative — it would localise the defect to retrieval rather than to prompt
size — and it will be reported as such rather than reframed.

## 7. Order of work

1. Delete `admissionMode` / `abstentionAdmissionBudget` / `DEFAULT_ABSTENTION_
   ADMISSION_BUDGET` and their 5 tests (A4) — do this **first**, so no code is
   written on top of the refuted axis.
2. Write failing tests for the character-cost admission (A1, A2).
3. Implement it inside `retrieveTurns` (option B).
4. Confirm the non-abstention paths are byte-identical (A3).
5. `pnpm check`, inspect the per-file coverage table (A5, A6).
6. Commit as Lambertyan, inspect-first, then one full run (A7).
