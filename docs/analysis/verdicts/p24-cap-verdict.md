# P24 verdict — the cap works, and it is the cap

Run `35019792901` on `0b0069a`, full 500-question LongMemEval-S, `deepseek-chat`,
temperature 0, thinking disabled, `ablation_runs=1`.

| run | commit | ABS | overall |
|---|---|---|---|
| baseline `34915402976` | pre-`4955d8e` | 26/30 = 86.7% | 419/500 = 83.80% |
| regression `35004814319` | `4955d8e` | 24/30 = 80.0% | 423/500 = 84.60% |
| treatment `35019792901` | `0b0069a` | **29/30 = 96.7%** | **426/500 = 85.20%** |

---

## 1. I was wrong, and §P24a of `p24-cap-refuted.md` was wrong with me

`p24-cap-refuted.md` claimed the cap was inert, on the grounds that regression and
treatment produce "byte-identical" ABS prompts. **That claim is retracted.** It was
made before this run's artifacts existed, on a comparison of `35004814319` against
itself, which cannot falsify anything.

The comparison that matters says the opposite — every one of the 30 ABS prompts
changed:

| | regression `4955d8e` | treatment `0b0069a` | |
|---|---|---|---|
| mean chars | 37,224 | **25,410** | −11,814 |
| max chars | 49,585 | **31,129** | −18,456 |
| prompts > 32k | **23/30** | **0/30** | emptied |
| prompts where the cap bound | — | 29/30 | |

And the verdict moved exactly where the cap bound, nowhere else:

| | n |
|---|---|
| cap bound **and** verdict changed | **5** |
| cap bound, verdict unchanged | 24 |
| **cap no-op** and verdict changed | **0** |
| cap no-op, verdict unchanged | 1 |

The zero in the third row is the part that matters. All five flips sit in the bound
row and none in the no-op row, so the effect is attributable to the cap rather than
to any other difference between the two commits.

The five recovered questions are precisely the ones that were oversize:

| question | chars before | chars after | verdict |
|---|---|---|---|
| `0ddfec37_abs` | 44,451 | 27,747 | abstain → correct abstain |
| `e5ba910e_abs` | 45,276 | 26,852 | abstain → correct abstain |
| `gpt4_fe651585_abs` | 42,560 | 27,554 | abstain → correct abstain |
| `a96c20ee_abs` | 42,411 | 25,987 | abstain → correct abstain |
| `2698e78f_abs` | 40,783 | 27,585 | abstain → correct abstain |

All five were *answering a near-miss* before and *abstaining correctly* after, with
0 losses. The one surviving ABS failure, `6456829e_abs`, is at 24,094 chars — inside
the safe region — which is consistent with it being a different defect.

## 2. The pre-registration, scored

| # | prediction | target | measured | verdict |
|---|---|---|---|---|
| P1 | ABS recovers | ≥ 26/30 | **29/30** | **PASS** |
| P2 | mean admitted turns ≤ 30 | — | quantity not measurable; size fell to 25,410 chars, which is the claim P2 was proxying for | **met in substance** |
| P3 | 45–60 band depopulated | 0 | band never existed; the > 32k population is now 0/30 | **met on the corrected axis** |
| P4 | IE/MR/KU/TR do not regress | noise | IE −1, MR −2, KU −1, TR +2, all McNemar p ≥ 0.63 | **pass** |

P1's pre-registered falsification ("ABS unchanged at 24/30") did **not** fire, so
the mechanism account survives — but via the character axis below, not the turn
count that was originally written down.

## 3. The mechanism is prompt size, now with a natural experiment

The previous section could only show an association at a post-hoc knee. This run
supplies the intervention: `0b0069a` moved 29 of 30 prompts *down* across that knee
without touching retrieval, and **five questions flipped to correct with zero
losses**.

| | ≤ 32k | accuracy | > 32k | accuracy |
|---|---|---|---|---|
| baseline | 21 | 85.7% | 9 | 88.9% |
| regression | 7 | 100.0% | 23 | **73.9%** |
| treatment | **30** | **96.7%** | **0** | — |

The baseline row remains the control: no separation at any cut from 28k to 42k,
because it never produced an oversize prompt. Regression creates the oversize
population; treatment removes it; accuracy tracks it. That is the cleanest causal
statement available on this data, and it supersedes the earlier post-hoc caveat.

**Nine prompts came out byte-identical to the baseline** and 8 of those 9 are
correct — so the capped prompt reproduces the healthy pre-`4955d8e` behaviour where
it does not need to truncate, which is the expected signature of a cap that binds
only where it should.

## 4. Two candidate edits, one verdict — and which is which is unresolved

> **STATUS: RESOLVED.** See `p25-clause-isolation-verdict.md`. The isolation run
> `35097952715` (clause off) drops ABS to **26/30** with **3 regressed / 0
> gained**. **Both** edits are load-bearing, and — this is the part the P24
> attribution got wrong — they act on **disjoint** question sets. The five
> questions the cap recovered are untouched by the sentence, and the three the
> sentence rescues are untouched by the cap. The section below is retained as
> written, to record what was known at the time.

`0b0069a` contains **two** behaviour changes, and I labelled only one of them:

1. the admission cap (documented, under test);
2. an added entity-identity sentence in `buildConservativeQaPrompt`, whose own code
   comment says it "was the hypothesis under test and an A/B can only attribute one
   edit at a time" — while the commit changed both.

That comment is now false and must be corrected. On attribution:

- **The cap is the demonstrated cause.** 5 bound-and-changed against 0 no-op-and-changed,
  across a 11.8k-character intervention, zero losses.
- **The wording is not excluded.** The two edits are perfectly confounded: the
  wording is in the prompt for all 30 questions, so nothing here separates them.
  Isolating it needs a run without the sentence at the same budget — which is one
  cheap run, and worth doing rather than assuming.

Reporting the cap as the cause and the wording as an untested co-change is the
honest statement. Reporting both as validated is not.

## 5. Significance, stated honestly

| contrast | result |
|---|---|
| ABS regression → treatment | 5 gained / 0 lost, McNemar **p = 0.0625** two-sided, **0.0313** one-sided |
| overall regression → treatment | 426 vs 423, 12 gained / 9 lost, McNemar p = 0.6636 — **not** significant |
| other capabilities | IE/MR/KU −1/−2/−1, TR +2, all p ≥ 0.63 |

The ABS cell is the only one that moved, and it is the only cell the change was
scoped to. But **p = 0.0625 at n = 30 is marginal and must not be reported as
significant.** Five flips with no losses is a strong directional signal; it is not
a result at this sample size. The overall figure is unchanged within noise, exactly
as pre-registered ("30 questions cannot move the 500 total by more than a few
tenths of a point").

## 6. What to do next, in priority order

1. **Correct the false comment** in `natural-language-memory.ts` that claims a
   one-edit A/B. It is a documentation defect I introduced and it is the kind that
   caused this whole episode.
2. **Isolate the two edits.** One run: entity-identity sentence removed, cap
   retained. If ABS stays ≥ 26/30 the cap alone is sufficient and the sentence
   should be deleted; if it falls back, both are load-bearing and both stay. Either
   outcome is worth one run.
3. **Leave the cap constant alone.** It is at 30 turns, binds on 29/30, and lands
   the prompts in 17k–31k — inside the band where abstention was already 100%. Do
   not tune it on these 30 questions.
4. **Do not sweep the character knee.** §3's table cannot separate "the cut matters"
   from "smaller is better" against the baseline arm, which is flat. A character
   budget is a fine idea but it is not established by this run.
5. **`6456829e_abs`** — the one still-wrong question inside the safe region. Single
   instance; characterise, do not fix.
6. **Do not push the turn-count→character narrative into the code comments.**
   `c852e70` and `e52ea25` added retractions that are now themselves out of date
   (they say the cap is inert). Correct them in the same pass as item 1.

## 7. The pattern worth naming

Three claims went wrong in this episode in the same way, and all three were mine:

| claim | how it was reached | what caught it |
|---|---|---|
| turn counts (×2 instruments) | measured a session timestamp and called it a turn; the second instrument agreed with the first, which read as confirmation | a third counter that reported distinct values |
| "the cap is inert" | compared `35004814319` to itself and called the output byte-identical | the run that was actually under test |
| "the retry is inert" (P21/P23) | measured on the MR subset only and generalised to the mechanism | widening the scope to the single-session path |

Each was internally consistent, each was validated against the hypothesis rather
than the object, and each survived review until an independent measurement
contradicted it.

> **Rule: a claim of the form "X has no effect" must name the run that could have
> shown an effect and did not.** Byte-identity asserted from a comparison that
> cannot differ is not evidence.

§1 of this document is that rule applied to itself.

## Reproduce

```
node analysis/scripts/p24_cap_verdict.mjs \
  analysis/ab_admission/run_35019792901_run \
  analysis/ab_retry/run_34915402976 \
  analysis/ab_admission/run_35004814319_run
node analysis/scripts/p23_significance.mjs \
  analysis/ab_admission/run_35019792901_run \
  analysis/ab_admission/run_35004814319_run
```
