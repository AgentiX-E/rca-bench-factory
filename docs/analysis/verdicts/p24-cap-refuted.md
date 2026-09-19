# P24 §C — the cap is refuted, and both instruments that "confirmed" it were wrong

Data: baseline `34915402976` (pre-`4955d8e`), regression `35004814319` (`4955d8e`),
treatment `35019792901` (`0b0069a`, full 500-question run). 30 ABS questions each.

Instrument: `node analysis/scripts/p24_cap_verdict.mjs <after> <baseline> <regression>`

---

## 1. All four pre-registered predictions resolved

| # | prediction | target | measured | verdict |
|---|---|---|---|---|
| P1 | ABS recovers | ≥ 26/30 | **24/30** | **FAIL** |
| P2 | mean admitted turns | ≤ 30 | see §2 — quantity not measurable | **void** |
| P3 | 45–60 band depopulated | 0 questions | see §2 — band never populated | **void** |
| P4 | IE/MR/KU/TR unchanged | no movement | 0 gained / 0 lost, all p = 1.0000 | pass |

P2 and P3 are marked **void, not failed**, because §2 shows the quantity they were
stated over cannot be measured from a prompt, and the band they named was never
reachable. A prediction whose "pass" a broken instrument had already guaranteed is
not a prediction; both are withdrawn rather than scored.

The pre-registered falsification for P1 fired verbatim:

> **ABS unchanged at 24/30** → the turn-count mechanism in P23 §3a is wrong. The
> abstention decision would then be driven by something the cap does not touch,
> and the mechanism must be re-derived from the new run rather than patched again.

---

## 2. Two instruments produced confident wrong numbers

Both were written to measure "admitted turns". Both returned the **session count**.

The prompt format is the cause, and it is detectable only by looking:

```
[2023/05/22 (Mon) 22:27] user: what should I eat for dinner
I was thinking maybe something light.
[2023/05/22 (Mon) 22:27] assistant: ...
```

A turn's continuation lines are indented but otherwise **identical to a fresh
header**. On a real ABS prompt the header pattern matches **45** lines but only
**4 distinct timestamps** — every turn within a session shares one. So:

| counter | version | what it returned | why it is wrong |
|---|---|---|---|
| per-line | v1 | 45 for a 48-turn prompt | continuation lines look like headers |
| state machine | v2 | 45, agreeing with P23 §3a | same reason; agreement was not evidence |
| distinct timestamps | v3 | 4 → session count | correct, but not the requested quantity |

**The turn count is not recoverable from the rendered prompt.** P23 §3a's banding
table (2 / 4 / 24 questions across 0–30 / 30–45 / 45–60 turns) was computed from
the harness, not the prompt, and the real maximum is **45**, so the 45–60 band was
never populated by any run. That is why P3's target was unreachable.

The error ran in the flattering direction: a per-line count saturates every padded
prompt at the same ceiling, which manufactures the "all prompts converge to ~45
turns" impression that made a *turn* ceiling look like the lever.

---

## 3. The cap was a no-op, and the replay that said otherwise shared its bug

**Byte-identical output.** Regression and treatment produce identical ABS prompts
for all 30 questions — Δcharacters = 0, Δsessions = 0. Nothing changed.

**The replay was wrong.** Before triggering the run I replayed the dataset and read
30 turns / 26,002 chars, which is the basis on which `c984a0a` was written.
`p23_abs_replay.mjs` calls `retrieveTurns` with only the LLM stubbed — but the cap
lives in `expandContextWindowBounded`, reachable **only** via
`retrieveTurns(..., admissionMode = 'hits')`, a parameter the replay never passed.
It exercised the default `'session'` path and reported session-mode numbers under a
`hits` label.

The guard I added compared turn counts against a baseline and **passed** — because
both sides were session mode. A guard that shares the bug it is meant to catch
cannot catch it. This is the third instrument in this investigation to fail the
same way: written under a hypothesis, validated against that hypothesis, never
validated against the thing being changed.

**Construction independently confirms it.** `answerAbstention` passes `'hits'` as
the 7th argument (line 619) and the branch reads
`(this.options.admissionMode ?? admissionMode) === 'hits'` (line 799). The wiring
is correct; the constant is 30; the branch would fire. The only way to get
byte-identical output is for the result to be identical, and it is.

---

## 4. What the data does say

Sorted by prompt size, the mechanism is one variable:

| run | ≤ 32k chars | accuracy | > 32k chars | accuracy |
|---|---|---|---|---|
| baseline (pre-`4955d8e`) | 21 | 85.7% | 9 | 88.9% |
| regression (`4955d8e`) | 7 | **100.0%** | 23 | **73.9%** |
| treatment (`0b0069a`) | 7 | **100.0%** | 23 | **73.9%** |

In the **baseline** there is no separation at any threshold from 28k to 42k — the
within-group accuracy is flat at 85–89% while the oversize group shrinks from 17
to 0 questions. The oversize effect is **created by `4955d8e`**, which grew every
ABS prompt (mean 28,992 → 37,224 chars, max 38,263 → 49,585).

Pooled across all three runs (90 ABS observations), the oversize cell is where
every failure sits:

| group | n | correct | abstained correctly |
|---|---|---|---|
| > 32k chars | 55 | **42** | 42 |
| ≤ 32k chars | 35 | 32 | 32 |

and restricted to the run that is actually broken, the split is stark:

| run | ≤ 32k correct | > 32k correct | Fisher exact |
|---|---|---|---|
| regression (`4955d8e`) | **7/7** | **0/23** | p = 4.9e-7 |
| baseline (pre-`4955d8e`) | 18/21 | 9/9 | p = 0.535 |

The contrast between those two rows is the whole finding: **the same cut that
splits the broken run perfectly does nothing on the healthy one**, because the
healthy run has no oversize failures left to find. The knee was chosen post hoc on
the population it is then scored on, which is exactly the error §2 and §3 are
about — read the table as a mechanism with a name, not as a tuned parameter.

---

## 5. Corrected plan

The cap is dead; the *idea* behind it was right and the *axis* was wrong.

1. **Bound the abstention prompt by characters.** The knee is ~32k against
   `DEFAULT_MAX_TURN_CHARS = 2000` and a 45-unit budget that permits ~90k. One
   call site.
2. **Do not tune the cut on these 30 questions.** The knee was found post hoc on
   the population it is then scored on, which is the exact error §2 and §3 are
   about. Return the cut only after it holds on a run it was not fitted to — or
   derive it from the model's documented context limit rather than from data.
3. **Delete `admissionMode: 'hits'`, `abstentionAdmissionBudget`,
   `DEFAULT_ABSTENTION_ADMISSION_BUDGET`, and `expandContextWindowBounded` along
   with their tests** if the character bound lands. They are dead code carrying a
   comment that asserts a mechanism this section refutes, which is worse than no
   code. No `@deprecated` shim.
4. Then re-run and re-adjudicate ABS as a per-capability cell at n = 30.

---

## 6. Standing rule this section adds

> Every instrument that produces a number used in a verdict must be checked
> against at least one run whose answer is already known, **and the check must be
> able to fail.**

§2 is what that looks like when it fails. §3 is what it looks like when the check
is silently disabled. The three-wrong-instruments record is the cost of not
having had it.

---

## Reproduce

```
node analysis/scripts/p24_cap_verdict.mjs \
  analysis/ab_admission/run_35004814319_fix \
  analysis/ab_retry/run_34915402976 \
  analysis/ab_admission/run_35004814319_run
```

---

## 7. Disposition of the shipped artifacts

`c984a0a` + `0b0069a` are on `master` and their ABS effect is **zero**, so they are
not harmful — but they are not right either. They must not be left as-is, because
the doc comment on `natural-language-memory.ts:105-118` asserts the turn-count
mechanism this section refutes, and a confident wrong comment is worse than no
comment.

| artifact | disposition | gate |
|---|---|---|
| `expandContextWindowBounded` (`retrieval.ts:296`) | **keep, retarget** — a bounded expansion is what a character cap needs; swap the unit from turns to characters | the character bound landing |
| `admissionMode: 'hits'` + its doc block | **delete** — the mode is the wrong axis | the character bound landing |
| `abstentionAdmissionBudget`, `DEFAULT_ABSTENTION_ADMISSION_BUDGET` | **delete** | the character bound landing |
| the 10 `expandContextWindowBounded` tests | **keep, retarget** to the character unit | the character bound landing |
| the 5 `answerAbstention admission budget` tests | **delete with the option** | the character bound landing |

Ordering matters: the replacement lands first, then the deletion, in one commit —
so the tree is never left with an unreferenced primitive or a test asserting a
retracted mechanism.
