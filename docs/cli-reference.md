# CLI reference

`rca-bench` is the runnable command-line entrypoint in `@rca-bench-factory/cli`.
It orchestrates the core library over real files: ingest a flat source, apply
transform rules, run the quality gates, export an IR bundle to a target contract,
and score an exported dataset.

## Implemented commands

| Command | What it does |
| --- | --- |
| `help` | Print usage |
| `version` | Print the semantic version |
| `source` | Ingest a flat file (CSV/TSV/JSONL/JSON) into IR signals |
| `transform` | Apply transform rules (the 7 strategies) to source records |
| `case` | Assemble an IR bundle from a case draft (normalises the fault) |
| `gate` | Run the G1–G5 quality gates on an IR bundle |
| `export` | Export an IR bundle (`bundle.json`) to OpenRCA 1.0/2.0 / RCAEval / RCA100 / AIOps2025 / Cloud-OpsBench / ITBench |
| `score` | Score an exported directory against a target field contract |
| `report` | Render coverage, gates and score into a self-contained HTML report |
| `evolve` | Propose, approve, reject or roll back a self-evolution (HITL + red lines) |

### `rca-bench source`

```text
rca-bench source --path telemetry.csv [--format csv] [--signal-kind metric]
                 [--layout '{"timestamp":"ts",...}'] [--output out.json]
                 [--time-layout iso8601] [--assume-offset-minutes 480]
                 [--delimiter ,] [--has-header] [--service-name order]
```

- `--layout` is optional: when omitted, the layout is auto-detected from the first
  record's column names.
- Without `--output`, the `{ signals, quarantine }` result is written to stdout.
- Every non-empty source record is either a signal or a quarantine entry — never
  silently dropped.

### `rca-bench transform`

```text
rca-bench transform --input source.json --rules rules.json [--output out.json] [--id-field id]
```

- `--input` and `--rules` are JSON arrays of source records and `TransformRule`s.
- The result (`outputs`, `quarantined`, `counts`) is written to stdout or `--output`.
- `inputCount === outputCount + quarantineCount` is guaranteed by the engine.

### `rca-bench case`

```text
rca-bench case --input draft.json [--output bundle.json]
```

- `draft.json` is a loose authoring draft: `graph` + `case` (fault type as a free
  string, optional category) + `signals`.
- The fault type is normalised and its category inferred when absent; the finished
  bundle is validated against `irBundleSchema`.
- The assembled `IrBundle` is written to stdout or `--output`.

### `rca-bench gate`

```text
rca-bench gate --input bundle.json --target openrca-1.0 [--gate-run-id id]
```

- `--target` selects the G1 structural contract (required signal kinds + whether a
  natural-language query is required). Valid targets: `openrca-1.0`,
  `openrca-2.0`, `rcaeval-re1`/`re2`/`re3`, `rca100`, `aiops2025`,
  `cloud-opsbench`, `itbench`.
- The five-gate report (`results` + `finalStatus`) is written to stdout.

### `rca-bench export`

```text
rca-bench export --target openrca-1.0 --input bundle.json --out-dir ./out
rca-bench export --target openrca-2.0 --input bundle.json --out-dir ./out
rca-bench export --target rcaeval --suite RE2 --input bundle.json --out-dir ./out
rca-bench export --target rca100 --input bundle.json --out-dir ./out
rca-bench export --target aiops2025 --input bundle.json --out-dir ./out
rca-bench export --target cloud-opsbench --input bundle.json --out-dir ./out
rca-bench export --target itbench --input bundle.json --out-dir ./out
```

- `bundle.json` is validated against `irBundleSchema` before export; a malformed
  or schema-invalid bundle fails with exit code 1.

### `rca-bench score`

```text
rca-bench score --target openrca-1.0 --dir ./out [--anchors '{"path":"sha256"}']
rca-bench score --target openrca-2.0 --dir ./out
rca-bench score --target aiops2025 --dir ./out
rca-bench score --target cloud-opsbench --dir ./out
rca-bench score --target itbench --dir ./out
```

- `--dir` is read recursively into the exported-file map.
- `--anchors` (optional) adds SHA-256 Golden-Master verification.
- Exit code is 0 when the report passes, 1 when it fails (so CI can gate on it).

### `rca-bench report`

```text
rca-bench report --input bundle.json [--title "Report"] [--target openrca-1.0] [--output report.html]
```

- Renders a self-contained HTML page with four sections: the entity graph
  (entities + edges + reference-integrity verdict), observability coverage,
  quality gates (G1–G5) and the score for `--target`.
- `--target` selects the score/gate contract (default `openrca-1.0`); the bundle
  is exported and scored for that target internally.
- `--title` defaults to `rca-bench report`; `--output` defaults to stdout.
- All user-controlled data (title, entity ids, case ids, violation messages,
  check details) is HTML-escaped before interpolation.

### `rca-bench evolve`

```text
rca-bench evolve propose --input draft.json [--output proposal.json]
rca-bench evolve approve --input proposal.json [--note "reason"] [--output approved.json]
rca-bench evolve reject  --input proposal.json [--note "reason"] [--output rejected.json]
rca-bench evolve stale   --input proposal.json --cases '["case-001", ...]'
```

- `propose` assembles a **pending** evolution proposal from a draft
  (`id`, `layer`, `action`, `trigger`, `changes`, `baselineScore`,
  `candidateScore`, `baseVersion`); the HITL gate (H1–H6) is derived from the
  action and the regression verdict from the score delta.
- `approve` / `reject` move a proposal through the HITL checkpoint; an optional
  reviewer note is attached.
- `stale` returns the affected cases to re-run when a proposal failed its
  regression or was rejected (red line 3: rollback); an approved, passing
  proposal returns nothing to roll back.
- The three red lines are enforced as predicates in the core: a change must be
  diff-able and revertible, an unapproved proposal is never production-ready, and
  a failed/rejected proposal marks its affected cases stale.

## End-to-end example

Every command below runs against [`examples/order-prod/`](../examples/order-prod/) from the
repository root, after `pnpm install && pnpm build`.

```bash
# 1. Ingest an offset-less CSV export (auto-detected columns)
node packages/cli/dist/main.js source \
  --path examples/order-prod/metrics.csv \
  --signal-kind metric \
  --assume-offset-minutes 480

# 2. Normalise timestamps, map CMDB names, convert ratio -> percent
node packages/cli/dist/main.js transform \
  --input examples/order-prod/records.json \
  --rules examples/order-prod/rules.json

# 3. Assemble and validate a bundle (fault category is inferred)
node packages/cli/dist/main.js case \
  --input examples/order-prod/draft.json --output ./bundle.json

# 4. Run the quality gates for a target contract
node packages/cli/dist/main.js gate --input examples/order-prod/bundle.json --target rca100

# 5. Export, score and render
node packages/cli/dist/main.js export --target rca100 \
  --input examples/order-prod/bundle.json --out-dir ./out
node packages/cli/dist/main.js score --target rca100 --dir ./out
node packages/cli/dist/main.js report --input examples/order-prod/bundle.json \
  --target rca100 --output report.html

# 6. Self-evolution under human review
node packages/cli/dist/main.js evolve propose --input examples/order-prod/proposal-draft.json
```

The same lifecycle is walked through step by step, with real output, in the
[user guide](user-guide.md).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Invocation or data error (bad flag, missing file, invalid bundle, failing score) |

## Not yet implemented

`init` (workspace scaffolding) is planned but not yet wired into the CLI. See
[architecture.md](architecture.md) for where it sits.
