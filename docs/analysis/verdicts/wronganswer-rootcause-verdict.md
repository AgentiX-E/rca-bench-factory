# Wrong-Answer Root-Cause Analysis — Verdict

**Date:** 2026-09-06
**Data:** 2 diagnostic runs on master (`bc687b9`), `questionCount = 500`
**Method:** per-question `correct` flag (new in `bc687b9`), no re-judging needed

---

## 1. The observability fix works

Every MR and single-session diagnostic record now carries a `correct` flag, so a
wrong answer is identified directly instead of being inferred from aggregate
scores. Verified on both runs.

## 2. My "eval gap" hypothesis is DISPROVEN

I had hypothesized that a large share of "wrong" answers were actually
semantically correct but scored wrong by the evaluator (format/verbatim
mismatch). The per-question `correct` flag shows this is **false** — the LLM
judge works:

| Predicted | Gold | judge verdict |
| --- | --- | --- |
| `The Nightingale` | `'The Nightingale' by Kristin Hannah` | **correct** |
| `Episcopal Church` | `the Episcopal Church` | **correct** |
| `JetBlue` | `American Airlines` | **wrong** (genuine) |

The earlier "format mismatch" signal was an artifact of my own crude
exact/first-digit classifier, which does not replicate the judge's semantic
equivalence. There is **no material evaluation bug** to fix.

## 3. Wrong answers are genuine model errors

Per-capability genuine wrong answers (2 runs, distinct questions):

| Capability | wrong | dominant sub-category |
| --- | --- | --- |
| TR | ~43 | **duration arithmetic (25)**, order-of-events (16), entity (2) |
| MR | ~27 | counting / arithmetic |
| KU | 23 | — |
| IE | 5 | — |

## 4. The biggest fixable target: TR duration arithmetic is DETERMINISTIC

The TR duration errors reproduce identically across runs, so they come from the
deterministic temporal engine, not LLM sampling:

| Question | predicted | gold | note |
| --- | --- | --- | --- |
| days passed since car feedback | `37` | `38 days` (39 inclusive) | off-by-one |
| days ago attended baking class | `25` | `21 days` (22 inclusive) | off-by-4 |
| weeks since flu recovery | `12` | `15` | gold unreachable (prior analysis) |

Two of these (`37` vs `38`, `25` vs `21`) are deterministic date-arithmetic
errors in `computeTemporalAnswer` — a classic inclusive/exclusive day-count or
wrong-anchor-date bug. The flu question (`12` vs `15`) is a known gold
unreachability, not an engine bug.

---

## 5. Recommendation (next iteration)

**P0 — audit and fix the deterministic TR duration arithmetic.**

- Deep-audit `computeTemporalAnswer` against the `21`/`25`/`37`/`38` cases to
  isolate the off-by-one and anchor-date root cause.
- Fix with TDD: unit tests on the engine for inclusive/exclusive day counting
  and elapsed-week/month arithmetic, against the gold values.
- Acceptance: ≥95% coverage, `pnpm check` green, then a mechanism A/B on the TR
  duration questions (deterministic, so a single arm suffices — no control
  needed).

This is the largest **deterministic** (hence TDD-able and non-stochastic) error
pool remaining, and it targets the temporal engine's core arithmetic rather than
LLM behavior.
