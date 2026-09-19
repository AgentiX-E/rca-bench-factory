# P25 clause-isolation verdict — the entity-identity sentence is load-bearing

**Status:** adjudicated
**Treatment run:** `35097952715` — `entity_identity_clause=0`, sha `5db414c`, conclusion **success**
**Reference run:** `35019792901` — clause ON (default), sha `0b0069a`, conclusion success
**Pre-registration:** `p25-clause-isolation-prereg.md`
**Supersedes the confound noted in:** `p24-cap-verdict.md` §4

---

## 1. Headline

The confound from `p24` is **resolved**, and the answer is the opposite of what the
P24 attribution suggested.

Turning the entity-identity sentence **off** drops ABS from **29/30 to 26/30**
(96.7% → 86.7%). Overall falls **426/500 → 420/500** (85.20% → 84.00%).

> **The entity-identity sentence is load-bearing. It must stay.**
> The admission cap is *also* load-bearing. Both edits in `0b0069a` were
> necessary; neither is redundant.

The three ABS questions the sentence rescues are recovered **with identical
`top1Score`**, so the effect is purely in the LLM's abstention judgement, not in
retrieval.

---

## 2. Pre-registration scored

| # | prediction | outcome |
|---|---|---|
| **P1** | ABS ≥ 26/30 without the sentence ⇒ the cap alone is sufficient and the sentence should be deleted | **VOID as stated — it fired, but the inference is backwards.** ABS = exactly **26/30**, landing on the threshold. The literal reading ("≥26 ⇒ delete the sentence") would have us delete a component worth 3 questions. See §5. |
| **P2** | The 5 questions the cap recovered regress ⇒ both edits are load-bearing | **FAIL.** None of the 5 cap-recovered questions regressed. The 3 that regressed are a different set entirely. |
| **P3** | Non-ABS capabilities untouched | **PARTIAL.** IE +1, MR ±0, KU −1, TR −3. See §4 for why this is variance, not an effect. |

**P2's failure is informative, not unfortunate.** I assumed the sentence and the
cap act on the same questions. They do not. The cap's 5 recovered questions stay
recovered with the sentence off; the sentence's 3 rescued questions are untouched
by the cap. **The two mechanisms are disjoint.**

---

## 3. The ABS cohort, paired

| | OFF-ok | OFF-fail |
|---|---|---|
| **ON-ok** | 26 | **3** |
| **ON-fail** | 0 | 1 |

- Discordant pairs: **b = 3, c = 0** — strictly one-directional.
- McNemar exact two-sided **p = 0.2500**.

`p = 0.25` at n=3 discordant is **not significant**, and I will not dress it up.
What the table *does* establish is **direction**: 3 regressions, 0 gains. A
component whose removal can only lose questions is worth keeping on that evidence
alone, even before significance.

### 3.1 The three rescued questions, in detail

| id | question | top1 ON | top1 OFF | ON | OFF |
|---|---|---|---|---|---|
| `031748ae_abs` | How many engineers do I lead when I just started my new role as Software Engineer Manager? | 0.706 | **0.706** | `"UNANSWERABLE"` | `"4"` |
| `0ddfec37_abs` | How many autographed football have I added to my collection in the first three months of collection? | 0.586 | **0.586** | `"UNANSWERABLE"` | `"15"` |
| `f685340e_abs` | How often do I play table tennis with my friends at the local park? | 0.776 | 0.738 | `"UNANSWERABLE"` | `"Every other week"` |

For the first two, **every retrieval quantity is identical** — same `top1Score`
to three decimals. The only difference is the model's verdict. That is as clean
an isolation as this benchmark can produce: the sentence, and nothing else,
flipped those answers.

`f685340e_abs` additionally shifted its expansion and `top1Score`
(0.776→0.738), so its two runs differ in retrieval too; its attribution is
therefore weaker than the other two. Recorded rather than smoothed over.

---

## 4. Why TR's −3 is variance, not an effect

The pre-registration predicted non-ABS capabilities would move by at most ±1.
TR moved by **−3** (4 regressed, 1 gained). Rather than wave this through as
"within tolerance", I checked each regression:

| id | top1 ON | top1 OFF | abstained ON→OFF | question |
|---|---|---|---|---|
| `gpt4_a1b77f9c` | 1.000 | **1.000** | false→false | weeks spent reading Nightingale and listening to Sapiens and The Power |
| `gpt4_4fc4f797` | 2.000 | **2.000** | false→false | days between suspension feedback and testing the setup |
| `c9f37c46` | 4.000 | **4.000** | false→false | how long watching stand-up before the open mic night |
| `d01c6aa8` | 2.000 | **2.000** | false→false | how old when I moved to the United States |

**All four have byte-identical `top1Score` and unchanged abstention status.** The
prompt did not change their reasoning path; the model produced a different
answer to the same question over the same evidence. This is generation-side
non-determinism — `temperature=0` reduces but does not eliminate it across
independent runs.

KU shows the same signature (3 regressed, 2 gained — net −1), and IE the mirror
(0 regressed, 1 gained).

**Conclusion:** the entity-identity sentence has **no measurable effect outside
ABS**, and TR's −3 is run-to-run variance that happens to have landed
unfavourably. It is not attributable to the sentence.

---

## 5. What P1 got wrong, and the lesson

P1 asserted: *"if ABS ≥ 26/30 without the sentence, the cap alone is sufficient
and the sentence should be deleted."*

ABS came out at **exactly 26/30**. Under the literal rule, the sentence would be
deleted — and the corpus would silently lose 3 questions, with the *reason*
being invisible: the ablation report shows only a number.

The flaw is that P1 defined a threshold on an **absolute** figure while the
question is **relational**. "Is the sentence sufficient alone?" and "does the
sentence contribute anything?" are different questions. Only the second one is
answerable by turning it off:

> **A component's contribution is measured by the paired difference its removal
> produces, not by whether the remaining system clears some absolute bar.**

The paired table in §3 answers the real question with 3/0. P1's threshold would
have answered the wrong one. I am keeping the sentence.

---

## 6. What is now established, and what is not

**Established:**

| claim | evidence |
|---|---|
| The entity-identity sentence is load-bearing for ABS | 3 regressed / 0 gained on removal; 2 of 3 with byte-identical retrieval |
| The admission cap is load-bearing for ABS | `p24-cap-verdict.md` §3 bound/no-op split (5 changed, all oversize) |
| The two mechanisms act on **disjoint** question sets | P2's failure: cap-recovered 5 unaffected by the sentence |
| The sentence does not affect non-ABS capabilities | §4: identical top1Score on all regressions |
| Both edits in `0b0069a` were necessary | neither is redundant under ablation |

**Not established:**

- Statistical significance of the sentence's contribution (p=0.25, n=3). It is
  directional evidence, not a result.
- Whether `6456829e_abs` is fixable by either mechanism — it fails with the
  sentence **both on and off**, so it is orthogonal to this whole axis. See
  `p27-residual-abs-failure.md`.
- The absolute ABS ceiling. 29/30 is the current best; 1 question remains.

## 7. Disposition

1. **Keep the entity-identity sentence on by default.** `ENTITY_IDENTITY_CLAUSE`
   should never be dispatched as `0` again — the default is correct.
2. **Keep the admission cap.** Confirmed in `p24-cap-verdict.md` §6 item 3.
3. **`p24-cap-verdict.md` §4's "unresolved confound" is now closed** — both
   components are load-bearing, and the question "which one did it?" was the
   wrong question to ask.
4. **`6456829e_abs` proceeds independently** under the `p27-r4-prereg.md`
   programme; it is unaffected by this verdict in either direction.
5. **The flag stays in the codebase.** It is now a *validated* ablation lever with
   a known non-zero effect — the first such lever measured in this programme.

## 8. The methodological debt, paid

`p24-cap-verdict.md` §4 recorded that `0b0069a` shipped two edits in one commit
and that the resulting claim could not be isolated. This run paid that debt:
one commit (`fe8a644`) added the switch, one run (`35097952715`) measured it, and
the answer changed the recommended disposition.

The cost of the original bundling was one extra benchmark cycle. The cost of
*not* doing this run would have been deleting a load-bearing component on the
strength of a threshold that answered the wrong question.
