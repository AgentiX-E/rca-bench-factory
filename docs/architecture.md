# Architecture

This document describes the high-level design of `rca-bench-factory`: what the
system is, how its layers fit together, and where the LLM sits relative to the
deterministic engine.

## 1. Positioning

`rca-bench-factory` is a **dataset engineering platform**, not a metrics exporter.

> Analogy: *LangSmith for traces* + *dbt for data contracts*. LangSmith structures
> and curates traces for evaluation; dbt turns raw tables into governed, tested,
> versioned datasets. `rca-bench-factory` does both for RCA benchmark datasets.

Its job is to close the gap between two things that almost never match:

1. **What enterprises have** — Prometheus metrics, unstructured logs, APM traces,
   Kubernetes events, alerts, profiles, in inconsistent schemas and timezones.
2. **What RCA benchmarks demand** — a rigid *field contract* (column names, UTC
   conventions, entity naming, causal annotations, isolated answer keys).

## 2. The eight-layer pipeline

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 1  INGEST      six-tier access (OTel → vendor → files → scrape →        │
 │                snapshot → LLM-assisted custom)                          │
 ├─────────────────────────────────────────────────────────────────────────┤
 │ 2  TRANSFORM   deterministic 7-strategy engine (quarantine, no loss)    │
 ├─────────────────────────────────────────────────────────────────────────┤
 │ 3  IR          four-layer intermediate representation (canonical)        │
 ├─────────────────────────────────────────────────────────────────────────┤
 │ 4  ENTITY      entity graph index + alias resolution (union-find)        │
 ├─────────────────────────────────────────────────────────────────────────┤
 │ 5  GATES       G1 structural … G5 anti-pollution                        │
 ├─────────────────────────────────────────────────────────────────────────┤
 │ 6  EXPORT      OpenRCA 1.0/2.0, RCAEval RE1/RE2/RE3, RCA100, …          │
 ├─────────────────────────────────────────────────────────────────────────┤
│ 7  VERIFY      Golden Master + mutations + official metrics (grounding)  │
├─────────────────────────────────────────────────────────────────────────┤
│ 8  EVOLVE      self-evolution loops with human-in-the-loop checkpoints   │
 └─────────────────────────────────────────────────────────────────────────┘
```

Layers 1–6 are the **deterministic core** and are what `@rca-bench-factory/core`
implements today. Layers 7–8 wrap the core with verification and adaptation.

## 3. The four-layer IR

The Intermediate Representation is the single source of truth. It is deliberately
layered (see [data-model.md](data-model.md) for the TypeScript interfaces):

| Layer | Type | Meaning |
| --- | --- | --- |
| L1 | `TelemetrySignal` | One observed fact (metric/log/trace/event/alert/profile) |
| L2 | `EntityGraph` | The topology every reference must resolve against |
| L3 | `FaultCase` | One failure + its ground truth + task query |
| L4 | `QualityGateReport` | Evidence the case is usable |

Two invariants are enforced **by the schema and guards, not by convention**:

1. Every entity reference MUST resolve against the `EntityGraph`.
2. Fields with `provenance: 'inferred'` MUST NOT back ground-truth key fields
   (root cause entity, injection time, causal chain).

## 4. The deterministic transform engine

The engine applies seven strategy rules. Every rule returns a discriminated
`StrategyResult` — data problems become `{ status: 'error' }` values, never thrown
exceptions:

| Strategy | Function | Purpose |
| --- | --- | --- |
| `time` | `applyTime` | Parse & normalize timestamps to canonical UTC ISO-8601 |
| `unit` | `applyUnit` | Convert UCUM-inspired units with exact rational factors |
| `map` | `applyMap` | Rename / remap fields |
| `regex` | `applyRegex` | Extract fields with a bounded regular expression |
| `template` | `applyTemplate` | Drain-style log-template extraction |
| `lookup` | `applyLookup` | Dictionary / alias resolution |
| `expr` | `applyExpr` | Restricted recursive-descent expressions (no `eval`) |

**Batch invariant.** `transformBatch` guarantees
`inputCount === outputCount + quarantineCount`. A record that cannot be transformed
is quarantined with a reason — it is never silently dropped. `checkNoSilentLoss`
asserts this after every batch.

## 5. LLM-assisted rule generation

The LLM is an **accelerator for non-OTel sources**, not a replacement for the engine.
It proposes field mappings and transforms by reading *samples* of a data source; the
deterministic engine then executes those rules over the *full* dataset.

```
 ┌──────────────┐   proposes    ┌────────────────────┐
 │   LLM        │ ────────────▶ │  deterministic      │
 │ (O(sources)) │   rule YAML   │  engine             │
 └──────────────┘               │ (O(records))        │
        ▲                       └─────────┬──────────┘
        │                                 │ result
        │   feedback (reject reason)      ▼
        │                       ┌────────────────────┐
        └───────────────────────│  gates G1–G5       │
                                └────────────────────┘
```

Key property: the LLM is called **O(data sources)**, never **O(records)**. The
`FieldProvenance` type records `ruleId`, `modelId`, `promptVersion` and `confidence`
for every LLM-produced field so a generated rule stays reproducible and auditable.

The six LLM tasks are:

- **G1** format splitting (where is the metric name / value / timestamp?)
- **G2** field mapping (which source column becomes which contract field?)
- **G3** value normalization (unit, casing, severity levels)
- **G4** entity normalization (merge aliases into canonical `Entity`s)
- **G5** template extraction (Drain3-style log templates)
- **G6** semantic completion (fault category, causal mechanism, query text)

The LLM boundary is the provider-agnostic `LlmProvider` interface (`llm/provider.ts`).
Three concrete adapters implement it: `llm/deepseek.ts` and `llm/openai.ts` share
the OpenAI-compatible chat-completions wire format (the common request builder,
response parser and HTTP factory live in `llm/openai-compat.ts`), while
`llm/anthropic.ts` implements the distinct Anthropic Messages API. In every
adapter the request builder and response parser are pure, and the HTTP round
trip is performed with the API key injected by the caller (never read from the
environment or committed to git).

## 6. Quality gates G1–G5

A case is admitted to a benchmark only after every gate passes:

| Gate | Name | What it proves |
| --- | --- | --- |
| G1 | Structural | Required fields present, `signal === payload.kind`, service name set |
| G2 | Semantic | Every reference resolves; causal hops are topologically connected |
| G3 | Validity | The fault is a real anomaly (Z-score ≥ 2.0, sustained ≥ 3 samples) |
| G4 | Solvability | The case is neither trivially easy nor impossible |
| G5 | Anti-pollution | No PII, no duplicate case (FNV-1a fingerprint), no leakage |

## 7. Exporters

Each exporter emits the target benchmark's field contract exactly:

All seven targets ship, one module each under `packages/core/src/export/`:

- **OpenRCA 1.0** (`export/openrca.ts`) — `query.csv` vs `record.csv` separation,
  UTC+8 offset (`OPENRCA_OFFSET_MINUTES = 480`), metric/log/trace CSV builders.
- **OpenRCA 2.0** (`export/openrca2.ts`) — the next-generation record shape.
- **RCAEval** (`export/rcaeval.ts`) — `RE1` (metric-only), `RE2` (multi-source),
  `RE3` (code-level) suites with per-case directories.
- **RCA100** (`export/rca100.ts`) — six-modality contract (M/L/T + events + alerts +
  UModel topology) with a four-layer answer key and enforced reference integrity.
- **AIOps2025** (`export/aiops2025.ts`), **Cloud-OpsBench**
  (`export/cloudopsbench.ts`) and **ITBench** (`export/itbench.ts`) — competition
  formats whose metric protocols are transcribed or derived per `src/coverage.ts`.

Each is exercised end to end by `pnpm official:check`, which submits the exported
answer key to that target's own published metric and requires a perfect score.

## 8. Self-evolution and human-in-the-loop

Self-evolution happens at **dataset-authoring time** (before a case is admitted):
the system refines its rules and gates based on quarantine and rejection feedback.
It is **externally anchored** — a pure recursive self-training loop collapses without
external judgment, so every evolution round must be scored against the three external
anchors of section 9: the Golden Master, the mutation suite and the official metrics.

The evolution loop is a **governance layer** (`src/evolution/`), not a generator:
`proposal.ts` assembles a pending proposal (diff-able rule changes + a regression
verdict) and `hitl.ts` models the checkpoint vocabulary. The division is
deliberate: `hitl.ts` owns *which* checkpoint an action routes to and the status
vocabulary, while `proposal.ts` owns the `pending -> approved/rejected` machine
and its guard. `hitl.ts` once carried a second copy of that machine
(`approve`/`reject` over `HitlDecision`) with no guard, so only one of the two
implementations refused a second verdict. It was deleted rather than guarded -
a second implementation of a guarded rule is free to drift from the first - and
`test/hitl-single-machine.test.ts` pins the module's runtime surface so the copy
cannot return. The three non-negotiable
red lines are enforced as pure predicates:

1. Every rule/GT change is diff-able and revertible (a non-empty base version).
2. An unapproved proposal is never production-ready (`isProductionReady`).
3. A failed or rejected proposal marks its affected cases stale for re-run
   (`computeStaleCases`).

Human-in-the-loop checkpoints (H1–H6) gate the riskiest transitions:

1. **H1** — approve cold-start rules (after rule generation).
2. **H2** — approve entity normalization / mapping.
3. **H3** — approve ground-truth labels (four-layer annotation).
4. **H4** — approve an evolution proposal (diff + regression).
5. **H5** — arbitrate quarantined samples.
6. **H6** — re-inspect an anomalous score.

## 9. Verification: well-formed is not the same as scorable

Layer 7 grounds the factory against four external anchors. They answer four different
questions, and passing three of them says nothing about the fourth:

| Anchor | Question | Implementation |
| --- | --- | --- |
| Golden Master | Are we reproducing the **published artefacts**? | `golden-master/verify.mjs` against shipped SHA-256 anchors |
| Mutation suite | Do the **gates** intercept a corrupted case? | `MT-01 … MT-18`, 100% interception required |
| Official metrics | Does the **published scorer** award 1.0 to our export? | `src/score/official.ts` + `scripts/check-official.mjs` |
| Round trip | Does **official data** survive ingest → export → scoring? | `src/ingest/prime.ts`, `rca-bench ingest` |

The third anchor exists because an export can satisfy every structural rule and still
earn 0.00: the official metric reads ground truth back out of the export with its own
rules — three regular expressions for OpenRCA 1.0, the directory name for RCAEval, the
answer-key record for AIOps2025. If the exporter writes a field the official reader
never looks at, the score is zero and no structural check notices.

The fourth anchor exists because the first three all start from a bundle *we* authored.
If our exporter and our scorer shared a misunderstanding, every one of them would agree
with the misunderstanding. The round trip starts instead from the dataset the benchmark
itself ships: `ingest` reads official data into the IR, `export` writes it back out, and
the official scorer grades the result. It is the only anchor that can contradict us.

`ingest` is deliberately label-blind. The case descriptor supplies the root-cause
component, the fault type and the injection time, because those are facts about the
dataset rather than things to reverse-engineer from a file name — an inferred label would
make the reproduction score against itself. A component that is neither observed in the
telemetry nor declared as an entity fails the run, so the emitted bundle is
reference-complete by construction.

`src/score/official.ts` therefore reimplements each **published** metric against the
export itself and asserts three properties per target:

1. `oraclePerfect` — a known-good export scores 1.0.
2. `mutationsDegrade` — corrupting the export moves the score down.
3. `unscoredFacetsInert` — a facet the official metric ignores cannot move the score.

An empty export is reported as `skipped`, never as `passed`; a skip without an explicit
`--allow-empty-reason` fails.

Every metric carries a `provenance` label, and the three values answer one question: **how
far is this rule from somebody else's code?**

| Label | Meaning | Targets |
| --- | --- | --- |
| `replayed` | a corpus in `golden-master/` runs the released artefact's rule case by case, and the suite replays it | OpenRCA 1.0, RCAEval ×3, Cloud-OpsBench |
| `transcribed` | the benchmark publishes a prose rule and no released code; this is a faithful reading and nothing else computes it | RCA100, AIOps2025 |
| `derived` | the benchmark publishes neither the rule nor the constants it needs, so this repository supplies an explicit aggregation and says so | OpenRCA 2.0, ITBench |

Only `replayed` has been compared to a second implementation, and that difference is what
the label exists to carry: every disagreement this project has found between its own rule
and an upstream artefact (10 of 25 cases on OpenRCA, 9 of 22 on Cloud-OpsBench, 3 of 4 on
RCA100, 3 of 9 on ITBench) was under a rule that had been written from a reading rather
than replayed. The label is derived from the census rather than authored —
`packages/core/test/provenance-matches-the-census.test.ts` maps each census class to one
label and fails on any drift, so a target cannot claim more than the census supports.

## 10. T2 backends: what can be pulled from, and what cannot

P1-5 in the roadmap asks for T2's six backend families to be measured one by one,
with the ones that cannot be supported declared explicitly. This is that
measurement, and it is deliberately not a paragraph. Each row below is held to
`golden-master/backend-support.json` by `scripts/check-backend-support.mjs`, which
runs in `docs:check` *and* in the cold-tree job; that snapshot is held to
`packages/core/src/ingest/backends.ts` by `backend-support.test.ts`, which also
drives every backend the table calls implemented against a real HTTP server. A
matrix that cannot fail is a paragraph with a table drawn around it, and this
repository has already shipped four of those (findings 107, 108, 109 and 114).

All six implemented paths are *pulls*: telemetry is fetched over HTTP, from a documented
JSON API. What differs between them is how far the claim has been tested, and there are now
three degrees of it rather than two.

**One is driven against a real server by CI, on every push.** Prometheus, through
`scripts/verify-reader-against-backend.mjs`: the gate starts the distribution's server, reads it
through `pullPrometheusMetrics`, reads it again with a service label the server does not set, and
stops it. `apt-get` on `ubuntu-latest` returns 2.45.3 -- the version finding 154 measured by hand
-- and the version the gate reports is the one **the server said**, not one typed into a file, so
a distribution bump is reported rather than hidden.

**One has been pointed at a real deployment by hand only.** ClickHouse (finding 167, version
24.3.4.147, where the reader's instants were checked against the server's own
`toUnixTimestamp64Milli`). A measurement somebody took once is evidence about the reader on the
day, and finding 154's Prometheus run was in this group until this pass moved it to the one above.

**Four have been driven only against fixtures**: Jaeger, Loki, Elasticsearch and Kubernetes, in
`packages/core/test/jaeger.test.ts`, `packages/core/test/loki.test.ts`,
`packages/core/test/elasticsearch.test.ts` and `packages/core/test/kubernetes.test.ts`. Their
readers are exercised against shapes this repository wrote, which is the same author as the
readers -- the property the gate above exists to stop relying on, for one reader at a time.
That difference is written down rather than blurred, because "reads the documented
wire format" and "was answered by a deployment" are different measurements. The other two
ingest paths here read what a caller already has -- `ingest/file.ts` for files,
`ingest/otlp.ts` for posted OTLP payloads -- which is why every row names a wire
format rather than a product.

**No row reads `unsupported` any more**, and that is a claim the registry states rather than
leaves to be read off a list: `backend-support.test.ts` pins the unsupported set to empty, so
flipping a row back costs a deliberate edit and a reason of substance. Four of the six rows
carried reasons whose clauses turned out to be *the interface* -- a label the caller must
name (Loki, finding 161), a field mapping the caller supplies (Elasticsearch, finding 164),
credentials plus a translation table (Kubernetes, finding 165, where the table turned out not
to be needed at all), and finally an argument rather than a claim (ClickHouse, finding 167).
That history is the reason this matrix exists in this form: a reason is worth re-reading
rather than trusting, and twice the re-reading did not go the way the reading rule predicted.

| backend | status | description |
| --- | --- | --- |
| `prometheus` | implemented | HTTP JSON API: GET /api/v1/query_range, read as a matrix |
| `jaeger` | implemented | HTTP JSON API: GET /api/traces, read as a list of traces whose spans carry hex ids |
| `loki` | implemented | HTTP JSON API: GET /loki/api/v1/query_range, read as streams of [ns-timestamp, line] pairs whose service label the caller names |
| `elasticsearch` | implemented | HTTP JSON API: POST /{index}/_search, read as hits whose timestamp, message and service fields -- and the timestamp encoding -- the caller declares |
| `clickhouse` | implemented | HTTP JSON API: POST / with the statement in the body, read as a JSON envelope whose meta block types the declared timestamp, message and service columns |
| `kubernetes` | implemented | HTTP JSON API: GET /api/v1/events, read as EventList items mapped onto the IR event payload, with the service named by the caller |

Four rows read `unsupported` until recently, each with a reason that was true about the
wire format and wrong about what followed from it. The `loki` row (finding 161) said the
service is a label the caller must name; the `elasticsearch` row (finding 164) said a reader
"would need a field mapping supplied by the caller before it could read anything at all";
the `kubernetes` row (finding 165) said the reader would need credentials and "a translation
table"; the `clickhouse` row (finding 167) said supporting the backend means "either fixing a
schema this project does not own or accepting arbitrary SQL". The first three are statements
about the interface, so those arguments are required and none is defaulted -- and one clause
in the third turned out not to be needed at all: the IR's event payload already carries
`involvedObject` in the shape the API writes it, so there was no translation to perform.

The fourth is a different shape, and it is the one that gives this paragraph its last
sentence. It is an argument with two horns rather than a claim about what a caller would
supply, and both horns are real. What it did not account for is that ClickHouse *types the
result it returns*: the JSON envelope carries a `meta` block giving every column's own type,
so a caller-written statement does not produce an untyped ingest path -- the declaration is
checked against the backend rather than believed. **The Elasticsearch reader takes one
decision more than its reason named**, because three declared field names can still arrive in
two shapes: the field's own format decides whether a `date` is an ISO-8601 string or epoch
milliseconds. **The ClickHouse reader is the first that can verify that decision**: the same
three names arrive with their types attached, so a declaration that contradicts the backend
is refused by name before a row is read.

Nothing above is a promise about a hosted service. `prometheus` means the query
API a Prometheus or a Prometheus-compatible endpoint answers at
`/api/v1/query_range`; the puller does not retry, because the retry policy that
exists in this repository (`fetch-official.mjs`, finding 52) has its own exit-code
contract and a second, quieter one inside the ingest layer would eventually
disagree with it about which failures are retryable.

## 11. Non-goals (deliberately out of scope)

- A Prometheus/OTel exporter for production monitoring.
- An RCA *agent* or root-cause *solver* — we only produce the benchmark a solver runs on.
- Fully autonomous self-evolution without human checkpoints (see [acceptance](acceptance.md)).
