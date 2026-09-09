# rca-bench-factory

**Turn non-standard enterprise telemetry into authoritative RCA benchmark field contracts.**

`rca-bench-factory` is an open-source converter engine for root-cause-analysis (RCA)
benchmark engineering. It ingests whatever an enterprise actually has — Prometheus
metrics, plain-text logs, APM traces, Kubernetes events, alerts, profiles — and emits
**byte-for-byte compliant** datasets for the industry-authoritative RCA benchmarks:
OpenRCA 1.0 / 2.0, RCAEval (RE1/RE2/RE3), RCA100 / AgenticOpsEval, Cloud-OpsBench,
AIOps2025 and ITBench.

The product is **not a Prometheus exporter**. It is closer to *LangSmith for traces*
plus *dbt for data contracts*: a dataset engineering platform with a strict
intermediate representation (IR), a deterministic transform engine, and five quality
gates that *prove* the emitted benchmark is usable — before anyone runs a single
RCA agent against it.

---

## Why this exists

Every RCA benchmark defines a rigid **field contract**: column names, UTC time
conventions, entity naming, causal-path annotations and answer-key isolation. Real
enterprise telemetry almost never matches that contract. Teams end up hand-crafting
benchmarks, which is slow (55–110 person-days per 1,000 cases), error-prone, and
silently re-licenses or corrupts upstream data.

`rca-bench-factory` replaces that manual pipeline with:

| Concern | What it does |
| --- | --- |
| **Ingest** | Six-tier access: OTel → vendor adapters → flat files → scrape → snapshot → LLM-assisted custom |
| **Normalize** | Deterministic 7-strategy transform engine (time / unit / map / regex / template / lookup / expr) |
| **Structure** | Four-layer IR (`TelemetrySignal` → `EntityGraph` → `FaultCase` → `QualityGateReport`) |
| **Verify** | Five gates G1–G5 plus a 15-mutation test that proves the gates themselves work |
| **Export** | OpenRCA 1.0/2.0, RCAEval RE1/RE2/RE3, and more — with zero silent loss |

## Guiding principles

1. **Evidence over assumption.** A claim about compliance is only accepted when a
   gate or a test produced it.
2. **Deterministic engine, LLM-assisted rules.** The LLM proposes field mappings and
   transforms; a deterministic engine executes them and the gates verify them. The
   LLM is called `O(data sources)`, never `O(records)`.
3. **Zero silent loss.** Every transform either succeeds or is quarantined with a
   reason. `inputCount === outputCount + quarantineCount` is enforced, not hoped for.
4. **External grounding.** Self-certification is a closed loop. Verification anchors
   are distributed (checksums + expected outputs), never licensed data.

## Repository layout

```
rca-bench-factory/
├── packages/
│   ├── core/                  # @rca-bench-factory/core — IR, transform, gates, exporters
│   │   ├── src/
│   │   │   ├── ir/            # Layer model: types, zod schemas, type guards, bundle assembler
│   │   │   ├── ingest/        # file (CSV/TSV/JSONL/JSON) + OTLP JSON → IR signals
│   │   │   ├── transform/     # 7 strategies + batch engine (quarantine, no silent loss)
│   │   │   ├── entity/        # entity graph index, alias resolution (union-find)
│   │   │   ├── gates/         # G1 structural … G5 anti-pollution + runAllGates
│   │   │   ├── export/        # OpenRCA + RCAEval + RCA100 + AIOps2025 + Cloud-OpsBench exporters
│   │   │   ├── score/         # structure checks + SHA-256 verification + 0-100 scoring
│   │   │   ├── report/        # static HTML renderer (entity graph / coverage / gates / score, escaped)
│   │   │   ├── cli/           # IO-free `rca-bench` argument parser (source/transform/case/gate/export/score)
│   │   │   ├── llm/           # provider-agnostic rulegen + DeepSeek adapter (prompt/parse/validate)
│   │   │   ├── fault/         # fault collector + historical importer (type/category/spec + LLM extraction)
│   │   │   ├── evolution/     # self-evolution governance: HITL checkpoints + red lines
│   │   │   └── util/          # strict time parsing, UCUM-inspired rational units
│   │   └── test/              # vitest + v8 coverage, no mocks, no skips
│   └── cli/                   # @rca-bench-factory/cli — the runnable `rca-bench` binary
│       ├── src/run.ts         # command orchestration over real file IO
│       ├── src/main.ts        # bin entry
│       └── test/              # real-temp-dir end-to-end tests, no mocks
├── docs/                      # external documentation (architecture, user guide, …)
├── golden-master/             # verification anchors (expected.json + checksums + script)
├── scripts/                   # no-mock / no-secrets lint guards
└── .github/workflows/ci.yml   # build, typecheck, lint, test+coverage, mutation, golden-master
```

## Quick start

```bash
# 1. Install
pnpm install

# 2. Type-check and lint
pnpm typecheck
pnpm lint

# 3. Run the full test suite with coverage
pnpm test:coverage

# 4. Build
pnpm build
```

Coverage is gated at **≥ 95%** statements / lines / branches and **100%** functions,
with **no mocks and no skipped tests** (enforced by `scripts/check-no-mock.mjs`).

```ts
import { transformBatch, runAllGates, exportOpenRca } from '@rca-bench-factory/core';

// 1. Feed normalized IR signals through the deterministic transform engine.
// 2. Run all five gates and only proceed on `admitted`.
// 3. Export the compliant OpenRCA dataset.
const result = transformBatch(irSignals, rules);
const report = runAllGates(faultCase, { graph, signals });
if (report.finalStatus === 'admitted') {
  const files = exportOpenRca(faultCase, signals);
}
```

## Documentation

| Document | Purpose |
| --- | --- |
| [Architecture](docs/architecture.md) | High-level design, 8-layer pipeline, module map, LLM rule-generation flow |
| [User guide](docs/user-guide.md) | Step-by-step: ingest → transform → gate → export → verify |
| [Data model](docs/data-model.md) | The four-layer IR and its two hard invariants |
| [Target formats](docs/target-formats.md) | OpenRCA / RCAEval / RCA100 field contracts and how each is produced |
| [Acceptance](docs/acceptance.md) | L0–L5 acceptance layers, mutation matrix, Golden Master, Definition of Done |
| [CLI reference](docs/cli-reference.md) | `rca-bench` command surface (`init` / `source` / `detect` / `transform` / `case` / `gate` / `export` / `score` / `evolve`) |
| [Contributing](CONTRIBUTING.md) | Workflow, TDD, coverage rules, commit conventions |

## Supported target formats (v0.1)

- **OpenRCA 1.0** — `query.csv` / `record.csv` / `telemetry/{DATE}/{log,metric,trace}` with UTC+8 offset.
- **RCAEval** — `RE1` (metric-only), `RE2` (multi-source), `RE3` (code-level).
- **RCA100 / AgenticOpsEval** — six-modality contract (M/L/T + events + alerts + topology).
- **AIOps2025** — `input.json` + per-modality `groundtruth.jsonl` reasoning contract.
- **Cloud-OpsBench** — `metadata.json` outcome ground-truth triple
  (⟨Stage, Component, Root Cause⟩); the State Snapshot body (`tool_cache`,
  `k8s_states`, `code`) requires a live Kubernetes snapshot and is out of scope.
- **OpenRCA 2.0 / ITBench** — declared targets (see `src/coverage.ts`).

## Licensing

- Code: [Apache-2.0](LICENSE).
- IR schema and field contracts: **CC BY 4.0** (deliberately no `NC`/`SA`).
- Upstream benchmark *data* (OpenRCA, RCA100, …) is **never redistributed** — see
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for the full license matrix.

## Status

Early-stage (`v0.1.0`). The deterministic core is implemented and fully tested:
flat-file ingest (CSV/TSV/JSONL/JSON), OTLP JSON ingest (metrics/logs/traces), the
four-layer IR, the transform engine, the entity graph, the G1–G5 gates, the
OpenRCA/RCAEval/RCA100/AIOps2025/Cloud-OpsBench exporters, the structure/checksum
score module, the CLI argument parser and runnable `rca-bench` binary, the
provider-agnostic LLM rule-generation core, the DeepSeek provider adapter, the
fault collector and historical fault importer, the self-evolution governance
layer (HITL checkpoints H1–H6 + the three red lines) and the static HTML report
renderer (entity graph / coverage / gates / score, HTML-escaped). The remaining
exporters (OpenRCA 2.0, ITBench) are gated on official format release.
