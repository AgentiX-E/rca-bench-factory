# P-json (CP4 second half: JSON-structured context) Benchmark Analysis Report

- Treatment: `7a349da` — `formatStructuredContext()` renders the retrieval context as a JSON turn array
- Control: `da4fe96` — CP4 first half (Chain-of-Note instruction + `parseQaAnswer` label extraction)
- Dataset: LongMemEval-S full 500 questions (IE 150 / TR 127 / MR 121 / KU 72 / ABS 30)
- Evaluation protocol: 3 runs per arm, **same day** (control 2026-09-03 01:38Z, treatment 03:22Z, 1.7h apart, avoiding DeepSeek cross-day drift)
- Evaluation system: `nl-abstain-feature` (the system with abstention; `nl-naive-baseline` never abstains, so its ABS is always 0% and it is not comparable)

---

## 1. Bottom line first

**P-json works; keep it.** Overall **77.20% → 78.27% (+1.07pp)**, and **even the worst run improved** (min 76.60% → 77.80%). IE improved by **+2.67pp and is statistically significant** (Welch p = 0.033).

**But the experiment exposed a previously hidden P0-level bug: the Chain-of-Note format contract fails completely on 7.5% of questions** — the model emits only the Step 1 narrative, never writes an `Answer:` line, and the answer field is contaminated by the whole block of thinking. P-json pushed this failure rate from 5.2% to 7.5% (+45%). This is currently the problem with the **largest single unlockable gain**, and it should be fixed before any other optimization is discussed.

---

## 2. Primary metrics (3 runs, feature system)

| Metric | Baseline `da4fe96` | P-json `7a349da` | Δ (pp) | Welch t | p value | Verdict |
|---|---|---|---|---|---|---|
| **Overall** | 77.20% (std 0.43) | **78.27%** (std 0.34) | **+1.07** | 2.74 | 0.0549 | marginal (near significant) |
| IE | 86.22% | **88.89%** | **+2.67** | 4.24 | **0.0327** | **significant** |
| KU | 76.39% | 78.70% | +2.31 | 1.25 | 0.2804 | not significant |
| MR | 67.49% | 67.77% | +0.28 | 0.38 | 0.7250 | not significant |
| TR | 71.13% | 70.60% | −0.52 | −0.53 | 0.6401 | not significant (regression not confirmed) |
| ABS | 98.89% | 98.89% | 0.00 | 0.00 | 1.0000 | unchanged |
| abstention | 17.67% | 17.00% | −0.67 | −1.25 | 0.3161 | not significant |

Per-run detail:

| run | Baseline Overall | P-json Overall |
|---|---|---|
| #1 | 77.40% | 78.40% |
| #2 | 76.60% | 77.80% |
| #3 | 77.60% | 78.60% |
| avg | 77.20% | **78.27%** |

Question-level paired McNemar (470 questions have diagnostic data; only the exact-match + numeric tiers of the verdict are reproducible, since the LLM judge cannot be replayed offline): the p-value range across the 9 same-day pairings is **0.337 – 0.690, median 0.473** — at the deterministic-judgment level the two arms do not differ, indicating that the +1.07pp gain falls mainly on questions that require the judge's semantic verdict (the JSON context makes answer wording closer to the semantics of the ground truth).

Comparison with the paper baselines: long-context GPT-4o 60.6%, ChatGPT+GPT-4o 57.7% (both already surpassed), Oracle (GPT-4o full text) 91.8%, current gap 13.5pp.

---

## 3. P0 Bug: breakdown of the Chain-of-Note format contract

### 3.1 Symptom

The comment on `conInstruction()` states that Step 1 should "identify the relevant details in its head rather than to write them out." But **the instruction text itself does not say this**:

```
Step 1 — Read each turn and identify the user's facts, events, values, or preferences relevant to the question.
Step 2 — Answer the question using ONLY those identified facts.
```

The model follows this literally, writes out Step 1 in full and then stops, never proceeding to Step 2. Result:

| Metric | Baseline | P-json | Change |
|---|---|---|---|
| Leaked answers / run (470 questions) | 26 / 25 / 22 (mean 24.3, **5.2%**) | 33 / 36 / 37 (mean 35.3, **7.5%**) | **+45%** |
| Leaks by capability (3 runs combined) | IE 58 + TR 15 = 73 | IE 83 + TR 23 = **106** | +45% |
| Leaked questions that emitted an `Answer:` line | 0 | **0 / 33** | none |
| Answers > 1000 characters (3 runs combined) | 72 (longest 3299) | 86 (**longest 33504**) | +19% |

### 3.2 Evidence samples

Question 1 (TR, direct evidence of a net P-json regression):
- Q: `Which airline did I fly with the most in March and April?` / GT: `United Airlines`
- Baseline answer: `United Airlines.` ✅
- P-json answer: `Step 1 — Relevant turns and dates:\n- 2023/04/27: User mentions a March business trip to Chicago with United Airlines (flights on the 10th and 12th...)…` ❌

Question 2 (runaway generation, `gpt4_9a159967`): for the same question P-json emitted **33,504 characters**, the model trapped in a self-loop of thinking aloud:
```
Given the data, the most flights are with United and American, each 4. So the answer is a tie.  ← repeated 23 times
Given the context, the user flew United in March (4 flights) and American in April (4 flights). So the most is a tie. ← repeated 23 times
TAIL: 'Given the instruction to answer with ONLY the final answer, I'll say "United and American (tie)" but that might be considered not a single answer.\n\nAlternatively'
```

Question 3 (TR): `Did I visit with a friend or not?` / GT: `No, you did not visit with a friend.` → baseline `No.`, P-json emitted the Step 1 narrative.

### 3.3 Why P-json made it worse

The JSON-structured context turns each turn's `date`/`role`/`content` into explicit data fields, which **makes excerpting facts extremely easy** — the model finds a low-cost "sense of success" in Step 1 and is therefore all the more thoroughly absorbed in it, not even entering Step 2. This explains why IE (preference questions, with the most fact points) has the heaviest leakage, TR (the most mechanical date excerpting) is second, and MR / KU (which go through the aggregation / dual-temporal engine, with short and determinate answers) have zero leakage.

### 3.4 Honest limits of the fix's payoff

Of the 33 leaked questions in P-json run1, **only 4 contain the ground truth string verbatim within the narrative**. Therefore:
- Changing only the parser (fishing answers out of the narrative) has limited payoff and **cannot be the primary fix**
- The format contract must be restored from the prompt side, so that the model never writes Step 1 at all

---

## 4. Next iteration plan: P0 — restore the CoN output contract

### Goal

Eliminate CoN narrative leakage, restore answers to phrase form, unlock the IE / TR accuracy buried by it, and eliminate runaway long generation at the same time.

### Concrete changes (3 of them)

1. **`conInstruction()`** (root-cause fix, aligning comment and wording):
   - Constrain Step 1 explicitly: `"Step 1 — Silently read each turn and identify the relevant facts. Do NOT write these notes down."`
   - Append a final output contract: `"Finish your reply with a final line in exactly this form: Answer: <short answer phrase>"`
   - Bound the length of Step 1: `"If you must note anything, use at most 5 bullets of at most 12 words each."`

2. **`parseQaAnswer()`** (defensive fallback, not a substitute for the prompt fix):
   - Prefer the `Answer:` label line (already present, keep it)
   - Add: when there is no label, strip narrative and list lines starting with `**Step` / `#` / `- ` / `* ` and take the first remaining non-empty piece of content
   - Add: length circuit-breaker — when there is no `Answer:` line and the answer exceeds 200 characters, cut at the first end of sentence (blocking the 33,504-character runaway output from reaching scoring)

3. **TR temporal prompt, specifically**: tighten the Step 1 wording to `"silently identify the turns and their dates"`, and keep the existing constraint `"answer with ONLY the final answer (a number, date, or short phrase)"`.

### Acceptance criteria

| # | Acceptance item | Threshold |
|---|---|---|
| 1 | Unit tests | ≥ 8 new cases covering leakage shapes; four-dimension coverage **≥ 95%** (no mocks, real assertions) |
| 2 | Leak rate | Leaked answers among the 470 diagnostic questions **< 1%** (currently 7.5%) |
| 3 | Runaway generation | Answers > 1000 characters **< 10 per 3 runs** (currently 86); longest answer **< 1000 characters** |
| 4 | Overall | **≥ 78.27%** (must not regress against current), 3 runs same-day, Welch **p < 0.05** |
| 5 | IE / TR | IE **≥ 88.89%**, TR **≥ 71.13%** (TR must recover the −0.52pp) |
| 6 | Regression | lint / format / typecheck / full test suite / CI smoke all green before pushing |
| 7 | Triple hit | The threshold is met on 3 consecutive runs; a single hit does not count as success |

### Projected payoff (rough estimate, must be validated empirically)

With 35 leaked questions/run, if 70% are fixed by the contract and 60% of those turn into correct answers → about +15 questions ≈ **+3pp**; on top of that, TR recovers −0.52pp. Target range **Overall 80%–81%**. This is an estimate, not a conclusion.

---

## 5. To do: MR is still the biggest weakness

MR is 67.77%, the only one of the five capability dimensions below 70%. MR goes through the aggregation prompt, with zero leakage and very short answers (mean 4.4 characters), which shows that CoN leakage is not its problem and that the bottleneck is **multi-session aggregation/counting** itself. Recommend scoping a separate root-cause analysis after the P0 fix is validated (retrieval recall vs aggregation counting).
