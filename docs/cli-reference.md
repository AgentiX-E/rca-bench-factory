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
| `ingest` | Ingest a prime dataset slice (official benchmark data) into an IR bundle |
| `transform` | Apply transform rules (the 7 strategies) to source records |
| `case` | Assemble an IR bundle from a case draft (normalises the fault) |
| `gate` | Run the G1–G5 quality gates on an IR bundle |
| `export` | Export an IR bundle (`bundle.json`) to OpenRCA 1.0/2.0 / RCAEval / RCA100 / AIOps2025 / Cloud-OpsBench / ITBench |
| `score` | Score an exported directory against a target field contract |
| `official` | Run the published metric of a target against an export: oracle + mutation grid |
| `report` | Render coverage, gates and score into a self-contained HTML report |
| `pack` | Pack a directory into a byte-reproducible `tar.gz` with a SHA-256 manifest |
| `evolve` | Propose, approve, reject or roll back a self-evolution (HITL + red lines) |

## Getting help

Every command accepts `--help` (or `-h`), and `help <command>` is equivalent.
The per-command reference is generated from the same table the parser reads, so
it cannot list a flag the command rejects:

```bash
rca-bench ingest --help
rca-bench help gate
rca-bench export -h
```

Help is not a way past a bad command name: `rca-bench frobnicate --help` still
fails with `unknown command 'frobnicate'`, because a typo silently answered with
usage text teaches the caller nothing.

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

### `rca-bench ingest`

```text
rca-bench ingest --source ./official-data --target rcaeval --cases cases.json
                 [--system tt] [--output bundle.json]
                 [--entities '[...]'] [--edges '[...]']
                 [--lead-ms 600000] [--lag-ms 600000]
```

- The `ingest` half of the round trip: it turns an official dataset slice into an
  `IrBundle`, which `export` then turns back into the target's own layout and
  `official` scores with the published metric.
- Valid `--target` values: `rcaeval`, `openrca-1.0`, `openrca-2.0`, `rca100`,
  `aiops2025`, `cloud-opsbench`, `itbench`.
- `--cases` is a JSON array of case descriptors. Each carries `caseId`,
  `component`, `faultType` and `injectTime`, and may add `window`, `query`,
  `difficulty`, `pathPrefixes` and per-file `files` overrides:
  ```json
  [
    {
      "caseId": "RE2-ts-order-service-cpu_1",
      "component": "ts-order-service",
      "faultType": "cpu",
      "injectTime": "2025-03-01T00:10:00.000Z"
    }
  ]
  ```
- **Labels are never inferred.** The component, the fault type and the injection
  time are read from the descriptor and validated against the telemetry; a
  component that is neither observed in the data nor declared as an entity fails
  the run. This is what keeps the reproduction honest — a guessed label would
  make the round trip score against itself.
- `--entities` declares an entity the telemetry does not carry. A root-cause
  component that failed before the observation window opened leaves no trace in
  `service.name`, so no entity can be inferred for it and the run stops with
  `does not resolve to an entity in the graph`. Supplying the missing service
  resolves the case:
  ```bash
  rca-bench ingest --source ./official-data --target rcaeval --cases cases.json \
    --entities '[{"entityId":"service:rcaeval/ts-absent","kind":"service","name":"ts-absent","aliases":[]}]'
  ```
  The value is inline JSON, matching `--layout` and `--anchors`, and each entry
  is validated against the same entity contract the IR uses. An empty array is
  rejected: a declaration that declares nothing is a mistake, not a no-op.
- `--edges` adds topology edges the telemetry does not express, as inline JSON in
  the `{ "from", "to", "relation" }` shape, where `relation` is one of
  `contains`, `hosts`, `calls`, `same_as`. Endpoints must be entity ids that
  exist in the graph.
- Both flags are checked before the bundle is written, so an inconsistent
  declaration cannot leave an artefact behind. A declaration is inconsistent
  when it carries a blank `entityId`, `name`, `alias`, `from` or `to`; an
  out-of-contract `relation`; or an endpoint no entity in the finished graph
  matches. The last check runs against the **assembled** graph, not against the
  declarations alone, so an edge may point at an entity that telemetry proves
  without anyone having to declare it. The offending field is named in the
  error, and a dangling endpoint is reported in preference to a blank one when
  both are present, because it names the entity that is actually missing.
  Avoiding the check does not help: `rca-bench gate` raises the same defect as
  `G2/DANGLING_EDGE_REF`, but only after a bundle that violates it already
  exists on disk. Both sites call the same detector, so they cannot disagree
  about what "dangling" means.
- Files are routed to cases by `pathPrefixes`. A case without prefixes claims
  every file left over; a file claimed by no case is reported in `unclaimed`.
- The window defaults to ten minutes either side of `injectTime`; `--lead-ms`
  and `--lag-ms` override it, and `--lag-ms` defaults to the lead when only the
  lead is given. Both are non-negative integers.
- A case that could not be read at all is reported as a `hardErrors` entry on
  stderr without failing the run. Non-zero `hardErrors` must be treated as "that
  case was not reproduced".
- The bundle is written to `--output` or to stdout.

**Round trip.** The three commands compose into the L4 verification:

```bash
rca-bench ingest --source ./official-data --target rcaeval --cases cases.json --output bundle.json
rca-bench export --target rcaeval --suite RE2 --input bundle.json --out-dir ./roundtrip
rca-bench official --target rcaeval-re2 --dir ./roundtrip
```

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
- The bundle must also be **internally consistent**, which the schema cannot
  express. An edge naming an entity the file never declares, or a relation
  outside `contains|hosts|calls|same_as`, is rejected before anything is written,
  with exit code 1 and no output directory left behind:
  ```text
  error: bundle is not exportable: DANGLING_EDGE_REF: edge.to references 'service:tt/ghost' which is not an entity. Run `rca-bench gate` to see every violation.
  ```
  This matters most for `rca100`, whose `topology.json` types an unknown endpoint
  as `external`. Without the guard the invented endpoint is *labelled* as an
  observed external dependency, so a consumer cannot tell it from a real one.
- Every target runs the same check, including the four that never read `graph`
  (`openrca-1.0`, `rcaeval`, `cloud-opsbench`, `itbench`). A bundle describes one
  system, so target selection must not decide whether a contradiction is caught.
- Only **graph** inconsistency is fatal here. A case-level defect — a root cause
  that does not resolve, a signal naming a service outside the graph — is
  skipped per case and the remaining cases still export, matching how
  `rca-bench gate` *quarantines* rather than rejects such a bundle.

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

### `rca-bench official`

```text
rca-bench official --input bundle.json [--output official.json]
rca-bench official --target openrca-1.0 --dir ./out [--allow-empty-reason 'reason']
```

Runs the **published metric** of a target - not the field contract - against real
exporter output, in two disjoint modes:

- `--input <bundle.json>` exports the bundle for **all nine** score targets and
  runs the whole regression grid on each. This is the end-to-end guarantee.
- `--target <t> --dir <dir>` runs one target against an already exported
  directory, so a dataset produced elsewhere can still be verified.

Mixing the two modes is rejected rather than silently ignored.

Every report carries the oracle score, the per-facet mutation grid, the metric
provenance (`official` for a metric transcribed from the upstream scorer,
`derived` for one reconstructed from the paper) and any failures. Three
properties are asserted per case:

| Property | What it proves |
| --- | --- |
| `oraclePerfect` | Submitting the exported answer key scores 1.0 - a missing or malformed field breaks it immediately |
| `mutationsDegrade` | Perturbing a facet the rule scores lowers the score, so the metric is not vacuously returning 1 |
| `unscoredFacetsInert` | Perturbing a facet the rule ignores does nothing, so the declared facet list is exactly right |

A target that exports zero cases **fails** unless `--allow-empty-reason` states
why that is legitimate for this dataset, so a broken exporter cannot hide behind
a skip. Exit code is 0 when no target failed, 1 otherwise.

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

### `rca-bench pack`

```text
rca-bench pack --input <dir> --output <file.tar.gz> [--prefix <name>]
```

- Writes a **byte-reproducible** ustar archive: entries are sorted by path, and
  `mtime`, `uid` and `gid` are pinned to zero, so the same inputs always produce
  the same bytes (and therefore the same digest) on any machine.
- Adds `MANIFEST.json` at the pack root with the byte length and SHA-256 of every
  file, so a recipient can verify what they extracted without trusting the
  transport. `--prefix` nests the files but is stripped from the manifest, so the
  manifest always describes the pack from its own root.
- Refuses an input directory that already contains `MANIFEST.json`, rather than
  silently overwriting it.
- Prints a summary on stdout and exits `0`:

```json
{
  "output": "pack.tar.gz",
  "fileCount": 2,
  "totalBytes": 17,
  "archiveBytes": 204,
  "sha256": "…"
}
```

- `pnpm examples:bundle` uses the same machinery to build the downloadable
  example pack served by the site (`site/assets/rca-bench-factory-examples.tar.gz`),
  and `pnpm examples:bundle:check` fails CI when the committed artefact is stale.

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
