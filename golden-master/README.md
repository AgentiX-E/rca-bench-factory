# Golden Master

The Golden Master is the **external grounding** that turns "the output looks right"
into "the output is provably byte-stable and compliant".

## Files

| File | Purpose |
| --- | --- |
| `fixture.json` | A self-contained IR bundle (one fault case with metrics, logs, traces, an event and an alert). No licensed data. |
| `expected.json` | Committed SHA-256 anchors for every file the exporters emit from `fixture.json`. |
| `verify.mjs` | Re-exports `fixture.json` through the current build and diffs against the anchors. |
| `fetch-and-verify.sh` | Runs the self-contained check, then prints how to repeat it against official archives you download yourself (see [THIRD-PARTY-NOTICES](../THIRD-PARTY-NOTICES.md)). Performs no network access. |

## Run

```bash
pnpm build
node golden-master/verify.mjs
```

A pass means the OpenRCA and RCAEval exporters produce byte-identical output for the
fixture — the first guarantee that a benchmark is usable and compliant. The second
guarantee is the [mutation suite](../docs/acceptance.md#l3--gate-soundness-mutation-testing),
which proves the quality gates themselves still work.

## Why anchors, not data

Upstream benchmark datasets (e.g. RCA100 is CC BY-NC-SA, CausalRCA/RUN has no
license) cannot be redistributed. We therefore ship only the *verification anchors* —
checksums and expected outputs derived from our own fixture — plus instructions for
repeating the check against official data you have downloaded yourself.

Two guarantees, and it matters which is which:

| Anchor | Input | What it can prove |
| --- | --- | --- |
| Golden Master (`verify.mjs`) | our own fixture | our output is **stable** — nothing changed under it |
| Round trip (`rca-bench ingest` → `export` → `official`) | official data | our output is **right** — someone else's data reproduces |

The Golden Master is self-anchored: it compares our exporter against our own
expectations, so a shared misunderstanding would leave it green. Only the round trip
takes foreign data as input. Neither script in this directory accesses the network.
