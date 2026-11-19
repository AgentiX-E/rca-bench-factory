#!/usr/bin/env node
/**
 * Which documents are written in English, as a reading rather than a rule of thumb.
 *
 * ## Why this exists
 *
 * Three rounds of the progress log -- `v3.69`, `v3.83` and `v3.84`, 43, 40 and 33 lines
 * with their headings -- were written in Chinese in a repository whose documents,
 * comments, commit messages and gate output are English. Every one of them is a true
 * record: the numbers in their ledgers are the numbers their rounds measured, and the
 * findings they cite resolve. What is wrong with them is the language, and no gate in
 * this tree reads a document's language, so `docs:check` was green on a log that three
 * of its rounds could not be read in.
 *
 * The repair has two halves and this is the second: the three were rewritten in English
 * against the record (no number, finding number or heading level changed), and this
 * reading refuses a fourth.
 *
 * ## What counts as prose
 *
 * A run of **eight or more Han characters** outside a quotation. Eight because the
 * things this repository legitimately carries in Chinese are short: a cited file name
 * (`04-里程碑与路线图.md`), a section number (`§六`), a term quoted from a table
 * (`金标`). All of them are two to seven characters, and all of them sit inside a code
 * span or a quotation, which are the three forms in which another document's bytes
 * arrive here verbatim:
 *
 *   1. **a fenced block** -- a quoted run, a quoted table, a captured output;
 *   2. **a code span** -- one identifier, one path, one line, with any number of
 *      backticks as its delimiter (` ``…`…` `` ` nests a span that contains a backtick);
 *   3. **a block quote** -- a paragraph lifted from another document, which is how the
 *      external, Chinese, documentation is cited here.
 *
 * Prose is what is left. That definition is chosen rather than the other way round --
 * "refuse every Han character" would have made the citations unwritable, and an
 * exemption list of every Chinese file name in the tree would have been a second
 * document to maintain. The cost is stated: a round could hide its prose in block
 * quotes, and this reading would not see it. The guard's subject is the accident, not
 * the lie -- the same sentence the ledger-name rule in `progress-volumes.mjs` carries.
 *
 * ## What a line break does
 *
 * A run is not confined to a row. **The unit is the paragraph, and a row break that falls
 * between two Han characters is not a break** -- otherwise a comment wrapped in a narrow
 * column, or a Chinese paragraph hard-wrapped at eighty characters, is invisible to every
 * reader in this tree, which is a hole in the rule rather than a convention.
 *
 * The three surfaces decide what a paragraph is, because they know their own structure:
 * a markdown paragraph ends at a blank row, a fence, a block quote and an ATX heading; a
 * comment's paragraph ends at a blank row, which in a doc block is a row carrying nothing
 * but its decoration; and two line comments belong to one paragraph only when they sit on
 * consecutive rows. Everything else is joined, and the join inserts nothing -- which is
 * *exactly* the rule above rather than an approximation of it: a run of eight Han
 * characters needs Han on both sides of every break it crosses, so a break with anything
 * else on either side could not be crossed whichever way it was joined. The property test
 * in `check-comments-language.test.ts` states that equivalence instead of trusting it.
 *
 * The direction each approximation takes is stated where it is made. It is always towards
 * a break rather than across one: a missed join costs a narrower rule, an invented join
 * costs a sentence about a row that holds no prose.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');

/** Directories that hold no document of this repository's own. */
const SKIP = new Set(['node_modules', 'out', '.git', 'coverage', 'dist', 'site']);

/**
 * A run of eight Han characters, which is longer than any citation in this tree.
 *
 * `\p{Script=Han}` rather than a range: the ranges are several blocks (`4E00–9FFF`,
 * `3400–4DBF`, the compatibility block, the extension planes) and a hand-written range
 * is a rule that is right about the characters someone happened to test.
 */
export const HAN_RUN = /\p{Script=Han}{8,}/u;

/**
 * What a **heading** is judged in: one Han character, or the ideographic comma.
 *
 * The eight-character unit above is calibrated against citations, and a heading has no
 * citation in it. It has a skeleton -- a number and a title -- and the number is where a
 * document that was written in Chinese and then half-translated keeps its accident:
 * `### 一、The rows nobody judged …` is one Han character, and `### Five、What the gates
 * cost to extend` is none at all, so twenty-eight headings across three volumes were
 * invisible to every reader in this tree for as long as they stood.
 *
 * Two characters, and both are stated rather than guessed. `\p{Script=Han}` is the
 * character class this file already trusts. `\u3001` is the ideographic comma, which no
 * English heading writes -- English writes `,` or `—` -- and which is therefore a trace
 * of the Chinese numbering it was copied from rather than a mark this repository chose.
 * A punctuation mark is not a word, so judging a heading in this unit reports the heading
 * rather than a run of prose, and the number it contributes is the number of characters a
 * reader would have to translate, which is one.
 *
 * Code spans are removed before this runs, exactly as they are for a paragraph: a heading
 * may quote a file name (`04-里程碑与路线图.md`), and a quotation is not this
 * repository's prose whichever row it sits on.
 */
export const HEADING_PROSE = /[\p{Script=Han}\u3001]+/u;

/**
 * A section number written with a Han numeral -- `§六` -- which is a heading's name
 * quoted in a sentence.
 *
 * This is structure rather than vocabulary, which is why it gets a rule of its own: a
 * term quoted from another document (`金标`, `未测量`) is a word this log may carry, and
 * a chapter mark followed by a Chinese numeral is a pointer into a skeleton that is
 * supposed to be English. The unit is two characters and the numeral is one of them, so
 * the number reported is one; what is refused is the pointer, not the word.
 */
export const HAN_SECTION_REF = /§\p{Script=Han}/u;

/** Every markdown document under `root`, as paths relative to it, in sort order. */
export function documentsIn(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const at = join(dir, entry.name);
      if (entry.isDirectory()) walk(at);
      else if (entry.name.endsWith('.md')) out.push(relative(root, at));
    }
  };
  walk(root);
  return out.sort();
}

/**
 * One line with every code span removed, and a gap left where each one was.
 *
 * Any run of backticks opens a span and the same-length run closes it, which is the rule
 * CommonMark states and the reason ``…`…`` exists: a span whose content contains a
 * backtick needs a longer delimiter, and a reader that only knew single backticks would
 * have left the inner text in "prose" and reported a quotation as a violation. The
 * length-matching is done by hand rather than with a regex for the reason every
 * hand-written lexer in this tree exists: `(`+)(.*?)\1` matches the *first* run of the
 * same length, which is right, but it also matches across an unterminated span to the
 * end of the line, which turns a stray backtick into a silenced line.
 *
 * ## Why a span leaves a space rather than nothing
 *
 * A span is a quotation -- a file name, a path, a term lifted from another document --
 * and a quotation is not this repository's prose. Removing it is the point. Removing it
 * *silently* is not: `` 甲甲甲甲`x`甲甲甲甲 `` was four characters, a quotation and four
 * more, and with the quotation deleted outright the eight characters on its two sides are
 * one word to the search, so a citation quoted in the middle of a Chinese sentence became
 * a reported run of prose. That is a fabricated join, and every join in this file is
 * supposed to be one a reader could defend.
 *
 * The gap is inserted only when the byte before the span is not already whitespace, so
 * `a `b` c` returns `a  c` -- the shape it returned before this rule existed, which keeps
 * a caller's comparison where it was and keeps a span at the start of a row from
 * producing a leading space that `trim` would then have to explain.
 */
export function withoutCodeSpans(line) {
  let out = '';
  let at = 0;
  while (at < line.length) {
    if (line[at] !== '`') {
      out += line[at];
      at += 1;
      continue;
    }
    let run = 0;
    while (line[at + run] === '`') run += 1;
    const delimiter = '`'.repeat(run);
    const close = line.indexOf(delimiter, at + run);
    if (close === -1) {
      // An unterminated span is not a span: the backticks stay, and so does the text
      // after them. Silence here would be the defect this whole file is about.
      out += delimiter;
      at += run;
      continue;
    }
    if (out !== '' && !/\s/u.test(out.at(-1) ?? '')) out += ' ';
    at = close + run;
  }
  return out;
}

/** A global copy of `HAN_RUN`, because a run is searched for repeatedly rather than once. */
const HAN_RUN_ALL = new RegExp(HAN_RUN.source, 'gu');

/** A global copy of the heading unit, for the same reason. */
const HEADING_PROSE_ALL = new RegExp(HEADING_PROSE.source, 'gu');

/** A global copy of the section-reference unit, for the same reason. */
const HAN_SECTION_REF_ALL = new RegExp(HAN_SECTION_REF.source, 'gu');

/** An ATX heading, which is one row and cannot be the continuation of the row above it. */
const ATX_HEADING = /^ {0,3}#{1,6}(\s|$)/;

/**
 * A row of a paragraph: its absolute line, and its text with decoration, spans and layout
 * whitespace removed.
 *
 * Both ends of the row are trimmed, and that is not tidiness: a line comment keeps the
 * space after its `//`, so `// 文档说明` and `// 第二行` would be joined as `说明 第二行` --
 * one space in the middle of the break, and a rule that only crosses a break between two
 * Han characters would never cross one in a line comment at all. The same accident makes a
 * hard break written as two trailing spaces, and a CRLF file's carriage return, into a
 * character of the prose. Layout is not text, so it is dropped before the join.
 *
 * This is the **comment** surface, and it is the one place where a trailing backslash is
 * a character rather than a marker: JavaScript, shell and YAML have no renderer between
 * the bytes and the reader, so `// the end of a line\` ends with a backslash in the
 * comment, and it stands between the two rows the way any other character does.
 */
function textRowOf(line, raw) {
  return { line, body: withoutCodeSpans(raw).trim() };
}

/**
 * A row of a markdown paragraph, where one more marker is consumed than in a comment.
 *
 * Markdown has a renderer, and two of the things it does to a row end are consumed
 * markers -- they are punctuation, not text, so they do not stand between two rows:
 *
 *   - **two or more trailing spaces** are a hard break. Both ends are trimmed, so this
 *     form -- the one an editor inserts -- costs nothing to get right: the spaces are
 *     gone before anything is joined.
 *   - **a trailing backslash** is the other spelling of the same break, and it is the one
 *     this function had to be told about: CommonMark removes it and breaks the line, so
 *     the eight characters before it and the eight after it render as a break inside one
 *     paragraph, while this reader was joining them as `…\…` -- a backslash in the middle
 *     of a word, which no run crosses.
 *
 * The conditions are as narrow as the rule is: **exactly one** backslash, and not itself
 * escaped. `\\` at the end of a row is a literal backslash, which is a character and does
 * stay between the two rows; three or more ends with an escaped pair and a marker, so a
 * literal backslash is still in the text and still stands between them; and `\ ` is a
 * backslash followed by a space, which CommonMark does not read as a break at all. All
 * three keep the row whole -- the direction this file takes everywhere, towards a break
 * rather than across one -- and the last one is why the marker is looked for *before* the
 * row is trimmed, since trimming first would turn `\ ` into `\` and invent a transfer.
 *
 * A backslash anywhere else needs no rule, and that is not an omission. An escape removes
 * one backslash and leaves the character it escaped, which is a character; `\*` renders as
 * `*`, and `*` stands between two Han runs exactly as `\*` did. Only a row's last
 * backslash has nothing after it, so only that one is a question about punctuation.
 */
function markdownRowOf(line, raw) {
  const body = withoutCodeSpans(raw.replace(/\r$/u, ''))
    .replace(/(^|[^\\])\\$/u, '$1')
    .trim();
  return { line, body };
}

/**
 * The paragraphs of `rows`, split at every row whose body is blank.
 *
 * A blank row is what all three surfaces use to say "new paragraph": markdown says it with
 * an empty row, a doc block says it with a row carrying nothing but its ` * ` decoration,
 * and a YAML comment group says it by ending. Splitting here rather than in each caller
 * keeps the answer to "is this one paragraph" in one place, which is what makes the three
 * readers comparable at all.
 */
function paragraphsOf(rows) {
  const out = [];
  let group = [];
  for (const row of rows) {
    if (row.body.trim() === '') {
      if (group.length > 0) out.push(group);
      group = [];
    } else group.push(row);
  }
  if (group.length > 0) out.push(group);
  return out;
}

/**
 * Every prose run in one paragraph, as `{ line, text, length, spanning? }`.
 *
 * The rows are joined with **nothing** between them, which is the rule in this file's
 * header rather than an approximation of it: a break is crossed only by a run that is Han
 * on both sides of it. `spanning` is present only when a run crosses a row break, so a run
 * inside one row produces the object it produced before this rule existed -- a caller that
 * compared shapes against the old reader compares the same shapes.
 *
 * `pattern` is the **unit**, and it is a parameter because the two positions do not agree
 * about one: a paragraph is judged in runs of eight (`HAN_RUN`), and a heading in single
 * characters (`HEADING_PROSE`). The join, the line mapping and the witness are the same
 * either way, so they are written once. A global copy is required -- `matchAll` refuses a
 * pattern that cannot be advanced -- and both callers pass one.
 */
function scanParagraph(rows, pattern = HAN_RUN_ALL) {
  const found = [];
  const starts = [];
  let at = 0;
  for (const row of rows) {
    starts.push(at);
    at += row.body.length;
  }
  const joined = rows.map((row) => row.body).join('');
  for (const match of joined.matchAll(pattern)) {
    const end = match.index + match[0].length;
    let index = 0;
    while (index + 1 < starts.length && starts[index + 1] <= match.index) index += 1;
    const spanning = starts.filter((start) => start > match.index && start < end).length + 1;
    const hit = { line: rows[index].line, text: match[0], length: match[0].length };
    if (spanning > 1) hit.spanning = spanning;
    found.push(hit);
  }
  return found;
}

/** Every prose run in `rows`, which may hold more than one paragraph. */
export function hanRunsIn(rows) {
  // `(part) => scanParagraph(part)` rather than `flatMap(scanParagraph)`: the second
  // argument of a `flatMap` callback is the **index**, and this function's second parameter
  // is the unit. Passing the function directly put `0`, `1`, `2` … where a pattern belongs,
  // every paragraph was scanned for the literal `0`, and the comment reader went silent --
  // four tests, one of them in the comment reader's own file, said so before this line was
  // written. A default argument is not a guard against an argument that arrives.
  return paragraphsOf(rows).flatMap((part) => scanParagraph(part));
}

/**
 * Every prose run of Han characters in one document, plus the row breaks the rule held.
 *
 * `pairs` is the reading's own witness: the number of row breaks that fell inside a
 * paragraph and were therefore crossed by the search. A grouper that broke -- one that
 * flushed at every row -- would leave the runs intact and the crossings at zero, and the
 * floor a test puts under this number is what makes that a red test rather than a smaller
 * number reported as a pass.
 *
 * `line` in a hit is one-based, because that is what an editor and a reviewer use. Fences
 * are tracked because a captured output can hold anything, block quotes are skipped
 * because they are quotations, and headings are judged alone because a heading is one row.
 */
export function proseReport(text) {
  const hits = [];
  let pairs = 0;
  let fenced = false;
  let paragraph = [];
  const flush = () => {
    for (const part of paragraphsOf(paragraph)) {
      pairs += part.length - 1;
      for (const hit of scanParagraph(part)) hits.push(hit);
    }
    paragraph = [];
  };
  text.split('\n').forEach((raw, index) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      flush();
      return;
    }
    if (fenced) return;
    if (/^\s*>/.test(raw)) {
      flush();
      return;
    }
    const row = markdownRowOf(index + 1, raw);
    if (row.body.trim() === '') {
      flush();
      return;
    }
    if (ATX_HEADING.test(raw)) {
      // A heading is one row, and it is judged as a paragraph of one: its own markers stop
      // it from continuing the row above -- `## ` is not Han, so no run reaches across it --
      // and nothing may continue it. Counting it inside the paragraph would put a break in
      // the witness that no run can ever cross.
      //
      // The **unit** is the other half of this branch. A heading is a skeleton row rather
      // than a sentence, so the eight-character run that measures a paragraph would report
      // every heading in the log as clean, and does: `### 一、` is one character and
      // `### Five、` is none, and both stood in three volumes until this line was written.
      flush();
      for (const hit of scanParagraph([row], HEADING_PROSE_ALL)) hits.push(hit);
      return;
    }
    // A chapter mark followed by a Han numeral is a pointer into a skeleton that is
    // supposed to be English, and it is one character, which no run of eight can see.
    // Reported here rather than in `scanParagraph` because its unit is not the paragraph's
    // and it is not joined across rows: `§` and its numeral are one row or they are not a
    // section reference at all.
    for (const found of row.body.matchAll(HAN_SECTION_REF_ALL)) {
      hits.push({ line: row.line, text: found[0], length: 1 });
    }
    paragraph.push(row);
  });
  flush();
  return { hits, pairs };
}

/** Every prose run of Han characters in one document, as `{ line, text, length }`. */
export function hanProseIn(text) {
  return proseReport(text).hits;
}

/**
 * The rows of one comment, with the decoration a doc block puts on each row removed.
 *
 * The decoration (` * `) is punctuation rather than words, so it is stripped before the
 * row is judged. A YAML comment has no such decoration; the pattern is harmless there,
 * since it removes `*` and spaces rather than characters the rule looks for.
 */
function rowsOfComment(comment) {
  return comment.text.split('\n').map((raw, index) =>
    textRowOf(comment.line + index, raw.replace(/^\s*\*+ ?/, '')),
  );
}

/**
 * Every prose run in one comment, as `{ line, text, length, spanning? }`.
 *
 * This is one comment judged alone. A reader that has a file's comments in hand wants
 * `commentsReport`, which also carries a run across the break between two line comments on
 * consecutive rows -- `// the first half of a sentence` above `// and its second` is one
 * paragraph, and judging each comment alone is what made that break a wall.
 */
export function hanInComment(comment) {
  return hanRunsIn(rowsOfComment(comment));
}

/**
 * Every prose run in a file's comments, plus the row breaks the rule held.
 *
 * The grouping rule needs two things and nothing else: the comments must sit on
 * consecutive rows, and they must be the same **family** -- the delimiter they open with
 * and the column it sits at, which each scanner states because it is the only part of the
 * tree that can see it. A `//` row continues the `//` row above it; it does not continue a
 * doc block, because the terminator that ended that block is a wall no wrap crosses, and
 * it does not continue a `//` row at another indentation, because a wrap does not move.
 *
 * `pairs` counts the breaks that were crossed, so a grouper that stopped grouping is
 * visible as a number rather than as a silence.
 */
export function commentsReport(comments) {
  const hits = [];
  let pairs = 0;
  let paragraph = [];
  let previous = null;
  const flush = () => {
    for (const part of paragraphsOf(paragraph)) {
      pairs += part.length - 1;
      for (const hit of scanParagraph(part)) hits.push(hit);
    }
    paragraph = [];
  };
  for (const comment of comments) {
    const rows = rowsOfComment(comment);
    const family = comment.family ?? comment.kind;
    const continues =
      previous !== null && previous.family === family && comment.line === previous.end + 1;
    if (!continues) flush();
    for (const row of rows) paragraph.push(row);
    previous = { family, end: comment.line + rows.length - 1 };
  }
  flush();
  return { hits, pairs };
}

/**
 * The verdict: no document in the tree carries Han prose.
 *
 * `root` is a parameter so a fixture can be a tree -- the failure modes of this rule are
 * a fenced block that is not skipped, a span that is not stripped, a quote that is read
 * as prose -- and a rule nobody has seen fail is a rule nobody has seen.
 */
export function check(root = ROOT) {
  const documents = documentsIn(root);
  const errors = [];
  let runs = 0;
  let pairs = 0;

  if (documents.length === 0) {
    errors.push(
      `no markdown document under ${root}: a rule over the documents that finds none is a rule ` +
        'that has not run, and it reads exactly like one that passed',
    );
  }

  for (const name of documents) {
    const report = proseReport(readFileSync(join(root, name), 'utf8'));
    pairs += report.pairs;
    for (const hit of report.hits) {
      runs += 1;
      errors.push(
        `${name}:${String(hit.line)}: \`${hit.text}\` -- ${String(hit.length)} character(s) of prose` +
          `${hit.spanning === undefined ? '' : ` across ${String(hit.spanning)} row(s)`}: ` +
          "this repository's documents are written in English, and the documents that are not are the " +
          'external ones, which a block quote or a code span carries verbatim',
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    documents: documents.length,
    runs,
    pairs,
    summary:
      `check-docs-language: ${errors.length === 0 ? 'OK' : 'FAILED'} — ${String(documents.length)} ` +
      `document(s), ${String(runs)} run(s) of non-English prose outside a quotation, ${String(pairs)} row ` +
      'break(s) held inside a paragraph' +
      (errors.length === 0 ? '' : `; first: ${errors[0] ?? ''}`),
  };
}
