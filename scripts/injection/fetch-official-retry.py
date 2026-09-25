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
import shutil
import subprocess
import sys

REPO = "/root/.codebuddy/artifact/rca-work/rca-bench-factory"
SRC = f"{REPO}/scripts/fetch-official.mjs"
PRISTINE = "/tmp/fo-pristine.mjs"

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


def run_suite():
    proc = subprocess.run(
        ["npx", "vitest", "run", "test/fetch-official.test.ts"],
        cwd=f"{REPO}/packages/core",
        capture_output=True,
        text=True,
    )
    out = proc.stdout + proc.stderr
    failed = 0
    for line in out.splitlines():
        stripped = line.strip()
        if stripped.startswith("Tests ") and "failed" in stripped:
            failed = int(stripped.split()[1])
    return failed, out


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
        status = "caught" if failed > 0 else "SURVIVED"
        print(f"  {status:9} ({failed:2} red)  {name}")
        if failed == 0:
            uncaught.append(name)

        shutil.copy(PRISTINE, SRC)

    # The pristine source must be green.
    failed, _ = run_suite()
    print(f"\npristine source: {'GREEN' if failed == 0 else f'{failed} FAILING'}")

    if uncaught:
        print(f"\n{len(uncaught)} injection(s) survived the suite:")
        for name in uncaught:
            print(f"  - {name}")
        return 1
    print(f"\nall {len(INJECTIONS)} injection(s) caught")
    return 0


if __name__ == "__main__":
    sys.exit(main())
