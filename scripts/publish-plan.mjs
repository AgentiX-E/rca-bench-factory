#!/usr/bin/env node
/**
 * Which commits a push has to publish, and what each one's tree is relative to the one
 * before it.
 *
 * ## Why the decision is a module and not a paragraph in the pusher
 *
 * Every finding in this repository reached the remote through a script that lives
 * outside it: three hundred lines of Python in a scratch directory, with no test, no
 * review and no CI. That was tolerable while the script could only be wrong about
 * bytes, because a wrong byte is caught by the assertion at the end -- the rebuilt
 * tree is compared with the local one and the ref does not move if they differ.
 *
 * It stopped being tolerable in v3.51, when the script was wrong about *which commits
 * to publish*. Three commits went up and one arrived. Every tree was byte-identical,
 * every local gate was green, and the round's account of itself had lost two thirds of
 * its sentences. The assertion at the end could not see it, because it is an assertion
 * about content and the failure was about history. Finding 404 records the incident;
 * the repair was a replay that walks back to the newest commit whose tree the remote
 * already holds and republishes everything after it.
 *
 * That repair has never been tested. Its only execution was the incident it repaired,
 * against a live branch, once. So this file is the repair, moved here: the arithmetic
 * that decides what a reader will see, in a function that takes data and returns data,
 * with the refusals enumerated. `publish.mjs` executes a plan and never computes one;
 * `publish-cli.mjs` is the entry point.
 *
 * ## What the plan says, and the two fields it cannot know
 *
 * A plan is written **before any object exists**, so it cannot name the commits it will
 * create -- their SHAs are the API's answer, not this file's guess. What it can name is
 * where each object hangs: `parent` and `base` are symbolic, either `remote` (the tip
 * that was there when the plan was drawn) or `commit` (the local commit whose rebuilt
 * form precedes this one). The executor resolves each symbol exactly once and refuses a
 * symbol it cannot resolve, which is the difference between a plan that describes a
 * history and a list of uploads that happens to be in order.
 *
 * That is the round's ruler applied to this file: `sha` is a field the planner cannot
 * know, so it is not in the plan at all. A planner that emitted `parent: null` and let
 * the executor fill it in would be a plan with a hole in the one field that decides the
 * history -- which is finding 404 with better manners.
 *
 * ## The base is located by commit first, and by tree only as a fallback
 *
 * A rebuild changes a commit's SHA and never its tree, so the remote can be compared on
 * trees and only on trees. But a commit that the remote *does* hold is the better
 * answer, and it is unambiguous: when the remote tip appears in the ancestry, the
 * window is exactly the commits above it. The tree comparison is what handles the
 * rebuilt case, and it can also fire when it should not -- two different commits with
 * the same tree, which the caller refuses rather than papering over with a duplicate.
 */

import { spawnSync } from 'node:child_process';

/** The blob modes a GitHub tree can carry. `040000` is a directory and `160000` a gitlink. */
export const MODES = Object.freeze(['100644', '100755', '120000']);

/** `git hash-object -t tree /dev/null`, and the base a tree with no parent is expressed on. */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const SHA = /^[0-9a-f]{40}$/;

/**
 * One `git` call in `root`, answered as text unless the caller asks for bytes.
 *
 * Throws rather than returning a sentinel: every caller here is reading an object it just
 * named, and there is no state a caller could have for "the object I asked for is not
 * there" that is not a refusal. The message quotes the subcommand and git's own stderr,
 * because the alternative is a stack trace naming `spawnSync` -- the shape finding 90 was
 * written about.
 *
 * One function for both the text and the byte answers, because the two used to be copies
 * and the copies were the same function with a different `encoding`. A blob is content and
 * decoding it would change it, so the caller says which it wants.
 */
export function runGit(root, args, options = {}) {
  const result = spawnSync('git', ['-C', root, ...args], { maxBuffer: 512 * 1024 * 1024, ...options });
  if (result.error !== undefined) throw new Error(`git ${args[0]} could not start in ${root}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${root}: ${String(result.stderr).trim()}`);
  }
  return result.stdout;
}

/** A string that is a SHA-1 and nothing else. A plan keyed on a guess is worse than none. */
export function requireSha(value, what) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new TypeError(`${what} must be a 40-character SHA-1, and '${String(value)}' is not one`);
  }
  return value;
}

/**
 * The ancestry of `rev`, newest first, as commits with their trees and their parents.
 *
 * One call, because the question the caller asks first -- *which of these commits does
 * the remote already hold* -- is a question about every commit in the history, and
 * asking it per commit would be one process per commit for a history of three hundred.
 * `%P` is every parent, so a merge is visible here rather than at the point where a
 * single-parent commit object would silently flatten it.
 */
export function readAncestry({ root, rev }) {
  const out = runGit(root, ['log', '--format=%H %T %P', rev, '--'], { encoding: 'utf8' });
  return out
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [sha, tree, ...parents] = line.split(' ');
      return { sha, tree, parents };
    });
}

/** `Lambertyan <lambertyan@example.com> 1762265460 +0800` -> the three fields the API wants. */
export function parseIdent(raw) {
  const match = /^(.*) <(.*)> (\d+) ([+-]\d{4})$/.exec(raw);
  if (match === null) throw new TypeError(`a commit identity this reader cannot parse: '${raw}'`);
  const [, name, email, epoch, offset] = match;
  const stamp = new Date((Number(epoch) + offsetSeconds(offset)) * 1000).toISOString().slice(0, 19);
  return { name, email, date: `${stamp}${offset.slice(0, 3)}:${offset.slice(3)}` };
}

/** `+0800` as seconds, so a wall clock can be reconstructed from a UTC epoch. */
function offsetSeconds(offset) {
  const sign = offset.startsWith('-') ? -1 : 1;
  return sign * (Number(offset.slice(1, 3)) * 3600 + Number(offset.slice(3, 5)) * 60);
}

/**
 * One commit, as the four things the API needs to rebuild it: its tree, its parents,
 * its message in bytes, and the two identities.
 *
 * The message is taken from the raw commit object rather than from `git log --format=%B`,
 * because `%B` is a *rendering*: it strips the trailing newline that the commit object
 * stores, and a rebuilt commit carrying a different message is a different SHA. The
 * byte-for-byte assertion the suite makes on the rebuilt commit is what found this; a
 * plan that used `%B` produced commits that were right in every field a reader checks
 * and wrong in their names.
 */
export function readCommit({ root, sha }) {
  const raw = runGit(root, ['cat-file', 'commit', sha], { encoding: 'utf8' });
  const split = raw.indexOf('\n\n');
  const header = split === -1 ? raw : raw.slice(0, split);
  const message = split === -1 ? '' : raw.slice(split + 2);
  let tree = null;
  let author = null;
  let committer = null;
  const parents = [];
  for (const line of header.split('\n')) {
    if (line.startsWith('tree ')) tree = line.slice(5);
    else if (line.startsWith('parent ')) parents.push(line.slice(7));
    else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('committer ')) committer = line.slice(10);
  }
  return {
    sha,
    tree: requireSha(tree, `the tree of ${sha.slice(0, 9)}`),
    parents,
    message,
    author: parseIdent(author),
    committer: parseIdent(committer),
    files: readFiles({ root, tree }),
  };
}

/**
 * The commit that will exist on the remote if it is given these parents.
 *
 * A commit's name is a hash of its own bytes, and bytes include the *names* of its parents.
 * So a push that hangs on a remote tip carrying the tree of a local ancestor -- a twin,
 * which is what `locateBase` matches when it falls back from commit to tree -- renames every
 * commit above it, and no amount of correctness in the replay can prevent that. The channel
 * said so in a sentence ("the history it hangs on is not the local history") that it had
 * never checked, and a sentence about a cause is worth exactly as much as the measurement
 * behind it: a rebuild that lost a file and a rebuild that only renamed a parent were
 * indistinguishable to every reader of that line.
 *
 * This is the measurement. Take the commit object as git stores it, replace its `parent`
 * lines in order with the names the remote will use, and hash the result. When a rebuilt
 * commit equals this prediction, the replay carried every other byte -- the tree, the
 * message, both identities, the parent *count* -- and the name differs for the one reason
 * the channel can name. When it does not, the rebuild lost something, and `publish` refuses
 * rather than describing it.
 *
 * It is also its own proof: given a commit's own parents it returns that commit's name,
 * because it is reconstructing the very bytes git hashed. A reader that mangled the message
 * or the header order would fail that round trip before it could be trusted with a verdict.
 */
export function predictRebuild({ root, sha, parents }) {
  const raw = runGit(root, ['cat-file', 'commit', requireSha(sha, 'a commit to predict')], { encoding: 'utf8' });
  const split = raw.indexOf('\n\n');
  const header = split === -1 ? raw : raw.slice(0, split);
  const message = split === -1 ? '' : raw.slice(split + 2);
  const lines = header.split('\n');
  const named = lines.filter((line) => line.startsWith('parent ')).length;
  if (named !== parents.length) {
    throw new TypeError(
      `${sha.slice(0, 9)} has ${named} parent(s) and ${parents.length} were given: a prediction with the wrong ` +
        'count is a different commit, not the same one renamed',
    );
  }
  let next = 0;
  const rewritten = lines.map((line) => {
    if (!line.startsWith('parent ')) return line;
    const parent = requireSha(parents[next], 'a parent to hang on');
    next += 1;
    return `parent ${parent}`;
  });
  return runGit(root, ['hash-object', '-t', 'commit', '--stdin'], {
    input: `${rewritten.join('\n')}\n\n${message}`,
    encoding: 'utf8',
  }).trim();
}

/** Every blob of a tree, read from git and flattened by the one rule below. */
export function readFiles({ root, tree }) {
  const entries = [];
  for (const row of runGit(root, ['ls-tree', '-r', '-z', tree], { encoding: 'utf8' }).split('\0')) {
    if (row === '') continue;
    const tab = row.indexOf('\t');
    const [mode, type, sha] = row.slice(0, tab).split(' ');
    entries.push({ path: row.slice(tab + 1), mode, type, sha });
  }
  return filesFromEntries(entries);
}

/**
 * A listing -- from `git ls-tree` or from the API -- as `path -> {mode, sha}`.
 *
 * One rule for both sources, because the second source is the one that decides what to
 * *delete*: a remote listing that quietly dropped a path and a remote listing that never
 * had it are the same absence, and the difference between them is the difference between
 * a tree that was rebuilt and a tree that was edited.
 *
 * A directory entry is skipped: `?recursive=1` reports submodules as `type: "commit"` and
 * -- on some responses -- directories as `type: "tree"`, and neither carries content. A
 * gitlink is refused rather than skipped, because a submodule *is* content and a plan
 * that dropped it would publish a tree missing a directory, which is the silent-loss
 * shape this repository exists to refuse.
 */
export function filesFromEntries(entries) {
  const files = {};
  for (const entry of entries) {
    if (entry.type === 'tree') continue;
    if (entry.type !== 'blob') {
      throw new TypeError(
        `'${entry.path}' is a ${entry.type} and a plan can only carry blobs: ` +
          'a gitlink is content this channel would have to publish separately',
      );
    }
    files[entry.path] = { mode: entry.mode, sha: requireSha(entry.sha, `the blob of '${entry.path}'`) };
  }
  return files;
}

/** One blob's bytes, for the transport to upload. */
export function readBlob({ root, sha }) {
  return runGit(root, ['cat-file', 'blob', requireSha(sha, 'a blob to read')]);
}

/** The commit a revision names. `HEAD` is a name a plan cannot use as a key. */
export function readRev({ root, rev }) {
  return requireSha(runGit(root, ['rev-parse', rev], { encoding: 'utf8' }).trim(), `the commit ${rev} names`);
}

/** The tree a revision names, which is the only thing a receipt and a rebuilt commit agree on. */
export function readTreeOf({ root, rev }) {
  return requireSha(runGit(root, ['rev-parse', `${rev}^{tree}`], { encoding: 'utf8' }).trim(), `the tree of ${rev}`);
}

/**
 * Where the remote's content sits in the local ancestry, or `null` when it sits nowhere.
 *
 * Two questions in order, because they do not have the same answer when both apply. A
 * commit the remote holds is a fact about history; a tree the remote holds is a fact
 * about content, and a rebuild preserves content while changing the commit. So the
 * commit is asked for first and the tree is the fallback -- and the fallback is what a
 * replayed history needs, since the SHA the remote holds for a rebuilt commit was never
 * a local name.
 */
export function locateBase({ ancestry, remote }) {
  if (remote.head !== null) {
    const at = ancestry.findIndex((commit) => commit.sha === remote.head);
    if (at !== -1) return { kind: 'commit', index: at };
  }
  if (remote.tree !== null) {
    const at = ancestry.findIndex((commit) => commit.tree === remote.tree);
    if (at !== -1) return { kind: 'tree', index: at };
  }
  return null;
}

/** Sorted paths, because two runs of the same plan must produce the same bytes. */
function entryFor(path, file) {
  if (file === null) return null;
  if (!MODES.includes(file.mode)) {
    throw new TypeError(
      `'${path}' carries mode ${file.mode}, and a tree entry can only be ${MODES.join(', ')}: ` +
        'a mode this channel cannot express is a file whose type it would be guessing',
    );
  }
  return { path, mode: file.mode, type: 'blob', sha: requireSha(file.sha, `the blob of '${path}'`) };
}

/**
 * The tree entries that turn `before` into `after`: the blobs that differ, and the paths
 * that are gone.
 *
 * A deletion is an entry with `sha: null` and the mode of the file being removed, which
 * is how the API removes a path from `base_tree`. The mode is carried rather than
 * assumed for the reason the pusher already knew: an executable removed as `100644` is a
 * different entry, and a symlink removed as a regular file leaves the API to decide what
 * the path was.
 */
export function diffEntries({ before, after }) {
  const changed = [];
  const removed = [];
  for (const path of Object.keys(after).sort()) {
    const now = entryFor(path, after[path]);
    const was = before[path];
    if (was === undefined || was.sha !== now.sha || was.mode !== now.mode) changed.push(now);
  }
  for (const path of Object.keys(before).sort()) {
    if (after[path] !== undefined) continue;
    removed.push({ path, mode: before[path].mode, type: 'blob', sha: null });
  }
  return [...changed, ...removed];
}

/**
 * The plan: one step per commit that has to be published, oldest first.
 *
 * `commits` is the window the caller located, already read. `remote` is what the remote
 * answered -- `head: null` for a branch that does not exist yet, in which case the whole
 * window is published onto nothing and the root commit legitimately has no parent.
 */
export function planPublish({ remote, commits }) {
  // A listing that says it is partial cannot decide what to delete. GitHub truncates a
  // recursive tree at 100 000 entries or seven megabytes and sets this flag; a path that
  // is absent from a truncated listing is indistinguishable from a path that was never
  // there, so the deletions computed from it would leave files on the remote that the
  // local revision removed. The assertion at the end of a push catches the result, and it
  // catches it after every blob of the round has been uploaded -- with a sentence about
  // two trees and no cause. This refuses first, and names the listing.
  if (remote.truncated === true) {
    throw new TypeError(
      'the tree listing is truncated, so it cannot be used to decide what to delete: ' +
        'a path missing from a partial listing and a path that was never there read the same',
    );
  }
  if (!Array.isArray(commits) || commits.length === 0) {
    throw new TypeError('a plan with no commits would move a ref to where it already is; publish nothing instead');
  }

  let before = remote.head === null ? {} : remote.files;
  const steps = [];
  commits.forEach((commit, index) => {
    const root = index === 0 && remote.head === null;
    if (commit.parents.length !== 1 && !(root && commit.parents.length === 0)) {
      throw new TypeError(
        `${commit.sha.slice(0, 9)} has ${commit.parents.length} parents, and a replayed commit is published on one: ` +
          'a merge carries a history in its second parent that the remote would not receive, so the SHA it ' +
          'receives would not be the SHA that was written',
      );
    }
    // One entry per path by construction: the diff is taken over the keys of two
    // objects, so a path cannot be named twice and no refusal is needed here. A guard
    // that cannot fire is a guard a reader learns to trust for the wrong reason.
    const entries = diffEntries({ before, after: commit.files });
    steps.push({
      sha: commit.sha,
      subject: commit.message.split('\n')[0],
      message: commit.message,
      author: commit.author,
      committer: commit.committer,
      parent: index === 0 ? (root ? { kind: 'none' } : { kind: 'remote' }) : { kind: 'commit', sha: steps[index - 1].sha },
      base:
        index === 0
          ? root
            ? { kind: 'empty' }
            : { kind: 'remote' }
          : { kind: 'commit', sha: steps[index - 1].sha },
      entries,
      changed: entries.filter((entry) => entry.sha !== null).length,
      removed: entries.filter((entry) => entry.sha === null).length,
      files: Object.keys(commit.files).length,
    });
    before = commit.files;
  });
  return { commits: steps, tipTree: commits[commits.length - 1].tree };
}

/**
 * The plan for a push that creates a name and builds nothing.
 *
 * `planPublish` refuses an empty window because a plan with nothing to publish would move a
 * ref to where it already is. This plan moves no ref to where it is: the branch does not
 * exist and the commit does, so naming it is a change -- one `POST /git/refs` and no object.
 * The refusal's premise is exactly the fact that is false here, which is why the two cannot
 * be one function: an empty list means "nothing to do" only when the ref already says so.
 *
 * `tipTree` is still carried, because every plan names the tree it publishes and this one
 * publishes the tree of a commit the remote already holds -- the one case where the claim
 * needs no assertion, since a commit's bytes contain its tree.
 */
export function pointerPlan({ tree }) {
  return { commits: [], tipTree: requireSha(tree, 'the tree a pointer plan publishes') };
}

/**
 * The plan as lines, for `--dry-run` and for the log a push leaves behind.
 *
 * The parent is printed as the symbol it is -- `remote` or the short SHA of the local
 * commit it hangs on -- rather than resolved, because it *cannot* be resolved before the
 * objects exist and a printed number would be a guess printed as a fact.
 */
export function summarisePlan(plan) {
  const lines = [];
  plan.commits.forEach((step, index) => {
    const parent = step.parent.kind === 'remote' ? 'the remote tip' : step.parent.kind === 'none' ? 'nothing' : step.parent.sha.slice(0, 9);
    lines.push(
      `${index + 1}/${plan.commits.length} ${step.sha.slice(0, 9)} on ${parent}: ` +
        `${step.changed} changed, ${step.removed} removed, ${step.files} file(s) — ${step.subject}`,
    );
  });
  return lines;
}

/**
 * Resolve one symbolic name in a plan, exactly once, against the objects that exist now.
 *
 * `field` is which of the two names the symbol stands for: a step's `parent` is a commit
 * and its `base` is a tree, and they resolve to different objects of the same step. The
 * caller passes it rather than reading it off the symbol, because the symbol says *where*
 * the object comes from and the field says *what* it is -- one fact each.
 */
export function resolveSymbol(symbol, { remote, built, field }) {
  if (symbol.kind === 'none') return null;
  if (symbol.kind === 'empty') return null;
  if (symbol.kind === 'remote') return field === 'tree' ? remote.tree : remote.head;
  const made = built.get(symbol.sha);
  if (made === undefined) {
    throw new TypeError(`the plan hangs on ${String(symbol.sha)} and that commit has not been built`);
  }
  return field === 'tree' ? made.tree : made.commit;
}
