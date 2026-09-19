# Audit report

Findings from the scoring-path and OTLP-ingest audits, with the measurement that
established each one. Every entry follows the same shape: the defect, the command
that demonstrated it, the observed number, the fix, and the guard that now fails
without the fix.

A finding is only listed here after being reproduced locally. A finding that only
appeared in a review, without a failing measurement, is not a finding.

## Scope

Two passes so far:

- **Pass 1** — `packages/core/src/score/`: the official-metric scoring path. This
  is the code that decides whether an export is scorable and what number it
  earns, so a defect here silently mislabels a dataset rather than crashing.
- **Pass 2** — `packages/core/src/ingest/otlp.ts`: the OTLP JSON ingest. It is the
  largest under-verified surface in the package (403 source lines, one test file)
  and the main real-world entry point for exporter output, so a defect here
  distorts every downstream number.

## Summary

### Pass 1 — scoring path

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 1 | The official-metric regression graded its own answer key | 4 of 4 corruptions silent | fixed |
| 2 | `rateOf` scored an empty denominator as a perfect match | `{"process":1,"chainNodeMatch":1}` → 100 | fixed |
| 3 | `checksumRate` divided by the anchor set, not the export | 1 anchor, 22 files → `score: 100` | fixed |
| 4 | `aggregateFor` had no branch for `openrca-2.0` | `final: 0` beside `accuracy: 0.75` | fixed |
| 5 | AIOps2025 `explainability` scored an empty corpus 1 | empty export → `final: 10` | fixed |
| 6 | A vacuous structure report earned half the score | empty export → `score: 15` | fixed |

Finding 6 was not in the original audit. It surfaced while building the guard for
finding 2 and is recorded because it is the same error one level up.

### Pass 2 — OTLP ingest

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 7 | `asInt: 42` (numeric form) lost the data point | legal document → 1 quarantine, 0 signals | fixed |
| 8 | Nanoseconds scaled by the float `1e-6` | 1 ms span → `0.999755859375` ms | fixed |
| 9 | Span status delivered by enum name was dropped in silence | error span → no `status`, no quarantine | fixed |
| 10 | `severityText: ''` quarantined as an invalid severity | 1 signal → 1 quarantine entry | fixed |
| 11 | A sub-millisecond inverted span truncated to a legal 0 ms | `-1 ns` span → `durationMs: 0` | fixed |

Finding 11 surfaced while building the guard for finding 8: once durations were
exact, the negativity check was revealed to be reading the truncated value. It is
recorded separately because the fix is a different one.

## 1 — The regression graded its own answer key

`runOfficialRegression` built its predictions with
`groundTruth.map(oraclePrediction)` instead of reading the submission the export
publishes. `readOfficialSubmission` was exported, tested, and never called on
this path.

The consequence is that the check compared the answer key against itself. A
`record.csv` that had been corrupted or deleted still reported `passed`. Four
injections — wrong component, wrong reason, wrong datetime, deleted submission —
were all silent.

**Fix**: read `readOfficialSubmission(target, files)`, the same artefact an
external evaluator consumes.

**Guard**: `test/official-submission.test.ts` corrupts each of the four and
asserts the regression fails, plus a case-for-case agreement check against
`scoreOfficial`. Injecting the old line back fails 5 tests.

## 2 — An empty denominator scored as a perfect match

```ts
function rateOf(predicted, expected) {
  if (expected.length === 0) return 1;   // before
  return intersectCount(predicted, expected) / expected.length;
}
```

`1` for an empty `expected` makes "the key asked nothing" and "the prediction
answered everything" the same number. An RCA100 key declaring no chain and no
checkpoint collected the full 0.3 process weight, identically to a key that
declared both and had them matched.

Measured: a case with an empty chain and empty checkpoint list produced
`{"process":1,"chainNodeMatch":1,"checkpointHit":1}` and a headline of 100.

**Fix**: return `undefined`, and let a new `meanOfPresent` average only the terms
that have a denominator. When no term has one the answer is 0, not 1.

**Guard**: `test/official-empty-denominator.test.ts`. Injecting `return 1` back
fails 3 tests.

## 3 — The checksum rate divided by the anchor set

```ts
const total = matched + mismatched.length + missing.length;   // before
```

With `extra` — files the anchors never mention — left out, the numerator and the
denominator were both about anchors, so an unanchored file was neither verified
nor held against the rate. One anchor out of twenty-two produced `score: 100`
beside `passed: false`, which is the worst pair to hand an operator: the number
says the export is perfect, the flag says it is not, and the number is the half
people read.

The existing test asserted `passed` and `extra`, not `score`, which is why it
survived beside its own comment saying the problem must be visible.

**Fix**: add `extra.length` to the denominator. A comparison set is a claim about
the whole export.

**Guard**: `test/score-anchor-denominator.test.ts`, including a monotonicity case
(more unanchored files must lower the score). Injecting the old line fails 2
tests.

## 4 — `openrca-2.0` silently inherited strict accuracy

`aggregateFor` was a chain of `if (target === …)` blocks with nine targets and
six branches. `openrca-2.0` was never named, so it fell through to the generic
strict-accuracy block and reported the share of cases where *every* facet was
reproduced exactly — a different function from the one its own spec advertises
(`matched facets / scored facets`).

The two formulas agree on a perfect export and on an empty one, which is why the
regression never noticed. They part company in between: measured `accuracy: 0.75`
beside `final: 0` for a prediction that reproduced three of the four declared
facets.

**Fix**: name the branch, and end the chain in a `never` guard so a tenth target
stops the build instead of inheriting a formula.

**Guard**: `test/official-aggregate-coverage.test.ts`. Injecting the missing
branch back fails 1 test.

## 5 — An empty AIOps2025 corpus was fully explained

```ts
const explainability = et === 0 ? 1 : em / et;   // before
```

`et` is the total number of evidence points the corpus declares. Answering `1`
when there are none handed an export that declared no evidence at all a free
tenth of the score. Measured: an empty AIOps2025 export scored `final: 10` while
the other eight targets scored 0. It was the only target with a non-zero score on
a nonexistent export.

The other three terms in the same formula already answered 0 with nothing to
average (`la`, `ta`, `eff`), so explainability was the outlier.

**Fix**: `et === 0 ? 0 : em / et`.

**Guard**: `test/official-no-denominator.test.ts` and a corrected assertion in
`test/official.test.ts`. Injecting `? 1` back fails 2 tests.

## 6 — A vacuous structure report earned half the score

Found while building the guard for finding 2. `scoreExport` averages the
structure rate and the checksum rate, and the structure rate was credited
unconditionally. Four of the thirteen OpenRCA checks pass on an empty export
because there is nothing for them to inspect:

- `answer-key-isolated` — "query.csv carries no answer key" holds when there is
  no query.csv;
- `log-header` and `trace-header` — both explicitly accept an absent telemetry
  directory (Telecom ships no logs, so this is deliberate);
- `row-alignment` — zero rows equals zero rows.

That is a structure rate of 0.31, and an empty export reported `score: 15` while
`passed` was correctly `false`.

**Fix**: credit the structure rate only when the structure report passes. The
report's own `passed` flag already answers this correctly; the rate is only
meaningful once the verdict is.

**Guard**: a case in `test/score-anchor-denominator.test.ts` asserting an empty
export scores 0. Injecting the unconditional rate back fails it.

## 7 — A legal integer data point was quarantined as having no value

```ts
const asInt = dp['asInt'];
if (typeof asInt === 'string' && asInt !== '') { ... }   // before
```

`asInt` and `asDouble` are both numbers on the wire. The OTLP JSON mapping
documents int64 as a string so a 64-bit value survives a language with no such
integer, but protojson — which is what most exporters actually use — also admits
the numeric form. A document carrying `asInt: 42` is a legal document.

Measured: that document produced `signals: []` and one quarantine,

```json
{ "index": 1, "reason": "data point has no numeric value (asDouble/asInt)",
  "record": "{\"timeUnixNano\":\"1735689600000000000\",\"asInt\":42}" }
```

That is a quarantine reason that contradicts its own record: the record plainly
contains a numeric value.

**Fix**: accept a safe integer in either form; the two encodings now agree.

**Guard**: `test/otlp-fidelity.test.ts`, plus a case that still rejects a
non-numeric `asInt` and a non-finite `asDouble` so the widening did not become a
hole. Injecting the string-only reader back fails 1 test.

## 8 — Nanoseconds were scaled by a float

```ts
const n = Number(raw);
return Number.isFinite(n) ? n * 1e-6 : undefined;   // before
```

`n * 1e-6` is a float multiply, and at nanosecond magnitudes it does not agree
with exact integer division. Measured over 4000 consecutive millisecond pairs:
**2500 disagreed**, worst case `1.000244140625` reported for a span that was
exactly 1 ms long. Individually:

| true duration | reported |
| --- | --- |
| 1 ms | `0.999755859375` |
| 2 ms | `1.999755859375` |
| 17 ms | `16.999755859375` |
| 1001 ms | `1000.999755859375` |

A duration wrong by a fraction of a millisecond, in a benchmark whose whole
purpose is measuring durations. Nothing downstream could flag it: the value is
finite, positive, and plausible.

**Fix**: divide in `BigInt` before narrowing. `Number(raw)` cannot be used first
because it already loses nanoseconds at these magnitudes, so the division has to
happen while the value is still exact.

**Guard**: `test/otlp-fidelity.test.ts` asserts the four exact values above, plus
the 4000-pair sweep. Injecting `n * 1e-6` back fails 4 tests.

## 9 — A span status delivered by enum name was dropped in silence

```ts
if (typeof rawCode === 'number') {           // before
  status = SPAN_STATUS_CODE[rawCode];
  ...
}
```

The OTLP JSON mapping writes enums as their **names**, not their numbers. The
reader matched numbers only, so `{ status: { code: 'STATUS_CODE_ERROR' } }` fell
past the branch entirely: no `status` on the payload and no quarantine entry.

Measured: an error span ingested as a healthy-looking one —

```json
{ "kind": "trace", "traceId": "t1", "spanId": "s1", "spanName": "op",
  "durationMs": 1000 }
```

This is the worst shape a defect can take here. It is silent, and the direction it
fails in is always the same: an error span that loses its status is
indistinguishable from a healthy one, so the corpus looks *better* than it is.
Zero-loss accounting could not catch it, because a dropped field is not a dropped
record.

**Fix**: read both encodings — the enum name and the numeric form, whether the
number arrives as a number or as a string — and quarantine a code that is present
but unreadable, so the two failure modes ("carries none" versus "carries
something we cannot read") stop being the same outcome.

**Guard**: seven cases in `test/otlp-fidelity.test.ts` covering all five
encodings plus an unrecognised name and an unrecognised number. Injecting the
number-only reader back fails 4 tests.

## 10 — An empty severity was reported as an invalid one

```ts
if (rawSeverity !== undefined && severityText === undefined) {   // before
  quarantine.push({ index, reason: `invalid severity '${rawSeverity}'`, ... });
```

`normalizeSeverity` already treats `''` and `undefined` alike and returns
`undefined` for both, but the guard compared the *token* rather than the raw
field. So `severityText: ''` was quarantined as `invalid severity ''`.

Measured: one legal log record became zero signals and one quarantine entry, for a
field the schema calls optional.

An absent severity and an unrecognisable one are different claims about different
documents, and only the second is a data problem. Collapsing them inflates the
quarantine count with records that were never at fault.

**Fix**: compare the raw field, so only a non-empty unreadable spelling is
quarantined.

**Guard**: four cases in `test/otlp-fidelity.test.ts`. Injecting the token
comparison back fails 1 test.

## 11 — A sub-millisecond inverted span truncated to a legal zero

```ts
const durationMs = endMs - startMs;
if (durationMs < 0) { ... }                  // before
```

Once finding 8 made durations exact, both operands were truncated to whole
milliseconds before being compared. A span whose end precedes its start by **one
nanosecond** therefore produced `durationMs === 0` and passed as a legal
zero-length span.

A negative duration is the inverted-timestamp signature of a broken clock — the
one thing this corpus must never contain — and truncation was hiding it for every
inversion smaller than a millisecond.

**Fix**: compare the exact nanosecond instants as well as the truncated
difference. Both checks are kept: the nanosecond comparison is the precise one,
and the millisecond comparison documents the invariant at the unit the IR uses.

**Guard**: a case asserting a `-1 ns` span is quarantined. Injecting the
truncated comparison back fails 1 test.

## Method

Each finding was reproduced before being fixed, by running the affected path
against a fixture and reading the number. Each fix is accompanied by a test that
fails without it: the injection matrix in `test/` reintroduces each defect and
records whether the suite catches it, and negative controls must stay green so
the matrix is not red on everything.

### Reading the numbers instead of assuming them

Pass 2's five defects were found by writing probes against the **shipped build**
before writing any test, and each probe printed its result rather than asserting
it. `asInt: 42`, a 1 ms span, `code: 'STATUS_CODE_ERROR'`, `severityText: ''` and
a `-1 ns` span each went in as a document and came back with an observed value.
The distinction matters: reading `nanoToEpochMs` tells you it multiplies by
`1e-6`; it does not tell you that 2500 of 4000 real millisecond pairs disagree, or
which ones. Only the second fact is actionable.

Two candidate defects from the same reading did **not** survive measurement and
are therefore not listed: `anyValueToString` already handles a numeric
`doubleValue` correctly, and the trace path's canonical timestamp already matched
the metric path's to the millisecond. They are recorded here as deliberate
non-findings, because "I read the code and it looks wrong" is not evidence.

### The instrument needs its own errors tracked

The parser that reads the suite's own counts had two defects of its own, both
fixed: it read `Tests <n> passed` off a fixed shape, which reports 0 on every
failing run because vitest prints `Tests 1 failed | 54 passed`, and it matched
`Test Files 56 passed` first, which reports the file count as the test count.

The injection harness needed the same treatment in this pass: two injections were
first rejected by `tsc` for an unused symbol rather than by a test, which would
have been logged as "caught" while proving nothing about the tests. Both were
rewritten to compile, and re-run so that the **tests** were what failed.
