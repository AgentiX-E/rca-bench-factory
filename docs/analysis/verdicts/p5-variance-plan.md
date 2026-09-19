# P5 plan — establish the measurement floor before any further feature work

## Objective

P4 ended with a result that cannot be acted on: two arms at the noise floor in
opposite directions across two runs, and — far more importantly — **25 questions
/ 5.0 pp of drift between two runs on a byte-identical configuration**
(`34389565513` vs `34492139716`). Every recent verdict reasoned against a
2-question / 1.57 pp floor measured *within* a single run. If the between-run
spread really is ~5 pp, that floor is off by an order of magnitude and no arm of
≤25 questions is interpretable.

This iteration therefore does **not** build a feature. It measures the floor.

Acceptance is not "a feature improved accuracy". It is: **a defensible,
test-backed number for the between-run spread, and a decision rule restated at
that scale.**

## Why this has to come first

Designing a sixth TR feature now would repeat the exact error P4 uncovered:
producing green runs whose numbers cannot support the conclusions drawn from
them. The P4 arms changed 2 questions; the endpoint moves 25 between runs. Until
that is quantified, feature work is unmeasurable.

## Plan

### 1. Measure the between-run spread directly

Three runs of the **identical** configuration (no P4 features enabled, since both
default off), `limit=0`, `deepseek-v4-flash`, `thinking=disabled`,
`temperature=0`, `runs=1`:

- `34558715449`, `34558717704`, `34558719936` — dispatched.

Combined with `34492139716` this gives **4 config-identical observations** per
capability, which is the minimum to report a spread at all (and the minimum for
`cohensD`/`tTestPValue`, which return 0 for n<2 rather than lying).

### 2. Add a real, tested analysis library

A new `src/variance.ts` in `cortex-eval`, exported from the package root:

- `summarizeVariance(observations)` → per-capability and overall
  `{n, min, max, mean, sd, range, spreadPp, minCorrect, maxCorrect}`.
  The quantity of interest is the **range and sd in questions**, because that is
  what an arm must exceed.
- `compareQuestionVectors(a, b)` → how many questions changed state between two
  runs of the *same* configuration (`stable`, `flippedIn`, `flippedOut`). This is
  the config-identical analogue of the discordant-pair count and the direct
  measure of endpoint instability.
- `requiredEffectSize(variance)` → the minimum arm effect that clears the floor,
  with the reasoning encoded in the type rather than a comment.

Everything reported in questions first, percentage second: percentages hide the
sample size, and sample size is what P4 got wrong twice.

### 3. Accept the verdict and restate the rule

Update the decision rule to the between-run scale, and state explicitly which
past verdicts that invalidates. Where a past promotion rested on a single-run
comparison under the old floor, say so.

### 4. TDD throughout

Tests before implementation, covering every branch: empty input, n=1, n=2,
all-stable, all-flipped, asymmetric flips, and the interaction with the existing
`aggregate`/`cohensD` helpers. ≥95% on all four dimensions.

## Acceptance criteria

1. Four config-identical runs complete green with artifacts.
2. `variance.ts` shipped with tests; **≥95% coverage on statements, branches,
   functions, and lines**, no skips, no mocks of the statistics themselves.
3. A quantified between-run spread (questions and pp) per capability and overall.
4. The decision rule restated at the between-run scale, in a document, with the
   number it now requires an arm to clear.
5. `pnpm build` + `pnpm check` green; committed as `Lambertyan` with English
   commit message and English comments/docs throughout.

## Explicit non-goals

- Promoting either P4 feature. Both stay default OFF: neither cleared the floor,
  and the floor just moved.
- Building any new TR feature.
- Changing the graded path. This iteration is measurement infrastructure; the
  published numbers must be bit-identical.

## Risks

- **All four runs are not truly identical if the endpoint degrades over time.**
  Mitigation: report the runs in chronological order as well as in aggregate, so
  a monotonic trend (drift) is distinguishable from stationary noise. Drift and
  noise imply different fixes.
- **n=4 is a small sample for an sd.** Mitigation: report range as the primary
  figure (robust at small n) and sd as secondary, and do not compute a
  confidence interval that n=4 cannot support.
