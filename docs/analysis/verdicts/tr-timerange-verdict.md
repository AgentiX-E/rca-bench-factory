# TR Time-Range Resolution — A/B Verdict: ACCEPT (weak, direction-correct)

## Result

| Endpoint | control | treatment | verdict |
|---|---|---|---|
| eventLookup (20 q) | 46/80 | **49/80** | **+3, 0 down** — timeRange's direct effect |
| TR overall | 75.39% | 74.02% | −1.37pp (sampling noise, see attribution) |
| IE / MR / KU / ABS | — | — | all n.s. |

## Attribution (why TR overall looks down but the change is clean)

`timeRange` is wired ONLY into the `eventLookup` branch; every other TR
subtype still uses the unchanged `buildTemporalQaPrompt`. Splitting TR by
`classifyTemporalQuestion` proves the −1.75/run is not a regression:

| Subtype | q | control→treatment | driven by timeRange? |
|---|---|---|---|
| eventLookup | 20 | 46→49 (+3) | **yes** |
| relative | 25 | 87→82 (−5) | no — byte-identical prompt, pure noise |
| interval | 26 | 92→88 (−4) | no |
| ordering | 40 | 119→117 (−2) | no |
| other | 16 | 39→40 (+1) | no |

The two improved eventLookup questions move the right way:
- "…investment for a competition four weeks ago" 0/4 → 2/4
- "What charity event did I participate in a month ago?" 3/4 → 4/4

Both are exactly the "locate the event at a time anchor" pattern the
date-window was built for; zero eventLookup questions regressed.

## Why ACCEPT despite sub-noise-floor magnitude

The +3 (≈ +0.75/run) is below the 3-question arm-internal noise floor, so it
cannot pass a significance test. It is kept anyway because:

1. **Direction is correct** — it mirrors Hindsight's deterministic time
   parsing (resolve the qualifier outside the LLM, hand it a concrete window),
   which is the mechanism behind Hindsight's +6.3pp TR lead over cortex.
2. **Zero downside** — 0 eventLookup regressions, all other capabilities n.s.,
   pure-function + prompt constraint with no turn deletion.
3. **It is the first brick** of time-aware retrieval, not the whole wall.
   Hindsight's full lead needs fact-level occurrence intervals and a
   date-range retrieval channel, which this does not yet build.

## Honest scope

This confirms the prior warning: a single deterministic patch yields a small,
mechanism-scoped gain that overall accuracy cannot resolve. The remaining TR
gap to Hindsight is a *systematic* retrieval-architecture upgrade, not one
more prompt fix.
