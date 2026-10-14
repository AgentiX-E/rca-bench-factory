#!/usr/bin/env python3
"""
Injection battery for the round-trip record guard.

P0-1 closed when run `38250480271` round-tripped 375 of 375 RE1 cases at
`oracle=1.00` and verified all three asset digests. The guard added with it,
`scripts/check-roundtrip-record.mjs`, is what keeps that result from decaying the
way the previous one did: `docs/progress.md` stood at "253 of 375" in the present
tense for two passes after the corpus started passing, because the number lived in
a log line and the sentence lived in a document and nothing joined them.

The claim has four links -- the record's provenance, the corpus partition, the pins
against the registry in *both* directions, and the document's figures -- and each
injection below removes one. The requirement is that the guard's test file goes red
**on the named assertion**; `MISATTRIBUTED` is reported separately so a crash
cannot be credited as a proof (finding 152).

One injection is different from the rest, and it is the one worth naming: the
guard's first version scoped the document to *any line* containing the section
phrase, and the headline table's cross-reference to the section matched first, so
the guard read the wrong rows and reported every figure as `undefined`. That
injection puts the defect back to show that the fixture which caught it is
load-bearing.

Outcomes: CAUGHT / SURVIVED / INERT / MISATTRIBUTED / TIMEOUT, the vocabulary the
batteries in this repository share.

Run: python3 scripts/injection/roundtrip-record.py
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _witnesses as W  # noqa: E402  (the shared witness reconciliation)

GUARD = "scripts/check-roundtrip-record.mjs"
TEST_FILE = "test/check-roundtrip-record.test.ts"

VITEST = ["pnpm", "exec", "vitest", "run", "--root", "packages/core"]

PER_INJECTION_TIMEOUT_S = 120

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

EXPECTED_SURVIVORS: dict[str, str] = {}


def rename(text: str, old: str, new: str) -> str:
    """One anchored replacement, asserting the anchor was actually present."""
    if old not in text:
        raise AssertionError(f"anchor not found: {old[:80]!r}")
    return text.replace(old, new, 1)


def strip_ansi(text: str) -> str:
    return ANSI.sub("", text)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_tests() -> tuple[int, str]:
    proc = subprocess.run(
        [*VITEST, TEST_FILE],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=PER_INJECTION_TIMEOUT_S,
    )
    return proc.returncode, strip_ansi(proc.stdout + proc.stderr)


def assert_vitest_is_callable() -> None:
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


MUTATIONS: list[tuple[str, str, str, str]] = [
    ("stop refusing a record with no anchor", "if (typeof record.anchor !== 'string' || record.anchor === '') {", "if (false) {", "refuses a record with no anchor"),
    ("stop refusing a record with no run id", "if (!Number.isInteger(run.id) || run.id <= 0) {", "if (false) {", "refuses a record with no run id"),
    ("stop refusing a record with no commit", "if (typeof run.headSha !== 'string' || !/^[0-9a-f]{7,40}$/.test(run.headSha)) {", "if (false) {", "refuses a record with no commit"),
    ("stop refusing a corpus of no cases", "if (!Number.isInteger(declaredCases) || declaredCases <= 0) {", "if (false) {", "refuses a corpus of no cases"),
    ("stop refusing more cases than the corpus declares", "} else if (!Number.isInteger(roundTripped) || roundTripped < 0 || roundTripped > declaredCases) {", "} else if (false) {", "refuses more round-tripped cases"),
    ("stop refusing an oracle outside (0, 1]", "if (typeof corpus.oracle !== 'number' || corpus.oracle <= 0 || corpus.oracle > 1) {", "if (false) {", "refuses an oracle outside"),
    ("stop refusing a record with no pins", "if (pins.length === 0) {", "if (false) {", "refuses a record with no pins"),
    ("stop refusing a pin that is not a digest", "if (!/^[0-9a-f]{64}$/.test(String(pin.sha256))) {", "if (false) {", "refuses a pin that is not a digest"),
    ("stop refusing a pin for an unlisted asset", "if (asset === undefined) {", "if (false) {", "refuses a pin for an asset the registry does not list"),
    ("stop refusing a pin the registry denies", "if (asset.sha256 !== pin.sha256 || asset.bytes !== pin.bytes) {", "if (false) {", "refuses a pin whose bytes or digest the registry denies"),
    ("stop refusing a record that omits a pinned asset", "if (!pins.some((pin) => pin.id === asset.id)) {", "if (false) {", "refuses a record that omits an asset"),
    ("stop refusing a document with no section", "if (published === null) {", "if (false) {", "refuses a document with no such section"),
    ("stop comparing the document's anchor", "if (published.anchor !== record.anchor) {", "if (false) {", "refuses a document that publishes another anchor"),
    ("stop comparing the document's declared cases", "if (published.declaredCases !== declaredCases) {", "if (false) {", "refuses a document whose declared case count"),
    ("stop comparing the document's pass count", "if (published.roundTripped !== roundTripped) {", "if (false) {", "refuses the document that stood at 253 of 375"),
    ("stop comparing the document's failure count", "if (published.failed !== failed) {", "if (false) {", "refuses a document whose failure count"),
    ("stop requiring the score block to name its source", "if (typeof scores.source !== 'string' || scores.source === '') {", "if (false) {", "does not say where its numbers came from"),
    ("stop checking that the score records cover the declared set", "if (!Number.isInteger(scores.scored) || partition !== declaredCases) {", "if (false) {", "records do not cover the declared set"),
    ("stop checking that scored agrees with round-tripped", "if (scores.scored !== roundTripped) {", "if (false) {", "disagrees with the round-tripped count"),
    ("stop checking the distribution against the scored count", "if (Object.keys(distribution).length > 0 && distributionTotal !== scores.scored) {", "if (false) {", "does not account for the scored cases"),
    ("stop checking that the mean lies inside the range", "if (!(oracle.min <= oracle.mean && oracle.mean <= oracle.max)) {", "if (false) {", "mean outside the range"),
    ("stop checking that the mean is the distribution's mean", "if (Math.abs(weighted - oracle.mean) > 1e-9) {", "if (false) {", "not the distribution"),
    ("stop refusing a zero minimum when nothing was scored", "if (oracle[field] !== null) {", "if (false) {", "zero minimum when nothing was scored"),
    ("stop comparing the document's mean", "if (published.meanOracle !== Number(oracle.mean.toFixed(2))) {", "if (false) {", "mean disagrees with the record"),
    (
        "scope the document by any line rather than by the heading",
        "    (line) => line.startsWith('#') && line.toLowerCase().includes(SECTION),",
        "    (line) => line.toLowerCase().includes(SECTION),",
        "passes against the shipped record",
    ),
]


def main() -> int:
    started = time.monotonic()
    assert_vitest_is_callable()
    path = REPO / GUARD
    original = path.read_text()
    before = digest(path)

    results: list[tuple[str, str, str]] = []
    try:
        for name, anchor, replacement, expected in MUTATIONS:
            try:
                mutated = rename(original, anchor, replacement)
            except AssertionError as exc:
                results.append((name, "INERT", str(exc)))
                continue

            path.write_text(mutated)
            try:
                code, out = run_tests()
            except subprocess.TimeoutExpired:
                results.append((name, "TIMEOUT", f">{PER_INJECTION_TIMEOUT_S}s"))
                continue
            finally:
                path.write_text(original)

            current = path.read_text(encoding="utf-8")
            restored = current == original and digest(path) == before
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
        path.write_text(original)

    current = path.read_text(encoding="utf-8")
    restored = current == original and digest(path) == before
    if not restored:
        print("the guard is not back to its committed bytes; do not trust this run")
        return 2

    width = max(len(name) for name, _, _ in results)
    caught = survived = inert = misattributed = 0
    failed = False
    for name, verdict, detail in results:
        marker = "ok  " if verdict == "CAUGHT" else "FAIL"
        print(f"{marker}  {name.ljust(width)}  {verdict:14}  {detail[:60]}")
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
        f"\nroundtrip-record: {caught} caught, {survived} survived, {inert} inert, "
        f"{misattributed} misattributed, {len(MUTATIONS)} injection(s) in {time.monotonic() - started:.0f}s"
    )
    if failed:
        print("every mutation must be caught, or carry a reason in EXPECTED_SURVIVORS")
        return 1
    return 0


def expectations() -> dict[str, tuple[str, ...]]:
    """The witnesses, one per injection, read from the table's own fourth field.

    Derived rather than copied: every row already declares the test it must break,
    and a second table is the thing that goes stale. The reconciliation adds the
    check that the *test file* still contains that title, which is the rename trap
    findings 157 and 163 measured.
    """
    return {name: (expected,) for name, _anchor, _replacement, expected in MUTATIONS}


def verify_expectations(probe: bool = False) -> int:
    """Reconcile the witness table, without mutating anything.

    Until finding 163 this file ignored the flag and ran all twenty-five
    injections instead, each one rewriting a gate script that other tests spawn --
    which is how twenty-five seconds of mutation landed inside somebody else's
    test run.
    """
    return W.verify_witness_table(
        "roundtrip-record",
        expectations(),
        [name for name, *_ in MUTATIONS],
        dict.fromkeys(expectations(), REPO / "packages" / "core" / TEST_FILE),
        (REPO / "packages" / "core" / TEST_FILE).parent,
        "check-roundtrip-record.test.ts",
        survivors=tuple(EXPECTED_SURVIVORS),
        probe=probe,
    )


if __name__ == "__main__":
    if "--verify-expectations" in sys.argv:
        sys.exit(verify_expectations(probe="--probe" in sys.argv))
    sys.exit(main())
