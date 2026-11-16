#!/usr/bin/env node
/**
 * The workflow files are commented in English too, and a `#` in YAML is four grammars.
 *
 * ## Why this exists
 *
 * `comment-language.mjs` reads every `.ts`, `.mts`, `.cts`, `.mjs`, `.cjs` and `.js` file
 * in this tree and refuses Han prose in a comment. Its header ends with the boundary it
 * could not cross: "The workflow files are not read. A `#` in YAML is three grammars --
 * plain, single-quoted, double-quoted -- plus the block scalars that hold shell scripts,
 * so reading one correctly needs the YAML scanner rather than this one. Five files hold
 * 1,172 `#` marks between them and this round measured them separately; the reader for
 * them is the next instrument, not this one."
 *
 * This is that instrument, and the parenthesis was right about the count and wrong about
 * the grammars: there are four, and the fourth is where most of the marks live.
 *
 *   1. **a plain scalar.** `#` opens a comment only when it follows a space, a tab or the
 *      start of the row. `Build (the round trip reads core's dist)` is a row of
 *      `anchor-roundtrip.yml` with an apostrophe in a plain scalar, and a reader that
 *      treated every quote as an opener would have swallowed the rest of the file into a
 *      string. `foo#bar` is a scalar whose value contains a `#`.
 *   2. **a single-quoted scalar.** `''` is the escape, so `'it''s'` ends after the fourth
 *      character and `#` inside is text.
 *   3. **a double-quoted scalar.** `\` is the escape, and a flow scalar may continue on
 *      the next row -- YAML folds the line break into a space -- so the state is carried
 *      across rows rather than reset at every newline.
 *   4. **a block scalar.** `run: |` and its kin open a region in which every row is
 *      content: a shell script, a Node program, a list of paths. The `#` at the start of
 *      one of those rows is that language's comment, not YAML's, and it is the same kind
 *      of writing for the same kind of reader.
 *
 * ## What was measured before the rule was written
 *
 * 1,172 `#` marks across five files, **none** of them carrying a Han character. Every
 * mark on a row that is not a comment row is one of five: `${#selected}` and four
 * `echo "### ..."` lines, all inside double-quoted text inside a `run: |` block. Three
 * quoted scalars reach the top level at all (`default: ''` and two `cron:` schedules).
 * So the rule costs nothing today, and the reader is what keeps it that way -- which is
 * the only reason to write a scanner for a tree that already passes.
 *
 * ## The census, because a scanner can lose a mark
 *
 * Every `#` in the file is counted into exactly one bucket -- it opened a comment, it sat
 * inside a quoted scalar, it sat in a block scalar's row, or it was glued to a word and
 * is scalar content -- and the four counts are required to sum to the number of `#`
 * characters in the file. A scanner that skipped a region, mis-closed a quote or ended a
 * block scalar one row early loses marks, and the sum is where that becomes visible
 * rather than turning into a green run over the rows that happened to parse.
 *
 * ## What this reading cannot do
 *
 * - **A `#` in the middle of a block scalar's row is not read.** It could be a shell
 *   comment (`echo hi  # why`) or a `#` inside a shell string (`echo "a # b"`), and
 *   telling those apart needs to know which language the block holds -- which YAML does
 *   not record. The row-leading `#` is the one shape that is a comment in shell, in
 *   Python, in Ruby and in make alike, so that is the shape this reader takes.
 * - **The row-leading `#` of a block scalar is read even when the block holds data.** A
 *   `path: |` block whose first non-space character is `#` would be a path beginning with
 *   `#`; a row of eight Han characters in that position is not a path, it is prose with
 *   nobody to read it, which is the thing this rule is for.
 * - **A `"` inside a plain scalar opens a flow scalar.** `say "hi"` is legal YAML and the
 *   approximation enters the quote rather than ignoring it. The cost is that a `#` between
 *   two such quotes is counted as text; the direction is chosen because the other one --
 *   reading a quotation as prose -- makes a gate red on a file that is fine, and this
 *   tree has no such row today.
 * - **An explicit indentation indicator is measured from the header row.** `|2` means two
 *   columns past the parent node's indentation, and the parent is taken to be the row the
 *   header sits on. That is exact for a mapping key and for a sequence item, which is what
 *   the six files here contain; a header nested somewhere else would be measured from the
 *   wrong column, and the census would still find every mark because a wrongly-ended block
 *   leaves the *next* rows scanned as text rather than skipped.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { commentsReport } from './docs-language.mjs';

export const ROOT = resolve(import.meta.dirname, '..');

/** Directories that hold a copy of this tree rather than this tree. */
const SKIP = new Set(['node_modules', 'out', '.git', 'coverage', 'dist', 'site']);

/** Both spellings YAML is written with, because `.yaml` is as legal as `.yml`. */
export const WORKFLOW_EXTENSIONS = ['.yml', '.yaml'];

/**
 * Files a package manager writes rather than a person.
 *
 * `pnpm-lock.yaml` is 48 kB of resolved versions with a header the tool wrote; a rule
 * about what an author's comments say has no author here to be right or wrong about, and
 * holding it to the rule would make every install a candidate for a red gate.
 */
const GENERATED = new Set(['pnpm-lock.yaml', 'npm-shrinkwrap.yaml', 'package-lock.yaml']);

/**
 * Where a block scalar opens, and what it says about its own indentation.
 *
 * The pattern requires the indicator to be the last thing on the row (or followed by a
 * comment), which is what keeps `echo a | b` and `name: a | b` out of it: a `|` in the
 * middle of a scalar is a character, and only the end of a row makes it a header.
 */
const BLOCK_HEADER = /(?:^|[\s:[{,-])(?:[!&]\S+\s+)*[|>]([-+]?\d?)[ \t]*(?:#.*)?$/;

/** The characters after which a quote opens a scalar rather than sitting inside one. */
const TOKEN_BREAK = /[\s:[{,\-?]/;

/** The offset of the end of the row containing `from`, which is the text length at EOF. */
function rowEnd(text, from) {
  const end = text.indexOf('\n', from);
  return end === -1 ? text.length : end;
}

/** How many columns of spaces a row starts with. Tabs are content, not indentation. */
function leadingSpaces(row) {
  let count = 0;
  while (row[count] === ' ') count += 1;
  return count;
}

/** How many `#` characters a string holds. */
function countHashes(text) {
  let count = 0;
  for (const character of text) if (character === '#') count += 1;
  return count;
}

/**
 * Whether the `#` at `from` opens a comment.
 *
 * This is the whole of the plain-scalar rule and it is the specification's, not an
 * approximation: YAML separates a comment with whitespace or a row start, so `foo#bar` is
 * a scalar whose value contains a `#` and `foo # bar` is a scalar and a comment.
 */
function opensComment(text, from) {
  if (from === 0) return true;
  const before = text[from - 1];
  return before === ' ' || before === '\t' || before === '\n' || before === '\r';
}

/** Whether a quote at `from` opens a flow scalar rather than appearing inside one. */
function opensScalar(text, from) {
  if (from === 0) return true;
  return TOKEN_BREAK.test(text[from - 1]);
}

/**
 * Whether one row opens a block scalar, and the indentation it promises.
 *
 * `indent` is `null` when the header carries no indicator, which is the common case and
 * the one where the block's own first non-blank row decides the column.
 */
export function headerOf(row) {
  const trimmed = row.replace(/\s+$/, '');
  if (trimmed.startsWith('#')) return null;
  const match = BLOCK_HEADER.exec(trimmed);
  if (match === null) return null;
  const indicator = match[1] ?? '';
  const digit = /\d/.exec(indicator);
  if (digit === null) return { indent: null };
  return { indent: leadingSpaces(row) + Number(digit[0]) };
}

/**
 * Every comment in one YAML file, plus the census of every `#` the file contains.
 *
 * `comments` is `{ kind: 'line' | 'block', line, text }` -- `line` for a `#` on a row of
 * YAML, `block` for a row-leading `#` inside a block scalar -- and `text` is the body
 * without the mark, so a caller judges words rather than punctuation. `hashes` is the
 * census: the four buckets must sum to the number of `#` characters in `text`, and a
 * caller that finds they do not has found a region this scanner did not walk.
 *
 * `problems` is not a warning. An unterminated flow scalar means every `#` after it is
 * quoted text as far as this reader can tell, which is a file it refuses rather than a
 * file it counts.
 */
export function scanYamlComments(text) {
  const comments = [];
  const problems = [];
  const hashes = { comment: 0, quoted: 0, blockRow: 0, scalar: 0 };
  let at = 0;
  let line = 1;
  let quote = null;
  let block = null;
  let header = null;

  const advance = (count) => {
    const step = Math.min(count, text.length - at);
    for (let index = 0; index < step; index += 1) if (text[at + index] === '\n') line += 1;
    at += step;
  };
  const atRowStart = () => at === 0 || text[at - 1] === '\n';
  const currentRow = () => text.slice(at, rowEnd(text, at)).replace(/\r$/, '');

  while (at < text.length) {
    const ch = text[at];

    // A flow scalar opened on an earlier row: the row break is folded into a space, so
    // the quote, the escape and the `#` all keep their meaning across it.
    if (quote !== null) {
      if (quote === "'") {
        if (ch === "'" && text[at + 1] === "'") {
          advance(2);
          continue;
        }
        if (ch === "'") {
          quote = null;
          advance(1);
          continue;
        }
      } else {
        if (ch === '\\') {
          advance(2);
          continue;
        }
        if (ch === '"') {
          quote = null;
          advance(1);
          continue;
        }
      }
      if (ch === '#') hashes.quoted += 1;
      advance(1);
      continue;
    }

    // A block scalar owns whole rows, so it is read a row at a time rather than a
    // character at a time: the indentation of the row is the question, not its contents.
    if (block !== null && atRowStart()) {
      const body = currentRow();
      const stop = rowEnd(text, at);
      if (body.trim() === '') {
        advance(stop - at + 1);
        continue;
      }
      const lead = leadingSpaces(body);
      if (block.indent === null) block.indent = lead;
      if (lead < block.indent) {
        // The block ended before this row; the row is YAML again and is read as such.
        block = null;
        continue;
      }
      // The row's own indentation, not the block's, is what the `#` is measured from: a
      // comment inside a `run: |` may sit deeper than the block's first row -- in a shell
      // `if`, in an indented `node -e` program -- and reading `#` at the block's column
      // would have reported twelve of this tree's own comments as content.
      const content = body.slice(lead);
      if (content.startsWith('#')) {
        // The family is the `#` and the column it sits at: a comment wrapped inside a
        // block scalar continues in the column it started in, and a `#` row that ends a
        // block sits at another column, so the two are not one paragraph.
        comments.push({ kind: 'block', family: `#${String(lead)}`, line, text: content.slice(1) });
        hashes.comment += countHashes(content);
      } else {
        hashes.blockRow += countHashes(content);
      }
      advance(stop - at + 1);
      continue;
    }

    if (atRowStart()) header = headerOf(currentRow());

    if (ch === '\n') {
      if (header !== null) {
        // The block starts on the next row; `indent` stays `null` until that row says
        // what its first non-blank line is indented by, which is how YAML decides it too.
        block = { indent: header.indent };
        header = null;
      }
      advance(1);
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      advance(1);
      continue;
    }

    if (ch === '#' && opensComment(text, at)) {
      const stop = rowEnd(text, at);
      const body = text.slice(at + 1, stop);
      comments.push({
        kind: 'line',
        family: `#${String(at - text.lastIndexOf('\n', at - 1) - 1)}`,
        line,
        text: body,
      });
      hashes.comment += 1 + countHashes(body);
      advance(stop - at);
      continue;
    }

    if (ch === '#') {
      hashes.scalar += 1;
      advance(1);
      continue;
    }

    if (ch === "'" || ch === '"') {
      if (opensScalar(text, at)) quote = ch;
      advance(1);
      continue;
    }

    advance(1);
  }

  if (quote !== null) {
    problems.push({
      line,
      message:
        `opens a ${quote === '"' ? 'double' : 'single'}-quoted scalar that never closes, so the ` +
        'marks after it cannot be told from text -- a file this reading cannot walk is refused ' +
        'rather than counted as a file with nothing to say',
    });
  }

  return { comments, problems, hashes };
}

/** Every YAML file under `root`, as paths relative to it, in sort order. */
export function workflowsIn(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const at = join(dir, entry.name);
      if (entry.isDirectory()) walk(at);
      else if (
        WORKFLOW_EXTENSIONS.some((extension) => entry.name.endsWith(extension)) &&
        !GENERATED.has(entry.name)
      ) {
        out.push(relative(root, at));
      }
    }
  };
  walk(root);
  return out.sort();
}

/**
 * The verdict: no workflow file carries Han prose in a `#` comment.
 *
 * `root` is a parameter so a fixture can be a tree: the failure modes of this rule are a
 * `#` inside a quoted scalar read as a comment, a `#` inside a block scalar's row read as
 * YAML, a quote inside a block scalar that leaks into the next row, a block scalar that
 * ends one row early -- and a rule nobody has seen fail is a rule nobody has seen.
 */
export function check(root = ROOT) {
  const files = workflowsIn(root);
  const errors = [];
  let comments = 0;
  let lineComments = 0;
  let blockComments = 0;
  let runs = 0;
  let pairs = 0;
  let marks = 0;
  const hashes = { comment: 0, quoted: 0, blockRow: 0, scalar: 0 };

  if (files.length === 0) {
    errors.push(
      `no YAML file under ${root}: a rule over the workflow comments that finds no file is a ` +
        'rule that has not run, and it reads exactly like one that passed',
    );
  }

  for (const name of files) {
    const text = readFileSync(join(root, name), 'utf8');
    const scan = scanYamlComments(text);
    for (const problem of scan.problems) {
      errors.push(`${name}:${String(problem.line)}: ${problem.message}`);
    }
    for (const key of Object.keys(hashes)) hashes[key] += scan.hashes[key];
    const accounted = Object.values(scan.hashes).reduce((sum, value) => sum + value, 0);
    const present = countHashes(text);
    marks += present;
    if (accounted !== present) {
      errors.push(
        `${name}: the scanner accounted for ${String(accounted)} of the file's ${String(present)} ` +
          "'#' mark(s), so a character was crossed without being counted -- a census that does " +
          'not add up is a reader that walked past text it did not classify',
      );
    }
    // The second reading of the same instrument: a row whose first non-blank character is
    // a `#` is a comment in every grammar this file reads, so the number of such rows and
    // the number of comments have to agree. It is this comparison that found the block
    // scalar's deeper `#` rows -- twelve of this tree's own comments, counted as content
    // and read by nothing, in a run that was green.
    const marked = text.split('\n').filter((row) => /^[ \t]*#/.test(row)).length;
    if (scan.comments.length !== marked) {
      errors.push(
        `${name}: ${String(scan.comments.length)} comment(s) were read from ${String(marked)} row(s) ` +
          "whose first character is a '#' -- the rows in the difference opened a comment that " +
          'this reader counted as content, and a comment no reader opens is a comment in ' +
          'whatever language its author liked',
      );
    }
    for (const comment of scan.comments) {
      comments += 1;
      if (comment.kind === 'line') lineComments += 1;
      else blockComments += 1;
    }
    // Judged after the census, for the reason `comment-language.mjs` gives: a `#` comment
    // wrapped onto the next row is two comments to the census and one paragraph to the
    // language rule, and the two counts have to stay separate for either to be checkable.
    const report = commentsReport(scan.comments);
    pairs += report.pairs;
    for (const hit of report.hits) {
      runs += 1;
      errors.push(
        `${name}:${String(hit.line)}: \`${hit.text}\` -- ${String(hit.length)} Han character(s) ` +
          `of prose${hit.spanning === undefined ? '' : ` across ${String(hit.spanning)} row(s)`}: ` +
          "this repository's comments are written in English, and the comments that " +
          'are not are quotations, which a code span carries verbatim',
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    files: files.length,
    comments,
    lineComments,
    blockComments,
    marks,
    runs,
    pairs,
    hashes,
    summary:
      `check-workflow-language: ${errors.length === 0 ? 'OK' : 'FAILED'} — ${String(files.length)} ` +
      `file(s), ${String(marks)} '#' mark(s): ${String(comments)} comment(s) (${String(lineComments)} ` +
      `line, ${String(blockComments)} block scalar), ${String(hashes.quoted)} inside a quoted scalar, ` +
      `${String(hashes.blockRow)} inside a block scalar's own row, ${String(hashes.scalar)} glued to ` +
      `a word; ${String(runs)} run(s) of Han prose, ${String(pairs)} row break(s) held inside a ` +
      'paragraph' +
      (errors.length === 0 ? '' : `; first: ${errors[0] ?? ''}`),
  };
}
