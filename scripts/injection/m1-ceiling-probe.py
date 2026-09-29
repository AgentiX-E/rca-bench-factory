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

# Every path this battery writes, mapped to the bytes it held beforehand.
#
# The restore check used to name `PROBE` and `GOLDEN` explicitly, which verifies
# the files the author remembered rather than the files the run touched. Measured
# with an eleventh injection targeting `docs/audit.md`: the battery reported
# `0 survived, 0 inert` and `sources restored: identical to backup`, exit 0, while
# 8098 lines of audit had been replaced by the golden fixture and truncated to
# 183. The restore was honest about the two paths it knew and blind to the third.
#
# Recording the writes makes the restored set a consequence of running rather
# than a list to maintain, so a target added later is covered by construction --
# which is the only way a check can protect a file that does not exist yet.
_WRITTEN: dict[Path, str] = {}


def write_recorded(path: Path, text: str) -> None:
    """Write `path`, remembering its prior bytes the first time it is touched."""
    if path not in _WRITTEN:
        _WRITTEN[path] = path.read_text()
    path.write_text(text)


def restore_recorded() -> bool:
    """Put every recorded file back and report whether all of them match.

    The empty case is refused rather than accepted. `all(...)` over an empty
    mapping is `True`, so a battery that recorded nothing would report
    `sources restored: identical to backup` having verified nothing at all --
    the same vacuous pass this recorder exists to remove, reintroduced by the
    shape of the check. Measured: with recording disabled the battery printed
    `files written and restored: 0` and `identical to backup` in the same run.

    Requiring at least one recorded file makes the check falsifiable. A battery
    with no writes is a battery whose injections never applied, which is already
    INERT and already a failure.
    """
    if not _WRITTEN:
        return False
    for path, original in _WRITTEN.items():
        path.write_text(original)
    return all(path.read_text() == original for path, original in _WRITTEN.items())


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


# The baseline the probe reports on the unmutated dataset, captured before any
# mutation runs. Every requirement below is expressed relative to it rather than
# against a literal, and that is a correction this battery needed.
#
# The first version of this file hard-coded the figures of the day -- "exactly
# one unrecoverable sample", "an 18/19 strict ceiling". When the round that
# stated the `component` rule re-annotated the one sample that used to be
# unrecoverable, four injections went stale at once: three survived because the
# property they asserted was now true of a *different* world, and one went inert
# because its anchor (`checkout-ui`) no longer existed. None of them was a probe
# defect; all four were the battery mistaking the day's numbers for the
# invariant.
#
# A requirement that reads the baseline cannot go stale that way. It still fails
# when the probe does not follow the mutation -- which is the whole property --
# while surviving a dataset edit that moves the ground truth underneath it.
BASELINE: dict = {}


# Each entry: name, target file, mutation, requirement, description.
# `requirement(report)` returns True when the probe *still* reports the property
# in `description` -- i.e. the mutation was not observed. A mutation is caught
# exactly when that comes back False. Requirements read `BASELINE`, populated in
# `main`, so they state a *movement* rather than the day's figure.
INJECTIONS: list[tuple[str, Path, Callable[[str], str], Callable[[dict], bool], str]] = [
    # --- the ground truth moves; the ceiling must follow it -------------------
    (
        "A. dataset: one more component unrecoverable",
        GOLDEN,
        unrecover("cart-service"),
        lambda r: r["component"]["unrecoverableUnderTokenRule"]
        == BASELINE["component"]["unrecoverableUnderTokenRule"],
        "the baseline's unrecoverable count, so the ceiling did not follow the data",
    ),
    (
        "B. dataset: one more unrecoverable, and the ceiling must follow it down",
        GOLDEN,
        unrecover("cart-service"),
        lambda r: r["strictCeiling"]["samples"] == BASELINE["strictCeiling"]["samples"],
        "the baseline's strict ceiling, so it did not follow the ground truth down",
    ),
    (
        "C. dataset: make a second sample unrecoverable, in a fresh place",
        GOLDEN,
        unrecover("storefront"),
        lambda r: r["component"]["unrecoverableUnderTokenRule"]
        == BASELINE["component"]["unrecoverableUnderTokenRule"],
        "the baseline's unrecoverable count",
    ),
    (
        "D. dataset: drop three components, so the ceiling falls below the M1 threshold",
        GOLDEN,
        lambda t: unrecover("log-collector")(unrecover("shipping-service")(unrecover("payment-gateway")(t))),
        lambda r: r["strictCeiling"]["clearsM1"] is False,
        "a ceiling that no longer clears the 0.7 threshold",
    ),
    # --- the definition moves; the number must move with it -------------------
    (
        "E. probe: count the relaxed ceiling as the strict one",
        PROBE,
        # The baseline-relative form of this mutation cannot be "set strict to
        # total", because once the rule is stated the strict ceiling *is* the
        # total -- `recoverable.length === total` -- and the mutation would be a
        # no-op. What the closed ceiling can still distinguish is the *denominator*
        # of the relaxed figure, which is what the next injection drives. This one
        # drives the strict ceiling off a wrong count instead: subtracting one
        # models a probe that silently drops a sample from its own numerator.
        lambda t: rename(
            t,
            "  const strictCeiling = recoverable.length;",
            "  const strictCeiling = recoverable.length - 1;",
        ),
        lambda r: r["strictCeiling"]["samples"] == BASELINE["strictCeiling"]["samples"],
        "the baseline's strict ceiling, so the dropped sample went unobserved",
    ),
    (
        "F. probe: compute the ceiling rate over the wrong denominator",
        PROBE,
        lambda t: rename(
            t,
            "  const strictCeilingRate = strictCeiling / total;",
            "  const strictCeilingRate = strictCeiling / (total - 1);",
        ),
        lambda r: abs(r["strictCeiling"]["rate"] - BASELINE["strictCeiling"]["rate"]) < 1e-9,
        "the baseline's strict rate",
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
        lambda r: r["m1Threshold"] == BASELINE["m1Threshold"],
        "the baseline's M1 threshold",
    ),
    (
        "I. probe: exempt one sample from the recoverable set",
        PROBE,
        # The exemption is applied to the *first* sample, whatever it is, so the
        # mutation does not depend on a named component still being unrecoverable.
        # It removes one sample from the recoverable half, which must move the
        # count: if it does not, the filter is not load-bearing.
        lambda t: rename(
            t,
            "  const recoverable = samples.filter((s) =>\n    tokensAllPresent(s.expected.component, s.incidentText),\n  );",
            "  const recoverable = samples.filter(\n    (s, i) => tokensAllPresent(s.expected.component, s.incidentText) && i !== 0,\n  );",
        ),
        lambda r: r["component"]["recoverableUnderTokenRule"]
        == BASELINE["component"]["recoverableUnderTokenRule"],
        "the baseline's recoverable count, so the exemption went unobserved",
    ),
    (
        "J. probe: let the two halves disagree, so the partition guard has to fire",
        PROBE,
        # The guard's whole purpose: `recoverable` and `unrecoverable` must cover
        # the dataset. The mutation does it the way the *first draft* of the probe
        # got it wrong -- `unrecoverable` becomes a second independent filter over
        # the raw predicate instead of being derived from `recoverable`, and
        # `recoverable` additionally drops the first sample. The two halves now
        # overlap and miss a sample, so the guard must throw.
        #
        # An earlier attempt at this injection left the derivation intact and only
        # filtered `recoverable`, which shrank both halves together and therefore
        # still partitioned -- it SURVIVED, correctly, because it did not reproduce
        # the defect. Writing the injection as the original defect rather than as a
        # plausible-looking edit is what makes it test anything.
        lambda t: rename(
            t,
            "  const unrecoverable = samples.filter((s) => !recoverable.includes(s));",
            "  const unrecoverable = samples.filter(\n"
            "    (s) => !tokensAllPresent(s.expected.component, s.incidentText),\n"
            "  );",
        ).replace(
            "  const recoverable = samples.filter((s) =>\n"
            "    tokensAllPresent(s.expected.component, s.incidentText),\n"
            "  );",
            "  const recoverable = samples.filter(\n"
            "    (s, i) => tokensAllPresent(s.expected.component, s.incidentText) && i !== 0,\n"
            "  );",
            1,
        ),
        lambda r: (
            r["component"]["recoverableUnderTokenRule"] + r["component"]["unrecoverableUnderTokenRule"]
            == r["samples"]
        ),
        "recoverable and unrecoverable summing to the sample count, i.e. a partition",
    ),
    # --- the battery's own restore -------------------------------------------------
    (
        "K. battery: verify a fixed pair instead of the files that were written",
        # This one is unlike every entry above: it does not mutate the subject, it
        # mutates *this script's* notion of what it touched. The target is the
        # golden fixture -- the same file A uses -- so the entry is a real
        # injection that runs, and the requirement reads the recorded set.
        #
        # The defect it guards was measured, not imagined. A battery that restores
        # and verifies `PROBE` and `GOLDEN` by name reported, with an eleventh
        # injection present:
        #
        #     battery: 11 caught, 0 survived, 0 inert
        #     sources restored: identical to backup
        #
        # Exit 0 -- while 8098 lines of `docs/audit.md` had been replaced by this
        # fixture's JSON and truncated to 183. The check was honest about the two
        # paths it named and blind to the third, which it had itself written.
        #
        # What makes the mutation observable is the *count*. A restore that names
        # two paths reports 2 whatever happens; one derived from the writes reports
        # what the run touched. The requirement is therefore on the recorded set,
        # which the battery reads back after restoring.
        GOLDEN,
        unrecover("cart-service"),
        lambda r: len(_WRITTEN) < 2,
        "a recorded write set smaller than the files this battery writes",
    ),
]


def main() -> int:
    # No snapshots taken up front. The restore reads each file's bytes at its
    # first write (see `write_recorded`), so a file this battery has never heard
    # of is still restored -- and a snapshot pair taken here would be the fixed
    # list the fix removed, one line further up.
    report = run_probe()
    total = report["samples"]
    BASELINE.clear()
    BASELINE.update(report)
    print("M1 ceiling probe battery\n")
    print(
        f"baseline: recoverable {report['component']['recoverableUnderTokenRule']}/{total}, "
        f"strict ceiling {report['strictCeiling']['samples']}/{total} "
        f"({report['strictCeiling']['rate'] * 100:.1f}%), "
        f"without component {report['strictWithoutComponent']['samples']}/{total}\n"
    )

    caught = survived = inert = 0
    for name, target, mutate, requirement, description in INJECTIONS:
        # The source text comes from `target` itself.
        #
        # This read `probe_text if target == PROBE else golden_text`, which
        # routes every target that is not `PROBE` onto the fixture. The two
        # targets that exist today are exactly the two the expression handles, so
        # it was never wrong in a run -- and it was measured wrong the moment a
        # third existed. Reading the target means a new entry cannot inherit
        # another file's text, and a target whose text the mutation cannot match
        # fails loudly as INERT instead of being silently substituted.
        original = target.read_text()
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

        write_recorded(target, mutated)
        try:
            result = run_probe()
            crashed = None
        except subprocess.CalledProcessError as exc:
            result = None
            crashed = (exc.stderr or exc.stdout or "").strip().splitlines()
        finally:
            write_recorded(target, original)

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

    # Restore and verify byte-for-byte, over the set that was actually written.
    # A battery that leaves a mutated file behind produces a green run and a
    # broken repository -- and a battery that *verifies* a fixed pair while
    # writing a third produces a green run and a broken repository it reports as
    # clean, which is worse. See `_WRITTEN`.
    restored = restore_recorded()

    print(f"\nbattery: {caught} caught, {survived} survived, {inert} inert")
    print(f"files written and restored: {len(_WRITTEN)}")
    print(f"sources restored: {restored and 'identical to backup' or 'DIFFERS -- inspect before committing'}")
    return 0 if caught == len(INJECTIONS) and restored else 1


if __name__ == "__main__":
    sys.exit(main())
