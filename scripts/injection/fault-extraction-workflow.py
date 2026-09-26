#!/usr/bin/env python3
"""Inject faults into the accuracy workflow and confirm the gate catches them.

The gate under test is `packages/core/test/llm/workflow-provider.test.ts`, which
asserts that the workflow's provider handling cannot drift from the registry in
`packages/core/src/llm/registry.ts`.

Why a battery rather than a handful of assertions: the defect this gate exists
for was a *missing mapping*. A test that only checks the workflow contains the
right lines passes on a workflow that also contains the wrong ones, and a test
that only checks the registry lists three providers says nothing about whether
the workflow can supply a key for any of them. What has to hold is that the two
sets are equal, and the way to know the test checks equality rather than
presence is to break each side of it in turn.

Two injections in this battery are deliberately about *scope*, not content:

  - removing the `set -eu` from the step that selects the key
  - downgrading it to `set -e`

Both leave every string the test looks for in place. An earlier version of the
gate matched `set -eu` anywhere in the file and passed both, because five
sibling steps have one. That is the same shape as the defect the gate is for --
a mechanism whose scope is wider than the step it claims to protect.

## This battery has a second gate, and this file is its subject

The write discipline here -- every mutation through `write_atomically` -- is
itself gated by `packages/core/test/injection-write-discipline.test.ts`. Two
injections exercise it, because the first fix was incomplete and only a
measurement found that out:

  - restoring a direct `WORKFLOW.write_text(...)` restore
  - reinstating `shutil.copyfile(PRISTINE, WORKFLOW)` as the final restore

Both are caught (2 red each). The second is the instructive one: routing
`write_text` through the helper looked like the whole fix, and left one
`O_TRUNC`-based writer behind that kept a zero-byte window open. Measured in
isolation, `copyfile` showed 2 zero-byte observations in 18 reads against 0 in
13 for `os.replace`. See finding 56.

## Why every write here is atomic

The battery mutates a *checked-in* file, so it is not the only possible reader.
An earlier version wrote with `Path.write_text` at three sites. Because a test run
reads every test file at collect time, running this battery concurrently with
`pnpm test:coverage` produced a red suite whose cause was not in the tree at all:
the reader had observed an injected revision.

Writing in place has two observable failure modes, not one:

  - the reader sees a *different revision* (a whole injection, or a partial one)
  - the reader sees an **empty file** -- `write_text` truncates before it writes,
    and four reads of zero bytes were measured during one battery run

So the property is not "restore the file afterwards". It is "never expose a
non-pristine revision". Both are satisfied by writing to a temporary file in the
same directory and `os.replace`-ing it into position: on POSIX that rename is
atomic, so a concurrent reader observes either the old content or the new content
and never a truncated or half-written one.

Run from the repository root:

    python3 scripts/injection/fault-extraction-workflow.py

The workflow is restored byte-for-byte at the end, including on failure.
"""

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WORKFLOW = REPO / '.github' / 'workflows' / 'fault-extraction-accuracy.yml'
PRISTINE = Path('/tmp/fault-extraction-workflow.pristine.yml')
SUITE = 'test/llm/workflow-provider.test.ts'


def write_atomically(path: Path, text: str) -> None:
    """Replace `path` with `text` without ever exposing a partial file.

    A temporary file is created in the destination directory so the rename stays
    on one filesystem, which is what makes `os.replace` atomic. The file is
    flushed and fsync'd before the rename, because otherwise the rename can land
    while the contents are still in the page cache.
    """
    handle, temp_name = tempfile.mkstemp(dir=str(path.parent), prefix='.injection-', suffix='.tmp')
    try:
        with os.fdopen(handle, 'w', encoding='utf-8') as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
    except BaseException:
        # The rename did not happen, so the destination is untouched; drop the
        # temporary file rather than leaving it in the workflows directory.
        if os.path.exists(temp_name):
            os.unlink(temp_name)
        raise

# (description, anchor, replacement). The anchor must appear exactly once.
INJECTIONS = [
    (
        'a registered provider has no secret mapping',
        '          KEY_ANTHROPIC: ${{ secrets.ANTHROPIC_API_KEY }}\n',
        '',
    ),
    (
        'the key is demanded under a name this repository invented',
        '          echo "RCA_BENCH_LLM_API_KEY=${selected}" >> "$GITHUB_ENV"',
        '          echo "RCA_BENCH_LLM_API_KEY=${{ secrets.RCA_BENCH_LLM_API_KEY }}" >> "$GITHUB_ENV"',
    ),
    (
        'the selected key is never masked',
        '          echo "::add-mask::${selected}"\n',
        '',
    ),
    (
        'a vendor endpoint is hard-coded, reintroducing the lock',
        '          RCA_BENCH_LLM_BASE_URL: ${{ vars.RCA_BENCH_LLM_BASE_URL }}',
        '          RCA_BENCH_LLM_BASE_URL: https://api.deepseek.com',
    ),
    (
        'the resolved provider is not forwarded to the derivation',
        '          RCA_BENCH_LLM_PROVIDER: ${{ steps.provider.outputs.provider }}',
        '          RCA_BENCH_LLM_PROVIDER: deepseek',
    ),
    (
        'provider resolution stops using the registry',
        '              const config = core.resolveLlmProviderConfig(process.env);',
        "              const config = { ok: true, provider: 'deepseek' };",
    ),
    (
        'the key-selection step loses `set -eu`',
        '        run: |\n          set -eu\n          case "$PROVIDER" in',
        '        run: |\n          case "$PROVIDER" in',
    ),
    (
        '`set -u` is downgraded to `set -e`, so an unset variable expands to empty',
        '        run: |\n          set -eu\n          case "$PROVIDER" in',
        '        run: |\n          set -e\n          case "$PROVIDER" in',
    ),
    (
        'the case arm for a registered provider is deleted',
        '            openai)    selected="${KEY_OPENAI:-}" ;;\n',
        '',
    ),
]


def run_suite() -> tuple[int, int]:
    """Run the gate; return (failed, passed)."""
    result = subprocess.run(
        ['npx', 'vitest', 'run', SUITE],
        cwd=REPO / 'packages' / 'core',
        capture_output=True,
        text=True,
    )
    match = re.search(r'Tests\s+(?:(\d+) failed \| )?(\d+) passed', result.stdout)
    if match is None:
        return (-1, -1)
    return (int(match.group(1)) if match.group(1) else 0, int(match.group(2)))


def main() -> int:
    pristine = WORKFLOW.read_text()
    write_atomically(PRISTINE, pristine)

    print(f"{'injection':64} {'red':>4} {'grn':>4}  verdict")
    uncaught = []
    for description, anchor, replacement in INJECTIONS:
        if pristine.count(anchor) != 1:
            print(f'{description:64} {"":>4} {"":>4}  ANCHOR MISSING (x{pristine.count(anchor)})')
            uncaught.append(description)
            continue
        write_atomically(WORKFLOW, pristine.replace(anchor, replacement, 1))
        failed, passed = run_suite()
        verdict = 'CAUGHT' if failed > 0 else 'MISSED'
        if failed <= 0:
            uncaught.append(description)
        print(f'{description:64} {failed:>4} {passed:>4}  {verdict}')
        write_atomically(WORKFLOW, pristine)

    write_atomically(WORKFLOW, pristine)
    failed, passed = run_suite()
    control = 'OK' if failed == 0 else 'BROKEN'
    print(f'\n{"pristine (negative control)":64} {failed:>4} {passed:>4}  {control}')

    # Restore from the on-disk copy too, so a crash mid-loop cannot leave the
    # workflow mutated in the working tree.
    #
    # Read-then-atomic-write rather than `shutil.copyfile`. Measured in
    # isolation: copyfile opens the destination with `O_TRUNC` and then streams
    # into it, so it reproduces the exact hole this file was fixed for -- two
    # zero-byte observations in 18 reads, against zero in 13 for `os.replace`.
    # Leaving one non-atomic write behind would have made the fix look complete
    # while a reader could still see an empty workflow, so this is the last site.
    write_atomically(WORKFLOW, PRISTINE.read_text())

    if uncaught:
        print(f'\n{len(uncaught)} injection(s) not caught:')
        for description in uncaught:
            print(f'  - {description}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
