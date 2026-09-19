# Next Iteration Plan: Deterministic Aggregation

Status: **pending approval**. This iteration must wait for the same-moment A/B (`7a349da` vs `8d87341`) to deliver the P0 verdict before it starts.

---

## 1. Root cause: MR's bottleneck is not retrieval, it is arithmetic

Per-question attribution over the 121 MR questions (363 answers) from the three `8d87341` runs:

| Metric | Value |
|---|---|
| Mean evidence-session recall | **94.7%** (87.6% of questions at 100% recall) |
| Wrong answers where "all evidence was recalled" | **73.7%** |
| Wrong answers where "no evidence was recalled at all" | **2.6%** |

**Retrieval is essentially solved; what remains is arithmetic and enumeration at the aggregation layer.** The evidence is right in front of the model, and it still computes wrong:

```
gt=3      predicted=2       missed one item
gt=4      predicted=6       double-counted twice
gt=$5,850 predicted=$5,250  sum short by 600
gt=$720   predicted=$700    sum short by 20
```

Splitting the 257 answers that have both a numeric ground truth and a numeric prediction by question type:

| Type | n | Accuracy | Errors | Arithmetic error (its own enumeration contradicts its own answer) | Enumeration error | Unparseable |
|---|---|---|---|---|---|---|
| COUNT (`how many items/times/people`) | 141 | 75.9% | 34 | **25 (73.5%)** | 6 (17.6%) | 3 (8.8%) |
| SUM (`how much money` / `how many hours/days`) | 116 | 87.1% | 15 | **10 (66.7%)** | 3 (20.0%) | 2 (13.3%) |

**The items the model itself lists do not match the answer it itself gives** — 70% of all counting errors. This is not a knowledge problem, it is an arithmetic problem, and arithmetic should not be handed to an LLM.

---

## 2. Approach: take arithmetic away from the LLM

Following the already-validated philosophy of P1.5 (deterministic relative-time conversion): **the LLM handles semantic understanding, and code handles the deterministic computation it is bad at**.

The current `buildAggregationQaPrompt` makes the model do two things at once — enumerate the evidence (Step 1) and sum/count (Step 2). It gets both wrong. Split them:

### 2.1 Changes

| # | Location | Content |
|---|---|---|
| 1 | `buildAggregationQaPrompt` | Step 2 no longer asks for summing/counting; it asks only for **one line per item** `- <item> | <value>`, keeping an `Answer:` line at the end as a fallback |
| 2 | New `parseAggregationItems(raw)` | Parse the item lines into `AggregationItem[] = { label: string; value: number \| null }`; strip dates and years so `2023/05/12` is not treated as a numeric value |
| 3 | New `aggregateItems(items, question)` | **Deterministic** aggregation: take `items.length` for COUNT questions and `sum(items.value)` for SUM questions; return `null` when the question type is unclear or a value is missing |
| 4 | `parseAggregationAnswer` | Prefer "parse enumeration → deterministic aggregation"; when that returns `null`, **fall back completely** to the existing logic (`Answer:` tag → last non-empty line), with signature and behavior unchanged for existing callers |

### 2.2 Why it must be conservative (safety boundary)

Misclassification is catastrophic: summing a COUNT question as if it were SUM turns an answer of `3` into `2023+2023`. So enable only under high confidence:

- **SUM questions** must hit a money/time unit signal (`how much`, `$`, `how many hours/days/minutes`, `total money/cost`), **and** all items must carry a usable numeric value
- **COUNT questions** must hit a counting pattern (`how many <items/times/people/...>`), **and** the item structure must be consistent
- If any condition fails → return `null` → fall back to the LLM's original answer, **never guess**

### 2.3 Out of scope

Enumeration errors (17–20%) — the model omitting or adding items — cannot be fixed by deterministic arithmetic; they need better recall and enumeration prompting, in a separate iteration.

---

## 3. Estimated benefit

| Basis | Value | Note |
|---|---|---|
| Fixable errors | 35 (aggregated over 3 runs) = **11.7 questions / run** | cases where the model's own enumeration contradicts its own answer |
| MR upper bound | **+13.6pp** | 66% → 79.6% |
| Overall upper bound | **+2.3pp** | 11.7 / 500 |
| Realistic expectation | MR **+6~8pp**, Overall **+1.2~1.6pp** | discount to 50–60%, since some enumerations are themselves wrong |

**This is an upper-bound estimate, not a commitment.** After the arithmetic is fixed, the answer will equal the model's enumeration, and it only scores when the enumeration itself is correct.

---

## 4. Acceptance criteria

| # | Acceptance item | Threshold |
|---|---|---|
| 1 | TDD | write failing tests (red) first, then implement (green) |
| 2 | Unit tests | add ≥ 15 cases: COUNT/SUM classification, date stripping, numeric parsing, `null` fallback, boundaries (empty list, mixed values, null values) |
| 3 | Coverage | all four dimensions **≥ 95%** (Statements / Branch / Functions / Lines), no mocks |
| 4 | Local regression | lint / format / typecheck / full test suite / build all green |
| 5 | MR accuracy | **significant improvement** over the same-moment control (Welch p < 0.05), 3 runs same day |
| 6 | No regression | IE / TR / KU / ABS must all be no lower than control −1.0pp |
| 7 | Fallback safety | the rate at which "deterministic aggregation returned null and fell back" appears in diagnostic logs must be recorded and reviewed, confirming no silent misuse |
| 8 | Three consecutive hits | meets threshold on 3 consecutive runs; a single hit does not count as success |

## 5. Relationship to P0

The two iterations are independent and must not be validated together — change only one variable at a time. The same-moment A/B verdict for P0 comes first, this iteration second.
