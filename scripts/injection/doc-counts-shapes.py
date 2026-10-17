#!/usr/bin/env python3
"""
Injection battery for the shape census in `scripts/check-doc-counts.mjs`.

The round's claim is that the doc-count gate now refuses a count it cannot read,
so that a row written in an unrecognised shape fails the gate instead of being
skipped. A claim like that is worth exactly what the tests' sensitivity to it is
worth, so it is measured here rather than asserted.

Every injection below is a mutation of the **gate script**, and the requirement is
that the gate's own test file goes red *and names the test that was supposed to
notice*. The second half matters as much as the first: a requirement phrased as
"some test failed" is satisfied by a test failing for an unrelated reason, which
is how finding 152 credited a syntax error as a proof.

Outcomes, the vocabulary the batteries in this repository share:

  - CAUGHT        the mutation made the named test fail. The assertion is
                  load-bearing.
  - SURVIVED      the mutation left the file green. The test does not test what
                  its name says, and the mutation names the gap.
  - INERT         the anchor did not match, so nothing was mutated. A mutation
                  that never applied says nothing about anything, and reporting it
                  as SURVIVED is the false reading findings 68 and 74 describe.
  - MISATTRIBUTED the file went red but not on the named test. Counted separately
                  from CAUGHT, because attributing an unrelated failure to the
                  mutation is the over-claim this battery exists to prevent.
  - TIMEOUT       the run exceeded `PER_INJECTION_TIMEOUT_S`. Kept apart from
                  SURVIVED because the two call for opposite repairs.

## Why the mutations are anchored replacements

`rename()` asserts the anchor was present before replacing it. A mutation written
as a regex over the whole file silently becomes a no-op after an unrelated
refactor, and a no-op is indistinguishable from a survivor unless the battery
refuses to accept it -- which is what INERT is for. The anchors here are the exact
source lines the rules are written on, so a rule that is rewritten must be
re-anchored deliberately rather than losing its evidence.

## Why the file is restored twice

`finally` restores, and then the run compares sha256 after every injection.
Restoring and *verifying* the restore are different claims, and this repository has
already paid once for the difference: an audit script in finding 152 was killed
while holding a hollowed gate and left it in the working tree, after which every
later step read a gate whose verdict had been removed.

Run: python3 scripts/injection/doc-counts-shapes.py
Exit: 0 all caught, 1 otherwise
"""

from __future__ import annotations

import hashlib
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _witnesses as W  # noqa: E402  (the shared witness reconciliation)

REPO = Path(__file__).resolve().parents[2]

GATE = REPO / "scripts" / "check-doc-counts.mjs"
TESTS = "test/check-doc-counts.test.ts"
TEST_FILE = REPO / "packages" / "core" / TESTS

# The vitest binary, resolved from the repository's own install, so the
# assertions are exercised exactly as CI exercises them.
VITEST = ["pnpm", "exec", "vitest", "run", "--root", "packages/core"]

# ~30x the observed wall time of this file (~0.9s), because this bound is not a
# performance assertion and a slower runner must not be turned into a red battery
# by it. A timeout reports itself as TIMEOUT rather than SURVIVED.
PER_INJECTION_TIMEOUT_S = 120

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

# Mutations whose survivor is expected and understood, keyed by name. Every entry
# must carry a reason, and a mutation that survives *and* is not listed here fails
# the run: an unexplained survivor is the whole point of running this.
EXPECTED_SURVIVORS: dict[str, str] = {}


def rename(text: str, old: str, new: str) -> str:
    """One anchored replacement, asserting the anchor was actually present."""
    if old not in text:
        raise AssertionError(f"anchor not found: {old[:80]!r}")
    return text.replace(old, new, 1)


def strip_ansi(text: str) -> str:
    """Remove the runner's colour codes before reading anything out of its output.

    Not a nicety. Findings 147, 148 and 152 are three separate readers of this
    repository's CI output that were blinded by the same thing, the last of them
    inside the script whose whole job was to find that class of defect. A reader
    that looks for a failing test's name must not depend on whether the runner
    decided to colour it.
    """
    return ANSI.sub("", text)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_tests() -> tuple[int, str]:
    """Run the gate's test file; return its exit status and its readable output."""
    proc = subprocess.run(
        [*VITEST, TESTS],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=PER_INJECTION_TIMEOUT_S,
    )
    return proc.returncode, strip_ansi(proc.stdout + proc.stderr)


def assert_vitest_is_callable() -> None:
    """Fail loudly if the runner cannot be invoked, before any injection runs.

    Without this probe, "the guard is not guarded" and "the runner never started"
    produce the same twenty SURVIVED rows and mean opposite things. Asked with
    `--version` alone: `run --root packages/core --version` is accepted by vitest,
    the trailing flag is ignored, and the probe executes the whole package suite
    instead of answering in 0.3s -- which finding 145's round measured rather than
    guessed at.
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


# Each entry: name, anchor, replacement, the test that must be the one to fail.
MUTATIONS: list[tuple[str, str, str, str]] = [
    (
        "drop the 'N passed (M files)' shape",
        "  { name: 'N passed (M files)',"
        " re: /(\\d+)\\s*(?:tests?\\s*)?passed\\s*\\(\\s*(\\d+)\\s*files?\\s*\\)/g },\n",
        "",
        # Pointed at the *second* test, not the first. The first only asserts exit
        # 0, and the bare shape also makes that row green -- it reads the 2403 and
        # ignores the 82 -- so the first run of this battery reported SURVIVED for
        # this mutation and was right to. The file count has to be used by a rule
        # before its being read is observable.
        "refuses a parenthesised file count that exceeds the test count",
    ),
    (
        "stop reading a bare test count at all",
        "if (shape === null && scope !== null) {",
        "if (false) {",
        "reads a bare test count when the row names its scope",
    ),
    (
        "read the bare shape on rows that name no scope",
        "if (shape === null && scope !== null) {",
        "if (shape === null) {",
        "leaves a bare test count alone when the row names no scope",
    ),
    (
        "delete rule 4 entirely",
        "  for (const row of rows) {\n    if (row.read || row.scope === null) continue;",
        "  for (const row of []) {\n    if (row.read || row.scope === null) continue;",
        "refuses a scope-named row whose count is in a shape it cannot read",
    ),
    (
        "excuse every unreadable phrase",
        "if (table.some((entry) => entry.shape === phrase.shape)) {",
        "if (true) {",
        "refuses a scope-named row whose count is in a shape it cannot read",
    ),
    (
        "accept an exemption with too short a reason",
        "if (reason.length < MIN_REASON) {",
        "if (false) {",
        "refuses an excuse whose reason is too short to say anything",
    ),
    (
        "accept two exemptions that share a reason",
        "if (seen.has(reason)) {",
        "if (false) {",
        "refuses two excuses that share one reason",
    ),
    (
        "key exemptions on the whole row instead of the clause",
        "    .slice(from, to)",
        "    .slice(0, row.length)",
        "passes against the shipped document",
    ),
    (
        "allow a one-test fall",
        "if (prev && row.tests < prev.tests) {",
        "if (prev && row.tests < prev.tests - 1) {",
        "refuses a fall of a single test",
    ),
    (
        "compare only the test count for a current-state row",
        "if (row.files !== live.files || row.tests !== live.tests) {",
        "if (row.tests !== live.tests) {",
        "refuses a current-state row whose file count is stale",
    ),
    (
        "read counts in prose as well as in rows",
        "if (!isTableRow(line)) return;",
        "if (false) return;",
        "leaves a count narrated in prose alone",
    ),
    (
        "return only the rows a shape matched",
        "if (shape === null && (scope === null || phrases.length === 0)) return;",
        "if (scope === null || phrases.length === 0) return;",
        "refuses a scope-named row whose count is in a shape it cannot read",
    ),
]


def _measure() -> int:
    assert_vitest_is_callable()
    original = GATE.read_text()
    before = digest(GATE)

    results: list[tuple[str, str, str]] = []
    try:
        for name, anchor, replacement, expected in MUTATIONS:
            try:
                mutated = rename(original, anchor, replacement)
            except AssertionError as exc:
                results.append((name, "INERT", str(exc)))
                continue

            GATE.write_text(mutated)
            try:
                code, out = run_tests()
            except subprocess.TimeoutExpired:
                results.append((name, "TIMEOUT", f">{PER_INJECTION_TIMEOUT_S}s"))
                continue
            finally:
                GATE.write_text(original)

            # Read back rather than trust the `finally`: this battery writes to a
            # gate script that every later step executes, so a restore that did
            # not land is worse than a failed injection.
            #
            # The verdict is a name bound to a comparison over the file's content
            # on disk, and that shape is not incidental: the repository's guard for
            # this (`batteries-verify-their-restore.test.ts`) reads a *verdict out
            # of the data flow* rather than a call to a helper, and it requires the
            # comparison to be on a line that binds or gates. A battery that only
            # prints its restore verdict still exits 0 after damaging the tree,
            # which is the defect that guard was written for.
            current = GATE.read_text(encoding="utf-8")
            restored = current == original and digest(GATE) == before
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
        GATE.write_text(original)

    current = GATE.read_text(encoding="utf-8")
    restored = current == original and digest(GATE) == before
    if not restored:
        print("the gate is not back to its committed bytes; do not trust this run")
        return 2

    width = max(len(name) for name, _, _ in results)
    caught = survived = inert = 0
    failed = False
    for name, verdict, detail in results:
        marker = {"CAUGHT": "ok  ", "SURVIVED": "FAIL", "INERT": "FAIL"}.get(verdict, "FAIL")
        print(f"{marker}  {name.ljust(width)}  {verdict:12}  {detail[:70]}")
        if verdict == "CAUGHT":
            caught += 1
            continue
        if verdict == "SURVIVED" and name in EXPECTED_SURVIVORS:
            print(f"        expected survivor: {EXPECTED_SURVIVORS[name]}")
            continue
        failed = True
        if verdict == "SURVIVED":
            survived += 1
        elif verdict == "INERT":
            inert += 1

    print(
        f"\ndoc-counts-shapes: {caught} caught, {survived} survived, {inert} inert "
        f"of {len(MUTATIONS)} injection(s)"
    )
    if failed:
        print("every mutation must be caught, or carry a reason in EXPECTED_SURVIVORS")
        return 1
    return 0


def expectations() -> dict[str, tuple[str, ...]]:
    """The witnesses, one per injection, read from the table's own fourth field.

    Not copied into a second table on purpose: the copy is the thing that goes
    stale, and every row here already declares the test it must break. What the
    reconciliation adds is the check that the *test file* still contains that
    title -- the rename trap that made finding 157's battery report a
    `MISATTRIBUTED` on the runner while its local run was green.
    """
    return {name: (expected,) for name, _anchor, _replacement, expected in MUTATIONS}


def verify_expectations(probe: bool = False) -> int:
    """Reconcile the witness table, without mutating anything.

    The mode exists so a rename fails in a tenth of a second instead of after a
    full mutation loop -- and until finding 163 this file did not implement it, so
    `--verify-expectations` ran all twelve injections and rewrote a gate script
    that other tests were spawning at that moment.
    """
    return W.verify_witness_table(
        "doc-counts-shapes",
        expectations(),
        [name for name, *_ in MUTATIONS],
        dict.fromkeys(expectations(), TEST_FILE),
        TEST_FILE.parent,
        "check-doc-counts.test.ts",
        survivors=tuple(EXPECTED_SURVIVORS),
        probe=probe,
        anchors=[(name, GATE, (anchor, replacement)) for name, anchor, replacement, *_ in MUTATIONS],
    )



def main():
    """Measure inside the shared journal, so a killed run leaves nothing behind.

    The journal records every file this battery could mutate before it mutates one,
    and the next battery puts back whatever a dead run left. See `guard` in
    `_witnesses.py` for why the record is taken by subtree rather than by name.
    """
    with W.guard("doc-counts-shapes"):
        return _measure()


if __name__ == "__main__":
    if "--verify-expectations" in sys.argv:
        sys.exit(verify_expectations(probe="--probe" in sys.argv))
    sys.exit(main())
