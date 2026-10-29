import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * What a vitest config actually installs, read as text.
 *
 * ## Why a config file needs a check at all
 *
 * `test/setup/stall-watch.ts` is the suite's stopwatch: it fails the file that
 * holds the worker's event loop past the bridge's deadline, which is the only way
 * that failure gets attributed to anything (finding 290). It is installed by one
 * line in `packages/core/vitest.config.ts`, and that line is the least observable
 * statement in the repository: nothing imports the config, so deleting the line
 * breaks no import; every test still runs, so the counts do not move; and the
 * artefact it produces -- an attribution of a stall -- simply stops being
 * produced. A green suite with 4 816 passing tests and no gauge looks exactly
 * like a green suite with a gauge that found nothing.
 *
 * The battery in `stall-budget.test.ts` proved the hook *works*. This module
 * answers the other question, which nothing asked: is it *installed*, and is it
 * the same file the battery runs?
 *
 * ## Why text rather than an import
 *
 * Importing a config executes it, and executing it here would ask a different
 * question: the object vitest would receive, not the statement a reader can find.
 * The two agree today and would stop agreeing on the day someone computed the
 * entry, which is exactly the case this parser refuses instead of guessing at. The
 * precedent is `coverage-thresholds.test.ts`, which reads both configs as text for
 * the same reason.
 *
 * ## What it will not do
 *
 * It does not evaluate expressions, follow spreads, or accept a template literal
 * with a hole in it. An entry that cannot be read as a literal is an entry whose
 * installation cannot be confirmed, so it is reported as a problem rather than
 * skipped -- a check that quietly reads nothing reports success for a file it
 * never understood.
 */

/** The key, matched away from a property access (`config.setupFiles`) or a word. */
const SETUP_KEY = /\bsetupFiles\s*:/g;

/**
 * What to say about an entry nobody can read, said once.
 *
 * Two call sites refuse the same thing -- a value in the array that is not a
 * literal, and a `setupFiles` that is not an array at all -- and a message written
 * twice is a message that drifts the way last round's evidence pattern drifted.
 */
const UNREADABLE = [
  '`setupFiles` is not a list of string literals: an entry this check cannot read',
  'statically is an entry whose installation it cannot confirm, so it is refused',
  'rather than skipped',
].join(' ');

/** What a config declares, and what went wrong reading it. */
export interface SetupFileScan {
  /** The entries as the config spells them, in the order written. */
  entries: string[];
  /** The same entries resolved against the config's directory, existing files only. */
  resolved: string[];
  problems: string[];
}

/** Advance past whitespace and both comment forms. */
function skipTrivia(source: string, at: number): number {
  let index = at;
  for (;;) {
    while (index < source.length && /\s/.test(source[index] as string)) index += 1;
    if (source.startsWith('//', index)) {
      const newline = source.indexOf('\n', index);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    return index;
  }
}

/**
 * One quoted string, with its escapes taken literally.
 *
 * Backticks are not accepted: a template is either a constant that could have been
 * quoted or a hole this module cannot fill, and treating the two the same would
 * make the second look verified.
 */
function stringLiteral(source: string, at: number): { value: string; end: number } | undefined {
  const quote = source[at];
  if (quote !== "'" && quote !== '"') return undefined;
  let value = '';
  let index = at + 1;
  while (index < source.length) {
    const character = source[index] as string;
    if (character === '\\') {
      value += source[index + 1] ?? '';
      index += 2;
      continue;
    }
    if (character === quote) return { value, end: index + 1 };
    value += character;
    index += 1;
  }
  return undefined;
}

/** The entries of an array literal that starts at `open`. */
function arrayEntries(source: string, open: number): { entries: string[]; problems: string[] } {
  const entries: string[] = [];
  let index = skipTrivia(source, open + 1);
  while (index < source.length) {
    if (source[index] === ']') return { entries, problems: [] };
    const literal = stringLiteral(source, index);
    if (literal === undefined) return { entries, problems: [UNREADABLE] };
    entries.push(literal.value);
    index = skipTrivia(source, literal.end);
    if (source[index] === ']') return { entries, problems: [] };
    if (source[index] !== ',') return { entries, problems: [UNREADABLE] };
    index = skipTrivia(source, index + 1);
  }
  return { entries, problems: ['the `setupFiles` array is never closed'] };
}

/**
 * The setup files a config source declares.
 *
 * Three refusals carry the weight, and each one is a way the sentence can be
 * absent while the file still looks like it says it: no key at all, a key with an
 * empty array, and the key twice. The third is not pedantry -- vitest takes the
 * last declaration, and a reviewer reads the first, so two of them are two
 * different opinions about what runs.
 */
export function setupFileEntries(source: string): { entries: string[]; problems: string[] } {
  const keys = [...source.matchAll(SETUP_KEY)];
  if (keys.length === 0) {
    return {
      entries: [],
      problems: [
        'the config installs no setup file: `setupFiles` appears nowhere in it, so the suite runs ' +
          'without whatever the setup file was for, and nothing else in the repository would notice',
      ],
    };
  }
  const key = keys[0] as RegExpMatchArray;
  if (keys.length > 1) {
    return {
      entries: [],
      problems: [
        `the config declares more than one \`setupFiles\` (${String(keys.length)}): vitest installs ` +
          'the last one, and a reader reads the first',
      ],
    };
  }

  const after = (key.index as number) + key[0].length;
  const at = skipTrivia(source, after);
  if (source[at] === '[') {
    const scan = arrayEntries(source, at);
    if (scan.problems.length === 0 && scan.entries.length === 0) {
      return {
        entries: [],
        problems: [
          'the `setupFiles` list is empty: an empty list installs nothing, and it reads as installed ' +
            'to anyone who greps for the key',
        ],
      };
    }
    return scan;
  }
  const single = stringLiteral(source, at);
  if (single === undefined) {
    return {
      entries: [],
      problems: [UNREADABLE],
    };
  }
  return { entries: [single.value], problems: [] };
}

/**
 * One entry, resolved against the config's own directory.
 *
 * The base is the config's directory rather than the working directory for the
 * reason a reader would give: `./test/setup/stall-watch.ts` is written relative to
 * the file that says it.
 */
export function resolveEntry(configPath: string, entry: string): { path?: string; problem?: string } {
  if (entry.trim() === '') {
    return { problem: 'the config declares an empty `setupFiles` entry' };
  }
  const path = resolve(dirname(configPath), entry);
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return { problem: `'${entry}' does not exist; resolved against '${dirname(configPath)}' it is '${path}'` };
  }
  if (!stats.isFile()) {
    // A directory exists and installs nothing. The distinction matters because the
    // existence check alone would pass it.
    return { problem: `'${entry}' exists and is not a file: '${path}'` };
  }
  return { path };
}

/** The scan for a config on disk: the entries, what they resolve to, and every problem. */
export function installedSetupFiles(configPath: string): SetupFileScan {
  let source: string;
  try {
    source = readFileSync(configPath, 'utf8');
  } catch (error) {
    return {
      entries: [],
      resolved: [],
      problems: [`the config at '${configPath}' could not be read: ${String((error as Error).message)}`],
    };
  }

  const scan = setupFileEntries(source);
  const resolved: string[] = [];
  const problems = [...scan.problems];
  for (const entry of scan.entries) {
    const resolution = resolveEntry(configPath, entry);
    if (resolution.problem !== undefined) problems.push(resolution.problem);
    else resolved.push(resolution.path as string);
  }
  return { entries: scan.entries, resolved, problems };
}
