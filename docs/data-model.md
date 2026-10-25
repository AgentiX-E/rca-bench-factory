# Data model — the Intermediate Representation (IR)

The IR is the canonical form every source is transformed into and every exporter is
generated from. Version is tracked by `IR_VERSION` (currently `2.0`); any breaking
change bumps it.

## Two hard invariants

Enforced by `zod` schemas and type guards, not by convention:

1. **Reference integrity** — every entity reference (`entityRef`, `fromEntityId`,
   `rootCauseEntityId`, …) MUST resolve against the `EntityGraph`.
2. **Provenance safety** — a field whose `provenance.source === 'inferred'` MUST NOT
   back a ground-truth key field (root cause entity, injection time, causal chain).

## Layer 1 — `TelemetrySignal`

A single observed fact. `signal` must equal `payload.kind` (checked in the schema).

```ts
interface TelemetrySignal {
  irVersion: string;
  resource: { 'service.name': string; [k: string]: string | undefined };
  timestamp: string;          // canonical UTC ISO-8601
  rawOffsetMinutes?: number;  // offset of the source value, minutes east of UTC
  signal: SignalKind;         // 'metric' | 'log' | 'trace' | 'event' | 'alert' | 'profile'
  payload: SignalPayload;
  provenance?: Record<string, FieldProvenance>; // per-field origin tracking
}
```

`SignalPayload` is a discriminated union over the six signal kinds (`metric`, `log`,
`trace`, `event`, `alert`, `profile`), each carrying only the fields that kind needs.

### Enumerated payload vocabularies

Two payload fields are closed sets, and both are **declared once** — as a tuple in
`ir/types.ts`, with the type derived from it. Anything that admits a value (the
`source` and `ingest` file readers) reads the same tuple, so the union and the
admission list cannot disagree. Each row names its tuple, and
`scripts/check-data-model-vocabularies.mjs` compares the row against that tuple in
both directions and in order.

| Field | Tuple | Values |
|---|---|---|
| `LogPayload.severityText` | `LOG_SEVERITIES` | `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL` |
| `TracePayload.status` | `SPAN_STATUSES` | `OK`, `ERROR`, `UNSET` |
| `EvidenceCheckpoint.signalKind` | `CHECKPOINT_REFERENCES` | `series`, `derived`, `configuration`, `log` |

## Layer 2 — `EntityGraph`

The topology. `Entity.id` is globally unique as `${kind}:${namespace}/${name}`.
Aliases are merged with union-find over `same_as` edges.

```ts
interface Entity { entityId: string; kind: EntityKind; name: string; aliases: string[]; }
interface EntityEdge { from: string; to: string; relation: 'contains'|'hosts'|'calls'|'same_as'; }
interface EntityGraph { entities: Entity[]; edges: EntityEdge[]; }
```

`EntityKind` is declared once, as a tuple: `service`, `pod`, `node`, `container`,
`db`, `mq`, `host`, `cluster`, `external`. Formats that accept only some of them
(AIOps2025 takes the `service` / `pod` / `node` layers) narrow that tuple by
filtering it, so dropping a kind from the IR narrows the subset too rather than
leaving a stale list behind.

## Layer 3 — `FaultCase`

One failure plus everything a benchmark needs to evaluate it.

```ts
interface FaultCase {
  caseId: string;
  system: string;
  environment: { system: string; version?: string; deployRef?: string; checksums?: Record<string,string> };
  injectTime: string;                 // canonical UTC ISO-8601 onset
  window: { start: string; end: string };
  fault: { type: string; category: FaultCategory; injectionMethod?: ...; parameters?: ... };
  groundTruth: GroundTruth;
  query?: string;                     // natural-language task description
  difficulty?: 'L1'|'L2'|'L3'|'L4';
  quality?: QualityGateReport;
  answerKeyIsolated?: boolean;        // true when answer key is stored separately
}
```

`GroundTruth` carries the answer key: `rootCauseEntityId`, `rootCauseComponent`,
`rootCauseReason`, optional `rootCauseIndicators`, a step-wise `causalChain`
(`CausalStep[]`), `evidenceCheckpoints` (`EvidenceCheckpoint[]`) and `remediation`.

### `causalChain` — a numbered run of propagation

A chain is a **run**, and G2 holds three things that follow from the word:

| rule | code | what it refuses |
| --- | --- | --- |
| the steps are numbered `1..n` | `CAUSAL_STEPS_NOT_NUMBERED` | a chain numbered 2, 3, which sorts into a sequence and therefore looks ordered while saying nothing about its order |
| each step starts where the last ended | `CAUSAL_CHAIN_BREAK` | two claims presented as a sequence |
| no entity is visited twice | `CAUSAL_CHAIN_REVISITS` | `a -> b -> a`, which is connected at every hop and asserts that the consequence caused its own cause |

A **self-hop is allowed** (`a -> a`) and is collapsed rather than refused: it states that an entity
amplified its own condition -- a saturated thread pool whose retries deepen the saturation -- which is
a claim about one component rather than a loop through two. What a chain never is is a place to record
a control: "the scheduler dispatched on time" belongs in `evidenceCheckpoints`, and writing it as a
second hop is how a chain becomes a loop (finding 253).

`FaultCategory` is declared once, as a tuple in this order: `resource`, `network`,
`runtime`, `middleware`, `code`, `config`, `dependency`, `unknown`. `unknown` is a
member of the contract, not a fallback: an injector the taxonomy does not know maps
to it rather than to a guessed category.

### `EvidenceCheckpoint` — what a checkpoint's reference is

```ts
interface EvidenceCheckpoint {
  checkpointId: string;
  entityRef: string;                  // must resolve against the EntityGraph
  signalRef?: string;                 // the series, the log line's id, or the configuration key
  signalKind?: CheckpointReference;    // absent means 'series'
  expression?: string;                // present exactly when signalKind is 'derived'
  comparator: Comparator;
  value: number | string;
  unit?: string;                      // required whenever value is numeric
  description: string;
}
```

`signalKind` is a published vocabulary (`CHECKPOINT_REFERENCES`) because one optional
string was carrying four different kinds of reference and nothing resolved it: of the
eleven checkpoints the corpus held at the time, eight named a series that did not
exist. Each kind has the rule that can actually be applied to it -- a series reference
must resolve to a declared series whose unit agrees and whose post value satisfies the
assertion, a `log` reference must name a declared line `id`, a `derived` one carries an
`expression` over the readings it names, and a `configuration` reference must name a
key of the case's own `fault.parameters` and agree with what that key holds.

### `fault.parameters` — the facts a checkpoint can cite

`fault.parameters` is the injector's record, open by design: a `container`, a
`failureShare`, a CPU limit. A value may be a bare number or string, or a **quantity**
`{ "value": 500, "unit": "mcore" }`, and a unit may only come from `util/unit.ts`.
`readDeclaredQuantity` (`ir/parameters.ts`) decides which of those a value is; a
boolean, an array, a nested object without `value`, a non-finite number or a blank unit
is not a quantity and a checkpoint cannot cite it.

A configuration checkpoint compares against the declaration, so the check is a
comparison rather than a reading of prose:

| the parameter | the checkpoint | result |
| --- | --- | --- |
| `{ "value": 500, "unit": "mcore" }` | `== 500 mcore` | compared as written |
| `{ "value": 500, "unit": "mcore" }` | `== 0.5 core` | converted through the table, then compared |
| `{ "value": 500, "unit": "mcore" }` | no unit | refused -- the parameter has one |
| a bare number | a unit | refused -- nothing in the file could check the unit |
| a string | anything numeric | refused -- an identifier restated is not a fact |

The comparison is exact: both sides are literals a person wrote, so a difference is a
mistake rather than floating-point drift. The `1e-9` tolerance belongs to values the
package *computed*, which is why it lives in `holdsWithTolerance` and not in
`compareExactly`.

### `expression` — the arithmetic a derived checkpoint states

A derived checkpoint's value is computed from one or more series, so it carries an
`expression` **instead of** a `signalRef`. Before this field existed,
`cp-processing-tripled` asserted `== 3` over a series whose post value is `0.06 s`:
the 3 was `0.06 / 0.02`, and the divisor appeared nowhere in the annotation. A guard
could only check that the series existed, so two derived checkpoints could state
different arithmetic over one series and both pass.

```
expression := term (('+' | '-') term)*
term       := unary (('*' | '/') unary)*
unary      := '-' unary | primary
primary    := number | reference | '(' expression ')'
number     := digit+ ('.' digit+)? (('e' | 'E') ('+' | '-')? digit+)?
reference  := identifier '.' point
identifier := [A-Za-z_][A-Za-z0-9_]*
point      := a member of SERIES_POINTS
```

The point a reference may name is a member of `SERIES_POINTS` (`baseline`, `post`), a
tuple in `ir/types.ts`. The parser reads that tuple, so a third point needs an edit in
one place, and the same name then reads the series -- the tuple describes the data as
well as the grammar.
`scripts/check-fault-cases.mjs` evaluates every derived expression with
`fault/expression.ts` and compares the result with the stated `value` and `unit`.

**Units are symbol-exponent pairs, and `+`/`-` convert where the package already can.**
`*` and `/` add and subtract exponents. For `+` and `-` there are three cases: the same
map adds directly; two *atomic* units that `util/unit.ts` calls convertible are
converted -- `900 ms - 0.9 s` is `0 ms`, `50 % + 0.2` is `70 %`; anything else is a
mismatch, and the message names both dimensions when the table knows them (`ms` and
`count`). The result keeps the left operand's unit, which is the spelling the author
wrote first.

`util/unit.ts` is the one authority on units: it holds the factors as exact rationals
per dimension, and it is what G2 asks when it decides whether a checkpoint's unit
exists. The limit that remains is stated rather than discovered: **compound units
compare structurally**, so `MiB/s` and `KiB/s` are different units here even though a
conversion exists, because making a composite dimensional would also decide what it
renders as after an addition. A unit the grammar cannot read is reported as unsupported
rather than treated as dimensionless.

**Comparison is tolerant at `1e-9` relative**, because `0.06 / 0.02` is
`2.9999999999999996` and an exact `==` would reject the annotation that is right. The
tolerance makes a difference inside it *equal* for every comparator, so
`2.9999999999999996 >= 3` holds and `2.9999999999999996 > 3` does not.

**What this still does not prove.** That the expression is the arithmetic the incident
merits: `post / baseline` and `post * 3 / baseline` over different readings both
compute, and only the annotation says which one describes the fault. What it does
prove is that the number beside the annotation is the number the annotation's own
arithmetic produces from the readings it names -- which is what "the value is derived"
has to mean if it is to mean anything.


### `*.signals.json` — the telemetry a case declares

A case's telemetry is *declared*, not captured: `origin` says which (`derived` today; `captured` is
accepted and unused), and the samples are constructed from the declaration by
`fault/derived-telemetry.ts`. The split between `body` and `quote` is the same one the four layers
use -- `quote` is the verbatim fragment of the incident text and `body` is the reconstruction -- and
the guard refuses a quote the text does not contain.

| block | fields | expanded into |
| --- | --- | --- |
| `series[]` | `service`, `metric`, `unit`, `baseline`, `post`, `derivation`, `quote`, `why` | metric signals: eight samples per side of the onset, spread across that side's own span of the window |
| `logs[]` | `service`, `id`, `body`, `severity`, `quote`, `why` | log signals at onset + 30s, 150s, 270s |
| `traces[]` | `service`, `spanName`, `durationMs`, `parent`, `quote`, `why` | trace signals at onset + 10s, with span ids derived from `sha256(caseId)` |

`derivation` is a closed vocabulary in `ir` terms -- `step` (a level change, the default), `counter`
(an accumulation whose pre-window is flat at `baseline` and whose last sample is exactly `post`), and
`spike` (one sample at `post`, then `baseline`). A counter's pre-window is flat because the
declaration says what the counter had accumulated by the start of the window; a value that rises
before the fault is a claim the file does not make.

### A reading is a measurement, and a measurement stays inside its unit

`baseline` and `post` are what the annotation says the reading was; the samples are what an exporter
would have written down. Both have to be values their unit admits, and `util/unit.ts` is the one place
that says what those are: `measurementBounds(unit)` returns `{ min, max }` for a unit it knows and
`undefined` for one it does not.

| unit | range | why |
| --- | --- | --- |
| `1` | `[0, 1]` | a share is a fraction of a whole |
| `%` | `[0, 100]` | the same dimension, a different scale -- the ceiling is per unit, not per dimension |
| `ms`, `s`, `count`, `By`, `rps`, `core`, `mcore` | `[0, ∞)` | every unit here counts something, and none of them is signed |

Two rules follow, and they are different rules:

- **The declaration is refused if it is out of range.** `check-fault-cases` says which point, which
  metric, which unit and what range, because `post: 120` in `%` is not a noisy measurement, it is a
  number no measurement can be.
- **The noise is clamped.** The sampling noise is a fraction of the reading, so a share of exactly 1
  came out as `1.02` -- a 102 % share. At a bound the noise becomes one-sided, which is what a real
  measurement at a ceiling looks like: there is nothing above 100 % to be noisy about. Only noisy
  samples are clamped; a counter's samples are exact totals and clamping them would rewrite the
  declaration's own arithmetic.

## Layer 4 — `QualityGateReport`

The evidence the case is usable. Produced by `runAllGates`.

```ts
interface QualityGateReport {
  caseId: string;
  irVersion: string;
  results: GateResult[];                       // G1…G5
  finalStatus: 'admitted' | 'quarantined' | 'rejected';
  mutationTestPassed?: boolean;                // carried through from the caller-supplied meta; no CLI path sets it
}
```

## Field provenance

Every transform can record where a value came from, making generated rules auditable
and reproducible.

```ts
interface FieldProvenance {
  source: 'direct' | 'derived' | 'inferred' | 'defaulted';
  ruleId?: string;
  modelId?: string;        // LLM model, when rule was generated
  promptVersion?: string;
  confidence?: number;     // 0..1
}
```
