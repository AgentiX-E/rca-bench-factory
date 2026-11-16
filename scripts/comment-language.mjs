#!/usr/bin/env node
/**
 * Which comments are written in English, as a reading rather than a rule of thumb.
 *
 * ## Why this exists
 *
 * `docs-language.mjs` reads markdown and nothing else. The code -- `src/`, `scripts/` and
 * every test -- was reviewed by reviewers, which is a different instrument with a
 * different failure mode: a reviewer reading a diff sees the lines that changed, and a
 * comment in another language is invisible to every gate in this tree. The Open list has
 * carried that sentence for five rounds with the same parenthesis: a reader for the
 * comment body needs a lexer.
 *
 * The parenthesis is the whole difficulty. A comment is not a line that starts with `//`
 * -- it is a region, and the four ways a reader gets the region wrong all print a
 * sentence about a subject that is not there:
 *
 *   1. **a `//` inside a string.** `'https://api.github.com/repos'` is a line of this
 *      repository's own tooling. A reader without string state reads the URL's authority
 *      as prose.
 *   2. **a comment opener inside a regex.** A pattern that matches a C-style comment
 *      opener carries those two characters literally, and a reader without regex state
 *      reports a file it could not read on a file that is fine.
 *   3. **a template literal.** A SQL fragment with `//` in it is text; the `${}` inside
 *      it is code again, with comments of its own. A reader that treats a backtick as a
 *      quote loses both halves.
 *   4. **a shebang.** `#!/usr/bin/env node` opens every script in this directory with a
 *      `/`, and a reader whose only regex question is "can a regex start here" answers
 *      yes at offset two.
 *
 * That is finding 545's shape (a true clause about a comparison that never happened) and
 * finding 547's (a true clause about a window no row can fall in), one instrument over:
 * the sentence is right about a region the scanner invented. So this file is a scanner
 * first and a language rule second.
 *
 * ## What counts as prose
 *
 * The same rule as the document reader, imported rather than restated: a run of **eight
 * or more Han characters** outside a **code span**. A second copy of the threshold would
 * be the third-source-of-truth defect `validity.test.ts` names -- and the two readers
 * have to agree, because a quotation is a citation in both places: a Chinese file name, a
 * Chinese query quoted while explaining why a tokeniser needs one, a table cell quoted
 * from the external documentation. Six source files in this tree carry Han characters and
 * every one of them carries it inside backticks.
 *
 * ## What this reading cannot do
 *
 * - **A run broken by a line break is not a run.** Each line of a comment is read on its
 *   own, which is what the document reader does, so a comment wrapped mid-run in a
 *   narrow column evades both. That is one boundary shared by two readers rather than two
 *   boundaries, and it is stated here rather than discovered by the next person who tries
 *   to evade it.
 * - **The workflow files are not read.** A `#` in YAML is three grammars -- plain,
 *   single-quoted, double-quoted -- plus the block scalars that hold shell scripts, so
 *   reading one correctly needs the YAML scanner rather than this one. Five files hold
 *   1,172 `#` marks between them and this round measured them separately; the reader for
 *   them is the next instrument, not this one.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { HAN_RUN, withoutCodeSpans } from './docs-language.mjs';

export const ROOT = resolve(import.meta.dirname, '..');

/** Directories that hold a copy of this tree rather than this tree. */
const SKIP = new Set(['node_modules', 'out', '.git', 'coverage', 'dist']);

/**
 * Every extension this reader opens.
 *
 * Six rather than two, because a rule that read `.ts` and `.mjs` would leave `golden-master/anchors.mjs`'s
 * siblings and the site's own `app.js` unread, and "the comments are English" is a claim
 * about the tree rather than about the two directories someone remembered.
 */
export const SOURCE_EXTENSIONS = ['.ts', '.mts', '.cts', '.mjs', '.cjs', '.js'];

/**
 * Words after which a `/` opens a regular expression rather than dividing.
 *
 * The scanner's one heuristic, and it is a heuristic because JavaScript's grammar is: `/`
 * is a regex or a division depending on what the parser expects next, and a reader
 * without a parser has to approximate the expectation. The approximation is exact in the
 * direction that matters -- after an identifier, a number, a string, a template, a regex,
 * `)`, `]` or `}` a `/` divides -- because the other direction is the one that loses text:
 * a regex read as a division costs one character and the comment after it survives, while
 * a division read as a regex swallows everything to the next `/`.
 */
const EXPRESSION_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
  'default',
]);

const IDENTIFIER_START = /[A-Za-z_$\u0080-\uFFFF]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$\u0080-\uFFFF]/;
const DIGIT = /[0-9]/;
const REGEX_FLAG = /[a-z]/i;

/** The offset just past a quoted string, or `-1` when it does not close on its line. */
function endOfString(text, from) {
  const quote = text[from];
  let at = from + 1;
  while (at < text.length) {
    const ch = text[at];
    if (ch === '\\') {
      at += 2;
      continue;
    }
    if (ch === quote) return at + 1;
    if (ch === '\n') return -1;
    at += 1;
  }
  return -1;
}

/** The offset just past a regex literal and its flags, or `-1` when the line ends first. */
function endOfRegex(text, from) {
  let at = from + 1;
  let inClass = false;
  while (at < text.length) {
    const ch = text[at];
    if (ch === '\\') {
      at += 2;
      continue;
    }
    if (ch === '\n') return -1;
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) {
      at += 1;
      while (at < text.length && REGEX_FLAG.test(text[at])) at += 1;
      return at;
    }
    at += 1;
  }
  return -1;
}

/**
 * Every comment in one source file, as `{ kind, line, text }`, plus the first place the
 * scanner could not go on.
 *
 * `text` is the body without its delimiters, so a caller can judge the words rather than
 * the punctuation. `line` is one-based and names the line the comment *opens* on; the
 * block's own lines are recovered by counting newlines in `text`, which is how a run on
 * the fourth line of a doc block is reported at its own line rather than at the `/**`.
 *
 * `problem` is not a warning. A file whose block comment never closes, or whose string
 * does not close on its line, is a file this reader cannot walk, and a reader that
 * skipped it would print a census of the files that happened to parse -- the shape
 * finding 545 printed 246 times.
 */
export function scanComments(text) {
  const comments = [];
  const frames = [{ mode: 'code', braces: 0 }];
  let at = 0;
  let line = 1;
  let canStartRegex = true;
  let problem = null;
  let markers = 0;

  const top = () => frames[frames.length - 1];
  const advance = (count) => {
    for (let step = 0; step < count; step += 1) if (text[at + step] === '\n') line += 1;
    at += count;
  };

  /**
   * Count the comment openers inside a region that is not a comment.
   *
   * This is the reading's own witness: `//` and `/*` inside a string, a template or a
   * regex are text, and a reader without state would have read each one as the start of
   * prose. The count is reported so that "the scanner distinguished" is a number rather
   * than a claim about the scanner -- and so that a tree where it fell to zero would be
   * visible as a reader that stopped distinguishing rather than as a tree with no URLs.
   */
  const countMarkers = (from, to) => {
    for (let step = from; step < to - 1; step += 1) {
      if (text[step] === '/' && (text[step + 1] === '/' || text[step + 1] === '*')) markers += 1;
    }
  };

  // A shebang is the interpreter's line, not a comment and not a regex. It is consumed
  // before the loop so that the `/` at offset two is never offered to the regex branch.
  if (text.startsWith('#!')) {
    const end = text.indexOf('\n');
    if (end === -1) return { comments, problem };
    advance(end);
  }

  while (at < text.length) {
    const ch = text[at];

    if (top().mode === 'template') {
      if (ch === '\\') {
        advance(2);
        continue;
      }
      if (ch === '`') {
        const frame = frames.pop();
        countMarkers(frame.start ?? at, at);
        advance(1);
        canStartRegex = false;
        continue;
      }
      if (ch === '$' && text[at + 1] === '{') {
        frames.push({ mode: 'code', braces: 0, interpolation: true });
        advance(2);
        canStartRegex = true;
        continue;
      }
      advance(1);
      continue;
    }

    if (ch === '\n' || ch === ' ' || ch === '\t' || ch === '\r') {
      advance(1);
      continue;
    }

    if (ch === '/' && text[at + 1] === '/') {
      const end = text.indexOf('\n', at + 2);
      const stop = end === -1 ? text.length : end;
      comments.push({ kind: 'line', line, text: text.slice(at + 2, stop) });
      advance(stop - at);
      canStartRegex = true;
      continue;
    }

    if (ch === '/' && text[at + 1] === '*') {
      const opened = line;
      const close = text.indexOf('*/', at + 2);
      if (close === -1) {
        problem = {
          line: opened,
          message:
            'opens a block comment that never closes, so every comment after it cannot be told ' +
            'from text -- a file this reading cannot walk is refused rather than counted as a file ' +
            'with nothing to say',
        };
        break;
      }
      comments.push({ kind: 'block', line: opened, text: text.slice(at + 2, close) });
      advance(close + 2 - at);
      continue;
    }

    if (ch === '"' || ch === "'") {
      const end = endOfString(text, at);
      if (end === -1) {
        problem = {
          line,
          message:
            `opens a ${ch === '"' ? 'double' : 'single'}-quoted string that does not close on its ` +
            'line, so the text after it cannot be told from a comment',
        };
        break;
      }
      countMarkers(at, end);
      advance(end - at);
      canStartRegex = false;
      continue;
    }

    if (ch === '`') {
      frames.push({ mode: 'template', start: at });
      advance(1);
      continue;
    }

    if (ch === '/') {
      if (canStartRegex) {
        const end = endOfRegex(text, at);
        if (end !== -1) {
          countMarkers(at, end);
          advance(end - at);
          canStartRegex = false;
          continue;
        }
      }
      advance(1);
      canStartRegex = true;
      continue;
    }

    if (IDENTIFIER_START.test(ch)) {
      let end = at;
      while (end < text.length && IDENTIFIER_PART.test(text[end])) end += 1;
      canStartRegex = EXPRESSION_KEYWORDS.has(text.slice(at, end));
      advance(end - at);
      continue;
    }

    if (DIGIT.test(ch)) {
      let end = at;
      while (end < text.length && /[0-9A-Za-z_.]/.test(text[end])) end += 1;
      advance(end - at);
      canStartRegex = false;
      continue;
    }

    if (ch === '}') {
      const frame = top();
      if (frame.interpolation === true && frame.braces === 0) {
        frames.pop();
        advance(1);
        continue;
      }
      if (frame.braces > 0) frame.braces -= 1;
      advance(1);
      canStartRegex = false;
      continue;
    }

    if (ch === '{') {
      top().braces += 1;
      advance(1);
      canStartRegex = true;
      continue;
    }

    if (ch === ')' || ch === ']') {
      advance(1);
      canStartRegex = false;
      continue;
    }

    if ((ch === '+' || ch === '-') && text[at + 1] === ch) {
      advance(2);
      canStartRegex = false;
      continue;
    }

    advance(1);
    canStartRegex = true;
  }

  return { comments, problem, markers };
}

/** Every source file under `root`, as paths relative to it, in sort order. */
export function sourcesIn(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const at = join(dir, entry.name);
      if (entry.isDirectory()) walk(at);
      else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        out.push(relative(root, at));
      }
    }
  };
  walk(root);
  return out.sort();
}

/**
 * Every prose run of Han characters in one comment, as `{ line, text, length }`.
 *
 * The decoration a doc block puts on each line (` * `) is stripped before the line is
 * judged, because it is punctuation rather than words, and the span rule is the document
 * reader's own: a run inside backticks is a citation. The line number is absolute, so a
 * reader can open the file at it.
 */
export function hanInComment(comment) {
  const found = [];
  comment.text.split('\n').forEach((raw, index) => {
    const body = withoutCodeSpans(raw.replace(/^\s*\*+ ?/, ''));
    const match = HAN_RUN.exec(body);
    if (match !== null) {
      found.push({ line: comment.line + index, text: match[0], length: match[0].length });
    }
  });
  return found;
}

/**
 * The verdict: no source file in the tree carries Han prose in a comment.
 *
 * `root` is a parameter so a fixture can be a tree -- the failure modes of this rule are
 * a string read as a comment, a regex that opens a block, a template read as a quote, a
 * comment the reader could not reach -- and a rule nobody has seen fail is a rule nobody
 * has seen.
 */
export function check(root = ROOT) {
  const sources = sourcesIn(root);
  const errors = [];
  let comments = 0;
  let lineComments = 0;
  let blockComments = 0;
  let lines = 0;
  let runs = 0;
  let markers = 0;

  if (sources.length === 0) {
    errors.push(
      `no TypeScript or JavaScript file under ${root}: a rule over the comments that finds no ` +
        'file is a rule that has not run, and it reads exactly like one that passed',
    );
  }

  for (const name of sources) {
    const { comments: found, problem, markers: skipped } = scanComments(
      readFileSync(join(root, name), 'utf8'),
    );
    markers += skipped;
    if (problem !== null) errors.push(`${name}:${String(problem.line)}: ${problem.message}`);
    for (const comment of found) {
      comments += 1;
      lines += comment.text.split('\n').length;
      if (comment.kind === 'line') lineComments += 1;
      else blockComments += 1;
      for (const hit of hanInComment(comment)) {
        runs += 1;
        errors.push(
          `${name}:${String(hit.line)}: \`${hit.text}\` -- ${String(hit.length)} Han character(s) ` +
            "of prose: this repository's comments are written in English, and the comments that " +
            'are not are quotations, which a code span carries verbatim',
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    files: sources.length,
    comments,
    lineComments,
    blockComments,
    lines,
    runs,
    markers,
    summary:
      `check-comments-language: ${errors.length === 0 ? 'OK' : 'FAILED'} — ${String(sources.length)} ` +
      `file(s), ${String(comments)} comment(s) (${String(lineComments)} line, ` +
      `${String(blockComments)} block), ${String(runs)} run(s) of Han prose outside a code span; ` +
      `${String(markers)} comment opener(s) skipped inside a string, a template or a regex` +
      (errors.length === 0 ? '' : `; first: ${errors[0] ?? ''}`),
  };
}
