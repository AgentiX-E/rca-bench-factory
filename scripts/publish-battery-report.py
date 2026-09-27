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

Two API calls to read the branch and one to write it. It runs only when the
battery produced a report, which is every run, and it is deliberately tolerant:
a failure to publish is reported and does not change the job's verdict. The
report is a diagnostic channel, and a diagnostic channel that can itself fail the
build is a new source of red -- the mistake finding 86 is about, one level up.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

OWNER = "AgentiX-E"
REPO = "rca-bench-factory"
BRANCH = "ci-reports"
REPORT = "gate-tests-battery-report.json"


def api(method: str, path: str, token: str, body: dict | None = None) -> dict:
    """One REST call against `api.github.com`, returning the decoded JSON."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"https://api.github.com/repos/{OWNER}/{REPO}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read() or b"{}")


def head_summary(report: dict) -> str:
    """The one line a reader sees before opening the JSON."""
    return (
        f"{report.get('caught', 0)} caught, {report.get('survived', 0)} survived, "
        f"{report.get('inert', 0)} inert, {report.get('timed_out', 0)} timed out, "
        f"{report.get('redundant', 0)} redundant (expected); "
        f"{report.get('total_seconds', 0)}s; restore_status={report.get('restore_status')}"
    )


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
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
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
            api("PATCH", f"/git/refs/heads/{BRANCH}", token, {"sha": commit["sha"]})
        else:
            api("POST", "/git/refs", token, {
                "ref": f"refs/heads/{BRANCH}",
                "sha": commit["sha"],
            })
        print(f"published the report to {BRANCH} at {commit['sha'][:9]}")
        print(f"  {message}")
    except (urllib.error.URLError, urllib.error.HTTPError, KeyError, OSError) as exc:
        # Deliberately not fatal. This step is a diagnostic channel; failing the
        # job here would replace the battery's verdict with this one, which is
        # the mistake the battery itself was just repaired for.
        print(f"could not publish the report: {exc}")
        print("the battery's own exit code still carries the verdict")
    return 0


if __name__ == "__main__":
    sys.exit(main())
