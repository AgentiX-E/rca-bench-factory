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
 │ 7  VERIFY      Golden Master + mutation testing (external grounding)     │
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

- **OpenRCA** (`export/openrca.ts`) — `query.csv` vs `record.csv` separation,
  UTC+8 offset (`OPENRCA_OFFSET_MINUTES = 480`), metric/log/trace CSV builders.
- **RCAEval** (`export/rcaeval.ts`) — `RE1` (metric-only), `RE2` (multi-source),
  `RE3` (code-level) suites with per-case directories.

Additional targets (RCA100, Cloud-OpsBench, …) are declared in `src/coverage.ts`
and added in subsequent milestones.

## 8. Self-evolution and human-in-the-loop

Self-evolution happens at **dataset-authoring time** (before a case is admitted):
the system refines its rules and gates based on quarantine and rejection feedback.
It is **externally anchored** — a pure recursive self-training loop collapses without
external judgment, so every evolution round must be scored against the Golden Master
and the mutation suite.

Human-in-the-loop checkpoints (H1–H6) gate the riskiest transitions:

1. **H1** — approve the ingest adapter / source schema.
2. **H2** — approve LLM-generated rules (sample diff review).
3. **H3** — approve ground-truth labels for ambiguous cases.
4. **H4** — approve quarantined-record disposition.
5. **H5** — approve gate rejection overrides.
6. **H6** — approve a release of the benchmark set.

## 9. Non-goals (deliberately out of scope)

- A Prometheus/OTel exporter for production monitoring.
- An RCA *agent* or root-cause *solver* — we only produce the benchmark a solver runs on.
- Fully autonomous self-evolution without human checkpoints (see [acceptance](acceptance.md)).
