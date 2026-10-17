#!/usr/bin/env python3
"""Attribution shared by the deliberate-injection batteries.

## Why this module exists

Four batteries in `scripts/injection/` apply a mutation and then ask whether the
suite noticed. All four used to decide with a condition of the form
`status != 0 and failed > 0`, which answers *the suite went red* to a question
that is *the behaviour this mutation changed is pinned by a test*. Those are
different measurements, and the difference is not academic:

* a mutation that removes the file's ability to be **parsed** fails every test
  that imports it, so exit status and failure count are indistinguishable from a
  real catch -- measured in finding 157 on the gate-test battery, and found again
  in `verify-gates-are-testable.mjs` in finding 152;
* a mutation that breaks **something else** on the way is credited to the row it
  belongs to.

So each row declares **witnesses**: the substrings of the runner's failing-test
lines that must be present for the red to be attributed. Anything else that goes
red is `UNATTRIBUTED`, and a transform failure is `UNPARSEABLE`. Both are
failures. They are separate verdicts because the repairs are opposite -- one says
the mutation missed, the other says the mutation is wrong.

The logic lives here rather than in each battery because four copies of a
condition is four places for the next one to drift, and the last drift in this
area was the reason for this module.

## What the module does not do

It does not know how to mutate anything, which files belong to which battery, or
how to run a suite. Each battery passes in its own table, its own file map and
its own captured output.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

# The runner's ways of saying a file could not be transformed. A syntax error in
# the mutated module makes vitest print `Error: Transform failed with 1 error:` and
# `Tests  no tests`, and it exits non-zero -- which is exactly what a real catch
# looks like from the outside. Measured, not assumed: see finding 158.
TRANSFORM_FAILURE = re.compile(r"Transform failed|Pre-transform error|Failed to load")

# Verdicts. `NO_RED` is not a pass: it is the absence of any evidence.
NO_RED = "NO_RED"
CAUGHT = "CAUGHT"
UNATTRIBUTED = "UNATTRIBUTED"
UNPARSEABLE = "UNPARSEABLE"


def strip_ansi(text: str) -> str:
    """Remove the runner's colour codes before reading anything out of its output.

    Findings 147, 148 and 152 are three separate readers of this repository's CI
    output that were blinded by the same thing. A reader that looks for a failing
    test's name must not depend on whether the runner decided to colour it.
    """
    return ANSI.sub("", text)


def failing_tests(output: str) -> list[str]:
    """The tests the runner reported as failed.

    Three shapes are accepted because the reporter uses all three and which one
    appears depends on the run: `× name` / `✗ name` on the failed-test lines, and
    `❯ file:line:col` on the per-failure frame header. Matching only the first kind
    found zero failures in a run whose output was ten lines of frames (finding 148).
    """
    plain = strip_ansi(output)
    names: list[str] = []
    for line in plain.splitlines():
        stripped = line.strip()
        match = re.match(r"[×✗]\s+(.*?)(?:\s+\d+ms)?$", stripped)
        if match:
            names.append(match.group(1).strip())
            continue
        frame = re.match(r"❯\s+(\S+?):\d+:\d+", stripped)
        if frame:
            names.append(f"failure in {frame.group(1)}")
    return names


def transform_failure(output: str) -> str:
    """The runner's transform error, if it printed one, else the empty string.

    This is the shape a mutation that cannot be parsed produces, and the reason
    the plain red condition is not enough: the file fails to load, every test that
    imports it fails, and the exit status is the same as a catch.
    """
    plain = strip_ansi(output)
    for line in plain.splitlines():
        if TRANSFORM_FAILURE.search(line):
            return line.strip()
    return ""


def parses_js(script: str, text: str) -> tuple[bool, str]:
    """Whether the mutated JavaScript is still something node will load.

    Used by the batteries whose subject is a `.mjs` file. The batteries whose
    subject is TypeScript cannot use this -- `node --check` does not read types --
    and use `transform_failure` on the runner's own output instead, which is a
    measurement of the same thing by the tool that actually loads the file.
    """
    suffix = pathlib.Path(script).suffix or ".js"
    handle = tempfile.NamedTemporaryFile("w", suffix=suffix, delete=False, dir=tempfile.gettempdir())
    try:
        handle.write(text)
        handle.close()
        probe = subprocess.run(["node", "--check", handle.name], capture_output=True, text=True)
    finally:
        os.unlink(handle.name)
    detail = [line for line in probe.stderr.splitlines() if line.strip()]
    return probe.returncode == 0, (detail[0].strip() if detail else "")


def missing_witnesses(name: str, failing: list[str], expectations: dict[str, tuple[str, ...]]) -> list[str]:
    """The declared witnesses that the runner's failure list does not contain."""
    joined = "\n".join(failing)
    return [witness for witness in expectations.get(name, ()) if witness not in joined]


def attribute(
    name: str,
    expectations: dict[str, tuple[str, ...]],
    status: int,
    failed: int,
    failing: list[str],
    transform_error: str = "",
) -> tuple[str, list[str]]:
    """The verdict a run earns, and what is missing when it earns only half of one.

    The order matters and is the point. A transform failure is decided **first**:
    a file that cannot be loaded makes every test fail, so the witnesses would be
    present among the failures and the row would otherwise be credited with a
    proof about a test that was never exercised.
    """
    if status == 0 or failed == 0:
        return NO_RED, []
    if transform_error:
        return UNPARSEABLE, [transform_error]
    unresolved = missing_witnesses(name, failing, expectations)
    return (UNATTRIBUTED, unresolved) if unresolved else (CAUGHT, [])


def witness_problems(
    expectations: dict[str, tuple[str, ...]],
    files: dict[str, pathlib.Path],
) -> list[str]:
    """Every witness must be a string that appears in the file it points at.

    `files` is a parameter rather than something read from a registry so the
    negative control can drive this comparison with a file of its own; a version
    that looked its own files up made the probe report "an expectation for an
    injection that does not exist" instead of exercising the comparator.
    """
    problems: list[str] = []
    for name, witnesses in expectations.items():
        path = files.get(name)
        if path is None:
            problems.append(f"{name!r} declares an expectation but is not an injection")
            continue
        if not path.exists():
            problems.append(f"{name}: the file {path.name} does not exist")
            continue
        source = path.read_text()
        for witness in witnesses:
            if witness not in source:
                problems.append(f"{name}: {witness!r} is not a test title in {path.name}")
    return problems


def anchor_problems(entries: "list[tuple[str, pathlib.Path, object]]") -> list[str]:
    """Report every injection whose own edit can no longer be applied.

    ## Why this is here, and what it caught

    A battery whose anchor has moved does not fail; it reports `INERT` and keeps
    going, and the number at the end is one lower than the reader expects. Until
    this function existed, the only way to see one was to run the battery -- 111
    seconds for the gate-test battery, on the runner, after a push. That happened:
    a rewrite of `check-cli-reference.mjs` deleted the two lines two injections
    anchored on, the suite was green locally, and CI failed in the batteries job.

    `--verify-expectations` now applies each injection's own edit to the file as it
    is and reports what cannot be done. `entries` is `(name, subject, edit)`, where
    `edit` is either the callable the battery would apply -- `rename` asserts the
    anchor is present, so a stale one raises -- or an `(anchor, replacement)` pair
    for the tables that keep their edits as data. Both leave `INERT` behind without
    this check, and neither is visible by reading the table.
    """
    problems: list[str] = []
    cache: dict[pathlib.Path, str] = {}
    for name, subject, edit in entries:
        text = cache.get(subject)
        if text is None:
            try:
                text = subject.read_text(encoding="utf-8")
            except OSError as exc:
                problems.append(f"{name}: cannot read {subject}: {exc}")
                continue
            cache[subject] = text

        if callable(edit):
            try:
                mutated = edit(text)
            except AssertionError as exc:
                problems.append(
                    f"{name}: this injection cannot be applied any more -- {exc} "
                    f"(subject {subject.name}); retarget it rather than deleting it"
                )
                continue
            if mutated == text:
                problems.append(f"{name}: applying this injection leaves {subject.name} unchanged")
            continue

        anchor, replacement = edit
        if anchor not in text:
            # The anchor itself is in the message, shortened: it is what the reader
            # has to go and find, and it is also what the negative control below
            # looks for -- an anchor that cannot exist has to come back named.
            problems.append(
                f"{name}: the anchor {anchor[:60]!r} is not in {subject.name} any more, so this "
                "injection cannot run; retarget it rather than deleting it"
            )
        elif anchor == replacement:
            problems.append(f"{name}: the replacement equals the anchor, so nothing is mutated")
    return problems


def verify_witness_table(
    label: str,
    expectations: dict[str, tuple[str, ...]],
    declared: list[str],
    files: dict[str, pathlib.Path],
    probe_dir: pathlib.Path,
    probe_against: str,
    survivors: tuple[str, ...] = (),
    probe: bool = False,
    anchors: "list[tuple[str, pathlib.Path, object]]" = None,  # type: ignore[assignment]
) -> int:
    """Reconcile the witness table against the injections and the test files.

    A witness that has been renamed away turns a `CAUGHT` into an `UNATTRIBUTED`
    *silently*: the battery still runs, still reports a number, and the number is
    one lower than the reader expects. The remedy is the one findings 154 to 157
    settled on -- make it a mode, drive the mode from a test, and add `--probe` as
    a negative control on the comparator rather than on the data. Without the
    probe, a comparison that never reports anything is indistinguishable from one
    that finds nothing wrong.
    """
    problems: list[str] = []

    if set(expectations) != set(declared):
        missing = sorted(set(declared) - set(expectations))
        extra = sorted(set(expectations) - set(declared))
        if missing:
            problems.append(f"no expectation declared for: {', '.join(missing)}")
        if extra:
            problems.append(f"expectations for injections that do not exist: {', '.join(extra)}")

    for name in survivors:
        if expectations.get(name):
            problems.append(
                f"{name} is an expected survivor and also declares a witness; "
                "an injection cannot be both"
            )

    problems.extend(witness_problems(expectations, files))

    # A stale anchor is an `INERT`: the battery still runs, still prints a number,
    # and the number is short by one. Applying each edit here is the difference
    # between finding that in a tenth of a second and finding it on the runner.
    if anchors:
        problems.extend(anchor_problems(anchors))
        if probe:
            absent = "an anchor that cannot appear in any file at all"
            probed_anchor = anchor_problems([("probe", probe_dir / probe_against, (absent, ""))])
            if len(probed_anchor) != 1 or absent not in probed_anchor[0]:
                problems.append(
                    "the anchor control failed: an anchor that cannot exist was not reported "
                    f"missing (got {probed_anchor!r}), so that check proves nothing"
                )

    if probe:
        impossible = "a test title that cannot exist anywhere at all"
        probed = witness_problems({"probe": (impossible,)}, {"probe": probe_dir / probe_against})
        if len(probed) != 1 or impossible not in probed[0]:
            problems.append(
                "the negative control failed: a witness that cannot exist was not reported "
                f"missing (got {probed!r}), so this reconciliation proves nothing"
            )

    for line in problems:
        print(f"{label}: {line}")
    verdict = "FAILED" if problems else "OK"
    total = sum(len(w) for w in expectations.values())
    print(
        f"{label}: {verdict} ({total} witness(es) across {len(expectations)} injection(s)"
        + (", with the comparator probed)" if probe else ")")
    )
    return 1 if problems else 0


# ---------------------------------------------------------------------------
# Crash recovery
# ---------------------------------------------------------------------------
#
# ## The defect this closes, measured twice
#
# A battery mutates a tracked file, runs the suite, and restores. If the process
# dies inside that loop -- a kill, a closed laptop, a session that ends while the
# thirteen batteries are running -- the mutation stays in the working tree. That
# happened once with twelve files (finding 173, in the audit) and once with one
# file (`inject:fault-extraction-scoring`, pass 54).
#
# Worse, the next run does not simply tolerate it: every battery captures its
# backup **at start** with `shutil.copy(SRC, PRISTINE)`, so a run that begins
# before somebody reverts copies the *mutated* file into the pristine slot and
# then certifies `source restored: identical to the pristine capture`. The check
# is true and worthless. That is finding 173's `repairFromJournal` defect in a
# second place: a repair verified against its own input is not verified.
#
# ## What this does
#
# `guard()` writes the subjects' bytes to a journal **before** the first
# mutation, and deletes it only once every subject is back. So:
#
# * a **kill** leaves the journal, and the next battery repairs from the recorded
#   bytes before it does anything else;
# * an **exception** (including Ctrl-C) restores on the way out;
# * a **normal** exit does not repair -- the battery's own restore assertion has
#   to keep deciding that, or the assertion would become vacuous -- it only
#   decides whether the record can be dropped. A battery that left a file
#   mutated keeps its journal, and the next run repairs it.
#
# ## Why the pid is not the identity
#
# A pid is reused. The holder is identified by reading `/proc/<pid>/cmdline` and
# asking whether it is a battery at all, so a recycled number cannot block the
# tree forever and a live stranger cannot be mistaken for a run in progress.
# Finding 174 learned this about process **groups**; this is the same lesson one
# identifier down.

#: Where the journals live. Overridable so a test can drive the mechanism against its
#: own directory: a test that writes into the real cache leaves residue that the next
#: test -- or the next real battery -- reads as a crash it has to repair.
CACHE = pathlib.Path(
    os.environ.get("RCA_BENCH_BATTERY_CACHE")
    or (pathlib.Path(__file__).resolve().parents[2] / "node_modules" / ".cache")
)
JOURNAL_PREFIX = "battery-journal-"
JOURNAL_SCHEMA = "rca-bench-battery-journal/1"

#: The subtrees a battery may mutate, recorded whole rather than by name.
#:
#: A hand-written subject list is the defect this file is closing: a battery that
#: forgets one file has a journal that covers everything except the thing that
#: broke. Recording the roots instead makes omission impossible, and 284 files /
#: 4.1 MB costs ~15 ms to read and hash once per run -- against batteries that
#: spend 30 to 350 seconds running suites.
GUARDED_ROOTS = (
    "scripts",
    "packages/core/src",
    "packages/core/test",
    "packages/cli/src",
    "packages/cli/test",
    "golden-master",
)

#: What counts as a file the tree mutates. Telemetry-shaped data is excluded by
#: `.gitignore` rules elsewhere; this is about source, fixtures and records.
GUARDED_SUFFIXES = (".ts", ".mjs", ".js", ".json", ".md", ".sh")

SKIP_DIRS = {"node_modules", "dist", "__pycache__", ".git", "coverage"}


def _digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _is_battery_process(pid: int) -> bool:
    """Whether `pid` is a battery run, which is what makes its journal live."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        pass
    try:
        cmdline = pathlib.Path(f"/proc/{pid}/cmdline").read_bytes()
    except OSError:
        # No `/proc`, so the identity cannot be checked: a live number is taken
        # at its word rather than repaired out from under it.
        return True
    return b"injection" in cmdline


def _restore(record: dict) -> int:
    """Put back every recorded file that differs, verifying each write against the record."""
    done = 0
    for entry in record["entries"]:
        target = pathlib.Path(entry["path"])
        if target.is_file() and _digest(target) == entry["sha256"]:
            continue
        raw = base64.b64decode(entry["bytes"])
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        except OSError as error:
            raise SystemExit(f"_witnesses: cannot restore {target}: {error}") from error
        if _digest(target) != entry["sha256"]:
            raise SystemExit(
                f"_witnesses: wrote {target} back and its digest still does not match the record"
            )
        done += 1
    return done


def repair_abandoned() -> None:
    """Undo what runs that are gone left behind, and refuse a run that is not gone."""
    for journal in sorted(CACHE.glob(f"{JOURNAL_PREFIX}*.json")):
        try:
            record = json.loads(journal.read_text())
        except (OSError, json.JSONDecodeError):
            print(
                f"_witnesses: {journal.name} is unreadable; remove it and check the tree by hand",
                file=sys.stderr,
            )
            continue
        pid = int(record.get("pid", -1))
        if _is_battery_process(pid):
            raise SystemExit(
                f"_witnesses: pid {pid} is running {record.get('label')} on this tree; "
                "two batteries cannot measure one working tree"
            )
        restored = _restore(record)
        journal.unlink(missing_ok=True)
        print(
            f"_witnesses: repaired {record.get('label')} (pid {pid} is gone), "
            f"{restored} file(s) put back",
            file=sys.stderr,
        )


def _guarded_files(roots) -> list[pathlib.Path]:
    """Every file under `roots` worth recording, sorted so two runs agree."""
    out: list[pathlib.Path] = []
    for root in roots:
        root = pathlib.Path(root)
        if root.is_file():
            out.append(root)
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file():
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            if path.suffix in GUARDED_SUFFIXES:
                out.append(path)
    return out


@contextlib.contextmanager
def guard(label: str, roots=None):
    """Run a mutation phase with every file it could touch recorded on disk.

    `roots` defaults to `GUARDED_ROOTS` -- the whole of the source the batteries
    mutate -- so a battery cannot under-specify what it is protecting. A run that
    is killed leaves the journal behind, and the next battery puts the bytes back
    before it measures anything.
    """
    CACHE.mkdir(parents=True, exist_ok=True)
    repair_abandoned()

    subjects = _guarded_files(GUARDED_ROOTS if roots is None else roots)
    if not subjects:
        raise SystemExit(f"_witnesses: {label} was given {roots!r} and found no guarded file")
    record = {
        "schema": JOURNAL_SCHEMA,
        "pid": os.getpid(),
        "label": label,
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "entries": [
            {
                "path": str(subject),
                "sha256": _digest(subject),
                "bytes": base64.b64encode(subject.read_bytes()).decode(),
            }
            for subject in subjects
        ],
    }
    journal = CACHE / f"{JOURNAL_PREFIX}{os.getpid()}.json"
    journal.write_text(json.dumps(record))

    try:
        yield
    except BaseException:
        restored = _restore(record)
        journal.unlink(missing_ok=True)
        print(
            f"_witnesses: {label} was interrupted; {restored} file(s) restored from the journal",
            file=sys.stderr,
        )
        raise

    left = [e["path"] for e in record["entries"] if _digest(pathlib.Path(e["path"])) != e["sha256"]]
    journal.unlink(missing_ok=True)
    if left:
        # The journal is dropped **even here**, and the reason is measured: this pass edited
        # `golden-master/doc-counts.json` while a battery was running, the run exited
        # normally, and the next run's repair put the old bytes back over the edit. A record
        # taken at start cannot tell a battery's mutation from a person's edit, so keeping it
        # past the run that made it is a claim the record cannot support.
        #
        # Nothing is lost by dropping it: a battery whose restore failed exits non-zero from
        # its own `assert_source_restored`, which names the files. The journal exists for the
        # case where no assertion can run -- a kill -- and a normal exit is not that case.
        print(
            f"_witnesses: {label} left {len(left)} file(s) differing from its record; its own "
            "restore check decides whether that is a failure",
            file=sys.stderr,
        )
