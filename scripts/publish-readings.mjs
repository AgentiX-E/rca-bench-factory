#!/usr/bin/env node
/**
 * What the API answered on a real push, kept as a reading rather than as a memory.
 *
 * ## The gap this closes
 *
 * Finding 412 recorded the first real push losing a request to a closed socket, and the
 * repair was a retry that recognises a broken connection. What no round could do was
 * answer the next question: *on the push that worked, what did the API actually say?*
 * The channel printed its plan and its verdict and nothing about the thirty-odd
 * requests underneath them -- how many, how long, which of them retried, what the
 * upstream answered on the ones that did. Every later repair therefore started from one
 * anecdote per round, which is the sample of one `R10` was written about one layer over.
 *
 * The entry on the open list says it exactly: *keep a reading of what the API answered
 * on every real push.* This is that file, and this is the reader for it.
 *
 * ## Why a record of attempts rather than of pushes
 *
 * A push is not a unit the API sees. The unit is one request, and every failure this
 * channel has met arrived on one: `POST /git/blobs` answered `500` with an empty body
 * once, the same body was accepted on the next connection, and a socket closed under a
 * third. A per-push average would have hidden all three. So the file holds one row per
 * **attempt**, and the retries are visible as consecutive rows of the same request with
 * `attempt` counting up.
 *
 * ## What the checks can and cannot say
 *
 * They can say the file is a record of what a transport did: every row has a method, a
 * path, an attempt, a status **or** an error, and a duration; the timestamps do not run
 * backwards; and a second attempt is preceded by its first. They cannot say the numbers
 * are true -- only the process that made the request knows that -- and they do not
 * pretend to. A row that says `500` on an attempt that actually got `201` would pass
 * every check here, which is the same limit `check-open-list` states about its own
 * entries.
 *
 * The one inference the checks *do* make is about gaps. If a row says `attempt: 3` and
 * the row before it is not attempt 2 of the same request, then a row is missing or out
 * of order, and both make the retry count a lie -- so it is refused rather than printed.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** Where the history lives. Required by `--check`, because a missing file answers nothing. */
export const READINGS = 'golden-master/publish-readings.json';

const METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

/** A row is well formed, or it is a number a later reader would take on trust. */
function shapeErrors(row, index) {
  const at = `row ${index + 1}`;
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return [`${at} is not an object`];
  const problems = [];
  const integer = (value, name, minimum) => {
    if (!Number.isInteger(value) || value < minimum) problems.push(`${at}: \`${name}\` is ${JSON.stringify(value)}, not an integer >= ${minimum}`);
  };
  integer(row.at, 'at', 0);
  if (typeof row.method !== 'string' || !METHODS.has(row.method)) problems.push(`${at}: \`method\` is ${JSON.stringify(row.method)}, which is not a method this channel uses`);
  if (typeof row.path !== 'string' || !row.path.startsWith('/') || /\s/.test(row.path)) {
    problems.push(`${at}: \`path\` is ${JSON.stringify(row.path)}, not a path from the API root`);
  }
  integer(row.attempt, 'attempt', 1);
  integer(row.ms, 'ms', 0);
  integer(row.sent, 'sent', 0);
  integer(row.received, 'received', 0);
  if (row.remaining !== undefined) integer(row.remaining, 'remaining', 0);
  // The status and the error are the two halves of one fact: a request either got an
  // answer or it did not. Both present is a row that cannot say which happened; neither
  // present is a row that says nothing happened at all, which no attempt is.
  //
  // `null` is required rather than permitted as an absence: a row that simply omits the
  // field would satisfy "no status" by accident, and the writer that forgot it would look
  // the same as the request that got no answer.
  const answered = row.status === null ? false : Number.isInteger(row.status) && row.status >= 100 && row.status <= 599;
  if (row.status === undefined) problems.push(`${at}: has no \`status\` field, so a missing answer and a forgotten field read the same`);
  else if (row.status !== null && !answered) problems.push(`${at}: \`status\` is ${JSON.stringify(row.status)}, not an HTTP status and not null`);
  const hasError = row.error !== undefined && row.error !== null;
  if (hasError) {
    if (row.status !== null) problems.push(`${at}: carries both a status and an error, so it does not say whether the API answered`);
    if (typeof row.error !== 'object' || typeof row.error.message !== 'string' || row.error.message === '') {
      problems.push(`${at}: the error has no message, so the row says a request failed without saying how`);
    } else if (row.error.code !== null && typeof row.error.code !== 'string') {
      problems.push(`${at}: the error's code is ${JSON.stringify(row.error.code)}, which is neither a string nor null`);
    }
  } else if (row.status === null) {
    problems.push(`${at}: has no status and no error, so the row records an attempt that neither answered nor failed`);
  }
  return problems;
}

/**
 * Every problem with a set of readings, in one list.
 *
 * A list rather than a throw, because a reader that stops at the first defect in a file
 * of two hundred rows makes the operator re-run the gate once per defect. The same
 * argument `check-doc-counts` makes about its own diagnostics.
 */
export function readingErrors(entries) {
  if (Array.isArray(entries) !== true) return ['the file is not an array of rows'];
  if (entries.length === 0) {
    return ['the file holds no readings, so nothing on this channel has ever been measured; a reading of nothing is not a reading'];
  }
  const problems = [];
  // A loop rather than `problems.push(...shapeErrors(...))`: the spread's length is a
  // function of the rows, which is the shape `spread-append-guard` refuses -- the same
  // repair `historyErrors` needed in v3.55, for the same reason.
  entries.forEach((row, index) => {
    for (const problem of shapeErrors(row, index)) problems.push(problem);
  });
  // Shape first: the two order rules below read fields the shape check has just judged,
  // and a row without an `attempt` would otherwise be reported twice for one defect.
  if (problems.length > 0) return problems;
  for (let index = 1; index < entries.length; index += 1) {
    const row = entries[index];
    const previous = entries[index - 1];
    if (row.at < previous.at) {
      problems.push(`row ${index + 1} happened ${previous.at - row.at} ms before the row above it, so the file is not in the order the requests were made`);
    }
    if (row.attempt > 1) {
      const continues = previous.method === row.method && previous.path === row.path && previous.attempt === row.attempt - 1;
      if (!continues) {
        problems.push(
          `row ${index + 1} is attempt ${row.attempt} of ${row.method} ${row.path} and the row above it is ` +
            `attempt ${previous.attempt} of ${previous.method} ${previous.path}: a retry needs its own first attempt, ` +
            'or the number of retries this file reports is a number it cannot defend',
        );
      }
    }
  }
  return problems;
}

/**
 * What the readings say, in one line and in one object.
 *
 * `retried` counts *retries*, not rows: three attempts on one request is two retries, and
 * reporting it as three would make a channel that retries once look like one that retries
 * twice.
 */
export function summariseReadings(entries) {
  const statuses = new Map();
  let retried = 0;
  let unanswered = 0;
  let slowest = null;
  for (const row of entries) {
    const key = row.status === null || row.status === undefined ? 'no-answer' : String(row.status);
    statuses.set(key, (statuses.get(key) ?? 0) + 1);
    if (row.status === null || row.status === undefined) unanswered += 1;
    if (row.attempt > 1) retried += 1;
    if (slowest === null || row.ms > slowest.ms) slowest = row;
  }
  const order = [...statuses.entries()].sort((a, b) => {
    if (a[0] === 'no-answer') return 1;
    if (b[0] === 'no-answer') return -1;
    return Number(a[0]) - Number(b[0]);
  });
  return {
    total: entries.length,
    retried,
    unanswered,
    statuses: order.map(([status, count]) => ({ status, count })),
    slowest: slowest === null ? null : { method: slowest.method, path: slowest.path, ms: slowest.ms },
  };
}

/** The summary as the sentence a terminal prints, so the gate's own output is checkable. */
export function formatSummary(summary) {
  const statuses = summary.statuses.map((one) => `${one.status}x${one.count}`).join(' ');
  const slowest = summary.slowest === null ? 'nothing was measured' : `slowest ${summary.slowest.method} ${summary.slowest.path} ${summary.slowest.ms} ms`;
  return (
    `publish-readings: ${summary.total} request(s), ${summary.retried} retried, ` +
    `${summary.total - summary.unanswered} answered, ${summary.unanswered} unanswered; ${slowest}; ` +
    `statuses ${statuses}`
  );
}

/**
 * Append this push's rows to the history, and report how many the file holds.
 *
 * Append rather than replace, because the question the file answers is *what has this
 * channel ever met* -- a replace would keep the last push and delete the day the socket
 * closed, which is the only row anybody will ever want.
 *
 * A file that exists but cannot be read is **not** overwritten. Losing a history to a
 * parse error is the failure `--seed` was written to avoid one layer over, and here the
 * repair is the operator's: the old rows are still there to be looked at.
 */
export function appendReadings(file, entries) {
  const path = resolve(file);
  let existing = [];
  if (existsSync(path)) {
    const text = readFileSync(path, 'utf8');
    try {
      existing = JSON.parse(text);
    } catch (error) {
      throw new TypeError(`the history at ${file} is not JSON, so appending would replace it: ${String(error.message)}`);
    }
    if (Array.isArray(existing) !== true) {
      throw new TypeError(`the history at ${file} is not an array of rows, so appending would replace it`);
    }
  }
  const merged = [...existing, ...entries];
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return merged.length;
}

/**
 * What a reader asked for, from the two flags it has.
 *
 * A `--file` with no value is refused by name rather than read as the next flag: the same
 * mistake `publish-cli` refuses, and for the same reason -- a typo is not a default.
 */
export function parseArgs(argv) {
  const options = { file: READINGS, check: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--check') options.check = true;
    else if (argv[index] === '--file') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) return { error: '--file needs a path' };
      options.file = value;
      index += 1;
    } else return { error: `unknown argument '${argv[index]}'` };
  }
  return { options };
}

/** The file's rows, or the reason it has none. Reading and judging are one step because
 *  a verdict about a file nobody could open is not a verdict. */
export function inspect(file) {
  const path = resolve(ROOT, file);
  let entries;
  try {
    entries = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { entries: null, problems: [], error: `cannot read ${file}: ${String(error.message)}` };
  }
  return { entries, problems: readingErrors(entries), error: null };
}
