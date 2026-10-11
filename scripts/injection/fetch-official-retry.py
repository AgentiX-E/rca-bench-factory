#!/usr/bin/env python3
"""Deliberate-injection battery for the fetch layer's retry scope.

This is the second of two batteries. It is deliberately separate from the scorer
battery because the two target *different files* and are never run as one unit;
merging their rows into a single table would describe a joint battery that does
not exist.

For each injection: apply it, run the fetch suite, and require that at least one
test goes red. An injection the suite does not catch is a hole in the suite, not a
harmless mutation -- it means the behaviour it changes is not pinned by any test.

Restores the pristine source after every case.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SRC = f"{REPO}/scripts/fetch-official.mjs"
PRISTINE = REPO / "node_modules" / ".cache" / "fo-pristine.mjs"

# The first row is the one that matters: it does not remove a guard, it restores
# the *shape* of the defect. `verification_outside_loop` moves the byte count,
# the digest and both comparisons back out of the `for attempt` loop, which is
# exactly the pre-fix source. Six tests go red for it -- four from the retry
# layer itself and two that encode the short/over-long directions of a digest
# pin. A mechanism whose scope changes from "one chance" to "three chances" is
# visible to six independent assertions.
INJECTIONS = [
    (
        "verification moved back outside the retry loop",
        """    const bytes = statSync(destination).size;""",
        """    const bytes = -1;""",
    ),
    (
        "a pin mismatch exits 1 instead of 2",
        """if (pinMismatches.length > 0) {""",
        """if (false) {""",
    ),
    (
        "an over-long file classified as short",
        """    const short = actual.bytes < asset.bytes;""",
        """    const short = true;""",
    ),
    (
        "the digest comparison always agrees",
        """  if (asset.sha256 !== null && actual.digest !== asset.sha256) {""",
        """  if (false) {""",
    ),
    (
        "the byte-count comparison always agrees",
        """  if (asset.bytes !== null && actual.bytes !== asset.bytes) {""",
        """  if (false) {""",
    ),
]


def strip_ansi(text: str) -> str:
    """Remove the SGR escapes vitest emits when colour is on.

    CI leaves colour on even though the child's stdout is a pipe, so the runner's
    summary arrives as
    `\\x1b[2m      Tests \\x1b[22m \\x1b[1m\\x1b[32m3 failed | 12 passed\\x1b[39m`
    where a terminal emits `      Tests  3 failed | 12 passed (15)`.
    """
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


def parse_failed_count(output: str):
    """Failing tests the suite reported, or `None` when it reported no summary.

    The loop this replaces tested `stripped.startswith("Tests ")` against text
    that still held the escapes, so the line began with `\\x1b[2m` and the branch
    was never entered. `failed` stayed 0 for every injection, and 0 is the
    `SURVIVED` condition -- so on CI this battery would have accused its own suite
    of having no teeth for all five injections, while running here it reports five
    caught. Measured by driving the shipped loop with the captured CI bytes in
    `packages/core/test/battery-summary-survives-ci-output.test.ts`.

    `None` is not 0. A run that printed no summary says nothing about the
    mutation, and the caller must not read that silence as a survivor.
    """
    plain = strip_ansi(output)
    for line in plain.splitlines():
        stripped = line.strip()
        if stripped.startswith("Tests ") and "failed" in stripped:
            return int(stripped.split()[1])
    # A green run prints `Tests N passed`, which is a reading of zero failures
    # rather than the absence of a reading.
    for line in plain.splitlines():
        if line.strip().startswith("Tests ") and "passed" in line:
            return 0
    return None


def run_suite():
    proc = subprocess.run(
        ["npx", "vitest", "run", "test/fetch-official.test.ts"],
        cwd=f"{REPO}/packages/core",
        capture_output=True,
        text=True,
    )
    out = proc.stdout + proc.stderr
    return parse_failed_count(out), out


def assert_source_restored() -> int:
    """The mutated script must be back to its original bytes.

    Restoring in a loop is not the same as *verifying* the restore, and the
    difference matters here: `SRC` is the fetch script itself, checked into the
    repository and executed by later CI steps. A run whose last `shutil.copy`
    silently failed would leave the tree holding a mutation that every later
    command reads as the real source.

    The verdict was printed before this function existed, and the exit status was
    computed only from the injection count -- so the printed line was the only
    consumer of it and a bad restore exited 0.
    `packages/core/test/batteries-verify-their-restore.test.ts` asserts that every
    battery in this repository gates its exit status on its restore, which is why
    this returns a status rather than printing one.

    `SRC` is a plain string rather than a `Path`, so `Path()` wraps it here
    instead of editing the constant and changing what every other line in this
    file reads.
    """
    src = Path(SRC)
    current = src.read_text()
    original = PRISTINE.read_text()
    if current != original:
        print()
        print("the battery did not restore its own mutation:")
        print(f"  {src.relative_to(REPO)} differs from the pristine capture")
        return 2
    print("source restored: identical to the pristine capture")

    # The pristine source must be *green*: the negative control, printed before
    # without deciding anything. A suite that was already failing would produce a
    # "caught" verdict for every injection while proving nothing.
    failed, _ = run_suite()
    if failed is None:
        print("the pristine source printed no summary, so every caught row above is unproven")
        return 3
    if failed != 0:
        print(f"the pristine source is not green: {failed} test(s) failing before any injection")
        return 3
    print("pristine source: GREEN")
    return 0


def main():
    shutil.copy(SRC, PRISTINE)
    uncaught = []

    for name, old, new in INJECTIONS:
        source = open(PRISTINE).read()
        if old not in source:
            print(f"  ANCHOR MISSING  {name}")
            uncaught.append(name)
            continue
        open(SRC, "w").write(source.replace(old, new, 1))

        failed, out = run_suite()
        if failed is None:
            # Not `SURVIVED`. No summary was read, so nothing is known about
            # whether the mutation was detected -- and a battery that cannot read
            # its own evidence cannot certify anything, so the row counts as
            # uncaught.
            print(f"  {'NO SUMMARY':9} (no summary)  {name}")
            uncaught.append(name)
        else:
            status = "caught" if failed > 0 else "SURVIVED"
            print(f"  {status:9} ({failed:2} red)  {name}")
            if failed == 0:
                uncaught.append(name)

        shutil.copy(PRISTINE, SRC)

    restore_status = assert_source_restored()

    if uncaught:
        print(f"\n{len(uncaught)} injection(s) survived the suite:")
        for name in uncaught:
            print(f"  - {name}")
        return 1
    print(f"\nall {len(INJECTIONS)} injection(s) caught")
    return restore_status


if __name__ == "__main__":
    sys.exit(main())
