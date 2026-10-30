#!/usr/bin/env python3
"""Publish the gate-test battery's report to a branch, so it can be read from anywhere.

## Why this exists

The battery's report was written as a file and uploaded with
`actions/upload-artifact`. That step works -- the artifact is listed through
`GET /actions/runs/{id}/artifacts` -- but **downloading it does not**: the `zip`
endpoint 302s to `productionresultssa*.blob.core.windows.net`, and the proxy this
project develops behind refuses the connection (`http=000`). So the artifact
proves the report was produced and still cannot be read.

This is the third channel tried, and the pattern in the first two is the same:
the *metadata* is reachable through `api.github.com` and the *content* is not.

| channel | metadata | content |
| --- | --- | --- |
| job log | n/a | blocked (finding 55) |
| artifact | listed | blocked (`blob.core.windows.net`) |
| check-run output | empty without `checks:write` | n/a |
| **git object** | reachable | **reachable** |

Git objects are the one channel that is both. A commit's content is served by
`api.github.com` itself -- `GET /repos/{o}/{r}/contents/{path}?ref={branch}`
returns the bytes base64-encoded in the response -- so a report committed to a
branch is readable wherever the API is, which is everywhere this project works.

## What it writes

One commit per run on an orphan `ci-reports` branch, containing
`gate-tests-battery-report.json` and a one-line `HEAD` summary. The branch is not
`master`: it is CI output, it must never be merged, and keeping it separate means
the report can never be mistaken for reviewed source.

## Cost, and why the step is `if: always()`

Six API calls to read the branch and to write it. It runs only when the battery
produced a report, which is every run.

## Why a failed publish *does* fail the step

The first version of this script caught every error, printed it, and returned 0,
on the reasoning that a diagnostic channel must not manufacture the failure it
was added to explain. That reasoning was sound and the code was wrong, and the
observed consequence names why: the workflow's `GITHUB_TOKEN` was scoped
`contents: read`, so the publish answered 403, the handler printed
`could not publish the report: ...`, and **the step reported success while
publishing nothing**. A green step that produced no readable artifact is exactly
the failure this whole sequence has been about -- a channel that reports success
while carrying no content -- and returning 0 is what let it stay invisible.

So the exit codes are now three-valued, and the distinction is the point:

| outcome | exit | why |
| --- | --- | --- |
| published | 0 | the channel worked |
| nothing to publish | 0 | no report and no token are both real reasons to do nothing |
| **publish attempted and failed** | **1** | this is not a verdict about the battery, it is a broken channel |

Failing here cannot change the battery's verdict, because it cannot make the
battery pass: the battery step has already run and its exit code is already
recorded. What it can do is stop a broken channel from looking like a working
one, which is the only thing it should ever have been trusted to do.

## Why one 500 is not a verdict

CI run 41067634391 failed on `234fef4b0` after every battery had passed, with:

    could not publish the report: HTTP Error 500: Internal Server Error

Two defects in that one line, and the second is why the first needed a probe:

 1. **The call is not named.** `HTTP Error 500` states what the answer was and
    not which of the six requests received it. Recovering the path took replaying
    the calls against the real API by hand, one at a time: it was `POST
    /git/blobs`, which answered `500` with an empty body.
 2. **A single 500 failed the job, and 500 is the class a retry can fix.** The
    same bytes, posted from another machine twenty minutes later: `201` six times
    out of six in base64, and six of six in utf-8. The report was publishable the
    whole time; what was not survivable was one transient answer.

The discriminator is not invented here. `scripts/fetch-official.mjs` already
states it for the only other outbound channel in this repository: a 4xx is "no
amount of retrying will change that", a 5xx is "the one class a retry can
legitimately fix". This channel never learned it.

What the retry must therefore not do is turn a broken channel green: attempts are
bounded (`RCA_BENCH_PUBLISH_ATTEMPTS`, default 4), a 4xx is never retried, and
exhausting the attempts still exits 1 **with the call named**. The retries that
were needed are printed, so a publish that only worked on its third attempt is
visible rather than silent.

Retrying is safe here for a reason particular to git objects: blobs and trees are
content-addressed, so repeating them returns the same id; setting a ref to the
same commit twice is a no-op. A retried `POST /git/commits` can at worst leave a
second, unreferenced commit carrying the same tree -- which is why the retry is
bounded rather than open-ended. And because an attempt that answered 500 may have
*succeeded*, creating the branch a second time is answered `422`, which is
accepted only when the branch now points at the commit just built.

`RCA_BENCH_PUBLISH_API` moves the root away from `api.github.com`. It exists so
the suite can point this script at a loopback server and observe a real `500`,
which is the only way to exercise the retry branch without a mocking library
(`check-no-mock`). It changes where the calls go; it never changes what counts as
a failure.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

OWNER = "AgentiX-E"
REPO = "rca-bench-factory"
BRANCH = "ci-reports"
REPORT = "gate-tests-battery-report.json"

API_ROOT = os.environ.get("RCA_BENCH_PUBLISH_API") or "https://api.github.com"


def setting(name: str, default, cast):
    """One number from the environment, or its default, or a named refusal.

    A malformed value is the operator's mistake to fix, so it is reported with the
    variable named rather than as an uncaught `ValueError` whose traceback ends in
    this file -- the same shape `fetch-official.mjs` uses for its own budget.
    """
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return cast(raw)
    except ValueError:
        raise SystemExit(f"{name}={raw!r} is not a {cast.__name__}") from None


ATTEMPTS = max(1, setting("RCA_BENCH_PUBLISH_ATTEMPTS", 4, int))
BACKOFF = max(0.0, setting("RCA_BENCH_PUBLISH_BACKOFF", 1.0, float))

# Every attempt that had to be repeated, in order. Printed on success as well as
# carried into the failure: an endpoint that needed three attempts is a fact about
# the endpoint, and a channel that hides it reports a health it did not measure.
RETRIES: list[str] = []


class ChannelFailure(Exception):
    """One call that could not be completed, for a reason the caller can read.

    The message names the method, the path, the answer and the number of attempts,
    because the CI failure that produced this class named none of them: a reader
    of `HTTP Error 500` cannot tell which of the six requests answered.
    """

    def __init__(self, method: str, path: str, attempts: int, detail: str, status: int | None = None):
        self.method = method
        self.path = path
        self.attempts = attempts
        self.detail = detail
        self.status = status

    def __str__(self) -> str:
        plural = "" if self.attempts == 1 else "s"
        return f"{self.method} {self.path} -> {self.detail} after {self.attempts} attempt{plural}"


def retryable(status: int | None) -> bool:
    """Whether one more attempt could produce a different answer.

    A 4xx is the server's considered reply about this request -- a bad token, a
    scope that does not allow the write, a ref that is not fast-forward -- and
    repeating it changes nothing. A 5xx, and a transport failure (which has no
    status at all because no answer arrived), are the class a retry can fix.
    """
    if status is None:
        return True
    return status >= 500


def api(method: str, path: str, token: str, body: dict | None = None) -> dict:
    """One REST call against the API root, retried when a retry can help.

    One loop, one decision. The first version had a `retryable` test on the answered
    branch and an unconditional retry on the transport branch, which made
    `retryable(None)` unreachable -- and a mutation that refused to retry a closed
    connection survived the whole suite, because no input could reach the arm. Both
    outcomes now arrive at the same line, so the discriminator has one home and no
    caller can hold a second copy of it.
    """
    data = json.dumps(body).encode() if body is not None else None
    attempt = 0
    while True:
        attempt += 1
        req = urllib.request.Request(
            f"{API_ROOT}/repos/{OWNER}/{REPO}{path}",
            data=data,
            method=method,
            headers={
                "Authorization": f"token {token}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            reason = (error.reason or "").strip()
            detail = f"HTTP {error.code}{' ' + reason if reason else ''}"
            last = ChannelFailure(method, path, attempt, detail, status=error.code)
        except (urllib.error.URLError, OSError) as error:
            # No status arrived, so the request's fate is unknown rather than
            # refused: `URLError` covers DNS and connection failures, a bare
            # `OSError` a socket that closed mid-answer.
            last = ChannelFailure(method, path, attempt, f"a transport failure: {error}")
        if not retryable(last.status) or attempt >= ATTEMPTS:
            raise last from None
        RETRIES.append(f"{method} {path} -> {last.detail} on attempt {attempt} of {ATTEMPTS}")
        time.sleep(BACKOFF * (2 ** (attempt - 1)))


def head_summary(report: dict) -> str:
    """The one line a reader sees before opening the JSON."""
    return (
        f"{report.get('caught', 0)} caught, {report.get('survived', 0)} survived, "
        f"{report.get('inert', 0)} inert, {report.get('timed_out', 0)} timed out, "
        f"{report.get('redundant', 0)} redundant (expected); "
        f"{report.get('total_seconds', 0)}s; restore_status={report.get('restore_status')}"
    )


def create_branch(token: str, commit_sha: str) -> None:
    """Point `ci-reports` at this commit, creating it on the first publish.

    A 422 here is the retry meeting its own earlier attempt: a `POST /git/refs`
    that answered 500 may have created the ref anyway, so the repeat is answered
    "Reference already exists" -- about the very ref the previous attempt made.
    Reported as a failure, that would let the retry convert a success into a red
    step, which is worse than not retrying. It is accepted only when the branch now
    points at the commit just built, so a genuinely stale branch still fails.
    """
    try:
        api("POST", "/git/refs", token, {"ref": f"refs/heads/{BRANCH}", "sha": commit_sha})
    except ChannelFailure as error:
        if error.status != 422:
            raise
        now = api("GET", f"/git/ref/heads/{BRANCH}", token)["object"]["sha"]
        if now != commit_sha:
            raise ChannelFailure(
                "POST",
                "/git/refs",
                error.attempts,
                f"the branch already exists at {now[:9]}, not at the built commit {commit_sha[:9]}",
                status=422,
            ) from None


def main() -> int:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
    if not token:
        print("no GITHUB_TOKEN, so the report cannot be published; skipping")
        return 0

    path = Path(REPORT)
    if not path.exists():
        print(f"{REPORT} was not produced, so there is nothing to publish")
        return 0

    report = json.loads(path.read_text())
    summary = head_summary(report)
    sha = os.environ.get("GITHUB_SHA", "unknown")
    run = os.environ.get("GITHUB_RUN_ID", "unknown")
    message = f"gate-test battery, run {run} on {sha[:9]}: {summary}"

    try:
        # The branch is created on the first publish and appended to afterwards.
        # A 404 means it does not exist yet, which is not an error.
        tip = ""
        try:
            tip = api("GET", f"/git/ref/heads/{BRANCH}", token)["object"]["sha"]
        except ChannelFailure as exc:
            if exc.status != 404:
                raise

        blob = api("POST", "/git/blobs", token, {
            "content": base64.b64encode(path.read_bytes()).decode(),
            "encoding": "base64",
        })
        summary_blob = api("POST", "/git/blobs", token, {
            "content": base64.b64encode((message + "\n").encode()).decode(),
            "encoding": "base64",
        })
        tree = api("POST", "/git/trees", token, {
            "tree": [
                {"path": REPORT, "mode": "100644", "type": "blob", "sha": blob["sha"]},
                {"path": "HEAD", "mode": "100644", "type": "blob", "sha": summary_blob["sha"]},
            ]
        })
        commit = api("POST", "/git/commits", token, {
            "message": message,
            "tree": tree["sha"],
            "parents": [tip] if tip else [],
        })
        if tip:
            # Idempotent: setting a ref to the same commit twice is a no-op, so a
            # retry cannot move it somewhere the first attempt did not.
            api("PATCH", f"/git/refs/heads/{BRANCH}", token, {"sha": commit["sha"]})
        else:
            create_branch(token, commit["sha"])
        if RETRIES:
            print(f"note: {len(RETRIES)} retr{'y' if len(RETRIES) == 1 else 'ies'} before the channel answered:")
            for line in RETRIES:
                print(f"  {line}")
        print(f"published the report to {BRANCH} at {commit['sha'][:9]}")
        print(f"  {message}")
    except (ChannelFailure, KeyError, OSError) as exc:
        # Not swallowed. The battery's verdict is already recorded -- the battery
        # step has run and its exit code cannot be changed from here -- so failing
        # now cannot flatter the battery. What it can do is stop a broken channel
        # from reporting success, which is the failure finding 86 is about.
        print(f"could not publish the report: {exc}")
        if RETRIES:
            print(f"  {len(RETRIES)} retr{'y' if len(RETRIES) == 1 else 'ies'} were attempted:")
            for line in RETRIES:
                print(f"    {line}")
        print("the battery's own verdict is unaffected; this step reports that its")
        print("channel is broken, which is a different thing and must not look green")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
