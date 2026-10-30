#!/usr/bin/env node
/**
 * Refuse a commit whose index holds a byte a battery's journal says it mutated.
 *
 * ## What it is for
 *
 * Finding 310: `git add -A` ran while a gate-test battery held `ingest/jaeger.ts`
 * rewritten, and the commit published the mutation. `git status` was clean, and it
 * was right to be -- it compares the tree to the index, and the index had taken
 * the mutation too. The pair nothing read is **index against record**.
 * `scripts/staged-mutation.mjs` holds the comparison and its reasoning; this file
 * is the reader at the boundary, because a module nothing calls is a module that
 * answers nothing.
 *
 * ## Why a commit and not a push
 *
 * The publish path in this workspace does not use `git push` -- it speaks the Git
 * Data API -- so a `pre-push` hook has never run for any of its pushes, and that
 * is a measured fact this repository wrote down when it built the gate receipt.
 * Uploading goes through `git ls-tree` and `git cat-file` of the **revision**, so
 * the published bytes are the commit's bytes and nothing else: commit creation is
 * the only boundary at which a mutation can enter what is published. That is the
 * boundary this reads.
 *
 * ## Two exits, and the quiet one
 *
 * `--quiet` suppresses the passing line, and the hook passes it: a hook that
 * prints on every commit is a hook people stop reading, and the one line it would
 * print is the line that says nothing happened. The failing path is never quiet.
 *
 *   node scripts/check-staged-mutation.mjs [--quiet] [--cache <dir>]
 */

import { spawnSync } from 'node:child_process';
import { parseIndex, judgeJournals, readJournals } from './staged-mutation.mjs';
import { isHolder } from './injection/journal.mjs';

function usage(message) {
  if (message !== undefined) console.error(`check-staged-mutation: ${message}`);
  console.error('usage: check-staged-mutation.mjs [--quiet] [--cache <dir>]');
  process.exit(1);
}

function args(argv) {
  const options = { quiet: false, cache: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--quiet') options.quiet = true;
    else if (flag === '--cache') {
      const value = argv[(index += 1)];
      if (value === undefined || value.startsWith('--')) usage('--cache needs a directory');
      options.cache = value;
    } else usage(`unknown argument: ${flag}`);
  }
  return options;
}

/** `git` in this directory, or `null` -- every caller has a sentence for that. */
function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error !== undefined || result.status !== 0) return null;
  return result.stdout;
}

function main() {
  const options = args(process.argv.slice(2));
  const problems = [];

  const top = git(['rev-parse', '--show-toplevel']);
  if (top === null) {
    // Not a checkout is not a pass: a hook that cannot see an index has not
    // checked one, and saying so is the difference this whole campaign is about.
    problems.push(
      'this directory is not a git checkout, so there is no index to compare against any record',
    );
  }

  const journals = options.cache === undefined ? readJournals() : readJournals(options.cache);
  for (const record of journals.unreadable) {
    problems.push(
      `${record.name} cannot be read (${record.why}); the tree it was holding is unknown, ` +
        "so it is not known whether this commit publishes part of it -- run `pnpm verify:local`, " +
        'whose preflight repairs an abandoned record or refuses a live one',
    );
  }

  let verdict = { asked: 0, differing: [], outside: [], unnamed: [], running: [] };
  if (top !== null && journals.records.length > 0) {
    // Asked of git rather than assumed: on a `sha256` checkout a `sha1` blob id
    // differs for every file, and the message would blame the tree.
    const format = git(['rev-parse', '--show-object-format']);
    const algorithm = format === null ? 'sha1' : format.trim();
    const index = git(['ls-files', '-s', '-z']);
    if (index === null) {
      problems.push('git could not report the index, so no staged byte was compared');
    } else {
      verdict = judgeJournals({
        records: journals.records,
        staged: parseIndex(index),
        root: top.trim(),
        algorithm,
        live: (record) => isHolder(Number(record.pid ?? -1), record.script),
      });
    }
  }

  for (const entry of verdict.unnamed) {
    problems.push(
      `${entry.path}: ${entry.journal} records this file without the bytes it held, so the staged ` +
        'copy cannot be compared to it -- the record is from a writer this reader does not know',
    );
  }
  if (verdict.outside.length > 0) {
    // A record written here names this checkout's own paths, so a path that is
    // not one means the record describes a different tree -- a moved checkout, or
    // a cache shared between two. Comparing the rest and reporting success would
    // be a pass over a subset nobody chose.
    problems.push(
      `${String(verdict.outside.length)} path(s) in the journal are not in this checkout, so the ` +
        'record describes a tree this index is not: run `git status` and `pnpm verify:local` here',
    );
  }
  for (const entry of verdict.differing.slice(0, 5)) {
    problems.push(
      `${entry.path} is staged at a blob a battery's journal says was mutated ` +
        `(recorded bytes ${entry.recorded}, staged blob ${entry.staged})`,
    );
  }
  if (verdict.differing.length > 5) {
    problems.push(`and ${String(verdict.differing.length - 5)} more file(s) staged the same way`);
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-staged-mutation: ${problem}`);
    if (verdict.differing.length > 0) {
      console.error(
        'check-staged-mutation: the bytes in the index are a battery\'s mutation, not the file\'s ' +
          'content; unstage them with `git restore --staged <path>` once the run that holds the ' +
          'journal has finished, or wait for it and commit again',
      );
    }
    console.error(`check-staged-mutation: FAILED (${String(problems.length)} problem(s))`);
    process.exit(1);
  }

  const none = journals.records.length === 0;
  const holding = verdict.running.map((one) => `${one.label} (pid ${String(one.pid)})`).join(', ');
  const summary = none
    ? 'no battery journal, so no recorded byte to compare the index against'
    : `${String(verdict.asked)} recorded file(s) are staged at the bytes their journal recorded` +
      `${holding === '' ? '' : `; ${holding} is measuring this tree now`}`;
  if (!options.quiet) console.log(`check-staged-mutation: OK — ${summary}`);
}

main();
