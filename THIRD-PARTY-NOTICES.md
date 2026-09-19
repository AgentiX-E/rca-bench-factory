# Third-party notices

`rca-bench-factory` does **not** redistribute any upstream benchmark data. It is a
*converter*: it reads data you already hold, normalizes it, and emits datasets that
conform to the target field contract. This file records the licensing posture of
every upstream benchmark we target, so you can stay compliant.

## License matrix

| Benchmark | Upstream license | What we target | What we redistribute |
| --- | --- | --- | --- |
| OpenRCA 1.0 (Microsoft) | MIT (code) / data terms per repo | `query.csv` / `record.csv` / telemetry layout | Nothing |
| OpenRCA 2.0 (PAVE) | MIT (code) | Step-wise causal-path annotation schema | Nothing |
| RCAEval (RMIT) | **MIT (code and datasets)** | `RE1` / `RE2` / `RE3` field contract | Nothing |
| RCA100 / AgenticOpsEval | CC BY-NC-SA 4.0 | Six-modality field contract | Nothing |
| Cloud-OpsBench | Research terms | State-snapshot paradigm | Nothing |
| AIOps2025 | Research terms | Multi-modality contract | Nothing |
| ITBench / AIOpsLab / SREGym | Apache-2.0 / MIT | Agent-task contract | Nothing |
| CausalRCA / RUN | No license (all rights reserved) | Nothing at all — schema shape only | Nothing |

Three of these rows were previously annotated in a way that implied a legal obstacle
where there is none. Correcting them matters because a wrong constraint gets obeyed:
the RCAEval row said Apache-2.0 code-only, which understated it — its README states
that **both** the code it implements **and its datasets** are distributed under MIT.
The CC BY-NC-SA row was flagged "non-commercial", which is true of the *licence* but
not an obstacle to this project. The CausalRCA/RUN row said "must not be vendored",
which is still correct and is the only one of the three that is a actual restriction.

## Which licence terms actually bind us

| Term | Who it binds | Does it bind this repository? |
| --- | --- | --- |
| **NonCommercial** (CC BY-NC-SA §1(11)) | Use "not primarily intended for or directed towards commercial advantage or monetary compensation" | **No.** This is internal, unreleased research; nothing is charged for and nothing is sold |
| **ShareAlike** (CC BY-NC-SA §1(12)) | Providing material "to the public" | **No.** We distribute no upstream material, so no obligation is triggered |
| **MIT attribution** | Anyone redistributing the covered material | **No.** We redistribute nothing, so we carry no notice obligation — and we record provenance anyway |
| **All rights reserved** (no licence) | Anyone copying or redistributing at all | **Yes, in the only way that matters**: we do not copy and we do not redistribute |

The distinction that survives all of this is **fetch versus vendor**. A CI job that
downloads a corpus to `/tmp`, reads it, and discards it with the runner performs no
distribution and creates no derivative work that leaves the machine. Committing that
corpus to git would do both. That is why the rule this repository enforces is not a
licence rule but a hygiene rule: `scripts/check-no-vendored-data.mjs` fails the build
if telemetry-shaped data appears in the tracked tree, and
`scripts/fetch-official.mjs` refuses a destination inside the working tree.

## Our own licensing

- **Code** — [Apache-2.0](LICENSE).
- **IR schema & field contracts** — **CC BY 4.0** (intentionally no `NC`/`SA`, so the
  contracts stay freely usable for any downstream benchmark work).

## Why we ship "verification anchors" instead of data

We ship `golden-master/`, which contains *metadata and expected outputs* — checksums,
case descriptors, target field contracts — and no licensed content. Upstream data is
obtained at check time from its canonical source:

- `golden-master/official-assets.json` is the registry: for each asset, where it
  lives, under what licence, and whether it may be fetched automatically. It records
  `sha256: null` for the corpora, because a digest that was never computed is not
  evidence and a fabricated one would be worse.
- `scripts/fetch-official.mjs` downloads an asset to a path outside the working tree,
  verifies it against the registry digest when one is recorded, and refuses any
  destination under the repository root.
- `golden-master/fetch-and-verify.sh` is the older, self-contained fixture check. It
  prints the external-grounding instructions rather than performing a download, and
  it is retained because the Golden Master verifies it byte-for-byte.

This keeps every compliance claim independently checkable without us ever hosting
data we are not licensed to host — and, more to the point, without us pretending a
licence forbids something it does not.

## Citation obligations

If you publish a benchmark produced by this tool that is derived from a licensed
upstream dataset, you must retain the upstream attribution required by its license
and cite the original authors. The tool preserves source provenance in the IR
(`FieldProvenance` / case `environment.checksums`) so attribution is never lost.
