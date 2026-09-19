# KU No-Qualifier Abstention Fix — A/B Verdict

**Date:** 2026-09-05
**Fix under test:** `eb1bc3c` — `fix(eval): give knowledge-update questions with no time qualifier a selection rule`
**Treatment commit:** `4640c86` (master) — includes `eb1bc3c` **and** `4640c86` (`fix(llm): bound every fetch attempt with its own abort deadline`)
**Control commit:** `d793db4` — the immediately preceding master

---

## 1. Design

| Property | Value |
| --- | --- |
| Protocol | same-instant interleaved 4v4 A/B |
| Arms | 4 control runs (`ku-no-qualifier-control` = `d793db4`), 4 treatment runs (`master` = `4640c86`) |
| Dataset | LongMemEval-S, `questionCount = 500` on all 8 artifacts |
| Run status | all 8 `completed` / `success` |
| Primary endpoint | KU `other`-qualifier abstention rate (mechanism endpoint) |
| Co-primary endpoint | KU accuracy (descriptive; accuracy is noise-floored) |
| Binding test | exact permutation test on per-run rates (4v4 ⇒ C(8,4)=70 relabellings) |

The pooled two-proportion z-test is reported for orientation only. Four runs × 72
questions are **not** 288 independent observations (the same 72 questions appear
in every run), so a pooled test is pseudoreplication. The exact per-run
enumeration is the evidence that matters.

---

## 2. Primary endpoint — KU `other`-qualifier abstention rate

```
              control        treatment       delta        95% CI          z        p
KU:other      27/188 14.36%  8/188  4.26%    -10.11pp     [-17.92,-1.89]  -3.37   0.0007
```

Per-run rates (out of 47 `other` questions):

```
control     8/47 (17.02%)  7/47 (14.89%)  6/47 (12.77%)  6/47 (12.77%)   mean 14.36%
treatment   2/47 ( 4.26%)  2/47 ( 4.26%)  2/47 ( 4.26%)  2/47 ( 4.26%)   mean  4.26%
```

**Complete separation** — `min(control) = 12.77% > max(treatment) = 4.26%`.
Exact permutation test: **1/70 = 0.0143 one-sided** (0.0286 two-sided). Complete
separation is by construction the single most extreme relabelling, so no
distributional assumption is needed.

## 3. Co-primary endpoint — KU accuracy

```
control    217/288 = 75.35%   (abstained 31)
treatment  229/288 = 79.51%   (abstained 12)
delta      +4.17pp
```

Per-run KU correct (out of 72):

```
control    [52, 55, 56, 54]   mean 54.25
treatment  [57, 57, 58, 57]   mean 57.25
```

**Complete separation** — `min(treatment) = 57 > max(control) = 56`. Exact
permutation test: **1/70 = 0.0143 one-sided**. (The pooled z = 1.20, p = 0.2311
is discarded as pseudoreplication.)

## 4. Recovery efficiency

```
abstentions removed : 31 -> 12  = -19 over 4 runs = 4.75/run
correct answers gained : 217 -> 229 = +12 over 4 runs = 3.00/run
efficiency           : 12/19 = 63.2% of recovered abstentions became CORRECT
```

The remaining 7 (1.75/run, 36.8%) became wrong answers. An abstention on a
non-ABS question already scores 0, so those conversions cost nothing — only the
63.2% correct conversions create value.

## 5. Attribution

The fix is supposed to act **only** on KU questions whose time qualifier is
`other`. The change must be fully explained by that stratum alone:

```
KU abstentions removed, all strata = 19
  other      27/188 ->  8/188    removed +19
  previous    4/40  ->  4/40     removed  +0
  current     0/60  ->  0/60     removed  +0
residual after subtracting every stratum = 0
```

Cross-check against the report aggregates (independent of the per-question
diagnostics dump): control 31/31, treatment 12/12 — the two data sources agree
exactly. Residual **0** means the change does not leak into `previous` or
`current`, which take the bitemporal path.

## 6. Guards (must be unchanged)

| Capability | control | treatment | verdict |
| --- | --- | --- | --- |
| IE abstention | 16/600 = 2.67% | 16/600 = 2.67% | unchanged |
| MR abstention | 51/484 = 10.54% | 49/484 = 10.12% | −0.41pp, z = −0.21, n.s. |
| TR abstention | 36/508 = 7.09% | 37/508 = 7.28% | +0.20pp, z = +0.12, n.s. |
| ABS score | 120/120 = 100% | 119/120 = 99.17% | 1 run scored 29/30 |

The ABS anomaly is out of reach of the change: `buildKnowledgeUpdatePrompt` is
only reachable when `questionType === 'knowledge-update'`, which ABS is not.
ABS also has no per-question diagnostics dump, so the single offending question
is unidentifiable from artifacts — this is an observability gap (see §9).

## 7. Per-question movement on KU `other`

```
qid         ctrl abstain/4   treat abstain/4   change
830ce83f          4                0            -4
cc5ded98          4                0            -4
db467c8c          4                0            -4
e61a7584          3                0            -3
2698e78f          2                0            -2
5c40ec5b          2                0            -2
41698283          1                0            -1
7401057b          3                4            +1      <- moved the wrong way
```

Seven questions moved away from abstention; one (`7401057b`, gold `"Two"`,
top1Score 0.911) abstained **more** often (3/4 → 4/4). Its top1Score is
identical across all 8 runs (retrieval unchanged), so this is LLM sampling
variance on a 1-of-4 shift, and it costs nothing — the control "answer" was
`"2"` against gold `"Two"`, which was already scoring 0.

## 8. Overall accuracy (descriptive, pre-registered as noise-floored)

```
control    1644/2000 = 82.20%  [80.46, 83.81]
treatment  1655/2000 = 82.75%  [81.03, 84.34]
delta      +0.55pp
```

Within-arm spread (control 6 questions/run, treatment 7) exceeds the delta
(+2.75 questions/run), so overall accuracy cannot resolve this change — exactly
as pre-registered. The mechanism endpoint (§2) is the decisive evidence.

## 9. Confound — the treatment arm also carries `4640c86`

The treatment arm differs from control by **two** commits, not one. `4640c86`
adds a 60 s per-attempt `AbortSignal.timeout` to `retryableFetch`. It is
declared here, not hidden. Three independent arguments bound its effect to zero:

1. **Direction.** A transport deadline can only turn a slow request into a
   failure. It cannot reduce abstentions or create correct answers. The
   treatment arm shows abstentions *decreasing* (KU 31 → 12) and correctness
   *increasing* (217 → 229), the opposite of what a failure-injection mechanism
   produces.
2. **Capability specificity.** `retryableFetch` is the shared transport for all
   five capabilities and both the embedding and LLM paths. The observed movement
   is confined to KU `other` with residual 0 everywhere else. A transport change
   is capability-agnostic and cannot produce that pattern.
3. **Run success.** All 8 runs completed successfully with `questionCount = 500`;
   the deadline's only observable effect (aborting a hanging request) would have
   manifested as a failed run or a *higher* abstention rate, neither of which
   occurred.

Independent verification: `verify_retry_timeout_e2e.mjs` confirms the deadline
fires only on a genuinely stalled socket (302 ms at a 300 ms deadline, default
60 000 ms), and the 41-test `retry.test.ts` suite is green.

## 10. Metric self-correction (honesty note)

While quantifying the next target I found **two** false-positive modes in my own
"gold verbatim in context" abstention-quality metric:

1. **Bare numerals** — a gold like `"4"` matches any digit `4` anywhere.
2. **Spelled numbers** — `"Two"` is an ordinary English word.

After controlling both (treating bare numerals, spelled numbers, numeric-with-unit
answers, times and dates as "suspect, not trusted"), the true remaining defect is
small and heterogeneous, not the large systematic KU prize that was just captured.

---

## 11. Verdict

**ACCEPT.** The fix reduces the KU `other`-qualifier abstention rate by
**−10.11pp** with complete separation (exact permutation p = 0.0143) and raises
KU accuracy by **+4.17pp** (exact permutation p = 0.0143), recovering 63.2% of
the removed abstentions as correct answers. Attribution residual is **0**; all
guards (IE/MR/TR) are statistically unchanged. The declared confound (`4640c86`)
is bounded to zero by direction, capability specificity, and run success.
