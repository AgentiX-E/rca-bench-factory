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
import tempfile
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

# The component-agreement reading. A fifth in-package target, and the one finding 99
# lands in. `DENIAL` reads the *incident text*; this reads the model's own two output
# fields against each other -- the `category` against the `component` from the same
# answer. It is the mechanism `DENIAL` cannot reach, because text absence admits both
# "could not read the incident" and "read it and mislabelled the category", while an
# internal inconsistency between the answer's own fields admits only the second.
AGREEMENT = REPO / "packages" / "core" / "src" / "fault" / "component-agreement.ts"

# The control for the agreement reading, created by finding 100. It is a target because it
# is the file that carries the *refutation* of finding 99, and a refutation that no mutation
# can disturb is a refutation nobody has checked. Its three injections read its own two
# figures and its own verdict, and none of them touches the reading it controls.
BASELINE = REPO / "packages" / "core" / "src" / "fault" / "agreement-baseline.ts"

# The category derivation check, created by finding 102. It is a target because it is a
# *check* rather than a reading: it asserts the dataset obeys its own derivation, and a
# check that no mutation can disturb is a check nobody has run. Its injections read its
# own counts and its own verdict, and none of them touches the classifier it reads
# through -- moving the classifier would be testing the wrong file.
DERIVATION = REPO / "packages" / "core" / "src" / "fault" / "category-derivation.ts"

# The shared vocabulary, extracted from `DENIAL` when `AGREEMENT` needed the same table.
# It is a target in its own right because the extraction created a *new* way for the two
# readings to disagree: if a reader carried its own copy, the disagreement would present
# as a difference between the readings rather than between their tables. An injection
# into this file therefore moves *both* readings, which is what makes it worth a target
# rather than being folded into one of them.
CATEGORY_TERMS = REPO / "packages" / "core" / "src" / "fault" / "category-terms.ts"
AIOPS2025_EXPORT = REPO / "packages" / "core" / "src" / "export" / "aiops2025.ts"
SCORER = REPO / "packages" / "core" / "src" / "score" / "score.ts"
ITBENCH_EXPORT = REPO / "packages" / "core" / "src" / "export" / "itbench.ts"
CLOUDOPSBENCH_EXPORT = REPO / "packages" / "core" / "src" / "export" / "cloudopsbench.ts"
DIFFICULTY = REPO / "packages" / "core" / "src" / "export" / "difficulty.ts"
# v1.47's target. The UModel type mapping is the third exhaustive projection table and
# the only one whose key set no test could reach, because the record is private. An
# injection here is the only way to say the source-level reading is load-bearing.
RCA100_EXPORT = REPO / "packages" / "core" / "src" / "export" / "rca100.ts"

# Every in-package target, mapped to the source it edits. `run_probe` takes one of
# these at a time; keeping them in a table rather than in a chain of `if`s is what
# makes "which file did this injection touch" answerable from the report.
IN_PACKAGE_TARGETS = {
    "rule": ADJUDICATION,
    "collector": COLLECTOR,
    "distractor": DISTRACTOR,
    "denial": DENIAL,
    "agreement": AGREEMENT,
    "terms": CATEGORY_TERMS,
    "baseline": BASELINE,
    "derivation": DERIVATION,
    # The exporter and the scorer joined the battery in v1.45. Before that the
    # `fault_category` vocabulary had no injection aimed at it at all: the battery read
    # the derivation block, which counts consumers, and a vocabulary is not a consumer.
    "categories": AIOPS2025_EXPORT,
    "scorer": SCORER,
    # v1.46 added the five remaining enumerated fields. `itbench` and `cloudopsbench` are the
    # exporters that own the projection tables; `difficulty` is the shared module both of them
    # and the scorer now read the word set from, so an edit there moves both targets at once.
    "itbench": ITBENCH_EXPORT,
    "cloudopsbench": CLOUDOPSBENCH_EXPORT,
    "difficulty": DIFFICULTY,
    # v1.47 added the third exhaustive projection table. It is a target for the same reason
    # `categories` and `scorer` are: the property lives in the package, and the probe reads
    # it through the exporter, so an injection has to land in the file that owns it.
    "rca100": RCA100_EXPORT,
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


def _run_json_probe(script: Path) -> subprocess.CompletedProcess:
    """Run a probe with `--json` and capture its output **through a file**.

    `subprocess.run(..., capture_output=True)` truncates this probe's output in this
    environment, and it does so **non-deterministically**. Measured on the same command,
    reading stdout to EOF through a pipe returned 16384 bytes once and 8192 bytes on the
    next two runs, while the probe's true output -- redirected to a file -- is a stable
    16396. `python3` and `bash` pass 20000 bytes through the identical pipe, so this is
    not a sandbox cap; it is specific to how this node process's output is drained.

    The battery ran for several findings without noticing, because the truncated payload
    still happened to be valid JSON up to the cut until finding 100's `baseline` block
    pushed the output past the boundary. It then surfaced as a `JSONDecodeError:
    Unterminated string` inside `run_probe` rather than as anything naming truncation --
    the failure mode this file's own comments keep recording, arriving once more.

    Routing through a temp file is deterministic across four consecutive runs (16396
    every time), and the size is asserted against the byte count the file actually holds
    so a partial write cannot pass as a complete one.
    """
    with tempfile.TemporaryDirectory() as tmp:
        out_path = Path(tmp) / "probe.json"
        with out_path.open("wb") as handle:
            proc = subprocess.run(
                ["node", str(script), "--json"],
                cwd=REPO,
                stdout=handle,
                stderr=subprocess.PIPE,
            )
        raw = out_path.read_bytes()

    if not raw.strip():
        # `ValueError`, not `AssertionError`, and deliberately so.
        #
        # Several injections in this battery *intend* to make the probe publish nothing --
        # N renames the last classification branch so the partition ceases to be exhaustive
        # and the probe's own guard throws. That is a measurement, not a harness error, and
        # the caller already converts `JSONDecodeError`/`ValueError` into "the probe produced
        # no report, so no classification was published" and counts it CAUGHT.
        #
        # Raising `AssertionError` here aborted the whole battery on N -- the exact failure
        # mode this file's comments keep recording, arriving once more: a diagnostic that
        # replaced a handled condition with an unhandled one. The message keeps the byte
        # count, so a genuine truncation is still distinguishable from a probe that
        # correctly refused to report.
        raise ValueError(
            f"{script.name} produced no report: rc={proc.returncode}, "
            f"{len(raw)} bytes on stdout, "
            f"{proc.stderr.decode('utf-8', 'replace')[-300:]}"
        )

    proc.stdout = raw.decode("utf-8")
    return proc


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
        proc = _run_json_probe(PROBE)
        # The category probe runs in the same try, over the same mutated tree, so
        # an injection into the classifier is measured on the classifier as it was
        # installed rather than on a second build. Its output is merged into this
        # report under `category`; the two probes observe different objects and the
        # keys keep them apart.
        cat_proc = _run_json_probe(CATEGORY_PROBE)
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

# The agreement reading's baseline, and a fifth dict. Same reason as the fourth: it observes
# a different object again -- the answer's *internal* consistency, not the text and not the
# answer's support by the text -- so a mutation that moves it must not be observable as a
# movement in any of the four above, or the separateness of the readings would be untested.
AGREEMENT_BASELINE: dict = {}

# The baseline control's own dict, and a sixth. It reads a sixth object again -- components
# whose correctness is *given* rather than measured -- so the separateness argument extends:
# a mutation that moves it must not be observable as movement in any of the five above. In
# particular AC and AB both empty a term table, one shared and one private, and a single dict
# would make them indistinguishable.
BASELINE_BASELINE: dict = {}

# The category-derivation control's baseline, captured before any mutation. Seventh block.
DERIVATION_BASELINE: dict = {}

# The emitted-category-vocabulary reading's baseline, captured before any mutation. Eighth
# block, and it reads an eighth object: the *declared domain* of the exported
# `fault_category`, which is neither the derivation's downstream verdict nor the
# classifier's partition. It gets its own dict for the standing reason -- the mutation that
# moves the vocabulary's size must not be observable as movement in the derivation block,
# or the separateness of the two readings would be untested.
CATEGORIES_BASELINE: dict = {}

# A ninth, for the scorer's own behaviour on an out-of-vocabulary category. The block above
# describes the declared domain; this one describes what the check *does* with a word outside
# it. Two dicts, because the edits that move them are in different files -- the exporter and
# the scorer -- and one dict would make an exporter edit and a scorer edit indistinguishable.
SCORER_CATEGORIES_BASELINE: dict = {}

# A tenth block, for the five enumerated fields v1.45's closing note handed forward: `itbench`
# publishes three of them (`scenario_domain`, `scenario_class`, `scenario_complexity`) and
# `cloud-opsbench` two (`difficulty`, `result.fault_taxonomy`), and all five were validated
# with a bare `typeof` until v1.46. Its own dict for the standing reason: a mutation in
# `itbench` must not be observable as movement in an AIOps2025 figure, or the separateness of
# the two readings would be untested.
OUTCOME_VOCABULARY_BASELINE: dict = {}


def outcome_vocabulary(report: dict) -> dict:
    """The three outcome-contract vocabularies and their checks' behaviour on a stray.

    A sibling of `categories`/`scorer_categories`, and it lives inside `derivation` for the
    same reason: that block is where the probe reads the contract vocabulary, and these are
    more contract vocabularies rather than a different kind of object.
    """
    return report["derivation"]["outcomeVocabulary"]


def outcome_vocabulary_baseline() -> dict:
    return OUTCOME_VOCABULARY_BASELINE


def categories(report: dict) -> dict:
    """The emitted-category-vocabulary block, from the derivation reading's own report.

    It lives *inside* `derivation` because that block is where the probe reads the category
    field: the block counts the field's consumers, and these figures describe the field's
    domain. Same object, two different questions about it.
    """
    return report["derivation"]["categories"]


def scorer_categories(report: dict) -> dict:
    """What the structure check does with an out-of-vocabulary `fault_category`.

    A sibling of the block above. The two are not one reading: the first is about the
    *declared* domain, the second about what the scorer does with a value outside it, and an
    edit to the scorer moves only the second.
    """
    return report["derivation"]["scorerCategories"]


def categories_baseline() -> dict:
    return CATEGORIES_BASELINE


def scorer_categories_baseline() -> dict:
    return SCORER_CATEGORIES_BASELINE


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


def agreement(report: dict) -> dict:
    """The agreement reading's block from a run's report.

    Named after the property -- whether the answer agrees with itself -- rather than after the
    module, so a call site reads as the claim being checked. Four readings now read four
    different objects and no two share a word.
    """
    return report["agreement"]


def agreement_baseline() -> dict:
    return AGREEMENT_BASELINE


def baseline(report: dict) -> dict:
    """The baseline control's block from a run's report.

    Named for the *role* it plays rather than the module it lives in, because its role is the
    claim being checked: it is the baseline the agreement block was missing. Six readings now
    read six objects and no two share a word.
    """
    return report["baseline"]


def baseline_baseline() -> dict:
    return BASELINE_BASELINE


def derivation(report: dict) -> dict:
    """The category derivation block from a run's report.

    Named after the check rather than the module, so a call site reads as the claim being
    checked. Seven readings now read seven objects and no two share a word.
    """
    return report["derivation"]


def derivation_baseline() -> dict:
    return DERIVATION_BASELINE


def blind_anchor(result: dict | None, which: str) -> tuple:
    """The figures the blind check compares, read from the block the entry declared.

    Returns a tuple so any anchor can be compared with `==`. The default anchor is the
    classifier's partition, which is what every injection written before finding 100 was
    implicitly anchored on; the slot became explicit when AD showed that a `category` edit
    cannot move it and was being reported BLIND for the right behaviour.

    `None` means the baseline run, which is what the live run is compared against.
    """
    if which == 'classifier':
        if result is None:
            return (BASELINE["total"], tuple(sorted(BASELINE["counts"].items())))
        return (result["total"], tuple(sorted(result["counts"].items())))

    if which == 'baseline':
        if result is None:
            return (
                BASELINE_BASELINE["expected"]["supporting"],
                BASELINE_BASELINE["expected"]["graded"],
                BASELINE_BASELINE["predicted"]["supporting"],
                BASELINE_BASELINE["predicted"]["graded"],
                BASELINE_BASELINE["separates"],
            )
        b = baseline(result)
        return (
            b["expected"]["supporting"],
            b["expected"]["graded"],
            b["predicted"]["supporting"],
            b["predicted"]["graded"],
            b["separates"],
        )

    if which == 'derivation':
        # The verdict is the first figure the derivation check publishes, and it is the one
        # every injection here is aimed at moving. A `category` edit cannot reach it; a
        # change to the conformance count can. Anchoring on the published verdict means an
        # injection that lands where the check cannot see it is still reported BLIND.
        if result is None:
            return (
                DERIVATION_BASELINE["discriminatingPower"]["separates"],
                DERIVATION_BASELINE["discriminatingPower"]["differ"],
                DERIVATION_BASELINE["conformance"]["conforming"],
                DERIVATION_BASELINE["conformance"]["graded"],
                DERIVATION_BASELINE["misses"]["consistent"],
                DERIVATION_BASELINE["missStability"]["stableIds"],
            )
        d = derivation(result)
        return (
            d["discriminatingPower"]["separates"],
            d["discriminatingPower"]["differ"],
            d["conformance"]["conforming"],
            d["conformance"]["graded"],
            d["misses"]["consistent"],
            d["missStability"]["stableIds"],
        )

    if which == 'categories':
        # The emitted vocabulary, anchored on the two figures that mean different things:
        # how many words are admitted, and how many of them no source can account for. An
        # injection that shrinks the union moves `admitted`; one that widens it past its
        # sources moves `stray`. Anchoring on both is what keeps an entry from being
        # reported BLIND for moving a figure its own anchor does not read.
        if result is None:
            return (
                CATEGORIES_BASELINE["admitted"],
                CATEGORIES_BASELINE["distinct"],
                CATEGORIES_BASELINE["outsideIrVocabulary"],
                CATEGORIES_BASELINE["stray"],
            )
        c = categories(result)
        return (c["admitted"], c["distinct"], c["outsideIrVocabulary"], c["stray"])

    if which == 'outcomeVocabulary':
        # Anchored on the figures that mean different things and move in different files: the
        # word count an exporter edit changes, and the ghost verdict a scorer edit changes. An
        # entry aimed at the exporter must not be rescued by the scorer's figure and vice
        # versa, so both are read -- together with each check's legal control, without which a
        # check that rejected everything would look like a working one.
        keys = (
            "itbenchWords",
            "cloudOpsWords",
            "difficulties",
            "itbenchGhostRejected",
            "cloudOpsTaxonomyGhostRejected",
            "itbenchLegalAccepted",
            "cloudOpsLegalAccepted",
            # v1.47. A projection table can now fail in three distinct ways -- a row renamed
            # so the key set drifts, a row added so the table admits a kind the IR does not
            # have, and a row's value changed so two words collapse into one -- and the three
            # are not distinguishable from a word count alone. The key-set equality is
            # published beside the row count for exactly that reason: a rename leaves the
            # count at 8 and moves only the equality.
            "itbenchTableRows",
            "cloudOpsTableRows",
            "itbenchKeySetMatchesIr",
            "cloudOpsKeySetMatchesIr",
            "umodelRows",
            "umodelDistinctWords",
            "umodelKindsAnswered",
            # BM showed the three figures above cannot see a *declared* key the IR does not
            # have. Every read of the table is `UMODEL_TYPE[kind]`, so a ghost key changes no
            # emitted byte. This was measured rather than argued: BL's mutation was applied,
            # the probe re-run, and `umodelRows`, `umodelDistinctWords` and
            # `umodelKindsAnswered` were all unchanged at 9/7/9. The two figures below are
            # read from the source text precisely because the behavioural route provably
            # cannot reach the defect, and they are anchored here -- not only named in the
            # requirement -- so that an entry aimed at them is BLIND when it misses.
            "umodelDeclaredRows",
            "umodelDeclaredKeySetMatchesIr",
            # v1.48. The other half of the same story: the projection table is read at four
            # sites, and the key set was not the only thing nobody checked. An *exporter*
            # edit moves the vocabulary size; a *scorer* edit moves a ghost verdict. Both
            # directions are anchored, for the reason the paragraph above gives.
            "rca100UmodelVocabularyWords",
            "rca100EntityTypeGhostRejected",
            "rca100EntitySetGhostRejected",
            "rca100EdgeTypeGhostRejected",
            "rca100TypesLegalAccepted",
        )
        if result is None:
            return tuple(OUTCOME_VOCABULARY_BASELINE[k] for k in keys)
        o = outcome_vocabulary(result)
        return tuple(o[k] for k in keys)

    raise AssertionError(f"unknown blind anchor {which!r}")


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
    # --- The component-agreement reading -------------------------------------------
    #
    # Z, AA and AB are the injections finding 99 brought. They land in a fifth in-package
    # target, and they exist because the `agreement` block publishes figures that each encode
    # a claim: that the reading recognises support when it is there (Z), that "no component to
    # read" is not reported as disagreement (AA), and that the vocabulary the reading uses is
    # the shared one rather than a private copy (AB).
    #
    # The reading is the mechanism finding 98 could not reach, so these are the injections
    # that say so: a reading which cannot be moved is a reading that reports nothing, and the
    # finding's whole force is that this one moves.
    (
        "Z. agreement: never recognise support, so every component reads as a disagreement",
        None,
        lambda r: agreement(r)["syntheticCounts"]["agrees"]
        == agreement_baseline()["syntheticCounts"]["agrees"],
        "the synthetic agreement count, so the reading can distinguish support from its absence",
        # The discriminating half. The baseline has 0 agreements on this fixture, so the
        # requirement is a movement claim rather than a value: the mutation forces the
        # `agrees` branch unreachable by returning the disagreeing verdict from both paths,
        # which drives no figure *up* on this data.
        #
        # That makes this the shape U and the `notAssessable` baseline nearly had -- a
        # requirement on a figure that is already at its floor cannot be moved by a mutation
        # that only removes agreements. So the mutation is paired with the *denominator*
        # instead: forcing every component to disagree also folds the `not-assessable` row
        # into the graded set, which moves `graded` from 7 to 8. The requirement below reads
        # `graded`, which is the figure this mutation actually moves -- the lesson V records,
        # applied before the injection ships rather than after.
        #
        # Written as a body replacement rather than by deleting the branch, so every reference
        # stays valid and the defect is observable at run time. Deleting it was the first
        # version and it fails the build on `terms` becoming unused -- caught, but caught at
        # compile with the requirement never evaluated.
        lambda t: rename(
            t,
            "  const lower = component.toLowerCase();\n"
            "  const found = terms.filter((term) => lower.includes(term));\n"
            "  return found.length > 0\n"
            "    ? { verdict: 'agrees', terms: found }\n"
            "    : { verdict: 'disagrees', terms: [] };",
            "  const lower = component.toLowerCase();\n"
            "  const found = terms.filter((term) => lower.includes(term));\n"
            "  return found.length > 0 || true\n"
            "    ? { verdict: 'disagrees', terms: [] }\n"
            "    : { verdict: 'disagrees', terms: [] };",
        ),
        'agreement',
    ),
    (
        "AA. agreement: treat a missing component as a disagreement, so a blank field counts against the answer",
        None,
        lambda r: agreement(r)["syntheticCounts"]["notAssessable"]
        == agreement_baseline()["syntheticCounts"]["notAssessable"],
        "the synthetic not-assessable count, so 'no component to read' is not reported as a disagreement",
        # Finding 94's rule for the third value, and this time the baseline is **1** rather
        # than 0 -- `middleware-kafka-consumer-lag` genuinely has no component row -- so the
        # injection is observable without the probe having to construct an input, which is
        # what U needed and did not have.
        #
        # Folding the blank case into `disagrees` would move `graded` 7 -> 8 and `disagrees`
        # 7 -> 8 while `agrees` stayed 0, so the figure reads *better*: a sample with nothing
        # to read would be counted as evidence for the finding. That direction is the reason
        # the third value exists -- a missing input must never improve a figure.
        lambda t: rename(
            t,
            "    return { verdict: 'not-assessable', terms: [] };",
            "    return { verdict: 'disagrees', terms: [] };",
        ),
        'agreement',
    ),
    (
        "AB. terms: empty the shared vocabulary, so both readings lose their basis at once",
        None,
        lambda r: denial(r)["counts"]["absent"] == denial_baseline()["counts"]["absent"]
        and agreement(r)["syntheticCounts"]["agrees"]
        == agreement_baseline()["syntheticCounts"]["agrees"],
        "the absent count and the synthetic agreement count, the figures this one mutation moves in each",
        # The extraction's own risk, pinned. `category-terms.ts` was created when a second
        # reading needed the same vocabulary, and the defect it introduces is that a change
        # now lands in **two** instruments. This injection is the only one in the battery whose
        # requirement reads two blocks, because it is the only mutation that edits a file two
        # blocks depend on -- and a requirement that read one of them would report a partial
        # effect as the whole one.
        #
        # An empty table makes every category unrecognised. In `denial-inventory` that means
        # every sample is `absent` (the `terms.length === 0` branch); in `component-agreement`
        # it means every sample `disagrees` (its own unknown-category branch, which resolves
        # the opposite way and is asserted in that module's tests). Both are well-formed
        # reports that measure nothing, which is the shape this battery exists to catch.
        #
        # Emptied in place rather than renamed: renaming would fail the build on the internal
        # reference and on the `index.ts` re-export -- caught, but the wrong-reason trap this
        # battery has now recorded five times.
        lambda t: rename(
            t,
            "  middleware: ['database', 'db', 'redis', 'kafka', 'mq', 'queue', 'cache', 'sql', 'mysql', 'postgres', 'lag'],",
            "  middleware: [],",
        ),
        'terms',
    ),
    # --- The baseline control, finding 100 -----------------------------------------
    #
    # AC, AD and AE exist because the baseline block publishes a *refutation*, and a
    # refutation is a claim like any other: it asserts that the expected side agrees on 1 of
    # 19 (AC), that the model's side agrees on 0 of 7 (AD), and that the contrast is not
    # load-bearing because the expected share sits below the floor (AE). Each can be false,
    # and each is pinned by a mutation that would make it false.
    #
    # The block they land in is the one that says finding 99's `7 of 7` is an artifact. If
    # any of these three survives, the refutation is unsupported and finding 99 stands.
    (
        "AC. baseline: count every component as supporting, so the expected side reads 19 of 19",
        None,
        lambda r: baseline(r)["expected"]["supporting"]
        == baseline_baseline()["expected"]["supporting"],
        "the expected side's supporting count, which is the only figure this mutation moves",
        # The expected side's figure is `1 of 19`, and the whole refutation rests on it being
        # low. Forcing `readBaselineSupport` to report support unconditionally drives it to
        # 19 of 19 -- and, on the predicted side, to 7 of 7. Both are real movements.
        #
        # Note what this does *not* do: it does not make `separates` true. With both sides at
        # 1.0 the expected share is above the floor, so a naive `predicted < expected`
        # comparison would have been satisfied here -- which is exactly why the module's
        # `separates` was rewritten to read the floor. A mutation that moves the figure
        # without moving the verdict is the cross-check that the two are independent.
        lambda t: rename(
            t,
            "  const found = terms.filter((term) => lower.includes(term));\n"
            "  return { terms: found, supports: found.length > 0 };",
            "  const found = terms.filter((term) => lower.includes(term));\n"
            "  return { terms: found, supports: true };",
        ),
        'baseline',
    ),
    (
        "AD. baseline: read the predicted side against the expected category, so it reads 1 of 7",
        None,
        lambda r: baseline(r)["predicted"]["supporting"]
        == baseline_baseline()["predicted"]["supporting"],
        "the predicted side's supporting count, so the two sides are not interchangeable",
        # The defect this guards against is real and it is the defence the finding's own test
        # runs deliberately: reading the misses against the *expected* category rather than the
        # *answered* one takes the predicted side from 0 of 7 to 1 of 7. That is a plausible,
        # well-intentioned edit -- and it changes which claim the block reports, because the
        # block's subject is the answered category.
        #
        # Modelled in the fixture rather than in the module, because the probe builds the
        # predicted side from the `category` the run answered: rewriting the recorded answers to
        # the categories their samples expect is the same edit from the data's side, and it does
        # not require the block to take a different input than the one it is supposed to read.
        #
        # Seven replacements, one per recorded `category` miss. The first version of this entry
        # passed the edit through `also` with target `'fixture'`, and the harness discarded it:
        # `also` is consumed to build a *paired* edit, and writing `data = paired` after already
        # writing `data = mutated` left two fixture edits competing. It reported INERT while the
        # mutation, applied by hand, moved `predicted.supporting` from 0 to 1. Passing the edit in
        # the `mutation` slot is what the target expects.
        lambda t: t.replace(
            "resource-memory-leak-recommendation.category:resource>code",
            "resource-memory-leak-recommendation.category:resource>resource",
        )
        .replace(
            "runtime-pod-kill-user-profile.category:runtime>resource",
            "runtime-pod-kill-user-profile.category:runtime>runtime",
        )
        .replace(
            "runtime-container-crash-loop-media.category:runtime>dependency",
            "runtime-container-crash-loop-media.category:runtime>runtime",
        )
        .replace(
            "middleware-redis-latency-cache.category:middleware>resource",
            "middleware-redis-latency-cache.category:middleware>middleware",
        )
        .replace(
            "middleware-database-connection-pool.category:middleware>resource",
            "middleware-database-connection-pool.category:middleware>middleware",
        )
        .replace(
            "code-slow-regex-api-gateway.category:code>config",
            "code-slow-regex-api-gateway.category:code>code",
        )
        .replace(
            "middleware-mysql-replica-lag-analytics.category:middleware>resource",
            "middleware-mysql-replica-lag-analytics.category:middleware>middleware",
        ),
        'fixture',
        'baseline',
    ),
    (
        "AE. baseline: lower the floor to zero, so any difference is called load-bearing",
        None,
        lambda r: baseline(r)["separates"] == baseline_baseline()["separates"],
        "the load-bearing verdict itself, which is the claim the control exists to make",
        # The one injection in this battery whose requirement reads a **boolean**. Every other
        # one reads a figure, and that is the weakness this one closes: a control that reports
        # `1 of 19` and `0 of 7` and then concludes "load-bearing" is a control whose
        # conclusion does not follow from its own numbers. Zeroing the floor makes the
        # expected share clear it, so `separates` flips to true and the block announces a
        # separation it did not measure.
        #
        # This is the defect the module was actually shipped with, caught by reading the probe
        # output rather than by a test: the first `separates` was `predicted < expected`, which
        # is `0/7 < 1/19`, which is true. The probe printed `separates: true` directly above
        # the sentence "the reading does NOT separate them". The injection keeps that from
        # returning by pinning the verdict rather than the arithmetic.
        lambda t: rename(t, "export const BASELINE_FLOOR = 0.2;", "export const BASELINE_FLOOR = 0;"),
        'baseline',
    ),
    # --- The category-derivation control, finding 102 --------------------------------
    #
    # AF to AK exist because the derivation block publishes a *checked invariant* and then a
    # verdict about whether the check can separate anything, and a verdict is a claim like any
    # other. Six claims, six mutations, each one making exactly one of them false:
    #
    #   AF  the conformance count is a count of disagreements, so it must fall to 0-like
    #   AG  the rule is total, so `unknown` must not be counted as defined
    #   AH  `separates` is false, and hardcoding it true must not pass
    #   AI  `separates` is false, and hardcoding it false must not pass either
    #   AJ  the published verdict must be the computed one, not a proxy for it
    #   AK  the verdict must be the *first* field, not merely present
    #
    # AH and AI are a pair and neither is sufficient alone. A battery that only pins
    # `separates: false` passes for a module that hardcodes false; a battery that only pins
    # `separates: true` passes for a module that hardcodes true. Neither end alone tests the
    # verdict, so both ends are pinned and the verdict is tested only in combination.
    #
    # This is the finding-100 defect in its new home. There, `separates` was first written as
    # `predicted < expected` -- arithmetic that happened to be true for the wrong reason -- and
    # the probe printed `true` directly above a sentence saying the opposite. Repeating it here
    # is not hypothetical: the same author wrote both modules a few hours apart, and the second
    # was written *because* the first was caught by reading output rather than by a test.
    (
        "AF. derivation: count a disagreement as conforming, so the check reports 19 of 19 anyway",
        None,
        lambda r: derivation(r)["controls"]["disagreement"]["conforming"]
        == derivation_baseline()["controls"]["disagreement"]["conforming"],
        "the conforming count **on a sample that disagrees by construction**",
        # The first version of this entry read `conformance.conforming`, which on this corpus is
        # 19 of 19 *before* the mutation, so forcing the always-conform branch changed nothing
        # and the entry SURVIVED. The harness was right and the entry was wrong: a mutation to a
        # branch no input reaches cannot be observed, and calling that survival a defect in the
        # module would have been the wrong repair.
        #
        # The repair is the `controls.disagreement` probe: one sample whose type derives
        # `runtime` and whose label says `middleware`. On that input the honest reading is
        # `0 of 1` with the sample named in `disagreements`; the mutated reading is `1 of 1` with
        # an empty list. The figure moves, so the branch is now observable.
        #
        # This is Finding 100's `synthetic` argument at a second module, and it is the second
        # time this battery has had to make a branch reachable before it could test it. The first
        # time was finding 96's `notAssessable` baseline (injection U).
        lambda t: rename(
            t,
            "    const derived = inferFaultCategory(sample.type);\n"
            "    if (derived === sample.category) {\n"
            "      conforming += 1;\n"
            "    } else {",
            "    const derived = inferFaultCategory(sample.type);\n"
            "    if (true) {\n"
            "      conforming += 1;\n"
            "    } else {",
        ),
        'derivation',
    ),
    (
        "AG. derivation: treat `unknown` as a defined category, so the rule reads as total",
        None,
        lambda r: derivation(r)["controls"]["undefined"]["defined"]
        == derivation_baseline()["controls"]["undefined"]["defined"],
        "the defined count **on a type the table does not know**",
        # Same repair as AF, and the same wrong first entry. Derivability asks whether every
        # labelled type lands on a real category; the corpus answers yes for all 19, so removing
        # the `unknown` branch left the figure at 19 and the entry SURVIVED.
        #
        # `controls.undefined` passes two samples, one whose type derives nothing and one whose
        # type derives `runtime`. The honest reading is `1 of 2` with the unknown type named; the
        # mutated reading is `2 of 2` with an empty `undefinedTypes`. Note that the control pairs
        # a known and an unknown type rather than passing only the unknown one: with only the
        # unknown sample, `defined` is 0 either way and the mutation is inert again.
        lambda t: rename(
            t,
            "    if (inferFaultCategory(sample.type) === 'unknown') {\n"
            "      undefinedTypes.push(sample.type);\n"
            "    }",
            "    if (false) {\n"
            "      undefinedTypes.push(sample.type);\n"
            "    }",
        ),
        'derivation',
    ),
    (
        "AH. derivation: hardcode the verdict true, so the check claims a separation it did not measure",
        None,
        lambda r: derivation(r)["discriminatingPower"]["separates"]
        == derivation_baseline()["discriminatingPower"]["separates"],
        "the load-bearing verdict, which is the claim the derivation block exists to make",
        # The finding-100 defect, moved. `separates` is the one boolean in this block and it is
        # the block's whole subject: everything under it is a figure drawn from a reading whose
        # power is recorded here. Hardcoding it true makes the probe print "the reading
        # separates the model from a correct answerer" above figures showing it does not.
        #
        # The anchor is the `const separates = ...` line rather than the constant, so this
        # mutation and AE (which lowers the floor) are recognisably different edits: AE moves
        # the arithmetic and this moves the conclusion. If only one of them were present, a
        # module that computed the verdict correctly but ignored it would pass.
        lambda t: rename(
            t,
            "  const separates = share > ALT_READING_FLOOR;",
            "  const separates = true;",
        ),
        'derivation',
    ),
    (
        "AI. derivation: hardcode the verdict false, so AH alone cannot pass",
        None,
        lambda r: derivation(r)["controls"]["separating"]["separates"]
        == derivation_baseline()["controls"]["separating"]["separates"],
        "the same verdict as AH, pinned at the other end, **on a reading that does separate**",
        # AH alone is not a check. A module that shrank to `separates: true` is caught by AH --
        # and a module that shrank to `separates: false` passes it, because false is the value
        # this corpus legitimately produces. That is the shape of every "pin the observed value"
        # check: it tests the *value* and not the *derivation*.
        #
        # The first version of this entry read `discriminatingPower.separates`, which is false
        # before and after a hardcode-false mutation, so it SURVIVED -- correctly, and for the
        # same reason AF and AG did. The repair is the `controls.separating` probe: two samples
        # whose types both provoke an alternative reading, so an honest reading gives
        # `separates: true` and a hardcoded false is caught.
        #
        # With this and AH together, the only implementation that passes both is one whose
        # verdict is computed: every constant is caught by exactly one of the pair, on an input
        # where that constant is the wrong answer.
        lambda t: rename(
            t,
            "  const separates = share > ALT_READING_FLOOR;",
            "  const separates = false;",
        ),
        'derivation',
    ),
    (
        "AJ. derivation: publish the count of alternative readings instead of the verdict",
        None,
        lambda r: derivation(r)["discriminatingPower"]["differ"]
        == derivation_baseline()["discriminatingPower"]["differ"],
        "the differing-type list, so every published figure is the computed one",
        # The injection-AC defect shape, in the derivation block: a requirement that reads a
        # *proxy* for the property instead of the property. AC's version was reading a count
        # that could not move; this one reads a figure that moves for a reason unrelated to the
        # verdict.
        #
        # `differSet` is a Set, so its spread is the union of the two readings' differing types.
        # Replacing the *Set population* with a per-reading proxy -- adding each reading's first
        # differing type once per reading, so a type both readings disagree about appears twice --
        # leaves `share` unchanged in value but makes the list no longer a set: the block prints
        # it per reading so a reader can check the union by hand, and a duplicated entry is a
        # union that is no longer a union.
        #
        # The first version of this entry replaced the spread with
        # `alternativeReadings.map((reading) => reading.differ.length)` -- a `number[]` assigned
        # to a `string[]` -- and the build refused it: TS2322. The battery reported the compile
        # error rather than a survival, which is the harness working, but a mutation the compiler
        # rejects is not measuring anything and the entry had to be rewritten to one the language
        # accepts. `concat` on the per-reading lists is the same defect in a well-typed shape.
        lambda t: rename(
            t,
            "  const differ = [...differSet];",
            "  const differ = substringDiffer.concat(shadowingDiffer);",
        ),
        'derivation',
    ),
    (
        "AK. derivation: report the verdict last, so a reader can quote the figures without reaching it",
        None,
        lambda r: list(derivation(r))[0] == list(derivation_baseline())[0],
        "the report's field order, which the module's own test asserts on the type",
        # The ordering is not a style choice and the module says so in a comment on the field:
        # "Put the figures first and the verdict last and a reader can quote the figures without
        # ever reaching it; that is the failure this ordering prevents, and a test asserts the
        # order." This mutation is the failure itself.
        #
        # The requirement reads `list(...)[0]` rather than the value of a named field, because
        # the claim is about *position* rather than about any figure's value -- and a requirement
        # that read `discriminatingPower.separates` would be satisfied by a report with the
        # verdict at the bottom, which is exactly the report this mutation produces.
        #
        # The render order in `probe-type-misses.mjs` and the human-readable output are both
        # derived from this key order, so the mutation moves the block's *subject* and not just
        # its sort. `missStability` is moved to the front because it is the block's most
        # quotable figure -- a count -- and quoting it is precisely what the ordering forbids.
        lambda t: rename(
            t,
            "  return {\n"
            "    discriminatingPower,\n"
            "    conformance,\n"
            "    derivability,\n"
            "    excess,\n"
            "    misses,\n"
            "    missStability,\n"
            "    downstream,\n"
            "    honesty,\n"
            "  };",
            "  return {\n"
            "    missStability,\n"
            "    conformance,\n"
            "    derivability,\n"
            "    excess,\n"
            "    misses,\n"
            "    discriminatingPower,\n"
            "    downstream,\n"
            "    honesty,\n"
            "  };",
        ),
        'derivation',
    ),
    (
        "AL. derivation: declare MissReading twice again, so the published type is a merge",
        None,
        lambda r: derivation(r)["declarations"]["duplicates"]
        == derivation_baseline()["declarations"]["duplicates"],
        "the empty duplicate list, on a module that declares every name once",
        # The defect this iteration exists to fix, re-injected. Typescript merges duplicate
        # `interface` declarations silently: the build passes, the typecheck passes, and every
        # test that imports the type passes. The only artefact that carried the evidence was the
        # emitted `.d.ts`, which declared it twice.
        #
        # The anchor is the *surviving* declaration, and the insertion copies its body verbatim.
        # That matters for what the injection proves: the two declarations are field-for-field
        # identical, so `duplicateTypeDeclarations` is the only thing that can see the defect --
        # no behavioural assertion could, because nothing observable changes. Writing the copy
        # as a *differing* body would have been a different injection (AM does that).
        #
        # `declarations.duplicates` is published by the block from a read of the module's own
        # source, so it is not a figure an in-package mutation can perturb indirectly -- it
        # either sees the second declaration or it does not.
        lambda t: rename(
            t,
            "export interface MissReading {",
            "export interface MissReading {\n"
            "  /** A duplicate of the declaration below, inserted by injection AL. */\n"
            "  graded: number;\n"
            "  consistent: number;\n"
            "  consistentIds: string[];\n"
            "  rows: {\n"
            "    sampleId: string;\n"
            "    answeredType: string;\n"
            "    derived: string;\n"
            "    answeredCategory: string;\n"
            "    expectedCategory: string;\n"
            "    consistent: boolean;\n"
            "  }[];\n"
            "  reachableLoosely: number;\n"
            "  noneConsistent: boolean;\n"
            "}\n\n"
            "export interface MissReading {",
        ),
        'derivation',
    ),
    (
        "AM. derivation: split one declaration into two names, so the pair reads as two types",
        None,
        lambda r: derivation(r)["declarations"]["declarationsRead"]
        == derivation_baseline()["declarations"]["declarationsRead"],
        "the count of declarations read, which moves when one declaration becomes two",
        # The companion to AL, and the case that keeps the pair from being the same test twice.
        # AL adds a second declaration of the *same* name, so the detector reports it and the
        # count of declarations read rises by one. This entry also ends with one more
        # declaration, and the honest duplicate list is still *empty* -- because the two
        # declarations have different names.
        #
        # That is what makes the pair informative rather than repetitive: the same structural
        # change (one more declaration) produces `['MissReading']` there and `[]` here, so a
        # detector anchored on the *number* of declarations is caught by exactly one of the two
        # while a name-based reader passes both.
        #
        # The requirement reads `declarationsRead`, not `duplicates`, and that is deliberate:
        # the honest `duplicates` is empty *before and after* this mutation, so a requirement
        # over it would be satisfied either way and would report this entry as INERT. The figure
        # that moves is the count -- which is exactly the proxy AN shows is not a verdict.
        #
        # This is a two-edit pair, and both edits run inside the one callable below because the
        # entry shape, (name, mutate, requirement, description, also, target, anchor), has no
        # slot for a third edit: the seventh slot is the blind-check *anchor* and takes a name,
        # so a callable placed there would be read as an anchor and never run -- and the battery
        # would then report the entry as INERT with the unapplied edit named.
        #
        # The pair is forced rather than stylistic. A bare rename does not compile: the module
        # references `MissReading` in four places, so it is TS2304 x4 plus TS2305 in `index.ts`,
        # and a mutation the compiler rejects measures nothing. The rename therefore has to be
        # paired with an alias, `export type MissReading = MissReadingRenamed;`, inserted after
        # the renamed declaration. After both edits the module compiles, every reference still
        # resolves, and *two exported names carry one shape*: the duplicate list stays empty,
        # correctly, because the names differ, while the declaration count rises by one -- which
        # is what this entry's requirement reads. That is also the shape the defect would really
        # take, a second name for one shape, which no behavioural assertion sees.
        #
        # The insertion anchor is the *closing* brace of the renamed interface followed by the
        # doc comment that opens the next declaration, and not the interface header. The body
        # carries doc comments of its own, so an anchor written as "the header plus blank lines"
        # is a guess about text that is not there -- the first attempt at this entry was exactly
        # that guess, and it failed with `anchor not found` rather than silently editing nothing.
        #
        # The composition is the opposite of what AN does with the same edit count. AN is a
        # *three*-edit injection: two edits to one file plus an outer edit to the probe that
        # relabels what is published, because the defect AN is about is that the published
        # figure is a proxy. AM is two edits to the module and no third, because the defect it
        # is about is structural: the published duplicate list is *honest* here and stays empty,
        # so there is nothing to relabel.
        lambda t: rename(
            rename(
                t,
                "export interface MissReading {",
                "export interface MissReadingRenamed {",
            ),
            "  noneConsistent: boolean;\n}\n\n/**",
            "  noneConsistent: boolean;\n}\n\n"
            "export type MissReading = MissReadingRenamed;\n\n/**",
        ),
        'derivation',
    ),
    (
        "AN. derivation: publish the record count instead of the duplicate list",
        # The `declarations` block is built in the *probe*, so this entry edits the probe
        # rather than the module. Editing the module would not move the published figure at
        # all -- the block reads the module's text, and no edit to that text changes how many
        # declarations the reader sees unless the edit adds or removes one.
        # Both calls are removed, not just the corpus one. The defect is "publish what the field
        # is expected to say instead of running the check", and an edit that replaced one call
        # while leaving the other would be a different defect -- it would still be asking the
        # detector, on a source that has a duplicate, what it found.
        lambda t: rename(
            t,
            "  const declarations = {\n"
            "    declarationsRead: declarationsRead.length,\n"
            "    duplicates: duplicateTypeDeclarations(moduleText),\n"
            "    duplicatesFoundInControl: duplicateTypeDeclarations(duplicateControlSource),\n"
            "  };",
            "  const declarations = {\n"
            "    declarationsRead: declarationsRead.length,\n"
            "    duplicates: [],\n"
            "    duplicatesFoundInControl: [],\n"
            "  };",
        ),
        # On the corpus the two are indistinguishable: the module declares each name once, so the
        # honest `duplicates` is `[]` and a hardcoded `[]` matches it exactly. The requirement does
        # not read that figure, therefore -- it reads the *control* the probe supplies, a source
        # that declares one name twice. There the honest detector reports the name and the
        # hardcoded list does not.
        # On this corpus the honest duplicate list is empty, so a hardcoded empty list is
        # indistinguishable -- the first version of this entry read the corpus figure and
        # SURVIVED, correctly, for the reason AI and AQ survived on theirs. The repair is the
        # detector's *positive* control: `duplicateTypeDeclarations` is pure over its source, so
        # the probe feeds it a source that declares one name twice and publishes what it finds
        # there. An honest implementation reports the name; a hardcoded empty list does not.
        #
        # The requirement reads the control rather than the corpus, and reads the count of
        # declarations beside it, so an edit that stopped *reading* the module is caught as well.
        lambda r: derivation(r)["declarations"]["duplicatesFoundInControl"]
        == derivation_baseline()["declarations"]["duplicatesFoundInControl"]
        and derivation(r)["declarations"]["declarationsRead"]
        == derivation_baseline()["declarations"]["declarationsRead"],
        "the duplicate the positive control carries and the count of declarations read, both of "
        "which a hardcoded list contradicts",
        # The proxy defect: a reader that publishes a constant instead of running the check. It is
        # undetectable on this corpus, and that is the finding rather than a flaw in the entry --
        # the module declares every name once, so the honest `duplicates` is `[]` and a hardcoded
        # `[]` is byte-identical. A corpus with a duplicate in it would separate them, which is
        # exactly what AL constructs.
        #
        # So AN and AL are a pair in the same sense AP and AQ are: AL injects the defect the check
        # exists for and is caught; AN removes the check and is not, because on this corpus there
        # is nothing for it to miss. Reading either alone would mislead -- AL alone would suggest
        # the check is load-bearing against a hardcode, and AN alone would suggest it is
        # decorative.
        None,
    ),
    (
        "AO. derivation: agree with the label by construction, so nothing is left to check",
        None,
        lambda r: derivation(r)["misses"]["consistent"]
        == derivation_baseline()["misses"]["consistent"],
        "the per-miss consistent count, which a criterion defined as agreement drives to the "
        "whole graded set",
        # The vacuous-reading defect: if the criterion is defined as "the label agrees", the
        # check can never fail, and a perfect score says nothing about the corpus.
        #
        # The requirement reads `misses.consistent`, and the block matters. The first version of
        # this entry read `conformance.conforming`, which is 19 *before and after*: every recorded
        # row already agrees with its label, so defining the criterion as agreement does not move
        # the headline, and the entry reported SURVIVED while the mutation was plainly visible
        # elsewhere. No requirement over `conformance` can catch this edit, and the figure that
        # moves is the one the edit is written into: `misses.consistent` goes 0 -> 8, because the
        # criterion stops comparing `derived` against `answeredCategory` and starts returning true
        # for every graded miss.
        #
        # What the entry records is narrower and more useful than "the check can be fooled": the
        # *headline* conformance figure cannot distinguish an honest criterion from a vacuous one,
        # while the per-miss figure can. A reader who quotes 19 of 19 alone is quoting a number a
        # by-construction reading also produces.
        lambda t: rename(
            t,
            "    const consistent = derived === miss.answeredCategory;",
            "    const consistent = true;",
        ),
        'derivation',
    ),
    (
        "AP. derivation: hardcode the downstream verdict true, so the reading cannot be refuted",
        None,
        lambda r: derivation(r)["downstream"]["separates"] == derivation_baseline()["downstream"]["separates"],
        "the measured downstream verdict, false on this corpus, which a hardcoded true contradicts",
        # One of a matched pair with AQ. A hardcoded verdict is caught by whichever of the two
        # it does not say, and only by the pair: a single injection would be satisfied by a
        # hardcode that happened to match, so the two are written together and neither is
        # removed.
        #
        # The requirement reads `separates` and not `share`, because a reader that hardcodes the
        # verdict while leaving the share measured would satisfy a share requirement -- the figure
        # a reader quotes is the verdict.
        lambda t: rename(
            t,
            "  const separates = alternativeShare > DOWNSTREAM_FLOOR;",
            "  const separates = true;",
        ),
        'derivation',
    ),
    (
        "AQ. derivation: hardcode the downstream verdict false, so AP alone cannot be satisfied",
        None,
        lambda r: derivation(r)["controls"]["downstreamSeparating"]["separates"]
        == derivation_baseline()["controls"]["downstreamSeparating"]["separates"],
        "the separating control's verdict, which an honest reading gives as true and a hardcoded "
        "false contradicts",
        # The other half of the pair, and the same repair AI needed one field over.
        #
        # On this corpus the honest verdict *is* false, so a hardcoded false reproduces every
        # published downstream figure byte for byte -- `conformance`, `missStability`,
        # `discriminatingPower`, `derivability`, `excess` and `downstream.reason` are all
        # unchanged. The first version of this entry read `downstream.separates` on the corpus and
        # SURVIVED, correctly, for the reason AI survived against `discriminatingPower`.
        #
        # The repair is the `controls.downstreamSeparating` reading, which the probe builds from
        # two samples the alternative derivation moves *throughout*. There an honest reading gives
        # `separates: true`, so a hardcoded false is the wrong answer and is caught. The
        # requirement reads the control rather than the corpus for exactly that reason: a figure
        # that cannot move is a figure that cannot catch anything.
        #
        # With AP and AQ together, the only implementation that passes both is one whose verdict is
        # computed: each constant is caught by the entry that says the other value.
        lambda t: rename(
            t,
            "  const separates = alternativeShare > DOWNSTREAM_FLOOR;",
            "  const separates = false;",
        ),
        'derivation',
    ),
    (
        "AR. derivation: count every consumer, so two chances to disagree read as four",
        None,
        lambda r: derivation(r)["downstream"]["branching"] == derivation_baseline()["downstream"]["branching"],
        "the count of branching consumers, which is not the size of the evidence",
        # The census is owned by the module, so this entry edits the module.
        #
        # The entry predates Finding 104 and its anchor did not survive the change: it was written
        # against `branches: false`, the two-valued flag the census carried before the roles
        # replaced it, and it edited a copy of the list that lived in the probe. Finding 104 moved
        # the census into `category-derivation.ts` and deleted the probe's copy, so the old anchor
        # matched nothing and the entry went INERT -- silently, for as long as it took to run the
        # battery, because an anchor that no longer exists produces no compile error and no test
        # failure. This is the one entry the refactor broke, and it is recorded in the audit as
        # part of Finding 104 rather than quietly repaired here.
        #
        # The claim is unchanged and is the v1.43 half of the evidence story: inflating a
        # projecting consumer to `branches` changes no *verdict* -- the sample treatment is
        # identical under it either way, which is what AU and AV say -- so what it moves is the
        # size of the evidence. `branching` counts the filters and `evidence` counts the consumers
        # that can reject, and since Finding 104 the two are different numbers (2 and 3) rather
        # than the same number spelled twice.
        lambda t: rename(
            t,
            "  { name: 'export/itbench.ts:119', role: 'projects', outcome: (category) => `label:${category}` },",
            "  { name: 'export/itbench.ts:119', role: 'branches', outcome: (category) => `label:${category}` },",
        ),
        "derivation",
    ),
    (
        "AS. derivation: drop the consumer list, so the question is never asked",
        # The probe supplies the consumers, so this entry edits the probe.
        lambda t: rename(
            t,
            "    adversarialWords,\n    consumers: CATEGORY_CONSUMERS,\n  });",
            "    adversarialWords,\n  });",
        ),
        # The absent block has to be *read* rather than indexed. `derivation(r)["downstream"]` is a
        # KeyError the moment the removal takes effect, and a requirement that raises reports the
        # entry as a crash rather than as caught -- so the honest denominator of "not asked" is
        # read with `.get`, and `0` is the value the mutation produces.
        lambda r: (derivation(r).get("downstream") or {}).get("graded")
        == derivation_baseline()["downstream"]["graded"],
        "the downstream denominator, so the block reports a reading it actually took",
        # The absent-reading defect. The report's `downstream` field is optional precisely so
        # that a caller with no consumers asserts nothing -- but the *probe* has consumers, and
        # a probe that stopped supplying them would publish a block whose most consequential
        # section is absent while every remaining figure stayed green.
        #
        # The requirement reads `graded` rather than testing for the key, because a block that
        # defaulted the absent reading to a vacuous `graded: 19, lossless: true` would satisfy a
        # key-presence check while asserting an agreement nobody measured. A denominator of 0 is
        # the honest shape of "not asked" and it is what moves here.
        None,
    ),
    # ---------------------------------------------------------------------------------------
    # The six entries Finding 104 adds.
    #
    # The contract is `(name, mutate, requirement, description, also, target[, anchor])`. These
    # six were first written with the mutate slot omitted, which slid every later item one place
    # to the left: the edit lambda landed in the description slot and the target string landed in
    # `also`. `main` then read `also` as the string "derivation", the in-package branch's
    # `in_package = also(base)` compared `base` with `base`, and all six were reported INERT with
    # "the edit changed nothing" -- against anchors that were, in fact, exactly right. Every one
    # of the six anchors matches its target file byte-for-byte.
    #
    # That is a second Finding-104 subject and it is recorded in the audit: the battery has no
    # shape check, so a malformed entry and a no-op edit are indistinguishable in its output, and
    # the reader's natural next move -- inspect the anchor -- confirms the anchor is fine and
    # leaves the entry firing at nothing.
    #
    # What the six are for. `AT` reproduces the census-short-by-one defect Finding 104 found;
    # `AU` and `AV` move `evidence` in the two directions the old two-valued flag conflated;
    # `AW` is the row order the refutation silently depends on; `AX` is the overstatement in its
    # most direct form; `AY` is the boundary case where the roles vanish entirely.
    # ---------------------------------------------------------------------------------------
    (
        "AT. derivation: drop the aiops2025 consumer from the census",
        None,
        # The census size, which is the figure a short census moves. Read from the module's own
        # published reading rather than from the constant, so a census that was dropped but whose
        # length was reported separately would still be caught.
        lambda r: len(derivation(r)["downstream"]["consumers"])
        == len(derivation_baseline()["downstream"]["consumers"]),
        # The census completeness defect. `export/aiops2025.ts:76` reads `fc.fault.category`
        # through a `??` fallback that the corpus reaches on 16 of 19 samples, and it was absent
        # from both hand-written copies of the list. A census that is short by one reports a
        # smaller evidence count than the repository has, and the caveat prints that count.
        #
        # The mutation *removes* the entry. The first version renamed it, so the edit stayed a
        # single anchored replacement and the array stayed well-formed -- and the entry SURVIVED,
        # correctly, because a rename leaves `consumers.length` at five. That is the v1.43
        # wrong-field trap in its usual shape: the requirement read the figure the mutation was
        # *supposed* to move, and the mutation did not move it. The repair is to change the
        # input rather than the verdict, so the whole entry is deleted -- including its doc
        # comment and closing brace, which is what keeps the array well-formed as a *four*-entry
        # list rather than a five-entry one with a renamed member.
        "the consumer census, so a field the copies once omitted is not omitted again",
        lambda t: rename(
            t,
            "  {\n"
            "    name: 'export/aiops2025.ts:76',\n"
            "    role: 'verified',\n"
            "    // The exporter's own table is keyed by *type* and falls back to the IR category. Simulated at\n"
            "    // the same granularity the other entries use: what this records is that the consumer holds a\n"
            "    // second opinion and admits when it has none, not what that opinion is for each slug. The\n"
            "    // per-slug reachability is a corpus measurement and lives in the test that makes it.\n"
            "    outcome: (category) => `table-or-ir:${category}`,\n"
            "  },\n",
            "",
        ),
        "derivation",
    ),
    (
        "AU. derivation: role the aiops2025 consumer as a projection",
        None,
        # `evidence`, the count the caveat prints. Not `consumers.length`: that figure is unmoved
        # by this edit, which is exactly the point.
        lambda r: derivation(r)["downstream"]["evidence"]
        == derivation_baseline()["downstream"]["evidence"],
        # The `verified` role's reason to exist. The two-valued flag this census replaced could
        # not express it at all: `aiops2025` neither branches nor projects, and recording it as
        # either is wrong in a different direction. As `projects` it leaves the evidence set, so
        # the reading reports two chances to disagree where the repository has three -- and the
        # figure would be right for the wrong reason, which is what AU exists to catch.
        "the evidence count, so a consumer that can reject is not counted as one that cannot",
        lambda t: rename(
            t,
            "    name: 'export/aiops2025.ts:76',\n    role: 'verified',",
            "    name: 'export/aiops2025.ts:76',\n    role: 'projects',",
        ),
        "derivation",
    ),
    (
        "AV. derivation: inflate a projecting consumer into a branching one",
        None,
        # `evidence`, and the flag partition behind it. A promoted projection moves `evidence` up
        # by one while leaving `consumers.length` alone, so a requirement reading the length would
        # pass under this mutation.
        lambda r: derivation(r)["downstream"]["evidence"]
        == derivation_baseline()["downstream"]["evidence"],
        # The mirror of AU, and the direction the v1.43 prose got wrong: counting the two label
        # interpolations as evidence reports a three-consumer result as a five-consumer result.
        # This mutation promotes one of them, and it is the overstatement Finding 104 corrected.
        "the evidence count, so a projection is not counted as a chance to disagree",
        lambda t: rename(
            t,
            "  { name: 'export/itbench.ts:119', role: 'projects', outcome: (category) => `label:${category}` },",
            "  { name: 'export/itbench.ts:119', role: 'branches', outcome: (category) => `label:${category}` },",
        ),
        "derivation",
    ),
    (
        "AW. derivation: swap two rows of the reading table",
        None,
        # The *substring* reading's own disagreement list, which is the one this order decides.
        #
        # Not the top-level `discriminatingPower.differ`: that figure is the union across both
        # alternative readings, and the second of them -- `row-shadowing` -- differs on
        # `redis-latency` for a reason an order change cannot repair. Moving `config` above
        # `middleware` empties the substring reading's list and leaves the union at two, so a
        # requirement reading the union SURVIVED. That was this entry's first requirement, and it
        # is the wrong-field trap recorded in v1.43: the requirement read a figure the mutation
        # does not move. Reading the named reading is what makes the order visible.
        lambda r: next(
            alt["differ"]
            for alt in derivation(r)["discriminatingPower"]["alternativeReadings"]
            if alt["name"] == "substring"
        )
        == next(
            alt["differ"]
            for alt in derivation_baseline()["discriminatingPower"]["alternativeReadings"]
            if alt["name"] == "substring"
        ),
        # The unchecked dependency. The shipped order tests `middleware` before `config` and that
        # ordering is what makes the substring reading derive `middleware` where the label says
        # `config`. Reversing it removes the disagreement without touching the matcher -- which is
        # how Finding 104 established that this is a second defect and not finding 95's.
        #
        # The mutation *moves* the config row above middleware in one anchored replacement of the
        # whole six-line span, rather than inserting a duplicate row. The first version inserted
        # it and kept both, on the reasoning that a duplicate key is a silent JS overwrite whose
        # *first* occurrence wins for `Object.entries` order -- which is the behaviour being
        # mutated. That reasoning was wrong and the compiler said so: `tsc` rejects a duplicate
        # property in an object literal with `TS1117`, so the mutation was a compile error rather
        # than a measurement. A mutation that does not compile measures nothing, and the entry
        # would have been counted as a harness crash rather than as a caught defect.
        "the substring reading's disagreements with the labels, so an order change is visible",
        lambda t: rename(
            t,
            "  middleware: ['database', 'db', 'redis', 'kafka', 'mq', 'queue', 'cache', 'sql', 'mysql', 'postgres', 'lag'],\n"
            "  network: ['network', 'latency', 'delay', 'loss', 'partition', 'bandwidth', 'dns', 'packet', 'drop', 'net'],\n"
            "  resource: ['cpu', 'memory', 'mem', 'disk', 'stress', 'capacity', 'oom', 'saturation', 'leak'],\n"
            "  runtime: ['pod', 'kill', 'crash', 'restart', 'evict', 'container', 'panic'],\n"
            "  code: ['exception', 'error', 'bug', 'null', 'stack', 'throw', 'logic', 'regex', 'backtracking'],\n"
            "  config: ['config', 'setting', 'env', 'yaml', 'property', 'mismatch'],\n",
            "  config: ['config', 'setting', 'env', 'yaml', 'property', 'mismatch'],\n"
            "  middleware: ['database', 'db', 'redis', 'kafka', 'mq', 'queue', 'cache', 'sql', 'mysql', 'postgres', 'lag'],\n"
            "  network: ['network', 'latency', 'delay', 'loss', 'partition', 'bandwidth', 'dns', 'packet', 'drop', 'net'],\n"
            "  resource: ['cpu', 'memory', 'mem', 'disk', 'stress', 'capacity', 'oom', 'saturation', 'leak'],\n"
            "  runtime: ['pod', 'kill', 'crash', 'restart', 'evict', 'container', 'panic'],\n"
            "  code: ['exception', 'error', 'bug', 'null', 'stack', 'throw', 'logic', 'regex', 'backtracking'],\n",
        ),
        "terms",
    ),
    (
        "AX. derivation: report the census size as the evidence count",
        None,
        # `evidence`, the field the mutation moves. The mutation satisfies any requirement that
        # only checks the field exists or is a number, so the requirement reads the value -- and
        # the v1.43 run-3 failure is the precedent for how easy it is to write one that a
        # hardcode satisfies too.
        lambda r: derivation(r)["downstream"]["evidence"]
        == derivation_baseline()["downstream"]["evidence"],
        # The overstatement in its most direct form: the report publishes `evidence` beside
        # `consumers`, and this makes the first equal the second. A reader who quotes the figure
        # the caveat prints is then quoting five consumers that can reject a wrong category where
        # three can.
        "the evidence count, so the size of the census is not published as the size of the evidence",
        lambda t: rename(
            t,
            "    evidence: consumers.filter((consumer) => consumer.role !== 'projects').length,",
            "    evidence: consumers.length,",
        ),
        "derivation",
    ),
    (
        "AY. derivation: point the evidence accessor at the branching roles",
        None,
        # `evidence`, which this mutation moves from three to two. The partition is *not* the
        # figure to read here: `verifying` and `projecting` are computed by the probe from the
        # census's own roles, so an edit to the accessor below them leaves both exactly where
        # they were. That was this entry's first requirement and it SURVIVED -- the v1.43
        # wrong-field trap a third time, in its least obvious form: the partition looks like the
        # role-shaped figure, and it is not the role-shaped figure *this* edit moves.
        lambda r: derivation(r)["downstream"]["evidence"]
        == derivation_baseline()["downstream"]["evidence"],
        # The role vocabulary's boundary, at the source rather than at the report.
        #
        # Two earlier drafts of this entry were rejected by the compiler, and both rejections are
        # the finding rather than an obstacle to it:
        #
        #  - Deleting the `role` lines is `TS2741`: `role` is required by `CategoryConsumer`, so a
        #    census cannot lose its roles at all. The boundary this entry was written for *cannot
        #    be reached* through the type, which is a stronger statement than the entry could make.
        #  - Collapsing the union to `'branches' | 'branches' | 'verified'` is `TS2367`: the
        #    narrowed type makes the accessor's `role !== 'projects'` comparison statically
        #    impossible, so `tsc` refuses the program that would misreport.
        #
        # What is left is the mutation that does compile and does misreport: keep the vocabulary,
        # keep every role, and have the accessor count the wrong one. The two `projects` consumers
        # already carry `branches` in their `outcome` closure and `role` is what distinguishes
        # them, so flipping the accessor to `=== 'branches'` publishes two as the evidence count
        # while `verifying` and `projecting` both move -- three becomes one, five becomes three,
        # and no number in the report is the honest one.
        "the role partition, so an accessor pointed at the wrong role cannot report an evidence count",
        lambda t: rename(
            t,
            "    evidence: consumers.filter((consumer) => consumer.role !== 'projects').length,",
            "    evidence: consumers.filter((consumer) => consumer.role === 'branches').length,",
        ),
        "derivation",
    ),
    (
        "AZ. categories: drop the IR half, so the vocabulary describes only the table",
        None,
        # `admitted`, which this mutation moves from sixteen to nine. The requirement reads the
        # *size* of the declared domain rather than a membership test, because the defect is a
        # missing word and a set that answers "no" for every word would pass a membership probe
        # written the other way round.
        lambda r: categories(r)["admitted"] == categories_baseline()["admitted"],
        "the size of the declared category vocabulary, the figure this mutation shrinks",
        # The IR half of the union, and the one clause that cannot be replaced by reading the
        # table: the fallback carries a `FaultCategory` through for every type the table does
        # not hold -- 16 of the 19 corpus samples -- so a vocabulary built from the table alone
        # would reject what the emitter actually produces.
        #
        # Written as a `.filter` that discards the IR half rather than as a deletion, and the
        # distinction is the whole entry. Deleting `...FAULT_CATEGORIES` from the array literal
        # is TS6133 -- the import becomes unused, `tsc` refuses the program, and the battery
        # reports a build failure where it should report a survivor. A mutation has to be a
        # *valid* program that behaves wrongly, or nothing is being measured. The filter keeps
        # every reference live and still produces a vocabulary with no IR half.
        lambda t: rename(
            t,
            "  ...new Set([...Object.values(AIOPS2025_CATEGORY), ...FAULT_CATEGORIES]),",
            "  ...new Set([...Object.values(AIOPS2025_CATEGORY), ...FAULT_CATEGORIES.filter(() => false)]),",
        ),
        "categories",
    ),
    (
        "BA. categories: admit a word neither source can produce",
        None,
        # `stray`, which this mutation moves from zero to one -- and it moves *only* that: the
        # shape of the union is otherwise untouched, so a requirement reading `admitted` would
        # see a change it does not mean. This is the wrong-field trap stated arithmetically:
        # `admitted` and `stray` both count words, and only one of them counts the ones that
        # have no source.
        lambda r: categories(r)["stray"] == categories_baseline()["stray"],
        "the count of admitted words neither the table nor the IR can produce, the figure this mutation moves",
        # The converse defect to AZ. A vocabulary wider than its sources is not harmless: it is
        # exactly the hole the scorer check exists to close, since `checkAioPs2025Structure`
        # admits whatever the vocabulary admits. A word no run can emit would be a category the
        # scorer would accept and the emitter could never produce.
        lambda t: rename(
            t,
            "export const AIOPS2025_CATEGORIES: readonly string[] = [",
            "export const AIOPS2025_CATEGORIES: readonly string[] = [\n  'ghost-category',",
        ),
        "categories",
    ),
    (
        "BB. scorer: stop checking fault_category, so a ghost passes again",
        None,
        # `rejected`, the figure the check exists to produce. Read from a run of the scorer over
        # a payload carrying a word outside the vocabulary, so the requirement measures the
        # behaviour rather than the presence of the clause.
        lambda r: scorer_categories(r)["rejected"] == scorer_categories_baseline()["rejected"],
        "the count of out-of-vocabulary categories the structure check refuses, the figure this mutation removes",
        # The check v1.45 added. Before it, `fault_category` was validated by `typeof` alone --
        # which accepts every string ever written -- while `instance_type` beside it was
        # membership-checked. Emptifying the vocabulary argument returns the scorer to that
        # state, because every word is then outside it and a non-empty membership test is what
        # the clause is for.
        #
        # Written so that every name stays referenced, because both cheaper drafts were refused
        # by the compiler and both refusals are the finding:
        #
        #  - Deleting the clause is TS6133: `AIOPS2025_CATEGORIES` would be imported and unused.
        #  - `if (false && !isVocabularyMember(...))` is TS18046: the constant condition makes the
        #    call dead, so the predicate stops narrowing `obj` and later reads fail on `unknown`.
        #    The clause is load bearing for the *type checker*, not only for the behaviour.
        #  - Passing an empty array is TS6133 again, for the same reason as the first.
        #
        # What is left is to keep the argument and invert what the clause does with it: negating
        # the membership test means a word inside the vocabulary is reported as outside it, so
        # the payload's legal category is refused. The check still runs, still uses both names,
        # and no longer means what it says -- which is the defect this entry is about.
        lambda t: rename(
            t,
            "if (!isVocabularyMember(AIOPS2025_CATEGORIES, obj.fault_category)) {",
            "if (isVocabularyMember(AIOPS2025_CATEGORIES, obj.fault_category)) {",
        ),
        "scorer",
    ),
    # v1.46. Five entries for the five fields v1.45's closing note handed forward. The shape
    # is the one v1.45 established and for the same reason: two figures per target, because
    # the two defects are opposite. BC/BE/BG edit an exporter or the shared word set and move a
    # *word count*; BD/BF edit the scorer and move a *ghost verdict*. A requirement reading the
    # count would SURVIVE against a scorer edit, and vice versa -- the wrong-field trap.
    (
        "BC. itbench: drop a scenario class from the image, so the vocabulary loses a word",
        None,
        lambda r: outcome_vocabulary(r)["itbenchWords"]
        == outcome_vocabulary_baseline()["itbenchWords"],
        "the size of the itbench scenario-class vocabulary, the figure this mutation shrinks",
        lambda t: rename(
            t,
            "export const ITBENCH_SCENARIO_CLASSES: readonly string[] = [...new Set(Object.values(CLASS_BY_CATEGORY))];",
            "export const ITBENCH_SCENARIO_CLASSES: readonly string[] = [...new Set(Object.values(CLASS_BY_CATEGORY))].filter((c) => c !== 'Unknown');",
        ),
        "itbench",
    ),
    (
        "BD. itbench: stop checking scenario_class, so a ghost class passes again",
        None,
        # Inverted the way `BB` inverts the AIOPS category clause, and for the reason recorded
        # there: deleting the clause is TS6133 and a constant condition is TS18046, so the only
        # mutation that both compiles and misbehaves is to negate what the clause does.
        lambda r: outcome_vocabulary(r)["itbenchGhostRejected"]
        == outcome_vocabulary_baseline()["itbenchGhostRejected"],
        "the count of out-of-vocabulary scenario classes the structure check refuses, the figure this mutation removes",
        lambda t: rename(
            t,
            "if (!isVocabularyMember(ITBENCH_SCENARIO_CLASSES, obj.scenario_class)) {",
            "if (isVocabularyMember(ITBENCH_SCENARIO_CLASSES, obj.scenario_class)) {",
        ),
        "scorer",
    ),
    (
        "BE. cloud-opsbench: collapse the taxonomy image to one word",
        None,
        lambda r: outcome_vocabulary(r)["cloudOpsWords"]
        == outcome_vocabulary_baseline()["cloudOpsWords"],
        "the size of the cloud-opsbench fault-taxonomy vocabulary, the figure this mutation shrinks",
        # A literal standing in for `Object.values(TAXONOMY_BY_CATEGORY)`: the vocabulary keeps
        # its listed type, keeps one legal word, and stops carrying the table's image. Six words
        # became one, so `cloudOpsWords` moves 6 -> 1 while the ghost verdict does not move at
        # all -- which is what makes BE and BF separate measurements rather than one.
        lambda t: rename(
            t,
            "export const CLOUD_OPSBENCH_TAXONOMIES: readonly string[] = [...new Set(Object.values(TAXONOMY_BY_CATEGORY))];",
            "export const CLOUD_OPSBENCH_TAXONOMIES: readonly string[] = ['Service_Fault'];",
        ),
        "cloudopsbench",
    ),
    (
        "BF. cloud-opsbench: stop checking fault_taxonomy, so a ghost passes again",
        None,
        lambda r: outcome_vocabulary(r)["cloudOpsTaxonomyGhostRejected"]
        == outcome_vocabulary_baseline()["cloudOpsTaxonomyGhostRejected"],
        "the count of out-of-vocabulary taxonomies the structure check refuses, the figure this mutation removes",
        lambda t: rename(
            t,
            "if (!isVocabularyMember(CLOUD_OPSBENCH_TAXONOMIES, result.fault_taxonomy)) {",
            "if (isVocabularyMember(CLOUD_OPSBENCH_TAXONOMIES, result.fault_taxonomy)) {",
        ),
        "scorer",
    ),
    (
        "BG. difficulty: widen the shared word set, so both fields admit a word no level produces",
        None,
        lambda r: outcome_vocabulary(r)["difficulties"]
        == outcome_vocabulary_baseline()["difficulties"],
        "the size of the shared difficulty vocabulary, the figure this mutation widens",
        # The one mutation in the battery that *adds* a word rather than removing one, and the
        # choice is forced rather than stylistic. `Difficulty` is derived from this tuple, so
        # removing `hard` while `case 'L3'|'L4': return 'hard'` still stands is TS2322: the
        # function would return a value outside its declared type, the mutation would not
        # compile, and it would measure nothing. A word no arm returns has no such conflict.
        # The word is one the emitter cannot produce, so the widened vocabulary admits a value
        # no export can carry -- the defect, stated as a value.
        lambda t: rename(
            t,
            "export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;",
            "export const DIFFICULTIES = ['easy', 'medium', 'hard', 'none'] as const;",
        ),
        "difficulty",
    ),
    # --- v1.47: the projection-table key set -------------------------------------------
    #
    # The four exhaustive projection tables were guarded by a `Record<IRenum, string>`
    # annotation and nothing else. The annotation catches a *missing* row at `tsc`; it does
    # not catch an *extra* one, because adding a key requires widening the annotation to
    # make the program compile -- and widening the annotation is the edit that removes the
    # only guard. These six entries are the assertion that the new key-set check is
    # load-bearing, aimed at the two directions separately.
    #
    # Each pair reads a different figure, and the split is forced rather than chosen: a
    # renamed row leaves the row *count* untouched and moves only the key-set equality,
    # while a widened image leaves the key set untouched and moves only the word count. A
    # single figure would let one direction mask the other.
    (
        "BH. itbench: rename a category key, so the table's key set drifts from the IR",
        None,
        lambda r: outcome_vocabulary(r)["itbenchKeySetMatchesIr"]
        == outcome_vocabulary_baseline()["itbenchKeySetMatchesIr"],
        "whether CLASS_BY_CATEGORY's key set still equals FAULT_CATEGORIES",
        # The widened key set, stated as a program that compiles -- and getting there took
        # four rejected attempts, each of which is a result in its own right.
        #
        # The annotation `Record<FaultCategory, string>` refuses the defect outright. Deleting
        # a row is TS2741. Renaming one is TS2353. Adding a ninth key is TS2353. Adding it as
        # a *computed* key is still TS2353. Even widening the annotation to `Record<string,
        # string>` does not work, because that orphans the `FaultCategory` import (TS6196) and
        # re-asserting totality over it fails TS2352 -- the compiler will not let a program
        # both drop a required row and claim to be total.
        #
        # That is the type doing exactly its job, and it is why this entry splits the binding
        # instead of editing the literal: the table keeps its total annotation, and the
        # *exported* name is widened after it through `Object.assign`. The runtime object then
        # carries a key the IR does not admit, in a program TypeScript accepts -- which is the
        # defect, and the reminder that the annotation alone never made it unrepresentable.
        lambda t: rename(
            rename(
                t,
                "export const CLASS_BY_CATEGORY: Record<FaultCategory, string> = {",
                "const CLASS_BY_CATEGORY_TABLE: Record<FaultCategory, string> = {",
            ),
            "  unknown: 'Unknown',\n};",
            "  unknown: 'Unknown',\n};\n\n"
            "export const CLASS_BY_CATEGORY: Record<string, string> = "
            "Object.assign({}, CLASS_BY_CATEGORY_TABLE, { ghostcategory: 'HighCPU' });",
        ),
        "itbench",
    ),
    (
        "BI. itbench: widen the class image with a word no row produces",
        None,
        lambda r: outcome_vocabulary(r)["itbenchWords"]
        == outcome_vocabulary_baseline()["itbenchWords"],
        "the size of the scenario-class vocabulary, the figure this mutation widens",
        # The other direction: the key set is left alone and the *word* set grows, so the
        # vocabulary admits a class no category can produce. This is the form the annotation
        # cannot see at all -- the table still answers for every category -- which is why it
        # needs its own figure rather than sharing BH's.
        lambda t: rename(
            t,
            "export const ITBENCH_SCENARIO_CLASSES: readonly string[] = [...new Set(Object.values(CLASS_BY_CATEGORY))];",
            "export const ITBENCH_SCENARIO_CLASSES: readonly string[] = [...new Set(Object.values(CLASS_BY_CATEGORY)), 'GhostClass'];",
        ),
        "itbench",
    ),
    (
        "BJ. cloud-opsbench: rename a category key, so the table's key set drifts from the IR",
        None,
        lambda r: outcome_vocabulary(r)["cloudOpsKeySetMatchesIr"]
        == outcome_vocabulary_baseline()["cloudOpsKeySetMatchesIr"],
        "whether TAXONOMY_BY_CATEGORY's key set still equals FAULT_CATEGORIES",
        # The same defect on the second table, stated the same way and for the same reason:
        # the annotation refuses every direct form (TS2741 / TS2353 / TS6196 / TS2352), so the
        # binding is split and the exported name widened. It is a separate entry rather than a
        # loop because the two tables are separate files -- an injection lands in one target,
        # and `IN_PACKAGE_TARGETS` records which. A shared entry would make the report unable
        # to say which table was disturbed.
        lambda t: rename(
            rename(
                t,
                "export const TAXONOMY_BY_CATEGORY: Record<FaultCategory, string> = {",
                "const TAXONOMY_BY_CATEGORY_TABLE: Record<FaultCategory, string> = {",
            ),
            "  unknown: 'Runtime_Fault',\n};",
            "  unknown: 'Runtime_Fault',\n};\n\n"
            "export const TAXONOMY_BY_CATEGORY: Record<string, string> = "
            "Object.assign({}, TAXONOMY_BY_CATEGORY_TABLE, { ghostcategory: 'Code_Fault' });",
        ),
        "cloudopsbench",
    ),
    (
        "BK. cloud-opsbench: merge a unique word onto another, so the image shrinks",
        None,
        lambda r: outcome_vocabulary(r)["cloudOpsDistinctWords"]
        == outcome_vocabulary_baseline()["cloudOpsDistinctWords"],
        "the number of distinct taxonomy words, the figure this mutation collapses",
        # The collapse direction, and which row moves is forced by arithmetic rather than
        # picked for convenience. The table has eight rows and six words, so two pairs already
        # share. Remapping a row onto a word that is *already present* therefore changes
        # nothing: `dependency -> 'Code_Fault'` was the first attempt, it left the count at
        # six, and the battery correctly reported SURVIVED -- a mutation that changes nothing
        # is not a measurement. To move the figure, a currently-unique word has to be merged
        # onto another. `config` carries `Startup_Fault` alone, so remapping it to `Code_Fault`
        # takes six distinct words to five. The replacement is a word the table already
        # contains, so the mutation stays a legal program whose only difference is the one
        # being measured.
        lambda t: rename(t, "  config: 'Startup_Fault',", "  config: 'Code_Fault',"),
        "cloudopsbench",
    ),
    (
        "BL. rca100: widen the UModel key set with a kind the IR does not have",
        None,
        lambda r: outcome_vocabulary(r)["umodelDeclaredKeySetMatchesIr"]
        == outcome_vocabulary_baseline()["umodelDeclaredKeySetMatchesIr"],
        "whether UMODEL_TYPE's declared key set still equals ENTITY_KINDS",
        # Two anchored edits in one mutation, and both are required. Adding `ghostkind:` to a
        # `Record<EntityKind, string>` literal is TS2353 -- an object literal cannot name a
        # property the type does not have -- so the annotation has to widen in the same
        # program. The INERT guard checks that *both* anchors matched, so a rename helper
        # that silently skipped the first edit cannot leave this entry firing at nothing.
        lambda t: rename(
            rename(
                t,
                "const UMODEL_TYPE: Record<EntityKind, string> = {",
                "const UMODEL_TYPE_TABLE: Record<EntityKind, string> = {",
            ),
            "  external: 'apm.external',\n};",
            "  external: 'apm.external',\n};\n\n"
            "const UMODEL_TYPE: Record<EntityKind, string> = "
            "Object.assign({}, UMODEL_TYPE_TABLE, { ghostkind: 'apm.service' });",
        ),
        "rca100",
    ),
    (
        "BM. rca100: collapse two UModel words, so the mapping loses a distinction",
        None,
        lambda r: outcome_vocabulary(r)["umodelDistinctWords"]
        == outcome_vocabulary_baseline()["umodelDistinctWords"],
        "the number of distinct UModel types, the figure this mutation collapses",
        # The collapse direction. `mq` is remapped onto the word `external` already carries,
        # so the distinct count falls 7 -> 6 while every kind is still answered for and the
        # key set is untouched. `node -> 'apm.service'` would also move the count but would
        # mean a node is an APM service, which is a *wrong* program rather than a *different*
        # one; the rule from v1.46 is that a mutation has to stay a legal program whose only
        # difference is the one being measured.
        lambda t: rename(t, "  mq: 'apm.external.message',", "  mq: 'apm.external',"),
        "rca100",
    ),
    # --- v1.48: the four fields, and the three checks -----------------------------------
    #
    # The key-set entries above pinned *which kinds* the projection table answers for. They
    # say nothing about whether the words it emits are ever checked, and the audit found they
    # were not: `checkRca100Structure` read `entities[].id` and `.name` and nothing else, every
    # edge field was never touched, and `entity_set` had its write site as its only occurrence
    # in the package. These five entries are the assertion that the three new clauses are
    # load-bearing, split by *direction* because an exporter edit and a scorer edit fail in
    # different places and one figure would let either mask the other.
    (
        "BN. rca100: widen the UModel vocabulary with a word no row produces",
        None,
        lambda r: outcome_vocabulary(r)["rca100UmodelVocabularyWords"]
        == outcome_vocabulary_baseline()["rca100UmodelVocabularyWords"],
        "the size of the UModel word set, the figure this mutation widens",
        # The exporter side, and the *additive* direction. `UMODEL_TYPES` is composed from the
        # table, so this cannot be reached by editing a row -- a row edit moves the vocabulary
        # in place. Appending to the composed list is what makes the vocabulary admit a word no
        # row can produce, which is the defect the scorer's three clauses exist to catch: with
        # the widened list, a ghost word would be a legal member.
        lambda t: rename(
            t,
            "export const UMODEL_TYPES: readonly string[] = [...new Set(Object.values(UMODEL_TYPE))];",
            "export const UMODEL_TYPES: readonly string[] = ["
            "...new Set(Object.values(UMODEL_TYPE)), 'ghost.umodel'];",
        ),
        "rca100",
    ),
    (
        "BO. scorer: stop checking entities[].type, so a ghost UModel type passes again",
        None,
        lambda r: outcome_vocabulary(r)["rca100EntityTypeGhostRejected"]
        == outcome_vocabulary_baseline()["rca100EntityTypeGhostRejected"],
        "whether a ghost UModel type in entities[].type is still refused",
        # One clause at a time, which is the point. The three scorer entries below are three
        # separate claims about three separate sites, and neutering one must leave the other
        # two figures at 1 -- if a single clause covered all three fields, the audit's central
        # finding (four sites, none checked) would not have been reachable by reading the code.
        lambda t: rename(
            t,
            "if (typeof e.type !== 'string' || !isVocabularyMember(RCA100_UMODEL_TYPES, e.type)) {",
            "if (false) {",
        ),
        "scorer",
    ),
    (
        "BP. scorer: stop checking metrics entity_set, so a ghost set passes again",
        None,
        lambda r: outcome_vocabulary(r)["rca100EntitySetGhostRejected"]
        == outcome_vocabulary_baseline()["rca100EntitySetGhostRejected"],
        "whether a ghost UModel type in metrics entity_set is still refused",
        # The field that had no consumer at all -- not in the scorer, not in official.ts, not
        # anywhere in src/ outside its own write. Its own entry rather than sharing BO's,
        # because "the structure check reads the type field" and "the structure check reads
        # the entity_set field" were independently false and are now independently true.
        lambda t: rename(
            t,
            "if (typeof row.entity_set !== 'string' || !isVocabularyMember(RCA100_UMODEL_TYPES, row.entity_set)) {",
            "if (false) {",
        ),
        "scorer",
    ),
    (
        "BQ. scorer: stop checking edge types, so a ghost src_type passes again",
        None,
        lambda r: outcome_vocabulary(r)["rca100EdgeTypeGhostRejected"]
        == outcome_vocabulary_baseline()["rca100EdgeTypeGhostRejected"],
        "whether a ghost UModel type on an edge is still refused",
        # Both endpoints are replaced in one edit because the clause that reads them is one
        # clause. Note the asymmetry with the *test* side: this battery entry is allowed to
        # neuter both at once, because the figure it must move is "any ghost edge type is
        # refused". The test suite is not allowed that shorthand, and v1.48's own neutering run
        # proved it: a single test that moved both endpoints left the src clause and the dst
        # clause each asserting nothing, and only splitting the test into two exposed it.
        lambda t: rename(
            t,
            "if (typeof edge.src_type !== 'string' || !isVocabularyMember(RCA100_UMODEL_TYPES, edge.src_type)) {\n          edgeTypesOk = false;\n        }\n        if (typeof edge.dst_type !== 'string' || !isVocabularyMember(RCA100_UMODEL_TYPES, edge.dst_type)) {\n          edgeTypesOk = false;\n        }",
            "if (false) {\n          edgeTypesOk = false;\n        }",
        ),
        "scorer",
    ),
    (
        "BR. rca100: collapse two UModel words, so the vocabulary loses one",
        None,
        lambda r: outcome_vocabulary(r)["rca100UmodelVocabularyWords"]
        == outcome_vocabulary_baseline()["rca100UmodelVocabularyWords"],
        "the size of the UModel word set, the figure this mutation shrinks",
        # The *subtractive* direction on the same figure BN widens, so the two together show
        # the number is read rather than coincidentally equal. `mq` carries
        # `apm.external.message` alone, so remapping it onto `apm.external` takes seven words to
        # six -- and, unlike BM which moved `umodelDistinctWords` through the exporter's
        # behaviour, this one moves the declared vocabulary the scorer checks against. BM would
        # have reported SURVIVED here: the two figures are different claims about different
        # objects, which is why both exist.
        lambda t: rename(t, "  mq: 'apm.external.message',", "  mq: 'apm.external',"),
        "rca100",
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
    # And a fifth, from the `agreement` block. Five instruments, five baselines, and each
    # injection reads the one belonging to the object it mutates -- except AB, which reads
    # two, because it edits the vocabulary two of them share.
    AGREEMENT_BASELINE.clear()
    AGREEMENT_BASELINE.update(report["agreement"])
    # And a sixth, from the `baseline` block -- the control that refutes the fifth. It reads
    # components whose correctness is given rather than measured, so it is a different object
    # again. AC and AB both empty a term table, one shared and one private; a single dict would
    # make them indistinguishable.
    BASELINE_BASELINE.clear()
    BASELINE_BASELINE.update(report["baseline"])
    # And a seventh, from the `derivation` block -- which is not a reading at all but a *check*:
    # it asserts the dataset obeys its own derivation and then reports whether the reading that
    # asserts it can separate anything. A check reads an object none of the six above read, so it
    # gets its own dict for the same reason they do.
    DERIVATION_BASELINE.clear()
    DERIVATION_BASELINE.update(report["derivation"])
    # And an eighth, from the derivation probe's `categories` block -- the declared domain of
    # the *emitted* `fault_category`, which is the one reading in this battery that is about a
    # vocabulary rather than about a verdict. It is a sub-object of the block above, but it
    # reads a different thing (a word list, not a consumer count), so it gets its own dict:
    # an AE-style vocabulary edit must be observable here and *not* in the derivation figures.
    CATEGORIES_BASELINE.clear()
    CATEGORIES_BASELINE.update(report["derivation"]["categories"])
    SCORER_CATEGORIES_BASELINE.clear()
    SCORER_CATEGORIES_BASELINE.update(report["derivation"]["scorerCategories"])
    OUTCOME_VOCABULARY_BASELINE.clear()
    OUTCOME_VOCABULARY_BASELINE.update(report["derivation"]["outcomeVocabulary"])
    print("type-miss probe battery\n")
    # The baseline control's own line, and it goes first because it is the one figure in this
    # battery that *refutes* another. Printed for the reason the other five are: an injection
    # that moves a figure nobody printed is an injection whose failure has nowhere to show up.
    print(
        f"baseline control: expected {BASELINE_BASELINE['expected']['supporting']}"
        f"/{BASELINE_BASELINE['expected']['graded']} support their category "
        f"({BASELINE_BASELINE['expected']['supportShare']:.4f}), "
        f"predicted {BASELINE_BASELINE['predicted']['supporting']}"
        f"/{BASELINE_BASELINE['predicted']['graded']}, "
        f"load-bearing {BASELINE_BASELINE['separates']} "
        f"(floor {BASELINE_BASELINE['baselineFloor']})\n"
    )
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
    # The agreement reading's line, printed for the same reason as the other four.
    print(
        f"component agreement: {AGREEMENT_BASELINE['graded']} graded -- "
        f"{AGREEMENT_BASELINE['agrees']} agree, "
        f"{AGREEMENT_BASELINE['disagrees']} disagree, "
        f"{AGREEMENT_BASELINE['notAssessable']} not assessable "
        f"({', '.join(AGREEMENT_BASELINE['unassessableIds']) or 'none'})\n"
    )
    # The derivation check's own line, and it goes above the partition because it is a *verdict*
    # about whether any figure below it can separate anything. Printed for the reason the other
    # six are -- an injection that moves a figure nobody printed has nowhere to fail -- and for
    # one more: this block's first field is its subject, so a reader who stops here has read
    # the thing that governs the rest.
    print(
        f"derivation: verdict load-bearing {DERIVATION_BASELINE['discriminatingPower']['separates']} "
        f"(alternative readings differ on {len(DERIVATION_BASELINE['discriminatingPower']['differ'])}"
        f"/{DERIVATION_BASELINE['discriminatingPower']['graded']}, "
        f"floor {DERIVATION_BASELINE['discriminatingPower']['floor']}); "
        f"rules: conformance {DERIVATION_BASELINE['conformance']['conforming']}"
        f"/{DERIVATION_BASELINE['conformance']['graded']}, "
        f"derivability {DERIVATION_BASELINE['derivability']['defined']}"
        f"/{DERIVATION_BASELINE['derivability']['graded']}, "
        f"excess {DERIVATION_BASELINE['excess']['classified']}"
        f"/{DERIVATION_BASELINE['excess']['tested']} "
        f"(substring {DERIVATION_BASELINE['excess']['underSubstringReading']}); "
        f"misses consistent in every run {len(DERIVATION_BASELINE['missStability']['stableIds'])}"
        f"/{DERIVATION_BASELINE['missStability']['graded']}\n"
        f"  controls (the branches the corpus cannot reach, so a mutation to them is observable): "
        f"disagreeing sample conforms {DERIVATION_BASELINE['controls']['disagreement']['conforming']}"
        f"/{DERIVATION_BASELINE['controls']['disagreement']['graded']}"
        f" {DERIVATION_BASELINE['controls']['disagreement']['disagreementIds']}; "
        f"unknown type defined {DERIVATION_BASELINE['controls']['undefined']['defined']}"
        f"/{DERIVATION_BASELINE['controls']['undefined']['graded']}"
        f" {DERIVATION_BASELINE['controls']['undefined']['undefinedTypes']}; "
        f"separating reading separates {DERIVATION_BASELINE['controls']['separating']['separates']} "
        f"({DERIVATION_BASELINE['controls']['separating']['differ']}"
        f"/{DERIVATION_BASELINE['controls']['separating']['graded']})\n"
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

        # Which block the blind check anchors on, declared by the entry with a seventh slot.
        #
        # The check asks "did the mutation move something the probe actually reads?" and its
        # default answer is the classifier's `counts`/`total` partition. That is right for a
        # fixture edit aimed at the `type` field, and wrong for one aimed at `category`: a
        # `category` answer cannot move the classifier's partition, so AD -- which rewrites
        # the seven recorded categories to their expected values -- was reported BLIND while
        # demonstrably moving `baseline.predicted.supporting` from 0 to 1.
        #
        # The check itself is not weakened, and the fix is not to exempt AD: the anchor is
        # made explicit, so an injection that misses its target still fails whichever block it
        # declared. AD declares `baseline`, the block its edit moves, and would still be
        # caught if it landed on a row that block cannot see.
        anchor = entry[6] if len(entry) > 6 else 'classifier'

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
            and blind_anchor(result, anchor) == blind_anchor(None, anchor)
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
