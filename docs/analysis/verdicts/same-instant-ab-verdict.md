# Same-instant A/B conclusion: the P0 fix is incomplete, and it introduced one regression

**Bottom line first**

1. **P0 (`8d87341` CoN output contract) cannot be ruled a "pass."** It did eliminate the target defect (narrative leakage 6.81% → **0.00%**, per-question exact McNemar **p = 2.9e-11**), but at the same time it **pushed the abstention rate on LongMemEval-S's 29 `single-session-preference` questions from 3.45% to 21.84% (+18.39pp)**. One gain and one loss roughly cancel out: IE net −1.11pp, Overall net +0.73pp, and **neither is significant at the run level**.
2. **My previous report's conclusion of "variance convergence F=112.0, p=0.0177" must be retracted.** That was a normal-theory F-test being overconfident at df=(2,2). Switched to an exact permutation test (C(6,3)=20 assignments): **mean p=0.50, worst run p=0.40, range p=0.10, abstention mean p=0.10** — **not a single item is significant** at the run level.
3. **The root cause has been located, and it is a fixable BUG that I introduced myself**: `buildPreferencePrompt` issues three mutually contradictory instructions at once. The fix plan is P0-b below.
4. The larger-area lever is still **MR deterministic aggregation** (upper bound MR +13.6pp / Overall +2.3pp), scheduled after this iteration.

---

## 1. Run level: the same-instant A/B proves nothing

The 6 runs were dispatched simultaneously **within 14 seconds** (control `7a349da`, treatment `8d87341`), all `success`.

| Metric | Control `7a349da` | Treatment `8d87341` | Δ | Welch p |
|---|---|---|---|---|
| Overall | 77.53% | 78.27% | **+0.73pp** | 0.408 |
| Abstention rate | 17.67% | 15.13% | −2.53pp | 0.052 |
| IE | 90.89% | 89.78% | −1.11pp | 0.382 |
| MR | 63.91% | 66.94% | +3.03pp | 0.306 |
| KU | 75.46% | 77.31% | +1.85pp | 0.345 |
| TR | 70.60% | 71.13% | +0.52pp | 0.640 |
| ABS | 100.00% | 98.89% | −1.11pp | 0.423 |

### Exact permutation test (distribution-free, C(6,3) = 20 assignments)

| Statistic | Observed value | Permutation p |
|---|---|---|
| Overall mean difference | +0.733pp | **0.500** |
| Overall worst run | +2.000pp | 0.400 |
| Overall range (treatment − control) | −2.200pp | 0.100 |
| Abstention mean difference | −2.533pp | 0.100 |
| Abstention range | −1.800pp | 0.400 |

**At n=3 the F-test's p=0.0177 is not credible**; the exact permutation test's resolution ceiling is 1/20 = 0.05, and no statistic reaches it.

### The real constraint on power (this must go into the design of every subsequent iteration)

| Endpoint | run/arm | Minimum detectable effect (80% power, α=.05) |
|---|---|---|
| Overall (run level, taking the conservative control sd = 1.00pp) | 3 | **±2.3pp** |
| Overall (same as above) | 6 | ±1.6pp |
| IE (per-question paired, n=74 deterministically decidable) | 3 | ±4.52pp |
| MR (per-question paired, n=105) | 3 | ±5.35pp |
| KU (per-question paired, n=43) | 3 | ±3.11pp |
| TR (per-question paired, n=65) | 3 | ±6.13pp |

> **Methodological conclusion**: this repository's CI A/B **cannot detect an Overall improvement below 2pp at the run level**. Therefore the **primary endpoint of subsequent iterations must be a mechanism endpoint** (deterministic, per-question, high power); Overall serves only as a descriptive estimate with a CI and as a non-inferiority guardrail, and is not tested for significance.

---

## 2. Question level: the defect really was eliminated (n = 470 × 3 = 1410/arm)

The artifacts carry each question's `llmRaw`, so the mechanism can be measured at the **question** level rather than the run level.

| Endpoint | Control | Treatment | Test |
|---|---|---|---|
| **Format breakdown** (writes Step 1 and stops, no `Answer:` line) | 6.81% (96/1410) | **0.00% (0/1410)** | exact McNemar **p = 2.9e-11** |
| of which IE | 18.22% | 0.00% | |
| of which TR | 3.67% | 0.00% | |
| of which MR / KU | 0.00% | 0.00% | different prompt, unreachable to begin with |
| **Abstention rate** | 12.41% | 9.79% | exact McNemar **p = 0.0133** |
| Answer length p99 | 2419 characters | **259 characters** | |
| Answer length max | 3340 characters | **427 characters** | |
| Answers >200 characters | 120 | **29** | |
| Answer flip rate across runs: **questions that ever broke down** | **36/36 = 100%** | none (0 questions broke down) | |
| Answer flip rate across runs: questions that never broke down | 93/434 = 21.4% | 98/470 = 20.9% | |

The mechanistic chain is complete and reproducible: **breakdown → that question necessarily yields different answers across the 3 runs (100% flip vs 21.4% baseline) → run-to-run variance**. The treatment arm drove breakdown to zero and the flip rate fell back to baseline. **This part of P0 is right.**

---

## 3. But: P0 introduced a regression on generative questions

LongMemEval-S's 150 IE questions **split naturally into two clusters**:

- **Extractive (121 questions)**: the gold is a fact from the history — `"Business Administration"`, `"Denver"`, `" bronchitis"`.
- **Generative (29 questions)**: the gold is `"The user would prefer responses that build upon / take into account / draw upon …"` — the answer must be **inferred from the preference**, not copied. These 29 questions are exactly the batch routed by dataset `questionType = single-session-preference` to `buildPreferencePrompt`.

### Abstention rate by cluster

| IE group | n | Control abstention | Treatment abstention | Δ |
|---|---|---|---|---|
| **Extractive** | 121 | 7.99% | 3.03% | **−4.96pp (gain)** |
| **Generative (preference)** | 29 | 3.45% | **21.84%** | **+18.39pp (regression)** |
| Abstained questions per run | | 1.00 | 6.33 | **+5.33 questions/run** |

Net account: extractive abstains 6.00 fewer questions/run, generative abstains 5.33 more questions/run → IE net −0.67 questions/run, consistent with the observed −1.11pp.

**Stability**: among the 29 generative questions, **27 (93.1%) give exactly the same verdict across the 3 treatment runs**; of those, 5 abstain 3/3 (the control arm has only 1). This is not random jitter but a **deterministic behavior change**.

### Root cause: `buildPreferencePrompt` issues three mutually contradictory instructions

```
conInstruction()  →  "Step 2 — Answer the question using ONLY those identified facts."
buildPreferencePrompt → "In Step 2, produce a CONCRETE, SPECIFIC recommendation or
                         suggestion that directly reflects those preferences."
conInstruction()  →  "Answer: <a word, name, number, or short phrase>"
```

- The second contradicts the first: **"infer a new recommendation" vs "use only the identified facts."**
- The second contradicts the third: **a concrete recommendation cannot be "a word/name/number/short phrase."**

**Before P0, the model escaped this contradiction by writing out Step 1 and then stopping** — that was the narrative leakage. P0 plugged that escape hatch, so the model switched to **abstention** to resolve the contradiction. All 6 sampled victim questions are recommendation/advice type, the gold in every case begins with `"The user would prefer responses that build upon …"`, and the treatment arm abstained 16/18 times.

So: **P0 cured the symptom and exposed the lesion.**

---

## 4. P0-b plan: make the CoN contract distinguish "extraction" from "inference"

### Design

Parameterize the CoN contract, **keeping today's extractive contract verbatim by default**, and swap only `buildPreferencePrompt` to a recommendation contract. The other three call sites (`buildQaPrompt`, `buildTemporalQaPrompt`, `buildTemporalEventLookupPrompt`) stay **byte-for-byte unchanged**, thereby locking in the measured extractive gain (−4.96pp abstention).

```ts
interface AnswerContract {
  /** What Step 2 must produce. */
  step2: string;
  /** Lines pinning the exact shape of the reply. */
  reply: readonly string[];
  /** Longest unlabelled answer admitted before the runaway safety net fires. */
  maxUnlabelledChars: number;
}

const EXTRACTIVE_CONTRACT: AnswerContract = {
  step2: 'Step 2 — Answer the question using ONLY those identified facts.',
  reply: [
    'Your entire reply is one line in exactly this form, with nothing before or after it:',
    'Answer: <a word, name, number, or short phrase>',
  ],
  maxUnlabelledChars: 200,
};

const RECOMMENDATION_CONTRACT: AnswerContract = {
  step2: 'Step 2 — Recommend something concrete that builds on those identified preferences.',
  reply: [
    'Your entire reply is one line in exactly this form, with nothing before or after it:',
    'Answer: <a specific recommendation, one to three sentences, naming the exact options>',
  ],
  maxUnlabelledChars: 400,
};
```

- `conInstruction(contract: AnswerContract = EXTRACTIVE_CONTRACT): string[]`
- `parseQaAnswer(raw, abstainToken)` **keeps its signature and default behavior unchanged**; adds an optional third parameter `maxUnlabelledChars`.
- Adds `parseRecommendationAnswer(raw, abstainToken)`, delegating to `parseQaAnswer` with a 400-character ceiling.
  > Rationale: the safety net's purpose is to **truncate runaway generation** (historical worst 33,504 characters), not to truncate good answers. A concrete recommendation of 1–3 sentences legitimately exceeds 200 characters; the current 200-character ceiling is already truncating recommendation answers (the treatment arm has 29 answers >200 characters).
- `answerPreference` switches to `parseRecommendationAnswer`.

### Acceptance criteria

**A. Code quality (local, all green before pushing)**
1. **TDD**: write the failing test first (red), then implement (green).
2. **≥ 15 new tests**, covering:
   - `buildPreferencePrompt` no longer contains `"using ONLY those identified facts"`
   - `buildPreferencePrompt` no longer contains `"a word, name, number, or short phrase"`
   - `buildPreferencePrompt` contains the recommendation-type `Answer:` contract
   - **Regression lock**: the Step 2 lines and reply contract of `buildQaPrompt` / `buildTemporalQaPrompt` / `buildTemporalEventLookupPrompt` are **verbatim equal** to `8d87341`
   - `parseRecommendationAnswer`: preserves a 3-sentence recommendation of ≤400 characters, truncates runaway generation to the first sentence, strips scaffolding, returns `null` for abstention, prefers the `Answer:` label
   - `parseQaAnswer`'s default ceiling remains 200 (behavior unchanged)
3. **All four coverage dimensions ≥ 95%** (current: statements 99.73% / branches 97.53% / functions 100% / lines 99.73%).
4. `lint` / `format:check` / `typecheck` / full test suite / `build` all pass.

**B. Same-instant A/B (4 runs/arm, 8 concurrent ~55 minutes, control = `master` i.e. `8d87341`)**
5. **Primary endpoint (mechanism, deterministic, no judge noise)**: the **preference-question abstention rate** falls from 21.84% to **≤ 8%**, per-question exact McNemar **p < 0.05**. Power: ≥ 0.95 (4 runs/arm, n=116/arm).
6. **Non-inferiority guardrail**: IE must not fall below control −1.0pp; Overall must not fall below control −1.0pp.
7. **Non-regression guardrail**: across the 4 treatment runs, the **format breakdown rate on the 470 diagnostic questions must remain 0.00%**; the longest parsed answer ≤ 500 characters.
8. **Descriptive** (not a threshold): record Overall Δ and its 95% CI faithfully — at the run level, the MDD for 4 runs/arm is about **±2.0pp**, **insufficient for a significance test**.
9. Items 5–7 above must each be satisfied **independently by each of the 4 treatment runs**, not merely in aggregate.

**C. Commit**
10. Commit and push as `Lambertyan <lambertyan@agentix-e.dev>`; comments, docs, and commit comments all in English; **no API key may ever appear in the code**.

### Expected payoff

Preference abstention falls from 6.33 questions/run back to about 1.0 question/run (control level), releasing **≈5.33 questions/run**. Those questions were all judged wrong before; if the judge acceptance rate is 50–70% once answering resumes, then IE **+1.8 ~ +2.5pp** and Overall **+0.54 ~ +0.74pp**. This is merely **repairing a regression I caused myself**, not a net addition.

---

## 5. Ranking of subsequent levers

| Iteration | Content | Upper bound | Runs needed | Primary endpoint |
|---|---|---|---|---|
| **P0-b** (this round) | Generative CoN contract | IE +2.5pp / Overall +0.74pp | 4+4 | preference abstention rate (power ≥0.95) |
| **MR deterministic aggregation** | `parseAggregationItems` + `aggregateItems`, COUNT/SUM computed in code | **MR +13.6pp / Overall +2.3pp** | 6+6 (MDD 3.78pp) | MR per-question paired accuracy (105 questions deterministically decidable) |

MR evidence (quantified): evidence recall 94.7%; **among MR answers judged deterministically wrong, 73.7% had all the evidence recalled** (aggregation/arithmetic failure), with retrieval failure accounting for only 2.6%. Error breakdown: COUNT n=141 (accuracy 75.9%, 25 of the 34 errors are arithmetic), SUM n=116 (87.1%, 10 of the 15 errors are arithmetic).

**Further out**: the KU latent inconsistency (`buildKnowledgeUpdatePrompt` has the model write an enumeration, yet goes through `parseQaAnswer`, which strips lists). Confirmed currently **inactive** (216 KU outputs with zero lists, longest 48 characters), low priority, no separate run.

---

## Appendix: analysis scripts added this time

| Script | Purpose |
|---|---|
| `question_level_ab.py` | Per-question (n=470) grouped statistics: breakdown / abstention / deterministic accuracy / flip rate / length tail |
| `question_level_ab2.py` | Per-question significance tests (exact McNemar), attribution of broken-down questions, TR deep dive |
| `perm_and_mechanism.py` | Exact permutation test (replacing the F-test) + abstention–accuracy mechanistic correlation |
| `proxy_validation.py` | Calibration of the token-F1 proxy metric (Cohen's d = 1.132) |
| `proxy_ie.py` | Recalibrating the proxy metric within the IE subset, discovering the clusters |
| `generative_ie.py` | Generative vs extractive clustering, quantifying the regression |
