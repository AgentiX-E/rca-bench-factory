# P30 — Five ablation arms disabled abstention, breaking parity with the graded path

**Status:** found offline at zero API cost, fixed, pinned by five tests that were
verified red before the fix. **No re-run is authorised by this finding** — see §6.

## 1. The defect

Every ablation that holds abstention *constant across its two arms* held it at
`false`:

| ablation | arms | before | after |
|---|---|---|---|
| `runMrAggregationAblation` | `mr-legacy-aggregation`, `mr-cot-aggregation` | `false` | `true` |
| `runTemporalEngineAblation` | `tr-llm-temporal`, `tr-deterministic-temporal` | `false` | `true` |
| `runDeterministicCoverageAblation` | `tr-base-engine`, `tr-extended-engine` | `false` | `true` |
| `runTimeWindowAnnotationAblation` | `tr-no-time-window`, `tr-time-window` | `false` | `true` |
| `runBitemporalKnowledgeUpdateAblation` | `ku-cot-*`, `ku-bitemporal-*` | `false` | `true` |

The two places that legitimately differ are untouched: `runNaturalLanguageBenchmark`
(there abstention *is* the variable — baseline off, feature on) and
`runAbstentionRetryAblation` (already `true` in both arms, correctly).

## 2. What `false` actually does

`respondWith` (`natural-language-memory.ts:1138`, `:1248`) branches on it in two
places:

- retrieval empty → returns `'unknown'` instead of `null`;
- the parsed answer is `null` (the model declined) → **emits `abstained: false`,
  reason `'answered'`, and returns the literal string `'unknown'`.**

So a model that declines is not merely unrecorded, it is **rewritten into an
answer-shaped string and logged as having answered**. The reported
`abstentionRate` is therefore pinned at 0.00% whatever the model does.

## 3. What it does and does not invalidate

This is the part worth being exact about, because the tempting claim is stronger
than the true one.

**Not invalidated: the accuracy nulls.** `'unknown'` and a real abstention are
both scored incorrect — `abstentionAwareAccuracy` is defined equal to `accuracy`
(`metrics.ts:95`, `:318`) and no question in these TR/KU/MR populations has
`expected === null`. So if the annotation or the extended engine had converted an
abstention into a correct answer, accuracy would have moved and the discordant
count would have risen. Run `35162802298`'s `Δ = +0.00%` on both TR arms **stands**.

**Invalidated: everything the run could say about the mechanism, and its parity
with the graded path.**

- Both TR arms reported `Abstention rate: 0.00%`, a figure pinned there by
  construction — while P29 measured the relevant sub-population abstaining at
  19.4% (7 of 36 unserved temporal kinds) against 2.2% (2 of 91 served).
  Anyone reading "0.00%" as "no abstentions occurred" is misreading a constant.
- The run could not separate *"the option changed nothing"* from *"the option
  changed abstentions into different wrong answers"* — under the old setting
  both are the same observation.
- **The arms were not the system being graded.** The graded feature system
  (`runNaturalLanguageBenchmark`) abstains; these arms could not. Any interaction
  between the feature under test and the abstention machinery was unmeasured.

## 4. Why it survived

The change is accuracy-neutral by construction — §3 — so no number a reader
checks ever moved. It is invisible in the figure the ablation *reports* and total
in the figure it must be able to report. That is the same shape as the retry
ablation's MR-only scope (P20): the instrument read zero because of what it was
pointed at, not because of what was there.

## 5. The fix and why it is safe

`enableAbstention: true` in all ten arms, plus docblocks that record *why* the
constant is held at `true` rather than `false`. Pinned explicitly rather than
left to the library default, so a future default flip cannot silently re-enable
the defect.

Safety argument:

- **The constant is still constant.** Each ablation's two arms share the setting,
  so every delta remains attributable to the one option that differs.
- **No new abstention mechanism is introduced.** None of the five arms sets
  `abstainThreshold`, and the threshold branch is gated on it
  (`natural-language-memory.ts:1153`). Only the empty-retrieval and
  parse-failure branches change, and both previously produced `'unknown'`, which
  scores identically to `null`. Accuracy is unchanged; only the reporting channel
  opens up.
- **`abstentionAwareAccuracy === accuracy`** is asserted by the metrics module
  itself, so the headline comparison cannot shift.

Five tests were added, one per changed pair, each asserting that a model
returning `UNANSWERABLE` yields `abstentionRate > 0` **in both arms**:

```
runMrAggregationAblation > records a declined answer as an abstention in both MR arms
runTemporalEngineAblation > records a declined answer as an abstention in both TR-engine arms
runTimeWindowAnnotationAblation > runs with abstention enabled, so the population it exists to explain is observable
runDeterministicCoverageAblation > runs with abstention enabled, so weekday-anchored resolution can be observed
runBitemporalKnowledgeUpdateAblation > records a declined answer as an abstention in both KU arms
```

All five were **verified red before the fix** by reverting `enableAbstention:
true` → `false` across `runner.ts` and re-running: 5 failed. Restored, 5 pass.
The MR one additionally pins that the custom `aggregationPrompt` opt-out
(`abstentionRetryAllowed`) suppresses only the *re-ask*, not the *recording* —
two different switches that are easy to conflate.

Gate after the fix: **952 tests green** (cortex-core 87, cortex-node 16,
cortex-llm 43, cortex-eval 806); coverage 99.88 / 98.71 / 100 / 99.88 in
cortex-eval, lowest branch figure anywhere 97.26%.

## 6. Disposition: no re-run

Re-running to collect `Δabstention` on the two TR arms would cost a full run and
change no decision — the accuracy null stands (§3), so `extendedTimeRange` and
`enableTimeWindowAnnotation` both stay off on the graded path, exactly as they
are. `bench/run.ts` executes all of these arms on **every** dispatch, so the next
run re-measures them with the channel open at zero marginal cost. Folding this
into the next authorised experiment is strictly better than spending a run on it.

## 7. What this changes about how nulls are read here

Two nulls have now traced to instrument scope rather than to the feature: P20
(MR-only retry scope) and this one. The standing rule going forward:

> before reading a `Δ = +0.00%` as evidence about a feature, check that the arm
> can *express* the outcome the feature would change. If the report says
> `0.00%` for a quantity that is not structurally forced to zero, it is a
> measurement; if it is structurally forced, it is a configuration fact wearing
> a measurement's clothes.
