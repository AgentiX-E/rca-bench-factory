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

import os
import pathlib
import re
import subprocess
import tempfile

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


def verify_witness_table(
    label: str,
    expectations: dict[str, tuple[str, ...]],
    declared: list[str],
    files: dict[str, pathlib.Path],
    probe_dir: pathlib.Path,
    probe_against: str,
    survivors: tuple[str, ...] = (),
    probe: bool = False,
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
