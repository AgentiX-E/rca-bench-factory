#!/usr/bin/env python3
"""Deliberate-injection battery for the fault extraction scorer.

For each injection: apply it, run the scorer suite, and require that at least one
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
SRC = REPO / "packages" / "core" / "src" / "fault" / "extraction-scoring.ts"
PRISTINE = REPO / "node_modules" / ".cache" / "es-final.ts"

INJECTIONS = [
    (
        "unverifiable collapsed into graded",
        """  if (prediction.verifiable === false) {
    return { sampleId: sample.id, state: 'unverifiable', fields: { ...none } };
  }

""",
        "",
    ),
    (
        "unvalidated graded as if valid",
        """  if (prediction.validationValid !== true) {
    return { sampleId: sample.id, state: 'unvalidated', fields: { ...none } };
  }

""",
        "",
    ),
    (
        "unparseable graded instead of skipped",
        """  if (!prediction.parseOk || prediction.extracted === undefined) {
    return { sampleId: sample.id, state: 'unparseable', fields: { ...none } };
  }

""",
        "",
    ),
    (
        "empty denominator reported as 0 instead of null",
        """  return { hits, total, rate: total === 0 ? null : hits / total };""",
        """  return { hits, total, rate: hits / total };""",
    ),
    (
        "an omitted optional field scored false instead of excluded",
        """    const expected = want[field];
    if (expected === undefined) {
      // The sample states no expectation, so there is nothing for the model's
      // answer to be right or wrong about. Scoring `false` here -- which is what
      // a plain `sameValue` returns for a present answer against an absent
      // expectation -- charges the model for an omission the ground truth made.
      return null;
    }""",
        """    const expected = want[field];""",
    ),
    (
        "the sample-id pairing check removed",
        """  if (prediction.sampleId !== sample.id) {""",
        """  if (false) {""",
    ),
    (
        "strict rate computed over all samples instead of graded ones",
        """    strict: rate(graded.filter(isStrictHit).length, graded.length),""",
        """    strict: rate(verdicts.filter(isStrictHit).length, total),""",
    ),
    (
        "M1 threshold relaxed to accept an unmeasured rate",
        """  if (report.strict.rate === null) {
    return false;
  }
  return report.strict.rate >= M1_STRICT_THRESHOLD;""",
        """  return (report.strict.rate ?? 0) >= 0;""",
    ),
    (
        "duplicate sample id accepted",
        """    if (seen.has(s.id)) {
      // Averaging over a duplicated id would double-count one incident and
      // quietly shift every rate in the report.
      throw new Error(`duplicate sample id '${s.id}'`);
    }
    seen.add(s.id);""",
        """    seen.add(s.id);""",
    ),
    (
        "an unexpected schema version read optimistically",
        """  if (schema !== FAULT_GOLDEN_SCHEMA) {""",
        """  if (false) {""",
    ),
    (
        "an empty dataset accepted",
        """  if (rawSamples.length === 0) {
    throw new Error('golden dataset contains no samples; an empty run measures nothing');
  }

""",
        "",
    ),
    (
        "case folding dropped from the comparison",
        """  return normalizeFaultType(a) === normalizeFaultType(b);""",
        """  return a === b;""",
    ),
]


def strip_ansi(text: str) -> str:
    """Remove the SGR escapes vitest emits when colour is on.

    CI leaves colour on even though the child's stdout is a pipe, so the runner's
    summary arrives as
    `\\x1b[2m      Tests \\x1b[22m \\x1b[1m\\x1b[32m2 failed | 14 passed\\x1b[39m`
    where a terminal emits `      Tests  2 failed | 14 passed (16)`.
    """
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


def parse_failed_count(output: str):
    """Failing tests the suite reported, or `None` when it reported no summary.

    The loop this replaces tested `stripped.startswith("Tests ")` against text
    that still held the escapes, so the line began with `\\x1b[2m` and the branch
    was never entered. `failed` stayed 0 for every injection, and 0 is the
    `SURVIVED` condition -- so on CI this battery would have accused its own suite
    of having no teeth for all twelve injections, while running here it reports
    twelve caught. Measured by driving the shipped loop with the captured CI bytes
    in `packages/core/test/battery-summary-survives-ci-output.test.ts`.

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
        ["npx", "vitest", "run", "test/extraction-scoring.test.ts"],
        cwd=f"{REPO}/packages/core",
        capture_output=True,
        text=True,
    )
    out = proc.stdout + proc.stderr
    return parse_failed_count(out), out


def assert_source_restored() -> int:
    """Every mutated file must be back to its original bytes.

    Restoring in a loop is not the same as *verifying* the restore, and the
    difference matters here: this battery rewrites a tracked source file, so a
    run whose last `shutil.copy` silently failed leaves the repository holding a
    mutation that every later command -- including CI -- reads as the real
    source. The verdict was printed before this function existed and the exit
    status was computed only from the injection count, so the printed line was
    the only consumer of it and a bad restore exited 0.

    `packages/core/test/batteries-verify-their-restore.test.ts` asserts that
    every battery in this repository gates its exit status on its restore, which
    is why this returns a status rather than printing one.
    """
    current = SRC.read_text()
    original = PRISTINE.read_text()
    if current != original:
        print()
        print("the battery did not restore its own mutation:")
        print(f"  {SRC.relative_to(REPO)} differs from the pristine capture")
        return 2
    print("source restored: identical to the pristine capture")

    # The pristine source must be *green*, which is the negative control and was
    # printed before without deciding anything. Two facts have to hold for a
    # "caught" row above to mean what it says: the source was mutated (checked by
    # the anchor test), and the source is green without the mutation. A suite that
    # was already failing would produce a "caught" verdict for every injection
    # while proving nothing, and the printed control-line would not have stopped
    # it.
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
TEST_FILE = 'extraction-scoring.test.ts'


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
    'unverifiable collapsed into graded': (
        'marks a fault the verifier cannot check as unverifiable',
    ),
    'unvalidated graded as if valid': (
        'marks a parse that fails validation as unvalidated, not as a miss',
    ),
    'unparseable graded instead of skipped': (
        'marks an unparseable response as unparseable and grades no field',
    ),
    'empty denominator reported as 0 instead of null': (
        'reports a null rate, never a zero, when the denominator is empty',
    ),
    'an omitted optional field scored false instead of excluded': (
        'grades an omitted component as null when the sample did not state one',
    ),
    'the sample-id pairing check removed': (
        'reports a mismatched sample id as a hard error rather than scoring it',
    ),
    'strict rate computed over all samples instead of graded ones': (
        'counts each state separately and reports rates over their own denominators',
    ),
    'M1 threshold relaxed to accept an unmeasured rate': (
        'reports NOT MET for a measured run below the threshold',
    ),
    'duplicate sample id accepted': (
        'names the duplicated sample id rather than averaging over it twice',
    ),
    'an unexpected schema version read optimistically': (
        'rejects an unknown schema version rather than reading it optimistically',
    ),
    'an empty dataset accepted': (
        'reports an empty dataset as an error, because an empty run measures nothing',
    ),
    'case folding dropped from the comparison': (
        'normalises fault types before comparing, so casing is not a miss',
    ),
}




def verify_expectations(probe: bool = False) -> int:
    """Reconcile the witness table against the injections and the test file."""
    files = {name: TEST_DIR / TEST_FILE for name, *_ in INJECTIONS}
    return W.verify_witness_table(
        'fault-extraction-scoring', EXPECTATIONS, [name for name, *_ in INJECTIONS], files,
        TEST_DIR, 'extraction-scoring.test.ts', probe=probe,
        anchors=[(n, SRC, (a, r)) for n, a, r, *_ in INJECTIONS]
    )


def main():
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


if __name__ == "__main__":
    if "--verify-expectations" in sys.argv:
        sys.exit(verify_expectations(probe="--probe" in sys.argv))
    sys.exit(main())
