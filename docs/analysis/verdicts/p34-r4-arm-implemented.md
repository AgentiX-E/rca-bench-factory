# P34 — R4 is now measurable: the conjunction-decomposition arm exists

**Status:** implemented, tested, wired into `bench/run.ts`. **Not yet measured** —
the arm produces its report on the next dispatch.

---

## 1. What was missing

R4 was pre-registered (`p27-r4-prereg.md`) with its predictions P1–P5 fixed and
its offline counter-example sweep passed (§3.5: no question in the conjunctive
cohort depends on a single turn carrying both operands). What it did **not** have
was a way to measure itself.

The only way to test R4 was to edit `buildQueryExpansionPrompt` in place, which:

- changes query expansion for **all 500 questions**, not the ~7 conjunctive ones;
- makes the effect **unattributable**, because the same commit changes both the
  prompt and everything downstream of it;
- leaves no control arm, so the delta can only be read as "before vs after"
  across two runs of a non-reproducible endpoint.

That is the mistake `p24-cap-verdict.md` §4 records the cost of — two changes in
one commit, and a dedicated run needed to separate them afterwards. R4 was
deliberately held back from that fate (`p27-r4-prereg.md` §5).

## 2. What was built

| piece | why |
|---|---|
| `buildQueryExpansionPromptWith(question, { decomposeConjunctions })` | the parameterised builder; `buildQueryExpansionPrompt` delegates with the flag off |
| `NaturalLanguageMemorySystem.queryExpansionPrompt` | lets one arm swap the instruction without touching call sites |
| `runQueryExpansionDecompositionAblation(...)` | the arm: `conjunction-fused` vs `conjunction-decomposed` |
| `BenchmarkRunnerOptions.capabilities` | scopes an arm by capability |
| `bench/run.ts` wiring | writes `benchmark-conjunction-ablation-report.{md,json}` |

### 2.1 The default prompt is byte-identical

The graded path must not move until the arm has been read. `buildQueryExpansionPrompt`
delegates to the new builder with `decomposeConjunctions: false`, and that
identity is **asserted** — `buildQueryExpansionPromptWith(q, {})` must equal
`buildQueryExpansionPrompt(q)` and the default must not contain `TWO OR MORE`.

### 2.2 The option cannot leak into the temporal paths

`expandQuestion` receives an explicit `expansionPromptBuilder` from every call
site, and five of them pass their own event-level builder
(`buildTemporalQueryExpansionPrompt`, the MR/derivation variants). If the new
option were applied unconditionally it would **silently replace every expansion
prompt in the system**, breaking the temporal arms with no test failing.

So the option is applied only when the caller passes the **default** builder,
recognised by identity:

```ts
const builder =
  promptBuilder === buildQueryExpansionPrompt
    ? (this.options.queryExpansionPrompt ?? buildQueryExpansionPrompt)
    : promptBuilder;
```

The expansion cache key already used `builder.name`, so it now keys on the
resolved builder — the two arms cannot collide, and a question whose expansion is
identical in both arms is never re-sent to the provider.

### 2.3 Scoping is the point, not a convenience

The arm defaults to `capabilities: ['ABS', 'IE']`.

The mechanism affects a handful of conjunctive questions. Averaged over 500, a
+1pp effect is 5 questions and drowns in model noise — which is exactly why the
TR arms' nulls were uninformative (P30 §3). ABS is the target population;
IE is the largest set of single-operand questions and is where decomposition must
do **no harm**, so it doubles as the collateral-damage check.

### 2.4 The instruction retains the fused phrase

> "list a SEPARATE phrase for EACH one, **plus the combined phrase**"

The offline sweep found no question in the cohort that depends on a single turn
carrying both operands, so retention costs nothing and removes the one identified
regression risk — a corpus where both operands genuinely co-occur in one turn.
This is R4's answer to P3 ("no collateral damage"): not a hope, a construction.

## 3. Tests — nine, with the two that actually matter

Prompt level (5):
- the default prompt must **not** carry the instruction;
- the decomposed variant must carry it;
- it must retain the fused phrase;
- it must be a **strict superset with exactly two added lines** — so the ablation
  compares one instruction, not a rewritten prompt;
- byte-identical to the default when the flag is off.

Arm level (4): scope, variant labels, temperature/judge forwarding, and that both
arms **record abstentions** (the P30 defect, pinned on the new arm too).

The two with teeth beyond "the string is present":

1. **The strict-superset test.** A prompt rewrite that dropped a shared
   instruction would confound the comparison with an unrelated change. The test
   computes the diff of the two prompts and requires exactly two added lines.
2. **The arms-send-different-prompts test.** Both arms share one expansion
   cache. If the two arms produced the *same* prompt for the conjunctive
   question, the cache would serve the control's phrases to the treatment and the
   delta would measure nothing — the exact masking failure this repo has already
   hit once (`p5-pairing-verdict.md`). The test asserts the treatment's prompt
   contains `TWO OR MORE` and the control's does not, so the differencing is
   verified rather than assumed.

The flag was neutered (`=== true` → `false === true`) to confirm the prompt tests
are not vacuous: **3 failed, 3 passed**. Restored, all pass.

Gate: **972 tests green** (cortex-eval 826). Coverage 99.84 stmts / 98.67 branch
/ 100 funcs / 99.84 lines; lowest branch figure anywhere 97.26%.

## 4. What the next run will report

Five arms in one dispatch, each attributable on its own:

| arm | change under test | expected signal |
|---|---|---|
| `benchmark-report` | P32 ordering fix + P33 `before` fix (both on the graded path) | +4 to +6 questions on TR/KU |
| `benchmark-tr-ablation`, `-window`, `-coverage`, `-ku-bitemporal`, `-mr-*` | unchanged arms, now with the abstention channel open (P30) | abstention rates > 0 where they were structurally 0 |
| **`benchmark-conjunction-ablation`** | **R4** | P1–P5 from `p27-r4-prereg.md` |

R4's predictions are scored against the prereg, not against a fresh hypothesis:
**P2** (`6456829e_abs` abstains, ABS → 30/30), **P3** (the 6 conjunctive controls
still abstain), **P4** (no capability moves by ≥2), **P5** (quantity-type
conjunctive questions do not degrade — and if P5 cannot be evaluated because the
cohort is too small, the prereg requires that be stated rather than glossed).

The honest expectation remains the caveat recorded since P31: R4's ceiling is
**+1 question (+0.2pp)**. It is in the run because it is now free to carry — its
own scoped arm, no extra dispatch — not because it is the largest lever. The
largest levers are the two shipped fixes, and the run is the first chance to see
them.
