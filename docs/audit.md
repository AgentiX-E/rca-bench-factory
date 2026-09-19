# Audit report

Findings from the scoring-path, OTLP-ingest and LLM-layer audits, with the
measurement that established each one. Every entry follows the same shape: the
defect, the command that demonstrated it, the observed number, the fix, and the
guard that now fails without the fix.

A finding is only listed here after being reproduced locally. A finding that only
appeared in a review, without a failing measurement, is not a finding.

## Scope

Four passes so far:

- **Pass 1** — `packages/core/src/score/`: the official-metric scoring path. This
  is the code that decides whether an export is scorable and what number it
  earns, so a defect here silently mislabels a dataset rather than crashing.
- **Pass 2** — `packages/core/src/ingest/otlp.ts`: the OTLP JSON ingest. It is the
  largest under-verified surface in the package (403 source lines, one test file)
  and the main real-world entry point for exporter output, so a defect here
  distorts every downstream number.
- **Pass 3** — `packages/core/src/llm/openai-compat.ts` and
  `packages/core/src/fault/importer.ts`: the shared LLM transport and the
  historical-fault importer. Both were at the top of the under-verified list.
- **Pass 4** — `packages/core/src/llm/rulegen.ts` and
  `packages/core/src/llm/anthropic.ts`: the LLM rule-generation core and the
  second transport adapter. With pass 3 this covers the whole `llm/` directory,
  which is where the provider-agnostic abstraction lives and therefore where a
  vendor-shaped assumption costs the most.

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

### Pass 3 — LLM transport and fault importer

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 12 | Only `choices[0]` was read, discarding a usable answer | 2 choices, 2nd usable → threw | fixed |
| 13 | A null choice leaked a raw `TypeError` | `choices: [null]` → `Cannot read properties of null` | fixed |
| 14 | `''` accepted as a completion | empty answer indistinguishable from a real one | fixed |
| 15 | Category read verbatim against a case-sensitive vocabulary | `NETWORK` → parsed `ok`, then `valid: false` | fixed |

Finding 15 is the only one in this report where the defect spans **two functions**
rather than sitting inside one: the prompt never stated the rule the parser
enforced. Reading either file alone shows nothing wrong.

### Pass 4 — LLM rule generation and the Anthropic adapter

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 16 | A layout field outside the contract was dropped, not rejected | `{"timstamp": "time"}` → parsed `ok: true` | fixed |
| 17 | A cross-kind field name passed the membership check | `spanName` in a metric layout → accepted | fixed |
| 18 | `semanticType` was cast, not checked against its enum | `"not-a-real-semantic-type"` → reached the IR | fixed |
| 19 | An empty sample set validated as a pass | `validate(layout, 'metric', [])` → `valid: true` | fixed |
| 20 | The prompt never named the semantic-type vocabulary | prompt printed the field, not its values | fixed |
| 21 | Only `content[0]` was read | leading `tool_use` block → threw, answer discarded | fixed |
| 22 | A completion split across text blocks was truncated | 2 text blocks → returned the first only | fixed |
| 23 | A null content block leaked a raw `TypeError` | `{"content":[null]}` → `Cannot read properties of null` | fixed |

Findings 17 and 20 surfaced while building the guard for finding 16, and 22 while
building it for 21. They are listed separately because each has its own fix: the
membership check had to become per-kind, the prompt had to name a vocabulary it
had only ever named as a field, and reading every block is a different change from
reading more than one.

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

## 12 — Only the first choice was ever read

`openai-compat.ts` had **no test file at all** — 0 test references for 98 source
lines — while being the shared transport under both the DeepSeek and OpenAI
adapters, so every LLM-dependent path in the factory ran through it.

```ts
const first = choices[0] as Record<string, unknown>;
const message = first.message as Record<string, unknown> | undefined;
const content = message?.content;
if (typeof content !== 'string') {
  throw new Error(`${name} response choice has no string content`);
}
return content;
```

An OpenAI-compatible server returns a leading choice that carries no text for a
refusal or a content-filtered turn, with a usable completion behind it. Reading
only `choices[0]` discarded that answer and reported the whole response as
unusable.

Measured: two choices, the first with `content: null`, the second with
`"second"`:

```
THREW: Error: X response choice has no string content
```

**Fix**: inspect every choice in order; the first usable text wins.

**Guard**: `test/openai-compat.test.ts` (18 tests). Injecting the first-choice-only
read back fails 3 tests.

## 13 — A null choice leaked a raw `TypeError`

The same two lines dereferenced `choices[0]` without checking it is an object.
Every other malformed shape in this parser produces a named message —
`is not valid JSON`, `is not a JSON object`, `has no choices` — but a `null`
element escaped as an internal error:

```
THREW: TypeError: Cannot read properties of null (reading 'message')
```

Measured for `{"choices":[null]}`. The failure is not that it threw; it is *what*
it threw. A `TypeError` names a JavaScript operation, not a response shape, so an
operator reading it learns nothing about what the server sent.

**Fix**: check the element is an object before touching it, at every position, and
report the position.

**Guard**: two cases asserting the named message and, explicitly, that a
`TypeError` is **not** what comes out. Injecting the unchecked dereference back
fails 2 tests.

## 14 — `''` was accepted as a completion

The declared return type is `string`, and a choice whose content is the empty
string satisfied `typeof content === 'string'`. Measured: `content: ''` returned
`''` as a successful completion, so no caller could tell an empty answer from a
real one — and the surrounding comment claims the function throws "so a malformed
or empty response surfaces as an explicit error", which it did not.

**Fix**: the empty string is not usable text; a whitespace-only completion still
is, because that is a real answer a model can give.

**Guard**: two cases, including the whitespace case that must **keep** working.
Injecting `typeof content === 'string'` back fails 1 test.

## 15 — The prompt never stated the rule the parser enforced

This one is not inside a function. It lives between two of them.

`buildFaultExtractionPrompt` advertised the category vocabulary as a bare field
placeholder:

```
"category": "resource | network | runtime | middleware | code | config | dependency"
```

Nothing in the prompt says the value must be **one of** that list, and nothing
anywhere says the match is case- or space-sensitive. `parseFaultExtractionResponse`
then stored whatever string came back, and `parseFaultSpec` matches the category
by exact value.

Measured end to end, for an incident the prompt itself was built from:

```
parse    -> { ok: true,  extracted: { category: "NETWORK" } }
validate -> { valid: false, reasons: ["invalid fault category 'NETWORK'"] }
```

So a correctly-extracted fault was rejected, and the H3 reviewer was told the
**category** was wrong when it was the **casing** that was wrong — a diagnosis
pointing at the model's judgement instead of at the contract.

**Fix**, in both halves, because either alone would be a half-measure:

- the prompt now says `"one of: …"` and states that the match is
  case-insensitive and that any other value is rejected;
- the parser trims and case-folds before the vocabulary check, and rejects an
  out-of-vocabulary value **at the point it was read**, naming the offending
  string, instead of deferring to a validator that reports it as a category error.

A synonym such as `net` is still rejected. Deciding that `net` means `network` is
a judgement, not a normalisation, and H3 is where that judgement belongs.

**Guard**: `test/importer-contract.test.ts` (12 tests), including the full
ticket-text → prompt → parse → validate pipeline as one assertion. Injecting the
verbatim read back fails 3 tests; dropping the prompt's rule sentence fails 1;
removing the early rejection fails 2.

## 16 — A layout field outside the contract was dropped, not rejected

```ts
if (typeof value !== 'string') { ... }
if (key === 'semanticType') { ... } else { (layoutFields as ...)[key] = value; }
// no check that `key` is an IR field at all
```

`parseRulegenResponse` copied every string-valued key into the layout and never
asked whether the name was one the IR declares. A model that answered `timstamp`
— `timestamp` with the `e` lost — therefore produced a layout that was silently
missing `timestamp` while the parser reported success:

```json
{"ok":true,"generated":{"layout":{"timstamp":"time","metricName":"kpi","metricValue":"val"},"confidence":0.9,"rationale":"typo"}}
```

The failure then appears one stage later, as `missing required field 'timestamp'`.
The parser accepted the layout, and the validator blamed the answer for a missing
field when the actual event was a rejected name — the same shape as finding 15,
where the diagnosis pointed at the model's judgement instead of at the contract.

**Fix**: reject any key that is not in this signal kind's field list, naming it and
listing what was expected. A per-kind check, not a global one (finding 17).

**Guard**: `test/rulegen.test.ts`. Injecting the `continue` back fails 6 tests.

## 17 — A cross-kind field name passed the membership check

Found while building the guard for finding 16. The obvious guard — "is this key a
field somewhere in the IR?" — accepts `spanName` in a *metric* layout, because
`spanName` is a real trace field. It would have left the same typo-blindness in
place for every name a model can borrow across kinds, and the metric rules are
where a borrowed trace field is most likely to appear, since a model mapping
metrics has just been shown the whole contract family.

**Fix**: check against `IR_FIELDS[signalKind]`, the same list the prompt prints for
that kind, so the advertised contract and the enforced one are one object.

**Guard**: two cases, a trace field in a metric layout and a metric field in a log
layout. Injecting the union-of-all-kinds check back fails 3 tests.

## 18 — `semanticType` was cast, not checked

```ts
layoutFields.semanticType = value as MetricPayload['semanticType'];   // before
```

`semanticType` is an enum, not a source column name, and the only validation was a
TypeScript cast — which is erased at runtime and, in a function whose input arrived
as JSON from a model, guarantees nothing. Measured:
`"semanticType":"not-a-real-semantic-type"` parsed as `ok: true` and travelled into
the IR, where the schema rejected the **whole signal**. One hallucinated enum
member therefore discarded an otherwise valid record, and the reason named the
payload rather than the field.

The enum was an inline union inside `MetricPayload`, which is why no consumer could
read it at runtime. That is what made the cast the only option available.

**Fix**: `METRIC_SEMANTIC_TYPES` moves into `ir/types.ts` as an `as const` tuple
with the type derived from it, matching `LOG_SEVERITIES`, `SPAN_STATUSES`,
`SIGNAL_KINDS` and `FAULT_CATEGORIES`; the parser checks membership by name and
rejects at the point it was read. An empty string is rejected too — it is not a
member, and defaulting it would hide a missing field behind a plausible one.

**Guard**: five cases covering the invalid value, the empty value, all six legal
values, and the cross-kind case. Injecting the cast back fails 2 tests.

## 19 — An empty sample set validated as a pass

```ts
return { valid: reasons.length === 0, reasons };   // before
```

The replay over the source samples is the entire check
`validateGeneratedLayout` performs. With `samples` empty the loop body never runs,
no reason is pushed, and the function returns `{"valid":true}` — success reported
for having had no input, which is the one result a guard must never produce.

This is reachable in practice: the caller samples a source before mapping it, and a
source whose sample window contains only blank rows yields no samples. The
signature then reads as "this layout was verified", and the layout has been
verified against nothing.

**Fix**: report the missing evidence as a reason. It is pushed **after** the
structural reasons, so a caller iterating on a layout is told what is wrong with
the layout first and only then told that the evidence was absent.

**Guard**: three cases, including one asserting the structural reasons survive
alongside the new one. Injecting the unconditional return back fails 3 tests.

## 20 — The prompt never named the semantic-type vocabulary

Found while building the guard for finding 18. The prompt printed the field list,
and `semanticType` was in it, but the prompt never said the field's value had to
come from a fixed set. So the one field the parser cannot accept by name was also
the one field the prompt described only as a name:

```
IR fields for signal kind 'metric': timestamp, service, …, metricUnit, semanticType
```

A model asked to fill `semanticType` from that line has to guess whether it wants a
column or a class, and if it guesses class, which classes exist. The prompt is the
only place that can answer either question, and it answered neither.

**Fix**: print the vocabulary beside the field, and only for signal kinds that
have the field — asking a log layout for a semantic type would be a second defect
in the same sentence.

**Guard**: four cases, including one asserting the vocabulary does **not** appear
for `log`. Injecting the sentence's removal fails 1 test; dropping the closed-list
sentence fails 1 more.

## 21 — Only `content[0]` was read

```ts
const first = content[0] as Record<string, unknown>;
const text = first.type === 'text' ? first.text : undefined;
if (typeof text !== 'string') { throw ... }                    // before
```

Anthropic returns `content` as an array of typed blocks, and the completion is the
concatenation of the `text` blocks. Reading only the first threw on any response
that led with something else. Measured, for a leading `tool_use` block with a
usable text block behind it:

```
THREW: Error: Anthropic response content has no string text
```

A leading `tool_use` or `thinking` block is not an edge case: it is what a server
returns for a turn that used a tool or produced reasoning, and the answer was
present in both.

**Fix**: concatenate every text block. A non-text block is **skipped**, not
rejected — it is a legitimate part of a response that simply carries no completion —
and a text block with no usable string is skipped for the same reason.

**Guard**: six cases across `test/anthropic.test.ts` (27 tests in the file).
Injecting the first-block-only read back fails 6 tests.

## 22 — A completion split across blocks was truncated

Found while building the guard for finding 21, and a separate defect with a
separate fix: reading every block only helps if every block's text is used.

Measured: `[{type:'text',text:'first'},{type:'text',text:'second'}]` returned
`'first'`.

For this module the consequence is worse than a short string. Every prompt it
serves asks for JSON, so a truncated completion is not obviously truncated — it is
a body that fails to parse, and the caller reports **"malformed JSON"**, blaming
the model's formatting for a parser that discarded half its output. A diagnosis
naming the wrong component is what makes this worth its own entry.

**Fix**: join the parts. A whitespace-only result is not a completion, because a
caller cannot act on it; surrounding whitespace on a non-blank completion is
preserved, because trimming it would edit the model's answer.

**Guard**: three cases (the join, the blank rejection, the preserved whitespace).
Injecting the first-block-only read fails 6 tests; injecting the removal of the
blank check fails 1.

## 23 — A null content block leaked a raw `TypeError`

`content[0]` was dereferenced without a shape check. Every other malformed shape in
this parser gets a named message — `is not valid JSON`, `is not a JSON object`,
`has no content`, `content has no string text` — but a `null` element escaped as an
internal error:

```
THREW: TypeError: Cannot read properties of null (reading 'type')
```

Measured for `{"content":[null]}`. The defect is not that it threw; it is *what* it
threw. A `TypeError` names a JavaScript operation rather than a response shape, so
an operator reading it learns nothing about which server sent what.

A non-array `content` field was also collapsed into the empty-array case, so
`{"content":"a plain string"}` and `{"content":[]}` produced the same message. They
are different claims about different responses.

**Fix**: check each block is an object and report its **position**; separate the
non-array case from the empty case.

**Guard**: four cases, one of which asserts explicitly that the thrown error is not
a `TypeError`. Injecting the unchecked dereference back fails 2 tests; collapsing
the non-array case back fails 1.

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

Pass 3 hit this a third time — the "drop the choice-shape guard" injection was
again rejected by `tsc` — and it was caught only because the rule from pass 2 was
already written down. **This is why the rule is a rule and not a note:** an
injection that never reaches the test run has not been tested, and a matrix that
counts it as caught is measuring the compiler. Across the first three passes, 4 of
26 injections were mis-rejected this way; all four were rewritten and re-run, and
on re-run every one was caught by the tests instead.

Pass 4 is the first pass with **no** mis-rejection: all 10 real injections compiled
and reached the test run, and all 10 were caught by tests. The reason is not that
this pass wrote better injections — it is that the rule was written down in pass 2
and applied before the matrix ran, so the `void symbol;` form was used from the
start wherever a guard was being removed rather than replaced. A rule that gets
applied is worth more than one that gets rediscovered.

### What fixed the long-standing test wording

Pass 3 changed a function that two legacy tests in `deepseek.test.ts` already
covered:

```ts
expect(() => parseDeepSeekResponse('{"choices":[{"message":{"role":"assistant"}}]}')).toThrow(/content/i);
```

The rewording to `no usable completion text` broke both. Rather than edit
assertions to chase the implementation, the parser keeps its existing wording for
the single-choice case: with one choice a count adds nothing to the diagnosis, and
the long-standing wording is what operators already grep for. The ranked message
appears only when position is genuinely ambiguous. **Two assertions that were
there first and pass on their own merits are not the thing to change.**

### The assertion that pinned the defect

Pass 4 met the mirror image of that case, and it is worth recording separately
because the right answer is the opposite one:

```ts
it('accepts an empty sample set for a structurally complete layout', () => {
  const result = validateGeneratedLayout(metricLayout, 'metric', []);
  expect(result.valid).toBe(true);   // this is finding 19
});
```

That assertion was not there first and passing on its own merits; it was there
first and **passing because it encoded the bug**. It is the exact behaviour finding
19 describes, written down as the expected result. It was corrected rather than
deleted — the case stays covered, and the corrected expectation is the one the new
suite states in full — with both the change and the reason recorded in the test
file, because a future reader diffing that line deserves to know which of the two
rules applied.

The distinction between pass 3's case and pass 4's is not "old assertion versus new
one". It is whether the assertion is *right*: pass 3's two tests were asserting
something true that the implementation had stopped honouring, and pass 4's test was
asserting something false that the implementation happened to do. Only the second
should be changed, and only the first is evidence of a regression.
