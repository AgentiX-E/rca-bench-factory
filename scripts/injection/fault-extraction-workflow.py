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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _witnesses as W  # noqa: E402  (the shared attribution table)

REPO = Path(__file__).resolve().parents[2]
WORKFLOW = REPO / '.github' / 'workflows' / 'fault-extraction-accuracy.yml'
PRISTINE = REPO / 'node_modules' / '.cache' / 'fault-extraction-workflow.pristine.yml'
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


def parse_summary(output: str):
    """The counts the suite printed for one run, or `None` when it printed none.

    Extracted from `run_suite` so it can be held against the bytes CI actually
    emits. A regex that only ever runs behind `subprocess.run` cannot be tested
    against those bytes, and this parse had exactly that problem: it returned
    `(-1, -1)` when nothing matched, a pair the table then printed beside
    `MISSED`, which reads as "the tests have no teeth" when the truth is "no
    summary was found". Its sibling in `scripts/inject-stability.mjs` had the
    same gap and printed a fabricated `(failed 1, passed 0)` for every row on CI.

    The escapes are stripped first because CI leaves colour on even though the
    child's stdout is a pipe, so the runner's summary arrives as
    `\\x1b[2m      Tests \\x1b[22m \\x1b[1m\\x1b[32m21 passed\\x1b[39m` where a
    terminal emits `      Tests  21 passed (21)` -- and the escape sits exactly
    where the pattern needs whitespace. `gate-tests-battery.py` carries the same
    pattern for the same reason; these files are invoked rather than imported, so
    neither can own it for the other.
    """
    plain = re.sub(r'\x1b\[[0-9;]*m', '', output)
    match = re.search(r'Tests\s+(?:(\d+) failed \| )?(\d+) passed', plain)
    if match is None:
        return None
    return (int(match.group(1)) if match.group(1) else 0, int(match.group(2)))


def run_suite():
    """Run the gate; return its counts and its output.

    The output is returned because the verdict is no longer decided by the counts
    alone: a red has to name the test it broke, and that name is only in the
    runner's output.
    """
    result = subprocess.run(
        ['npx', 'vitest', 'run', SUITE],
        cwd=REPO / 'packages' / 'core',
        capture_output=True,
        text=True,
    )
    return parse_summary(result.stdout), result.stdout


def assert_workflow_restored(pristine: str) -> int:
    """The workflow must be back to its original bytes, and the suite must be green.

    ## Why this is a status and not a printed line

    The restore happened, and the negative control was printed, but neither
    decided anything: the exit status was computed from `uncaught` alone. A run
    that left `.github/workflows/fault-extraction-accuracy.yml` mutated therefore
    exited 0, and the mutation would be read as the real workflow by every
    command that followed -- including CI, which runs the workflow file's own
    subject matter.

    ## Why the negative control is part of the assertion

    `pristine (negative control) ... BROKEN` was printed and ignored, and it is
    the fact that makes every `CAUGHT` row above mean anything. A suite that is
    already failing produces `CAUGHT` for every injection while proving nothing
    about any of them, because the red it observes was there before the mutation.

    `packages/core/test/batteries-verify-their-restore.test.ts` asserts that every
    battery in this repository gates its exit status on its restore, which is why
    this returns a status rather than printing one.
    """
    status = 0
    current = WORKFLOW.read_text()
    if current != pristine:
        print()
        print('the battery did not restore its own mutation:')
        print(f'  {WORKFLOW.relative_to(REPO)} differs from the captured original')
        status = 2
    else:
        print('source restored: identical to the captured original')

    counts, _out = run_suite()
    if counts is None:
        print('pristine (negative control): the suite printed no summary, so every CAUGHT above is unproven')
        return 3 if status == 0 else status
    failed, passed = counts
    if failed != 0:
        print(f'pristine (negative control): {failed} test(s) failing, so every CAUGHT above is unproven')
        return 3 if status == 0 else status
    print(f'\n{"pristine (negative control)":64} {failed:>4} {passed:>4}  OK')
    return status


TEST_DIR = REPO / 'packages' / 'core' / 'test' / 'llm'
TEST_FILE = 'workflow-provider.test.ts'

# ---------------------------------------------------------------------------
# What each injection must break, named.
#
# The condition used to be `failed > 0`, which answers *the suite went red* to a
# question that is *the behaviour this mutation changed is pinned by a test*.
# This battery declares its subject in prose on every row -- "the gate under test
# is `test/llm/workflow-provider.test.ts`, which asserts that the workflow's
# provider handling cannot drift from the registry" -- and nothing compared the
# suite's failure against it.
#
# Each entry names the substrings of the runner's failing-test lines that must be
# present for the red to count. `scripts/injection/_witnesses.py` holds the
# decision; `--verify-expectations --probe` reconciles this table against the
# injections and the test file.
EXPECTATIONS: dict[str, tuple[str, ...]] = {
    'a registered provider has no secret mapping': (
        'binds a secret for each registered provider',
    ),
    'the key is demanded under a name this repository invented': (
        'does not reference a secret name this repository invented',
    ),
    'the selected key is never masked': (
        'masks the selected key before using it',
    ),
    'a vendor endpoint is hard-coded, reintroducing the lock': (
        'keeps the endpoint and model optional and out of the file',
    ),
    'the resolved provider is not forwarded to the derivation': (
        'passes the provider through to the derivation step',
    ),
    'provider resolution stops using the registry': (
        'resolves the provider through the registry rather than re-implementing it',
    ),
    'the key-selection step loses `set -eu`': (
        'uses a shell that fails on an unset variable, in the step that picks the key',
    ),
    '`set -u` is downgraded to `set -e`, so an unset variable expands to empty': (
        'aborts the key-selection step rather than continuing with an empty key',
    ),
    'the case arm for a registered provider is deleted': (
        'selects a key for each registered provider',
    ),
}


def verify_expectations(probe: bool = False) -> int:
    """Reconcile the witness table against the injections and the test file."""
    files = {name: TEST_DIR / TEST_FILE for name, *_ in INJECTIONS}
    return W.verify_witness_table(
        'fault-extraction-workflow', EXPECTATIONS, [name for name, *_ in INJECTIONS], files,
        TEST_DIR, TEST_FILE, probe=probe,
        anchors=[(n, WORKFLOW, (a, r)) for n, a, r, *_ in INJECTIONS]
    )


def _measure() -> int:
    # Reconcile before anything is mutated: an injection with no witness accepts
    # any red, which is the state this round measured its way out of.
    reconcile = verify_expectations()
    if reconcile != 0:
        return reconcile

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
        counts, out = run_suite()
        if counts is None:
            # Not `MISSED`. Nothing was read, so nothing can be said about whether
            # the mutation was detected -- and a battery that cannot read its own
            # evidence cannot certify anything, so the row counts as uncaught.
            print(f'{description:64} {"":>4} {"":>4}  NO SUMMARY')
            uncaught.append(description)
        else:
            failed, passed = counts
            decided, detail = W.attribute(
                description, EXPECTATIONS, 1 if failed > 0 else 0, failed,
                W.failing_tests(out), W.transform_failure(out),
            )
            if decided == W.CAUGHT:
                verdict = 'CAUGHT'
            elif decided == W.UNATTRIBUTED:
                verdict = 'UNATTRIBUTED'
                uncaught.append(description)
            elif decided == W.UNPARSEABLE:
                verdict = 'UNPARSEABLE'
                uncaught.append(description)
            else:
                verdict = 'MISSED'
                uncaught.append(description)
            print(f'{description:64} {failed:>4} {passed:>4}  {verdict}')
            for witness in detail:
                print(f'      {witness[:120]}')
        write_atomically(WORKFLOW, pristine)

    # Restore before the negative control, so the control measures the pristine
    # revision rather than whatever the last injection left behind.
    write_atomically(WORKFLOW, pristine)

    # Restore from the on-disk copy too, so a crash mid-loop cannot leave the
    # workflow mutated in the working tree.
    #
    # Read-then-atomic-write rather than `shutil.copyfile`. Measured in
    # isolation: copyfile opens the destination with `O_TRUNC` and then streams
    # into it, so it reproduces the exact hole this file was fixed for -- two
    # zero-byte observations in 18 reads, against zero in 13 for `os.replace`.
    # Leaving one non-atomic write behind would have made the fix look complete
    # while a reader could still see an empty workflow, so this is the last site.
    #
    # Two restores rather than one, and the second is not redundant: the first
    # restores from the string this run started with, and the second from
    # whatever the on-disk snapshot holds. A process killed between them is
    # recovered by the snapshot; a snapshot that was never written is covered by
    # the string. `injection-write-discipline.test.ts` asserts both sites by
    # count, because a total cannot say which one went missing.
    write_atomically(WORKFLOW, PRISTINE.read_text())

    restore_status = assert_workflow_restored(pristine)

    if uncaught:
        print(f'\n{len(uncaught)} injection(s) not caught:')
        for description in uncaught:
            print(f'  - {description}')
        return 1
    return restore_status



def main():
    """Measure inside the shared journal, so a killed run leaves nothing behind.

    The journal records every file this battery could mutate before it mutates one,
    and the next battery puts back whatever a dead run left. See `guard` in
    `_witnesses.py` for why the record is taken by subtree rather than by name.
    """
    with W.guard("fault-extraction-workflow"):
        return _measure()


if __name__ == '__main__':
    if '--verify-expectations' in sys.argv:
        sys.exit(verify_expectations(probe='--probe' in sys.argv))
    sys.exit(main())
