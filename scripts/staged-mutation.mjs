#!/usr/bin/env node
/**
 * Does the index hold a byte a battery's journal says was mutated?
 *
 * ## The defect this answers
 *
 * v3.18 was committed while `pnpm verify:local` was running in another process.
 * That is the point of running the gate in the background, and it is also how a
 * mutation reached a commit: at the moment of `git add -A` the gate-test battery
 * held `serviceName`'s process-table fallback in `ingest/jaeger.ts` rewritten to
 * `return undefined;`. `git add -A` stages **what the working tree holds**, the
 * commit published it, and the session put the bytes back minutes later. Finding
 * 310. `git status` was clean throughout it, and that is not a mistake by the
 * person who read it: `git status` compares the **tree to the index**, the index
 * had taken the mutation too, and nothing in this repository compared the index
 * to *what the tree was meant to hold*.
 *
 * ## The three things, and the one pair git never reports
 *
 * | what | how it is named |
 * | --- | --- |
 * | the working tree | bytes |
 * | the index | blob ids, via `git ls-files -s` |
 * | what the tree was meant to hold | **the journal a battery wrote before its first mutation** |
 *
 * `git status` reads the first two. `tree-repair` reads the third against the
 * first, at the start of a session. The pair that was never read is the **index**
 * against the **record**, and the index is the only one of the three that a commit
 * publishes.
 *
 * ## Why the question is content, and not presence
 *
 * The repair named in finding 310 was "a pre-commit refusal while a witness
 * journal exists". Built as stated, that refuses a commit whenever a battery is
 * running -- 30 to 350 seconds per battery, thirteen batteries -- including the
 * two states in which the commit publishes nothing the record contradicts:
 *
 * | state | journal | index | publish a mutation? |
 * | --- | --- | --- | --- |
 * | a battery is measuring, has not mutated yet | present | original bytes | **no** |
 * | a battery finished and restored | present (it settles only on its own assertion) | original bytes | **no** |
 * | a battery is holding a mutation, the index took it | present | mutated bytes | **yes** |
 *
 * So the guard asks the third row's question and only that question: for every
 * file a journal records, is the **staged blob** the one whose bytes hash to the
 * journal's digest? That is a measurement, it names the file, and it costs nothing
 * in the two harmless rows. A guard that refused all three would be turned off
 * within a day, and the way it would be turned off is `--no-verify`.
 *
 * ## Why the blob id, and not the staged bytes
 *
 * `git ls-files -s` prints each staged entry's **object id**, and git's object id
 * is `hash("blob <length>\0" + bytes)` over the recorded bytes. The journal
 * carries those bytes (base64) already, so the expected id can be computed and
 * compared **without reading a single staged file**: one `git` process for the
 * whole index, whatever its size. Reading the staged blobs would be a second way
 * to get the same answer and a much slower one; what it would add is a decoder,
 * and finding 306 is what a decoder for this corpus costs.
 *
 * The algorithm is asked for rather than assumed: `git rev-parse
 * --show-object-format` answers `sha1` for every checkout here, and `sha256` is a
 * supported format that would make every recorded comparison silently false if it
 * were assumed away.
 *
 * ## What this cannot do
 *
 * `git commit --no-verify` skips the hook, and so does any commit built by
 * something other than `git commit`. The record is on disk and this module can be
 * asked about any pair of things; what it cannot do is make the caller ask.
 * Stated here rather than left to look like more than it is.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { CACHE as DEFAULT_CACHE, JOURNAL_PREFIX } from './injection/journal.mjs';

/**
 * git's name for a byte string: `hash("blob <length>\0" + bytes)`.
 *
 * Exported because it is the whole comparison. A test pins it against
 * `git hash-object`, which is the only thing that can say whether this
 * reimplementation of git's header is right -- a constant copied out of the git
 * source would agree with itself.
 */
export function gitBlobId(bytes, algorithm = 'sha1') {
  const header = Buffer.from(`blob ${String(bytes.length)}\u0000`, 'utf8');
  return createHash(algorithm).update(header).update(bytes).digest('hex');
}

/**
 * The index, as `path -> blob id`, from `git ls-files -s -z`.
 *
 * `-z` because a path may contain a newline and the newline-separated form is the
 * one that cannot be parsed back. Only stage 0 is read: a conflicted path has
 * three entries and none of them is what a commit would publish as that path.
 */
export function parseIndex(output) {
  const staged = new Map();
  for (const record of output.split('\u0000')) {
    if (record === '') continue;
    const tab = record.indexOf('\t');
    if (tab < 0) continue;
    const [mode, id, stage] = record.slice(0, tab).split(' ');
    if (stage !== '0') continue;
    staged.set(record.slice(tab + 1), { id, mode });
  }
  return staged;
}

/**
 * Every journal in `directory`, parsed, with the ones that would not parse kept apart.
 *
 * An unreadable record is not "no record": it is a file a killed battery left and
 * somebody edited, and the tree it was holding is unknown. Answering "clean"
 * because the JSON did not parse is the failure mode this whole campaign is
 * about, one layer down.
 */
export function readJournals(directory = DEFAULT_CACHE) {
  const records = [];
  const unreadable = [];
  let names;
  try {
    names = readdirSync(directory).filter(
      (name) => name.startsWith(JOURNAL_PREFIX) && name.endsWith('.json'),
    );
  } catch {
    // No cache directory at all: no battery has ever run in this checkout, which
    // is a clean answer rather than an error.
    return { records, unreadable, directory };
  }
  for (const name of names.sort()) {
    const path = resolve(directory, name);
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      // Two writers emit this format -- `_witnesses.guard` in Python and
      // `journal.mjs` in JavaScript -- and neither is asked for a version here.
      // What is required is the shape this reader compares: an array of entries.
      // A record from a schema that renamed the field arrives as `unnamed` below
      // rather than as a clean answer.
      if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
        unreadable.push({ name, why: 'the record carries no entries array' });
        continue;
      }
      records.push({ ...parsed, name });
    } catch (error) {
      unreadable.push({ name, why: String(error.message) });
    }
  }
  return { records, unreadable, directory };
}

/** Whether `path` is inside `root`, so a journal from another checkout is not read as this one's. */
function inside(root, path) {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Compare every recorded file the index can answer for.
 *
 * `records` are journals, `staged` is `parseIndex`'s map, `root` is the checkout
 * the index belongs to, and `live` is `pid -> boolean` for the journals whose
 * writer is still running -- passed in rather than asked here, because liveness
 * needs `/proc` and a pid, and a module that spawned `ps` would be a second
 * implementation of `journal.mjs`'s `isHolder`.
 *
 * `algorithm` is the checkout's object format, asked of git rather than assumed:
 * the recorded bytes are turned into a blob id here, and a `sha256` checkout
 * compared against `sha1` ids would report every file as differing.
 *
 * The answer is one of three, and `clean` means something narrow and exact: every
 * recorded file that is staged is staged **at the bytes the record says were there
 * before the battery touched anything**.
 */
export function judgeJournals({ records, staged, root, live = () => false, algorithm = 'sha1' }) {
  const differing = [];
  const outside = [];
  const unnamed = [];
  const running = [];
  let asked = 0;
  const seen = new Set();

  for (const record of records) {
    const holder = live(record) ? { label: String(record.label ?? record.name), pid: Number(record.pid ?? -1) } : null;
    if (holder !== null) running.push(holder);
    for (const entry of record.entries) {
      const path = resolve(String(entry.path));
      if (!inside(root, path)) {
        outside.push(path);
        continue;
      }
      const key = relative(root, path).split(sep).join('/');
      if (seen.has(key)) continue;
      seen.add(key);
      const stagedEntry = staged.get(key);
      if (stagedEntry === undefined) continue;
      asked += 1;
      if (typeof entry.bytes !== 'string' || typeof entry.sha256 !== 'string') {
        unnamed.push({ path: key, journal: record.name });
        continue;
      }
      const expected = gitBlobId(Buffer.from(entry.bytes, 'base64'), algorithm);
      if (expected !== stagedEntry.id) {
        differing.push({ path: key, recorded: entry.sha256.slice(0, 12), staged: stagedEntry.id.slice(0, 12) });
      }
    }
  }
  return { asked, differing, outside, unnamed, running };
}
