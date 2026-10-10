#!/usr/bin/env python3
"""Deliberate-injection battery for the fault extraction scorer.

For each injection: apply it, run the scorer suite, and require that at least one
test goes red. An injection the suite does not catch is a hole in the suite, not a
harmless mutation -- it means the behaviour it changes is not pinned by any test.

Restores the pristine source after every case.
"""
import shutil
import subprocess
import sys
from pathlib import Path

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


def run_suite():
    proc = subprocess.run(
        ["npx", "vitest", "run", "test/extraction-scoring.test.ts"],
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
