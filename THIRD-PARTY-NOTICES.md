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
| RCAEval (RMIT) | Apache-2.0 (code) | `RE1` / `RE2` / `RE3` field contract | Nothing |
| RCA100 / AgenticOpsEval | **CC BY-NC-SA 4.0** | Six-modality field contract | **Nothing — data is non-commercial & share-alike** |
| Cloud-OpsBench | Research terms | State-snapshot paradigm | Nothing |
| AIOps2025 | Research terms | Multi-modality contract | Nothing |
| ITBench / AIOpsLab / SREGym | Apache-2.0 / MIT | Agent-task contract | Nothing |
| CausalRCA / RUN | **No License** | Schema shape only | **Nothing — must not be vendored** |

## Our own licensing

- **Code** — [Apache-2.0](LICENSE).
- **IR schema & field contracts** — **CC BY 4.0** (intentionally no `NC`/`SA`, so the
  contracts stay freely usable for any downstream benchmark work).

## Why we ship "verification anchors" instead of data

The open-source paradox: we cannot redistribute a 68 GB CC BY-NC-SA dataset, but we
still must prove our exporter is compliant. The solution is **external grounding**:

- We ship `golden-master/` containing *checksums and expected outputs* (anchors), not
  licensed content.
- A `fetch-and-verify.sh` script downloads the official data from its canonical source
  (with your own agreement to its license) and verifies it against the anchors.

This keeps every claim of compliance independently verifiable without us ever hosting
data we are not licensed to host.

## Citation obligations

If you publish a benchmark produced by this tool that is derived from a licensed
upstream dataset, you must retain the upstream attribution required by its license
and cite the original authors. The tool preserves source provenance in the IR
(`FieldProvenance` / case `environment.checksums`) so attribution is never lost.
