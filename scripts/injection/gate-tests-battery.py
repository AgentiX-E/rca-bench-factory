#!/usr/bin/env python3
"""
Injection battery for the five gate tests added in this round.

The round's claim is that five gate scripts which were previously "covered by CI
running them against the real tree" are now covered by tests that force them to
*fail*. That claim is worth exactly as much as the tests' sensitivity to the
gates they name, so it is measured rather than asserted.

Every injection here is a mutation of a **gate script**, and the requirement is
that the gate's own test file goes red. The distinction from the batteries beside
this one matters: those mutate a *probe* and read a number it reports, because
the probe is what publishes a figure. These mutate a *gate* and read the exit
status of a test run, because what is in question is whether the test would
notice the guard being removed.

Three outcomes, the same vocabulary the other batteries use:

  - CAUGHT    the mutation made the named test file fail. The test is load-bearing.
  - SURVIVED  the mutation left the file green. The test does not actually test
              that guard, whatever its name says.
  - INERT     the anchor did not match, so nothing was mutated. A mutation that
              never applied is not evidence of anything, and reporting it as
              SURVIVED would be a false reading of the kind findings 68 and 74
              both describe.

A fourth outcome is reported but is not a verdict about a guard:

  - TIMEOUT   the test run exceeded `PER_INJECTION_TIMEOUT_S`, so nothing was
              decided. It is kept separate from SURVIVED because the two call for
              opposite repairs -- one says "write a test", the other says "the
              machine is slower than the one this was written on" -- and a
              battery that prints one word for both is the defect this repository
              has now paid for three times (Pass 5 twice, finding 84 once).

## Why one mutation per guard, and not more

Each entry names the *specific* assertion the mutation is expected to break, and
the run reports which tests failed rather than only whether any did. That is a
deliberate narrowing: the earlier batteries in this repository learned that a
requirement phrased as "some test fails" is satisfied by a test that happens to
be failing for an unrelated reason, and the run below therefore prints the failing
test names so a reader can check the named assertion is among them.

## Why the mutations are written as anchored replacements

`rename()` asserts the anchor was present before replacing. A mutation expressed
as a regex over the whole file would silently become a no-op after an unrelated
refactor, and a no-op is indistinguishable from a survivor unless the battery
refuses to accept it -- which is exactly what INERT is for.

Run: python3 scripts/injection/gate-tests-battery.py
Exit: 0 all caught, 1 otherwise
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Callable

REPO = Path(__file__).resolve().parents[2]

# The vitest binary, resolved from the repository's own install. The battery
# drives vitest rather than a test runner of its own so that the assertions are
# exercised exactly as CI exercises them.
VITEST = ["pnpm", "exec", "vitest", "run", "--root", "packages/core"]

# How long a single injection's test run may take before the battery calls it
# rather than waiting forever.
#
# Without a bound, a run that hangs is indistinguishable from a run that is
# merely slow: both end in a killed step and a bare exit code, and the reader
# cannot tell which injection did it or whether the guard was even reached.
# That is the same failure this battery was written to stop inflicting on the
# gates -- an unreadable verdict that means opposite things depending on a cause
# nobody recorded.
#
# 120s is ~15x the slowest test file here (`check-cli-reference.test.ts` at ~7s,
# which spawns the real CLI as a subprocess five times). The margin is
# deliberate: this bound is not a performance assertion, and a runner slower
# than the author's machine must not be turned into a red battery by it. A
# timeout therefore reports itself as TIMEOUT, separately from SURVIVED, so the
# two can never be read as each other.
PER_INJECTION_TIMEOUT_S = 120

# How long the runner's own `--version` query may take.
#
# It answers in 0.3s. The bound exists because the first version of this probe
# did not have one and did not ask for a version either -- it ran the whole core
# suite (see `assert_vitest_is_callable`), so "the runner is slow to answer"
# and "the runner is misinvoked" were the same silent minute.
PREFLIGHT_TIMEOUT_S = 30


def rename(text: str, old: str, new: str) -> str:
    """One anchored replacement, asserting the anchor was actually present."""
    if old not in text:
        raise AssertionError(f"anchor not found: {old[:70]!r}")
    return text.replace(old, new, 1)


def run_tests(test_file: str) -> tuple[int, str, float]:
    """Run one test file; return its exit status, the lines vitest printed, and how long it took.

    No `check=True`: a non-zero status is the measurement. The output is captured
    so the failing test names can be reported, which is what distinguishes "the
    named assertion broke" from "something in the file broke".

    `pnpm` is resolved through the environment rather than by absolute path,
    because the repository is checked out at a different path on every machine.
    That makes the *absence* of `pnpm` a possible cause of a SURVIVED verdict
    that has nothing to do with the guard under test, so the symptom is detected
    once, up front, by `assert_vitest_is_callable` rather than being inferred
    from a battery full of survivors.

    The duration is returned rather than only used for a bound, because this
    battery spawns one vitest process per injection and that startup is ~95% of
    its total cost. A 107s local run became a 162s CI run on the same commit with
    the same verdicts, and the reason is process startup, not the assertions --
    so the cost is reported per injection instead of being left for a reader to
    infer from a wall clock nobody prints.
    """
    started = time.monotonic()
    proc = subprocess.run(
        [*VITEST, test_file],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=PER_INJECTION_TIMEOUT_S,
    )
    return proc.returncode, proc.stdout + proc.stderr, time.monotonic() - started


def assert_vitest_is_callable() -> None:
    """Fail loudly if the test runner cannot be invoked at all.

    The distinction this preserves: a battery where every injection reports
    SURVIVED is unreadable, because "the guard is not guarded" and "the runner
    never started" produce the same verdict and mean opposite things. The
    repository has been bitten by the second once already -- `inject-stability.mjs`
    shipped with an absolute path that passed locally and threw on the runner
    before its first injection (finding 77). Checking the runner first turns that
    into one line instead of twenty-five misleading rows.

    ## Why the probe command is written out rather than derived from VITEST

    The first version of this function ran `[*VITEST, "--version"]`, which is

        pnpm exec vitest run --root packages/core --version

    and that is not a version query at all. `run --root packages/core` puts
    vitest into run mode and the trailing `--version` is accepted and ignored, so
    the probe **executed the entire core suite** -- 92 files, measured at 54s on
    the runner -- and returned its exit status. Two consequences, both measured:

      - `pnpm exec vitest --version` alone returns in 0.3s; the derived form was
        still running at 10.1s when this was bounded for the first time.
      - The probe had no `timeout=`, so on a runner that is slower still it is
        unbounded dead time *before the first injection*, which is the exact
        shape of the failure it was written to prevent.

    So the probe is spelled out, it is bounded, and a timeout is reported as a
    distinct outcome rather than left to hang. A preflight that silently spends a
    minute is not a preflight; it is a second copy of the problem.
    """
    try:
        probe = subprocess.run(
            ["pnpm", "exec", "vitest", "--version"],
            cwd=REPO,
            capture_output=True,
            text=True,
            timeout=PREFLIGHT_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        print("the test runner did not answer --version, so it cannot be used below")
        print(f"  command: pnpm exec vitest --version")
        print(f"  cwd:     {REPO}")
        print(f"  waited:  {PREFLIGHT_TIMEOUT_S}s")
        raise SystemExit(2)

    if probe.returncode != 0:
        print("the test runner is not callable, so no injection below would mean anything")
        print(f"  command: pnpm exec vitest --version")
        print(f"  cwd:     {REPO}")
        print(f"  exit:    {probe.returncode}")
        print(f"  stderr:  {probe.stderr.strip()[:400]}")
        raise SystemExit(2)


def assert_source_restored() -> int:
    """Every mutated file must be back to its original bytes.

    Restoring in a `finally` is not the same as *verifying* the restore, and the
    difference matters here more than usual: this battery writes to the gate
    scripts that later CI steps then execute. A run that left one mutated would
    make the following steps fail for a reason none of them could name. The other
    batteries in this repository print this check; this one asserts it, because
    its subject is a set of files the rest of the job depends on.
    """
    dirty = []
    for _, script, _, _, _ in INJECTIONS:
        path = REPO / script
        current = path.read_text()
        if current != ORIGINALS[script]:
            dirty.append(script)
    if dirty:
        print()
        print("the battery did not restore its own mutations:")
        for script in sorted(set(dirty)):
            print(f"  {script}")
        return 2
    print()
    print("source restored: every mutated gate is identical to its backup")
    return 0


LOCK_PATH = Path(tempfile.gettempdir()) / "rca-bench-factory-gate-tests-battery.lock"

# Where the run writes its verdicts, so they survive a CI job log that cannot be
# read from a development environment.
#
# This repository's CI log is not reachable here: `GET /actions/jobs/{id}/logs`
# redirects to a storage host the project's proxy blocks, which is finding 55.
# That made the one failing step impossible to diagnose from the outside -- the
# per-injection timings and the failing test names existed only in a log nobody
# could open. `actions/upload-artifact` *is* reachable through the REST API (the
# `official-data` workflow already ships one), so the report is written to a file
# the workflow can upload and the API can list.
#
# The path is derived from `REPO` rather than hard-coded, because the checkout
# differs on every machine and `check-no-absolute-paths.mjs` refuses a literal.
REPORT_PATH = REPO / "gate-tests-battery-report.json"


def write_report(results: list[tuple[str, str, list[str], float, dict[str, object]]], summary: dict[str, object]) -> None:
    """Write the verdicts to `REPORT_PATH` as JSON, on every exit path.

    Deliberately unconditional and exception-tolerant. A report that is only
    written when the battery passes is a report about the case that needs no
    explanation, and a report whose own write can fail the battery would make the
    diagnostic channel a new source of red. So a failure to write is reported to
    the console and otherwise ignored -- the exit code still carries the verdict,
    and the artifact is the thing that is *missing*, not the thing that lies.

    ## Why each row carries `collected` and `exit_status`

    The first CI run that could actually be read back said **0 caught, 24
    survived** -- every injection a survivor -- and the rows could not say which
    of the three causes it was, because the one distinguishing quantity was
    thrown away. `_diagnose` computes the collected test count and prints it, and
    the print goes to the job log, which is the channel that cannot be read. The
    report stored `[]` for every non-CAUGHT verdict, so a battery that was reading
    a *reader*'s file and a battery whose guards genuinely do not hold produced
    byte-identical reports.

    That is finding 85's "computed and never printed" one layer out: the value was
    computed, was printed, and the printing went somewhere nobody could read it.
    So the count is now a field. `collected == 0` means the runner started and
    found nothing, which says nothing about any guard; `collected > 0` with
    `exit_status == 0` means the tests ran and passed, which is a real survivor
    and a real finding. Those are opposite claims and the report now separates
    them without needing the log.
    """
    payload = {
        "injections": [
            {
                "name": name,
                "verdict": verdict,
                "tests": tests,
                "test_file": next(
                    (tf for n, _, tf, _, _ in INJECTIONS if n == name), None
                ),
                "elapsed_s": round(elapsed, 1),
                **detail,
            }
            for name, verdict, tests, elapsed, detail in results
        ],
        **summary,
    }
    try:
        REPORT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    except OSError as exc:
        print(f"could not write the report to {REPORT_PATH}: {exc}")


def acquire_exclusive_lock() -> int:
    """Refuse to run if another instance of this battery is already running.

    ## Why this exists

    This battery rewrites the shipped gate scripts, runs a test file against the
    mutated source, and restores the bytes it read at the top of the iteration.
    That is safe against everything except **a second copy of itself**. Two
    instances read the same `original`, and each writes it back over the other's
    mutation, so one run's restore lands on a baseline the other is still using.

    The symptom is not a crash. It is a *wrong verdict*: the run that had a gate
    mutated underneath it sees the other run's restoration and reports the guard
    as SURVIVED, and its own restore check then fails on files it did not leave
    dirty. Measured by running two copies three seconds apart:

        22 caught, 1 survived, 2 inert, 0 timed out, 1 redundant (expected)
        the battery did not restore its own mutations: ...
        RC=2

    The 1 survivor is a guard that is in fact caught. `SURVIVED` is the one
    verdict this repository must never manufacture, because it is read as "write
    a test" and sends the next reader to fix something that was never broken.

    ## Why a lock and not a per-run copy

    Copying the tree would remove the shared resource, and it would destroy the
    subject: this battery's claim is about the **shipped** gates, and a verdict
    about a copy is a verdict about the copy. The resource that genuinely must
    not be shared is the working tree while it is being rewritten, and the honest
    repair is to refuse the second run rather than let it corrupt the first.

    ## Why the OS temp directory, and why O_EXCL

    Placing the lock beside the gates would put a non-source file inside the tree
    that `check-no-absolute-paths.mjs` and the example-pack manifests both walk.
    `tempfile.gettempdir()` is portable, is where a per-machine mutual exclusion
    belongs, and is derived rather than hard-coded. `O_EXCL` makes the check and
    the creation a single atomic operation, which is the whole property: an
    `exists()` followed by a `write()` has a window between them that is exactly
    the window this function exists to close.

    A *stale* lock is possible -- a run killed with SIGKILL leaves the file
    behind, and the next run refuses forever. That is accepted deliberately and
    the refusal names the path, so the repair is one `rm`. The alternative, a
    staleness heuristic based on mtime or a PID that may have been recycled, can
    silently decide a *running* battery is dead and reintroduce the corruption;
    a loud refusal that costs one command is the safer failure for a check whose
    wrong answer is a fabricated SURVIVED.
    """
    try:
        fd = os.open(str(LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        print("another instance of this battery already holds")
        print(f"  lock: {LOCK_PATH}")
        print("  -- refusing rather than sharing the working tree. Two runs would")
        print("     each restore the other's mutation, which is how a caught guard")
        print("     gets reported as SURVIVED. If no run is active, remove the lock")
        print("     file and re-run.")
        raise SystemExit(3)
    os.write(fd, str(os.getpid()).encode())
    return fd


def strip_ansi(text: str) -> str:
    """Remove SGR colour codes so the parsers below see the same text locally and in CI.

    CI is not a TTY and vitest still emits `\x1b[31m` escapes -- the captured CI
    output has them, and the local run does not. Any pattern anchored on the first
    visible character therefore works on one machine and not the other, which is
    how the regexes in this file produced opposite verdicts in the two places.

    A no-op on already-plain text, so stripping unconditionally is safe.
    """
    return re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)


def failing_tests(output: str) -> list[str]:
    """The names of the tests vitest marked as failed, stripped of decoration.

    Three shapes are matched, because vitest prints different ones and this
    repository has now been bitten by matching only the first:

      `× name` / `✗ name`   the default reporter's failed-test lines
      `❯ file:line:col`     the per-failure *frame* header

    The frame marker is what the captured CI output actually contains. Matching
    only `×`/`✗` found zero failures in a run whose output was ten lines of
    failure frames, and the CAUGHT condition is `status != 0 and failed > 0` --
    so that miss is what turned twenty-four caught injections into twenty-four
    survivors on CI while the same code reported 24 caught here.

    ANSI escapes are stripped first for the same reason: the escapes sit between
    the marker and the name, so a pattern anchored on the line start matches in a
    terminal and fails in a pipe.
    """
    plain = strip_ansi(output)
    names = []
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


def failed_count(output: str) -> int:
    """How many tests vitest reported as failed.

    Falls back to counting the runner's own failure frames when the summary line
    is not in the captured text. The summary sits below the frames, so a caller
    that keeps only a tail of the output -- as this battery's report does -- can
    hold the evidence of failure and none of the summary. Returning 0 there made
    the CAUGHT condition (`status != 0 and failed > 0`) false for a run that had
    failed, which is the defect that reported twenty-four caught injections as
    survivors on CI.
    """
    plain = strip_ansi(output)
    match = re.search(r"Tests\s+(\d+) failed", plain)
    if match:
        return int(match.group(1))
    return sum(1 for name in failing_tests(plain) if name.startswith("failure in "))


def collected_count(output: str) -> int:
    """How many tests the runner ran, from its summary or from its own failure list.
    Never a lower bound presented as a total: see `collected_basis`.

    This is the quantity that separates the three causes of a non-CAUGHT verdict,
    and getting it wrong is worse than not having it.

    ## Why the summary line alone is not enough

    The first CI run that carried this field reported `collected=0` on all
    twenty-five rows and `no_tests_collected` on all of them -- "the runner found
    nothing, so this row says nothing about the guard". **That reading was wrong,
    and the output_tail field proved it**: the very same rows carried

        ❯ test/check-readme-sample.test.ts:353:27
          353|     expect(result.status).toBe(0);
             |                           ^

    which is a real assertion failure in a test that really ran. So the tests were
    collected, failed, and were reported as never having run.

    The cause is ordering: vitest prints the per-failure frames, and the
    `Tests  N failed` summary comes further down. A tail of twelve lines stops in
    the middle of the last failure frame and never reaches it. Parsing only the
    summary therefore returns 0 for exactly the runs that failed hardest.

    ## What is counted instead

    The summary line when it is present, and otherwise the runner's own list of
    failed tests, which `failing_tests` already extracts for the CAUGHT rows. A
    non-zero count is then evidence that tests ran, which is the only claim this
    function is used to make -- it is never used as an exact total, only compared
    against zero.

    The `s` in `Tests` is matched case-sensitively on purpose: the summary and the
    per-frame output are distinguishable, and the passed count is anchored on
    `Tests` rather than on the pipe because a fully-green run prints
    `Tests  9 passed (9)` with no pipe at all. That shape was mis-parsed once
    already, returning 0 for a run that collected nine.

    ## What the number is *not*

    It counts the tests the **runner invocation** reported, not the tests in
    `test_file`. Those differ whenever an injection breaks a gate that more than
    one test file exercises, and the CI report shows it in both directions:

    | injection | `test_file` holds | reported |
    | --- | --- | --- |
    | `README 1` | 9 | 12 |
    | `RCAEVAL 4` | 21 | 30 |

    `RCAEVAL 4` mutates `gen-rcaeval-cases.mjs`, which several suites read, so its
    invocation failed fifteen tests across them and collected thirty. The field is
    therefore written as `tests_run`, not `collected`: the first name read as
    "tests in this file", and a reader checking it against the file finds a
    mismatch that looks like a defect in the count. The count is right -- the
    label was wrong.
    """
    failed = re.search(r"Tests\s+(\d+) failed", output)
    passed = re.search(r"Tests\s+(?:\d+ failed \|\s*)?(\d+) passed", output)
    total = 0
    if failed:
        total += int(failed.group(1))
    if passed:
        total += int(passed.group(1))
    if total:
        return total
    # No summary reached us. The failure list is equal evidence that tests ran:
    # a test cannot fail in a run that collected nothing.
    return len(failing_tests(output))


def collected_basis(output: str) -> str:
    """Which evidence `collected_count` got its number from.

    `collected_count` returns one of two very different quantities, and until now
    the report printed both as a bare integer:

      "summary"   the runner's own tally, e.g. `Tests 6 failed | 3 passed (9)`.
                  An exact total.
      "failures"  the number of failure frames in the text we happen to hold.
                  **A lower bound**, because the text is a tail.

    The first CI report that carried `collected` printed `collected=1` on
    twenty-four rows whose tails each held one frame. A reader takes an integer
    captioned `collected` for a count of tests, and concludes "one test ran" --
    where the runner had actually reported six. The number was not wrong; the
    report presented a lower bound as a total, which is the same class of defect
    as a verdict without its evidence.

    So the basis travels with the number, and the report shows both.
    """
    return "summary" if re.search(r"Tests\s+\d+ (?:failed|passed)", strip_ansi(output)) else "failures"


def diagnosis(status: int, output: str, collected: int) -> str:
    """A short machine-readable cause for a non-CAUGHT verdict.

    The console path has `_diagnose`, which is written for a human reading a log.
    This is the same distinction in a form the report can carry, because the log
    is the channel this project cannot read. Four values, because they call for
    four different repairs:

      no_tests_collected  the runner found nothing -- says nothing about the guard
      tests_passed        the tests ran and stayed green -- a real survivor
      tests_failed        the runner reported a failing test. The guard *did*
                           react; the verdict is decided by the CAUGHT condition
                           above, not here.
      runner_error        the runner exited non-zero without reporting a failure

    ## The ordering is the point

    This used to be `collected == 0 -> no_tests_collected; status == 0 ->
    tests_passed; else runner_error`, and on the captured CI text it labelled
    twenty-four failing runs `runner_error`. Every one of them had
    `expect(result.status).toBe(0)` with the `^` caret under it -- an assertion
    failure, the most decisive thing the runner can say. It was read as "the
    runner died before reporting anything", which points the reader at the
    wrong repair entirely.

    The cause was that `collected` was derived from the failure list, and a tail
    of twelve lines holds one frame no matter how many tests failed, so
    `collected` was 1... which is not 0, so the first branch was skipped and
    `status == 1` made it `runner_error`. Two defects in series: a lower bound
    read as a total, and a decision made on it before looking at the evidence
    that was already in hand.

    So the failure evidence is now consulted first, and it is consulted directly
    rather than through a count.
    """
    if status != 0 and failed_count(output) > 0:
        return "tests_failed"
    if collected == 0:
        return "no_tests_collected"
    if status == 0:
        return "tests_passed"
    return "runner_error"


def output_tail(output: str, lines: int = 40) -> list[str]:
    """The runner's last lines, for the report rather than for the log.

    The first readable CI report said every injection survived and could not say
    why, because the evidence that would have answered it -- what the runner
    actually printed -- was written to the console. A verdict without its
    evidence is the same problem as a verdict without its channel: it can be read
    and still not be understood.

    ## Why forty lines and not twelve

    Twelve was chosen to keep the field small and was measured against the wrong
    thing. A vitest failure frame is nine lines -- the `❯ file:line:col` header,
    the source excerpt, the `^` caret, the blank separator -- and vitest prints
    every frame of a file before the `Tests  N failed` summary. A twelve-line
    tail therefore lands in the middle of the *last* frame and stops there:

        ❯ test/check-readme-sample.test.ts:353:27
          353|     expect(result.status).toBe(0)
             |                           ^
        ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯

    That is the real tail of a row that failed six tests. The frame is proof a
    test ran; the summary is the count; twelve lines delivered the first and never
    the second, so every parser that prefers the summary fell back to a lower
    bound. Forty lines reaches past the frames into the summary for a file with
    up to four failing tests, and still excludes the bulk of the transcript,
    which is transform timings.
    """
    return [line for line in output.splitlines()[-lines:] if line.strip()]


def _diagnose(status: int, output: str) -> str:
    """Say *why* a verdict was SURVIVED, because there are three causes.

    A single line "the test file stayed green" hides the distinction that this
    repository has already paid for twice: the guard genuinely is not guarded,
    the runner died before running anything, and the runner ran but collected no
    tests. Those call for three different repairs, and grouping them was exactly
    the defect Pass 5 found in two other batteries -- where `-1 > 0` is false, so
    a crashed runner counted as "a test failed" and a collection error reported
    `failed: 0, passed: 0`, so "nothing was detected" read as "nothing to detect".

    The distinguishing quantity is the total the runner reports, not the failure
    count: only a run that collected tests can make a claim about a guard.
    """
    collected = re.search(r"Tests\s+(\d+) (?:failed|passed)", output)
    total = 0
    if collected:
        total = int(collected.group(1))
        other = re.search(r"\|\s*(\d+) passed", output)
        if other:
            total += int(other.group(1))

    if total == 0:
        return (
            "         -- the runner collected no tests, so this says nothing about the guard.\n"
            "            The last lines it printed were:\n"
            + "".join(f"              {line}\n" for line in output.splitlines()[-6:])
        )
    if status == 0:
        return f"         -- the {total} collected test(s) all passed with the guard removed."
    return (
        f"         -- the runner exited {status} after collecting {total} test(s), but reported\n"
        "            no failing test. That is a crash or a timeout, not a guarded property."
    )


# Each entry: name, gate script, test file, mutation, description.
#
# `mutation(source)` rewrites the gate's source. The requirement is implicit and
# uniform -- the named test file must fail -- because that is the whole claim
# being tested. What varies is *which* guard is removed.
INJECTIONS: list[tuple[str, str, str, Callable[[str], str], str]] = [
    # ------------------------------------------------------------------ README
    (
        "README 1. the sample marker stops matching, so nothing is collected",
        "scripts/check-readme-sample.mjs",
        "check-readme-sample.test.ts",
        lambda t: rename(
            t,
            "    if (body.includes(\"from '@rca-bench-factory/core'\")) blocks.push(body);",
            "    if (body.includes(\"from 'no-such-package'\")) blocks.push(body);",
        ),
        "the test that a good sample is executed and the test that the marker is what selects it",
    ),
    (
        "README 2. the rewrite pattern stops matching the collection marker",
        "scripts/check-readme-sample.mjs",
        "check-readme-sample.test.ts",
        lambda t: rename(
            t,
            "    /from '@rca-bench-factory\\/core'/,",
            "    /from \"@rca-bench-factory\\/core\"/,",
        ),
        "the dead-branch test's equivalence half: the two literals stop being the same string",
    ),
    (
        "README 3. a failed sample no longer fails the run",
        "scripts/check-readme-sample.mjs",
        "check-readme-sample.test.ts",
        lambda t: rename(t, "if (failures > 0) {", "if (failures > 999) {"),
        "every negative that asserts `status === 1`: a drift would print FAILED and exit 0",
    ),
    (
        "README 4. the block is not executed at all, only collected",
        "scripts/check-readme-sample.mjs",
        "check-readme-sample.test.ts",
        lambda t: rename(t, "    await import(form);", "    void form;"),
        "the signature-drift test -- an unexecuted sample cannot fail on a wrong call",
    ),
    # ------------------------------------------------------------------ bundle
    (
        "BUNDLE 1. the archive comparison always agrees",
        "scripts/build-example-bundle.mjs",
        "build-example-bundle.test.ts",
        lambda t: rename(t, "    if (!current.equals(expected)) {", "    if (false) {"),
        "the two staleness tests, which corrupt one artefact each",
    ),
    (
        "BUNDLE 2. only the archive is compared, not the metadata",
        "scripts/build-example-bundle.mjs",
        "build-example-bundle.test.ts",
        lambda t: rename(
            t,
            "    [META_PATH, Buffer.from(renderedMeta, 'utf8')],\n",
            "",
        ),
        "the stale-metadata test, which edits only the JSON",
    ),
    (
        "BUNDLE 3. an empty example directory is accepted",
        "scripts/build-example-bundle.mjs",
        "build-example-bundle.test.ts",
        lambda t: rename(
            t,
            "  if (Object.keys(files).length === 0) {\n"
            "    throw new Error(`no example files found under ${EXAMPLE_DIR}`);\n"
            "  }",
            "",
        ),
        "the empty-directory test",
    ),
    (
        "BUNDLE 4. the manifest's file count stops agreeing with its own listing",
        "scripts/build-example-bundle.mjs",
        "build-example-bundle.test.ts",
        lambda t: rename(t, "      fileCount: entries.length,", "      fileCount: entries.length - 1,"),
        "the count test, which is the one assertion that ties the two numbers together",
    ),
    (
        "BUNDLE 5. the tar stops being reproducible",
        "scripts/build-example-bundle.mjs",
        "build-example-bundle.test.ts",
        lambda t: rename(
            t,
            "const { archive, meta } = buildBundle();",
            "const { archive, meta } = buildBundle();\nmeta.sha256 = String(Math.random());",
        ),
        "the two-build reproducibility test",
    ),
    # --------------------------------------------------------------- examples
    (
        "EXAMPLES 1. --check stops comparing the data file",
        "scripts/gen-examples.mjs",
        "gen-examples.test.ts",
        lambda t: rename(t, "  if (current !== rendered) {", "  if (false) {"),
        "the stale-data test, and the doc-block-gap test that relies on --check being green",
    ),
    (
        "EXAMPLES 2. a missing data file stops being reported",
        "scripts/gen-examples.mjs",
        "gen-examples.test.ts",
        lambda t: rename(
            t,
            "    console.error(`${DATA_PATH} is missing - run \\`pnpm examples:gen\\`.`);\n"
            "    process.exit(1);",
            "    console.error(`${DATA_PATH} is missing - run \\`pnpm examples:gen\\`.`);\n"
            "    process.exit(0);",
        ),
        "the missing-file test",
    ),
    (
        "EXAMPLES 3. an example block is left stale instead of rewritten",
        "scripts/gen-examples.mjs",
        "gen-examples.test.ts",
        lambda t: rename(t, "    if (updated !== markdown) {\n      writeFileSync(file, updated);", "    if (false) {\n      writeFileSync(file, updated);"),
        "the rewrite test, the idempotence test and the truncation test",
    ),
    (
        "EXAMPLES 4. a marker naming an unknown target stops throwing",
        "scripts/gen-examples.mjs",
        "gen-examples.test.ts",
        lambda t: rename(
            t,
            "      if (target === undefined) throw new Error(`unknown example target '${targetKey}' in ${spec.id}.md`);",
            "      if (target === undefined) return _match;",
        ),
        "the unknown-target test",
    ),
    (
        "EXAMPLES 5. a marker naming an unexported path stops throwing",
        "scripts/gen-examples.mjs",
        "gen-examples.test.ts",
        lambda t: rename(
            t,
            "      if (path === undefined) throw new Error(`example path '${relativePath}' not exported by ${targetKey}`);",
            "      if (path === undefined) return _match;",
        ),
        "the unexported-path test",
    ),
    (
        "EXAMPLES 6. a field marker that matches nothing stops throwing",
        "scripts/gen-examples.mjs",
        "gen-examples.test.ts",
        lambda t: rename(
            t,
            "        throw new Error(`fields marker '${ref}' does not match any documented file in ${spec.id}.md`);",
            "        return match;",
        ),
        "the field-marker test",
    ),
    (
        "EXAMPLES 7. the truncate modifier is ignored",
        "scripts/gen-examples.mjs",
        "gen-examples.test.ts",
        lambda t: rename(t, "      if (truncate !== undefined) {", "      if (false) {"),
        "the truncation test, which needs the `… N more lines` marker",
    ),
    # ------------------------------------------------------------ cli-reference
    (
        "CLIREF 1. the flag lookup loses its word boundary",
        "scripts/check-cli-reference.mjs",
        "check-cli-reference.test.ts",
        lambda t: rename(
            t,
            "  const pattern = new RegExp(`${flag.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?![\\\\w-])`);\n"
            "  return pattern.test(markdown);",
            "  return markdown.includes(flag);",
        ),
        "the boundary test -- and only that test, which is what makes it the guard for the boundary",
    ),
    (
        "CLIREF 2. an implemented-but-undocumented command stops being reported",
        "scripts/check-cli-reference.mjs",
        "check-cli-reference.test.ts",
        lambda t: rename(
            t,
            "  if (!documented.includes(topic)) {\n"
            "    failures.push(`command '${topic}' is implemented but not listed in docs/cli-reference.md`);\n"
            "  }",
            "",
        ),
        "the omission test",
    ),
    (
        "CLIREF 3. a documented-but-unimplemented command stops being reported",
        "scripts/check-cli-reference.mjs",
        "check-cli-reference.test.ts",
        lambda t: rename(
            t,
            "  if (!topics.includes(heading)) {\n"
            "    failures.push(`docs/cli-reference.md documents '${heading}', which is not an implemented command`);\n"
            "  }",
            "",
        ),
        "the phantom-heading test",
    ),
    (
        "CLIREF 4. a flag the reference never mentions stops being reported",
        "scripts/check-cli-reference.mjs",
        "check-cli-reference.test.ts",
        lambda t: rename(
            t,
            "    if (!mentionsFlag(markdown, flag)) {\n"
            "      failures.push(`'${flag}' is accepted by '${topic}' but absent from docs/cli-reference.md`);\n"
            "    }",
            "",
        ),
        "the empty-flag-table test and the boundary test",
    ),
    (
        "CLIREF 5. only the first disagreement is reported",
        "scripts/check-cli-reference.mjs",
        "check-cli-reference.test.ts",
        lambda t: rename(t, "  for (const failure of failures) console.error(`  - ${failure}`);", "  console.error(`  - ${failures[0]}`);"),
        "the report-every-disagreement test, which counts the bulleted lines",
    ),
    # -------------------------------------------------------------- rcaeval
    (
        "RCAEVAL 1. --check stops comparing the descriptor file",
        "scripts/gen-rcaeval-cases.mjs",
        "gen-rcaeval-cases.test.ts",
        lambda t: rename(t, "  if (current !== serialised) {", "  if (false) {"),
        "the drift test, and the missing-file test that relies on the same block",
    ),
    (
        "RCAEVAL 2. a non-directory entry at the top level is treated as a suite",
        "scripts/gen-rcaeval-cases.mjs",
        "gen-rcaeval-cases.test.ts",
        lambda t: rename(t, "    if (!suiteDir.isDirectory()) continue;", "    if (false) continue;"),
        # **A SURVIVOR, kept in the battery as the record of why.**
        #
        # The guard is redundant with the `try { readdirSync(suitePath) } catch {
        # continue }` immediately below it: reading a *file* as a directory throws
        # `ENOTDIR`, and the catch skips exactly the entries `isDirectory()`
        # would have skipped. So the guard cannot change any outcome, and no test
        # can be written that fails only when it is removed.
        #
        # The two earlier attempts to write such a test both failed for reasons
        # worth recording, because each was a near miss:
        #
        #  - `if (!suiteDir.isDirectory())` with the wrong indentation, which made
        #    the anchor miss and the injection INERT;
        #  - `if (!runDir.isDirectory())` as the target, on the theory that the
        #    guard bounds the walk's depth. It does not: the walk is a fixed
        #    three-level nest, so the guard skips *file* entries at the run level
        #    and has nothing to do with depth. The depth test is guarded by the
        #    nesting itself, which `RCAEVAL 4` above targets instead.
        #
        # This is the same shape as the `Number.isSafeInteger` row in
        # `progress.md`'s pass-5 matrix: a check the battery proved redundant,
        # kept in source on purpose. Here it is kept in the *battery* on purpose,
        # because reporting it as CAUGHT would require a dishonest mutation and
        # deleting it would lose the finding.
        "the stray-file test -- UNGUARDABLE, and reported as SURVIVED rather than faked",
    ),
    (
        "RCAEVAL 3. the per-suite tally drops the suites with no cases",
        "scripts/gen-rcaeval-cases.mjs",
        "gen-rcaeval-cases.test.ts",
        lambda t: rename(
            t,
            "  return Object.entries(perSuite)\n"
            "    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))\n"
            "    .map(([suite, count]) => `${suite}=${count}`)",
            "  return Object.entries(perSuite)\n"
            "    .filter(([, count]) => count > 0)\n"
            "    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))\n"
            "    .map(([suite, count]) => `${suite}=${count}`)",
        ),
        "the tally test, which asserts `RE1=0` is printed beside `RE2=1`",
    ),
    (
        "RCAEVAL 4. the run level is read from one directory deeper",
        "scripts/gen-rcaeval-cases.mjs",
        "gen-rcaeval-cases.test.ts",
        # The walk is a *fixed* three-level nest, so the depth test asserts the
        # nesting rather than a bound. This injection reads the run level from
        # `{service}_{fault}/{run}/{nested}` instead of `{service}_{fault}/{run}`,
        # which is the shape an unbounded `find` would produce -- and which finds
        # the extra `inject_time.txt` the depth test plants one level too deep.
        lambda t: rename(
            t,
            "        const casePath = join(faultPath, runDir.name);",
            "        const deeper = readdirSync(join(faultPath, runDir.name), { withFileTypes: true })[0];\n"
            "        const casePath = join(faultPath, runDir.name, deeper.name);",
        ),
        "the depth test, which plants a second `inject_time.txt` below a real case",
    ),
]


# ---------------------------------------------------------------------------
# Mutations that are expected NOT to be caught, with the reason.
#
# A battery that silently tolerated survivors would be reporting a floor it does
# not have, so each entry here is a *claim* rather than an exemption: the run
# still prints the row, still counts it, and still fails if the verdict is
# SURVIVED rather than REDUNDANT. The distinction is that a REDUNDANT row has a
# named, checkable reason why no test can exist for it, and the reason is in this
# file for a reader to disagree with.
#
# There is exactly one entry. Pass 5 of this repository's audit found the same
# shape -- a `Number.isSafeInteger` check whose removal changed no verdict on any
# argv -- and kept the check on purpose. This is the same outcome, recorded the
# same way, with the difference that the check here is a guard on a walk rather
# than on a value.
# ---------------------------------------------------------------------------
EXPECTED_SURVIVORS: dict[str, str] = {
    "RCAEVAL 2. a non-directory entry at the top level is treated as a suite": (
        "redundant with the `try { readdirSync(suitePath) } catch { continue }` "
        "below it: reading a file as a directory throws ENOTDIR and the catch "
        "skips the same entries, so no input can separate the two"
    ),
}

# The bytes each gate is restored to. Captured once, before any mutation, so the
# restore check compares against a copy taken from a tree nothing has touched --
# reading the file again at the end would compare a mutation against itself.
ORIGINALS: dict[str, str] = {
    script: (REPO / script).read_text()
    for _, script, _, _, _ in INJECTIONS
}


def main() -> int:
    results: list[tuple[str, str, list[str], float]] = []
    caught = survived = inert = timed_out = 0
    slowest: tuple[float, str] = (0.0, "")
    total_seconds = 0.0

    assert_vitest_is_callable()
    lock_fd = acquire_exclusive_lock()

    try:
        for name, script, test_file, mutation, description in INJECTIONS:
            path = REPO / script
            original = path.read_text()
            try:
                mutated = mutation(original)
            except AssertionError as exc:
                print(f"INERT    {name}")
                print(f"         -- the anchor no longer matches: {exc}")
                inert += 1
                results.append((name, "INERT", [], 0.0, {"diagnosis": "anchor_missing"}))
                continue

            if mutated == original:
                print(f"INERT    {name}")
                print("         -- the mutation changed nothing")
                inert += 1
                results.append((name, "INERT", [], 0.0, {"diagnosis": "mutation_was_a_noop"}))
                continue

            try:
                path.write_text(mutated)
                try:
                    status, output, elapsed = run_tests(test_file)
                except subprocess.TimeoutExpired:
                    print(f"TIMEOUT  {name}")
                    print(f"         expecting: {description}")
                    print(f"         -- the test run exceeded {PER_INJECTION_TIMEOUT_S}s. This is not a")
                    print("            verdict about the guard: nothing was decided about whether")
                    print("            the test fails without it. Reported separately from")
                    print("            SURVIVED because the two call for opposite repairs.")
                    timed_out += 1
                    results.append((name, "TIMEOUT", [], 0.0, {"diagnosis": "timeout"}))
                    continue
            finally:
                path.write_text(original)

            total_seconds += elapsed
            if elapsed > slowest[0]:
                slowest = (elapsed, name)

            # Computed once, used by every verdict below. It is the quantity that
            # separates "the guard is not guarded" from "the runner decided
            # nothing", and it goes into the report as well as the console --
            # printing it to the log was not enough, because the log is the
            # channel this project cannot read.
            collected = collected_count(output)
            basis = collected_basis(output)
            why = diagnosis(status, output, collected)

            if status != 0 and failed_count(output) > 0:
                names = failing_tests(output)
                print(f"CAUGHT   {name}")
                print(f"         expecting: {description}")
                print(f"         failing:   {len(names)} test(s), first: {names[0] if names else '(unnamed)'}  [{elapsed:.1f}s]")
                caught += 1
                results.append((name, "CAUGHT", names, elapsed, {"tests_run": collected, "tests_run_basis": basis, "exit_status": status, "diagnosis": why, "output_tail": output_tail(output)}))
            elif name in EXPECTED_SURVIVORS:
                print(f"REDUNDANT {name}")
                print(f"         expecting: {description}")
                print(f"         -- {EXPECTED_SURVIVORS[name]}  [{elapsed:.1f}s]")
                results.append((name, "REDUNDANT", [], elapsed, {"tests_run": collected, "tests_run_basis": basis, "exit_status": status, "diagnosis": why, "output_tail": output_tail(output)}))
            else:
                print(f"SURVIVED {name}")
                print(f"         expecting: {description}")
                print("         -- the test file stayed green, so it does not guard this")
                print(_diagnose(status, output))
                print(f"         [{elapsed:.1f}s]")
                survived += 1
                results.append((name, "SURVIVED", [], elapsed, {"tests_run": collected, "tests_run_basis": basis, "exit_status": status, "diagnosis": why, "output_tail": output_tail(output)}))

    finally:
        # Releasing must not be able to change the verdict. `unlink` on a file
        # that is already gone raises `FileNotFoundError`, and an exception
        # raised inside `finally` replaces the in-flight result -- so a battery
        # that had just caught every injection would exit with a traceback
        # instead of its summary. `missing_ok` states that the goal is "the lock
        # is not there afterwards", not "this call removed it".
        os.close(lock_fd)
        LOCK_PATH.unlink(missing_ok=True)

    summary = {
        "caught": caught,
        "survived": survived,
        "inert": inert,
        "timed_out": timed_out,
        "redundant": len(EXPECTED_SURVIVORS),
        "total_seconds": round(total_seconds, 1),
        "slowest": {"seconds": round(slowest[0], 1), "injection": slowest[1]},
    }

    print()
    print(
        f"{caught} caught, {survived} survived, {inert} inert, "
        f"{timed_out} timed out, {len(EXPECTED_SURVIVORS)} redundant (expected)"
    )
    # The cost is printed because it is the one number that differs between the
    # machine this was written on and the machine it runs on, and the difference
    # is large enough to be mistaken for a verdict problem when it is not.
    print(
        f"time: {total_seconds:.1f}s across {len(INJECTIONS) - inert} injection(s); "
        f"slowest {slowest[0]:.1f}s ({slowest[1] or 'none'})"
    )
    restore_status = assert_source_restored()
    summary["restore_status"] = restore_status
    if restore_status != 0:
        write_report(results, summary)
        return restore_status
    if survived or inert or timed_out:
        print()
        print("Failures:")
        for name, verdict, *_ in results:
            if verdict in {"SURVIVED", "INERT", "TIMEOUT"}:
                print(f"  {verdict}  {name}")
        write_report(results, summary)
        return 1
    write_report(results, summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
