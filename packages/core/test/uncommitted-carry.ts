import { execFileSync } from 'node:child_process';

/**
 * Carry a working tree's uncommitted changes onto a clean copy of its HEAD.
 *
 * ## Why this is a shared function and not two lines in the caller
 *
 * `typecheck-entrypoint.test.ts` builds a cold worktree and replays the
 * uncommitted changes onto it, so the assertion is about the revision a
 * developer is looking at rather than the one they last committed. The carry
 * step is therefore part of what that test *is*, and it had a defect that took a
 * regenerated binary artefact to find:
 *
 *     git diff HEAD | git apply -
 *     error: cannot apply binary patch to 'site/assets/….tar.gz'
 *            without full index line
 *
 * `git diff` without `--binary` writes `Binary files a/… and b/… differ` for
 * every binary file. That is a *description* of a change, not a patch: it
 * carries no bytes, and `git apply` refuses it. The consequence was that any
 * pass which regenerated an example pack left that test red **until the
 * artefact was committed** — a failure with nothing to do with the test's
 * subject, which is the class of defect this repository keeps finding.
 *
 * With `--binary` the diff carries a `GIT binary patch` block and the index
 * line, and the patch applies. Both commands get the flag: `git apply --binary`
 * is documented as historic and a no-op on current git, and passing it is the
 * stated intent rather than a hope.
 *
 * ## What the tests hold it to
 *
 * `uncommitted-carry.test.ts` builds a throwaway repository, changes one text
 * file and one binary file, and requires both to arrive. It also runs the old
 * command pair as a **control** and requires it to fail: a flag whose absence
 * nobody ever observed is a flag a future edit can delete.
 */
export function carryUncommitted(source: string, destination: string): void {
  const diff = execFileSync('git', ['diff', 'HEAD', '--binary'], {
    cwd: source,
    encoding: 'utf8',
    // A diff of a large binary is bigger than the default buffer, and the
    // failure would be an opaque `maxBuffer exceeded` rather than a statement
    // about the copy.
    maxBuffer: 128 * 1024 * 1024,
  });
  // An empty diff means the working tree matches HEAD and there is nothing to
  // replay. Calling `git apply` with an empty patch is an error, not a no-op.
  if (diff.length === 0) return;
  execFileSync('git', ['apply', '--binary', '--whitespace=nowarn', '-'], {
    cwd: destination,
    input: diff,
  });
}
