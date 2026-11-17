#!/usr/bin/env node
/**
 * `git` in a checkout, answering stdout or `null` -- one definition, two consumers.
 *
 * ## Why this is a module rather than a function in each caller
 *
 * Until v3.109 the same helper existed twice: `gate-receipt.mjs` ran
 * `spawnSync('git', args, { cwd: root })` and `git-hooks.mjs` ran
 * `spawnSync('git', ['-C', root, ...args])`. Both were exported, and a census of
 * exports keyed by *symbol* (finding 566) reported the pair as two names nothing
 * outside their own module took -- one of the two being the copy a test had
 * taken. So the tree held two definitions of "run git in a root", neither of them
 * consumed by anything but itself, and there was no instrument that compared
 * them: the module-wide rule this replaces could only see that each module had a
 * test somewhere.
 *
 * The two spellings are equivalent on every input either has ever been given -- a
 * root that is missing, a root that is a file, a checkout with a detached HEAD, a
 * subcommand that does not exist all end at `null` on both. That equivalence is
 * the reason nothing caught it, and it is also the reason the duplication was
 * harmless and still wrong: the next caller copies whichever it reads first, and
 * the answer to "what does a git failure look like here" gets a second author.
 *
 * ## Why `-C` and not `cwd`
 *
 * The root is an argument rather than a property of the spawn, so a recorded argv
 * is a complete description of what ran: `git -C <root> <args>`, in that order,
 * which is also how both callers print the command in a failure message. `cwd`
 * moves the same fact into the spawn options, where a message can only describe
 * it in prose.
 *
 * ## What `null` means, and why it is not an error
 *
 * Both callers have a state for "git could not answer": `verifiedTree` reports
 * `absent` and `install` reports `no-checkout`, and a third state for a subcommand
 * that failed would be a fourth answer to a question with three. So this returns
 * `null` for a spawn that never started, a non-zero exit, and a signal -- the
 * caller decides whether that is a missing checkout, an unreadable object, or a
 * refusal worth printing.
 *
 * All three are one comparison, and the first draft had two: it tested
 * `result.error !== undefined || result.status !== 0`, which reads like a
 * necessary pair and is not. `spawnSync` pairs every way of not starting a child
 * with `status: null`, and a child killed by a signal also reports
 * `status: null` -- so `null !== 0` already answers `null` for both, and the
 * `error` arm could be deleted without changing a single test (finding 566, the
 * eleventh falsification: the mutation was green). The surviving form says what
 * the contract is rather than how many ways it can fail.
 */

import { spawnSync } from 'node:child_process';

/**
 * A runner for `git` in `root`: call it with an argument list, get stdout or `null`.
 *
 * Returned as a function rather than taking `(root, args)` because that is what
 * both callers inject: `verifiedTree({ root, run })` and `install({ root, run })`
 * take the runner as a parameter, which is how their tests supply a fake one
 * without a repository at all.
 */
export function gitIn(root) {
  return (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    return result.status === 0 ? result.stdout : null;
  };
}
