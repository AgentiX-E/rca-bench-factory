# P4 Plan — Time-Window Evidence Anchoring for `eventLookup` (and `other`)

**Predecessor verdicts:** `tr-daterange-verdict.md` (P2, REJECT), `tr-occurrence-verdict.md`
(P3a, REJECT), `p3b-graph-verdict.md` (P3b, REJECT).
**Baseline:** `7780071` on `master` (P3b reverted; TR = 78.74%, 100/127).
**Target capability:** TR `eventLookup` (20 q, 65.0%) and, secondarily, TR `other` (16 q, 62.5%).

## Verdict first: what changed, and why this arm is not P2/P3a/P3b again

P2, P3a and P3b all **widened recall** and all three lost: appending turns lowers
precision on an already 8–12 KB prompt. The evidence from all three runs is that
TR's bottleneck is **not** recall depth. On the P3b run:

| TR error class | count | evidence |
|---|---|---|
| gold keyword absent from the retrieved context | ~10 | `aunt`, `smoker`, `contract`, `parents`, `sapling`, `Metropolitan` all absent |
| gold present, reader picked/computed wrong | ~17 | `MoMA` vs `Metropolitan`, `chicken soup` vs `chocolate cake`, `5` vs `7 days` |

P4 does the **opposite**: it does not add a single turn to the prompt. It
**re-labels the turns already in the prompt** with a distance-to-target-window
annotation computed deterministically, so the reader can stop confusing a
near-miss turn for a hit. The mechanism is precision-preserving by construction:
prompt length is unchanged, prompt content is unchanged, and the ablation turns
the annotation on and off.

Measured justification for each sub-feature follows; every number below is from
the P3b run's diagnostics (`analysis/artifacts/p3b-graph-34389565513`).

### A. `resolveTimeRange` misses the two commonest qualifiers

`resolveTimeRange` is current called **only for `eventLookup`** and returns a
window for just 14 of 20 such questions. It fails on named weekdays, which is
exactly where the failures cluster:

| question id | qualifier | window today | turns inside window in context |
|---|---|---|---|
| `71017277` | "last Saturday" | **none** | — |
| `gpt4_d6585ce9` | "last Saturday" | **none** | — |
| `gpt4_1e4a8aec` | "two weeks ago" | 04/14–04/28 | 2 |
| `gpt4_59149c78` | "two weeks ago" | 01/11–01/25 | 2 |
| `9a707b82` | "a couple of days ago" | 04/03–04/17 | 1 |
| `eac54add` | "four weeks ago" | 02/21–03/07 | 6 |
| `gpt4_8279ba03` | "10 days ago" | 03/08–03/22 | 1 |

Five of the seven failing `eventLookup` questions *have* a window, and the
context *contains* turns inside it — the model had no signal telling it those
were the anchor turns. For `gpt4_59149c78` the two turns inside the window
(01/14, 01/15) sit inside a context whose span is 01/01–01/15, and the model
still answered `MoMA` from an out-of-window turn. That is a **discrimination**
failure, not a recall failure.

**P4-A:** extend `resolveTimeRange` to named weekdays (`last|this|next <weekday>`,
resolved against the question date's weekday) and to `N days/weeks/months ago`
already covered, then apply it to `other` as well. Zero new dependency, pure
function, fully unit-testable.

### B. The "NN days ago" band is too wide, and the margin is applied twice

`RANGE_MARGIN_DAYS = 7` wraps the resolved target in ±7 days, so "10 days ago"
becomes a **15-day** window (03/08–03/22). A 15-day window inside a 2-week
context cannot discriminate anything. The gold window for a "N days ago"
question is qualitatively tighter: LongMemEval states the offset and expects the
event stated at approximately that offset.

**P4-B:** shrink the margin to ±2 days for `N days/weeks` offsets (the answer is
"10 days ago"; a turn 3 days off the stated offset is a distractor unless the
prompt says otherwise) while keeping a wider margin for month-scale offsets
where LLM-stated offsets are fuzzy ("a month ago" can be 4–6 weeks). The margin
becomes a function of the offset unit: `day → 2`, `week → 3`, `month → 7`.

Rationale for not going to ±0: the question's own phrasing is an approximation
of the user's utterance, and the dataset's `inject_time.txt` is deliberately
never consulted (dataset-agnostic requirement), so a small tolerance is the
honest reading of "*about* 10 days ago".

### C. Discriminative time-window anchoring (the reader-side fix)

**P4-C:** annotate each turn in the prompt with its signed distance to the
target window, and instruct the reader to prefer in-window turns. Concretely,
for a question whose window resolves to `[w₁, w₂]`, each turn dated `d` is
rendered with a suffix:

| distance `δ` | annotation |
|---|---|
| `d ∈ [w₁, w₂]` | `[in the question's time window]` |
| `0 < δ ≤ 3` | `[3 days outside the question's time window]` |
| `δ > 3` | *(no annotation — default/noise)* |

This is a **labeling** change inside `formatStructuredContext`, not a filtering
change: the turn list and its length are identical with the feature on and off,
so the ablation isolates the discrimination signal rather than re-testing
"does more context help" — a question three runs have already answered "no".

### D. `other`: two deterministic sub-cases are genuinely computable

Splitting the 16 `other` questions, 7 have their evidence fully in-context and
are pure enumeration/arithmetic on dates that are already visible:

| question id | gold | today |
|---|---|---|
| `a3838d2b` | "4" | 0 — counts events across the whole haystack |
| `6e984301` | "3" | "6 weeks" — wrong unit returned |
| `a3045048` | "7 days" | 5 |
| `gpt4_a1b77f9c` | "2 weeks … 4 weeks" | "12" — two-answer question, parser returns one number |
| `d01c6aa8` | "27" (age when moving to the US) | abstained |
| `gpt4_e414231f` | "road bike" | "mountain bike" — near-synonym distractor |
| `gpt4_9a159967` | airline | wrong |

`a3045048` is the cleanest target: the question is
"How many days **before** my best friend's birthday party did I order her gift?" —
a two-event interval that `hasSecondEventReference` does not catch (it matches
`when I …`, not `before …`), so it never reaches the deterministic engine and the
LLM does the arithmetic ("5"). The question names two orderable events and the
gold is their interval: `|date(party) − date(order)|`.

**P4-D:** extend the second-event predicate to `before/after <event>` phrasing so
two-event interval questions reach `computeTemporalAnswer`. This reuses the
existing, tested interval path; no new arithmetic.

## Explicit non-goals

- **No recall widening.** No new hits, no larger `topK`, no appended turns.
  Three consecutive rejections (P2/P3a/P3b) settle this.
- **No new LLM call.** P4 adds only deterministic preprocessing; the extraction
  prompt already exists and its event list is not used by P4.
- **No `inject_time.txt`.** The window comes from the question text and the
  question date alone, preserving the dataset-agnostic property.
- **No threshold tuning to chase the metric.** Margins are derived from the
  offset unit, not fitted on the eval set.

## Design decisions with trade-offs

| # | Decision | Alternative | Why this way |
|---|---|---|---|
| D1 | **Annotate, do not filter** in-window turns | Drop out-of-window turns from the prompt | Filtering re-introduces the P3b failure mode: it removes evidence the reader may need (the gold turn can sit just outside a mis-resolved window). Annotating is reversible and cannot lose evidence. |
| D2 | Margin by offset unit (`day→2`, `week→3`, `month→7`) | Single constant (today: 7) | One constant over-widens short offsets (15-day window for "10 days ago") and under-widens month offsets. The unit is recoverable from the question deterministically. |
| D3 | Extend `hasSecondEventReference` to `before/after` | Add a new classifier kind | The existing `interval` path already computes exactly this; a new kind would duplicate the arithmetic and its tests. The predicate is already conservative-by-design (documented false-negative preference). |
| D4 | One ablation per sub-feature (A+D together as "deterministic coverage", C alone as "annotation") | One combined arm | A combined arm cannot attribute the delta; the whole point of the last three iterations is that attribution matters. Two arms, two McNemar tests, one workflow. |
| D5 | `enableTimeWindowAnnotation` default **false** | default true | The P3b lesson: nothing new is enabled on the graded path until its own ablation is green. The main ablation and the TR temporal-engine guard must be bit-identical before and after this commit. |

## Implementation plan (TDD, test first)

| # | Step | Files | Tests |
|---|---|---|---|
| 1 | Weekday resolution + unit-scaled margin in `resolveTimeRange` | `temporal-engine.ts` | Table-driven: `last Saturday`, `this Monday`, `next Friday`, `10 days ago` (±2), `3 weeks ago` (±3), `4 weeks ago` (±7), `a month ago` (±7); assert windows for questions whose weekday is before/after the question date (both directions) |
| 2 | `before/after <event>` second-event predicate | `temporal-engine.ts` | Positive: `a3045048` text; negative: single-event `before` phrases (`before bed`) must NOT match |
| 3 | Time-window annotation in the prompt | `natural-language-memory.ts` (`formatStructuredContext` overload + `enableTimeWindowAnnotation`) | In-window → `[in the question's time window]`; δ=1,2,3 → `[N days outside …]`; δ=4 → no annotation; window absent → no annotations anywhere; disabled → byte-identical to today's output |
| 4 | Two ablation runners | `runner.ts` | `runTimeWindowAnnotationAblation` (TR, annotation off/on) and `runDeterministicCoverageAblation` (TR, extended engine off/on) — paired McNemar, both abstention-off |
| 5 | Wire into `bench/run.ts` + `index.ts` exports | `bench/run.ts`, `index.ts` | `report-runner.test.ts`: both runners produce a report with the expected shape and a per-capability table |

Coverage bar: every new function at **100%** on statements/branches/functions/lines,
package total ≥ 95% on all four dimensions.

## Acceptance criteria (fixed before the run)

| # | Criterion | Measurement |
|---|---|---|
| 1 | Annotation arm: TR accuracy strictly improves, one-sided exact McNemar **p ≤ 0.05**, and repaired ≥ broken | `runTimeWindowAnnotationAblation` in the workflow |
| 2 | Coverage arm: TR accuracy strictly improves, one-sided exact McNemar **p ≤ 0.05**, and repaired ≥ broken | `runDeterministicCoverageAblation` |
| 3 | **Precision guard:** `b✓f✗ ≤ 3` on each arm | A tie-break rule: an arm that trades 15 for 6 (P3b) is rejected even if the aggregate were positive |
| 4 | TR temporal-engine guard is not degraded: stays at **+11.02 pp** (14 fixed / 0 broken) | Existing `benchmark-tr-ablation-report.json` |
| 5 | Main-ablation TR is bit-identical: **100/127** on every capability | `benchmark-report.json` |
| 6 | MR / KU / IE / ABS unchanged | `benchmark-report.json` |
| 7 | Full suite green, ≥95% coverage on all four dimensions, no skipped tests, no lowered thresholds | `pnpm check` |

**Interpretation rule fixed in advance:** if an arm is within the measured
same-config noise floor (2 questions / 1.57 pp, measured inside the P3b run),
the verdict is **INCONCLUSIVE**, not ACCEPT — and the next action is to repeat
the arm, not to ship it. A negative Δ is a REJECT regardless of p.

## Risk register

| risk | severity | mitigation |
|---|---|---|
| Annotation leaks a wrong window and *mislabels* the gold turn as out-of-window | **high** | Guard #3 (`b✓f✗ ≤ 3`); the annotation says "prefer", never "exclude"; D1 chose annotation over filtering precisely so a wrong window cannot discard evidence |
| The reader ignores the annotation entirely → Δ = 0 | medium | That is an honest INCONCLUSIVE, and it is the cheapest possible failure (one run); it would redirect the work to the reader-side prompt, where 17 of 27 TR errors actually live |
| Weekday resolution is ambiguous (`last Saturday` when the question is itself a Saturday) | medium | Explicit test on both directions; the convention is "the most recent Saturday strictly before the question date" |
| Extending `hasSecondEventReference` breaks a currently-working single-event question | medium | The predicate is documented as erring to false negatives; tested against all 25 `relative` + 26 `interval` question texts before the run |
| Another workflow artifact silently dropped | low | Already fixed in `7780071` (`benchmark-*.{md,json}` glob) |

## Expected effect, stated honestly

The reachable subset is the **~7 reader-side `eventLookup` errors where the gold
turn is already in the window** plus the ~5 `other`/`relative` questions with
in-context evidence. Realistic ceiling **≈ +5 to +8 TR questions (+4 to +6 pp)**,
against a noise floor of 2 questions. Not the 20-point gap the deterministic
kinds enjoy — that gap needs recall improvements that P2/P3a/P3b have shown must
come from a precision-preserving mechanism, which is what P4 is testing.

If both arms come back INCONCLUSIVE, the honest conclusion is that TR is
reader-bound at this model size and the next iteration should target the reader
(step decomposition / self-consistency over the same context) rather than
retrieval.
