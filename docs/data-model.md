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
| `EntityEdge.relation` | `EDGE_RELATIONS` | `contains`, `hosts`, `calls`, `same_as`, `routes` |

## Layer 2 — `EntityGraph`

The topology. `Entity.id` is globally unique as `${kind}:${namespace}/${name}`.
Aliases are merged with union-find over `same_as` edges.

```ts
interface Entity { entityId: string; kind: EntityKind; name: string; aliases: string[]; }
interface EntityEdge { from: string; to: string; relation: EdgeRelation; }
interface EntityGraph { entities: Entity[]; edges: EntityEdge[]; }
```

`routes` is the newest member and the only one that describes a *path* rather than a containment or
a call: `node:edge-router-2 --routes--> pod:catalog-service-0` says traffic for that pod passes
through that router. It exists because a network fault's evidence had an owner and the graph had no
word for it: the MTU case cites the path's MTU, and without `routes` the device that reports it could
not be an entity at all -- an edge would have had to say `calls`, which is a lie about direction, or
`hosts`, which is a lie about containment (finding 260).

`EntityKind` is declared once, as a tuple: `service`, `pod`, `node`, `container`,
`db`, `mq`, `host`, `cluster`, `external`. Formats that accept only some of them
(AIOps2025 takes the `service` / `pod` / `node` layers) narrow that tuple by
filtering it, so dropping a kind from the IR narrows the subset too rather than
leaving a stale list behind.

#### Which side of an edge each relation admits

Four of the five relations name a direction, and the graph accepted them in either
one until `RELATION_SIDES` (`entity/graph.ts`) said otherwise. `findDanglingEdgeRefs`
asks whether an edge's ends exist, `findInvalidRelations` asks whether the word is
published, and neither asks whether the word can mean what the edge says.

| Relation | Source kinds | Target kinds |
|---|---|---|
| `contains` | `cluster`, `node`, `host`, `service`, `pod` | `pod`, `container` |
| `hosts` | `cluster`, `node`, `host` | `service`, `pod`, `container`, `db`, `mq`, `external` |
| `calls` | `service`, `external`, `container`, `host` | `service`, `external`, `db`, `mq` |
| `routes` | `cluster`, `node`, `host`, `external`, `service` | `service`, `pod`, `container`, `external` |
| `same_as` | — | — (identity is symmetric) |

Two limits are worth stating where a consumer reads them, because a dataset's
topology is what an evaluator ranks a root cause against:

- **A kind pair cannot catch a reversal between two entities of one kind.** `service A
  --calls--> service B` and `service B --calls--> service A` are both admitted, and the
  direction of a call is a fact about a deployment rather than about kinds. The table
  refuses the reversals that are structurally impossible and says nothing about the
  rest.
- **An edge from an entity to itself is refused by the same check**, because
  `pod --contains--> pod` and `service --calls--> service` pass a kind-pair table
  unharmed and mean nothing.

A refusal is `IMPLAUSIBLE_EDGE_DIRECTION` or `SELF_EDGE` in G2, and both are
*structural* in `export/guard.ts`: the graph is one system's topology and every case in
the bundle reads it, so no per-case skip repairs it.

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

#### What `difficulty` claims, and what it does not

The field had no definition for as long as it existed: the type was declared here, the projection
onto `easy` / `medium` / `hard` was published in `docs/targets/cloud-opsbench.md`, and nothing said
what separates L2 from L3. The corpus shows what a field like that collects — five labels, two of
them on structurally identical cases with different values.

What exists now is a **floor**, not a rating. `difficultyFloor` (`fault/difficulty.ts`) derives the
lowest level a case's own structure supports:

| causal steps | entity kinds the chain touches | floor |
|---|---|---|
| ≥ 3 | any | `L4` |
| 2 | any | `L3` |
| 1 | ≥ 2 | `L2` |
| 1 | 1 | `L1` |

A declared level **at or above** the floor is accepted; a level **below** it is refused by the corpus
guard, because it is an annotation contradicting the case it annotates. That is monotonicity, which
every definition of difficulty must satisfy and which is the only part derivable from the data.

It is **not** a rating of how hard a case is for a model. That needs per-case accuracy over enough
solvers to separate the levels, and this repository has two local baselines and one configured
provider. Until that exists, a level means "at least this much structure" and nothing more; a case at
its floor may be trivial and a case above it may be easy.

The distribution of levels across a corpus is checked once per corpus (`checkDifficultyDistribution`,
ten graded cases before it says anything). A corpus with no `L4` case reports that fact on every run
rather than failing: no correction to a label can produce a level the corpus's chains cannot reach.
That was true of this corpus for as long as every chain in it was one or two steps, and it stopped
being true the round the corpus's first three-step chains were annotated. Three of its twenty cases
now carry three hops, one of them ending inside the system rather than at a caller, and the share is
met with **exactly one case of margin**: three of thirty -- the size the corpus is committed to
annotating -- is 0.100, which is the floor itself and not above it. The suite holds that number
(`difficulty-floor.test.ts` names all three cases and asserts the share against the committed
denominator as well as against today's count) while the guard keeps printing it rather than gating on
it. A rule that fails on a property no annotation can repair teaches people to skip the line; a rule
nothing asserts is a number that drifts back to zero.

#### Background telemetry, and what "top-K" means

A case's `signals` file carries the series its incident is about, and every number in it quotes a
sentence of the ticket. A ticket names the two components it is about, so a corpus built only from
signals files ranks one to three services per case — and a ranking of two scored at top-3 cannot be
missed. `golden-master/fault-cases/background-telemetry.json` is the other half: one flat
request-rate series per service in the graph, added to every case, so that a case's own anomaly is
one moving series among every quiet neighbour the graph holds.

It is part of the corpus rather than of a case, and it has four rules (`fault/background.ts`):

| rule | why |
|---|---|
| flat, `noise: 'none'` | it asserts that the rest of the system was ordinary, and a jittered flat series would rank the quiet services against each other by floating-point rounding |
| the whole system | an entry the graph lacks is a series attributed to nothing; a service the graph holds and the background omits is a candidate the ranking silently leaves out |
| the case wins on `(service, metric)` | a case whose fault *is* a request-rate collapse has to be able to say so |
| never evidence | a checkpoint that resolves to a background series is refused: the series is in the data and asserts nothing about the incident |

Localisation is reported as two numbers, never one. `topK` is the K the benchmark declares;
`candidateCount` is how many services the ranking held. A case whose ranking is no wider than its K
is refused with `LOCALISATION_UNCONTESTED` rather than counted as a hit — no method can miss a
candidate that sits inside its own output's length. A rank is only a rank if the candidate it names
moved: `locatedRank` reports `null` for a statistic of zero, so a service that was quietly listed is
not a service a method found.

Being *displaced* is likewise four different things (`classifyDisplacement`), and only the first is
evidence that a corpus penalises a magnitude-based method:

| kind | the candidate at rank 1 | counts? |
|---|---|---|
| `strict` | a different component, strictly louder than the answer | **yes** |
| `tie` | a different component with the same statistic, winning on its name | no — a rename flips it |
| `same-component` | an ancestor or descendant of the answer under `contains` / `hosts` | no — the pod under the answer is the answer at another resolution |
| `none` | the answer is at rank 1, or absent from the ranking | no |

`checkDiscrimination` requires at least one `strict` case in the corpus, and the guard prints the tally
of all four.

`GroundTruth` carries the answer key: `rootCauseEntityId`, `rootCauseComponent`,
`rootCauseReason`, optional `rootCauseIndicators`, a step-wise `causalChain`
(`CausalStep[]`), `evidenceCheckpoints` (`EvidenceCheckpoint[]`) and `remediation`.

### `causalChain` — a numbered run of propagation

A chain is a **run**, and G2 holds four things that follow from the word:

| rule | code | what it refuses |
| --- | --- | --- |
| the steps are numbered `1..n` | `CAUSAL_STEPS_NOT_NUMBERED` | a chain numbered 2, 3, which sorts into a sequence and therefore looks ordered while saying nothing about its order |
| each step starts where the last ended | `CAUSAL_CHAIN_BREAK` | two claims presented as a sequence |
| no entity is visited twice | `CAUSAL_CHAIN_REVISITS` | `a -> b -> a`, which is connected at every hop and asserts that the consequence caused its own cause |
| the root cause is one the chain visits | `ROOT_OFF_ITS_CHAIN` | an answer and a propagation that have nothing to do with each other: the entity layer asked only that the root resolve, so before finding 281 a case could name its answer in a component its own chain never reaches |

The root rule is "**visits**", not "starts at": both of the corpus's node-first chains begin at the
actor that acts on the answer rather than at the answer itself, and a rule demanding otherwise would
refuse the two cases that show the shape is deliberate. The comparison is by resolved id, because an
alias and an id name one entity.

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
  signalRef?: string;                 // the metric, the log line's id, or the configuration key;
                                      // with entityRef it is the pair that identifies a series
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

#### A series reference is a pair, and the entity is half of it

A reading is a quantity taken *on* something, so `(entityRef, signalRef)` is what identifies
a series -- the same pair `fault/background.ts` uses to let a case's own declaration win over
the background, and the same pair both localisers key their per-service statistics on. The
guard resolved the metric alone until finding 323: a map keyed on the name, the entity carried
through the schema and never compared. Twelve of the corpus's seventy-three series checkpoints
named an entity that does not carry the reading, and the same code accepted a checkpoint
pointed at anything in the graph.

| the checkpoint's entity | the series' `service` | result |
| --- | --- | --- |
| the same entity | it | resolved, `via: entity` |
| a container whose service carries it | the service | resolved, `via: component` |
| one replica of a service | another replica | **refused**: siblings are not one component |
| an unrelated service | a different one | **refused**: the assertion is about something else |
| a service both halves are inside | two nodes | **refused**: the entity cannot say which half |

Containment rather than equality, because twelve of the corpus's annotations are a container
measurement filed under its service -- the ranking a solver reads is per service, and a rule
that refused them would be refusing the corpus rather than a mistake. `fault/reading-reference.ts`
is the resolver; `describeReadingProblem` gives each of its four refusals its own sentence,
because "not declared", "carried elsewhere" and "two carriers" are three different repairs.

**One metric on two entities is legal.** Two series with the same `(service, metric)` pair are
still refused, and a metric carried by two different entities is not: a partition's two halves
are two readings of one quantity, and a file that could hold only one of them per metric could
not state the case (finding 324). The ambiguity that creates is refused where the entity is
known -- at the checkpoint -- rather than at the file.

#### A log checkpoint asserts a containment, and the body is where it is checked

A log line has no magnitude, no unit and no order, so the only relation a checkpoint can
ask of one is whether it contains a phrase:

| field | for `signalKind: 'log'` |
| --- | --- |
| `comparator` | **`contains`**, and nothing else; `>=` beside a line id is refused by name |
| `value` | a non-empty string: the phrase the case says the line carries |
| `signalRef` | the `id` of a log line the same signals file declares |
| the check | the phrase appears in that line's `body` |

This was resolved-only until finding 286: the guard counted the reference and never
compared the phrase with the body, so one of the shipped corpus's four log checkpoints
asserted `contains "segmentation fault"` about a line that reads `SIGSEGV`, and the run
was green. The log body is a **reconstruction** -- the one modality where the text is
written rather than measured -- so the phrase and the body are two authored statements
about one line, and the rule is that they agree; nothing here can tell which of them is
right when they do not.


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

#### A key nothing reads has to say why it is there

`fault.parameters` is open by design, so nothing in the type says which of its keys a reading
was supposed to cite. Measured before this field existed: **69 of 98 keys were cited by
nothing**, across all thirty cases. Some are descriptive on purpose (`service`, `from`,
`trigger`), and some were numbers a reading restated by hand -- and no rule could tell which,
because the file did not say (finding 300 refused both the strict rule and the allow-list).

`fault.parameterNotes` is that statement: one sentence per uncited key, saying what the fact is
for and why no reading speaks for it.

```ts
fault: {
  type: string;
  category: FaultCategory;
  parameters?: Record<string, unknown>;
  parameterNotes?: Record<string, string>;   // exactly the keys nothing cites
}
```

| the key | the note | result |
| --- | --- | --- |
| cited by a reading | absent | required -- the citation is the statement |
| cited by a reading | present | **refused**: two statements of one fact, and the note can drift |
| cited by nothing | a sentence | accepted, and counted |
| cited by nothing | absent | **refused**, naming the key |
| no such key | present | **refused**: what a rename leaves behind |
| cited by nothing | `"the container"` | **refused**: a label restates the key it explains |

The two shape rules are `MIN_NOTE_LENGTH` (40 characters) and a closing full stop, because those
are the two properties a label lacks. They are a proxy for "a sentence" rather than a measure of
truth, and `fault/parameter-notes.ts` says so where the rule lives: presence, placement and
shape are what a guard can check, and the truth of a sentence is what a reader checks.

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
reference  := identifier ('@' entity)? '.' point
identifier := [A-Za-z_][A-Za-z0-9_]*
entity     := [A-Za-z0-9_-]+
point      := a member of SERIES_POINTS
```

A reference may name the entity that carries the series, as
`cluster_members_visible@search-node-4.post`, and a bare one resolves only when exactly one
entity carries the metric. Two carriers is a refusal naming both rather than a reading of
whichever came first -- which is what the evaluator used to do, safely only because the
signals file refused the duplicate. The reference an evaluation reports is the pair.

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
| `series[]` | `service`, `metric`, `unit`, `baseline`, `post`, `derivation`, `noise`, `quote`, `why` | metric signals: eight samples per side of the onset, spread across that side's own span of the window |
| `logs[]` | `service`, `id`, `body`, `severity`, `quote`, `why` | log signals at onset + 30s, 150s, 270s |
| `traces[]` | `service`, `spanName`, `durationMs`, `parent`, `quote`, `why` | trace signals at onset + 10s, with span ids derived from `sha256(caseId)` |

`noise` is the second closed vocabulary, and it says whether the reading is a **measurement** or a
**computation**:

| member | the reading | example |
| --- | --- | --- |
| `sampled` (default) | a quantity measured by sampling, drawn with a fixed ±2 % cycle | a p99 latency, a queue depth |
| `none` | a quantity computed exactly, emitted at its value | a share of counted requests, a probe's success ratio, a node condition |

The distinction is not cosmetic: a share of exactly 1 with ±2 % noise is 1.02 and a condition that
reads 1 dips to 0.98, and neither is a reading the data contains. A `counter` refuses the field
outright -- its samples are its accumulation and are exact either way, so the field would claim a
distinction the shape does not have.

`derivation` is a closed vocabulary in `ir` terms -- `step` (a level change, the default), `counter`
(an accumulation whose pre-window is flat at `baseline` and whose last sample is exactly `post`), and
`spike` (one sample at `post`, then `baseline`). A counter's pre-window is flat because the
declaration says what the counter had accumulated by the start of the window; a value that rises
before the fault is a claim the file does not make.

### A reading is a measurement, and a measurement stays inside its unit and on its grid

`baseline` and `post` are what the annotation says the reading was; the samples are what an exporter
would have written down. Both have to be values their unit admits, and `util/unit.ts` is the one place
that says what those are. A unit makes **three** statements about a reading, and they are not the same
statement: how large it may be, what it may land on, and how small a change it can express.
`measurementBounds(unit)` returns `{ min, max }` for a unit it knows and `undefined` for one it does not;
`admitsFraction(unit)` answers the second; `resolutionOf(unit)` answers the third.

| unit | range | why |
| --- | --- | --- |
| `1` | `[0, 1]` | a share is a fraction of a whole |
| `%` | `[0, 100]` | the same dimension, a different scale -- the ceiling is per unit, not per dimension |
| `ms`, `s`, `count`, `By`, `rps`, `core`, `mcore` | `[0, ∞)` | every unit here counts something, and none of them is signed |

| unit | grid | why |
| --- | --- | --- |
| `count` | **whole things** | a count is a number of things, and `203.2` records is not a reading a system reports |
| `ms`, `s`, `min`, `By`, `MiBy`, `rps`, `%`, `1` | continuous | a duration, a byte count, a rate and a share all land between two integers |
| `core`, `mcore` | continuous | `500m` is a quantity stated in thousandths, not half a processor |
| a unit the table does not know | treated as continuous | the same `undefined` `measurementBounds` returns, for the same reason: a rule nobody declared is a claim about someone else's unit |

The third statement is about the *grader* rather than about the annotation, and it exists because of what
a fold of zero width does: both baselines divide a change by a baseline's spread, so a baseline that never
moved has no divisor. The divisor is then one step of the declaration's own unit.

| unit | resolution | why |
| --- | --- | --- |
| `count` | `1` | a count is whole things; there is no reading between six and seven |
| `%` | `1` | a percentage point |
| `1` | `0.01` | a share is read to the percentage point, and a millionth of a whole is not a change anyone acts on |
| `ms`, `s`, `By`, `MiBy`, `rps`, `core`, `mcore` | `1` of the unit as declared | a reading is written in the unit it declares, and `500 mcore` resolves in thousandths |
| no unit, or a unit the table does not know | `1e-6` | the old constant, kept only where nobody declared a unit -- the same refusal `measurementBounds` makes by returning `undefined` |

A baseline that *did* move is measured and its own spread divides; the resolution stands in only where
there is no spread to measure, which is why a two per cent jitter on a latency percentile is still a
z-score. Before this, `1e-6` stood in either way, and a corpus series whose baseline was a flat zero or a
flat six reported its change *times a million* -- a statistic that measured the constant (finding 288).

Four rules follow, and they are different rules:

- **The declaration is refused if it is out of range.** `check-fault-cases` says which point, which
  metric, which unit and what range, because `post: 120` in `%` is not a noisy measurement, it is a
  number no measurement can be.
- **The declaration is refused if it is off the grid.** A `count` of `201.5` things is refused, because
  a counter's last sample is required to *be* the declared post and rounding it would move the number
  the annotation asserts.
- **The noise is clamped.** The sampling noise is a fraction of the reading, so a share of exactly 1
  came out as `1.02` -- a 102 % share. At a bound the noise becomes one-sided, which is what a real
  measurement at a ceiling looks like: there is nothing above 100 % to be noisy about.
- **Every sample lands on the grid.** `quantizeToUnit` rounds where the unit has a grid, which is what
  a count's noise and a counter's eight-way division both need: `200 records ± 2 %` was `203.2` of them,
  and `178 restarts / 8` was `22.25` of them. "Exact because it is a total" and "whole" are two
  different claims, and a counter satisfies the first while failing the second. A unit with no grid is
  returned unchanged, so a latency percentile is not rounded.
- **A statistic is measured in the unit's own steps.** `resolutionOf` is the divisor a localiser uses when
  a baseline never moved, so the ranking compares "38 percentage points" with "one whole field" rather
  than two records of `1e-6`. It is a *floor* and not a cap: a baseline whose spread is measurable divides
  by that spread.

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
