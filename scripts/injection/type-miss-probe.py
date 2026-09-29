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

# The classifier's own probe. A second instrument rather than a flag on the first,
# because the two observe different objects: `probe-type-misses.mjs` reads a
# recorded annotation's `type` field, and this one calls `inferFaultCategory`.
# Finding 95 is the reason it exists -- the classifier had no observation point, so
# a substring match that misread a config fault as `middleware` produced no signal
# anywhere in the repository.
CATEGORY_PROBE = REPO / "scripts" / "probe-category-inference.mjs"

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

# The adjudication rule, which is a third input and a different kind of one.
#
# The probe imports its classifier from the built package: the classification is
# reproduced in the script on purpose (a classifier whose definition moves with
# the artefact it classifies cannot report on that artefact) but the *adjudication*
# is imported, because it has one correct implementation. That makes injecting into
# the rule a two-step edit -- mutate the TypeScript, rebuild, run -- and the
# rebuild is what makes this file an input to the battery rather than a comment
# about it.
#
# `ADJUDICATION` is the source, and it is also the authority: the compiled output
# the probe loads is derived from it, so restoring the rule means recompiling
# rather than writing back a saved copy of the build. See the restore block in
# `run_probe` for why the saved-copy design was wrong.
ADJUDICATION = REPO / "packages" / "core" / "src" / "fault" / "miss-adjudication.ts"

# The category classifier. A second in-package target alongside ADJUDICATION, and
# it exists for the same reason: the property under test lives in the package
# rather than in the probe, so the injection has to land there and force a
# rebuild. Finding 95 is about this file -- `inferFaultCategory` matched letter
# sequences rather than words, so `feature-flag-misconfiguration` (a config fault)
# resolved to `middleware` because `flag` contains `lag`.
COLLECTOR = REPO / "packages" / "core" / "src" / "fault" / "collector.ts"

# The counter-evidence reader. A third in-package target, and the first one whose
# subject is a *reading of the incident text* rather than of the model's answer.
# Finding 96 measures that the `category` misses follow a counter-evidence sentence
# at 5/6 precision and 5/8 recall; this file is where that measurement lives, so it
# is where the injections have to land.
DISTRACTOR = REPO / "packages" / "core" / "src" / "fault" / "miss-distractor.ts"

# The denial inventory. A fourth in-package target, and the one finding 98 lands in.
# Where `DISTRACTOR` asks "does the text carry counter-evidence", this module asks the
# question that decides whether the task is well-posed at all: "is the category the
# model *answered* present in the text, or only denied by it". It is a different
# object -- the answer, not the text's phrasing -- so it is a different file, and the
# three injections W/X/Y below are what say the reading is load-bearing.
DENIAL = REPO / "packages" / "core" / "src" / "fault" / "denial-inventory.ts"

# Every in-package target, mapped to the source it edits. `run_probe` takes one of
# these at a time; keeping them in a table rather than in a chain of `if`s is what
# makes "which file did this injection touch" answerable from the report.
IN_PACKAGE_TARGETS = {
    "rule": ADJUDICATION,
    "collector": COLLECTOR,
    "distractor": DISTRACTOR,
    "denial": DENIAL,
}


def build_core() -> None:
    """Recompile `packages/core` so the probe sees the mutated rule.

    `tsc` only, not the whole `pnpm build` pipeline: the probe loads the compiled
    `index.js` graph and nothing else, and the narrower command is what keeps the
    battery's runtime in seconds rather than minutes. A build failure is raised
    rather than swallowed -- an injection whose mutation does not compile would
    otherwise run the *previous* build and report against a rule it did not
    install.
    """
    proc = subprocess.run(
        ["pnpm", "exec", "tsc", "-p", "tsconfig.json"],
        cwd=REPO / "packages" / "core",
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise AssertionError(f"the mutated rule did not compile: {proc.stdout[-400:]}")


def run_probe(
    mutation: str | None = None,
    data: str | None = None,
    rule: str | None = None,
    in_package: str | None = None,
    in_package_path: Path | None = None,
) -> dict:
    """Run the probe with `mutation` over its source, `data` over the fixture, `rule` over the adjudication.

    Every input is restored, including when the probe fails to run, so the report
    below can be read during a run that exits non-zero. `check=True` is
    deliberately *not* used: a non-zero exit is a measurement in this battery
    rather than an error, because the probe's exit code is part of its contract
    and several of the injections below drive exactly that code.

    Four files because the probe has four inputs. A DATA injection edits the
    recorded annotation; a DEFINITION injection edits the classifier in the
    script; a RULE injection edits the adjudication in the package and rebuilds;
    a COLLECTOR injection edits the category classifier in the package and
    rebuilds. Keeping them separate is what lets an injection say which part of
    the instrument it is testing, and the report names the file each mutation
    touched.

    `rule` is kept as its own parameter rather than folded into `in_package` so
    that the twenty-odd existing entries do not have to change to accommodate a
    target that arrived later. `in_package_path` generalises the restore and
    rebuild path to any package source.
    """
    original_probe = PROBE.read_text()
    original_fixture = FIXTURE.read_text()
    # The in-package input, whichever it is. `rule` and `in_package` are never
    # both set; the first is the historical spelling and the second is the general
    # one, and `target_edit` below carries the text for whichever was used.
    target_path = in_package_path if in_package_path is not None else ADJUDICATION
    target_edit = in_package if in_package is not None else rule
    original_target = target_path.read_text() if target_edit is not None else None
    try:
        # Every mutation goes *inside* the try, and the build with it. The first
        # version wrote the rule and compiled it before entering the try, so a
        # mutation that failed to compile -- which is exactly what happened while
        # writing injection M -- raised out of `run_probe` with the mutated source
        # still on disk and nothing left to restore it. `packages/core/src/fault/
        # miss-adjudication.ts` was left corrupt across a whole run, and the
        # corruption then surfaced as a syntax error inside the probe rather than
        # as anything pointing at the battery. A restore that only covers the
        # *successful* path is not a restore.
        if mutation is not None:
            PROBE.write_text(mutation)
        if data is not None:
            FIXTURE.write_text(data)
        if target_edit is not None:
            target_path.write_text(target_edit)
            build_core()
        proc = subprocess.run(
            ["node", str(PROBE), "--json"],
            cwd=REPO,
            capture_output=True,
            text=True,
        )
        # The category probe runs in the same try, over the same mutated tree, so
        # an injection into the classifier is measured on the classifier as it was
        # installed rather than on a second build. Its output is merged into this
        # report under `category`; the two probes observe different objects and the
        # keys keep them apart.
        cat_proc = subprocess.run(
            ["node", str(CATEGORY_PROBE), "--json"],
            cwd=REPO,
            capture_output=True,
            text=True,
        )
    finally:
        # Restore in reverse order of mutation, and verify -- a `finally` that
        # writes without checking is a promise, not a guarantee. This matters most
        # for the in-package inputs: they are the ones that live in the package, so
        # an unrestored one is a mutated source tree rather than a mutated script,
        # and they are the ones whose restore depends on a rebuild having succeeded
        # first.
        PROBE.write_text(original_probe)
        FIXTURE.write_text(original_fixture)
        if target_edit is not None:
            assert original_target is not None
            target_path.write_text(original_target)
            # Rebuild rather than write back a saved copy of `dist`.
            #
            # Writing back `original_dist` was the first design and it is unsafe in
            # a way that is invisible until it bites: the snapshot is taken at entry,
            # so if `dist` was *already* stale or corrupt when the battery started --
            # which is exactly what the M-writing failure left behind -- every
            # subsequent `run_probe` faithfully restores the corruption. The probe
            # then fails to parse, the battery reports a syntax error from
            # `node_modules`-adjacent code, and nothing points at the restore.
            #
            # The rule source is the authority and `dist` is derived, so the restore
            # is a compile. A build failure here is not swallowed: a battery that
            # cannot leave the tree buildable has to say so.
            build_core()
        for label, path, original in (
            ("probe", PROBE, original_probe),
            ("fixture", FIXTURE, original_fixture),
        ):
            if path.read_text() != original:
                raise AssertionError(f"restore failed for {label}: {path}")
        if target_edit is not None and target_path.read_text() != original_target:
            raise AssertionError(f"restore failed for {target_path.name}: {target_path}")

    report = json.loads(proc.stdout)
    report["exitCode"] = proc.returncode
    # A category probe that emitted nothing is a broken instrument, not an
    # injection that survived, and saying so here keeps the requirement checks
    # below from reading a KeyError as a pass.
    if cat_proc.returncode != 0 or not cat_proc.stdout.strip():
        raise AssertionError(
            f"the classifier probe produced no report: rc={cat_proc.returncode} {cat_proc.stderr[-300:]}"
        )
    # `classifier`, not `category`.
    #
    # The two probes measure different objects and both had a claim on the word:
    # `probe-category-inference.mjs` reports what `inferFaultCategory` answers for a
    # type (finding 95), while `probe-type-misses.mjs` now emits a `category` block
    # of its own, which is the counter-evidence reading of the `category` *field*
    # (finding 96). The first version of this line used `category` for the classifier
    # and silently overwrote the probe's own block -- the battery then failed with a
    # `KeyError: 'withPhrase'` rather than with anything naming the collision.
    #
    # Renaming the merge rather than the probe's block, because the block's name is
    # the field it is about and the merge's name is the instrument that produced it.
    report["classifier"] = json.loads(cat_proc.stdout)["totals"]
    return report


def replace_function_body(text: str, signature: str, body: str) -> str:
    """Swap the body of the function declared by `signature`, keeping its header.

    Thin wrapper over `body_of` so an injection reads as "replace this function's
    body with that", which is the claim being made, rather than as a text splice.
    """
    whole = body_of(text, signature)
    header = whole[: whole.index("{") + 1]
    return rename(text, whole, f"{header}\n{body}}}" + "\n")


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


def baseline_adj(verdict: str) -> int:
    """The baseline count of one adjudication verdict.

    The adjudication block was added in finding 94. It is read through the same
    baseline as the partition, so an injection into the rule states the figure it
    expects to remain and the run fails when it moves.
    """
    return BASELINE["adjudication"][verdict]


# The classifier probe's own baseline. Kept separate from BASELINE because it is a
# separate probe with a separate report shape: folding two instruments into one
# dict would make an injection into the classifier able to read a figure the
# classifier never produced.
CATEGORY_BASELINE: dict = {}

# The counter-evidence reader's baseline, for the same reason again. It is a third
# instrument over a third object -- the incident text rather than the answer or the
# type -- and finding 96 is what it measures.
DISTRACTOR_BASELINE: dict = {}

# The denial inventory's baseline, and the reason it is a fourth dict rather than an
# entry in `DISTRACTOR_BASELINE`: they observe different objects. `DISTRACTOR_BASELINE`
# is filled from the probe's `category` block, which is a reading of the *text's
# phrasing*. This one is filled from the `denial` block, which is a reading of the
# *answer's support*. Finding 96 recorded that two instruments sharing one name
# (`category`) cost a debugging round; two instruments sharing one baseline would cost
# the same and be harder to see, because a wrong-dict read is a valid-looking number.
DENIAL_BASELINE: dict = {}


def cat(report: dict) -> dict:
    """The classifier probe's totals from a run's report.

    An injection requirement takes the whole report, so this is the one place that
    knows the classifier's figures live under `classifier`.
    """
    return report["classifier"]


def cat_baseline() -> dict:
    return CATEGORY_BASELINE


def dist(report: dict) -> dict:
    """The counter-evidence block from a run's report.

    The caveat that bit this module already: `classifier` used to be called
    `category`, and `category` is also the name of the probe's own block for the
    `category` field. Two instruments, one word. This accessor reads the field's
    block and `cat` reads the classifier's, and neither can be confused with the
    other at a call site.
    """
    return report["category"]


def dist_baseline() -> dict:
    return DISTRACTOR_BASELINE


def denial(report: dict) -> dict:
    """The denial inventory's block from a run's report.

    Named after the *class* of observation -- whether the answered category is
    supported -- rather than after the module that computes it, so a call site reads
    as the claim being checked. `dist` reads the text's phrasing and this reads the
    answer's support, and the two never share a word.
    """
    return report["denial"]


def denial_baseline() -> dict:
    return DENIAL_BASELINE


def body_of(text: str, signature: str) -> str:
    """The full text of the function whose declaration line starts with `signature`.

    Used to replace a whole function body by *name* rather than by line range.

    The first version of injection M addressed lines 171..181, and a later edit to
    the module moved the function by a line -- so the range ate the `Adjudication`
    type declaration that had slid into it, the build failed, and the failure
    arrived as a compile error in a file the injection was supposed to restore
    byte-for-byte. Anchoring on the signature makes the same drift fail *loudly at
    the anchor* instead of silently deleting the wrong span, which is the property
    finding 93 established for data injections and this generalises to source.
    """
    lines = text.splitlines(keepends=True)
    start = next((i for i, line in enumerate(lines) if line.startswith(signature)), None)
    if start is None:
        raise AssertionError(f"no function declaration starts with: {signature!r}")
    depth = 0
    for index in range(start, len(lines)):
        depth += lines[index].count("{") - lines[index].count("}")
        if depth == 0 and index > start:
            return "".join(lines[start : index + 1])
    raise AssertionError(f"unterminated function body for: {signature!r}")


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
        Callable[[str], str] | None,
        Callable[[dict], bool],
        str,
        Callable[[str], str] | None,
        str,
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
        'fixture',
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
        'fixture',
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
        'fixture',
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
        'fixture',
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
        'fixture',
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
        'fixture',
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
        'fixture',
    ),
    # --- the adjudication, finding 94 -------------------------------------------
    #
    # The four below are DEFINITION injections into `miss-adjudication.ts`, which
    # is the rule finding 91 asked for. They are new because the module is new, and
    # a new module with no injection is a module whose behaviour is asserted rather
    # than tested: every one of them removes a specific decision the rule makes and
    # requires the probe's published figure to move.
    (
        "M. rule: make the morphological test inert, so an inflection is never reached",
        None,
        lambda r: r["adjudication"]["same-fault-different-altitude"] == baseline_adj("same-fault-different-altitude"),
        "the baseline same-altitude count, so the morphological test is not load-bearing",
        # `void a; void b;` rather than dropping the parameters: `noUnusedParameters`
        # is on, and a mutation that does not compile is caught by the build rather
        # than by the requirement -- different claims, and this battery has to be
        # able to tell them apart.
        lambda t: replace_function_body(
            t,
            "function sharesMorpheme(",
            "  void a;\n  void b;\n  return null;\n",
        ),
        'rule',
    ),
    (
        "N. rule: replace the morphological test's floor with the token test it backs up",
        None,
        lambda r: r["adjudication"]["same-fault-different-altitude"] == baseline_adj("same-fault-different-altitude"),
        "the baseline same-altitude count, so the morphological branch is not load-bearing",
        # N replaces the *last* reachable decision in `sharesMorpheme` with an
        # unconditional miss, which is what "the floor is wrong" would have to look
        # like to be observable on this data. It is deliberately not "set the floor
        # to 3", and that is the finding this injection records.
        #
        # Setting the floor to 3 was the first version and it **SURVIVED**, for a
        # reason worth keeping: on the 14 recorded rows the floor is never the
        # deciding factor. `replica` / `replication` is reached because `replica`
        # *consumes a whole token*, not because it is five characters long, and the
        # five unreached rows share no prefix at any length. So `length >= 3` and
        # `length >= 5` produce identical output on this dataset, and an injection
        # that changes it cannot be caught -- the mutation is invisible, the
        # requirement holds, and the run reports SURVIVED while the floor is
        # untested. That is a true statement about coverage and a false one about
        # the rule being wrong.
        #
        # The floor's effect is demonstrated where it can be: the two constructed
        # tests in `miss-adjudication.test.ts` (`config-mismatch` / `container-crash`
        # must be different; `replica` / `replication` must be reached). This
        # injection therefore targets the branch those tests would notice, and the
        # floor's own weakness is recorded here rather than papered over with a
        # mutation that cannot fail.
        lambda t: replace_function_body(
            t,
            "function sharesMorpheme(",
            "  void a;\n  void b;\n  return null;\n",
        ),
        # The target is NOT optional in intent, and leaving it off is the second
        # defect this entry has had. Written without it, `main` defaults the target
        # to 'source', so this lambda -- which anchors on a function that exists in
        # the *rule* -- was applied to the probe script, raised `no function
        # declaration starts with: 'function sharesMorpheme('`, and the entry
        # reported INERT while reading as though the rule had been mutated. N's
        # first version was a SURVIVED floor; this one was an INERT misroute; both
        # were invisible in the printed name and both are the failure mode of an
        # anchor that moved. The default is deliberately kept (every pre-existing
        # pair is a source pair), so the mistake is available to make again -- and
        # that is what the INERT accounting is for: it is loud here precisely
        # because the message names the anchor, not the injection.
        'rule',
    ),
    (
        "O. rule: call an unreached pair undecided, collapsing a measurement into a non-answer",
        None,
        lambda r: r["adjudication"]["different-fault"] == baseline_adj("different-fault"),
        "the baseline unreached count, so the verdict cannot be quietly downgraded",
        lambda t: rename(
            t,
            "  return { ...base, verdict: 'different-fault', basis: null };\n}",
            "  return { ...base, verdict: 'undecided', basis: null };\n}",
        ),
        'rule',
    ),
    # --- The category classifier -------------------------------------------------
    #
    # P, Q and R are the first injections in this battery aimed at
    # `inferFaultCategory`, and they exist because nothing observed it. The
    # `type` probe reads a recorded annotation and never calls the classifier, so
    # the substring defect of finding 95 could have shipped any answer at all with
    # every test and every battery green. `probe-category-inference.mjs` is the
    # observation point; these are the mutations that have to move it.
    (
        "P. collector: match keywords as substrings again, the exact defect of finding 95",
        None,
        lambda r: cat(r)["adversarialFalsePositives"] == 0,
        "no adversarial word is classified by the letter sequence it contains",
        # The original defect, restored: `normalized.includes(keyword)` over the
        # whole slug.
        #
        # The first version replaced the *only* call site of `keywordMatchesToken`,
        # which made the function unused and failed the build with TS6133 instead of
        # moving the classifier. That is caught, but caught for the wrong reason --
        # the requirement was never evaluated, so the run said nothing about the
        # adversarial table. Keeping the call behind `false &&` leaves the function
        # referenced, compiles, and measures the defect.
        #
        # The golden agreement count is deliberately not the requirement here: the
        # substring matcher still gets 17 of 19 golden types right, so that figure
        # cannot separate the two implementations. Only the adversarial table can.
        lambda t: rename(
            t,
            "      if (tokens.some((token) => keywordMatchesToken(keyword, token))) {",
            "      if (false && tokens.some((token) => keywordMatchesToken(keyword, token))) {\n"
            "        return category;\n"
            "      }\n"
            "      if (normalized.includes(keyword)) {",
        ),
        'collector',
    ),
    (
        "Q. collector: drop the five-character floor, so a short keyword prefixes any word",
        None,
        lambda r: cat(r)["adversarialFalsePositives"] == 0,
        "the prefix form does not reach `member`, `room`, `planet` or `skill`",
        # The floor is the reason `mem` does not match `member`. Setting it to zero
        # keeps every golden type correct and reintroduces four adversarial false
        # positives, which is the whole argument for the floor being load-bearing
        # rather than stylistic.
        lambda t: rename(t, "const MIN_PREFIX_LENGTH = 5;", "const MIN_PREFIX_LENGTH = 0;"),
        'collector',
    ),
    (
        "R. collector: drop the negation clause, so a mis- word stops being reached",
        None,
        lambda r: cat(r)["goldenAgreements"] == cat_baseline()["goldenAgreements"],
        "the golden agreement count, so the negation form stays load-bearing",
        # `config` is not a prefix of `misconfiguration` -- `mis` precedes it -- so
        # the negation clause is the only form that reaches it. Removing the clause
        # puts `feature-flag-misconfiguration` back to `middleware` (via `flag`)
        # and `config-mismatch` still resolves, so the requirement is stated against
        # the golden agreement count rather than against one row: it is the count
        # the clause holds up.
        #
        # The loop guard is emptied rather than the loop deleted, for the same
        # reason injection P keeps its call site: deleting it leaves
        # `NEGATION_PREFIXES` unreferenced and the build fails with TS6133, which is
        # caught but says nothing about the negation clause.
        lambda t: rename(
            t,
            "  for (const negation of NEGATION_PREFIXES) {",
            "  for (const negation of [] as readonly string[]) {\n"
            "    void NEGATION_PREFIXES;",
        ),
        'collector',
    ),
    (
        "S. collector: put the network row back above middleware, a symptom outranking a subject",
        None,
        lambda r: cat(r)["goldenAgreements"] == cat_baseline()["goldenAgreements"],
        "the golden agreement count, so `redis-latency` is not read as a network fault",
        # The ordering defect that the substring fix exposed rather than caused:
        # with `latency` in the network row and that row tested first,
        # `redis-latency` is a network fault. Moving the row back is the mutation,
        # and it is caught by the golden count because `redis-latency` is one of
        # the 19. This is the injection that pins the ordering, not merely the
        # matcher.
        lambda t: rename(
            t,
            "  { category: 'middleware', keywords: ['database', 'db', 'redis', 'kafka', 'mq', 'queue', 'cache', 'sql', 'mysql', 'postgres', 'lag'] },\n"
            "  { category: 'network', keywords: ['network', 'latency', 'delay', 'loss', 'partition', 'bandwidth', 'dns', 'packet', 'drop', 'net'] },",
            "  { category: 'network', keywords: ['network', 'latency', 'delay', 'loss', 'partition', 'bandwidth', 'dns', 'packet', 'drop', 'net'] },\n"
            "  { category: 'middleware', keywords: ['database', 'db', 'redis', 'kafka', 'mq', 'queue', 'cache', 'sql', 'mysql', 'postgres', 'lag'] },",
        ),
        'collector',
    ),
    # --- The counter-evidence reader ---------------------------------------------
    #
    # T, U and V are the first injections aimed at a *reading of the incident text*.
    # Finding 96's claim is the measurement these three defend: the `category` misses
    # follow a counter-evidence sentence at 5/6 precision and 5/8 recall. Each one
    # attacks a different load-bearing part of it -- the phrase list, the third
    # value, and the denominators.
    (
        "T. distractor: empty the phrase list, so no text is ever observed to carry one",
        None,
        lambda r: dist(r)["withPhrase"] == dist_baseline()["withPhrase"],
        "the count of texts carrying a phrase, so the list is not decorative",
        # The list is what the finding *is*. An empty list makes every reading
        # `absent`, which is a well-formed answer that reports nothing -- exactly the
        # shape of defect that survives a suite which only checks the output parses.
        #
        # The array is emptied in place rather than renamed. Renaming it was the
        # first version and it fails the build on three counts at once (the internal
        # reference, the parameter's inferred type, and the `index.ts` re-export) --
        # caught, but caught at compile with the requirement never evaluated, which
        # is the same wrong-reason trap v1.36's P/Q/R recorded. Emptying keeps every
        # reference valid and is the mutation that measures the claim.
        lambda t: rename(
            t,
            "export const COUNTER_EVIDENCE_PHRASES: readonly string[] = [\n"
            "  'unchanged',\n"
            "  'not the bottleneck',\n"
            "  'no long-running',\n"
            "  'well under the limit',\n"
            "  'are current',\n"
            "  'is healthy',\n"
            "  'is normal',\n"
            "  'was healthy',\n"
            "  'no error rate',\n"
            "  'no application',\n"
            "];",
            "export const COUNTER_EVIDENCE_PHRASES: readonly string[] = [];",
        ),
        'distractor',
    ),
    (
        "U. distractor: fold the third value into absence, so a missing input reads as clean",
        None,
        lambda r: dist(r)["counts"]["notAssessable"] == dist_baseline()["counts"]["notAssessable"],
        "the not-assessable count, so 'no text to read' cannot be reported as 'no phrase found'",
        # The failure mode finding 94 named for `undecided`: a value that exists so
        # that "we could not check" is not reported as "we checked and it passed".
        # The baseline is 0 not-assessable on this dataset, so the requirement is
        # stated against the *count*, and the mutation makes a reading that was
        # `not-assessable` become `absent`. The probe's own `counts` block is what
        # observes it -- which is why the counts carry all three values rather than
        # only the positive one.
        lambda t: rename(
            t,
            "    return { verdict: 'not-assessable', phrase: null, present: false };",
            "    return { verdict: 'counter-evidence-absent', phrase: null, present: false };",
        ),
        'distractor',
    ),
    (
        "V. distractor: count only the misses, so the denominator stops being the graded set",
        None,
        lambda r: dist(r)["gradedTotal"] == dist_baseline()["gradedTotal"],
        "the graded total, so the denominator is the dataset rather than the misses",
        # The denominator attack, and the reason it matters: a report that counted
        # only the misses would let precision read against a set chosen after the
        # outcome was known. The instrument has to grade every sample in the dataset
        # and mark which ones missed, rather than filtering first -- which is why the
        # requirement is on `gradedTotal` (19) and not on `withPhrase`.
        #
        # The first version of this entry required `withPhrase` and would have
        # SURVIVED: the mutation leaves that figure at 6, because the phrase appears
        # in the same six texts either way. Requiring the field the mutation actually
        # moves is the difference between an injection and a decoration, and it is
        # the same lesson as v1.35's N -- whose floor change survived because the
        # figure it moved was never the deciding one.
        lambda t: rename(
            t,
            "  const graded = samples.filter((sample) => sample.incidentText.trim() !== '').length;",
            "  const graded = samples.filter((sample) => sample.incidentText.trim() !== '' && sample.missed).length;",
        ),
        'distractor',
    ),
    # --- The denial inventory ------------------------------------------------------
    #
    # W, X and Y are the injections finding 98 brought. They land in a fourth
    # in-package target and they exist because the `denial` block publishes three
    # figures that each encode a claim: that the reading discriminates between a
    # denial and an assertion (W), that "no term in the text" is not reported as
    # "denied" (X), and that the corpus denominator is the dataset rather than the
    # misses (Y). Each one attacks a different claim, and each states the figure it
    # expects to move.
    #
    # The `denial` block is not a flag on the `category` block. They read different
    # objects -- the text's phrasing and the answer's support -- and finding 98 exists
    # because the first was expected to explain the second and does not. An injection
    # that moved `category`'s figures while leaving `denial`'s alone would be evidence
    # for that separateness; these three instead defend `denial` on its own terms,
    # because a block nothing can move is a block that reports nothing.
    (
        "W. denial: make every term-carrying clause a denial, so an assertion reads as a denial",
        None,
        lambda r: denial(r)["counts"]["alsoAsserted"] == denial_baseline()["counts"]["alsoAsserted"],
        "the also-asserted count, so a denial and an assertion are not the same reading",
        # The orthogonal value. `also-asserted` exists so that "the text names this
        # category in order to deny it" and "the text names this category, full stop"
        # are not the same verdict -- the distinction the control rests on. If every
        # matched clause counted as a denial, `also-asserted` would go to 0 and
        # `denied-only` would swallow the corpus, which is a well-formed report that
        # says the reading cannot tell the two apart.
        #
        # The mutation forces `found` non-empty rather than deleting the branch, so
        # every reference stays valid and the defect is observable at run time rather
        # than at compile. The compile-time version is the wrong-reason trap: the
        # requirement would never be evaluated.
        #
        # The baseline is 14 also-asserted on this dataset, which is what makes the
        # injection observable. An `also-asserted` count of 0 would make this mutation
        # SURVIVE for the reason U's baseline of 0 nearly did.
        lambda t: rename(
            t,
            "    const found = DENIAL_MARKERS.filter((marker) => low.includes(marker));\n"
            "    if (found.length > 0) {",
            "    const found = DENIAL_MARKERS.filter((marker) => low.includes(marker));\n"
            "    if (found.length > 0 || true) {",
        ),
        'denial',
    ),
    (
        "X. denial: fold absence into denial, so a text that never names the category reads as denying it",
        None,
        lambda r: denial(r)["counts"]["absent"] == denial_baseline()["counts"]["absent"],
        "the absent count, so 'the text never mentions this' is not reported as 'the text denies this'",
        # The finding *is* the distinction. Four of the five reached misses -- and,
        # over the whole corpus, this is the majority value -- were answered with a
        # category that has no term in the text at all. Folding `absent` into
        # `denied-only` would turn that into "the text names the category in order to
        # deny it", which is the false claim finding 98 corrected, restored as code.
        #
        # This is the mutation that would have made the superseded 5-of-5 reading pass.
        # It is the reason the correction is load-bearing rather than cosmetic: without
        # the separate value, the wrong finding and the right one are indistinguishable
        # in the report.
        #
        # The mutation returns `denied-only` from the early exit, leaving every
        # reference to the type intact. Renaming `absent` was the alternative and it
        # fails the build on the union member, the consumer in `buildDenialInventory`,
        # and the `index.ts` re-export -- caught, but caught at compile with the
        # requirement never evaluated.
        lambda t: rename(
            t,
            "    return { verdict: 'absent', markers: [] };",
            "    return { verdict: 'denied-only', markers: [] };",
        ),
        'denial',
    ),
    (
        "Y. denial: restrict the corpus to its long samples, so the denominator is chosen rather than given",
        None,
        lambda r: denial(r)["graded"] == denial_baseline()["graded"],
        "the graded total, so the denominator is the dataset rather than the misses",
        # The denominator attack, and it is the same one V makes against the
        # counter-evidence reader -- which is why the two are separate entries rather
        # than one: the fact that a defect class recurs in a sibling instrument is
        # worth pinning in both, and a mutation that only moved one of them would be
        # evidence that they were in fact one instrument after all.
        #
        # The reading is over the whole corpus on purpose. `denied-only` on 1 of 8
        # misses is unremarkable; on 1 of 19 samples it says something about the
        # dataset's authoring. A report whose denominator is chosen after the outcome
        # is known can make either figure look like the other.
        #
        # The requirement is on `graded`, not on `deniedOnly`, because the mutation
        # leaves the *numerator* alone -- the 19 samples and the 8 misses share the one
        # denied-only case. Requiring `deniedOnly` would SURVIVE, which is the lesson
        # V records: require the figure the mutation actually moves.
        #
        # The filter is on the *text*, which every sample has, rather than on a
        # `missed` flag, which `InventorySample` does not carry. The first version
        # wrote `s.missed === true` and the build failed with TS2339 -- caught, but
        # caught at compile with the requirement never evaluated, which is the
        # wrong-reason trap this battery has now recorded four times (P/Q/R, T, and
        # here). The mutation has to be expressible without changing the type, because
        # a mutation that edits two files is a mutation whose single effect cannot be
        # read off the report.
        #
        # Restricting to a short-text subset is the same defect in substance: the
        # denominator becomes a set chosen for being small rather than the corpus.
        lambda t: rename(
            t,
            "  for (const sample of samples) {\n"
            "    const reading = assessCategoryDenial({ text: sample.text, category: sample.category });",
            "  for (const sample of samples.filter((s) => s.text.length > 400)) {\n"
            "    const reading = assessCategoryDenial({ text: sample.text, category: sample.category });",
        ),
        'denial',
    ),
]


def main() -> int:
    probe_text = PROBE.read_text()
    fixture_text = FIXTURE.read_text()
    # Every in-package target is snapshotted, not just the adjudication. The
    # restore check at the end of this function reads these back, and a target
    # that is mutated but not snapshotted is one the check cannot see.
    package_snapshot = {
        label: path.read_text() for label, path in IN_PACKAGE_TARGETS.items()
    }

    report = run_probe()
    BASELINE.clear()
    BASELINE.update(report)
    # The classifier's baseline, captured from the same unmutated run. Every
    # collector injection below reads it, so an injection states the classifier
    # figure it expects to hold and the run fails when it moves.
    CATEGORY_BASELINE.clear()
    CATEGORY_BASELINE.update(report["classifier"])
    # And the counter-evidence reader's baseline, from the probe's own `category`
    # block. Three instruments, three baselines, and each injection reads the one
    # belonging to the object it mutates.
    DISTRACTOR_BASELINE.update(report["category"])
    # A fourth instrument and a fourth baseline. Filled from the probe's `denial`
    # block, which reads the *answer's* support rather than the text's phrasing, and
    # therefore cannot share a dict with the block above: the mutation that moves one
    # must not be observable as a movement in the other, or the separateness of the
    # two readings would be untested.
    DENIAL_BASELINE.clear()
    DENIAL_BASELINE.update(report["denial"])
    print("type-miss probe battery\n")
    print(
        f"baseline: {report['total']} misses -- "
        f"form-variant {report['counts']['form-variant']}, "
        f"shares-token {report['counts']['shares-token']}, "
        f"different-mechanism {report['counts']['different-mechanism']}, "
        f"over-specified {report['overSpecified']}\n"
    )
    print(
        f"classifier: {CATEGORY_BASELINE['golden']} golden types -- "
        f"{CATEGORY_BASELINE['goldenAgreements']} agree, "
        f"{CATEGORY_BASELINE['goldenMisses']} miss; "
        f"{CATEGORY_BASELINE['adversarial']} adversarial words -- "
        f"{CATEGORY_BASELINE['adversarialFalsePositives']} false positives\n"
    )
    # The counter-evidence reader's own line. Printed for the same reason the
    # classifier's is: an injection that moves a figure nobody printed is an
    # injection whose failure has nowhere to show up, and this battery has
    # already shipped one of those (U, whose baseline was 0 until the probe
    # was made to exercise the empty inputs).
    print(
        f"counter-evidence: {DISTRACTOR_BASELINE['gradedTotal']} graded -- "
        f"{DISTRACTOR_BASELINE['withPhrase']} carry the phrase, "
        f"{DISTRACTOR_BASELINE['counts']['absent']} carry none, "
        f"{DISTRACTOR_BASELINE['counts']['notAssessable']} not assessable; "
        f"misses reached {DISTRACTOR_BASELINE['missedWithPhrase']}"
        f"/{DISTRACTOR_BASELINE['missedTotal']}\n"
    )
    # The denial inventory's own line. It is a fourth instrument over a fourth object
    # -- the answer rather than the text or the type -- and it is printed for the
    # reason the other three are: an injection that moves a figure nobody printed is
    # an injection whose failure has nowhere to show up.
    print(
        f"denial inventory: {DENIAL_BASELINE['graded']} graded -- "
        f"{DENIAL_BASELINE['counts']['deniedOnly']} denied-only, "
        f"{DENIAL_BASELINE['counts']['alsoAsserted']} also-asserted, "
        f"{DENIAL_BASELINE['counts']['absent']} absent, "
        f"{DENIAL_BASELINE['counts']['notAssessable']} not assessable; "
        f"of {DENIAL_BASELINE['misses']} misses, "
        f"{DENIAL_BASELINE['unsupportedMisses']} were answered with an unsupported category "
        f"({DENIAL_BASELINE['answeredCategoryAbsent']} absent, "
        f"{DENIAL_BASELINE['answeredCategoryDeniedOnly']} denied-only)\n"
    )

    caught = survived = inert = blind = 0
    for entry in INJECTIONS:
        name, mutate, requirement, description, also = entry[:5]
        # Which file this injection's *second* edit lands in, declared by the
        # entry rather than inferred. Three inputs now, so there are three
        # targets, and the default stays 'source' because that is where every
        # pre-existing pair already went.
        #
        # Writing the target down rather than inferring it is deliberate. An
        # inferred target would be a guess, and this battery's whole history is
        # of injections that silently tested nothing because an anchor moved:
        # inferring the file would let a pair land in the wrong one and still
        # look like it applied.
        #
        # The default is 'source' because that is where every pair written before
        # the rule module existed goes, and it stays the default even though it has
        # now produced one misroute (N, whose rule anchor was applied to the probe
        # and reported INERT with the anchor named). The alternative -- making the
        # target mandatory -- would be a one-line change that removes the mistake
        # and also removes the evidence that the battery reports it, so the default
        # is kept and every `'rule'` and `'fixture'` entry states itself.
        target = entry[5] if len(entry) > 5 else 'source'

        # A pure-data injection edits the fixture and leaves the classifier alone;
        # its mutation slot is None. The `mutated == probe_text` guard below asks
        # whether the *classifier* changed, which is the wrong question for it and
        # would report INERT on a pair that is about to edit the fixture. So only
        # run that guard when a source mutation was declared at all.
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

        # An IN-PACKAGE injection goes first, because it is the one that lands in
        # the package and forces a rebuild, and because `also` for such an entry is
        # the source edit itself rather than a pair.
        #
        # There are two of these now -- the adjudication and the category
        # classifier -- so the dispatch is a table lookup rather than a comparison
        # against one name. Both take exactly the same path: snapshot, edit, build,
        # run, restore, rebuild.
        in_package = None
        in_package_path = None
        if target in IN_PACKAGE_TARGETS:
            in_package_path = IN_PACKAGE_TARGETS[target]
            base = in_package_path.read_text()
            try:
                in_package = also(base) if also is not None else base
            except AssertionError as exc:
                print(f"INERT    {name}")
                print(f"         -- the {target} edit did not apply: {exc}")
                inert += 1
                continue
            if in_package == base:
                print(f"INERT    {name}")
                print(f"         -- the {target} edit changed nothing")
                inert += 1
                continue
            also = None
            target = 'source'

        data = None
        if also is not None:
            # The paired second edit. A pair is usually one edit to each file, but
            # E and E2 pair two edits to the *classifier source* -- they break its
            # exhaustiveness, which is a property of the classifier and not of any
            # row.
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
            result = run_probe(mutated, data, in_package=in_package, in_package_path=in_package_path)
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

    # Restore and verify every input byte-for-byte. A battery that leaves a mutated
    # file behind produces a green run and a broken repository, and the check has
    # to cover every input now: the in-package injections write into the *package*,
    # so an unrestored one is a mutated source tree rather than a mutated script.
    # The fixture is checked too even though no path writes back to it outside
    # `run_probe`, because the point of this block is that it verifies rather than
    # assumes.
    PROBE.write_text(probe_text)
    restored_probe = PROBE.read_text() == probe_text
    restored_fixture = FIXTURE.read_text() == fixture_text
    restored_package = {
        label: path.read_text() == package_snapshot[label]
        for label, path in IN_PACKAGE_TARGETS.items()
    }
    restored = restored_probe and restored_fixture and all(restored_package.values())

    print(f"\nbattery: {caught} caught, {survived} survived, {inert} inert, {blind} blind")
    if restored:
        print(
            "source restored: identical to backup "
            f"(probe, fixture, {', '.join(sorted(package_snapshot))})"
        )
    else:
        print(
            "source restored: DIFFERS -- inspect before committing "
            f"(probe {restored_probe}, fixture {restored_fixture}, "
            f"package {restored_package})"
        )
    return 0 if caught == len(INJECTIONS) and restored else 1


if __name__ == "__main__":
    sys.exit(main())
