# P4 run 34479855027 — dispatch defect, not a feature result

**Verdict: INVALID RUN.** The `+0.00%` deltas below are an artifact of the
dispatch parameters, not a property of the P4 features. No conclusion about the
time-window annotation or the engine refinements may be drawn from this run.

## What was observed

| Arm | Dataset | n | Baseline | Feature | Δ | Discordant |
|---|---|---|---|---|---|---|
| Engine refinements | `longmemeval-tr-deterministic` | 8 | 87.50% | 87.50% | +0.00% | 0 / 0 |
| Time-window annotation | `longmemeval-tr-annotated` | 8 | 87.50% | 87.50% | +0.00% | 0 / 0 |
| Main TR (engine ablation) | `longmemeval-tr` | 8 | 87.50% | 87.50% | +0.00% | 0 / 0 |
| KU bitemporal | `longmemeval-ku-temporal` | 1 | 100% | 100% | +0.00% | 0 / 0 |

Every arm reported **zero discordant pairs**, including the *main* TR ablation
that historically reports +11.02 pp. A genuine null result across four
independent arms is implausible; zero discordant pairs everywhere means the arms
could not move.

## Root cause

The run was dispatched with `LIMIT=60`. `sampleInstances` round-robins across
capability buckets keyed by `sampleBucketKey` (`IE:*` per question type, else the
bare capability), so a 60-instance sample is spread thinly over five
capabilities. TR received **8** instances, of which only **8** carry a
`question_date` — exactly the 8 that feed both P4 arms.

Contrast with the P3b run `34389565513`, dispatched with `limit=all`:

```
Running benchmark on 500 instance(s) (limit=all, ...)
- Dataset: `longmemeval-tr` (127 questions)
```

`limit=all` yields **127 TR questions**; `LIMIT=60` yields **8**. The P4 arms
therefore ran on ~6% of the available TR signal — far below anything that could
resolve an effect, and below even the 2-question same-configuration noise floor
measured earlier.

The full LongMemEval-S census, for reference:

| Capability | Questions |
|---|---|
| IE | 150 |
| MR | 121 |
| KU | 72 |
| TR | 127 |
| ABS | 30 |
| **Total** | **500** |

Under `LIMIT=60` the round-robin allocates roughly 12 per capability, which TR's
dated subset (`capability === 'TR' && questionDate`) then cuts to 8.

A second, related starvation: `longmemeval-ku-temporal` received a single
question under this dispatch, so the KU bitemporal arm was equally uninformative.

## Why this is worth recording

The failure mode is silent. The workflow went **green**, every step passed, and
each report renders as a well-formed ablation table with confidence intervals
and a McNemar p-value. Nothing in the output says "n=8 is too small to detect
anything". The `0 / 0` discordant-pair column is the only tell, and it is easy
to read as a genuine tie.

This is the same class of defect as the earlier `benchmark.yml` artifact-path
bug: the run *succeeds* while producing evidence that cannot support the
conclusion it appears to support. Both were caught only by reading the numbers
rather than the exit status.

## Standing rule

Every ablation report must be read with its `questionCount` in hand, and an arm
whose sample is too small to exceed the measured noise floor must be marked
INCONCLUSIVE before its delta is interpreted. A green workflow is not evidence
that an experiment was adequately powered.

## Remediation

Re-dispatched as run `34481475313` with `limit=0` (full 500-instance dataset),
which restored the 127-question TR population. Both P4 arms then reported
non-degenerate results (see `p4-verdict.md`): 4 and 2 discordant pairs
respectively, versus 0 and 0 under the starved dispatch.

The contrast is the clearest possible statement of the defect. Same code, same
workflow, same LLM — only the sample size differed, and it moved the arms from
"no question could change" to measurably changing outcomes.
