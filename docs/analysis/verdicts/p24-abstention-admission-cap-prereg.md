# P24 pre-registration — abstention admission cap

**Written before run `35019792901` completes. Commit under test: `0b0069a`.**

Pre-registering the predictions so the verdict cannot be fitted to the result.
Baseline is run `34915402976` (pre-`4955d8e`, ABS = 26/30) and the regression is
run `35004814319` (`4955d8e`, ABS = 24/30).

## The change

`c984a0a` + `0b0069a`, scoped to the abstention path only:

1. `expandContextWindowBounded` — flat expansion with a hard ceiling and
   hit-priority admission.
2. `admissionMode: 'hits'` + `abstentionAdmissionBudget = 30` — the abstention
   path keeps each hit with its `contextRadius` neighbours, no session completion.
3. `buildConservativeQaPrompt` — states the entity-identity requirement
   explicitly. Context rendering unchanged (see `0b0069a`).

## Predictions

| # | prediction | prior evidence |
|---|---|---|
| P1 | ABS accuracy ≥ 26/30 (recovers the 2 net questions) | turn-count banding: 100% abstention below 45 turns |
| P2 | mean admitted turns on ABS ≤ 30 | replay: session mode 45.0, hits mode 30.0, 0/30 over cap |
| P3 | the 45–60 band is no longer populated (no ABS question admits > 30 turns) | same |
| P4 | no regression on the other four capabilities | the change is scoped to `answerAbstention`; replay shows the other paths untouched |

## What would falsify the account

- **ABS unchanged at 24/30 with mean turns ≤ 30** → the turn-count mechanism in
  P23 §3a is wrong. The abstention decision would then be driven by something the
  cap does not touch, and the mechanism must be re-derived from the new run rather
  than patched again.
- **ABS below 24/30** → the cap starves the prompt (the `hits` mode admits a
  different turn set, not merely fewer turns) and the change must be reverted.
- **Any of IE / MR / KU / TR moving beyond its historical run-to-run noise** →
  the scoping leaked and the change is not abstention-local as claimed.

## Reported alongside, not as a win

The headline accuracy is expected to be flat: 30 questions cannot move the 500
total by more than a few tenths of a point, and the previous run's +0.80 pp was
itself not significant (McNemar p = 0.6177). P1 is about the ABS block
specifically and is reported as a per-capability cell, with the same honesty as
P23 §3: a 2-question move at n=30 is directional evidence, not a result.

## Corrected en route

P23 §3 attributed the ABS loss to "evidence session entirely admitted". That was
not derivable from the artifacts (ABS rows carry no evidence field) and is
retracted in P23 §3a. The replacement account is the turn-count banding, and P1–P3
above are its test.
