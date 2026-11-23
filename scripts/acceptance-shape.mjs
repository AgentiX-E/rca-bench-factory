/**
 * What every clause of `docs/acceptance.md` owes a reader, and the index that lets one be found.
 *
 * ## The defect this gate is the reader for
 *
 * `O-019` has said since v3.62 that the acceptance file grows by a clause per round and that
 * the clauses are nearly half of it. v3.133 measured the file and found the entry's own axis
 * wrong: of the **37** per-round clauses, **35** hold both a current rule and the way it was
 * reached, and a split on that axis would carry 431 lines of rule into the history with 414 of
 * provenance. The measurement that decides it is one level down and it is not a regular
 * expression's opinion:
 *
 *   `The two sentences in one entry (v3.63)` is three bullets, **every one of them a rule**,
 *   and every one of them cites a finding. A heuristic that calls a bullet with a finding
 *   number "provenance" files this whole section under history and leaves nothing behind --
 *   which is why the first version of this census read 125 rules against 92 recollections and
 *   was describing its own regex rather than the file.
 *
 * So the file is not "rules plus a chronicle". It is **case law**: every clause is a judgement
 * and the case it was decided on, and the case is the half that makes the judgement checkable.
 * What that shape owes is not a shorter file. It owes two things a reader can use:
 *
 *   1. **an address** -- every clause names something a reader can open and read for himself:
 *      a finding in the audit volumes, a table of falsifications, a workflow run, or a test
 *      file. A clause with an argument and no case is a preference, and this campaign has
 *      refused preferences in prose since finding 121.
 *   2. **a round** -- the version the clause was decided at, in its own heading. `v3.63` in a
 *      heading is what makes a reader able to ask "what changed here" and get an answer.
 *
 * ## Why an index and not a shorter file
 *
 * The complaint behind `O-019` is real and it is about **navigation**, not length: 2,100 lines
 * is a legitimate size for 37 decisions, and a reader who wants to know what this file requires
 * currently has to read it. The index is a projection of the headings -- one row per clause,
 * the heading and its round -- so that the whole file can be seen in one screen and read where
 * it matters.
 *
 * It carries **no links**, and that is the one decision here worth arguing. A GitHub anchor is
 * a slug this script would compute by guessing: the rules delete punctuation, keep Chinese,
 * and turn a space into a hyphen, and a slug that is off by one character is a link that fails
 * **silently** -- the reader lands nowhere and concludes the file has no such section. That is
 * the shape finding 621 refused when it refused to print a ratio nothing compared. A heading's
 * own text cannot be wrong: it is a copy, and a copy is checked by the same gate that copies it.
 *
 * ## What is refused
 *
 *   1. a clause that names no address (finding, falsification table, run, or test file);
 *   2. a clause whose heading names no round;
 *   3. an index that is absent, out of order, short, long, or says a heading or a round the
 *      file no longer says -- the diff is printed line by line, because "the index is stale"
 *      sends an author to regenerate 37 rows without knowing which one moved.
 *
 * The two `2.39`/`2.40` audit-pass checklists are exempt: they are a list of checks this file
 * asks of an audit, not clauses of the log, and they carry a pass number where the log carries
 * a round.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');
export const ACCEPTANCE = resolve(ROOT, 'docs', 'acceptance.md');

/**
 * Where to read and write the acceptance file.
 *
 * `RCA_ACCEPTANCE` exists for the same two reasons `RCA_CI_WORKFLOW` does: a person can check a
 * draft before committing it, and the two writing branches of this script can be reached by a
 * test at all. A test that had to write `docs/acceptance.md` to observe `--write` would be a
 * test that edits the tree it is measuring.
 */
export function acceptancePath() {
  const override = process.env['RCA_ACCEPTANCE'];
  return override === undefined || override === '' ? ACCEPTANCE : resolve(ROOT, override);
}

/** The markers `--write` replaces between, so that a hand-edited row is overwritten and named. */
export const BEGIN = '<!-- acceptance-index: begin -->';
export const END = '<!-- acceptance-index: end -->';

/** A heading that opens with a number is an audit checklist, not a clause of the log. */
const ORDINAL = /^\d+\.\d+ /;

/** The round a heading names. The `v` is part of what is matched because `(20 things)` is not one. */
const ROUND = /\((v\d+\.\d+)/;

/**
 * The four addresses a clause may name. A test file counts because it is the case itself: a
 * reader who opens `check-open-list.test.ts` sees the two directions the clause describes.
 */
const ADDRESS = [
  /\bfinding \d+/,
  /\b\d+ (?:mutations?|edits?)\b/,
  /\brun `\d{6,}`/,
  /`[A-Za-z0-9_./-]+\.test\.ts`/,
];

/**
 * The `###` sections of a document, with the lines under each.
 *
 * A `##` heading closes the section it follows, because the file's layers (`## L0` … `## L5`)
 * sit between the clause blocks and a section that ran through them would own the next layer's
 * prose. The distinction matters to rule 3: an index row per clause is only a projection if the
 * clause has an end.
 */
export function readSections(text) {
  const sections = [];
  let current = null;
  for (const line of text.split('\n')) {
    const heading = /^(##|###) (.*)$/.exec(line);
    if (heading !== null) {
      current = heading[1] === '###' ? { title: heading[2].trim(), body: [] } : null;
      if (current !== null) sections.push(current);
      continue;
    }
    if (current !== null) current.body.push(line);
  }
  return sections;
}

/** The clauses the index covers, in the order the file states them. */
export function clausesOf(text) {
  return readSections(text)
    .filter((section) => !ORDINAL.test(section.title))
    .map((section) => {
      const round = ROUND.exec(section.title);
      return {
        title: section.title.replace(/\s*\(v\d+\..*$/, '').trim(),
        round: round === null ? null : round[1],
        body: section.body.join('\n'),
        heading: section.title,
      };
    });
}

/** The table `--write` writes, with its markers. */
export function indexTable(text) {
  const rows = clausesOf(text).map((one) => `| ${one.title} | ${String(one.round ?? 'none')} |`);
  return [BEGIN, '| Section | Round |', '| --- | --- |', ...rows, END].join('\n');
}

/**
 * The document with its index replaced.
 *
 * A document with no markers gets one appended to its lead section rather than being refused:
 * `--write` is the command a person runs on a file that has never had an index, and a writer
 * that refused the state it exists to repair would be a writer nobody could start with.
 */
export function withIndex(text, table = indexTable(text)) {
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (begin !== -1 && end > begin) {
    return text.slice(0, begin) + table + text.slice(end + END.length);
  }
  const lead = '\n## What this file requires, and the round that asked for it\n\n';
  const anchor = text.search(/^## L0 /m);
  if (anchor === -1) return text.trimEnd() + '\n' + lead + table + '\n';
  return text.slice(0, anchor) + lead.slice(1) + table + '\n\n' + text.slice(anchor);
}

/**
 * What is wrong with the clauses themselves, before the index is compared.
 *
 * Two rules, and both are about a reader rather than about style: an address is what makes a
 * judgement checkable, and a round is what makes it datable. The message names the heading as
 * the file spells it, because the repair is an edit to that heading and a paraphrase would send
 * the author to a section that is not there.
 */
export function clauseErrors(text) {
  const errors = [];
  for (const one of clausesOf(text)) {
    if (one.round === null) {
      errors.push(
        `\`${one.heading}\` names no round: the heading is where a reader asks what changed here, ` +
          'and a clause with no round is a clause with no date -- add `(vX.YY)`',
      );
    }
    if (!ADDRESS.some((pattern) => pattern.test(one.body))) {
      errors.push(
        `\`${one.heading}\` names no address a reader can open -- no finding, no table of ` +
          'falsifications, no run, no test file: a judgement with no case is a preference, and ' +
          'the case is the half that can be checked',
      );
    }
  }
  return errors;
}

/**
 * What is wrong with the index, compared line by line against the headings.
 *
 * Line by line rather than by set: an index that holds every row in the wrong order is a
 * different defect from one that holds a row the file dropped, and a set comparison reports
 * both as "the index is stale".
 */
export function indexErrors(text) {
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (begin === -1 || end === -1 || end < begin) {
    return [
      `\`docs/acceptance.md\` has no index between \`${BEGIN}\` and \`${END}\`: the file is read ` +
        'by people, and a reader who cannot see the clauses cannot choose one -- run ' +
        '`node scripts/check-acceptance-shape.mjs --write`',
    ];
  }
  const actual = text.slice(begin + BEGIN.length, end).trim().split('\n');
  const expected = indexTable(text).split('\n').slice(1, -1);
  const errors = [];
  const longest = Math.max(actual.length, expected.length);
  for (let index = 0; index < longest; index += 1) {
    const want = expected[index];
    const have = actual[index];
    if (want === have) continue;
    errors.push(
      want === undefined
        ? `the index has a row the file does not have: \`${String(have).trim()}\``
        : have === undefined
          ? `the index is missing the row \`${want}\``
          : `the index says \`${have.trim()}\` where the file says \`${want}\``,
    );
    if (errors.length === 3) {
      errors.push('(further differences are not printed: regenerate and read the diff)');
      break;
    }
  }
  return errors;
}

/** Everything this gate refuses, in the order a reader would repair it. */
export function acceptanceErrors(text) {
  return [...clauseErrors(text), ...indexErrors(text)];
}
