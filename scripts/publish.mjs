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
 * ## What the transport interface is, and why it is four calls
 *
 * A transport answers five questions and changes three things:
 *
 *   head(branch)        -> {sha} | null            (a branch that does not exist yet)
 *   commit(sha)         -> {sha, tree}
 *   tree(sha)           -> {entries, truncated}    (the whole listing, flat)
 *   createTree({base, entries, blobs}) -> tree sha
 *   createCommit({message, tree, parents, author, committer}) -> commit sha
 *   updateRef({branch, sha, expected}) -> void
 *
 * Six, and each is one of the Git Data API's own endpoints. A transport that had to know
 * what a plan is would be a second decision, and the two copies would disagree the first
 * time one of them learned something.
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
  const commit = await transport.commit(head.sha);
  const listing = await transport.tree(commit.tree);
  return {
    head: head.sha,
    tree: commit.tree,
    files: filesFromEntries(listing.entries),
    truncated: listing.truncated === true,
  };
}

/**
 * Publish `rev` to `branch` through `transport`, one planned commit at a time.
 *
 * Returns a record rather than printing one, because the two states a caller must tell
 * apart -- *the remote already had this* and *this round moved it* -- are not the same
 * claim and a log line is not a return value.
 */
export async function publish({ root, rev, branch, transport, gate = true, dryRun = false, log = () => {} }) {
  const tip = readRev({ root, rev });
  const tipTree = readTreeOf({ root, rev });
  if (gate) requireReceipt({ root, rev, tree: tipTree });

  const remote = await readRemote({ transport, branch });
  const ancestry = readAncestry({ root, rev: tip });

  // An unborn branch has no content to locate, so the whole ancestry is the window. A
  // first push is the only path here and it costs one read per commit in the history --
  // every later push pays for its window and nothing else.
  const located = remote.head === null ? { kind: 'unborn', index: ancestry.length } : locateBase({ ancestry, remote });
  if (located === null) {
    throw new TypeError(
      `the remote holds neither ${tip.slice(0, 9)} nor any tree of its ancestry: its tip is ` +
        `${String(remote.head).slice(0, 9)} (tree ${String(remote.tree).slice(0, 9)}) and no local commit has ` +
        'that tree. Publishing the tip alone is how finding 404 lost two of three commits — the tree arrives ' +
        'and the sentences do not. Rebase onto the remote, or publish the branch that produced that tip',
    );
  }
  if (located.index === 0 && remote.head === tip) {
    log(`already up to date at ${tip.slice(0, 9)}`);
    return { state: 'current', remote, plan: null, tip, identical: true };
  }
  if (located.index === 0) {
    // The remote holds this revision's tree on a different commit. The content is there
    // and the history is not, and replaying the tip would add a second commit with the
    // same message on top of a commit that already carries that tree.
    throw new TypeError(
      `the remote's tip (${String(remote.head).slice(0, 9)}) already carries the tree of ${tip.slice(0, 9)} ` +
        'and is not that commit: replaying it would publish a second commit with the same message on top of ' +
        'a tree that is already there',
    );
  }

  const window = ancestry.slice(0, located.index).reverse();
  const commits = window.map((commit) => readCommit({ root, sha: commit.sha }));
  const plan = planPublish({ remote, commits });
  for (const line of summarisePlan(plan)) log(line);
  if (dryRun) return { state: 'planned', remote, plan, tip: null, identical: false };

  const built = new Map();
  for (const step of plan.commits) {
    const base = resolveSymbol(step.base, { remote, built, field: 'tree' });
    const parent = resolveSymbol(step.parent, { remote, built, field: 'commit' });
    const blobs = new Map();
    for (const entry of step.entries) {
      if (entry.sha !== null && !blobs.has(entry.sha)) blobs.set(entry.sha, readBlob({ root, sha: entry.sha }));
    }
    const tree = step.entries.length === 0 && base !== null
      ? base
      : await transport.createTree({ base, entries: step.entries, blobs });
    const commit = await transport.createCommit({
      message: step.message,
      tree,
      parents: parent === null ? [] : [parent],
      author: step.author,
      committer: step.committer,
    });
    built.set(step.sha, { commit, tree });
    log(`${step.sha.slice(0, 9)} -> ${commit.slice(0, 9)} (tree ${tree.slice(0, 9)})`);
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
  return { state: 'published', remote, plan, tip: published.commit, identical: published.commit === tip };
}

/* ------------------------------------------------------------------ github */

/** The API's answer, with its status, so a caller can tell 404 from 422 without a string. */
export class ApiError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} -> ${status}: ${body.slice(0, 400)}`);
    this.status = status;
  }
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
}) {
  if (typeof token !== 'string' || token === '') {
    throw new TypeError('the GitHub transport needs a token: it is read from the environment and never committed');
  }
  const base = `${api}/repos/${owner}/${repo}`;

  async function call(method, path, body, attempt = 1) {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
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
    async updateRef({ branch, sha, expected }) {
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
        throw new TypeError(
          `the branch moved while the plan was being executed: it was ${String(expected).slice(0, 9)} and is ` +
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

