# Target formats

The factory converts one intermediate representation (IR) into the authoritative field
contracts of seven RCA benchmarks. This page is the index; each format has a full field
reference with verified examples.

| Format | Modalities | Doc |
| --- | --- | --- |
| [OpenRCA 1.0](targets/openrca-1.0.md) | M · L · T | outcome-labelled telemetry tree |
| [OpenRCA 2.0 (PAVE)](targets/openrca-2.0.md) | M · L · T + causal path | step-wise causal-path annotation |
| [RCAEval RE1 / RE2 / RE3](targets/rcaeval.md) | M (RE1) · +L +T (RE2/RE3) | per-case metric vectors |
| [RCA100 / AgenticOpsEval](targets/rca100.md) | M · L · T · E · A · Topo | six modalities + UModel topology |
| [AIOps2025](targets/aiops2025.md) | M · L · T · E · A | task + key-evidence ground truth |
| [Cloud-OpsBench](targets/cloud-opsbench.md) | M · L · T · Conf | outcome ground-truth triple |
| [ITBench (SRE)](targets/itbench.md) | M · L · T · E · CD | diagnosis scenario contract |

## Horizontal matrix — benchmark × data type

- **M** metrics · **L** logs · **T** traces · **E** events · **A** alerts · **Topo** topology
- **Prof** profiles · **Conf** config / state snapshot · **CD** change / deploy events

| Benchmark | M | L | T | E | A | Topo | Prof | Conf | CD |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| OpenRCA 1.0 (Microsoft) | ● | ● | ● | – | – | – | – | – | – |
| OpenRCA 2.0 (PAVE) | ● | ● | ● | – | – | – | – | – | – |
| RCAEval RE1 (metric-only) | ● | – | – | – | – | – | – | – | – |
| RCAEval RE2 (multi-source) | ● | ● | ● | – | – | – | – | – | – |
| RCAEval RE3 (code-level) | ● | ● | ● | – | – | – | – | – | – |
| RCA100 / AgenticOpsEval | ● | ● | ● | ● | ● | ● | – | – | – |
| Cloud-OpsBench | ● | ● | ● | – | – | – | – | ● | – |
| AIOps2025 | ● | ● | ● | ● | ● | – | – | – | – |
| ITBench / AIOpsLab | ● | ● | ● | ● | – | – | – | – | ● |

- **Metric marginal necessity is 92.8%** — metrics are the backbone of every target.
- Logs (56.2%) and traces (43.0%) follow.
- **19.4% of RCA100 root causes are observable only in Events** — which is why the IR
  treats `event` as a first-class signal kind rather than a log sub-type.

## Fourth anchor (L4) status per target

The fourth anchor asks whether our export is scorable against data **we did not write**.
It is the only anchor whose subject is a path rather than a fixture, and the only one
where "the path runs" and "the number reproduced" must be kept apart.

**Those are two questions, so this table has two columns.** A single cell cannot hold
both, and when one did, the gap was filled with the stage a format had reached instead
of a measurement -- which is how [OpenRCA 1.0](targets/openrca-1.0.md) came to be
described as *already replayed* while the registry lists its telemetry as unreachable
(see `docs/audit.md`, finding 112).

| Format | L4 fetchability | L4 reading | Note |
| --- | --- | --- | --- |
| `openrca-1.0` | unfetchable | — | telemetry is behind Google Drive; no automated fetch can exist |
| `openrca-2.0` | unfetchable | — | PAVE annotations are not published as a bulk archive |
| `rcaeval-re1` | pending | — | three assets are fetchable and none is pinned yet |
| `rcaeval-re2` | pinned | `official-data.yml` | the only target with a measured pin |
| `rcaeval-re3` | pending | — | five assets are fetchable and none is pinned yet |
| `rca100` | unfetchable | — | no verified bulk HTTPS endpoint |
| `aiops2025` | unfetchable | — | no verified bulk HTTPS endpoint |
| `cloud-opsbench` | unfetchable | — | no verified bulk HTTPS endpoint |
| `itbench` | unfetchable | — | no verified bulk HTTPS endpoint |

**Reading the table.** `unfetchable` means there is nothing to do: the channel does not
exist, and three of those targets carry a documented alternative in
`golden-master/official-assets.json`. `pending` means a download that has not been taken
-- closing it requires running the fetch, **not** editing a file. Only a `pinned` target
can carry a reading, because a measured `sha256` is the only thing that records one.

> **One of nine targets can have a reading.** The other eight are all "no reading yet"
> for two different reasons, which is exactly the distinction a single column erased.

The fetch axis is not a claim maintained by hand: `scripts/check-l4-status.mjs` derives
it from the registry and fails the build if this table disagrees, so a stale cell is a
red build rather than a published error.

## Choosing a target

| If you need… | Use | Why |
| --- | --- | --- |
| The widest baseline coverage | `openrca-1.0` | M/L/T only, simplest contract, most published baselines |
| Process supervision / step-level credit | `openrca-2.0` | three-gate causal path |
| A metric-only localisation study | `rcaeval --suite RE1` | matches the 375-case RE1 suite |
| Code-level fault evaluation | `rcaeval --suite RE3` | RE3 requires `fault.category === 'code'` |
| Events, alerts and topology | `rca100` | the only contract with all six modalities |
| Per-modality key-evidence labels | `aiops2025` | `key_observations` split by log/metric/trace |
| An agentic State-Snapshot run | `cloud-opsbench` | outcome triple ⟨Stage, Component, Root Cause⟩ |
| Agentic SRE task evaluation | `itbench` | diagnosis = entities + propagation chain + conditions |

## The same ground truth, seven ways

One IR `GroundTruth` is projected onto each contract. This table is the fastest way to
understand what a downstream benchmark can actually see:

| IR concept | OpenRCA 1.0 | OpenRCA 2.0 | RCAEval | RCA100 | AIOps2025 | Cloud-OpsBench | ITBench |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Root-cause component | `prediction["1"]["root cause component"]` | `root_cause.component` | directory name | `root_cause_entities[]` | `service` | `result.fault_object` | `diagnosis.entities[0]` |
| Root-cause reason | `prediction["1"]["root cause reason"]` | – | – | `raw_ground_truth.reasoning` | `fault_description` | – | `scenario_description` |
| Fault type | – | `root_cause.fault_type` | directory name | `root_cause_types[]` | `fault_type` | `result.root_cause` | `scenario_class` |
| Onset time | `occurrence_datetime` (UTC+8) | – | `inject_time.txt` (unix s) | `alert_window` | `start_time` | – | – |
| Causal chain | – | `causal_path[]` | – | `raw_ground_truth.reasoning.steps[]` | `key_observations` | – | `fault_propagation_chain[]` |
| Evidence ⟨comparator, value, unit⟩ | – | `causal_path[].evidence[]` | – | `...steps[].checkpoints[]` | `key_observations.metric[]` | – | `fault_conditions[]` |
| Topology | – | (resolution only) | – | `topology.json` | – | – | – |
| Answer key isolated | ✅ `record.csv` | ⚠️ same file | ⚠️ same dir | ✅ `answer_key/` | ✅ separate file | ⚠️ same file | ⚠️ same file |

## Verified examples

Every example in the per-format docs is **generated, not hand-written**.
`scripts/gen-examples.mjs` runs the real exporters over
[`examples/order-prod/bundle.json`](../examples/order-prod/bundle.json) and rewrites:

- the field tables (`<!-- fields: … -->` markers), from
  [`scripts/format-spec.mjs`](../scripts/format-spec.mjs);
- the example blocks (`<!-- example: … -->` markers), from the actual exported bytes.

```bash
pnpm examples:gen     # regenerate site/assets/data.js and sync the doc examples
pnpm examples:check   # fail in CI when the committed artefacts are stale
```

So a documented field can never silently drift from the code that emits it.
