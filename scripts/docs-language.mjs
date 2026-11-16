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
 * One line with every code span removed.
 *
 * Any run of backticks opens a span and the same-length run closes it, which is the rule
 * CommonMark states and the reason ``…`…`` exists: a span whose content contains a
 * backtick needs a longer delimiter, and a reader that only knew single backticks would
 * have left the inner text in "prose" and reported a quotation as a violation. The
 * length-matching is done by hand rather than with a regex for the reason every
 * hand-written lexer in this tree exists: `(`+)(.*?)\1` matches the *first* run of the
 * same length, which is right, but it also matches across an unterminated span to the
 * end of the line, which turns a stray backtick into a silenced line.
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
    at = close + run;
  }
  return out;
}

/**
 * Every prose run of Han characters in one document, as `{ line, text }`.
 *
 * `line` is one-based, because that is what an editor and a reviewer use. Fences are
 * tracked because a captured output can hold anything, and block quotes are skipped
 * because they are quotations -- see the header for why that is a decision with a cost
 * rather than a completeness claim.
 */
export function hanProseIn(text) {
  const found = [];
  let fenced = false;
  text.split('\n').forEach((raw, index) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    if (/^\s*>/.test(raw)) return;
    const prose = withoutCodeSpans(raw);
    const match = HAN_RUN.exec(prose);
    if (match !== null) found.push({ line: index + 1, text: match[0], length: match[0].length });
  });
  return found;
}

/**
 * Every prose run of Han characters in one comment, as `{ line, text, length }`.
 *
 * This lives here, beside the threshold it reads, because three readers need it: the
 * document reader above, the source reader in `comment-language.mjs` and the workflow
 * reader in `yaml-language.mjs`. A second copy of "strip the decoration, strip the code
 * spans, look for eight Han characters" would be the third-source-of-truth defect
 * `validity.test.ts` names, and the three readers have to agree about what a quotation
 * is or the tree has three answers to one question.
 *
 * The decoration a doc block puts on each row (` * `) is stripped before the row is
 * judged, because it is punctuation rather than words. A YAML comment has no such
 * decoration; the pattern is harmless there, since it removes `*` and spaces rather than
 * characters the rule looks for. `line` is absolute, so a reader can open the file at it.
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

  if (documents.length === 0) {
    errors.push(
      `no markdown document under ${root}: a rule over the documents that finds none is a rule ` +
        'that has not run, and it reads exactly like one that passed',
    );
  }

  for (const name of documents) {
    for (const hit of hanProseIn(readFileSync(join(root, name), 'utf8'))) {
      runs += 1;
      errors.push(
        `${name}:${String(hit.line)}: \`${hit.text}\` -- ${String(hit.length)} Han character(s) of prose: ` +
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
    summary:
      `check-docs-language: ${errors.length === 0 ? 'OK' : 'FAILED'} — ${String(documents.length)} ` +
      `document(s), ${String(runs)} run(s) of Han prose outside a quotation` +
      (errors.length === 0 ? '' : `; first: ${errors[0] ?? ''}`),
  };
}
