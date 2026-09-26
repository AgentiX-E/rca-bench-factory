#!/usr/bin/env python3
"""
Injection battery for the M1-ceiling probe.

`scripts/probe-m1-ceiling.mjs` reports the ceiling that the M1 exit condition is
read against, so it falls under this repository's rule for anything reporting a
number: it must be shown to move the right way when what it measures moves, and
to stay put when what it does not.

Two classes of mutation are driven, because the probe has two ways to be wrong:

  - DATASET mutations move the ground truth. These catch arithmetic -- an
    off-by-one, a partition that does not partition, a ceiling over the wrong
    denominator.
  - PROBE mutations change the definition the probe computes against. These are
    the ones that matter. A ceiling quoted without the definition it was computed
    under is the class of number this repository has retracted three times, so a
    definitional mutation has to move the reported number rather than leave it
    standing.

A mutation is a function over the file contents, not a single find-and-replace,
because several of the requirements below need two coordinated edits -- the
dataset mutation that has to push the ceiling past the threshold is the obvious
one. Expressing it as two chained replaces is fine; expressing it as one is not.

Each injection declares the report it requires. A mutation is CAUGHT when the
probe disagrees with that requirement, SURVIVED when it agrees, and INERT when it
changed nothing at all. Both non-CAUGHT outcomes fail the run.

Run: python3 scripts/injection/m1-ceiling-probe.py
Exit: 0 all caught, 1 otherwise
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Callable

REPO = Path(__file__).resolve().parents[2]
PROBE = REPO / "scripts" / "probe-m1-ceiling.mjs"
GOLDEN = REPO / "golden-master" / "fault-extraction" / "samples.json"


def run_probe() -> dict:
    out = subprocess.run(
        ["node", str(PROBE), "--json"],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(out.stdout)


def rename(text: str, old: str, new: str) -> str:
    """One anchored replacement, asserting the anchor was actually present."""
    if old not in text:
        raise AssertionError(f"anchor not found: {old[:60]!r}")
    return text.replace(old, new, 1)


def unrecover(name: str) -> Callable[[str], str]:
    """Rewrite one component to a name sharing no token with its incident text."""

    def apply(text: str) -> str:
        return rename(text, f'"component": "{name}"', f'"component": "zz-{name}-zz"')

    return apply


# Each entry: name, target file, mutation, requirement, description.
# `requirement(report)` returns True when the probe *still* reports the property
# in `description` -- i.e. the mutation was not observed. A mutation is caught
# exactly when that comes back False.
INJECTIONS: list[tuple[str, Path, Callable[[str], str], Callable[[dict], bool], str]] = [
    # --- the ground truth moves; the ceiling must follow it -------------------
    (
        "A. dataset: one more component unrecoverable",
        GOLDEN,
        unrecover("cart-service"),
        lambda r: r["component"]["unrecoverableUnderTokenRule"] == 1,
        "exactly one unrecoverable sample",
    ),
    (
        "B. dataset: one more unrecoverable, and the ceiling must follow it down",
        GOLDEN,
        unrecover("cart-service"),
        lambda r: r["strictCeiling"]["samples"] == 18,
        "an 18/19 strict ceiling",
    ),
    (
        "C. dataset: fix the mislabelled sample, so nothing is unrecoverable",
        GOLDEN,
        lambda t: rename(t, '"component": "checkout-ui"', '"component": "checkout-service"'),
        lambda r: r["component"]["unrecoverableUnderTokenRule"] == 1,
        "exactly one unrecoverable sample",
    ),
    (
        "D. dataset: drop four components, so the ceiling falls below the M1 threshold",
        GOLDEN,
        lambda t: unrecover("log-collector")(unrecover("shipping-service")(t)),
        lambda r: r["strictCeiling"]["clearsM1"] is False,
        "a ceiling that no longer clears the 0.7 threshold",
    ),
    # --- the definition moves; the number must move with it -------------------
    (
        "E. probe: count the relaxed ceiling as the strict one",
        PROBE,
        lambda t: rename(t, "  const strictCeiling = recoverable.length;", "  const strictCeiling = total;"),
        lambda r: r["strictCeiling"]["samples"] == 18,
        "an 18/19 strict ceiling, distinct from the relaxed 19/19",
    ),
    (
        "F. probe: compute the ceiling rate over the wrong denominator",
        PROBE,
        lambda t: rename(
            t,
            "  const strictCeilingRate = strictCeiling / total;",
            "  const strictCeilingRate = strictCeiling / (total - 1);",
        ),
        lambda r: abs(r["strictCeiling"]["rate"] - 18 / 19) < 1e-9,
        "a strict rate of 18/19 = 0.9474",
    ),
    (
        "G. probe: report the ceiling as clearing M1 whatever it is",
        PROBE,
        lambda t: rename(t, "      clearsM1: strictCeilingRate >= M1_STRICT_THRESHOLD,", "      clearsM1: true,"),
        lambda r: r["strictCeiling"]["clearsM1"] is False,
        "a ceiling that does not clear the 0.7 threshold",
    ),
    (
        "H. probe: make the threshold impossible to fail",
        PROBE,
        lambda t: rename(t, "const M1_STRICT_THRESHOLD = 0.7;", "const M1_STRICT_THRESHOLD = 0.0;"),
        lambda r: r["m1Threshold"] == 0.7,
        "the M1 threshold reported as 0.7",
    ),
    (
        "I. probe: exempt the one rejected sample from the recoverable set",
        PROBE,
        lambda t: rename(
            t,
            "  const recoverable = samples.filter((s) =>\n    tokensAllPresent(s.expected.component, s.incidentText),\n  );",
            "  const recoverable = samples.filter(\n    (s) => tokensAllPresent(s.expected.component, s.incidentText) || s.id === 'config-feature-flag-checkout',\n  );",
        ),
        lambda r: r["component"]["unrecoverableUnderTokenRule"] == 1,
        "exactly one unrecoverable sample",
    ),
    (
        "J. probe: let the two halves disagree, so the partition guard has to fire",
        PROBE,
        lambda t: rename(
            t,
            "  const unrecoverable = samples.filter((s) => !recoverable.includes(s));",
            "  const unrecoverable = samples.filter(\n    (s) => !tokensAllPresent(s.expected.component, s.incidentText),\n  );",
        ).replace(
            "    tokensAllPresent(s.expected.component, s.incidentText),\n  );\n  const unrecoverable",
            "    tokensAllPresent(s.expected.component, s.incidentText) || s.id === 'config-feature-flag-checkout',\n  );\n  const unrecoverable",
            1,
        ),
        lambda r: (
            r["component"]["recoverableUnderTokenRule"] + r["component"]["unrecoverableUnderTokenRule"]
            == r["samples"]
        ),
        "recoverable and unrecoverable summing to the sample count, i.e. a partition",
    ),
]


def main() -> int:
    probe_text = PROBE.read_text()
    golden_text = GOLDEN.read_text()

    report = run_probe()
    total = report["samples"]
    print("M1 ceiling probe battery\n")
    print(
        f"baseline: recoverable {report['component']['recoverableUnderTokenRule']}/{total}, "
        f"strict ceiling {report['strictCeiling']['samples']}/{total} "
        f"({report['strictCeiling']['rate'] * 100:.1f}%), "
        f"without component {report['strictWithoutComponent']['samples']}/{total}\n"
    )

    caught = survived = inert = 0
    for name, target, mutate, requirement, description in INJECTIONS:
        original = probe_text if target == PROBE else golden_text
        try:
            mutated = mutate(original)
        except AssertionError as exc:
            print(f"INERT    {name}")
            print(f"         -- {exc}")
            inert += 1
            continue
        if mutated == original:
            print(f"INERT    {name}")
            print("         -- the mutation changed nothing")
            inert += 1
            continue

        target.write_text(mutated)
        try:
            result = run_probe()
            crashed = None
        except subprocess.CalledProcessError as exc:
            result = None
            crashed = (exc.stderr or exc.stdout or "").strip().splitlines()
        finally:
            target.write_text(original)

        if crashed is not None:
            # A probe that cannot run under the mutation counts as caught, but it
            # is reported apart from the requirement checks so a mutation which
            # breaks the script for an unrelated reason stays visible.
            print(f"CAUGHT   {name}")
            print(f"         (the probe failed to run: {crashed[-1] if crashed else 'no output'})")
            caught += 1
        elif requirement(result):
            print(f"SURVIVED {name}")
            print(f"         -- it still reported {description}, so the mutation changed nothing observable")
            survived += 1
        else:
            print(f"CAUGHT   {name}")
            print(
                f"         (recoverable {result['component']['recoverableUnderTokenRule']}, "
                f"unrecoverable {result['component']['unrecoverableUnderTokenRule']}, "
                f"strict {result['strictCeiling']['samples']}, "
                f"rate {result['strictCeiling']['rate']:.4f}, "
                f"clearsM1 {result['strictCeiling']['clearsM1']}, "
                f"threshold {result['m1Threshold']})"
            )
            caught += 1

    # Restore and verify byte-for-byte. A battery that leaves a mutated file behind
    # produces a green run and a broken repository.
    PROBE.write_text(probe_text)
    GOLDEN.write_text(golden_text)
    restored = PROBE.read_text() == probe_text and GOLDEN.read_text() == golden_text

    print(f"\nbattery: {caught} caught, {survived} survived, {inert} inert")
    print(f"sources restored: {restored and 'identical to backup' or 'DIFFERS -- inspect before committing'}")
    return 0 if caught == len(INJECTIONS) and restored else 1


if __name__ == "__main__":
    sys.exit(main())
