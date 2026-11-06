#!/usr/bin/env node
/**
 * What the API answered on each real push, kept as a reading rather than as a memory.
 *
 * ## The gap this closes
 *
 * Finding 412 recorded the first real push losing a request to a closed socket, and the
 * repair was a retry that recognises a broken connection. What no round could do was
 * answer the next question: *on the push that worked, what did the API actually say?*
 * The channel printed its plan and its verdict and nothing about the thirty-odd requests
 * underneath them -- how many, how long, which of them retried, what the upstream answered
 * on the ones that did. Every later repair therefore started from one anecdote per round,
 * which is the sample of one `R10` was written about one layer over.
 *
 * ## Why a record of attempts rather than of pushes
 *
 * A push is not a unit the API sees. The unit is one request, and every failure this
 * channel has met arrived on one: `POST /git/blobs` answered `500` with an empty body
 * once, the same body was accepted on the next connection, and a socket closed under a
 * third. A per-push average would have hidden all three. So a push holds one row per
 * **attempt**, and the retries are visible as consecutive rows of the same request with
 * `attempt` counting up.
 *
 * ## And why a push is still a unit of the file
 *
 * v3.56 wrote those rows into one flat list, and the flat list answered the first question
 * while destroying the second. The file it produced held **five** pushes; a reader could
 * count requests and could not say how many pushes carried them, so the open list recorded
 * the file as one round deep -- not because the history was shallow but because it had no
 * unit to be deep in. The five pushes in it differ by two orders of magnitude on the one
 * number a channel's variance lives in: the slowest request of one push is 2 120 ms and of
 * another 29 632 ms (findings 433, 434).
 *
 * So a row is a row inside a push, and a push is `{ rev, branch, rows }`. The boundary is
 * not inferred from a gap in the timestamps -- that would be a threshold read back as a
 * fact. It is structural: `publish()` asks the remote for the branch before it decides
 * anything, so **the first request of every push is `GET /git/ref/heads/<branch>`**, and a
 * second such read inside one push means either two pushes were folded together or a
 * `PATCH` was refused with `422` and the branch was read again. Both are checked.
 *
 * `rev` is the commit the push carried, or `null` for the pushes recorded before this
 * field existed: their rows never named a tip, and a reader that filled one in would be
 * inventing the one fact it is supposed to report. The summary prints how many pushes have
 * a named tip, so the gap stays a number rather than a footnote.
 *
 * ## What the checks can and cannot say
 *
 * They can say the file is a record of pushes: each has a revision, a branch and rows; each
 * row has a method, a path, an attempt, a status **or** an error, and a duration; the
 * timestamps do not run backwards; a second attempt is preceded by its first; a push begins
 * by reading the branch it publishes; and consecutive pushes do not overlap in time. They
 * cannot say the numbers are true -- only the process that made the request knows that --
 * and they do not pretend to. A row that says `500` on an attempt that actually got `201`
 * would pass every check here, which is the same limit `check-open-list` states about its
 * own entries.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** Where the history lives. Required by `--check`, because a missing file answers nothing. */
export const READINGS = 'golden-master/publish-readings.json';

const METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const SHA = /^[0-9a-f]{40}$/;

/** The path a push reads before it decides anything, and the only row a push may begin with. */
const branchRead = (branch) => `/git/ref/heads/${branch}`;
const refUpdate = (branch) => `/git/refs/heads/${branch}`;

/** A row is well formed, or it is a number a later reader would take on trust. */
function shapeErrors(row, index, where) {
  const at = `${where} row ${index + 1}`;
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
 * Every defect in one push, in one list.
 *
 * The row shape is judged first and the boundary second, because the boundary rules read
 * `method`, `path` and `attempt` -- fields the shape check has just judged, and a row
 * without them would otherwise be reported twice for one defect.
 */
function pushErrors(push, index) {
  const at = `push ${index + 1}`;
  if (push === null || typeof push !== 'object' || Array.isArray(push)) return [`${at} is not an object`];
  if (!('rows' in push) && ('method' in push || 'path' in push || 'attempt' in push)) {
    // The v3.56 shape, refused rather than upgraded: a row on its own does not say which
    // push produced it, and a reader that guessed would be inventing the one fact this
    // round added.
    return [`${at} is a row, not a push: a push is \`{ rev, branch, rows }\` and a row on its own does not say which push it belonged to`];
  }
  const problems = [];
  if (!('rev' in push)) {
    // Required, and `null` where the tip was never named -- the same argument the row's
    // `status` makes: an absent field cannot be told from a writer that forgot it.
    problems.push(`${at}: has no \`rev\` field, so a push whose tip was never named reads the same as one whose recorder forgot to ask`);
  } else if (push.rev !== null && (typeof push.rev !== 'string' || !SHA.test(push.rev))) {
    problems.push(`${at}: \`rev\` is ${JSON.stringify(push.rev)}, which is neither a 40-character commit SHA nor null`);
  }
  if (typeof push.branch !== 'string' || push.branch === '' || /\s/.test(push.branch)) {
    problems.push(`${at}: \`branch\` is ${JSON.stringify(push.branch)}, not a branch name`);
  }
  if (!Array.isArray(push.rows) || push.rows.length === 0) {
    problems.push(`${at}: \`rows\` is ${Array.isArray(push.rows) ? 'empty' : JSON.stringify(push.rows)}, and a push that made no request is not a push this file can hold`);
    return problems;
  }
  // A loop rather than `problems.push(...shapeErrors(...))`: the spread's length is a
  // function of the rows, which is the shape `spread-append-guard` refuses -- the same
  // repair `historyErrors` needed in v3.55, for the same reason.
  push.rows.forEach((row, position) => {
    for (const problem of shapeErrors(row, position, at)) problems.push(problem);
  });
  if (problems.length > 0) return problems;

  const [first] = push.rows;
  const read = branchRead(push.branch);
  if (first.method !== 'GET' || first.path !== read) {
    problems.push(
      `${at} begins with ${first.method} ${first.path}, and every push begins by reading the branch it publishes ` +
        `(GET ${read}): that row is where one push ends and the next begins, so without it the file cannot be split`,
    );
  } else if (first.attempt !== 1) {
    problems.push(`${at} begins with attempt ${first.attempt} of GET ${read}, and its first attempt belongs to a push the file does not hold`);
  }

  let refusedUpdate = false;
  for (let position = 0; position < push.rows.length; position += 1) {
    const row = push.rows[position];
    if (position > 0) {
      const previous = push.rows[position - 1];
      if (row.at < previous.at) {
        problems.push(`${at} row ${position + 1} happened ${previous.at - row.at} ms before the row above it, so the push is not in the order the requests were made`);
      }
      if (row.attempt > 1) {
        const continues = previous.method === row.method && previous.path === row.path && previous.attempt === row.attempt - 1;
        if (!continues) {
          problems.push(
            `${at} row ${position + 1} is attempt ${row.attempt} of ${row.method} ${row.path} and the row above it is ` +
              `attempt ${previous.attempt} of ${previous.method} ${previous.path}: a retry needs its own first attempt ` +
              'inside the same push, or the number of retries this file reports is a number it cannot defend',
          );
        }
      }
      // The channel re-reads the branch in exactly two places: `updateRef` answers a 422 by
      // asking what the branch moved to, and a `500` on the read itself is retried. Every
      // other second read inside one push is a second push written into the first one --
      // and a folded push always begins with attempt 1 of that read, which is what makes
      // the exemption safe rather than a hole.
      if (row.method === 'GET' && row.path === read && row.attempt === 1 && !refusedUpdate) {
        problems.push(
          `${at} row ${position + 1} reads the branch a second time and no PATCH ${refUpdate(push.branch)} above it was refused ` +
            'with 422: this file began a new push there and stored it as the end of this one',
        );
      }
    }
    if (row.method === 'PATCH' && row.path === refUpdate(push.branch) && row.status === 422) refusedUpdate = true;
  }
  return problems;
}

/**
 * Every problem with a set of pushes, in one list.
 *
 * A list rather than a throw, because a reader that stops at the first defect in a file of
 * two hundred rows makes the operator re-run the gate once per defect. The same argument
 * `check-doc-counts` makes about its own diagnostics.
 */
export function readingErrors(pushes) {
  if (Array.isArray(pushes) !== true) return ['the file is not a list of pushes'];
  if (pushes.length === 0) {
    return ['the file holds no readings, so nothing on this channel has ever been measured; a reading of nothing is not a reading'];
  }
  const problems = [];
  pushes.forEach((push, index) => {
    for (const problem of pushErrors(push, index)) problems.push(problem);
  });
  // Shape first, then order: a push whose rows are not rows has no last row to compare.
  if (problems.length > 0) return problems;
  for (let index = 1; index < pushes.length; index += 1) {
    const previous = pushes[index - 1].rows;
    const first = pushes[index].rows[0];
    const last = previous[previous.length - 1];
    if (first.at < last.at) {
      problems.push(
        `push ${index + 1} starts ${last.at - first.at} ms before push ${index} ended, so the file is not in the order the pushes were made`,
      );
    }
  }
  return problems;
}

/**
 * What one push's rows say, in one object.
 *
 * `retried` counts *retries*, not rows: three attempts on one request is two retries, and
 * reporting it as three would make a channel that retries once look like one that retries
 * twice.
 */
function summariseRows(rows) {
  const statuses = new Map();
  let retried = 0;
  let unanswered = 0;
  let slowest = null;
  for (const row of rows) {
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
    total: rows.length,
    retried,
    unanswered,
    statuses: order.map(([status, count]) => ({ status, count })),
    slowest: slowest === null ? null : { method: slowest.method, path: slowest.path, ms: slowest.ms },
  };
}

/**
 * What the file says, for the file and for each push in it.
 *
 * The per-push figures are the reason the push became a unit: a channel's variance is a
 * question about pushes, and an average over the whole file answers it with a number no
 * single push ever produced.
 */
export function summariseReadings(pushes) {
  const per = pushes.map((push) => ({ rev: push.rev, branch: push.branch, ...summariseRows(push.rows) }));
  const whole = summariseRows(pushes.flatMap((push) => push.rows));
  return {
    pushes: pushes.length,
    named: pushes.filter((push) => push.rev !== null && push.rev !== undefined).length,
    ...whole,
    per,
  };
}

/** The summary as the lines a terminal prints, so the gate's own output is checkable. */
export function formatSummary(summary) {
  const statuses = summary.statuses.map((one) => `${one.status}x${one.count}`).join(' ');
  const slowest = summary.slowest === null ? 'nothing was measured' : `slowest ${summary.slowest.method} ${summary.slowest.path} ${summary.slowest.ms} ms`;
  const headline =
    `publish-readings: ${summary.pushes} push(es) (${summary.named} with a named tip), ` +
    `${summary.total} request(s), ${summary.retried} retried, ` +
    `${summary.total - summary.unanswered} answered, ${summary.unanswered} unanswered; ${slowest}; ` +
    `statuses ${statuses}`;
  // A breakdown of one thing is that thing, so the per-push lines appear only when there
  // is more than one push to tell apart.
  if (summary.pushes <= 1) return headline;
  const lines = summary.per.map((one, index) => {
    const slowestOne = one.slowest === null ? 'nothing measured' : `slowest ${one.slowest.method} ${one.slowest.path} ${one.slowest.ms} ms`;
    const rev = one.rev === null || one.rev === undefined ? 'none' : one.rev.slice(0, 9);
    return `  push ${index + 1}/${summary.pushes} ${one.branch} rev=${rev}: ${one.total} request(s), ${one.retried} retried, ${one.unanswered} unanswered; ${slowestOne}`;
  });
  return [headline, ...lines].join('\n');
}

/**
 * Append one push to the history, and return the whole file.
 *
 * Append rather than replace, because the question the file answers is *what has this
 * channel ever met* -- a replace would keep the last push and delete the day the socket
 * closed, which is the only row anybody will ever want.
 *
 * A push that made no request is refused here as well as by the reader: a push whose array
 * is empty is a push the file cannot describe, and the caller that wrote it would otherwise
 * get a file which passes its own gate and says nothing.
 *
 * A file that exists but cannot be read is **not** overwritten. Losing a history to a
 * parse error is the failure `--seed` was written to avoid one layer over, and here the
 * repair is the operator's: the old rows are still there to be looked at.
 */
export function appendReadings(file, push) {
  if (push === null || typeof push !== 'object' || !Array.isArray(push.rows) || push.rows.length === 0) {
    throw new TypeError('a push is appended with the rows it made: a push that made no request is not one this file can hold');
  }
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
      throw new TypeError(`the history at ${file} is not an array of pushes, so appending would replace it`);
    }
  }
  const merged = [...existing, push];
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return merged;
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

/** The file's pushes, or the reason it has none. Reading and judging are one step because
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
