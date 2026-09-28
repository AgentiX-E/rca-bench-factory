#!/usr/bin/env python3
"""
Injection battery for the `type`-miss probe.

`scripts/probe-type-misses.mjs` reports a partition of the recorded `type` misses,
so it falls under this repository's rule for anything reporting a number: it must
be shown to move the right way when what it measures moves, and to stay put when
what it does not.

Two classes of mutation are driven, because the probe has two ways to be wrong:

  - DEFINITION mutations change the classification rule. These are the ones that
    matter. A probe whose three classes are not really distinct reports a number
    that looks like a measurement and is not; the reading this round publishes
    ("form-variant 0, shares-token 9, different-mechanism 6") is only meaningful if
    each class can be reached and each can be emptied.
  - DATA mutations move the recorded misses. These catch a probe that hard-codes
    its answer rather than computing it, and a transcription whose shape the
    classifier silently misreads.

Two lessons from earlier batteries are applied here rather than rediscovered:

  - Every requirement is expressed **relative to the baseline the probe reports**,
    not against a literal. Finding 80's round had six injections go stale at once
    because they encoded the day's figures; a requirement that reads the baseline
    asserts a *movement* and survives a data edit.
  - An injection is a function over the file contents, so a mutation needing two
    coordinated edits is expressible. Several of the definition mutations need the
    rule and its consumer changed together.

Each injection declares the report it requires. A mutation is CAUGHT when the
probe disagrees with that requirement, SURVIVED when it agrees, and INERT when it
changed nothing at all. Both non-CAUGHT outcomes fail the run.

**None of the injections is idempotent.** A mutation in this file either deletes
its anchor or edits it in place, so applying the same mutation twice changes
nothing the second time. That property is what lets a mutation be *paired*: an
edit that only makes a defect observable when combined with a second edit carries
that second edit in its `also` slot, and `main` refuses to accept the pair unless
the second edit moved the text too. The first version of this battery described
its four pairs in prose and reported four SURVIVED, which is the correct outcome
for a battery testing half a pair -- the pairing was a claim in a comment rather
than something the run established.

Run: python3 scripts/injection/type-miss-probe.py
Exit: 0 all caught, 1 otherwise
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Callable

REPO = Path(__file__).resolve().parents[2]
PROBE = REPO / "scripts" / "probe-type-misses.mjs"

# Where the recorded misses actually live.
#
# They used to live in the probe as a `RECORDED_TYPE_MISSES` array, and every
# DATA injection below edited that array. Finding 92 removed it: the probe now
# reads the annotation body of a named run, so the data is a *fixture* and the
# probe is a reader. Retargeting these injections is not a mechanical edit -- it
# is the battery following the data to its new home, and the failure mode of not
# doing it is exactly what happened: seven injections reported INERT because
# their anchor had been deleted, and an INERT injection is a battery that says
# nothing about the property it was written for.
#
# The fixture is the *default* run's body, which is the one the probe reads when
# invoked with no `--run`.
FIXTURE = REPO / "packages" / "core" / "test" / "fixtures" / "miss-detail-567118aea.txt"


def run_probe(mutation: str | None = None, data: str | None = None) -> dict:
    """Run the probe, optionally with `mutation` over its source and `data` over the fixture.

    The source and the fixture are always restored, including when the probe
    fails to run, so the report below can be read during a run that exits
    non-zero. `check=True` is deliberately *not* used: a non-zero exit is a
    measurement in this battery rather than an error, because the probe's exit
    code is part of its contract and two of the injections below drive exactly
    that code.

    Two files because the probe has two inputs now. A DATA injection edits the
    recorded annotation; a DEFINITION injection edits the reader. Keeping them
    separate is what lets an injection say which half of the instrument it is
    testing, and the report names the file each mutation touched.
    """
    original_probe = PROBE.read_text()
    original_fixture = FIXTURE.read_text()
    if mutation is not None:
        PROBE.write_text(mutation)
    if data is not None:
        FIXTURE.write_text(data)
    try:
        proc = subprocess.run(
            ["node", str(PROBE), "--json"],
            cwd=REPO,
            capture_output=True,
            text=True,
        )
    finally:
        PROBE.write_text(original_probe)
        FIXTURE.write_text(original_fixture)

    report = json.loads(proc.stdout)
    report["exitCode"] = proc.returncode
    return report


def rename(text: str, old: str, new: str) -> str:
    """One anchored replacement, asserting the anchor was actually present."""
    if old not in text:
        raise AssertionError(f"anchor not found: {old[:70]!r}")
    return text.replace(old, new, 1)


# The baseline the probe reports on the unmutated transcription, captured before
# any mutation runs. Every requirement below reads it.
BASELINE: dict = {}


def baseline_count(kind: str) -> int:
    return BASELINE["counts"][kind]


# Each entry: name, mutation, requirement, description, `also`.
#
# `mutation` is applied to the probe source; `also`, when present, is applied to
# the *result* of `mutation`. The second edit is how a pair is expressed, and it
# has to be a real edit -- `main` reports the injection as INERT if `also` left
# the text unchanged, because "_also` did nothing" and "`also` was not needed"
# are different claims and only the second one is safe to ignore.
#
# `requirement(report)` returns True when the probe *still* reports the property
# in `description` -- i.e. the mutation was not observed. A mutation is caught
# exactly when that comes back False.
INJECTIONS: list[
    tuple[
        str,
        Callable[[str], str],
        Callable[[dict], bool],
        str,
        Callable[[str], str] | None,
    ]
] = [
    # --- the definition moves; the classification must move with it -----------
    (
        "A. probe: make every miss a form variant",
        lambda t: rename(
            t,
            "  if (normalizeFaultType(expected) === normalizeFaultType(actual)) {\n"
            "    return 'form-variant';\n"
            "  }",
            "  if (true) {\n    return 'form-variant';\n  }",
        ),
        lambda r: r["counts"]["form-variant"] == baseline_count("form-variant"),
        "the baseline form-variant count (0), so a total misclassification went unobserved",
        None,
    ),
    (
        "B. probe: make the form-variant test unreachable, and supply a variant it must fold",
        lambda t: rename(
            t,
            "  if (normalizeFaultType(expected) === normalizeFaultType(actual)) {\n"
            "    return 'form-variant';\n"
            "  }",
            "  if (normalizeFaultType(expected) === normalizeFaultType(actual) && false) {\n"
            "    return 'form-variant';\n"
            "  }",
        ),
        # Neither half moves a count on its own, and this is the whole reason the
        # injection is a pair.
        #
        # The definition half cannot: the baseline form-variant count is 0 *and*
        # making the class unreachable cannot raise it, so a count requirement is
        # satisfied either way and would SURVIVE while saying nothing. What the
        # half *can* move is the exit code -- the probe reports `form-variant 0`
        # for two different reasons (none exists, or the class is unreachable) and
        # only one of them is a clean bill of health -- but the gate is only
        # observable through the exit code, and that needs an input which *has* a
        # form variant.
        #
        # The data half cannot either: with the rule intact, `NETWORK_LOSS` folds
        # to `network-loss` and counts as a form variant exactly as the original
        # row did, so the mutation is invisible. (B and I differ in a way worth
        # keeping: I drives the gate, B drives the classification.)
        #
        # Together the pair is decidable, and the requirement is written over the
        # count the data half supplies: the variant must be counted, which is
        # exactly what the unreachable class discards. A count-only requirement is
        # safe *here* because the pair supplies the variant -- on its own the data
        # half is invisible and the definition half cannot move the count, so
        # neither half passes this requirement, and only the pair does.
        lambda r: r["counts"]["form-variant"] == baseline_count("form-variant") + 1,
        "the variant supplied by the paired data edit, which the unreachable class discarded",
        lambda d: rename(
            d,
            "network-loss-payment-gateway.type:network-loss>egress-interface-packet-loss",
            "network-loss.type:network-loss>NETWORK_LOSS",
        ),
    ),
    (
        "C. probe: drop the token test, so near misses become different mechanisms",
        lambda t: rename(
            t,
            "  if (expectedTokens.some((t) => actualTokens.has(t))) {\n"
            "    return 'shares-token';\n"
            "  }",
            "  // token test removed\n",
        ),
        lambda r: r["counts"]["shares-token"] == baseline_count("shares-token"),
        "the baseline shares-token count, so a near miss was silently reclassified",
        None,
    ),
    (
        "D. probe: stop folding case, so the normalizer can no longer place a case variant",
        lambda t: rename(t, "  return type\n    .trim()\n    .toLowerCase()\n", "  return type\n    .trim()\n"),
        # The data half of this pair, and the reason a case variant is the right
        # answer to choose. An earlier version supplied `POD_KILL` for `pod-kill`
        # and the injection survived, for a reason worth recording: `POD_KILL`
        # *also* shares a token once folded, so removing the folding step leaves it
        # matching the token test instead of the equality test, and the count of
        # `form-variant` stays at 0 -- the same as a correct probe on data with no
        # case variant, which is the state a count requirement cannot tell apart
        # from a defect. The answer used here, `CPU-SATURATION` for
        # `cpu-saturation`, has the property that its single folded token
        # `cpu-saturation` is not a token of the expected slug (which splits into
        # `cpu` and `saturation`), so with folding removed the miss shares nothing,
        # falls through to `different-mechanism`, and the form-variant count this
        # requirement reads does move.
        lambda r: r["counts"]["form-variant"] == baseline_count("form-variant") + 1,
        "the class the case variant must land in, which needs the folding step to be reached at all",
        lambda d: rename(
            d,
            "resource-cpu-saturation-checkout.type:cpu-saturation>cpu-throttling",
            "cpu-saturation-checkout.type:cpu-saturation>CPU-SATURATION",
        ),
    ),
    (
        "E. probe: report the partition without guarding it, and break the partition",
        # The guard is a backstop for a state the current data cannot reach: the
        # three classes cover the transcription by construction, because the
        # classifier's last branch returns the third class unconditionally. So no
        # *data* mutation can expose a missing guard -- an earlier form of this
        # injection survived for exactly that reason and was a bad test, not a
        # finding.
        #
        # What it needs is a mutation that makes the classes non-exhaustive, which
        # is the `also` edit: renaming the classifier's final return leaves any
        # miss matching neither of the first two tests outside the three counted
        # classes. N is caught on its own because the probe then *throws*; the pair
        # is what tests something N cannot, namely that the guard is the thing
        # doing the throwing rather than an incidental crash downstream (the JSON
        # stringify, say). With the guard present the pair crashes inside it; with
        # the guard disabled the probe must publish a partition that visibly does
        # not cover its own misses, and that published state is what the
        # requirement reads.
        lambda t: rename(
            t,
            "  if (covered !== classified.length) {",
            "  if (false) {",
        ),
        lambda r: (
            r["counts"]["form-variant"] + r["counts"]["shares-token"] + r["counts"]["different-mechanism"]
            == r["total"]
        ),
        "a partition that covers every miss -- with the guard disabled the probe publishes one that does not",
        lambda s: rename(
            s,
            "  return 'different-mechanism';\n}",
            "  return 'unclassified';\n}",
        ),
        'source',
    ),
    (
        "E2. probe: the guard must be load-bearing, so a dead one has to be caught",
        # The negative half of E, and the injection that says whether E is testing
        # the guard or the crash. A condition that can never be true -- `covered`
        # is a sum of three non-negative counts, so `covered < 0` is unreachable --
        # publishes the same benign partition as a correct guard on today's data.
        # Only a partition that is *actually* broken can tell the two apart, so
        # this injection disables the guard and breaks the partition together. If
        # it ever stops being caught, the guard has been rewritten into something
        # that fires for a reason other than the condition it states.
        lambda t: rename(
            t,
            "  if (covered !== classified.length) {",
            "  if (covered < 0) {",
        ),
        lambda r: (
            r["counts"]["form-variant"] + r["counts"]["shares-token"] + r["counts"]["different-mechanism"]
            == r["total"]
        ),
        "a partition that covers every miss, which a dead guard lets the probe publish unchecked",
        lambda s: rename(
            s,
            "  return 'different-mechanism';\n}",
            "  return 'unclassified';\n}",
        ),
        'source',
    ),
    (
        "N. probe: make the classifier's classes non-exhaustive, so the guard must fire",
        lambda t: rename(
            t,
            "  return 'different-mechanism';\n}",
            "  return 'unclassified';\n}",
        ),
        # The other half of E's family, and the one that stands alone. With the
        # last branch renamed, a miss matching neither of the first two tests falls
        # outside the three counted classes, so the guard throws and the probe
        # publishes nothing. It is caught on its own -- the probe produces no
        # report -- and it differs from E's pair in what it says: N shows the
        # class-exhaustiveness assumption is load-bearing, E shows the guard is
        # what enforces it.
        lambda r: (
            r["counts"]["form-variant"] + r["counts"]["shares-token"] + r["counts"]["different-mechanism"]
            == r["total"]
        ),
        "a partition that covers every miss, which a non-exhaustive classifier cannot produce",
        None,
    ),
    (
        "F. probe: count the over-specified share over the wrong denominator",
        lambda t: rename(
            t,
            "  const overSpecified = classified.filter((c) => c.overSpecified).length;",
            "  const overSpecified = classified.filter((c) => c.overSpecified).length + 1;",
        ),
        lambda r: r["overSpecified"] == BASELINE["overSpecified"],
        "the baseline over-specified count, so an off-by-one went unobserved",
        None,
    ),
    (
        "G. probe: invert the over-specification direction",
        lambda t: rename(
            t,
            "    overSpecified: actual.split('-').length > expected.split('-').length,",
            "    overSpecified: actual.split('-').length < expected.split('-').length,",
        ),
        lambda r: r["overSpecified"] == BASELINE["overSpecified"],
        "the baseline over-specified count (the drift runs the other way)",
        None,
    ),
    (
        "H. probe: exit zero whatever the partition says, and supply a variant that must trip it",
        # This mutation does two things at once, and the second is what the
        # requirement needs. Forcing the exit to zero and *then* supplying a form
        # variant reaches the state the gate exists to prevent: a probe reporting
        # `form-variant 1` while exiting 0. Without the supplied variant the
        # mutation is invisible in the JSON and observable only as an exit code
        # that was already 0.
        lambda t: rename(t, "  return counts['form-variant'] === 0 ? 0 : 2;", "  return 0;"),
        # The JSON is unchanged by this mutation -- only the exit code moves -- so
        # a requirement phrased over `counts` cannot detect it and is a bad test.
        # It needs an input that *has* a form variant, which the paired data edit
        # supplies: with the gate intact the probe exits 2, and with the gate
        # forced to zero it exits 0 while reporting a form variant. That
        # contradiction -- `form-variant 1` and a zero exit -- is the requirement,
        # and it is the only reading that distinguishes "the gate is open" from
        # "there is nothing to gate". An earlier form of this injection asked for
        # exactly that contradiction and then supplied no form variant, so it
        # survived by reporting `form-variant 0` and `exit 0` -- the state a
        # *correct* probe is also in on this data, which is why the requirement now
        # pins the variant as well.
        lambda r: r["counts"]["form-variant"] == baseline_count("form-variant") and r["exitCode"] == 0,
        "the variant supplied by the paired data edit reaching an intact gate",
        lambda d: rename(
            d,
            "network-loss-payment-gateway.type:network-loss>egress-interface-packet-loss",
            "network-loss.type:network-loss>NETWORK_LOSS",
        ),
    ),
    # --- the data moves; the classification must follow it --------------------
    #
    # These four edit the *fixture* and nothing else, so their `mutation` slot is
    # `None` and the edit rides in the `also` slot with target `'fixture'`.
    #
    # They used to edit a `RECORDED_TYPE_MISSES` array inside the probe. Finding 92
    # deleted that array -- the probe now reads a named run's annotation -- and these
    # four went INERT, because their anchor no longer existed. CI caught it and the
    # local run reproduced it, which is the battery working: an injection whose
    # anchor has moved must fail loudly, because an INERT injection reports nothing
    # about the property it was written for while still counting as a run.
    #
    # Retargeting moved the anchor from a JavaScript array literal to the annotation
    # row that carries the same miss. It is the same edit at the same altitude, and
    # the row it edits is now the one the reading actually comes from -- which is a
    # stricter test than before, because the probe reads this file at runtime.
    (
        "I. data: turn a recorded near miss into a form variant",
        None,
        lambda r: r["counts"]["form-variant"] == baseline_count("form-variant"),
        "the baseline form-variant count (0), so a genuine form variant was not classified as one",
        lambda d: rename(
            d,
            "network-loss-payment-gateway.type:network-loss>egress-interface-packet-loss",
            "network-loss-payment-gateway.type:network-loss>NETWORK_LOSS",
        ),
    ),
    (
        "J. data: drop a recorded miss entirely",
        None,
        lambda r: r["total"] == BASELINE["total"],
        "the baseline miss total, so a removed row went unobserved",
        # The leading unit separator is part of the anchor so the edit removes the
        # whole row rather than splicing two neighbours into one malformed row:
        # `...kubelet-eviction` + the next row's id would read as a single row whose
        # sample id is a sentence, and the total would not move -- the injection
        # would look caught for the wrong reason or survive for the wrong one.
        lambda d: rename(
            d,
            "\x1fruntime-pod-kill-user-profile.type:pod-kill>kubelet-eviction",
            "",
        ),
    ),
    (
        "K. data: give a different-mechanism answer a token from its own key",
        None,
        lambda r: r["counts"]["different-mechanism"] == baseline_count("different-mechanism"),
        "the baseline different-mechanism count, so the class did not shrink when a row became reachable",
        # The first two attempts at this entry were wrong, and both were wrong in
        # the way this battery exists to detect, so the record is worth keeping.
        #
        # Attempt 1 asserted the *shares-token* count while editing a row into that
        # class. The three classes are a partition over the 14 rows, so a row can
        # only leave a class by arriving in another, which means the arriving class
        # grows by exactly the one that left -- a single class count cannot see a
        # between-class move, and the injection reported SURVIVED.
        #
        # Attempt 2 edited `cpu-saturation>cpu-throttling` and
        # `disk-full>disk-space-exhaustion` in the belief that they were
        # different-mechanism rows. They are not: `classify` shares a token on
        # `cpu-` and on `disk-` respectively, so both were already in the sharing
        # class. The fixture changed, the partition did not, and the battery still
        # printed CAUGHT -- a caught injection that tests nothing, which is the
        # exact failure mode the INERT accounting exists to prevent and which this
        # entry shows is not fully prevented. Anchors must be chosen from the
        # classifier's *output* for the row, not from a reading of the two strings.
        #
        # The real six different-mechanism rows are `memory-leak`,
        # `pod-kill`, `container-crash`, `kafka-consumer-lag`, `upstream-5xx` and
        # `replica-lag`. This one is genuine: `pod-kill` and `kubelet-eviction`
        # share no token. Giving the answer `pod` puts it in the sharing class, and
        # the different-mechanism count must fall from 6 to 5 -- observable in a
        # single count because the edit is within the partition and the class
        # watched is the one the row left.
        lambda d: rename(
            d,
            "runtime-pod-kill-user-profile.type:pod-kill>kubelet-eviction",
            "runtime-pod-kill-user-profile.type:pod-kill>kubelet-pod-eviction",
        ),
    ),
    (
        "L. data: shorten a different-mechanism answer into a token-sharer",
        None,
        lambda r: r["counts"]["different-mechanism"] == baseline_count("different-mechanism"),
        "the baseline different-mechanism count, so a class emptied silently",
        # `dependency-degradation` shares `dependency` with `upstream-5xx`?  It does
        # not -- the key is `upstream-5xx` and the only shared kind of token is the
        # literal one. This row is in the different-mechanism class, and
        # `upstream` is the token both `upstream-5xx` and `upstream-unavailable`
        # carry, so this edit is the one that genuinely moves a different-mechanism
        # row into the sharing class and pulls its count down.
        lambda d: rename(
            d,
            "dependency-upstream-5xx-pricing.type:upstream-5xx>dependency-degradation",
            "dependency-upstream-5xx-pricing.type:upstream-5xx>upstream-unavailable",
        ),
    ),
]


def main() -> int:
    probe_text = PROBE.read_text()
    fixture_text = FIXTURE.read_text()

    report = run_probe()
    BASELINE.clear()
    BASELINE.update(report)
    print("type-miss probe battery\n")
    print(
        f"baseline: {report['total']} misses -- "
        f"form-variant {report['counts']['form-variant']}, "
        f"shares-token {report['counts']['shares-token']}, "
        f"different-mechanism {report['counts']['different-mechanism']}, "
        f"over-specified {report['overSpecified']}\n"
    )

    caught = survived = inert = blind = 0
    for entry in INJECTIONS:
        name, mutate, requirement, description, also = entry[:5]
        # A pure-data injection edits the fixture and leaves the rule alone; its
        # mutation slot is None. The `mutated == probe_text` guard below asks
        # whether the *rule* changed, which is the wrong question for it and would
        # report INERT on a pair that is about to edit the fixture. So only run
        # that guard when a rule mutation was declared at all.
        edits_source = mutate is not None
        try:
            mutated = mutate(probe_text) if edits_source else probe_text
        except AssertionError as exc:
            print(f"INERT    {name}")
            print(f"         -- {exc}")
            inert += 1
            continue
        if edits_source and mutated == probe_text:
            print(f"INERT    {name}")
            print("         -- the mutation changed nothing")
            inert += 1
            continue

        data = None
        if also is not None:
            # The paired second edit. Which file it lands in is declared by the
            # entry, because the probe has two inputs now: the rule (the source)
            # and the recorded misses (the fixture). A pair is usually one edit to
            # each, but E and E2 pair two edits to the *rule* -- they break the
            # classifier's exhaustiveness, which is a property of the rule and not
            # of any row.
            #
            # Writing the target down rather than inferring it is deliberate. An
            # inferred target would be a guess, and this battery's whole history is
            # of injections that silently tested nothing because an anchor moved:
            # inferring the file would let a pair land in the wrong one and still
            # look like it applied.
            target = 'fixture' if len(entry) < 6 else entry[5]
            base = fixture_text if target == 'fixture' else mutated
            try:
                paired = also(base)
            except AssertionError as exc:
                print(f"INERT    {name}")
                print(f"         -- the paired {target} edit did not apply: {exc}")
                inert += 1
                continue
            if paired == base:
                print(f"INERT    {name}")
                print(f"         -- the paired {target} edit changed nothing, so the pair never formed")
                inert += 1
                continue
            if target == 'fixture':
                data = paired
            else:
                mutated = paired
                edits_source = True

        try:
            result = run_probe(mutated, data)
            crashed = None
        except (json.JSONDecodeError, ValueError):
            # The probe emitted no JSON at all, so its exit path is unobservable
            # and the requirement cannot be evaluated. Counted as caught, and
            # reported apart from the requirement checks so a mutation which
            # breaks the script for an unrelated reason stays visible.
            result = None
            crashed = True

        if crashed is not None:
            print(f"CAUGHT   {name}")
            print("         (the probe produced no report, so no classification was published)")
            caught += 1
        elif requirement(result):
            print(f"SURVIVED {name}")
            print(f"         -- it still reported {description}, so the mutation changed nothing observable")
            survived += 1
        elif (
            data is not None
            and not edits_source
            and result["counts"] == BASELINE["counts"]
            and result["total"] == BASELINE["total"]
        ):
            # A DATA-ONLY injection edited the recorded answers and the probe
            # published a byte-identical partition. The requirement is False and
            # the exit code is not zero, so the naive reading is "caught" -- but
            # nothing about the classification moved, which means the edit landed
            # on a row whose class the edit could not change. K hit exactly this
            # twice: it renamed `cpu-saturation>cpu-throttling` to
            # `cpu-load>cpu-throttling` and the partition stayed 0/8/6, because
            # both strings share `cpu`. An injection in that state tests the probe
            # no more than an INERT one does, and calling it caught is how a
            # battery reports coverage it does not have. Counted apart, and it
            # fails the run.
            #
            # Scoped to injections that did *not* edit the source. A paired
            # injection like B changes the classifier and the data together; its
            # requirement is about the classifier, and the data edit is there to
            # make the changed classifier observable. The partition is under no
            # obligation to move in that case, and holding it to one would fail a
            # correct pair -- which B did on the first run of this check.
            print(f"BLIND    {name}")
            print(
                "         -- the recorded answers changed but the partition did not "
                f"({result['total']} rows, {result['counts']['form-variant']}/"
                f"{result['counts']['shares-token']}/{result['counts']['different-mechanism']}), "
                "so the anchor is on a row the edit cannot move"
            )
            blind += 1
        else:
            print(f"CAUGHT   {name}")
            print(
                f"         (form-variant {result['counts']['form-variant']}, "
                f"shares-token {result['counts']['shares-token']}, "
                f"different-mechanism {result['counts']['different-mechanism']}, "
                f"total {result['total']}, over-specified {result['overSpecified']}, "
                f"exit {result['exitCode']})"
            )
            caught += 1

    # Restore and verify byte-for-byte. A battery that leaves a mutated file behind
    # produces a green run and a broken repository.
    PROBE.write_text(probe_text)
    restored = PROBE.read_text() == probe_text

    print(f"\nbattery: {caught} caught, {survived} survived, {inert} inert, {blind} blind")
    print(f"source restored: {restored and 'identical to backup' or 'DIFFERS -- inspect before committing'}")
    return 0 if caught == len(INJECTIONS) and restored else 1


if __name__ == "__main__":
    sys.exit(main())
