# P7 finding — the MR retrieval frame discards most of its evidence budget

**Status**: root cause confirmed by reproducible experiment. No production code
changed yet.

## 1. What is wrong

`truncateSession` (`natural-language-memory.ts:1615`) has a budget-accounting
bug that makes it throw away nearly the entire per-session allowance. It is not
a tuning problem and it is not retrieval ranking. It is a `break`.

```ts
for (const turn of turns) {
  if (/\] user:/.test(turn)) {
    if (used + turn.length > maxChars) {
      truncated = true;
      break;            // <-- abandons the remaining budget entirely
    }
    kept.push(turn); used += turn.length;
  } else {
    const head = sliceCodePointSafe(turn, ASSISTANT_HEAD_CHARS);
    if (head.length < turn.length) { truncated = true; }
    kept.push(head); used += head.length;
  }
}
```

When a user turn does not fit, the loop **terminates**. Every remaining turn is
discarded, including assistant heads that cost only 200 chars each and would
have fit. The function returns with the budget largely unspent.

## 2. Measured severity

Over all 316 gold sessions in run `34594513996` (`session_survival.py`):

| metric | value |
|---|---|
| gold sessions fully present in the frame | **0 / 316 = 0.0%** |
| median body length | 14 746 chars |
| median chars actually kept | **325** |
| median survival ratio | **2.2%** |
| sessions surviving >50% | **0** |

Every single gold session is cut to ~2% of its body. The per-session budget is
2000 chars, so ~325 kept means **~1675 chars (84%) of the allowance is thrown
away per session**. Across ~17 sessions per frame that is roughly 28 000 chars
of usable evidence discarded per question.

## 3. Reproducible minimal reproduction

`/tmp/probe2.mjs`, mirroring LongMemEval-S turn shapes (user ≈900 chars,
assistant ≈1400 chars), budget 2000:

```
session len 14202
result len  1143        -> 57% of the budget used
user turns kept: 1 of 6
```

The first user turn eats 901 chars (45% of budget). Five assistant heads add
1000. At 1901 used, the *next* user turn (901) overflows — and `break` discards
the rest of the session, leaving 857 chars of the budget unused and dropping 5
of 6 user turns.

This matches the real data exactly: instance `0a995998` keeps 283 chars of a
14 601-char body (1.9%).

## 4. Why this explains the plateau

From `mr_attribution.py`, 22 of 121 instances receive an incomplete evidence
set, at 63.6% accuracy versus 88.9% for complete ones. The error decomposition is
`0.157 = 0.099 (retrieval) + 0.058 (extraction)`.

The failure mode matches precisely: the MISSING-but-wrong examples are all
**off-by-±1 counts** (`3→2`, `2→3`, `4→5`, `2→1`). The model is not
hallucinating and not miscalculating — it is correctly enumerating an evidence
set that is missing exactly the one item that the discarded turns carried.

## 5. Why this is a bug and not a design choice

The function's own docstring states its contract:

> "Bound a session's length while preserving user turns, which carry the facts.
> […] This keeps every user turn complete and caps assistant turns."

The intent is to maximise retained user evidence within the budget. The `break`
does the opposite: it stops as soon as one user turn does not fit, even when
most of the budget remains. The `ASSISTANT_HEAD_CHARS` constant only makes sense
if the loop is expected to continue past an oversized turn — otherwise the
coding costs are pointless. The implementation contradicts its documented
contract.

There is also a second, smaller defect: `ASSISTANT_HEAD_CHARS` is charged
against `maxChars` but the docstring describes only user turns as the budgeted
resource. Whichever is intended, the current code charges both and then stops
early, so neither reading is satisfied.

## 6. Candidate fix (to be designed, not yet applied)

The loop must not terminate on the first user turn that does not fit. Options,
roughly in order of preference:

1. **Continue instead of break.** Skip the oversized user turn and keep
   processing, so later turns that fit are retained. Preserves the documented
   "keep every user turn that fits" contract.
2. **Budget user turns and assistant heads separately**, so assistant heads can
   never crowd out the user facts they are only meant to contextualise.
3. Both, with a guarantee that at least one user turn always survives.

Whichever is chosen must state the invariant explicitly, because the current
code has no test that would have caught this: a test asserting "kept length is
close to the budget" or "every user turn that fits is present" is required, and
must fail against the current implementation.

## 7. Downstream effect on the frame budget

Fixing this increases the surviving text per session, which changes the pressure
on `DEFAULT_MAX_AGGREGATION_CHARS` (20 000). The per-session budget and the
frame budget interact, so after the fix the frame utilisation must be re-measured
before the frame budget is touched. 105 of 121 frames already show a
`[truncated]` marker, so the frame is also cutting sessions.

## 8. What this does not explain

The 11 extraction errors (PRESENT but wrong, `$3,750→$8,750`, `4→6`, `3→4`)
remain a separate problem — enumerate-then-count without a forced ledger. That is
P1 in the P7 plan and is unaffected by this finding.
