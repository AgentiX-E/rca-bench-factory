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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _witnesses as W  # noqa: E402  (the shared attribution table)

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


TEST_DIR = REPO / "packages" / "core" / "test"
TEST_FILE = 'fetch-official.test.ts'


# ---------------------------------------------------------------------------
# What each injection must break, named.
#
# The condition used to be `failed > 0`, which answers *the suite went red* to a
# question that is *the behaviour this mutation changed is pinned by a test*.
# Two ways that goes wrong, both measured elsewhere in this repository: a mutated
# file that can no longer be **parsed** fails every test that imports it, and a
# mutation that breaks **something else** on the way is credited to the row that
# belongs to the description above.
#
# Each entry names the substrings of the runner's failing-test lines that must be
# present for the red to count. Anything else is `UNATTRIBUTED`; a transform
# failure is `UNPARSEABLE`. Both are failures. `scripts/injection/_witnesses.py`
# holds the decision and `--verify-expectations --probe` reconciles this table
# against the injections and the test file, so a renamed test fails locally
# instead of silently turning a CAUGHT into an UNATTRIBUTED on the runner.
EXPECTATIONS: dict[str, tuple[str, ...]] = {
    'verification moved back outside the retry loop': (
        'retries a transfer that arrived short, and succeeds on the second attempt',
    ),
    'a pin mismatch exits 1 instead of 2': (
        'fails when the recorded digest does not match the bytes served',
    ),
    'an over-long file classified as short': (
        'does not retry a file that is longer than the pin',
    ),
    'the digest comparison always agrees': (
        'does not retry a same-length digest mismatch, and reports it as a pin problem',
    ),
    'the byte-count comparison always agrees': (
        'retries a short transfer and then reports it as unreachable, not as a pin problem',
    ),
}




def verify_expectations(probe: bool = False) -> int:
    """Reconcile the witness table against the injections and the test file."""
    files = {name: TEST_DIR / TEST_FILE for name, *_ in INJECTIONS}
    return W.verify_witness_table(
        'fetch-official-retry', EXPECTATIONS, [name for name, *_ in INJECTIONS], files,
        TEST_DIR, 'fetch-official.test.ts', probe=probe,
        anchors=[(n, Path(SRC), (a, r)) for n, a, r, *_ in INJECTIONS]
    )


def _measure():
    reconcile = verify_expectations()
    if reconcile != 0:
        return reconcile
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
            failing = W.failing_tests(out)
            verdict, detail = W.attribute(
                name, EXPECTATIONS, 1 if failed > 0 else 0, failed, failing, W.transform_failure(out)
            )
            if verdict == W.CAUGHT:
                print(f"  {'caught':9} ({failed:2} red)  {name}")
            elif verdict == W.UNATTRIBUTED:
                print(f"  {'UNATTRIBUTED':9} ({failed:2} red)  {name}")
                for witness in detail:
                    print(f"      missing: {witness}")
                uncaught.append(name)
            elif verdict == W.UNPARSEABLE:
                print(f"  {'UNPARSEABLE':9} {name}")
                print(f"      {detail[0][:110]}")
                uncaught.append(name)
            else:
                print(f"  {'SURVIVED':9} ({failed:2} red)  {name}")
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



def main():
    """Measure inside the shared journal, so a killed run leaves nothing behind.

    The journal records every file this battery could mutate before it mutates one,
    and the next battery puts back whatever a dead run left. See `guard` in
    `_witnesses.py` for why the record is taken by subtree rather than by name.
    """
    with W.guard("fetch-official-retry"):
        return _measure()


if __name__ == "__main__":
    if "--verify-expectations" in sys.argv:
        sys.exit(verify_expectations(probe="--probe" in sys.argv))
    sys.exit(main())
