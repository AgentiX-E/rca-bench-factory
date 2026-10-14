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
# The second reader. P1-5's second backend arrived in finding 160, and a wire
# reader is where the network facts live -- so it gets the same treatment as the
# first rather than being covered only by its own test file.
JAEGER = "packages/core/src/ingest/jaeger.ts"
JAEGER_TEST = "test/jaeger.test.ts"
# The third reader. It is the one whose registry reason was half wrong -- the wire
# format does put the service in a label the caller chooses, and that turned out to
# be an interface rather than an obstacle -- so it carries the same treatment as the
# other two, and its two unit traps are the mutations below.
LOKI = "packages/core/src/ingest/loki.ts"
LOKI_TEST = "test/loki.test.ts"
# The fourth reader, and the second row whose registry reason was its interface
# (finding 164). Its declaration is three field names plus the timestamp's encoding,
# so the mutations below are about a declaration being ignored rather than about a
# wire format being misread.
ELASTICSEARCH = "packages/core/src/ingest/elasticsearch.ts"
ELASTICSEARCH_TEST = "test/elasticsearch.test.ts"
# The fifth reader, and the third row whose reason was its interface -- with one clause
# that turned out to be unnecessary rather than wrong (finding 165).
KUBERNETES = "packages/core/src/ingest/kubernetes.ts"
KUBERNETES_TEST = "test/kubernetes.test.ts"
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
        "stop reading the service from the trace's process table",
        JAEGER,
        "  return typeof tableName === 'string' && tableName !== '' ? tableName : undefined;",
        "  return undefined;",
        JAEGER_TEST,
        "reads the service from the process table when the span does not carry it",
    ),
    (
        "keep microseconds instead of converting to milliseconds",
        JAEGER,
        "        durationMs: duration / 1000,",
        "        durationMs: duration,",
        JAEGER_TEST,
        "maps a trace to one signal per span, with the wire facts and nothing guessed",
    ),
    (
        "stop treating null data with errors as a failed query",
        JAEGER,
        "  if (traces === null || traces === undefined) {",
        "  if (false) {",
        JAEGER_TEST,
        "treats null data with errors as a failed query, not as an empty window",
    ),
    (
        "default an unstated span status to OK",
        JAEGER,
        "  if (otel === 'ERROR' || otel === 'OK' || otel === 'UNSET') return otel;\n  return undefined;",
        "  if (otel === 'ERROR' || otel === 'OK' || otel === 'UNSET') return otel;\n  return 'OK';",
        JAEGER_TEST,
        "leaves the status absent when the backend did not state one",
    ),
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
        "fails on a query error carried in the body of an HTTP 200",
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
    (
        "read the nanosecond timestamp through a float",
        LOKI,
        "  return Number(BigInt(raw) / NANOS_PER_MILLI);",
        "  return Math.floor(Number(raw) / 1_000_000);",
        LOKI_TEST,
        "goes through the integer rather than a float, and the two disagree on a real timestamp",
    ),
    (
        "read the nanosecond timestamp as milliseconds",
        LOKI,
        "  return Number(BigInt(raw) / NANOS_PER_MILLI);",
        "  return Number(raw);",
        LOKI_TEST,
        "reads a 19-digit nanosecond timestamp as nanoseconds, which is the trap this module exists for",
    ),
    (
        "round the timestamp up to the next millisecond",
        LOKI,
        "  return Number(BigInt(raw) / NANOS_PER_MILLI);",
        "  return Math.round(Number(BigInt(raw)) / 1_000_000);",
        LOKI_TEST,
        "goes through the integer rather than a float, and the two disagree on a real timestamp",
    ),
    (
        "accept a timestamp that is not decimal nanoseconds",
        LOKI,
        "  if (typeof raw !== 'string' || !/^\\d+$/.test(raw)) return undefined;",
        "  if (typeof raw !== 'string') return undefined;",
        LOKI_TEST,
        "quarantines a line whose timestamp is not decimal nanoseconds",
    ),
    (
        "stop sending the caller's direction",
        LOKI,
        "  url.searchParams.set('direction', direction);",
        "  url.searchParams.set('direction', 'forward');",
        LOKI_TEST,
        "asks the range endpoint for the window, in nanoseconds, honouring the limit and direction it was given",
    ),
    (
        "send the window in seconds rather than nanoseconds",
        LOKI,
        "  url.searchParams.set('start', start.toString());",
        "  url.searchParams.set('start', String(Number(start) / 1_000_000_000));",
        LOKI_TEST,
        "asks the range endpoint for the window, in nanoseconds, honouring the limit and direction it was given",
    ),
    (
        "stop requiring the caller to name the service label",
        LOKI,
        "  if (serviceLabel === '') {",
        "  if (false) {",
        LOKI_TEST,
        "refuses a pull that names no service label at all",
    ),
    (
        "attach a stream's lines to a service that was never reported",
        LOKI,
        "    const serviceName = labels[serviceLabel];\n    if (typeof serviceName !== 'string' || serviceName === '') {",
        "    const serviceName = labels[serviceLabel] || 'unknown-service';\n    if (false) {",
        LOKI_TEST,
        "quarantines a stream that carries no service label, rather than attaching its lines to another stream",
    ),
    (
        "read the third element of an entry as if it were the pair",
        LOKI,
        "      if (!Array.isArray(rawEntry) || rawEntry.length !== 2) {",
        "      if (!Array.isArray(rawEntry) || rawEntry.length < 2) {",
        LOKI_TEST,
        "quarantines a line that is not a [timestamp, line] pair, naming what the extra element would be",
    ),
    (
        "read a LogQL metric query as if it were a log stream",
        LOKI,
        "  if (resultType !== 'streams') {",
        "  if (false) {",
        LOKI_TEST,
        "fails on a range query that answers with a matrix, which is a LogQL metric query",
    ),
    (
        "read a query error in an HTTP 200 as an empty window",
        LOKI,
        "  if (envelope['status'] !== 'success') {",
        "  if (false) {",
        LOKI_TEST,
        "fails on a query error carried in the body of an HTTP 200",
    ),
    (
        "accept a body with no status field",
        LOKI,
        "  if (envelope === undefined || typeof envelope['status'] !== 'string') {",
        "  if (false) {",
        LOKI_TEST,
        "reports an envelope with no status field",
    ),
    (
        "declare the third pull path unsupported while keeping its entry",
        REGISTRY,
        "    id: 'loki',\n    status: 'implemented',",
        "    id: 'loki',\n    status: 'unsupported',\n    reason: 'this backend was flipped by a mutation, and the reason is long enough to pass the length rule',",
        REGISTRY_TEST,
        "holds the committed snapshot equal to the registry it is derived from",
    ),
    (
        "stop naming the format the window is parsed with",
        ELASTICSEARCH,
        "    format: 'strict_date_optional_time',",
        "    format: 'epoch_millis',",
        ELASTICSEARCH_TEST,
        "asks the search endpoint for the window, the size and the sort the caller declared",
    ),
    (
        "send the window in seconds rather than in the declared encoding",
        ELASTICSEARCH,
        "    gte: new Date(start).toISOString(),\n    lte: new Date(end).toISOString(),",
        "    gte: start,\n    lte: end,",
        ELASTICSEARCH_TEST,
        "asks the search endpoint for the window, the size and the sort the caller declared",
    ),
    (
        "sniff the timestamp's JSON type instead of reading the declared encoding",
        ELASTICSEARCH,
        "  if (format === 'epoch_millis') {\n    if (typeof raw === 'number' && Number.isInteger(raw)) return raw;",
        "  if (typeof raw === 'number' && Number.isInteger(raw)) return raw;\n  if (false) {",
        ELASTICSEARCH_TEST,
        "quarantines the other serialisation rather than reading it as the declared one",
    ),
    (
        "read an unparsed timestamp as the epoch",
        ELASTICSEARCH,
        "    if (typeof raw === 'number' && Number.isInteger(raw)) return raw;",
        "    if (raw !== undefined && raw !== null) return Number(raw) || 0;",
        ELASTICSEARCH_TEST,
        "quarantines the other serialisation rather than reading it as the declared one",
    ),
    (
        "attach a hit to a service that was never reported",
        ELASTICSEARCH,
        "    const serviceName = source[fields.service];\n    if (typeof serviceName !== 'string' || serviceName === '') {",
        "    const serviceName = source[fields.service] || 'unknown-service';\n    if (false) {",
        ELASTICSEARCH_TEST,
        "quarantines a hit whose declared service field is missing or empty, per hit",
    ),
    (
        "record the whole document as the message",
        ELASTICSEARCH,
        "    const message = source[fields.message];",
        "    const message = JSON.stringify(source);",
        ELASTICSEARCH_TEST,
        "maps a hit to one signal per hit, with the declared fields and nothing guessed",
    ),
    (
        "drop the offset that says which clock the hit came from",
        ELASTICSEARCH,
        "      rawOffsetMinutes: 0,\n",
        "",
        ELASTICSEARCH_TEST,
        "maps a hit to one signal per hit, with the declared fields and nothing guessed",
    ),
    (
        "report a partial answer as a complete one",
        ELASTICSEARCH,
        "    timedOut: envelope['timed_out'] === true,\n    failedShards: typeof failed === 'number' && failed > 0 ? failed : 0,",
        "    timedOut: false,\n    failedShards: 0,",
        ELASTICSEARCH_TEST,
        "says so when the answer is partial, both ways Elasticsearch says it",
    ),
    (
        "read an approximate total as an exact one",
        ELASTICSEARCH,
        "  return { value, relation: typeof relation === 'string' ? relation : 'unknown' };",
        "  return { value, relation: 'eq' };",
        ELASTICSEARCH_TEST,
        "reports the total the cluster gave, with the relation that makes it readable",
    ),
    (
        "read an error carried in a body as an empty window",
        ELASTICSEARCH,
        "  if (envelope['error'] !== undefined) {",
        "  if (false) {",
        ELASTICSEARCH_TEST,
        "fails on the error object Elasticsearch wraps in a 200 body",
    ),
    (
        "default the index to every index in the cluster",
        ELASTICSEARCH,
        "  if (index === '') {",
        "  if (false) {",
        ELASTICSEARCH_TEST,
        "refuses an index it would have to default",
    ),
    (
        "declare the fourth pull path unsupported while keeping its entry",
        REGISTRY,
        "    id: 'elasticsearch',\n    status: 'implemented',",
        "    id: 'elasticsearch',\n    status: 'unsupported',\n    reason: 'this backend was flipped by a mutation, and the reason is long enough to pass the length rule',",
        REGISTRY_TEST,
        "holds the committed snapshot equal to the registry it is derived from",
    ),
    (
        "reach the API with no credentials",
        KUBERNETES,
        "      headers: { accept: 'application/json', authorization: `Bearer ${token}` },",
        "      headers: { accept: 'application/json' },",
        KUBERNETES_TEST,
        "asks the namespaced list endpoint for the page, with the token the caller supplied",
    ),
    (
        "ignore the namespace and read the cluster-wide list",
        KUBERNETES,
        "      (namespace === undefined\n        ? KUBERNETES_EVENTS_PATH\n        : `/api/v1/namespaces/${encodeURIComponent(namespace)}/events`),",
        "      KUBERNETES_EVENTS_PATH,",
        KUBERNETES_TEST,
        "asks the namespaced list endpoint for the page, with the token the caller supplied",
    ),
    (
        "read a Status as an empty window",
        KUBERNETES,
        "  if (envelope['kind'] !== 'EventList') {",
        "  if (false) {",
        KUBERNETES_TEST,
        "fails on a Status where a list was expected, which is how the API answers a refusal",
    ),
    (
        "read a missing resource version as no version at all",
        KUBERNETES,
        "  if (typeof resourceVersion !== 'string' || resourceVersion === '') {",
        "  if (false) {",
        KUBERNETES_TEST,
        "fails on a list that carries no resource version, which is how a caller resumes",
    ),
    (
        "read an unparseable timestamp as the epoch",
        KUBERNETES,
        "  const ms = Date.parse(raw);\n  if (Number.isNaN(ms)) {\n    return `event's declared timestamp field '${field}' is not a date this module can read: ${JSON.stringify(raw)}`;\n  }\n  return ms;",
        "  const ms = Date.parse(raw);\n  return Number.isNaN(ms) ? 0 : ms;",
        KUBERNETES_TEST,
        "quarantines an event whose declared timestamp is not an RFC-3339 time",
    ),
    (
        "attach an event to a service the caller never named",
        KUBERNETES,
        "  if (service === '') {",
        "  if (false) {",
        KUBERNETES_TEST,
        "refuses a pull that names no service, because the API does not name one either",
    ),
    (
        "reach an unauthenticated endpoint when no token was supplied",
        KUBERNETES,
        "  if (token === '') {",
        "  if (false) {",
        KUBERNETES_TEST,
        "refuses a pull with no token, rather than reaching an unauthenticated endpoint",
    ),
    (
        "ask for every matching event in the cluster",
        KUBERNETES,
        "  if (!Number.isInteger(limit) || limit <= 0) {",
        "  if (false) {",
        KUBERNETES_TEST,
        "refuses a limit that is not a positive integer, because the alternative is unbounded",
    ),
    (
        "represent a type the IR does not carry",
        KUBERNETES,
        "    if (rawType !== undefined && rawType !== 'Normal' && rawType !== 'Warning') {",
        "    if (false) {",
        KUBERNETES_TEST,
        "keeps the two types the IR carries and quarantines a third",
    ),
    (
        "read an absent count as one occurrence",
        KUBERNETES,
        "      ...(rawCount !== undefined ? { count: rawCount } : {}),",
        "      count: rawCount ?? 1,",
        KUBERNETES_TEST,
        "keeps an absent count as absent, which is not the same as one occurrence",
    ),
    (
        "drop the involved object from the payload",
        KUBERNETES,
        "      involvedObject: { kind, name },\n",
        "",
        KUBERNETES_TEST,
        "maps an event to a signal whose payload is the vocabulary the IR already has",
    ),
    (
        "classify the event's change type from its reason string",
        KUBERNETES,
        "      involvedObject: { kind, name },\n",
        "      involvedObject: { kind, name },\n      changeType: reason === 'ScalingReplicaSet' ? 'deploy' : undefined,\n",
        KUBERNETES_TEST,
        "never sets a change type, which the API has no field for",
    ),
    (
        "stop counting the events a declared window excluded",
        KUBERNETES,
        "        outsideWindow += 1;",
        "        outsideWindow += 0;",
        KUBERNETES_TEST,
        "counts the events a declared window excluded, so the exclusion is visible",
    ),
    (
        "report a page with a continuation as the last one",
        KUBERNETES,
        "      hasMore: typeof continuation === 'string' && continuation !== '',",
        "      hasMore: false,",
        KUBERNETES_TEST,
        "reports the page the caller got rather than pretending it is the window",
    ),
    (
        "declare the fifth pull path unsupported while keeping its entry",
        REGISTRY,
        "    id: 'kubernetes',\n    status: 'implemented',",
        "    id: 'kubernetes',\n    status: 'unsupported',\n    reason: 'this backend was flipped by a mutation, and the reason is long enough to pass the length rule',",
        REGISTRY_TEST,
        "holds the committed snapshot equal to the registry it is derived from",
    ),
]

# Test files that must be restored as well: none of the subjects above live in
# one, but a mutation whose anchor is missing must not leave a half-written file
# behind, so every write is paired with a read-back below.


def verify_expectations(probe: bool = False) -> int:
    """Check that every injection names a test that exists in the file it runs.

    ## Why this is a separate mode rather than a comment

    Each entry's last field is the test that must go red, written as a string in
    this table. Renaming a test leaves that string stale **silently**: the battery
    still runs, and a stale name turns a CAUGHT into a MISATTRIBUTED. That is not
    hypothetical -- it happened on the runner in this round. The test name
    `fails on a query error carried inside an HTTP 200` was reworded while fixing a
    comment, the battery was not re-run before pushing, and CI reported
    `14 caught, 0 survived, 0 inert, 1 misattributed`. The local run had been green
    because it predated the rename.

    So the reconciliation is a mode, and a test drives it. `probe` is a negative
    control on the *comparator* rather than on the data: it additionally requires a
    name that cannot exist to be reported missing, which is what makes the check
    discriminating rather than merely quiet.
    """
    cache: dict[str, str] = {}
    missing: list[str] = []
    for name, _target, _anchor, _replacement, test_file, expected in MUTATIONS:
        if test_file not in cache:
            cache[test_file] = (REPO / "packages/core" / test_file).read_text()
        if expected not in cache[test_file]:
            missing.append(f"{name}: {expected!r} is not in {test_file}")

    if probe:
        impossible = "this test name cannot exist"
        if impossible in cache.get(GATE_TEST, ""):
            missing.append("the negative control's name exists, so the comparison proves nothing")

    for line in missing:
        print(f"backend-support: {line}")
    verdict = "FAILED" if missing else "OK"
    print(
        f"backend-support: {verdict} ({len(MUTATIONS)} expectation(s)"
        + (", with the comparator probed)" if probe else ")")
    )
    return 1 if missing else 0


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
    if "--verify-expectations" in sys.argv:
        sys.exit(verify_expectations(probe="--probe" in sys.argv))
    sys.exit(main())
