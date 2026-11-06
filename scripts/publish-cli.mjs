#!/usr/bin/env node
/**
 * The entry point a push goes through, and the three exits it can take.
 *
 * ## Why this is a program and not a function of the last one
 *
 * `publish.mjs` decides nothing about a terminal: it takes a revision and a transport and
 * returns a record. Somebody has to read the environment, refuse a missing token, say
 * what the plan is, and choose an exit code -- and that somebody has to be a *gate*, so
 * that `verify-gates-are-testable.mjs` can hollow it and some test can notice. A gate is
 * hollowed by inserting `process.exit(0)` after its imports; the test below it expects a
 * refusal from this script, so a hollowed copy exits 0 and the suite goes red. That is
 * the whole reason the boundary is here.
 *
 * ## The token is never an argument
 *
 * `GITHUB_TOKEN` only. An argument is a string in a process table and in a shell
 * history, and this repository has one credential that must never be either. The
 * transport refuses an empty token rather than sending a request that will answer 401,
 * because a 401 names the header and not the thing somebody forgot to export.
 *
 * ## Usage
 *
 *   node scripts/publish-cli.mjs --rev REV --branch NAME [--root DIR] [--dry-run]
 *   node scripts/publish-cli.mjs --rev REV --branch NAME --transport local --remote DIR
 *
 * `--dry-run` reads the remote and prints the plan without creating any object, which is
 * the one thing the previous channel could not do without also being able to publish.
 *
 * `--new-branch` is the caller saying a branch the remote does not have is meant to be new.
 * Without it a `404` on the branch read is refused when the repository holds any ref at
 * all, because at that point the missing branch is a *name* that is wrong, and the push
 * that follows would create the wrong branch rather than fail.
 *
 * ## What `--record` writes, and why it writes it here
 *
 * One **push** per invocation: `{ rev, branch, rows }`, where `rows` are the attempts the
 * transport made. The transport knows the rows and not the push -- it is handed a branch
 * and a body and never told that a publish began -- while this file has the branch, the
 * revision and the moment they belong together. So the unit is assembled here, and a push
 * that made no request writes nothing at all rather than an empty push.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { githubTransport, localTransport, publish } from './publish.mjs';
import { readRev } from './publish-plan.mjs';
import { appendReadings, formatSummary, summariseReadings } from './publish-readings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const USAGE =
  'usage: publish-cli.mjs --rev REV --branch NAME [--root DIR] [--dry-run] [--no-gate] [--new-branch]\n' +
  '       [--transport github|local] [--repo OWNER/NAME] [--remote DIR] [--record FILE] [--api URL]';

/**
 * The flags that take no value.
 *
 * One list rather than one `if` per flag at the bottom of the loop: a valueless flag that
 * is not here swallows the argument after it, and `--new-branch --rev HEAD` would then
 * refuse with "--rev is required" -- a sentence about the wrong mistake.
 */
const VALUELESS = new Set(['--dry-run', '--no-gate', '--new-branch']);

/** `--key value` and `--flag`, and a refusal for anything else: a typo is not a default. */
export function parseArgs(argv) {
  const options = { root: ROOT, branch: null, rev: null, dryRun: false, gate: true, newBranch: false, transport: 'github', repo: null, remote: null, record: null, api: 'https://api.github.com' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--no-gate') options.gate = false;
    else if (flag === '--new-branch') options.newBranch = true;
    else if (flag === '--root') options.root = resolve(String(value));
    else if (flag === '--rev') options.rev = value;
    else if (flag === '--branch') options.branch = value;
    else if (flag === '--transport') options.transport = value;
    else if (flag === '--repo') options.repo = value;
    else if (flag === '--remote') options.remote = value;
    else if (flag === '--record') options.record = value;
    else if (flag === '--api') options.api = value;
    else return { error: `unknown argument '${flag}'` };
    // A flag that took a value consumed it: without this, `--rev HEAD` reads HEAD as the
    // next flag and the refusal names the value instead of the mistake.
    if (!VALUELESS.has(flag)) index += 1;
  }
  if (options.rev === undefined || options.rev === null) return { error: '--rev is required' };
  if (options.branch === undefined || options.branch === null) return { error: '--branch is required' };
  if (options.record !== null && options.transport === 'local') {
    // The local transport writes git objects to a directory and makes no request, so a
    // file recorded there would be empty -- and an empty history is a file that says the
    // channel was measured when nothing was. Refused here rather than written and caught
    // by the reader, because the mistake is this argument's.
    return { error: '--record needs a transport that answers: the local transport makes no request to record' };
  }
  return { options };
}

function transportFor(options, env, readings) {
  if (options.transport === 'local') {
    if (options.remote === null) throw new TypeError('--transport local needs --remote DIR: a bare repository to write');
    return localTransport({ remote: resolve(options.remote) });
  }
  if (options.transport !== 'github') throw new TypeError(`'${options.transport}' is not a transport this channel has`);
  const [owner, repo] = String(options.repo ?? '').split('/');
  if (!owner || !repo) throw new TypeError('--repo OWNER/NAME is required for the GitHub transport');
  return githubTransport({
    token: env.GITHUB_TOKEN ?? env.GH_TOKEN ?? '',
    owner,
    repo,
    api: options.api,
    // Collected in memory and written once the push is over, so a full disk cannot turn a
    // published push into a failed one -- and a failed push still leaves the rows that say
    // why, which is the half anybody reads.
    ...(readings === null ? {} : { record: (row) => readings.push(row) }),
  });
}

async function main(argv, env, out) {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    out(`${parsed.error}\n${USAGE}`);
    return 2;
  }
  const { options } = parsed;
  const readings = options.record === null ? null : [];
  const transport = transportFor(options, env, readings);
  let code = 0;
  try {
    const result = await publish({
      root: options.root,
      rev: options.rev,
      branch: options.branch,
      transport,
      gate: options.gate,
      dryRun: options.dryRun,
      newBranch: options.newBranch,
      log: (line) => out(line),
    });
    if (result.state === 'current') code = 0;
    else if (result.state === 'planned') {
      out(`dry run: ${result.plan.commits.length} commit(s) would be published; nothing was created`);
      code = 0;
    } else {
      out(
        result.identical
          ? `VERIFIED: ${options.branch} is at ${result.tip}, which is the local commit, byte for byte`
          : `${options.branch} is at ${result.tip}; the tip's tree is the local one and its SHA is not ` +
              '(the history it hangs on is not the local history)',
      );
      code = 0;
    }
  } finally {
    if (typeof transport.dispose === 'function') transport.dispose();
    if (readings !== null) {
      // After the transport is disposed and outside the push's own result, because the two
      // facts are separate: the remote may hold the commit while the history is unwritable,
      // and a reader has to be told which of the two happened rather than one exit code
      // standing for both.
      if (readings.length === 0) {
        // A push that made no request is not a push the file can hold: the gate refused, or
        // the revision did not resolve, and either way there is nothing this channel met.
        out('publish-readings: no request was made, so nothing was recorded');
      } else {
        try {
          // The tip is named here rather than in the transport, because the transport does
          // not know what a push is -- `publish()` does, and this is the only place that
          // has both the question and the answer. `rev` is null when the revision cannot be
          // resolved, which is the state the file records as "nobody named this tip"
          // instead of an empty string that would read as a named one.
          const merged = appendReadings(resolve(ROOT, options.record), {
            rev: resolvedRev(options.root, options.rev),
            branch: options.branch,
            rows: readings,
          });
          out(`${formatSummary(summariseReadings(merged))} (${merged.length} push(es) in ${options.record})`);
        } catch (error) {
          out(`RECORD FAILED: ${String(error.message ?? error)}`);
          code = 1;
        }
      }
    }
  }
  return code;
}

/**
 * The commit a push carried, or `null` when the revision cannot be resolved.
 *
 * The push itself refuses an unresolvable revision one call earlier and with its own
 * words, so a `null` reaching the file is only ever the case where the push got as far as
 * making requests -- and a recording that invented a SHA would be worse than one that says
 * nobody named it.
 */
function resolvedRev(root, rev) {
  try {
    return readRev({ root, rev });
  } catch {
    return null;
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2), process.env, (line) => console.log(line)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`publish failed: ${String(error.message ?? error)}`);
      process.exit(1);
    },
  );
}

export { main };
