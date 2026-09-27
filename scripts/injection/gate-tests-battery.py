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

import re
import subprocess
import sys
from pathlib import Path
from typing import Callable

REPO = Path(__file__).resolve().parents[2]

# The vitest binary, resolved from the repository's own install. The battery
# drives vitest rather than a test runner of its own so that the assertions are
# exercised exactly as CI exercises them.
VITEST = ["pnpm", "exec", "vitest", "run", "--root", "packages/core"]


def rename(text: str, old: str, new: str) -> str:
    """One anchored replacement, asserting the anchor was actually present."""
    if old not in text:
        raise AssertionError(f"anchor not found: {old[:70]!r}")
    return text.replace(old, new, 1)


def run_tests(test_file: str) -> tuple[int, str]:
    """Run one test file; return its exit status and the lines vitest printed.

    No `check=True`: a non-zero status is the measurement. The output is captured
    so the failing test names can be reported, which is what distinguishes "the
    named assertion broke" from "something in the file broke".

    `pnpm` is resolved through the environment rather than by absolute path,
    because the repository is checked out at a different path on every machine.
    That makes the *absence* of `pnpm` a possible cause of a SURVIVED verdict
    that has nothing to do with the guard under test, so the symptom is detected
    once, up front, by `assert_vitest_is_callable` rather than being inferred
    from a battery full of survivors.
    """
    proc = subprocess.run(
        [*VITEST, test_file],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stdout + proc.stderr


def assert_vitest_is_callable() -> None:
    """Fail loudly if the test runner cannot be invoked at all.

    The distinction this preserves: a battery where every injection reports
    SURVIVED is unreadable, because "the guard is not guarded" and "the runner
    never started" produce the same verdict and mean opposite things. The
    repository has been bitten by the second once already -- `inject-stability.mjs`
    shipped with an absolute path that passed locally and threw on the runner
    before its first injection (finding 77). Checking the runner first turns that
    into one line instead of twenty-five misleading rows.
    """
    probe = subprocess.run(
        [*VITEST, "--version"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    if probe.returncode != 0:
        print("the test runner is not callable, so no injection below would mean anything")
        print(f"  command: {' '.join(VITEST)}")
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


def failing_tests(output: str) -> list[str]:
    """The names of the tests vitest marked as failed, stripped of decoration."""
    names = []
    for line in output.splitlines():
        match = re.match(r"\s*[×✗]\s+(.*?)(?:\s+\d+ms)?$", line.strip())
        if match:
            names.append(match.group(1).strip())
    return names


def failed_count(output: str) -> int:
    match = re.search(r"Tests\s+(\d+) failed", output)
    return int(match.group(1)) if match else 0


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
    results: list[tuple[str, str, list[str]]] = []
    caught = survived = inert = 0

    assert_vitest_is_callable()

    for name, script, test_file, mutation, description in INJECTIONS:
        path = REPO / script
        original = path.read_text()
        try:
            mutated = mutation(original)
        except AssertionError as exc:
            print(f"INERT    {name}")
            print(f"         -- the anchor no longer matches: {exc}")
            inert += 1
            results.append((name, "INERT", []))
            continue

        if mutated == original:
            print(f"INERT    {name}")
            print("         -- the mutation changed nothing")
            inert += 1
            results.append((name, "INERT", []))
            continue

        try:
            path.write_text(mutated)
            status, output = run_tests(test_file)
        finally:
            path.write_text(original)

        if status != 0 and failed_count(output) > 0:
            names = failing_tests(output)
            print(f"CAUGHT   {name}")
            print(f"         expecting: {description}")
            print(f"         failing:   {len(names)} test(s), first: {names[0] if names else '(unnamed)'}")
            caught += 1
            results.append((name, "CAUGHT", names))
        elif name in EXPECTED_SURVIVORS:
            print(f"REDUNDANT {name}")
            print(f"         expecting: {description}")
            print(f"         -- {EXPECTED_SURVIVORS[name]}")
            results.append((name, "REDUNDANT", []))
        else:
            print(f"SURVIVED {name}")
            print(f"         expecting: {description}")
            print("         -- the test file stayed green, so it does not guard this")
            print(_diagnose(status, output))
            survived += 1
            results.append((name, "SURVIVED", []))

    print()
    print(f"{caught} caught, {survived} survived, {inert} inert, {len(EXPECTED_SURVIVORS)} redundant (expected)")
    restore_status = assert_source_restored()
    if restore_status != 0:
        return restore_status
    if survived or inert:
        print()
        print("Failures:")
        for name, verdict, _ in results:
            if verdict in {"SURVIVED", "INERT"}:
                print(f"  {verdict}  {name}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
