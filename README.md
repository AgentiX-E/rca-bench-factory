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
│   │   │   ├── export/        # OpenRCA 1.0/2.0 + RCAEval + RCA100 + AIOps2025 + Cloud-OpsBench + ITBench exporters
│   │   │   ├── score/         # structure checks + SHA-256 verification + 0-100 scoring + the official-metric scorer
│   │   │   ├── report/        # static HTML renderer (entity graph / coverage / gates / score, escaped)
│   │   │   ├── cli/           # IO-free `rca-bench` argument parser (…/export/score/official/pack/evolve)
│   │   │   ├── pack/          # reproducible tar.gz writer + manifest + the downloadable example pack
│   │   │   ├── llm/           # provider-agnostic rulegen + DeepSeek/OpenAI/Anthropic adapters
│   │   │   ├── fault/         # fault collector + historical importer (type/category/spec + LLM extraction)
│   │   │   ├── evolution/     # self-evolution governance: HITL checkpoints + red lines
│   │   │   └── util/          # strict time parsing, UCUM-inspired rational units, SHA-256
│   │   └── test/              # vitest + v8 coverage, no mocks, no skips
│   └── cli/                   # @rca-bench-factory/cli — the runnable `rca-bench` binary
│       ├── src/run.ts         # command orchestration over real file IO
│       ├── src/main.ts        # bin entry
│       └── test/              # real-temp-dir end-to-end tests, no mocks
├── docs/                      # external documentation (architecture, user guide, …)
│   └── targets/               # one full field contract per target format, with verified examples
├── examples/order-prod/       # the demo input set every documented example is generated from
├── site/                      # interactive product + teaching site (static, published to Pages)
├── golden-master/             # verification anchors (expected.json + checksums + script)
├── scripts/                   # no-mock / no-secrets guards, format spec, example generator, official check
├── .github/workflows/ci.yml   # build, typecheck, lint, test+coverage, mutation, golden-master, official
└── .github/workflows/pages.yml # publishes site/ to GitHub Pages
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
import { assembleBundle, runAllGates, exportOpenRca, scoreExport } from '@rca-bench-factory/core';

// 1. Assemble a validated bundle from a loose draft (fault type normalised,
//    category inferred, schema checked).
// 2. Run all five gates and only proceed on `admitted`.
// 3. Export the compliant OpenRCA dataset and score it.
const assembled = assembleBundle(draft);
if (!assembled.ok) throw new Error(assembled.error);

const report = runAllGates(assembled.bundle.cases[0], assembled.bundle);
if (report.finalStatus === 'admitted') {
  const { files } = exportOpenRca(assembled.bundle);
  const score = scoreExport('openrca-1.0', files);
}
```

Exporters take the **bundle** — the topology and the case-level signals are both
required to enforce reference integrity.

## Interactive site

The product and teaching site lives in [`site/`](site/) and is published to GitHub Pages:
**<https://agentix-e.github.io/rca-bench-factory/>**

It is a dependency-free static app: a format explorer with every field of all seven
contracts, the four-layer IR model, the G1–G5 gates, an eight-step tutorial with
progress tracking, a scoring calculator and a boundaries/FAQ section. Every code sample
on the site is generated by `scripts/gen-examples.mjs` from the real exporters, so the
site can never drift from the code.

The tutorial also ships the **example pack**: one byte-reproducible
`rca-bench-factory-examples.tar.gz` containing the telemetry, drafts and rules every
documented command runs against, plus `run.sh` and a `MANIFEST.json` of per-file
SHA-256 digests. Download it, extract it, run `sh run.sh` — the whole pipeline executes
without cloning the repository.

```bash
pnpm site:serve               # preview at http://localhost:4173
pnpm examples:gen             # regenerate site/assets/data.js + sync the doc examples
pnpm examples:check           # fail when the committed artefacts are stale (runs in CI)
pnpm examples:bundle          # rebuild the downloadable example pack
pnpm examples:bundle:check    # fail when the committed pack is stale (runs in CI)
```

The archive is reproducible by construction: the tar `mtime`, `uid` and `gid` are pinned
to zero and entries are sorted by path, so rebuilding it from the same inputs yields the
same bytes — that is why CI can compare the committed artefact byte-for-byte, and why the
digest printed on the site is worth verifying against your download.

## Documentation

| Document | Purpose |
| --- | --- |
| [Architecture](docs/architecture.md) | High-level design, 8-layer pipeline, module map, LLM rule-generation flow |
| [User guide](docs/user-guide.md) | End-to-end walkthrough with real commands and real output |
| [Data model](docs/data-model.md) | The four-layer IR and its two hard invariants |
| [Target formats](docs/target-formats.md) | Index, modality matrix and a cross-format field comparison |
| [OpenRCA 1.0](docs/targets/openrca-1.0.md) | `query.csv` / `record.csv` / telemetry tree (UTC+8) |
| [OpenRCA 2.0 (PAVE)](docs/targets/openrca-2.0.md) | `causal_path.json` and the three verification gates |
| [RCAEval](docs/targets/rcaeval.md) | RE1 / RE2 / RE3 layouts and the suite modality contract |
| [RCA100](docs/targets/rca100.md) | Six modalities, UModel topology, four-layer answer key |
| [AIOps2025](docs/targets/aiops2025.md) | `input.json` + `groundtruth.jsonl` key-evidence contract |
| [Cloud-OpsBench](docs/targets/cloud-opsbench.md) | `metadata.json` outcome ground-truth triple |
| [ITBench](docs/targets/itbench.md) | `scenario.json` SRE Diagnosis contract |
| [Acceptance](docs/acceptance.md) | L0–L5 acceptance layers, mutation matrix, Golden Master, Definition of Done |
| [CLI reference](docs/cli-reference.md) | `rca-bench` command surface (`source` / `transform` / `case` / `gate` / `export` / `score` / `report` / `evolve`) |
| [Contributing](CONTRIBUTING.md) | Workflow, TDD, coverage rules, commit conventions |

## Supported target formats (v0.1)

- **[OpenRCA 1.0](docs/targets/openrca-1.0.md)** — `query.csv` / `record.csv` / `telemetry/{DATE}/{log,metric,trace}` with UTC+8 offset.
- **[OpenRCA 2.0 (PAVE)](docs/targets/openrca-2.0.md)** — `causal_path.json` step-wise causal-path annotation with
  structural / statistical / temporal verification (official scorer not open-sourced).
- **[RCAEval](docs/targets/rcaeval.md)** — `RE1` (metric-only), `RE2` (multi-source), `RE3` (code-level).
- **[RCA100 / AgenticOpsEval](docs/targets/rca100.md)** — six-modality contract (M/L/T + events + alerts + topology).
- **[AIOps2025](docs/targets/aiops2025.md)** — `input.json` + per-modality `groundtruth.jsonl` reasoning contract.
- **[Cloud-OpsBench](docs/targets/cloud-opsbench.md)** — `metadata.json` outcome ground-truth triple
  (⟨Stage, Component, Root Cause⟩); the State Snapshot body (`tool_cache`,
  `k8s_states`, `code`) requires a live Kubernetes snapshot and is out of scope.
- **[ITBench](docs/targets/itbench.md)** — `scenario.json` SRE Diagnosis contract (scenario metadata + the
  chain entities / fault-propagation chain / fault conditions ground truth); the
  snapshot body (alerts, metrics, k8s_events, k8s_objects, otel_logs, otel_traces)
  is a frozen Kubernetes snapshot and is out of scope.

## Licensing

- Code: [Apache-2.0](LICENSE).
- IR schema and field contracts: **CC BY 4.0** (deliberately no `NC`/`SA`).
- Upstream benchmark *data* (OpenRCA, RCA100, …) is **never redistributed** — see
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for the full license matrix.

## Status

Early-stage (`v0.1.0`). The deterministic core is implemented and fully tested:
flat-file ingest (CSV/TSV/JSONL/JSON), OTLP JSON ingest (metrics/logs/traces), the
four-layer IR, the transform engine, the entity graph, the G1–G5 gates, the
OpenRCA 1.0/2.0 (PAVE), RCAEval, RCA100, AIOps2025, Cloud-OpsBench and ITBench
exporters, the structure/checksum score module, the official-metric scorer (each
target's published rule run against its own export, with an oracle and a per-facet
mutation grid), the CLI argument parser and
runnable `rca-bench` binary, the provider-agnostic LLM rule-generation core, the
DeepSeek, OpenAI and Anthropic provider adapters, the fault collector and
historical fault importer, the self-evolution governance layer (HITL checkpoints
H1–H6 + the three red lines) and the static HTML report renderer (entity graph /
coverage / gates / score, HTML-escaped).

Every one of the seven target contracts now has a full field reference in
[`docs/targets/`](docs/targets/) whose field tables and examples are generated from
the real exporters (`pnpm examples:gen`), and the interactive product / teaching
site in [`site/`](site/) is published to GitHub Pages on every push that touches it.

Well-formed is not the same as *scorable*, so the factory also runs each target's
**published metric** against its own export: `rca-bench official --input bundle.json`
scores the exported answer key with the upstream rule and asserts that a perfect
answer scores 1.0 and that every facet the rule claims to score actually matters.
`pnpm official:check` pins that result for the shipped example in CI.
