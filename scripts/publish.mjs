#!/usr/bin/env node
/**
 * Executing a plan: the refusals around a push, and the two ways to reach a remote.
 *
 * ## The split this file is on one side of
 *
 * `publish-plan.mjs` decides *what* to publish and never touches the network.
 * `publish.mjs` -- this file -- does the four things a plan cannot: it asks the remote
 * what it holds, it refuses a revision no green gate blessed, it resolves the plan's
 * symbolic parents against the objects it has just created, and it refuses to move the
 * ref unless the tip's tree survived the round trip. `publish-cli.mjs` is the entry
 * point; nothing here exits.
 *
 * ## Why two transports and not one
 *
 * The GitHub transport is the real channel and it cannot be tested: a test that pushed
 * to a live repository would be a test that edits the thing it measures, and a suite
 * that needs a token is a suite nobody runs on a fork. The local transport exists so the
 * *execution* has a subject -- a bare repository standing where `api.github.com` stands,
 * written with the same objects, so a replay that is correct leaves the remote's commit
 * SHAs equal to the local ones, byte for byte.
 *
 * That equality is the strongest assertion available and it is the one the incident of
 * finding 404 would have failed: the old channel rebuilt the tip on the remote and every
 * *tree* matched, so the assertion that compared trees was satisfied by a history that
 * had lost two thirds of its commits. Comparing commits compares the thing the round
 * wrote.
 *
 * ## What the transport interface is, and why it is six calls
 *
 * A transport answers six questions and changes three things:
 *
 *   head(branch)        -> {sha} | null            (a branch that does not exist yet)
 *   refs()              -> {names, complete}        (asked only when the branch read said 404)
 *   holds(sha)          -> boolean                 (asked only on the creation path)
 *   commit(sha)         -> {sha, tree}
 *   tree(sha)           -> {entries, truncated}    (the whole listing, flat)
 *   createTree({base, entries, blobs}) -> tree sha
 *   createCommit({message, tree, parents, author, committer}) -> commit sha
 *   updateRef({branch, sha, expected}) -> void
 *
 * Each is one of the Git Data API's own endpoints. A transport that had to know what a plan
 * is would be a second decision, and the two copies would disagree the first time one of
 * them learned something.
 *
 * `holds` is the sixth question and it exists for one state: a branch that does not exist
 * on a remote that already has the commit. The channel replayed the whole history there
 * until v3.60 -- a name for a commit the remote had held for two hundred and forty-six
 * commits, paid for with three hundred uploads (finding 447).
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readReceipt } from './gate-receipt.mjs';
import {
  filesFromEntries,
  runGit,
  locateBase,
  planPublish,
  pointerPlan,
  predictRebuild,
  readAncestry,
  readBlob,
  readCommit,
  readRev,
  readTreeOf,
  requireSha,
  resolveSymbol,
  summarisePlan,
} from './publish-plan.mjs';

/** Where `verify:local` leaves its verdicts. Same directory `gate-receipt.mjs` writes. */
export const GATE = join('scripts', 'verify-local.mjs');

/**
 * Refuse a revision whose tree no green gate run blessed.
 *
 * The rule already lives in `gate-receipt.mjs`; what it never had was a consumer inside
 * the repository. It lived in the pusher, outside, where a test could not reach it --
 * and a rule whose only copy is in an untested file is a rule with a comment.
 *
 * A repository without a gate is not asked: `rca-bench-factory-docs` is prose, has no
 * `verify:local`, and a rule that refused every push there would be turned off rather
 * than satisfied.
 */
export function requireReceipt({ root, rev, tree }) {
  if (!existsSync(join(root, GATE))) return { state: 'absent', tree, why: 'this repository has no verify:local to ask' };
  const receipt = readReceipt({ root, tree });
  if (receipt.state !== 'verified') {
    throw new TypeError(
      `${rev.slice(0, 9)} is published from tree ${tree.slice(0, 9)} and no verify:local receipt exists for it ` +
        `(${receipt.path}). Run the gate over that tree first: a subset run and a dirty working tree both ` +
        'withhold a receipt, because neither names content that can be published',
    );
  }
  return receipt;
}

/** What the remote holds, in the shape a plan is written against. */
async function readRemote({ transport, branch }) {
  const head = await transport.head(branch);
  if (head === null) return { head: null, tree: null, files: {}, truncated: false };
  return readRemoteAt({ transport, sha: head.sha });
}

/**
 * The same shape, for a commit the caller has already named.
 *
 * Two callers need it and they name different things: a branch read, and a ref tip chosen as
 * a plan's base. The second is what lets a branch be created beside an existing one instead of
 * on nothing (finding 455).
 */
async function readRemoteAt({ transport, sha, tree = null }) {
  const commit = tree === null ? await transport.commit(sha) : { sha, tree };
  const listing = await transport.tree(commit.tree);
  return {
    head: commit.sha,
    tree: commit.tree,
    files: filesFromEntries(listing.entries),
    truncated: listing.truncated === true,
  };
}

/**
 * The shallowest local ancestor a plan can hang on, given the refs the remote has.
 *
 * A branch that does not exist has no tip to compare, so the comparison is made against the
 * tips that do: a local ancestry position is a candidate whenever some ref points at that
 * commit (no request: the ancestry already carries the SHAs) or at a commit with that tree
 * (one request per branch, because a tree can only be learned by reading the commit).
 *
 * Branch tips only, and that is a fact rather than a convenience: an annotated tag points at
 * a tag object, and `GET /git/commits/<sha>` on one is a `404` that would read as "the remote
 * has no base" -- the wrong answer to a question this path cannot afford to get wrong.
 *
 * The nearest match wins, because the window is everything above it: an index of one is a
 * single commit to replay and an index of forty is thirty-nine that the remote already has
 * under another name. Cost is bounded by the number of branches, and correctness does not
 * depend on the choice: a base further back replays more and produces the same tip tree,
 * which the executor asserts.
 */
async function locateBaseAmongRefs({ ancestry, listing, transport }) {
  const heads = listing.tips.filter((tip) => tip.name.startsWith('refs/heads/'));
  const seen = new Set();
  let best = null;
  let unread = [];
  for (const tip of heads) {
    if (seen.has(tip.sha)) continue;
    seen.add(tip.sha);
    const at = ancestry.findIndex((commit) => commit.sha === tip.sha);
    if (at === -1) unread.push(tip);
    // The tree comes from the ancestry rather than from a read: the SHA *is* the local commit,
    // so its tree is the one the local repository already has. A base found by name therefore
    // costs the listing and nothing else.
    else if (best === null || at < best.index) best = { kind: 'commit', index: at, sha: tip.sha, tree: ancestry[at].tree };
  }
  for (const tip of unread) {
    const commit = await transport.commit(tip.sha);
    const at = ancestry.findIndex((entry) => entry.tree === commit.tree);
    if (at === -1) continue;
    if (best === null || at < best.index) best = { kind: 'tree', index: at, sha: commit.sha, tree: commit.tree };
  }
  return best;
}

/**
 * How many names a refusal prints before it starts counting.
 *
 * A refusal is read in a terminal and acted on by somebody who mistyped a branch, so the
 * sentence has to carry the names that exist -- and a repository with two hundred branches
 * would turn one sentence into a page. Five is enough to recognise the intended one, and
 * the rest is a number.
 */
const NAMES_SHOWN = 5;

/** How many refs one listing request asks for: the API's maximum, and its own default page. */
const REF_PAGE_SIZE = 100;

/**
 * How many pages a refusal will walk before it stops counting.
 *
 * A ref listing inside a refusal is a read nobody asked for, so it is bounded: ten pages is
 * a thousand refs, and a repository larger than that is one where the sentence says "at
 * least" instead of walking a thousand branches to print a number no reader will finish.
 */
const REF_PAGES_MAX = 10;

/**
 * What a repository holds, in the words a refusal uses.
 *
 * Branches and tags are named separately because they answer different questions: a
 * repository with one tag and no branch is one where no push has ever landed, and a
 * sentence that said "1 ref" would leave the reader to guess which. Anything else under
 * `refs/` -- `refs/pull/7/head`, `refs/notes/commits` -- is counted rather than named: it
 * makes the repository non-empty, which is the fact the refusal turns on, and this channel
 * has no opinion about its name.
 *
 * `complete` is false when the listing stopped at the walk's own bound, and then every count
 * in the sentence is a floor: a number that counted the pages this channel read, printed as
 * the number of refs the repository holds, is the defect the walk was added to fix.
 */
export function refSentence(names, complete = true) {
  const branches = [];
  const tags = [];
  let other = 0;
  for (const name of names) {
    if (name.startsWith('refs/heads/')) branches.push(name.slice('refs/heads/'.length));
    else if (name.startsWith('refs/tags/')) tags.push(name.slice('refs/tags/'.length));
    else other += 1;
  }
  const listing = (values) =>
    values.length <= NAMES_SHOWN
      ? values.join(', ')
      : `${values.slice(0, NAMES_SHOWN).join(', ')} and ${values.length - NAMES_SHOWN} more`;
  const parts = [];
  if (branches.length > 0) parts.push(`${branches.length} branch(es): ${listing(branches)}`);
  if (tags.length > 0) parts.push(`${tags.length} tag(s): ${listing(tags)}`);
  if (other > 0) parts.push(`${other} other ref(s)`);
  return (complete ? '' : 'at least ') + parts.join('; ');
}

/**
 * Publish `rev` to `branch` through `transport`, one planned commit at a time.
 *
 * Returns a record rather than printing one, because the two states a caller must tell
 * apart -- *the remote already had this* and *this round moved it* -- are not the same
 * claim and a log line is not a return value.
 */
export async function publish({
  root,
  rev,
  branch,
  transport,
  gate = true,
  dryRun = false,
  newBranch = false,
  log = () => {},
}) {
  const tip = readRev({ root, rev });
  const tipTree = readTreeOf({ root, rev });
  if (gate) requireReceipt({ root, rev, tree: tipTree });

  const remote = await readRemote({ transport, branch });
  if (newBranch && remote.head !== null) {
    // The flag is a claim about the remote, not a permission slip. It was read as the second
    // until v3.60: a push that said "this branch is new" onto a branch that was there
    // published onto it, moving a branch its author believed they were creating -- and the
    // next reader of that branch finds a history somebody meant to put elsewhere. The two
    // halves of the flag are one statement, so a false one is refused rather than ignored.
    throw new TypeError(
      `'${branch}' already exists at ${remote.head.slice(0, 9)} and --new-branch says it does not: a push that was ` +
        'meant to create a branch must not move one. Drop the flag to publish onto this branch, or name the branch ' +
        'that is meant to be new',
    );
  }
  // Held across the next two decisions because they ask different things of one answer: the
  // listing separates "a name that is wrong" from "a branch that is new", and an empty
  // listing is also the answer to whether the remote can hold the tip by any name.
  let listing = null;
  if (remote.head === null && !newBranch) {
    // A `404` on the branch read is two states wearing one status, and only one of them is
    // this channel's business. On an empty repository the branch is unborn and replaying
    // the whole history is the only thing a push can mean. On a repository that holds
    // refs, the branch is *absent*, and the same plan would create it, publish the history
    // onto it, report success -- and leave the branch that was meant untouched. The push
    // that met this in practice was stopped by the merge refusal only because the two
    // branches had diverged; a linear history would have created a second branch silently,
    // which is the worse failure of the two because nothing afterwards is wrong.
    //
    // The listing is asked for here rather than in `readRemote` so that the ordinary path
    // -- a branch that exists -- pays nothing for a question it does not ask.
    listing = await transport.refs();
    if (listing.names.length > 0) {
      throw new TypeError(
        `'${branch}' does not exist and the remote is not empty: it holds ${refSentence(listing.names, listing.complete)}. ` +
          'A branch that is absent on a repository that has refs is a name that is wrong, not a branch that is ' +
          'new: publishing this history there would create it and leave the branch that was meant untouched. ' +
          'Pass --new-branch to say the branch is meant to be new',
      );
    }
  }
  // The creation path, and the one case where it costs a request instead of a history.
  //
  // A branch that does not exist on a remote that already holds the tip needs one call and
  // no object: a commit is closed, so a remote holding it holds its tree, its parents and
  // every ancestor with it. The question is asked here rather than in `readRemote` because
  // only this branch of the decision has anything to do with the answer, and the ordinary
  // push -- a branch that exists -- pays nothing for a question it does not ask.
  //
  // It is one request either way: `404` is the answer "no", and it is asked before the
  // ancestry is read, because a push that is going to build nothing has no window to compute.
  //
  // It is not asked at all when the listing has just come back empty. A repository with no
  // refs is one where no name can serve a commit, so the question has a known answer; asking
  // it spent a request on every first push to learn what the previous answer already said
  // (finding 451). The replay that follows is correct whatever the object store holds, while
  // the shortcut would have relied on a commit the listing never mentioned -- in a repository
  // whose objects are unreachable and therefore collectable.
  if (remote.head === null) {
    // A listing that was read for the wrong-name refusal is reused rather than taken again,
    // and only an *empty* one suppresses the question: on that state the answer is known. The
    // listing is otherwise asked for after the question, not before it, so the pointer path
    // keeps its three requests -- a repository that has refs has tips, and a tip is what a
    // plan needs to hang on when the branch being created has none of its own (finding 455),
    // but that is only worth a request once the cheap answer has come back "no".
    const empty = listing !== null && listing.names.length === 0;
    if (!empty && (await transport.holds(tip))) {
      const plan = pointerPlan({ tree: tipTree });
      log(
        `the remote already holds ${tip.slice(0, 9)}: naming it is the whole push, and no commit is created -- ` +
          "the tree this gate blessed is that commit's own tree, because a commit's bytes contain it",
      );
      // A dry run has to say the same thing as the push, and here the difference is the one
      // fact the plan cannot carry: the number of commits built is zero and the ref still moves.
      if (dryRun) return { state: 'planned', remote, plan, tip: null, identical: false };
      await transport.updateRef({ branch, sha: tip, expected: null });
      return {
        state: 'published',
        remote,
        plan,
        tip,
        // The strongest case of `identical` there is: no byte crossed the wire, so the
        // branch names the commit the local repository holds and not a rebuild of it. The
        // assertion the rebuild path has to make after the fact is here an identity.
        identical: true,
        identity: { state: 'held', commits: 0, base: null },
      };
    } else {
      if (listing === null) listing = await transport.refs();
      if (listing.names.length === 0) {
        log(
          'the remote holds no refs, so there is no name a shortcut could carry: this push replays the history and ' +
            'the question about the tip is not asked',
        );
      } else {
        log(`the remote does not hold ${tip.slice(0, 9)}: this push will build the commits that lead to it`);
      }
    }
  }
  const ancestry = readAncestry({ root, rev: tip });

  // Where a plan may hang, for a branch that does not exist yet.
  //
  // An unborn branch has no content of its own to locate a base against -- `locateBase`
  // compares against *a* remote commit, and `head: null` is not one. Until v3.61 that made
  // the window the whole ancestry, which is right for a repository with no refs and wrong
  // for every other case: a branch created beside an existing one replayed five hundred
  // commits, and on this repository it could not be created at all, because the history it
  // insisted on replaying contains a merge and a replayed merge is refused (finding 455).
  //
  // A repository with refs has tips, and a tip is exactly what the comparison wants. The
  // listing already carries one name per ref and the SHA that name points at, so the base is
  // chosen from what the remote *has* rather than from a branch it does not: read each tip's
  // commit, keep the shallowest local ancestor whose tree matches one of them, and plan the
  // window above it. The branch is still created rather than moved, and every commit above
  // the base still hangs on the remote's names.
  const base = remote.head === null ? await locateBaseAmongRefs({ ancestry, listing, transport }) : null;
  const located =
    remote.head !== null
      ? locateBase({ ancestry, remote })
      : base === null
        ? { kind: 'unborn', index: ancestry.length }
        : { kind: base.kind, index: base.index };
  const origin = base === null ? remote : await readRemoteAt({ transport, sha: base.sha, tree: base.tree });
  if (located === null) {
    throw new TypeError(
      `the remote holds neither ${tip.slice(0, 9)} nor any tree of its ancestry: its tip is ` +
        `${String(origin.head).slice(0, 9)} (tree ${String(origin.tree).slice(0, 9)}) and no local commit has ` +
        'that tree. Publishing the tip alone is how finding 404 lost two of three commits — the tree arrives ' +
        'and the sentences do not. Rebase onto the remote, or publish the branch that produced that tip',
    );
  }
  if (located.index === 0 && remote.head === tip) {
    log(`already up to date at ${tip.slice(0, 9)}`);
    return { state: 'current', remote, plan: null, tip, identical: true };
  }
  if (located.index === 0 && remote.head !== null) {
    // The remote holds this revision's tree on a different commit. The content is there
    // and the history is not, and replaying the tip would add a second commit with the
    // same message on top of a commit that already carries that tree.
    //
    // That is the right answer for a branch that exists, and the wrong one for a branch
    // being created: there is no second commit with the same message, because there is no
    // first one under this name. The window is then the tip itself -- one commit, whose
    // parent is the remote's name for the twin -- which is the only way to create a branch
    // at a tip the remote already holds under another name (finding 456).
    throw new TypeError(
      `the remote's tip (${String(origin.head).slice(0, 9)}) already carries the tree of ${tip.slice(0, 9)} ` +
        'and is not that commit: replaying it would publish a second commit with the same message on top of ' +
        'a tree that is already there',
    );
  }

  const window = ancestry.slice(0, located.index === 0 ? 1 : located.index).reverse();
  const commits = window.map((commit) => readCommit({ root, sha: commit.sha }));
  const localTrees = new Map(commits.map((commit) => [commit.sha, commit.tree]));
  const plan = planPublish({ remote: origin, commits });
  for (const line of summarisePlan(plan)) log(line);
  if (located.kind === 'tree') {
    // The remote's tip carries the tree of a local ancestor and is not that commit. Every
    // commit above it will hang on the remote's name for its parent, and a commit's name is
    // its bytes -- so the SHAs in this plan cannot come out equal, whatever the replay does.
    // It is said before the first request rather than after the last: an operator reading
    // "the tip's SHA is not the local one" after the fact cannot tell a rename from a loss.
    log(
      `the remote's tip ${String(origin.head).slice(0, 9)} carries the tree of ` +
        `${ancestry[located.index].sha.slice(0, 9)} and is not that commit: this plan hangs on the remote's ` +
        'names, so the commits above it will differ from the local ones in their parent lines and in nothing else',
    );
  }
  if (dryRun) return { state: 'planned', remote, plan, tip: null, identical: false };

  const built = new Map();
  for (const step of plan.commits) {
    const treeBase = resolveSymbol(step.base, { remote: origin, built, field: 'tree' });
    const parent = resolveSymbol(step.parent, { remote: origin, built, field: 'commit' });
    const blobs = new Map();
    for (const entry of step.entries) {
      if (entry.sha !== null && !blobs.has(entry.sha)) blobs.set(entry.sha, readBlob({ root, sha: entry.sha }));
    }
    const tree = step.entries.length === 0 && treeBase !== null
      ? treeBase
      : await transport.createTree({ base: treeBase, entries: step.entries, blobs });
    const commit = await transport.createCommit({
      message: step.message,
      tree,
      parents: parent === null ? [] : [parent],
      author: step.author,
      committer: step.committer,
    });
    // What the rebuild produced, against the three things it can be: the local commit (the
    // only outcome a push that hangs on local names can have), the local commit with its
    // parents renamed (the outcome every push above a twin has), or neither -- which is a
    // byte that did not survive, and is refused rather than described.
    const verdict =
      commit === step.sha
        ? 'exact'
        : tree !== localTrees.get(step.sha)
          ? 'tree'
          : predictRebuild({ root, sha: step.sha, parents: parent === null ? [] : [parent] }) === commit
            ? 'parents'
            : 'differs';
    if (verdict === 'differs') {
      throw new TypeError(
        `the rebuilt commit is not ${step.sha.slice(0, 9)} with its parents renamed: the API answered ` +
          `${commit.slice(0, 9)} for a commit whose tree, message, identities and parent count are the ones it was ` +
          'sent, so the bytes that arrived are not the bytes that left. Nothing was forced',
      );
    }
    built.set(step.sha, { commit, tree, verdict });
    log(
      verdict === 'parents'
        ? `${step.sha.slice(0, 9)} -> ${commit.slice(0, 9)} (tree ${tree.slice(0, 9)}): the same commit, hanging on ` +
            "the remote's name for its parent"
        : `${step.sha.slice(0, 9)} -> ${commit.slice(0, 9)} (tree ${tree.slice(0, 9)})`,
    );
  }

  const published = built.get(tip);
  // The one assertion the old channel did make, kept and named: the tree `verify:local`
  // measured is the tree the remote will hold, or the ref does not move. What the old
  // channel could not assert is below it -- that the *log* arrived -- and the test suite
  // asserts that against a real repository instead of printing it.
  if (published === undefined || published.tree !== tipTree) {
    throw new TypeError(
      `refusing to move the ref: the rebuilt tip has tree ${String(published?.tree).slice(0, 9)} and ` +
        `${tip.slice(0, 9)} has ${tipTree.slice(0, 9)}. Nothing was forced`,
    );
  }
  await transport.updateRef({ branch, sha: published.commit, expected: remote.head });
  // One answer, read from one place. The verdict on the tip *is* the question the caller
  // asks -- did the rebuild reproduce the local commit -- and `identical`, the state and the
  // sentence all read it rather than each re-deriving it from `published.commit === tip`.
  // Two derivations of one fact disagree the first time one of them learns something.
  //
  // And no count of exact against renamed: a push above a twin renames *every* commit it
  // carries, a push onto the same commit renames none, so the pair would always be (n, 0) or
  // (0, n) -- two columns that look like measurements and can only say what the state
  // already says. `commits` is the one number with content.
  const exact = published.verdict === 'exact';
  return {
    state: 'published',
    remote,
    plan,
    tip: published.commit,
    identical: exact,
    identity: { state: exact ? 'exact' : 'parents', commits: plan.commits.length, base: located.kind },
  };
}

/* ------------------------------------------------------------------ github */

/** The API's answer, with its status, so a caller can tell 404 from 422 without a string. */
export class ApiError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} -> ${status}: ${body.slice(0, 400)}`);
    this.status = status;
  }
}

/**
 * Whether a thrown value is the connection breaking rather than the program being wrong.
 *
 * `fetch` answers a closed socket with a `TypeError` whose cause carries an undici code,
 * not with a response, so the status-based retry in `call` cannot see it. The first real
 * push of v3.53 met `UND_ERR_SOCKET (other side closed)` on `POST /git/blobs` while the
 * same body was accepted on the next connection -- a state no in-process server had
 * produced, because a server that answers cannot also disappear. Anything else (a bad
 * JSON body, a programmer's error, a refusal to start) is let through unchanged: a retry
 * is for a connection, not for a mistake.
 */
export function failureCode(error) {
  if (error === null || typeof error !== 'object') return null;
  const cause = error.cause;
  const code = (cause !== null && typeof cause === 'object' && 'code' in cause ? cause.code : undefined) ?? error.code;
  return typeof code === 'string' ? code : null;
}

export function isNetworkFailure(error) {
  const code = failureCode(error);
  if (code !== null && (code.startsWith('UND_ERR_') || code === 'ECONNRESET' || code === 'EPIPE')) {
    return true;
  }
  return error instanceof TypeError && error.message === 'fetch failed';
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The real channel.
 *
 * `retries` is a count and the backoff is `min(2 * attempt, 10)` seconds, both measured
 * rather than chosen: `POST /git/blobs` answered `500` with an empty body on a five-entry
 * tree during v3.51's close-out and accepted the same body on the next attempt. Three
 * attempts, then the refusal, because a retry that runs for ever is a push nobody can
 * read.
 *
 * The same retry covers a connection that closes without answering. In v3.53's first real
 * push, undici threw `UND_ERR_SOCKET (other side closed)` on `POST /git/blobs`; the body
 * was accepted on the next connection. A server in the suite had never produced that
 * shape, so the test below destroys a socket rather than answering over it.
 *
 * The encoding fallback is the other measured rule. `docs/audit.md` at 1.1 MB was refused
 * as base64 with `400 malformed request` on every attempt, and the *same bytes* sent as
 * `utf-8` were accepted -- the endpoint has a size limit its error does not name, so the
 * second attempt is a second body rather than a guessed threshold. A rule like "above one
 * megabyte use utf-8" would be a number chosen from two observations, and would start
 * refusing the first file that grows past it. A binary file has no `utf-8` form, so the
 * second attempt is only made when the bytes decode.
 */
export function githubTransport({
  token,
  owner,
  repo,
  api = 'https://api.github.com',
  fetchImpl = globalThis.fetch,
  sleep = sleepFor,
  retries = 4,
  record = null,
}) {
  if (typeof token !== 'string' || token === '') {
    throw new TypeError('the GitHub transport needs a token: it is read from the environment and never committed');
  }
  const base = `${api}/repos/${owner}/${repo}`;
  // One row per attempt, handed to the caller rather than printed: this module decides
  // nothing about a terminal, and the file a push leaves behind is the caller's to keep.
  // Absent by default so the transport stays usable without a history -- the CLI is what
  // asks for one.
  const note = typeof record === 'function' ? record : null;

  async function call(method, path, body, attempt = 1) {
    const startedAt = Date.now();
    let payload;
    let response;
    let text;
    try {
      payload = body === undefined ? undefined : JSON.stringify(body);
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(payload === undefined ? {} : { body: payload }),
      });
      text = await response.text();
    } catch (error) {
      if (note !== null) {
        note({
          at: startedAt,
          method,
          path,
          attempt,
          status: null,
          ms: Date.now() - startedAt,
          sent: payload === undefined ? 0 : Buffer.byteLength(payload),
          received: 0,
          error: {
            // The same field `isNetworkFailure` reads, so a row cannot name a code the
            // retry did not consider -- the two would be one instrument disagreeing with
            // itself, which is finding 428's shape in a different file.
            code: failureCode(error),
            message: String(error instanceof Error ? error.message : error).slice(0, 200),
          },
        });
      }
      // A closed socket is not a status: undici throws instead of answering, so the 5xx
      // retry below never sees it. Retry the same request with the same backoff; a failure
      // that is not a broken connection is let through as itself.
      if (isNetworkFailure(error) && attempt < retries) {
        await sleep(Math.min(2 * attempt, 10) * 1000);
        return call(method, path, body, attempt + 1);
      }
      throw error;
    }
    if (note !== null) {
      const remaining = response.headers?.get?.('x-ratelimit-remaining') ?? null;
      const budget = remaining === null ? null : Number(remaining);
      note({
        at: startedAt,
        method,
        path,
        attempt,
        status: response.status,
        ms: Date.now() - startedAt,
        sent: payload === undefined ? 0 : Buffer.byteLength(payload),
        received: Buffer.byteLength(text),
        // Only when the API said: a synthetic `0` would read as an exhausted quota on a
        // server that never mentioned one, and that is the number an operator acts on.
        ...(Number.isInteger(budget) ? { remaining: budget } : {}),
      });
    }
    if (response.status >= 500 && attempt < retries) {
      await sleep(Math.min(2 * attempt, 10) * 1000);
      return call(method, path, body, attempt + 1);
    }
    if (!response.ok) throw new ApiError(method, path, response.status, text);
    return text === '' ? {} : JSON.parse(text);
  }

  async function upload(raw, path) {
    const bodies = [{ content: raw.toString('base64'), encoding: 'base64' }];
    const text = raw.toString('utf8');
    if (Buffer.from(text, 'utf8').equals(raw)) bodies.push({ content: text, encoding: 'utf8' });
    let last = null;
    for (const payload of bodies) {
      try {
        const blob = await call('POST', '/git/blobs', payload);
        return blob.sha;
      } catch (error) {
        last = error;
        if (!(error instanceof ApiError) || error.status !== 400) throw error;
      }
    }
    throw new TypeError(`the API refuses ${path} in every encoding: ${String(last?.message)}`);
  }

  return {
    name: 'github',
    async head(branch) {
      try {
        const ref = await call('GET', `/git/ref/heads/${branch}`);
        return { sha: ref.object.sha };
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    /**
     * Every ref in the repository, as names -- or as many pages of them as this channel is
     * willing to read.
     *
     * Only asked for after a branch read answered 404, because that is the one moment the
     * channel cannot tell "this branch is new" from "this branch is misspelled".
     *
     * A hundred is the page size and one page is not a listing. Until v3.61 this read one
     * page and called it "every ref in the repository", so a repository with a hundred and
     * forty branches was refused with "100 branch(es)" -- a count the reader is entitled to
     * act on, off by forty, and a name that lived on page two could not be printed at all.
     *
     * The walk is bounded because it runs inside a refusal: ten pages is a thousand refs,
     * which is more than a repository that has an operator mistyping a branch name has
     * branches, and the sentence then says "at least" rather than a number it did not finish
     * counting. `complete` is how the sentence knows which of the two it was given.
     */
    async refs() {
      const names = [];
      const tips = [];
      for (let page = 1; ; page += 1) {
        let listing;
        try {
          listing = await call('GET', `/git/refs?per_page=${REF_PAGE_SIZE}&page=${page}`);
        } catch (error) {
          // An empty repository is the one state the API announces with a status instead of
          // a list, and `409` here means exactly what an empty array means: there is no ref
          // to report. Anything else is forwarded, because a listing this channel was not
          // allowed to read is not a repository with no refs -- the two would differ by a
          // push onto a branch that already exists. A `409` on a page after the first is
          // forwarded for the same reason: the first page of an empty repository is `[]`, so
          // a later page failing this way is an answer that cannot be read as "no refs".
          if (error instanceof ApiError && error.status === 409 && page === 1) return { names, tips, complete: true };
          throw error;
        }
        if (!Array.isArray(listing)) {
          throw new TypeError(
            `the API answered the ref listing with ${typeof listing}, which is not a list of refs: ` +
              'reading it as an empty repository would publish a whole history onto a branch that may exist',
          );
        }
        for (const ref of listing) names.push(String(ref.ref));
        for (const ref of listing) tips.push({ name: String(ref.ref), sha: String(ref.object?.sha ?? '') });
        // A page shorter than the page size is the last page. A *full* page is not: a
        // hundred is both the page size and the size of a repository that has a hundred
        // refs, and only the next question can tell the two apart.
        if (listing.length < REF_PAGE_SIZE) return { names, tips, complete: true };
        if (page >= REF_PAGES_MAX) return { names, tips, complete: false };
      }
    },
    /**
     * Whether the remote holds a commit.
     *
     * The one question the creation path asks before it decides to replay a history, and it
     * is asked once because a commit is closed: a remote that holds it holds its tree, its
     * parents and every ancestor, so the tip is the only name that has to be checked.
     *
     * `404` is the answer that means "no". Every other status is forwarded, because a `403`
     * on this read is not a commit that is absent -- and the two differ by a replay of a
     * history the remote already has, which on this repository is three hundred uploads.
     */
    async holds(sha) {
      try {
        await call('GET', `/git/commits/${sha}`);
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return false;
        throw error;
      }
    },
    async commit(sha) {
      const commit = await call('GET', `/git/commits/${sha}`);
      return { sha: commit.sha, tree: commit.tree.sha };
    },
    async tree(sha) {
      const listing = await call('GET', `/git/trees/${sha}?recursive=1`);
      return { entries: listing.tree, truncated: listing.truncated === true };
    },
    async createTree({ base, entries, blobs }) {
      const sent = [];
      for (const entry of entries) {
        if (entry.sha === null) {
          sent.push(entry);
          continue;
        }
        const uploaded = blobs.get(entry.sha);
        // A deletion carries no blob; every other entry must, or the tree request would
        // name a SHA the remote has never seen and the API answers 422 with the path --
        // a sentence about a tree, for a mistake made here.
        if (!Buffer.isBuffer(uploaded)) {
          throw new TypeError(`the plan carries a blob for '${entry.path}' that the executor did not read`);
        }
        const sha = await upload(uploaded, entry.path);
        sent.push({ ...entry, sha });
      }
      const request = { tree: sent, ...(base === null ? {} : { base_tree: base }) };
      const tree = await call('POST', '/git/trees', request);
      return tree.sha;
    },
    async createCommit({ message, tree, parents, author, committer }) {
      const commit = await call('POST', '/git/commits', {
        message,
        tree,
        parents,
        author,
        committer,
      });
      return commit.sha;
    },
    /**
     * Move the branch -- or create it, which is a different call.
     *
     * `PATCH /git/refs/heads/<branch>` updates a reference that must already exist, so an
     * absent branch cannot be moved onto a commit: it is created with `POST /git/refs`.
     * Until v3.58 this function only patched, and the unborn path therefore ended every
     * real push with a `422` described as *"the branch moved while the plan was being
     * executed: it was null and is undefined"* -- a sentence about a branch that had never
     * existed, for a call the API was never going to accept. The suite did not see it
     * because the server it drives created the branch on the PATCH, which is the one thing
     * the real endpoint refuses.
     *
     * The refusal here does **not** re-read the branch, and the moved-ref refusal above
     * does. The difference is what `expected` means: a SHA can be compared to what the
     * branch is now and the sentence can name both, while `null` says only that the branch
     * was absent -- so any answer other than "the name is taken" is noise, and a second read
     * would be a second branch read inside one push, which the readings gate refuses
     * without an exemption it would then have to grow.
     */
    async updateRef({ branch, sha, expected }) {
      if (expected === null) {
        try {
          await call('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha });
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 422) throw error;
          throw new TypeError(
            `the branch '${branch}' was absent when the plan was made and is not now: the name was taken while ` +
              'this push was being made, or the commit it was to name is not there after all. Nothing was forced ' +
              '— re-read the branch and plan again',
          );
        }
        return;
      }
      try {
        await call('PATCH', `/git/refs/heads/${branch}`, { sha, force: false });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 422) throw error;
        const now = await this.head(branch);
        throw new TypeError(
          `the branch moved while the plan was being executed: it was ${String(expected).slice(0, 9)} and is ` +
            `${String(now?.sha).slice(0, 9)}. Nothing was forced — re-read the branch and plan again`,
        );
      }
    },
  };
}

/* ------------------------------------------------------------------- local */

/**
 * A bare repository standing where the API stands.
 *
 * The objects it writes are the same objects, so a correct replay leaves the remote's
 * commit SHA equal to the local one -- which is what makes the suite's end-to-end
 * assertion a comparison of histories rather than of contents. Every write goes through
 * git plumbing and there is no fixture in it: `read-tree` + `update-index --cacheinfo` +
 * `write-tree` is what `base_tree` plus a list of entries *means*, and `commit-tree` with
 * the identities in the environment is what `POST /git/commits` means.
 */
export function localTransport({ remote }) {
  // The objects have to land in the remote and the index has to live somewhere that is
  // not it. A bare repository refuses `update-index` outright -- "this operation must be
  // run in a work tree" -- so the index lives in a scratch repository whose object
  // directory is the remote's and whose alternates are the source's. That is three
  // variables rather than a copy: nothing is moved, and `write-tree` puts the tree where
  // the next `createTree` will read it.
  const work = mkdtempSync(join(tmpdir(), 'rca-publish-work-'));
  spawnSync('git', ['init', '-q', work]);
  // No alternates to the local repository, deliberately. A transport that could *find* a
  // local object would not need it uploaded, and git skips writing an object it can
  // already reach -- so the rebuilt commit would be identical to the local one without
  // any of it having crossed the boundary, and the assertion at the end would pass on a
  // channel that sent nothing. The remote is the whole world this side of the wire.
  const env = {
    ...process.env,
    GIT_DIR: join(work, '.git'),
    GIT_WORK_TREE: work,
    GIT_OBJECT_DIRECTORY: join(remote, 'objects'),
  };

  return {
    name: 'local',
    dispose() {
      rmSync(work, { recursive: true, force: true });
    },
    async head(branch) {
      const result = spawnSync('git', ['-C', remote, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], {
        encoding: 'utf8',
      });
      if (result.status !== 0) return null;
      return { sha: result.stdout.trim() };
    },
    /** The same answer the API gives: full ref names, one per line, in `refs/` order. */
    async refs() {
      const out = runGit(remote, ['for-each-ref', '--format=%(refname) %(objectname)'], { encoding: 'utf8' });
      // One call and no paging: a directory listing has no page size, so `complete` is a
      // fact here rather than a bound -- which is what the interface promises and what the
      // sentence needs in order to print an exact count. The SHA comes with the name because
      // a plan needs a tip to hang on, and asking for it separately would be a second walk.
      const tips = out
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => {
          const [name, sha] = line.split(' ');
          return { name, sha };
        });
      return { names: tips.map((tip) => tip.name), tips, complete: true };
    },
    /** The same question of the object store: `cat-file -e` on the peel answers by status. */
    async holds(sha) {
      return spawnSync('git', ['-C', remote, 'cat-file', '-e', `${sha}^{commit}`]).status === 0;
    },
    async commit(sha) {
      const raw = runGit(remote, ['cat-file', 'commit', requireSha(sha, 'a commit to read')], { encoding: 'utf8' });
      const line = raw.split('\n').find((row) => row.startsWith('tree '));
      return { sha, tree: requireSha(line.slice(5), 'the tree of a commit') };
    },
    async tree(sha) {
      const out = runGit(remote, ['ls-tree', '-r', '-z', requireSha(sha, 'a tree to list')], { encoding: 'utf8' });
      const entries = out
        .split('\0')
        .filter((row) => row !== '')
        .map((row) => {
          const tab = row.indexOf('\t');
          const [mode, type, blob] = row.slice(0, tab).split(' ');
          return { path: row.slice(tab + 1), mode, type, sha: blob };
        });
      return { entries, truncated: false };
    },
    async createTree({ base, entries, blobs }) {
      runGit(work, ['read-tree', base === null ? '--empty' : base], { env, encoding: 'utf8' });
      for (const entry of entries) {
        if (entry.sha === null) {
          // `--force-remove` rather than `--remove`: the index has no working tree behind
          // it, and `--remove` refuses a path whose file is not there -- which is every
          // path in this repository.
          runGit(work, ['update-index', '--force-remove', '--', entry.path], { env, encoding: 'utf8' });
          continue;
        }
        const raw = blobs.get(entry.sha);
        if (!Buffer.isBuffer(raw)) {
          throw new TypeError(`the plan carries a blob for '${entry.path}' that the executor did not read`);
        }
        const sha = runGit(work, ['hash-object', '-w', '--stdin'], { env, input: raw, encoding: 'utf8' }).trim();
        runGit(work, ['update-index', '--add', '--cacheinfo', `${entry.mode},${sha},${entry.path}`], {
          env,
          encoding: 'utf8',
        });
      }
      return runGit(work, ['write-tree'], { env, encoding: 'utf8' }).trim();
    },
    async createCommit({ message, tree, parents, author, committer }) {
      const commitEnv = {
        ...env,
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_AUTHOR_DATE: author.date,
        GIT_COMMITTER_NAME: committer.name,
        GIT_COMMITTER_EMAIL: committer.email,
        GIT_COMMITTER_DATE: committer.date,
      };
      const args = ['commit-tree', tree];
      for (const parent of parents) args.push('-p', parent);
      // `--no-gpg-sign` because a repository may be configured to sign, and a signature
      // this channel cannot reproduce would make every rebuilt SHA differ for a reason
      // that has nothing to do with the plan.
      args.push('--no-gpg-sign');
      return runGit(work, args, { env: commitEnv, input: message, encoding: 'utf8' }).trim();
    },
    async updateRef({ branch, sha, expected }) {
      const current = await this.head(branch);
      const now = current === null ? null : current.sha;
      if (now !== expected) {
        // The two refusals say different things because `expected` knows different things:
        // a SHA can be compared and both halves printed, while an absent branch can only be
        // reported as one that is not absent any more. The sentence matches the API's, so a
        // push that meets the race reads the same whichever transport carried it.
        throw new TypeError(
          expected === null
            ? `the branch '${branch}' was absent when the plan was made and is not now: it is ${String(now).slice(0, 9)}, ` +
              'and nothing was forced — re-read the branch and plan again'
            : `the branch moved while the plan was being executed: it was ${String(expected).slice(0, 9)} and is ` +
              `${String(now).slice(0, 9)}. Nothing was forced — re-read the branch and plan again`,
        );
      }
      if (now !== null) {
        const fastForward = spawnSync('git', ['-C', remote, 'merge-base', '--is-ancestor', now, sha]).status === 0;
        if (!fastForward) {
          throw new TypeError(
            `refusing to move ${branch} backwards: ${sha.slice(0, 9)} does not descend from ${now.slice(0, 9)}`,
          );
        }
      }
      runGit(remote, ['update-ref', `refs/heads/${branch}`, sha], { encoding: 'utf8' });
    },
  };
}

