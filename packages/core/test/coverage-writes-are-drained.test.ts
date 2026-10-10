import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The coverage reporter's temp-file race, held still.
 *
 * ## The defect this file exists for
 *
 * A captured full-suite run exited non-zero with **no failing test** and no
 * summary line, and printed this twice:
 *
 *     Unhandled Rejection
 *     Error: ENOENT: no such file or directory, open
 *       '.../packages/core/coverage/.tmp/coverage-11.json'
 *      ❯ Object.writeFile ../../node:internal/fs/promises:1212:14
 *
 * Nothing in the suite misbehaved. The process died while *reporting*, which is
 * why the run had no `Tests` line at all: the reporter never got that far.
 *
 * The mechanism is in vitest's provider, and it is short. `BaseCoverageProvider`
 * accumulates the per-suite `writeFile` calls for `coverage-<n>.json` in an
 * array, and `readCoverageFiles()` drains that array exactly once:
 *
 *     await Promise.all(this.pendingPromises);   // the only drain
 *     this.pendingPromises = [];                 // followed by the reset
 *
 * A write pushed *after* the drain is never read, and its rejection has no
 * owner. Node reports that as an `Unhandled Rejection`, which sets the exit
 * code with no test having failed -- the exact signature above.
 *
 * ## What this file can and cannot do
 *
 * It cannot repair the race. The code that has it is in `node_modules`, reached
 * through `vitest/coverage`, and this repository does not patch its
 * dependencies. What it can do is refuse to let the *conditions* be assembled
 * silently -- and, more importantly, refuse to let the race be described as a
 * test failure when it happens again.
 *
 * So the first assertion below is about the **provider's ordering**, read from
 * the installed artifact. That is a claim about a dependency rather than about
 * this repository, and it is written as a guard against a future vitest that
 * changes the order rather than as a proof of correctness. It is deliberately
 * *not* a snapshot of the whole function: only the two facts the reasoning
 * rests on are asserted, so an unrelated reformat does not turn this red.
 *
 * The second assertion is about this repository, and it is the one with teeth:
 * a test file that leaves an asynchronous child behind is a test file whose
 * coverage can arrive late. There are four such files, each of which awaits its
 * child, and the property they must keep is that they *await* it -- a fire-and-
 * forget spawn would satisfy a reader and fail this check.
 *
 * ## What this does not establish
 *
 * It does not establish that the race cannot happen. A late push can come from
 * anywhere the RPC bridge is still live, and the ordering guard only shows that
 * the drain-then-reset shape is still present -- which is the shape that makes
 * a late push fatal rather than merely ignored. The rate at which it happens is
 * an empirical question, measured by running the suite repeatedly, and the
 * number from that measurement belongs in `docs/audit.md`, not in a test.
 *
 * It also does not establish that node's `Unhandled Rejection` handling should
 * be configured away. `dangerouslyIgnoreUnhandledErrors` exists and would make
 * this class of run green; it would also make every other unhandled rejection
 * green, which is a strictly worse trade and is not made here.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TEST_DIR = resolve(ROOT, 'packages', 'core', 'test');

/** The vitest chunk that owns `BaseCoverageProvider`, found by content. */
function coverageChunkSource(): string {
  const pnpm = resolve(ROOT, 'node_modules', '.pnpm');
  const candidates = readdirNames(pnpm).filter((name) => name.startsWith('vitest@'));
  for (const candidate of candidates) {
    const chunks = resolve(pnpm, candidate, 'node_modules', 'vitest', 'dist', 'chunks');
    if (!exists(chunks)) continue;
    for (const file of readdirNames(chunks)) {
      if (!file.endsWith('.js')) continue;
      const source = readFileSync(join(chunks, file), 'utf8');
      if (source.includes('class BaseCoverageProvider')) return source;
    }
  }
  throw new Error('no vitest chunk declares BaseCoverageProvider; the provider moved');
}

/**
 * `existsSync` rather than a `readFileSync` in a try/catch.
 *
 * The first version of this file did the latter, and it was wrong in the way
 * this campaign keeps recording: `readFileSync` on a *directory* throws
 * `EISDIR`, so the check reported that every candidate path was missing. The
 * effect was that the scan found no provider and both ordering assertions failed
 * with a message about the dependency having moved -- a false alarm that named
 * the wrong subject. `existsSync` answers the question actually being asked.
 */
function exists(path: string): boolean {
  return existsSync(path);
}

function readdirNames(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

describe('coverage · the reporter drains its writes before it resets', () => {
  it('reads the provider, so the ordering assertion below is not vacuous', () => {
    // A scan that found nothing would let every assertion below pass without
    // having looked at anything. This is the non-vacuity control for the file.
    const source = coverageChunkSource();
    expect(source).toContain('class BaseCoverageProvider');
    expect(source).toContain('readCoverageFiles');
  });

  it('awaits the pending writes and only then clears the array', () => {
    const source = coverageChunkSource();
    // Scoped to `readCoverageFiles`, not to the whole provider.
    //
    // The first version searched the file and took the *first* textual match of
    // `this.pendingPromises = []`, which is inside the class body at
    // declaration/`clean()` level -- 4017 -- while the drain is at 4041. The
    // assertion then read "the reset precedes the drain" about a pair of lines
    // in two different methods, and reported the dependency as changed. Only the
    // ordering *within* the reading method is the claim, so only that region is
    // read.
    const start = source.indexOf('async readCoverageFiles(');
    expect(start, 'the provider no longer has readCoverageFiles').toBeGreaterThan(-1);
    const end = source.indexOf('\n\tasync ', start + 1);
    const body = source.slice(start, end === -1 ? source.length : end);

    const drainAt = body.indexOf('await Promise.all(this.pendingPromises)');
    const resetAt = body.indexOf('this.pendingPromises = []');
    expect(drainAt, 'readCoverageFiles no longer awaits its pending writes').toBeGreaterThan(-1);
    expect(resetAt, 'readCoverageFiles no longer resets its pending writes').toBeGreaterThan(-1);
    expect(
      drainAt,
      'the reset now precedes the drain inside readCoverageFiles, which is a different function '
        + 'than the one this file was written against -- re-derive the late-write analysis',
    ).toBeLessThan(resetAt);

    // And the push site is still a bare, un-awaited `writeFile`, which is what
    // makes a late arrival fatal rather than merely dropped.
    const pushAt = source.indexOf('this.pendingPromises.push(promise)');
    expect(pushAt, 'the write is no longer pushed onto the pending array').toBeGreaterThan(-1);
    const pushBlock = source.slice(Math.max(0, pushAt - 400), pushAt);
    expect(
      pushBlock,
      'the write is now awaited at the push site, so a late arrival can no longer be unhandled',
    ).toContain('const promise = promises$1.writeFile(filename');
  });

  it('every test file that spawns asynchronously joins the child it starts', () => {
    // The repository-side condition. A file that spawns and does not join can
    // still hold a live child while the reporter is draining, which is how a
    // write arrives after the drain.
    const files = readdirNames(TEST_DIR).filter(
      (name) => name.endsWith('.test.ts') && name !== 'coverage-writes-are-drained.test.ts',
    );
    expect(files.length, 'the test directory scan found nothing').toBeGreaterThan(50);

    const offenders: string[] = [];
    for (const name of files) {
      const source = readFileSync(join(TEST_DIR, name), 'utf8');
      // Comments are stripped before the scan.
      //
      // Without this, `timeout-budget.test.ts` is a false positive: it holds the
      // literal `'spawn('` inside a data table of call spellings, and a scan of
      // raw text cannot tell a mention from a call. That is the same defect this
      // campaign recorded against its own battery guard, where a name match
      // produced three false positives out of six -- so the fix is the same one:
      // read the code, not the prose around it.
      //
      // Only comments are removed, not string contents. The event name in
      // `.on('close', ...)` *is* a string, and an earlier version of this file
      // blanked it -- which destroyed the one token the check below matches on
      // and reported two joining files as offenders. A mention of `'spawn('`
      // inside a string is harmless here because the call pattern requires
      // `spawn` followed by `(`, and a string containing that text is itself
      // inside quotes that the comment stripper leaves intact.
      const code = stripComments(source);
      if (!/(?:^|[^\w.'"])spawn\s*\(/m.test(code)) continue;

      // A join is a handler registered on the child's lifecycle, or an `await`
      // over it. Two real shapes are in this tree and both must be accepted:
      //
      //     child.on('close', (code) => settle({ ... }));      // inline
      //     child.on('close', (code) => resolveDone(code));    // inside a Promise
      //
      // The first draft required the handler to be on the *same line* as the
      // event name, and so reported `gate-test-battery-exclusion.test.ts` as an
      // offender even though it registers exactly this handler two lines below
      // the `.on(` -- because the name was in a variable, not a literal.
      const joined =
        /\.on\(\s*['"](?:close|exit|error)['"]\s*,/.test(code)
        || /await\s+new\s+Promise[\s\S]{0,400}?\.on\(/.test(code)
        || /await\s+(?:done|child|proc|process|run)[\w$]*\s*;/.test(code);
      if (!joined) offenders.push(name);
    }

    expect(
      offenders,
      'these files start an asynchronous child and never join it, so the child can outlive the '
        + 'file and push its coverage into the reporter after the write array has been drained',
    ).toEqual([]);
  });
});

/**
 * Blank out comments, keeping string contents.
 *
 * Replacement is character-for-character, so a byte offset in the result still
 * addresses the same byte of the original -- which keeps the line-number and
 * `indexOf` messages in this file honest.
 *
 * The distinction from a full non-code stripper is deliberate and was arrived at
 * by getting it wrong: the check below has to read the event name inside
 * `.on('close', ...)`, so string contents must survive. Comments cannot contain
 * a call, so they are the only thing that has to go.
 *
 * It is a small scanner, not a parser. A `'` inside a comment opens no string
 * (comments are removed first, in the same pass, and the scanner never re-enters
 * a removed region); a `//` inside a string is not a comment, because the string
 * branch consumes to the closing quote before the comment branch can see it.
 */
function stripComments(source: string): string {
  const out = source.split('');
  let i = 0;
  const n = source.length;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < n) {
    const c = source[i]!;
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      let j = i;
      while (j < n && source[j] !== '\n') j += 1;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      const j = close === -1 ? n : close + 2;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === c) break;
        j += 1;
      }
      // Skip the whole literal without altering it.
      i = Math.min(j + 1, n);
      continue;
    }
    i += 1;
  }
  return out.join('');
}

