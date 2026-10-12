#!/usr/bin/env python3
"""
Injection battery for the T2 backend support claim.

The round's claim is that "Prometheus is supported" and "these five are not, and
here is what each would take" are *measurements* rather than a paragraph: the
matrix in `docs/architecture.md` is held to a snapshot, the snapshot is held to
the registry, and every backend the registry calls implemented is driven over a
real socket by a test. A claim like that is worth what its sensitivity is worth,
so this battery measures the sensitivity.

Three subjects, because the claim has three links:

  - `scripts/check-backend-support.mjs` -- the document guard. Each injection
    removes one refusal and requires `check-backend-support.test.ts` to notice.
  - `scripts/derive-backend-support.mjs` -- the snapshot guard. The injection
    makes it report stale snapshots as current, which is the branch `--check`
    exists for.
  - `packages/core/src/ingest/{prometheus,backends}.ts` -- the pull path and the
    registry. Each injection removes one branch of the wire reader, or breaks the
    registry's agreement with its snapshot, and requires the corresponding test
    file to go red.

Outcomes, the vocabulary the batteries in this repository share:

  - CAUGHT        the mutation made the named test fail. The assertion is
                  load-bearing.
  - SURVIVED      the file stayed green. The test does not test what its name says.
  - INERT         the anchor did not match, so nothing was mutated.
  - MISATTRIBUTED the file went red but not on the named test, which is how a
                  crash gets credited as a proof (finding 152).
  - TIMEOUT       the run exceeded the bound. Kept apart from SURVIVED because
                  the two call for opposite repairs.

Run: python3 scripts/injection/backend-support.py
Exit: 0 all caught, 1 otherwise
"""

from __future__ import annotations

import hashlib
import re
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

GATE = "scripts/check-backend-support.mjs"
DERIVE = "scripts/derive-backend-support.mjs"
PULLER = "packages/core/src/ingest/prometheus.ts"
REGISTRY = "packages/core/src/ingest/backends.ts"

GATE_TEST = "test/check-backend-support.test.ts"
PULLER_TEST = "test/prometheus.test.ts"
REGISTRY_TEST = "test/backend-support.test.ts"

VITEST = ["pnpm", "exec", "vitest", "run", "--root", "packages/core"]

# ~25x the slowest file here (`prometheus.test.ts` at ~4.5s, which opens real
# sockets per case). This bound is not a performance assertion; a slower runner
# must not be turned into a red battery by it, so a timeout reports itself.
PER_INJECTION_TIMEOUT_S = 120

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

# Mutations whose survivor is expected and understood. A mutation that survives
# and is not listed here fails the run: an unexplained survivor is the point.
EXPECTED_SURVIVORS: dict[str, str] = {}


def rename(text: str, old: str, new: str) -> str:
    """One anchored replacement, asserting the anchor was actually present."""
    if old not in text:
        raise AssertionError(f"anchor not found: {old[:80]!r}")
    return text.replace(old, new, 1)


def strip_ansi(text: str) -> str:
    """Remove the runner's colour codes before reading a test name out of it.

    Findings 147, 148 and 152 are three separate readers of this repository's CI
    output that were blinded by the same thing, so no reader below depends on
    whether the runner coloured its output.
    """
    return ANSI.sub("", text)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_tests(test_file: str) -> tuple[int, str]:
    proc = subprocess.run(
        [*VITEST, test_file],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=PER_INJECTION_TIMEOUT_S,
    )
    return proc.returncode, strip_ansi(proc.stdout + proc.stderr)


def assert_vitest_is_callable() -> None:
    """Fail loudly if the runner cannot be invoked, before any injection runs.

    Asked with `--version` alone: `run --root packages/core --version` is accepted
    by vitest, the trailing flag is ignored, and the probe executes the whole
    package suite instead of answering in a third of a second.
    """
    probe = subprocess.run(
        ["pnpm", "exec", "vitest", "--version"],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if probe.returncode != 0:
        print("the test runner is not callable, so no injection below would mean anything")
        print(f"  exit:   {probe.returncode}")
        print(f"  stderr: {probe.stderr.strip()[:400]}")
        raise SystemExit(2)


# name, target file, anchor, replacement, test file, the test that must fail
MUTATIONS: list[tuple[str, str, str, str, str, str]] = [
    (
        "stop refusing a missing matrix row",
        GATE,
        "    if (row === undefined) {",
        "    if (false) {",
        GATE_TEST,
        "refuses a missing row",
    ),
    (
        "stop comparing the document's status with the snapshot's",
        GATE,
        "    if (row.status !== backend.status) {",
        "    if (false) {",
        GATE_TEST,
        "refuses a status that disagrees with the snapshot",
    ),
    (
        "stop comparing the description",
        GATE,
        "    if (row.text !== expected) {",
        "    if (false) {",
        GATE_TEST,
        "refuses a description that has drifted from the measured one",
    ),
    (
        "stop refusing a row the registry does not list",
        GATE,
        "    if (!backends.some((backend) => backend.id === row.id)) {",
        "    if (false) {",
        GATE_TEST,
        "refuses a row for a backend the registry does not list",
    ),
    (
        "stop refusing two rows for one backend",
        GATE,
        "    if (byId.has(row.id)) {",
        "    if (false) {",
        GATE_TEST,
        "refuses two rows for one backend",
    ),
    (
        "stop refusing a status outside the closed pair",
        GATE,
        "    if (!STATUSES.includes(row.status)) {",
        "    if (false) {",
        GATE_TEST,
        "refuses a status outside the closed pair",
    ),
    (
        "stop refusing an empty snapshot",
        GATE,
        "  if (backends.length === 0) {",
        "  if (false) {",
        GATE_TEST,
        "refuses an empty snapshot",
    ),
    (
        "report a stale snapshot as current",
        DERIVE,
        "if (committed !== rendered) {",
        "if (false) {",
        GATE_TEST,
        "reports a stale snapshot rather than rewriting it",
    ),
    (
        "stop quarantining a non-finite sample value",
        PULLER,
        "      const value = sampleValue(rawSample[1]);\n      if (value === undefined) {",
        "      const value = sampleValue(rawSample[1]) ?? 0;\n      if (false) {",
        PULLER_TEST,
        "quarantines the non-finite sample value NaN",
    ),
    (
        "read a query error in an HTTP 200 as an empty result",
        PULLER,
        "  if (envelope['status'] !== 'success') {",
        "  if (false) {",
        PULLER_TEST,
        "fails on a query error carried inside an HTTP 200",
    ),
    (
        "read a vector result as if it were a matrix",
        PULLER,
        "  if (resultType !== 'matrix') {",
        "  if (false) {",
        PULLER_TEST,
        "fails when a range query answers with something other than a matrix",
    ),
    (
        "name a series that carries no __name__",
        PULLER,
        "    if (typeof name !== 'string' || name === '') {",
        "    if (false) {",
        PULLER_TEST,
        "quarantines a series with no metric name",
    ),
    (
        "attach a sample to a service that was never reported",
        PULLER,
        "    if (typeof serviceName !== 'string' || serviceName === '') {",
        "    if (false) {",
        PULLER_TEST,
        "quarantines a series with no service label",
    ),
    (
        "drop the offset that says which clock the sample came from",
        PULLER,
        "        rawOffsetMinutes: 0,\n",
        "",
        PULLER_TEST,
        "maps a matrix to one metric signal per sample",
    ),
    (
        "declare the pull path unsupported while keeping its entry",
        REGISTRY,
        "    id: 'prometheus',\n    status: 'implemented',",
        "    id: 'prometheus',\n    status: 'unsupported',\n    reason: 'this backend was flipped by a mutation, and the reason is long enough to pass the length rule',",
        REGISTRY_TEST,
        "holds the committed snapshot equal to the registry it is derived from",
    ),
]

# Test files that must be restored as well: none of the subjects above live in
# one, but a mutation whose anchor is missing must not leave a half-written file
# behind, so every write is paired with a read-back below.


def main() -> int:
    started = time.monotonic()
    assert_vitest_is_callable()
    subjects = sorted({target for _, target, _, _, _, _ in MUTATIONS})
    originals = {path: (REPO / path).read_text() for path in subjects}
    digests = {path: digest(REPO / path) for path in subjects}

    results: list[tuple[str, str, str]] = []
    try:
        for name, target, anchor, replacement, test_file, expected in MUTATIONS:
            path = REPO / target
            try:
                mutated = rename(originals[target], anchor, replacement)
            except AssertionError as exc:
                results.append((name, "INERT", str(exc)))
                continue

            path.write_text(mutated)
            try:
                code, out = run_tests(test_file)
            except subprocess.TimeoutExpired:
                results.append((name, "TIMEOUT", f">{PER_INJECTION_TIMEOUT_S}s"))
                continue
            finally:
                path.write_text(originals[target])

            # Read back rather than trust the `finally`: one of these subjects is
            # the guard a later CI step executes, and a restore that did not land
            # is worse than a failed injection. The verdict is a name bound to a
            # comparison over the file's content, because the repository's own
            # guard for this reads that shape out of the data flow.
            current = path.read_text(encoding="utf-8")
            restored = current == originals[target] and digest(path) == digests[target]
            if not restored:
                print(f"restore failed after '{name}' -- stopping, the tree is not trustworthy")
                return 2

            if code == 0:
                verdict = "SURVIVED"
            elif expected in out:
                verdict = "CAUGHT"
            else:
                verdict = "MISATTRIBUTED"
            results.append((name, verdict, expected))
    finally:
        for path_name, text in originals.items():
            (REPO / path_name).write_text(text)

    for path_name in subjects:
        current = (REPO / path_name).read_text(encoding="utf-8")
        restored = current == originals[path_name] and digest(REPO / path_name) == digests[path_name]
        if not restored:
            print(f"{path_name} is not back to its committed bytes; do not trust this run")
            return 2

    width = max(len(name) for name, _, _ in results)
    caught = survived = inert = misattributed = 0
    failed = False
    for name, verdict, detail in results:
        marker = "ok  " if verdict == "CAUGHT" else "FAIL"
        print(f"{marker}  {name.ljust(width)}  {verdict:14}  {detail[:64]}")
        if verdict == "CAUGHT":
            caught += 1
            continue
        if verdict == "SURVIVED" and name in EXPECTED_SURVIVORS:
            print(f"        expected survivor: {EXPECTED_SURVIVORS[name]}")
            continue
        failed = True
        survived += 1 if verdict == "SURVIVED" else 0
        inert += 1 if verdict == "INERT" else 0
        misattributed += 1 if verdict == "MISATTRIBUTED" else 0

    print(
        f"\nbackend-support: {caught} caught, {survived} survived, {inert} inert, "
        f"{misattributed} misattributed, {len(MUTATIONS)} injection(s) in {time.monotonic() - started:.0f}s"
    )
    if failed:
        print("every mutation must be caught, or carry a reason in EXPECTED_SURVIVORS")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
