#!/usr/bin/env python3
"""Does `verify-scorer-stability.mjs` actually refuse when the scorer loses a property?

The gate asserts six properties. A property that cannot fail is a comment with a
print statement, so the question this battery answers is not "does it pass" but
"which of the six has a mutation that makes it fail".

Each mutation is applied to the BUILT scorer (`packages/core/dist/fault/...`),
because that is what the gate imports -- `scripts/verify-scorer-stability.mjs`
dynamically imports `dist`, never `src`. Mutating `src` would require a rebuild and
would test the build, not the gate.

Three outcomes per mutation:
  CAUGHT          -- the gate exited non-zero and named the property
  SURVIVED        -- the gate exited zero: the property is not enforced by this path
  INERT           -- the anchor was not found, so nothing was mutated (not a result)

Plus one expected state, which is not a failure and not a pass:
  EXPECTED-GUARDED -- the mutation is refused upstream of the gate by a different
                      guard in the scorer. The property holds, but for a reason the
                      gate's own check never gets to observe. Listed by name in
                      EXPECTED_GUARDED below so it stays visible instead of being
                      quietly folded into CAUGHT.

Run: python3 scripts/injection/scorer-stability-probe.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DIST = ROOT / "packages" / "core" / "dist" / "fault" / "extraction-scoring.js"
GATE = ROOT / "scripts" / "verify-scorer-stability.mjs"

# (label, anchor, replacement, expected property name in the gate's output)
MUTATIONS: list[tuple[str, str, str, str | None]] = [
    (
        # Property 1: a second call must return the identical report. A counter is
        # used rather than `Date.now()` because two adjacent calls land in the same
        # millisecond, so a clock-stamp mutation passes about as often as it fails
        # -- a flaky detector would report the property as enforced half the time
        # and as a gap the other half. The counter makes the mutation deterministic.
        "determinism: stamp the report with a call counter",
        "return {\n        total,\n        counts,",
        "return {\n        generatedAt: (buildExtractionReport.n = (buildExtractionReport.n ?? 0) + 1),\n        total,\n        counts,",
        "determinism",
    ),
    (
        # Property 2: the scorer must not mutate the dataset it grades. The gate
        # snapshots `samples` as JSON before and after, so only a write to the
        # caller's own objects is visible -- reordering an internal array is not,
        # and an earlier draft of this mutation reordered an internal one and was
        # reported as a survivor for that reason rather than a real one.
        "input purity: write back onto the caller's sample",
        "    const paired = samples.map((s) => {\n        const p = byId.get(s.id);",
        "    const paired = samples.map((s) => {\n        s.scored = true;\n        const p = byId.get(s.id);",
        "input purity",
    ),
    (
        # Property 3: the rates must not depend on prediction order. Pairing is by
        # id through a Map, so this replaces the lookup with a positional one.
        #
        # This mutation is classified EXPECTED-GUARDED rather than CAUGHT: the scorer
        # refuses a positional pairing outright in `scoreExtractionSample`, whose
        # id-mismatch throw fires before any rate is computed. The property therefore
        # holds for a stronger reason than the gate's report comparison, and the gate
        # cannot name it because it never gets that far. Recorded rather than removed,
        # because "the guard is upstream" is a fact worth keeping visible.
        "order independence: pair predictions by position",
        "        const p = byId.get(s.id);",
        "        const p = predictions[samples.indexOf(s)] ?? byId.get(s.id);",
        "order independence",
    ),
    (
        # Property 4a: samplesWithMisses must equal the graded samples with a miss.
        # The counter is incremented for every graded pair regardless of whether it
        # had one, so a report with a clean sample would over-count.
        #
        # Note on a rejected mutation: changing `detail.length > 0` to `>= 0` looks
        # like it breaks this and does not -- `detail` only ever grows by `push`, so
        # it is never negative and the two predicates are equivalent. That is an
        # equivalent mutant, and scoring it as a survivor would have been a false
        # report about the gate.
        "denominator: count every graded pair as having a miss",
        "        if (detail.length > 0) {\n            misses.push",
        "        if (true) {\n            misses.push",
        "denominator",
    ),
    (
        # Property 4b: wrongValue + omitted must equal the detail rows.
        "denominator: stop counting the omitted half",
        "missClassification.omitted += 1;",
        "missClassification.omitted += 0;",
        "denominator",
    ),
]


# Mutations whose property is enforced by a guard the gate does not itself reach.
# Named with the guard so a reader can check the claim rather than trust the label.
EXPECTED_GUARDED: dict[str, str] = {
    "order independence: pair predictions by position": (
        "scoreExtractionSample throws on an id mismatch before any rate is computed"
    ),
}


def run_gate() -> tuple[int, str, str]:
    proc = subprocess.run(
        ["node", str(GATE)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=300,
    )
    return proc.returncode, proc.stdout, proc.stderr


def main() -> int:
    if not DIST.exists():
        print(f"built scorer not found at {DIST}; run `pnpm build` first")
        return 2

    backup = DIST.read_text(encoding="utf8")
    caught = 0
    guarded: list[str] = []
    survived: list[str] = []
    inert: list[str] = []

    try:
        for label, anchor, replacement, property_name in MUTATIONS:
            source = DIST.read_text(encoding="utf8")
            if anchor not in source:
                inert.append(label)
                print(f"INERT     {label}")
                print("          anchor not found in the built scorer")
                continue
            mutated = source.replace(anchor, replacement, 1)
            if mutated == source:
                inert.append(label)
                print(f"INERT     {label}")
                continue
            DIST.write_text(mutated, encoding="utf8")

            code, out, err = run_gate()
            combined = out + err

            if code != 0:
                named = property_name is None or property_name in combined
                if named:
                    caught += 1
                    print(f"CAUGHT    {label}")
                elif label in EXPECTED_GUARDED:
                    guarded.append(label)
                    print(f"GUARDED   {label}")
                    print(f"          refused upstream: {EXPECTED_GUARDED[label]}")
                else:
                    # Failed, but not for the reason under test -- a different guard
                    # fired first. Counting that as caught would credit this property
                    # with a failure it did not produce.
                    survived.append(f"{label} (failed, but not on '{property_name}')")
                    print(f"SURVIVED  {label}")
                    print(f"          exited {code} without naming '{property_name}'")
                    for line in combined.splitlines():
                        if line.startswith("FAIL"):
                            print(f"          {line}")
            else:
                if label in EXPECTED_GUARDED:
                    # It was supposed to be refused upstream and was not, so the
                    # claim in EXPECTED_GUARDED is now wrong -- that is a real
                    # failure, not an expected survivor.
                    survived.append(f"{label} (expected upstream guard did not fire)")
                    print(f"SURVIVED  {label}")
                    print("          expected an upstream guard to refuse it; gate exited 0")
                else:
                    survived.append(label)
                    print(f"SURVIVED  {label}")
                    print("          gate exited 0 with the property broken")

            DIST.write_text(source, encoding="utf8")
    finally:
        DIST.write_text(backup, encoding="utf8")

    restored = DIST.read_text(encoding="utf8") == backup
    print()
    print(
        f"battery: {caught} caught, {len(guarded)} guarded upstream, "
        f"{len(survived)} survived, {len(inert)} inert"
    )
    print(f"source restored: {'identical to backup' if restored else 'DIFFERS FROM BACKUP'}")
    if not restored:
        return 2
    return 1 if (survived or inert) else 0


if __name__ == "__main__":
    sys.exit(main())
